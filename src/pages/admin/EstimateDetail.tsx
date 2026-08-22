import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useFieldPro } from '@/hooks/useFieldPro';
import { api, ApiError } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Send, Check, X, Briefcase, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { EstimateLineItem, EstimateStatus } from '@/store/types';
import CommunicationsThread from '@/components/communications/CommunicationsThread';
import { CopyContact } from '@/components/crm/CopyContact';
import { CrmBreadcrumb } from '@/components/crm/CrmBreadcrumb';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { useAppStore } from '@/store/useAppStore';

const statusColors: Record<EstimateStatus, string> = {
  draft: 'tint-slate',
  sent: 'tint-info',
  approved: 'tint-success',
  rejected: 'tint-danger',
  converted: 'tint-purple',
};

const EstimateDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { updateEstimate, convertEstimateToJob } = useFieldPro();
  const estQ = useQuery({
    queryKey: ['estimates', id],
    queryFn: () => api.estimates.get(id!),
    enabled: !!id,
    retry: false,
  });
  const estimate = estQ.data;
  const [editingItems, setEditingItems] = useState(false);
  const [items, setItems] = useState<EstimateLineItem[]>([]);
  const companyId = useAppStore((s) => s.company?.id);
  const { track } = useRecentlyViewed(companyId);
  useEffect(() => {
    if (!estQ.data) return;
    const e = estQ.data;
    track({ kind: 'estimate', id: e.id, label: e.estimateNumber, href: `/admin/estimates/${e.id}` });
  }, [estQ.data, track]);

  if (estQ.isLoading) {
    return <p className="text-muted-foreground">Loading estimate…</p>;
  }

  if (estQ.isError || !estimate) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/admin/estimates')} className="gap-2"><ArrowLeft className="w-4 h-4" /> Back</Button>
        <p className="text-muted-foreground">Estimate not found.</p>
      </div>
    );
  }

  const handleStatusChange = (status: EstimateStatus) => {
    updateEstimate(estimate.id, { status, updatedAt: new Date().toISOString().split('T')[0] });
    toast.success(`Estimate marked as ${status}`);
  };

  const handleConvertToJob = async () => {
    try {
      const jobId = await convertEstimateToJob(estimate.id);
      if (!jobId) return toast.error('Failed to convert');
      toast.success('Estimate converted to job!');
      navigate(`/admin/jobs/${jobId}`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to convert');
    }
  };

  const canEditItems = estimate.status === 'draft' || estimate.status === 'sent';

  const startEditItems = () => {
    setItems(estimate.items.map(i => ({ ...i })));
    setEditingItems(true);
  };

  const cancelEditItems = () => setEditingItems(false);

  const updateLineItem = (index: number, field: keyof EstimateLineItem, value: string | number) => {
    setItems(prev => {
      const next = [...prev];
      const row = { ...next[index], [field]: value } as EstimateLineItem;
      if (field === 'quantity' || field === 'unitPrice') {
        row.total = Number(row.quantity) * Number(row.unitPrice);
      }
      next[index] = row;
      return next;
    });
  };

  const addLineItem = () => setItems(prev => [...prev, { description: '', quantity: 1, unitPrice: 0, total: 0 }]);
  const removeLineItem = (index: number) => setItems(prev => prev.filter((_, i) => i !== index));

  const handleSaveItems = async () => {
    const cleaned = items
      .map(i => ({
        ...i,
        description: i.description.trim(),
        quantity: Number(i.quantity) || 0,
        unitPrice: Number(i.unitPrice) || 0,
        total: (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0),
      }))
      .filter(i => i.description);
    if (cleaned.length === 0) {
      toast.error('Add at least one line item with a description.');
      return;
    }
    const subtotal = +cleaned.reduce((s, i) => s + i.total, 0).toFixed(2);
    const taxRate = estimate.taxRate != null
      ? estimate.taxRate / 100
      : (estimate.subtotal > 0 ? estimate.tax / estimate.subtotal : 0);
    const tax = +(subtotal * taxRate).toFixed(2);
    const total = +(subtotal + tax).toFixed(2);
    try {
      await updateEstimate(estimate.id, {
        items: cleaned,
        subtotal,
        tax,
        total,
        updatedAt: new Date().toISOString().split('T')[0],
      });
      toast.success('Line items updated');
      setEditingItems(false);
      await qc.invalidateQueries({ queryKey: ['estimates', id] });
    } catch (err: any) {
      toast.error(err?.message || 'Could not update estimate');
    }
  };

  return (
    <div className="space-y-6">
      <CrmBreadcrumb items={[{ label: 'Estimates', href: '/admin/estimates' }, { label: estimate.estimateNumber }]} />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/admin/estimates')} className="gap-2"><ArrowLeft className="w-4 h-4" /> Back</Button>
          <div>
            <h1 className="text-2xl font-heading font-bold">{estimate.estimateNumber}</h1>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[estimate.status]}`}>{estimate.status}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {estimate.status === 'draft' && (
            <Button variant="outline" className="gap-2" onClick={() => handleStatusChange('sent')}><Send className="w-4 h-4" /> Send</Button>
          )}
          {estimate.status === 'sent' && (
            <>
              <Button variant="outline" className="gap-2 text-success" onClick={() => handleStatusChange('approved')}><Check className="w-4 h-4" /> Approve</Button>
              <Button variant="outline" className="gap-2 text-destructive" onClick={() => handleStatusChange('rejected')}><X className="w-4 h-4" /> Reject</Button>
            </>
          )}
          {(estimate.status === 'approved') && (
            <Button className="gradient-primary text-primary-foreground gap-2" onClick={handleConvertToJob}><Briefcase className="w-4 h-4" /> Convert to Job</Button>
          )}
          {estimate.status === 'converted' && estimate.convertedJobId && (
            <Button variant="outline" onClick={() => navigate(`/admin/jobs/${estimate.convertedJobId}`)} className="gap-2"><Briefcase className="w-4 h-4" /> View Job</Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-theme-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Line Items</CardTitle>
              {canEditItems && (
                editingItems ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={cancelEditItems}>Cancel</Button>
                    <Button size="sm" onClick={handleSaveItems}>Save</Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={startEditItems}>Edit</Button>
                )
              )}
            </CardHeader>
            <CardContent>
              {editingItems ? (
                <div className="space-y-3">
                  {items.map((item, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-5">
                        <Input placeholder="Description" value={item.description} onChange={e => updateLineItem(i, 'description', e.target.value)} />
                      </div>
                      <div className="col-span-2">
                        <Input type="number" placeholder="Qty" value={item.quantity} onChange={e => updateLineItem(i, 'quantity', parseFloat(e.target.value) || 0)} />
                      </div>
                      <div className="col-span-2">
                        <Input type="number" placeholder="Rate" value={item.unitPrice} onChange={e => updateLineItem(i, 'unitPrice', parseFloat(e.target.value) || 0)} />
                      </div>
                      <div className="col-span-2 text-sm font-medium text-right pt-2">${item.total.toFixed(2)}</div>
                      <div className="col-span-1">
                        {items.length > 1 && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeLineItem(i)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" className="gap-1" onClick={addLineItem}>
                    <Plus className="w-3.5 h-3.5" /> Add line
                  </Button>
                  <div className="border-t mt-4 pt-4 space-y-1 text-right text-sm">
                    {(() => {
                      const sub = items.reduce((s, i) => s + i.total, 0);
                      const rate = estimate.taxRate != null ? estimate.taxRate / 100 : (estimate.subtotal > 0 ? estimate.tax / estimate.subtotal : 0);
                      const tax = sub * rate;
                      return (
                        <>
                          <p>Subtotal: <span className="font-medium">${sub.toFixed(2)}</span></p>
                          <p>Tax: <span className="font-medium">${tax.toFixed(2)}</span></p>
                          <p className="text-lg font-bold">Total: ${(sub + tax).toFixed(2)}</p>
                        </>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {estimate.items.map((item, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm">{item.description}</TableCell>
                          <TableCell className="text-right text-sm">{item.quantity}</TableCell>
                          <TableCell className="text-right text-sm">${item.unitPrice.toFixed(2)}</TableCell>
                          <TableCell className="text-right text-sm font-medium">${item.total.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="border-t mt-4 pt-4 space-y-1 text-right text-sm">
                    <p>Subtotal: <span className="font-medium">${estimate.subtotal.toFixed(2)}</span></p>
                    <p>Tax: <span className="font-medium">${estimate.tax.toFixed(2)}</span></p>
                    <p className="text-lg font-bold">Total: ${estimate.total.toFixed(2)}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {estimate.notes && (
            <Card className="shadow-theme-sm">
              <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
              <CardContent><p className="text-sm text-muted-foreground">{estimate.notes}</p></CardContent>
            </Card>
          )}

          <Card className="shadow-theme-sm">
            <CardContent className="p-6">
              <CommunicationsThread
                toNumber={estimate.customerPhone}
                filter={{ estimateId: estimate.id }}
                title="Communications"
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="shadow-theme-sm">
            <CardHeader><CardTitle className="text-base">Customer Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">Name</span>
                {estimate.customerId ? (
                  <p><button className="font-medium text-primary hover:underline" onClick={() => navigate(`/admin/customers/${estimate.customerId}`)}>{estimate.customerName}</button></p>
                ) : (
                  <p className="font-medium">{estimate.customerName}</p>
                )}
              </div>
              <CopyContact email={estimate.customerEmail} phone={estimate.customerPhone} />
              <div><span className="text-muted-foreground">Address</span><p className="font-medium">{estimate.customerAddress}</p></div>
            </CardContent>
          </Card>

          <Card className="shadow-theme-sm">
            <CardHeader><CardTitle className="text-base">Estimate Info</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div><span className="text-muted-foreground">Category</span><p><Badge variant="secondary">{estimate.category}</Badge></p></div>
              <div><span className="text-muted-foreground">Created</span><p className="font-medium">{estimate.createdAt}</p></div>
              <div><span className="text-muted-foreground">Valid Until</span><p className="font-medium">{estimate.validUntil || '—'}</p></div>
              <div><span className="text-muted-foreground">Last Updated</span><p className="font-medium">{estimate.updatedAt}</p></div>
            </CardContent>
          </Card>

          <Card className="shadow-theme-sm">
            <CardHeader><CardTitle className="text-base">Update Status</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {(['draft', 'sent', 'approved', 'rejected'] as EstimateStatus[]).map(s => (
                  <Button key={s} size="sm" variant={estimate.status === s ? 'default' : 'outline'} onClick={() => handleStatusChange(s)} className="text-xs" disabled={estimate.status === 'converted'}>
                    {s}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default EstimateDetail;
