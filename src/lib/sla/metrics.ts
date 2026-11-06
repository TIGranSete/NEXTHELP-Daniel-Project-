/**
 * Indicadores de SLA. Funções puras sobre uma lista de chamados já filtrada
 * (período e permissões são aplicados por quem chama, uma única vez).
 *
 * EFICIÊNCIA (resolução) = 100 × resolvidos no prazo / resolvidos avaliáveis.
 *  - Usa a PRIMEIRA resolução de cada chamado (SLA original). Resolvido → Fechado e
 *    reaberturas não geram novos chamados nem alteram o resultado original.
 *  - Resolvido atrasado ENTRA no denominador. Denominador zero ⇒ `pct: null` ("Sem dados").
 *  - Chamados abertos e vencidos aparecem no indicador operacional `openOverdue`, não aqui.
 *
 * REABERTURA = 100 × chamados distintos reabertos / chamados distintos resolvidos (coorte).
 *  - O período é aplicado pelo chamador sobre os chamados (data de abertura); a coorte é o
 *    conjunto de chamados do período que já tiveram a primeira resolução.
 *  - Mesmo chamado reaberto várias vezes conta uma vez na taxa; cada ciclo conta em `cycles`.
 *
 * Projetos (prazo próprio) e prioridades sem meta ficam fora. Chamados criados antes da
 * ativação da política (`era: "legacy"`) são excluídos e contados à parte.
 */
import type { Ticket } from "../../types";
import { REOPEN_LABEL } from "./config";
import { SlaContext, TicketSla, computeTicketSla } from "./ticketSla";

export interface RateResult {
  evaluated: number;
  met: number;
  breached: number;
  /** 0–100, ou `null` quando não há chamados avaliáveis. */
  pct: number | null;
}

export interface ReopeningMetrics {
  /** Chamados distintos com primeira resolução. */
  cohort: number;
  reopenedTickets: number;
  pct: number | null;
  cycles: number;
  completedCycles: number;
  /** Tempo útil médio de correção (ciclos concluídos). `null` sem dados. */
  avgCorrectionMin: number | null;
  currentlyReopened: number;
  /** Motivos mais frequentes (rótulo → quantidade), ordenados. */
  topReasons: { label: string; count: number }[];
  /** Reaberturas sem motivo registrado (detectadas só no log antigo). */
  withoutReason: number;
}

export interface SlaMetrics {
  firstResponse: RateResult;
  /** SLA de resolução ORIGINAL. */
  resolution: RateResult & { withoutReliableDate: number };
  /** Abertos (sem resolução original) com a resolução vencida. */
  openOverdue: number;
  /** Abertos em risco (resolução, ou primeira resposta ainda pendente). */
  nearDue: number;
  waitingRequester: number;
  /** Resolvidos fora do prazo (= resolution.breached). */
  resolvedLate: number;
  /** Tempo útil médio de resolução (original). */
  avgResolutionMin: number | null;
  reopening: ReopeningMetrics;
  /** Chamados com trilha de eventos inconsistente. */
  integrityIssues: number;
  considered: number;
  /** Fora do SLA (projetos / prioridade sem meta). */
  skipped: number;
  /** Criados antes da ativação da política: preservados, fora do cálculo. */
  legacyExcluded: number;
  /** `true` enquanto a política não foi ativada em produção (resultados são pré-visualização). */
  previewMode: boolean;
}

const rate = (met: number, breached: number): RateResult => {
  const evaluated = met + breached;
  return { evaluated, met, breached, pct: evaluated > 0 ? Math.round((100 * met) / evaluated) : null };
};

export function computeSlaMetrics(tickets: Ticket[], nowMs: number, ctx: SlaContext = {}): SlaMetrics {
  const seen = new Set<string>();
  let frMet = 0, frBreached = 0, rMet = 0, rBreached = 0, rNoDate = 0;
  let openOverdue = 0, nearDue = 0, waiting = 0, considered = 0, skipped = 0, legacy = 0, integrity = 0;
  let resSum = 0, resCount = 0;
  let cohort = 0, reopenedTickets = 0, cycles = 0, completed = 0, correctionSum = 0, currentlyReopened = 0, withoutReason = 0;
  const reasons = new Map<string, number>();
  let previewMode = true;

  for (const t of tickets) {
    if (!t || seen.has(t.id)) continue;
    seen.add(t.id);
    const sla: TicketSla = computeTicketSla(t, nowMs, ctx);
    previewMode = sla.era === "preview";
    if (!sla.applicable) { skipped++; continue; }
    if (sla.era === "legacy") { legacy++; continue; }
    considered++;
    if (!sla.integrity.ok) integrity++;

    if (sla.firstResponse.state === "met") frMet++;
    else if (sla.firstResponse.state === "breached") frBreached++;

    const r = sla.resolution;
    const finalNow = t.status === "Resolvido" || t.status === "Fechado";
    if (r.resolvedAt !== null) {
      // SLA original: primeira resolução, uma única vez por chamado
      if (r.state === "met") rMet++;
      else if (r.state === "breached") rBreached++;
      resSum += r.consumedMin;
      resCount++;
      cohort++;
      if (sla.cycles.length > 0) reopenedTickets++;
    } else if (finalNow) {
      rNoDate++;
    } else {
      if (r.state === "breached") openOverdue++;
      if (r.state === "at_risk" || (sla.firstResponse.endedAt === null && sla.firstResponse.state === "at_risk")) nearDue++;
    }
    if (sla.waitingRequester) waiting++;

    for (const c of sla.cycles) {
      cycles++;
      if (c.ongoing) currentlyReopened++;
      else { completed++; correctionSum += c.correctionMin; }
      if (c.category) reasons.set(REOPEN_LABEL[c.category] ?? c.category, (reasons.get(REOPEN_LABEL[c.category] ?? c.category) ?? 0) + 1);
      else withoutReason++;
    }
  }

  return {
    firstResponse: rate(frMet, frBreached),
    resolution: { ...rate(rMet, rBreached), withoutReliableDate: rNoDate },
    openOverdue,
    nearDue,
    waitingRequester: waiting,
    resolvedLate: rBreached,
    avgResolutionMin: resCount > 0 ? resSum / resCount : null,
    reopening: {
      cohort,
      reopenedTickets,
      pct: cohort > 0 ? Math.round((100 * reopenedTickets) / cohort) : null,
      cycles,
      completedCycles: completed,
      avgCorrectionMin: completed > 0 ? correctionSum / completed : null,
      currentlyReopened,
      topReasons: [...reasons.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
      withoutReason,
    },
    integrityIssues: integrity,
    considered,
    skipped,
    legacyExcluded: legacy,
    previewMode,
  };
}
