import moment from 'moment-timezone';
import { TIMEZONE } from './formatters';

/**
 * Business-time engine for shop-hours-aware scheduling.
 *
 * An appointment is conceptually a chain of 15-minute segments occupying
 * shop-open time. These helpers flow durations through open hours: past
 * close into the next open day, backward before open into the previous
 * open day, and around the configured lunch window.
 *
 * shopHoursMap shape (from Settings.shopHours, keyed by dayOfWeek 0-6):
 *   { open: 'HH:00', close: 'HH:00', closed: bool, lunchStart: 'HH:00'|'', lunchDuration: minutes }
 * A null/missing map falls back to 8am-6pm, no lunch, every day.
 *
 * anchorDayKey ('YYYY-MM-DD'): the appointment's own start day. A day that
 * is marked Closed but equals the anchor is treated as open with default
 * hours — this lets an appointment be explicitly placed on a closed day
 * while overflow flow still skips closed days.
 */

export const DEFAULT_OPEN_MIN = 8 * 60;
export const DEFAULT_CLOSE_MIN = 18 * 60;

// Safety cap for day-walking loops (engine never scans further than this).
const MAX_DAY_WALK = 62;

const toTz = (dateTime) => moment.utc(moment.isMoment(dateTime) ? dateTime : dateTime).tz(TIMEZONE);

const parseTimeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const [h, m] = timeStr.split(':');
  const minutes = parseInt(h, 10) * 60 + (parseInt(m, 10) || 0);
  return Number.isFinite(minutes) ? minutes : null;
};

/** Format a moment as the day key used for anchoring ('YYYY-MM-DD' in shop TZ). */
export const dayKeyOf = (dateTime) => toTz(dateTime).format('YYYY-MM-DD');

/**
 * Resolve a single day's hours in minutes-from-midnight.
 * Returns { openMin, closeMin, lunchStartMin, lunchEndMin } or null if closed.
 * lunchStartMin/lunchEndMin are null when no (valid) lunch is configured.
 */
export const resolveDayHours = (dayMoment, shopHoursMap, anchorDayKey = null) => {
  const day = toTz(dayMoment);
  const config = shopHoursMap ? shopHoursMap[day.day()] : null;

  if (!shopHoursMap || !config) {
    return { openMin: DEFAULT_OPEN_MIN, closeMin: DEFAULT_CLOSE_MIN, lunchStartMin: null, lunchEndMin: null };
  }

  if (config.closed) {
    // Closed-day escape hatch: the appointment's own start day acts open.
    if (anchorDayKey && day.format('YYYY-MM-DD') === anchorDayKey) {
      return { openMin: DEFAULT_OPEN_MIN, closeMin: DEFAULT_CLOSE_MIN, lunchStartMin: null, lunchEndMin: null };
    }
    return null;
  }

  const openMin = parseTimeToMinutes(config.open) ?? DEFAULT_OPEN_MIN;
  const closeMin = parseTimeToMinutes(config.close) ?? DEFAULT_CLOSE_MIN;

  let lunchStartMin = null;
  let lunchEndMin = null;
  const lunchStart = parseTimeToMinutes(config.lunchStart);
  const lunchDuration = config.lunchDuration || 0;
  if (lunchStart !== null && lunchDuration > 0) {
    // Only honor a lunch that sits within open hours.
    const start = Math.max(lunchStart, openMin);
    const end = Math.min(lunchStart + lunchDuration, closeMin);
    if (start < end) {
      lunchStartMin = start;
      lunchEndMin = end;
    }
  }

  return { openMin, closeMin, lunchStartMin, lunchEndMin };
};

const atMinutes = (dayMoment, minutes) =>
  toTz(dayMoment).startOf('day').hour(Math.floor(minutes / 60)).minute(minutes % 60).second(0).millisecond(0);

/**
 * Open intervals for a day: 1 interval, or 2 when split by lunch.
 * Returns [{ start, end }] of moments, or [] if the day is closed.
 */
export const getOpenIntervals = (dayMoment, shopHoursMap, anchorDayKey = null) => {
  const hours = resolveDayHours(dayMoment, shopHoursMap, anchorDayKey);
  if (!hours) return [];

  const { openMin, closeMin, lunchStartMin, lunchEndMin } = hours;
  if (lunchStartMin !== null) {
    const intervals = [];
    if (openMin < lunchStartMin) intervals.push({ start: atMinutes(dayMoment, openMin), end: atMinutes(dayMoment, lunchStartMin) });
    if (lunchEndMin < closeMin) intervals.push({ start: atMinutes(dayMoment, lunchEndMin), end: atMinutes(dayMoment, closeMin) });
    return intervals;
  }
  return [{ start: atMinutes(dayMoment, openMin), end: atMinutes(dayMoment, closeMin) }];
};

/**
 * Business-minute duration between two datetimes (overlap with open intervals).
 */
export const businessMinutesBetween = (startTime, endTime, shopHoursMap, anchorDayKey = null) => {
  const start = toTz(startTime);
  const end = toTz(endTime);
  if (!end.isAfter(start)) return 0;

  let total = 0;
  const cursor = start.clone().startOf('day');
  for (let i = 0; i < MAX_DAY_WALK && !cursor.isAfter(end); i++) {
    for (const { start: iStart, end: iEnd } of getOpenIntervals(cursor, shopHoursMap, anchorDayKey)) {
      const overlapStart = moment.max(start, iStart);
      const overlapEnd = moment.min(end, iEnd);
      if (overlapStart.isBefore(overlapEnd)) {
        total += overlapEnd.diff(overlapStart, 'minutes');
      }
    }
    cursor.add(1, 'day');
  }
  return total;
};

