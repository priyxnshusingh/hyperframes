import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type FormEvent } from "react";
import { ctcToInput, ctcUnits, formatCtcFull, parseCtcInput } from "../model/format";
import { newId } from "../model/ids";
import { nextCustomColor, searchPeople } from "../model/network";
import { ME_CATEGORY, type Person, type PersonId } from "../model/types";
import { useApp } from "../state/context";
import { PersonPicker } from "./PersonPicker";

export interface PersonFormValues {
  name: string;
  ctc: number | null;
  category: string;
  notes: string;
}

export interface PersonFormHandle {
  focusName(): void;
  setConnectTo(ids: PersonId[]): void;
}

interface Props {
  mode: "add" | "edit";
  person?: Person;
  initialConnectTo?: PersonId[];
  onSubmit(values: PersonFormValues, connectTo: PersonId[]): void;
  onCancel?: () => void;
}

const NEW_CATEGORY = "__new__";

export const PersonForm = forwardRef<PersonFormHandle, Props>(function PersonForm(
  { mode, person, initialConnectTo = [], onSubmit, onCancel },
  ref,
) {
  const { data, people, settings, describe, actions, category: categoryOf } = useApp();
  const units = ctcUnits(settings.currency);
  const initialCtc = ctcToInput(person?.ctc ?? null, settings.currency);
  const isMe = person?.id === data.meId;

  const [name, setName] = useState(person?.name ?? "");
  const [ctcText, setCtcText] = useState(initialCtc.text);
  const [unitId, setUnitId] = useState(initialCtc.unitId);
  const [category, setCategory] = useState(person?.category ?? "");
  const [notes, setNotes] = useState(person?.notes ?? "");
  const [connectTo, setConnectTo] = useState<PersonId[]>(initialConnectTo);
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focusName: () => nameRef.current?.focus(),
    setConnectTo: (ids) => setConnectTo(ids),
  }));

  const unit = units.find((u) => u.id === unitId) ?? units[0]!;
  const parsedCtc = parseCtcInput(ctcText, unit.multiplier);

  // Smart default: friends of ME are core friends, friends of others are friends-of-friends.
  const effectiveCategory =
    category || (connectTo.length === 0 ? "other" : connectTo.includes(data.meId) ? "core" : "fof");

  const similar = useMemo(() => {
    if (mode !== "add" || name.trim().length < 2) return [];
    return searchPeople(people, name, 4);
  }, [mode, name, people]);
  const exact = similar.find((p) => p.name.toLowerCase() === name.trim().toLowerCase());

  const reset = () => {
    setName("");
    setCtcText("");
    setNotes("");
    setConfirmDuplicate(false);
    setError(null);
    nameRef.current?.focus();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      nameRef.current?.focus();
      return;
    }
    if (parsedCtc === undefined) {
      setError("CTC must be a positive number (or leave it empty).");
      return;
    }
    if (mode === "add" && exact && !confirmDuplicate) {
      setConfirmDuplicate(true);
      return;
    }
    onSubmit(
      {
        name: name.trim(),
        ctc: parsedCtc,
        category: isMe ? ME_CATEGORY : effectiveCategory,
        notes: notes.trim(),
      },
      connectTo,
    );
    if (mode === "add") reset();
  };

  const addCategory = () => {
    const label = (newCategory ?? "").trim();
    if (!label) return;
    const existing = data.categories.find((c) => c.label.toLowerCase() === label.toLowerCase());
    if (existing) {
      setCategory(existing.id);
    } else {
      const id = `custom-${newId()}`;
      actions.dispatch({
        type: "addCategory",
        category: { id, label, color: nextCustomColor(data.categories), builtIn: false },
      });
      setCategory(id);
    }
    setNewCategory(null);
  };

  const connectExcluded = useMemo(() => new Set(connectTo), [connectTo]);

  return (
    <form className="person-form" onSubmit={submit} noValidate>
      <label className="field">
        <span>
          Name <em className="req">required</em>
        </span>
        <input
          ref={nameRef}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setConfirmDuplicate(false);
            setError(null);
          }}
          placeholder="e.g. Friend A"
          autoComplete="off"
          maxLength={120}
          aria-invalid={error === "Name is required."}
        />
      </label>

      {similar.length > 0 && (
        <div className={`dupes${exact ? " warn" : ""}`} role="status">
          <div className="dupes-title">
            {exact ? `“${exact.name}” already exists.` : "Similar people already in your network:"}
          </div>
          <ul>
            {similar.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="link"
                  onClick={() => actions.select(p.id, { focus: true })}
                >
                  {p.name}
                </button>
                <span className="muted"> · {describe(p)}</span>
                {connectTo.some((t) => t !== p.id) && (
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => {
                      for (const t of connectTo) if (t !== p.id) actions.connect(p.id, t);
                      reset();
                    }}
                    title="Connect this existing person instead of creating a new one"
                  >
                    Connect instead
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="field">
        <span>
          Annual CTC <em className="opt">optional</em>
        </span>
        <div className="ctc-input">
          <input
            inputMode="decimal"
            value={ctcText}
            onChange={(e) => {
              setCtcText(e.target.value);
              setError(null);
            }}
            placeholder={unit.multiplier === 1 ? "e.g. 1800000" : "e.g. 18"}
            aria-label="Annual CTC amount"
            aria-invalid={parsedCtc === undefined}
          />
          <select value={unit.id} onChange={(e) => setUnitId(e.target.value)} aria-label="CTC unit">
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
        <small className={parsedCtc === undefined ? "error-text" : "hint"}>
          {parsedCtc === undefined
            ? "Enter a number like 18 or 18.5"
            : parsedCtc === null
              ? "Leave empty if you don't know it — it shows as “CTC not added”."
              : `= ${formatCtcFull(parsedCtc, settings.currency)} per year`}
        </small>
      </div>

      {!isMe && (
        <div className="field">
          <span>Relationship category</span>
          {newCategory === null ? (
            <select
              value={effectiveCategory}
              onChange={(e) => {
                if (e.target.value === NEW_CATEGORY) setNewCategory("");
                else setCategory(e.target.value);
              }}
              aria-label="Relationship category"
            >
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
              <option value={NEW_CATEGORY}>+ Custom category…</option>
            </select>
          ) : (
            <div className="inline-row">
              <input
                autoFocus
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="Category name, e.g. Gym"
                maxLength={40}
                aria-label="New category name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCategory();
                  } else if (e.key === "Escape") setNewCategory(null);
                }}
              />
              <button type="button" className="btn small" onClick={addCategory}>
                Add
              </button>
              <button
                type="button"
                className="btn small ghost"
                onClick={() => setNewCategory(null)}
              >
                Cancel
              </button>
            </div>
          )}
          {!category && mode === "add" && (
            <small className="hint">
              Auto-picked: {categoryOf(effectiveCategory)?.label ?? effectiveCategory} — change it
              any time.
            </small>
          )}
        </div>
      )}

      {mode === "add" && (
        <div className="field">
          <span>
            Connect to <em className="opt">optional — add more later</em>
          </span>
          {connectTo.length > 0 && (
            <div className="chips">
              {connectTo.map((id) => (
                <span key={id} className={`chip${id === data.meId ? " me" : ""}`}>
                  {data.people[id]?.name ?? "?"}
                  {id === data.meId ? " (you)" : ""}
                  <button
                    type="button"
                    aria-label={`Don't connect to ${data.people[id]?.name ?? ""}`}
                    onClick={() => setConnectTo((ids) => ids.filter((x) => x !== id))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <PersonPicker
            people={people}
            exclude={connectExcluded}
            placeholder={connectTo.length ? "Add another connection…" : "Search people to connect…"}
            onPick={(id) => setConnectTo((ids) => (ids.includes(id) ? ids : [...ids, id]))}
            describe={describe}
          />
          {!connectTo.includes(data.meId) && (
            <button
              type="button"
              className="link small"
              onClick={() => setConnectTo((ids) => [data.meId, ...ids])}
            >
              + Connect to me
            </button>
          )}
        </div>
      )}

      <label className="field">
        <span>
          Notes <em className="opt">optional</em>
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="How you know them, where they work…"
          maxLength={2000}
        />
      </label>

      {error && (
        <div className="error-text" role="alert">
          {error}
        </div>
      )}

      <div className="form-actions">
        <button type="submit" className={`btn primary${confirmDuplicate ? " warn" : ""}`}>
          {mode === "edit"
            ? "Save changes"
            : confirmDuplicate
              ? `Add another “${name.trim()}”`
              : connectTo.length
                ? `Add & connect (${connectTo.length})`
                : "Add person"}
        </button>
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
});
