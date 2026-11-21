import { useEffect, useMemo, useRef, useState } from 'react';
import type { ThemeMode } from '../types/mail';
import { sanitizeEmailHtml } from '../utils/mailStore';

interface InvisibleIframeProps {
  html: string;
  theme: ThemeMode;
  title: string;
}

export function InvisibleIframe({ html, theme, title }: InvisibleIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState<number>(360);

  const sanitized = useMemo(() => sanitizeEmailHtml(html), [html]);

  const srcDoc = useMemo(() => {
    const isDark = theme === 'dark';
    const bg = isDark ? '#12100e' : '#f4efe6';
    const ink = isDark ? '#e8e2d8' : '#2a2621';
    const inkHeading = isDark ? '#f4efe6' : '#1c1915';
    const muted = isDark ? '#8b8277' : '#7c7368';
    const hairline = isDark ? 'rgba(244,239,230,0.1)' : 'rgba(28,25,21,0.1)';
    const accent = isDark ? '#d46b68' : '#7c1d24';

    return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <base href="${typeof window !== 'undefined' ? window.location.origin : ''}/" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        background: ${bg};
        color: ${ink};
        font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 15px;
        line-height: 1.75;
        -webkit-font-smoothing: antialiased;
        overflow: hidden;
      }
      .frame-root {
        padding: 4px 0 12px 0;
      }
      .kicker {
        font-size: 11px;
        font-weight: 500;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: ${accent};
        margin: 0 0 10px 0;
      }
      h1 {
        font-family: "Instrument Serif", Georgia, serif;
        font-size: 34px;
        font-weight: 400;
        line-height: 1.12;
        letter-spacing: -0.015em;
        color: ${inkHeading};
        margin: 0 0 14px 0;
        text-wrap: balance;
      }
      .lead {
        font-size: 15.5px;
        line-height: 1.7;
        color: ${ink};
        margin: 0 0 24px 0;
      }
      p {
        margin: 0 0 16px 0;
      }
      p:last-child {
        margin-bottom: 0;
      }
      figure {
        margin: 24px 0;
      }
      img {
        display: block;
        width: 100%;
        height: auto;
        border-radius: 12px;
        background: ${isDark ? '#1e1b18' : '#e8e1d5'};
      }
      figcaption {
        margin-top: 10px;
        font-size: 12.5px;
        color: ${muted};
      }
      .meta-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 22px;
        padding-top: 16px;
        border-top: 1px solid ${hairline};
        font-size: 12.5px;
        color: ${muted};
      }
      a {
        color: ${accent};
        text-decoration: underline;
        text-underline-offset: 3px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 20px;
        font-variant-numeric: tabular-nums;
      }
      th {
        text-align: left;
        font-size: 12px;
        font-weight: 500;
        color: ${muted};
        padding: 10px 0;
        border-bottom: 1px solid ${hairline};
      }
      td {
        padding: 13px 0;
        border-bottom: 1px solid ${hairline};
        font-size: 14px;
      }
      th.num, td.num {
        text-align: right;
        font-family: "JetBrains Mono", ui-monospace, monospace;
        font-size: 13px;
      }
      tfoot td {
        border-bottom: none;
        padding-top: 16px;
        font-weight: 600;
        color: ${inkHeading};
      }
    </style>
  </head>
  <body>
    <div class="frame-root" id="frame-root">${sanitized}</div>
  </body>
</html>`;
  }, [sanitized, theme]);

  const measureHeight = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (!doc) return;
      const root = doc.getElementById('frame-root');
      const next = Math.max(root ? root.scrollHeight : doc.body.scrollHeight, 120);
      setHeight(next + 10);
    } catch {
      // Fallback height already set
    }
  };

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let observer: ResizeObserver | null = null;
    const attach = () => {
      measureHeight();
      try {
        const doc = iframe.contentDocument;
        const root = doc?.getElementById('frame-root');
        if (root && typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(() => measureHeight());
          observer.observe(root);
        }
        const imgs = doc?.querySelectorAll('img');
        imgs?.forEach((img) => {
          img.addEventListener('load', measureHeight, { once: true });
        });
      } catch {
        // Ignore cross-origin errors
      }
    };

    iframe.addEventListener('load', attach);
    return () => {
      iframe.removeEventListener('load', attach);
      observer?.disconnect();
    };
  }, [srcDoc]);

  return (
    <iframe
      ref={iframeRef}
      title={title}
      srcDoc={srcDoc}
      sandbox="allow-same-origin"
      onLoad={measureHeight}
      style={{ height: `${height}px` }}
      className="w-full border-0 bg-transparent block transition-[height] duration-200 ease-out"
    />
  );
}
