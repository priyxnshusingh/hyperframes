import type { StylesheetJson } from "cytoscape";
import { ME_COLOR } from "../model/types";

export interface CanvasTheme {
  label: string;
  labelBg: string;
  surface: string;
  edge: string;
  edgeMe: string;
  accent: string;
  path: string;
  danger: string;
  muted: string;
  canvasBg: string;
}

export function readTheme(): CanvasTheme {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    label: v("--text", "#0f172a"),
    labelBg: v("--surface", "#ffffff"),
    surface: v("--surface", "#ffffff"),
    edge: v("--edge", "#cbd5e1"),
    edgeMe: v("--edge-me", "#fbbf24"),
    accent: v("--accent", "#2563eb"),
    path: v("--path", "#ef4444"),
    danger: v("--danger", "#dc2626"),
    muted: v("--muted", "#64748b"),
    canvasBg: v("--canvas", "#f8fafc"),
  };
}

/** Level palette used when "colour by level" is on. Index = level, last entry = 4+. */
export const LEVEL_COLORS = [ME_COLOR, "#2563eb", "#0d9488", "#7c3aed", "#db2777", "#64748b"];
export const UNREACHABLE_COLOR = "#94a3b8";

export function levelColor(level: number | undefined): string {
  if (level === undefined) return UNREACHABLE_COLOR;
  return LEVEL_COLORS[Math.min(level, LEVEL_COLORS.length - 1)]!;
}

export function buildStylesheet(t: CanvasTheme): StylesheetJson {
  return [
    {
      selector: "node",
      style: {
        width: "data(size)",
        height: "data(size)",
        "background-color": "data(color)",
        "background-image": "data(avatar)",
        "background-fit": "cover",
        "background-clip": "node",
        "border-width": 2,
        "border-color": t.surface,
        label: "data(label)",
        "text-valign": "bottom",
        "text-halign": "center",
        "text-margin-y": 5,
        "text-wrap": "wrap",
        "text-max-width": "140px",
        "font-family":
          "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        "font-size": 11,
        "font-weight": 600,
        "line-height": 1.25,
        color: t.label,
        "text-background-color": t.labelBg,
        "text-background-opacity": 0.88,
        "text-background-padding": "3px",
        "text-background-shape": "roundrectangle",
        "min-zoomed-font-size": 7,
        "overlay-opacity": 0,
      },
    },
    {
      selector: 'node[kind = "me"]',
      style: {
        "border-width": 4,
        "border-color": ME_COLOR,
        "underlay-color": ME_COLOR,
        "underlay-opacity": 0.22,
        "underlay-padding": 12,
        "underlay-shape": "ellipse",
        "font-size": 13,
        "font-weight": 800,
        "z-index": 20,
      },
    },
    {
      selector: "node[?unreachable]",
      style: { "border-style": "dashed", "border-color": t.muted, "border-width": 2 },
    },
    {
      selector: "edge",
      style: {
        width: 1.6,
        "line-color": t.edge,
        "curve-style": "straight",
        "overlay-padding": 5,
        "overlay-opacity": 0,
      },
    },
    { selector: 'edge[kind = "me"]', style: { "line-color": t.edgeMe, width: 2.4 } },
    { selector: 'edge[kind = "island"]', style: { "line-style": "dashed" } },
    { selector: ".hidden", style: { display: "none" } },
    { selector: "node.dimmed", style: { opacity: 0.16, "text-opacity": 0.45 } },
    { selector: "edge.dimmed", style: { opacity: 0.07 } },
    { selector: "node.search-hit", style: { "border-color": t.accent, "border-width": 4 } },
    { selector: "node.hl", style: { "border-color": t.accent, "border-width": 3 } },
    { selector: "edge.hl", style: { "line-color": t.accent, width: 3, "z-index": 5 } },
    {
      selector: "node.focus",
      style: {
        "border-color": t.accent,
        "border-width": 5,
        "underlay-color": t.accent,
        "underlay-opacity": 0.2,
        "underlay-padding": 10,
        "underlay-shape": "ellipse",
        "z-index": 30,
      },
    },
    { selector: "node.path", style: { "border-color": t.path, "border-width": 5, "z-index": 25 } },
    { selector: "edge.path", style: { "line-color": t.path, width: 5, "z-index": 9 } },
    { selector: "edge.focus", style: { "line-color": t.danger, width: 5, "z-index": 10 } },
    {
      selector: "node.connect-source",
      style: { "border-color": t.accent, "border-width": 5, "border-style": "dashed" },
    },
    {
      selector: "node.connect-target",
      style: {
        "underlay-color": t.accent,
        "underlay-opacity": 0.3,
        "underlay-padding": 12,
        "underlay-shape": "ellipse",
      },
    },
    {
      selector: "node.ghost",
      style: { width: 1, height: 1, opacity: 0, label: "", events: "no" },
    },
    {
      selector: "edge.ghost",
      style: { "line-color": t.accent, "line-style": "dashed", width: 2.5, events: "no" },
    },
  ];
}

const avatarCache = new Map<string, string>();

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Round avatar with initials, rendered as an SVG data URI (cached). */
export function avatarUri(text: string, color: string): string {
  const key = `${text}|${color}`;
  const hit = avatarCache.get(key);
  if (hit) return hit;
  const size = text.length > 2 ? 30 : 38;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">` +
    `<circle cx="50" cy="50" r="50" fill="${color}"/>` +
    `<text x="50" y="50" dy="0.35em" text-anchor="middle" font-family="Inter, system-ui, sans-serif" ` +
    `font-size="${size}" font-weight="700" fill="#ffffff">${escapeXml(text)}</text></svg>`;
  const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  avatarCache.set(key, uri);
  return uri;
}
