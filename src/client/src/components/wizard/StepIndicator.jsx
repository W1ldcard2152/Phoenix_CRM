import React from 'react';

const StepIndicator = ({ steps, currentStep }) => {
  return (
    <div className="relative mb-8">
      {/* Step progress bar with gradient fill */}
      <div className="relative h-12 bg-gray-800 rounded-full overflow-hidden">
        {/* Progress fill */}
        <div 
          className="absolute top-0 left-0 h-full bg-gradient-to-r from-gray-800 to-primary-600 transition-all duration-500 ease-in-out rounded-full"
          style={{ width: `${((currentStep / steps.length) * 100)}%` }}
        />

        <div className="absolute inset-0">
          {/* Connecting line */}
          <div className="absolute top-1/2 h-0.5 bg-white transform -translate-y-1/2 z-0" 
               style={{ left: 'calc(0% + 24px)', right: 'calc(0% + 24px)' }} />

          {/* Step indicators */}
          <div className="absolute inset-0 flex items-center justify-between px-4">
            {steps.map((step, index) => {
              const stepNumber = index + 1;
              const isCompleted = currentStep > stepNumber;
              const isCurrent = currentStep === stepNumber;

              return (
                <div key={step.title} className="relative z-10 flex items-center">
                  {/* Step circle */}
                  <div
                    className={`flex items-center justify-center w-8 h-8 rounded-full text-white font-bold text-sm transition-all duration-300 shadow-lg ${
                      isCompleted 
                        ? "bg-green-600 ring-2 ring-green-200" 
                        : isCurrent 
                          ? "bg-primary-600 ring-4 ring-primary-200 scale-110" 
                          : "bg-gray-500"
                    }`}
                  >
                    {isCompleted ? (
                      <i className="fas fa-check text-xs"></i>
                    ) : (
                      stepNumber
                    )}
                  </div>

                  {/* Step label */}
                  <div 
                    className={`absolute -bottom-8 left-1/2 transform -translate-x-1/2 whitespace-nowrap text-xs font-medium text-center transition-colors duration-300 ${
                      isCompleted 
                        ? "text-green-700 font-semibold" 
                        : isCurrent 
                          ? "text-primary-700 font-bold" 
                          : "text-gray-500"
                    }`}
                  >
                    {step.title}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StepIndicator;
