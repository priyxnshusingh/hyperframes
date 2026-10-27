import { describe, expect, it } from "vitest";
import { computeAnalytics, deriveGraph } from "../src/model/analytics";
import { EMPTY_FILTERS, visiblePeople } from "../src/model/filters";
import {
  bfsLevels,
  buildAdjacency,
  pathEdgeIds,
  placeNear,
  shortestPath,
} from "../src/model/graph";
import { pairKey } from "../src/model/ids";
import {
  emptyNetwork,
  networkReducer,
  searchPeople,
  type NetworkAction,
} from "../src/model/network";
import { stressNetwork } from "../src/model/sample";
import type { NetworkData, PersonId } from "../src/model/types";

const LPA = 1e5;

function apply(data: NetworkData, ...actions: NetworkAction[]): NetworkData {
  return actions.reduce(networkReducer, data);
}

function add(
  data: NetworkData,
  id: string,
  name: string,
  lpa: number | null,
  connectTo: PersonId[] = [],
) {
  return networkReducer(data, {
    type: "addPerson",
    person: { id, name, ctc: lpa === null ? null : lpa * LPA, category: "core", notes: "" },
    connectTo,
  });
}

/** ME → A → X → Y, the example from the brief. */
function chain() {
  let d = emptyNetwork("Me");
  const me = d.meId;
  d = add(d, "a", "Friend A", 18, [me]);
  d = add(d, "x", "Friend X", 25, ["a"]);
  d = add(d, "y", "Friend Y", 40, ["x"]);
  return d;
}

const levelsOf = (d: NetworkData) => deriveGraph(d).levels;

describe("acceptance scenarios (model level)", () => {
  it("1-3: builds ME → A → X → Y with levels 1, 2, 3", () => {
    const d = chain();
    const levels = levelsOf(d);
    expect(levels.get("a")).toBe(1);
    expect(levels.get("x")).toBe(2);
    expect(levels.get("y")).toBe(3);
    expect(Object.keys(d.connections)).toHaveLength(3);
  });

  it("4-5: connecting Y directly to ME keeps every connection and updates Y to level 1", () => {
    const before = chain();
    const after = networkReducer(before, { type: "addConnections", pairs: [["y", before.meId]] });
    expect(Object.keys(after.connections)).toHaveLength(4);
    for (const id of Object.keys(before.connections)) expect(after.connections[id]).toBeDefined();
    const levels = levelsOf(after);
    expect(levels.get("y")).toBe(1);
    expect(levels.get("x")).toBe(2);
    const adj = buildAdjacency(after);
    expect(shortestPath(adj, after.meId, "y")).toEqual([after.meId, "y"]);
  });

  it("6: any two people can be connected, including people far from or unconnected to ME", () => {
    let d = chain();
    d = add(d, "lone", "Loner", null);
    expect(levelsOf(d).has("lone")).toBe(false);
    d = networkReducer(d, { type: "addConnections", pairs: [["lone", "y"]] });
    expect(levelsOf(d).get("lone")).toBe(4);
  });

  it("supports circular connections: A–B–C–A, all connected to ME", () => {
    let d = emptyNetwork();
    const me = d.meId;
    d = add(d, "a", "A", 1, [me]);
    d = add(d, "b", "B", 1, [me, "a"]);
    d = add(d, "c", "C", 1, [me, "b", "a"]);
    expect(Object.keys(d.connections)).toHaveLength(6);
    const levels = levelsOf(d);
    expect([levels.get("a"), levels.get("b"), levels.get("c")]).toEqual([1, 1, 1]);
  });

  it("prevents duplicate and self connections; connections are undirected", () => {
    const d = chain();
    const same = apply(
      d,
      { type: "addConnections", pairs: [["x", "a"]] },
      { type: "addConnections", pairs: [["a", "x"]] },
      { type: "addConnections", pairs: [["a", "a"]] },
      { type: "addConnections", pairs: [["a", "ghost"]] },
    );
    expect(same).toBe(d);
    expect(d.connections[pairKey("x", "a")]).toBe(d.connections[pairKey("a", "x")]);
  });

  it("8: edits name/CTC by id without breaking connections", () => {
    const d = networkReducer(chain(), {
      type: "updatePerson",
      id: "a",
      patch: { name: "Ananya", ctc: 21 * LPA },
    });
    expect(d.people.a?.name).toBe("Ananya");
    expect(d.people.a?.ctc).toBe(21 * LPA);
    expect(levelsOf(d).get("y")).toBe(3);
  });

  it("12: removing a connection keeps both people", () => {
    const d = networkReducer(chain(), { type: "removeConnection", id: pairKey("x", "y") });
    expect(d.people.x).toBeDefined();
    expect(d.people.y).toBeDefined();
    expect(Object.keys(d.connections)).toHaveLength(2);
    expect(levelsOf(d).has("y")).toBe(false);
  });

  it("deleting a person removes only their connections", () => {
    let d = networkReducer(chain(), { type: "addConnections", pairs: [["y", "a"]] });
    d = networkReducer(d, { type: "deletePerson", id: "x" });
    expect(d.people.x).toBeUndefined();
    expect(Object.keys(d.people)).toHaveLength(3);
    expect(
      Object.values(d.connections)
        .map((c) => pairKey(c.a, c.b))
        .sort(),
    ).toEqual([pairKey(d.meId, "a"), pairKey("a", "y")].sort());
  });

  it("never deletes ME or lets ME change category", () => {
    const d = chain();
    expect(networkReducer(d, { type: "deletePerson", id: d.meId })).toBe(d);
    const e = networkReducer(d, {
      type: "updatePerson",
      id: d.meId,
      patch: { category: "core", name: "Riya" },
    });
    expect(e.people[d.meId]?.category).toBe("me");
    expect(e.people[d.meId]?.name).toBe("Riya");
  });

  it("ignores blank names", () => {
    const d = emptyNetwork();
    expect(add(d, "z", "   ", null)).toBe(d);
  });
});

