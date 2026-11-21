import { X } from 'lucide-react';
import type { ComposeAttachment } from '../types/mail';

export function AttachmentChips({
  items,
  onRemove,
}: {
  items: ComposeAttachment[];
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item.id}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--hairline)] px-3 py-1 text-[12.5px] text-[var(--ink-secondary)]"
        >
          <span className="text-[var(--ink-primary)] max-w-[180px] truncate">{item.name}</span>
          <span className="font-mono text-[11px] tabular-nums text-[var(--ink-muted)]">{item.sizeLabel}</span>
          <button
            type="button"
            aria-label={`Quitar ${item.name}`}
            onClick={() => onRemove(item.id)}
            className="text-[var(--ink-muted)] hover:text-[var(--accent)] cursor-pointer"
          >
            <X className="w-3 h-3" strokeWidth={1.8} />
          </button>
        </span>
      ))}
    </div>
  );
}
