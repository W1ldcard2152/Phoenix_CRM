# Shop Supplies — Backlog

Parking lot for the Phase 1 build (`docs/shop-supplies-module.md`). Findings,
annoyances, and "we should really fix X" land here. **Nothing on this list gets
fixed inline.**

Format: `[status] title` — context, then why it's parked.
Status: `open` · `decided` · `done` · `wontfix`

---

## Opened during pre-build verification (2026-08-08)

### 1. `[decided]` `vendor` and `warranty` had no destination in `ShopSupply`

`InventoryItem` carries `vendor: String` and `warranty: String`; the schema as
originally specced had neither, so the one-time import would have dropped both
silently.

**Decision (2026-08-08, user):** carry `vendor`, drop `warranty`.

`vendor` earns it — sortable column (`InventoryList.jsx:785-787`), on the mobile
cards (`:705`, `:1115`), and it annotates every **shopping list export** line
(`:430`). Since `GET /shopping-list` is Phase 1 scope, dropping it would ship a
shopping list worse than the one being replaced. `warranty` defaults to
"90 days" and is read nowhere outside the old form — a parts-side concern that
leaked into inventory.

Modelled as `SupplyVocab` with `fieldKey: 'vendor'`, not free text, so it
behaves like every other vocab field (§3.2).

**Residual cost — this is the part to watch:** there are now **two vendor
lists**. `Settings.customVendors` (tagged `usedFor: ['inventory']`, and also
driving the parts worksheet) and the new supply vocab. The seed script reads the
former to populate the latter *once*, then they are free to drift — a vendor
added in Settings will not appear in supplies, and vice versa.

Reconciling them means changing `Settings`, which §8 forbids this phase. The
options at wire-in, roughly in order of preference:

1. `SupplyVocab` `fieldKey: 'vendor'` becomes a projection of
   `Settings.customVendors` — one source of truth, supplies stops owning the
   list. Needs stable ids on the Settings subdocuments, which today's
   whole-array rewrites don't guarantee.
2. Move the vendor directory out of `Settings` into a real `Vendor` collection
   and have both sides ref it. Cleanest, largest.
3. Accept the drift and add a "sync vendors" button. Cheapest, worst.

Revisit when the triage pass is done and the wire-in phase is scheduled — not
before. Log any drift actually observed under W6.

### 2. `[open]` No database in the server test harness

Every server test `jest.mock`s its models; there is no `mongodb-memory-server`.
Real query semantics — descendant-walk filtering, `untagged=true` set equality,
vocab-rename propagation, the collection validator — cannot be asserted in CI.
§9 splits these into pure unit tests, mock-based route tests, and a manual
checklist.

**Why parked:** adding a real test database is a devDependency and a CI-shape
change that affects the whole repo, not just this module. Worth doing; not worth
doing inside a feature build.

### 2b. `[open]` Collection validator can't be installed — Atlas user lacks dbAdmin

`db.command({ collMod: 'shopsupplies', validator })` fails with
`AtlasError 8000: user is not allowed to do action [collMod]`. The seed script
degrades gracefully (warns, continues), so the tree seeds fine and the app-level
invariant is fully enforced and verified. The missing layer is only the schema
guard against raw-driver writes from future `scripts/`.

Fix when convenient: grant the app's database user `dbAdmin` on this database in
Atlas, then re-run `node scripts/seed-supply-tags.js --execute` — it's
idempotent and will pick the validator up.

Worth deciding deliberately rather than by default: granting dbAdmin to the
runtime application user widens what a compromised app credential can do. The
alternative is a separate migration credential used only by `scripts/`, which is
the better shape but more setup than this phase warrants.

### 2c. `[open]` errorHandler drops error details, and hangs if NODE_ENV is unset

Two things noticed while wiring the supplies controller, both pre-existing:

- `sendErrorProd` forwards only `status` and `message`, so a structured payload
  (which items a bulk edit would orphan) can't reach the client through the
  global handler. Worked around locally: `supplyController` answers its own
  known-shape errors directly rather than widening shared middleware.
- `errorHandler` branches on `NODE_ENV === 'development'` and
  `NODE_ENV === 'production'` with **no else**. If `NODE_ENV` is unset, an error
  produces no response at all and the request hangs until timeout.

The second is worth fixing on its own merits, outside this module.

### 2d. `[open]` No admin UI for measurement fields

The field registry is built and working, but adding a field or binding one to a
tag node means editing `FIELDS` in `scripts/seed-supply-tags.js` and re-running.
Fine while the set is the 19 derived during design; wanted as soon as the triage
pass turns up a measurement nobody anticipated (which W4 exists to catch).

Pairs with the missing `ManageTagsModal` / `ManageVocabModal` — three admin
surfaces over the same shaped data, probably one screen with three tabs rather
than three modals.

### 2e. `[open]` Seed script can't invalidate the running server's tag cache

`supplyTagService` caches the flat tree in memory for 10 minutes and invalidates
on its own writes. A seed run is a different process, so the server serves a
stale tree until TTL or restart — and a stale tree reads exactly like the seed
having failed. The script now prints a restart reminder, which is a documentation
fix, not a real one.

Proper fixes, if it becomes annoying: an authenticated cache-flush endpoint the
script can call, or dropping the TTL for this key. Not worth either yet.

### 2f. `[open]` Label import: receipts not yet wired, prices not captured

The label importer reads identity and measurements — brand, part number,
viscosity, grit. Labels carry no prices, so imported items land at cost 0.

Receipt import for supplies (cost, quantity, vendor, shipping amortisation) is
the other half and reuses `aiService.parseReceipt` almost as-is. Deferred
deliberately when we chose labels-first, since labels are the only path that
populates measurements.

