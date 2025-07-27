import { useReducer, useEffect, useRef } from 'react';
import { useFileSystem, type FileEntry } from './useFileSystem';
import { getMediaFiles, getParentPath } from '@/lib/fileUtils';

type State = {
  selected: number;
  folderContents: FileEntry[];
  currentFolder: string | null;
  isLoadingFolder: boolean;
};

type Action = 
  | { type: 'SET_SELECTED'; payload: number }
  | { type: 'RESET_SELECTION' }
  | { type: 'SET_FOLDER_CONTENTS'; payload: FileEntry[] }
  | { type: 'SET_CURRENT_FOLDER'; payload: string | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'RESET_STATE' }
  | { type: 'ENTER_FOLDER'; payload: { contents: FileEntry[]; folder: string } };

const initialState: State = {
  selected: 0,
  folderContents: [],
  currentFolder: null,
  isLoadingFolder: false,
};

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'SET_SELECTED':
      return { ...state, selected: action.payload };
    case 'RESET_SELECTION':
      return { ...state, selected: 0 };
    case 'SET_FOLDER_CONTENTS':
      return { ...state, folderContents: action.payload };
    case 'SET_CURRENT_FOLDER':
      return { ...state, currentFolder: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoadingFolder: action.payload };
    case 'RESET_STATE':
      return initialState;
    case 'ENTER_FOLDER':
      return {
        ...state,
        folderContents: action.payload.contents,
        currentFolder: action.payload.folder,
        selected: 0,
        isLoadingFolder: false,
      };
    default:
      return state;
  }
};

export const useFileReference = (text: string, setText: (text: string) => void, customBasePath?: string, inputElement?: HTMLTextAreaElement | null) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { currentFiles, fetchFiles, fetchDirectoryContents } = useFileSystem(customBasePath);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const startDebouncedLoading = () => {
    // Clear any existing timeout
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
    }
    
    // Set loading after 150ms delay
    loadingTimeoutRef.current = setTimeout(() => {
      dispatch({ type: 'SET_LOADING', payload: true });
      loadingTimeoutRef.current = null;
    }, 150);
  };
  
  const clearLoadingTimeout = () => {
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
  };
  
  const baseFiles = state.currentFolder ? state.folderContents : currentFiles;
  const files = getMediaFiles(baseFiles);
  
  const lastWord = text.trim().split(/\s+/).pop() || '';
  const show = lastWord.startsWith('@') && !lastWord.includes('/');
  
  useEffect(() => {
    if (show) {
      fetchFiles();
    }
  }, [show, fetchFiles]);
  
  useEffect(() => {
    dispatch({ type: 'RESET_SELECTION' });
  }, [files.length]);

  useEffect(() => {
    if (show && !state.currentFolder) {
      dispatch({ type: 'RESET_STATE' });
    }
  }, [show, state.currentFolder]);

  // Cleanup timeout on unmount or when popup is hidden
  useEffect(() => {
    return () => {
      clearLoadingTimeout();
    };
  }, []);

  useEffect(() => {
    if (!show) {
      clearLoadingTimeout();
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [show]);
  

  const handleSelection = (selectedFile?: FileEntry) => {
    const file = selectedFile || files[state.selected];
    if (!file) return;
    
    const words = text.split(' ');
    // Only add "../" if file path contains subdirectories
    const hasSubdirectory = file.path.includes('/');
    const prefix = hasSubdirectory ? '../' : '';
    words[words.length - 1] = `@${prefix}${file.name} `;
    const newText = words.join(' ');
    setText(newText);
    
    // Focus input and set cursor to end
    if (inputElement) {
      inputElement.focus();
      const textLength = newText.length;
      inputElement.setSelectionRange(textLength, textLength);
    }
  };

  const handleEscape = () => {
    dispatch({ type: 'RESET_STATE' });
    const words = text.split(' ');
    words[words.length - 1] = '';
    const newText = words.join(' ').trim();
    setText(newText);
    
    // Focus input and set cursor to end
    if (inputElement) {
      inputElement.focus();
      const textLength = newText.length;
      inputElement.setSelectionRange(textLength, textLength);
    }
  };

  const enterFolder = async (folder: FileEntry) => {
    startDebouncedLoading();
    try {
      const contents = await fetchDirectoryContents(folder.path);
      clearLoadingTimeout(); // Clear timeout since operation completed
      dispatch({ type: 'ENTER_FOLDER', payload: { contents, folder: folder.path } });
    } catch (error) {
      console.error('Failed to load folder contents:', error);
      clearLoadingTimeout(); // Clear timeout on error
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const goBack = async () => {
    if (!state.currentFolder) return;
    
    const parentPath = getParentPath(state.currentFolder);
    startDebouncedLoading();
    
    try {
      if (parentPath) {
        const contents = await fetchDirectoryContents(parentPath);
        clearLoadingTimeout(); // Clear timeout since operation completed
        dispatch({ type: 'ENTER_FOLDER', payload: { contents, folder: parentPath } });
      } else {
        clearLoadingTimeout(); // Clear timeout for immediate operation
        dispatch({ type: 'SET_CURRENT_FOLDER', payload: null });
        dispatch({ type: 'SET_FOLDER_CONTENTS', payload: [] });
        dispatch({ type: 'RESET_SELECTION' });
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    } catch (error) {
      console.error('Failed to load parent folder contents:', error);
      clearLoadingTimeout(); // Clear timeout on error
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };
  
  
  const enterSelectedFolder = (file?: FileEntry) => {
    const selectedFile = file || files[state.selected];
    if (selectedFile?.isDirectory) {
      // Update selected state before entering
      const fileIndex = files.indexOf(selectedFile);
      if (fileIndex !== -1) {
        dispatch({ type: 'SET_SELECTED', payload: fileIndex });
      }
      enterFolder(selectedFile);
    }
  };

  return { 
    show, 
    files, 
    selected: state.selected, 
    selectFile: handleSelection, 
    currentFolder: state.currentFolder,
    isLoadingFolder: state.isLoadingFolder,
    goBack,
    enterSelectedFolder,
    close: handleEscape
  };
};