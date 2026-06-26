# FreshFold — Commercial B2B Laundry Management System
## Master Software Requirements Specification (SRS) & Product Requirements Document (PRD)

**Document type:** Master PRD / SRS / FRS / NFR / Database / API / UI / Roadmap
**Prepared for:** Implementation by Claude Code
**Target deployment:** Google Cloud Platform (Compute Engine VPS) + Aerolink Claude API
**Version:** 1.0
**Status:** Approved for Build
**Audience:** Engineering (Claude Code), Founders, Operations, QA

---

## 0. Document Control

| Field | Value |
|---|---|
| Product name (working) | FreshFold LMS |
| Document owner | Product Management |
| System architect | Platform Engineering |
| Classification | Confidential — Internal |
| Review cycle | Per milestone |
| Source of truth | This document supersedes any verbal scope |

### 0.1 Revision History

| Version | Date | Author | Summary |
|---|---|---|---|
| 0.1 | Draft | PM | Initial skeleton |
| 0.5 | Draft | PM + Arch | Added DB + API |
| 1.0 | Final | PM + Arch | Build-ready master spec |

### 0.2 How Claude Code Should Use This Document

1. Treat every **FR-XXX** as an implementable requirement with its acceptance criteria.
2. Build **vertically by milestone** (see Section 21), not horizontally by layer.
3. Database schema in Section 12 is authoritative. Generate migrations from it.
4. API contracts in Section 13 are authoritative. Generate OpenAPI from them.
5. All money is stored in **integer minor units (paise)**; all timestamps in **UTC** with timezone metadata.
6. Multi-tenant from day one (see Section 5.4). Never hardcode a single tenant.
7. When ambiguous, prefer: secure default, audit everything, soft-delete over hard-delete.

### 0.3 Glossary

| Term | Definition |
|---|---|
| Tenant | A laundry operator company (the SaaS customer). The platform is multi-tenant. |
| Client / Business | A B2B customer of the laundry (hotel, hostel, PG, school, coaching institute). |
| Lot / Consignment | A single pickup batch of clothes from a client at a point in time. |
| Item / Garment line | A quantity of a specific clothing category within a lot. |
| Category | A configurable clothing type (e.g., Bedsheet, Shirt, Uniform). |
| Pickup | Collection of soiled clothes from a client. |
| Delivery | Return of cleaned clothes to a client. |
| Tagging | Receiving + recount + quality inspection step inside the plant. |
| Packing | Final recount + bundling step before dispatch. |
| Turnaround Time (TAT) | Elapsed time from Collected → Delivered. |
| RBAC | Role-Based Access Control. |
| SLA | Service Level Agreement. |

---

## Table of Contents

1. Executive Summary
2. Business Context & Objectives
3. Stakeholders, Personas & Roles
4. Product Scope (In / Out)
5. System Architecture Overview
6. Technology Stack & Rationale
7. Authentication, Authorization & RBAC
8. Client (Business) Management
9. Clothing Category Management
10. Operational Workflows (Delivery, Tagging, Washing, Packing, Return, Missing)
11. Functional Requirements Catalog (FR-001…)
12. Database Design (Schema, ER, Indexes, Keys)
13. API Design (REST Contracts)
14. UI/UX Design & Wireframes
15. Dashboard & Analytics
16. Billing, Invoicing & Payments
17. Notifications (WhatsApp/SMS/Email/Push)
18. Non-Functional Requirements (NFR)
19. Security, Audit, Backup & Recovery
20. Future Features (Barcode/QR/RFID/AI/IoT)
21. Development Roadmap & Milestones
22. Scaling Strategy
23. User Stories & Acceptance Criteria (Master List)
24. Folder/Repository Structure
25. Deployment & DevOps (GCP)
26. Appendices

---

## 1. Executive Summary

FreshFold LMS is a production-grade, multi-tenant SaaS platform that digitizes the end-to-end operations of a commercial B2B laundry. The laundry serves recurring institutional clients — **hotels, hostels, PGs, schools, and coaching institutes** — currently ~100+ businesses, with a design target to scale to **thousands of businesses** and hundreds of thousands of garments per day.

The platform replaces error-prone paper counting and manual coordination with a controlled digital chain of custody for every garment: from doorstep **pickup** → **tagging** (recount + QC) → **washing pipeline** → **packing** (recount) → **return delivery** (signature) → **billing**. At each handoff the system enforces a **count reconciliation** so that missing/extra/damaged items are detected immediately, attributed to a stage and a worker, and routed into a formal **investigation workflow**.

Key outcomes:

- **Zero-dispute deliveries** through dual digital signatures, GPS, timestamps, and photo proof.
- **Loss prevention** via stage-by-stage reconciliation and a missing-cloth investigation ledger.
- **Operational visibility** via a live admin dashboard (clothes currently inside the plant, worker productivity, machine utilization, revenue, alerts).
- **Client self-service** through a portal (history, invoices, pending/missing/damaged items, schedules, support).
- **Automated billing** with GST-compliant invoices, monthly cycles, and multi-mode payments (UPI/cash/bank transfer).
- **Proactive communication** via WhatsApp/SMS/Email/Push reminders.

### 1.1 Product Pillars

1. **Chain of custody** — every garment is accounted for at every stage.
2. **Reconciliation-first** — mismatches are surfaced, never silently absorbed.
3. **Role-scoped UX** — each worker sees only what they need; clients see only their data.
4. **Multi-tenant scale** — isolation, performance, and cost efficiency by design.
5. **Audit by default** — who did what, when, where, with what evidence.

### 1.2 Success Metrics (KPIs)

| KPI | Target |
|---|---|
| Average turnaround time (Collected→Delivered) | < 48h |
| Missing-cloth rate | < 0.1% of garments |
| Delivery dispute rate | < 0.5% of deliveries |
| Invoice accuracy | > 99.5% |
| On-time pickup adherence | > 95% |
| Client portal monthly active rate | > 60% of clients |
| System uptime | 99.9% |

---

## 2. Business Context & Objectives

### 2.1 Business Model

A commercial laundry operates on **recurring volume contracts**. Each client business sends linen/garments on a schedule (e.g., a hotel sends bedsheets/towels daily; a school sends uniforms weekly). The laundry charges **per-item rates** (negotiated per client and per category) and bills on a **monthly cycle** with GST.

### 2.2 Core Operational Pain Points (Problem Statement)

| Pain | Current state | FreshFold solution |
|---|---|---|
| Manual counting errors | Paper slips, disputes | Digital counts + reconciliation at 3 stages |
| Lost garments with no accountability | "It vanished somewhere" | Stage + worker attribution, investigation ledger |
| Damage disputes | He-said-she-said | Photo + timestamp evidence at intake |
| Billing leakage | Under-counted items | Counts feed invoices automatically |
| No visibility for clients | Phone calls | Self-service portal |
| No ops visibility | Whiteboards | Live dashboard + analytics |
| Scheduling chaos | Memory/WhatsApp | Pickup/delivery scheduling engine |

### 2.3 Business Objectives

- **BO-1**: Eliminate count disputes via enforced reconciliation and evidence capture.
- **BO-2**: Reduce garment loss to < 0.1% through traceability.
- **BO-3**: Increase billing capture (no uninvoiced items).
- **BO-4**: Improve client retention via transparency (portal + reports).
- **BO-5**: Increase plant throughput via worker productivity insights.
- **BO-6**: Provide a scalable SaaS foundation for multi-branch / multi-operator growth.

### 2.4 Business Types Served (and their nuances)

| Business type | Volume profile | Typical categories | Billing nuance |
|---|---|---|---|
| Hotel | High, daily | Bedsheets, pillow covers, towels, bath mats, curtains, chef uniforms, table cloths, napkins, blankets | Volume tiers, daily pickup |
| Hostel | Medium, 2–3x/week | Bedsheets, pillow covers, blankets, towels | Per-bed or per-kg options |
| PG | Medium, weekly | Shirts, t-shirts, jeans, track pants, pants, shorts, towels, bedsheets, blankets | Per-item, per-resident options |
| School | Seasonal/weekly | Uniforms, sweaters, blazers, sports uniforms | Term-based contracts |
| Coaching institute | Low–medium | Uniforms, curtains, mats | Project / periodic |

---

## 3. Stakeholders, Personas & Roles

### 3.1 Role Catalog

| Role | Scope | Primary device |
|---|---|---|
| **Super Admin** (future) | Cross-tenant platform operator; manages laundry operators, plans, global config | Web (desktop) |
| **Admin** | Full control within a single tenant (the laundry) | Web (desktop) + mobile |
| **Delivery Boy** | Field pickups & returns assigned to them | Mobile (primary) |
| **Tagging Worker** | Intake recount + QC | Tablet / mobile (plant) |
| **Packing Worker** | Final recount + bundling | Tablet / mobile (plant) |
| **Client** | Their own business data only | Web + mobile portal |

> Optional future roles (designed-for, not built in MVP): **Plant Supervisor**, **Accountant/Billing Clerk**, **Wash Operator**, **Branch Manager**. RBAC is permission-based so these slot in without schema changes.

### 3.2 Personas

**Persona A — Ravi, Laundry Owner/Admin (35).** Wants live control, loss prevention, accurate billing, and worker accountability. Power user on desktop, checks dashboard on mobile.

**Persona B — Suresh, Delivery Boy (24).** On a bike all day. Needs a fast mobile app: today's route, tap-to-navigate, quick count entry, signatures. Low patience for typing; large tap targets; works in poor connectivity.

**Persona C — Meena, Tagging Worker (30).** Receives sacks of clothes. Needs to recount fast, see expected vs actual, flag damage with a photo. Repetitive task — efficiency and clarity matter.

**Persona D — Arjun, Packing Worker (28).** Recounts before dispatch, confirms against tagging, flags last-mile mismatches.

**Persona E — Priya, Hotel Housekeeping Manager (Client) (40).** Wants to verify counts, see pending/missing items, download GST invoices, raise tickets.

**Persona F — Platform Operator (Super Admin, future).** Onboards new laundry operators, manages subscription plans, monitors platform health.

### 3.3 RACI (high level)

| Activity | Admin | Delivery | Tagger | Packer | Client | Super Admin |
|---|---|---|---|---|---|---|
| Onboard client | A/R | I | I | I | C | I |
| Pickup | A | R | I | - | C | - |
| Tagging | A | I | R | - | I | - |
| Wash pipeline | A | - | C | C | - | - |
| Packing | A | I | C | R | I | - |
| Return delivery | A | R | - | - | C | - |
| Missing investigation | A/R | C | C | C | C | I |
| Billing | A/R | - | - | - | C | I |
| Tenant onboarding | I | - | - | - | - | A/R |

---

## 4. Product Scope

### 4.1 In Scope (MVP → V1)

- Multi-tenant RBAC auth (Admin, Delivery, Tagger, Packer, Client; Super Admin scaffolded).
- Client (business) management with full configuration.
- Custom clothing categories per client.
- Pickup workflow (counts, dual signatures, GPS, photos).
- Tagging workflow (recount, reconciliation, QC flags, photos).
- Washing status pipeline (8 stages with timestamps/worker/duration).
- Packing workflow (recount, reconciliation).
- Return delivery (checklist, client signature, pending tracking).
- Missing-cloth investigation workflow.
- Admin dashboard (live ops).
- Analytics (daily/weekly/monthly/yearly + comparisons + charts).
- Client portal.
- Billing & invoicing (GST, PDF, payments, outstanding).
- Notifications (WhatsApp/SMS/Email/Push).
- Audit & activity logs; backup/recovery.

### 4.2 Out of Scope (V1) / Future

- Barcode/QR/RFID hardware integration (designed-for; Section 20).
- AI demand forecasting, OCR invoice scanning, WhatsApp bot, face/biometric login, IoT machine integration.
- Cross-tenant Super Admin console (scaffolded data model; full UI later).
- Native mobile apps (V1 is responsive PWA; native is a fast-follow).
- Route optimization engine (V1 provides manual ordering + map links).

### 4.3 Assumptions

- Connectivity may be intermittent in the field → pickup/delivery flows must support **offline capture with sync** (PWA + local queue).
- Single plant per tenant in V1 (multi-branch is data-model-ready).
- INR currency, GST regime (India). Money stored in paise.

### 4.4 Constraints

- Deploy on GCP Compute Engine VPS.
- Use Aerolink Claude API for any AI-assisted features (future module hooks).
- Budget-conscious infra (start single VM + managed Postgres option).

---

## 5. System Architecture Overview

### 5.1 Architectural Style

- **Modular monolith** backend (single deployable, internally bounded by domain modules) for V1 — fastest to build, easiest to operate on a single VPS, and cleanly splittable into services later.
- **API-first**: a versioned REST API (`/api/v1`) consumed by all clients (admin web, worker PWA, client portal).
- **Multi-tenant** with a `tenant_id` discriminator on every business table + row-level scoping in the data-access layer.
- **Event-driven side-effects**: domain events (e.g., `LotStatusChanged`, `MismatchDetected`) drive notifications, analytics rollups, and audit entries via an internal job queue.

### 5.2 Logical Components

```
                       ┌─────────────────────────────────────────┐
                       │                Clients                   │
                       │  Admin Web │ Worker PWA │ Client Portal  │
                       └───────────────┬─────────────────────────┘
                                       │ HTTPS / JWT
                       ┌───────────────▼─────────────────────────┐
                       │            API Gateway / Nginx           │
                       │   TLS, rate limit, gzip, reverse proxy   │
                       └───────────────┬─────────────────────────┘
                                       │
             ┌─────────────────────────▼──────────────────────────┐
             │                Application (Modular Monolith)        │
             │  Auth │ Tenancy │ Clients │ Categories │ Lots │      │
             │  Workflow Engine │ Reconciliation │ Investigations │ │
             │  Billing │ Analytics │ Notifications │ Audit         │
             └───┬───────────────┬───────────────┬─────────────────┘
                 │               │               │
        ┌────────▼───┐   ┌───────▼──────┐  ┌─────▼───────┐
        │ PostgreSQL │   │   Redis      │  │ Object Store│
        │ (primary)  │   │ cache+queue  │  │ (GCS)       │
        └────────────┘   └──────────────┘  └─────────────┘
                 │
        ┌────────▼───────────────────────────────────────┐
        │  External: WhatsApp(Meta/Gupshup), SMS, SMTP,   │
        │  UPI/Payment gateway, Google Maps, Aerolink AI  │
        └─────────────────────────────────────────────────┘
```

