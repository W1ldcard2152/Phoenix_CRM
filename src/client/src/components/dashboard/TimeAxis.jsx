import React from 'react';

/**
 * TimeAxis component - Displays time slots from 8am to 6pm with 15-minute increments
 * Used on the left side of the Gantt-style calendar
 */
const TimeAxis = () => {
  const SHOP_OPEN_HOUR = 8;  // 8am
  const SHOP_CLOSE_HOUR = 18; // 6pm
  const MINUTES_PER_SLOT = 15;
  const PIXELS_PER_HOUR = 80; // Height in pixels for each hour
  const PIXELS_PER_15MIN = PIXELS_PER_HOUR / 4;

  // Generate time slots
  const timeSlots = [];
  for (let hour = SHOP_OPEN_HOUR; hour <= SHOP_CLOSE_HOUR; hour++) {
    for (let minute = 0; minute < 60; minute += MINUTES_PER_SLOT) {
      // Skip the first slot of the next hour if we're at closing time
      if (hour === SHOP_CLOSE_HOUR && minute > 0) break;

      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      const period = hour >= 12 ? 'PM' : 'AM';
      const timeString = minute === 0
        ? `${displayHour}:00 ${period}`
        : `${displayHour}:${minute.toString().padStart(2, '0')}`;

      timeSlots.push({
        hour,
        minute,
        timeString,
        isHourMark: minute === 0
      });
    }
  }

  return (
    <div className="flex-shrink-0 w-20 border-r border-gray-300 bg-gray-50">
      {/* Header spacer to align with day headers */}
      <div className="h-10 border-b border-gray-300"></div>

      {/* Time slots */}
      <div className="relative">
        {timeSlots.map((slot, index) => (
          <div
            key={`${slot.hour}-${slot.minute}`}
            className={`border-t border-gray-200 flex items-start justify-end pr-2 ${
              slot.isHourMark ? 'border-gray-400' : 'border-gray-200'
            }`}
            style={{ height: `${PIXELS_PER_15MIN}px` }}
          >
            {slot.isHourMark && (
              <span className="text-xs font-medium text-gray-700 -mt-2">
                {slot.timeString}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TimeAxis;

// Export constants for use in other components
export const SHOP_OPEN_HOUR = 8;
export const SHOP_CLOSE_HOUR = 18;
export const PIXELS_PER_HOUR = 80;
export const PIXELS_PER_15MIN = PIXELS_PER_HOUR / 4; // 20 pixels
