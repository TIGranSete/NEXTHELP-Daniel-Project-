/**
 * Regras de listagem da Gestão de Colaboradores (busca, filtros, ordenação, presença).
 *
 * Esta lógica foi MOVIDA do App.tsx sem alteração de comportamento, para poder ser testada e
 * reutilizada pelo novo diretório. Nada aqui consulta rede ou banco.
 */
import type { Ticket, User, UserSession } from "../types";
import { canonicalDepartment, departmentKey } from "./departments";

export interface CollabFilters {
  search: string;
  sector: string; // "All" | departamento
  role: string; // "All" | "tecnico" | "colaborador"
  status: string; // "All" | "online" | "offline"
  sort: string; // "name" | "tickets_created" | "tickets_resolved"
}

export const DEFAULT_COLLAB_FILTERS: CollabFilters = { search: "", sector: "All", role: "All", status: "All", sort: "name" };

export const hasActiveCollabFilters = (f: CollabFilters) =>
  f.search !== "" || f.sector !== "All" || f.role !== "All" || f.status !== "All" || f.sort !== "name";

type Session = Pick<UserSession, "name" | "email"> | null | undefined;

/** Online = o servidor reporta presença OU é o próprio usuário logado (regra original). */
export function isUserOnline(u: Pick<User, "name" | "email" | "isOnline">, session: Session): boolean {
  return !!(
    u.isOnline ||
    (session &&
      ((u.email && session.email && u.email.toLowerCase() === session.email.toLowerCase()) ||
        (u.name && session.name && u.name.toLowerCase() === session.name.toLowerCase())))
  );
}

/**
 * Presença para EXIBIÇÃO. "unknown" = o sistema não tem informação (campo ausente): não é tratado como offline.
 * (O filtro "Offline" mantém a regra original: tudo que não é online.)
 */
export type Presence = "online" | "offline" | "unknown";
export function presenceOf(u: Pick<User, "name" | "email" | "isOnline">, session: Session): Presence {
  if (isUserOnline(u, session)) return "online";
  return u.isOnline === false ? "offline" : "unknown";
}

export interface TicketCounts {
  created: Map<string, number>;
  solved: Map<string, number>;
}

/** Contagens pré-calculadas (evita filtrar todos os chamados dentro do comparador do sort). */
export function buildTicketCounts(tickets: Ticket[], getAssignedTechs: (s: string | null) => string[]): TicketCounts {
  const created = new Map<string, number>();
  const solved = new Map<string, number>();
  for (const t of tickets) {
    if (t.requesterName) created.set(t.requesterName, (created.get(t.requesterName) || 0) + 1);
    if (t.assignedTo && (t.status === "Resolvido" || t.status === "Fechado")) {
      for (const tech of getAssignedTechs(t.assignedTo)) solved.set(tech, (solved.get(tech) || 0) + 1);
    }
  }
  return { created, solved };
}

export function filterAndSortUsers(users: User[], f: CollabFilters, session: Session, counts: TicketCounts): User[] {
  const term = f.search.toLowerCase();
  return users
    .filter((u) => {
      const matchesSearch =
        u.name.toLowerCase().includes(term) ||
        (u.email && u.email.toLowerCase().includes(term)) ||
        (u.department && u.department.toLowerCase().includes(term));
      if (!matchesSearch) return false;
      if (f.sector !== "All" && departmentKey(u.department) !== departmentKey(f.sector)) return false;
      if (f.role !== "All") {
        const isTech = u.role === "tecnico";
        if (f.role === "tecnico" && !isTech) return false;
        if (f.role === "colaborador" && isTech) return false;
      }
      const online = isUserOnline(u, session);
      if (f.status === "online" && !online) return false;
      if (f.status === "offline" && online) return false;
      return true;
    })
    .sort((a, b) => {
      if (f.sort === "tickets_created") return (counts.created.get(b.name) || 0) - (counts.created.get(a.name) || 0);
      if (f.sort === "tickets_resolved") return (counts.solved.get(b.name) || 0) - (counts.solved.get(a.name) || 0);
      const aOnline = isUserOnline(a, session);
      const bOnline = isUserOnline(b, session);
      if (aOnline && !bOnline) return -1;
      if (!aOnline && bOnline) return 1;
      return a.name.localeCompare(b.name);
    });
}

export const departmentsOf = (users: User[]): string[] => Array.from(new Set(users.map((u) => canonicalDepartment(u.department)).filter(Boolean))).sort();

export const initialsOf = (name: string): string =>
  name.split(" ").filter(Boolean).map((n) => n[0]).join("").substring(0, 2).toUpperCase() || "U";

export const roleLabel = (role: string): string => (role === "tecnico" ? "Técnico de TI" : "Colaborador");

/** Contagens de colaboradores (mesma fórmula original). */
export function countAccounts(users: User[]) {
  return {
    total: users.length,
    tech: users.filter((u) => u.role === "tecnico").length,
    collab: users.filter((u) => u.role === "colaborador").length,
  };
}
