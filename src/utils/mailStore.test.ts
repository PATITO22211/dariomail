import test from 'node:test';
import assert from 'node:assert/strict';
import { CURRENT_USER, SEED_THREADS } from '../data/seedThreads';
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

test('getFolderCounts counts unread inbox, drafts, and trash accurately', () => {
  const counts = getFolderCounts(SEED_THREADS);
  assert.equal(counts.inbox, 3);
  assert.equal(counts.drafts, 1);
  assert.equal(counts.trash, 2);
});

test('filterThreadsForFolder filters invoices via "facturas" across active folders excluding trash', () => {
  const results = filterThreadsForFolder(SEED_THREADS, 'inbox', 'facturas');
  assert.equal(results.length, 3);
  assert.ok(results.every((t) => t.folder !== 'trash'));
  assert.ok(results.some((t) => t.id === 'thr-invoice-linear'));
  assert.ok(results.some((t) => t.id === 'thr-invoice-foundry'));
});

test('setThreadUnread updates unread status and decrements inbox unread badge', () => {
  const updated = setThreadUnread(SEED_THREADS, 'thr-elena-monograph', false);
  assert.equal(getFolderCounts(updated).inbox, 2);
  const restored = setThreadUnread(updated, 'thr-elena-monograph', true);
  assert.equal(getFolderCounts(restored).inbox, 3);
});

test('moveThreadToFolder moves thread to archive and clears unread state', () => {
  const updated = moveThreadToFolder(SEED_THREADS, 'thr-elena-monograph', 'archive');
  const moved = updated.find((t) => t.id === 'thr-elena-monograph');
  assert.equal(moved?.folder, 'archive');
  assert.equal(moved?.unread, false);
  assert.equal(getFolderCounts(updated).inbox, 2);
});

test('emptyTrashThreads removes all trash threads while preserving other folders', () => {
  const after = emptyTrashThreads(SEED_THREADS);
  assert.equal(getFolderCounts(after).trash, 0);
  assert.equal(after.length, SEED_THREADS.length - 2);
});

test('isComposeReady enforces valid email recipient and non-empty subject or body', () => {
  assert.equal(isComposeReady('', 'Hola', '<p>Texto</p>'), false);
  assert.equal(isComposeReady('invalido', 'Hola', '<p>Texto</p>'), false);
  assert.equal(isComposeReady('elena@ateliervance.es', '', '<p></p>'), false);
  assert.equal(isComposeReady('elena@ateliervance.es', 'Propuesta', '<p></p>'), true);
  assert.equal(isComposeReady('elena@ateliervance.es', '', '<p>Hola Elena</p>'), true);
});

test('sendEmailThread adds sent thread and removes source draft if present', () => {
  const now = '2026-11-20T16:30:00-08:00';
  const { threads, sentThread } = sendEmailThread(
    SEED_THREADS,
    {
      draftThreadId: 'thr-draft-editorial',
      to: 'elena@ateliervance.es',
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
    SEED_THREADS,
    {
      to: 'clara@solerestudio.com',
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
      to: 'clara@solerestudio.com',
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
    SEED_THREADS,
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
