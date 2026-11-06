/**
 * Testes das regras de negócio do SLA em horas úteis.
 * Executar: npm test   (node:test via tsx — sem dependências novas)
 *
 * Referência de calendário: America/Bahia (UTC-3 fixo), seg–sex, 07:42–12:00 e 13:30–18:00.
 * 2026-11-05 é quinta; 06 sexta; 07 sábado; 08 domingo; 09 segunda.
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { Comment, SlaEvent, Ticket } from "../../types";
import { CalendarConfig, DEFAULT_CALENDAR, SLA_POLICY, dailyBusinessMinutes, slaPriorityKey } from "./config";
import { addBusinessMinutes, addBusinessMinutesExcluding, businessMinutesBetween, isBusinessTime, mergeIntervals, nextBusinessStart, zonedTimeToUtc } from "./engine";
import { breachesAt, computeTicketSla, formatBusinessMinutes } from "./ticketSla";
import { computeSlaMetrics } from "./metrics";


const T = (local: string) => Date.parse(`2026-${local}:00-03:00`); // "11-05T09:00" → Bahia
const cal = DEFAULT_CALENDAR;

// ───────────────────────── calendário ─────────────────────────

test("expediente padrão soma 528 minutos úteis por dia (8h48)", () => {
  assert.equal(dailyBusinessMinutes(cal.windows), 528);
  assert.equal(businessMinutesBetween(cal, T("11-05T00:00"), T("11-06T00:00")), 528);
});

test("abertura dentro do expediente soma minutos corridos da janela", () => {
  assert.equal(addBusinessMinutes(cal, T("11-05T09:00"), 60), T("11-05T10:00"));
});

test("abertura antes do expediente começa a contar às 07:42", () => {
  assert.equal(addBusinessMinutes(cal, T("11-05T06:00"), 30), T("11-05T08:12"));
});

test("abertura após o expediente começa no próximo dia útil", () => {
  assert.equal(addBusinessMinutes(cal, T("11-05T19:00"), 30), T("11-06T08:12"));
});

test("abertura na sexta à noite começa na segunda", () => {
  assert.equal(addBusinessMinutes(cal, T("11-06T19:00"), 30), T("11-09T08:12"));
});

test("intervalo de almoço (12:00–13:30) não é contado", () => {
  assert.equal(addBusinessMinutes(cal, T("11-05T11:30"), 60), T("11-05T14:00"));
  assert.equal(businessMinutesBetween(cal, T("11-05T11:00"), T("11-05T14:00")), 90);
  assert.equal(isBusinessTime(cal, T("11-05T12:30")), false);
  assert.equal(nextBusinessStart(cal, T("11-05T12:30")), T("11-05T13:30"));
});

test("sábado e domingo não são contados", () => {
  assert.equal(businessMinutesBetween(cal, T("11-06T17:00"), T("11-09T08:42")), 120);
  assert.equal(isBusinessTime(cal, T("11-07T10:00")), false);
});

test("feriado cadastrado é pulado; sem feriados cadastrados nenhum é presumido", () => {
  const withHoliday: CalendarConfig = { ...cal, holidays: ["2026-11-06"] };
  assert.equal(addBusinessMinutes(withHoliday, T("11-05T17:30"), 60), T("11-09T08:12"));
  assert.equal(addBusinessMinutes(cal, T("11-05T17:30"), 60), T("11-06T08:12"));
  assert.deepEqual(cal.holidays, []);
});

test("dia sem atendimento e exceção de calendário (meio expediente)", () => {
  const c: CalendarConfig = { ...cal, closedDays: ["2026-11-06"], exceptions: [{ date: "2026-11-05", windows: [["08:00", "10:00"]] }] };
  assert.equal(businessMinutesBetween(c, T("11-05T00:00"), T("11-06T00:00")), 120);
  assert.equal(businessMinutesBetween(c, T("11-06T00:00"), T("11-07T00:00")), 0);
});

test("chamado aberto perto do fim do expediente transborda para o dia seguinte", () => {
  assert.equal(addBusinessMinutes(cal, T("11-05T17:55"), 10), T("11-06T07:47"));
});

test("prazo que termina exatamente no fechamento vence às 18:00", () => {
  assert.equal(addBusinessMinutes(cal, T("11-05T17:00"), 60), T("11-05T18:00"));
  assert.equal(addBusinessMinutes(cal, T("11-05T07:42"), 528), T("11-05T18:00"));
  assert.equal(addBusinessMinutes(cal, T("11-05T07:42"), 529), T("11-06T07:43"));
});

test("calendário sem expediente retorna null (sem laço infinito)", () => {
  const none: CalendarConfig = { ...cal, workDays: [] };
  assert.equal(addBusinessMinutes(none, T("11-05T09:00"), 10), null);
});

test("fuso horário: Bahia é UTC-3 fixo", () => {
  assert.equal(zonedTimeToUtc(2026, 11, 5, 9 * 60, "America/Bahia"), Date.parse("2026-11-05T12:00:00Z"));
});

test("transição de horário de verão (America/New_York) preserva o expediente local", () => {
  const ny: CalendarConfig = { ...cal, timeZone: "America/New_York", windows: [["09:00", "17:00"]] };
  // Sexta (EST, -05:00) 16:30 + 60 min → 30 min na sexta + 30 min na segunda (EDT, -04:00).
  assert.equal(addBusinessMinutes(ny, Date.parse("2026-03-06T16:30:00-05:00"), 60), Date.parse("2026-03-09T09:30:00-04:00"));
  assert.equal(businessMinutesBetween(ny, Date.parse("2026-03-06T09:00:00-05:00"), Date.parse("2026-03-09T17:00:00-04:00")), 960);
  // Dia do "spring forward": 01:00–04:00 locais têm só 120 min reais.
  const odd: CalendarConfig = { ...ny, workDays: [0, 1, 2, 3, 4, 5, 6], windows: [["01:00", "04:00"]] };
  assert.equal(businessMinutesBetween(odd, Date.parse("2026-03-08T00:00:00-05:00"), Date.parse("2026-03-08T05:00:00-04:00")), 120);
});

test("intervalos excluídos são fundidos; sobrepostos e negativos não geram tempo", () => {
  const merged = mergeIntervals([{ start: 10, end: 20 }, { start: 15, end: 30 }, { start: 50, end: 40 }]);
  assert.deepEqual(merged, [{ start: 10, end: 30 }]);
});

test("addBusinessMinutesExcluding pula o intervalo pausado", () => {
  const due = addBusinessMinutesExcluding(cal, T("11-05T08:00"), 480, [{ start: T("11-05T09:00"), end: T("11-05T13:30") }]);
  assert.equal(due, T("11-06T10:12"));
});

test("formatação de minutos úteis", () => {
  assert.equal(formatBusinessMinutes(135), "2h 15min");
  assert.equal(formatBusinessMinutes(-30), "-30min");
  assert.equal(formatBusinessMinutes(null), "—");
});

test("Urgente é tratado como Crítica; prioridade desconhecida não tem meta", () => {
  assert.equal(slaPriorityKey("Urgente"), "Crítica");
  assert.equal(slaPriorityKey("Qualquer"), null);
});

// ───────────────────────── chamado ─────────────────────────

let seq = 0;
const comment = (role: Comment["authorRole"], at: string, content = "msg", name = role === "tecnico" ? "Tec" : "Solic"): Comment => ({
  id: `c${++seq}`, authorName: name, authorRole: role, content, timestamp: new Date(T(at)).toISOString(),
});
const statusLog = (at: string, from: string, to: string) => comment("system", at, `Status alterado de **${from}** para **${to}**`, "Sistema");
const ev = (type: SlaEvent["type"], at: string, extra: Partial<SlaEvent> = {}): SlaEvent => ({ id: `e${++seq}`, type, at: new Date(T(at)).toISOString(), by: "Tec", ...extra });

function ticket(over: Partial<Ticket> = {}): Ticket {
  return {
    id: String(++seq), title: "t", description: "d", category: "Software", priority: "Média", status: "Em Atendimento",
    requesterName: "Solic", requesterDepartment: "X", assignedTo: "Tec", createdAt: new Date(T("11-05T08:00")).toISOString(),
    updatedAt: new Date(T("11-05T08:00")).toISOString(), slaLimit: new Date(T("11-06T08:00")).toISOString(),
    aiCategory: "", aiPriority: "", aiReasoning: "", aiSuggestions: "", comments: [], ...over,
  };
}

test("metas oficiais aprovadas estão em minutos úteis; vigência ainda não ativada", () => {
  assert.equal(SLA_POLICY.approved, true);
  assert.equal(SLA_POLICY.activatedAt, null);
  assert.equal(cal.confirmed, true);
  assert.deepEqual(SLA_POLICY.targets.Crítica, { firstResponseMin: 15, resolutionMin: 120 });
  assert.deepEqual(SLA_POLICY.targets.Baixa, { firstResponseMin: 240, resolutionMin: 960 });
});

test("primeira resposta: resposta de técnico dentro e fora da meta", () => {
  const ok = computeTicketSla(ticket({ comments: [comment("tecnico", "11-05T09:30")] }), T("11-05T12:00"));
  assert.equal(ok.firstResponse.state, "met");
  assert.equal(ok.firstResponse.consumedMin, 90);
  const late = computeTicketSla(ticket({ comments: [comment("tecnico", "11-05T10:30")] }), T("11-05T12:00"));
  assert.equal(late.firstResponse.state, "breached"); // 150 > 120
});

test("primeira resposta ignora IA, sistema, atribuição e o próprio solicitante", () => {
  const t = ticket({
    comments: [
      comment("ai", "11-05T08:01", "Iniciando análise", "IA"),
      comment("system", "11-05T08:02", "Técnico(s) adicionado(s): **Tec**\nStatus alterado automaticamente para **Em Atendimento**", "Sistema"),
      comment("colaborador", "11-05T08:03"),
      comment("tecnico", "11-05T08:04", "eu mesmo", "Solic"),
    ],
  });
  const s = computeTicketSla(t, T("11-05T08:10"));
  assert.equal(s.firstResponse.respondedAt, null);
  assert.equal(s.firstResponse.state, "running");
});

test("primeira resposta fora do expediente: relógio só começa no próximo período útil", () => {
  const t = ticket({ createdAt: new Date(T("11-05T19:00")).toISOString(), comments: [comment("tecnico", "11-06T08:30")] });
  const s = computeTicketSla(t, T("11-06T09:00"));
  assert.equal(s.firstResponse.consumedMin, 48); // 07:42 → 08:30
  assert.equal(s.firstResponse.state, "met");
});

test("pausa e retomada: tempo anterior é preservado e o prazo continua depois", () => {
  const t = ticket({ slaEvents: [ev("pause", "11-05T09:00"), ev("resume", "11-05T13:30", { trigger: "requester_reply" })] });
  const s = computeTicketSla(t, T("11-05T14:30"));
  assert.equal(s.resolution.consumedMin, 120); // 08–09 + 13:30–14:30
  assert.equal(s.resolution.dueAt, T("11-06T10:12"));
  assert.equal(s.pauses.length, 1);
  assert.equal(s.pauses[0].trigger, "requester_reply");
  assert.equal(s.waitingRequester, false);
});

test("pausa em horário não útil não altera o consumo", () => {
  const base = ticket({ createdAt: new Date(T("11-05T16:00")).toISOString() });
  const paused = ticket({ createdAt: base.createdAt, slaEvents: [ev("pause", "11-05T18:30"), ev("resume", "11-06T07:00")] });
  const now = T("11-06T09:00");
  assert.equal(computeTicketSla(paused, now).resolution.consumedMin, computeTicketSla(base, now).resolution.consumedMin);
  assert.equal(computeTicketSla(base, now).resolution.consumedMin, 198);
});

test("pausa em curso congela o consumo, esconde o vencimento e sinaliza espera", () => {
  const t = ticket({ status: "Aguardando Solicitante", slaEvents: [ev("pause", "11-05T10:00")] });
  const a = computeTicketSla(t, T("11-06T12:00"));
  const b = computeTicketSla(t, T("11-09T12:00"));
  assert.equal(a.resolution.consumedMin, 120);
  assert.equal(b.resolution.consumedMin, 120);
  assert.equal(a.resolution.state, "paused");
  assert.equal(a.resolution.dueAt, null);
  assert.equal(a.waitingRequester, true);
});

test("pausa não afeta a primeira resposta", () => {
  const t = ticket({ priority: "Alta", status: "Aguardando Solicitante", slaEvents: [ev("pause", "11-05T08:05")] });
  const s = computeTicketSla(t, T("11-05T10:00"));
  assert.equal(s.firstResponse.state, "breached"); // 30 min úteis passaram sem resposta
});

test("pausas sobrepostas, retomada órfã e intervalos negativos são ignorados", () => {
  const t = ticket({
    slaEvents: [
      ev("resume", "11-05T08:30"), // órfã
      ev("pause", "11-05T09:00"),
      ev("pause", "11-05T09:30"), // sobreposta
      ev("resume", "11-05T10:00"),
      ev("resume", "11-05T10:30"), // órfã
    ],
  });
  const s = computeTicketSla(t, T("11-05T11:00"));
  assert.equal(s.pauses.length, 1);
  assert.equal(s.resolution.consumedMin, 120); // 180 − 60 de pausa
  const reversed = ticket({ slaEvents: [ev("pause", "11-05T10:00"), ev("resume", "11-05T09:00")] });
  assert.ok(computeTicketSla(reversed, T("11-05T11:00")).resolution.consumedMin <= 180);
});

test("resolução dentro do prazo e fora do prazo", () => {
  const okT = ticket({ status: "Resolvido", comments: [statusLog("11-05T11:00", "Em Atendimento", "Resolvido")] });
  const ok = computeTicketSla(okT, T("11-09T09:00"));
  assert.equal(ok.resolution.state, "met");
  assert.equal(ok.resolution.consumedMin, 180);
  assert.equal(ok.resolution.resolvedAt, T("11-05T11:00"));
  const lateT = ticket({ status: "Resolvido", comments: [statusLog("11-06T09:00", "Em Atendimento", "Resolvido")] });
  assert.equal(computeTicketSla(lateT, T("11-09T09:00")).resolution.state, "breached");
});

test("chamado resolvido sem registro de data não é avaliado (sem inventar)", () => {
  const t = ticket({ status: "Resolvido", comments: [] });
  const s = computeTicketSla(t, T("11-09T09:00"));
  assert.equal(s.resolution.state, "no_data");
  assert.equal(s.resolution.resolvedAt, null);
});

test("chamado aberto não tem data de resolução", () => {
  const s = computeTicketSla(ticket(), T("11-05T09:00"));
  assert.equal(s.resolution.resolvedAt, null);
  assert.equal(s.resolution.state, "running");
});

test("reabertura NÃO reinicia o SLA original: resultado fica congelado e o ciclo de correção é separado", () => {
  const t = ticket({
    status: "Em Atendimento",
    comments: [statusLog("11-05T09:00", "Em Atendimento", "Resolvido"), statusLog("11-05T13:30", "Resolvido", "Em Atendimento")],
  });
  const s = computeTicketSla(t, T("11-05T14:00"));
  assert.equal(s.resolution.resolvedAt, T("11-05T09:00"));
  assert.equal(s.resolution.consumedMin, 60); // 08:00 → 09:00, congelado
  assert.equal(s.resolution.state, "met");
  assert.equal(s.cycles.length, 1);
  assert.equal(s.cycles[0].correctionMin, 30); // 13:30 → 14:00
  assert.equal(s.cycles[0].ongoing, true);
  assert.equal(s.reopened, true);
});

test("Resolvido → Fechado usa a primeira resolução e não duplica", () => {
  const t = ticket({ status: "Fechado", comments: [statusLog("11-05T11:00", "Em Atendimento", "Resolvido"), statusLog("11-06T09:00", "Resolvido", "Fechado")] });
  const s = computeTicketSla(t, T("11-09T09:00"));
  assert.equal(s.resolution.resolvedAt, T("11-05T11:00"));
  assert.equal(s.resolution.state, "met");
});

test("mudança de prioridade não reinicia o relógio nem apaga violação já ocorrida", () => {
  const plain = ticket({ priority: "Baixa", createdAt: new Date(T("11-05T08:00")).toISOString() });
  assert.equal(computeTicketSla(plain, T("11-05T08:20")).firstResponse.state, "running");
  const latched = ticket({
    priority: "Baixa",
    slaEvents: [ev("priority_change", "11-05T08:10", { fromPriority: "Urgente", toPriority: "Baixa", breached: { firstResponse: true, resolution: false } })],
  });
  const s = computeTicketSla(latched, T("11-05T08:20"));
  assert.equal(s.firstResponse.state, "breached");
  assert.equal(s.firstResponse.breachedBefore, true);
  assert.equal(s.resolution.consumedMin, 20); // relógio não reiniciou
});

test("breachesAt registra a violação existente no instante da mudança", () => {
  const t = ticket({ priority: "Urgente" });
  assert.deepEqual(breachesAt(t, T("11-05T08:30")), { firstResponse: true, resolution: false });
  assert.deepEqual(breachesAt(t, T("11-05T08:05")), { firstResponse: false, resolution: false });
});

test("projeto com prazo próprio e prioridade sem meta não são aplicáveis", () => {
  assert.equal(computeTicketSla(ticket({ projectDeadline: "2026-12-01" }), T("11-05T09:00")).applicable, false);
  assert.equal(computeTicketSla(ticket({ priority: "Outra" as any }), T("11-05T09:00")).applicable, false);
});

// ───────────────────────── indicadores ─────────────────────────

test("período sem chamados: percentual é null (nunca 100%)", () => {
  const m = computeSlaMetrics([], T("11-09T09:00"));
  assert.equal(m.resolution.pct, null);
  assert.equal(m.firstResponse.pct, null);
  assert.equal(m.resolution.evaluated, 0);
});

test("só chamados abertos: resolução sem dados, não 100%", () => {
  const m = computeSlaMetrics([ticket()], T("11-05T09:00"));
  assert.equal(m.resolution.pct, null);
});

test("indicadores separados, sem dupla contagem e com filtros de projeto", () => {
  const resolvedOk = ticket({ id: "A", status: "Resolvido", comments: [comment("tecnico", "11-05T08:30"), statusLog("11-05T11:00", "Em Atendimento", "Resolvido")] });
  const closed = ticket({ id: "B", priority: "Alta", status: "Fechado", comments: [comment("tecnico", "11-05T09:00"), statusLog("11-06T09:00", "Em Atendimento", "Resolvido"), statusLog("11-06T10:00", "Resolvido", "Fechado")] });
  const open = ticket({ id: "C", priority: "Alta" });
  const waiting = ticket({ id: "D", status: "Aguardando Solicitante", slaEvents: [ev("pause", "11-05T09:00")] });
  const project = ticket({ id: "E", projectDeadline: "2026-12-01" });
  const m = computeSlaMetrics([resolvedOk, closed, closed, open, waiting, project], T("11-09T09:00"));
  assert.equal(m.resolution.evaluated, 2); // A e B, B uma só vez
  assert.equal(m.resolution.met, 1);
  assert.equal(m.resolution.breached, 1);
  assert.equal(m.resolution.pct, 50);
  assert.equal(m.resolvedLate, 1);
  assert.equal(m.openOverdue, 1); // C (Alta, aberto há >240 min úteis)
  assert.equal(m.waitingRequester, 1);
  assert.equal(m.skipped, 1);
  assert.equal(m.firstResponse.met, 1); // A (30 min úteis, meta Média 120)
  assert.equal(m.firstResponse.breached >= 1, true);
});

test("chamado resolvido sem data confiável é contado à parte, fora do percentual", () => {
  const m = computeSlaMetrics([ticket({ id: "X", status: "Resolvido" })], T("11-09T09:00"));
  assert.equal(m.resolution.evaluated, 0);
  assert.equal(m.resolution.pct, null);
  assert.equal(m.resolution.withoutReliableDate, 1);
});
