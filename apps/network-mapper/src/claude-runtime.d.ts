// Minimal typings for the claude.ai Artifact runtime (`window.claude`), covering only
// the calls this app makes. The runtime exists only when the app is published as an
// Artifact; everywhere else `window.claude` is undefined.

export interface ClaudeDbSnapshot {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

export interface ClaudeDbDoc {
  get(): Promise<ClaudeDbSnapshot>;
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
  collection(path: string): ClaudeDbCollection;
}

export interface ClaudeDbCollection {
  doc(id: string): ClaudeDbDoc;
  limit(n: number): { get(): Promise<{ docs: ClaudeDbSnapshot[] }> };
}

export interface ClaudeDb {
  doc(path: string): ClaudeDbDoc;
}

export interface ClaudeUser {
  id(): Promise<string | null>;
}

export interface ClaudeDownloads {
  save(request: { filename: string; data: string | Blob }): Promise<{ status: string }>;
}

interface ClaudeCapabilities {
  db: ClaudeDb;
  user: ClaudeUser;
  downloads: ClaudeDownloads;
}

export interface ClaudeRuntime {
  use<K extends keyof ClaudeCapabilities>(name: K): Promise<ClaudeCapabilities[K] | null>;
}

declare global {
  interface Window {
    claude?: ClaudeRuntime;
  }
}
