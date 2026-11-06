import { createClient, SupabaseClient } from "@supabase/supabase-js";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { hashPassword } from "./password-utils";

// Load local environment files if not already loaded
const envFiles = [".env.local", ".env.development", ".env"];
envFiles.forEach((file) => {
  const filePath = path.join(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override: true });
  }
});
dotenv.config();

// Load configuration for Supabase Database from environment variables
export function getBackendConfig() {
  const url = cleanConfigValue(
    process.env.SUPABASE_URL || 
    process.env.VITE_SUPABASE_URL || 
    process.env.NEXT_PUBLIC_SUPABASE_URL || 
    ""
  );
  const key = cleanConfigValue(
    process.env.SUPABASE_KEY || 
    process.env.SUPABASE_SERVICE_ROLE_KEY || 
    process.env.SUPABASE_ANON_KEY || 
    process.env.VITE_SUPABASE_ANON_KEY || 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
    ""
  );
  const gemini = cleanConfigValue(process.env.GEMINI_API_KEY || "");

  return { url, key, gemini };
}

// Helper to clean surrounding quotes and whitespace
function cleanConfigValue(val: string): string {
  if (!val) return "";
  let cleaned = val.trim();
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  if (cleaned.startsWith("'") && cleaned.endsWith("'")) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
}

// Lazy Supabase Client Initialization
let clientInstance: SupabaseClient | null = null;
let lastUsedUrl = "";
let lastUsedKey = "";

export function getSupabaseClient(): SupabaseClient | null {
  const { url, key } = getBackendConfig();

  if (!url || !key) {
    clientInstance = null;
    lastUsedUrl = "";
    lastUsedKey = "";
    return null;
  }

  // If credentials changed, recreate client
  if (clientInstance && (url !== lastUsedUrl || key !== lastUsedKey)) {
    console.log("Detectadas novas credenciais do Supabase. Reiniciando cliente...");
    clientInstance = null;
    lastConnectionFailureTime = 0; // reset cooldown
  }

  if (clientInstance) return clientInstance;

  try {
    clientInstance = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    lastUsedUrl = url;
    lastUsedKey = key;
    return clientInstance;
  } catch (error) {
    console.error("Erro ao inicializar cliente do Supabase:", error);
    return null;
  }
}

export function isSupabaseConfigured(): boolean {
  const { url, key } = getBackendConfig();
  return !!(url && key);
}

let lastConnectionFailureTime = 0;
const FAILURE_COOLDOWN_MS = 60000; // 1 minute cooldown

