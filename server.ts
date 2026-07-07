import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import os from "os";
import { GoogleGenAI, Type } from "@google/genai";
import {
  isSupabaseConfigured,
  testSupabaseConnection,
  getSupabaseUsers,
  saveSupabaseUser,
  deleteSupabaseUser,
  getSupabaseTickets,
  saveSupabaseTicket,
  deleteSupabaseTicket,
  seedSupabaseData,
  SUPABASE_SQL_SCHEMA,
  getSupabaseClient,
  getBackendConfig
} from "./supabase-db";

// Dynamically read initial users and tickets configuration at runtime to avoid build errors on Vercel
let initialUsers: any[] = [];
try {
  const usersPath = path.join(process.cwd(), "users-db.json");
  if (fs.existsSync(usersPath)) {
    initialUsers = JSON.parse(fs.readFileSync(usersPath, "utf-8"));
  }
} catch (err) {
  console.warn("Failed to load initial users in server.ts:", err);
}

let initialTickets: any[] = [];
try {
  const ticketsPath = path.join(process.cwd(), "tickets-db.json");
  if (fs.existsSync(ticketsPath)) {
    initialTickets = JSON.parse(fs.readFileSync(ticketsPath, "utf-8"));
  }
} catch (err) {
  console.warn("Failed to load initial tickets in server.ts:", err);
}

const app = express();

// Detect if running inside the AI Studio sandbox.
// In the AI Studio container, we must strictly bind to port 3000 (nginx proxy expects 3000).
// In other hosts like Hostinger or generic Node servers, we should read process.env.PORT.
const isAIStudio = !!process.env.APPLET_ID || process.env.DISABLE_HMR === "true";
const PORT: string | number = (!isAIStudio && process.env.PORT)
  ? (isNaN(Number(process.env.PORT)) ? process.env.PORT : Number(process.env.PORT))
  : 3000;
const DB_FILE = path.join(os.tmpdir(), "tickets-db.json");
const USERS_FILE = path.join(os.tmpdir(), "users-db.json");

// Map to track the last activity timestamp (Date.now()) of logged-in users by email
const activeUsers = new Map<string, number>();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

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
  console.error("Failed to load initial password hashes in server.ts:", err);
}

app.use("/assets", express.static(path.join(process.cwd(), "assets")));

// Secure password hashing helper
function hashPassword(password: string): string {
  if (!password) return "";
  // Check if already a 64-character hex SHA-256 string
  if (/^[a-f0-9]{64}$/i.test(password)) {
    return password;
  }
  return crypto.createHash("sha256").update(password).digest("hex");
}

interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  department: string;
  role: "colaborador" | "tecnico";
  mustChangePassword?: boolean;
  updatedAt?: string;
}

// Ticket Type Definition
interface Comment {
  id: string;
  authorName: string;
  authorRole: "colaborador" | "tecnico" | "system" | "ai";
  content: string;
  timestamp: string;
}

interface Ticket {
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

// Memory cache for Supabase reads to minimize egress/bandwidth and avoid free tier overage limits
let cachedTickets: Ticket[] | null = null;
let lastTicketsCacheTime = 0;
let cachedUsers: User[] | null = null;
let lastUsersCacheTime = 0;

const CACHE_TTL_MS = 15000; // 15 seconds Cache TTL

// Helper to load/save database
async function loadTickets(): Promise<Ticket[]> {
  const now = Date.now();
  if (cachedTickets !== null && (now - lastTicketsCacheTime < CACHE_TTL_MS)) {
    return cachedTickets;
  }

  let tickets: any = null;

  if (isSupabaseConfigured()) {
    try {
      tickets = await getSupabaseTickets();
      if (tickets !== null && Array.isArray(tickets)) {
        // Also save to local JSON file as a cache/backup
        try {
          fs.writeFileSync(DB_FILE, JSON.stringify(tickets, null, 2), "utf-8");
        } catch (e) {}
        
        cachedTickets = tickets;
        lastTicketsCacheTime = now;
        return tickets;
      }
    } catch (error) {
      console.warn("Erro ao carregar chamados do Supabase, usando arquivo local:", error);
    }
  }

  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, "utf-8").trim();
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
  // Initialize with static seed data if file doesn't exist or is invalid
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(initialTickets, null, 2), "utf-8");
  } catch (e) {}
  
  const seed = initialTickets as any as Ticket[];
  cachedTickets = seed;
  lastTicketsCacheTime = now;
  return seed;
}

async function saveTickets(tickets: Ticket[], singleChangedTicket?: Ticket) {
  // Update in-memory cache immediately
  cachedTickets = tickets;
  lastTicketsCacheTime = Date.now();

  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(tickets, null, 2), "utf-8");
  } catch (error) {
    console.error("Erro ao salvar banco de dados de chamados local:", error);
  }

  if (isSupabaseConfigured()) {
    try {
      if (singleChangedTicket) {
        // High-performance selective sync for the changed ticket only
        await saveSupabaseTicket(singleChangedTicket);
      } else {
        // Fallback full sync when no specific ticket is specified
        for (const ticket of tickets) {
          await saveSupabaseTicket(ticket);
        }
      }
    } catch (error) {
      console.error("Erro ao sincronizar chamados com o Supabase:", error);
    }
  }
}

