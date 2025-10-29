import React from 'react';

/**
 * HorizontalTimeAxis component - Displays time slots horizontally for daily swimming lane view
 * Shows hours from 8am to 6pm across the top of the calendar
 */
const HorizontalTimeAxis = () => {
  const SHOP_OPEN_HOUR = 8;  // 8am
  const SHOP_CLOSE_HOUR = 18; // 6pm
  const PIXELS_PER_HOUR = 120; // Width in pixels for each hour

  // Generate hour markers
  const hours = [];
  for (let hour = SHOP_OPEN_HOUR; hour <= SHOP_CLOSE_HOUR; hour++) {
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    const period = hour >= 12 ? 'PM' : 'AM';
    const timeString = `${displayHour.toString().padStart(2, '0')}:00`;

    hours.push({
      hour,
      timeString,
      period
    });
  }

  return (
    <div className="flex border-b-2 border-gray-300 bg-gray-50">
      {/* Spacer for technician name column */}
      <div className="flex-shrink-0 w-40 border-r border-gray-300"></div>

      {/* Hour markers */}
      <div className="flex flex-1 relative">
        {hours.map((hourData, index) => (
          <div
            key={hourData.hour}
            className="border-r border-gray-300"
            style={{ width: `${PIXELS_PER_HOUR}px` }}
          >
            <div className="px-2 py-2 text-sm font-semibold text-gray-700 text-center">
              {hourData.timeString}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HorizontalTimeAxis;

// Export constants for use in other components
export const SHOP_OPEN_HOUR = 8;
export const SHOP_CLOSE_HOUR = 18;
export const PIXELS_PER_HOUR = 120;
export const PIXELS_PER_MINUTE = PIXELS_PER_HOUR / 60; // 2 pixels per minute
