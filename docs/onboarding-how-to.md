# How to Onboard a Shop — ELI5 Edition

Click-by-click instructions for standing up a new shop on Phoenix CRM, assuming no prior
knowledge of any of the services involved.

**Read Part 0 before doing anything.** It corrects two things that will otherwise waste
your afternoon.

- **This document** = how to *do* the onboarding.
- [`onboarding-acceptance-test.md`](onboarding-acceptance-test.md) = how to *prove* it
  worked. Run it after Part 11.
- [`provisioning-runbook.md`](provisioning-runbook.md) = the terse version of this
  document, for when you've done it before.

**Time:** 2–3 hours the first time, most of it waiting on deploys.
**Cost:** $0 on free tiers, but see the warning in Part 6 about what "free" does.

---

## Part 0 — Read this first

### Two corrections

**1. There is no "new codebase," and you will not touch a `.env` file.**

You said "copy z, paste it into .env in the new codebase." That's not how this works, and
believing it will confuse everything downstream.

There is **one** repo, shared by every shop. You do not fork it, copy it, or branch it per
shop. Phoenix's deployment and the detail shop's deployment run *the exact same code from
the exact same repo*.

What makes them different is **environment variables** — a list of name/value settings that
live in **Render's web dashboard**, not in any file. Render injects them when the app
starts. The shop gets its own database and its own settings; the code doesn't know or care
which shop it's serving.

`.env` is only for running the app on your own laptop. It is gitignored and never deployed.
The file `.env.example` is just a checklist of *names* — no real values.

> **Why this matters:** if you edit code or `.env` per shop, you have created a fork, and
> every future fix has to be applied twice. The whole design is built to avoid that.

**2. What "one deployment per tenant" means.** Each shop gets its own:

| Thing | Why separate |
|---|---|
| MongoDB database | Their data. This is the isolation guarantee. |
| S3 bucket | Their photos. |
| Render service | Their URL, their env vars, their uptime. |
| Google OAuth redirect URI | Points at their URL. |

They **share**: the GitHub repo, the code, and (optionally) the Google Cloud project and
Gemini key.

### Vocabulary

- **Environment variable ("env var")** — a setting passed to the app at startup. Set in
  Render's dashboard under *Environment*.
- **Connection string / URI** — a long text string that contains an address, a username and
  a password all in one. Treat it like a password.
- **Deploy** — Render pulling the latest code, building it, and starting it.
- **Blueprint** — Render's name for creating services automatically from `render.yaml`.
  You are **not** going to use this (see Part 6).
- **Seeding** — creating the very first user directly in the database, because there's no
  way to sign up from the app.

### What you're building, in order

```
Part 1  Push the code           ← BLOCKER, do not skip
Part 2  MongoDB Atlas           → gives you MONGODB_URI
Part 3  AWS S3                  → gives you 4 AWS values
Part 4  Gemini API key          → gives you GEMINI_API_KEY
Part 5  Generate a JWT secret   → gives you JWT_SECRET
Part 6  Create the Render app   → gives you the shop's URL
Part 7  Google sign-in          → needs the URL from Part 6
Part 8  Create the first admin
Part 9  First sign-in
Part 10 Set the shop's name and address
Part 11 Confirm what's switched off
Part 12 Run the acceptance test
```

---

## Part 1 — Push the code first **[BLOCKER]**

**If you skip this, the shop's app will not start at all.**

Right now `main` — the branch Render deploys — still contains the old Twilio code that
crashes on startup when there are no Twilio credentials. I verified this: it throws
`username is required` and the process dies. The detail shop has no Twilio credentials, so
it would crash on every boot, with no obvious explanation in the logs.

The fix is already written and committed on the `saas-onboarding` branch. It just isn't on
`main` yet.

**Do this:**

```bash
git checkout main
git merge saas-onboarding
git push
```

**Check it worked:** on `main`, this must print two warnings and then `boot ok`:

```bash
node -e "require('./src/server/services/twilioService'); require('./src/server/services/emailService'); console.log('boot ok')"
```

