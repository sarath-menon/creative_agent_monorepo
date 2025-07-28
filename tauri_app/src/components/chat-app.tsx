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
import { PlusIcon, FolderIcon } from 'lucide-react';
import { type FormEventHandler, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';

import { useSession, useCreateSession } from '@/hooks/useSession';
import { useSendMessage } from '@/hooks/useMessages';
import { usePersistentSSE } from '@/hooks/usePersistentSSE';
import { type FileEntry } from '@/hooks/useFileSystem';
import { useFileReference } from '@/hooks/useFileReference';
import { CommandFileReference } from './command-file-reference';
import { useMediaHandler, type MediaItem } from '@/hooks/useMediaHandler';
import { useFolderSelection } from '@/hooks/useFolderSelection';
import { useMessageHistoryNavigation } from '@/hooks/useMessageHistoryNavigation';
import { useMessageScrolling } from '@/hooks/useMessageScrolling';
import { LoadingDots } from './loading-dots';
import { MediaPreview } from './media-preview';
import { AppDisplayPopover } from './app-display-popover';
import { SlashCommandDropdown, shouldShowSlashCommands, handleSlashCommandNavigation, slashCommands } from './slash-command-dropdown';
import { ResponseRenderer } from './response-renderer';
import { MessageMediaDisplay } from './message-media-display';
import { SessionHeader } from './session-header';


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
  const [showAppsPopover, setShowAppsPopover] = useState(false);
  const interruptedMessageAddedRef = useRef(false);



  const { data: session, isLoading: sessionLoading, error: sessionError } = useSession();
  const createSession = useCreateSession();
  const sendMessage = useSendMessage();
  const sseStream = usePersistentSSE(session?.id || '');
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
  
  // Initialize new hooks
  const historyNavigation = useMessageHistoryNavigation({
    sessionId: session?.id || '',
    text,
    setText,
    batchSize: 50,
  });

  const { conversationRef, setUserMessageRef } = useMessageScrolling(messages, sseStream.processing);
  


  const handleTextChange = (value: string) => {
    setText(value);
    
    // Handle slash commands using utility function
    const shouldShow = shouldShowSlashCommands(value);
    setShowSlashCommands(shouldShow);
    if (shouldShow) {
      setSelectedCommandIndex(0);
    }
    
    // File reference auto-managed by hook - no coordination needed!
  };

  const handleSlashCommandSelect = async (command: typeof slashCommands[0]) => {
    const commandText = `/${command.name}`;
    setShowSlashCommands(false);
    await submitMessage(commandText);
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

    // Handle slash command navigation
    const slashHandled = handleSlashCommandNavigation(
      e,
      showSlashCommands,
      selectedCommandIndex,
      setSelectedCommandIndex,
      handleSlashCommandSelect,
      () => setShowSlashCommands(false)
    );
    if (slashHandled) return;

    // Handle Escape key to close file reference popup
    if (fileRef.show && e.key === 'Escape') {
      e.preventDefault();
      fileRef.close();
      return;
    }

    // Handle history navigation when not in other modes
    const historyHandled = historyNavigation.handleHistoryNavigation(
      e,
      showSlashCommands || fileRef.show
    );
    if (historyHandled) return;
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

  // Handle pause state changes - simplified since pausing is not implemented
  // (Keeping this for compatibility but it won't trigger since isPaused will always be false)

  const submitMessage = async (messageText: string) => {
    if (!messageText || !session?.id || !sseStream.connected) {
      return;
    }
    
    // Exit history mode if active
    historyNavigation.resetHistoryMode();
    
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
      // Expand file references from display format to full paths
      const expandedText = fileRef.expandFileReferences(messageText);
      
      const messageData = {
        text: expandedText,
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
    console.log('pausing not implemented');
  };

  // Handle new session creation
  const handleNewSession = () => {
    setMessages([]);
    setText('');
    clearMedia();
    interruptedMessageAddedRef.current = false;
  };

  // Calculate submit button status and disabled state
  const buttonStatus = sseStream.processing ? 'streaming' : 
                      sseStream.error ? 'error' : 'ready';
  
  // Ready state: need text/media and connection. Other states: only need connection for pause/resume
  const isSubmitDisabled = buttonStatus === 'ready' 
    ? ((!text && attachedMedia.length === 0) || !session?.id || sessionLoading || !sseStream.connected)
    : (!session?.id || sessionLoading || !sseStream.connected);

  return (
    <TooltipProvider>
      <div className="flex flex-col h-screen px-4 pb-4">
      {/* Header with New Session Button */}
      <SessionHeader onNewSession={handleNewSession} />
      
      {/* Conversation Display */}
      <div ref={conversationRef} className="relative h-full flex-1 overflow-y-auto">
        <div className="">
          {messages.map((message, index) => (
            <AIMessage 
              from={message.from} 
              key={index}
              ref={message.from === 'user' ? setUserMessageRef(index) : undefined}
            >
              <AIMessageContent >
                {message.from === 'assistant' ? (
                  <ResponseRenderer content={message.content} />
                ) : (
                  <div>
                    <MessageMediaDisplay media={message.media || []} />
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


      {/* Media Preview Section */}
      <div className="max-w-4xl mx-auto w-full mb-0">
        <MediaPreview attachedMedia={attachedMedia} onRemoveItem={removeMediaItem} />
      </div>

      {/* AI Input Section */}
      <div className="max-w-4xl mx-auto w-full relative">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative ${isDragOver ? 'ring-2 ring-blue-500 ring-opacity-50' : ''}`}
        >
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
              <AppDisplayPopover 
                isOpen={showAppsPopover}
                onOpenChange={setShowAppsPopover}
              />
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
        <SlashCommandDropdown 
          isVisible={showSlashCommands}
          selectedIndex={selectedCommandIndex}
          onCommandSelect={handleSlashCommandSelect}
        />

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
    </TooltipProvider>
  );
};