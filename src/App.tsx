import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CURRENT_USER, SEED_THREADS } from './data/seedThreads';
import type {
  CommandItem,
  ComposePayload,
  FolderId,
  MailThread,
  ThemeMode,
} from './types/mail';
import {
  appendReplyToThread,
  emptyTrashThreads,
  filterThreadsForFolder,
  FOLDER_META,
  getFolderCounts,
  moveThreadToFolder,
  saveDraftThread,
  sendEmailThread,
  setThreadUnread,
} from './utils/mailStore';
import { LiquidSidebar } from './components/LiquidSidebar';
import { ThreadFeed } from './components/ThreadFeed';
import { ReadingRoom } from './components/ReadingRoom';
import { ComposeModal, type ComposeInitialState } from './components/ComposeModal';
import { CommandPalette } from './components/CommandPalette';

const STORAGE_KEY = 'dariomail-threads-v1';
const THEME_KEY = 'dariomail-theme-v3';
const REFERENCE_NOW_ISO = '2026-11-20T16:24:00Z';

function loadInitialThreads(): MailThread[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return SEED_THREADS;
    const parsed = JSON.parse(raw) as MailThread[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // Fallback to seed data
  }
  return SEED_THREADS;
}

function loadInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Default to warm espresso dark mode
  }
  return 'dark';
}

interface WhisperNotice {
  id: number;
  text: string;
  undo?: () => void;
}

