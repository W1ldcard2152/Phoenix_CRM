import moment from 'moment-timezone';
import {
  resolveDayHours,
  getOpenIntervals,
  businessMinutesBetween,
  addBusinessMinutes,
  subtractBusinessMinutes,
  shiftByBusinessMinutes,
  mapGridMinutesToOpenTime,
  splitIntoBlocks,
  dayKeyOf
} from './businessTime';

const TIMEZONE = 'America/New_York';

const et = (str) => moment.tz(str, 'YYYY-MM-DD HH:mm', TIMEZONE);
const fmt = (m) => m.tz(TIMEZONE).format('YYYY-MM-DD HH:mm');

// Mon-Fri 8-6, weekend closed (mirrors Settings defaults)
const defaultMap = () => {
  const map = {};
  for (let d = 0; d <= 6; d++) {
    map[d] = { open: '08:00', close: '18:00', closed: d === 0 || d === 6, lunchStart: '', lunchDuration: 0 };
  }
  return map;
};

// Same but with a noon-12:30 lunch on weekdays
const lunchMap = () => {
  const map = defaultMap();
  for (let d = 1; d <= 5; d++) {
    map[d] = { ...map[d], lunchStart: '12:00', lunchDuration: 30 };
  }
  return map;
};

// 2026-06-12 is a Friday; 2026-06-15 is a Monday.

describe('resolveDayHours', () => {
  it('falls back to 8-6 with no map', () => {
    expect(resolveDayHours(et('2026-06-12 00:00'), null)).toEqual({
      openMin: 480, closeMin: 1080, lunchStartMin: null, lunchEndMin: null
    });
  });

  it('returns null for closed days', () => {
    expect(resolveDayHours(et('2026-06-13 00:00'), defaultMap())).toBeNull();
  });

  it('treats a closed anchor day as open with default hours', () => {
    const saturday = et('2026-06-13 00:00');
    expect(resolveDayHours(saturday, defaultMap(), '2026-06-13')).toEqual({
      openMin: 480, closeMin: 1080, lunchStartMin: null, lunchEndMin: null
    });
  });

  it('parses lunch within open hours', () => {
    expect(resolveDayHours(et('2026-06-12 00:00'), lunchMap())).toEqual({
      openMin: 480, closeMin: 1080, lunchStartMin: 720, lunchEndMin: 750
    });
  });
});

describe('getOpenIntervals', () => {
  it('returns one interval without lunch', () => {
    const intervals = getOpenIntervals(et('2026-06-12 00:00'), defaultMap());
    expect(intervals).toHaveLength(1);
    expect(fmt(intervals[0].start)).toBe('2026-06-12 08:00');
    expect(fmt(intervals[0].end)).toBe('2026-06-12 18:00');
  });

  it('splits around lunch', () => {
    const intervals = getOpenIntervals(et('2026-06-12 00:00'), lunchMap());
    expect(intervals).toHaveLength(2);
    expect(fmt(intervals[0].end)).toBe('2026-06-12 12:00');
    expect(fmt(intervals[1].start)).toBe('2026-06-12 12:30');
  });

  it('is empty for closed days', () => {
    expect(getOpenIntervals(et('2026-06-13 00:00'), defaultMap())).toHaveLength(0);
  });
});

describe('businessMinutesBetween', () => {
  it('measures a same-day range directly', () => {
    expect(businessMinutesBetween(et('2026-06-12 13:00'), et('2026-06-12 16:00'), defaultMap())).toBe(180);
  });

  it('excludes the overnight gap and closed weekend', () => {
    // Fri 5pm -> Mon 9am: 1h Friday + 1h Monday
    expect(businessMinutesBetween(et('2026-06-12 17:00'), et('2026-06-15 09:00'), defaultMap())).toBe(120);
  });

  it('excludes lunch', () => {
    expect(businessMinutesBetween(et('2026-06-12 11:00'), et('2026-06-12 14:00'), lunchMap())).toBe(150);
  });

  it('counts a closed anchor day as open', () => {
    expect(businessMinutesBetween(et('2026-06-13 10:00'), et('2026-06-13 12:00'), defaultMap(), '2026-06-13')).toBe(120);
  });
});

describe('addBusinessMinutes', () => {
  it('stays within one day when it fits', () => {
    expect(fmt(addBusinessMinutes(et('2026-06-12 13:00'), 180, defaultMap()))).toBe('2026-06-12 16:00');
  });

  it('lands exactly on close', () => {
    expect(fmt(addBusinessMinutes(et('2026-06-12 16:00'), 120, defaultMap()))).toBe('2026-06-12 18:00');
  });

  it('wraps past close, skipping the closed weekend', () => {
    // Fri 4pm + 3h = 2h Friday + 1h Monday
    expect(fmt(addBusinessMinutes(et('2026-06-12 16:00'), 180, defaultMap()))).toBe('2026-06-15 09:00');
  });

  it('flows around lunch', () => {
    // 11am + 2h: 1h to noon, lunch 12-12:30, 1h after
    expect(fmt(addBusinessMinutes(et('2026-06-12 11:00'), 120, lunchMap()))).toBe('2026-06-12 13:30');
  });

  it('snaps a start outside open hours to the next open minute', () => {
    expect(fmt(addBusinessMinutes(et('2026-06-12 06:00'), 0, defaultMap()))).toBe('2026-06-12 08:00');
    expect(fmt(addBusinessMinutes(et('2026-06-12 19:00'), 0, defaultMap()))).toBe('2026-06-15 08:00');
  });

  it('flows overflow from a closed anchor day to the next open day', () => {
    // Sat (anchor, open 8-6) 4pm + 3h = 2h Saturday + 1h Monday (Sunday closed)
    expect(fmt(addBusinessMinutes(et('2026-06-13 16:00'), 180, defaultMap(), '2026-06-13'))).toBe('2026-06-15 09:00');
  });
});

