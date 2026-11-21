import { useCallback, useRef, useState, type RefObject, type TouchEvent } from 'react';

const PULL_MAX = 96;
const PULL_TRIGGER = 68;

export function usePullToRefresh(
  scrollRef: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  onRefresh: () => Promise<void>
) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const gesture = useRef<{ startY: number; tracking: boolean } | null>(null);
  const pullDistanceRef = useRef(0);
  pullDistanceRef.current = pullDistance;

  const reset = useCallback(() => {
    gesture.current = null;
    setPullDistance(0);
  }, []);

  const onTouchStart = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      const el = scrollRef.current;
      if (!enabled || refreshing || !el || el.scrollTop > 6 || event.touches.length !== 1) return;
      gesture.current = { startY: event.touches[0]!.clientY, tracking: true };
    },
    [enabled, refreshing, scrollRef]
  );

  const onTouchMove = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      const g = gesture.current;
      const el = scrollRef.current;
      if (!g?.tracking || !el || refreshing) return;
      const dy = event.touches[0]!.clientY - g.startY;
      if (dy <= 0) {
        setPullDistance(0);
        return;
      }
      if (el.scrollTop > 6) {
        reset();
        return;
      }
      if (event.cancelable) event.preventDefault();
      setPullDistance(Math.min(PULL_MAX, dy * 0.55));
    },
    [refreshing, reset, scrollRef]
  );

  const onTouchEnd = useCallback(() => {
    const g = gesture.current;
    if (!g?.tracking) return;
    if (pullDistanceRef.current >= PULL_TRIGGER && !refreshing) {
      setRefreshing(true);
      setPullDistance(0);
      void onRefresh()
        .catch(() => undefined)
        .finally(() => {
          setRefreshing(false);
          reset();
        });
      return;
    }
    reset();
  }, [onRefresh, refreshing, reset]);

  return {
    pullDistance,
    refreshing,
    pullHandlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel: onTouchEnd,
    },
  };
}