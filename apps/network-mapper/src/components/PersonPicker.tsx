import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { searchPeople } from "../model/network";
import type { Person, PersonId } from "../model/types";

interface Props {
  people: Person[];
  exclude?: Set<PersonId>;
  placeholder: string;
  onPick(id: PersonId): void;
  /** Secondary text shown next to each option. */
  describe?: (p: Person) => string;
  autoFocus?: boolean;
  ariaLabel?: string;
  /** Optional action for the query when nobody matches (e.g. "create"). */
  emptyAction?: { label: (query: string) => string; run: (query: string) => void };
  onEscape?: () => void;
  maxResults?: number;
}

/** Type-to-search combobox for choosing an existing person. */
export function PersonPicker({
  people,
  exclude,
  placeholder,
  onPick,
  describe,
  autoFocus,
  ariaLabel,
  emptyAction,
  onEscape,
  maxResults = 8,
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const results = useMemo(() => {
    const pool = exclude ? people.filter((p) => !exclude.has(p.id)) : people;
    return searchPeople(pool, query, maxResults);
  }, [people, exclude, query, maxResults]);

  const pick = (id: PersonId) => {
    onPick(id);
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[active];
      if (r) pick(r.id);
      else if (emptyAction && query.trim()) {
        emptyAction.run(query.trim());
        setQuery("");
      }
    } else if (e.key === "Escape") {
      if (query) setQuery("");
      else onEscape?.();
      setOpen(false);
    }
  };

  const showList = open && (results.length > 0 || (emptyAction && query.trim()));

  return (
    <div className="picker">
      <input
        ref={inputRef}
        type="search"
        value={query}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        role="combobox"
        aria-expanded={Boolean(showList)}
        aria-controls={listId}
        aria-autocomplete="list"
        autoFocus={autoFocus}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul className="picker-list" id={listId} role="listbox">
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
              {describe && <span className="picker-meta">{describe(p)}</span>}
            </li>
          ))}
          {results.length === 0 && emptyAction && query.trim() && (
            <li
              role="option"
              aria-selected
              className="active picker-create"
              onMouseDown={(e) => {
                e.preventDefault();
                emptyAction.run(query.trim());
                setQuery("");
              }}
            >
              {emptyAction.label(query.trim())}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
