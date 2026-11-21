import type {
  CommandItem,
  ComposePayload,
  FolderId,
  MailMessage,
  MailThread,
  Participant,
} from '../types/mail';

export const FOLDER_META: Record<
  FolderId,
  { label: string; englishAlias: string; emptyTitle: string; emptyHint: string }
> = {
  inbox: {
    label: 'Recibidos',
    englishAlias: 'Inbox',
    emptyTitle: 'Bandeja en silencio',
    emptyHint: 'No quedan conversaciones pendientes por atender.',
  },
  sent: {
    label: 'Enviados',
    englishAlias: 'Sent',
    emptyTitle: 'Sin correos enviados',
    emptyHint: 'Los mensajes que envíes aparecerán aquí con su historial.',
  },
  drafts: {
    label: 'Borradores',
    englishAlias: 'Drafts',
    emptyTitle: 'Ningún borrador abierto',
    emptyHint: 'Pulsa C para abrir el santuario de escritura.',
  },
  archive: {
    label: 'Archivo',
    englishAlias: 'Archive',
    emptyTitle: 'Archivo despejado',
    emptyHint: 'Archiva conversaciones resueltas para mantener el foco.',
  },
  trash: {
    label: 'Papelera',
    englishAlias: 'Trash',
    emptyTitle: 'Papelera vacía',
    emptyHint: 'Los mensajes eliminados se conservan aquí hasta que decidas vaciarlos.',
  },
};

export function stripHtmlToSnippet(html: string, maxLen = 150): string {
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen).trimEnd()}…`;
}

export function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, '$1=$2#$2');
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function filterThreadsForFolder(
  threads: MailThread[],
  folder: FolderId,
  searchQuery: string
): MailThread[] {
  const normalizedQuery = normalizeText(searchQuery.trim());

  const filtered = threads.filter((thread) => {
    if (!normalizedQuery) {
      return thread.folder === folder;
    }

    // When searching, search within trash only if currently in trash; otherwise search all active folders
    if (folder === 'trash' ? thread.folder !== 'trash' : thread.folder === 'trash') {
      return false;
    }

    if (normalizedQuery === 'no leidos' || normalizedQuery === 'unread') {
      return thread.unread;
    }

    if (normalizedQuery === 'facturas' || normalizedQuery === 'factura' || normalizedQuery === 'invoices') {
      if (thread.category === 'invoice') return true;
    }

    if (normalizedQuery === 'newsletters' || normalizedQuery === 'newsletter') {
      if (thread.category === 'newsletter') return true;
    }

    const haystack = normalizeText(
      [
        thread.subject,
        thread.draftTo ?? '',
        ...thread.messages.map((m) => `${m.sender.name} ${m.sender.email} ${m.plainSnippet}`),
      ].join(' ')
    );

    return haystack.includes(normalizedQuery);
  });

  return [...filtered].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function getFolderCounts(threads: MailThread[]): Record<FolderId, number> {
  return threads.reduce<Record<FolderId, number>>(
    (acc, thread) => {
      if (thread.folder === 'inbox' && thread.unread) {
        acc.inbox += 1;
      } else if (thread.folder === 'drafts') {
        acc.drafts += 1;
      } else if (thread.folder === 'trash') {
        acc.trash += 1;
      }
      return acc;
    },
    { inbox: 0, sent: 0, drafts: 0, archive: 0, trash: 0 }
  );
}

export function setThreadUnread(
  threads: MailThread[],
  threadId: string,
  unread: boolean
): MailThread[] {
  return threads.map((thread) =>
    thread.id === threadId ? { ...thread, unread } : thread
  );
}

export function moveThreadToFolder(
  threads: MailThread[],
  threadId: string,
  targetFolder: FolderId
): MailThread[] {
  return threads.map((thread) =>
    thread.id === threadId
      ? {
          ...thread,
          folder: targetFolder,
          unread: targetFolder === 'trash' || targetFolder === 'archive' ? false : thread.unread,
        }
      : thread
  );
}

export function emptyTrashThreads(threads: MailThread[]): MailThread[] {
  return threads.filter((thread) => thread.folder !== 'trash');
}

export function isComposeReady(to: string, subject: string, bodyHtml: string): boolean {
  const trimmedTo = to.trim();
  const hasValidRecipient = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedTo);
  const hasContent =
    subject.trim().length > 0 || stripHtmlToSnippet(bodyHtml, 40).length > 0;
  return hasValidRecipient && hasContent;
}

export function sendEmailThread(
  threads: MailThread[],
  payload: ComposePayload,
  sender: Participant,
  nowIso: string
): { threads: MailThread[]; sentThread: MailThread } {
  const sanitizedHtml = sanitizeEmailHtml(payload.bodyHtml);
  const snippet = stripHtmlToSnippet(sanitizedHtml) || '(Sin contenido)';
  const subject = payload.subject.trim() || '(Sin asunto)';
  const recipient = payload.to.trim();

  const message: MailMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sender,
    recipients: [recipient],
    timestamp: nowIso,
    bodyHtml: sanitizedHtml || '<p></p>',
    plainSnippet: snippet,
  };

  const sentThread: MailThread = {
    id: `thr-sent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    folder: 'sent',
    subject,
    unread: false,
    category: 'correspondence',
    updatedAt: nowIso,
    messages: [message],
  };

  const remaining = payload.draftThreadId
    ? threads.filter((t) => t.id !== payload.draftThreadId)
    : threads;

  return {
    threads: [sentThread, ...remaining],
    sentThread,
  };
}

