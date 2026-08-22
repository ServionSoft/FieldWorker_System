import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Users, Briefcase, FileText, Calculator, UserRound, FolderOpen, PhoneCall } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { api } from '@/lib/api';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { useAppStore } from '@/store/useAppStore';

export function GlobalSearch() {
  const navigate = useNavigate();
  const companyId = useAppStore((s) => s.company?.id);
  const role = useAppStore((s) => s.currentUser?.role);
  const workerPortal = role === 'field_worker';
  const { items: recent } = useRecentlyViewed(companyId);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{
    customers: any[]; jobs: any[]; estimates: any[]; invoices: any[];
    workers: any[]; documents: any[]; communications: any[];
  }>({
    customers: [], jobs: [], estimates: [], invoices: [], workers: [], documents: [], communications: [],
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) {
      setResults({ customers: [], jobs: [], estimates: [], invoices: [], workers: [], documents: [], communications: [] });
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await api.search(term);
        if (!cancelled) setResults(data);
      } catch {
        if (!cancelled) setResults({ customers: [], jobs: [], estimates: [], invoices: [], workers: [], documents: [], communications: [] });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, open]);

  const go = (href: string) => {
    setOpen(false);
    setQ('');
    navigate(href);
  };

  return (
    <>
      <Button variant="outline" className="hidden md:inline-flex h-9 w-64 justify-start text-muted-foreground font-normal bg-card border-border hover:border-primary" onClick={() => setOpen(true)}>
        <Search className="w-4 h-4 mr-2" />
        Search…
        <kbd className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded">Ctrl K</kbd>
      </Button>
      <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label="Search">
        <Search className="w-5 h-5" />
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search customers, jobs, estimates, invoices, workers…" value={q} onValueChange={setQ} />
        <CommandList>
          <CommandEmpty>{loading ? 'Searching…' : q.trim().length < 2 ? 'Type at least 2 characters' : 'No matches'}</CommandEmpty>
          {q.trim().length < 2 && recent.length > 0 && (
            <CommandGroup heading="Recently viewed">
              {recent.map((r) => (
                <CommandItem key={`${r.kind}-${r.id}`} onSelect={() => go(r.href)}>
                  <span className="capitalize text-xs text-muted-foreground mr-2">{r.kind}</span>
                  {r.label}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results.customers.length > 0 && (
            <CommandGroup heading="Customers">
              {results.customers.map((c) => (
                <CommandItem key={c.id} onSelect={() => go(`/admin/customers/${c.id}`)}>
                  <Users className="w-4 h-4 mr-2 text-primary shrink-0" />
                  {c.name} <span className="ml-2 text-xs text-muted-foreground">{c.phone || c.email}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results.jobs.length > 0 && (
            <CommandGroup heading="Jobs">
              {results.jobs.map((j) => (
                <CommandItem key={j.id} onSelect={() => go(workerPortal ? `/worker/jobs/${j.id}` : `/admin/jobs/${j.id}`)}>
                  <Briefcase className="w-4 h-4 mr-2 text-indigo shrink-0" />
                  {j.title} <span className="ml-2 text-xs text-muted-foreground">{j.customerName}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results.estimates.length > 0 && (
            <CommandGroup heading="Estimates">
              {results.estimates.map((e) => (
                <CommandItem key={e.id} onSelect={() => go(`/admin/estimates/${e.id}`)}>
                  <Calculator className="w-4 h-4 mr-2 text-violet shrink-0" />
                  {e.estimateNumber} <span className="ml-2 text-xs text-muted-foreground">{e.customerName}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results.invoices.length > 0 && (
            <CommandGroup heading="Invoices">
              {results.invoices.map((i) => (
                <CommandItem key={i.id} onSelect={() => go(`/admin/invoices?id=${i.id}`)}>
                  <FileText className="w-4 h-4 mr-2 text-success shrink-0" />
                  {i.invoiceNumber} <span className="ml-2 text-xs text-muted-foreground">{i.customerName}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {(results.workers ?? []).length > 0 && (
            <CommandGroup heading="Workers">
              {results.workers.map((w) => (
                <CommandItem key={w.id} onSelect={() => go(workerPortal ? '/worker' : '/admin/workers')}>
                  <UserRound className="w-4 h-4 mr-2 text-cyan shrink-0" />
                  {w.name} <span className="ml-2 text-xs text-muted-foreground">{w.email || w.phone}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {(results.documents ?? []).length > 0 && (
            <CommandGroup heading="Documents">
              {results.documents.map((d) => (
                <CommandItem key={d.id} onSelect={() => go(d.jobId ? (workerPortal ? `/worker/jobs/${d.jobId}` : `/admin/jobs/${d.jobId}`) : (workerPortal ? '/worker' : '/admin/documents'))}>
                  <FolderOpen className="w-4 h-4 mr-2 text-teal shrink-0" />
                  {d.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {(results.communications ?? []).length > 0 && (
            <CommandGroup heading="Communications">
              {results.communications.map((c) => (
                <CommandItem key={c.id} onSelect={() => go(workerPortal ? '/worker/chat' : (c.customerId ? `/admin/customers/${c.customerId}` : '/admin/communications'))}>
                  <PhoneCall className="w-4 h-4 mr-2 text-sky shrink-0" />
                  {c.type} {c.direction} <span className="ml-2 text-xs text-muted-foreground">{c.body}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
