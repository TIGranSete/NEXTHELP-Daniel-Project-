/**
 * SLA de um chamado — ÚNICO motor de cálculo (servidor e front-end).
 *
 * Primeira resposta e resolução são medidas separadamente. Tudo é DERIVADO de dados que já
 * existem (abertura, comentários, log de status do sistema) mais a trilha `slaEvents`.
 * Nenhum evento histórico é inventado: o que não pode ser provado fica `no_data`.
 *
 * REGRAS (política aprovada)
 *  - Relógio começa na abertura; fora do expediente só conta no próximo período útil.
 *  - Primeira resposta válida = primeiro comentário humano de TÉCNICO que não seja o próprio
 *    solicitante. NÃO contam: IA, mensagens do sistema, atribuição, mudança de status.
 *  - Pausa (só RESOLUÇÃO): status "Aguardando Solicitante" registrado pelo servidor. A primeira
 *    resposta nunca é pausada.
 *  - SLA ORIGINAL = abertura → PRIMEIRA resolução (descontadas só as pausas). Ao resolver, o
 *    servidor grava um snapshot; depois disso o resultado é congelado e nunca reiniciado.
 *  - Reabertura não reinicia o SLA original: cada reabertura abre um CICLO com tempo útil de
 *    correção próprio (reabertura → nova resolução), com o mesmo calendário.
 *  - Mudança de prioridade (opção A): o tempo consumido é mantido e comparado com a meta nova;
 *    violações já ocorridas ficam travadas no evento. A classificação inicial (triagem local/IA)
 *    não é "mudança".
 *  - Chamados anteriores à ativação da política não são reavaliados (`era: "legacy"`).
 */
import type { ReopenCategory, SlaEvent, SlaResolutionSnapshot, Ticket } from "../../types";
import { CalendarConfig, DEFAULT_CALENDAR, SLA_POLICY, SlaPolicy, SlaPriorityKey, slaPriorityKey } from "./config";
import { Interval, addBusinessMinutes, addBusinessMinutesExcluding, businessMinutesBetween, businessMinutesExcluding, mergeIntervals } from "./engine";
import { IntegrityReport, verifySlaEvents } from "./events";

export type SlaState = "met" | "breached" | "running" | "at_risk" | "paused" | "no_data" | "not_applicable";
/** preview = política ainda não ativada · new = criado após a ativação · legacy = criado antes dela */
export type PolicyEra = "preview" | "new" | "legacy";

export interface SlaContext {
  calendar?: CalendarConfig;
  policy?: SlaPolicy;
}

export interface ClockResult {
  state: SlaState;
  targetMin: number;
  /** Minutos úteis consumidos (fracionário). */
  consumedMin: number;
  /** Meta − consumido. Negativo = minutos úteis de atraso. `null` se sem dados. */
  remainingMin: number | null;
  /** Instante de vencimento. `null` quando indeterminado (pausa em curso) ou sem dados. */
  dueAt: number | null;
  /** Instante em que o relógio parou (resposta/resolução), se parou. */
  endedAt: number | null;
  /** Havia violação já registrada em mudança de prioridade anterior. */
  breachedBefore: boolean;
}

export interface PausePeriod {
  startAt: number;
  endAt: number | null;
  by: string;
  reason: string;
  resumedBy: string | null;
  trigger: SlaEvent["trigger"] | null;
}

export interface ReopenCycle {
  index: number;
  openedAt: number;
  openedBy: string | null;
  /** `null` em reaberturas só detectadas no log antigo (sem motivo registrado). */
  reason: string | null;
  category: ReopenCategory | null;
  resolvedAt: number | null;
  /** Tempo útil de correção (reabertura → nova resolução, ou até agora se em andamento). */
  correctionMin: number;
  ongoing: boolean;
  source: "event" | "log";
}

export interface PriorityHistoryItem {
  at: number;
  kind: "initial" | "change";
  from: string | null;
  to: string;
  by: string;
  source?: string;
  suggested?: string;
}

export interface TicketSla {
  applicable: boolean;
  /** Motivo quando não aplicável. */
  reason?: string;
  priorityKey: SlaPriorityKey | null;
  policyVersion: string;
  policyApproved: boolean;
  calendarConfirmed: boolean;
  era: PolicyEra;
  firstResponse: ClockResult & { respondedAt: number | null };
  /** SLA de resolução ORIGINAL (abertura → primeira resolução). Congelado após resolver. */
  resolution: ClockResult & { resolvedAt: number | null; pausedBusinessMin: number; source: "snapshot" | "log" | null };
  cycles: ReopenCycle[];
  /** Há um ciclo de reabertura em andamento. */
  reopened: boolean;
  pauses: PausePeriod[];
  waitingRequester: boolean;
  priorityHistory: PriorityHistoryItem[];
  integrity: IntegrityReport;
}

