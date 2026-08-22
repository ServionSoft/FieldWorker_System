import http from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import { env, corsOrigins } from './config/env.js';
import { errorHandler } from './middleware/error.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { customersRouter } from './modules/customers/customers.routes.js';
import { followUpsRouter } from './modules/customers/followups.routes.js';
import { workersRouter } from './modules/workers/workers.routes.js';
import { jobsRouter } from './modules/jobs/jobs.routes.js';
import { estimatesRouter } from './modules/estimates/estimates.routes.js';
import { invoicesRouter } from './modules/invoices/invoices.routes.js';
import { inventoryRouter } from './modules/inventory/inventory.routes.js';
import { opsRouter, searchRouter } from './modules/ops/ops.routes.js';
import { filesRouter, documentsRouter } from './modules/files/files.routes.js';
import { agreementsRouter } from './modules/agreements/agreements.routes.js';
import { templatesRouter } from './modules/templates/templates.routes.js';
import { commsRouter } from './modules/comms/comms.routes.js';
import { chatRouter } from './modules/chat/chat.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { platformRouter } from './modules/platform/platform.routes.js';
import { companyRouter } from './modules/company/company.routes.js';
import { recordsRouter } from './modules/records/records.routes.js';
import { attachChat } from './realtime/chat.js';
import { setIo } from './realtime/bus.js';
import { twilioWebhooks } from './modules/comms/twilio.webhooks.js';
import { membersRouter, invitePublicRouter } from './modules/members/members.routes.js';
import { billingRouter, publicPlansRouter } from './modules/billing/billing.routes.js';
import { stripeWebhookHandler } from './modules/billing/stripe.webhooks.js';
import { profileRouter } from './modules/profile/profile.routes.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: corsOrigins, credentials: true },
});
app.set('io', io);
setIo(io);
attachChat(io);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(cookieParser());
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  void stripeWebhookHandler(req, res);
});
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: true,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many authentication attempts. Try again later.' } },
}), authRouter);
app.use('/api/plans', publicPlansRouter);
app.use('/api/invites', invitePublicRouter);
app.use('/api/members', membersRouter);
app.use('/api/billing', billingRouter);
app.use('/api/customers', customersRouter);
app.use('/api/follow-ups', followUpsRouter);
app.use('/api/records', recordsRouter);
app.use('/api/workers', workersRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/estimates', estimatesRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/files', filesRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/agreements', agreementsRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/webhooks/twilio', twilioWebhooks);
app.use('/api/communications', commsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/platform', platformRouter);
app.use('/api/company', companyRouter);
app.use('/api/profile', profileRouter);
app.use('/api', searchRouter);
app.use('/api', opsRouter);

app.use(errorHandler);

server.listen(env.PORT, () => {
  console.log(`FieldPro API listening on http://localhost:${env.PORT}`);
});
