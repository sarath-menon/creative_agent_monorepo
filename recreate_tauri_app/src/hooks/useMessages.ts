import { useMutation } from '@tanstack/react-query';

interface SendMessageParams {
  content: string;
  sessionId: string;
}

interface MessageResponse {
  response: string;
}

const sendMessage = async (params: SendMessageParams): Promise<MessageResponse> => {
  const response = await fetch('http://localhost:8088/rpc', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      method: 'messages.send',
      params,
      id: 1
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  const assistantResponse = data.result?.response || 'No response from server';

  return { response: assistantResponse };
};

export const useSendMessage = () => {
  return useMutation({
    mutationFn: sendMessage,
  });
};