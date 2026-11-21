import test from 'node:test';
import assert from 'node:assert/strict';
import type { MailMessage, MailThread, Participant } from '../types/mail';
import {
  appendReplyToThread,
  emptyTrashThreads,
  filterCommands,
  filterThreadsForFolder,
  formatEditorialTimestamp,
  getFolderCounts,
  isComposeReady,
  moveThreadToFolder,
  sanitizeEmailHtml,
  saveDraftThread,
  sendEmailThread,
  setThreadUnread,
  stripHtmlToSnippet,
} from './mailStore';

const CURRENT_USER: Participant = {
  name: 'Dario',
  email: 'dario@example.com',
};

function message(id: string, sender: Participant, snippet: string): MailMessage {
  return {
    id,
    sender,
    recipients: ['dario@example.com'],
    timestamp: '2026-11-20T12:00:00Z',
    bodyHtml: `<p>${snippet}</p>`,
    plainSnippet: snippet,
  };
}

const elena: Participant = { name: 'Elena Vance', email: 'elena@example.com' };

const FIXTURE: MailThread[] = [
  {
    id: 'thr-elena-monograph',
    folder: 'inbox',
    subject: 'Monografía',
    unread: true,
    category: 'correspondence',
    updatedAt: '2026-11-20T15:00:00Z',
    messages: [
      message('m1', elena, 'Primera nota'),
      message('m2', CURRENT_USER, 'Respuesta'),
      message('m3', elena, 'Cierre'),
    ],
  },
  {
    id: 'thr-unread-2',
    folder: 'inbox',
    subject: 'Pendiente dos',
    unread: true,
    updatedAt: '2026-11-20T14:00:00Z',
    messages: [message('m4', elena, 'Dos')],
  },
  {
    id: 'thr-unread-3',
    folder: 'inbox',
    subject: 'Pendiente tres',
    unread: true,
    updatedAt: '2026-11-20T13:00:00Z',
    messages: [message('m5', elena, 'Tres')],
  },
  {
    id: 'thr-invoice-linear',
    folder: 'inbox',
    subject: 'Factura Linear',
    unread: false,
    category: 'invoice',
    updatedAt: '2026-11-19T10:00:00Z',
    messages: [message('m6', elena, 'Factura')],
  },
  {
    id: 'thr-invoice-foundry',
    folder: 'archive',
    subject: 'Factura Foundry',
    unread: false,
    category: 'invoice',
    updatedAt: '2026-11-18T10:00:00Z',
    messages: [message('m7', elena, 'Factura archivo')],
  },
  {
    id: 'thr-invoice-other',
    folder: 'sent',
    subject: 'Factura enviada',
    unread: false,
    category: 'invoice',
    updatedAt: '2026-11-17T10:00:00Z',
    messages: [message('m8', CURRENT_USER, 'Factura enviada')],
  },
  {
    id: 'thr-draft-editorial',
    folder: 'drafts',
    subject: 'Borrador',
    unread: false,
    updatedAt: '2026-11-16T10:00:00Z',
    messages: [message('m9', CURRENT_USER, 'Borrador')],
  },
  {
    id: 'thr-trash-1',
    folder: 'trash',
    subject: 'Viejo uno',
    unread: false,
    updatedAt: '2026-11-15T10:00:00Z',
    messages: [message('m10', elena, 'Basura')],
  },
  {
    id: 'thr-trash-2',
    folder: 'trash',
    subject: 'Viejo dos',
    unread: false,
    updatedAt: '2026-11-14T10:00:00Z',
    messages: [message('m11', elena, 'Basura dos')],
  },
];

test('getFolderCounts counts unread inbox, drafts, and trash accurately', () => {
  const counts = getFolderCounts(FIXTURE);
  assert.equal(counts.inbox, 3);
  assert.equal(counts.drafts, 1);
  assert.equal(counts.trash, 2);
});

test('filterThreadsForFolder filters invoices via "facturas" across active folders excluding trash', () => {
  const results = filterThreadsForFolder(FIXTURE, 'inbox', 'facturas');
  assert.equal(results.length, 3);
  assert.ok(results.every((t) => t.folder !== 'trash'));
  assert.ok(results.some((t) => t.id === 'thr-invoice-linear'));
  assert.ok(results.some((t) => t.id === 'thr-invoice-foundry'));
});

test('setThreadUnread updates unread status and decrements inbox unread badge', () => {
  const updated = setThreadUnread(FIXTURE, 'thr-elena-monograph', false);
  assert.equal(getFolderCounts(updated).inbox, 2);
  const restored = setThreadUnread(updated, 'thr-elena-monograph', true);
  assert.equal(getFolderCounts(restored).inbox, 3);
});

test('moveThreadToFolder moves thread to archive and clears unread state', () => {
  const updated = moveThreadToFolder(FIXTURE, 'thr-elena-monograph', 'archive');
  const moved = updated.find((t) => t.id === 'thr-elena-monograph');
  assert.equal(moved?.folder, 'archive');
  assert.equal(moved?.unread, false);
  assert.equal(getFolderCounts(updated).inbox, 2);
});

