import {
  AIInput,
  AIInputButton,
  AIInputModelSelect,
  AIInputModelSelectContent,
  AIInputModelSelectItem,
  AIInputModelSelectTrigger,
  AIInputModelSelectValue,
  AIInputSubmit,
  AIInputTextarea,
  AIInputToolbar,
  AIInputTools,
} from '@/components/ui/kibo-ui/ai/input';
import {
  AIConversation,
  AIConversationContent,
  AIConversationScrollButton,
} from '@/components/ui/kibo-ui/ai/conversation';
import { AIMessage, AIMessageContent } from '@/components/ui/kibo-ui/ai/message';
import { AIResponse } from '@/components/ui/kibo-ui/ai/response';
import {
  AITool,
  AIToolContent,
  AIToolHeader,
  AIToolParameters,
  AIToolResult,
  type AIToolStatus,
} from '@/components/ui/kibo-ui/ai/tool';
import { GlobeIcon, MicIcon, PlusIcon, Play, Square, Command, HelpCircle } from 'lucide-react';
import { type FormEventHandler, useState, useEffect, useRef } from 'react';

import { useSession } from '@/hooks/useSession';
import { useSendMessage } from '@/hooks/useMessages';
import { usePersistentSSE } from '@/hooks/usePersistentSSE';
import { LoadingDots } from './loading-dots';


