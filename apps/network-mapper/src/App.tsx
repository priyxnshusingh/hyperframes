import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnalyticsPanel } from "./components/AnalyticsPanel";
import { EdgePanel } from "./components/EdgePanel";
import { FiltersPanel } from "./components/FiltersPanel";
import { GraphCanvas, type GraphHandle, type Highlight } from "./components/GraphCanvas";
import { Legend } from "./components/Legend";
import { ConfirmDialog, Toasts, type ConfirmState, type Toast } from "./components/Overlays";
import { PeoplePanel } from "./components/PeoplePanel";
import type { PersonFormHandle } from "./components/PersonForm";
import { PersonPicker } from "./components/PersonPicker";
import { ProfilePanel } from "./components/ProfilePanel";
import { SettingsPanel, type ExportKind } from "./components/SettingsPanel";
import { TopBar } from "./components/TopBar";
import { dateStamp, downloadBlob, downloadText, type DownloadResult } from "./export/download";
import { computeAnalytics, deriveGraph } from "./model/analytics";
import { EMPTY_FILTERS, isFiltering, visiblePeople, type Filters } from "./model/filters";
import { formatCtc, pluralize } from "./model/format";
import { pathEdgeIds, shortestPath } from "./model/graph";
import { newId, pairKey } from "./model/ids";
import {
  categoryById,
  hasConnection,
  searchPeople,
  sortedPeople,
  type NewPersonInput,
} from "./model/network";
import { sampleNetwork, stressNetwork } from "./model/sample";
import { parseImport, toCsv, toExportFile } from "./model/serialize";
import type { NetworkData, Person, PersonId, Positions } from "./model/types";
import { AppContext, levelText, type AppActions, type AppContextValue } from "./state/context";
import { useNetworkStore } from "./state/useNetworkStore";

type Tab = "people" | "filters" | "insights" | "settings";
type Selection = { kind: "node"; id: PersonId } | { kind: "edge"; id: string } | null;

const EMPTY_SET: Set<string> = new Set();

function isTypingTarget(t: EventTarget | null): boolean {
  return (
    t instanceof HTMLElement &&
    (t.tagName === "INPUT" ||
      t.tagName === "TEXTAREA" ||
      t.tagName === "SELECT" ||
      t.isContentEditable)
  );
}