If it prints `boot ok`, you're clear. If it throws `username is required`, the merge didn't
take — stop and fix that before going further.

> I can't run `git push` for you; it's deliberately blocked. This one is yours.

---

## Part 2 — MongoDB Atlas (the shop's database)

MongoDB Atlas is the hosted database. You need a **new, empty database for this shop only**.

Go to **https://cloud.mongodb.com** and sign in.

### 2a. Create a cluster

A "cluster" is the server your databases live on.

1. Click **Create** (or **Build a Database**).
2. Choose the **M0 / Free** tier.
3. Pick a region physically near the shop.
4. Name it something you'll recognise — e.g. `detail-shop`.
5. Click **Create Deployment**. It takes 3–5 minutes.

> You *can* put a second shop's database on the same cluster as another shop's. Don't. One
> cluster per shop keeps backups, performance and blast radius separate.

### 2b. Create the database user

This is a login for the *app*, not for you.

1. Left sidebar → **Database Access** → **Add New Database User**.
2. Authentication method: **Password**.
3. Username: something like `detailshop-app`.
4. Click **Autogenerate Secure Password** and **copy it somewhere safe now** — you cannot
   view it again later.
5. Under *Database User Privileges*, choose **Read and write to any database**.
6. **Add User**.

### 2c. Allow Render to connect

1. Left sidebar → **Network Access** → **Add IP Address**.
2. Click **Allow Access from Anywhere** (`0.0.0.0/0`).
3. **Confirm**.

> This sounds alarming and mostly isn't: the database still requires the username and
> password from 2b. Render's free and starter tiers don't give you fixed outbound IP
> addresses, so there is nothing narrower to allow. Use a long autogenerated password and
> never commit it.

### 2d. Get the connection string

1. Go to **Database** → your cluster → **Connect**.
2. Choose **Drivers**.
3. Copy the string. It looks like:
   ```
   mongodb+srv://detailshop-app:<db_password>@detail-shop.ab1cd.mongodb.net/?retryWrites=true&w=majority
   ```
4. **Two edits you must make:**
   - Replace `<db_password>` with the password from 2b (delete the angle brackets too).
   - Insert a **database name** after the `/` and before the `?`. Use something explicit
     like `detailshop`.

   Final result:
   ```
   mongodb+srv://detailshop-app:THEPASSWORD@detail-shop.ab1cd.mongodb.net/detailshop?retryWrites=true&w=majority
   ```

> **Don't skip the database name.** Without it, Mongo silently uses a default called
> `test`. Everything still works, which is exactly why it's dangerous — you won't notice
> until two shops are sharing a database called `test`.

> If the password contains `@`, `/`, `:` or `#`, it will break the string. Regenerate it
> until you get one without those, which is easier than URL-encoding it.

**✅ You now have:** `MONGODB_URI`

---

## Part 3 — AWS S3 (where photos go)

Work order photos, receipts and the shop's logo are stored here.

Go to **https://console.aws.amazon.com**.

### 3a. Create the bucket

1. Search for **S3** in the top search bar, open it.
2. **Create bucket**.
3. Bucket name: globally unique across all of AWS — e.g. `detailshop-crm-media-2026`.
4. Region: pick one near the shop and **write it down** (e.g. `us-east-1`). You need it
   later as `AWS_REGION`.
5. Leave **Block all public access** ticked **on**. The app serves files through signed
   URLs; the bucket does not need to be public.
6. **Create bucket**.

### 3b. Create a user for the app

1. Search for **IAM**, open it.
2. **Users** → **Create user**. Name: `detailshop-crm-app`.
3. Do **not** give it console access.
4. On permissions, choose **Attach policies directly** → tick **AmazonS3FullAccess**.
5. Create the user.

> `AmazonS3FullAccess` grants access to *every* bucket in the account, including other
> shops'. It's the quick path. The tighter version is a custom policy limited to this one
> bucket's ARN — worth doing once you have more than two shops.

### 3c. Get the keys

1. Click the new user → **Security credentials** tab.
2. **Create access key** → choose **Application running outside AWS** → **Next** →
   **Create access key**.
