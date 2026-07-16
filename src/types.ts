export interface Comment {
  id: string;
  authorName: string;
  authorRole: "colaborador" | "tecnico" | "system" | "ai";
  content: string;
  timestamp: string;
  attachmentUrl?: string;
  attachmentName?: string;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  category: "Hardware" | "Software" | "Redes" | "Acesso" | "Sistemas" | "Outros";
  priority: "Baixa" | "Média" | "Alta" | "Urgente";
  status: "Aberto" | "Em Atendimento" | "Resolvido" | "Fechado";
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
  mustChangePassword?: boolean;
}

export interface UserSession {
  name: string;
  department: string;
  role: UserRole;
  email?: string;
  mustChangePassword?: boolean;
}
