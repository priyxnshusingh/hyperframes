import type { Core } from "cytoscape";
import type { CanvasTheme } from "../components/graphStyle";
import { initials } from "../model/format";
import { ME_COLOR } from "../model/types";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Vector snapshot of the currently visible graph (nodes, labels, connections). */
export function buildSvg(cy: Core, t: CanvasTheme): string {
  const nodes = cy.nodes().filter((n) => !n.hasClass("hidden") && !n.hasClass("ghost"));
  const edges = cy.edges().filter((e) => !e.hasClass("hidden") && !e.hasClass("ghost"));
  const bb = nodes.union(edges).boundingBox({ includeLabels: true });
  const pad = 40;
  const x0 = (Number.isFinite(bb.x1) ? bb.x1 : 0) - pad;
  const y0 = (Number.isFinite(bb.y1) ? bb.y1 : 0) - pad;
  const w = (Number.isFinite(bb.w) ? bb.w : 0) + pad * 2;
  const h = (Number.isFinite(bb.h) ? bb.h : 0) + pad * 2;
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${w} ${h}" width="${Math.round(w)}" height="${Math.round(h)}" font-family="Inter, system-ui, sans-serif">`,
    `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="${t.canvasBg}"/>`,
    `<g stroke-linecap="round">`,
  );
  edges.forEach((e) => {
    const s = e.source().position();
    const d = e.target().position();
    const kind = e.data("kind");
    const isPath = e.hasClass("path");
    const color = isPath ? t.path : e.hasClass("hl") ? t.accent : kind === "me" ? t.edgeMe : t.edge;
    const width = isPath ? 5 : kind === "me" ? 2.4 : 1.6;
    const dash = kind === "island" ? ` stroke-dasharray="6 5"` : "";
    const opacity = e.hasClass("dimmed") ? ` stroke-opacity="0.1"` : "";
    out.push(
      `<line x1="${s.x}" y1="${s.y}" x2="${d.x}" y2="${d.y}" stroke="${color}" stroke-width="${width}"${dash}${opacity}/>`,
    );
  });
  out.push(`</g><g>`);
  nodes.forEach((n) => {
    const p = n.position();
    const r = Number(n.data("size")) / 2;
    const isMe = n.data("kind") === "me";
    const color = String(n.data("color"));
    const opacity = n.hasClass("dimmed") ? ` opacity="0.2"` : "";
    const stroke = n.hasClass("path") ? t.path : isMe ? ME_COLOR : t.surface;
    const strokeWidth = isMe || n.hasClass("path") ? 4 : 2;
    const dash = n.data("unreachable") ? ` stroke-dasharray="4 3"` : "";
    const [name = "", ...rest] = String(n.data("label")).split("\n");
    out.push(`<g${opacity}>`);
    if (isMe)
      out.push(
        `<circle cx="${p.x}" cy="${p.y}" r="${r + 12}" fill="${ME_COLOR}" fill-opacity="0.22"/>`,
      );
    out.push(
      `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash}/>`,
      `<text x="${p.x}" y="${p.y}" dy="0.35em" text-anchor="middle" fill="#fff" font-weight="700" font-size="${Math.round(r * 0.6)}">${esc(isMe ? "YOU" : initials(name))}</text>`,
    );
    const fontSize = isMe ? 13 : 11;
    const lines = [name, ...rest];
    lines.forEach((line, i) => {
      out.push(
        `<text x="${p.x}" y="${p.y + r + 6 + fontSize * (i + 1) * 1.2}" text-anchor="middle" fill="${t.label}" font-size="${fontSize}" font-weight="${i === 0 ? 700 : 500}" paint-order="stroke" stroke="${t.labelBg}" stroke-width="3">${esc(line)}</text>`,
      );
    });
    out.push(`</g>`);
  });
  out.push(`</g></svg>`);
  return out.join("\n");
}
