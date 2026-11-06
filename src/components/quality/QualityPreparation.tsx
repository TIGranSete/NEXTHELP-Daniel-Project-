import React from "react";
import { ClipboardCheck } from "lucide-react";
import { QUALITY_REVIEW_STATES } from "../../lib/quality";

const chip = "inline-flex items-center h-6 px-2 rounded-md border border-default bg-surface-2 text-xs text-muted";

/** Os quatro estados previstos, apenas informativos (nenhuma ação, nenhum dado). */
function FutureStates() {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Estados previstos para a avaliação futura">
      {QUALITY_REVIEW_STATES.map((s) => (
        <li key={s.value} className={chip} aria-disabled="true">{s.label}</li>
      ))}
    </ul>
  );
}

/**
 * Avaliação de qualidade — EM PREPARAÇÃO. Estrutura visual apenas: não registra, não calcula e não
 * classifica nada. Fica separada do SLA e do histórico de reaberturas.
 */
export default function QualityPreparation() {
  return (
    <div className="rounded-lg border border-dashed border-default bg-surface-2/40 px-3 py-2.5" data-testid="quality-preparation">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h4 className="flex items-center gap-1.5 text-[12px] font-semibold text-secondary">
          <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />Avaliação de qualidade
        </h4>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-default bg-surface text-muted">em preparação</span>
      </div>
      <p className="text-[11.5px] text-muted leading-snug mb-2">
        Análise gerencial contextual, <strong className="font-medium text-secondary">separada do SLA</strong>. Ainda não disponível: nenhuma avaliação é registrada nem calculada automaticamente, e a reabertura não gera avaliação negativa.
      </p>
      <FutureStates />
      <p className="text-[11px] text-muted leading-snug mt-2">Quando ativada, registrará gestor responsável, data, justificativa e histórico de alterações.</p>
    </div>
  );
}
