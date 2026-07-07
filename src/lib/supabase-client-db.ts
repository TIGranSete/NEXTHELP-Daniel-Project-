import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Types
export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  department: string;
  role: "colaborador" | "tecnico";
  mustChangePassword?: boolean;
}

export interface Comment {
  id: string;
  authorName: string;
  authorRole: "colaborador" | "tecnico" | "system" | "ai";
  content: string;
  timestamp: string;
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
}

export interface UserSession {
  name: string;
  department: string;
  role: "colaborador" | "tecnico";
  email: string;
  mustChangePassword?: boolean;
}

// Keep signature to avoid compile errors, but return empty values since credentials are secure in backend env
export function getDynamicConfig() {
  return {
    supabaseUrl: "",
    supabaseKey: "",
    geminiKey: ""
  };
}

export function getSupabaseClient(): SupabaseClient | null {
  return null;
}

export function isSupabaseConfigured(): boolean {
  return true;
}

// Browser-safe hashing fallback if needed, but the server handles hashing securely now
export async function hashPassword(password: string): Promise<string> {
  if (!password) return "";
  if (/^[a-f0-9]{64}$/i.test(password)) {
    return password;
  }
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    console.error("Falha ao hashear senha no cliente:", err);
    return password;
  }
}

// REST API Database Actions (Completely secured via backend endpoints)

export async function getTickets(): Promise<Ticket[]> {
  try {
    const response = await fetch("/api/tickets");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Erro ao obter chamados do servidor:", error);
    return [];
  }
}

export async function saveTicket(ticket: Ticket): Promise<boolean> {
  try {
    const response = await fetch("/api/tickets/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(ticket),
    });
    return response.ok;
  } catch (error) {
    console.error("Erro ao salvar chamado no servidor:", error);
    return false;
  }
}

export async function deleteTicket(id: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/tickets/${id}`, {
      method: "DELETE",
    });
    return response.ok;
  } catch (error) {
    console.error("Erro ao excluir chamado no servidor:", error);
    return false;
  }
}

export async function getUsers(): Promise<User[]> {
  try {
    const response = await fetch("/api/users");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Erro ao obter colaboradores do servidor:", error);
    return [];
  }
}

export async function saveUser(user: User): Promise<boolean> {
  try {
    const response = await fetch("/api/users/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(user),
    });
    return response.ok;
  } catch (error) {
    console.error("Erro ao salvar colaborador no servidor:", error);
    return false;
  }
}

export async function deleteUser(id: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/users/${id}`, {
      method: "DELETE",
    });
    return response.ok;
  } catch (error) {
    console.error("Erro ao excluir colaborador no servidor:", error);
    return false;
  }
}

// Secure authentication via Node.js server session endpoint
export async function authenticateUser(email: string, pass: string): Promise<UserSession> {
  const response = await fetch("/api/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password: pass }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "E-mail corporativo ou senha incorreta.");
  }

  return await response.json();
}

// Secure password reset via server-side API
export async function changeUserPassword(email: string, newPass: string): Promise<boolean> {
  try {
    const response = await fetch("/api/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, newPassword: newPass }),
    });
    return response.ok;
  } catch (error) {
    console.error("Erro ao alterar senha do colaborador no servidor:", error);
    return false;
  }
}

// Secure AI Triage utilizing server-side Gemini API (No client-side key exposure!)
export async function triageWithGemini(
  title: string,
  description: string,
  screenshot?: string
): Promise<{
  category: Ticket["category"];
  priority: Ticket["priority"];
  reasoning: string;
  suggestions: string;
}> {
  try {
    const response = await fetch("/api/triage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title, description, screenshot }),
    });

    if (!response.ok) {
      throw new Error("Falha ao comunicar com o servidor de triagem inteligente.");
    }

    return await response.json();
  } catch (error) {
    console.warn("Falha ao realizar triagem IA via servidor, usando triagem local:", error);
    return defaultLocalTriage(title, description);
  }
}

// Client-side offline-fallback manual triage
function defaultLocalTriage(title: string, description: string) {
  const text = `${title} ${description}`.toLowerCase();
  let category: Ticket["category"] = "Outros";
  let priority: Ticket["priority"] = "Média";
  let reasoning = "Triagem automática local realizada com base em detecção de termos operacionais.";
  let suggestions = "1. Solicitar maiores detalhes do usuário se necessário.\n2. Testar acesso remoto ao dispositivo afetado.\n3. Reiniciar máquina ou equipamento de rede primário.";

  if (text.includes("senha") || text.includes("login") || text.includes("acesso") || text.includes("entrar") || text.includes("bloqueado") || text.includes("bloqueada") || text.includes("permissão")) {
    category = "Acesso";
    priority = "Alta";
    suggestions = "1. Verificar o cadastro do usuário no Active Directory.\n2. Confirmar se a senha expirou ou precisa de redefinição no painel AD.\n3. Checar permissões no grupo de rede correspondente.";
  } else if (text.includes("internet") || text.includes("wi-fi") || text.includes("wifi") || text.includes("rede") || text.includes("cabo") || text.includes("conexão") || text.includes("lento") || text.includes("lenta")) {
    category = "Redes";
    priority = "Alta";
    suggestions = "1. Verificar se o cabo Ethernet está devidamente conectado.\n2. Testar conectividade via comando ping (ex: ping 8.8.8.8).\n3. Validar se o computador obteve o IP via DHCP automaticamente.";
  } else if (text.includes("computador") || text.includes("pc") || text.includes("monitor") || text.includes("impressora") || text.includes("hardware") || text.includes("teclado") || text.includes("mouse") || text.includes("ligando") || text.includes("notebook")) {
    category = "Hardware";
    priority = "Média";
    suggestions = "1. Verificar cabos de força e fonte de alimentação do equipamento.\n2. Se for impressora, checar se há obstruções físicas de papel ou toner vazio.\n3. Tentar conectar o dispositivo em outra porta USB ou testar em outro computador.";
  } else if (text.includes("outlook") || text.includes("email") || text.includes("e-mail") || text.includes("excel") || text.includes("word") || text.includes("photoshop") || text.includes("adobe") || text.includes("licença")) {
    category = "Software";
    priority = "Baixa";
    suggestions = "1. Verificar se o programa possui atualizações pendentes.\n2. Se for licença, verificar pool corporativo.\n3. Limpar arquivos temporários do sistema ou desinstalar e reinstalar o programa.";
  } else if (text.includes("protheus") || text.includes("erp") || text.includes("sap") || text.includes("sistema") || text.includes("banco de dados") || text.includes("faturamento") || text.includes("site")) {
    category = "Sistemas";
    priority = "Alta";
    suggestions = "1. Verificar se o servidor do ERP está online e operando normalmente.\n2. Limpar o cache de arquivos temporários do ERP local no computador do usuário.\n3. Checar logs de conexão do banco de dados.";
  }

  if (text.includes("urgente") || text.includes("crítico") || text.includes("faturamento parado") || text.includes("não consigo trabalhar") || text.includes("parou tudo")) {
    priority = "Urgente";
  }

  return { category, priority, reasoning, suggestions };
}
