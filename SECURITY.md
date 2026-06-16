# Security

## Authentication & access control

- **Login is Google OAuth-first.** An admin pre-authorizes a user by email
  (`/api/admin/users`); the user then signs in with Google. Local email/password
  **login** is retained as a break-glass fallback for admin-created accounts.
- **Public self-registration is disabled.** There is no signup endpoint or
  `/register` page — accounts are only created by an admin or provisioned via
  OAuth against a pre-authorized email.
- **User management is admin-only.** Creating/modifying users and assigning roles
  is restricted to the `admin` role. User create/update handlers whitelist
  fields (no mass assignment), validate `role`/`status` against the schema enum,
  and refuse to remove/disable the last remaining admin.
- Passwords hashed with bcrypt (cost 12); reset tokens are random, SHA-256
  hashed at rest, and expire in 10 minutes. `forgotPassword` returns a generic
  response regardless of whether the email exists (no account enumeration).
- JWT is stored in an httpOnly, `sameSite` cookie (`secure` in production). The
  OAuth callback cookie intentionally uses `sameSite: 'lax'` because the redirect
  flow requires the cookie to survive a cross-site top-level navigation.

## Input handling & SSRF

- **SSRF guard** (`src/server/utils/ssrfGuard.js`): the AI URL-extraction feature
  fetches user-supplied URLs server-side. The guard requires http/https, resolves
  the host, and rejects private/loopback/link-local/reserved IPs (incl. cloud
  metadata `169.254.169.254` and IPv4-mapped IPv6), re-validating on each redirect
  and capping redirect count. Residual: this does not fully prevent DNS-rebinding
  TOCTOU — acceptable because the endpoint is authenticated, office-staff only.
- **Regex inputs are escaped** via `src/server/utils/escapeRegex.js` everywhere a
  Mongo `$regex` is built from request input (search endpoints), with a length
  cap, to prevent ReDoS / NoSQL injection.
- **File uploads** enforce a MIME allowlist (`src/server/utils/uploadFilters.js` —
  images, plus PDF for receipts) and the original filename is sanitized before
  composing the S3 key. `express-mongo-sanitize` runs on every request to block
  NoSQL operator injection.
- **XSS** is handled at the output layer: the React client escapes all rendered
  values by default and uses no `dangerouslySetInnerHTML`. Input-side HTML
  sanitization (`express-xss-sanitizer`) was evaluated and intentionally not
  adopted because it HTML-encodes all input, corrupting legitimate data such as
  "Smith & Sons", notes containing "<", and URLs with "&" query parameters.

## Known residual / framework-constrained

- **CSP allows `'unsafe-inline'`/`'unsafe-eval'`** in `script-src` — a Create
  React App constraint that weakens XSS defense. Tracked with the Vite migration
  below.
- **Stateless JWT logout**: tokens are not revoked server-side before expiry — an
  accepted tradeoff for this deployment.

## Dependency vulnerability posture

This project is continuously deployed. `npm audit` is run against two dependency
trees: the root (Node/Express server) and `src/client` (the React app built by
Create React App / `react-scripts`).

### Triage (2026-06-16)

A deploy surfaced 71 root vulnerabilities (4 critical). They were triaged as
follows:

- **Removed unused dependencies** that dragged in large vulnerable trees:
  - `mongosh` (the MongoDB shell CLI) was a root runtime dependency but never
    imported in code — it pulled in the `basic-ftp` **critical** plus ~10
    moderates (`@mongodb-js/*`, `@mongosh/*`, `ip-address`, `ssh2`, …).
  - `jspdf` was listed in both the root and the client but is never imported —
    PDF export uses `html2canvas` (`src/client/src/utils/pdfUtils.js`). Removing
    it cleared a **critical** in both trees.
  - Vestigial frontend libraries duplicated in the root `package.json`
    (`react-scripts`, `react-router-dom`, `web-vitals`, `formik`,
    `html2canvas`, `yup`) were removed from the root — the client is built from
    `src/client`, which has its own copies.
- **Bumped runtime dependencies** to patched versions: `@aws-sdk/client-s3` +
  `@aws-sdk/s3-request-presigner` (cleared the `fast-xml-parser` critical),
  `mongoose`, `express`, `express-xss-sanitizer`, `uuid` (root); `axios` and
  `react-router-dom` (client).

Result: **0 critical / 0 high** in production-relevant code.

### Accepted residual risk

Two categories of advisories remain and are **knowingly accepted** because they
do not affect deployed production code:

1. **Client build toolchain (`react-scripts` / CRA).** The remaining client
   `high`/`moderate` advisories (`svgo`, `nth-check`, `css-select`,
   `serialize-javascript`, `workbox-*`, `bfj`, `jsonpath`, `underscore`,
   `rollup-plugin-terser`, `webpack-dev-server`, `postcss`, `sockjs`, …) live in
   the build pipeline. They run only at build time against our own source and
   are never bundled into the browser app. `npm audit`'s only "fix" is a
   sentinel semver-major to `react-scripts@0.0.0`, i.e. there is no real upstream
   fix without leaving CRA.
2. **Test tooling (`jest`).** The remaining root `moderate` advisories
   (`js-yaml` ReDoS and the `jest`/`@jest/*` subtree) are dev-only test
   dependencies. They never ship and only process trusted local input.

Do **not** run `npm audit fix --force` — it attempts the bogus `react-scripts`
and jest semver-major downgrades and will break the build/test setup.

### Future work

Real remediation of the build-time advisories requires migrating the client off
Create React App (e.g. to Vite), tracked as a separate workstream.
