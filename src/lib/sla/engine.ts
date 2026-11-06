/**
 * Motor de calendário útil. Funções puras: recebem o calendário como parâmetro.
 *
 * Instantes são sempre "ms desde epoch (UTC)". O fuso do calendário só é usado
 * para decidir quais janelas de trabalho existem em cada dia local.
 * Nenhum cálculo aqui usa diferença de horas corridas como medida de SLA.
 */
import { CalendarConfig, TimeWindow, hhmmToMinutes } from "./config";

const MIN = 60_000;
/** Limite de segurança para varrer o calendário (evita laço infinito em calendários sem expediente). */
const MAX_DAYS = 3660;

export interface Interval {
  start: number;
  end: number;
}

// ───────────────────────── fuso horário ─────────────────────────

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(timeZone: string): Intl.DateTimeFormat {
  let f = dtfCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    dtfCache.set(timeZone, f);
  }
  return f;
}

export interface ZonedParts {
  y: number;
  m: number; // 1-12
  d: number;
  hh: number;
  mm: number;
  ss: number;
  /** 0 = domingo … 6 = sábado, no fuso informado. */
  dow: number;
}

export function zonedParts(ms: number, timeZone: string): ZonedParts {
  const p: Record<string, number> = {};
  for (const part of dtf(timeZone).formatToParts(new Date(ms))) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  const dow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return { y: p.year, m: p.month, d: p.day, hh: p.hour % 24, mm: p.minute, ss: p.second, dow };
}

