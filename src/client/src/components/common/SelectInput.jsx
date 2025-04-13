import React from 'react';

const SelectInput = ({
  label,
  name,
  options = [],
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
  const selectClasses = `
    block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500
    ${error && touched ? 'border-red-500' : 'border-gray-300'}
    ${disabled ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'}
    ${className}
  `;

  return (
    <div className="mb-4">
      {label && (
        <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <select
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        required={required}
        className={selectClasses}
        {...props}
      >
        <option value="">Select an option</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      
      {error && touched && (
        <p className="mt-1 text-sm text-red-500">{error}</p>
      )}
    </div>
  );
};

export default SelectInput;