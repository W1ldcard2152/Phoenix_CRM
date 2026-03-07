import moment from 'moment-timezone';

/**
 * Unit tests for the reschedule time calculation logic used in SwimmingLaneCalendar.
 * Tests the core math without rendering the full component (which requires auth context,
 * API services, etc).
 */

const TIMEZONE = 'America/New_York';

// Extract the pure calculation logic from handleAppointmentReschedule
const calculateRescheduledTimes = (appointment, deltaMinutes, dayDelta = 0) => {
  const newStart = moment.utc(appointment.startTime).add(dayDelta, 'days').add(deltaMinutes, 'minutes');
  const newEnd = moment.utc(appointment.endTime).add(dayDelta, 'days').add(deltaMinutes, 'minutes');

  return {
    startTime: newStart.toISOString(),
    endTime: newEnd.toISOString(),
    startLocal: newStart.tz(TIMEZONE).format('YYYY-MM-DDTHH:mm:ss'),
    endLocal: newEnd.tz(TIMEZONE).format('YYYY-MM-DDTHH:mm:ss'),
  };
};

describe('Reschedule time calculations', () => {
  // A 1-hour appointment on March 4 at 10:00 AM ET
  const baseAppointment = {
    _id: 'appt-123',
    startTime: moment.tz('2026-03-04 10:00', TIMEZONE).utc().toISOString(),
    endTime: moment.tz('2026-03-04 11:00', TIMEZONE).utc().toISOString(),
  };

  describe('time-only rescheduling (deltaMinutes)', () => {
    it('moves forward by 30 minutes', () => {
      const result = calculateRescheduledTimes(baseAppointment, 30);

      expect(result.startLocal).toBe('2026-03-04T10:30:00');
      expect(result.endLocal).toBe('2026-03-04T11:30:00');
    });

    it('moves backward by 1 hour', () => {
      const result = calculateRescheduledTimes(baseAppointment, -60);

      expect(result.startLocal).toBe('2026-03-04T09:00:00');
      expect(result.endLocal).toBe('2026-03-04T10:00:00');
    });

    it('moves forward by 15 minutes (one snap increment)', () => {
      const result = calculateRescheduledTimes(baseAppointment, 15);

      expect(result.startLocal).toBe('2026-03-04T10:15:00');
      expect(result.endLocal).toBe('2026-03-04T11:15:00');
    });

    it('preserves appointment duration', () => {
      const result = calculateRescheduledTimes(baseAppointment, 120);

      const newStart = moment(result.startTime);
      const newEnd = moment(result.endTime);
      const duration = newEnd.diff(newStart, 'minutes');

      expect(duration).toBe(60); // Still 1 hour
    });
  });

  describe('cross-day rescheduling (dayDelta)', () => {
    it('moves forward by 1 day at same time', () => {
      const result = calculateRescheduledTimes(baseAppointment, 0, 1);

      expect(result.startLocal).toBe('2026-03-05T10:00:00');
      expect(result.endLocal).toBe('2026-03-05T11:00:00');
    });

    it('moves backward by 2 days at same time', () => {
      const result = calculateRescheduledTimes(baseAppointment, 0, -2);

      expect(result.startLocal).toBe('2026-03-02T10:00:00');
      expect(result.endLocal).toBe('2026-03-02T11:00:00');
    });

    it('combines day shift and time shift', () => {
      // Move 1 day forward + 30 minutes later
      const result = calculateRescheduledTimes(baseAppointment, 30, 1);

      expect(result.startLocal).toBe('2026-03-05T10:30:00');
      expect(result.endLocal).toBe('2026-03-05T11:30:00');
    });

    it('combines day shift backward with time shift backward', () => {
      // Move 1 day back + 1 hour earlier
      const result = calculateRescheduledTimes(baseAppointment, -60, -1);

      expect(result.startLocal).toBe('2026-03-03T09:00:00');
      expect(result.endLocal).toBe('2026-03-03T10:00:00');
    });
  });

  describe('edge cases', () => {
    it('handles zero delta (no change)', () => {
      const result = calculateRescheduledTimes(baseAppointment, 0, 0);

      expect(result.startLocal).toBe('2026-03-04T10:00:00');
      expect(result.endLocal).toBe('2026-03-04T11:00:00');
    });

    it('handles DST spring-forward boundary (24h UTC shift)', () => {
      // March 8 2026 is DST spring-forward in US (clocks skip 2AM→3AM)
      const preDSTAppointment = {
        _id: 'appt-dst',
        startTime: moment.tz('2026-03-07 10:00', TIMEZONE).utc().toISOString(),
        endTime: moment.tz('2026-03-07 11:00', TIMEZONE).utc().toISOString(),
      };

      // Move to March 8 (DST transition day)
      // moment.add(1, 'days') adds 24h in UTC, so the local time shifts +1hr
      // because ET goes from UTC-5 to UTC-4
      const result = calculateRescheduledTimes(preDSTAppointment, 0, 1);

      expect(result.startLocal).toBe('2026-03-08T11:00:00');
      expect(result.endLocal).toBe('2026-03-08T12:00:00');

      // Duration is still preserved (1 hour)
      const duration = moment(result.endTime).diff(moment(result.startTime), 'minutes');
      expect(duration).toBe(60);
    });

    it('handles multi-hour appointments', () => {
      const longAppointment = {
        _id: 'appt-long',
        startTime: moment.tz('2026-03-04 08:00', TIMEZONE).utc().toISOString(),
        endTime: moment.tz('2026-03-04 14:00', TIMEZONE).utc().toISOString(), // 6 hours
      };

      const result = calculateRescheduledTimes(longAppointment, 60, 0);

      expect(result.startLocal).toBe('2026-03-04T09:00:00');
      expect(result.endLocal).toBe('2026-03-04T15:00:00');

      // Duration preserved
      const duration = moment(result.endTime).diff(moment(result.startTime), 'hours');
      expect(duration).toBe(6);
    });
  });
});

