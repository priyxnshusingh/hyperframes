import { pairKey } from "./ids";
import type { NetworkData, PersonId, Position } from "./types";

export type Adjacency = Map<PersonId, Set<PersonId>>;

export function buildAdjacency(data: NetworkData): Adjacency {
  const adj: Adjacency = new Map();
  for (const id of Object.keys(data.people)) adj.set(id, new Set());
  for (const c of Object.values(data.connections)) {
    // Connections are only valid between existing people; skip dangling ones defensively.
    const sa = adj.get(c.a);
    const sb = adj.get(c.b);
    if (!sa || !sb || c.a === c.b) continue;
    sa.add(c.b);
    sb.add(c.a);
  }
  return adj;
}

/** Shortest hop count from `start` to every reachable person (BFS). */
export function bfsLevels(adj: Adjacency, start: PersonId): Map<PersonId, number> {
  const levels = new Map<PersonId, number>();
  if (!adj.has(start)) return levels;
  levels.set(start, 0);
  const queue: PersonId[] = [start];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]!;
    const next = levels.get(cur)! + 1;
    for (const n of adj.get(cur) ?? []) {
      if (!levels.has(n)) {
        levels.set(n, next);
        queue.push(n);
      }
    }
  }
  return levels;
}

/** One shortest path (inclusive of both ends), or null when unreachable. */
export function shortestPath(adj: Adjacency, from: PersonId, to: PersonId): PersonId[] | null {
  if (!adj.has(from) || !adj.has(to)) return null;
  if (from === to) return [from];
  const prev = new Map<PersonId, PersonId>();
  const seen = new Set<PersonId>([from]);
  const queue: PersonId[] = [from];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]!;
    for (const n of adj.get(cur) ?? []) {
      if (seen.has(n)) continue;
      seen.add(n);
      prev.set(n, cur);
      if (n === to) {
        const path: PersonId[] = [to];
        let p = cur;
        while (p !== from) {
          path.push(p);
          p = prev.get(p)!;
        }
        path.push(from);
        return path.reverse();
      }
      queue.push(n);
    }
  }
  return null;
}

/** Connection ids along a node path. */
export function pathEdgeIds(path: PersonId[]): string[] {
  const ids: string[] = [];
  for (let i = 1; i < path.length; i++) ids.push(pairKey(path[i - 1]!, path[i]!));
  return ids;
}

export function degreeOf(adj: Adjacency, id: PersonId): number {
  return adj.get(id)?.size ?? 0;
}

/**
 * Choose a spot for a newly added node next to `anchor`, pointing into the widest
 * angular gap between the anchor's existing neighbours and away from crowding.
 */
export function placeNear(
  anchor: Position,
  neighbourPositions: Position[],
  occupied: Position[],
  radius = 130,
): Position {
  const angles = neighbourPositions
    .map((p) => Math.atan2(p.y - anchor.y, p.x - anchor.x))
    .sort((x, y) => x - y);
  let angle: number;
  if (angles.length === 0) {
    angle = -Math.PI / 2;
  } else if (angles.length === 1) {
    angle = angles[0]! + Math.PI;
  } else {
    let bestGap = -1;
    angle = 0;
    for (let i = 0; i < angles.length; i++) {
      const a1 = angles[i]!;
      const a2 = i === angles.length - 1 ? angles[0]! + Math.PI * 2 : angles[i + 1]!;
      const gap = a2 - a1;
      if (gap > bestGap) {
        bestGap = gap;
        angle = a1 + gap / 2;
      }
    }
  }
  const minDist = 70;
  const tooClose = (p: Position) =>
    occupied.some((o) => (o.x - p.x) ** 2 + (o.y - p.y) ** 2 < minDist * minDist);
  // Spiral outward a little until we find a free-ish spot.
  for (let step = 0; step < 24; step++) {
    const r = radius + Math.floor(step / 6) * 60;
    const a = angle + (step % 6) * ((Math.PI / 6) * (step % 2 === 0 ? 1 : -1));
    const p = { x: anchor.x + Math.cos(a) * r, y: anchor.y + Math.sin(a) * r };
    if (!tooClose(p)) return p;
  }
  return { x: anchor.x + Math.cos(angle) * radius, y: anchor.y + Math.sin(angle) * radius };
}
