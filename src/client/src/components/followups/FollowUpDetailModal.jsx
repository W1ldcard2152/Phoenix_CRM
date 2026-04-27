import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import DateTimePicker from '../common/DateTimePicker';
import followUpService from '../../services/followUpService';
import { formatDateTime, formatDate } from '../../utils/formatters';

const priorityConfig = {
  urgent: { label: 'Urgent', className: 'bg-red-100 text-red-800' },
  high: { label: 'High', className: 'bg-orange-100 text-orange-800' },
  normal: { label: 'Normal', className: 'bg-blue-100 text-blue-800' },
  low: { label: 'Low', className: 'bg-gray-100 text-gray-600' }
};

const FollowUpDetailModal = ({ isOpen, onClose, followUpId, followUpData, onUpdated, onDeleted }) => {
  const [followUp, setFollowUp] = useState(followUpData || null);
  const [loading, setLoading] = useState(!followUpData);
  const [error, setError] = useState('');

  // Add note state
  const [newNoteText, setNewNoteText] = useState('');
  const [newNoteTimestamp, setNewNoteTimestamp] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Edit note state
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editNoteText, setEditNoteText] = useState('');
  const [editNoteTimestamp, setEditNoteTimestamp] = useState('');

  // Close state
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [resolutionNote, setResolutionNote] = useState('');
  const [closing, setClosing] = useState(false);

  // Edit fields state
  const [editingFields, setEditingFields] = useState(false);
  const [editPriority, setEditPriority] = useState('');
  const [editDueDate, setEditDueDate] = useState('');

  // Delete confirm
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (isOpen && followUpId && !followUpData) {
      fetchFollowUp();
    } else if (followUpData) {
      setFollowUp(followUpData);
    }
  }, [isOpen, followUpId, followUpData]);

  const fetchFollowUp = async () => {
    try {
      setLoading(true);
      const result = await followUpService.getFollowUp(followUpId);
      setFollowUp(result.data.followUp);
    } catch (err) {
      setError('Failed to load follow-up');
    } finally {
      setLoading(false);
    }
  };

  const refreshFollowUp = (updated) => {
    setFollowUp(updated);
    onUpdated?.(updated);
  };

  // --- Notes ---
  const handleAddNote = async () => {
    if (!newNoteText.trim()) return;
    try {
      setAddingNote(true);
      const result = await followUpService.addNote(followUp._id, {
        text: newNoteText.trim(),
        timestamp: newNoteTimestamp || undefined
      });
      refreshFollowUp(result.data.followUp);
      setNewNoteText('');
      setNewNoteTimestamp('');
    } catch (err) {
      setError('Failed to add note');
    } finally {
      setAddingNote(false);
    }
  };

  const startEditNote = (note) => {
    setEditingNoteId(note._id);
    setEditNoteText(note.text);
    // Format timestamp for datetime-local input
    const dt = new Date(note.timestamp);
    const pad = (n) => String(n).padStart(2, '0');
    setEditNoteTimestamp(`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`);
  };

  const handleUpdateNote = async () => {
    try {
      const result = await followUpService.updateNote(followUp._id, editingNoteId, {
        text: editNoteText.trim(),
        timestamp: editNoteTimestamp || undefined
      });
      refreshFollowUp(result.data.followUp);
      setEditingNoteId(null);
    } catch (err) {
      setError('Failed to update note');
    }
  };

  const handleDeleteNote = async (noteId) => {
    try {
      const result = await followUpService.deleteNote(followUp._id, noteId);
      refreshFollowUp(result.data.followUp);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete note');
    }
  };

  // --- Close / Reopen ---
  const handleClose = async () => {
    if (!resolutionNote.trim()) return;
    try {
      setClosing(true);
      const result = await followUpService.closeFollowUp(followUp._id, resolutionNote.trim());
      refreshFollowUp(result.data.followUp);
      setShowCloseForm(false);
      setResolutionNote('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to close follow-up');
    } finally {
      setClosing(false);
    }
  };

  const handleReopen = async () => {
    try {
      const result = await followUpService.reopenFollowUp(followUp._id);
      refreshFollowUp(result.data.followUp);
    } catch (err) {
      setError('Failed to reopen follow-up');
    }
  };

  // --- Edit priority/dueDate ---
  const startEditFields = () => {
    setEditingFields(true);
    setEditPriority(followUp.priority);
    const dd = followUp.dueDate ? new Date(followUp.dueDate).toISOString().split('T')[0] : '';
    setEditDueDate(dd);
  };

  const handleSaveFields = async () => {
    try {
      const result = await followUpService.updateFollowUp(followUp._id, {
        priority: editPriority,
        dueDate: editDueDate || null
      });
      refreshFollowUp(result.data.followUp);
      setEditingFields(false);
    } catch (err) {
      setError('Failed to update follow-up');
    }
  };

  // --- Delete ---
  const handleDelete = async () => {
    try {
      await followUpService.deleteFollowUp(followUp._id);
      onDeleted?.(followUp._id);
      onClose();
    } catch (err) {
      setError('Failed to delete follow-up');
    }
  };

  const handleModalClose = () => {
    setShowCloseForm(false);
    setEditingNoteId(null);
    setEditingFields(false);
    setShowDeleteConfirm(false);
    setError('');
    onClose();
  };

  // Build breadcrumb links
  const buildBreadcrumbLinks = () => {
    if (!followUp) return [];
    const links = [];
    if (followUp.customer?.name) {
      links.push({ label: followUp.customer.name, href: `/customers/${followUp.customer._id}` });
    }
    if (followUp.vehicle) {
      const vLabel = `${followUp.vehicle.year || ''} ${followUp.vehicle.make || ''} ${followUp.vehicle.model || ''}`.trim();
      links.push({ label: vLabel, href: `/vehicles/${followUp.vehicle._id}` });
    }
    if (followUp.workOrder) {
      const isQuote = followUp.entityType === 'quote';
      const woId = followUp.workOrder._id || followUp.workOrder;
      links.push({
        label: isQuote ? 'Quote' : 'Work Order',
        href: isQuote ? `/quotes/${woId}` : `/work-orders/${woId}`
      });
    }
    if (followUp.invoice?.invoiceNumber) {
      links.push({ label: `Invoice #${followUp.invoice.invoiceNumber}`, href: `/invoices/${followUp.invoice._id}` });
    }
    if (followUp.appointment) {
      const apptId = followUp.appointment._id || followUp.appointment;
      links.push({ label: 'Appointment', href: `/appointments/${apptId}` });
    }
    return links;
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleModalClose} title="Follow-Up Details" size="lg">
      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : !followUp ? (
        <div className="text-center py-8 text-red-500">{error || 'Follow-up not found'}</div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="p-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
              {error}
              <button onClick={() => setError('')} className="ml-2 text-red-500 hover:text-red-700">&times;</button>
            </div>
          )}

          {/* Header: breadcrumb + badges */}
          <div className="border-b pb-3">
            <div className="text-sm text-gray-500 mb-2 flex flex-wrap items-center gap-1">
              {buildBreadcrumbLinks().map((link, i) => (
                <span key={link.href} className="flex items-center gap-1">
                  {i > 0 && <span className="text-gray-400">→</span>}
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    {link.label}
                    <i className="fas fa-external-link-alt text-[10px] ml-1 opacity-50"></i>
                  </a>
                </span>
              ))}
            </div>
            <div className="flex items-center flex-wrap gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                followUp.status === 'open' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
              }`}>
                {followUp.status === 'open' ? 'Open' : 'Closed'}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityConfig[followUp.priority]?.className}`}>
                {priorityConfig[followUp.priority]?.label}
              </span>
              {followUp.dueDate && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  followUp.isOverdue ? 'bg-red-100 text-red-800' : 'bg-blue-50 text-blue-700'
                }`}>
                  {followUp.isOverdue ? 'Overdue: ' : 'Due: '}{formatDate(followUp.dueDate)}
                </span>
              )}
              {!editingFields && followUp.status === 'open' && (
                <button onClick={startEditFields} className="text-xs text-blue-600 hover:text-blue-800 ml-1">
                  <i className="fas fa-pencil-alt mr-1"></i>Edit
                </button>
              )}
            </div>

            {/* Edit priority/due date inline */}
            {editingFields && (
              <div className="mt-3 flex items-end gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
                  <select value={editPriority} onChange={(e) => setEditPriority(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-sm">
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label>
                  <input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-sm" />
                </div>
                <Button size="sm" variant="primary" onClick={handleSaveFields}>Save</Button>
                <Button size="sm" variant="light" onClick={() => setEditingFields(false)}>Cancel</Button>
              </div>
            )}
          </div>

          {/* Resolution note (if closed) */}
          {followUp.status === 'closed' && followUp.resolutionNote && (
            <div className="bg-green-50 border border-green-200 rounded p-3">
              <div className="text-xs font-medium text-green-800 mb-1">
                Resolution {followUp.closedAt && `— ${formatDateTime(followUp.closedAt)}`}
              </div>
              <div className="text-sm text-green-900">{followUp.resolutionNote}</div>
            </div>
          )}

          {/* Notes timeline */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Notes</h4>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {followUp.notes.map((note, idx) => (
                <div key={note._id} className="bg-gray-50 rounded p-3 border border-gray-100">
                  {editingNoteId === note._id ? (
                    <div className="space-y-2">
                      <textarea value={editNoteText} onChange={(e) => setEditNoteText(e.target.value)}
                        rows={2} className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
                      <div>
                        <DateTimePicker
                          label="Timestamp"
                          value={editNoteTimestamp}
                          onChange={setEditNoteTimestamp}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="primary" onClick={handleUpdateNote}>Save</Button>
                        <Button size="sm" variant="light" onClick={() => setEditingNoteId(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between">
                        <p className="text-sm text-gray-800 whitespace-pre-wrap flex-1">{note.text}</p>
                        {followUp.status === 'open' && (
                          <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                            <button onClick={() => startEditNote(note)}
                              className="text-gray-400 hover:text-blue-600 text-xs p-1" title="Edit note">
                              <i className="fas fa-pencil-alt"></i>
                            </button>
                            {followUp.notes.length > 1 && (
                              <button onClick={() => handleDeleteNote(note._id)}
                                className="text-gray-400 hover:text-red-600 text-xs p-1" title="Delete note">
                                <i className="fas fa-trash"></i>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {formatDateTime(note.timestamp)}
                        {note.createdByName && ` — ${note.createdByName}`}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Add note form (only if open) */}
          {followUp.status === 'open' && (
            <div className="border-t pt-3">
              <div className="flex gap-2">
                <div className="flex-1">
                  <textarea
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    rows={2}
                    placeholder="Add a note..."
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <DateTimePicker
                    value={newNoteTimestamp}
                    onChange={setNewNoteTimestamp}
                    helpText="Optional — defaults to now if left blank"
                    className="mt-1"
                  />
                </div>
                <Button size="sm" variant="primary" onClick={handleAddNote} disabled={addingNote || !newNoteText.trim()}
                  className="self-start">
                  {addingNote ? '...' : 'Add'}
                </Button>
              </div>
            </div>
          )}

          {/* Close form */}
          {showCloseForm && (
            <div className="border-t pt-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Resolution Note <span className="text-red-500">*</span>
              </label>
              <textarea
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                rows={2}
                placeholder="What was the outcome?"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-2"
                autoFocus
              />
              <div className="flex gap-2">
                <Button size="sm" variant="success" onClick={handleClose}
                  disabled={closing || !resolutionNote.trim()}>
                  {closing ? 'Saving...' : 'Mark Follow-Up Closed'}
                </Button>
                <Button size="sm" variant="light" onClick={() => { setShowCloseForm(false); setResolutionNote(''); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Delete confirm */}
          {showDeleteConfirm && (
            <div className="border-t pt-3 bg-red-50 rounded p-3">
              <p className="text-sm text-red-800 mb-2">Are you sure you want to delete this follow-up? This cannot be undone.</p>
              <div className="flex gap-2">
                <Button size="sm" variant="danger" onClick={handleDelete}>Delete</Button>
                <Button size="sm" variant="light" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="border-t pt-3 flex justify-between">
            <div className="flex gap-2">
              {followUp.status === 'open' && !showCloseForm && (
                <Button size="sm" variant="success" onClick={() => setShowCloseForm(true)}>
                  <i className="fas fa-check mr-1"></i>Mark Closed
                </Button>
              )}
              {followUp.status === 'closed' && (
                <Button size="sm" variant="outline" onClick={handleReopen}>
                  <i className="fas fa-redo mr-1"></i>Reopen
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {!showDeleteConfirm && (
                <Button size="sm" variant="danger" onClick={() => setShowDeleteConfirm(true)}>
                  <i className="fas fa-trash mr-1"></i>Delete
                </Button>
              )}
            </div>
          </div>

          {/* Meta info */}
          <div className="text-xs text-gray-400 border-t pt-2">
            Created {formatDateTime(followUp.createdAt)} by {followUp.createdByName || followUp.createdBy?.name || 'Unknown'}
          </div>
        </div>
      )}
    </Modal>
  );
};

export default FollowUpDetailModal;
