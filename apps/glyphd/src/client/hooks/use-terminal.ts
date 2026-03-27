import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { CanvasAddon } from "@xterm/addon-canvas";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import { ClipboardAddon } from "@xterm/addon-clipboard";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebFontsAddon } from "@xterm/addon-web-fonts";

const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent) ||
  (/iPad|iPhone|iPod/.test(navigator.userAgent)) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const FONT_FAMILY = '"Geist Mono", ui-monospace, SFMono-Regular, monospace';

const THEME = {
  background:          "#09090b",
  foreground:          "#e4e4e7",
  cursor:              "#a1a1aa",
  cursorAccent:        "#09090b",
  selectionBackground: "#3f3f4699",
  selectionForeground: "#e4e4e7",
  black:               "#18181b",
  red:                 "#f87171",
  green:               "#4ade80",
  yellow:              "#facc15",
  blue:                "#60a5fa",
  magenta:             "#c084fc",
  cyan:                "#22d3ee",
  white:               "#d4d4d8",
  brightBlack:         "#3f3f46",
  brightRed:           "#fca5a5",
  brightGreen:         "#86efac",
  brightYellow:        "#fde047",
  brightBlue:          "#93c5fd",
  brightMagenta:       "#d8b4fe",
  brightCyan:          "#67e8f9",
  brightWhite:         "#f4f4f5",
};

interface UseTerminalOptions {
  fontSize: number;
  onData: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
}

export function useTerminal({ fontSize, onData, onResize }: UseTerminalOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);

  // Keep callbacks in refs so we never need to re-create the terminal when they change
  const onDataRef = useRef(onData);
  const onResizeRef = useRef(onResize);
  useEffect(() => { onDataRef.current = onData; }, [onData]);
  useEffect(() => { onResizeRef.current = onResize; }, [onResize]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize,
      lineHeight: 1.4,
      letterSpacing: 1,
      fontFamily: FONT_FAMILY,
      scrollback: 5000,
      allowProposedApi: true,
      theme: THEME,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.loadAddon(new WebLinksAddon());
    term.loadAddon(new ClipboardAddon());

    // Unicode 11 for correct CJK/emoji widths
    const unicode11 = new Unicode11Addon();
    term.loadAddon(unicode11);
    term.unicode.activeVersion = "11";

    term.open(container);

    // Load web fonts, then re-fit once Geist Mono is ready
    const webFonts = new WebFontsAddon();
    term.loadAddon(webFonts);
    webFonts.loadFonts().then(() => fitAddon.fit());

    fitAddon.fit();

    // GPU-accelerated rendering: WebGL on desktop, Canvas on Safari/iOS
    if (isSafari) {
      try { term.loadAddon(new CanvasAddon()); } catch {}
    } else {
      try {
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => {
          webgl.dispose();
          try { term.loadAddon(new CanvasAddon()); } catch {}
        });
        term.loadAddon(webgl);
      } catch {
        try { term.loadAddon(new CanvasAddon()); } catch {}
      }
    }

    const d1 = term.onData((data) => onDataRef.current(data));
    const d2 = term.onResize(({ cols, rows }) => onResizeRef.current(cols, rows));

    termRef.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    return () => {
      d1.dispose();
      d2.dispose();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, []); // only on mount/unmount — fontSize is handled below

  // Update font size without recreating the terminal
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.fontSize = fontSize;
      fitAddonRef.current?.fit();
    }
  }, [fontSize]);

  return {
    containerRef,
    fit: () => fitAddonRef.current?.fit(),
    write: (data: Uint8Array | string) => termRef.current?.write(data),
    focus: () => termRef.current?.focus(),
    getDimensions: () => ({
      cols: termRef.current?.cols ?? 80,
      rows: termRef.current?.rows ?? 24,
    }),
    searchNext: (query: string) => searchAddonRef.current?.findNext(query),
    searchPrevious: (query: string) => searchAddonRef.current?.findPrevious(query),
  };
}
