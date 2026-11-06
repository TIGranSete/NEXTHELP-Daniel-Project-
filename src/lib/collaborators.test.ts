/**
 * Testes da listagem de colaboradores: garantem que busca, filtros, ordenação e contagens
 * seguem exatamente a regra original (movida do App.tsx).
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { Ticket, User } from "../types";
import {
  DEFAULT_COLLAB_FILTERS, buildTicketCounts, countAccounts, departmentsOf, filterAndSortUsers, hasActiveCollabFilters, initialsOf, isUserOnline, presenceOf,
} from "./collaborators";

const getTechs = (s: string | null) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : []);
const u = (o: Partial<User> & { name: string }): User => ({ id: o.name, email: `${o.name.toLowerCase().replace(/\s+/g, ".")}@x.com`, department: "Fiscal", role: "colaborador", ...o });
const t = (o: Partial<Ticket>): Ticket => ({
  id: String(Math.random()), title: "t", description: "d", category: "Software", priority: "Média", status: "Aberto", requesterName: "", requesterDepartment: "",
  assignedTo: null, createdAt: "", updatedAt: "", slaLimit: "", aiCategory: "", aiPriority: "", aiReasoning: "", aiSuggestions: "", comments: [], ...o,
});

const USERS: User[] = [
  u({ name: "Ana Souza", department: "Tecnologia", role: "tecnico", isOnline: true }),
  u({ name: "Bruno Lima", department: "Financeiro", isOnline: false }),
  u({ name: "Carla Dias", department: "Fiscal" }), // sem informação de presença
  u({ name: "Diego Prado", department: "Tecnologia", role: "tecnico", isOnline: false, email: "diego@gran7.com.br" }),
];
const counts = () => buildTicketCounts([
  t({ requesterName: "Bruno Lima" }), t({ requesterName: "Bruno Lima" }), t({ requesterName: "Carla Dias" }),
  t({ assignedTo: "Ana Souza", status: "Resolvido" }), t({ assignedTo: "Ana Souza, Diego Prado", status: "Fechado" }), t({ assignedTo: "Diego Prado", status: "Em Atendimento" }),
], getTechs);
const run = (f: Partial<typeof DEFAULT_COLLAB_FILTERS>, session: any = null) => filterAndSortUsers(USERS, { ...DEFAULT_COLLAB_FILTERS, ...f }, session, counts()).map((x) => x.name);

test("busca por nome, e-mail e departamento (sem diferenciar maiúsculas)", () => {
  assert.deepEqual(run({ search: "bruno" }), ["Bruno Lima"]);
  assert.deepEqual(run({ search: "DIEGO@GRAN7" }), ["Diego Prado"]);
  assert.deepEqual(run({ search: "tecnologia" }).sort(), ["Ana Souza", "Diego Prado"]);
  assert.deepEqual(run({ search: "inexistente" }), []);
});

test("filtros de departamento e nível de acesso (combinados)", () => {
  assert.deepEqual(run({ sector: "Financeiro" }), ["Bruno Lima"]);
  assert.deepEqual(run({ role: "tecnico" }).sort(), ["Ana Souza", "Diego Prado"]);
  assert.deepEqual(run({ role: "colaborador" }).sort(), ["Bruno Lima", "Carla Dias"]);
  assert.deepEqual(run({ role: "tecnico", sector: "Tecnologia", search: "ana" }), ["Ana Souza"]);
});

test("filtro de status: online = presença reportada; offline = tudo que não é online (regra original)", () => {
  assert.deepEqual(run({ status: "online" }), ["Ana Souza"]);
  assert.deepEqual(run({ status: "offline" }).sort(), ["Bruno Lima", "Carla Dias", "Diego Prado"]);
});

test("o próprio usuário logado conta como online", () => {
  assert.equal(isUserOnline(USERS[1], { name: "Bruno Lima", email: "x@y.com" }), true);
  assert.equal(isUserOnline(USERS[1], { name: "Outro", email: USERS[1].email.toUpperCase() }), true);
  assert.deepEqual(run({ status: "online" }, { name: "Carla Dias", email: "" }).sort(), ["Ana Souza", "Carla Dias"]);
});

test("exibição de presença: ausência de informação NÃO é offline", () => {
  assert.equal(presenceOf(USERS[0], null), "online");
  assert.equal(presenceOf(USERS[1], null), "offline");
  assert.equal(presenceOf(USERS[2], null), "unknown");
});

test("ordenação padrão: online primeiro, depois ordem alfabética", () => {
  assert.deepEqual(run({}), ["Ana Souza", "Bruno Lima", "Carla Dias", "Diego Prado"]);
  assert.deepEqual(run({}, { name: "Diego Prado", email: "" }), ["Ana Souza", "Diego Prado", "Bruno Lima", "Carla Dias"]);
});

test("ordenação por chamados criados e por chamados resolvidos (TI)", () => {
  assert.equal(run({ sort: "tickets_created" })[0], "Bruno Lima"); // 2 chamados
  const solved = run({ sort: "tickets_resolved" });
  assert.deepEqual(solved.slice(0, 2), ["Ana Souza", "Diego Prado"]); // Ana 2, Diego 1
});

test("contagens: chamados criados e resolvidos (vários técnicos contam para cada um)", () => {
  const c = counts();
  assert.equal(c.created.get("Bruno Lima"), 2);
  assert.equal(c.solved.get("Ana Souza"), 2);
  assert.equal(c.solved.get("Diego Prado"), 1);
});

test("limpar filtros: só habilita quando há algo aplicado", () => {
  assert.equal(hasActiveCollabFilters(DEFAULT_COLLAB_FILTERS), false);
  assert.equal(hasActiveCollabFilters({ ...DEFAULT_COLLAB_FILTERS, search: "a" }), true);
  assert.equal(hasActiveCollabFilters({ ...DEFAULT_COLLAB_FILTERS, sort: "tickets_created" }), true);
});

test("indicadores: total, equipe de TI e colaboradores (fórmula original)", () => {
  assert.deepEqual(countAccounts(USERS), { total: 4, tech: 2, collab: 2 });
  assert.deepEqual(countAccounts([]), { total: 0, tech: 0, collab: 0 });
});

test("departamentos únicos e iniciais", () => {
  assert.deepEqual(departmentsOf(USERS), ["Financeiro", "Fiscal", "Tecnologia"]);
  assert.equal(initialsOf("Ana Souza"), "AS");
  assert.equal(initialsOf("  "), "U");
});

test("setores com grafias diferentes são unificados (Contabil = Contábil = contábil )", async () => {
  const { canonicalDepartment, departmentKey } = await import("./departments");
  assert.equal(canonicalDepartment("Contabil"), "Contábil");
  assert.equal(canonicalDepartment("  contábil "), "Contábil");
  assert.equal(canonicalDepartment("DEPARTAMENTO   pessoal"), "Departamento Pessoal");
  assert.equal(canonicalDepartment("Setor Novo "), "Setor Novo"); // desconhecido: mantém, sem espaços extras
  assert.equal(canonicalDepartment(null), "");
  assert.equal(departmentKey("Recepção"), departmentKey("recepcao"));
});

test("diretório: filtro e lista de departamentos tratam grafias do mesmo setor como um só", () => {
  const list = [u({ name: "A", department: "Contabil" }), u({ name: "B", department: "Contábil" }), u({ name: "C", department: "Fiscal" })];
  assert.deepEqual(departmentsOf(list), ["Contábil", "Fiscal"]);
  const names = filterAndSortUsers(list, { ...DEFAULT_COLLAB_FILTERS, sector: "Contábil" }, null, buildTicketCounts([], getTechs)).map((x) => x.name).sort();
  assert.deepEqual(names, ["A", "B"]);
});
