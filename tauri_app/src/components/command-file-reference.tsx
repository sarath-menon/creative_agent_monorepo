import { useEffect, useState, useRef } from 'react';
import { FolderIcon, ImageIcon, ArrowLeftIcon, ArrowRightIcon } from 'lucide-react';
import { type FileEntry } from '@/hooks/useFileSystem';
import { isImageFile } from '@/lib/fileUtils';
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
                const isImage = !file.isDirectory && file.extension && isImageFile(file.name);
                return (
                  <CommandItem
                    key={file.path}
                    value={file.name}
                    onSelect={() => handleSelect(file.name)}
                  >
                    {file.isDirectory ? (
                      <FolderIcon className="size-4 text-blue-500" />
                    ) : (
                      <ImageIcon className="size-4 text-green-500" />
                    )}
                    <div className="flex-1">
                      <div className="font-medium text-sm">{file.name}</div>
                      {file.extension && (
                        <div className="text-xs text-muted-foreground">
                          {file.isDirectory ? 'Folder' : (isImage ? 'Image' : 'Video')} • .{file.extension}
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