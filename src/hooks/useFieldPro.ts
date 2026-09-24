import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';

export function useFieldPro() {
  const auth = useAppStore();
  const qc = useQueryClient();
  const role = auth.currentUser?.role;
  const tenant = !!auth.isAuthenticated && role !== 'super_admin';
  const office = ['owner', 'admin', 'dispatcher', 'office'].includes(role || '');
  const admin = office;
  const platform = role === 'super_admin';
  const can = (perm: string) => role === 'super_admin' || (auth.currentUser?.permissions ?? auth.permissions ?? []).includes(perm);
  const hasPlan = (feature: string) => (auth.planFeatures ?? []).includes(feature);

  const jobsQ = useQuery({ queryKey: ['jobs'], queryFn: api.jobs.list, enabled: tenant });
  const customersQ = useQuery({ queryKey: ['customers'], queryFn: () => api.customers.list(), enabled: admin });
  const workersQ = useQuery({ queryKey: ['workers'], queryFn: api.workers.list, enabled: tenant });
  const estimatesQ = useQuery({ queryKey: ['estimates'], queryFn: api.estimates.list, enabled: admin });
  const invoicesQ = useQuery({ queryKey: ['invoices'], queryFn: api.invoices.list, enabled: admin });
  const inventoryQ = useQuery({ queryKey: ['inventory'], queryFn: api.inventory.list, enabled: admin && hasPlan('inventory') });
  const documentsQ = useQuery({ queryKey: ['documents'], queryFn: () => api.documents.list(), enabled: tenant });
  const agreementsQ = useQuery({ queryKey: ['agreements'], queryFn: api.agreements.list, enabled: admin });
  const templatesQ = useQuery({ queryKey: ['templates'], queryFn: api.templates.list, enabled: admin });
  const commsQ = useQuery({ queryKey: ['communications'], queryFn: () => api.communications.list(), enabled: tenant });
  const notifQ = useQuery({
    queryKey: ['notifications'],
    queryFn: api.notifications.list,
    enabled: !!auth.isAuthenticated,
    refetchInterval: 30_000,
  });
  const companiesQ = useQuery({ queryKey: ['platform', 'companies'], queryFn: api.platform.companies, enabled: platform });
  const plansQ = useQuery({ queryKey: ['platform', 'plans'], queryFn: api.platform.plans, enabled: platform });

  const inv = (...keys: string[]) => qc.invalidateQueries({ queryKey: keys });

  const addJob = useMutation({ mutationFn: api.jobs.create, onSuccess: () => inv('jobs') });
  const updateJob = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: unknown }) => api.jobs.update(id, updates),
    onSuccess: () => inv('jobs'),
  });
  const deleteJob = useMutation({ mutationFn: api.jobs.remove, onSuccess: () => inv('jobs') });
  const updateJobStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.jobs.status(id, status),
    onSuccess: () => { inv('jobs'); inv('notifications'); },
  });
  const assignWorker = useMutation({
    mutationFn: ({ jobId, workerId }: { jobId: string; workerId: string }) => api.jobs.assign(jobId, workerId),
    onSuccess: () => { inv('jobs'); inv('notifications'); },
  });

  return {
    ...auth,
    users: [] as unknown[],
    companies: companiesQ.data ?? [],
    plans: plansQ.data ?? [],
    jobs: jobsQ.data ?? [],
    workers: workersQ.data ?? [],
    inventory: inventoryQ.data ?? [],
    invoices: invoicesQ.data ?? [],
    chatMessages: [] as unknown[],
    notifications: notifQ.data ?? [],
    documents: documentsQ.data ?? [],
    serviceAgreements: agreementsQ.data ?? [],
    emailTemplates: templatesQ.data ?? [],
    customers: customersQ.data ?? [],
    estimates: estimatesQ.data ?? [],
    communications: commsQ.data ?? [],
    isLoading: tenant && (jobsQ.isLoading || customersQ.isLoading),

    addJob: async (job: any) => addJob.mutateAsync({
      title: job.title,
      description: job.description ?? '',
      priority: job.priority,
      category: job.category,
      customerId: job.customerId,
      scheduledDate: job.scheduledDate || undefined,
      scheduledTime: job.scheduledTime || undefined,
      arrivalEndTime: job.arrivalEndTime || job.arrivalEnd || undefined,
      multiDay: job.multiDay,
      endDate: job.endDate || undefined,
      estimatedDuration: Number(job.estimatedDuration) || 2,
      materials: job.materials ?? [],
      assignedWorkerIds: job.assignedWorkerIds ?? [],
      poNumber: job.poNumber,
      jobSource: job.jobSource,
      notesForTechs: job.notesForTechs,
      completionNotes: job.completionNotes,
      requiresFollowUp: job.requiresFollowUp,
      notifyTechs: job.notifyTechs,
      billingType: job.billingType,
      taxRate: job.taxRate,
      noteToCustomer: job.noteToCustomer,
      lineItems: job.lineItems,
    }),
    updateJob: async (id: string, updates: any) => {
      if (updates.notes && Array.isArray(updates.notes)) {
        const last = updates.notes[updates.notes.length - 1];
        if (typeof last === 'string') await api.jobs.addNote(id, last);
        await inv('jobs');
        return;
      }
      return updateJob.mutateAsync({ id, updates });
    },
    addJobNote: async (id: string, body: string) => {
      await api.jobs.addNote(id, body);
      await inv('jobs');
    },
    deleteJob: async (id: string) => deleteJob.mutateAsync(id),
    updateJobStatus: async (id: string, status: string) => updateJobStatus.mutateAsync({ id, status }),
    assignWorker: async (jobId: string, workerId: string) => assignWorker.mutateAsync({ jobId, workerId }),

    addCustomer: async (c: any) => {
      await api.customers.create({
        firstName: c.firstName ?? c.primaryContact?.firstName ?? (c.name || '').split(' ')[0],
        lastName: c.lastName ?? c.primaryContact?.lastName ?? (c.name || '').split(' ').slice(1).join(' '),
        email: c.email,
        phone: c.phone,
        phoneExt: c.phoneExt ?? c.primaryContact?.phoneExt,
        notes: c.notes,
        tags: c.tags,
        status: c.status,
        customerType: c.customerType,
        source: c.source,
        locationName: c.locationName ?? c.serviceLocation?.locationName,
        street: c.street ?? c.serviceLocation?.street,
        unit: c.unit ?? c.serviceLocation?.unit,
        city: c.city ?? c.serviceLocation?.city,
        state: c.state ?? c.serviceLocation?.state,
        zip: c.zip ?? c.serviceLocation?.zip,
        gatedProperty: c.gatedProperty ?? c.serviceLocation?.gatedProperty,
      });
      await inv('customers');
    },
    updateCustomer: async (id: string, updates: any) => { await api.customers.update(id, updates); await inv('customers'); },
    deleteCustomer: async (id: string) => { await api.customers.remove(id); await inv('customers'); },

    addWorker: async (w: any) => {
      const created = await api.workers.create({
        name: w.name,
        email: w.email,
        phone: w.phone,
        specialties: Array.isArray(w.specialties) ? w.specialties : String(w.specialties || '').split(',').map((s: string) => s.trim()).filter(Boolean),
        status: w.status,
        password: w.password,
      });
      await inv('workers');
      return created as { emailSent?: boolean; emailError?: string };
    },
    updateWorker: async (id: string, updates: any) => { await api.workers.update(id, updates); await inv('workers'); },
    deleteWorker: async (id: string) => { await api.workers.remove(id); await inv('workers'); },
    updateWorkerAvailability: async (id: string, availability: any) => {
      await api.workers.setAvailability(id, availability);
      await inv('workers');
    },
    addUnavailableDate: async (id: string, date: string) => { await api.workers.addTimeOff(id, date); await inv('workers'); },
    removeUnavailableDate: async (id: string, date: string) => { await api.workers.removeTimeOff(id, date); await inv('workers'); },

    addInventoryItem: async (item: any) => { await api.inventory.create(item); await inv('inventory'); },
    updateInventoryItem: async (id: string, updates: any) => { await api.inventory.update(id, updates); await inv('inventory'); },
    deleteInventoryItem: async (id: string) => { await api.inventory.remove(id); await inv('inventory'); },

    addInvoice: async (jobId: string) => {
      const invc = await api.jobs.generateInvoice(jobId);
      await inv('invoices'); await inv('jobs');
      return invc;
    },
    updateInvoice: async (id: string, updates: any) => { await api.invoices.update(id, updates); await inv('invoices'); },

    addEstimate: async (e: any) => {
      await api.estimates.create({
        customerId: e.customerId,
        category: e.category,
        description: e.description,
        notes: e.notes,
        validUntil: e.validUntil || undefined,
        taxRate: e.taxRate,
        items: e.items,
        poNumber: e.poNumber,
        referralSource: e.referralSource,
        rating: e.opportunityRating ?? e.rating,
        requestedOn: e.requestedOn || undefined,
        arrivalStart: e.arrivalStart || undefined,
        arrivalEnd: e.arrivalEnd || undefined,
        estimatedDuration: e.estimatedDuration,
        assignedWorkerIds: e.assignedWorkerIds ?? [],
        notesForTechs: e.notesForTechs,
      });
      await inv('estimates');
    },
    updateEstimate: async (id: string, updates: any) => {
      if (updates.status) await api.estimates.status(id, updates.status);
      else await api.estimates.update(id, updates);
      await inv('estimates');
    },
    deleteEstimate: async (id: string) => { await api.estimates.remove(id); await inv('estimates'); },
    convertEstimateToJob: async (estimateId: string) => {
      const r = await api.estimates.convert(estimateId);
      await inv('estimates'); await inv('jobs');
      return r.jobId;
    },
    generateInvoiceFromJob: async (jobId: string, items?: { description: string; quantity: number; unitPrice: number }[]) => {
      const invc = await api.jobs.generateInvoice(jobId, items?.length ? { items } : {});
      await inv('invoices'); await inv('jobs');
      return invc.id as string;
    },

    addDocument: async (fileOrDoc: File | any, jobId?: string) => {
      if (fileOrDoc instanceof File) {
        const uploaded = await api.files.upload(fileOrDoc);
        await api.documents.create(uploaded.id, jobId);
        await inv('documents');
        return;
      }
      throw new Error('Upload a real file');
    },
    deleteDocument: async (id: string) => { await api.documents.remove(id); await inv('documents'); },

    addServiceAgreement: async (sa: any) => {
      await api.agreements.create({
        title: sa.title,
        customerId: sa.customerId,
        jobId: sa.jobId,
        startDate: sa.startDate || undefined,
        endDate: sa.endDate || undefined,
        terms: sa.terms,
      });
      await inv('agreements');
    },
    updateServiceAgreement: async (id: string, updates: any) => { await api.agreements.update(id, updates); await inv('agreements'); },

    addEmailTemplate: async (t: any) => { await api.templates.create(t); await inv('templates'); },
    updateEmailTemplate: async (id: string, updates: any) => { await api.templates.update(id, updates); await inv('templates'); },
    deleteEmailTemplate: async (id: string) => { await api.templates.remove(id); await inv('templates'); },

    addCommunication: async (c: any) => {
      await api.communications.create({
        type: c.type,
        direction: c.direction,
        status: c.status,
        fromNumber: c.fromNumber,
        toNumber: c.toNumber,
        customerId: c.customerId,
        jobId: c.jobId,
        estimateId: c.estimateId,
        body: c.body,
        durationSec: c.durationSec,
      });
      await inv('communications');
    },
    markCommunicationRead: async (id: string) => { await api.communications.read(id); await inv('communications'); },
    markAllCommunicationsRead: async (filter?: any) => { await api.communications.readAll(filter); await inv('communications'); },

    addChatMessage: async () => undefined,
    markMessagesRead: async () => undefined,

    can,
    hasPlan,
    addNotification: async () => undefined,
    markNotificationRead: async (id: string) => { await api.notifications.read(id); await inv('notifications'); },
    markAllNotificationsRead: async () => { await api.notifications.readAll(); await inv('notifications'); },

    addCompany: async (c: any) => { await api.platform.createCompany(c); await inv('platform', 'companies'); },
    updateCompany: async (id: string, updates: any) => { await api.platform.updateCompany(id, updates); await inv('platform', 'companies'); },
    deleteCompany: async (id: string) => { await api.platform.deleteCompany(id); await inv('platform', 'companies'); },
    addPlan: async (p: any) => { await api.platform.createPlan(p); await inv('platform', 'plans'); },
    updatePlan: async (id: string, updates: any) => { await api.platform.updatePlan(id, updates); await inv('platform', 'plans'); },
  };
}
