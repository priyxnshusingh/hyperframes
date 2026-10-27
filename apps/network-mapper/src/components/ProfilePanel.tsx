import { useMemo, useState } from "react";
import { formatCtc, formatCtcFull, initials } from "../model/format";
import { shortestPath } from "../model/graph";
import { pairKey } from "../model/ids";
import { ME_COLOR, type PersonId } from "../model/types";
import { levelText, useApp } from "../state/context";
import { PersonForm } from "./PersonForm";
import { PersonPicker } from "./PersonPicker";

interface Props {
  id: PersonId;
  /** Incremented to open the editor from outside (keyboard shortcut "E"). */
  editSignal: number;
  onClose(): void;
}

export function ProfilePanel({ id, editSignal, onClose }: Props) {
  const { data, adj, levels, settings, people, describe, category, actions } = useApp();
  const [editing, setEditing] = useState(false);
  const [lastId, setLastId] = useState(id);
  if (lastId !== id) {
    // Switching to a different person closes the editor.
    setLastId(id);
    setEditing(false);
  }
  const [lastSignal, setLastSignal] = useState(editSignal);
  if (lastSignal !== editSignal) {
    setLastSignal(editSignal);
    setEditing(true);
  }
  const person = data.people[id];
  const neighbours = useMemo(() => {
    const ids = [...(adj.get(id) ?? [])];
    return ids
      .map((nid) => data.people[nid])
      .filter((p) => p !== undefined)
      .sort((a, b) => {
        if (a.id === data.meId) return -1;
        if (b.id === data.meId) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [adj, id, data.people, data.meId]);
  const exclude = useMemo(() => new Set([id, ...(adj.get(id) ?? [])]), [adj, id]);
  const pathFromMe = useMemo(
    () => (id === data.meId ? null : shortestPath(adj, data.meId, id)),
    [adj, data.meId, id],
  );

  if (!person) return null;
  const isMe = id === data.meId;
  const level = levels.get(id);
  const cat = category(person.category);
  const color = isMe ? ME_COLOR : (cat?.color ?? "#64748b");

  return (
    <aside className="profile panel-card" aria-label={`Profile of ${person.name}`}>
      <header className="profile-head">
        <div className="avatar" style={{ background: color }} aria-hidden>
          {isMe ? "YOU" : initials(person.name)}
        </div>
        <div className="profile-title">
          <h2 title={person.name}>{person.name}</h2>
          <div className="profile-sub">
            <span className="tag" style={{ borderColor: color, color }}>
              {isMe ? "You" : (cat?.label ?? person.category)}
            </span>
            <span className="muted">{levelText(level, isMe)}</span>
          </div>
        </div>
        <button
          className="icon-btn"
          onClick={onClose}
          aria-label="Close profile"
          title="Close (Esc)"
        >
          ×
        </button>
      </header>

      {editing ? (
        <PersonForm
          mode="edit"
          person={person}
          onSubmit={(v) => {
            actions.dispatch({ type: "updatePerson", id, patch: v });
            setEditing(false);
            actions.toast(`Saved ${v.name}`, true);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <dl className="facts">
            <div>
              <dt>Annual CTC</dt>
              <dd
                className={person.ctc === null ? "muted" : "ctc"}
                title={formatCtcFull(person.ctc, settings.currency)}
              >
                {formatCtc(person.ctc, settings.currency)}
              </dd>
            </div>
            <div>
              <dt>Connection level</dt>
              <dd>{isMe ? "0 (you)" : level === undefined ? "Not connected" : level}</dd>
            </div>
            <div>
              <dt>Connections</dt>
              <dd>{neighbours.length}</dd>
            </div>
          </dl>

          {!isMe && (
            <div className="path-line">
              {pathFromMe ? (
                <>
                  <span className="muted">Path from you: </span>
                  {pathFromMe.map((pid, i) => (
                    <span key={pid}>
                      {i > 0 && <span className="arrow"> → </span>}
                      <button className="link" onClick={() => actions.select(pid, { focus: true })}>
                        {pid === data.meId ? "You" : (data.people[pid]?.name ?? "?")}
                      </button>
                    </span>
                  ))}{" "}
                  <button className="chip-btn" onClick={() => actions.showPath(data.meId, id)}>
                    Highlight
                  </button>
                </>
              ) : (
                <span className="muted">
                  Not connected to you, directly or indirectly.{" "}
                  <button className="link" onClick={() => actions.connect(data.meId, id)}>
                    Connect to me
                  </button>
                </span>
              )}
            </div>
          )}

          <div className="actions-row">
            <button
              className="btn primary small"
              onClick={() => actions.startConnect(id)}
              title="Connect (C)"
            >
              Connect to another person
            </button>
            <button className="btn small" onClick={() => actions.openAddForm([id])}>
              + New person connected
            </button>
            <button className="btn small" onClick={() => setEditing(true)} title="Edit (E)">
              Edit
            </button>
            {!isMe && (
              <button className="btn small danger" onClick={() => actions.requestDelete(id)}>
                Delete
              </button>
            )}
          </div>

          <section className="profile-section">
            <h3>Direct connections ({neighbours.length})</h3>
            <PersonPicker
              people={people}
              exclude={exclude}
              placeholder="Add a connection — search people…"
              onPick={(other) => actions.connect(id, other)}
              describe={describe}
            />
            {neighbours.length === 0 ? (
              <p className="empty">
                No connections yet. Search above, or click “Connect to another person”.
              </p>
            ) : (
              <ul className="conn-list">
                {neighbours.map((n) => (
                  <li key={n.id}>
                    <button className="link" onClick={() => actions.select(n.id, { focus: true })}>
                      {n.id === data.meId ? `${n.name} (you)` : n.name}
                    </button>
                    <span className="muted small">
                      {settings.showCtc
                        ? formatCtc(n.ctc, settings.currency)
                        : levelText(levels.get(n.id), n.id === data.meId)}
                    </span>
                    <button
                      className="icon-btn small"
                      aria-label={`Remove connection with ${n.name}`}
                      title="Remove this connection (both people stay)"
                      onClick={() => actions.removeConnection(pairKey(id, n.id))}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="profile-section">
            <h3>Notes</h3>
            {person.notes ? (
              <p className="notes">{person.notes}</p>
            ) : (
              <p className="empty">No notes.</p>
            )}
          </section>
        </>
      )}
    </aside>
  );
}
