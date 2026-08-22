import { FieldProMark } from '@/components/brand/FieldProMark';
import { cn } from '@/lib/utils';

export function BrandMark({ className }: { className?: string }) {
  return <FieldProMark size={32} className={cn('rounded-[10px]', className)} />;
}
