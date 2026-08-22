import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, Check, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api';

export function SavedViewsBar({
  page, filters, onApply,
}: {
  page: string;
  filters: Record<string, string>;
  onApply: (filters: Record<string, string>) => void;
}) {
  const qc = useQueryClient();
  const viewsQ = useQuery({
    queryKey: ['records', 'views', page],
    queryFn: () => api.records.views(page),
  });
  const [name, setName] = useState('');
  const [selected, setSelected] = useState('');
  const views = viewsQ.data ?? [];
  const selectedName = views.find((v) => v.id === selected)?.name;

  const save = async () => {
    if (!name.trim()) { toast.error('Name this view first'); return; }
    const created = await api.records.saveView({ page, name: name.trim(), filters });
    setName('');
    setSelected(created.id || '');
    qc.invalidateQueries({ queryKey: ['records', 'views', page] });
    toast.success('View saved');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 shrink-0">
          <Bookmark className="w-3.5 h-3.5" />
          <span className="hidden sm:inline max-w-[120px] truncate">{selectedName || 'Views'}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Saved views</DropdownMenuLabel>
        {views.length === 0 && (
          <p className="px-2 py-3 text-xs text-muted-foreground">No saved views yet.</p>
        )}
        {views.map((v) => (
          <DropdownMenuItem
            key={v.id}
            className="flex items-center gap-2"
            onSelect={() => {
              setSelected(v.id);
              onApply((v.filters || {}) as Record<string, string>);
            }}
          >
            <Check className={`w-3.5 h-3.5 ${selected === v.id ? 'opacity-100' : 'opacity-0'}`} />
            <span className="flex-1 truncate">{v.name}</span>
            <button
              type="button"
              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
              title="Delete view"
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await api.records.removeView(v.id);
                if (selected === v.id) setSelected('');
                qc.invalidateQueries({ queryKey: ['records', 'views', page] });
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <div className="p-2 space-y-2" onPointerDown={(e) => e.stopPropagation()}>
          <Input
            className="h-8"
            placeholder="Name current filters…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') void save(); }}
          />
          <Button type="button" size="sm" className="w-full h-8" onClick={() => void save()}>
            Save current filters
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
