import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerStep from './steps/CustomerStep';
import VehicleStep from './steps/VehicleStep';
import WorkOrderStep from './steps/WorkOrderStep';
import AppointmentStep from './steps/AppointmentStep';
import StepIndicator from './StepIndicator';
import Button from '../common/Button';

/**
 * ServiceRequestWizard - A multi-step wizard for creating complete service requests
 * 
 * Steps:
 * 1. Customer - Search existing or create new customer
 * 2. Vehicle - Select existing vehicle or add new vehicle for customer
 * 3. Work Order - Create work order with service details
 * 4. Appointment - Schedule appointment for the work order
 */
const ServiceRequestWizard = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Wizard data state
  const [wizardData, setWizardData] = useState({
    customer: null,
    vehicle: null,
    workOrder: null,
    appointment: null
  });

  const steps = [
    { number: 1, title: 'Customer', icon: 'fa-user' },
    { number: 2, title: 'Vehicle', icon: 'fa-car' },
    { number: 3, title: 'Work Order', icon: 'fa-wrench' },
    { number: 4, title: 'Appointment', icon: 'fa-calendar' }
  ];

  // Reset wizard when opened
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      setWizardData({
        customer: null,
        vehicle: null,
        workOrder: null,
        appointment: null
      });
      setError(null);
    }
  }, [isOpen]);

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(prev => prev + 1);
      setError(null);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
      setError(null);
    }
  };

  const handleStepComplete = (stepName, data) => {
    setWizardData(prev => ({
      ...prev,
      [stepName]: data
    }));
    
    // Auto-advance to next step
    if (currentStep < steps.length) {
      handleNext();
    } else {
      // Final step completed
      handleWizardComplete();
    }
  };

  const handleWizardComplete = () => {
    // Navigate to the appointment detail page
    if (wizardData.appointment?._id) {
      navigate(`/appointments/${wizardData.appointment._id}`);
    }
    onClose();
  };

  const handleError = (errorMessage) => {
    setError(errorMessage);
    setIsLoading(false);
  };

  const renderCurrentStep = () => {
    const commonProps = {
      onNext: handleStepComplete,
      onError: handleError,
      setLoading: setIsLoading,
      loading: isLoading
    };

    switch (currentStep) {
      case 1:
        return (
          <CustomerStep 
            {...commonProps}
            onCustomerSelect={(customer) => handleStepComplete('customer', customer)}
          />
        );
      case 2:
        return (
          <VehicleStep 
            {...commonProps}
            customer={wizardData.customer}
            onVehicleSelect={(vehicle) => handleStepComplete('vehicle', vehicle)}
          />
        );
      case 3:
        return (
          <WorkOrderStep 
            {...commonProps}
            customer={wizardData.customer}
            vehicle={wizardData.vehicle}
            onWorkOrderCreate={(workOrder) => handleStepComplete('workOrder', workOrder)}
          />
        );
      case 4:
        return (
          <AppointmentStep 
            {...commonProps}
            customer={wizardData.customer}
            vehicle={wizardData.vehicle}
            workOrder={wizardData.workOrder}
            onAppointmentCreate={(appointment) => handleStepComplete('appointment', appointment)}
          />
        );
      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 wizard-modal">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-4 text-white">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">New Service Request</h2>
              <p className="text-primary-100 text-sm">
                Step {currentStep} of {steps.length}: {steps[currentStep - 1]?.title}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-primary-200 transition-colors p-2"
              aria-label="Close wizard"
            >
              <i className="fas fa-times text-xl"></i>
            </button>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="px-6 pt-6">
          <StepIndicator steps={steps} currentStep={currentStep} />
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 pb-6">
            {/* Error Display */}
            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                <div className="flex items-center">
                  <i className="fas fa-exclamation-triangle mr-2"></i>
                  <span>{error}</span>
                </div>
              </div>
            )}

            {/* Step Content */}
            <div className="bg-gray-50 rounded-lg p-6 h-[500px] wizard-content-area overflow-y-auto">
              <div className="wizard-step-content h-full">
                {renderCurrentStep()}
              </div>
            </div>
          </div>
        </div>

        {/* Footer with Navigation */}
        <div className="bg-gray-100 px-6 py-4 border-t border-gray-200">
          <div className="flex justify-between items-center">
            <div className="flex space-x-3">
              <Button
                onClick={onClose}
                variant="outline"
                disabled={isLoading}
              >
                <i className="fas fa-times mr-2"></i>
                Cancel
              </Button>
              
              {currentStep > 1 && (
                <Button
                  onClick={handleBack}
                  variant="light"
                  disabled={isLoading}
                >
                  <i className="fas fa-arrow-left mr-2"></i>
                  Back
                </Button>
              )}
            </div>

            <div className="flex items-center space-x-4">
              {/* Progress indicator */}
              <span className="text-sm text-gray-600">
                {currentStep} of {steps.length} steps
              </span>
              
              {/* Loading indicator */}
              {isLoading && (
                <div className="flex items-center text-primary-600 wizard-loading">
                  <i className="fas fa-spinner fa-spin mr-2"></i>
                  <span className="text-sm">Processing...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServiceRequestWizard;
