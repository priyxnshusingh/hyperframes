import cytoscape, {
  type Core,
  type EventObject,
  type LayoutOptions,
  type NodeSingular,
  type BaseLayoutOptions,
} from "cytoscape";
import fcose from "cytoscape-fcose";
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { formatCtc, initials } from "../model/format";
import { placeNear, type Adjacency } from "../model/graph";
import {
  ME_COLOR,
  type NetworkData,
  type Person,
  type PersonId,
  type Position,
  type Positions,
  type Settings,
} from "../model/types";
import { buildSvg } from "../export/svg";
import { avatarUri, buildStylesheet, levelColor, readTheme, type CanvasTheme } from "./graphStyle";

cytoscape.use(fcose);

export interface Highlight {
  focusNode: PersonId | null;
  focusEdge: string | null;
  /** When set, nodes outside the set are dimmed. */
  nodes: Set<PersonId> | null;
  /** When set, edges outside the set are dimmed. */
  edges: Set<string> | null;
  /** Neighbourhood of the focused node. */
  hlNodes: Set<PersonId>;
  hlEdges: Set<string>;
  pathNodes: Set<PersonId>;
  pathEdges: Set<string>;
  searchHits: Set<PersonId>;
}

export interface GraphHandle {
  zoomBy(factor: number): void;
  fit(): void;
  runLayout(): void;
  focus(id: PersonId): void;
  exportPng(): Promise<Blob>;
  exportSvg(): string;
}

interface Props {
  data: NetworkData;
  adj: Adjacency;
  levels: Map<PersonId, number>;
  visible: Set<PersonId>;
  highlight: Highlight;
  settings: Settings;
  positions: Positions;
  connectFrom: PersonId | null;
  onNodeTap(id: PersonId, shift: boolean): void;
  onEdgeTap(id: string): void;
  onBackgroundTap(): void;
  onBackgroundDblTap(): void;
  onPositions(updates: Positions): void;
}

const GHOST_NODE = "__ghost";
const LARGE_NETWORK = 400;
const GHOST_EDGE = "__ghost_edge";

interface FcoseOptions extends BaseLayoutOptions {
  name: "fcose";
  quality: "draft" | "default" | "proof";
  randomize: boolean;
  animate: boolean;
  animationDuration: number;
  fit: boolean;
  padding: number;
  nodeDimensionsIncludeLabels: boolean;
  packComponents: boolean;
  nodeSeparation: number;
  nodeRepulsion: () => number;
  idealEdgeLength: () => number;
  edgeElasticity: () => number;
  gravity: number;
  numIter: number;
  tile: boolean;
  fixedNodeConstraint?: { nodeId: string; position: Position }[];
}

function nodeSize(isMe: boolean, degree: number): number {
  return isMe ? 72 : 34 + Math.min(degree, 12) * 2;
}

function nodeData(
  p: Person,
  data: NetworkData,
  adj: Adjacency,
  levels: Map<PersonId, number>,
  settings: Settings,
) {
  const isMe = p.id === data.meId;
  const level = levels.get(p.id);
  const color = isMe
    ? ME_COLOR
    : settings.colorBy === "level"
      ? levelColor(level)
      : (data.categories.find((c) => c.id === p.category)?.color ?? "#64748b");
  const ctc = settings.showCtc ? `\n${formatCtc(p.ctc, settings.currency)}` : "";
  const label = `${isMe ? `${p.name} (you)` : p.name}${ctc}`;
  const size = nodeSize(isMe, adj.get(p.id)?.size ?? 0);
  // Initials avatars cost a texture per node; very large maps skip them for speed.
  const avatar =
    isMe || Object.keys(data.people).length <= LARGE_NETWORK
      ? avatarUri(isMe ? "YOU" : initials(p.name), color)
      : "none";
  return {
    id: p.id,
    kind: isMe ? "me" : "person",
    label,
    color,
    size,
    avatar,
    unreachable: !isMe && level === undefined,
  };
}

