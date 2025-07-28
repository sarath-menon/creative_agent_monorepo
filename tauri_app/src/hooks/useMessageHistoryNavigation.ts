import { useState } from 'react';
import { useMessageHistory } from '@/hooks/useMessageHistory';

interface UseMessageHistoryNavigationProps {
  sessionId: string;
  text: string;
  setText: (text: string) => void;
  batchSize?: number;
}

export function useMessageHistoryNavigation({ 
  sessionId, 
  text, 
  setText, 
  batchSize = 50 
}: UseMessageHistoryNavigationProps) {
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [originalText, setOriginalText] = useState('');

  const messageHistory = useMessageHistory({
    sessionId,
    batchSize,
  });

  const navigateHistory = (direction: 'up' | 'down') => {
    const allHistoryTexts = messageHistory.getAllHistoryTexts();
    
    // Initialize history mode on first use
    if (historyIndex === -1 && direction === 'up') {
      setOriginalText(text);
      // Load initial history if not already loaded
      if (messageHistory.allHistory.length === 0) {
        messageHistory.loadInitialHistory();
      }
    }
    
    const newIndex = direction === 'up' ? historyIndex + 1 : historyIndex - 1;
    
    if (newIndex >= 0 && newIndex < allHistoryTexts.length) {
      setHistoryIndex(newIndex);
      setText(allHistoryTexts[newIndex]);
      
      // Prefetch more history when getting close to the end
      if (newIndex > allHistoryTexts.length - 10 && messageHistory.hasMoreHistory) {
        messageHistory.loadMoreHistory();
      }
    } else if (newIndex === -1) {
      // Return to original text
      setHistoryIndex(-1);
      setText(originalText);
      setOriginalText('');
    }
  };

  const exitHistoryMode = () => {
    if (historyIndex !== -1) {
      setHistoryIndex(-1);
      setText(originalText);
      setOriginalText('');
    }
  };

  const resetHistoryMode = () => {
    if (historyIndex !== -1) {
      setHistoryIndex(-1);
      setOriginalText('');
    }
  };

  const handleHistoryNavigation = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    isInOtherMode: boolean
  ): boolean => {
    if (isInOtherMode) return false;

    const textarea = e.currentTarget;
    const cursorAtStart = textarea.selectionStart === 0;
    const cursorAtEnd = textarea.selectionStart === textarea.value.length;
    const inHistoryMode = historyIndex !== -1;
    
    if (e.key === 'ArrowUp' && (cursorAtStart || inHistoryMode)) {
      e.preventDefault();
      navigateHistory('up');
      return true;
    } else if (e.key === 'ArrowDown' && inHistoryMode && cursorAtEnd) {
      e.preventDefault();
      navigateHistory('down');
      return true;
    } else if (e.key === 'Escape' && inHistoryMode) {
      e.preventDefault();
      exitHistoryMode();
      return true;
    }

    return false;
  };

  return {
    historyIndex,
    inHistoryMode: historyIndex !== -1,
    handleHistoryNavigation,
    exitHistoryMode,
    resetHistoryMode,
    navigateHistory,
  };
}