import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useFieldPro } from '@/hooks/useFieldPro';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { Briefcase, CalendarClock, FileWarning } from 'lucide-react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { CHART_GRID_STROKE, JOB_STATUS_FILLS, initials, invoiceStatusTone } from '@/lib/chartTheme';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { currentUser, jobs, workers } = useFieldPro();
  const dashQ = useQuery({ queryKey: ['ops', 'dashboard'], queryFn: api.ops.dashboard });
  const dash = dashQ.data;
  const companyJobs = jobs;
  const companyWorkers = workers;

  const activeJobs = dash?.activeJobs ?? companyJobs.filter(j => j.status === 'in_progress').length;
  const pendingJobs = dash?.pendingJobs ?? companyJobs.filter(j => ['new', 'assigned'].includes(j.status)).length;
  const completedJobs = dash?.completedJobs ?? companyJobs.filter(j => j.status === 'completed').length;
  const lowStock = dash?.lowStock ?? 0;
  const revenue = dash?.revenue ?? 0;

  const stats = [
    { label: 'Active Jobs', value: activeJobs, tone: 'info' as const },
    { label: 'Pending Jobs', value: pendingJobs, tone: 'accent' as const },
    { label: 'Completed', value: completedJobs, tone: 'success' as const },
    { label: 'Low Stock Items', value: lowStock, tone: 'warning' as const },
    { label: 'Active Workers', value: dash?.activeWorkers ?? companyWorkers.filter(w => w.status === 'active').length, tone: 'accent' as const },
    { label: 'Revenue', value: `$${Number(revenue).toLocaleString()}`, tone: 'success' as const },
  ];

  const jobStatusData = dash?.jobStatus ?? [
    { status: 'New', count: companyJobs.filter(j => j.status === 'new').length },
    { status: 'Assigned', count: companyJobs.filter(j => j.status === 'assigned').length },
    { status: 'In Progress', count: companyJobs.filter(j => j.status === 'in_progress').length },
    { status: 'Completed', count: companyJobs.filter(j => j.status === 'completed').length },
    { status: 'Cancelled', count: companyJobs.filter(j => j.status === 'cancelled').length },
  ];

  const workerPerformance = companyWorkers.filter(w => w.status === 'active').slice(0, 5).map(w => ({
    name: w.name,
    short: w.name.split(' ')[0],
    initials: initials(w.name),
    jobs: w.jobsCompleted,
    rating: w.rating,
  }));
  const maxJobs = Math.max(1, ...workerPerformance.map(w => w.jobs));

  const todaysJobs = companyJobs.filter(j => j.scheduledDate === new Date().toISOString().split('T')[0]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Welcome back, {currentUser?.name}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {stats.map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <StatCard label={stat.label} value={stat.value} tone={stat.tone} />
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-5">
            <h3 className="font-heading font-semibold mb-4">Job Status Overview</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={jobStatusData} margin={{ top: 18, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} strokeWidth={1} />
                <XAxis dataKey="status" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }} />
                <Bar dataKey="count" radius={[2, 2, 0, 0]} maxBarSize={48}>
                  {jobStatusData.map((_, i) => <Cell key={i} fill={JOB_STATUS_FILLS[i % JOB_STATUS_FILLS.length]} />)}
                  <LabelList dataKey="count" position="top" className="fill-foreground" fontSize={11} fontFamily="IBM Plex Mono, monospace" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="font-heading font-semibold mb-4">Worker Performance</h3>
            <div className="space-y-3">
              {workerPerformance.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center">No active workers</p>
              ) : workerPerformance.map((w) => (
                <div key={w.name} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-sidebar text-sidebar-foreground flex items-center justify-center shrink-0 font-data text-[11px] font-semibold">
                    {w.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <p className="text-sm font-medium truncate">{w.short}</p>
                      <p className="font-data text-sm tabular-nums text-foreground shrink-0">{w.jobs}</p>
                    </div>
                    <div className="h-1.5 rounded-sm bg-muted overflow-hidden">
                      <div className="h-full rounded-sm bg-primary" style={{ width: `${Math.max(6, (w.jobs / maxJobs) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-5">
            <h3 className="font-heading font-semibold mb-4 flex items-center gap-2"><CalendarClock className="w-4 h-4" /> Follow-ups</h3>
            {(dash?.dueTodayFollowUps ?? []).length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium text-muted-foreground mb-1">Due today</p>
                {(dash.dueTodayFollowUps as any[]).map((f) => (
                  <button key={f.id} className="w-full text-left flex justify-between items-center gap-3 p-2 rounded-lg hover:bg-muted/50" onClick={() => navigate(`/admin/customers/${f.customerId}`)}>
                    <span className="text-sm">{f.title} · {f.customerName}</span>
                    <span className="font-data text-xs tabular-nums shrink-0">Today</span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs font-medium text-muted-foreground mb-1">Overdue</p>
            {(dash?.overdueFollowUps ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">None overdue</p>
            ) : (dash.overdueFollowUps as any[]).map((f) => (
              <button key={f.id} className="w-full text-left flex justify-between items-center gap-3 p-2 rounded-lg hover:bg-muted/50" onClick={() => navigate(`/admin/customers/${f.customerId}`)}>
                <span className="text-sm">{f.title} · {f.customerName}</span>
                <span className="font-data text-xs text-destructive tabular-nums shrink-0">{f.dueDate}</span>
              </button>
            ))}
            {(dash?.leadCount ?? 0) > 0 && (
              <button className="text-xs text-primary mt-2" onClick={() => navigate('/admin/customers')}>{dash.leadCount} leads →</button>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <h3 className="font-heading font-semibold mb-4 flex items-center gap-2"><FileWarning className="w-4 h-4" /> Unpaid invoices</h3>
            {(dash?.unpaidInvoices ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">All caught up</p>
            ) : (dash.unpaidInvoices as any[]).map((inv) => (
              <button key={inv.id} className="w-full text-left flex justify-between items-center gap-3 p-2 rounded-lg hover:bg-muted/50" onClick={() => navigate('/admin/invoices')}>
                <span className="text-sm min-w-0 truncate">
                  <span className="font-data text-[13px]">{inv.invoiceNumber}</span>
                  <span className="text-muted-foreground"> · {inv.customerName}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="font-data text-xs tabular-nums">${Number(inv.total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <Badge variant={invoiceStatusTone(inv.status)}>{inv.status}</Badge>
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-5">
          <h3 className="font-heading font-semibold mb-4">Today's Schedule ({todaysJobs.length} jobs)</h3>
          {todaysJobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Briefcase className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No jobs scheduled for today</p>
            </div>
          ) : (
            <div className="space-y-3">
              {todaysJobs.map(job => {
                const worker = workers.find(w => w.id === job.assignedWorkerId);
                return (
                  <div key={job.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-1 h-8 rounded-sm ${job.status === 'in_progress' ? 'bg-info' : job.status === 'assigned' ? 'bg-primary' : 'bg-muted-foreground'}`} />
                      <div>
                        <p className="font-medium text-sm">{job.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {job.customerName} · <span className="font-data">{job.scheduledTime}</span> · {job.estimatedDuration}h
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {worker && <Badge variant="secondary">{worker.name}</Badge>}
                      <Badge variant={job.status === 'in_progress' ? 'info' : job.status === 'assigned' ? 'default' : 'secondary'}>
                        {job.status.replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDashboard;
