/**
 * Camada de compatibilidade: mantém as assinaturas usadas pelas telas existentes
 * (`isTicketOverdue`, `getSlaEscalation`, data de vencimento) mas calcula TUDO com o motor único.
 *
 * Projetos (com `projectDeadline`) continuam usando o prazo próprio do projeto, que não é SLA.
 * O campo legado `slaLimit` segue gravado por compatibilidade, mas NÃO é mais usado para
 * decidir atraso, urgência nem vencimento exibido.
 */
import type { Ticket } from "../../types";
import { SlaContext, TicketSla, computeTicketSla } from "./ticketSla";

const FINAL = new Set(["Resolvido", "Fechado"]);

export type SlaBadgeLabel = "CONCLUÍDO" | "ATRASADO" | "EM RISCO" | "PAUSADO" | "DENTRO PRAZO" | "SEM SLA";

export interface SlaEscalation {
  label: SlaBadgeLabel;
  textClass: string;
}

const projectDeadlineMs = (t: Ticket) => {
  const d = new Date(t.projectDeadline!);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};

/**
 * Situação geral para listas e selos. Considera os relógios VIVOS: resolução (se o original
 * ainda não foi resolvido) e primeira resposta (se ainda sem resposta). Resposta tardia já
 * dada não mantém o chamado como "atrasado" para sempre.
 */
export function slaBadgeLabel(sla: TicketSla, status: string): SlaBadgeLabel {
  if (!sla.applicable) return "SEM SLA";
  if (FINAL.has(status) || sla.resolution.resolvedAt !== null) {
    // reaberto: o original está congelado, mas o chamado voltou a ser trabalhado
    return sla.reopened ? (sla.waitingRequester ? "PAUSADO" : "DENTRO PRAZO") : "CONCLUÍDO";
  }
  const live = [sla.resolution.state, sla.firstResponse.endedAt === null ? sla.firstResponse.state : "met"];
  if (live.includes("breached")) return "ATRASADO";
  if (sla.waitingRequester) return "PAUSADO";
  if (live.includes("at_risk")) return "EM RISCO";
  return "DENTRO PRAZO";
}

export function isTicketOverdue(t: Ticket, nowMs: number, ctx: SlaContext = {}): boolean {
  if (FINAL.has(t.status)) return false;
  if (t.projectDeadline) return projectDeadlineMs(t) < nowMs;
  const sla = computeTicketSla(t, nowMs, ctx);
  if (!sla.applicable || sla.resolution.resolvedAt !== null) return false;
  return slaBadgeLabel(sla, t.status) === "ATRASADO";
}

const TEXT: Record<SlaBadgeLabel, string> = {
  "CONCLUÍDO": "text-emerald-400",
  ATRASADO: "text-rose-400",
  "EM RISCO": "text-amber-400",
  PAUSADO: "text-sky-400",
  "DENTRO PRAZO": "text-emerald-400",
  "SEM SLA": "text-muted",
};

export function getSlaEscalation(t: Ticket, nowMs: number, ctx: SlaContext = {}): SlaEscalation {
  if (FINAL.has(t.status)) return { label: "CONCLUÍDO", textClass: TEXT["CONCLUÍDO"] };
  if (t.projectDeadline) {
    const remaining = projectDeadlineMs(t) - nowMs;
    if (remaining <= 0) return { label: "ATRASADO", textClass: TEXT.ATRASADO };
    const total = Math.max(projectDeadlineMs(t) - Date.parse(t.createdAt), 1);
    return remaining / total <= 0.25 ? { label: "EM RISCO", textClass: TEXT["EM RISCO"] } : { label: "DENTRO PRAZO", textClass: TEXT["DENTRO PRAZO"] };
  }
  const label = slaBadgeLabel(computeTicketSla(t, nowMs, ctx), t.status);
  return { label, textClass: TEXT[label] };
}

/** Vencimento da RESOLUÇÃO (instante absoluto) para exibir em tabelas; `null` se indeterminado. */
export function resolutionDueAt(t: Ticket, nowMs: number, ctx: SlaContext = {}): number | null {
  const sla = computeTicketSla(t, nowMs, ctx);
  return sla.applicable ? sla.resolution.dueAt : null;
}

/** Chamado com ciclo de reabertura em andamento. */
export function isReopened(t: Ticket, nowMs: number, ctx: SlaContext = {}): boolean {
  return computeTicketSla(t, nowMs, ctx).reopened;
}