### 5.3 Domain Modules (bounded contexts)

| Module | Responsibility |
|---|---|
| **Identity & Tenancy** | Auth, JWT, roles, permissions, tenant lifecycle |
| **Client Management** | Business CRUD, config, schedules, rates |
| **Catalog** | Per-client clothing categories |
| **Operations / Lots** | Pickup, lot lifecycle, item counts |
| **Workflow Engine** | Status state machine + stage timestamps |
| **Reconciliation** | Count comparison across stages |
| **Quality / Defects** | QC flags + evidence |
| **Investigations** | Missing-cloth case management |
| **Billing** | Invoices, payments, GST, outstanding |
| **Analytics** | Rollups, comparisons, charts data |
| **Notifications** | Multi-channel messaging + templates |
| **Audit & Logs** | Immutable audit + activity trail |
| **Files/Evidence** | Photo/signature storage |

### 5.4 Multi-Tenancy Strategy

- **Model:** Shared database, shared schema, `tenant_id` column on every tenant-owned table (cost-efficient at thousands of tenants).
- **Isolation enforcement:** A mandatory data-access layer that injects `WHERE tenant_id = :ctx_tenant` on every query; PostgreSQL **Row-Level Security (RLS)** policies as defense-in-depth.
- **Tenant context:** Derived from the authenticated JWT (`tenant_id` claim), never from client-supplied body params.
- **Noisy-neighbor protection:** Per-tenant rate limits; heavy analytics run on read replicas / pre-aggregated tables.
- **Upgrade path:** Schema-per-tenant or DB-per-tenant for very large enterprise tenants (data model is portable).

### 5.5 State Machine (Lot Lifecycle) — canonical

```
COLLECTED → TAGGED → WASHED → DRYING → IRONED → PACKED → READY → DELIVERED → COMPLETED
   │           │                                                  │
   └─(mismatch)┴────────► flags raised, investigation may open    └─(pending items)─► partial complete
```

- Transitions are **forward-only** by default; backward transitions allowed only with `admin_override` + reason (audited).
- Each transition writes a `lot_status_history` row (status, actor, timestamp, duration_from_previous).

---

## 6. Technology Stack & Rationale

> Recommended, opinionated, and chosen for scalability to 500+ clients (and beyond), developer velocity with Claude Code, and clean operation on a GCP VPS.

### 6.1 Recommended Stack

| Layer | Choice | Rationale |
|---|---|---|
| **Frontend** | React 18 + TypeScript + Vite | Mature, typed, fast DX; one codebase for admin/worker/portal via role-based routing |
| UI library | Tailwind CSS + shadcn/ui (Radix) | Mobile-first, accessible, consistent design system |
| State/data | TanStack Query + Zustand | Server-cache + lightweight client state |
| Forms | React Hook Form + Zod | Validation parity with backend |
| Charts | Recharts (or ECharts for heatmaps) | Dashboards/analytics |
| PWA/offline | Workbox + IndexedDB queue | Field offline capture |
| **Backend** | Node.js 20 + NestJS (TypeScript) | Modular, opinionated, DI, guards/interceptors = perfect for RBAC + multi-tenant; shares types with frontend |
| ORM | Prisma | Type-safe schema → migrations; great with Postgres |
| Validation | Zod / class-validator | DTO validation |
| Auth | JWT (access+refresh) + Passport; Argon2id hashing | Secure, standard |
| **Database** | PostgreSQL 15 | Relational integrity, RLS, JSONB for flexible config, strong analytics |
| Cache/queue | Redis 7 + BullMQ | Caching, rate limit, background jobs (notifications, rollups) |
| **Storage** | Google Cloud Storage | Photos, signatures, invoice PDFs |
| **PDF** | Puppeteer / pdfkit | GST invoices, reports |
| **Search** | Postgres full-text (V1) → Meilisearch (later) | Client/lot search |
| **Notifications** | WhatsApp Cloud API (or Gupshup), MSG91/Twilio SMS, SMTP (SES/SendGrid), Web Push (VAPID) | Multi-channel |
| **Maps** | Google Maps (deep links + JS SDK) | Navigation |
| **AI (future)** | Aerolink Claude API | Forecasting, OCR assist, WhatsApp bot |
| **Infra** | GCP Compute Engine (Ubuntu), Nginx, Docker Compose, Cloud SQL (optional managed PG), Cloud Storage | Cost-efficient, scalable |
| Observability | OpenTelemetry + Grafana/Loki/Prometheus (or Cloud Logging) | Logs/metrics/traces |
| CI/CD | GitHub Actions → Docker → GCP | Automated deploy |

### 6.2 Why a Modular Monolith over Microservices (V1)

At 100–thousands of tenants, a well-structured monolith on a vertically scalable VM + read replicas handles load far past 500 clients while keeping operational complexity (and cost) low. Each module has clear boundaries so extraction into services is mechanical when a specific module needs independent scale (e.g., Notifications, Analytics).

### 6.3 Capacity Sizing (initial)

| Component | Initial | Scale step |
|---|---|---|
| App VM | e2-standard-4 (4 vCPU/16GB) | Horizontal: add VMs behind LB |
| Postgres | Cloud SQL db-custom-4-16 | Read replicas + partitioning |
| Redis | 2GB | Memorystore tier-up |
| Storage | GCS standard | Lifecycle → nearline for old evidence |

---

## 7. Authentication, Authorization & RBAC

### 7.1 Authentication

- **Mechanism:** JWT with short-lived **access token** (15 min) + rotating **refresh token** (7–30 days, stored hashed server-side; httpOnly secure cookie for web, secure storage for PWA).
- **Password hashing:** Argon2id (memory-hard) with per-user salt; never store plaintext.
- **Login identifiers:** email or phone + password. Phone-OTP login supported for field workers (SMS/WhatsApp OTP).
- **MFA (optional, admin):** TOTP-based 2FA for Admin/Super Admin.
- **Session controls:** device/session list, remote logout, refresh-token rotation with reuse detection (revoke family on reuse).
- **Lockout:** progressive backoff + temporary lock after N failed attempts; CAPTCHA after threshold.
- **Password policy:** min 10 chars, complexity, breached-password check (k-anonymity), forced rotation on suspicion only (NIST-aligned).

### 7.2 Authorization Model (RBAC + permissions)

- **Roles** map to **permission sets**; permissions are fine-grained `resource:action` strings (e.g., `client:create`, `lot:tag`, `invoice:read`).
- A user has exactly one **primary role** per tenant (multiple roles supported via join table for future flexibility).
- **Scope rules** layered on top of permissions:
  - **Tenant scope:** all data filtered by `tenant_id`.
  - **Ownership scope:** Client users restricted to their own `client_id`. Delivery/Tagger/Packer restricted to assigned lots/clients.
- Enforcement at three layers: route guard (role/permission), service layer (scope/ownership), and DB (RLS).

### 7.3 Permission Matrix (representative)

| Permission | Super Admin | Admin | Delivery | Tagger | Packer | Client |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| tenant:manage | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| plan:manage | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| user:manage (within tenant) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| client:create / edit / deactivate | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| client:read | ❌ | ✅ | own-assigned | assigned | assigned | self |
| category:manage | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| schedule:read (today route) | ❌ | ✅ | own | ❌ | ❌ | self |
| lot:create (pickup) | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| lot:tag | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ |
| lot:washstatus | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ |
| lot:pack | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ |
| lot:deliver | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| lot:read | ❌ | ✅ | own | assigned | assigned | self |
| defect:flag | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| investigation:manage | ❌ | ✅ | contribute | contribute | contribute | view-own |
| invoice:create | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| invoice:read | ❌ | ✅ | ❌ | ❌ | ❌ | self |
| payment:record | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| dashboard:view | ✅(platform) | ✅(tenant) | ❌ | ❌ | ❌ | portal |
| analytics:view | ✅ | ✅ | ❌ | ❌ | ❌ | limited |
| audit:read | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| notification:configure | ❌ | ✅ | ❌ | ❌ | ❌ | self-prefs |

### 7.4 Route Access Map (frontend)

| Route prefix | Allowed roles |
|---|---|
| `/superadmin/**` | Super Admin |
| `/admin/**` | Admin |
| `/field/**` (route, pickup, deliver) | Delivery, Admin |
| `/plant/tagging/**` | Tagger, Admin |
| `/plant/packing/**` | Packer, Admin |
| `/plant/wash/**` | Tagger, Packer, Admin |
| `/portal/**` | Client |

> Unauthorized access returns 403 and is logged to the audit trail. Frontend hides disallowed nav; backend independently enforces (never trust the client).

### 7.5 Token Claims

```json
{
  "sub": "user_uuid",
  "tenant_id": "tenant_uuid",
  "role": "DELIVERY",
  "perms": ["lot:create","lot:deliver","schedule:read"],
  "client_id": null,
  "iat": 1700000000,
  "exp": 1700000900,
  "jti": "token_uuid"
}
```

For Client users, `client_id` is populated and all queries are forced to that client.

---

## 8. Client (Business) Management

### 8.1 Overview

Admin manages the full lifecycle of B2B client businesses. A client is a rich configuration object that drives scheduling, pricing, billing, worker assignment, and the categories workers see.

### 8.2 Client Configuration Fields

| Group | Field | Type | Notes |
|---|---|---|---|
| Identity | Business name | string (req) | Unique within tenant |
| | Business type | enum | hotel/hostel/pg/school/coaching/other |
| | Client code | string (auto) | Human-friendly short code (e.g., HTL-0007) |
| | Logo | image | Optional |
| | Status | enum | active / inactive (deactivate, never delete) |
| Contact | Contact person name | string | Primary |
| | Phone (primary) | E.164 | Required |
| | Alternate phone | E.164 | Optional |
| | Email | email | Portal login + invoices |
| | Address (multiline) | string | Pickup/delivery address |
| | Google Maps location | lat/lng + place_id + URL | For navigation |
| Tax/Billing | GSTIN | string | Validated format |
| | Legal/billing name | string | For invoice |
| | Billing address | string | If different |
| | Payment terms | enum/int | Net 0/7/15/30 days |
| | Billing cycle | enum | monthly (default), weekly, custom |
| | Billing day | int (1–28) | Cycle close day |
| | Credit limit | money | Optional outstanding cap |
| | Advance balance | money | Prepaid wallet |
| Scheduling | Pickup days | weekday set | e.g., Mon/Wed/Fri |
| | Delivery days | weekday set | |
| | Pickup frequency | enum | daily / alt-day / weekly / custom |
| | Delivery frequency | enum | |
| | Default pickup time window | time range | e.g., 08:00–10:00 |
| | Default delivery time window | time range | |
| | Default TAT (SLA) | hours | e.g., 48 |
| Assignments | Assigned delivery boy(s) | user refs | Default route owner |
| | Assigned tagger(s)/packer(s) | user refs | Optional defaults |
| Pricing | Rate card (per category) | list | category → rate (paise), unit (item/kg) |
| | Default unit | enum | item / kg |
| | Express surcharge % | number | Optional |
| Categories | Custom clothing categories | list | Defines what workers see for this client |
| Misc | Notes / special instructions | text | e.g., "separate chef whites" |
| | Tags/labels | string[] | Segmentation |

### 8.3 Client Management Functions

- **Add client** (wizard: Identity → Contact → Tax/Billing → Schedule → Categories → Rates → Assignments → Review).
- **Edit client** (any field; changes audited; rate changes versioned with effective date).
- **Deactivate client** (soft; blocks new pickups; preserves history; reactivatable).
- **Assign pickup/delivery days & frequency.**
- **Assign Google Maps location** (search + pin; stores lat/lng + place_id + share URL).
- **Assign laundry rates** (per-category rate card; effective-dated for historical invoice correctness).
- **Assign contact person, GST, business type, payment terms, billing cycle.**
- **Assign worker(s).**
- **Assign custom clothing categories** (from a template per business type, then customize).

### 8.4 Rate Card Versioning

Rates are **effective-dated**. An invoice for a period uses the rate card valid on each lot's pickup date. Changing a rate creates a new `rate_card_version`; past lots/invoices are unaffected.

### 8.5 Client Onboarding Templates

When a business type is chosen, the system seeds a **starter category template** (Section 9.4) and a suggested rate card, which Admin then customizes — accelerating onboarding of 100+ clients.

---

## 9. Clothing Category Management

### 9.1 Concept

Categories are **per-client** (scoped), seeded from **business-type templates**, fully customizable. Workers automatically see **only the categories configured for that client** during counting — eliminating irrelevant options and reducing errors.

### 9.2 Category Fields

| Field | Type | Notes |
|---|---|---|
| Name | string | e.g., "Bedsheet (King)" |
| Code/SKU | string | Optional internal code |
| Business client | ref | Scope |
| Default unit | enum | item / kg |
| Rate | money | From rate card (per client) |
| Icon/emoji | string | Faster visual scan for workers |
| Sort order | int | Worker UI ordering |
| Active | bool | Hide without deleting |
| Wash program hint | enum | normal/delicate/heavy/dry-clean (future routing) |
| Expected weight (g) | int | For kg↔item cross-checks (optional) |

### 9.3 Behavior

