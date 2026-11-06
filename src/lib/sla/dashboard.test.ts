/**
 * Testes das agregações do dashboard. Garantem que os painéis conciliam com o motor
 * (`computeSlaMetrics`) e que ausência de dados nunca vira 0% nem 100%.
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { Comment, SlaEvent, Ticket } from "../../types";
import { computeSlaMetrics } from "./metrics";
import { buildLateByCategory, buildReopenReasons, buildStatusDistribution, buildTechPerformance, buildTrend, classifyStatus, evaluateTickets, responsibleOf, summarize } from "./dashboardData";
import { buildResolutionSnapshot } from "./ticketSla";

const T = (local: string) => Date.parse(`2026-${local}:00-03:00`);
const iso = (local: string) => new Date(T(local)).toISOString();
let n = 0;
const sys = (at: string, content: string): Comment => ({ id: `s${++n}`, authorName: "Sistema", authorRole: "system", content, timestamp: iso(at) });
const resolveLog = (at: string) => sys(at, "Status alterado de **Em Atendimento** para **Resolvido**");
const tech = (at: string, name = "Ana"): Comment => ({ id: `t${++n}`, authorName: name, authorRole: "tecnico", content: "ok", timestamp: iso(at) });
const ev = (type: SlaEvent["type"], at: string, x: Partial<SlaEvent> = {}): SlaEvent => ({ id: `e${++n}`, type, at: iso(at), by: "Ana", ...x });
const mk = (o: Partial<Ticket> = {}): Ticket => ({
  id: String(++n), title: "t", description: "d", category: "Software", priority: "Média", status: "Em Atendimento", requesterName: "Solic", requesterDepartment: "X",
  assignedTo: "Ana", createdAt: iso("11-09T08:00"), updatedAt: iso("11-09T08:00"), slaLimit: "", aiCategory: "", aiPriority: "", aiReasoning: "", aiSuggestions: "", comments: [], ...o,
});
const NOW = T("11-30T09:00");
const done = (cat: string, prio: string, at: string, who = "Ana", created = "11-09T08:00") =>
  mk({ category: cat as any, priority: prio as any, assignedTo: who, status: "Resolvido", createdAt: iso(created), comments: [tech("11-09T08:05", who), resolveLog(at)] });

const sample = (): Ticket[] => {
  const snap = buildResolutionSnapshot(mk(), T("11-09T10:00"))!;
  return [
    done("Hardware", "Média", "11-09T10:00"), // no prazo
    done("Hardware", "Urgente", "11-09T13:40"), // atrasado
    done("Software", "Urgente", "11-09T13:40", "Bia"), // atrasado
    done("Redes", "Média", "11-10T09:00", "Bia"), // no prazo? 08:00→(dia seguinte 09:00) = 528+78... atrasado
    mk({ priority: "Urgente" }), // aberto vencido
    mk({ priority: "Média", createdAt: iso("11-30T08:00") }), // aberto dentro do prazo
    mk({ status: "Aguardando Solicitante", slaEvents: [ev("pause", "11-09T09:00")] }),
    mk({ status: "Aberto", assignedTo: null }),
    mk({ status: "Em Atendimento", slaEvents: [ev("resolve", "11-09T10:00", { first: true, snapshot: snap }), ev("reopen", "11-10T08:00", { reason: "Voltou a falhar de novo", category: "problema_recorrente" })] }),
    mk({ projectDeadline: "2026-12-30" }),
  ];
};

test("situação dos chamados: categorias exclusivas e soma igual ao total", () => {
  const items = evaluateTickets(sample(), NOW);
  const dist = buildStatusDistribution(items);
  assert.equal(dist.total, 10);
  assert.equal(dist.slices.reduce((s, x) => s + x.count, 0), dist.total);
  assert.ok(Math.abs(dist.slices.reduce((s, x) => s + x.pct, 0) - 100) < 0.6);
  // um chamado em risco/vencido NÃO é também "em atendimento"
  const overdue = items.find((e) => e.ticket.priority === "Urgente" && e.ticket.status === "Em Atendimento" && !e.sla.reopened)!;
  assert.equal(classifyStatus(overdue), "overdue");
});

test("situação: aguardando e reaberto têm prioridade sobre risco/vencimento; projeto não recebe risco", () => {
  const items = evaluateTickets(sample(), NOW);
  const byKey = Object.fromEntries(buildStatusDistribution(items).slices.map((s) => [s.key, s.count]));
  assert.equal(byKey.waiting, 1);
  assert.equal(byKey.reopened, 1);
  const project = items.find((e) => e.ticket.projectDeadline)!;
  assert.equal(classifyStatus(project), "in_progress");
});

test("situação: chamado resolvido sem data confiável não é contado como no prazo", () => {
  const items = evaluateTickets([mk({ status: "Resolvido" })], NOW);
  assert.equal(classifyStatus(items[0]), "resolved_unrated");
});

test("categorias com mais atrasos: só resolvidos fora do prazo, soma 100%", () => {
  const items = evaluateTickets(sample(), NOW);
  const late = buildLateByCategory(items);
  const m = computeSlaMetrics(sample(), NOW);
  assert.equal(late.totalLate, m.resolvedLate); // concilia com o motor
  assert.equal(late.rows.reduce((s, r) => s + r.late, 0), late.totalLate);
  assert.ok(late.rows.every((r, i, a) => i === 0 || a[i - 1].late >= r.late)); // ordenado
  assert.ok(Math.abs(late.rows.reduce((s, r) => s + r.pct, 0) - 100) < 0.6);
});

test("categorias: sem atrasos devolve lista vazia", () => {
  const items = evaluateTickets([done("Redes", "Média", "11-09T10:00")], NOW);
  assert.deepEqual(buildLateByCategory(items), { totalLate: 0, rows: [] });
});

test("motivos de reabertura: só os existentes; sem reaberturas = vazio", () => {
  const items = evaluateTickets(sample(), NOW);
  const r = buildReopenReasons(items);
  assert.deepEqual(r.rows.map((x) => [x.category, x.count, x.pct]), [["problema_recorrente", 1, 100]]);
  assert.deepEqual(buildReopenReasons(evaluateTickets([mk()], NOW)).rows, []);
});

test("técnicos: chamado com vários técnicos conta uma vez e a soma concilia com o motor", () => {
  const multi = done("Software", "Média", "11-09T10:00", "Ana, Bia");
  const list = [...sample(), multi];
  const items = evaluateTickets(list, NOW);
  const rows = buildTechPerformance(items);
  const m = computeSlaMetrics(list, NOW);
  assert.equal(rows.reduce((s, r) => s + r.resolved, 0), m.resolution.evaluated);
  assert.equal(rows.reduce((s, r) => s + r.onTime, 0), m.resolution.met);
  assert.equal(responsibleOf(multi), "Ana");
});

test("técnico sem chamados avaliáveis aparece como 'sem dados' (null), nunca 100%", () => {
  const items = evaluateTickets([mk({ assignedTo: "Carlos" })], NOW);
  const row = buildTechPerformance(items).find((r) => r.name === "Carlos")!;
  assert.equal(row.resolved, 0);
  assert.equal(row.pct, null);
});

test("responsável: firstAssignedTo só vale se ainda estiver atribuído", () => {
  assert.equal(responsibleOf(mk({ assignedTo: "Bia, Ana", firstAssignedTo: "Ana" })), "Ana");
  assert.equal(responsibleOf(mk({ assignedTo: "Bia", firstAssignedTo: "Ana" })), "Bia");
  assert.equal(responsibleOf(mk({ assignedTo: null })), null);
});

test("tendência: dias sem chamados ficam como ausência (null), não 0% nem 100%", () => {
  const list = [done("Hardware", "Média", "11-09T10:00"), done("Hardware", "Média", "11-12T10:00", "Ana", "11-12T08:00")];
  const trend = buildTrend(evaluateTickets(list, NOW));
  assert.equal(trend.granularity, "day");
  assert.equal(trend.points.length, 4); // 09, 10, 11, 12
  assert.equal(trend.points[0].resolution.pct, 100);
  assert.equal(trend.points[1].resolution.pct, null);
  assert.equal(trend.points[1].resolution.evaluated, 0);
  assert.equal(trend.points[2].firstResponse.pct, null);
  assert.equal(trend.populated, 2);
});

test("tendência: cada ponto usa só chamados avaliáveis do intervalo e concilia com o total", () => {
  const items = evaluateTickets(sample(), NOW);
  const trend = buildTrend(items);
  const m = computeSlaMetrics(sample(), NOW);
  assert.equal(trend.points.reduce((s, p) => s + p.resolution.evaluated, 0), m.resolution.evaluated);
  assert.equal(trend.points.reduce((s, p) => s + p.resolution.met, 0), m.resolution.met);
});

test("tendência: período longo agrupa por semana e por mês", () => {
  const long = (days: number) => [
    done("Hardware", "Média", "11-09T10:00"),
    mk({ status: "Resolvido", createdAt: new Date(T("11-09T08:00") + days * 86_400_000).toISOString(), comments: [tech("11-09T08:05"), sys("11-09T08:06", "x")] }),
  ];
  const resolvedLater = (days: number) => {
    const created = new Date(T("11-09T08:00") + days * 86_400_000);
    const at = new Date(created.getTime() + 3600_000);
    return mk({ status: "Resolvido", createdAt: created.toISOString(), comments: [{ ...tech("11-09T08:05"), timestamp: new Date(created.getTime() + 600_000).toISOString() }, { ...resolveLog("11-09T08:00"), timestamp: at.toISOString() }] });
  };
  void long;
  assert.equal(buildTrend(evaluateTickets([done("Hardware", "Média", "11-09T10:00"), resolvedLater(60)], T("12-30T09:00") + 86_400_000 * 60)).granularity, "week");
  assert.equal(buildTrend(evaluateTickets([done("Hardware", "Média", "11-09T10:00"), resolvedLater(200)], T("12-30T09:00") + 86_400_000 * 300)).granularity, "month");
});

test("tendência sem chamados avaliáveis: vazia", () => {
  assert.deepEqual(buildTrend(evaluateTickets([mk()], NOW)).points.filter((p) => p.resolution.evaluated > 0), []);
  assert.equal(buildTrend([]).points.length, 0);
});

test("resumo: abertos com SLA aplicável", () => {
  const s = summarize(evaluateTickets(sample(), NOW));
  assert.equal(s.total, 10);
  assert.equal(s.openApplicable, 4); // vencido, dentro do prazo, aguardando e aberto; o reaberto já tem 1ª resolução e o projeto não tem SLA
});
