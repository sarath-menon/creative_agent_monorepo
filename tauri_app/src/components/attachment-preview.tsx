import { ImageIcon, VideoIcon, AudioLines, Play, X, FolderIcon, AppWindowIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type Attachment } from '@/stores/attachmentStore';
import { AudioWaveform } from './audio-waveform';

interface AttachmentPreviewProps {
  attachments: Attachment[];
  onRemoveItem: (index: number) => void;
}

interface AttachmentItemPreviewProps {
  attachment: Attachment;
}

const ImagePreview = ({ attachment }: AttachmentItemPreviewProps) => {
  return (
    <div className="relative">
      <img 
        src={attachment.preview} 
        alt={attachment.name}
        className="size-14 object-cover rounded-lg border border-stone-600"
        onError={(e) => {
          console.error('❌ [Attachment Debug] Image failed to load:', { 
            name: attachment.name, 
            src: attachment.preview,
            error: e 
          });
          e.currentTarget.style.display = 'none';
          const fallback = e.currentTarget.nextElementSibling as HTMLElement;
          if (fallback) fallback.style.display = 'block';
        }}
      />
      <ImageIcon 
        className="size-14 text-stone-400 absolute top-0 left-0 rounded-lg border border-stone-600 bg-stone-700/50 p-2" 
        style={{ display: 'none' }}
      />
    </div>
  );
};

const VideoPreview = ({ attachment }: AttachmentItemPreviewProps) => {
  return (
    <div className="relative">
      <video 
        src={attachment.preview}
        className="size-14 object-cover rounded-lg border border-stone-600"
        preload="metadata"
        onLoadedMetadata={(e) => {
          e.currentTarget.currentTime = 1;
        }}
        onError={(e) => {
          console.error('❌ [Attachment Debug] Video failed to load:', { 
            name: attachment.name, 
            src: attachment.preview,
            error: e 
          });
          e.currentTarget.style.display = 'none';
          const fallback = e.currentTarget.nextElementSibling as HTMLElement;
          if (fallback) fallback.style.display = 'block';
        }}
      />
      <Play className="absolute bottom-1 left-1 w-3 h-3 text-white bg-black/50 rounded-full p-0.5" />
      <VideoIcon 
        className="size-14 text-stone-400 absolute top-0 left-0 rounded-lg border border-stone-600 bg-stone-700/50 p-2" 
        style={{ display: 'none' }}
      />
    </div>
  );
};

const AudioPreview = ({ attachment }: AttachmentItemPreviewProps) => {
  return (
    <div className="size-14 bg-stone-700/50 border border-stone-600 rounded-lg flex items-center justify-center">
      <AudioWaveform className="h-8 w-10" small />
    </div>
  );
};

const FolderPreview = ({ attachment }: AttachmentItemPreviewProps) => {
  return (
    <div className="rounded-lg flex items-center justify-center relative">
      <FolderIcon className="size-16 stroke-1 text-stone-400" />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] text-white font-medium truncate max-w-12">
          {attachment.name}
        </span>
      </div>
    </div>
  );
};

const AppPreview = ({ attachment }: AttachmentItemPreviewProps) => {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-700 rounded-md border border-gray-200 dark:border-gray-600 group hover:border-gray-300 dark:hover:border-gray-500 transition-colors min-w-0">
      <div className="flex-shrink-0 p-1 rounded-md bg-gray-50 dark:bg-gray-600 shadow-sm">
        <img 
          src={`data:image/png;base64,${attachment.icon}`} 
          alt={`${attachment.name} icon`}
          className="size-4 rounded-sm"
        />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {attachment.name}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Application
        </div>
      </div>
    </div>
  );
};

const DefaultPreview = ({ attachment }: AttachmentItemPreviewProps) => {
  return (
    <div className="size-14 bg-stone-700/50 border border-stone-600 rounded-lg flex items-center justify-center">
      <ImageIcon className="w-6 h-6 text-stone-400" />
    </div>
  );
};

export const AttachmentPreview = ({ attachments, onRemoveItem }: AttachmentPreviewProps) => {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 p-2 bg-gray-50 dark:bg-gray-800/30 rounded-lg border border-gray-200 dark:border-gray-700">
      {attachments.map((attachment, index) => (
        <div key={attachment.id} className="relative group flex-shrink-0">
          {attachment.type === 'app' ? (
            // App attachments have different styling - no tooltip, inline layout
            <div className="relative">
              <AppPreview attachment={attachment} />
              <button
                onClick={() => onRemoveItem(index)}
                className="absolute top-1 right-1 p-[2px] bg-red-500/80 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors z-10"
                title="Remove app"
              >
                <X className="size-3 text-white" />
              </button>
            </div>
          ) : (
            // File/folder/media attachments use tooltip and grid layout
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative">
                  {attachment.type === 'image' ? (
                    <ImagePreview attachment={attachment} />
                  ) : attachment.type === 'video' ? (
                    <VideoPreview attachment={attachment} />
                  ) : attachment.type === 'audio' ? (
                    <AudioPreview attachment={attachment} />
                  ) : attachment.type === 'folder' ? (
                    <FolderPreview attachment={attachment} />
                  ) : (
                    <DefaultPreview attachment={attachment} />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {attachment.type === 'folder' && attachment.mediaCount ? (
                    (() => {
                      const { images, videos, audios } = attachment.mediaCount;
                      const total = images + videos + audios;
                      if (total === 0) {
                        return `${attachment.name} - no media files`;
                      }
                      const parts = [];
                      if (images > 0) parts.push(`${images}i`);
                      if (videos > 0) parts.push(`${videos}v`);
                      if (audios > 0) parts.push(`${audios}a`);
                      return `${attachment.name} ${parts.join('/')}`;
                    })()
                  ) : (
                    attachment.name
                  )}
                </p>
              </TooltipContent>
              <button
                onClick={() => onRemoveItem(index)}
                className="absolute top-1 right-1 p-[2px] bg-red-500/80 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors z-10"
              >
                <X className="size-3 text-white" />
              </button>
            </Tooltip>
          )}
        </div>
      ))}
    </div>
  );
};