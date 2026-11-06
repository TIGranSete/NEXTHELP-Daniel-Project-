import React, { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle, AppWindow, Maximize2, Ellipsis, Hourglass, KeyRound, LineChart, Monitor, Network, PieChart, RefreshCw, Repeat, Server,
  Target, Timer, TriangleAlert, UserRoundCheck, Wrench, Zap, CheckCircle2, Layers,
} from "lucide-react";
import { DEFAULT_CALENDAR, REOPEN_LABEL, SLA_POLICY } from "../../lib/sla/config";
import {
  Evaluated, NO_OWNER, buildLateByCategory, buildReopenReasons, buildStatusDistribution, buildTechPerformance, buildTrend, summarize,
} from "../../lib/sla/dashboardData";
import type { SlaMetrics } from "../../lib/sla/metrics";
import { formatBusinessMinutes } from "../../lib/sla/ticketSla";
import InfoTip from "./InfoTip";
import { STATUS_STYLE, StatusDonut, TrendChart } from "./charts";
import FullscreenView, { useWindowHeight } from "./FullscreenView";
import { SMALL_SAMPLE_MIN, isSmallSample } from "../../lib/quality";

const pctText = (p: number | null) => (p === null ? "Sem dados" : `${p}%`);
const fmtPct1 = (n: number) => `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const share = (part: number, whole: number) => (whole > 0 ? fmtPct1((100 * part) / whole) : null);
const GRAN_LABEL = { day: "por dia", week: "por semana", month: "por mês" } as const;

type Tone = "emerald" | "sky" | "rose" | "amber";
const TONE: Record<Tone, { card: string; icon: string; bar: string; pill: string }> = {
  emerald: { card: "border-emerald-500/30 bg-emerald-500/[0.06]", icon: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500", pill: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300" },
  sky: { card: "border-sky-500/30 bg-sky-500/[0.06]", icon: "text-sky-600 dark:text-sky-400", bar: "bg-sky-500", pill: "bg-sky-500/15 text-sky-800 dark:text-sky-300" },
  rose: { card: "border-rose-500/30 bg-rose-500/[0.06]", icon: "text-rose-600 dark:text-rose-400", bar: "bg-rose-500", pill: "bg-rose-500/15 text-rose-800 dark:text-rose-300" },
  amber: { card: "border-amber-500/30 bg-amber-500/[0.07]", icon: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500", pill: "bg-amber-500/15 text-amber-800 dark:text-amber-300" },
};

function MainKpi(p: { tone: Tone; icon: React.ElementType; title: string; tip: React.ReactNode; value: number | string | null; empty?: string; pill?: string | null; sub: string; progress?: number | null }) {
  const t = TONE[p.tone];
  const Icon = p.icon;
  const noData = p.value === null;
  return (
    <div className={`rounded-xl border p-4 sm:p-5 shadow-card transition-shadow duration-200 hover:shadow-raised ${t.card}`} data-testid={`kpi-${p.title}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`h-5 w-5 shrink-0 ${t.icon}`} aria-hidden />
        <h3 className="text-sm font-semibold text-primary">{p.title}</h3>
        <InfoTip label={p.title} text={p.tip} />
      </div>
      <div className="flex items-center gap-2.5 flex-wrap min-h-[44px]">
        {noData ? (
          <span className="text-2xl font-semibold text-muted">{p.empty ?? "Sem dados"}</span>
        ) : (
          <span className="text-4xl leading-none font-bold tabular-nums text-primary">{p.value}</span>
        )}
        {p.pill && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${t.pill}`}>{p.pill}</span>}
      </div>
      <p className="mt-2 text-[13px] text-secondary">{p.sub}</p>
      {typeof p.progress === "number" && (
        <div className="mt-3 h-2 rounded-full bg-zinc-200/80 dark:bg-zinc-800 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.progress} aria-label={`${p.title}: ${p.progress}%`}>
          <div className={`h-full rounded-full transition-[width] duration-300 ${t.bar}`} style={{ width: `${p.progress}%` }} />
        </div>
      )}
    </div>
  );
}

function MiniKpi(p: { icon: React.ElementType; label: string; tip?: React.ReactNode; value: string | number; sub: string; dot?: string }) {
  const Icon = p.icon;
  return (
    <div className="rounded-xl border border-default bg-surface p-3.5 shadow-card min-h-[104px] flex flex-col transition-shadow duration-200 hover:shadow-raised" data-testid={`mini-${p.label}`}>
      <div className="flex items-center gap-2 text-[13px] text-secondary">
        <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        <span className="min-w-0 leading-tight">{p.label}</span>
        {p.tip && <InfoTip label={p.label} text={p.tip} />}
      </div>
      <div className={`mt-2 font-bold tabular-nums text-primary ${p.value === "Sem dados" ? "text-lg text-muted font-semibold" : "text-2xl"}`}>{p.value}</div>
      <p className="mt-auto pt-1 flex items-center gap-1.5 text-xs text-muted">
        {p.dot && <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${p.dot}`} aria-hidden />}
        <span>{p.sub}</span>
      </p>
    </div>
  );
}

