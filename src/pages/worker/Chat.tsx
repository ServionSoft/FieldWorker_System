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

const WorkerChat = () => {
  const { currentUser } = useFieldPro();
  const qc = useQueryClient();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [opening, setOpening] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  useChatSocket(threadId);

  useEffect(() => {
    let cancelled = false;
    setOpening(true);
    api.chat.ensureAdminThread()
      .then((t) => { if (!cancelled) setThreadId(t.id); })
      .catch(() => { if (!cancelled) toast.error('Could not open office chat'); })
      .finally(() => { if (!cancelled) setOpening(false); });
    return () => { cancelled = true; };
  }, []);

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
    if (threadId) void api.chat.read(threadId);
  }, [threadId, conversation.length]);

  const handleSend = async () => {
    if (!message.trim() || !threadId) return;
    const text = message.trim();
    setMessage('');
    try {
      await api.chat.send(threadId, text);
      await qc.invalidateQueries({ queryKey: ['chat', threadId] });
    } catch {
      setMessage(text);
      toast.error('Message failed');
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] lg:h-[calc(100vh-8.5rem)]">
      <div className="mb-3 lg:mb-4">
        <h1 className="text-xl lg:text-2xl font-heading font-bold">
          <span className="lg:hidden">Chat with Office</span>
          <span className="hidden lg:inline">Messages</span>
        </h1>
        <p className="hidden lg:block text-sm text-muted-foreground">Chat with dispatch and office staff</p>
      </div>
      <Card className="shadow-theme-sm flex-1 flex flex-col min-h-0">
        <CardContent className="p-4 lg:p-5 flex flex-col flex-1 min-h-0">
          <p className="hidden lg:block text-sm font-medium border-b pb-2 mb-3 shrink-0">Office</p>
          <ScrollArea className="flex-1 min-h-0 pr-2">
            <div className="space-y-3">
              {opening && <p className="text-sm text-muted-foreground text-center py-8">Opening conversation…</p>}
              {!opening && !threadId && (
                <p className="text-sm text-muted-foreground text-center py-8">Could not connect to office chat. Try again later.</p>
              )}
              {!opening && threadId && conversation.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No messages yet. Send a note to the office.</p>
              )}
              {conversation.map((msg: any) => (
                <div key={msg.id} className={`flex ${msg.senderId === currentUser?.id ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] lg:max-w-[60%] rounded-2xl px-4 py-2 text-sm ${msg.senderId === currentUser?.id ? 'gradient-primary text-primary-foreground rounded-br-md' : 'bg-muted rounded-bl-md'}`}>
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
              placeholder={threadId ? 'Type a message...' : 'Connecting…'}
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
  );
};

export default WorkerChat;
