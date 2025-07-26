import { useCallback, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';

interface MessageHistoryItem {
  id: string;
  role: string;
  content: string;
  sessionId: string;
}

interface UseMessageHistoryOptions {
  sessionId: string;
  batchSize?: number;
}

interface UseMessageHistoryReturn {
  allHistory: MessageHistoryItem[];
  isLoading: boolean;
  error: string | null;
  loadInitialHistory: () => Promise<void>;
  loadMoreHistory: () => Promise<void>;
  getAllHistoryTexts: () => string[];
  hasMoreHistory: boolean;
}

const fetchMessages = async (method: string, params: any): Promise<MessageHistoryItem[]> => {
  const response = await fetch('http://localhost:8088/rpc', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      method,
      params,
      id: 1,
    }),
  });

  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.error.message);
  }

  return (data.result || []).map((msg: any) => ({
    id: msg.id,
    role: msg.role,
    content: JSON.parse(msg.content).text,
    sessionId: msg.sessionId,
  }));
};

export function useMessageHistory({ 
  sessionId, 
  batchSize = 50 
}: UseMessageHistoryOptions): UseMessageHistoryReturn {
  
  const currentSessionQuery = useInfiniteQuery({
    queryKey: ['messageHistory', 'current', sessionId],
    enabled: !!sessionId,
    queryFn: ({ pageParam = 0 }) => {
      return fetchMessages('messages.history', {
        sessionId,
        limit: Math.ceil(batchSize / 2),
        offset: pageParam,
      });
    },
    getNextPageParam: (lastPage, pages) => {
      const totalLoaded = pages.flat().length;
      return lastPage.length === Math.ceil(batchSize / 2) ? totalLoaded : undefined;
    },
    initialPageParam: 0,
  });

  const crossSessionQuery = useInfiniteQuery({
    queryKey: ['messageHistory', 'cross', sessionId],
    enabled: !!sessionId,
    queryFn: ({ pageParam = 0 }) => {
      return fetchMessages('messages.cross-session-history', {
        excludeSessionId: sessionId,
        limit: Math.ceil(batchSize / 2),
        offset: pageParam,
      });
    },
    getNextPageParam: (lastPage, pages) => {
      const totalLoaded = pages.flat().length;
      return lastPage.length === Math.ceil(batchSize / 2) ? totalLoaded : undefined;
    },
    initialPageParam: 0,
  });

  const allHistory = useMemo(() => {
    const currentMessages = currentSessionQuery.data?.pages.flat() || [];
    const crossMessages = crossSessionQuery.data?.pages.flat() || [];
    return [...currentMessages, ...crossMessages];
  }, [currentSessionQuery.data, crossSessionQuery.data]);

  const isLoading = currentSessionQuery.isLoading || crossSessionQuery.isLoading;
  const error = currentSessionQuery.error?.message || crossSessionQuery.error?.message || null;
  const hasMoreHistory = currentSessionQuery.hasNextPage || crossSessionQuery.hasNextPage;


  const loadInitialHistory = useCallback(async () => {
    if (!sessionId) return;
    await Promise.all([
      currentSessionQuery.refetch(),
      crossSessionQuery.refetch(),
    ]);
  }, [sessionId, currentSessionQuery.refetch, crossSessionQuery.refetch]);

  const loadMoreHistory = useCallback(async () => {
    if (!sessionId || (!currentSessionQuery.hasNextPage && !crossSessionQuery.hasNextPage)) return;
    
    const promises: Promise<any>[] = [];
    if (currentSessionQuery.hasNextPage) {
      promises.push(currentSessionQuery.fetchNextPage());
    }
    if (crossSessionQuery.hasNextPage) {
      promises.push(crossSessionQuery.fetchNextPage());
    }
    
    await Promise.all(promises);
  }, [sessionId, currentSessionQuery, crossSessionQuery]);

  const getAllHistoryTexts = useCallback(() => {
    return allHistory.map(msg => msg.content);
  }, [allHistory]);

  return {
    allHistory,
    isLoading,
    error,
    loadInitialHistory,
    loadMoreHistory,
    getAllHistoryTexts,
    hasMoreHistory,
  };
}