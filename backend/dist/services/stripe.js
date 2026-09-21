import Stripe from 'stripe';
import { env } from '../config/env.js';
let client;
export function stripeConfigured() {
    return Boolean(env.STRIPE_SECRET_KEY);
}
export function stripeClient() {
    if (!env.STRIPE_SECRET_KEY)
        return null;
    if (client === undefined) {
        client = new Stripe(env.STRIPE_SECRET_KEY);
    }
    return client;
}
export function publicAppUrl() {
    return (env.APP_PUBLIC_URL || env.CORS_ORIGIN).replace(/\/$/, '');
}
//# sourceMappingURL=stripe.js.map