import type { PersonId } from "./types";

export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand()}-${rand()}`;
}

/** Order-independent key for an undirected pair — doubles as the connection id. */
export function pairKey(a: PersonId, b: PersonId): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

export function sortedPair(a: PersonId, b: PersonId): [PersonId, PersonId] {
  return a < b ? [a, b] : [b, a];
}
