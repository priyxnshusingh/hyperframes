import { useRef } from "react";
import { CURRENCIES } from "../model/format";
import type { NetworkStorage } from "../storage/db";
import { useApp } from "../state/context";
import type { Settings } from "../model/types";

export type ExportKind = "json" | "csv" | "png" | "svg";

interface Props {
  onSettings(patch: Partial<Settings>): void;
  onExport(kind: ExportKind): void;
  onImport(file: File): void;
  onLoadSample(): void;
  onLoadStress(count: number): void;
  onClear(): void;
  storageKind: NetworkStorage["kind"] | null;
}

export function SettingsPanel({
  onSettings,
  onExport,
  onImport,
  onLoadSample,
  onLoadStress,
  onClear,
  storageKind,
}: Props) {
  const { settings } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="panel-body">
      <section className="section">
        <h3>Display</h3>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.showCtc}
            onChange={(e) => onSettings({ showCtc: e.target.checked })}
          />
          Show CTC labels on the map
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.keepMeCentered}
            onChange={(e) => onSettings({ keepMeCentered: e.target.checked })}
          />
          Keep me at the centre in force layout
        </label>
        <label className="field">
          <span>Colour nodes by</span>
          <select
            value={settings.colorBy}
            onChange={(e) =>
              onSettings({ colorBy: e.target.value === "level" ? "level" : "category" })
            }
          >
            <option value="category">Relationship category</option>
            <option value="level">Connection level</option>
          </select>
        </label>
        <label className="field">
          <span>Currency</span>
          <select
            value={settings.currency}
            onChange={(e) => {
              const c = CURRENCIES.find((x) => x.code === e.target.value);
              if (c) onSettings({ currency: c.code });
            }}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
          <small className="hint">
            Changes the symbol and units only — stored amounts are not converted.
          </small>
        </label>
      </section>

      <section className="section">
        <h3>Backup &amp; export</h3>
        <div className="button-grid">
          <button className="btn small" onClick={() => onExport("json")}>
            Export JSON backup
          </button>
          <button className="btn small" onClick={() => fileRef.current?.click()}>
            Import JSON…
          </button>
          <button className="btn small" onClick={() => onExport("csv")}>
            People &amp; CTC (CSV)
          </button>
          <button className="btn small" onClick={() => onExport("png")}>
            Map image (PNG)
          </button>
          <button className="btn small" onClick={() => onExport("svg")}>
            Map image (SVG)
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImport(f);
            e.target.value = "";
          }}
        />
        <small className="hint">
          {storageKind === "artifact"
            ? "Every change is saved automatically to your private storage for this page, on any device you sign in from."
            : storageKind === "indexeddb"
              ? "Every change is saved automatically in this browser (IndexedDB). Export a JSON backup to move devices."
              : storageKind === "localStorage"
                ? "Saving to this browser's local storage (IndexedDB unavailable)."
                : storageKind === "memory"
                  ? "⚠ This browser blocks storage — changes will be lost on refresh. Export a backup!"
                  : "Opening storage…"}
        </small>
      </section>

      <section className="section">
        <h3>Start over</h3>
        <div className="button-grid">
          <button className="btn small" onClick={onLoadSample}>
            Load sample network
          </button>
          <button className="btn small" onClick={() => onLoadStress(300)}>
            Stress test (300 people)
          </button>
          <button className="btn small" onClick={() => onLoadStress(1000)}>
            Stress test (1,000 people)
          </button>
          <button className="btn small danger" onClick={onClear}>
            Clear network…
          </button>
        </div>
        <small className="hint">Each of these can be undone with Ctrl/⌘ + Z.</small>
      </section>

      <section className="section">
        <h3>Keyboard shortcuts</h3>
        <dl className="shortcuts">
          <dt>/</dt>
          <dd>Search the map</dd>
          <dt>N</dt>
          <dd>Add a person</dd>
          <dt>C</dt>
          <dd>Connect the selected person</dd>
          <dt>E</dt>
          <dd>Edit the selected person</dd>
          <dt>Del</dt>
          <dd>Delete selected person / connection</dd>
          <dt>Shift + click</dt>
          <dd>Keep connecting several people</dd>
          <dt>Ctrl/⌘ Z · Shift Z</dt>
          <dd>Undo · Redo</dd>
          <dt>F</dt>
          <dd>Fit to screen</dd>
          <dt>Esc</dt>
          <dd>Cancel / close</dd>
        </dl>
      </section>
    </div>
  );
}