3. Copy both values now. The secret is shown **once**:
   - **Access key** → `AWS_ACCESS_KEY_ID`
   - **Secret access key** → `AWS_SECRET_ACCESS_KEY`

**✅ You now have:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`,
`S3_BUCKET_NAME`

---

## Part 4 — Gemini API key (the AI features)

Powers receipt scanning, registration-photo reading and duplicate detection.

1. Go to **https://aistudio.google.com/apikey**.
2. **Create API key**, pick a Google Cloud project (or let it make one).
3. Copy the key.

You can reuse Phoenix's existing key if you'd rather — usage is billed to whoever owns it,
so a separate key per shop is cleaner if you ever want to see who's using what.

> Optional. Leave it out and the app runs fine; only the AI buttons fail.

**✅ You now have:** `GEMINI_API_KEY`

---

## Part 5 — Generate a JWT secret

This signs login cookies. It's just a long random string, and it must be unique per shop.

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Copy the output.

> Never reuse Phoenix's. A shared secret means a login cookie from one shop is valid at the
> other.

**✅ You now have:** `JWT_SECRET`

---

## Part 6 — Create the Render service

Render runs the app. Go to **https://dashboard.render.com**.

### Why you're doing this by hand

The repo has a `render.yaml` (a "Blueprint") that can create a service automatically. **Do
not use it for this shop.** Blueprints read that file from the repo, and it's already named
`phoenix-crm` for Phoenix's own service — deploying a second shop from it would collide.
Changing the name in the file would change it for Phoenix too.

So: create the service manually, and use `render.yaml` purely as a reference list of
settings. That file stays as documentation.

### 6a. Create it

1. **New +** → **Web Service**.
2. Connect the Phoenix CRM GitHub repo (authorise Render on GitHub if it asks).
3. Fill in:

| Field | Value |
|---|---|
| Name | `detailshop-crm` (becomes the URL) |
| Region | near the shop |
| Branch | `main` |
| Runtime | Node |
| Build command | `npm run install:all && npm run build` |
| Start command | `npm start` |
| Instance type | see the warning below |

4. **Don't create it yet** — add the env vars first (6b), so it doesn't fail its first
   build.

> **About the free tier:** free services **spin down after ~15 minutes of inactivity**, and
> the next visitor waits 30–50 seconds for it to wake. For a real shop this reads as "the
> system is broken." It's fine for today's test. Move to **Starter** (~$7/month) before the
> shop relies on it.

### 6b. Add the environment variables

Find the **Environment Variables** section (**Advanced** on the create page, or the
**Environment** tab afterwards). Add each of these as a separate name/value pair.

**Set these to fixed values, exactly as written:**

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_EXPIRES_IN` | `90d` |
| `JWT_COOKIE_EXPIRES_IN` | `90` |
| `TIMEZONE` | `America/New_York` |
| `REACT_APP_TIMEZONE` | `America/New_York` |

**Set these from what you collected:**

| Name | From |
|---|---|
| `MONGODB_URI` | Part 2d |
| `JWT_SECRET` | Part 5 |
| `AWS_ACCESS_KEY_ID` | Part 3c |
| `AWS_SECRET_ACCESS_KEY` | Part 3c |
| `AWS_REGION` | Part 3a |
| `S3_BUCKET_NAME` | Part 3a |
| `GEMINI_API_KEY` | Part 4 |

**Leave out entirely** (this is what makes the shop's SMS and email features hide
themselves — see Part 11): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_PHONE_NUMBER`, `SENDGRID_API_KEY`, `EMAIL_FROM`.

> Leave them **absent**. Don't add them with placeholder text like `changeme` — actually,
> placeholders are handled (the code checks that a Twilio SID starts with `AC` and a
> SendGrid key with `SG.`), but absent is clearer to whoever reads the dashboard next.

**Two more you'll add in Part 7:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_CALLBACK_URL`. Skip them for now — you need the URL first.

> **Timezone gotcha:** if the shop isn't Eastern, change **both** timezone values *now*.
> `REACT_APP_TIMEZONE` is baked into the front-end when it builds, so changing it later
> needs a full rebuild, not a restart.

