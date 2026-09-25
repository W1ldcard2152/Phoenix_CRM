import React, { useEffect, useState } from 'react';
import Button from '../../common/Button';
import CustomerService from '../../../services/customerService';
import { capitalizeWords } from '../../../utils/formatters';

// Stored phone format is xxx-xxx-xxxx (same as the customer forms).
const formatPhoneInput = (value) => {
  const digits = (value || '').replace(/\D/g, '').slice(0, 10);
  if (digits.length < 4) return digits;
  if (digits.length < 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
};

const PHONE_PATTERN = /^\d{3}-\d{3}-\d{4}$/;

const inputCls = 'block w-full px-3 py-3 sm:py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 text-base sm:text-sm';

/**
 * Pick an existing customer, or describe a new one (name + phone). A new
 * customer is NOT created here — onSelect gets { isNew: true, name, phone } and
 * the page creates it on save, so backing out never leaves an orphan customer.
 */
const OwnerPicker = ({ onSelect, onCancel }) => {
  const [mode, setMode] = useState('search'); // search | new
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [existingByPhone, setExistingByPhone] = useState(null);
  const [touched, setTouched] = useState(false);

  // Debounced server-side search on name / phone / email.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const response = await CustomerService.searchCustomers(q);
        if (!cancelled) setResults((response.data.customers || []).slice(0, 8));
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  const checkPhone = async (value) => {
    setExistingByPhone(null);
    if (!PHONE_PATTERN.test(value)) return;
    try {
      const response = await CustomerService.checkExistingCustomerByPhone(value);
      if (response.exists) setExistingByPhone(response.data.customer);
    } catch {
      // Not blocking — the duplicate check is a convenience.
    }
  };

  const nameError = touched && !name.trim() ? 'Name is required' : null;
  const phoneError = touched && !PHONE_PATTERN.test(phone) ? 'Phone must be xxx-xxx-xxxx' : null;

  const useNew = () => {
    setTouched(true);
    if (!name.trim() || !PHONE_PATTERN.test(phone)) return;
    onSelect({ isNew: true, name: capitalizeWords(name.trim()), phone });
  };

  if (mode === 'new') {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name<span className="text-red-500 ml-0.5">*</span></label>
            <input
              className={inputCls}
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setName(capitalizeWords(name.trim()))}
              placeholder="Jane Smith"
            />
            {nameError && <p className="text-xs text-red-600 mt-1">{nameError}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Phone<span className="text-red-500 ml-0.5">*</span></label>
            <input
              className={inputCls}
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => { setPhone(formatPhoneInput(e.target.value)); setExistingByPhone(null); }}
              onBlur={() => checkPhone(phone)}
              placeholder="555-123-4567"
            />
            {phoneError && <p className="text-xs text-red-600 mt-1">{phoneError}</p>}
          </div>
        </div>

        {existingByPhone && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm px-3 py-2 rounded">
            <p><i className="fas fa-exclamation-triangle mr-1"></i>{existingByPhone.name} already has this phone number.</p>
            <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => onSelect(existingByPhone)}>
              Use {existingByPhone.name}
            </Button>
          </div>
        )}

        <div className="flex justify-between gap-2">
          <Button type="button" size="sm" variant="light" onClick={() => setMode('search')}>
            <i className="fas fa-arrow-left mr-1"></i>Search instead
          </Button>
          <Button type="button" size="sm" variant="primary" onClick={useNew}>
            <i className="fas fa-user-plus mr-1"></i>Use new customer
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className={inputCls}
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customers by name or phone…"
        />
        <Button type="button" variant="primary" onClick={() => setMode('new')} className="whitespace-nowrap">
          <i className="fas fa-user-plus mr-1"></i>New
        </Button>
      </div>

      {searching && <p className="text-xs text-gray-500"><i className="fas fa-spinner fa-spin mr-1"></i>Searching…</p>}
      {!searching && query.trim().length >= 2 && results.length === 0 && (
        <p className="text-xs text-gray-500">No customers match. Use <strong>New</strong> to add one.</p>
      )}

      {results.length > 0 && (
        <div className="divide-y divide-gray-100 border border-gray-200 rounded-md overflow-hidden bg-white">
          {results.map(c => (
            <button
              key={c._id}
              type="button"
              onClick={() => onSelect(c)}
              className="w-full text-left px-3 py-2 hover:bg-primary-50"
            >
              <span className="block text-sm font-medium text-gray-900">{c.name}</span>
              <span className="block text-xs text-gray-500">{[c.phone, c.email].filter(Boolean).join(' · ')}</span>
            </button>
          ))}
        </div>
      )}

      {onCancel && (
        <div className="flex justify-end">
          <button type="button" className="text-xs text-gray-500 hover:text-gray-800" onClick={onCancel}>Cancel</button>
        </div>
      )}
    </div>
  );
};

export default OwnerPicker;
