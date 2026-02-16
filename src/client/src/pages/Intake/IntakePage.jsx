import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import IntakeSection from './sections/IntakeSection';
import CustomerSection from './sections/CustomerSection';
import VehicleSection from './sections/VehicleSection';
import WorkOrderSection from './sections/WorkOrderSection';
import AppointmentSection from './sections/AppointmentSection';
import Button from '../../components/common/Button';

const IntakePage = () => {
  const navigate = useNavigate();

  // Saved entity state
  const [customer, setCustomer] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [workOrder, setWorkOrder] = useState(null);
  const [appointment, setAppointment] = useState(null);

  // UI state
  const [expandedSection, setExpandedSection] = useState('customer');
  const [intakeMode, setIntakeMode] = useState('workOrder'); // 'workOrder' or 'quote'
  const [errors, setErrors] = useState({});

  const clearError = (section) => {
    setErrors(prev => ({ ...prev, [section]: null }));
  };

  const handleCustomerSaved = (savedCustomer) => {
    setCustomer(savedCustomer);
    clearError('customer');
    // Reset downstream if customer changed
    if (customer && customer._id !== savedCustomer._id) {
      setVehicle(null);
      setWorkOrder(null);
      setAppointment(null);
    }
    setExpandedSection('vehicle');
  };

  const handleVehicleSaved = (savedVehicle) => {
    setVehicle(savedVehicle);
    clearError('vehicle');
    // Reset downstream if vehicle changed
    if (vehicle && vehicle._id !== savedVehicle._id) {
      setWorkOrder(null);
      setAppointment(null);
    }
    setExpandedSection('workOrder');
  };

  const handleWorkOrderSaved = (savedWorkOrder) => {
    setWorkOrder(savedWorkOrder);
    clearError('workOrder');
    if (workOrder && workOrder._id !== savedWorkOrder._id) {
      setAppointment(null);
    }
    // Skip appointment step for quotes
    if (intakeMode === 'quote') {
      setExpandedSection(null);
    } else {
      setExpandedSection('appointment');
    }
  };

  const handleAppointmentSaved = (savedAppointment) => {
    setAppointment(savedAppointment);
    clearError('appointment');
    setExpandedSection(null); // Collapse all
  };

  const handleError = (section, message) => {
    setErrors(prev => ({ ...prev, [section]: message }));
  };

  const handleToggle = (section) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  // Done button navigates to most recently created entity
  const handleDone = () => {
    if (appointment) {
      navigate(`/appointments/${appointment._id}`);
    } else if (workOrder) {
      navigate(intakeMode === 'quote' ? `/quotes/${workOrder._id}` : `/work-orders/${workOrder._id}`);
    } else if (vehicle) {
      navigate(`/vehicles/${vehicle._id}`);
    } else if (customer) {
      navigate(`/customers/${customer._id}`);
    } else {
      navigate('/');
    }
  };

  // Build summaries for collapsed saved sections
  const customerSummary = customer
    ? `${customer.name}${customer.phone ? ` - ${customer.phone}` : ''}`
    : null;

  const vehicleSummary = vehicle
    ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
    : null;

  const workOrderSummary = workOrder
    ? `${workOrder.services?.map(s => s.description).join(', ') || workOrder.serviceRequested || 'Work Order'} - ${workOrder.priority || 'Normal'} priority`
    : null;

  const appointmentSummary = appointment
    ? `${new Date(appointment.startTime).toLocaleDateString()} ${new Date(appointment.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : null;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quick Entry</h1>
          <p className="text-sm text-gray-600">Complete as many sections as needed, then click Done.</p>
        </div>
        <Button
          onClick={handleDone}
          variant="primary"
          disabled={!customer}
        >
          <i className="fas fa-check mr-2"></i>
          Done
        </Button>
      </div>

      {/* Section 1: Customer */}
      <IntakeSection
        title="Customer"
        icon="fas fa-user"
        stepNumber={1}
        isLocked={false}
        isSaved={!!customer}
        isExpanded={expandedSection === 'customer'}
        onToggle={() => handleToggle('customer')}
        summary={customerSummary}
        error={errors.customer}
      >
        <CustomerSection
          onSaved={handleCustomerSaved}
          onError={(msg) => handleError('customer', msg)}
        />
      </IntakeSection>

      {/* Section 2: Vehicle */}
      <IntakeSection
        title="Vehicle"
        icon="fas fa-car"
        stepNumber={2}
        isLocked={!customer}
        isSaved={!!vehicle}
        isExpanded={expandedSection === 'vehicle'}
        onToggle={() => handleToggle('vehicle')}
        summary={vehicleSummary}
        error={errors.vehicle}
      >
        <VehicleSection
          customer={customer}
          onSaved={handleVehicleSaved}
          onError={(msg) => handleError('vehicle', msg)}
        />
      </IntakeSection>

      {/* Section 3: Work Order / Quote */}
      <IntakeSection
        title={intakeMode === 'quote' ? 'Quote' : 'Work Order'}
        icon={intakeMode === 'quote' ? 'fas fa-file-alt' : 'fas fa-clipboard-list'}
        stepNumber={3}
        isLocked={!vehicle}
        isSaved={!!workOrder}
        isExpanded={expandedSection === 'workOrder'}
        onToggle={() => handleToggle('workOrder')}
        summary={workOrderSummary}
        error={errors.workOrder}
      >
        {/* Mode Toggle */}
        <div className="flex space-x-1 mb-4 bg-gray-100 rounded-lg p-1">
          <button
            type="button"
            onClick={() => { setIntakeMode('workOrder'); setWorkOrder(null); setAppointment(null); }}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              intakeMode === 'workOrder'
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <i className="fas fa-clipboard-list mr-2"></i>Work Order
          </button>
          <button
            type="button"
            onClick={() => { setIntakeMode('quote'); setWorkOrder(null); setAppointment(null); }}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              intakeMode === 'quote'
                ? 'bg-white text-purple-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <i className="fas fa-file-alt mr-2"></i>Quote
          </button>
        </div>
        <WorkOrderSection
          customer={customer}
          vehicle={vehicle}
          mode={intakeMode}
          onSaved={handleWorkOrderSaved}
          onError={(msg) => handleError('workOrder', msg)}
        />
      </IntakeSection>

      {/* Section 4: Appointment (not shown for quotes) */}
      {intakeMode !== 'quote' && (
        <IntakeSection
          title="Appointment"
          icon="fas fa-calendar-alt"
          stepNumber={4}
          isLocked={!workOrder}
          isSaved={!!appointment}
          isExpanded={expandedSection === 'appointment'}
          onToggle={() => handleToggle('appointment')}
          summary={appointmentSummary}
          error={errors.appointment}
        >
          <AppointmentSection
            customer={customer}
            vehicle={vehicle}
            workOrder={workOrder}
            onSaved={handleAppointmentSaved}
            onError={(msg) => handleError('appointment', msg)}
          />
        </IntakeSection>
      )}

      {/* Bottom Done button */}
      <div className="flex justify-end pt-2 pb-4">
        <Button
          onClick={handleDone}
          variant="primary"
          size="lg"
          disabled={!customer}
        >
          <i className="fas fa-check mr-2"></i>
          Done
        </Button>
      </div>
    </div>
  );
};

export default IntakePage;
