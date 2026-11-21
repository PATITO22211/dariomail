import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUp, Trash2, X } from 'lucide-react';
import type { ComposePayload } from '../types/mail';
import { isComposeReady, stripHtmlToSnippet } from '../utils/mailStore';
import { TipTapFolio } from './TipTapFolio';

export interface ComposeInitialState {
  draftThreadId?: string;
  to: string;
  subject: string;
  bodyHtml: string;
}

interface ComposeModalProps {
  open: boolean;
  initial: ComposeInitialState;
  onClose: () => void;
  onSend: (payload: ComposePayload) => void;
  onSaveDraft: (payload: ComposePayload) => void;
  onDiscardDraft?: (draftThreadId?: string) => void;
}

export function ComposeModal({
  open,
  initial,
  onClose,
  onSend,
  onSaveDraft,
  onDiscardDraft,
}: ComposeModalProps) {
  const [to, setTo] = useState(initial.to);
  const [subject, setSubject] = useState(initial.subject);
  const [bodyHtml, setBodyHtml] = useState(initial.bodyHtml);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [editorMountKey, setEditorMountKey] = useState(0);

  useEffect(() => {
    if (open) {
      setTo(initial.to);
      setSubject(initial.subject);
      setBodyHtml(initial.bodyHtml);
      setValidationError(null);
      setEditorMountKey((k) => k + 1);
    }
  }, [open, initial]);

  const readyToSend = isComposeReady(to, subject, bodyHtml);
  const hasAnyDraftContent =
    to.trim().length > 0 ||
    subject.trim().length > 0 ||
    stripHtmlToSnippet(bodyHtml, 20).length > 0;

  const handleCloseWithAutoDraft = () => {
    if (hasAnyDraftContent) {
      onSaveDraft({
        draftThreadId: initial.draftThreadId,
        to,
        subject,
        bodyHtml,
      });
    }
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCloseWithAutoDraft();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const handleSend = () => {
    if (!readyToSend) {
      setValidationError(
        !to.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())
          ? 'Introduce un destinatario válido (ej. elena@ateliervance.es).'
          : 'Añade asunto o mensaje antes de enviar.'
      );
      return;
    }
    setValidationError(null);
    onSend({
      draftThreadId: initial.draftThreadId,
      to: to.trim(),
      subject: subject.trim(),
      bodyHtml,
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="compose-modal-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Redactar correo"
        >
          {/* Warm Penumbra Backdrop */}
          <div
            onClick={handleCloseWithAutoDraft}
            className="fixed inset-0 bg-[#1c1915]/35 dark:bg-black/60 backdrop-blur-md"
          />

          {/* Golden-Proportion Floating Sanctuary Sheet */}
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.965 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 w-full max-w-[680px] rounded-3xl floating-monolith overflow-hidden flex flex-col max-h-[86vh]"
          >
            {/* Editorial Serif Header */}
            <div className="flex items-center justify-between px-7 pt-6 pb-3">
              <h2
                className="text-[24px] font-normal tracking-[-0.015em] text-[var(--ink-primary)]"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                {initial.draftThreadId ? 'Borrador' : 'Nuevo mensaje'}
              </h2>
              <button
                type="button"
                onClick={handleCloseWithAutoDraft}
                aria-label="Cerrar compositor y guardar borrador"
                className="p-1.5 -mr-1 rounded-full text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] transition-colors sacred-focus cursor-pointer"
              >
                <X className="w-4 h-4" strokeWidth={1.65} />
              </button>
            </div>

            {/* Precision Sculpted Recipient & Subject Inputs */}
            <div className="px-7 space-y-2.5">
              <div className="precision-input flex items-center gap-3 px-4 py-2.5 rounded-2xl">
                <label
                  htmlFor="compose-to"
                  className="text-[12px] font-medium text-[var(--ink-muted)] shrink-0 w-12 select-none"
                >
                  Para
                </label>
                <input
                  id="compose-to"
                  type="email"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  placeholder="nombre@dominio.com"
                  autoFocus={!initial.to}
                  className="flex-1 bg-transparent text-[14px] text-[var(--ink-primary)] placeholder:text-[var(--ink-faint)] outline-none caret-[var(--accent)]"
                />
              </div>

              <div className="precision-input flex items-center gap-3 px-4 py-2.5 rounded-2xl">
                <label
                  htmlFor="compose-subject"
                  className="text-[12px] font-medium text-[var(--ink-muted)] shrink-0 w-12 select-none"
                >
                  Asunto
                </label>
                <input
                  id="compose-subject"
                  type="text"
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  placeholder="Título"
                  autoFocus={Boolean(initial.to) && !initial.subject}
                  className="flex-1 bg-transparent text-[15px] font-medium tracking-[-0.01em] text-[var(--ink-primary)] placeholder:text-[var(--ink-faint)] outline-none caret-[var(--accent)]"
                />
              </div>
            </div>

            {/* Clean TipTap Paper Folio */}
            <div className="flex-1 overflow-y-auto px-7 py-5">
              <div className="precision-input rounded-2xl px-4 py-3.5 min-h-[220px]">
                <TipTapFolio
                  key={editorMountKey}
                  initialContent={initial.bodyHtml}
                  placeholder="Escribe aquí…"
                  autoFocus={Boolean(initial.to && initial.subject)}
                  onChange={(html) => {
                    setBodyHtml(html);
                    if (validationError) setValidationError(null);
                  }}
                  onSubmitShortcut={handleSend}
                />
              </div>
            </div>

            {/* Validation feedback */}
            {validationError && (
              <div className="px-7 pb-2 text-[12.5px] text-[var(--accent)]">
                {validationError}
              </div>
            )}

            {/* Quiet Footer with Burgundy Ready-to-Send CTA */}
            <div className="px-7 py-4 border-t border-[var(--hairline)] flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => {
                  onDiscardDraft?.(initial.draftThreadId);
                  onClose();
                }}
                aria-label="Descartar borrador"
                className="p-2 -ml-1 rounded-full text-[var(--ink-muted)] hover:text-[var(--accent)] hover:bg-[var(--surface-hover)] transition-colors sacred-focus cursor-pointer"
                title="Descartar"
              >
                <Trash2 className="w-4 h-4" strokeWidth={1.65} />
              </button>

              <motion.button
                type="button"
                whileHover={readyToSend ? { scale: 1.02 } : undefined}
                whileTap={readyToSend ? { scale: 0.97 } : undefined}
                onClick={handleSend}
                data-ready={readyToSend ? 'true' : 'false'}
                className={`inline-flex items-center gap-2 px-5 py-2 rounded-full text-[13.5px] font-medium transition-all duration-200 sacred-focus whitespace-nowrap cursor-pointer ${
                  readyToSend
                    ? 'bg-[var(--accent)] text-[#fbf8f2] shadow-sm hover:brightness-110'
                    : 'bg-[var(--surface-hover)] text-[var(--ink-muted)]'
                }`}
              >
                <span>Enviar</span>
                <ArrowUp className="w-3.5 h-3.5" strokeWidth={2} />
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