// Helper to load/save users database
async function loadUsers(): Promise<User[]> {
  const now = Date.now();
  if (cachedUsers !== null && (now - lastUsersCacheTime < CACHE_TTL_MS)) {
    return cachedUsers;
  }

  let localUsers: User[] = [];
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, "utf-8").trim();
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          localUsers = parsed;
        }
      }
    }
  } catch (error) {
    console.error("Erro ao ler banco de dados de usuários local:", error);
  }

  // Fallback to static seed data if empty
  if (localUsers.length === 0) {
    localUsers = JSON.parse(JSON.stringify(initialUsers)) as any as User[];
  }

  // Automatically migrate/secure any plain-text passwords in memory
  let needsRewrite = false;
  localUsers = localUsers.map(u => {
    if (u.password && !/^[a-f0-9]{64}$/i.test(u.password)) {
      u.password = hashPassword(u.password);
      needsRewrite = true;
    }
    return u;
  });

  if (isSupabaseConfigured()) {
    try {
      const supabaseUsers = await getSupabaseUsers();
      if (supabaseUsers !== null) {
        // Merge them: keep all from Supabase, and add any local cached ones that are not in Supabase by email
        let merged = [...supabaseUsers];
        for (const localU of localUsers) {
          const match = merged.find(u => u.email.toLowerCase() === localU.email.toLowerCase());
          if (!match) {
            merged.push(localU);
          } else {
            if (match.mustChangePassword === undefined) {
              match.mustChangePassword = localU.mustChangePassword !== false;
            }
          }
        }

        // Secure all passwords in the merged array
        merged = merged.map(u => {
          if (u.password && !/^[a-f0-9]{64}$/i.test(u.password)) {
            u.password = hashPassword(u.password);
            needsRewrite = true;
          }
          return u;
        });

        if (needsRewrite) {
          try {
            fs.writeFileSync(USERS_FILE, JSON.stringify(merged, null, 2), "utf-8");
          } catch (e) {}
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
      fs.writeFileSync(USERS_FILE, JSON.stringify(localUsers, null, 2), "utf-8");
    } catch (e) {}
  }

  cachedUsers = localUsers;
  lastUsersCacheTime = now;
  return localUsers;
}

async function saveUsers(users: User[], changedUser?: User | User[]) {
  // Ensure we hash passwords before saving them on disk
  const securedUsers = users.map(u => ({
    ...u,
    password: u.password ? hashPassword(u.password) : undefined
  }));

  // Update in-memory cache immediately
  cachedUsers = securedUsers;
  lastUsersCacheTime = Date.now();

  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(securedUsers, null, 2), "utf-8");
  } catch (error) {
    console.error("Erro ao salvar banco de dados de usuários local:", error);
  }

  if (isSupabaseConfigured()) {
    try {
      if (changedUser) {
        const toSync = Array.isArray(changedUser) ? changedUser : [changedUser];
        for (const user of toSync) {
          const success = await saveSupabaseUser(user);
          if (success) {
            console.log(`[Supabase Sync] Usuário ${user.email} sincronizado com sucesso.`);
          } else {
            console.error(`[Supabase Sync] Falha ao sincronizar usuário ${user.email}.`);
          }
        }
      } else {
        // Fallback or full sync (limit loop slowdowns)
        console.log(`[Supabase Sync] Sincronizando todos os ${users.length} usuários...`);
        for (const user of users) {
          await saveSupabaseUser(user);
        }
      }
    } catch (error) {
      console.error("Erro ao sincronizar colaboradores com o Supabase:", error);
    }
  }
}

// Local Keyword-based Triage Fallback
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

// AI Triage via Gemini API
async function triageWithGemini(title: string, description: string, screenshot?: string) {
  const { gemini: geminiKey } = getBackendConfig();
  if (!geminiKey) {
    console.log("Gemini API Key não configurada. Usando triagem padrão local.");
    return defaultLocalTriage(title, description);
  }

  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

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
Analise este chamado aberto por um colaborador e classifique-o com precisão técnica.${imagePart ? " Analise também a imagem/print em anexo que o colaborador enviou como evidência do problema." : ""}

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

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: { parts },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING },
              priority: { type: Type.STRING },
              reasoning: { type: Type.STRING },
              suggestions: { type: Type.STRING },
            },
            required: ["category", "priority", "reasoning", "suggestions"],
          },
        },
      });

      const resultText = response.text;
      if (resultText) {
        const data = JSON.parse(resultText);
        return {
          category: (data.category as Ticket["category"]) || "Outros",
          priority: (data.priority as Ticket["priority"]) || "Média",
          reasoning: data.reasoning || "Triagem automática inteligente executada pelo Gemini.",
          suggestions: data.suggestions || "Nenhuma sugestão de primeiros passos disponível.",
        };
      }
    } catch (error: any) {
      console.warn(`[Gemini API] Tentativa ${attempt}/${maxAttempts} falhou:`, error?.message || error);
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  console.log("[Gemini API] Todas as tentativas falharam ou o modelo está indisponível temporariamente. Utilizando triagem local inteligente.");
  return defaultLocalTriage(title, description);
}

// Route to dynamically serve config.js so self-hosted users can edit public/config.js and see changes instantly
app.get("/config.js", (req, res) => {
  const customPath = path.join(process.cwd(), "public", "config.js");
  if (fs.existsSync(customPath)) {
    res.setHeader("Content-Type", "application/javascript");
    return res.sendFile(customPath);
  }
  const distConfigPath = path.join(process.cwd(), "dist", "config.js");
  if (fs.existsSync(distConfigPath)) {
    res.setHeader("Content-Type", "application/javascript");
    return res.sendFile(distConfigPath);
  }
  res.setHeader("Content-Type", "application/javascript");
  res.send("// Dynamic configuration not found");
});

