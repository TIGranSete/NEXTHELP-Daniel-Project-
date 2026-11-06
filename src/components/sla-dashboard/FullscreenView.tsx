import React, { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Minimize2 } from "lucide-react";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Altura útil da janela (para o gráfico ocupar a tela cheia sem rolagem). */
export function useWindowHeight(): number {
  const [h, setH] = useState(() => (typeof window === "undefined" ? 800 : window.innerHeight));
  useEffect(() => {
    const on = () => setH(window.innerHeight);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return h;
}

interface Props {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Visualização em tela cheia de um gráfico (cobre toda a janela do app).
 * Acessibilidade: role=dialog, Esc fecha, foco preso e devolvido ao botão de origem, rolagem da página travada.
 */
export default function FullscreenView({ title, subtitle, onClose, children }: Props) {
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const [opener] = useState<Element | null>(() => (typeof document !== "undefined" ? document.activeElement : null));
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    closeBtn.current?.focus({ preventScroll: true });
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const nodes = Array.from<HTMLElement>(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panelRef.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} em tela cheia`}
      className="fixed inset-0 z-[60] bg-app flex flex-col"
      data-testid="chart-fullscreen"
      initial={{ opacity: 0, scale: reduce ? 1 : 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: reduce ? 0.01 : 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-center justify-between gap-4 px-5 sm:px-8 py-4 border-b border-default bg-surface">
        <div className="min-w-0">
          <h2 className="font-display text-xl sm:text-2xl font-bold text-primary truncate">{title}</h2>
          {subtitle && <p className="text-sm text-secondary truncate">{subtitle}</p>}
        </div>
        <button
          ref={closeBtn}
          type="button"
          onClick={onClose}
          className="h-10 px-4 shrink-0 inline-flex items-center gap-2 rounded-lg border border-default bg-surface hover:bg-surface-2 text-sm font-medium text-primary transition-colors duration-150 cursor-pointer"
        >
          <Minimize2 className="h-4 w-4" aria-hidden />
          Sair da tela cheia
          <kbd className="hidden sm:inline text-[11px] text-muted border border-default rounded px-1.5 py-0.5">Esc</kbd>
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-5 sm:p-8">{children}</div>
    </motion.div>
  );
}
