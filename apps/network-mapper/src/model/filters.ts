import type { NetworkData, PersonId } from "./types";

export interface Filters {
  /** Minimum/maximum CTC in whole currency units; null = unbounded. */
  ctcMin: number | null;
  ctcMax: number | null;
  /** Category ids to include. Empty = all categories. */
  categories: string[];
  /** Max connection level from ME; null = any (including not connected). */
  maxLevel: number | null;
  onlyWithCtc: boolean;
}

export const EMPTY_FILTERS: Filters = {
  ctcMin: null,
  ctcMax: null,
  categories: [],
  maxLevel: null,
  onlyWithCtc: false,
};

export function isFiltering(f: Filters): boolean {
  return (
    f.ctcMin !== null ||
    f.ctcMax !== null ||
    f.categories.length > 0 ||
    f.maxLevel !== null ||
    f.onlyWithCtc
  );
}

/**
 * Ids of people that pass every active filter. ME is always visible so the
 * network keeps its anchor. A CTC range excludes people without a CTC.
 */
export function visiblePeople(
  data: NetworkData,
  levels: Map<PersonId, number>,
  f: Filters,
): Set<PersonId> {
  const out = new Set<PersonId>();
  const cats = new Set(f.categories);
  const range = f.ctcMin !== null || f.ctcMax !== null;
  for (const p of Object.values(data.people)) {
    if (p.id === data.meId) {
      out.add(p.id);
      continue;
    }
    if (cats.size > 0 && !cats.has(p.category)) continue;
    if ((f.onlyWithCtc || range) && p.ctc === null) continue;
    if (f.ctcMin !== null && (p.ctc ?? 0) < f.ctcMin) continue;
    if (f.ctcMax !== null && (p.ctc ?? 0) > f.ctcMax) continue;
    if (f.maxLevel !== null) {
      const l = levels.get(p.id);
      if (l === undefined || l > f.maxLevel) continue;
    }
    out.add(p.id);
  }
  return out;
}
