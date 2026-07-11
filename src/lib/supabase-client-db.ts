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

// Helper to read dynamic config from static public/config.js loaded into window.SUPABASE_CONFIG
export function getDynamicConfig() {
  const cfg = (window as any).SUPABASE_CONFIG;
  
  const configUrl = cfg?.SUPABASE_URL || "";
  const configKey = cfg?.SUPABASE_KEY || "";
  const configGemini = cfg?.GEMINI_API_KEY || "";

  // Ignore default placeholder values
  const finalUrl = configUrl && !configUrl.includes("your-selfhosted-") ? configUrl.trim() : "";
  const finalKey = configKey && !configKey.includes("SUA_CHAVE_") ? configKey.trim() : "";
  const finalGemini = configGemini && !configGemini.includes("SUA_CHAVE_") ? configGemini.trim() : "";

  return {
    supabaseUrl: finalUrl || process.env.SUPABASE_URL || "",
    supabaseKey: finalKey || process.env.SUPABASE_KEY || "",
    geminiKey: finalGemini || process.env.GEMINI_API_KEY || ""
  };
}

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseInstance) return supabaseInstance;
  
  const { supabaseUrl, supabaseKey } = getDynamicConfig();
  if (!supabaseUrl || !supabaseKey) {
    console.warn("[Supabase] Credenciais ausentes. O sistema funcionará localmente (localStorage).");
    return null;
  }
  try {
    // Use the original Supabase URL directly on the client side as requested
    let finalUrl = supabaseUrl;

    supabaseInstance = createClient(finalUrl, supabaseKey, {
      auth: {
        persistSession: false
      }
    });
    return supabaseInstance;
  } catch (error) {
    console.error("[Supabase] Erro ao instanciar cliente:", error);
    return null;
  }
}

export function isSupabaseConfigured(): boolean {
  const { supabaseUrl, supabaseKey } = getDynamicConfig();
  return !!(supabaseUrl && supabaseKey);
}

// Browser-safe SHA-256 hashing using Web Crypto API
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
    console.error("Falha ao hashear senha:", err);
    return password; // Fallback
  }
}

// Mapping functions
function mapUserFromSupabase(dbUser: any): User {
  return {
    id: dbUser.id,
    name: dbUser.name,
    email: dbUser.email,
    password: dbUser.password,
    department: dbUser.department,
    role: dbUser.role as "colaborador" | "tecnico",
    mustChangePassword: dbUser.must_change_password === true
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
        parsedComments = [];
      }
    } else if (Array.isArray(dbTicket.comments)) {
      parsedComments = dbTicket.comments;
    }

    const screenshotMeta = parsedComments.find((c: any) => c.id === "screenshot-meta");
    if (screenshotMeta) {
      screenshot = screenshotMeta.content;
    }

    const deadlineMeta = parsedComments.find((c: any) => c.id === "project-deadline-meta");
    if (deadlineMeta) {
      projectDeadline = deadlineMeta.content;
    }

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

// Local Storage helpers for robust fallback
const LOCAL_USERS_KEY = "gran7_users_backup";
const LOCAL_TICKETS_KEY = "gran7_tickets_backup";