- Counting screens for a lot render **exactly** that client's active categories, in sort order, with icons.
- Reconciliation compares counts **per category** across stages.
- Adding/removing a category does not retroactively change historical lots.

### 9.4 Starter Templates (seed data)

**Hotel:** Bedsheets, Pillow Covers, Blankets, Towels (Bath/Hand), Bath Mats, Curtains, Chef Uniforms, Table Cloths, Napkins, Duvet Covers.

**Hostel:** Bedsheets, Pillow Covers, Blankets, Towels.

**PG:** Shirts, T-Shirts, Jeans, Track Pants, Pants, Shorts, Towels, Bedsheets, Blankets, Innerwear (bag).

**School:** Uniform Shirts, Uniform Trousers/Skirts, Sweaters, Blazers, Sports Uniforms, House T-Shirts, Ties.

**Coaching:** Uniforms, Curtains, Floor Mats, Table Cloths.

Admin can edit any template item, add custom categories, set rates, reorder, and deactivate.

---

## 10. Operational Workflows

This is the operational heart of the system. Each workflow below specifies the actor, preconditions, step-by-step UX, data captured, validations, edge cases, and resulting state transitions.

### 10.1 Delivery Boy — Pickup Workflow

**Actor:** Delivery Boy (or Admin acting). **Device:** Mobile PWA (offline-capable).

**Preconditions:** Logged in; has assigned route for today.

**Steps:**

1. **Today's Schedule screen** loads on login: a list of client stops for today, **sorted in delivery/route order**, separated into *Pickups* and *Returns* (or combined timeline). Pull-to-refresh; works offline from last sync.
2. Each **client card** shows:
   - Client name, business type badge, contact person + tap-to-call number.
   - Pickup time window and delivery time window.
   - **Google Maps "Navigate" button** (deep link to lat/lng).
   - **Previous pending issues** (open missing/damaged items, unresolved investigations).
   - **Collection history** snippet (last pickup date + qty).
   - Status chip: Pending / In-progress / Done.
3. Delivery boy taps **Navigate** → opens Maps.
4. On arrival, taps **Start Pickup** → opens the **count entry screen** rendering **only that client's categories** (icons + names + steppers).
5. Enters quantity per category (e.g., 20 Shirts, 14 Pants, 5 Towels). Uses +/- steppers or numeric keypad. **Total clothes auto-calculate** live (and per-unit subtotals if kg).
6. Optional: add **note** and **photo proof** (multiple photos).
7. **Client signs digitally** on a signature pad (captures name + signature image).
8. **Delivery boy signs** digitally.
9. On **Confirm**:
   - **Timestamp** recorded (UTC + local).
   - **GPS coordinates** captured (lat/lng + accuracy).
   - A **Lot (consignment)** is created with status **COLLECTED**.
   - Item lines saved per category (pickup_qty).
   - A digital **pickup receipt** is generated (viewable/shareable; auto-sent to client per prefs).
10. Card marked **Done**; route progress updates. If offline, queued locally and **synced** when online (idempotent via client-generated `lot_uuid`).

**Validations & edge cases:**

- Zero-total pickup blocked unless explicitly "Empty pickup / No clothes today" toggle (logged).
- Missing GPS permission → warn, allow with `gps_missing=true` flag (audited).
- Missing client signature → require explicit "client unavailable" reason; mark for follow-up.
- Duplicate submit prevented via idempotency key.
- Editing a confirmed pickup requires `admin_override` (audited) — workers cannot silently alter counts.

**Outputs:** Lot(COLLECTED), pickup item lines, signatures, GPS, photos, receipt, notification to client.

---

### 10.2 Tagging Worker — Intake & QC Workflow

**Actor:** Tagging Worker. **Device:** Plant tablet/mobile.

**Preconditions:** Lot exists with status COLLECTED and has arrived at plant.

**Steps:**

1. **Tagging queue** shows incoming lots (by client, pickup time, total qty). Open a lot.
2. Screen shows **expected counts** (from pickup) per category alongside an entry field for **actual recount**.
3. Tagger **recounts each category** and enters actuals.
4. **System compares** pickup vs tagging counts per category:
   - **Match** → green.
   - **Mismatch** → warning highlighted per category, with the delta.
5. For each mismatch, tagger classifies the discrepancy:
   - **Missing Clothes** (fewer than expected)
   - **Extra Clothes** (more than expected)
   - **Unknown Clothes** (items not matching any expected category)
   - **Found Clothes** (previously-missing items now present)
6. **Quality inspection** — tagger flags defects per item/category with type:
   - Already Damaged, Stained, Burn Marks, Torn, Color Fade, Buttons Missing, Zipper Broken, Other.
   - Each defect: **note** + **photo upload** (mandatory photo for damage claims).
7. Tagger applies **tags/labels** to garments (physical tag id captured if used; QR-ready field).
8. **Confirm** → status transitions to **TAGGED**; `lot_status_history` records tagger, timestamp, duration since COLLECTED.

**Validations & edge cases:**

- Confirming with unresolved mismatch requires selecting a discrepancy classification for each delta (no silent absorption).
- A mismatch automatically creates/links a **discrepancy record**; a "Missing" of a billable item may **auto-open an investigation** (configurable threshold).
- Damage flags create **defect records** with evidence attached, surfaced to client portal and dashboard.
- Photos compressed client-side; stored in GCS; thumbnails generated.

**Outputs:** Lot(TAGGED), tagging counts, discrepancy records, defect records + evidence, possible investigation.

---

### 10.3 Washing Status Pipeline

**Actors:** Wash/plant workers (Tagger/Packer roles permitted in V1), Admin oversight.

The lot moves through statuses, each stamped with **timestamp, worker name, and time-taken** (computed from previous stage):

| # | Status | Captured |
|---|---|---|
| 1 | Collected | pickup actor, time, GPS |
| 2 | Tagged | tagger, time, recount, defects |
| 3 | Washed | wash operator, time, machine id (optional) |
| 4 | Drying | operator, time, machine/dryer id |
| 5 | Ironed | operator, time |
| 6 | Packed | packer, time, recount |
| 7 | Ready | system/operator, time (ready-for-dispatch) |
| 8 | Delivered | delivery boy, time, client signature |
| 9 | Completed | system, time (post-delivery, no pending) |

**Behavior:**

- A simple **status board** (Kanban) lets authorized workers advance lots; each advance writes history.
- **Machine id** capture (optional in V1) enables **machine utilization** analytics later.
- **Time-in-stage** and **total TAT** computed and stored for analytics.
- SLA breach (TAT > client SLA) raises a dashboard alert.

---

### 10.4 Packing Worker — Final Recount Workflow

**Actor:** Packing Worker. **Device:** Plant tablet/mobile.

**Preconditions:** Lot status is post-ironing / ready to pack.

**Steps:**

1. Packing queue → open lot.
2. Screen shows **three-way comparison** per category: **Pickup | Tagging | Packing(entry)**.
3. Packer **recounts** each category and enters packing counts.
4. **System highlights differences** across all three stages (e.g., pickup 20 → tagging 20 → packing 18 ⇒ 2 lost between tagging and packing).
5. Packer **selects missing items** (which categories/how many) and **damaged items** found during packing, each with **photo upload** + note.
6. Missing-between-stages automatically attributes the **stage of loss** (Tagging→Packing) for the investigation workflow.
7. **Confirm** → status **PACKED**; bundle/label generated (packing slip); history recorded.

**Validations & edge cases:**

- Packing count > tagging count flagged as "Found/Extra" with classification.
- Any net shortfall vs pickup that remains unresolved auto-creates/updates an **investigation**.
- Generates a **delivery checklist** payload for the return trip.

**Outputs:** Lot(PACKED), packing counts, three-way reconciliation, missing/damaged records, packing slip, delivery checklist.

---

### 10.5 Return Delivery to Client Workflow

**Actor:** Delivery Boy. **Device:** Mobile PWA.

**Preconditions:** Lot status READY (packed & ready for dispatch).

**Steps:**

1. Today's schedule shows **Returns** with packed lots.
2. Delivery boy receives packed clothes; app shows an **auto-generated delivery checklist** (category × quantity to hand over).
3. Navigate to client.
4. At handover, app shows checklist; client verifies. Delivery boy can mark **delivered quantities** per category (defaults to packed counts).
5. **Client signs** on receipt (name + signature). Delivery boy signs.
6. **Pending clothes** (any items not delivered, e.g., still missing/under investigation) **remain open** and are clearly listed on the receipt and in the client portal.
7. Confirm → status **DELIVERED** (timestamp, GPS, signatures). If no pending and no open issues → eligible for **COMPLETED**.
8. Digital **delivery receipt** generated and sent to client.

**Validations & edge cases:**

- Partial delivery supported: delivered_qty < packed_qty leaves a balance "pending" record.
- Client refuses/disputes a count → capture dispute note + photo; lot stays DELIVERED-with-dispute; alert to admin.
- Offline capture supported with sync.

**Outputs:** Lot(DELIVERED→COMPLETED), delivery receipt, pending records, client signature, notifications.

---

### 10.6 Missing-Cloth Investigation Workflow

**Goal:** A complete, auditable case management process to locate, attribute, and resolve missing garments.

**Trigger:** Auto-created when reconciliation detects an unresolved shortfall (configurable threshold), or manually opened by Admin/Client.

**Case fields:**

- Case id, tenant, client, lot, category, quantity missing.
- **Where item disappeared** — stage attribution: Pickup / Tagging / Packing / Delivery (derived from where counts first dropped; editable by Admin).
- **Who handled it** — the worker(s) responsible at each stage (from history).
- **When** — timeline of stage timestamps.
- **Evidence** — photos, signature records, GPS, notes from each stage.
- **Status** — Open → Investigating → Recovered / Compensation / Closed.
- **Resolution** — Recovered (item found, links a "Found" record), Compensation (amount, mode, adjusted on invoice), Closed (write-off with reason).
- Activity log / comments thread (each participant can contribute).

**Workflow:**

1. **Detection** → case auto-opens with computed stage attribution + responsible worker.
2. **Investigating** → Admin assigns, participants add findings/evidence.
3. **Resolution**:
   - **Recovered** → reconcile counts, close, notify client.
   - **Compensation** → compute amount (item rate × qty or custom), create credit note / invoice adjustment, record payout mode, notify client.
   - **Closed (write-off)** → reason recorded; affects loss analytics + worker accountability metrics.
4. **Reporting** → missing trends by stage/worker/client/category feed analytics.

**Edge cases:**

- "Found Clothes" later → links back to the original case and may auto-recover it.
- Cross-lot mix-ups (item belongs to a different client) → reassign + audit.
- Repeated losses by a worker/stage → flagged in worker productivity & risk.

---

## 11. Functional Requirements Catalog

> Format: **FR-ID | Requirement | Priority (MoSCoW) | Acceptance summary**. Full acceptance criteria for key flows are in Section 23.

### 11.1 Authentication & Identity

| ID | Requirement | Pri | Acceptance |
|---|---|---|---|
| FR-001 | Users authenticate via email/phone + password | Must | Valid creds → JWT issued; invalid → 401 + counter++ |
| FR-002 | Phone-OTP login for field workers | Must | OTP via SMS/WhatsApp; 5-min expiry; 3 tries |
| FR-003 | Access + refresh token with rotation & reuse detection | Must | Reused refresh revokes token family |
| FR-004 | Argon2id password hashing | Must | No plaintext; verified by security review |
| FR-005 | Progressive lockout + CAPTCHA | Must | Lock after N fails; audit entry |
| FR-006 | Optional TOTP 2FA for Admin/Super Admin | Should | Enable/disable; recovery codes |
| FR-007 | Password reset via email/OTP | Must | Token single-use, 30-min expiry |
| FR-008 | Session/device management + remote logout | Should | List + revoke sessions |

### 11.2 RBAC & Tenancy

| ID | Requirement | Pri | Acceptance |
|---|---|---|---|
| FR-010 | Role-based route + API access control | Must | Disallowed role → 403 + audit |
| FR-011 | Permission-level checks (`resource:action`) | Must | Service enforces perms |
| FR-012 | Tenant isolation on all data | Must | No cross-tenant read/write; RLS verified |
| FR-013 | Client users scoped to own client_id | Must | Cannot access other clients' data |
| FR-014 | Worker scoped to assigned lots/clients | Must | Unassigned → not visible |
| FR-015 | Admin full tenant access | Must | All tenant modules |
| FR-016 | Super Admin cross-tenant (scaffolded) | Could | Data model ready; gated UI |

### 11.3 Client Management

| ID | Requirement | Pri | Acceptance |
|---|---|---|---|
| FR-020 | Add client via wizard | Must | All required fields validated; client created |
| FR-021 | Edit client (audited) | Must | Changes logged; rate edits versioned |
| FR-022 | Deactivate/reactivate client (soft) | Must | No new pickups when inactive; history kept |
| FR-023 | Assign pickup/delivery days & frequency | Must | Drives schedule generation |
| FR-024 | Assign Google Maps location | Must | lat/lng + place_id stored; navigate works |
| FR-025 | Assign rate card per category (effective-dated) | Must | Invoices use correct historical rate |
| FR-026 | Assign contact, GST, business type, terms, cycle | Must | Validated formats (GSTIN, phone) |
| FR-027 | Assign workers | Must | Default route/plant owners |
| FR-028 | Assign custom categories from template | Must | Workers see only these |
| FR-029 | Client search/filter/list with pagination | Must | By name/type/status/code |
| FR-030 | Client detail 360 view | Must | Config + history + outstanding + issues |

### 11.4 Categories

| ID | Requirement | Pri | Acceptance |
|---|---|---|---|
| FR-035 | Seed categories from business-type template | Must | Auto on type select |
| FR-036 | CRUD categories per client | Must | Add/edit/reorder/deactivate |
| FR-037 | Worker counting renders only client's active categories | Must | Verified per role screen |

### 11.5 Pickup / Delivery (Field)

