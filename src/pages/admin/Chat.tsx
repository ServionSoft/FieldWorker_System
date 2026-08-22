import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFieldPro } from '@/hooks/useFieldPro';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { useChatSocket } from '@/hooks/useChatSocket';

const AdminChat = () => {
  const { currentUser, workers } = useFieldPro();
  const qc = useQueryClient();
  const companyWorkers = workers.filter(w =>
    (!currentUser?.companyId || w.companyId === currentUser.companyId) && w.status !== 'inactive',
  );
  const firstWorkerId = companyWorkers[0]?.id;
  const [selectedWorker, setSelectedWorker] = useState('');
  const [threadId, setThreadId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [opening, setOpening] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  useChatSocket(threadId);

  useEffect(() => {
    if (!selectedWorker && firstWorkerId) setSelectedWorker(firstWorkerId);
  }, [selectedWorker, firstWorkerId]);

  useEffect(() => {
    if (!selectedWorker) {
      setThreadId(null);
      return;
    }
    let cancelled = false;
    setOpening(true);
    api.chat.ensureThread(selectedWorker)
      .then((t) => { if (!cancelled) setThreadId(t.id); })
      .catch(() => { if (!cancelled) toast.error('Could not open chat'); })
      .finally(() => { if (!cancelled) setOpening(false); });
    return () => { cancelled = true; };
  }, [selectedWorker]);

  const threadsQ = useQuery({
    queryKey: ['chat', 'threads'],
    queryFn: api.chat.threads,
    refetchInterval: 8000,
  });

  const messagesQ = useQuery({
    queryKey: ['chat', threadId],
    queryFn: () => api.chat.messages(threadId!),
    enabled: !!threadId,
    refetchInterval: 4000,
  });
  const conversation = messagesQ.data ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation.length, threadId]);

  useEffect(() => {
    if (threadId) void api.chat.read(threadId).then(() => qc.invalidateQueries({ queryKey: ['chat', 'threads'] }));
  }, [threadId, conversation.length, qc]);

  const unreadFor = (workerId: string) => {
    const thread = (threadsQ.data ?? []).find((t: any) =>
      (t.participants ?? []).some((p: { id: string }) => p.id === workerId),
    );
    return thread?.unread ?? 0;
  };

  const lastPreview = (workerId: string) => {
    const thread = (threadsQ.data ?? []).find((t: any) =>
      (t.participants ?? []).some((p: { id: string }) => p.id === workerId),
    );
    return thread?.lastMessage?.message as string | undefined;
  };

  const handleSend = async () => {
    if (!message.trim() || !threadId) return;
    const text = message.trim();
    setMessage('');
    try {
      await api.chat.send(threadId, text);
      await qc.invalidateQueries({ queryKey: ['chat', threadId] });
      await qc.invalidateQueries({ queryKey: ['chat', 'threads'] });
    } catch {
      setMessage(text);
      toast.error('Message failed');
    }
  };

  const selected = companyWorkers.find(w => w.id === selectedWorker);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-heading font-bold">Messages</h1>
        <p className="text-sm text-muted-foreground">Chat with field technicians</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[calc(100vh-200px)] min-h-[420px]">
        <Card className="shadow-theme-sm overflow-hidden">
          <CardContent className="p-3 h-full flex flex-col min-h-0">
            <p className="text-xs text-muted-foreground mb-2 font-medium">Workers</p>
            <ScrollArea className="flex-1">
              <div className="space-y-1 pr-2">
                {companyWorkers.map(w => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setSelectedWorker(w.id)}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-lg transition-colors text-left ${selectedWorker === w.id ? 'bg-primary/10' : 'hover:bg-muted/50'}`}
                  >
                    <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">
                      {(w.name || '?').charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">{w.name}</p>
                        {unreadFor(w.id) > 0 && (
                          <span className="text-[10px] font-semibold bg-primary text-primary-foreground rounded-full min-w-[1.25rem] h-5 px-1.5 flex items-center justify-center">
                            {unreadFor(w.id)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{lastPreview(w.id) || (w.specialties || [])[0] || 'No messages yet'}</p>
                    </div>
                  </button>
                ))}
                {companyWorkers.length === 0 && (
                  <p className="text-sm text-muted-foreground p-3">No active workers to chat with.</p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="shadow-theme-sm md:col-span-2 flex flex-col min-h-0 overflow-hidden">
          <CardContent className="p-4 flex flex-col flex-1 min-h-0">
            <p className="text-sm font-medium border-b pb-2 mb-3 shrink-0">{selected?.name || 'Select a worker'}</p>
            <ScrollArea className="flex-1 min-h-0 pr-3">
              <div className="space-y-3">
                {opening && <p className="text-sm text-muted-foreground text-center py-8">Opening conversation…</p>}
                {!opening && threadId && conversation.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No messages yet. Say hello.</p>
                )}
                {conversation.map((msg: any) => (
                  <div key={msg.id} className={`flex ${msg.senderId === currentUser?.id ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm ${msg.senderId === currentUser?.id ? 'gradient-primary text-primary-foreground rounded-br-md' : 'bg-muted rounded-bl-md'}`}>
                      {msg.senderId !== currentUser?.id && msg.senderName && (
                        <p className="text-[10px] font-medium mb-0.5 text-muted-foreground">{msg.senderName}</p>
                      )}
                      {msg.message}
                      <p className={`text-[10px] mt-1 ${msg.senderId === currentUser?.id ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                        {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            </ScrollArea>
            <div className="flex gap-2 mt-3 pt-3 border-t shrink-0">
              <Input
                placeholder={threadId ? 'Type a message...' : 'Select a worker to start chatting'}
                value={message}
                disabled={!threadId}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
              />
              <Button size="icon" onClick={() => void handleSend()} disabled={!threadId || !message.trim()} className="gradient-primary text-primary-foreground shrink-0">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminChat;
