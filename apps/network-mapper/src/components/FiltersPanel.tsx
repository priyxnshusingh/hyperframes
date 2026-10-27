import { useState } from "react";
import { filterUnit, parseCtcInput } from "../model/format";
import { EMPTY_FILTERS, isFiltering, type Filters } from "../model/filters";
import type { PersonId } from "../model/types";
import { useApp } from "../state/context";
import { PersonPicker } from "./PersonPicker";

interface Props {
  filters: Filters;
  onChange(f: Filters): void;
  visibleCount: number;
  path: { from: PersonId; to: PersonId } | null;
  pathResult: PersonId[] | null;
  onPath(p: { from: PersonId; to: PersonId } | null): void;
}

function PersonSlot({
  label,
  value,
  onChange,
}: {
  label: string;
  value: PersonId | null;
  onChange(id: PersonId | null): void;
}) {
  const { data, people, describe } = useApp();
  const p = value ? data.people[value] : undefined;
  return (
    <div className="field">
      <span>{label}</span>
      {p ? (
        <div className="chips">
          <span className={`chip${p.id === data.meId ? " me" : ""}`}>
            {p.id === data.meId ? `${p.name} (you)` : p.name}
            <button type="button" aria-label={`Clear ${label}`} onClick={() => onChange(null)}>
              ×
            </button>
          </span>
        </div>
      ) : (
        <PersonPicker
          people={people}
          placeholder="Search a person…"
          onPick={onChange}
          describe={describe}
          ariaLabel={label}
        />
      )}
    </div>
  );
}

export function FiltersPanel({ filters, onChange, visibleCount, path, pathResult, onPath }: Props) {
  const { data, settings } = useApp();
  const unit = filterUnit(settings.currency);
  const [minText, setMinText] = useState(
    filters.ctcMin === null ? "" : String(filters.ctcMin / unit.multiplier),
  );
  const [maxText, setMaxText] = useState(
    filters.ctcMax === null ? "" : String(filters.ctcMax / unit.multiplier),
  );
  const [fromLocal, setFrom] = useState<PersonId | null>(data.meId);
  const [toLocal, setTo] = useState<PersonId | null>(null);
  // A path started elsewhere (e.g. "Highlight" on a profile) wins over local picks.
  const from = path?.from ?? fromLocal;
  const to = path?.to ?? toLocal;
  // Clear the range inputs when filters are reset from elsewhere.
  const [seenRange, setSeenRange] = useState([filters.ctcMin, filters.ctcMax]);
  if (seenRange[0] !== filters.ctcMin || seenRange[1] !== filters.ctcMax) {
    setSeenRange([filters.ctcMin, filters.ctcMax]);
    if (filters.ctcMin === null) setMinText("");
    if (filters.ctcMax === null) setMaxText("");
  }
  const total = Object.keys(data.people).length;

  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const setRange = (which: "ctcMin" | "ctcMax", text: string) => {
    if (which === "ctcMin") setMinText(text);
    else setMaxText(text);
    const v = parseCtcInput(text, unit.multiplier);
    if (v !== undefined) set({ [which]: v });
  };

  const levelOptions: { label: string; value: number | null }[] = [
    { label: "All", value: null },
    { label: "Direct (1)", value: 1 },
    { label: "≤ 2", value: 2 },
    { label: "≤ 3", value: 3 },
    { label: "≤ 4", value: 4 },
  ];

  const runPath = (f: PersonId | null, t: PersonId | null) => {
    if (f && t && f !== t) onPath({ from: f, to: t });
    else onPath(null);
  };

  return (
    <div className="panel-body">
      <div className="filter-summary">
        Showing <strong>{visibleCount}</strong> of {total} people
        {isFiltering(filters) && (
          <button
            className="btn small ghost"
            onClick={() => {
              onChange(EMPTY_FILTERS);
              setMinText("");
              setMaxText("");
            }}
          >
            Reset filters
          </button>
        )}
      </div>

      <section className="section">
        <h3>Connection level from you</h3>
        <div className="segmented" role="radiogroup" aria-label="Maximum connection level">
          {levelOptions.map((o) => (
            <button
              key={o.label}
              role="radio"
              aria-checked={filters.maxLevel === o.value}
              className={filters.maxLevel === o.value ? "on" : undefined}
              onClick={() => set({ maxLevel: o.value })}
            >
              {o.label}
            </button>
          ))}
        </div>
        <label className="inline-row small">
          Custom max level
          <input
            type="number"
            min={1}
            max={50}
            value={filters.maxLevel ?? ""}
            placeholder="any"
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              set({ maxLevel: Number.isFinite(n) && n > 0 ? n : null });
            }}
            style={{ width: 70 }}
          />
        </label>
      </section>

      <section className="section">
        <h3>CTC range ({unit.label})</h3>
        <div className="inline-row">
          <input
            inputMode="decimal"
            placeholder="Min"
            value={minText}
            onChange={(e) => setRange("ctcMin", e.target.value)}
            aria-label={`Minimum CTC in ${unit.label}`}
          />
          <span className="muted">to</span>
          <input
            inputMode="decimal"
            placeholder="Max"
            value={maxText}
            onChange={(e) => setRange("ctcMax", e.target.value)}
            aria-label={`Maximum CTC in ${unit.label}`}
          />
        </div>
        {(filters.ctcMin !== null || filters.ctcMax !== null) && (
          <small className="hint">People without a CTC are hidden while a range is set.</small>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={filters.onlyWithCtc}
            onChange={(e) => set({ onlyWithCtc: e.target.checked })}
          />
          Only people with a recorded CTC
        </label>
      </section>

      <section className="section">
        <h3>Relationship category</h3>
        <div className="check-grid">
          {data.categories.map((c) => (
            <label key={c.id} className="check">
              <input
                type="checkbox"
                checked={filters.categories.includes(c.id)}
                onChange={(e) =>
                  set({
                    categories: e.target.checked
                      ? [...filters.categories, c.id]
                      : filters.categories.filter((x) => x !== c.id),
                  })
                }
              />
              <span className="dot" style={{ background: c.color }} />
              {c.label}
            </label>
          ))}
        </div>
        <small className="hint">None ticked = all categories.</small>
      </section>

      <section className="section">
        <h3>Shortest path between two people</h3>
        <PersonSlot
          label="From"
          value={from}
          onChange={(id) => {
            setFrom(id);
            setTo(to);
            runPath(id, to);
          }}
        />
        <PersonSlot
          label="To"
          value={to}
          onChange={(id) => {
            setFrom(from);
            setTo(id);
            runPath(from, id);
          }}
        />
        {path && (
          <div className="path-result" role="status">
            {pathResult ? (
              <>
                <strong>
                  {pathResult.length - 1} hop{pathResult.length - 1 === 1 ? "" : "s"}:
                </strong>{" "}
                {pathResult
                  .map((id) => (id === data.meId ? "You" : (data.people[id]?.name ?? "?")))
                  .join(" → ")}
              </>
            ) : (
              <span>No path — these two people aren't connected through anyone.</span>
            )}
            <button
              className="btn small ghost"
              onClick={() => {
                setFrom(path.from);
                setTo(null);
                onPath(null);
              }}
            >
              Clear path
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