| ID | Requirement | Pri | Acceptance |
|---|---|---|---|
| FR-040 | Today's route, sorted, pickups + returns | Must | Correct order; offline view |
| FR-041 | Client card with navigate/call/history/pending | Must | All elements present |
| FR-042 | Per-category quantity entry with auto-total | Must | Total = Σ qty live |
| FR-043 | Dual digital signatures | Must | Client + delivery boy captured |
| FR-044 | Timestamp + GPS capture | Must | Stored with accuracy |
| FR-045 | Optional photo proof | Should | Multiple photos, compressed |
| FR-046 | Create lot (COLLECTED) idempotently | Must | No duplicates on retry |
| FR-047 | Offline capture + sync | Must | Queue + idempotent sync |
| FR-048 | Pickup receipt generation + send | Must | PDF/shareable; notification |
| FR-049 | Return delivery checklist + client signature | Must | Auto checklist; signed |
| FR-050 | Partial delivery + pending tracking | Must | Balance remains open |

### 11.6 Tagging / Packing / Wash

| ID | Requirement | Pri | Acceptance |
|---|---|---|---|
| FR-060 | Tagging recount with expected-vs-actual | Must | Per-category compare |
| FR-061 | Discrepancy classification (missing/extra/unknown/found) | Must | Required for each delta |
| FR-062 | Defect flagging with type + note + photo | Must | Photo required for damage |
| FR-063 | Wash pipeline status advance with stamps | Must | timestamp+worker+duration |
| FR-064 | Packing three-way reconciliation | Must | pickup/tag/pack compared |
| FR-065 | Auto stage-attribution of loss | Must | Derived from count drops |
| FR-066 | Auto investigation on unresolved shortfall | Must | Configurable threshold |
| FR-067 | Machine id capture (optional) | Could | Feeds utilization |

### 11.7 Investigations

| ID | Requirement | Pri | Acceptance |
|---|---|---|---|
| FR-070 | Auto/manual case creation | Must | With stage + worker attribution |
| FR-071 | Case timeline + evidence aggregation | Must | Photos/GPS/sign/notes |
| FR-072 | Status lifecycle (Open→…→Closed) | Must | Transitions audited |
| FR-073 | Resolution: recovered/compensation/closed | Must | Compensation adjusts billing |
| FR-074 | Found-cloth links/auto-recovers case | Should | Reconcile counts |

### 11.8 Dashboard & Analytics

| ID | Requirement | Pri | Acceptance |
|---|---|---|---|
| FR-080 | Admin live dashboard (Section 15.1) | Must | All KPIs render < 2s |
| FR-081 | Clothes-currently-inside count | Must | Real-time accurate |
| FR-082 | Worker productivity metrics | Must | Per worker/stage |
| FR-083 | Machine utilization | Should | From machine ids |
| FR-084 | Analytics daily/weekly/monthly/yearly | Must | Date-range engine |
| FR-085 | Comparisons (MoM, YoY) | Must | Current vs prev vs LY |
| FR-086 | Charts/heatmaps/growth graphs | Must | Section 15.2 set |
| FR-087 | Business/category-wise stats | Must | Drill-down |

### 11.9 Client Portal

| ID | Requirement | Pri | Acceptance |
|---|---|---|---|
| FR-090 | View pickup/delivery history | Must | Paginated, filterable |
| FR-091 | View invoices + download PDF | Must | GST PDF |
| FR-092 | View pending/missing/damaged | Must | Live status |
| FR-093 | View monthly reports + receipts | Must | Downloadable |
| FR-094 | View schedules + announcements | Must | Upcoming pickups/deliveries |
| FR-095 | Raise & track support tickets | Must | Threaded |

### 11.10 Billing & Payments

| ID | Requirement | Pri | Acceptance |
|---|---|---|---|
| FR-100 | Generate monthly invoice from lots | Must | Sum items × historical rate |
| FR-101 | GST computation (CGST/SGST/IGST) | Must | Correct splits + HSN |
| FR-102 | PDF invoice generation | Must | Branded, compliant |
| FR-103 | Payment recording (UPI/cash/bank) | Must | Modes + reference |
| FR-104 | Outstanding balance + advance/wallet | Must | Ledger accurate |
| FR-105 | Credit notes / adjustments (compensation) | Must | Linked to investigation |
| FR-106 | Payment reminders | Must | Scheduled notifications |

### 11.11 Notifications

| ID | Requirement | Pri | Acceptance |
|---|---|---|---|
| FR-110 | WhatsApp/SMS/Email/Push channels | Must | Per-event routing |
| FR-111 | Pickup/delivery/invoice reminders | Must | Scheduled |
| FR-112 | Missing-cloth & damage alerts | Must | To admin + client |
| FR-113 | Per-user notification preferences | Should | Channel opt-in/out |
| FR-114 | Template management | Should | Editable templates + vars |

### 11.12 Audit / Security / System

| ID | Requirement | Pri | Acceptance |
|---|---|---|---|
| FR-120 | Immutable audit log (who/what/when/where) | Must | Append-only |
| FR-121 | Activity log per user | Must | Viewable by admin |
| FR-122 | Rate limiting | Must | Per IP + per tenant |
| FR-123 | Automated backups + tested restore | Must | RPO/RTO met |
| FR-124 | File evidence storage (GCS) + access control | Must | Signed URLs |
| FR-125 | Data export (client/admin) | Should | CSV/PDF |

---

## 12. Database Design

**Engine:** PostgreSQL 15. **Conventions:**
- Primary keys: UUID v4 (`id uuid default gen_random_uuid()`), except high-volume append tables may use `bigserial`.
- Every tenant-owned table has `tenant_id uuid not null` (FK → tenants).
- Timestamps: `created_at`, `updated_at` (timestamptz, default now()); soft-delete via `deleted_at timestamptz null`.
- Money: `*_paise bigint` (integer minor units, INR).
- Enums via Postgres enum types or lookup tables (lookup tables preferred for extensibility).
- Row-Level Security enabled on all tenant tables.

### 12.1 Entity List

1. tenants
2. plans (subscription, future)
3. tenant_subscriptions (future)
4. users
5. roles
6. permissions
7. role_permissions
8. user_roles
9. refresh_tokens
10. clients (businesses)
11. client_contacts
12. client_schedules
13. rate_cards
14. rate_card_items
15. categories
16. worker_assignments
17. lots (consignments)
18. lot_items (per-category counts per stage)
19. lot_status_history
20. signatures
21. media_files (photos/evidence)
22. discrepancies
23. defects
24. investigations
25. investigation_events
26. machines (future utilization)
27. invoices
28. invoice_lines
29. payments
30. credit_notes
31. ledger_entries
32. notifications
33. notification_templates
34. notification_preferences
35. support_tickets
36. ticket_messages
37. announcements
38. audit_logs
39. activity_logs
40. analytics_daily_rollups

### 12.2 Core Schema (DDL-style)

```sql
-- ========= TENANCY & IDENTITY =========
CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'active', -- active|suspended
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  currency text NOT NULL DEFAULT 'INR',
  gstin text,
  settings jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE plans (               -- future super-admin billing
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price_paise bigint NOT NULL,
  max_clients int,
  features jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE tenant_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  plan_id uuid NOT NULL REFERENCES plans(id),
  status text NOT NULL DEFAULT 'active',
  current_period_end timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),   -- null for super_admin
  full_name text NOT NULL,
  email text,
  phone text,
  password_hash text,                      -- argon2id
  status text NOT NULL DEFAULT 'active',   -- active|disabled
  is_super_admin boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  totp_secret text,
  client_id uuid,                          -- set for CLIENT users
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, email),
  UNIQUE (tenant_id, phone)
);

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),   -- null = system role
  code text NOT NULL,                       -- ADMIN|DELIVERY|TAGGER|PACKER|CLIENT|SUPER_ADMIN
  name text NOT NULL,
  UNIQUE (tenant_id, code)
);

CREATE TABLE permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,                -- e.g. lot:tag
  description text
);

CREATE TABLE role_permissions (
  role_id uuid REFERENCES roles(id),
  permission_id uuid REFERENCES permissions(id),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
  user_id uuid REFERENCES users(id),
  role_id uuid REFERENCES roles(id),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  token_hash text NOT NULL,
  family_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  user_agent text, ip inet,
  created_at timestamptz DEFAULT now()
);

-- ========= CLIENTS / CONFIG =========
CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  code text NOT NULL,                       -- HTL-0007
  name text NOT NULL,
  business_type text NOT NULL,              -- hotel|hostel|pg|school|coaching|other
  status text NOT NULL DEFAULT 'active',
  gstin text,
  legal_name text,
  billing_address text,
  address text,
  lat double precision, lng double precision,
  place_id text, maps_url text,
  payment_terms_days int DEFAULT 30,
  billing_cycle text DEFAULT 'monthly',
  billing_day int DEFAULT 1,
  credit_limit_paise bigint DEFAULT 0,
  advance_balance_paise bigint DEFAULT 0,
  default_unit text DEFAULT 'item',
  default_tat_hours int DEFAULT 48,
  notes text,
  tags text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, code)
);

CREATE TABLE client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  client_id uuid NOT NULL REFERENCES clients(id),
  name text NOT NULL, phone text, alt_phone text, email text,
  is_primary boolean DEFAULT true
);

CREATE TABLE client_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  client_id uuid NOT NULL REFERENCES clients(id),
  pickup_days int[] ,        -- 0=Sun..6=Sat
  delivery_days int[],
  pickup_frequency text,     -- daily|alt|weekly|custom
  delivery_frequency text,
  pickup_window_start time, pickup_window_end time,
  delivery_window_start time, delivery_window_end time
);

CREATE TABLE rate_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  client_id uuid NOT NULL REFERENCES clients(id),
  effective_from date NOT NULL,
  effective_to date,                          -- null = current
  created_at timestamptz DEFAULT now()
);

CREATE TABLE rate_card_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_card_id uuid NOT NULL REFERENCES rate_cards(id),
  category_id uuid NOT NULL,
  unit text NOT NULL DEFAULT 'item',
  rate_paise bigint NOT NULL,
  hsn_code text,
  gst_rate numeric(5,2) DEFAULT 18.0
);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  client_id uuid NOT NULL REFERENCES clients(id),
  name text NOT NULL,
  code text,
  unit text DEFAULT 'item',
  icon text,
  sort_order int DEFAULT 0,
  wash_program text,
  expected_weight_g int,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (tenant_id, client_id, name)
);

CREATE TABLE worker_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  client_id uuid NOT NULL REFERENCES clients(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role_code text NOT NULL,    -- DELIVERY|TAGGER|PACKER
  is_default boolean DEFAULT true
);
```
```sql
-- ========= OPERATIONS / LOTS =========
CREATE TABLE lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  client_id uuid NOT NULL REFERENCES clients(id),
  lot_number text NOT NULL,                  -- LOT-2026-000123
  status text NOT NULL DEFAULT 'collected',  -- state machine
  pickup_user_id uuid REFERENCES users(id),
  pickup_at timestamptz,
  pickup_lat double precision, pickup_lng double precision, pickup_gps_accuracy numeric,
  delivery_user_id uuid REFERENCES users(id),
  delivered_at timestamptz,
  delivery_lat double precision, delivery_lng double precision,
  total_pickup_qty int DEFAULT 0,
  total_packed_qty int DEFAULT 0,
  total_delivered_qty int DEFAULT 0,
  tat_minutes int,
  sla_breached boolean DEFAULT false,
  has_pending boolean DEFAULT false,
  has_dispute boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (tenant_id, lot_number)
);

CREATE TABLE lot_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  lot_id uuid NOT NULL REFERENCES lots(id),
  category_id uuid NOT NULL REFERENCES categories(id),
  pickup_qty int DEFAULT 0,
  tagging_qty int,
  packing_qty int,
  delivered_qty int,
  unit text DEFAULT 'item',
  weight_g int,
  rate_paise bigint,        -- snapshot at pickup for billing
  UNIQUE (lot_id, category_id)
);

CREATE TABLE lot_status_history (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  lot_id uuid NOT NULL REFERENCES lots(id),
  status text NOT NULL,
  actor_user_id uuid REFERENCES users(id),
  machine_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  duration_from_prev_minutes int,
  meta jsonb DEFAULT '{}'
);

CREATE TABLE signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  lot_id uuid NOT NULL REFERENCES lots(id),
  context text NOT NULL,       -- pickup|delivery
  signer_role text NOT NULL,   -- client|delivery
  signer_name text,
  media_file_id uuid,          -- signature image
  signed_at timestamptz DEFAULT now()
);

CREATE TABLE media_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  bucket text NOT NULL, object_key text NOT NULL,
  content_type text, size_bytes bigint,
  width int, height int, thumb_key text,
  uploaded_by uuid REFERENCES users(id),
  context text,                -- pickup|tag|pack|defect|signature|investigation
  ref_table text, ref_id uuid, -- polymorphic link
  created_at timestamptz DEFAULT now()
);

CREATE TABLE discrepancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  lot_id uuid NOT NULL REFERENCES lots(id),
  category_id uuid REFERENCES categories(id),
  stage text NOT NULL,         -- pickup_vs_tag|tag_vs_pack|pack_vs_delivery
  type text NOT NULL,          -- missing|extra|unknown|found
  qty int NOT NULL,
  resolved boolean DEFAULT false,
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE defects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  lot_id uuid NOT NULL REFERENCES lots(id),
  category_id uuid REFERENCES categories(id),
  type text NOT NULL,          -- already_damaged|stained|burn|torn|color_fade|button_missing|zipper_broken|other
  qty int DEFAULT 1,
  note text,
  detected_stage text,         -- tagging|packing
  detected_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE machines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL, type text,  -- washer|dryer|iron
  capacity_kg int, status text DEFAULT 'active'
);

-- ========= INVESTIGATIONS =========
CREATE TABLE investigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  case_number text NOT NULL,
  client_id uuid NOT NULL REFERENCES clients(id),
  lot_id uuid REFERENCES lots(id),
  category_id uuid REFERENCES categories(id),
  qty_missing int NOT NULL,
  disappeared_stage text,      -- pickup|tagging|packing|delivery
  responsible_user_id uuid REFERENCES users(id),
  status text NOT NULL DEFAULT 'open', -- open|investigating|recovered|compensation|closed
  resolution text,
  compensation_paise bigint DEFAULT 0,
  assigned_to uuid REFERENCES users(id),
  opened_at timestamptz DEFAULT now(),
  closed_at timestamptz,
  UNIQUE (tenant_id, case_number)
);

CREATE TABLE investigation_events (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  investigation_id uuid NOT NULL REFERENCES investigations(id),
  actor_user_id uuid REFERENCES users(id),
  type text,                   -- comment|status_change|evidence|resolution
  message text, meta jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
```
```sql
-- ========= BILLING =========
CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  client_id uuid NOT NULL REFERENCES clients(id),
  invoice_number text NOT NULL,
  period_start date, period_end date,
  status text NOT NULL DEFAULT 'draft', -- draft|issued|paid|partial|overdue|void
  subtotal_paise bigint DEFAULT 0,
  cgst_paise bigint DEFAULT 0, sgst_paise bigint DEFAULT 0, igst_paise bigint DEFAULT 0,
  total_paise bigint DEFAULT 0,
  amount_paid_paise bigint DEFAULT 0,
  due_date date,
  pdf_media_id uuid,
  issued_at timestamptz, created_at timestamptz DEFAULT now(),
  UNIQUE (tenant_id, invoice_number)
);

CREATE TABLE invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  invoice_id uuid NOT NULL REFERENCES invoices(id),
  lot_id uuid REFERENCES lots(id),
  category_id uuid REFERENCES categories(id),
  description text, hsn_code text,
  qty int, unit text,
  rate_paise bigint, gst_rate numeric(5,2),
  line_total_paise bigint
);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  client_id uuid NOT NULL REFERENCES clients(id),
  invoice_id uuid REFERENCES invoices(id),
  amount_paise bigint NOT NULL,
  mode text NOT NULL,          -- upi|cash|bank_transfer
  reference text, note text,
  received_by uuid REFERENCES users(id),
  received_at timestamptz DEFAULT now()
);

CREATE TABLE credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  client_id uuid NOT NULL REFERENCES clients(id),
  invoice_id uuid REFERENCES invoices(id),
  investigation_id uuid REFERENCES investigations(id),
  amount_paise bigint NOT NULL, reason text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE ledger_entries (   -- running client balance
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  client_id uuid NOT NULL REFERENCES clients(id),
  type text NOT NULL,          -- invoice|payment|credit|advance|adjustment
  ref_id uuid,
  debit_paise bigint DEFAULT 0, credit_paise bigint DEFAULT 0,
  balance_paise bigint,
  created_at timestamptz DEFAULT now()
);

-- ========= NOTIFICATIONS / PORTAL =========
CREATE TABLE notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  code text NOT NULL,          -- pickup_reminder|delivery_reminder|invoice|missing_alert
  channel text NOT NULL,       -- whatsapp|sms|email|push
  subject text, body text NOT NULL,
  UNIQUE (tenant_id, code, channel)
);

CREATE TABLE notifications (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid REFERENCES users(id),
  client_id uuid REFERENCES clients(id),
  channel text NOT NULL, template_code text,
  payload jsonb, status text DEFAULT 'queued', -- queued|sent|failed|read
  error text, sent_at timestamptz, read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid REFERENCES users(id),
  client_id uuid REFERENCES clients(id),
  channel text NOT NULL, event text NOT NULL, enabled boolean DEFAULT true
);

CREATE TABLE support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  client_id uuid NOT NULL REFERENCES clients(id),
  subject text NOT NULL, status text DEFAULT 'open', -- open|pending|resolved|closed
  priority text DEFAULT 'normal',
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now(), resolved_at timestamptz
);

CREATE TABLE ticket_messages (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id),
  author_user_id uuid REFERENCES users(id),
  body text NOT NULL, media_file_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  title text NOT NULL, body text,
  audience text DEFAULT 'all_clients',
  published_at timestamptz, created_at timestamptz DEFAULT now()
);

-- ========= AUDIT / ANALYTICS =========
CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  tenant_id uuid, actor_user_id uuid,
  action text NOT NULL,        -- create|update|delete|login|override...
  entity_type text, entity_id uuid,
  before jsonb, after jsonb,
  ip inet, user_agent text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE activity_logs (
  id bigserial PRIMARY KEY,
  tenant_id uuid, user_id uuid,
  event text, meta jsonb, created_at timestamptz DEFAULT now()
);

CREATE TABLE analytics_daily_rollups (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  day date NOT NULL,
  client_id uuid, category_id uuid, worker_id uuid,
  pickups int DEFAULT 0, deliveries int DEFAULT 0,
  cloth_count int DEFAULT 0, missing_count int DEFAULT 0,
  damaged_count int DEFAULT 0, revenue_paise bigint DEFAULT 0,
  avg_tat_minutes int,
  UNIQUE (tenant_id, day, client_id, category_id, worker_id)
);
```

