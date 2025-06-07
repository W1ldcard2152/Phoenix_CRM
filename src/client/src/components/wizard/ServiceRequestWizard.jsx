import React, { useState } from 'react';
import CustomerStep from './steps/CustomerStep';
import VehicleStep from './steps/VehicleStep';
import WorkOrderStep from './steps/WorkOrderStep';
import AppointmentStep from './steps/AppointmentStep';
import Modal from '../common/Modal';

const ServiceRequestWizard = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [customer, setCustomer] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [workOrder, setWorkOrder] = useState(null);

  const steps = [
    { number: 1, title: 'Customer' },
    { number: 2, title: 'Vehicle' },
    { number: 3, title: 'Work Order' },
    { number: 4, title: 'Appointment' },
  ];

  const handleNext = () => setCurrentStep(prev => prev + 1);
  const handleBack = () => setCurrentStep(prev => prev - 1);

  const handleCustomerSelect = (selectedCustomer) => {
    setCustomer(selectedCustomer);
    handleNext();
  };

  const handleVehicleSelect = (selectedVehicle) => {
    setVehicle(selectedVehicle);
    handleNext();
  };

  const handleWorkOrderCreate = (createdWorkOrder) => {
    setWorkOrder(createdWorkOrder);
    handleNext();
  };

  const handleAppointmentCreate = () => {
    // Final step, close wizard and maybe navigate
    onClose();
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <CustomerStep onNext={handleCustomerSelect} />;
      case 2:
        return <VehicleStep customer={customer} onNext={handleVehicleSelect} />;
      case 3:
        return <WorkOrderStep customer={customer} vehicle={vehicle} onNext={handleWorkOrderCreate} />;
      case 4:
        return <AppointmentStep workOrder={workOrder} onNext={handleAppointmentCreate} />;
      default:
        return null;
    }
  };

  const modalActions = [
    { label: 'Cancel', onClick: onClose, variant: 'danger' }
  ];

  if (currentStep > 1) {
    modalActions.unshift({ label: 'Back', onClick: handleBack, variant: 'light' });
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Service Request" actions={modalActions}>
      <div className="p-6">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Step {currentStep}: {steps[currentStep - 1].title}</h2>
          {/* Breadcrumbs */}
          <div className="flex items-center text-sm text-gray-500 mt-2">
            {steps.map((step, index) => (
              <React.Fragment key={step.number}>
                <span className={`${currentStep >= step.number ? 'text-indigo-600' : ''}`}>
                  {step.title}
                </span>
                {index < steps.length - 1 && <span className="mx-2">&rarr;</span>}
              </React.Fragment>
            ))}
          </div>
        </div>
        <div>{renderStep()}</div>
      </div>
    </Modal>
  );
};

export default ServiceRequestWizard;
