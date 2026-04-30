import React, { useState, useEffect } from 'react';
import SettingsService from '../../services/settingsService';

const ManageBrandsModal = ({ isOpen, onClose, brandOverrides = [], onChange, onApplied }) => {
  const [newBrand, setNewBrand] = useState('');
  const [editingBrand, setEditingBrand] = useState(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [applyingBrand, setApplyingBrand] = useState(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setNewBrand('');
      setEditingBrand(null);
      setEditingDraft('');
      setError('');
      setSuccessMsg('');
      setApplyingBrand(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAdd = async () => {
    if (!newBrand.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await SettingsService.addBrandOverride(newBrand.trim());
      onChange(res.data.settings.brandOverrides || []);
      setNewBrand('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add brand override');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (brand) => {
    setSaving(true);
    setError('');
    try {
      const res = await SettingsService.removeBrandOverride(brand);
      onChange(res.data.settings.brandOverrides || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to remove brand override');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (brand) => {
    setEditingBrand(brand);
    setEditingDraft(brand);
    setError('');
  };

  const cancelEdit = () => {
    setEditingBrand(null);
    setEditingDraft('');
  };

  const handleApplyOne = async (brand) => {
    setApplyingBrand(brand);
    setError('');
    setSuccessMsg('');
    try {
      const res = await SettingsService.applyBrandOverrideToInventory(brand);
      const count = res.data?.updatedCount ?? 0;
      setSuccessMsg(count === 0
        ? `No inventory items needed updating for "${brand}".`
        : `Updated ${count} inventory item${count !== 1 ? 's' : ''} to "${brand}".`);
      if (count > 0 && onApplied) onApplied();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to apply override to inventory');
    } finally {
      setApplyingBrand(null);
    }
  };

  const handleApplyAll = async () => {
    setApplyingBrand('__all__');
    setError('');
    setSuccessMsg('');
    try {
      const res = await SettingsService.applyAllBrandOverridesToInventory();
      const count = res.data?.updatedCount ?? 0;
      setSuccessMsg(count === 0
        ? 'All inventory items already match the override casing.'
        : `Updated ${count} inventory item${count !== 1 ? 's' : ''} across all brand overrides.`);
      if (count > 0 && onApplied) onApplied();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to apply overrides to inventory');
    } finally {
      setApplyingBrand(null);
    }
  };

  const saveEdit = async () => {
    const next = editingDraft.trim();
    if (!next || next === editingBrand) {
      cancelEdit();
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await SettingsService.updateBrandOverride(editingBrand, next);
      onChange(res.data.settings.brandOverrides || []);
      cancelEdit();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update brand override');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-gray-900">Manage Brand Overrides</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Brand names entered here keep their exact casing during receipt import. Useful for unusual capitalization
          like <span className="font-mono bg-gray-100 px-1 rounded">ACDelco</span> or <span className="font-mono bg-gray-100 px-1 rounded">BorgWarner</span> that the default rules can't infer.
        </p>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newBrand}
            onChange={(e) => setNewBrand(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="e.g., ACDelco, BorgWarner, MOPAR"
            className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <button
            onClick={handleAdd}
            disabled={saving || !newBrand.trim()}
            className="px-4 py-2 bg-primary-600 text-white rounded text-sm font-medium disabled:opacity-50"
          >
            Add
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm mb-3">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-md text-sm mb-3">
            {successMsg}
          </div>
        )}

        {brandOverrides.length === 0 ? (
          <p className="text-sm text-gray-400 italic text-center py-4">No brand overrides yet.</p>
        ) : (
          <div className="border rounded-md divide-y">
            {brandOverrides.map(brand => (
              <div key={brand} className="flex items-center justify-between px-3 py-2">
                {editingBrand === brand ? (
                  <>
                    <input
                      type="text"
                      value={editingDraft}
                      onChange={(e) => setEditingDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit();
                        else if (e.key === 'Escape') cancelEdit();
                      }}
                      autoFocus
                      className="flex-1 px-2 py-1 text-sm border border-primary-400 rounded focus:outline-none focus:ring-1 focus:ring-primary-500 mr-2"
                    />
                    <div className="flex gap-1">
                      <button onClick={saveEdit} disabled={saving} className="px-2 py-1 text-xs bg-green-600 text-white rounded font-medium disabled:opacity-50">
                        Save
                      </button>
                      <button onClick={cancelEdit} disabled={saving} className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded font-medium">
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="font-mono text-sm text-gray-800">{brand}</span>
                    <div className="flex gap-2 items-center">
                      <button
                        onClick={() => handleApplyOne(brand)}
                        disabled={applyingBrand !== null}
                        className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded font-medium hover:bg-blue-100 disabled:opacity-50"
                        title={`Rewrite all inventory items containing "${brand}" (any casing) to "${brand}"`}
                      >
                        {applyingBrand === brand ? 'Applying...' : 'Apply'}
                      </button>
                      <button onClick={() => startEdit(brand)} className="text-gray-400 hover:text-primary-600" title={`Edit ${brand}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button onClick={() => handleRemove(brand)} disabled={saving} className="text-red-400 hover:text-red-600 disabled:opacity-50" title={`Remove ${brand}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                        </svg>
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-between items-center mt-4">
          <button
            onClick={handleApplyAll}
            disabled={applyingBrand !== null || brandOverrides.length === 0}
            className="px-3 py-2 text-sm bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:opacity-50"
            title="Rewrite every inventory item to use the casing of all overrides above"
          >
            {applyingBrand === '__all__' ? 'Applying...' : 'Apply All to Inventory'}
          </button>
          <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded text-sm font-medium hover:bg-gray-200">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default ManageBrandsModal;
