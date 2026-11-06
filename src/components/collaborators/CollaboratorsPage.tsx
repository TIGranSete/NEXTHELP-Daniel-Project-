import React, { useMemo } from "react";
import { Filter, Search, Shield, User as UserIcon, UserPlus, Users, UserRoundSearch, Eye, Pencil } from "lucide-react";
import type { Ticket, User, UserSession } from "../../types";
import {
  CollabFilters, DEFAULT_COLLAB_FILTERS, buildTicketCounts, countAccounts, departmentsOf, filterAndSortUsers, hasActiveCollabFilters, initialsOf, presenceOf, roleLabel,
} from "../../lib/collaborators";
import { canonicalDepartment } from "../../lib/departments";
import AvatarImage from "../ui/Avatar";

interface Props {
  users: User[];
  tickets: Ticket[];
  session: UserSession;
  getAssignedTechs: (s: string | null) => string[];
  filters: CollabFilters;
  onFilters: (patch: Partial<CollabFilters>) => void;
  onClearFilters: () => void;
  /** Mesma ação de cadastro já existente (abre o formulário). */
  onAdd: () => void;
  /** Mesma ação de edição já existente. */
  onEdit: (user: User) => void;
  /** Abre o perfil; `opener` é o botão de origem (recebe o foco ao fechar). */
  onViewProfile: (user: User, opener: HTMLElement | null) => void;
  loading?: boolean;
}

const card = "bg-surface border border-default rounded-xl shadow-card";
const fieldCls =
  "h-9 w-full bg-surface border border-default hover:border-secondary/40 rounded-lg px-2.5 text-sm text-primary focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 transition-colors duration-150 cursor-pointer";

function StatTile({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: number; accent?: boolean }) {
  return (
    <div className={`${card} px-4 py-3 flex items-center gap-3`}>
      <span className={`h-9 w-9 shrink-0 rounded-lg inline-flex items-center justify-center ${accent ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-surface-2 text-secondary"}`}>
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-secondary">{label}</p>
        <p className="text-xl font-bold leading-tight tabular-nums text-primary">{value}</p>
      </div>
    </div>
  );
}

function Avatar({ name, photo, size = "md" }: { name: string; photo?: string | null; size?: "md" | "sm" }) {
  return <AvatarImage name={name} photo={photo} className={size === "md" ? "h-10 w-10 text-sm" : "h-9 w-9 text-xs"} />;
}

function RoleBadge({ role }: { role: string }) {
  const tech = role === "tecnico";
  return (
    <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md border border-default bg-surface-2 text-xs font-medium text-secondary whitespace-nowrap">
      {tech ? <Shield className="h-3 w-3" aria-hidden /> : <UserIcon className="h-3 w-3" aria-hidden />}
      {roleLabel(role)}
    </span>
  );
}

function PresenceCell({ presence, pendingPassword }: { presence: ReturnType<typeof presenceOf>; pendingPassword?: boolean }) {
  return (
    <div className="min-w-0">
      {presence === "unknown" ? (
        <span className="text-sm text-muted" title="O sistema não tem informação de presença deste usuário">—</span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-sm text-primary">
          <span className={`h-2 w-2 rounded-full ${presence === "online" ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"}`} aria-hidden />
          {presence === "online" ? "Online" : "Offline"}
        </span>
      )}
      {pendingPassword && <span className="block text-xs text-amber-700 dark:text-amber-400">Troca de senha pendente</span>}
    </div>
  );
}

