import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFieldPro } from '@/hooks/useFieldPro';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Upload, Trash2, FileText, Download, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useClientPage, ListPager } from '@/components/crm/ListPager';

const AdminDocuments = () => {
  const { currentUser, documents, addDocument, deleteDocument, jobs } = useFieldPro();
  const [params] = useSearchParams();
  const jobId = params.get('jobId') || '';
  const docs = documents.filter(d => d.companyId === currentUser?.companyId)
    .filter(d => !jobId || d.jobId === jobId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const filtered = docs.filter(d => !search.trim() || d.name.toLowerCase().includes(search.toLowerCase()));
  const pager = useClientPage(filtered);
  const jobName = jobs.find(j => j.id === jobId)?.title;

  const handleUpload = async (file?: File) => {
    if (!file) return;
    try {
      await addDocument(file, jobId || undefined);
      toast.success('Document uploaded!');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-bold">Documents</h1>
          <p className="text-muted-foreground text-sm">{filtered.length} files{jobName ? ` · ${jobName}` : ''}</p>
        </div>
        <div>
          <input ref={inputRef} type="file" className="hidden" onChange={e => handleUpload(e.target.files?.[0])} />
          <Button onClick={() => inputRef.current?.click()} className="gradient-primary text-primary-foreground gap-2"><Upload className="w-4 h-4" /> Upload</Button>
        </div>
      </div>
      <Card className="shadow-theme-sm"><CardContent className="p-4">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search documents..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <div className="overflow-x-auto">
        <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Size</TableHead><TableHead>Uploaded</TableHead><TableHead>By</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {pager.items.map(doc => (
            <TableRow key={doc.id}><TableCell className="flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /><span className="text-sm font-medium">{doc.name}</span></TableCell>
              <TableCell className="text-sm">{doc.type}</TableCell><TableCell className="text-sm">{doc.size}</TableCell><TableCell className="text-sm text-muted-foreground">{doc.uploadedAt}</TableCell><TableCell className="text-sm">{doc.uploadedBy}</TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => api.documents.download(doc.id).catch(() => toast.error('Download failed'))}><Download className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setPendingDelete(doc.id)}><Trash2 className="w-4 h-4" /></Button>
              </TableCell>
            </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-sm text-muted-foreground">
                {search ? 'No documents match your search.' : 'No documents yet. Upload a file to get started.'}
              </TableCell></TableRow>
            )}
          </TableBody></Table>
        </div>
        <ListPager page={pager.page} pageSize={pager.pageSize} total={pager.total} onPage={pager.setPage} onPageSize={pager.setPageSize} />
      </CardContent></Card>
      <Dialog open={!!pendingDelete} onOpenChange={() => setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete document</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={async () => {
              if (!pendingDelete) return;
              await deleteDocument(pendingDelete);
              toast.success('Deleted');
              setPendingDelete(null);
            }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default AdminDocuments;
