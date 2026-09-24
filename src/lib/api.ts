const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4100/api';

const TOKEN_KEY = 'fp_access';
const REFRESH_KEY = 'fp_refresh';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function getAccessToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setTokens(access?: string | null, refresh?: string | null) {
  if (access) localStorage.setItem(TOKEN_KEY, access);
  else localStorage.removeItem(TOKEN_KEY);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  else localStorage.removeItem(REFRESH_KEY);
}

async function refreshTokens() {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return false;
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    setTokens(null, null);
    return false;
  }
  const data = await res.json();
  setTokens(data.accessToken, data.refreshToken);
  return data;
}

async function request<T>(path: string, opts: RequestInit = {}, retry = true): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(opts.headers);
  if (!(opts.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (res.status === 401 && retry && !localStorage.getItem('fp_impersonating')) {
    const refreshed = await refreshTokens();
    if (refreshed) return request<T>(path, opts, false);
  }
  if (!res.ok) {
    let code = 'ERROR';
    let message = res.statusText;
    try {
      const body = await res.json();
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch { /* ignore */ }
    throw new ApiError(res.status, code, message);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json() as Promise<T>;
  return res as unknown as T;
}

export type PageResult<T = any> = { items: T[]; page: number; pageSize: number; total: number };

function qs(q?: Record<string, string | number | boolean | undefined | null>) {
  const params = new URLSearchParams();
  Object.entries(q ?? {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '' || v === false) return;
    params.set(k, String(v));
  });
  return params.toString();
}

export const api = {
  search: (q: string) =>
    request<{
      customers: any[]; jobs: any[]; estimates: any[]; invoices: any[];
      workers: any[]; documents: any[]; communications: any[];
    }>(`/search?q=${encodeURIComponent(q)}`),
  records: {
    people: () => request<{ items: { id: string; name: string; role: string }[] }>('/records/people').then((r) => r.items),
    favorites: (entityType?: string) =>
      request<{ items: { entityType: string; entityId: string; starred: boolean; pinned: boolean }[] }>(
        `/records/favorites${entityType ? `?entityType=${entityType}` : ''}`,
      ).then((r) => r.items),
    setFavorite: (body: { entityType: string; entityId: string; starred?: boolean; pinned?: boolean }) =>
      request<{ entityType: string; entityId: string; starred: boolean; pinned: boolean }>(
        '/records/favorites', { method: 'PUT', body: JSON.stringify(body) },
      ),
    views: (page: string) =>
      request<{ items: { id: string; page: string; name: string; filters: Record<string, unknown>; createdAt: string }[] }>(
        `/records/views?page=${encodeURIComponent(page)}`,
      ).then((r) => r.items),
    saveView: (body: { page: string; name: string; filters: Record<string, unknown> }) =>
      request<{ id: string; page: string; name: string; filters: Record<string, unknown> }>(
        '/records/views', { method: 'POST', body: JSON.stringify(body) },
      ),
    removeView: (id: string) => request(`/records/views/${id}`, { method: 'DELETE' }),
  },
  auth: {
    login: (email: string, password: string) =>
      request<any>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    register: (companyName: string, email: string, password: string, planId?: string, name?: string) =>
      request<{ ok: boolean; requiresVerification?: boolean; email?: string; emailSent?: boolean; emailError?: string; accessToken?: string; refreshToken?: string }>(
        '/auth/register',
        { method: 'POST', body: JSON.stringify({ companyName, email, password, planId, name }) },
      ),
    verifyEmail: (token: string) =>
      request<any>('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) }),
    resendVerification: (email: string) =>
      request<{ ok: boolean; delivered?: boolean; error?: string }>('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email }) }),
    logout: (refreshToken?: string) =>
      request('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }),
    me: () => request<any>('/auth/me'),
    forgot: (email: string) =>
      request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
    reset: (token: string, password: string) =>
      request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),
    refresh: refreshTokens,
    preferences: (body: unknown) =>
      request('/auth/me/preferences', { method: 'PATCH', body: JSON.stringify(body) }),
  },
  profile: {
    get: () => request<any>('/profile'),
    update: (body: unknown) => request<any>('/profile', { method: 'PATCH', body: JSON.stringify(body) }),
    changePassword: (body: { currentPassword: string; newPassword: string }) =>
      request<{ ok: boolean; accessToken: string; refreshToken: string }>(
        '/profile/change-password', { method: 'POST', body: JSON.stringify(body) },
      ),
    uploadAvatar: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return request<any>('/profile/avatar', { method: 'POST', body: fd });
    },
    removeAvatar: () => request<any>('/profile/avatar', { method: 'DELETE' }),
    avatarBlob: async () => {
      const token = getAccessToken();
      const res = await fetch(`${BASE}/profile/avatar`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return null;
      return res.blob();
    },
  },
  invites: {
    get: (token: string) => request<any>(`/invites/${token}`),
    accept: (token: string, body: unknown) =>
      request(`/invites/${token}/accept`, { method: 'POST', body: JSON.stringify(body) }),
  },
  members: {
    list: () => request<{ items: any[]; permissionCatalog: { key: string; label: string }[] }>('/members'),
    invitations: () => request<{ items: any[] }>('/members/invitations').then((r) => r.items),
    invite: (body: unknown) => request<any>('/members/invite', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: unknown) => request<any>(`/members/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: string) => request(`/members/${id}`, { method: 'DELETE' }),
  },
  billing: {
    get: () => request<any>('/billing'),
    checkout: (planId: string, interval: 'monthly' | 'yearly' = 'monthly') =>
      request<{ url?: string | null; applied?: boolean }>('/billing/checkout', { method: 'POST', body: JSON.stringify({ planId, interval }) }),
    portal: () => request<{ url: string }>('/billing/portal', { method: 'POST' }),
  },
  publicPlans: () => request<{ items: any[]; stripeConfigured: boolean }>('/plans'),
  contact: (body: { firstName: string; lastName: string; email: string; company?: string; message: string }) =>
    request<{ ok: boolean }>('/contact', { method: 'POST', body: JSON.stringify(body) }),
  customers: {
    list: (q?: Record<string, string>) => {
      const params = new URLSearchParams({ pageSize: '100', archived: 'active', ...q });
      return request<{ items: any[] }>(`/customers?${params}`).then((r) => r.items);
    },
    page: (q?: Record<string, string | number | boolean | undefined>) =>
      request<PageResult>(`/customers?${qs({ pageSize: 25, archived: 'active', ...q })}`),
    get: (id: string) => request<any>(`/customers/${id}`),
    create: (body: unknown) => request<any>('/customers', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: unknown) => request<any>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: string) => request(`/customers/${id}`, { method: 'DELETE' }),
    archive: (id: string) => request<any>(`/customers/${id}/archive`, { method: 'POST' }),
    restore: (id: string) => request<any>(`/customers/${id}/restore`, { method: 'POST' }),
    bulk: (body: { ids: string[]; action: 'archive' | 'restore' | 'status'; status?: string }) =>
      request<{ ok: boolean; updated: number }>('/customers/bulk', { method: 'POST', body: JSON.stringify(body) }),
    exportAll: () => request<{ items: any[] }>('/customers/export').then((r) => r.items),
    importRows: (rows: unknown[]) => request<{ created: number; errors: string[] }>('/customers/import', { method: 'POST', body: JSON.stringify({ rows }) }),
    merge: (keepId: string, mergeId: string) =>
      request<any>('/customers/merge', { method: 'POST', body: JSON.stringify({ keepId, mergeId }) }),
    contacts: (id: string) => request<{ items: any[] }>(`/customers/${id}/contacts`).then((r) => r.items),
    addContact: (id: string, body: unknown) =>
      request<any>(`/customers/${id}/contacts`, { method: 'POST', body: JSON.stringify(body) }),
    updateContact: (id: string, contactId: string, body: unknown) =>
      request<any>(`/customers/${id}/contacts/${contactId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    removeContact: (id: string, contactId: string) => request(`/customers/${id}/contacts/${contactId}`, { method: 'DELETE' }),
    addresses: (id: string) => request<{ items: any[] }>(`/customers/${id}/addresses`).then((r) => r.items),
    addAddress: (id: string, body: unknown) =>
      request<any>(`/customers/${id}/addresses`, { method: 'POST', body: JSON.stringify(body) }),
    updateAddress: (id: string, addressId: string, body: unknown) =>
      request<any>(`/customers/${id}/addresses/${addressId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    removeAddress: (id: string, addressId: string) => request(`/customers/${id}/addresses/${addressId}`, { method: 'DELETE' }),
    notes: (id: string) => request<{ items: any[] }>(`/customers/${id}/notes`).then((r) => r.items),
    addNote: (id: string, body: string) =>
      request<any>(`/customers/${id}/notes`, { method: 'POST', body: JSON.stringify({ body }) }),
    removeNote: (id: string, noteId: string) => request(`/customers/${id}/notes/${noteId}`, { method: 'DELETE' }),
    activity: (id: string) => request<{ items: any[] }>(`/customers/${id}/activity`).then((r) => r.items),
    duplicates: (q: { email?: string; phone?: string; excludeId?: string }) => {
      const params = new URLSearchParams();
      if (q.email) params.set('email', q.email);
      if (q.phone) params.set('phone', q.phone);
      if (q.excludeId) params.set('excludeId', q.excludeId);
      return request<{ items: any[] }>(`/customers/duplicates?${params}`).then((r) => r.items);
    },
  },
  followUps: {
    list: (q?: Record<string, string>) => {
      const params = new URLSearchParams(q);
      return request<{ items: any[] }>(`/follow-ups?${params}`).then((r) => r.items);
    },
    create: (body: unknown) => request<any>('/follow-ups', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: unknown) => request<any>(`/follow-ups/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: string) => request(`/follow-ups/${id}`, { method: 'DELETE' }),
  },
  workers: {
    list: () => request<{ items: any[] }>('/workers?pageSize=100').then((r) => r.items),
    get: (id: string) => request<any>(`/workers/${id}`),
    create: (body: unknown) => request<any>('/workers', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: unknown) => request<any>(`/workers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: string) => request(`/workers/${id}`, { method: 'DELETE' }),
    setAvailability: (id: string, body: unknown) =>
      request(`/workers/${id}/availability`, { method: 'PUT', body: JSON.stringify(body) }),
    addTimeOff: (id: string, date: string) =>
      request(`/workers/${id}/time-off`, { method: 'POST', body: JSON.stringify({ date }) }),
    removeTimeOff: (id: string, date: string) =>
      request(`/workers/${id}/time-off/${date}`, { method: 'DELETE' }),
  },
  jobs: {
    list: () => request<{ items: any[] }>('/jobs?pageSize=100&archived=active').then((r) => r.items),
    page: (q?: Record<string, string | number | boolean | undefined>) =>
      request<PageResult & { counts?: Record<string, number> }>(`/jobs?${qs({ pageSize: 25, archived: 'active', ...q })}`),
    get: (id: string) => request<any>(`/jobs/${id}`),
    create: (body: unknown) => request<any>('/jobs', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: unknown) => request<any>(`/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: string) => request(`/jobs/${id}`, { method: 'DELETE' }),
    archive: (id: string) => request<any>(`/jobs/${id}/archive`, { method: 'POST' }),
    restore: (id: string) => request<any>(`/jobs/${id}/restore`, { method: 'POST' }),
    bulk: (body: { ids: string[]; action: 'archive' | 'restore' | 'status'; status?: string }) =>
      request<{ ok: boolean; updated: number }>('/jobs/bulk', { method: 'POST', body: JSON.stringify(body) }),
    status: (id: string, status: string) =>
      request(`/jobs/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
    assign: (id: string, workerId: string) =>
      request(`/jobs/${id}/assignees`, { method: 'POST', body: JSON.stringify({ workerId }) }),
    addNote: (id: string, body: string) =>
      request(`/jobs/${id}/notes`, { method: 'POST', body: JSON.stringify({ body }) }),
    setLineItems: (id: string, items: unknown[]) =>
      request(`/jobs/${id}/line-items`, { method: 'PUT', body: JSON.stringify({ items }) }),
    generateInvoice: (id: string, body?: unknown) =>
      request<any>(`/jobs/${id}/invoice`, { method: 'POST', body: JSON.stringify(body ?? {}) }),
    addImage: (id: string, fileId: string) =>
      request(`/jobs/${id}/images`, { method: 'POST', body: JSON.stringify({ fileId }) }),
  },
  estimates: {
    list: () => request<{ items: any[] }>('/estimates?pageSize=100').then((r) => r.items),
    page: (q?: Record<string, string | number | boolean | undefined>) =>
      request<PageResult>(`/estimates?${qs({ pageSize: 25, ...q })}`),
    get: (id: string) => request<any>(`/estimates/${id}`),
    create: (body: unknown) => request<any>('/estimates', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: unknown) => request<any>(`/estimates/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: string) => request(`/estimates/${id}`, { method: 'DELETE' }),
    status: (id: string, status: string) =>
      request(`/estimates/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
    convert: (id: string) => request<{ jobId: string }>(`/estimates/${id}/convert`, { method: 'POST' }),
    pdf: async (id: string, download = false) => {
      const token = getAccessToken();
      const res = await fetch(`${BASE}/estimates/${id}/pdf${download ? '?download=1' : ''}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new ApiError(res.status, 'PDF_FAILED', 'Could not load estimate PDF');
      const blob = await res.blob();
      const cd = res.headers.get('content-disposition') || '';
      const match = /filename\*?=(?:UTF-8''|"?)([^";]+)/i.exec(cd);
      const filename = match ? decodeURIComponent(match[1].replace(/"/g, '')) : 'estimate.pdf';
      return { blob, filename };
    },
  },
  invoices: {
    list: () => request<{ items: any[] }>('/invoices?pageSize=100').then((r) => r.items),
    page: (q?: Record<string, string | number | boolean | undefined>) =>
      request<PageResult>(`/invoices?${qs({ pageSize: 25, ...q })}`),
    get: (id: string) => request<any>(`/invoices/${id}`),
    update: (id: string, body: unknown) => request<any>(`/invoices/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    pdf: async (id: string, download = false) => {
      const token = getAccessToken();
      const res = await fetch(`${BASE}/invoices/${id}/pdf${download ? '?download=1' : ''}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new ApiError(res.status, 'PDF_FAILED', 'Could not load invoice PDF');
      const blob = await res.blob();
      const cd = res.headers.get('content-disposition') || '';
      const match = /filename\*?=(?:UTF-8''|"?)([^";]+)/i.exec(cd);
      const filename = match ? decodeURIComponent(match[1].replace(/"/g, '')) : 'invoice.pdf';
      return { blob, filename };
    },
  },
  inventory: {
    list: () => request<{ items: any[] }>('/inventory?pageSize=100').then((r) => r.items),
    create: (body: unknown) => request<any>('/inventory', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: unknown) => request<any>(`/inventory/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: string) => request(`/inventory/${id}`, { method: 'DELETE' }),
  },
  documents: {
    list: (q?: { jobId?: string }) => {
      const params = new URLSearchParams({ pageSize: '100' });
      if (q?.jobId) params.set('jobId', q.jobId);
      return request<{ items: any[] }>(`/documents?${params}`).then((r) => r.items);
    },
    create: (fileId: string, jobId?: string) =>
      request('/documents', { method: 'POST', body: JSON.stringify({ fileId, jobId }) }),
    remove: (id: string) => request(`/documents/${id}`, { method: 'DELETE' }),
    signedUrl: (id: string) => request<{ url: string; token: string }>(`/documents/${id}/signed-url`, { method: 'POST' }),
    downloadUrl: (id: string, token?: string) =>
      token ? `${BASE}/documents/${id}/download?token=${token}` : `${BASE}/documents/${id}/download`,
    download: async (id: string) => {
      const token = getAccessToken();
      const res = await fetch(`${BASE}/documents/${id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new ApiError(res.status, 'DOWNLOAD_FAILED', 'Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'document';
      a.click();
      URL.revokeObjectURL(url);
    },
  },
  files: {
    upload: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return request<any>('/files', { method: 'POST', body: fd });
    },
    signedUrl: (id: string) => request<{ url: string; token: string }>(`/files/${id}/signed-url`, { method: 'POST' }),
    downloadUrl: (id: string, token: string) => `${BASE}/files/${id}/download?token=${token}`,
    blob: async (id: string) => {
      const token = getAccessToken();
      const res = await fetch(`${BASE}/files/${id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return null;
      return res.blob();
    },
  },
  agreements: {
    list: () => request<{ items: any[] }>('/agreements?pageSize=100').then((r) => r.items),
    create: (body: unknown) => request<any>('/agreements', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: unknown) => request<any>(`/agreements/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  },
  templates: {
    list: () => request<{ items: any[] }>('/templates?pageSize=100').then((r) => r.items),
    create: (body: unknown) => request<any>('/templates', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: unknown) => request<any>(`/templates/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: string) => request(`/templates/${id}`, { method: 'DELETE' }),
  },
  communications: {
    list: (q?: Record<string, string>) => {
      const params = new URLSearchParams(q);
      if (!params.has('pageSize')) params.set('pageSize', '100');
      return request<{ items: any[] }>(`/communications?${params}`).then((r) => r.items);
    },
    create: (body: unknown) => request<any>('/communications', { method: 'POST', body: JSON.stringify(body) }),
    twilio: () => request<{ configured: boolean; fromNumber: string | null; companyPhone: string | null }>('/communications/twilio'),
    sendSms: (body: unknown) =>
      request<any>('/communications/sms', { method: 'POST', body: JSON.stringify(body) }),
    call: (body: unknown) =>
      request<any>('/communications/call', { method: 'POST', body: JSON.stringify(body) }),
    sendTemplate: (body: unknown) =>
      request<any>('/communications/send-template', { method: 'POST', body: JSON.stringify(body) }),
    sendEmail: (body: unknown) =>
      request<any>('/communications/email', { method: 'POST', body: JSON.stringify(body) }),
    read: (id: string) => request(`/communications/${id}/read`, { method: 'POST' }),
    readAll: (filter?: unknown) =>
      request('/communications/read-all', { method: 'POST', body: JSON.stringify(filter ?? {}) }),
  },
  chat: {
    threads: () => request<{ items: any[] }>('/chat/threads').then((r) => r.items),
    ensureThread: (userId: string) =>
      request<{ id: string }>('/chat/threads', { method: 'POST', body: JSON.stringify({ userId }) }),
    ensureAdminThread: () =>
      request<{ id: string }>('/chat/threads', { method: 'POST', body: JSON.stringify({ withAdmin: true }) }),
    messages: (id: string) => request<{ items: any[] }>(`/chat/threads/${id}/messages`).then((r) => r.items),
    send: (id: string, message: string) =>
      request(`/chat/threads/${id}/messages`, { method: 'POST', body: JSON.stringify({ message }) }),
    read: (id: string) => request(`/chat/threads/${id}/read`, { method: 'POST' }),
  },
  notifications: {
    list: () => request<{ items: any[] }>('/notifications?pageSize=100').then((r) => r.items),
    read: (id: string) => request(`/notifications/${id}/read`, { method: 'POST' }),
    readAll: () => request('/notifications/read-all', { method: 'POST' }),
  },
  ops: {
    dashboard: () => request<any>('/dashboard'),
    reports: () => request<any>('/reports'),
    calendar: (from: string, to: string) => request<any>(`/calendar?from=${from}&to=${to}`),
    dispatch: (from: string, to: string) => request<any>(`/dispatch?from=${from}&to=${to}`),
  },
  company: {
    get: () => request<any>('/company'),
    update: (body: unknown) => request('/company', { method: 'PATCH', body: JSON.stringify(body) }),
    completeOnboarding: () => request('/company/onboarding/complete', { method: 'POST' }),
    updateSmtp: (body: unknown) => request('/company/smtp', { method: 'PATCH', body: JSON.stringify(body) }),
    testSmtp: (to?: string) => request('/company/smtp/test', { method: 'POST', body: JSON.stringify({ to }) }),
    updateTwilio: (body: unknown) => request('/company/twilio', { method: 'PATCH', body: JSON.stringify(body) }),
    testTwilio: () => request('/company/twilio/test', { method: 'POST', body: JSON.stringify({}) }),
  },
  platform: {
    companies: () => request<{ items: any[] }>('/platform/companies?pageSize=100').then((r) => r.items),
    getCompany: (id: string) => request<any>(`/platform/companies/${id}`),
    createCompany: (body: unknown) => request('/platform/companies', { method: 'POST', body: JSON.stringify(body) }),
    updateCompany: (id: string, body: unknown) =>
      request(`/platform/companies/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    deleteCompany: (id: string) => request(`/platform/companies/${id}`, { method: 'DELETE' }),
    inviteOwner: (id: string, body: unknown) =>
      request(`/platform/companies/${id}/invite-owner`, { method: 'POST', body: JSON.stringify(body) }),
    impersonate: (id: string) => request<any>(`/platform/companies/${id}/impersonate`, { method: 'POST' }),
    plans: () => request<{ items: any[] }>('/platform/plans').then((r) => r.items),
    createPlan: (body: unknown) => request('/platform/plans', { method: 'POST', body: JSON.stringify(body) }),
    updatePlan: (id: string, body: unknown) =>
      request(`/platform/plans/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    dashboard: () => request<any>('/platform/dashboard'),
    reports: () => request<any>('/platform/reports'),
    settings: () => request<any>('/platform/settings'),
    updateSettings: (body: unknown) => request('/platform/settings', { method: 'PATCH', body: JSON.stringify(body) }),
    testSmtp: (to?: string) => request('/platform/settings/smtp/test', { method: 'POST', body: JSON.stringify({ to }) }),
    emailTemplates: () => request<{ items: any[] }>('/platform/email-templates').then((r) => r.items),
    updateEmailTemplate: (type: string, body: unknown) =>
      request(`/platform/email-templates/${type}`, { method: 'PATCH', body: JSON.stringify(body) }),
    audit: () => request<{ items: any[] }>('/platform/audit?pageSize=50').then((r) => r.items),
    billingInvoices: () => request<{ items: any[] }>('/platform/billing-invoices?pageSize=50').then((r) => r.items),
  },
};
