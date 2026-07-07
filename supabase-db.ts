import { createClient, SupabaseClient } from "@supabase/supabase-js";
import fs from "fs";
import crypto from "crypto";
import path from "path";

// Dynamically load initial users configuration for password override at runtime to avoid build errors on Vercel
let initialUsers: any[] = [];
try {
  const usersPath = path.join(process.cwd(), "users-db.json");
  if (fs.existsSync(usersPath)) {
    initialUsers = JSON.parse(fs.readFileSync(usersPath, "utf-8"));
  }
} catch (err) {
  console.warn("Failed to load initial users in supabase-db:", err);
}

// Load initial users configuration for password override from bundled JSON
const initialPasswordHashes = new Map<string, string>();
try {
  if (Array.isArray(initialUsers)) {
    initialUsers.forEach((u: any) => {
      if (u.email && u.password) {
        initialPasswordHashes.set(u.email.toLowerCase().trim(), u.password);
      }
    });
  }
} catch (err) {
  console.error("Failed to load initial password hashes in supabase-db:", err);
}

// Helper to hash passwords
function hashPassword(password: string): string {
  if (!password) return "";
  if (/^[a-f0-9]{64}$/i.test(password)) {
    return password;
  }
  return crypto.createHash("sha256").update(password).digest("hex");
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

// Helper to read config from process.env on the backend
export function getBackendConfig() {
  let url = cleanConfigValue(process.env.SUPABASE_URL || "");
  let key = cleanConfigValue(process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "");
  let gemini = cleanConfigValue(process.env.GEMINI_API_KEY || "");

  // Post-processing validation to ensure we don't return invalid or placeholder values
  if (url && (!url.startsWith("http://") && !url.startsWith("https://") || url.includes("SUA_URL_SUPABASE_AQUI") || url.includes("your-selfhosted-"))) {
    console.warn("getBackendConfig: URL do Supabase inválida ou placeholder detectada e ignorada:", url);
    url = "";
  }
  if (key && (key.includes("SUA_CHAVE_") || key.includes("your-anon-key"))) {
    key = "";
  }
  if (gemini && gemini.includes("SUA_CHAVE_")) {
    gemini = "";
  }

  return { url, key, gemini };
}

// Initialize Supabase lazily
let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseInstance) return supabaseInstance;

  const { url, key } = getBackendConfig();

  if (!url || !key) {
    return null;
  }

  try {
    supabaseInstance = createClient(url, key, {
      auth: {
        persistSession: false
      }
    });
    return supabaseInstance;
  } catch (error) {
    console.error("Erro ao inicializar cliente do Supabase:", error);
    return null;
  }
}

export function isSupabaseConfigured(): boolean {
  const { url, key } = getBackendConfig();
  return !!(url && key);
}

export async function testSupabaseConnection(): Promise<{ connected: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { connected: false, error: "Credenciais do Supabase ausentes (.env ou Secrets do AI Studio)" };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { connected: false, error: "Falha ao instanciar o cliente do Supabase" };
  }

  try {
    // Try querying the users table to verify access and table schema
    const { error } = await client.from("users").select("id").limit(1);
    if (error) {
      if (error.code === "PGRST116" || error.message?.includes("does not exist")) {
        return { 
          connected: true, 
          error: "Tabelas ausentes no Supabase. Execute o script SQL no editor de SQL do Supabase." 
        };
      }
      return { connected: false, error: error.message };
    }
    return { connected: true };
  } catch (err: any) {
    return { connected: false, error: err.message || "Erro desconhecido ao testar conexão" };
  }
}

// Interfaces identical to server.ts
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

