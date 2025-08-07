import React from 'react';

const Input = ({
  label,
  name,
  type = 'text',
  placeholder = '',
  value,
  onChange,
  onBlur,
  error = null,
  touched = false,
  required = false,
  disabled = false,
  className = '',
  ...props
}) => {
  const inputClasses = `
    block w-full px-3 py-3 sm:py-2 border rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 text-base sm:text-sm
    ${error && touched ? 'border-red-500' : 'border-gray-300'}
    ${disabled ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'}
    ${className}
  `.trim();

  return (
    <div className="mb-4 sm:mb-4">
      {label && (
        <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-2 sm:mb-1 touch-target">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        required={required}
        className={inputClasses}
        // Mobile optimization attributes
        autoComplete={type === 'email' ? 'email' : type === 'tel' ? 'tel' : 'off'}
        inputMode={type === 'number' ? 'numeric' : type === 'tel' ? 'tel' : type === 'email' ? 'email' : 'text'}
        {...props}
      />
      
      {error && touched && (
        <p className="mt-2 text-sm text-red-500">{error}</p>
      )}
    </div>
  );
};

export default Input;