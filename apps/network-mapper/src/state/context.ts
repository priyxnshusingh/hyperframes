import { createContext, useContext } from "react";
import type { Adjacency } from "../model/graph";
import type { NetworkAction, NewPersonInput } from "../model/network";
import type { Category, NetworkData, Person, PersonId, Settings } from "../model/types";

export interface AppActions {
  dispatch(action: NetworkAction): void;
  /** Adds a person and returns their new id. */
  addPerson(input: NewPersonInput, connectTo: PersonId[]): PersonId;
  connect(a: PersonId, b: PersonId): void;
  removeConnection(id: string): void;
  select(id: PersonId | null, opts?: { focus?: boolean }): void;
  selectEdge(id: string | null): void;
  startConnect(id: PersonId): void;
  requestDelete(id: PersonId): void;
  showPath(from: PersonId, to: PersonId): void;
  openAddForm(connectTo?: PersonId[]): void;
  toast(message: string, undo?: boolean): void;
}

export interface AppContextValue {
  data: NetworkData;
  adj: Adjacency;
  levels: Map<PersonId, number>;
  settings: Settings;
  people: Person[];
  category(id: string): Category | undefined;
  /** Short "Level 2 · ₹18 LPA" description used in pickers and lists. */
  describe(p: Person): string;
  actions: AppActions;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const v = useContext(AppContext);
  if (!v) throw new Error("useApp must be used inside AppContext");
  return v;
}

export function levelText(level: number | undefined, isMe = false): string {
  if (isMe) return "You";
  if (level === undefined) return "Not connected";
  return level === 1 ? "Level 1 · direct" : `Level ${level}`;
}
