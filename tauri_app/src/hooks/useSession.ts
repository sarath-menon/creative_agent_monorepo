import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { rpcCall } from '@/lib/rpc';

interface CreateSessionParams {
  title: string;
}

interface Session {
  id: string;
}

const createSession = async (params: CreateSessionParams): Promise<Session> => {
  const result = await rpcCall<any>('sessions.create', params);
  const sessionId = result?.id || result;

  if (!sessionId) {
    throw new Error('No session ID returned from server');
  }

  return { id: sessionId };
};

export const useCreateSession = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSession,
    onSuccess: (data) => {
      queryClient.setQueryData(['session'], data);
    },
  });
};

export const useSession = () => {
  return useQuery({
    queryKey: ['session'],
    queryFn: () => createSession({ title: "Chat Session" }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
};