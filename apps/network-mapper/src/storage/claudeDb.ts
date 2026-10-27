import type { ClaudeDb, ClaudeDbDoc } from "../claude-runtime";
import type {
  Category,
  Connection,
  NetworkData,
  Person,
  Positions,
  Settings,
} from "../model/types";
import type { NetworkStorage, PersistedState } from "./db";

/**
 * Persistence through the Artifact `db` capability, in the viewer's private
 * `data/users/<id>/` subtree (nobody else can read it, the artifact owner included).
 *
 * People and connections are grouped into hashed buckets so a thousand-person
 * network is ~130 small documents instead of thousands: an edit rewrites one
 * bucket, and a full replace stays well inside the store's call-rate budget.
 */
const BUCKETS = 64;

interface Meta {
  schema: 1;
  meId: string;
  categories: Category[];
}

function bucketOf(id: string): string {
  // FNV-1a — stable across sessions, so an item always lands in the same bucket.
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `b${((h >>> 0) % BUCKETS).toString().padStart(2, "0")}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Runs writes with a small concurrency cap (the store budgets concurrent writes). */
async function runLimited(jobs: (() => Promise<void>)[], limit = 4): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++]!;
      await job();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
}

function changedBuckets<T>(prev: Record<string, T> | null, next: Record<string, T>): Set<string> {
  const out = new Set<string>();
  if (!prev) {
    for (let i = 0; i < BUCKETS; i++) out.add(`b${i.toString().padStart(2, "0")}`);
    return out;
  }
  for (const [id, item] of Object.entries(next)) if (prev[id] !== item) out.add(bucketOf(id));
  for (const id of Object.keys(prev)) if (!(id in next)) out.add(bucketOf(id));
  return out;
}

function bucketContents<T>(items: Record<string, T>, bucket: string): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [id, item] of Object.entries(items)) if (bucketOf(id) === bucket) out[id] = item;
  return out;
}

async function readBuckets(root: ClaudeDbDoc, name: string): Promise<Record<string, unknown>> {
  const snap = await root.collection(name).limit(1000).get();
  const out: Record<string, unknown> = {};
  for (const d of snap.docs) {
    const items = d.data()?.items;
    if (isRecord(items)) Object.assign(out, items);
  }
  return out;
}

export function claudeDbStorage(db: ClaudeDb, userId: string): NetworkStorage {
  const root = db.doc(`data/users/${userId}/network`);
  const settingsDoc = db.doc(`data/users/${userId}/settings`);
  const positionsDoc = db.doc(`data/users/${userId}/positions`);

  const writeBuckets = async <T>(
    name: string,
    prev: Record<string, T> | null,
    next: Record<string, T>,
  ) => {
    const jobs = [...changedBuckets(prev, next)].map((bucket) => async () => {
      const items = bucketContents(next, bucket);
      const ref = root.collection(name).doc(bucket);
      await (Object.keys(items).length ? ref.set({ items }) : ref.delete());
    });
    await runLimited(jobs);
  };

  return {
    kind: "artifact",
    async load(): Promise<PersistedState | null> {
      const meta = (await root.get()).data();
      if (!meta || typeof meta.meId !== "string" || !Array.isArray(meta.categories)) return null;
      const [people, connections, positions, settings] = await Promise.all([
        readBuckets(root, "people"),
        readBuckets(root, "connections"),
        positionsDoc.get(),
        settingsDoc.get(),
      ]);
      const data: NetworkData = {
        meId: meta.meId,
        categories: meta.categories as Category[],
        people: people as Record<string, Person>,
        connections: connections as Record<string, Connection>,
      };
      const pos = positions.data()?.positions;
      const s = settings.data()?.settings;
      return {
        data,
        positions: isRecord(pos) ? (pos as Positions) : {},
        settings: isRecord(s) ? (s as unknown as Settings) : null,
      };
    },
    async saveNetwork(prev, next) {
      // Reducer updates are immutable, so the diff also covers a whole-network replace;
      // with nothing saved before, rewrite every bucket to clear any partial earlier write.
      await writeBuckets("people", prev?.people ?? null, next.people);
      await writeBuckets("connections", prev?.connections ?? null, next.connections);
      // Meta goes last: it marks the network as present, so a half-finished first save reloads as empty.
      if (!prev || prev.meId !== next.meId || prev.categories !== next.categories) {
        const meta: Meta = { schema: 1, meId: next.meId, categories: next.categories };
        await root.set({ ...meta });
      }
    },
    async savePositions(positions) {
      await positionsDoc.set({ positions });
    },
    async saveSettings(settings) {
      await settingsDoc.set({ settings: { ...settings } });
    },
  };
}
