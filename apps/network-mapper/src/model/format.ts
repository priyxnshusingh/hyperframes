import type { CurrencyCode } from "./types";

export interface CtcUnit {
  id: string;
  label: string;
  multiplier: number;
}

const SYMBOLS: Record<CurrencyCode, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };

export const CURRENCIES: { code: CurrencyCode; label: string }[] = [
  { code: "INR", label: "₹ INR (lakh / crore)" },
  { code: "USD", label: "$ USD" },
  { code: "EUR", label: "€ EUR" },
  { code: "GBP", label: "£ GBP" },
];

/** Units offered in CTC inputs. The first entry is the default. */
export function ctcUnits(currency: CurrencyCode): CtcUnit[] {
  if (currency === "INR") {
    return [
      { id: "lpa", label: "LPA", multiplier: 1e5 },
      { id: "cr", label: "Cr", multiplier: 1e7 },
      { id: "full", label: "₹", multiplier: 1 },
    ];
  }
  const s = SYMBOLS[currency];
  return [
    { id: "k", label: `${s}K`, multiplier: 1e3 },
    { id: "full", label: s, multiplier: 1 },
  ];
}

/** Unit used for CTC range filters (LPA for INR, thousands otherwise). */
export function filterUnit(currency: CurrencyCode): CtcUnit {
  return ctcUnits(currency)[0]!;
}

function trimNumber(n: number, maxDecimals: number): string {
  return Number(n.toFixed(maxDecimals)).toString();
}

/** Compact label, e.g. "₹18 LPA", "₹1.25 Cr", "$120K". */
export function formatCtc(value: number | null, currency: CurrencyCode): string {
  if (value === null || !Number.isFinite(value)) return "CTC not added";
  const s = SYMBOLS[currency];
  if (currency === "INR") {
    if (value >= 1e7) return `₹${trimNumber(value / 1e7, 2)} Cr`;
    if (value >= 1e5) return `₹${trimNumber(value / 1e5, 2)} LPA`;
    return `₹${Math.round(value).toLocaleString("en-IN")}`;
  }
  if (value >= 1e6) return `${s}${trimNumber(value / 1e6, 2)}M`;
  if (value >= 1e3) return `${s}${trimNumber(value / 1e3, 1)}K`;
  return `${s}${Math.round(value).toLocaleString("en-US")}`;
}

/** Full grouped amount, e.g. "₹18,00,000". */
export function formatCtcFull(value: number | null, currency: CurrencyCode): string {
  if (value === null || !Number.isFinite(value)) return "CTC not added";
  const locale = currency === "INR" ? "en-IN" : "en-US";
  return `${SYMBOLS[currency]}${Math.round(value).toLocaleString(locale)}`;
}

/**
 * Parse a CTC input. Empty → null (not added). Returns `undefined` for invalid input.
 * Accepts commas and underscores as separators.
 */
export function parseCtcInput(raw: string, multiplier: number): number | null | undefined {
  const cleaned = raw.replace(/[,_\s₹$€£]/g, "");
  if (cleaned === "") return null;
  if (!/^\d*\.?\d+$/.test(cleaned)) return undefined;
  const n = Number(cleaned) * multiplier;
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n);
}

/** Best unit + string to pre-fill an input with an existing value. */
export function ctcToInput(
  value: number | null,
  currency: CurrencyCode,
): { text: string; unitId: string } {
  const units = ctcUnits(currency);
  const def = units[0]!;
  if (value === null) return { text: "", unitId: def.id };
  // The default unit's divisor is ≤ 1e5, so 5 decimals round-trips to the exact amount.
  if (value >= def.multiplier)
    return { text: trimNumber(value / def.multiplier, 5), unitId: def.id };
  return { text: String(value), unitId: units[units.length - 1]!.id };
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}
