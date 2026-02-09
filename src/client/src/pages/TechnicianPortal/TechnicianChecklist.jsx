import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import WorkOrderService from '../../services/workOrderService';

const TechnicianChecklist = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [workOrder, setWorkOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [activeChecklist, setActiveChecklist] = useState('inspection'); // 'inspection' or 'repair'

  // Inspection Checklist State
  const [inspectionChecklist, setInspectionChecklist] = useState({
    // Pre-Inspection Setup
    mileage: { completed: false, value: '', notes: '' },
    startVehicle: { completed: false, value: '', notes: '' },
    runningVoltage: { completed: false, value: '', notes: '' },
    keyOffVoltage: { completed: false, value: '', notes: '' },
    preInspectionSmartScan: { completed: false, value: '', notes: '' },

    // Physical Inspection
    leaksUnderVehicle: { completed: false, value: '', notes: '' },
    tiresFront: { completed: false, value: '', notes: '' },
    tiresRear: { completed: false, value: '', notes: '' },
    brakesFront: { completed: false, value: '', notes: '' },
    brakesRear: { completed: false, value: '', notes: '' },
    engineOil: { completed: false, value: '', notes: '' },
    brakeFluid: { completed: false, value: '', notes: '' },
    coolant: { completed: false, value: '', notes: '' },
    ballJoints: { completed: false, value: '', notes: '' },
    tieRodEnds: { completed: false, value: '', notes: '' },
    axleShafts: { completed: false, value: '', notes: '' },
    shocksStruts: { completed: false, value: '', notes: '' },
    wheelBearings: { completed: false, value: '', notes: '' },
    controlArmBushings: { completed: false, value: '', notes: '' },
    swayBarEndLinks: { completed: false, value: '', notes: '' },
    accessoryBelt: { completed: false, value: '', notes: '' },
    exhaust: { completed: false, value: '', notes: '' },

    // Documentation
    preScanUploaded: { completed: false, value: '', notes: '' },
    inspectionNotes: { completed: false, value: '', notes: '' }
  });

  // Repair Checklist State
  const [repairChecklist, setRepairChecklist] = useState({
    // Pre-Repair Setup
    getKeys: { completed: false, value: '', notes: '' },
    mileage: { completed: false, value: '', notes: '' },
    startVehicle: { completed: false, value: '', notes: '' },
    runningVoltage: { completed: false, value: '', notes: '' },
    preRepairSmartScan: { completed: false, value: '', notes: '' },
    testDrive: { completed: false, value: '', notes: '' },
    driveIntoBay: { completed: false, value: '', notes: '' },
    keyOffVoltage: { completed: false, value: '', notes: '' },
    liftVehicle: { completed: false, value: '', notes: '' },
    positionTools: { completed: false, value: '', notes: '' },

    // Physical Pre-Inspection
    leaksUnderVehicle: { completed: false, value: '', notes: '' },
    tiresFront: { completed: false, value: '', notes: '' },
    tiresRear: { completed: false, value: '', notes: '' },
    brakesFront: { completed: false, value: '', notes: '' },
    brakesRear: { completed: false, value: '', notes: '' },
    engineOil: { completed: false, value: '', notes: '' },
    brakeFluid: { completed: false, value: '', notes: '' },
    coolant: { completed: false, value: '', notes: '' },
    ballJoints: { completed: false, value: '', notes: '' },
    tieRodEnds: { completed: false, value: '', notes: '' },
    axleShafts: { completed: false, value: '', notes: '' },
    shocksStruts: { completed: false, value: '', notes: '' },
    wheelBearings: { completed: false, value: '', notes: '' },
    controlArmBushings: { completed: false, value: '', notes: '' },
    swayBarEndLinks: { completed: false, value: '', notes: '' },
    accessoryBelt: { completed: false, value: '', notes: '' },
    exhaust: { completed: false, value: '', notes: '' },

    // Repair Work
    repairComplete: { completed: false, value: '', notes: '' },

    // Post-Repair Checklist
    checkUnderVehicle: { completed: false, value: '', notes: '' },
    checkSuspensionBolts: { completed: false, value: '', notes: '' },
    lowerVehicle: { completed: false, value: '', notes: '' },
    torqueLugNuts: { completed: false, value: '', notes: '' },
    checkInteriorUnderHood: { completed: false, value: '', notes: '' },
    verifyRepair: { completed: false, value: '', notes: '' },
    moduleReset: { completed: false, value: '', notes: '' },
    postRepairSmartScan: { completed: false, value: '', notes: '' },
    postRepairTestDrive: { completed: false, value: '', notes: '' },
    parkVehicle: { completed: false, value: '', notes: '' },

    // Documentation
    preScanUploaded: { completed: false, value: '', notes: '' },
    postScanUploaded: { completed: false, value: '', notes: '' },
    voltageRecorded: { completed: false, value: '', notes: '' },
    mileageRecorded: { completed: false, value: '', notes: '' },
    postRepairNotes: { completed: false, value: '', notes: '' }
  });

  // Inspection checklist structure
  const inspectionSections = [
    {
      title: 'Pre-Inspection Setup',
      items: [
        { key: 'mileage', label: 'Note Mileage', inputType: 'number', placeholder: 'Enter mileage' },
        { key: 'startVehicle', label: 'Start vehicle, note anything unusual (noises, smells, etc.)', inputType: 'text', placeholder: 'Note any observations' },
        { key: 'runningVoltage', label: 'Running Voltage', inputType: 'text', placeholder: 'e.g., 14.2V' },
        { key: 'keyOffVoltage', label: 'Key-Off Voltage', inputType: 'text', placeholder: 'e.g., 12.6V' },
        { key: 'preInspectionSmartScan', label: 'Perform pre-inspection smart scan', inputType: 'checkbox' }
      ]
    },
    {
      title: 'Physical Inspection',
      items: [
        { key: 'leaksUnderVehicle', label: 'Check for obvious leaks under vehicle', inputType: 'select', options: ['Good Condition', 'Minor Leak', 'Significant Leak'] },
        { key: 'tiresFront', label: 'Tires - Front (tread depth)', inputType: 'text', placeholder: 'e.g., 6/32"' },
        { key: 'tiresRear', label: 'Tires - Rear (tread depth)', inputType: 'text', placeholder: 'e.g., 5/32"' },
        { key: 'brakesFront', label: 'Brakes - Front (pad wear/rotor condition)', inputType: 'select', options: ['Good Condition', 'Replace Soon', 'Replace ASAP'] },
        { key: 'brakesRear', label: 'Brakes - Rear (pad wear/rotor condition)', inputType: 'select', options: ['Good Condition', 'Replace Soon', 'Replace ASAP'] },
        { key: 'engineOil', label: 'Engine oil (level, age)', inputType: 'select', options: ['Good Condition', 'Low/Dirty', 'Replace Soon'] },
        { key: 'brakeFluid', label: 'Brake fluid (level, age)', inputType: 'select', options: ['Good Condition', 'Low', 'Needs Flush'] },
        { key: 'coolant', label: 'Coolant (level, quality, test for min. temp)', inputType: 'text', placeholder: 'e.g., Good, -34F' }
      ]
    },
    {
      title: 'Suspension Check',
      items: [
        { key: 'ballJoints', label: 'Ball joints', inputType: 'select', options: ['Good Condition', 'Play Detected', 'Replace ASAP'] },
        { key: 'tieRodEnds', label: 'Tie rod ends', inputType: 'select', options: ['Good Condition', 'Play Detected', 'Replace ASAP'] },
        { key: 'axleShafts', label: 'Axle shafts', inputType: 'select', options: ['Good Condition', 'Boot Torn', 'Replace ASAP'] },
        { key: 'shocksStruts', label: 'Shock/strut (leaks, seepage)', inputType: 'select', options: ['Good Condition', 'Seeping', 'Leaking - Replace'] },
        { key: 'wheelBearings', label: 'Wheel bearings', inputType: 'select', options: ['Good Condition', 'Noise Detected', 'Replace ASAP'] },
        { key: 'controlArmBushings', label: 'Control arm bushings', inputType: 'select', options: ['Good Condition', 'Worn', 'Replace ASAP'] },
        { key: 'swayBarEndLinks', label: 'Stabilizer/sway bar end links', inputType: 'select', options: ['Good Condition', 'Worn', 'Replace ASAP'] }
      ]
    },
    {
      title: 'Other Systems',
      items: [
        { key: 'accessoryBelt', label: 'Accessory belt (check for cracks, fraying)', inputType: 'select', options: ['Good Condition', 'Replace Soon', 'Replace ASAP'] },
        { key: 'exhaust', label: 'Exhaust (check for leaks)', inputType: 'select', options: ['Good Condition', 'Minor Leak', 'Significant Leak'] }
      ]
    },
    {
      title: 'Documentation',
      items: [
        { key: 'preScanUploaded', label: 'Pre-scan uploaded', inputType: 'checkbox' },
        { key: 'inspectionNotes', label: 'Inspection notes/findings', inputType: 'textarea', placeholder: 'Document your findings...' }
      ]
    }
  ];

  // Shared fields between inspection and repair checklists
  // When these are updated on inspection, they auto-sync to repair
  const sharedFields = [
    'mileage',
    'startVehicle',
    'runningVoltage',
    'keyOffVoltage',
    'leaksUnderVehicle',
    'tiresFront',
    'tiresRear',
    'brakesFront',
    'brakesRear',
    'engineOil',
    'brakeFluid',
    'coolant',
    'ballJoints',
    'tieRodEnds',
    'axleShafts',
    'shocksStruts',
    'wheelBearings',
    'controlArmBushings',
    'swayBarEndLinks',
    'accessoryBelt',
    'exhaust',
    'preScanUploaded'
  ];

  // Repair checklist structure
  const repairSections = [
    {
      title: 'Pre-Repair Setup',
      items: [
        { key: 'getKeys', label: 'Get keys from service writer', inputType: 'checkbox' },
        { key: 'mileage', label: 'Unlock and get into vehicle, note mileage', inputType: 'number', placeholder: 'Enter mileage' },
        { key: 'startVehicle', label: 'Start vehicle, note anything unusual (noises, smells, etc.)', inputType: 'text', placeholder: 'Note any observations' },
        { key: 'runningVoltage', label: 'Plug in scanner while car is running - Note running voltage', inputType: 'text', placeholder: 'e.g., 14.2V' },
        { key: 'preRepairSmartScan', label: 'Perform pre-repair smart scan', inputType: 'checkbox' },
        { key: 'testDrive', label: 'Perform test drive (if necessary/safe)', inputType: 'checkbox' },
        { key: 'driveIntoBay', label: 'Drive car into bay/lift', inputType: 'checkbox' },
        { key: 'keyOffVoltage', label: 'Turn off ignition - Note key-off voltage', inputType: 'text', placeholder: 'e.g., 12.6V' },
        { key: 'liftVehicle', label: 'Position lift arms & lift vehicle', inputType: 'checkbox' },
        { key: 'positionTools', label: 'Move tools and assembly table into position', inputType: 'checkbox' }
      ]
    },
    {
      title: 'Physical Pre-Inspection',
      items: [
        { key: 'leaksUnderVehicle', label: 'Check for obvious leaks under vehicle', inputType: 'select', options: ['Good Condition', 'Minor Leak', 'Significant Leak'] },
        { key: 'tiresFront', label: 'Tires - Front (tread depth)', inputType: 'text', placeholder: 'e.g., 6/32"' },
        { key: 'tiresRear', label: 'Tires - Rear (tread depth)', inputType: 'text', placeholder: 'e.g., 5/32"' },
        { key: 'brakesFront', label: 'Brakes - Front (pad wear/rotor condition)', inputType: 'select', options: ['Good Condition', 'Replace Soon', 'Replace ASAP'] },
        { key: 'brakesRear', label: 'Brakes - Rear (pad wear/rotor condition)', inputType: 'select', options: ['Good Condition', 'Replace Soon', 'Replace ASAP'] },
        { key: 'engineOil', label: 'Engine oil (level, age)', inputType: 'select', options: ['Good Condition', 'Low/Dirty', 'Replace Soon'] },
        { key: 'brakeFluid', label: 'Brake fluid (level, age)', inputType: 'select', options: ['Good Condition', 'Low', 'Needs Flush'] },
        { key: 'coolant', label: 'Coolant (level, quality, test for min. temp)', inputType: 'text', placeholder: 'e.g., Good, -34F' }
      ]
    },
    {
      title: 'Suspension Check',
      items: [
        { key: 'ballJoints', label: 'Ball joints', inputType: 'select', options: ['Good Condition', 'Play Detected', 'Replace ASAP'] },
        { key: 'tieRodEnds', label: 'Tie rod ends', inputType: 'select', options: ['Good Condition', 'Play Detected', 'Replace ASAP'] },
        { key: 'axleShafts', label: 'Axle shafts', inputType: 'select', options: ['Good Condition', 'Boot Torn', 'Replace ASAP'] },
        { key: 'shocksStruts', label: 'Shock/strut (leaks, seepage)', inputType: 'select', options: ['Good Condition', 'Seeping', 'Leaking - Replace'] },
        { key: 'wheelBearings', label: 'Wheel bearings', inputType: 'select', options: ['Good Condition', 'Noise Detected', 'Replace ASAP'] },
        { key: 'controlArmBushings', label: 'Control arm bushings', inputType: 'select', options: ['Good Condition', 'Worn', 'Replace ASAP'] },
        { key: 'swayBarEndLinks', label: 'Stabilizer/sway bar end links', inputType: 'select', options: ['Good Condition', 'Worn', 'Replace ASAP'] },
        { key: 'accessoryBelt', label: 'Accessory belt (check for cracks, fraying)', inputType: 'select', options: ['Good Condition', 'Replace Soon', 'Replace ASAP'] },
        { key: 'exhaust', label: 'Exhaust (check for leaks)', inputType: 'select', options: ['Good Condition', 'Minor Leak', 'Significant Leak'] }
      ]
    },
    {
      title: 'Repair Work',
      items: [
        { key: 'repairComplete', label: 'Carry out and complete repair work', inputType: 'checkbox' }
      ]
    },
    {
      title: 'Post-Repair Checklist',
      items: [
        { key: 'checkUnderVehicle', label: 'Check for tools, hangers, rags, etc. under vehicle or in suspension areas', inputType: 'checkbox' },
        { key: 'checkSuspensionBolts', label: 'Check all suspension bolts for tightness', inputType: 'checkbox' },
        { key: 'lowerVehicle', label: 'Lower vehicle', inputType: 'checkbox' },
        { key: 'torqueLugNuts', label: 'Tighten lug bolts/nuts using torque wrench', inputType: 'checkbox' },
        { key: 'checkInteriorUnderHood', label: 'Check for tools, hangers, rags, etc. in interior and under hood', inputType: 'checkbox' },
        { key: 'verifyRepair', label: 'Test to confirm repair resolved the original issue', inputType: 'checkbox' },
        { key: 'moduleReset', label: 'Module reset on affected modules (do not clear non-affected)', inputType: 'checkbox' },
        { key: 'postRepairSmartScan', label: 'Begin post-repair Smart Scan', inputType: 'checkbox' },
        { key: 'postRepairTestDrive', label: 'Test drive vehicle while post-repair scan is running', inputType: 'checkbox' },
        { key: 'parkVehicle', label: 'Park vehicle in customer pickup area', inputType: 'checkbox' }
      ]
    },
    {
      title: 'Update Work Order Documentation',
      items: [
        { key: 'preScanUploaded', label: 'Pre-scan uploaded', inputType: 'checkbox' },
        { key: 'postScanUploaded', label: 'Post-scan uploaded', inputType: 'checkbox' },
        { key: 'voltageRecorded', label: 'Voltage (running and key-off) recorded', inputType: 'checkbox' },
        { key: 'mileageRecorded', label: 'Mileage recorded', inputType: 'checkbox' },
        { key: 'postRepairNotes', label: 'Post-repair notes', inputType: 'textarea', placeholder: 'Document repair work performed...' }
      ]
    }
  ];

  useEffect(() => {
    fetchWorkOrder();
  }, [id]);

  const fetchWorkOrder = async () => {
    try {
      setLoading(true);
      const response = await WorkOrderService.getWorkOrder(id);
      const fetchedWorkOrder = response.data.workOrder;
      setWorkOrder(fetchedWorkOrder);

      // Load existing checklist data if available
      if (fetchedWorkOrder.inspectionChecklist) {
        setInspectionChecklist(prev => ({
          ...prev,
          ...fetchedWorkOrder.inspectionChecklist
        }));
      }
      if (fetchedWorkOrder.repairChecklist) {
        setRepairChecklist(prev => ({
          ...prev,
          ...fetchedWorkOrder.repairChecklist
        }));
      }

      // Pre-populate mileage if available
      if (fetchedWorkOrder.currentMileage) {
        setInspectionChecklist(prev => ({
          ...prev,
          mileage: { ...prev.mileage, value: fetchedWorkOrder.currentMileage.toString() }
        }));
        setRepairChecklist(prev => ({
          ...prev,
          mileage: { ...prev.mileage, value: fetchedWorkOrder.currentMileage.toString() }
        }));
      }
    } catch (err) {
      console.error('Error fetching work order:', err);
      setError('Failed to load work order details.');
    } finally {
      setLoading(false);
    }
  };

  // Debounced save - saves both checklists to ensure synced data is persisted
  useEffect(() => {
    if (!workOrder) return;

    const timeoutId = setTimeout(async () => {
      try {
        setSaving(true);
        // Always save both checklists to ensure synced data is persisted
        const updateData = {
          inspectionChecklist: {
            ...inspectionChecklist,
            lastModified: new Date()
          },
          repairChecklist: {
            ...repairChecklist,
            lastModified: new Date()
          }
        };
        await WorkOrderService.updateWorkOrder(id, updateData);
      } catch (err) {
        console.error('Error saving checklists:', err);
      } finally {
        setSaving(false);
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [inspectionChecklist, repairChecklist, id, workOrder]);

  const handleInspectionChange = (key, field, value) => {
    const newItemData = {
      [field]: value,
      completedAt: field === 'completed' && value ? new Date() : undefined
    };

    setInspectionChecklist(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        ...newItemData,
        completedAt: newItemData.completedAt || prev[key]?.completedAt
      }
    }));

    // Auto-sync shared fields to repair checklist
    if (sharedFields.includes(key)) {
      setRepairChecklist(prev => {
        // Only sync if the repair field hasn't been independently modified
        // or if the inspection value is more complete
        const currentRepairItem = prev[key] || { completed: false, value: '', notes: '' };
        const hasRepairValue = currentRepairItem.completed || currentRepairItem.value;

        // Always sync from inspection to repair for shared fields
        // This ensures the repair tech sees what was already checked
        return {
          ...prev,
          [key]: {
            ...prev[key],
            ...newItemData,
            completedAt: newItemData.completedAt || prev[key]?.completedAt,
            // Add a flag to show this was synced from inspection
            syncedFromInspection: true
          }
        };
      });
    }
  };

  const handleRepairChange = (key, field, value) => {
    setRepairChecklist(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value,
        completedAt: field === 'completed' && value ? new Date() : prev[key]?.completedAt
      }
    }));
  };

  const getCompletionStats = (checklist, sections) => {
    let total = 0;
    let completed = 0;

    sections.forEach(section => {
      section.items.forEach(item => {
        total++;
        if (checklist[item.key]?.completed || checklist[item.key]?.value) {
          completed++;
        }
      });
    });

    return { total, completed, percentage: Math.round((completed / total) * 100) };
  };

  const renderChecklistItem = (item, checklist, handleChange, isRepairView = false) => {
    const itemData = checklist[item.key] || { completed: false, value: '', notes: '' };
    const isCompleted = itemData.completed || !!itemData.value;
    const isSyncedFromInspection = isRepairView && itemData.syncedFromInspection && isCompleted;

    return (
      <div
        key={item.key}
        className={`border rounded-xl p-4 mb-3 transition-all ${
          isCompleted
            ? isSyncedFromInspection
              ? 'border-yellow-300 bg-yellow-50'
              : 'border-green-300 bg-green-50'
            : 'border-gray-200 bg-white'
        }`}
      >
        <div className="flex items-start gap-3">
          {/* Large touch-friendly checkbox */}
          <button
            type="button"
            onClick={() => {
              if (item.inputType === 'checkbox') {
                handleChange(item.key, 'completed', !itemData.completed);
              } else {
                handleChange(item.key, 'completed', !itemData.completed && !itemData.value);
              }
            }}
            className={`flex-shrink-0 w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all ${
              isCompleted
                ? isSyncedFromInspection
                  ? 'bg-yellow-500 border-yellow-500 text-white'
                  : 'bg-green-500 border-green-500 text-white'
                : 'bg-white border-gray-300 text-transparent hover:border-gray-400'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <label className="block text-base font-medium text-gray-900">
                {item.label}
              </label>
              {isSyncedFromInspection && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                  From Inspection
                </span>
              )}
            </div>

            {item.inputType === 'text' && (
              <input
                type="text"
                value={itemData.value || ''}
                onChange={(e) => handleChange(item.key, 'value', e.target.value)}
                placeholder={item.placeholder}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            )}

            {item.inputType === 'number' && (
              <input
                type="number"
                inputMode="numeric"
                value={itemData.value || ''}
                onChange={(e) => handleChange(item.key, 'value', e.target.value)}
                placeholder={item.placeholder}
                className="w-full sm:w-48 px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            )}

            {item.inputType === 'select' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {item.options.map(option => {
                  const isSelected = itemData.value === option;
                  const isRed = option.includes('ASAP') || option.includes('Significant') || option.includes('Leaking');
                  const isYellow = option.includes('Soon') || option.includes('Minor') || option.includes('Low') || option.includes('Seeping') || option.includes('Play') || option.includes('Noise') || option.includes('Worn') || option.includes('Torn');

                  let baseClass = 'bg-green-100 text-green-800 border-green-300 active:bg-green-200';
                  let selectedClass = 'bg-green-600 text-white border-green-600 shadow-md';

                  if (isRed) {
                    baseClass = 'bg-red-100 text-red-800 border-red-300 active:bg-red-200';
                    selectedClass = 'bg-red-600 text-white border-red-600 shadow-md';
                  } else if (isYellow) {
                    baseClass = 'bg-yellow-100 text-yellow-800 border-yellow-300 active:bg-yellow-200';
                    selectedClass = 'bg-yellow-600 text-white border-yellow-600 shadow-md';
                  }

                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => handleChange(item.key, 'value', option)}
                      className={`px-4 py-3 text-sm font-semibold rounded-lg border-2 transition-all ${
                        isSelected ? selectedClass : baseClass
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            )}

            {item.inputType === 'textarea' && (
              <textarea
                value={itemData.value || ''}
                onChange={(e) => handleChange(item.key, 'value', e.target.value)}
                placeholder={item.placeholder}
                rows={3}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
              />
            )}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading work order...</p>
        </div>
      </div>
    );
  }

  if (error || !workOrder) {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error || 'Work order not found.'}
        </div>
        <button
          onClick={() => navigate('/technician-portal')}
          className="w-full py-3 px-4 rounded-xl font-semibold text-gray-700 bg-white border border-gray-300 active:bg-gray-100 transition-colors"
        >
          Back to Portal
        </button>
      </div>
    );
  }

  const inspectionStats = getCompletionStats(inspectionChecklist, inspectionSections);
  const repairStats = getCompletionStats(repairChecklist, repairSections);
  const currentSections = activeChecklist === 'inspection' ? inspectionSections : repairSections;
  const currentChecklist = activeChecklist === 'inspection' ? inspectionChecklist : repairChecklist;
  const currentHandler = activeChecklist === 'inspection' ? handleInspectionChange : handleRepairChange;
  const currentStats = activeChecklist === 'inspection' ? inspectionStats : repairStats;

  return (
    <div className="min-h-screen bg-gray-100 pb-24">
      {/* Sticky Header */}
      <div className="bg-white shadow-sm sticky top-0 z-20">
        <div className="px-4 py-3">
          {/* Back Button and Title */}
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={() => navigate('/technician-portal')}
              className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 active:bg-gray-200"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-gray-900 truncate">
                {workOrder.vehicle
                  ? `${workOrder.vehicle.year} ${workOrder.vehicle.make} ${workOrder.vehicle.model}`
                  : 'Work Order'}
              </h1>
              <p className="text-sm text-gray-500 truncate">
                {workOrder.services?.[0]?.description || workOrder.serviceRequested || 'No service'}
              </p>
            </div>
            {saving && (
              <div className="flex-shrink-0 flex items-center gap-1 text-sm text-primary-600">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Saving</span>
              </div>
            )}
          </div>

          {/* Checklist Type Toggle - Large Touch Targets */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setActiveChecklist('inspection')}
              className={`py-3 px-4 rounded-xl font-semibold transition-all ${
                activeChecklist === 'inspection'
                  ? 'bg-yellow-500 text-white shadow-lg'
                  : 'bg-yellow-100 text-yellow-800 active:bg-yellow-200'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span>Inspect</span>
              </div>
              <div className="text-xs mt-1 opacity-80">
                {inspectionStats.completed}/{inspectionStats.total}
              </div>
            </button>

            <button
              onClick={() => setActiveChecklist('repair')}
              className={`py-3 px-4 rounded-xl font-semibold transition-all ${
                activeChecklist === 'repair'
                  ? 'bg-green-500 text-white shadow-lg'
                  : 'bg-green-100 text-green-800 active:bg-green-200'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Repair</span>
              </div>
              <div className="text-xs mt-1 opacity-80">
                {repairStats.completed}/{repairStats.total}
              </div>
            </button>
          </div>

          {/* Progress Bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
              <span>{activeChecklist === 'inspection' ? 'Inspection' : 'Repair'} Progress</span>
              <span>{currentStats.percentage}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${
                  activeChecklist === 'inspection' ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                style={{ width: `${currentStats.percentage}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* Checklist Sections */}
      <div className="p-4 space-y-4">
        {currentSections.map((section, index) => (
          <div key={index} className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className={`px-4 py-3 font-semibold text-gray-900 border-b border-gray-100 ${
              activeChecklist === 'inspection' ? 'bg-yellow-50' : 'bg-green-50'
            }`}>
              {section.title}
            </div>
            <div className="p-3">
              {section.items.map(item => renderChecklistItem(item, currentChecklist, currentHandler, activeChecklist === 'repair'))}
            </div>
          </div>
        ))}
      </div>

      {/* Fixed Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-20">
        <div className="flex gap-3 max-w-lg mx-auto">
          <button
            onClick={() => navigate('/technician-portal')}
            className="flex-1 py-3 px-4 rounded-xl font-semibold text-gray-700 bg-gray-100 active:bg-gray-200 transition-colors"
          >
            Save & Exit
          </button>
          <button
            onClick={() => navigate(`/work-orders/${id}`)}
            className="flex-1 py-3 px-4 rounded-xl font-semibold text-white bg-primary-600 active:bg-primary-700 transition-colors"
          >
            Save & View Work Order
          </button>
        </div>
      </div>
    </div>
  );
};

export default TechnicianChecklist;
