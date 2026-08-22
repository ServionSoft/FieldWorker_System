import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useFieldPro } from '@/hooks/useFieldPro';
import { cn } from '@/lib/utils';

export function NotificationBell({ allPath }: { allPath: string }) {
  const { notifications, markNotificationRead, markAllNotificationsRead } = useFieldPro();
  const navigate = useNavigate();
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unread > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary ring-2 ring-card" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0 rounded-[10px] shadow-theme-md flex flex-col max-h-[min(24rem,70vh)]">
        <div className="p-3 border-b border-border flex justify-between items-center shrink-0">
          <span className="font-medium text-sm">Notifications</span>
          <button className="text-xs text-primary hover:underline" onClick={() => markAllNotificationsRead()}>Mark all read</button>
        </div>
        <div className="overflow-y-auto flex-1 min-h-0">
          {notifications.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground text-center">No notifications yet</div>
          )}
          {notifications.slice(0, 8).map((n) => (
            <DropdownMenuItem
              key={n.id}
              className={cn(
                'flex flex-col items-start p-3 gap-1 cursor-pointer rounded-none border-b border-border last:border-0',
                n.read ? 'bg-card' : 'bg-primary-light',
              )}
              onClick={async () => {
                if (!n.read) await markNotificationRead(n.id);
                navigate(n.linkPath || allPath);
              }}
            >
              <span className="flex items-center gap-2 text-sm">
                {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                <span className={n.read ? 'text-muted-foreground' : 'font-medium text-foreground'}>{n.title}</span>
              </span>
              <span className="text-xs text-muted-foreground line-clamp-2 pl-3.5">{n.message}</span>
              <span className="text-[10px] text-muted-foreground pl-3.5">{new Date(n.timestamp).toLocaleString()}</span>
            </DropdownMenuItem>
          ))}
        </div>
        <DropdownMenuItem className="justify-center text-xs text-primary cursor-pointer rounded-none shrink-0 border-t border-border" onClick={() => navigate(allPath)}>
          See all
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
