import { useEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react';
import {
  Archive,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  ChevronDown,
  Forward,
  Inbox,
  Mail,
  Minimize2,
  Paperclip,
  Reply,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import type { ComposeAttachment, MailMessage, MailThread, ThemeMode } from '../types/mail';
import {
  formatFullTimestamp,
  sanitizeEmailHtml,
  stripHtmlToSnippet,
} from '../utils/mailStore';
import { useSmoothWheelScroll } from '../utils/smoothScroll';
import { filesToAttachments } from '../utils/files';
import { AttachmentChips } from './AttachmentChips';
import { InvisibleIframe } from './InvisibleIframe';
import { TipTapFolio } from './TipTapFolio';

interface ReadingRoomProps {
  thread: MailThread;
  theme: ThemeMode;
  deepReading: boolean;
  onToggleDeepReading: () => void;
  onExitDeepReading: () => void;
  onBack: () => void;
  onArchive: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onMoveToInbox: () => void;
  onDeletePermanently: () => void;
  onMarkUnread: () => void;
  onForward: () => void;
  onShowRemoteImages: (messageId: string) => void;
  onTrustSender: (email: string) => void;
  onSendReply: (bodyHtml: string, attachments: ComposeAttachment[]) => void;
}

function SenderAvatar({
  name,
  avatar,
  size = 'md',
}: {
  name: string;
  avatar?: string;
  size?: 'sm' | 'md';
}) {
  const [imgError, setImgError] = useState(false);
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  const dims = size === 'sm' ? 'w-7 h-7 text-[11px]' : 'w-9 h-9 text-[12px]';

  if (avatar && !imgError) {
    return (
      <img
        src={avatar}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className={`${dims} rounded-full object-cover shrink-0 bg-[var(--surface-hover)] ring-1 ring-[var(--hairline)]`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${dims} rounded-full shrink-0 inline-flex items-center justify-center font-medium bg-[var(--surface-input)] border border-[var(--hairline)] text-[var(--ink-secondary)]`}
    >
      {initials}
    </span>
  );
}

export function ReadingRoom({
  thread,
  theme,
  deepReading,
  onToggleDeepReading,
  onExitDeepReading,
  onBack,
  onArchive,
  onTrash,
  onRestore,
  onMoveToInbox,
  onDeletePermanently,
  onMarkUnread,
  onForward,
  onShowRemoteImages,
  onTrustSender,
  onSendReply,
}: ReadingRoomProps) {
  const readerScrollRef = useRef<HTMLDivElement | null>(null);
  const lastIndex = thread.messages.length - 1;
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    const latest = thread.messages[thread.messages.length - 1];
    if (latest) map[latest.id] = true;
    return map;
  });

  const [replyOpen, setReplyOpen] = useState(false);
  const [replyHtml, setReplyHtml] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<ComposeAttachment[]>([]);
  const [replyError, setReplyError] = useState<string | null>(null);
  const replyFileRef = useRef<HTMLInputElement | null>(null);

  useSmoothWheelScroll(readerScrollRef);

  const { scrollY, scrollYProgress } = useScroll({ container: readerScrollRef });
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 260,
    damping: 32,
    restDelta: 0.001,
  });
  const progressVisibility = useTransform(scrollY, [0, 18], [0, 1]);

  useEffect(() => {
    const latest = thread.messages[thread.messages.length - 1];
    if (latest) {
      setExpandedIds((prev) => (prev[latest.id] ? prev : { ...prev, [latest.id]: true }));
    }
  }, [thread.messages.length, thread.id]);

  // Keyboard shortcuts inside Reading Room
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (isEditing) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        if (deepReading) {
          onExitDeepReading();
        } else {
          onBack();
        }
      } else if (e.key === 'ArrowLeft' && !deepReading) {
        e.preventDefault();
        onBack();
      } else if (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        onToggleDeepReading();
      } else if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey && !deepReading) {
        e.preventDefault();
        setReplyOpen(true);
      } else if (e.key.toLowerCase() === 'e' && !e.metaKey && !e.ctrlKey && !deepReading) {
        e.preventDefault();
        onArchive();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deepReading, onExitDeepReading, onToggleDeepReading, onBack, onArchive]);

  const toggleMessage = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const replyReady =
    stripHtmlToSnippet(replyHtml, 20).length > 0 || replyAttachments.length > 0;

  const handleSubmitReply = () => {
    if (!replyReady) return;
    onSendReply(replyHtml, replyAttachments);
    setReplyHtml('');
    setReplyAttachments([]);
    setReplyOpen(false);
  };

  const addReplyFiles = async (files: FileList | File[]) => {
    try {
      const next = await filesToAttachments(files);
      setReplyAttachments((prev) => [...prev, ...next]);
      setReplyError(null);
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'No se pudo adjuntar el archivo');
    }
  };

  const participantNames = Array.from(
    new Set(thread.messages.map((m) => m.sender.name))
  ).join(', ');

  const visibleMessages = deepReading
    ? thread.messages.filter((m, idx) => idx === lastIndex || Boolean(expandedIds[m.id]))
    : thread.messages;

  return (
    <motion.article
      key={`reader-${thread.id}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      aria-label={`Hilo: ${thread.subject}`}
      data-deep-reading={deepReading ? 'true' : 'false'}
      className="relative flex flex-col h-full w-full overflow-hidden"
    >
      {/* Delicate reading progress hairline in Deep Reading Mode */}
      {deepReading && (
        <motion.div
          aria-hidden="true"
          style={{ scaleX: smoothProgress, opacity: progressVisibility }}
          className="fixed top-0 left-0 right-0 h-[1.5px] z-30 origin-left bg-[var(--accent)] pointer-events-none"
        />
      )}

      {/* Floating Action Bar — recedes into a whisper exit control during Deep Reading Mode */}
      <AnimatePresence mode="wait" initial={false}>
        {deepReading ? (
          <motion.div
            key="deep-reading-exit-bar"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="fixed top-5 right-6 z-30"
          >
            <motion.button
              type="button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              onClick={onExitDeepReading}
              aria-label="Salir de Modo Lectura Profunda"
              aria-pressed={true}
              title="Salir de Lectura Profunda (F o Esc)"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full floating-monolith text-[12.5px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] opacity-70 hover:opacity-100 transition-all sacred-focus cursor-pointer"
            >
              <Minimize2 className="w-3.5 h-3.5 text-[var(--accent)]" strokeWidth={1.8} />
              <span>Salir</span>
            </motion.button>
          </motion.div>
        ) : (
          <motion.div
            key="floating-action-dock"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="shrink-0 px-6 md:px-10 pt-5 pb-2 z-20"
          >
            <div className="relative overflow-hidden max-w-[740px] mx-auto flex items-center justify-between px-2 py-1.5 rounded-full floating-monolith">
              <motion.span
                aria-hidden="true"
                style={{ scaleX: smoothProgress, opacity: progressVisibility }}
                className="pointer-events-none absolute bottom-0 left-5 right-5 h-[1.5px] origin-left bg-[var(--accent)]"
              />
              <motion.button
                type="button"
                whileHover={{ x: -1.5 }}
                whileTap={{ scale: 0.96 }}
                onClick={onBack}
                aria-label="Volver a la lista"
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] transition-colors sacred-focus cursor-pointer whitespace-nowrap"
              >
                <ArrowLeft className="w-4 h-4" strokeWidth={1.65} />
                <span>Volver</span>
              </motion.button>

              <div className="flex items-center gap-0.5">
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setReplyOpen(true)}
                  aria-label="Responder hilo"
                  title="Responder (R)"
                  className="p-2 rounded-full text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] transition-colors sacred-focus cursor-pointer"
                >
                  <Reply className="w-4 h-4" strokeWidth={1.65} />
                </motion.button>

                <motion.button
                  type="button"
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={onForward}
                  aria-label="Reenviar hilo"
                  title="Reenviar"
                  className="p-2 rounded-full text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] transition-colors sacred-focus cursor-pointer"
                >
                  <Forward className="w-4 h-4" strokeWidth={1.65} />
                </motion.button>

                {thread.folder !== 'archive' && thread.folder !== 'trash' && (
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={onArchive}
                    aria-label="Archivar hilo"
                    title="Archivar (E)"
                    className="p-2 rounded-full text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] transition-colors sacred-focus cursor-pointer"
                  >
                    <Archive className="w-4 h-4" strokeWidth={1.65} />
                  </motion.button>
                )}

                {thread.folder === 'trash' && (
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={onRestore}
                    aria-label="Restaurar hilo a Recibidos"
                    title="Restaurar"
                    className="p-2 rounded-full text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] transition-colors sacred-focus cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" strokeWidth={1.65} />
                  </motion.button>
                )}

                {thread.folder === 'archive' && (
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={onMoveToInbox}
                    aria-label="Mover a Recibidos"
                    title="Mover a Recibidos"
                    className="p-2 rounded-full text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] transition-colors sacred-focus cursor-pointer"
                  >
                    <Inbox className="w-4 h-4" strokeWidth={1.65} />
                  </motion.button>
                )}

                {thread.folder !== 'trash' && (
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={onMarkUnread}
                    aria-label="Marcar como no leído"
                    title="Marcar como no leído"
                    className="p-2 rounded-full text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] transition-colors sacred-focus cursor-pointer"
                  >
                    <Mail className="w-4 h-4" strokeWidth={1.65} />
                  </motion.button>
                )}

                {thread.folder === 'trash' ? (
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={onDeletePermanently}
                    aria-label="Borrar definitivamente"
                    title="Borrar definitivamente"
                    className="p-2 rounded-full text-[var(--destructive)] hover:text-[var(--destructive-ink)] hover:bg-[var(--destructive-bg)] transition-colors sacred-focus cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={1.65} />
                  </motion.button>
                ) : (
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={onTrash}
                    aria-label="Mover hilo a papelera"
                    title="Eliminar"
                    className="p-2 rounded-full text-[var(--ink-secondary)] hover:text-[var(--destructive)] hover:bg-[var(--surface-hover)] transition-colors sacred-focus cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={1.65} />
                  </motion.button>
                )}

                <span
                  aria-hidden="true"
                  className="mx-1 h-4 w-[1px] bg-[var(--hairline-strong)]"
                />

                {/* Modo Lectura Profunda Toggle */}
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={onToggleDeepReading}
                  aria-label="Modo Lectura Profunda"
                  aria-pressed={deepReading}
                  title="Modo Lectura Profunda (F)"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-medium text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] transition-colors sacred-focus cursor-pointer whitespace-nowrap"
                >
                  <BookOpen className="w-3.5 h-3.5 text-[var(--accent)]" strokeWidth={1.75} />
                  <span className="hidden sm:inline">Lectura profunda</span>
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Editorial Reading Stage */}
      <div
        ref={readerScrollRef}
        className={`flex-1 overflow-y-auto editorial-scroll-mask transition-all duration-300 ${
          deepReading
            ? 'px-8 sm:px-16 md:px-24 py-16 md:py-24'
            : 'px-6 md:px-12 py-8'
        }`}
      >
        <div
          className={`mx-auto transition-[max-width] duration-300 ${
            deepReading ? 'max-w-[640px]' : 'max-w-[740px]'
          }`}
        >
          {/* Literary Subject Masthead in Instrument Serif */}
          <div className={`${deepReading ? 'mb-14 text-center' : 'mb-10'}`}>
            <h1
              className={`font-normal tracking-[-0.015em] leading-[1.1] text-[var(--ink-primary)] text-balance transition-[font-size] duration-300 ${
                deepReading
                  ? 'text-[38px] md:text-[48px]'
                  : 'text-[32px] md:text-[38px]'
              }`}
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              {thread.subject}
            </h1>

            {!deepReading ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-[var(--ink-muted)]">
                <span>{participantNames}</span>
                {thread.messages.length > 1 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums text-[12px] text-[var(--accent)]">
                      {thread.messages.length}
                    </span>
                  </>
                )}
              </div>
            ) : (
              <p className="mt-4 text-[13px] text-[var(--ink-muted)]">
                <span className="text-[var(--accent)] font-medium">
                  {thread.messages[lastIndex]?.sender.name}
                </span>
                <span className="mx-2" aria-hidden="true">
                  ·
                </span>
                <time
                  dateTime={thread.messages[lastIndex]?.timestamp}
                  className="font-mono text-[12px] tabular-nums"
                >
                  {formatFullTimestamp(thread.messages[lastIndex]?.timestamp ?? thread.updatedAt)}
                </time>
              </p>
            )}
          </div>

          {/* Conversational Stack */}
          <div className="space-y-3" data-testid="reading-messages">
            {visibleMessages.map((msg: MailMessage) => {
              const isExpanded = deepReading || Boolean(expandedIds[msg.id]);
              const isLatest = msg.id === thread.messages[lastIndex]?.id;

              return (
                <section
                  key={msg.id}
                  className={`transition-colors duration-200 ${
                    deepReading
                      ? 'py-2'
                      : isExpanded
                      ? 'py-6 border-t border-[var(--hairline)] first:border-t-0 first:pt-2'
                      : 'rounded-xl hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  {!isExpanded ? (
                    <button
                      type="button"
                      aria-expanded={false}
                      aria-label={`Desplegar mensaje anterior de ${msg.sender.name}`}
                      onClick={() => toggleMessage(msg.id)}
                      className="w-full flex items-center gap-3.5 px-3 py-3 text-left rounded-xl sacred-focus cursor-pointer group"
                    >
                      <SenderAvatar
                        name={msg.sender.name}
                        avatar={msg.sender.avatar}
                        size="sm"
                      />
                      <span className="text-[13.5px] font-medium text-[var(--ink-primary)] whitespace-nowrap shrink-0">
                        {msg.sender.name}
                      </span>
                      <span className="flex-1 min-w-0 truncate text-[13.5px] text-[var(--ink-muted)]">
                        {msg.plainSnippet}
                      </span>
                      <span className="font-mono text-[11.5px] tabular-nums text-[var(--ink-muted)] shrink-0 whitespace-nowrap">
                        {formatFullTimestamp(msg.timestamp)}
                      </span>
                      <ChevronDown
                        className="w-3.5 h-3.5 text-[var(--ink-muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        strokeWidth={1.6}
                      />
                    </button>
                  ) : (
                    <div>
                      {!deepReading && (
                        <div className="flex items-start justify-between gap-4 mb-6">
                          <div className="flex items-center gap-3.5 min-w-0">
                            <SenderAvatar
                              name={msg.sender.name}
                              avatar={msg.sender.avatar}
                              size="md"
                            />
                            <div className="min-w-0">
                              <span className="block text-[14.5px] font-semibold text-[var(--ink-primary)] truncate">
                                {msg.sender.name}
                              </span>
                              <span className="block text-[12px] text-[var(--ink-muted)] truncate">
                                {msg.sender.email}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <time
                              dateTime={msg.timestamp}
                              className="font-mono text-[12px] tabular-nums text-[var(--ink-muted)] whitespace-nowrap"
                            >
                              {formatFullTimestamp(msg.timestamp)}
                            </time>
                            {!isLatest && (
                              <button
                                type="button"
                                aria-expanded={true}
                                aria-label={`Contraer mensaje de ${msg.sender.name}`}
                                onClick={() => toggleMessage(msg.id)}
                                className="text-[12px] text-[var(--ink-muted)] hover:text-[var(--ink-primary)] transition-colors sacred-focus cursor-pointer"
                              >
                                Contraer
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      <div>
                        {msg.isHtmlRich ? (
                          <InvisibleIframe
                            html={msg.bodyHtml}
                            theme={theme}
                            title={`Contenido HTML de ${msg.sender.name}`}
                          />
                        ) : (
                          <div
                            className={`text-[var(--ink-primary)]/92 space-y-4 [&_p]:mb-4 [&_p:last-child]:mb-0 [&_blockquote]:pl-4 [&_blockquote]:border-l-[1.5px] [&_blockquote]:border-[var(--accent)] [&_blockquote]:italic [&_blockquote]:text-[var(--ink-secondary)] [&_code]:font-mono [&_code]:text-[0.84em] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-[var(--surface-hover)] [&_a]:text-[var(--accent)] [&_a]:underline [&_a]:underline-offset-4 ${
                              deepReading
                                ? 'text-[17px] leading-[1.92]'
                                : 'text-[15.5px] leading-[1.8]'
                            }`}
                            dangerouslySetInnerHTML={{
                              __html: sanitizeEmailHtml(msg.bodyHtml),
                            }}
                          />
                        )}

                        {msg.remoteImagesBlocked && (
                          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-[var(--ink-muted)]">
                            <span>Imágenes remotas bloqueadas</span>
                            <button
                              type="button"
                              onClick={() => onShowRemoteImages(msg.id)}
                              className="text-[var(--accent)] hover:underline underline-offset-4 cursor-pointer"
                            >
                              Mostrar imágenes
                            </button>
                            <button
                              type="button"
                              onClick={() => onTrustSender(msg.sender.email)}
                              className="text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] cursor-pointer"
                            >
                              Siempre de este remitente
                            </button>
                          </div>
                        )}

                        {!deepReading && msg.attachments && msg.attachments.length > 0 && (
                          <div className="mt-7 pt-5 border-t border-[var(--hairline)] flex flex-wrap gap-4">
                            {msg.attachments.map((att) => {
                              const className =
                                'inline-flex items-center gap-2.5 text-[13px] text-[var(--ink-secondary)]';
                              const chip = (
                                <>
                                  <Paperclip
                                    className="w-3.5 h-3.5 text-[var(--accent)]"
                                    strokeWidth={1.65}
                                  />
                                  <span className="text-[var(--ink-primary)]">{att.name}</span>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono text-[11.5px] tabular-nums text-[var(--ink-muted)]">
                                    {att.size}
                                  </span>
                                </>
                              );
                              if (att.blobId) {
                                return (
                                  <a
                                    key={att.blobId}
                                    href={`/api/blobs/${encodeURIComponent(att.blobId)}?name=${encodeURIComponent(att.name)}`}
                                    className={className}
                                  >
                                    {chip}
                                  </a>
                                );
                              }
                              return (
                                <div key={att.name} className={className}>
                                  {chip}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          {/* Minimal Inline Reply — hidden during Deep Reading Mode */}
          {!deepReading && (
            <div className="mt-10 pt-8 border-t border-[var(--hairline)]">
              <AnimatePresence mode="wait">
                {!replyOpen ? (
                  <motion.div
                    key="reply-trigger"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-4"
                  >
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setReplyOpen(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--cta-bg)] text-[var(--cta-ink)] text-[13px] font-medium hover:opacity-90 transition-opacity sacred-focus cursor-pointer"
                    >
                      <Reply className="w-3.5 h-3.5" strokeWidth={1.75} />
                      <span>Responder</span>
                    </motion.button>

                    <button
                      type="button"
                      onClick={onForward}
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full border border-[var(--hairline-strong)] text-[13px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors sacred-focus cursor-pointer"
                    >
                      <Forward className="w-3.5 h-3.5" strokeWidth={1.6} />
                      <span>Reenviar</span>
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="reply-composer"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    className="precision-input rounded-2xl p-4 space-y-3"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (event.dataTransfer.files.length > 0) void addReplyFiles(event.dataTransfer.files);
                    }}
                    onPasteCapture={(event) => {
                      if (event.clipboardData.files.length > 0) {
                        event.preventDefault();
                        void addReplyFiles(event.clipboardData.files);
                      }
                    }}
                  >
                    <TipTapFolio
                      compact
                      autoFocus
                      placeholder="Responder…"
                      ariaLabel="Responder al hilo"
                      onChange={setReplyHtml}
                      onSubmitShortcut={handleSubmitReply}
                    />
                    {replyError && (
                      <p className="text-[12.5px] text-[var(--accent)]">{replyError}</p>
                    )}
                    <AttachmentChips
                      items={replyAttachments}
                      onRemove={(id) =>
                        setReplyAttachments((prev) => prev.filter((item) => item.id !== id))
                      }
                    />
                    <div className="flex items-center justify-between pt-2 border-t border-[var(--hairline)]">
                      <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => replyFileRef.current?.click()}
                        aria-label="Adjuntar archivo"
                        title="Adjuntar"
                        className="p-2 -ml-1 rounded-full text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] transition-colors sacred-focus cursor-pointer"
                      >
                        <Paperclip className="w-4 h-4" strokeWidth={1.65} />
                      </button>
                      <input
                        ref={replyFileRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                          if (event.target.files?.length) void addReplyFiles(event.target.files);
                          event.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setReplyOpen(false);
                          setReplyHtml('');
                          setReplyAttachments([]);
                        }}
                        aria-label="Cerrar respuesta"
                        title="Descartar"
                        className="p-2 -ml-1 rounded-full text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] transition-colors sacred-focus cursor-pointer"
                      >
                        <X className="w-4 h-4" strokeWidth={1.65} />
                      </button>
                      </div>

                      <motion.button
                        type="button"
                        whileTap={replyReady ? { scale: 0.95 } : undefined}
                        disabled={!replyReady}
                        onClick={handleSubmitReply}
                        aria-label="Enviar"
                        title="Enviar (⌘↵)"
                        className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[13px] font-medium transition-all duration-200 sacred-focus ${
                          replyReady
                            ? 'bg-[var(--accent)] text-[#fbf8f2] shadow-sm cursor-pointer hover:brightness-110'
                            : 'bg-[var(--surface-hover)] text-[var(--ink-muted)] cursor-not-allowed'
                        }`}
                      >
                        <span>Enviar</span>
                        <ArrowUp className="w-3.5 h-3.5" strokeWidth={2} />
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </motion.article>
  );
}
