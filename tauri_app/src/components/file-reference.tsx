import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface FileReferenceProps {
  filename: string;
  fullPath: string;
  children: React.ReactNode;
}

export function FileReference({ filename, fullPath, children }: FileReferenceProps) {
  return (
    <Tooltip>
      <TooltipTrigger>
        <span className="text-blue-600 bg-blue-50 px-1 rounded font-medium">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {fullPath}
      </TooltipContent>
    </Tooltip>
  );
}