### 12.3 Key Indexes

```sql
CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_clients_tenant_status ON clients(tenant_id, status);
CREATE INDEX idx_categories_client ON categories(tenant_id, client_id, active);
CREATE INDEX idx_lots_tenant_status ON lots(tenant_id, status);
CREATE INDEX idx_lots_client_date ON lots(tenant_id, client_id, pickup_at DESC);
CREATE INDEX idx_lot_items_lot ON lot_items(lot_id);
CREATE INDEX idx_status_hist_lot ON lot_status_history(lot_id, occurred_at);
CREATE INDEX idx_discrep_lot ON discrepancies(lot_id) WHERE resolved = false;
CREATE INDEX idx_invest_status ON investigations(tenant_id, status);
CREATE INDEX idx_invoices_client_status ON invoices(tenant_id, client_id, status);
CREATE INDEX idx_payments_client ON payments(tenant_id, client_id, received_at DESC);
CREATE INDEX idx_notif_status ON notifications(tenant_id, status);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_rollup_lookup ON analytics_daily_rollups(tenant_id, day);
-- Full text search
CREATE INDEX idx_clients_fts ON clients USING gin (to_tsvector('simple', name || ' ' || coalesce(code,'')));
```

### 12.4 Partitioning (scale)

- `lot_status_history`, `audit_logs`, `notifications`, `analytics_daily_rollups` partitioned by **month** (range) once volume grows.
- `lots`, `lot_items` partitioned by **tenant hash** or **created_at range** for very large tenants.

### 12.5 ER Diagram (textual)

```
tenants 1───* users
tenants 1───* clients
clients 1───* client_contacts
clients 1───1 client_schedules
clients 1───* rate_cards 1───* rate_card_items *───1 categories
clients 1───* categories
clients 1───* worker_assignments *───1 users
clients 1───* lots
lots 1───* lot_items *───1 categories
lots 1───* lot_status_history *───1 users(actor)
lots 1───* signatures
lots 1───* discrepancies
lots 1───* defects
lots *───1 (machines via status_history.machine_id)
lots 1───* investigations 1───* investigation_events
clients 1───* invoices 1───* invoice_lines *───1 lots
invoices 1───* payments
investigations 1───* credit_notes
clients 1───* ledger_entries
clients 1───* support_tickets 1───* ticket_messages
tenants 1───* announcements
* media_files (polymorphic) ← lots/defects/signatures/investigations/tickets
* audit_logs / activity_logs (append-only)
* analytics_daily_rollups (aggregates)
roles *───* permissions ; users *───* roles
```

A rendered ER diagram (PNG) accompanies this document (see `er_diagram.png`).

---

## 13. API Design (REST)

**Base URL:** `https://api.freshfold.app/api/v1`
**Format:** JSON. **Auth:** `Authorization: Bearer <access_token>`.
**Conventions:**
- Resource-oriented, plural nouns. Standard verbs: GET (read), POST (create), PATCH (update), DELETE (soft-delete).
- **Pagination:** `?page=1&limit=20` (or cursor `?cursor=...`); responses include `meta:{page,limit,total,total_pages}`.
- **Search:** `?q=text`. **Filter:** field params (e.g., `?status=open&business_type=hotel`). **Sort:** `?sort=-created_at`.
- **Idempotency:** `Idempotency-Key` header on POST for field submissions.
- **Errors:** RFC-7807-style: `{ "error": { "code":"VALIDATION_ERROR", "message":"...", "details":[...] } }`.
- **Versioning:** URL-versioned (`/v1`). Breaking changes → `/v2`.
- **Rate limits:** headers `X-RateLimit-Limit/Remaining/Reset`.

### 13.1 Standard Response Envelope

```json
{ "data": {...} | [...], "meta": { "page":1,"limit":20,"total":134,"total_pages":7 } }
```

### 13.2 Auth Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | /auth/login | email/phone + password → tokens |
| POST | /auth/otp/request | request OTP (phone) |
| POST | /auth/otp/verify | verify OTP → tokens |
| POST | /auth/refresh | rotate tokens |
| POST | /auth/logout | revoke refresh |
| POST | /auth/password/forgot | start reset |
| POST | /auth/password/reset | complete reset |
| GET | /auth/me | current user + perms |
| POST | /auth/2fa/enable / /verify | TOTP |

**POST /auth/login**
```json
// req
{ "identifier": "ravi@hotel.com", "password": "••••" }
// 200
{ "data": { "access_token":"jwt","refresh_token":"jwt","user":{ "id":"..","role":"ADMIN","tenant_id":".." } } }
```

### 13.3 Tenant & Users (Admin / Super Admin)

| Method | Path | Notes |
|---|---|---|
| GET/POST | /tenants | Super Admin |
| GET/PATCH | /tenants/{id} | |
| GET/POST | /users | tenant-scoped; create worker/client users |
| GET/PATCH/DELETE | /users/{id} | |
| GET | /roles, /permissions | RBAC config |
| POST | /users/{id}/roles | assign roles |

### 13.4 Clients

| Method | Path | Notes |
|---|---|---|
| GET | /clients | list, `?q,&business_type,&status,&page,&limit,&sort` |
| POST | /clients | create (wizard payload) |
| GET | /clients/{id} | 360 detail |
| PATCH | /clients/{id} | edit (audited) |
| POST | /clients/{id}/deactivate / /activate | soft |
| GET/PUT | /clients/{id}/schedule | pickup/delivery config |
| GET/POST | /clients/{id}/contacts | |
| GET/POST | /clients/{id}/rate-cards | effective-dated |
| GET/POST/PATCH/DELETE | /clients/{id}/categories | per-client categories |
| GET/POST/DELETE | /clients/{id}/assignments | worker assignment |

**POST /clients** (excerpt)
```json
{
  "name":"Grand Palace Hotel","business_type":"hotel",
  "contact":{"name":"Priya","phone":"+9198…","email":"ops@grandpalace.com"},
  "gstin":"29ABCDE1234F1Z5","payment_terms_days":30,"billing_cycle":"monthly","billing_day":1,
  "location":{"lat":12.97,"lng":77.59,"place_id":"Ch…","maps_url":"https://…"},
  "schedule":{"pickup_days":[1,3,5],"delivery_days":[2,4,6],"pickup_frequency":"alt"},
  "categories":[{"name":"Bedsheet","unit":"item","rate_paise":1500,"icon":"🛏️"}],
  "assignments":[{"user_id":"..","role_code":"DELIVERY"}]
}
```

### 13.5 Schedule (Field)

| Method | Path | Notes |
|---|---|---|
| GET | /me/route/today | delivery boy's sorted stops (pickups+returns) |
| GET | /me/route?date=YYYY-MM-DD | route for a date |

```json
// GET /me/route/today → data[]
{ "client":{"id":"..","name":"..","business_type":"hotel","contact_phone":"+91..","maps_url":".."},
  "type":"pickup","window":"08:00-10:00","sort_order":3,
  "pending_issues":2,"last_pickup":{"date":"2026-06-20","qty":120},"status":"pending" }
```

### 13.6 Lots (Operations)

| Method | Path | Notes |
|---|---|---|
| POST | /lots | create pickup (COLLECTED) — idempotent |
| GET | /lots | list `?status,&client_id,&date_from,&date_to,&q` |
| GET | /lots/{id} | full lot with items, history, defects, signatures |
| POST | /lots/{id}/tagging | submit tagging counts + discrepancies + defects |
| POST | /lots/{id}/status | advance wash pipeline status |
| POST | /lots/{id}/packing | submit packing counts (three-way) |
| POST | /lots/{id}/deliver | return delivery + signature |
| POST | /lots/{id}/signatures | upload signature image ref |
| POST | /lots/{id}/media | attach photos |
| GET | /lots/{id}/receipt | pickup/delivery receipt PDF |

**POST /lots** (pickup)
```json
{
  "lot_uuid":"client-generated-uuid",        // idempotency
  "client_id":"..",
  "items":[{"category_id":"..","pickup_qty":20},{"category_id":"..","pickup_qty":14}],
  "gps":{"lat":12.97,"lng":77.59,"accuracy":8},
  "signatures":[{"signer_role":"client","signer_name":"Priya","media_id":".."},
                {"signer_role":"delivery","signer_name":"Suresh","media_id":".."}],
  "photos":["media_id1"], "notes":"2 bags",
  "captured_at":"2026-06-25T08:12:00Z"
}
// 201 → { "data": { "id":"..","lot_number":"LOT-2026-000123","status":"collected","total_pickup_qty":34 } }
```

