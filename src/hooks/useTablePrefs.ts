import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';

export function useTablePrefs(page: string, defaultColumns: Record<string, boolean>, defaultPageSize = 25) {
  const companyId = useAppStore((s) => s.company?.id);
  const key = `fp_table_${companyId || 'none'}_${page}`;
  const [columns, setColumns] = useState<Record<string, boolean>>(defaultColumns);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        setColumns(defaultColumns);
        setPageSize(defaultPageSize);
        return;
      }
      const parsed = JSON.parse(raw);
      setColumns({ ...defaultColumns, ...(parsed.columns || {}) });
      if (parsed.pageSize) setPageSize(parsed.pageSize);
    } catch {
      setColumns(defaultColumns);
      setPageSize(defaultPageSize);
    }
  }, [key]);

  const persist = useCallback((nextCols: Record<string, boolean>, nextSize: number) => {
    localStorage.setItem(key, JSON.stringify({ columns: nextCols, pageSize: nextSize }));
  }, [key]);

  const setColumn = (id: string, visible: boolean) => {
    const next = { ...columns, [id]: visible };
    setColumns(next);
    persist(next, pageSize);
  };

  const setSize = (n: number) => {
    setPageSize(n);
    persist(columns, n);
  };

  const visible = (id: string) => columns[id] !== false;

  return { columns, pageSize, setColumn, setPageSize: setSize, visible };
}
