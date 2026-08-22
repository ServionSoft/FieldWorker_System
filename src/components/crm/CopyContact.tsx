import { Copy, Mail, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error(`Could not copy ${label.toLowerCase()}`);
  }
}

export function CopyContact({
  email,
  phone,
  className,
}: {
  email?: string | null;
  phone?: string | null;
  className?: string;
}) {
  const mail = (email || '').trim();
  const tel = (phone || '').trim();
  return (
    <div className={cn('space-y-2 text-sm', className)}>
      <div className="flex items-center gap-2 min-w-0">
        <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
        {mail ? (
          <>
            <a href={`mailto:${mail}`} className="truncate text-primary hover:underline">{mail}</a>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Copy email" onClick={() => copyText(mail, 'Email')}>
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </>
        ) : <span className="text-muted-foreground">—</span>}
      </div>
      <div className="flex items-center gap-2 min-w-0">
        <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
        {tel ? (
          <>
            <a href={`tel:${tel.replace(/\s/g, '')}`} className="truncate text-primary hover:underline">{tel}</a>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Copy phone" onClick={() => copyText(tel, 'Phone')}>
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </>
        ) : <span className="text-muted-foreground">—</span>}
      </div>
    </div>
  );
}
