import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useFieldPro } from '@/hooks/useFieldPro';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { toast } from 'sonner';

type ViewMode = 'month' | 'week' | 'day';
type ColorCodeBy = 'status' | 'tech' | 'category';

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  new: { bg: 'bg-slate-500', text: 'text-white', label: 'New' },
  assigned: { bg: 'bg-indigo-600', text: 'text-white', label: 'Assigned' },
  in_progress: { bg: 'bg-blue-600', text: 'text-white', label: 'In Progress' },
  completed: { bg: 'bg-green-600', text: 'text-white', label: 'Completed' },
  cancelled: { bg: 'bg-slate-400', text: 'text-white', label: 'Cancelled' },
};

const ESTIMATE_STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-slate-500', text: 'text-white', label: 'Estimate Requested' },
  sent: { bg: 'bg-blue-600', text: 'text-white', label: 'Estimate Provided' },
  approved: { bg: 'bg-green-600', text: 'text-white', label: 'Estimate Accepted' },
  rejected: { bg: 'bg-red-600', text: 'text-white', label: 'Lost' },
  converted: { bg: 'bg-violet-600', text: 'text-white', label: 'Estimate Won' },
};

const TECH_COLORS = [
  'bg-indigo-600', 'bg-blue-600', 'bg-violet-600', 'bg-teal-600', 'bg-slate-600',
  'bg-sky-600', 'bg-cyan-700', 'bg-emerald-600',
];

