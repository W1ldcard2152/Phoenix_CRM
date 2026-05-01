import React, { useState, useEffect, useMemo } from 'react';
import { formatCurrency } from '../../utils/formatters';
import { buildLineList, distributeDiscount } from '../../utils/discountUtils';

const DiscountModal = ({ isOpen, onClose, onApply, onRemove, parts, labor, servicePackages, existingDiscount }) => {
  const [type, setType] = useState('percent');
  const [value, setValue] = useState('');
  const [description, setDescription] = useState('');
  const [selectedKeys, setSelectedKeys] = useState(new Set());

  const lines = useMemo(
    () => buildLineList(parts, labor, servicePackages),
    [parts, labor, servicePackages]
  );

  // Reset/prefill when modal opens
  useEffect(() => {
    if (!isOpen) return;
    if (existingDiscount) {
      setType(existingDiscount.type || 'percent');
      setValue(existingDiscount.value != null ? String(existingDiscount.value) : '');
      setDescription(existingDiscount.description || '');
      const keys = new Set(
        (existingDiscount.appliedTo || []).map(a => `${a.lineType}:${a.lineId}`)
      );
      setSelectedKeys(keys);
    } else {
      setType('percent');
      setValue('');
      setDescription('');
      setSelectedKeys(new Set());
    }
  }, [isOpen, existingDiscount]);

  if (!isOpen) return null;

  const partLines = lines.filter(l => l.lineType === 'part');
  const laborLines = lines.filter(l => l.lineType === 'labor');
  const serviceLines = lines.filter(l => l.lineType === 'service');

  const toggleLine = (key) => {
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedKeys(next);
  };

  const allKeys = lines.map(l => l.key);
  const allSelected = allKeys.length > 0 && allKeys.every(k => selectedKeys.has(k));
  const toggleAll = () => {
    if (allSelected) setSelectedKeys(new Set());
    else setSelectedKeys(new Set(allKeys));
  };

  const previewDiscount = {
    type,
    value: parseFloat(value) || 0,
    appliedTo: lines
      .filter(l => selectedKeys.has(l.key))
      .map(l => ({ lineType: l.lineType, lineId: l.lineId }))
  };
  const { totalDiscountAmount } = distributeDiscount(lines, previewDiscount);
  const selectedSubtotal = lines
    .filter(l => selectedKeys.has(l.key))
    .reduce((sum, l) => sum + l.subtotal, 0);

  const canApply = selectedKeys.size > 0 && parseFloat(value) > 0;

  const handleApply = () => {
    if (!canApply) return;
    onApply({
      type,
      value: parseFloat(value),
      description: description.trim(),
      appliedTo: previewDiscount.appliedTo
    });
  };

  const renderGroup = (title, groupLines) => {
    if (groupLines.length === 0) return null;
    return (
      <div className="mb-3">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{title}</div>
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
          {groupLines.map(line => (
            <label
              key={line.key}
              className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedKeys.has(line.key)}
                onChange={() => toggleLine(line.key)}
                className="mr-3 h-4 w-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
              />
              <span className="flex-1 text-sm text-gray-800 truncate">{line.label}</span>
              <span className="text-sm font-medium text-gray-700 ml-3 whitespace-nowrap">
                {formatCurrency(line.subtotal)}
              </span>
            </label>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 py-6">
        <div className="fixed inset-0 bg-black bg-opacity-40" onClick={onClose} />
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-200 bg-blue-50">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-blue-900">
                <i className="fas fa-tag mr-2 text-blue-600"></i>
                {existingDiscount ? 'Edit Coupon' : 'Add Coupon'}
              </h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <i className="fas fa-times text-lg"></i>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-5 overflow-y-auto">
            {lines.length === 0 ? (
              <div className="text-center text-gray-500 py-6">
                No parts, labor, or service packages available to discount.
              </div>
            ) : (
              <>
                {/* Line selection */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-semibold text-gray-700">
                      Apply to
                    </label>
                    <label className="flex items-center text-sm text-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="mr-2 h-4 w-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                      />
                      Select all
                    </label>
                  </div>
                  {renderGroup('Parts', partLines)}
                  {renderGroup('Labor', laborLines)}
                  {renderGroup('Service Packages', serviceLines)}
                </div>

                {/* Discount type + value */}
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Discount
                  </label>
                  <div className="flex gap-2 items-center">
                    <div className="flex border border-gray-300 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setType('percent')}
                        className={`px-3 py-2 text-sm font-medium ${
                          type === 'percent'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        Percent (%)
                      </button>
                      <button
                        type="button"
                        onClick={() => setType('fixed')}
                        className={`px-3 py-2 text-sm font-medium border-l border-gray-300 ${
                          type === 'fixed'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        Fixed ($)
                      </button>
                    </div>
                    <div className="relative flex-1">
                      {type === 'fixed' && (
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                      )}
                      <input
                        type="number"
                        min="0"
                        step={type === 'percent' ? '1' : '0.01'}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder={type === 'percent' ? 'e.g. 10' : 'e.g. 25.00'}
                        className={`w-full border border-gray-300 rounded-lg py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                          type === 'fixed' ? 'pl-7 pr-3' : 'px-3 pr-8'
                        }`}
                      />
                      {type === 'percent' && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">%</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Description <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Spring Promo, $50 Oil Change"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Live preview */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>Selected subtotal</span>
                    <span className="font-medium text-gray-800">{formatCurrency(selectedSubtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold text-gray-700">Discount</span>
                    <span className="font-bold text-green-700">−{formatCurrency(totalDiscountAmount)}</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-gray-200 bg-gray-50 flex gap-3">
            {existingDiscount && onRemove && (
              <button
                onClick={onRemove}
                className="py-2.5 px-4 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700"
              >
                <i className="fas fa-trash mr-2"></i>Remove
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={!canApply}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold text-white ${
                canApply ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-300 cursor-not-allowed'
              }`}
            >
              {existingDiscount ? 'Save' : 'Apply Coupon'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DiscountModal;