// Proxy route to secure and relay client requests to self-hosted Supabase instances (eliminates CORS / Mixed Content issues)
app.all("/api/supabase-proxy/*", async (req, res) => {
  try {
    const { url: supabaseUrl, key: supabaseKey } = getBackendConfig();
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: "Supabase não está configurado no servidor." });
    }

    // Extract target path from request path
    const targetPath = req.path.replace(/^\/api\/supabase-proxy/, "");
    
    // Construct target URL
    const normalizedBase = supabaseUrl.endsWith("/") ? supabaseUrl.slice(0, -1) : supabaseUrl;
    const normalizedPath = targetPath.startsWith("/") ? targetPath : "/" + targetPath;
    
    const queryString = req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";
    const targetFullUrl = normalizedBase + normalizedPath + queryString;

    // Filter headers to forward
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") {
        const lowerKey = key.toLowerCase();
        if (["host", "connection", "accept-encoding", "origin", "referer", "host-header", "x-forwarded-for", "x-forwarded-proto", "x-forwarded-port", "cookie"].includes(lowerKey)) {
          continue;
        }
        headers[key] = value;
      }
    }

    // Enforce correct credentials from backend
    headers["apikey"] = supabaseKey;
    if (req.headers["authorization"]) {
      headers["authorization"] = req.headers["authorization"] as string;
    } else {
      headers["authorization"] = `Bearer ${supabaseKey}`;
    }

    let body: any = undefined;
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method || "")) {
      if (req.body && typeof req.body === "object") {
        body = JSON.stringify(req.body);
      } else {
        body = req.body;
      }
    }

    const response = await fetch(targetFullUrl, {
      method: req.method,
      headers: headers,
      body: body,
    });

    res.status(response.status);

    // Copy essential response headers
    const responseHeadersToForward = ["content-type", "content-range", "preference-applied"];
    responseHeadersToForward.forEach(headerName => {
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
  } catch (error: any) {
    console.error("[Supabase Proxy Error]:", error);
    return res.status(500).json({ error: "Erro ao intermediar requisição para o Supabase", message: error.message });
  }
});

// REST API Endpoints

// Secure bulk ticket saving / upserting endpoint
app.post("/api/tickets/save", async (req, res) => {
  try {
    const ticket = req.body;
    if (!ticket || !ticket.id) {
      return res.status(400).json({ error: "Dados do chamado inválidos." });
    }
    const tickets = await loadTickets();
    const idx = tickets.findIndex(t => t.id === ticket.id);
    if (idx >= 0) {
      tickets[idx] = ticket;
    } else {
      tickets.push(ticket);
    }
    await saveTickets(tickets, ticket);
    res.json({ success: true, ticket });
  } catch (error) {
    console.error("Erro ao salvar chamado via API:", error);
    res.status(500).json({ error: "Erro interno ao salvar chamado." });
  }
});

// Secure bulk user saving / upserting endpoint
app.post("/api/users/save", async (req, res) => {
  try {
    const user = req.body;
    if (!user || !user.id) {
      return res.status(400).json({ error: "Dados do colaborador inválidos." });
    }
    const users = await loadUsers();
    const idx = users.findIndex(u => u.id === user.id);
    if (idx >= 0) {
      users[idx] = user;
    } else {
      users.push(user);
    }
    await saveUsers(users, user);
    res.json({ success: true, user });
  } catch (error) {
    console.error("Erro ao salvar colaborador via API:", error);
    res.status(500).json({ error: "Erro interno ao salvar colaborador." });
  }
});

// Secure client-side Gemini Triage API proxy
app.post("/api/triage", async (req, res) => {
  try {
    const { title, description, screenshot } = req.body;
    if (!title || !description) {
      return res.status(400).json({ error: "Título e descrição do chamado são obrigatórios para triagem." });
    }
    const triage = await triageWithGemini(title, description, screenshot);
    res.json(triage);
  } catch (error) {
    console.error("Erro ao processar triagem inteligente via API:", error);
    res.status(500).json({ error: "Erro interno ao realizar triagem." });
  }
});

// Supabase diagnostics and setup endpoints
app.get("/api/supabase/status", async (req, res) => {
  try {
    const status = await testSupabaseConnection();
    res.json({
      configured: isSupabaseConfigured(),
      connected: status.connected,
      error: status.error || null
    });
  } catch (error: any) {
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
      return res.status(400).json({ error: "Supabase não está configurado. Por favor, adicione as credenciais no painel de Secrets." });
    }

    const connection = await testSupabaseConnection();
    if (!connection.connected) {
      return res.status(400).json({ error: connection.error || "Supabase não pôde se conectar." });
    }

    // Load local data and seed Supabase
    const localUsers = await loadUsers();
    const localTickets = await loadTickets();

    const success = await seedSupabaseData(localUsers, localTickets);
    if (success) {
      res.json({ message: "Dados sincronizados com sucesso para o Supabase!" });
    } else {
      res.status(500).json({ error: "Erro ao tentar sincronizar e persistir dados no Supabase. Verifique se as tabelas existem." });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Erro desconhecido durante sincronização." });
  }
});

