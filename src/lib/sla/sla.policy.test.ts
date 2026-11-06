/**
 * Testes da política aprovada (Etapa 2): bordas do calendário, metas por prioridade, pausas,
 * reaberturas (SLA original congelado + ciclos), prioridade inicial vs. alteração, vigência e indicadores.
 * Referência: 2026-11-09 é segunda-feira; America/Bahia (UTC-3).
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { Comment, SlaEvent, Ticket } from "../../types";
import { DEFAULT_CALENDAR, SLA_POLICY, SlaPolicy } from "./config";
import { addBusinessMinutes, isBusinessTime } from "./engine";
import { nextSeq, unionSlaEvents, verifySlaEvents } from "./events";
import { buildResolutionSnapshot, computeTicketSla } from "./ticketSla";
import { computeSlaMetrics } from "./metrics";
import { getSlaEscalation, isReopened, isTicketOverdue } from "./compat";

const T = (local: string) => Date.parse(`2026-${local}:00-03:00`);
const iso = (local: string) => new Date(T(local)).toISOString();
const cal = DEFAULT_CALENDAR;

let n = 0;
const sys = (at: string, content: string): Comment => ({ id: `s${++n}`, authorName: "Sistema GRAN7 HELP", authorRole: "system", content, timestamp: iso(at) });
const statusLog = (at: string, from: string, to: string) => sys(at, `Status alterado de **${from}** para **${to}**`);
const tech = (at: string, name = "Tec"): Comment => ({ id: `t${++n}`, authorName: name, authorRole: "tecnico", content: "ok", timestamp: iso(at) });
const ev = (type: SlaEvent["type"], at: string, extra: Partial<SlaEvent> = {}): SlaEvent => ({ id: `e${++n}`, type, at: iso(at), by: "Tec", ...extra });
const mk = (over: Partial<Ticket> = {}): Ticket => ({
  id: String(++n), title: "t", description: "d", category: "Software", priority: "Média", status: "Em Atendimento",
  requesterName: "Solic", requesterDepartment: "X", assignedTo: "Tec", createdAt: iso("11-09T08:00"), updatedAt: iso("11-09T08:00"),
  slaLimit: iso("11-10T08:00"), aiCategory: "", aiPriority: "", aiReasoning: "", aiSuggestions: "", comments: [], ...over,
});

// ───────────────────────── calendário: bordas ─────────────────────────

test("segunda-feira: bordas exatas do expediente (fim exclusivo)", () => {
  const at = (hhmm: string) => isBusinessTime(cal, T(`11-09T${hhmm}`));
  assert.equal(at("07:41"), false);
  assert.equal(at("07:42"), true);
  assert.equal(at("11:59"), true);
  assert.equal(at("12:00"), false);
  assert.equal(at("13:29"), false);
  assert.equal(at("13:30"), true);
  assert.equal(at("17:59"), true);
  assert.equal(at("18:00"), false);
});

test("abertura em cada borda começa a consumir no instante certo", () => {
  assert.equal(addBusinessMinutes(cal, T("11-09T07:42"), 15), T("11-09T07:57"));
  assert.equal(addBusinessMinutes(cal, T("11-09T11:59"), 15), T("11-09T13:44")); // 1 min até 12:00 + 14 min a partir de 13:30
  assert.equal(addBusinessMinutes(cal, T("11-09T12:00"), 15), T("11-09T13:45"));
  assert.equal(addBusinessMinutes(cal, T("11-09T13:30"), 15), T("11-09T13:45"));
  assert.equal(addBusinessMinutes(cal, T("11-09T17:59"), 15), T("11-10T07:56")); // 1 min + 14 min do dia seguinte
  assert.equal(addBusinessMinutes(cal, T("11-09T18:00"), 15), T("11-10T07:57"));
});

test("horário real da abertura é preservado (sem arredondar para hora cheia)", () => {
  assert.equal(addBusinessMinutes(cal, T("11-09T09:07"), 1), T("11-09T09:08"));
});

test("mudança de mês e de ano", () => {
  // quinta 31/12/2026 17:30 + 60 → 30 min na quinta + 30 min na sexta 01/01/2027
  assert.equal(addBusinessMinutes(cal, Date.parse("2026-12-31T17:30:00-03:00"), 60), Date.parse("2027-01-01T08:12:00-03:00"));
  // sexta 30/10/2026 17:45 + 30 → 15 min + segunda 02/11 (mês seguinte) 07:42 + 15
  assert.equal(addBusinessMinutes(cal, Date.parse("2026-10-30T17:45:00-03:00"), 30), Date.parse("2026-11-02T07:57:00-03:00"));
});

test("feriado configurado é pulado; sem configuração, NÃO é descontado", () => {
  const withHoliday = { ...cal, holidays: ["2026-11-10"] }; // terça
  assert.equal(addBusinessMinutes(withHoliday, T("11-09T17:45"), 30), T("11-11T07:57"));
  assert.equal(addBusinessMinutes(cal, T("11-09T17:45"), 30), T("11-10T07:57"));
  assert.deepEqual(cal.holidays, []);
});

// ───────────────────────── metas por prioridade ─────────────────────────

const CASES: [string, number, number][] = [["Urgente", 15, 120], ["Alta", 30, 240], ["Média", 120, 480], ["Baixa", 240, 960]];

for (const [prio, frMin, resMin] of CASES) {
  test(`prioridade ${prio}: primeira resposta ${frMin} min e resolução ${resMin} min úteis`, () => {
    const created = "11-09T08:00";
    const sla = computeTicketSla(mk({ priority: prio as Ticket["priority"], createdAt: iso(created) }), T("11-09T08:01"));
    assert.equal(sla.firstResponse.targetMin, frMin);
    assert.equal(sla.resolution.targetMin, resMin);
    assert.equal(sla.firstResponse.dueAt, addBusinessMinutes(cal, T(created), frMin));
    assert.equal(sla.resolution.dueAt, addBusinessMinutes(cal, T(created), resMin));
  });
}

test("primeira resposta dentro e fora do prazo; sem resposta; sem resolução", () => {
  const prio = "Alta"; // 30 min
  const inTime = computeTicketSla(mk({ priority: prio, comments: [tech("11-09T08:30")] }), T("11-09T09:00"));
  assert.equal(inTime.firstResponse.state, "met");
  assert.equal(inTime.firstResponse.remainingMin, 0);
  const late = computeTicketSla(mk({ priority: prio, comments: [tech("11-09T08:31")] }), T("11-09T09:00"));
  assert.equal(late.firstResponse.state, "breached");
  const none = computeTicketSla(mk({ priority: prio }), T("11-09T08:10"));
  assert.equal(none.firstResponse.respondedAt, null);
  assert.equal(none.firstResponse.remainingMin, 20);
  assert.equal(none.resolution.resolvedAt, null);
  assert.equal(none.resolution.state, "running");
});

test("resolução dentro e fora do prazo (calendário útil)", () => {
  const ok = mk({ priority: "Alta", status: "Resolvido", comments: [statusLog("11-09T12:00", "Em Atendimento", "Resolvido")] });
  const okSla = computeTicketSla(ok, T("11-12T09:00"));
  assert.equal(okSla.resolution.consumedMin, 240); // 08:00–12:00 = 240, exatamente a meta
  assert.equal(okSla.resolution.state, "met");
  const late = mk({ priority: "Alta", status: "Resolvido", comments: [statusLog("11-09T13:31", "Em Atendimento", "Resolvido")] });
  assert.equal(computeTicketSla(late, T("11-12T09:00")).resolution.state, "breached"); // 241 min
});

// ───────────────────────── pausas ─────────────────────────

test("múltiplas pausas somam e preservam o tempo consumido", () => {
  const t = mk({
    slaEvents: [
      ev("pause", "11-09T09:00"), ev("resume", "11-09T09:30"),
      ev("pause", "11-09T10:00"), ev("resume", "11-09T10:45"),
    ],
  });
  const s = computeTicketSla(t, T("11-09T11:00"));
  assert.equal(s.pauses.length, 2);
  assert.equal(s.resolution.pausedBusinessMin, 75);
  assert.equal(s.resolution.consumedMin, 180 - 75); // 08:00–11:00 menos 30 + 45
});

test("pausa após o vencimento não apaga a violação", () => {
  const t = mk({ priority: "Urgente", slaEvents: [ev("pause", "11-09T11:00")], status: "Aguardando Solicitante" });
  const s = computeTicketSla(t, T("11-09T15:00"));
  assert.equal(s.resolution.state, "breached"); // consumiu 180 > 120 antes de pausar
  assert.equal(s.waitingRequester, true);
});

test("resolução durante a pausa encerra a contagem e usa só o tempo não pausado", () => {
  const t = mk({
    status: "Resolvido",
    slaEvents: [ev("pause", "11-09T09:00"), ev("resume", "11-09T11:00", { trigger: "ticket_resolved" })],
    comments: [statusLog("11-09T11:00", "Aguardando Solicitante", "Resolvido")],
  });
  const s = computeTicketSla(t, T("11-10T09:00"));
  assert.equal(s.resolution.consumedMin, 60); // só 08:00–09:00
  assert.equal(s.resolution.state, "met");
  assert.equal(s.waitingRequester, false);
});

test("pausa não é descontada duas vezes quando atravessa almoço e noite", () => {
  const t = mk({ createdAt: iso("11-09T16:00"), slaEvents: [ev("pause", "11-09T17:00"), ev("resume", "11-10T08:42")] });
  const s = computeTicketSla(t, T("11-10T09:42"));
  // útil: 16–17 (60) + 08:42–09:42 (60) = 120; pausa útil: 17–18 (60) + 07:42–08:42 (60)
  assert.equal(s.resolution.consumedMin, 120);
  assert.equal(s.resolution.pausedBusinessMin, 120);
});

// ───────────────────────── prioridade: inicial vs. alteração ─────────────────────────

test("classificação inicial (triagem local/IA) não é alteração nem trava violação", () => {
  const t = mk({
    priority: "Alta",
    slaEvents: [
      ev("priority_initial", "11-09T08:00", { source: "triagem_local", toPriority: "Média", suggestedPriority: "Média", suggestedAt: iso("11-09T08:00") }),
      ev("priority_initial", "11-09T08:01", { source: "ia", fromPriority: "Média", toPriority: "Alta", suggestedPriority: "Alta", suggestedAt: iso("11-09T08:01") }),
    ],
  });
  const s = computeTicketSla(t, T("11-09T08:10"));
  assert.equal(s.priorityHistory.length, 2);
  assert.ok(s.priorityHistory.every((h) => h.kind === "initial"));
  assert.equal(s.firstResponse.breachedBefore, false);
  assert.equal(s.firstResponse.targetMin, 30); // meta da prioridade efetivamente adotada
});

test("alteração posterior (opção A): mantém o consumido e usa a meta nova; violação anterior permanece", () => {
  const t = mk({
    priority: "Baixa",
    slaEvents: [ev("priority_change", "11-09T09:00", { fromPriority: "Urgente", toPriority: "Baixa", breached: { firstResponse: true, resolution: false } })],
  });
  const s = computeTicketSla(t, T("11-09T09:30"));
  assert.equal(s.resolution.consumedMin, 90); // relógio não reiniciou
  assert.equal(s.resolution.targetMin, 960); // meta nova
  assert.equal(s.firstResponse.state, "breached"); // violação anterior preservada
  assert.equal(s.firstResponse.breachedBefore, true);
  assert.equal(s.priorityHistory[0].kind, "change");
});

// ───────────────────────── reaberturas ─────────────────────────

const reopenEv = (at: string, extra: Partial<SlaEvent> = {}) =>
  ev("reopen", at, { reason: "O erro voltou a ocorrer após a atualização", category: "problema_recorrente", ...extra });

test("snapshot grava o SLA original e fica congelado mesmo se a prioridade mudar depois", () => {
  const before = mk({ priority: "Alta", comments: [tech("11-09T08:20")] });
  const snap = buildResolutionSnapshot(before, T("11-09T10:00"));
  assert.ok(snap);
  assert.equal(snap!.targetMin, 240);
  assert.equal(snap!.consumedMin, 120);
  assert.equal(snap!.result, "met");
  assert.equal(snap!.firstResponse.result, "met");
  const resolved = mk({ priority: "Urgente" /* mudou depois */, status: "Resolvido", slaEvents: [ev("resolve", "11-09T10:00", { first: true, snapshot: snap! })], comments: tech("11-09T08:20") ? [tech("11-09T08:20")] : [] });
  const s = computeTicketSla(resolved, T("11-20T10:00"));
  assert.equal(s.resolution.source, "snapshot");
  assert.equal(s.resolution.targetMin, 240); // não vira 120
  assert.equal(s.resolution.state, "met");
});

