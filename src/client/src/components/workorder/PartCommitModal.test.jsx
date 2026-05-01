import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('../../services/inventoryService', () => ({
  getItem: jest.fn(),
}));

const InventoryService = require('../../services/inventoryService');
const PartCommitModal = require('./PartCommitModal').default;

const makePart = (overrides = {}) => ({
  _id: 'part-1',
  name: 'Mobil 1 5W-30',
  partNumber: 'M1-5W30-5Q',
  inventoryItemId: 'inv-1',
  quantity: 1,
  price: 6.5,
  cost: 5,
  committed: false,
  ...overrides,
});

const makeInventoryItem = (overrides = {}) => ({
  _id: 'inv-1',
  name: 'Mobil 1 5W-30',
  unit: 'quart',
  quantityOnHand: 5,
  isActive: true,
  ...overrides,
});

describe('PartCommitModal', () => {
  afterEach(() => {
    InventoryService.getItem.mockReset();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <PartCommitModal isOpen={false} part={makePart()} onClose={() => {}} onConfirm={() => {}} />
    );
    expect(container.firstChild).toBeNull();
    expect(InventoryService.getItem).not.toHaveBeenCalled();
  });

  it('shows loading spinner while validating stock', async () => {
    // Never resolve so we can observe the loading state
    InventoryService.getItem.mockImplementation(() => new Promise(() => {}));

    render(
      <PartCommitModal isOpen={true} part={makePart()} onClose={() => {}} onConfirm={() => {}} />
    );

    expect(await screen.findByText(/Checking inventory levels/i)).toBeInTheDocument();
  });

  it('enables confirm button when stock is sufficient (status: ok)', async () => {
    InventoryService.getItem.mockResolvedValue({
      data: { item: makeInventoryItem({ quantityOnHand: 5 }) },
    });

    const onConfirm = jest.fn();
    render(
      <PartCommitModal
        isOpen={true}
        part={makePart({ quantity: 2 })}
        onClose={() => {}}
        onConfirm={onConfirm}
      />
    );

    const confirmBtn = await screen.findByRole('button', { name: /Confirm & Pull from Inventory/i });
    await waitFor(() => expect(confirmBtn).toBeEnabled());

    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('disables confirm and shows "View in Inventory" link when stock is insufficient', async () => {
    InventoryService.getItem.mockResolvedValue({
      data: { item: makeInventoryItem({ _id: 'inv-1', quantityOnHand: 1 }) },
    });

    render(
      <PartCommitModal
        isOpen={true}
        part={makePart({ quantity: 5 })}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );

    // findByText waits for validation to settle before asserting (mockResolvedValue
    // resolves on the next microtask, after the spinner has rendered).
    await screen.findByText(/Short by:/i);

    const confirmBtn = screen.getByRole('button', { name: /Confirm & Pull from Inventory/i });
    expect(confirmBtn).toBeDisabled();

    const link = screen.getByRole('link', { name: /View in Inventory/i });
    expect(link).toHaveAttribute('href', '/inventory/inv-1');
  });

  it('disables confirm when inventory item is inactive (status: error)', async () => {
    InventoryService.getItem.mockResolvedValue({
      data: { item: makeInventoryItem({ isActive: false }) },
    });

    render(
      <PartCommitModal
        isOpen={true}
        part={makePart()}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );

    await screen.findByText(/Item not found or inactive/i);
    const confirmBtn = screen.getByRole('button', { name: /Confirm & Pull from Inventory/i });
    expect(confirmBtn).toBeDisabled();
  });

  it('disables confirm when API returns null item', async () => {
    InventoryService.getItem.mockResolvedValue({ data: { item: null } });

    render(
      <PartCommitModal
        isOpen={true}
        part={makePart()}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );

    await screen.findByText(/Item not found or inactive/i);
    const confirmBtn = screen.getByRole('button', { name: /Confirm & Pull from Inventory/i });
    expect(confirmBtn).toBeDisabled();
  });

  it('shows error state without API call when part has no inventoryItemId', async () => {
    render(
      <PartCommitModal
        isOpen={true}
        part={makePart({ inventoryItemId: undefined })}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );

    await screen.findByText(/No inventory item linked/i);
    expect(InventoryService.getItem).not.toHaveBeenCalled();
    const confirmBtn = screen.getByRole('button', { name: /Confirm & Pull from Inventory/i });
    expect(confirmBtn).toBeDisabled();
  });

  it('handles inventoryService.getItem rejection without crashing', async () => {
    // Suppress the expected console.error from the catch block
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    InventoryService.getItem.mockRejectedValue(new Error('network down'));

    render(
      <PartCommitModal
        isOpen={true}
        part={makePart()}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );

    await screen.findByText(/Failed to validate stock levels/i);
    const confirmBtn = screen.getByRole('button', { name: /Confirm & Pull from Inventory/i });
    expect(confirmBtn).toBeDisabled();

    errorSpy.mockRestore();
  });

  it('calls onClose when the X button is clicked', async () => {
    InventoryService.getItem.mockResolvedValue({
      data: { item: makeInventoryItem() },
    });
    const onClose = jest.fn();

    render(
      <PartCommitModal
        isOpen={true}
        part={makePart()}
        onClose={onClose}
        onConfirm={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the line total based on price × quantity', async () => {
    InventoryService.getItem.mockResolvedValue({
      data: { item: makeInventoryItem() },
    });

    render(
      <PartCommitModal
        isOpen={true}
        part={makePart({ price: 6.5, quantity: 4 })}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    );

    // 6.5 * 4 = 26.00
    await screen.findByText(/\$26\.00/);
  });
});