Also unbuilt: importing a photo against an EXISTING supply to top up quantity.
Today a duplicate is flagged with "possibly already stocked" and the user is
told to skip and adjust manually.

### 2g. `[resolved-ish]` Live Gemini calls intermittently unreachable from the sandbox

Outbound HTTPS to `generativelanguage.googleapis.com` failed from Claude's
sandbox on 2026-08-09 (`fetch failed`, and the pre-existing
`aiService.testConnection()` failed identically, so it was environmental rather
than a code fault). It succeeded on a later run the same day with no change to
the code — so treat it as intermittent rather than blocked.

Practical upshot: a green live check is meaningful, a red one is not
conclusive. The validation layer around the model is fully testable regardless
by stubbing `parseSupplyLabel`, and that is where the risk actually lives —
everything the model returns is untrusted until it matches real vocabulary.

### 2h. `[open]` A third `extractHostname` lives in DocumentDetail

`DocumentDetail.jsx:302` defines its own local `extractHostname` rather than
importing the shared one from `utils/vendorRanking`. It therefore did not get
the scheme-less fix, so URL→vendor behaviour there still differs from the
worksheet and from supplies.

Not touched: it's work-order code, outside this module, and changing detection
behaviour on a screen mid-use is not worth the surprise. Worth folding into the
shared helper next time that file is open.

### 3. `[open]` `escapeRegex` + 100-char cap is copy-pasted per controller

The ReDoS guard at `inventoryController.js:36` is a hand-rolled two-liner that
the new supply controller will now be the Nth copy of. Wants to be one
`buildSearchRegex(input)` helper in `src/server/utils/`.

**Why parked:** touching shared utils means touching existing controllers, which
§0.1 forbids for this phase.

### 4. `[open]` `inventoryController` allow-lists are duplicated

`createItem` (`:75-79`) and `updateItem` (`:101-120`) each spell out the field
list independently, so a new field silently drops from one path. The new module
avoids this (§6, shared constant) but the old one still has the bug.

**Why parked:** old-table change, out of scope until wire-in.

---

## Pilot watch items (§10)

These are questions to answer *from using the thing*, not tasks. Record
observations under each as they show up during the triage pass.

### W1. Does the primary/secondary split earn its keep?

Brake cleaner is the designed test — Shop Chemicals primary, Surface Prep
secondary. If in practice items get one tag and nobody misses the second door,
`primaryTag` is complexity the personal-inventory build should drop.

_Observations:_

### W2. Does phase-first ordering survive a second technician?

The tree is built around "where would *I* look." Watch for a tech hunting in the
wrong branch.

_Observations:_

### W3. Where does 3–12 children break first?

Predicted: Service Fluids (7, growing) and Coatings (5, at the practical
ceiling) push up; Service Parts (3) sits at the floor — expectation there is
growth, not merging upward.

_Observations:_

### W4. What fields do items want that the schema lacks?

Input to the Phase 2 field registry. Fifteen well-chosen fields covering 90% of
items is maintainable; eighty fields where forty are used twice is abandonware.
**Note wants, don't add columns.**

_Observations:_

- **2026-08-08 — viscosity, on the very first item entered (motor oil).** Asked
  before any triage had happened, which suggests the field registry is wanted
  sooner rather than later. Confirms the annotation already on the Engine Oil
  node (`notes: "viscosity"`).
- The 18 nodes carrying `notes` in the seeded tree are the current best guess at
  the field set, derived during design rather than speculatively:
  viscosity (Engine Oil, Transmission & Gear Oil), DOT rating (Brake Fluid),
  spec/color (Coolant), refrigerant type, NLGI grade (Grease), grit
  (Discs, Sheets & Rolls, Pads & Scuff), diameter (Discs), temp range
  (Reducers/Hardeners), width (Masking Tape, Masking Paper), thread + length
  (Threaded Fasteners), gauge (Terminals, Wire & Loom), amperage (Fuses),
  strength (Threadlocker), size + material (Gloves), size (Protective Clothing),
  volume (Mix Cups), mesh (Strainers), length (Wipers), bulb number (Bulbs).
  That is ~15 distinct fields — squarely in the maintainable range, and a
  natural scope boundary if the registry gets built.
- **Timing note:** every item entered before the registry exists will carry its
  measurements in the name ("Motor Oil 5W-30"), and extracting them later is
  manual rework per item. Cheap at 1 item, meaningful at 200. This argues for
  deciding on the registry *before* the triage pass, not after — the one place
  where the "wait and learn" instinct actively costs something.

### W5. Service Parts vs. a future parts module

If a parts/interchange DB later claims filters, this branch either moves or
becomes the stocking view of items catalogued elsewhere. Note which way it
pulls.

_Observations:_

### W6. How long the two systems coexist

Two inventory pages in the nav is tolerable for weeks, corrosive for months.
Completing the triage pass is the trigger to schedule wire-in.

_Observations:_

- **2026-08-14 — closed. Coexistence lasted under a week.** The module was
  specced on 08-08; wire-in landed and Shop Inventory was retired on 08-14. The
  nav now carries one entry, "Inventory & Shop Supplies" (`/supplies`).
- What retirement actually meant, for the record: the nav entry went, nothing
  writes to `InventoryItem` any more (the work order receipt importer's
  "+ Shop Inventory" action and its server branch are gone, as is the orphaned
  `InventoryPickerModal`), and `/inventory` still routes to a banner-topped page
  so the work orders that drew stock from it stay legible. The legacy read and
  restock branches in `workOrderController` stay for the same reason.
- **Left open by the retirement:** `InventoryReceiptImportModal` still works on
  the retired page, which is the only remaining way to add stock from a receipt —
  supplies-side receipt import (item 2f) is still unbuilt, and building it is
  what would let `/inventory` be deleted outright.