const models = [
  { id: 'gpt-4', name: 'GPT-4' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
];

const slashCommands = [
  { id: 'help', name: 'help', description: 'Get assistance and guidance', icon: HelpCircle },
  { id: 'mcp', name: 'mcp', description: 'Model Context Protocol', icon: Command },
  { id: 'session', name: 'session', description: 'User Session Management', icon: Command },
];

type ToolCall = {
  name: string;
  description: string;
  status: AIToolStatus;
  parameters: Record<string, unknown>;
  result?: string;
  error?: string;
};

type Message = {
  content: string;
  from: 'user' | 'assistant';
  toolCalls?: ToolCall[];
};

export function ChatApp() {
  const [text, setText] = useState<string>('');
  const [model, setModel] = useState<string>(models[0].id);
  const [messages, setMessages] = useState<Message[]>([]);
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [inputElement, setInputElement] = useState<HTMLTextAreaElement | null>(null);

  const { data: session, isLoading: sessionLoading, error: sessionError } = useSession();
  const sendMessage = useSendMessage();
  const sseStream = usePersistentSSE(session?.id || '');

  const handleTextChange = (value: string) => {
    setText(value);
    
    // Check if user typed "/" at the beginning of the input
    if (value === '/' || (value.startsWith('/') && !value.includes(' '))) {
      setShowSlashCommands(true);
      setSelectedCommandIndex(0);
    } else {
      setShowSlashCommands(false);
    }
  };

  const handleSlashCommandSelect = (command: typeof slashCommands[0]) => {
    const commandText = `/${command.name} `;
    setText(commandText);
    setShowSlashCommands(false);
    inputElement?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle Cmd+Enter for form submission (fallback)
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const form = e.currentTarget.form;
      if (form) {
        form.requestSubmit();
      }
      return;
    }

    // Handle slash command navigation only when dropdown is visible
    if (showSlashCommands) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedCommandIndex((prev) => 
            prev < slashCommands.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedCommandIndex((prev) => 
            prev > 0 ? prev - 1 : slashCommands.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          handleSlashCommandSelect(slashCommands[selectedCommandIndex]);
          break;
        case 'Escape':
          e.preventDefault();
          setShowSlashCommands(false);
          break;
      }
    }
  };

  // Handle completion of streaming
  useEffect(() => {
    if (sseStream.completed && sseStream.finalContent && !sseStream.processing) {
      // Convert SSE tool calls to our Message format
      const convertedToolCalls: ToolCall[] = sseStream.toolCalls.map(tc => ({
        name: tc.name,
        description: tc.description,
        status: tc.status as AIToolStatus,
        parameters: tc.parameters,
        result: tc.result,
        error: tc.error,
      }));
      
      setMessages(prev => [...prev, { 
        content: sseStream.finalContent!, 
        from: 'assistant',
        toolCalls: convertedToolCalls.length > 0 ? convertedToolCalls : undefined
      }]);
    }
  }, [sseStream.completed, sseStream.finalContent, sseStream.processing]);

  // Handle streaming errors
  useEffect(() => {
    if (sseStream.error) {
      const errorMessage = `Failed to send prompt: ${sseStream.error}`;
      setMessages(prev => [...prev, { content: errorMessage, from: 'assistant' }]);
    }
  }, [sseStream.error]);

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    if (!text || !session?.id || !sseStream.connected) {
      return;
    }
    
    const messageText = text;
    
    // Add user message to conversation and clear input immediately
    setMessages(prev => [...prev, { content: messageText, from: 'user' }]);
    setText('');
    
    // Send message via persistent SSE
    try {
      await sseStream.sendMessage(messageText);
    } catch (error) {
      console.error('Failed to send message:', error);
      // Error will be handled by the error useEffect
    }
  };

  return (
    <div className="flex flex-col h-screen p-4 gap-4">
      {/* Conversation Display */}
      <AIConversation className="relative h-full">
        <AIConversationContent>
          {messages.map((message, index) => (
            <AIMessage from={message.from} key={index}>
              <AIMessageContent >
                {message.from === 'assistant' ? (
                  <AIResponse>{message.content}</AIResponse>
                ) : (
                  message.content
                )}
                {message.toolCalls?.map((toolCall, toolIndex) => (
                  <AITool
                  className='mt-2'
                  key={`${index}-${toolCall.name}-${toolIndex}`}>
                    <AIToolHeader
                      description={toolCall.description}
                      name={toolCall.name}
                      status={toolCall.status}
                    />
                    <AIToolContent>
                      <AIToolParameters parameters={toolCall.parameters} />
                      {(toolCall.result || toolCall.error) && (
                        <AIToolResult
                          error={toolCall.error}
                          result={toolCall.result ? <AIResponse>{toolCall.result}</AIResponse> : undefined}
                        />
                      )}
                    </AIToolContent>
                  </AITool>
                ))}
              </AIMessageContent>
            </AIMessage>
          ))}
          {sseStream.processing && (
            <AIMessage from="assistant">
              <AIMessageContent>
                {sseStream.toolCalls.length > 0 ? (
                  <>
                    {sseStream.toolCalls.map((toolCall, toolIndex) => (
                      <AITool
                        className='mt-2'
                        key={`streaming-${toolCall.id}-${toolIndex}`}>
                        <AIToolHeader
                          description={toolCall.description}
                          name={toolCall.name}
                          status={toolCall.status}
                        />
                        <AIToolContent>
                          <AIToolParameters parameters={toolCall.parameters} />
                          {(toolCall.result || toolCall.error) && (
                            <AIToolResult
                              error={toolCall.error}
                              result={toolCall.result ? <AIResponse>{toolCall.result}</AIResponse> : undefined}
                            />
                          )}
                        </AIToolContent>
                      </AITool>
                    ))}
                    {!sseStream.completed && <LoadingDots />}
                  </>
                ) : (
                  <LoadingDots />
                )}
              </AIMessageContent>
            </AIMessage>
          )}
        </AIConversationContent>
        <AIConversationScrollButton />
      </AIConversation>

      {/* AI Input Section */}
      <div className="max-w-4xl mx-auto w-full relative">
        <AIInput onSubmit={handleSubmit} className='bg-stone-600/20 border-neutral-600 border-[0.5px]'>
          <AIInputTextarea
            onChange={(e) => {
              handleTextChange(e.target.value);
              if (!inputElement) {
                setInputElement(e.target);
              }
            }} 
            onKeyDown={handleKeyDown}
            value={text}
            className={
              text.startsWith('/') 
                ? text.includes(' ') 
                  ? 'text-green-400' // Completed slash command
                  : 'text-blue-400'  // Typing slash command
                : ''
            } />
          <AIInputToolbar>
            <AIInputTools>
              <AIInputButton>
                <PlusIcon className='size-6' />
              </AIInputButton>
              <AIInputButton>
                <MicIcon className='size-5' />
              </AIInputButton>
   

            </AIInputTools>
            <AIInputSubmit 

              disabled={!text || !session?.id || sessionLoading || !sseStream.connected} 
              status={sseStream.processing ? 'streaming' : sseStream.error ? 'error' : 'ready'} 
            />
          </AIInputToolbar>
        </AIInput>
        
        {/* Slash Command Dropdown */}
        {showSlashCommands && (
          <div className="absolute bottom-full left-0 right-0 mb-2 bg-popover border border-border rounded-xl shadow-lg z-50 overflow-hidden p-2">
            {slashCommands.map((command, index) => {
              const Icon = command.icon;
              return (
                <div
                  key={command.id}
                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                    index === selectedCommandIndex 
                      ? 'bg-muted/80  rounded-md' 
                      : 'hover:bg-muted/30'
                  }`}
                  onClick={() => handleSlashCommandSelect(command)}
                >
                  <Icon className="size-4 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="font-medium">/{command.name}</div>
                    <div className="text-xs text-muted-foreground">{command.description}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};