// Helper to enforce timeouts on Supabase queries to avoid hanging requests (e.g., waking up a paused database)
async function withTimeout<T = any>(promise: any, timeoutMs: number = 4000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("TIMEOUT"));
    }, timeoutMs);

    Promise.resolve(promise)
      .then((res) => {
        clearTimeout(timer);
        resolve(res as T);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export function markSupabaseUnhealthy() {
  lastConnectionFailureTime = Date.now();
}

export function isSupabaseHealthy(): boolean {
  if (!isSupabaseConfigured()) return false;
  if (Date.now() - lastConnectionFailureTime < FAILURE_COOLDOWN_MS) {
    return false;
  }
  return true;
}

// Test Connection with Supabase
export async function testSupabaseConnection(): Promise<{ connected: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { connected: false, error: "Credenciais do Supabase ausentes (.env ou Secrets)" };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { connected: false, error: "Falha ao instanciar o cliente do Supabase" };
  }

  try {
    // Attempt a simple ping select or from table with timeout
    const { data, error } = await withTimeout(client.from("users").select("id").limit(1), 3000);
    if (error) {
      // If error is just table missing, we are still connected to Supabase itself!
      if (error.code === "PGRST116" || error.code === "42P01") {
        lastConnectionFailureTime = 0; // reset cooldown on successful communication
        return { connected: true, error: "Conectado, mas as tabelas ainda não foram criadas. Execute o script SQL no Supabase." };
      }
      throw error;
    }

    lastConnectionFailureTime = 0; // reset cooldown on success
    return { connected: true };
  } catch (err: any) {
    markSupabaseUnhealthy();
    return { connected: false, error: err.message || "Erro de rede ao conectar ao Supabase" };
  }
}

// Interfaces identical to types
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

export interface Attachment {
  name: string;
  url: string;
  type: string;
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
  slaEvents?: any[];
}

export const SUPABASE_SQL_SCHEMA = `-- EXECUTAR ESTE SCRIPT NO SQL EDITOR DO SEU SUPABASE:

-- 1. Criar tabela de Usuários (users)
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    department TEXT NOT NULL,
    role TEXT NOT NULL,
    must_change_password BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- IMPORTANTE: o navegador acessa o Supabase com a chave "anon" (pública),
-- então ele NUNCA pode ler ou escrever a coluna "password". Toda autenticação
-- e escrita de usuários deve passar pelo servidor Express, que usa a chave de
-- serviço (SUPABASE_KEY nas variáveis de ambiente do servidor) e ignora
-- RLS/GRANTs. O papel anon só pode ler colunas não sensíveis e não escreve
-- diretamente na tabela.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo para todos" ON public.users;
DROP POLICY IF EXISTS "Leitura publica de colunas seguras" ON public.users;
CREATE POLICY "Leitura publica de colunas seguras" ON public.users FOR SELECT USING (true);

REVOKE ALL ON public.users FROM anon;
GRANT SELECT (id, name, email, department, role, must_change_password) ON public.users TO anon;

-- 2. Criar tabela de Chamados (tickets)
CREATE TABLE IF NOT EXISTS public.tickets (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    priority TEXT NOT NULL,
    status TEXT NOT NULL,
    requester_name TEXT NOT NULL,
    requester_department TEXT NOT NULL,
    assigned_to TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sla_limit TEXT NOT NULL,
    ai_category TEXT NOT NULL,
    ai_priority TEXT NOT NULL,
    ai_reasoning TEXT NOT NULL,
    ai_suggestions TEXT NOT NULL,
    comments JSONB NOT NULL,
    project_deadline TEXT,
    inserted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Tickets nao contem credenciais, e o app nao usa Supabase Auth para
-- distinguir usuarios por linha (todo colaborador autenticado no app
-- compartilha a mesma chave anon do navegador), entao nao ha como uma
-- policy de RLS restringir "ver so os meus chamados" sem migrar para
-- Supabase Auth. Mantido aberto para o papel anon de forma deliberada.
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir tudo para todos" ON public.tickets;
CREATE POLICY "Permitir tudo para todos" ON public.tickets FOR ALL USING (true) WITH CHECK (true);
`;

// Map User Row from Supabase to Application
function mapUserFromSupabase(row: any): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    password: row.password,
    department: row.department,
    role: row.role === "tecnico" ? "tecnico" : "colaborador",
    mustChangePassword: row.must_change_password !== false
  };
}

