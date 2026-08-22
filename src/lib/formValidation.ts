/** Shared client-side field checks. Server Zod remains authoritative. */

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function requiredText(value: string | undefined, label: string) {
  if (!String(value ?? '').trim()) return `${label} is required`;
  return '';
}

export function emailError(value: string | undefined, opts?: { required?: boolean }) {
  const v = String(value ?? '').trim();
  if (!v) return opts?.required ? 'Email is required' : '';
  if (!EMAIL_RE.test(v)) return 'Enter a valid email address';
  return '';
}

export function phoneError(value: string | undefined, opts?: { required?: boolean }) {
  const v = String(value ?? '').trim();
  if (!v) return opts?.required ? 'Phone is required' : '';
  const digits = v.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return 'Enter a valid phone number';
  if (/^[a-zA-Z]+$/.test(v.replace(/\s/g, ''))) return 'Enter a valid phone number';
  return '';
}

export function urlError(value: string | undefined) {
  const v = String(value ?? '').trim();
  if (!v) return '';
  try {
    const u = new URL(v);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'Enter a valid URL starting with http:// or https://';
    return '';
  } catch {
    return 'Enter a valid URL starting with http:// or https://';
  }
}

export function passwordMinError(value: string | undefined) {
  if (!value || value.length < 8) return 'Password must be at least 8 characters';
  return '';
}

export function passwordMatchError(a: string, b: string) {
  if (a !== b) return 'Passwords do not match';
  return '';
}

export function moneyError(value: string | number | undefined, opts?: { allowZero?: boolean }) {
  const v = String(value ?? '').trim();
  if (!v) return 'Amount is required';
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return 'Enter a valid amount (up to 2 decimal places)';
  const n = Number(v);
  if (!opts?.allowZero && n <= 0) return 'Amount must be greater than 0';
  if (n < 0) return 'Amount cannot be negative';
  return '';
}

export function nonNegIntError(value: string | number | undefined, label = 'Value') {
  const v = String(value ?? '').trim();
  if (!/^\d+$/.test(v)) return `${label} must be a whole number 0 or greater`;
  return '';
}

export function positiveNumberError(value: string | number | undefined, label = 'Value') {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return `${label} must be greater than 0`;
  return '';
}

export function taxRateError(value: string | number | undefined) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) return 'Tax rate must be between 0 and 100';
  return '';
}

export function timeError(value: string | undefined) {
  const v = String(value ?? '').trim();
  if (!v) return '';
  if (!TIME_RE.test(v)) return 'Enter a valid time (HH:MM)';
  return '';
}

export function timeOrderError(start?: string, end?: string) {
  if (!start || !end) return '';
  if (end <= start) return 'End time must be after start time';
  return '';
}

export function dateOrderError(start?: string, end?: string, endLabel = 'End date') {
  if (!start || !end) return '';
  if (end < start) return `${endLabel} cannot be before the start date`;
  return '';
}

export function fileSizeError(file: File, max = MAX_UPLOAD_BYTES) {
  if (file.size > max) return `File must be ${Math.round(max / (1024 * 1024))} MB or smaller`;
  return '';
}

export function firstErrorKey(errors: Record<string, string>) {
  return Object.keys(errors).find((k) => errors[k]);
}

export function focusField(name: string) {
  const el = document.querySelector<HTMLElement>(`[name="${name}"], #${CSS.escape(name)}`);
  el?.focus();
}

export function applyErrors(errors: Record<string, string>) {
  const key = firstErrorKey(errors);
  if (key) focusField(key);
  return errors;
}
