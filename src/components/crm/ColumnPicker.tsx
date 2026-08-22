import { Columns } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function ColumnPicker({
  columns, visible, onToggle,
}: {
  columns: { id: string; label: string }[];
  visible: (id: string) => boolean;
  onToggle: (id: string, next: boolean) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Columns">
          <Columns className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Show columns</DropdownMenuLabel>
        {columns.map((c) => (
          <DropdownMenuCheckboxItem key={c.id} checked={visible(c.id)} onCheckedChange={(v) => onToggle(c.id, !!v)}>
            {c.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
