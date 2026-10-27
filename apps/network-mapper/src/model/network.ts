import { newId, pairKey, sortedPair } from "./ids";
import {
  BUILT_IN_CATEGORIES,
  CUSTOM_CATEGORY_COLORS,
  ME_CATEGORY,
  type Category,
  type Connection,
  type NetworkData,
  type Person,
  type PersonId,
} from "./types";

export interface NewPersonInput {
  id?: PersonId;
  name: string;
  ctc: number | null;
  category: string;
  notes: string;
}

export type PersonPatch = Partial<Pick<Person, "name" | "ctc" | "category" | "notes">>;

export type NetworkAction =
  | { type: "addPerson"; person: NewPersonInput; connectTo: PersonId[] }
  | { type: "updatePerson"; id: PersonId; patch: PersonPatch }
  | { type: "deletePerson"; id: PersonId }
  | { type: "addConnections"; pairs: [PersonId, PersonId][] }
  | { type: "removeConnection"; id: string }
  | { type: "addCategory"; category: Category }
  | { type: "replace"; data: NetworkData };

export function createPerson(input: NewPersonInput, now = Date.now()): Person {
  return {
    id: input.id ?? newId(),
    name: input.name.trim(),
    ctc: input.ctc,
    category: input.category,
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
  };
}

export function emptyNetwork(meName = "Me"): NetworkData {
  const me = createPerson({ name: meName, ctc: null, category: ME_CATEGORY, notes: "" });
  return {
    meId: me.id,
    people: { [me.id]: me },
    connections: {},
    categories: BUILT_IN_CATEGORIES.map((c) => ({ ...c })),
  };
}

export function hasConnection(data: NetworkData, a: PersonId, b: PersonId): boolean {
  return pairKey(a, b) in data.connections;
}

/** Adds a connection when it is valid and new; returns the same object otherwise. */
function withConnection(
  connections: Record<string, Connection>,
  data: NetworkData,
  a: PersonId,
  b: PersonId,
  now: number,
): Record<string, Connection> {
  if (a === b || !data.people[a] || !data.people[b]) return connections;
  const id = pairKey(a, b);
  if (connections[id]) return connections;
  const [lo, hi] = sortedPair(a, b);
  return { ...connections, [id]: { id, a: lo, b: hi, createdAt: now } };
}

export function nextCustomColor(categories: Category[]): string {
  const custom = categories.filter((c) => !c.builtIn).length;
  return CUSTOM_CATEGORY_COLORS[custom % CUSTOM_CATEGORY_COLORS.length]!;
}

export function networkReducer(data: NetworkData, action: NetworkAction): NetworkData {
  const now = Date.now();
  switch (action.type) {
    case "addPerson": {
      const name = action.person.name.trim();
      if (!name) return data;
      const person = createPerson({ ...action.person, name }, now);
      const withPerson: NetworkData = { ...data, people: { ...data.people, [person.id]: person } };
      let connections = withPerson.connections;
      for (const other of action.connectTo) {
        connections = withConnection(connections, withPerson, person.id, other, now);
      }
      return { ...withPerson, connections };
    }
    case "updatePerson": {
      const existing = data.people[action.id];
      if (!existing) return data;
      const patch: PersonPatch = { ...action.patch };
      if (patch.name !== undefined) {
        patch.name = patch.name.trim();
        if (!patch.name) delete patch.name;
      }
      // "me" is a reserved category; nobody else can take it and ME cannot leave it.
      if (
        patch.category !== undefined &&
        (action.id === data.meId || patch.category === ME_CATEGORY)
      ) {
        delete patch.category;
      }
      const updated: Person = { ...existing, ...patch, updatedAt: now };
      return { ...data, people: { ...data.people, [action.id]: updated } };
    }
    case "deletePerson": {
      if (action.id === data.meId || !data.people[action.id]) return data;
      const people = { ...data.people };
      delete people[action.id];
      const connections: Record<string, Connection> = {};
      for (const [id, c] of Object.entries(data.connections)) {
        if (c.a !== action.id && c.b !== action.id) connections[id] = c;
      }
      return { ...data, people, connections };
    }
    case "addConnections": {
      let connections = data.connections;
      for (const [a, b] of action.pairs) connections = withConnection(connections, data, a, b, now);
      return connections === data.connections ? data : { ...data, connections };
    }
    case "removeConnection": {
      if (!data.connections[action.id]) return data;
      const connections = { ...data.connections };
      delete connections[action.id];
      return { ...data, connections };
    }
    case "addCategory": {
      const label = action.category.label.trim();
      if (!label || data.categories.some((c) => c.id === action.category.id)) return data;
      return { ...data, categories: [...data.categories, { ...action.category, label }] };
    }
    case "replace":
      return action.data;
  }
}

/** People whose names contain `query` (case-insensitive), best matches first. */
export function searchPeople(people: Person[], query: string, limit = Infinity): Person[] {
  const q = query.trim().toLowerCase();
  if (!q) return people.slice(0, limit);
  const scored: { p: Person; score: number }[] = [];
  for (const p of people) {
    const name = p.name.toLowerCase();
    const idx = name.indexOf(q);
    if (idx === -1) continue;
    const score = name === q ? 0 : idx === 0 ? 1 : /\s/.test(name[idx - 1] ?? "") ? 2 : 3;
    scored.push({ p, score });
  }
  scored.sort((x, y) => x.score - y.score || x.p.name.localeCompare(y.p.name));
  return scored.slice(0, limit).map((s) => s.p);
}

export function sortedPeople(data: NetworkData): Person[] {
  return Object.values(data.people).sort((x, y) => {
    if (x.id === data.meId) return -1;
    if (y.id === data.meId) return 1;
    return x.name.localeCompare(y.name);
  });
}

export function categoryById(data: NetworkData, id: string): Category | undefined {
  return data.categories.find((c) => c.id === id);
}
