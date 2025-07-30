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
import { FolderIcon } from 'lucide-react';
import { type FormEventHandler, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';

import { useSession, useCreateSession } from '@/hooks/useSession';
import { useSendMessage } from '@/hooks/useMessages';
import { usePersistentSSE } from '@/hooks/usePersistentSSE';
import { type FileEntry } from '@/hooks/useFileSystem';
import { useFileReference } from '@/hooks/useFileReference';
import { CommandFileReference } from './command-file-reference';
import { useAttachmentStore, type Attachment, expandFileReferences, removeFileReferences, createFileAttachment, createFolderAttachment } from '@/stores/attachmentStore';
import { useFolderSelection } from '@/hooks/useFolderSelection';
import { useMessageHistoryNavigation } from '@/hooks/useMessageHistoryNavigation';
import { useMessageScrolling } from '@/hooks/useMessageScrolling';
import { LoadingDots } from './loading-dots';
import { AttachmentPreview } from './attachment-preview';
import { SlashCommandDropdown, shouldShowSlashCommands, handleSlashCommandNavigation, slashCommands } from './slash-command-dropdown';
import { ResponseRenderer } from './response-renderer';
import { MessageAttachmentDisplay } from './message-attachment-display';
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
  attachments?: Attachment[];
};

export function ChatApp() {
  const [text, setText] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [inputElement, setInputElement] = useState<HTMLTextAreaElement | null>(null);
  const [shouldFocusInput, setShouldFocusInput] = useState<number>(0);
  const interruptedMessageAddedRef = useRef(false);



  const { data: session, isLoading: sessionLoading, error: sessionError } = useSession();
  const createSession = useCreateSession();
  const sendMessage = useSendMessage();
  const sseStream = usePersistentSSE(session?.id || '');
  const attachments = useAttachmentStore(state => state.attachments);
  const referenceMap = useAttachmentStore(state => state.referenceMap);
  const availableApps = useAttachmentStore(state => state.availableApps);
  const addAttachment = useAttachmentStore(state => state.addAttachment);
  const removeAttachment = useAttachmentStore(state => state.removeAttachment);
  const clearAttachments = useAttachmentStore(state => state.clearAttachments);
  const addReference = useAttachmentStore(state => state.addReference);
  const removeReference = useAttachmentStore(state => state.removeReference);
  const syncWithText = useAttachmentStore(state => state.syncWithText);
  const updateAvailableApps = useAttachmentStore(state => state.updateAvailableApps);
  const getMediaFiles = useAttachmentStore(state => state.getMediaFiles);
  const { selectedFolder, selectFolder } = useFolderSelection();

  const handleFolderSelect = async () => {
    try {
      const selectedFolderPath = await selectFolder();
      if (selectedFolderPath) {
        addFolder(selectedFolderPath);
      }
    } catch (error) {
      console.error('Failed to select and attach folder:', error);
    }
  };

  // Memoize the folder path to prevent unnecessary re-renders
  const memoizedFolderPath = useMemo(() => selectedFolder || undefined, [selectedFolder]);
  
  const fileRef = useFileReference(text, setText, memoizedFolderPath, inputElement);
  

  const handleAppSelect = (app: Attachment) => {
    // Update text with app reference (similar to file selection)
    const words = text.split(' ');
    const displayReference = `@${app.name}`;
    words[words.length - 1] = `${displayReference} `;
    const newText = words.join(' ');
    
    // Add app to attachment store and create reference mapping
    addAttachment(app);
    addReference(displayReference, `app:${app.name}`);
    setText(newText);
    
    // Trigger delayed focus to avoid race condition with dropdown closing
    setShouldFocusInput(prev => prev + 1);
  };

  // Update apps when file reference opens
  useEffect(() => {
    if (fileRef.show) {
      updateAvailableApps();
    }
  }, [fileRef.show, updateAvailableApps]);

  // Handle delayed focus after app selection
  useEffect(() => {
    if (shouldFocusInput > 0 && inputElement) {
      const timeoutId = setTimeout(() => {
        inputElement.focus();
        const textLength = text.length;
        inputElement.setSelectionRange(textLength, textLength);
      }, 0);
      
      return () => clearTimeout(timeoutId);
    }
  }, [shouldFocusInput, inputElement, text]);
  
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
    
    // Sync media store with text changes (bidirectional sync)
    syncWithText(value);
    
    // Handle slash commands using utility function
    const shouldShow = shouldShowSlashCommands(value);
    setShowSlashCommands(shouldShow);
    if (shouldShow) {
      setSelectedCommandIndex(0);
    }
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
      attachments: attachments.length > 0 ? attachments : undefined
    }]);
    setText('');
    clearAttachments();
    
    // Reset interrupted message guard for new message
    interruptedMessageAddedRef.current = false;
    
    // Send message via persistent SSE
    try {
      // Expand file references from display format to full paths
      const expandedText = expandFileReferences(messageText, referenceMap);
      
      const messageData = {
        text: expandedText,
        media: attachments.filter(a => a.path).map(a => a.path),
        apps: attachments.filter(a => a.type === 'app').map(app => app.name)
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
    clearAttachments();
    interruptedMessageAddedRef.current = false;
  };

  // Calculate submit button status and disabled state
  const buttonStatus = sseStream.processing ? 'streaming' : 
                      sseStream.error ? 'error' : 'ready';
  
  // Ready state: need text/attachments and connection. Other states: only need connection for pause/resume
  const isSubmitDisabled = buttonStatus === 'ready' 
    ? ((!text && attachments.length === 0) || !session?.id || sessionLoading || !sseStream.connected)
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
                    <MessageAttachmentDisplay attachments={message.attachments || []} />
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


      {/* Attachment Preview Section */}
      <div className="max-w-4xl mx-auto w-full mb-0">
        <AttachmentPreview 
          attachments={attachments} 
          onRemoveItem={(index) => {
            const attachmentToRemove = attachments[index];
            if (attachmentToRemove) {
              const fullPath = attachmentToRemove.type === 'app' 
                ? `app:${attachmentToRemove.name}` 
                : attachmentToRemove.path!;
              const updatedText = removeFileReferences(text, referenceMap, fullPath);
              setText(updatedText);
              
              // Remove the reference from the map
              for (const [displayName, mappedPath] of referenceMap) {
                if (mappedPath === fullPath) {
                  removeReference(displayName);
                  break;
                }
              }
            }
            removeAttachment(index);
          }} 
        />
      </div>

      {/* AI Input Section */}
      <div className="max-w-4xl mx-auto w-full relative">
        <div className="relative">
          <AIInput onSubmit={handleSubmit} className='border-neutral-600 border-[0.5px]'>
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
            availableApps={attachments.filter(a => a.type === 'app').map(app => app.name)}
            availableCommands={slashCommands.map(cmd => cmd.name)}
            autoFocus/>
          <AIInputToolbar>
            <AIInputTools>
              <AIInputButton onClick={handleFolderSelect} title={selectedFolder ? `Current folder: ${selectedFolder}` : 'Select parent folder'}>
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
        <SlashCommandDropdown 
          isVisible={showSlashCommands}
          selectedIndex={selectedCommandIndex}
          onCommandSelect={handleSlashCommandSelect}
        />

        {/* File Reference Dropdown with Command Component */}
        {fileRef.show && (
          <CommandFileReference
            files={fileRef.files}
            apps={availableApps}
            onSelect={fileRef.selectFile}
            onSelectApp={handleAppSelect}
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