const AdminCalendar = () => {
  const routerNavigate = useNavigate();
  const { jobs, estimates, workers } = useFieldPro();
  const companyJobs = jobs;
  const companyEstimates = estimates;
  const companyWorkers = workers;

  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewMode>('month');
  const [colorCodeBy, setColorCodeBy] = useState<ColorCodeBy>('status');
  const [showEventDetail, setShowEventDetail] = useState<{ type: 'job' | 'estimate'; id: string } | null>(null);
  const localYmd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const monthStart = localYmd(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
  const monthEnd = localYmd(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0));
  const calQ = useQuery({
    queryKey: ['ops', 'calendar', monthStart, monthEnd],
    queryFn: () => api.ops.calendar(monthStart, monthEnd),
  });
  const detailJobQ = useQuery({
    queryKey: ['jobs', showEventDetail?.id],
    queryFn: () => api.jobs.get(showEventDetail!.id),
    enabled: showEventDetail?.type === 'job' && !companyJobs.some((j) => j.id === showEventDetail.id),
  });
  const detailEstQ = useQuery({
    queryKey: ['estimates', showEventDetail?.id],
    queryFn: () => api.estimates.get(showEventDetail!.id),
    enabled: showEventDetail?.type === 'estimate' && !companyEstimates.some((e) => e.id === showEventDetail.id),
  });

  const workerColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    companyWorkers.forEach((w, i) => { map[w.id] = TECH_COLORS[i % TECH_COLORS.length]; });
    return map;
  }, [companyWorkers]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = firstDay.getDay(); // 0=Sun
    const mondayOffset = startDay === 0 ? 6 : startDay - 1;
    const days: Date[] = [];
    for (let i = -mondayOffset; i <= 41 - mondayOffset; i++) {
      const d = new Date(year, month, 1 + i);
      days.push(d);
    }
    return days;
  }, [year, month]);

  const fmt = (d: Date) => localYmd(d);
  const today = fmt(new Date());

  const navigate = (dir: number) => {
    const d = new Date(currentDate);
    if (view === 'month') d.setMonth(d.getMonth() + dir);
    else if (view === 'week') d.setDate(d.getDate() + 7 * dir);
    else d.setDate(d.getDate() + dir);
    setCurrentDate(d);
  };

  const goToday = () => setCurrentDate(new Date());

  type CalendarEvent = {
    id: string;
    type: 'job' | 'estimate';
    title: string;
    time?: string;
    duration?: number;
    status: string;
    workerId?: string;
    workerName?: string;
    customerName: string;
    date: string;
  };

  const allEvents = useMemo(() => {
    if (calQ.data?.jobs || calQ.data?.estimates) {
      const events: CalendarEvent[] = [];
      for (const j of calQ.data.jobs ?? []) {
        if (!j.date) continue;
        events.push({
          id: j.id, type: 'job', title: j.title, time: j.time, duration: j.duration,
          status: j.status, workerId: j.workerIds?.[0], customerName: j.customerName, date: j.date,
        });
      }
      for (const e of calQ.data.estimates ?? []) {
        if (!e.date) continue;
        events.push({
          id: e.id, type: 'estimate', title: `Estimate: ${e.customerName}`,
          status: e.status, customerName: e.customerName, date: e.date,
        });
      }
      return events;
    }
    const events: CalendarEvent[] = [];
    companyJobs.forEach(j => {
      if (j.scheduledDate) {
        const techIds = (j.assignedWorkerIds && j.assignedWorkerIds.length > 0)
          ? j.assignedWorkerIds
          : (j.assignedWorkerId ? [j.assignedWorkerId] : []);
        const techNames = techIds.map(tid => companyWorkers.find(w => w.id === tid)?.name).filter(Boolean).join(', ');
        events.push({
          id: j.id, type: 'job', title: j.title, time: j.scheduledTime,
          duration: j.estimatedDuration, status: j.status,
          workerId: techIds[0], workerName: techNames || undefined,
          customerName: j.customerName, date: j.scheduledDate,
        });
      }
    });
    companyEstimates.forEach(e => {
      if (e.createdAt) {
        events.push({
          id: e.id, type: 'estimate', title: `Estimate: ${e.customerName}`,
          status: e.status, customerName: e.customerName, date: e.createdAt,
        });
      }
    });
    return events;
  }, [calQ.data, companyJobs, companyEstimates, companyWorkers]);

  const getEventsForDate = (date: string) => allEvents.filter(e => e.date === date);

  const getEventColor = (event: CalendarEvent) => {
    if (colorCodeBy === 'tech' && event.workerId) {
      return { bg: workerColorMap[event.workerId] || 'bg-gray-500', text: 'text-white' };
    }
    if (colorCodeBy === 'category') {
      if (event.type === 'estimate') return { bg: 'bg-teal-500', text: 'text-white' };
      return { bg: 'bg-blue-600', text: 'text-white' };
    }
    if (event.type === 'estimate') {
      return ESTIMATE_STATUS_COLORS[event.status] || { bg: 'bg-gray-400', text: 'text-white' };
    }
    return STATUS_COLORS[event.status] || { bg: 'bg-gray-400', text: 'text-white' };
  };

  const detailEvent = showEventDetail
    ? showEventDetail.type === 'job'
      ? companyJobs.find((j) => j.id === showEventDetail.id) || detailJobQ.data || null
      : companyEstimates.find((e) => e.id === showEventDetail.id) || detailEstQ.data || null
    : null;

  // Week view days
  const weekDays = useMemo(() => {
    const start = new Date(currentDate);
    const day = start.getDay();
    start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [currentDate]);

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-heading font-bold">Calendar</h1>
          <p className="text-muted-foreground text-sm">View all scheduled jobs and estimates</p>
        </div>
      </div>

      <Card className="shadow-theme-sm">
        <CardContent className="p-4">
          {/* Controls */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                Color Code By:
              </div>
              {(['status', 'tech', 'category'] as ColorCodeBy[]).map(mode => (
                <Button key={mode} variant={colorCodeBy === mode ? 'default' : 'outline'} size="sm"
                  onClick={() => setColorCodeBy(mode)} className="capitalize text-xs">
                  {mode === 'tech' ? 'Tech Assigned' : mode === 'category' ? 'Type' : 'Status'}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="w-4 h-4 mr-1" /> Print
              </Button>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => navigate(1)}>
                <ChevronRight className="w-5 h-5" />
              </Button>
              <Button variant="outline" size="sm" onClick={goToday}>today</Button>
            </div>
            <h3 className="font-heading font-semibold text-lg">
              {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h3>
            <div className="flex bg-muted rounded-lg p-0.5">
              {(['month', 'week', 'day'] as ViewMode[]).map(v => (
                <Button key={v} variant={view === v ? 'default' : 'ghost'} size="sm"
                  onClick={() => setView(v)} className="capitalize text-xs">{v}</Button>
              ))}
            </div>
          </div>

          {/* Month View */}
          {view === 'month' && (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="grid grid-cols-7">
                {dayNames.map(d => (
                  <div key={d} className="p-2 text-center text-xs font-semibold bg-muted/50 border-b border-border">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {calendarDays.map((d, i) => {
                  const dateStr = fmt(d);
                  const isCurrentMonth = d.getMonth() === month;
                  const isToday = dateStr === today;
                  const events = getEventsForDate(dateStr);
                  return (
                    <div key={i} className={`min-h-[110px] border-b border-r border-border p-1 ${!isCurrentMonth ? 'bg-muted/20' : ''} ${isToday ? 'bg-primary/5' : ''}`}>
                      <div className={`text-xs font-medium mb-1 ${isToday ? 'text-primary font-bold' : !isCurrentMonth ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>
                        {d.getDate()}
                      </div>
                      <div className="space-y-0.5">
                        {events.slice(0, 4).map(ev => {
                          const color = getEventColor(ev);
                          return (
                            <button key={ev.id} onClick={() => setShowEventDetail({ type: ev.type, id: ev.id })}
                              className={`w-full text-left rounded px-1.5 py-0.5 text-[10px] leading-tight truncate ${color.bg} ${color.text} hover:opacity-80 transition-opacity`}>
                              {ev.time && <span className="font-semibold">{ev.time} </span>}
                              {ev.type === 'estimate' ? 'On-Site Estimate' : ev.title}
                              {ev.workerName && (
                                <div className="truncate font-medium">Techs: {ev.workerName}</div>
                              )}
                              {ev.type === 'job' && <div className="truncate">{ev.customerName}</div>}
                            </button>
                          );
                        })}
                        {events.length > 4 && (
                          <div className="text-[10px] text-muted-foreground pl-1">+{events.length - 4} more</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Week View */}
          {view === 'week' && (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="grid grid-cols-7">
                {weekDays.map(d => {
                  const dateStr = fmt(d);
                  const isToday = dateStr === today;
                  return (
                    <div key={dateStr} className={`p-2 text-center border-b border-r border-border ${isToday ? 'bg-primary/5' : 'bg-muted/50'}`}>
                      <p className="text-xs text-muted-foreground">{dayNames[d.getDay() === 0 ? 6 : d.getDay() - 1]}</p>
                      <p className={`text-sm font-semibold ${isToday ? 'text-primary' : ''}`}>{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-7">
                {weekDays.map(d => {
                  const dateStr = fmt(d);
                  const events = getEventsForDate(dateStr);
                  return (
                    <div key={dateStr} className="min-h-[300px] border-r border-border p-1 space-y-1">
                      {events.map(ev => {
                        const color = getEventColor(ev);
                        return (
                          <button key={ev.id} onClick={() => setShowEventDetail({ type: ev.type, id: ev.id })}
                            className={`w-full text-left rounded px-2 py-1.5 text-xs ${color.bg} ${color.text} hover:opacity-80 transition-opacity`}>
                            {ev.time && <div className="font-semibold">{ev.time}{ev.duration ? ` +${ev.duration}h` : ''}</div>}
                            <div className="truncate font-medium">{ev.type === 'estimate' ? 'On-Site Estimate' : ev.title}</div>
                            <div className="truncate">{ev.customerName}</div>
                            {ev.workerName && <div className="truncate opacity-80">Techs: {ev.workerName}</div>}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Day View */}
          {view === 'day' && (() => {
            const dateStr = fmt(currentDate);
            const events = getEventsForDate(dateStr);
            const hours = Array.from({ length: 12 }, (_, i) => i + 7);
            return (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="p-3 bg-muted/50 border-b border-border text-center">
                  <p className="text-sm font-semibold">
                    {currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                {hours.map(hour => {
                  const hourEvents = events.filter(e => e.time && parseInt(e.time.split(':')[0]) === hour);
                  return (
                    <div key={hour} className="flex border-b border-border">
                      <div className="w-20 p-2 text-xs text-muted-foreground border-r border-border shrink-0">
                        {hour > 12 ? `${hour - 12}:00 pm` : hour === 12 ? '12:00 pm' : `${hour}:00 am`}
                      </div>
                      <div className="flex-1 min-h-[50px] p-1 space-y-0.5">
                        {hourEvents.map(ev => {
                          const color = getEventColor(ev);
                          return (
                            <button key={ev.id} onClick={() => setShowEventDetail({ type: ev.type, id: ev.id })}
                              className={`w-full text-left rounded px-2 py-1.5 text-xs ${color.bg} ${color.text} hover:opacity-80`}>
                              <span className="font-semibold">{ev.time} </span>
                              {ev.type === 'estimate' ? 'Estimate' : ev.title} — {ev.customerName}
                              {ev.workerName && <span className="ml-1 opacity-80">({ev.workerName})</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {/* Unscheduled events */}
                {events.filter(e => !e.time).length > 0 && (
                  <div className="p-2 border-t border-border">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Unscheduled</p>
                    {events.filter(e => !e.time).map(ev => {
                      const color = getEventColor(ev);
                      return (
                        <button key={ev.id} onClick={() => setShowEventDetail({ type: ev.type, id: ev.id })}
                          className={`w-full text-left rounded px-2 py-1.5 text-xs mb-0.5 ${color.bg} ${color.text} hover:opacity-80`}>
                          {ev.title} — {ev.customerName}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Status Legend */}
      <Card className="shadow-theme-sm">
        <CardContent className="p-4">
          <h3 className="font-heading font-semibold text-sm mb-3">Statuses</h3>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground mb-1">Jobs</p>
              {Object.entries(STATUS_COLORS).map(([key, val]) => (
                <div key={key} className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-sm ${val.bg}`} />
                  <span className="text-xs">{val.label}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground mb-1">Estimates</p>
              {Object.entries(ESTIMATE_STATUS_COLORS).map(([key, val]) => (
                <div key={key} className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-sm ${val.bg}`} />
                  <span className="text-xs">{val.label}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Event Detail Dialog */}
      <Dialog open={!!showEventDetail} onOpenChange={() => setShowEventDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {showEventDetail?.type === 'job' ? (detailEvent as any)?.title : `Estimate #${(detailEvent as any)?.estimateNumber}`}
            </DialogTitle>
          </DialogHeader>
          {detailEvent && showEventDetail?.type === 'job' && (() => {
            const j = detailEvent as typeof companyJobs[0];
            const worker = companyWorkers.find(w => w.id === j.assignedWorkerId);
            return (
              <div className="space-y-3 text-sm">
                <div className="flex gap-2">
                  <Badge className={`${STATUS_COLORS[j.status]?.bg} ${STATUS_COLORS[j.status]?.text}`}>{j.status.replace('_', ' ')}</Badge>
                  <Badge variant="outline">{j.category}</Badge>
                </div>
                <p className="text-muted-foreground">{j.description}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><span className="text-muted-foreground">Customer:</span><p className="font-medium">{j.customerName}</p></div>
                  <div><span className="text-muted-foreground">Date:</span><p className="font-medium">{j.scheduledDate}</p></div>
                  <div><span className="text-muted-foreground">Time:</span><p className="font-medium">{j.scheduledTime || 'N/A'} ({j.estimatedDuration}h)</p></div>
                  <div><span className="text-muted-foreground">Tech:</span><p className="font-medium">{worker?.name || 'Unassigned'}</p></div>
                </div>
              </div>
            );
          })()}
          {detailEvent && showEventDetail?.type === 'estimate' && (() => {
            const e = detailEvent as typeof companyEstimates[0];
            return (
              <div className="space-y-3 text-sm">
                <div className="flex gap-2">
                  <Badge className={`${ESTIMATE_STATUS_COLORS[e.status]?.bg} ${ESTIMATE_STATUS_COLORS[e.status]?.text}`}>{e.status}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><span className="text-muted-foreground">Customer:</span><p className="font-medium">{e.customerName}</p></div>
                  <div><span className="text-muted-foreground">Total:</span><p className="font-medium">${e.total.toFixed(2)}</p></div>
                  <div><span className="text-muted-foreground">Created:</span><p className="font-medium">{e.createdAt}</p></div>
                  <div><span className="text-muted-foreground">Valid Until:</span><p className="font-medium">{e.validUntil}</p></div>
                </div>
              </div>
            );
          })()}
          {showEventDetail && (
            <DialogFooter>
              <Button onClick={() => {
                const path = showEventDetail.type === 'job'
                  ? `/admin/jobs/${showEventDetail.id}`
                  : `/admin/estimates/${showEventDetail.id}`;
                setShowEventDetail(null);
                routerNavigate(path);
              }}>
                {showEventDetail.type === 'job' ? 'Open job' : 'Open estimate'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminCalendar;
