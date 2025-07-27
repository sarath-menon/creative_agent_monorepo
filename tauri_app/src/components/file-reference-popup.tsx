import { FolderIcon, ImageIcon, ArrowLeftIcon, ArrowRightIcon, KeyIcon } from 'lucide-react';
import { type FileEntry } from '@/hooks/useFileSystem';
import { isImageFile } from '@/lib/fileUtils';

interface Props {
  files: FileEntry[];
  selected: number;
  onSelect: (file: FileEntry) => void;
  currentFolder?: string | null;
  isLoadingFolder?: boolean;
  onGoBack?: () => void;
  onEnterFolder?: () => void;
  onClose?: () => void;
}

interface FileItemProps {
  file: FileEntry;
  isSelected: boolean;
  onSelect: (file: FileEntry) => void;
}

const FileItem = ({ file, isSelected, onSelect }: FileItemProps) => {
  const Icon = file.isDirectory ? FolderIcon : ImageIcon;
  const iconColor = file.isDirectory ? 'text-blue-500' : 'text-green-500';
  const isImage = file.extension && isImageFile(file.name);
  
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
        isSelected ? 'bg-muted/80 rounded-md' : 'hover:bg-muted/30'
      }`}
      onClick={() => onSelect(file)}
    >
      <Icon className={`size-4 ${iconColor}`} />
      <div className="flex-1">
        <div className="font-medium text-sm">{file.name}</div>
        {file.extension && !file.isDirectory && (
          <div className="text-xs text-muted-foreground">
            {isImage ? 'Image' : 'Video'} • .{file.extension}
          </div>
        )}
      </div>
    </div>
  );
};


const KeyShortcut = ({ children, onClick, title }: { children: React.ReactNode; onClick?: () => void; title?: string }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-1 px-3 rounded-md bg-muted/40 hover:bg-muted/70 hover:text-foreground transition-colors text-sm font-mono font-medium"
    title={title}
  >
    {children}
  </button>
);

const Header = ({ currentFolder, filesCount, onGoBack, canNavigateForward, onEnterFolder, onClose }: { 
  currentFolder?: string | null; 
  filesCount: number; 
  onGoBack?: () => void;
  canNavigateForward?: boolean;
  onEnterFolder?: () => void;
  onClose?: () => void;
}) => (
  <div className="text-xs text-muted-foreground px-3 py-1 border-b mb-2 flex items-center justify-between">
    <span className="font-medium">
      {currentFolder ? `${currentFolder} (${filesCount})` : `Folders & Media (${filesCount})`}
    </span>
    <div className="flex items-center gap-2">
       {onClose && (
        <KeyShortcut onClick={onClose} title="Close">
          ⌫
        </KeyShortcut>
      )}
      {currentFolder && onGoBack && (
        <KeyShortcut onClick={onGoBack} title="Go back">
          ←
        </KeyShortcut>
      )}
      {canNavigateForward && onEnterFolder && (
        <KeyShortcut onClick={onEnterFolder} title="Enter folder">
          →
        </KeyShortcut>
      )}
     
    </div>
  </div>
);

export function FileReferencePopup({ files, selected, onSelect, currentFolder, isLoadingFolder, onGoBack, onEnterFolder, onClose }: Props) {
  const selectedFile = files[selected];
  const canNavigateForward = selectedFile?.isDirectory;

  const handleEnterFolder = () => {
    if (selectedFile?.isDirectory && onEnterFolder) {
      onEnterFolder();
    }
  };

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 bg-popover border border-border rounded-xl shadow-lg z-50 overflow-hidden p-2 max-h-64 overflow-y-auto">
      <Header 
        currentFolder={currentFolder} 
        filesCount={files.length} 
        onGoBack={onGoBack}
        canNavigateForward={canNavigateForward}
        onEnterFolder={handleEnterFolder}
        onClose={onClose}
      />
      
      {isLoadingFolder ? (
        <div className="text-xs text-muted-foreground px-3 py-2">
          Loading folder contents...
        </div>
      ) : !files.length ? (
        <div className="text-xs text-muted-foreground px-3 py-2">
          {currentFolder ? 'No files found in folder' : 'No folders or media files found'}
        </div>
      ) : (
        files.map((file, index) => (
          <FileItem
            key={file.path}
            file={file}
            isSelected={index === selected}
            onSelect={onSelect}
          />
        ))
      )}
    </div>
  );
}