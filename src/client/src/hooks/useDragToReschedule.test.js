import { renderHook, act } from '@testing-library/react';
import useDragToReschedule from './useDragToReschedule';

// Helper to create a mouse event with clientX/clientY
const mouseEvent = (type, { clientX = 0, clientY = 0, button = 0 } = {}) => {
  const event = new MouseEvent(type, {
    clientX,
    clientY,
    button,
    bubbles: true,
    cancelable: true,
  });
  return event;
};

// Helper to simulate a mousedown on the hook's handler
// We need a real DOM element since handleMouseDown checks e.target.closest()
const createTarget = () => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
};

// Simulate mousedown via the hook's handler with a real target element
const fireMouseDown = (handler, target, { clientX = 100, clientY = 100 } = {}) => {
  const event = {
    button: 0,
    clientX,
    clientY,
    target,
    preventDefault: jest.fn(),
  };
  handler(event);
  return event;
};

describe('useDragToReschedule', () => {
  let target;

  beforeEach(() => {
    target = createTarget();
  });

  afterEach(() => {
    // Clean up any lingering document listeners
    document.body.innerHTML = '';
  });

  // ── Initial State ──

  describe('initial state', () => {
    it('returns zero offsets and isDragging=false', () => {
      const { result } = renderHook(() =>
        useDragToReschedule({ enabled: true })
      );

      expect(result.current.primaryOffset).toBe(0);
      expect(result.current.secondaryOffset).toBe(0);
      expect(result.current.isDragging).toBe(false);
      expect(typeof result.current.handleMouseDown).toBe('function');
    });
  });

  // ── Disabled / Guarded ──

  describe('when disabled', () => {
    it('does not start drag', () => {
      const onDragEnd = jest.fn();
      const { result } = renderHook(() =>
        useDragToReschedule({ enabled: false, onDragEnd })
      );

      act(() => {
        fireMouseDown(result.current.handleMouseDown, target);
      });

      act(() => {
        document.dispatchEvent(mouseEvent('mousemove', { clientX: 200, clientY: 100 }));
      });

      expect(result.current.isDragging).toBe(false);
    });

    it('ignores right-click (button !== 0)', () => {
      const { result } = renderHook(() =>
        useDragToReschedule({ enabled: true })
      );

      act(() => {
        const event = {
          button: 2, // right click
          clientX: 100,
          clientY: 100,
          target,
          preventDefault: jest.fn(),
        };
        result.current.handleMouseDown(event);
      });

      act(() => {
        document.dispatchEvent(mouseEvent('mousemove', { clientX: 200, clientY: 100 }));
      });

      expect(result.current.isDragging).toBe(false);
    });

    it('ignores mousedown on links', () => {
      const link = document.createElement('a');
      link.href = '#';
      target.appendChild(link);

      const { result } = renderHook(() =>
        useDragToReschedule({ enabled: true })
      );

      act(() => {
        fireMouseDown(result.current.handleMouseDown, link);
      });

      act(() => {
        document.dispatchEvent(mouseEvent('mousemove', { clientX: 200, clientY: 100 }));
      });

      expect(result.current.isDragging).toBe(false);
    });

    it('ignores mousedown on buttons', () => {
      const btn = document.createElement('button');
      target.appendChild(btn);

      const { result } = renderHook(() =>
        useDragToReschedule({ enabled: true })
      );

      act(() => {
        fireMouseDown(result.current.handleMouseDown, btn);
      });

      act(() => {
        document.dispatchEvent(mouseEvent('mousemove', { clientX: 200, clientY: 100 }));
      });

      expect(result.current.isDragging).toBe(false);
    });
  });

  // ── Dead Zone ──

  describe('dead zone', () => {
    it('does not activate drag for small movements (< 5px)', () => {
      const { result } = renderHook(() =>
        useDragToReschedule({
          enabled: true,
          primaryAxis: 'x',
          pixelsPerMinute: 2,
          snapMinutes: 15,
        })
      );

      act(() => {
        fireMouseDown(result.current.handleMouseDown, target, { clientX: 100, clientY: 100 });
      });

      // Move only 3px — within dead zone
      act(() => {
        document.dispatchEvent(mouseEvent('mousemove', { clientX: 103, clientY: 100 }));
      });

      expect(result.current.isDragging).toBe(false);
      expect(result.current.primaryOffset).toBe(0);
    });

    it('activates drag once movement exceeds 5px', () => {
      const { result } = renderHook(() =>
        useDragToReschedule({
          enabled: true,
          primaryAxis: 'x',
          pixelsPerMinute: 2,
          snapMinutes: 15,
        })
      );

      act(() => {
        fireMouseDown(result.current.handleMouseDown, target, { clientX: 100, clientY: 100 });
      });

      // Move 30px (one 15-min snap at 2px/min = 30px)
      act(() => {
        document.dispatchEvent(mouseEvent('mousemove', { clientX: 130, clientY: 100 }));
      });

      expect(result.current.isDragging).toBe(true);
    });
  });

  // ── Primary Axis Snapping (Daily View: x-axis) ──

  describe('primary axis snapping (daily view, x-axis)', () => {
    const dailyConfig = {
      enabled: true,
      primaryAxis: 'x',
      pixelsPerMinute: 2,
      snapMinutes: 15,
      maxMinutes: 600,
      durationMinutes: 60,
      originalPositionPx: 120, // 1 hour from shop open (60min * 2px)
    };

    it('snaps to 15-minute increments (30px at 2px/min)', () => {
      const { result } = renderHook(() => useDragToReschedule(dailyConfig));

      act(() => {
        fireMouseDown(result.current.handleMouseDown, target, { clientX: 100, clientY: 100 });
      });

      // Move 35px — should snap to 30px (15 min)
      act(() => {
        document.dispatchEvent(mouseEvent('mousemove', { clientX: 135, clientY: 100 }));
      });

      expect(result.current.primaryOffset).toBe(30);
    });

    it('snaps to 2 increments (60px = 30min)', () => {
      const { result } = renderHook(() => useDragToReschedule(dailyConfig));

      act(() => {
        fireMouseDown(result.current.handleMouseDown, target, { clientX: 100, clientY: 100 });
      });

      // Move 55px — should snap to 60px (30 min)
      act(() => {
        document.dispatchEvent(mouseEvent('mousemove', { clientX: 155, clientY: 100 }));
      });

      expect(result.current.primaryOffset).toBe(60);
    });

    it('allows dragging backwards (negative offset)', () => {
      const { result } = renderHook(() => useDragToReschedule(dailyConfig));

      act(() => {
        fireMouseDown(result.current.handleMouseDown, target, { clientX: 100, clientY: 100 });
      });

      // Move -35px — should snap to -30px (-15 min)
      act(() => {
        document.dispatchEvent(mouseEvent('mousemove', { clientX: 65, clientY: 100 }));
      });

      expect(result.current.primaryOffset).toBe(-30);
    });
  });

  // ── Primary Axis Boundary Clamping ──

  describe('boundary clamping', () => {
    it('clamps at shop open (position 0)', () => {
      const { result } = renderHook(() =>
        useDragToReschedule({
          enabled: true,
          primaryAxis: 'x',
          pixelsPerMinute: 2,
          snapMinutes: 15,
          maxMinutes: 600,
          durationMinutes: 60,
          originalPositionPx: 60, // 30min from open
        })
      );

      act(() => {
        fireMouseDown(result.current.handleMouseDown, target, { clientX: 100, clientY: 100 });
      });

      // Try dragging -200px (way past shop open)
      act(() => {
        document.dispatchEvent(mouseEvent('mousemove', { clientX: -100, clientY: 100 }));
      });

      // Should clamp: can only go back 60px (to position 0)
      expect(result.current.primaryOffset).toBe(-60);
    });

    it('clamps at shop close (maxMinutes - durationMinutes)', () => {
      // maxMinutes=600, durationMinutes=60 → maxPosition = 540 * 2 = 1080px
      // originalPosition = 1020px (510min from open = 4:30PM for a 1hr appt)
      const { result } = renderHook(() =>
        useDragToReschedule({
          enabled: true,
          primaryAxis: 'x',
          pixelsPerMinute: 2,
          snapMinutes: 15,
          maxMinutes: 600,
          durationMinutes: 60,
          originalPositionPx: 1020,
        })
      );

      act(() => {
        fireMouseDown(result.current.handleMouseDown, target, { clientX: 100, clientY: 100 });
      });

      // Try dragging +200px
      act(() => {
        document.dispatchEvent(mouseEvent('mousemove', { clientX: 300, clientY: 100 }));
      });

      // maxPosPx = (600-60)*2 = 1080. Can only go forward 1080-1020 = 60px
      expect(result.current.primaryOffset).toBe(60);
    });
  });

  // ── Primary Axis (Weekly View: y-axis) ──

  describe('primary axis (weekly view, y-axis)', () => {
    it('tracks vertical movement when primaryAxis is y', () => {
      const { result } = renderHook(() =>
        useDragToReschedule({
          enabled: true,
          primaryAxis: 'y',
          pixelsPerMinute: 1,
          snapMinutes: 15,
          maxMinutes: 600,
          durationMinutes: 60,
          originalPositionPx: 120,
        })
      );

      act(() => {
        fireMouseDown(result.current.handleMouseDown, target, { clientX: 100, clientY: 100 });
      });

      // Move 20px down — snap to 15px (15 min at 1px/min)
      act(() => {
        document.dispatchEvent(mouseEvent('mousemove', { clientX: 100, clientY: 120 }));
      });

      expect(result.current.primaryOffset).toBe(15);
    });
  });

  // ── Secondary Axis (Cross-Day Dragging) ──

  describe('secondary axis (cross-day)', () => {
    it('snaps secondary axis to column widths', () => {
      const { result } = renderHook(() =>
        useDragToReschedule({
          enabled: true,
          primaryAxis: 'y',
          pixelsPerMinute: 1,
          snapMinutes: 15,
          maxMinutes: 600,
          durationMinutes: 60,
          originalPositionPx: 120,
          secondarySnapPx: 200,
        })
      );

      act(() => {
        fireMouseDown(result.current.handleMouseDown, target, { clientX: 100, clientY: 100 });
      });

      // Move 220px right (past one column width)
      act(() => {
        document.dispatchEvent(mouseEvent('mousemove', { clientX: 320, clientY: 100 }));
      });

      // Should snap to 200px (1 column)
      expect(result.current.secondaryOffset).toBe(200);
    });

    it('snaps to 2 columns when moved far enough', () => {
      const { result } = renderHook(() =>
        useDragToReschedule({
          enabled: true,
          primaryAxis: 'y',
          pixelsPerMinute: 1,
          snapMinutes: 15,
          maxMinutes: 600,
          durationMinutes: 60,
          originalPositionPx: 120,
          secondarySnapPx: 200,
        })
      );

      act(() => {
        fireMouseDown(result.current.handleMouseDown, target, { clientX: 100, clientY: 100 });
      });

      // Move 380px right (closer to 2 columns = 400px)
      act(() => {
        document.dispatchEvent(mouseEvent('mousemove', { clientX: 480, clientY: 100 }));
      });

      expect(result.current.secondaryOffset).toBe(400);
    });

    it('supports negative secondary movement (dragging left)', () => {
      const { result } = renderHook(() =>
        useDragToReschedule({
          enabled: true,
          primaryAxis: 'y',
          pixelsPerMinute: 1,
          snapMinutes: 15,
          maxMinutes: 600,
          durationMinutes: 60,
          originalPositionPx: 120,
          secondarySnapPx: 200,
        })
      );

      act(() => {
        fireMouseDown(result.current.handleMouseDown, target, { clientX: 100, clientY: 100 });
      });

      // Move 180px left
      act(() => {
        document.dispatchEvent(mouseEvent('mousemove', { clientX: -80, clientY: 100 }));
      });

      expect(result.current.secondaryOffset).toBe(-200);
    });

    it('does not track secondary when secondarySnapPx is 0', () => {
      const { result } = renderHook(() =>
        useDragToReschedule({
          enabled: true,
          primaryAxis: 'x',
          pixelsPerMinute: 2,
          snapMinutes: 15,
          maxMinutes: 600,
          durationMinutes: 60,
          originalPositionPx: 120,
          secondarySnapPx: 0,
        })
      );

      act(() => {
        fireMouseDown(result.current.handleMouseDown, target, { clientX: 100, clientY: 100 });
      });

      // Move 200px on secondary axis (Y when primary is X)
      act(() => {
        document.dispatchEvent(mouseEvent('mousemove', { clientX: 130, clientY: 300 }));
      });

      expect(result.current.secondaryOffset).toBe(0);
    });
  });

  // ── onDragEnd Callback ──

  describe('onDragEnd callback', () => {
    it('fires with correct deltaMinutes on mouseup', () => {
      const onDragEnd = jest.fn();
      const { result } = renderHook(() =>
        useDragToReschedule({
          enabled: true,
          primaryAxis: 'x',
          pixelsPerMinute: 2,
          snapMinutes: 15,
          maxMinutes: 600,
          durationMinutes: 60,
          originalPositionPx: 120,
          onDragEnd,
        })
      );

      act(() => {
        fireMouseDown(result.current.handleMouseDown, target, { clientX: 100, clientY: 100 });
      });

      // Drag 60px (30 minutes at 2px/min)
      act(() => {
        document.dispatchEvent(mouseEvent('mousemove', { clientX: 160, clientY: 100 }));
      });

      act(() => {
        document.dispatchEvent(mouseEvent('mouseup'));
      });

      expect(onDragEnd).toHaveBeenCalledWith({
        deltaMinutes: 30,
        secondarySnaps: 0,
      });
    });

    it('fires with secondarySnaps when cross-day dragging', () => {
      const onDragEnd = jest.fn();
      const { result } = renderHook(() =>
        useDragToReschedule({
          enabled: true,
          primaryAxis: 'y',
          pixelsPerMinute: 1,
          snapMinutes: 15,
          maxMinutes: 600,
          durationMinutes: 60,
          originalPositionPx: 120,
          secondarySnapPx: 200,
          onDragEnd,
        })
      );

      act(() => {
        fireMouseDown(result.current.handleMouseDown, target, { clientX: 100, clientY: 100 });
      });

      // Drag down 30px (30min) and right 220px (1 day column)
      act(() => {
        document.dispatchEvent(mouseEvent('mousemove', { clientX: 320, clientY: 130 }));
      });

      act(() => {
        document.dispatchEvent(mouseEvent('mouseup'));
      });

      expect(onDragEnd).toHaveBeenCalledWith({
        deltaMinutes: 30,
        secondarySnaps: 1,
      });
    });

    it('does not fire when returning to original position', () => {
      const onDragEnd = jest.fn();
      const { result } = renderHook(() =>
        useDragToReschedule({
          enabled: true,
          primaryAxis: 'x',
          pixelsPerMinute: 2,
          snapMinutes: 15,
          maxMinutes: 600,
          durationMinutes: 60,
          originalPositionPx: 120,
          onDragEnd,
        })
      );

      act(() => {
        fireMouseDown(result.current.handleMouseDown, target, { clientX: 100, clientY: 100 });
      });

      // Drag out and back (within one snap increment → snaps to 0)
      act(() => {
        document.dispatchEvent(mouseEvent('mousemove', { clientX: 110, clientY: 100 }));
      });

      act(() => {
        document.dispatchEvent(mouseEvent('mouseup'));
      });

      expect(onDragEnd).not.toHaveBeenCalled();
    });

    it('does not fire when mouse up without exceeding dead zone', () => {
      const onDragEnd = jest.fn();
      const { result } = renderHook(() =>
        useDragToReschedule({
          enabled: true,
          primaryAxis: 'x',
          pixelsPerMinute: 2,
          snapMinutes: 15,
          maxMinutes: 600,
          durationMinutes: 60,
          originalPositionPx: 120,
          onDragEnd,
        })
      );

      act(() => {
        fireMouseDown(result.current.handleMouseDown, target, { clientX: 100, clientY: 100 });
      });

      // Move only 2px (within dead zone)
      act(() => {
        document.dispatchEvent(mouseEvent('mousemove', { clientX: 102, clientY: 100 }));
      });

      act(() => {
        document.dispatchEvent(mouseEvent('mouseup'));
      });

      expect(onDragEnd).not.toHaveBeenCalled();
    });
  });

  // ── State Reset After Drop ──

  describe('state reset after drop', () => {
    it('resets isDragging and offsets to initial values on mouseup', () => {
      const { result } = renderHook(() =>
        useDragToReschedule({
          enabled: true,
          primaryAxis: 'x',
          pixelsPerMinute: 2,
          snapMinutes: 15,
          maxMinutes: 600,
          durationMinutes: 60,
          originalPositionPx: 120,
          onDragEnd: jest.fn(),
        })
      );

      act(() => {
        fireMouseDown(result.current.handleMouseDown, target, { clientX: 100, clientY: 100 });
      });

      act(() => {
        document.dispatchEvent(mouseEvent('mousemove', { clientX: 160, clientY: 100 }));
      });

      // Confirm dragging state
      expect(result.current.isDragging).toBe(true);
      expect(result.current.primaryOffset).toBe(60);

      act(() => {
        document.dispatchEvent(mouseEvent('mouseup'));
      });

      expect(result.current.isDragging).toBe(false);
      expect(result.current.primaryOffset).toBe(0);
      expect(result.current.secondaryOffset).toBe(0);
    });
  });

  // ── Continuous Dragging ──

  describe('continuous dragging', () => {
    it('updates offset as mouse moves through multiple positions', () => {
      const { result } = renderHook(() =>
        useDragToReschedule({
          enabled: true,
          primaryAxis: 'x',
          pixelsPerMinute: 2,
          snapMinutes: 15,
          maxMinutes: 600,
          durationMinutes: 60,
          originalPositionPx: 240, // 2 hours from open
        })
      );

      act(() => {
        fireMouseDown(result.current.handleMouseDown, target, { clientX: 100, clientY: 100 });
      });

      // Move to 30min (60px)
      act(() => {
        document.dispatchEvent(mouseEvent('mousemove', { clientX: 160, clientY: 100 }));
      });
      expect(result.current.primaryOffset).toBe(60);

      // Move to 1hr (120px)
      act(() => {
        document.dispatchEvent(mouseEvent('mousemove', { clientX: 220, clientY: 100 }));
      });
      expect(result.current.primaryOffset).toBe(120);

      // Move back to 15min (30px)
      act(() => {
        document.dispatchEvent(mouseEvent('mousemove', { clientX: 130, clientY: 100 }));
      });
      expect(result.current.primaryOffset).toBe(30);
    });
  });

  // ── Cleanup ──

  describe('cleanup on unmount', () => {
    it('removes document listeners when unmounted during drag', () => {
      const removeSpy = jest.spyOn(document, 'removeEventListener');

      const { result, unmount } = renderHook(() =>
        useDragToReschedule({
          enabled: true,
          primaryAxis: 'x',
          pixelsPerMinute: 2,
          snapMinutes: 15,
          maxMinutes: 600,
          durationMinutes: 60,
          originalPositionPx: 120,
        })
      );

      act(() => {
        fireMouseDown(result.current.handleMouseDown, target, { clientX: 100, clientY: 100 });
      });

      // Start dragging
      act(() => {
        document.dispatchEvent(mouseEvent('mousemove', { clientX: 160, clientY: 100 }));
      });

      // Unmount while dragging
      unmount();

      // Should have called removeEventListener for both mousemove and mouseup
      const removeCalls = removeSpy.mock.calls.map(c => c[0]);
      expect(removeCalls).toContain('mousemove');
      expect(removeCalls).toContain('mouseup');

      removeSpy.mockRestore();
    });
  });

  // ── preventDefault ──

  describe('preventDefault', () => {
    it('calls preventDefault on mousedown to prevent text selection', () => {
      const { result } = renderHook(() =>
        useDragToReschedule({ enabled: true })
      );

      const event = fireMouseDown(result.current.handleMouseDown, target);

      expect(event.preventDefault).toHaveBeenCalled();
    });
  });
});
