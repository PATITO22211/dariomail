import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
} from 'react';
import { animate, motion, useMotionValue, type MotionProps } from 'motion/react';
import { Archive, Trash2 } from 'lucide-react';

const ACTION_WIDTH = 88;
const SNAP_THRESHOLD = 48;
const FULL_SWIPE = 108;
const LOCK_PX = 10;

export function useSwipeListEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse), (max-width: 767px)');
    const update = () => setEnabled(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return enabled;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return reduced;
}

type SwipeableThreadRowProps = {
  threadId: string;
  canArchive: boolean;
  canTrash: boolean;
  swipeEnabled: boolean;
  reducedMotion: boolean;
  isRevealed: boolean;
  onRevealChange: (threadId: string | null) => void;
  onArchive: () => void;
  onTrash: () => void;
  children: ReactNode;
  motionProps?: MotionProps;
  rowRef?: (el: HTMLLIElement | null) => void;
  onMouseEnter?: () => void;
  className?: string;
};

type TouchGesture = {
  startX: number;
  startY: number;
  baseX: number;
  locked: 'none' | 'horizontal' | 'vertical';
};

export function SwipeableThreadRow({
  threadId,
  canArchive,
  canTrash,
  swipeEnabled,
  reducedMotion,
  isRevealed,
  onRevealChange,
  onArchive,
  onTrash,
  children,
  motionProps,
  rowRef,
  onMouseEnter,
  className = '',
}: SwipeableThreadRowProps) {
  const x = useMotionValue(0);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const gesture = useRef<TouchGesture | null>(null);
  const [collapsing, setCollapsing] = useState(false);

  const snapOpenX = useCallback(() => {
    const current = x.get();
    if (current < -SNAP_THRESHOLD && canTrash) return -ACTION_WIDTH;
    if (current > SNAP_THRESHOLD && canArchive) return ACTION_WIDTH;
    return 0;
  }, [canArchive, canTrash, x]);

  const animateTo = useCallback(
    (target: number, onDone?: () => void) => {
      if (reducedMotion) {
        x.set(target);
        onDone?.();
        return;
      }
      void animate(x, target, {
        type: 'spring',
        stiffness: 520,
        damping: 42,
        mass: 0.72,
        onComplete: onDone,
      });
    },
    [reducedMotion, x]
  );

  const closeRow = useCallback(() => {
    animateTo(0, () => onRevealChange(null));
  }, [animateTo, onRevealChange]);

  useEffect(() => {
    if (!isRevealed) {
      const current = x.get();
      if (Math.abs(current) > 0.5) animateTo(0);
    }
  }, [animateTo, isRevealed, x]);

  const runAction = useCallback(
    async (kind: 'archive' | 'trash') => {
      if (collapsing) return;
      setCollapsing(true);
      const w = typeof window !== 'undefined' ? window.innerWidth : 480;
      const target = kind === 'trash' ? -w : w;
      if (reducedMotion) {
        if (kind === 'archive') onArchive();
        else onTrash();
        setCollapsing(false);
        return;
      }
      await new Promise<void>((resolve) => {
        animate(x, target, {
          duration: 0.22,
          ease: [0.32, 0.72, 0, 1],
          onComplete: () => resolve(),
        });
      });
      if (kind === 'archive') onArchive();
      else onTrash();
      setCollapsing(false);
    },
    [collapsing, onArchive, onTrash, reducedMotion, x]
  );

  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (!swipeEnabled || collapsing || (!canArchive && !canTrash)) return;
    if (e.touches.length !== 1) return;
    const t = e.touches[0]!;
    gesture.current = {
      startX: t.clientX,
      startY: t.clientY,
      baseX: x.get(),
      locked: 'none',
    };
    x.set(gesture.current.baseX);
    onRevealChange(threadId);
  };

  const onTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || !swipeEnabled) return;
    const t = e.touches[0];
    if (!t) return;

    const dx = t.clientX - g.startX;
    const dy = t.clientY - g.startY;

    if (g.locked === 'none') {
      if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        g.locked = 'vertical';
        gesture.current = null;
        return;
      }
      g.locked = 'horizontal';
    }

    if (g.locked !== 'horizontal') return;

    if (e.cancelable) e.preventDefault();

    let next = g.baseX + dx;
    if (!canArchive && next > 0) next = 0;
    if (!canTrash && next < 0) next = 0;
    const max = ACTION_WIDTH * 1.35;
    x.set(Math.max(-max, Math.min(max, next)));
  };

  const onTouchEnd = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.locked !== 'horizontal') return;

    const current = x.get();
    if (current <= -FULL_SWIPE && canTrash) {
      void runAction('trash');
      return;
    }
    if (current >= FULL_SWIPE && canArchive) {
      void runAction('archive');
      return;
    }

    const snapped = snapOpenX();
    if (snapped === 0) {
      closeRow();
    } else {
      animateTo(snapped, () => onRevealChange(threadId));
    }
  };

  useEffect(() => {
    const el = shellRef.current;
    if (!el || !swipeEnabled) return;
    const blockScroll = (e: Event) => {
      if (gesture.current?.locked === 'horizontal') e.preventDefault();
    };
    el.addEventListener('touchmove', blockScroll, { passive: false });
    return () => el.removeEventListener('touchmove', blockScroll);
  }, [swipeEnabled]);

  const showSwipeChrome = swipeEnabled && (canArchive || canTrash);

  return (
    <motion.li
      {...motionProps}
      ref={rowRef}
      onMouseEnter={onMouseEnter}
      className={`group relative border-b border-[var(--hairline)] last:border-b-0 transition-colors duration-150 hover:bg-[var(--surface-hover)] rounded-xl overflow-hidden ${className}`}
      layout={!reducedMotion}
    >
      <div ref={shellRef} className="relative touch-pan-y">
        {showSwipeChrome && (
          <>
            {canArchive && (
              <button
                type="button"
                tabIndex={-1}
                onClick={() => {
                  void runAction('archive');
                }}
                className="absolute inset-y-0 left-0 z-0 w-[88px] flex flex-col items-center justify-center gap-1 bg-[#2a2622] text-[#F4EFE6] sacred-focus"
                aria-label="Archivar"
              >
                <Archive className="w-5 h-5" strokeWidth={1.65} />
                <span className="text-[11px] font-medium tracking-wide">Archivar</span>
              </button>
            )}
            {canTrash && (
              <button
                type="button"
                tabIndex={-1}
                onClick={() => {
                  void runAction('trash');
                }}
                className="absolute inset-y-0 right-0 z-0 w-[88px] flex flex-col items-center justify-center gap-1 bg-[#6B2222] text-[#F4EFE6] sacred-focus"
                aria-label="Borrar"
              >
                <Trash2 className="w-5 h-5" strokeWidth={1.65} />
                <span className="text-[11px] font-medium tracking-wide">Borrar</span>
              </button>
            )}
          </>
        )}

        <motion.div
          style={{ x, touchAction: showSwipeChrome ? 'pan-y' : undefined }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          className="relative z-[1] bg-[var(--surface-bg)] group-hover:bg-[var(--surface-hover)] transition-colors duration-150"
        >
          {children}
        </motion.div>
      </div>
    </motion.li>
  );
}