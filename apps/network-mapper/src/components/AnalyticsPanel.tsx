import type { NetworkAnalytics, CtcStat } from "../model/analytics";
import { formatCtc } from "../model/format";
import { useApp } from "../state/context";
import { levelColor } from "./graphStyle";

interface Props {
  analytics: NetworkAnalytics;
  onLevelFilter(level: number): void;
}

function StatCtc({ label, stat }: { label: string; stat: CtcStat }) {
  const { settings } = useApp();
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {stat.value === null ? "—" : formatCtc(stat.value, settings.currency)}
      </div>
      <div className="stat-foot">
        {stat.n} of {stat.of} profile{stat.of === 1 ? "" : "s"} with CTC
      </div>
    </div>
  );
}

export function AnalyticsPanel({ analytics: a, onLevelFilter }: Props) {
  const { data, settings, actions } = useApp();
  const me = data.people[data.meId];
  const top = a.highestCtc;
  const maxCount = Math.max(1, ...a.levelCounts.map((l) => l.count), a.unreachable.length);

  return (
    <div className="panel-body analytics">
      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">People in network</div>
          <div className="stat-value">{a.totalPeople}</div>
          <div className="stat-foot">excluding you</div>
        </div>
        <div className="stat">
          <div className="stat-label">Direct connections</div>
          <div className="stat-value">{a.directCount}</div>
          <div className="stat-foot">level 1</div>
        </div>
        <div className="stat">
          <div className="stat-label">Total connections</div>
          <div className="stat-value">{a.totalConnections}</div>
          <div className="stat-foot">lines in the map</div>
        </div>
        <StatCtc label="Average CTC" stat={a.avgCtc} />
        <div className="stat">
          <div className="stat-label">Highest CTC</div>
          <div className="stat-value">{top ? formatCtc(top.value, settings.currency) : "—"}</div>
          <div className="stat-foot">
            {top ? (
              <>
                <button
                  className="link"
                  onClick={() => actions.select(top.person.id, { focus: true })}
                >
                  {top.person.name}
                </button>{" "}
                · of {top.n} with CTC
              </>
            ) : (
              "no CTCs recorded"
            )}
          </div>
        </div>
        <StatCtc label="Avg CTC · direct" stat={a.avgDirectCtc} />
        <StatCtc label="Median CTC" stat={a.medianCtc} />
        {me && (
          <div className="stat">
            <div className="stat-label">Your CTC</div>
            <div className="stat-value">{formatCtc(me.ctc, settings.currency)}</div>
            <div className="stat-foot">
              {me.ctc !== null && a.avgCtc.value !== null
                ? `${me.ctc >= a.avgCtc.value ? "+" : "−"}${formatCtc(Math.abs(me.ctc - a.avgCtc.value), settings.currency)} vs avg`
                : "edit your profile to compare"}
            </div>
          </div>
        )}
      </div>

      <section className="section">
        <h3>People per connection level</h3>
        {a.levelCounts.length === 0 && a.unreachable.length === 0 ? (
          <p className="empty">No one yet.</p>
        ) : (
          <ul className="bars">
            {a.levelCounts.map((l) => (
              <li key={l.level}>
                <button
                  className="bar-label link"
                  onClick={() => onLevelFilter(l.level)}
                  title={`Show levels ≤ ${l.level}`}
                >
                  Level {l.level}
                </button>
                <span className="bar-track">
                  <span
                    className="bar-fill"
                    style={{
                      width: `${(l.count / maxCount) * 100}%`,
                      background: levelColor(l.level),
                    }}
                  />
                </span>
                <span className="bar-count">{l.count}</span>
              </li>
            ))}
            {a.unreachable.length > 0 && (
              <li>
                <span className="bar-label">Not connected</span>
                <span className="bar-track">
                  <span
                    className="bar-fill"
                    style={{
                      width: `${(a.unreachable.length / maxCount) * 100}%`,
                      background: levelColor(undefined),
                    }}
                  />
                </span>
                <span className="bar-count">{a.unreachable.length}</span>
              </li>
            )}
          </ul>
        )}
      </section>

      <section className="section">
        <h3>Most connected people</h3>
        {a.topConnectors.length === 0 ? (
          <p className="empty">No connections yet.</p>
        ) : (
          <ol className="rank">
            {a.topConnectors.map(({ person, degree }) => (
              <li key={person.id}>
                <button className="link" onClick={() => actions.select(person.id, { focus: true })}>
                  {person.name}
                </button>
                <span className="muted">{degree} connections</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="section">
        <h3>Not connected to you ({a.unreachable.length})</h3>
        {a.unreachable.length === 0 ? (
          <p className="empty">Everyone is reachable from you. 🎉</p>
        ) : (
          <ul className="rank plain">
            {a.unreachable.slice(0, 50).map((p) => (
              <li key={p.id}>
                <button className="link" onClick={() => actions.select(p.id, { focus: true })}>
                  {p.name}
                </button>
                <button className="chip-btn" onClick={() => actions.connect(data.meId, p.id)}>
                  Connect to me
                </button>
              </li>
            ))}
            {a.unreachable.length > 50 && (
              <li className="muted">…and {a.unreachable.length - 50} more</li>
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
