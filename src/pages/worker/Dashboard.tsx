import { useFieldPro } from '@/hooks/useFieldPro';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import type { StatTone } from '@/components/ui/stat-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Briefcase, Clock, MapPin, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

const statusVariant = (status: string): 'info' | 'success' | 'secondary' | 'default' =>
  status === 'in_progress' ? 'info'
    : status === 'completed' ? 'success'
      : status === 'assigned' ? 'default'
        : 'secondary';

const WorkerDashboard = () => {
  const { currentUser, jobs } = useFieldPro();
  const navigate = useNavigate();
  const myJobs = jobs.filter(j => j.assignedWorkerId === currentUser?.id || j.assignedWorkerIds?.includes(currentUser?.id || ''));
  const today = new Date().toISOString().split('T')[0];
  const todaysJobs = myJobs.filter(j => j.scheduledDate === today);
  const activeJobs = myJobs.filter(j => j.status === 'in_progress').length;
  const pendingJobs = myJobs.filter(j => ['new', 'assigned'].includes(j.status)).length;
  const doneJobs = myJobs.filter(j => j.status === 'completed').length;
  const upcoming = myJobs
    .filter(j => j.scheduledDate && j.scheduledDate > today && !['completed', 'cancelled'].includes(j.status))
    .sort((a, b) => `${a.scheduledDate}${a.scheduledTime}`.localeCompare(`${b.scheduledDate}${b.scheduledTime}`))
    .slice(0, 8);
  const firstName = currentUser?.name?.split(' ')[0];
  const todayLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const stats: { label: string; desktopLabel: string; value: number; tone: StatTone }[] = [
    { label: 'Active', desktopLabel: 'Active Jobs', value: activeJobs, tone: 'info' },
    { label: 'Pending', desktopLabel: 'Pending Jobs', value: pendingJobs, tone: 'warning' },
    { label: 'Done', desktopLabel: 'Completed', value: doneJobs, tone: 'success' },
    { label: 'Today', desktopLabel: 'Today', value: todaysJobs.length, tone: 'accent' },
  ];

  return (
    <div className="space-y-5 lg:space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-heading font-bold">
            <span className="lg:hidden">Hi, {firstName} 👋</span>
            <span className="hidden lg:inline">Dashboard</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            <span className="lg:hidden">{todaysJobs.length} jobs today</span>
            <span className="hidden lg:inline">Welcome back, {currentUser?.name} · {todayLabel}</span>
          </p>
        </div>
        <div className="hidden lg:flex gap-2">
          <Button variant="outline" onClick={() => navigate('/worker/schedule')}>My Schedule</Button>
          <Button className="text-primary-foreground" onClick={() => navigate('/worker/jobs')}>View All Jobs</Button>
        </div>
      </div>

      <div className="grid grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-4">
        {stats.map((s, i) => (
          <motion.div key={s.label} className={s.label === 'Today' ? 'hidden lg:block' : undefined} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <StatCard label={s.desktopLabel} value={s.value} tone={s.tone} className="lg:min-h-0" />
          </motion.div>
        ))}
      </div>

      <div className="lg:hidden">
        <h2 className="font-heading font-semibold text-sm mb-3">Today's Jobs</h2>
        {todaysJobs.length === 0 ? (
          <Card className="shadow-theme-sm"><CardContent className="p-8 text-center text-muted-foreground"><Briefcase className="w-8 h-8 mx-auto mb-2 opacity-30" /><p className="text-sm">No jobs scheduled today</p></CardContent></Card>
        ) : (
          <div className="space-y-3">{todaysJobs.map(job => (
            <Card key={job.id} className="shadow-theme-sm hover:shadow-theme-md transition-shadow cursor-pointer" onClick={() => navigate(`/worker/jobs/${job.id}`)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <p className="font-medium text-sm">{job.title}</p>
                  <Badge variant={statusVariant(job.status)}>{job.status.replace('_', ' ')}</Badge>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1"><Clock className="w-3 h-3" />{job.scheduledTime} · {job.estimatedDuration}h</div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="w-3 h-3" />{job.customerAddress}</div>
              </CardContent>
            </Card>
          ))}</div>
        )}
      </div>

      <div className="hidden lg:grid lg:grid-cols-3 gap-6">
        <Card className="shadow-theme-sm lg:col-span-2">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading font-semibold">Today's Jobs</h2>
              <span className="text-xs text-muted-foreground">{todaysJobs.length} scheduled</span>
            </div>
            {todaysJobs.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No jobs scheduled today</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right"> </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {todaysJobs.map((job) => (
                    <TableRow key={job.id} className="cursor-pointer" onClick={() => navigate(`/worker/jobs/${job.id}`)}>
                      <TableCell>
                        <p className="font-medium text-sm">{job.title}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" />{job.customerAddress?.split(',')[0]}</p>
                      </TableCell>
                      <TableCell className="text-sm">{job.customerName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground font-data">{job.scheduledTime} · {job.estimatedDuration}h</TableCell>
                      <TableCell><Badge variant={statusVariant(job.status)}>{job.status.replace('_', ' ')}</Badge></TableCell>
                      <TableCell className="text-right"><ArrowRight className="w-4 h-4 text-muted-foreground inline" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-theme-sm">
          <CardContent className="p-5">
            <h2 className="font-heading font-semibold mb-4">Upcoming</h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No upcoming jobs</p>
            ) : (
              <div className="space-y-2">
                {upcoming.map((j) => (
                  <button key={j.id} type="button" onClick={() => navigate(`/worker/jobs/${j.id}`)} className="w-full text-left flex items-start justify-between gap-2 p-2.5 rounded-lg border hover:bg-muted/50 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{j.title}</p>
                      <p className="text-xs text-muted-foreground font-data">{j.scheduledDate} {j.scheduledTime}</p>
                    </div>
                    <Badge variant={statusVariant(j.status)} className="shrink-0">{j.status.replace('_', ' ')}</Badge>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:hidden">
        <Button onClick={() => navigate('/worker/jobs')}>View All Jobs</Button>
        <Button variant="outline" onClick={() => navigate('/worker/schedule')}>My Schedule</Button>
      </div>
    </div>
  );
};
export default WorkerDashboard;