const panel = "rounded-xl border border-default bg-surface shadow-card p-4 sm:p-5 min-w-0";
function PanelTitle({ icon: Icon, children, aside, tip, tipLabel, action }: { icon: React.ElementType; children: React.ReactNode; aside?: React.ReactNode; tip?: React.ReactNode; tipLabel?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      <span className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><Icon className="h-[18px] w-[18px]" aria-hidden /></span>
      <h3 className="text-[15px] font-semibold text-primary">{children}</h3>
      {tip && <InfoTip label={tipLabel ?? "painel"} text={tip} />}
      {aside && <span className="text-xs text-muted">{aside}</span>}
      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}

function ExpandButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Ver ${label} em tela cheia`}
      title="Ver em tela cheia"
      className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-secondary hover:text-primary hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 transition-colors duration-150 cursor-pointer"
    >
      <Maximize2 className="h-4 w-4" aria-hidden />
    </button>
  );
}

function Empty({ icon: Icon, title, hint }: { icon: React.ElementType; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-1.5 py-8 px-4 rounded-lg border border-dashed border-default bg-surface-2/40">
      <Icon className="h-6 w-6 text-muted" aria-hidden />
      <p className="text-sm font-medium text-secondary">{title}</p>
      {hint && <p className="text-xs text-muted max-w-xs">{hint}</p>}
    </div>
  );
}

const CAT_ICON: Record<string, React.ElementType> = { Hardware: Monitor, Software: AppWindow, Redes: Network, Acesso: KeyRound, Sistemas: Server, Outros: Ellipsis };
const REASON_ICON: Record<string, React.ElementType> = { ajuste_complementar: Wrench, problema_nao_resolvido: AlertTriangle, problema_recorrente: RefreshCw, outro: Ellipsis };

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((n) => n[0]).join("").toUpperCase() || "?";
// Sem classificação automática de desempenho (bom/ruim): o percentual é informativo e sempre neutro.
const slaPill = (pct: number | null) => (pct === null ? "bg-surface-2 text-muted border-default" : "bg-surface-2 text-primary border-default");
const smallNote = (n: number) => (n > 0 && isSmallSample(n) ? " · amostra pequena" : "");

interface Props {
  /** Resultado do motor por chamado (já filtrado por período/técnico). */
  items: Evaluated[];
  metrics: SlaMetrics;
  periodLabel: string;
}

export default function SlaDashboard({ items, metrics: m, periodLabel }: Props) {
  const reduce = useReducedMotion();
  const [expanded, setExpanded] = useState<"trend" | "status" | null>(null);
  const winH = useWindowHeight();
  const summary = useMemo(() => summarize(items), [items]);
  const trend = useMemo(() => buildTrend(items), [items]);
  const dist = useMemo(() => buildStatusDistribution(items), [items]);
  const late = useMemo(() => buildLateByCategory(items), [items]);
  const reasons = useMemo(() => buildReopenReasons(items), [items]);
  const techs = useMemo(() => buildTechPerformance(items), [items]);

  const section = (i: number) =>
    reduce ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.22, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] as const } };

  const riskPct = Math.round(SLA_POLICY.nearDueRatio * 100);
  const res = m.resolution;
  const fr = m.firstResponse;
  const re = m.reopening;

  return (
    <div className="space-y-4 sm:space-y-5" data-testid="sla-dashboard">
      {/* ── 1) KPIs principais ── */}
      <motion.section {...section(0)} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4" aria-label="Indicadores principais">
        <MainKpi
          tone="emerald" icon={Target} title="SLA de Resolução"
          tip="Chamados resolvidos dentro do prazo ÷ chamados resolvidos avaliáveis. Usa a primeira resolução de cada chamado, em horas úteis. Reaberturas não alteram este resultado."
          value={res.pct === null ? null : `${res.pct}%`} empty="Sem dados"
          sub={res.evaluated > 0 ? `${res.met} no prazo • ${res.breached} com atraso • ${res.evaluated} avaliados${smallNote(res.evaluated)}` : "Nenhum chamado resolvido avaliável"}
          progress={res.pct}
        />
        <MainKpi
          tone="sky" icon={Zap} title="SLA de 1ª Resposta"
          tip="Chamados cuja primeira resposta humana da TI ocorreu dentro do prazo ÷ chamados avaliados. Não conta IA, mensagens do sistema, triagem nem atribuição. Chamados sem resposta e já vencidos entram como fora do prazo."
          value={fr.pct === null ? null : `${fr.pct}%`} empty="Sem dados"
          sub={fr.evaluated > 0 ? `${fr.met} no prazo • ${fr.breached} fora do prazo • ${fr.evaluated} avaliados${smallNote(fr.evaluated)}` : "Nenhum chamado avaliável"}
          progress={fr.pct}
        />
        <MainKpi
          tone="rose" icon={TriangleAlert} title="Chamados Vencidos"
          tip="Chamados ainda abertos cujo prazo de resolução (horas úteis) já foi ultrapassado. Chamados aguardando o solicitante têm o relógio pausado."
          value={m.openOverdue}
          pill={summary.openApplicable > 0 ? `${fmtPct1((100 * m.openOverdue) / summary.openApplicable)} dos abertos` : null}
          sub="Fora do prazo de resolução"
        />
        <MainKpi
          tone="amber" icon={Timer} title="Chamados em Risco"
          tip={`Chamados abertos que ainda estão no prazo, mas com ${riskPct}% ou menos do prazo restante (critério do motor de SLA: nearDueRatio = ${SLA_POLICY.nearDueRatio}). Inclui a primeira resposta ainda pendente.`}
          value={m.nearDue}
          pill={summary.openApplicable > 0 ? `${fmtPct1((100 * m.nearDue) / summary.openApplicable)} dos abertos` : null}
          sub={`Restam ${riskPct}% ou menos do prazo`}
        />
      </motion.section>

      {/* ── 2) Indicadores operacionais ── */}
      <motion.section {...section(1)} className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3" aria-label="Indicadores operacionais">
        <MiniKpi icon={Hourglass} label="Aguardando solicitante" value={m.waitingRequester} sub="Pausados no SLA" dot="bg-sky-500" tip="Chamados aguardando resposta do solicitante. O SLA de resolução fica pausado; o de primeira resposta não é pausado." />
        <MiniKpi icon={Repeat} label="Reabertos" value={re.currentlyReopened} sub="Em correção agora" dot="bg-violet-500" tip="Chamados reabertos e ainda sem nova resolução." />
        <MiniKpi icon={RefreshCw} label="Taxa de reabertura" value={pctText(re.pct)} sub={re.cohort > 0 ? `${re.reopenedTickets} de ${re.cohort} resolvidos${smallNote(re.cohort)}` : "Nenhum resolvido na coorte"} tip="Chamados distintos reabertos ÷ chamados distintos resolvidos. Cada chamado conta uma vez, mesmo com várias reaberturas. Independente do cumprimento do SLA e não é uma avaliação de qualidade do técnico." />
        <MiniKpi icon={Timer} label="Tempo médio (TMA)" value={m.avgResolutionMin === null ? "Sem dados" : formatBusinessMinutes(m.avgResolutionMin)} sub="Resolução em horas úteis" tip="Média do tempo útil consumido até a primeira resolução, descontadas as pausas. Não é tempo corrido." />
        <MiniKpi icon={Wrench} label="Correção média" value={re.avgCorrectionMin === null ? "Sem dados" : formatBusinessMinutes(re.avgCorrectionMin)} sub={re.completedCycles > 0 ? `Após reabertura (${re.completedCycles} ciclo${re.completedCycles > 1 ? "s" : ""})` : "Sem ciclos concluídos"} tip="Média do tempo útil entre a reabertura e a nova resolução, por ciclo concluído. Não se mistura com o SLA original." />
        <MiniKpi icon={CheckCircle2} label="Resolvidos fora do prazo" value={m.resolvedLate} sub={res.evaluated > 0 ? `${share(m.resolvedLate, res.evaluated)} dos resolvidos` : "Sem resolvidos avaliáveis"} dot="bg-rose-500" tip="Chamados resolvidos depois do prazo de resolução (SLA original)." />
      </motion.section>

      {/* ── 3) Gráficos ── */}
      <motion.section {...section(2)} className="grid grid-cols-1 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3 sm:gap-4" aria-label="Gráficos">
        <div className={panel}>
          <PanelTitle
            icon={LineChart}
            aside={`(${periodLabel}${trend.points.length ? ` · ${GRAN_LABEL[trend.granularity]}` : ""})`}
            tipLabel="tendência do SLA"
            action={trend.populated >= 2 ? <ExpandButton label="Tendência do SLA" onClick={() => setExpanded("trend")} /> : undefined}
            tip="Cada ponto usa apenas chamados avaliáveis do intervalo: resolução pela data da resolução; primeira resposta pela data da resposta (ou do vencimento, se ainda sem resposta). Intervalos sem chamados avaliáveis ficam em branco — não são 0% nem 100%."
          >
            Tendência do SLA
          </PanelTitle>
          {trend.populated < 2 ? (
            <Empty icon={LineChart} title="Ainda não há dados suficientes para uma tendência" hint={trend.populated === 1 ? "Há apenas um intervalo com chamados avaliáveis neste período." : "Nenhum chamado avaliável no período selecionado."} />
          ) : (
            <>
              <TrendChart points={trend.points} />
              <div className="mt-2 flex items-center justify-center gap-5 text-xs text-secondary">
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />SLA de Resolução</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-sky-500" />SLA de 1ª Resposta</span>
              </div>
            </>
          )}
        </div>

        <div className={`${panel} flex flex-col`}>
          <PanelTitle
            icon={PieChart}
            aside={`(${dist.total})`}
            tipLabel="situação dos chamados"
            action={dist.total > 0 ? <ExpandButton label="Situação dos Chamados" onClick={() => setExpanded("status")} /> : undefined}
            tip="Cada chamado aparece em uma única categoria, na seguinte ordem de prioridade: resolvido (no prazo/com atraso), reaberto, aguardando solicitante, vencido, em risco, em atendimento, aberto. Por isso a soma é igual ao total."
          >
            Situação dos Chamados
          </PanelTitle>
          {dist.total === 0 ? (
            <Empty icon={PieChart} title="Nenhum chamado no período" />
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-5 flex-1 min-h-[200px]">
              <StatusDonut slices={dist.slices} total={dist.total} />
              <ul className="w-full min-w-0 text-[13px]" aria-label="Legenda da situação dos chamados">
                {dist.slices.map((s) => (
                  <li key={s.key} className="flex items-center gap-2 py-1.5 border-b border-subtle last:border-b-0">
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${STATUS_STYLE[s.key].dot}`} aria-hidden />
                    <span className="flex-1 min-w-0 leading-snug text-secondary">{s.label}</span>
                    <span className="font-semibold tabular-nums text-primary w-9 text-right">{s.count}</span>
                    <span className="tabular-nums text-muted w-14 text-right">{fmtPct1(s.pct)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </motion.section>

      {/* ── 4) Análises detalhadas ── */}
      <motion.section {...section(3)} className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4" aria-label="Análises detalhadas">
        <div className={panel}>
          <PanelTitle icon={Layers} tipLabel="categorias com maior atraso" tip="Conta chamados RESOLVIDOS fora do prazo por categoria. A participação é sobre o total de atrasos, não sobre o total de chamados da categoria.">Categorias com maior atraso</PanelTitle>
          {late.rows.length === 0 ? (
            <Empty icon={CheckCircle2} title="Nenhum atraso no período" hint="Não há chamados resolvidos fora do prazo nos filtros selecionados." />
          ) : (
            <ul className="space-y-3">
              {late.rows.map((r) => {
                const Icon = CAT_ICON[r.category] ?? Ellipsis;
                return (
                  <li key={r.category} className="grid grid-cols-[auto_minmax(0,5.5rem)_minmax(0,1fr)_auto] items-center gap-x-2.5 text-[13px]">
                    <Icon className="h-4 w-4 text-muted" aria-hidden />
                    <span className="truncate text-primary" title={r.category}>{r.category}</span>
                    <span className="h-2 rounded-full bg-zinc-200/80 dark:bg-zinc-800 overflow-hidden" aria-hidden>
                      <span className="block h-full rounded-full bg-rose-400 transition-[width] duration-300" style={{ width: `${(r.late / late.rows[0].late) * 100}%` }} />
                    </span>
                    <span className="tabular-nums text-secondary text-right whitespace-nowrap">{r.late} chamado{r.late > 1 ? "s" : ""} · {fmtPct1(r.pct)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className={panel}>
          <PanelTitle icon={RefreshCw} tipLabel="motivos de reabertura" tip="Motivos informados nas reaberturas (cada ciclo conta uma vez). A participação é sobre as reaberturas com motivo registrado.">Motivos de Reabertura</PanelTitle>
          {reasons.rows.length === 0 ? (
            <Empty icon={RefreshCw} title="Nenhuma reabertura registrada no período" hint={reasons.withoutReason > 0 ? `${reasons.withoutReason} reabertura(s) do histórico antigo, sem motivo registrado.` : undefined} />
          ) : (
            <>
              <ul>
                {reasons.rows.map((r) => {
                  const Icon = REASON_ICON[r.category] ?? Ellipsis;
                  return (
                    <li key={r.category} className="flex items-center gap-2.5 py-2.5 border-b border-subtle last:border-b-0 text-[13px]">
                      <Icon className="h-4 w-4 text-muted shrink-0" aria-hidden />
                      <span className="flex-1 min-w-0 truncate text-primary" title={REOPEN_LABEL[r.category]}>{REOPEN_LABEL[r.category] ?? r.category}</span>
                      <span className="font-semibold tabular-nums text-primary w-6 text-right">{r.count}</span>
                      <span className="tabular-nums text-muted w-14 text-right">{fmtPct1(r.pct)}</span>
                    </li>
                  );
                })}
              </ul>
              {reasons.withoutReason > 0 && <p className="mt-2 text-xs text-muted">+ {reasons.withoutReason} reabertura(s) do histórico antigo, sem motivo registrado.</p>}
            </>
          )}
        </div>

        <div className={`${panel} lg:col-span-2 xl:col-span-1`}>
          <PanelTitle
            icon={UserRoundCheck} aside="(Resolução)" tipLabel="desempenho por técnico"
            tip="Cada chamado é atribuído a UM responsável: o primeiro técnico atribuído ainda vigente (se ele saiu, o primeiro da lista atual). Chamados com vários técnicos não são contados em duplicidade. Considera a primeira resolução (SLA original)."
          >
            Desempenho por Técnico
          </PanelTitle>
          {techs.length === 0 ? (
            <Empty icon={UserRoundCheck} title="Nenhum técnico com chamados no período" />
          ) : (
            <div role="table" aria-label="Desempenho por técnico" className="text-[13px]">
              <div role="row" className="grid grid-cols-[minmax(0,1fr)_4.4rem_3.6rem_4.6rem] gap-x-2 pb-2 whitespace-nowrap border-b border-default text-xs text-muted">
                <span role="columnheader">Técnico</span>
                <span role="columnheader" className="text-right">Resolvidos</span>
                <span role="columnheader" className="text-right">No prazo</span>
                <span role="columnheader" className="text-right">SLA</span>
              </div>
              {techs.map((r) => (
                <div role="row" key={r.name} className="grid grid-cols-[minmax(0,1fr)_4.4rem_3.6rem_4.6rem] gap-x-2 items-center py-2 border-b border-subtle last:border-b-0">
                  <span role="cell" className="flex items-center gap-2 min-w-0">
                    <span className="h-7 w-7 shrink-0 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold inline-flex items-center justify-center" aria-hidden>{r.name === NO_OWNER ? "—" : initials(r.name)}</span>
                    <span className="truncate text-primary" title={r.name}>{r.name}</span>
                  </span>
                  <span role="cell" className="text-right tabular-nums text-primary">{r.resolved}</span>
                  <span role="cell" className="text-right tabular-nums text-primary">{r.onTime}</span>
                  <span role="cell" className="text-right"><span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-semibold tabular-nums ${slaPill(r.pct)}`}>{r.pct === null ? "Sem dados" : `${r.pct}%`}</span></span>
                </div>
              ))}
            </div>
          )}
          {techs.some((r) => r.resolved > 0 && isSmallSample(r.resolved)) && (
            <p className="mt-3 text-xs text-muted leading-snug">Há técnicos com menos de {SMALL_SAMPLE_MIN} chamados resolvidos: com amostra pequena o percentual não indica desempenho. Esta tabela é informativa e não classifica técnicos.</p>
          )}
        </div>
      </motion.section>


      {/* ── critérios e ressalvas de dados ── */}
      <p className="text-[11.5px] text-muted leading-relaxed" data-testid="sla-footnote">
        {m.considered} chamado(s) avaliados · expediente {DEFAULT_CALENDAR.windows.map((w) => w.join("–")).join(" e ")}, seg–sex ({DEFAULT_CALENDAR.timeZone}) · feriados ainda não cadastrados (não descontados)
        {m.previewMode ? " · política ainda não ativada em produção: resultados em pré-visualização" : ""}
        {m.legacyExcluded > 0 ? ` · ${m.legacyExcluded} anterior(es) à vigência (preservados, fora do cálculo)` : ""}
        {res.withoutReliableDate > 0 ? ` · ${res.withoutReliableDate} resolvido(s) sem data confiável (dados insuficientes)` : ""}
        {m.skipped > 0 ? ` · ${m.skipped} fora do SLA (projetos/sem meta)` : ""}
        {m.integrityIssues > 0 ? ` · ATENÇÃO: ${m.integrityIssues} chamado(s) com trilha de eventos inconsistente` : ""}
      </p>

      {expanded === "trend" && (
        <FullscreenView title="Tendência do SLA" subtitle={`${periodLabel}${trend.points.length ? ` · ${GRAN_LABEL[trend.granularity]}` : ""}`} onClose={() => setExpanded(null)}>
          <div className="max-w-[1600px] mx-auto">
            <TrendChart points={trend.points} height={Math.max(320, winH - 250)} />
            <div className="mt-3 flex items-center justify-center gap-6 text-sm text-secondary">
              <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-emerald-500" />SLA de Resolução</span>
              <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-sky-500" />SLA de 1ª Resposta</span>
            </div>
          </div>
        </FullscreenView>
      )}
      {expanded === "status" && (
        <FullscreenView title="Situação dos Chamados" subtitle={`${dist.total} chamado(s) · ${periodLabel}`} onClose={() => setExpanded(null)}>
          <div className="max-w-5xl mx-auto flex flex-col lg:flex-row items-center justify-center gap-10 lg:gap-16 min-h-full">
            <StatusDonut slices={dist.slices} total={dist.total} maxWidth={Math.min(420, Math.max(240, winH - 280))} />
            <ul className="w-full lg:max-w-md text-base" aria-label="Legenda da situação dos chamados">
              {dist.slices.map((sl) => (
                <li key={sl.key} className="flex items-center gap-3 py-2.5 border-b border-subtle last:border-b-0">
                  <span className={`h-3 w-3 rounded-full shrink-0 ${STATUS_STYLE[sl.key].dot}`} aria-hidden />
                  <span className="flex-1 min-w-0 text-secondary">{sl.label}</span>
                  <span className="font-semibold tabular-nums text-primary w-12 text-right">{sl.count}</span>
                  <span className="tabular-nums text-muted w-16 text-right">{fmtPct1(sl.pct)}</span>
                </li>
              ))}
            </ul>
          </div>
        </FullscreenView>
      )}
    </div>
  );
}