export function App() {
  const store = useNetworkStore();
  const { data, settings, positions, dispatch, updatePositions, updateSettings, undo, redo } =
    store;
  const replaceData = store.replace;
  const graphRef = useRef<GraphHandle>(null);
  const formRef = useRef<PersonFormHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const [selected, setSelected] = useState<Selection>(null);
  const [connectFrom, setConnectFrom] = useState<PersonId | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [path, setPath] = useState<{ from: PersonId; to: PersonId } | null>(null);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("people");
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 900);
  const [addConnectTo, setAddConnectTo] = useState<PersonId[] | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [editSignal, setEditSignal] = useState(0);

  const graph = useMemo(() => deriveGraph(data), [data]);
  const analytics = useMemo(() => computeAnalytics(data, graph), [data, graph]);
  const people = useMemo(() => sortedPeople(data), [data]);
  const visible = useMemo(
    () => visiblePeople(data, graph.levels, filters),
    [data, graph.levels, filters],
  );
  const pathResult = useMemo(
    () =>
      path && data.people[path.from] && data.people[path.to]
        ? shortestPath(graph.adj, path.from, path.to)
        : null,
    [path, graph.adj, data.people],
  );

  // Drop selections that point at deleted people/connections (e.g. after undo).
  const sel: Selection =
    selected &&
    ((selected.kind === "node" && data.people[selected.id]) ||
      (selected.kind === "edge" && data.connections[selected.id]))
      ? selected
      : null;
  const activeConnect = connectFrom && data.people[connectFrom] ? connectFrom : null;
  const activePath = path && data.people[path.from] && data.people[path.to] ? path : null;

  const toastSeq = useRef(0);
  const toast = useCallback((message: string, undo = false) => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t.slice(-2), { id, message, undo }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), undo ? 6000 : 3500);
  }, []);

  const nameOf = useCallback(
    (id: PersonId) => (id === data.meId ? "you" : (data.people[id]?.name ?? "?")),
    [data],
  );

  /** Centre the map on a person once the canvas has received them (next frame). */
  const focusSoon = useCallback((id: PersonId) => {
    requestAnimationFrame(() => graphRef.current?.focus(id));
  }, []);

  const actions: AppActions = useMemo(
    () => ({
      dispatch,
      addPerson(input: NewPersonInput, connectTo: PersonId[]) {
        const id = input.id ?? newId();
        dispatch({ type: "addPerson", person: { ...input, id }, connectTo });
        return id;
      },
      connect(a: PersonId, b: PersonId) {
        if (a === b) return;
        if (hasConnection(data, a, b)) {
          toast(`${nameOf(a)} and ${nameOf(b)} are already connected`);
          return;
        }
        dispatch({ type: "addConnections", pairs: [[a, b]] });
        toast(`Connected ${nameOf(a)} ↔ ${nameOf(b)}`, true);
      },
      removeConnection(id: string) {
        const c = data.connections[id];
        if (!c) return;
        dispatch({ type: "removeConnection", id });
        setSelected((s) => (s?.kind === "edge" && s.id === id ? null : s));
        toast(`Removed connection ${nameOf(c.a)} ↔ ${nameOf(c.b)} — both people kept`, true);
      },
      select(id: PersonId | null, opts?: { focus?: boolean }) {
        setConnectFrom(null);
        setSelected(id ? { kind: "node", id } : null);
        if (id && opts?.focus) focusSoon(id);
        if (id && window.innerWidth <= 900) setSidebarOpen(false);
      },
      selectEdge(id: string | null) {
        setConnectFrom(null);
        setSelected(id ? { kind: "edge", id } : null);
      },
      startConnect(id: PersonId) {
        setSelected({ kind: "node", id });
        setConnectFrom(id);
        if (window.innerWidth <= 900) setSidebarOpen(false);
      },
      requestDelete(id: PersonId) {
        const p = data.people[id];
        if (!p || id === data.meId) return;
        const n = graph.adj.get(id)?.size ?? 0;
        setConfirm({
          title: `Delete ${p.name}?`,
          body: (
            <p>
              This removes {p.name}
              {n > 0 ? ` and their ${pluralize(n, "connection")}` : ""}. Everyone else and all other
              connections stay as they are. You can undo this right after.
            </p>
          ),
          confirmLabel: "Delete person",
          danger: true,
          onConfirm() {
            dispatch({ type: "deletePerson", id });
            setSelected(null);
            setConnectFrom(null);
            toast(`Deleted ${p.name}`, true);
          },
        });
      },
      showPath(from: PersonId, to: PersonId) {
        setPath({ from, to });
      },
      openAddForm(connectTo?: PersonId[]) {
        setSidebarOpen(true);
        setTab("people");
        if (connectTo) {
          setAddConnectTo(connectTo);
          setFormKey((k) => k + 1);
        }
        // After React commits the (possibly remounted) form.
        requestAnimationFrame(() => formRef.current?.focusName());
      },
      toast,
    }),
    [dispatch, data, graph.adj, toast, nameOf, focusSoon],
  );

  const ctx: AppContextValue = useMemo(
    () => ({
      data,
      adj: graph.adj,
      levels: graph.levels,
      settings,
      people,
      category: (id: string) => categoryById(data, id),
      describe: (p: Person) => {
        const lv = levelText(graph.levels.get(p.id), p.id === data.meId);
        return settings.showCtc ? `${lv} · ${formatCtc(p.ctc, settings.currency)}` : lv;
      },
      actions,
    }),
    [data, graph, settings, people, actions],
  );

  const highlight: Highlight = useMemo(() => {
    const pathNodes = new Set(pathResult ?? []);
    const pathEdges = new Set(pathResult ? pathEdgeIds(pathResult) : []);
    const q = search.trim();
    const searchHits = q ? new Set(searchPeople(people, q).map((p) => p.id)) : EMPTY_SET;
    const focusNode = sel?.kind === "node" ? sel.id : null;
    const focusEdge = sel?.kind === "edge" ? sel.id : null;
    let hlNodes: Set<PersonId> = EMPTY_SET;
    let hlEdges: Set<string> = EMPTY_SET;
    if (focusNode) {
      hlNodes = new Set(graph.adj.get(focusNode) ?? []);
      hlEdges = new Set([...hlNodes].map((n) => pairKey(focusNode, n)));
    }
    let nodes: Set<PersonId> | null = null;
    let edges: Set<string> | null = null;
    if (pathResult) {
      nodes = new Set(pathNodes);
      if (focusNode) nodes.add(focusNode);
      edges = pathEdges;
    } else if (focusNode) {
      nodes = new Set([focusNode, ...hlNodes]);
      edges = hlEdges;
    } else if (focusEdge) {
      const c = data.connections[focusEdge];
      nodes = new Set(c ? [c.a, c.b] : []);
      edges = new Set([focusEdge]);
    } else if (q && searchHits.size > 0) {
      nodes = searchHits;
      edges = EMPTY_SET;
    }
    return {
      focusNode,
      focusEdge,
      nodes,
      edges,
      hlNodes,
      hlEdges,
      pathNodes,
      pathEdges,
      searchHits,
    };
  }, [pathResult, search, people, sel, graph.adj, data.connections]);

  // ---- Canvas callbacks ----
  const onNodeTap = useCallback(
    (id: PersonId, shift: boolean) => {
      if (activeConnect) {
        if (id === activeConnect) {
          setConnectFrom(null);
          return;
        }
        actions.connect(activeConnect, id);
        if (!shift) setConnectFrom(null);
        return;
      }
      actions.select(id);
    },
    [activeConnect, actions],
  );
  const onEdgeTap = useCallback(
    (id: string) => {
      if (activeConnect) return;
      actions.selectEdge(id);
    },
    [activeConnect, actions],
  );
  const onBackgroundTap = useCallback(() => {
    setConnectFrom(null);
    setSelected(null);
  }, []);
  const onBackgroundDblTap = useCallback(() => {
    actions.openAddForm(sel?.kind === "node" ? [sel.id] : [data.meId]);
  }, [actions, sel, data.meId]);
  const onPositions = useCallback((u: Positions) => updatePositions(u), [updatePositions]);

  // ---- Data operations ----
  const replaceNetwork = useCallback(
    (next: NetworkData, nextPositions: Positions, message: string) => {
      replaceData(next, nextPositions);
      setSelected(null);
      setConnectFrom(null);
      setPath(null);
      setFilters(EMPTY_FILTERS);
      toast(message, true);
    },
    [replaceData, toast],
  );

  const confirmReplace = useCallback(
    (title: string, body: string, confirmLabel: string, run: () => void) => {
      if (Object.keys(data.people).length <= 1) {
        run();
        return;
      }
      setConfirm({ title, body: <p>{body}</p>, confirmLabel, danger: true, onConfirm: run });
    },
    [data.people],
  );

  const onExport = useCallback(
    async (kind: ExportKind) => {
      const stamp = dateStamp();
      try {
        let result: DownloadResult | null = null;
        let message = "";
        if (kind === "json") {
          const file = toExportFile(data, positions, settings);
          result = await downloadText(
            JSON.stringify(file, null, 2),
            `network-${stamp}.json`,
            "application/json",
          );
          message = `Exported ${pluralize(file.people.length, "person", "people")} and ${pluralize(file.connections.length, "connection")}`;
        } else if (kind === "csv") {
          // BOM so spreadsheet apps read ₹ and non-Latin names correctly.
          result = await downloadText(
            `\uFEFF${toCsv(data, settings.currency)}`,
            `network-people-${stamp}.csv`,
            "text/csv;charset=utf-8",
          );
          message = "Exported people & CTC as CSV";
        } else if (kind === "png") {
          const blob = await graphRef.current?.exportPng();
          if (blob) result = await downloadBlob(blob, `network-map-${stamp}.png`);
          message = "Exported map as PNG";
        } else {
          const svg = graphRef.current?.exportSvg();
          if (svg) result = await downloadText(svg, `network-map-${stamp}.svg`, "image/svg+xml");
          message = "Exported map as SVG";
        }
        if (result === "saved") toast(message);
        else if (result === "declined") toast("Export cancelled");
      } catch (err) {
        console.error(err);
        toast(err instanceof Error ? `Export failed: ${err.message}` : "Export failed");
      }
    },
    [data, positions, settings, toast],
  );

  const onImport = useCallback(
    async (file: File) => {
      try {
        const result = parseImport(await file.text());
        const nPeople = Object.keys(result.data.people).length;
        const nConn = Object.keys(result.data.connections).length;
        const run = () => {
          replaceNetwork(
            result.data,
            result.positions,
            `Imported ${pluralize(nPeople, "person", "people")} and ${pluralize(nConn, "connection")}`,
          );
          // Keep the current layout so the imported node positions are shown as saved.
          if (result.settings) {
            const { layout: _layout, keepMeCentered: _centred, ...rest } = result.settings;
            updateSettings(rest);
          }
          for (const w of result.warnings) toast(w);
        };
        setConfirm({
          title: "Import this network?",
          body: (
            <p>
              “{file.name}” contains {pluralize(nPeople, "person", "people")} and{" "}
              {pluralize(nConn, "connection")}. It will replace your current network (
              {pluralize(Object.keys(data.people).length, "person", "people")}). You can undo right
              after, but consider exporting a backup first.
            </p>
          ),
          confirmLabel: "Replace with import",
          danger: true,
          onConfirm: run,
        });
      } catch (err) {
        toast(err instanceof Error ? err.message : "Import failed");
      }
    },
    [data.people, replaceNetwork, updateSettings, toast],
  );

  const clearNetwork = useCallback(() => {
    const me = data.people[data.meId];
    if (!me) return;
    const next: NetworkData = {
      meId: me.id,
      people: { [me.id]: me },
      connections: {},
      categories: data.categories,
    };
    const run = () => {
      replaceNetwork(next, {}, "Network cleared — it's just you now");
      updateSettings({ sampleBannerDismissed: true });
    };
    setConfirm({
      title: "Clear the whole network?",
      body: (
        <p>
          This removes everyone except you (
          {pluralize(Object.keys(data.people).length - 1, "person", "people")} and{" "}
          {pluralize(Object.keys(data.connections).length, "connection")}). You can undo right
          after.
        </p>
      ),
      confirmLabel: "Clear network",
      danger: true,
      onConfirm: run,
    });
  }, [data, replaceNetwork, updateSettings]);

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirm) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "Escape") {
        if (activeConnect) setConnectFrom(null);
        else if (sel) setSelected(null);
        else if (activePath) setPath(null);
        else if (search) setSearch("");
        return;
      }
      if (isTypingTarget(e.target)) return;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod || e.altKey) return;
      switch (e.key) {
        case "/":
          e.preventDefault();
          searchRef.current?.focus();
          break;
        case "n":
        case "N":
          e.preventDefault();
          actions.openAddForm(sel?.kind === "node" ? [sel.id] : undefined);
          break;
        case "c":
        case "C":
          if (sel?.kind === "node") actions.startConnect(sel.id);
          break;
        case "e":
        case "E":
          if (sel?.kind === "node") setEditSignal((s) => s + 1);
          break;
        case "f":
        case "F":
          graphRef.current?.fit();
          break;
        case "Delete":
        case "Backspace":
          if (sel?.kind === "node") actions.requestDelete(sel.id);
          else if (sel?.kind === "edge") actions.removeConnection(sel.id);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirm, activeConnect, sel, activePath, search, actions, undo, redo]);

  const connectSource = activeConnect ? data.people[activeConnect] : undefined;
  const connectExclude = useMemo(
    () =>
      activeConnect ? new Set([activeConnect, ...(graph.adj.get(activeConnect) ?? [])]) : EMPTY_SET,
    [activeConnect, graph.adj],
  );
  const showSampleBanner = store.ready && !settings.sampleBannerDismissed;
  const nobodyYet = analytics.totalPeople === 0;
  const filtering = isFiltering(filters);

  return (
    <AppContext.Provider value={ctx}>
      <div className={`app${sidebarOpen ? " sidebar-open" : ""}`}>
        <TopBar
          ref={searchRef}
          search={search}
          onSearch={setSearch}
          onPick={(id) => actions.select(id, { focus: true })}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
          onLayout={(layout) => updateSettings({ layout })}
          onToggleCtc={() => updateSettings({ showCtc: !settings.showCtc })}
          canUndo={store.canUndo}
          canRedo={store.canRedo}
          onUndo={undo}
          onRedo={redo}
          saveStatus={store.saveStatus}
          onExport={(k) => void onExport(k)}
          onImportClick={() => importRef.current?.click()}
        />
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImport(f);
            e.target.value = "";
          }}
        />

        <div className="main">
          <aside className="sidebar" aria-label="Manage network" aria-hidden={!sidebarOpen}>
            <nav className="tabs" role="tablist">
              {(
                [
                  ["people", "People"],
                  ["filters", "Filter & paths"],
                  ["insights", "Insights"],
                  ["settings", "Settings"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  className={tab === id ? "on" : undefined}
                  onClick={() => setTab(id)}
                >
                  {label}
                  {id === "filters" && (filtering || activePath) && (
                    <span className="badge-dot" aria-label="active" />
                  )}
                </button>
              ))}
            </nav>
            <div className="sidebar-scroll">
              {tab === "people" && (
                <PeoplePanel
                  ref={formRef}
                  formKey={formKey}
                  selectedId={sel?.kind === "node" ? sel.id : null}
                  initialConnectTo={addConnectTo ?? [data.meId]}
                />
              )}
              {tab === "filters" && (
                <FiltersPanel
                  filters={filters}
                  onChange={setFilters}
                  visibleCount={visible.size}
                  path={activePath}
                  pathResult={pathResult}
                  onPath={setPath}
                />
              )}
              {tab === "insights" && (
                <AnalyticsPanel
                  analytics={analytics}
                  onLevelFilter={(level) => {
                    setFilters({ ...filters, maxLevel: level });
                    setTab("filters");
                  }}
                />
              )}
              {tab === "settings" && (
                <SettingsPanel
                  storageKind={store.storageKind}
                  onSettings={updateSettings}
                  onExport={(k) => void onExport(k)}
                  onImport={(f) => void onImport(f)}
                  onLoadSample={() =>
                    confirmReplace(
                      "Load the sample network?",
                      "This replaces your current network with the sample.",
                      "Load sample",
                      () => {
                        const s = sampleNetwork();
                        replaceNetwork(s.data, s.positions, "Loaded the sample network");
                      },
                    )
                  }
                  onLoadStress={(n) =>
                    confirmReplace(
                      `Load a ${n.toLocaleString()}-person test network?`,
                      "This replaces your current network with randomly generated people for performance testing.",
                      "Load test network",
                      () => {
                        const s = stressNetwork(n);
                        replaceNetwork(
                          s.data,
                          s.positions,
                          `Loaded ${n.toLocaleString()} test people`,
                        );
                      },
                    )
                  }
                  onClear={clearNetwork}
                />
              )}
            </div>
          </aside>
          {sidebarOpen && (
            <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
          )}

          <section className={`canvas-wrap${sel ? " with-panel" : ""}`}>
            {/* Mount once saved data is loaded so the first sync sees the real network and layout. */}
            {store.ready && (
              <GraphCanvas
                ref={graphRef}
                data={data}
                adj={graph.adj}
                levels={graph.levels}
                visible={visible}
                highlight={highlight}
                settings={settings}
                positions={positions}
                connectFrom={activeConnect}
                onNodeTap={onNodeTap}
                onEdgeTap={onEdgeTap}
                onBackgroundTap={onBackgroundTap}
                onBackgroundDblTap={onBackgroundDblTap}
                onPositions={onPositions}
              />
            )}

            <button
              className="stat-strip panel-card"
              onClick={() => {
                setSidebarOpen(true);
                setTab("insights");
              }}
              title="Open insights"
            >
              <span>
                <strong>{analytics.totalPeople}</strong> people
              </span>
              <span>
                <strong>{analytics.directCount}</strong> direct
              </span>
              <span>
                <strong>{analytics.totalConnections}</strong> connections
              </span>
              <span>
                avg CTC{" "}
                <strong>
                  {analytics.avgCtc.value === null
                    ? "—"
                    : formatCtc(analytics.avgCtc.value, settings.currency)}
                </strong>
                <small> ({analytics.avgCtc.n})</small>
              </span>
              {filtering && (
                <span className="warn-text">filters on · {visible.size - 1} shown</span>
              )}
            </button>

            {showSampleBanner && (
              <div className="banner panel-card" role="note">
                <span>
                  👋 This is a <strong>sample network</strong> so you can see how it works — every
                  person and connection is editable.
                </span>
                <div className="banner-actions">
                  <button
                    className="btn small primary"
                    onClick={() => {
                      const me = data.people[data.meId];
                      if (me) {
                        replaceNetwork(
                          {
                            meId: me.id,
                            people: { [me.id]: me },
                            connections: {},
                            categories: data.categories,
                          },
                          {},
                          "Started fresh — it's just you now",
                        );
                      }
                      updateSettings({ sampleBannerDismissed: true });
                      actions.openAddForm([data.meId]);
                    }}
                  >
                    Start fresh with just me
                  </button>
                  <button
                    className="btn small ghost"
                    onClick={() => updateSettings({ sampleBannerDismissed: true })}
                  >
                    Keep exploring
                  </button>
                </div>
              </div>
            )}

            {connectSource && (
              <div className="connect-banner panel-card" role="status">
                <div>
                  Connecting{" "}
                  <strong>{connectSource.id === data.meId ? "you" : connectSource.name}</strong> →
                  click another person on the map, or pick:
                </div>
                <PersonPicker
                  people={people}
                  exclude={connectExclude}
                  placeholder="Search a person to connect…"
                  autoFocus
                  describe={ctx.describe}
                  onPick={(id) => {
                    actions.connect(connectSource.id, id);
                  }}
                  onEscape={() => setConnectFrom(null)}
                  emptyAction={{
                    label: (q) => `+ Create “${q}” and connect`,
                    run: (q) => {
                      const id = actions.addPerson(
                        {
                          name: q,
                          ctc: null,
                          category: connectSource.id === data.meId ? "core" : "fof",
                          notes: "",
                        },
                        [connectSource.id],
                      );
                      toast(`Added ${q} · connected to ${nameOf(connectSource.id)}`, true);
                      focusSoon(id);
                    },
                  }}
                />
                <div className="connect-foot">
                  <span className="muted small">
                    Shift + click to connect several · Esc to finish
                  </span>
                  <button className="btn small" onClick={() => setConnectFrom(null)}>
                    Done
                  </button>
                </div>
              </div>
            )}

            {nobodyYet && store.ready && !showSampleBanner && (
              <div className="empty-state panel-card">
                <h2>It's just you so far</h2>
                <p>
                  Add your first friend and connect them to you. Then add their friends, and connect
                  anyone to anyone.
                </p>
                <button className="btn primary" onClick={() => actions.openAddForm([data.meId])}>
                  + Add your first person
                </button>
                <p className="muted small">Tip: double-click the canvas to add someone quickly.</p>
              </div>
            )}

            {sel?.kind === "node" && (
              <ProfilePanel id={sel.id} editSignal={editSignal} onClose={() => setSelected(null)} />
            )}
            {sel?.kind === "edge" && <EdgePanel id={sel.id} onClose={() => setSelected(null)} />}

            <Legend />

            <div className="canvas-controls panel-card" role="toolbar" aria-label="Map controls">
              <button
                className="icon-btn"
                onClick={() => graphRef.current?.zoomBy(1.25)}
                aria-label="Zoom in"
                title="Zoom in"
              >
                +
              </button>
              <button
                className="icon-btn"
                onClick={() => graphRef.current?.zoomBy(0.8)}
                aria-label="Zoom out"
                title="Zoom out"
              >
                −
              </button>
              <button
                className="icon-btn"
                onClick={() => graphRef.current?.fit()}
                aria-label="Fit to screen"
                title="Fit to screen (F)"
              >
                ⤢
              </button>
              <button
                className="icon-btn"
                onClick={() => graphRef.current?.runLayout()}
                aria-label="Reset layout"
                title="Reset layout — re-arrange everyone"
              >
                ⟳
              </button>
            </div>
          </section>
        </div>

        <Toasts
          toasts={toasts}
          onUndo={undo}
          onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))}
        />
        <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      </div>
    </AppContext.Provider>
  );
}
