import { badRequest } from '../errors.js';
import { planInsertion } from '../lib/position.js';
import type { MoveTarget } from '../schemas/common.js';

export type Positioned = { id: string; position: number };

export function resolveTargetIndex(siblings: Positioned[], target: MoveTarget): number {
  if (target.beforeId !== undefined || target.afterId !== undefined) {
    const referenceId = (target.beforeId ?? target.afterId)!;
    const referenceIndex = siblings.findIndex((sibling) => sibling.id === referenceId);
    if (referenceIndex === -1) {
      throw badRequest(
        `Reference item ${referenceId} is not an active sibling in the target container`,
        'INVALID_MOVE_TARGET',
      );
    }
    return target.beforeId !== undefined ? referenceIndex : referenceIndex + 1;
  }
  return Math.min(target.index ?? siblings.length, siblings.length);
}

/**
 * Computes the position for an item placed at `target` among `siblings` (sorted, excluding the
 * item itself). When the gap is too small it rebalances all siblings through `updatePosition`.
 */
export async function placeAmongSiblings(
  siblings: Positioned[],
  target: MoveTarget,
  updatePosition: (id: string, position: number) => Promise<unknown>,
): Promise<{ position: number; index: number; rebalanced: boolean }> {
  const index = resolveTargetIndex(siblings, target);
  const plan = planInsertion(
    siblings.map((sibling) => sibling.position),
    index,
  );
  if (plan.rebalanced) {
    for (const [i, sibling] of siblings.entries()) {
      await updatePosition(sibling.id, plan.rebalanced[i]!);
    }
  }
  return { position: plan.position, index, rebalanced: plan.rebalanced !== null };
}

export const byPosition = [{ position: 'asc' as const }, { id: 'asc' as const }];
