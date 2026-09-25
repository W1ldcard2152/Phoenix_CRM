import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import moment from 'moment';
import vehicleCheckInService from '../../../services/vehicleCheckInService';
import { useAuth } from '../../../contexts/AuthContext';

/**
 * Vehicles technicians checked in that aren't on file yet, waiting for the
 * office to match them to an owner. Each opens Scan Vehicle with the
 * technician's scan already loaded.
 *
 * hideWhenEmpty — render nothing when the queue is empty (the Scan Vehicle page);
 *                 the dashboard keeps the box so its layout doesn't jump.
 */
const PendingCheckIns = ({ hideWhenEmpty = false, className = '' }) => {
  const { user } = useAuth();
  const [checkIns, setCheckIns] = useState(null);

  useEffect(() => {
    vehicleCheckInService.list('open')
      .then(setCheckIns)
      .catch(() => setCheckIns([]));
  }, []);

  if (checkIns === null) return hideWhenEmpty ? null : (
    <div className={`bg-white rounded-lg shadow-md border border-amber-200 p-4 animate-pulse ${className}`}>
      <div className="h-4 bg-gray-200 rounded w-2/3 mb-3"></div>
      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
    </div>
  );
  if (hideWhenEmpty && checkIns.length === 0) return null;

  const mine = (c) => c.assignedTo && user && String(c.assignedTo._id) === String(user._id);
  // Anything assigned to the viewer first, then newest.
  const sorted = [...checkIns].sort((a, b) => Number(mine(b)) - Number(mine(a)));

  return (
    <div className={`bg-white rounded-lg shadow-md border border-amber-200 overflow-hidden flex flex-col ${className}`}>
      <div className="px-4 py-3 bg-amber-50 border-b border-amber-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <i className="fas fa-car-side text-amber-700 text-sm"></i>
            <h3 className="text-sm font-semibold text-amber-700">Tech Check-Ins</h3>
          </div>
          <span className="bg-amber-500 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center">
            {checkIns.length}
          </span>
        </div>
      </div>
      <div className="flex-1 p-2">
        {sorted.length === 0 ? (
          <div className="text-center py-4 text-gray-400 text-sm">No vehicles waiting for an owner</div>
        ) : (
          <ul className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {sorted.map(c => (
              <li key={c._id}>
                <Link to={`/vehicles/scan?checkIn=${c._id}`} className="block py-2 px-2 rounded hover:bg-gray-50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-800 truncate">{c.vehicleSummary || 'Unknown vehicle'}</span>
                    {mine(c) && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 whitespace-nowrap">For you</span>}
                  </div>
                  <div className="text-xs text-gray-500 truncate mt-0.5">
                    {c.submittedByName || 'Technician'} · {moment(c.createdAt).fromNow()}
                  </div>
                  {c.note && <div className="text-xs text-gray-600 truncate mt-0.5">{c.note}</div>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default PendingCheckIns;
