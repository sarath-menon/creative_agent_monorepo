import { ImageIcon, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { type MediaItem } from '@/hooks/useMediaHandler';

interface MediaPreviewProps {
  attachedMedia: MediaItem[];
  onRemoveItem: (index: number) => void;
}

export const MediaPreview = ({ attachedMedia, onRemoveItem }: MediaPreviewProps) => {
  if (attachedMedia.length === 0) {
    return null;
  }

  return (
    <div className="p-2 pb-0 border-b-0">
      <div className="flex flex-wrap gap-2">
        {attachedMedia.map((media, index) => (
          <div key={index} className="relative group">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="relative">
                    {media.type === 'image' ? (
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
                            // Hide the failed image and show fallback icon
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
                    ) : (
                      <div className="size-14 bg-stone-700/50 border border-stone-600 rounded-lg flex items-center justify-center">
                        <ImageIcon className="w-6 h-6 text-stone-400" />
                      </div>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{media.name}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <button
              onClick={() => onRemoveItem(index)}
              className="absolute top-1 right-1 p-[2px] bg-red-500/80 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors"
            >
              <X className="size-3 text-white" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};