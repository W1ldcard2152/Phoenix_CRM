# Phoenix CRM → SaaS: Roadmap

**Status:** Proposal, not yet build-of-record.
**Written against:** commit `17e1c0e`, branch `shop-supplies-module`, 2026-08-08.

---

## 1. Where we actually are

Verified against the working tree, not assumed:

| Fact | Evidence |
|---|---|
| No multi-tenancy of any kind | No `tenantId` on any of the 20 models in `src/server/models/` |
| `Settings` is a hard singleton | `Settings.getSettings()` → `findOne()` with no filter (`Settings.js:157`) |
| 340 DB query sites across 34 files | Blast radius for any tenant-scoping refactor |
| No billing code | No `stripe` in `package.json`, no subscription model |
| No signup | Self-registration deliberately disabled (`authRoutes.js:7-9`) |
| Fresh DB cannot be logged into | OAuth rejects unknown emails (`passport.js:48-49`); no seed script |
| S3 keys are flat, no tenant prefix | `${uuid}-${safeName}` at bucket root (`s3Service.js:46`) |
| 10 test files total | Thin regression safety for a large refactor |
| New tenants boot branded as Phoenix | `Settings.js:120-130` defaults to your name, address, phone |

The one genuine asset: **company identity is already data, not code.** Name, address,
phone, email, website, and logo live in Settings and are editable in-app. No fork
needed per customer.

---

## 2. The fork in the road

Everything downstream depends on this one call.

### Option A — Silo: one deployment + one database per tenant

- **Cost:** ~$7–25/mo per tenant (Render + Atlas)
- **Isolation:** absolute. Cross-tenant data leakage is physically impossible.
- **Restore:** trivial — drop one database back, nobody else is affected.
- **Ceiling:** starts hurting around 10–20 tenants (N deploys, N migrations, N of everything)
- **Refactor cost:** zero. This is what exists today.

### Option B — Pooled: single app, `tenantId` on every document

- **Cost:** near-zero marginal per tenant
- **Isolation:** every one of the 340 query sites is a potential PII leak between shops
- **Prerequisites:** compound indexes on every collection, a control plane, and far
  more test coverage than 10 files
- **Ceiling:** hundreds of tenants
- **Refactor cost:** months, all of it before the first dollar

### Recommendation: **Silo now. Revisit at ~10 paying tenants.**

Rationale: the thing being sold is a CRM full of other people's customer PII. A pooled
refactor across 340 call sites, with 10 test files as a safety net, is the single
highest-risk thing that could be done to this codebase — and it would be done
speculatively, before knowing whether anyone will pay. Silo trades money (real, small,
predictable) for risk (existential, unbounded). Take that trade.

**But design the seam now.** Build the tenant registry in Phase 3 even while siloed. A
registry that maps tenant → deployment is also the migration control plane if Option B
ever becomes necessary. That's what keeps this a decision rather than a trap.

---

## 3. Phases

### Phase 0 — Unblock the dry run
*Effort: half a day*

1. `scripts/seed-admin.js` — bootstrap the first admin into an empty DB (insert
   `role: 'admin'`, `status: 'pending'`, no password; Google login flips it to active
   via `passport.js:35-45`)
2. Fix two wrong env var names in `.claude/CLAUDE.md` — code reads `S3_BUCKET_NAME`
   (`s3Service.js:7`) and `EMAIL_FROM` (`emailService.js:8`); both are documented under
   the wrong names, and both fail *silently* on a fresh deploy
3. Fix `render.yaml` — it hardcodes `name: phoenix-crm` (blocks a second blueprint
   deploy) and omits the AWS, Gemini, Google OAuth, and email vars entirely
4. `docs/provisioning-runbook.md` — the ordered checklist

**Done when:** the detail shop is stood up end-to-end from the runbook with no
hand-written Mongo inserts.

### Phase 1 — Make provisioning repeatable
*Effort: 1–2 weeks*

1. `scripts/provision-tenant.js` — create DB, seed Settings, seed admin, print the
   env block to paste into Render
2. Per-tenant S3 isolation — own bucket, or a `tenant-id/` key prefix. Flat UUID keys
   today make per-tenant export, deletion, and audit impossible
3. Per-tenant backup **with a verified restore** — `scripts/backup-database.js` exists;
   an untested restore is not a backup
4. **A staging environment.** Today push-to-main deploys straight to production. The
   moment someone else's business runs on this, that is no longer acceptable
5. Uptime monitoring + error reporting (Sentry or equivalent)

**Done when:** a new tenant takes <30 minutes, and a tenant can be restored from backup.

### Phase 2 — De-Phoenix the product
*Effort: 2–4 weeks*

1. Strip Phoenix defaults from `Settings.js:120-130`. **A new tenant currently boots up
   displaying your company name, address, and phone number** — on screen and on printed
   invoices. This is the most embarrassing possible demo bug
2. Make work order statuses configurable. They're hardcoded in the model; a detail shop
   has no use for `Parts Ordered`
3. First-run setup wizard to replace manual Settings configuration
4. Generic app name, logo, favicon, PWA manifest (see `PWA_SETUP.md`)
5. Audit the client for hardcoded branding

**Done when:** a stranger can complete setup and the product never says "Phoenix."

### Phase 3 — The commercial layer
*Effort: 3–6 weeks*

1. **Tenant registry / control plane** — the thing you own: tenants, status, plan,
   deployment pointer. Build this even while siloed (see §2)
2. Billing — Stripe subscriptions, trial, dunning. Nothing exists today
3. Signup → provision flow. Human-in-the-loop is a fine v1
4. Plan gating / seat limits
5. Terms of service, privacy policy, and a data-processing stance. You will be holding
   other businesses' customer PII under a commercial agreement
6. A support channel with an SLA you can personally sustain as a solo developer

**Done when:** someone you've never met can pay and be running.

### Phase 4 — Pooled multi-tenancy
*Only if you outgrow silo. Revisit at ~10 tenants.*

Test coverage first, then `tenantId` on all 20 models, scope all 340 query sites,
compound indexes everywhere, migrate tenants in one at a time.

---

## 4. Operational blockers that bite late

These are not phase work; they are lead-time items. Start them early because they are
gated by third parties, not by code.

- **Twilio A2P 10DLC.** US application-to-person SMS requires brand and campaign
  registration. Per tenant. This has a real approval lead time and will silently block
  SMS reminders for a new shop.
- **SendGrid sender identity.** Each tenant's `EMAIL_FROM` needs verification, and
  deliverability is much better with domain authentication than a Gmail sender.
- **Google OAuth consent screen.** An unverified app is capped at 100 users and shows
  users a prominent security warning. Going public requires Google's verification
  review, which takes weeks.
- **Deploy discipline.** Push-to-main = deploy, and the CHANGELOG is calver-by-date.
  That works fine for a shop you own. It does not work when a stranger's Monday morning
  depends on it.
- **Data loss is existential for the customer, not just embarrassing for you.** A detail
  shop that loses its work orders loses its business. This is the liability that
  justifies Phase 1 item 3 over any feature work.

---

## 5. Suggested sequence

Phase 0 immediately — it is half a day and unblocks the dry run.

Then **Phase 2 before Phase 3.** Getting the product to stop calling itself Phoenix is
cheaper than billing infrastructure and is the actual prerequisite for showing it to
anyone who isn't a friend. Bill your friend nothing, learn from a real shop using it
daily, and build the commercial layer once you know the product survives contact.

Phase 1 runs alongside whichever of those is active — especially backups, which should
not wait for a paying customer.