const FINAL = new Set(["Resolvido", "Fechado"]);
export const WAITING_STATUS = "Aguardando Solicitante";
const DEDUPE_MS = 10_000;

// ───────────────────────── derivações ─────────────────────────

interface Transition {
  at: number;
  from: string | null;
  to: string;
}

const STATUS_LINE = /^Status alterado (?:de \*\*(.+?)\*\* para|automaticamente para) \*\*(.+?)\*\*/;

/** Transições de status lidas do log do sistema (único registro com data nos chamados antigos). */
export function statusTransitions(ticket: Ticket): Transition[] {
  const out: Transition[] = [];
  for (const c of ticket.comments || []) {
    if (c.authorRole !== "system") continue;
    const at = Date.parse(c.timestamp);
    if (!Number.isFinite(at)) continue;
    for (const line of String(c.content || "").split("\n")) {
      const m = STATUS_LINE.exec(line.trim());
      if (m) out.push({ at, from: m[1] ?? null, to: m[2] });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

interface Entry {
  at: number;
  kind: "resolve" | "reopen";
  source: "event" | "log";
  event?: SlaEvent;
}

/**
 * Resoluções e reaberturas em ordem. Eventos do servidor têm precedência; transições do log
 * antigo só entram quando não há evento equivalente (mesmo tipo, ±10 s).
 */
function resolutionEntries(ticket: Ticket): Entry[] {
  const structured: Entry[] = [];
  for (const e of ticket.slaEvents || []) {
    if (e.type !== "resolve" && e.type !== "reopen") continue;
    const at = Date.parse(e.at);
    if (Number.isFinite(at)) structured.push({ at, kind: e.type, source: "event", event: e });
  }
  const fromLog: Entry[] = [];
  let inFinal = false;
  for (const t of statusTransitions(ticket)) {
    const toFinal = FINAL.has(t.to);
    if (toFinal && !inFinal) {
      inFinal = true;
      fromLog.push({ at: t.at, kind: "resolve", source: "log" });
    } else if (!toFinal && inFinal) {
      inFinal = false;
      fromLog.push({ at: t.at, kind: "reopen", source: "log" });
    }
  }
  const extra = fromLog.filter((l) => !structured.some((s) => s.kind === l.kind && Math.abs(s.at - l.at) <= DEDUPE_MS));
  const merged = [...structured, ...extra].sort((a, b) => a.at - b.at);
  // máquina de estados: resolve só fora de "final"; reopen só dentro
  const out: Entry[] = [];
  let state = false;
  for (const e of merged) {
    if (e.kind === "resolve" && !state) { state = true; out.push(e); }
    else if (e.kind === "reopen" && state) { state = false; out.push(e); }
  }
  return out;
}

/** Pausas a partir da trilha `slaEvents`, saneadas (sem sobreposição, nem negativas). */
export function pausePeriods(ticket: Ticket): PausePeriod[] {
  const events = [...(ticket.slaEvents || [])].filter((e) => e.type === "pause" || e.type === "resume").sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const out: PausePeriod[] = [];
  let open: PausePeriod | null = null;
  for (const e of events) {
    const at = Date.parse(e.at);
    if (!Number.isFinite(at)) continue;
    if (e.type === "pause") {
      if (open) continue; // já pausado: ignora sobreposição
      open = { startAt: at, endAt: null, by: e.by, reason: e.reason || "Aguardando resposta do solicitante", resumedBy: null, trigger: null };
      out.push(open);
    } else if (open) {
      if (at >= open.startAt) {
        open.endAt = at;
        open.resumedBy = e.by;
        open.trigger = e.trigger ?? null;
      }
      open = null;
    }
  }
  return out;
}

const isMetaId = (id: string) => /-meta$/.test(id || "");

/** Primeira resposta válida da equipe (ms) ou null. */
export function firstValidResponseAt(ticket: Ticket): number | null {
  let best: number | null = null;
  for (const c of ticket.comments || []) {
    if (c.authorRole !== "tecnico" || isMetaId(c.id)) continue;
    if (c.authorName && c.authorName === ticket.requesterName) continue; // técnico falando consigo mesmo
    const at = Date.parse(c.timestamp);
    if (Number.isFinite(at) && (best === null || at < best)) best = at;
  }
  return best;
}

/** Violações travadas por mudanças de prioridade ocorridas até `untilMs`. */
function latched(ticket: Ticket, untilMs: number): { firstResponse: boolean; resolution: boolean } {
  let firstResponse = false;
  let resolution = false;
  for (const e of ticket.slaEvents || []) {
    if (e.type === "priority_change" && e.breached && Date.parse(e.at) <= untilMs) {
      firstResponse ||= !!e.breached.firstResponse;
      resolution ||= !!e.breached.resolution;
    }
  }
  return { firstResponse, resolution };
}

const empty = (targetMin: number, state: SlaState): ClockResult => ({
  state, targetMin, consumedMin: 0, remainingMin: null, dueAt: null, endedAt: null, breachedBefore: false,
});

function liveState(consumed: number, target: number, ratio: number): SlaState {
  if (consumed > target + 1e-9) return "breached";
  return (target - consumed) / target <= ratio ? "at_risk" : "running";
}

function priorityHistory(ticket: Ticket): PriorityHistoryItem[] {
  const out: PriorityHistoryItem[] = [];
  for (const e of ticket.slaEvents || []) {
    const at = Date.parse(e.at);
    if (!Number.isFinite(at) || !e.toPriority) continue;
    if (e.type === "priority_initial") out.push({ at, kind: "initial", from: e.fromPriority ?? null, to: e.toPriority, by: e.by, source: e.source, suggested: e.suggestedPriority });
    else if (e.type === "priority_change") out.push({ at, kind: "change", from: e.fromPriority ?? null, to: e.toPriority, by: e.by });
  }
  return out.sort((a, b) => a.at - b.at);
}

// ───────────────────────── cálculo principal ─────────────────────────

export function computeTicketSla(ticket: Ticket, nowMs: number, ctx: SlaContext = {}): TicketSla {
  const cfg = ctx.calendar ?? DEFAULT_CALENDAR;
  const policy = ctx.policy ?? SLA_POLICY;
  const key = slaPriorityKey(ticket.priority);
  const startMs = Date.parse(ticket.createdAt);
  const activated = policy.activatedAt ? Date.parse(policy.activatedAt) : null;
  const era: PolicyEra = activated === null ? "preview" : Number.isFinite(startMs) && startMs >= activated ? "new" : "legacy";
  const base = { priorityKey: key, policyVersion: policy.version, policyApproved: policy.approved, calendarConfirmed: cfg.confirmed, era };

  const na = (reason: string): TicketSla => ({
    applicable: false, reason, ...base,
    firstResponse: { ...empty(0, "not_applicable"), respondedAt: null },
    resolution: { ...empty(0, "not_applicable"), resolvedAt: null, pausedBusinessMin: 0, source: null },
    cycles: [], reopened: false, pauses: [], waitingRequester: false, priorityHistory: [], integrity: { ok: true, problems: [] },
  });

  if (!Number.isFinite(startMs)) return na("Data de abertura inválida");
  if (ticket.projectDeadline) return na("Projeto com prazo próprio");
  if (!key) return na("Prioridade sem meta de SLA");

  const targets = policy.targets[key];
  const pauses = pausePeriods(ticket);
  const pauseIntervals = (end: number): Interval[] => pauses.map((p) => ({ start: p.startAt, end: Math.min(p.endAt ?? end, end) }));
  const isFinal = FINAL.has(ticket.status);

  // ── resoluções / reaberturas ──
  const entries = resolutionEntries(ticket);
  const firstResolve = entries.find((e) => e.kind === "resolve") ?? null;
  const resolvedAt = firstResolve ? firstResolve.at : null;

  const cycles: ReopenCycle[] = [];
  let openEntry: Entry | null = null;
  for (const e of entries) {
    if (resolvedAt === null || e.at <= resolvedAt) continue;
    if (e.kind === "reopen") openEntry = e;
    else if (openEntry) {
      cycles.push(buildCycle(cfg, cycles.length + 1, openEntry, e.at, pauses, nowMs));
      openEntry = null;
    }
  }
  if (openEntry && !isFinal) cycles.push(buildCycle(cfg, cycles.length + 1, openEntry, null, pauses, nowMs));
  const reopened = cycles.some((c) => c.ongoing);

  // ── Primeira resposta (nunca pausada) ──
  const respondedAt = firstValidResponseAt(ticket);
  const latchFr = latched(ticket, resolvedAt ?? nowMs).firstResponse;
  const frTarget = targets.firstResponseMin;
  const frDue = addBusinessMinutes(cfg, startMs, frTarget);
  let first: ClockResult;
  if (respondedAt !== null) {
    const consumed = businessMinutesBetween(cfg, startMs, respondedAt);
    const breached = consumed > frTarget + 1e-9 || latchFr;
    first = { state: breached ? "breached" : "met", targetMin: frTarget, consumedMin: consumed, remainingMin: frTarget - consumed, dueAt: frDue, endedAt: respondedAt, breachedBefore: latchFr };
  } else if (resolvedAt !== null) {
    // Resolvido sem resposta humana registrada: só é violação se já passou da meta até a resolução.
    const consumed = businessMinutesBetween(cfg, startMs, resolvedAt);
    first = consumed > frTarget + 1e-9 || latchFr
      ? { state: "breached", targetMin: frTarget, consumedMin: consumed, remainingMin: frTarget - consumed, dueAt: frDue, endedAt: resolvedAt, breachedBefore: latchFr }
      : { ...empty(frTarget, "no_data"), dueAt: frDue };
  } else if (isFinal) {
    first = { ...empty(frTarget, "no_data"), dueAt: frDue };
  } else {
    const consumed = businessMinutesBetween(cfg, startMs, nowMs);
    const state = latchFr ? "breached" : liveState(consumed, frTarget, policy.nearDueRatio);
    first = { state, targetMin: frTarget, consumedMin: consumed, remainingMin: frTarget - consumed, dueAt: frDue, endedAt: null, breachedBefore: latchFr };
  }

  // ── Resolução ORIGINAL ──
  const resTargetNow = targets.resolutionMin;
  const pausedNow = pauses.length > 0 && pauses[pauses.length - 1].endAt === null && !isFinal;
  let resolution: TicketSla["resolution"];

  if (resolvedAt !== null) {
    const snap = firstResolve!.event?.snapshot;
    const latchRes = latched(ticket, resolvedAt).resolution;
    if (snap) {
      // Resultado congelado na primeira resolução (não muda com prioridade, calendário ou política).
      const breached = snap.result === "breached";
      resolution = {
        state: breached ? "breached" : "met", targetMin: snap.targetMin, consumedMin: snap.consumedMin, remainingMin: snap.targetMin - snap.consumedMin,
        dueAt: snap.dueAt ? Date.parse(snap.dueAt) : null, endedAt: resolvedAt, breachedBefore: latchRes, resolvedAt,
        pausedBusinessMin: pausedMinutes(cfg, startMs, resolvedAt, pauses), source: "snapshot",
      };
    } else {
      // Chamado resolvido antes de existir snapshot: derivado do log (marcado como tal).
      const consumed = businessMinutesExcluding(cfg, startMs, resolvedAt, pauseIntervals(resolvedAt));
      const breached = consumed > resTargetNow + 1e-9 || latchRes;
      resolution = {
        state: breached ? "breached" : "met", targetMin: resTargetNow, consumedMin: consumed, remainingMin: resTargetNow - consumed,
        dueAt: addBusinessMinutesExcluding(cfg, startMs, resTargetNow, pauseIntervals(Infinity)), endedAt: resolvedAt, breachedBefore: latchRes, resolvedAt,
        pausedBusinessMin: pausedMinutes(cfg, startMs, resolvedAt, pauses), source: "log",
      };
    }
  } else if (isFinal) {
    resolution = { ...empty(resTargetNow, "no_data"), resolvedAt: null, pausedBusinessMin: 0, source: null };
  } else {
    const consumed = businessMinutesExcluding(cfg, startMs, nowMs, pauseIntervals(nowMs));
    const latchRes = latched(ticket, nowMs).resolution;
    const dueExcl: Interval[] = pauses.map((p) => ({ start: p.startAt, end: p.endAt ?? Infinity }));
    const dueAt = pausedNow ? null : addBusinessMinutesExcluding(cfg, startMs, resTargetNow, dueExcl);
    let state: SlaState;
    if (consumed > resTargetNow + 1e-9 || latchRes) state = "breached";
    else if (pausedNow) state = "paused";
    else state = liveState(consumed, resTargetNow, policy.nearDueRatio);
    resolution = {
      state, targetMin: resTargetNow, consumedMin: consumed, remainingMin: resTargetNow - consumed, dueAt, endedAt: null,
      breachedBefore: latchRes, resolvedAt: null, pausedBusinessMin: pausedMinutes(cfg, startMs, nowMs, pauses), source: null,
    };
  }

  return {
    applicable: true, ...base,
    firstResponse: { ...first, respondedAt },
    resolution, cycles, reopened, pauses, waitingRequester: pausedNow,
    priorityHistory: priorityHistory(ticket),
    integrity: verifySlaEvents(ticket.slaEvents, { resolvedBeforeTrail: entries[0]?.kind === "resolve" && entries[0].source === "log" }),
  };
}

function buildCycle(cfg: CalendarConfig, index: number, open: Entry, resolvedAt: number | null, pauses: PausePeriod[], nowMs: number): ReopenCycle {
  const end = resolvedAt ?? nowMs;
  const excl: Interval[] = pauses.map((p) => ({ start: p.startAt, end: p.endAt ?? end }));
  const ev = open.event;
  return {
    index, openedAt: open.at, openedBy: ev?.by ?? null, reason: ev?.reason ?? null, category: ev?.category ?? null,
    resolvedAt, correctionMin: businessMinutesExcluding(cfg, open.at, end, excl), ongoing: resolvedAt === null, source: open.source,
  };
}

/** Minutos úteis dentro de [from, to] que estiveram em pausa (sem contar duas vezes o que está fora do expediente). */
function pausedMinutes(cfg: CalendarConfig, from: number, to: number, pauses: PausePeriod[]): number {
  let total = 0;
  for (const x of mergeIntervals(pauses.map((p) => ({ start: p.startAt, end: p.endAt ?? to })))) {
    const s = Math.max(x.start, from);
    const e = Math.min(x.end, to);
    if (e > s) total += businessMinutesBetween(cfg, s, e);
  }
  return total;
}

/**
 * Foto do SLA original no instante `atMs` (chamada pelo servidor ANTES de aplicar a resolução).
 * `null` se o chamado não tem SLA aplicável ou já foi resolvido antes.
 */
export function buildResolutionSnapshot(ticket: Ticket, atMs: number, ctx: SlaContext = {}): SlaResolutionSnapshot | null {
  const policy = ctx.policy ?? SLA_POLICY;
  const cfg = ctx.calendar ?? DEFAULT_CALENDAR;
  const sla = computeTicketSla({ ...ticket, status: "Em Atendimento" } as Ticket, atMs, ctx);
  if (!sla.applicable || sla.resolution.resolvedAt !== null) return null;
  const r = sla.resolution;
  const f = sla.firstResponse;
  return {
    priority: ticket.priority,
    targetMin: r.targetMin,
    consumedMin: r.consumedMin,
    dueAt: r.dueAt !== null ? new Date(r.dueAt).toISOString() : null,
    result: r.state === "breached" ? "breached" : "met",
    firstResponse: { result: f.state === "breached" ? "breached" : f.state === "met" ? "met" : "no_data", consumedMin: f.state === "met" || f.state === "breached" ? f.consumedMin : null, targetMin: f.targetMin },
    policyVersion: policy.version,
    timeZone: cfg.timeZone,
  };
}

/**
 * Violações já ocorridas no instante `atMs` (usado pelo servidor ao registrar mudança de prioridade,
 * para que a mudança nunca apague um atraso).
 */
export function breachesAt(ticket: Ticket, atMs: number, ctx: SlaContext = {}): { firstResponse: boolean; resolution: boolean } {
  const sla = computeTicketSla(ticket, atMs, ctx);
  if (!sla.applicable) return { firstResponse: false, resolution: false };
  return { firstResponse: sla.firstResponse.state === "breached", resolution: sla.resolution.state === "breached" };
}

/** "2h 15min" a partir de minutos úteis (arredonda para o minuto). */
export function formatBusinessMinutes(min: number | null): string {
  if (min === null || !Number.isFinite(min)) return "—";
  const total = Math.round(Math.abs(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  const body = h > 0 ? (m > 0 ? `${h}h ${m}min` : `${h}h`) : `${m}min`;
  return min < 0 && total > 0 ? `-${body}` : body;
}

export const SLA_STATE_LABEL: Record<SlaState, string> = {
  met: "Cumprido",
  breached: "Vencido",
  running: "Dentro do prazo",
  at_risk: "Em risco",
  paused: "Pausado",
  no_data: "Sem dados",
  not_applicable: "Não aplicável",
};
