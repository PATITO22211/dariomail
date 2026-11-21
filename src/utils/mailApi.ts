import type { ComposeAttachment, FolderId, MailMessage, MailThread } from '../types/mail';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface MailboxInfo {
  id: string;
  name: string;
  role: string | null;
  folder: FolderId | null;
  totalEmails: number;
  unreadEmails: number;
}

export interface ThreadSummary {
  id: string;
  subject: string;
  rawSubject: string;
  sender: { name: string; email: string };
  recipients: string[];
  preview: string;
  date: string;
  count: number;
  unread: boolean;
  messageIds: string[];
  folder?: FolderId | null;
}

export interface ThreadDetail {
  id: string;
  subject: string;
  rawSubject: string;
  unread: boolean;
  updatedAt: string;
  messages: Array<
    MailMessage & {
      unread?: boolean;
      messageIdHeader?: string | null;
      references?: string[];
    }
  >;
}

export interface SendInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text: string;
  inReplyTo?: string[];
  references?: string[];
  draftId?: string;
  attachments?: Array<{
    filename: string;
    contentType: string;
    dataBase64?: string;
    blobId?: string;
    size?: number;
  }>;
}

export interface DraftInput {
  id?: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
}

export interface MailApi {
  me(): Promise<{ email: string; name: string }>;
  login(password: string): Promise<{ email: string; name: string }>;
  logout(): Promise<void>;
  mailboxes(): Promise<MailboxInfo[]>;
  threads(
    mailboxId: string,
    limit: number,
    cursor?: string
  ): Promise<{ threads: ThreadSummary[]; cursor: string | null }>;
  thread(id: string): Promise<ThreadDetail>;
  search(
    q: string,
    mailboxId?: string,
    cursor?: string
  ): Promise<{ threads: ThreadSummary[]; cursor: string | null }>;
  messageHtml(id: string, allowImages?: boolean): Promise<string>;
  trustSender(email: string): Promise<void>;
  markRead(id: string): Promise<void>;
  markUnread(id: string): Promise<void>;
  archive(id: string): Promise<void>;
  trash(id: string): Promise<void>;
  move(id: string, mailboxId: string): Promise<void>;
  send(input: SendInput): Promise<void>;
  saveDraft(input: DraftInput): Promise<{ id: string }>;
  deleteDraft(id: string): Promise<void>;
  emptyTrash(): Promise<void>;
}

export function createMailApi(): MailApi {
  const flag = import.meta.env?.VITE_DARIOMAIL_MOCK;
  if (flag === '1' || flag === 'true') return createMockMailApi();
  return createRemoteMailApi();
}

export function summaryToThread(summary: ThreadSummary, folder: FolderId): MailThread {
  const resolved = summary.folder || folder;
  const preview = summary.preview || '';
  return {
    id: summary.id,
    folder: resolved,
    subject: summary.subject,
    rawSubject: summary.rawSubject,
    unread: summary.unread,
    updatedAt: summary.date,
    messageIds: summary.messageIds,
    messages: [
      {
        id: `${summary.id}-preview`,
        sender: summary.sender,
        recipients: summary.recipients,
        timestamp: summary.date,
        bodyHtml: `<p>${escapeText(preview)}</p>`,
        plainSnippet: preview,
        unread: summary.unread,
      },
    ],
  };
}

export function detailToThread(detail: ThreadDetail, folder: FolderId): MailThread {
  return {
    id: detail.id,
    folder,
    subject: detail.subject,
    rawSubject: detail.rawSubject,
    unread: detail.unread,
    updatedAt: detail.updatedAt,
    messageIds: detail.messages.map((message) => message.id),
    messages: detail.messages.map((message) => ({
      ...message,
      messageIdHeader: message.messageIdHeader ?? undefined,
      references: message.references ?? [],
      remoteImagesBlocked: message.remoteImagesBlocked,
    })),
  };
}

export function toSendAttachments(items: ComposeAttachment[] | undefined) {
  return (items ?? []).map((item) => ({
    filename: item.name,
    contentType: item.contentType,
    dataBase64: item.dataBase64,
    blobId: item.blobId,
    size: item.size,
  }));
}