/**
 * Walk forward through open intervals from `startTime`, consuming `minutes`
 * of business time. A start outside open time first snaps forward to the
 * next open minute. With minutes = 0, returns the (snapped) start.
 */
export const addBusinessMinutes = (startTime, minutes, shopHoursMap, anchorDayKey = null) => {
  let cursor = toTz(startTime);
  let remaining = Math.max(0, minutes);

  const day = cursor.clone().startOf('day');
  for (let i = 0; i < MAX_DAY_WALK; i++) {
    const intervals = getOpenIntervals(day, shopHoursMap, anchorDayKey);
    for (const { start: iStart, end: iEnd } of intervals) {
      if (cursor.isBefore(iStart)) cursor = iStart.clone();
      if (cursor.isSameOrAfter(iEnd)) continue;
      const available = iEnd.diff(cursor, 'minutes');
      if (remaining <= available) {
        return cursor.clone().add(remaining, 'minutes');
      }
      remaining -= available;
      cursor = iEnd.clone();
    }
    day.add(1, 'day');
  }
  return cursor;
};

/**
 * Walk backward through open intervals, consuming `minutes` of business
 * time. A start outside open time first snaps back to the previous open
 * minute. With minutes = 0, returns the (snapped) start.
 */
export const subtractBusinessMinutes = (startTime, minutes, shopHoursMap, anchorDayKey = null) => {
  let cursor = toTz(startTime);
  let remaining = Math.max(0, minutes);

  const day = cursor.clone().startOf('day');
  for (let i = 0; i < MAX_DAY_WALK; i++) {
    const intervals = getOpenIntervals(day, shopHoursMap, anchorDayKey).slice().reverse();
    for (const { start: iStart, end: iEnd } of intervals) {
      if (cursor.isAfter(iEnd)) cursor = iEnd.clone();
      if (cursor.isSameOrBefore(iStart)) continue;
      const available = cursor.diff(iStart, 'minutes');
      if (remaining <= available) {
        return cursor.clone().subtract(remaining, 'minutes');
      }
      remaining -= available;
      cursor = iStart.clone();
    }
    day.subtract(1, 'day');
  }
  return cursor;
};

/**
 * Shift a point along the business timeline by a signed business-minute
 * delta (positive flows forward past close, negative flows backward
 * before open).
 */
export const shiftByBusinessMinutes = (startTime, deltaMinutes, shopHoursMap, anchorDayKey = null) =>
  deltaMinutes >= 0
    ? addBusinessMinutes(startTime, deltaMinutes, shopHoursMap, anchorDayKey)
    : subtractBusinessMinutes(startTime, -deltaMinutes, shopHoursMap, anchorDayKey);

/**
 * Map a calendar-grid drop position to a valid open-time start.
 *
 * `wallMinutes` is the dropped position as minutes-from-midnight on
 * `dayMoment`'s date (it may be negative or exceed 1440 when the drag
 * overshoots the viewport). The mapping is continuous and monotonic:
 *   - positions past close flow into the next open day minute-for-minute
 *   - positions before open flow backward into the previous open day
 *   - positions inside the lunch window snap to the end of lunch
 */
export const mapGridMinutesToOpenTime = (dayMoment, wallMinutes, shopHoursMap, anchorDayKey = null) => {
  const hours = resolveDayHours(dayMoment, shopHoursMap, anchorDayKey)
    || { openMin: DEFAULT_OPEN_MIN, closeMin: DEFAULT_CLOSE_MIN, lunchStartMin: null, lunchEndMin: null };

  if (wallMinutes >= hours.closeMin) {
    return addBusinessMinutes(atMinutes(dayMoment, hours.closeMin), wallMinutes - hours.closeMin, shopHoursMap, anchorDayKey);
  }
  if (wallMinutes < hours.openMin) {
    return subtractBusinessMinutes(atMinutes(dayMoment, hours.openMin), hours.openMin - wallMinutes, shopHoursMap, anchorDayKey);
  }
  if (hours.lunchStartMin !== null && wallMinutes >= hours.lunchStartMin && wallMinutes < hours.lunchEndMin) {
    return atMinutes(dayMoment, hours.lunchEndMin);
  }
  return atMinutes(dayMoment, wallMinutes);
};

/**
 * Split an appointment range into renderable per-day blocks, also split
 * around lunch. Returns [{ start, end, dayKey, isFirst, isLast, raw }].
 *
 * Fallback: a range entirely outside open hours (legacy data) returns a
 * single block flagged raw: true so the appointment never disappears.
 */
export const splitIntoBlocks = (startTime, endTime, shopHoursMap, anchorDayKey = null) => {
  const start = toTz(startTime);
  const end = toTz(endTime);
  if (!end.isAfter(start)) return [];

  const blocks = [];
  const cursor = start.clone().startOf('day');
  for (let i = 0; i < MAX_DAY_WALK && !cursor.isAfter(end); i++) {
    getOpenIntervals(cursor, shopHoursMap, anchorDayKey).forEach(({ start: iStart, end: iEnd }) => {
      const blockStart = moment.max(start, iStart);
      const blockEnd = moment.min(end, iEnd);
      if (blockStart.isBefore(blockEnd)) {
        blocks.push({
          start: blockStart,
          end: blockEnd,
          dayKey: blockStart.format('YYYY-MM-DD'),
          raw: false
        });
      }
    });
    cursor.add(1, 'day');
  }

  if (blocks.length === 0) {
    return [{ start, end, dayKey: start.format('YYYY-MM-DD'), isFirst: true, isLast: true, raw: true }];
  }

  blocks.forEach((block, idx) => {
    block.isFirst = idx === 0;
    block.isLast = idx === blocks.length - 1;
  });
  return blocks;
};
