import { formatCtc } from "./format";
import { deriveGraph } from "./analytics";
import { pairKey, sortedPair } from "./ids";
import { createPerson } from "./network";
import {
  BUILT_IN_CATEGORIES,
  DEFAULT_SETTINGS,
  ME_CATEGORY,
  type Category,
  type Connection,
  type CurrencyCode,
  type NetworkData,
  type Person,
  type Positions,
  type Settings,
} from "./types";

export const EXPORT_FORMAT = "personal-network-map";
export const EXPORT_VERSION = 1;

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  meId: string;
  categories: Category[];
  people: Person[];
  connections: Connection[];
  positions: Positions;
  settings: Settings;
}

export function toExportFile(
  data: NetworkData,
  positions: Positions,
  settings: Settings,
): ExportFile {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    meId: data.meId,
    categories: data.categories,
    people: Object.values(data.people),
    connections: Object.values(data.connections),
    positions,
    settings,
  };
}

export interface ImportResult {
  data: NetworkData;
  positions: Positions;
  settings: Settings | null;
  warnings: string[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function ctcValue(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.round(v);
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) >= 0) {
    return Math.round(Number(v));
  }
  return null;
}

const CURRENCY_CODES: CurrencyCode[] = ["INR", "USD", "EUR", "GBP"];

function parseSettings(v: unknown): Settings | null {
  if (!isRecord(v)) return null;
  const s: Settings = { ...DEFAULT_SETTINGS };
  if (typeof v.showCtc === "boolean") s.showCtc = v.showCtc;
  if (
    v.layout === "force" ||
    v.layout === "radial" ||
    v.layout === "hierarchical" ||
    v.layout === "circle"
  ) {
    s.layout = v.layout;
  }
  if (v.colorBy === "category" || v.colorBy === "level") s.colorBy = v.colorBy;
  const cur = CURRENCY_CODES.find((c) => c === v.currency);
  if (cur) s.currency = cur;
  if (typeof v.keepMeCentered === "boolean") s.keepMeCentered = v.keepMeCentered;
  s.sampleBannerDismissed = true;
  return s;
}

/**
 * Validates and normalises an exported network. Unknown fields are ignored;
 * dangling/duplicate/self connections are dropped with a warning.
 */
