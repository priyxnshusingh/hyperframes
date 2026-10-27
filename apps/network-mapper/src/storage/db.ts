import type {
  Category,
  Connection,
  NetworkData,
  Person,
  Positions,
  Settings,
} from "../model/types";

export interface PersistedState {
  data: NetworkData;
  positions: Positions;
  settings: Settings | null;
}

export interface NetworkStorage {
  kind: "indexeddb" | "localStorage" | "memory";
  load(): Promise<PersistedState | null>;
  /** Persists `next`, writing only what changed since `prev` (null = full rewrite). */
  saveNetwork(prev: NetworkData | null, next: NetworkData): Promise<void>;
  savePositions(positions: Positions): Promise<void>;
  saveSettings(settings: Settings): Promise<void>;
}

interface NetworkMeta {
  schema: 1;
  meId: string;
  categories: Category[];
}

const PEOPLE = "people";
const CONNECTIONS = "connections";
const META = "meta";

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export async function openIndexedDbStorage(
  factory: IDBFactory = indexedDB,
  name = "personal-network-map",
): Promise<NetworkStorage> {
  const open = factory.open(name, 1);
  open.onupgradeneeded = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains(PEOPLE)) db.createObjectStore(PEOPLE, { keyPath: "id" });
    if (!db.objectStoreNames.contains(CONNECTIONS))
      db.createObjectStore(CONNECTIONS, { keyPath: "id" });
    if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
  };
  const db = await req(open);

  return {
    kind: "indexeddb",
    async load() {
      const tx = db.transaction([PEOPLE, CONNECTIONS, META], "readonly");
      const [meta, people, connections, positions, settings] = await Promise.all([
        req(tx.objectStore(META).get("network")) as Promise<NetworkMeta | undefined>,
        req(tx.objectStore(PEOPLE).getAll()) as Promise<Person[]>,
        req(tx.objectStore(CONNECTIONS).getAll()) as Promise<Connection[]>,
        req(tx.objectStore(META).get("positions")) as Promise<Positions | undefined>,
        req(tx.objectStore(META).get("settings")) as Promise<Settings | undefined>,
      ]);
      if (!meta) return null;
      const data: NetworkData = {
        meId: meta.meId,
        categories: meta.categories,
        people: Object.fromEntries(people.map((p) => [p.id, p])),
        connections: Object.fromEntries(connections.map((c) => [c.id, c])),
      };
      return { data, positions: positions ?? {}, settings: settings ?? null };
    },
    async saveNetwork(prev, next) {
      const tx = db.transaction([PEOPLE, CONNECTIONS, META], "readwrite");
      const people = tx.objectStore(PEOPLE);
      const conns = tx.objectStore(CONNECTIONS);
      const full = !prev || prev.meId !== next.meId;
      if (full) {
        people.clear();
        conns.clear();
        for (const p of Object.values(next.people)) people.put(p);
        for (const c of Object.values(next.connections)) conns.put(c);
      } else {
        // Reducer updates are immutable, so reference inequality means "changed".
        for (const [id, p] of Object.entries(next.people)) if (prev.people[id] !== p) people.put(p);
        for (const id of Object.keys(prev.people)) if (!(id in next.people)) people.delete(id);
        for (const [id, c] of Object.entries(next.connections)) {
          if (prev.connections[id] !== c) conns.put(c);
        }
        for (const id of Object.keys(prev.connections))
          if (!(id in next.connections)) conns.delete(id);
      }
      if (full || prev.categories !== next.categories) {
        const meta: NetworkMeta = { schema: 1, meId: next.meId, categories: next.categories };
        tx.objectStore(META).put(meta, "network");
      }
      await done(tx);
    },
    async savePositions(positions) {
      const tx = db.transaction(META, "readwrite");
      tx.objectStore(META).put(positions, "positions");
      await done(tx);
    },
    async saveSettings(settings) {
      const tx = db.transaction(META, "readwrite");
      tx.objectStore(META).put(settings, "settings");
      await done(tx);
    },
  };
}

/** Fallback for browsers where IndexedDB is unavailable (e.g. some private modes). */
export function localStorageStorage(
  storage: Storage,
  prefix = "personal-network-map:",
): NetworkStorage {
  const read = <T>(key: string): T | null => {
    const raw = storage.getItem(prefix + key);
    return raw === null ? null : (JSON.parse(raw) as T);
  };
  const write = (key: string, value: unknown) =>
    storage.setItem(prefix + key, JSON.stringify(value));
  return {
    kind: "localStorage",
    async load() {
      const data = read<NetworkData>("network");
      if (!data) return null;
      return {
        data,
        positions: read<Positions>("positions") ?? {},
        settings: read<Settings>("settings"),
      };
    },
    async saveNetwork(_prev, next) {
      write("network", next);
    },
    async savePositions(positions) {
      write("positions", positions);
    },
    async saveSettings(settings) {
      write("settings", settings);
    },
  };
}

export function memoryStorage(): NetworkStorage {
  let state: PersistedState | null = null;
  return {
    kind: "memory",
    async load() {
      return state;
    },
    async saveNetwork(_prev, next) {
      state = { positions: {}, settings: null, ...state, data: next };
    },
    async savePositions(positions) {
      if (state) state = { ...state, positions };
    },
    async saveSettings(settings) {
      if (state) state = { ...state, settings };
    },
  };
}

export async function openBestStorage(): Promise<NetworkStorage> {
  try {
    if (typeof indexedDB !== "undefined") return await openIndexedDbStorage();
  } catch {
    // fall through
  }
  try {
    const probe = "__probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return localStorageStorage(localStorage);
  } catch {
    return memoryStorage();
  }
}
