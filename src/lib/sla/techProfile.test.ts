/**
 * SLA e TMA do técnico no perfil: casos CONHECIDOS (calculados à mão) respeitando expediente, pausas e a política.
 * Calendário: seg–sex 07:42–12:00 e 13:30–18:00, America/Bahia. 2026-11-09 é segunda-feira.
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { Comment, SlaEvent, Ticket } from "../../types";
import { buildTechPerformance, evaluateTickets, techProfileMetrics } from "./dashboardData";
import { buildResolutionSnapshot, formatBusinessMinutes } from "./ticketSla";

const T = (l: string) => Date.parse(`2026-${l}:00-03:00`);
const iso = (l: string) => new Date(T(l)).toISOString();
let n = 0;
const resolveLog = (at: string): Comment => ({ id: `s${++n}`, authorName: "Sistema", authorRole: "system", content: "Status alterado de **Em Atendimento** para **Resolvido**", timestamp: iso(at) });
const ev = (type: SlaEvent["type"], at: string, x: Partial<SlaEvent> = {}): SlaEvent => ({ id: `e${++n}`, type, at: iso(at), by: "Ana", ...x });
const mk = (created: string, resolvedAt: string | null, o: Partial<Ticket> = {}): Ticket => ({
  id: String(++n), title: "t", description: "d", category: "Software", priority: "Média", status: resolvedAt ? "Resolvido" : "Em Atendimento", requesterName: "Solic", requesterDepartment: "X",
  assignedTo: "Ana", createdAt: iso(created), updatedAt: iso(resolvedAt ?? created), slaLimit: "", aiCategory: "", aiPriority: "", aiReasoning: "", aiSuggestions: "",
  comments: resolvedAt ? [resolveLog(resolvedAt)] : [], ...o,
});
const NOW = T("11-30T09:00");

// Casos conhecidos (todos Média: meta de resolução 480 min úteis)
const A = () => mk("11-09T08:00", "11-09T10:00"); // 08–10 = 120
const B = () => mk("11-06T17:00", "11-09T08:42"); // sex 17–18 (60) + seg 07:42–08:42 (60) = 120  (63h42 corridas)
const C = () => mk("11-05T16:00", "11-06T11:00", { slaEvents: [ev("pause", "11-05T17:00", { reason: "Aguardando print" }), ev("resume", "11-06T09:00", { trigger: "requester_reply" })] }); // 318 − 138 de pausa = 180
const D = () => mk("11-07T10:00", "11-09T08:00"); // aberto no sábado: conta só a partir de seg 07:42 = 18
const I = () => mk("11-09T08:00", "11-09T13:31", { priority: "Alta" }); // Alta (240): 240 + 1 = 241 → fora do prazo

test("TMA em horas úteis: 4 casos conhecidos = (120 + 120 + 180 + 18) / 4 = 109,5 min", () => {
  const m = techProfileMetrics([A(), B(), C(), D()], "Ana", NOW);
  assert.equal(m.avgResolutionMin, 109.5);
  assert.equal(formatBusinessMinutes(m.avgResolutionMin), "1h 50min");
  assert.deepEqual([m.resolved, m.onTime, m.pct], [4, 4, 100]);
});

test("cada caso individual bate com o cálculo manual (expediente, fim de semana, pausa)", () => {
  const one = (t: Ticket) => techProfileMetrics([t], "Ana", NOW).avgResolutionMin;
  assert.equal(one(A()), 120);
  assert.equal(one(B()), 120); // o tempo corrido seria ~3.822 min
  assert.equal(one(C()), 180); // pausa descontada só dentro do expediente
  assert.equal(one(D()), 18); // sábado conta só no próximo período útil
});

test("TMA em horas úteis difere do tempo corrido antigo (updatedAt − createdAt)", () => {
  const b = B();
  const wallClockMin = (Date.parse(b.updatedAt) - Date.parse(b.createdAt)) / 60000;
  assert.ok(wallClockMin > 3800);
  assert.equal(techProfileMetrics([b], "Ana", NOW).avgResolutionMin, 120);
});

test("resolvido fora do prazo entra no TMA e no denominador do SLA (4 de 5 = 80%)", () => {
  const m = techProfileMetrics([A(), B(), C(), D(), I()], "Ana", NOW);
  assert.deepEqual([m.resolved, m.onTime, m.pct], [5, 4, 80]);
  assert.ok(Math.abs(m.avgResolutionMin! - (120 + 120 + 180 + 18 + 241) / 5) < 1e-9);
});

test("chamados abertos, de projeto e de outro técnico ficam de fora", () => {
  const open = mk("11-09T08:00", null);
  const project = mk("11-09T08:00", "11-09T10:00", { projectDeadline: "2026-12-30" });
  const other = mk("11-09T08:00", "11-09T12:00", { assignedTo: "Bruno" });
  const m = techProfileMetrics([A(), open, project, other], "Ana", NOW);
  assert.deepEqual([m.resolved, m.avgResolutionMin], [1, 120]);
});

test("vários técnicos: o chamado conta só para o responsável (primeiro vigente)", () => {
  const shared = mk("11-09T08:00", "11-09T10:00", { assignedTo: "Ana, Bruno", firstAssignedTo: "Ana" });
  assert.equal(techProfileMetrics([shared], "Ana", NOW).resolved, 1);
  assert.equal(techProfileMetrics([shared], "Bruno", NOW).resolved, 0);
});

test("reabertura não altera o TMA nem o SLA: vale a primeira resolução (SLA original)", () => {
  const base = mk("11-09T08:00", null, { status: "Em Atendimento" });
  const snap = buildResolutionSnapshot(base, T("11-09T10:00"))!;
  const reopened = mk("11-09T08:00", null, {
    status: "Em Atendimento",
    slaEvents: [ev("resolve", "11-09T10:00", { first: true, snapshot: snap }), ev("reopen", "11-09T13:30", { reason: "O erro voltou a ocorrer", category: "problema_recorrente" })],
  });
  const m = techProfileMetrics([reopened], "Ana", NOW);
  assert.deepEqual([m.resolved, m.avgResolutionMin, m.pct], [1, 120, 100]);
});

test("sem resolvidos avaliáveis: 'Sem dados' (null), nunca 0 nem 100%", () => {
  const m = techProfileMetrics([mk("11-09T08:00", null)], "Ana", NOW);
  assert.deepEqual([m.resolved, m.pct, m.avgResolutionMin], [0, null, null]);
  assert.deepEqual(techProfileMetrics([], "Ana", NOW), { resolved: 0, onTime: 0, pct: null, avgResolutionMin: null });
});

test("perfil e tabela 'Desempenho por Técnico' concordam (mesma população e regra)", () => {
  const list = [A(), B(), C(), D(), I(), mk("11-09T08:00", "11-09T12:00", { assignedTo: "Bruno" })];
  for (const name of ["Ana", "Bruno"]) {
    const row = buildTechPerformance(evaluateTickets(list, NOW)).find((r) => r.name === name)!;
    const m = techProfileMetrics(list, name, NOW);
    assert.deepEqual([m.resolved, m.onTime, m.pct], [row.resolved, row.onTime, row.pct], name);
  }
});
