import type { ReactNode } from 'react';
import { Archive, ArchiveRestore } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function BulkActionBar({
  count, archivedMode, statuses, onArchive, onRestore, onStatus, onClear, extra,
}: {
  count: number;
  archivedMode?: boolean;
  statuses?: { value: string; label: string }[];
  onArchive?: () => void;
  onRestore?: () => void;
  onStatus?: (status: string) => void;
  onClear: () => void;
  extra?: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
      <p className="text-sm font-medium">{count} selected</p>
      {archivedMode ? (
        onRestore && <Button type="button" size="sm" variant="outline" className="gap-1" onClick={onRestore}><ArchiveRestore className="w-3.5 h-3.5" /> Restore</Button>
      ) : (
        onArchive && <Button type="button" size="sm" variant="outline" className="gap-1" onClick={onArchive}><Archive className="w-3.5 h-3.5" /> Archive</Button>
      )}
      {statuses && onStatus && (
        <Select onValueChange={onStatus}>
          <SelectTrigger className="w-[150px] h-8"><SelectValue placeholder="Set status" /></SelectTrigger>
          <SelectContent>
            {statuses.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      {extra}
      <Button type="button" variant="ghost" size="sm" onClick={onClear}>Clear</Button>
    </div>
  );
}
