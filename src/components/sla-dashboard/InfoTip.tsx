import React, { useId, useState } from "react";
import { Info } from "lucide-react";

/** Ícone "i" com explicação do indicador (hover, foco e toque). O texto descreve a base de cálculo; não recalcula nada. */
export default function InfoTip({ label, text }: { label: string; text: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={`Sobre ${label}`}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className="h-4 w-4 inline-flex items-center justify-center rounded-full text-muted hover:text-primary focus-visible:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 cursor-help"
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <span
          role="tooltip"
          id={id}
          className="absolute z-30 left-0 sm:left-1/2 sm:-translate-x-1/2 top-full mt-1.5 w-60 max-w-[70vw] rounded-lg border border-default bg-surface shadow-raised p-2.5 text-[11.5px] font-normal normal-case tracking-normal text-secondary leading-snug text-left"
        >
          {text}
        </span>
      )}
    </span>
  );
}
