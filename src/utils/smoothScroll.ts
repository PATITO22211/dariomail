import { useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * Adds damped inertial smoothing to wheel scrolling inside a scrollable
 * container while respecting reduced-motion preferences, pinch-zoom, and
 * manual scrollbar drags.
 */
export function useSmoothWheelScroll(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    let targetTop = el.scrollTop;
    let lastAppliedTop = el.scrollTop;
    let rafId: number | null = null;
    let animating = false;

    const step = () => {
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      targetTop = Math.max(0, Math.min(maxScroll, targetTop));

      // Yield cleanly if user manually dragged the scrollbar
      if (Math.abs(el.scrollTop - lastAppliedTop) > 6) {
        animating = false;
        rafId = null;
        return;
      }

      const diff = targetTop - el.scrollTop;
      if (Math.abs(diff) < 0.5) {
        el.scrollTop = targetTop;
        lastAppliedTop = targetTop;
        animating = false;
        rafId = null;
        return;
      }

      const nextTop = el.scrollTop + diff * 0.18;
      el.scrollTop = nextTop;
      lastAppliedTop = el.scrollTop;
      rafId = window.requestAnimationFrame(step);
    };

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll <= 1) return;

      const delta =
        e.deltaMode === 1
          ? e.deltaY * 32
          : e.deltaMode === 2
          ? e.deltaY * el.clientHeight
          : e.deltaY;

      if (delta === 0) return;

      // Allow overscroll at edges to behave naturally
      const atTop = el.scrollTop <= 0 && delta < 0;
      const atBottom = el.scrollTop >= maxScroll - 0.5 && delta > 0;
      if (atTop || atBottom) return;

      e.preventDefault();

      if (!animating) {
        targetTop = el.scrollTop;
        lastAppliedTop = el.scrollTop;
        animating = true;
      }

      targetTop = Math.max(0, Math.min(maxScroll, targetTop + delta));

      if (rafId === null) {
        rafId = window.requestAnimationFrame(step);
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      el.removeEventListener('wheel', onWheel);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [ref]);
}
