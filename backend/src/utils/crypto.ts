import crypto from 'node:crypto';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { AuthPayload } from '../types.js';

export const hashPassword = (password: string) => argon2.hash(password);
export const verifyPassword = (hash: string, password: string) => argon2.verify(hash, password);

export const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
export const randomToken = () => crypto.randomBytes(32).toString('hex');

export function signAccess(payload: AuthPayload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL } as jwt.SignOptions);
}

export function signRefresh(userId: string) {
  return jwt.sign({ userId, typ: 'refresh' }, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_TTL } as jwt.SignOptions);
}

export function verifyAccess(token: string): AuthPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthPayload;
}

export function verifyRefresh(token: string): { userId: string } {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as { userId: string };
}

export function signDownload(payload: { companyId: string; userId: string; documentId?: string; fileId?: string }) {
  return jwt.sign({ ...payload, typ: 'download' }, env.JWT_ACCESS_SECRET, { expiresIn: '5m' } as jwt.SignOptions);
}

export function verifyDownload(token: string) {
  const p = jwt.verify(token, env.JWT_ACCESS_SECRET) as {
    typ?: string; companyId: string; userId: string; documentId?: string; fileId?: string;
  };
  if (p.typ !== 'download') throw new Error('Invalid download token');
  return p;
}

function encKey() {
  return crypto.createHash('sha256').update(env.SETTINGS_ENCRYPTION_KEY).digest();
}

export function encryptSecret(plain: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function decryptSecret(value: string) {
  const [ivB, tagB, dataB] = value.split('.');
  if (!ivB || !tagB || !dataB) throw new Error('Invalid secret payload');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey(), Buffer.from(ivB, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB, 'base64')), decipher.final()]).toString('utf8');
}
