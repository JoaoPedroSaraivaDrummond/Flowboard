import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/query-keys';

export function useCardDetail(boardId: string, cardId: string) {
  return useQuery({
    queryKey: queryKeys.card(boardId, cardId),
    queryFn: () => api.getCard(cardId),
  });
}

export function useCardActivity(boardId: string, cardId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.cardActivity(boardId, cardId),
    queryFn: ({ pageParam }) => api.cardActivity(cardId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useUsers() {
  return useQuery({ queryKey: queryKeys.users, queryFn: api.users, staleTime: 60_000 });
}
