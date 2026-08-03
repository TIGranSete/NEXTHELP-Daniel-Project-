import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Ticket, User, Comment } from "../types";

const LOCAL_STORAGE_URL_KEY = "gran7_supabase_url";
const LOCAL_STORAGE_ANON_KEY = "gran7_supabase_key";

export function getSupabaseCredentials() {
  const envUrl = (import.meta.env.VITE_SUPABASE_URL || "").trim();
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY || "").trim();

  const localUrl = (localStorage.getItem(LOCAL_STORAGE_URL_KEY) || "").trim();
  const localKey = (localStorage.getItem(LOCAL_STORAGE_ANON_KEY) || "").trim();

  const url = localUrl || envUrl;
  const key = localKey || envKey;

  return { url, key, isCustom: !!(localUrl && localKey) };
}

export function saveSupabaseCredentials(url: string, key: string) {
  if (url && key) {
    localStorage.setItem(LOCAL_STORAGE_URL_KEY, url.trim());
    localStorage.setItem(LOCAL_STORAGE_ANON_KEY, key.trim());
  } else {
    localStorage.removeItem(LOCAL_STORAGE_URL_KEY);
    localStorage.removeItem(LOCAL_STORAGE_ANON_KEY);
  }
}

let browserClient: SupabaseClient | null = null;
let lastUrl = "";
let lastKey = "";

export function getBrowserSupabaseClient(): SupabaseClient | null {
  const { url, key } = getSupabaseCredentials();

  if (!url || !key) {
    browserClient = null;
    return null;
  }

  if (browserClient && url === lastUrl && key === lastKey) {
    return browserClient;
  }

  try {
    browserClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    lastUrl = url;
    lastKey = key;
    return browserClient;
  } catch (err) {
    console.error("[Supabase Browser] Erro ao instanciar cliente:", err);
    browserClient = null;
    return null;
  }
}

export async function fetchTicketsFromSupabase(): Promise<Ticket[] | null> {
  const client = getBrowserSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from("tickets")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("[Supabase Browser] Erro na consulta de chamados:", error.message);
      return null;
    }

    return (data || []).map(mapTicketFromSupabase);
  } catch (err) {
    console.error("[Supabase Browser] Exceção ao consultar chamados:", err);
    return null;
  }
}

export async function saveTicketToSupabase(ticket: Ticket): Promise<boolean> {
  const client = getBrowserSupabaseClient();
  if (!client) return false;

  try {
    const payload = mapTicketToSupabase(ticket);
    const { error } = await client.from("tickets").upsert(payload);
    if (error) {
      console.warn("[Supabase Browser] Erro ao salvar chamado:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase Browser] Exceção ao salvar chamado:", err);
    return false;
  }
}

export async function deleteTicketFromSupabase(id: string): Promise<boolean> {
  const client = getBrowserSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await client.from("tickets").delete().eq("id", id);
    if (error) return false;
    return true;
  } catch (err) {
    console.error("[Supabase Browser] Erro ao excluir chamado:", err);
    return false;
  }
}

export async function fetchUsersFromSupabase(): Promise<User[] | null> {
  const client = getBrowserSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client.from("users").select("*");
    if (error) {
      console.warn("[Supabase Browser] Erro na consulta de usuários:", error.message);
      return null;
    }

    return (data || []).map(mapUserFromSupabase);
  } catch (err) {
    console.error("[Supabase Browser] Exceção ao consultar usuários:", err);
    return null;
  }
}

export async function saveUserToSupabase(user: User): Promise<boolean> {
  const client = getBrowserSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await client.from("users").upsert({
      id: user.id,
      name: user.name,
      email: user.email.toLowerCase().trim(),
      password: user.password || "",
      department: user.department,
      role: user.role,
      must_change_password: user.mustChangePassword !== false
    });
    if (error) {
      console.warn("[Supabase Browser] Erro ao salvar usuário:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase Browser] Exceção ao salvar usuário:", err);
    return false;
  }
}

export async function deleteUserFromSupabase(id: string): Promise<boolean> {
  const client = getBrowserSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await client.from("users").delete().eq("id", id);
    if (error) return false;
    return true;
  } catch (err) {
    console.error("[Supabase Browser] Erro ao excluir usuário:", err);
    return false;
  }
}

// Helpers mapping
function mapTicketFromSupabase(row: any): Ticket {
  let comments: Comment[] = [];
  let screenshot: string | undefined = undefined;
  let projectDeadline: string | undefined = row.project_deadline || undefined;
  let attachments: any[] = [];

  if (row.comments) {
    let parsedComments: any[] = [];
    if (typeof row.comments === "string") {
      try {
        parsedComments = JSON.parse(row.comments);
      } catch (e) {
        parsedComments = [];
      }
    } else if (Array.isArray(row.comments)) {
      parsedComments = row.comments;
    } else if (typeof row.comments === "object" && row.comments !== null) {
      parsedComments = row.comments as any[];
    }

    const screenshotMeta = parsedComments.find((c: any) => c.id === "screenshot-meta");
    if (screenshotMeta) screenshot = screenshotMeta.content;

    const deadlineMeta = parsedComments.find((c: any) => c.id === "project-deadline-meta");
    if (deadlineMeta) projectDeadline = deadlineMeta.content;

    const attachmentsMeta = parsedComments.find((c: any) => c.id === "attachments-meta");
    if (attachmentsMeta) {
      try {
        attachments = JSON.parse(attachmentsMeta.content);
      } catch (e) {}
    }

    comments = parsedComments.filter(
      (c: any) =>
        c.id !== "screenshot-meta" &&
        c.id !== "project-deadline-meta" &&
        c.id !== "attachments-meta"
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
    attachments
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
  if (ticket.attachments && ticket.attachments.length > 0) {
    commentsToSave.push({
      id: "attachments-meta",
      authorName: "Sistema",
      authorRole: "system",
      content: JSON.stringify(ticket.attachments),
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
