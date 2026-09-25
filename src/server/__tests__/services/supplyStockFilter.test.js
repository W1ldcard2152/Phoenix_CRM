/**
 * The restock filter behind the "Low or out of stock" view.
 *
 * What is pinned here is the SEMANTICS, which are easy to break by eye:
 * "low" is at OR below the reorder point (a reorder point is the level you buy
 * AT), it composes with the other filters rather than replacing them, and the
 * shopping-list endpoint is the same query so the two cannot drift apart.
 */
const mockModel = (name) => {
  const model = jest.fn();
  model.find = jest.fn();
  model.countDocuments = jest.fn();
  model.modelName = name;
  return model;
};

jest.mock('../../models/ShopSupply', () => mockModel('ShopSupply'));
jest.mock('../../models/SupplyTag', () => mockModel('SupplyTag'));
jest.mock('../../models/SupplyVocab', () => mockModel('SupplyVocab'));
jest.mock('../../models/SupplyField', () => mockModel('SupplyField'));
jest.mock('../../models/SupplyTaxRule', () => mockModel('SupplyTaxRule'));
jest.mock('../../models/SupplyMovement', () => mockModel('SupplyMovement'));
jest.mock('../../models/Settings', () => mockModel('Settings'));
jest.mock('../../services/supplyTagService', () => ({
  getFlat: jest.fn(async () => []),
  getDescendantIds: jest.fn(async (id) => [id])
}));

const ShopSupply = require('../../models/ShopSupply');
const SupplyVocab = require('../../models/SupplyVocab');
const SupplyField = require('../../models/SupplyField');
const supplyService = require('../../services/supplyService');

const lean = (value) => ({ lean: jest.fn(async () => value) });

beforeEach(() => {
  jest.clearAllMocks();
  SupplyVocab.find.mockReturnValue(lean([]));
  SupplyField.find.mockReturnValue(lean([]));
  ShopSupply.find.mockReturnValue(lean([]));
});

/** The filter object handed to ShopSupply.find on the last call. */
const lastFilter = () => ShopSupply.find.mock.calls[0][0];

describe('listSupplies stock filter', () => {
  it('leaves the query alone when no stock level is asked for', async () => {
    await supplyService.listSupplies({});
    expect(lastFilter().$expr).toBeUndefined();
  });

  it('treats "low" as AT or below the reorder point', async () => {
    await supplyService.listSupplies({ stock: 'low' });
    expect(lastFilter().$expr).toEqual({ $lte: ['$quantityOnHand', '$reorderPoint'] });
  });

  it('treats "out" as zero or less, independent of the reorder point', async () => {
    await supplyService.listSupplies({ stock: 'out' });
    expect(lastFilter().$expr).toEqual({ $lte: ['$quantityOnHand', 0] });
  });

  it('ignores an unrecognised stock value rather than returning nothing', async () => {
    await supplyService.listSupplies({ stock: 'nonsense' });
    expect(lastFilter().$expr).toBeUndefined();
  });

  // The whole point of putting this on the list endpoint instead of in a modal:
  // "what am I low on from this vendor" has to be one question.
  it('composes with the other filters instead of replacing them', async () => {
    const vendor = '6ab57f9bd99deeb9d6a5b9e9';
    await supplyService.listSupplies({ stock: 'low', vendor });

    const filter = lastFilter();
    expect(filter.$expr).toEqual({ $lte: ['$quantityOnHand', '$reorderPoint'] });
    expect(filter.vendor).toBe(vendor);
    expect(filter.isActive).toBe(true);
  });

  it('never offers retired items to restock', async () => {
    await supplyService.listSupplies({ stock: 'low' });
    expect(lastFilter().isActive).toBe(true);
  });
});

describe('getShoppingList', () => {
  it('asks exactly the same question as the "low" filter', async () => {
    await supplyService.getShoppingList();
    expect(lastFilter()).toEqual({
      isActive: true,
      $expr: { $lte: ['$quantityOnHand', '$reorderPoint'] }
    });
  });
});

describe('countLowStock', () => {
  it('reports low and out separately, across active items only', async () => {
    ShopSupply.countDocuments.mockResolvedValueOnce(7).mockResolvedValueOnce(2);

    await expect(supplyService.countLowStock()).resolves.toEqual({ low: 7, out: 2 });

    expect(ShopSupply.countDocuments).toHaveBeenNthCalledWith(1, {
      isActive: true,
      $expr: { $lte: ['$quantityOnHand', '$reorderPoint'] }
    });
    expect(ShopSupply.countDocuments).toHaveBeenNthCalledWith(2, {
      isActive: true,
      $expr: { $lte: ['$quantityOnHand', 0] }
    });
  });
});
