import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { AnimatePresence, motion } from 'motion/react';
import { Bold, Check, Code, Italic, Link2, Quote, X } from 'lucide-react';

interface TipTapFolioProps {
  initialContent?: string;
  placeholder?: string;
  compact?: boolean;
  autoFocus?: boolean;
  ariaLabel?: string;
  onChange: (html: string) => void;
  onSubmitShortcut?: () => void;
}

interface FloatingPos {
  top: number;
  left: number;
  visible: boolean;
}

export function TipTapFolio({
  initialContent = '',
  placeholder = 'Escribe con claridad…',
  compact = false,
  autoFocus = false,
  ariaLabel = 'Cuerpo del mensaje',
  onChange,
  onSubmitShortcut,
}: TipTapFolioProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState<FloatingPos>({ top: 0, left: 0, visible: false });
  const [linkMode, setLinkMode] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        link: {
          openOnClick: false,
          HTMLAttributes: {
            rel: 'noopener noreferrer',
            target: '_blank',
          },
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': ariaLabel,
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          onSubmitShortcut?.();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: instance }) => {
      onChange(instance.getHTML());
    },
  });

  useEffect(() => {
    if (editor && autoFocus) {
      const id = window.setTimeout(() => {
        editor.commands.focus('end');
      }, 60);
      return () => window.clearTimeout(id);
    }
  }, [editor, autoFocus]);

  const updateFloatingMenu = useCallback(() => {
    if (!editor || !containerRef.current) return;
    const { from, to, empty } = editor.state.selection;
    if (empty || from === to) {
      if (!linkMode) {
        setMenuPos((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      }
      return;
    }

    try {
      const start = editor.view.coordsAtPos(from);
      const end = editor.view.coordsAtPos(to);
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = (start.left + end.left) / 2 - rect.left;
      const clampedX = Math.max(108, Math.min(rect.width - 108, centerX));
      const spaceAbove = start.top - rect.top;
      const top = spaceAbove >= 50 ? spaceAbove - 46 : end.bottom - rect.top + 10;

      setMenuPos({
        top,
        left: clampedX,
        visible: true,
      });
    } catch {
      setMenuPos((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    }
  }, [editor, linkMode]);

  useEffect(() => {
    if (!editor) return;
    editor.on('selectionUpdate', updateFloatingMenu);
    editor.on('transaction', updateFloatingMenu);
    return () => {
      editor.off('selectionUpdate', updateFloatingMenu);
      editor.off('transaction', updateFloatingMenu);
    };
  }, [editor, updateFloatingMenu]);

  const applyLink = () => {
    if (!editor) return;
    const trimmed = linkUrl.trim();
    if (!trimmed) {
      editor.chain().focus().unsetLink().run();
    } else {
      const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      editor.chain().focus().setLink({ href }).run();
    }
    setLinkMode(false);
    setLinkUrl('');
  };

  return (
    <div
      ref={containerRef}
      className={`relative dario-editor ${compact ? 'dario-editor-compact' : ''}`}
    >
      {/* Contextual Floating Formatting Menu — appears ONLY when text is selected */}
      <AnimatePresence>
        {editor && menuPos.visible && (
          <motion.div
            key="tiptap-contextual-bar"
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            style={{
              top: menuPos.top,
              left: menuPos.left,
              transform: 'translateX(-50%)',
            }}
            onMouseDown={(e) => {
              // Keep TipTap text selection alive unless typing in URL input
              if (!(e.target instanceof HTMLInputElement)) {
                e.preventDefault();
              }
            }}
            className="absolute z-30 flex items-center gap-0.5 px-1.5 py-1 rounded-xl bg-[var(--surface-elevated)] border border-[var(--hairline-strong)] shadow-[0_12px_32px_rgba(0,0,0,0.28)]"
          >
            {linkMode ? (
              <div className="flex items-center gap-1 px-1">
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applyLink();
                    } else if (e.key === 'Escape') {
                      setLinkMode(false);
                    }
                  }}
                  placeholder="https://…"
                  aria-label="Dirección del enlace"
                  autoFocus
                  className="w-44 bg-transparent text-xs text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] outline-none px-1.5 py-1"
                />
                <button
                  type="button"
                  onClick={applyLink}
                  aria-label="Aplicar enlace"
                  className="p-1.5 rounded-lg text-[var(--accent)] hover:bg-[var(--surface-hover)] cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setLinkMode(false)}
                  aria-label="Cancelar enlace"
                  className="p-1.5 rounded-lg text-[var(--ink-muted)] hover:text-[var(--ink-primary)] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  aria-label="Negrita"
                  aria-pressed={editor.isActive('bold')}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    editor.isActive('bold')
                      ? 'text-[var(--accent)] bg-[var(--surface-hover)]'
                      : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  <Bold className="w-3.5 h-3.5" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  aria-label="Cursiva"
                  aria-pressed={editor.isActive('italic')}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    editor.isActive('italic')
                      ? 'text-[var(--accent)] bg-[var(--surface-hover)]'
                      : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  <Italic className="w-3.5 h-3.5" strokeWidth={1.8} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const prevHref = editor.getAttributes('link').href ?? '';
                    setLinkUrl(prevHref);
                    setLinkMode(true);
                  }}
                  aria-label="Insertar enlace"
                  aria-pressed={editor.isActive('link')}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    editor.isActive('link')
                      ? 'text-[var(--accent)] bg-[var(--surface-hover)]'
                      : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  <Link2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleBlockquote().run()}
                  aria-label="Cita"
                  aria-pressed={editor.isActive('blockquote')}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    editor.isActive('blockquote')
                      ? 'text-[var(--accent)] bg-[var(--surface-hover)]'
                      : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  <Quote className="w-3.5 h-3.5" strokeWidth={1.8} />
                </button>
                <button
                  type="button"
                  onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                  aria-label="Bloque de código"
                  aria-pressed={editor.isActive('codeBlock')}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    editor.isActive('codeBlock')
                      ? 'text-[var(--accent)] bg-[var(--surface-hover)]'
                      : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  <Code className="w-3.5 h-3.5" strokeWidth={1.8} />
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <EditorContent editor={editor} />
    </div>
  );
}
