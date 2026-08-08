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

### W5. Service Parts vs. a future parts module

If a parts/interchange DB later claims filters, this branch either moves or
becomes the stocking view of items catalogued elsewhere. Note which way it
pulls.

_Observations:_

### W6. How long the two systems coexist

Two inventory pages in the nav is tolerable for weeks, corrosive for months.
Completing the triage pass is the trigger to schedule wire-in.

_Observations:_
