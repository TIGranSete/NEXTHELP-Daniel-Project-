import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import crypto from "crypto";

// Load .env.local, .env.development, then .env with override so that local files have higher priority
const envFiles = [".env.local", ".env.development", ".env"];
envFiles.forEach((file) => {
  const filePath = path.join(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override: true });
  }
});
// Fallback standard config in case loop didn't run or missed something
dotenv.config();

import express from "express";
import os from "os";
import { GoogleGenAI, Type } from "@google/genai";
import { hashPassword, verifyPassword } from "./password-utils";
import { breachesAt, buildResolutionSnapshot, computeTicketSla, pausePeriods, WAITING_STATUS } from "./src/lib/sla/ticketSla";
import { nextSeq, unionSlaEvents } from "./src/lib/sla/events";
import { validPhotoDataUrl } from "./src/lib/photoValidation";
import { REOPEN_CATEGORIES, REOPEN_MIN_REASON_LENGTH } from "./src/lib/sla/config";
import type { SlaEvent } from "./src/types";
import {
  isSupabaseConfigured,
  isSupabaseHealthy,
  testSupabaseConnection,
  getSupabaseUsers,
  getSupabaseUserByEmail,
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

// Fallback defaults if users-db.json or tickets-db.json are not found
const DEFAULT_INITIAL_USERS: any[] = [];

const DEFAULT_INITIAL_TICKETS: any[] = [];

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
if (!initialUsers || initialUsers.length === 0) {
  initialUsers = DEFAULT_INITIAL_USERS;
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
if (!initialTickets || initialTickets.length === 0) {
  initialTickets = DEFAULT_INITIAL_TICKETS;
}

const app = express();

// Detect if running inside the AI Studio sandbox.
// In the AI Studio container, we must strictly bind to port 3000 (nginx proxy expects 3000).
// In other hosts like Hostinger or generic Node servers, we should read process.env.PORT.
const isAIStudio = !!process.env.APPLET_ID || process.env.DISABLE_HMR === "true";
const PORT: string | number = (!isAIStudio && process.env.PORT)
  ? (isNaN(Number(process.env.PORT)) ? process.env.PORT : Number(process.env.PORT))
  : 3000;
const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const DB_FILE = isServerless ? path.join(os.tmpdir(), "tickets-db-local.json") : path.join(process.cwd(), "tickets-db-local.json");
const USERS_FILE = isServerless ? path.join(os.tmpdir(), "users-db-local.json") : path.join(process.cwd(), "users-db-local.json");
// Fotos de perfil ficam em arquivo próprio: a lista de usuários é reescrita a partir do Supabase (que não tem coluna
// de foto), então guardar a foto dentro do registro do usuário a perderia na próxima sincronização.
const PHOTOS_FILE = isServerless ? path.join(os.tmpdir(), "user-photos.json") : path.join(process.cwd(), "user-photos.json");

// Shared file to track active users across processes (e.g. Hostinger cluster/PM2)
const ACTIVE_USERS_FILE = isServerless ? path.join(os.tmpdir(), "active-users.json") : path.join(process.cwd(), "active-users.json");

function getActiveUsersMap(): Map<string, number> {
  const map = new Map<string, number>();
  try {
    if (fs.existsSync(ACTIVE_USERS_FILE)) {
      const content = fs.readFileSync(ACTIVE_USERS_FILE, "utf-8").trim();
      if (content) {
        const obj = JSON.parse(content);
        for (const [key, val] of Object.entries(obj)) {
          if (typeof val === "number") {
            map.set(key.toLowerCase().trim(), val);
          }
        }
      }
    }
  } catch (err) {
    // Fail silently
  }
  return map;
}

// Client sends a heartbeat every 10s; anything older than 2 missed beats is
// considered stale. Kept low (instead of the old 75s) so a crashed tab or
// dropped connection stops showing as "online" within seconds, not minutes.
const PRESENCE_TIMEOUT_MS = 25000;

function saveActiveUsersMap(map: Map<string, number>) {
  try {
    const obj: Record<string, number> = {};
    const now = Date.now();
    for (const [key, val] of map.entries()) {
      if (now - val < PRESENCE_TIMEOUT_MS) {
        obj[key] = val;
      }
    }
    fs.writeFileSync(ACTIVE_USERS_FILE, JSON.stringify(obj, null, 2), "utf-8");
  } catch (err) {
    // Fail silently
  }
}

function markUserActive(identifier?: string) {
  if (!identifier || typeof identifier !== "string") return;
  const lower = identifier.toLowerCase().trim();
  const map = getActiveUsersMap();
  map.set(lower, Date.now());
  saveActiveUsersMap(map);
}

// Explicitly clears presence immediately (called on logout / tab close via
// sendBeacon) instead of waiting for the heartbeat to go stale.
function markUserOffline(identifier?: string) {
  if (!identifier || typeof identifier !== "string") return;
  const lower = identifier.toLowerCase().trim();
  const map = getActiveUsersMap();
  map.delete(lower);
  saveActiveUsersMap(map);
}

function isUserOnline(email?: string, name?: string, now?: number): boolean {
  const currentNow = now || Date.now();
  const map = getActiveUsersMap();

  if (email && typeof email === "string") {
    const eLower = email.toLowerCase().trim();
    const lastActive = map.get(eLower);
    if (lastActive && (currentNow - lastActive < PRESENCE_TIMEOUT_MS)) {
      return true;
    }
  }

  if (name && typeof name === "string") {
    const nLower = name.toLowerCase().trim();
    const lastActive = map.get(nLower);
    if (lastActive && (currentNow - lastActive < PRESENCE_TIMEOUT_MS)) {
      return true;
    }
  }

  return false;
}

// --- Session/auth tokens ---
// Opaque bearer tokens issued at login, persisted to disk (same pattern as
// active-users.json) so they survive process restarts on a normal host.
// Every sensitive route below requires one instead of trusting whatever
// identity the client claims in the request body/headers.
const SESSIONS_FILE = isServerless ? path.join(os.tmpdir(), "sessions.json") : path.join(process.cwd(), "sessions.json");
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface AuthedUser {
  id: string;
  name: string;
  email: string;
  role: "colaborador" | "tecnico";
}

interface SessionRecord extends AuthedUser {
  expiresAt: number;
}

function loadSessions(): Record<string, SessionRecord> {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const content = fs.readFileSync(SESSIONS_FILE, "utf-8").trim();
      if (content) return JSON.parse(content);
    }
  } catch (err) {
    // Fail silently — a corrupt/missing session store just means everyone re-logs in.
  }
  return {};
}

function saveSessions(sessions: Record<string, SessionRecord>) {
  try {
    const now = Date.now();
    const pruned: Record<string, SessionRecord> = {};
    for (const [token, record] of Object.entries(sessions)) {
      if (record.expiresAt > now) pruned[token] = record;
    }
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(pruned, null, 2), "utf-8");
  } catch (err) {
    // Fail silently
  }
}

function createSession(user: AuthedUser): string {
  const token = crypto.randomBytes(32).toString("hex");
  const sessions = loadSessions();
  sessions[token] = { ...user, expiresAt: Date.now() + SESSION_TTL_MS };
  saveSessions(sessions);
  return token;
}

function destroySession(token: string) {
  const sessions = loadSessions();
  delete sessions[token];
  saveSessions(sessions);
}

