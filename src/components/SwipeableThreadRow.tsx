import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
} from 'react';
import { animate, motion, useMotionValue, type MotionProps } from 'motion/react';
import { Archive, Inbox, RotateCcw, Trash2 } from 'lucide-react';

const ACTION_WIDTH = 88;
const SNAP_THRESHOLD = 44;
const LOCK_PX = 10;
const COMMIT_RATIO = 0.7;
const TAP_GUARD_MS = 380;

export type SwipeActionKind = 'archive' | 'trash' | 'restore' | 'inbox' | 'destroy';

export type SwipeRevealAction = {
  kind: SwipeActionKind;
  label: string;
  side: 'start' | 'end';
  onInvoke: () => void;
  allowFullSwipeCommit: boolean;
};

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

type SwipeRowTapContextValue = {
  handlePrimaryTap: (openThread: () => void) => void;
};

const SwipeRowTapContext = createContext<SwipeRowTapContextValue | null>(null);

export function useSwipeRowPrimaryTap(openThread: () => void) {
  const ctx = useContext(SwipeRowTapContext);
  return () => {
    if (ctx) ctx.handlePrimaryTap(openThread);
    else openThread();
  };
}

function actionTone(kind: SwipeActionKind): string {
  if (kind === 'trash' || kind === 'destroy') {
    return 'bg-[var(--destructive-bg)] text-[var(--destructive-ink)]';
  }
  return 'bg-[color-mix(in_srgb,var(--accent)_28%,var(--canvas-bg))] text-[var(--accent)]';
}

function ActionIcon({ kind }: { kind: SwipeActionKind }) {
  if (kind === 'restore') return <RotateCcw className="w-5 h-5" strokeWidth={1.65} />;
  if (kind === 'inbox') return <Inbox className="w-5 h-5" strokeWidth={1.65} />;
  if (kind === 'archive') return <Archive className="w-5 h-5" strokeWidth={1.65} />;
  return <Trash2 className="w-5 h-5" strokeWidth={1.65} />;
}

type SwipeableThreadRowProps = {
  threadId: string;
  actions: SwipeRevealAction[];
  swipeEnabled: boolean;
  reducedMotion: boolean;
  isRevealed: boolean;
  onRevealChange: (threadId: string | null) => void;
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

function hapticPulse() {
  try {
    navigator.vibrate?.(14);
  } catch {
    // Sin vibración en este dispositivo
  }
}

export function SwipeableThreadRow({
  threadId,
  actions,
  swipeEnabled,
  reducedMotion,
  isRevealed,
  onRevealChange,
  children,
  motionProps,
  rowRef,
  onMouseEnter,
  className = '',
}: SwipeableThreadRowProps) {
  const x = useMotionValue(0);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const rowWidthRef = useRef(320);
  const gesture = useRef<TouchGesture | null>(null);
  const tapGuardUntil = useRef(0);
  const [committing, setCommitting] = useState<SwipeActionKind | null>(null);
  const [commitFill, setCommitFill] = useState(0);

  const startAction = actions.find((action) => action.side === 'start');
  const endAction = actions.find((action) => action.side === 'end');

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const measure = () => {
      rowWidthRef.current = el.clientWidth || 320;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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

  const snapOpenX = useCallback(() => {
    const current = x.get();
    if (current < -SNAP_THRESHOLD && endAction) return -ACTION_WIDTH;
    if (current > SNAP_THRESHOLD && startAction) return ACTION_WIDTH;
    return 0;
  }, [endAction, startAction, x]);

  const runCommitAnimation = useCallback(
    async (action: SwipeRevealAction) => {
      if (committing) return;
      setCommitting(action.kind);
      hapticPulse();
      const width = rowWidthRef.current;
      if (reducedMotion) {
        action.onInvoke();
        setCommitting(null);
        setCommitFill(0);
        return;
      }
      setCommitFill(width);
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 220);
      });
      action.onInvoke();
      setCommitting(null);
      setCommitFill(0);
      x.set(0);
      onRevealChange(null);
    },
    [committing, onRevealChange, reducedMotion, x]
  );

  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (!swipeEnabled || committing || actions.length === 0) return;
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
      if (Math.abs(dy) * 1.5 >= Math.abs(dx)) {
        g.locked = 'vertical';
        gesture.current = null;
        return;
      }
      g.locked = 'horizontal';
    }

    if (g.locked !== 'horizontal') return;
    if (e.cancelable) e.preventDefault();

    let next = g.baseX + dx;
    if (!startAction && next > 0) next = 0;
    if (!endAction && next < 0) next = 0;
    const max = rowWidthRef.current * 0.82;
    x.set(Math.max(-max, Math.min(max, next)));
  };

  const onTouchEnd = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.locked !== 'horizontal') return;

    tapGuardUntil.current = Date.now() + TAP_GUARD_MS;
    const current = x.get();
    const commitThreshold = rowWidthRef.current * COMMIT_RATIO;

    if (current >= commitThreshold && startAction?.allowFullSwipeCommit) {
      void runCommitAnimation(startAction);
      return;
    }
    if (current <= -commitThreshold && endAction?.allowFullSwipeCommit) {
      void runCommitAnimation(endAction);
      return;
    }

    const snapped = snapOpenX();
    if (snapped === 0) {
      closeRow();
    } else {
      animateTo(snapped, () => onRevealChange(threadId));
    }
  };

  const handlePrimaryTap = useCallback(
    (openThread: () => void) => {
      if (Date.now() < tapGuardUntil.current) return;
      const offset = Math.abs(x.get());
      if (offset > 12) {
        closeRow();
        return;
      }
      openThread();
    },
    [closeRow, x]
  );

  useEffect(() => {
    const el = shellRef.current;
    if (!el || !swipeEnabled) return;
    const blockScroll = (e: Event) => {
      if (gesture.current?.locked === 'horizontal') e.preventDefault();
    };
    el.addEventListener('touchmove', blockScroll, { passive: false });
    return () => el.removeEventListener('touchmove', blockScroll);
  }, [swipeEnabled]);

  const showSwipeChrome = swipeEnabled && actions.length > 0;

  return (
    <SwipeRowTapContext.Provider value={{ handlePrimaryTap }}>
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
              {startAction && (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    void runCommitAnimation(startAction);
                  }}
                  style={{
                    width: committing === startAction.kind ? commitFill : ACTION_WIDTH,
                  }}
                  className={`absolute inset-y-0 left-0 z-0 flex flex-col items-center justify-center gap-1 transition-[width] duration-200 sacred-focus ${actionTone(startAction.kind)} ${committing === startAction.kind ? 'opacity-100' : ''}`}
                  aria-label={startAction.label}
                >
                  <ActionIcon kind={startAction.kind} />
                  <span className="text-[11px] font-medium tracking-wide px-1 text-center leading-tight">
                    {startAction.label}
                  </span>
                </button>
              )}
              {endAction && (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    void runCommitAnimation(endAction);
                  }}
                  style={{
                    width: committing === endAction.kind ? commitFill : ACTION_WIDTH,
                  }}
                  className={`absolute inset-y-0 right-0 z-0 flex flex-col items-center justify-center gap-1 transition-[width] duration-200 sacred-focus ${actionTone(endAction.kind)} ${committing === endAction.kind ? 'opacity-100' : ''}`}
                  aria-label={endAction.label}
                >
                  <ActionIcon kind={endAction.kind} />
                  <span className="text-[11px] font-medium tracking-wide px-1 text-center leading-tight">
                    {endAction.label}
                  </span>
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
    </SwipeRowTapContext.Provider>
  );
}