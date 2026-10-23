/**
 * Fractional ordering: each item has a float `position`; inserting between two neighbours uses
 * their midpoint, so only the moved item is written. Repeated midpoint inserts halve the gap each
 * time, so when it gets too small the whole sibling list is rebalanced to evenly spaced values.
 */

export const POSITION_STEP = 1024;
export const MIN_POSITION_GAP = 1e-6;

/** Position strictly between `prev` and `next` (either may be missing = list edge). */
export function positionBetween(prev: number | undefined, next: number | undefined): number {
  if (prev === undefined && next === undefined) return POSITION_STEP;
  if (next === undefined) return prev! + POSITION_STEP;
  return ((prev ?? 0) + next) / 2;
}

/** Evenly spaced positions for `count` items: STEP, 2*STEP, ... */
export function rebalancedPositions(count: number): number[] {
  return Array.from({ length: count }, (_, index) => (index + 1) * POSITION_STEP);
}

export type InsertionPlan = {
  position: number;
  /** New positions for every sibling (same order) when a rebalance is needed, otherwise null. */
  rebalanced: number[] | null;
};

/**
 * Plans inserting an item at `index` among `siblings` (positions sorted ascending, the item being
 * moved excluded). Rebalances when the gap around the insertion point is below MIN_POSITION_GAP.
 */
export function planInsertion(siblings: number[], index: number): InsertionPlan {
  const target = Math.max(0, Math.min(index, siblings.length));
  const prev = siblings[target - 1];
  const next = siblings[target];

  if (next !== undefined && next - (prev ?? 0) < MIN_POSITION_GAP) {
    const rebalanced = rebalancedPositions(siblings.length);
    return { position: positionBetween(rebalanced[target - 1], rebalanced[target]), rebalanced };
  }
  return { position: positionBetween(prev, next), rebalanced: null };
}
