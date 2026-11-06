import React from "react";
import { AlertTriangle, Hourglass, PauseCircle, RotateCcw, Timer } from "lucide-react";
import type { Ticket } from "../../types";
import { Pill } from "../ui/Badges";
import type { Tone } from "../ui/StatCard";
import { useNow } from "../../hooks/useNow";
import QualityPreparation from "../quality/QualityPreparation";
import { DEFAULT_CALENDAR, REOPEN_LABEL } from "../../lib/sla/config";
import { ClockResult, SLA_STATE_LABEL, SlaState, computeTicketSla, formatBusinessMinutes } from "../../lib/sla/ticketSla";

const STATE_TONE: Record<SlaState, Tone> = {
  met: "emerald",
  breached: "rose",
  running: "emerald",
  at_risk: "amber",
  paused: "sky",
  no_data: "neutral",
  not_applicable: "neutral",
};

const fmt = (ms: number | null) => {
  if (ms === null) return "—";
  const d = new Date(ms);
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-[12px] text-secondary">{label}</span>
      <span className="text-[12px] text-primary text-right tabular-nums">{children}</span>
    </div>
  );
}

function Clock({ title, clock, finished, paused, note }: { title: string; clock: ClockResult; finished: boolean; paused?: boolean; note?: string }) {
  const over = clock.remainingMin !== null && clock.remainingMin < 0;
  return (
    <div className="rounded-lg border border-default bg-surface-2/50 px-3 py-2">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[12px] font-semibold text-primary">{title}</span>
        {/* o texto do estado acompanha a cor: o significado não depende só da cor */}
        <Pill tone={STATE_TONE[clock.state]}>{SLA_STATE_LABEL[clock.state]}</Pill>
      </div>
      <Row label="Prazo aplicável">{formatBusinessMinutes(clock.targetMin)} úteis</Row>
      <Row label="Tempo consumido">{clock.state === "no_data" ? "—" : formatBusinessMinutes(clock.consumedMin)}</Row>
      <Row label={over ? "Atraso" : "Tempo restante"}>
        {clock.remainingMin === null ? "—" : <span className={over ? "font-semibold text-rose-600 dark:text-rose-400" : ""}>{formatBusinessMinutes(over ? -clock.remainingMin : clock.remainingMin)}</span>}
      </Row>
      <Row label={finished ? "Vencimento (prazo)" : "Vencimento previsto"}>{paused ? "Pausado" : fmt(clock.dueAt)}</Row>
      {clock.endedAt !== null && <Row label="Encerrado em">{fmt(clock.endedAt)}</Row>}
      {clock.breachedBefore && <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1">Violação registrada antes de uma mudança de prioridade.</p>}
      {note && <p className="text-[11px] text-muted mt-1">{note}</p>}
    </div>
  );
}

/** Painel de SLA em horas úteis: primeira resposta e resolução separados, pausas, reaberturas e prioridade. */
function SectionLabel({ title, tag }: { title: string; tag: string }) {
  return (
    <p className="flex items-baseline gap-1.5 pt-1 text-[11px] uppercase tracking-wide font-semibold text-muted">
      {title}<span className="normal-case tracking-normal font-normal">· {tag}</span>
    </p>
  );
}

export default function TicketSlaPanel({ ticket, showQuality = false }: { ticket: Ticket; showQuality?: boolean }) {
  const now = useNow(30_000);
  const sla = computeTicketSla(ticket, now);
  const finished = sla.resolution.resolvedAt !== null;
  const lastPause = sla.pauses[sla.pauses.length - 1];

  return (
    <div className="bg-surface border border-default rounded-xl shadow-card p-4" data-testid="ticket-sla-panel">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-primary mb-2">
        <Timer className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
        SLA em horas úteis
        {sla.era === "preview" && (
          <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400" title="A política ainda não foi ativada em produção">pré-visualização</span>
        )}
        {sla.era === "legacy" && (
          <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-default bg-surface-2 text-secondary" title="Chamado anterior à vigência da política: registros preservados">anterior à vigência</span>
        )}
      </h3>

      {!sla.applicable ? (
        <p className="text-[12px] text-secondary">SLA não aplicável: {sla.reason}.</p>
      ) : (
        <div className="space-y-2.5">
          {!sla.integrity.ok && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-800 dark:text-rose-300" role="alert">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
              <span>Trilha de eventos de SLA inconsistente: {sla.integrity.problems[0]}</span>
            </div>
          )}
          {sla.waitingRequester && lastPause && (
            <div className="flex items-start gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-[12px] text-sky-800 dark:text-sky-300">
              <PauseCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
              <span>
                SLA de resolução <strong>pausado</strong> desde {fmt(lastPause.startAt)} — {lastPause.reason}. A contagem retoma quando o solicitante responder.
              </span>
            </div>
          )}
          {sla.reopened && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-300">
              <RotateCcw className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
              <span>Chamado <strong>reaberto</strong>. O SLA original está preservado; a correção é medida à parte.</span>
            </div>
          )}

          <SectionLabel title="Cumprimento do SLA" tag="automático e objetivo" />
          <Clock title="Primeira resposta" clock={sla.firstResponse} finished={sla.firstResponse.endedAt !== null} />
          <Clock
            title={finished ? "Resolução (SLA original)" : "Resolução"}
            clock={sla.resolution}
            finished={finished}
            paused={sla.waitingRequester}
            note={finished ? (sla.resolution.source === "snapshot" ? "Resultado registrado na primeira resolução e preservado." : "Calculado a partir do histórico (sem registro do SLA original).") : undefined}
          />

          {sla.cycles.length > 0 && (
            <div>
              <h4 className="flex items-center gap-1.5 text-[12px] font-semibold text-secondary mb-1"><RotateCcw className="h-3.5 w-3.5" aria-hidden />Histórico de reaberturas ({sla.cycles.length})</h4>
              <p className="text-[11px] text-muted mb-1.5">Eventos auditáveis; não alteram o SLA original nem avaliam o técnico. Técnicos envolvidos: {ticket.assignedTo || "—"}.</p>
              <ul className="space-y-1.5">
                {sla.cycles.map((c) => (
                  <li key={c.index} className="text-[11.5px] text-secondary leading-snug rounded-lg border border-default px-2.5 py-1.5">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium text-primary">Ciclo {c.index}{c.category ? ` · ${REOPEN_LABEL[c.category]}` : ""}</span>
                      <span className="tabular-nums">{c.ongoing ? "em andamento" : "concluído"}</span>
                    </div>
                    <div>{fmt(c.openedAt)} → {c.resolvedAt ? fmt(c.resolvedAt) : "em andamento"} · correção: <strong>{formatBusinessMinutes(c.correctionMin)}</strong> úteis{c.openedBy ? ` · por ${c.openedBy}` : ""}</div>
                    {c.reason ? <div className="text-muted break-words">“{c.reason}”</div> : <div className="text-muted">Sem motivo registrado (histórico anterior).</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {showQuality && sla.cycles.length > 0 && <QualityPreparation />}

          {sla.pauses.length > 0 && (
            <div>
              <h4 className="flex items-center gap-1.5 text-[12px] font-semibold text-secondary mb-1"><Hourglass className="h-3.5 w-3.5" aria-hidden />Pausas ({sla.pauses.length})</h4>
              <ul className="space-y-1">
                {sla.pauses.slice().reverse().map((p) => (
                  <li key={p.startAt} className="text-[11.5px] text-secondary leading-snug">
                    {fmt(p.startAt)} → {p.endAt === null ? "em andamento" : fmt(p.endAt)} · {p.reason} <span className="text-muted">(por {p.by}{p.resumedBy ? `; retomado por ${p.resumedBy}` : ""}{p.trigger === "requester_reply" ? " — resposta do solicitante" : p.trigger === "manual_status_change" ? " — mudança de status" : p.trigger === "ticket_resolved" ? " — chamado resolvido" : ""})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {sla.priorityHistory.length > 0 && (
            <div>
              <h4 className="text-[12px] font-semibold text-secondary mb-1">Prioridade</h4>
              <ul className="space-y-1">
                {sla.priorityHistory.map((h, i) => (
                  <li key={i} className="text-[11.5px] text-secondary leading-snug">
                    {fmt(h.at)} · {h.kind === "initial"
                      ? <>classificação inicial ({h.source === "ia" ? "IA" : "triagem local"}): <strong>{h.to}</strong>{h.suggested && h.suggested !== h.to ? ` (sugerida: ${h.suggested})` : ""}</>
                      : <>alterada de {h.from} para <strong>{h.to}</strong> <span className="text-muted">(por {h.by})</span></>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[10.5px] text-muted leading-snug">
            Expediente {DEFAULT_CALENDAR.windows.map((w) => w.join("–")).join(" e ")}, seg–sex ({DEFAULT_CALENDAR.timeZone}). Feriados ainda não cadastrados: não são descontados.
          </p>
        </div>
      )}
    </div>
  );
}
