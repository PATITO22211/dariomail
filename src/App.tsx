import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type {
  CommandItem,
  ComposeAttachment,
  ComposePayload,
  FeedLoadState,
  FolderId,
  MailThread,
  ThemeMode,
} from './types/mail';
import {
  ApiError,
  createMailApi,
  detailToThread,
  emptyTrashThreads,
  filterThreadsForFolder,
  FOLDER_META,
  moveThreadToFolder,
  setThreadUnread,
  stripHtmlToSnippet,
  summaryToThread,
  toSendAttachments,
  type MailApi,
  type MailboxInfo,
  type ThreadSummary,
} from './utils/mailStore';
import { LiquidSidebar } from './components/LiquidSidebar';
import { ThreadFeed } from './components/ThreadFeed';
import { ReadingRoom } from './components/ReadingRoom';
import { ComposeModal, type ComposeInitialState } from './components/ComposeModal';
import { CommandPalette } from './components/CommandPalette';
import { LoginScreen } from './components/LoginScreen';
import { ConfirmDialog } from './components/ConfirmDialog';

const THEME_KEY = 'dariomail-theme-v3';

function loadInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Tema oscuro por defecto
  }
  return 'dark';
}

function messageOf(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'No se pudo completar la operación';
}

function countsFromMailboxes(list: MailboxInfo[]): Record<FolderId, number> {
  const counts: Record<FolderId, number> = {
    inbox: 0,
    sent: 0,
    drafts: 0,
    archive: 0,
    trash: 0,
  };
  for (const mailbox of list) {
    if (mailbox.folder === 'inbox') counts.inbox = mailbox.unreadEmails;
    if (mailbox.folder === 'drafts') counts.drafts = mailbox.totalEmails;
    if (mailbox.folder === 'trash') counts.trash = mailbox.totalEmails;
  }
  return counts;
}

function emailIdsOf(thread: MailThread): string[] {
  if (thread.messageIds?.length) return thread.messageIds;
  return thread.messages.map((message) => message.id).filter((id) => !id.endsWith('-preview'));
}

interface WhisperNotice {
  id: number;
  text: string;
  undo?: () => void;
}

type FolderFetch =
  | { kind: 'ok'; folder: FolderId; threads: MailThread[] }
  | { kind: 'skip'; folder: FolderId }
  | { kind: 'fail'; folder: FolderId; message: string };

const FOLDER_ORDER: FolderId[] = ['inbox', 'sent', 'drafts', 'archive', 'trash'];

async function fetchFolderThreads(
  api: MailApi,
  mailboxes: MailboxInfo[],
  isStale: () => boolean
): Promise<FolderFetch[]> {
  return Promise.all(
    FOLDER_ORDER.map(async (folder): Promise<FolderFetch> => {
      if (isStale()) return { kind: 'skip', folder };
      const mailboxId = mailboxes.find((mailbox) => mailbox.folder === folder)?.id;
      if (!mailboxId) return { kind: 'skip', folder };
      try {
        const page = await api.threads(mailboxId, 40);
        if (isStale()) return { kind: 'skip', folder };
        return {
          kind: 'ok',
          folder,
          threads: page.threads.map((thread) => summaryToThread(thread, folder)),
        };
      } catch (err) {
        return { kind: 'fail', folder, message: messageOf(err) };
      }
    })
  );
}

