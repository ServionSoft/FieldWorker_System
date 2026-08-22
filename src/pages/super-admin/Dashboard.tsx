import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LabelList } from 'recharts';
import { CHART_GRID_STROKE, JOB_STATUS_FILLS, STATUS_HEX } from '@/lib/chartTheme';

const SADashboard = () => {
  const q = useQuery({ queryKey: ['platform', 'dashboard'], queryFn: api.platform.dashboard });
  const d = q.data;
  const stats = [
    { label: 'Total Companies', value: d?.totalCompanies ?? '—', tone: 'info' as const },
    { label: 'Active Subscriptions', value: d?.activeSubscriptions ?? '—', tone: 'success' as const },
    { label: 'Monthly Revenue', value: d ? `$${Number(d.monthlyRevenue).toLocaleString()}` : '—', tone: 'accent' as const },
    { label: 'Total Employees', value: d?.totalEmployees ?? '—', tone: 'warning' as const },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold">Platform Dashboard</h1>
        <p className="text-muted-foreground text-sm">Live metrics from the API</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <StatCard label={stat.label} value={stat.value} tone={stat.tone} />
          </motion.div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-lg font-heading">Company Status</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={d?.statusData ?? []} margin={{ top: 18, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} strokeWidth={1} />
                <XAxis dataKey="status" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12 }} />
                <Bar dataKey="count" radius={[2, 2, 0, 0]} maxBarSize={48}>
                  {(d?.statusData ?? []).map((_: unknown, i: number) => <Cell key={i} fill={JOB_STATUS_FILLS[i % JOB_STATUS_FILLS.length]} />)}
                  <LabelList dataKey="count" position="top" className="fill-foreground" fontSize={11} fontFamily="IBM Plex Mono, monospace" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-lg font-heading">Plan Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={d?.planDistribution ?? []} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {(d?.planDistribution ?? []).map((_: unknown, i: number) => <Cell key={i} fill={[STATUS_HEX.inProgress, STATUS_HEX.accent, STATUS_HEX.completed, STATUS_HEX.warning][i % 4]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-lg font-heading">Recent activity</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(d?.activities ?? []).length === 0 && <p className="text-sm text-muted-foreground">No recent audit events</p>}
          {(d?.activities ?? []).map((a: { text: string; time: string }, i: number) => (
            <div key={i} className="flex justify-between text-sm py-1 border-b last:border-0">
              <span>{a.text}</span>
              <span className="text-xs text-muted-foreground font-data">{new Date(a.time).toLocaleString()}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default SADashboard;
