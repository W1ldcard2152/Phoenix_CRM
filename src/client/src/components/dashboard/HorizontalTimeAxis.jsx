import React from 'react';

/**
 * HorizontalTimeAxis - hour markers for the daily swimming-lane view.
 * openHour/closeHour props are optional; defaults to 8am–6pm.
 */
const HorizontalTimeAxis = ({ openHour = 8, closeHour = 18 }) => {
  const hours = [];
  for (let hour = openHour; hour <= closeHour; hour++) {
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    const period = hour >= 12 ? 'PM' : 'AM';
    hours.push({ hour, label: `${String(displayHour).padStart(2, '0')}:00`, period });
  }

  return (
    <div className="flex border-b-2 border-gray-300 bg-gray-50">
      {/* Spacer for technician name column */}
      <div className="flex-shrink-0 w-40 border-r border-gray-300"></div>

      {/* Hour markers */}
      <div className="flex flex-1 relative">
        {hours.map((hourData) => (
          <div
            key={hourData.hour}
            className="border-r border-gray-300"
            style={{ width: `${PIXELS_PER_HOUR}px` }}
          >
            <div className="px-2 py-2 text-sm font-semibold text-gray-700 text-center">
              {hourData.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HorizontalTimeAxis;

// Constants for use in other components
export const PIXELS_PER_HOUR = 120;
export const PIXELS_PER_MINUTE = PIXELS_PER_HOUR / 60; // 2 pixels per minute
// Legacy fallback exports (prefer passing props or deriving from shopHoursMap)
export const SHOP_OPEN_HOUR = 8;
export const SHOP_CLOSE_HOUR = 18;
