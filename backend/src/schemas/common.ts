import { z } from 'zod';

export const idParams = z.object({ id: z.uuid() });

/**
 * Target position for a move. Use at most one of:
 * - `beforeId`: place right before this sibling
 * - `afterId`: place right after this sibling
 * - `index`: zero-based index among the (non-archived) siblings
 * With none of them, the item goes to the end.
 */
export const moveTargetSchema = z
  .object({
    beforeId: z.uuid().optional(),
    afterId: z.uuid().optional(),
    index: z.number().int().min(0).optional(),
  })
  .refine(
    (target) =>
      [target.beforeId, target.afterId, target.index].filter((value) => value !== undefined)
        .length <= 1,
    { message: 'Use at most one of beforeId, afterId or index' },
  );

export type MoveTarget = z.infer<typeof moveTargetSchema>;

export const archivedQuery = z.object({
  includeArchived: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  type: true,
  createdAt: true,
} as const;

export const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid().optional().describe('`nextCursor` from the previous page'),
});
