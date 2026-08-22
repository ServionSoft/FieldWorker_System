import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useFieldPro } from '@/hooks/useFieldPro';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const CATEGORY_COLORS: Record<string, string> = {
  plumbing: 'bg-blue-600',
  electrical: 'bg-violet-600',
  hvac: 'bg-teal-600',
  general: 'bg-gray-600',
};

const AdminDispatch = () => {
  const routerNavigate = useNavigate();
  const { jobs, estimates, workers } = useFieldPro();
  const companyJobs = jobs;
  const companyEstimates = estimates;
  const companyWorkers = workers;

  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'daily' | 'weekly'>('weekly');
  const [showDetail, setShowDetail] = useState<{ type: 'job' | 'estimate'; id: string } | null>(null);

  const localYmd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const fmt = (d: Date) => localYmd(d);

  const detailJobQ = useQuery({
    queryKey: ['jobs', showDetail?.id],
    queryFn: () => api.jobs.get(showDetail!.id),
    enabled: showDetail?.type === 'job' && !companyJobs.some((j) => j.id === showDetail.id),
  });
  const detailEstQ = useQuery({
    queryKey: ['estimates', showDetail?.id],
    queryFn: () => api.estimates.get(showDetail!.id),
    enabled: showDetail?.type === 'estimate' && !companyEstimates.some((e) => e.id === showDetail.id),
  });

  const weekStart = useMemo(() => {
    const d = new Date(currentDate);
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return d;
  }, [currentDate]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const displayDays = view === 'weekly' ? weekDays : [currentDate];
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const today = fmt(new Date());
  const rangeFrom = fmt(displayDays[0]);
  const rangeTo = fmt(displayDays[displayDays.length - 1]);
  const dispatchQ = useQuery({
    queryKey: ['ops', 'dispatch', rangeFrom, rangeTo],
    queryFn: () => api.ops.dispatch(rangeFrom, rangeTo),
  });
  const dispatchWorkers = dispatchQ.data?.workers?.length ? dispatchQ.data.workers : companyWorkers;

  const navigate = (dir: number) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + (view === 'weekly' ? 7 * dir : dir));
    setCurrentDate(d);
  };

  const goToday = () => setCurrentDate(new Date());

  type DispatchEvent = {
    id: string;
    type: 'job' | 'estimate';
    title: string;
    time?: string;
    duration?: number;
    status: string;
    customerName: string;
    date: string;
    category?: string;
    workerId?: string;
  };

  // Build events per worker per date
  const workerEvents = useMemo(() => {
    const map: Record<string, DispatchEvent[]> = {};
    dispatchWorkers.forEach((w: { id: string }) => { map[w.id] = []; });
    map['unassigned'] = [];

    if (dispatchQ.data?.events) {
      for (const ev of dispatchQ.data.events) {
        if (!ev.date) continue;
        const item: DispatchEvent = {
          id: ev.id, type: ev.type ?? 'job', title: ev.title, time: ev.time,
          duration: ev.duration, status: ev.status, customerName: ev.title,
          date: ev.date, category: ev.category, workerId: ev.workerId,
        };
        if (ev.workerId && map[ev.workerId]) map[ev.workerId].push(item);
        else map['unassigned'].push(item);
      }
      return map;
    }

    companyJobs.forEach(j => {
      if (!j.scheduledDate) return;
      const ev: DispatchEvent = {
        id: j.id, type: 'job', title: j.customerName, time: j.scheduledTime,
        duration: j.estimatedDuration, status: j.status, customerName: j.customerName,
        date: j.scheduledDate, category: j.category, workerId: j.assignedWorkerId,
      };
      const techIds = (j.assignedWorkerIds && j.assignedWorkerIds.length > 0)
        ? j.assignedWorkerIds
        : (j.assignedWorkerId ? [j.assignedWorkerId] : []);
      if (techIds.length === 0) {
        map['unassigned'].push(ev);
      } else {
        techIds.forEach(tid => { if (map[tid]) map[tid].push({ ...ev, workerId: tid }); });
      }
    });

    companyEstimates.forEach(e => {
      if (!e.createdAt || e.status === 'converted') return;
      map['unassigned'].push({
        id: e.id, type: 'estimate', title: e.customerName,
        status: e.status, customerName: e.customerName, date: e.createdAt,
        category: e.category,
      });
    });

    return map;
  }, [companyJobs, companyEstimates, dispatchWorkers, dispatchQ.data]);

  const getEventsForWorkerDate = (workerId: string, date: string) =>
    (workerEvents[workerId] || []).filter(e => e.date === date);

  // Calculate total hours per worker in displayed range
  const getWorkerHours = (workerId: string) => {
    const dates = displayDays.map(d => fmt(d));
    return (workerEvents[workerId] || [])
      .filter(e => dates.includes(e.date) && e.duration)
      .reduce((sum, e) => sum + (e.duration || 0), 0);
  };

  const dateRange = view === 'weekly'
    ? `${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  // Bottom bar: unscheduled/unassigned counts
  const unscheduledJobs = companyJobs.filter(j => !j.scheduledDate && !['completed', 'cancelled'].includes(j.status));
  const unassignedJobs = companyJobs.filter(j => !j.assignedWorkerId && !['completed', 'cancelled'].includes(j.status));

  const detailData = showDetail
    ? showDetail.type === 'job'
      ? companyJobs.find((j) => j.id === showDetail.id) || detailJobQ.data || null
      : companyEstimates.find((e) => e.id === showDetail.id) || detailEstQ.data || null
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-heading font-bold">Dispatch</h1>
          <p className="text-muted-foreground text-sm">Dispatch grid — jobs & estimates per worker</p>
        </div>
      </div>

      <Card className="shadow-theme-sm">
        <CardContent className="p-4">
          {/* Navigation */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => navigate(1)}>
                <ChevronRight className="w-5 h-5" />
              </Button>
              <span className="text-sm font-semibold">{dateRange}</span>
            </div>
            <div className="flex bg-muted rounded-lg p-0.5">
              <Button variant={view === 'daily' ? 'default' : 'ghost'} size="sm" onClick={() => setView('daily')}>Daily</Button>
              <Button variant={view === 'weekly' ? 'default' : 'ghost'} size="sm" onClick={() => setView('weekly')}>Weekly</Button>
            </div>
          </div>

          {/* Dispatch Grid */}
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              {/* Header row */}
              <div className="grid border-b border-border" style={{ gridTemplateColumns: `180px repeat(${displayDays.length}, 1fr)` }}>
                <div className="p-2 text-xs font-semibold text-muted-foreground bg-muted/50" />
                {displayDays.map(d => {
                  const dateStr = fmt(d);
                  const isToday = dateStr === today;
                  const dayIdx = d.getDay();
                  const dayLabel = dayNames[dayIdx === 0 ? 6 : dayIdx - 1];
                  return (
                    <div key={dateStr} className={`p-2 text-center border-l border-border ${isToday ? 'bg-primary/5' : 'bg-muted/50'}`}>
                      <p className="text-xs font-semibold">{dayLabel}</p>
                      <p className={`text-sm font-bold ${isToday ? 'text-primary' : ''}`}>
                        {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Worker rows */}
              {dispatchWorkers.map((worker: { id: string; name: string }) => {
                const totalHours = getWorkerHours(worker.id);
                return (
                  <div key={worker.id} className="grid border-b border-border" style={{ gridTemplateColumns: `180px repeat(${displayDays.length}, 1fr)` }}>
                    {/* Worker info cell */}
                    <div className="p-2 border-r border-border bg-card">
                      <p className="text-sm font-semibold text-primary truncate">{worker.name}</p>
                      <p className="text-xs text-muted-foreground">{totalHours}hrs</p>
                    </div>
                    {/* Day cells */}
                    {displayDays.map(d => {
                      const dateStr = fmt(d);
                      const events = getEventsForWorkerDate(worker.id, dateStr);
                      return (
                        <div key={dateStr} className="border-l border-border min-h-[80px] p-1 space-y-1">
                          {events.map(ev => {
                            const bgColor = ev.type === 'estimate'
                              ? 'bg-teal-500'
                              : CATEGORY_COLORS[ev.category || 'general'] || 'bg-gray-500';
                            return (
                              <button key={ev.id} onClick={() => setShowDetail({ type: ev.type, id: ev.id })}
                                className={`w-full text-left rounded px-2 py-1.5 text-xs text-white hover:opacity-80 transition-opacity ${bgColor}`}>
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-semibold truncate">
                                    {ev.time || ''}{ev.duration ? ` +${ev.duration}h` : ''}
                                  </span>
                                  <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-white/20 text-white border-0 shrink-0">
                                    {ev.type === 'estimate' ? 'Est' : 'Job'}
                                  </Badge>
                                </div>
                                <div className="truncate font-medium">{ev.customerName}</div>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Unassigned row */}
              {(workerEvents['unassigned'] || []).length > 0 && (
                <div className="grid border-b border-border" style={{ gridTemplateColumns: `180px repeat(${displayDays.length}, 1fr)` }}>
                  <div className="p-2 border-r border-border bg-card">
                    <p className="text-sm font-semibold text-destructive">Unassigned</p>
                    <p className="text-xs text-muted-foreground">{(workerEvents['unassigned'] || []).length} items</p>
                  </div>
                  {displayDays.map(d => {
                    const dateStr = fmt(d);
                    const events = getEventsForWorkerDate('unassigned', dateStr);
                    return (
                      <div key={dateStr} className="border-l border-border min-h-[80px] p-1 space-y-1">
                        {events.map(ev => (
                          <button key={ev.id} onClick={() => setShowDetail({ type: ev.type, id: ev.id })}
                            className="w-full text-left rounded-lg px-2 py-1.5 text-xs bg-indigo-50 text-indigo-900 hover:bg-indigo-100 transition-colors border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-200 dark:border-indigo-800">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-semibold truncate">{ev.time || 'No time'}</span>
                              <Badge variant="secondary" className="text-[9px] px-1 py-0 shrink-0">
                                {ev.type === 'estimate' ? 'Est' : 'Job'}
                              </Badge>
                            </div>
                            <div className="truncate">{ev.customerName}</div>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Bottom status bar */}
          <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-border">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Unscheduled <span className="ml-1 font-bold">{unscheduledJobs.length}</span></Badge>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Unassigned <span className="ml-1 font-bold">{unassignedJobs.length}</span></Badge>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Completed <span className="ml-1 font-bold">{companyJobs.filter(j => j.status === 'completed').length}</span></Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {showDetail?.type === 'job' ? (detailData as any)?.title : `Estimate #${(detailData as any)?.estimateNumber}`}
            </DialogTitle>
          </DialogHeader>
          {detailData && showDetail?.type === 'job' && (() => {
            const j = detailData as typeof companyJobs[0];
            const worker = companyWorkers.find(w => w.id === j.assignedWorkerId);
            return (
              <div className="space-y-3 text-sm">
                <div className="flex gap-2">
                  <Badge variant="outline">{j.status.replace('_', ' ')}</Badge>
                  <Badge variant="outline">{j.category}</Badge>
                  <Badge variant="outline">{j.priority}</Badge>
                </div>
                <p className="text-muted-foreground">{j.description}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><span className="text-muted-foreground">Customer:</span><p className="font-medium">{j.customerName}</p></div>
                  <div><span className="text-muted-foreground">Date:</span><p className="font-medium">{j.scheduledDate}</p></div>
                  <div><span className="text-muted-foreground">Time:</span><p className="font-medium">{j.scheduledTime || 'N/A'} ({j.estimatedDuration}h)</p></div>
                  <div><span className="text-muted-foreground">Tech:</span><p className="font-medium">{worker?.name || 'Unassigned'}</p></div>
                  <div><span className="text-muted-foreground">Address:</span><p className="font-medium">{j.customerAddress}</p></div>
                  <div><span className="text-muted-foreground">Phone:</span><p className="font-medium">{j.customerPhone}</p></div>
                </div>
              </div>
            );
          })()}
          {detailData && showDetail?.type === 'estimate' && (() => {
            const e = detailData as typeof companyEstimates[0];
            return (
              <div className="space-y-3 text-sm">
                <Badge variant="outline">{e.status}</Badge>
                <div className="grid grid-cols-2 gap-3">
                  <div><span className="text-muted-foreground">Customer:</span><p className="font-medium">{e.customerName}</p></div>
                  <div><span className="text-muted-foreground">Total:</span><p className="font-medium">${e.total.toFixed(2)}</p></div>
                  <div><span className="text-muted-foreground">Created:</span><p className="font-medium">{e.createdAt}</p></div>
                  <div><span className="text-muted-foreground">Valid Until:</span><p className="font-medium">{e.validUntil}</p></div>
                </div>
                {e.notes && <p className="text-muted-foreground">{e.notes}</p>}
              </div>
            );
          })()}
          {showDetail && (
            <DialogFooter>
              <Button onClick={() => {
                const path = showDetail.type === 'job'
                  ? `/admin/jobs/${showDetail.id}`
                  : `/admin/estimates/${showDetail.id}`;
                setShowDetail(null);
                routerNavigate(path);
              }}>
                {showDetail.type === 'job' ? 'Open job' : 'Open estimate'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDispatch;
