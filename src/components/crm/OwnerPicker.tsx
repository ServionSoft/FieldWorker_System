import { useQuery } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';

export function OwnerPicker({
  value, onChange, label = 'Owner',
}: {
  value?: string | null;
  onChange: (id: string | null) => void;
  label?: string;
}) {
  const peopleQ = useQuery({ queryKey: ['records', 'people'], queryFn: api.records.people });
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value || 'none'} onValueChange={(v) => onChange(v === 'none' ? null : v)}>
        <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Unassigned</SelectItem>
          {(peopleQ.data ?? []).map((p) => (
            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
