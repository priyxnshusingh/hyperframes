import { useApp } from "../state/context";

interface Props {
  id: string;
  onClose(): void;
}

export function EdgePanel({ id, onClose }: Props) {
  const { data, actions } = useApp();
  const c = data.connections[id];
  if (!c) return null;
  const a = data.people[c.a];
  const b = data.people[c.b];
  if (!a || !b) return null;
  const name = (p: typeof a) => (p.id === data.meId ? `${p.name} (you)` : p.name);
  return (
    <aside className="profile panel-card edge-panel" aria-label="Connection">
      <header className="profile-head">
        <div className="profile-title">
          <h2>Connection</h2>
          <div className="profile-sub">
            <button className="link" onClick={() => actions.select(a.id, { focus: true })}>
              {name(a)}
            </button>
            <span className="arrow"> ↔ </span>
            <button className="link" onClick={() => actions.select(b.id, { focus: true })}>
              {name(b)}
            </button>
          </div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close" title="Close (Esc)">
          ×
        </button>
      </header>
      <p className="muted small">Connected since {new Date(c.createdAt).toLocaleDateString()}.</p>
      <div className="actions-row">
        <button
          className="btn small danger"
          onClick={() => actions.removeConnection(id)}
          title="Delete / Backspace"
        >
          Remove connection
        </button>
      </div>
      <p className="hint small">Removing a connection keeps both people in your network.</p>
    </aside>
  );
}
