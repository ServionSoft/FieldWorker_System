import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function PlatformAudit() {
  const q = useQuery({ queryKey: ['platform', 'audit'], queryFn: api.platform.audit });
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-heading font-bold">Audit log</h1>
        <p className="text-sm text-muted-foreground">Platform actions across tenants</p>
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Company</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(q.data ?? []).map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell className="text-xs">{new Date(a.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="text-sm">{a.action}</TableCell>
                  <TableCell className="text-sm">{a.actorEmail || '—'}</TableCell>
                  <TableCell className="text-sm">{a.companyName || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