test("primeira reabertura: SLA original preservado e ciclo com tempo de correção próprio", () => {
  const snap = buildResolutionSnapshot(mk({ priority: "Média" }), T("11-09T10:00"))!;
  const t = mk({
    status: "Em Atendimento",
    slaEvents: [ev("resolve", "11-09T10:00", { first: true, snapshot: snap }), reopenEv("11-09T13:30"), ev("resolve", "11-09T14:30")],
  });
  const s = computeTicketSla({ ...t, status: "Resolvido" }, T("11-10T09:00"));
  assert.equal(s.resolution.consumedMin, 120);
  assert.equal(s.cycles.length, 1);
  assert.equal(s.cycles[0].correctionMin, 60);
  assert.equal(s.cycles[0].category, "problema_recorrente");
  assert.equal(s.cycles[0].ongoing, false);
  assert.equal(s.reopened, false);
});

test("múltiplas reaberturas: cada ciclo é preservado separadamente", () => {
  const snap = buildResolutionSnapshot(mk(), T("11-09T10:00"))!;
  const t = mk({
    status: "Em Atendimento",
    slaEvents: [
      ev("resolve", "11-09T10:00", { first: true, snapshot: snap }),
      reopenEv("11-09T13:30"), ev("resolve", "11-09T14:00"),
      reopenEv("11-10T08:00", { category: "ajuste_complementar" }),
    ],
  });
  const s = computeTicketSla(t, T("11-10T09:30"));
  assert.equal(s.cycles.length, 2);
  assert.equal(s.cycles[0].correctionMin, 30);
  assert.equal(s.cycles[0].ongoing, false);
  assert.equal(s.cycles[1].correctionMin, 90); // reaberto às 08:00, agora 09:30
  assert.equal(s.cycles[1].ongoing, true);
});

