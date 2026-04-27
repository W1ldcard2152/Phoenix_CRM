import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import DateTimePicker from '../common/DateTimePicker';
import followUpService from '../../services/followUpService';

const getCurrentLocalDatetime = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
};

const FollowUpModal = ({ isOpen, onClose, entityType, entityId, onCreated }) => {
  const [note, setNote] = useState('');
  const [noteTimestamp, setNoteTimestamp] = useState('');
  const [priority, setPriority] = useState('normal');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Pre-fill timestamp with current date/time when modal opens
  useEffect(() => {
    if (isOpen) {
      setNoteTimestamp(getCurrentLocalDatetime());
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!note.trim()) {
      setError('Note is required');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      const result = await followUpService.createFollowUp({
        entityType,
        entityId,
        note: note.trim(),
        noteTimestamp: noteTimestamp || undefined,
        priority,
        dueDate: dueDate || undefined
      });
      onCreated?.(result.data.followUp);
      handleClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create follow-up');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setNote('');
    setNoteTimestamp('');
    setPriority('normal');
    setDueDate('');
    setError('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create Follow-Up">
      <form onSubmit={handleSubmit}>
        {error && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Note <span className="text-red-500">*</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="What needs to be followed up on?"
            autoFocus
          />
        </div>

        <DateTimePicker
          label="Note Date/Time"
          value={noteTimestamp}
          onChange={setNoteTimestamp}
          helpText="Pre-filled with now. Adjust if logging retroactively."
          className="mb-4"
        />

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex justify-end space-x-3 mt-4">
          <Button type="button" variant="light" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Follow-Up'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default FollowUpModal;
