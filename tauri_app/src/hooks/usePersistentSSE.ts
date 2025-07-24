import { useState, useEffect, useRef, useCallback } from 'react';

export type SSEToolCall = {
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  parameters: Record<string, unknown>;
  result?: string;
  error?: string;
  id: string;
};

export type PersistentSSEState = {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  toolCalls: SSEToolCall[];
  finalContent: string | null;
  completed: boolean;
  processing: boolean; // True when processing a message
  isPaused: boolean; // True when session is paused
};

export type PersistentSSEHook = PersistentSSEState & {
  sendMessage: (content: string) => Promise<void>;
  pauseMessage: () => Promise<void>;
  resumeMessage: () => Promise<void>;
};

export function usePersistentSSE(sessionId: string): PersistentSSEHook {
  const [state, setState] = useState<PersistentSSEState>({
    connected: false,
    connecting: false,
    error: null,
    toolCalls: [],
    finalContent: null,
    completed: false,
    processing: false,
    isPaused: false,
  });
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const toolCallsRef = useRef<Map<string, SSEToolCall>>(new Map());
  const currentSessionRef = useRef<string>('');
  const connectedRef = useRef<boolean>(false);

  // Establish persistent connection when sessionId changes
  useEffect(() => {
    if (!sessionId || sessionId === currentSessionRef.current) return;

    console.log('Setting up persistent SSE for session:', sessionId);
    
    // Clean up previous connection
    if (eventSourceRef.current) {
      console.log('Closing previous SSE connection');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // Reset state for new session
    setState({
      connected: false,
      connecting: true,
      error: null,
      toolCalls: [],
      finalContent: null,
      completed: false,
      processing: false,
      isPaused: false,
    });
    
    toolCallsRef.current.clear();
    currentSessionRef.current = sessionId;

    const url = `http://localhost:8088/stream?sessionId=${encodeURIComponent(sessionId)}`;
    console.log('Connecting persistent SSE to:', url);
    
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('connected', (event) => {
      console.log('Persistent SSE connected event:', event.data);
      setState(prev => ({ ...prev, connected: true, connecting: false }));
    });

    eventSource.addEventListener('tool', (event) => {
      console.log('Persistent SSE tool event:', event.data);
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
          description: data.description || data.name || 'Tool execution',
          status: data.status || 'pending',
          parameters,
          result: data.result,
          error: data.error,
        };

        toolCallsRef.current.set(toolCall.id, toolCall);
        
        setState(prev => ({
          ...prev,
          toolCalls: Array.from(toolCallsRef.current.values()),
          processing: true, // Mark as processing when tools are running
        }));
      } catch (err) {
        console.error('Failed to parse tool event:', err, event.data);
      }
    });

    eventSource.addEventListener('complete', (event) => {
      try {
        const data = JSON.parse(event.data);
        setState(prev => ({
          ...prev,
          finalContent: data.content || '',
          completed: true,
          processing: false, // Message processing complete
          isPaused: false, // Clear pause state on completion
        }));
      } catch (err) {
        console.error('Failed to parse complete event:', err, event.data);
        setState(prev => ({ ...prev, processing: false, isPaused: false }));
      }
    });

    eventSource.addEventListener('error', (event) => {
      console.log('Persistent SSE error event (from backend):', event);
      // Backend-sent error events have JSON data
      if (event.data) {
        try {
          const data = JSON.parse(event.data);
          const errorMsg = data.error || 'Stream error';
          setState(prev => ({ 
            ...prev, 
            error: errorMsg, 
            connecting: false,
            processing: false 
          }));
        } catch (err) {
          console.error('Failed to parse backend error event:', err, event.data);
          setState(prev => ({ 
            ...prev, 
            error: 'Stream error', 
            connecting: false,
            processing: false 
          }));
        }
      }
    });

    eventSource.onerror = (event) => {
      console.log('Persistent SSE connection state change:', event);
      
      // For persistent connections, we want to be more resilient to temporary drops
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log('Persistent SSE connection closed, will attempt to reconnect');
        setState(prev => ({ 
          ...prev, 
          connected: false,
          connecting: true // Try to reconnect
        }));
      } else if (eventSource.readyState === EventSource.CONNECTING) {
        console.log('Persistent SSE reconnecting...');
        setState(prev => ({ 
          ...prev, 
          connected: false,
          connecting: true,
          error: null // Clear any previous errors
        }));
      }
    };

    // Cleanup function
    return () => {
      console.log('Cleaning up persistent SSE connection');
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      currentSessionRef.current = '';
    };
  }, [sessionId]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      console.log('Component unmounting - cleaning up persistent SSE connection');
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      currentSessionRef.current = '';
    };
  }, []);

  // Update connectedRef when state.connected changes
  useEffect(() => {
    connectedRef.current = state.connected;
  }, [state.connected]);

  // Function to send messages via POST to message queue
  const sendMessage = useCallback(async (content: string) => {
    if (!sessionId || !connectedRef.current) {
      throw new Error('No active SSE connection');
    }


    // Reset state for new message
    setState(prev => ({
      ...prev,
      error: null,
      toolCalls: [],
      finalContent: null,
      completed: false,
      processing: true, // Mark as processing when sending message
      isPaused: false, // Clear pause state when sending new message
    }));
    
    toolCallsRef.current.clear();

    try {
      const response = await fetch(`http://localhost:8088/stream/${encodeURIComponent(sessionId)}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to queue message: ${response.status} ${errorText}`);
      }

      const result = await response.json();
    } catch (error) {
      console.error('Failed to send message:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to send message',
        processing: false,
      }));
      throw error;
    }
  }, [sessionId]);

  // Function to pause message processing
  const pauseMessage = useCallback(async () => {
    if (!sessionId || !connectedRef.current) {
      throw new Error('No active SSE connection');
    }

    try {
      const response = await fetch(`http://localhost:8088/stream/${encodeURIComponent(sessionId)}/pause`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to pause session: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      console.log('Session paused:', result);
      
      setState(prev => ({
        ...prev,
        isPaused: true,
      }));
    } catch (error) {
      console.error('Failed to pause session:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to pause session',
      }));
      throw error;
    }
  }, [sessionId]);

  // Function to resume message processing
  const resumeMessage = useCallback(async () => {
    if (!sessionId || !connectedRef.current) {
      throw new Error('No active SSE connection');
    }

    try {
      const response = await fetch(`http://localhost:8088/stream/${encodeURIComponent(sessionId)}/resume`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to resume session: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      console.log('Session resumed:', result);
      
      setState(prev => ({
        ...prev,
        isPaused: false,
      }));
    } catch (error) {
      console.error('Failed to resume session:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to resume session',
      }));
      throw error;
    }
  }, [sessionId]);

  return {
    ...state,
    sendMessage,
    pauseMessage,
    resumeMessage,
  };
}