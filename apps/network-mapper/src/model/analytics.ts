import { buildAdjacency, bfsLevels, type Adjacency } from "./graph";
import type { NetworkData, Person, PersonId } from "./types";

export interface CtcStat {
  /** null when no profile in the group has a recorded CTC. */
  value: number | null;
  /** Number of profiles that contributed to the value. */
  n: number;
  /** Size of the group the stat was computed over (with or without CTC). */
  of: number;
}

export interface NetworkAnalytics {
  /** Everyone except ME. */
  totalPeople: number;
  directCount: number;
  totalConnections: number;
  avgCtc: CtcStat;
  medianCtc: CtcStat;
  highestCtc: { person: Person; value: number; n: number } | null;
  avgDirectCtc: CtcStat;
  /** Index = level (1-based levels; index 0 unused). */
  levelCounts: { level: number; count: number }[];
  maxLevel: number;
  topConnectors: { person: Person; degree: number }[];
  unreachable: Person[];
  isolated: Person[];
}

export interface DerivedGraph {
  adj: Adjacency;
  levels: Map<PersonId, number>;
}

export function deriveGraph(data: NetworkData): DerivedGraph {
  const adj = buildAdjacency(data);
  return { adj, levels: bfsLevels(adj, data.meId) };
}

function hasCtc(p: Person): p is Person & { ctc: number } {
  return typeof p.ctc === "number" && Number.isFinite(p.ctc) && p.ctc >= 0;
}

function average(group: Person[]): CtcStat {
  const vals = group.filter(hasCtc).map((p) => p.ctc);
  if (vals.length === 0) return { value: null, n: 0, of: group.length };
  return { value: vals.reduce((s, v) => s + v, 0) / vals.length, n: vals.length, of: group.length };
}

function median(group: Person[]): CtcStat {
  const vals = group
    .filter(hasCtc)
    .map((p) => p.ctc)
    .sort((a, b) => a - b);
  if (vals.length === 0) return { value: null, n: 0, of: group.length };
  const mid = Math.floor(vals.length / 2);
  const value = vals.length % 2 ? vals[mid]! : (vals[mid - 1]! + vals[mid]!) / 2;
  return { value, n: vals.length, of: group.length };
}

export function computeAnalytics(
  data: NetworkData,
  graph: DerivedGraph = deriveGraph(data),
  topN = 5,
): NetworkAnalytics {
  const { adj, levels } = graph;
  const others = Object.values(data.people).filter((p) => p.id !== data.meId);
  const direct = others.filter((p) => levels.get(p.id) === 1);

  let highest: NetworkAnalytics["highestCtc"] = null;
  let ctcCount = 0;
  for (const p of others) {
    if (!hasCtc(p)) continue;
    ctcCount++;
    if (!highest || p.ctc > highest.value) highest = { person: p, value: p.ctc, n: 0 };
  }
  if (highest) highest.n = ctcCount;

  let maxLevel = 0;
  const counts = new Map<number, number>();
  for (const p of others) {
    const l = levels.get(p.id);
    if (l === undefined) continue;
    counts.set(l, (counts.get(l) ?? 0) + 1);
    if (l > maxLevel) maxLevel = l;
  }
  const levelCounts: { level: number; count: number }[] = [];
  for (let l = 1; l <= maxLevel; l++) levelCounts.push({ level: l, count: counts.get(l) ?? 0 });

  const topConnectors = others
    .map((person) => ({ person, degree: adj.get(person.id)?.size ?? 0 }))
    .filter((x) => x.degree > 0)
    .sort((x, y) => y.degree - x.degree || x.person.name.localeCompare(y.person.name))
    .slice(0, topN);

  const unreachable = others
    .filter((p) => !levels.has(p.id))
    .sort((x, y) => x.name.localeCompare(y.name));

  return {
    totalPeople: others.length,
    directCount: direct.length,
    totalConnections: Object.keys(data.connections).length,
    avgCtc: average(others),
    medianCtc: median(others),
    highestCtc: highest,
    avgDirectCtc: average(direct),
    levelCounts,
    maxLevel,
    topConnectors,
    unreachable,
    isolated: unreachable.filter((p) => (adj.get(p.id)?.size ?? 0) === 0),
  };
}
