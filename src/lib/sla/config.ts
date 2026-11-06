/**
 * Configuração centralizada do SLA em horas úteis (Gran7 Help).
 *
 * ÚNICA fonte do calendário, das metas e da vigência. É importada pelo servidor e
 * pelo front-end para que os prazos sejam idênticos nos dois lados.
 *
 * APROVADO
 *  - Calendário: seg–sex, 07:42–12:00 e 13:30–18:00, America/Bahia (528 min/dia).
 *  - Metas por prioridade (minutos úteis).
 *  - Alteração de prioridade: opção A (mantém o tempo consumido e compara com a nova meta).
 *  - Reabertura: não reinicia o SLA original; cada ciclo tem tempo de correção próprio.
 *
 * NÃO CONFIGURADO
 *  - FERIADOS: nenhum cadastrado. Até que a lista seja aprovada, os cálculos NÃO descontam
 *    feriados (um feriado em dia de semana é contado como dia útil normal).
 *  - VIGÊNCIA: `activatedAt` é null. A política só passa a valer quando a atualização for
 *    aprovada e ativada em produção (preencher `activatedAt`). Enquanto for null, as telas
 *    mostram o cálculo como "pré-visualização" e nada é tratado como resultado oficial.
 */
import type { ReopenCategory } from "../../types";

/** Janela "HH:MM" → "HH:MM", interpretada no fuso `timeZone`. */
export type TimeWindow = readonly [start: string, end: string];

export interface CalendarException {
  /** Data local "YYYY-MM-DD". */
  date: string;
  /** Janelas válidas nessa data. Lista vazia = sem atendimento. */
  windows: readonly TimeWindow[];
  note?: string;
}

export interface CalendarConfig {
  /** Fuso horário IANA em que as janelas são interpretadas. */
  timeZone: string;
  /** Dias de atendimento (0 = domingo … 6 = sábado). */
  workDays: readonly number[];
  /** Intervalos de expediente do dia; o que fica entre eles (almoço) não conta. */
  windows: readonly TimeWindow[];
  /** Feriados ("YYYY-MM-DD"). Vazio: nenhuma lista foi aprovada — feriados NÃO são descontados. */
  holidays: readonly string[];
  /** Outros dias sem atendimento ("YYYY-MM-DD"). */
  closedDays: readonly string[];
  /** Exceções pontuais (ex.: meio expediente). Têm precedência sobre feriados e dias úteis. */
  exceptions: readonly CalendarException[];
  /** Expediente oficial aprovado. */
  confirmed: boolean;
}

export const DEFAULT_CALENDAR: CalendarConfig = {
  timeZone: "America/Bahia",
  workDays: [1, 2, 3, 4, 5],
  windows: [
    ["07:42", "12:00"],
    ["13:30", "18:00"],
  ],
  holidays: [],
  closedDays: [],
  exceptions: [],
  confirmed: true,
};

/** Prioridade usada pelo SLA. O sistema grava "Urgente"; o SLA a chama de "Crítica". */
export type SlaPriorityKey = "Crítica" | "Alta" | "Média" | "Baixa";

/** Durações SEMPRE em minutos úteis (evita erro de conversão). */
export interface SlaTargets {
  firstResponseMin: number;
  resolutionMin: number;
}

export interface SlaPolicy {
  version: string;
  approved: boolean;
  /**
   * Instante (ISO, UTC) a partir do qual a política vale. `null` = ainda não ativada em produção.
   * Chamados criados antes dele preservam seus registros e não são reavaliados pela política nova.
   */
  activatedAt: string | null;
  targets: Readonly<Record<SlaPriorityKey, SlaTargets>>;
  /** Fração restante do prazo a partir da qual o chamado é "em risco" (parâmetro de apresentação). */
  nearDueRatio: number;
  /** Mudança de prioridade — opção A aprovada: mantém o tempo útil consumido e usa a meta nova. */
  priorityChangeRule: "keep-elapsed-new-target";
}

export const SLA_POLICY: SlaPolicy = {
  version: "2026.1",
  approved: true,
  activatedAt: null,
  targets: {
    Crítica: { firstResponseMin: 15, resolutionMin: 120 },
    Alta: { firstResponseMin: 30, resolutionMin: 240 },
    Média: { firstResponseMin: 120, resolutionMin: 480 },
    Baixa: { firstResponseMin: 240, resolutionMin: 960 },
  },
  nearDueRatio: 0.25,
  priorityChangeRule: "keep-elapsed-new-target",
};

/** Converte a prioridade do chamado para a chave do SLA. Desconhecida → null (não avaliável). */
export function slaPriorityKey(priority: string | undefined | null): SlaPriorityKey | null {
  switch (priority) {
    case "Urgente":
    case "Crítica":
      return "Crítica";
    case "Alta":
      return "Alta";
    case "Média":
      return "Média";
    case "Baixa":
      return "Baixa";
    default:
      return null;
  }
}

export const REOPEN_CATEGORIES: readonly { value: ReopenCategory; label: string }[] = [
  { value: "ajuste_complementar", label: "Ajuste complementar" },
  { value: "problema_nao_resolvido", label: "Problema original não resolvido" },
  { value: "problema_recorrente", label: "Problema recorrente" },
  { value: "outro", label: "Outro" },
];

export const REOPEN_LABEL: Record<string, string> = Object.fromEntries(REOPEN_CATEGORIES.map((c) => [c.value, c.label]));
/** Tamanho mínimo da justificativa descritiva de uma reabertura. */
export const REOPEN_MIN_REASON_LENGTH = 10;

/** Minutos úteis por dia de uma lista de janelas (528 para o calendário padrão). */
export function dailyBusinessMinutes(windows: readonly TimeWindow[]): number {
  return windows.reduce((sum, [s, e]) => sum + (hhmmToMinutes(e) - hhmmToMinutes(s)), 0);
}

export function hhmmToMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new Error(`Horário inválido: "${hhmm}" (use HH:MM)`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) throw new Error(`Horário fora do intervalo: "${hhmm}"`);
  return h * 60 + min;
}
