import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const envCandidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(dir, '../../.env'),
];
for (const envPath of envCandidates) {
    // Last file wins so backend/.env overrides stale Passenger/cPanel env
    // (Aiven URLs left in process.env after switching to Namecheap).
    dotenv.config({ path: envPath, override: true });
}
const PLACEHOLDER_SECRETS = [
    'change-me',
    'change-me-too',
    'fieldpro-settings-dev-key',
    'fieldpro-access-dev-change-me-9f3a2c',
    'fieldpro-refresh-dev-change-me-7b1e4d',
];
const schema = z.object({
    NODE_ENV: z.string().optional().default('development'),
    DATABASE_URL: z.string().min(1),
    APP_DATABASE_URL: z.string().optional(),
    PORT: z.coerce.number().default(4100),
    CORS_ORIGIN: z.string().default('http://localhost:8080'),
    JWT_ACCESS_SECRET: z.string().min(8),
    JWT_REFRESH_SECRET: z.string().min(8),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('14d'),
    FILE_DRIVER: z.enum(['local']).default('local'),
    FILE_LOCAL_DIR: z.string().default('./uploads'),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_FROM_NUMBER: z.string().optional(),
    TWILIO_WEBHOOK_BASE: z.string().optional(),
    TWILIO_SKIP_SIGNATURE: z.preprocess((v) => v === true || v === 'true' || v === '1', z.boolean()).default(false),
    SETTINGS_ENCRYPTION_KEY: z.string().min(16).default('fieldpro-settings-dev-key'),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_PUBLISHABLE_KEY: z.string().optional(),
    APP_PUBLIC_URL: z.string().optional(),
});
function isPlaceholderSecret(value) {
    const v = value.trim().toLowerCase();
    return PLACEHOLDER_SECRETS.some((p) => v === p.toLowerCase()) || v.includes('change-me');
}
function urlHasPassword(connectionString) {
    try {
        const url = new URL(connectionString);
        return Boolean(url.password);
    }
    catch {
        return false;
    }
}
const parsed = schema.parse(process.env);
export const isProduction = parsed.NODE_ENV === 'production';
if (isProduction) {
    const problems = [];
    if (parsed.JWT_ACCESS_SECRET.length < 32 || isPlaceholderSecret(parsed.JWT_ACCESS_SECRET)) {
        problems.push('JWT_ACCESS_SECRET must be a unique secret of at least 32 characters');
    }
    if (parsed.JWT_REFRESH_SECRET.length < 32 || isPlaceholderSecret(parsed.JWT_REFRESH_SECRET)) {
        problems.push('JWT_REFRESH_SECRET must be a unique secret of at least 32 characters');
    }
    if (parsed.JWT_ACCESS_SECRET === parsed.JWT_REFRESH_SECRET) {
        problems.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
    }
    if (isPlaceholderSecret(parsed.SETTINGS_ENCRYPTION_KEY) || parsed.SETTINGS_ENCRYPTION_KEY.length < 16) {
        problems.push('SETTINGS_ENCRYPTION_KEY must be set to a non-default value of at least 16 characters');
    }
    if (!urlHasPassword(parsed.DATABASE_URL)) {
        problems.push('DATABASE_URL must include a database password');
    }
    if (parsed.APP_DATABASE_URL && !urlHasPassword(parsed.APP_DATABASE_URL)) {
        problems.push('APP_DATABASE_URL must include a database password');
    }
    if (parsed.TWILIO_SKIP_SIGNATURE) {
        problems.push('TWILIO_SKIP_SIGNATURE must be false in production');
    }
    if (problems.length) {
        throw new Error(`Production configuration is unsafe:\n- ${problems.join('\n- ')}`);
    }
}
export const env = parsed;
/** Comma-separated CORS_ORIGIN → list (Vite may use localhost or 127.0.0.1). */
export const corsOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
//# sourceMappingURL=env.js.map