**POST /lots/{id}/tagging**
```json
{
  "items":[{"category_id":"..","tagging_qty":19}],
  "discrepancies":[{"category_id":"..","type":"missing","qty":1}],
  "defects":[{"category_id":"..","type":"torn","qty":1,"note":"..","media_id":".."}]
}
// 200 → lot status=tagged; auto-investigation if threshold met
```

**POST /lots/{id}/status**
```json
{ "status":"washed", "machine_id":"..", "occurred_at":"2026-06-25T11:00:00Z" }
```

**POST /lots/{id}/packing**
```json
{ "items":[{"category_id":"..","packing_qty":18}],
  "missing":[{"category_id":"..","qty":1}],
  "damaged":[{"category_id":"..","type":"stain","qty":1,"media_id":".."}] }
```

**POST /lots/{id}/deliver**
```json
{ "items":[{"category_id":"..","delivered_qty":18}],
  "signature":{"signer_name":"Priya","media_id":".."},
  "gps":{"lat":12.97,"lng":77.59}, "dispute_note":null }
```

### 13.7 Investigations

| Method | Path | Notes |
|---|---|---|
| GET | /investigations | `?status,&client_id,&stage` |
| POST | /investigations | manual open |
| GET | /investigations/{id} | full case + events |
| PATCH | /investigations/{id} | status/assignee/attribution |
| POST | /investigations/{id}/events | comment/evidence |
| POST | /investigations/{id}/resolve | recovered/compensation/closed |

### 13.8 Dashboard & Analytics

| Method | Path | Notes |
|---|---|---|
| GET | /dashboard/today | live KPIs (Section 15.1) |
| GET | /dashboard/inside | clothes currently inside plant |
| GET | /dashboard/alerts | SLA/missing/payment alerts |
| GET | /analytics/summary | `?range=daily|weekly|monthly|yearly&from&to` |
| GET | /analytics/compare | `?metric=revenue&basis=mom|yoy` |
| GET | /analytics/series | time series for charts |
| GET | /analytics/heatmap | workload heatmap (day×hour) |
| GET | /analytics/workers | productivity |
| GET | /analytics/clients | business-wise |
| GET | /analytics/categories | category-wise |

### 13.9 Billing

| Method | Path | Notes |
|---|---|---|
| POST | /invoices/generate | `{client_id, period_start, period_end}` → draft |
| GET | /invoices | `?client_id,&status,&from,&to` |
| GET | /invoices/{id} | detail + lines |
| POST | /invoices/{id}/issue | finalize + PDF |
| GET | /invoices/{id}/pdf | download |
| POST | /payments | record payment |
| GET | /clients/{id}/ledger | balance + entries |
| POST | /credit-notes | adjustment/compensation |

### 13.10 Notifications, Portal, Support

| Method | Path | Notes |
|---|---|---|
| GET | /notifications | inbox |
| PATCH | /notifications/{id}/read | mark read |
| GET/PUT | /notification-preferences | per-user |
| GET/POST | /notification-templates | admin |
| GET | /portal/overview | client portal home |
| GET | /portal/history | pickups/deliveries |
| GET | /portal/pending | pending/missing/damaged |
| GET | /portal/invoices | invoices |
| GET/POST | /tickets | support |
| POST | /tickets/{id}/messages | reply |
| GET | /announcements | published |

### 13.11 Files

| Method | Path | Notes |
|---|---|---|
| POST | /media/upload-url | get signed GCS upload URL |
| POST | /media | register uploaded object |
| GET | /media/{id} | signed download URL |

### 13.12 HTTP Status Codes

200 OK, 201 Created, 204 No Content, 400 Validation, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict (idempotency/duplicate), 422 Unprocessable, 429 Too Many Requests, 500 Server Error.

---

## 14. UI/UX Design & Wireframes

**Principles:** Mobile-first (workers/clients on phones), desktop-rich (admin). Large tap targets for field use, high-contrast, glove-friendly. Consistent design system (Tailwind + shadcn/ui). Responsive breakpoints: mobile <640, tablet 640–1024, desktop >1024. Dark-mode supported.

### 14.1 Global Component Hierarchy

```
<App>
 ├─ <AuthProvider> (JWT, role, perms)
 ├─ <TenantProvider>
 ├─ <RoleRouter>           // routes by role
 │   ├─ AdminShell        // sidebar + topbar
 │   ├─ FieldShell        // bottom-nav mobile
 │   ├─ PlantShell        // big-button tablet
 │   ├─ PortalShell       // client nav
 │   └─ SuperAdminShell
 ├─ <Toaster> <Modal> <ConfirmDialog>
 └─ <OfflineQueueIndicator>
```

Reusable components: `DataTable` (sortable/paginated/filterable), `StatCard`, `Chart`, `Stepper` (qty +/-), `CategoryCountGrid`, `SignaturePad`, `PhotoUploader`, `StatusBadge`, `Timeline`, `ReconciliationTable`, `MapButton`, `ClientCard`, `KanbanBoard`, `FilterBar`, `EmptyState`, `FormWizard`.

### 14.2 Navigation by Role

- **Admin (desktop sidebar):** Dashboard, Clients, Categories, Operations (Lots/Kanban), Tagging, Packing, Investigations, Billing, Analytics, Notifications, Users, Audit, Settings.
- **Delivery (mobile bottom-nav):** Today, Route, History, Profile.
- **Tagger (tablet):** Tagging Queue, History, Profile.
- **Packer (tablet):** Packing Queue, History, Profile.
- **Client (portal):** Home, History, Pending/Missing, Invoices, Schedule, Support, Announcements.
- **Super Admin:** Tenants, Plans, Platform Health, Billing.

### 14.3 Key Screen Wireframes (ASCII)

**Admin Dashboard**
```
┌───────────────────────────────────────────────────────────┐
│ FreshFold   [Search]                     🔔  Ravi (Admin) ▾ │
├───────┬───────────────────────────────────────────────────┤
│ Dash  │  TODAY                                              │
│ Clien │  ┌Pickups 42┐┌Deliv 38┐┌Pending 11┐┌Done 27┐       │
│ Categ │  ┌Missing 3 ┐┌Damaged5┐┌Revenue ₹84k┐┌Cloths 1.2k┐ │
│ Ops   │  ┌Clients 19┐┌Inside 540┐┌Pend Pay ₹2.1L┐          │
│ Tag   │  ┌──────── Workload heatmap ─────────┐ ┌Alerts───┐ │
│ Pack  │  │  day x hour intensity grid        │ │SLA x2   │ │
│ Inv   │  └───────────────────────────────────┘ │Missing3 │ │
│ Bill  │  ┌Worker productivity──┐ ┌Machine util┐│Pay due  │ │
│ Analy │  │ bars per worker     │ │ % per mc   ││         │ │
│ Users │  └─────────────────────┘ └────────────┘└─────────┘ │
└───────┴───────────────────────────────────────────────────┘
```

**Delivery — Today's Route (mobile)**
```
┌──────────────────────────┐
│ Today • 42 stops    🔄    │
│ ─ PICKUPS ──────────────  │
│ ┌──────────────────────┐ │
│ │ 1. Grand Palace Hotel │ │
│ │ 🏨 Hotel • 08:00-10:00│ │
│ │ ☎ +91…  ⚠ 2 pending   │ │
│ │ Last: 120 pcs (Jun20) │ │
│ │ [ Navigate ] [ Start ]│ │
│ └──────────────────────┘ │
│ ┌──────────────────────┐ │
│ │ 2. Sunrise PG …      │ │
│ └──────────────────────┘ │
│ ─ RETURNS ──────────────  │
│ ┌ packed lots … ┐         │
│ [Today][Route][Hist][Me] │
└──────────────────────────┘
```

**Delivery — Pickup Count Entry**
```
┌──────────────────────────┐
│ Grand Palace • Pickup     │
│ 🛏️ Bedsheet   [−] 20 [+]  │
│ 🧺 Towel       [−]  5 [+]  │
│ 👕 Shirt       [−] 14 [+]  │
│ … only this client's cats │
│ ─────────────────────────│
│ TOTAL: 39 pcs             │
│ 📷 Add photo   📝 Note     │
│ ✍ Client sign  ✍ My sign  │
│ [   Confirm Pickup   ]    │
└──────────────────────────┘
```

**Tagging — Reconciliation**
```
┌───────────────────────────────────┐
│ LOT-2026-000123 • Grand Palace     │
│ Cat      Pickup  Recount  Status   │
│ Bedsheet  20      [20]    ✅        │
│ Towel      5      [4]     ⚠ -1     │
│   → [Missing][Extra][Unknown][Found]│
│ Shirt     14      [14]    ✅        │
│ ── Defects ──                       │
│ [+ Flag defect] type▾ qty 📷 note  │
│ [ Confirm Tagging ]                 │
└───────────────────────────────────┘
```

**Packing — Three-way**
```
┌────────────────────────────────────────┐
│ LOT-…123  Pickup│Tag│Pack                │
│ Bedsheet   20  │20 │[20] ✅              │
│ Towel       5  │ 4 │[ 4] ⚠ lost@pickup-tag│
│ Shirt      14  │14 │[12] ⚠ -2 tag→pack   │
│ Missing: Shirt x2  [photo] [confirm]     │
└────────────────────────────────────────┘
```

**Client Portal — Home**
```
┌──────────────────────────────┐
│ Grand Palace Hotel            │
│ ┌Pending 6┐┌Missing 1┐┌Due ₹X┐│
│ Upcoming: Pickup Wed 8-10am   │
│ Recent lots ▾  Invoices ▾      │
│ [History][Pending][Invoices]  │
│ [Schedule][Support][News]     │
└──────────────────────────────┘
```

**Client Add Wizard (admin, desktop)**
```
[1 Identity]→[2 Contact]→[3 Tax/Billing]→[4 Schedule]→[5 Categories]→[6 Rates]→[7 Assign]→[8 Review]
```

### 14.4 Forms & Validation UX

- Inline validation (Zod), disabled submit until valid, optimistic UI with rollback on error.
- Field workers: numeric keypads, steppers, minimal typing, autosave drafts offline.
- Confirm dialogs for irreversible actions (deactivate, void invoice, close case).

### 14.5 Empty / Loading / Error States

Every list has skeleton loaders, empty states with primary action, and retry on error. Offline shows a persistent banner + queued-actions count.

### 14.6 Accessibility

WCAG 2.1 AA: keyboard nav, focus rings, ARIA labels, 4.5:1 contrast, large touch targets (min 44px), screen-reader labels on icon buttons.

---

## 15. Dashboard & Analytics

### 15.1 Admin Dashboard (live)

Real-time cards (auto-refresh / SSE), all tenant-scoped, for **today** (with date picker):

| Card | Definition |
|---|---|
| Today's pickups | count of lots created today |
| Today's deliveries | lots delivered today |
| Today's pending | lots not yet delivered / with open balance |
| Today's completed | lots reached COMPLETED today |
| Today's missing | discrepancies(type=missing) today |
| Today's damaged | defects logged today |
| Today's revenue | Σ invoiced/recognized today |
| Today's cloth count | Σ pickup qty today |
| Today's clients served | distinct clients with activity |
| Clothes currently inside | Σ items in lots with status in (tagged..ready) |
| Worker productivity | items processed per worker per stage |
| Machine utilization | active minutes / available minutes per machine |
| Pending payments | Σ outstanding across clients |
| Pending invoices | count of draft/overdue |
| Alerts | SLA breaches, missing spikes, payment overdue |

### 15.2 Analytics

**Ranges:** daily, weekly, monthly, yearly (custom from/to).
**Comparisons:** Current Month vs Previous Month (MoM), vs Same Month Last Year (YoY).

**Visualizations:**
- Growth graphs: client growth, revenue growth, cloth volume growth (line/area).
- Trend lines: missing-cloth trends, damage trends.
- Worker productivity (bar, per stage).
- Business-wise stats (table + bar) and category-wise stats (pie/bar).
- Pickup trends & delivery trends (line).
- **Workload heatmap** (day-of-week × hour) for peak load.
- Average turnaround time (gauge + trend).
- Peak workload indicators; SLA adherence %.

**Data source:** `analytics_daily_rollups` (pre-aggregated nightly + incremental on events) for speed; drill-down queries hit detail tables.

**Endpoints:** Section 13.8. **Export:** CSV/PDF per report.

### 15.3 Rollup Strategy

- On each terminal event (lot delivered, defect, payment), increment in-memory + persist to `analytics_daily_rollups` via background job.
- Nightly reconciliation job recomputes the day to correct drift.
- Comparison endpoints compute deltas server-side and return formatted series.

---

## 16. Billing, Invoicing & Payments

### 16.1 Invoice Generation

- **Trigger:** monthly on `billing_day` (scheduled job) per client, or manual `POST /invoices/generate`.
- **Source:** all delivered/completed lots in the period not yet invoiced.
- **Line items:** per lot × category: qty × historical `rate_paise` (from rate card valid at pickup date). HSN + GST rate per category.
- **Adjustments:** subtract credit notes (compensation for missing items), apply advance balance.

### 16.2 GST

- Intra-state (tenant state == client state): CGST + SGST (e.g., 9% + 9%).
- Inter-state: IGST (e.g., 18%).
- Stored as `cgst_paise/sgst_paise/igst_paise`; HSN per line; GSTIN of tenant + client on PDF.
- Rounding per invoice (round-off line) to nearest rupee.

### 16.3 Invoice PDF

Branded template: tenant logo/GSTIN, client billing details, period, line items, tax summary, totals, payment terms, due date, bank/UPI details, QR for UPI. Generated via Puppeteer; stored in GCS; downloadable by admin + client.

### 16.4 Payments & Ledger

- Modes: **UPI, Cash, Bank transfer** (+ reference/UTR).
- `payments` recorded against invoice; partial payments supported → invoice status `partial`.
- `ledger_entries` maintains running client balance (invoices debit, payments/credits credit).
- **Outstanding balance**, **advance/wallet** (advance_balance_paise) tracked; credit limit warnings.
- Statement of account per client (PDF/CSV).

