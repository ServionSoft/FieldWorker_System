import { cn } from '@/lib/utils';

export function FieldError({ id, message, className }: { id?: string; message?: string; className?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className={cn('text-xs text-destructive mt-1 break-words', className)}>
      {message}
    </p>
  );
}

export function fieldInvalidProps(name: string, error?: string) {
  return {
    name,
    id: name,
    'aria-invalid': (Boolean(error) || undefined) as boolean | undefined,
    'aria-describedby': error ? `${name}-error` : undefined,
  };
}
