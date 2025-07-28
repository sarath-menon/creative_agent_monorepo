import { useState, useCallback } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';

export type MediaItem = {
  path: string;
  type: 'image' | 'video' | 'audio';
  name: string;
  preview: string;
};

export const useMediaHandler = () => {
  const [attachedMedia, setAttachedMedia] = useState<MediaItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  // File validation functions
  const isImageFile = (fileName: string) => {
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
    const extension = fileName.split('.').pop()?.toLowerCase();
    return imageExtensions.includes(extension || '');
  };

  const isVideoFile = (fileName: string) => {
    const videoExtensions = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv'];
    const extension = fileName.split('.').pop()?.toLowerCase();
    return videoExtensions.includes(extension || '');
  };

  const isAudioFile = (fileName: string) => {
    const audioExtensions = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'wma'];
    const extension = fileName.split('.').pop()?.toLowerCase();
    return audioExtensions.includes(extension || '');
  };

  const handleMediaAttachment = useCallback(async (filePaths: string[]) => {
    const validMedia: MediaItem[] = [];
    const maxFileSize = 50 * 1024 * 1024; // 50MB limit
    
    for (const path of filePaths) {
      const fileName = path.split('/').pop() || path;
      
      try {
        // Basic file validation
        if (isImageFile(fileName)) {
          const previewUrl = convertFileSrc(path);
          
          validMedia.push({
            path,
            type: 'image',
            name: fileName,
            preview: previewUrl
          });
        } else if (isVideoFile(fileName)) {
          const previewUrl = convertFileSrc(path);
          
          validMedia.push({
            path,
            type: 'video', 
            name: fileName,
            preview: previewUrl
          });
        } else if (isAudioFile(fileName)) {
          const previewUrl = convertFileSrc(path);
          
          validMedia.push({
            path,
            type: 'audio',
            name: fileName,
            preview: previewUrl
          });
        } else {
          console.warn(`Unsupported file type: ${fileName}`);
        }
      } catch (error) {
        console.error(`Failed to process file ${fileName}:`, error);
      }
    }
    
    if (validMedia.length > 0) {
      setAttachedMedia(prev => {
        const combined = [...prev, ...validMedia];
        if (combined.length > 10) {
          console.warn('Maximum 10 media files allowed');
          return combined.slice(0, 10);
        }
        return combined;
      });
    }
  }, []);

  const handleOpenFileDialog = useCallback(async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{
          name: 'Media',
          extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'wma']
        }]
      });
      
      if (selected && Array.isArray(selected)) {
        await handleMediaAttachment(selected);
      } else if (selected) {
        await handleMediaAttachment([selected]);
      }
    } catch (error) {
      console.error('Failed to open file dialog:', error);
    }
  }, [handleMediaAttachment]);

  const removeMediaItem = useCallback((index: number) => {
    setAttachedMedia(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    const filePaths = files.map(file => file.path || file.name);
    
    if (filePaths.length > 0) {
      await handleMediaAttachment(filePaths);
    }
  }, [handleMediaAttachment]);

  const clearMedia = useCallback(() => {
    setAttachedMedia([]);
  }, []);

  return {
    attachedMedia,
    isDragOver,
    handleOpenFileDialog,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    removeMediaItem,
    clearMedia
  };
};