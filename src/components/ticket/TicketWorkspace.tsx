import React, { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowLeft, Bell, BellRing, Building, Calendar, Camera, Check, CheckCircle, Clock, Eye, FileText, Headphones, Info, Layers,
  MessageSquare, Paperclip, RefreshCw, Send, Sparkles, Trash2, Upload, User as UserIcon, UserPlus, X, Activity as ActivityIcon, ClipboardList,
} from "lucide-react";
import type { ReopenCategory, Ticket, User, UserSession } from "../../types";
import { Pill, SlaBadge } from "../ui/Badges";
import { STATUS_TONE, PRIORITY_TONE } from "../ui/Badges";
import { TONE } from "../ui/StatCard";
import { REVEAL } from "../transition/workspaceReveal";
import TicketTimeline from "./TicketTimeline";
import TicketSlaPanel from "./TicketSlaPanel";
import ReopenDialog from "./ReopenDialog";
import { computeTicketSla } from "../../lib/sla/ticketSla";
import { useNow } from "../../hooks/useNow";

export interface TicketWorkspaceProps {
  ticket: Ticket;
  currentSession: UserSession;
  users: User[];
  isTechUser: boolean;
  isAssignedToOther: boolean;
  isOverdue: boolean;
  slaLabel: string;
  getAssignedTechs: (assignedTo: string | null) => string[];
  getFirstAssignedTech: (t: Ticket) => string | null;
  onUpdateMeta: (id: string, fields: Partial<Ticket>) => void | Promise<void>;
  onDelete: (id: string) => void;
  confirmingDeleteId: string | null;
  setConfirmingDeleteId: (id: string | null) => void;
  notificationPermission: NotificationPermission | "unsupported";
  onToggleNotifications: () => void;
  onPreviewImage: (url: string | null) => void;
  commentText: string;
  setCommentText: (v: string) => void;
  commentAttachment: string | null;
  commentAttachmentName: string;
  onClearAttachment: () => void;
  /** Lê/comprime o arquivo e o coloca como anexo do próximo comentário. */
  onAttachFile: (file: File, fallbackName?: string) => void;
  onSubmitComment: (e: React.FormEvent) => void;
  onBack: () => void;
  reduceMotion: boolean;
}

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};
const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};
const dayKey = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toDateString();
};
const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Hoje";
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR");
};

const card = "bg-surface border border-default rounded-xl shadow-card";
const sectionTitle = "flex items-center gap-2 text-sm font-semibold text-primary";
const fieldCls = "h-9 w-full bg-surface border border-default hover:border-secondary/40 rounded-lg px-2.5 text-sm text-primary focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

function InfoRow({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-subtle last:border-b-0">
      <span className="flex items-center gap-2 text-[13px] text-secondary shrink-0">
        <Icon className="h-4 w-4 text-muted" aria-hidden />
        {label}
      </span>
      <span className="text-[13px] text-primary text-right min-w-0 break-words">{children}</span>
    </div>
  );
}

