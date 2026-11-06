import React, { useLayoutEffect, useState } from "react";
import { motion } from "motion/react";
import { REVEAL } from "./workspaceReveal";

export interface ExpandOrigin {
  id: string;
  title: string;
  rect: { top: number; left: number; width: number; height: number };
}

/**
 * Overlay temporário da transição "Workspace Reveal": uma cópia leve da linha
 * clicada que se desloca e redimensiona até o cabeçalho do workspace
 * (#g7-ticket-header-anchor) e desaparece ali. É puramente visual
 * (pointer-events: none) e se remove sozinho ao terminar — nunca bloqueia cliques.
 */
export default function TicketExpandOverlay({ origin, onDone }: { origin: ExpandOrigin; onDone: () => void }) {
  const [target, setTarget] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    let tries = 0;
    let raf = 0;
    const measure = () => {
      const el = document.getElementById("g7-ticket-header-anchor");
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 0) {
          setTarget({ top: r.top, left: r.left, width: r.width, height: r.height });
          return;
        }
      }
      // o workspace ainda está montando: tenta por alguns quadros e desiste sem animar
      if (++tries > 20) onDone();
      else raf = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(raf);
  }, [onDone]);

  if (!target) return null;
  const o = origin.rect;
  return (
    <motion.div
      aria-hidden
      className="fixed z-[60] pointer-events-none overflow-hidden rounded-xl border border-emerald-500/40 bg-surface shadow-raised flex items-center gap-3 px-4"
      initial={{ top: o.top, left: o.left, width: o.width, height: o.height, opacity: 1 }}
      animate={{
        top: target.top,
        left: target.left,
        width: target.width,
        height: target.height,
        opacity: [1, 1, 0],
      }}
      transition={{
        duration: REVEAL.expand.duration,
        ease: REVEAL.ease,
        opacity: { duration: REVEAL.expand.duration, times: [0, 0.62, 1], ease: "linear" },
      }}
      onAnimationComplete={onDone}
    >
      <span className="shrink-0 font-mono text-xs px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold">#{origin.id}</span>
      <span className="truncate font-display text-sm font-bold text-primary">{origin.title}</span>
    </motion.div>
  );
}