function getLocalUsers(): User[] {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalUsers(users: User[]) {
  try {
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch {}
}

function getLocalTickets(): Ticket[] {
  try {
    const raw = localStorage.getItem(LOCAL_TICKETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalTickets(tickets: Ticket[]) {
  try {
    localStorage.setItem(LOCAL_TICKETS_KEY, JSON.stringify(tickets));
  } catch {}
}

// Database Actions
export async function getTickets(): Promise<Ticket[]> {
  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client
        .from("tickets")
        .select("id, title, description, category, priority, status, requester_name, requester_department, assigned_to, created_at, updated_at, sla_limit, ai_category, ai_priority, ai_reasoning, ai_suggestions, comments");
      if (!error && data) {
        const mapped = data.map(mapTicketFromSupabase);
        saveLocalTickets(mapped); // update local cache
        return mapped;
      }
    } catch (e) {
      console.warn("Supabase tickets query failed, reading local cache:", e);
    }
  }
  return getLocalTickets();
}

export async function saveTicket(ticket: Ticket): Promise<boolean> {
  // Save locally first
  const local = getLocalTickets();
  const idx = local.findIndex(t => t.id === ticket.id);
  if (idx >= 0) {
    local[idx] = ticket;
  } else {
    local.push(ticket);
  }
  saveLocalTickets(local);

  const client = getSupabaseClient();
  if (client) {
    try {
      const dbPayload = mapTicketToSupabase(ticket);
      let { error } = await client.from("tickets").upsert(dbPayload);
      if (error && (error.message?.includes("project_deadline") || error.message?.includes("column"))) {
        const copy = { ...dbPayload };
        delete (copy as any).project_deadline;
        const retry = await client.from("tickets").upsert(copy);
        error = retry.error;
      }
      return !error;
    } catch (e) {
      console.warn("Supabase tickets save failed:", e);
    }
  }
  return true;
}

export async function deleteTicket(id: string): Promise<boolean> {
  const local = getLocalTickets().filter(t => t.id !== id);
  saveLocalTickets(local);

  const client = getSupabaseClient();
  if (client) {
    try {
      const { error } = await client.from("tickets").delete().eq("id", id);
      return !error;
    } catch (e) {
      console.warn("Supabase tickets delete failed:", e);
    }
  }
  return true;
}

export async function getUsers(): Promise<User[]> {
  const client = getSupabaseClient();
  if (client) {
    try {
      let queryResult = await client.from("users").select("id, name, email, password, department, role, must_change_password");
      if (queryResult.error && (queryResult.error.message?.includes("must_change_password") || queryResult.error.message?.includes("column"))) {
        queryResult = await client.from("users").select("id, name, email, password, department, role");
      }
      const { data, error } = queryResult;
      if (!error && data) {
        const mapped = data.map(mapUserFromSupabase);
        saveLocalUsers(mapped);
        return mapped;
      }
    } catch (e) {
      console.warn("Supabase users query failed, reading local cache:", e);
    }
  }
  return getLocalUsers();
}

export async function saveUser(user: User): Promise<boolean> {
  const local = getLocalUsers();
  const idx = local.findIndex(u => u.id === user.id);
  if (idx >= 0) {
    local[idx] = user;
  } else {
    local.push(user);
  }
  saveLocalUsers(local);

  const client = getSupabaseClient();
  if (client) {
    try {
      const hashedPassword = await hashPassword(user.password || "123");
      const payload: any = {
        id: user.id,
        name: user.name,
        email: user.email.toLowerCase().trim(),
        password: hashedPassword,
        department: user.department,
        role: user.role,
        must_change_password: user.mustChangePassword !== false
      };
      let { error } = await client.from("users").upsert(payload, { onConflict: "email" });
      if (error && (error.message?.includes("must_change_password") || error.message?.includes("column"))) {
        delete payload.must_change_password;
        const retry = await client.from("users").upsert(payload, { onConflict: "email" });
        error = retry.error;
      }
      return !error;
    } catch (e) {
      console.warn("Supabase user save failed:", e);
    }
  }
  return true;
}

export async function deleteUser(id: string): Promise<boolean> {
  const local = getLocalUsers().filter(u => u.id !== id);
  saveLocalUsers(local);

  const client = getSupabaseClient();
  if (client) {
    try {
      const { error } = await client.from("users").delete().eq("id", id);
      return !error;
    } catch (e) {
      console.warn("Supabase user delete failed:", e);
    }
  }
  return true;
}

// Direct client-side user authentication
export async function authenticateUser(email: string, pass: string): Promise<UserSession> {
  const emailLower = email.trim().toLowerCase();
  const client = getSupabaseClient();

  if (client) {
    try {
      let queryResult = await client
        .from("users")
        .select("id, name, email, password, department, role, must_change_password")
        .eq("email", emailLower)
        .maybeSingle();

      if (queryResult.error && (queryResult.error.message?.includes("must_change_password") || queryResult.error.message?.includes("column"))) {
        queryResult = await client
          .from("users")
          .select("id, name, email, password, department, role")
          .eq("email", emailLower)
          .maybeSingle();
      }

      const { data: dbUser, error } = queryResult;

      if (!error && dbUser) {
        const storedPass = dbUser.password || "";
        const hashedInput = await hashPassword(pass);
        const isMatch = storedPass === pass || storedPass === hashedInput;

        if (isMatch) {
          return {
            name: dbUser.name,
            department: dbUser.department,
            role: dbUser.role as "colaborador" | "tecnico",
            email: dbUser.email,
            mustChangePassword: (dbUser as any).must_change_password === true
          };
        } else {
          throw new Error("Senha de acesso incorreta.");
        }
      }
    } catch (e: any) {
      console.warn("Falha de autenticação via Supabase, tentando local:", e);
      if (e.message?.includes("Senha de acesso")) {
        throw e;
      }
    }
  }

  // Local backup auth
  const local = getLocalUsers();
  const localUser = local.find(u => u.email.toLowerCase().trim() === emailLower);
  if (localUser) {
    const hashedInput = await hashPassword(pass);
    if (localUser.password === pass || localUser.password === hashedInput) {
      return {
        name: localUser.name,
        department: localUser.department,
        role: localUser.role,
        email: localUser.email,
        mustChangePassword: localUser.mustChangePassword !== false
      };
    } else {
      throw new Error("Senha de acesso incorreta.");
    }
  }

  throw new Error("E-mail corporativo não encontrado ou cadastrado.");
}

// Direct client-side password change
export async function changeUserPassword(email: string, newPass: string): Promise<boolean> {
  const emailLower = email.trim().toLowerCase();
  const hashed = await hashPassword(newPass);

  // Update locally
  const local = getLocalUsers();
  const localUser = local.find(u => u.email.toLowerCase().trim() === emailLower);
  if (localUser) {
    localUser.password = hashed;
    localUser.mustChangePassword = false;
    saveLocalUsers(local);
  }

  const client = getSupabaseClient();
  if (client) {
    try {
      // Find user first to get their ID
      const { data: dbUser } = await client
        .from("users")
        .select("id")
        .eq("email", emailLower)
        .maybeSingle();

      if (dbUser) {
        const payload: any = {
          password: hashed,
          must_change_password: false
        };
        let { error } = await client
          .from("users")
          .update(payload)
          .eq("id", dbUser.id);

        if (error && (error.message?.includes("must_change_password") || error.message?.includes("column"))) {
          delete payload.must_change_password;
          const retry = await client
            .from("users")
            .update(payload)
            .eq("id", dbUser.id);
          error = retry.error;
        }
        return !error;
      }
    } catch (e) {
      console.warn("Falha ao mudar senha no Supabase:", e);
    }
  }
  return true;
}

// Offline-fallback manual local triage
function defaultLocalTriage(title: string, description: string) {
  const text = `${title} ${description}`.toLowerCase();
  let category: Ticket["category"] = "Outros";
  let priority: Ticket["priority"] = "Média";
  let reasoning = "Triagem automática local baseada em detecção de palavras-chave.";
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

// Client-side AI Triage with Gemini REST API
export async function triageWithGemini(title: string, description: string, screenshot?: string): Promise<{
  category: Ticket["category"];
  priority: Ticket["priority"];
  reasoning: string;
  suggestions: string;
}> {
  const { geminiKey: apiKey } = getDynamicConfig();
  if (!apiKey) {
    return defaultLocalTriage(title, description);
  }

  try {
    let imagePart = null;
    if (screenshot && screenshot.startsWith("data:")) {
      const match = screenshot.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        imagePart = {
          inlineData: {
            mimeType: match[1],
            data: match[2],
          }
        };
      }
    }

    const promptText = `Você é a inteligência artificial de triagem e suporte técnico do IT Help Desk da GRAN7 HELP.
Analise este chamado aberto por um colaborador e classifique-o com precisão técnica.
${imagePart ? "Analise também a imagem/print em anexo que o colaborador enviou como evidência do problema." : ""}

Título do Chamado: "${title}"
Descrição do Problema: "${description}"
${imagePart ? "Na sua análise, certifique-se de examinar o conteúdo visual do print anexado para identificar mensagens de erro específicas, códigos de status, telas de falha, ou qualquer elemento de hardware/software visível que ajude a explicar o problema." : ""}

Responda estritamente no seguinte formato JSON (sem markdown envolta, apenas as chaves):
{
  "category": "Hardware" ou "Software" ou "Redes" ou "Acesso" ou "Sistemas" ou "Outros",
  "priority": "Baixa" ou "Média" ou "Alta" ou "Urgente",
  "reasoning": "Sua justificativa técnica detalhada e precisa em português (máximo 2-3 frases). Explique o que foi identificado no título/descrição${imagePart ? " e o que você identificou na imagem anexada" : ""} e por que determinou essa categoria e prioridade.",
  "suggestions": "Instruções passo a passo (3 a 5 pontos numerados), objetivas e práticas em português, para que o técnico possa iniciar o atendimento ou instruir o usuário imediatamente."
}

Use os seguintes critérios de prioridade:
- Urgente: Interrupção total de um setor inteiro, faturamento travado, servidor fora do ar, ou incidente crítico de segurança da informação.
- Alta: Trabalho impedido por completo para um colaborador individual (computador que não liga, conta AD bloqueada para diretor, sem internet no PC).
- Média: Falhas parciais que causam lentidão ou dificultam o trabalho mas têm alternativa paliativa (impressora travando folhas, software lento).
- Baixa: Dúvidas de usabilidade, novas instalações de softwares secundários, melhorias de infraestrutura ou consultas gerais.`;

    const parts = imagePart ? [imagePart, { text: promptText }] : [{ text: promptText }];
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: "application/json",
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API: ${response.statusText}`);
    }

    const resData = await response.json();
    const resultText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (resultText) {
      const cleaned = resultText.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return {
        category: (parsed.category as Ticket["category"]) || "Outros",
        priority: (parsed.priority as Ticket["priority"]) || "Média",
        reasoning: parsed.reasoning || "Triagem automática inteligente executada pelo Gemini.",
        suggestions: parsed.suggestions || "Nenhuma sugestão de primeiros passos disponível.",
      };
    }
  } catch (err) {
    console.warn("[Gemini API] Falha na triagem, usando local:", err);
  }
  
  return defaultLocalTriage(title, description);
}
