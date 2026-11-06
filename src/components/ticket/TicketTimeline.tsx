import React from "react";
import { Activity, ArrowUpDown, CheckCircle2, FolderTree, PlayCircle, Plus, RotateCcw, Sparkles, UserCheck, UserMinus, UserPen, Info } from "lucide-react";
import type { Ticket } from "../../types";
import RichText, { stripMarkdown } from "./RichText";

/**
 * Linha do tempo do chamado.
 *
 * FONTES REAIS (nada é inventado):
 *  - abertura: ticket.createdAt + solicitante/departamento;
 *  - triagem: ticket.aiCategory/aiPriority (usa o horário do comentário "ai", se existir; senão createdAt);
 *  - alterações: comentários `authorRole === "system"` gravados pelo servidor em PATCH /api/tickets/:id.
 *    Cada linha do comentário é um evento (status, prioridade, categoria, solicitante, técnicos).
 *
 * LIMITAÇÕES (dados que o backend ainda não guarda, para uma versão futura):
 *  - quem executou a alteração (o log não registra o autor) → o evento não mostra "responsável";
 *  - o horário exato da triagem quando ela roda depois da abertura (só há createdAt/updatedAt);
 *  - alterações feitas antes de o servidor passar a registrar o log não aparecem.
 */
export type TimelineKind = "opened" | "triage" | "assign" | "unassign" | "start" | "status" | "finish" | "reopen" | "priority" | "category" | "requester" | "info";

export interface TimelineEvent {
  id: string;
  kind: TimelineKind;
  title: string;
  description?: string;
  timestamp: string;
}

const isDone = (s: string) => s === "Resolvido" || s === "Fechado";

function parseSystemLine(line: string): Omit<TimelineEvent, "id" | "timestamp"> | null {
  const L = line.trim();
  if (!L) return null;
  let m: RegExpExecArray | null;

  if ((m = /^Status alterado automaticamente para \*\*(.+?)\*\*/.exec(L))) {
    return { kind: m[1] === "Em Atendimento" ? "start" : "status", title: m[1] === "Em Atendimento" ? "Atendimento iniciado" : `Status: ${m[1]}`, description: "Status alterado automaticamente" };
  }
  if ((m = /^Status alterado de \*\*(.+?)\*\* para \*\*(.+?)\*\*/.exec(L))) {
    const [, from, to] = m;
    if (isDone(to)) return { kind: "finish", title: "Chamado finalizado", description: `Status: ${from} → ${to}` };
    if (isDone(from)) return { kind: "reopen", title: "Chamado reaberto", description: `Status: ${from} → ${to}` };
    return { kind: to === "Em Atendimento" ? "start" : "status", title: `Status: ${to}`, description: `De ${from} para ${to}` };
  }
  if ((m = /^Prioridade alterada de \*\*(.+?)\*\* para \*\*(.+?)\*\*/.exec(L))) {
    return { kind: "priority", title: "Prioridade alterada", description: `De ${m[1]} para ${m[2]}` };
  }
  if ((m = /^Categoria alterada de \*\*(.+?)\*\* para \*\*(.+?)\*\*/.exec(L))) {
    return { kind: "category", title: "Categoria alterada", description: `De ${m[1]} para ${m[2]}` };
  }
  if ((m = /^Solicitante alterado de \*\*(.+?)\*\* para \*\*(.+?)\*\*/.exec(L))) {
    return { kind: "requester", title: "Solicitante alterado", description: `De ${m[1]} para ${m[2]}` };
  }
  if ((m = /^Técnico\(s\) adicionado\(s\): \*\*(.+?)\*\*/.exec(L))) {
    return { kind: "assign", title: "Técnico atribuído", description: m[1] };
  }
  if ((m = /^Técnico\(s\) removido\(s\): \*\*(.+?)\*\*/.exec(L))) {
    return { kind: "unassign", title: "Técnico removido", description: m[1] };
  }
  if ((m = /^Responsável atribuído:\s*(.+)$/.exec(L))) {
    return { kind: "assign", title: "Técnico atribuído", description: stripMarkdown(m[1]) };
  }
  if ((m = /^Chamado reaberto \((.+?)\):\s*(.+)$/.exec(L))) {
    return { kind: "info", title: "Motivo da reabertura", description: `${m[1]} — ${stripMarkdown(m[2])}` };
  }
  if ((m = /^SLA de resolução pausado:\s*(.+)$/.exec(L))) {
    return { kind: "status", title: "SLA de resolução pausado", description: stripMarkdown(m[1]) };
  }
  if ((m = /^SLA de resolução retomado\s*[:(]?\s*(.*?)\)?$/.exec(L))) {
    return { kind: "start", title: "SLA de resolução retomado", description: stripMarkdown(m[1]) || undefined };
  }
  if (/^Tempo total/.test(L)) return { kind: "info", title: "Tempo de atendimento", description: stripMarkdown(L.replace(/^Tempo total[^:]*:\s*/, "")) };
  return { kind: "info", title: "Registro do sistema", description: stripMarkdown(L) };
}