test('emptyTrashThreads removes all trash threads while preserving other folders', () => {
  const after = emptyTrashThreads(FIXTURE);
  assert.equal(getFolderCounts(after).trash, 0);
  assert.equal(after.length, FIXTURE.length - 2);
});

test('isComposeReady enforces valid email recipient and non-empty subject or body', () => {
  assert.equal(isComposeReady('', 'Hola', '<p>Texto</p>'), false);
  assert.equal(isComposeReady('invalido', 'Hola', '<p>Texto</p>'), false);
  assert.equal(isComposeReady('elena@example.com', '', '<p></p>'), false);
  assert.equal(isComposeReady('elena@example.com', 'Propuesta', '<p></p>'), true);
  assert.equal(isComposeReady('elena@example.com', '', '<p>Hola Elena</p>'), true);
});

test('sendEmailThread adds sent thread and removes source draft if present', () => {
  const now = '2026-11-20T16:30:00-08:00';
  const { threads, sentThread } = sendEmailThread(
    FIXTURE,
    {
      draftThreadId: 'thr-draft-editorial',
      to: 'elena@example.com',
      subject: 'Ensayo final',
      bodyHtml: '<p>Aquí tienes la versión final.</p>',
    },
    CURRENT_USER,
    now
  );

  assert.equal(sentThread.folder, 'sent');
  assert.equal(getFolderCounts(threads).drafts, 0);
  assert.equal(threads[0].id, sentThread.id);
});

test('saveDraftThread creates and updates drafts cleanly', () => {
  const now = '2026-11-20T16:35:00-08:00';
  const withNewDraft = saveDraftThread(
    FIXTURE,
    {
      to: 'clara@example.org',
      subject: 'Notas cerámica',
      bodyHtml: '<p>Borrador inicial</p>',
    },
    CURRENT_USER,
    now
  );
  assert.equal(getFolderCounts(withNewDraft).drafts, 2);
  const newDraftId = withNewDraft[0].id;

  const updated = saveDraftThread(
    withNewDraft,
    {
      draftThreadId: newDraftId,
      to: 'clara@example.org',
      subject: 'Notas cerámica v2',
      bodyHtml: '<p>Borrador editado</p>',
    },
    CURRENT_USER,
    now
  );
  assert.equal(getFolderCounts(updated).drafts, 2);
  assert.equal(
    updated.find((t) => t.id === newDraftId)?.subject,
    'Notas cerámica v2'
  );
});

test('appendReplyToThread appends reply message and updates timestamp', () => {
  const now = '2026-11-20T16:40:00-08:00';
  const updated = appendReplyToThread(
    FIXTURE,
    'thr-elena-monograph',
    '<p>Confirmado para prensa.</p>',
    CURRENT_USER,
    now
  );
  const thread = updated.find((t) => t.id === 'thr-elena-monograph');
  assert.equal(thread?.messages.length, 4);
  assert.equal(thread?.unread, false);
  assert.equal(thread?.updatedAt, now);
});

test('sanitizeEmailHtml strips scripts, iframes, event handlers, and javascript URLs', () => {
  const dirty =
    '<p onclick="alert(1)">Hola</p><script>evil()</script><a href="javascript:steal()">link</a><iframe src="x"></iframe>';
  const clean = sanitizeEmailHtml(dirty);
  assert.ok(!clean.includes('<script'));
  assert.ok(!clean.includes('<iframe'));
  assert.ok(!clean.includes('onclick'));
  assert.ok(!clean.includes('javascript:'));
  assert.ok(clean.includes('Hola'));
});

test('stripHtmlToSnippet removes tags and normalizes whitespace', () => {
  assert.equal(stripHtmlToSnippet('<p>Hola &amp; <strong>bienvenido</strong></p>'), 'Hola & bienvenido');
});

test('formatEditorialTimestamp renders today as HH:MM and yesterday as Ayer', () => {
  const ref = '2026-11-20T16:24:00Z';
  assert.match(formatEditorialTimestamp('2026-11-20T14:35:00Z', ref), /^\d{2}:\d{2}$/);
  assert.equal(formatEditorialTimestamp('2026-11-19T11:20:00Z', ref), 'Ayer');
  assert.equal(formatEditorialTimestamp('2026-11-10T12:30:00Z', ref), '10 nov');
});

test('filterCommands supports bilingual Spanish and English aliases', () => {
  const commands = [
    {
      id: 'nav-sent',
      label: 'Ir a Enviados',
      group: 'Navegación' as const,
      keywords: ['sent', 'enviados'],
      run: () => {},
    },
    {
      id: 'theme-toggle',
      label: 'Cambiar a Modo Claro',
      group: 'Acciones' as const,
      keywords: ['light', 'claro', 'tema'],
      run: () => {},
    },
  ];

  assert.equal(filterCommands(commands, 'sent').length, 1);
  assert.equal(filterCommands(commands, 'claro').length, 1);
  assert.equal(filterCommands(commands, '').length, 2);
});
