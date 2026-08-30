# Onboarding Acceptance Test

The pass/fail gate for handing a new shop the keys.

[`provisioning-runbook.md`](provisioning-runbook.md) is *how to build* a tenant. This is
*how to prove it works*. Run it after Step 9 of the runbook, against the real deployment,
in order.

**The rule: every step must pass. There is no partial credit and no "we'll fix that after
launch."** A step that fails stops the handover until it is fixed and the phase is re-run.
Steps marked **[BLOCKER]** mean a failure that will cost the shop money or data, not just
annoy them.

**Time:** about 90 minutes if nothing is wrong.

**You will need:** the tenant's Render URL, the tenant's `MONGODB_URI`, the owner's Google
account (or password), a second device or browser profile, and a phone.

Record the result of each step. At the end, Phase H asks you to sign the whole thing off.

---

## Phase A — Isolation

The one thing that must never be wrong. Everything else is recoverable; a tenant wired to
Phoenix's database is a data breach in both directions.

### A1. The tenant database is empty of anyone else's data **[BLOCKER]**

Before the owner touches the system, count every collection in the tenant database:

```bash
MONGODB_URI="mongodb+srv://…tenant…" node -e "
const m=require('mongoose');(async()=>{
  await m.connect(process.env.MONGODB_URI);
  console.log('db:', m.connection.name);
  for (const c of await m.connection.db.collections()) {
    console.log(String(await c.countDocuments()).padStart(7), c.collectionName);
  }
  await m.disconnect();
})().catch(e=>{console.error(e.message);process.exit(1);})"
```

**Pass:** the database name is the tenant's, and the only non-empty collections are
`users` (1 — the seeded admin) and `settings` (0 or 1). Anything in `customers`,
`vehicles`, `workorders` or `invoices` means you are pointed at the wrong database.

> Set `MONGODB_URI` inline as shown. Do **not** rely on your local `.env` — that is
> Phoenix's production database.

### A2. The tenant's Render service points at the tenant's database **[BLOCKER]**

A1 proves the database is clean; it does not prove the *app* is using it. In the Render
dashboard, compare the `MONGODB_URI` env var against the string you just used.

**Pass:** identical, character for character, including the database name after the host.

### A3. Writes land in the tenant database, not Phoenix's **[BLOCKER]**

