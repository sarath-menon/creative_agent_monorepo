import { create } from 'zustand';
import { convertFileSrc } from '@tauri-apps/api/core';
import { readDir } from '@tauri-apps/plugin-fs';

export type MediaItem = {
  path: string;
  type: 'image' | 'video' | 'audio' | 'folder';
  name: string;
  preview?: string;
  isDirectory?: boolean;
  extension?: string;
  mediaCount?: {
    images: number;
    videos: number;
    audios: number;
  };
};

interface MediaState {
  files: MediaItem[];
  referenceMap: Map<string, string>;
  addFile: (filePath: string) => void;
  addFolder: (folderPath: string) => Promise<void>;
  removeFile: (index: number) => void;
  clearFiles: () => void;
  syncWithText: (text: string) => void;
  addReference: (displayName: string, fullPath: string) => void;
  removeReference: (displayName: string) => void;
}

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv'];
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'wma'];
const MEDIA_EXTENSIONS = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS];

const getFileType = (fileName: string): 'image' | 'video' | 'audio' | null => {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  
  if (IMAGE_EXTENSIONS.includes(extension)) return 'image';
  if (VIDEO_EXTENSIONS.includes(extension)) return 'video';
  if (AUDIO_EXTENSIONS.includes(extension)) return 'audio';
  
  return null;
};

export const isMediaFile = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? MEDIA_EXTENSIONS.includes(ext) : false;
};

export const isImageFile = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? IMAGE_EXTENSIONS.includes(ext) : false;
};

export const filterAndSortEntries = (entries: any[], basePath = ''): MediaItem[] => {
  return entries
    .filter(entry => {
      if (entry.name.startsWith('.')) return false;
      if (entry.isDirectory) return true;
      const extension = entry.name.split('.').pop()?.toLowerCase();
      return extension && MEDIA_EXTENSIONS.includes(extension);
    })
    .map(entry => {
      const path = basePath ? `${basePath}/${entry.name}` : entry.name;
      const extension = entry.isFile ? entry.name.split('.').pop()?.toLowerCase() : undefined;
      const fileType = extension ? getFileType(entry.name) : null;
      
      return {
        name: entry.name,
        path,
        type: entry.isDirectory ? 'folder' as const : fileType!,
        isDirectory: entry.isDirectory,
        extension,
        preview: !entry.isDirectory && fileType ? convertFileSrc(path) : undefined
      };
    })
    .sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
};

export const getMediaFiles = (files: MediaItem[]): MediaItem[] => {
  return files.filter(f => 
    f.isDirectory || 
    (f.extension && MEDIA_EXTENSIONS.includes(f.extension))
  );
};

export const getParentPath = (path: string): string | null => {
  const parts = path.split('/');
  parts.pop();
  return parts.length > 0 ? parts.join('/') : null;
};

const countMediaFilesInFolder = async (folderPath: string): Promise<{ images: number; videos: number; audios: number }> => {
  try {
    const entries = await readDir(folderPath);
    let images = 0, videos = 0, audios = 0;
    
    for (const entry of entries) {
      if (entry.isFile) {
        const extension = entry.name.split('.').pop()?.toLowerCase();
        if (extension) {
          if (IMAGE_EXTENSIONS.includes(extension)) images++;
          else if (VIDEO_EXTENSIONS.includes(extension)) videos++;
          else if (AUDIO_EXTENSIONS.includes(extension)) audios++;
        }
      }
    }
    
    return { images, videos, audios };
  } catch (error) {
    console.warn('Failed to count media files in folder:', folderPath, error);
    return { images: 0, videos: 0, audios: 0 };
  }
};

export const useMediaStore = create<MediaState>((set, get) => ({
  files: [],
  referenceMap: new Map(),

  addFile: (filePath: string) => {
    const fileName = filePath.split('/').pop() || filePath;
    const fileType = getFileType(fileName);
    
    if (!fileType) {
      console.warn(`Unsupported file type: ${fileName}`);
      return;
    }

    const state = get();
    
    // Skip if file already exists
    if (state.files.some(file => file.path === filePath)) {
      return;
    }

    const mediaItem: MediaItem = {
      path: filePath,
      type: fileType,
      name: fileName,
      preview: convertFileSrc(filePath)
    };

    set(state => {
      const newFiles = [...state.files, mediaItem];
      if (newFiles.length > 10) {
        console.warn('Maximum 10 media files allowed');
        return { files: newFiles.slice(0, 10) };
      }
      return { files: newFiles };
    });
  },

  addFolder: async (folderPath: string) => {
    const folderName = folderPath.split('/').pop() || folderPath;
    const state = get();
    
    // Skip if folder already exists
    if (state.files.some(file => file.path === folderPath)) {
      return;
    }

    const mediaCount = await countMediaFilesInFolder(folderPath);

    const mediaItem: MediaItem = {
      path: folderPath,
      type: 'folder',
      name: folderName,
      mediaCount,
    };

    set(state => {
      const newFiles = [...state.files, mediaItem];
      if (newFiles.length > 10) {
        console.warn('Maximum 10 media files allowed');
        return { files: newFiles.slice(0, 10) };
      }
      return { files: newFiles };
    });
  },

  removeFile: (index: number) => {
    set(state => ({
      files: state.files.filter((_, i) => i !== index)
    }));
  },

  clearFiles: () => {
    set({ files: [], referenceMap: new Map() });
  },

  addReference: (displayName: string, fullPath: string) => {
    set(state => {
      const newMap = new Map(state.referenceMap);
      newMap.set(displayName, fullPath);
      return { referenceMap: newMap };
    });
  },

  removeReference: (displayName: string) => {
    set(state => {
      const newMap = new Map(state.referenceMap);
      newMap.delete(displayName);
      return { referenceMap: newMap };
    });
  },

  syncWithText: (text: string) => {
    const state = get();
    const referencedFiles = getReferencedFiles(text, state.files);
    
    // Deep comparison to prevent unnecessary updates and feedback loops
    const hasChanged = referencedFiles.length !== state.files.length ||
      referencedFiles.some((file, index) => file.path !== state.files[index]?.path);
    
    if (hasChanged) {
      set({ files: referencedFiles });
    }
  }
}));

// Utility function to expand @filename references to full paths using reference map
export const expandFileReferences = (text: string, referenceMap: Map<string, string>): string => {
  let expandedText = text;
  
  for (const [displayName, fullPath] of referenceMap) {
    expandedText = expandedText.replace(displayName, fullPath);
  }
  
  // Check for any remaining unresolved references and throw exception
  const unresolvedMatches = expandedText.match(/@[^\s]+/g);
  if (unresolvedMatches) {
    throw new Error(`Unresolved file references: ${unresolvedMatches.join(', ')}`);
  }
  
  return expandedText;
};

// Utility function to remove file references from text using reference map
export const removeFileReferences = (text: string, referenceMap: Map<string, string>, fullPath: string): string => {
  let updatedText = text;
  
  for (const [displayName, mappedPath] of referenceMap) {
    if (mappedPath === fullPath) {
      updatedText = updatedText.replace(new RegExp(`${displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'g'), '');
    }
  }
  
  return updatedText;
};

// Utility function to get files that are still referenced in text
export const getReferencedFiles = (text: string, files: MediaItem[]): MediaItem[] => {
  return files.filter(file => {
    return text.includes(`@${file.name}`) || text.includes(`@../${file.name}`);
  });
};