/** Diferença (local − UTC) em ms no instante `ms`. */
function offsetMs(ms: number, timeZone: string): number {
  const z = zonedParts(ms, timeZone);
  const asUtc = Date.UTC(z.y, z.m - 1, z.d, z.hh, z.mm, z.ss);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Converte "data local + minutos desde 00:00" em instante UTC (resolve a transição de offset). */
export function zonedTimeToUtc(y: number, m: number, d: number, minutesOfDay: number, timeZone: string): number {
  const localAsUtc = Date.UTC(y, m - 1, d, 0, minutesOfDay);
  const guess = localAsUtc - offsetMs(localAsUtc, timeZone);
  return localAsUtc - offsetMs(guess, timeZone);
}

const pad = (n: number) => String(n).padStart(2, "0");
export const dateKey = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

// ───────────────────────── calendário ─────────────────────────

function windowsForDay(cfg: CalendarConfig, key: string, dow: number): readonly TimeWindow[] {
  const exception = cfg.exceptions.find((e) => e.date === key);
  if (exception) return exception.windows;
  if (cfg.holidays.includes(key) || cfg.closedDays.includes(key)) return [];
  return cfg.workDays.includes(dow) ? cfg.windows : [];
}

/**
 * Cache das janelas por dia local. É só memoização (o resultado é idêntico): sem ele, cada cálculo
 * reconverte as janelas de cada dia pelo fuso via Intl, o que custa centenas de ms em chamados antigos.
 * A chave é a identidade do objeto de calendário (configs são imutáveis), então calendários
 * diferentes nunca compartilham resultados.
 */
const windowCache = new WeakMap<CalendarConfig, Map<number, Interval[]>>();

/** Janelas absolutas (UTC) de um dia local. */
function absoluteWindows(cfg: CalendarConfig, y: number, m: number, d: number): Interval[] {
  let perCfg = windowCache.get(cfg);
  if (!perCfg) windowCache.set(cfg, (perCfg = new Map()));
  const key = y * 10000 + m * 100 + d;
  const hit = perCfg.get(key);
  if (hit) return hit;
  const computed = computeAbsoluteWindows(cfg, y, m, d);
  perCfg.set(key, computed);
  return computed;
}

function computeAbsoluteWindows(cfg: CalendarConfig, y: number, m: number, d: number): Interval[] {
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const out: Interval[] = [];
  for (const [s, e] of windowsForDay(cfg, dateKey(y, m, d), dow)) {
    const start = zonedTimeToUtc(y, m, d, hhmmToMinutes(s), cfg.timeZone);
    const end = zonedTimeToUtc(y, m, d, hhmmToMinutes(e), cfg.timeZone);
    if (end > start) out.push({ start, end });
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * Percorre as janelas de trabalho a partir do dia local de `fromMs`.
 * O callback retorna `true` para interromper.
 */
function walkWindows(cfg: CalendarConfig, fromMs: number, cb: (w: Interval) => boolean | void): void {
  const z = zonedParts(fromMs, cfg.timeZone);
  let cursor = Date.UTC(z.y, z.m - 1, z.d);
  for (let i = 0; i < MAX_DAYS; i++, cursor += 86_400_000) {
    const c = new Date(cursor);
    for (const w of absoluteWindows(cfg, c.getUTCFullYear(), c.getUTCMonth() + 1, c.getUTCDate())) {
      if (cb(w)) return;
    }
  }
}

/** Minutos úteis (fracionários) entre dois instantes. 0 se `to <= from`. */
export function businessMinutesBetween(cfg: CalendarConfig, from: number, to: number): number {
  if (!(to > from)) return 0;
  let total = 0;
  walkWindows(cfg, from, (w) => {
    if (w.start >= to) return true;
    const s = Math.max(w.start, from);
    const e = Math.min(w.end, to);
    if (e > s) total += (e - s) / MIN;
    return w.end >= to;
  });
  return total;
}

/**
 * Instante em que `minutes` minutos úteis se completam a partir de `start`.
 * Início fora do expediente começa a contar no próximo período útil.
 * Retorna `null` se o calendário não tiver expediente no horizonte.
 */
export function addBusinessMinutes(cfg: CalendarConfig, start: number, minutes: number): number | null {
  if (minutes <= 0) return start;
  let remaining = minutes;
  let result: number | null = null;
  walkWindows(cfg, start, (w) => {
    const s = Math.max(w.start, start);
    if (s >= w.end) return false;
    const avail = (w.end - s) / MIN;
    if (remaining <= avail + 1e-9) {
      result = s + remaining * MIN;
      return true;
    }
    remaining -= avail;
    return false;
  });
  return result;
}

/** Primeiro instante ≥ `ms` que está dentro do expediente (ou `ms`, se já estiver). */
export function nextBusinessStart(cfg: CalendarConfig, ms: number): number | null {
  let result: number | null = null;
  walkWindows(cfg, ms, (w) => {
    if (w.end <= ms) return false;
    result = Math.max(w.start, ms);
    return true;
  });
  return result;
}

export function isBusinessTime(cfg: CalendarConfig, ms: number): boolean {
  const next = nextBusinessStart(cfg, ms);
  return next === ms;
}

// ───────────────────── exclusões (pausas, períodos resolvidos) ─────────────────────

/** Ordena, descarta intervalos vazios/negativos e funde sobreposições. */
export function mergeIntervals(list: Interval[]): Interval[] {
  const valid = list.filter((i) => Number.isFinite(i.start) && !Number.isNaN(i.end) && i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of valid) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

/** Minutos úteis em [from, to] descontando os intervalos excluídos. */
export function businessMinutesExcluding(cfg: CalendarConfig, from: number, to: number, excluded: Interval[]): number {
  if (!(to > from)) return 0;
  let total = businessMinutesBetween(cfg, from, to);
  for (const x of mergeIntervals(excluded)) {
    const s = Math.max(x.start, from);
    const e = Math.min(x.end, to);
    if (e > s) total -= businessMinutesBetween(cfg, s, e);
  }
  return Math.max(0, total);
}

/**
 * Instante em que `minutes` minutos úteis NÃO excluídos se completam a partir de `start`.
 * `null` se nunca se completam (calendário vazio ou exclusão aberta antes do fim).
 */
export function addBusinessMinutesExcluding(cfg: CalendarConfig, start: number, minutes: number, excluded: Interval[]): number | null {
  if (minutes <= 0) return start;
  const ex = mergeIntervals(excluded);
  let cursor = start;
  let remaining = minutes;
  for (const x of ex) {
    if (x.end <= cursor) continue;
    if (x.start > cursor) {
      const avail = businessMinutesBetween(cfg, cursor, x.start);
      if (remaining <= avail + 1e-9) return addBusinessMinutes(cfg, cursor, remaining);
      remaining -= avail;
    }
    if (!Number.isFinite(x.end)) return null;
    cursor = Math.max(cursor, x.end);
  }
  return addBusinessMinutes(cfg, cursor, remaining);
}
