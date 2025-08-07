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
  const baseClasses = 'inline-flex items-center justify-center rounded-md font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 transition active:scale-95 touch-target';
  
  const variantClasses = {
    primary: 'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500 active:bg-primary-800',
    secondary: 'bg-secondary-500 text-white hover:bg-secondary-600 focus:ring-secondary-400 active:bg-secondary-700',
    success: 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500 active:bg-green-800',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 active:bg-red-800',
    warning: 'bg-yellow-500 text-white hover:bg-yellow-600 focus:ring-yellow-400 active:bg-yellow-700',
    info: 'bg-blue-500 text-white hover:bg-blue-600 focus:ring-blue-400 active:bg-blue-700',
    light: 'bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-300 active:bg-gray-400',
    dark: 'bg-gray-800 text-white hover:bg-gray-900 focus:ring-gray-600 active:bg-gray-950',
    outline: 'bg-transparent border border-primary-600 text-primary-600 hover:bg-primary-50 focus:ring-primary-500 active:bg-primary-100',
    link: 'bg-transparent text-primary-600 hover:underline p-0 focus:ring-primary-500'
  };
  
  const sizeClasses = {
    sm: 'px-3 py-2 text-sm min-h-[36px] sm:px-2 sm:py-1 sm:min-h-[32px]',
    md: 'px-4 py-3 min-h-[44px] sm:px-4 sm:py-2 sm:min-h-[36px]',
    lg: 'px-6 py-4 text-lg min-h-[52px] sm:px-6 sm:py-3 sm:min-h-[44px]'
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