import { describe, expect, it } from "vitest";
import type { ClaudeDb, ClaudeDbCollection, ClaudeDbDoc } from "../src/claude-runtime";
import { networkReducer } from "../src/model/network";
import { sampleNetwork, stressNetwork } from "../src/model/sample";
import { DEFAULT_SETTINGS } from "../src/model/types";
import { claudeDbStorage } from "../src/storage/claudeDb";

/** In-memory stand-in for the Artifact `db` capability (paths → JSON bodies). */
function fakeDb() {
  const docs = new Map<string, Record<string, unknown>>();
  let writes = 0;
  const docRef = (path: string): ClaudeDbDoc => ({
    async get() {
      const body = docs.get(path);
      return {
        id: path.split("/").pop()!,
        exists: body !== undefined,
        data: () => body && structuredClone(body),
      };
    },
    async set(data) {
      writes++;
      expect(JSON.stringify(data).length).toBeLessThan(256 * 1024);
      docs.set(path, structuredClone(data));
    },
    async delete() {
      writes++;
      docs.delete(path);
    },
    collection: (name) => collectionRef(`${path}/${name}`),
  });
  const collectionRef = (path: string): ClaudeDbCollection => ({
    doc: (id) => docRef(`${path}/${id}`),
    limit: () => ({
      async get() {
        const prefix = `${path}/`;
        const matches = [...docs.keys()].filter(
          (k) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/"),
        );
        return { docs: await Promise.all(matches.map((k) => docRef(k).get())) };
      },
    }),
  });
  const db: ClaudeDb = { doc: docRef };
  return { db, docs, writes: () => writes };
}

describe("Artifact db storage", () => {
  it("round-trips a network, edits, positions and settings in the viewer's private subtree", async () => {
    const { db, docs } = fakeDb();
    const storage = claudeDbStorage(db, "user-1");
    expect(await storage.load()).toBeNull();

    const { data } = sampleNetwork();
    await storage.saveNetwork(null, data);
    const someone = Object.keys(data.people).find((id) => id !== data.meId)!;
    const edited = networkReducer(data, {
      type: "updatePerson",
      id: someone,
      patch: { ctc: 4_200_000 },
    });
    const removed = networkReducer(edited, { type: "deletePerson", id: someone });
    await storage.saveNetwork(data, edited);
    await storage.saveNetwork(edited, removed);
    await storage.savePositions({ [data.meId]: { x: 1, y: 2 } });
    await storage.saveSettings({ ...DEFAULT_SETTINGS, layout: "radial" });

    for (const path of docs.keys()) expect(path.startsWith("data/users/user-1/")).toBe(true);
    const loaded = await claudeDbStorage(db, "user-1").load();
    expect(loaded?.data).toEqual(removed);
    expect(loaded?.positions).toEqual({ [data.meId]: { x: 1, y: 2 } });
    expect(loaded?.settings?.layout).toBe("radial");
  });

  it("rewrites only the touched bucket on an edit, and replaces a whole network cleanly", async () => {
    const { db, writes } = fakeDb();
    const storage = claudeDbStorage(db, "u");
    const big = stressNetwork(1000).data;
    await storage.saveNetwork(null, big);
    const before = writes();
    const someone = Object.keys(big.people)[5]!;
    const edited = networkReducer(big, {
      type: "updatePerson",
      id: someone,
      patch: { name: "Renamed" },
    });
    await storage.saveNetwork(big, edited);
    expect(writes() - before).toBe(1);

    const small = sampleNetwork().data;
    await storage.saveNetwork(edited, small);
    const loaded = await claudeDbStorage(db, "u").load();
    expect(loaded?.data).toEqual(small);
  });
});