test("pausa dentro do ciclo de correção é descontada do tempo de correção", () => {
  const snap = buildResolutionSnapshot(mk(), T("11-09T10:00"))!;
  const t = mk({
    slaEvents: [
      ev("resolve", "11-09T10:00", { first: true, snapshot: snap }),
      reopenEv("11-09T13:30"),
      ev("pause", "11-09T14:00"), ev("resume", "11-09T14:30"),
    ],
  });
  const s = computeTicketSla(t, T("11-09T15:00"));
  assert.equal(s.cycles[0].correctionMin, 60); // 90 min úteis − 30 de pausa
});

test("reabertura exige motivo descritivo e categoria (verificação de integridade)", () => {
  const snap = buildResolutionSnapshot(mk(), T("11-09T10:00"))!;
  const bad = [ev("resolve", "11-09T10:00", { first: true, snapshot: snap }), ev("reopen", "11-09T13:30", { reason: "voltou" })];
  const r = verifySlaEvents(bad);
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /justificativa/.test(p)));
  assert.ok(r.problems.some((p) => /categoria/.test(p)));
  const good = [ev("resolve", "11-09T10:00", { first: true, snapshot: snap }), reopenEv("11-09T13:30")];
  assert.equal(verifySlaEvents(good).ok, true);
});