// Map Ticket Row from Supabase to Application
function mapTicketFromSupabase(row: any): Ticket {
  let comments: Comment[] = [];
  let screenshot: string | undefined = undefined;
  let projectDeadline: string | undefined = row.project_deadline || undefined;
  let attachments: any[] = [];
  let slaEvents: any[] | undefined = undefined;

  if (row.comments) {
    let parsedComments: any[] = [];
    if (typeof row.comments === "string") {
      try {
        parsedComments = JSON.parse(row.comments);
      } catch (e) {
        console.warn("Falha ao analisar JSON de comentários no Supabase:", e);
        parsedComments = [];
      }
    } else if (Array.isArray(row.comments)) {
      parsedComments = row.comments;
    } else if (typeof row.comments === "object" && row.comments !== null) {
      parsedComments = row.comments as any[];
    }

    // Screenshot meta extraction
    const screenshotMeta = parsedComments.find((c: any) => c.id === "screenshot-meta");
    if (screenshotMeta) {
      screenshot = screenshotMeta.content;
    }

    // Project deadline meta extraction
    const deadlineMeta = parsedComments.find((c: any) => c.id === "project-deadline-meta");
    if (deadlineMeta) {
      projectDeadline = deadlineMeta.content;
    }

    // Attachments meta extraction
    const attachmentsMeta = parsedComments.find((c: any) => c.id === "attachments-meta");
    if (attachmentsMeta) {
      try {
        attachments = JSON.parse(attachmentsMeta.content);
      } catch (e) {
        console.warn("Falha ao analisar JSON de anexos no Supabase:", e);
      }
    }

    // Trilha de auditoria do SLA (guardada como meta-comentário: sem alterar o schema)
    const slaMeta = parsedComments.find((c: any) => c.id === "sla-events-meta");
    if (slaMeta) {
      try {
        const parsed = JSON.parse(slaMeta.content);
        if (Array.isArray(parsed)) slaEvents = parsed;
      } catch (e) {
        console.warn("Falha ao analisar eventos de SLA no Supabase:", e);
      }
    }

    comments = parsedComments.filter(
      (c: any) =>
        c.id !== "screenshot-meta" &&
        c.id !== "project-deadline-meta" &&
        c.id !== "attachments-meta" &&
        c.id !== "sla-events-meta"
    );
  }

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category || "Outros",
    priority: row.priority || "Média",
    status: row.status || "Aberto",
    requesterName: row.requester_name || "",
    requesterDepartment: row.requester_department || "",
    assignedTo: row.assigned_to || null,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
    slaLimit: row.sla_limit || new Date().toISOString(),
    aiCategory: row.ai_category || "",
    aiPriority: row.ai_priority || "",
    aiReasoning: row.ai_reasoning || "",
    aiSuggestions: row.ai_suggestions || "",
    comments,
    screenshot,
    projectDeadline,
    attachments,
    ...(slaEvents ? { slaEvents } : {})
  };
}

// Map Ticket to Supabase fields
function mapTicketToSupabase(ticket: Ticket) {
  const commentsToSave = [...(ticket.comments || [])];
  if (ticket.screenshot) {
    commentsToSave.push({
      id: "screenshot-meta",
      authorName: "Sistema",
      authorRole: "system",
      content: ticket.screenshot,
      timestamp: new Date().toISOString()
    });
  }
  if (ticket.projectDeadline) {
    commentsToSave.push({
      id: "project-deadline-meta",
      authorName: "Sistema",
      authorRole: "system",
      content: ticket.projectDeadline,
      timestamp: new Date().toISOString()
    });
  }
  if (ticket.attachments && ticket.attachments.length > 0) {
    commentsToSave.push({
      id: "attachments-meta",
      authorName: "Sistema",
      authorRole: "system",
      content: JSON.stringify(ticket.attachments),
      timestamp: new Date().toISOString()
    });
  }
  if (ticket.slaEvents && ticket.slaEvents.length > 0) {
    commentsToSave.push({
      id: "sla-events-meta",
      authorName: "Sistema",
      authorRole: "system",
      content: JSON.stringify(ticket.slaEvents),
      timestamp: new Date().toISOString()
    });
  }

  return {
    id: ticket.id,
    title: ticket.title,
    description: ticket.description,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    requester_name: ticket.requesterName,
    requester_department: ticket.requesterDepartment,
    assigned_to: ticket.assignedTo || null,
    created_at: ticket.createdAt,
    updated_at: ticket.updatedAt,
    sla_limit: ticket.slaLimit,
    ai_category: ticket.aiCategory,
    ai_priority: ticket.aiPriority,
    ai_reasoning: ticket.aiReasoning,
    ai_suggestions: ticket.aiSuggestions,
    comments: commentsToSave,
    project_deadline: ticket.projectDeadline || null
  };
}

