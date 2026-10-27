import { useState } from "react";
import { useApp } from "../state/context";
import { LEVEL_COLORS, UNREACHABLE_COLOR } from "./graphStyle";

export function Legend() {
  const { data, settings } = useApp();
  const [open, setOpen] = useState(() => window.innerWidth >= 1280);
  return (
    <div className={`legend panel-card${open ? "" : " closed"}`}>
      <button className="legend-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Legend <span aria-hidden>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="legend-body">
          <div className="legend-group">
            <div className="legend-title">
              Nodes · colour = {settings.colorBy === "level" ? "level" : "category"}
            </div>
            <div className="legend-item">
              <span className="swatch me" /> You (centre of your network)
            </div>
            {settings.colorBy === "category"
              ? data.categories.map((c) => (
                  <div key={c.id} className="legend-item">
                    <span className="swatch" style={{ background: c.color }} /> {c.label}
                  </div>
                ))
              : LEVEL_COLORS.slice(1).map((c, i) => (
                  <div key={c} className="legend-item">
                    <span className="swatch" style={{ background: c }} /> Level {i + 1}
                    {i === LEVEL_COLORS.length - 2 ? "+" : ""}
                  </div>
                ))}
            <div className="legend-item">
              <span
                className="swatch dashed"
                style={settings.colorBy === "level" ? { background: UNREACHABLE_COLOR } : undefined}
              />{" "}
              Dashed ring = not connected to you
            </div>
            <div className="legend-item muted">Bigger node = more connections</div>
          </div>
          <div className="legend-group">
            <div className="legend-title">Lines</div>
            <div className="legend-item">
              <span className="line me" /> Direct connection to you
            </div>
            <div className="legend-item">
              <span className="line" /> Connection
            </div>
            <div className="legend-item">
              <span className="line island" /> Connection outside your reach
            </div>
            <div className="legend-item">
              <span className="line hl" /> Selected person's connections
            </div>
            <div className="legend-item">
              <span className="line path" /> Shortest path
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
