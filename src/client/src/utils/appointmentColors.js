/**
 * Maps appointment status to Tailwind CSS color classes for the Gantt calendar view
 *
 * Color Coding System:
 * - BLUE SCALE: Service Writer Action Needed
 * - YELLOW/ORANGE SCALE: Technician Action Needed
 * - GREEN SCALE: Waiting/Automated processes
 * - GREY SCALE: Customer/Stopped states
 */

export const getAppointmentColorClasses = (status) => {
  const colorMap = {
    // BLUE SCALE - Service Writer Action Needed
    'Inspection/Diag Complete': {
      bg: 'bg-blue-200',
      border: 'border-blue-400',
      text: 'text-blue-900',
      hover: 'hover:bg-blue-300'
    },
    'Parts Received': {
      bg: 'bg-blue-400',
      border: 'border-blue-600',
      text: 'text-blue-950',
      hover: 'hover:bg-blue-500'
    },
    'Repair Complete - Awaiting Payment': {
      bg: 'bg-blue-600',
      border: 'border-blue-800',
      text: 'text-white',
      hover: 'hover:bg-blue-700'
    },

    // YELLOW/ORANGE SCALE - Technician Action Needed
    'Inspection In Progress': {
      bg: 'bg-yellow-200',
      border: 'border-yellow-400',
      text: 'text-yellow-900',
      hover: 'hover:bg-yellow-300'
    },
    'Repair In Progress': {
      bg: 'bg-orange-400',
      border: 'border-orange-600',
      text: 'text-orange-950',
      hover: 'hover:bg-orange-500'
    },
    'In Progress': {
      bg: 'bg-orange-400',
      border: 'border-orange-600',
      text: 'text-orange-950',
      hover: 'hover:bg-orange-500'
    },

    // GREEN SCALE - Waiting/Automated
    'Scheduled': {
      bg: 'bg-green-200',
      border: 'border-green-400',
      text: 'text-green-900',
      hover: 'hover:bg-green-300'
    },
    'Confirmed': {
      bg: 'bg-green-200',
      border: 'border-green-400',
      text: 'text-green-900',
      hover: 'hover:bg-green-300'
    },
    'Inspection/Diag Scheduled': {
      bg: 'bg-green-200',
      border: 'border-green-400',
      text: 'text-green-900',
      hover: 'hover:bg-green-300'
    },
    'Repair Scheduled': {
      bg: 'bg-green-400',
      border: 'border-green-600',
      text: 'text-green-950',
      hover: 'hover:bg-green-500'
    },
    'Completed': {
      bg: 'bg-green-600',
      border: 'border-green-800',
      text: 'text-white',
      hover: 'hover:bg-green-700'
    },

    // GREY SCALE - Customer/Stopped
    'On Hold': {
      bg: 'bg-gray-300',
      border: 'border-gray-400',
      text: 'text-gray-800',
      hover: 'hover:bg-gray-400'
    },
    'Cancelled': {
      bg: 'bg-gray-500',
      border: 'border-gray-700',
      text: 'text-white',
      hover: 'hover:bg-gray-600'
    },
    'No-Show': {
      bg: 'bg-gray-500',
      border: 'border-gray-700',
      text: 'text-white',
      hover: 'hover:bg-gray-600'
    }
  };

  // Return default color if status not found
  return colorMap[status] || {
    bg: 'bg-gray-300',
    border: 'border-gray-400',
    text: 'text-gray-800',
    hover: 'hover:bg-gray-400'
  };
};

/**
 * Returns a status badge color class for small indicators
 */
export const getStatusBadgeColor = (status) => {
  const badgeMap = {
    'Inspection/Diag Complete': 'bg-blue-100 text-blue-800',
    'Parts Received': 'bg-blue-200 text-blue-900',
    'Repair Complete - Awaiting Payment': 'bg-blue-300 text-blue-950',
    'Inspection In Progress': 'bg-yellow-100 text-yellow-800',
    'Repair In Progress': 'bg-orange-200 text-orange-900',
    'In Progress': 'bg-orange-200 text-orange-900',
    'Scheduled': 'bg-green-100 text-green-800',
    'Confirmed': 'bg-green-100 text-green-800',
    'Inspection/Diag Scheduled': 'bg-green-100 text-green-800',
    'Repair Scheduled': 'bg-green-200 text-green-900',
    'Completed': 'bg-green-300 text-green-950',
    'On Hold': 'bg-gray-200 text-gray-700',
    'Cancelled': 'bg-gray-400 text-gray-800',
    'No-Show': 'bg-gray-400 text-gray-800'
  };

  return badgeMap[status] || 'bg-gray-200 text-gray-700';
};
