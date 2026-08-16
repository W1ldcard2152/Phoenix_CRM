// Stock-link helpers for work order parts and service package items.
//
// A line that draws stock carries a link to whichever table it came from:
// `shopSupplyId` for anything pulled since the shop supplies switch, or
// `inventoryItemId` for lines pulled before it. Both tables follow the same
// draft → pull → remove lifecycle, so almost every caller wants "is this linked
// to stock at all", not "which table". Testing only one id — which the work
// order screen used to do — silently drops supply-backed lines out of the draft
// badge, the Pull button, the restock prompt, and the pre-invoice warning.

export const getStockLinkId = (line) =>
  (line && (line.shopSupplyId || line.inventoryItemId)) || null;

export const isStockLinked = (line) => !!getStockLinkId(line);

// `committed === false` and not merely falsy: lines created before the draft
// workflow existed have no `committed` field at all, and their stock was
// deducted at add-time. Treating those as drafts would double-deduct.
export const isStockDraft = (line) => isStockLinked(line) && line.committed === false;

export const isStockPulled = (line) => isStockLinked(line) && line.committed !== false;