test("verifySlaEvents detecta sequência quebrada, pausa sobreposta e retomada sem pausa", () => {
  const e1 = { ...ev("pause", "11-09T09:00"), seq: 1 };
  const e3 = { ...ev("resume", "11-09T10:00"), seq: 3 };
  assert.ok(verifySlaEvents([e1, e3]).problems.some((p) => /Sequência quebrada/.test(p)));
  assert.ok(verifySlaEvents([ev("pause", "11-09T09:00"), ev("pause", "11-09T09:10")]).problems.some((p) => /sobreposta/.test(p)));
  assert.ok(verifySlaEvents([ev("resume", "11-09T09:00")]).problems.some((p) => /sem pausa/.test(p)));
});

test("união de eventos nunca perde registros (recuperação entre cópias)", () => {
  const a = [{ ...ev("pause", "11-09T09:00"), seq: 1, id: "a" }, { ...ev("resume", "11-09T09:30"), seq: 2, id: "b" }];
  const b = [{ ...ev("pause", "11-09T09:00"), seq: 1, id: "a" }];
  assert.equal(unionSlaEvents(a, b).length, 2);
  assert.equal(unionSlaEvents(b, a).length, 2);
  assert.equal(nextSeq(a), 3);
});

// ───────────────────────── vigência ─────────────────────────

