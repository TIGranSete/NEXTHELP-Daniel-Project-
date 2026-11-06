import React from "react";
import { Search, X, FilterX } from "lucide-react";

export interface QueueFilters {
  search: string;
  category: string;
  priority: string;
  status: string;
}

interface QueueToolbarProps {
  filters: QueueFilters;
  onSearch: (v: string) => void;
  onCategory: (v: string) => void;
  onPriority: (v: string) => void;
  onStatus: (v: string) => void;
  onClear: () => void;
  resultCount: number;
}

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "Active", label: "Ativos" },
  { value: "Aberto", label: "Pendentes" },
  { value: "Em Atendimento", label: "Em atendimento" },
  { value: "Aguardando Solicitante", label: "Aguardando" },
  { value: "Resolvido", label: "Resolvidos" },
  { value: "Fechado", label: "Fechados" },
  { value: "All", label: "Todos" },
];

const fieldBase =
  "h-9 border rounded-lg text-sm text-primary transition-colors duration-150 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15";
const fieldIdle = "bg-surface border-default hover:border-secondary/40";
const fieldSet = "bg-emerald-500/[0.05] border-emerald-500/40";
const selectCls = (set: boolean) => `${fieldBase} ${set ? fieldSet : fieldIdle} px-3 cursor-pointer max-sm:flex-1`;

export function hasActiveFilters(f: QueueFilters) {
  return !!f.search || f.category !== "All" || f.priority !== "All" || f.status !== "Active";
}

export default function QueueToolbar({ filters, onSearch, onCategory, onPriority, onStatus, onClear, resultCount }: QueueToolbarProps) {
  const dirty = hasActiveFilters(filters);
  return (
    <div>
      {/* Cabeçalho do contêiner */}
      <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold text-primary">Chamados registrados</h3>
          <p className="mt-0.5 text-sm text-secondary">Consulte, filtre e gerencie os atendimentos da fila.</p>
        </div>
        <p className="shrink-0 mt-0.5 inline-flex items-center h-7 px-2.5 rounded-full bg-surface-2 text-xs text-secondary tabular-nums" aria-live="polite">
          <span className="font-semibold text-primary mr-1">{resultCount}</span>
          {resultCount === 1 ? "resultado" : "resultados"}
        </p>
      </div>

      {/* Filtros */}
      <div className="px-5 pb-4 flex flex-col md:flex-row md:items-center gap-2.5">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" aria-hidden />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Pesquisar por título, solicitante, responsável ou nº…"
            aria-label="Pesquisar chamados"
            className={`w-full pl-9 pr-9 placeholder:text-muted ${fieldBase} ${filters.search ? fieldSet : fieldIdle}`}
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => onSearch("")}
              aria-label="Limpar pesquisa"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted hover:text-primary cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select aria-label="Categoria" value={filters.category} onChange={(e) => onCategory(e.target.value)} className={selectCls(filters.category !== "All")}>
            <option value="All">Todas as categorias</option>
            <option value="Hardware">Hardware</option>
            <option value="Software">Software</option>
            <option value="Redes">Redes</option>
            <option value="Acesso">Acesso</option>
            <option value="Sistemas">Sistemas</option>
            <option value="Outros">Outros</option>
          </select>
          <select aria-label="Prioridade" value={filters.priority} onChange={(e) => onPriority(e.target.value)} className={selectCls(filters.priority !== "All")}>
            <option value="All">Todas as prioridades</option>
            <option value="Baixa">Baixa</option>
            <option value="Média">Média</option>
            <option value="Alta">Alta</option>
            <option value="Urgente">Urgente</option>
          </select>
          {dirty && (
            <button
              type="button"
              onClick={onClear}
              className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors duration-150 cursor-pointer"
            >
              <FilterX className="h-4 w-4" />
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Abas de status */}
      <div className="px-5 border-y border-default bg-surface-2/40 min-w-0">
        <div role="tablist" aria-label="Filtrar por status" className="flex items-center gap-1 overflow-x-auto py-2">
          {STATUS_TABS.map((tab) => {
            const on = filters.status === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onStatus(tab.value)}
                className={`h-8 px-3.5 shrink-0 rounded-md text-sm transition-colors duration-150 cursor-pointer ${
                  on
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold"
                    : "font-medium text-secondary hover:text-primary hover:bg-surface-3/60"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