// SQL Script description for user instructions
export const SUPABASE_SQL_SCHEMA = `-- EXECUTAR ESTE SCRIPT NO EDITOR DE SQL DO SEU SUPABASE:

-- 1. Criar tabela de Usuários (Users)
CREATE TABLE IF NOT EXISTS public.users (
    id text PRIMARY KEY,
    name text NOT NULL,
    email text UNIQUE NOT NULL,
    password text NOT NULL,
    department text NOT NULL,
    role text NOT NULL,
    must_change_password boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Criar tabela de Chamados (Tickets)
CREATE TABLE IF NOT EXISTS public.tickets (
    id text PRIMARY KEY,
    title text NOT NULL,
    description text NOT NULL,
    category text NOT NULL,
    priority text NOT NULL,
    status text NOT NULL,
    requester_name text NOT NULL,
    requester_department text NOT NULL,
    assigned_to text,
    created_at text NOT NULL,
    updated_at text NOT NULL,
    sla_limit text NOT NULL,
    ai_category text NOT NULL,
    ai_priority text NOT NULL,
    ai_reasoning text NOT NULL,
    ai_suggestions text NOT NULL,
    comments jsonb DEFAULT '[]'::jsonb NOT NULL,
    project_deadline text,
    inserted_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Inserir Usuários Iniciais Padrão (Deixado em branco para cadastramento manual)
-- Adicione novos colaboradores pela interface de Cadastro do sistema!
`;

// Map database entities to and from Supabase snake_case format
function mapUserFromSupabase(dbUser: any): User {
  const emailLower = (dbUser.email || "").toLowerCase().trim();
  let mustChange = dbUser.must_change_password !== undefined ? dbUser.must_change_password !== false : undefined;

  // Robust override: If the password hash in Supabase is different from the initial seed password, they don't need to reset
  if (dbUser.password && initialPasswordHashes.has(emailLower)) {
    const defaultHash = initialPasswordHashes.get(emailLower);
    if (dbUser.password !== defaultHash) {
      mustChange = false;
    }
  }

  return {
    id: dbUser.id,
    name: dbUser.name,
    email: dbUser.email,
    password: dbUser.password,
    department: dbUser.department,
    role: dbUser.role as "colaborador" | "tecnico",
    mustChangePassword: mustChange
  };
}

function mapTicketFromSupabase(dbTicket: any): Ticket {
  let comments: any[] = [];
  let screenshot: string | undefined = undefined;
  let projectDeadline: string | undefined = dbTicket.project_deadline || undefined;

  if (dbTicket.comments) {
    let parsedComments: any[] = [];
    if (typeof dbTicket.comments === "string") {
      try {
        parsedComments = JSON.parse(dbTicket.comments);
      } catch (e) {
        console.warn("Falha ao analisar JSON de comentários do chamado:", e);
        parsedComments = [];
      }
    } else if (Array.isArray(dbTicket.comments)) {
      parsedComments = dbTicket.comments;
    }

    // Find and extract screenshot meta comment if exists
    const screenshotMeta = parsedComments.find((c: any) => c.id === "screenshot-meta");
    if (screenshotMeta) {
      screenshot = screenshotMeta.content;
    }

    // Find and extract project deadline meta comment if exists
    const deadlineMeta = parsedComments.find((c: any) => c.id === "project-deadline-meta");
    if (deadlineMeta) {
      projectDeadline = deadlineMeta.content;
    }

    // Exclude metadata comments from normal comment listings
    comments = parsedComments.filter((c: any) => c.id !== "screenshot-meta" && c.id !== "project-deadline-meta");
  }

  return {
    id: dbTicket.id || "",
    title: dbTicket.title || "",
    description: dbTicket.description || "",
    category: dbTicket.category || "Outros",
    priority: dbTicket.priority || "Média",
    status: dbTicket.status || "Aberto",
    requesterName: dbTicket.requester_name || "",
    requesterDepartment: dbTicket.requester_department || "",
    assignedTo: dbTicket.assigned_to || null,
    createdAt: dbTicket.created_at || new Date().toISOString(),
    updatedAt: dbTicket.updated_at || new Date().toISOString(),
    slaLimit: dbTicket.sla_limit || new Date().toISOString(),
    aiCategory: dbTicket.ai_category || "",
    aiPriority: dbTicket.ai_priority || "",
    aiReasoning: dbTicket.ai_reasoning || "",
    aiSuggestions: dbTicket.ai_suggestions || "",
    comments,
    screenshot,
    projectDeadline
  };
}

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

  return {
    id: ticket.id,
    title: ticket.title,
    description: ticket.description,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    requester_name: ticket.requesterName,
    requester_department: ticket.requesterDepartment,
    assigned_to: ticket.assignedTo,
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

// User Operations
export async function getSupabaseUsers(): Promise<User[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from("users")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      console.warn("Aviso ao buscar usuários no Supabase (verifique se a tabela foi criada):", error.message);
      return null;
    }
    return (data || []).map(mapUserFromSupabase);
  } catch (err) {
    console.error("Erro ao ler usuários do Supabase:", err);
    return null;
  }
}

