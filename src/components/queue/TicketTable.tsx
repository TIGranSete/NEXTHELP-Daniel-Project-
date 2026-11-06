import React from "react";
import { Eye } from "lucide-react";
import type { Ticket } from "../../types";
import { PriorityBadge, SlaBadge, StatusBadge } from "../ui/Badges";

interface TicketTableProps {
  tickets: Ticket[];
  selectedId: string | null;
  /** `origin` = retângulo da linha clicada, usado pela transição Workspace Reveal. */
  onSelect: (id: string, origin?: DOMRect) => void;
  /** Linha pressionada durante a transição (destaca esta e esmaece as demais). */
  pressedId?: string | null;
  getSlaLabel: (t: Ticket) => string;
  /** Vencimento da resolução vindo do motor de SLA (horas úteis). `null` = indeterminado (pausa/sem dados). */
  getDueAt?: (t: Ticket) => number | null;
  /** Há um ciclo de reabertura em andamento. */
  isReopened?: (t: Ticket) => boolean;
  getAssignees: (assignedTo: string | null) => string[];
}

const dayMonth = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
const time = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function deadlineOf(t: Ticket, dueAt: number | null | undefined): { main: string; sub: string } {
  if (t.projectDeadline) {
    const [y, m, d] = t.projectDeadline.split("-");
    return { main: y && m && d ? `${d}/${m}/${y}` : t.projectDeadline, sub: "Prazo do projeto" };
  }
  if (typeof dueAt === "number" && Number.isFinite(dueAt)) {
    const iso = new Date(dueAt).toISOString();
    return { main: dayMonth(iso), sub: time(iso) };
  }
  return { main: "—", sub: t.status === "Aguardando Solicitante" ? "SLA pausado" : "" };
}

function Assignee({ ticket, getAssignees }: { ticket: Ticket; getAssignees: TicketTableProps["getAssignees"] }) {
  const list = getAssignees(ticket.assignedTo);
  if (list.length === 0) return <span className="text-sm text-muted">Não atribuído</span>;
  const initials = list[0].split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase();
  return (
    <span className="flex items-center gap-2 min-w-0">
      <span className="w-7 h-7 shrink-0 rounded-full bg-surface-2 border border-default text-secondary text-[11px] font-semibold flex items-center justify-center">
        {initials}
      </span>
      <span className="text-sm text-primary truncate" title={list.join(", ")}>
        {list[0]}
        {list.length > 1 && <span className="text-muted"> +{list.length - 1}</span>}
      </span>
    </span>
  );
}

function TitleBlock({ t, reopened }: { t: Ticket; reopened?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="shrink-0 font-mono text-[11px] leading-5 px-1.5 rounded bg-surface-2 text-secondary tabular-nums">#{t.id}</span>
        <span className="text-sm font-semibold text-primary truncate group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors duration-150" title={t.title}>
          {t.title}
        </span>
        {reopened && (
          <span className="shrink-0 text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">Reaberto</span>
        )}
      </div>
      <p className="mt-1 text-[13px] text-secondary truncate">
        <span className="text-primary/80">{t.requesterName}</span>
        <span className="text-muted"> · {t.requesterDepartment}</span>
      </p>
      <p className="mt-0.5 text-xs text-muted truncate">
        {t.category} · aberto em {dayMonth(t.createdAt)}, {time(t.createdAt)}
      </p>
    </div>
  );
}