app.post("/api/supabase/pull", async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.status(400).json({ error: "Supabase não está configurado. Por favor, adicione as credenciais no painel de Secrets." });
    }

    const connection = await testSupabaseConnection();
    if (!connection.connected) {
      return res.status(400).json({ error: connection.error || "Supabase não pôde se conectar." });
    }

    const supabaseUsers = await getSupabaseUsers();
    const supabaseTickets = await getSupabaseTickets();

    if (supabaseUsers === null || supabaseTickets === null) {
      return res.status(500).json({ error: "Erro ao tentar obter dados do Supabase. Verifique as tabelas." });
    }

    // Ensure we hash passwords before saving them on disk
    const securedUsers = supabaseUsers.map(u => ({
      ...u,
      password: u.password ? hashPassword(u.password) : undefined
    }));

    fs.writeFileSync(USERS_FILE, JSON.stringify(securedUsers, null, 2), "utf-8");
    fs.writeFileSync(DB_FILE, JSON.stringify(supabaseTickets, null, 2), "utf-8");

    cachedUsers = securedUsers;
    lastUsersCacheTime = Date.now();

    cachedTickets = supabaseTickets;
    lastTicketsCacheTime = Date.now();

    res.json({
      message: "Dados importados do Supabase com sucesso!",
      usersCount: securedUsers.length,
      ticketsCount: supabaseTickets.length
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Erro desconhecido durante importação de dados." });
  }
});

// Heartbeat endpoint to track user online status in real-time
app.post("/api/heartbeat", (req, res) => {
  const { email } = req.body;
  if (email && typeof email === "string") {
    activeUsers.set(email.toLowerCase().trim(), Date.now());
  }
  res.json({ status: "ok" });
});

// Login/Auth endpoint
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "E-mail e senha são obrigatórios para realizar o login." });
    }

    // If Supabase is configured, try authenticating with Supabase Auth or database query first
    if (isSupabaseConfigured()) {
      const client = getSupabaseClient();
      if (client) {
        try {
          const emailLower = email.trim().toLowerCase();
          console.log(`[Supabase Login] Procurando usuário na tabela 'users' para o e-mail: ${emailLower}`);

          // Query the public.users table directly for the email (this is highly reliable and supports table-editor created users)
          const { data: dbUser, error: dbError } = await client
            .from("users")
            .select("*")
            .eq("email", emailLower)
            .maybeSingle();

          if (dbError) {
            console.error("[Supabase Login] Erro ao consultar tabela 'users':", dbError.message);
          } else if (dbUser) {
            console.log(`[Supabase Login] Usuário encontrado na tabela 'users': ${dbUser.name} (${dbUser.role})`);
            
            // Compare password (both plaintext or hashed)
            const storedPass = dbUser.password || "";
            const isMatch = storedPass === password || storedPass === hashPassword(password);
            if (isMatch) {
              let mustChange = true;
              if (dbUser.must_change_password === false) {
                mustChange = false;
              } else if (dbUser.must_change_password === undefined || dbUser.must_change_password === null) {
                try {
                  const localUsers = await loadUsers();
                  const cached = localUsers.find(u => u.email.toLowerCase() === emailLower);
                  mustChange = cached ? (cached.mustChangePassword !== false) : false;
                } catch {
                  mustChange = false;
                }
              }

              // Robust override: If the password hash in DB is different from the initial seed password, they don't need to reset
              const defaultHash = initialPasswordHashes.get(emailLower);
              if (defaultHash && storedPass !== defaultHash) {
                mustChange = false;
              }
              const loggedUser: User = {
                id: dbUser.id,
                name: dbUser.name,
                email: dbUser.email,
                password: dbUser.password,
                department: dbUser.department,
                role: dbUser.role as "colaborador" | "tecnico",
                mustChangePassword: mustChange
              };

              // Self-heal/cache locally so they immediately show up in active list
              try {
                const localUsers = await loadUsers();
                if (!localUsers.some(u => u.email.toLowerCase() === emailLower)) {
                  localUsers.push(loggedUser);
                  fs.writeFileSync(USERS_FILE, JSON.stringify(localUsers, null, 2), "utf-8");
                }
              } catch (cacheErr) {
                console.error("[Supabase Login] Falha ao atualizar cache local do usuário:", cacheErr);
              }

              // Mark active immediately
              activeUsers.set(emailLower, Date.now());

              return res.json({
                id: loggedUser.id,
                name: loggedUser.name,
                email: loggedUser.email,
                department: loggedUser.department,
                role: loggedUser.role,
                mustChangePassword: mustChange
              });
            } else {
              return res.status(401).json({ error: "Senha de acesso incorreta." });
            }
          }

          // If not in the 'users' table, try traditional Auth sign-in
          console.log(`[Supabase Login] Não encontrado na tabela 'users'. Tentando login via Supabase Auth...`);
          const { data: authData, error: authError } = await client.auth.signInWithPassword({
            email,
            password
          });

          if (!authError && authData.user) {
            // Success! The user exists in Supabase Auth.
            // Check if they are already in our public.users table or if we need to auto-create them.
            const { data: profile, error: profileErr } = await client
              .from("users")
              .select("*")
              .eq("email", emailLower)
              .maybeSingle();

            if (profile) {
              // Mark active immediately
              activeUsers.set(emailLower, Date.now());

              let mustChange = true;
              if (profile.must_change_password === false) {
                mustChange = false;
              } else if (profile.must_change_password === undefined || profile.must_change_password === null) {
                try {
                  const localUsers = await loadUsers();
                  const cached = localUsers.find(u => u.email.toLowerCase() === emailLower);
                  mustChange = cached ? (cached.mustChangePassword !== false) : false;
                } catch {
                  mustChange = false;
                }
              }

              // Robust override: If the password hash in DB is different from the initial seed password, they don't need to reset
              const defaultHash = initialPasswordHashes.get(emailLower);
              if (defaultHash && profile.password && profile.password !== defaultHash) {
                mustChange = false;
              }

              return res.json({
                id: profile.id,
                name: profile.name,
                email: profile.email,
                department: profile.department,
                role: profile.role,
                mustChangePassword: mustChange
              });
            } else {
              // Create user profile
              const derivedName = email.split("@")[0]
                .split(/[\._\-]/)
                .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
                .join(" ");

              const isTechEmail = emailLower.includes("ti") || 
                                  emailLower.includes("suporte") || 
                                  emailLower.includes("admin") || 
                                  emailLower.includes("tech") ||
                                  emailLower.includes("tecnico") ||
                                  emailLower.includes("daniel");

              const newUserProfile: User = {
                id: authData.user.id,
                name: derivedName || "Novo Colaborador",
                email: email.toLowerCase(),
                password: password,
                department: isTechEmail ? "TI" : "Financeiro",
                role: isTechEmail ? "tecnico" : "colaborador",
                mustChangePassword: true
              };

              await saveSupabaseUser(newUserProfile);

              // Mark active immediately
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
            console.log("[Supabase Login] Supabase Auth falhou ou usuário ausente:", authError?.message);
          }
        } catch (authExc) {
          console.error("[Supabase Login] Exceção geral de login do Supabase:", authExc);
        }
      }
    }

    const users = await loadUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      return res.status(401).json({ error: "E-mail de colaborador não cadastrado." });
    }

    if (user.password !== hashPassword(password)) {
      return res.status(401).json({ error: "Senha de acesso incorreta." });
    }

    let mustChange = user.mustChangePassword !== false;
    
    // Robust override: If the password hash in file is different from the initial seed password, they don't need to reset
    const emailLowerFallback = email.trim().toLowerCase();
    const defaultHashFallback = initialPasswordHashes.get(emailLowerFallback);
    if (defaultHashFallback && user.password && user.password !== defaultHashFallback) {
      mustChange = false;
    }

    // Retorna o usuário de forma segura
    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      department: user.department,
      role: user.role,
      mustChangePassword: mustChange
    };

    // Mark active immediately
    activeUsers.set(email.toLowerCase().trim(), Date.now());

    res.json(safeUser);
  } catch (error) {
    console.error("Erro no login:", error);
    res.status(500).json({ error: "Erro interno ao processar a autenticação." });
  }
});

