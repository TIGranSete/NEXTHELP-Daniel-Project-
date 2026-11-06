import React, { useEffect, useRef, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import type { ReopenCategory } from "../../types";
import { REOPEN_CATEGORIES, REOPEN_MIN_REASON_LENGTH } from "../../lib/sla/config";

interface Props {
  ticketId: string;
  onCancel: () => void;
  onConfirm: (category: ReopenCategory, reason: string) => void;
}

/**
 * Reabertura: categoria e justificativa descritiva são obrigatórias (política de SLA).
 * Reabrir NÃO reinicia o SLA original — abre um ciclo de correção separado.
 */
export default function ReopenDialog({ ticketId, onCancel, onConfirm }: Props) {
  const [category, setCategory] = useState<ReopenCategory | "">("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const reasonOk = reason.trim().length >= REOPEN_MIN_REASON_LENGTH;
  const valid = category !== "" && reasonOk;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reopen-title"
        className="w-full max-w-md rounded-xl border border-default bg-surface shadow-raised p-5"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onCancel();
          }
        }}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 id="reopen-title" className="flex items-center gap-2 text-base font-semibold text-primary">
            <RotateCcw className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
            Reabrir chamado #{ticketId}
          </h2>
          <button type="button" onClick={onCancel} aria-label="Fechar" className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-secondary hover:bg-surface-2 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-[13px] text-secondary mb-4 leading-relaxed">
          A reabertura <strong>não reinicia o SLA original</strong>: o resultado da primeira resolução é preservado e o tempo útil de correção é medido à parte.
        </p>

        <label className="block text-xs font-semibold text-secondary mb-1" htmlFor="reopen-category">Categoria *</label>
        <select
          id="reopen-category"
          ref={ref}
          value={category}
          onChange={(e) => setCategory(e.target.value as ReopenCategory)}
          className="h-9 w-full bg-surface border border-default rounded-lg px-2.5 text-sm text-primary focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 cursor-pointer mb-3"
        >
          <option value="">Selecione…</option>
          {REOPEN_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>

        <label className="block text-xs font-semibold text-secondary mb-1" htmlFor="reopen-reason">Justificativa descritiva *</label>
        <textarea
          id="reopen-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          maxLength={500}
          placeholder="Descreva o que ainda precisa ser corrigido…"
          className="w-full bg-surface border border-default rounded-lg px-2.5 py-2 text-sm text-primary focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 resize-none"
        />
        <p className={`text-[11px] mt-1 ${reason.length > 0 && !reasonOk ? "text-rose-600 dark:text-rose-400" : "text-muted"}`}>
          Mínimo de {REOPEN_MIN_REASON_LENGTH} caracteres ({reason.trim().length}/{REOPEN_MIN_REASON_LENGTH}).
        </p>

        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onCancel} className="h-9 px-3.5 rounded-lg border border-default bg-surface hover:bg-surface-2 text-sm font-medium text-secondary cursor-pointer">Cancelar</button>
          <button
            type="button"
            disabled={!valid || busy}
            onClick={() => {
              if (!valid || category === "") return;
              setBusy(true);
              onConfirm(category, reason.trim());
            }}
            className="h-9 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Reabrir chamado
          </button>
        </div>
      </div>
    </div>
  );
}
