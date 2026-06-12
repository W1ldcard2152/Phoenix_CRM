import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Custom hook for drag-to-reschedule on calendar appointment cards.
 * Uses native mouse events for precise pixel-to-time mapping.
 *
 * Tracks two axes:
 * - Primary axis: time (snapped to minute increments, boundary-clamped)
 * - Secondary axis: optional cross-day movement (snapped to column widths)
 *
 * @param {Object} options
 * @param {boolean} options.enabled - Whether drag is allowed
 * @param {string} options.primaryAxis - 'x' for daily view, 'y' for weekly view
 * @param {number} options.pixelsPerMinute - Time axis conversion factor
 * @param {number} options.snapMinutes - Time snap increment (default 15)
 * @param {number} options.maxMinutes - Total shop minutes (default 600)
 * @param {number} options.durationMinutes - Appointment duration in minutes
 * @param {number} options.originalPositionPx - Current position on time axis
 * @param {number} options.secondarySnapPx - Pixel width to snap secondary axis (0 = disabled)
 * @param {number} options.overshootMinutes - Extra minutes the drag may travel past the
 *   [0, maxMinutes] bounds (0 = hard clamp). Lets business-time flow map overshoot
 *   past close/before open into neighboring days.
 * @param {Function} options.onDragMove - Called with { deltaMinutes, secondarySnaps } whenever a snapped value changes
 * @param {Function} options.onDragEnd - Called with { deltaMinutes, secondarySnaps }
 * @returns {{ primaryOffset: number, secondaryOffset: number, isDragging: boolean, handleMouseDown: Function }}
 */
const useDragToReschedule = ({
  enabled = false,
  primaryAxis = 'x',
  pixelsPerMinute = 2,
  snapMinutes = 15,
  maxMinutes = 600,
  durationMinutes = 60,
  originalPositionPx = 0,
  secondarySnapPx = 0,
  overshootMinutes = 0,
  onDragMove = null,
  onDragEnd = null
} = {}) => {
  const [primaryOffset, setPrimaryOffset] = useState(0);
  const [secondaryOffset, setSecondaryOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;
  const onDragMoveRef = useRef(onDragMove);
  onDragMoveRef.current = onDragMove;

  const activeListenersRef = useRef(null);

  const DEAD_ZONE = 5;

  const handleMouseDown = useCallback((e) => {
    if (!enabled) return;
    if (e.button !== 0) return;
    if (e.target.closest('a') || e.target.closest('button')) return;

    e.preventDefault();

    // Capture config at drag start
    const startX = e.clientX;
    const startY = e.clientY;
    const snapPx = snapMinutes * pixelsPerMinute;
    const overshootPx = overshootMinutes * pixelsPerMinute;
    const minPosPx = -overshootPx;
    const maxPosPx = (maxMinutes - durationMinutes) * pixelsPerMinute + overshootPx;
    const origPx = originalPositionPx;
    const secSnap = secondarySnapPx;

    let hasExceededThreshold = false;
    let currentPrimary = 0;
    let currentSecondary = 0;
    let currentSecondarySnaps = 0;

    const moveHandler = (moveEvent) => {
      const rawDeltaX = moveEvent.clientX - startX;
      const rawDeltaY = moveEvent.clientY - startY;

      // Use the primary axis for the dead zone check
      const primaryRaw = primaryAxis === 'x' ? rawDeltaX : rawDeltaY;
      const secondaryRaw = primaryAxis === 'x' ? rawDeltaY : rawDeltaX;

      if (!hasExceededThreshold) {
        // Check dead zone using total movement (either axis can trigger it)
        if (Math.abs(primaryRaw) < DEAD_ZONE && Math.abs(secondaryRaw) < DEAD_ZONE) return;
        hasExceededThreshold = true;
        setIsDragging(true);
      }

      // Primary axis: time snapping + boundary clamping (overshoot widens the bounds)
      const snappedPrimary = Math.round(primaryRaw / snapPx) * snapPx;
      const newPosPx = origPx + snappedPrimary;
      const clampedPosPx = Math.max(minPosPx, Math.min(newPosPx, maxPosPx));
      const prevPrimary = currentPrimary;
      const prevSecondarySnaps = currentSecondarySnaps;
      currentPrimary = clampedPosPx - origPx;

      // Secondary axis: snap to column widths (if enabled)
      if (secSnap > 0) {
        currentSecondarySnaps = Math.round(secondaryRaw / secSnap);
        currentSecondary = currentSecondarySnaps * secSnap;
      }

      setPrimaryOffset(currentPrimary);
      setSecondaryOffset(currentSecondary);

      if (onDragMoveRef.current && (currentPrimary !== prevPrimary || currentSecondarySnaps !== prevSecondarySnaps)) {
        onDragMoveRef.current({
          deltaMinutes: Math.round(currentPrimary / pixelsPerMinute),
          secondarySnaps: currentSecondarySnaps
        });
      }
    };

    const upHandler = () => {
      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('mouseup', upHandler);
      activeListenersRef.current = null;

      const wasDragging = hasExceededThreshold;

      setIsDragging(false);
      setPrimaryOffset(0);
      setSecondaryOffset(0);

      // Always fire when a drag happened (even back at zero) so callers can
      // tear down any live preview state.
      if (wasDragging && onDragEndRef.current) {
        const deltaMinutes = Math.round(currentPrimary / pixelsPerMinute);
        onDragEndRef.current({ deltaMinutes, secondarySnaps: currentSecondarySnaps });
      }
    };

    activeListenersRef.current = { move: moveHandler, up: upHandler };
    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', upHandler);
  }, [enabled, primaryAxis, pixelsPerMinute, snapMinutes, maxMinutes, durationMinutes, originalPositionPx, secondarySnapPx, overshootMinutes]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      if (activeListenersRef.current) {
        document.removeEventListener('mousemove', activeListenersRef.current.move);
        document.removeEventListener('mouseup', activeListenersRef.current.up);
      }
    };
  }, []);

  return {
    primaryOffset,
    secondaryOffset,
    isDragging,
    handleMouseDown
  };
};

export default useDragToReschedule;
