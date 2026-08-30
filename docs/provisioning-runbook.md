# Tenant Provisioning Runbook

Standing up a new shop on Phoenix CRM, start to finish.

The SaaS model is **one deployment + one database per tenant** — no shared infrastructure,
no `tenantId` scoping, no cross-tenant query risk. See [`saas-roadmap.md`](saas-roadmap.md)
for why. The practical consequence is that provisioning is this checklist, and the only
thing that differs per tenant is configuration: company identity lives in `Settings` as
data, so there is no per-customer fork of the code.

**Done when:** the shop is live from this document alone, with zero hand-written Mongo
inserts.

---

## Step 0 — Start the lead-time items *first*

These three are gated by other people's approval queues and take days to weeks. Start them
before you touch any infrastructure, or you will finish the deploy and then wait.

| Item | Blocks | Notes |
|---|---|---|
| **Twilio A2P 10DLC** | SMS reminders | US application-to-person SMS requires brand + campaign registration, **per tenant**. Real approval lead time. |
| **SendGrid sender identity** | All outbound email | Each tenant's `EMAIL_FROM` needs verification. Prefer domain authentication over a single-sender Gmail — deliverability is much better. |
| **Google OAuth consent screen** | Sign-in at scale | An unverified app caps at 100 users and shows a prominent security warning. Public use needs Google's review, which takes weeks. |

The deployment works without all three — Twilio and SendGrid are gated and fail per-call
with a 503 rather than at boot. You just ship with SMS and email dark until they clear.

**A dark channel hides itself.** The server reports which channels have credentials, and
the client removes the UI that depends on them: SMS and Email drop out of the customer
Communication Preference dropdown (new customers default to Phone instead), the
appointment Communication card disappears, and file Share buttons disappear. Nothing is
greyed out and nothing 503s in the user's face — the shop simply never sees a feature it
cannot use. Switching a channel on later is env vars plus a restart, no code change and no
rebuild; the UI reappears on the next page load.

---

## Step 1 — MongoDB Atlas

1. Create a **new cluster or database dedicated to this tenant**. Never point two tenants
   at one database — the whole isolation argument rests on this.
2. Create a database user scoped to that database only.
3. Network access: allow Render's egress. `0.0.0.0/0` with a strong password is the usual
   pragmatic choice on Render's free/starter tiers, which don't offer static outbound IPs.
4. Copy the `mongodb+srv://...` connection string. This is `MONGODB_URI`.

> Indexes are created by the app on boot (`src/server/utils/addDatabaseIndexes.js`) — no
> manual index setup.

## Step 2 — AWS S3

Media uploads (work order photos, receipts, company logo) need a bucket.

- Either a **per-tenant bucket**, or a per-tenant prefix in a shared bucket. Per-tenant
  bucket is cleaner and matches the isolation model.
- Create an IAM user with read/write access limited to that bucket.
- Note `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET_NAME`.

If you skip this, the app boots fine and every upload returns a 503.

## Step 3 — Create the Render service

1. Copy [`render.yaml`](../render.yaml) and change the service name in **both** places
   marked `TENANT NAME`. They must match. A missed rename fails blueprint validation
   loudly rather than misconfiguring the tenant silently.
2. Create the service from the blueprint, pointed at this repo.
3. Pick a plan — `free` instances spin down when idle, which a paying shop will notice.

`JWT_SECRET` is generated per-service by Render. `CLIENT_URL` is wired to the service's
own `RENDER_EXTERNAL_URL`. Everything else marked `sync: false` you set by hand next.

## Step 4 — Set the environment variables

In the Render dashboard, fill in every `sync: false` var from Steps 1–2 plus
`GEMINI_API_KEY`. [`.env.example`](../.env.example) is the authoritative list of names.

Two that are easy to get wrong:

- **`EMAIL_FROM`** — not `SENDGRID_FROM_EMAIL`. Email is gated on `SENDGRID_API_KEY`
  starting with `SG.` **and** `EMAIL_FROM` being set; miss either and every send 503s.
- **`REACT_APP_TIMEZONE`** — read by the React build, so it is baked in at build time.
  Changing it later needs a **rebuild**, not a restart. Set it alongside the server-side
  `TIMEZONE` before the first build if the shop isn't in `America/New_York`.

Deploy, and confirm the service comes up. The app boots even with Twilio/SendGrid/S3
unset, so a boot failure here means something structural — usually `MONGODB_URI`.

## Step 5 — Google OAuth callback

Chicken-and-egg: the callback URL contains the deployment's own hostname, which doesn't
exist until Step 3.