export function saveDraftThread(
  threads: MailThread[],
  payload: ComposePayload,
  sender: Participant,
  nowIso: string
): MailThread[] {
  const sanitizedHtml = sanitizeEmailHtml(payload.bodyHtml);
  const snippet = stripHtmlToSnippet(sanitizedHtml) || 'Borrador sin texto aún';
  const subject = payload.subject.trim() || '(Sin asunto)';
  const to = payload.to.trim();

  const draftMessage: MailMessage = {
    id: `msg-draft-${Date.now()}`,
    sender,
    recipients: to ? [to] : [],
    timestamp: nowIso,
    bodyHtml: sanitizedHtml,
    plainSnippet: snippet,
  };

  if (payload.draftThreadId) {
    const exists = threads.some((t) => t.id === payload.draftThreadId);
    if (exists) {
      return threads.map((t) =>
        t.id === payload.draftThreadId
          ? {
              ...t,
              folder: 'drafts',
              subject,
              draftTo: to,
              draftBodyHtml: sanitizedHtml,
              updatedAt: nowIso,
              messages: [draftMessage],
            }
          : t
      );
    }
  }

  const newDraft: MailThread = {
    id: `thr-draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    folder: 'drafts',
    subject,
    unread: false,
    category: 'correspondence',
    updatedAt: nowIso,
    draftTo: to,
    draftBodyHtml: sanitizedHtml,
    messages: [draftMessage],
  };

  return [newDraft, ...threads];
}

export function appendReplyToThread(
  threads: MailThread[],
  threadId: string,
  bodyHtml: string,
  sender: Participant,
  nowIso: string
): MailThread[] {
  const sanitizedHtml = sanitizeEmailHtml(bodyHtml);
  const snippet = stripHtmlToSnippet(sanitizedHtml);
  if (!snippet) return threads;

  return threads.map((thread) => {
    if (thread.id !== threadId) return thread;
    const lastExternal =
      [...thread.messages].reverse().find((m) => m.sender.email !== sender.email)?.sender
        .email ?? thread.messages[0]?.sender.email ?? '';

    const replyMessage: MailMessage = {
      id: `msg-reply-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sender,
      recipients: lastExternal ? [lastExternal] : [],
      timestamp: nowIso,
      bodyHtml: sanitizedHtml,
      plainSnippet: snippet,
    };

    return {
      ...thread,
      unread: false,
      updatedAt: nowIso,
      messages: [...thread.messages, replyMessage],
    };
  });
}

export function formatEditorialTimestamp(isoDate: string, referenceIso: string): string {
  const date = new Date(isoDate);
  const ref = new Date(referenceIso);
  if (Number.isNaN(date.getTime())) return '';

  const sameDay =
    date.getFullYear() === ref.getFullYear() &&
    date.getMonth() === ref.getMonth() &&
    date.getDate() === ref.getDate();

  if (sameDay) {
    return date.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  const yesterday = new Date(ref);
  yesterday.setDate(ref.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) {
    return 'Ayer';
  }

  const months = [
    'ene',
    'feb',
    'mar',
    'abr',
    'may',
    'jun',
    'jul',
    'ago',
    'sep',
    'oct',
    'nov',
    'dic',
  ];
  return `${date.getDate()} ${months[date.getMonth()]}`;
}

export function formatFullTimestamp(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function getThreadDisplaySender(thread: MailThread, currentUserEmail: string): string {
  if (thread.folder === 'sent') {
    const firstRecipient = thread.messages[0]?.recipients[0];
    return firstRecipient ? `Para: ${firstRecipient}` : 'Enviado';
  }
  if (thread.folder === 'drafts') {
    return thread.draftTo ? `Borrador · ${thread.draftTo}` : 'Borrador';
  }

  const uniqueNames: string[] = [];
  for (const msg of thread.messages) {
    const display =
      msg.sender.email === currentUserEmail ? 'Yo' : msg.sender.name.split(' ')[0];
    if (!uniqueNames.includes(display)) {
      uniqueNames.push(display);
    }
  }

  if (thread.messages.length === 1) {
    return thread.messages[0].sender.name;
  }

  return uniqueNames.join(', ');
}

export { createMailApi, ApiError, summaryToThread, detailToThread } from './mailApi';
export type { MailApi, MailboxInfo, SendInput, ThreadDetail, ThreadSummary } from './mailApi';

export function filterCommands(commands: CommandItem[], query: string): CommandItem[] {
  const clean = normalizeText(query.trim());
  if (!clean) return commands;

  return commands.filter((cmd) => {
    const target = normalizeText(
      [cmd.label, cmd.hint ?? '', cmd.group, ...cmd.keywords].join(' ')
    );
    return target.includes(clean);
  });
}
