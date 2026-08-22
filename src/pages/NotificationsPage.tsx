import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFieldPro } from '@/hooks/useFieldPro';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function NotificationsPage() {
  const { notifications, markNotificationRead, markAllNotificationsRead } = useFieldPro();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const visible = notifications.filter((n) => filter === 'all' || !n.read);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-heading font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">{notifications.filter((n) => !n.read).length} unread</p>
        </div>
        <div className="flex gap-2">
          <Button variant={filter === 'unread' ? 'default' : 'outline'} size="sm" onClick={() => setFilter(filter === 'unread' ? 'all' : 'unread')}>
            {filter === 'unread' ? 'Show all' : 'Unread only'}
          </Button>
          <Button variant="outline" onClick={() => markAllNotificationsRead()}>Mark all read</Button>
        </div>
      </div>
      <Card>
        <CardContent className="p-0 divide-y">
          {visible.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">
              {filter === 'unread' ? 'No unread notifications.' : "You're all caught up."}
            </p>
          )}
          {visible.map((n) => (
            <button
              key={n.id}
              className={`w-full text-left p-4 hover:bg-muted/50 ${n.read ? '' : 'bg-primary/5'}`}
              onClick={async () => {
                if (!n.read) await markNotificationRead(n.id);
                if (n.linkPath) navigate(n.linkPath);
              }}
            >
              <p className={`text-sm ${n.read ? 'text-muted-foreground' : 'font-medium'}`}>{n.title}</p>
              <p className="text-xs text-muted-foreground mt-1">{n.message}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{new Date(n.timestamp).toLocaleString()}</p>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
