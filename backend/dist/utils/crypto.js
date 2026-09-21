import crypto from 'node:crypto';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
export const hashPassword = (password) => argon2.hash(password);
export const verifyPassword = (hash, password) => argon2.verify(hash, password);
export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const randomToken = () => crypto.randomBytes(32).toString('hex');
export function signAccess(payload) {
    return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL });
}
export function signRefresh(userId) {
    return jwt.sign({ userId, typ: 'refresh' }, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_TTL });
}
export function verifyAccess(token) {
    return jwt.verify(token, env.JWT_ACCESS_SECRET);
}
export function verifyRefresh(token) {
    return jwt.verify(token, env.JWT_REFRESH_SECRET);
}
export function signDownload(payload) {
    return jwt.sign({ ...payload, typ: 'download' }, env.JWT_ACCESS_SECRET, { expiresIn: '5m' });
}
export function verifyDownload(token) {
    const p = jwt.verify(token, env.JWT_ACCESS_SECRET);
    if (p.typ !== 'download')
        throw new Error('Invalid download token');
    return p;
}
function encKey() {
    return crypto.createHash('sha256').update(env.SETTINGS_ENCRYPTION_KEY).digest();
}
export function encryptSecret(plain) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}
export function decryptSecret(value) {
    const [ivB, tagB, dataB] = value.split('.');
    if (!ivB || !tagB || !dataB)
        throw new Error('Invalid secret payload');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encKey(), Buffer.from(ivB, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB, 'base64')), decipher.final()]).toString('utf8');
}
//# sourceMappingURL=crypto.js.map