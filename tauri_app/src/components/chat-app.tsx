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
  AIToolLadder,
  AIToolStep,
  type AIToolStatus,
} from '@/components/ui/kibo-ui/ai/tool';
import { GlobeIcon, MicIcon, PlusIcon, Play, Square, Command, HelpCircle, FileIcon, FolderIcon, ImageIcon } from 'lucide-react';
import { IconEdit } from '@tabler/icons-react';
import { type FormEventHandler, useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';

import { useSession, useCreateSession } from '@/hooks/useSession';
import { useSendMessage } from '@/hooks/useMessages';
import { usePersistentSSE } from '@/hooks/usePersistentSSE';
import { useFileSystem, type FileEntry } from '@/hooks/useFileSystem';
import { useOpenApps } from '@/hooks/useOpenApps';
import { useMediaHandler, type MediaItem } from '@/hooks/useMediaHandler';
import { LoadingDots } from './loading-dots';
import { MediaPreview } from './media-preview';
import { Badge } from '@/components/ui/badge';


const models = [
  { id: 'gpt-4', name: 'GPT-4' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
];

const slashCommands = [
  { id: 'help', name: 'help', description: 'Get assistance and guidance', icon: HelpCircle },
  { id: 'mcp', name: 'mcp', description: 'Model Context Protocol', icon: Command },
  { id: 'session', name: 'session', description: 'User Session Management', icon: Command },
  { id: 'tools', name: 'tools', description: 'Tools available to the agent', icon: Command },
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
  const [model, setModel] = useState<string>(models[0].id);
  const [messages, setMessages] = useState<Message[]>([]);
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [showFileReferences, setShowFileReferences] = useState(false);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [inputElement, setInputElement] = useState<HTMLTextAreaElement | null>(null);
  const interruptedMessageAddedRef = useRef(false);

  const { data: session, isLoading: sessionLoading, error: sessionError } = useSession();
  const createSession = useCreateSession();
  const sendMessage = useSendMessage();
  const sseStream = usePersistentSSE(session?.id || '');
  const { currentFiles, isLoading: filesLoading, error: filesError, fetchFiles } = useFileSystem();
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
  
  // Filter apps to only show specified ones
  const allowedApps = ['Notes', 'Obsidian', 'Blender', 'Pixelmator Pro'];
  const filteredApps = openApps.filter(app => 
    allowedApps.some(allowedApp => 
      app.name.toLowerCase().includes(allowedApp.toLowerCase())
    )
  );


  const handleTextChange = (value: string) => {
    setText(value);
    
    // Check if user typed "/" at the beginning of the input
    if (value === '/' || (value.startsWith('/') && !value.includes(' '))) {
      setShowSlashCommands(true);
      setSelectedCommandIndex(0);
      setShowFileReferences(false);
    } else {
      setShowSlashCommands(false);
    }
    
    // Check if user typed "@" to reference files
    const words = value.split(' ');
    const lastWord = words[words.length - 1];
    if (lastWord === '@' || (lastWord.startsWith('@') && !lastWord.includes('/'))) {
      setShowFileReferences(true);
      setSelectedFileIndex(0);
      setShowSlashCommands(false);
      // Trigger fresh file fetch when @ is typed
      if (lastWord === '@') {
        console.log('🔥 @ detected - fetching files on demand');
        fetchFiles();
      }
    } else if (!lastWord.startsWith('@')) {
      setShowFileReferences(false);
    }
  };

  const handleSlashCommandSelect = (command: typeof slashCommands[0]) => {
    const commandText = `/${command.name} `;
    setText(commandText);
    setShowSlashCommands(false);
    inputElement?.focus();
  };

  const handleFileSelect = (file: FileEntry) => {
    const words = text.split(' ');
    const lastWordIndex = words.length - 1;
    const lastWord = words[lastWordIndex];
    
    if (lastWord.startsWith('@')) {
      // Replace the @partial with @filename
      words[lastWordIndex] = `@${file.path} `;
      setText(words.join(' '));
    }
    
    setShowFileReferences(false);
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

    // Handle file reference navigation when dropdown is visible
    if (showFileReferences && currentFiles.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedFileIndex((prev) => 
            prev < currentFiles.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedFileIndex((prev) => 
            prev > 0 ? prev - 1 : currentFiles.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          handleFileSelect(currentFiles[selectedFileIndex]);
          break;
        case 'Escape':
          e.preventDefault();
          setShowFileReferences(false);
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

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    if (!text || !session?.id || !sseStream.connected) {
      return;
    }
    
    const messageText = text;
    
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
      <AIConversation className="relative h-full">
        <AIConversationContent>
          {messages.map((message, index) => (
            <AIMessage from={message.from} key={index}>
              <AIMessageContent >
                {message.from === 'assistant' ? (
                  <AIResponse>{message.content}</AIResponse>
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
        </AIConversationContent>
        <AIConversationScrollButton />
      </AIConversation>

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
            className={
              text.startsWith('/') 
                ? text.includes(' ') 
                  ? 'text-green-400' // Completed slash command
                  : 'text-blue-400'  // Typing slash command
                : text.includes('@') 
                  ? 'text-purple-400' // File reference
                  : ''
            } autoFocus/>
          <AIInputToolbar>
            <AIInputTools>
              <AIInputButton onClick={handleOpenFileDialog}>
                <PlusIcon className='size-6' />
              </AIInputButton>
              <AIInputButton>
                <MicIcon className='size-5' />
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

        {/* File Reference Dropdown */}
        {showFileReferences && (
          <div className="absolute bottom-full left-0 right-0 mb-2 bg-popover border border-border rounded-xl shadow-lg z-50 overflow-hidden p-2 max-h-64 overflow-y-auto">
            <div className="text-xs text-muted-foreground px-3 py-1 border-b mb-2">
              <div>
                Files ({currentFiles.length}) | Dirs: {currentFiles.filter(f => f.isDirectory).length}
                {filesLoading ? ' | Loading...' : filesError ? ' | Error!' : ''}
              </div>
            </div>
            {filesLoading ? (
              <div className="flex items-center gap-3 px-3 py-2 text-muted-foreground">
                <FileIcon className="size-4" />
                <span>Loading files...</span>
              </div>
            ) : filesError ? (
              <div className="flex items-center gap-3 px-3 py-2 text-red-500">
                <FileIcon className="size-4" />
                <span>Error loading files: {filesError}</span>
              </div>
            ) : currentFiles.length === 0 ? (
              <div className="flex items-center gap-3 px-3 py-2 text-muted-foreground">
                <FileIcon className="size-4" />
                <span>No files found in directory</span>
              </div>
            ) : (
              currentFiles.map((file, index) => {
                const Icon = file.isDirectory ? FolderIcon : FileIcon;
                return (
                  <div
                    key={file.path}
                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                      index === selectedFileIndex 
                        ? 'bg-muted/80 rounded-md' 
                        : 'hover:bg-muted/30'
                    }`}
                    onClick={() => handleFileSelect(file)}
                  >
                    <Icon className={`size-4 ${file.isDirectory ? 'text-blue-500' : 'text-muted-foreground'}`} />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{file.name}</div>
                      {file.extension && (
                        <div className="text-xs text-muted-foreground">.{file.extension} file</div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};