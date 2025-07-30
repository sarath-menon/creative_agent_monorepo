import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AIInputButton } from '@/components/ui/kibo-ui/ai/input';
import { IconAccessible, IconFolder, IconDeviceDesktop, IconMicrophone, IconShield } from '@tabler/icons-react';
import { Switch } from '@/components/ui/switch';
import { 
  useAccessibilityPermission,
  useFullDiskAccessPermission,
  useScreenRecordingPermission,
  useMicrophonePermission
} from '@/hooks/usePermissions';
import type { ReactNode } from 'react';

interface PermissionsPopoverProps {
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

export function PermissionsPopover({ isOpen, onOpenChange }: PermissionsPopoverProps) {
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
  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <AIInputButton title="System permissions">
          <IconShield className='size-6' />
        </AIInputButton>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 shadow-xl border border-gray-200/50 dark:border-gray-700/50 backdrop-blur-sm" align="end">
        <div className="p-6">
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">System Permissions</h3>
            {permissions.map((permission, index) => (
              <PermissionItem key={index} {...permission} />
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}