### 6c. Deploy

Click **Create Web Service**. First build takes 5–10 minutes.

**Watch the log.** You want it to end with the server listening. Along the way you'll see:

```
Twilio credentials are not set or invalid. SMS/MMS operations will be disabled.
SENDGRID_API_KEY / EMAIL_FROM are not set or invalid. Email operations will be disabled.
```

**Those two warnings are correct and expected.** They are the app telling you it noticed
the missing credentials and switched those features off cleanly.

**If the build fails:** almost always `MONGODB_URI`. Check you replaced `<db_password>`,
added the database name, and did Network Access (2c).

### 6d. Set CLIENT_URL

Now that it exists, copy the service URL from the top of the Render page — e.g.
`https://detailshop-crm.onrender.com`.

Add one more env var:

| Name | Value |
|---|---|
| `CLIENT_URL` | the URL, no trailing slash |

Save. Render redeploys automatically.

> The blueprint derives this automatically; a hand-made service doesn't, so it's easy to
> forget. Missing it breaks OAuth redirects and CORS.

**✅ You now have:** the shop's live URL

---

## Part 7 — Google sign-in

This is how everyone logs in. It has to come after Part 6 because it needs the URL.

Go to **https://console.cloud.google.com**.

### 7a. OAuth consent screen

Only needed once per Google Cloud project — skip to 7b if you've done it before and are
reusing the project.

1. **APIs & Services** → **OAuth consent screen**.
2. User type **External** → **Create**.
3. App name, your support email, your developer email. Save and continue through the
   remaining screens.
4. Under **Test users**, add every Google account that will sign in to this shop.

> While the app is "Testing", **only listed test users can sign in**, capped at 100. That's
> fine for one shop. Publishing to remove the cap triggers Google verification, which takes
> weeks — don't start that today.

### 7b. Create the credentials

1. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**.
2. Application type: **Web application**.
3. Name: `Detail Shop CRM`.
4. Under **Authorized redirect URIs** → **Add URI**, paste your Render URL plus
   `/api/auth/google/callback`:
   ```
   https://detailshop-crm.onrender.com/api/auth/google/callback
   ```
   It must match **exactly** — no trailing slash, `https` not `http`, correct hostname.
5. **Create**. Copy the **Client ID** and **Client secret**.

### 7c. Put them in Render

Back in Render → **Environment**, add:

| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | from 7b |
| `GOOGLE_CLIENT_SECRET` | from 7b |
| `GOOGLE_CALLBACK_URL` | the identical URL from 7b step 4 |

Save; Render redeploys.

> **The failure mode here is silent.** If these are missing or mismatched, the login button
> simply does nothing — no error, nothing useful in the logs. If sign-in doesn't work,
> suspect a mismatch between `GOOGLE_CALLBACK_URL` and the URI registered in Google before
> you suspect anything else.

---

## Part 8 — Create the first admin

The database is a locked door: sign-up is disabled, creating users needs an admin, and
Google sign-in rejects an email with no matching user. So the first user is created
directly in the database by a script, run **from your laptop**.

Decide whose email. For a live test onboarding, **use your own Google account** — you can
add the owner in Part 12. If you'd rather seed the owner directly, use the Google account
they'll actually sign in with.

### 8a. Dry run first

```bash
node scripts/seed-admin.js --email you@gmail.com --uri "mongodb+srv://…the tenant string…"
```

This writes nothing. It prints the host and database it *would* write to.

**Read that line.** Confirm it says the shop's database, not yours.

> **Always pass `--uri`.** Without it the script silently falls back to `MONGODB_URI` in
> your local `.env` — which is Phoenix's live production database.

### 8b. Do it for real

Add `--execute`:

```bash
node scripts/seed-admin.js --email you@gmail.com --uri "mongodb+srv://…" --execute
```

This creates an admin in **`pending`** state with no password. It activates automatically
the first time that person signs in with Google.

> If it refuses because users already exist, **stop**. That almost always means the URI is
> pointing at the wrong database. Don't reach for `--force` until you've checked.