const ACTIVE: SlaPolicy = { ...SLA_POLICY, activatedAt: iso("11-10T00:00") };

test("vigência: sem ativação é pré-visualização; após ativar, chamados antigos são 'legacy'", () => {
  const old = mk({ createdAt: iso("11-09T08:00") });
  const fresh = mk({ createdAt: iso("11-10T08:00") });
  assert.equal(computeTicketSla(old, T("11-10T09:00")).era, "preview");
  assert.equal(computeTicketSla(old, T("11-10T09:00"), { policy: ACTIVE }).era, "legacy");
  assert.equal(computeTicketSla(fresh, T("11-10T09:00"), { policy: ACTIVE }).era, "new");
  const m = computeSlaMetrics([old, fresh], T("11-10T09:00"), { policy: ACTIVE });
  assert.equal(m.legacyExcluded, 1);
  assert.equal(m.considered, 1);
  assert.equal(m.previewMode, false);
  assert.equal(computeSlaMetrics([old], T("11-10T09:00")).previewMode, true);
});

// ───────────────────────── indicadores ─────────────────────────

const resolved = (id: string, prio: string, resolvedAt: string, extra: Partial<Ticket> = {}) =>
  mk({ id, priority: prio as Ticket["priority"], status: "Resolvido", comments: [tech("11-09T08:05"), statusLog(resolvedAt, "Em Atendimento", "Resolvido")], ...extra });

test("nenhum chamado avaliável: sem dados (nunca 100%)", () => {
  const m = computeSlaMetrics([], T("11-12T09:00"));
  assert.equal(m.resolution.pct, null);
  assert.equal(m.firstResponse.pct, null);
  assert.equal(m.reopening.pct, null);
  assert.equal(m.avgResolutionMin, null);
});

