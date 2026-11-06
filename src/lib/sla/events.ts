/**
 * Trilha de eventos de SLA: utilitários puros (servidor e testes).
 *
 * LIMITES DE GARANTIA (ver docs/SLA.md): enquanto a trilha viver dentro do JSON `comments`
 * da tabela `tickets` (RLS aberta), estas funções DETECTAM perdas/inconsistências e
 * recuperam eventos a partir de outra cópia, mas não impedem que um cliente com a chave
 * anon sobrescreva a linha. A garantia forte exige a tabela própria proposta no documento.
 */
import type { SlaEvent } from "../../types";
import { REOPEN_CATEGORIES, REOPEN_MIN_REASON_LENGTH } from "./config";

const order = (a: SlaEvent, b: SlaEvent) => {
  if (a.seq != null && b.seq != null && a.seq !== b.seq) return a.seq - b.seq;
  return (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0);
};

/** União por `id` (eventos nunca são removidos), em ordem de `seq`/`at`. */
export function unionSlaEvents(...lists: (SlaEvent[] | undefined | null)[]): SlaEvent[] {
  const byId = new Map<string, SlaEvent>();
  for (const list of lists) {
    for (const e of list || []) {
      if (e && e.id && !byId.has(e.id)) byId.set(e.id, e);
    }
  }
  return [...byId.values()].sort(order);
}

/** Próximo número de sequência (começa em 1). */
export function nextSeq(events: SlaEvent[]): number {
  return events.reduce((max, e) => Math.max(max, e.seq ?? 0), 0) + 1;
}

export interface IntegrityReport {
  ok: boolean;
  problems: string[];
}

/** Verificações de consistência da trilha. Não corrige nada. */
export function verifySlaEvents(events: SlaEvent[] | undefined, opts: { resolvedBeforeTrail?: boolean } = {}): IntegrityReport {
  const list = [...(events || [])].sort(order);
  const problems: string[] = [];
  const ids = new Set<string>();
  let lastAt = 0;
  let paused = false;
  // Chamados resolvidos antes de existir a trilha (resolução só no log do sistema) já começam "resolvidos".
  let resolved = !!opts.resolvedBeforeTrail;
  let firstResolves = 0;
  const withSeq = list.filter((e) => e.seq != null);

  list.forEach((e, i) => {
    if (ids.has(e.id)) problems.push(`Evento duplicado (${e.id}).`);
    ids.add(e.id);
    const at = Date.parse(e.at);
    if (!Number.isFinite(at)) problems.push(`Evento ${e.id} com data inválida.`);
    else {
      if (at < lastAt) problems.push(`Evento ${e.id} anterior ao evento precedente (retroativo).`);
      lastAt = Math.max(lastAt, at);
    }
    switch (e.type) {
      case "pause":
        if (paused) problems.push(`Pausa sobreposta (${e.id}).`);
        paused = true;
        if (!e.reason) problems.push(`Pausa ${e.id} sem motivo.`);
        break;
      case "resume":
        if (!paused) problems.push(`Retomada sem pausa aberta (${e.id}).`);
        paused = false;
        break;
      case "resolve":
        if (resolved) problems.push(`Nova resolução sem reabertura (${e.id}).`);
        resolved = true;
        if (e.first) {
          firstResolves++;
          if (!e.snapshot) problems.push(`Primeira resolução ${e.id} sem registro do SLA original.`);
        }
        break;
      case "reopen":
        if (!resolved) problems.push(`Reabertura sem resolução anterior (${e.id}).`);
        resolved = false;
        if (!e.reason || e.reason.trim().length < REOPEN_MIN_REASON_LENGTH) problems.push(`Reabertura ${e.id} sem justificativa descritiva.`);
        if (!REOPEN_CATEGORIES.some((c) => c.value === e.category)) problems.push(`Reabertura ${e.id} sem categoria válida.`);
        break;
    }
    void i;
  });
  if (firstResolves > 1) problems.push("Mais de uma 'primeira resolução'.");
  if (withSeq.length === list.length && list.length > 0) {
    const bad = withSeq.findIndex((e, idx) => e.seq !== idx + 1);
    if (bad >= 0) problems.push(`Sequência quebrada: esperado ${bad + 1}, encontrado ${withSeq[bad].seq} (possível evento perdido).`);
  }
  return { ok: problems.length === 0, problems };
}
