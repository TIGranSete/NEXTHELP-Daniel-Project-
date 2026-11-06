/**
 * Agregações do dashboard "Análise de SLA".
 *
 * IMPORTANTE: este módulo NÃO calcula SLA. Ele apenas AGRUPA os resultados que o motor
 * (`computeTicketSla`) já produziu por chamado: estado, instantes e ciclos. Qualquer regra de
 * prazo, pausa ou reabertura continua somente em `ticketSla.ts`.
 *
 * REGRAS DE AGRUPAMENTO (documentadas para a tela)
 *  - Tendência: cada ponto usa só chamados avaliáveis naquele intervalo.
 *      · Resolução   → intervalo da data da primeira resolução (SLA original).
 *      · 1ª resposta → intervalo da data da resposta; sem resposta e já vencido → data do vencimento.
 *    Intervalos sem chamados avaliáveis ficam como AUSÊNCIA de dados (`pct: null`), nunca 0% ou 100%.
 *  - Situação dos chamados: categorias MUTUAMENTE EXCLUSIVAS, aplicadas nesta ordem de prioridade
 *    (a soma é sempre igual ao total). Risco e vencimento só valem para chamados abertos.
 *  - Responsável (tabela por técnico): o primeiro técnico atribuído ainda vigente; se ele já saiu,
 *    o primeiro da lista atual. Cada chamado conta UMA vez, mesmo com vários técnicos.
 */
import type { Ticket } from "../../types";
import { zonedParts } from "./engine";
import { DEFAULT_CALENDAR } from "./config";
import { SlaContext, TicketSla, computeTicketSla } from "./ticketSla";
import { computeSlaMetrics } from "./metrics";

export interface Evaluated {
  ticket: Ticket;
  sla: TicketSla;
}

const FINAL = new Set(["Resolvido", "Fechado"]);

/** Calcula o SLA de cada chamado UMA vez; todas as agregações reutilizam este resultado. */
export function evaluateTickets(tickets: Ticket[], nowMs: number, ctx: SlaContext = {}): Evaluated[] {
  const seen = new Set<string>();
  const out: Evaluated[] = [];
  for (const t of tickets) {
    if (!t || seen.has(t.id)) continue;
    seen.add(t.id);
    out.push({ ticket: t, sla: computeTicketSla(t, nowMs, ctx) });
  }
  return out;
}

const countable = (e: Evaluated) => e.sla.applicable && e.sla.era !== "legacy";

// ───────────────────────── resumo ─────────────────────────

export interface Summary {
  /** Chamados abertos com SLA aplicável (denominador do "% dos abertos"). */
  openApplicable: number;
  total: number;
}

export function summarize(items: Evaluated[]): Summary {
  let openApplicable = 0;
  for (const { ticket, sla } of items) {
    if (sla.applicable && sla.era !== "legacy" && !FINAL.has(ticket.status) && sla.resolution.resolvedAt === null) openApplicable++;
  }
  return { openApplicable, total: items.length };
}

// ───────────────────────── tendência ─────────────────────────

export type Granularity = "day" | "week" | "month";

export interface RateBucket {
  met: number;
  breached: number;
  evaluated: number;
  /** `null` = nenhum chamado avaliável no intervalo (ausência de dados). */
  pct: number | null;
}

export interface TrendPoint {
  key: string;
  /** Rótulo curto do eixo. */
  label: string;
  /** Rótulo completo para tooltip. */
  fullLabel: string;
  resolution: RateBucket;
  firstResponse: RateBucket;
}