test("todos no prazo = 100%; todos atrasados = 0%; parte no prazo", () => {
  const ok = [resolved("1", "Média", "11-09T10:00"), resolved("2", "Média", "11-09T11:00")];
  assert.equal(computeSlaMetrics(ok, T("11-12T09:00")).resolution.pct, 100);
  const late = [resolved("3", "Urgente", "11-09T12:00"), resolved("4", "Urgente", "11-09T13:40")];
  const mLate = computeSlaMetrics(late, T("11-12T09:00"));
  assert.equal(mLate.resolution.pct, 0);
  assert.equal(mLate.resolvedLate, 2);
  // exemplo do relatório: 17 no prazo, 3 atrasados → 85%
  const many = [
    ...Array.from({ length: 17 }, (_, i) => resolved(`o${i}`, "Média", "11-09T10:00")),
    ...Array.from({ length: 3 }, (_, i) => resolved(`l${i}`, "Urgente", "11-09T13:40")),
  ];
  const m = computeSlaMetrics(many, T("11-12T09:00"));
  assert.deepEqual([m.resolution.met, m.resolution.breached, m.resolution.evaluated, m.resolution.pct], [17, 3, 20, 85]);
});

test("chamados abertos não entram na eficiência; vencidos e em risco aparecem no operacional", () => {
  const openLate = mk({ id: "a", priority: "Urgente" }); // 120 min: consumiu 360
  const openRisk = mk({ id: "b", priority: "Média" }); // 480 min: consumiu 360 → restam 25%
  const openOk = mk({ id: "c", priority: "Baixa" }); // 960 min
  const m = computeSlaMetrics([openLate, openRisk, openOk], T("11-09T15:30")); // 08–12 (240) + 13:30–15:30 (120) = 360
  assert.equal(m.resolution.pct, null);
  assert.equal(m.resolution.evaluated, 0);
  assert.equal(m.openOverdue, 1);
  assert.equal(m.nearDue, 1);
});

test("reabertura: coorte de resolvidos, chamado distinto contado uma vez, ciclos separados", () => {
  const snap = buildResolutionSnapshot(mk(), T("11-09T10:00"))!;
  const withReopens = (id: string) => mk({
    id, status: "Resolvido",
    slaEvents: [
      ev("resolve", "11-09T10:00", { first: true, snapshot: snap }),
      reopenEv("11-09T13:30"), ev("resolve", "11-09T14:00"),
      reopenEv("11-10T08:00", { category: "ajuste_complementar" }), ev("resolve", "11-10T09:00"),
    ],
  });
  const plain = (id: string) => resolved(id, "Média", "11-09T10:00");
  const m = computeSlaMetrics([withReopens("r1"), plain("p1"), plain("p2"), plain("p3")], T("11-12T09:00"));
  assert.equal(m.reopening.cohort, 4);
  assert.equal(m.reopening.reopenedTickets, 1);
  assert.equal(m.reopening.pct, 25);
  assert.equal(m.reopening.cycles, 2);
  assert.equal(m.reopening.completedCycles, 2);
  assert.equal(m.reopening.avgCorrectionMin, 45); // (30 + 60) / 2
  assert.equal(m.resolution.evaluated, 4); // reaberturas não viram novos chamados
  assert.deepEqual(m.reopening.topReasons.map((r) => r.count), [1, 1]);
});

test("reaberto agora: aparece como reaberto e não como vencido pelo SLA original", () => {
  const snap = buildResolutionSnapshot(mk({ priority: "Urgente" }), T("11-09T16:00"))!; // resolveu atrasado
  const t = mk({ priority: "Urgente", slaEvents: [ev("resolve", "11-09T16:00", { first: true, snapshot: snap }), reopenEv("11-10T08:00")] });
  const m = computeSlaMetrics([t], T("11-10T09:00"));
  assert.equal(m.reopening.currentlyReopened, 1);
  assert.equal(m.openOverdue, 0);
  assert.equal(m.resolution.breached, 1); // o original continua vencido
  assert.equal(isReopened(t, T("11-10T09:00")), true);
});

