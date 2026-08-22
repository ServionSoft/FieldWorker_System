import { useCallback, useEffect, useState } from 'react';

export type RecentKind = 'customer' | 'job' | 'estimate' | 'invoice';

export interface RecentRecord {
  kind: RecentKind;
  id: string;
  label: string;
  href: string;
  at: number;
}

const MAX = 8;

function keyFor(companyId?: string | null) {
  return `fp_recent_${companyId || 'none'}`;
}

function read(companyId?: string | null): RecentRecord[] {
  try {
    const raw = localStorage.getItem(keyFor(companyId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function useRecentlyViewed(companyId?: string | null) {
  const [items, setItems] = useState<RecentRecord[]>(() => read(companyId));

  useEffect(() => { setItems(read(companyId)); }, [companyId]);

  const track = useCallback((rec: Omit<RecentRecord, 'at'>) => {
    const next = [
      { ...rec, at: Date.now() },
      ...read(companyId).filter((x) => !(x.kind === rec.kind && x.id === rec.id)),
    ].slice(0, MAX);
    localStorage.setItem(keyFor(companyId), JSON.stringify(next));
    setItems(next);
  }, [companyId]);

  return { items, track };
}
