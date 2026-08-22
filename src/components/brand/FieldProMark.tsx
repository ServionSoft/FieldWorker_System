import { cn } from '@/lib/utils';

interface FieldProMarkProps {
  className?: string;
  size?: number;
  variant?: 'on-dark' | 'on-light';
}

/** Geometric FieldPro F-mark — blue/white, works at small sizes. */
export function FieldProMark({ className, size = 40, variant = 'on-light' }: FieldProMarkProps) {
  const gid = variant === 'on-dark' ? 'fpMarkDark' : 'fpMarkLight';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={gid} x1="6" y1="2" x2="36" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#60A5FA" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="10" fill={`url(#${gid})`} />
      <path
        fill="#FFFFFF"
        d="M13.5 10h15.2c.7 0 1.3.6 1.3 1.3v2.4c0 .7-.6 1.3-1.3 1.3H18.6v3.2h9.2c.7 0 1.2.6 1.2 1.2v2.3c0 .7-.5 1.2-1.2 1.2h-9.2V30c0 .8-.6 1.4-1.4 1.4h-2.4c-.8 0-1.3-.6-1.3-1.4V11.4c0-.8.6-1.4 1.3-1.4Z"
      />
      <path fill="#BFDBFE" d="M18.6 18.2h9.2c.7 0 1.2.6 1.2 1.2v.6H18.6v-1.8Z" />
    </svg>
  );
}

export function FieldProWordmark({
  className,
  stacked = true,
  inverted = false,
}: {
  className?: string;
  stacked?: boolean;
  inverted?: boolean;
}) {
  return (
    <div className={cn('flex items-center gap-2.5 min-w-0', className)}>
      <FieldProMark size={40} variant={inverted ? 'on-dark' : 'on-light'} />
      <div className="min-w-0 text-left">
        <p className={cn('font-heading font-bold text-[17px] leading-none tracking-tight', inverted ? 'text-white' : 'text-foreground')}>
          FieldPro
        </p>
        {stacked && (
          <p className={cn(
            'mt-1 text-[10px] font-medium uppercase tracking-[0.14em] leading-none',
            inverted ? 'text-white/55' : 'text-muted-foreground',
          )}>
            Field Service Management
          </p>
        )}
      </div>
    </div>
  );
}