test("filtro de período: indicadores refletem somente os chamados do período", () => {
  const a = resolved("a", "Média", "11-09T10:00", { createdAt: iso("11-09T08:00") });
  const b = resolved("b", "Urgente", "11-16T16:00", { createdAt: iso("11-16T08:00"), comments: [tech("11-16T08:05"), statusLog("11-16T16:00", "Em Atendimento", "Resolvido")] });
  const all = [a, b];
  const week1 = all.filter((t) => Date.parse(t.createdAt) < T("11-15T00:00"));
  assert.equal(computeSlaMetrics(week1, T("11-20T09:00")).resolution.pct, 100);
  assert.equal(computeSlaMetrics(all, T("11-20T09:00")).resolution.pct, 50);
});

test("Resolvido→Fechado e entradas duplicadas contam uma vez", () => {
  const t = mk({ id: "x", status: "Fechado", comments: [tech("11-09T08:10"), statusLog("11-09T10:00", "Em Atendimento", "Resolvido"), statusLog("11-10T09:00", "Resolvido", "Fechado")] });
  const m = computeSlaMetrics([t, t], T("11-12T09:00"));
  assert.equal(m.resolution.evaluated, 1);
});

// ───────────────────────── compatibilidade (consumidores legados) ─────────────────────────

test("compat: atraso vem do motor útil, não do slaLimit em horas corridas", () => {
  // slaLimit (corrido) já passou, mas pelo calendário útil ainda está no prazo
  const withinBusiness = mk({ priority: "Média", createdAt: iso("11-06T17:00"), slaLimit: iso("11-06T18:00") });
  assert.equal(isTicketOverdue(withinBusiness, T("11-09T08:00")), false);
  // slaLimit no futuro, mas o motor útil já estourou a meta
  const breached = mk({ priority: "Urgente", slaLimit: iso("11-30T08:00") });
  assert.equal(isTicketOverdue(breached, T("11-09T12:00")), true);
  assert.equal(getSlaEscalation(breached, T("11-09T12:00")).label, "ATRASADO");
});

test("compat: chamado pausado, em risco, concluído e sem SLA", () => {
  assert.equal(getSlaEscalation(mk({ status: "Aguardando Solicitante", slaEvents: [ev("pause", "11-09T08:30")] }), T("11-09T09:00")).label, "PAUSADO");
  assert.equal(getSlaEscalation(resolved("z", "Média", "11-09T10:00"), T("11-12T09:00")).label, "CONCLUÍDO");
  assert.equal(getSlaEscalation(mk({ priority: "Outra" as any }), T("11-09T09:00")).label, "SEM SLA");
  assert.equal(getSlaEscalation(mk({ priority: "Alta", comments: [tech("11-09T08:10")] }), T("11-09T11:20")).label, "EM RISCO");
});

test("compat: projeto mantém o prazo próprio do projeto", () => {
  const p = mk({ projectDeadline: "2026-11-01" });
  assert.equal(isTicketOverdue(p, T("11-09T09:00")), true);
  assert.equal(isTicketOverdue(mk({ projectDeadline: "2026-12-30" }), T("11-09T09:00")), false);
});

test("integridade: chamado resolvido antes da trilha (só no log) e depois reaberto NÃO é inconsistência", () => {
  const legacy = mk({
    status: "Em Atendimento",
    comments: [statusLog("11-09T10:00", "Em Atendimento", "Resolvido")],
    slaEvents: [{ ...reopenEv("11-10T08:00"), seq: 1 }, { ...ev("resolve", "11-10T09:00"), seq: 2 }],
  });
  assert.equal(computeTicketSla({ ...legacy, status: "Resolvido" }, T("11-12T09:00")).integrity.ok, true);
  // sem resolução anterior em lugar nenhum, continua sendo inconsistência
  const orphan = mk({ slaEvents: [{ ...reopenEv("11-10T08:00"), seq: 1 }] });
  assert.equal(computeTicketSla(orphan, T("11-12T09:00")).integrity.ok, false);
});
