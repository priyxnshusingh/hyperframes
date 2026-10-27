export type PersonId = string;

export interface Person {
  /** Stable unique ID — connections reference this, never the name. */
  id: PersonId;
  name: string;
  /** Annual CTC in whole currency units (rupees for INR). `null` = not added. */
  ctc: number | null;
  /** Category id (see `Category`). */
  category: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

/** Undirected connection between two people. `a`/`b` are stored sorted. */
export interface Connection {
  id: string;
  a: PersonId;
  b: PersonId;
  createdAt: number;
}

export interface Category {
  id: string;
  label: string;
  color: string;
  builtIn: boolean;
}

export interface NetworkData {
  meId: PersonId;
  people: Record<PersonId, Person>;
  connections: Record<string, Connection>;
  categories: Category[];
}

export interface Position {
  x: number;
  y: number;
}

export type Positions = Record<PersonId, Position>;

export type LayoutName = "force" | "radial" | "hierarchical" | "circle";
export type ColorBy = "category" | "level";
export type CurrencyCode = "INR" | "USD" | "EUR" | "GBP";

export interface Settings {
  showCtc: boolean;
  layout: LayoutName;
  colorBy: ColorBy;
  currency: CurrencyCode;
  keepMeCentered: boolean;
  sampleBannerDismissed: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  showCtc: true,
  layout: "force",
  colorBy: "category",
  currency: "INR",
  keepMeCentered: true,
  sampleBannerDismissed: false,
};

export const ME_CATEGORY = "me";

export const BUILT_IN_CATEGORIES: Category[] = [
  { id: "core", label: "Core friend", color: "#3b82f6", builtIn: true },
  { id: "fof", label: "Friend of a friend", color: "#14b8a6", builtIn: true },
  { id: "professional", label: "Professional contact", color: "#8b5cf6", builtIn: true },
  { id: "family", label: "Family", color: "#ec4899", builtIn: true },
  { id: "other", label: "Other", color: "#64748b", builtIn: true },
];

/** Palette used for new custom categories, cycled in order. */
export const CUSTOM_CATEGORY_COLORS = [
  "#f97316",
  "#22c55e",
  "#e11d48",
  "#0ea5e9",
  "#a855f7",
  "#84cc16",
  "#d946ef",
  "#06b6d4",
  "#eab308",
  "#ef4444",
];

export const ME_COLOR = "#f59e0b";
