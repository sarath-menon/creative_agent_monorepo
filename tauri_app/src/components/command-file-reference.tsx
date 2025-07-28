import { useEffect, useState, useRef } from 'react';
import { FolderIcon, ImageIcon, VideoIcon, AudioLines, Play } from 'lucide-react';
import { type FileEntry } from '@/hooks/useFileSystem';
import { convertFileSrc } from '@tauri-apps/api/core';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

interface Props {
  files: FileEntry[];
  onSelect: (file: FileEntry) => void;
  currentFolder?: string | null;
  isLoadingFolder?: boolean;
  onGoBack?: () => void;
  onEnterFolder?: () => void;
  onClose?: () => void;
}

// Simple media type detection
const getFileType = (fileName: string): 'image' | 'video' | 'audio' | null => {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(extension)) {
    return 'image';
  }
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv'].includes(extension)) {
    return 'video';
  }
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'wma'].includes(extension)) {
    return 'audio';
  }
  
  return null;
};

// Media thumbnail component
const MediaThumbnail = ({ file }: { file: FileEntry }) => {
  const fileType = getFileType(file.name);
  
  if (!fileType) {
    return <ImageIcon className="size-4 text-green-500" />;
  }
  
  const previewUrl = convertFileSrc(file.path);
  
  if (fileType === 'image') {
    return (
      <div className="relative flex-shrink-0">
        <img 
          src={previewUrl}
          alt={file.name}
          className="size-8 object-cover rounded-sm"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            const fallback = e.currentTarget.nextElementSibling as HTMLElement;
            if (fallback) fallback.style.display = 'block';
          }}
        />
        <ImageIcon 
          className="size-4 text-green-500 absolute top-0 left-0" 
          style={{ display: 'none' }}
        />
      </div>
    );
  }
  
  if (fileType === 'video') {
    return (
      <div className="relative size-4 flex-shrink-0">
        <video 
          src={previewUrl}
          className="size-4 object-cover rounded-sm"
          preload="metadata"
          onLoadedMetadata={(e) => {
            e.currentTarget.currentTime = 1;
          }}
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            const fallback = e.currentTarget.nextElementSibling as HTMLElement;
            if (fallback) fallback.style.display = 'block';
          }}
        />
        <Play className="absolute -bottom-0.5 -right-0.5 w-2 h-2 text-white bg-black/50 rounded-full p-0.5" />
        <VideoIcon 
          className="size-4 text-green-500 absolute top-0 left-0" 
          style={{ display: 'none' }}
        />
      </div>
    );
  }
  
  if (fileType === 'audio') {
    return <AudioLines className="size-4 text-green-500" />;
  }
  
  return <ImageIcon className="size-4 text-green-500" />;
};

export function CommandFileReference({ 
  files, 
  onSelect, 
  currentFolder, 
  isLoadingFolder, 
  onGoBack, 
  onEnterFolder,
  onClose 
}: Props) {
  const [selectedValue, setSelectedValue] = useState<string>('');
  const commandRef = useRef<HTMLDivElement>(null);
  
  // Auto-focus Command component for keyboard navigation
  useEffect(() => {
    setTimeout(() => {
      commandRef.current?.focus();
    }, 0);
  }, []);
  
  // Auto-select first item when files change
  useEffect(() => {
    if (files.length > 0) {
      setSelectedValue(files[0].name);
    }
  }, [files]);
  
  const handleSelect = (fileName: string) => {
    const file = files.find(f => f.name === fileName);
    if (!file) return;
    
    onSelect(file);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' && currentFolder && onGoBack) {
      e.preventDefault();
      onGoBack();
    } else if (e.key === 'ArrowRight') {
      const selectedFile = files.find(f => f.name === selectedValue);
      if (selectedFile?.isDirectory && onEnterFolder) {
        e.preventDefault();
        onEnterFolder(selectedFile);
      }
    } else if (e.key === 'Escape' && onClose) {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 bg-popover border border-border rounded-xl shadow-lg z-50 overflow-hidden">
      <Command 
        ref={commandRef}
        onKeyDown={handleKeyDown} 
        className="max-h-64"
        value={selectedValue}
        onValueChange={setSelectedValue}
      >
        <div className="text-xs text-muted-foreground px-3 py-2 border-b flex items-center justify-between">
          <span className="font-medium">
            {currentFolder ? `${currentFolder} (${files.length})` : `Folders & Media (${files.length})`}
          </span>
          <div className="flex items-center gap-2 text-xs">
            {currentFolder && onGoBack && (
              <button
                onClick={onGoBack}
                className="flex items-center gap-1 px-2 py-1 rounded bg-muted/40 hover:bg-muted/70 transition-colors"
                title="Go back (←)"
              >
                ←
              </button>
            )}
            {(() => {
              const selectedFile = files.find(f => f.name === selectedValue);
              return selectedFile?.isDirectory && onEnterFolder && (
                <button
                  onClick={() => onEnterFolder(selectedFile)}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-muted/40 hover:bg-muted/70 transition-colors"
                  title="Enter folder (→)"
                >
                  →
                </button>
              );
            })()}
            {onClose && (
              <button
                onClick={onClose}
                className="flex items-center gap-1 px-2 py-1 rounded bg-muted/40 hover:bg-muted/70 transition-colors"
                title="Close (Esc)"
              >
                ⌫
              </button>
            )}
          </div>
        </div>
        
        <CommandList>
          {isLoadingFolder ? (
            <div className="text-xs text-muted-foreground px-3 py-2">
              Loading folder contents...
            </div>
          ) : !files.length ? (
            <CommandEmpty>
              {currentFolder ? 'No files found in folder' : 'No folders or media files found'}
            </CommandEmpty>
          ) : (
            <CommandGroup>
              {files.map((file) => {
                const fileType = getFileType(file.name);
                const typeLabel = fileType ? fileType.charAt(0).toUpperCase() + fileType.slice(1) : 'File';
                
                return (
                  <CommandItem
                    key={file.path}
                    value={file.name}
                    onSelect={() => handleSelect(file.name)}
                  >
                    {file.isDirectory ? (
                      <FolderIcon className="size-4 text-blue-500" />
                    ) : (
                      <MediaThumbnail file={file} />
                    )}
                    <div className="flex-1">
                      <div className="font-medium text-sm">{file.name}</div>
                      {file.extension && (
                        <div className="text-xs text-muted-foreground">
                          {file.isDirectory ? 'Folder' : typeLabel} • .{file.extension}
                        </div>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </div>
  );
}