### 16.5 Reminders & Status

- Invoice issued → notify client. Overdue (past due_date) → auto reminders (Section 17).
- Statuses: draft → issued → partial → paid / overdue / void.

---

## 17. Notifications

### 17.1 Channels

- **WhatsApp** (Cloud API / Gupshup) — primary for India.
- **SMS** (MSG91/Twilio) — fallback/OTP.
- **Email** (SES/SendGrid) — invoices, reports.
- **Push** (Web Push VAPID; FCM when native) — workers/admin.

### 17.2 Event Catalog

| Event | Recipients | Channels |
|---|---|---|
| Pickup reminder (day-before / morning) | Client + Delivery | WhatsApp/SMS/Push |
| Pickup confirmed + receipt | Client | WhatsApp/Email |
| Delivery reminder | Client + Delivery | WhatsApp/Push |
| Delivery completed + receipt | Client | WhatsApp/Email |
| Invoice issued | Client | Email/WhatsApp |
| Invoice reminder (due/overdue) | Client | WhatsApp/SMS/Email |
| Missing-cloth alert | Admin + Client | WhatsApp/Push/Email |
| Damage alert | Admin + Client | WhatsApp/Push |
| SLA breach | Admin | Push |
| Investigation update | Client + Admin | WhatsApp/Email |
| Support ticket reply | Client/Admin | Email/Push |
| Announcement | Clients | WhatsApp/Email |

### 17.3 Architecture

- Template-driven (`notification_templates` with variables) per tenant + channel.
- Queued via BullMQ; provider adapters; retries with backoff; delivery status webhooks update `notifications.status`.
- **Preferences** per user/client (opt in/out per event/channel); quiet hours respected.
- Idempotent (no duplicate sends); audit recorded.

---

## 18. Non-Functional Requirements (NFR)

### 18.1 Performance

| ID | Requirement | Target |
|---|---|---|
| NFR-P1 | API p95 latency (reads) | < 300 ms |
| NFR-P2 | API p95 latency (writes) | < 600 ms |
| NFR-P3 | Dashboard load | < 2 s |
| NFR-P4 | Count-entry interaction | < 100 ms UI response |
| NFR-P5 | Support 10k concurrent users (scale) | horizontal scale verified |
| NFR-P6 | Handle 1M+ lots/year/tenant | partitioning + indexes |

### 18.2 Scalability

- Stateless app nodes behind load balancer; sessions in JWT/Redis.
- Read replicas for analytics; pre-aggregation for dashboards.
- Background jobs scale independently (separate worker pool).
- Designed for 500+ active clients per tenant and thousands of tenants.

### 18.3 Availability & Reliability

- 99.9% uptime target. Health checks + auto-restart. Graceful degradation (notifications queue, offline field capture).
- RPO ≤ 15 min (PITR), RTO ≤ 1 h.

### 18.4 Usability

- Field flows complete in < 60 s per stop. Worker training < 30 min.
- Mobile-first, offline-tolerant, multilingual-ready (i18n scaffolding; English + Hindi at launch).

### 18.5 Maintainability

- Modular monolith with clear module boundaries; >80% test coverage on core domain; typed end-to-end; documented OpenAPI.

### 18.6 Portability / Compatibility

- Browsers: latest Chrome/Edge/Safari/Firefox; Android Chrome PWA; iOS Safari PWA.
- Containerized (Docker); reproducible builds.

### 18.7 Compliance / Data

- GST-compliant invoicing; data residency in India region (GCP `asia-south1`).
- PII handling, consent for WhatsApp; configurable data retention.

### 18.8 Observability

- Structured logs, metrics (RED/USE), traces; dashboards + alerts (error rate, latency, queue depth, job failures).

---

## 19. Security, Audit, Backup & Recovery

### 19.1 Security Controls

- **AuthN:** JWT access+refresh, rotation, reuse detection; Argon2id; optional TOTP 2FA.
- **AuthZ:** RBAC + permissions + tenant/ownership scoping + Postgres RLS.
- **Transport:** TLS 1.2+ everywhere; HSTS.
- **At rest:** disk encryption; sensitive columns (totp_secret) encrypted; GCS encryption.
- **Input:** server-side validation (Zod/class-validator), parameterized queries (Prisma), output encoding (XSS), CSRF protection for cookie flows.
- **Rate limiting:** per IP + per tenant + per endpoint (Redis token bucket); stricter on auth/OTP.
- **File security:** signed URLs (time-limited), content-type/size validation, AV scan hook, no public buckets.
- **Secrets:** GCP Secret Manager / env; never in repo.
- **Headers:** CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy.
- **OWASP Top 10** mitigations documented and tested.
- **Idempotency** on field writes; optimistic locking on lots to prevent double-advance.

### 19.2 Audit & Activity Logs

- **audit_logs**: append-only, immutable, capture actor, action, entity, before/after (jsonb), IP, UA, timestamp. Covers create/update/delete/login/override/permission-change/resolution.
- **activity_logs**: user-centric event stream (viewable by admin).
- Admin override actions (edit confirmed pickup, backward status transition, void invoice) are flagged and require a reason.
- Logs retained per policy; tamper-evident (hash chaining optional).

### 19.3 Backup & Recovery

- **Postgres:** automated daily snapshots + WAL archiving (PITR); RPO ≤ 15 min.
- **GCS:** versioned bucket + lifecycle (nearline after 90 days); cross-region copy for DR.
- **Restore drills:** quarterly tested restore; documented runbook; RTO ≤ 1 h.
- **Config-as-code:** infra + migrations in repo for rebuild.

### 19.4 Threat Model (summary)

| Threat | Mitigation |
|---|---|
| Cross-tenant data leak | tenant_id everywhere + RLS + tests |
| Worker altering counts to hide loss | confirmed records immutable w/o audited override; reconciliation |
| Credential stuffing | lockout, CAPTCHA, breached-pw check, rate limit |
| Stolen device (field) | short tokens, remote logout, PIN/biometric unlock (future) |
| Invoice tampering | server-computed totals, audit, signed PDFs |
| Photo/evidence tampering | immutable storage, hashes, timestamps |

---

## 20. Future Features (Design-For, Not in V1)

| Feature | Hook in current design | Notes |
|---|---|---|
| **Barcode/QR codes** | `lot_number`, category `code`, media polymorphism | Print QR on pickup; scan at each stage to advance status & auto-count |
| **RFID** | `lot_items`, `machines`, status_history | RFID tunnel reads bulk counts; map EPC → item |
| **AI predictions / demand forecasting** | `analytics_daily_rollups`, Aerolink Claude API | Forecast volume per client/category for staffing & capacity |
| **WhatsApp bot** | notifications + intents | Clients query status/invoices, schedule changes via chat |
| **OCR invoice scanning** | media + Aerolink Claude | Digitize external vendor invoices/expenses |
| **Face login / biometric attendance** | users + new biometric table | Worker attendance + secure login |
| **Machine/IoT integration** | `machines`, status_history.machine_id, MQTT ingestion | Real machine utilization, predictive maintenance |
| **Route optimization** | client lat/lng + schedule | Auto-order delivery route (VRP solver) |
| **Multi-branch / franchise** | tenant + branch_id (add column) | Per-branch ops & rollups |
| **Native mobile apps** | shared API | React Native fast-follow |
| **Self-serve client onboarding** | clients + portal | Clients request pickups on demand |

**AI integration pattern (Aerolink Claude API):** a dedicated `ai` module exposes server-side endpoints (`/ai/forecast`, `/ai/ocr`, `/ai/assistant`) that call Aerolink with tenant-scoped, PII-minimized prompts; results cached and audited. No client-side API keys.

---

## 21. Development Roadmap & Milestones

> Build **vertically** — each milestone is shippable. Estimates assume Claude Code + 1–2 reviewers.

### M0 — Foundations (Week 1–2)
- Repo, CI/CD, Docker, GCP VM, Postgres, Redis, Nginx, env/secrets.
- Prisma schema (Section 12), migrations, seed (system roles/permissions, category templates).
- Auth module: login, OTP, JWT rotation, RBAC guards, tenancy + RLS.
- **Exit:** users can log in by role; tenant isolation verified by tests.

### M1 — Client & Catalog (Week 3–4)
- Client CRUD + wizard, schedules, contacts, rate cards (effective-dated), assignments.
- Per-client categories from templates.
- Admin client list/detail UI.
- **Exit:** admin onboards a client end-to-end with categories + rates.

### M2 — Pickup & Field App (Week 5–6)
- Today's route, client cards, navigation, count entry, dual signatures, GPS, photos.
- Lot creation (COLLECTED), idempotency, offline capture + sync, pickup receipt.
- **Exit:** delivery boy completes an offline-capable pickup; lot appears for admin.

### M3 — Plant: Tagging, Wash, Packing (Week 7–9)
- Tagging recount + reconciliation + defects + evidence.
- Wash pipeline status board (timestamps/worker/duration, machine id).
- Packing three-way reconciliation; auto stage-attribution.
- **Exit:** lot flows COLLECTED→PACKED with full reconciliation.

### M4 — Return Delivery & Investigations (Week 10–11)
- Delivery checklist, client signature, partial/pending, dispute capture.
- Missing-cloth investigation workflow (auto/manual, evidence, resolution).
- **Exit:** full lifecycle COLLECTED→COMPLETED; investigations open/resolve.

### M5 — Billing (Week 12–13)
- Monthly invoice generation, GST, PDF, payments, ledger, credit notes, outstanding/advance, statements.
- **Exit:** generate + issue GST invoice, record payment, see outstanding.

### M6 — Dashboard & Analytics (Week 14–15)
- Live dashboard, rollups, analytics ranges + comparisons + charts + heatmap + exports.
- **Exit:** all KPIs + comparisons render < 2s.

### M7 — Client Portal & Notifications (Week 16–17)
- Portal (history, pending/missing/damaged, invoices, schedule, announcements, support tickets).
- Notifications (WhatsApp/SMS/Email/Push) + templates + preferences + reminders.
- **Exit:** clients self-serve; reminders fire automatically.

### M8 — Hardening & Launch (Week 18–19)
- Audit/activity logs UI, rate limiting, backups + restore drill, load testing, security review, observability, docs.
- **Exit:** NFR targets met; go-live.

### M9+ — Future modules
- Barcode/QR (V1.1), AI forecasting, WhatsApp bot, IoT, multi-branch, native apps.

### 21.1 Milestone Dependency Graph
```
M0 → M1 → M2 → M3 → M4 → M5
                 └──→ M6 ──→ M7 → M8
```

### 21.2 Definition of Done (per milestone)
- All FRs in scope implemented + acceptance criteria pass.
- Unit + integration + e2e tests green; coverage ≥ 80% core.
- OpenAPI updated; audit + RBAC enforced; no critical security findings.
- Deployed to staging; demo'd; docs updated.

---

## 22. Scaling Strategy

### 22.1 Vertical then Horizontal
- Start single app VM + managed Postgres. Scale VM size first; then add app nodes behind a GCP load balancer (stateless).

### 22.2 Database
- Connection pooling (PgBouncer). Read replicas for analytics/portal reads.
- Partition high-volume tables (lots, lot_status_history, audit_logs, notifications, rollups) by time/tenant.
- Move very large tenants to dedicated schema/DB (data model is portable).

### 22.3 Caching & Queues
- Redis caching for hot reads (route, dashboard, categories). Cache invalidation on writes via events.
- BullMQ workers scale horizontally for notifications, PDF generation, rollups.

### 22.4 Storage & CDN
- GCS for evidence/PDFs; CDN for thumbnails; lifecycle to nearline for old evidence.

### 22.5 Service Extraction Path
- Extract Notifications, Analytics, and AI into separate services first (clear boundaries, independent scale), then Billing.

### 22.6 Cost Controls
- Pre-aggregation reduces analytics cost; image compression; tiered storage; autoscaling worker pools.

### 22.7 Scale Targets
| Stage | Tenants | Clients/tenant | Infra |
|---|---|---|---|
| Launch | 1–5 | up to 100 | 1 VM + Cloud SQL |
| Growth | 50 | up to 500 | 2–3 app nodes + replica |
| Scale | 1000s | 500+ | LB + replicas + partitioning + service extraction |

---

## 23. User Stories & Acceptance Criteria (Master List)

> Format: **US-ID** — As a `<role>`, I want `<goal>` so that `<benefit>`. Followed by **AC** (Given/When/Then). Priority in brackets.

### 23.1 Authentication & Access

**US-001 [Must]** — As any user, I want to log in with my email/phone + password so that I access my role's workspace.
- AC1: Given valid credentials, when I submit, then I receive tokens and land on my role's home.
- AC2: Given invalid credentials, when I submit, then I see an error and the failed-attempt counter increments.
- AC3: Given 5 failed attempts, then login is temporarily locked and a CAPTCHA appears.

**US-002 [Must]** — As a delivery boy, I want OTP login by phone so that I sign in fast in the field.
- AC1: OTP delivered via SMS/WhatsApp within 30s, valid 5 min, max 3 tries.
- AC2: Correct OTP issues tokens; expired/invalid shows clear error.

**US-003 [Must]** — As a client user, I want to see only my business's data so that my information stays private.
- AC1: Any API call returns only rows where client_id == my client.
- AC2: Attempting another client's resource returns 403 and is audited.

**US-004 [Must]** — As an admin, I want role-scoped access so workers only see their modules.
- AC1: A tagger navigating to billing URL gets 403.
- AC2: Nav shows only permitted items per role.

### 23.2 Client & Catalog

**US-010 [Must]** — As an admin, I want to add a client via a wizard so onboarding is fast and complete.
- AC1: Required fields validated (name, type, phone, GSTIN format); cannot proceed if invalid.
- AC2: On finish, client created with code, schedule, categories (from template), rate card, assignments.