export default function App() {
  const apiRef = useRef<MailApi | null>(null);
  if (!apiRef.current) apiRef.current = createMailApi();
  const api = apiRef.current;

  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authPending, setAuthPending] = useState(false);
  const [user, setUser] = useState({ email: '', name: '' });
  const [mailboxes, setMailboxes] = useState<MailboxInfo[]>([]);
  const [threads, setThreads] = useState<MailThread[]>([]);
  const [feedLoad, setFeedLoad] = useState<{
    state: FeedLoadState;
    error: string | null;
    loadedOnce: boolean;
  }>({ state: 'idle', error: null, loadedOnce: false });
  const [searchLoadState, setSearchLoadState] = useState<FeedLoadState>('idle');
  const [searchLoadError, setSearchLoadError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<FolderId, number>>({
    inbox: 0,
    sent: 0,
    drafts: 0,
    archive: 0,
    trash: 0,
  });
  const [theme, setTheme] = useState<ThemeMode>(loadInitialTheme);
  const [activeFolder, setActiveFolder] = useState<FolderId>('inbox');
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [deepReading, setDeepReading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHits, setSearchHits] = useState<MailThread[]>([]);
  const [searchCursor, setSearchCursor] = useState<string | null>(null);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [paletteRemote, setPaletteRemote] = useState<CommandItem[]>([]);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [referenceNow] = useState(() => new Date().toISOString());

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
  const selectedRef = useRef<string | null>(null);
  const loadGen = useRef(0);

  useEffect(() => {
    selectedRef.current = selectedThreadId;
  }, [selectedThreadId]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Sin almacenamiento
    }
  }, [theme]);

  useEffect(() => {
    if (!selectedThreadId && deepReading) setDeepReading(false);
  }, [selectedThreadId, deepReading]);

  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  const showNotice = useCallback((text: string, undo?: () => void) => {
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    setNotice({ id: Date.now(), text, undo });
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 5000);
  }, []);

  const mergeIncomingThread = useCallback((prev: MailThread[], item: MailThread): MailThread => {
    const previous = prev.find((thread) => thread.id === item.id);
    const keepDetail =
      previous &&
      previous.id === selectedRef.current &&
      previous.messages.some((message) => message.bodyHtml && !message.id.endsWith('-preview'));
    if (keepDetail && previous) {
      return { ...previous, unread: item.unread, folder: item.folder, subject: item.subject };
    }
    return item;
  }, []);

  const applyFolderFetchResults = useCallback(
    (prev: MailThread[], results: FolderFetch[]): MailThread[] => {
      const next = new Map<string, MailThread>();
      for (const thread of prev) next.set(thread.id, thread);

      for (const result of results) {
        if (result.kind !== 'ok') continue;
        for (const [id, thread] of [...next.entries()]) {
          if (thread.folder === result.folder) next.delete(id);
        }
        for (const thread of result.threads) {
          next.set(thread.id, mergeIncomingThread(prev, thread));
        }
      }

      return [...next.values()].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    },
    [mergeIncomingThread]
  );

  const reload = useCallback(
    async (opts?: { silent?: boolean }) => {
      const gen = ++loadGen.current;
      const isStale = () => gen !== loadGen.current;

      setFeedLoad((prev) => ({
        loadedOnce: prev.loadedOnce,
        error: opts?.silent ? prev.error : null,
        state: prev.loadedOnce && opts?.silent ? prev.state : 'loading',
      }));

      try {
        let nextMailboxes = await api.mailboxes();
        if (isStale()) return;

        setMailboxes(nextMailboxes);
        setCounts(countsFromMailboxes(nextMailboxes));

        let results = await fetchFolderThreads(api, nextMailboxes, isStale);
        if (isStale()) return;

        const skippedWithMailboxes =
          results.some((result) => result.kind === 'skip') && nextMailboxes.length > 0;
        if (skippedWithMailboxes) {
          await new Promise((resolve) => window.setTimeout(resolve, 420));
          if (!isStale()) {
            nextMailboxes = await api.mailboxes();
            if (!isStale()) {
              setMailboxes(nextMailboxes);
              setCounts(countsFromMailboxes(nextMailboxes));
              results = await fetchFolderThreads(api, nextMailboxes, isStale);
            }
          }
        }
        if (isStale()) return;

        const okResults = results.filter((result) => result.kind === 'ok');
        const failResults = results.filter((result) => result.kind === 'fail');
        const inboxMailbox = nextMailboxes.find((mailbox) => mailbox.folder === 'inbox');
        const inboxResult = results.find((result) => result.folder === 'inbox');

        setThreads((prev) => {
          const merged = applyFolderFetchResults(prev, results);
          if (merged.length === 0 && prev.length > 0 && okResults.length === 0) {
            return prev;
          }
          return merged;
        });

        const inboxThreadsMissing =
          inboxMailbox &&
          inboxMailbox.totalEmails > 0 &&
          inboxResult?.kind !== 'ok' &&
          okResults.every((result) => result.folder !== 'inbox');

        if (failResults.length > 0 && okResults.length === 0) {
          setFeedLoad({
            state: 'error',
            error: failResults[0]?.message ?? 'No se pudieron cargar los mensajes',
            loadedOnce: false,
          });
          return;
        }

        if (inboxThreadsMissing && okResults.length === 0) {
          setFeedLoad({
            state: 'error',
            error: 'La bandeja no respondió a tiempo. Reintenta en un momento.',
            loadedOnce: false,
          });
          return;
        }

        setFeedLoad({
          state: 'ready',
          error: null,
          loadedOnce: true,
        });
      } catch (err) {
        if (isStale()) return;
        setFeedLoad((prev) => ({
          state: prev.loadedOnce ? 'ready' : 'error',
          error: messageOf(err),
          loadedOnce: prev.loadedOnce,
        }));
        if (opts?.silent) {
          showNotice(messageOf(err));
        }
      }
    },
    [api, applyFolderFetchResults, showNotice]
  );

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const me = await api.me();
        if (cancel) return;
        setUser(me);
        setAuthed(true);
      } catch (err) {
        if (cancel) return;
        setAuthed(false);
        if (err instanceof ApiError && err.status !== 401) setAuthError(err.message);
      } finally {
        if (!cancel) setReady(true);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [api]);

  useEffect(() => {
    if (!authed) return;
    void reload();
  }, [authed, reload]);

  useEffect(() => {
    if (!authed) return;
    if (import.meta.env.VITE_DARIOMAIL_MOCK === '1' || import.meta.env.VITE_DARIOMAIL_MOCK === 'true') {
      return;
    }
    const source = new EventSource('/api/events', { withCredentials: true });
    let timer = 0;
    const kick = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void reload({ silent: true });
      }, 500);
    };
    source.addEventListener('state', kick);
    source.onmessage = kick;
    return () => {
      window.clearTimeout(timer);
      source.close();
    };
  }, [authed, reload]);

  useEffect(() => {
    if (!authed) return;
    let resumeTimer = 0;
    const resume = () => {
      window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(() => {
        void reload({ silent: true });
      }, 200);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') resume();
    };
    const onPageShow = () => resume();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.clearTimeout(resumeTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [authed, reload]);

  const visibleThreads = useMemo(() => {
    if (searchQuery.trim()) return searchHits;
    return filterThreadsForFolder(threads, activeFolder, '');
  }, [searchHits, searchQuery, threads, activeFolder]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!authed || !query) {
      setSearchHits([]);
      setSearchCursor(null);
      setSearchLoadState('idle');
      setSearchLoadError(null);
      return;
    }
    let cancel = false;
    const timer = window.setTimeout(() => {
      setSearchLoadState('loading');
      setSearchLoadError(null);
      void (async () => {
        try {
          const mailboxId = mailboxes.find((mailbox) => mailbox.folder === activeFolder)?.id;
          const page = await api.search(query, mailboxId);
          if (cancel) return;
          setSearchHits(page.threads.map((item) => summaryToThread(item, item.folder || activeFolder)));
          setSearchCursor(page.cursor);
          setSearchLoadState('ready');
        } catch (err) {
          if (!cancel) {
            setSearchLoadState('error');
            setSearchLoadError(messageOf(err));
          }
        }
      })();
    }, 280);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery, activeFolder, authed, api, mailboxes]);

  useEffect(() => {
    const query = paletteQuery.trim();
    if (!paletteOpen || query.length < 2) {
      setPaletteRemote([]);
      return;
    }
    let cancel = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const page = await api.search(query);
          if (cancel) return;
          setPaletteRemote(
            page.threads.map((item) => ({
              id: `find-${item.id}`,
              label: item.subject,
              hint: item.sender.name,
              group: 'Hilos' as const,
              keywords: [query],
              run: () => openFoundThread(item),
            }))
          );
        } catch {
          if (!cancel) setPaletteRemote([]);
        }
      })();
    }, 280);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [paletteQuery, paletteOpen, api]);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [threads, selectedThreadId]
  );

  useEffect(() => {
    if (focusedIndex >= visibleThreads.length) {
      setFocusedIndex(Math.max(0, visibleThreads.length - 1));
    }
  }, [visibleThreads.length, focusedIndex]);

  const openFoundThread = useCallback(
    (item: ThreadSummary) => {
      const folder = item.folder || 'inbox';
      setActiveFolder(folder);
      setSearchQuery('');
      handleOpenRef.current(summaryToThread(item, folder));
    },
    []
  );

  const handleOpenRef = useRef<(thread: MailThread) => void>(() => undefined);

  const openCompose = useCallback((preset?: Partial<ComposeInitialState>) => {
    setComposeInitial({
      draftThreadId: preset?.draftThreadId,
      to: preset?.to ?? '',
      subject: preset?.subject ?? '',
      bodyHtml: preset?.bodyHtml ?? '',
      attachments: preset?.attachments,
    });
    setComposeOpen(true);
  }, []);

  const handleLogin = useCallback(
    (password: string) => {
      setAuthPending(true);
      setAuthError(null);
      void (async () => {
        try {
          const me = await api.login(password);
          setUser(me);
          setAuthed(true);
        } catch (err) {
          setAuthError(messageOf(err));
        } finally {
          setAuthPending(false);
        }
      })();
    },
    [api]
  );

  const handleSelectFolder = useCallback((folder: FolderId) => {
    setActiveFolder(folder);
    setSelectedThreadId(null);
    setDeepReading(false);
    setSearchQuery('');
    setFocusedIndex(0);
    feedScrollRef.current = 0;
  }, []);

  const resolveIds = useCallback(
    async (thread: MailThread) => {
      const ids = emailIdsOf(thread);
      if (ids.length) return ids;
      const full = detailToThread(await api.thread(thread.id), thread.folder);
      return emailIdsOf(full);
    },
    [api]
  );

  const handleOpenThread = useCallback(
    (thread: MailThread) => {
      selectedRef.current = thread.folder === 'drafts' ? selectedRef.current : thread.id;
      void (async () => {
        try {
          const full = detailToThread(await api.thread(thread.id), thread.folder);
          if (thread.folder === 'drafts') {
            const message = full.messages[full.messages.length - 1];
            const raw = full.rawSubject && full.rawSubject !== '(Sin asunto)' ? full.rawSubject : '';
            openCompose({
              draftThreadId: message?.id,
              to: full.draftTo ?? message?.recipients[0] ?? '',
              subject: raw,
              bodyHtml: message?.bodyHtml ?? '',
            });
            return;
          }
          setThreads((prev) => {
            const exists = prev.some((item) => item.id === thread.id);
            if (!exists) return [full, ...prev];
            return prev.map((item) => (item.id === thread.id ? full : item));
          });
          setSelectedThreadId(thread.id);
          const unreadIds = full.messages.filter((message) => message.unread).map((message) => message.id);
          if (unreadIds.length) {
            await Promise.all(unreadIds.map((id) => api.markRead(id)));
            setThreads((prev) => setThreadUnread(prev, thread.id, false));
            const next = await api.mailboxes();
            setMailboxes(next);
            setCounts(countsFromMailboxes(next));
          }
        } catch (err) {
          showNotice(messageOf(err));
        }
      })();
    },
    [api, openCompose, showNotice]
  );

  const handleArchiveThread = useCallback(
    (threadId: string) => {
      const target = threads.find((thread) => thread.id === threadId);
      if (!target || target.folder === 'archive' || target.folder === 'trash') return;
      const previousFolder = target.folder;
      const previousUnread = target.unread;
      const wasReading = selectedThreadId === threadId;

      setThreads((prev) => moveThreadToFolder(prev, threadId, 'archive'));
      if (wasReading) {
        setSelectedThreadId(null);
        setDeepReading(false);
      }

      void (async () => {
        try {
          const ids = await resolveIds(target);
          await Promise.all(ids.map((id) => api.archive(id)));
          const next = await api.mailboxes();
          setMailboxes(next);
          setCounts(countsFromMailboxes(next));
          const previousMailbox = next.find((mailbox) => mailbox.folder === previousFolder)?.id;
          showNotice('Archivado', () => {
            if (!previousMailbox) return;
            void (async () => {
              await Promise.all(ids.map((id) => api.move(id, previousMailbox)));
              setThreads((prev) =>
                setThreadUnread(moveThreadToFolder(prev, threadId, previousFolder), threadId, previousUnread)
              );
              const restored = await api.mailboxes();
              setMailboxes(restored);
              setCounts(countsFromMailboxes(restored));
            })().catch((err) => showNotice(messageOf(err)));
          });
        } catch (err) {
          setThreads((prev) =>
            setThreadUnread(moveThreadToFolder(prev, threadId, previousFolder), threadId, previousUnread)
          );
          if (wasReading) setSelectedThreadId(threadId);
          showNotice(messageOf(err));
        }
      })();
    },
    [api, resolveIds, selectedThreadId, showNotice, threads]
  );

  const handleTrashThread = useCallback(
    (threadId: string) => {
      const target = threads.find((thread) => thread.id === threadId);
      if (!target || target.folder === 'trash') return;
      const previousFolder = target.folder;
      const previousUnread = target.unread;
      const wasReading = selectedThreadId === threadId;
      const previousMailbox = mailboxes.find((mailbox) => mailbox.folder === previousFolder)?.id;

      setThreads((prev) => moveThreadToFolder(prev, threadId, 'trash'));
      if (wasReading) {
        setSelectedThreadId(null);
        setDeepReading(false);
      }

      void (async () => {
        try {
          const ids = await resolveIds(target);
          await Promise.all(ids.map((id) => api.trash(id)));
          const next = await api.mailboxes();
          setMailboxes(next);
          setCounts(countsFromMailboxes(next));
          showNotice('Movido a la papelera', () => {
            if (!previousMailbox) return;
            void (async () => {
              await Promise.all(ids.map((id) => api.move(id, previousMailbox)));
              setThreads((prev) =>
                setThreadUnread(moveThreadToFolder(prev, threadId, previousFolder), threadId, previousUnread)
              );
              const restored = await api.mailboxes();
              setMailboxes(restored);
              setCounts(countsFromMailboxes(restored));
            })().catch((err) => showNotice(messageOf(err)));
          });
        } catch (err) {
          setThreads((prev) =>
            setThreadUnread(moveThreadToFolder(prev, threadId, previousFolder), threadId, previousUnread)
          );
          if (wasReading) setSelectedThreadId(threadId);
          showNotice(messageOf(err));
        }
      })();
    },
    [api, mailboxes, resolveIds, selectedThreadId, showNotice, threads]
  );

  const handleMoveToInbox = useCallback(
    (threadId: string) => {
      const target = threads.find((thread) => thread.id === threadId);
      if (!target || (target.folder !== 'trash' && target.folder !== 'archive')) return;
      const previousFolder = target.folder;
      const previousUnread = target.unread;
      const wasReading = selectedThreadId === threadId;

      setThreads((prev) => moveThreadToFolder(prev, threadId, 'inbox'));
      if (wasReading) {
        setSelectedThreadId(null);
        setDeepReading(false);
      }

      void (async () => {
        try {
          const ids = await resolveIds(target);
          await Promise.all(ids.map((id) => api.restore(id)));
          const next = await api.mailboxes();
          setMailboxes(next);
          setCounts(countsFromMailboxes(next));
          showNotice('Movido a Recibidos', () => {
            void (async () => {
              const origin =
                previousFolder === 'trash'
                  ? mailboxes.find((mailbox) => mailbox.folder === 'trash')?.id
                  : mailboxes.find((mailbox) => mailbox.folder === 'archive')?.id;
              if (!origin) return;
              await Promise.all(ids.map((id) => api.move(id, origin)));
              setThreads((prev) =>
                setThreadUnread(moveThreadToFolder(prev, threadId, previousFolder), threadId, previousUnread)
              );
              const restored = await api.mailboxes();
              setMailboxes(restored);
              setCounts(countsFromMailboxes(restored));
            })().catch((err) => showNotice(messageOf(err)));
          });
        } catch (err) {
          setThreads((prev) =>
            setThreadUnread(moveThreadToFolder(prev, threadId, previousFolder), threadId, previousUnread)
          );
          if (wasReading) setSelectedThreadId(threadId);
          showNotice(messageOf(err));
        }
      })();
    },
    [api, mailboxes, resolveIds, selectedThreadId, showNotice, threads]
  );

  const handleRestoreThread = useCallback(
    (threadId: string) => {
      handleMoveToInbox(threadId);
    },
    [handleMoveToInbox]
  );

  const handlePermanentDeleteThread = useCallback(
    (threadId: string) => {
      const target = threads.find((thread) => thread.id === threadId);
      if (!target || target.folder !== 'trash') return;
      const wasReading = selectedThreadId === threadId;

      setConfirmDialog({
        title: '¿Borrar definitivamente?',
        message:
          'Este mensaje se eliminará para siempre y no podrás recuperarlo desde la papelera.',
        confirmLabel: 'Borrar definitivamente',
        onConfirm: () => {
          setConfirmDialog(null);
          setThreads((prev) => prev.filter((thread) => thread.id !== threadId));
          if (wasReading) {
            setSelectedThreadId(null);
            setDeepReading(false);
          }
          void (async () => {
            try {
              const ids = await resolveIds(target);
              await Promise.all(ids.map((id) => api.destroy(id)));
              const next = await api.mailboxes();
              setMailboxes(next);
              setCounts(countsFromMailboxes(next));
              showNotice('Mensaje eliminado definitivamente');
            } catch (err) {
              setThreads((prev) => [target, ...prev]);
              if (wasReading) setSelectedThreadId(threadId);
              showNotice(messageOf(err));
            }
          })();
        },
      });
    },
    [api, resolveIds, selectedThreadId, showNotice, threads]
  );

  const handleToggleUnread = useCallback(
    (threadId: string, nextUnread: boolean) => {
      const target = threads.find((thread) => thread.id === threadId);
      if (!target) return;
      void (async () => {
        try {
          const ids = await resolveIds(target);
          await Promise.all(ids.map((id) => (nextUnread ? api.markUnread(id) : api.markRead(id))));
          setThreads((prev) => setThreadUnread(prev, threadId, nextUnread));
          const next = await api.mailboxes();
          setMailboxes(next);
          setCounts(countsFromMailboxes(next));
        } catch (err) {
          showNotice(messageOf(err));
        }
      })();
    },
    [api, resolveIds, showNotice, threads]
  );

  const handleEmptyTrash = useCallback(() => {
    const trashCount = threads.filter((thread) => thread.folder === 'trash').length;
    if (trashCount === 0 && counts.trash === 0) {
      showNotice('Papelera vacía');
      return;
    }
    void (async () => {
      try {
        await api.emptyTrash();
        setThreads((prev) => emptyTrashThreads(prev));
        if (selectedThread?.folder === 'trash') {
          setSelectedThreadId(null);
          setDeepReading(false);
        }
        const next = await api.mailboxes();
        setMailboxes(next);
        setCounts(countsFromMailboxes(next));
        showNotice('Papelera vaciada');
      } catch (err) {
        showNotice(messageOf(err));
      }
    })();
  }, [api, counts.trash, selectedThread, showNotice, threads]);

  const handleSendEmail = useCallback(
    (payload: ComposePayload) => {
      void (async () => {
        try {
          await api.send({
            to: [payload.to],
            subject: payload.subject.trim() || '(Sin asunto)',
            html: payload.bodyHtml,
            text: stripHtmlToSnippet(payload.bodyHtml, 20000),
            draftId: payload.draftThreadId,
            attachments: toSendAttachments(payload.attachments),
          });
          setComposeOpen(false);
          showNotice(`Enviado a ${payload.to}`);
          await reload();
        } catch (err) {
          showNotice(messageOf(err));
        }
      })();
    },
    [api, reload, showNotice]
  );

  const handleSaveDraft = useCallback(
    (payload: ComposePayload) => {
      void (async () => {
        try {
          await api.saveDraft({
            id: payload.draftThreadId,
            to: payload.to.trim() ? [payload.to.trim()] : [],
            subject: payload.subject.trim(),
            html: payload.bodyHtml,
            text: stripHtmlToSnippet(payload.bodyHtml, 20000),
          });
          showNotice('Borrador guardado');
          await reload();
        } catch (err) {
          showNotice(messageOf(err));
        }
      })();
    },
    [api, reload, showNotice]
  );

  const handleDiscardDraft = useCallback(
    (draftThreadId?: string) => {
      if (!draftThreadId) return;
      void (async () => {
        try {
          await api.deleteDraft(draftThreadId);
          setThreads((prev) => prev.filter((thread) => thread.id !== draftThreadId && !thread.messageIds?.includes(draftThreadId)));
          await reload();
        } catch (err) {
          showNotice(messageOf(err));
        }
      })();
    },
    [api, reload, showNotice]
  );

  const handleSendReply = useCallback(
    (bodyHtml: string, attachments: ComposeAttachment[] = []) => {
      if (!selectedThread) return;
      const last = selectedThread.messages[selectedThread.messages.length - 1];
      if (!last) return;
      const to =
        last.sender.email === user.email ? (last.recipients[0] ?? '') : last.sender.email;
      if (!to) {
        showNotice('No hay destinatario para responder');
        return;
      }
      const parent = last.messageIdHeader ? [last.messageIdHeader] : [];
      const references = [...(last.references ?? []), ...parent];
      const raw = selectedThread.rawSubject || selectedThread.subject;
      const subject = /^(re|rv):/i.test(raw.trim()) ? raw : `Re: ${raw}`;
      void (async () => {
        try {
          await api.send({
            to: [to],
            subject,
            html: bodyHtml,
            text: stripHtmlToSnippet(bodyHtml, 20000),
            inReplyTo: parent,
            references,
            attachments: toSendAttachments(attachments),
          });
          const full = detailToThread(await api.thread(selectedThread.id), selectedThread.folder);
          setThreads((prev) => prev.map((thread) => (thread.id === full.id ? full : thread)));
          showNotice('Enviado');
        } catch (err) {
          showNotice(messageOf(err));
        }
      })();
    },
    [api, selectedThread, showNotice, user.email]
  );

  handleOpenRef.current = handleOpenThread;

  const handleForwardSelected = useCallback(() => {
    if (!selectedThread) return;
    const latest = selectedThread.messages[selectedThread.messages.length - 1];
    const forwardedBody = `<p></p><blockquote><p><strong>Reenviado de ${latest.sender.name} (${latest.sender.email}):</strong></p>${latest.bodyHtml}</blockquote>`;
    const kept = (latest.attachments ?? [])
      .filter((item) => item.blobId)
      .map((item) => ({
        id: item.blobId as string,
        name: item.name,
        sizeLabel: item.size,
        contentType:
          item.kind === 'pdf'
            ? 'application/pdf'
            : item.kind === 'image'
              ? 'image/jpeg'
              : 'application/octet-stream',
        blobId: item.blobId,
      }));
    openCompose({
      to: '',
      subject: selectedThread.subject.startsWith('Fwd:')
        ? selectedThread.subject
        : `Fwd: ${selectedThread.subject}`,
      bodyHtml: forwardedBody,
      attachments: kept,
    });
  }, [selectedThread, openCompose]);

  const handleShowRemoteImages = useCallback(
    (messageId: string) => {
      void (async () => {
        try {
          const html = await api.messageHtml(messageId, true);
          setThreads((prev) =>
            prev.map((thread) =>
              thread.id === selectedRef.current
                ? {
                    ...thread,
                    messages: thread.messages.map((message) =>
                      message.id === messageId
                        ? { ...message, bodyHtml: html, remoteImagesBlocked: false, isHtmlRich: true }
                        : message
                    ),
                  }
                : thread
            )
          );
        } catch (err) {
          showNotice(messageOf(err));
        }
      })();
    },
    [api, showNotice]
  );

  const handleTrustSender = useCallback(
    (email: string) => {
      const current = threads.find((thread) => thread.id === selectedRef.current);
      if (!current) return;
      void (async () => {
        try {
          await api.trustSender(email);
          const full = detailToThread(await api.thread(current.id), current.folder);
          setThreads((prev) => prev.map((thread) => (thread.id === full.id ? full : thread)));
          showNotice('Remitente de confianza');
        } catch (err) {
          showNotice(messageOf(err));
        }
      })();
    },
    [api, showNotice, threads]
  );

  const loadMoreSearch = useCallback(() => {
    const query = searchQuery.trim();
    if (!query || !searchCursor) return;
    void (async () => {
      try {
        const mailboxId = mailboxes.find((mailbox) => mailbox.folder === activeFolder)?.id;
        const page = await api.search(query, mailboxId, searchCursor);
        setSearchHits((prev) => [
          ...prev,
          ...page.threads.map((item) => summaryToThread(item, item.folder || activeFolder)),
        ]);
        setSearchCursor(page.cursor);
      } catch (err) {
        showNotice(messageOf(err));
      }
    })();
  }, [api, activeFolder, mailboxes, searchCursor, searchQuery, showNotice]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const handleLogout = useCallback(() => {
    void api.logout().then(() => {
      setAuthed(false);
      setThreads([]);
      setSelectedThreadId(null);
    });
  }, [api]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!authed) return;
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
    authed,
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
        hint: `${counts.trash} en papelera`,
        group: 'Acciones',
        keywords: ['vaciar', 'papelera', 'trash', 'limpiar', 'eliminar'],
        run: handleEmptyTrash,
      },
      {
        id: 'act-logout',
        label: 'Cerrar sesión',
        group: 'Acciones',
        keywords: ['salir', 'logout', 'cerrar', 'sesión'],
        run: handleLogout,
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
      .filter((thread) => thread.folder !== 'trash')
      .slice(0, 6)
      .map((thread) => ({
        id: `open-${thread.id}`,
        label: thread.subject,
        hint: thread.messages[thread.messages.length - 1]?.sender.name,
        group: 'Hilos',
        keywords: [
          thread.subject,
          ...thread.messages.map((message) => `${message.sender.name} ${message.sender.email}`),
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
    counts.trash,
    threads,
    handleSelectFolder,
    openCompose,
    toggleTheme,
    handleEmptyTrash,
    handleLogout,
    handleOpenThread,
  ]);

  if (!ready) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[var(--canvas-bg)] text-[var(--ink-primary)]">
        <p className="text-[28px]" style={{ fontFamily: 'var(--font-serif)' }}>
          DarioMail
        </p>
      </div>
    );
  }

  if (!authed) {
    return <LoginScreen pending={authPending} error={authError} onSubmit={handleLogin} />;
  }

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-[var(--canvas-bg)] text-[var(--ink-primary)] transition-colors duration-300">
      <LiquidSidebar
        activeFolder={activeFolder}
        counts={counts}
        theme={theme}
        mobileOpen={mobileMenuOpen}
        hiddenForDeepReading={deepReading}
        onSelectFolder={handleSelectFolder}
        onOpenCompose={() => openCompose()}
        onOpenCommandPalette={() => setPaletteOpen(true)}
        onToggleTheme={toggleTheme}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

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
              onMoveToInbox={() => handleMoveToInbox(selectedThread.id)}
              onDeletePermanently={() => handlePermanentDeleteThread(selectedThread.id)}
              onMarkUnread={() => {
                handleToggleUnread(selectedThread.id, true);
                setDeepReading(false);
                setSelectedThreadId(null);
              }}
              onForward={handleForwardSelected}
              onShowRemoteImages={handleShowRemoteImages}
              onTrustSender={handleTrustSender}
              onSendReply={handleSendReply}
            />
          ) : (
            <ThreadFeed
              key={`feed-${activeFolder}`}
              folder={activeFolder}
              threads={visibleThreads}
              feedLoadState={feedLoad.state}
              feedLoadError={feedLoad.error}
              feedLoadedOnce={feedLoad.loadedOnce}
              searchLoadState={searchLoadState}
              searchLoadError={searchLoadError}
              onRetryLoad={() => {
                void reload();
              }}
              onPullRefresh={async () => {
                await reload({ silent: true });
              }}
              searchQuery={searchQuery}
              focusedIndex={focusedIndex}
              currentUserEmail={user.email}
              referenceIso={referenceNow}
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
              onMoveToInboxThread={handleMoveToInbox}
              onPermanentDeleteThread={handlePermanentDeleteThread}
              onToggleUnread={handleToggleUnread}
              onEmptyTrash={handleEmptyTrash}
              onOpenMobileMenu={() => setMobileMenuOpen(true)}
              onOpenCompose={() => openCompose()}
              onFocusIndexChange={setFocusedIndex}
              hasMore={Boolean(searchQuery.trim() && searchCursor)}
              onLoadMore={loadMoreSearch}
            />
          )}
        </AnimatePresence>

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

      <ComposeModal
        open={composeOpen}
        initial={composeInitial}
        onClose={() => setComposeOpen(false)}
        onSend={handleSendEmail}
        onSaveDraft={handleSaveDraft}
        onDiscardDraft={handleDiscardDraft}
      />

      <CommandPalette
        open={paletteOpen}
        commands={commandItems}
        remoteCommands={paletteRemote}
        onQueryChange={setPaletteQuery}
        onClose={() => setPaletteOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(confirmDialog)}
        title={confirmDialog?.title ?? ''}
        message={confirmDialog?.message ?? ''}
        confirmLabel={confirmDialog?.confirmLabel}
        dangerous
        onConfirm={() => confirmDialog?.onConfirm()}
        onCancel={() => setConfirmDialog(null)}
      />
    </div>
  );
}