export default function CollaboratorsPage(p: Props) {
  const { users, session, filters } = p;
  const counts = useMemo(() => countAccounts(users), [users]);
  const departments = useMemo(() => departmentsOf(users), [users]);
  const ticketCounts = useMemo(() => buildTicketCounts(p.tickets, p.getAssignedTechs), [p.tickets, p.getAssignedTechs]);
  const rows = useMemo(() => filterAndSortUsers(users, filters, session, ticketCounts), [users, filters, session, ticketCounts]);
  const filtered = hasActiveCollabFilters(filters);
  const canEdit = session?.role === "tecnico";

  const open = (u: User, opener: HTMLElement) => p.onViewProfile(u, opener);

  const actions = (u: User) => (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        data-profile-btn
        onClick={(e) => { e.stopPropagation(); open(u, e.currentTarget); }}
        aria-label={`Ver perfil de ${u.name}`}
        className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-default bg-surface hover:bg-surface-2 text-[13px] font-medium text-primary transition-colors duration-150 cursor-pointer"
      >
        <Eye className="h-3.5 w-3.5 text-secondary" aria-hidden />Ver perfil
      </button>
      {canEdit && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); p.onEdit(u); }}
          aria-label={`Editar ${u.name}`}
          title="Editar dados de login (nome, e-mail, senha, setor, acesso)"
          className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg text-[13px] font-medium text-secondary hover:text-primary hover:bg-surface-2 transition-colors duration-150 cursor-pointer"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />Editar
        </button>
      )}
    </div>
  );

  return (
    <div className="xl:col-span-12 w-full space-y-5 sm:space-y-6" data-testid="collaborators-page">
      {/* ── Cabeçalho ── */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-primary">Gestão de Colaboradores</h1>
          <p className="text-sm text-secondary mt-0.5">Gerencie contas, equipes e permissões da empresa.</p>
        </div>
        <button
          type="button"
          onClick={p.onAdd}
          className="h-10 px-4 shrink-0 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-card transition-colors duration-150 cursor-pointer"
        >
          <UserPlus className="h-4 w-4" aria-hidden />
          Adicionar Colaborador
        </button>
      </header>

      {/* ── Indicadores ── */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3" aria-label="Indicadores de contas">
        {p.loading ? (
          [0, 1, 2].map((i) => <div key={i} className="h-[68px] rounded-xl border border-default bg-surface motion-safe:animate-pulse" />)
        ) : (
          <>
            <StatTile icon={Users} label="Total de Contas" value={counts.total} />
            <StatTile icon={Shield} label="Equipe de TI" value={counts.tech} accent />
            <StatTile icon={UserIcon} label="Colaboradores" value={counts.collab} />
          </>
        )}
      </section>

      {/* ── Diretório ── */}
      <section className={`${card} overflow-hidden`} aria-label="Diretório de colaboradores">
        <div className="p-4 sm:p-5 border-b border-default space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-primary">Diretório de Colaboradores</h2>
              <p className="text-[13px] text-secondary">Visualize e gerencie os colaboradores cadastrados.</p>
            </div>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" aria-hidden />
              <input
                id="collab-search"
                type="search"
                aria-label="Buscar colaborador por nome, e-mail ou setor"
                placeholder="Buscar por nome, e-mail ou setor…"
                value={filters.search}
                onChange={(e) => p.onFilters({ search: e.target.value })}
                className="h-10 w-full bg-surface border border-default rounded-lg pl-9 pr-3 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 transition-colors duration-150"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] gap-3 items-end">
            <label className="block">
              <span className="block text-xs text-secondary mb-1">Departamento</span>
              <select id="collab-filter-sector" value={filters.sector} onChange={(e) => p.onFilters({ sector: e.target.value })} className={fieldCls}>
                <option value="All">Todos os departamentos</option>
                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs text-secondary mb-1">Nível de acesso</span>
              <select id="collab-filter-role" value={filters.role} onChange={(e) => p.onFilters({ role: e.target.value })} className={fieldCls}>
                <option value="All">Todos os acessos</option>
                <option value="tecnico">Técnicos (TI)</option>
                <option value="colaborador">Colaboradores</option>
              </select>
            </label>
            <label className="block">
              <span className="block text-xs text-secondary mb-1">Status</span>
              <select id="collab-filter-status" value={filters.status} onChange={(e) => p.onFilters({ status: e.target.value })} className={fieldCls}>
                <option value="All">Todos os status</option>
                <option value="online">Online</option>
                <option value="offline">Offline</option>
              </select>
            </label>
            <label className="block">
              <span className="block text-xs text-secondary mb-1">Ordenar por</span>
              <select id="collab-filter-sort" value={filters.sort} onChange={(e) => p.onFilters({ sort: e.target.value })} className={fieldCls}>
                <option value="name">Nome (A-Z)</option>
                <option value="tickets_created">Mais chamados criados</option>
                <option value="tickets_resolved">Mais chamados resolvidos (TI)</option>
              </select>
            </label>
            <button
              type="button"
              onClick={p.onClearFilters}
              disabled={!filtered}
              className="h-9 px-3 inline-flex items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium text-secondary hover:text-primary hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer"
            >
              <Filter className="h-3.5 w-3.5" aria-hidden />Limpar filtros
            </button>
          </div>
        </div>

        {/* corpo */}
        {p.loading ? (
          <div className="p-5 space-y-3" aria-busy="true" aria-label="Carregando colaboradores">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-14 rounded-lg bg-surface-2/70 motion-safe:animate-pulse" />)}
          </div>
        ) : users.length === 0 ? (
          <Empty title="Nenhum colaborador cadastrado" hint="Cadastre o primeiro colaborador para começar.">
            <button type="button" onClick={p.onAdd} className="mt-4 h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold cursor-pointer">Adicionar Colaborador</button>
          </Empty>
        ) : rows.length === 0 ? (
          <Empty title="Nenhum colaborador encontrado com os filtros selecionados." hint="Ajuste a busca ou os filtros.">
            {filtered && <button type="button" onClick={p.onClearFilters} className="mt-4 h-9 px-4 rounded-lg border border-default bg-surface hover:bg-surface-2 text-sm font-medium text-primary cursor-pointer">Limpar filtros</button>}
          </Empty>
        ) : (
          <>
            {/* tabela (≥ md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left" data-testid="collaborators-table">
                <thead>
                  <tr className="border-b border-default text-xs text-secondary">
                    <th scope="col" className="py-2.5 pl-5 pr-3 font-medium">Colaborador</th>
                    <th scope="col" className="py-2.5 px-3 font-medium">Departamento</th>
                    <th scope="col" className="py-2.5 px-3 font-medium">Acesso</th>
                    <th scope="col" className="py-2.5 px-3 font-medium">Situação</th>
                    <th scope="col" className="py-2.5 pl-3 pr-5 font-medium text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  {rows.map((u, i) => (
                    <tr
                      key={u.id || i}
                      data-row
                      className="group transition-[background-color,box-shadow] duration-150 hover:bg-emerald-500/[0.06] hover:shadow-[inset_2px_0_0_var(--color-emerald-500)] focus-within:bg-emerald-500/[0.06] focus-within:shadow-[inset_2px_0_0_var(--color-emerald-500)]"
                    >
                      <td className="py-3 pl-5 pr-3 max-w-[22rem]">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar name={u.name} photo={u.photo} />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-primary truncate transition-colors duration-150 group-hover:text-emerald-700 dark:group-hover:text-emerald-400" title={u.name}>{u.name}</p>
                            <p className="text-[13px] text-secondary truncate" title={u.email}>{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-sm text-primary whitespace-nowrap">{canonicalDepartment(u.department) || <span className="text-muted">—</span>}</td>
                      <td className="py-3 px-3"><RoleBadge role={u.role} /></td>
                      <td className="py-3 px-3"><PresenceCell presence={presenceOf(u, session)} pendingPassword={!!u.mustChangePassword} /></td>
                      <td className="py-3 pl-3 pr-5">{actions(u)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* cartões (< md) */}
            <ul className="md:hidden divide-y divide-subtle" data-testid="collaborators-cards">
              {rows.map((u, i) => (
                <li key={u.id || i} data-row className="group p-4 space-y-3 transition-[background-color,box-shadow] duration-150 hover:bg-emerald-500/[0.06] hover:shadow-[inset_2px_0_0_var(--color-emerald-500)] focus-within:bg-emerald-500/[0.06] focus-within:shadow-[inset_2px_0_0_var(--color-emerald-500)]">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={u.name} photo={u.photo} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-primary truncate">{u.name}</p>
                      <p className="text-[13px] text-secondary truncate">{u.email}</p>
                    </div>
                    <PresenceCell presence={presenceOf(u, session)} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-secondary">
                    <span>{canonicalDepartment(u.department) || "—"}</span>
                    <RoleBadge role={u.role} />
                    {u.mustChangePassword && <span className="text-xs text-amber-700 dark:text-amber-400">Troca de senha pendente</span>}
                  </div>
                  {actions(u)}
                </li>
              ))}
            </ul>

            <p className="px-5 py-3 border-t border-default text-xs text-muted" aria-live="polite">
              Mostrando {rows.length} de {users.length} colaborador{users.length === 1 ? "" : "es"}
            </p>
          </>
        )}
      </section>
    </div>
  );
}

function Empty({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-14 px-6">
      <span className="h-12 w-12 rounded-full bg-surface-2 text-muted inline-flex items-center justify-center mb-3"><UserRoundSearch className="h-6 w-6" aria-hidden /></span>
      <p className="text-sm font-semibold text-primary">{title}</p>
      {hint && <p className="text-[13px] text-secondary mt-1">{hint}</p>}
      {children}
    </div>
  );
}

export { DEFAULT_COLLAB_FILTERS };
