import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface CreateSessionParams {
  title: string;
}

interface Session {
  id: string;
}

const createSession = async (params: CreateSessionParams): Promise<Session> => {
  const response = await fetch('http://localhost:8088/rpc', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      method: 'sessions.create',
      params,
      id: 1
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  const sessionId = data.result?.id || data.result;

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