describe('shiftByBusinessMinutes', () => {
  it('shifts forward across close', () => {
    expect(fmt(shiftByBusinessMinutes(et('2026-06-12 17:30'), 45, defaultMap()))).toBe('2026-06-15 08:15');
  });

  it('shifts backward across open into the previous day', () => {
    expect(fmt(shiftByBusinessMinutes(et('2026-06-15 08:15'), -45, defaultMap()))).toBe('2026-06-12 17:30');
  });

  it('shifts backward across lunch', () => {
    expect(fmt(shiftByBusinessMinutes(et('2026-06-12 12:45'), -30, lunchMap()))).toBe('2026-06-12 11:45');
  });

  it('round-trips forward then backward', () => {
    const start = et('2026-06-12 16:00');
    const there = shiftByBusinessMinutes(start, 300, defaultMap());
    const back = shiftByBusinessMinutes(there, -300, defaultMap());
    expect(fmt(back)).toBe(fmt(start));
  });
});

describe('mapGridMinutesToOpenTime', () => {
  const friday = et('2026-06-12 00:00');

  it('keeps positions inside open hours as-is', () => {
    expect(fmt(mapGridMinutesToOpenTime(friday, 13 * 60, defaultMap()))).toBe('2026-06-12 13:00');
  });

  it('maps positions past close minute-for-minute into the next open day', () => {
    // 45 min past Friday 6pm close -> Monday 8:45
    expect(fmt(mapGridMinutesToOpenTime(friday, 18 * 60 + 45, defaultMap()))).toBe('2026-06-15 08:45');
  });

  it('maps positions before open backward into the previous day', () => {
    // 30 min before Friday 8am open -> Thursday 5:30pm
    expect(fmt(mapGridMinutesToOpenTime(friday, 7 * 60 + 30, defaultMap()))).toBe('2026-06-11 17:30');
  });

  it('snaps positions inside lunch to the end of lunch', () => {
    expect(fmt(mapGridMinutesToOpenTime(friday, 12 * 60 + 15, lunchMap()))).toBe('2026-06-12 12:30');
  });

  it('respects the closed-day anchor', () => {
    const saturday = et('2026-06-13 00:00');
    expect(fmt(mapGridMinutesToOpenTime(saturday, 10 * 60, defaultMap(), '2026-06-13'))).toBe('2026-06-13 10:00');
  });
});

describe('subtractBusinessMinutes', () => {
  it('walks back across the closed weekend', () => {
    expect(fmt(subtractBusinessMinutes(et('2026-06-15 09:00'), 120, defaultMap()))).toBe('2026-06-12 17:00');
  });

  it('snaps a start outside open hours back to the previous open minute', () => {
    expect(fmt(subtractBusinessMinutes(et('2026-06-12 19:00'), 0, defaultMap()))).toBe('2026-06-12 18:00');
  });
});

describe('splitIntoBlocks', () => {
  it('returns one block for a simple same-day appointment', () => {
    const blocks = splitIntoBlocks(et('2026-06-12 13:00'), et('2026-06-12 16:00'), defaultMap());
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ dayKey: '2026-06-12', isFirst: true, isLast: true, raw: false });
  });

  it('splits a wrap across the weekend into Friday + Monday blocks', () => {
    const blocks = splitIntoBlocks(et('2026-06-12 16:00'), et('2026-06-15 09:00'), defaultMap());
    expect(blocks).toHaveLength(2);
    expect(fmt(blocks[0].start)).toBe('2026-06-12 16:00');
    expect(fmt(blocks[0].end)).toBe('2026-06-12 18:00');
    expect(blocks[0].isFirst).toBe(true);
    expect(blocks[0].isLast).toBe(false);
    expect(fmt(blocks[1].start)).toBe('2026-06-15 08:00');
    expect(fmt(blocks[1].end)).toBe('2026-06-15 09:00');
    expect(blocks[1].isLast).toBe(true);
  });

  it('splits around lunch within a day', () => {
    const blocks = splitIntoBlocks(et('2026-06-12 11:00'), et('2026-06-12 13:30'), lunchMap());
    expect(blocks).toHaveLength(2);
    expect(fmt(blocks[0].end)).toBe('2026-06-12 12:00');
    expect(fmt(blocks[1].start)).toBe('2026-06-12 12:30');
  });

  it('renders blocks on a closed anchor day', () => {
    const blocks = splitIntoBlocks(et('2026-06-13 10:00'), et('2026-06-13 12:00'), defaultMap(), '2026-06-13');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].dayKey).toBe('2026-06-13');
  });

  it('falls back to a raw block for a range entirely outside open hours', () => {
    const blocks = splitIntoBlocks(et('2026-06-12 19:00'), et('2026-06-12 20:00'), defaultMap());
    expect(blocks).toHaveLength(1);
    expect(blocks[0].raw).toBe(true);
  });
});

describe('dayKeyOf', () => {
  it('formats in shop timezone', () => {
    // 11pm ET = 3am UTC next day; key should stay on the ET date
    expect(dayKeyOf(et('2026-06-12 23:00').toISOString())).toBe('2026-06-12');
  });
});
