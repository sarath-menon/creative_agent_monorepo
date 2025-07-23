import { useState, useEffect, useRef } from 'react';

export type SSEToolCall = {
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  parameters: Record<string, unknown>;
  result?: string;
  error?: string;
  id: string;
};

export type SSEStreamState = {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  toolCalls: SSEToolCall[];
  finalContent: string | null;
  completed: boolean;
};

export function useSSEStream(sessionId: string, content: string) {
  const [state, setState] = useState<SSEStreamState>({
    connected: false,
    connecting: false,
    error: null,
    toolCalls: [],
    finalContent: null,
    completed: false,
  });
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const toolCallsRef = useRef<Map<string, SSEToolCall>>(new Map());
  const completedRef = useRef<boolean>(false);

  // Auto-connect when sessionId and content change
  useEffect(() => {
    if (!sessionId || !content) return;

    // Clean up previous connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // Reset state for new connection
    setState({
      connected: false,
      connecting: true,
      error: null,
      toolCalls: [],
      finalContent: null,
      completed: false,
    });
    
    toolCallsRef.current.clear();
    completedRef.current = false;

    const url = `http://localhost:8088/stream?sessionId=${encodeURIComponent(sessionId)}&content=${encodeURIComponent(content)}`;
    console.log('Connecting SSE to:', url);
    
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('connected', (event) => {
      console.log('SSE connected event:', event.data);
      setState(prev => ({ ...prev, connected: true, connecting: false }));
    });

    eventSource.addEventListener('tool', (event) => {
      console.log('SSE tool event:', event.data);
      try {
        const data = JSON.parse(event.data);
        
        // Parse tool input if it's a JSON string
        let parameters = {};
        if (data.input) {
          try {
            parameters = JSON.parse(data.input);
          } catch {
            parameters = { input: data.input };
          }
        }
        
        const toolCall: SSEToolCall = {
          id: data.id || `${data.name}-${Date.now()}`,
          name: data.name || 'unknown',
          description: data.description || data.name || 'Tool execution', // Use name as fallback
          status: data.status || 'pending',
          parameters,
          result: data.result,
          error: data.error,
        };

        toolCallsRef.current.set(toolCall.id, toolCall);
        
        setState(prev => ({
          ...prev,
          toolCalls: Array.from(toolCallsRef.current.values()),
        }));
      } catch (err) {
        console.error('Failed to parse tool event:', err, event.data);
      }
    });

    eventSource.addEventListener('complete', (event) => {
      console.log('SSE complete event:', event.data);
      try {
        const data = JSON.parse(event.data);
        completedRef.current = true;
        setState(prev => ({
          ...prev,
          finalContent: data.content || '',
          completed: true,
          connecting: false,
        }));
      } catch (err) {
        console.error('Failed to parse complete event:', err, event.data);
      }
    });

    eventSource.addEventListener('error', (event) => {
      console.log('SSE error event (from backend):', event);
      // Backend-sent error events have JSON data
      if (event.data) {
        try {
          const data = JSON.parse(event.data);
          const errorMsg = data.error || 'Stream error';
          setState(prev => ({ ...prev, error: errorMsg, connecting: false }));
        } catch (err) {
          console.error('Failed to parse backend error event:', err, event.data);
          setState(prev => ({ ...prev, error: 'Stream error', connecting: false }));
        }
      }
    });

    eventSource.onerror = (event) => {
      console.log('SSE connection state change:', event);
      // Don't treat connection closure after completion as an error
      if (completedRef.current) {
        console.log('Connection closed after completion - this is normal');
        return;
      }
      
      // Only set error state for actual connection failures
      console.error('SSE connection error before completion:', event);
      setState(prev => ({ ...prev, error: 'Connection lost', connecting: false }));
    };

    // Cleanup function
    return () => {
      console.log('Cleaning up SSE connection');
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [sessionId, content]);

  return state;
}