// Drops every active session of a user (e.g. after an admin changes their
// password, e-mail or role) so stale credentials/roles stop working at once.
// `exceptToken` keeps the acting admin logged in when they edit themselves.
function revokeSessionsForUser(userId: string, exceptToken?: string) {
  const sessions = loadSessions();
  for (const [token, record] of Object.entries(sessions)) {
    if (record.id === userId && token !== exceptToken) delete sessions[token];
  }
  saveSessions(sessions);
}

function getSessionFromRequest(req: express.Request): SessionRecord | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;
  const sessions = loadSessions();
  const record = sessions[token];
  if (!record || record.expiresAt <= Date.now()) return null;
  return record;
}

// Requires a valid, non-expired session token. Attaches the verified
// identity to req.authUser so downstream handlers never need to trust
// anything the client claims about who it is.
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({ error: "Sessão inválida ou expirada. Faça login novamente." });
  }
  (req as any).authUser = session;
  next();
}

// Requires requireAuth to have already run. Restricts to technician accounts.
function requireTech(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authUser: SessionRecord | undefined = (req as any).authUser;
  if (!authUser || authUser.role !== "tecnico") {
    return res.status(403).json({ error: "Apenas técnicos da equipe de TI podem realizar esta ação." });
  }
  next();
}

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// CORS & URL Normalization Middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-user-role, x-user-name");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  // Normalize URL if /api prefix was stripped by hosting platform or proxy
  if (
    !req.url.startsWith("/api/") &&
    !req.url.startsWith("/api?") &&
    req.url !== "/api" &&
    !req.url.startsWith("/assets") &&
    !req.url.startsWith("/@")
  ) {
    if (
      req.url.startsWith("/tickets") ||
      req.url.startsWith("/users") ||
      req.url.startsWith("/login") ||
      req.url.startsWith("/change-password") ||
      req.url.startsWith("/supabase") ||
      req.url.startsWith("/heartbeat") ||
      req.url.startsWith("/offline") ||
      req.url.startsWith("/reset")
    ) {
      req.url = "/api" + req.url;
    }
  }
  next();
});

app.use("/assets", express.static(path.join(process.cwd(), "assets")));

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

const DEFAULT_USERS: User[] = [];

// Ticket Type Definition
interface Comment {
  id: string;
  authorName: string;
  authorRole: "colaborador" | "tecnico" | "system" | "ai";
  content: string;
  timestamp: string;
}

interface Attachment {
  name: string;
  url: string;
  type: string;
}

interface Ticket {
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

// ── SLA em horas úteis: helpers de auditoria ──
// O instante de um evento é SEMPRE o do servidor (nunca do cliente) e nunca anterior ao
// evento anterior: a pausa não pode ser retroativa nem gerar intervalos negativos.
function nextSlaEventAt(events: SlaEvent[]): string {
  const last = events.reduce((max, e) => Math.max(max, Date.parse(e.at) || 0), 0);
  return new Date(Math.max(Date.now(), last)).toISOString();
}

/**
 * Acrescenta um evento à trilha (nunca edita nem remove). O servidor define id, seq e instante;
 * o cliente jamais escolhe a data de um evento.
 */
function addSlaEvent(events: SlaEvent[], data: Omit<SlaEvent, "id" | "seq" | "at">): SlaEvent {
  const event = { ...data, id: `sla-${data.type}-${crypto.randomUUID()}`, seq: nextSeq(events), at: nextSlaEventAt(events) } as SlaEvent;
  events.push(event);
  return event;
}

function isSlaPaused(ticket: Ticket): boolean {
  const periods = pausePeriods(ticket as any);
  return periods.length > 0 && periods[periods.length - 1].endAt === null;
}

const FINAL_STATUSES = ["Resolvido", "Fechado"];

// Default Seed Data
const DEFAULT_TICKETS: Ticket[] = [];

// Memory cache for Supabase reads to minimize egress/bandwidth and avoid free tier overage limits
let cachedTickets: Ticket[] | null = null;
let lastTicketsCacheTime = 0;
let cachedUsers: User[] | null = null;
let lastUsersCacheTime = 0;

const CACHE_TTL_MS = 15000; // 15 seconds Cache TTL

// Helper to load/save database
let isRevalidatingTickets = false;

// Helper to load local tickets from file synchronously
function getLocalTickets(): Ticket[] {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, "utf-8").trim();
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    }
  } catch (e) {
    console.error("Erro ao ler chamados locais:", e);
  }
  return [];
}

// Merge function to reconcile local and remote tickets, prioritizing the one with the newest updatedAt timestamp
function mergeTickets(local: Ticket[], remote: Ticket[]): Ticket[] {
  const mergedMap = new Map<string, Ticket>();
  
  // 1. Put all remote tickets in the map first
  for (const t of remote) {
    if (t && t.id) {
      mergedMap.set(t.id, t);
    }
  }

  // 2. Override with local tickets if local ticket has a newer updatedAt
  for (const t of local) {
    if (!t || !t.id) continue;
    const remoteT = mergedMap.get(t.id);
    if (!remoteT) {
      mergedMap.set(t.id, t);
    } else {
      const localTime = new Date(t.updatedAt || t.createdAt || 0).getTime();
      const remoteTime = new Date(remoteT.updatedAt || remoteT.createdAt || 0).getTime();
      // A trilha de SLA é só de acrescentar: nunca perder eventos de nenhuma das cópias.
      const events = unionSlaEvents(t.slaEvents, remoteT.slaEvents);
      if (events.length > 0) {
        t.slaEvents = events;
        remoteT.slaEvents = events;
      }
      if (localTime > remoteTime) {
        mergedMap.set(t.id, t);
        console.log(`[Supabase Sync] Chamado #${t.id} local é mais recente (${t.updatedAt}) que o Supabase (${remoteT.updatedAt}). Preservando alteração local.`);
        // Lazy background update to Supabase to self-heal
        saveSupabaseTicket(t).catch(err => console.error(`[Supabase Sync BG] Erro ao sincronizar chamado #${t.id} mais novo no Supabase:`, err));
      }
    }
  }

  return Array.from(mergedMap.values());
}