export default function TicketTable({ tickets, selectedId, onSelect, pressedId, getSlaLabel, getDueAt, isReopened, getAssignees }: TicketTableProps) {
  const open = (id: string, from?: Element | null) => {
    const row = from?.closest("tr, li") ?? document.getElementById(`ticket-card-${id}`);
    onSelect(id, row ? row.getBoundingClientRect() : undefined);
  };
  const pressCls = (id: string) =>
    pressedId ? (pressedId === id ? "relative z-[1] -translate-y-px bg-surface shadow-raised ring-1 ring-inset ring-emerald-500/40" : "opacity-60") : "";
  const keyOpen = (e: React.KeyboardEvent, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open(id);
    }
  };

  return (
    <>
      {/* Desktop / notebook */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-default bg-surface-2/60 text-[11px] font-semibold uppercase tracking-wider text-muted">
              <th scope="col" className="py-3 pl-5 pr-3 font-semibold">Chamado</th>
              <th scope="col" className="py-3 px-3 font-semibold">Prioridade</th>
              <th scope="col" className="py-3 px-3 font-semibold">Status</th>
              <th scope="col" className="py-3 px-3 font-semibold">SLA</th>
              <th scope="col" className="py-3 px-3 font-semibold">Responsável</th>
              <th scope="col" className="py-3 px-3 font-semibold">Prazo</th>
              <th scope="col" className="py-3 pl-3 pr-5 font-semibold text-right"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-subtle">
            {tickets.map((t) => {
              const selected = t.id === selectedId;
              const dl = deadlineOf(t, getDueAt?.(t));
              return (
                <tr
                  key={t.id}
                  id={`ticket-card-${t.id}`}
                  tabIndex={0}
                  aria-selected={selected}
                  onClick={(e) => open(t.id, e.currentTarget)}
                  onKeyDown={(e) => keyOpen(e, t.id)}
                  className={`group cursor-pointer transition-[background-color,opacity,transform,box-shadow] duration-150 outline-none ${pressCls(t.id)} focus-visible:bg-surface-2 ${
                    selected ? "bg-emerald-500/[0.06] shadow-[inset_2px_0_0_var(--color-emerald-500)]" : "hover:bg-surface-2/60"
                  }`}
                >
                  <td className="py-4 pl-5 pr-3 max-w-[22rem] xl:max-w-[30rem]"><TitleBlock t={t} reopened={isReopened?.(t)} /></td>
                  <td className="py-4 px-3"><PriorityBadge priority={t.priority} /></td>
                  <td className="py-4 px-3"><StatusBadge status={t.status} /></td>
                  <td className="py-4 px-3"><SlaBadge label={getSlaLabel(t)} /></td>
                  <td className="py-4 px-3 max-w-[11rem]"><Assignee ticket={t} getAssignees={getAssignees} /></td>
                  <td className="py-4 px-3 whitespace-nowrap">
                    <span className="block text-sm font-medium text-primary tabular-nums">{dl.main}</span>
                    {dl.sub && <span className="block text-xs text-muted">{dl.sub}</span>}
                  </td>
                  <td className="py-4 pl-3 pr-5 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        open(t.id, e.currentTarget);
                      }}
                      className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-default bg-surface hover:bg-surface-2 hover:border-emerald-500/40 hover:text-emerald-700 dark:hover:text-emerald-400 text-xs font-medium text-primary transition-colors duration-150 cursor-pointer"
                      aria-label={`Ver detalhes do chamado ${t.id}`}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Detalhes
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Tablet / celular: mesma informação, empilhada */}
      <ul className="lg:hidden divide-y divide-subtle">
        {tickets.map((t) => {
          const selected = t.id === selectedId;
          const dl = deadlineOf(t, getDueAt?.(t));
          return (
            <li
              key={t.id}
              id={`ticket-card-${t.id}`}
              tabIndex={0}
              onClick={(e) => open(t.id, e.currentTarget)}
              onKeyDown={(e) => keyOpen(e, t.id)}
              className={`group px-4 py-4 space-y-3 cursor-pointer transition-[background-color,opacity] duration-150 outline-none ${pressedId ? (pressedId === t.id ? "bg-surface-2" : "opacity-60") : ""} ${
                selected ? "bg-emerald-500/[0.06] shadow-[inset_2px_0_0_var(--color-emerald-500)]" : "active:bg-surface-2"
              }`}
            >
              <TitleBlock t={t} reopened={isReopened?.(t)} />
              <div className="flex flex-wrap items-center gap-1.5">
                <PriorityBadge priority={t.priority} />
                <StatusBadge status={t.status} />
                <SlaBadge label={getSlaLabel(t)} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Assignee ticket={t} getAssignees={getAssignees} />
                <span className="text-xs text-secondary whitespace-nowrap">
                  Prazo: <span className="text-primary font-medium">{dl.main}{!t.projectDeadline && dl.sub ? `, ${dl.sub}` : ""}</span>
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  open(t.id, e.currentTarget);
                }}
                className="w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-lg border border-default bg-surface-2 text-sm font-medium text-primary cursor-pointer"
              >
                <Eye className="h-4 w-4" />
                Ver detalhes
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function TicketTableSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando chamados" className="divide-y divide-subtle">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4 motion-safe:animate-pulse">
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-2/5 rounded bg-surface-3" />
            <div className="h-3 w-1/4 rounded bg-surface-2" />
          </div>
          <div className="hidden md:block h-6 w-20 rounded-full bg-surface-2" />
          <div className="hidden md:block h-6 w-24 rounded-full bg-surface-2" />
          <div className="hidden lg:block h-7 w-28 rounded bg-surface-2" />
        </div>
      ))}
    </div>
  );
}