describe("graph algorithms", () => {
  it("BFS levels and shortest paths prefer the fewest hops", () => {
    const d = networkReducer(chain(), { type: "addConnections", pairs: [["a", "y"]] });
    const adj = buildAdjacency(d);
    expect(bfsLevels(adj, d.meId).get("y")).toBe(2);
    const path = shortestPath(adj, "x", d.meId);
    expect(path).toEqual(["x", "a", d.meId]);
    expect(pathEdgeIds(path!)).toEqual([pairKey("x", "a"), pairKey("a", d.meId)]);
    expect(shortestPath(adj, "x", "x")).toEqual(["x"]);
    expect(shortestPath(adj, "x", "missing")).toBeNull();
  });

  it("placeNear avoids neighbours and occupied spots", () => {
    const anchor = { x: 0, y: 0 };
    const p = placeNear(anchor, [{ x: 100, y: 0 }], [{ x: 100, y: 0 }]);
    expect(p.x).toBeLessThan(0);
    const occupied = [{ x: 0, y: -130 }];
    const q = placeNear(anchor, [], occupied);
    expect(Math.hypot(q.x - occupied[0]!.x, q.y - occupied[0]!.y)).toBeGreaterThanOrEqual(70);
  });

  it("handles a thousand-person network quickly", () => {
    const { data } = stressNetwork(1000);
    const t0 = performance.now();
    const g = deriveGraph(data);
    const a = computeAnalytics(data, g);
    expect(performance.now() - t0).toBeLessThan(200);
    expect(a.totalPeople).toBe(1000);
    expect(a.unreachable.length).toBeGreaterThan(0);
  });
});

describe("analytics", () => {
  it("computes the dashboard numbers from valid CTCs only", () => {
    const base = chain();
    let d = networkReducer(base, { type: "addConnections", pairs: [["y", base.meId]] });
    d = add(d, "b", "Friend B", null, ["x"]);
    d = add(d, "lone", "Loner", 100);
    const a = computeAnalytics(d);
    expect(a.totalPeople).toBe(5);
    expect(a.directCount).toBe(2);
    expect(a.totalConnections).toBe(5);
    expect(a.avgCtc).toEqual({ value: ((18 + 25 + 40 + 100) * LPA) / 4, n: 4, of: 5 });
    expect(a.highestCtc?.person.id).toBe("lone");
    expect(a.highestCtc?.n).toBe(4);
    expect(a.avgDirectCtc).toEqual({ value: 29 * LPA, n: 2, of: 2 });
    expect(a.medianCtc.value).toBe(32.5 * LPA);
    expect(a.levelCounts).toEqual([
      { level: 1, count: 2 },
      { level: 2, count: 1 },
      { level: 3, count: 1 },
    ]);
    expect(a.unreachable.map((p) => p.id)).toEqual(["lone"]);
    expect(a.isolated.map((p) => p.id)).toEqual(["lone"]);
    expect(a.topConnectors[0]?.person.id).toBe("x");
  });

  it("reports empty CTC stats without inventing values", () => {
    let d = emptyNetwork();
    d = add(d, "a", "A", null, [d.meId]);
    const a = computeAnalytics(d);
    expect(a.avgCtc).toEqual({ value: null, n: 0, of: 1 });
    expect(a.highestCtc).toBeNull();
  });
});

describe("filters & search", () => {
  it("filters by level, CTC range, category and recorded CTC; ME always visible", () => {
    let d = chain();
    d = add(d, "n", "No CTC", null, [d.meId]);
    d = networkReducer(d, { type: "updatePerson", id: "x", patch: { category: "professional" } });
    const levels = levelsOf(d);
    const ids = (f: Partial<typeof EMPTY_FILTERS>) =>
      [...visiblePeople(d, levels, { ...EMPTY_FILTERS, ...f })]
        .filter((id) => id !== d.meId)
        .sort();
    expect(ids({ maxLevel: 1 })).toEqual(["a", "n"]);
    expect(ids({ maxLevel: 2 })).toEqual(["a", "n", "x"]);
    expect(ids({ ctcMin: 20 * LPA })).toEqual(["x", "y"]);
    expect(ids({ ctcMax: 25 * LPA })).toEqual(["a", "x"]);
    expect(ids({ onlyWithCtc: true })).toEqual(["a", "x", "y"]);
    expect(ids({ categories: ["professional"] })).toEqual(["x"]);
    expect(visiblePeople(d, levels, { ...EMPTY_FILTERS, maxLevel: 1 }).has(d.meId)).toBe(true);
  });

  it("ranks exact and prefix matches first", () => {
    const d = chain();
    const names = searchPeople(Object.values(d.people), "friend").map((p) => p.name);
    expect(names).toEqual(["Friend A", "Friend X", "Friend Y"]);
    expect(searchPeople(Object.values(d.people), "x")[0]?.name).toBe("Friend X");
  });
});