// Change Password endpoint
app.post("/api/change-password", async (req, res) => {
  try {
    const { email, oldPassword, newPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({ error: "E-mail e nova senha são obrigatórios." });
    }

    const users = await loadUsers();
    const index = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());

    if (index === -1) {
      return res.status(404).json({ error: "Colaborador não encontrado." });
    }

    const user = users[index];

    // If they provided oldPassword, check it to ensure security
    if (oldPassword && user.password) {
      if (user.password !== hashPassword(oldPassword)) {
        return res.status(400).json({ error: "A senha atual informada está incorreta." });
      }
    }

    // Set new plain password, saveUsers will hash it automatically
    user.password = newPassword;
    user.mustChangePassword = false;
    user.updatedAt = new Date().toISOString();

    users[index] = user;
    await saveUsers(users, user);

    // Sync with Supabase if configured
    if (isSupabaseConfigured()) {
      const client = getSupabaseClient();
      if (client) {
        try {
          const updatePayload: any = {
            password: hashPassword(newPassword),
            must_change_password: false
          };

          let { error: updateError } = await client
            .from("users")
            .update(updatePayload)
            .eq("email", email.trim().toLowerCase());

          if (updateError && (updateError.code === "PGRST204" || updateError.message?.includes("must_change_password") || updateError.message?.includes("column"))) {
            console.warn("[Supabase Change Password] Coluna 'must_change_password' não encontrada na tabela 'users'. Tentando atualizar apenas a senha.");
            delete updatePayload.must_change_password;
            const retryResult = await client
              .from("users")
              .update(updatePayload)
              .eq("email", email.trim().toLowerCase());
            updateError = retryResult.error;
          }

          if (updateError) {
            console.error("[Supabase Change Password] Erro ao atualizar no Supabase:", updateError.message);
          } else {
            console.log("[Supabase Change Password] Senha atualizada com sucesso no Supabase para:", email);
          }
        } catch (dbErr: any) {
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

// List all users (collaborators)
app.get("/api/users", async (req, res) => {
  try {
    const users = await loadUsers();
    const now = Date.now();
    const usersWithStatus = users.map(u => {
      const emailLower = (u.email || "").toLowerCase().trim();
      // User is considered online if they had login/heartbeat activity within the last 10 seconds
      // This ensures extremely precise and near-instant status tracking matching user requests
      const isOnline = activeUsers.has(emailLower) && (now - activeUsers.get(emailLower)! < 10000);
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

// Create a new user (collaborator)
app.post("/api/users", async (req, res) => {
  try {
    const { name, email, password, department, role } = req.body;

    if (!name || !email || !password || !department || !role) {
      return res.status(400).json({ error: "Todos os campos (nome, email, senha, departamento, cargo) são obrigatórios." });
    }

    const users = await loadUsers();

    // Check if email already registered
    const emailExists = users.some(u => u.email.toLowerCase() === email.toLowerCase());
    if (emailExists) {
      return res.status(400).json({ error: "Este endereço de e-mail já está cadastrado no sistema." });
    }

    // Generate unique ID
    const nextId = "u" + (Math.max(...users.map(u => {
      const parsedId = parseInt(u.id.replace("u", ""));
      return isNaN(parsedId) ? 0 : parsedId;
    })) + 1).toString();

    const newUser: User = {
      id: nextId,
      name,
      email,
      password: hashPassword(password),
      department,
      role: role as "colaborador" | "tecnico",
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
    console.error("Erro ao cadastrar usuário:", error);
    res.status(500).json({ error: "Erro interno ao processar o cadastro de colaborador." });
  }
});

// Update a user (collaborator)
app.put("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, department, role } = req.body;

    const users = await loadUsers();
    const index = users.findIndex(u => u.id === id);

    if (index === -1) {
      return res.status(404).json({ error: "Colaborador não encontrado." });
    }

    if (email) {
      const emailExists = users.some(u => u.id !== id && u.email.toLowerCase() === email.toLowerCase());
      if (emailExists) {
        return res.status(400).json({ error: "Este e-mail já está em uso por outro colaborador." });
      }
    }

    const currentUser = users[index];
    const updatedUser: User = {
      id,
      name: name || currentUser.name,
      email: email || currentUser.email,
      password: (password && password.trim() !== "") ? hashPassword(password) : currentUser.password,
      department: department || currentUser.department,
      role: (role as "colaborador" | "tecnico") || currentUser.role
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
    res.status(500).json({ error: "Erro interno ao processar a atualização." });
  }
});

// Delete a user (collaborator)
app.delete("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const users = await loadUsers();
    const index = users.findIndex(u => u.id === id);

    if (index === -1) {
      return res.status(404).json({ error: "Colaborador não encontrado." });
    }

    const userToDelete = users[index];
    const techCount = users.filter(u => u.role === "tecnico").length;

    if (userToDelete.role === "tecnico" && techCount <= 1) {
      return res.status(400).json({ error: "Não é permitido remover o único técnico de TI cadastrado para não bloquear o acesso." });
    }

    // Delete from Supabase explicitly as well to ensure consistency
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

// List all tickets
app.get("/api/tickets", async (req, res) => {
  try {
    const tickets = await loadTickets();
    // Sort by createdAt descending
    tickets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(tickets);
  } catch (error) {
    console.error("Erro ao listar chamados:", error);
    res.status(500).json({ error: "Erro interno ao carregar chamados." });
  }
});

// Create a new ticket
app.post("/api/tickets", async (req, res) => {
  try {
    const { title, description, requesterName, requesterDepartment, screenshot, projectDeadline } = req.body;

    if (!title || !description || !requesterName || !requesterDepartment) {
      return res.status(400).json({ error: "Título, descrição, solicitante e departamento são obrigatórios." });
    }

    // Run local key-word triage immediately to have a fast response
    const triage = defaultLocalTriage(title, description);

    // Calculate SLA limit based on local triage initially
    let hoursToAdd = 48; // Baixa
    if (triage.priority === "Urgente") hoursToAdd = 2;
    else if (triage.priority === "Alta") hoursToAdd = 8;
    else if (triage.priority === "Média") hoursToAdd = 24;

    const tickets = await loadTickets();
    
    // Find next ID safely (robust against missing or corrupted fields)
    const maxId = tickets.reduce((max, t) => {
      if (!t || !t.id) return max;
      const idNum = parseInt(t.id);
      return isNaN(idNum) ? max : Math.max(max, idNum);
    }, 1000);
    const nextId = (maxId + 1).toString();

    const newTicket: Ticket = {
      id: nextId,
      title,
      description,
      category: triage.category as Ticket["category"],
      priority: triage.priority as Ticket["priority"],
      status: "Aberto",
      requesterName,
      requesterDepartment,
      assignedTo: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      slaLimit: new Date(Date.now() + 3600000 * hoursToAdd).toISOString(),
      aiCategory: "Analisando...",
      aiPriority: "Analisando...",
      aiReasoning: "A inteligência artificial está analisando o seu chamado em segundo plano...",
      aiSuggestions: "Aguardando conclusão da análise do Gemini...",
      screenshot: screenshot || undefined,
      projectDeadline: projectDeadline || undefined,
      comments: [
        {
          id: `sys-${Date.now()}`,
          authorName: "IA Triagem GRAN7 HELP",
          authorRole: "ai",
          content: "Iniciando análise inteligente do chamado...",
          timestamp: new Date().toISOString(),
        },
      ],
    };

    tickets.push(newTicket);
    await saveTickets(tickets, newTicket);

    // Return the ticket immediately to the user! No waiting!
    res.status(201).json(newTicket);

    // Trigger Gemini Triage in the background (asynchronously)
    (async () => {
      try {
        console.log(`[IA] Iniciando triagem assíncrona para o chamado #${nextId}`);
        const geminiTriage = await triageWithGemini(title, description, screenshot);
        
        // Load latest tickets to update with AI results
        const currentTickets = await loadTickets();
        const ticketToUpdate = currentTickets.find(t => t.id === nextId);
        
        if (ticketToUpdate) {
          ticketToUpdate.category = geminiTriage.category as Ticket["category"];
          ticketToUpdate.priority = geminiTriage.priority as Ticket["priority"];
          ticketToUpdate.aiCategory = geminiTriage.category;
          ticketToUpdate.aiPriority = geminiTriage.priority;
          ticketToUpdate.aiReasoning = geminiTriage.reasoning;
          ticketToUpdate.aiSuggestions = geminiTriage.suggestions;
          ticketToUpdate.updatedAt = new Date().toISOString();

          // Recalculate SLA based on the AI-determined priority
          let newHoursToAdd = 48; // Baixa
          if (geminiTriage.priority === "Urgente") newHoursToAdd = 2;
          else if (geminiTriage.priority === "Alta") newHoursToAdd = 8;
          else if (geminiTriage.priority === "Média") newHoursToAdd = 24;
          ticketToUpdate.slaLimit = new Date(new Date(ticketToUpdate.createdAt).getTime() + 3600000 * newHoursToAdd).toISOString();

          // Update systemic comments
          ticketToUpdate.comments = ticketToUpdate.comments.map(c => {
            if (c.authorRole === "ai" && c.content === "Iniciando análise inteligente do chamado...") {
              return {
                ...c,
                content: `Chamado classificado automaticamente pelo Gemini.\n\n**Justificativa:** ${geminiTriage.reasoning}`,
                timestamp: new Date().toISOString()
              };
            }
            return c;
          });

          await saveTickets(currentTickets, ticketToUpdate);
          console.log(`[IA] Triagem assíncrona concluída com sucesso para o chamado #${nextId}`);
        }
      } catch (err: any) {
        console.error(`[IA] Falha na triagem assíncrona do chamado #${nextId}:`, err);
        // Fallback: apply local triage values
        try {
          const currentTickets = await loadTickets();
          const ticketToUpdate = currentTickets.find(t => t.id === nextId);
          if (ticketToUpdate) {
            ticketToUpdate.aiCategory = ticketToUpdate.category;
            ticketToUpdate.aiPriority = ticketToUpdate.priority;
            ticketToUpdate.aiReasoning = "Triagem automática local realizada com sucesso devido à instabilidade temporária no serviço de IA.";
            ticketToUpdate.aiSuggestions = "1. Prossiga com o fluxo normal de atendimento.\n2. Revise categoria/prioridade manualmente se necessário.";
            ticketToUpdate.comments = ticketToUpdate.comments.map(c => {
              if (c.authorRole === "ai" && c.content === "Iniciando análise inteligente do chamado...") {
                return {
                  ...c,
                  content: `Triagem local aplicada com sucesso.`,
                  timestamp: new Date().toISOString()
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
    res.status(500).json({ error: "Erro interno ao processar a criação de chamado." });
  }
});

function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const seconds = Math.floor(ms / 1000);
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

// Update ticket (Priority, Status, Category, AssignedTo)
app.patch("/api/tickets/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, priority, category, assignedTo, projectDeadline, requesterUser, requesterName, requesterDepartment } = req.body;

    const tickets = await loadTickets();
    const index = tickets.findIndex(t => t.id === id);

    if (index === -1) {
      return res.status(404).json({ error: "Chamado não encontrado." });
    }

    const oldTicket = tickets[index];
    const updatedTicket = { ...oldTicket };

    // Validation: prevent another technician from modifying an already assigned ticket (stealing, priority change, category change, finalization)
    if (oldTicket.assignedTo) {
      if (requesterUser && requesterUser !== oldTicket.assignedTo) {
        const isChangingAssignedTo = assignedTo !== undefined && assignedTo !== oldTicket.assignedTo;
        const isChangingPriority = priority !== undefined && priority !== oldTicket.priority;
        const isChangingStatus = status !== undefined && status !== oldTicket.status;
        const isChangingCategory = category !== undefined && category !== oldTicket.category;
        const isChangingDeadline = projectDeadline !== undefined && projectDeadline !== oldTicket.projectDeadline;
        const isChangingRequester = requesterName !== undefined && requesterName !== oldTicket.requesterName;

        if (isChangingAssignedTo || isChangingPriority || isChangingStatus || isChangingCategory || isChangingDeadline || isChangingRequester) {
          return res.status(403).json({ 
            error: `Este chamado já está atribuído a ${oldTicket.assignedTo}. Apenas o técnico responsável pode alterar suas informações, transferi-lo ou finalizá-lo.` 
          });
        }
      }
    }

    let changeLog: string[] = [];

    if (requesterName && requesterName !== oldTicket.requesterName) {
      updatedTicket.requesterName = requesterName;
      changeLog.push(`Solicitante alterado de **${oldTicket.requesterName}** para **${requesterName}**`);
    }

    if (requesterDepartment && requesterDepartment !== oldTicket.requesterDepartment) {
      updatedTicket.requesterDepartment = requesterDepartment;
    }

    if (projectDeadline !== undefined && projectDeadline !== oldTicket.projectDeadline) {
      updatedTicket.projectDeadline = projectDeadline || undefined;
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
        // Find the oldest assignment comment to calculate duration of the service
        const firstAssignmentComment = oldTicket.comments.find(c => 
          c.authorRole === "system" && c.content.includes("Responsável atribuído:")
        );
        if (firstAssignmentComment) {
          const durationMs = Date.now() - new Date(firstAssignmentComment.timestamp).getTime();
          const durationText = formatDuration(durationMs);
          changeLog.push(`Tempo total de atendimento: **${durationText}**`);
        } else {
          // Fallback to ticket creation time
          const durationMs = Date.now() - new Date(oldTicket.createdAt).getTime();
          const durationText = formatDuration(durationMs);
          changeLog.push(`Tempo total desde a abertura: **${durationText}**`);
        }
      }
    }

    if (priority && priority !== oldTicket.priority) {
      updatedTicket.priority = priority;
      changeLog.push(`Prioridade alterada de **${oldTicket.priority}** para **${priority}**`);
      
      // Recalculate SLA based on new priority
      let hoursToAdd = 48;
      if (priority === "Urgente") hoursToAdd = 2;
      else if (priority === "Alta") hoursToAdd = 8;
      else if (priority === "Média") hoursToAdd = 24;
      updatedTicket.slaLimit = new Date(new Date(oldTicket.createdAt).getTime() + 3600000 * hoursToAdd).toISOString();
    }

    if (category && category !== oldTicket.category) {
      updatedTicket.category = category;
      changeLog.push(`Categoria alterada de **${oldTicket.category}** para **${category}**`);
    }

    if (assignedTo !== undefined && assignedTo !== oldTicket.assignedTo) {
      if (oldTicket.assignedTo && assignedTo) {
        // Transfer logged clearly
        changeLog.push(`Chamado transferido de **${oldTicket.assignedTo}** para **${assignedTo}** por **${requesterUser || "Técnico"}**`);
        updatedTicket.assignedTo = assignedTo;
      } else if (assignedTo) {
        // Normal assignment
        changeLog.push(`Responsável atribuído: **${assignedTo}**`);
        updatedTicket.assignedTo = assignedTo;
        if (oldTicket.status === "Aberto") {
          updatedTicket.status = "Em Atendimento";
          changeLog.push(`Status alterado automaticamente para **Em Atendimento**`);
        }
      } else {
        // Removed assignment
        changeLog.push(`Responsável removido: **${oldTicket.assignedTo}**`);
        updatedTicket.assignedTo = null;
      }
    }

    if (changeLog.length > 0) {
      updatedTicket.updatedAt = new Date().toISOString();
      
      // Append system message about the changes
      updatedTicket.comments.push({
        id: `sys-log-${Date.now()}`,
        authorName: "Sistema GRAN7 HELP",
        authorRole: "system",
        content: changeLog.join("\n"),
        timestamp: new Date().toISOString(),
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

// Add comment to ticket
app.post("/api/tickets/:id/comments", async (req, res) => {
  try {
    const { id } = req.params;
    const { authorName, authorRole, content, attachmentUrl, attachmentName } = req.body;

    if (!authorName || !authorRole || !content) {
      return res.status(400).json({ error: "Autor, papel (role) e conteúdo da mensagem são obrigatórios." });
    }

    const tickets = await loadTickets();
    const index = tickets.findIndex(t => t.id === id);

    if (index === -1) {
      return res.status(404).json({ error: "Chamado não encontrado." });
    }

    const ticket = tickets[index];
    const newComment: Comment = {
      id: `c-${Date.now()}`,
      authorName,
      authorRole,
      content,
      timestamp: new Date().toISOString(),
      ...(attachmentUrl ? { attachmentUrl } : {}),
      ...(attachmentName ? { attachmentName } : {}),
    };

    ticket.comments.push(newComment);
    ticket.updatedAt = new Date().toISOString();

    tickets[index] = ticket;
    await saveTickets(tickets, ticket);

    res.status(201).json(newComment);
  } catch (error) {
    console.error("Erro ao adicionar comentário:", error);
    res.status(500).json({ error: "Erro interno ao adicionar comentário." });
  }
});

// Delete a ticket (IT Team / Técnico only)
app.delete("/api/tickets/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = req.headers["x-user-role"];
    const userName = req.headers["x-user-name"];

    if (userRole !== "tecnico") {
      return res.status(403).json({ error: "Apenas colaboradores da equipe de TI podem apagar chamados." });
    }

    const tickets = await loadTickets();
    const index = tickets.findIndex(t => t.id === id);

    if (index === -1) {
      return res.status(404).json({ error: "Chamado não encontrado." });
    }

    const ticket = tickets[index];
    if (!ticket.assignedTo || ticket.assignedTo !== userName) {
      return res.status(403).json({ error: "Apenas o técnico responsável por este chamado pode excluí-lo." });
    }

    if (isSupabaseConfigured()) {
      await deleteSupabaseTicket(id);
    }

    tickets.splice(index, 1);
    await saveTickets(tickets);

    res.json({ success: true, message: "Chamado excluído com sucesso." });
  } catch (error) {
    console.error("Erro ao excluir chamado:", error);
    res.status(500).json({ error: "Erro interno ao excluir chamado." });
  }
});

// Reset Database Endpoint (useful for demo testing)
app.post("/api/reset", async (req, res) => {
  try {
    // Delete from Supabase explicitly if configured
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
    
    await saveTickets(initialTickets);
    await saveUsers(initialUsers);
    res.json({ message: "Banco de dados e lista de colaboradores reiniciados com sucesso." });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Erro ao resetar banco de dados." });
  }
});

// Serve frontend assets
if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  const startVite = async () => {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
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
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });

    if (typeof PORT === "string") {
      app.listen(PORT, () => {
        console.log(`[NEXTHELP Backend] Server rodando em produção no socket ${PORT}`);
      });
    } else {
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`[NEXTHELP Backend] Server rodando em produção na porta ${PORT}`);
      });
    }
  }
}

export default app;
