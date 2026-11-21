import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useScroll, useSpring, useTransform } from 'motion/react';
import {
  Archive,
  Mail,
  MailOpen,
  Menu,
  PenLine,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { FolderId, MailThread } from '../types/mail';
import {
  FOLDER_META,
  formatEditorialTimestamp,
  getThreadDisplaySender,
} from '../utils/mailStore';
import { useSmoothWheelScroll } from '../utils/smoothScroll';

interface ThreadFeedProps {
  folder: FolderId;
  threads: MailThread[];
  searchQuery: string;
  focusedIndex: number;
  currentUserEmail: string;
  referenceIso: string;
  initialScrollTop: number;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onScrollChange: (scrollTop: number) => void;
  onSearchChange: (q: string) => void;
  onOpenThread: (thread: MailThread) => void;
  onArchiveThread: (threadId: string) => void;
  onTrashThread: (threadId: string) => void;
  onRestoreThread: (threadId: string) => void;
  onToggleUnread: (threadId: string, nextUnread: boolean) => void;
  onEmptyTrash: () => void;
  onOpenMobileMenu: () => void;
  onOpenCompose: () => void;
  onFocusIndexChange: (index: number) => void;
}

type InboxFilter = 'all' | 'unread';

function RowAvatar({ name, avatar }: { name: string; avatar?: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  if (avatar && !failed) {
    return (
      <img
        src={avatar}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="w-9 h-9 rounded-full object-cover shrink-0 bg-[var(--surface-hover)] ring-1 ring-[var(--hairline)]"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="w-9 h-9 rounded-full shrink-0 inline-flex items-center justify-center text-[12px] font-medium bg-[var(--surface-input)] border border-[var(--hairline)] text-[var(--ink-secondary)]"
    >
      {initials}
    </span>
  );
}

export function ThreadFeed({
  folder,
  threads,
  searchQuery,
  focusedIndex,
  currentUserEmail,
  referenceIso,
  initialScrollTop,
  searchInputRef,
  onScrollChange,
  onSearchChange,
  onOpenThread,
  onArchiveThread,
  onTrashThread,
  onRestoreThread,
  onToggleUnread,
  onEmptyTrash,
  onOpenMobileMenu,
  onOpenCompose,
  onFocusIndexChange,
}: ThreadFeedProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Array<HTMLLIElement | null>>([]);
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>('all');
  const folderInfo = FOLDER_META[folder];

  useSmoothWheelScroll(scrollRef);

  const { scrollY, scrollYProgress } = useScroll({ container: scrollRef });
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 260,
    damping: 32,
    restDelta: 0.001,
  });
  const mastheadY = useTransform(scrollY, [0, 100], [0, -10]);
  const mastheadOpacity = useTransform(scrollY, [0, 90], [1, 0]);
  const headerHairlineOpacity = useTransform(scrollY, [0, 28], [0, 1]);

  useEffect(() => {
    setInboxFilter('all');
  }, [folder]);

  useEffect(() => {
    if (scrollRef.current && initialScrollTop > 0) {
      scrollRef.current.scrollTop = initialScrollTop;
    }
  }, [initialScrollTop]);

  useEffect(() => {
    const targetRow = rowRefs.current[focusedIndex];
    if (targetRow) {
      targetRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [focusedIndex]);

  const unreadCount = useMemo(
    () => threads.filter((t) => t.unread).length,
    [threads]
  );

  const displayedThreads = useMemo(() => {
    if (folder !== 'inbox' || searchQuery.trim() || inboxFilter === 'all') {
      return threads;
    }
    return threads.filter((t) => t.unread);
  }, [threads, folder, searchQuery, inboxFilter]);

  const grouped = useMemo(() => {
    const refDate = new Date(referenceIso);
    const today: MailThread[] = [];
    const earlier: MailThread[] = [];

    for (const thread of displayedThreads) {
      const d = new Date(thread.updatedAt);
      const isToday =
        d.getFullYear() === refDate.getFullYear() &&
        d.getMonth() === refDate.getMonth() &&
        d.getDate() === refDate.getDate();
      if (isToday) {
        today.push(thread);
      } else {
        earlier.push(thread);
      }
    }

    return { today, earlier };
  }, [displayedThreads, referenceIso]);

  const renderThreadRow = (thread: MailThread, globalIndex: number) => {
    const latestMsg = thread.messages[thread.messages.length - 1];
    const displaySender = getThreadDisplaySender(thread, currentUserEmail);
    const formattedTime = formatEditorialTimestamp(thread.updatedAt, referenceIso);
    const messageCount = thread.messages.length;
    const isFocused = focusedIndex === globalIndex;
    const primaryAvatar =
      [...thread.messages].reverse().find((m) => m.sender.avatar)?.sender.avatar ??
      latestMsg?.sender.avatar;
    const avatarName = latestMsg?.sender.name ?? displaySender;

    return (
      <motion.li
        key={thread.id}
        ref={(el) => {
          rowRefs.current[globalIndex] = el;
        }}
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ root: scrollRef, once: true, amount: 0.06 }}
        transition={{
          duration: 0.28,
          delay: Math.min(globalIndex * 0.024, 0.12),
          ease: [0.22, 1, 0.36, 1],
        }}
        onMouseEnter={() => onFocusIndexChange(globalIndex)}
        className="group relative border-b border-[var(--hairline)] last:border-b-0 transition-colors duration-150 hover:bg-[var(--surface-hover)] rounded-xl"
      >
        {/* Subtle left burgundy rail on keyboard focus */}
        {isFocused && (
          <span
            aria-hidden="true"
            className="absolute left-0 top-4 bottom-4 w-[2px] rounded-full bg-[var(--accent)] pointer-events-none"
          />
        )}

        <button
          type="button"
          onClick={() => onOpenThread(thread)}
          aria-label={`${thread.unread ? 'No leído: ' : ''}${displaySender} — ${thread.subject}`}
          className="w-full text-left flex items-start gap-4 px-4 py-4.5 rounded-xl sacred-focus cursor-pointer"
        >
          {/* Living Unread Dot + Avatar */}
          <div className="relative shrink-0 mt-0.5">
            <RowAvatar name={avatarName} avatar={primaryAvatar} />
            {thread.unread && (
              <>
                <span
                  aria-hidden="true"
                  className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-[6px] h-[6px] rounded-full unread-jewel"
                />
                <span className="sr-only">No leído</span>
              </>
            )}
          </div>

          {/* Two-Beat Editorial Hierarchy (unclipped subject + calm preview) */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-4">
              <div className="flex items-baseline gap-2 min-w-0">
                <span
                  className={`truncate text-[13.5px] tracking-[-0.01em] ${
                    thread.unread
                      ? 'font-semibold text-[var(--ink-primary)]'
                      : 'font-medium text-[var(--ink-secondary)]'
                  }`}
                >
                  {displaySender}
                </span>
                {messageCount > 1 && (
                  <span
                    title={`${messageCount} mensajes`}
                    className="font-mono text-[11px] tabular-nums text-[var(--accent)] shrink-0"
                  >
                    · {messageCount}
                  </span>
                )}
              </div>

              <time
                dateTime={thread.updatedAt}
                className="shrink-0 font-mono text-[11.5px] tabular-nums text-[var(--ink-muted)] group-hover:opacity-0 transition-opacity duration-150 whitespace-nowrap"
              >
                {formattedTime}
              </time>
            </div>

            <div className="mt-1 flex flex-col gap-0.5 pr-4 md:pr-24">
              <span
                className={`text-[15px] leading-snug tracking-[-0.012em] truncate ${
                  thread.unread
                    ? 'font-semibold text-[var(--ink-primary)]'
                    : 'font-normal text-[var(--ink-primary)]/90'
                }`}
              >
                {thread.subject}
              </span>
              <span className="text-[13.5px] leading-relaxed text-[var(--ink-muted)] truncate">
                {latestMsg?.plainSnippet}
              </span>
            </div>
          </div>
        </button>

        {/* Quiet Hover Quick Actions over Top-Right Timestamp */}
        <div className="absolute right-3 top-3.5 flex items-center gap-0.5 px-1.5 py-1 rounded-full floating-monolith opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity duration-150">
          {folder !== 'archive' && folder !== 'trash' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onArchiveThread(thread.id);
              }}
              aria-label={`Archivar "${thread.subject}"`}
              title="Archivar (E)"
              className="p-1.5 rounded-full text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] transition-colors sacred-focus cursor-pointer"
            >
              <Archive className="w-3.5 h-3.5" strokeWidth={1.65} />
            </button>
          )}

          {folder === 'trash' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRestoreThread(thread.id);
              }}
              aria-label={`Restaurar "${thread.subject}" a Recibidos`}
              title="Restaurar"
              className="p-1.5 rounded-full text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] transition-colors sacred-focus cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.65} />
            </button>
          )}

          {folder !== 'drafts' && folder !== 'trash' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleUnread(thread.id, !thread.unread);
              }}
              aria-label={
                thread.unread
                  ? `Marcar como leído "${thread.subject}"`
                  : `Marcar como no leído "${thread.subject}"`
              }
              title={thread.unread ? 'Marcar como leído' : 'Marcar como no leído'}
              className="p-1.5 rounded-full text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] transition-colors sacred-focus cursor-pointer"
            >
              {thread.unread ? (
                <MailOpen className="w-3.5 h-3.5" strokeWidth={1.65} />
              ) : (
                <Mail className="w-3.5 h-3.5" strokeWidth={1.65} />
              )}
            </button>
          )}

          {folder !== 'trash' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTrashThread(thread.id);
              }}
              aria-label={`Mover a papelera "${thread.subject}"`}
              title="Eliminar"
              className="p-1.5 rounded-full text-[var(--ink-secondary)] hover:text-[var(--accent)] hover:bg-[var(--surface-hover)] transition-colors sacred-focus cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.65} />
            </button>
          )}
        </div>
      </motion.li>
    );
  };

  return (
    <motion.section
      key="thread-feed-stage"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      aria-label={`Lista de ${folderInfo.label}`}
      className="flex flex-col h-full w-full"
    >
      {/* Top Bar echoing dariomsi.com editorial identity + scroll hairline */}
      <div className="relative shrink-0 w-full max-w-[1040px] mx-auto px-6 md:px-10 pt-6 pb-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Abrir carpetas"
            className="md:hidden p-2 -ml-2 rounded-full text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] sacred-focus"
          >
            <Menu className="w-5 h-5" strokeWidth={1.6} />
          </button>

          <div className="flex items-baseline gap-2.5 min-w-0">
            <span className="text-[11.5px] font-semibold tracking-[0.14em] uppercase text-[var(--ink-primary)] whitespace-nowrap">
              DARIO MSI
            </span>
            <span className="hidden sm:inline text-[12px] text-[var(--ink-muted)] truncate">
              inbox.dariomsi.com
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Sculpted Precision Search Input */}
          <div className="precision-input relative flex items-center w-44 sm:w-64 md:w-72 rounded-full px-3.5 py-1.5">
            <Search
              className="w-3.5 h-3.5 text-[var(--ink-muted)] shrink-0 mr-2"
              strokeWidth={1.65}
            />
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar…"
              aria-label="Buscar en el correo"
              className="w-full bg-transparent text-[13px] text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] outline-none caret-[var(--accent)]"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Limpiar búsqueda"
                className="ml-1 p-0.5 rounded-full text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <kbd className="hidden sm:inline font-mono text-[10px] text-[var(--ink-faint)] ml-1.5 select-none">
                /
              </kbd>
            )}
          </div>

          {/* Signature dariomsi.com High-Contrast Pill CTA */}
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={onOpenCompose}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--cta-bg)] text-[var(--cta-ink)] text-[13px] font-medium hover:opacity-90 transition-opacity sacred-focus cursor-pointer whitespace-nowrap shrink-0"
          >
            <PenLine className="w-3.5 h-3.5" strokeWidth={1.8} />
            <span className="hidden sm:inline">Redactar</span>
          </motion.button>
        </div>

        {/* Scroll-linked editorial hairline & progress filament */}
        <motion.div
          aria-hidden="true"
          style={{ opacity: headerHairlineOpacity }}
          className="pointer-events-none absolute bottom-0 left-6 right-6 md:left-10 md:right-10 h-[1px] bg-[var(--hairline)] overflow-hidden"
        >
          <motion.div
            style={{ scaleX: smoothProgress }}
            className="h-full w-full origin-left bg-[var(--accent)]"
          />
        </motion.div>
      </div>

      {/* Scrollable Editorial Feed with soft edge mask */}
      <div
        ref={scrollRef}
        onScroll={(e) => onScrollChange(e.currentTarget.scrollTop)}
        className="flex-1 overflow-y-auto editorial-scroll-mask px-6 md:px-10 pb-16"
      >
        <div className="w-full max-w-[960px] mx-auto">
          {/* Literary Masthead + Redesigned Segmented Switch (Todos / No leídos) */}
          <motion.header
            style={{ y: mastheadY, opacity: mastheadOpacity }}
            className="pt-8 pb-7 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--hairline)]"
          >
            <div>
              <p className="text-[11px] font-medium tracking-[0.16em] uppercase text-[var(--accent)] mb-1.5">
                {searchQuery.trim() ? 'Búsqueda' : folderInfo.englishAlias}
              </p>
              <h1
                className="text-[42px] md:text-[50px] font-normal leading-[1.04] tracking-[-0.02em] text-[var(--ink-primary)]"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                {searchQuery.trim() ? (
                  <>
                    Resultados para{' '}
                    <em className="italic text-[var(--accent)]">«{searchQuery.trim()}»</em>
                  </>
                ) : (
                  folderInfo.label
                )}
              </h1>
            </div>

            <div className="flex items-center gap-3">
              {folder === 'inbox' && !searchQuery.trim() && (
                <div
                  role="group"
                  aria-label="Filtrar bandeja"
                  className="relative inline-flex items-center p-1 rounded-full border border-[var(--hairline-strong)] bg-[var(--surface-elevated)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.22)]"
                >
                  {(
                    [
                      { id: 'all', label: 'Todos' },
                      { id: 'unread', label: 'No leídos' },
                    ] as const
                  ).map((tab) => {
                    const active = inboxFilter === tab.id;
                    return (
                      <motion.button
                        key={tab.id}
                        type="button"
                        aria-pressed={active}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => setInboxFilter(tab.id)}
                        className={`relative z-10 inline-flex items-center justify-center gap-2 px-4 py-1.5 rounded-full text-[12.5px] font-medium transition-colors duration-200 whitespace-nowrap sacred-focus cursor-pointer ${
                          active
                            ? 'text-[var(--cta-ink)]'
                            : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="inbox-filter-pill"
                            transition={{
                              type: 'spring',
                              stiffness: 480,
                              damping: 32,
                              mass: 0.78,
                            }}
                            aria-hidden="true"
                            className="absolute inset-0 -z-10 rounded-full bg-[var(--cta-bg)] shadow-[0_2px_10px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.16)]"
                          />
                        )}
                        <span>{tab.label}</span>
                        {tab.id === 'unread' && unreadCount > 0 && (
                          <span
                            className={`inline-flex items-center gap-1 font-mono text-[10.5px] tabular-nums transition-colors ${
                              active
                                ? 'text-[var(--cta-ink)]/80'
                                : 'text-[var(--ink-muted)]'
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className={`w-1.5 h-1.5 rounded-full ${
                                active ? 'bg-[var(--accent)]' : 'unread-jewel'
                              }`}
                            />
                            {unreadCount}
                          </span>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              )}

              {folder === 'trash' && displayedThreads.length > 0 && !searchQuery && (
                <button
                  type="button"
                  onClick={onEmptyTrash}
                  className="px-3.5 py-1.5 rounded-full border border-[var(--hairline-strong)] text-[12.5px] text-[var(--ink-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]/40 transition-colors whitespace-nowrap shrink-0 sacred-focus cursor-pointer"
                >
                  Vaciar papelera
                </button>
              )}
            </div>
          </motion.header>

          {/* Feed Body */}
          <motion.div
            key={`${folder}-${inboxFilter}-${Boolean(searchQuery.trim())}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            {displayedThreads.length === 0 ? (
              <div className="py-24 flex flex-col items-center justify-center text-center px-6">
                <p
                  className="text-[32px] font-normal leading-tight text-[var(--ink-primary)] mb-2"
                  style={{ fontFamily: 'var(--font-serif)' }}
                >
                  {searchQuery.trim() ? 'Sin coincidencias' : folderInfo.emptyTitle}
                </p>
                <p className="text-[14px] text-[var(--ink-muted)] max-w-sm leading-relaxed mb-6">
                  {searchQuery.trim()
                    ? 'Prueba con otro remitente, asunto o palabra clave.'
                    : folderInfo.emptyHint}
                </p>
                {searchQuery.trim() ? (
                  <button
                    type="button"
                    onClick={() => onSearchChange('')}
                    className="px-4 py-2 rounded-full bg-[var(--cta-bg)] text-[var(--cta-ink)] text-[13px] font-medium cursor-pointer"
                  >
                    Ver {folderInfo.label.toLowerCase()}
                  </button>
                ) : inboxFilter !== 'all' ? (
                  <button
                    type="button"
                    onClick={() => setInboxFilter('all')}
                    className="px-4 py-2 rounded-full border border-[var(--hairline-strong)] text-[13px] text-[var(--ink-primary)] cursor-pointer"
                  >
                    Ver todos
                  </button>
                ) : null}
              </div>
            ) : searchQuery.trim() || folder !== 'inbox' ? (
              <ul className="mt-2" data-testid="thread-list">
                {displayedThreads.map((thread, idx) => renderThreadRow(thread, idx))}
              </ul>
            ) : (
              <div className="mt-6 space-y-8" data-testid="thread-list">
                {grouped.today.length > 0 && (
                  <div>
                    <h2 className="px-4 mb-2 text-[11px] font-medium tracking-[0.14em] uppercase text-[var(--ink-muted)]">
                      Hoy
                    </h2>
                    <ul>
                      {grouped.today.map((thread, idx) => renderThreadRow(thread, idx))}
                    </ul>
                  </div>
                )}

                {grouped.earlier.length > 0 && (
                  <div>
                    <h2 className="px-4 mb-2 text-[11px] font-medium tracking-[0.14em] uppercase text-[var(--ink-muted)]">
                      Anteriores
                    </h2>
                    <ul>
                      {grouped.earlier.map((thread, idx) =>
                        renderThreadRow(thread, grouped.today.length + idx)
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}
