export const STATUS_HEX = {
  new: '#64748B',
  assigned: '#4F46E5',
  inProgress: '#2563EB',
  completed: '#16A34A',
  cancelled: '#94A3B8',
  warning: '#D97706',
  accent: '#2563EB',
  brand: '#2563EB',
} as const;

export const JOB_STATUS_FILLS = [
  STATUS_HEX.new,
  STATUS_HEX.assigned,
  STATUS_HEX.inProgress,
  STATUS_HEX.completed,
  STATUS_HEX.cancelled,
];

export const CHART_GRID_STROKE = 'hsl(var(--foreground) / 0.06)';

export function invoiceStatusTone(status: string): 'info' | 'warning' | 'success' | 'destructive' | 'secondary' {
  const s = status.toLowerCase();
  if (s === 'sent' || s === 'open') return 'info';
  if (s === 'draft') return 'secondary';
  if (s === 'paid' || s === 'completed') return 'success';
  if (s === 'overdue' || s === 'void') return 'destructive';
  return 'secondary';
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}