Password-based admin instead (only if the shop won't use Google):

```bash
node scripts/seed-admin.js --email owner@shop.com --password 'SomethingLong!' --uri "…" --execute
```

> **Strongly prefer Google.** Password reset is currently broken — the reset link 404s — so
> a forgotten password means being locked out with no self-service way back in.

---

## Part 9 — First sign-in

1. Open the Render URL.
2. Click **Sign in with Google**.
3. Use the email from Part 8.

You should land inside the app. Behind the scenes the account flipped `pending` → `active`.

**If the button does nothing:** go back to 7c.
**If you get "access blocked":** the account isn't in the test users list (7a step 4).
**If the page takes 40 seconds:** free tier waking up. Normal. See Part 6a.

---

## Part 10 — Set the shop's name and address

**Do not skip this.** A brand-new shop boots up branded as **Phoenix Automotive Group,
Inc.**, with Phoenix's real address, phone, email, website and logo — and that appears on
**printed invoices**. A shop could hand a customer an invoice with another business's name
on it.

1. In the app, go to **Settings**.
2. Set: company name, address line 1, address line 2, phone, email, website.
3. Upload the shop's logo.
4. **Save.**

This is exactly the public-only information you said you'd use — business name and address.
Nothing here is personal data.

Then **print one invoice to PDF and look at the PDF itself**, not the preview. The header
comes from these settings, and a missed logo upload shows up here first.

---

## Part 11 — Confirm what's deliberately switched off

Because you left the Twilio and SendGrid variables out, the app should **hide** those
features rather than offer them and fail. Spot-check:

| Where | What you should see |
|---|---|
| New customer form → Communication Preference | Only **Phone** and **None**. No SMS, no Email. |
| Same form, default selection | **Phone** |
| Any appointment | **No** "Communication" card at all |
| A work order file attachment | **No** Share button |

If you see SMS or Email offered, the variables aren't actually absent — check Render.

**Turning them on later** is config only, no code change and no rebuild: add the three
Twilio vars (or the two SendGrid vars), restart, and the UI comes back on the next page
load. Note that US SMS also needs A2P 10DLC registration, which takes weeks — worth
starting now even though the feature is off.

---

## Part 12 — Prove it works

Run [`onboarding-acceptance-test.md`](onboarding-acceptance-test.md) start to finish.

Since this is a live onboarding, pay particular attention to:

- **Phase A (Isolation)** — proves the shop's data isn't landing in Phoenix's database.
- **Phase B5** — get a **second admin** onto the account. With password reset broken, one
  admin is one lost phone away from nobody being able to get in.
- **Phase C** — the Part 10 branding, verified properly.
- **Phase F** — take a backup and actually restore it before the shop has real data.

---

## When it goes wrong

| Symptom | Almost always |
|---|---|
| Build fails immediately | `MONGODB_URI` — password not substituted, missing database name, or Network Access not opened (2c) |
| App boots, but blank page | Build didn't finish; check the Render log for the client build step |
| Login button does nothing | `GOOGLE_CALLBACK_URL` doesn't exactly match the URI registered in Google (7b/7c) |
| "Access blocked" from Google | Email isn't in the OAuth test users list (7a) |
| Photo upload fails | AWS keys wrong, or `AWS_REGION` doesn't match the bucket's region |
| Times display wrong | `TIMEZONE` and `REACT_APP_TIMEZONE`; the second needs a **rebuild**, not a restart |
| Invoice says "Phoenix Automotive" | Part 10 wasn't done |
| First load of the day takes 40s | Free tier spin-down. Upgrade to Starter. |
| SMS/Email options visible when they shouldn't be | The Twilio/SendGrid vars aren't actually absent in Render |

## Keep these somewhere safe

By the end you're holding credentials that are not recoverable if lost:

- Atlas database password (Part 2b) — not viewable again
- AWS secret access key (Part 3c) — shown once
- `JWT_SECRET` (Part 5) — rotating it logs everyone out
- Google client secret (Part 7b)
- The full `MONGODB_URI` — needed for every backup and restore

A password manager entry per shop is the right home for these. Not a text file, and not a
commit.
