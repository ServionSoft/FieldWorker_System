import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFieldPro } from '@/hooks/useFieldPro';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Clock, MapPin } from 'lucide-react';

function localYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

const WorkerSchedule = () => {
  const { currentUser, jobs } = useFieldPro();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState(() => new Date());

  const weekStart = useMemo(() => {
    const d = new Date(anchor);
    const day = d.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + mondayOffset);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [anchor]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const today = localYmd(new Date());

  const myJobs = jobs.filter(
    (j) =>
      (j.assignedWorkerId === currentUser?.id || j.assignedWorkerIds?.includes(currentUser?.id || '')) &&
      !['cancelled'].includes(j.status),
  );

  const jobsFor = (dateStr: string) =>
    myJobs
      .filter((j) => j.scheduledDate === dateStr)
      .sort((a, b) => (a.scheduledTime || '').localeCompare(b.scheduledTime || ''));

  const weekLabel = `${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${addDays(weekStart, 6).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl lg:text-2xl font-heading font-bold">My Schedule</h1>
          <p className="text-sm text-muted-foreground">{weekLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setAnchor(addDays(weekStart, -7))} aria-label="Previous week">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={() => setAnchor(addDays(weekStart, 7))} aria-label="Next week">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        {days.map((d) => {
          const dateStr = localYmd(d);
          const dayJobs = jobsFor(dateStr);
          const isToday = dateStr === today;
          return (
            <Card key={dateStr} className={`shadow-theme-sm ${isToday ? 'border-primary/40' : ''}`}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className={`text-sm font-medium ${isToday ? 'text-primary' : ''}`}>
                    {d.toLocaleDateString(undefined, { weekday: 'short' })}
                  </p>
                  <p className="text-xs text-muted-foreground">{d.getDate()}</p>
                </div>
                {dayJobs.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">No jobs</p>
                ) : (
                  <div className="space-y-2">
                    {dayJobs.map((job) => (
                      <button
                        key={job.id}
                        type="button"
                        onClick={() => navigate(`/worker/jobs/${job.id}`)}
                        className="w-full text-left rounded-lg border border-border p-2 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="text-xs font-semibold truncate">{job.scheduledTime || '—'}</span>
                          <Badge variant="secondary" className="text-[9px] px-1 py-0 capitalize">
                            {job.status.replace('_', ' ')}
                          </Badge>
                        </div>
                        <p className="text-xs font-medium line-clamp-2">{job.title}</p>
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">{job.customerName}</p>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-1">
                          <span className="flex items-center gap-0.5 truncate">
                            <MapPin className="w-3 h-3 shrink-0" />
                            {job.customerAddress?.split(',')[0] || '—'}
                          </span>
                          {job.estimatedDuration ? (
                            <span className="flex items-center gap-0.5 shrink-0">
                              <Clock className="w-3 h-3" />
                              {job.estimatedDuration}h
                            </span>
                          ) : null}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default WorkerSchedule;
