export interface Comment {
  id: string;
  authorName: string;
  authorRole: "colaborador" | "tecnico" | "system" | "ai";
  content: string;
  timestamp: string;
  attachmentUrl?: string;
  attachmentName?: string;
}

/** Categorias de reabertura (política aprovada). A justificativa descritiva é sempre obrigatória. */
export type ReopenCategory = "ajuste_complementar" | "problema_nao_resolvido" | "problema_recorrente" | "outro";

/** Foto do SLA ORIGINAL no instante da primeira resolução. Nunca é recalculada. */
export interface SlaResolutionSnapshot {
  priority: string;
  targetMin: number;
  consumedMin: number;
  dueAt: string | null;
  result: "met" | "breached";
  firstResponse: { result: "met" | "breached" | "no_data"; consumedMin: number | null; targetMin: number };
  policyVersion: string;
  timeZone: string;
}

/**
 * Evento de auditoria do SLA. Somente acrescentado pelo servidor; nunca editado nem removido.
 *  pause / resume            espera pelo solicitante
 *  priority_initial          classificação inicial (triagem local ou IA) — NÃO é "alteração"
 *  priority_change           alteração posterior (auditada; congela violações já ocorridas)
 *  resolve / reopen          resolução (a primeira guarda o snapshot do SLA original) e reabertura
 */
export interface SlaEvent {
  id: string;
  /** Número sequencial por chamado (1, 2, 3…): permite detectar eventos perdidos. */
  seq?: number;
  type: "pause" | "resume" | "priority_change" | "priority_initial" | "resolve" | "reopen";
  /** Instante UTC (ISO) em que o evento foi registrado pelo servidor. */
  at: string;
  /** Usuário responsável (sessão autenticada) ou "Sistema …". */
  by: string;
  reason?: string;
  /** pause/resume/reopen: status anterior. */
  fromStatus?: string;
  toStatus?: string;
  /** resume: o que provocou a retomada. */
  trigger?: "requester_reply" | "manual_status_change" | "ticket_resolved";
  /** resume: comentário do solicitante que retomou a contagem. */
  commentId?: string;
  /** priority_change / priority_initial */
  fromPriority?: string;
  toPriority?: string;
  /** priority_change: violações já ocorridas no instante da mudança (não são apagadas). */
  breached?: { firstResponse: boolean; resolution: boolean };
  /** priority_initial: de onde veio a classificação, o que foi sugerido e quando. */
  source?: "triagem_local" | "ia";
  suggestedPriority?: string;
  suggestedAt?: string;
  /** resolve: `true` na primeira resolução do chamado (a que define o SLA original). */
  first?: boolean;
  snapshot?: SlaResolutionSnapshot;
  /** reopen */
  category?: ReopenCategory;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  category: "Hardware" | "Software" | "Redes" | "Acesso" | "Sistemas" | "Outros";
  priority: "Baixa" | "Média" | "Alta" | "Urgente";
  status: "Aberto" | "Pendente" | "Em Atendimento" | "Testando" | "Aguardando Solicitante" | "Resolvido" | "Fechado";
  requesterName: string;
  requesterDepartment: string;
  assignedTo: string | null;
  firstAssignedTo?: string | null;
  createdAt: string;
  updatedAt: string;
  slaLimit: string;
  aiCategory: string;
  aiPriority: string;
  aiReasoning: string;
  aiSuggestions: string;
  comments: Comment[];
  screenshot?: string;
  projectDeadline?: string;
  attachments?: Attachment[];
  /** Trilha de auditoria do SLA (pausas, retomadas, mudanças de prioridade). */
  slaEvents?: SlaEvent[];
}

export interface Attachment {
  name: string;
  url: string;
  type: string;
}

export type UserRole = "colaborador" | "tecnico";

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  department: string;
  role: UserRole;
  isOnline?: boolean;
  /** Foto de perfil (data URL). Só contas Técnico podem alterar. */
  photo?: string | null;
  mustChangePassword?: boolean;
}

export interface UserSession {
  name: string;
  department: string;
  role: UserRole;
  email?: string;
  mustChangePassword?: boolean;
  token?: string;
}
