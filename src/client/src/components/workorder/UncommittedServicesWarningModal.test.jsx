import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

const UncommittedServicesWarningModal = require('./UncommittedServicesWarningModal').default;

const makePackage = (overrides = {}) => ({
  name: 'Oil Change',
  price: 60,
  packageIndex: 0,
  includedItems: [{ quantity: 1, name: 'Mobil 1 5W-30' }],
  ...overrides,
});

const makePart = (overrides = {}) => ({
  name: 'Mobil 1 5W-30',
  partNumber: 'M1-5W30-5Q',
  partIndex: 0,
  quantity: 2,
  price: 6.5,
  inventoryItemId: 'inv-1',
  ...overrides,
});

const noop = () => {};

describe('UncommittedServicesWarningModal (generalized)', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <UncommittedServicesWarningModal
        isOpen={false}
        uncommittedPackages={[makePackage()]}
        onClose={noop}
        onProceedAnyway={noop}
        onCommitPackage={noop}
        onCommitPart={noop}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('only services → header reads "Uncommitted Services Found"', () => {
    render(
      <UncommittedServicesWarningModal
        isOpen={true}
        uncommittedPackages={[makePackage()]}
        uncommittedParts={[]}
        onClose={noop}
        onProceedAnyway={noop}
        onCommitPackage={noop}
        onCommitPart={noop}
      />
    );

    expect(screen.getByRole('heading', { name: /Uncommitted Services Found/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Uncommitted Items Found/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Uncommitted Parts \(/i)).not.toBeInTheDocument();
  });

  it('only parts → header reads "Uncommitted Parts Found"', () => {
    render(
      <UncommittedServicesWarningModal
        isOpen={true}
        uncommittedPackages={[]}
        uncommittedParts={[makePart()]}
        onClose={noop}
        onProceedAnyway={noop}
        onCommitPackage={noop}
        onCommitPart={noop}
      />
    );

    expect(screen.getByRole('heading', { name: /Uncommitted Parts Found/i })).toBeInTheDocument();
    expect(screen.queryByText(/Uncommitted Services \(/i)).not.toBeInTheDocument();
  });

  it('both → header reads "Uncommitted Items Found", both sections rendered', () => {
    render(
      <UncommittedServicesWarningModal
        isOpen={true}
        uncommittedPackages={[makePackage()]}
        uncommittedParts={[makePart()]}
        onClose={noop}
        onProceedAnyway={noop}
        onCommitPackage={noop}
        onCommitPart={noop}
      />
    );

    expect(screen.getByRole('heading', { name: /Uncommitted Items Found/i })).toBeInTheDocument();
    expect(screen.getByText(/Uncommitted Services \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Uncommitted Parts \(1\)/i)).toBeInTheDocument();
  });

  it('section counts match input array length', () => {
    render(
      <UncommittedServicesWarningModal
        isOpen={true}
        uncommittedPackages={[makePackage(), makePackage({ name: 'Brake Service' })]}
        uncommittedParts={[makePart(), makePart({ name: 'Brake Pad' }), makePart({ name: 'Rotor' })]}
        onClose={noop}
        onProceedAnyway={noop}
        onCommitPackage={noop}
        onCommitPart={noop}
      />
    );

    expect(screen.getByText(/Uncommitted Services \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Uncommitted Parts \(3\)/i)).toBeInTheDocument();
    // 2 packages + 3 parts = 5 total (header summary)
    expect(screen.getByText(/5 items not yet pulled from inventory/i)).toBeInTheDocument();
  });

  it('"Pull from Inventory Now" on a service calls onCommitPackage with the right index', () => {
    const onCommitPackage = jest.fn();
    const onCommitPart = jest.fn();

    render(
      <UncommittedServicesWarningModal
        isOpen={true}
        uncommittedPackages={[makePackage({ packageIndex: 7 })]}
        uncommittedParts={[]}
        onClose={noop}
        onProceedAnyway={noop}
        onCommitPackage={onCommitPackage}
        onCommitPart={onCommitPart}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Pull from Inventory Now/i }));
    expect(onCommitPackage).toHaveBeenCalledWith(7);
    expect(onCommitPart).not.toHaveBeenCalled();
  });

  it('"Pull from Inventory Now" on a part calls onCommitPart with the right index', () => {
    const onCommitPackage = jest.fn();
    const onCommitPart = jest.fn();

    render(
      <UncommittedServicesWarningModal
        isOpen={true}
        uncommittedPackages={[]}
        uncommittedParts={[makePart({ partIndex: 3 })]}
        onClose={noop}
        onProceedAnyway={noop}
        onCommitPackage={onCommitPackage}
        onCommitPart={onCommitPart}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Pull from Inventory Now/i }));
    expect(onCommitPart).toHaveBeenCalledWith(3);
    expect(onCommitPackage).not.toHaveBeenCalled();
  });

  it('"Generate Invoice Without These" calls onProceedAnyway', () => {
    const onProceedAnyway = jest.fn();

    render(
      <UncommittedServicesWarningModal
        isOpen={true}
        uncommittedPackages={[makePackage()]}
        uncommittedParts={[]}
        onClose={noop}
        onProceedAnyway={onProceedAnyway}
        onCommitPackage={noop}
        onCommitPart={noop}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Generate Invoice Without These/i }));
    expect(onProceedAnyway).toHaveBeenCalledTimes(1);
  });

  it('Cancel calls onClose', () => {
    const onClose = jest.fn();

    render(
      <UncommittedServicesWarningModal
        isOpen={true}
        uncommittedPackages={[makePackage()]}
        uncommittedParts={[]}
        onClose={onClose}
        onProceedAnyway={noop}
        onCommitPackage={noop}
        onCommitPart={noop}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders part details (name, qty, price) in the parts section', () => {
    render(
      <UncommittedServicesWarningModal
        isOpen={true}
        uncommittedPackages={[]}
        uncommittedParts={[makePart({ name: 'Brake Pad', quantity: 2, price: 49.99 })]}
        onClose={noop}
        onProceedAnyway={noop}
        onCommitPackage={noop}
        onCommitPart={noop}
      />
    );

    expect(screen.getByText('Brake Pad')).toBeInTheDocument();
    // Line total 2 × 49.99 = $99.98
    expect(screen.getByText(/\$99\.98/)).toBeInTheDocument();
  });

  it('uncommittedParts defaults to [] when prop is omitted (services-only callers still work)', () => {
    render(
      <UncommittedServicesWarningModal
        isOpen={true}
        uncommittedPackages={[makePackage()]}
        onClose={noop}
        onProceedAnyway={noop}
        onCommitPackage={noop}
      />
    );

    // No crash, services section visible, parts section absent.
    expect(screen.getByRole('heading', { name: /Uncommitted Services Found/i })).toBeInTheDocument();
    expect(screen.queryByText(/Uncommitted Parts \(/i)).not.toBeInTheDocument();
  });
});
