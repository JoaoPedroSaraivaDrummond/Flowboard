import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from '../lib/api';
import { indexFromTarget, moveCardInLists, moveListInLists, withLists } from '../lib/board-ops';
import { queryKeys } from '../lib/query-keys';
import { useToast } from '../lib/toast';
import type { BoardDetail, MoveTarget } from '../lib/types';

export function useBoardDetail(boardId: string) {
  return useQuery({
    queryKey: queryKeys.boardDetail(boardId),
    queryFn: () => api.getBoard(boardId),
  });
}

/**
 * Mutation scoped to a board: errors become a toast and everything under the board is refetched
 * when it settles. The mutation key lets polling skip refreshes while it's in flight.
 */
export function useBoardMutation<TVariables, TResult>(
  boardId: string,
  mutationFn: (variables: TVariables) => Promise<TResult>,
  errorMessage = 'Não foi possível salvar a alteração',
) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationKey: queryKeys.board(boardId),
    mutationFn,
    onError: (error) => toast.error(`${errorMessage}: ${error.message}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) }),
  });
}

type OptimisticMove<TVariables> = TVariables & { previous: BoardDetail };

/**
 * Applies `optimistic` to the cached board synchronously, then calls the API; on failure the
 * snapshot is restored. Only refetches once no other board mutation is pending, so back-to-back
 * drags don't flicker.
 */
function useOptimisticBoardMove<TVariables>(
  boardId: string,
  mutationFn: (variables: TVariables) => Promise<unknown>,
  optimistic: (board: BoardDetail, variables: TVariables) => BoardDetail,
  errorMessage: string,
) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const mutation = useMutation({
    mutationKey: [...queryKeys.board(boardId), 'move'],
    mutationFn: (variables: OptimisticMove<TVariables>) => mutationFn(variables),
    onError: (error, variables) => {
      queryClient.setQueryData(queryKeys.boardDetail(boardId), variables.previous);
      toast.error(`${errorMessage}: ${error.message}`);
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: queryKeys.board(boardId) }) <= 1) {
        return queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) });
      }
    },
  });

  const { mutate } = mutation;
  return useCallback(
    (variables: TVariables) => {
      const detailKey = queryKeys.boardDetail(boardId);
      const previous = queryClient.getQueryData<BoardDetail>(detailKey);
      if (!previous) return;
      void queryClient.cancelQueries({ queryKey: detailKey });
      queryClient.setQueryData(detailKey, optimistic(previous, variables));
      mutate({ ...variables, previous });
    },
    [boardId, mutate, optimistic, queryClient],
  );
}

export type CardMove = { cardId: string; listId: string; index: number; target: MoveTarget };
export type ListMove = { listId: string; index: number; target: MoveTarget };

const applyCardMove = (board: BoardDetail, move: CardMove) => {
  const destination = board.lists.find((list) => list.id === move.listId);
  const index = destination
    ? indexFromTarget(destination.cards, move.target, move.cardId)
    : move.index;
  return withLists(board, moveCardInLists(board.lists, move.cardId, move.listId, index));
};
const applyListMove = (board: BoardDetail, move: ListMove) =>
  withLists(board, moveListInLists(board.lists, move.listId, move.index));
const moveCardRequest = (move: CardMove) => api.moveCard(move.cardId, move.listId, move.target);
const moveListRequest = (move: ListMove) => api.moveList(move.listId, move.target);

export function useMoveCard(boardId: string) {
  return useOptimisticBoardMove(
    boardId,
    moveCardRequest,
    applyCardMove,
    'Não foi possível mover o card',
  );
}

export function useMoveList(boardId: string) {
  return useOptimisticBoardMove(
    boardId,
    moveListRequest,
    applyListMove,
    'Não foi possível mover a lista',
  );
}
