import { IconEdit } from '@tabler/icons-react';
import { useCreateSession } from '@/hooks/useSession';

interface SessionHeaderProps {
  onNewSession?: () => void;
}

export function SessionHeader({ onNewSession }: SessionHeaderProps) {
  const createSession = useCreateSession();

  const handleNewSession = async () => {
    try {
      await createSession.mutateAsync({ title: "Chat Session" });
      onNewSession?.();
    } catch (error) {
      console.error('Failed to create new session:', error);
    }
  };

  return (
    <div className="flex justify-end">
      <button
        onClick={handleNewSession}
        disabled={createSession.isPending}
        className="flex items-center gap-2 text-sm font-medium text-stone-500 hover:text-stone-100 hover:bg-stone-700/50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Start New Session"
      >
        <IconEdit className="size-5" />
      </button>
    </div>
  );
}