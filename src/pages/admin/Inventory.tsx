import { useState } from 'react';
import { useFieldPro } from '@/hooks/useFieldPro';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, Edit, AlertTriangle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { InventoryItem } from '@/store/types';
import { confirmDiscard, useUnsavedGuard } from '@/hooks/useUnsavedGuard';
import { FieldError, fieldInvalidProps } from '@/components/crm/FieldError';
import { applyErrors, moneyError, nonNegIntError, requiredText } from '@/lib/formValidation';

const AdminInventory = () => {
  const { currentUser, inventory, addInventoryItem, updateInventoryItem, deleteInventoryItem } = useFieldPro();
  const items = inventory.filter(i => i.companyId === currentUser?.companyId);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const emptyInv = { name: '', sku: '', category: '', quantity: '0', minStock: '10', unitPrice: '0' };
  const [form, setForm] = useState(emptyInv);
  const [invErrors, setInvErrors] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<InventoryItem | null>(null);
  const invDirty = JSON.stringify(form) !== JSON.stringify(editItem
    ? { name: editItem.name, sku: editItem.sku, category: editItem.category, quantity: String(editItem.quantity), minStock: String(editItem.minStock), unitPrice: String(editItem.unitPrice) }
    : emptyInv);
  useUnsavedGuard((showAdd || !!editItem) && invDirty);
  const closeInv = () => {
    if (!confirmDiscard(invDirty)) return;
    setShowAdd(false); setEditItem(null); setForm(emptyInv);
  };

  const filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
  const lowStock = items.filter(i => i.quantity < i.minStock);

  const handleSave = () => {
    const next = applyErrors({
      name: requiredText(form.name, 'Name'),
      sku: requiredText(form.sku, 'SKU'),
      quantity: nonNegIntError(form.quantity, 'Quantity'),
      minStock: nonNegIntError(form.minStock, 'Min stock'),
      unitPrice: moneyError(form.unitPrice, { allowZero: true }),
    });
    setInvErrors(next);
    if (Object.values(next).some(Boolean)) return;
    if (editItem) {
      updateInventoryItem(editItem.id, { name: form.name, sku: form.sku, category: form.category, quantity: parseInt(form.quantity), minStock: parseInt(form.minStock), unitPrice: parseFloat(form.unitPrice) });
      toast.success('Item updated!');
    } else {
      addInventoryItem({ id: `inv${Date.now()}`, ...form, quantity: parseInt(form.quantity), minStock: parseInt(form.minStock), unitPrice: parseFloat(form.unitPrice), companyId: currentUser?.companyId || '' } as any);
      toast.success('Item added!');
    }
    setShowAdd(false); setEditItem(null);
    setForm({ name: '', sku: '', category: '', quantity: '0', minStock: '10', unitPrice: '0' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-heading font-bold">Inventory</h1><p className="text-muted-foreground text-sm">{items.length} items · {lowStock.length} low stock</p></div>
        <Button onClick={() => setShowAdd(true)} className="gradient-primary text-primary-foreground gap-2"><Plus className="w-4 h-4" /> Add Item</Button>
      </div>
      {lowStock.length > 0 && (
        <Card className="border-warning/50 bg-warning/5 shadow-theme-sm"><CardContent className="p-4 flex items-center gap-3"><AlertTriangle className="w-5 h-5 text-warning" /><div><p className="font-medium text-sm">Low Stock Alert</p><p className="text-xs text-muted-foreground">{lowStock.map(i => i.name).join(', ')}</p></div></CardContent></Card>
      )}
      <Card className="shadow-theme-sm"><CardContent className="p-4">
        <div className="relative mb-4"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" /></div>
        <Table><TableHeader><TableRow><TableHead>Item</TableHead><TableHead>SKU</TableHead><TableHead>Category</TableHead><TableHead>Stock</TableHead><TableHead>Price</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {filtered.map(item => (
            <TableRow key={item.id} className="hover:bg-muted/50">
              <TableCell className="font-medium text-sm">{item.name}</TableCell><TableCell className="text-sm text-muted-foreground">{item.sku}</TableCell><TableCell><Badge variant="secondary" className="text-xs">{item.category}</Badge></TableCell>
              <TableCell><span className={`text-sm font-medium ${item.quantity < item.minStock ? 'text-warning' : 'text-muted-foreground'}`}>{item.quantity}/{item.minStock}</span></TableCell>
              <TableCell className="text-sm">${item.unitPrice.toFixed(2)}</TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditItem(item); setForm({ name: item.name, sku: item.sku, category: item.category, quantity: String(item.quantity), minStock: String(item.minStock), unitPrice: String(item.unitPrice) }); }}><Edit className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setPendingDelete(item)}><Trash2 className="w-4 h-4" /></Button>
              </TableCell>
            </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-sm text-muted-foreground">
                {search ? 'No items match your search.' : 'No inventory items yet.'}
              </TableCell></TableRow>
            )}
          </TableBody></Table>
      </CardContent></Card>
      <Dialog open={!!pendingDelete} onOpenChange={() => setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete item</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Delete <strong>{pendingDelete?.name}</strong>? This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              if (pendingDelete) deleteInventoryItem(pendingDelete.id);
              toast.success('Item deleted');
              setPendingDelete(null);
            }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={showAdd || !!editItem} onOpenChange={(open) => { if (!open) closeInv(); }}>
        <DialogContent><DialogHeader><DialogTitle>{editItem ? 'Edit Item' : 'Add Item'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input value={form.name} onChange={e => { setForm({ ...form, name: e.target.value }); setInvErrors(x => ({ ...x, name: '' })); }} {...fieldInvalidProps('name', invErrors.name)} />
              <FieldError id="name-error" message={invErrors.name} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sku">SKU</Label>
                <Input value={form.sku} onChange={e => { setForm({ ...form, sku: e.target.value }); setInvErrors(x => ({ ...x, sku: '' })); }} {...fieldInvalidProps('sku', invErrors.sku)} />
                <FieldError id="sku-error" message={invErrors.sku} />
              </div>
              <div className="space-y-2"><Label>Category</Label><Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input type="number" min="0" value={form.quantity} onChange={e => { setForm({ ...form, quantity: e.target.value }); setInvErrors(x => ({ ...x, quantity: '' })); }} {...fieldInvalidProps('quantity', invErrors.quantity)} />
                <FieldError id="quantity-error" message={invErrors.quantity} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minStock">Min Stock</Label>
                <Input type="number" min="0" value={form.minStock} onChange={e => { setForm({ ...form, minStock: e.target.value }); setInvErrors(x => ({ ...x, minStock: '' })); }} {...fieldInvalidProps('minStock', invErrors.minStock)} />
                <FieldError id="minStock-error" message={invErrors.minStock} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unitPrice">Unit Price</Label>
                <Input type="number" min="0" step="0.01" value={form.unitPrice} onChange={e => { setForm({ ...form, unitPrice: e.target.value }); setInvErrors(x => ({ ...x, unitPrice: '' })); }} {...fieldInvalidProps('unitPrice', invErrors.unitPrice)} />
                <FieldError id="unitPrice-error" message={invErrors.unitPrice} />
              </div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={closeInv}>Cancel</Button><Button onClick={handleSave} className="gradient-primary text-primary-foreground">Save</Button></DialogFooter>
        </DialogContent></Dialog>
    </div>
  );
};
export default AdminInventory;
