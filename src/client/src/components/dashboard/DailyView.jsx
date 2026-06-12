import React, { useState, useEffect } from 'react';
import moment from 'moment-timezone';
import HorizontalTimeAxis, { PIXELS_PER_MINUTE } from './HorizontalTimeAxis';
import AppointmentCard from './AppointmentCard';
import { TIMEZONE } from '../../utils/formatters';
import {
  resolveDayHours,
  splitIntoBlocks,
  businessMinutesBetween,
  addBusinessMinutes,
  subtractBusinessMinutes,
  mapGridMinutesToOpenTime
} from '../../utils/businessTime';

/**
 * DailyView - Swimming lane calendar showing one day.
 * Horizontal time axis with technicians as rows.
 *
 * Appointments render as business-time blocks (split around lunch; one
 * block per day of a multi-day appointment). Dragging any block flows the
 * whole appointment through shop-open time — overflow past close/open
 * lands on a neighboring day and is announced with an edge chip since
 * that day isn't visible here.
 *
 * Props:
 * - date: Moment object for the day to display
 * - appointments: All appointments for this day
 * - onAppointmentReschedule: legacy delta path (schedule blocks) — (id, deltaMinutes)
 * - onAppointmentMove: flow path (appointments) — (id, startISO, endISO)
 * - shopHoursMap: { [dayOfWeek]: { open, close, closed, lunchStart, lunchDuration } }
 *   keyed by 0–6. If null/absent, defaults to 8am–6pm.
 */