export function buildTicketEvents(ticket: Ticket): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  events.push({
    id: "opened",
    kind: "opened",
    title: "Chamado aberto",
    description: `Por ${ticket.requesterName} (${ticket.requesterDepartment})`,
    timestamp: ticket.createdAt,
  });

  if (ticket.aiCategory) {
    const aiComment = ticket.comments.find((c) => c.authorRole === "ai");
    events.push({
      id: "triage",
      kind: "triage",
      title: "Triagem Inteligente (IA)",
      description: `Categoria: ${ticket.aiCategory}${ticket.aiPriority ? ` • Prioridade: ${ticket.aiPriority}` : ""}`,
      timestamp: aiComment?.timestamp || ticket.createdAt,
    });
  }

  for (const c of ticket.comments) {
    if (c.authorRole !== "system") continue;
    c.content.split("\n").forEach((line, i) => {
      const parsed = parseSystemLine(line);
      if (!parsed) return;
      // "Tempo total…" complementa a finalização do mesmo registro
      if (parsed.kind === "info" && parsed.title === "Tempo de atendimento") {
        const prev = [...events].reverse().find((e) => e.kind === "finish" && e.timestamp === c.timestamp);
        if (prev) {
          prev.description = `${prev.description ?? ""} • Tempo total: ${parsed.description}`;
          return;
        }
      }
      events.push({ id: `${c.id}-${i}`, ...parsed, timestamp: c.timestamp });
    });
  }

  // cronológico estável → inverte para "mais recente primeiro"
  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => new Date(a.e.timestamp).getTime() - new Date(b.e.timestamp).getTime() || a.i - b.i)
    .map((x) => x.e)
    .reverse();
}

const ICON: Record<TimelineKind, { icon: React.ElementType; tone: string }> = {
  opened: { icon: Plus, tone: "bg-surface-2 text-secondary" },
  triage: { icon: Sparkles, tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  assign: { icon: UserCheck, tone: "bg-sky-500/10 text-sky-700 dark:text-sky-400" },
  unassign: { icon: UserMinus, tone: "bg-surface-2 text-secondary" },
  start: { icon: PlayCircle, tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  status: { icon: ArrowUpDown, tone: "bg-sky-500/10 text-sky-700 dark:text-sky-400" },
  finish: { icon: CheckCircle2, tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  reopen: { icon: RotateCcw, tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  priority: { icon: ArrowUpDown, tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  category: { icon: FolderTree, tone: "bg-surface-2 text-secondary" },
  requester: { icon: UserPen, tone: "bg-surface-2 text-secondary" },
  info: { icon: Info, tone: "bg-surface-2 text-secondary" },
};

const fmt = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
};

export default function TicketTimeline({ ticket }: { ticket: Ticket }) {
  const events = React.useMemo(() => buildTicketEvents(ticket), [ticket]);

  return (
    <ol className="relative" aria-label="Histórico do chamado">
      {events.map((ev, i) => {
        const { icon: Icon, tone } = ICON[ev.kind];
        const last = i === events.length - 1;
        return (
          <li key={ev.id} className="relative flex gap-3 pb-5 last:pb-0">
            {!last && <span className="absolute left-[15px] top-8 bottom-0 w-px bg-default" aria-hidden />}
            <span className={`relative z-[1] w-8 h-8 shrink-0 rounded-full flex items-center justify-center ring-4 ring-surface ${tone}`}>
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-primary leading-tight">{ev.title}</p>
              </div>
              {ev.description && <p className="mt-0.5 text-xs text-secondary break-words"><RichText text={ev.description} /></p>}
              <time dateTime={ev.timestamp} className="mt-0.5 block text-[11px] text-muted tabular-nums">{fmt(ev.timestamp)}</time>
            </div>
          </li>
        );
      })}
      {events.length === 0 && (
        <li className="text-sm text-secondary flex items-center gap-2"><Activity className="h-4 w-4" /> Nenhum evento registrado.</li>
      )}
    </ol>
  );
}