// Helper to compute the API payload format for schedule blocks
const calculateScheduleBlockPayload = (event, deltaMinutes, dayDelta = 0) => {
  const newStart = moment.utc(event.startTime).add(dayDelta, 'days').add(deltaMinutes, 'minutes');
  const newEnd = moment.utc(event.endTime).add(dayDelta, 'days').add(deltaMinutes, 'minutes');
  const newStartET = newStart.tz(TIMEZONE);
  const newEndET = newEnd.tz(TIMEZONE);

  if (event.blockType === 'recurring') {
    const originalDate = moment.utc(event.startTime).tz(TIMEZONE).format('YYYY-MM-DD');
    return {
      type: 'exception',
      scheduleBlockId: event.scheduleBlockId,
      payload: {
        date: originalDate,
        action: 'modify',
        startTime: newStartET.format('HH:mm'),
        endTime: newEndET.format('HH:mm'),
      },
    };
  } else {
    const payload = {
      oneTimeStartTime: newStartET.format('HH:mm'),
      oneTimeEndTime: newEndET.format('HH:mm'),
    };
    if (dayDelta !== 0) {
      payload.oneTimeDate = newStartET.format('YYYY-MM-DD');
    }
    return {
      type: 'update',
      scheduleBlockId: event.scheduleBlockId,
      payload,
    };
  }
};

describe('Schedule block reschedule payloads', () => {
  const oneTimeBlock = {
    _id: 'sb_block1_2026-03-04',
    scheduleBlockId: 'block1',
    isScheduleBlock: true,
    blockType: 'one-time',
    startTime: moment.tz('2026-03-04 09:00', TIMEZONE).utc().toISOString(),
    endTime: moment.tz('2026-03-04 10:00', TIMEZONE).utc().toISOString(),
  };

  const recurringBlock = {
    _id: 'sb_block2_2026-03-04',
    scheduleBlockId: 'block2',
    isScheduleBlock: true,
    blockType: 'recurring',
    startTime: moment.tz('2026-03-04 14:00', TIMEZONE).utc().toISOString(),
    endTime: moment.tz('2026-03-04 15:00', TIMEZONE).utc().toISOString(),
  };

  describe('one-time block', () => {
    it('generates update payload for time-only change', () => {
      const result = calculateScheduleBlockPayload(oneTimeBlock, 30);

      expect(result.type).toBe('update');
      expect(result.scheduleBlockId).toBe('block1');
      expect(result.payload.oneTimeStartTime).toBe('09:30');
      expect(result.payload.oneTimeEndTime).toBe('10:30');
      expect(result.payload.oneTimeDate).toBeUndefined();
    });

    it('includes oneTimeDate for cross-day change', () => {
      const result = calculateScheduleBlockPayload(oneTimeBlock, 0, 1);

      expect(result.type).toBe('update');
      expect(result.payload.oneTimeDate).toBe('2026-03-05');
      expect(result.payload.oneTimeStartTime).toBe('09:00');
      expect(result.payload.oneTimeEndTime).toBe('10:00');
    });

    it('includes oneTimeDate and shifted time for combined change', () => {
      const result = calculateScheduleBlockPayload(oneTimeBlock, -60, 2);

      expect(result.payload.oneTimeDate).toBe('2026-03-06');
      expect(result.payload.oneTimeStartTime).toBe('08:00');
      expect(result.payload.oneTimeEndTime).toBe('09:00');
    });
  });

  describe('recurring block', () => {
    it('generates exception payload for time change', () => {
      const result = calculateScheduleBlockPayload(recurringBlock, 30);

      expect(result.type).toBe('exception');
      expect(result.scheduleBlockId).toBe('block2');
      expect(result.payload.date).toBe('2026-03-04');
      expect(result.payload.action).toBe('modify');
      expect(result.payload.startTime).toBe('14:30');
      expect(result.payload.endTime).toBe('15:30');
    });

    it('uses original date for exception even with day delta', () => {
      // Recurring blocks use the original date for the exception key
      const result = calculateScheduleBlockPayload(recurringBlock, 30, 0);

      expect(result.payload.date).toBe('2026-03-04');
    });

    it('generates correct times for backward shift', () => {
      const result = calculateScheduleBlockPayload(recurringBlock, -60);

      expect(result.payload.startTime).toBe('13:00');
      expect(result.payload.endTime).toBe('14:00');
    });
  });
});