const DailyView = ({ date, appointments, onAppointmentReschedule, onAppointmentMove, shopHoursMap }) => {
  const ROW_HEIGHT = 80;

  // Live drag preview while an appointment block is dragged
  const [dragPreview, setDragPreview] = useState(null); // { id, techId, lane, blocks }
  // Current time, refreshed every minute for the now-indicator
  const [now, setNow] = useState(() => moment.tz(TIMEZONE));

  useEffect(() => {
    const timer = setInterval(() => setNow(moment.tz(TIMEZONE)), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  // Derive this day's open/close hours (whole hours bound the viewport)
  const dayHours = resolveDayHours(date, shopHoursMap);
  const SHOP_OPEN_HOUR  = dayHours ? Math.floor(dayHours.openMin / 60) : 8;
  const SHOP_CLOSE_HOUR = dayHours ? Math.ceil(dayHours.closeMin / 60) : 18;

  const dayFormatted = date.format('YYYY-MM-DD');
  const totalShopMinutes = (SHOP_CLOSE_HOUR - SHOP_OPEN_HOUR) * 60;

  const getMinutesFromShopOpen = (dateTime) => {
    const time = moment.utc(dateTime).tz(TIMEZONE);
    return (time.hour() - SHOP_OPEN_HOUR) * 60 + time.minute();
  };

  const getDurationMinutes = (startTime, endTime) => {
    const start = moment.utc(startTime).tz(TIMEZONE);
    const end = moment.utc(endTime).tz(TIMEZONE);
    return end.diff(start, 'minutes');
  };

  /**
   * Get renderable entries for this date: appointments split into
   * business-time blocks, schedule blocks as-is.
   */
  const getDayEntries = () => {
    const dayStart = date.clone().startOf('day');
    const dayEnd = date.clone().endOf('day');
    const entries = [];

    appointments.forEach(appointment => {
      const apptStart = moment.utc(appointment.startTime).tz(TIMEZONE);
      const apptEnd = moment.utc(appointment.endTime).tz(TIMEZONE);
      if (!apptStart.isBefore(dayEnd) || !apptEnd.isAfter(dayStart)) return;

      if (appointment.isScheduleBlock) {
        if (apptStart.format('YYYY-MM-DD') !== dayFormatted) return;
        entries.push({
          ...appointment,
          _block: null,
          startMinutes: getMinutesFromShopOpen(apptStart),
          durationMinutes: getDurationMinutes(apptStart, apptEnd)
        });
        return;
      }

      splitIntoBlocks(apptStart, apptEnd, shopHoursMap, apptStart.format('YYYY-MM-DD'))
        .filter(block => block.dayKey === dayFormatted)
        .forEach(block => {
          entries.push({
            ...appointment,
            _block: block,
            startMinutes: getMinutesFromShopOpen(block.start),
            durationMinutes: block.end.diff(block.start, 'minutes')
          });
        });
    });

    return entries.filter(e => e.durationMinutes > 0);
  };

  const getTechnicianSchedules = () => {
    const techMap = new Map();

    getDayEntries().forEach(entry => {
      if (entry.technician && entry.technician._id) {
        const techId = entry.technician._id;
        if (!techMap.has(techId)) {
          techMap.set(techId, { technician: entry.technician, entries: [] });
        }
        techMap.get(techId).entries.push(entry);
      }
    });

    return Array.from(techMap.values()).sort((a, b) =>
      (a.technician.name || '').localeCompare(b.technician.name || '')
    );
  };

  const layoutEntries = (entries) => {
    const sorted = [...entries].sort((a, b) => a.startMinutes - b.startMinutes);
    const positioned = [];
    const lanes = [];

    sorted.forEach(entry => {
      const endMinutes = entry.startMinutes + entry.durationMinutes;

      let laneIndex = 0;
      while (laneIndex < lanes.length && lanes[laneIndex] > entry.startMinutes) {
        laneIndex++;
      }
      if (laneIndex === lanes.length) {
        lanes.push(endMinutes);
      } else {
        lanes[laneIndex] = endMinutes;
      }

      positioned.push({
        entry,
        laneIndex,
        leftPosition: entry.startMinutes * PIXELS_PER_MINUTE,
        width: entry.durationMinutes * PIXELS_PER_MINUTE
      });
    });

    return positioned;
  };

  // --- Business-time flow drag (appointments only) ---

  const computeFlowTimes = (entry, { deltaMinutes }) => {
    const apptStart = moment.utc(entry.startTime).tz(TIMEZONE);
    const apptEnd = moment.utc(entry.endTime).tz(TIMEZONE);
    const originalAnchor = apptStart.format('YYYY-MM-DD');
    const grabbedStart = entry._block ? entry._block.start : apptStart;

    const wallMinutes = SHOP_OPEN_HOUR * 60 + entry.startMinutes + deltaMinutes;
    const newBlockStart = mapGridMinutesToOpenTime(date, wallMinutes, shopHoursMap, dayFormatted);

    const offset = businessMinutesBetween(apptStart, grabbedStart, shopHoursMap, originalAnchor);
    const newStart = offset > 0
      ? subtractBusinessMinutes(newBlockStart, offset, shopHoursMap, dayFormatted)
      : newBlockStart;

    const finalAnchor = newStart.format('YYYY-MM-DD');
    const duration = Math.max(businessMinutesBetween(apptStart, apptEnd, shopHoursMap, originalAnchor), 15);
    const newEnd = addBusinessMinutes(newStart, duration, shopHoursMap, finalAnchor);

    return { newStart, newEnd, finalAnchor };
  };

  const handleFlowDragMove = (entry, laneIndex, deltas) => {
    const { newStart, newEnd, finalAnchor } = computeFlowTimes(entry, deltas);
    setDragPreview({
      id: entry._id,
      techId: entry.technician?._id,
      lane: laneIndex,
      blocks: splitIntoBlocks(newStart, newEnd, shopHoursMap, finalAnchor)
    });
  };

  const handleFlowDragEnd = (entry, deltas) => {
    setDragPreview(null);
    if (deltas.deltaMinutes === 0) return;
    if (!onAppointmentMove) return;
    const { newStart, newEnd } = computeFlowTimes(entry, deltas);
    onAppointmentMove(entry._id, newStart.toISOString(), newEnd.toISOString());
  };

  const formatOverflowDuration = (minutes) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
  };

  const technicianSchedules = getTechnicianSchedules();

  // Now-indicator geometry (only rendered when viewing today and within shop hours)
  const isViewingToday = dayFormatted === now.format('YYYY-MM-DD');
  const nowMinutes = (now.hour() - SHOP_OPEN_HOUR) * 60 + now.minute();
  const showNowLine = isViewingToday && nowMinutes >= 0 && nowMinutes <= totalShopMinutes;
  const nowHourLeft = (now.hour() - SHOP_OPEN_HOUR) * 60 * PIXELS_PER_MINUTE;

  return (
    <div className="overflow-x-auto border border-gray-300 rounded-lg">
      <div className="min-w-max">
        <HorizontalTimeAxis openHour={SHOP_OPEN_HOUR} closeHour={SHOP_CLOSE_HOUR} />

        {technicianSchedules.length > 0 ? (
          technicianSchedules.map(({ technician, entries: techEntries }, techIdx) => {
            const positionedEntries = layoutEntries(techEntries);
            const totalLanes = Math.max(...positionedEntries.map(a => a.laneIndex + 1), 1);
            const rowHeight = Math.max(ROW_HEIGHT, totalLanes * 60);

            // Ghost preview for this technician's row
            const isPreviewRow = dragPreview && dragPreview.techId === technician._id;
            const ghostBlocks = isPreviewRow
              ? dragPreview.blocks.filter(b => b.dayKey === dayFormatted)
              : [];
            const beforeMinutes = isPreviewRow
              ? dragPreview.blocks.filter(b => b.dayKey < dayFormatted).reduce((sum, b) => sum + b.end.diff(b.start, 'minutes'), 0)
              : 0;
            const afterBlocks = isPreviewRow
              ? dragPreview.blocks.filter(b => b.dayKey > dayFormatted)
              : [];
            const afterMinutes = afterBlocks.reduce((sum, b) => sum + b.end.diff(b.start, 'minutes'), 0);
            const firstBeforeBlock = isPreviewRow
              ? dragPreview.blocks.find(b => b.dayKey < dayFormatted)
              : null;
            const ghostLaneTop = isPreviewRow ? (dragPreview.lane * 56 + 8) : 8;

            return (
              <React.Fragment key={technician._id}>
              <div className="flex border-b border-gray-200">
                <div
                  className="flex-shrink-0 w-40 border-r border-gray-300 bg-gray-50 px-3 py-2 flex items-center"
                  style={{ minHeight: `${rowHeight}px` }}
                >
                  <div className="text-sm font-semibold text-gray-800">
                    {technician.name || 'Unassigned'}
                  </div>
                </div>

                <div
                  className="flex-1 relative bg-white"
                  style={{ minHeight: `${rowHeight}px` }}
                >
                  {/* Hour dividers */}
                  {Array.from({ length: SHOP_CLOSE_HOUR - SHOP_OPEN_HOUR + 1 }).map((_, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 border-r border-gray-200"
                      style={{ left: `${i * 120}px`, width: '120px' }}
                    />
                  ))}

                  {/* Current-hour highlight + now line (today only) */}
                  {showNowLine && (
                    <>
                      {now.hour() < SHOP_CLOSE_HOUR && (
                        <div
                          className="absolute top-0 bottom-0 bg-yellow-200 bg-opacity-40 pointer-events-none"
                          style={{
                            left:  `${Math.max(nowHourLeft, 0)}px`,
                            width: `${60 * PIXELS_PER_MINUTE}px`,
                            zIndex: 4
                          }}
                        />
                      )}
                      <div
                        className="absolute top-0 bottom-0 pointer-events-none"
                        style={{ left: `${nowMinutes * PIXELS_PER_MINUTE - 1}px`, zIndex: 30 }}
                      >
                        <div className="h-full border-l-2 border-red-500" />
                        <div className="absolute w-2 h-2 rounded-full bg-red-500" style={{ top: '-1px', left: '-4px' }} />
                      </div>
                    </>
                  )}

                  {/* Lunch band */}
                  {dayHours && dayHours.lunchStartMin !== null && (
                    <div
                      className="absolute top-0 bottom-0 bg-gray-200 bg-opacity-60 border-x border-gray-300 pointer-events-none flex items-center justify-center"
                      style={{
                        left: `${(dayHours.lunchStartMin - SHOP_OPEN_HOUR * 60) * PIXELS_PER_MINUTE}px`,
                        width: `${(dayHours.lunchEndMin - dayHours.lunchStartMin) * PIXELS_PER_MINUTE}px`,
                        zIndex: 5
                      }}
                    >
                      {(dayHours.lunchEndMin - dayHours.lunchStartMin) * PIXELS_PER_MINUTE >= 30 && (
                        <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wide" style={{ writingMode: 'vertical-rl' }}>
                          Lunch
                        </span>
                      )}
                    </div>
                  )}

                  {positionedEntries.map(({ entry, laneIndex, leftPosition, width }, idx) => {
                    const isFlowAppt = !entry.isScheduleBlock;
                    const isDragSource = dragPreview && dragPreview.id === entry._id;
                    return (
                      <AppointmentCard
                        key={`${entry._id}-${idx}`}
                        appointment={entry}
                        block={entry._block}
                        shopHoursMap={shopHoursMap}
                        viewType="daily"
                        style={{
                          position: 'absolute',
                          left:   `${leftPosition}px`,
                          top:    `${laneIndex * 56 + 8}px`,
                          width:  `${Math.max(width, 80)}px`,
                          height: '48px',
                          zIndex: 10,
                          ...(isDragSource ? { opacity: 0.4 } : {})
                        }}
                        dragConfig={{
                          axis: 'x',
                          pixelsPerMinute: PIXELS_PER_MINUTE,
                          snapMinutes: 15,
                          maxMinutes: totalShopMinutes,
                          durationMinutes: entry.durationMinutes,
                          originalPositionPx: leftPosition,
                          overshootMinutes: isFlowAppt ? totalShopMinutes : 0
                        }}
                        onReschedule={isFlowAppt ? null : onAppointmentReschedule}
                        onDragMove={isFlowAppt ? (deltas) => handleFlowDragMove(entry, laneIndex, deltas) : null}
                        onDragEnd={isFlowAppt ? (deltas) => handleFlowDragEnd(entry, deltas) : null}
                      />
                    );
                  })}

                  {/* Drag preview ghosts */}
                  {ghostBlocks.map((block, i) => {
                    const ghostLeft = getMinutesFromShopOpen(block.start) * PIXELS_PER_MINUTE;
                    const ghostWidth = block.end.diff(block.start, 'minutes') * PIXELS_PER_MINUTE;
                    return (
                      <div
                        key={`ghost-${i}`}
                        className="absolute border-2 border-dashed border-blue-500 bg-blue-100 bg-opacity-70 rounded pointer-events-none px-1.5 py-0.5 overflow-hidden"
                        style={{ left: `${ghostLeft}px`, top: `${ghostLaneTop}px`, width: `${Math.max(ghostWidth, 14)}px`, height: '48px', zIndex: 9000 }}
                      >
                        <span className="text-[10px] font-semibold text-blue-700 whitespace-nowrap">
                          {block.isFirst ? '' : '↪ '}{block.start.format('h:mm A')}
                        </span>
                      </div>
                    );
                  })}

                  {/* Overflow chips: portions of the preview landing on other days */}
                  {beforeMinutes > 0 && firstBeforeBlock && (
                    <div
                      className="absolute left-1 px-2 py-1 bg-blue-600 text-white text-[10px] font-semibold rounded shadow pointer-events-none whitespace-nowrap"
                      style={{ top: `${ghostLaneTop + 14}px`, zIndex: 9100 }}
                    >
                      {formatOverflowDuration(beforeMinutes)} ← {firstBeforeBlock.start.format('ddd h:mm A')}
                    </div>
                  )}
                  {afterMinutes > 0 && afterBlocks[0] && (
                    <div
                      className="absolute right-1 px-2 py-1 bg-blue-600 text-white text-[10px] font-semibold rounded shadow pointer-events-none whitespace-nowrap"
                      style={{ top: `${ghostLaneTop + 14}px`, zIndex: 9100 }}
                    >
                      +{formatOverflowDuration(afterMinutes)} → {afterBlocks[0].start.format('ddd h:mm A')}
                    </div>
                  )}
                </div>
              </div>
              {/* Spacer between technicians */}
              {techIdx < technicianSchedules.length - 1 && (
                <div className="h-2 bg-gray-200 border-b border-gray-300" />
              )}
              </React.Fragment>
            );
          })
        ) : (
          <div className="text-center py-12 text-gray-500">
            No appointments scheduled for this day.
          </div>
        )}
      </div>
    </div>
  );
};

export default DailyView;
