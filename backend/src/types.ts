import type { Request } from 'express';
import type { Permission } from './modules/rbac/permissions.js';
import type { PlanFeatureKey } from './modules/billing/plan-features.js';

export type AppRole = 'super_admin' | 'owner' | 'admin' | 'dispatcher' | 'office' | 'field_worker';

export interface AuthPayload {
  userId: string;
  companyId: string | null;
  role: AppRole;
  memberId: string | null;
  impersonatedBy?: string;
  permissions?: Permission[];
  planFeatures?: PlanFeatureKey[];
}

export interface AuthedRequest extends Request {
  auth: AuthPayload;
}
