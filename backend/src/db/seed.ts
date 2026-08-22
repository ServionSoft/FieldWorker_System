import pg from 'pg';
import { env } from '../config/env.js';
import { pgPoolConfig } from './pool.js';
import { hashPassword } from '../utils/crypto.js';

const pool = new pg.Pool(pgPoolConfig(env.DATABASE_URL));

const DEMO = 'demo123';

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      TRUNCATE
        chat_message_reads, chat_messages, chat_thread_participants, chat_threads,
        communications, notifications, documents, job_images, files,
        email_templates, service_agreements, inventory_movements, inventory_items,
        invoice_line_items, invoices, estimate_follow_up_tasks, estimate_assignees, estimate_line_items, estimates,
        job_line_items, job_materials, job_notes, job_tasks, job_assignees, jobs,
        worker_time_off, worker_availability, worker_specialties, worker_profiles,
        customer_tags, tags, addresses, customer_contacts, customers,
        document_counters, audit_logs, password_reset_tokens, email_verification_tokens, refresh_tokens,
        company_member_permissions, invitations, company_settings, billing_invoices, billing_events,
        company_members, companies, users, subscription_plans
      RESTART IDENTITY CASCADE
    `);

    const hash = await hashPassword(DEMO);

    const plans = await client.query(
      `INSERT INTO subscription_plans (name, price_cents, billing_interval, max_workers, max_jobs, features, feature_keys) VALUES
       ('Basic', 4900, 'monthly', 5, 50, ARRAY['Up to 5 workers','50 jobs/month','Basic reports','Email support'], ARRAY['reports']),
       ('Pro', 9900, 'monthly', 20, -1, ARRAY['Up to 20 workers','Unlimited jobs','Advanced reports','Priority support','Calendar view','Inventory management'], ARRAY['reports','calendar','dispatch','inventory']),
       ('Enterprise', 24900, 'monthly', -1, -1, ARRAY['Unlimited workers','Unlimited jobs','Custom reports','Dedicated support','API access','White labeling','Multi-location'], ARRAY['reports','calendar','dispatch','inventory','api','white_label','multi_location'])
       RETURNING id, name`,
    );
    const plan = (name: string) => plans.rows.find((p) => p.name === name)!.id;

    const sa = await client.query(
      `INSERT INTO users (email, password_hash, name, phone, is_platform_admin)
       VALUES ('marcus@fieldpro.io', $1, 'Marcus Chen', '(555) 100-0001', true) RETURNING id`,
      [hash],
    );

    async function user(email: string, name: string, phone: string) {
      const r = await client.query(
        `INSERT INTO users (email, password_hash, name, phone) VALUES ($1,$2,$3,$4) RETURNING id`,
        [email, hash, name, phone],
      );
      return r.rows[0].id as string;
    }

    const sarah = await user('sarah@mitchell-plumbing.com', 'Sarah Mitchell', '(555) 200-0001');
    const david = await user('david@sparkvolt.com', 'David Rodriguez', '(555) 200-0002');
    const emma = await user('emma@coolbreeze.com', 'Emma Thompson', '(555) 200-0003');
    const jake = await user('jake@mitchell-plumbing.com', 'Jake Morrison', '(555) 300-0001');
    const carlos = await user('carlos@mitchell-plumbing.com', 'Carlos Rivera', '(555) 300-0002');
    const tyler = await user('tyler@mitchell-plumbing.com', 'Tyler Brooks', '(555) 300-0003');
    const lisa = await user('lisa@mitchell-plumbing.com', 'Lisa Park', '(555) 300-0006');
    const omar = await user('omar@mitchell-plumbing.com', 'Omar Patel', '(555) 300-0007');
    const mike = await user('mike@sparkvolt.com', 'Mike Chen', '(555) 300-0004');
    const ahmed = await user('ahmed@sparkvolt.com', 'Ahmed Hassan', '(555) 300-0005');
    const rachel = await user('rachel@sparkvolt.com', 'Rachel Kim', '(555) 300-0008');
    const james = await user('james@coolbreeze.com', 'James Wilson', '(555) 300-0009');
    const maria = await user('maria@coolbreeze.com', 'Maria Gonzalez', '(555) 300-0010');

    const c1 = (await client.query(
      `INSERT INTO companies (name, email, phone, address, plan_id, status)
       VALUES ('Mitchell Plumbing Co.', 'info@mitchell-plumbing.com', '(555) 201-1234',
               '742 Evergreen Terrace, Springfield, IL 62704', $1, 'active') RETURNING id`,
      [plan('Pro')],
    )).rows[0].id;
    const c2 = (await client.query(
      `INSERT INTO companies (name, email, phone, address, plan_id, status)
       VALUES ('SparkVolt Electrical', 'contact@sparkvolt.com', '(555) 202-5678',
               '1600 Pennsylvania Ave, Washington, DC 20500', $1, 'active') RETURNING id`,
      [plan('Enterprise')],
    )).rows[0].id;
    const c3 = (await client.query(
      `INSERT INTO companies (name, email, phone, address, plan_id, status)
       VALUES ('CoolBreeze HVAC', 'hello@coolbreeze.com', '(555) 203-9012',
               '350 Fifth Ave, New York, NY 10118', $1, 'active') RETURNING id`,
      [plan('Basic')],
    )).rows[0].id;
    await client.query(
      `INSERT INTO companies (name, email, phone, address, plan_id, status, trial_ends_at)
       VALUES ('ProPipe Solutions', 'info@propipe.com', '(555) 204-3456',
               '200 Park Ave, New York, NY 10166', $1, 'trial', now() + interval '14 days')`,
      [plan('Pro')],
    );
    await client.query(
      `INSERT INTO companies (name, email, phone, address, plan_id, status)
       VALUES ('ArcLight Electric', 'sales@arclight.com', '(555) 205-7890',
               '100 Market St, San Francisco, CA 94105', $1, 'suspended')`,
      [plan('Basic')],
    );

    async function member(companyId: string, userId: string, role: 'owner' | 'admin' | 'field_worker') {
      const r = await client.query(
        `INSERT INTO company_members (company_id, user_id, role, status) VALUES ($1,$2,$3,'active') RETURNING id`,
        [companyId, userId, role],
      );
      return r.rows[0].id as string;
    }

    const mSarah = await member(c1, sarah, 'owner');
    const mDavid = await member(c2, david, 'owner');
    const mEmma = await member(c3, emma, 'owner');
    const mJake = await member(c1, jake, 'field_worker');
    const mCarlos = await member(c1, carlos, 'field_worker');
    const mTyler = await member(c1, tyler, 'field_worker');
    const mLisa = await member(c1, lisa, 'field_worker');
    const mOmar = await member(c1, omar, 'field_worker');
    const mMike = await member(c2, mike, 'field_worker');
    const mAhmed = await member(c2, ahmed, 'field_worker');
    const mRachel = await member(c2, rachel, 'field_worker');
    const mJames = await member(c3, james, 'field_worker');
    const mMaria = await member(c3, maria, 'field_worker');

    async function worker(companyId: string, memberId: string, specs: string[], status = 'active', extraSat = false, off: string[] = []) {
      await client.query(`SELECT set_config('app.current_company_id', $1, true)`, [companyId]);
      const wp = await client.query(
        `INSERT INTO worker_profiles (company_id, member_id, rating, jobs_completed, employment_status)
         VALUES ($1,$2,4.7,180,$3) RETURNING id`,
        [companyId, memberId, status],
      );
      const id = wp.rows[0].id;
      for (const s of specs) {
        await client.query(`INSERT INTO worker_specialties (company_id, worker_profile_id, name) VALUES ($1,$2,$3)`, [companyId, id, s]);
      }
      for (let d = 0; d < 5; d++) {
        await client.query(
          `INSERT INTO worker_availability (company_id, worker_profile_id, weekday, start_time, end_time) VALUES ($1,$2,$3,'08:00','17:00')`,
          [companyId, id, d],
        );
      }
      if (extraSat) {
        await client.query(
          `INSERT INTO worker_availability (company_id, worker_profile_id, weekday, start_time, end_time) VALUES ($1,$2,5,'09:00','14:00')`,
          [companyId, id],
        );
      }
      for (const date of off) {
        await client.query(`INSERT INTO worker_time_off (company_id, worker_profile_id, off_date) VALUES ($1,$2,$3)`, [companyId, id, date]);
      }
    }

    await worker(c1, mJake, ['Pipe repair', 'Water heater'], 'active', false, ['2026-04-10', '2026-04-11']);
    await worker(c1, mCarlos, ['Drain cleaning', 'Sewer'], 'active', true);
    await worker(c1, mTyler, ['Gas lines', 'Fixtures'], 'active', false, ['2026-04-15']);
    await worker(c1, mLisa, ['Water heater', 'Bathroom remodel']);
    await worker(c1, mOmar, ['Emergency repair', 'Pipe repair'], 'on_leave');
    await worker(c2, mMike, ['Panel upgrade', 'Wiring']);
    await worker(c2, mAhmed, ['EV charger', 'Smart home']);
    await worker(c2, mRachel, ['Commercial wiring', 'Lighting']);
    await worker(c3, mJames, ['AC install', 'Duct work']);
    await worker(c3, mMaria, ['Furnace repair', 'Thermostat']);

    async function customer(companyId: string, first: string, last: string, email: string, phone: string, street: string, city: string, state: string, zip: string, tags: string[], status = 'active', notes = '', type = 'residential') {
      await client.query(`SELECT set_config('app.current_company_id', $1, true)`, [companyId]);
      const c = await client.query(
        `INSERT INTO customers (company_id, status, customer_type, notes) VALUES ($1,$2,$3,$4) RETURNING id`,
        [companyId, status, type, notes],
      );
      const id = c.rows[0].id as string;
      await client.query(
        `INSERT INTO customer_contacts (company_id, customer_id, first_name, last_name, phone, email, is_primary)
         VALUES ($1,$2,$3,$4,$5,$6,true)`,
        [companyId, id, first, last, phone, email],
      );
      await client.query(
        `INSERT INTO addresses (company_id, customer_id, location_name, street, city, state, zip, is_default)
         VALUES ($1,$2,'Home',$3,$4,$5,$6,true)`,
        [companyId, id, street, city, state, zip],
      );
      for (const t of tags) {
        const tag = await client.query(
          `INSERT INTO tags (company_id, name) VALUES ($1,$2) ON CONFLICT (company_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
          [companyId, t],
        );
        await client.query(`INSERT INTO customer_tags (company_id, customer_id, tag_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [companyId, id, tag.rows[0].id]);
      }
      return id;
    }

    const robert = await customer(c1, 'Robert', 'Johnson', 'robert.johnson@email.com', '(555) 400-0001', '123 Oak St', 'Springfield', 'IL', '62704', ['VIP', 'Repeat'], 'active', 'Prefers morning appointments. Has 2 dogs.');
    const patricia = await customer(c1, 'Patricia', 'Williams', 'patricia.w@email.com', '(555) 400-0002', '456 Maple Ave', 'Springfield', 'IL', '62704', ['Residential']);
    const michael = await customer(c1, 'Michael', 'Davis', 'mdavis@email.com', '(555) 400-0003', '789 Elm Dr', 'Springfield', 'IL', '62704', ['Renovation', 'High-Value'], 'active', 'Renovation project ongoing through Q2');
    const jennifer = await customer(c1, 'Jennifer', 'Brown', 'jbrown@email.com', '(555) 400-0004', '321 Pine Rd', 'Springfield', 'IL', '62704', ['Insurance'], 'active', 'Insurance claim for pipe burst');
    const thomas = await customer(c1, 'Thomas', 'Anderson', 'tanderson@email.com', '(555) 400-0005', '654 Birch Ln', 'Springfield', 'IL', '62704', ['Residential']);
    const linda = await customer(c1, 'Linda', 'Martinez', 'lmartinez@email.com', '(555) 400-0006', '987 Cedar Ct', 'Springfield', 'IL', '62704', ['Outdoor', 'Permit-Required'], 'active', 'Outdoor kitchen project. Permit pending.');
    const barbara = await customer(c1, 'Barbara', 'Wilson', 'bwilson@email.com', '(555) 400-0007', '147 Walnut St', 'Springfield', 'IL', '62704', ['Residential']);
    const jamesT = await customer(c1, 'James', 'Taylor', 'jtaylor@email.com', '(555) 400-0008', '258 Spruce Ave', 'Springfield', 'IL', '62704', ['Upsell'], 'active', 'Interested in water filtration');
    const elizabeth = await customer(c1, 'Elizabeth', 'Moore', 'emoore@email.com', '(555) 400-0009', '369 Ash Blvd', 'Springfield', 'IL', '62704', ['Residential']);
    const richard = await customer(c1, 'Richard', 'Clark', 'rclark@email.com', '(555) 400-0010', '741 Poplar Way', 'Springfield', 'IL', '62704', ['VIP', 'Agreement'], 'active', 'Has annual service agreement');
    const steven = await customer(c2, 'Steven', 'Wright', 'swright@email.com', '(555) 400-0011', '852 K St NW', 'Washington', 'DC', '20001', ['Electrical', 'EV']);
    const nancy = await customer(c2, 'Nancy', 'Adams', 'nadams@email.com', '(555) 400-0012', '963 L St NW', 'Washington', 'DC', '20001', ['EV']);
    const karen = await customer(c3, 'Karen', 'Phillips', 'kphillips@email.com', '(555) 400-0013', '159 W 45th St', 'New York', 'NY', '10036', ['Commercial'], 'active', 'Rooftop unit - crane required', 'commercial');
    const donald = await customer(c3, 'Donald', 'Evans', 'devans@email.com', '(555) 400-0014', '267 Broadway', 'New York', 'NY', '10007', ['HVAC']);
    const susan = await customer(c1, 'Susan', 'Turner', 'sturner@email.com', '(555) 400-0015', '432 Hickory St', 'Springfield', 'IL', '62704', ['Residential'], 'inactive');
    await customer(c1, 'Kevin', 'White', 'kwhite@email.com', '(555) 400-0016', '567 Oak Lane', 'Springfield', 'IL', '62704', [], 'inactive', 'Cancelled last job');
    const dorothy = await customer(c1, 'Dorothy', 'Harris', 'dharris@email.com', '(555) 400-0017', '890 Elm St', 'Springfield', 'IL', '62704', ['Residential']);
    const george = await customer(c1, 'George', 'Clark', 'gclark@email.com', '(555) 400-0018', '234 Cherry Dr', 'Springfield', 'IL', '62704', ['Residential', 'Tankless'], 'lead', 'Wants concentric venting');
    const helen = await customer(c1, 'Helen', 'Lewis', 'hlewis@email.com', '(555) 400-0019', '678 Willow Rd', 'Springfield', 'IL', '62704', ['Annual', 'Compliance']);
    const mark = await customer(c1, 'Mark', 'Robinson', 'mrobinson@email.com', '(555) 400-0020', '901 Magnolia Ct', 'Springfield', 'IL', '62704', ['High-Value', 'Excavation'], 'active', 'Main line corroded - needs excavation.');

    async function job(opts: {
      companyId: string; customerId: string; title: string; description: string; status: string; priority: string;
      category: string; assignees?: string[]; dateOffset?: number; time?: string; duration?: number; materials?: string[];
    }) {
      await client.query(`SELECT set_config('app.current_company_id', $1, true)`, [opts.companyId]);
      const addr = await client.query(`SELECT id FROM addresses WHERE customer_id = $1 LIMIT 1`, [opts.customerId]);
      const date = new Date();
      date.setDate(date.getDate() + (opts.dateOffset ?? 0));
      const status = opts.assignees?.length && opts.status === 'new' ? 'assigned' : opts.status;
      const j = await client.query(
        `INSERT INTO jobs (company_id, customer_id, address_id, title, description, status, priority, category, scheduled_date, scheduled_time, estimated_duration_hours, completed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [
          opts.companyId, opts.customerId, addr.rows[0]?.id ?? null, opts.title, opts.description, status,
          opts.priority, opts.category, date.toISOString().slice(0, 10), opts.time ?? '09:00', opts.duration ?? 2,
          status === 'completed' ? date.toISOString() : null,
        ],
      );
      const id = j.rows[0].id as string;
      for (const mid of opts.assignees ?? []) {
        await client.query(`INSERT INTO job_assignees (company_id, job_id, member_id) VALUES ($1,$2,$3)`, [opts.companyId, id, mid]);
      }
      for (const m of opts.materials ?? []) {
        await client.query(`INSERT INTO job_materials (company_id, job_id, name) VALUES ($1,$2,$3)`, [opts.companyId, id, m]);
      }
      return id;
    }

    const j1 = await job({ companyId: c1, customerId: robert, title: 'Water Heater Replacement', description: 'Replace 50-gallon gas water heater', status: 'in_progress', priority: 'high', category: 'plumbing', assignees: [mJake], dateOffset: 0, time: '09:00', duration: 4, materials: ['50-gal water heater', 'Copper fittings', 'Gas flex line'] });
    await job({ companyId: c1, customerId: patricia, title: 'Kitchen Drain Clog', description: 'Severe kitchen drain blockage', status: 'assigned', priority: 'medium', category: 'plumbing', assignees: [mCarlos], dateOffset: 0, time: '13:00', duration: 2, materials: ['Drain snake'] });
    await job({ companyId: c1, customerId: michael, title: 'Bathroom Remodel Plumbing', description: 'Full bathroom remodel', status: 'new', priority: 'medium', category: 'plumbing', dateOffset: 3, time: '08:00', duration: 8 });
    const j4 = await job({ companyId: c1, customerId: jennifer, title: 'Emergency Pipe Burst', description: 'Burst pipe in basement', status: 'completed', priority: 'urgent', category: 'plumbing', assignees: [mTyler], dateOffset: -1, time: '07:00', duration: 3, materials: ['Copper pipe 3/4"'] });
    await job({ companyId: c1, customerId: thomas, title: 'Sewer Line Inspection', description: 'Camera inspection of main sewer line', status: 'assigned', priority: 'low', category: 'plumbing', assignees: [mCarlos], dateOffset: 1, time: '10:00', duration: 2 });
    await job({ companyId: c1, customerId: linda, title: 'Gas Line Installation', description: 'New gas line for outdoor kitchen', status: 'new', priority: 'high', category: 'plumbing', dateOffset: 5, time: '08:00', duration: 6 });
    await job({ companyId: c1, customerId: barbara, title: 'Fixture Installation', description: 'Install new kitchen faucet', status: 'in_progress', priority: 'low', category: 'plumbing', assignees: [mLisa], dateOffset: 0, time: '14:00', duration: 2 });
    const j8 = await job({ companyId: c1, customerId: jamesT, title: 'Water Softener Install', description: 'Install whole-house water softener', status: 'assigned', priority: 'medium', category: 'plumbing', assignees: [mJake], dateOffset: 2, time: '09:00', duration: 4 });
    await job({ companyId: c1, customerId: elizabeth, title: 'Sump Pump Replacement', description: 'Replace failed sump pump', status: 'new', priority: 'high', category: 'plumbing', dateOffset: 1, time: '11:00', duration: 3 });
    const j10 = await job({ companyId: c1, customerId: richard, title: 'Leak Detection', description: 'Underground leak detection', status: 'completed', priority: 'medium', category: 'plumbing', assignees: [mTyler], dateOffset: -3, time: '10:00', duration: 3 });
    const j11 = await job({ companyId: c2, customerId: steven, title: 'Panel Upgrade 200A', description: 'Upgrade electrical panel from 100A to 200A', status: 'in_progress', priority: 'high', category: 'electrical', assignees: [mMike], dateOffset: 0, time: '08:00', duration: 8 });
    await job({ companyId: c2, customerId: nancy, title: 'EV Charger Installation', description: 'Install Level 2 EV charger', status: 'assigned', priority: 'medium', category: 'electrical', assignees: [mAhmed], dateOffset: 1, time: '09:00', duration: 4 });
    await job({ companyId: c3, customerId: karen, title: 'AC Unit Replacement', description: 'Replace 3-ton central AC unit', status: 'new', priority: 'high', category: 'hvac', dateOffset: 4, time: '07:00', duration: 8 });
    const j14 = await job({ companyId: c3, customerId: donald, title: 'Furnace Repair', description: 'Furnace not igniting', status: 'completed', priority: 'urgent', category: 'hvac', assignees: [mJames], dateOffset: -2, time: '08:00', duration: 2 });
    const j15 = await job({ companyId: c1, customerId: susan, title: 'Toilet Replacement', description: 'Replace old toilet', status: 'completed', priority: 'low', category: 'plumbing', assignees: [mLisa], dateOffset: -5, time: '10:00', duration: 2 });
    await job({ companyId: c1, customerId: dorothy, title: 'Shower Valve Replacement', description: 'Leaking shower valve', status: 'assigned', priority: 'medium', category: 'plumbing', assignees: [mTyler], dateOffset: 2, time: '13:00', duration: 3 });
    await job({ companyId: c1, customerId: helen, title: 'Backflow Preventer Test', description: 'Annual backflow testing', status: 'assigned', priority: 'low', category: 'plumbing', assignees: [mCarlos], dateOffset: 3, time: '09:00', duration: 1 });
    await job({ companyId: c1, customerId: mark, title: 'Main Line Replacement', description: 'Replace corroded main water line', status: 'new', priority: 'high', category: 'plumbing', dateOffset: 7, time: '07:00', duration: 10 });

    async function addLines(companyId: string, jobId: string, items: { d: string; q: number; p: number }[]) {
      await client.query(`SELECT set_config('app.current_company_id', $1, true)`, [companyId]);
      for (const i of items) {
        await client.query(
          `INSERT INTO job_line_items (company_id, job_id, description, quantity, unit_price, total) VALUES ($1,$2,$3,$4,$5,$6)`,
          [companyId, jobId, i.d, i.q, i.p, i.q * i.p],
        );
      }
    }
    await addLines(c1, j1, [{ d: 'Water heater replacement - labor', q: 4, p: 150 }, { d: '50-gal gas water heater', q: 1, p: 550 }, { d: 'Fittings & materials', q: 1, p: 50 }]);
    await addLines(c1, j4, [{ d: 'Emergency pipe repair - labor', q: 3, p: 150 }, { d: 'Copper pipe 3/4"', q: 10, p: 8.5 }, { d: 'Emergency call-out fee', q: 1, p: 315 }]);
    await addLines(c1, j10, [{ d: 'Leak detection service', q: 3, p: 125 }, { d: 'Equipment rental', q: 1, p: 50 }]);
    await addLines(c1, j15, [{ d: 'Toilet replacement - labor', q: 2, p: 125 }, { d: 'Low-flow toilet', q: 1, p: 110 }, { d: 'Wax ring & supply line', q: 1, p: 20 }]);
    await addLines(c2, j11, [{ d: 'Panel upgrade - labor', q: 8, p: 175 }, { d: '200A panel', q: 1, p: 385 }, { d: 'Wire & breakers', q: 1, p: 1415 }]);
    await addLines(c3, j14, [{ d: 'Furnace repair - labor', q: 2, p: 125 }, { d: 'Igniter & flame sensor', q: 1, p: 100 }]);

    async function invoice(companyId: string, jobId: string, customerId: string, number: string, status: string, daysAgo: number, dueIn: number) {
      await client.query(`SELECT set_config('app.current_company_id', $1, true)`, [companyId]);
      const lines = await client.query(`SELECT * FROM job_line_items WHERE job_id = $1`, [jobId]);
      const subtotal = lines.rows.reduce((s: number, r: { total: string }) => s + Number(r.total), 0);
      const tax = +(subtotal * 0.08).toFixed(2);
      const created = new Date(); created.setDate(created.getDate() - daysAgo);
      const due = new Date(); due.setDate(due.getDate() + dueIn);
      const inv = await client.query(
        `INSERT INTO invoices (company_id, customer_id, job_id, invoice_number, status, subtotal, tax, total, due_date, created_at, paid_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [companyId, customerId, jobId, number, status, subtotal, tax, subtotal + tax, due.toISOString().slice(0, 10), created.toISOString(), status === 'paid' ? created.toISOString() : null],
      );
      for (const li of lines.rows) {
        await client.query(
          `INSERT INTO invoice_line_items (company_id, invoice_id, description, quantity, unit_price, total) VALUES ($1,$2,$3,$4,$5,$6)`,
          [companyId, inv.rows[0].id, li.description, li.quantity, li.unit_price, li.total],
        );
      }
      await client.query(`UPDATE jobs SET invoice_id = $2, tax_rate = 8 WHERE id = $1`, [jobId, inv.rows[0].id]);
    }
    await invoice(c1, j4, jennifer, 'INV-2026-0001', 'paid', 1, 29);
    await invoice(c1, j10, richard, 'INV-2026-0002', 'sent', 3, 27);
    await invoice(c1, j15, susan, 'INV-2026-0003', 'paid', 5, 25);
    await invoice(c1, j1, robert, 'INV-2026-0004', 'draft', 0, 30);
    await invoice(c2, j11, steven, 'INV-2026-0001', 'draft', 0, 30);
    await invoice(c3, j14, donald, 'INV-2026-0001', 'overdue', 10, -3);

    async function estimate(companyId: string, customerId: string, number: string, status: string, items: { d: string; q: number; p: number }[], notes: string, convertedJobId?: string) {
      await client.query(`SELECT set_config('app.current_company_id', $1, true)`, [companyId]);
      const addr = await client.query(`SELECT id FROM addresses WHERE customer_id = $1 LIMIT 1`, [customerId]);
      const subtotal = items.reduce((s, i) => s + i.q * i.p, 0);
      const tax = +(subtotal * 0.08).toFixed(2);
      const valid = new Date(); valid.setDate(valid.getDate() + 30);
      const e = await client.query(
        `INSERT INTO estimates (company_id, customer_id, address_id, estimate_number, status, category, notes, valid_until, tax_rate, subtotal, tax, total, converted_job_id)
         VALUES ($1,$2,$3,$4,$5,'plumbing',$6,$7,8,$8,$9,$10,$11) RETURNING id`,
        [companyId, customerId, addr.rows[0]?.id ?? null, number, status, notes, valid.toISOString().slice(0, 10), subtotal, tax, subtotal + tax, convertedJobId ?? null],
      );
      for (const i of items) {
        await client.query(
          `INSERT INTO estimate_line_items (company_id, estimate_id, description, quantity, unit_price, total) VALUES ($1,$2,$3,$4,$5,$6)`,
          [companyId, e.rows[0].id, i.d, i.q, i.p, i.q * i.p],
        );
      }
      return e.rows[0].id as string;
    }
    await estimate(c1, michael, 'EST-2026-0001', 'approved', [
      { d: 'Bathroom remodel - rough-in plumbing', q: 8, p: 150 },
      { d: 'PEX tubing & fittings', q: 1, p: 350 },
      { d: 'Fixtures', q: 1, p: 850 },
    ], 'Coordinate with tile contractor.');
    await estimate(c1, linda, 'EST-2026-0002', 'sent', [
      { d: 'Gas line installation - labor', q: 6, p: 175 },
      { d: 'Black iron pipe & fittings', q: 1, p: 420 },
    ], 'Outdoor kitchen gas line.');
    await estimate(c1, george, 'EST-2026-0003', 'draft', [
      { d: 'Tankless water heater installation - labor', q: 6, p: 150 },
      { d: 'Rinnai RU199iN tankless unit', q: 1, p: 1650 },
    ], 'Customer prefers concentric venting.');
    await estimate(c1, mark, 'EST-2026-0004', 'approved', [
      { d: 'Main line excavation & replacement', q: 10, p: 200 },
      { d: '1" copper pipe 50ft', q: 1, p: 450 },
    ], 'Call 811 before digging.');
    await estimate(c1, barbara, 'EST-2026-0005', 'rejected', [
      { d: 'Whole house re-pipe - labor', q: 16, p: 150 },
    ], 'Customer felt price was too high.');
    await estimate(c1, jamesT, 'EST-2026-0006', 'converted', [
      { d: 'Water softener installation - labor', q: 4, p: 125 },
      { d: 'Water softener unit', q: 1, p: 650 },
    ], 'Converted to job.', j8);
    await estimate(c2, steven, 'EST-2026-0001', 'converted', [
      { d: 'Panel upgrade 200A - labor', q: 8, p: 175 },
      { d: '200A panel & main breaker', q: 1, p: 385 },
    ], 'Converted to job.', j11);

    const invItems = [
      ['Copper Pipe 3/4"', 'CP-075', 'Pipes', 150, 50, 8.5],
      ['PEX Tubing 1/2" (100ft)', 'PEX-050', 'Pipes', 25, 10, 45],
      ['SharkBite Fitting 3/4"', 'SB-075', 'Fittings', 8, 20, 12.75],
      ['Pipe Solder (1lb)', 'SOL-001', 'Supplies', 30, 15, 15],
      ['Wax Ring w/ Horn', 'WR-001', 'Toilet Parts', 45, 20, 4.5],
      ['Supply Line 3/8"x12"', 'SL-312', 'Supplies', 60, 25, 6.25],
      ['Gas Flex Line 3/4"', 'GFL-075', 'Gas', 12, 8, 22],
      ['Drain Snake 25ft', 'DS-025', 'Tools', 5, 3, 89],
      ['Bio-Clean Solution (2lb)', 'BC-002', 'Chemicals', 3, 10, 55],
      ['Toilet Flange PVC', 'TF-PVC', 'Toilet Parts', 35, 15, 7.5],
    ] as const;
    await client.query(`SELECT set_config('app.current_company_id', $1, true)`, [c1]);
    for (const [name, sku, cat, qty, min, price] of invItems) {
      await client.query(
        `INSERT INTO inventory_items (company_id, name, sku, category, quantity, min_stock, unit_price) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [c1, name, sku, cat, qty, min, price],
      );
    }
    await client.query(`SELECT set_config('app.current_company_id', $1, true)`, [c2]);
    await client.query(
      `INSERT INTO inventory_items (company_id, name, sku, category, quantity, min_stock, unit_price) VALUES
       ($1,'200A Main Breaker Panel','MB-200','Panels',3,2,385),
       ($1,'6 AWG Wire (100ft)','W6-100','Wire',15,5,125)`,
      [c2],
    );

    await client.query(`SELECT set_config('app.current_company_id', $1, true)`, [c1]);
    await client.query(
      `INSERT INTO email_templates (company_id, name, subject, body, type) VALUES
       ($1,'Invoice Notification','Invoice {invoiceNumber} from {companyName}','Dear {customerName},\n\nPlease find invoice {invoiceNumber}.','invoice'),
       ($1,'Appointment Reminder','Appointment Reminder - {jobTitle}','Dear {customerName},\n\nThis is a reminder of your upcoming appointment on {scheduledDate} {scheduledTime}.','appointment'),
       ($1,'Follow-Up Survey','How was your experience with {companyName}?','Dear {customerName},\n\nThank you for choosing {companyName}!','follow_up'),
       ($1,'Estimate','Estimate {estimateNumber} from {companyName}','Dear {customerName},\n\nPlease review estimate {estimateNumber}.','estimate'),
       ($1,'Customer note','A message from {companyName}','Dear {customerName},\n\n{message}','customer_communication')`,
      [c1],
    );
    await client.query(
      `INSERT INTO service_agreements (company_id, customer_id, job_id, title, terms, status, start_date, end_date) VALUES
       ($1,$2,$3,'Annual Maintenance - Johnson Residence','Quarterly plumbing inspection and maintenance.','active','2026-01-01','2026-12-31'),
       ($1,$4,NULL,'Emergency Service Agreement - Clark','24/7 emergency service guarantee.','active','2025-06-01','2026-05-31')`,
      [c1, robert, j1, richard],
    );

    await client.query(
      `INSERT INTO communications (company_id, type, direction, status, from_number, to_number, customer_id, job_id, user_id, body, duration_sec, read, created_at)
       VALUES
       ($1,'call','inbound','completed','(555) 400-0001','(555) 201-1234',$2,$3,$4,'Customer called to confirm appointment.',312,true, now() - interval '26 hours'),
       ($1,'sms','outbound','delivered','(555) 201-1234','(555) 400-0001',$2,$3,$4,'Hi Robert, Jake will arrive between 9-10am.',0,true, now() - interval '25 hours'),
       ($1,'voicemail','inbound','completed','(555) 400-0002','(555) 201-1234',$5,NULL,$4,'Kitchen drain is completely backed up.',42,false, now() - interval '5 hours')`,
      [c1, robert, j1, sarah, patricia],
    );

    await client.query(`SELECT set_config('app.current_company_id', $1, true)`, [c1]);
    const thread = await client.query(`INSERT INTO chat_threads (company_id) VALUES ($1) RETURNING id`, [c1]);
    await client.query(
      `INSERT INTO chat_thread_participants (company_id, thread_id, user_id) VALUES ($1,$2,$3),($1,$2,$4)`,
      [c1, thread.rows[0].id, sarah, jake],
    );
    await client.query(
      `INSERT INTO chat_messages (company_id, thread_id, sender_id, body) VALUES
       ($1,$2,$3,'Jake, the water heater for 123 Oak St is ready for pickup at the warehouse.'),
       ($1,$2,$4,'Got it! Heading there now. Should I grab extra fittings?')`,
      [c1, thread.rows[0].id, sarah, jake],
    );

    await client.query(
      `INSERT INTO notifications (company_id, user_id, title, message, type, read) VALUES
       ($1,$2,'Emergency Job Completed','Jake Morrison completed emergency pipe repair','success',false),
       ($1,$2,'Low Stock Alert','SharkBite Fitting 3/4" is below minimum stock level (8/20)','warning',false),
       ($1,$3,'New Assignment','You have been assigned: Water Heater Replacement','info',true),
       (NULL,$4,'New Company Registered','ProPipe Solutions has started a trial subscription','info',false)`,
      [c1, sarah, jake, sa.rows[0].id],
    );

    await client.query('COMMIT');
    console.log('Seed complete. Demo password for all users: demo123');
    console.log('  Super admin: marcus@fieldpro.io');
    console.log('  Admin:       sarah@mitchell-plumbing.com');
    console.log('  Worker:      jake@mitchell-plumbing.com');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