function edgeKind(meId: PersonId, a: PersonId, b: PersonId, levels: Map<PersonId, number>): string {
  if (a === meId || b === meId) return "me";
  if (!levels.has(a) && !levels.has(b)) return "island";
  return "normal";
}

function isGhost(id: string): boolean {
  return id === GHOST_NODE || id === GHOST_EDGE;
}

export const GraphCanvas = forwardRef<GraphHandle, Props>(function GraphCanvas(props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const themeRef = useRef<CanvasTheme | null>(null);
  // Event handlers and layout callbacks read the latest props through this ref.
  const propsRef = useRef(props);
  useLayoutEffect(() => {
    propsRef.current = props;
  });
  const initializedRef = useRef(false);
  const layoutRunning = useRef(false);

  const reportAllPositions = () => {
    const cy = cyRef.current;
    if (!cy) return;
    const out: Positions = {};
    cy.nodes().forEach((n) => {
      if (isGhost(n.id())) return;
      const p = n.position();
      out[n.id()] = { x: Math.round(p.x), y: Math.round(p.y) };
    });
    propsRef.current.onPositions(out);
  };

  const fitVisible = (animate = true) => {
    const cy = cyRef.current;
    if (!cy) return;
    const eles = cy.elements().not(".hidden").not(".ghost");
    if (eles.empty()) return;
    // A tiny network would otherwise zoom in absurdly far.
    if (eles.nodes().length <= 3) {
      if (animate)
        cy.animate({ center: { eles }, zoom: 1.2, duration: 350, easing: "ease-in-out-cubic" });
      else {
        cy.zoom(1.2);
        cy.center(eles);
      }
      return;
    }
    if (animate)
      cy.animate({ fit: { eles, padding: 80 }, duration: 350, easing: "ease-in-out-cubic" });
    else cy.fit(eles, 80);
  };

  const runLayout = (animate = true) => {
    const cy = cyRef.current;
    if (!cy) return;
    const { data, levels, settings } = propsRef.current;
    const eles = cy.elements().not(".hidden").not(".ghost");
    if (eles.nodes().empty()) return;
    const n = eles.nodes().length;
    const doAnimate = animate && n <= 400;
    const meNode = cy.getElementById(data.meId);
    const meVisible = meNode.nonempty() && !meNode.hasClass("hidden");
    let maxLevel = 0;
    for (const l of levels.values()) maxLevel = Math.max(maxLevel, l);
    const rank = (node: NodeSingular) => levels.get(node.id()) ?? maxLevel + 1;

    let options: LayoutOptions;
    switch (settings.layout) {
      case "force": {
        const fc: FcoseOptions = {
          name: "fcose",
          quality: n > 1200 ? "draft" : "default",
          randomize: true,
          animate: doAnimate,
          animationDuration: 700,
          fit: false,
          padding: 40,
          nodeDimensionsIncludeLabels: true,
          packComponents: false,
          nodeSeparation: 90,
          nodeRepulsion: () => 9000,
          idealEdgeLength: () => (n > 300 ? 90 : 120),
          edgeElasticity: () => 0.45,
          gravity: 0.3,
          numIter: 2500,
          tile: true,
          fixedNodeConstraint:
            settings.keepMeCentered && meVisible
              ? [{ nodeId: data.meId, position: { x: 0, y: 0 } }]
              : undefined,
        };
        options = fc;
        break;
      }
      case "radial":
        options = {
          name: "concentric",
          concentric: (node: NodeSingular) => maxLevel + 2 - rank(node),
          levelWidth: () => 1,
          minNodeSpacing: 36,
          spacingFactor: 1.05,
          avoidOverlap: true,
          nodeDimensionsIncludeLabels: true,
          startAngle: -Math.PI / 2,
          animate: doAnimate,
          animationDuration: 600,
          fit: false,
        };
        break;
      case "hierarchical": {
        // ME roots its own tree; every component out of reach gets its best-connected person.
        const roots: string[] = [];
        for (const comp of eles.components()) {
          if (meVisible && comp.contains(meNode)) roots.unshift(data.meId);
          else {
            const best = comp.nodes().max((nd: NodeSingular) => nd.degree(false)).ele;
            if (best) roots.push(best.id());
          }
        }
        options = {
          name: "breadthfirst",
          directed: false,
          roots,
          spacingFactor: 1.15,
          avoidOverlap: true,
          nodeDimensionsIncludeLabels: true,
          animate: doAnimate,
          animationDuration: 600,
          fit: false,
        };
        break;
      }
      case "circle":
        options = {
          name: "circle",
          sort: (a: NodeSingular, b: NodeSingular) => rank(a) - rank(b),
          avoidOverlap: true,
          nodeDimensionsIncludeLabels: true,
          animate: doAnimate,
          animationDuration: 600,
          fit: false,
        };
        break;
    }
    layoutRunning.current = true;
    const layout = eles.layout(options);
    layout.one("layoutstop", () => {
      layoutRunning.current = false;
      reportAllPositions();
      fitVisible(doAnimate);
    });
    layout.run();
  };

  /** Positions newly added nodes next to their best-placed neighbour. */
  const placeNewNodes = (ids: PersonId[]) => {
    const cy = cyRef.current;
    if (!cy) return;
    const { adj, levels, data } = propsRef.current;
    const pending = new Set(ids);
    const updates: Positions = {};
    const occupied: Position[] = [];
    cy.nodes().forEach((n) => {
      if (!pending.has(n.id()) && !isGhost(n.id())) occupied.push(n.position());
    });
    const posOf = (id: PersonId): Position | null => {
      if (pending.has(id)) return updates[id] ?? null;
      const n = cy.getElementById(id);
      return n.nonempty() ? { ...n.position() } : null;
    };
    for (const id of ids) {
      const neighbours = [...(adj.get(id) ?? [])].filter((nb) => posOf(nb) !== null);
      neighbours.sort((x, y) => (levels.get(x) ?? 1e9) - (levels.get(y) ?? 1e9));
      const anchorId = neighbours[0] ?? data.meId;
      const anchor = posOf(anchorId) ?? { x: 0, y: 0 };
      const anchorNbrs = [...(adj.get(anchorId) ?? [])]
        .filter((x) => x !== id)
        .map(posOf)
        .filter((p): p is Position => p !== null);
      const pos = placeNear(anchor, anchorNbrs, occupied, neighbours.length ? 130 : 240);
      updates[id] = { x: Math.round(pos.x), y: Math.round(pos.y) };
      occupied.push(pos);
      const node = cy.getElementById(id);
      node.position(anchor);
      node.animate({ position: pos, duration: 300, easing: "ease-out-cubic" });
    }
    propsRef.current.onPositions(updates);
  };

  // Create the Cytoscape instance once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    themeRef.current = readTheme();
    const cy = cytoscape({
      container,
      elements: [],
      style: buildStylesheet(themeRef.current),
      minZoom: 0.05,
      maxZoom: 4,
      boxSelectionEnabled: false,
      autounselectify: true,
      layout: { name: "preset" },
    });
    cyRef.current = cy;
    // Exposed for automated acceptance tests (e2e/acceptance.mjs) only.
    if (new URLSearchParams(window.location.search).has("debug")) {
      Object.assign(window, { __networkCy: cy });
    }

    cy.on("tap", "node", (e: EventObject) => {
      const id = e.target.id();
      if (isGhost(id)) return;
      // Touch taps carry no modifier keys; `originalEvent` can also be absent.
      const shift = Boolean(e.originalEvent?.shiftKey);
      propsRef.current.onNodeTap(id, shift);
    });
    cy.on("tap", "edge", (e: EventObject) => {
      if (!isGhost(e.target.id())) propsRef.current.onEdgeTap(e.target.id());
    });
    cy.on("tap", (e: EventObject) => {
      if (e.target === cy) propsRef.current.onBackgroundTap();
    });
    cy.on("dbltap", (e: EventObject) => {
      if (e.target === cy) propsRef.current.onBackgroundDblTap();
    });
    cy.on("dragfree", "node", (e: EventObject) => {
      const n = e.target;
      if (isGhost(n.id())) return;
      const p = n.position();
      propsRef.current.onPositions({ [n.id()]: { x: Math.round(p.x), y: Math.round(p.y) } });
    });
    cy.on("mouseover", "node", (e: EventObject) => {
      container.style.cursor = propsRef.current.connectFrom ? "crosshair" : "pointer";
      if (propsRef.current.connectFrom && e.target.id() !== propsRef.current.connectFrom) {
        e.target.addClass("connect-target");
      }
    });
    cy.on("mouseout", "node", (e: EventObject) => {
      container.style.cursor = propsRef.current.connectFrom ? "crosshair" : "";
      e.target.removeClass("connect-target");
    });
    cy.on("mouseover", "edge", () => {
      if (!propsRef.current.connectFrom) container.style.cursor = "pointer";
    });
    cy.on("mouseout", "edge", () => {
      container.style.cursor = propsRef.current.connectFrom ? "crosshair" : "";
    });
    cy.on("mousemove", (e: EventObject) => {
      const ghost = cy.getElementById(GHOST_NODE);
      if (ghost.nonempty()) ghost.position(e.position);
    });

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onTheme = () => {
      themeRef.current = readTheme();
      cy.style(buildStylesheet(themeRef.current));
    };
    media.addEventListener("change", onTheme);
    const ro = new ResizeObserver(() => cy.resize());
    ro.observe(container);
    return () => {
      media.removeEventListener("change", onTheme);
      ro.disconnect();
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  // Sync people & connections into the graph.
  const { data, adj, levels, settings, positions } = props;
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const added: PersonId[] = [];
    cy.batch(() => {
      cy.nodes().forEach((n) => {
        if (!isGhost(n.id()) && !data.people[n.id()]) n.remove();
      });
      cy.edges().forEach((e) => {
        if (!isGhost(e.id()) && !data.connections[e.id()]) e.remove();
      });
      for (const p of Object.values(data.people)) {
        const nd = nodeData(p, data, adj, levels, settings);
        const node = cy.getElementById(p.id);
        if (node.nonempty()) {
          const cur = node.data();
          if (
            cur.label !== nd.label ||
            cur.color !== nd.color ||
            cur.size !== nd.size ||
            cur.avatar !== nd.avatar ||
            cur.unreachable !== nd.unreachable
          ) {
            node.data(nd);
          }
        } else {
          const pos = positions[p.id];
          cy.add({ group: "nodes", data: nd, position: pos ? { ...pos } : { x: 0, y: 0 } });
          if (!pos) added.push(p.id);
        }
      }
      for (const c of Object.values(data.connections)) {
        const kind = edgeKind(data.meId, c.a, c.b, levels);
        const edge = cy.getElementById(c.id);
        if (edge.nonempty()) {
          if (edge.data("kind") !== kind) edge.data("kind", kind);
        } else {
          cy.add({ group: "edges", data: { id: c.id, source: c.a, target: c.b, kind } });
        }
      }
    });

    const total = Object.keys(data.people).length;
    const needsFullLayout = !initializedRef.current
      ? added.length > 0 && added.length >= Math.max(2, total * 0.3)
      : added.length > 5 && added.length >= total * 0.3;
    if (needsFullLayout) {
      runLayout(initializedRef.current);
    } else if (added.length > 0) {
      placeNewNodes(added);
    }
    if (!initializedRef.current) {
      initializedRef.current = true;
      if (!needsFullLayout) fitVisible(false);
    }
    // positions are only read for nodes that are new to the graph.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, adj, levels, settings.showCtc, settings.colorBy, settings.currency]);

  // Re-run the layout when the user picks a different one.
  const layoutKey = `${settings.layout}|${settings.keepMeCentered}`;
  const lastLayoutKey = useRef(layoutKey);
  useEffect(() => {
    if (lastLayoutKey.current === layoutKey) return;
    lastLayoutKey.current = layoutKey;
    runLayout(true);
    // runLayout reads the latest props through propsRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  // Visibility & highlight classes.
  const { visible, highlight, connectFrom } = props;
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.nodes().forEach((n) => {
        const id = n.id();
        if (isGhost(id)) return;
        n.toggleClass("hidden", !visible.has(id));
        n.toggleClass("dimmed", highlight.nodes !== null && !highlight.nodes.has(id));
        n.toggleClass("focus", highlight.focusNode === id);
        n.toggleClass("hl", highlight.hlNodes.has(id) && highlight.focusNode !== id);
        n.toggleClass("path", highlight.pathNodes.has(id));
        n.toggleClass("search-hit", highlight.searchHits.has(id));
        n.toggleClass("connect-source", connectFrom === id);
      });
      cy.edges().forEach((e) => {
        const id = e.id();
        if (isGhost(id)) return;
        const hidden = !visible.has(e.data("source")) || !visible.has(e.data("target"));
        e.toggleClass("hidden", hidden);
        e.toggleClass("dimmed", highlight.edges !== null && !highlight.edges.has(id));
        e.toggleClass("focus", highlight.focusEdge === id);
        e.toggleClass("hl", highlight.hlEdges.has(id));
        e.toggleClass("path", highlight.pathEdges.has(id));
      });
    });
  }, [visible, highlight, connectFrom, data]);

  // Ghost edge that follows the pointer while connecting.
  useEffect(() => {
    const cy = cyRef.current;
    const container = containerRef.current;
    if (!cy || !container) return;
    cy.remove(cy.getElementById(GHOST_EDGE));
    cy.remove(cy.getElementById(GHOST_NODE));
    cy.nodes(".connect-target").removeClass("connect-target");
    if (!connectFrom) {
      container.style.cursor = "";
      return;
    }
    const source = cy.getElementById(connectFrom);
    if (source.empty()) return;
    container.style.cursor = "crosshair";
    cy.add({
      group: "nodes",
      data: { id: GHOST_NODE },
      classes: "ghost",
      position: { ...source.position() },
      grabbable: false,
      selectable: false,
    });
    cy.add({
      group: "edges",
      data: { id: GHOST_EDGE, source: connectFrom, target: GHOST_NODE },
      classes: "ghost",
    });
  }, [connectFrom]);

  useImperativeHandle(ref, () => ({
    zoomBy(factor: number) {
      const cy = cyRef.current;
      if (!cy) return;
      const level = Math.min(cy.maxZoom(), Math.max(cy.minZoom(), cy.zoom() * factor));
      cy.animate({
        zoom: { level, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } },
        duration: 180,
      });
    },
    fit() {
      fitVisible(true);
    },
    runLayout() {
      runLayout(true);
    },
    focus(id: PersonId) {
      const cy = cyRef.current;
      const node = cy?.getElementById(id);
      if (!cy || !node || node.empty()) return;
      // Freshly placed nodes glide into position; centre on where they land.
      if (node.animated()) {
        setTimeout(() => this.focus(id), 330);
        return;
      }
      cy.animate({
        center: { eles: node },
        zoom: Math.max(cy.zoom(), 1),
        duration: 350,
        easing: "ease-in-out-cubic",
      });
    },
    async exportPng() {
      const cy = cyRef.current;
      if (!cy) throw new Error("Graph not ready");
      const bg = themeRef.current?.canvasBg ?? "#ffffff";
      return cy.png({
        output: "blob-promise",
        full: true,
        scale: 2,
        bg,
        maxWidth: 8000,
        maxHeight: 8000,
      });
    },
    exportSvg() {
      const cy = cyRef.current;
      if (!cy) throw new Error("Graph not ready");
      return buildSvg(cy, themeRef.current ?? readTheme());
    },
  }));

  return (
    <div
      ref={containerRef}
      className="graph-canvas"
      aria-label="Network graph"
      role="application"
    />
  );
});
