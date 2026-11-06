import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileText, RefreshCw, TrendingUp, User } from "lucide-react";
import WindowsDatePicker from "../WindowsDatePicker";

export const PERIOD_OPTIONS: { id: string; label: string }[] = [
  { id: "7d", label: "Últimos 7 dias" },
  { id: "30d", label: "Últimos 30 dias" },
  { id: "90d", label: "Últimos 90 dias" },
  { id: "all", label: "Todo o período" },
  { id: "custom", label: "Personalizado" },
];

interface Props {
  period: string;
  onPeriod: (v: string) => void;
  startDate: string;
  endDate: string;
  onStartDate: (v: string) => void;
  onEndDate: (v: string) => void;
  tech: string;
  onTech: (v: string) => void;
  technicians: string[];
  /** Ausente = sem fonte para atualizar; o botão fica indisponível. */
  onRefresh?: () => void;
  refreshing?: boolean;
  onExportGeneral: () => void;
  onExportByTech: () => void;
}

const selectCls =
  "h-10 w-full bg-surface border border-default hover:border-secondary/40 rounded-lg px-3 text-sm text-primary focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 transition-colors duration-150 cursor-pointer";

export default function SlaHeader(p: Props) {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  return (
    <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between" data-testid="sla-header">
      <div className="flex items-center gap-3.5 min-w-0">
        <span className="h-12 w-12 shrink-0 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 inline-flex items-center justify-center">
          <TrendingUp className="h-6 w-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-primary">Análise de SLA</h1>
          <p className="text-[13px] sm:text-sm text-secondary mt-0.5">Acompanhe o cumprimento de prazos, riscos operacionais e a qualidade dos atendimentos da TI.</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap xl:flex-nowrap sm:items-end gap-3 xl:shrink-0">
        <div className="sm:w-48">
          <label htmlFor="sla-period" className="block text-xs text-secondary mb-1">Período</label>
          <select id="sla-period" value={p.period} onChange={(e) => p.onPeriod(e.target.value)} className={selectCls}>
            {PERIOD_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <div className="sm:w-52">
          <label htmlFor="sla-tech" className="block text-xs text-secondary mb-1">Técnico responsável</label>
          <select id="sla-tech" value={p.tech} onChange={(e) => p.onTech(e.target.value)} className={selectCls}>
            <option value="all">Todos os técnicos</option>
            {p.technicians.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={p.onRefresh}
            disabled={!p.onRefresh || p.refreshing}
            aria-busy={p.refreshing}
            title={p.onRefresh ? "Buscar os chamados novamente" : "Atualização indisponível"}
            className="h-10 flex-1 sm:flex-none px-3.5 inline-flex items-center justify-center gap-2 rounded-lg border border-default bg-surface hover:bg-surface-2 text-sm font-medium text-primary transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`h-4 w-4 ${p.refreshing ? "motion-safe:animate-spin" : ""}`} aria-hidden />
            Atualizar
          </button>
          <div className="relative flex-1 sm:flex-none" ref={menuRef}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={() => setMenu((v) => !v)}
              className="h-10 w-full px-3.5 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors duration-150 cursor-pointer shadow-card"
            >
              <Download className="h-4 w-4" aria-hidden />
              Exportar
              <ChevronDown className="h-3.5 w-3.5 opacity-80" aria-hidden />
            </button>
            {menu && (
              <div role="menu" className="absolute right-0 z-30 mt-1.5 w-60 rounded-lg border border-default bg-surface shadow-raised p-1">
                <button role="menuitem" type="button" onClick={() => { setMenu(false); p.onExportGeneral(); }} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-primary hover:bg-surface-2 cursor-pointer text-left">
                  <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />Relatório geral (PDF)
                </button>
                <button role="menuitem" type="button" onClick={() => { setMenu(false); p.onExportByTech(); }} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-primary hover:bg-surface-2 cursor-pointer text-left">
                  <User className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />Exportar por técnico…
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {p.period === "custom" && (
        <div className="xl:basis-full flex flex-wrap items-center gap-2" aria-label="Intervalo personalizado">
          <div className="w-[160px]">
            <WindowsDatePicker value={p.startDate || undefined} onChange={(d) => p.onStartDate(d || "")} placeholder="Data inicial" headerText="Data Inicial" align="left" />
          </div>
          <span className="text-xs text-muted">até</span>
          <div className="w-[160px]">
            <WindowsDatePicker value={p.endDate || undefined} onChange={(d) => p.onEndDate(d || "")} placeholder="Data final" headerText="Data Final" align="left" />
          </div>
        </div>
      )}
    </header>
  );
}