**US-011 [Must]** — As an admin, I want to deactivate a client so no new pickups are scheduled while history is preserved.
- AC1: Deactivated client cannot have new lots; appears as inactive; reactivatable.
- AC2: Historical lots/invoices remain accessible.

**US-012 [Must]** — As an admin, I want effective-dated rates so old invoices keep their original pricing.
- AC1: Changing a rate creates a new version; lots before the change bill at the old rate.

**US-013 [Must]** — As an admin, I want per-client categories so workers see only relevant items.
- AC1: Selecting business type seeds template categories.
- AC2: Worker count screens render only that client's active categories in sort order.

### 23.3 Pickup / Field

**US-020 [Must]** — As a delivery boy, I want today's route sorted in order so I work efficiently.
- AC1: Stops shown in sort_order, split into pickups/returns, with navigate/call/pending/history.
- AC2: Route is viewable offline from last sync.

**US-021 [Must]** — As a delivery boy, I want to enter quantities per category with an auto total so counting is accurate.
- AC1: Only client's categories shown; total = Σ quantities updates live.
- AC2: Zero total blocked unless "empty pickup" toggle (logged).

**US-022 [Must]** — As a delivery boy, I want dual signatures, GPS, timestamp, and optional photos captured so pickups are disputable-proof.
- AC1: Client + delivery signatures stored as images; GPS + timestamp recorded.
- AC2: Confirm creates lot (COLLECTED) idempotently; retry does not duplicate.

**US-023 [Must]** — As a delivery boy, I want offline capture so poor connectivity doesn't block me.
- AC1: Submissions queue locally; sync on reconnect; idempotent via client uuid.

### 23.4 Tagging / Wash / Packing

**US-030 [Must]** — As a tagger, I want expected-vs-actual recount so mismatches are caught at intake.
- AC1: Per category, pickup qty shown beside my recount; mismatches highlighted with delta.
- AC2: I must classify each delta (missing/extra/unknown/found) before confirming.

**US-031 [Must]** — As a tagger, I want to flag defects with type, note, and photo so damage is documented.
- AC1: Damage flag requires at least one photo.
- AC2: Defects appear in lot detail, dashboard, and client portal.

**US-032 [Must]** — As a plant worker, I want to advance wash statuses with stamps so TAT is measurable.
- AC1: Each advance records status, worker, timestamp, duration-from-previous.
- AC2: Backward transition requires admin override + reason (audited).

**US-033 [Must]** — As a packer, I want a three-way comparison so I catch losses between stages.
- AC1: Pickup/Tagging/Packing shown per category; differences highlighted with stage attribution.
- AC2: Net unresolved shortfall auto-creates/updates an investigation.

### 23.5 Delivery & Investigations

**US-040 [Must]** — As a delivery boy, I want an auto delivery checklist and client signature so returns are verified.
- AC1: Checklist = packed counts; client signs on receipt; partial delivery leaves pending balance.
- AC2: Dispute capture (note + photo) flags the lot and alerts admin.

**US-041 [Must]** — As an admin, I want a missing-cloth investigation with attribution so I can resolve losses.
- AC1: Case shows stage of disappearance, responsible worker, timeline, evidence.
- AC2: Resolution as recovered/compensation/closed; compensation creates a credit note adjusting billing.
- AC3: A later "found" item can auto-recover the case.

### 23.6 Billing

**US-050 [Must]** — As an admin, I want monthly GST invoices generated from delivered lots so billing is accurate.
- AC1: Lines = qty × historical rate; CGST/SGST or IGST computed; PDF produced.
- AC2: Credit notes and advance balance applied; totals server-computed and audited.

**US-051 [Must]** — As an admin, I want to record UPI/cash/bank payments so outstanding is tracked.
- AC1: Payment updates invoice status (paid/partial) and ledger balance.

**US-052 [Must]** — As a client, I want to download my GST invoices and statement so I can reconcile.
- AC1: Client sees only their invoices; PDF downloadable; statement shows balance.

### 23.7 Dashboard / Analytics / Portal / Notifications

**US-060 [Must]** — As an admin, I want a live dashboard so I control operations in real time.
- AC1: All cards in 15.1 render < 2s and reflect today's data, incl. clothes currently inside.

**US-061 [Must]** — As an admin, I want MoM/YoY comparisons and charts so I track growth and risks.
- AC1: Comparison endpoints return current/previous/last-year series; charts + heatmap render.

**US-062 [Must]** — As a client, I want a portal with history, pending/missing/damaged, invoices, schedule, and support so I'm self-served.
- AC1: All portal sections show only my data; tickets are threaded and tracked.

**US-063 [Must]** — As a client, I want pickup/delivery/invoice reminders and alerts so I'm never surprised.
- AC1: Reminders fire per schedule via my preferred channels; missing/damage alerts delivered.
- AC2: I can opt in/out per event/channel.

### 23.8 Audit / Security

**US-070 [Must]** — As an admin, I want an immutable audit log so every action is traceable.
- AC1: create/update/delete/login/override recorded with actor, before/after, IP, timestamp.
- AC2: Overrides require a reason and are flagged.

---

## 24. Folder / Repository Structure

Monorepo (pnpm/turborepo) with shared types between frontend and backend.

```
freshfold/
├─ apps/
│  ├─ api/                      # NestJS backend (modular monolith)
│  │  ├─ src/
│  │  │  ├─ main.ts
│  │  │  ├─ app.module.ts
│  │  │  ├─ common/             # guards, interceptors, filters, decorators
│  │  │  │  ├─ guards/ (jwt, roles, permissions, tenant)
│  │  │  │  ├─ interceptors/ (audit, logging, transform)
│  │  │  │  ├─ filters/ (http-exception)
│  │  │  │  └─ pipes/ (zod-validation)
│  │  │  ├─ config/             # env, secrets, db, redis
│  │  │  ├─ modules/
│  │  │  │  ├─ auth/
│  │  │  │  ├─ tenancy/
│  │  │  │  ├─ users/
│  │  │  │  ├─ clients/
│  │  │  │  ├─ categories/
│  │  │  │  ├─ lots/            # pickup, status, tagging, packing, deliver
│  │  │  │  ├─ reconciliation/
│  │  │  │  ├─ defects/
│  │  │  │  ├─ investigations/
│  │  │  │  ├─ billing/         # invoices, payments, ledger, credit-notes
│  │  │  │  ├─ analytics/
│  │  │  │  ├─ dashboard/
│  │  │  │  ├─ notifications/   # adapters: whatsapp, sms, email, push
│  │  │  │  ├─ portal/
│  │  │  │  ├─ support/
│  │  │  │  ├─ media/           # GCS signed urls
│  │  │  │  ├─ audit/
│  │  │  │  └─ ai/              # Aerolink Claude (future hooks)
│  │  │  ├─ jobs/               # BullMQ processors (rollups, pdf, notify)
│  │  │  └─ events/             # domain events + handlers
│  │  ├─ prisma/
│  │  │  ├─ schema.prisma
│  │  │  ├─ migrations/
│  │  │  └─ seed.ts
│  │  └─ test/ (unit, integration, e2e)
│  │
│  ├─ web/                      # React + Vite (admin + portal + super admin)
│  │  ├─ src/
│  │  │  ├─ main.tsx
│  │  │  ├─ app/ (router, providers)
│  │  │  ├─ shells/ (AdminShell, PortalShell, SuperAdminShell)
│  │  │  ├─ features/
│  │  │  │  ├─ auth/ clients/ categories/ lots/ tagging/ packing/
│  │  │  │  ├─ investigations/ billing/ analytics/ dashboard/
│  │  │  │  ├─ portal/ notifications/ users/ audit/ settings/
│  │  │  ├─ components/ (DataTable, StatCard, Chart, SignaturePad,
│  │  │  │   PhotoUploader, ReconciliationTable, Stepper, KanbanBoard…)
│  │  │  ├─ hooks/ lib/ (api client, query, zod schemas) styles/
│  │  └─ public/
│  │
│  └─ field/                    # React PWA for workers (delivery/tagger/packer)
│     ├─ src/
│     │  ├─ shells/ (FieldShell, PlantShell)
│     │  ├─ features/ (route, pickup, deliver, tagging, packing, wash)
│     │  ├─ offline/ (indexeddb queue, sync, workbox)
│     │  └─ components/ (CategoryCountGrid, SignaturePad, MapButton…)
│     └─ public/ (manifest.json, service-worker)
│
├─ packages/
│  ├─ types/                    # shared TS types/DTOs (zod)
│  ├─ ui/                       # shared design system (shadcn-based)
│  ├─ config/                   # eslint, tsconfig, tailwind preset
│  └─ sdk/                      # typed API client generated from OpenAPI
│
├─ infra/
│  ├─ docker/ (Dockerfile.api, Dockerfile.web, compose.yml)
│  ├─ nginx/ (reverse-proxy, tls)
│  ├─ gcp/ (startup scripts, terraform optional)
│  └─ scripts/ (backup.sh, restore.sh, deploy.sh)
│
├─ docs/
│  ├─ SRS.md (this doc)  ├─ openapi.yaml  ├─ er_diagram.png
│  └─ runbooks/
├─ .github/workflows/ (ci.yml, deploy.yml)
├─ turbo.json  ├─ package.json  ├─ pnpm-workspace.yaml
└─ README.md
```

---

## 25. Deployment & DevOps (GCP)

### 25.1 Environments
- **dev** (local Docker Compose), **staging**, **production** — separate GCP projects or VPCs.

### 25.2 Infrastructure (GCP)
- **Compute Engine VM** (Ubuntu 22.04, e2-standard-4 to start) running Docker Compose: api + web + field (static) + Nginx + Redis. Or split: VM for app, **Cloud SQL (Postgres)** managed, **Memorystore (Redis)**.
- **Nginx**: TLS termination (Let's Encrypt/Certbot), reverse proxy to api, static hosting for web/field, gzip, rate-limit, security headers.
- **Cloud Storage**: evidence/PDF buckets (private, signed URLs, versioned, lifecycle rules).
- **Secret Manager**: env secrets (DB, JWT keys, provider keys, Aerolink Claude key).
- **Cloud Logging/Monitoring** (or self-hosted Grafana/Loki/Prometheus).

### 25.3 CI/CD (GitHub Actions)
- On PR: lint, typecheck, unit/integration tests, build.
- On main: build Docker images → push to Artifact Registry → SSH/deploy to VM (or rolling update) → run migrations (`prisma migrate deploy`) → health check → notify.
- DB migrations gated; rollback plan documented.

### 25.4 Deploy Topology (initial single VM)
```
Internet → Nginx (443) ┬→ /api  → api container (NestJS:3000)
                       ├→ /     → web static (admin/portal)
                       └→ /app  → field PWA static
api → Cloud SQL (Postgres)  +  Memorystore (Redis)  +  GCS
Background: BullMQ workers (same VM initially; separate later)
```

### 25.5 Aerolink Claude API + Claude Code
- Backend `ai` module holds the Aerolink Claude API key in Secret Manager; never exposed to clients.
- Claude Code builds the system from this SRS; AI runtime features (forecast/OCR/bot) call Aerolink server-side.

### 25.6 Operational Runbooks
- Backup/restore, incident response, on-call alerts, scaling steps, secret rotation, certificate renewal, DB failover.

---

## 26. Appendices

### 26.1 Status Enums
- **Lot:** collected, tagged, washed, drying, ironed, packed, ready, delivered, completed.
- **Invoice:** draft, issued, partial, paid, overdue, void.
- **Investigation:** open, investigating, recovered, compensation, closed.
- **Discrepancy type:** missing, extra, unknown, found.
- **Defect type:** already_damaged, stained, burn, torn, color_fade, button_missing, zipper_broken, other.
- **Payment mode:** upi, cash, bank_transfer.
- **Business type:** hotel, hostel, pg, school, coaching, other.
- **Roles:** SUPER_ADMIN, ADMIN, DELIVERY, TAGGER, PACKER, CLIENT.

### 26.2 Reconciliation Rules (canonical)
- pickup_qty → tagging_qty → packing_qty → delivered_qty per category.
- shortfall at a transition ⇒ discrepancy(stage, missing, delta); surplus ⇒ extra/found.
- unresolved net shortfall at packing ⇒ auto-investigation (threshold configurable, default ≥ 1 billable item).
- stage attribution = first transition where qty dropped below previous stage.

### 26.3 Money & Time Rules
- All amounts stored in paise (bigint). Display = paise/100 with ₹ and Indian grouping.
- All timestamps stored UTC (timestamptz); displayed in tenant timezone (default Asia/Kolkata).
- GST rounding at invoice level; line totals kept exact.

### 26.4 Validation Formats
- Phone E.164; GSTIN 15-char regex; email RFC; lat/lng ranges; OTP 6-digit numeric.

### 26.5 Seed Data Checklist
- System roles + permissions + role_permissions.
- Category templates per business type.
- Default notification templates per channel/event.
- Demo tenant + demo client for QA.

### 26.6 Test Strategy
- Unit (services/domain), integration (DB + RLS + RBAC), e2e (critical flows: pickup→deliver, invoice, investigation), load (k6) for dashboards/route, security (OWASP/ZAP), tenant-isolation tests as a dedicated suite.

### 26.7 Open Questions / Decisions for Stakeholders
1. Per-kg vs per-item billing default per business type?
2. Compensation valuation policy (item rate vs replacement cost)?
3. WhatsApp provider (Meta Cloud API vs Gupshup) and template approval ownership?
4. Multi-branch needed at launch or post-V1?
5. Native apps timeline vs PWA-only V1?

---

**END OF MASTER SRS — v1.0**

*This document is the authoritative build specification. Hand directly to Claude Code. Build vertically by milestone (Section 21). Schema (12) and API (13) are the contracts of record.*
