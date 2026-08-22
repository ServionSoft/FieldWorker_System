import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Download } from 'lucide-react';
import { toast } from 'sonner';

const COLORS = ['hsl(217, 91%, 60%)', 'hsl(262, 83%, 58%)', 'hsl(142, 76%, 36%)', 'hsl(38, 92%, 50%)', 'hsl(0, 84%, 60%)'];

const AdminReports = () => {
  const reportsQ = useQuery({ queryKey: ['ops', 'reports'], queryFn: api.ops.reports });
  const data = reportsQ.data;
  const statusData = data?.jobDistribution ?? [];
  const workerEfficiency = data?.workerEfficiency ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-heading font-bold">Reports</h1><p className="text-muted-foreground text-sm">Performance analytics</p></div>
        <Button variant="outline" className="gap-2" onClick={() => toast.success('Report exported!')}><Download className="w-4 h-4" /> Export</Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-theme-sm"><CardHeader><CardTitle className="text-lg font-heading">Job Distribution</CardTitle></CardHeader><CardContent>
          <ResponsiveContainer width="100%" height={260}><PieChart><Pie data={statusData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>{statusData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>
        </CardContent></Card>
        <Card className="shadow-theme-sm"><CardHeader><CardTitle className="text-lg font-heading">Worker Efficiency</CardTitle></CardHeader><CardContent>
          <ResponsiveContainer width="100%" height={260}><BarChart data={workerEfficiency}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} /><YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} /><Tooltip /><Bar dataKey="completed" fill="hsl(217, 91%, 60%)" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>
        </CardContent></Card>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-theme-sm"><CardContent className="p-4 text-center"><p className="text-2xl font-heading font-bold">{data?.totalJobs ?? 0}</p><p className="text-xs text-muted-foreground">Total Jobs</p></CardContent></Card>
        <Card className="shadow-theme-sm"><CardContent className="p-4 text-center"><p className="text-2xl font-heading font-bold">${(data?.revenue ?? 0).toFixed(0)}</p><p className="text-xs text-muted-foreground">Revenue</p></CardContent></Card>
        <Card className="shadow-theme-sm"><CardContent className="p-4 text-center"><p className="text-2xl font-heading font-bold">{data?.avgRating ?? '—'}</p><p className="text-xs text-muted-foreground">Avg Rating</p></CardContent></Card>
        <Card className="shadow-theme-sm"><CardContent className="p-4 text-center"><p className="text-2xl font-heading font-bold">{data?.completed ?? 0}</p><p className="text-xs text-muted-foreground">Completed</p></CardContent></Card>
      </div>
    </div>
  );
};
export default AdminReports;
