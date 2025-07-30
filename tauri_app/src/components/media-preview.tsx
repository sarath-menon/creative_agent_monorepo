import { ImageIcon, VideoIcon, AudioLines, Play, X, FolderIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type MediaItem } from '@/stores/mediaStore';
import { AudioWaveform } from './audio-waveform';

interface MediaPreviewProps {
  attachedMedia: MediaItem[];
  onRemoveItem: (index: number) => void;
}

interface MediaItemPreviewProps {
  media: MediaItem;
}

const ImagePreview = ({ media }: MediaItemPreviewProps) => {
  return (
    <div className="relative">
      <img 
        src={media.preview} 
        alt={media.name}
        className="size-14 object-cover rounded-lg border border-stone-600"
        onError={(e) => {
          console.error('❌ [Media Debug] Image failed to load:', { 
            name: media.name, 
            src: media.preview,
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

const VideoPreview = ({ media }: MediaItemPreviewProps) => {
  return (
    <div className="relative">
      <video 
        src={media.preview}
        className="size-14 object-cover rounded-lg border border-stone-600"
        preload="metadata"
        onLoadedMetadata={(e) => {
          e.currentTarget.currentTime = 1;
        }}
        onError={(e) => {
          console.error('❌ [Media Debug] Video failed to load:', { 
            name: media.name, 
            src: media.preview,
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

const AudioPreview = ({ media }: MediaItemPreviewProps) => {
  return (
    <div className="size-14 bg-stone-700/50 border border-stone-600 rounded-lg flex items-center justify-center">
      <AudioWaveform className="h-8 w-10" small />
    </div>
  );
};

const FolderPreview = ({ media }: MediaItemPreviewProps) => {
  return (
    <div className="rounded-lg flex items-center justify-center relative">
      <FolderIcon className="size-16 stroke-1 text-stone-400" />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] text-white font-medium truncate max-w-12">
          {media.name}
        </span>
      </div>
    </div>
  );
};

const DefaultPreview = ({ media }: MediaItemPreviewProps) => {
  return (
    <div className="size-14 bg-stone-700/50 border border-stone-600 rounded-lg flex items-center justify-center">
      <ImageIcon className="w-6 h-6 text-stone-400" />
    </div>
  );
};

export const MediaPreview = ({ attachedMedia, onRemoveItem }: MediaPreviewProps) => {
  if (attachedMedia.length === 0) {
    return null;
  }

  return (
    <div className="px-2  border-b-0">
      <div className="flex gap-2  scrollbar-hide">
        {attachedMedia.map((media, index) => (
          <div key={index} className="relative group flex-shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative">
                    {media.type === 'image' ? (
                      <ImagePreview media={media} />
                    ) : media.type === 'video' ? (
                      <VideoPreview media={media} />
                    ) : media.type === 'audio' ? (
                      <AudioPreview media={media} />
                    ) : media.type === 'folder' ? (
                      <FolderPreview media={media} />
                    ) : (
                      <DefaultPreview media={media} />
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {media.type === 'folder' && media.mediaCount ? (
                      (() => {
                        const { images, videos, audios } = media.mediaCount;
                        const total = images + videos + audios;
                        if (total === 0) {
                          return `${media.name} - no media files`;
                        }
                        const parts = [];
                        if (images > 0) parts.push(`${images}i`);
                        if (videos > 0) parts.push(`${videos}v`);
                        if (audios > 0) parts.push(`${audios}a`);
                        return `${media.name} ${parts.join('/')}`;
                      })()
                    ) : (
                      media.name
                    )}
                  </p>
                </TooltipContent>
              </Tooltip>
            <button
              onClick={() => onRemoveItem(index)}
              className="absolute top-1 right-1 p-[2px] bg-red-500/80 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors z-10"
            >
              <X className="size-3 text-white" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};