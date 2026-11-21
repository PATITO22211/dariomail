import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Archive,
  Command,
  FileEdit,
  Inbox,
  Moon,
  PenLine,
  Send,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import type { FolderId, ThemeMode } from '../types/mail';
import { FOLDER_META } from '../utils/mailStore';

interface LiquidSidebarProps {
  activeFolder: FolderId;
  counts: Record<FolderId, number>;
  theme: ThemeMode;
  mobileOpen: boolean;
  hiddenForDeepReading: boolean;
  onSelectFolder: (folder: FolderId) => void;
  onOpenCompose: () => void;
  onOpenCommandPalette: () => void;
  onToggleTheme: () => void;
  onCloseMobile: () => void;
}

const FOLDERS: Array<{ id: FolderId; icon: typeof Inbox }> = [
  { id: 'inbox', icon: Inbox },
  { id: 'sent', icon: Send },
  { id: 'drafts', icon: FileEdit },
  { id: 'archive', icon: Archive },
  { id: 'trash', icon: Trash2 },
];

export function LiquidSidebar({
  activeFolder,
  counts,
  theme,
  mobileOpen,
  hiddenForDeepReading,
  onSelectFolder,
  onOpenCompose,
  onOpenCommandPalette,
  onToggleTheme,
  onCloseMobile,
}: LiquidSidebarProps) {
  const [hoveredFolder, setHoveredFolder] = useState<FolderId | null>(null);
  const liquidTarget = hoveredFolder ?? activeFolder;

  return (
    <>
      {/* Desktop Ultra-Compact Floating Vertical Dock (h-fit, centered on left edge) */}
      <AnimatePresence initial={false}>
        {!hiddenForDeepReading && (
          <motion.aside
            key="floating-dock-desktop"
            initial={{ opacity: 0, x: -32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            aria-label="Navegación principal"
            className="hidden md:flex fixed left-5 top-1/2 -translate-y-1/2 z-30 flex-col items-center py-2.5 px-2 rounded-[26px] floating-monolith select-none"
          >
            {/* Primary Obsidian Compose Orb (echoing dariomsi.com high-contrast button) */}
            <motion.button
              type="button"
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              onClick={onOpenCompose}
              aria-label="Redactar nuevo correo"
              title="Redactar (C)"
              className="w-10 h-10 rounded-full bg-[var(--cta-bg)] text-[var(--cta-ink)] flex items-center justify-center shadow-sm hover:opacity-90 transition-opacity sacred-focus cursor-pointer"
            >
              <PenLine className="w-[16px] h-[16px]" strokeWidth={1.8} />
            </motion.button>

            <span
              aria-hidden="true"
              className="w-5 h-[1px] bg-[var(--hairline-strong)] my-2.5"
            />

            {/* Liquid Icon Folder Stack */}
            <nav
              aria-label="Carpetas de correo"
              onMouseLeave={() => setHoveredFolder(null)}
            >
              <ul className="flex flex-col items-center gap-1">
                {FOLDERS.map(({ id, icon: Icon }) => {
                  const isActive = activeFolder === id;
                  const isLiquidHere = liquidTarget === id;
                  const count = counts[id];
                  const meta = FOLDER_META[id];

                  return (
                    <li key={id} className="relative group">
                      {isLiquidHere && (
                        <motion.div
                          layoutId="dario-dock-liquid"
                          transition={{
                            type: 'spring',
                            stiffness: 420,
                            damping: 30,
                            mass: 0.75,
                          }}
                          aria-hidden="true"
                          className="absolute inset-0 rounded-full bg-[var(--surface-liquid)]"
                        />
                      )}

                      {isActive && (
                        <motion.span
                          layoutId="dario-dock-accent-dot"
                          transition={{
                            type: 'spring',
                            stiffness: 460,
                            damping: 32,
                          }}
                          aria-hidden="true"
                          className="absolute -left-1 top-1/2 -translate-y-1/2 w-[3px] h-3.5 rounded-full bg-[var(--accent)]"
                        />
                      )}

                      <button
                        type="button"
                        aria-label={count > 0 ? `${meta.label} (${count})` : meta.label}
                        aria-current={isActive ? 'page' : undefined}
                        onMouseEnter={() => setHoveredFolder(id)}
                        onClick={() => onSelectFolder(id)}
                        className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center transition-colors sacred-focus cursor-pointer ${
                          isActive
                            ? 'text-[var(--ink-primary)]'
                            : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
                        }`}
                      >
                        <Icon
                          className="w-[17px] h-[17px]"
                          strokeWidth={isActive ? 1.9 : 1.55}
                        />
                        {count > 0 && id === 'inbox' && (
                          <span
                            aria-hidden="true"
                            className="absolute top-2 right-2 w-[6px] h-[6px] rounded-full bg-[var(--accent)]"
                          />
                        )}
                      </button>

                      {/* Crisp Hover Tooltip to the Right */}
                      <div
                        role="tooltip"
                        className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-full bg-[var(--cta-bg)] text-[var(--cta-ink)] text-[12px] font-medium whitespace-nowrap opacity-0 translate-x-[-4px] group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 shadow-md flex items-center gap-2"
                      >
                        <span>{meta.label}</span>
                        {count > 0 && (
                          <span className="font-mono text-[10.5px] opacity-75 tabular-nums">
                            {count}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <span
              aria-hidden="true"
              className="w-5 h-[1px] bg-[var(--hairline-strong)] my-2.5"
            />

            {/* Utility Triggers: Command Palette & Theme */}
            <div className="flex flex-col items-center gap-1">
              <div className="relative group">
                <button
                  type="button"
                  onClick={onOpenCommandPalette}
                  aria-label="Abrir paleta de comandos"
                  className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] transition-colors sacred-focus cursor-pointer"
                >
                  <Command className="w-[16px] h-[16px]" strokeWidth={1.6} />
                </button>
                <div
                  role="tooltip"
                  className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-full bg-[var(--cta-bg)] text-[var(--cta-ink)] text-[12px] font-medium whitespace-nowrap opacity-0 translate-x-[-4px] group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 shadow-md flex items-center gap-1.5"
                >
                  <span>Comandos</span>
                  <kbd className="font-mono text-[10px] opacity-70">⌘K</kbd>
                </div>
              </div>

              <div className="relative group">
                <button
                  type="button"
                  onClick={onToggleTheme}
                  aria-label={
                    theme === 'dark' ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'
                  }
                  className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] transition-colors sacred-focus cursor-pointer"
                >
                  {theme === 'dark' ? (
                    <Sun className="w-[16px] h-[16px]" strokeWidth={1.6} />
                  ) : (
                    <Moon className="w-[16px] h-[16px]" strokeWidth={1.6} />
                  )}
                </button>
                <div
                  role="tooltip"
                  className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-full bg-[var(--cta-bg)] text-[var(--cta-ink)] text-[12px] font-medium whitespace-nowrap opacity-0 translate-x-[-4px] group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 shadow-md"
                >
                  {theme === 'dark' ? 'Papel claro' : 'Oscuro'}
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Mobile Compact Floating Sheet */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            key="mobile-sidebar-root"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-40 md:hidden flex p-3"
          >
            <div
              onClick={onCloseMobile}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: -240, opacity: 0.7 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -240, opacity: 0.7 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              className="relative z-10 w-[232px] max-w-[78vw] h-fit my-auto rounded-3xl floating-monolith p-4 space-y-4"
            >
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[var(--accent)]">
                  DARIO MSI
                </span>
                <button
                  type="button"
                  onClick={onCloseMobile}
                  aria-label="Cerrar menú"
                  className="p-1.5 rounded-full text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] sacred-focus"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <nav aria-label="Carpetas móvil">
                <ul className="space-y-1">
                  {FOLDERS.map(({ id, icon: Icon }) => {
                    const isActive = activeFolder === id;
                    const count = counts[id];
                    const meta = FOLDER_META[id];
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => {
                            onSelectFolder(id);
                            onCloseMobile();
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13.5px] transition-colors ${
                            isActive
                              ? 'bg-[var(--surface-liquid)] text-[var(--ink-primary)] font-medium'
                              : 'text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)]'
                          }`}
                        >
                          <span className="flex items-center gap-3">
                            <Icon className="w-4 h-4" strokeWidth={1.6} />
                            <span>{meta.label}</span>
                          </span>
                          {count > 0 && (
                            <span className="font-mono text-[11px] tabular-nums text-[var(--accent)]">
                              {count}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </nav>

              <div className="pt-3 border-t border-[var(--hairline)] flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onOpenCommandPalette();
                    onCloseMobile();
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-[var(--surface-hover)] text-[12.5px] text-[var(--ink-primary)]"
                >
                  <Command className="w-3.5 h-3.5" />
                  <span>⌘K</span>
                </button>
                <button
                  type="button"
                  onClick={onToggleTheme}
                  aria-label={theme === 'dark' ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
                  className="p-2 rounded-xl bg-[var(--surface-hover)] text-[var(--ink-primary)]"
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
