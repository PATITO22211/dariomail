import { motion } from 'motion/react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  dangerous?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  dangerous = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Cerrar diálogo"
        className="absolute inset-0 bg-black/55"
        onClick={onCancel}
      />
      <motion.div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="relative w-full max-w-md rounded-2xl border border-[var(--hairline-strong)] bg-[var(--surface-elevated)] p-6 shadow-[var(--float-shadow)]"
      >
        <h2
          id="confirm-title"
          className="text-[22px] leading-tight text-[var(--ink-primary)] mb-2"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          {title}
        </h2>
        <p id="confirm-message" className="text-[14px] text-[var(--ink-muted)] leading-relaxed mb-6">
          {message}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-full border border-[var(--hairline-strong)] text-[13px] text-[var(--ink-primary)] sacred-focus cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 rounded-full text-[13px] font-medium sacred-focus cursor-pointer ${
              dangerous
                ? 'bg-[var(--destructive-bg)] text-[var(--destructive-ink)]'
                : 'bg-[var(--cta-bg)] text-[var(--cta-ink)]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
}