// Helper to load/save database
async function loadTickets(): Promise<Ticket[]> {
  const now = Date.now();
  const localTickets = getLocalTickets();

  // If Supabase is configured and healthy, and we have no cache or it is stale, try to fetch synchronously first
  if (isSupabaseConfigured() && isSupabaseHealthy() && (cachedTickets === null || now - lastTicketsCacheTime >= CACHE_TTL_MS)) {
    try {
      const remoteTickets = await getSupabaseTickets();
      if (remoteTickets !== null && Array.isArray(remoteTickets)) {
        const merged = mergeTickets(localTickets, remoteTickets);
        try {
          fs.writeFileSync(DB_FILE, JSON.stringify(merged, null, 2), "utf-8");
        } catch (e) {}
        cachedTickets = merged;
        lastTicketsCacheTime = now;
        return merged;
      }
    } catch (error) {
      console.warn("Erro ao carregar chamados do Supabase em tempo real, tentando ler cache local:", error);
    }
  }

  // If we have cached tickets in memory
  if (cachedTickets !== null) {
    // If cache is still fresh, just return it
    if (now - lastTicketsCacheTime < CACHE_TTL_MS) {
      return cachedTickets;
    }

    // Cache is stale. Trigger background revalidation if not already running
    if (isSupabaseConfigured() && isSupabaseHealthy() && !isRevalidatingTickets) {
      isRevalidatingTickets = true;
      getSupabaseTickets()
        .then((remoteTickets) => {
          if (remoteTickets !== null && Array.isArray(remoteTickets)) {
            const currentLocal = getLocalTickets();
            const merged = mergeTickets(currentLocal, remoteTickets);
            try {
              fs.writeFileSync(DB_FILE, JSON.stringify(merged, null, 2), "utf-8");
            } catch (e) {}
            cachedTickets = merged;
            lastTicketsCacheTime = Date.now();
          }
        })
        .catch((error) => {
          console.warn("Erro na revalidação em segundo plano dos chamados do Supabase:", error);
        })
        .finally(() => {
          isRevalidatingTickets = false;
        });
    }

    // Return stale memory cache immediately
    return cachedTickets;
  }

  // If memory cache is null, use localTickets as baseline
  if (localTickets.length > 0) {
    cachedTickets = localTickets;
    lastTicketsCacheTime = now;

    // Trigger background revalidation to update memory & file
    if (isSupabaseConfigured() && isSupabaseHealthy() && !isRevalidatingTickets) {
      isRevalidatingTickets = true;
      getSupabaseTickets()
        .then((remoteTickets) => {
          if (remoteTickets !== null && Array.isArray(remoteTickets)) {
            const currentLocal = getLocalTickets();
            const merged = mergeTickets(currentLocal, remoteTickets);
            try {
              fs.writeFileSync(DB_FILE, JSON.stringify(merged, null, 2), "utf-8");
            } catch (e) {}
            cachedTickets = merged;
            lastTicketsCacheTime = Date.now();
          }
        })
        .catch((error) => {
          console.warn("Erro na revalidação em segundo plano dos chamados do Supabase:", error);
        })
        .finally(() => {
          isRevalidatingTickets = false;
        });
    }
    return localTickets;
  }

  // Fallback to static seed data if empty
  if (cachedTickets === null) {
    cachedTickets = JSON.parse(JSON.stringify(initialTickets)) as any as Ticket[];
    lastTicketsCacheTime = now;
  }

  return cachedTickets;
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

  if (isSupabaseConfigured() && isSupabaseHealthy()) {
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
let isRevalidatingUsers = false;

// Helper to load/save users database
async function loadUsers(): Promise<User[]> {
  const now = Date.now();

  // If Supabase is configured and healthy, and we have no cache or it is stale, try to fetch synchronously first
  if (isSupabaseConfigured() && isSupabaseHealthy() && (cachedUsers === null || now - lastUsersCacheTime >= CACHE_TTL_MS)) {
    try {
      const supabaseUsers = await getSupabaseUsers();
      if (supabaseUsers !== null && Array.isArray(supabaseUsers)) {
        let secured = supabaseUsers.map(u => {
          if (u.password && !/^[a-f0-9]{64}$/i.test(u.password)) {
            u.password = hashPassword(u.password);
          }
          return u;
        });

        // Self-heal: check if any initialUsers are missing from the Supabase database
        const missingFromDb = initialUsers.filter(initUser => 
          !secured.some(su => su.email.toLowerCase() === initUser.email.toLowerCase())
        );

        if (missingFromDb.length > 0) {
          console.log(`[Supabase Sync] Encontrados ${missingFromDb.length} usuários iniciais ausentes no Supabase. Inserindo...`);
          for (const missingUser of missingFromDb) {
            const uMapped: User = {
              id: missingUser.id,
              name: missingUser.name,
              email: missingUser.email,
              password: hashPassword(missingUser.password || ""),
              department: missingUser.department,
              role: missingUser.role === "tecnico" ? "tecnico" : "colaborador",
              mustChangePassword: missingUser.mustChangePassword !== false
            };
            await saveSupabaseUser(uMapped);
            secured.push(uMapped);
          }
        }

        try {
          fs.writeFileSync(USERS_FILE, JSON.stringify(secured, null, 2), "utf-8");
        } catch (e) {}
        cachedUsers = secured;
        lastUsersCacheTime = now;
        return secured;
      }
    } catch (error) {
      console.warn("Erro ao carregar colaboradores do Supabase em tempo real, tentando ler cache local:", error);
    }
  }

  // If we have cached users in memory
  if (cachedUsers !== null) {
    // If cache is still fresh, just return it
    if (now - lastUsersCacheTime < CACHE_TTL_MS) {
      return cachedUsers;
    }

    // Cache is stale. Trigger background revalidation if not already running
    if (isSupabaseConfigured() && isSupabaseHealthy() && !isRevalidatingUsers) {
      isRevalidatingUsers = true;
      getSupabaseUsers()
        .then(async (supabaseUsers) => {
          if (supabaseUsers !== null && Array.isArray(supabaseUsers)) {
            let needsRewrite = false;
            let secured = supabaseUsers.map(u => {
              if (u.password && !/^[a-f0-9]{64}$/i.test(u.password)) {
                u.password = hashPassword(u.password);
                needsRewrite = true;
              }
              return u;
            });

            // Self-heal: check if any initialUsers are missing from the Supabase database
            const missingFromDb = initialUsers.filter(initUser => 
              !secured.some(su => su.email.toLowerCase() === initUser.email.toLowerCase())
            );

            if (missingFromDb.length > 0) {
              console.log(`[Supabase Sync BG] Encontrados ${missingFromDb.length} usuários iniciais ausentes no Supabase. Inserindo...`);
              for (const missingUser of missingFromDb) {
                const uMapped: User = {
                  id: missingUser.id,
                  name: missingUser.name,
                  email: missingUser.email,
                  password: hashPassword(missingUser.password || ""),
                  department: missingUser.department,
                  role: missingUser.role === "tecnico" ? "tecnico" : "colaborador",
                  mustChangePassword: missingUser.mustChangePassword !== false
                };
                await saveSupabaseUser(uMapped);
                secured.push(uMapped);
                needsRewrite = true;
              }
            }

            try {
              fs.writeFileSync(USERS_FILE, JSON.stringify(secured, null, 2), "utf-8");
            } catch (e) {}
            cachedUsers = secured;
            lastUsersCacheTime = Date.now();
          }
        })
        .catch((error) => {
          console.warn("Erro na revalidação em segundo plano dos colaboradores do Supabase:", error);
        })
        .finally(() => {
          isRevalidatingUsers = false;
        });
    }

    // Return stale memory cache immediately
    return cachedUsers;
  }

  // If memory cache is null, try to read from local file synchronously (instant)
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
  } else {
    // Self-heal: ensure all initialUsers are also present in localUsers
    const missingFromLocal = initialUsers.filter(initUser =>
      !localUsers.some(lu => lu.email.toLowerCase() === initUser.email.toLowerCase())
    );
    if (missingFromLocal.length > 0) {
      console.log(`[Local Sync] Encontrados ${missingFromLocal.length} usuários iniciais ausentes no cache local. Mesclando...`);
      for (const missingUser of missingFromLocal) {
        const uMapped: User = {
          id: missingUser.id,
          name: missingUser.name,
          email: missingUser.email,
          password: hashPassword(missingUser.password || ""),
          department: missingUser.department,
          role: missingUser.role === "tecnico" ? "tecnico" : "colaborador",
          mustChangePassword: missingUser.mustChangePassword !== false
        };
        localUsers.push(uMapped);
      }
    }
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

  if (needsRewrite) {
    try {
      fs.writeFileSync(USERS_FILE, JSON.stringify(localUsers, null, 2), "utf-8");
    } catch (e) {}
  }

  cachedUsers = localUsers;
  lastUsersCacheTime = now;

  // Trigger background revalidation to update memory & file from Supabase
  if (isSupabaseConfigured() && isSupabaseHealthy() && !isRevalidatingUsers) {
    isRevalidatingUsers = true;
    getSupabaseUsers()
      .then(async (supabaseUsers) => {
        if (supabaseUsers !== null && Array.isArray(supabaseUsers)) {
          let needsRewriteSupabase = false;
          let secured = supabaseUsers.map(u => {
            if (u.password && !/^[a-f0-9]{64}$/i.test(u.password)) {
              u.password = hashPassword(u.password);
              needsRewriteSupabase = true;
            }
            return u;
          });

          // Self-heal: check if any initialUsers are missing from the Supabase database
          const missingFromDb = initialUsers.filter(initUser => 
            !secured.some(su => su.email.toLowerCase() === initUser.email.toLowerCase())
          );

          if (missingFromDb.length > 0) {
            console.log(`[Supabase Sync BG2] Encontrados ${missingFromDb.length} usuários iniciais ausentes no Supabase. Inserindo...`);
            for (const missingUser of missingFromDb) {
              const uMapped: User = {
                id: missingUser.id,
                name: missingUser.name,
                email: missingUser.email,
                password: hashPassword(missingUser.password || ""),
                department: missingUser.department,
                role: missingUser.role === "tecnico" ? "tecnico" : "colaborador",
                mustChangePassword: missingUser.mustChangePassword !== false
              };
              await saveSupabaseUser(uMapped);
              secured.push(uMapped);
              needsRewriteSupabase = true;
            }
          }

          try {
            fs.writeFileSync(USERS_FILE, JSON.stringify(secured, null, 2), "utf-8");
          } catch (e) {}
          cachedUsers = secured;
          lastUsersCacheTime = Date.now();
        }
      })
      .catch((error) => {
        console.warn("Erro na revalidação em segundo plano dos colaboradores do Supabase:", error);
      })
      .finally(() => {
        isRevalidatingUsers = false;
      });
  }

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

  if (isSupabaseConfigured() && isSupabaseHealthy()) {
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
    console.log("GEMINI_API_KEY não configurada. Usando triagem padrão local.");
    return defaultLocalTriage(title, description);
  }

  const modelsToTry = ["gemini-3.5-flash", "gemini-3.1-flash-lite"];
  for (let attempt = 1; attempt <= modelsToTry.length; attempt++) {
    const currentModel = modelsToTry[attempt - 1];
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
        model: currentModel,
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
      console.warn(`[Gemini API] Tentativa ${attempt}/${modelsToTry.length} com modelo ${currentModel} falhou:`, error?.message || error);
      if (attempt < modelsToTry.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  console.log("[Gemini API] Todas as tentativas falharam ou o modelo está indisponível temporariamente. Utilizando triagem local inteligente.");
  return defaultLocalTriage(title, description);
}

// REST API Endpoints

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

// Secure client-side Gemini Triage API proxy
app.post("/api/triage", requireAuth, async (req, res) => {
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

app.get("/api/supabase/sql", requireAuth, requireTech, (req, res) => {
  res.setHeader("Content-Type", "text/plain");
  res.send(SUPABASE_SQL_SCHEMA);
});

app.post("/api/supabase/sync", requireAuth, requireTech, async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.status(400).json({ error: "Supabase não está configurado. Por favor, adicione as credenciais SUPABASE_URL e SUPABASE_KEY no painel de Secrets." });
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

app.post("/api/supabase/pull", requireAuth, requireTech, async (req, res) => {
  try {
    if (!isSupabaseConfigured()) {
      return res.status(400).json({ error: "Supabase não está configurado. Por favor, adicione as credenciais SUPABASE_URL e SUPABASE_KEY no painel de Secrets." });
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

    // Update in-memory cache immediately so that it is active on stateless/serverless runtimes
    cachedUsers = securedUsers;
    lastUsersCacheTime = Date.now();
    cachedTickets = supabaseTickets;
    lastTicketsCacheTime = Date.now();

    try {
      fs.writeFileSync(USERS_FILE, JSON.stringify(securedUsers, null, 2), "utf-8");
      fs.writeFileSync(DB_FILE, JSON.stringify(supabaseTickets, null, 2), "utf-8");
    } catch (fsError) {
      console.warn("Não foi possível salvar os dados importados no disco local:", fsError);
    }

    res.json({
      message: "Dados importados do Supabase com sucesso!",
      usersCount: securedUsers.length,
      ticketsCount: supabaseTickets.length
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Erro desconhecido ao puxar dados." });
  }
});

// Heartbeat endpoint to track user online status in real-time
app.post("/api/heartbeat", (req, res) => {
  const { email, name } = req.body;
  if (email && typeof email === "string") {
    markUserActive(email);
  }
  if (name && typeof name === "string") {
    markUserActive(name);
  }
  res.json({ status: "ok" });
});

// PRESENÇA (não é sessão). Chamado via navigator.sendBeacon quando a página é descarregada (F5, navegação,
// fechar aba, app em segundo plano no celular) para a presença limpar na hora em vez de esperar o heartbeat.
//
// IMPORTANTE: este aviso NUNCA encerra a sessão. Antes ele invalidava o token e, como o evento de descarga
// também dispara ao recarregar a página, qualquer F5 desconectava o usuário. A sessão só termina por logout
// explícito (/api/logout), revogação administrativa ou vencimento (SESSION_TTL_MS).
//
// A identidade vem da SESSÃO validada pelo token (o corpo não é confiável): sem token válido o aviso é
// ignorado, então ninguém consegue derrubar a presença de outra pessoa. O sendBeacon não envia cabeçalhos,
// por isso o token segue no corpo (nunca é devolvido na resposta).
app.post("/api/offline", (req, res) => {
  const { token } = req.body || {};
  if (token && typeof token === "string") {
    const record = loadSessions()[token];
    if (record && record.expiresAt > Date.now()) {
      markUserOffline(record.email);
      markUserOffline(record.name);
    }
  }
  res.json({ status: "ok" });
});

// Logout explícito: revoga o token no servidor e limpa a presença imediatamente.
app.post("/api/logout", requireAuth, (req, res) => {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    destroySession(header.slice("Bearer ".length).trim());
  }
  const who: SessionRecord | undefined = (req as any).authUser;
  if (who) {
    markUserOffline(who.email);
    markUserOffline(who.name);
  }
  res.json({ status: "ok" });
});

// Login/Auth endpoint
// ── "Esqueci a senha" (somente colaboradores) ─────────────────────────────────
// Redefinição sem e-mail: o colaborador informa o e-mail e escolhe a nova senha.
// Contas de técnico/admin NUNCA podem ser redefinidas por aqui (a TI altera pela gestão de colaboradores).
// Limite simples por IP para dificultar abuso.
const forgotAttempts = new Map<string, { count: number; resetAt: number }>();
const FORGOT_MAX = 8;
const FORGOT_WINDOW_MS = 15 * 60 * 1000;

app.post("/api/forgot-password", async (req, res) => {
  try {
    const ip = String(req.ip || req.socket.remoteAddress || "unknown");
    const now = Date.now();
    const rec = forgotAttempts.get(ip);
    if (!rec || rec.resetAt <= now) {
      forgotAttempts.set(ip, { count: 1, resetAt: now + FORGOT_WINDOW_MS });
    } else {
      rec.count++;
      if (rec.count > FORGOT_MAX) {
        return res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." });
      }
    }

    const { email, newPassword } = req.body || {};
    if (typeof email !== "string" || typeof newPassword !== "string" || !email.trim() || !newPassword) {
      return res.status(400).json({ error: "Informe o e-mail e a nova senha." });
    }
    if (newPassword.length < 6 || !/\d/.test(newPassword) || !/[a-zA-Z]/.test(newPassword)) {
      return res.status(400).json({ error: "A senha deve ter ao menos 6 caracteres, com letras e números." });
    }

    const emailLower = email.trim().toLowerCase();
    const users = await loadUsers();
    let index = users.findIndex(u => u.email.toLowerCase() === emailLower);

    // O login consulta o Supabase primeiro; fazemos o mesmo aqui para não depender de cache local defasado.
    let dbUser: User | null = null;
    if (isSupabaseConfigured() && isSupabaseHealthy()) {
      try { dbUser = (await getSupabaseUserByEmail(emailLower)) || null; } catch { dbUser = null; }
    }
    const found: User | null = dbUser || (index !== -1 ? users[index] : null);

    if (!found) {
      console.log(`[Forgot Password] E-mail não cadastrado: ${emailLower}`);
      return res.status(404).json({ error: "E-mail não cadastrado. Confira o endereço digitado." });
    }
    if (found.role !== "colaborador") {
      console.log(`[Forgot Password] Conta não-colaborador recusada: ${emailLower} (${found.role})`);
      return res.status(403).json({ error: "Esta conta é da equipe de TI e não pode ser redefinida por aqui. Procure outro técnico." });
    }

    const user: User = { ...(index !== -1 ? users[index] : found), ...found, password: newPassword, mustChangePassword: false, updatedAt: new Date().toISOString() } as User;
    if (index === -1) { users.push(user); index = users.length - 1; } else { users[index] = user; }
    await saveUsers(users, user);

    if (isSupabaseConfigured() && isSupabaseHealthy()) {
      try {
        await saveSupabaseUser({
          id: user.id,
          name: user.name,
          email: user.email,
          password: newPassword,
          department: user.department,
          role: "colaborador",
          mustChangePassword: false
        });
      } catch (dbErr: any) {
        console.error("[Forgot Password] Falha ao sincronizar com Supabase:", dbErr.message);
      }
    }

    // Sessões antigas dessa conta deixam de valer.
    revokeSessionsForUser(user.id);
    console.log(`[Forgot Password] Senha redefinida para colaborador: ${emailLower}`);
    res.json({ success: true, message: "Senha redefinida com sucesso. Entre com a nova senha." });
  } catch (error) {
    console.error("Erro em /api/forgot-password:", error);
    res.status(500).json({ error: "Erro interno ao redefinir a senha." });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "E-mail e senha são obrigatórios para realizar o login." });
    }

    const emailLower = email.trim().toLowerCase();

    // If this is an initial user, ensure they are registered and fully synced before continuing
    const matchInitial = initialUsers.find(u => u.email.toLowerCase() === emailLower);
    if (matchInitial) {
      const allUsers = await loadUsers();
      if (!allUsers.some(u => u.email.toLowerCase() === emailLower)) {
        console.log(`[Login Pre-check] Registrando usuário inicial ausente: ${emailLower}`);
        const uMapped: User = {
          id: matchInitial.id,
          name: matchInitial.name,
          email: matchInitial.email,
          password: hashPassword(matchInitial.password || ""),
          department: matchInitial.department,
          role: matchInitial.role === "tecnico" ? "tecnico" : "colaborador",
          mustChangePassword: matchInitial.mustChangePassword !== false
        };
        allUsers.push(uMapped);
        cachedUsers = allUsers;
        try {
          fs.writeFileSync(USERS_FILE, JSON.stringify(allUsers, null, 2), "utf-8");
        } catch (e) {}
        if (isSupabaseConfigured() && isSupabaseHealthy()) {
          await saveSupabaseUser(uMapped);
        }
      }
    }

    // If Supabase database is configured, try authenticating with database query first
    if (isSupabaseConfigured() && isSupabaseHealthy()) {
      try {
        console.log(`[Supabase Login] Procurando usuário na tabela 'users' para o e-mail: ${emailLower}`);

        const dbUser = await getSupabaseUserByEmail(emailLower);

        if (dbUser) {
          console.log(`[Supabase Login] Usuário encontrado na tabela 'users': ${dbUser.name} (${dbUser.role})`);
          
          // Compare password (supports bcrypt and legacy sha256 hashes)
          const storedPass = dbUser.password || "";
          const isMatch = verifyPassword(password, storedPass);
          if (isMatch) {
            const mustChange = dbUser.mustChangePassword !== false;

            const loggedUser: User = {
              id: dbUser.id,
              name: dbUser.name,
              email: dbUser.email,
              password: dbUser.password,
              department: dbUser.department,
              role: dbUser.role,
              mustChangePassword: mustChange
            };

            // Self-heal/cache locally so they immediately show up in active list and stay perfectly in sync
            try {
              const localUsers = await loadUsers();
              const existingIdx = localUsers.findIndex(u => u.email.toLowerCase() === emailLower);
              if (existingIdx === -1) {
                localUsers.push(loggedUser);
                fs.writeFileSync(USERS_FILE, JSON.stringify(localUsers, null, 2), "utf-8");
              } else {
                // Keep details in sync with Supabase (especially password / mustChangePassword)
                localUsers[existingIdx] = {
                  ...localUsers[existingIdx],
                  password: loggedUser.password,
                  mustChangePassword: loggedUser.mustChangePassword,
                  name: loggedUser.name,
                  role: loggedUser.role,
                  department: loggedUser.department
                };
                fs.writeFileSync(USERS_FILE, JSON.stringify(localUsers, null, 2), "utf-8");
              }
            } catch (cacheErr) {
              console.error("[Supabase Login] Falha ao atualizar cache local do usuário:", cacheErr);
            }

            // Mark active immediately
            markUserActive(emailLower);
            if (loggedUser.name) markUserActive(loggedUser.name);

            const token = createSession({ id: loggedUser.id, name: loggedUser.name, email: loggedUser.email, role: loggedUser.role });

            return res.json({
              id: loggedUser.id,
              name: loggedUser.name,
              email: loggedUser.email,
              department: loggedUser.department,
              role: loggedUser.role,
              mustChangePassword: mustChange,
              token
            });
          } else {
            return res.status(401).json({ error: "Senha de acesso incorreta." });
          }
        }
      } catch (authExc) {
        console.error("[Supabase Login] Exceção geral de login:", authExc);
      }
    }

    const users = await loadUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      return res.status(401).json({ error: "E-mail de colaborador não cadastrado." });
    }

    if (!verifyPassword(password, user.password || "")) {
      return res.status(401).json({ error: "Senha de acesso incorreta." });
    }

    const mustChange = user.mustChangePassword !== false;

    const token = createSession({ id: user.id, name: user.name, email: user.email, role: user.role });

    // Retorna o usuário de forma segura
    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      department: user.department,
      role: user.role,
      mustChangePassword: mustChange,
      token
    };

    // Mark active immediately
    markUserActive(email);
    if (user.name) markUserActive(user.name);

    res.json(safeUser);
  } catch (error) {
    console.error("Erro no login:", error);
    res.status(500).json({ error: "Erro interno ao processar a autenticação." });
  }
});

// Change Password endpoint
app.post("/api/change-password", requireAuth, async (req, res) => {
  try {
    const { email, oldPassword, newPassword } = req.body;
    const authUser: SessionRecord = (req as any).authUser;

    if (!email || !newPassword) {
      return res.status(400).json({ error: "E-mail e nova senha são obrigatórios." });
    }

    // A valid session only proves who's logged in, not that they're allowed
    // to change *this* account's password.
    if (authUser.email.toLowerCase() !== String(email).toLowerCase()) {
      return res.status(403).json({ error: "Você só pode alterar a senha da sua própria conta." });
    }

    const users = await loadUsers();
    const index = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());

    if (index === -1) {
      return res.status(404).json({ error: "Colaborador não encontrado." });
    }

    const user = users[index];

    // The forced first-login flow (mustChangePassword) already proved identity
    // via the temporary password at login, so oldPassword isn't required there.
    // Any later, voluntary password change must re-prove the current password.
    if (user.mustChangePassword === false) {
      if (!oldPassword) {
        return res.status(400).json({ error: "Informe sua senha atual para definir uma nova." });
      }
      if (!user.password || !verifyPassword(oldPassword, user.password)) {
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
    if (isSupabaseConfigured() && isSupabaseHealthy()) {
      try {
        const dbUser: User = {
          id: user.id,
          name: user.name,
          email: user.email,
          password: newPassword, // saveSupabaseUser will hash this securely
          department: user.department,
          role: user.role as "colaborador" | "tecnico",
          mustChangePassword: false
        };
        const success = await saveSupabaseUser(dbUser);
        if (success) {
          console.log("[Supabase Change Password] Senha atualizada com sucesso no Supabase para:", email);
        } else {
          console.error("[Supabase Change Password] Falha ao atualizar senha no Supabase para:", email);
        }
      } catch (dbErr: any) {
        console.error("[Supabase Change Password] Falha ao sincronizar com Supabase:", dbErr.message);
      }
    }

    res.json({ success: true, message: "Sua senha pessoal foi estabelecida com sucesso." });
  } catch (error) {
    console.error("Erro ao alterar senha:", error);
    res.status(500).json({ error: "Erro interno ao redefinir a sua senha." });
  }
});

// ── Fotos de perfil (somente contas Técnico / Admin podem adicionar, trocar ou remover) ──

function loadPhotos(): Record<string, string> {
  try {
    if (fs.existsSync(PHOTOS_FILE)) {
      const raw = fs.readFileSync(PHOTOS_FILE, "utf-8").trim();
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
      }
    }
  } catch (e) {
    console.error("Erro ao ler fotos de perfil:", e);
  }
  return {};
}

function savePhotos(photos: Record<string, string>) {
  try {
    fs.writeFileSync(PHOTOS_FILE, JSON.stringify(photos), "utf-8");
  } catch (e) {
    console.error("Erro ao salvar fotos de perfil:", e);
  }
}

app.put("/api/users/:id/photo", requireAuth, requireTech, async (req, res) => {
  try {
    const { id } = req.params;
    const users = await loadUsers();
    if (!users.some((u) => u.id === id)) return res.status(404).json({ error: "Colaborador não encontrado." });
    const { photo } = req.body || {};
    if (!validPhotoDataUrl(photo)) {
      return res.status(400).json({ error: "Envie uma imagem JPEG, PNG ou WEBP válida (até cerca de 300 KB)." });
    }
    const photos = loadPhotos();
    photos[id] = photo;
    savePhotos(photos);
    res.json({ id, photo });
  } catch (error) {
    console.error("Erro ao salvar foto de perfil:", error);
    res.status(500).json({ error: "Erro interno ao salvar a foto." });
  }
});

app.delete("/api/users/:id/photo", requireAuth, requireTech, async (req, res) => {
  try {
    const { id } = req.params;
    const photos = loadPhotos();
    if (photos[id]) {
      delete photos[id];
      savePhotos(photos);
    }
    res.json({ id, photo: null });
  } catch (error) {
    console.error("Erro ao remover foto de perfil:", error);
    res.status(500).json({ error: "Erro interno ao remover a foto." });
  }
});

// List all users (collaborators)
app.get("/api/users", requireAuth, async (req, res) => {
  try {
    const users = await loadUsers();
    const now = Date.now();
    const photos = loadPhotos();
    const usersWithStatus = users.map(u => {
      // User is considered online if they had login/heartbeat activity recently
      const isOnline = isUserOnline(u.email, u.name, now);
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        department: u.department,
        role: u.role,
        isOnline,
        ...(photos[u.id] ? { photo: photos[u.id] } : {})
      };
    });
    res.json(usersWithStatus);
  } catch (error) {
    console.error("Erro ao listar colaboradores:", error);
    res.status(500).json({ error: "Erro interno ao carregar colaboradores." });
  }
});

// Create a new user (collaborator)
app.post("/api/users", requireAuth, requireTech, async (req, res) => {
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
app.put("/api/users/:id", requireAuth, requireTech, async (req, res) => {
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

    if (role && role !== "colaborador" && role !== "tecnico") {
      return res.status(400).json({ error: "Nível de acesso inválido." });
    }

    // Never let the last technician be demoted — nobody would be able to manage users anymore.
    if (role === "colaborador" && currentUser.role === "tecnico" &&
        users.filter(u => u.role === "tecnico").length <= 1) {
      return res.status(400).json({ error: "Não é permitido rebaixar o único técnico de TI cadastrado." });
    }

    const passwordChanged = !!(password && String(password).trim() !== "");
    const updatedUser: User = {
      id,
      name: name || currentUser.name,
      email: email || currentUser.email,
      password: passwordChanged ? hashPassword(password) : currentUser.password,
      department: department || currentUser.department,
      role: (role as "colaborador" | "tecnico") || currentUser.role,
      // A password set by an admin is temporary: the user must pick their own at next login.
      mustChangePassword: passwordChanged ? true : currentUser.mustChangePassword
    };

    users[index] = updatedUser;
    await saveUsers(users, updatedUser);

    const loginChanged =
      passwordChanged ||
      updatedUser.email.toLowerCase() !== currentUser.email.toLowerCase() ||
      updatedUser.role !== currentUser.role;
    if (loginChanged) {
      const header = req.headers.authorization || "";
      const currentToken = header.startsWith("Bearer ") ? header.slice(7).trim() : undefined;
      const isSelf = (req as any).authUser?.id === id;
      revokeSessionsForUser(id, isSelf ? currentToken : undefined);
    }

    const safeUser = {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      department: updatedUser.department,
      role: updatedUser.role,
      mustChangePassword: updatedUser.mustChangePassword
    };

    res.json(safeUser);
  } catch (error) {
    console.error("Erro ao atualizar colaborador:", error);
    res.status(500).json({ error: "Erro interno ao processar a atualização." });
  }
});

// Delete a user (collaborator)
app.delete("/api/users/:id", requireAuth, requireTech, async (req, res) => {
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

    const photos = loadPhotos();
    if (photos[id]) {
      delete photos[id];
      savePhotos(photos);
    }

    res.json({ message: `Colaborador ${userToDelete.name} removido com sucesso.` });
  } catch (error) {
    console.error("Erro ao remover colaborador:", error);
    res.status(500).json({ error: "Erro interno ao remover colaborador de TI." });
  }
});

// List all tickets
app.get("/api/tickets", requireAuth, async (req, res) => {
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
app.post("/api/tickets", requireAuth, async (req, res) => {
  try {
    const { title, description, requesterName, requesterDepartment, screenshot, projectDeadline, attachments } = req.body;

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

    const createdIso = new Date().toISOString();
    const initialEvents: SlaEvent[] = [];
    // Classificação inicial (triagem local) — definição da prioridade, não uma "alteração".
    addSlaEvent(initialEvents, { type: "priority_initial", by: "Sistema (triagem local)", source: "triagem_local", toPriority: triage.priority, suggestedPriority: triage.priority, suggestedAt: createdIso });

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
      firstAssignedTo: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      slaLimit: new Date(Date.now() + 3600000 * hoursToAdd).toISOString(),
      aiCategory: "Analisando...",
      aiPriority: "Analisando...",
      aiReasoning: "A inteligência artificial está analisando o seu chamado em segundo plano...",
      aiSuggestions: "Aguardando conclusão da análise do Gemini...",
      slaEvents: initialEvents,
      screenshot: screenshot || undefined,
      projectDeadline: projectDeadline || undefined,
      attachments: attachments || undefined,
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
          // Classificação inicial da IA = definição da prioridade (não é alteração). Mas se um técnico já
          // alterou a prioridade manualmente enquanto a IA analisava, a decisão humana prevalece.
          const aiEvents: SlaEvent[] = [...(ticketToUpdate.slaEvents || [])];
          const manualPriority = aiEvents.some((e) => e.type === "priority_change");
          const priorityBeforeAi = ticketToUpdate.priority;
          if (!manualPriority) ticketToUpdate.priority = geminiTriage.priority as Ticket["priority"];
          addSlaEvent(aiEvents, {
            type: "priority_initial", by: "IA Triagem GRAN7 HELP", source: "ia",
            fromPriority: priorityBeforeAi, toPriority: ticketToUpdate.priority, suggestedPriority: geminiTriage.priority, suggestedAt: new Date().toISOString(),
            ...(manualPriority ? { reason: "Sugestão da IA não aplicada: a prioridade já havia sido alterada manualmente." } : {}),
          });
          ticketToUpdate.slaEvents = aiEvents;
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
          // slaLimit é um campo LEGADO (horas corridas), mantido só por compatibilidade; o SLA oficial vem de src/lib/sla.
          if (!manualPriority) ticketToUpdate.slaLimit = new Date(new Date(ticketToUpdate.createdAt).getTime() + 3600000 * newHoursToAdd).toISOString();

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
app.patch("/api/tickets/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, priority, category, assignedTo, projectDeadline, requesterName, requesterDepartment, pauseReason, reopenReason, reopenCategory } = req.body;
    // Server-verified identity — not something the client can spoof via the body anymore.
    const requesterUser: string = (req as any).authUser.name;

    const tickets = await loadTickets();
    const index = tickets.findIndex(t => t.id === id);

    if (index === -1) {
      return res.status(404).json({ error: "Chamado não encontrado." });
    }

    const oldTicket = tickets[index];
    const updatedTicket = { ...oldTicket };

    // Validation: prevent another technician/user from modifying an already assigned ticket (stealing, priority change, category change, finalization).
    // Deliberately does NOT exempt technicians in general — only the specific
    // assigned tech(s), checked right below, may act on an assigned ticket.
    if (oldTicket.assignedTo) {
      const assignedTechs = oldTicket.assignedTo.split(",").map(s => s.trim()).filter(Boolean);
      if (requesterUser && !assignedTechs.includes(requesterUser)) {
        const isChangingAssignedTo = assignedTo !== undefined && assignedTo !== oldTicket.assignedTo;
        const isChangingPriority = priority !== undefined && priority !== oldTicket.priority;
        const isChangingStatus = status !== undefined && status !== oldTicket.status;
        const isChangingCategory = category !== undefined && category !== oldTicket.category;
        const isChangingDeadline = projectDeadline !== undefined && projectDeadline !== oldTicket.projectDeadline;
        const isChangingRequester = requesterName !== undefined && requesterName !== oldTicket.requesterName;

        if (isChangingAssignedTo || isChangingPriority || isChangingStatus || isChangingCategory || isChangingDeadline || isChangingRequester) {
          return res.status(403).json({ 
            error: `Este chamado já está atribuído a ${oldTicket.assignedTo}. Apenas os técnicos responsáveis podem alterar suas informações, transferi-lo ou finalizá-lo.` 
          });
        }
      }
    }

    // Validation: Only the first assigned technician can change/assign other technicians.
    if (assignedTo !== undefined && assignedTo !== oldTicket.assignedTo) {
      const oldTechs = oldTicket.assignedTo ? oldTicket.assignedTo.split(",").map(s => s.trim()).filter(Boolean) : [];
      if (oldTechs.length > 0) {
        const firstTech = oldTicket.firstAssignedTo || oldTechs[0];
        if (requesterUser && requesterUser !== firstTech) {
          return res.status(403).json({ 
            error: `Apenas o primeiro técnico responsável por este chamado (${firstTech}) pode alterar as atribuições de técnicos.` 
          });
        }
      }
    }

    // SLA: "Aguardando Solicitante" só é uma espera legítima se for pedida por um técnico,
    // o chamado estiver em atendimento por alguém e ainda não estiver encerrado.
    const wantsWaiting = status === WAITING_STATUS && status !== oldTicket.status;
    if (wantsWaiting) {
      if ((req as any).authUser.role !== "tecnico") {
        return res.status(403).json({ error: "Apenas técnicos podem colocar o chamado em espera pelo solicitante." });
      }
      if (FINAL_STATUSES.includes(oldTicket.status)) {
        return res.status(400).json({ error: "Chamado encerrado não pode aguardar o solicitante. Reabra-o primeiro." });
      }
      const willHaveTech = assignedTo !== undefined ? !!assignedTo : !!oldTicket.assignedTo;
      if (!willHaveTech) {
        return res.status(400).json({ error: "Atribua um técnico ao chamado antes de aguardar o solicitante." });
      }
    }
    // Reabertura (final → não final): motivo descritivo e categoria são obrigatórios e ficam auditados.
    const wantsReopen = status !== undefined && status !== oldTicket.status && FINAL_STATUSES.includes(oldTicket.status) && !FINAL_STATUSES.includes(status);
    const reopenText = typeof reopenReason === "string" ? reopenReason.trim() : "";
    if (wantsReopen) {
      const actor = (req as any).authUser;
      if (actor.role !== "tecnico" && actor.name !== oldTicket.requesterName) {
        return res.status(403).json({ error: "Apenas técnicos ou o solicitante podem reabrir o chamado." });
      }
      if (!REOPEN_CATEGORIES.some((c) => c.value === reopenCategory)) {
        return res.status(400).json({ error: "Informe a categoria da reabertura." });
      }
      if (reopenText.length < REOPEN_MIN_REASON_LENGTH) {
        return res.status(400).json({ error: `Descreva o motivo da reabertura (mínimo de ${REOPEN_MIN_REASON_LENGTH} caracteres).` });
      }
    }
    const slaEvents: SlaEvent[] = [...(oldTicket.slaEvents || [])];
    const wasPaused = isSlaPaused(oldTicket);

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

      if (wantsWaiting && !wasPaused) {
        const reason = (typeof pauseReason === "string" && pauseReason.trim()) || "Aguardando resposta do solicitante";
        addSlaEvent(slaEvents, { type: "pause", by: requesterUser, reason: reason.slice(0, 300), fromStatus: oldTicket.status, toStatus: status });
        changeLog.push(`SLA de resolução pausado: **${reason.slice(0, 300)}**`);
      } else if (wasPaused && status !== WAITING_STATUS) {
        addSlaEvent(slaEvents, { type: "resume", by: requesterUser, trigger: FINAL_STATUSES.includes(status) ? "ticket_resolved" : "manual_status_change", toStatus: status });
        changeLog.push(`SLA de resolução retomado (mudança de status)`);
      }

      // Resolução: a PRIMEIRA grava o SLA original (snapshot congelado). Resoluções seguintes
      // (após reabertura) só encerram o ciclo de correção — o SLA original nunca é recalculado.
      if (FINAL_STATUSES.includes(status) && !FINAL_STATUSES.includes(oldTicket.status)) {
        const nowMs = Date.now();
        const isFirst = computeTicketSla({ ...oldTicket, slaEvents } as any, nowMs).resolution.resolvedAt === null;
        const snapshot = isFirst ? buildResolutionSnapshot({ ...oldTicket, slaEvents } as any, nowMs) : null;
        addSlaEvent(slaEvents, { type: "resolve", by: requesterUser, fromStatus: oldTicket.status, toStatus: status, first: !!snapshot, ...(snapshot ? { snapshot } : {}) });
      } else if (wantsReopen) {
        addSlaEvent(slaEvents, { type: "reopen", by: requesterUser, fromStatus: oldTicket.status, toStatus: status, reason: reopenText.slice(0, 500), category: reopenCategory });
        changeLog.push(`Chamado reaberto (${REOPEN_CATEGORIES.find((c) => c.value === reopenCategory)?.label}): **${reopenText.slice(0, 500)}**`);
      }

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
      // Auditoria: guarda quem mudou, de/para e as violações já ocorridas (que nunca são apagadas).
      // O relógio NÃO reinicia: o tempo útil consumido continua valendo (regra provisória).
      addSlaEvent(slaEvents, { type: "priority_change", by: requesterUser, fromPriority: oldTicket.priority, toPriority: priority, breached: breachesAt({ ...oldTicket, slaEvents } as any, Date.now()) });
      
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
      const oldTechs = oldTicket.assignedTo ? oldTicket.assignedTo.split(",").map(s => s.trim()).filter(Boolean) : [];
      const newTechs = assignedTo ? assignedTo.split(",").map(s => s.trim()).filter(Boolean) : [];

      const added = newTechs.filter(t => !oldTechs.includes(t));
      const removed = oldTechs.filter(t => !newTechs.includes(t));

      if (added.length > 0) {
        changeLog.push(`Técnico(s) adicionado(s): **${added.join(", ")}**`);
      }
      if (removed.length > 0) {
        changeLog.push(`Técnico(s) removido(s): **${removed.join(", ")}**`);
      }

      updatedTicket.assignedTo = assignedTo || null;

      if (newTechs.length > 0) {
        if (!oldTicket.firstAssignedTo) {
          updatedTicket.firstAssignedTo = newTechs[0];
        }
      } else {
        updatedTicket.firstAssignedTo = null;
      }

      if (newTechs.length > 0 && oldTicket.status === "Aberto") {
        updatedTicket.status = "Em Atendimento";
        changeLog.push(`Status alterado automaticamente para **Em Atendimento**`);
      }
    }

    if (changeLog.length > 0) {
      updatedTicket.updatedAt = new Date().toISOString();
      if (slaEvents.length !== (oldTicket.slaEvents || []).length) updatedTicket.slaEvents = slaEvents;
      
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
app.post("/api/tickets/:id/comments", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { content, attachmentUrl, attachmentName } = req.body;
    // Author is the verified session, not whatever the client claims.
    const authUser: SessionRecord = (req as any).authUser;
    const authorName = authUser.name;
    const authorRole = authUser.role;

    if (!content) {
      return res.status(400).json({ error: "Conteúdo da mensagem é obrigatório." });
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

    // SLA: a resposta do SOLICITANTE (sessão autenticada, nunca IA/sistema) retoma a contagem.
    if (authorRole === "colaborador" && authorName === ticket.requesterName && ticket.status === WAITING_STATUS && isSlaPaused(ticket)) {
      const events: SlaEvent[] = [...(ticket.slaEvents || [])];
      const pauseEvent = [...events].reverse().find((e) => e.type === "pause");
      const back = pauseEvent?.fromStatus && !FINAL_STATUSES.includes(pauseEvent.fromStatus) && pauseEvent.fromStatus !== WAITING_STATUS ? pauseEvent.fromStatus : "Em Atendimento";
      addSlaEvent(events, { type: "resume", by: authorName, trigger: "requester_reply", commentId: newComment.id, toStatus: back });
      ticket.slaEvents = events;
      ticket.status = back as Ticket["status"];
      ticket.comments.push({
        id: `sys-log-${Date.now()}-r`,
        authorName: "Sistema GRAN7 HELP",
        authorRole: "system",
        content: `Status alterado de **${WAITING_STATUS}** para **${back}**
SLA de resolução retomado: resposta do solicitante`,
        timestamp: new Date().toISOString(),
      });
    }

    tickets[index] = ticket;
    await saveTickets(tickets, ticket);

    // `ticket` permite ao cliente adotar o estado oficial (status/SLA) calculado aqui.
    res.status(201).json({ ...newComment, ticket });
  } catch (error) {
    console.error("Erro ao adicionar comentário:", error);
    res.status(500).json({ error: "Erro interno ao adicionar comentário." });
  }
});

// Delete a ticket (IT Team / Técnico only)
app.delete("/api/tickets/:id", requireAuth, requireTech, async (req, res) => {
  try {
    const { id } = req.params;
    const userName = (req as any).authUser.name;

    const tickets = await loadTickets();
    const index = tickets.findIndex(t => t.id === id);

    if (index === -1) {
      return res.status(404).json({ error: "Chamado não encontrado." });
    }

    const ticket = tickets[index];
    const assignedTechs = ticket.assignedTo ? ticket.assignedTo.split(",").map(s => s.trim()).filter(Boolean) : [];
    if (!assignedTechs.includes(userName)) {
      return res.status(403).json({ error: "Apenas um dos técnicos responsáveis por este chamado pode excluí-lo." });
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
app.post("/api/reset", requireAuth, requireTech, async (req, res) => {
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

// Catch-all 404 handler for /api/* routes to ensure requests to /api never fall through to Vite HTML
app.all("/api/*", (req, res) => {
  res.status(404).json({ error: `Rota de API '${req.method} ${req.path}' não encontrada.` });
});

// Global error handler for API routes
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.path.startsWith("/api")) {
    console.error("Erro interno no servidor API:", err);
    return res.status(500).json({ error: err.message || "Erro interno no processamento da API." });
  }
  next(err);
});

// Serve frontend assets
const isProduction = process.env.NODE_ENV === "production" || 
                     !!process.env.VERCEL || 
                     !fs.existsSync(path.join(process.cwd(), "server.ts")) ||
                     (typeof process !== "undefined" && process.argv && process.argv[1] && process.argv[1].endsWith(".cjs"));

if (!isProduction) {
  const startVite = async () => {
    const { createServer: createViteServer } = await import("vite");
    // O canal de atualização ao vivo (HMR) do Vite usa uma porta fixa (24678) que colide com qualquer outro
    // Vite aberto. Fora da porta padrão, derivamos uma porta própria (PORT + 20000) para cada instância.
    const hmrPort = typeof PORT === "number" && PORT !== 3000 && PORT < 45000 ? PORT + 20000 : undefined;
    const vite = await createViteServer({
      server: { middlewareMode: true, ...(hmrPort ? { hmr: { port: hmrPort } } : {}) },
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