export default function App() {
  const [threads, setThreads] = useState<MailThread[]>(loadInitialThreads);
  const [theme, setTheme] = useState<ThemeMode>(loadInitialTheme);
  const [activeFolder, setActiveFolder] = useState<FolderId>('inbox');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [deepReading, setDeepReading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeInitial, setComposeInitial] = useState<ComposeInitialState>({
    to: '',
    subject: '',
    bodyHtml: '',
  });

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notice, setNotice] = useState<WhisperNotice | null>(null);

  const feedScrollRef = useRef<number>(0);
  const noticeTimerRef = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Persist threads
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
    } catch {
      // Ignore storage quota errors
    }
  }, [threads]);

  // Sync theme to <html> class & storage
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Ignore
    }
  }, [theme]);

  // Exit deep reading automatically if no thread is open
  useEffect(() => {
    if (!selectedThreadId && deepReading) {
      setDeepReading(false);
    }
  }, [selectedThreadId, deepReading]);

  const showNotice = useCallback((text: string, undo?: () => void) => {
    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current);
    }
    setNotice({ id: Date.now(), text, undo });
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice(null);
    }, 3400);
  }, []);

  const folderCounts = useMemo(() => getFolderCounts(threads), [threads]);

  const visibleThreads = useMemo(
    () => filterThreadsForFolder(threads, activeFolder, searchQuery),
    [threads, activeFolder, searchQuery]
  );

  const selectedThread = useMemo(
    () => threads.find((t) => t.id === selectedThreadId) ?? null,
    [threads, selectedThreadId]
  );

  useEffect(() => {
    if (focusedIndex >= visibleThreads.length) {
      setFocusedIndex(Math.max(0, visibleThreads.length - 1));
    }
  }, [visibleThreads.length, focusedIndex]);

  const openCompose = useCallback((preset?: Partial<ComposeInitialState>) => {
    setComposeInitial({
      draftThreadId: preset?.draftThreadId,
      to: preset?.to ?? '',
      subject: preset?.subject ?? '',
      bodyHtml: preset?.bodyHtml ?? '',
    });
    setComposeOpen(true);
  }, []);

  const handleSelectFolder = useCallback((folder: FolderId) => {
    setActiveFolder(folder);
    setSelectedThreadId(null);
    setDeepReading(false);
    setSearchQuery('');
    setFocusedIndex(0);
    feedScrollRef.current = 0;
  }, []);

  const handleOpenThread = useCallback(
    (thread: MailThread) => {
      if (thread.folder === 'drafts') {
        openCompose({
          draftThreadId: thread.id,
          to: thread.draftTo ?? thread.messages[0]?.recipients[0] ?? '',
          subject: thread.subject === '(Sin asunto)' ? '' : thread.subject,
          bodyHtml: thread.draftBodyHtml ?? thread.messages[0]?.bodyHtml ?? '',
        });
        return;
      }

      if (thread.unread) {
        setThreads((prev) => setThreadUnread(prev, thread.id, false));
      }
      setSelectedThreadId(thread.id);
    },
    [openCompose]
  );

  const handleArchiveThread = useCallback(
    (threadId: string) => {
      const target = threads.find((t) => t.id === threadId);
      if (!target) return;
      const previousFolder = target.folder;
      const previousUnread = target.unread;

      setThreads((prev) => moveThreadToFolder(prev, threadId, 'archive'));
      if (selectedThreadId === threadId) {
        setSelectedThreadId(null);
        setDeepReading(false);
      }

      showNotice('Archivado', () => {
        setThreads((prev) =>
          setThreadUnread(
            moveThreadToFolder(prev, threadId, previousFolder),
            threadId,
            previousUnread
          )
        );
      });
    },
    [threads, selectedThreadId, showNotice]
  );

  const handleTrashThread = useCallback(
    (threadId: string) => {
      const target = threads.find((t) => t.id === threadId);
      if (!target) return;
      const previousFolder = target.folder;
      const previousUnread = target.unread;

      setThreads((prev) => moveThreadToFolder(prev, threadId, 'trash'));
      if (selectedThreadId === threadId) {
        setSelectedThreadId(null);
        setDeepReading(false);
      }

      showNotice('En papelera', () => {
        setThreads((prev) =>
          setThreadUnread(
            moveThreadToFolder(prev, threadId, previousFolder),
            threadId,
            previousUnread
          )
        );
      });
    },
    [threads, selectedThreadId, showNotice]
  );

  const handleRestoreThread = useCallback(
    (threadId: string) => {
      setThreads((prev) => moveThreadToFolder(prev, threadId, 'inbox'));
      if (selectedThreadId === threadId) {
        setSelectedThreadId(null);
        setDeepReading(false);
      }
      showNotice('Restaurado');
    },
    [selectedThreadId, showNotice]
  );

  const handleToggleUnread = useCallback((threadId: string, nextUnread: boolean) => {
    setThreads((prev) => setThreadUnread(prev, threadId, nextUnread));
  }, []);

  const handleEmptyTrash = useCallback(() => {
    const trashCount = threads.filter((t) => t.folder === 'trash').length;
    if (trashCount === 0) {
      showNotice('Papelera vacía');
      return;
    }
    setThreads((prev) => emptyTrashThreads(prev));
    if (selectedThread?.folder === 'trash') {
      setSelectedThreadId(null);
      setDeepReading(false);
    }
    showNotice('Papelera vaciada');
  }, [threads, selectedThread, showNotice]);

  const handleSendEmail = useCallback(
    (payload: ComposePayload) => {
      const nowIso = new Date().toISOString();
      setThreads((prev) => sendEmailThread(prev, payload, CURRENT_USER, nowIso).threads);
      setComposeOpen(false);
      showNotice(`Enviado a ${payload.to}`);
    },
    [showNotice]
  );

  const handleSaveDraft = useCallback(
    (payload: ComposePayload) => {
      const nowIso = new Date().toISOString();
      setThreads((prev) => saveDraftThread(prev, payload, CURRENT_USER, nowIso));
      showNotice('Borrador guardado');
    },
    [showNotice]
  );

  const handleDiscardDraft = useCallback((draftThreadId?: string) => {
    if (!draftThreadId) return;
    setThreads((prev) => prev.filter((t) => t.id !== draftThreadId));
  }, []);

  const handleSendReply = useCallback(
    (bodyHtml: string) => {
      if (!selectedThreadId) return;
      const nowIso = new Date().toISOString();
      setThreads((prev) =>
        appendReplyToThread(prev, selectedThreadId, bodyHtml, CURRENT_USER, nowIso)
      );
      showNotice('Enviado');
    },
    [selectedThreadId, showNotice]
  );

  const handleForwardSelected = useCallback(() => {
    if (!selectedThread) return;
    const latest = selectedThread.messages[selectedThread.messages.length - 1];
    const forwardedBody = `<p></p><blockquote><p><strong>Reenviado de ${latest.sender.name} (${latest.sender.email}):</strong></p>${latest.bodyHtml}</blockquote>`;
    openCompose({
      to: '',
      subject: selectedThread.subject.startsWith('Fwd:')
        ? selectedThread.subject
        : `Fwd: ${selectedThread.subject}`,
      bodyHtml: forwardedBody,
    });
  }, [selectedThread, openCompose]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // Global keyboard shortcuts (Cmd+K, C, /, J/K list nav, Enter, E archive)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
        return;
      }

      if (composeOpen || paletteOpen) return;

      const target = e.target as HTMLElement | null;
      const isEditing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (isEditing) return;

      if (e.key === '/' && !selectedThreadId) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (e.key.toLowerCase() === 'c' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        openCompose();
        return;
      }

      if (!selectedThreadId && visibleThreads.length > 0) {
        if (e.key === 'j' || e.key === 'ArrowDown') {
          e.preventDefault();
          setFocusedIndex((prev) => Math.min(visibleThreads.length - 1, prev + 1));
        } else if (e.key === 'k' || e.key === 'ArrowUp') {
          e.preventDefault();
          setFocusedIndex((prev) => Math.max(0, prev - 1));
        } else if (e.key === 'Enter') {
          const targetThread = visibleThreads[focusedIndex];
          if (targetThread) {
            e.preventDefault();
            handleOpenThread(targetThread);
          }
        } else if (
          e.key.toLowerCase() === 'e' &&
          activeFolder !== 'archive' &&
          activeFolder !== 'trash'
        ) {
          const targetThread = visibleThreads[focusedIndex];
          if (targetThread) {
            e.preventDefault();
            handleArchiveThread(targetThread.id);
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    composeOpen,
    paletteOpen,
    selectedThreadId,
    visibleThreads,
    focusedIndex,
    activeFolder,
    openCompose,
    handleOpenThread,
    handleArchiveThread,
  ]);

  // Build Command Palette actions dynamically
  const commandItems = useMemo<CommandItem[]>(() => {
    const navItems: CommandItem[] = (
      ['inbox', 'sent', 'drafts', 'archive', 'trash'] as FolderId[]
    ).map((folderId) => ({
      id: `nav-${folderId}`,
      label: `Ir a ${FOLDER_META[folderId].label}`,
      group: 'Navegación',
      keywords: [
        FOLDER_META[folderId].label.toLowerCase(),
        FOLDER_META[folderId].englishAlias.toLowerCase(),
        'ir',
        'carpeta',
      ],
      run: () => handleSelectFolder(folderId),
    }));

    const actionItems: CommandItem[] = [
      ...(selectedThread
        ? [
            {
              id: 'act-deep-reading',
              label: deepReading
                ? 'Salir de Modo Lectura Profunda'
                : 'Activar Modo Lectura Profunda',
              group: 'Acciones' as const,
              shortcut: 'F',
              keywords: ['lectura', 'profunda', 'focus', 'enfoque', 'zen'],
              run: () => setDeepReading((prev) => !prev),
            },
          ]
        : []),
      {
        id: 'act-compose',
        label: 'Redactar nuevo correo',
        group: 'Acciones',
        shortcut: 'C',
        keywords: ['redactar', 'compose', 'nuevo', 'escribir'],
        run: () => openCompose(),
      },
      {
        id: 'act-compose-elena',
        label: 'Redactar a Elena Vance',
        hint: 'elena@ateliervance.es',
        group: 'Acciones',
        keywords: ['redactar a', 'elena', 'ateliervance', 'compose'],
        run: () => openCompose({ to: 'elena@ateliervance.es' }),
      },
      {
        id: 'act-compose-marcus',
        label: 'Redactar a Marcus Lindqvist',
        hint: 'marcus@lindqvist-studio.ch',
        group: 'Acciones',
        keywords: ['redactar a', 'marcus', 'lindqvist', 'compose'],
        run: () => openCompose({ to: 'marcus@lindqvist-studio.ch' }),
      },
      {
        id: 'act-theme',
        label: theme === 'dark' ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro',
        group: 'Acciones',
        keywords: ['tema', 'modo claro', 'modo oscuro', 'light', 'dark', 'lino', 'carbon'],
        run: toggleTheme,
      },
      {
        id: 'act-empty-trash',
        label: 'Vaciar papelera',
        hint: `${folderCounts.trash} en papelera`,
        group: 'Acciones',
        keywords: ['vaciar', 'papelera', 'trash', 'limpiar', 'eliminar'],
        run: handleEmptyTrash,
      },
    ];

    const searchItems: CommandItem[] = [
      {
        id: 'search-facturas',
        label: 'Buscar facturas',
        group: 'Búsqueda',
        keywords: ['buscar', 'facturas', 'factura', 'billing', 'invoices'],
        run: () => {
          setSelectedThreadId(null);
          setDeepReading(false);
          setActiveFolder('inbox');
          setSearchQuery('facturas');
        },
      },
      {
        id: 'search-unread',
        label: 'Buscar no leídos',
        group: 'Búsqueda',
        keywords: ['buscar', 'no leidos', 'unread', 'pendientes'],
        run: () => {
          setSelectedThreadId(null);
          setDeepReading(false);
          setActiveFolder('inbox');
          setSearchQuery('no leidos');
        },
      },
      {
        id: 'search-newsletters',
        label: 'Buscar newsletters',
        group: 'Búsqueda',
        keywords: ['buscar', 'newsletters', 'ediciones', 'monolith', 'klangwerk'],
        run: () => {
          setSelectedThreadId(null);
          setDeepReading(false);
          setActiveFolder('inbox');
          setSearchQuery('newsletters');
        },
      },
    ];

    const recentThreads: CommandItem[] = threads
      .filter((t) => t.folder !== 'trash')
      .slice(0, 6)
      .map((thread) => ({
        id: `open-${thread.id}`,
        label: thread.subject,
        hint: thread.messages[thread.messages.length - 1]?.sender.name,
        group: 'Hilos',
        keywords: [
          thread.subject,
          ...thread.messages.map((m) => `${m.sender.name} ${m.sender.email}`),
        ],
        run: () => {
          setActiveFolder(thread.folder);
          handleOpenThread(thread);
        },
      }));

    return [...navItems, ...actionItems, ...searchItems, ...recentThreads];
  }, [
    selectedThread,
    deepReading,
    theme,
    folderCounts.trash,
    threads,
    handleSelectFolder,
    openCompose,
    toggleTheme,
    handleEmptyTrash,
    handleOpenThread,
  ]);

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-[var(--canvas-bg)] text-[var(--ink-primary)] transition-colors duration-300">
      {/* Compact Floating Vertical Dock */}
      <LiquidSidebar
        activeFolder={activeFolder}
        counts={folderCounts}
        theme={theme}
        mobileOpen={mobileMenuOpen}
        hiddenForDeepReading={deepReading}
        onSelectFolder={handleSelectFolder}
        onOpenCompose={() => openCompose()}
        onOpenCommandPalette={() => setPaletteOpen(true)}
        onToggleTheme={toggleTheme}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Seamless Edge-to-Edge Editorial Canvas */}
      <main
        className={`relative flex-1 min-w-0 h-full overflow-hidden bg-[var(--surface-bg)] transition-[padding] duration-300 ${
          deepReading ? 'pl-0' : 'md:pl-[76px]'
        }`}
      >
        <AnimatePresence mode="wait" initial={false}>
          {selectedThread ? (
            <ReadingRoom
              key={selectedThread.id}
              thread={selectedThread}
              theme={theme}
              deepReading={deepReading}
              onToggleDeepReading={() => setDeepReading((prev) => !prev)}
              onExitDeepReading={() => setDeepReading(false)}
              onBack={() => {
                setDeepReading(false);
                setSelectedThreadId(null);
              }}
              onArchive={() => handleArchiveThread(selectedThread.id)}
              onTrash={() => handleTrashThread(selectedThread.id)}
              onRestore={() => handleRestoreThread(selectedThread.id)}
              onMarkUnread={() => {
                handleToggleUnread(selectedThread.id, true);
                setDeepReading(false);
                setSelectedThreadId(null);
              }}
              onForward={handleForwardSelected}
              onSendReply={handleSendReply}
            />
          ) : (
            <ThreadFeed
              key={`feed-${activeFolder}`}
              folder={activeFolder}
              threads={visibleThreads}
              searchQuery={searchQuery}
              focusedIndex={focusedIndex}
              currentUserEmail={CURRENT_USER.email}
              referenceIso={REFERENCE_NOW_ISO}
              initialScrollTop={feedScrollRef.current}
              searchInputRef={searchInputRef}
              onScrollChange={(scrollTop) => {
                feedScrollRef.current = scrollTop;
              }}
              onSearchChange={setSearchQuery}
              onOpenThread={handleOpenThread}
              onArchiveThread={handleArchiveThread}
              onTrashThread={handleTrashThread}
              onRestoreThread={handleRestoreThread}
              onToggleUnread={handleToggleUnread}
              onEmptyTrash={handleEmptyTrash}
              onOpenMobileMenu={() => setMobileMenuOpen(true)}
              onOpenCompose={() => openCompose()}
              onFocusIndexChange={setFocusedIndex}
            />
          )}
        </AnimatePresence>

        {/* Quiet Editorial Whisper Notification */}
        <AnimatePresence>
          {notice && (
            <motion.div
              key={notice.id}
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              role="status"
              aria-live="polite"
              className="fixed bottom-6 right-6 z-40 flex items-center gap-4 px-4 py-2.5 rounded-full floating-monolith text-[13px] text-[var(--ink-primary)]"
            >
              <span>{notice.text}</span>
              {notice.undo && (
                <button
                  type="button"
                  onClick={() => {
                    notice.undo?.();
                    setNotice(null);
                  }}
                  className="text-[var(--accent)] font-medium hover:underline underline-offset-4 cursor-pointer"
                >
                  Deshacer
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* The Writing Sanctuary Modal (C) */}
      <ComposeModal
        open={composeOpen}
        initial={composeInitial}
        onClose={() => setComposeOpen(false)}
        onSend={handleSendEmail}
        onSaveDraft={handleSaveDraft}
        onDiscardDraft={handleDiscardDraft}
      />

      {/* El Cerebro Rápido: Command Palette (Cmd+K / Ctrl+K) */}
      <CommandPalette
        open={paletteOpen}
        commands={commandItems}
        onClose={() => setPaletteOpen(false)}
      />
    </div>
  );
}
