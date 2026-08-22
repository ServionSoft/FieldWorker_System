import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type StatTone = 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'muted';

const toneDot: Record<StatTone, string> = {
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  accent: 'bg-primary',
  muted: 'bg-muted-foreground',
};

interface StatCardProps {
  label: string;
  value: ReactNode;
  tone: StatTone;
  className?: string;
  trend?: string;
}

export function StatCard({ label, value, tone, className, trend }: StatCardProps) {
  return (
    <Card className={cn('rounded-[10px]', className)}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground leading-none">
            {label}
          </p>
          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', toneDot[tone])} />
        </div>
        <p className="font-heading text-[1.65rem] font-semibold tabular-nums mt-2.5 leading-none tracking-tight text-foreground">
          {value}
        </p>
        {trend && (
          <p className={cn('text-xs mt-2 font-medium', trend.startsWith('-') ? 'text-destructive' : 'text-success')}>
            {trend}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
