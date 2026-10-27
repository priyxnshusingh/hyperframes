import { newId, pairKey, sortedPair } from "./ids";
import { createPerson, emptyNetwork } from "./network";
import type { Connection, NetworkData, Person, Positions } from "./types";

interface Seed {
  key: string;
  name: string;
  lpa: number | null;
  category: string;
  notes?: string;
}

/**
 * A small, fully editable starter network: ME → Friend A → Friend X → Friend Y,
 * a triangle of core friends, a professional branch, and one person not yet
 * connected to anyone.
 */
export function sampleNetwork(): { data: NetworkData; positions: Positions } {
  const data = emptyNetwork("Me");
  const seeds: Seed[] = [
    { key: "A", name: "Friend A", lpa: 18, category: "core", notes: "College roommate." },
    { key: "B", name: "Friend B", lpa: 22, category: "core" },
    { key: "C", name: "Friend C", lpa: null, category: "core", notes: "CTC not shared yet." },
    { key: "X", name: "Friend X", lpa: 25, category: "fof", notes: "Met through Friend A." },
    { key: "Y", name: "Friend Y", lpa: 40, category: "fof" },
    { key: "P", name: "Priya (Manager)", lpa: 55, category: "professional" },
    { key: "R", name: "Rahul", lpa: 32, category: "professional", notes: "Ex-colleague." },
    { key: "S", name: "Sana", lpa: 12, category: "fof" },
    {
      key: "N",
      name: "New contact",
      lpa: null,
      category: "other",
      notes: "Not connected yet — try connecting them!",
    },
  ];
  const ids: Record<string, string> = { ME: data.meId };
  const now = Date.now();
  for (const s of seeds) {
    const p: Person = createPerson(
      {
        name: s.name,
        ctc: s.lpa === null ? null : s.lpa * 1e5,
        category: s.category,
        notes: s.notes ?? "",
      },
      now,
    );
    ids[s.key] = p.id;
    data.people[p.id] = p;
  }
  const edges: [string, string][] = [
    ["ME", "A"],
    ["A", "X"],
    ["X", "Y"],
    ["ME", "B"],
    ["ME", "C"],
    ["A", "B"],
    ["B", "C"],
    ["C", "A"],
    ["ME", "P"],
    ["P", "R"],
    ["R", "X"],
    ["B", "S"],
  ];
  for (const [k1, k2] of edges) {
    const [a, b] = sortedPair(ids[k1]!, ids[k2]!);
    data.connections[pairKey(a, b)] = { id: pairKey(a, b), a, b, createdAt: now };
  }
  // Leave positions empty so the default force layout arranges it on first load.
  return { data, positions: {} };
}

/** Deterministic PRNG (mulberry32) so stress networks are reproducible. */
function rng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Aarav",
  "Vivaan",
  "Aditya",
  "Vihaan",
  "Arjun",
  "Sai",
  "Reyansh",
  "Ayaan",
  "Krishna",
  "Ishaan",
  "Ananya",
  "Diya",
  "Aadhya",
  "Saanvi",
  "Kiara",
  "Myra",
  "Pari",
  "Anika",
  "Navya",
  "Riya",
  "Kabir",
  "Rohan",
  "Neha",
  "Pooja",
  "Karan",
  "Meera",
  "Dev",
  "Tara",
  "Zoya",
  "Nikhil",
];
const LAST = [
  "Sharma",
  "Verma",
  "Iyer",
  "Reddy",
  "Nair",
  "Gupta",
  "Mehta",
  "Kapoor",
  "Singh",
  "Das",
  "Rao",
  "Joshi",
  "Patel",
  "Bose",
  "Menon",
  "Khan",
  "Pillai",
  "Chopra",
  "Kulkarni",
  "Shah",
];

/** Generates a large random-but-reproducible network for performance testing. */
export function stressNetwork(
  count: number,
  seed = 42,
): { data: NetworkData; positions: Positions } {
  const rand = rng(seed);
  const data = emptyNetwork("Me");
  const ids: string[] = [];
  const cats = ["core", "fof", "professional", "family", "other"];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const name = `${FIRST[Math.floor(rand() * FIRST.length)]} ${LAST[Math.floor(rand() * LAST.length)]} ${i + 1}`;
    const ctc = rand() < 0.2 ? null : Math.round((4 + rand() * rand() * 90) * 1e5);
    const p = createPerson(
      { id: newId(), name, ctc, category: cats[Math.floor(rand() * cats.length)]!, notes: "" },
      now,
    );
    data.people[p.id] = p;
    ids.push(p.id);
  }
  const add = (x: string, y: string) => {
    if (x === y) return;
    const [a, b] = sortedPair(x, y);
    const id = pairKey(a, b);
    if (!data.connections[id])
      data.connections[id] = { id, a, b, createdAt: now } satisfies Connection;
  };
  // ~5% direct friends, the rest attach to earlier people (preferential-ish).
  ids.forEach((id, i) => {
    if (i < Math.max(3, Math.round(count * 0.05))) add(data.meId, id);
    else add(id, ids[Math.floor(rand() * i)]!);
    if (rand() < 0.35 && i > 0) add(id, ids[Math.floor(rand() * i)]!);
  });
  // A few disconnected people to exercise the "not connected to me" analytics.
  for (let i = 0; i < 3 && ids.length > 10; i++) {
    const id = ids[ids.length - 1 - i]!;
    for (const [cid, c] of Object.entries(data.connections)) {
      if (c.a === id || c.b === id) delete data.connections[cid];
    }
  }
  return { data, positions: {} };
}
