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
import { AIMessage, AIMessageContent } from '@/components/ui/kibo-ui/ai/message';
import { AIResponse } from '@/components/ui/kibo-ui/ai/response';
import {
  AITool,
  AIToolContent,
  AIToolHeader,
  AIToolParameters,
  AIToolResult,
  AIToolLadder,
  AIToolStep,
  type AIToolStatus,
} from '@/components/ui/kibo-ui/ai/tool';
import { GlobeIcon, MicIcon, PlusIcon, Play, Square, Command, HelpCircle, ImageIcon, FolderIcon } from 'lucide-react';
import { IconEdit } from '@tabler/icons-react';
import { type FormEventHandler, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';

import { useSession, useCreateSession } from '@/hooks/useSession';
import { useSendMessage } from '@/hooks/useMessages';
import { usePersistentSSE } from '@/hooks/usePersistentSSE';
import { type FileEntry } from '@/hooks/useFileSystem';
import { useFileReference } from '@/hooks/useFileReference';
import { CommandFileReference } from './command-file-reference';
import { useOpenApps } from '@/hooks/useOpenApps';
import { useMediaHandler, type MediaItem } from '@/hooks/useMediaHandler';
import { useMessageHistory } from '@/hooks/useMessageHistory';
import { useFolderSelection } from '@/hooks/useFolderSelection';
import { LoadingDots } from './loading-dots';
import { MediaPreview } from './media-preview';
import { Badge } from '@/components/ui/badge';
import { ContextDisplay } from './context-display';
import { HelpDisplay } from './help-display';
import { SessionDisplay } from './session-display';
import { SessionsDisplay } from './sessions-display';
import { McpDisplay } from './mcp-display';


const slashCommands = [
  { id: 'help', name: 'help', description: 'Get assistance and guidance', icon: HelpCircle },
  { id: 'mcp', name: 'mcp', description: 'Model Context Protocol', icon: Command },
  { id: 'session', name: 'session', description: 'User Session Management', icon: Command },
  { id: 'sessions', name: 'sessions', description: 'List all available sessions', icon: Command },
  { id: 'context', name: 'context', description: 'Show context usage breakdown', icon: Command },
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
  media?: MediaItem[];
};

export function ChatApp() {
  const [text, setText] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [inputElement, setInputElement] = useState<HTMLTextAreaElement | null>(null);
  const interruptedMessageAddedRef = useRef(false);
  const conversationRef = useRef<HTMLDivElement>(null);
  const userMessageRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Helper function to parse and render structured JSON responses
  const renderResponseContent = (content: string) => {
    // Handle empty responses (e.g., from /clear command)
    if (!content || content.trim() === '') {
      return null;
    }
    
    // All slash commands return JSON, parse and route to appropriate component
    try {
      const parsedData = JSON.parse(content);
      
      // Check if it's a context response by looking for expected fields
      if (parsedData.model && parsedData.components && Array.isArray(parsedData.components)) {
        return <ContextDisplay data={parsedData} />;
      }
      
      // Check if it's a help response by looking for type field
      if (parsedData.type === 'help' && parsedData.commands && Array.isArray(parsedData.commands)) {
        return <HelpDisplay data={parsedData} />;
      }
      
      // Check if it's a session response by looking for type field
      if (parsedData.type === 'session' && parsedData.id) {
        return <SessionDisplay data={parsedData} />;
      }
      
      // Check if it's a sessions response by looking for type field
      if (parsedData.type === 'sessions' && parsedData.sessions && Array.isArray(parsedData.sessions)) {
        return <SessionsDisplay data={parsedData} />;
      }
      
      // Check if it's an MCP response by looking for type field
      if (parsedData.type === 'mcp' && parsedData.servers && Array.isArray(parsedData.servers)) {
        return <McpDisplay data={parsedData} />;
      }
      
      // If we reach here, it's an unknown JSON structure - log and render as text
      console.warn('Unknown JSON response structure:', parsedData);
      return <AIResponse>{content}</AIResponse>;
    } catch (error) {
      // If JSON parsing fails, it's likely regular chat content
      return <AIResponse>{content}</AIResponse>;
    }
  };

  // History navigation state
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [originalText, setOriginalText] = useState('');
  const [isInHistoryMode, setIsInHistoryMode] = useState(false);

  const { data: session, isLoading: sessionLoading, error: sessionError } = useSession();
  const createSession = useCreateSession();
  const sendMessage = useSendMessage();
  const sseStream = usePersistentSSE(session?.id || '');
  const { apps: openApps, isLoading: appsLoading, error: appsError } = useOpenApps();
  const { 
    attachedMedia, 
    isDragOver, 
    handleOpenFileDialog, 
    handleDragOver, 
    handleDragLeave, 
    handleDrop, 
    removeMediaItem, 
    clearMedia 
  } = useMediaHandler();
  const { selectedFolder, selectFolder } = useFolderSelection();

  // Memoize the folder path to prevent unnecessary re-renders
  const memoizedFolderPath = useMemo(() => selectedFolder || undefined, [selectedFolder]);
  
  const fileRef = useFileReference(text, setText, memoizedFolderPath, inputElement);
  
  // Initialize message history hook
  const messageHistory = useMessageHistory({
    sessionId: session?.id || '',
    batchSize: 50,
  });
  
  // Filter apps to only show specified ones
  const allowedApps = ['Notes', 'Obsidian', 'Blender', 'Pixelmator Pro'];
  const filteredApps = openApps.filter(app => 
    allowedApps.some(allowedApp => 
      app.name.toLowerCase().includes(allowedApp.toLowerCase())
    )
  );


  const handleTextChange = (value: string) => {
    setText(value);
    
    // Handle slash commands
    if (value === '/' || (value.startsWith('/') && !value.includes(' '))) {
      setShowSlashCommands(true);
      setSelectedCommandIndex(0);
    } else {
      setShowSlashCommands(false);
    }
    
    // File reference auto-managed by hook - no coordination needed!
  };

  const handleSlashCommandSelect = async (command: typeof slashCommands[0]) => {
    const commandText = `/${command.name}`;
    setShowSlashCommands(false);
    await submitMessage(commandText);
  };


  // History navigation helper functions
  const enterHistoryMode = () => {
    if (!isInHistoryMode) {
      setOriginalText(text);
      setIsInHistoryMode(true);
      setHistoryIndex(-1);
      
      // Load initial history (both current and cross-session) if not already loaded
      if (messageHistory.allHistory.length === 0) {
        messageHistory.loadInitialHistory(); // Fire and forget - don't await
      }
    }
  };

  const exitHistoryMode = () => {
    setIsInHistoryMode(false);
    setHistoryIndex(-1);
    setText(originalText);
    setOriginalText('');
  };

  const navigateHistory = async (direction: 'up' | 'down') => {
    const allHistoryTexts = messageHistory.getAllHistoryTexts();
    
    if (direction === 'up') {
      // Go to previous (older) message
      const newIndex = historyIndex + 1;
      
      if (newIndex < allHistoryTexts.length) {
        setHistoryIndex(newIndex);
        setText(allHistoryTexts[newIndex]);
        
        // Prefetch more history when getting close to the end
        if (newIndex > allHistoryTexts.length - 10 && messageHistory.hasMoreHistory) {
          messageHistory.loadMoreHistory();
        }
      }
    } else {
      // Go to next (newer) message
      const newIndex = historyIndex - 1;
      
      if (newIndex >= 0) {
        setHistoryIndex(newIndex);
        setText(allHistoryTexts[newIndex]);
      } else if (newIndex === -1) {
        // Return to original text
        setHistoryIndex(-1);
        setText(originalText);
      }
    }
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

    // Handle Escape key - exit history mode if active
    if (e.key === 'Escape' && isInHistoryMode) {
      e.preventDefault();
      exitHistoryMode();
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

    // Handle Escape key to close file reference popup
    if (fileRef.show && e.key === 'Escape') {
      e.preventDefault();
      fileRef.close();
      return;
    }

    // Handle history navigation when not in other modes
    if (!showSlashCommands && !fileRef.show) {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          if (!isInHistoryMode) {
            enterHistoryMode();
          }
          navigateHistory('up');
          break;
        case 'ArrowDown':
          if (isInHistoryMode) {
            e.preventDefault();
            navigateHistory('down');
          }
          // Don't prevent default if not in history mode to allow normal cursor movement
          break;
      }
    }
  };

  // Auto-scroll to last user message when messages change
  useEffect(() => {
    // Find the index of the last user message
    const lastUserMessageIndex = messages.findLastIndex(m => m.from === 'user');
    
    if (lastUserMessageIndex !== -1 && userMessageRefs.current[lastUserMessageIndex]) {
      // Use setTimeout to ensure DOM updates are complete
      setTimeout(() => {
        userMessageRefs.current[lastUserMessageIndex]?.scrollIntoView({ 
          behavior: 'smooth',
          block: 'start'
        });
      }, 0);
    }
  }, [messages, sseStream.processing]);

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
      
      // Reset interrupted message guard when processing completes
      interruptedMessageAddedRef.current = false;
    }
  }, [sseStream.completed, sseStream.finalContent, sseStream.processing]);

  // Handle streaming errors
  useEffect(() => {
    if (sseStream.error) {
      const errorMessage = `Failed to send prompt: ${sseStream.error}`;
      setMessages(prev => [...prev, { content: errorMessage, from: 'assistant' }]);
    }
  }, [sseStream.error]);

  // Handle pause state changes to add "Interrupted" message
  useEffect(() => {
    if (sseStream.isPaused && sseStream.processing && !interruptedMessageAddedRef.current) {
      setMessages(prev => [...prev, { content: "Interrupted", from: 'assistant' }]);
      interruptedMessageAddedRef.current = true;
    }
  }, [sseStream.isPaused, sseStream.processing]);

  const submitMessage = async (messageText: string) => {
    if (!messageText || !session?.id || !sseStream.connected) {
      return;
    }
    
    // Exit history mode if active
    if (isInHistoryMode) {
      setIsInHistoryMode(false);
      setHistoryIndex(-1);
      setOriginalText('');
    }
    
    // Add user message to conversation and clear input immediately
    setMessages(prev => [...prev, { 
      content: messageText, 
      from: 'user',
      media: attachedMedia.length > 0 ? attachedMedia : undefined
    }]);
    setText('');
    clearMedia();
    
    // Reset interrupted message guard for new message
    interruptedMessageAddedRef.current = false;
    
    // Send message via persistent SSE
    try {
      const messageData = {
        text: messageText,
        media: attachedMedia.length > 0 ? attachedMedia.map(m => m.path) : undefined
      };
      await sseStream.sendMessage(JSON.stringify(messageData));
    } catch (error) {
      console.error('Failed to send message:', error);
      // Error will be handled by the error useEffect
    }
  };

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    await submitMessage(text);
  };

  // Handle pause/resume button clicks
  const handlePauseResumeClick = async () => {
    try {
      if (sseStream.isPaused) {
        await sseStream.resumeMessage();
      } else if (sseStream.processing) {
        await sseStream.pauseMessage();
      }
    } catch (error) {
      console.error('Failed to pause/resume:', error);
    }
  };

  // Handle new session creation
  const handleNewSession = async () => {
    try {
      await createSession.mutateAsync({ title: "Chat Session" });
      setMessages([]);
      setText('');
      clearMedia();
      interruptedMessageAddedRef.current = false;
    } catch (error) {
      console.error('Failed to create new session:', error);
    }
  };

  // Calculate submit button status and disabled state
  const buttonStatus = sseStream.isPaused ? 'paused' : 
                      sseStream.processing ? 'streaming' : 
                      sseStream.error ? 'error' : 'ready';
  
  // Ready state: need text/media and connection. Other states: only need connection for pause/resume
  const isSubmitDisabled = buttonStatus === 'ready' 
    ? ((!text && attachedMedia.length === 0) || !session?.id || sessionLoading || !sseStream.connected)
    : (!session?.id || sessionLoading || !sseStream.connected);

  return (
    <div className="flex flex-col h-screen px-4 pb-4">
      {/* Header with New Session Button */}
      <div className="flex justify-end">
        <button
          onClick={handleNewSession}
          disabled={createSession.isPending}
          className="flex items-center gap-2  text-sm font-medium text-stone-500 hover:text-stone-100 hover:bg-stone-700/50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Start New Session"
        >
          <IconEdit className="size-5" />
        </button>
      </div>
      
      {/* Conversation Display */}
      <div ref={conversationRef} className="relative h-full flex-1 overflow-y-auto">
        <div className="">
          {messages.map((message, index) => (
            <AIMessage 
              from={message.from} 
              key={index}
              ref={message.from === 'user' ? (el) => userMessageRefs.current[index] = el : undefined}
            >
              <AIMessageContent >
                {message.from === 'assistant' ? (
                  renderResponseContent(message.content)
                ) : (
                  <div>
                    {message.media && message.media.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {message.media.map((media, index) => (
                          <div key={index} className="relative">
                            {media.type === 'image' ? (
                              <img 
                                src={media.preview} 
                                alt={media.name}
                                className="max-w-xs max-h-48 object-cover rounded-lg"
                              />
                            ) : (
                              <div className="flex items-center gap-2 bg-stone-700/50 rounded-lg p-3">
                                <ImageIcon className="w-6 h-6 text-stone-400" />
                                <span className="text-sm text-stone-300">{media.name}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {message.content}
                  </div>
                )}
                {message.toolCalls && message.toolCalls.length > 0 && (
                  <AIToolLadder className="mt-4">
                    {message.toolCalls.map((toolCall, toolIndex) => (
                      <AIToolStep
                        key={`${index}-${toolCall.name}-${toolIndex}`}
                        status={toolCall.status}
                        stepNumber={toolIndex + 1}
                        isLast={toolIndex === message.toolCalls!.length - 1}
                      >
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
                      </AIToolStep>
                    ))}
                  </AIToolLadder>
                )}
              </AIMessageContent>
            </AIMessage>
          ))}
          {sseStream.processing && (
            <AIMessage from="assistant">
              <AIMessageContent>
                {sseStream.toolCalls.length > 0 ? (
                  <>
                    <AIToolLadder >
                      {sseStream.toolCalls.map((toolCall, toolIndex) => (
                        <AIToolStep
                          key={`streaming-${toolCall.id}-${toolIndex}`}
                          status={toolCall.status}
                          stepNumber={toolIndex + 1}
                          isLast={toolIndex === sseStream.toolCalls.length - 1}
                        >
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
                        </AIToolStep>
                      ))}
                    </AIToolLadder>
                    {!sseStream.completed && <LoadingDots />}
                  </>
                ) : (
                  <LoadingDots />
                )}
              </AIMessageContent>
            </AIMessage>
          )}
        </div>
      </div>

      {/* Open Apps Display */}
      {(filteredApps.length > 0 || appsLoading) && (
        <div className="max-w-4xl mx-auto w-full mb-2">
          <div className="text-xs text-muted-foreground px-1">
            {appsLoading && filteredApps.length === 0 ? '(loading...)' : appsLoading ? '(updating...)' : ''}
          </div>
          {appsLoading && filteredApps.length === 0 ? (
            <div className="flex items-center gap-2 px-2 py-3 text-muted-foreground">
              <LoadingDots />
              <span className="text-xs">Loading applications...</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {filteredApps.map((app) => (
                <Badge key={app.name} variant="secondary" className="text-xs flex items-center gap-1.5">
                  <img 
                    src={`data:image/png;base64,${app.icon_png_base64}`} 
                    alt={`${app.name} icon`}
                    className="size-4 rounded-sm"
                  />
                  {app.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AI Input Section */}
      <div className="max-w-4xl mx-auto w-full relative">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative ${isDragOver ? 'ring-2 ring-blue-500 ring-opacity-50' : ''}`}
        >
          <AIInput onSubmit={handleSubmit} className='bg-stone-600/20 border-neutral-600 border-[0.5px]'>
            <MediaPreview attachedMedia={attachedMedia} onRemoveItem={removeMediaItem} />
            <AIInputTextarea
            onChange={(e) => {
              handleTextChange(e.target.value);
              if (!inputElement) {
                setInputElement(e.target);
              }
            }} 
            onKeyDown={handleKeyDown}
            value={text}
            availableFiles={fileRef.files.map(file => file.name)}
            availableCommands={slashCommands.map(cmd => cmd.name)}
            autoFocus/>
          <AIInputToolbar>
            <AIInputTools>
              <AIInputButton onClick={handleOpenFileDialog}>
                <PlusIcon className='size-6' />
              </AIInputButton>
              <AIInputButton onClick={selectFolder} title={selectedFolder ? `Current folder: ${selectedFolder}` : 'Select parent folder'}>
                <FolderIcon className={`size-6 ${selectedFolder ? 'text-blue-400' : ''}`} />
              </AIInputButton>
            </AIInputTools>
            <AIInputSubmit 
              disabled={isSubmitDisabled}
              status={buttonStatus}
              onPauseClick={handlePauseResumeClick}
            />
          </AIInputToolbar>
        </AIInput>
        </div>
        
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

        {/* File Reference Dropdown with Command Component */}
        {fileRef.show && (
          <CommandFileReference
            files={fileRef.files}
            onSelect={fileRef.selectFile}
            currentFolder={fileRef.currentFolder}
            isLoadingFolder={fileRef.isLoadingFolder}
            onGoBack={fileRef.goBack}
            onEnterFolder={fileRef.enterSelectedFolder}
            onClose={fileRef.close}
          />
        )}
      </div>
    </div>
  );
};