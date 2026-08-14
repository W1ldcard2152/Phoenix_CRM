import { getStockLinkId, isStockLinked, isStockDraft, isStockPulled } from './stockLinks';

describe('stockLinks', () => {
  it('reads a shop supply link', () => {
    expect(getStockLinkId({ shopSupplyId: 'sup-1' })).toBe('sup-1');
    expect(isStockLinked({ shopSupplyId: 'sup-1' })).toBe(true);
  });

  it('reads a legacy inventory link', () => {
    expect(getStockLinkId({ inventoryItemId: 'inv-1' })).toBe('inv-1');
    expect(isStockLinked({ inventoryItemId: 'inv-1' })).toBe(true);
  });

  it('prefers the supply link when a line somehow carries both', () => {
    expect(getStockLinkId({ shopSupplyId: 'sup-1', inventoryItemId: 'inv-1' })).toBe('sup-1');
  });

  it('treats a manually entered line as unlinked', () => {
    expect(getStockLinkId({ name: 'Brake pads' })).toBeNull();
    expect(isStockLinked({ name: 'Brake pads' })).toBe(false);
    expect(isStockLinked(null)).toBe(false);
    expect(isStockLinked(undefined)).toBe(false);
  });

  it('counts a supply-backed draft as a draft — the regression this module exists for', () => {
    expect(isStockDraft({ shopSupplyId: 'sup-1', committed: false })).toBe(true);
    expect(isStockPulled({ shopSupplyId: 'sup-1', committed: false })).toBe(false);
  });

  it('counts a committed line as pulled, from either source', () => {
    expect(isStockPulled({ shopSupplyId: 'sup-1', committed: true })).toBe(true);
    expect(isStockPulled({ inventoryItemId: 'inv-1', committed: true })).toBe(true);
    expect(isStockDraft({ shopSupplyId: 'sup-1', committed: true })).toBe(false);
  });

  it('treats a pre-draft-workflow line (no committed field) as pulled, not draft', () => {
    // Stock was deducted at add-time for these; calling them drafts would
    // double-deduct on commit and skip the restock prompt on removal.
    expect(isStockPulled({ inventoryItemId: 'inv-1' })).toBe(true);
    expect(isStockDraft({ inventoryItemId: 'inv-1' })).toBe(false);
  });

  it('never reports a manual line as draft or pulled', () => {
    expect(isStockDraft({ committed: false })).toBe(false);
    expect(isStockPulled({ committed: true })).toBe(false);
  });
});
