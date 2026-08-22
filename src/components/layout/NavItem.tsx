import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItemProps {
  to: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
  showLabel: boolean;
  onClick?: () => void;
}

export function NavItem({ to, icon: Icon, label, active, showLabel, onClick }: NavItemProps) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 h-9 mx-2 px-2.5 rounded-lg text-[13px] font-medium transition-colors',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-muted hover:text-foreground hover:bg-sidebar-hover',
      )}
    >
      <Icon className={cn('w-4 h-4 shrink-0', active && 'text-primary')} strokeWidth={1.75} />
      {showLabel && (
        <span className="truncate">{label}</span>
      )}
    </Link>
  );
}
