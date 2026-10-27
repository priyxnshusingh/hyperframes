import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { searchPeople } from "../model/network";
import type { LayoutName, PersonId } from "../model/types";
import type { SaveStatus } from "../state/useNetworkStore";
import { useApp } from "../state/context";
import type { ExportKind } from "./SettingsPanel";

interface Props {
  search: string;
  onSearch(q: string): void;
  onPick(id: PersonId): void;
  sidebarOpen: boolean;
  onToggleSidebar(): void;
  onLayout(l: LayoutName): void;
  onToggleCtc(): void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo(): void;
  onRedo(): void;
  saveStatus: SaveStatus;
  onExport(kind: ExportKind): void;
  onImportClick(): void;
}

const LAYOUTS: { id: LayoutName; label: string }[] = [
  { id: "force", label: "Force-directed" },
  { id: "radial", label: "Radial (you at centre)" },
  { id: "hierarchical", label: "Hierarchical" },
  { id: "circle", label: "Circle" },
];

const SAVE_TEXT: Record<SaveStatus, string> = {
  loading: "Loading…",
  saving: "Saving…",
  saved: "All changes saved",
  error: "Save failed — export a backup",
};

export const TopBar = forwardRef<HTMLInputElement, Props>(function TopBar(props, searchRef) {
  const { people, settings, describe } = useApp();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const results = useMemo(
    () => (props.search.trim() ? searchPeople(people, props.search, 8) : []),
    [people, props.search],
  );

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!(e.target instanceof Node && menuRef.current?.contains(e.target))) setMenu(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  const pick = (id: PersonId) => {
    props.onPick(id);
    props.onSearch("");
    setOpen(false);
  };

  return (
    <header className="topbar">
      <button
        className="icon-btn"
        onClick={props.onToggleSidebar}
        aria-label={props.sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        aria-expanded={props.sidebarOpen}
        title="Toggle sidebar"
      >
        ☰
      </button>
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          ◉
        </span>
        <span className="brand-name">Network Map</span>
      </div>

      <div className="search">
        <input
          ref={searchRef}
          type="search"
          value={props.search}
          placeholder="Search people…  ( / )"
          aria-label="Search people on the map"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls="top-search-list"
          onChange={(e) => {
            props.onSearch(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              const r = results[active];
              if (r) pick(r.id);
            } else if (e.key === "Escape") {
              props.onSearch("");
              e.currentTarget.blur();
            }
          }}
        />
        {open && results.length > 0 && (
          <ul className="picker-list" id="top-search-list" role="listbox">
            {results.map((p, i) => (
              <li
                key={p.id}
                role="option"
                aria-selected={i === active}
                className={i === active ? "active" : undefined}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p.id);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span className="picker-name">{p.name}</span>
                <span className="picker-meta">{describe(p)}</span>
              </li>
            ))}
          </ul>
        )}
        {open && props.search.trim() && results.length === 0 && (
          <div className="picker-list empty-results">No one named “{props.search.trim()}” yet.</div>
        )}
      </div>

      <div className="topbar-actions">
        <label className="select-label">
          <span className="sr-only">Layout</span>
          <select
            value={settings.layout}
            onChange={(e) => {
              const l = LAYOUTS.find((x) => x.id === e.target.value);
              if (l) props.onLayout(l.id);
            }}
            aria-label="Layout"
            title="Layout"
          >
            {LAYOUTS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className={`btn small toggle${settings.showCtc ? " on" : ""}`}
          onClick={props.onToggleCtc}
          aria-pressed={settings.showCtc}
          title="Show or hide CTC labels on the map"
        >
          ₹<span className="hide-sm"> CTC labels</span>
        </button>
        <div className="btn-group">
          <button
            className="icon-btn"
            onClick={props.onUndo}
            disabled={!props.canUndo}
            aria-label="Undo"
            title="Undo (Ctrl/⌘ Z)"
          >
            ↶
          </button>
          <button
            className="icon-btn"
            onClick={props.onRedo}
            disabled={!props.canRedo}
            aria-label="Redo"
            title="Redo (Ctrl/⌘ Shift Z)"
          >
            ↷
          </button>
        </div>
        <div className="menu" ref={menuRef}>
          <button
            className="btn small"
            onClick={() => setMenu((m) => !m)}
            aria-haspopup="menu"
            aria-expanded={menu}
          >
            <span className="hide-sm">Export / Import</span>
            <span className="show-sm">Data</span> ▾
          </button>
          {menu && (
            <div className="menu-list" role="menu">
              {(
                [
                  ["json", "Backup (JSON)"],
                  ["csv", "People & CTC (CSV)"],
                  ["png", "Map image (PNG)"],
                  ["svg", "Map image (SVG)"],
                ] as const
              ).map(([kind, label]) => (
                <button
                  key={kind}
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    props.onExport(kind);
                  }}
                >
                  Export {label}
                </button>
              ))}
              <hr />
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(false);
                  props.onImportClick();
                }}
              >
                Import backup (JSON)…
              </button>
            </div>
          )}
        </div>
        <span
          className={`save-status ${props.saveStatus}`}
          role="status"
          title={SAVE_TEXT[props.saveStatus]}
        >
          <span className="save-dot" aria-hidden />
          <span className="save-text">{SAVE_TEXT[props.saveStatus]}</span>
        </span>
      </div>
    </header>
  );
});
