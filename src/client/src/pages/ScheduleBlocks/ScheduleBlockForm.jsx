import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import SelectInput from '../../components/common/SelectInput';
import ScheduleBlockService from '../../services/scheduleBlockService';
import SettingsService from '../../services/settingsService';
import technicianService from '../../services/technicianService';
import { useAuth } from '../../contexts/AuthContext';
import { isAdminOrManagement } from '../../utils/permissions';
import moment from 'moment-timezone';
import { TIMEZONE } from '../../utils/formatters';

const DAY_OPTIONS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' }
];

// Generate time options in 15-min increments from 6 AM to 8 PM
const generateTimeOptions = () => {
  const options = [];
  for (let hour = 6; hour <= 20; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      if (hour === 20 && minute > 0) break;
      const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      const display = moment(time, 'HH:mm').format('h:mm A');
      options.push({ value: time, label: display });
    }
  }
  return options;
};

const TIME_OPTIONS = generateTimeOptions();

const ScheduleBlockForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('from') || '/appointments';
  const { user } = useAuth();
  const isEditing = Boolean(id);
  const canManageCategories = isAdminOrManagement(user);

  const [formData, setFormData] = useState({
    title: '',
    technician: '',
    category: '',
    customCategory: '',
    blockType: 'recurring',
    effectiveFrom: moment().format('YYYY-MM-DD'),
    effectiveUntil: '',
    oneTimeDate: moment().format('YYYY-MM-DD'),
    oneTimeStartTime: '08:00',
    oneTimeEndTime: '09:00',
    active: true
  });

  const [weeklySchedule, setWeeklySchedule] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [taskCategories, setTaskCategories] = useState([]);
  const [newCategory, setNewCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Default times for new day entries
  const [defaultStartTime, setDefaultStartTime] = useState('08:00');
  const [defaultEndTime, setDefaultEndTime] = useState('09:00');

  useEffect(() => {
    fetchTechnicians();
    fetchTaskCategories();
    if (isEditing) {
      fetchBlock();
    }
  }, [id]);

  const fetchTaskCategories = async () => {
    try {
      const response = await SettingsService.getSettings();
      setTaskCategories(response.data?.settings?.taskCategories || []);
    } catch (err) {
      console.error('Error fetching task categories:', err);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategory.trim()) return;
    try {
      const response = await SettingsService.addTaskCategory(newCategory.trim());
      setTaskCategories(response.data?.settings?.taskCategories || []);
      setFormData(prev => ({ ...prev, category: newCategory.trim() }));
      setNewCategory('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add category');
    }
  };

  const handleRemoveCategory = async (cat) => {
    try {
      const response = await SettingsService.removeTaskCategory(cat);
      setTaskCategories(response.data?.settings?.taskCategories || []);
      if (formData.category === cat) {
        setFormData(prev => ({ ...prev, category: '' }));
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to remove category');
    }
  };

  const fetchTechnicians = async () => {
    try {
      const response = await technicianService.getAllTechnicians(true);
      setTechnicians(response.data?.data?.technicians || []);
    } catch (err) {
      console.error('Error fetching technicians:', err);
    }
  };

  const fetchBlock = async () => {
    try {
      setLoading(true);
      const response = await ScheduleBlockService.getById(id);
      const block = response.data?.scheduleBlock;
      if (block) {
        const blockCategory = block.category || '';
        setFormData({
          title: block.title || '',
          technician: block.technician?._id || '',
          category: blockCategory,
          customCategory: '',
          blockType: block.blockType || 'recurring',
          effectiveFrom: block.effectiveFrom
            ? moment.tz(block.effectiveFrom, TIMEZONE).format('YYYY-MM-DD')
            : moment().format('YYYY-MM-DD'),
          effectiveUntil: block.effectiveUntil
            ? moment.tz(block.effectiveUntil, TIMEZONE).format('YYYY-MM-DD')
            : '',
          oneTimeDate: block.oneTimeDate
            ? moment.tz(block.oneTimeDate, TIMEZONE).format('YYYY-MM-DD')
            : moment().format('YYYY-MM-DD'),
          oneTimeStartTime: block.oneTimeStartTime || '08:00',
          oneTimeEndTime: block.oneTimeEndTime || '09:00',
          active: block.active !== false
        });
        setWeeklySchedule(block.weeklySchedule || []);
      }
    } catch (err) {
      console.error('Error fetching schedule block:', err);
      setError('Failed to load schedule block.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleAddDay = (dayOfWeek) => {
    // Check if day already exists
    if (weeklySchedule.some(s => s.dayOfWeek === dayOfWeek)) return;

    setWeeklySchedule(prev => [
      ...prev,
      { dayOfWeek, startTime: defaultStartTime, endTime: defaultEndTime }
    ].sort((a, b) => {
      // Sort: Mon-Sun (1,2,3,4,5,6,0)
      const orderA = a.dayOfWeek === 0 ? 7 : a.dayOfWeek;
      const orderB = b.dayOfWeek === 0 ? 7 : b.dayOfWeek;
      return orderA - orderB;
    }));
  };

  const handleRemoveDay = (dayOfWeek) => {
    setWeeklySchedule(prev => prev.filter(s => s.dayOfWeek !== dayOfWeek));
  };

  const handleScheduleTimeChange = (dayOfWeek, field, value) => {
    setWeeklySchedule(prev =>
      prev.map(s => s.dayOfWeek === dayOfWeek ? { ...s, [field]: value } : s)
    );
  };

  const handleAddAllWeekdays = () => {
    const weekdays = [1, 2, 3, 4, 5];
    const existingDays = new Set(weeklySchedule.map(s => s.dayOfWeek));
    const newEntries = weekdays
      .filter(d => !existingDays.has(d))
      .map(dayOfWeek => ({ dayOfWeek, startTime: defaultStartTime, endTime: defaultEndTime }));

    setWeeklySchedule(prev =>
      [...prev, ...newEntries].sort((a, b) => {
        const orderA = a.dayOfWeek === 0 ? 7 : a.dayOfWeek;
        const orderB = b.dayOfWeek === 0 ? 7 : b.dayOfWeek;
        return orderA - orderB;
      })
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.title.trim()) {
      setError('Title is required.');
      return;
    }
    if (!formData.technician) {
      setError('Technician is required.');
      return;
    }

    if (formData.blockType === 'recurring') {
      if (weeklySchedule.length === 0) {
        setError('At least one day must be scheduled.');
        return;
      }
      if (!formData.effectiveFrom) {
        setError('Effective from date is required.');
        return;
      }
      // Validate time ranges
      for (const entry of weeklySchedule) {
        if (entry.startTime >= entry.endTime) {
          const dayName = DAY_OPTIONS.find(d => d.value === entry.dayOfWeek)?.label;
          setError(`${dayName}: End time must be after start time.`);
          return;
        }
      }
    } else {
      // One-time validation
      if (!formData.oneTimeDate) {
        setError('Date is required for one-time blocks.');
        return;
      }
      if (!formData.oneTimeStartTime || !formData.oneTimeEndTime) {
        setError('Start and end times are required.');
        return;
      }
      if (formData.oneTimeStartTime >= formData.oneTimeEndTime) {
        setError('End time must be after start time.');
        return;
      }
    }

    try {
      setSaving(true);
      // Determine final category: if "custom" selected, use the custom text; for service writers, always use the text field
      let finalCategory = formData.category;
      if (!canManageCategories) {
        finalCategory = (formData.customCategory || formData.category).trim();
      } else if (formData.category === '__custom__') {
        finalCategory = formData.customCategory.trim();
      }

      const payload = {
        title: formData.title,
        technician: formData.technician,
        category: finalCategory,
        blockType: formData.blockType,
        active: formData.active
      };

      if (formData.blockType === 'recurring') {
        payload.weeklySchedule = weeklySchedule;
        payload.effectiveFrom = formData.effectiveFrom;
        payload.effectiveUntil = formData.effectiveUntil || null;
      } else {
        payload.oneTimeDate = formData.oneTimeDate;
        payload.oneTimeStartTime = formData.oneTimeStartTime;
        payload.oneTimeEndTime = formData.oneTimeEndTime;
      }

      if (isEditing) {
        await ScheduleBlockService.update(id, payload);
      } else {
        await ScheduleBlockService.create(payload);
      }

      navigate(returnTo);
    } catch (err) {
      console.error('Error saving schedule block:', err);
      setError(err.response?.data?.message || 'Failed to save schedule block.');
    } finally {
      setSaving(false);
    }
  };

  const getTechName = (tech) => tech.name || `${tech.firstName || ''} ${tech.lastName || ''}`.trim();
  const technicianOptions = [
    { value: '', label: 'Select Technician' },
    ...technicians.map(t => ({ value: t._id, label: getTechName(t) }))
  ];
  const categoryOptions = [
    { value: '', label: 'No Category' },
    ...taskCategories.map(c => ({ value: c, label: c })),
    { value: '__custom__', label: 'Custom...' }
  ];

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <Card title={isEditing ? 'Edit Task' : 'New Task'}>
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Card title={isEditing ? 'Edit Task' : 'New Task'}>
        <form onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 mb-4 text-sm">
              {error}
            </div>
          )}

          {/* Block Type Toggle */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Block Type</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, blockType: 'recurring' }))}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  formData.blockType === 'recurring'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                <i className="fas fa-redo mr-2"></i>Recurring
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, blockType: 'one-time' }))}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  formData.blockType === 'one-time'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                <i className="fas fa-calendar-day mr-2"></i>One-Time
              </button>
            </div>
          </div>

          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Input
              label="Title"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder={formData.blockType === 'one-time' ? 'e.g., Training Session' : 'e.g., Shipping & Messages'}
              required
            />
            <SelectInput
              label="Technician"
              name="technician"
              options={technicianOptions}
              value={formData.technician}
              onChange={handleChange}
              required
            />
            {/* Category - role-aware */}
            {canManageCategories ? (
              <div>
                <SelectInput
                  label="Category"
                  name="category"
                  options={categoryOptions}
                  value={taskCategories.includes(formData.category) || formData.category === '' || formData.category === '__custom__' ? formData.category : '__custom__'}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData(prev => ({
                      ...prev,
                      category: val,
                      customCategory: val === '__custom__' ? prev.customCategory : ''
                    }));
                  }}
                />
                {(formData.category === '__custom__' || (formData.category && !taskCategories.includes(formData.category) && formData.category !== '')) && (
                  <Input
                    name="customCategory"
                    placeholder="Enter custom category"
                    value={formData.category === '__custom__' ? formData.customCategory : formData.category}
                    onChange={(e) => setFormData(prev => ({ ...prev, category: '__custom__', customCategory: e.target.value }))}
                    className="mt-1"
                  />
                )}
              </div>
            ) : (
              <Input
                label="Category (optional)"
                name="customCategory"
                placeholder="e.g., Training, Meeting"
                value={formData.customCategory || formData.category}
                onChange={(e) => setFormData(prev => ({ ...prev, customCategory: e.target.value, category: '' }))}
              />
            )}
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="active"
                  checked={formData.active}
                  onChange={handleChange}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Active</span>
              </label>
            </div>
          </div>

          {/* Category Management (admin/management only) */}
          {canManageCategories && (
            <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                <i className="fas fa-tags mr-2"></i>Manage Task Categories
              </h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {taskCategories.map(cat => (
                  <span key={cat} className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-300 rounded-full text-sm">
                    {cat}
                    <button
                      type="button"
                      onClick={() => handleRemoveCategory(cat)}
                      className="text-red-400 hover:text-red-600 ml-1"
                      title="Remove category"
                    >
                      <i className="fas fa-times text-xs"></i>
                    </button>
                  </span>
                ))}
                {taskCategories.length === 0 && (
                  <span className="text-sm text-gray-400 italic">No categories yet</span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); } }}
                  placeholder="New category name"
                  className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={handleAddCategory}
                  className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {/* One-Time Block Fields */}
          {formData.blockType === 'one-time' && (
            <div className="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">
                <i className="fas fa-calendar-day mr-2 text-indigo-600"></i>One-Time Schedule
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input
                  label="Date"
                  name="oneTimeDate"
                  type="date"
                  value={formData.oneTimeDate}
                  onChange={handleChange}
                  required
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                  <select
                    name="oneTimeStartTime"
                    value={formData.oneTimeStartTime}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  >
                    {TIME_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                  <select
                    name="oneTimeEndTime"
                    value={formData.oneTimeEndTime}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  >
                    {TIME_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Recurring Block Fields */}
          {formData.blockType === 'recurring' && (
            <>
              {/* Effective Dates */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <Input
                  label="Effective From"
                  name="effectiveFrom"
                  type="date"
                  value={formData.effectiveFrom}
                  onChange={handleChange}
                  required
                />
                <Input
                  label="Effective Until (optional)"
                  name="effectiveUntil"
                  type="date"
                  value={formData.effectiveUntil}
                  onChange={handleChange}
                  min={formData.effectiveFrom}
                />
              </div>

              {/* Weekly Schedule Builder */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-800">Weekly Schedule</h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleAddAllWeekdays}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      + Add All Weekdays
                    </button>
                  </div>
                </div>

                {/* Default times for quick add */}
                <div className="flex items-center gap-3 mb-3 p-3 bg-gray-50 rounded">
                  <span className="text-xs text-gray-600 font-medium">Default times for new days:</span>
                  <select
                    value={defaultStartTime}
                    onChange={(e) => setDefaultStartTime(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-xs"
                  >
                    {TIME_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <span className="text-xs text-gray-500">to</span>
                  <select
                    value={defaultEndTime}
                    onChange={(e) => setDefaultEndTime(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 text-xs"
                  >
                    {TIME_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Day buttons to add */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {DAY_OPTIONS.map(day => {
                    const isAdded = weeklySchedule.some(s => s.dayOfWeek === day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => isAdded ? handleRemoveDay(day.value) : handleAddDay(day.value)}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                          isAdded
                            ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>

                {/* Per-day time entries */}
                {weeklySchedule.length > 0 ? (
                  <div className="space-y-2">
                    {weeklySchedule.map(entry => {
                      const dayInfo = DAY_OPTIONS.find(d => d.value === entry.dayOfWeek);
                      return (
                        <div key={entry.dayOfWeek} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded">
                          <span className="w-24 text-sm font-medium text-gray-800">{dayInfo?.label}</span>
                          <select
                            value={entry.startTime}
                            onChange={(e) => handleScheduleTimeChange(entry.dayOfWeek, 'startTime', e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
                          >
                            {TIME_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          <span className="text-gray-500 text-sm">to</span>
                          <select
                            value={entry.endTime}
                            onChange={(e) => handleScheduleTimeChange(entry.dayOfWeek, 'endTime', e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
                          >
                            {TIME_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleRemoveDay(entry.dayOfWeek)}
                            className="text-red-500 hover:text-red-700 text-sm ml-auto"
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-400 text-sm border border-dashed border-gray-300 rounded">
                    Click a day above to add it to the schedule
                  </div>
                )}
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <Button
              type="button"
              variant="light"
              onClick={() => navigate(returnTo)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={saving}
            >
              {saving ? 'Saving...' : isEditing ? 'Update Task' : 'Create Task'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default ScheduleBlockForm;
