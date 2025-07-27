import { useReducer, useEffect } from 'react';
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

export const useFileReference = (text: string, setText: (text: string) => void) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { currentFiles, fetchFiles, fetchDirectoryContents } = useFileSystem();
  
  const baseFiles = state.currentFolder ? state.folderContents : currentFiles;
  const files = getMediaFiles(baseFiles);
  
  const lastWord = text.split(' ').pop() || '';
  const show = lastWord.startsWith('@') && !lastWord.includes('/');
  
  useEffect(() => {
    if (lastWord === '@') fetchFiles();
  }, [lastWord, fetchFiles]);
  
  useEffect(() => {
    dispatch({ type: 'RESET_SELECTION' });
  }, [show, files.length]);

  useEffect(() => {
    if (show) dispatch({ type: 'RESET_STATE' });
  }, [show]);
  
  const handleNavigation = (direction: 'up' | 'down') => {
    const newIndex = direction === 'down' 
      ? (state.selected < files.length - 1 ? state.selected + 1 : 0)
      : (state.selected > 0 ? state.selected - 1 : files.length - 1);
    dispatch({ type: 'SET_SELECTED', payload: newIndex });
  };

  const handleSelection = () => {
    const file = files[state.selected];
    if (!file) return;
    
    const words = text.split(' ');
    // Only add "../" if file path contains subdirectories
    const hasSubdirectory = file.path.includes('/');
    const prefix = hasSubdirectory ? '../' : '';
    words[words.length - 1] = `@${prefix}${file.name} `;
    setText(words.join(' '));
  };

  const handleEscape = () => {
    dispatch({ type: 'RESET_STATE' });
    const words = text.split(' ');
    words[words.length - 1] = '';
    setText(words.join(' ').trim());
  };

  const enterFolder = async (folder: FileEntry) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const contents = await fetchDirectoryContents(folder.path);
      dispatch({ type: 'ENTER_FOLDER', payload: { contents, folder: folder.path } });
    } catch (error) {
      console.error('Failed to load folder contents:', error);
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const goBack = async () => {
    if (!state.currentFolder) return;
    
    const parentPath = getParentPath(state.currentFolder);
    dispatch({ type: 'SET_LOADING', payload: true });
    
    try {
      if (parentPath) {
        const contents = await fetchDirectoryContents(parentPath);
        dispatch({ type: 'ENTER_FOLDER', payload: { contents, folder: parentPath } });
      } else {
        dispatch({ type: 'SET_CURRENT_FOLDER', payload: null });
        dispatch({ type: 'SET_FOLDER_CONTENTS', payload: [] });
        dispatch({ type: 'RESET_SELECTION' });
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    } catch (error) {
      console.error('Failed to load parent folder contents:', error);
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!show || !files.length) return;
    
    const keyActions: Record<string, () => void> = {
      ArrowDown: () => handleNavigation('down'),
      ArrowUp: () => handleNavigation('up'),
      ArrowLeft: () => state.currentFolder && goBack(),
      ArrowRight: () => files[state.selected]?.isDirectory && enterFolder(files[state.selected]),
      Enter: handleSelection,
      Backspace: handleEscape,
      Escape: handleEscape,
    };

    const action = keyActions[e.key];
    if (action) {
      e.preventDefault();
      action();
    }
  };
  
  const enterSelectedFolder = () => {
    const selectedFile = files[state.selected];
    if (selectedFile?.isDirectory) {
      enterFolder(selectedFile);
    }
  };

  return { 
    show, 
    files, 
    selected: state.selected, 
    handleKeyDown, 
    selectFile: handleSelection, 
    currentFolder: state.currentFolder,
    isLoadingFolder: state.isLoadingFolder,
    goBack,
    enterSelectedFolder,
    close: handleEscape
  };
};