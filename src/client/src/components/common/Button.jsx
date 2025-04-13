import React from 'react';
import { Link } from 'react-router-dom';

const Button = ({
  children,
  type = 'button',
  variant = 'primary',
  size = 'md',
  to = null,
  className = '',
  disabled = false,
  onClick,
  ...props
}) => {
  const baseClasses = 'inline-flex items-center justify-center rounded-md font-medium focus:outline-none transition';
  
  const variantClasses = {
    primary: 'bg-primary-600 text-white hover:bg-primary-700',
    secondary: 'bg-secondary-500 text-white hover:bg-secondary-600',
    success: 'bg-green-600 text-white hover:bg-green-700',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    warning: 'bg-yellow-500 text-white hover:bg-yellow-600',
    info: 'bg-blue-500 text-white hover:bg-blue-600',
    light: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
    dark: 'bg-gray-800 text-white hover:bg-gray-900',
    outline: 'bg-transparent border border-primary-600 text-primary-600 hover:bg-primary-50',
    link: 'bg-transparent text-primary-600 hover:underline p-0'
  };
  
  const sizeClasses = {
    sm: 'px-2 py-1 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg'
  };
  
  const disabledClasses = disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer';
  
  const classes = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${disabledClasses} ${className}`;
  
  // If 'to' prop is provided, render as a Link
  if (to) {
    return (
      <Link to={to} className={classes} {...props}>
        {children}
      </Link>
    );
  }
  
  // Otherwise render as a button
  return (
    <button type={type} className={classes} disabled={disabled} onClick={onClick} {...props}>
      {children}
    </button>
  );
};

export default Button;