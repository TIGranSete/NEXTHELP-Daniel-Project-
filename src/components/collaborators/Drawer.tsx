import React, { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const EASE = [0.22, 1, 0.36, 1] as const;

interface DrawerProps {
  ariaLabel: string;
  onClose: () => void;
  /** Elemento que abriu o painel; o foco volta para ele ao fechar (senão, o elemento focado ao abrir). */
  restoreFocusTo?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}

/**
 * Painel lateral modal (Gran7 Profile Reveal): entra pela direita (~28 px), opacidade 0→1, ~300 ms.
 * O diretório continua visível ao fundo sob um overlay discreto. Acessibilidade: role=dialog,
 * aria-modal, Esc fecha, foco preso no painel e devolvido ao botão de origem, prefers-reduced-motion.
 */
export default function Drawer({ ariaLabel, onClose, restoreFocusTo, children }: DrawerProps) {
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLElement>(null);
  const [opener] = useState<Element | null>(() => (typeof document !== "undefined" ? document.activeElement : null));
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const restoreFocus = () => {
    const target = restoreFocusTo?.current ?? (opener instanceof HTMLElement ? opener : null);
    if (target && document.contains(target)) target.focus({ preventScroll: true });
  };
  const close = () => {
    restoreFocus();
    closeRef.current();
  };

  // foco inicial no painel (primeiro controle) e restauração na saída
  useEffect(() => {
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panelRef.current)?.focus({ preventScroll: true });
    return () => restoreFocus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc fecha; Tab fica dentro do painel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const nodes = Array.from<HTMLElement>(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
      if (nodes.length === 0) {
        e.preventDefault();
        return;
      }
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
    return () => document.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fade = { duration: reduce ? 0.01 : 0.22, ease: EASE };
  return (
    <div className="fixed inset-0 z-50" data-testid="profile-drawer">
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 bg-black/25"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={fade}
        onClick={close}
      />
      <motion.aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className="absolute right-0 top-0 h-full w-full sm:w-[460px] max-w-full bg-app border-l border-default shadow-raised flex flex-col outline-none"
        initial={{ x: reduce ? 0 : 28, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: reduce ? 0 : 20, opacity: 0 }}
        transition={{ duration: reduce ? 0.01 : 0.3, ease: EASE }}
      >
        {children}
      </motion.aside>
    </div>
  );
}

export { EASE as DRAWER_EASE };