export interface Trend {
  granularity: Granularity;
  points: TrendPoint[];
  /** Pontos com ao menos um chamado avaliável (resolução ou resposta). */
  populated: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

interface LocalDay {
  y: number;
  m: number;
  d: number;
}

const localDay = (ms: number, tz: string): LocalDay => {
  const z = zonedParts(ms, tz);
  return { y: z.y, m: z.m, d: z.d };
};

const dayNum = (l: LocalDay) => Math.floor(Date.UTC(l.y, l.m - 1, l.d) / 86_400_000);
const fromDayNum = (n: number): LocalDay => {
  const dt = new Date(n * 86_400_000);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
};
const mondayOf = (l: LocalDay): number => {
  const n = dayNum(l);
  const dow = new Date(n * 86_400_000).getUTCDay(); // 0=dom
  return n - ((dow + 6) % 7);
};

function bucketKey(g: Granularity, l: LocalDay): string {
  if (g === "day") return `${l.y}-${pad(l.m)}-${pad(l.d)}`;
  if (g === "week") {
    const s = fromDayNum(mondayOf(l));
    return `${s.y}-${pad(s.m)}-${pad(s.d)}`;
  }
  return `${l.y}-${pad(l.m)}`;
}

function labels(g: Granularity, key: string): { label: string; full: string } {
  const [y, m, d] = key.split("-").map(Number);
  if (g === "month") return { label: `${MONTHS[m - 1]}/${String(y).slice(2)}`, full: `${MONTHS[m - 1]} de ${y}` };
  if (g === "week") return { label: `${pad(d)}/${pad(m)}`, full: `Semana de ${pad(d)}/${pad(m)}/${y}` };
  return { label: `${pad(d)}/${pad(m)}`, full: `${pad(d)}/${pad(m)}/${y}` };
}

const emptyBucket = (): RateBucket => ({ met: 0, breached: 0, evaluated: 0, pct: null });
const finish = (b: RateBucket): RateBucket => ({ ...b, evaluated: b.met + b.breached, pct: b.met + b.breached > 0 ? Math.round((100 * b.met) / (b.met + b.breached)) : null });

/** Série temporal de cumprimento. Agrupamento: ≤35 dias → dia; ≤150 dias → semana; senão mês. */
export function buildTrend(items: Evaluated[], tz: string = DEFAULT_CALENDAR.timeZone): Trend {
  const res: { at: number; met: boolean }[] = [];
  const fr: { at: number; met: boolean }[] = [];
  for (const e of items) {
    if (!countable(e)) continue;
    const r = e.sla.resolution;
    if (r.resolvedAt !== null && (r.state === "met" || r.state === "breached")) res.push({ at: r.resolvedAt, met: r.state === "met" });
    const f = e.sla.firstResponse;
    if (f.state === "met" || f.state === "breached") {
      const at = f.endedAt ?? f.dueAt;
      if (at !== null) fr.push({ at, met: f.state === "met" });
    }
  }
  const all = [...res, ...fr].map((x) => x.at);
  if (all.length === 0) return { granularity: "day", points: [], populated: 0 };

  const minDay = dayNum(localDay(Math.min(...all), tz));
  const maxDay = dayNum(localDay(Math.max(...all), tz));
  const span = maxDay - minDay + 1;
  const g: Granularity = span <= 35 ? "day" : span <= 150 ? "week" : "month";

  const map = new Map<string, { res: RateBucket; fr: RateBucket }>();
  const add = (list: { at: number; met: boolean }[], field: "res" | "fr") => {
    for (const x of list) {
      const k = bucketKey(g, localDay(x.at, tz));
      const b = map.get(k) ?? { res: emptyBucket(), fr: emptyBucket() };
      if (x.met) b[field].met++;
      else b[field].breached++;
      map.set(k, b);
    }
  };
  add(res, "res");
  add(fr, "fr");

  // sequência contínua de chaves (intervalos sem dados permanecem como ausência)
  const keys: string[] = [];
  if (g === "month") {
    const a = fromDayNum(minDay);
    const b = fromDayNum(maxDay);
    let y = a.y, m = a.m;
    while (y < b.y || (y === b.y && m <= b.m)) {
      keys.push(`${y}-${pad(m)}`);
      if (++m > 12) { m = 1; y++; }
    }
  } else {
    const step = g === "day" ? 1 : 7;
    const start = g === "day" ? minDay : mondayOf(fromDayNum(minDay));
    for (let n = start; n <= maxDay; n += step) keys.push(bucketKey(g, fromDayNum(n)));
  }

  let populated = 0;
  const points: TrendPoint[] = keys.map((key) => {
    const b = map.get(key);
    const resolution = b ? finish(b.res) : emptyBucket();
    const firstResponse = b ? finish(b.fr) : emptyBucket();
    if (resolution.evaluated + firstResponse.evaluated > 0) populated++;
    const l = labels(g, key);
    return { key, label: l.label, fullLabel: l.full, resolution, firstResponse };
  });
  return { granularity: g, points, populated };
}

// ───────────────────────── situação dos chamados (exclusiva) ─────────────────────────

export type StatusKey =
  | "resolved_on_time" | "resolved_late" | "resolved_unrated"
  | "reopened" | "waiting" | "overdue" | "at_risk" | "in_progress" | "pending";

export const STATUS_LABEL: Record<StatusKey, string> = {
  resolved_on_time: "Resolvidos no prazo",
  resolved_late: "Resolvidos com atraso",
  resolved_unrated: "Resolvidos sem avaliação de prazo",
  reopened: "Reabertos (em correção)",
  waiting: "Aguardando solicitante",
  overdue: "Vencidos",
  at_risk: "Em risco de vencer",
  in_progress: "Em atendimento",
  pending: "Abertos / pendentes",
};

/** Ordem de apresentação. */
export const STATUS_ORDER: StatusKey[] = ["resolved_on_time", "resolved_late", "resolved_unrated", "reopened", "waiting", "overdue", "at_risk", "in_progress", "pending"];

/**
 * Classificação ÚNICA por chamado (prioridade, de cima para baixo):
 *  resolvido → (no prazo | com atraso | sem avaliação) · reaberto · aguardando solicitante ·
 *  vencido · em risco · em atendimento · aberto/pendente.
 */
export function classifyStatus(e: Evaluated): StatusKey {
  const { ticket, sla } = e;
  const rated = sla.applicable && sla.era !== "legacy";
  if (FINAL.has(ticket.status)) {
    if (!rated) return "resolved_unrated";
    const r = sla.resolution;
    if (r.resolvedAt !== null && r.state === "met") return "resolved_on_time";
    if (r.resolvedAt !== null && r.state === "breached") return "resolved_late";
    return "resolved_unrated";
  }
  if (sla.reopened) return "reopened";
  if (ticket.status === "Aguardando Solicitante" || sla.waitingRequester) return "waiting";
  if (rated && sla.resolution.resolvedAt === null) {
    if (sla.resolution.state === "breached") return "overdue";
    if (sla.resolution.state === "at_risk" || (sla.firstResponse.endedAt === null && sla.firstResponse.state === "at_risk")) return "at_risk";
  }
  return ticket.status === "Em Atendimento" || ticket.status === "Testando" ? "in_progress" : "pending";
}

export interface StatusSlice {
  key: StatusKey;
  label: string;
  count: number;
  /** % do total (0–100, 1 casa). */
  pct: number;
}

export function buildStatusDistribution(items: Evaluated[]): { total: number; slices: StatusSlice[] } {
  const counts = new Map<StatusKey, number>();
  for (const e of items) counts.set(classifyStatus(e), (counts.get(classifyStatus(e)) ?? 0) + 1);
  const total = items.length;
  const slices = STATUS_ORDER.filter((k) => (counts.get(k) ?? 0) > 0).map((key) => {
    const count = counts.get(key)!;
    return { key, label: STATUS_LABEL[key], count, pct: Math.round((1000 * count) / total) / 10 };
  });
  return { total, slices };
}

// ───────────────────────── categorias com mais atrasos ─────────────────────────

export interface LateCategory {
  category: string;
  /** Chamados RESOLVIDOS fora do prazo (SLA original) nesta categoria. */
  late: number;
  /** Participação no total de atrasos (0–100). */
  pct: number;
}

export function buildLateByCategory(items: Evaluated[]): { totalLate: number; rows: LateCategory[] } {
  const counts = new Map<string, number>();
  let totalLate = 0;
  for (const e of items) {
    if (!countable(e)) continue;
    if (e.sla.resolution.resolvedAt !== null && e.sla.resolution.state === "breached") {
      counts.set(e.ticket.category || "Outros", (counts.get(e.ticket.category || "Outros") ?? 0) + 1);
      totalLate++;
    }
  }
  const rows = [...counts.entries()]
    .map(([category, late]) => ({ category, late, pct: Math.round((1000 * late) / totalLate) / 10 }))
    .sort((a, b) => b.late - a.late || a.category.localeCompare(b.category));
  return { totalLate, rows };
}

// ───────────────────────── motivos de reabertura ─────────────────────────

export interface ReasonRow {
  category: string;
  count: number;
  pct: number;
}

/** Motivos reais registrados (ciclos com categoria). Reaberturas sem motivo (log antigo) são contadas à parte. */
export function buildReopenReasons(items: Evaluated[]): { totalWithReason: number; withoutReason: number; rows: ReasonRow[] } {
  const counts = new Map<string, number>();
  let withoutReason = 0;
  let totalWithReason = 0;
  for (const e of items) {
    if (!countable(e)) continue;
    for (const c of e.sla.cycles) {
      if (c.category) {
        counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
        totalWithReason++;
      } else withoutReason++;
    }
  }
  const rows = [...counts.entries()]
    .map(([category, count]) => ({ category, count, pct: Math.round((1000 * count) / totalWithReason) / 10 }))
    .sort((a, b) => b.count - a.count);
  return { totalWithReason, withoutReason, rows };
}

// ───────────────────────── desempenho por técnico ─────────────────────────

export interface TechRow {
  name: string;
  resolved: number;
  onTime: number;
  /** `null` = sem chamados avaliáveis (nunca 100%). */
  pct: number | null;
}

export const NO_OWNER = "Sem responsável";

/** Responsável pelo chamado: primeiro técnico vigente. Cada chamado conta uma única vez. */
export function responsibleOf(t: Ticket): string | null {
  const list = (t.assignedTo || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return null;
  return t.firstAssignedTo && list.includes(t.firstAssignedTo) ? t.firstAssignedTo : list[0];
}

export function buildTechPerformance(items: Evaluated[]): TechRow[] {
  const rows = new Map<string, TechRow>();
  const row = (name: string) => rows.get(name) ?? (rows.set(name, { name, resolved: 0, onTime: 0, pct: null }), rows.get(name)!);
  for (const e of items) {
    const owner = responsibleOf(e.ticket);
    if (owner) row(owner);
    if (!countable(e)) continue;
    const r = e.sla.resolution;
    if (r.resolvedAt !== null && (r.state === "met" || r.state === "breached")) {
      const x = row(owner ?? NO_OWNER);
      x.resolved++;
      if (r.state === "met") x.onTime++;
    }
  }
  const out = [...rows.values()].map((x) => ({ ...x, pct: x.resolved > 0 ? Math.round((100 * x.onTime) / x.resolved) : null }));
  return out.sort((a, b) => b.resolved - a.resolved || a.name.localeCompare(b.name));
}

// ───────────────────────── perfil do técnico (SLA + TMA) ─────────────────────────

export interface TechProfileMetrics {
  /** Resolvidos avaliáveis (primeira resolução). */
  resolved: number;
  onTime: number;
  /** `null` = sem dados (nunca 100%). */
  pct: number | null;
  /** TMA: média do tempo ÚTIL consumido até a primeira resolução (descontadas pausas). `null` = sem dados. */
  avgResolutionMin: number | null;
}

/**
 * Cumprimento de SLA e TMA de um técnico para o perfil. Usa o MESMO motor e a MESMA população da tabela
 * "Desempenho por Técnico" (responsável = `responsibleOf`), então os números das duas telas batem.
 * Não existe fórmula própria aqui: tudo vem de `computeSlaMetrics`.
 */
export function techProfileMetrics(tickets: Ticket[], name: string, nowMs: number, ctx: SlaContext = {}): TechProfileMetrics {
  const m = computeSlaMetrics(tickets.filter((t) => responsibleOf(t) === name), nowMs, ctx);
  return { resolved: m.resolution.evaluated, onTime: m.resolution.met, pct: m.resolution.pct, avgResolutionMin: m.avgResolutionMin };
}
