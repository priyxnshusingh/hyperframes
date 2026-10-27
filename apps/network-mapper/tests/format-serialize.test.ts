import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { ctcToInput, formatCtc, formatCtcFull, parseCtcInput } from "../src/model/format";
import { emptyNetwork, networkReducer } from "../src/model/network";
import { sampleNetwork } from "../src/model/sample";
import { parseImport, toCsv, toExportFile } from "../src/model/serialize";
import { DEFAULT_SETTINGS } from "../src/model/types";
import { openIndexedDbStorage } from "../src/storage/db";

describe("CTC formatting", () => {
  it("formats INR in lakh / crore", () => {
    expect(formatCtc(1_800_000, "INR")).toBe("₹18 LPA");
    expect(formatCtc(1_825_000, "INR")).toBe("₹18.25 LPA");
    expect(formatCtc(12_500_000, "INR")).toBe("₹1.25 Cr");
    expect(formatCtc(85_000, "INR")).toBe("₹85,000");
    expect(formatCtc(null, "INR")).toBe("CTC not added");
    expect(formatCtcFull(1_800_000, "INR")).toBe("₹18,00,000");
    expect(formatCtc(120_000, "USD")).toBe("$120K");
  });

  it("parses inputs in the chosen unit and rejects junk", () => {
    expect(parseCtcInput("18", 1e5)).toBe(1_800_000);
    expect(parseCtcInput("18.5", 1e5)).toBe(1_850_000);
    expect(parseCtcInput("18,00,000", 1)).toBe(1_800_000);
    expect(parseCtcInput("", 1e5)).toBeNull();
    expect(parseCtcInput("abc", 1e5)).toBeUndefined();
    expect(parseCtcInput("-5", 1e5)).toBeUndefined();
  });

  it("round-trips stored values back into the edit form", () => {
    for (const v of [1_800_000, 1_825_007, 99_999, 0]) {
      const { text, unitId } = ctcToInput(v, "INR");
      const mult = unitId === "lpa" ? 1e5 : unitId === "cr" ? 1e7 : 1;
      expect(parseCtcInput(text, mult)).toBe(v);
    }
  });
});

describe("JSON export / import", () => {
  it("restores every person, CTC, category and connection", () => {
    const { data } = sampleNetwork();
    const withCustom = networkReducer(data, {
      type: "addCategory",
      category: { id: "custom-gym", label: "Gym", color: "#f97316", builtIn: false },
    });
    const positions = { [data.meId]: { x: 1, y: 2 } };
    const file = toExportFile(withCustom, positions, DEFAULT_SETTINGS);
    const back = parseImport(JSON.stringify(file));
    expect(back.warnings).toEqual([]);
    expect(back.data.meId).toBe(withCustom.meId);
    expect(back.data.people).toEqual(withCustom.people);
    expect(back.data.connections).toEqual(withCustom.connections);
    expect(back.data.categories.find((c) => c.id === "custom-gym")?.label).toBe("Gym");
    expect(back.positions).toEqual(positions);
  });

  it("drops dangling, duplicate and self connections and repairs a missing ME", () => {
    const text = JSON.stringify({
      people: [
        { id: "p1", name: "A", ctc: 100 },
        { id: "p2", name: "B", ctc: "250000" },
        { id: "p2", name: "Duplicate" },
        { name: "No id" },
      ],
      connections: [
        { a: "p1", b: "p2" },
        { source: "p2", target: "p1" },
        { a: "p1", b: "p1" },
        { a: "p1", b: "nobody" },
      ],
    });
    const r = parseImport(text);
    expect(Object.keys(r.data.people)).toHaveLength(3);
    expect(r.data.people[r.data.meId]?.category).toBe("me");
    expect(r.data.people.p2?.ctc).toBe(250000);
    expect(Object.keys(r.data.connections)).toHaveLength(1);
    expect(r.warnings).toHaveLength(3);
  });

  it("rejects files that are not network exports", () => {
    expect(() => parseImport("not json")).toThrow(/valid JSON/);
    expect(() => parseImport("{}")).toThrow(/people/);
  });

  it("exports CSV with levels, CTCs and safe cells", () => {
    let d = emptyNetwork("Me");
    d = networkReducer(d, {
      type: "addPerson",
      person: {
        id: "a",
        name: '=HACK, "quoted"',
        ctc: 1_800_000,
        category: "core",
        notes: "line1\nline2",
      },
      connectTo: [d.meId],
    });
    const csv = toCsv(d, "INR");
    const lines = csv.split("\r\n");
    expect(lines[0]).toContain("Annual CTC (INR)");
    expect(csv).toContain(`"'=HACK, ""quoted""",1800000,₹18 LPA,Core friend,1,1,Me`);
    expect(csv).toContain('"line1\nline2"');
  });
});

describe("IndexedDB persistence", () => {
  it("saves incrementally and loads the same network back", async () => {
    const name = `test-${Math.random()}`;
    const storage = await openIndexedDbStorage(indexedDB, name);
    expect(await storage.load()).toBeNull();

    const { data } = sampleNetwork();
    await storage.saveNetwork(null, data);
    const edited = networkReducer(data, {
      type: "updatePerson",
      id: Object.keys(data.people).find((id) => id !== data.meId)!,
      patch: { ctc: 4_200_000 },
    });
    const removed = networkReducer(edited, {
      type: "removeConnection",
      id: Object.keys(edited.connections)[0]!,
    });
    await storage.saveNetwork(data, edited);
    await storage.saveNetwork(edited, removed);
    await storage.savePositions({ [data.meId]: { x: 5, y: 6 } });
    await storage.saveSettings({ ...DEFAULT_SETTINGS, showCtc: false });

    const reopened = await openIndexedDbStorage(indexedDB, name);
    const loaded = await reopened.load();
    expect(loaded?.data.people).toEqual(removed.people);
    expect(loaded?.data.connections).toEqual(removed.connections);
    expect(loaded?.data.meId).toBe(removed.meId);
    expect(loaded?.positions).toEqual({ [data.meId]: { x: 5, y: 6 } });
    expect(loaded?.settings?.showCtc).toBe(false);
  });
});