export function parseImport(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  if (!isRecord(raw) || !Array.isArray(raw.people)) {
    throw new Error("This file doesn't look like a network export (missing a people list).");
  }
  const warnings: string[] = [];
  const now = Date.now();

  const categories: Category[] = BUILT_IN_CATEGORIES.map((c) => ({ ...c }));
  if (Array.isArray(raw.categories)) {
    for (const c of raw.categories) {
      if (!isRecord(c) || typeof c.id !== "string" || c.id === ME_CATEGORY) continue;
      const existing = categories.find((x) => x.id === c.id);
      const label = str(c.label).trim() || c.id;
      const color = /^#[0-9a-f]{3,8}$/i.test(str(c.color)) ? str(c.color) : "#64748b";
      if (existing) {
        existing.label = label;
        existing.color = color;
      } else {
        categories.push({ id: c.id, label, color, builtIn: false });
      }
    }
  }
  const categoryIds = new Set(categories.map((c) => c.id));

  const people: Record<string, Person> = {};
  let skipped = 0;
  for (const p of raw.people) {
    if (!isRecord(p) || typeof p.id !== "string" || !p.id || !str(p.name).trim()) {
      skipped++;
      continue;
    }
    if (people[p.id]) {
      skipped++;
      continue;
    }
    const category = str(p.category, "other");
    if (category !== ME_CATEGORY && !categoryIds.has(category)) {
      categories.push({ id: category, label: category, color: "#64748b", builtIn: false });
      categoryIds.add(category);
    }
    people[p.id] = {
      id: p.id,
      name: str(p.name).trim(),
      ctc: ctcValue(p.ctc),
      category,
      notes: str(p.notes),
      createdAt: num(p.createdAt, now),
      updatedAt: num(p.updatedAt, now),
    };
  }
  if (skipped) warnings.push(`Skipped ${skipped} invalid or duplicate profile(s).`);

  let meId = typeof raw.meId === "string" && people[raw.meId] ? raw.meId : null;
  if (!meId) {
    const byCategory = Object.values(people).find((p) => p.category === ME_CATEGORY);
    if (byCategory) meId = byCategory.id;
    else {
      const me = createPerson({ name: "Me", ctc: null, category: ME_CATEGORY, notes: "" }, now);
      people[me.id] = me;
      meId = me.id;
      warnings.push("No 'me' profile found — added one.");
    }
  }
  for (const p of Object.values(people)) {
    if (p.id === meId) p.category = ME_CATEGORY;
    else if (p.category === ME_CATEGORY) p.category = "other";
  }

  const connections: Record<string, Connection> = {};
  let dropped = 0;
  if (Array.isArray(raw.connections)) {
    for (const c of raw.connections) {
      // Accept {a,b} (our format) and {source,target} (common graph formats).
      const a = isRecord(c) ? str(c.a) || str(c.source) : "";
      const b = isRecord(c) ? str(c.b) || str(c.target) : "";
      if (!a || !b || a === b || !people[a] || !people[b]) {
        dropped++;
        continue;
      }
      const id = pairKey(a, b);
      if (connections[id]) {
        dropped++;
        continue;
      }
      const [lo, hi] = sortedPair(a, b);
      connections[id] = { id, a: lo, b: hi, createdAt: isRecord(c) ? num(c.createdAt, now) : now };
    }
  }
  if (dropped) warnings.push(`Dropped ${dropped} invalid or duplicate connection(s).`);

  const positions: Positions = {};
  if (isRecord(raw.positions)) {
    for (const [id, pos] of Object.entries(raw.positions)) {
      if (people[id] && isRecord(pos) && typeof pos.x === "number" && typeof pos.y === "number") {
        if (Number.isFinite(pos.x) && Number.isFinite(pos.y))
          positions[id] = { x: pos.x, y: pos.y };
      }
    }
  }

  return {
    data: { meId, people, connections, categories },
    positions,
    settings: parseSettings(raw.settings),
    warnings,
  };
}

function csvCell(v: string | number): string {
  const s = String(v);
  // Neutralise spreadsheet formula injection and quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) && typeof v === "string" ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(data: NetworkData, currency: CurrencyCode): string {
  const { adj, levels } = deriveGraph(data);
  const catLabel = (id: string) =>
    id === ME_CATEGORY ? "Me" : (data.categories.find((c) => c.id === id)?.label ?? id);
  const header = [
    "Name",
    `Annual CTC (${currency})`,
    "CTC (formatted)",
    "Category",
    "Connection level",
    "Direct connections",
    "Connected to",
    "Notes",
    "ID",
  ];
  const rows = Object.values(data.people)
    .sort((x, y) => {
      const lx = levels.get(x.id) ?? Infinity;
      const ly = levels.get(y.id) ?? Infinity;
      return lx - ly || x.name.localeCompare(y.name);
    })
    .map((p) => {
      const neighbours = [...(adj.get(p.id) ?? [])]
        .map((id) => data.people[id]?.name ?? "")
        .sort((x, y) => x.localeCompare(y));
      const level = levels.get(p.id);
      return [
        p.name,
        p.ctc ?? "",
        p.ctc === null ? "CTC not added" : formatCtc(p.ctc, currency),
        catLabel(p.category),
        level === undefined ? "Not connected" : level,
        neighbours.length,
        neighbours.join("; "),
        p.notes,
        p.id,
      ]
        .map(csvCell)
        .join(",");
    });
  return [header.map(csvCell).join(","), ...rows].join("\r\n");
}