Sign in (Phase B first if you haven't), create a customer named `ZZ Isolation Test`, then
re-run the A1 command.

**Pass:** `customers` is now 1 in the tenant database. Then search Phoenix's own deployment
for `ZZ Isolation Test` — **Pass:** no result.

### A4. The S3 bucket is the tenant's

Upload a photo to any work order (you'll do this properly in E5). Check the bucket named in
the tenant's `S3_BUCKET_NAME`.

**Pass:** the object appears in the tenant's bucket, and no new object appears in
Phoenix's.

---

## Phase B — Access, and not being locked out

### B1. The service is up

Open `https://<tenant>.onrender.com/api/settings/company-logo` in a logged-out browser.

**Pass:** an image loads (this route is deliberately public). A 502 or a spinning tab means
the service is not up; a JSON auth error means routing is wrong.

### B2. The app loads

Open `/` logged out. **Pass:** the login screen renders, no blank page, no console errors
about failed chunk loads.

### B3. The owner can sign in

Have **the owner** do this, on their own device — not you on yours.

**Pass:** sign-in completes and lands inside the app, logged in as them.

**If the Google button does nothing at all**, that is the known failure mode from runbook
Step 5: `GOOGLE_CLIENT_ID`/`SECRET` missing or `GOOGLE_CALLBACK_URL` not matching the
registered redirect URI. Passport only warns, so the logs will look clean.

### B4. The owner's account is a real admin

As the owner, open the admin panel and confirm you can see the user list.

**Pass:** the seeded account shows role `admin` and status `active` (the seed creates it
`pending`; first Google sign-in flips it). A still-`pending` account means B3 did not
actually link.

### B5. There are two ways into the shop **[BLOCKER]**

**Password reset is broken.** `authController` builds the reset link as `/api/v1/users/…`
but auth mounts at `/api/users` — the link 404s, and the email body is unedited tutorial
boilerplate. Assume nobody can self-recover.

So the shop must not have a single point of failure for access. **Pass** requires *both*:

- [ ] At least **two** accounts with role `admin`, owned by two different people.
- [ ] Every admin signs in with **Google** (no password-only admin, because a forgotten
      password cannot be reset).

Verify by having the second admin sign in successfully on their own device.

### B6. A non-admin is actually restricted

Sign in as a `technician` account.

**Pass:** no admin panel, no Settings, and no user management. A technician seeing Settings
means role enforcement is not working and Phase B fails.

---

## Phase C — The shop is the shop, not Phoenix

A fresh `Settings` document defaults to Phoenix's real name, address, phone, email, website
and logo. This is the single most likely thing to be wrong at handover, and the shop is the
one who finds out — in front of a customer.

### C1. No Phoenix anywhere in the UI **[BLOCKER]**

Walk the app header, Settings, and the customer-facing screens.

**Pass:** the tenant's name and address, everywhere. Zero occurrences of "Phoenix", the
Phoenix address, phone, email, website, or logo.

### C2. No Phoenix on a printed invoice **[BLOCKER]**

Generate a real invoice (from E6) and **export the PDF**. Open the PDF itself — not the
on-screen preview.

**Pass:** the tenant's name, address, phone and logo on the printed document. This is a
separate check from C1 because PDFs render their own header from the same settings, and a
missing logo upload shows up here first.

### C3. Dates are in the shop's timezone

Create an appointment for a known wall-clock time and reload.

**Pass:** the time displays as the shop's local time.

**If it's wrong:** `TIMEZONE` (server) and `REACT_APP_TIMEZONE` (client) both need setting.
`REACT_APP_*` is **baked in at build time** — fixing it needs a *rebuild*, not a restart.
Budget for that before declaring the phase failed.

---

## Phase D — The app admits what it cannot do

The detail shop is launching with SMS dark, and possibly email too. A dark channel must
*hide itself*, not fail in the user's face. This phase verifies the gates match reality in
both directions — a hidden channel you paid for is as much a failure as an advertised
channel that doesn't work.

First, write down what is actually configured in Render:

| Channel | Configured? | Credential |
|---|---|---|
| SMS | yes / no | `TWILIO_ACCOUNT_SID` starts with `AC` |
| Email | yes / no | `SENDGRID_API_KEY` starts with `SG.` **and** `EMAIL_FROM` set |

Then check each row against the UI.

### D1. The customer form offers exactly the live channels

Open **new customer**.

**Pass:** the Communication Preference dropdown lists SMS only if SMS is configured, Email
only if email is configured, and always Phone and None.

### D2. New customers default to a channel that works

**Pass:** on the same form, the pre-selected preference is SMS if configured, otherwise
Email if configured, otherwise **Phone** — never a channel that is off.

### D3. The appointment Communication card matches

Open any appointment.

**Pass:** the Communication card (Reminder Status + Send Reminder) is **visible** if either
channel is live, and **absent entirely** if neither is. Not greyed out — absent.

### D4. File Share matches email

Open a work order with an attached file.

**Pass:** the **Share** button is present if email is configured, absent if not.

### D5. A configured channel actually sends **[BLOCKER, if configured]**

Skip any row that is deliberately dark. For each channel you *did* configure:

- **Email:** share a file to your own address. **Pass:** it arrives, from the tenant's
  `EMAIL_FROM`, not in spam.
- **SMS:** send an appointment reminder to your own phone. **Pass:** it arrives.

**A channel that is configured but whose UI is hidden is a malformed credential**, not a
code problem — the gates check credential *shape*, not presence. A channel whose UI shows
but which errors on send is a real misconfiguration. Either way, this step fails.

### D6. Existing preferences survive a dark channel

Only if you are launching with SMS dark: open a customer whose preference is already SMS
(create one via the API, or skip if none exist).

**Pass:** SMS is still shown and still selected. Editing and saving the customer must not
silently move them to a different channel.

---

## Phase E — The work the shop actually does

One unbroken pass through the core workflow. Do this as a `service-writer`, not as admin —
that is who will really be using it.

Each step passes only if the record persists after a **page reload**.

- **E1.** Create a customer, with a real phone and email.
- **E2.** Add a vehicle to that customer — year, make, model, VIN.
- **E3.** Book an appointment for that vehicle.
- **E4.** Create a work order from the appointment.
- **E5.** Upload a photo to the work order. **Pass:** the thumbnail renders after reload
  (this is the real S3 test — an upload that appears to succeed but 404s on read means
  the bucket policy is wrong).
- **E6.** Add parts and labor. **Pass:** the total is arithmetically correct.
- **E7.** Move the work order through to `Completed`, then generate an invoice.
  **Pass:** the invoice total matches the work order.
- **E8.** Export the invoice PDF. **Pass:** it opens and is correct. (Feeds C2.)
- **E9.** Reload the dashboard. **Pass:** the completed job appears where the shop expects
  it.

**Then clean up:** delete `ZZ Isolation Test` and any other test records. **Pass:** the
shop starts on a clean database, not one seeded with your debris.

---

## Phase F — Data durability **[BLOCKER]**

A detail shop that loses its work orders loses its business. An untested restore is not a
backup. Do not skip this because it is the boring phase — it is the phase that matters most
and the only one that is genuinely hard to do later.

> **`backup-database.js` has no `--uri` flag.** Unlike `seed-admin.js`, it reads
> `MONGODB_URI` from `.env` and nothing else. Always set it inline, as below, or you will
> back up — or worse, **restore over** — your own production database.

### F1. A backup can be taken

```bash
MONGODB_URI="mongodb+srv://…tenant…" node scripts/backup-database.js
```

**Pass:** `backups/<timestamp>/` contains a `.json` per collection, and `customers.json`
holds the records you expect.

### F2. A restore actually restores **[BLOCKER]**

Do this **before** the shop has real data, because restore is destructive.

1. Take a backup (F1).
2. In the app, delete a customer.
3. Restore just that collection:
   ```bash
   MONGODB_URI="mongodb+srv://…tenant…" node scripts/backup-database.js --restore backups/<timestamp>/customers.json
   ```
   It prints a warning and waits 5 seconds — it **drops and recreates** the collection.
4. Reload the app.

**Pass:** the deleted customer is back, and nothing else changed.

> Restore drops the collection, which drops its indexes. The app recreates them on boot
> (`addDatabaseIndexes.js`), so **restart the service after any restore** and confirm the
> app still loads.

### F3. Someone other than you can run a restore

Write the two commands above into a note the owner keeps, with the tenant URI, and confirm
they know where it is.

**Pass:** the shop is not dependent on you being reachable to recover. If only you can
restore, the backup only half exists.

### F4. Atlas backups are on

Check the tenant's Atlas cluster backup tier.

**Pass:** either scheduled snapshots are enabled, **or** you have written down, and told the
owner, that recovery depends entirely on someone running F1 by hand — and how often that
will happen.

---

## Phase G — Under real conditions

### G1. It works on a phone

Open the app on a phone, on cellular, not shop wifi. Complete E1–E3.

**Pass:** usable. A detail shop works standing next to a car, not at a desk.

### G2. It's still up after being left alone

If the service is on Render's `free` tier it spins down when idle. Leave it 20 minutes,
then load it cold and time it.

**Pass:** either the tier is paid, or the owner has been told and accepted that the first
load of the morning takes ~30–50 seconds. An unwarned shop reads this as "the system is
broken."

### G3. Two people at once

Owner and one staff member, both signed in, both editing different work orders.

**Pass:** neither sees the other's session, neither gets logged out.

---

## Phase H — Sign-off

The onboarding is a **success** only when all of the following are true. Fill this in.

- [ ] Every step above passed. No step was skipped as "probably fine."
- [ ] Every **[BLOCKER]** passed: A1, A2, A3, B5, C1, C2, D5 (for configured channels),
      F2.
- [ ] Test data has been deleted (E cleanup).
- [ ] The owner has personally signed in, on their own device, and created one real record.
- [ ] The owner knows which features are dark, and roughly when they will light up.
- [ ] The owner has the restore note (F3).
- [ ] Anything that surprised you during this run is written into
      [`provisioning-runbook.md`](provisioning-runbook.md) — this is the first real
      provision, so expect at least one.

| | |
|---|---|
| Tenant | |
| Deployment URL | |
| Run by | |
| Date | |
| Channels live at handover | SMS: ☐ Email: ☐ |
| Result | **PASS** / **FAIL** |

---

## Known to fail — do not treat these as test failures

Real defects, already understood, deliberately out of scope for this gate. They are
recorded so nobody spends an afternoon rediscovering them.

- **Password reset is broken end to end.** Wrong URL path (`/api/v1/…` vs `/api/users/…`)
  and boilerplate email copy. Mitigated by B5, not fixed.
- **Invoice-by-email does not exist.** `POST /api/invoices/:id/send` replies
  `"Invoice would be sent to … in production"` and sends nothing; the client never calls
  it. Do not test it, and do not promise it to the shop.
- **Shared-media emails carry placeholder details** — `"Customer"` and
  `"2023 Unknown Unknown"` rather than the real customer and vehicle. The link works; the
  wording is wrong. Don't let the shop send one to a customer yet.
- **`sendCompletionNotification` is dead code**, never called from anywhere.
- **No tenant teardown procedure exists.** If this onboarding is abandoned, destroying the
  database, bucket and service is a manual job nobody has written down.
