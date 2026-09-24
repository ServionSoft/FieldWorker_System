export type UserRole = 'super_admin' | 'owner' | 'admin' | 'dispatcher' | 'office' | 'field_worker';

export type JobStatus = 'new' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
export type JobPriority = 'low' | 'medium' | 'high' | 'urgent';
export type EstimateStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'converted';
export type CommunicationType = 'call' | 'sms' | 'voicemail' | 'mms' | 'email';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  companyId?: string;
  permissions?: string[];
  planFeatures?: string[];
  jobTitle?: string;
  avatarUrl?: string | null;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  billing: 'monthly' | 'yearly' | string;
  features: string[];
  maxWorkers: number;
  maxJobs: number;
}

export interface Company {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  planId: string;
  status: 'active' | 'trial' | 'suspended' | 'past_due' | string;
  createdAt: string;
  adminId?: string;
  employeeCount?: number;
  trialEndsAt?: string | null;
}

export interface DayWindow {
  start: string;
  end: string;
}

export interface Worker {
  id: string;
  name: string;
  email: string;
  phone: string;
  companyId: string;
  specialties: string[];
  status: 'active' | 'on_leave' | 'inactive' | string;
  rating?: number;
  jobsCompleted?: number;
  availability?: Record<string, DayWindow | null>;
  unavailableDates?: string[];
}

export interface JobLineItem {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  taxable?: boolean;
  group?: string;
  warehouse?: string;
}

export interface Job {
  id: string;
  title: string;
  description: string;
  status: JobStatus;
  priority: JobPriority;
  companyId: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  assignedWorkerId?: string;
  assignedWorkerIds?: string[];
  scheduledDate?: string;
  scheduledTime?: string;
  endDate?: string;
  multiDay?: boolean;
  estimatedDuration?: number;
  materials: string[];
  notes: string[];
  images: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  category: string;
  lineItems?: JobLineItem[];
  notesForTechs?: string;
  taxRate?: number;
  invoiceId?: string;
  estimateId?: string;
  billingType?: string;
  starred?: boolean;
  pinned?: boolean;
  archivedAt?: string | null;
  archivedByName?: string;
  tags?: string[];
  arrivalEndTime?: string;
  primaryContact?: { email?: string; phone?: string };
  serviceLocation?: { gatedProperty?: boolean };
  customerEmail?: string;
}

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  companyId: string;
  notes?: string;
  tags?: string[];
  status: 'active' | 'inactive' | 'lead' | string;
  createdAt: string;
  totalJobs?: number;
  totalSpent?: number;
}

export interface EstimateLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Estimate {
  id: string;
  estimateNumber: string;
  companyId: string;
  customerId: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  status: EstimateStatus;
  items: EstimateLineItem[];
  subtotal: number;
  tax: number;
  total: number;
  notes?: string;
  validUntil?: string;
  createdAt: string;
  updatedAt: string;
  convertedJobId?: string;
  category?: string;
  taxRate?: number;
  requestedOn?: string;
  assignedWorkerId?: string;
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  jobId?: string;
  companyId: string;
  customerName: string;
  customerId?: string;
  amount: number;
  tax: number;
  total: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'void' | string;
  createdAt: string;
  dueDate: string;
  items: InvoiceItem[];
}

export interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  quantity: number;
  minStock: number;
  unitPrice: number;
  companyId: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  message: string;
  timestamp: string;
  read: boolean;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error' | string;
  read: boolean;
  timestamp: string;
  eventKey?: string | null;
  linkPath?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}

export interface Document {
  id: string;
  name: string;
  type: string;
  size: string;
  companyId: string;
  jobId?: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface ServiceAgreement {
  id: string;
  title: string;
  customerName: string;
  customerId?: string;
  companyId: string;
  jobId?: string;
  status: 'draft' | 'active' | 'expired' | string;
  startDate: string;
  endDate: string;
  terms: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  companyId: string;
  type: 'invoice' | 'appointment' | 'follow_up' | 'welcome' | 'estimate' | 'customer_communication' | string;
}

export interface Communication {
  id: string;
  companyId: string;
  type: CommunicationType;
  direction: 'inbound' | 'outbound';
  status: string;
  fromNumber: string;
  toNumber: string;
  customerId?: string;
  jobId?: string;
  estimateId?: string;
  userId?: string;
  userName?: string;
  durationSec?: number;
  body?: string;
  read: boolean;
  timestamp: string;
}
