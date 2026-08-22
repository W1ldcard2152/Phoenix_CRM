# SaaS Onboarding — Context Transfer

**Written:** 2026-08-16 (supersedes the 2026-08-15 version of this file, which was written
before Phase 0 was done)
**Written against:** `saas-onboarding` @ `e30ccbc`, `main` @ `e961a5c`
**For:** an agent picking up the SaaS/multi-tenant track with no prior context

Everything below was verified against the working tree, not assumed. Where something is
inferred or unproven, it says so.

---

## 1. The situation in one paragraph

The user is onboarding **a friend's newly-opened detail shop** onto Phoenix CRM as the
first external tenant. That is the forcing function for all of this work — it is not a
speculative SaaS build. Phase 0 of [`saas-roadmap.md`](saas-roadmap.md) is **complete and
committed**. The current task is to stop the app from advertising communication features
that a fresh tenant cannot use, because SMS is blocked behind a multi-week Twilio approval
and will not be ready for launch.

---

## 2. Branch state — read this before touching anything

| Branch | Tip | State |
|---|---|---|
| `saas-onboarding` | `e30ccbc` | **Current work.** `main` merged in, Phase 0 done, 2 unpushed commits. |
| `main` | `e961a5c` | Behind. **Still carries the broken Twilio init.** Ahead of `origin/main` by 2, unpushed. |
| `shop-supplies-module` | `15db9c6` | Stale, superseded, ignore. |

The 26-commit gap the previous handoff warned about is **closed** — `main` was merged into
`saas-onboarding` at `5c1a829`, cleanly, no conflicts.

**`main` still cannot boot without Twilio credentials.** The guard exists only on
`saas-onboarding`. Verify with:

```bash
node -e "require('./src/server/services/twilioService'); require('./src/server/services/emailService'); console.log('boot ok')"
```

On `saas-onboarding` this prints two warnings then `boot ok`. On `main` it crashes with
`Error: username is required` from `BaseTwilio.js:42`. Merging `saas-onboarding` back to
`main` fixes trunk; the user has been told and has not yet decided when.

**Never `git push`** — blocked deliberately (`.claude/settings.local.json`, commit
`bc0b49a`). Say when something is ready; leave the push to the user.

---

## 3. What Phase 0 delivered (done, committed, verified)

Two commits on `saas-onboarding`:

- **`8bfc954`** — Fixed work order interaction notes. Three handlers in
  `DocumentDetail.jsx` used `process.env.REACT_APP_API_URL || 'http://localhost:5000/api'`.
  That var is only ever set in the gitignored `src/client/.env`, so **every deployment
  including Phoenix's own** sent add/edit/delete of interaction notes to localhost. They
  also omitted the auth cookie. Now routed through the `workOrderNotesService` the file
  already imported. **User verified in browser** — 201/200/200 with clean refetches.
- **`e30ccbc`** — Tenant provisioning:
  - [`render.yaml`](../render.yaml) rewritten. 21 env vars (was 8), service name reduced
    to two marked `TENANT NAME` spots that must match, Node 18 → 22. YAML parse-validated.
  - [`docs/provisioning-runbook.md`](provisioning-runbook.md) — nine ordered steps, Atlas
    through staff invites, with a verification checklist and a known-gaps section.
  - `.claude/CLAUDE.md` + `.env.example` corrected against actual `process.env` reads.

### Corrections to the previous handoff, now settled

