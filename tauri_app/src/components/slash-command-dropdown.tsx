import { Command, HelpCircle } from 'lucide-react';

const slashCommands = [
  { id: 'help', name: 'help', description: 'Get assistance and guidance', icon: HelpCircle },
  { id: 'mcp', name: 'mcp', description: 'Model Context Protocol', icon: Command },
  { id: 'session', name: 'session', description: 'User Session Management', icon: Command },
  { id: 'sessions', name: 'sessions', description: 'List all available sessions', icon: Command },
  { id: 'context', name: 'context', description: 'Show context usage breakdown', icon: Command },
];

interface SlashCommandDropdownProps {
  isVisible: boolean;
  selectedIndex: number;
  onCommandSelect: (command: typeof slashCommands[0]) => void;
}

export function SlashCommandDropdown({ isVisible, selectedIndex, onCommandSelect }: SlashCommandDropdownProps) {
  if (!isVisible) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 bg-popover border border-border rounded-xl shadow-lg z-50 overflow-hidden p-2">
      {slashCommands.map((command, index) => {
        const Icon = command.icon;
        return (
          <div
            key={command.id}
            className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
              index === selectedIndex 
                ? 'bg-muted/80  rounded-md' 
                : 'hover:bg-muted/30'
            }`}
            onClick={() => onCommandSelect(command)}
          >
            <Icon className="size-4 text-muted-foreground" />
            <div className="flex-1">
              <div className="font-medium">/{command.name}</div>
              <div className="text-xs text-muted-foreground">{command.description}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Export the commands and utilities for external use
export { slashCommands };

// Utility functions for slash command logic
export const shouldShowSlashCommands = (text: string): boolean => {
  return text === '/' || (text.startsWith('/') && !text.includes(' '));
};

export const handleSlashCommandNavigation = (
  e: React.KeyboardEvent,
  isVisible: boolean,
  selectedIndex: number,
  onIndexChange: (index: number) => void,
  onCommandSelect: (command: typeof slashCommands[0]) => void,
  onClose: () => void
): boolean => {
  if (!isVisible) return false;

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      onIndexChange(selectedIndex < slashCommands.length - 1 ? selectedIndex + 1 : 0);
      return true;
    case 'ArrowUp':
      e.preventDefault();
      onIndexChange(selectedIndex > 0 ? selectedIndex - 1 : slashCommands.length - 1);
      return true;
    case 'Enter':
      e.preventDefault();
      onCommandSelect(slashCommands[selectedIndex]);
      return true;
    case 'Escape':
      e.preventDefault();
      onClose();
      return true;
  }
  
  return false;
};