// Supabase User Operations
export async function getSupabaseUsers(): Promise<User[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await withTimeout(
      client
        .from("users")
        .select("*")
        .order("name", { ascending: true }),
      4000
    );

    if (error) throw error;
    return (data || []).map(mapUserFromSupabase);
  } catch (err: any) {
    const isFetchError = err.message?.includes("fetch failed") || err.message?.includes("network") || err.message?.includes("connect") || err.message?.includes("TIMEOUT");
    if (isFetchError) {
      console.log("Supabase fora de alcance ou offline ao ler usuários.");
      markSupabaseUnhealthy();
    } else {
      console.error("Erro ao ler usuários do Supabase:", err);
    }
    return null;
  }
}

export async function getSupabaseUserByEmail(email: string): Promise<User | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const emailLower = email.toLowerCase().trim();
    const { data, error } = await withTimeout(
      client
        .from("users")
        .select("*")
        .eq("email", emailLower)
        .maybeSingle(),
      4000
    );

    if (error) throw error;
    if (!data) return null;
    return mapUserFromSupabase(data);
  } catch (err: any) {
    const isFetchError = err.message?.includes("fetch failed") || err.message?.includes("network") || err.message?.includes("connect") || err.message?.includes("TIMEOUT");
    if (isFetchError) {
      console.log(`Supabase fora de alcance ou offline ao ler usuário por e-mail: ${email}`);
      markSupabaseUnhealthy();
    } else {
      console.error(`Erro ao ler usuário por e-mail (${email}) do Supabase:`, err);
    }
    return null;
  }
}

export async function saveSupabaseUser(user: User): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const rawPassword = user.password || "";
    const hashedPassword = hashPassword(rawPassword);
    const mustChangeVal = user.mustChangePassword !== false;

    const { error } = await withTimeout(
      client.from("users").upsert({
        id: user.id,
        name: user.name,
        email: user.email.toLowerCase().trim(),
        password: hashedPassword,
        department: user.department,
        role: user.role,
        must_change_password: mustChangeVal
      }),
      5000
    );

    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Erro ao salvar usuário no Supabase:", err);
    return false;
  }
}

export async function deleteSupabaseUser(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await withTimeout(
      client.from("users").delete().eq("id", id),
      5000
    );
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Erro ao deletar usuário no Supabase:", err);
    return false;
  }
}

// Supabase Ticket Operations
export async function getSupabaseTickets(): Promise<Ticket[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await withTimeout(
      client
        .from("tickets")
        .select("*")
        .order("id", { ascending: false }),
      4000
    );

    if (error) throw error;
    return (data || []).map(mapTicketFromSupabase);
  } catch (err: any) {
    const isFetchError = err.message?.includes("fetch failed") || err.message?.includes("network") || err.message?.includes("connect") || err.message?.includes("TIMEOUT");
    if (isFetchError) {
      console.log("Supabase fora de alcance ou offline ao ler chamados.");
      markSupabaseUnhealthy();
    } else {
      console.error("Erro ao ler chamados do Supabase:", err);
    }
    return null;
  }
}

export async function saveSupabaseTicket(ticket: Ticket): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const payload = mapTicketToSupabase(ticket);
    const { error } = await withTimeout(
      client.from("tickets").upsert(payload),
      5000
    );
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Erro ao salvar chamado no Supabase:", err);
    return false;
  }
}

export async function deleteSupabaseTicket(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await withTimeout(
      client.from("tickets").delete().eq("id", id),
      5000
    );
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Erro ao deletar chamado no Supabase:", err);
    return false;
  }
}

// Bulk Sync Seeder
export async function seedSupabaseData(users: User[], tickets: Ticket[]): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    for (const u of users) {
      await saveSupabaseUser(u);
    }
    for (const t of tickets) {
      await saveSupabaseTicket(t);
    }
    return true;
  } catch (err) {
    console.error("Erro na carga inicial do Supabase:", err);
    return false;
  }
}
