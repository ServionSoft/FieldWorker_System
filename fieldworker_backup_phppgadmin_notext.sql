--
-- PostgreSQL database dump - Namecheap phpPgAdmin compatible (idempotent)
-- Target database: bluearlx_fieldworker_db (create it empty in cPanel first)
-- Import as the database owner via phpPgAdmin -> Import / SQL file upload.
--
-- Safe to re-run after a failed import: leftover tables and functions are
-- dropped, then the full schema and data are created again.
-- Do not run this file against a database that already holds live data.
--
-- Compatibility:
--   * no psql meta-commands (\restrict, \unrestrict, \., \connect)
--   * COPY FROM stdin converted to INSERT
--   * no OWNER TO / GRANT / REVOKE / ROLE / CREATE DATABASE / CREATE SCHEMA
--   * no CREATE EXTENSION (pgcrypto, citext, plpgsql)
--   * citext columns stored as text; uniqueness via lower() indexes
--   * gen_random_uuid() implemented in SQL (no extension)
--   * CREATE OR REPLACE FUNCTION for all functions
--   * EXECUTE PROCEDURE (not EXECUTE FUNCTION) for triggers
-- Schema, constraints, indexes, functions, triggers, RLS and all data kept.
--

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET search_path = public;

--
-- Clear leftover objects from a previous failed phpPgAdmin import.
-- On a truly empty database these DROP IF EXISTS statements are no-ops.
--

DROP TABLE IF EXISTS public.addresses CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.billing_events CASCADE;
DROP TABLE IF EXISTS public.billing_invoices CASCADE;
DROP TABLE IF EXISTS public.chat_message_reads CASCADE;
DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.chat_thread_participants CASCADE;
DROP TABLE IF EXISTS public.chat_threads CASCADE;
DROP TABLE IF EXISTS public.communications CASCADE;
DROP TABLE IF EXISTS public.companies CASCADE;
DROP TABLE IF EXISTS public.company_member_permissions CASCADE;
DROP TABLE IF EXISTS public.company_members CASCADE;
DROP TABLE IF EXISTS public.company_settings CASCADE;
DROP TABLE IF EXISTS public.customer_contacts CASCADE;
DROP TABLE IF EXISTS public.customer_notes CASCADE;
DROP TABLE IF EXISTS public.customer_tags CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;
DROP TABLE IF EXISTS public.document_counters CASCADE;
DROP TABLE IF EXISTS public.documents CASCADE;
DROP TABLE IF EXISTS public.email_templates CASCADE;
DROP TABLE IF EXISTS public.email_verification_tokens CASCADE;
DROP TABLE IF EXISTS public.estimate_assignees CASCADE;
DROP TABLE IF EXISTS public.estimate_follow_up_tasks CASCADE;
DROP TABLE IF EXISTS public.estimate_line_items CASCADE;
DROP TABLE IF EXISTS public.estimates CASCADE;
DROP TABLE IF EXISTS public.files CASCADE;
DROP TABLE IF EXISTS public.follow_ups CASCADE;
DROP TABLE IF EXISTS public.inventory_items CASCADE;
DROP TABLE IF EXISTS public.inventory_movements CASCADE;
DROP TABLE IF EXISTS public.invitations CASCADE;
DROP TABLE IF EXISTS public.invoice_line_items CASCADE;
DROP TABLE IF EXISTS public.invoices CASCADE;
DROP TABLE IF EXISTS public.job_assignees CASCADE;
DROP TABLE IF EXISTS public.job_images CASCADE;
DROP TABLE IF EXISTS public.job_line_items CASCADE;
DROP TABLE IF EXISTS public.job_materials CASCADE;
DROP TABLE IF EXISTS public.job_notes CASCADE;
DROP TABLE IF EXISTS public.job_tasks CASCADE;
DROP TABLE IF EXISTS public.jobs CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.password_reset_tokens CASCADE;
DROP TABLE IF EXISTS public.platform_email_templates CASCADE;
DROP TABLE IF EXISTS public.platform_settings CASCADE;
DROP TABLE IF EXISTS public.record_favorites CASCADE;
DROP TABLE IF EXISTS public.refresh_tokens CASCADE;
DROP TABLE IF EXISTS public.saved_views CASCADE;
DROP TABLE IF EXISTS public.schema_migrations CASCADE;
DROP TABLE IF EXISTS public.service_agreements CASCADE;
DROP TABLE IF EXISTS public.subscription_plans CASCADE;
DROP TABLE IF EXISTS public.tags CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.worker_availability CASCADE;
DROP TABLE IF EXISTS public.worker_profiles CASCADE;
DROP TABLE IF EXISTS public.worker_specialties CASCADE;
DROP TABLE IF EXISTS public.worker_time_off CASCADE;

DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.app_company_id() CASCADE;
DROP FUNCTION IF EXISTS public.app_is_super_admin() CASCADE;
DROP FUNCTION IF EXISTS public.gen_random_uuid() CASCADE;


--
-- Name: gen_random_uuid(); Type: FUNCTION; Schema: public
-- Built-in on PostgreSQL 13+ / pgcrypto; reimplemented here with md5()
-- so DEFAULT gen_random_uuid() works without CREATE EXTENSION.
--

CREATE OR REPLACE FUNCTION public.gen_random_uuid() RETURNS uuid
    LANGUAGE sql
    AS $function$
SELECT CAST(md5(random()::text || clock_timestamp()::text) AS uuid)
$function$;


--
-- Name: app_company_id(); Type: FUNCTION; Schema: public
--

CREATE OR REPLACE FUNCTION public.app_company_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $function$
SELECT NULLIF(current_setting('app.current_company_id', true), '')::uuid
$function$;


--
-- Name: app_is_super_admin(); Type: FUNCTION; Schema: public
--

CREATE OR REPLACE FUNCTION public.app_is_super_admin() RETURNS boolean
    LANGUAGE sql STABLE
    AS $function$
SELECT current_setting('app.is_super_admin', true) = 'true'
$function$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public
-- plpgsql is preinstalled on Namecheap; creating the language is not allowed.
--

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;


--
-- Name: addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    location_name text,
    street text,
    unit text,
    city text,
    state text,
    zip text,
    gated_property boolean DEFAULT false NOT NULL,
    is_default boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY public.addresses FORCE ROW LEVEL SECURITY;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_user_id uuid,
    company_id uuid,
    action text NOT NULL,
    entity_type text,
    entity_id uuid,
    metadata jsonb,
    ip inet,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: billing_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stripe_event_id text,
    type text NOT NULL,
    company_id uuid,
    payload jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: billing_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    stripe_invoice_id text,
    number text,
    amount_cents integer DEFAULT 0 NOT NULL,
    currency text DEFAULT 'usd'::text NOT NULL,
    status text NOT NULL,
    hosted_url text,
    pdf_url text,
    period_start timestamp with time zone,
    period_end timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.billing_invoices FORCE ROW LEVEL SECURITY;


--
-- Name: chat_message_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_message_reads (
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    read_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    thread_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.chat_messages FORCE ROW LEVEL SECURITY;


--
-- Name: chat_thread_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_thread_participants (
    company_id uuid NOT NULL,
    thread_id uuid NOT NULL,
    user_id uuid NOT NULL
);

ALTER TABLE ONLY public.chat_thread_participants FORCE ROW LEVEL SECURITY;


--
-- Name: chat_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.chat_threads FORCE ROW LEVEL SECURITY;


--
-- Name: communications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.communications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    type text NOT NULL,
    direction text NOT NULL,
    status text NOT NULL,
    from_number text DEFAULT ''::text NOT NULL,
    to_number text DEFAULT ''::text NOT NULL,
    customer_id uuid,
    job_id uuid,
    estimate_id uuid,
    user_id uuid,
    body text,
    duration_sec integer,
    recording_file_id uuid,
    read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    twilio_sid text,
    CONSTRAINT communications_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))),
    CONSTRAINT communications_type_check CHECK ((type = ANY (ARRAY['call'::text, 'sms'::text, 'voicemail'::text, 'mms'::text, 'email'::text, 'note'::text])))
);

ALTER TABLE ONLY public.communications FORCE ROW LEVEL SECURITY;


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text,
    address text,
    plan_id uuid NOT NULL,
    status text NOT NULL,
    trial_ends_at timestamp with time zone,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    twilio_number text,
    stripe_customer_id text,
    stripe_subscription_id text,
    timezone text,
    default_tax_pct numeric(6,3),
    website text,
    invoice_footer text,
    logo_file_id uuid,
    business_type text,
    onboarding_completed_at timestamp with time zone,
    CONSTRAINT companies_status_check CHECK ((status = ANY (ARRAY['active'::text, 'trial'::text, 'suspended'::text, 'past_due'::text])))
);


--
-- Name: company_member_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_member_permissions (
    company_id uuid NOT NULL,
    member_id uuid NOT NULL,
    permission text NOT NULL,
    allowed boolean NOT NULL
);

ALTER TABLE ONLY public.company_member_permissions FORCE ROW LEVEL SECURITY;


--
-- Name: company_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    notify_email_assignments boolean DEFAULT true NOT NULL,
    notify_email_invoices boolean DEFAULT true NOT NULL,
    notify_email_billing boolean DEFAULT true NOT NULL,
    CONSTRAINT company_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'dispatcher'::text, 'office'::text, 'field_worker'::text]))),
    CONSTRAINT company_members_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])))
);


--
-- Name: company_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_settings (
    company_id uuid NOT NULL,
    timezone text DEFAULT 'America/Chicago'::text NOT NULL,
    default_tax_pct numeric(6,3) DEFAULT 0 NOT NULL,
    website text,
    invoice_footer text,
    logo_file_id uuid,
    smtp_host text,
    smtp_port integer,
    smtp_user text,
    smtp_password_enc text,
    smtp_secure boolean DEFAULT true NOT NULL,
    smtp_from_name text,
    smtp_from_email text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    smtp_reply_to text
);

ALTER TABLE ONLY public.company_settings FORCE ROW LEVEL SECURITY;


--
-- Name: customer_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    first_name text DEFAULT ''::text NOT NULL,
    last_name text DEFAULT ''::text NOT NULL,
    phone text,
    phone_ext text,
    email text,
    is_primary boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY public.customer_contacts FORCE ROW LEVEL SECURITY;


--
-- Name: customer_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    author_id uuid,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.customer_notes FORCE ROW LEVEL SECURITY;


--
-- Name: customer_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_tags (
    company_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    tag_id uuid NOT NULL
);

ALTER TABLE ONLY public.customer_tags FORCE ROW LEVEL SECURITY;


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    status text NOT NULL,
    customer_type text,
    source text,
    parent_customer_id uuid,
    payment_terms text,
    tax_exempt boolean DEFAULT false NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    archived_at timestamp with time zone,
    archived_by uuid,
    created_by uuid,
    updated_by uuid,
    owner_user_id uuid,
    CONSTRAINT customers_customer_type_check CHECK ((customer_type = ANY (ARRAY['residential'::text, 'commercial'::text]))),
    CONSTRAINT customers_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'lead'::text])))
);

ALTER TABLE ONLY public.customers FORCE ROW LEVEL SECURITY;


--
-- Name: document_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_counters (
    company_id uuid NOT NULL,
    kind text NOT NULL,
    year integer NOT NULL,
    last_value integer DEFAULT 0 NOT NULL,
    CONSTRAINT document_counters_kind_check CHECK ((kind = ANY (ARRAY['invoice'::text, 'estimate'::text])))
);

ALTER TABLE ONLY public.document_counters FORCE ROW LEVEL SECURITY;


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    file_id uuid NOT NULL,
    job_id uuid,
    uploaded_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.documents FORCE ROW LEVEL SECURITY;


--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    subject text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    type text NOT NULL,
    CONSTRAINT email_templates_type_check CHECK ((type = ANY (ARRAY['invoice'::text, 'appointment'::text, 'follow_up'::text, 'welcome'::text, 'estimate'::text, 'customer_communication'::text])))
);

ALTER TABLE ONLY public.email_templates FORCE ROW LEVEL SECURITY;


--
-- Name: email_verification_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_verification_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: estimate_assignees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estimate_assignees (
    company_id uuid NOT NULL,
    estimate_id uuid NOT NULL,
    member_id uuid NOT NULL
);

ALTER TABLE ONLY public.estimate_assignees FORCE ROW LEVEL SECURITY;


--
-- Name: estimate_follow_up_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estimate_follow_up_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    estimate_id uuid NOT NULL,
    title text NOT NULL,
    done boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY public.estimate_follow_up_tasks FORCE ROW LEVEL SECURITY;


--
-- Name: estimate_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estimate_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    estimate_id uuid NOT NULL,
    description text NOT NULL,
    quantity numeric(12,2) DEFAULT 1 NOT NULL,
    unit_price numeric(12,2) DEFAULT 0 NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL
);

ALTER TABLE ONLY public.estimate_line_items FORCE ROW LEVEL SECURITY;


--
-- Name: estimates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estimates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    address_id uuid,
    estimate_number text NOT NULL,
    status text NOT NULL,
    converted_job_id uuid,
    category text NOT NULL,
    description text,
    notes text,
    note_to_customer text,
    notes_for_techs text,
    po_number text,
    referral_source text,
    opportunity_rating smallint,
    opportunity_owner_id uuid,
    requested_on date,
    arrival_start time without time zone,
    arrival_end time without time zone,
    estimated_duration_hours numeric(6,2),
    valid_until date,
    tax_rate numeric(5,2) DEFAULT 0 NOT NULL,
    subtotal numeric(12,2) DEFAULT 0 NOT NULL,
    tax numeric(12,2) DEFAULT 0 NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT estimates_category_check CHECK ((category = ANY (ARRAY['plumbing'::text, 'electrical'::text, 'hvac'::text, 'general'::text]))),
    CONSTRAINT estimates_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'approved'::text, 'rejected'::text, 'converted'::text])))
);

ALTER TABLE ONLY public.estimates FORCE ROW LEVEL SECURITY;


--
-- Name: files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    storage_key text NOT NULL,
    mime_type text,
    size_bytes integer,
    original_name text NOT NULL,
    uploaded_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.files FORCE ROW LEVEL SECURITY;


--
-- Name: follow_ups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.follow_ups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    estimate_id uuid,
    job_id uuid,
    title text NOT NULL,
    due_date date,
    done boolean DEFAULT false NOT NULL,
    assigned_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.follow_ups FORCE ROW LEVEL SECURITY;


--
-- Name: inventory_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    sku text NOT NULL,
    category text DEFAULT ''::text NOT NULL,
    quantity integer DEFAULT 0 NOT NULL,
    min_stock integer DEFAULT 0 NOT NULL,
    unit_price numeric(12,2) DEFAULT 0 NOT NULL
);

ALTER TABLE ONLY public.inventory_items FORCE ROW LEVEL SECURITY;


--
-- Name: inventory_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    item_id uuid NOT NULL,
    type text NOT NULL,
    quantity_delta integer NOT NULL,
    job_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_movements_type_check CHECK ((type = ANY (ARRAY['receive'::text, 'adjust'::text, 'consume'::text])))
);

ALTER TABLE ONLY public.inventory_movements FORCE ROW LEVEL SECURITY;


--
-- Name: invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    email text NOT NULL,
    name text,
    role text NOT NULL,
    token_hash text NOT NULL,
    invited_by uuid,
    expires_at timestamp with time zone NOT NULL,
    accepted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invitations_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'dispatcher'::text, 'office'::text, 'field_worker'::text])))
);

ALTER TABLE ONLY public.invitations FORCE ROW LEVEL SECURITY;


--
-- Name: invoice_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    invoice_id uuid NOT NULL,
    description text NOT NULL,
    quantity numeric(12,2) DEFAULT 1 NOT NULL,
    unit_price numeric(12,2) DEFAULT 0 NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL
);

ALTER TABLE ONLY public.invoice_line_items FORCE ROW LEVEL SECURITY;


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    job_id uuid,
    invoice_number text NOT NULL,
    status text NOT NULL,
    subtotal numeric(12,2) DEFAULT 0 NOT NULL,
    tax numeric(12,2) DEFAULT 0 NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL,
    due_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT invoices_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'paid'::text, 'overdue'::text])))
);

ALTER TABLE ONLY public.invoices FORCE ROW LEVEL SECURITY;


--
-- Name: job_assignees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_assignees (
    company_id uuid NOT NULL,
    job_id uuid NOT NULL,
    member_id uuid NOT NULL
);

ALTER TABLE ONLY public.job_assignees FORCE ROW LEVEL SECURITY;


--
-- Name: job_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    job_id uuid NOT NULL,
    file_id uuid NOT NULL
);

ALTER TABLE ONLY public.job_images FORCE ROW LEVEL SECURITY;


--
-- Name: job_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    job_id uuid NOT NULL,
    group_name text,
    description text NOT NULL,
    warehouse text,
    quantity numeric(12,2) DEFAULT 1 NOT NULL,
    unit_price numeric(12,2) DEFAULT 0 NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL,
    taxable boolean DEFAULT true NOT NULL
);

ALTER TABLE ONLY public.job_line_items FORCE ROW LEVEL SECURITY;


--
-- Name: job_materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_materials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    job_id uuid NOT NULL,
    inventory_item_id uuid,
    name text NOT NULL,
    quantity numeric(12,2) DEFAULT 1
);

ALTER TABLE ONLY public.job_materials FORCE ROW LEVEL SECURITY;


--
-- Name: job_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    job_id uuid NOT NULL,
    author_id uuid,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.job_notes FORCE ROW LEVEL SECURITY;


--
-- Name: job_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    job_id uuid NOT NULL,
    title text NOT NULL,
    done boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY public.job_tasks FORCE ROW LEVEL SECURITY;


--
-- Name: jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    address_id uuid,
    estimate_id uuid,
    invoice_id uuid,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status text NOT NULL,
    priority text NOT NULL,
    category text NOT NULL,
    scheduled_date date,
    scheduled_time time without time zone,
    arrival_end_time time without time zone,
    multi_day boolean DEFAULT false NOT NULL,
    end_date date,
    estimated_duration_hours numeric(6,2) DEFAULT 1 NOT NULL,
    po_number text,
    job_source text,
    agent_rep text,
    notes_for_techs text,
    completion_notes text,
    note_to_customer text,
    requires_follow_up boolean DEFAULT false NOT NULL,
    notify_techs boolean DEFAULT true NOT NULL,
    billing_type text,
    tax_rate numeric(5,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    archived_at timestamp with time zone,
    archived_by uuid,
    created_by uuid,
    updated_by uuid,
    owner_user_id uuid,
    CONSTRAINT jobs_billing_type_check CHECK ((billing_type = ANY (ARRAY['single_invoice'::text, 'progress_billing'::text, 'no_charge'::text]))),
    CONSTRAINT jobs_category_check CHECK ((category = ANY (ARRAY['plumbing'::text, 'electrical'::text, 'hvac'::text, 'general'::text]))),
    CONSTRAINT jobs_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT jobs_status_check CHECK ((status = ANY (ARRAY['new'::text, 'assigned'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])))
);

ALTER TABLE ONLY public.jobs FORCE ROW LEVEL SECURITY;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    user_id uuid NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    type text NOT NULL,
    read boolean DEFAULT false NOT NULL,
    entity_type text,
    entity_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    event_key text,
    link_path text,
    CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['info'::text, 'warning'::text, 'success'::text, 'error'::text])))
);

ALTER TABLE ONLY public.notifications FORCE ROW LEVEL SECURITY;


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_email_templates (
    type text NOT NULL,
    name text NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_settings (
    id integer DEFAULT 1 NOT NULL,
    smtp_host text,
    smtp_port integer,
    smtp_user text,
    smtp_password_enc text,
    smtp_secure boolean DEFAULT true NOT NULL,
    smtp_from_name text,
    smtp_from_email text,
    trial_days integer DEFAULT 14 NOT NULL,
    support_email text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    smtp_reply_to text,
    CONSTRAINT platform_settings_id_check CHECK ((id = 1))
);


--
-- Name: record_favorites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.record_favorites (
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    starred boolean DEFAULT true NOT NULL,
    pinned boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT record_favorites_entity_type_check CHECK ((entity_type = ANY (ARRAY['customer'::text, 'job'::text, 'estimate'::text, 'invoice'::text])))
);

ALTER TABLE ONLY public.record_favorites FORCE ROW LEVEL SECURITY;


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: saved_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    page text NOT NULL,
    name text NOT NULL,
    filters jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.saved_views FORCE ROW LEVEL SECURITY;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    id text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: service_agreements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_agreements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    job_id uuid,
    title text NOT NULL,
    terms text DEFAULT ''::text NOT NULL,
    status text NOT NULL,
    start_date date,
    end_date date,
    CONSTRAINT service_agreements_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'expired'::text])))
);

ALTER TABLE ONLY public.service_agreements FORCE ROW LEVEL SECURITY;


--
-- Name: subscription_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    price_cents integer NOT NULL,
    billing_interval text NOT NULL,
    max_workers integer NOT NULL,
    max_jobs integer NOT NULL,
    features text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    stripe_price_id_monthly text,
    stripe_price_id_yearly text,
    price_cents_yearly integer,
    feature_keys text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT subscription_plans_billing_interval_check CHECK ((billing_interval = ANY (ARRAY['monthly'::text, 'yearly'::text])))
);


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL
);

ALTER TABLE ONLY public.tags FORCE ROW LEVEL SECURITY;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    name text NOT NULL,
    phone text,
    avatar_url text,
    is_platform_admin boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    first_name text DEFAULT ''::text NOT NULL,
    last_name text DEFAULT ''::text NOT NULL,
    job_title text,
    timezone text DEFAULT 'America/Chicago'::text NOT NULL,
    locale text DEFAULT 'en'::text NOT NULL,
    last_login_at timestamp with time zone,
    avatar_key text
);


--
-- Name: worker_availability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.worker_availability (
    company_id uuid NOT NULL,
    worker_profile_id uuid NOT NULL,
    weekday smallint NOT NULL,
    start_time time without time zone,
    end_time time without time zone,
    CONSTRAINT worker_availability_weekday_check CHECK (((weekday >= 0) AND (weekday <= 6)))
);

ALTER TABLE ONLY public.worker_availability FORCE ROW LEVEL SECURITY;


--
-- Name: worker_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.worker_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    member_id uuid NOT NULL,
    rating numeric(2,1) DEFAULT 0 NOT NULL,
    jobs_completed integer DEFAULT 0 NOT NULL,
    employment_status text NOT NULL,
    CONSTRAINT worker_profiles_employment_status_check CHECK ((employment_status = ANY (ARRAY['active'::text, 'inactive'::text, 'on_leave'::text])))
);

ALTER TABLE ONLY public.worker_profiles FORCE ROW LEVEL SECURITY;


--
-- Name: worker_specialties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.worker_specialties (
    company_id uuid NOT NULL,
    worker_profile_id uuid NOT NULL,
    name text NOT NULL
);

ALTER TABLE ONLY public.worker_specialties FORCE ROW LEVEL SECURITY;


--
-- Name: worker_time_off; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.worker_time_off (
    company_id uuid NOT NULL,
    worker_profile_id uuid NOT NULL,
    off_date date NOT NULL
);

ALTER TABLE ONLY public.worker_time_off FORCE ROW LEVEL SECURITY;


--
-- Data for Name: addresses; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.addresses (22 rows)
--

INSERT INTO public.addresses (id, company_id, customer_id, location_name, street, unit, city, state, zip, gated_property, is_default) VALUES
    ('227057d5-e7f1-4353-9348-5a81cdf1e523', '4c85707f-c04c-4c62-9346-be0fe715464c', '9bbaec87-6960-4e9c-a9fd-ae0f9cd1205f', 'Home', '123 Oak St', NULL, 'Springfield', 'IL', '62704', 'f', 't'),
    ('5b7ef1d7-3c9a-45c2-8254-58fc0ca478f3', '4c85707f-c04c-4c62-9346-be0fe715464c', 'db18cc82-c265-4bc1-86da-536b04cb130a', 'Home', '456 Maple Ave', NULL, 'Springfield', 'IL', '62704', 'f', 't'),
    ('50449ee5-7c17-452e-9e1e-285fc79271b0', '4c85707f-c04c-4c62-9346-be0fe715464c', 'd20cb914-c493-486d-b426-34f8cffee6b4', 'Home', '789 Elm Dr', NULL, 'Springfield', 'IL', '62704', 'f', 't'),
    ('fb2a8c73-690a-4d36-9b68-b3f57afca550', '4c85707f-c04c-4c62-9346-be0fe715464c', '43ecb3dd-6b94-4d6c-ac18-55d27c856447', 'Home', '321 Pine Rd', NULL, 'Springfield', 'IL', '62704', 'f', 't'),
    ('9046f321-aeac-4ec3-bb95-ae3446a1628e', '4c85707f-c04c-4c62-9346-be0fe715464c', 'd1971b6f-0fd1-4e63-9279-a2a998673cac', 'Home', '654 Birch Ln', NULL, 'Springfield', 'IL', '62704', 'f', 't'),
    ('a1e9762a-41bd-4b84-8f63-3c613635cc5b', '4c85707f-c04c-4c62-9346-be0fe715464c', '45b2c196-5068-4df9-90a1-7e01636d5a55', 'Home', '987 Cedar Ct', NULL, 'Springfield', 'IL', '62704', 'f', 't'),
    ('7ae814e3-0d58-496e-92ec-9fca7595cc05', '4c85707f-c04c-4c62-9346-be0fe715464c', '7f074219-8060-4fcc-a54c-8c928e4faf8f', 'Home', '147 Walnut St', NULL, 'Springfield', 'IL', '62704', 'f', 't'),
    ('d0e6b353-a383-4ce5-acc3-cdf083c724a6', '4c85707f-c04c-4c62-9346-be0fe715464c', '21928886-bd09-4c7b-bd4b-8b06298eed49', 'Home', '258 Spruce Ave', NULL, 'Springfield', 'IL', '62704', 'f', 't'),
    ('41758d4e-0c41-429c-b7bb-e2f15c8c6ce0', '4c85707f-c04c-4c62-9346-be0fe715464c', 'ac8a5f4f-73de-4957-b9e2-0986a6776d4d', 'Home', '369 Ash Blvd', NULL, 'Springfield', 'IL', '62704', 'f', 't'),
    ('edc8e7cb-9d4b-42a5-9c65-47e8f1f8ed69', '4c85707f-c04c-4c62-9346-be0fe715464c', '0c75e45a-b9ed-4dfb-8ba0-e0b75fe01d64', 'Home', '741 Poplar Way', NULL, 'Springfield', 'IL', '62704', 'f', 't'),
    ('b718b398-e0a1-4ded-9985-1cca358818c6', 'dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '5e62c798-3f59-4c39-a679-31c849f8f209', 'Home', '852 K St NW', NULL, 'Washington', 'DC', '20001', 'f', 't'),
    ('8acb600e-d041-41f4-80ca-9b6490369b18', 'dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '5fda9858-a434-4d77-9308-86347a8ad48b', 'Home', '963 L St NW', NULL, 'Washington', 'DC', '20001', 'f', 't'),
    ('caee8c12-6234-4cbc-9c11-93aca5bedfc8', '3b08e91a-b804-4b8e-9040-b203846c1c59', 'a9e555ee-afc3-4c6b-b77a-234132076da2', 'Home', '159 W 45th St', NULL, 'New York', 'NY', '10036', 'f', 't'),
    ('2738eb92-af7d-41d0-b2d8-f7d86330b5eb', '3b08e91a-b804-4b8e-9040-b203846c1c59', '3654f07f-ef5f-49de-ad6d-0effd3b18a64', 'Home', '267 Broadway', NULL, 'New York', 'NY', '10007', 'f', 't'),
    ('3fe6ce9a-4213-4d2a-bd6e-93cb290410df', '4c85707f-c04c-4c62-9346-be0fe715464c', '00d9b3cd-0b53-4453-beaf-4dba24595c46', 'Home', '432 Hickory St', NULL, 'Springfield', 'IL', '62704', 'f', 't'),
    ('244a3051-709f-4ced-983d-6e7c7bc2c912', '4c85707f-c04c-4c62-9346-be0fe715464c', '163fd7ae-428f-4df3-aefc-14328b894f88', 'Home', '567 Oak Lane', NULL, 'Springfield', 'IL', '62704', 'f', 't'),
    ('7e01f28a-ba09-4ecb-a1ee-ff2c2f681d2a', '4c85707f-c04c-4c62-9346-be0fe715464c', 'a009971a-692c-4f7d-b088-5f49681fccb1', 'Home', '890 Elm St', NULL, 'Springfield', 'IL', '62704', 'f', 't'),
    ('d5c8bbd7-5404-4336-94ba-4e334fbbbc56', '4c85707f-c04c-4c62-9346-be0fe715464c', 'ab190a94-6b09-4e9d-a9eb-87a1783ca1c3', 'Home', '234 Cherry Dr', NULL, 'Springfield', 'IL', '62704', 'f', 't'),
    ('a4172d3a-6b06-4865-90ab-95665bec91bc', '4c85707f-c04c-4c62-9346-be0fe715464c', '1002eeac-9b16-4704-805d-b5f6be27209c', 'Home', '678 Willow Rd', NULL, 'Springfield', 'IL', '62704', 'f', 't'),
    ('dbfa3f3f-5fd5-409b-a79f-c0c47a0681ee', '4c85707f-c04c-4c62-9346-be0fe715464c', 'fa3008d1-c720-4ba9-b549-4e8f1b42e609', 'Home', '901 Magnolia Ct', NULL, 'Springfield', 'IL', '62704', 'f', 't'),
    ('5db8f4b7-8822-4064-834a-834c5dcf7757', '4c85707f-c04c-4c62-9346-be0fe715464c', 'c43b35f5-170a-4729-8d3e-2ff4bc8c81ee', 'Home', 'Flat no. D-11, Bhayani Extension, North Nazimabad , Karachi', '', 'Karachi', '', '75700', 'f', 't'),
    ('570e455a-75f1-4b3f-9920-7f8c24485842', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'a01340b7-bf64-49f1-8e7d-964938dd491f', 'Home', 'Bhayani Extension, North Nazimabad , Karachi', '', '', '', '', 'f', 't');


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.audit_logs (175 rows)
--

INSERT INTO public.audit_logs (id, actor_user_id, company_id, action, entity_type, entity_id, metadata, ip, created_at) VALUES
    ('5dad3ed1-38e8-4bd9-a89b-7947451c92e6', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-21 12:06:49.419169+00'),
    ('4c0d6eef-b3c5-4e95-91cc-93b12da39c7d', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-21 12:07:00.364607+00'),
    ('14922625-97bc-44b3-b6e0-48abf8a2d27b', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-21 12:08:09.609815+00'),
    ('6bfeb388-5e88-4540-9898-67bf843f5273', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-08-21 12:08:17.544302+00'),
    ('802ebc8b-3ee2-4bc4-b3dd-87d446672c23', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-21 12:08:28.085608+00'),
    ('47175b0c-78e3-4f98-ac63-79a964ce689d', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::ffff:127.0.0.1', '2026-08-21 23:41:43.426562+00'),
    ('aa98a3cf-0f14-44dc-a0eb-26dc0a0670fc', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::ffff:127.0.0.1', '2026-08-21 23:42:00.458831+00'),
    ('2ed52f17-ece1-4215-91b5-e2fa01c5e02d', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::ffff:127.0.0.1', '2026-08-21 23:42:20.672951+00'),
    ('e213530d-06ab-49f4-a062-03fa85681cdc', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::ffff:127.0.0.1', '2026-08-21 23:42:22.003518+00'),
    ('14c6fa2e-6a49-4e27-b097-d6dfe18e8852', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-21 23:48:22.742176+00'),
    ('8bbfb111-8fe6-44c8-9caa-b285d17b6643', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-08-21 23:50:16.099987+00'),
    ('6987f632-b6ee-40ce-9e8c-f37b662c368a', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::ffff:127.0.0.1', '2026-08-21 23:50:18.339227+00'),
    ('d2517f84-25a3-4b2c-ab9b-2d4cb31e5fb5', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-21 23:50:43.183146+00'),
    ('17f1b9b5-4db9-4a79-af07-c73fa736d3d1', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-08-22 01:20:40.754701+00'),
    ('408e839f-a974-4c7a-8ab3-f5054e7e1209', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-08-22 01:24:02.20829+00'),
    ('0c6c6af7-7b3b-469d-9464-95ed6f5c80b3', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-22 01:24:58.593428+00'),
    ('93183d26-97c2-4c47-81ee-10256fd20a10', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-08-22 01:29:30.146861+00'),
    ('859bb792-e9bc-49a9-8ddf-fb13e88be227', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-08-22 02:29:47.533589+00'),
    ('1accb5b9-82b6-410b-9f66-9b448c8d2886', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-22 02:31:09.854035+00'),
    ('c985af7c-d914-4905-8cf1-b5c689498edd', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-22 02:31:13.934904+00'),
    ('fe13f446-72cd-4b18-a032-a4c479feb241', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-22 02:31:17.775391+00'),
    ('25d6ae51-4deb-43cc-b40a-6c0286a1221d', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-22 02:34:02.903432+00'),
    ('cde3e45d-914c-4382-aff4-b43853f14fa1', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-08-22 02:34:04.929964+00'),
    ('ee99dd1e-51fc-421c-846e-d94f1db740b1', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-22 02:34:06.898217+00'),
    ('22750254-50cb-4d03-99fc-bf03719498f9', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-22 02:34:40.900488+00'),
    ('b6274105-6c88-40c1-aa7f-fcb9b993bae6', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-08-22 02:34:43.739934+00'),
    ('ad1ee16f-0b75-405b-9620-24d338968236', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-22 02:34:46.386602+00'),
    ('8543665b-3df5-43c8-9ca7-8ebc964de83b', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-24 09:01:18.505805+00'),
    ('975533b7-6088-407c-b859-6a1578314a86', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-27 20:18:44.167902+00'),
    ('1601390d-81e0-4a18-a3cf-3d4b6939c1b5', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-08-27 20:18:46.136745+00'),
    ('68cf3a29-acd0-44d5-a485-11410125bf53', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-27 20:18:48.098543+00'),
    ('11a46479-e347-4d4e-908c-9f0f314f59f9', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-27 20:19:36.018403+00'),
    ('eb0fdf04-78be-4f2e-8bff-381514b258aa', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-27 20:20:05.908504+00'),
    ('25e4a5bd-6186-4009-92e1-0093ac176606', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-08-27 20:20:16.939826+00'),
    ('80a2d5df-df22-4971-b4f1-29fda6731a66', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-27 20:24:54.259069+00'),
    ('f39bba89-6185-4f1c-a77f-24c037a85508', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-08-27 23:16:19.869115+00'),
    ('44f1eae3-eb36-4dd1-9e05-de64a4fc7c98', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-27 23:25:51.253242+00'),
    ('aa091bfa-a103-4f41-aa92-02e25dbd1f42', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-08-27 23:58:50.703561+00'),
    ('ed8e54f7-bb7c-4971-b74c-ca264150bd69', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-08-28 21:27:32.090752+00'),
    ('2acd7831-f168-4bca-94e2-f7d2f43f9794', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-28 21:37:40.450655+00'),
    ('0484e779-9f97-4db2-bdb1-542c4f702a57', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-28 22:45:20.448725+00'),
    ('67c85b1f-b5c4-4be4-b38f-0bad327aa284', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-29 01:18:12.752545+00'),
    ('7e334b3c-7303-4b0c-b954-2df3d03e92f3', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-08-29 11:07:02.171291+00'),
    ('68c7f47c-75ad-4ca6-b544-9f1f527790cb', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-29 11:07:02.241558+00'),
    ('95e3b5ff-f776-4a4b-821e-adae60a0f52c', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'job.archive', 'job', 'f23d3012-bb71-4880-8ffb-df6196d7c031', NULL, NULL, '2026-08-29 14:28:19.925619+00'),
    ('6dd4c7bf-fae7-48dc-8159-c4264548d18b', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'job.restore', 'job', 'f23d3012-bb71-4880-8ffb-df6196d7c031', NULL, NULL, '2026-08-29 14:28:32.906428+00'),
    ('3e14bf6a-0980-4d61-b8b8-3b045ca71475', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'job.status', 'job', '90ac950e-77e1-4b37-b921-1b5131b8b6a8', '{"status": "assigned"}', NULL, '2026-08-29 14:32:26.154935+00'),
    ('698e2c1a-9cb6-4ace-b481-4fbe4c9ea482', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-29 14:40:16.964513+00'),
    ('6a191071-c90c-42f7-bf6c-82e5e4a84129', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'job.archive', 'job', '053b8ea4-8a66-4459-af22-8f8895b78bc4', NULL, NULL, '2026-08-29 14:42:13.379721+00'),
    ('747dcd67-4b82-470d-9da1-3cafc6ab4884', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'job.restore', 'job', '053b8ea4-8a66-4459-af22-8f8895b78bc4', NULL, NULL, '2026-08-29 14:42:25.170804+00');
INSERT INTO public.audit_logs (id, actor_user_id, company_id, action, entity_type, entity_id, metadata, ip, created_at) VALUES
    ('65beb102-544a-4199-81d9-4052068afb08', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'estimate.convert', 'estimate', 'f1b9e537-cd47-46d4-a72d-28444a241997', '{"jobId": "643ee29a-a887-4308-bd6b-c2a7d7e6bbca"}', NULL, '2026-08-29 15:20:19.498281+00'),
    ('68dcdee3-05ad-4f92-b65e-4999516904f7', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'customer.delete', 'customer', 'ddd97ef0-1a9c-4646-8f0c-e56b38e77c5e', NULL, NULL, '2026-08-29 15:32:02.743661+00'),
    ('cebba018-2baf-4968-9c2e-b3dc223e33bf', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'customer.archive', 'customer', 'ab190a94-6b09-4e9d-a9eb-87a1783ca1c3', NULL, NULL, '2026-08-29 15:33:17.795206+00'),
    ('787ba620-8657-4616-85c8-b299825ab86c', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'customer.restore', 'customer', 'ab190a94-6b09-4e9d-a9eb-87a1783ca1c3', NULL, NULL, '2026-08-29 15:33:32.284174+00'),
    ('53f709e7-4a12-4a77-aaa5-0d22f833d568', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'worker.create', 'worker', '7f8f442a-3993-44ff-8d8f-f7664ba85b8d', NULL, NULL, '2026-08-29 15:44:06.189819+00'),
    ('d1790581-d8de-4af6-9fac-010f1581502d', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-31 10:27:52.095795+00'),
    ('7b39ae4f-ee14-430f-a1a4-50263c0e934a', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-08-31 10:29:55.652508+00'),
    ('21e1d401-14ab-402a-87ff-72d9ba9a6277', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-31 10:33:51.875243+00'),
    ('4e0cda2f-980b-4daf-8373-39169c5e7acc', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-08-31 10:34:46.095192+00'),
    ('dcf09210-2dc0-46f5-b368-cb489d4b3c6d', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-31 10:35:22.266102+00'),
    ('7d5e05c2-c4fe-4b3d-a0f8-c9c80e47149a', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-08-31 11:39:58.296516+00'),
    ('b033b9f1-f829-4329-8cde-cf2582578a81', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-31 11:41:22.764466+00'),
    ('96aa3e6f-0b17-448c-a07b-198f52a404e6', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-08-31 11:49:15.961476+00'),
    ('e8e34b7c-f957-4b68-b46c-4b6a5d650674', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-08-31 12:07:33.285498+00'),
    ('8a8acdef-8e47-45cb-b3a0-0737d689bc19', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-31 12:16:57.229708+00'),
    ('bdfa9dda-f209-4ec8-8fc1-6ffe44bda893', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-31 12:23:32.918146+00'),
    ('5a2a525a-f7b7-48f0-af98-baee39283b98', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-31 13:10:57.132564+00'),
    ('110028f8-35f6-4157-b2c2-c972e5c10211', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-31 13:17:34.241786+00'),
    ('a04c1fd7-d104-4177-af2e-001c3102ed2b', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-31 13:17:50.754884+00'),
    ('e3640e95-d21e-4238-b4a0-5f08a9c83149', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-31 13:24:23.118421+00'),
    ('bb8a8cb2-18ba-4f50-aec2-dba4d68fb0aa', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-31 13:33:20.356585+00'),
    ('df5d28f5-72e2-495b-b4e3-5938ad570aa1', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-31 13:40:32.469785+00'),
    ('d13d5f4b-9e11-4deb-a4d5-37ab13380a42', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-08-31 13:45:43.279901+00'),
    ('5d45767a-9b6e-4834-982e-cf727de3e415', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-09-01 13:50:05.813557+00'),
    ('9a10046d-d503-442b-b1f3-acfca7537505', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-01 14:38:59.381184+00'),
    ('14372248-72bc-43a1-b2e5-d89c96ef7bf8', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-01 14:41:27.468711+00'),
    ('619c00c5-ac7a-4abc-a9f9-b5c3e4e952f8', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-01 14:42:09.252104+00'),
    ('a61575a3-df15-404f-ae95-1888933ad8fe', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-01 14:42:25.856929+00'),
    ('37c7f48c-9286-4b8e-9db9-beda1098696a', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-01 14:43:38.359747+00'),
    ('568e3f2b-871b-4bd9-8059-40de410d4ca7', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-01 14:52:26.45298+00'),
    ('51f7e16d-2c38-4c9b-a04c-df91ffa80723', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-09-01 14:54:51.996399+00'),
    ('0b64a085-8094-4f17-8aca-849c15e8397f', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-09-01 14:55:57.821416+00'),
    ('3b9714de-8262-43f8-8f2e-483343071a2a', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-01 14:56:23.496333+00'),
    ('6dde0040-8d81-43ef-a7b5-40de9ed2f7fe', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-09-01 14:58:39.50492+00'),
    ('08945609-97ba-4234-babd-d251bd7b8aaa', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-01 14:59:32.170319+00'),
    ('ba8edbc3-9a48-4fbd-a2b5-16d2bdb4f75d', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-01 15:10:52.153779+00'),
    ('220b2ed2-5f90-4d0a-8fa8-966ca70db233', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-09-01 21:13:26.648451+00'),
    ('6dfc9efb-1800-4f76-b0a5-5c83e61764cd', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-01 21:13:27.693738+00'),
    ('2915c65b-1c78-41bf-9e4e-836629f40f18', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-01 21:13:27.770499+00'),
    ('e557f5cf-c408-4a3e-bb2a-5fa6daeecdbe', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-02 08:26:55.217734+00'),
    ('322596b5-e821-4ddd-afc4-d5d0ad6d39c2', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-02 08:34:09.448998+00'),
    ('79c332d7-23da-4b54-8a57-86b3590a15a9', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-09-02 09:09:40.287149+00'),
    ('bb88c24e-f75f-4d3c-b1b8-59720c8f86f9', '063e98b4-9e12-49f7-b675-b78694cd20b5', '3b08e91a-b804-4b8e-9040-b203846c1c59', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-02 09:11:38.053684+00'),
    ('3408059e-5013-4570-9653-7761bc8144c4', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-02 13:14:32.874692+00'),
    ('79a1e773-496d-4b20-bc17-7a4bea62bb4b', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-09-02 13:14:44.807136+00'),
    ('83586dc4-b392-4133-b815-22c662916f3b', '063e98b4-9e12-49f7-b675-b78694cd20b5', '3b08e91a-b804-4b8e-9040-b203846c1c59', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-02 13:34:12.301396+00'),
    ('e763bd57-cce0-4ca2-b2c0-10bd7c6c02fb', '063e98b4-9e12-49f7-b675-b78694cd20b5', '3b08e91a-b804-4b8e-9040-b203846c1c59', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-02 13:46:44.282983+00'),
    ('59893726-e595-4d6f-88fc-54c20fe8ccef', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-02 15:10:55.741642+00'),
    ('c1b98156-e426-4a9f-8a06-3b6a86cea7ba', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-02 15:21:40.042004+00'),
    ('4e580eb6-8739-478b-afb6-ee0a6426ffa8', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-09-02 15:23:23.178679+00');
INSERT INTO public.audit_logs (id, actor_user_id, company_id, action, entity_type, entity_id, metadata, ip, created_at) VALUES
    ('ae03b588-869c-4f67-b263-4090a9a076ed', '063e98b4-9e12-49f7-b675-b78694cd20b5', '3b08e91a-b804-4b8e-9040-b203846c1c59', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-02 15:25:14.537266+00'),
    ('ee93bbf9-cf33-4c39-b15a-9bee771ac8d9', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-09-02 16:02:09.147529+00'),
    ('29ecf322-0ccf-4985-bbb6-3dffe6ff7e97', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-09-02 22:50:20.184564+00'),
    ('63260627-0b3f-4868-84fe-341565bd2432', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-02 22:50:22.623731+00'),
    ('7063eea4-84f1-4fbc-934b-c40a18206a9c', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-02 22:50:23.083046+00'),
    ('4dca2bb0-1b45-4257-8e69-372edeaab4ad', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 00:23:17.293815+00'),
    ('c21dea87-b5f3-452d-b3f7-ca786adcce6a', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 00:23:23.480741+00'),
    ('32dc108b-e848-4b63-b8bf-731108f33319', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 00:23:39.680433+00'),
    ('c223d49d-ae32-473a-b5fb-324a5a7e0b1d', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 00:36:36.492788+00'),
    ('b9494e04-e379-4fe3-a39b-90ab7be43765', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 00:37:03.326143+00'),
    ('cfa9fcb9-2e13-4dd7-87bf-4ec4eaba857d', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 00:37:13.28371+00'),
    ('a6c76128-8800-4ad2-be43-2fe33fa84e8e', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'company.register', 'company', '85f8952f-bbbd-4aab-9763-0848b1f3010e', NULL, '::1', '2026-09-03 00:48:31.379025+00'),
    ('fe959fcc-027a-499c-8106-ac99175cf8a8', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'member.invite', 'invitation', '55bfa728-a3ad-4ae3-9413-fe44aed51102', '{"role": "office", "email": "rohtiqlabs@gmail.com"}', NULL, '2026-09-03 00:49:52.774198+00'),
    ('bca166e3-ca1e-4e68-8cbf-dbf30e0d65f9', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'document.delete', 'document', '471a3b10-5102-40ed-b389-84863b780dd0', NULL, NULL, '2026-09-03 00:58:24.236955+00'),
    ('27236f84-d5ec-4ac0-8ee6-d995193b6fda', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 00:59:20.6818+00'),
    ('27a6bb05-077f-4f10-afe7-c51cdbaf25ea', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'member.invite', 'invitation', '6cc8eed9-eebc-449a-963d-feae1bb2c2c6', '{"role": "office", "email": "syedmuhammadashhadufaridi@gmail.com"}', NULL, '2026-09-03 01:53:16.770064+00'),
    ('0766767c-ca39-43e7-9191-4ed7295c4ffc', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'member.invite', 'invitation', '1ee1f81d-1f4e-42bd-909c-3c37323971e6', '{"role": "office", "email": "rohtiqlabs@gmail.com"}', NULL, '2026-09-03 01:55:17.346054+00'),
    ('7b484fdb-4933-413e-b188-50bdd77a19d4', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'member.invite', 'invitation', 'd78daeec-051f-48a3-8936-2750ee2bd478', '{"role": "owner", "email": "syedmuhammadashhadufaridi@gmail.com"}', NULL, '2026-09-03 02:25:18.255057+00'),
    ('94b0b0ca-668d-4a8f-890d-140b9349ad87', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 13:42:46.714431+00'),
    ('9e9ea7b4-42d5-4387-9271-fff80342c4f4', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 13:42:56.280528+00'),
    ('4b085966-d02c-4a7c-ab05-75056d431c8d', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 13:44:19.989605+00'),
    ('53a23038-5efe-4e2d-996f-a13f99e4832d', 'd8534839-3925-4194-862f-201365d1f6db', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 13:44:58.892365+00'),
    ('cc35c3e2-5e3b-492b-b68d-7770810e91f6', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 13:45:22.586604+00'),
    ('79f5059a-9582-4e03-94df-6b485662a4bf', 'd8534839-3925-4194-862f-201365d1f6db', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 13:45:55.470838+00'),
    ('3d5b4fbb-ec52-4182-b2ac-548f385858f1', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 13:47:19.066368+00'),
    ('5834d7b4-f618-4296-8de1-ecfde9a34c18', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'worker.create', 'worker', 'a78bcb87-2e94-4c04-9006-7a69ac4bb165', NULL, NULL, '2026-09-03 13:52:56.697942+00'),
    ('d7df403f-2ae8-4bc7-8c4d-071124b22252', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 18:10:11.696656+00'),
    ('e087a9fe-d47e-40bf-a60e-588aac949b8f', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 18:10:14.956885+00'),
    ('aadd7cce-24a6-4bae-85a1-5e409a083864', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 18:28:02.761633+00'),
    ('ea2df73f-296a-41eb-9d56-ad4a1ab87e30', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 18:28:49.95897+00'),
    ('423ec5ff-bb20-4914-8738-37f0f549633d', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 18:29:36.894308+00'),
    ('d8795785-cf50-4733-ab60-700056859317', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 18:29:49.75754+00'),
    ('e40c6c62-f1a7-4f60-9215-63771fb8e751', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 18:30:03.268876+00'),
    ('a59dadc2-66b3-442a-a3e0-1055bd641ae6', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 18:30:52.761474+00'),
    ('0884a0d8-bf4c-4c23-b66c-1efcfc356621', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'worker.create', 'worker', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', NULL, NULL, '2026-09-03 18:31:37.771016+00'),
    ('b028d2ce-983b-4aae-aa72-77625de4a19e', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 18:32:17.957509+00'),
    ('60bed809-db76-46b6-a09c-c552b1802404', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 19:26:32.254273+00'),
    ('46230071-ee92-4c55-a019-ac45425b8b5b', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 19:26:46.552565+00'),
    ('1a44aa32-5579-4ccf-8969-46b9b44d89b6', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 19:27:14.957631+00'),
    ('5082d02e-706a-484b-8bbc-07fb80c53c1f', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 20:14:21.45786+00'),
    ('b9e5d0f1-fa35-438b-b0f0-9d35d4aac850', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 20:14:50.555104+00'),
    ('b6890cff-3a0b-417a-92ce-5648c05f4be1', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 20:21:17.954419+00'),
    ('7678f690-ff8f-4eef-9a04-34135a7704ca', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 20:21:48.150064+00'),
    ('9c904426-a063-4fae-aed2-e2f60c8dd032', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 22:29:53.46845+00'),
    ('6649a308-c621-4b31-b565-240649b0fef7', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 22:41:52.549838+00'),
    ('0e7fd327-23e1-42c4-89a1-87c0e34228b9', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'member.invite', 'invitation', 'b1e1413a-eee9-45dc-b099-6521a94aa831', '{"role": "field_worker", "email": "randombunnhunter2@gmail.com"}', NULL, '2026-09-03 22:42:13.934952+00'),
    ('2b5fef4d-00ed-49dd-9a34-ef4e70b6671e', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'member.update', 'member', '017f3007-ce3f-408f-b088-40801b595557', NULL, NULL, '2026-09-03 22:46:46.492906+00'),
    ('6553e3b5-8114-4cc2-b07f-7abdfa52d967', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'member.update', 'member', '017f3007-ce3f-408f-b088-40801b595557', NULL, NULL, '2026-09-03 22:46:47.032705+00'),
    ('e9edc5df-821b-4f44-9de1-9fdc4c81c0f1', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'member.update', 'member', '017f3007-ce3f-408f-b088-40801b595557', NULL, NULL, '2026-09-03 22:46:50.416792+00'),
    ('b5e3cce0-5777-48e8-85c2-a192873a200f', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 22:47:36.854531+00');
INSERT INTO public.audit_logs (id, actor_user_id, company_id, action, entity_type, entity_id, metadata, ip, created_at) VALUES
    ('2fc5f9b5-d410-44d9-a2e2-8f48621e107c', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'member.update', 'member', '017f3007-ce3f-408f-b088-40801b595557', NULL, NULL, '2026-09-03 22:50:43.478502+00'),
    ('21cc6b81-822f-4576-b460-f023193b0dc6', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 22:53:01.14881+00'),
    ('2c972a03-7cde-4d2b-9d09-d844cb572427', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 23:15:38.493531+00'),
    ('d5ead1ba-c24b-4533-b853-9747e63ed11d', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-03 23:51:59.870057+00'),
    ('c3437fed-e96a-4a68-9b3c-c94f592c5ee1', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'profile.updated', 'user', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '{"fields": ["firstName", "lastName", "name", "email", "phone", "jobTitle", "timezone", "locale", "notifyEmailAssignments", "notifyEmailInvoices", "notifyEmailBilling"]}', '::1', '2026-09-04 00:23:17.832309+00'),
    ('8e860e27-310c-4729-bc6a-d14af07ed4eb', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'profile.password_changed', 'user', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', NULL, '::1', '2026-09-04 00:24:16.050426+00'),
    ('8381f279-8be4-4039-be1a-0263b26814d5', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-04 00:43:28.861931+00'),
    ('0190db39-6a2e-48eb-8f70-f3b4bd783007', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-04 00:45:38.45861+00'),
    ('c96f53cd-aeeb-45d7-ba54-c64e68055742', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-04 00:47:08.055173+00'),
    ('2441f57a-9689-4228-83a5-e8a8e1e7f57f', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-04 00:54:11.552354+00'),
    ('0e2c9746-d03e-4786-a2f8-2b4bf5ae64bc', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'member.update', 'member', '017f3007-ce3f-408f-b088-40801b595557', NULL, NULL, '2026-09-04 00:54:49.050222+00'),
    ('d9608504-b59e-40d2-a5d8-ad466152edbe', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-04 00:55:08.27422+00'),
    ('434be40b-31be-4f1f-a862-7443b496e761', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-04 00:55:24.455478+00'),
    ('8bc49ce9-f5a8-46df-b22b-5bab325a5068', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-04 00:55:42.670303+00'),
    ('76c40d30-c983-4652-bfe1-08d5ed640862', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-04 00:57:39.167512+00'),
    ('150641f7-8f37-45b1-804d-44e486e3182f', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-04 00:58:14.659133+00'),
    ('da9e9f22-c41c-406d-8d57-5b0c262fdbd4', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-04 01:00:42.670498+00'),
    ('16604cb6-e71b-4948-bdcf-b98d8ca051d2', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-04 01:07:52.453631+00'),
    ('e7c35556-6901-4bb6-b33b-766f98fc8182', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-04 01:16:58.347626+00'),
    ('583c4ccd-28ca-4bf7-8121-d62bcc5e0ce0', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-04 01:17:37.162059+00'),
    ('c13c3cfb-61a0-421c-aad8-7e98ef208c01', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'job.status', 'job', '55a0f13a-f09e-4436-aa68-ff5d897ec0e2', '{"status": "in_progress"}', NULL, '2026-09-04 01:29:31.004116+00'),
    ('b6875e59-6727-42d9-ab67-46304dd0f85b', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'job.status', 'job', '55a0f13a-f09e-4436-aa68-ff5d897ec0e2', '{"status": "completed"}', NULL, '2026-09-04 01:30:07.386362+00'),
    ('974c8e91-3aa4-4c88-8417-bf571319f77f', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-04 01:30:30.661811+00'),
    ('0e850278-ea02-4e37-931c-31228fe2e91a', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'auth.login', NULL, NULL, NULL, '::1', '2026-09-04 01:39:46.077934+00'),
    ('54ec6a36-4bc5-4252-a86d-0b87e330225f', '291b2bd3-c527-4b7b-a0f7-8882177a095c', NULL, 'auth.login', NULL, NULL, NULL, '::1', '2026-09-04 01:53:22.090188+00');


--
-- Data for Name: billing_events; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.billing_events (0 rows)
--

-- (no rows)


--
-- Data for Name: billing_invoices; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.billing_invoices (0 rows)
--

-- (no rows)


--
-- Data for Name: chat_message_reads; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.chat_message_reads (25 rows)
--

INSERT INTO public.chat_message_reads (message_id, user_id, read_at) VALUES
    ('4020dfbc-ab42-4c71-af67-e05dfe21af59', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '2026-08-21 23:48:39.835742+00'),
    ('783369b4-c5fd-4d12-b3ec-422d5a907c07', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '2026-09-02 15:20:59.765295+00'),
    ('8969ab23-02f9-4221-94e5-0e83407b6403', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '2026-09-02 15:21:00.156874+00'),
    ('8969ab23-02f9-4221-94e5-0e83407b6403', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '2026-09-02 23:25:49.00179+00'),
    ('06d5e6f9-e02b-4354-913b-1814914f963a', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '2026-09-02 23:26:38.896688+00'),
    ('bb9b7c75-3b79-47dd-8383-0ac7d4ed5ee3', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '2026-09-02 23:35:45.193659+00'),
    ('ebb66ffd-5530-46aa-a06e-26fd59fbeb7f', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '2026-09-02 23:36:18.382817+00'),
    ('31f79c33-aeb1-48dc-ae12-09e76e20d2e2', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '2026-09-02 23:36:28.702936+00'),
    ('696d6e13-f28e-4905-aa5b-3dc651a64eb6', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '2026-09-02 23:52:08.17572+00'),
    ('57ad9e4f-febc-4bce-a9db-72fa73451e09', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '2026-09-02 23:52:19.090819+00'),
    ('521256ad-0e95-49f7-8368-af143fcf88cb', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '2026-09-03 00:38:17.056076+00'),
    ('fd491397-f53a-4edb-a250-43a9765d2d9a', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '2026-09-03 00:38:26.173274+00'),
    ('545db5a5-4051-4c72-8fb0-56e8798e7fff', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '2026-09-03 13:43:18.465995+00'),
    ('8fb2b263-fce5-4558-9a7e-e846b362f3b2', 'd8534839-3925-4194-862f-201365d1f6db', '2026-09-03 13:45:12.571212+00'),
    ('8fb2b263-fce5-4558-9a7e-e846b362f3b2', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '2026-09-03 13:45:36.44598+00'),
    ('c1a4f768-1f0e-45ae-ace8-852b0dc55cd0', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '2026-09-03 13:45:45.35238+00'),
    ('c1a4f768-1f0e-45ae-ace8-852b0dc55cd0', 'd8534839-3925-4194-862f-201365d1f6db', '2026-09-03 13:46:02.380709+00'),
    ('30fa1250-d5d5-45ad-9e12-7832b7049e27', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '2026-09-03 18:23:33.305108+00'),
    ('98800643-ba14-4094-b2c3-7ab5ae2bbcab', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '2026-09-03 18:24:05.938061+00'),
    ('fd2b8968-6a87-445e-9f53-62a57efe5ee6', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '2026-09-03 18:24:34.213291+00'),
    ('f3a43956-5ee9-4654-98cf-edeccf4d19f3', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '2026-09-03 18:28:19.051955+00'),
    ('6b3fa228-01ce-415d-be40-b7368a399956', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '2026-09-03 18:31:51.076063+00'),
    ('6b3fa228-01ce-415d-be40-b7368a399956', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '2026-09-03 18:32:21.260965+00'),
    ('530b7ce7-8db6-4af5-8b40-852193d35119', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '2026-09-03 18:32:25.214374+00'),
    ('530b7ce7-8db6-4af5-8b40-852193d35119', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '2026-09-03 20:14:56.10553+00');


--
-- Data for Name: chat_messages; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.chat_messages (20 rows)
--

INSERT INTO public.chat_messages (id, company_id, thread_id, sender_id, body, created_at) VALUES
    ('4020dfbc-ab42-4c71-af67-e05dfe21af59', '4c85707f-c04c-4c62-9346-be0fe715464c', '44e96923-9f9e-411a-b9a5-7eb039985dda', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'Jake, the water heater for 123 Oak St is ready for pickup at the warehouse.', '2026-08-21 11:31:56.489544+00'),
    ('783369b4-c5fd-4d12-b3ec-422d5a907c07', '4c85707f-c04c-4c62-9346-be0fe715464c', '44e96923-9f9e-411a-b9a5-7eb039985dda', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'Got it! Heading there now. Should I grab extra fittings?', '2026-08-21 11:31:56.489544+00'),
    ('8969ab23-02f9-4221-94e5-0e83407b6403', '4c85707f-c04c-4c62-9346-be0fe715464c', '44e96923-9f9e-411a-b9a5-7eb039985dda', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'QA Usman ping 2026-09-02', '2026-09-02 15:21:00.156874+00'),
    ('06d5e6f9-e02b-4354-913b-1814914f963a', '4c85707f-c04c-4c62-9346-be0fe715464c', '44e96923-9f9e-411a-b9a5-7eb039985dda', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'hi testing', '2026-09-02 23:26:38.896688+00'),
    ('bb9b7c75-3b79-47dd-8383-0ac7d4ed5ee3', '4c85707f-c04c-4c62-9346-be0fe715464c', '44e96923-9f9e-411a-b9a5-7eb039985dda', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'h', '2026-09-02 23:35:45.193659+00'),
    ('ebb66ffd-5530-46aa-a06e-26fd59fbeb7f', '4c85707f-c04c-4c62-9346-be0fe715464c', '44e96923-9f9e-411a-b9a5-7eb039985dda', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'd', '2026-09-02 23:36:18.382817+00'),
    ('31f79c33-aeb1-48dc-ae12-09e76e20d2e2', '4c85707f-c04c-4c62-9346-be0fe715464c', '44e96923-9f9e-411a-b9a5-7eb039985dda', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 's', '2026-09-02 23:36:28.702936+00'),
    ('696d6e13-f28e-4905-aa5b-3dc651a64eb6', '4c85707f-c04c-4c62-9346-be0fe715464c', '44e96923-9f9e-411a-b9a5-7eb039985dda', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'ddd', '2026-09-02 23:52:08.17572+00'),
    ('57ad9e4f-febc-4bce-a9db-72fa73451e09', '4c85707f-c04c-4c62-9346-be0fe715464c', '44e96923-9f9e-411a-b9a5-7eb039985dda', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'cvhtch', '2026-09-02 23:52:19.090819+00'),
    ('521256ad-0e95-49f7-8368-af143fcf88cb', '4c85707f-c04c-4c62-9346-be0fe715464c', '44e96923-9f9e-411a-b9a5-7eb039985dda', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'sdsdc', '2026-09-03 00:38:17.056076+00'),
    ('fd491397-f53a-4edb-a250-43a9765d2d9a', '4c85707f-c04c-4c62-9346-be0fe715464c', '44e96923-9f9e-411a-b9a5-7eb039985dda', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'scaca', '2026-09-03 00:38:26.173274+00'),
    ('545db5a5-4051-4c72-8fb0-56e8798e7fff', '4c85707f-c04c-4c62-9346-be0fe715464c', 'a3994f93-2663-4ba3-9131-7887beb16d38', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'i am new', '2026-09-03 13:43:18.465995+00'),
    ('8fb2b263-fce5-4558-9a7e-e846b362f3b2', '4c85707f-c04c-4c62-9346-be0fe715464c', 'c7c25a83-2366-4930-8bfe-3af2cb8d013a', 'd8534839-3925-4194-862f-201365d1f6db', 'Hey admin', '2026-09-03 13:45:12.571212+00'),
    ('c1a4f768-1f0e-45ae-ace8-852b0dc55cd0', '4c85707f-c04c-4c62-9346-be0fe715464c', 'c7c25a83-2366-4930-8bfe-3af2cb8d013a', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'yes Lisa', '2026-09-03 13:45:45.35238+00'),
    ('30fa1250-d5d5-45ad-9e12-7832b7049e27', '4c85707f-c04c-4c62-9346-be0fe715464c', '44e96923-9f9e-411a-b9a5-7eb039985dda', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 't', '2026-09-03 18:23:33.305108+00'),
    ('98800643-ba14-4094-b2c3-7ab5ae2bbcab', '4c85707f-c04c-4c62-9346-be0fe715464c', '44e96923-9f9e-411a-b9a5-7eb039985dda', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'this msg is from admin office side', '2026-09-03 18:24:05.938061+00'),
    ('fd2b8968-6a87-445e-9f53-62a57efe5ee6', '4c85707f-c04c-4c62-9346-be0fe715464c', '44e96923-9f9e-411a-b9a5-7eb039985dda', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'this msg is from client worker side', '2026-09-03 18:24:34.213291+00'),
    ('f3a43956-5ee9-4654-98cf-edeccf4d19f3', '4c85707f-c04c-4c62-9346-be0fe715464c', 'a3994f93-2663-4ba3-9131-7887beb16d38', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'hi', '2026-09-03 18:28:19.051955+00'),
    ('6b3fa228-01ce-415d-be40-b7368a399956', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'd9601d73-bb45-43b7-abe2-f48dc52b8491', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'hii', '2026-09-03 18:31:51.076063+00'),
    ('530b7ce7-8db6-4af5-8b40-852193d35119', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'd9601d73-bb45-43b7-abe2-f48dc52b8491', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', 'dgvdv', '2026-09-03 18:32:25.214374+00');


--
-- Data for Name: chat_thread_participants; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.chat_thread_participants (8 rows)
--

INSERT INTO public.chat_thread_participants (company_id, thread_id, user_id) VALUES
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '44e96923-9f9e-411a-b9a5-7eb039985dda', '12063947-0b9a-45f4-bec7-6f81c6443f1b'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '44e96923-9f9e-411a-b9a5-7eb039985dda', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'c7c25a83-2366-4930-8bfe-3af2cb8d013a', 'd8534839-3925-4194-862f-201365d1f6db'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'c7c25a83-2366-4930-8bfe-3af2cb8d013a', '12063947-0b9a-45f4-bec7-6f81c6443f1b'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'a3994f93-2663-4ba3-9131-7887beb16d38', '7f8f442a-3993-44ff-8d8f-f7664ba85b8d'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'a3994f93-2663-4ba3-9131-7887beb16d38', '12063947-0b9a-45f4-bec7-6f81c6443f1b'),
    ('85f8952f-bbbd-4aab-9763-0848b1f3010e', 'd9601d73-bb45-43b7-abe2-f48dc52b8491', '1a92b49e-3eb8-4e92-844f-3c6b806819c8'),
    ('85f8952f-bbbd-4aab-9763-0848b1f3010e', 'd9601d73-bb45-43b7-abe2-f48dc52b8491', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21');


--
-- Data for Name: chat_threads; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.chat_threads (4 rows)
--

INSERT INTO public.chat_threads (id, company_id, created_at) VALUES
    ('44e96923-9f9e-411a-b9a5-7eb039985dda', '4c85707f-c04c-4c62-9346-be0fe715464c', '2026-08-21 11:31:56.489544+00'),
    ('c7c25a83-2366-4930-8bfe-3af2cb8d013a', '4c85707f-c04c-4c62-9346-be0fe715464c', '2026-08-21 23:51:17.844942+00'),
    ('a3994f93-2663-4ba3-9131-7887beb16d38', '4c85707f-c04c-4c62-9346-be0fe715464c', '2026-09-02 08:29:08.537041+00'),
    ('d9601d73-bb45-43b7-abe2-f48dc52b8491', '85f8952f-bbbd-4aab-9763-0848b1f3010e', '2026-09-03 18:31:43.762459+00');


--
-- Data for Name: communications; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.communications (12 rows)
--

INSERT INTO public.communications (id, company_id, type, direction, status, from_number, to_number, customer_id, job_id, estimate_id, user_id, body, duration_sec, recording_file_id, read, created_at, twilio_sid) VALUES
    ('9a96d7c7-7264-4596-b20b-5e47ae6bfd3d', '4c85707f-c04c-4c62-9346-be0fe715464c', 'email', 'outbound', 'sent', 'office', '(555) 400-0003', 'd20cb914-c493-486d-b426-34f8cffee6b4', NULL, '27e6dd34-bb06-42cf-bf90-6e3bb9135ef0', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'Logged outbound email (no provider in v1).', NULL, NULL, 't', '2026-08-29 15:19:09.767046+00', NULL),
    ('6d44ac36-6e33-4684-9f32-bb50dad461bf', '4c85707f-c04c-4c62-9346-be0fe715464c', 'email', 'outbound', 'sent', 'office', '(555) 400-0018', 'ab190a94-6b09-4e9d-a9eb-87a1783ca1c3', NULL, 'd5aebda9-22f8-48a7-9894-5d222b2f86ce', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'Logged outbound email (no provider in v1).', NULL, NULL, 't', '2026-08-29 15:18:30.996661+00', NULL),
    ('56a28054-1635-4d71-8e6a-774d44fa6e80', '4c85707f-c04c-4c62-9346-be0fe715464c', 'voicemail', 'inbound', 'completed', '(555) 400-0002', '(555) 201-1234', 'db18cc82-c265-4bc1-86da-536b04cb130a', NULL, NULL, '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'Kitchen drain is completely backed up.', '42', NULL, 't', '2026-08-21 06:31:56.489544+00', NULL),
    ('675fb382-9925-40c2-8fd1-4b0dd0dbe9ef', '4c85707f-c04c-4c62-9346-be0fe715464c', 'sms', 'outbound', 'delivered', '(555) 201-1234', '(555) 400-0001', '9bbaec87-6960-4e9c-a9fd-ae0f9cd1205f', 'b9103a7d-9e23-4803-80d0-d33ef6acf30f', NULL, '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'Hi Robert, Jake will arrive between 9-10am.', '0', NULL, 't', '2026-08-20 10:31:56.489544+00', NULL),
    ('e69b4694-6ac4-4acf-aeb0-acbfad867708', '4c85707f-c04c-4c62-9346-be0fe715464c', 'call', 'inbound', 'completed', '(555) 400-0001', '(555) 201-1234', '9bbaec87-6960-4e9c-a9fd-ae0f9cd1205f', 'b9103a7d-9e23-4803-80d0-d33ef6acf30f', NULL, '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'Customer called to confirm appointment.', '312', NULL, 't', '2026-08-20 09:31:56.489544+00', NULL),
    ('ee470bcd-1292-471a-afd5-183bea3f2f8a', '4c85707f-c04c-4c62-9346-be0fe715464c', 'email', 'outbound', 'sent', 'office', '(555) 400-0008', '21928886-bd09-4c7b-bd4b-8b06298eed49', NULL, NULL, '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'Subject: hi this ashhhadu

test body', NULL, NULL, 't', '2026-09-03 00:22:38.111383+00', NULL),
    ('5b799b1b-a82d-47df-b2d0-987ef5b4a1cf', '4c85707f-c04c-4c62-9346-be0fe715464c', 'call', 'outbound', 'completed', 'office', '(555) 400-0008', '21928886-bd09-4c7b-bd4b-8b06298eed49', NULL, NULL, '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'Subject: ashhadu

ashhadu', NULL, NULL, 't', '2026-09-03 00:38:04.793256+00', NULL),
    ('2f58765e-429c-4051-86d3-b4b4d0f99115', '4c85707f-c04c-4c62-9346-be0fe715464c', 'email', 'outbound', 'queued', 'Appointment Reminder - Water Heater Replacement', 'rclark@email.com', '0c75e45a-b9ed-4dfb-8ba0-e0b75fe01d64', '6c57086d-71c2-49cd-941f-c42d548a1368', NULL, '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'Dear Richard Clark,

This is a reminder of your upcoming appointment on 2026-09-04 21:00.', NULL, NULL, 't', '2026-09-03 14:55:47.78741+00', NULL),
    ('d59de76f-ea81-4eb3-9576-b4085c74d01d', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'call', 'outbound', 'completed', 'office', '03232644959', 'a01340b7-bf64-49f1-8e7d-964938dd491f', NULL, NULL, '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'Subject: this subject for maria rl

need cleaning services for one bedroom', NULL, NULL, 't', '2026-09-03 20:25:17.486318+00', NULL),
    ('cdd48cdc-8d97-44a1-9cef-baa8733e10d2', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'sms', 'outbound', 'sent', 'office', '03232644959', 'a01340b7-bf64-49f1-8e7d-964938dd491f', NULL, NULL, '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'Subject: sending sms

this the sms', NULL, NULL, 't', '2026-09-03 20:29:36.008416+00', NULL),
    ('a6dc0aec-7197-45a5-a97b-3c1ae8ed1990', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'email', 'outbound', 'sent', 'office', '03232644959', 'a01340b7-bf64-49f1-8e7d-964938dd491f', NULL, NULL, '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'Subject: this the email subject of maria

this the body of email maria', NULL, NULL, 't', '2026-09-03 20:32:50.199605+00', NULL),
    ('ff125503-8ed0-401b-9626-bf43e8860297', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'email', 'outbound', 'queued', 'Appointment: ac cleaning ', 'randombunnyhunter2@gmail.com', 'a01340b7-bf64-49f1-8e7d-964938dd491f', '55a0f13a-f09e-4436-aa68-ff5d897ec0e2', NULL, '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'Dear MARIA KL,

Your appointment for ac cleaning  is scheduled for 2026-09-17 at 06:07.', NULL, NULL, 't', '2026-09-04 01:06:09.575564+00', NULL);


--
-- Data for Name: companies; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.companies (6 rows)
--

INSERT INTO public.companies (id, name, email, phone, address, plan_id, status, trial_ends_at, deleted_at, created_at, updated_at, twilio_number, stripe_customer_id, stripe_subscription_id, timezone, default_tax_pct, website, invoice_footer, logo_file_id, business_type, onboarding_completed_at) VALUES
    ('dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', 'SparkVolt Electrical', 'contact@sparkvolt.com', '(555) 202-5678', '1600 Pennsylvania Ave, Washington, DC 20500', '839d7188-413a-4f8f-b2b9-0418f9a69813', 'active', NULL, NULL, '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('94b5a002-af24-4710-9404-22da5a69943a', 'ProPipe Solutions', 'info@propipe.com', '(555) 204-3456', '200 Park Ave, New York, NY 10166', '827f71f6-e194-4ce5-8d93-5067c866ba78', 'trial', '2026-09-04 11:31:56.489544+00', NULL, '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('49ae99f0-a732-418d-bf0b-e22c32cf09f3', 'ArcLight Electric', 'sales@arclight.com', '(555) 205-7890', '100 Market St, San Francisco, CA 94105', '91d439bf-4a26-40a9-843c-0c097eec9e83', 'suspended', NULL, NULL, '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
    ('3b08e91a-b804-4b8e-9040-b203846c1c59', 'CoolBreeze HVAC', 'hello@coolbreeze.com', '(555) 203-9012', '350 Fifth Ave, New York, NY 10118', '91d439bf-4a26-40a9-843c-0c097eec9e83', 'active', NULL, NULL, '2026-08-21 11:31:56.489544+00', '2026-09-02 13:36:09.013092+00', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'plumbing', NULL),
    ('85f8952f-bbbd-4aab-9763-0848b1f3010e', 'PAF KIET University', 'syedmuhammadashhadufaridi@gmail.com', '03273621640', 'Bhayani Extension, North Nazimabad , Karachi', '91d439bf-4a26-40a9-843c-0c097eec9e83', 'trial', '2026-09-17 00:48:32.901+00', NULL, '2026-09-03 00:48:31.379025+00', '2026-09-03 00:50:42.702914+00', NULL, NULL, NULL, 'America/Chicago', NULL, '', NULL, NULL, 'electrical', '2026-09-03 00:50:42.702914+00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'Mitesoft', 'developer@mitiesoft.com', '162845644', 'Level 18, 40 Bank Street', '827f71f6-e194-4ce5-8d93-5067c866ba78', 'active', NULL, NULL, '2026-08-21 11:31:56.489544+00', '2026-09-03 23:09:08.397413+00', '+92 3723621640', 'cus_VC80lpEojmc0NG', NULL, 'America/Chicago', '0.000', '', '', NULL, 'plumbing', '2026-08-21 12:07:54.645432+00');


--
-- Data for Name: company_member_permissions; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.company_member_permissions (1 row)
--

INSERT INTO public.company_member_permissions (company_id, member_id, permission, allowed) VALUES
    ('85f8952f-bbbd-4aab-9763-0848b1f3010e', '017f3007-ce3f-408f-b088-40801b595557', 'customers.read', 't');


--
-- Data for Name: company_members; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.company_members (17 rows)
--

INSERT INTO public.company_members (id, company_id, user_id, role, status, created_at, notify_email_assignments, notify_email_invoices, notify_email_billing) VALUES
    ('a0d823e4-8baa-411d-bda3-5729c79b918a', 'dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', 'c594d8fa-1677-4ae1-be00-5b4261c64899', 'owner', 'active', '2026-08-21 11:31:56.489544+00', 't', 't', 't'),
    ('2acaa93a-1494-422e-9662-a03d18cb0952', '3b08e91a-b804-4b8e-9040-b203846c1c59', '063e98b4-9e12-49f7-b675-b78694cd20b5', 'owner', 'active', '2026-08-21 11:31:56.489544+00', 't', 't', 't'),
    ('d52930c5-f38e-4dad-a31d-9cd9374763c1', '4c85707f-c04c-4c62-9346-be0fe715464c', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'field_worker', 'active', '2026-08-21 11:31:56.489544+00', 't', 't', 't'),
    ('d3604817-4f1c-4c8b-85ba-13c9f1272144', '4c85707f-c04c-4c62-9346-be0fe715464c', '865867cf-e471-42ed-9b83-753015196d19', 'field_worker', 'active', '2026-08-21 11:31:56.489544+00', 't', 't', 't'),
    ('eac8241e-36a0-4f1e-b794-ecd137631ec8', '4c85707f-c04c-4c62-9346-be0fe715464c', 'f9cabbe7-6fcb-4b50-b376-83f520719e24', 'field_worker', 'active', '2026-08-21 11:31:56.489544+00', 't', 't', 't'),
    ('a6c7a2ef-7e00-4b22-b95b-2b0a4406cb2e', '4c85707f-c04c-4c62-9346-be0fe715464c', 'd8534839-3925-4194-862f-201365d1f6db', 'field_worker', 'active', '2026-08-21 11:31:56.489544+00', 't', 't', 't'),
    ('533f3193-77ad-40fd-a0a0-37b98112509e', '4c85707f-c04c-4c62-9346-be0fe715464c', '32b6a73d-4858-43dc-a692-0e8cebd60cd4', 'field_worker', 'active', '2026-08-21 11:31:56.489544+00', 't', 't', 't'),
    ('abb1b14c-5eea-4c14-b759-8dbe6a04b6a1', 'dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '2838bc5b-a147-4274-8c34-91d2137b8c87', 'field_worker', 'active', '2026-08-21 11:31:56.489544+00', 't', 't', 't'),
    ('f276e0e6-bace-4cf4-9945-dbcd1d3c54dd', 'dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '3d650b26-16dc-4bec-b9e9-9db4d712e47f', 'field_worker', 'active', '2026-08-21 11:31:56.489544+00', 't', 't', 't'),
    ('fd9c86fd-cdb1-4568-96dc-03d0492c4eef', 'dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '9d4dd9c7-fff9-4687-96a5-98f145aea2ef', 'field_worker', 'active', '2026-08-21 11:31:56.489544+00', 't', 't', 't'),
    ('b03de3f9-ee11-4c44-8897-9ef85e2bdee0', '3b08e91a-b804-4b8e-9040-b203846c1c59', 'cf29678a-1e0e-4c8a-9a00-f2f11893e7f1', 'field_worker', 'active', '2026-08-21 11:31:56.489544+00', 't', 't', 't'),
    ('88fb6e32-b611-4d4d-9215-d18eb9335b08', '3b08e91a-b804-4b8e-9040-b203846c1c59', '0dd3164c-b246-4de2-8df1-a67f29b531d8', 'field_worker', 'active', '2026-08-21 11:31:56.489544+00', 't', 't', 't'),
    ('342d92e5-fa99-421e-a7d5-5de29dac8de1', '4c85707f-c04c-4c62-9346-be0fe715464c', '7f8f442a-3993-44ff-8d8f-f7664ba85b8d', 'field_worker', 'active', '2026-08-29 15:44:06.189819+00', 't', 't', 't'),
    ('6c59c18f-8d07-44ec-9b76-08ff14ae9578', '4c85707f-c04c-4c62-9346-be0fe715464c', 'a78bcb87-2e94-4c04-9006-7a69ac4bb165', 'field_worker', 'active', '2026-09-03 13:52:56.697942+00', 't', 't', 't'),
    ('a133fb5f-cf08-4bc2-b6b0-7a8e03b44c9d', '4c85707f-c04c-4c62-9346-be0fe715464c', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'owner', 'active', '2026-08-21 11:31:56.489544+00', 't', 't', 't'),
    ('57cbe30c-94b4-436d-a229-0d8e6eb638f9', '85f8952f-bbbd-4aab-9763-0848b1f3010e', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'owner', 'active', '2026-09-03 00:48:31.379025+00', 't', 't', 't'),
    ('017f3007-ce3f-408f-b088-40801b595557', '85f8952f-bbbd-4aab-9763-0848b1f3010e', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', 'field_worker', 'active', '2026-09-03 18:31:37.771016+00', 't', 't', 't');


--
-- Data for Name: company_settings; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.company_settings (2 rows)
--

INSERT INTO public.company_settings (company_id, timezone, default_tax_pct, website, invoice_footer, logo_file_id, smtp_host, smtp_port, smtp_user, smtp_password_enc, smtp_secure, smtp_from_name, smtp_from_email, updated_at, smtp_reply_to) VALUES
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'America/Chicago', '0.000', NULL, NULL, NULL, 'send.one.com', '587', 'developer@mitiesoft.com', '7E4UvlD7fGUjC/wa.G+pXJd4y0DwwcFEl93NAkw==.j04selyUd0MAAThBHWI=', 'f', 'FieldPro', 'developer@mitiesoft.com', '2026-09-03 22:57:12.030939+00', 'syedmuhammadashhadufaridi@gmail.com'),
    ('3b08e91a-b804-4b8e-9040-b203846c1c59', 'America/Chicago', '0.000', NULL, NULL, NULL, 'send.one.com', '587', 'emma@coolbreeze.com', 'M3UI9fE0g33OFbBG.4yEyNdVnZFm+R8ZO+4OJRw==.slkeWQKiVg==', 't', 'Us', 'info@xtremecleaner.co.uk', '2026-09-02 13:38:45.183696+00', NULL);


--
-- Data for Name: customer_contacts; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.customer_contacts (22 rows)
--

INSERT INTO public.customer_contacts (id, company_id, customer_id, first_name, last_name, phone, phone_ext, email, is_primary) VALUES
    ('12b477b9-1443-4f64-a456-fcdd071d2a75', '4c85707f-c04c-4c62-9346-be0fe715464c', '9bbaec87-6960-4e9c-a9fd-ae0f9cd1205f', 'Robert', 'Johnson', '(555) 400-0001', NULL, 'robert.johnson@email.com', 't'),
    ('8f6ef7e0-d623-4f27-adc0-79bb04b65eac', '4c85707f-c04c-4c62-9346-be0fe715464c', 'db18cc82-c265-4bc1-86da-536b04cb130a', 'Patricia', 'Williams', '(555) 400-0002', NULL, 'patricia.w@email.com', 't'),
    ('653ee003-ec21-43ec-93eb-27b0f9ec9d5d', '4c85707f-c04c-4c62-9346-be0fe715464c', 'd20cb914-c493-486d-b426-34f8cffee6b4', 'Michael', 'Davis', '(555) 400-0003', NULL, 'mdavis@email.com', 't'),
    ('5a1191a9-087b-4cc5-b2ef-5d2e23506c4e', '4c85707f-c04c-4c62-9346-be0fe715464c', '43ecb3dd-6b94-4d6c-ac18-55d27c856447', 'Jennifer', 'Brown', '(555) 400-0004', NULL, 'jbrown@email.com', 't'),
    ('e6ba49ec-3de7-49c5-bfa4-e951119b84ee', '4c85707f-c04c-4c62-9346-be0fe715464c', 'd1971b6f-0fd1-4e63-9279-a2a998673cac', 'Thomas', 'Anderson', '(555) 400-0005', NULL, 'tanderson@email.com', 't'),
    ('44119738-b30f-40b7-b2b3-64b88e14befc', '4c85707f-c04c-4c62-9346-be0fe715464c', '45b2c196-5068-4df9-90a1-7e01636d5a55', 'Linda', 'Martinez', '(555) 400-0006', NULL, 'lmartinez@email.com', 't'),
    ('6acc3fb4-69b8-46dc-b21f-34f425d884fe', '4c85707f-c04c-4c62-9346-be0fe715464c', '7f074219-8060-4fcc-a54c-8c928e4faf8f', 'Barbara', 'Wilson', '(555) 400-0007', NULL, 'bwilson@email.com', 't'),
    ('5d9618ee-4e4d-45ed-bd79-4dded1f0f82d', '4c85707f-c04c-4c62-9346-be0fe715464c', '21928886-bd09-4c7b-bd4b-8b06298eed49', 'James', 'Taylor', '(555) 400-0008', NULL, 'jtaylor@email.com', 't'),
    ('699ccb2c-d758-4164-b46c-595560242fb4', '4c85707f-c04c-4c62-9346-be0fe715464c', 'ac8a5f4f-73de-4957-b9e2-0986a6776d4d', 'Elizabeth', 'Moore', '(555) 400-0009', NULL, 'emoore@email.com', 't'),
    ('2128162d-6754-4d22-b3cf-0a7e832947f7', '4c85707f-c04c-4c62-9346-be0fe715464c', '0c75e45a-b9ed-4dfb-8ba0-e0b75fe01d64', 'Richard', 'Clark', '(555) 400-0010', NULL, 'rclark@email.com', 't'),
    ('3e543925-ec46-482b-bc40-9e2c6d073684', 'dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '5e62c798-3f59-4c39-a679-31c849f8f209', 'Steven', 'Wright', '(555) 400-0011', NULL, 'swright@email.com', 't'),
    ('0871c5e8-569b-4ec8-9b04-b919461cd009', 'dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '5fda9858-a434-4d77-9308-86347a8ad48b', 'Nancy', 'Adams', '(555) 400-0012', NULL, 'nadams@email.com', 't'),
    ('5393bcbd-54e6-40f9-8212-d4ad407c30ec', '3b08e91a-b804-4b8e-9040-b203846c1c59', 'a9e555ee-afc3-4c6b-b77a-234132076da2', 'Karen', 'Phillips', '(555) 400-0013', NULL, 'kphillips@email.com', 't'),
    ('a30f40dd-5cb8-4105-8a9a-650deefcf955', '3b08e91a-b804-4b8e-9040-b203846c1c59', '3654f07f-ef5f-49de-ad6d-0effd3b18a64', 'Donald', 'Evans', '(555) 400-0014', NULL, 'devans@email.com', 't'),
    ('eabdf0f5-254e-4b31-9588-d13d2baef864', '4c85707f-c04c-4c62-9346-be0fe715464c', '00d9b3cd-0b53-4453-beaf-4dba24595c46', 'Susan', 'Turner', '(555) 400-0015', NULL, 'sturner@email.com', 't'),
    ('edfe879d-476f-4ce0-bb9e-ec65afbb3353', '4c85707f-c04c-4c62-9346-be0fe715464c', '163fd7ae-428f-4df3-aefc-14328b894f88', 'Kevin', 'White', '(555) 400-0016', NULL, 'kwhite@email.com', 't'),
    ('98f02486-0ca6-4b58-be5d-8cb000a8a443', '4c85707f-c04c-4c62-9346-be0fe715464c', 'a009971a-692c-4f7d-b088-5f49681fccb1', 'Dorothy', 'Harris', '(555) 400-0017', NULL, 'dharris@email.com', 't'),
    ('7129aeb7-af25-43fd-9f1f-1245c9ff8e5c', '4c85707f-c04c-4c62-9346-be0fe715464c', 'ab190a94-6b09-4e9d-a9eb-87a1783ca1c3', 'George', 'Clark', '(555) 400-0018', NULL, 'gclark@email.com', 't'),
    ('ac1b0acc-c32f-4ef9-b517-6e5dc017a652', '4c85707f-c04c-4c62-9346-be0fe715464c', '1002eeac-9b16-4704-805d-b5f6be27209c', 'Helen', 'Lewis', '(555) 400-0019', NULL, 'hlewis@email.com', 't'),
    ('c22a2ed1-e193-4276-bc24-20cb5cf40925', '4c85707f-c04c-4c62-9346-be0fe715464c', 'fa3008d1-c720-4ba9-b549-4e8f1b42e609', 'Mark', 'Robinson', '(555) 400-0020', NULL, 'mrobinson@email.com', 't'),
    ('8f26e718-4233-4ae0-8bcc-141c4058461c', '4c85707f-c04c-4c62-9346-be0fe715464c', 'c43b35f5-170a-4729-8d3e-2ff4bc8c81ee', 'Syed Muhammad Ash-hadu', 'Faridi', '+923273621640', '', 'syedmuhammadashhadufaridi@gmail.com', 't'),
    ('1aeaab06-471d-439e-afcc-6cc94cd9e773', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'a01340b7-bf64-49f1-8e7d-964938dd491f', 'MARIA', 'KL', '03232644959', '', 'randombunnyhunter2@gmail.com', 't');


--
-- Data for Name: customer_notes; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.customer_notes (0 rows)
--

-- (no rows)


--
-- Data for Name: customer_tags; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.customer_tags (27 rows)
--

INSERT INTO public.customer_tags (company_id, customer_id, tag_id) VALUES
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '9bbaec87-6960-4e9c-a9fd-ae0f9cd1205f', 'd734bec4-dc94-49a7-b783-1dc89d19bf18'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '9bbaec87-6960-4e9c-a9fd-ae0f9cd1205f', '58c6863c-8450-4b03-aea9-67797851d26b'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'db18cc82-c265-4bc1-86da-536b04cb130a', 'ae1c0ff9-b628-4bae-8b5b-68f8fce569d1'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'd20cb914-c493-486d-b426-34f8cffee6b4', '37b8b324-7a08-4791-a3c1-8c19e120b1ce'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'd20cb914-c493-486d-b426-34f8cffee6b4', '97426a91-b8ab-4e54-bb4a-895b625ca9d3'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '43ecb3dd-6b94-4d6c-ac18-55d27c856447', '901aa618-69e6-4d1a-81ea-30953d20605e'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'd1971b6f-0fd1-4e63-9279-a2a998673cac', 'ae1c0ff9-b628-4bae-8b5b-68f8fce569d1'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '45b2c196-5068-4df9-90a1-7e01636d5a55', 'e06c89a4-1328-4bc2-b716-a00e4b15d1e4'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '45b2c196-5068-4df9-90a1-7e01636d5a55', '7cbeb244-62df-44f1-9ea9-28b680f24082'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '7f074219-8060-4fcc-a54c-8c928e4faf8f', 'ae1c0ff9-b628-4bae-8b5b-68f8fce569d1'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '21928886-bd09-4c7b-bd4b-8b06298eed49', '965de877-44d4-46db-95dc-52e6b5e499b5'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'ac8a5f4f-73de-4957-b9e2-0986a6776d4d', 'ae1c0ff9-b628-4bae-8b5b-68f8fce569d1'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '0c75e45a-b9ed-4dfb-8ba0-e0b75fe01d64', 'd734bec4-dc94-49a7-b783-1dc89d19bf18'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '0c75e45a-b9ed-4dfb-8ba0-e0b75fe01d64', 'ff08f15c-7064-482b-9ea8-b323a0b0c96e'),
    ('dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '5e62c798-3f59-4c39-a679-31c849f8f209', 'b41a825e-8d46-4d84-b4ae-374456e67f19'),
    ('dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '5e62c798-3f59-4c39-a679-31c849f8f209', 'de593832-955a-4f26-8d04-bdd4950a2642'),
    ('dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '5fda9858-a434-4d77-9308-86347a8ad48b', 'de593832-955a-4f26-8d04-bdd4950a2642'),
    ('3b08e91a-b804-4b8e-9040-b203846c1c59', 'a9e555ee-afc3-4c6b-b77a-234132076da2', '6bad422d-3ce4-4985-a375-3df1ae9474eb'),
    ('3b08e91a-b804-4b8e-9040-b203846c1c59', '3654f07f-ef5f-49de-ad6d-0effd3b18a64', 'f52a25ed-57c4-4e66-b6e2-d862a75a1939'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '00d9b3cd-0b53-4453-beaf-4dba24595c46', 'ae1c0ff9-b628-4bae-8b5b-68f8fce569d1'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'a009971a-692c-4f7d-b088-5f49681fccb1', 'ae1c0ff9-b628-4bae-8b5b-68f8fce569d1'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'ab190a94-6b09-4e9d-a9eb-87a1783ca1c3', 'ae1c0ff9-b628-4bae-8b5b-68f8fce569d1'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'ab190a94-6b09-4e9d-a9eb-87a1783ca1c3', '4cb38da7-620e-4e9f-9dc4-ff7e33ad22f3'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '1002eeac-9b16-4704-805d-b5f6be27209c', '050778a9-8b9c-4a5a-a944-684e28e9a25f'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '1002eeac-9b16-4704-805d-b5f6be27209c', '1023050b-deb1-4f5a-a526-209bb627cab2'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'fa3008d1-c720-4ba9-b549-4e8f1b42e609', '97426a91-b8ab-4e54-bb4a-895b625ca9d3'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'fa3008d1-c720-4ba9-b549-4e8f1b42e609', '4e6c28be-707e-4ba8-a243-f88816cebc5a');


--
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.customers (22 rows)
--

INSERT INTO public.customers (id, company_id, status, customer_type, source, parent_customer_id, payment_terms, tax_exempt, notes, created_at, updated_at, archived_at, archived_by, created_by, updated_by, owner_user_id) VALUES
    ('9bbaec87-6960-4e9c-a9fd-ae0f9cd1205f', '4c85707f-c04c-4c62-9346-be0fe715464c', 'active', 'residential', NULL, NULL, NULL, 'f', 'Prefers morning appointments. Has 2 dogs.', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL),
    ('db18cc82-c265-4bc1-86da-536b04cb130a', '4c85707f-c04c-4c62-9346-be0fe715464c', 'active', 'residential', NULL, NULL, NULL, 'f', '', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL),
    ('d20cb914-c493-486d-b426-34f8cffee6b4', '4c85707f-c04c-4c62-9346-be0fe715464c', 'active', 'residential', NULL, NULL, NULL, 'f', 'Renovation project ongoing through Q2', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL),
    ('43ecb3dd-6b94-4d6c-ac18-55d27c856447', '4c85707f-c04c-4c62-9346-be0fe715464c', 'active', 'residential', NULL, NULL, NULL, 'f', 'Insurance claim for pipe burst', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL),
    ('d1971b6f-0fd1-4e63-9279-a2a998673cac', '4c85707f-c04c-4c62-9346-be0fe715464c', 'active', 'residential', NULL, NULL, NULL, 'f', '', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL),
    ('45b2c196-5068-4df9-90a1-7e01636d5a55', '4c85707f-c04c-4c62-9346-be0fe715464c', 'active', 'residential', NULL, NULL, NULL, 'f', 'Outdoor kitchen project. Permit pending.', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL),
    ('7f074219-8060-4fcc-a54c-8c928e4faf8f', '4c85707f-c04c-4c62-9346-be0fe715464c', 'active', 'residential', NULL, NULL, NULL, 'f', '', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL),
    ('21928886-bd09-4c7b-bd4b-8b06298eed49', '4c85707f-c04c-4c62-9346-be0fe715464c', 'active', 'residential', NULL, NULL, NULL, 'f', 'Interested in water filtration', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL),
    ('ac8a5f4f-73de-4957-b9e2-0986a6776d4d', '4c85707f-c04c-4c62-9346-be0fe715464c', 'active', 'residential', NULL, NULL, NULL, 'f', '', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL),
    ('0c75e45a-b9ed-4dfb-8ba0-e0b75fe01d64', '4c85707f-c04c-4c62-9346-be0fe715464c', 'active', 'residential', NULL, NULL, NULL, 'f', 'Has annual service agreement', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL),
    ('5e62c798-3f59-4c39-a679-31c849f8f209', 'dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', 'active', 'residential', NULL, NULL, NULL, 'f', '', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL),
    ('5fda9858-a434-4d77-9308-86347a8ad48b', 'dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', 'active', 'residential', NULL, NULL, NULL, 'f', '', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL),
    ('a9e555ee-afc3-4c6b-b77a-234132076da2', '3b08e91a-b804-4b8e-9040-b203846c1c59', 'active', 'commercial', NULL, NULL, NULL, 'f', 'Rooftop unit - crane required', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL),
    ('3654f07f-ef5f-49de-ad6d-0effd3b18a64', '3b08e91a-b804-4b8e-9040-b203846c1c59', 'active', 'residential', NULL, NULL, NULL, 'f', '', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL),
    ('00d9b3cd-0b53-4453-beaf-4dba24595c46', '4c85707f-c04c-4c62-9346-be0fe715464c', 'inactive', 'residential', NULL, NULL, NULL, 'f', '', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL),
    ('163fd7ae-428f-4df3-aefc-14328b894f88', '4c85707f-c04c-4c62-9346-be0fe715464c', 'inactive', 'residential', NULL, NULL, NULL, 'f', 'Cancelled last job', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL),
    ('a009971a-692c-4f7d-b088-5f49681fccb1', '4c85707f-c04c-4c62-9346-be0fe715464c', 'active', 'residential', NULL, NULL, NULL, 'f', '', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL),
    ('1002eeac-9b16-4704-805d-b5f6be27209c', '4c85707f-c04c-4c62-9346-be0fe715464c', 'active', 'residential', NULL, NULL, NULL, 'f', '', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL),
    ('fa3008d1-c720-4ba9-b549-4e8f1b42e609', '4c85707f-c04c-4c62-9346-be0fe715464c', 'active', 'residential', NULL, NULL, NULL, 'f', 'Main line corroded - needs excavation.', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL),
    ('c43b35f5-170a-4729-8d3e-2ff4bc8c81ee', '4c85707f-c04c-4c62-9346-be0fe715464c', 'active', 'commercial', '', NULL, NULL, 'f', '', '2026-08-29 15:31:18.760768+00', '2026-08-29 15:31:18.760768+00', NULL, NULL, '12063947-0b9a-45f4-bec7-6f81c6443f1b', NULL, '12063947-0b9a-45f4-bec7-6f81c6443f1b'),
    ('ab190a94-6b09-4e9d-a9eb-87a1783ca1c3', '4c85707f-c04c-4c62-9346-be0fe715464c', 'lead', 'residential', NULL, NULL, NULL, 'f', 'Wants concentric venting', '2026-08-21 11:31:56.489544+00', '2026-08-29 15:33:32.284174+00', NULL, NULL, NULL, '12063947-0b9a-45f4-bec7-6f81c6443f1b', NULL),
    ('a01340b7-bf64-49f1-8e7d-964938dd491f', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'active', 'residential', 'Walk-in', NULL, NULL, 'f', '', '2026-09-03 20:23:19.194938+00', '2026-09-03 20:23:19.194938+00', NULL, NULL, '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', NULL, '91823e01-9e7c-427f-a8c7-a8dcffbb2b21');


--
-- Data for Name: document_counters; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.document_counters (1 row)
--

INSERT INTO public.document_counters (company_id, kind, year, last_value) VALUES
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'estimate', '2026', '7');


--
-- Data for Name: documents; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.documents (2 rows)
--

INSERT INTO public.documents (id, company_id, file_id, job_id, uploaded_by, created_at) VALUES
    ('4324e6d3-d92b-45a7-a444-c7bfcfc17f32', '4c85707f-c04c-4c62-9346-be0fe715464c', '9d3a6fed-99a8-4e48-a615-cc8d4e4ba2c3', 'fd59fa77-5fda-4c0b-92cc-c9d9a2f3d384', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '2026-08-29 14:52:58.165243+00'),
    ('5fe5175d-d981-413f-b539-02ab5350c45a', '85f8952f-bbbd-4aab-9763-0848b1f3010e', '0c065600-ec20-44e9-bed6-48bb311c5684', '55a0f13a-f09e-4436-aa68-ff5d897ec0e2', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '2026-09-04 01:17:22.262516+00');


--
-- Data for Name: email_templates; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.email_templates (5 rows)
--

INSERT INTO public.email_templates (id, company_id, name, subject, body, type) VALUES
    ('cffed282-10d5-4d11-afdf-1cfb8812e786', '4c85707f-c04c-4c62-9346-be0fe715464c', 'Invoice Notification', 'Invoice {invoiceNumber} from {companyName}', 'Dear {customerName},

Please find invoice {invoiceNumber}.', 'invoice'),
    ('1ee1476a-ff7c-4736-84ad-dd131d78bbcf', '4c85707f-c04c-4c62-9346-be0fe715464c', 'Appointment Reminder', 'Appointment Reminder - {jobTitle}', 'Dear {customerName},

This is a reminder of your upcoming appointment on {scheduledDate} {scheduledTime}.', 'appointment'),
    ('f90dfb71-3f23-412f-bf4c-edb23a244750', '4c85707f-c04c-4c62-9346-be0fe715464c', 'Follow-Up Survey', 'How was your experience with {companyName}?', 'Dear {customerName},

Thank you for choosing {companyName}!', 'follow_up'),
    ('48aad7ae-c53d-4ddf-b7ad-896aebb3f062', '4c85707f-c04c-4c62-9346-be0fe715464c', 'Estimate', 'Estimate {estimateNumber} from {companyName}', 'Dear {customerName},

Please review estimate {estimateNumber}.', 'estimate'),
    ('4843cb12-0817-4a17-bb23-a4d9835ed3bb', '4c85707f-c04c-4c62-9346-be0fe715464c', 'Customer note', 'A message from {companyName}', 'Dear {customerName},

{message}', 'customer_communication');


--
-- Data for Name: email_verification_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.email_verification_tokens (0 rows)
--

-- (no rows)


--
-- Data for Name: estimate_assignees; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.estimate_assignees (2 rows)
--

INSERT INTO public.estimate_assignees (company_id, estimate_id, member_id) VALUES
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'a1c79128-fee4-4c4e-b2f6-aad65903b73b', '533f3193-77ad-40fd-a0a0-37b98112509e'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'a1c79128-fee4-4c4e-b2f6-aad65903b73b', 'a6c7a2ef-7e00-4b22-b95b-2b0a4406cb2e');


--
-- Data for Name: estimate_follow_up_tasks; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.estimate_follow_up_tasks (0 rows)
--

-- (no rows)


--
-- Data for Name: estimate_line_items; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.estimate_line_items (16 rows)
--

INSERT INTO public.estimate_line_items (id, company_id, estimate_id, description, quantity, unit_price, total) VALUES
    ('ebf6b3f5-a6c7-454d-bd0b-0c1388aa54db', '4c85707f-c04c-4c62-9346-be0fe715464c', '27e6dd34-bb06-42cf-bf90-6e3bb9135ef0', 'Bathroom remodel - rough-in plumbing', '8.00', '150.00', '1200.00'),
    ('ed691ca2-f691-46a0-8095-45032e8081d5', '4c85707f-c04c-4c62-9346-be0fe715464c', '27e6dd34-bb06-42cf-bf90-6e3bb9135ef0', 'PEX tubing & fittings', '1.00', '350.00', '350.00'),
    ('75f0edaf-7ff7-4f42-bd8c-aa296fc09de6', '4c85707f-c04c-4c62-9346-be0fe715464c', '27e6dd34-bb06-42cf-bf90-6e3bb9135ef0', 'Fixtures', '1.00', '850.00', '850.00'),
    ('ac0c4cd0-5d88-4e6d-bf27-b79c928dba2b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'f1b9e537-cd47-46d4-a72d-28444a241997', 'Gas line installation - labor', '6.00', '175.00', '1050.00'),
    ('34d18667-4610-4d0f-85df-089186e641cb', '4c85707f-c04c-4c62-9346-be0fe715464c', 'f1b9e537-cd47-46d4-a72d-28444a241997', 'Black iron pipe & fittings', '1.00', '420.00', '420.00'),
    ('1feff522-0b85-47e3-b9e3-a2e440e24703', '4c85707f-c04c-4c62-9346-be0fe715464c', 'd5aebda9-22f8-48a7-9894-5d222b2f86ce', 'Tankless water heater installation - labor', '6.00', '150.00', '900.00'),
    ('2dd621f0-e70c-4940-abdc-afde2a2ae8f6', '4c85707f-c04c-4c62-9346-be0fe715464c', 'd5aebda9-22f8-48a7-9894-5d222b2f86ce', 'Rinnai RU199iN tankless unit', '1.00', '1650.00', '1650.00'),
    ('06fadea1-71ea-488c-a605-767656357a98', '4c85707f-c04c-4c62-9346-be0fe715464c', 'bb840271-ccd3-4759-a0e0-ca24b58d7f75', 'Main line excavation & replacement', '10.00', '200.00', '2000.00'),
    ('c83778e4-d519-4d7e-98fb-295f83a10d4d', '4c85707f-c04c-4c62-9346-be0fe715464c', 'bb840271-ccd3-4759-a0e0-ca24b58d7f75', '1" copper pipe 50ft', '1.00', '450.00', '450.00'),
    ('bf2fe06d-ab87-4a7a-a8da-21be3f251f52', '4c85707f-c04c-4c62-9346-be0fe715464c', '5b3ec90b-6fbd-402f-9af5-77041f64cfbc', 'Whole house re-pipe - labor', '16.00', '150.00', '2400.00'),
    ('5edcc222-5153-4790-87f3-463508f5dae4', '4c85707f-c04c-4c62-9346-be0fe715464c', 'b2772cbd-d2c2-4cbc-82c9-f93a0f80946f', 'Water softener installation - labor', '4.00', '125.00', '500.00'),
    ('ea619d2c-fa53-4862-8c82-1ca019e76cc1', '4c85707f-c04c-4c62-9346-be0fe715464c', 'b2772cbd-d2c2-4cbc-82c9-f93a0f80946f', 'Water softener unit', '1.00', '650.00', '650.00'),
    ('871b776c-24d0-49e8-84eb-40efe104b22d', 'dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', 'e88919bc-5e30-4a1f-903a-81b6bb500647', 'Panel upgrade 200A - labor', '8.00', '175.00', '1400.00'),
    ('06bbabb3-0990-4d3a-bd0d-07cb0ab239ef', 'dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', 'e88919bc-5e30-4a1f-903a-81b6bb500647', '200A panel & main breaker', '1.00', '385.00', '385.00'),
    ('6f3a2673-5796-4ce7-8939-94d86498f16d', '4c85707f-c04c-4c62-9346-be0fe715464c', 'a1c79128-fee4-4c4e-b2f6-aad65903b73b', 'cdsdcs', '5.00', '50.00', '250.00'),
    ('153c909d-2d2b-41a0-8161-19ab5d5bdbe4', '4c85707f-c04c-4c62-9346-be0fe715464c', 'a1c79128-fee4-4c4e-b2f6-aad65903b73b', 'vsds', '4.00', '10.00', '40.00');


--
-- Data for Name: estimates; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.estimates (8 rows)
--

INSERT INTO public.estimates (id, company_id, customer_id, address_id, estimate_number, status, converted_job_id, category, description, notes, note_to_customer, notes_for_techs, po_number, referral_source, opportunity_rating, opportunity_owner_id, requested_on, arrival_start, arrival_end, estimated_duration_hours, valid_until, tax_rate, subtotal, tax, total, created_at, updated_at, created_by, updated_by) VALUES
    ('27e6dd34-bb06-42cf-bf90-6e3bb9135ef0', '4c85707f-c04c-4c62-9346-be0fe715464c', 'd20cb914-c493-486d-b426-34f8cffee6b4', '50449ee5-7c17-452e-9e1e-285fc79271b0', 'EST-2026-0001', 'approved', NULL, 'plumbing', NULL, 'Coordinate with tile contractor.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-09-20', '8.00', '2400.00', '192.00', '2592.00', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL),
    ('d5aebda9-22f8-48a7-9894-5d222b2f86ce', '4c85707f-c04c-4c62-9346-be0fe715464c', 'ab190a94-6b09-4e9d-a9eb-87a1783ca1c3', 'd5c8bbd7-5404-4336-94ba-4e334fbbbc56', 'EST-2026-0003', 'draft', NULL, 'plumbing', NULL, 'Customer prefers concentric venting.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-09-20', '8.00', '2550.00', '204.00', '2754.00', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL),
    ('bb840271-ccd3-4759-a0e0-ca24b58d7f75', '4c85707f-c04c-4c62-9346-be0fe715464c', 'fa3008d1-c720-4ba9-b549-4e8f1b42e609', 'dbfa3f3f-5fd5-409b-a79f-c0c47a0681ee', 'EST-2026-0004', 'approved', NULL, 'plumbing', NULL, 'Call 811 before digging.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-09-20', '8.00', '2450.00', '196.00', '2646.00', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL),
    ('5b3ec90b-6fbd-402f-9af5-77041f64cfbc', '4c85707f-c04c-4c62-9346-be0fe715464c', '7f074219-8060-4fcc-a54c-8c928e4faf8f', '7ae814e3-0d58-496e-92ec-9fca7595cc05', 'EST-2026-0005', 'rejected', NULL, 'plumbing', NULL, 'Customer felt price was too high.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-09-20', '8.00', '2400.00', '192.00', '2592.00', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL),
    ('b2772cbd-d2c2-4cbc-82c9-f93a0f80946f', '4c85707f-c04c-4c62-9346-be0fe715464c', '21928886-bd09-4c7b-bd4b-8b06298eed49', 'd0e6b353-a383-4ce5-acc3-cdf083c724a6', 'EST-2026-0006', 'converted', '3c206779-04bc-4633-839c-1f6e1cc5f135', 'plumbing', NULL, 'Converted to job.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-09-20', '8.00', '1150.00', '92.00', '1242.00', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL),
    ('e88919bc-5e30-4a1f-903a-81b6bb500647', 'dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '5e62c798-3f59-4c39-a679-31c849f8f209', 'b718b398-e0a1-4ded-9985-1cca358818c6', 'EST-2026-0001', 'converted', '74251aee-f1e4-4b29-93e1-08cacb3295d0', 'plumbing', NULL, 'Converted to job.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-09-20', '8.00', '1785.00', '142.80', '1927.80', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL),
    ('a1c79128-fee4-4c4e-b2f6-aad65903b73b', '4c85707f-c04c-4c62-9346-be0fe715464c', '163fd7ae-428f-4df3-aefc-14328b894f88', '244a3051-709f-4ced-983d-6e7c7bc2c912', 'EST-2026-0007', 'draft', NULL, 'plumbing', 'vdsvdf', '', NULL, '', '', 'Referral', '2', NULL, '2026-08-29', '11:05:00', '20:05:00', '2.00', '2026-09-01', '7.00', '290.00', '20.30', '310.30', '2026-08-29 15:08:10.07962+00', '2026-08-29 15:08:48.309261+00', '12063947-0b9a-45f4-bec7-6f81c6443f1b', NULL),
    ('f1b9e537-cd47-46d4-a72d-28444a241997', '4c85707f-c04c-4c62-9346-be0fe715464c', '45b2c196-5068-4df9-90a1-7e01636d5a55', 'a1e9762a-41bd-4b84-8f63-3c613635cc5b', 'EST-2026-0002', 'converted', '643ee29a-a887-4308-bd6b-c2a7d7e6bbca', 'plumbing', NULL, 'Outdoor kitchen gas line.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-09-20', '8.00', '1470.00', '117.60', '1587.60', '2026-08-21 11:31:56.489544+00', '2026-08-29 15:20:19.498281+00', NULL, NULL);


--
-- Data for Name: files; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.files (5 rows)
--

INSERT INTO public.files (id, company_id, storage_key, mime_type, size_bytes, original_name, uploaded_by, created_at) VALUES
    ('9d3a6fed-99a8-4e48-a615-cc8d4e4ba2c3', '4c85707f-c04c-4c62-9346-be0fe715464c', '4c85707f-c04c-4c62-9346-be0fe715464c/47ac2e97e1354cc93a4e73a17e6d9a23', 'image/jpeg', '139618', '715494671_18097783693951053_8103112928259464919_n.jpg.jpeg', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '2026-08-29 14:52:57.331041+00'),
    ('2fa2d16f-125a-4a0f-b958-897d74e2e7fd', '85f8952f-bbbd-4aab-9763-0848b1f3010e', '85f8952f-bbbd-4aab-9763-0848b1f3010e/9009ba1e6d6283d848555579ecc5003c', 'application/pdf', '520159', 'List-of-Edits-8-27-26-Solutions.pdf', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '2026-09-03 00:56:28.449564+00'),
    ('a4183200-3745-4e7e-8a17-af07dd9e9930', '85f8952f-bbbd-4aab-9763-0848b1f3010e', '85f8952f-bbbd-4aab-9763-0848b1f3010e/8fc693286583eca3f338ca20177ebbc3', 'image/jpeg', '249017', 'Man_in_business_attire_2K_202608021407.jpeg', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '2026-09-04 01:16:30.929722+00'),
    ('0c065600-ec20-44e9-bed6-48bb311c5684', '85f8952f-bbbd-4aab-9763-0848b1f3010e', '85f8952f-bbbd-4aab-9763-0848b1f3010e/2fbbef0a50e8fb8b5f868b1cef4d0ef6', 'image/jpeg', '2758074', 'Man_in_business_attire_2K_202608021512.jpeg', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '2026-09-04 01:17:21.541879+00'),
    ('3334e547-8353-4bdd-8444-c82edd2b7bea', '85f8952f-bbbd-4aab-9763-0848b1f3010e', '85f8952f-bbbd-4aab-9763-0848b1f3010e/24b6f8525671724c2a109cd512f30e1c', 'image/jpeg', '249017', 'Man_in_business_attire_2K_202608021407.jpeg', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '2026-09-04 01:17:52.369756+00');


--
-- Data for Name: follow_ups; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.follow_ups (0 rows)
--

-- (no rows)


--
-- Data for Name: inventory_items; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.inventory_items (12 rows)
--

INSERT INTO public.inventory_items (id, company_id, name, sku, category, quantity, min_stock, unit_price) VALUES
    ('ec19070e-b14b-45eb-a471-cad3f400012e', '4c85707f-c04c-4c62-9346-be0fe715464c', 'Copper Pipe 3/4"', 'CP-075', 'Pipes', '150', '50', '8.50'),
    ('564e3573-5381-486b-95b3-07f80f69912f', '4c85707f-c04c-4c62-9346-be0fe715464c', 'PEX Tubing 1/2" (100ft)', 'PEX-050', 'Pipes', '25', '10', '45.00'),
    ('28f78cfb-d411-4e30-a075-1e805f949840', '4c85707f-c04c-4c62-9346-be0fe715464c', 'SharkBite Fitting 3/4"', 'SB-075', 'Fittings', '8', '20', '12.75'),
    ('2b48357c-6d65-4611-a553-1b455a0881ec', '4c85707f-c04c-4c62-9346-be0fe715464c', 'Pipe Solder (1lb)', 'SOL-001', 'Supplies', '30', '15', '15.00'),
    ('767c1bda-f16d-44a3-850e-1ecbc2cadb90', '4c85707f-c04c-4c62-9346-be0fe715464c', 'Wax Ring w/ Horn', 'WR-001', 'Toilet Parts', '45', '20', '4.50'),
    ('aaba7526-7284-426a-848d-6767e55c2c43', '4c85707f-c04c-4c62-9346-be0fe715464c', 'Supply Line 3/8"x12"', 'SL-312', 'Supplies', '60', '25', '6.25'),
    ('e67b9f99-2b3a-45be-9571-cc6043e8fb54', '4c85707f-c04c-4c62-9346-be0fe715464c', 'Gas Flex Line 3/4"', 'GFL-075', 'Gas', '12', '8', '22.00'),
    ('79c4467d-9288-4644-9637-ffacb4c01a50', '4c85707f-c04c-4c62-9346-be0fe715464c', 'Drain Snake 25ft', 'DS-025', 'Tools', '5', '3', '89.00'),
    ('7cacbda9-e721-48e5-831d-030e275c39ac', '4c85707f-c04c-4c62-9346-be0fe715464c', 'Bio-Clean Solution (2lb)', 'BC-002', 'Chemicals', '3', '10', '55.00'),
    ('03577251-3e44-4c5e-af6b-cbf34eb6f081', '4c85707f-c04c-4c62-9346-be0fe715464c', 'Toilet Flange PVC', 'TF-PVC', 'Toilet Parts', '35', '15', '7.50'),
    ('8babc14a-1aa6-4de1-8ad2-dd0bdd46c599', 'dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '200A Main Breaker Panel', 'MB-200', 'Panels', '3', '2', '385.00'),
    ('5b0d4bd3-c7d8-4470-9462-4bcb8aa945b4', 'dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '6 AWG Wire (100ft)', 'W6-100', 'Wire', '15', '5', '125.00');


--
-- Data for Name: inventory_movements; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.inventory_movements (0 rows)
--

-- (no rows)


--
-- Data for Name: invitations; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.invitations (5 rows)
--

INSERT INTO public.invitations (id, company_id, email, name, role, token_hash, invited_by, expires_at, accepted_at, created_at) VALUES
    ('55bfa728-a3ad-4ae3-9413-fe44aed51102', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'rohtiqlabs@gmail.com', 'ashhadu', 'office', 'fae3d33b8e62c2bca350324928501177af6eca06f57ce3678cf1ba8ea95f121e', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '2026-09-10 00:49:52.774198+00', NULL, '2026-09-03 00:49:52.774198+00'),
    ('6cc8eed9-eebc-449a-963d-feae1bb2c2c6', '4c85707f-c04c-4c62-9346-be0fe715464c', 'syedmuhammadashhadufaridi@gmail.com', 'ashhadu', 'office', '05f0d911cc0c7c3544c62ef1fd34199c724f1399400e2ee1a41068271a596833', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '2026-09-10 01:53:16.770064+00', NULL, '2026-09-03 01:53:16.770064+00'),
    ('1ee1f81d-1f4e-42bd-909c-3c37323971e6', '4c85707f-c04c-4c62-9346-be0fe715464c', 'rohtiqlabs@gmail.com', 'ashhadu', 'office', '36eed7a495f21d4cbd1fa6286c5ffce556b845d7cf674d1601ce257796eca09a', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '2026-09-10 01:55:17.346054+00', NULL, '2026-09-03 01:55:17.346054+00'),
    ('d78daeec-051f-48a3-8936-2750ee2bd478', '4c85707f-c04c-4c62-9346-be0fe715464c', 'syedmuhammadashhadufaridi@gmail.com', 'ashhadu faridi', 'owner', '551a33ca5387c3ae0e8cda827c6dc558efdd803543df605c1804cddfff2714d6', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '2026-09-10 02:25:18.255057+00', NULL, '2026-09-03 02:25:18.255057+00'),
    ('b1e1413a-eee9-45dc-b099-6521a94aa831', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'randombunnhunter2@gmail.com', 'ashjhadu', 'field_worker', '3f2ed5f1aa11e04ba9615f1d384b004826b00a4e91cb0f61af347508401cdd2b', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '2026-09-10 22:42:13.934952+00', NULL, '2026-09-03 22:42:13.934952+00');


--
-- Data for Name: invoice_line_items; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.invoice_line_items (16 rows)
--

INSERT INTO public.invoice_line_items (id, company_id, invoice_id, description, quantity, unit_price, total) VALUES
    ('2bf2b3cb-4605-4b02-ae30-6584123cdf10', '4c85707f-c04c-4c62-9346-be0fe715464c', '4db3ed8d-e4d6-4e68-8f3e-8bdcbc3a6398', 'Emergency pipe repair - labor', '3.00', '150.00', '450.00'),
    ('463ac020-9887-4ab9-8e18-436c29051d64', '4c85707f-c04c-4c62-9346-be0fe715464c', '4db3ed8d-e4d6-4e68-8f3e-8bdcbc3a6398', 'Copper pipe 3/4"', '10.00', '8.50', '85.00'),
    ('659a62cb-c45b-4306-893a-9403f556869d', '4c85707f-c04c-4c62-9346-be0fe715464c', '4db3ed8d-e4d6-4e68-8f3e-8bdcbc3a6398', 'Emergency call-out fee', '1.00', '315.00', '315.00'),
    ('993cf1e0-16cc-4968-a58c-57d7380599e8', '4c85707f-c04c-4c62-9346-be0fe715464c', 'a9acbf24-e7fa-4402-a113-db3cae7bbb3b', 'Leak detection service', '3.00', '125.00', '375.00'),
    ('4250882b-7953-4c69-a1c0-6256071c6ba7', '4c85707f-c04c-4c62-9346-be0fe715464c', 'a9acbf24-e7fa-4402-a113-db3cae7bbb3b', 'Equipment rental', '1.00', '50.00', '50.00'),
    ('fd37b985-8679-466f-8ad1-08ced1ff76b3', '4c85707f-c04c-4c62-9346-be0fe715464c', '7a146e7d-a396-4e05-ac63-d126936e21f5', 'Toilet replacement - labor', '2.00', '125.00', '250.00'),
    ('8d830188-9ec9-4210-b9a6-5614a46bba42', '4c85707f-c04c-4c62-9346-be0fe715464c', '7a146e7d-a396-4e05-ac63-d126936e21f5', 'Low-flow toilet', '1.00', '110.00', '110.00'),
    ('82798df2-b63e-40b2-a2d3-03d5c13aef77', '4c85707f-c04c-4c62-9346-be0fe715464c', '7a146e7d-a396-4e05-ac63-d126936e21f5', 'Wax ring & supply line', '1.00', '20.00', '20.00'),
    ('076bbe00-4032-4a9e-85ed-9c036eccbba2', '4c85707f-c04c-4c62-9346-be0fe715464c', '1663f598-04e5-4632-95be-35f8d15c4eb1', 'Water heater replacement - labor', '4.00', '150.00', '600.00'),
    ('af2b9aff-0409-4773-9f51-dbf32e362d68', '4c85707f-c04c-4c62-9346-be0fe715464c', '1663f598-04e5-4632-95be-35f8d15c4eb1', '50-gal gas water heater', '1.00', '550.00', '550.00'),
    ('a1097001-6e30-4067-a509-fb129504874b', '4c85707f-c04c-4c62-9346-be0fe715464c', '1663f598-04e5-4632-95be-35f8d15c4eb1', 'Fittings & materials', '1.00', '50.00', '50.00'),
    ('10e0cf9f-3570-4fb3-ab20-23da8576cfe6', 'dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '246d9a11-5243-42c3-9b56-6ad7243a9c5a', 'Panel upgrade - labor', '8.00', '175.00', '1400.00'),
    ('7eca7443-f0f6-4edf-9eb6-cf82060e5a96', 'dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '246d9a11-5243-42c3-9b56-6ad7243a9c5a', '200A panel', '1.00', '385.00', '385.00'),
    ('e266273e-852b-44d6-b6d1-05dc386017f2', 'dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '246d9a11-5243-42c3-9b56-6ad7243a9c5a', 'Wire & breakers', '1.00', '1415.00', '1415.00'),
    ('9ba64616-b3fa-4669-8b0e-8a4c4ed3da76', '3b08e91a-b804-4b8e-9040-b203846c1c59', 'f75c1bd5-b8e8-4a72-b89c-81380ca9fcec', 'Furnace repair - labor', '2.00', '125.00', '250.00'),
    ('29f019dd-b9b9-48f7-830b-6553cccdd87c', '3b08e91a-b804-4b8e-9040-b203846c1c59', 'f75c1bd5-b8e8-4a72-b89c-81380ca9fcec', 'Igniter & flame sensor', '1.00', '100.00', '100.00');


--
-- Data for Name: invoices; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.invoices (6 rows)
--

INSERT INTO public.invoices (id, company_id, customer_id, job_id, invoice_number, status, subtotal, tax, total, due_date, created_at, paid_at, created_by, updated_by) VALUES
    ('4db3ed8d-e4d6-4e68-8f3e-8bdcbc3a6398', '4c85707f-c04c-4c62-9346-be0fe715464c', '43ecb3dd-6b94-4d6c-ac18-55d27c856447', 'fd59fa77-5fda-4c0b-92cc-c9d9a2f3d384', 'INV-2026-0001', 'paid', '850.00', '68.00', '918.00', '2026-09-19', '2026-08-20 11:32:57.967+00', '2026-08-20 11:32:57.967+00', NULL, NULL),
    ('a9acbf24-e7fa-4402-a113-db3cae7bbb3b', '4c85707f-c04c-4c62-9346-be0fe715464c', '0c75e45a-b9ed-4dfb-8ba0-e0b75fe01d64', '2e83f4b4-ff5d-407a-bec9-445599be8ef4', 'INV-2026-0002', 'sent', '425.00', '34.00', '459.00', '2026-09-17', '2026-08-18 11:32:59.155+00', NULL, NULL, NULL),
    ('7a146e7d-a396-4e05-ac63-d126936e21f5', '4c85707f-c04c-4c62-9346-be0fe715464c', '00d9b3cd-0b53-4453-beaf-4dba24595c46', '4d8b3fae-b3f7-49fa-bd08-a89ba75e7711', 'INV-2026-0003', 'paid', '380.00', '30.40', '410.40', '2026-09-15', '2026-08-16 11:33:00.171+00', '2026-08-16 11:33:00.171+00', NULL, NULL),
    ('1663f598-04e5-4632-95be-35f8d15c4eb1', '4c85707f-c04c-4c62-9346-be0fe715464c', '9bbaec87-6960-4e9c-a9fd-ae0f9cd1205f', 'b9103a7d-9e23-4803-80d0-d33ef6acf30f', 'INV-2026-0004', 'draft', '1200.00', '96.00', '1296.00', '2026-09-20', '2026-08-21 11:33:01.352+00', NULL, NULL, NULL),
    ('246d9a11-5243-42c3-9b56-6ad7243a9c5a', 'dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '5e62c798-3f59-4c39-a679-31c849f8f209', '74251aee-f1e4-4b29-93e1-08cacb3295d0', 'INV-2026-0001', 'draft', '3200.00', '256.00', '3456.00', '2026-09-20', '2026-08-21 11:33:02.539+00', NULL, NULL, NULL),
    ('f75c1bd5-b8e8-4a72-b89c-81380ca9fcec', '3b08e91a-b804-4b8e-9040-b203846c1c59', '3654f07f-ef5f-49de-ad6d-0effd3b18a64', 'b2b6fd43-e0ba-469f-a59d-a1c83a8389c7', 'INV-2026-0001', 'overdue', '350.00', '28.00', '378.00', '2026-08-18', '2026-08-11 11:33:03.725+00', NULL, NULL, NULL);


--
-- Data for Name: job_assignees; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.job_assignees (15 rows)
--

INSERT INTO public.job_assignees (company_id, job_id, member_id) VALUES
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'b9103a7d-9e23-4803-80d0-d33ef6acf30f', 'd52930c5-f38e-4dad-a31d-9cd9374763c1'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'c46532dc-23ae-4c5d-b9ee-94bc2f119a42', 'd3604817-4f1c-4c8b-85ba-13c9f1272144'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'fd59fa77-5fda-4c0b-92cc-c9d9a2f3d384', 'eac8241e-36a0-4f1e-b794-ecd137631ec8'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '54ebd243-11c6-41de-9383-392d73d3f1b6', 'd3604817-4f1c-4c8b-85ba-13c9f1272144'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'b8270447-c605-4b6f-bdbc-4988874af0fd', 'a6c7a2ef-7e00-4b22-b95b-2b0a4406cb2e'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '3c206779-04bc-4633-839c-1f6e1cc5f135', 'd52930c5-f38e-4dad-a31d-9cd9374763c1'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '2e83f4b4-ff5d-407a-bec9-445599be8ef4', 'eac8241e-36a0-4f1e-b794-ecd137631ec8'),
    ('dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '74251aee-f1e4-4b29-93e1-08cacb3295d0', 'abb1b14c-5eea-4c14-b759-8dbe6a04b6a1'),
    ('dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', 'fa2fa5fd-d94a-462d-ba89-2a5aac08ef2a', 'f276e0e6-bace-4cf4-9945-dbcd1d3c54dd'),
    ('3b08e91a-b804-4b8e-9040-b203846c1c59', 'b2b6fd43-e0ba-469f-a59d-a1c83a8389c7', 'b03de3f9-ee11-4c44-8897-9ef85e2bdee0'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '4d8b3fae-b3f7-49fa-bd08-a89ba75e7711', 'a6c7a2ef-7e00-4b22-b95b-2b0a4406cb2e'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '0dadcf70-8fb6-40d8-8fc2-7b3b4998320a', 'eac8241e-36a0-4f1e-b794-ecd137631ec8'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'f23d3012-bb71-4880-8ffb-df6196d7c031', 'd3604817-4f1c-4c8b-85ba-13c9f1272144'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '6c57086d-71c2-49cd-941f-c42d548a1368', '6c59c18f-8d07-44ec-9b76-08ff14ae9578'),
    ('85f8952f-bbbd-4aab-9763-0848b1f3010e', '55a0f13a-f09e-4436-aa68-ff5d897ec0e2', '017f3007-ce3f-408f-b088-40801b595557');


--
-- Data for Name: job_images; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.job_images (2 rows)
--

INSERT INTO public.job_images (id, company_id, job_id, file_id) VALUES
    ('7076b06b-6b75-47a2-b9bc-4546fed68ee4', '85f8952f-bbbd-4aab-9763-0848b1f3010e', '55a0f13a-f09e-4436-aa68-ff5d897ec0e2', 'a4183200-3745-4e7e-8a17-af07dd9e9930'),
    ('7d6ca301-bc0d-4f1e-ae64-1c0762498687', '85f8952f-bbbd-4aab-9763-0848b1f3010e', '55a0f13a-f09e-4436-aa68-ff5d897ec0e2', '3334e547-8353-4bdd-8444-c82edd2b7bea');


--
-- Data for Name: job_line_items; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.job_line_items (18 rows)
--

INSERT INTO public.job_line_items (id, company_id, job_id, group_name, description, warehouse, quantity, unit_price, total, taxable) VALUES
    ('20491cee-7cc6-4666-9854-0e77dcc47bcf', '4c85707f-c04c-4c62-9346-be0fe715464c', 'b9103a7d-9e23-4803-80d0-d33ef6acf30f', NULL, 'Water heater replacement - labor', NULL, '4.00', '150.00', '600.00', 't'),
    ('fe3912b9-ea5b-4f5d-a9ff-effeae51057c', '4c85707f-c04c-4c62-9346-be0fe715464c', 'b9103a7d-9e23-4803-80d0-d33ef6acf30f', NULL, '50-gal gas water heater', NULL, '1.00', '550.00', '550.00', 't'),
    ('dfe8e448-01ab-4427-b347-f1a4d7b2b867', '4c85707f-c04c-4c62-9346-be0fe715464c', 'b9103a7d-9e23-4803-80d0-d33ef6acf30f', NULL, 'Fittings & materials', NULL, '1.00', '50.00', '50.00', 't'),
    ('4a5d7146-3674-4851-9180-7facabbd7209', '4c85707f-c04c-4c62-9346-be0fe715464c', 'fd59fa77-5fda-4c0b-92cc-c9d9a2f3d384', NULL, 'Emergency pipe repair - labor', NULL, '3.00', '150.00', '450.00', 't'),
    ('a559e810-6c8c-4d19-b86f-23a3a2af08a9', '4c85707f-c04c-4c62-9346-be0fe715464c', 'fd59fa77-5fda-4c0b-92cc-c9d9a2f3d384', NULL, 'Copper pipe 3/4"', NULL, '10.00', '8.50', '85.00', 't'),
    ('f8082790-2c43-4660-a193-ca1082df621b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'fd59fa77-5fda-4c0b-92cc-c9d9a2f3d384', NULL, 'Emergency call-out fee', NULL, '1.00', '315.00', '315.00', 't'),
    ('26696038-5139-48b5-8a02-876823ff6c04', '4c85707f-c04c-4c62-9346-be0fe715464c', '2e83f4b4-ff5d-407a-bec9-445599be8ef4', NULL, 'Leak detection service', NULL, '3.00', '125.00', '375.00', 't'),
    ('21008150-92a7-4f14-8de0-d951aa45fd58', '4c85707f-c04c-4c62-9346-be0fe715464c', '2e83f4b4-ff5d-407a-bec9-445599be8ef4', NULL, 'Equipment rental', NULL, '1.00', '50.00', '50.00', 't'),
    ('f2399fc4-b0ce-482d-99d8-fa5fb45d7967', '4c85707f-c04c-4c62-9346-be0fe715464c', '4d8b3fae-b3f7-49fa-bd08-a89ba75e7711', NULL, 'Toilet replacement - labor', NULL, '2.00', '125.00', '250.00', 't'),
    ('fb5b145b-fb03-4f15-9c88-2f9b1f557e95', '4c85707f-c04c-4c62-9346-be0fe715464c', '4d8b3fae-b3f7-49fa-bd08-a89ba75e7711', NULL, 'Low-flow toilet', NULL, '1.00', '110.00', '110.00', 't'),
    ('71c1aadf-7a31-4d9d-9983-9e8a485e5ec2', '4c85707f-c04c-4c62-9346-be0fe715464c', '4d8b3fae-b3f7-49fa-bd08-a89ba75e7711', NULL, 'Wax ring & supply line', NULL, '1.00', '20.00', '20.00', 't'),
    ('dd356d6d-f3dd-435e-af52-3ce67b158579', 'dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '74251aee-f1e4-4b29-93e1-08cacb3295d0', NULL, 'Panel upgrade - labor', NULL, '8.00', '175.00', '1400.00', 't'),
    ('b499873e-333d-4c6f-b736-3b029e95370c', 'dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '74251aee-f1e4-4b29-93e1-08cacb3295d0', NULL, '200A panel', NULL, '1.00', '385.00', '385.00', 't'),
    ('9a9fa53b-09e0-468c-98e1-d2718d9fa695', 'dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '74251aee-f1e4-4b29-93e1-08cacb3295d0', NULL, 'Wire & breakers', NULL, '1.00', '1415.00', '1415.00', 't'),
    ('eaa78cea-229b-489f-93e3-b86d018e873d', '3b08e91a-b804-4b8e-9040-b203846c1c59', 'b2b6fd43-e0ba-469f-a59d-a1c83a8389c7', NULL, 'Furnace repair - labor', NULL, '2.00', '125.00', '250.00', 't'),
    ('d5d3c986-4236-4e93-ba14-669714fbec1b', '3b08e91a-b804-4b8e-9040-b203846c1c59', 'b2b6fd43-e0ba-469f-a59d-a1c83a8389c7', NULL, 'Igniter & flame sensor', NULL, '1.00', '100.00', '100.00', 't'),
    ('fec77a69-0c1b-4f65-a2cd-9323b479b098', '4c85707f-c04c-4c62-9346-be0fe715464c', '643ee29a-a887-4308-bd6b-c2a7d7e6bbca', NULL, 'Gas line installation - labor', NULL, '6.00', '175.00', '1050.00', 't'),
    ('080496a3-677e-4bca-a423-ea5a22c9d30c', '4c85707f-c04c-4c62-9346-be0fe715464c', '643ee29a-a887-4308-bd6b-c2a7d7e6bbca', NULL, 'Black iron pipe & fittings', NULL, '1.00', '420.00', '420.00', 't');


--
-- Data for Name: job_materials; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.job_materials (6 rows)
--

INSERT INTO public.job_materials (id, company_id, job_id, inventory_item_id, name, quantity) VALUES
    ('c55dbeac-29f0-4a61-922f-19fe5c8ba7c6', '4c85707f-c04c-4c62-9346-be0fe715464c', 'b9103a7d-9e23-4803-80d0-d33ef6acf30f', NULL, '50-gal water heater', '1.00'),
    ('356bfa7f-27d8-474a-a1cc-2b62e164d5e5', '4c85707f-c04c-4c62-9346-be0fe715464c', 'b9103a7d-9e23-4803-80d0-d33ef6acf30f', NULL, 'Copper fittings', '1.00'),
    ('c97eccf1-3429-462a-8ddf-21a3257bca6c', '4c85707f-c04c-4c62-9346-be0fe715464c', 'b9103a7d-9e23-4803-80d0-d33ef6acf30f', NULL, 'Gas flex line', '1.00'),
    ('d1dd0658-ae8f-46b8-9cb2-d161a9ae8209', '4c85707f-c04c-4c62-9346-be0fe715464c', 'c46532dc-23ae-4c5d-b9ee-94bc2f119a42', NULL, 'Drain snake', '1.00'),
    ('a30b5141-5454-474e-8c60-cf5eee8f517a', '4c85707f-c04c-4c62-9346-be0fe715464c', 'fd59fa77-5fda-4c0b-92cc-c9d9a2f3d384', NULL, 'Copper pipe 3/4"', '1.00'),
    ('04799535-198b-4596-8c29-5b91c15320cd', '4c85707f-c04c-4c62-9346-be0fe715464c', '6c57086d-71c2-49cd-941f-c42d548a1368', NULL, 'Pipe', '1.00');


--
-- Data for Name: job_notes; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.job_notes (4 rows)
--

INSERT INTO public.job_notes (id, company_id, job_id, author_id, body, created_at) VALUES
    ('c390d7a5-1f07-4f5b-aa3d-7c60db757666', '4c85707f-c04c-4c62-9346-be0fe715464c', '2e83f4b4-ff5d-407a-bec9-445599be8ef4', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'fdvdsvdf notes addition test', '2026-08-29 14:45:09.826809+00'),
    ('b7cc44f0-6a58-4cf6-a733-9717084bad2e', '4c85707f-c04c-4c62-9346-be0fe715464c', '643ee29a-a887-4308-bd6b-c2a7d7e6bbca', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'Created from estimate EST-2026-0002', '2026-08-29 15:20:19.498281+00'),
    ('29431825-a0ff-4a03-a8c5-be5c41ac9f85', '4c85707f-c04c-4c62-9346-be0fe715464c', 'cdcdb205-6fb6-4ff9-bdea-e7ec6a9742a0', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'QA Usman note 2026-09-02', '2026-09-02 15:20:19.558543+00'),
    ('82a1ac14-9bf3-4028-b750-58983dc4b02f', '85f8952f-bbbd-4aab-9763-0848b1f3010e', '55a0f13a-f09e-4436-aa68-ff5d897ec0e2', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '[saqib] vsvdsv', '2026-09-04 01:17:44.746451+00');


--
-- Data for Name: job_tasks; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.job_tasks (0 rows)
--

-- (no rows)


--
-- Data for Name: jobs; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.jobs (22 rows)
--

INSERT INTO public.jobs (id, company_id, customer_id, address_id, estimate_id, invoice_id, title, description, status, priority, category, scheduled_date, scheduled_time, arrival_end_time, multi_day, end_date, estimated_duration_hours, po_number, job_source, agent_rep, notes_for_techs, completion_notes, note_to_customer, requires_follow_up, notify_techs, billing_type, tax_rate, created_at, updated_at, completed_at, archived_at, archived_by, created_by, updated_by, owner_user_id) VALUES
    ('c46532dc-23ae-4c5d-b9ee-94bc2f119a42', '4c85707f-c04c-4c62-9346-be0fe715464c', 'db18cc82-c265-4bc1-86da-536b04cb130a', '5b7ef1d7-3c9a-45c2-8254-58fc0ca478f3', NULL, NULL, 'Kitchen Drain Clog', 'Severe kitchen drain blockage', 'assigned', 'medium', 'plumbing', '2026-08-21', '13:00:00', NULL, 'f', NULL, '2.00', NULL, NULL, NULL, NULL, NULL, NULL, 'f', 't', NULL, '0.00', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL, NULL),
    ('f9e7d530-84fd-4af7-830a-c70a32dedcdc', '4c85707f-c04c-4c62-9346-be0fe715464c', 'd20cb914-c493-486d-b426-34f8cffee6b4', '50449ee5-7c17-452e-9e1e-285fc79271b0', NULL, NULL, 'Bathroom Remodel Plumbing', 'Full bathroom remodel', 'new', 'medium', 'plumbing', '2026-08-24', '08:00:00', NULL, 'f', NULL, '8.00', NULL, NULL, NULL, NULL, NULL, NULL, 'f', 't', NULL, '0.00', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL, NULL),
    ('54ebd243-11c6-41de-9383-392d73d3f1b6', '4c85707f-c04c-4c62-9346-be0fe715464c', 'd1971b6f-0fd1-4e63-9279-a2a998673cac', '9046f321-aeac-4ec3-bb95-ae3446a1628e', NULL, NULL, 'Sewer Line Inspection', 'Camera inspection of main sewer line', 'assigned', 'low', 'plumbing', '2026-08-22', '10:00:00', NULL, 'f', NULL, '2.00', NULL, NULL, NULL, NULL, NULL, NULL, 'f', 't', NULL, '0.00', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL, NULL),
    ('b8270447-c605-4b6f-bdbc-4988874af0fd', '4c85707f-c04c-4c62-9346-be0fe715464c', '7f074219-8060-4fcc-a54c-8c928e4faf8f', '7ae814e3-0d58-496e-92ec-9fca7595cc05', NULL, NULL, 'Fixture Installation', 'Install new kitchen faucet', 'in_progress', 'low', 'plumbing', '2026-08-21', '14:00:00', NULL, 'f', NULL, '2.00', NULL, NULL, NULL, NULL, NULL, NULL, 'f', 't', NULL, '0.00', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL, NULL),
    ('3c206779-04bc-4633-839c-1f6e1cc5f135', '4c85707f-c04c-4c62-9346-be0fe715464c', '21928886-bd09-4c7b-bd4b-8b06298eed49', 'd0e6b353-a383-4ce5-acc3-cdf083c724a6', NULL, NULL, 'Water Softener Install', 'Install whole-house water softener', 'assigned', 'medium', 'plumbing', '2026-08-23', '09:00:00', NULL, 'f', NULL, '4.00', NULL, NULL, NULL, NULL, NULL, NULL, 'f', 't', NULL, '0.00', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL, NULL),
    ('fa2fa5fd-d94a-462d-ba89-2a5aac08ef2a', 'dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '5fda9858-a434-4d77-9308-86347a8ad48b', '8acb600e-d041-41f4-80ca-9b6490369b18', NULL, NULL, 'EV Charger Installation', 'Install Level 2 EV charger', 'assigned', 'medium', 'electrical', '2026-08-22', '09:00:00', NULL, 'f', NULL, '4.00', NULL, NULL, NULL, NULL, NULL, NULL, 'f', 't', NULL, '0.00', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL, NULL),
    ('ca344304-1a06-4a93-bbf1-e2c78b95d25a', '3b08e91a-b804-4b8e-9040-b203846c1c59', 'a9e555ee-afc3-4c6b-b77a-234132076da2', 'caee8c12-6234-4cbc-9c11-93aca5bedfc8', NULL, NULL, 'AC Unit Replacement', 'Replace 3-ton central AC unit', 'new', 'high', 'hvac', '2026-08-25', '07:00:00', NULL, 'f', NULL, '8.00', NULL, NULL, NULL, NULL, NULL, NULL, 'f', 't', NULL, '0.00', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL, NULL),
    ('0dadcf70-8fb6-40d8-8fc2-7b3b4998320a', '4c85707f-c04c-4c62-9346-be0fe715464c', 'a009971a-692c-4f7d-b088-5f49681fccb1', '7e01f28a-ba09-4ecb-a1ee-ff2c2f681d2a', NULL, NULL, 'Shower Valve Replacement', 'Leaking shower valve', 'assigned', 'medium', 'plumbing', '2026-08-23', '13:00:00', NULL, 'f', NULL, '3.00', NULL, NULL, NULL, NULL, NULL, NULL, 'f', 't', NULL, '0.00', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL, NULL),
    ('2db7e386-f3c0-4a8a-94fa-d02b0850cdcc', '4c85707f-c04c-4c62-9346-be0fe715464c', 'fa3008d1-c720-4ba9-b549-4e8f1b42e609', 'dbfa3f3f-5fd5-409b-a79f-c0c47a0681ee', NULL, NULL, 'Main Line Replacement', 'Replace corroded main water line', 'new', 'high', 'plumbing', '2026-08-28', '07:00:00', NULL, 'f', NULL, '10.00', NULL, NULL, NULL, NULL, NULL, NULL, 'f', 't', NULL, '0.00', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL, NULL),
    ('fd59fa77-5fda-4c0b-92cc-c9d9a2f3d384', '4c85707f-c04c-4c62-9346-be0fe715464c', '43ecb3dd-6b94-4d6c-ac18-55d27c856447', 'fb2a8c73-690a-4d36-9b68-b3f57afca550', NULL, '4db3ed8d-e4d6-4e68-8f3e-8bdcbc3a6398', 'Emergency Pipe Burst', 'Burst pipe in basement', 'completed', 'urgent', 'plumbing', '2026-08-20', '07:00:00', NULL, 'f', NULL, '3.00', NULL, NULL, NULL, NULL, NULL, NULL, 'f', 't', NULL, '8.00', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', '2026-08-20 11:32:44.584+00', NULL, NULL, NULL, NULL, NULL),
    ('b9103a7d-9e23-4803-80d0-d33ef6acf30f', '4c85707f-c04c-4c62-9346-be0fe715464c', '9bbaec87-6960-4e9c-a9fd-ae0f9cd1205f', '227057d5-e7f1-4353-9348-5a81cdf1e523', NULL, '1663f598-04e5-4632-95be-35f8d15c4eb1', 'Water Heater Replacement', 'Replace 50-gallon gas water heater', 'in_progress', 'high', 'plumbing', '2026-08-21', '09:00:00', NULL, 'f', NULL, '4.00', NULL, NULL, NULL, NULL, NULL, NULL, 'f', 't', NULL, '8.00', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL, NULL),
    ('74251aee-f1e4-4b29-93e1-08cacb3295d0', 'dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '5e62c798-3f59-4c39-a679-31c849f8f209', 'b718b398-e0a1-4ded-9985-1cca358818c6', NULL, '246d9a11-5243-42c3-9b56-6ad7243a9c5a', 'Panel Upgrade 200A', 'Upgrade electrical panel from 100A to 200A', 'in_progress', 'high', 'electrical', '2026-08-21', '08:00:00', NULL, 'f', NULL, '8.00', NULL, NULL, NULL, NULL, NULL, NULL, 'f', 't', NULL, '8.00', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, NULL, NULL, NULL),
    ('b2b6fd43-e0ba-469f-a59d-a1c83a8389c7', '3b08e91a-b804-4b8e-9040-b203846c1c59', '3654f07f-ef5f-49de-ad6d-0effd3b18a64', '2738eb92-af7d-41d0-b2d8-f7d86330b5eb', NULL, 'f75c1bd5-b8e8-4a72-b89c-81380ca9fcec', 'Furnace Repair', 'Furnace not igniting', 'completed', 'urgent', 'hvac', '2026-08-19', '08:00:00', NULL, 'f', NULL, '2.00', NULL, NULL, NULL, NULL, NULL, NULL, 'f', 't', NULL, '8.00', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', '2026-08-19 11:32:51.015+00', NULL, NULL, NULL, NULL, NULL),
    ('f23d3012-bb71-4880-8ffb-df6196d7c031', '4c85707f-c04c-4c62-9346-be0fe715464c', '1002eeac-9b16-4704-805d-b5f6be27209c', 'a4172d3a-6b06-4865-90ab-95665bec91bc', NULL, NULL, 'Backflow Preventer Test', 'Annual backflow testing', 'assigned', 'low', 'plumbing', '2026-08-24', '09:00:00', NULL, 'f', NULL, '1.00', NULL, NULL, NULL, NULL, NULL, NULL, 'f', 't', NULL, '0.00', '2026-08-21 11:31:56.489544+00', '2026-08-29 14:28:32.906428+00', NULL, NULL, NULL, NULL, '12063947-0b9a-45f4-bec7-6f81c6443f1b', NULL),
    ('4d8b3fae-b3f7-49fa-bd08-a89ba75e7711', '4c85707f-c04c-4c62-9346-be0fe715464c', '00d9b3cd-0b53-4453-beaf-4dba24595c46', '3fe6ce9a-4213-4d2a-bd6e-93cb290410df', NULL, '7a146e7d-a396-4e05-ac63-d126936e21f5', 'Toilet Replacement', 'Replace old toilet  1111', 'completed', 'low', 'plumbing', '2026-08-16', '10:00:00', NULL, 'f', NULL, '2.00', NULL, NULL, NULL, '', NULL, NULL, 'f', 't', NULL, '8.00', '2026-08-21 11:31:56.489544+00', '2026-08-31 10:34:24.230088+00', '2026-08-16 11:32:51.692+00', NULL, NULL, NULL, '12063947-0b9a-45f4-bec7-6f81c6443f1b', NULL),
    ('cdcdb205-6fb6-4ff9-bdea-e7ec6a9742a0', '4c85707f-c04c-4c62-9346-be0fe715464c', 'ab190a94-6b09-4e9d-a9eb-87a1783ca1c3', 'd5c8bbd7-5404-4336-94ba-4e334fbbbc56', NULL, NULL, 'QA Usman Test Job', '', 'new', 'medium', 'plumbing', NULL, NULL, NULL, 'f', NULL, '2.00', '', '', NULL, '', '', NULL, 'f', 't', 'single_invoice', '0.00', '2026-09-02 15:13:02.359291+00', '2026-09-02 15:13:02.359291+00', NULL, NULL, NULL, '12063947-0b9a-45f4-bec7-6f81c6443f1b', NULL, '12063947-0b9a-45f4-bec7-6f81c6443f1b'),
    ('6c57086d-71c2-49cd-941f-c42d548a1368', '4c85707f-c04c-4c62-9346-be0fe715464c', '0c75e45a-b9ed-4dfb-8ba0-e0b75fe01d64', 'edc8e7cb-9d4b-42a5-9c65-47e8f1f8ed69', NULL, NULL, 'Water Heater Replacement', 'service needs', 'assigned', 'urgent', 'plumbing', '2026-09-04', '21:00:00', '22:00:00', 'f', NULL, '1.00', '', 'Repeat Customer', NULL, '', 'tae', NULL, 'f', 't', 'single_invoice', '0.00', '2026-09-03 14:55:47.78741+00', '2026-09-03 14:55:47.78741+00', NULL, NULL, NULL, '12063947-0b9a-45f4-bec7-6f81c6443f1b', NULL, '12063947-0b9a-45f4-bec7-6f81c6443f1b'),
    ('053b8ea4-8a66-4459-af22-8f8895b78bc4', '4c85707f-c04c-4c62-9346-be0fe715464c', '45b2c196-5068-4df9-90a1-7e01636d5a55', 'a1e9762a-41bd-4b84-8f63-3c613635cc5b', NULL, NULL, 'Gas Line Installation', 'New gas line for outdoor kitchen', 'new', 'high', 'plumbing', '2026-08-26', '08:00:00', NULL, 'f', NULL, '6.00', NULL, NULL, NULL, NULL, NULL, NULL, 'f', 't', NULL, '0.00', '2026-08-21 11:31:56.489544+00', '2026-08-29 14:42:25.170804+00', NULL, NULL, NULL, NULL, '12063947-0b9a-45f4-bec7-6f81c6443f1b', NULL),
    ('2e83f4b4-ff5d-407a-bec9-445599be8ef4', '4c85707f-c04c-4c62-9346-be0fe715464c', '0c75e45a-b9ed-4dfb-8ba0-e0b75fe01d64', 'edc8e7cb-9d4b-42a5-9c65-47e8f1f8ed69', NULL, 'a9acbf24-e7fa-4402-a113-db3cae7bbb3b', 'Leak Detection', 'Underground leak detection', 'completed', 'medium', 'plumbing', '2026-08-18', '10:00:00', NULL, 'f', NULL, '3.00', NULL, NULL, NULL, '', NULL, NULL, 'f', 't', NULL, '8.00', '2026-08-21 11:31:56.489544+00', '2026-08-29 14:44:30.877987+00', '2026-08-18 11:32:48.483+00', NULL, NULL, NULL, '12063947-0b9a-45f4-bec7-6f81c6443f1b', NULL),
    ('55a0f13a-f09e-4436-aa68-ff5d897ec0e2', '85f8952f-bbbd-4aab-9763-0848b1f3010e', 'a01340b7-bf64-49f1-8e7d-964938dd491f', '570e455a-75f1-4b3f-9920-7f8c24485842', NULL, NULL, 'ac cleaning ', 'ac cleaning with presuusre ', 'completed', 'medium', 'hvac', '2026-09-17', '06:07:00', '12:05:00', 't', '2026-09-30', '2.00', '', '', NULL, '', '', NULL, 'f', 't', 'single_invoice', '0.00', '2026-09-04 01:06:09.575564+00', '2026-09-04 01:30:07.386362+00', '2026-09-04 01:30:07.386362+00', NULL, NULL, '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', NULL, '91823e01-9e7c-427f-a8c7-a8dcffbb2b21'),
    ('90ac950e-77e1-4b37-b921-1b5131b8b6a8', '4c85707f-c04c-4c62-9346-be0fe715464c', 'ac8a5f4f-73de-4957-b9e2-0986a6776d4d', '41758d4e-0c41-429c-b7bb-e2f15c8c6ce0', NULL, NULL, 'Sump Pump Replacement', 'Replace failed sump pump', 'assigned', 'high', 'plumbing', '2026-08-22', '11:00:00', NULL, 'f', NULL, '3.00', NULL, NULL, NULL, NULL, NULL, NULL, 'f', 't', NULL, '0.00', '2026-08-21 11:31:56.489544+00', '2026-08-29 14:56:49.477404+00', NULL, NULL, NULL, NULL, '12063947-0b9a-45f4-bec7-6f81c6443f1b', NULL),
    ('643ee29a-a887-4308-bd6b-c2a7d7e6bbca', '4c85707f-c04c-4c62-9346-be0fe715464c', '45b2c196-5068-4df9-90a1-7e01636d5a55', 'a1e9762a-41bd-4b84-8f63-3c613635cc5b', 'f1b9e537-cd47-46d4-a72d-28444a241997', NULL, 'Job from EST-2026-0002', 'Outdoor kitchen gas line.', 'new', 'medium', 'plumbing', NULL, NULL, NULL, 'f', NULL, '2.00', NULL, NULL, NULL, NULL, NULL, NULL, 'f', 't', 'single_invoice', '8.00', '2026-08-29 15:20:19.498281+00', '2026-08-29 15:20:19.498281+00', NULL, NULL, NULL, NULL, NULL, NULL);


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.notifications (13 rows)
--

INSERT INTO public.notifications (id, company_id, user_id, title, message, type, read, entity_type, entity_id, created_at, event_key, link_path) VALUES
    ('59da7f0e-f9e8-4437-a2ac-1a7d22dea570', '4c85707f-c04c-4c62-9346-be0fe715464c', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'New Assignment', 'You have been assigned: Water Heater Replacement', 'info', 't', NULL, NULL, '2026-08-21 11:31:56.489544+00', NULL, NULL),
    ('0268ec0e-7da3-482c-bd24-580e0348f0f9', NULL, '291b2bd3-c527-4b7b-a0f7-8882177a095c', 'New Company Registered', 'ProPipe Solutions has started a trial subscription', 'info', 'f', NULL, NULL, '2026-08-21 11:31:56.489544+00', NULL, NULL),
    ('737584e4-b289-439a-ba56-e434bda752b3', '4c85707f-c04c-4c62-9346-be0fe715464c', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'Emergency Job Completed', 'Jake Morrison completed emergency pipe repair', 'success', 't', NULL, NULL, '2026-08-21 11:31:56.489544+00', NULL, NULL),
    ('4821c519-e5ed-409a-a0db-4f4ee8f64b8e', '4c85707f-c04c-4c62-9346-be0fe715464c', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'Low Stock Alert', 'SharkBite Fitting 3/4" is below minimum stock level (8/20)', 'warning', 't', NULL, NULL, '2026-08-21 11:31:56.489544+00', NULL, NULL),
    ('6e7388ae-0e5f-4d84-b73d-cdc04272b0ac', '4c85707f-c04c-4c62-9346-be0fe715464c', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'Estimate approved', 'EST-2026-0002 was approved', 'success', 'f', 'estimate', 'f1b9e537-cd47-46d4-a72d-28444a241997', '2026-08-29 15:19:57.624463+00', 'estimate.approved', '/admin/estimates/f1b9e537-cd47-46d4-a72d-28444a241997'),
    ('fc47b3fa-d7de-4bef-a14e-ef3f5b214e0a', '4c85707f-c04c-4c62-9346-be0fe715464c', '7f8f442a-3993-44ff-8d8f-f7664ba85b8d', 'Welcome to FieldPro', 'Your worker account is ready. Sign in with your email.', 'success', 'f', NULL, NULL, '2026-08-29 15:44:06.189819+00', 'worker.welcome', '/worker'),
    ('94f8e3d6-bb23-45f2-b6b4-361426297df2', '85f8952f-bbbd-4aab-9763-0848b1f3010e', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'Welcome to FieldPro', 'Your 14-day trial for PAF KIET University has started', 'success', 'f', NULL, NULL, '2026-09-03 00:48:31.379025+00', 'company.welcome', '/admin/settings?tab=billing'),
    ('4b7a6dc9-bf7b-47fa-acc4-a98ba5615d8b', NULL, '291b2bd3-c527-4b7b-a0f7-8882177a095c', 'New Company Registered', 'PAF KIET University has started a trial subscription', 'info', 'f', NULL, NULL, '2026-09-03 00:48:31.379025+00', 'company.registered', '/super-admin/companies'),
    ('998d073c-3d0a-4950-a095-64bf68cc017c', '4c85707f-c04c-4c62-9346-be0fe715464c', 'a78bcb87-2e94-4c04-9006-7a69ac4bb165', 'Welcome to FieldPro', 'Your worker account is ready. Sign in with your email.', 'success', 'f', NULL, NULL, '2026-09-03 13:52:56.697942+00', 'worker.welcome', '/worker'),
    ('9a9e7e80-90da-4230-8d2d-f8be2f2ce9a4', '4c85707f-c04c-4c62-9346-be0fe715464c', 'a78bcb87-2e94-4c04-9006-7a69ac4bb165', 'New Assignment', 'You have been assigned: Water Heater Replacement', 'info', 'f', 'job', '6c57086d-71c2-49cd-941f-c42d548a1368', '2026-09-03 14:55:47.78741+00', 'job.assigned', '/worker/jobs/6c57086d-71c2-49cd-941f-c42d548a1368'),
    ('55e341ff-1608-437f-bd55-10fda5ac87c9', '85f8952f-bbbd-4aab-9763-0848b1f3010e', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', 'Welcome to FieldPro', 'Your worker account is ready. Sign in with your email.', 'success', 'f', NULL, NULL, '2026-09-03 18:31:37.771016+00', 'worker.welcome', '/worker'),
    ('a6f85d6f-7770-4193-a3e5-1e8d287fb323', '85f8952f-bbbd-4aab-9763-0848b1f3010e', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', 'New Assignment', 'You have been assigned: ac cleaning ', 'info', 'f', 'job', '55a0f13a-f09e-4436-aa68-ff5d897ec0e2', '2026-09-04 01:06:09.575564+00', 'job.assigned', '/worker/jobs/55a0f13a-f09e-4436-aa68-ff5d897ec0e2'),
    ('d9678986-496c-4472-9850-4ab587987536', '85f8952f-bbbd-4aab-9763-0848b1f3010e', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'Job Completed', 'ac cleaning  was marked completed', 'success', 'f', 'job', '55a0f13a-f09e-4436-aa68-ff5d897ec0e2', '2026-09-04 01:30:07.386362+00', 'job.completed', '/admin/jobs/55a0f13a-f09e-4436-aa68-ff5d897ec0e2');


--
-- Data for Name: password_reset_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.password_reset_tokens (5 rows)
--

INSERT INTO public.password_reset_tokens (id, user_id, token_hash, expires_at, used_at, created_at) VALUES
    ('ffc61f99-2ef6-4164-a958-66f30dd8c48f', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '39429765dac66bca045c31b94a279cc0304f30b4eeacf2118d6de57f5f9e4124', '2026-08-22 03:34:09.014864+00', NULL, '2026-08-22 02:34:09.014864+00'),
    ('8030bb2d-7a94-418a-9dda-539105bf9633', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bb08eb3284b6cd2cebf0157f64d1cc412f04ba8543eff1d2721292bc12ee585f', '2026-08-22 03:35:07.49077+00', NULL, '2026-08-22 02:35:07.49077+00'),
    ('a06bf958-d288-4bbe-a2fe-e67022c7d6c7', '291b2bd3-c527-4b7b-a0f7-8882177a095c', 'c3c5b382d254fa7806292be38424dbfb6a107564c65368e1b357d283961e7aa0', '2026-08-22 03:35:08.132973+00', NULL, '2026-08-22 02:35:08.132973+00'),
    ('ff236def-e9ae-44d8-b0c5-3a73b0275519', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'd56fbf2d3d37c9e9e026d4ed1237385d006e5157a17b85d317dc07f4be893424', '2026-08-27 21:18:50.951247+00', NULL, '2026-08-27 20:18:50.951247+00'),
    ('eea50fe6-fafc-4936-9f71-6669f9afb5d8', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '281b287798bb48cc702e1a962a80d5b5e9bfdf5910576b8d475d8c9ccc44f811', '2026-09-04 01:44:37.250466+00', NULL, '2026-09-04 00:44:37.250466+00');


--
-- Data for Name: platform_email_templates; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.platform_email_templates (6 rows)
--

INSERT INTO public.platform_email_templates (type, name, subject, body, updated_at) VALUES
    ('password_reset', 'Password reset', 'Reset your FieldPro password', 'Use this link to reset your password: {resetUrl}', '2026-08-31 11:59:44.340825+00'),
    ('welcome', 'Welcome', 'Welcome to FieldPro', 'Welcome {name}. Your company {companyName} is ready.', '2026-08-31 11:59:44.340825+00'),
    ('tenant_invitation', 'Invitation', 'You are invited to FieldPro', 'Join {companyName}: {inviteUrl}', '2026-08-31 11:59:44.340825+00'),
    ('system_notification', 'System notification', 'FieldPro notification', '{message}', '2026-08-31 11:59:44.340825+00'),
    ('subscription_started', 'Subscription started', 'Your FieldPro subscription', 'Your subscription for {companyName} is active.', '2026-08-31 11:59:44.340825+00'),
    ('payment_failed', 'Payment failed', 'Payment failed for FieldPro', 'Payment failed for {companyName}. Please update billing.', '2026-08-31 11:59:44.340825+00');


--
-- Data for Name: platform_settings; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.platform_settings (1 row)
--

INSERT INTO public.platform_settings (id, smtp_host, smtp_port, smtp_user, smtp_password_enc, smtp_secure, smtp_from_name, smtp_from_email, trial_days, support_email, updated_at, smtp_reply_to) VALUES
    ('1', 'send.one.com', '587', 'developer@mitiesoft.com', 'xWpWK0e0HzClluC7.y4sDHWGB6LPH/mQCT2RVTQ==.Lo7WqqQgtmXFuH3yPOA=', 'f', 'FieldPro', 'developer@mitiesoft.com', '14', 'developer@mitiesoft.com', '2026-08-21 11:29:26.797405+00', NULL);


--
-- Data for Name: record_favorites; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.record_favorites (4 rows)
--

INSERT INTO public.record_favorites (company_id, user_id, entity_type, entity_id, starred, pinned, created_at) VALUES
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'job', '4d8b3fae-b3f7-49fa-bd08-a89ba75e7711', 'f', 't', '2026-08-29 01:16:57.518889+00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'job', '2e83f4b4-ff5d-407a-bec9-445599be8ef4', 't', 'f', '2026-08-29 01:18:22.571202+00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'customer', 'ab190a94-6b09-4e9d-a9eb-87a1783ca1c3', 'f', 't', '2026-08-29 15:34:24.444619+00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'job', 'cdcdb205-6fb6-4ff9-bdea-e7ec6a9742a0', 'f', 't', '2026-09-02 15:20:30.464025+00');


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.refresh_tokens (554 rows)
--

INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at) VALUES
    ('875757d7-d8d6-46a3-a9f1-27115237c46c', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'c9afdd12c8f9442fad72c36d811523f31c24de31ed3c80f50918090cef3d978e', '2026-09-04 12:06:49.419169+00', NULL, '2026-08-21 12:06:49.419169+00'),
    ('58458575-edda-41ec-a140-943f8c47b14a', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '631aaeb696fa2876d4b80d67ca30fcaaea893388212acac6d13006e7acf2d8af', '2026-09-04 12:07:00.364607+00', '2026-08-21 12:08:06.18623+00', '2026-08-21 12:07:00.364607+00'),
    ('b6dcfca3-5078-4f71-aff9-5eaa223b475b', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'fba06579c88598bc46fc80df9dffb86fc614790ba6efb36f0f12077458a916f6', '2026-09-04 12:08:09.609815+00', '2026-08-21 12:08:15.606006+00', '2026-08-21 12:08:09.609815+00'),
    ('80b68f0b-c6b6-457e-95a5-4b7eb5fede46', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '54fb66b9ca64f9fe09adb577a2bee60ad26e0ff411b5136890fffd9dc57a6785', '2026-09-04 12:08:17.544302+00', '2026-08-21 12:08:24.293677+00', '2026-08-21 12:08:17.544302+00'),
    ('f4f20318-13be-4afe-9803-1b4e9b3fb165', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'c7bc6176b40ceee9c9681392866652172a5786c3eb7940cd8c65bdd317e726ce', '2026-09-04 12:08:28.085608+00', '2026-08-21 12:08:32.833263+00', '2026-08-21 12:08:28.085608+00'),
    ('95730d82-e1c5-4816-8d09-ba4cc268391b', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '82f68513c3bedd8847c75be84ef56153236fc42b0a48dc4acc27d795b205594f', '2026-09-04 23:41:43.426562+00', NULL, '2026-08-21 23:41:43.426562+00'),
    ('1df03077-40a2-444a-9bba-e08ad72ff605', '291b2bd3-c527-4b7b-a0f7-8882177a095c', 'c8d062198da7928237542cb783d9ab4bc5901e48257aba7488734a4645f1746a', '2026-09-04 23:42:00.458831+00', NULL, '2026-08-21 23:42:00.458831+00'),
    ('fd7cee4f-cc2a-4a45-b1bf-7955f96dd0c7', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '6a718b6f768bde7c67470ab1cf616bea15645ff97a40e31304c06f0f954dc98b', '2026-09-04 23:42:20.672951+00', NULL, '2026-08-21 23:42:20.672951+00'),
    ('3d054698-a541-4a70-ab61-00138a07afd2', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '07400d879936127679e7379904c30293dd9f438cc9a88827fb152ce68cff87be', '2026-09-04 23:42:22.003518+00', NULL, '2026-08-21 23:42:22.003518+00'),
    ('712f8b53-0bce-4ee4-af67-1fac0f3fcbf0', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'bbab82795ab195ff1384bc016078b9401c4d6dbd5fc18456eeb28cbe1c65f61e', '2026-09-04 23:48:22.742176+00', NULL, '2026-08-21 23:48:22.742176+00'),
    ('b0f384eb-fc2f-4d84-b270-53bce178a887', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '139c1612bf70412a927144596e46bf69c6f36a87c26957455960f405bcbb2bb5', '2026-09-04 23:50:16.099987+00', NULL, '2026-08-21 23:50:16.099987+00'),
    ('1e2e6491-8efb-429a-8b1a-8b3b14773525', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '908612c6719532c903fdd8cec84c168597e2899654cbe04f75976919549ef8e4', '2026-09-04 23:50:18.339227+00', NULL, '2026-08-21 23:50:18.339227+00'),
    ('387fbf0a-37b4-41f6-81bb-1bc89fbba2b1', '291b2bd3-c527-4b7b-a0f7-8882177a095c', 'cb54c71a34a9c5b95dd26132068b4142668c23fa5a31f96db56abee0876a2a92', '2026-09-05 01:20:40.754701+00', NULL, '2026-08-22 01:20:40.754701+00'),
    ('0827f44c-0433-473c-996a-8523ede6dc41', '291b2bd3-c527-4b7b-a0f7-8882177a095c', 'fef147114bb0c0c6562e6a81a66fd342ffda5c7afb5bcbcaa29f2ceb86c32d26', '2026-09-05 01:24:02.20829+00', NULL, '2026-08-22 01:24:02.20829+00'),
    ('24d04228-474d-4649-a414-a7b3c222d38e', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '9492776463eb3033effac98aaddd4826649f634955622a4d07fb51dc6e1a2b6b', '2026-09-05 01:24:22.312465+00', NULL, '2026-08-22 01:24:22.312465+00'),
    ('67e70aa6-9e54-4a94-a0ff-4f81fbc3b9b6', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'b3564a4d6c3df248b939ee5d6ad6060dc28839b4e742f0d6c1cb91ce06aa3368', '2026-09-07 10:29:02.932367+00', NULL, '2026-08-24 10:29:02.932367+00'),
    ('8360217f-3695-4270-bdb0-7cf9c4993d13', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '9492776463eb3033effac98aaddd4826649f634955622a4d07fb51dc6e1a2b6b', '2026-09-05 01:24:22.377311+00', NULL, '2026-08-22 01:24:22.377311+00'),
    ('ac8fd279-3f44-4ef6-93e1-700a491d934b', '291b2bd3-c527-4b7b-a0f7-8882177a095c', 'f383771da3e332d24c47636228116247cb5082d92700bc38bf259ce716bd0866', '2026-09-05 01:29:30.146861+00', '2026-08-24 18:18:21.665747+00', '2026-08-22 01:29:30.146861+00'),
    ('fe59e24e-c076-4675-b84a-dbe9205fd305', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '9492776463eb3033effac98aaddd4826649f634955622a4d07fb51dc6e1a2b6b', '2026-09-05 01:24:22.403189+00', NULL, '2026-08-22 01:24:22.403189+00'),
    ('9e4782b7-1cff-4940-ac5a-c65ddb1cb401', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'c1a72a39a1a8eb324d6408f012561af6b9fe4b8e32bc574982f2cc5ffbce1dae', '2026-09-04 23:50:43.183146+00', '2026-08-22 01:24:22.4815+00', '2026-08-21 23:50:43.183146+00'),
    ('6990b35b-f173-4aa2-a5ad-072623eb8532', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '13521b689ebfa35a9625bcda2cb1fc460ea0d1d50f38b78edc8909466c45c5c9', '2026-09-05 01:24:22.4815+00', NULL, '2026-08-22 01:24:22.4815+00'),
    ('ea02679c-4e04-4995-bd95-36e5d2e8ddb4', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '0f0ddddba446eea82c7753f49ba593424e2d2471c71117c45c77cf08b1cedf67', '2026-09-05 02:29:47.533589+00', NULL, '2026-08-22 02:29:47.533589+00'),
    ('f26aba7d-291a-4f8c-8eb3-424cc2a93f66', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '485262085d1029fdb19b45331fb116f51f15e820d433c8ac423f0743b7c59567', '2026-09-05 02:31:01.647598+00', NULL, '2026-08-22 02:31:01.647598+00'),
    ('9ab0d7f4-d7ad-4d75-9a7c-d4b23b679e04', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '6268264b569112dd52b4cc568e7819a0a3ef33bd813a06b0bb831bd75a13a4e8', '2026-09-07 10:29:03.035422+00', '2026-09-01 13:35:08.943689+00', '2026-08-24 10:29:03.035422+00'),
    ('e1698526-f64f-4fda-beb6-dec48d758c7b', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '485262085d1029fdb19b45331fb116f51f15e820d433c8ac423f0743b7c59567', '2026-09-05 02:31:01.697447+00', NULL, '2026-08-22 02:31:01.697447+00'),
    ('0365d555-b417-4fab-bd03-65c82442ef4d', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '6268264b569112dd52b4cc568e7819a0a3ef33bd813a06b0bb831bd75a13a4e8', '2026-09-07 10:29:03.071645+00', NULL, '2026-08-24 10:29:03.071645+00'),
    ('a9277b9d-9559-430e-9e5d-cf4d63a711a1', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '485262085d1029fdb19b45331fb116f51f15e820d433c8ac423f0743b7c59567', '2026-09-05 02:31:01.727446+00', NULL, '2026-08-22 02:31:01.727446+00'),
    ('53b6c365-c597-4eae-9d5d-1872885353b5', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '485262085d1029fdb19b45331fb116f51f15e820d433c8ac423f0743b7c59567', '2026-09-05 02:31:01.91232+00', NULL, '2026-08-22 02:31:01.91232+00'),
    ('d9c33b8e-ba30-4812-a03f-1bea607ecb38', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '6268264b569112dd52b4cc568e7819a0a3ef33bd813a06b0bb831bd75a13a4e8', '2026-09-07 10:29:03.07144+00', NULL, '2026-08-24 10:29:03.07144+00'),
    ('1749a97b-e837-4cd8-831a-b5b23e8d7329', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '485262085d1029fdb19b45331fb116f51f15e820d433c8ac423f0743b7c59567', '2026-09-05 02:31:01.912609+00', NULL, '2026-08-22 02:31:01.912609+00'),
    ('dcca6ffd-6cd4-4772-a78d-27e76b71c64d', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '60150281197a224fba1e7985c0cbd43b77b5b2250ad7af39441bd3743a2c2eba', '2026-09-05 01:24:58.593428+00', '2026-08-22 02:31:01.926296+00', '2026-08-22 01:24:58.593428+00'),
    ('4539aead-6298-47a7-b083-d485a9b95c92', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '485262085d1029fdb19b45331fb116f51f15e820d433c8ac423f0743b7c59567', '2026-09-05 02:31:01.926296+00', NULL, '2026-08-22 02:31:01.926296+00'),
    ('5b1d56d2-549f-4b60-97a2-054a2ab2a268', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '08a829380e64e3ac7565c54c609f258a6a2ceba8ebf5539b6600a5e5106afa08', '2026-09-05 02:31:09.854035+00', NULL, '2026-08-22 02:31:09.854035+00'),
    ('07c87224-f14b-4925-b3c1-2ef2361d9595', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '2dfe43d00ca9351e0f9e1734f65c026f49ee27ec41ed0cfaef9788958338426d', '2026-09-05 02:31:13.934904+00', NULL, '2026-08-22 02:31:13.934904+00'),
    ('f8d63fb6-a18c-40dd-ab26-523090f17ba2', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '97e2866d4ee930bc69fc8e15d8641904038868b5240bed14ce709308e2899870', '2026-09-05 02:31:17.775391+00', NULL, '2026-08-22 02:31:17.775391+00'),
    ('6cd89768-640f-4f7e-951c-c28dbf7368dd', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '66c868d579cb53c5704f0a91df30b2be42be142ce10834c425d1c29f856c1b2c', '2026-09-05 02:34:02.903432+00', NULL, '2026-08-22 02:34:02.903432+00'),
    ('1c8e72a8-6009-4b9c-8052-eae33121089b', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '97965418e7bc81d7bac5448d29d882e67bcce1345931c6e97479939237fbaea3', '2026-09-05 02:34:04.929964+00', NULL, '2026-08-22 02:34:04.929964+00'),
    ('3184f330-d58b-4d79-94fb-06d2fc4f03dc', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4884cf8652630849b5679ddaf337599d5f950b554dc04609e3bad6e28269ffa6', '2026-09-05 02:34:06.898217+00', NULL, '2026-08-22 02:34:06.898217+00'),
    ('24c23cb4-9119-409b-b289-09570a272873', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '74e1244af61443de38d4d182cc2cb0665733162b33a77562ff1bd96ebc2e0ca5', '2026-09-05 02:34:40.900488+00', NULL, '2026-08-22 02:34:40.900488+00'),
    ('cd0b86d3-f974-4802-a263-8da4368df8dc', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '4727b39d105a3841232e4fdd06ff622ec76b6742e11ea42eda91a91655566981', '2026-09-05 02:34:43.739934+00', NULL, '2026-08-22 02:34:43.739934+00'),
    ('daa5607d-2b94-4643-b1c1-43b099330454', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'fc705e81ca7ecce59019bce220daa6ed7f1aca17b9a9720f759653138bde49a7', '2026-09-05 02:34:46.386602+00', NULL, '2026-08-22 02:34:46.386602+00'),
    ('a6c6fc44-0276-4960-af74-29a96dc85330', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '6268264b569112dd52b4cc568e7819a0a3ef33bd813a06b0bb831bd75a13a4e8', '2026-09-07 10:29:03.025129+00', NULL, '2026-08-24 10:29:03.025129+00'),
    ('0308fc76-5703-4535-bf2b-02720062de37', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '6268264b569112dd52b4cc568e7819a0a3ef33bd813a06b0bb831bd75a13a4e8', '2026-09-07 10:29:03.03442+00', NULL, '2026-08-24 10:29:03.03442+00'),
    ('bede4e9e-238d-4025-a199-9a560dec6228', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '6268264b569112dd52b4cc568e7819a0a3ef33bd813a06b0bb831bd75a13a4e8', '2026-09-07 10:29:03.049274+00', NULL, '2026-08-24 10:29:03.049274+00'),
    ('eb4693bd-1cc4-47be-8502-d4923d7d0d59', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'b3564a4d6c3df248b939ee5d6ad6060dc28839b4e742f0d6c1cb91ce06aa3368', '2026-09-07 10:29:02.953854+00', NULL, '2026-08-24 10:29:02.953854+00'),
    ('d195be95-c966-47c8-b937-2fa1a713defe', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '6268264b569112dd52b4cc568e7819a0a3ef33bd813a06b0bb831bd75a13a4e8', '2026-09-07 10:29:03.079535+00', NULL, '2026-08-24 10:29:03.079535+00'),
    ('db74c306-0e1b-4648-8bc7-4476386af9ec', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'c66e1c111829ff64d78f07f85c8754ccf22f5189c83ef671b8edd415f161d7be', '2026-09-11 21:58:20.33244+00', '2026-08-28 22:13:37.816649+00', '2026-08-28 21:58:20.33244+00'),
    ('657b102d-c568-48b6-b239-ca48abb14729', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '6268264b569112dd52b4cc568e7819a0a3ef33bd813a06b0bb831bd75a13a4e8', '2026-09-07 10:29:03.123404+00', NULL, '2026-08-24 10:29:03.123404+00'),
    ('037cf70a-ce49-4571-b3b3-cd760dd06dd4', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '6f8584320d953b060f7e97258cd624b05827e4153fcb8ab861ff3d135d69cddb', '2026-09-11 21:49:04.32921+00', NULL, '2026-08-28 21:49:04.32921+00'),
    ('112443a1-71dd-4d9a-9d2a-29c7e681c247', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '6268264b569112dd52b4cc568e7819a0a3ef33bd813a06b0bb831bd75a13a4e8', '2026-09-07 10:29:03.206232+00', NULL, '2026-08-24 10:29:03.206232+00');
INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at) VALUES
    ('1f033f0c-7688-4e48-81d0-6cecc9c0af01', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '2ba3d01c3d133eefd5b05f96ec8b3888681877e84763f69e4609f3a5ed62cb71', '2026-09-11 21:27:32.090752+00', '2026-08-28 21:49:04.346804+00', '2026-08-28 21:27:32.090752+00'),
    ('55f10364-ff6c-4e34-8d45-b46b456dadc6', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '6268264b569112dd52b4cc568e7819a0a3ef33bd813a06b0bb831bd75a13a4e8', '2026-09-07 10:29:03.157454+00', NULL, '2026-08-24 10:29:03.157454+00'),
    ('1117f0de-cec3-4a42-bcdb-c3333ce74681', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '6f8584320d953b060f7e97258cd624b05827e4153fcb8ab861ff3d135d69cddb', '2026-09-11 21:49:04.346804+00', NULL, '2026-08-28 21:49:04.346804+00'),
    ('4e93e469-fc02-49cb-b08e-a3bba0fc699d', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '6268264b569112dd52b4cc568e7819a0a3ef33bd813a06b0bb831bd75a13a4e8', '2026-09-07 10:29:03.214556+00', NULL, '2026-08-24 10:29:03.214556+00'),
    ('c7fcd2da-6181-400f-aad1-c83efcf033bd', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '85c8a0be5fb01eaf4a81a0e729b5bfa82340a5813e646fc492dc26565476e5eb', '2026-09-07 09:01:18.505805+00', '2026-08-24 10:29:03.069281+00', '2026-08-24 09:01:18.505805+00'),
    ('df1969c3-1711-499e-892b-051388a2ef21', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '6268264b569112dd52b4cc568e7819a0a3ef33bd813a06b0bb831bd75a13a4e8', '2026-09-07 10:29:03.069281+00', NULL, '2026-08-24 10:29:03.069281+00'),
    ('c37466b8-7f4d-4c70-9f3c-393ec8013daa', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '6e4982a7c4afd5cd531e9c5a19b84d70dfe460243368b71161ae24a60e87f087', '2026-09-07 18:18:21.665747+00', NULL, '2026-08-24 18:18:21.665747+00'),
    ('9227d4a0-ab4f-4b4e-872c-64e73d3f3b55', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '6e4982a7c4afd5cd531e9c5a19b84d70dfe460243368b71161ae24a60e87f087', '2026-09-07 18:18:21.527527+00', '2026-08-24 18:39:22.05506+00', '2026-08-24 18:18:21.527527+00'),
    ('6360452b-4c29-40b4-a3c5-faec05bd3cf3', '291b2bd3-c527-4b7b-a0f7-8882177a095c', 'bb612379583344209857caa256302a0bacada665ffc17b2a3608a20d10256175', '2026-09-08 17:52:57.089925+00', NULL, '2026-08-25 17:52:57.089925+00'),
    ('4de8a2c9-831e-4ea0-b7b9-20dac7b1cbe3', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '4543a100b48e9e7df4b5c4723ddea8e8044fdb24a93760ba8bbe15e3139d263c', '2026-09-07 18:39:22.05506+00', '2026-08-25 17:52:57.086975+00', '2026-08-24 18:39:22.05506+00'),
    ('00c580af-765d-47a1-9949-d0b0278e18b6', '291b2bd3-c527-4b7b-a0f7-8882177a095c', 'bb612379583344209857caa256302a0bacada665ffc17b2a3608a20d10256175', '2026-09-08 17:52:57.086975+00', NULL, '2026-08-25 17:52:57.086975+00'),
    ('adcfa070-032e-4a6c-ae0e-a4b42d612958', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '03970e20b0ee8025895386ac32b82bd4d6552d51c14a58009746bc82aa92aa15', '2026-09-10 20:18:44.167902+00', NULL, '2026-08-27 20:18:44.167902+00'),
    ('37ebc3d0-5fb4-4a1a-b040-e0f90f8d2b82', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '750890c780ae464611cf21fec4f9e2056bc08298beae9df1de271e2553cfc5fc', '2026-09-10 20:18:46.136745+00', NULL, '2026-08-27 20:18:46.136745+00'),
    ('d737b2da-b25b-44e2-9f5a-9fc49a021a29', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '9d2fe1e634cfa5a30ca082e21e42b5f70e5b92a2f0d2be043ceb224a48a46214', '2026-09-10 20:18:48.098543+00', NULL, '2026-08-27 20:18:48.098543+00'),
    ('f0a34d12-1eb2-45f5-a9ad-0974d8267bb8', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '09691cd009a7979f8fcd16ba21569cdea08f87b1c355c462b0d6e60856019570', '2026-09-10 20:19:36.018403+00', '2026-08-27 20:19:42.177412+00', '2026-08-27 20:19:36.018403+00'),
    ('d8051504-8782-4308-9fb8-7c49bd2529a3', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'f9740d3598e51e9cb7fe512bb7ebba311803283d94b8db4c644cc649377c5b34', '2026-09-10 20:19:42.177412+00', NULL, '2026-08-27 20:19:42.177412+00'),
    ('1ac86832-045f-40d7-8482-1e3bfd3265bf', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '568b5e4c9b405bc8f730d66e23c54881daa8b22ff30d8275a624fb2a4ce59c81', '2026-09-10 20:20:05.908504+00', NULL, '2026-08-27 20:20:05.908504+00'),
    ('0d74aabb-6197-4741-9895-dc69075dd06c', '291b2bd3-c527-4b7b-a0f7-8882177a095c', 'cf98d7bb8378e8d4148f0078ee728b0875da75ca70f1b9b8ff5a7fd9eabc5743', '2026-09-10 20:20:16.939826+00', NULL, '2026-08-27 20:20:16.939826+00'),
    ('da3cda2e-fbcb-4721-a1e4-150192a8b77a', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bef20cfcccc83dd60548c9d197ddc58546999200f5ab4cf8c9b5aa7b7caffbfd', '2026-09-10 20:24:54.259069+00', NULL, '2026-08-27 20:24:54.259069+00'),
    ('4dcd4c0c-c6b7-41be-9637-8848c4abf69e', '291b2bd3-c527-4b7b-a0f7-8882177a095c', 'd4611f60c68d4c015ecd1f71941d6f0f53f60ff0de93421f1c850fbf2676094c', '2026-09-10 23:16:19.869115+00', NULL, '2026-08-27 23:16:19.869115+00'),
    ('73ffd481-ebdb-4f5a-82b7-ced34673b3dd', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '72ada517bbe90bc84fc54eb4e06e22942d705d090ac77c16e9ec91acb27d94d9', '2026-09-10 23:25:51.253242+00', '2026-08-27 23:28:33.911676+00', '2026-08-27 23:25:51.253242+00'),
    ('2fc4faf7-58d2-438c-b77d-81724789b539', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'a063438867b8efb532698b6b5606f1d1055bd43bbdab3d14b13d90c088706723', '2026-09-10 23:28:33.911676+00', NULL, '2026-08-27 23:28:33.911676+00'),
    ('b1e0275f-7578-4b1c-bdf7-ba9da5f16380', '291b2bd3-c527-4b7b-a0f7-8882177a095c', 'fd1d0525cbaeaf759dc2d2260c9634c65cf6e15417f4396f360ad96571788781', '2026-09-11 00:15:24.516848+00', NULL, '2026-08-28 00:15:24.516848+00'),
    ('dfcde5b2-8fe1-49aa-8fd6-36749be9537c', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'c66e1c111829ff64d78f07f85c8754ccf22f5189c83ef671b8edd415f161d7be', '2026-09-11 21:58:20.364581+00', NULL, '2026-08-28 21:58:20.364581+00'),
    ('ec84db58-a015-4159-996d-e49cfa465bf4', '291b2bd3-c527-4b7b-a0f7-8882177a095c', 'fd1d0525cbaeaf759dc2d2260c9634c65cf6e15417f4396f360ad96571788781', '2026-09-11 00:15:24.516611+00', NULL, '2026-08-28 00:15:24.516611+00'),
    ('87c56827-5c74-413f-9dfd-23dd76a25a75', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '26c1d4672b56ac255a1b13fcedc27c2b670e81283870980ff53755558f9c33a2', '2026-09-10 23:58:50.703561+00', '2026-08-28 00:15:24.517458+00', '2026-08-27 23:58:50.703561+00'),
    ('fada41d5-51e2-435b-aced-be4d453fa0cd', '291b2bd3-c527-4b7b-a0f7-8882177a095c', 'fd1d0525cbaeaf759dc2d2260c9634c65cf6e15417f4396f360ad96571788781', '2026-09-11 00:15:24.517458+00', NULL, '2026-08-28 00:15:24.517458+00'),
    ('faf5a908-d0fa-4b39-b794-2c51966960c1', '291b2bd3-c527-4b7b-a0f7-8882177a095c', 'fd1d0525cbaeaf759dc2d2260c9634c65cf6e15417f4396f360ad96571788781', '2026-09-11 00:15:24.331115+00', '2026-08-28 00:30:45.402366+00', '2026-08-28 00:15:24.331115+00'),
    ('02f6093e-5b17-465c-b234-3ee5fca8832c', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '2612260010a9b619cfbfee1fa27a959e19d009a25ea4d0e0d3a70c35ac89b1d9', '2026-09-11 00:30:45.402366+00', '2026-08-28 00:46:12.437948+00', '2026-08-28 00:30:45.402366+00'),
    ('24a073a0-39e6-4d42-a0c4-25ac7e4e635f', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '60f049c1fa4b4c70c3f98112401941a18cbd8fd1a07753e0189104d63c1f33f1', '2026-09-11 00:46:12.437948+00', '2026-08-28 01:01:39.057887+00', '2026-08-28 00:46:12.437948+00'),
    ('7fd1d181-e502-4bcc-80e7-12f6a9a981ef', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '03ffb98fddbaaf2ee855745dedd53f3e689b682f6f8974daacd60cfc3bade404', '2026-09-11 01:01:39.057887+00', '2026-08-28 01:01:46.68695+00', '2026-08-28 01:01:39.057887+00'),
    ('7d24575b-92d5-4657-9caa-3ed5e0befb51', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'c66e1c111829ff64d78f07f85c8754ccf22f5189c83ef671b8edd415f161d7be', '2026-09-11 21:58:20.379222+00', NULL, '2026-08-28 21:58:20.379222+00'),
    ('a67d9bfa-9e22-482c-ac52-0ef9c436f5a5', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'c66e1c111829ff64d78f07f85c8754ccf22f5189c83ef671b8edd415f161d7be', '2026-09-11 21:58:20.410116+00', NULL, '2026-08-28 21:58:20.410116+00'),
    ('9c665d1f-ae17-486e-a086-c92b3d7e5c0a', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'c66e1c111829ff64d78f07f85c8754ccf22f5189c83ef671b8edd415f161d7be', '2026-09-11 21:58:20.427415+00', NULL, '2026-08-28 21:58:20.427415+00'),
    ('add82edd-31e8-41cd-891b-fe69346e6095', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'c66e1c111829ff64d78f07f85c8754ccf22f5189c83ef671b8edd415f161d7be', '2026-09-11 21:58:20.472926+00', NULL, '2026-08-28 21:58:20.472926+00'),
    ('182ea0c3-6be0-4112-9ead-12cde40ab404', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'c66e1c111829ff64d78f07f85c8754ccf22f5189c83ef671b8edd415f161d7be', '2026-09-11 21:58:20.491912+00', NULL, '2026-08-28 21:58:20.491912+00'),
    ('8b26d79d-df2c-46c8-a2a2-910c3315503b', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'c66e1c111829ff64d78f07f85c8754ccf22f5189c83ef671b8edd415f161d7be', '2026-09-11 21:58:20.529715+00', NULL, '2026-08-28 21:58:20.529715+00'),
    ('e58a9509-9f41-4dcc-a4cf-08043c51bdce', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'c66e1c111829ff64d78f07f85c8754ccf22f5189c83ef671b8edd415f161d7be', '2026-09-11 21:58:20.415629+00', NULL, '2026-08-28 21:58:20.415629+00'),
    ('0107ea2a-c805-4fcf-9237-7b963e1a2efd', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '3cb24aace3c5d3a2b9370855da8d151c9728f467331e198f1965cc21b167336d', '2026-09-12 00:30:36.680325+00', '2026-08-29 00:46:00.682877+00', '2026-08-29 00:30:36.680325+00'),
    ('c70d9bb2-dff0-4ef4-8343-2baa0d0ae70d', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'c66e1c111829ff64d78f07f85c8754ccf22f5189c83ef671b8edd415f161d7be', '2026-09-11 21:58:20.562628+00', NULL, '2026-08-28 21:58:20.562628+00'),
    ('e69ff214-6972-475f-b18b-e9f1be0461f1', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'e91797aecb6e8552751663d1f6384308832aa9a450f7f93624b7d6799c9c85be', '2026-09-11 21:37:40.450655+00', '2026-08-28 21:58:20.45606+00', '2026-08-28 21:37:40.450655+00'),
    ('4b1eebc4-3eef-4fb3-bf9f-fb0ded32f5ba', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'c66e1c111829ff64d78f07f85c8754ccf22f5189c83ef671b8edd415f161d7be', '2026-09-11 21:58:20.45606+00', NULL, '2026-08-28 21:58:20.45606+00'),
    ('1f6ff38e-290e-41b8-a014-186bf56f951b', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'cd7ac11193d49382eb8db2b2a0f185416ab31dd0600b9fc250e8da61c051553f', '2026-09-11 22:13:37.816649+00', '2026-08-28 22:28:41.731454+00', '2026-08-28 22:13:37.816649+00'),
    ('ae1b8c2b-eda0-487d-b67c-f3a6c1865bff', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'd72cbf433f77c4c77ca508821ffb1ade0b82dddc5710d9a2d9ca4b28689a1274', '2026-09-11 22:28:41.731454+00', '2026-08-28 22:44:07.884813+00', '2026-08-28 22:28:41.731454+00'),
    ('3cd0f9a4-5d50-427c-a897-d35f599fc391', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'aec4d9155b0c0314e0d8fff00f479ce47c68d1b235d75332b52db0193307bd41', '2026-09-11 22:44:07.884813+00', '2026-08-28 22:59:19.86628+00', '2026-08-28 22:44:07.884813+00'),
    ('42d5e131-c085-45be-9af5-37e2e0e85fc3', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '81d55ee623633c3b0468892cfe7f46e4ceaef084804e6ec361b1544664f25983', '2026-09-11 23:02:30.93225+00', NULL, '2026-08-28 23:02:30.93225+00'),
    ('33434fef-d43d-49af-8110-dccbeb571fad', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '71f480ad24c687a4d064503c024fc31d8f321244b6a39a7621851d40fb945294', '2026-09-11 22:45:20.448725+00', '2026-08-28 23:02:31.297277+00', '2026-08-28 22:45:20.448725+00'),
    ('65735ebc-05ef-42be-87d4-ae5a2299cff3', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'd987c944d5acfebee87c6b829753473d72566fb895b6bd905fd19b04ff0d8148', '2026-09-11 23:02:31.297277+00', NULL, '2026-08-28 23:02:31.297277+00'),
    ('e6108fce-7b33-4ac1-ba8f-6a0b385523c6', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'b7748aff3cd8b8784a912ae77d55d0d3dce96bff65ce04c72583564c49e6faa5', '2026-09-11 22:59:19.86628+00', '2026-08-28 23:14:33.893089+00', '2026-08-28 22:59:19.86628+00'),
    ('78bfb2d6-d6cc-48c4-8740-70b550d31a60', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'f6b093808244667176a34aaa2157da192881b34a22d6991d872e6a8d9359b30b', '2026-09-11 23:14:33.893089+00', '2026-08-28 23:29:35.448274+00', '2026-08-28 23:14:33.893089+00');
INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at) VALUES
    ('3d3fc099-6828-4b7d-8c11-045b582aff84', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '6730c4a849ddb2d8296dfa7cbb7f8896fecabdd616426238e8f5c6524acb4510', '2026-09-11 23:29:35.448274+00', '2026-08-28 23:44:37.234525+00', '2026-08-28 23:29:35.448274+00'),
    ('8913a8c0-b8fd-460b-9af0-ae2fc7dfbe39', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'd4c170b03081300c3898ca4e3c82d91c2b81e17af853a2716d0b59d70bd19497', '2026-09-11 23:44:37.234525+00', '2026-08-29 00:00:09.214712+00', '2026-08-28 23:44:37.234525+00'),
    ('1d3d0b92-e6c3-4121-ac51-3711c7f49f4e', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'a6dc68e8582da9d68c9dc8bc36b5cc5ced5494c598f10f1b3bb5496b8231ffbf', '2026-09-12 00:00:09.214712+00', '2026-08-29 00:15:17.451098+00', '2026-08-29 00:00:09.214712+00'),
    ('f08de905-c8ca-41b4-b161-d4b3f3cc263b', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '3cb24aace3c5d3a2b9370855da8d151c9728f467331e198f1965cc21b167336d', '2026-09-12 00:30:36.681416+00', NULL, '2026-08-29 00:30:36.681416+00'),
    ('859cc687-a9ef-4d5c-a328-feb9cb6af5af', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'd987c944d5acfebee87c6b829753473d72566fb895b6bd905fd19b04ff0d8148', '2026-09-11 23:02:31.249235+00', '2026-08-29 01:23:04.129488+00', '2026-08-28 23:02:31.249235+00'),
    ('3bb3a200-0f07-42f4-a869-480aa744e0c9', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '3cb24aace3c5d3a2b9370855da8d151c9728f467331e198f1965cc21b167336d', '2026-09-12 00:30:36.695118+00', NULL, '2026-08-29 00:30:36.695118+00'),
    ('208dd328-3b1e-4b74-a7c3-a9e81aaed5ad', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '3cb24aace3c5d3a2b9370855da8d151c9728f467331e198f1965cc21b167336d', '2026-09-12 00:30:36.769453+00', NULL, '2026-08-29 00:30:36.769453+00'),
    ('0bbef000-f81f-4f8f-ba64-8ef2afeb2b90', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '3cb24aace3c5d3a2b9370855da8d151c9728f467331e198f1965cc21b167336d', '2026-09-12 00:30:36.792819+00', NULL, '2026-08-29 00:30:36.792819+00'),
    ('86dfda51-2b14-4698-8df0-fea13f02ffa6', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '3cb24aace3c5d3a2b9370855da8d151c9728f467331e198f1965cc21b167336d', '2026-09-12 00:30:36.777525+00', NULL, '2026-08-29 00:30:36.777525+00'),
    ('a9c332e0-c7b1-461b-b20b-af26e6593541', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '3cb24aace3c5d3a2b9370855da8d151c9728f467331e198f1965cc21b167336d', '2026-09-12 00:30:36.854029+00', NULL, '2026-08-29 00:30:36.854029+00'),
    ('feb22876-7f94-40bd-8360-527dfc80cb39', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '3cb24aace3c5d3a2b9370855da8d151c9728f467331e198f1965cc21b167336d', '2026-09-12 00:30:36.867088+00', NULL, '2026-08-29 00:30:36.867088+00'),
    ('bffdb0fd-7c4d-4671-a70b-51f9cc228be5', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '3cb24aace3c5d3a2b9370855da8d151c9728f467331e198f1965cc21b167336d', '2026-09-12 00:30:36.863939+00', NULL, '2026-08-29 00:30:36.863939+00'),
    ('5e55d8ad-cba2-4590-8c54-2a222d6547c5', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '3cb24aace3c5d3a2b9370855da8d151c9728f467331e198f1965cc21b167336d', '2026-09-12 00:30:36.853067+00', NULL, '2026-08-29 00:30:36.853067+00'),
    ('c0611550-a4da-4254-93b5-eff7f3987b10', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '3cb24aace3c5d3a2b9370855da8d151c9728f467331e198f1965cc21b167336d', '2026-09-12 00:30:36.776559+00', NULL, '2026-08-29 00:30:36.776559+00'),
    ('d8456b52-17ca-457d-949f-c18c8d445f9e', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '3cb24aace3c5d3a2b9370855da8d151c9728f467331e198f1965cc21b167336d', '2026-09-12 00:30:36.901528+00', NULL, '2026-08-29 00:30:36.901528+00'),
    ('700ce825-09bf-4ee6-a580-853f6b77fb75', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '5b4313c7dbe22adeeaca589949223619a2a50fff182b9e93bcfafee2e8029764', '2026-09-12 00:15:17.451098+00', '2026-08-29 00:30:36.913418+00', '2026-08-29 00:15:17.451098+00'),
    ('f3c40a11-c067-4e84-850a-de5028d4963a', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '3cb24aace3c5d3a2b9370855da8d151c9728f467331e198f1965cc21b167336d', '2026-09-12 00:30:36.913418+00', NULL, '2026-08-29 00:30:36.913418+00'),
    ('2ef6a2b6-04cc-4d37-8210-d7977d085bde', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bdff71b33010f29218ead8f7b30f0ee001bd6d555210a9a73449e00a464bac8a', '2026-09-12 00:46:00.682877+00', '2026-08-29 01:01:03.465521+00', '2026-08-29 00:46:00.682877+00'),
    ('85f5abb6-21ea-4355-8983-2729d2828604', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '1fa6901b96aa9f1c92f0bbd0bdea0fc4c606ea50584484fc18e5f8b578041939', '2026-09-12 01:01:03.465521+00', '2026-08-29 01:16:29.164226+00', '2026-08-29 01:01:03.465521+00'),
    ('d5a7d798-2e2e-42c9-9730-7e88c65b1ea9', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '539ecfd72d6c0a953de1715fb886bb74ce4f87b2894e35a49cfcbceab6bb99e2', '2026-09-12 01:16:29.164226+00', NULL, '2026-08-29 01:16:29.164226+00'),
    ('6ab799b3-783e-4a04-847f-73e99e19c631', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '7dbe03609111ad6e8ccdee4a8acfd76d71c98c5ca462c080be0c3eaaa4ec3e1a', '2026-09-12 01:23:03.998428+00', NULL, '2026-08-29 01:23:03.998428+00'),
    ('84cfc953-cfb8-4ea0-8d98-f6b54efa23e7', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '7dbe03609111ad6e8ccdee4a8acfd76d71c98c5ca462c080be0c3eaaa4ec3e1a', '2026-09-12 01:23:04.01079+00', NULL, '2026-08-29 01:23:04.01079+00'),
    ('3e996afc-b832-4b63-a582-298c5f4425c9', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'afbaa51bd8502ecb7032f4db85426e06facf8723bea9575194ebdad6740d3a97', '2026-09-12 01:23:04.093412+00', NULL, '2026-08-29 01:23:04.093412+00'),
    ('1626d69b-b205-4f27-ab63-f730cb241142', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'afbaa51bd8502ecb7032f4db85426e06facf8723bea9575194ebdad6740d3a97', '2026-09-12 01:23:04.094358+00', NULL, '2026-08-29 01:23:04.094358+00'),
    ('1f181448-9773-4034-92a7-9477f9a3967a', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'afbaa51bd8502ecb7032f4db85426e06facf8723bea9575194ebdad6740d3a97', '2026-09-12 01:23:04.129488+00', NULL, '2026-08-29 01:23:04.129488+00'),
    ('0615c3e8-463b-4ecc-a3dc-687e7311d5e1', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '2fdb4acae722255b055620d7ab84fd9077adca03b2d57d8961deb285639e6d5b', '2026-09-12 11:06:59.420112+00', NULL, '2026-08-29 11:06:59.420112+00'),
    ('0763f0f6-64dd-427d-9318-85e297e1f0ce', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '154b414a989e9fe6cb2ab55ecf3b02eec669e77bf706c4afab53226c470b803c', '2026-09-12 12:49:10.649834+00', '2026-08-29 13:04:26.023971+00', '2026-08-29 12:49:10.649834+00'),
    ('3d599d50-313b-4836-b8d9-faa289b0d864', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'be8f987dff2b1ec5edd4d822886d95373251fb3f4c9857cf4e44535103abcbc1', '2026-09-12 01:23:04.403027+00', NULL, '2026-08-29 01:23:04.403027+00'),
    ('e3c76da2-2779-4372-91a4-0ca568592d28', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bb2c3b932fa921bd843ed87a0da188a5a79de46f3509e9104b6e6080029746ee', '2026-09-12 11:07:00.3236+00', NULL, '2026-08-29 11:07:00.3236+00'),
    ('63ea6b77-3a8e-4ee5-840c-ee55e48e354b', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'be8f987dff2b1ec5edd4d822886d95373251fb3f4c9857cf4e44535103abcbc1', '2026-09-12 01:23:04.415271+00', NULL, '2026-08-29 01:23:04.415271+00'),
    ('f9ca5159-57c3-4da8-8f45-d1b43c8ac7a9', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '2c1037372367cc95dfd3a1597d5059a1b9e83ddd9b726bfac0dacdf2b78c761e', '2026-09-12 01:18:12.752545+00', '2026-08-29 01:23:04.506106+00', '2026-08-29 01:18:12.752545+00'),
    ('e9aba1a6-cb6b-4ff1-befe-f7045d904840', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'be8f987dff2b1ec5edd4d822886d95373251fb3f4c9857cf4e44535103abcbc1', '2026-09-12 01:23:04.506106+00', NULL, '2026-08-29 01:23:04.506106+00'),
    ('665a6a25-bc89-4417-8fe6-d46fefb97ced', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'be8f987dff2b1ec5edd4d822886d95373251fb3f4c9857cf4e44535103abcbc1', '2026-09-12 01:23:04.393424+00', '2026-08-29 01:38:35.441531+00', '2026-08-29 01:23:04.393424+00'),
    ('f460ec39-574e-458c-aa76-60266b49d788', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '3fffa82cf50f3e3274dda7171d83c491b97c4911dfcd70ed828f8684be123865', '2026-09-12 09:51:18.990396+00', NULL, '2026-08-29 09:51:18.990396+00'),
    ('6f206b2c-ebc8-4a6f-9823-c95b70808f63', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bb2c3b932fa921bd843ed87a0da188a5a79de46f3509e9104b6e6080029746ee', '2026-09-12 11:07:00.525459+00', NULL, '2026-08-29 11:07:00.525459+00'),
    ('33fca713-820b-4f37-9687-a8e732f267a1', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '3fffa82cf50f3e3274dda7171d83c491b97c4911dfcd70ed828f8684be123865', '2026-09-12 09:51:18.988403+00', NULL, '2026-08-29 09:51:18.988403+00'),
    ('5ca5b7e0-9cec-4be3-a173-d3a7bbcde7f8', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bb2c3b932fa921bd843ed87a0da188a5a79de46f3509e9104b6e6080029746ee', '2026-09-12 11:07:00.82086+00', NULL, '2026-08-29 11:07:00.82086+00'),
    ('fa3df1fb-7fbb-4c07-8adf-06c01c59e56a', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'ec0d5de2cd1c1998aecfbd22a62000f5d7196e4cc01926407a8b0417ae3505d0', '2026-09-12 09:51:19.126862+00', '2026-08-29 11:07:01.120105+00', '2026-08-29 09:51:19.126862+00'),
    ('cf60c442-d40b-43da-9086-0ae61cb29fd4', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'ec0d5de2cd1c1998aecfbd22a62000f5d7196e4cc01926407a8b0417ae3505d0', '2026-09-12 09:51:19.423268+00', NULL, '2026-08-29 09:51:19.423268+00'),
    ('07ef504d-f387-44ed-84a5-58c6b8a39c61', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'ec0d5de2cd1c1998aecfbd22a62000f5d7196e4cc01926407a8b0417ae3505d0', '2026-09-12 09:51:19.583498+00', NULL, '2026-08-29 09:51:19.583498+00'),
    ('3f595b4a-9fe3-4e23-99e4-531500547987', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'ec0d5de2cd1c1998aecfbd22a62000f5d7196e4cc01926407a8b0417ae3505d0', '2026-09-12 09:51:19.08395+00', '2026-08-29 11:07:01.319434+00', '2026-08-29 09:51:19.08395+00'),
    ('cb0f9f30-5709-4a21-8837-203145035ea3', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'ec0d5de2cd1c1998aecfbd22a62000f5d7196e4cc01926407a8b0417ae3505d0', '2026-09-12 09:51:19.498625+00', NULL, '2026-08-29 09:51:19.498625+00'),
    ('844b602a-3291-4089-a10e-df7aecb61e13', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'ec0d5de2cd1c1998aecfbd22a62000f5d7196e4cc01926407a8b0417ae3505d0', '2026-09-12 09:51:19.592659+00', NULL, '2026-08-29 09:51:19.592659+00'),
    ('f8372a37-c106-4480-beed-3ad9449fa1f2', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'ec0d5de2cd1c1998aecfbd22a62000f5d7196e4cc01926407a8b0417ae3505d0', '2026-09-12 09:51:19.537615+00', NULL, '2026-08-29 09:51:19.537615+00'),
    ('d3780537-0e97-4a1e-96f4-9fc0478bf4da', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'ec0d5de2cd1c1998aecfbd22a62000f5d7196e4cc01926407a8b0417ae3505d0', '2026-09-12 09:51:19.525626+00', NULL, '2026-08-29 09:51:19.525626+00'),
    ('bb5886ab-d67b-4511-9844-c60e5f9a8dc4', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'ec0d5de2cd1c1998aecfbd22a62000f5d7196e4cc01926407a8b0417ae3505d0', '2026-09-12 09:51:19.630165+00', NULL, '2026-08-29 09:51:19.630165+00'),
    ('22c66082-e3c8-4b28-9082-9a2bb6c94a75', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '022e69e749948b714e1415c6df09680e277d9b46257f40a424b8b732a9599766', '2026-09-12 01:38:35.441531+00', '2026-08-29 09:51:19.535915+00', '2026-08-29 01:38:35.441531+00'),
    ('877b4b92-6512-4336-9c3d-6d3c16726e24', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'ec0d5de2cd1c1998aecfbd22a62000f5d7196e4cc01926407a8b0417ae3505d0', '2026-09-12 09:51:19.535915+00', NULL, '2026-08-29 09:51:19.535915+00'),
    ('f0131bc1-aa34-496e-afa1-0129a933775a', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '154b414a989e9fe6cb2ab55ecf3b02eec669e77bf706c4afab53226c470b803c', '2026-09-12 12:49:10.653549+00', NULL, '2026-08-29 12:49:10.653549+00'),
    ('df574dd7-c447-4996-b69e-55896cf31cf9', '291b2bd3-c527-4b7b-a0f7-8882177a095c', 'ffad9400bc4ebf37c072569053847d7256950fb1aa50a9b61203eb55eadefae3', '2026-09-12 12:49:10.150571+00', NULL, '2026-08-29 12:49:10.150571+00');
INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at) VALUES
    ('d3889240-cecf-4b80-89f8-36441e68ee6e', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'caf13395964805b7c07dc3f8e07797f7c156ffb858e2cfcf1528e579caae7ad7', '2026-09-12 11:07:02.241558+00', '2026-08-29 13:15:42.55922+00', '2026-08-29 11:07:02.241558+00'),
    ('2a626119-2652-4bbd-b2ab-33552457f29d', '291b2bd3-c527-4b7b-a0f7-8882177a095c', 'ffad9400bc4ebf37c072569053847d7256950fb1aa50a9b61203eb55eadefae3', '2026-09-12 12:49:10.343403+00', NULL, '2026-08-29 12:49:10.343403+00'),
    ('d8749cd8-8407-48ee-8b02-b7ddc9d4789b', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '041d888b761efe7a6b70d79dc2c7a6961c3679f3d98d2ec6869ece2663d8a86e', '2026-09-12 11:07:02.171291+00', '2026-08-29 12:49:10.343099+00', '2026-08-29 11:07:02.171291+00'),
    ('a4c720f3-a70a-4ab7-95b1-bbfd4b69d1c4', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '154b414a989e9fe6cb2ab55ecf3b02eec669e77bf706c4afab53226c470b803c', '2026-09-12 12:49:10.455436+00', NULL, '2026-08-29 12:49:10.455436+00'),
    ('c5b50c59-5e1d-4ec8-b801-7c05f9af96f6', '291b2bd3-c527-4b7b-a0f7-8882177a095c', 'ffad9400bc4ebf37c072569053847d7256950fb1aa50a9b61203eb55eadefae3', '2026-09-12 12:49:10.343099+00', NULL, '2026-08-29 12:49:10.343099+00'),
    ('d9e57f1d-b170-46ab-86fe-abbbc255a0ad', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '154b414a989e9fe6cb2ab55ecf3b02eec669e77bf706c4afab53226c470b803c', '2026-09-12 12:49:10.655244+00', NULL, '2026-08-29 12:49:10.655244+00'),
    ('08cf79b4-a5f2-4beb-97a4-ffa70b0edc23', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'd75ff2c6ee1d3a7cbebc2f8fdb74f2dd0201afbfd81e4c0b0714b46041ab0f38', '2026-09-12 11:07:01.319434+00', '2026-08-29 12:49:10.926637+00', '2026-08-29 11:07:01.319434+00'),
    ('a8045048-4d68-4720-8090-226a083599ea', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '154b414a989e9fe6cb2ab55ecf3b02eec669e77bf706c4afab53226c470b803c', '2026-09-12 12:49:10.688122+00', NULL, '2026-08-29 12:49:10.688122+00'),
    ('29f60ca4-c73e-410d-8b6c-f4cf434698f3', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '154b414a989e9fe6cb2ab55ecf3b02eec669e77bf706c4afab53226c470b803c', '2026-09-12 12:49:10.926637+00', NULL, '2026-08-29 12:49:10.926637+00'),
    ('a3896578-9029-4d46-b9e8-37688efe8108', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '154b414a989e9fe6cb2ab55ecf3b02eec669e77bf706c4afab53226c470b803c', '2026-09-12 12:49:10.786023+00', NULL, '2026-08-29 12:49:10.786023+00'),
    ('6e6cddd7-6eb9-4274-9967-9624e9e912d7', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '154b414a989e9fe6cb2ab55ecf3b02eec669e77bf706c4afab53226c470b803c', '2026-09-12 12:49:10.79247+00', NULL, '2026-08-29 12:49:10.79247+00'),
    ('336f6ca0-c2dd-44e0-9005-35ff085d5c77', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '154b414a989e9fe6cb2ab55ecf3b02eec669e77bf706c4afab53226c470b803c', '2026-09-12 12:49:10.843519+00', NULL, '2026-08-29 12:49:10.843519+00'),
    ('b655fce1-401f-4282-944f-2d471b291dd0', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '154b414a989e9fe6cb2ab55ecf3b02eec669e77bf706c4afab53226c470b803c', '2026-09-12 12:49:10.78879+00', NULL, '2026-08-29 12:49:10.78879+00'),
    ('f7231072-ef6e-4218-be02-b48bfdf2e222', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '154b414a989e9fe6cb2ab55ecf3b02eec669e77bf706c4afab53226c470b803c', '2026-09-12 12:49:10.787449+00', NULL, '2026-08-29 12:49:10.787449+00'),
    ('cec7bf4a-9ffc-49a4-a730-17994902dd7d', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '154b414a989e9fe6cb2ab55ecf3b02eec669e77bf706c4afab53226c470b803c', '2026-09-12 12:49:10.924118+00', NULL, '2026-08-29 12:49:10.924118+00'),
    ('b4d30df2-f53a-47cd-b78a-32e0db4250a9', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'd75ff2c6ee1d3a7cbebc2f8fdb74f2dd0201afbfd81e4c0b0714b46041ab0f38', '2026-09-12 11:07:01.120105+00', '2026-08-29 12:49:10.699769+00', '2026-08-29 11:07:01.120105+00'),
    ('0085f0e0-6701-4ee1-b729-5eedd67fafc8', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '154b414a989e9fe6cb2ab55ecf3b02eec669e77bf706c4afab53226c470b803c', '2026-09-12 12:49:10.699769+00', NULL, '2026-08-29 12:49:10.699769+00'),
    ('6cb8d8f7-a152-4a4f-9b80-970d51194d69', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '21bb4c31e3823b934db94834b83f846213c434c4f4e4d23edd6b5b7940f886fb', '2026-09-12 13:15:42.359831+00', NULL, '2026-08-29 13:15:42.359831+00'),
    ('b6ed1d93-bbee-43e2-9ac7-3b1d2376e5cf', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '21bb4c31e3823b934db94834b83f846213c434c4f4e4d23edd6b5b7940f886fb', '2026-09-12 13:15:42.55922+00', NULL, '2026-08-29 13:15:42.55922+00'),
    ('4b47e7ef-e9d8-4a50-8a61-a9d2f6a6f1c6', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '21bb4c31e3823b934db94834b83f846213c434c4f4e4d23edd6b5b7940f886fb', '2026-09-12 13:15:42.289519+00', '2026-08-29 13:15:43.369837+00', '2026-08-29 13:15:42.289519+00'),
    ('5e625b25-69c7-4f5f-bd71-1f7f8aaec2df', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '833b70cff0d5f929293c80af40bfe8e7488d8900103d5e8b6f8c848ef0e2e78f', '2026-09-12 13:15:43.369837+00', '2026-08-29 13:15:46.477529+00', '2026-08-29 13:15:43.369837+00'),
    ('78327c04-9167-4d1d-9d05-dc89cd38a82f', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bcc87b4ddbb3cb3be6975fde72e178f81f35821a863a533df3d0d416afef8fc7', '2026-09-12 14:27:28.489287+00', NULL, '2026-08-29 14:27:28.489287+00'),
    ('43a8fe75-a4f0-4cc6-a211-5db6f50a9665', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '72ed8ba7674f1bbe77d3859968fe1283943112b6effc926c77ad985ce619729d', '2026-09-12 14:27:28.489155+00', NULL, '2026-08-29 14:27:28.489155+00'),
    ('bfe2d27d-3ea9-4881-a7c1-6163bc97ec84', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '72ed8ba7674f1bbe77d3859968fe1283943112b6effc926c77ad985ce619729d', '2026-09-12 14:27:28.538214+00', NULL, '2026-08-29 14:27:28.538214+00'),
    ('d81ba3c7-74bb-4b50-9a03-66ff5411060e', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bcc87b4ddbb3cb3be6975fde72e178f81f35821a863a533df3d0d416afef8fc7', '2026-09-12 14:27:28.49185+00', NULL, '2026-08-29 14:27:28.49185+00'),
    ('9efdaff8-e34c-40a0-93be-eb55e03535ea', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bcc87b4ddbb3cb3be6975fde72e178f81f35821a863a533df3d0d416afef8fc7', '2026-09-12 14:27:28.543823+00', NULL, '2026-08-29 14:27:28.543823+00'),
    ('8a22ce6d-5037-42d6-8989-13336dc6fdc6', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '72ed8ba7674f1bbe77d3859968fe1283943112b6effc926c77ad985ce619729d', '2026-09-12 14:27:28.593965+00', NULL, '2026-08-29 14:27:28.593965+00'),
    ('a844ddc6-6fa8-43b8-8019-73d7c7c252e9', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bcc87b4ddbb3cb3be6975fde72e178f81f35821a863a533df3d0d416afef8fc7', '2026-09-12 14:27:28.538405+00', NULL, '2026-08-29 14:27:28.538405+00'),
    ('b60fb64a-69e8-4106-b04b-69324680cc75', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '72ed8ba7674f1bbe77d3859968fe1283943112b6effc926c77ad985ce619729d', '2026-09-12 14:27:28.54101+00', NULL, '2026-08-29 14:27:28.54101+00'),
    ('b2b8ae58-cb77-4758-8deb-c5bb1baa004d', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '2bc6e688ea819f283da6e4bd00887f4687351e15c40783aba3e6ce96d6941c3d', '2026-09-12 13:15:46.477529+00', '2026-08-29 14:27:28.584686+00', '2026-08-29 13:15:46.477529+00'),
    ('c8ac1303-320a-4f44-a61c-861656ad83f3', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bcc87b4ddbb3cb3be6975fde72e178f81f35821a863a533df3d0d416afef8fc7', '2026-09-12 14:27:28.545034+00', NULL, '2026-08-29 14:27:28.545034+00'),
    ('72c69cdd-5bd2-4fb1-9ee6-f85ad2464186', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '72ed8ba7674f1bbe77d3859968fe1283943112b6effc926c77ad985ce619729d', '2026-09-12 14:27:28.584686+00', NULL, '2026-08-29 14:27:28.584686+00'),
    ('c342bed6-c3ca-48c7-be4e-b145a214a60e', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bcc87b4ddbb3cb3be6975fde72e178f81f35821a863a533df3d0d416afef8fc7', '2026-09-12 14:27:28.665319+00', NULL, '2026-08-29 14:27:28.665319+00'),
    ('1d96a35a-4306-49c7-a59d-38e3ce2ccc64', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bcc87b4ddbb3cb3be6975fde72e178f81f35821a863a533df3d0d416afef8fc7', '2026-09-12 14:27:28.770205+00', NULL, '2026-08-29 14:27:28.770205+00'),
    ('3d9d9a3b-462d-4b07-a611-86c55ab41b81', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bcc87b4ddbb3cb3be6975fde72e178f81f35821a863a533df3d0d416afef8fc7', '2026-09-12 14:27:28.539423+00', NULL, '2026-08-29 14:27:28.539423+00'),
    ('8a84394e-0c71-479f-8907-6ba6215b3654', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bcc87b4ddbb3cb3be6975fde72e178f81f35821a863a533df3d0d416afef8fc7', '2026-09-12 14:27:28.590758+00', NULL, '2026-08-29 14:27:28.590758+00'),
    ('12e3571c-6329-4c5d-9920-eaadfa5b6db5', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bcc87b4ddbb3cb3be6975fde72e178f81f35821a863a533df3d0d416afef8fc7', '2026-09-12 14:27:28.638971+00', NULL, '2026-08-29 14:27:28.638971+00'),
    ('03bc117f-d166-42e3-a6a4-2a21adb1fa25', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '431a4c542d2f56f1e2f45766c3fbd27d50a1652638fb8dff9b5df7dcfa692459', '2026-09-12 13:04:26.023971+00', '2026-08-29 14:27:28.640263+00', '2026-08-29 13:04:26.023971+00'),
    ('7740e274-9e4b-41ab-a366-7d4958c03bbb', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bcc87b4ddbb3cb3be6975fde72e178f81f35821a863a533df3d0d416afef8fc7', '2026-09-12 14:27:28.640263+00', NULL, '2026-08-29 14:27:28.640263+00'),
    ('e0e73961-01d1-49c2-8c7a-2ba07245a389', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'a9566c41901c13e71680d1855f383044e34e2212d86257ce4adfd816f86aa0e7', '2026-09-12 14:40:16.964513+00', '2026-08-29 14:55:24.068852+00', '2026-08-29 14:40:16.964513+00'),
    ('6c30d7ea-9858-4ace-a18f-0d85002fe0d7', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '60ccacaa04650bdf2c5947260724de4fad4c76f7c965c805bcd551a4a9c8524b', '2026-09-12 14:55:24.068852+00', '2026-08-29 15:10:28.492687+00', '2026-08-29 14:55:24.068852+00'),
    ('7e60e917-7823-44d8-8877-502ff18a1d38', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '6662d5cb363af7c292d6b4c7d5bcc02961f2222aecec13be37ecc32d7a8e7111', '2026-09-14 12:07:33.285498+00', '2026-08-31 12:22:39.000097+00', '2026-08-31 12:07:33.285498+00'),
    ('eefbf378-9f86-4122-8177-1d2e23aa2a52', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'fd6854854d600a1239d78482b85b53547044774947b5ca7f817ead3e5f254de7', '2026-09-14 12:13:13.672316+00', NULL, '2026-08-31 12:13:13.672316+00'),
    ('1a6a7244-0a4b-4345-8699-5383a821bd98', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'a4ebeffae247da6189d506075f778df629cb5ec725922dc794f524399931d783', '2026-09-12 15:25:34.549292+00', NULL, '2026-08-29 15:25:34.549292+00'),
    ('4dffb589-c932-4574-b1e2-03c5a13dde99', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'a4ebeffae247da6189d506075f778df629cb5ec725922dc794f524399931d783', '2026-09-12 15:25:34.547436+00', NULL, '2026-08-29 15:25:34.547436+00'),
    ('78651041-189f-4786-be6e-f8e7e67a767f', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'fd6854854d600a1239d78482b85b53547044774947b5ca7f817ead3e5f254de7', '2026-09-14 12:13:13.658217+00', NULL, '2026-08-31 12:13:13.658217+00'),
    ('7ad425f5-79df-4e1f-8bf3-a8ef4652352a', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'a4ebeffae247da6189d506075f778df629cb5ec725922dc794f524399931d783', '2026-09-12 15:25:34.564947+00', NULL, '2026-08-29 15:25:34.564947+00'),
    ('85d7e579-7a08-4423-b501-1d09b041debc', '291b2bd3-c527-4b7b-a0f7-8882177a095c', 'ea7bc56d30884f83ea263b1e60eb09f1efd9c9e4cd2856013aa0968f9470da3c', '2026-09-14 12:20:02.218552+00', '2026-08-31 12:23:14.456145+00', '2026-08-31 12:20:02.218552+00'),
    ('d9172486-9a19-4b3f-b7b7-81ddcc68c022', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'a4ebeffae247da6189d506075f778df629cb5ec725922dc794f524399931d783', '2026-09-12 15:25:34.614929+00', NULL, '2026-08-29 15:25:34.614929+00'),
    ('aed2adff-b7e8-4557-8560-13895890ebed', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'fd6854854d600a1239d78482b85b53547044774947b5ca7f817ead3e5f254de7', '2026-09-14 12:13:13.735528+00', NULL, '2026-08-31 12:13:13.735528+00');
INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at) VALUES
    ('2e6efe3a-6889-413e-bdd2-24684e7e697d', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'a4ebeffae247da6189d506075f778df629cb5ec725922dc794f524399931d783', '2026-09-12 15:25:34.682975+00', NULL, '2026-08-29 15:25:34.682975+00'),
    ('bc4adb27-51ea-4b88-815f-39cfb568ac1b', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'a4ebeffae247da6189d506075f778df629cb5ec725922dc794f524399931d783', '2026-09-12 15:25:34.563641+00', NULL, '2026-08-29 15:25:34.563641+00'),
    ('28957358-c77a-4f4b-808b-eaf1034da439', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'fd6854854d600a1239d78482b85b53547044774947b5ca7f817ead3e5f254de7', '2026-09-14 12:13:13.72848+00', NULL, '2026-08-31 12:13:13.72848+00'),
    ('c9f6e412-d2f1-449c-bfaf-16a7d64329b2', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'a4ebeffae247da6189d506075f778df629cb5ec725922dc794f524399931d783', '2026-09-12 15:25:34.729629+00', NULL, '2026-08-29 15:25:34.729629+00'),
    ('2c58ff02-6ac8-4fe8-83fe-b58348de1bce', '291b2bd3-c527-4b7b-a0f7-8882177a095c', 'f029db4695d144a4147cedb3c49e0ef8af86f985a8e9abf73998cf26061114f8', '2026-09-14 12:22:39.000097+00', '2026-08-31 12:38:05.927076+00', '2026-08-31 12:22:39.000097+00'),
    ('23475d17-aa54-40f5-bc0e-ad9cd5fd992a', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'a4ebeffae247da6189d506075f778df629cb5ec725922dc794f524399931d783', '2026-09-12 15:25:34.730779+00', NULL, '2026-08-29 15:25:34.730779+00'),
    ('cca7bb2b-bfee-471e-9ccc-f744c7dd49f7', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '432d0b161474d0963174a5d285d6f81825f42f5a8d91de15a286d96e65a41b1a', '2026-09-12 15:10:28.492687+00', '2026-08-29 15:25:34.828577+00', '2026-08-29 15:10:28.492687+00'),
    ('a751dd0b-8bad-4826-a94c-ef3d1f95a178', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'a4ebeffae247da6189d506075f778df629cb5ec725922dc794f524399931d783', '2026-09-12 15:25:34.828577+00', NULL, '2026-08-29 15:25:34.828577+00'),
    ('39e112c8-3bcd-4f0a-8634-b4679bf1d295', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'a4ebeffae247da6189d506075f778df629cb5ec725922dc794f524399931d783', '2026-09-12 15:25:34.498445+00', '2026-08-29 15:40:58.237493+00', '2026-08-29 15:25:34.498445+00'),
    ('cc2512f6-983e-4df2-8a1c-5d8ac79c30ff', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'cba5fd15ce4c19035d1c03bbae5ba1f362df654bbfc2ea45d52c1102226c8f34', '2026-09-12 15:40:58.237493+00', '2026-08-29 15:56:04.578702+00', '2026-08-29 15:40:58.237493+00'),
    ('234e6a15-0df0-44eb-a97d-6c985acbac9d', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'baa1dc82ce6a4ed7a7efaa328b7bd990c2c56d74a269d9af081e9dcc9f16dc6d', '2026-09-14 10:27:52.095795+00', '2026-08-31 10:29:52.299893+00', '2026-08-31 10:27:52.095795+00'),
    ('987d71bb-8ccd-4001-85bf-870b445c45a5', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '87f79ddd05493292c3450ac5b052a13e1bb692fe985a6dbac1c2ed2ee4d303da', '2026-09-14 10:29:55.652508+00', '2026-08-31 10:33:46.622793+00', '2026-08-31 10:29:55.652508+00'),
    ('d43cc80e-7fa9-4c47-83dd-3f1e802362d8', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'ef4706b83b176051279fd0dbb87c4857cadfa024fde32ecf7db706939bb500da', '2026-09-14 10:33:51.875243+00', '2026-08-31 10:34:42.360697+00', '2026-08-31 10:33:51.875243+00'),
    ('f2faebe8-2167-4f30-8e08-25ee754b81d2', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '3834ac583fce9ad4f1ee70a5f08459f8178ca0e759ca4c738e397bf7b9768c26', '2026-09-14 10:34:46.095192+00', '2026-08-31 10:35:18.613086+00', '2026-08-31 10:34:46.095192+00'),
    ('2adf520c-98fb-40b2-af9c-98bd2f922461', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'a78c5f267152ec46ea347a460abd199f53b89ff9ae731089c18ab36be18c0bc8', '2026-09-14 10:35:22.266102+00', '2026-08-31 11:36:34.271503+00', '2026-08-31 10:35:22.266102+00'),
    ('71e57736-08ae-4f34-bd3e-ad35924c1c71', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '63bd5967b3e80e5ceb2dd8656fb8ebf84fc9bcd168cc51b14d7fc020bd4bd5d8', '2026-09-14 11:36:34.271503+00', '2026-08-31 11:39:54.38445+00', '2026-08-31 11:36:34.271503+00'),
    ('3ef95958-737d-483f-89ed-7c10b4400948', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '028ae90df5f0e4a3c43b9eb88bae2821d0cbdbcdddeec4fec1878e175a168008', '2026-09-14 11:39:58.296516+00', '2026-08-31 11:41:18.497589+00', '2026-08-31 11:39:58.296516+00'),
    ('cdabe001-86f5-4222-b772-2bf6780782d9', '291b2bd3-c527-4b7b-a0f7-8882177a095c', 'c6adf1d101a44876afb8b8d0535f3ef0d53fc0f01f8b81899c8ea559106b20b7', '2026-09-14 11:49:15.961476+00', '2026-08-31 12:04:32.67489+00', '2026-08-31 11:49:15.961476+00'),
    ('adfe2d68-678e-4a13-a7ad-c563d576758e', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '0c109263f0ad781da67fd66d6300c7796e8c39de8b72c9962aa2444ce1a1deb1', '2026-09-12 15:56:04.578702+00', '2026-08-31 12:07:28.220454+00', '2026-08-29 15:56:04.578702+00'),
    ('78e2cd56-faa2-49dd-baef-6da5352c81d2', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'b2ac4b29d28134408c978e7210b97714ca2613d0ca7328eec9b4c0b180f034a3', '2026-09-14 12:07:28.220454+00', NULL, '2026-08-31 12:07:28.220454+00'),
    ('41098f4e-2657-4c71-b89c-899fe527bab0', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '2df4ba1848edf43cea37cfad69f59306fffef9b6f244ce79ff3f757b21b0e0c6', '2026-09-14 11:41:22.764466+00', '2026-08-31 12:13:14.106288+00', '2026-08-31 11:41:22.764466+00'),
    ('1bd92af5-a36f-4ad9-85e9-843db24ff068', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bf9953d85479ef413d7dfacfb7e0a6e0e87d0a37280f9ba19e28dd661a030fe1', '2026-09-14 12:13:14.042129+00', '2026-08-31 12:16:53.628098+00', '2026-08-31 12:13:14.042129+00'),
    ('603f58df-e3c8-4641-97bf-22001104a477', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bf9953d85479ef413d7dfacfb7e0a6e0e87d0a37280f9ba19e28dd661a030fe1', '2026-09-14 12:13:14.089279+00', '2026-08-31 12:16:53.628098+00', '2026-08-31 12:13:14.089279+00'),
    ('e13e6330-9e8b-4f46-8dc0-1520d4b037c5', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bf9953d85479ef413d7dfacfb7e0a6e0e87d0a37280f9ba19e28dd661a030fe1', '2026-09-14 12:13:14.106288+00', '2026-08-31 12:16:53.628098+00', '2026-08-31 12:13:14.106288+00'),
    ('ef4c3503-620c-4855-85c3-b4e9bd5533b5', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '9e3a568c44d420568efe0af3aa731624d8145873aace6b375da2054f521f35df', '2026-09-14 12:04:32.67489+00', '2026-08-31 12:20:02.218552+00', '2026-08-31 12:04:32.67489+00'),
    ('06fd09ef-2b06-4cfc-83d9-01fa35a67865', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4d5f4334c447af5f39a774a10eb6e654156cea5305829a116b696bc233409285', '2026-09-14 12:23:32.918146+00', '2026-08-31 12:38:51.763832+00', '2026-08-31 12:23:32.918146+00'),
    ('ddf13094-4bc2-4ee6-878b-998ecef3b9bc', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'dbf5ebd9714506c59f453bc2b01877b6043dc03fe38715c6111931b04a27afbd', '2026-09-14 12:48:37.134794+00', '2026-08-31 13:04:08.81926+00', '2026-08-31 12:48:37.134794+00'),
    ('67618d55-fd03-420f-a4c5-72acf887f91f', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'f3061368bd967814f572a95eb07ea90f07ef5572ac000fd1c48afc97d1f11d8e', '2026-09-14 12:16:57.229708+00', '2026-08-31 12:48:37.428403+00', '2026-08-31 12:16:57.229708+00'),
    ('0ec92d43-3a04-48e1-abf7-94d4a4fca290', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'dbf5ebd9714506c59f453bc2b01877b6043dc03fe38715c6111931b04a27afbd', '2026-09-14 12:48:37.428403+00', NULL, '2026-08-31 12:48:37.428403+00'),
    ('61ba8cf8-fbb1-4301-adc0-861c944c9726', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '10e3934e32adfc607984a06e26cc20fe61268bc0492a76adf52ff51e064001a6', '2026-09-14 12:38:05.927076+00', '2026-08-31 12:53:18.910604+00', '2026-08-31 12:38:05.927076+00'),
    ('2a881bb1-f28c-4257-8588-0ee95f378689', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '3913832199b598ad339ae649562f7bda578c3e86cb495ae57eabd69515a4710a', '2026-09-14 12:38:51.763832+00', '2026-08-31 12:54:03.261831+00', '2026-08-31 12:38:51.763832+00'),
    ('91f836ea-9985-46cf-9391-fe7eb736c97a', '291b2bd3-c527-4b7b-a0f7-8882177a095c', 'a71ef72186f3826ac1ce3405ba9951f51f363ee0502779be65162f63611ab40c', '2026-09-14 12:53:18.910604+00', '2026-08-31 13:08:49.066794+00', '2026-08-31 12:53:18.910604+00'),
    ('27554f03-c902-4510-9b1e-39833e9a7699', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '67184a9dff194567370be3d17c50b91bfe96d4ad326bfc931a3dab10d65822b6', '2026-09-14 12:54:03.261831+00', '2026-08-31 13:09:15.274141+00', '2026-08-31 12:54:03.261831+00'),
    ('d53300fd-74c3-49c2-8b1f-b05e58255b61', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '20bc5ea49e66f93d9257f6dd400a6e5dcec519f5bcc6f132bfbc24e336afde28', '2026-09-14 13:08:49.066794+00', '2026-08-31 13:10:52.878763+00', '2026-08-31 13:08:49.066794+00'),
    ('00ad559f-5103-43f3-8900-19b4645bf737', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '5e56cac9fbcf903c8402b863bab144eed35740b4d00efeb2a9473b8a05d781a7', '2026-09-14 13:10:57.132564+00', NULL, '2026-08-31 13:10:57.132564+00'),
    ('93a79fe8-bc24-4f57-b20e-404938f0dda0', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '6217b29ba5347e2e60b709b0218e7340f397e0956d56deca05f89953838d5552', '2026-09-14 13:17:34.241786+00', NULL, '2026-08-31 13:17:34.241786+00'),
    ('338e35d9-87e7-491b-8c80-18302a03fa0e', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '77ad0a36e03f54f109c6225e2f59c64fb0a18d316f04b2479592a2b8ba596814', '2026-09-14 13:17:50.754884+00', NULL, '2026-08-31 13:17:50.754884+00'),
    ('701bd917-8023-4235-8ab8-7b9f80c76d27', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '372a54356e30eeba98e191a8ea258387fda280aef9ee0bd0993f419c04e7b592', '2026-09-14 13:09:15.274141+00', '2026-08-31 13:24:40.492195+00', '2026-08-31 13:09:15.274141+00'),
    ('5807e470-69e2-4564-afc6-b3e016609613', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '29819bc6210c2a18c4ae0f6258dfd4f3c17df7ef5a2ae814908f9747c8125804', '2026-09-14 13:24:40.492195+00', NULL, '2026-08-31 13:24:40.492195+00'),
    ('eea3872b-48d0-48c2-a23e-7a3dea76f785', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'eecfbbe2080d9effd318fad3b4a9a546c471ec1c089981da07a0641ead5b4521', '2026-09-14 13:24:23.118421+00', '2026-08-31 13:30:34.621977+00', '2026-08-31 13:24:23.118421+00'),
    ('c3bd9c24-a985-4fc8-8cbb-4086c7fc51f1', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bae7999b7feee3fb5950cfd0d08bce7eda3944f4bded321f234c57e435d170bf', '2026-09-14 13:30:34.621977+00', NULL, '2026-08-31 13:30:34.621977+00'),
    ('c0aa9ae3-127d-4bba-bcc1-772f11d41e03', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '33589cd3e5b07658b17f1aa6bb572e799c95cda7c00099984c9965aacea067e3', '2026-09-14 13:30:56.614898+00', NULL, '2026-08-31 13:30:56.614898+00'),
    ('88821413-d43b-430b-b9db-75d879a5caf4', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '33589cd3e5b07658b17f1aa6bb572e799c95cda7c00099984c9965aacea067e3', '2026-09-14 13:30:56.978431+00', NULL, '2026-08-31 13:30:56.978431+00'),
    ('a36c3bac-3a17-4eec-a50f-cdb80d2095e4', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '33589cd3e5b07658b17f1aa6bb572e799c95cda7c00099984c9965aacea067e3', '2026-09-14 13:30:56.987427+00', NULL, '2026-08-31 13:30:56.987427+00'),
    ('25feeaf6-9c99-44da-8b31-abf76cf14977', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '33589cd3e5b07658b17f1aa6bb572e799c95cda7c00099984c9965aacea067e3', '2026-09-14 13:30:57.007194+00', NULL, '2026-08-31 13:30:57.007194+00'),
    ('da363d94-6a33-451d-8af9-77480f6b709f', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '52999ce142730f2fb84564448861a2d78d1cb4e056e99fbdf7cc6f6169d81d72', '2026-09-14 13:04:08.81926+00', '2026-08-31 13:30:57.029189+00', '2026-08-31 13:04:08.81926+00'),
    ('797fbb6f-1a70-489f-9924-808cc7ea0357', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4a4591ac6cbd6df4e80155d59d5ee035e24f800312bb01482df4efb7596210cc', '2026-09-14 13:33:20.356585+00', NULL, '2026-08-31 13:33:20.356585+00'),
    ('4e77f5d5-d959-44f6-9d9e-ecff70920ac7', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'c10b73092e50b4904a9d8ef500d021c24342d1f7732e2e6af6ce59663fbaaac4', '2026-09-14 13:40:32.469785+00', NULL, '2026-08-31 13:40:32.469785+00'),
    ('3cfa66cd-687f-49ff-9e85-be5bd613366c', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '580477a1279cc6d9f07ca7d4c1f968f0d9d9a0801230dc6ae0508588e59fb79e', '2026-09-14 14:34:53.109803+00', NULL, '2026-08-31 14:34:53.109803+00'),
    ('4277c8a2-3ef0-4ea4-8451-03c82c03a6ef', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '580477a1279cc6d9f07ca7d4c1f968f0d9d9a0801230dc6ae0508588e59fb79e', '2026-09-14 14:34:53.116413+00', NULL, '2026-08-31 14:34:53.116413+00');
INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at) VALUES
    ('00ebc118-06cc-4bb7-a5df-e36ea25d31ca', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '580477a1279cc6d9f07ca7d4c1f968f0d9d9a0801230dc6ae0508588e59fb79e', '2026-09-14 14:34:53.164924+00', NULL, '2026-08-31 14:34:53.164924+00'),
    ('ae20b0c1-858f-4419-83ed-e5499796460d', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '580477a1279cc6d9f07ca7d4c1f968f0d9d9a0801230dc6ae0508588e59fb79e', '2026-09-14 14:34:53.120893+00', NULL, '2026-08-31 14:34:53.120893+00'),
    ('8465259b-d530-41bd-ad2d-1e45f26df964', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '580477a1279cc6d9f07ca7d4c1f968f0d9d9a0801230dc6ae0508588e59fb79e', '2026-09-14 14:34:53.168444+00', NULL, '2026-08-31 14:34:53.168444+00'),
    ('da6789f6-3f28-486f-820c-06e6d53c2842', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '580477a1279cc6d9f07ca7d4c1f968f0d9d9a0801230dc6ae0508588e59fb79e', '2026-09-14 14:34:53.21732+00', NULL, '2026-08-31 14:34:53.21732+00'),
    ('acad9aa9-73c8-4e6d-aced-f6f300f9c1ce', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '580477a1279cc6d9f07ca7d4c1f968f0d9d9a0801230dc6ae0508588e59fb79e', '2026-09-14 14:34:53.387471+00', NULL, '2026-08-31 14:34:53.387471+00'),
    ('d0dfd30c-8212-41f0-9597-6b6239243060', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '580477a1279cc6d9f07ca7d4c1f968f0d9d9a0801230dc6ae0508588e59fb79e', '2026-09-14 14:34:53.217839+00', NULL, '2026-08-31 14:34:53.217839+00'),
    ('576ab83a-0304-4a0d-a068-acb4e3bcd5c6', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '580477a1279cc6d9f07ca7d4c1f968f0d9d9a0801230dc6ae0508588e59fb79e', '2026-09-14 14:34:53.217713+00', NULL, '2026-08-31 14:34:53.217713+00'),
    ('307981ec-8b05-4569-8a5f-646abab476cf', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '580477a1279cc6d9f07ca7d4c1f968f0d9d9a0801230dc6ae0508588e59fb79e', '2026-09-14 14:34:53.216109+00', NULL, '2026-08-31 14:34:53.216109+00'),
    ('9603f09b-4d6c-4d11-add5-a9cc006aab0a', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bf9e429ff02d039f8fda60d467b783e758e2e86cfc0e7e3165535a9f59bcab12', '2026-09-14 13:30:57.029189+00', '2026-08-31 14:34:53.214258+00', '2026-08-31 13:30:57.029189+00'),
    ('f9154285-67e0-4ad9-a881-fe0e78a34078', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '580477a1279cc6d9f07ca7d4c1f968f0d9d9a0801230dc6ae0508588e59fb79e', '2026-09-14 14:34:53.214258+00', NULL, '2026-08-31 14:34:53.214258+00'),
    ('f8116c10-d3af-4d80-bf55-3894122d6562', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'b70394585e7b92947cf4743a080cdac99017c895d93838bea0cefaf764fdedf6', '2026-09-14 17:58:49.064942+00', NULL, '2026-08-31 17:58:49.064942+00'),
    ('0cced7e9-b3ab-49b4-abf1-512e194415e3', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'b70394585e7b92947cf4743a080cdac99017c895d93838bea0cefaf764fdedf6', '2026-09-14 17:58:49.116977+00', NULL, '2026-08-31 17:58:49.116977+00'),
    ('2f8a813b-e8d8-4b6f-82bd-4bc7c84eb4e0', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'b70394585e7b92947cf4743a080cdac99017c895d93838bea0cefaf764fdedf6', '2026-09-14 17:58:49.12322+00', NULL, '2026-08-31 17:58:49.12322+00'),
    ('45ae9cb4-e128-4d15-a4eb-fc2d0cde72b8', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'b70394585e7b92947cf4743a080cdac99017c895d93838bea0cefaf764fdedf6', '2026-09-14 17:58:49.125964+00', NULL, '2026-08-31 17:58:49.125964+00'),
    ('7c8e652c-e314-492d-a81d-d995cbf099e3', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'b70394585e7b92947cf4743a080cdac99017c895d93838bea0cefaf764fdedf6', '2026-09-14 17:58:49.186683+00', NULL, '2026-08-31 17:58:49.186683+00'),
    ('729beea4-2364-4b98-9da1-f8039ac6fe08', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'b70394585e7b92947cf4743a080cdac99017c895d93838bea0cefaf764fdedf6', '2026-09-14 17:58:49.187056+00', NULL, '2026-08-31 17:58:49.187056+00'),
    ('c9c6b3bd-3c6a-4987-813f-25e344972d92', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'b70394585e7b92947cf4743a080cdac99017c895d93838bea0cefaf764fdedf6', '2026-09-14 17:58:49.364291+00', NULL, '2026-08-31 17:58:49.364291+00'),
    ('38d65ad1-35f6-41a9-ba6f-8b0fd2089ddb', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'b70394585e7b92947cf4743a080cdac99017c895d93838bea0cefaf764fdedf6', '2026-09-14 17:58:49.223821+00', NULL, '2026-08-31 17:58:49.223821+00'),
    ('aaf82f50-0f94-4ccb-8b8d-aa03e5df7533', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'b70394585e7b92947cf4743a080cdac99017c895d93838bea0cefaf764fdedf6', '2026-09-14 17:58:49.232543+00', NULL, '2026-08-31 17:58:49.232543+00'),
    ('e6138891-1d4d-4e9d-95a3-80b5eb0ae7fc', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'b70394585e7b92947cf4743a080cdac99017c895d93838bea0cefaf764fdedf6', '2026-09-14 17:58:49.266466+00', NULL, '2026-08-31 17:58:49.266466+00'),
    ('ad0aee9e-80b7-45d2-936a-4019ef140d17', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '4dec92a1f4f9c75535068ed76feeaf74cbda64b3dcdb17cd8220523be9f274bc', '2026-09-15 22:29:39.025818+00', '2026-09-01 22:44:40.445277+00', '2026-09-01 22:29:39.025818+00'),
    ('fa022ec0-d867-4a84-aa04-f528b3800982', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'b70394585e7b92947cf4743a080cdac99017c895d93838bea0cefaf764fdedf6', '2026-09-14 17:58:49.233118+00', NULL, '2026-08-31 17:58:49.233118+00'),
    ('ba3ab2db-6d78-4e88-b01f-244fdc5bd90d', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '823fa8e9c0eeee74317cebbbac535de28d0a43f7511ec62eddc4d08d3755a3ba', '2026-09-14 13:45:43.279901+00', '2026-08-31 17:58:49.218386+00', '2026-08-31 13:45:43.279901+00'),
    ('9ba441e7-b11a-4dc6-bc8b-1390832a78c9', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'b70394585e7b92947cf4743a080cdac99017c895d93838bea0cefaf764fdedf6', '2026-09-14 17:58:49.218386+00', NULL, '2026-08-31 17:58:49.218386+00'),
    ('2c2f4c5d-9eac-495f-8744-e3c671b67e8e', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '1427f327260d7365a2f9b92c2bbf821bc6989e2f420dd8b8a350a9a66420dc05', '2026-09-15 13:35:08.943689+00', NULL, '2026-09-01 13:35:08.943689+00'),
    ('86ced369-d04e-4e33-8fcb-ed3a542e3afa', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'd35845fd910baad346e05c8e67f64122e89a2ad9c40b03e49d55910f61648bdf', '2026-09-15 16:01:33.739451+00', NULL, '2026-09-01 16:01:33.739451+00'),
    ('74556e4c-6304-4582-9307-add096438b6d', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'd35845fd910baad346e05c8e67f64122e89a2ad9c40b03e49d55910f61648bdf', '2026-09-15 16:01:33.853017+00', NULL, '2026-09-01 16:01:33.853017+00'),
    ('191e3d57-9448-4d8a-b68d-a7641760d573', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '2986b8fdf93ec3aaad6d4dca62df7589fffc96f2f314c818b8ffa37aabc12814', '2026-09-15 14:19:02.378424+00', NULL, '2026-09-01 14:19:02.378424+00'),
    ('f3f02b3e-e7c6-494d-8448-813132392ac1', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '0c4f853d8c0b8d1bd5935d3e60453eba9b403f6870f2f8c716a26520a1786620', '2026-09-15 13:50:05.813557+00', '2026-09-01 14:19:02.421688+00', '2026-09-01 13:50:05.813557+00'),
    ('32db0d92-5c3f-42c2-ab25-01d85a63a88e', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '2986b8fdf93ec3aaad6d4dca62df7589fffc96f2f314c818b8ffa37aabc12814', '2026-09-15 14:19:02.421688+00', NULL, '2026-09-01 14:19:02.421688+00'),
    ('1fd66479-b8de-4eb5-a45f-0e01f0a877be', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '2986b8fdf93ec3aaad6d4dca62df7589fffc96f2f314c818b8ffa37aabc12814', '2026-09-15 14:19:02.158011+00', '2026-09-01 14:34:27.951214+00', '2026-09-01 14:19:02.158011+00'),
    ('29dd7f02-cfee-4731-8e2c-25924e74170d', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '80cddcf1e16631c62ddce49319d9a1bae0dee440435677999075dee7d2732fae', '2026-09-15 14:34:27.951214+00', '2026-09-01 14:34:29.011999+00', '2026-09-01 14:34:27.951214+00'),
    ('7916b6ea-e148-4eaa-8a6c-35894b7ad433', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '2986b8fdf93ec3aaad6d4dca62df7589fffc96f2f314c818b8ffa37aabc12814', '2026-09-15 14:19:02.317803+00', '2026-09-01 14:34:29.396867+00', '2026-09-01 14:19:02.317803+00'),
    ('d0a2352b-db38-4ec7-8bea-9e43e357cb59', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '248d097aaf097c4f6d63fce963d8c51b4323ca65875adfa973a881b5b94cca88', '2026-09-15 14:34:29.396867+00', NULL, '2026-09-01 14:34:29.396867+00'),
    ('319c314d-6f51-4f15-b09e-14abeac41eab', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '54b09e6941bb69e403aa4e08c7587547c1bcaf5da5d0d94d8a2c57e7df7d9ea4', '2026-09-15 14:34:29.011999+00', '2026-09-01 14:34:30.404315+00', '2026-09-01 14:34:29.011999+00'),
    ('5580bbfa-99e6-46e8-91f5-5fbc29800952', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'f1db66ac5f68ff312d0a6c989a53d1513770d6c63d01c52891eeb9c6ae93f4b3', '2026-09-15 14:38:59.381184+00', '2026-09-01 14:41:17.979478+00', '2026-09-01 14:38:59.381184+00'),
    ('5242ee39-b8fd-449f-bd52-be6449b5ccca', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '6cf84734dcd6c7a35651b433bdd42e7186008b1c2ab990175a63c68792a9a7b8', '2026-09-15 14:41:27.468711+00', '2026-09-01 14:41:59.932649+00', '2026-09-01 14:41:27.468711+00'),
    ('2c7c483b-8280-4d6e-bb21-880e0c1ef14d', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'a6e19897eb8b2ebbf157aa4ac807af13c5ac34f816b265436a188bebc3eaaf4a', '2026-09-15 14:42:09.252104+00', '2026-09-01 14:42:12.279983+00', '2026-09-01 14:42:09.252104+00'),
    ('e4ff2f97-0012-4054-9c7b-26c31a2e4c5b', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '2b06529790a4900f665a02693b8c63bee2e7d97c3dc665be0a3d6e9ae2410002', '2026-09-15 14:42:25.856929+00', '2026-09-01 14:42:38.03819+00', '2026-09-01 14:42:25.856929+00'),
    ('5d8e4e41-0a65-4fdf-97bd-484d98ea55e4', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '98f4495a0b23374e737da005145060629e212eabe2fb524c0cf3eb10c802eefe', '2026-09-15 14:43:38.359747+00', '2026-09-01 14:43:42.275505+00', '2026-09-01 14:43:38.359747+00'),
    ('21232754-f8fa-4bdb-a6b2-f24f052b2f2a', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'cee79d976dbc7891820c52a3a138de5cd5b72a3822dd87c2c58a31c274d1557a', '2026-09-15 14:52:26.45298+00', '2026-09-01 14:52:44.901765+00', '2026-09-01 14:52:26.45298+00'),
    ('74b65896-27d6-445f-b8ec-d164c4092d75', '291b2bd3-c527-4b7b-a0f7-8882177a095c', 'df131ba67c9742b04a802dcdb0d336169cf40a38c0efee6ea3443caca678e48d', '2026-09-15 14:54:51.996399+00', '2026-09-01 14:55:51.758832+00', '2026-09-01 14:54:51.996399+00'),
    ('c90fcd7a-01cc-4f38-954a-ebdb06c50282', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '5d80a10b2988827eaa20e5b9026e1aca3deed37aa87e4eecf6198c7157f8068c', '2026-09-15 14:55:57.821416+00', '2026-09-01 14:56:19.53227+00', '2026-09-01 14:55:57.821416+00'),
    ('3180c43b-1fa4-4f65-9a8b-488c321ea338', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'fea72c97a8a15641002e8b140a0ca36f3ff2bcf222384e85149933adb2bdd7dd', '2026-09-15 14:56:23.496333+00', '2026-09-01 14:58:03.758378+00', '2026-09-01 14:56:23.496333+00'),
    ('4eb49c7f-74a7-43c5-a65e-8dbd0aa7dd19', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '383b9672a0a5db518a0482933b1165c9a407d4febe411531fa45609754ab16e7', '2026-09-15 14:58:39.50492+00', '2026-09-01 14:59:28.634175+00', '2026-09-01 14:58:39.50492+00'),
    ('bea7978c-8e05-42f6-8027-0efc3a1bf658', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '7ff1a70a5bdea8ecfa03554a4edc0383520123fa9b3536dff66dfa7d8fce061b', '2026-09-15 14:59:32.170319+00', '2026-09-01 15:00:10.260545+00', '2026-09-01 14:59:32.170319+00'),
    ('e0c2f37a-d138-47bf-8aba-bc2de7763dd2', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'bf837112b434b12219fe3b7b15ab3edf23175f7284513c58a79d5300d59271e8', '2026-09-15 22:44:40.445277+00', '2026-09-01 22:59:43.353518+00', '2026-09-01 22:44:40.445277+00'),
    ('86712a03-035f-4e3f-9715-48d696c88a3e', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'e007d577bd1bd04a9c6fc25a81b48549304860fab12ed702764222357d330191', '2026-09-15 15:10:52.153779+00', '2026-09-01 16:01:33.86868+00', '2026-09-01 15:10:52.153779+00'),
    ('631c9ef1-44b6-4778-824f-50bf945a770d', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'd35845fd910baad346e05c8e67f64122e89a2ad9c40b03e49d55910f61648bdf', '2026-09-15 16:01:33.86868+00', NULL, '2026-09-01 16:01:33.86868+00'),
    ('086d7560-d1ca-4002-8a17-ca54d4afe695', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'd35845fd910baad346e05c8e67f64122e89a2ad9c40b03e49d55910f61648bdf', '2026-09-15 16:01:33.57031+00', '2026-09-01 16:16:41.259219+00', '2026-09-01 16:01:33.57031+00');
INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at) VALUES
    ('050c8284-36eb-480c-a937-70629fcc5b41', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '5b53502044a325e829785ad6fc93407b7be3ee8e1be71b1e02304b4a32e1fb88', '2026-09-15 21:13:26.648451+00', NULL, '2026-09-01 21:13:26.648451+00'),
    ('e71369a7-53dc-4cac-a7e4-b49d5d24798b', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'ceb9f6029f0a072772cf07cf60f25d115d457e42911a071f1d9d1925490e8ed8', '2026-09-15 21:13:27.693738+00', NULL, '2026-09-01 21:13:27.693738+00'),
    ('ea093e55-f9af-49c2-be00-2558073bd45e', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'ca9d5d8a9bdd4629378671845fd3d93bb476a3f978c2b48acb2df0db035cf9df', '2026-09-15 21:13:27.770499+00', '2026-09-01 21:28:41.464699+00', '2026-09-01 21:13:27.770499+00'),
    ('46baca8a-de45-46be-b85f-fb7429c6ed72', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '8e4a320682c847a5cb576060f53ffdfd3f70b4206fc55d8405a9ccd6aa53cf27', '2026-09-15 21:28:41.464699+00', '2026-09-01 21:43:43.27344+00', '2026-09-01 21:28:41.464699+00'),
    ('3c33e2b3-eb68-4937-9a7f-dad7cbc62b14', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'aacb287b558d64a9b22c0640037052f849625ef26c5c397a9e736af5c0212a20', '2026-09-15 21:43:43.27344+00', '2026-09-01 21:59:07.543075+00', '2026-09-01 21:43:43.27344+00'),
    ('bf0231a2-5daf-45a3-b62e-0442abb8a415', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'adc558d7af276d506b903bb9898720ab69cb629be5b809db23b96e2deef48383', '2026-09-15 21:59:07.543075+00', '2026-09-01 22:14:17.339532+00', '2026-09-01 21:59:07.543075+00'),
    ('9f22d416-9ae8-43fd-9d6f-ae7d7f1cf6c2', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '1e25d6575056e578be9196840b543ab73b36784bc24907651b083866262bd204', '2026-09-15 22:14:17.339532+00', '2026-09-01 22:29:39.025818+00', '2026-09-01 22:14:17.339532+00'),
    ('c5f0d9d7-b439-4f31-a7f8-1a3f14842861', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'afeeb62db9b65dd58741dbdb78efda105dd7ef766dc6de076c6d04ef2675b30a', '2026-09-15 22:59:43.353518+00', '2026-09-01 23:14:45.610846+00', '2026-09-01 22:59:43.353518+00'),
    ('b3a0b9d8-b68d-48e5-9901-5045e5735a8f', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '2ee3d28cb077ee4a03d3fd4f718024913d58e51a4766a76345b0cc89ab520170', '2026-09-15 23:14:45.610846+00', '2026-09-01 23:29:48.486215+00', '2026-09-01 23:14:45.610846+00'),
    ('07e64664-17bd-4413-8b05-99a1d8d58e17', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '85f3c23b8cf9f28c02c2b5a7bbf22f8f1bac04da0fae22664ccc664ce17da4c7', '2026-09-15 23:29:48.486215+00', '2026-09-01 23:44:50.626492+00', '2026-09-01 23:29:48.486215+00'),
    ('9830c654-652a-401c-9efc-7f26b02542cf', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'c81d18c681c5b0a23e15c3861ce8757ac5d01bcb114ec6a4cf9fcc8168dfb572', '2026-09-15 23:44:50.626492+00', '2026-09-01 23:59:53.831811+00', '2026-09-01 23:44:50.626492+00'),
    ('b8e00aac-25bd-4b89-92d7-b74401923a2a', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '6de962195b59ce8f68939e9d73dcf4878e5034c6bb71b95a67a8dd4b4a7c73b6', '2026-09-15 23:59:53.831811+00', '2026-09-02 00:15:15.156658+00', '2026-09-01 23:59:53.831811+00'),
    ('01cf55f0-6670-4e3e-835d-581a9ffe3e72', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '1018b2f03658a746a015c824f01b24b1d0845285c38464d8ce41fecadda1006a', '2026-09-16 00:15:15.156658+00', '2026-09-02 00:30:17.838656+00', '2026-09-02 00:15:15.156658+00'),
    ('c01744bb-dac6-44f0-b0a1-11012ab64a5a', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '6c8741f76e04639ed38e2aebf98c84a694246934341fe6c10999af750b73ff06', '2026-09-16 00:30:17.838656+00', '2026-09-02 00:45:17.989547+00', '2026-09-02 00:30:17.838656+00'),
    ('6e0a781e-8e2c-4f6f-82dd-a1fedfb55fd9', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '1c0fc6f3c9b6910aea4e5c209d3c7ce6a25348d78b327e80853b386ee2ed388e', '2026-09-16 08:26:55.217734+00', '2026-09-02 08:32:03.971447+00', '2026-09-02 08:26:55.217734+00'),
    ('9921eb96-d868-44d5-8287-c3f90c4aad7a', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'bb0b7bf67c8fc054f15c580675bdc8d22facf0c4f039758280554a9417718aea', '2026-09-16 08:34:09.448998+00', '2026-09-02 08:49:34.88395+00', '2026-09-02 08:34:09.448998+00'),
    ('03cac4c8-dae3-4eda-8eed-2ba01f3174ef', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '59b8f5e5a172f5be13e8a44e1c43db3b76d6c493c92656ab4f4d24f7f735445b', '2026-09-16 08:49:34.88395+00', '2026-09-02 09:04:50.175849+00', '2026-09-02 08:49:34.88395+00'),
    ('37a9415b-193b-4d4e-904c-e102713453c0', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'c53029c0ccb0da19a5015025af514a169ddc80d8f41a050755d939212263b916', '2026-09-15 16:16:41.259219+00', '2026-09-02 13:10:13.247059+00', '2026-09-01 16:16:41.259219+00'),
    ('672a4914-cf87-43a4-af66-5f816709688a', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '0b2d51dfe4b2a802898c17427e82b9593224fcbb6fdeb1d12b1d11b42dc49c2a', '2026-09-16 09:04:50.175849+00', NULL, '2026-09-02 09:04:50.175849+00'),
    ('f9100aab-4b97-43ea-8e5e-62052af8e636', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '146c539ae5a0b818e46e149b5495e7baa7685f7a93f8ac3fb9836b171070482d', '2026-09-16 09:09:40.287149+00', NULL, '2026-09-02 09:09:40.287149+00'),
    ('0108f8d2-b990-4fa2-9c1c-068371af848f', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'd3255aa77559fed37d6d25cad3ca71a3f7b2874f6c1741ec656fcceacdf88caa', '2026-09-16 13:10:13.247059+00', NULL, '2026-09-02 13:10:13.247059+00'),
    ('b3ff3e2e-960c-48cc-9396-1b27099cd5e6', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '303a50f34ccaf54e478bde38918c76b4010f086a53150f99f460fbd30e5fa825', '2026-09-16 13:14:32.874692+00', '2026-09-02 13:14:41.289791+00', '2026-09-02 13:14:32.874692+00'),
    ('149a1ef6-e347-4799-b5ba-1788ed35f6a0', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '592ef2c751c57d703cb9bb1ea4afe7c19e6e65d10dc2e27e855b515ff2404157', '2026-09-16 13:14:44.807136+00', '2026-09-02 13:18:55.001186+00', '2026-09-02 13:14:44.807136+00'),
    ('37985ae6-3a8c-4550-9e86-246ff23aa184', '063e98b4-9e12-49f7-b675-b78694cd20b5', '510697ae5c6c64a4203c9d18820afc22f2bb066ede9cff2d73ae9a14a6f749f6', '2026-09-16 13:34:12.301396+00', NULL, '2026-09-02 13:34:12.301396+00'),
    ('9eb50695-fe05-4ac6-a637-9a0be513a5ca', '063e98b4-9e12-49f7-b675-b78694cd20b5', '35cd9eb28a0ca89b190bd691be9c460f8d34729a832206ead03a9fc918a48073', '2026-09-16 13:46:44.282983+00', NULL, '2026-09-02 13:46:44.282983+00'),
    ('e06e2faa-314d-47f6-b048-54076a895036', '063e98b4-9e12-49f7-b675-b78694cd20b5', 'b19888e8f6c36cd74bd383da49b18800080b7a4ddd7580d1d42af07153a51bf3', '2026-09-16 09:11:38.053684+00', '2026-09-02 15:10:35.725274+00', '2026-09-02 09:11:38.053684+00'),
    ('b36b74b9-0585-4ffb-bb64-fb12e06bb72c', '063e98b4-9e12-49f7-b675-b78694cd20b5', 'bfb06b4279f45509938c479473c7c13f72ad092e6b515bc1204354143f94fc05', '2026-09-16 15:10:35.725274+00', NULL, '2026-09-02 15:10:35.725274+00'),
    ('67c73bdc-eff1-4a42-89e4-6d89a1a39f87', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'b6c3d5cc8fc02a33be0657db1b4bb76945345ff7326ac88873920931e40d2f65', '2026-09-16 15:10:55.741642+00', NULL, '2026-09-02 15:10:55.741642+00'),
    ('62ee3464-6a6e-4e2d-bcb5-56ae06b32501', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '30bc49c74b7db16875a513bcaf9cbe9d599230c985006ea8d021393a123a3aa0', '2026-09-16 15:21:40.042004+00', NULL, '2026-09-02 15:21:40.042004+00'),
    ('80f9b33f-00e7-4ac0-adf1-5217239c9ca1', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '4ad763f41a4f2da391b729465ef9e9082014935a070a09b82ee37a1d8d1ba48b', '2026-09-16 15:23:23.178679+00', NULL, '2026-09-02 15:23:23.178679+00'),
    ('2d60c43a-3064-41f2-a114-63a7814d9418', '063e98b4-9e12-49f7-b675-b78694cd20b5', '2dbec10685218cbd5b52611aa58c82df9bf45c1538f1c148bb4d8a98f6639c08', '2026-09-16 15:25:14.537266+00', NULL, '2026-09-02 15:25:14.537266+00'),
    ('52c7764e-4405-4d4f-ba7c-4f743e9e69d9', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'e94fba805906be1dcf566c64eb0146fa95b10e82d9ce42a93bdbb407f1a7bf82', '2026-09-16 20:41:04.496383+00', NULL, '2026-09-02 20:41:04.496383+00'),
    ('f05c91e3-e449-4757-adc3-aaac38ae48be', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'e94fba805906be1dcf566c64eb0146fa95b10e82d9ce42a93bdbb407f1a7bf82', '2026-09-16 20:41:04.496995+00', NULL, '2026-09-02 20:41:04.496995+00'),
    ('dfc4a53e-9049-49d3-8fe8-d8b66f8637bb', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '4402ac63625d790f8d75b5549c48fca3df688941d10219079d30b97b5cb78407', '2026-09-16 16:02:09.147529+00', '2026-09-03 13:42:27.547985+00', '2026-09-02 16:02:09.147529+00'),
    ('bcefb8ff-3349-4bb6-ac3a-3e93d398de63', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'e94fba805906be1dcf566c64eb0146fa95b10e82d9ce42a93bdbb407f1a7bf82', '2026-09-16 20:41:04.498603+00', NULL, '2026-09-02 20:41:04.498603+00'),
    ('d9d0214b-ecfb-4f69-a8fc-b0bbd3f22531', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'e94fba805906be1dcf566c64eb0146fa95b10e82d9ce42a93bdbb407f1a7bf82', '2026-09-16 20:41:04.498205+00', NULL, '2026-09-02 20:41:04.498205+00'),
    ('8c8e65dd-e703-4665-a7bc-7d36ba37fc18', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'e94fba805906be1dcf566c64eb0146fa95b10e82d9ce42a93bdbb407f1a7bf82', '2026-09-16 20:41:04.543804+00', NULL, '2026-09-02 20:41:04.543804+00'),
    ('3bcece71-3c7d-48e1-9f44-afaca5173cbb', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '451c8ccc513c6df29184ed8d2f68a6edbf389b843faac134b7e3e8252181c197', '2026-09-16 23:35:32.066816+00', NULL, '2026-09-02 23:35:32.066816+00'),
    ('40601bdb-5c08-49de-a019-2717f862c625', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'e94fba805906be1dcf566c64eb0146fa95b10e82d9ce42a93bdbb407f1a7bf82', '2026-09-16 20:41:04.503578+00', NULL, '2026-09-02 20:41:04.503578+00'),
    ('1afeb2c8-da8e-456a-ad53-273b786e3488', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '68af8b758304f54e47b2096d484bc2e0bfeeb6f66bf16c029f6f15ad1b0f314b', '2026-09-16 23:20:30.828437+00', '2026-09-02 23:35:32.110605+00', '2026-09-02 23:20:30.828437+00'),
    ('9fb27a20-052c-4084-95fc-f6f7c0acb4b5', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'e94fba805906be1dcf566c64eb0146fa95b10e82d9ce42a93bdbb407f1a7bf82', '2026-09-16 20:41:04.56497+00', NULL, '2026-09-02 20:41:04.56497+00'),
    ('76474704-a80c-4f41-93fb-c17ed55be1d1', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '451c8ccc513c6df29184ed8d2f68a6edbf389b843faac134b7e3e8252181c197', '2026-09-16 23:35:32.110605+00', NULL, '2026-09-02 23:35:32.110605+00'),
    ('5bc43d3b-3a55-47f3-83fe-4b79e8b6f641', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'e94fba805906be1dcf566c64eb0146fa95b10e82d9ce42a93bdbb407f1a7bf82', '2026-09-16 20:41:04.567659+00', NULL, '2026-09-02 20:41:04.567659+00'),
    ('4bc12d1a-12dd-440a-a94a-7626c2647254', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '451c8ccc513c6df29184ed8d2f68a6edbf389b843faac134b7e3e8252181c197', '2026-09-16 23:35:32.061542+00', '2026-09-02 23:50:32.8991+00', '2026-09-02 23:35:32.061542+00'),
    ('791d7fee-8a8c-4b13-ad22-b7769d30268e', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'e94fba805906be1dcf566c64eb0146fa95b10e82d9ce42a93bdbb407f1a7bf82', '2026-09-16 20:41:04.564161+00', NULL, '2026-09-02 20:41:04.564161+00'),
    ('948f475b-4ae3-4ec7-89d9-97bcb8bb5e53', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'e94fba805906be1dcf566c64eb0146fa95b10e82d9ce42a93bdbb407f1a7bf82', '2026-09-16 20:41:04.544606+00', NULL, '2026-09-02 20:41:04.544606+00'),
    ('671687f4-f6fd-4bed-9d30-34bbe6f7b820', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '49ccad5ec946f6463c833bf9050dd058857860ba02c16c4465d5354b0b506df8', '2026-09-16 23:50:32.8991+00', '2026-09-03 00:05:34.007402+00', '2026-09-02 23:50:32.8991+00'),
    ('cdad3b2a-28c0-4701-8c4d-fbac068bab4f', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'e94fba805906be1dcf566c64eb0146fa95b10e82d9ce42a93bdbb407f1a7bf82', '2026-09-16 20:41:04.565098+00', NULL, '2026-09-02 20:41:04.565098+00'),
    ('feba4f2e-d834-4b2c-9aab-76c44608c57a', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '743d82e709be159d0e5c8ef962dd2c4080cceb5585af71c27f1020c1c4d02dbe', '2026-09-16 00:45:17.989547+00', '2026-09-02 20:41:04.568454+00', '2026-09-02 00:45:17.989547+00'),
    ('7d85bca0-bf9f-428f-bfa0-9ff6b5ec4376', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'e94fba805906be1dcf566c64eb0146fa95b10e82d9ce42a93bdbb407f1a7bf82', '2026-09-16 20:41:04.568454+00', NULL, '2026-09-02 20:41:04.568454+00');
INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at) VALUES
    ('23862a59-1f5c-474e-915d-52da9f838917', '291b2bd3-c527-4b7b-a0f7-8882177a095c', 'e8da8ce4b280ddb44e32267913e6c64757a5b7fed3cafe7ef8b9fd8a443bc300', '2026-09-16 22:50:20.184564+00', NULL, '2026-09-02 22:50:20.184564+00'),
    ('51cd0952-dc9b-48cf-8a28-c3d079fc352b', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '5d000ef2bf5d531cbf489e854c1cda8aeac5e91bcf81bb27b73e47a679b0523a', '2026-09-16 22:50:22.623731+00', NULL, '2026-09-02 22:50:22.623731+00'),
    ('505eb437-3d01-495a-bd93-ed67c649209e', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'b2815490f190c076943e08b88ddc1ccff58e5665b6f2cf27c16633412e490561', '2026-09-16 22:50:23.083046+00', '2026-09-02 23:05:29.718808+00', '2026-09-02 22:50:23.083046+00'),
    ('48685212-a0c1-483f-a134-b4aff6f2204b', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '72bbf68dd32bd695ece35df5f118d8bbb6271e7601bb89e49028e028fdade38b', '2026-09-16 23:05:29.718808+00', '2026-09-02 23:20:30.828437+00', '2026-09-02 23:05:29.718808+00'),
    ('2fb0071b-ab48-47ef-a197-5e4704d687b6', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '7b8d10d994023bbce782085d4acbd896afd9c918bdcfd19cf6e487ca79e95027', '2026-09-17 00:21:03.166776+00', '2026-09-03 00:21:04.033786+00', '2026-09-03 00:21:03.166776+00'),
    ('474f9ab5-5381-4df4-973c-98bd64c53a39', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'c567b00ff0f374cc5af05e79323f50e9af4e22839f867680055e47c3b5cc8cb9', '2026-09-16 23:35:31.688436+00', NULL, '2026-09-02 23:35:31.688436+00'),
    ('7358b5eb-bc48-48d6-ad56-98c0b5ebc2a5', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'a76f1ae920870c5aec457c81a6a09bd88be81bc0ac9caf256b8b6b493eeedfde', '2026-09-17 00:05:34.007402+00', '2026-09-03 00:05:34.906668+00', '2026-09-03 00:05:34.007402+00'),
    ('35263fdc-c3fd-4ae5-a4c5-985e5f513159', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '7b8d10d994023bbce782085d4acbd896afd9c918bdcfd19cf6e487ca79e95027', '2026-09-17 00:21:03.190491+00', NULL, '2026-09-03 00:21:03.190491+00'),
    ('45c9000b-5254-440d-b15f-92debfa7fbb6', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '7b8d10d994023bbce782085d4acbd896afd9c918bdcfd19cf6e487ca79e95027', '2026-09-17 00:21:03.199772+00', NULL, '2026-09-03 00:21:03.199772+00'),
    ('4b8372c0-b5e7-4fa8-ba3a-90efbc90ea89', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '8f9ad4ad043e297fa81a6987584392fdb37f55f6f9c6b97ebdd97a31d6802b40', '2026-09-17 00:21:04.42144+00', NULL, '2026-09-03 00:21:04.42144+00'),
    ('34d414f9-55fc-455c-8e15-d78a902cab15', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '7b8d10d994023bbce782085d4acbd896afd9c918bdcfd19cf6e487ca79e95027', '2026-09-17 00:21:03.198611+00', NULL, '2026-09-03 00:21:03.198611+00'),
    ('4bdba34f-01bb-41b8-8cb2-063831c5e7e9', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '8f9ad4ad043e297fa81a6987584392fdb37f55f6f9c6b97ebdd97a31d6802b40', '2026-09-17 00:21:04.36904+00', '2026-09-03 00:21:04.981583+00', '2026-09-03 00:21:04.36904+00'),
    ('03743d69-2437-4368-996c-94b07987455a', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '8f9ad4ad043e297fa81a6987584392fdb37f55f6f9c6b97ebdd97a31d6802b40', '2026-09-17 00:21:04.981583+00', NULL, '2026-09-03 00:21:04.981583+00'),
    ('6c4197bf-4be8-47a1-b171-2b503c7184b1', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '7b8d10d994023bbce782085d4acbd896afd9c918bdcfd19cf6e487ca79e95027', '2026-09-17 00:21:03.405325+00', NULL, '2026-09-03 00:21:03.405325+00'),
    ('fd09bfe5-eb02-40d4-9e06-802cc6c8f946', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '41d07010320518a34d0da368c4750119833583752c192eb9986964d375331ff4', '2026-09-17 00:05:34.906668+00', '2026-09-03 00:21:03.468447+00', '2026-09-03 00:05:34.906668+00'),
    ('0cf1c2d2-944c-4b35-92db-d0ab8f29b90b', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '7b8d10d994023bbce782085d4acbd896afd9c918bdcfd19cf6e487ca79e95027', '2026-09-17 00:21:03.468447+00', NULL, '2026-09-03 00:21:03.468447+00'),
    ('b241385d-2a08-480a-b6cc-a7a9f4f81154', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '8f9ad4ad043e297fa81a6987584392fdb37f55f6f9c6b97ebdd97a31d6802b40', '2026-09-17 00:21:04.033786+00', NULL, '2026-09-03 00:21:04.033786+00'),
    ('3d7b3871-9fdb-4f46-93fb-281cb0491128', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '8f9ad4ad043e297fa81a6987584392fdb37f55f6f9c6b97ebdd97a31d6802b40', '2026-09-17 00:21:04.513088+00', NULL, '2026-09-03 00:21:04.513088+00'),
    ('22df7f87-acdc-460d-83f4-6ffb5365e8bd', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '8f9ad4ad043e297fa81a6987584392fdb37f55f6f9c6b97ebdd97a31d6802b40', '2026-09-17 00:21:04.565413+00', NULL, '2026-09-03 00:21:04.565413+00'),
    ('3961b987-86a6-48e3-9510-31d61cbba2ca', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '8f9ad4ad043e297fa81a6987584392fdb37f55f6f9c6b97ebdd97a31d6802b40', '2026-09-17 00:21:04.575506+00', NULL, '2026-09-03 00:21:04.575506+00'),
    ('17ee2dc0-4706-4946-9b2b-a509e99506f7', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '8f9ad4ad043e297fa81a6987584392fdb37f55f6f9c6b97ebdd97a31d6802b40', '2026-09-17 00:21:04.611388+00', NULL, '2026-09-03 00:21:04.611388+00'),
    ('ae232b26-d684-4da8-beca-9083505da67e', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '8f9ad4ad043e297fa81a6987584392fdb37f55f6f9c6b97ebdd97a31d6802b40', '2026-09-17 00:21:04.652332+00', NULL, '2026-09-03 00:21:04.652332+00'),
    ('71f23530-1d9e-4c89-a1b6-d39121c6b892', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '7b8d10d994023bbce782085d4acbd896afd9c918bdcfd19cf6e487ca79e95027', '2026-09-17 00:21:03.879874+00', '2026-09-03 00:21:04.74744+00', '2026-09-03 00:21:03.879874+00'),
    ('465753a9-1be1-424a-9113-06f6db96c71a', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '8f9ad4ad043e297fa81a6987584392fdb37f55f6f9c6b97ebdd97a31d6802b40', '2026-09-17 00:21:04.74744+00', NULL, '2026-09-03 00:21:04.74744+00'),
    ('11264923-b349-45b1-a1e6-190dc3d2867f', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '7fd7db6d9c223c72f4d1b5057b1244f107a3b71dbdbe766a5120ba50aadca234', '2026-09-17 00:23:17.293815+00', NULL, '2026-09-03 00:23:17.293815+00'),
    ('3c1f3a8c-99d5-4f25-85d5-1ff6883fe1c8', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '58f59e8f89a1e0717b841cefbbb2cd378743688e89f33965d517fc6400f0e4cf', '2026-09-17 00:23:23.480741+00', NULL, '2026-09-03 00:23:23.480741+00'),
    ('c87e859b-daa8-4a70-b320-2befc695dbfa', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '235555f8f7785ae9848c7d2ffb9c6ac80d85ecf44f993748860784b4494432fe', '2026-09-17 00:23:39.680433+00', NULL, '2026-09-03 00:23:39.680433+00'),
    ('f1d76fbf-cea8-41e7-b523-a8da9d7edd0c', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '4b5c0cab91f922b4f683d910b478cb2139aa8aa1ab169b30698b47bc15b19961', '2026-09-17 00:36:36.492788+00', NULL, '2026-09-03 00:36:36.492788+00'),
    ('9d30b4a9-ea48-4976-b46b-ad7db440f191', '291b2bd3-c527-4b7b-a0f7-8882177a095c', 'df20611ac5e50abfbba1e94cadf7a9e7c5bf3e87884eee26b18da52f33246030', '2026-09-17 00:37:03.326143+00', NULL, '2026-09-03 00:37:03.326143+00'),
    ('82e2fb4c-499f-4926-baf2-1b8886db77ce', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '31d3062089ad87f3fe2be76e15ce014818a33595b1669384a6c45887e332fc5f', '2026-09-17 00:37:13.28371+00', NULL, '2026-09-03 00:37:13.28371+00'),
    ('9e346e85-827f-4ce1-a3bf-444ca115e8d6', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '751ed8cd1c3f825c73a80957a38944c06f3ff1474750e56a2ded545fc9f60eba', '2026-09-17 00:48:31.379025+00', '2026-09-03 00:59:15.722744+00', '2026-09-03 00:48:31.379025+00'),
    ('aa7088ea-2530-4afb-9fa4-300d673790aa', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '1b3ab1d26395adb46d7f45246f0c4930c3f0d7ac2921085ddd6b15680638c176', '2026-09-17 00:59:20.6818+00', '2026-09-03 01:14:27.110455+00', '2026-09-03 00:59:20.6818+00'),
    ('df4403c7-acee-406f-81bd-2890cedbaeab', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '977b8ef17b87272894e656278f04afcca91275992a87a20c083659a553ea7e35', '2026-09-17 01:14:27.110455+00', '2026-09-03 01:29:42.899605+00', '2026-09-03 01:14:27.110455+00'),
    ('98f3a03d-d73d-430b-988f-2c59427ae48d', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'c60b9f209d5dd6ab3b71d95a82b6efa4023564235ab34c6cf7204d40d7b4d1fc', '2026-09-17 01:29:42.899605+00', '2026-09-03 01:44:44.220518+00', '2026-09-03 01:29:42.899605+00'),
    ('efb655c4-5630-48d3-b754-91e70256ead4', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '6682df6edcd9dcc7811fa841db9816ce0f13adb9bff5d89d4bcb788525242310', '2026-09-17 01:44:44.220518+00', '2026-09-03 01:59:53.166122+00', '2026-09-03 01:44:44.220518+00'),
    ('e5e63442-02a4-47d7-93b6-b32ac826ec39', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'c04a229f9f852bec3c6cbd004f58c8be63052bd18acd783b7b570db74299130a', '2026-09-17 01:59:53.166122+00', '2026-09-03 02:15:23.689457+00', '2026-09-03 01:59:53.166122+00'),
    ('6322cc24-0126-4742-804d-df330971a631', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'd5adfc15548b43b4c60b01268e28d851154590c522f17a935228ff4a802ebfc2', '2026-09-17 02:15:23.689457+00', '2026-09-03 02:30:53.431298+00', '2026-09-03 02:15:23.689457+00'),
    ('3641de71-ba1d-48f3-a3b4-0cf7f6090966', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '5ebbaf78e390cfa74bd7f2ddd3f3930b5e81e12687d70eee6216c99a1a2d38a7', '2026-09-17 13:42:27.547985+00', NULL, '2026-09-03 13:42:27.547985+00'),
    ('668dc7ed-295c-4f94-aea8-f388472e85dd', '291b2bd3-c527-4b7b-a0f7-8882177a095c', 'c975894768a34af2e68ba4538c12210c15e47d10f5abf94c28af5f81a04d5fba', '2026-09-17 13:42:46.714431+00', '2026-09-03 13:42:52.745517+00', '2026-09-03 13:42:46.714431+00'),
    ('45cdd96d-d39e-42a7-b350-5b49dee85298', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '038be84c3c215bcdd67bd435c25f7a17be12c23fc9156278a6997b335cd53fde', '2026-09-17 13:42:56.280528+00', '2026-09-03 13:43:58.932491+00', '2026-09-03 13:42:56.280528+00'),
    ('b8aa05c4-8619-4a54-a578-29310ab0411e', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '6e0ad237450db5e200854454300cabdcf3e26a148307dd086aa84e2f6bd53810', '2026-09-17 13:44:19.989605+00', '2026-09-03 13:44:53.074491+00', '2026-09-03 13:44:19.989605+00'),
    ('13a1d2ac-b57b-49ad-b159-009459d682d1', 'd8534839-3925-4194-862f-201365d1f6db', '9e9501b4c1c807831645564890e444c97f8df27de5f9678636cf3f885b3d57a1', '2026-09-17 13:44:58.892365+00', '2026-09-03 13:45:18.086124+00', '2026-09-03 13:44:58.892365+00'),
    ('c704fef9-11d4-40a8-8402-a2eeecd91470', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'f43636f45b8445e83b93a900528b5a0ec01c1ad07c3b2991fe262b9487ce78a0', '2026-09-17 13:45:22.586604+00', '2026-09-03 13:45:50.610096+00', '2026-09-03 13:45:22.586604+00'),
    ('508f723d-f371-4c41-a451-802500ed2c2f', 'd8534839-3925-4194-862f-201365d1f6db', '8f13dd362f85a6c277717d15f2b8d09d6166fc33f84794d1eca158e2f00fbc57', '2026-09-17 13:45:55.470838+00', '2026-09-03 13:47:15.251226+00', '2026-09-03 13:45:55.470838+00'),
    ('6876a455-2bfc-448c-b8c8-4433d6b54849', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '42be78ee6bef0d6651689f53c04c9a90790da73872e958959ff5195c78266e02', '2026-09-17 14:18:46.594015+00', NULL, '2026-09-03 14:18:46.594015+00'),
    ('6ba6bd70-c7ac-4737-af84-fa11e38b2e3c', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '42be78ee6bef0d6651689f53c04c9a90790da73872e958959ff5195c78266e02', '2026-09-17 14:18:46.588441+00', '2026-09-03 14:35:56.917654+00', '2026-09-03 14:18:46.588441+00'),
    ('6c933be9-e414-4cd0-9a78-b947646d7e46', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '42be78ee6bef0d6651689f53c04c9a90790da73872e958959ff5195c78266e02', '2026-09-17 14:18:46.57511+00', '2026-09-03 14:35:56.823883+00', '2026-09-03 14:18:46.57511+00'),
    ('7ad63414-6a2b-424b-bf0e-7bfec57f1745', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'fcf74184783b400db146a99d7c9f2fb410601cd8259fd10d683b77380f74bed3', '2026-09-17 02:30:53.431298+00', '2026-09-03 18:07:10.756754+00', '2026-09-03 02:30:53.431298+00'),
    ('a26f9166-ba88-4cce-894a-7f71482bdf40', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '42be78ee6bef0d6651689f53c04c9a90790da73872e958959ff5195c78266e02', '2026-09-17 14:18:46.620045+00', NULL, '2026-09-03 14:18:46.620045+00'),
    ('fa3f47ec-cb5e-4646-9f46-887a7f375eea', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '42be78ee6bef0d6651689f53c04c9a90790da73872e958959ff5195c78266e02', '2026-09-17 14:18:46.672031+00', NULL, '2026-09-03 14:18:46.672031+00');
INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at) VALUES
    ('d9b4a03b-4772-4e53-bcbb-d066eaa5eac2', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '42be78ee6bef0d6651689f53c04c9a90790da73872e958959ff5195c78266e02', '2026-09-17 14:18:46.695505+00', NULL, '2026-09-03 14:18:46.695505+00'),
    ('f2192317-9d65-4667-b704-558de469cb0d', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '42be78ee6bef0d6651689f53c04c9a90790da73872e958959ff5195c78266e02', '2026-09-17 14:18:46.744335+00', NULL, '2026-09-03 14:18:46.744335+00'),
    ('2da8f5b7-595e-453c-9642-7a9b3a58d3a3', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '42be78ee6bef0d6651689f53c04c9a90790da73872e958959ff5195c78266e02', '2026-09-17 14:18:46.791245+00', NULL, '2026-09-03 14:18:46.791245+00'),
    ('1d06c9d4-1d7b-4851-85d8-0e877606879d', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '42be78ee6bef0d6651689f53c04c9a90790da73872e958959ff5195c78266e02', '2026-09-17 14:18:46.803574+00', NULL, '2026-09-03 14:18:46.803574+00'),
    ('5dbcdf21-92a9-4883-899b-89c5529d3385', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'a6c903fedfd4632a3c280c675240b9c0424ec625b82377b33e9eea12ccd64174', '2026-09-17 13:47:19.066368+00', '2026-09-03 14:18:46.747501+00', '2026-09-03 13:47:19.066368+00'),
    ('1f060f55-8dd8-4731-ac21-a64fec559a0f', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '42be78ee6bef0d6651689f53c04c9a90790da73872e958959ff5195c78266e02', '2026-09-17 14:18:46.747501+00', NULL, '2026-09-03 14:18:46.747501+00'),
    ('d58c03c1-0851-48f6-bf4b-b19ae7921f37', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bad0ced70ff034d1b73566ffb512e585aefea74b3f2214a553c7b63f01092402', '2026-09-17 14:35:56.538334+00', NULL, '2026-09-03 14:35:56.538334+00'),
    ('5e99d451-04dc-4b30-9bf5-bda7e75e8dd9', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bad0ced70ff034d1b73566ffb512e585aefea74b3f2214a553c7b63f01092402', '2026-09-17 14:35:56.6802+00', NULL, '2026-09-03 14:35:56.6802+00'),
    ('7214087c-adbd-436d-9669-f875889c62c3', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bad0ced70ff034d1b73566ffb512e585aefea74b3f2214a553c7b63f01092402', '2026-09-17 14:35:56.731911+00', NULL, '2026-09-03 14:35:56.731911+00'),
    ('cb373a96-1dfc-49c9-b0b4-e4e264479a61', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bad0ced70ff034d1b73566ffb512e585aefea74b3f2214a553c7b63f01092402', '2026-09-17 14:35:56.743906+00', NULL, '2026-09-03 14:35:56.743906+00'),
    ('f443ad2c-b06b-4c1d-8250-1afe667dfc56', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bad0ced70ff034d1b73566ffb512e585aefea74b3f2214a553c7b63f01092402', '2026-09-17 14:35:56.917654+00', NULL, '2026-09-03 14:35:56.917654+00'),
    ('3b581fde-e87e-44fa-bcd8-431a67b88233', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bad0ced70ff034d1b73566ffb512e585aefea74b3f2214a553c7b63f01092402', '2026-09-17 14:35:56.778625+00', NULL, '2026-09-03 14:35:56.778625+00'),
    ('5d67bb5a-b0a0-4cfc-b1d4-4c9a1532f5b8', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bad0ced70ff034d1b73566ffb512e585aefea74b3f2214a553c7b63f01092402', '2026-09-17 14:35:56.784056+00', NULL, '2026-09-03 14:35:56.784056+00'),
    ('c8924738-6033-4d80-b2c1-5a5fead88d03', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bad0ced70ff034d1b73566ffb512e585aefea74b3f2214a553c7b63f01092402', '2026-09-17 14:35:56.831274+00', NULL, '2026-09-03 14:35:56.831274+00'),
    ('935308b6-c790-4696-969d-9e3fa3d53e32', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bad0ced70ff034d1b73566ffb512e585aefea74b3f2214a553c7b63f01092402', '2026-09-17 14:35:56.823883+00', NULL, '2026-09-03 14:35:56.823883+00'),
    ('134d231f-19bc-4b1c-92ea-798f3958b5f0', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'db71f9b70bd733f9447dd89445240e62a65fbd3f4301e66a85f30cd684f9de32', '2026-09-17 14:51:16.289293+00', NULL, '2026-09-03 14:51:16.289293+00'),
    ('f433f4a1-09a8-4f4c-81f0-869bb7cca9d1', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'db71f9b70bd733f9447dd89445240e62a65fbd3f4301e66a85f30cd684f9de32', '2026-09-17 14:51:16.385873+00', NULL, '2026-09-03 14:51:16.385873+00'),
    ('ab590c7d-012e-44d9-92cc-48bfe7b01225', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'db71f9b70bd733f9447dd89445240e62a65fbd3f4301e66a85f30cd684f9de32', '2026-09-17 14:51:16.421424+00', NULL, '2026-09-03 14:51:16.421424+00'),
    ('73990109-bc03-4b58-a765-5456790b1605', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'db71f9b70bd733f9447dd89445240e62a65fbd3f4301e66a85f30cd684f9de32', '2026-09-17 14:51:16.554616+00', NULL, '2026-09-03 14:51:16.554616+00'),
    ('658b0f7c-c851-4506-a308-86f093c56bbf', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'db71f9b70bd733f9447dd89445240e62a65fbd3f4301e66a85f30cd684f9de32', '2026-09-17 14:51:16.42239+00', NULL, '2026-09-03 14:51:16.42239+00'),
    ('2541ab25-c902-4846-8e4f-c3130a89a411', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bad0ced70ff034d1b73566ffb512e585aefea74b3f2214a553c7b63f01092402', '2026-09-17 14:35:56.505009+00', '2026-09-03 14:51:16.432424+00', '2026-09-03 14:35:56.505009+00'),
    ('f95a2bfa-f8eb-4ec2-9d69-1a213edb52b8', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'db71f9b70bd733f9447dd89445240e62a65fbd3f4301e66a85f30cd684f9de32', '2026-09-17 14:51:16.57309+00', NULL, '2026-09-03 14:51:16.57309+00'),
    ('2d359fd6-fa46-4069-a8d1-b79f43a24806', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'db71f9b70bd733f9447dd89445240e62a65fbd3f4301e66a85f30cd684f9de32', '2026-09-17 14:51:16.432424+00', NULL, '2026-09-03 14:51:16.432424+00'),
    ('3fc961ef-8591-4b48-b822-65bd665c370b', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'db71f9b70bd733f9447dd89445240e62a65fbd3f4301e66a85f30cd684f9de32', '2026-09-17 14:51:16.779421+00', NULL, '2026-09-03 14:51:16.779421+00'),
    ('4ddb4f5f-8beb-4261-9c48-dd8fc947b321', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'bad0ced70ff034d1b73566ffb512e585aefea74b3f2214a553c7b63f01092402', '2026-09-17 14:35:56.506274+00', '2026-09-03 14:51:16.806239+00', '2026-09-03 14:35:56.506274+00'),
    ('8b9834d9-40db-463a-8b61-dc2c4fccd0ff', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'db71f9b70bd733f9447dd89445240e62a65fbd3f4301e66a85f30cd684f9de32', '2026-09-17 14:51:16.806239+00', NULL, '2026-09-03 14:51:16.806239+00'),
    ('0f2a08e7-2522-4e7a-884a-993cf35a9ab0', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'e4d063d66270b5d1697ee8952588442c381894b9fe203f440231834b2859d1b3', '2026-09-17 15:07:47.388013+00', '2026-09-03 16:36:07.776209+00', '2026-09-03 15:07:47.388013+00'),
    ('e3f62e1d-b803-4ec2-88fd-ea046f801979', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'e4d063d66270b5d1697ee8952588442c381894b9fe203f440231834b2859d1b3', '2026-09-17 15:07:47.450283+00', NULL, '2026-09-03 15:07:47.450283+00'),
    ('0f4dae53-04aa-4558-9dee-0fe33d4b9dd2', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'e4d063d66270b5d1697ee8952588442c381894b9fe203f440231834b2859d1b3', '2026-09-17 15:07:47.450065+00', NULL, '2026-09-03 15:07:47.450065+00'),
    ('a3e9ac83-b003-4189-b357-d3eb2ee6e789', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'e4d063d66270b5d1697ee8952588442c381894b9fe203f440231834b2859d1b3', '2026-09-17 15:07:47.451785+00', NULL, '2026-09-03 15:07:47.451785+00'),
    ('5661eca0-8f5e-439a-b45f-5608e913948a', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'e4d063d66270b5d1697ee8952588442c381894b9fe203f440231834b2859d1b3', '2026-09-17 15:07:47.48307+00', NULL, '2026-09-03 15:07:47.48307+00'),
    ('b2240e5d-7f04-435d-9efd-5df3783a8615', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'db71f9b70bd733f9447dd89445240e62a65fbd3f4301e66a85f30cd684f9de32', '2026-09-17 14:51:16.165086+00', '2026-09-03 15:07:47.817689+00', '2026-09-03 14:51:16.165086+00'),
    ('015e2514-b5e8-4694-b46d-d1556910f689', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'e4d063d66270b5d1697ee8952588442c381894b9fe203f440231834b2859d1b3', '2026-09-17 15:07:47.817689+00', NULL, '2026-09-03 15:07:47.817689+00'),
    ('2c14946e-302d-40b3-8a12-a26d47d5c547', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'e4d063d66270b5d1697ee8952588442c381894b9fe203f440231834b2859d1b3', '2026-09-17 15:07:47.459514+00', NULL, '2026-09-03 15:07:47.459514+00'),
    ('f6077933-28d6-4c01-ac93-5ef6071089e0', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'e4d063d66270b5d1697ee8952588442c381894b9fe203f440231834b2859d1b3', '2026-09-17 15:07:47.531384+00', NULL, '2026-09-03 15:07:47.531384+00'),
    ('5ba00159-5d56-46a2-8c9d-e3e6d0fd04cf', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'e4d063d66270b5d1697ee8952588442c381894b9fe203f440231834b2859d1b3', '2026-09-17 15:07:47.618925+00', NULL, '2026-09-03 15:07:47.618925+00'),
    ('b405195e-9735-458d-a1e2-d48fb065b1b0', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'e4d063d66270b5d1697ee8952588442c381894b9fe203f440231834b2859d1b3', '2026-09-17 15:07:47.392982+00', NULL, '2026-09-03 15:07:47.392982+00'),
    ('41e26e47-ddc8-4498-9b3f-15d308c71a96', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '3dc5ae46f7aa7f850e39ab56f689ec16cb8b053999e52e74da45132ff0732726', '2026-09-17 19:08:39.051411+00', '2026-09-03 19:08:40.198472+00', '2026-09-03 19:08:39.051411+00'),
    ('d09b261e-d13f-4c46-b54d-6208705cb0c5', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'e4d063d66270b5d1697ee8952588442c381894b9fe203f440231834b2859d1b3', '2026-09-17 15:07:47.466401+00', NULL, '2026-09-03 15:07:47.466401+00'),
    ('17f54428-ecc0-418a-a3e6-e85340d0df6d', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '3dc5ae46f7aa7f850e39ab56f689ec16cb8b053999e52e74da45132ff0732726', '2026-09-17 19:08:39.249021+00', NULL, '2026-09-03 19:08:39.249021+00'),
    ('5ab78e01-9717-4cc7-a422-5a1b59784b7b', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'e4d063d66270b5d1697ee8952588442c381894b9fe203f440231834b2859d1b3', '2026-09-17 15:07:47.668686+00', NULL, '2026-09-03 15:07:47.668686+00'),
    ('f277cba4-4eb5-4d2b-9ae6-5b4ae7f0946b', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '0d150fc561d5d0367a6b48e75d49c298a8b9f547d05560defe8ce368d5d7ba6d', '2026-09-17 19:08:40.176159+00', '2026-09-03 19:23:42.02165+00', '2026-09-03 19:08:40.176159+00'),
    ('f2c5f69d-033b-4b2e-9ecb-648e880fea08', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'e4d063d66270b5d1697ee8952588442c381894b9fe203f440231834b2859d1b3', '2026-09-17 15:07:47.524008+00', NULL, '2026-09-03 15:07:47.524008+00'),
    ('242638db-4460-4ff4-8f8b-e4ab52a0cc80', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'db71f9b70bd733f9447dd89445240e62a65fbd3f4301e66a85f30cd684f9de32', '2026-09-17 14:51:16.128021+00', '2026-09-03 15:07:47.467749+00', '2026-09-03 14:51:16.128021+00'),
    ('84cc7645-1ec2-4263-903e-a792523d7794', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'e4d063d66270b5d1697ee8952588442c381894b9fe203f440231834b2859d1b3', '2026-09-17 15:07:47.467749+00', NULL, '2026-09-03 15:07:47.467749+00'),
    ('ca9c741d-d7f9-450e-a870-d3919b746595', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '46fbebb4c065e0829d2e88fe3589bbb21396b38f0337fa7769145926ce1f38eb', '2026-09-17 16:36:07.759075+00', NULL, '2026-09-03 16:36:07.759075+00'),
    ('a691c755-7555-4f6d-80c5-cdcde00e174f', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '46fbebb4c065e0829d2e88fe3589bbb21396b38f0337fa7769145926ce1f38eb', '2026-09-17 16:36:07.765038+00', NULL, '2026-09-03 16:36:07.765038+00'),
    ('9a5bc7f3-b200-474e-872f-873be728df94', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '46fbebb4c065e0829d2e88fe3589bbb21396b38f0337fa7769145926ce1f38eb', '2026-09-17 16:36:07.77599+00', NULL, '2026-09-03 16:36:07.77599+00'),
    ('05d2a89b-fa3a-4797-8074-6561a0b1e7f6', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '46fbebb4c065e0829d2e88fe3589bbb21396b38f0337fa7769145926ce1f38eb', '2026-09-17 16:36:07.766179+00', NULL, '2026-09-03 16:36:07.766179+00'),
    ('20282624-ab93-4f15-8250-da287da28595', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '46fbebb4c065e0829d2e88fe3589bbb21396b38f0337fa7769145926ce1f38eb', '2026-09-17 16:36:07.769445+00', NULL, '2026-09-03 16:36:07.769445+00');
INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at) VALUES
    ('e4507664-4000-483c-8614-9d92671af42e', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '46fbebb4c065e0829d2e88fe3589bbb21396b38f0337fa7769145926ce1f38eb', '2026-09-17 16:36:07.969203+00', NULL, '2026-09-03 16:36:07.969203+00'),
    ('f7b2440e-c926-4fdd-b7bd-7a5549fc1e81', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '46fbebb4c065e0829d2e88fe3589bbb21396b38f0337fa7769145926ce1f38eb', '2026-09-17 16:36:07.779514+00', NULL, '2026-09-03 16:36:07.779514+00'),
    ('ef88fc8d-d223-4d37-8a40-729b14ff1c90', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '46fbebb4c065e0829d2e88fe3589bbb21396b38f0337fa7769145926ce1f38eb', '2026-09-17 16:36:07.882652+00', NULL, '2026-09-03 16:36:07.882652+00'),
    ('857e6402-0095-480d-9a29-27b6c5b9ba42', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '46fbebb4c065e0829d2e88fe3589bbb21396b38f0337fa7769145926ce1f38eb', '2026-09-17 16:36:07.800214+00', NULL, '2026-09-03 16:36:07.800214+00'),
    ('29675fc4-8747-4fdb-b748-332ee8f4ac9a', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '46fbebb4c065e0829d2e88fe3589bbb21396b38f0337fa7769145926ce1f38eb', '2026-09-17 16:36:07.981576+00', NULL, '2026-09-03 16:36:07.981576+00'),
    ('828e17e7-9d50-4caf-b006-4b0d2662915d', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '46fbebb4c065e0829d2e88fe3589bbb21396b38f0337fa7769145926ce1f38eb', '2026-09-17 16:36:07.977948+00', NULL, '2026-09-03 16:36:07.977948+00'),
    ('4e24aa71-d87c-4008-8e97-14153610f0ae', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '46fbebb4c065e0829d2e88fe3589bbb21396b38f0337fa7769145926ce1f38eb', '2026-09-17 16:36:07.84064+00', NULL, '2026-09-03 16:36:07.84064+00'),
    ('c897698e-d658-4e62-8a37-f31e4ee0e0cc', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '46fbebb4c065e0829d2e88fe3589bbb21396b38f0337fa7769145926ce1f38eb', '2026-09-17 16:36:07.860709+00', NULL, '2026-09-03 16:36:07.860709+00'),
    ('9254b722-891a-4716-96f8-98354042579a', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '46fbebb4c065e0829d2e88fe3589bbb21396b38f0337fa7769145926ce1f38eb', '2026-09-17 16:36:07.776209+00', NULL, '2026-09-03 16:36:07.776209+00'),
    ('5016c7c0-d150-48dd-96ec-7047d0b47a25', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'f7f4e628835fe53a7738d4475a72f84cf2a19d9316728cd12d316f3a7b223068', '2026-09-17 18:07:10.756754+00', NULL, '2026-09-03 18:07:10.756754+00'),
    ('341321af-b7f4-41f2-b14a-715b2e3c43db', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '7b153c2c1d9a5da7370f55401685fc2ac72929e9e129cf783f6686d0d37b0985', '2026-09-17 18:10:11.696656+00', NULL, '2026-09-03 18:10:11.696656+00'),
    ('a4b9d266-d4a7-4ca5-9d52-913b580f0950', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '3d5801c7a392d1370a7b734c4a1eaa8d452fbcc82baec70093f537c22f9d161e', '2026-09-17 18:10:14.956885+00', '2026-09-03 18:27:56.600865+00', '2026-09-03 18:10:14.956885+00'),
    ('8af2a001-b9fd-47a9-b01a-6a236417ec84', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'fee6e67d3cfca0429ab3791660745067f55c4033a7ae72811909946b92e1e170', '2026-09-17 18:27:56.600865+00', NULL, '2026-09-03 18:27:56.600865+00'),
    ('f8d438a4-aad5-4692-a636-b0ef6df6b0b0', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '75af70c7879fd25b0d82581d552ddb61a2904503d49e7d543c8ea6e729178705', '2026-09-17 18:28:02.761633+00', NULL, '2026-09-03 18:28:02.761633+00'),
    ('1e0447d2-b8de-42d2-aa2c-e508f979a208', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '7c63cfb3fadfe4b67860c2224a617669232b7e8e15e9fc115530a5ba5bc40585', '2026-09-17 18:28:49.95897+00', NULL, '2026-09-03 18:28:49.95897+00'),
    ('4d16f335-d414-45f6-aec0-3c57e15da1eb', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '0498b720b7c73d1caa87e7717b4e754a8b84f92c67466f3367543aef1617c661', '2026-09-17 18:29:36.894308+00', NULL, '2026-09-03 18:29:36.894308+00'),
    ('44074186-f2c2-4e11-9116-c5137701f007', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'c42f46628f44b65f7661d6cae36c13cfb213fd60db2c39f9c341271f890abe94', '2026-09-17 18:29:49.75754+00', NULL, '2026-09-03 18:29:49.75754+00'),
    ('7a1153a5-72bb-421f-a468-fe19e20e9d27', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'aa01449406f703fb3010631e71cc1d0feacfb324c67a85772ec80be936eb1f14', '2026-09-17 18:30:03.268876+00', '2026-09-03 18:30:31.38691+00', '2026-09-03 18:30:03.268876+00'),
    ('965ed458-af4b-4690-800f-296d52a4520c', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'e50f80d3ea214414a641f6b1540f601beb818b0a5b607034fe6896eef73f3f34', '2026-09-17 18:30:52.761474+00', '2026-09-03 18:32:01.755579+00', '2026-09-03 18:30:52.761474+00'),
    ('7019f4a5-6fe1-494a-bb99-4e60436cf09e', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '969b1d9f2bf3506d567ab78c2a4e9df920c79533dda946afdef8a4113ee4d425', '2026-09-17 18:32:17.957509+00', '2026-09-03 18:47:21.058657+00', '2026-09-03 18:32:17.957509+00'),
    ('4aedf827-7357-497e-84b5-4cb73b3ea3c4', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '3dc5ae46f7aa7f850e39ab56f689ec16cb8b053999e52e74da45132ff0732726', '2026-09-17 19:08:39.352326+00', NULL, '2026-09-03 19:08:39.352326+00'),
    ('5d60e73a-9961-45e3-b6b8-b3f04f658cf9', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '3dc5ae46f7aa7f850e39ab56f689ec16cb8b053999e52e74da45132ff0732726', '2026-09-17 19:08:39.456216+00', NULL, '2026-09-03 19:08:39.456216+00'),
    ('1936e383-2896-4a83-9eff-e3c0427c0ac6', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '3dc5ae46f7aa7f850e39ab56f689ec16cb8b053999e52e74da45132ff0732726', '2026-09-17 19:08:39.352072+00', NULL, '2026-09-03 19:08:39.352072+00'),
    ('93ad8883-3922-4a46-aba9-bdfbed750892', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '286edc5de234d0017a93cff55102990f42bba7a56678fe32e37fde31829cc56d', '2026-09-17 19:08:38.976602+00', '2026-09-03 19:08:39.830654+00', '2026-09-03 19:08:38.976602+00'),
    ('7e6310ed-1963-4c8d-8a72-f29630040f68', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '3dc5ae46f7aa7f850e39ab56f689ec16cb8b053999e52e74da45132ff0732726', '2026-09-17 19:08:39.498467+00', NULL, '2026-09-03 19:08:39.498467+00'),
    ('63b74555-4b97-4dcf-b1ed-c115fc73c0f8', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '3dc5ae46f7aa7f850e39ab56f689ec16cb8b053999e52e74da45132ff0732726', '2026-09-17 19:08:39.830654+00', NULL, '2026-09-03 19:08:39.830654+00'),
    ('08606613-85fe-4328-8efc-ae477e62838d', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '3dc5ae46f7aa7f850e39ab56f689ec16cb8b053999e52e74da45132ff0732726', '2026-09-17 19:08:39.633804+00', NULL, '2026-09-03 19:08:39.633804+00'),
    ('e476a66a-f652-469d-850e-cb63a1579b50', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'b172ad68fc1d74908d66eacbd467eeab1c3d0a6e696976878b7e4f4482b8a27a', '2026-09-17 20:46:14.202468+00', '2026-09-03 21:01:16.598821+00', '2026-09-03 20:46:14.202468+00'),
    ('41f266a0-7ea4-4815-880f-a36a28b920eb', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '3dc5ae46f7aa7f850e39ab56f689ec16cb8b053999e52e74da45132ff0732726', '2026-09-17 19:08:39.652422+00', NULL, '2026-09-03 19:08:39.652422+00'),
    ('d6f80f06-0217-4b26-9190-d3b40c77ced8', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '9dd250e40167a1dff11b58c4af4604b9504d088142c66389e681feb9854016ac', '2026-09-17 18:47:21.058657+00', '2026-09-03 19:08:39.634003+00', '2026-09-03 18:47:21.058657+00'),
    ('d3a1d0da-d232-4a50-a661-e747fcfcb6e0', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '3dc5ae46f7aa7f850e39ab56f689ec16cb8b053999e52e74da45132ff0732726', '2026-09-17 19:08:39.634003+00', NULL, '2026-09-03 19:08:39.634003+00'),
    ('0c575883-1d48-4270-a170-93f42efdcb1e', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '0d150fc561d5d0367a6b48e75d49c298a8b9f547d05560defe8ce368d5d7ba6d', '2026-09-17 19:08:40.198472+00', NULL, '2026-09-03 19:08:40.198472+00'),
    ('deb4722f-5b95-4188-9ecf-83ae32f0aa71', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', 'f3c94e24b8fdf3a82d8fa0f3e2a7e9e10c0002a8e4a6b9bdf6c667e41239b63d', '2026-09-17 19:23:42.02165+00', NULL, '2026-09-03 19:23:42.02165+00'),
    ('99f7d405-2382-4848-adb4-a53d8c58bf42', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'db39ca1733df387a7fa04a53e124415952382b57a697b09f61e453ca69bf9d0a', '2026-09-17 19:26:32.254273+00', '2026-09-03 19:26:39.75253+00', '2026-09-03 19:26:32.254273+00'),
    ('f8cd5c71-beb0-4a00-abcb-4d71346e5962', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '452a3a9cdc5af7735345c6b1ac887af1b188d6621f2a9496370b4bc9e5dbeebe', '2026-09-17 19:26:46.552565+00', '2026-09-03 19:27:11.617583+00', '2026-09-03 19:26:46.552565+00'),
    ('330940f7-8544-4180-a87a-5e5aaa49a2db', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'f92c082bfdb40278ec313d3f8ac2a874056f827d14434844f6d1021b2a3d5144', '2026-09-17 19:27:14.957631+00', '2026-09-03 19:42:19.921834+00', '2026-09-03 19:27:14.957631+00'),
    ('f86d3f52-fc8f-4a8c-a064-7c5d7f449efb', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'b8e06028f280bc273c1aba80f122d2bc6a9f58b142ee7e5d18791ef6c17228ab', '2026-09-17 19:42:19.921834+00', '2026-09-03 19:57:23.627683+00', '2026-09-03 19:42:19.921834+00'),
    ('9cef8564-e263-4446-9089-dca0c0fdac72', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '8363608996a55e0d5c02d5beb1968084f15071610ff4ac9f68a8ba4c1af6866f', '2026-09-17 19:57:23.627683+00', '2026-09-03 20:12:27.101537+00', '2026-09-03 19:57:23.627683+00'),
    ('f8bc39e5-8981-452e-8eaf-30b0bb55395b', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '00065a472c58854202137ed42440eb0d67d879b2d944fa28b114700abc150edf', '2026-09-17 20:12:27.101537+00', '2026-09-03 20:14:16.231051+00', '2026-09-03 20:12:27.101537+00'),
    ('fc3a8710-7611-431d-85c8-45be731e75f7', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '75a4b764695fd604d82e98cf9967961167298a99f41168d954869ee2087e8cee', '2026-09-17 20:14:21.45786+00', '2026-09-03 20:14:44.554438+00', '2026-09-03 20:14:21.45786+00'),
    ('d9742c1a-a39a-45fe-ae3d-8c475f6d6fd8', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '08ad69ee12c4dba3da0fcd50f3716ea035539fd697ac5eb83c672602a00f1ab9', '2026-09-17 20:14:50.555104+00', '2026-09-03 20:21:13.673126+00', '2026-09-03 20:14:50.555104+00'),
    ('7f6f210b-f5e9-461f-8634-2114ed71012b', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'faedb73e49fb2238756d42340f886014098bbdcf30f27a21bf3ede801f53eaef', '2026-09-17 20:21:17.954419+00', '2026-09-03 20:21:44.192252+00', '2026-09-03 20:21:17.954419+00'),
    ('305b53db-603f-4676-9923-5df2dc576c24', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'f1e0eb24ab97e7026a457f0966ab36877884a8d07c1a2ee7c46221d6cc2b404a', '2026-09-17 21:01:16.598821+00', '2026-09-03 21:16:19.519573+00', '2026-09-03 21:01:16.598821+00'),
    ('4ea3d7df-2ee3-4d90-b9b9-573515271e8e', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '9db3ccebd5ea65abb5385623d376066ff000265c72dbc3a181830406b0666bf1', '2026-09-17 21:16:19.519573+00', '2026-09-03 21:31:22.601892+00', '2026-09-03 21:16:19.519573+00'),
    ('d0e23ec4-5692-41ac-b0ab-6eb501ddb054', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '49e4bcaa0094f2ca71b8b2032f774fa802113e95a6474cd3e09bd41ff9a46ca9', '2026-09-17 21:31:22.601892+00', '2026-09-03 21:46:25.585838+00', '2026-09-03 21:31:22.601892+00'),
    ('ea1151fd-d9c5-4513-b146-7bcfa500eb7c', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'd6f3e4f8e8f8763802419dff1f4a86c61cab32b947a10f5d368bab3263de6d15', '2026-09-17 21:46:25.585838+00', '2026-09-03 22:01:28.963428+00', '2026-09-03 21:46:25.585838+00'),
    ('13269b59-fdea-4e7f-a031-642027ee6cc7', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'c497be740b2b07b826ea23f35d913da298eee6287087d7b113223da71280e06a', '2026-09-17 22:01:28.963428+00', '2026-09-03 22:16:31.153528+00', '2026-09-03 22:01:28.963428+00'),
    ('17e231fd-5919-4825-823a-3e762dd0388e', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '0a4f6a09c14415f3b84d391c74b81f9c97d7efa937390273f003206da7ddda37', '2026-09-17 22:29:53.46845+00', NULL, '2026-09-03 22:29:53.46845+00'),
    ('8fdbccd9-16c8-4d9e-a100-f80a72da7ccb', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '298c7a2742ff53f68c6f69106311a7e5561bdb78ec97197f4ede9b76b61a1496', '2026-09-17 20:21:48.150064+00', '2026-09-03 20:46:14.557435+00', '2026-09-03 20:21:48.150064+00'),
    ('0217a2a8-816c-447f-b0fb-94f3f20c80b1', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '9be46101e6195524bd7324f8adb8385c4126e531969d235412a9a13c9b05fabe', '2026-09-17 22:47:36.854531+00', '2026-09-03 22:52:57.931769+00', '2026-09-03 22:47:36.854531+00');
INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at) VALUES
    ('1d075f45-6af5-44ce-aa46-dc05da83640b', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'cb5262eaf83c52b05f21ca863f0422494bd20dbe62dc0add417f87452f84958b', '2026-09-17 22:53:01.14881+00', '2026-09-03 23:08:20.245217+00', '2026-09-03 22:53:01.14881+00'),
    ('50446494-fae6-4630-b8a3-67c7ab44511f', '12063947-0b9a-45f4-bec7-6f81c6443f1b', '2ac9462f9cfa0e94cca2e7da1df763996075f73af3f28bf917acc82155cae95e', '2026-09-17 23:08:20.245217+00', NULL, '2026-09-03 23:08:20.245217+00'),
    ('2b501e06-aa5c-4e77-997f-2fd3c4837b4f', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '4660ffe285e890e5d1992a06e16b7a3472d9c7ba9813dc31322a8ed465bfdf3c', '2026-09-17 23:15:38.493531+00', '2026-09-03 23:30:45.89762+00', '2026-09-03 23:15:38.493531+00'),
    ('908767b0-d030-4877-b11d-dd4772bbedb7', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '27da1b0bb7440b5058c7b191ce50604ed5ba8f0e30d4b488f2a33ccb48b02ec9', '2026-09-17 23:30:45.89762+00', '2026-09-03 23:46:14.656312+00', '2026-09-03 23:30:45.89762+00'),
    ('200e1660-c717-40b5-a819-5ae3db96b7ea', '291b2bd3-c527-4b7b-a0f7-8882177a095c', 'b0e602fc5ec626d589123c8cb00523519f32026c4d3a0d51bad0159633922339', '2026-09-17 23:46:14.656312+00', '2026-09-03 23:51:55.397911+00', '2026-09-03 23:46:14.656312+00'),
    ('59486600-edd0-4562-a58f-737df9681ebc', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '87c002a4d78a47a6c98f9ca6fcdcb48a4fae806e422bf4c3e7470f9ef37728dd', '2026-09-17 23:51:59.870057+00', '2026-09-04 00:07:11.344004+00', '2026-09-03 23:51:59.870057+00'),
    ('78a1f7a9-4267-4888-ab03-40422f04d6d1', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'ce350b38cb73ecd2ef8d29f1cf0507d099bb2037bf18ff7e43bc7cd6e1f52a81', '2026-09-18 00:07:11.344004+00', '2026-09-04 00:22:14.625817+00', '2026-09-04 00:07:11.344004+00'),
    ('bf843895-5e40-4c71-a862-b83f048a13dd', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'b172ad68fc1d74908d66eacbd467eeab1c3d0a6e696976878b7e4f4482b8a27a', '2026-09-17 20:46:14.447431+00', '2026-09-04 00:24:16.050426+00', '2026-09-03 20:46:14.447431+00'),
    ('3e8a1e1f-b0d8-4a39-8323-ce7ae66b087d', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'b172ad68fc1d74908d66eacbd467eeab1c3d0a6e696976878b7e4f4482b8a27a', '2026-09-17 20:46:14.43445+00', '2026-09-04 00:24:16.050426+00', '2026-09-03 20:46:14.43445+00'),
    ('a060831b-f0d1-460c-8040-1d32987ad086', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'b172ad68fc1d74908d66eacbd467eeab1c3d0a6e696976878b7e4f4482b8a27a', '2026-09-17 20:46:14.546884+00', '2026-09-04 00:24:16.050426+00', '2026-09-03 20:46:14.546884+00'),
    ('4674e572-463e-42f7-b4f7-ab84876c47e6', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'b172ad68fc1d74908d66eacbd467eeab1c3d0a6e696976878b7e4f4482b8a27a', '2026-09-17 20:46:14.551492+00', '2026-09-04 00:24:16.050426+00', '2026-09-03 20:46:14.551492+00'),
    ('a27fff2c-ed8f-4b70-8b57-095d930be0b3', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'b172ad68fc1d74908d66eacbd467eeab1c3d0a6e696976878b7e4f4482b8a27a', '2026-09-17 20:46:14.557693+00', '2026-09-04 00:24:16.050426+00', '2026-09-03 20:46:14.557693+00'),
    ('7be9b74a-0422-41b6-8191-06dd62c1add9', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'b172ad68fc1d74908d66eacbd467eeab1c3d0a6e696976878b7e4f4482b8a27a', '2026-09-17 20:46:14.559079+00', '2026-09-04 00:24:16.050426+00', '2026-09-03 20:46:14.559079+00'),
    ('82d61577-3c29-411d-85ae-5862410fcf4e', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'b172ad68fc1d74908d66eacbd467eeab1c3d0a6e696976878b7e4f4482b8a27a', '2026-09-17 20:46:14.567464+00', '2026-09-04 00:24:16.050426+00', '2026-09-03 20:46:14.567464+00'),
    ('6dd64923-d67c-47b3-9c54-ba10a37b17ed', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'b172ad68fc1d74908d66eacbd467eeab1c3d0a6e696976878b7e4f4482b8a27a', '2026-09-17 20:46:14.640671+00', '2026-09-04 00:24:16.050426+00', '2026-09-03 20:46:14.640671+00'),
    ('25398c95-b0e2-426a-b0e2-8ff6653e7bec', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'b172ad68fc1d74908d66eacbd467eeab1c3d0a6e696976878b7e4f4482b8a27a', '2026-09-17 20:46:14.646189+00', '2026-09-04 00:24:16.050426+00', '2026-09-03 20:46:14.646189+00'),
    ('648060f1-f925-4f30-a92b-9ef51851b9e6', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'ebe8bab22f7690c480cd05e1f765d9b0883115201d2a57d8d99bf891caf484ae', '2026-09-17 22:16:31.153528+00', '2026-09-04 00:24:16.050426+00', '2026-09-03 22:16:31.153528+00'),
    ('893de255-dbc1-4cf2-83a9-a19db5e40996', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'b172ad68fc1d74908d66eacbd467eeab1c3d0a6e696976878b7e4f4482b8a27a', '2026-09-17 20:46:14.659455+00', '2026-09-04 00:24:16.050426+00', '2026-09-03 20:46:14.659455+00'),
    ('bfb0a2b4-d706-45bb-a268-206d9aabe266', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'b172ad68fc1d74908d66eacbd467eeab1c3d0a6e696976878b7e4f4482b8a27a', '2026-09-17 20:46:14.609459+00', '2026-09-04 00:24:16.050426+00', '2026-09-03 20:46:14.609459+00'),
    ('60078e0b-1893-44cf-9421-714e64953888', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'b172ad68fc1d74908d66eacbd467eeab1c3d0a6e696976878b7e4f4482b8a27a', '2026-09-17 20:46:14.557435+00', '2026-09-04 00:24:16.050426+00', '2026-09-03 20:46:14.557435+00'),
    ('9d4a7842-16b6-431a-878d-734d9df570ee', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '6fbc61ee5bad1f3c98575a0dc9101882e7f76f0381054160c9c155b705291c4c', '2026-09-17 22:41:52.549838+00', '2026-09-04 00:24:16.050426+00', '2026-09-03 22:41:52.549838+00'),
    ('7cbfdd34-dca7-442f-8983-be98116208c6', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '7f9b1c56a243256356a1cfa59aeae4b88382215f88826f933f534b5e8037334b', '2026-09-18 00:22:14.625817+00', '2026-09-04 00:24:16.050426+00', '2026-09-04 00:22:14.625817+00'),
    ('08e9a3b6-d249-4aea-af30-d69df6a14f97', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '5e6014ebaeb7a94a2ae95c7c95b8389a28bec8fdbaa4b22aabafe871c120886c', '2026-09-18 00:24:16.050426+00', '2026-09-04 00:39:29.507753+00', '2026-09-04 00:24:16.050426+00'),
    ('eca9ebeb-f3af-4b43-a48d-ef5c1cbe927a', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '328c46c70732353200b16566e79bc27977070de2b442be3b2aea658d1d2208a1', '2026-09-18 00:39:29.507753+00', '2026-09-04 00:43:24.65258+00', '2026-09-04 00:39:29.507753+00'),
    ('59cda8f8-72a6-4084-a092-3584101dc719', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '56679c7f8f7f105d2f0cf9ecd0e7fd94555b358fa2d5e51051281b9fb5c4db91', '2026-09-18 00:43:28.861931+00', '2026-09-04 00:43:40.400937+00', '2026-09-04 00:43:28.861931+00'),
    ('2ab73ae2-f4da-49dc-b22d-568f429d7b45', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'baec19c23409b903b12ab8c198b519d2b3a873689e51ff597a3d7dfa4a0bc987', '2026-09-18 00:43:40.400937+00', '2026-09-04 00:43:49.521988+00', '2026-09-04 00:43:40.400937+00'),
    ('98c806f3-f855-4637-8ce2-de6ac3d47144', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '5edf78c65abf029a36d6d201054ce3b476404b18a669d00ffc1cfe4481375501', '2026-09-18 00:43:49.521988+00', '2026-09-04 00:44:07.456154+00', '2026-09-04 00:43:49.521988+00'),
    ('bf73dcd2-a5b3-4480-89ff-aeaa9d3a48ca', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '2ba0c8e35c26ca67ef0ca20b93f28660dfda484f0a087d9e16a9513346e51fbd', '2026-09-18 00:44:07.456154+00', '2026-09-04 00:44:23.744674+00', '2026-09-04 00:44:07.456154+00'),
    ('2453075a-f6cc-4e24-bdfc-61f0ffb75769', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '8e75494a4dd330f33b9fd3574a9c5bbaf5263130fe0011e230be356622a09e4f', '2026-09-18 00:44:23.744674+00', '2026-09-04 00:45:21.681217+00', '2026-09-04 00:44:23.744674+00'),
    ('dce38b1f-d812-491e-a025-fa5aeea28ecd', '0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', '2777a4bb14fa54d821ba175d98e342e435e0e82f6219bdb9d7e5db8adfa0d3b2', '2026-09-18 00:45:21.681217+00', NULL, '2026-09-04 00:45:21.681217+00'),
    ('dec55671-a96c-46ca-b8a3-7ae568f3732e', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'ee425da7bb0b9ecc512e42ec53291e530a971ea5a4cf41c015ff8185df29fcae', '2026-09-18 00:45:38.45861+00', '2026-09-04 00:46:41.982378+00', '2026-09-04 00:45:38.45861+00'),
    ('285dcc05-c833-43ed-b726-a6b9ccfbaedf', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', 'e42585f88339bbe54fbe995e28cf56c168cfa3599fdef4e0d0c6fd9d50400f26', '2026-09-18 00:47:08.055173+00', '2026-09-04 00:54:04.787239+00', '2026-09-04 00:47:08.055173+00'),
    ('8e47d1a9-a49c-47fc-aa20-38bed8d49083', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', '9f862cac7c425d27558e550d39b009bd30e7c5360cc0c3cc5977f9aec139766b', '2026-09-18 00:54:11.552354+00', '2026-09-04 00:55:01.516275+00', '2026-09-04 00:54:11.552354+00'),
    ('40a301ac-9a1b-4d1a-b455-e14dbfbba0fc', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', 'd3a7dcd6ead775afce00902624ec85c4ee07eecd3b2169c9aef887c4b547348e', '2026-09-18 00:55:08.27422+00', NULL, '2026-09-04 00:55:08.27422+00'),
    ('d97b1dc7-a872-44d0-b0eb-83e4af2054b8', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'a10f1740752b0aacf2eb59bcbc751b6d7599cdfbaf5049bf19673abea031f175', '2026-09-18 00:55:24.455478+00', NULL, '2026-09-04 00:55:24.455478+00'),
    ('330eb446-b4a4-42ad-a10b-12fe3ce4de91', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', 'c4b6910b64c6a6cc2ac54b9ce6594930d1e2f04974f91cfb6a2e39d0250e3179', '2026-09-18 00:55:42.670303+00', NULL, '2026-09-04 00:55:42.670303+00'),
    ('dc377366-aa15-444e-8983-df5e3d64a819', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'f16e7d4e012566f832c4614045ac263fc4d0c5d2694ab08ba74af89f0a894a27', '2026-09-18 00:57:39.167512+00', '2026-09-04 00:58:10.701745+00', '2026-09-04 00:57:39.167512+00'),
    ('344728a7-889c-4e81-b7de-9929cf12d1a4', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'f1c0b6efe09b3c7f4b646f7d6b555ad3523efda7b8362748454d2491f9a31986', '2026-09-18 00:58:14.659133+00', '2026-09-04 01:00:38.118827+00', '2026-09-04 00:58:14.659133+00'),
    ('341212f3-7914-4f02-a9c5-3b8af6416277', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'bb0a4bf97b662ae574175c01b48a895badd5d6498df0c68419ce679e6abeba06', '2026-09-18 01:00:42.670498+00', NULL, '2026-09-04 01:00:42.670498+00'),
    ('0da146dd-784e-4097-9cca-6744a62122f4', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '7695486ec1364b2f0c31889eba35d3f142a4d336e572f1b8992522a1326d92ff', '2026-09-18 01:07:52.453631+00', '2026-09-04 01:16:50.388081+00', '2026-09-04 01:07:52.453631+00'),
    ('d88ab9b4-e177-402c-b3fc-d89fb6a520f9', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'bc3bc911427822d68499dd635c85e0faf05ae76c5ad56266293e79e8e09ed26a', '2026-09-18 01:16:58.347626+00', '2026-09-04 01:17:31.500955+00', '2026-09-04 01:16:58.347626+00'),
    ('d8f671eb-0f3d-443e-bb80-a0632b58fc7d', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', 'f2f44fa211dd773f18a78508bbaad6a7432cf9e8261b68d0ae1908253a677a70', '2026-09-18 01:17:37.162059+00', NULL, '2026-09-04 01:17:37.162059+00'),
    ('8830b849-dd3e-4b0b-b5bc-0c6c9f752ffc', '91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'c37bf8f19f0443dbfd0dbf1194cebce85f6cb59194e3027698c6a6f09e3406a5', '2026-09-18 01:30:30.661811+00', '2026-09-04 01:39:40.362244+00', '2026-09-04 01:30:30.661811+00'),
    ('ba48455b-39a1-4fd6-8456-23b0d80d4d2e', '1a92b49e-3eb8-4e92-844f-3c6b806819c8', '993201fc560ba42a6f0625be14208d095b9520c28e740016b3ba7f4f47c7538a', '2026-09-18 01:39:46.077934+00', NULL, '2026-09-04 01:39:46.077934+00'),
    ('2de957e9-788c-4409-abeb-ed4e0e99f388', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '680c265aa498e7999d0cdfa93b6329d9fcb315eaee40b75becf22877e0c5059d', '2026-09-18 02:51:52.751731+00', NULL, '2026-09-04 02:51:52.751731+00'),
    ('1eb96c16-233d-4faf-801c-2373f9ec2899', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '680c265aa498e7999d0cdfa93b6329d9fcb315eaee40b75becf22877e0c5059d', '2026-09-18 02:51:52.75289+00', NULL, '2026-09-04 02:51:52.75289+00'),
    ('82153634-2625-4567-8044-079ffdd97296', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '680c265aa498e7999d0cdfa93b6329d9fcb315eaee40b75becf22877e0c5059d', '2026-09-18 02:51:52.807787+00', NULL, '2026-09-04 02:51:52.807787+00'),
    ('4e7e6c25-f1db-4b10-9c1b-3e5d0dca1d51', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '680c265aa498e7999d0cdfa93b6329d9fcb315eaee40b75becf22877e0c5059d', '2026-09-18 02:51:52.809423+00', NULL, '2026-09-04 02:51:52.809423+00'),
    ('238ffccb-274c-4f14-a42a-354b159c1753', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '680c265aa498e7999d0cdfa93b6329d9fcb315eaee40b75becf22877e0c5059d', '2026-09-18 02:51:52.810931+00', NULL, '2026-09-04 02:51:52.810931+00'),
    ('32bf67ae-e194-43a6-ac0f-36c1fee1230a', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '680c265aa498e7999d0cdfa93b6329d9fcb315eaee40b75becf22877e0c5059d', '2026-09-18 02:51:52.809937+00', NULL, '2026-09-04 02:51:52.809937+00');
INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at) VALUES
    ('b3843a1b-d6d0-42ba-8692-f0cf7e74fb02', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '680c265aa498e7999d0cdfa93b6329d9fcb315eaee40b75becf22877e0c5059d', '2026-09-18 02:51:52.915291+00', NULL, '2026-09-04 02:51:52.915291+00'),
    ('fdb2be01-5c4c-4cb0-8caa-c6e92fbf984c', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '680c265aa498e7999d0cdfa93b6329d9fcb315eaee40b75becf22877e0c5059d', '2026-09-18 02:51:52.956306+00', NULL, '2026-09-04 02:51:52.956306+00'),
    ('6761207b-26b7-41e1-a772-0d32a8902ee1', '291b2bd3-c527-4b7b-a0f7-8882177a095c', 'c560b83f9baac98388005472cfc7041b8e9aa8c3ee7d5d6e84a5f3e62d38155e', '2026-09-18 01:53:22.090188+00', '2026-09-04 02:51:52.907556+00', '2026-09-04 01:53:22.090188+00'),
    ('d49ec2f2-b529-45d9-9f5b-5b59a2f22bf5', '291b2bd3-c527-4b7b-a0f7-8882177a095c', '680c265aa498e7999d0cdfa93b6329d9fcb315eaee40b75becf22877e0c5059d', '2026-09-18 02:51:52.907556+00', NULL, '2026-09-04 02:51:52.907556+00');


--
-- Data for Name: saved_views; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.saved_views (1 row)
--

INSERT INTO public.saved_views (id, company_id, user_id, page, name, filters, created_at) VALUES
    ('444cd100-4af9-4bdd-984e-e8b1a4bf4989', '4c85707f-c04c-4c62-9346-be0fe715464c', '12063947-0b9a-45f4-bec7-6f81c6443f1b', 'estimates', 'approved saved', '{"search": "", "status": "sent"}', '2026-08-29 15:12:25.861395+00');


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.schema_migrations (14 rows)
--

INSERT INTO public.schema_migrations (id, applied_at) VALUES
    ('001_init.sql', '2026-08-21 11:29:22.503842+00'),
    ('002_app_role.sql', '2026-08-21 11:29:23.878121+00'),
    ('003_crm.sql', '2026-08-21 11:29:24.957593+00'),
    ('004_twilio.sql', '2026-08-21 11:29:25.912549+00'),
    ('005_platform.sql', '2026-08-21 11:29:26.797405+00'),
    ('006_plan_features.sql', '2026-08-21 11:29:27.800432+00'),
    ('007_grant_app_role.sql', '2026-08-21 11:29:28.69991+00'),
    ('008_crm_basics.sql', '2026-08-21 11:29:29.76018+00'),
    ('009_comms_email.sql', '2026-08-21 11:29:30.667219+00'),
    ('010_user_profile.sql', '2026-08-21 11:29:31.562548+00'),
    ('011_email_channels.sql', '2026-08-21 11:29:32.460978+00'),
    ('012_onboarding.sql', '2026-08-21 11:29:33.343647+00'),
    ('013_email_template_types.sql', '2026-08-21 11:31:52.277239+00'),
    ('013_smtp_reply_to.sql', '2026-08-31 11:59:44.340825+00');


--
-- Data for Name: service_agreements; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.service_agreements (3 rows)
--

INSERT INTO public.service_agreements (id, company_id, customer_id, job_id, title, terms, status, start_date, end_date) VALUES
    ('d0753d02-8b13-4d93-b329-9421f35fe0b7', '4c85707f-c04c-4c62-9346-be0fe715464c', '9bbaec87-6960-4e9c-a9fd-ae0f9cd1205f', 'b9103a7d-9e23-4803-80d0-d33ef6acf30f', 'Annual Maintenance - Johnson Residence', 'Quarterly plumbing inspection and maintenance.', 'active', '2026-01-01', '2026-12-31'),
    ('a367d13d-7a1a-4f92-92ce-dc2c724c66b9', '4c85707f-c04c-4c62-9346-be0fe715464c', '0c75e45a-b9ed-4dfb-8ba0-e0b75fe01d64', NULL, 'Emergency Service Agreement - Clark', '24/7 emergency service guarantee.', 'active', '2025-06-01', '2026-05-31'),
    ('c740517d-79ad-4d54-9b1e-e2b53576871b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'c43b35f5-170a-4729-8d3e-2ff4bc8c81ee', NULL, 'new agreeement ash ', 'terms willbe define ', 'active', '2026-09-18', '2026-10-14');


--
-- Data for Name: subscription_plans; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.subscription_plans (4 rows)
--

INSERT INTO public.subscription_plans (id, name, price_cents, billing_interval, max_workers, max_jobs, features, created_at, updated_at, stripe_price_id_monthly, stripe_price_id_yearly, price_cents_yearly, feature_keys) VALUES
    ('827f71f6-e194-4ce5-8d93-5067c866ba78', 'Pro', '9900', 'monthly', '20', '-1', '{"Up to 20 workers","Unlimited jobs","Advanced reports","Priority support","Calendar view","Inventory management"}', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, '{reports,calendar,dispatch,inventory}'),
    ('839d7188-413a-4f8f-b2b9-0418f9a69813', 'Enterprise', '24900', 'monthly', '-1', '-1', '{"Unlimited workers","Unlimited jobs","Custom reports","Dedicated support","API access","White labeling",Multi-location}', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', NULL, NULL, NULL, '{reports,calendar,dispatch,inventory,api,white_label,multi_location}'),
    ('91d439bf-4a26-40a9-843c-0c097eec9e83', 'Basic', '5300', 'monthly', '5', '50', '{"Up to 5 workers","50 jobs/month","Basic reports","Email support"}', '2026-08-21 11:31:56.489544+00', '2026-08-27 23:16:31.976872+00', NULL, NULL, '58800', '{reports}'),
    ('983b428f-a378-4ffe-a9d4-58140bf53b1e', 'super Premium ', '50000', 'monthly', '10', '100', '{}', '2026-08-27 23:22:15.818693+00', '2026-08-27 23:22:15.818693+00', NULL, NULL, NULL, '{reports,dispatch,api,white_label,inventory,calendar,multi_location}');


--
-- Data for Name: tags; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.tags (18 rows)
--

INSERT INTO public.tags (id, company_id, name) VALUES
    ('58c6863c-8450-4b03-aea9-67797851d26b', '4c85707f-c04c-4c62-9346-be0fe715464c', 'Repeat'),
    ('37b8b324-7a08-4791-a3c1-8c19e120b1ce', '4c85707f-c04c-4c62-9346-be0fe715464c', 'Renovation'),
    ('901aa618-69e6-4d1a-81ea-30953d20605e', '4c85707f-c04c-4c62-9346-be0fe715464c', 'Insurance'),
    ('e06c89a4-1328-4bc2-b716-a00e4b15d1e4', '4c85707f-c04c-4c62-9346-be0fe715464c', 'Outdoor'),
    ('7cbeb244-62df-44f1-9ea9-28b680f24082', '4c85707f-c04c-4c62-9346-be0fe715464c', 'Permit-Required'),
    ('965de877-44d4-46db-95dc-52e6b5e499b5', '4c85707f-c04c-4c62-9346-be0fe715464c', 'Upsell'),
    ('d734bec4-dc94-49a7-b783-1dc89d19bf18', '4c85707f-c04c-4c62-9346-be0fe715464c', 'VIP'),
    ('ff08f15c-7064-482b-9ea8-b323a0b0c96e', '4c85707f-c04c-4c62-9346-be0fe715464c', 'Agreement'),
    ('b41a825e-8d46-4d84-b4ae-374456e67f19', 'dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', 'Electrical'),
    ('de593832-955a-4f26-8d04-bdd4950a2642', 'dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', 'EV'),
    ('6bad422d-3ce4-4985-a375-3df1ae9474eb', '3b08e91a-b804-4b8e-9040-b203846c1c59', 'Commercial'),
    ('f52a25ed-57c4-4e66-b6e2-d862a75a1939', '3b08e91a-b804-4b8e-9040-b203846c1c59', 'HVAC'),
    ('ae1c0ff9-b628-4bae-8b5b-68f8fce569d1', '4c85707f-c04c-4c62-9346-be0fe715464c', 'Residential'),
    ('4cb38da7-620e-4e9f-9dc4-ff7e33ad22f3', '4c85707f-c04c-4c62-9346-be0fe715464c', 'Tankless'),
    ('050778a9-8b9c-4a5a-a944-684e28e9a25f', '4c85707f-c04c-4c62-9346-be0fe715464c', 'Annual'),
    ('1023050b-deb1-4f5a-a526-209bb627cab2', '4c85707f-c04c-4c62-9346-be0fe715464c', 'Compliance'),
    ('97426a91-b8ab-4e54-bb4a-895b625ca9d3', '4c85707f-c04c-4c62-9346-be0fe715464c', 'High-Value'),
    ('4e6c28be-707e-4ba8-a243-f88816cebc5a', '4c85707f-c04c-4c62-9346-be0fe715464c', 'Excavation');


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.users (18 rows)
--

INSERT INTO public.users (id, email, password_hash, name, phone, avatar_url, is_platform_admin, created_at, updated_at, first_name, last_name, job_title, timezone, locale, last_login_at, avatar_key) VALUES
    ('c594d8fa-1677-4ae1-be00-5b4261c64899', 'david@sparkvolt.com', '$argon2id$v=19$m=65536,t=3,p=4$+OvC54mGgAJI8v/4rmcEnA$TqxdqX8+M5bMNziSB19LJ6y61BHsTF1Ox/fJ+b7mkxU', 'David Rodriguez', '(555) 200-0002', NULL, 'f', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', '', '', NULL, 'America/Chicago', 'en', NULL, NULL),
    ('865867cf-e471-42ed-9b83-753015196d19', 'carlos@mitchell-plumbing.com', '$argon2id$v=19$m=65536,t=3,p=4$+OvC54mGgAJI8v/4rmcEnA$TqxdqX8+M5bMNziSB19LJ6y61BHsTF1Ox/fJ+b7mkxU', 'Carlos Rivera', '(555) 300-0002', NULL, 'f', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', '', '', NULL, 'America/Chicago', 'en', NULL, NULL),
    ('f9cabbe7-6fcb-4b50-b376-83f520719e24', 'tyler@mitchell-plumbing.com', '$argon2id$v=19$m=65536,t=3,p=4$+OvC54mGgAJI8v/4rmcEnA$TqxdqX8+M5bMNziSB19LJ6y61BHsTF1Ox/fJ+b7mkxU', 'Tyler Brooks', '(555) 300-0003', NULL, 'f', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', '', '', NULL, 'America/Chicago', 'en', NULL, NULL),
    ('32b6a73d-4858-43dc-a692-0e8cebd60cd4', 'omar@mitchell-plumbing.com', '$argon2id$v=19$m=65536,t=3,p=4$+OvC54mGgAJI8v/4rmcEnA$TqxdqX8+M5bMNziSB19LJ6y61BHsTF1Ox/fJ+b7mkxU', 'Omar Patel', '(555) 300-0007', NULL, 'f', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', '', '', NULL, 'America/Chicago', 'en', NULL, NULL),
    ('2838bc5b-a147-4274-8c34-91d2137b8c87', 'mike@sparkvolt.com', '$argon2id$v=19$m=65536,t=3,p=4$+OvC54mGgAJI8v/4rmcEnA$TqxdqX8+M5bMNziSB19LJ6y61BHsTF1Ox/fJ+b7mkxU', 'Mike Chen', '(555) 300-0004', NULL, 'f', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', '', '', NULL, 'America/Chicago', 'en', NULL, NULL),
    ('3d650b26-16dc-4bec-b9e9-9db4d712e47f', 'ahmed@sparkvolt.com', '$argon2id$v=19$m=65536,t=3,p=4$+OvC54mGgAJI8v/4rmcEnA$TqxdqX8+M5bMNziSB19LJ6y61BHsTF1Ox/fJ+b7mkxU', 'Ahmed Hassan', '(555) 300-0005', NULL, 'f', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', '', '', NULL, 'America/Chicago', 'en', NULL, NULL),
    ('9d4dd9c7-fff9-4687-96a5-98f145aea2ef', 'rachel@sparkvolt.com', '$argon2id$v=19$m=65536,t=3,p=4$+OvC54mGgAJI8v/4rmcEnA$TqxdqX8+M5bMNziSB19LJ6y61BHsTF1Ox/fJ+b7mkxU', 'Rachel Kim', '(555) 300-0008', NULL, 'f', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', '', '', NULL, 'America/Chicago', 'en', NULL, NULL),
    ('cf29678a-1e0e-4c8a-9a00-f2f11893e7f1', 'james@coolbreeze.com', '$argon2id$v=19$m=65536,t=3,p=4$+OvC54mGgAJI8v/4rmcEnA$TqxdqX8+M5bMNziSB19LJ6y61BHsTF1Ox/fJ+b7mkxU', 'James Wilson', '(555) 300-0009', NULL, 'f', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', '', '', NULL, 'America/Chicago', 'en', NULL, NULL),
    ('0dd3164c-b246-4de2-8df1-a67f29b531d8', 'maria@coolbreeze.com', '$argon2id$v=19$m=65536,t=3,p=4$+OvC54mGgAJI8v/4rmcEnA$TqxdqX8+M5bMNziSB19LJ6y61BHsTF1Ox/fJ+b7mkxU', 'Maria Gonzalez', '(555) 300-0010', NULL, 'f', '2026-08-21 11:31:56.489544+00', '2026-08-21 11:31:56.489544+00', '', '', NULL, 'America/Chicago', 'en', NULL, NULL),
    ('a78bcb87-2e94-4c04-9006-7a69ac4bb165', 'tomb@mitchell-plumbing.com', '$argon2id$v=19$m=65536,t=3,p=4$pNoBE5bUjxFATn5w/bfhWQ$2IV1TQCFccM92gTgaJ1FFiOGuOWij4YEYnTe0P0gOrc', 'Tomb', '03111234567', NULL, 'f', '2026-09-03 13:52:56.697942+00', '2026-09-03 13:52:56.697942+00', '', '', NULL, 'America/Chicago', 'en', NULL, NULL),
    ('12063947-0b9a-45f4-bec7-6f81c6443f1b', 'sarah@mitchell-plumbing.com', '$argon2id$v=19$m=65536,t=3,p=4$+OvC54mGgAJI8v/4rmcEnA$TqxdqX8+M5bMNziSB19LJ6y61BHsTF1Ox/fJ+b7mkxU', 'Sarah Mitchell', '(555) 200-0001', NULL, 'f', '2026-08-21 11:31:56.489544+00', '2026-09-04 00:58:14.659133+00', '', '', NULL, 'America/Chicago', 'en', '2026-09-04 00:58:14.659133+00', NULL),
    ('063e98b4-9e12-49f7-b675-b78694cd20b5', 'emma@coolbreeze.com', '$argon2id$v=19$m=65536,t=3,p=4$+OvC54mGgAJI8v/4rmcEnA$TqxdqX8+M5bMNziSB19LJ6y61BHsTF1Ox/fJ+b7mkxU', 'Emma Thompson', '(555) 200-0003', NULL, 'f', '2026-08-21 11:31:56.489544+00', '2026-09-02 15:25:14.537266+00', '', '', NULL, 'America/Chicago', 'en', '2026-09-02 15:25:14.537266+00', NULL),
    ('0953153e-a13d-4ad6-a5bb-6278d0cd9dd7', 'jake@mitchell-plumbing.com', '$argon2id$v=19$m=65536,t=3,p=4$+OvC54mGgAJI8v/4rmcEnA$TqxdqX8+M5bMNziSB19LJ6y61BHsTF1Ox/fJ+b7mkxU', 'Jake Morrison', '(555) 300-0001', NULL, 'f', '2026-08-21 11:31:56.489544+00', '2026-09-04 00:43:28.861931+00', '', '', NULL, 'America/Chicago', 'en', '2026-09-04 00:43:28.861931+00', NULL),
    ('7f8f442a-3993-44ff-8d8f-f7664ba85b8d', 'randombunnyhunter2@gmail.comd', '$argon2id$v=19$m=65536,t=3,p=4$xNtWU/K5R9sYRujAVIWkgQ$eIT7y8sFOa8y+d34E72GSDeCAQNSqfhH19T7l0D7rKo', 'new ash worker', '+923273621640', NULL, 'f', '2026-08-29 15:44:06.189819+00', '2026-08-29 15:44:06.189819+00', '', '', NULL, 'America/Chicago', 'en', NULL, NULL),
    ('91823e01-9e7c-427f-a8c7-a8dcffbb2b21', 'syedmuhammadashhadufaridi@gmail.com', '$argon2id$v=19$m=65536,t=3,p=4$2Bg1PgfkY1CdSel2VePrgw$9jjYuzeWL1hDKiX494UTtgk3hUVy33klg/mwz+ouYXk', 'PAF KIET University', '03273621640', NULL, 'f', '2026-09-03 00:48:31.379025+00', '2026-09-04 01:30:30.661811+00', 'Syed Muhammad Ash-hadu', 'Faridi', '', 'America/Chicago', 'en', '2026-09-04 01:30:30.661811+00', NULL),
    ('1a92b49e-3eb8-4e92-844f-3c6b806819c8', 'rohtiqlabs@gmail.com', '$argon2id$v=19$m=65536,t=3,p=4$f0vaezswBxqZ/FhrwfezIQ$cGpNbpO1yx/cH6T95BY4Xf+yucK6zG57kcoMwZPsEog', 'saqib', '+923273621640', NULL, 'f', '2026-09-03 18:31:37.771016+00', '2026-09-04 01:39:46.077934+00', '', '', NULL, 'America/Chicago', 'en', '2026-09-04 01:39:46.077934+00', NULL),
    ('d8534839-3925-4194-862f-201365d1f6db', 'lisa@mitchell-plumbing.com', '$argon2id$v=19$m=65536,t=3,p=4$+OvC54mGgAJI8v/4rmcEnA$TqxdqX8+M5bMNziSB19LJ6y61BHsTF1Ox/fJ+b7mkxU', 'Lisa Park', '(555) 300-0006', NULL, 'f', '2026-08-21 11:31:56.489544+00', '2026-09-03 13:45:55.470838+00', '', '', NULL, 'America/Chicago', 'en', '2026-09-03 13:45:55.470838+00', NULL),
    ('291b2bd3-c527-4b7b-a0f7-8882177a095c', 'marcus@fieldpro.io', '$argon2id$v=19$m=65536,t=3,p=4$+OvC54mGgAJI8v/4rmcEnA$TqxdqX8+M5bMNziSB19LJ6y61BHsTF1Ox/fJ+b7mkxU', 'Marcus Chen', '(555) 100-0001', NULL, 't', '2026-08-21 11:31:56.489544+00', '2026-09-04 01:53:22.090188+00', '', '', NULL, 'America/Chicago', 'en', '2026-09-04 01:53:22.090188+00', NULL);


--
-- Data for Name: worker_availability; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.worker_availability (66 rows)
--

INSERT INTO public.worker_availability (company_id, worker_profile_id, weekday, start_time, end_time) VALUES
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'f20b9077-f882-4e40-b905-c6583935f9a4', '0', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'f20b9077-f882-4e40-b905-c6583935f9a4', '1', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'f20b9077-f882-4e40-b905-c6583935f9a4', '2', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'f20b9077-f882-4e40-b905-c6583935f9a4', '3', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'f20b9077-f882-4e40-b905-c6583935f9a4', '4', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '6eb5b846-569d-4941-ba3d-85373f5febd3', '0', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '6eb5b846-569d-4941-ba3d-85373f5febd3', '1', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '6eb5b846-569d-4941-ba3d-85373f5febd3', '2', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '6eb5b846-569d-4941-ba3d-85373f5febd3', '3', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '6eb5b846-569d-4941-ba3d-85373f5febd3', '4', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '6eb5b846-569d-4941-ba3d-85373f5febd3', '5', '09:00:00', '14:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '92db34d2-b4b1-4601-999f-a3897cfbc2f4', '0', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '92db34d2-b4b1-4601-999f-a3897cfbc2f4', '1', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '92db34d2-b4b1-4601-999f-a3897cfbc2f4', '2', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '92db34d2-b4b1-4601-999f-a3897cfbc2f4', '3', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '92db34d2-b4b1-4601-999f-a3897cfbc2f4', '4', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '4145c809-d3bc-43fb-b48c-1306ba83b773', '0', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '4145c809-d3bc-43fb-b48c-1306ba83b773', '1', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '4145c809-d3bc-43fb-b48c-1306ba83b773', '2', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '4145c809-d3bc-43fb-b48c-1306ba83b773', '3', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '4145c809-d3bc-43fb-b48c-1306ba83b773', '4', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '5954d953-5792-4933-a377-41ba9308fff0', '0', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '5954d953-5792-4933-a377-41ba9308fff0', '1', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '5954d953-5792-4933-a377-41ba9308fff0', '2', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '5954d953-5792-4933-a377-41ba9308fff0', '3', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '5954d953-5792-4933-a377-41ba9308fff0', '4', '08:00:00', '17:00:00'),
    ('dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '389152b3-2ed7-4439-a344-82a42e366391', '0', '08:00:00', '17:00:00'),
    ('dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '389152b3-2ed7-4439-a344-82a42e366391', '1', '08:00:00', '17:00:00'),
    ('dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '389152b3-2ed7-4439-a344-82a42e366391', '2', '08:00:00', '17:00:00'),
    ('dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '389152b3-2ed7-4439-a344-82a42e366391', '3', '08:00:00', '17:00:00'),
    ('dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '389152b3-2ed7-4439-a344-82a42e366391', '4', '08:00:00', '17:00:00'),
    ('dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '595767c8-b9be-498b-a7f8-f995019dfb45', '0', '08:00:00', '17:00:00'),
    ('dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '595767c8-b9be-498b-a7f8-f995019dfb45', '1', '08:00:00', '17:00:00'),
    ('dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '595767c8-b9be-498b-a7f8-f995019dfb45', '2', '08:00:00', '17:00:00'),
    ('dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '595767c8-b9be-498b-a7f8-f995019dfb45', '3', '08:00:00', '17:00:00'),
    ('dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '595767c8-b9be-498b-a7f8-f995019dfb45', '4', '08:00:00', '17:00:00'),
    ('dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', 'b56860ad-2c02-4211-9f1b-4f2200d8d7b7', '0', '08:00:00', '17:00:00'),
    ('dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', 'b56860ad-2c02-4211-9f1b-4f2200d8d7b7', '1', '08:00:00', '17:00:00'),
    ('dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', 'b56860ad-2c02-4211-9f1b-4f2200d8d7b7', '2', '08:00:00', '17:00:00'),
    ('dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', 'b56860ad-2c02-4211-9f1b-4f2200d8d7b7', '3', '08:00:00', '17:00:00'),
    ('dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', 'b56860ad-2c02-4211-9f1b-4f2200d8d7b7', '4', '08:00:00', '17:00:00'),
    ('3b08e91a-b804-4b8e-9040-b203846c1c59', '809e604a-b243-4e39-ae09-512f2a9c5285', '0', '08:00:00', '17:00:00'),
    ('3b08e91a-b804-4b8e-9040-b203846c1c59', '809e604a-b243-4e39-ae09-512f2a9c5285', '1', '08:00:00', '17:00:00'),
    ('3b08e91a-b804-4b8e-9040-b203846c1c59', '809e604a-b243-4e39-ae09-512f2a9c5285', '2', '08:00:00', '17:00:00'),
    ('3b08e91a-b804-4b8e-9040-b203846c1c59', '809e604a-b243-4e39-ae09-512f2a9c5285', '3', '08:00:00', '17:00:00'),
    ('3b08e91a-b804-4b8e-9040-b203846c1c59', '809e604a-b243-4e39-ae09-512f2a9c5285', '4', '08:00:00', '17:00:00'),
    ('3b08e91a-b804-4b8e-9040-b203846c1c59', 'f9222c5b-d057-49da-b0bf-55a8ede0d0fc', '0', '08:00:00', '17:00:00'),
    ('3b08e91a-b804-4b8e-9040-b203846c1c59', 'f9222c5b-d057-49da-b0bf-55a8ede0d0fc', '1', '08:00:00', '17:00:00'),
    ('3b08e91a-b804-4b8e-9040-b203846c1c59', 'f9222c5b-d057-49da-b0bf-55a8ede0d0fc', '2', '08:00:00', '17:00:00'),
    ('3b08e91a-b804-4b8e-9040-b203846c1c59', 'f9222c5b-d057-49da-b0bf-55a8ede0d0fc', '3', '08:00:00', '17:00:00');
INSERT INTO public.worker_availability (company_id, worker_profile_id, weekday, start_time, end_time) VALUES
    ('3b08e91a-b804-4b8e-9040-b203846c1c59', 'f9222c5b-d057-49da-b0bf-55a8ede0d0fc', '4', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '023fd6f8-86e4-4075-90df-2c77756a9274', '0', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '023fd6f8-86e4-4075-90df-2c77756a9274', '1', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '023fd6f8-86e4-4075-90df-2c77756a9274', '2', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '023fd6f8-86e4-4075-90df-2c77756a9274', '3', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '023fd6f8-86e4-4075-90df-2c77756a9274', '4', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '3e9fea34-2183-4d26-aef9-763926731274', '0', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '3e9fea34-2183-4d26-aef9-763926731274', '1', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '3e9fea34-2183-4d26-aef9-763926731274', '2', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '3e9fea34-2183-4d26-aef9-763926731274', '3', '08:00:00', '17:00:00'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '3e9fea34-2183-4d26-aef9-763926731274', '4', '08:00:00', '17:00:00'),
    ('85f8952f-bbbd-4aab-9763-0848b1f3010e', '0e4ea2df-c10a-444d-b267-cb30ca6632a8', '0', '08:00:00', '17:00:00'),
    ('85f8952f-bbbd-4aab-9763-0848b1f3010e', '0e4ea2df-c10a-444d-b267-cb30ca6632a8', '1', '08:00:00', '17:00:00'),
    ('85f8952f-bbbd-4aab-9763-0848b1f3010e', '0e4ea2df-c10a-444d-b267-cb30ca6632a8', '2', '08:00:00', '17:00:00'),
    ('85f8952f-bbbd-4aab-9763-0848b1f3010e', '0e4ea2df-c10a-444d-b267-cb30ca6632a8', '3', '08:00:00', '17:00:00'),
    ('85f8952f-bbbd-4aab-9763-0848b1f3010e', '0e4ea2df-c10a-444d-b267-cb30ca6632a8', '4', '08:00:00', '17:00:00');


--
-- Data for Name: worker_profiles; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.worker_profiles (13 rows)
--

INSERT INTO public.worker_profiles (id, company_id, member_id, rating, jobs_completed, employment_status) VALUES
    ('f20b9077-f882-4e40-b905-c6583935f9a4', '4c85707f-c04c-4c62-9346-be0fe715464c', 'd52930c5-f38e-4dad-a31d-9cd9374763c1', '4.7', '180', 'active'),
    ('6eb5b846-569d-4941-ba3d-85373f5febd3', '4c85707f-c04c-4c62-9346-be0fe715464c', 'd3604817-4f1c-4c8b-85ba-13c9f1272144', '4.7', '180', 'active'),
    ('92db34d2-b4b1-4601-999f-a3897cfbc2f4', '4c85707f-c04c-4c62-9346-be0fe715464c', 'eac8241e-36a0-4f1e-b794-ecd137631ec8', '4.7', '180', 'active'),
    ('4145c809-d3bc-43fb-b48c-1306ba83b773', '4c85707f-c04c-4c62-9346-be0fe715464c', 'a6c7a2ef-7e00-4b22-b95b-2b0a4406cb2e', '4.7', '180', 'active'),
    ('5954d953-5792-4933-a377-41ba9308fff0', '4c85707f-c04c-4c62-9346-be0fe715464c', '533f3193-77ad-40fd-a0a0-37b98112509e', '4.7', '180', 'on_leave'),
    ('389152b3-2ed7-4439-a344-82a42e366391', 'dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', 'abb1b14c-5eea-4c14-b759-8dbe6a04b6a1', '4.7', '180', 'active'),
    ('595767c8-b9be-498b-a7f8-f995019dfb45', 'dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', 'f276e0e6-bace-4cf4-9945-dbcd1d3c54dd', '4.7', '180', 'active'),
    ('b56860ad-2c02-4211-9f1b-4f2200d8d7b7', 'dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', 'fd9c86fd-cdb1-4568-96dc-03d0492c4eef', '4.7', '180', 'active'),
    ('809e604a-b243-4e39-ae09-512f2a9c5285', '3b08e91a-b804-4b8e-9040-b203846c1c59', 'b03de3f9-ee11-4c44-8897-9ef85e2bdee0', '4.7', '180', 'active'),
    ('f9222c5b-d057-49da-b0bf-55a8ede0d0fc', '3b08e91a-b804-4b8e-9040-b203846c1c59', '88fb6e32-b611-4d4d-9215-d18eb9335b08', '4.7', '180', 'active'),
    ('023fd6f8-86e4-4075-90df-2c77756a9274', '4c85707f-c04c-4c62-9346-be0fe715464c', '342d92e5-fa99-421e-a7d5-5de29dac8de1', '0.0', '0', 'active'),
    ('3e9fea34-2183-4d26-aef9-763926731274', '4c85707f-c04c-4c62-9346-be0fe715464c', '6c59c18f-8d07-44ec-9b76-08ff14ae9578', '0.0', '0', 'active'),
    ('0e4ea2df-c10a-444d-b267-cb30ca6632a8', '85f8952f-bbbd-4aab-9763-0848b1f3010e', '017f3007-ce3f-408f-b088-40801b595557', '0.0', '1', 'active');


--
-- Data for Name: worker_specialties; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.worker_specialties (21 rows)
--

INSERT INTO public.worker_specialties (company_id, worker_profile_id, name) VALUES
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'f20b9077-f882-4e40-b905-c6583935f9a4', 'Pipe repair'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'f20b9077-f882-4e40-b905-c6583935f9a4', 'Water heater'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '6eb5b846-569d-4941-ba3d-85373f5febd3', 'Drain cleaning'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '6eb5b846-569d-4941-ba3d-85373f5febd3', 'Sewer'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '92db34d2-b4b1-4601-999f-a3897cfbc2f4', 'Gas lines'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '92db34d2-b4b1-4601-999f-a3897cfbc2f4', 'Fixtures'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '4145c809-d3bc-43fb-b48c-1306ba83b773', 'Water heater'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '4145c809-d3bc-43fb-b48c-1306ba83b773', 'Bathroom remodel'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '5954d953-5792-4933-a377-41ba9308fff0', 'Emergency repair'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '5954d953-5792-4933-a377-41ba9308fff0', 'Pipe repair'),
    ('dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '389152b3-2ed7-4439-a344-82a42e366391', 'Panel upgrade'),
    ('dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '389152b3-2ed7-4439-a344-82a42e366391', 'Wiring'),
    ('dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '595767c8-b9be-498b-a7f8-f995019dfb45', 'EV charger'),
    ('dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', '595767c8-b9be-498b-a7f8-f995019dfb45', 'Smart home'),
    ('dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', 'b56860ad-2c02-4211-9f1b-4f2200d8d7b7', 'Commercial wiring'),
    ('dfa45156-e2ab-4fe3-8a0d-2e44ef5562bd', 'b56860ad-2c02-4211-9f1b-4f2200d8d7b7', 'Lighting'),
    ('3b08e91a-b804-4b8e-9040-b203846c1c59', '809e604a-b243-4e39-ae09-512f2a9c5285', 'AC install'),
    ('3b08e91a-b804-4b8e-9040-b203846c1c59', '809e604a-b243-4e39-ae09-512f2a9c5285', 'Duct work'),
    ('3b08e91a-b804-4b8e-9040-b203846c1c59', 'f9222c5b-d057-49da-b0bf-55a8ede0d0fc', 'Furnace repair'),
    ('3b08e91a-b804-4b8e-9040-b203846c1c59', 'f9222c5b-d057-49da-b0bf-55a8ede0d0fc', 'Thermostat'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '3e9fea34-2183-4d26-aef9-763926731274', 'Water Heater');


--
-- Data for Name: worker_time_off; Type: TABLE DATA; Schema: public; Owner: -
--

--
-- Data for table public.worker_time_off (3 rows)
--

INSERT INTO public.worker_time_off (company_id, worker_profile_id, off_date) VALUES
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'f20b9077-f882-4e40-b905-c6583935f9a4', '2026-04-10'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', 'f20b9077-f882-4e40-b905-c6583935f9a4', '2026-04-11'),
    ('4c85707f-c04c-4c62-9346-be0fe715464c', '92db34d2-b4b1-4601-999f-a3897cfbc2f4', '2026-04-15');


--
-- Name: addresses addresses_company_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT addresses_company_id_id_key UNIQUE (company_id, id);


--
-- Name: addresses addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT addresses_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: billing_events billing_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_events
    ADD CONSTRAINT billing_events_pkey PRIMARY KEY (id);


--
-- Name: billing_events billing_events_stripe_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_events
    ADD CONSTRAINT billing_events_stripe_event_id_key UNIQUE (stripe_event_id);


--
-- Name: billing_invoices billing_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoices
    ADD CONSTRAINT billing_invoices_pkey PRIMARY KEY (id);


--
-- Name: billing_invoices billing_invoices_stripe_invoice_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoices
    ADD CONSTRAINT billing_invoices_stripe_invoice_id_key UNIQUE (stripe_invoice_id);


--
-- Name: chat_message_reads chat_message_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_message_reads
    ADD CONSTRAINT chat_message_reads_pkey PRIMARY KEY (message_id, user_id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: chat_thread_participants chat_thread_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_thread_participants
    ADD CONSTRAINT chat_thread_participants_pkey PRIMARY KEY (thread_id, user_id);


--
-- Name: chat_threads chat_threads_company_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_threads
    ADD CONSTRAINT chat_threads_company_id_id_key UNIQUE (company_id, id);


--
-- Name: chat_threads chat_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_threads
    ADD CONSTRAINT chat_threads_pkey PRIMARY KEY (id);


--
-- Name: communications communications_company_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_company_id_id_key UNIQUE (company_id, id);


--
-- Name: communications communications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: company_member_permissions company_member_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_member_permissions
    ADD CONSTRAINT company_member_permissions_pkey PRIMARY KEY (member_id, permission);


--
-- Name: company_members company_members_company_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_members
    ADD CONSTRAINT company_members_company_id_id_key UNIQUE (company_id, id);


--
-- Name: company_members company_members_company_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_members
    ADD CONSTRAINT company_members_company_id_user_id_key UNIQUE (company_id, user_id);


--
-- Name: company_members company_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_members
    ADD CONSTRAINT company_members_pkey PRIMARY KEY (id);


--
-- Name: company_settings company_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_pkey PRIMARY KEY (company_id);


--
-- Name: customer_contacts customer_contacts_company_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_contacts
    ADD CONSTRAINT customer_contacts_company_id_id_key UNIQUE (company_id, id);


--
-- Name: customer_contacts customer_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_contacts
    ADD CONSTRAINT customer_contacts_pkey PRIMARY KEY (id);


--
-- Name: customer_notes customer_notes_company_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_notes
    ADD CONSTRAINT customer_notes_company_id_id_key UNIQUE (company_id, id);


--
-- Name: customer_notes customer_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_notes
    ADD CONSTRAINT customer_notes_pkey PRIMARY KEY (id);


--
-- Name: customer_tags customer_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_tags
    ADD CONSTRAINT customer_tags_pkey PRIMARY KEY (customer_id, tag_id);


--
-- Name: customers customers_company_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_company_id_id_key UNIQUE (company_id, id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: document_counters document_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_counters
    ADD CONSTRAINT document_counters_pkey PRIMARY KEY (company_id, kind, year);


--
-- Name: documents documents_company_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_company_id_id_key UNIQUE (company_id, id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: email_templates email_templates_company_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_company_id_id_key UNIQUE (company_id, id);


--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


--
-- Name: email_verification_tokens email_verification_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_pkey PRIMARY KEY (id);


--
-- Name: estimate_assignees estimate_assignees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_assignees
    ADD CONSTRAINT estimate_assignees_pkey PRIMARY KEY (estimate_id, member_id);


--
-- Name: estimate_follow_up_tasks estimate_follow_up_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_follow_up_tasks
    ADD CONSTRAINT estimate_follow_up_tasks_pkey PRIMARY KEY (id);


--
-- Name: estimate_line_items estimate_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_line_items
    ADD CONSTRAINT estimate_line_items_pkey PRIMARY KEY (id);


--
-- Name: estimates estimates_company_id_estimate_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_company_id_estimate_number_key UNIQUE (company_id, estimate_number);


--
-- Name: estimates estimates_company_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_company_id_id_key UNIQUE (company_id, id);


--
-- Name: estimates estimates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_pkey PRIMARY KEY (id);


--
-- Name: files files_company_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_company_id_id_key UNIQUE (company_id, id);


--
-- Name: files files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);


--
-- Name: follow_ups follow_ups_company_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_company_id_id_key UNIQUE (company_id, id);


--
-- Name: follow_ups follow_ups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_pkey PRIMARY KEY (id);


--
-- Name: inventory_items inventory_items_company_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_company_id_id_key UNIQUE (company_id, id);


--
-- Name: inventory_items inventory_items_company_id_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_company_id_sku_key UNIQUE (company_id, sku);


--
-- Name: inventory_items inventory_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_pkey PRIMARY KEY (id);


--
-- Name: inventory_movements inventory_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_pkey PRIMARY KEY (id);


--
-- Name: invitations invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);


--
-- Name: invoice_line_items invoice_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_company_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_company_id_id_key UNIQUE (company_id, id);


--
-- Name: invoices invoices_company_id_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_company_id_invoice_number_key UNIQUE (company_id, invoice_number);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: job_assignees job_assignees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_assignees
    ADD CONSTRAINT job_assignees_pkey PRIMARY KEY (job_id, member_id);


--
-- Name: job_images job_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_images
    ADD CONSTRAINT job_images_pkey PRIMARY KEY (id);


--
-- Name: job_line_items job_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_line_items
    ADD CONSTRAINT job_line_items_pkey PRIMARY KEY (id);


--
-- Name: job_materials job_materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_materials
    ADD CONSTRAINT job_materials_pkey PRIMARY KEY (id);


--
-- Name: job_notes job_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_notes
    ADD CONSTRAINT job_notes_pkey PRIMARY KEY (id);


--
-- Name: job_tasks job_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_tasks
    ADD CONSTRAINT job_tasks_pkey PRIMARY KEY (id);


--
-- Name: jobs jobs_company_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_company_id_id_key UNIQUE (company_id, id);


--
-- Name: jobs jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: platform_email_templates platform_email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_email_templates
    ADD CONSTRAINT platform_email_templates_pkey PRIMARY KEY (type);


--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (id);


--
-- Name: record_favorites record_favorites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.record_favorites
    ADD CONSTRAINT record_favorites_pkey PRIMARY KEY (user_id, entity_type, entity_id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: saved_views saved_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_views
    ADD CONSTRAINT saved_views_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (id);


--
-- Name: service_agreements service_agreements_company_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_agreements
    ADD CONSTRAINT service_agreements_company_id_id_key UNIQUE (company_id, id);


--
-- Name: service_agreements service_agreements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_agreements
    ADD CONSTRAINT service_agreements_pkey PRIMARY KEY (id);


--
-- Name: subscription_plans subscription_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_pkey PRIMARY KEY (id);


--
-- Name: tags tags_company_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_company_id_id_key UNIQUE (company_id, id);


--
-- Name: tags tags_company_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_company_id_name_key UNIQUE (company_id, name);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_email_lower_key; Type: INDEX; Schema: public
-- Replaces the case-insensitive uniqueness that the citext type
-- used to provide on users.email.
--

DROP INDEX IF EXISTS public.users_email_lower_key;
CREATE UNIQUE INDEX users_email_lower_key ON public.users USING btree (lower(email));


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: worker_availability worker_availability_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_availability
    ADD CONSTRAINT worker_availability_pkey PRIMARY KEY (worker_profile_id, weekday);


--
-- Name: worker_profiles worker_profiles_company_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_profiles
    ADD CONSTRAINT worker_profiles_company_id_id_key UNIQUE (company_id, id);


--
-- Name: worker_profiles worker_profiles_member_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_profiles
    ADD CONSTRAINT worker_profiles_member_id_key UNIQUE (member_id);


--
-- Name: worker_profiles worker_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_profiles
    ADD CONSTRAINT worker_profiles_pkey PRIMARY KEY (id);


--
-- Name: worker_specialties worker_specialties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_specialties
    ADD CONSTRAINT worker_specialties_pkey PRIMARY KEY (worker_profile_id, name);


--
-- Name: worker_time_off worker_time_off_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_time_off
    ADD CONSTRAINT worker_time_off_pkey PRIMARY KEY (worker_profile_id, off_date);


--
-- Name: addresses_customer_idx; Type: INDEX; Schema: public; Owner: -
--

DROP INDEX IF EXISTS public.addresses_customer_idx;
DROP INDEX IF EXISTS public.audit_logs_company_idx;
DROP INDEX IF EXISTS public.billing_invoices_company_idx;
DROP INDEX IF EXISTS public.chat_messages_thread_idx;
DROP INDEX IF EXISTS public.communications_company_idx;
DROP INDEX IF EXISTS public.communications_twilio_sid_idx;
DROP INDEX IF EXISTS public.company_member_permissions_company_idx;
DROP INDEX IF EXISTS public.company_members_user_idx;
DROP INDEX IF EXISTS public.customer_contacts_customer_idx;
DROP INDEX IF EXISTS public.customer_notes_customer_idx;
DROP INDEX IF EXISTS public.customers_archived_idx;
DROP INDEX IF EXISTS public.customers_company_idx;
DROP INDEX IF EXISTS public.customers_owner_idx;
DROP INDEX IF EXISTS public.follow_ups_company_idx;
DROP INDEX IF EXISTS public.follow_ups_customer_idx;
DROP INDEX IF EXISTS public.invitations_company_idx;
DROP INDEX IF EXISTS public.invitations_token_idx;
DROP INDEX IF EXISTS public.jobs_archived_idx;
DROP INDEX IF EXISTS public.jobs_company_idx;
DROP INDEX IF EXISTS public.jobs_owner_idx;
DROP INDEX IF EXISTS public.notifications_user_idx;
DROP INDEX IF EXISTS public.record_favorites_company_idx;
DROP INDEX IF EXISTS public.record_favorites_entity_idx;
DROP INDEX IF EXISTS public.refresh_tokens_user_idx;
DROP INDEX IF EXISTS public.saved_views_user_idx;

CREATE INDEX addresses_customer_idx ON public.addresses USING btree (company_id, customer_id);


--
-- Name: audit_logs_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_company_idx ON public.audit_logs USING btree (company_id, created_at DESC);


--
-- Name: billing_invoices_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_invoices_company_idx ON public.billing_invoices USING btree (company_id, created_at DESC);


--
-- Name: chat_messages_thread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messages_thread_idx ON public.chat_messages USING btree (thread_id, created_at);


--
-- Name: communications_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX communications_company_idx ON public.communications USING btree (company_id, created_at DESC);


--
-- Name: communications_twilio_sid_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX communications_twilio_sid_idx ON public.communications USING btree (twilio_sid);


--
-- Name: company_member_permissions_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_member_permissions_company_idx ON public.company_member_permissions USING btree (company_id);


--
-- Name: company_members_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_members_user_idx ON public.company_members USING btree (user_id);


--
-- Name: customer_contacts_customer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_contacts_customer_idx ON public.customer_contacts USING btree (company_id, customer_id);


--
-- Name: customer_notes_customer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customer_notes_customer_idx ON public.customer_notes USING btree (company_id, customer_id, created_at DESC);


--
-- Name: customers_archived_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customers_archived_idx ON public.customers USING btree (company_id, archived_at);


--
-- Name: customers_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customers_company_idx ON public.customers USING btree (company_id);


--
-- Name: customers_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX customers_owner_idx ON public.customers USING btree (company_id, owner_user_id);


--
-- Name: follow_ups_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX follow_ups_company_idx ON public.follow_ups USING btree (company_id, done, due_date);


--
-- Name: follow_ups_customer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX follow_ups_customer_idx ON public.follow_ups USING btree (company_id, customer_id);


--
-- Name: invitations_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invitations_company_idx ON public.invitations USING btree (company_id, created_at DESC);


--
-- Name: invitations_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invitations_token_idx ON public.invitations USING btree (token_hash);


--
-- Name: jobs_archived_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jobs_archived_idx ON public.jobs USING btree (company_id, archived_at);


--
-- Name: jobs_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jobs_company_idx ON public.jobs USING btree (company_id, scheduled_date);


--
-- Name: jobs_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX jobs_owner_idx ON public.jobs USING btree (company_id, owner_user_id);


--
-- Name: notifications_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_idx ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: record_favorites_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX record_favorites_company_idx ON public.record_favorites USING btree (company_id, user_id);


--
-- Name: record_favorites_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX record_favorites_entity_idx ON public.record_favorites USING btree (company_id, entity_type, entity_id);


--
-- Name: refresh_tokens_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX refresh_tokens_user_idx ON public.refresh_tokens USING btree (user_id);


--
-- Name: saved_views_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX saved_views_user_idx ON public.saved_views USING btree (company_id, user_id, page);


--
-- Name: companies companies_updated; Type: TRIGGER; Schema: public; Owner: -
--

DROP TRIGGER IF EXISTS companies_updated ON public.companies;
CREATE TRIGGER companies_updated BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();


--
-- Name: company_settings company_settings_updated; Type: TRIGGER; Schema: public; Owner: -
--

DROP TRIGGER IF EXISTS company_settings_updated ON public.company_settings;
CREATE TRIGGER company_settings_updated BEFORE UPDATE ON public.company_settings FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();


--
-- Name: customers customers_updated; Type: TRIGGER; Schema: public; Owner: -
--

DROP TRIGGER IF EXISTS customers_updated ON public.customers;
CREATE TRIGGER customers_updated BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();


--
-- Name: estimates estimates_updated; Type: TRIGGER; Schema: public; Owner: -
--

DROP TRIGGER IF EXISTS estimates_updated ON public.estimates;
CREATE TRIGGER estimates_updated BEFORE UPDATE ON public.estimates FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();


--
-- Name: jobs jobs_updated; Type: TRIGGER; Schema: public; Owner: -
--

DROP TRIGGER IF EXISTS jobs_updated ON public.jobs;
CREATE TRIGGER jobs_updated BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();


--
-- Name: subscription_plans plans_updated; Type: TRIGGER; Schema: public; Owner: -
--

DROP TRIGGER IF EXISTS plans_updated ON public.subscription_plans;
CREATE TRIGGER plans_updated BEFORE UPDATE ON public.subscription_plans FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();


--
-- Name: users users_updated; Type: TRIGGER; Schema: public; Owner: -
--

DROP TRIGGER IF EXISTS users_updated ON public.users;
CREATE TRIGGER users_updated BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();


--
-- Name: addresses addresses_company_id_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT addresses_company_id_customer_id_fkey FOREIGN KEY (company_id, customer_id) REFERENCES public.customers(company_id, id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id);


--
-- Name: audit_logs audit_logs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: billing_events billing_events_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_events
    ADD CONSTRAINT billing_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: billing_invoices billing_invoices_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoices
    ADD CONSTRAINT billing_invoices_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: chat_message_reads chat_message_reads_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_message_reads
    ADD CONSTRAINT chat_message_reads_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON DELETE CASCADE;


--
-- Name: chat_message_reads chat_message_reads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_message_reads
    ADD CONSTRAINT chat_message_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: chat_messages chat_messages_company_id_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_company_id_thread_id_fkey FOREIGN KEY (company_id, thread_id) REFERENCES public.chat_threads(company_id, id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id);


--
-- Name: chat_thread_participants chat_thread_participants_company_id_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_thread_participants
    ADD CONSTRAINT chat_thread_participants_company_id_thread_id_fkey FOREIGN KEY (company_id, thread_id) REFERENCES public.chat_threads(company_id, id) ON DELETE CASCADE;


--
-- Name: chat_thread_participants chat_thread_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_thread_participants
    ADD CONSTRAINT chat_thread_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: chat_threads chat_threads_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_threads
    ADD CONSTRAINT chat_threads_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: communications communications_company_id_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_company_id_customer_id_fkey FOREIGN KEY (company_id, customer_id) REFERENCES public.customers(company_id, id);


--
-- Name: communications communications_company_id_estimate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_company_id_estimate_id_fkey FOREIGN KEY (company_id, estimate_id) REFERENCES public.estimates(company_id, id);


--
-- Name: communications communications_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: communications communications_company_id_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_company_id_job_id_fkey FOREIGN KEY (company_id, job_id) REFERENCES public.jobs(company_id, id);


--
-- Name: communications communications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communications
    ADD CONSTRAINT communications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: companies companies_logo_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_logo_file_id_fkey FOREIGN KEY (logo_file_id) REFERENCES public.files(id);


--
-- Name: companies companies_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id);


--
-- Name: company_member_permissions company_member_permissions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_member_permissions
    ADD CONSTRAINT company_member_permissions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_member_permissions company_member_permissions_company_id_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_member_permissions
    ADD CONSTRAINT company_member_permissions_company_id_member_id_fkey FOREIGN KEY (company_id, member_id) REFERENCES public.company_members(company_id, id) ON DELETE CASCADE;


--
-- Name: company_member_permissions company_member_permissions_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_member_permissions
    ADD CONSTRAINT company_member_permissions_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.company_members(id) ON DELETE CASCADE;


--
-- Name: company_members company_members_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_members
    ADD CONSTRAINT company_members_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: company_members company_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_members
    ADD CONSTRAINT company_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: company_settings company_settings_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_settings company_settings_logo_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_logo_file_id_fkey FOREIGN KEY (logo_file_id) REFERENCES public.files(id);


--
-- Name: customer_contacts customer_contacts_company_id_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_contacts
    ADD CONSTRAINT customer_contacts_company_id_customer_id_fkey FOREIGN KEY (company_id, customer_id) REFERENCES public.customers(company_id, id) ON DELETE CASCADE;


--
-- Name: customer_notes customer_notes_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_notes
    ADD CONSTRAINT customer_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id);


--
-- Name: customer_notes customer_notes_company_id_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_notes
    ADD CONSTRAINT customer_notes_company_id_customer_id_fkey FOREIGN KEY (company_id, customer_id) REFERENCES public.customers(company_id, id) ON DELETE CASCADE;


--
-- Name: customer_tags customer_tags_company_id_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_tags
    ADD CONSTRAINT customer_tags_company_id_customer_id_fkey FOREIGN KEY (company_id, customer_id) REFERENCES public.customers(company_id, id) ON DELETE CASCADE;


--
-- Name: customer_tags customer_tags_company_id_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_tags
    ADD CONSTRAINT customer_tags_company_id_tag_id_fkey FOREIGN KEY (company_id, tag_id) REFERENCES public.tags(company_id, id) ON DELETE CASCADE;


--
-- Name: customers customers_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.users(id);


--
-- Name: customers customers_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: customers customers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: customers customers_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id);


--
-- Name: customers customers_parent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_parent_fk FOREIGN KEY (company_id, parent_customer_id) REFERENCES public.customers(company_id, id);


--
-- Name: customers customers_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: document_counters document_counters_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_counters
    ADD CONSTRAINT document_counters_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: documents documents_company_id_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_company_id_file_id_fkey FOREIGN KEY (company_id, file_id) REFERENCES public.files(company_id, id);


--
-- Name: documents documents_company_id_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_company_id_job_id_fkey FOREIGN KEY (company_id, job_id) REFERENCES public.jobs(company_id, id);


--
-- Name: documents documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: email_templates email_templates_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: email_verification_tokens email_verification_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: estimate_assignees estimate_assignees_company_id_estimate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_assignees
    ADD CONSTRAINT estimate_assignees_company_id_estimate_id_fkey FOREIGN KEY (company_id, estimate_id) REFERENCES public.estimates(company_id, id) ON DELETE CASCADE;


--
-- Name: estimate_assignees estimate_assignees_company_id_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_assignees
    ADD CONSTRAINT estimate_assignees_company_id_member_id_fkey FOREIGN KEY (company_id, member_id) REFERENCES public.company_members(company_id, id);


--
-- Name: estimate_follow_up_tasks estimate_follow_up_tasks_company_id_estimate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_follow_up_tasks
    ADD CONSTRAINT estimate_follow_up_tasks_company_id_estimate_id_fkey FOREIGN KEY (company_id, estimate_id) REFERENCES public.estimates(company_id, id) ON DELETE CASCADE;


--
-- Name: estimate_line_items estimate_line_items_company_id_estimate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimate_line_items
    ADD CONSTRAINT estimate_line_items_company_id_estimate_id_fkey FOREIGN KEY (company_id, estimate_id) REFERENCES public.estimates(company_id, id) ON DELETE CASCADE;


--
-- Name: estimates estimates_company_id_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_company_id_address_id_fkey FOREIGN KEY (company_id, address_id) REFERENCES public.addresses(company_id, id);


--
-- Name: estimates estimates_company_id_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_company_id_customer_id_fkey FOREIGN KEY (company_id, customer_id) REFERENCES public.customers(company_id, id);


--
-- Name: estimates estimates_converted_job_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_converted_job_fk FOREIGN KEY (company_id, converted_job_id) REFERENCES public.jobs(company_id, id);


--
-- Name: estimates estimates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: estimates estimates_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estimates
    ADD CONSTRAINT estimates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: files files_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: files files_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: follow_ups follow_ups_assigned_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES public.users(id);


--
-- Name: follow_ups follow_ups_company_id_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_company_id_customer_id_fkey FOREIGN KEY (company_id, customer_id) REFERENCES public.customers(company_id, id) ON DELETE CASCADE;


--
-- Name: inventory_items inventory_items_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: inventory_movements inventory_movements_company_id_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_company_id_item_id_fkey FOREIGN KEY (company_id, item_id) REFERENCES public.inventory_items(company_id, id);


--
-- Name: inventory_movements inventory_movements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: invitations invitations_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: invitations invitations_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id);


--
-- Name: invoice_line_items invoice_line_items_company_id_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_company_id_invoice_id_fkey FOREIGN KEY (company_id, invoice_id) REFERENCES public.invoices(company_id, id) ON DELETE CASCADE;


--
-- Name: invoices invoices_company_id_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_company_id_customer_id_fkey FOREIGN KEY (company_id, customer_id) REFERENCES public.customers(company_id, id);


--
-- Name: invoices invoices_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: invoices invoices_job_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_job_fk FOREIGN KEY (company_id, job_id) REFERENCES public.jobs(company_id, id);


--
-- Name: invoices invoices_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: job_assignees job_assignees_company_id_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_assignees
    ADD CONSTRAINT job_assignees_company_id_job_id_fkey FOREIGN KEY (company_id, job_id) REFERENCES public.jobs(company_id, id) ON DELETE CASCADE;


--
-- Name: job_assignees job_assignees_company_id_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_assignees
    ADD CONSTRAINT job_assignees_company_id_member_id_fkey FOREIGN KEY (company_id, member_id) REFERENCES public.company_members(company_id, id);


--
-- Name: job_images job_images_company_id_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_images
    ADD CONSTRAINT job_images_company_id_file_id_fkey FOREIGN KEY (company_id, file_id) REFERENCES public.files(company_id, id);


--
-- Name: job_images job_images_company_id_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_images
    ADD CONSTRAINT job_images_company_id_job_id_fkey FOREIGN KEY (company_id, job_id) REFERENCES public.jobs(company_id, id) ON DELETE CASCADE;


--
-- Name: job_line_items job_line_items_company_id_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_line_items
    ADD CONSTRAINT job_line_items_company_id_job_id_fkey FOREIGN KEY (company_id, job_id) REFERENCES public.jobs(company_id, id) ON DELETE CASCADE;


--
-- Name: job_materials job_materials_company_id_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_materials
    ADD CONSTRAINT job_materials_company_id_job_id_fkey FOREIGN KEY (company_id, job_id) REFERENCES public.jobs(company_id, id) ON DELETE CASCADE;


--
-- Name: job_notes job_notes_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_notes
    ADD CONSTRAINT job_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id);


--
-- Name: job_notes job_notes_company_id_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_notes
    ADD CONSTRAINT job_notes_company_id_job_id_fkey FOREIGN KEY (company_id, job_id) REFERENCES public.jobs(company_id, id) ON DELETE CASCADE;


--
-- Name: job_tasks job_tasks_company_id_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_tasks
    ADD CONSTRAINT job_tasks_company_id_job_id_fkey FOREIGN KEY (company_id, job_id) REFERENCES public.jobs(company_id, id) ON DELETE CASCADE;


--
-- Name: jobs jobs_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.users(id);


--
-- Name: jobs jobs_company_id_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_company_id_address_id_fkey FOREIGN KEY (company_id, address_id) REFERENCES public.addresses(company_id, id);


--
-- Name: jobs jobs_company_id_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_company_id_customer_id_fkey FOREIGN KEY (company_id, customer_id) REFERENCES public.customers(company_id, id);


--
-- Name: jobs jobs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: jobs jobs_estimate_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_estimate_fk FOREIGN KEY (company_id, estimate_id) REFERENCES public.estimates(company_id, id);


--
-- Name: jobs jobs_invoice_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_invoice_fk FOREIGN KEY (company_id, invoice_id) REFERENCES public.invoices(company_id, id);


--
-- Name: jobs jobs_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id);


--
-- Name: jobs jobs_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: notifications notifications_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: record_favorites record_favorites_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.record_favorites
    ADD CONSTRAINT record_favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: saved_views saved_views_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_views
    ADD CONSTRAINT saved_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: service_agreements service_agreements_company_id_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_agreements
    ADD CONSTRAINT service_agreements_company_id_customer_id_fkey FOREIGN KEY (company_id, customer_id) REFERENCES public.customers(company_id, id);


--
-- Name: service_agreements service_agreements_company_id_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_agreements
    ADD CONSTRAINT service_agreements_company_id_job_id_fkey FOREIGN KEY (company_id, job_id) REFERENCES public.jobs(company_id, id);


--
-- Name: tags tags_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: worker_availability worker_availability_company_id_worker_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_availability
    ADD CONSTRAINT worker_availability_company_id_worker_profile_id_fkey FOREIGN KEY (company_id, worker_profile_id) REFERENCES public.worker_profiles(company_id, id) ON DELETE CASCADE;


--
-- Name: worker_profiles worker_profiles_company_id_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_profiles
    ADD CONSTRAINT worker_profiles_company_id_member_id_fkey FOREIGN KEY (company_id, member_id) REFERENCES public.company_members(company_id, id) ON DELETE CASCADE;


--
-- Name: worker_specialties worker_specialties_company_id_worker_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_specialties
    ADD CONSTRAINT worker_specialties_company_id_worker_profile_id_fkey FOREIGN KEY (company_id, worker_profile_id) REFERENCES public.worker_profiles(company_id, id) ON DELETE CASCADE;


--
-- Name: worker_time_off worker_time_off_company_id_worker_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_time_off
    ADD CONSTRAINT worker_time_off_company_id_worker_profile_id_fkey FOREIGN KEY (company_id, worker_profile_id) REFERENCES public.worker_profiles(company_id, id) ON DELETE CASCADE;


--
-- Name: addresses; Type: ROW SECURITY; Schema: public; Owner: -
--

DROP POLICY IF EXISTS addresses_isolation ON public.addresses;
DROP POLICY IF EXISTS billing_invoices_isolation ON public.billing_invoices;
DROP POLICY IF EXISTS chat_messages_isolation ON public.chat_messages;
DROP POLICY IF EXISTS chat_thread_participants_isolation ON public.chat_thread_participants;
DROP POLICY IF EXISTS chat_threads_isolation ON public.chat_threads;
DROP POLICY IF EXISTS communications_isolation ON public.communications;
DROP POLICY IF EXISTS company_member_permissions_isolation ON public.company_member_permissions;
DROP POLICY IF EXISTS company_settings_isolation ON public.company_settings;
DROP POLICY IF EXISTS customer_contacts_isolation ON public.customer_contacts;
DROP POLICY IF EXISTS customer_notes_isolation ON public.customer_notes;
DROP POLICY IF EXISTS customer_tags_isolation ON public.customer_tags;
DROP POLICY IF EXISTS customers_isolation ON public.customers;
DROP POLICY IF EXISTS document_counters_isolation ON public.document_counters;
DROP POLICY IF EXISTS documents_isolation ON public.documents;
DROP POLICY IF EXISTS email_templates_isolation ON public.email_templates;
DROP POLICY IF EXISTS estimate_assignees_isolation ON public.estimate_assignees;
DROP POLICY IF EXISTS estimate_follow_up_tasks_isolation ON public.estimate_follow_up_tasks;
DROP POLICY IF EXISTS estimate_line_items_isolation ON public.estimate_line_items;
DROP POLICY IF EXISTS estimates_isolation ON public.estimates;
DROP POLICY IF EXISTS files_isolation ON public.files;
DROP POLICY IF EXISTS follow_ups_isolation ON public.follow_ups;
DROP POLICY IF EXISTS inventory_items_isolation ON public.inventory_items;
DROP POLICY IF EXISTS inventory_movements_isolation ON public.inventory_movements;
DROP POLICY IF EXISTS invitations_isolation ON public.invitations;
DROP POLICY IF EXISTS invoice_line_items_isolation ON public.invoice_line_items;
DROP POLICY IF EXISTS invoices_isolation ON public.invoices;
DROP POLICY IF EXISTS job_assignees_isolation ON public.job_assignees;
DROP POLICY IF EXISTS job_images_isolation ON public.job_images;
DROP POLICY IF EXISTS job_line_items_isolation ON public.job_line_items;
DROP POLICY IF EXISTS job_materials_isolation ON public.job_materials;
DROP POLICY IF EXISTS job_notes_isolation ON public.job_notes;
DROP POLICY IF EXISTS job_tasks_isolation ON public.job_tasks;
DROP POLICY IF EXISTS jobs_isolation ON public.jobs;
DROP POLICY IF EXISTS notifications_isolation ON public.notifications;
DROP POLICY IF EXISTS record_favorites_isolation ON public.record_favorites;
DROP POLICY IF EXISTS saved_views_isolation ON public.saved_views;
DROP POLICY IF EXISTS service_agreements_isolation ON public.service_agreements;
DROP POLICY IF EXISTS tags_isolation ON public.tags;
DROP POLICY IF EXISTS worker_availability_isolation ON public.worker_availability;
DROP POLICY IF EXISTS worker_profiles_isolation ON public.worker_profiles;
DROP POLICY IF EXISTS worker_specialties_isolation ON public.worker_specialties;
DROP POLICY IF EXISTS worker_time_off_isolation ON public.worker_time_off;

ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

--
-- Name: addresses addresses_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY addresses_isolation ON public.addresses USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: billing_invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_invoices billing_invoices_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY billing_invoices_isolation ON public.billing_invoices USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK (((company_id = public.app_company_id()) OR public.app_is_super_admin()));


--
-- Name: chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_messages chat_messages_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chat_messages_isolation ON public.chat_messages USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: chat_thread_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_thread_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_thread_participants chat_thread_participants_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chat_thread_participants_isolation ON public.chat_thread_participants USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: chat_threads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_threads chat_threads_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chat_threads_isolation ON public.chat_threads USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: communications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;

--
-- Name: communications communications_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY communications_isolation ON public.communications USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: company_member_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_member_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: company_member_permissions company_member_permissions_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_member_permissions_isolation ON public.company_member_permissions USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK (((company_id = public.app_company_id()) OR public.app_is_super_admin()));


--
-- Name: company_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: company_settings company_settings_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_settings_isolation ON public.company_settings USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK (((company_id = public.app_company_id()) OR public.app_is_super_admin()));


--
-- Name: customer_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_contacts customer_contacts_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_contacts_isolation ON public.customer_contacts USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: customer_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_notes customer_notes_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_notes_isolation ON public.customer_notes USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: customer_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_tags customer_tags_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_tags_isolation ON public.customer_tags USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: customers customers_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_isolation ON public.customers USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: document_counters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_counters ENABLE ROW LEVEL SECURITY;

--
-- Name: document_counters document_counters_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY document_counters_isolation ON public.document_counters USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

--
-- Name: documents documents_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_isolation ON public.documents USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: email_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: email_templates email_templates_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_templates_isolation ON public.email_templates USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: estimate_assignees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estimate_assignees ENABLE ROW LEVEL SECURITY;

--
-- Name: estimate_assignees estimate_assignees_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_assignees_isolation ON public.estimate_assignees USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: estimate_follow_up_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estimate_follow_up_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: estimate_follow_up_tasks estimate_follow_up_tasks_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_follow_up_tasks_isolation ON public.estimate_follow_up_tasks USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: estimate_line_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estimate_line_items ENABLE ROW LEVEL SECURITY;

--
-- Name: estimate_line_items estimate_line_items_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimate_line_items_isolation ON public.estimate_line_items USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: estimates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;

--
-- Name: estimates estimates_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY estimates_isolation ON public.estimates USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

--
-- Name: files files_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY files_isolation ON public.files USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: follow_ups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

--
-- Name: follow_ups follow_ups_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY follow_ups_isolation ON public.follow_ups USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: inventory_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_items inventory_items_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_items_isolation ON public.inventory_items USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: inventory_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_movements inventory_movements_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY inventory_movements_isolation ON public.inventory_movements USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: invitations invitations_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invitations_isolation ON public.invitations USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK (((company_id = public.app_company_id()) OR public.app_is_super_admin()));


--
-- Name: invoice_line_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_line_items invoice_line_items_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoice_line_items_isolation ON public.invoice_line_items USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices invoices_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_isolation ON public.invoices USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: job_assignees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.job_assignees ENABLE ROW LEVEL SECURITY;

--
-- Name: job_assignees job_assignees_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY job_assignees_isolation ON public.job_assignees USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: job_images; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.job_images ENABLE ROW LEVEL SECURITY;

--
-- Name: job_images job_images_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY job_images_isolation ON public.job_images USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: job_line_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.job_line_items ENABLE ROW LEVEL SECURITY;

--
-- Name: job_line_items job_line_items_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY job_line_items_isolation ON public.job_line_items USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: job_materials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.job_materials ENABLE ROW LEVEL SECURITY;

--
-- Name: job_materials job_materials_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY job_materials_isolation ON public.job_materials USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: job_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.job_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: job_notes job_notes_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY job_notes_isolation ON public.job_notes USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: job_tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.job_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: job_tasks job_tasks_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY job_tasks_isolation ON public.job_tasks USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: jobs jobs_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY jobs_isolation ON public.jobs USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_isolation ON public.notifications USING ((((company_id IS NOT NULL) AND (company_id = public.app_company_id())) OR ((company_id IS NULL) AND ((user_id)::text = current_setting('app.current_user_id'::text, true))) OR public.app_is_super_admin())) WITH CHECK ((((company_id IS NOT NULL) AND (company_id = public.app_company_id())) OR ((company_id IS NULL) AND public.app_is_super_admin())));


--
-- Name: record_favorites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.record_favorites ENABLE ROW LEVEL SECURITY;

--
-- Name: record_favorites record_favorites_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY record_favorites_isolation ON public.record_favorites USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: saved_views; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.saved_views ENABLE ROW LEVEL SECURITY;

--
-- Name: saved_views saved_views_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY saved_views_isolation ON public.saved_views USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: service_agreements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_agreements ENABLE ROW LEVEL SECURITY;

--
-- Name: service_agreements service_agreements_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_agreements_isolation ON public.service_agreements USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

--
-- Name: tags tags_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tags_isolation ON public.tags USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: worker_availability; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.worker_availability ENABLE ROW LEVEL SECURITY;

--
-- Name: worker_availability worker_availability_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY worker_availability_isolation ON public.worker_availability USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: worker_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.worker_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: worker_profiles worker_profiles_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY worker_profiles_isolation ON public.worker_profiles USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: worker_specialties; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.worker_specialties ENABLE ROW LEVEL SECURITY;

--
-- Name: worker_specialties worker_specialties_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY worker_specialties_isolation ON public.worker_specialties USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Name: worker_time_off; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.worker_time_off ENABLE ROW LEVEL SECURITY;

--
-- Name: worker_time_off worker_time_off_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY worker_time_off_isolation ON public.worker_time_off USING (((company_id = public.app_company_id()) OR public.app_is_super_admin())) WITH CHECK ((company_id = public.app_company_id()));


--
-- Case-insensitive lookup indexes for the former citext columns.
-- The citext type made "email = 'X'" case-insensitive automatically; with
-- plain text the application should compare with lower(email) = lower($1),
-- and these indexes keep those lookups fast.
--

DROP INDEX IF EXISTS public.companies_email_lower_idx;
DROP INDEX IF EXISTS public.customer_contacts_email_lower_idx;
DROP INDEX IF EXISTS public.invitations_email_lower_idx;
CREATE INDEX companies_email_lower_idx ON public.companies USING btree (lower(email));
CREATE INDEX customer_contacts_email_lower_idx ON public.customer_contacts USING btree (lower(email));
CREATE INDEX invitations_email_lower_idx ON public.invitations USING btree (lower(email));

--
-- PostgreSQL database dump complete
--
