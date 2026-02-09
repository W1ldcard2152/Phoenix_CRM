import React from 'react';
import Button from '../common/Button';

const ChecklistViewModal = ({ isOpen, onClose, checklist, type, workOrder }) => {
  if (!isOpen) return null;

  const isRepair = type === 'repair';
  const title = isRepair ? 'Repair Checklist' : 'Inspection/Diagnostic Checklist';
  const bgColor = isRepair ? 'bg-green-500' : 'bg-yellow-500';
  const borderColor = isRepair ? 'border-green-500' : 'border-yellow-500';

  // Define the sections for each type
  const inspectionSections = [
    {
      title: 'Pre-Inspection Setup',
      items: [
        { key: 'mileage', label: 'Mileage' },
        { key: 'startVehicle', label: 'Start vehicle observations' },
        { key: 'runningVoltage', label: 'Running Voltage' },
        { key: 'keyOffVoltage', label: 'Key-Off Voltage' },
        { key: 'preInspectionSmartScan', label: 'Pre-inspection smart scan' }
      ]
    },
    {
      title: 'Physical Inspection',
      items: [
        { key: 'leaksUnderVehicle', label: 'Leaks under vehicle' },
        { key: 'tiresFront', label: 'Tires - Front' },
        { key: 'tiresRear', label: 'Tires - Rear' },
        { key: 'brakesFront', label: 'Brakes - Front' },
        { key: 'brakesRear', label: 'Brakes - Rear' },
        { key: 'engineOil', label: 'Engine oil' },
        { key: 'brakeFluid', label: 'Brake fluid' },
        { key: 'coolant', label: 'Coolant' }
      ]
    },
    {
      title: 'Suspension Check',
      items: [
        { key: 'ballJoints', label: 'Ball joints' },
        { key: 'tieRodEnds', label: 'Tie rod ends' },
        { key: 'axleShafts', label: 'Axle shafts' },
        { key: 'shocksStruts', label: 'Shock/strut' },
        { key: 'wheelBearings', label: 'Wheel bearings' },
        { key: 'controlArmBushings', label: 'Control arm bushings' },
        { key: 'swayBarEndLinks', label: 'Sway bar end links' }
      ]
    },
    {
      title: 'Other Systems',
      items: [
        { key: 'accessoryBelt', label: 'Accessory belt' },
        { key: 'exhaust', label: 'Exhaust' }
      ]
    },
    {
      title: 'Documentation',
      items: [
        { key: 'preScanUploaded', label: 'Pre-scan uploaded' },
        { key: 'inspectionNotes', label: 'Inspection notes' }
      ]
    }
  ];

  const repairSections = [
    {
      title: 'Pre-Repair Setup',
      items: [
        { key: 'getKeys', label: 'Get keys from service writer' },
        { key: 'mileage', label: 'Mileage' },
        { key: 'startVehicle', label: 'Start vehicle observations' },
        { key: 'runningVoltage', label: 'Running Voltage' },
        { key: 'preRepairSmartScan', label: 'Pre-repair smart scan' },
        { key: 'testDrive', label: 'Test drive' },
        { key: 'driveIntoBay', label: 'Drive into bay' },
        { key: 'keyOffVoltage', label: 'Key-Off Voltage' },
        { key: 'liftVehicle', label: 'Lift vehicle' },
        { key: 'positionTools', label: 'Position tools' }
      ]
    },
    {
      title: 'Physical Pre-Inspection',
      items: [
        { key: 'leaksUnderVehicle', label: 'Leaks under vehicle' },
        { key: 'tiresFront', label: 'Tires - Front' },
        { key: 'tiresRear', label: 'Tires - Rear' },
        { key: 'brakesFront', label: 'Brakes - Front' },
        { key: 'brakesRear', label: 'Brakes - Rear' },
        { key: 'engineOil', label: 'Engine oil' },
        { key: 'brakeFluid', label: 'Brake fluid' },
        { key: 'coolant', label: 'Coolant' }
      ]
    },
    {
      title: 'Suspension Check',
      items: [
        { key: 'ballJoints', label: 'Ball joints' },
        { key: 'tieRodEnds', label: 'Tie rod ends' },
        { key: 'axleShafts', label: 'Axle shafts' },
        { key: 'shocksStruts', label: 'Shock/strut' },
        { key: 'wheelBearings', label: 'Wheel bearings' },
        { key: 'controlArmBushings', label: 'Control arm bushings' },
        { key: 'swayBarEndLinks', label: 'Sway bar end links' },
        { key: 'accessoryBelt', label: 'Accessory belt' },
        { key: 'exhaust', label: 'Exhaust' }
      ]
    },
    {
      title: 'Repair Work',
      items: [
        { key: 'repairComplete', label: 'Repair complete' }
      ]
    },
    {
      title: 'Post-Repair Checklist',
      items: [
        { key: 'checkUnderVehicle', label: 'Check under vehicle for tools/debris' },
        { key: 'checkSuspensionBolts', label: 'Check suspension bolts' },
        { key: 'lowerVehicle', label: 'Lower vehicle' },
        { key: 'torqueLugNuts', label: 'Torque lug nuts' },
        { key: 'checkInteriorUnderHood', label: 'Check interior/under hood' },
        { key: 'verifyRepair', label: 'Verify repair' },
        { key: 'moduleReset', label: 'Module reset' },
        { key: 'postRepairSmartScan', label: 'Post-repair smart scan' },
        { key: 'postRepairTestDrive', label: 'Post-repair test drive' },
        { key: 'parkVehicle', label: 'Park vehicle' }
      ]
    },
    {
      title: 'Documentation',
      items: [
        { key: 'preScanUploaded', label: 'Pre-scan uploaded' },
        { key: 'postScanUploaded', label: 'Post-scan uploaded' },
        { key: 'voltageRecorded', label: 'Voltage recorded' },
        { key: 'mileageRecorded', label: 'Mileage recorded' },
        { key: 'postRepairNotes', label: 'Post-repair notes' }
      ]
    }
  ];

  const sections = isRepair ? repairSections : inspectionSections;

  const getStatusBadge = (value) => {
    if (!value) return null;
    if (value === true) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          Done
        </span>
      );
    }
    if (typeof value === 'string') {
      let bgClass = 'bg-green-100 text-green-800';
      if (value.includes('ASAP') || value.includes('Significant') || value.includes('Leaking')) {
        bgClass = 'bg-red-100 text-red-800';
      } else if (value.includes('Soon') || value.includes('Minor') || value.includes('Low') || value.includes('Seeping') || value.includes('Play') || value.includes('Noise') || value.includes('Worn') || value.includes('Torn')) {
        bgClass = 'bg-yellow-100 text-yellow-800';
      }
      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${bgClass}`}>
          {value}
        </span>
      );
    }
    return null;
  };

  const renderItem = (item) => {
    const itemData = checklist?.[item.key];
    const hasValue = itemData?.completed || itemData?.value;
    const displayValue = itemData?.value || (itemData?.completed ? true : null);

    return (
      <div key={item.key} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
        <div className="flex items-center gap-2">
          {hasValue ? (
            <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          )}
          <span className={`text-sm ${hasValue ? 'text-gray-900' : 'text-gray-500'}`}>
            {item.label}
          </span>
        </div>
        <div>
          {getStatusBadge(displayValue)}
        </div>
      </div>
    );
  };

  // Calculate completion stats
  const calculateStats = () => {
    let total = 0;
    let completed = 0;
    sections.forEach(section => {
      section.items.forEach(item => {
        total++;
        const itemData = checklist?.[item.key];
        if (itemData?.completed || itemData?.value) {
          completed++;
        }
      });
    });
    return { total, completed, percentage: total > 0 ? Math.round((completed / total) * 100) : 0 };
  };

  const stats = calculateStats();
  const hasData = checklist && Object.keys(checklist).length > 0;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
        {/* Backdrop */}
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onClose}
        ></div>

        {/* Modal Panel */}
        <div className="relative inline-block w-full max-w-2xl overflow-hidden text-left align-middle transition-all transform bg-white rounded-lg shadow-xl">
          {/* Header */}
          <div className={`${bgColor} px-6 py-4`}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">
                {title}
              </h3>
              <button
                onClick={onClose}
                className="text-white hover:text-gray-200 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {hasData && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-sm text-white opacity-90">
                  <span>Progress: {stats.completed} of {stats.total} items</span>
                  <span>{stats.percentage}%</span>
                </div>
                <div className="mt-1 w-full bg-white bg-opacity-30 rounded-full h-2">
                  <div
                    className="bg-white rounded-full h-2 transition-all duration-300"
                    style={{ width: `${stats.percentage}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
            {!hasData ? (
              <div className="text-center py-8 text-gray-500">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="mt-2 text-sm">No checklist data recorded yet.</p>
                <p className="text-xs text-gray-400 mt-1">
                  Checklists are filled out in the Technician Portal.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {sections.map((section, index) => (
                  <div key={index} className={`border ${borderColor} rounded-lg overflow-hidden`}>
                    <div className={`${isRepair ? 'bg-green-50' : 'bg-yellow-50'} px-4 py-2`}>
                      <h4 className="font-medium text-gray-900">{section.title}</h4>
                    </div>
                    <div className="px-4 py-2">
                      {section.items.map(item => renderItem(item))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
            <Button onClick={onClose} variant="outline">
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChecklistViewModal;