1. Take the service URL from Render, e.g. `https://acme-auto.onrender.com`.
2. Set `GOOGLE_CALLBACK_URL` to `<that URL>/api/auth/google/callback`.
3. Register the **identical** URL in the Google Cloud console as an authorized redirect
   URI, under the same OAuth client as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
4. Redeploy so the new value is picked up.

> Passport only *warns* when `GOOGLE_CLIENT_ID`/`SECRET` are missing
> (`src/server/config/passport.js`). A misconfigured tenant therefore presents as a login
> button that does nothing — not as an error in the logs. If sign-in silently fails, check
> these first.

## Step 6 — Seed the first admin

A fresh database is a locked door: self-registration is disabled, creating users needs an
authenticated admin, and OAuth rejects emails with no matching user.
[`scripts/seed-admin.js`](../scripts/seed-admin.js) is the only way in.

Run it locally, against the tenant's database:

```bash
# Dry run first — prints the host and database it would write to.
node scripts/seed-admin.js --email owner@shop.com --uri "mongodb+srv://..."

# Then execute.
node scripts/seed-admin.js --email owner@shop.com --uri "mongodb+srv://..." --execute
```

> **Always pass `--uri`.** Without it the script falls back to `MONGODB_URI` in your local
> `.env` — which is your own production database. The dry run prints the target host and
> database name; read that line before adding `--execute`.

Default mode creates a **`pending`** admin with no password, which activates when that
person first signs in with Google. The email must be a real Google account. For a shop
that doesn't use Google accounts, pass `--password 'S3cret!!'` to create an `active`
password admin instead.

The script refuses a database that already has users unless `--force` — existing users
almost always mean the URI points at the wrong tenant. That guard is doing real work; if
it fires, stop and check the URI rather than reaching for `--force`.

## Step 7 — First sign-in

Have the owner sign in at the deployment URL. With the default (Google) mode, passport
matches on email, links their `googleId`, and flips `pending` → `active` automatically.

## Step 8 — Set the company identity

**Do not skip this.** A new tenant boots branded as Phoenix: `Settings` defaults
`companyName` to `'Phoenix Automotive Group, Inc.'` along with the real street address,
phone, email, website, and logo. This shows in the app header **and on printed invoices
and quotes** — a new shop will hand a customer an invoice with another business's name and
address on it.

In **Settings**, set:

- Company name
- Address lines 1 and 2
- Phone, email, website
- Company logo (uploads to S3, then serves from `/api/settings/company-logo`)

Then print one invoice to PDF and look at it before letting the shop use the system.

## Step 9 — Invite staff

From the admin panel, create the rest of the users with appropriate roles: `admin`,
`management`, `service-writer`, `technician`.

---

## Verification checklist

A quick smoke pass. **The real gate is
[`onboarding-acceptance-test.md`](onboarding-acceptance-test.md)** — run that in full
before handing the shop the keys. It covers tenant isolation, lock-out risk, backup
restore and the capability gates, none of which this list proves.

- [ ] Service boots; `/` loads the app.
- [ ] Google sign-in completes and lands logged in.
- [ ] Company name and address are the tenant's, in the header **and on a printed invoice**.
- [ ] Dates display in the shop's local timezone (check an appointment time).
- [ ] Upload a photo to a work order — exercises S3.
- [ ] Send a test email — exercises SendGrid and the sender identity.
- [ ] Send a test SMS — exercises Twilio and A2P registration.
- [ ] Create a customer → vehicle → work order → invoice end to end.
- [ ] Confirm the comms UI matches the credentials you actually set: open a customer form
      and check the Communication Preference options, and an appointment for the
      Communication card. A configured channel that stays hidden means the credential is
      malformed — the gates check shape (`AC…` / `SG.…`), not mere presence.

Anything gated on Step 0 approvals is hidden rather than broken. A channel you *have*
configured that still 503s is a real misconfiguration; a channel you have not configured
should show no UI at all.

---

## Known gaps

Recorded here rather than lost — these are real and unresolved as of this document.

- **No tenant teardown procedure.** Offboarding a shop (data export, then destroying the
  database, bucket, and service) is not written down.
- **No automated backup policy per tenant.** Atlas backup tiers are a per-cluster choice
  nobody has standardised.
- **The branding default is a footgun, not a feature.** Defaulting `companyName` to a real
  business means every new tenant starts wrong and depends on Step 8 being followed. The
  roadmap tracks neutralising these defaults as Phase 2 item 1; until then this runbook is
  the only thing standing between a new shop and mislabelled invoices.
- **This runbook has not yet survived a real provision.** It is derived from the code, not
  from a completed dry run. Expect the first real tenant to turn up at least one step
  nobody wrote down — fix it here when it does.