export default function TicketWorkspace(p: TicketWorkspaceProps) {
  const { ticket, currentSession, isTechUser, isAssignedToOther } = p;
  const [tab, setTab] = useState<"chat" | "info" | "activity">("chat");
  const [reopenOpen, setReopenOpen] = useState(false);
  const now = useNow(60_000);
  // Vencimento exibido = motor de SLA (horas úteis). O campo legado `slaLimit` não é mais mostrado.
  const slaView = computeTicketSla(ticket, now);
  const feedRef = useRef<HTMLDivElement>(null);

  // O chat mostra só a conversa; registros automáticos (status, técnicos, prioridade…) ficam em "Atividade do Chamado".
  const messages = ticket.comments.filter((c) => c.authorRole !== "ai" && c.authorRole !== "system");
  const lastMsgId = messages[messages.length - 1]?.id;

  // Mantém a conversa ancorada na mensagem mais recente (rolagem independente do restante).
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [ticket.id, lastMsgId, tab]);

  const anim = (cfg: { delay: number; x?: number; y?: number; scale?: number }) =>
    p.reduceMotion
      ? { initial: false as const }
      : {
          initial: { opacity: 0, x: cfg.x ?? 0, y: cfg.y ?? 0, scale: cfg.scale ?? 1 },
          animate: { opacity: 1, x: 0, y: 0, scale: 1 },
          transition: { duration: REVEAL.panel.duration, delay: cfg.delay, ease: REVEAL.ease },
        };

  const assignedTechs = p.getAssignedTechs(ticket.assignedTo);
  const firstTech = p.getFirstAssignedTech(ticket);
  const canManageAssignments = assignedTechs.length === 0 || currentSession.name === firstTech;
  const statusTone = STATUS_TONE[ticket.status] ?? "neutral";
  const priorityTone = PRIORITY_TONE[ticket.priority] ?? "neutral";
  const finished = ticket.status === "Resolvido" || ticket.status === "Fechado";
  const notifOn = p.notificationPermission === "granted";

  const tabs: { id: typeof tab; label: string; icon: React.ElementType; cls: string }[] = [
    { id: "chat", label: "Conversa", icon: MessageSquare, cls: "" },
    { id: "info", label: "Informações", icon: Info, cls: "md:hidden" },
    { id: "activity", label: "Atividade", icon: ActivityIcon, cls: "" },
  ];

  const leftVis = tab === "info" ? "flex" : "hidden md:flex";
  const centerVis = tab === "activity" ? "hidden xl:flex" : tab === "info" ? "hidden md:flex" : "flex";
  const rightVis = tab === "activity" ? "flex" : "hidden xl:flex";

  return (
    <div className="flex flex-col md:h-full md:min-h-0 gap-3 lg:gap-4 p-3 sm:p-4 lg:p-5 max-w-[1800px] mx-auto w-full" data-testid="ticket-workspace">
      {/* ───────── Cabeçalho ───────── */}
      <motion.header {...anim(REVEAL.panel.header)} className={`${card} px-3 sm:px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2.5`}>
        <button
          type="button"
          onClick={p.onBack}
          className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-lg border border-default bg-surface hover:bg-surface-2 text-secondary hover:text-primary transition-colors duration-150 cursor-pointer"
          aria-label="Voltar para a Fila de Chamados"
          title="Voltar para a Fila de Chamados (Esc)"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div id="g7-ticket-header-anchor" className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1.5 min-w-0 flex-1 basis-60">
          <span className="w-9 h-9 shrink-0 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
            <MessageSquare className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <span className="shrink-0 font-mono text-xs px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold tabular-nums">
            Chamado #{ticket.id}
          </span>
          <h2 className="font-display text-base sm:text-lg font-bold text-primary basis-full sm:basis-auto min-w-0 sm:truncate break-words" title={ticket.title}>{ticket.title}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={priorityTone} dot={false}>Prioridade: <strong className="ml-1 font-semibold">{ticket.priority}</strong></Pill>
          <span className="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-full border border-default bg-surface-2 text-xs font-medium text-secondary">
            <Layers className="h-3 w-3" aria-hidden />
            {ticket.category}
          </span>
          {isTechUser ? (
            <select
              value={ticket.status}
              onChange={(e) => {
                const next = e.target.value as Ticket["status"];
                if (finished && next !== "Resolvido" && next !== "Fechado") {
                  // Reabertura exige categoria e justificativa (SLA original é preservado).
                  setReopenOpen(true);
                  return;
                }
                if (next === "Aguardando Solicitante") {
                  // Pausa de SLA exige um motivo registrado (cancelar não altera o chamado).
                  const reason = window.prompt("Motivo da espera pelo solicitante (fica registrado no histórico de SLA):", "Aguardando resposta do solicitante");
                  if (reason === null) return;
                  p.onUpdateMeta(ticket.id, { status: next, pauseReason: reason.trim() || undefined } as Partial<Ticket>);
                  return;
                }
                p.onUpdateMeta(ticket.id, { status: next });
              }}
              disabled={isAssignedToOther}
              aria-label="Status do chamado"
              title={isAssignedToOther ? `Apenas o técnico responsável (${ticket.assignedTo}) pode alterar o status.` : "Alterar status"}
              className={`h-8 rounded-full border px-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${TONE[statusTone].chip}`}
            >
              <option value="Aberto">Aberto</option>
              <option value="Em Atendimento">Em Atendimento</option>
              <option value="Aguardando Solicitante">Aguardando Solicitante</option>
              <option value="Resolvido">Resolvido</option>
              <option value="Fechado">Fechado</option>
            </select>
          ) : (
            <Pill tone={statusTone}>{ticket.status === "Aberto" ? "Pendente" : ticket.status}</Pill>
          )}
        </div>
      </motion.header>

      {/* Navegação por seções (celular / tablet) */}
      <div role="tablist" aria-label="Seções do chamado" className="xl:hidden flex gap-1 p-1 rounded-lg bg-surface-2 border border-default">
        {tabs.map(({ id, label, icon: Icon, cls }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`${cls} flex-1 h-8 inline-flex items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors duration-150 cursor-pointer ${
              tab === id ? "bg-surface text-primary shadow-card" : "text-secondary hover:text-primary"
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {/* ───────── Corpo: 3 colunas ───────── */}
      <div className="md:flex-1 md:min-h-0 grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] xl:grid-cols-[minmax(0,28fr)_minmax(0,45fr)_minmax(0,27fr)] md:grid-rows-[minmax(0,1fr)] gap-3 lg:gap-4">
        {/* Coluna esquerda — informações e atendimento */}
        <motion.section {...anim(REVEAL.panel.left)} className={`${leftVis} flex-col gap-3 md:min-h-0 md:overflow-y-auto md:pr-1`} aria-label="Informações e atendimento">
          <div className={`${card} p-4`}>
            <h3 className={`${sectionTitle} mb-1`}><Layers className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />Informações do chamado</h3>
            <InfoRow icon={UserIcon} label="Solicitado por"><strong className="font-semibold">{ticket.requesterName}</strong></InfoRow>
            <InfoRow icon={Building} label="Departamento">{ticket.requesterDepartment}</InfoRow>
            <InfoRow icon={Calendar} label="Data de abertura">{fmtDate(ticket.createdAt)} às {fmtTime(ticket.createdAt)}</InfoRow>
            <InfoRow icon={Clock} label="Vencimento da resolução">
              <span className="inline-flex flex-wrap items-center justify-end gap-2">
                <span className={p.isOverdue ? "font-semibold text-rose-600 dark:text-rose-400" : "font-medium"}>
                  {slaView.applicable && slaView.resolution.dueAt !== null
                    ? `${fmtDate(new Date(slaView.resolution.dueAt).toISOString())} ${fmtTime(new Date(slaView.resolution.dueAt).toISOString())}`
                    : slaView.waitingRequester ? "Pausado" : "—"}
                </span>
                <SlaBadge label={p.slaLabel} />
              </span>
            </InfoRow>
            {ticket.projectDeadline && (
              <InfoRow icon={Calendar} label="Limite do projeto">
                <span className="font-medium text-emerald-700 dark:text-emerald-400">
                  {(() => {
                    const [y, m, d] = ticket.projectDeadline!.split("-");
                    return y && m && d ? `${d}/${m}/${y}` : ticket.projectDeadline;
                  })()}
                </span>
              </InfoRow>
            )}
          </div>

          <TicketSlaPanel ticket={ticket} showQuality={isTechUser} />

          {ticket.aiCategory && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  <Sparkles className="h-4 w-4" aria-hidden />Triagem Inteligente (IA)
                </h3>
                {ticket.screenshot && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium"><Camera className="h-3 w-3" /> Print analisado</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-surface border border-default px-3 py-2">
                  <span className="block text-[11px] text-muted">Categoria IA</span>
                  <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{ticket.aiCategory}</span>
                </div>
                <div className="rounded-lg bg-surface border border-default px-3 py-2">
                  <span className="block text-[11px] text-muted">Prioridade IA</span>
                  <span className={`text-sm font-semibold ${ticket.aiPriority === "Urgente" ? "text-rose-600 dark:text-rose-400" : ticket.aiPriority === "Alta" ? "text-amber-600 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}`}>{ticket.aiPriority}</span>
                </div>
              </div>
              {ticket.aiReasoning && (
                <div>
                  <span className="block text-xs font-semibold text-secondary mb-1">Diagnóstico</span>
                  <p className="text-[13px] leading-relaxed text-secondary italic whitespace-pre-line rounded-lg bg-surface border border-default px-3 py-2">“{ticket.aiReasoning}”</p>
                </div>
              )}
              {ticket.aiSuggestions && (
                <div>
                  <span className="block text-xs font-semibold text-secondary mb-1">Soluções recomendadas</span>
                  <ul className="space-y-1.5 text-[13px] text-secondary leading-relaxed">
                    {ticket.aiSuggestions.split("\n").filter((l) => l.trim()).map((line, i) => (
                      <li key={i} className="flex gap-2 items-start">
                        <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" aria-hidden />
                        <span>{line.replace(/^\d+[.\-\s]+/, "")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className={`${card} p-4`}>
            <h3 className={`${sectionTitle} mb-2`}><ClipboardList className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />Descrição do problema</h3>
            <p className="text-[13px] leading-relaxed text-primary whitespace-pre-line break-words rounded-lg bg-surface-2/60 px-3 py-2.5">{ticket.description}</p>

            {((ticket.attachments && ticket.attachments.length > 0) || ticket.screenshot) && (
              <div className="mt-4">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-secondary mb-2"><Paperclip className="h-3.5 w-3.5" aria-hidden />Anexos do chamado</h4>
                {ticket.attachments && ticket.attachments.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 2xl:grid-cols-2 gap-2">
                    {ticket.attachments.map((file, idx) => {
                      const isImage = file.type.startsWith("image/");
                      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
                      return (
                        <div key={idx} className="flex flex-col gap-2 p-2 rounded-lg border border-default bg-surface-2/50">
                          <div className="flex items-center gap-2 min-w-0">
                            {isImage ? (
                              <div className="w-10 h-10 rounded-md overflow-hidden border border-default shrink-0 bg-surface"><img src={file.url} alt={file.name} className="w-full h-full object-cover" /></div>
                            ) : (
                              <div className={`w-10 h-10 rounded-md shrink-0 flex items-center justify-center bg-surface border border-default ${isPdf ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400"}`}><FileText className="h-5 w-5" /></div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-primary truncate" title={file.name}>{file.name}</p>
                              <p className="text-[11px] text-muted">{isPdf ? "Documento PDF" : isImage ? "Imagem" : "Arquivo"}</p>
                            </div>
                          </div>
                          {isImage ? (
                            <button type="button" onClick={() => p.onPreviewImage(file.url)} className="h-8 inline-flex items-center justify-center gap-1.5 rounded-lg border border-default bg-surface hover:bg-surface-2 text-xs font-medium text-secondary hover:text-primary transition-colors duration-150 cursor-pointer"><Eye className="h-3.5 w-3.5" /> Visualizar</button>
                          ) : (
                            <a href={file.url} download={file.name} target="_blank" rel="noopener noreferrer" className="h-8 inline-flex items-center justify-center gap-1.5 rounded-lg border border-default bg-surface hover:bg-surface-2 text-xs font-medium text-secondary hover:text-primary transition-colors duration-150"><Upload className="h-3.5 w-3.5 rotate-180" /> Abrir / Baixar</a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <button type="button" onClick={() => p.onPreviewImage(ticket.screenshot || null)} className="relative block rounded-lg overflow-hidden border border-default cursor-zoom-in max-w-full group" title="Abrir em tela cheia">
                    <img src={ticket.screenshot} alt="Print do chamado" className="max-h-52 object-contain" />
                    <span className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center justify-center">
                      <span className="bg-surface text-primary text-xs font-medium px-2.5 py-1.5 rounded-lg border border-default inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> Ver imagem completa</span>
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>

          {isTechUser && (
            <div className={`${card} p-4 space-y-3`}>
              <h3 className={sectionTitle}><Headphones className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />Atendimento</h3>

              {isAssignedToOther && (
                <p className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                  Atribuído a <strong>{ticket.assignedTo}</strong>. Apenas os responsáveis podem alterar ou finalizar.
                </p>
              )}

              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-secondary">Técnico atribuído</label>
                  {assignedTechs.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => p.onUpdateMeta(ticket.id, { assignedTo: currentSession.name })}
                      className="w-full h-9 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors duration-150 cursor-pointer"
                    >
                      <UserPlus className="h-4 w-4" />
                      Assumir chamado
                    </button>
                  ) : (
                    <div className="rounded-lg border border-default bg-surface-2/50 p-1 max-h-40 overflow-y-auto space-y-0.5">
                      {p.users.filter((u) => u.role === "tecnico").map((tech) => {
                        const isAssigned = assignedTechs.includes(tech.name);
                        return (
                          <button
                            type="button"
                            key={tech.id}
                            role="checkbox"
                            aria-checked={isAssigned}
                            disabled={!canManageAssignments}
                            onClick={() => {
                              const updated = isAssigned ? assignedTechs.filter((n) => n !== tech.name) : [...assignedTechs, tech.name];
                              p.onUpdateMeta(ticket.id, { assignedTo: updated.length > 0 ? updated.join(", ") : null });
                            }}
                            className={`w-full flex items-center justify-between gap-2 px-2.5 h-8 rounded-md text-left text-[13px] transition-colors duration-150 ${
                              isAssigned ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-medium" : "text-secondary hover:bg-surface-3/60"
                            } ${canManageAssignments ? "cursor-pointer" : "opacity-60 cursor-not-allowed"}`}
                          >
                            <span className="truncate">{tech.name}</span>
                            {isAssigned && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="ws-priority" className="block text-xs font-medium text-secondary">Prioridade</label>
                  <select
                    id="ws-priority"
                    value={ticket.priority}
                    onChange={(e) => p.onUpdateMeta(ticket.id, { priority: e.target.value as Ticket["priority"] })}
                    disabled={isAssignedToOther}
                    className={fieldCls}
                  >
                    <option value="Baixa">Baixa</option>
                    <option value="Média">Média</option>
                    <option value="Alta">Alta</option>
                    <option value="Urgente">Urgente</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-default flex gap-2">
                {!finished ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (isAssignedToOther) {
                        alert(`Este chamado está atribuído a ${ticket.assignedTo}.`);
                        return;
                      }
                      p.onUpdateMeta(ticket.id, { status: "Resolvido" });
                    }}
                    disabled={isAssignedToOther}
                    title={isAssignedToOther ? `Apenas ${ticket.assignedTo} pode finalizar este chamado` : ""}
                    className="flex-1 h-10 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-sm font-semibold shadow-card transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <CheckCircle className="h-4 w-4" />
                    Finalizar chamado
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (isAssignedToOther) {
                        alert(`Este chamado está atribuído a ${ticket.assignedTo}.`);
                        return;
                      }
                      setReopenOpen(true);
                    }}
                    disabled={isAssignedToOther}
                    title={isAssignedToOther ? `Apenas ${ticket.assignedTo} pode reabrir este chamado` : ""}
                    className="flex-1 h-10 inline-flex items-center justify-center gap-2 rounded-lg border border-default bg-surface hover:bg-surface-2 text-primary text-sm font-semibold transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    Reabrir chamado
                  </button>
                )}

                {assignedTechs.includes(currentSession.name) &&
                  (p.confirmingDeleteId === ticket.id ? (
                    <button type="button" onClick={() => p.onDelete(ticket.id)} className="px-3 h-10 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold transition-colors duration-150 cursor-pointer">
                      Confirmar?
                    </button>
                  ) : (
                    <button type="button" onClick={() => p.setConfirmingDeleteId(ticket.id)} className="w-10 h-10 shrink-0 inline-flex items-center justify-center rounded-lg border border-default bg-surface hover:bg-rose-500/10 hover:border-rose-500/30 text-rose-600 dark:text-rose-400 transition-colors duration-150 cursor-pointer" title="Excluir chamado" aria-label="Excluir chamado">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ))}
              </div>
            </div>
          )}
        </motion.section>

        {/* Coluna central — chat */}
        <motion.section {...anim(REVEAL.panel.center)} className={`${centerVis} ${card} flex-col md:min-h-0 overflow-hidden`} aria-label="Chat do chamado">
          <div className="px-4 py-3 border-b border-default flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <MessageSquare className="h-[18px] w-[18px] text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden />
              <h3 className="text-sm font-semibold text-primary truncate">Chat do Chamado &amp; Discussão</h3>
              <span className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 tabular-nums">{messages.length} msg</span>
            </div>
            <button
              type="button"
              onClick={p.onToggleNotifications}
              className={`shrink-0 h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg border text-xs font-medium transition-colors duration-150 cursor-pointer ${
                notifOn ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/15" : "bg-surface text-secondary border-default hover:text-primary hover:bg-surface-2"
              }`}
              title="Alertas pop-up do sistema operacional"
            >
              {notifOn ? <BellRing className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{notifOn ? "Alertas ativos" : "Ativar pop-up"}</span>
            </button>
          </div>

          <div ref={feedRef} className="flex-1 min-h-[50vh] max-h-[70vh] md:min-h-0 md:max-h-none overflow-y-auto px-4 py-4 space-y-3 bg-surface-2/30" role="log" aria-live="polite" aria-label="Mensagens do chamado">
            {messages.length === 0 && (
              <div className="h-full min-h-40 flex flex-col items-center justify-center text-center text-secondary">
                <MessageSquare className="h-8 w-8 text-muted mb-2" aria-hidden />
                <p className="text-sm font-medium text-primary">Nenhuma mensagem ainda</p>
                <p className="text-xs mt-0.5">Use o campo abaixo para iniciar a conversa deste chamado.</p>
              </div>
            )}
            {messages.map((c, i) => {
              const showDay = i === 0 || dayKey(messages[i - 1].timestamp) !== dayKey(c.timestamp);
              const mine = c.authorName === currentSession.name;
              return (
                <React.Fragment key={c.id}>
                  {showDay && (
                    <div className="flex items-center gap-3 py-1" aria-hidden>
                      <span className="h-px flex-1 bg-default" />
                      <span className="text-[11px] font-medium text-muted">{dayLabel(c.timestamp)}</span>
                      <span className="h-px flex-1 bg-default" />
                    </div>
                  )}
                  {(
                    <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                      <div className={`max-w-[88%] rounded-2xl border px-3.5 py-2.5 text-[13px] leading-relaxed ${
                        mine ? "bg-emerald-500/10 border-emerald-500/25 rounded-br-md" : "bg-surface border-default rounded-bl-md"
                      }`}>
                        <div className="flex items-baseline justify-between gap-4 mb-0.5">
                          <span className="text-xs font-semibold text-primary">
                            {c.authorName}
                            <span className="ml-1.5 font-normal text-muted">{c.authorRole === "tecnico" ? "Suporte" : "Solicitante"}</span>
                          </span>
                          <time dateTime={c.timestamp} className="text-[11px] text-muted tabular-nums">{fmtTime(c.timestamp)}</time>
                        </div>
                        <p className="whitespace-pre-line break-words text-primary">{c.content}</p>
                        {c.attachmentUrl && (
                          <div className="mt-2 p-2 rounded-lg border border-default bg-surface flex items-center gap-2">
                            {c.attachmentUrl.startsWith("data:image/") ? (
                              <button type="button" onClick={() => p.onPreviewImage(c.attachmentUrl || null)} className="h-12 w-12 rounded-md overflow-hidden border border-default shrink-0 cursor-zoom-in" title="Ver em tela cheia">
                                <img src={c.attachmentUrl} alt="Anexo" className="h-full w-full object-cover" />
                              </button>
                            ) : (
                              <div className="h-10 w-10 rounded-md bg-surface-2 border border-default flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0"><FileText className="h-5 w-5" /></div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-primary truncate">{c.attachmentName || "Anexo"}</p>
                              <a href={c.attachmentUrl} download={c.attachmentName || "anexo.png"} className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline">Baixar</a>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Barra de digitação — sempre visível */}
          <div className="px-3 sm:px-4 py-3 border-t border-default bg-surface">
            {p.commentAttachment && (
              <div className="mb-2 px-3 py-1.5 rounded-lg border border-default bg-surface-2 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  {p.commentAttachment.startsWith("data:image/") ? (
                    <img src={p.commentAttachment} alt="Pré-visualização" className="h-7 w-7 rounded object-cover border border-default" />
                  ) : (
                    <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  )}
                  <span className="font-medium text-secondary truncate">{p.commentAttachmentName}</span>
                </div>
                <button type="button" onClick={p.onClearAttachment} className="p-1 rounded text-secondary hover:text-primary cursor-pointer" aria-label="Remover anexo"><X className="h-3.5 w-3.5" /></button>
              </div>
            )}
            <form onSubmit={p.onSubmitComment} className="flex items-center gap-2">
              <input
                type="file"
                id="comment-file-input-workspace"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) p.onAttachFile(file);
                  e.target.value = "";
                }}
              />
              <label htmlFor="comment-file-input-workspace" className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-lg border border-default bg-surface hover:bg-surface-2 text-secondary hover:text-primary transition-colors duration-150 cursor-pointer" title="Anexar imagem ou documento">
                <Paperclip className="h-4 w-4" />
                <span className="sr-only">Anexar arquivo</span>
              </label>
              <input
                type="text"
                value={p.commentText}
                onChange={(e) => p.setCommentText(e.target.value)}
                onPaste={(e) => {
                  const item = e.clipboardData?.items?.[0];
                  if (item && item.type.startsWith("image/")) {
                    const file = item.getAsFile();
                    if (file) p.onAttachFile(file, "imagem_colada.png");
                  }
                }}
                placeholder={p.commentAttachment ? "Comentário opcional…" : "Digite uma mensagem ou cole um print…"}
                aria-label="Mensagem"
                className="flex-1 min-w-0 h-10 rounded-lg border border-default bg-surface px-3 text-sm text-primary placeholder:text-muted hover:border-secondary/40 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 transition-colors duration-150"
              />
              <button
                type="submit"
                disabled={!p.commentText.trim() && !p.commentAttachment}
                className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Enviar mensagem"
                title="Enviar"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </motion.section>

        {/* Coluna direita — atividade */}
        <motion.aside {...anim(REVEAL.panel.right)} className={`${rightVis} ${card} flex-col md:min-h-0 overflow-hidden`} aria-label="Atividade do chamado">
          <div className="px-4 py-3 border-b border-default flex items-center gap-2">
            <ActivityIcon className="h-[18px] w-[18px] text-emerald-600 dark:text-emerald-400" aria-hidden />
            <h3 className="text-sm font-semibold text-primary">Atividade do Chamado</h3>
          </div>
          <div className="flex-1 md:min-h-0 overflow-y-auto p-4">
            <TicketTimeline ticket={ticket} />
          </div>
        </motion.aside>
      </div>
      {reopenOpen && (
        <ReopenDialog
          ticketId={ticket.id}
          onCancel={() => setReopenOpen(false)}
          onConfirm={(category: ReopenCategory, reason: string) => {
            setReopenOpen(false);
            // Mantém o técnico responsável: volta a "Em Atendimento" se já havia atribuição.
            p.onUpdateMeta(ticket.id, { status: ticket.assignedTo ? "Em Atendimento" : "Aberto", reopenCategory: category, reopenReason: reason } as Partial<Ticket>);
          }}
        />
      )}
    </div>
  );
}
