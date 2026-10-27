import { forwardRef, useMemo, useState } from "react";
import { formatCtc } from "../model/format";
import { searchPeople } from "../model/network";
import type { PersonId } from "../model/types";
import { levelText, useApp } from "../state/context";
import { PersonForm, type PersonFormHandle } from "./PersonForm";

const SORT_KEYS = ["name", "level", "ctc", "connections"] as const;
type SortKey = (typeof SORT_KEYS)[number];

const LIST_PAGE = 200;

interface Props {
  selectedId: PersonId | null;
  formKey: number;
  initialConnectTo: PersonId[];
}

export const PeoplePanel = forwardRef<PersonFormHandle, Props>(function PeoplePanel(
  { selectedId, formKey, initialConnectTo },
  formRef,
) {
  const { data, adj, levels, people, settings, category, actions } = useApp();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [limit, setLimit] = useState(LIST_PAGE);

  const list = useMemo(() => {
    const found = searchPeople(people, query);
    if (query.trim()) return found;
    const lvl = (id: PersonId) => levels.get(id) ?? Number.POSITIVE_INFINITY;
    const sorted = [...found];
    sorted.sort((a, b) => {
      if (a.id === data.meId) return -1;
      if (b.id === data.meId) return 1;
      switch (sort) {
        case "level":
          return lvl(a.id) - lvl(b.id) || a.name.localeCompare(b.name);
        case "ctc":
          return (b.ctc ?? -1) - (a.ctc ?? -1) || a.name.localeCompare(b.name);
        case "connections":
          return (
            (adj.get(b.id)?.size ?? 0) - (adj.get(a.id)?.size ?? 0) || a.name.localeCompare(b.name)
          );
        case "name":
          return a.name.localeCompare(b.name);
      }
    });
    return sorted;
  }, [people, query, sort, levels, adj, data.meId]);

  const selected = selectedId ? data.people[selectedId] : undefined;

  return (
    <div className="panel-body">
      <section className="section add-section">
        <h3>Add a person</h3>
        <PersonForm
          key={formKey}
          ref={formRef}
          mode="add"
          initialConnectTo={initialConnectTo}
          onSubmit={(v, connectTo) => {
            const id = actions.addPerson(v, connectTo);
            const names = connectTo.map((t) =>
              t === data.meId ? "you" : (data.people[t]?.name ?? "?"),
            );
            actions.toast(
              names.length
                ? `Added ${v.name} · connected to ${names.join(", ")}`
                : `Added ${v.name} (no connections yet)`,
              true,
            );
            actions.select(id, { focus: true });
          }}
        />
        {selected && !initialConnectTo.includes(selected.id) && (
          <button className="link small" onClick={() => actions.openAddForm([selected.id])}>
            Connect new people to {selected.id === data.meId ? "you" : selected.name} instead
          </button>
        )}
      </section>

      <section className="section">
        <div className="list-head">
          <h3>People ({people.length})</h3>
          <select
            value={sort}
            onChange={(e) => setSort(SORT_KEYS.find((k) => k === e.target.value) ?? "name")}
            aria-label="Sort people"
          >
            <option value="name">Name</option>
            <option value="level">Level</option>
            <option value="ctc">CTC</option>
            <option value="connections">Connections</option>
          </select>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(LIST_PAGE);
          }}
          placeholder="Search people by name…"
          aria-label="Search people list"
        />
        <ul className="people-list">
          {list.slice(0, limit).map((p) => {
            const isMe = p.id === data.meId;
            const cat = category(p.category);
            return (
              <li key={p.id} className={p.id === selectedId ? "selected" : undefined}>
                <button
                  className="person-row"
                  onClick={() => actions.select(p.id, { focus: true })}
                >
                  <span
                    className="dot"
                    style={{ background: isMe ? "var(--me)" : (cat?.color ?? "#64748b") }}
                  />
                  <span className="person-name">{isMe ? `${p.name} (you)` : p.name}</span>
                  <span className="person-meta">
                    {levelText(levels.get(p.id), isMe)} · {adj.get(p.id)?.size ?? 0} conn.
                  </span>
                  {settings.showCtc && (
                    <span className={`person-ctc${p.ctc === null ? " muted" : ""}`}>
                      {formatCtc(p.ctc, settings.currency)}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        {list.length === 0 && <p className="empty">Nobody matches “{query}”. Add them above.</p>}
        {list.length > limit && (
          <button className="btn small ghost full" onClick={() => setLimit((l) => l + LIST_PAGE)}>
            Show more ({list.length - limit} remaining)
          </button>
        )}
      </section>
    </div>
  );
});
