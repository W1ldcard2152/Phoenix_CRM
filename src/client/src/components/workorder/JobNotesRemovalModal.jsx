import React from 'react';

/**
 * Asked when a job with notes filed against it is removed from a work order.
 * Mirrors ServicePackageRemovalModal: the removal itself is already decided, this
 * only settles what happens to the notes.
 *
 * onConfirm('keep')   → notes stay on the work order, tagged with the old job name
 * onConfirm('delete') → notes are removed with the job
 */
const JobNotesRemovalModal = ({ isOpen, onClose, onConfirm, job }) => {
  if (!isOpen || !job) return null;

  const { description, noteCount } = job;
  const plural = noteCount === 1 ? 'note' : 'notes';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="fixed inset-0 bg-black bg-opacity-40" onClick={onClose} />
        <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-200 bg-yellow-50">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-yellow-900">
                <i className="fas fa-sticky-note mr-2 text-yellow-600"></i>
                This Job Has Notes
              </h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <i className="fas fa-times text-lg"></i>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-5">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
              <div className="font-semibold text-gray-900">{description}</div>
              <div className="text-sm text-gray-600 mt-1">
                {noteCount} {plural} filed against this job
              </div>
            </div>
            <p className="text-sm text-gray-700">
              Removing this job leaves {noteCount === 1 ? 'its note' : 'its notes'} with
              nowhere to live. Keep {noteCount === 1 ? 'it' : 'them'} on the work order,
              or delete {noteCount === 1 ? 'it' : 'them'} along with the job?
            </p>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-gray-200 bg-gray-50">
            <div className="flex flex-col gap-2">
              <button
                onClick={() => onConfirm('keep')}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700"
              >
                <i className="fas fa-arrow-up mr-2"></i>
                Keep {noteCount === 1 ? 'Note' : 'Notes'} on the Work Order
              </button>
              <button
                onClick={() => onConfirm('delete')}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700"
              >
                <i className="fas fa-trash mr-2"></i>
                Delete {noteCount === 1 ? 'Note' : 'Notes'} With the Job
              </button>
              <button
                onClick={onClose}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
              >
                Cancel — Keep the Job
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JobNotesRemovalModal;
