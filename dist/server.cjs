var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// server.ts
var server_exports = {};
__export(server_exports, {
  default: () => server_default
});
module.exports = __toCommonJS(server_exports);
var import_dotenv = __toESM(require("dotenv"), 1);
var import_express = __toESM(require("express"), 1);
var import_path2 = __toESM(require("path"), 1);
var import_fs2 = __toESM(require("fs"), 1);
var import_crypto2 = __toESM(require("crypto"), 1);
var import_genai = require("@google/genai");

// supabase-db.ts
var import_supabase_js = require("@supabase/supabase-js");
var import_fs = __toESM(require("fs"), 1);
var import_crypto = __toESM(require("crypto"), 1);
var import_path = __toESM(require("path"), 1);
var initialUsers = [];
try {
  const usersPath = import_path.default.join(process.cwd(), "users-db.json");
  if (import_fs.default.existsSync(usersPath)) {
    initialUsers = JSON.parse(import_fs.default.readFileSync(usersPath, "utf-8"));
  }
} catch (err) {
  console.warn("Failed to load initial users in supabase-db:", err);
}
var initialPasswordHashes = /* @__PURE__ */ new Map();
try {
  if (Array.isArray(initialUsers)) {
    initialUsers.forEach((u) => {
      if (u.email && u.password) {
        initialPasswordHashes.set(u.email.toLowerCase().trim(), u.password);
      }
    });
  }
} catch (err) {
  console.error("Failed to load initial password hashes in supabase-db:", err);
}
function hashPassword(password) {
  if (!password) return "";
  if (/^[a-f0-9]{64}$/i.test(password)) {
    return password;
  }
  return import_crypto.default.createHash("sha256").update(password).digest("hex");
}
function getBackendConfig() {
  let url = process.env.SUPABASE_URL || "";
  let key = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
  let gemini = process.env.GEMINI_API_KEY || "";
  try {
    const configPath = import_path.default.join(process.cwd(), "public", "config.js");
    if (import_fs.default.existsSync(configPath)) {
      const content = import_fs.default.readFileSync(configPath, "utf-8");
      const urlMatch = content.match(/SUPABASE_URL\s*:\s*["']([^"']+)["']/);
      const keyMatch = content.match(/SUPABASE_KEY\s*:\s*["']([^"']+)["']/);
      const geminiMatch = content.match(/GEMINI_API_KEY\s*:\s*["']([^"']+)["']/);
      const parsedUrl = urlMatch ? urlMatch[1].trim() : "";
      const parsedKey = keyMatch ? keyMatch[1].trim() : "";
      const parsedGemini = geminiMatch ? geminiMatch[1].trim() : "";
      if (parsedUrl && !parsedUrl.includes("your-selfhosted-")) {
        url = parsedUrl;
      }
      if (parsedKey && !parsedKey.includes("SUA_CHAVE_")) {
        key = parsedKey;
      }
      if (parsedGemini && !parsedGemini.includes("SUA_CHAVE_")) {
        gemini = parsedGemini;
      }
    }
  } catch (err) {
    console.warn("Falha ao ler configura\xE7\xE3o din\xE2mica do config.js no backend:", err);
  }
  return { url, key, gemini };
}
var supabaseInstance = null;
function getSupabaseClient() {
  if (supabaseInstance) return supabaseInstance;
  const { url, key } = getBackendConfig();
  if (!url || !key) {
    return null;
  }
  try {
    supabaseInstance = (0, import_supabase_js.createClient)(url, key, {
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
function isSupabaseConfigured() {
  const { url, key } = getBackendConfig();
  return !!(url && key);
}
async function testSupabaseConnection() {
  if (!isSupabaseConfigured()) {
    return { connected: false, error: "Credenciais do Supabase ausentes (.env ou Secrets do AI Studio)" };
  }
  const client = getSupabaseClient();
  if (!client) {
    return { connected: false, error: "Falha ao instanciar o cliente do Supabase" };
  }
  try {
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
  } catch (err) {
    return { connected: false, error: err.message || "Erro desconhecido ao testar conex\xE3o" };
  }
}
var SUPABASE_SQL_SCHEMA = `-- EXECUTAR ESTE SCRIPT NO EDITOR DE SQL DO SEU SUPABASE:

-- 1. Criar tabela de Usu\xE1rios (Users)
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

-- 3. Inserir Usu\xE1rios Iniciais Padr\xE3o (Deixado em branco para cadastramento manual)
-- Adicione novos colaboradores pela interface de Cadastro do sistema!
`;
function mapUserFromSupabase(dbUser) {
  const emailLower = (dbUser.email || "").toLowerCase().trim();
  let mustChange = dbUser.must_change_password !== void 0 ? dbUser.must_change_password !== false : void 0;
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
    role: dbUser.role,
    mustChangePassword: mustChange
  };
}
function mapTicketFromSupabase(dbTicket) {
  let comments = [];
  let screenshot = void 0;
  let projectDeadline = dbTicket.project_deadline || void 0;
  if (dbTicket.comments) {
    let parsedComments = [];
    if (typeof dbTicket.comments === "string") {
      try {
        parsedComments = JSON.parse(dbTicket.comments);
      } catch (e) {
        console.warn("Falha ao analisar JSON de coment\xE1rios do chamado:", e);
        parsedComments = [];
      }
    } else if (Array.isArray(dbTicket.comments)) {
      parsedComments = dbTicket.comments;
    }
    const screenshotMeta = parsedComments.find((c) => c.id === "screenshot-meta");
    if (screenshotMeta) {
      screenshot = screenshotMeta.content;
    }
    const deadlineMeta = parsedComments.find((c) => c.id === "project-deadline-meta");
    if (deadlineMeta) {
      projectDeadline = deadlineMeta.content;
    }
    comments = parsedComments.filter((c) => c.id !== "screenshot-meta" && c.id !== "project-deadline-meta");
  }
  return {
    id: dbTicket.id || "",
    title: dbTicket.title || "",
    description: dbTicket.description || "",
    category: dbTicket.category || "Outros",
    priority: dbTicket.priority || "M\xE9dia",
    status: dbTicket.status || "Aberto",
    requesterName: dbTicket.requester_name || "",
    requesterDepartment: dbTicket.requester_department || "",
    assignedTo: dbTicket.assigned_to || null,
    createdAt: dbTicket.created_at || (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: dbTicket.updated_at || (/* @__PURE__ */ new Date()).toISOString(),
    slaLimit: dbTicket.sla_limit || (/* @__PURE__ */ new Date()).toISOString(),
    aiCategory: dbTicket.ai_category || "",
    aiPriority: dbTicket.ai_priority || "",
    aiReasoning: dbTicket.ai_reasoning || "",
    aiSuggestions: dbTicket.ai_suggestions || "",
    comments,
    screenshot,
    projectDeadline
  };
}
function mapTicketToSupabase(ticket) {
  const commentsToSave = [...ticket.comments || []];
  if (ticket.screenshot) {
    commentsToSave.push({
      id: "screenshot-meta",
      authorName: "Sistema",
      authorRole: "system",
      content: ticket.screenshot,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  if (ticket.projectDeadline) {
    commentsToSave.push({
      id: "project-deadline-meta",
      authorName: "Sistema",
      authorRole: "system",
      content: ticket.projectDeadline,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
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
async function getSupabaseUsers() {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client.from("users").select("*").order("name", { ascending: true });
    if (error) {
      console.warn("Aviso ao buscar usu\xE1rios no Supabase (verifique se a tabela foi criada):", error.message);
      return null;
    }
    return (data || []).map(mapUserFromSupabase);
  } catch (err) {
    console.error("Erro ao ler usu\xE1rios do Supabase:", err);
    return null;
  }
}
async function saveSupabaseUser(user) {
  const client = getSupabaseClient();
  if (!client) return false;
  const rawPassword = user.password || "123";
  const hashedPassword = hashPassword(rawPassword);
  try {
    const payload = {
      id: user.id,
      name: user.name,
      email: user.email.toLowerCase().trim(),
      password: hashedPassword,
      department: user.department,
      role: user.role,
      must_change_password: user.mustChangePassword !== false
    };
    let { error } = await client.from("users").upsert(payload, { onConflict: "email" });
    if (error && (error.code === "PGRST204" || error.message?.includes("must_change_password") || error.message?.includes("column"))) {
      console.warn("[Supabase Sync] Coluna 'must_change_password' n\xE3o encontrada na tabela 'users'. Tentando salvar sem esta coluna.");
      delete payload.must_change_password;
      const retryResult = await client.from("users").upsert(payload, { onConflict: "email" });
      error = retryResult.error;
    }
    if (error) {
      console.error("Erro ao salvar usu\xE1rio no Supabase:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Exce\xE7\xE3o ao salvar usu\xE1rio no Supabase:", err);
    return false;
  }
}
async function deleteSupabaseUser(id) {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.from("users").delete().eq("id", id);
    if (error) {
      console.error("Erro ao deletar usu\xE1rio no Supabase:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Exce\xE7\xE3o ao deletar usu\xE1rio no Supabase:", err);
    return false;
  }
}
async function getSupabaseTickets() {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client.from("tickets").select("*");
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
async function saveSupabaseTicket(ticket) {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const dbData = mapTicketToSupabase(ticket);
    let { error } = await client.from("tickets").upsert(dbData);
    if (error && (error.message?.includes("project_deadline") || error.message?.includes("column"))) {
      console.warn("[Supabase Sync] Coluna 'project_deadline' n\xE3o encontrada na tabela 'tickets'. Tentando salvar sem esta coluna.");
      const fallbackDbData = { ...dbData };
      delete fallbackDbData.project_deadline;
      const retryResult = await client.from("tickets").upsert(fallbackDbData);
      error = retryResult.error;
    }
    if (error) {
      console.error("Erro ao salvar chamado no Supabase:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Exce\xE7\xE3o ao salvar chamado no Supabase:", err);
    return false;
  }
}
async function deleteSupabaseTicket(id) {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.from("tickets").delete().eq("id", id);
    if (error) {
      console.error("Erro ao deletar chamado no Supabase:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Exce\xE7\xE3o ao deletar chamado no Supabase:", err);
    return false;
  }
}
async function seedSupabaseData(users, tickets) {
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

// server.ts
import_dotenv.default.config();
var initialUsers2 = [];
try {
  const usersPath = import_path2.default.join(process.cwd(), "users-db.json");
  if (import_fs2.default.existsSync(usersPath)) {
    initialUsers2 = JSON.parse(import_fs2.default.readFileSync(usersPath, "utf-8"));
  }
} catch (err) {
  console.warn("Failed to load initial users in server.ts:", err);
}
var initialTickets = [];
try {
  const ticketsPath = import_path2.default.join(process.cwd(), "tickets-db.json");
  if (import_fs2.default.existsSync(ticketsPath)) {
    initialTickets = JSON.parse(import_fs2.default.readFileSync(ticketsPath, "utf-8"));
  }
} catch (err) {
  console.warn("Failed to load initial tickets in server.ts:", err);
}
var app = (0, import_express.default)();
var isAIStudio = !!process.env.APPLET_ID || process.env.DISABLE_HMR === "true";
var PORT = !isAIStudio && process.env.PORT ? isNaN(Number(process.env.PORT)) ? process.env.PORT : Number(process.env.PORT) : 3e3;
var DB_FILE = import_path2.default.join(process.cwd(), "tickets-db.json");
var USERS_FILE = import_path2.default.join(process.cwd(), "users-db.json");
var activeUsers = /* @__PURE__ */ new Map();
app.use(import_express.default.json({ limit: "50mb" }));
app.use(import_express.default.urlencoded({ limit: "50mb", extended: true }));
var initialPasswordHashes2 = /* @__PURE__ */ new Map();
try {
  if (Array.isArray(initialUsers2)) {
    initialUsers2.forEach((u) => {
      if (u.email && u.password) {
        initialPasswordHashes2.set(u.email.toLowerCase().trim(), u.password);
      }
    });
  }
} catch (err) {
  console.error("Failed to load initial password hashes in server.ts:", err);
}
app.use("/assets", import_express.default.static(import_path2.default.join(process.cwd(), "assets")));
var DEFAULT_USERS = [];
var DEFAULT_TICKETS = [];
var cachedTickets = null;
var lastTicketsCacheTime = 0;
var cachedUsers = null;
var lastUsersCacheTime = 0;
var CACHE_TTL_MS = 15e3;
async function loadTickets() {
  const now = Date.now();
  if (cachedTickets !== null && now - lastTicketsCacheTime < CACHE_TTL_MS) {
    return cachedTickets;
  }
  let tickets = null;
  if (isSupabaseConfigured()) {
    try {
      tickets = await getSupabaseTickets();
      if (tickets !== null && Array.isArray(tickets)) {
        try {
          import_fs2.default.writeFileSync(DB_FILE, JSON.stringify(tickets, null, 2), "utf-8");
        } catch (e) {
        }
        cachedTickets = tickets;
        lastTicketsCacheTime = now;
        return tickets;
      }
    } catch (error) {
      console.warn("Erro ao carregar chamados do Supabase, usando arquivo local:", error);
    }
  }
  try {
    if (import_fs2.default.existsSync(DB_FILE)) {
      const data = import_fs2.default.readFileSync(DB_FILE, "utf-8").trim();
      if (data) {
        tickets = JSON.parse(data);
        if (Array.isArray(tickets)) {
          cachedTickets = tickets;
          lastTicketsCacheTime = now;
          return tickets;
        }
      }
    }
  } catch (error) {
    console.error("Erro ao ler banco de dados de chamados local, reiniciando com semente:", error);
  }
  try {
    import_fs2.default.writeFileSync(DB_FILE, JSON.stringify(initialTickets, null, 2), "utf-8");
  } catch (e) {
  }
  const seed = initialTickets;
  cachedTickets = seed;
  lastTicketsCacheTime = now;
  return seed;
}
async function saveTickets(tickets, singleChangedTicket) {
  cachedTickets = tickets;
  lastTicketsCacheTime = Date.now();
  try {
    import_fs2.default.writeFileSync(DB_FILE, JSON.stringify(tickets, null, 2), "utf-8");
  } catch (error) {
    console.error("Erro ao salvar banco de dados de chamados local:", error);
  }
  if (isSupabaseConfigured()) {
    try {
      if (singleChangedTicket) {
        await saveSupabaseTicket(singleChangedTicket);
      } else {
        for (const ticket of tickets) {
          await saveSupabaseTicket(ticket);
        }
      }
    } catch (error) {
      console.error("Erro ao sincronizar chamados com o Supabase:", error);
    }
  }
}
function hashPassword2(password) {
  if (!password) return "";
  if (/^[a-f0-9]{64}$/i.test(password)) {
    return password;
  }
  return import_crypto2.default.createHash("sha256").update(password).digest("hex");
}
async function loadUsers() {
  const now = Date.now();
  if (cachedUsers !== null && now - lastUsersCacheTime < CACHE_TTL_MS) {
    return cachedUsers;
  }
  let localUsers = [];
  try {
    if (import_fs2.default.existsSync(USERS_FILE)) {
      const data = import_fs2.default.readFileSync(USERS_FILE, "utf-8").trim();
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          localUsers = parsed;
        }
      }
    }
  } catch (error) {
    console.error("Erro ao ler banco de dados de usu\xE1rios local:", error);
  }
  if (localUsers.length === 0) {
    localUsers = JSON.parse(JSON.stringify(initialUsers2));
  }
  let needsRewrite = false;
  localUsers = localUsers.map((u) => {
    if (u.password && !/^[a-f0-9]{64}$/i.test(u.password)) {
      u.password = hashPassword2(u.password);
      needsRewrite = true;
    }
    return u;
  });
  if (isSupabaseConfigured()) {
    try {
      const supabaseUsers = await getSupabaseUsers();
      if (supabaseUsers !== null) {
        let merged = [...supabaseUsers];
        for (const localU of localUsers) {
          const match = merged.find((u) => u.email.toLowerCase() === localU.email.toLowerCase());
          if (!match) {
            merged.push(localU);
          } else {
            if (match.mustChangePassword === void 0) {
              match.mustChangePassword = localU.mustChangePassword !== false;
            }
          }
        }
        merged = merged.map((u) => {
          if (u.password && !/^[a-f0-9]{64}$/i.test(u.password)) {
            u.password = hashPassword2(u.password);
            needsRewrite = true;
          }
          return u;
        });
        if (needsRewrite) {
          try {
            import_fs2.default.writeFileSync(USERS_FILE, JSON.stringify(merged, null, 2), "utf-8");
          } catch (e) {
          }
        }
        cachedUsers = merged;
        lastUsersCacheTime = now;
        return merged;
      }
    } catch (error) {
      console.warn("Erro ao carregar colaboradores do Supabase, usando arquivo local:", error);
    }
  }
  if (needsRewrite) {
    try {
      import_fs2.default.writeFileSync(USERS_FILE, JSON.stringify(localUsers, null, 2), "utf-8");
    } catch (e) {
    }
  }
  cachedUsers = localUsers;
  lastUsersCacheTime = now;
  return localUsers;
}
async function saveUsers(users, changedUser) {
  const securedUsers = users.map((u) => ({
    ...u,
    password: u.password ? hashPassword2(u.password) : void 0
  }));
  cachedUsers = securedUsers;
  lastUsersCacheTime = Date.now();
  try {
    import_fs2.default.writeFileSync(USERS_FILE, JSON.stringify(securedUsers, null, 2), "utf-8");
  } catch (error) {
    console.error("Erro ao salvar banco de dados de usu\xE1rios local:", error);
  }
  if (isSupabaseConfigured()) {
    try {
      if (changedUser) {
        const toSync = Array.isArray(changedUser) ? changedUser : [changedUser];
        for (const user of toSync) {
          const success = await saveSupabaseUser(user);
          if (success) {
            console.log(`[Supabase Sync] Usu\xE1rio ${user.email} sincronizado com sucesso.`);
          } else {
            console.error(`[Supabase Sync] Falha ao sincronizar usu\xE1rio ${user.email}.`);
          }
        }
      } else {
        console.log(`[Supabase Sync] Sincronizando todos os ${users.length} usu\xE1rios...`);
        for (const user of users) {
          await saveSupabaseUser(user);
        }
      }
    } catch (error) {
      console.error("Erro ao sincronizar colaboradores com o Supabase:", error);
    }
  }
}
function defaultLocalTriage(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  let category = "Outros";
  let priority = "M\xE9dia";
  let reasoning = "Triagem autom\xE1tica local realizada com base em detec\xE7\xE3o de termos operacionais.";
  let suggestions = "1. Solicitar maiores detalhes do usu\xE1rio se necess\xE1rio.\n2. Testar acesso remoto ao dispositivo afetado.\n3. Reiniciar m\xE1quina ou equipamento de rede prim\xE1rio.";
  if (text.includes("senha") || text.includes("login") || text.includes("acesso") || text.includes("entrar") || text.includes("bloqueado") || text.includes("bloqueada") || text.includes("permiss\xE3o")) {
    category = "Acesso";
    priority = "Alta";
    suggestions = "1. Verificar o cadastro do usu\xE1rio no Active Directory.\n2. Confirmar se a senha expirou ou precisa de redefini\xE7\xE3o no painel AD.\n3. Checar permiss\xF5es no grupo de rede correspondente.";
  } else if (text.includes("internet") || text.includes("wi-fi") || text.includes("wifi") || text.includes("rede") || text.includes("cabo") || text.includes("conex\xE3o") || text.includes("lento") || text.includes("lenta")) {
    category = "Redes";
    priority = "Alta";
    suggestions = "1. Verificar se o cabo Ethernet est\xE1 devidamente conectado.\n2. Testar conectividade via comando ping (ex: ping 8.8.8.8).\n3. Validar se o computador obteve o IP via DHCP automaticamente.";
  } else if (text.includes("computador") || text.includes("pc") || text.includes("monitor") || text.includes("impressora") || text.includes("hardware") || text.includes("teclado") || text.includes("mouse") || text.includes("ligando") || text.includes("notebook")) {
    category = "Hardware";
    priority = "M\xE9dia";
    suggestions = "1. Verificar cabos de for\xE7a e fonte de alimenta\xE7\xE3o do equipamento.\n2. Se for impressora, checar se h\xE1 obstru\xE7\xF5es f\xEDsicas de papel ou toner vazio.\n3. Tentar conectar o dispositivo em outra porta USB ou testar em outro computador.";
  } else if (text.includes("outlook") || text.includes("email") || text.includes("e-mail") || text.includes("excel") || text.includes("word") || text.includes("photoshop") || text.includes("adobe") || text.includes("licen\xE7a")) {
    category = "Software";
    priority = "Baixa";
    suggestions = "1. Verificar se o programa possui atualiza\xE7\xF5es pendentes.\n2. Se for licen\xE7a, verificar pool corporativo.\n3. Limpar arquivos tempor\xE1rios do sistema ou desinstalar e reinstalar o programa.";
  } else if (text.includes("protheus") || text.includes("erp") || text.includes("sap") || text.includes("sistema") || text.includes("banco de dados") || text.includes("faturamento") || text.includes("site")) {
    category = "Sistemas";
    priority = "Alta";
    suggestions = "1. Verificar se o servidor do ERP est\xE1 online e operando normalmente.\n2. Limpar o cache de arquivos tempor\xE1rios do ERP local no computador do usu\xE1rio.\n3. Checar logs de conex\xE3o do banco de dados.";
  }
  if (text.includes("urgente") || text.includes("cr\xEDtico") || text.includes("faturamento parado") || text.includes("n\xE3o consigo trabalhar") || text.includes("parou tudo")) {
    priority = "Urgente";
  }
  return { category, priority, reasoning, suggestions };
}
async function triageWithGemini(title, description, screenshot) {
  const { gemini: geminiKey } = getBackendConfig();
  if (!geminiKey) {
    console.log("Gemini API Key n\xE3o configurada. Usando triagem padr\xE3o local.");
    return defaultLocalTriage(title, description);
  }
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const ai = new import_genai.GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build"
          }
        }
      });
      let imagePart = null;
      if (screenshot && screenshot.startsWith("data:")) {
        const match = screenshot.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          imagePart = {
            inlineData: {
              mimeType: match[1],
              data: match[2]
            }
          };
        }
      }
      const promptText = `Voc\xEA \xE9 a intelig\xEAncia artificial de triagem e suporte t\xE9cnico do IT Help Desk da GRAN7 HELP.
Analise este chamado aberto por um colaborador e classifique-o com precis\xE3o t\xE9cnica.${imagePart ? " Analise tamb\xE9m a imagem/print em anexo que o colaborador enviou como evid\xEAncia do problema." : ""}

T\xEDtulo do Chamado: "${title}"
Descri\xE7\xE3o do Problema: "${description}"

${imagePart ? "Na sua an\xE1lise, certifique-se de examinar o conte\xFAdo visual do print anexado para identificar mensagens de erro espec\xEDficas, c\xF3digos de status, telas de falha, ou qualquer elemento de hardware/software vis\xEDvel que ajude a explicar o problema." : ""}

Responda estritamente no seguinte formato JSON (sem markdown envolta, apenas as chaves):
{
  "category": "Hardware" ou "Software" ou "Redes" ou "Acesso" ou "Sistemas" ou "Outros",
  "priority": "Baixa" ou "M\xE9dia" ou "Alta" ou "Urgente",
  "reasoning": "Sua justificativa t\xE9cnica detalhada e precisa em portugu\xEAs (m\xE1ximo 2-3 frases). Explique o que foi identificado no t\xEDtulo/descri\xE7\xE3o${imagePart ? " e o que voc\xEA identificou na imagem anexada" : ""} e por que determinou essa categoria e prioridade.",
  "suggestions": "Instru\xE7\xF5es passo a passo (3 a 5 pontos numerados), objetivas e pr\xE1ticas em portugu\xEAs, para que o t\xE9cnico possa iniciar o atendimento ou instruir o usu\xE1rio imediatamente."
}

Use os seguintes crit\xE9rios de prioridade:
- Urgente: Interrup\xE7\xE3o total de um setor inteiro, faturamento travado, servidor fora do ar, ou incidente cr\xEDtico de seguran\xE7a da informa\xE7\xE3o.
- Alta: Trabalho impedido por completo para um colaborador individual (computador que n\xE3o liga, conta AD bloqueada para diretor, sem internet no PC).
- M\xE9dia: Falhas parciais que causam lentid\xE3o ou dificultam o trabalho mas t\xEAm alternativa paliativa (impressora travando folhas, software lento).
- Baixa: D\xFAvidas de usabilidade, novas instala\xE7\xF5es de softwares secund\xE1rios, melhorias de infraestrutura ou consultas gerais.`;
      const parts = imagePart ? [imagePart, { text: promptText }] : [{ text: promptText }];
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: { parts },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: import_genai.Type.OBJECT,
            properties: {
              category: { type: import_genai.Type.STRING },
              priority: { type: import_genai.Type.STRING },
              reasoning: { type: import_genai.Type.STRING },
              suggestions: { type: import_genai.Type.STRING }
            },
            required: ["category", "priority", "reasoning", "suggestions"]
          }
        }
      });
      const resultText = response.text;
      if (resultText) {
        const data = JSON.parse(resultText);
        return {
          category: data.category || "Outros",
          priority: data.priority || "M\xE9dia",
          reasoning: data.reasoning || "Triagem autom\xE1tica inteligente executada pelo Gemini.",
          suggestions: data.suggestions || "Nenhuma sugest\xE3o de primeiros passos dispon\xEDvel."
        };
      }
    } catch (error) {
      console.warn(`[Gemini API] Tentativa ${attempt}/${maxAttempts} falhou:`, error?.message || error);
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1e3));
      }
    }
  }
  console.log("[Gemini API] Todas as tentativas falharam ou o modelo est\xE1 indispon\xEDvel temporariamente. Utilizando triagem local inteligente.");
  return defaultLocalTriage(title, description);
}
app.get("/config.js", (req, res) => {
  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || "";
  const gemini = process.env.GEMINI_API_KEY || "";
  res.setHeader("Content-Type", "application/javascript");
  res.send(`window.SUPABASE_CONFIG = {
  SUPABASE_URL: ${JSON.stringify(url)},
  SUPABASE_KEY: ${JSON.stringify(key)},
  GEMINI_API_KEY: ${JSON.stringify(gemini)}
};`);
});
app.all("/api/supabase-proxy/*", async (req, res) => {
  try {
    const { url: supabaseUrl, key: supabaseKey } = getBackendConfig();
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: "Supabase n\xE3o est\xE1 configurado no servidor." });
    }
    const targetPath = req.path.replace(/^\/api\/supabase-proxy/, "");
    const normalizedBase = supabaseUrl.endsWith("/") ? supabaseUrl.slice(0, -1) : supabaseUrl;
    const normalizedPath = targetPath.startsWith("/") ? targetPath : "/" + targetPath;
    const queryString = req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";
    const targetFullUrl = normalizedBase + normalizedPath + queryString;
    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") {
        const lowerKey = key.toLowerCase();
        if (["host", "connection", "accept-encoding", "origin", "referer", "host-header", "x-forwarded-for", "x-forwarded-proto", "x-forwarded-port", "cookie"].includes(lowerKey)) {
          continue;
        }
        headers[key] = value;
      }
    }
    headers["apikey"] = supabaseKey;
    if (req.headers["authorization"]) {
      headers["authorization"] = req.headers["authorization"];
    } else {
      headers["authorization"] = `Bearer ${supabaseKey}`;
    }
    let body = void 0;
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method || "")) {
      if (req.body && typeof req.body === "object") {
        body = JSON.stringify(req.body);
      } else {
        body = req.body;
      }
    }
    const response = await fetch(targetFullUrl, {
      method: req.method,
      headers,
      body
    });
    res.status(response.status);
    const responseHeadersToForward = ["content-type", "content-range", "preference-applied"];
    responseHeadersToForward.forEach((headerName) => {
      const headerVal = response.headers.get(headerName);
      if (headerVal) {
        res.setHeader(headerName, headerVal);
      }
    });
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const json = await response.json();
      return res.json(json);
    } else {
      const text = await response.text();
      return res.send(text);
    }
  } catch (error) {
    console.error("[Supabase Proxy Error]:", error);
    return res.status(500).json({ error: "Erro ao intermediar requisi\xE7\xE3o para o Supabase", message: error.message });
  }
});
app.get("/api/supabase/status", async (req, res) => {
  try {
    const status = await testSupabaseConnection();
    res.json({
      configured: isSupabaseConfigured(),
      connected: status.connected,
      error: status.error || null
    });
  } catch (error) {
    res.json({
      configured: isSupabaseConfigured(),
      connected: false,
      error: error.message || "Erro desconhecido ao obter status do Supabase"
    });
  }
});
app.get("/api/supabase/sql", (req, res) => {
  res.setHeader("Content-Type", "text/plain");
  res.send(SUPABASE_SQL_SCHEMA);
});
app.post("/api/supabase/sync", async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.status(400).json({ error: "Supabase n\xE3o est\xE1 configurado. Por favor, adicione as credenciais no painel de Secrets." });
    }
    const connection = await testSupabaseConnection();
    if (!connection.connected) {
      return res.status(400).json({ error: connection.error || "Supabase n\xE3o p\xF4de se conectar." });
    }
    const localUsers = await loadUsers();
    const localTickets = await loadTickets();
    const success = await seedSupabaseData(localUsers, localTickets);
    if (success) {
      res.json({ message: "Dados sincronizados com sucesso para o Supabase!" });
    } else {
      res.status(500).json({ error: "Erro ao tentar sincronizar e persistir dados no Supabase. Verifique se as tabelas existem." });
    }
  } catch (error) {
    res.status(500).json({ error: error.message || "Erro desconhecido durante sincroniza\xE7\xE3o." });
  }
});
app.post("/api/supabase/pull", async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.status(400).json({ error: "Supabase n\xE3o est\xE1 configurado. Por favor, adicione as credenciais no painel de Secrets." });
    }
    const connection = await testSupabaseConnection();
    if (!connection.connected) {
      return res.status(400).json({ error: connection.error || "Supabase n\xE3o p\xF4de se conectar." });
    }
    const supabaseUsers = await getSupabaseUsers();
    const supabaseTickets = await getSupabaseTickets();
    if (supabaseUsers === null || supabaseTickets === null) {
      return res.status(500).json({ error: "Erro ao tentar obter dados do Supabase. Verifique as tabelas." });
    }
    const securedUsers = supabaseUsers.map((u) => ({
      ...u,
      password: u.password ? hashPassword2(u.password) : void 0
    }));
    import_fs2.default.writeFileSync(USERS_FILE, JSON.stringify(securedUsers, null, 2), "utf-8");
    import_fs2.default.writeFileSync(DB_FILE, JSON.stringify(supabaseTickets, null, 2), "utf-8");
    res.json({
      message: "Dados importados do Supabase com sucesso!",
      usersCount: securedUsers.length,
      ticketsCount: supabaseTickets.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Erro desconhecido durante importa\xE7\xE3o de dados." });
  }
});
app.post("/api/heartbeat", (req, res) => {
  const { email } = req.body;
  if (email && typeof email === "string") {
    activeUsers.set(email.toLowerCase().trim(), Date.now());
  }
  res.json({ status: "ok" });
});
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "E-mail e senha s\xE3o obrigat\xF3rios para realizar o login." });
    }
    if (isSupabaseConfigured()) {
      const client = getSupabaseClient();
      if (client) {
        try {
          const emailLower = email.trim().toLowerCase();
          console.log(`[Supabase Login] Procurando usu\xE1rio na tabela 'users' para o e-mail: ${emailLower}`);
          const { data: dbUser, error: dbError } = await client.from("users").select("*").eq("email", emailLower).maybeSingle();
          if (dbError) {
            console.error("[Supabase Login] Erro ao consultar tabela 'users':", dbError.message);
          } else if (dbUser) {
            console.log(`[Supabase Login] Usu\xE1rio encontrado na tabela 'users': ${dbUser.name} (${dbUser.role})`);
            const storedPass = dbUser.password || "";
            const isMatch = storedPass === password || storedPass === hashPassword2(password);
            if (isMatch) {
              let mustChange2 = true;
              if (dbUser.must_change_password === false) {
                mustChange2 = false;
              } else if (dbUser.must_change_password === void 0 || dbUser.must_change_password === null) {
                try {
                  const localUsers = await loadUsers();
                  const cached = localUsers.find((u) => u.email.toLowerCase() === emailLower);
                  mustChange2 = cached ? cached.mustChangePassword !== false : false;
                } catch {
                  mustChange2 = false;
                }
              }
              const defaultHash = initialPasswordHashes2.get(emailLower);
              if (defaultHash && storedPass !== defaultHash) {
                mustChange2 = false;
              }
              const loggedUser = {
                id: dbUser.id,
                name: dbUser.name,
                email: dbUser.email,
                password: dbUser.password,
                department: dbUser.department,
                role: dbUser.role,
                mustChangePassword: mustChange2
              };
              try {
                const localUsers = await loadUsers();
                if (!localUsers.some((u) => u.email.toLowerCase() === emailLower)) {
                  localUsers.push(loggedUser);
                  import_fs2.default.writeFileSync(USERS_FILE, JSON.stringify(localUsers, null, 2), "utf-8");
                }
              } catch (cacheErr) {
                console.error("[Supabase Login] Falha ao atualizar cache local do usu\xE1rio:", cacheErr);
              }
              activeUsers.set(emailLower, Date.now());
              return res.json({
                id: loggedUser.id,
                name: loggedUser.name,
                email: loggedUser.email,
                department: loggedUser.department,
                role: loggedUser.role,
                mustChangePassword: mustChange2
              });
            } else {
              return res.status(401).json({ error: "Senha de acesso incorreta." });
            }
          }
          console.log(`[Supabase Login] N\xE3o encontrado na tabela 'users'. Tentando login via Supabase Auth...`);
          const { data: authData, error: authError } = await client.auth.signInWithPassword({
            email,
            password
          });
          if (!authError && authData.user) {
            const { data: profile, error: profileErr } = await client.from("users").select("*").eq("email", emailLower).maybeSingle();
            if (profile) {
              activeUsers.set(emailLower, Date.now());
              let mustChange2 = true;
              if (profile.must_change_password === false) {
                mustChange2 = false;
              } else if (profile.must_change_password === void 0 || profile.must_change_password === null) {
                try {
                  const localUsers = await loadUsers();
                  const cached = localUsers.find((u) => u.email.toLowerCase() === emailLower);
                  mustChange2 = cached ? cached.mustChangePassword !== false : false;
                } catch {
                  mustChange2 = false;
                }
              }
              const defaultHash = initialPasswordHashes2.get(emailLower);
              if (defaultHash && profile.password && profile.password !== defaultHash) {
                mustChange2 = false;
              }
              return res.json({
                id: profile.id,
                name: profile.name,
                email: profile.email,
                department: profile.department,
                role: profile.role,
                mustChangePassword: mustChange2
              });
            } else {
              const derivedName = email.split("@")[0].split(/[\._\-]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
              const isTechEmail = emailLower.includes("ti") || emailLower.includes("suporte") || emailLower.includes("admin") || emailLower.includes("tech") || emailLower.includes("tecnico") || emailLower.includes("daniel");
              const newUserProfile = {
                id: authData.user.id,
                name: derivedName || "Novo Colaborador",
                email: email.toLowerCase(),
                password,
                department: isTechEmail ? "TI" : "Financeiro",
                role: isTechEmail ? "tecnico" : "colaborador",
                mustChangePassword: true
              };
              await saveSupabaseUser(newUserProfile);
              activeUsers.set(emailLower, Date.now());
              return res.json({
                id: newUserProfile.id,
                name: newUserProfile.name,
                email: newUserProfile.email,
                department: newUserProfile.department,
                role: newUserProfile.role,
                mustChangePassword: true
              });
            }
          } else {
            console.log("[Supabase Login] Supabase Auth falhou ou usu\xE1rio ausente:", authError?.message);
          }
        } catch (authExc) {
          console.error("[Supabase Login] Exce\xE7\xE3o geral de login do Supabase:", authExc);
        }
      }
    }
    const users = await loadUsers();
    const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      return res.status(401).json({ error: "E-mail de colaborador n\xE3o cadastrado." });
    }
    if (user.password !== hashPassword2(password)) {
      return res.status(401).json({ error: "Senha de acesso incorreta." });
    }
    let mustChange = user.mustChangePassword !== false;
    const emailLowerFallback = email.trim().toLowerCase();
    const defaultHashFallback = initialPasswordHashes2.get(emailLowerFallback);
    if (defaultHashFallback && user.password && user.password !== defaultHashFallback) {
      mustChange = false;
    }
    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      department: user.department,
      role: user.role,
      mustChangePassword: mustChange
    };
    activeUsers.set(email.toLowerCase().trim(), Date.now());
    res.json(safeUser);
  } catch (error) {
    console.error("Erro no login:", error);
    res.status(500).json({ error: "Erro interno ao processar a autentica\xE7\xE3o." });
  }
});
app.post("/api/change-password", async (req, res) => {
  try {
    const { email, oldPassword, newPassword } = req.body;
    if (!email || !newPassword) {
      return res.status(400).json({ error: "E-mail e nova senha s\xE3o obrigat\xF3rios." });
    }
    const users = await loadUsers();
    const index = users.findIndex((u) => u.email.toLowerCase() === email.toLowerCase());
    if (index === -1) {
      return res.status(404).json({ error: "Colaborador n\xE3o encontrado." });
    }
    const user = users[index];
    if (oldPassword && user.password) {
      if (user.password !== hashPassword2(oldPassword)) {
        return res.status(400).json({ error: "A senha atual informada est\xE1 incorreta." });
      }
    }
    user.password = newPassword;
    user.mustChangePassword = false;
    user.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    users[index] = user;
    await saveUsers(users, user);
    if (isSupabaseConfigured()) {
      const client = getSupabaseClient();
      if (client) {
        try {
          const updatePayload = {
            password: hashPassword2(newPassword),
            must_change_password: false
          };
          let { error: updateError } = await client.from("users").update(updatePayload).eq("email", email.trim().toLowerCase());
          if (updateError && (updateError.code === "PGRST204" || updateError.message?.includes("must_change_password") || updateError.message?.includes("column"))) {
            console.warn("[Supabase Change Password] Coluna 'must_change_password' n\xE3o encontrada na tabela 'users'. Tentando atualizar apenas a senha.");
            delete updatePayload.must_change_password;
            const retryResult = await client.from("users").update(updatePayload).eq("email", email.trim().toLowerCase());
            updateError = retryResult.error;
          }
          if (updateError) {
            console.error("[Supabase Change Password] Erro ao atualizar no Supabase:", updateError.message);
          } else {
            console.log("[Supabase Change Password] Senha atualizada com sucesso no Supabase para:", email);
          }
        } catch (dbErr) {
          console.error("[Supabase Change Password] Falha ao sincronizar com Supabase:", dbErr.message);
        }
      }
    }
    res.json({ success: true, message: "Sua senha pessoal foi estabelecida com sucesso." });
  } catch (error) {
    console.error("Erro ao alterar senha:", error);
    res.status(500).json({ error: "Erro interno ao redefinir a sua senha." });
  }
});
app.get("/api/users", async (req, res) => {
  try {
    const users = await loadUsers();
    const now = Date.now();
    const usersWithStatus = users.map((u) => {
      const emailLower = (u.email || "").toLowerCase().trim();
      const isOnline = activeUsers.has(emailLower) && now - activeUsers.get(emailLower) < 1e4;
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        department: u.department,
        role: u.role,
        isOnline
      };
    });
    res.json(usersWithStatus);
  } catch (error) {
    console.error("Erro ao listar colaboradores:", error);
    res.status(500).json({ error: "Erro interno ao carregar colaboradores." });
  }
});
app.post("/api/users", async (req, res) => {
  try {
    const { name, email, password, department, role } = req.body;
    if (!name || !email || !password || !department || !role) {
      return res.status(400).json({ error: "Todos os campos (nome, email, senha, departamento, cargo) s\xE3o obrigat\xF3rios." });
    }
    const users = await loadUsers();
    const emailExists = users.some((u) => u.email.toLowerCase() === email.toLowerCase());
    if (emailExists) {
      return res.status(400).json({ error: "Este endere\xE7o de e-mail j\xE1 est\xE1 cadastrado no sistema." });
    }
    const nextId = "u" + (Math.max(...users.map((u) => {
      const parsedId = parseInt(u.id.replace("u", ""));
      return isNaN(parsedId) ? 0 : parsedId;
    })) + 1).toString();
    const newUser = {
      id: nextId,
      name,
      email,
      password: hashPassword2(password),
      department,
      role,
      mustChangePassword: true
    };
    users.push(newUser);
    await saveUsers(users, newUser);
    const safeUser = {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      department: newUser.department,
      role: newUser.role,
      mustChangePassword: true
    };
    res.status(201).json(safeUser);
  } catch (error) {
    console.error("Erro ao cadastrar usu\xE1rio:", error);
    res.status(500).json({ error: "Erro interno ao processar o cadastro de colaborador." });
  }
});
app.put("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, department, role } = req.body;
    const users = await loadUsers();
    const index = users.findIndex((u) => u.id === id);
    if (index === -1) {
      return res.status(404).json({ error: "Colaborador n\xE3o encontrado." });
    }
    if (email) {
      const emailExists = users.some((u) => u.id !== id && u.email.toLowerCase() === email.toLowerCase());
      if (emailExists) {
        return res.status(400).json({ error: "Este e-mail j\xE1 est\xE1 em uso por outro colaborador." });
      }
    }
    const currentUser = users[index];
    const updatedUser = {
      id,
      name: name || currentUser.name,
      email: email || currentUser.email,
      password: password && password.trim() !== "" ? hashPassword2(password) : currentUser.password,
      department: department || currentUser.department,
      role: role || currentUser.role
    };
    users[index] = updatedUser;
    await saveUsers(users, updatedUser);
    const safeUser = {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      department: updatedUser.department,
      role: updatedUser.role
    };
    res.json(safeUser);
  } catch (error) {
    console.error("Erro ao atualizar colaborador:", error);
    res.status(500).json({ error: "Erro interno ao processar a atualiza\xE7\xE3o." });
  }
});
app.delete("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const users = await loadUsers();
    const index = users.findIndex((u) => u.id === id);
    if (index === -1) {
      return res.status(404).json({ error: "Colaborador n\xE3o encontrado." });
    }
    const userToDelete = users[index];
    const techCount = users.filter((u) => u.role === "tecnico").length;
    if (userToDelete.role === "tecnico" && techCount <= 1) {
      return res.status(400).json({ error: "N\xE3o \xE9 permitido remover o \xFAnico t\xE9cnico de TI cadastrado para n\xE3o bloquear o acesso." });
    }
    if (isSupabaseConfigured()) {
      await deleteSupabaseUser(id);
    }
    users.splice(index, 1);
    await saveUsers(users);
    res.json({ message: `Colaborador ${userToDelete.name} removido com sucesso.` });
  } catch (error) {
    console.error("Erro ao remover colaborador:", error);
    res.status(500).json({ error: "Erro interno ao remover colaborador de TI." });
  }
});
app.get("/api/tickets", async (req, res) => {
  try {
    const tickets = await loadTickets();
    tickets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(tickets);
  } catch (error) {
    console.error("Erro ao listar chamados:", error);
    res.status(500).json({ error: "Erro interno ao carregar chamados." });
  }
});
app.post("/api/tickets", async (req, res) => {
  try {
    const { title, description, requesterName, requesterDepartment, screenshot, projectDeadline } = req.body;
    if (!title || !description || !requesterName || !requesterDepartment) {
      return res.status(400).json({ error: "T\xEDtulo, descri\xE7\xE3o, solicitante e departamento s\xE3o obrigat\xF3rios." });
    }
    const triage = defaultLocalTriage(title, description);
    let hoursToAdd = 48;
    if (triage.priority === "Urgente") hoursToAdd = 2;
    else if (triage.priority === "Alta") hoursToAdd = 8;
    else if (triage.priority === "M\xE9dia") hoursToAdd = 24;
    const tickets = await loadTickets();
    const maxId = tickets.reduce((max, t) => {
      if (!t || !t.id) return max;
      const idNum = parseInt(t.id);
      return isNaN(idNum) ? max : Math.max(max, idNum);
    }, 1e3);
    const nextId = (maxId + 1).toString();
    const newTicket = {
      id: nextId,
      title,
      description,
      category: triage.category,
      priority: triage.priority,
      status: "Aberto",
      requesterName,
      requesterDepartment,
      assignedTo: null,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      slaLimit: new Date(Date.now() + 36e5 * hoursToAdd).toISOString(),
      aiCategory: "Analisando...",
      aiPriority: "Analisando...",
      aiReasoning: "A intelig\xEAncia artificial est\xE1 analisando o seu chamado em segundo plano...",
      aiSuggestions: "Aguardando conclus\xE3o da an\xE1lise do Gemini...",
      screenshot: screenshot || void 0,
      projectDeadline: projectDeadline || void 0,
      comments: [
        {
          id: `sys-${Date.now()}`,
          authorName: "IA Triagem GRAN7 HELP",
          authorRole: "ai",
          content: "Iniciando an\xE1lise inteligente do chamado...",
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }
      ]
    };
    tickets.push(newTicket);
    await saveTickets(tickets, newTicket);
    res.status(201).json(newTicket);
    (async () => {
      try {
        console.log(`[IA] Iniciando triagem ass\xEDncrona para o chamado #${nextId}`);
        const geminiTriage = await triageWithGemini(title, description, screenshot);
        const currentTickets = await loadTickets();
        const ticketToUpdate = currentTickets.find((t) => t.id === nextId);
        if (ticketToUpdate) {
          ticketToUpdate.category = geminiTriage.category;
          ticketToUpdate.priority = geminiTriage.priority;
          ticketToUpdate.aiCategory = geminiTriage.category;
          ticketToUpdate.aiPriority = geminiTriage.priority;
          ticketToUpdate.aiReasoning = geminiTriage.reasoning;
          ticketToUpdate.aiSuggestions = geminiTriage.suggestions;
          ticketToUpdate.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
          let newHoursToAdd = 48;
          if (geminiTriage.priority === "Urgente") newHoursToAdd = 2;
          else if (geminiTriage.priority === "Alta") newHoursToAdd = 8;
          else if (geminiTriage.priority === "M\xE9dia") newHoursToAdd = 24;
          ticketToUpdate.slaLimit = new Date(new Date(ticketToUpdate.createdAt).getTime() + 36e5 * newHoursToAdd).toISOString();
          ticketToUpdate.comments = ticketToUpdate.comments.map((c) => {
            if (c.authorRole === "ai" && c.content === "Iniciando an\xE1lise inteligente do chamado...") {
              return {
                ...c,
                content: `Chamado classificado automaticamente pelo Gemini.

**Justificativa:** ${geminiTriage.reasoning}`,
                timestamp: (/* @__PURE__ */ new Date()).toISOString()
              };
            }
            return c;
          });
          await saveTickets(currentTickets, ticketToUpdate);
          console.log(`[IA] Triagem ass\xEDncrona conclu\xEDda com sucesso para o chamado #${nextId}`);
        }
      } catch (err) {
        console.error(`[IA] Falha na triagem ass\xEDncrona do chamado #${nextId}:`, err);
        try {
          const currentTickets = await loadTickets();
          const ticketToUpdate = currentTickets.find((t) => t.id === nextId);
          if (ticketToUpdate) {
            ticketToUpdate.aiCategory = ticketToUpdate.category;
            ticketToUpdate.aiPriority = ticketToUpdate.priority;
            ticketToUpdate.aiReasoning = "Triagem autom\xE1tica local realizada com sucesso devido \xE0 instabilidade tempor\xE1ria no servi\xE7o de IA.";
            ticketToUpdate.aiSuggestions = "1. Prossiga com o fluxo normal de atendimento.\n2. Revise categoria/prioridade manualmente se necess\xE1rio.";
            ticketToUpdate.comments = ticketToUpdate.comments.map((c) => {
              if (c.authorRole === "ai" && c.content === "Iniciando an\xE1lise inteligente do chamado...") {
                return {
                  ...c,
                  content: `Triagem local aplicada com sucesso.`,
                  timestamp: (/* @__PURE__ */ new Date()).toISOString()
                };
              }
              return c;
            });
            await saveTickets(currentTickets, ticketToUpdate);
          }
        } catch (e) {
          console.error("[IA] Falha ao salvar dados de fallback:", e);
        }
      }
    })();
  } catch (error) {
    console.error("Erro ao criar chamado:", error);
    res.status(500).json({ error: "Erro interno ao processar a cria\xE7\xE3o de chamado." });
  }
});
function formatDuration(ms) {
  if (ms < 0) ms = 0;
  const seconds = Math.floor(ms / 1e3);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes} min e ${seconds % 60} seg`;
  }
  return `${seconds} segundos`;
}
app.patch("/api/tickets/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, priority, category, assignedTo, projectDeadline, requesterUser, requesterName, requesterDepartment } = req.body;
    const tickets = await loadTickets();
    const index = tickets.findIndex((t) => t.id === id);
    if (index === -1) {
      return res.status(404).json({ error: "Chamado n\xE3o encontrado." });
    }
    const oldTicket = tickets[index];
    const updatedTicket = { ...oldTicket };
    if (oldTicket.assignedTo) {
      if (requesterUser && requesterUser !== oldTicket.assignedTo) {
        const isChangingAssignedTo = assignedTo !== void 0 && assignedTo !== oldTicket.assignedTo;
        const isChangingPriority = priority !== void 0 && priority !== oldTicket.priority;
        const isChangingStatus = status !== void 0 && status !== oldTicket.status;
        const isChangingCategory = category !== void 0 && category !== oldTicket.category;
        const isChangingDeadline = projectDeadline !== void 0 && projectDeadline !== oldTicket.projectDeadline;
        const isChangingRequester = requesterName !== void 0 && requesterName !== oldTicket.requesterName;
        if (isChangingAssignedTo || isChangingPriority || isChangingStatus || isChangingCategory || isChangingDeadline || isChangingRequester) {
          return res.status(403).json({
            error: `Este chamado j\xE1 est\xE1 atribu\xEDdo a ${oldTicket.assignedTo}. Apenas o t\xE9cnico respons\xE1vel pode alterar suas informa\xE7\xF5es, transferi-lo ou finaliz\xE1-lo.`
          });
        }
      }
    }
    let changeLog = [];
    if (requesterName && requesterName !== oldTicket.requesterName) {
      updatedTicket.requesterName = requesterName;
      changeLog.push(`Solicitante alterado de **${oldTicket.requesterName}** para **${requesterName}**`);
    }
    if (requesterDepartment && requesterDepartment !== oldTicket.requesterDepartment) {
      updatedTicket.requesterDepartment = requesterDepartment;
    }
    if (projectDeadline !== void 0 && projectDeadline !== oldTicket.projectDeadline) {
      updatedTicket.projectDeadline = projectDeadline || void 0;
      if (projectDeadline) {
        const formattedDate = projectDeadline.split("-").reverse().join("/");
        changeLog.push(`Prazo limite do projeto definido para **${formattedDate}**`);
      } else {
        changeLog.push(`Prazo limite do projeto removido`);
      }
    }
    if (status && status !== oldTicket.status) {
      updatedTicket.status = status;
      changeLog.push(`Status alterado de **${oldTicket.status}** para **${status}**`);
      if (status === "Resolvido") {
        const firstAssignmentComment = oldTicket.comments.find(
          (c) => c.authorRole === "system" && c.content.includes("Respons\xE1vel atribu\xEDdo:")
        );
        if (firstAssignmentComment) {
          const durationMs = Date.now() - new Date(firstAssignmentComment.timestamp).getTime();
          const durationText = formatDuration(durationMs);
          changeLog.push(`Tempo total de atendimento: **${durationText}**`);
        } else {
          const durationMs = Date.now() - new Date(oldTicket.createdAt).getTime();
          const durationText = formatDuration(durationMs);
          changeLog.push(`Tempo total desde a abertura: **${durationText}**`);
        }
      }
    }
    if (priority && priority !== oldTicket.priority) {
      updatedTicket.priority = priority;
      changeLog.push(`Prioridade alterada de **${oldTicket.priority}** para **${priority}**`);
      let hoursToAdd = 48;
      if (priority === "Urgente") hoursToAdd = 2;
      else if (priority === "Alta") hoursToAdd = 8;
      else if (priority === "M\xE9dia") hoursToAdd = 24;
      updatedTicket.slaLimit = new Date(new Date(oldTicket.createdAt).getTime() + 36e5 * hoursToAdd).toISOString();
    }
    if (category && category !== oldTicket.category) {
      updatedTicket.category = category;
      changeLog.push(`Categoria alterada de **${oldTicket.category}** para **${category}**`);
    }
    if (assignedTo !== void 0 && assignedTo !== oldTicket.assignedTo) {
      if (oldTicket.assignedTo && assignedTo) {
        changeLog.push(`Chamado transferido de **${oldTicket.assignedTo}** para **${assignedTo}** por **${requesterUser || "T\xE9cnico"}**`);
        updatedTicket.assignedTo = assignedTo;
      } else if (assignedTo) {
        changeLog.push(`Respons\xE1vel atribu\xEDdo: **${assignedTo}**`);
        updatedTicket.assignedTo = assignedTo;
        if (oldTicket.status === "Aberto") {
          updatedTicket.status = "Em Atendimento";
          changeLog.push(`Status alterado automaticamente para **Em Atendimento**`);
        }
      } else {
        changeLog.push(`Respons\xE1vel removido: **${oldTicket.assignedTo}**`);
        updatedTicket.assignedTo = null;
      }
    }
    if (changeLog.length > 0) {
      updatedTicket.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      updatedTicket.comments.push({
        id: `sys-log-${Date.now()}`,
        authorName: "Sistema GRAN7 HELP",
        authorRole: "system",
        content: changeLog.join("\n"),
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
      tickets[index] = updatedTicket;
      await saveTickets(tickets, updatedTicket);
    }
    res.json(updatedTicket);
  } catch (error) {
    console.error("Erro ao atualizar chamado:", error);
    res.status(500).json({ error: "Erro interno ao atualizar chamado." });
  }
});
app.post("/api/tickets/:id/comments", async (req, res) => {
  try {
    const { id } = req.params;
    const { authorName, authorRole, content, attachmentUrl, attachmentName } = req.body;
    if (!authorName || !authorRole || !content) {
      return res.status(400).json({ error: "Autor, papel (role) e conte\xFAdo da mensagem s\xE3o obrigat\xF3rios." });
    }
    const tickets = await loadTickets();
    const index = tickets.findIndex((t) => t.id === id);
    if (index === -1) {
      return res.status(404).json({ error: "Chamado n\xE3o encontrado." });
    }
    const ticket = tickets[index];
    const newComment = {
      id: `c-${Date.now()}`,
      authorName,
      authorRole,
      content,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      ...attachmentUrl ? { attachmentUrl } : {},
      ...attachmentName ? { attachmentName } : {}
    };
    ticket.comments.push(newComment);
    ticket.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    tickets[index] = ticket;
    await saveTickets(tickets, ticket);
    res.status(201).json(newComment);
  } catch (error) {
    console.error("Erro ao adicionar coment\xE1rio:", error);
    res.status(500).json({ error: "Erro interno ao adicionar coment\xE1rio." });
  }
});
app.delete("/api/tickets/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = req.headers["x-user-role"];
    const userName = req.headers["x-user-name"];
    if (userRole !== "tecnico") {
      return res.status(403).json({ error: "Apenas colaboradores da equipe de TI podem apagar chamados." });
    }
    const tickets = await loadTickets();
    const index = tickets.findIndex((t) => t.id === id);
    if (index === -1) {
      return res.status(404).json({ error: "Chamado n\xE3o encontrado." });
    }
    const ticket = tickets[index];
    if (!ticket.assignedTo || ticket.assignedTo !== userName) {
      return res.status(403).json({ error: "Apenas o t\xE9cnico respons\xE1vel por este chamado pode exclu\xED-lo." });
    }
    if (isSupabaseConfigured()) {
      await deleteSupabaseTicket(id);
    }
    tickets.splice(index, 1);
    await saveTickets(tickets);
    res.json({ success: true, message: "Chamado exclu\xEDdo com sucesso." });
  } catch (error) {
    console.error("Erro ao excluir chamado:", error);
    res.status(500).json({ error: "Erro interno ao excluir chamado." });
  }
});
app.post("/api/reset", async (req, res) => {
  try {
    if (isSupabaseConfigured()) {
      const tickets = await getSupabaseTickets();
      if (tickets) {
        for (const t of tickets) {
          await deleteSupabaseTicket(t.id);
        }
      }
      const users = await getSupabaseUsers();
      if (users) {
        for (const u of users) {
          await deleteSupabaseUser(u.id);
        }
      }
    }
    await saveTickets(DEFAULT_TICKETS);
    await saveUsers(DEFAULT_USERS);
    res.json({ message: "Banco de dados e lista de colaboradores reiniciados com sucesso." });
  } catch (error) {
    res.status(500).json({ error: error.message || "Erro ao resetar banco de dados." });
  }
});
if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  const startVite = async () => {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
    if (typeof PORT === "string") {
      app.listen(PORT, () => {
        console.log(`[NEXTHELP Backend] Server rodando em desenvolvimento no socket ${PORT}`);
      });
    } else {
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`[NEXTHELP Backend] Server rodando em desenvolvimento na porta ${PORT}`);
      });
    }
  };
  startVite();
} else {
  if (!process.env.VERCEL) {
    const distPath = import_path2.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path2.default.join(distPath, "index.html"));
    });
    if (typeof PORT === "string") {
      app.listen(PORT, () => {
        console.log(`[NEXTHELP Backend] Server rodando em produ\xE7\xE3o no socket ${PORT}`);
      });
    } else {
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`[NEXTHELP Backend] Server rodando em produ\xE7\xE3o na porta ${PORT}`);
      });
    }
  }
}
var server_default = app;
//# sourceMappingURL=server.cjs.map
