import { Play, ImageIcon, FolderIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AudioWaveform } from './audio-waveform';
import { type MediaItem } from '@/stores/mediaStore';

interface MessageMediaDisplayProps {
  media: MediaItem[];
}

export function MessageMediaDisplay({ media }: MessageMediaDisplayProps) {
  if (!media || media.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {media.map((mediaItem, index) => (
        <div key={index} className="relative">
          {mediaItem.type === 'image' ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <img 
                    src={mediaItem.preview} 
                    alt={mediaItem.name}
                    className="max-w-xs max-h-48 object-cover rounded-lg"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{mediaItem.name}</p>
              </TooltipContent>
            </Tooltip>
          ) : mediaItem.type === 'video' ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative">
                  <video 
                    src={mediaItem.preview}
                    className="max-w-xs max-h-48 object-cover rounded-lg"
                    preload="metadata"
                    onLoadedMetadata={(e) => {
                      e.currentTarget.currentTime = 1;
                    }}
                    onError={(e) => {
                      console.error('❌ [Media Debug] Video failed to load in chat:', { 
                        name: mediaItem.name, 
                        src: mediaItem.preview,
                        error: e 
                      });
                    }}
                  />
                  <Play className="absolute bottom-2 left-2 size-8 text-white bg-black/30 rounded-full p-0.5"/>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{mediaItem.name}</p>
              </TooltipContent>
            </Tooltip>
          ) : mediaItem.type === 'audio' ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="bg-stone-700/50 rounded-lg p-4 max-w-xs">
                  <AudioWaveform className="h-12 w-16" />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{mediaItem.name}</p>
              </TooltipContent>
            </Tooltip>
          ) : mediaItem.type === 'folder' ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 bg-stone-700/50 rounded-lg p-3">
                  <FolderIcon className="w-6 h-6 text-stone-400" />
                  <span className="text-sm text-stone-300">{mediaItem.name}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{mediaItem.name}</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-2 bg-stone-700/50 rounded-lg p-3">
              <ImageIcon className="w-6 h-6 text-stone-400" />
              <span className="text-sm text-stone-300">{mediaItem.name}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}