import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, Info } from 'lucide-react';

interface ComponentBreakdown {
  name: string;
  tokens: number;
  percentage: number;
  isTotal?: boolean;
}

interface ContextData {
  model: string;
  maxTokens: number;
  totalTokens: number;
  usagePercent: number;
  components: ComponentBreakdown[];
  warningLevel?: string;
  warningMessage?: string;
}

interface ContextDisplayProps {
  data: ContextData;
}

export function ContextDisplay({ data }: ContextDisplayProps) {
  const formatTokens = (tokens: number) => {
    if (tokens >= 1000) {
      return `${Math.round(tokens / 1000)}K`;
    }
    return tokens.toString();
  };

  const getWarningIcon = () => {
    if (data.warningLevel === 'high') {
      return <AlertTriangle className="w-4 h-4 text-red-500" />;
    } else if (data.warningLevel === 'medium') {
      return <Info className="w-4 h-4 text-yellow-500" />;
    }
    return null;
  };

  const getProgressColor = () => {
    if (data.usagePercent > 80) return 'bg-red-500';
    if (data.usagePercent > 60) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Context Usage Breakdown</h3>
        <p className="text-sm text-muted-foreground">
          {formatTokens(data.totalTokens)} / {formatTokens(data.maxTokens)} ({Math.round(data.usagePercent)}%) • {data.model}
        </p>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span>Usage</span>
          <span>{data.usagePercent.toFixed(1)}%</span>
        </div>
        <div className="relative">
          <Progress 
            value={data.usagePercent} 
            className="h-3"
          />
          <div 
            className={`absolute top-0 left-0 h-3 rounded-l-full transition-all ${getProgressColor()}`}
            style={{ width: `${Math.min(data.usagePercent, 100)}%` }}
          />
        </div>
      </div>

      {/* Component Breakdown Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Component</TableHead>
            <TableHead className="text-right">Tokens</TableHead>
            <TableHead className="text-right">Percentage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.components.map((component, index) => (
            <TableRow 
              key={index} 
              className={component.isTotal ? 'font-semibold border-t-2' : ''}
            >
              <TableCell>{component.name}</TableCell>
              <TableCell className="text-right">
                {(component.name === 'System Prompt' || component.name === 'Tool Descriptions') ? '~' : ''}{formatTokens(component.tokens)}
              </TableCell>
              <TableCell className="text-right">
                {component.percentage.toFixed(1)}%
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Warning Message */}
      {data.warningMessage && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50">
          {getWarningIcon()}
          <span className="text-sm">{data.warningMessage}</span>
        </div>
      )}
    </div>
  );
}