function createRemoteMailApi(): MailApi {
  return {
    me: () => request('/api/auth/me'),
    login: (password) =>
      request('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
    logout: () => request('/api/auth/logout', { method: 'POST' }),
    mailboxes: async () => {
      const data = await request<{ mailboxes: MailboxInfo[] }>('/api/mailboxes');
      return data.mailboxes;
    },
    threads: (mailboxId, limit, cursor) => {
      const params = new URLSearchParams({ mailboxId, limit: String(limit) });
      if (cursor) params.set('cursor', cursor);
      return request(`/api/threads?${params.toString()}`);
    },
    thread: (id) => request(`/api/threads/${encodeURIComponent(id)}`),
    search: (q, mailboxId, cursor) => {
      const params = new URLSearchParams({ q });
      if (mailboxId) params.set('mailboxId', mailboxId);
      if (cursor) params.set('cursor', cursor);
      return request(`/api/search?${params.toString()}`);
    },
    messageHtml: async (id, allowImages) => {
      const params = allowImages ? '?allowImages=1' : '';
      const response = await fetch(`/api/messages/${encodeURIComponent(id)}/html${params}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new ApiError('No se pudo cargar el mensaje', response.status);
      }
      return response.text();
    },
    trustSender: async (email) => {
      await request('/api/senders/trust', { method: 'POST', body: JSON.stringify({ email }) });
    },
    markRead: (id) => request(`/api/messages/${encodeURIComponent(id)}/read`, { method: 'POST' }),
    markUnread: (id) =>
      request(`/api/messages/${encodeURIComponent(id)}/unread`, { method: 'POST' }),
    archive: (id) =>
      request(`/api/messages/${encodeURIComponent(id)}/archive`, { method: 'POST' }),
    trash: (id) => request(`/api/messages/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    move: (id, mailboxId) =>
      request(`/api/messages/${encodeURIComponent(id)}/move`, {
        method: 'POST',
        body: JSON.stringify({ mailboxId }),
      }),
    send: (input) => request('/api/messages/send', { method: 'POST', body: JSON.stringify(input) }),
    saveDraft: (input) =>
      request('/api/drafts', { method: 'POST', body: JSON.stringify(input) }),
    deleteDraft: (id) => request(`/api/drafts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    emptyTrash: () => request('/api/trash/empty', { method: 'POST' }),
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'include',
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor', 0);
  }

  if (!response.ok) {
    let message = 'La operación no se completó';
    try {
      const data = (await response.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // La respuesta no trae JSON.
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function createMockMailApi(): MailApi {
  const user = { email: 'dario@dariomsi.com', name: 'Dario' };
  let authed = true;
  let threads = mockThreads();
  let seq = 3;

  const requireAuth = () => {
    if (!authed) throw new ApiError('No autenticado', 401);
  };

  const summary = (thread: MailThread): ThreadSummary => {
    const latest = thread.messages[thread.messages.length - 1];
    return {
      id: thread.id,
      subject: thread.subject,
      rawSubject: thread.rawSubject || thread.subject,
      sender: latest?.sender ?? { name: 'Dario', email: user.email },
      recipients: latest?.recipients ?? [],
      preview: latest?.plainSnippet ?? '',
      date: thread.updatedAt,
      count: thread.messages.length,
      unread: thread.unread,
      messageIds: thread.messageIds ?? thread.messages.map((message) => message.id),
    };
  };

  return {
    me: async () => {
      requireAuth();
      return user;
    },
    login: async (password) => {
      if (!password.trim()) throw new ApiError('La clave no coincide', 401);
      authed = true;
      return user;
    },
    logout: async () => {
      authed = false;
    },
    mailboxes: async () => {
      requireAuth();
      const folders: FolderId[] = ['inbox', 'sent', 'drafts', 'archive', 'trash'];
      return folders.map((folder) => ({
        id: folder,
        name: folder,
        role: folder,
        folder,
        totalEmails: threads.filter((thread) => thread.folder === folder).length,
        unreadEmails: threads.filter((thread) => thread.folder === folder && thread.unread).length,
      }));
    },
    threads: async (mailboxId, limit) => {
      requireAuth();
      const list = threads
        .filter((thread) => thread.folder === mailboxId)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, limit)
        .map(summary);
      return { threads: list, cursor: null };
    },
    thread: async (id) => {
      requireAuth();
      const thread = threads.find((item) => item.id === id);
      if (!thread) throw new ApiError('No se encontró el hilo', 404);
      return {
        id: thread.id,
        subject: thread.subject,
        rawSubject: thread.rawSubject || thread.subject,
        unread: thread.unread,
        updatedAt: thread.updatedAt,
        messages: thread.messages,
      };
    },
    search: async (q, mailboxId) => {
      requireAuth();
      const needle = q.trim().toLowerCase();
      const list = threads
        .filter((thread) => !mailboxId || thread.folder === mailboxId)
        .filter((thread) => {
          if (needle === 'no leidos' || needle === 'no leídos' || needle === 'unread') {
            return thread.unread;
          }
          const haystack = [
            thread.subject,
            ...thread.messages.flatMap((message) => [
              message.sender.name,
              message.sender.email,
              message.plainSnippet,
              message.bodyHtml,
            ]),
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(needle);
        })
        .map((thread) => ({ ...summary(thread), folder: thread.folder }));
      return { threads: list, cursor: null };
    },
    messageHtml: async (id, allowImages) => {
      requireAuth();
      const message = threads.flatMap((thread) => thread.messages).find((item) => item.id === id);
      if (!message) throw new ApiError('No se encontró el mensaje', 404);
      if (allowImages) return message.bodyHtml;
      return message.bodyHtml.replace(/src="https?:[^"]*"/gi, '');
    },
    trustSender: async () => {
      requireAuth();
    },
    markRead: async (id) => {
      requireAuth();
      touch(threads, id, (thread) => ({ ...thread, unread: false }));
    },
    markUnread: async (id) => {
      requireAuth();
      touch(threads, id, (thread) => ({ ...thread, unread: true }));
    },
    archive: async (id) => {
      requireAuth();
      touch(threads, id, (thread) => ({ ...thread, folder: 'archive', unread: false }));
    },
    trash: async (id) => {
      requireAuth();
      touch(threads, id, (thread) => ({ ...thread, folder: 'trash', unread: false }));
    },
    move: async (id, mailboxId) => {
      requireAuth();
      touch(threads, id, (thread) => ({ ...thread, folder: mailboxId as FolderId }));
    },
    send: async (input) => {
      requireAuth();
      const now = new Date().toISOString();
      const id = `sent-${seq++}`;
      if (input.draftId) {
        threads = threads.filter(
          (thread) => thread.id !== input.draftId && !(thread.messageIds ?? []).includes(input.draftId!)
        );
      }
      threads = [
        {
          id,
          folder: 'sent',
          subject: input.subject || '(Sin asunto)',
          rawSubject: input.subject || '(Sin asunto)',
          unread: false,
          updatedAt: now,
          messageIds: [id],
          messages: [
            {
              id,
              sender: { name: user.name, email: user.email },
              recipients: input.to,
              timestamp: now,
              bodyHtml: input.html || '<p></p>',
              plainSnippet: input.text || '(Sin contenido)',
              messageIdHeader: `<${id}@dariomsi.com>`,
              references: input.references ?? [],
            },
          ],
        },
        ...threads,
      ];
    },
    saveDraft: async (input) => {
      requireAuth();
      const now = new Date().toISOString();
      const id = input.id || `draft-${seq++}`;
      const draft: MailThread = {
        id,
        folder: 'drafts',
        subject: input.subject || '(Sin asunto)',
        rawSubject: input.subject || '(Sin asunto)',
        unread: false,
        updatedAt: now,
        draftTo: input.to[0],
        draftBodyHtml: input.html,
        messageIds: [id],
        messages: [
          {
            id,
            sender: { name: user.name, email: user.email },
            recipients: input.to,
            timestamp: now,
            bodyHtml: input.html,
            plainSnippet: input.text || 'Borrador sin texto aún',
          },
        ],
      };
      const index = threads.findIndex((thread) => thread.id === id || thread.messageIds?.includes(id));
      if (index >= 0) threads[index] = draft;
      else threads = [draft, ...threads];
      return { id };
    },
    deleteDraft: async (id) => {
      requireAuth();
      threads = threads.filter((thread) => thread.id !== id && !(thread.messageIds ?? []).includes(id));
    },
    emptyTrash: async () => {
      requireAuth();
      threads = threads.filter((thread) => thread.folder !== 'trash');
    },
  };

  function touch(
    _list: MailThread[],
    id: string,
    update: (thread: MailThread) => MailThread
  ) {
    threads = threads.map((thread) => {
      const ids = thread.messageIds ?? thread.messages.map((message) => message.id);
      if (thread.id === id || ids.includes(id)) return update(thread);
      return thread;
    });
  }
}

function mockThreads(): MailThread[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'mock-inbox',
      folder: 'inbox',
      subject: 'Nota de prueba',
      rawSubject: 'Nota de prueba',
      unread: true,
      updatedAt: now,
      messageIds: ['mock-m1'],
      messages: [
        {
          id: 'mock-m1',
          sender: { name: 'Elena Vance', email: 'elena@example.com' },
          recipients: ['dario@dariomsi.com'],
          timestamp: now,
          bodyHtml: '<p>Mensaje local para probar la interfaz sin el servidor.</p>',
          plainSnippet: 'Mensaje local para probar la interfaz sin el servidor.',
          unread: true,
          messageIdHeader: '<mock-m1@example.com>',
          references: [],
        },
      ],
    },
  ];
}
