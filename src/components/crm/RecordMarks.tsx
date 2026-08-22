import { Pin, Star } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type Entity = 'customer' | 'job' | 'estimate' | 'invoice';

export function RecordMarks({
  entityType, entityId, starred, pinned, className,
}: {
  entityType: Entity;
  entityId: string;
  starred?: boolean;
  pinned?: boolean;
  className?: string;
}) {
  const qc = useQueryClient();
  const favQ = useQuery({
    queryKey: ['records', 'favorites'],
    queryFn: api.records.favorites,
  });
  const row = (favQ.data ?? []).find((f) => f.entityType === entityType && f.entityId === entityId);
  const isStar = starred ?? !!row?.starred;
  const isPin = pinned ?? !!row?.pinned;
  const mut = useMutation({
    mutationFn: (body: { starred?: boolean; pinned?: boolean }) =>
      api.records.setFavorite({ entityType, entityId, ...body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['records', 'favorites'] });
      qc.invalidateQueries({ queryKey: [entityType === 'customer' ? 'customers' : entityType === 'job' ? 'jobs' : entityType === 'estimate' ? 'estimates' : 'invoices'] });
    },
  });

  return (
    <div className={cn('flex items-center', className)} onClick={(e) => e.stopPropagation()}>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title={isStar ? 'Unstar' : 'Star'}
        onClick={() => mut.mutate({ starred: !isStar, pinned: isPin })}>
        <Star className={cn('w-4 h-4', isStar && 'fill-warning text-warning')} />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title={isPin ? 'Unpin' : 'Pin to top'}
        onClick={() => mut.mutate({ pinned: !isPin, starred: isStar })}>
        <Pin className={cn('w-4 h-4', isPin && 'fill-primary text-primary')} />
      </Button>
    </div>
  );
}