export async function saveSupabaseUser(user: User): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  const rawPassword = user.password || "123";
  const hashedPassword = hashPassword(rawPassword);

  try {
    const payload: any = {
      id: user.id,
      name: user.name,
      email: user.email.toLowerCase().trim(),
      password: hashedPassword,
      department: user.department,
      role: user.role,
      must_change_password: user.mustChangePassword !== false
    };

    let { error } = await client
      .from("users")
      .upsert(payload, { onConflict: "email" });

    if (error && (error.code === "PGRST204" || error.message?.includes("must_change_password") || error.message?.includes("column"))) {
      console.warn("[Supabase Sync] Coluna 'must_change_password' não encontrada na tabela 'users'. Tentando salvar sem esta coluna.");
      delete payload.must_change_password;
      const retryResult = await client
        .from("users")
        .upsert(payload, { onConflict: "email" });
      error = retryResult.error;
    }

    if (error) {
      console.error("Erro ao salvar usuário no Supabase:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Exceção ao salvar usuário no Supabase:", err);
    return false;
  }
}

export async function deleteSupabaseUser(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await client
      .from("users")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Erro ao deletar usuário no Supabase:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Exceção ao deletar usuário no Supabase:", err);
    return false;
  }
}

// Ticket Operations
export async function getSupabaseTickets(): Promise<Ticket[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from("tickets")
      .select("*");

    if (error) {
      console.warn("Aviso ao buscar chamados no Supabase (verifique se a tabela foi criada):", error.message);
      return null;
    }
    return (data || []).map(mapTicketFromSupabase);
  } catch (err) {
    console.error("Erro ao ler chamados do Supabase:", err);
    return null;
  }
}

export async function saveSupabaseTicket(ticket: Ticket): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const dbData = mapTicketToSupabase(ticket);
    let { error } = await client
      .from("tickets")
      .upsert(dbData);

    if (error && (error.message?.includes("project_deadline") || error.message?.includes("column"))) {
      console.warn("[Supabase Sync] Coluna 'project_deadline' não encontrada na tabela 'tickets'. Tentando salvar sem esta coluna.");
      const fallbackDbData = { ...dbData };
      delete (fallbackDbData as any).project_deadline;
      const retryResult = await client
        .from("tickets")
        .upsert(fallbackDbData);
      error = retryResult.error;
    }

    if (error) {
      console.error("Erro ao salvar chamado no Supabase:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Exceção ao salvar chamado no Supabase:", err);
    return false;
  }
}

export async function deleteSupabaseTicket(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await client
      .from("tickets")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Erro ao deletar chamado no Supabase:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Exceção ao deletar chamado no Supabase:", err);
    return false;
  }
}

// Bulk Sync Seeder
export async function seedSupabaseData(users: User[], tickets: Ticket[]): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    // Upsert users
    for (const u of users) {
      await saveSupabaseUser(u);
    }
    // Upsert tickets
    for (const t of tickets) {
      await saveSupabaseTicket(t);
    }
    return true;
  } catch (err) {
    console.error("Erro na carga inicial do Supabase:", err);
    return false;
  }
}
