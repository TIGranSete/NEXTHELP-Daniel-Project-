/**
 * Política de qualidade: a estrutura futura é só contrato (sem nota, sem ranking) e amostras pequenas
 * não recebem classificação. Também garante que nada de avaliação vaza para o motor de SLA.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { QUALITY_REVIEW_STATES, SMALL_SAMPLE_MIN, isSmallSample } from "./quality";
import { buildTechPerformance, evaluateTickets } from "./sla/dashboardData";
import { computeSlaMetrics } from "./sla/metrics";
import { computeTicketSla } from "./sla/ticketSla";
import { buildResolutionSnapshot } from "./sla/ticketSla";
import type { SlaEvent, Ticket } from "../types";

const T = (l: string) => Date.parse(`2026-${l}:00-03:00`);
const iso = (l: string) => new Date(T(l)).toISOString();
let n = 0;
const ev = (type: SlaEvent["type"], at: string, x: Partial<SlaEvent> = {}): SlaEvent => ({ id: `e${++n}`, type, at: iso(at), by: "Ana", ...x });
const mk = (o: Partial<Ticket> = {}): Ticket => ({
  id: String(++n), title: "t", description: "d", category: "Software", priority: "Média", status: "Resolvido", requesterName: "S", requesterDepartment: "X", assignedTo: "Ana",
  createdAt: iso("11-09T08:00"), updatedAt: iso("11-09T08:00"), slaLimit: "", aiCategory: "", aiPriority: "", aiReasoning: "", aiSuggestions: "", comments: [], ...o,
});

test("os quatro estados previstos existem, mas nenhum chamado possui avaliação", () => {
  assert.deepEqual(QUALITY_REVIEW_STATES.map((s) => s.value), ["pending", "adequate", "needs_review", "inconclusive"]);
  const t = mk();
  assert.equal("qualityReview" in t, false); // sem campo persistente no chamado
});

test("amostra pequena: limite de apresentação provisório (não altera cálculos)", () => {
  assert.equal(isSmallSample(SMALL_SAMPLE_MIN - 1), true);
  assert.equal(isSmallSample(SMALL_SAMPLE_MIN), false);
});

test("a tabela por técnico não expõe reaberturas nem nota (sem ranking de reaberturas)", () => {
  const snap = buildResolutionSnapshot(mk({ status: "Em Atendimento" }), T("11-09T10:00"))!;
  const reopened = mk({ slaEvents: [ev("resolve", "11-09T10:00", { first: true, snapshot: snap }), ev("reopen", "11-09T13:30", { reason: "O erro voltou a ocorrer", category: "problema_recorrente" }), ev("resolve", "11-09T14:30")] });
  const rows = buildTechPerformance(evaluateTickets([reopened], T("11-12T09:00")));
  assert.deepEqual(Object.keys(rows[0]).sort(), ["name", "onTime", "pct", "resolved"]);
});

test("reabrir não altera o resultado do SLA original nem a eficiência", () => {
  const snap = buildResolutionSnapshot(mk({ status: "Em Atendimento" }), T("11-09T10:00"))!;
  const resolvedOnly = mk({ slaEvents: [ev("resolve", "11-09T10:00", { first: true, snapshot: snap })] });
  const reopened = { ...resolvedOnly, id: "r", slaEvents: [...resolvedOnly.slaEvents!, ev("reopen", "11-09T13:30", { reason: "O erro voltou a ocorrer", category: "problema_recorrente" })], status: "Em Atendimento" as const };
  const a = computeTicketSla(resolvedOnly, T("11-12T09:00")).resolution;
  const b = computeTicketSla(reopened, T("11-12T09:00")).resolution;
  assert.equal(a.state, b.state);
  assert.equal(a.consumedMin, b.consumedMin);
  assert.equal(computeSlaMetrics([resolvedOnly], T("11-12T09:00")).resolution.pct, computeSlaMetrics([reopened], T("11-12T09:00")).resolution.pct);
});
