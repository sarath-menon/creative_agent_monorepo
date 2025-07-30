import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AIInputButton } from '@/components/ui/kibo-ui/ai/input';
import { IconBrandAppstore, IconAccessible, IconFolder, IconDeviceDesktop, IconMicrophone } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { LoadingDots } from './loading-dots';
import { useOpenApps } from '@/hooks/useOpenApps';
import { 
  useAccessibilityPermission,
  useFullDiskAccessPermission,
  useScreenRecordingPermission,
  useMicrophonePermission
} from '@/hooks/usePermissions';
import type { ReactNode } from 'react';

interface AppDisplayPopoverProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PermissionConfig {
  icon: ReactNode;
  label: string;
  hook: ReturnType<typeof useAccessibilityPermission>;
}

function PermissionItem({ icon, label, hook }: PermissionConfig) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50/50 dark:bg-gray-800/30 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      <div className="flex items-center gap-3">
        <div className="p-1.5 rounded-md bg-white dark:bg-gray-700 shadow-sm">
          {icon}
        </div>
        <div>
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</span>
        </div>
      </div>
      <Switch 
        checked={hook.isGranted} 
        onCheckedChange={() => !hook.isGranted && hook.request()}
        disabled={hook.isLoading || hook.isRequesting}
      />
    </div>
  );
}

export function AppDisplayPopover({ isOpen, onOpenChange }: AppDisplayPopoverProps) {
  const { apps: openApps, isLoading: appsLoading } = useOpenApps();
  
  // Permission hooks - only run when popover is open
  const accessibility = useAccessibilityPermission(isOpen);
  const fullDiskAccess = useFullDiskAccessPermission(isOpen);
  const screenRecording = useScreenRecordingPermission(isOpen);
  const microphone = useMicrophonePermission(isOpen);
  
  const permissions: PermissionConfig[] = [
    {
      icon: <IconAccessible className="size-4 text-gray-600 dark:text-gray-300" />,
      label: "Accessibility",
      hook: accessibility
    },
    {
      icon: <IconFolder className="size-4 text-gray-600 dark:text-gray-300" />,
      label: "Full Disk Access",
      hook: fullDiskAccess
    },
    {
      icon: <IconDeviceDesktop className="size-4 text-gray-600 dark:text-gray-300" />,
      label: "Screen Recording",
      hook: screenRecording
    },
    {
      icon: <IconMicrophone className="size-4 text-gray-600 dark:text-gray-300" />,
      label: "Microphone",
      hook: microphone
    }
  ];
  
  // Filter apps to only show specified ones
  const allowedApps = ['Notes', 'Obsidian', 'Blender', 'Pixelmator Pro', 'Final Cut Pro'];
  const filteredApps = openApps.filter(app => 
    allowedApps.some(allowedApp => 
      app.name.toLowerCase().includes(allowedApp.toLowerCase())
    )
  );
  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <AIInputButton title="View open applications">
          <IconBrandAppstore className='size-6' />
        </AIInputButton>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 shadow-xl border border-gray-200/50 dark:border-gray-700/50  backdrop-blur-sm" align="end">
        <div className="p-6 space-y-6">
            <div className="space-y-3">
              {permissions.map((permission, index) => (
                <PermissionItem key={index} {...permission} />
              ))}
          </div>

          {/* Open Applications Section */}
          <div className="space-y-4 ">
            {appsLoading && filteredApps.length === 0 ? (
              <div className="flex items-center gap-3 p-4 rounded-lg ">
                <LoadingDots />
                <span className="text-sm text-gray-600 dark:text-gray-400">Loading applications...</span>
              </div>
            ) : filteredApps.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {filteredApps.map((app) => (
                  <div 
                    key={app.name} 
                    className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-gray-50/50 to-gray-100/50 dark:from-gray-800/30 dark:to-gray-700/30 hover:from-gray-100/80 hover:to-gray-200/80 dark:hover:from-gray-700/50 dark:hover:to-gray-600/50 transition-all duration-200 border border-gray-200/20 dark:border-gray-700/20"
                  >
                    <div className="flex-shrink-0 p-1.5 rounded-md bg-white dark:bg-gray-700 shadow-sm">
                      <img 
                        src={`data:image/png;base64,${app.icon_png_base64}`} 
                        alt={`${app.name} icon`}
                        className="size-5 rounded-sm"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {app.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Active
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-lg text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">No supported applications are currently open.</p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Supported: Notes, Obsidian, Blender, Pixelmator Pro</p>
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}