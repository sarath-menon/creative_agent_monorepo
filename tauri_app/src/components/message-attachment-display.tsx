import { type Attachment } from '@/stores/attachmentStore';

interface MessageAttachmentDisplayProps {
  attachments: Attachment[];
}

export function MessageAttachmentDisplay({ attachments }: MessageAttachmentDisplayProps) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {attachments.map((attachment, index) => (
        <div
          key={`${attachment.id}-${index}`}
          className="flex items-center gap-2 px-2 py-1.5 bg-blue-50 dark:bg-blue-900/30 rounded-md border border-blue-200 dark:border-blue-700"
        >
          {attachment.type === 'app' ? (
            // App attachment display
            <>
              <div className="flex-shrink-0 p-0.5 rounded-sm bg-white dark:bg-gray-700 shadow-sm">
                <img 
                  src={`data:image/png;base64,${attachment.icon}`} 
                  alt={`${attachment.name} icon`}
                  className="size-3 rounded-sm"
                />
              </div>
              <div className="text-xs font-medium text-blue-900 dark:text-blue-100">
                {attachment.name}
              </div>
            </>
          ) : (
            // File/folder/media attachment display
            <>
              <div className="text-xs font-medium text-blue-900 dark:text-blue-100">
                {attachment.name}
              </div>
              {attachment.type === 'folder' && attachment.mediaCount && (
                <div className="text-xs text-blue-700 dark:text-blue-300">
                  {(() => {
                    const { images, videos, audios } = attachment.mediaCount;
                    const total = images + videos + audios;
                    if (total === 0) return 'no media';
                    const parts = [];
                    if (images > 0) parts.push(`${images}i`);
                    if (videos > 0) parts.push(`${videos}v`);
                    if (audios > 0) parts.push(`${audios}a`);
                    return parts.join('/');
                  })()}
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}