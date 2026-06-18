import React, { useState } from 'react';

const inputCls =
  'w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-primary-500';
const labelCls = 'block text-[11px] font-medium text-gray-500 mb-0.5';

// Manager-only review form, seeded from the selected offer. The manager can edit any
// field, then commit — which writes these values onto the placeholder part. Retail
// price auto-derives from cost via the shop markup but can be overridden here.
export default function ApprovalPanel({ offer, markupPercentage = 30, saving, onApprove }) {
  const mult = 1 + (Number(markupPercentage) || 0) / 100;
  const initCost = offer && offer.price != null ? offer.price : 0;

  const [form, setForm] = useState({
    name: (offer && offer.description) || '',
    vendor: (offer && offer.seller) || '',
    supplier: (offer && offer.marketplaceSeller) || '',
    brand: (offer && offer.manufacturer) || '',
    partNumber: (offer && offer.partNumber) || '',
    cost: initCost ? String(initCost) : '',
    coreCharge: offer && offer.coreCharge ? String(offer.coreCharge) : '',
    url: (offer && offer.url) || '',
    price: initCost ? String(Math.round(initCost * mult * 100) / 100) : '',
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  // Editing cost re-derives the retail price (manager can still override price after).
  const onCost = (v) => {
    const c = parseFloat(v);
    setForm((f) => ({ ...f, cost: v, price: v === '' || Number.isNaN(c) ? '' : String(Math.round(c * mult * 100) / 100) }));
  };

  const canApprove = form.name.trim() && !saving;

  const submit = () => {
    if (!canApprove) return;
    onApprove({
      name: form.name.trim(),
      vendor: form.vendor.trim(),
      supplier: form.supplier.trim(),
      brand: form.brand.trim(),
      partNumber: form.partNumber.trim(),
      cost: form.cost === '' ? 0 : parseFloat(form.cost) || 0,
      coreCharge: form.coreCharge === '' ? 0 : parseFloat(form.coreCharge) || 0,
      url: form.url.trim(),
      price: form.price === '' ? null : parseFloat(form.price) || 0,
    });
  };

  const field = (label, key, props = {}) => (
    <div>
      <label className={labelCls}>{label}</label>
      <input className={inputCls} value={form[key]} onChange={(e) => set(key, e.target.value)} {...props} />
    </div>
  );

  return (
    <div className="border border-emerald-200 bg-emerald-50/50 rounded-lg p-3">
      <h4 className="text-sm font-semibold text-emerald-800 mb-2">
        <i className="fas fa-clipboard-check mr-1" />Review &amp; commit to work order
      </h4>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">{field('Description', 'name')}</div>
        {field('Vendor', 'vendor')}
        {field('Marketplace Seller', 'supplier')}
        {field('Brand', 'brand')}
        {field('Part #', 'partNumber')}
        <div>
          <label className={labelCls}>Cost</label>
          <input type="number" min="0" step="0.01" className={inputCls} value={form.cost} onChange={(e) => onCost(e.target.value)} />
        </div>
        {field('Retail Price', 'price', { type: 'number', min: '0', step: '0.01' })}
        {field('Core Charge', 'coreCharge', { type: 'number', min: '0', step: '0.01' })}
        <div className="col-span-2">{field('URL', 'url', { type: 'url' })}</div>
      </div>
      <button
        type="button"
        disabled={!canApprove}
        onClick={submit}
        className={`mt-3 px-3 py-1.5 text-sm rounded-md text-white ${
          canApprove ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-gray-300 cursor-not-allowed'
        }`}
      >
        {saving ? 'Committing…' : 'Approve & commit to work order'}
      </button>
    </div>
  );
}
