import { describe, expect, it } from 'vitest';
import {
  MIN_POSITION_GAP,
  POSITION_STEP,
  planInsertion,
  positionBetween,
  rebalancedPositions,
} from '../src/lib/position.js';

describe('positionBetween', () => {
  it('uses the step for an empty container', () => {
    expect(positionBetween(undefined, undefined)).toBe(POSITION_STEP);
  });

  it('appends one step after the last item', () => {
    expect(positionBetween(2048, undefined)).toBe(2048 + POSITION_STEP);
  });

  it('uses the midpoint between neighbours (and between 0 and the first item)', () => {
    expect(positionBetween(1024, 2048)).toBe(1536);
    expect(positionBetween(undefined, 1024)).toBe(512);
  });
});

describe('planInsertion', () => {
  it('inserts without rebalancing when there is room', () => {
    expect(planInsertion([1024, 2048, 3072], 1)).toEqual({ position: 1536, rebalanced: null });
    expect(planInsertion([1024, 2048], 2)).toEqual({ position: 3072, rebalanced: null });
    expect(planInsertion([1024], 0)).toEqual({ position: 512, rebalanced: null });
  });

  it('clamps an out-of-range index to the end', () => {
    expect(planInsertion([1024], 10).position).toBe(2048);
  });

  it('rebalances all siblings when the gap is too small', () => {
    const siblings = [1024, 1024 + MIN_POSITION_GAP / 2, 4096];
    const plan = planInsertion(siblings, 1);
    expect(plan.rebalanced).toEqual(rebalancedPositions(3));
    expect(plan.position).toBe((1024 + 2048) / 2);
  });

  it('survives many consecutive inserts at the same spot by rebalancing', () => {
    let positions = [1024, 2048];
    let rebalances = 0;
    for (let i = 0; i < 200; i += 1) {
      const plan = planInsertion(positions, 1);
      if (plan.rebalanced) {
        rebalances += 1;
        positions = plan.rebalanced;
      }
      positions = [positions[0]!, plan.position, ...positions.slice(1)];
      for (let j = 1; j < positions.length; j += 1) {
        expect(positions[j]!).toBeGreaterThan(positions[j - 1]!);
      }
    }
    expect(rebalances).toBeGreaterThan(0);
  });
});
