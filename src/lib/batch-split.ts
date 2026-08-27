import { VEHICLE_CLASSES } from "@/lib/vehicle-classes";

export const MAX_LOAD_TONS = Math.max(...VEHICLE_CLASSES.map((v) => v.capacity));

/** Domyślna propozycja podziału: pełne kursy + reszta. */
export function suggestSplit(total: number, max = MAX_LOAD_TONS): number[] {
  const t = Math.round(Number(total) * 1000) / 1000;
  if (!Number.isFinite(t) || t <= 0) return [];
  if (t <= max) return [t];
  const full = Math.floor(t / max);
  const rest = Math.round((t - full * max) * 1000) / 1000;
  const parts = Array.from({ length: full }, () => max);
  if (rest > 0.001) parts.push(rest);
  return parts;
}

export function batchLabel(leadNumber: string | null | undefined, batchNo: number) {
  return `${leadNumber ?? "Lead"}/${batchNo}`;
}
