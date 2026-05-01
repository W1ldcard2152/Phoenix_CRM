import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

const PartRemovalModal = require('./PartRemovalModal').default;

const makePart = (overrides = {}) => ({
  _id: 'part-1',
  name: 'Mobil 1 5W-30',
  partNumber: 'M1-5W30-5Q',
  inventoryItemId: 'inv-1',
  quantity: 1,
  price: 6.5,
  committed: true,
  ...overrides,
});

describe('PartRemovalModal', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <PartRemovalModal isOpen={false} part={makePart()} onClose={() => {}} onConfirm={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when part is null', () => {
    const { container } = render(
      <PartRemovalModal isOpen={true} part={null} onClose={() => {}} onConfirm={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('draft + inventoryItemId → 2-button layout, yellow info box, no restock option', () => {
    const part = makePart({ committed: false });

    render(
      <PartRemovalModal isOpen={true} part={part} onClose={() => {}} onConfirm={() => {}} />
    );

    expect(screen.queryByRole('button', { name: /Remove & Restock/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove & Don't Restock/i })).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: /Remove Part/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();

    expect(screen.getByText(/has not been pulled from inventory/i)).toBeInTheDocument();
  });

  it('committed + inventoryItemId → 3-button layout with restock options, blue info box', () => {
    const part = makePart({ committed: true });

    render(
      <PartRemovalModal isOpen={true} part={part} onClose={() => {}} onConfirm={() => {}} />
    );

    expect(screen.getByRole('button', { name: /Remove & Restock/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove & Don't Restock/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();

    expect(screen.getByText(/has been pulled from inventory/i)).toBeInTheDocument();
  });

  it('pre-migration part (committed === undefined) + inventoryItemId → treated as committed (3-button)', () => {
    const part = makePart({ committed: undefined });

    render(
      <PartRemovalModal isOpen={true} part={part} onClose={() => {}} onConfirm={() => {}} />
    );

    expect(screen.getByRole('button', { name: /Remove & Restock/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove & Don't Restock/i })).toBeInTheDocument();
  });

  it('manual entry (no inventoryItemId) → 2-button layout regardless of committed value', () => {
    const part = makePart({ inventoryItemId: undefined, committed: true });

    render(
      <PartRemovalModal isOpen={true} part={part} onClose={() => {}} onConfirm={() => {}} />
    );

    expect(screen.queryByRole('button', { name: /Remove & Restock/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove Part/i })).toBeInTheDocument();
    // Manual parts get no info box at all
    expect(screen.queryByText(/has been pulled from inventory/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/has not been pulled from inventory/i)).not.toBeInTheDocument();
  });

  it('"Remove & Restock" calls onConfirm(true)', () => {
    const onConfirm = jest.fn();
    render(
      <PartRemovalModal isOpen={true} part={makePart({ committed: true })} onClose={() => {}} onConfirm={onConfirm} />
    );

    fireEvent.click(screen.getByRole('button', { name: /Remove & Restock/i }));
    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it('"Remove & Don\'t Restock" calls onConfirm(false)', () => {
    const onConfirm = jest.fn();
    render(
      <PartRemovalModal isOpen={true} part={makePart({ committed: true })} onClose={() => {}} onConfirm={onConfirm} />
    );

    fireEvent.click(screen.getByRole('button', { name: /Remove & Don't Restock/i }));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it('draft "Remove Part" button calls onConfirm(false)', () => {
    const onConfirm = jest.fn();
    render(
      <PartRemovalModal isOpen={true} part={makePart({ committed: false })} onClose={() => {}} onConfirm={onConfirm} />
    );

    fireEvent.click(screen.getByRole('button', { name: /Remove Part/i }));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it('Cancel calls onClose', () => {
    const onClose = jest.fn();
    render(
      <PartRemovalModal isOpen={true} part={makePart()} onClose={onClose} onConfirm={() => {}} />
    );

    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the part total formatted as currency', () => {
    render(
      <PartRemovalModal isOpen={true} part={makePart({ price: 6.5, quantity: 4 })} onClose={() => {}} onConfirm={() => {}} />
    );

    // 6.5 * 4 = 26.00
    expect(screen.getByText(/\$26\.00/)).toBeInTheDocument();
  });
});