- `S3_BUCKET_NAME` **is correct** ([`s3Service.js:7`](../src/server/services/s3Service.js#L7)).
  `saas-onboarding` had "fixed" it to `AWS_BUCKET_NAME`, which was a regression; the merge
  reverted it, which was lucky rather than intentional. Do not re-break this.
- `EMAIL_FROM` was the only genuinely wrong name. Fixed.
- **`API_URL` is dead.** Its only reader is `Media.generateSharingLink()`, which is never
  called (sole reference is commented out at
  [`Media.js:104`](../src/server/models/Media.js#L104)) and points at `/media/shared/`,
  which is not a mounted route. Deliberately **not** added to `render.yaml`.
- `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`, `LOG_LEVEL` were removed from `.env.example` —
  nothing reads them, the limits are hardcoded at
  [`app.js:103-118`](../src/server/app.js#L103-L118).

---

## 4. ~~THE CURRENT TASK~~ — hide unconfigured communication channels **[DONE, uncommitted]**

> **Status 2026-08-21:** implemented and committed. Server:
> `src/server/utils/capabilities.js` is now the single source of truth for both gates;
> `twilioService`/`emailService` import from it; `GET /api/settings` returns
> `data.capabilities: { sms, email }`; the `Customer.communicationPreference` schema default
> is a function that picks the best live channel. Client: `useCapabilities()` /
> `useCapabilitiesLoaded()` on `CompanyContext` (no new request — it already fetched
> settings), `utils/communicationChannels.js` for the shared filtering, and the four
> surfaces below are gated. Verified: boot check passes, 13 suites / 401 tests pass, client
> build exits 0 with no new warnings, and the capability matrix was exercised for all four
> credential combinations. **UI still needs the user's browser pass.**
>
> Not done here: the invoice/media email call sites are untouched because there is nothing
> to gate (see the correction in §5), and password reset (§5) is still broken.

### The decisions, already made by the user. Do not relitigate.

1. **Ship dark, both channels.** Treat SMS *and* email as unconfigured for the detail shop
   at launch, but assume both get switched on within a month or two — so favour a design
   that **flips on cleanly via config**, with no code change at switch-on time.
2. **Hide, don't disable.** The server reports which channels are configured; the client
   hides the affected UI entirely. Not greyed-out buttons with explanatory text.

### The hard constraint that shapes the whole design

**You cannot delete this code.** The same codebase serves Phoenix's own deployment, which
does use SMS. Every change must be **per-deployment and self-configuring**, driven by
whether that deployment has credentials — never a static removal.

This is also why the design must be capability-driven rather than a build-time flag: the
same build serves both tenants.

### What already exists to build on

Both services already compute exactly the boolean needed, they just don't export it:

- [`twilioService.js`](../src/server/services/twilioService.js) — `smsEnabled`, gated on
  `accountSid && authToken && accountSid.startsWith('AC')`
- [`emailService.js`](../src/server/services/emailService.js) — `emailEnabled`, gated on
  `apiKey.startsWith('SG.') && fromEmail`

Suggested shape (not prescriptive): export those, expose them on an existing settings/config
endpoint as `capabilities: { sms, email }`, fetch once on the client, gate the surfaces in
§4.1. Check whether `Settings.getSettings()` or the auth `/me` payload is the more natural
carrier — the client already fetches both, so no new request is needed.

### 4.1 The doors that open to the void

Verified by reading each call site.

| Surface | Without credentials | Action |
|---|---|---|
| [`AppointmentDetail.jsx:348-366`](../src/client/src/pages/Appointments/AppointmentDetail.jsx#L348-L366) — "Communication" card: *Reminder Status* + **Send Reminder** | 503, clear message | **Hide the card** when neither channel is on |
| `communicationPreference` default `'SMS'` — [`CustomerForm.jsx:66`](../src/client/src/pages/Customers/CustomerForm.jsx#L66), [`CustomerStep.jsx:170`](../src/client/src/components/wizard/steps/CustomerStep.jsx#L170), [`CustomerSection.jsx:167`](../src/client/src/pages/Intake/sections/CustomerSection.jsx#L167) | **Silent.** Every customer defaults to a dead channel | Drop unavailable options from the dropdown; default to one that works |
| Automatic status-update notifications, [`workOrderController.js:414`](../src/server/controllers/workOrderController.js#L414) + [`:675`](../src/server/controllers/workOrderController.js#L675) | Logged server-side, invisible in UI | No UI to hide; the preference fix covers it |

The model default is also `'SMS'` ([`Customer.js:35`](../src/server/models/Customer.js#L35)) —
decide whether to change the schema default or only the three form defaults. The schema
default affects API-created customers too.

**Leave alone:** [`CustomerInteractions.jsx:266`](../src/client/src/components/workorders/CustomerInteractions.jsx#L266)'s
"💬 Text Message". That is a **manual log** of a text a human already sent from their own
phone. It works fine with no Twilio and is genuinely useful to the shop.

---

## 5. Ground truth on communications — the user's hunch, corrected

The user said: *"I'm pretty sure we only ever added them as placeholders, I don't think we
actually built an automated communication system, or if we did we never wired it into
anything."*

**Substantially right, with one consequential exception.** Audited in full:

**There is no automated communication system.** No scheduled reminders, no drip, no queue.
The only cron job is [`appointmentCompleteJob.js`](../src/server/jobs/appointmentCompleteJob.js),
which marks stale appointments Completed daily at 6pm ET and **sends nothing**. Every send
in the codebase is triggered synchronously by a user action.

**SMS — thin, as the user thought:**

| Function | Called from |
|---|---|
| `sendStatusUpdate` | `workOrderController` :414, :675 (both in try/catch, swallowed) |
| `sendAppointmentReminder` | `appointmentController` :185 (swallowed), :521 (**not** wrapped — propagates a clean 503) |
| `sendCompletionNotification` | **Never called. Dead code.** Also the only caller of `sendMMS`. |

**Email — considerably more wired than the user believes. This is the exception:**

| Function | Called from | Notes |
|---|---|---|
| `sendEmail` | [`authController.js:174`](../src/server/controllers/authController.js#L174) | **Password reset.** Not optional. |
| ~~`sendInvoice`~~ | ~~`invoiceController.js:451`~~ | **Wrong — see correction below. Dead code.** |
| `shareMedia` | `mediaController.js:275` | A real, user-facing feature |
| `sendAppointmentConfirmation` | `appointmentController` :195, :534 | |

> **Correction, 2026-08-21.** `sendInvoice` is **not** called. The line at
> [`invoiceController.js:451`](../src/server/controllers/invoiceController.js#L451) is
> inside a `/* … */` block — a grep hit, not a call. `sendInvoiceViaEmail` just replies
> `"Invoice would be sent to … in production"` and never touches SendGrid, and its client
> wrapper `InvoiceService.sendViaEmail` has **zero callers**. There is no invoice-by-email
> feature to lose. `shareMedia` is genuinely live
> ([`DocumentDetail.jsx:1296`](../src/client/src/pages/Documents/DocumentDetail.jsx#L1296),
> [`TechnicianWorkOrderDetail.jsx:172`](../src/client/src/pages/TechnicianPortal/TechnicianWorkOrderDetail.jsx#L172)),
> though it emails placeholder customer/vehicle details (`"Customer"`,
> `"2023 Unknown Unknown"`) rather than the real ones — a separate latent bug.

So "ship with email dark" costs **file sharing and appointment confirmation emails**, not
invoicing. That is a much smaller call than the pre-correction list suggested. It is also
no longer a code question at all: the gating is capability-driven, so turning email on is
three env vars and a restart. The remaining decision is purely whether to do the SendGrid
sender identity before launch (roughly same-day, unlike Twilio's A2P 10DLC).

### Landmine: password reset is broken regardless

[`authController.js:167-171`](../src/server/controllers/authController.js#L167-L171) builds
the reset URL as `/api/v1/users/resetPassword/...`, but auth routes are mounted at
`/api/users` ([`app.js:158`](../src/server/app.js#L158)) — there is no `/api/v1`. The email
body is also unmodified tutorial boilerplate telling the user to *"Submit a PATCH request
with your new password"*.

**Password reset therefore does not work even with SendGrid configured.** For the detail
shop this is survivable because `seed-admin.js` defaults to Google sign-in, and Google
users never need it — but it must not be the shop's only path back in. Either fix it, or
make sure every user there is on Google OAuth. Not yet raised with the user.

---

## 6. What comes after this task

From [`saas-roadmap.md`](saas-roadmap.md) §3, filtered to what matters for a real friend's
business rather than for strangers paying:

1. **Backups with a verified restore** (Phase 1 item 3). `scripts/backup-database.js`
   exists; an untested restore is not a backup. The roadmap's own framing: a detail shop
   that loses its work orders loses its business. **This is the highest-value remaining
   item** and was offered to the user, who redirected to the comms work first.
2. **Staging.** Push-to-main deploys straight to production. Fine for the user's own shop,
   not fine when someone else's Monday depends on it.
3. **The first real provisioning dry run**, which is what actually validates the runbook
   and `render.yaml` — neither has met a live Render deploy. Expect it to surface at least
   one thing nobody wrote down. Most likely candidates: the deploy → set
   `GOOGLE_CALLBACK_URL` → redeploy loop in Step 5, and `REACT_APP_TIMEZONE` needing a
   rebuild rather than a restart.
4. **Twilio A2P 10DLC registration should be started now** even though comms work is
   deferred — it is per-brand, the detail shop needs its own, and it is multi-week. Adding
   credentials later is otherwise pure config: three env vars and a restart, no code change.

Phase 2 (de-Phoenix) is **not** a launch blocker: `Settings` defaults to Phoenix's name and
address, but runbook Step 8 sets company identity as data, and the verification checklist
requires printing an invoice before handover. It is a footgun handled by discipline rather
than by design.

---

## 7. House rules

- **Never `git push`.** Never `--no-verify`.
- **Commit messages are short** — a concise comma-separated summary. Detail goes in
  `CHANGELOG.md`, not the commit body.
- **No `Co-Authored-By` / Claude attribution footers.**
- **`CHANGELOG.md` in the same pass as any commit message.** Today's date at top, grouped
  Added/Changed/Fixed/Removed, phrased from the shop's perspective. Skip internal-only
  changes — of the Phase 0 work, only the interaction-notes fix earned an entry.
- **Testing split:** the user verifies UI changes in his own browser; the agent verifies
  backend behaviour by reproducing it. Don't claim a UI change works because it compiles.
- **The user picks product/UX direction; the agent makes implementation calls.** Ask about
  the former, decide the latter.
- **Parked work goes in a backlog file**, not inline — see
  [`shop-supplies-backlog.md`](shop-supplies-backlog.md) for the format.

---

## 8. Verification commands

```bash
# Boot check — branch-dependent, which is the point (see §2)
node -e "require('./src/server/services/twilioService'); require('./src/server/services/emailService'); console.log('boot ok')"

# Tests — 13 suites, 401 tests, all passing as of e30ccbc
npx jest --silent

# Client build — exits 0; DocumentDetail's 3 warnings are pre-existing and unrelated
cd src/client && npx react-scripts build

# Dev proxies /api → localhost:5000 (craco.config.js:45-51), so relative URLs
# are genuinely exercised in dev. A dev pass is meaningful, not a false positive.
npm run dev
```

Use `Grep`, not `grep -r`, over `src/` — `src/client/node_modules` makes raw recursive grep
hang for minutes.

---

## 9. Caveat about this document

§4's task is **implemented and verified in the working tree, uncommitted**, and awaiting the
user's browser pass on the UI. §5 is an audit of every `twilioService`/`emailService` call
site as of `e30ccbc`; it was accurate except for the `sendInvoice` entry, now corrected in
place — treat commented-out call sites as a general hazard when auditing by grep. §6 is
prioritisation, not instruction. Open items still needing the user: whether to do the
SendGrid sender identity before launch (§5 — now a config decision, not a code one), and
the broken password reset (§5), which is unchanged and still unraised.
