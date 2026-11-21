import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Search } from 'lucide-react';
import type { CommandItem } from '../types/mail';
import { filterCommands } from '../utils/mailStore';

interface CommandPaletteProps {
  open: boolean;
  commands: CommandItem[];
  onClose: () => void;
}

export function CommandPalette({ open, commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => filterCommands(commands, query), [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      const id = window.setTimeout(() => inputRef.current?.focus(), 20);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (filtered.length > 0 ? (prev + 1) % filtered.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) =>
          filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0
        );
      } else if (e.key === 'Enter' && filtered[activeIndex]) {
        e.preventDefault();
        filtered[activeIndex].run();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, filtered, activeIndex, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="cmd-palette-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh] px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Paleta de comandos"
        >
          {/* Instant Radial Backdrop Blur */}
          <div
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-md"
          />

          {/* Radial Opening Command Window */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -6 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 w-full max-w-[560px] rounded-2xl floating-monolith overflow-hidden"
          >
            {/* Precision Search Input */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--hairline)] bg-[var(--surface-input)]">
              <Search className="w-4 h-4 text-[var(--accent)] shrink-0" strokeWidth={1.7} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Comando o búsqueda…"
                aria-label="Escribir comando o búsqueda"
                className="flex-1 bg-transparent text-[15.5px] text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] outline-none caret-[var(--accent)]"
              />
              <kbd className="font-mono text-[11px] text-[var(--ink-muted)]">Esc</kbd>
            </div>

            {/* Liquid Option List */}
            <div className="max-h-[360px] overflow-y-auto p-2.5">
              {filtered.length === 0 ? (
                <div className="py-10 text-center text-[13.5px] text-[var(--ink-muted)]">
                  Sin comandos coincidentes para «{query}»
                </div>
              ) : (
                <ul role="listbox" aria-label="Comandos disponibles" className="space-y-0.5">
                  {filtered.map((item, idx) => {
                    const isSelected = idx === activeIndex;
                    return (
                      <li key={item.id} role="option" aria-selected={isSelected} className="relative">
                        {isSelected && (
                          <>
                            <motion.div
                              layoutId="cmd-liquid-selector"
                              transition={{
                                type: 'spring',
                                stiffness: 420,
                                damping: 30,
                                mass: 0.8,
                              }}
                              aria-hidden="true"
                              className="absolute inset-0 rounded-xl bg-[var(--surface-liquid)]"
                            />
                            <motion.span
                              layoutId="cmd-sacred-rail"
                              transition={{
                                type: 'spring',
                                stiffness: 460,
                                damping: 32,
                              }}
                              aria-hidden="true"
                              className="absolute left-0 top-2.5 bottom-2.5 w-[1.5px] rounded-full bg-[var(--accent)]"
                            />
                          </>
                        )}

                        <button
                          type="button"
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => {
                            item.run();
                            onClose();
                          }}
                          className="relative z-10 w-full flex items-center justify-between gap-4 px-4 py-2.5 rounded-xl text-left transition-colors cursor-pointer"
                        >
                          <div className="min-w-0">
                            <span
                              className={`block text-[14px] truncate ${
                                isSelected
                                  ? 'text-[var(--ink-primary)] font-medium'
                                  : 'text-[var(--ink-secondary)]'
                              }`}
                            >
                              {item.label}
                            </span>
                            {item.hint && (
                              <span className="block text-[12px] text-[var(--ink-muted)] truncate mt-0.5">
                                {item.hint}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0">
                            <span className="text-[11px] text-[var(--ink-muted)]">
                              {item.group}
                            </span>
                            {item.shortcut ? (
                              <kbd className="font-mono text-[11px] text-[var(--ink-muted)] tabular-nums">
                                {item.shortcut}
                              </kbd>
                            ) : (
                              isSelected && (
                                <ArrowRight
                                  className="w-3.5 h-3.5 text-[var(--accent)]"
                                  strokeWidth={1.7}
                                />
                              )
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
