import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function useClientPage<T>(items: T[], initialSize = 25) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialSize);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(page, pageCount);
  const slice = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  return {
    page: safePage,
    pageSize,
    total,
    pageCount,
    items: slice,
    setPage,
    setPageSize: (n: number) => { setPageSize(n); setPage(1); },
  };
}

export function ListPager({
  page, pageSize, total, onPage, onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  if (total <= pageSize && page <= 1) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-3 text-sm text-muted-foreground">
      <p>{from}–{to} of {total}</p>
      <div className="flex items-center gap-2">
        <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
          <SelectTrigger className="w-[88px] h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Prev</Button>
        <span className="tabular-nums">{page}/{pageCount}</span>
        <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}

export function ListEmpty({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="text-center py-12 text-sm text-muted-foreground space-y-3">
      <p>{message}</p>
      {action}
    </div>
  );
}
