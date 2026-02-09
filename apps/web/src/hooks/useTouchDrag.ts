import { useCallback, useRef, useEffect } from 'react';

const LONG_PRESS_MS = 450;
const MOVE_THRESHOLD_PX = 10;

export type PitchSlot =
  | { type: 'lineup'; index: number }
  | { type: 'bench'; index: number };

const PITCH_SLOT_ATTR = 'data-pitch-slot';

export function getPitchSlotDataAttribute(slot: PitchSlot): string {
  return JSON.stringify(slot);
}

export function parsePitchSlotFromElement(
  el: Element | null,
): PitchSlot | null {
  const slotEl = el?.closest?.(`[${PITCH_SLOT_ATTR}]`);
  if (!slotEl) return null;
  try {
    const raw = slotEl.getAttribute(PITCH_SLOT_ATTR);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PitchSlot;
    if (
      (parsed.type === 'lineup' || parsed.type === 'bench') &&
      typeof parsed.index === 'number'
    ) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

interface UseTouchDragOptions {
  onDragStart: (slot: PitchSlot) => void;
  onDrop: (targetSlot: PitchSlot) => void;
  onDragEnd: () => void;
  setDropTargetSlot: (slot: PitchSlot | null) => void;
  isTouchDevice?: boolean;
}

export function useTouchDrag({
  onDragStart,
  onDrop,
  onDragEnd,
  setDropTargetSlot,
  isTouchDevice = typeof window !== 'undefined' &&
    'ontouchstart' in window,
}: UseTouchDragOptions) {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSlotRef = useRef<PitchSlot | null>(null);
  const dragStartedRef = useRef(false);
  const dropTargetRef = useRef<PitchSlot | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startXYRef = useRef<{ x: number; y: number } | null>(null);
  const listenersRef = useRef<{
    move: (e: PointerEvent) => void;
    up: (e: PointerEvent) => void;
    cancel: () => void;
  } | null>(null);

  const onDragEndRef = useRef(onDragEnd);
  const setDropTargetSlotRef = useRef(setDropTargetSlot);
  const onDropRef = useRef(onDrop);
  onDragEndRef.current = onDragEnd;
  setDropTargetSlotRef.current = setDropTargetSlot;
  onDropRef.current = onDrop;

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pendingSlotRef.current = null;
  }, []);

  useEffect(() => {
    function removeListeners(): void {
      const listeners = listenersRef.current;
      if (listeners) {
        document.removeEventListener('pointermove', listeners.move);
        document.removeEventListener('pointerup', listeners.up);
        document.removeEventListener('pointercancel', listeners.cancel);
      }
    }

    function cleanup(): void {
      dragStartedRef.current = false;
      dropTargetRef.current = null;
      pointerIdRef.current = null;
      startXYRef.current = null;
      setDropTargetSlotRef.current(null);
      onDragEndRef.current();
      removeListeners();
    }

    function onPointerMove(e: PointerEvent): void {
      if (pointerIdRef.current !== e.pointerId || !dragStartedRef.current)
        return;
      e.preventDefault();
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const slot = parsePitchSlotFromElement(target);
      dropTargetRef.current = slot;
      setDropTargetSlotRef.current(slot);
    }

    function onPointerUp(e: PointerEvent): void {
      if (pointerIdRef.current !== e.pointerId) return;
      if (dragStartedRef.current) {
        e.preventDefault();
        const target = dropTargetRef.current;
        if (target) onDropRef.current(target);
        removeListeners();
      }
      clearLongPressTimer();
      cleanup();
    }

    function onPointerCancel(): void {
      clearLongPressTimer();
      removeListeners();
      cleanup();
    }

    listenersRef.current = {
      move: onPointerMove,
      up: onPointerUp,
      cancel: onPointerCancel,
    };

    return () => {
      clearLongPressTimer();
      removeListeners();
    };
  }, [clearLongPressTimer]);

  const getPointerDown = useCallback(
    (slot: PitchSlot) =>
      (e: React.PointerEvent) => {
        if (!isTouchDevice || e.pointerType !== 'touch') return;
        if (e.button !== 0) return;
        clearLongPressTimer();
        pendingSlotRef.current = slot;
        pointerIdRef.current = e.pointerId;
        startXYRef.current = { x: e.clientX, y: e.clientY };

        longPressTimerRef.current = setTimeout(() => {
          longPressTimerRef.current = null;
          const currentSlot = pendingSlotRef.current;
          pendingSlotRef.current = null;
          const listeners = listenersRef.current;
          if (currentSlot && listeners) {
            dragStartedRef.current = true;
            onDragStart(currentSlot);
            document.addEventListener('pointermove', listeners.move, {
              passive: false,
            });
            document.addEventListener('pointerup', listeners.up, {
              capture: true,
            });
            document.addEventListener('pointercancel', listeners.cancel, {
              capture: true,
            });
          }
        }, LONG_PRESS_MS);
      },
    [isTouchDevice, clearLongPressTimer, onDragStart],
  );

  const getPointerUp = useCallback(
    () => (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch' || e.pointerId !== pointerIdRef.current)
        return;
      if (!dragStartedRef.current) {
        clearLongPressTimer();
      }
    },
    [clearLongPressTimer],
  );

  const getPointerMove = useCallback(
    () => (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch' || pendingSlotRef.current === null) return;
      const start = startXYRef.current;
      if (start && longPressTimerRef.current) {
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (dx * dx + dy * dy > MOVE_THRESHOLD_PX * MOVE_THRESHOLD_PX) {
          clearLongPressTimer();
        }
      }
    },
    [clearLongPressTimer],
  );

  return {
    getPointerDown,
    getPointerUp,
    getPointerMove,
  };
}
