import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import ScheduleBlockService from '../../services/scheduleBlockService';
import technicianService from '../../services/technicianService';
import moment from 'moment-timezone';
import { TIMEZONE } from '../../utils/formatters';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const ScheduleBlockList = () => {
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterActive, setFilterActive] = useState('true');
  const [filterTechnician, setFilterTechnician] = useState('');
  const [technicians, setTechnicians] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    fetchTechnicians();
  }, []);

  useEffect(() => {
    fetchBlocks();
  }, [filterActive, filterTechnician]);

  const fetchTechnicians = async () => {
    try {
      const response = await technicianService.getAllTechnicians(true);
      setTechnicians(response.data?.data?.technicians || []);
    } catch (err) {
      console.error('Error fetching technicians:', err);
    }
  };

  const fetchBlocks = async () => {
    try {
      setLoading(true);
      const filters = {};
      if (filterActive !== '') filters.active = filterActive;
      if (filterTechnician) filters.technician = filterTechnician;
      const response = await ScheduleBlockService.getAll(filters);
      setBlocks(response.data?.scheduleBlocks || []);
    } catch (err) {
      console.error('Error fetching schedule blocks:', err);
      setError('Failed to load schedule blocks.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await ScheduleBlockService.remove(id);
      setBlocks(blocks.filter(b => b._id !== id));
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Error deleting schedule block:', err);
      setError('Failed to delete schedule block.');
    }
  };

  const handleToggleActive = async (block) => {
    try {
      await ScheduleBlockService.update(block._id, { active: !block.active });
      fetchBlocks();
    } catch (err) {
      console.error('Error toggling schedule block:', err);
    }
  };

  const formatScheduleSummary = (weeklySchedule) => {
    if (!weeklySchedule || weeklySchedule.length === 0) return 'No schedule';

    // Group entries by time to show compact summaries
    const timeGroups = {};
    weeklySchedule
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
      .forEach(entry => {
        const timeKey = `${entry.startTime}-${entry.endTime}`;
        if (!timeGroups[timeKey]) {
          timeGroups[timeKey] = [];
        }
        timeGroups[timeKey].push(DAY_NAMES[entry.dayOfWeek]);
      });

    return Object.entries(timeGroups)
      .map(([time, days]) => {
        const [start, end] = time.split('-');
        const startFormatted = moment(start, 'HH:mm').format('h:mm A');
        const endFormatted = moment(end, 'HH:mm').format('h:mm A');
        return `${days.join(', ')} ${startFormatted} - ${endFormatted}`;
      })
      .join(' | ');
  };

  const getTechName = (tech) => {
    if (!tech) return 'Unknown';
    return tech.name || `${tech.firstName || ''} ${tech.lastName || ''}`.trim();
  };

  return (
    <div className="max-w-6xl mx-auto">
      <Card
        title="Tasks"
        headerActions={
          <Button to="/schedule-blocks/new" variant="primary" size="sm">
            + New Task
          </Button>
        }
      >
        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <select
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm"
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
              <option value="">All</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Technician</label>
            <select
              value={filterTechnician}
              onChange={(e) => setFilterTechnician(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm"
            >
              <option value="">All Technicians</option>
              {technicians.map(tech => (
                <option key={tech._id} value={tech._id}>{getTechName(tech)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading schedule blocks...</p>
          </div>
        ) : blocks.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg mb-2">No schedule blocks found</p>
            <p className="text-sm">Create a schedule block to reserve recurring or one-time slots on the calendar.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="pb-2 font-semibold text-gray-700">Title</th>
                  <th className="pb-2 font-semibold text-gray-700">Type</th>
                  <th className="pb-2 font-semibold text-gray-700">Technician</th>
                  <th className="pb-2 font-semibold text-gray-700">Category</th>
                  <th className="pb-2 font-semibold text-gray-700">Schedule</th>
                  <th className="pb-2 font-semibold text-gray-700">Status</th>
                  <th className="pb-2 font-semibold text-gray-700 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {blocks.map(block => (
                  <tr key={block._id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 font-medium text-gray-900">{block.title}</td>
                    <td className="py-3">
                      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${
                        block.blockType === 'one-time'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {block.blockType === 'one-time' ? 'One-Time' : 'Recurring'}
                      </span>
                    </td>
                    <td className="py-3 text-gray-700">{getTechName(block.technician)}</td>
                    <td className="py-3">
                      {block.category ? (
                        <span className="inline-block px-2 py-0.5 text-xs font-medium rounded bg-indigo-100 text-indigo-800">
                          {block.category}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3 text-gray-600 text-xs">
                      {block.blockType === 'one-time' ? (
                        <>
                          {moment.tz(block.oneTimeDate, TIMEZONE).format('MMM D, YYYY')}
                          {' '}
                          {moment(block.oneTimeStartTime, 'HH:mm').format('h:mm A')} - {moment(block.oneTimeEndTime, 'HH:mm').format('h:mm A')}
                        </>
                      ) : (
                        <>
                          {formatScheduleSummary(block.weeklySchedule)}
                          <div className="text-gray-400 mt-0.5">
                            {moment.tz(block.effectiveFrom, TIMEZONE).format('MMM D, YYYY')}
                            {block.effectiveUntil ? ` - ${moment.tz(block.effectiveUntil, TIMEZONE).format('MMM D, YYYY')}` : ' - Ongoing'}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="py-3">
                      <button
                        onClick={() => handleToggleActive(block)}
                        className={`inline-block px-2 py-0.5 text-xs font-medium rounded cursor-pointer ${
                          block.active
                            ? 'bg-green-100 text-green-800 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {block.active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Link
                          to={`/schedule-blocks/${block._id}/edit`}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                        >
                          Edit
                        </Link>
                        {deleteConfirm === block._id ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleDelete(block._id)}
                              className="text-red-600 hover:text-red-800 text-xs font-medium"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="text-gray-500 hover:text-gray-700 text-xs font-medium"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(block._id)}
                            className="text-red-500 hover:text-red-700 text-xs font-medium"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default ScheduleBlockList;
