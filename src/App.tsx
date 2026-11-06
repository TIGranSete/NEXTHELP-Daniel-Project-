import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Ticket, Comment, UserSession, UserRole, User, Attachment } from "./types";
import { getApiUrl, apiFetch } from "./lib/api";
import { 
  fetchTicketsFromSupabase, 
  saveTicketToSupabase, 
  deleteTicketFromSupabase, 
  fetchUsersFromSupabase, 
  saveUserToSupabase, 
  deleteUserFromSupabase,
  getBrowserSupabaseClient,
  getSupabaseCredentials,
  saveSupabaseCredentials
} from "./lib/supabaseClient";
import { INITIAL_USERS } from "./data/initialUsers";
import SlaAnalytics from "./components/SlaAnalytics";
import LoginScreen from "./components/LoginScreen";
import ChangePasswordScreen from "./components/ChangePasswordScreen";
import Gran7Brand from "./components/Gran7Brand";
import NotificationGuideModal from "./components/NotificationGuideModal";
import NotificationCustomizerModal, { playCustomNotificationSound, SoundTone, ToastStyle } from "./components/NotificationCustomizerModal";
import WindowsDatePicker from "./components/WindowsDatePicker";
import AppLayout from "./components/layout/AppLayout";
import TicketWorkspace from "./components/ticket/TicketWorkspace";
import TicketExpandOverlay, { ExpandOrigin } from "./components/transition/TicketExpandOverlay";
import { REVEAL } from "./components/transition/workspaceReveal";
import { useTicketRoute, ticketIdFromPath } from "./hooks/useTicketRoute";
import LoginLayer from "./components/transition/LoginLayer";
import { TRANSITION_DURATION, resolveAuthFx } from "./components/transition/authTransitionConfig";
import StatCard from "./components/ui/StatCard";
import EmptyState from "./components/ui/EmptyState";
import TicketTable, { TicketTableSkeleton } from "./components/queue/TicketTable";
import QueueToolbar, { hasActiveFilters } from "./components/queue/QueueToolbar";
import logoImg from "./assets/images/logo.png";
import logoBlack from "./assets/images/logo-black.png";
import { useTheme } from "./hooks/useTheme";
import { useNow } from "./hooks/useNow";
import { USER_DEPARTMENTS, canonicalDepartment } from "./lib/departments";
import { fileToAvatarDataUrl } from "./lib/avatar";
import { techProfileMetrics } from "./lib/sla/dashboardData";
import { formatBusinessMinutes } from "./lib/sla/ticketSla";
import { isSmallSample } from "./lib/quality";
import Avatar from "./components/ui/Avatar";
import { PROJECTS_MODULE_ENABLED } from "./components/layout/navigation";
import CollaboratorsPage from "./components/collaborators/CollaboratorsPage";
import Drawer from "./components/collaborators/Drawer";
import { DEFAULT_COLLAB_FILTERS, presenceOf, roleLabel } from "./lib/collaborators";
import { computeSlaMetrics } from "./lib/sla/metrics";
import { getSlaEscalation as engineSlaEscalation, isReopened as engineIsReopened, isTicketOverdue as engineIsOverdue, resolutionDueAt } from "./lib/sla/compat";
import logoMin from "./assets/images/7.png";
import { 
  Shield, 
  Users, 
  RefreshCw, 
  Cpu, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  Search, 
  PlusCircle, 
  MessageSquare, 
  Sparkles, 
  Send, 
  CheckSquare, 
  Sliders, 
  UserPlus, 
  User as UserIcon,
  Filter, 
  Server, 
  Trash2,
  Calendar,
  Layers,
  ArrowRight,
  LogOut,
  Edit,
  Lock,
  Database,
  Camera,
  Upload,
  Eye,
  ChevronLeft,
  ChevronRight,
  Paperclip,
  FileText,
  Copy,
  Check,
  Terminal,
  Columns,
  Briefcase,
  FolderKanban,
  ArrowLeft,
  Menu,
  X,
  Bell,
  BellOff,
  BellRing,
  HelpCircle,
  Laptop,
  Mail,
  Building,
  Activity,
  Inbox,
  SearchX,
  ServerCrash,
  Hourglass,
  Wrench,
  Flame,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  ListTodo
} from "lucide-react";

const USER_PROFILES: UserSession[] = [];

export function getAssignedTechs(assignedToStr: string | null): string[] {
  if (!assignedToStr) return [];
  return assignedToStr.split(",").map(s => s.trim()).filter(Boolean);
}

export function getFirstAssignedTech(ticket: any): string | null {
  if (ticket.firstAssignedTo) return ticket.firstAssignedTo;
  const techs = getAssignedTechs(ticket.assignedTo);
  return techs[0] || null;
}

function formatDurationText(ms: number): string {
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

const compressImage = (file: File, maxWidth = 1024, maxHeight = 1024, quality = 0.7): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

interface AppNotification {
  id: string;
  ticketId: string;
  title: string;
  requesterName: string;
  timestamp: Date;
  type?: "ticket" | "comment";
  commentText?: string;
  commentAuthor?: string;
}

// Sectors available when creating/editing a collaborator.
export default function App() {
  const { resolvedTheme } = useTheme();

  // Session management
  const [currentSession, setCurrentSession] = useState<UserSession | null>(() => {
    const saved = localStorage.getItem("gran7_session");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  const isTechUser = !!(
    currentSession &&
    (currentSession.role === "tecnico" ||
      (currentSession.role as string) === "ti" ||
      currentSession.department?.toLowerCase().includes("ti") ||
      currentSession.department?.toLowerCase().includes("tecnologia"))
  );
  
  // Navigation tabs (Only available for IT team)
  const [activeTab, setActiveTab] = useState<"painel" | "projetos" | "sla" | "colaboradores" | "banco_dados">("painel");
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [modulesCollapsed, setModulesCollapsed] = useState<boolean>(false);
  const [isMobileModulesOpen, setIsMobileModulesOpen] = useState<boolean>(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState<boolean>(true);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [projectViewMode, setProjectViewMode] = useState<"bento" | "kanban" | "timeline">("bento");
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [draggedOverColumn, setDraggedOverColumn] = useState<string | null>(null);


  // Database status and synchronization states
  const [dbStatus, setDbStatus] = useState<{ configured: boolean; connected: boolean; error: string | null } | null>(null);
  const [dbChecking, setDbChecking] = useState<boolean>(false);
  const [syncingDb, setSyncingDb] = useState<"idle" | "push" | "pull" | "success" | "error">("idle");
  const [syncDbError, setSyncDbError] = useState<string | null>(null);
  const [dbSqlSchema, setDbSqlSchema] = useState<string>("");
  const [copySuccess, setCopySuccess] = useState<boolean>(false);

  // App states
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [loading, setLoading] = useState<boolean>(true);
  const [ticketsError, setTicketsError] = useState<boolean>(false);

  // Transição visual Login → Interface (só visual). null = ociosa; objeto = rodando (variáveis CSS).
  const [authFx, setAuthFx] = useState<React.CSSProperties | null>(null);
  useEffect(() => {
    if (!authFx) return;
    const t = window.setTimeout(() => setAuthFx(null), TRANSITION_DURATION);
    return () => window.clearTimeout(t);
  }, [authFx]);
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [logoError, setLogoError] = useState<boolean>(false);
  const [showPreloader, setShowPreloader] = useState<boolean>(true);
  const [preloaderFadeOut, setPreloaderFadeOut] = useState<boolean>(false);
  const [preloaderProgress, setPreloaderProgress] = useState<number>(0);
  const [minTimeElapsed, setMinTimeElapsed] = useState<boolean>(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMinTimeElapsed(true);
    }, 250); // Ultra-fast minimum display time (250ms)
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Eases toward 99% and self-clears once it gets there, instead of hard-stopping
    // at a fixed number and sitting dead while the real data is still loading.
    const interval = setInterval(() => {
      setPreloaderProgress((prev) => {
        if (prev >= 99) {
          clearInterval(interval);
          return prev;
        }
        const step = prev < 70 ? Math.random() * 14 + 10 : Math.max(0.5, (99 - prev) * 0.15);
        return Math.min(99, prev + step);
      });
    }, 50);

    return () => {
      clearInterval(interval);
    };
  }, []);

  // Sync preloader completion with real database loading completion & minimum timer elapsed
  useEffect(() => {
    if (!loading && minTimeElapsed && showPreloader) {
      setPreloaderProgress(100);
      
      const fadeTimer = setTimeout(() => {
        setPreloaderFadeOut(true);
      }, 80);

      const unmountTimer = setTimeout(() => {
        setShowPreloader(false);
      }, 280);

      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(unmountTimer);
      };
    }
  }, [loading, minTimeElapsed, showPreloader]);
  
  // Notifications states
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const seenTicketIds = useRef<Set<string>>(new Set());
  const seenCommentIds = useRef<Set<string>>(new Set());
  const hasInitializedTicketsRef = useRef<boolean>(false);
  const audioUnlockedRef = useRef<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Auto-unlock Web Audio API on first user interaction for robust notification sounds
  useEffect(() => {
    const unlockAudio = () => {
      if (audioUnlockedRef.current) return;
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const ctx = new AudioContextClass();
          if (ctx.state === "suspended") {
            ctx.resume();
          }
          audioContextRef.current = ctx;
          audioUnlockedRef.current = true;
          console.log("AudioContext desbloqueado e ativado com sucesso após gesto do usuário.");
          // Clean up event listeners once unlocked
          window.removeEventListener("click", unlockAudio);
          window.removeEventListener("keydown", unlockAudio);
          window.removeEventListener("touchstart", unlockAudio);
        }
      } catch (e) {
        console.warn("Falha ao desbloquear o áudio do navegador:", e);
      }
    };

    window.addEventListener("click", unlockAudio);
    window.addEventListener("keydown", unlockAudio);
    window.addEventListener("touchstart", unlockAudio);
    return () => {
      window.removeEventListener("click", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
    };
  }, []);

  // Desktop Notifications State
  const [desktopNotificationPermission, setDesktopNotificationPermission] = useState<NotificationPermission>(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "default"
  );
  const [isNotificationGuideOpen, setIsNotificationGuideOpen] = useState<boolean>(false);
  const [isNotificationCustomizerOpen, setIsNotificationCustomizerOpen] = useState<boolean>(false);

  // Register Service Worker on mount and listen to messages
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js")
        .then((reg) => {
          console.log("Service Worker registrado com sucesso:", reg.scope);
        })
        .catch((err) => {
          console.warn("Falha ao registrar Service Worker:", err);
        });

      // Listen for SELECT_TICKET messages from Service Worker
      const handleMessage = (event: MessageEvent) => {
        if (event.data && event.data.type === "SELECT_TICKET") {
          setSelectedTicketId(event.data.ticketId);
        }
      };
      navigator.serviceWorker.addEventListener("message", handleMessage);
      return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
    }
  }, []);

  // Check URL parameter for ticket pre-selection on load
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const ticketId = params.get("ticket");
      if (ticketId) {
        setSelectedTicketId(ticketId);
      }
    }
  }, []);

  const requestDesktopNotificationPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      console.warn("Este navegador não suporta notificações de área de trabalho.");
      return "default";
    }
    try {
      const permission = await Notification.requestPermission();
      setDesktopNotificationPermission(permission);
      return permission;
    } catch (e) {
      console.error("Erro ao solicitar permissão de notificações:", e);
      return "default";
    }
  };

  const fallbackNotification = (title: string, options: NotificationOptions, ticketId?: string) => {
    try {
      const fullIconUrl = typeof window !== "undefined" ? `${window.location.origin}/icon.png` : "/icon.png";
      const notification = new Notification(title, {
        ...options,
        icon: fullIconUrl,
        badge: fullIconUrl
      });
      if (ticketId) {
        notification.onclick = () => {
          window.focus();
          setSelectedTicketId(ticketId);
        };
      }
    } catch (e) {
      console.warn("Falha no fallback de notificação de área de trabalho:", e);
    }
  };

  const showDesktopNotification = (title: string, body: string, ticketId?: string) => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      const fullIconUrl = `${window.location.origin}/icon.png`;
      const options: NotificationOptions & { data?: any; actions?: any[]; renotify?: boolean; vibrate?: number[] } = {
        body,
        icon: fullIconUrl,
        badge: fullIconUrl,
        tag: ticketId ? `ticket-${ticketId}` : "gran7-alert",
        renotify: true,
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 200],
        data: ticketId ? { ticketId } : undefined,
        actions: [
          { action: "open_ticket", title: "💬 Abrir Chamado no Helpdesk" }
        ]
      };

      // Try service worker notification first (essential for background/desktop notifications)
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.showNotification(title, options)
            .catch((err) => {
              console.warn("Service worker falhou em exibir notificação, usando fallback:", err);
              fallbackNotification(title, options, ticketId);
            });
        }).catch(() => {
          fallbackNotification(title, options, ticketId);
        });
      } else {
        fallbackNotification(title, options, ticketId);
      }
    }
  };

  const testDesktopNotification = async () => {
    let perm = desktopNotificationPermission;
    if (perm !== "granted") {
      perm = await requestDesktopNotificationPermission();
    }
    if (perm === "granted") {
      showDesktopNotification(
        "⚡ GRAN7 HELP • Notificações do Sistema",
        "Sucesso! Permissão ativa no Google Chrome. Notificações nativas configuradas com ícone e atalho para o chat.",
        selectedTicketId || undefined
      );
      playNotificationSound();
    } else if (perm === "denied") {
      setIsNotificationGuideOpen(true);
    }
  };

  // Auto request permission once logged in
  useEffect(() => {
    if (currentSession && typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      const timer = setTimeout(() => {
        requestDesktopNotificationPermission();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [currentSession]);
  
  // Selection/Detail states
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(() => ticketIdFromPath());
  const [newCommentText, setNewCommentText] = useState<string>("");
  const [commentAttachment, setCommentAttachment] = useState<string | null>(null);
  const [commentAttachmentName, setCommentAttachmentName] = useState<string>("");
  
  // Filter/Search states
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [selectedPriority, setSelectedPriority] = useState<string>("All");
  const [selectedStatus, setSelectedStatus] = useState<string>("Active");

  // Collaborators Filter/Search/Sort states
  const [colabSearchTerm, setColabSearchTerm] = useState<string>("");
  const [colabSectorFilter, setColabSectorFilter] = useState<string>("All");
  const [colabRoleFilter, setColabRoleFilter] = useState<string>("All");
  const [colabStatusFilter, setColabStatusFilter] = useState<string>("All");
  const [colabSortBy, setColabSortBy] = useState<string>("name");
  
  // Creation state (tickets)
  const [isNewTicketModalOpen, setIsNewTicketModalOpen] = useState<boolean>(false);
  const [isSubmittingTicket, setIsSubmittingTicket] = useState<boolean>(false);
  const [newTicketForm, setNewTicketForm] = useState<{
    title: string;
    description: string;
    screenshot: string;
    projectDeadline: string;
    attachments: Attachment[];
  }>({
    title: "",
    description: "",
    screenshot: "",
    projectDeadline: "",
    attachments: []
  });
  const [selectedRequesterName, setSelectedRequesterName] = useState<string>("");
  const [selectedRequesterDepartment, setSelectedRequesterDepartment] = useState<string>("");

  // User opened tickets modal state
  const [isMyTicketsModalOpen, setIsMyTicketsModalOpen] = useState<boolean>(false);
  const [myTicketsTab, setMyTicketsTab] = useState<"all" | "unresolved" | "resolved">("all");
  const [myTicketsViewMode, setMyTicketsViewMode] = useState<"created" | "resolved">("created");
  const [selectedTechProfile, setSelectedTechProfile] = useState<User | null>(null);
  const [isTechProfileModalOpen, setIsTechProfileModalOpen] = useState<boolean>(false);
  // Botão que abriu o perfil: o foco volta para ele ao fechar o painel lateral.
  const profileOpenerRef = useRef<HTMLElement | null>(null);
  // Foto de perfil: só contas Técnico (TI/Admin) podem adicionar, trocar ou remover (o servidor também exige).
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [photoBusy, setPhotoBusy] = useState<boolean>(false);
  const [photoError, setPhotoError] = useState<string>("");
  const [profileModalTab, setProfileModalTab] = useState<"overview" | "tickets" | "metrics" | "activity">("overview");
  const [profileTicketsFilter, setProfileTicketsFilter] = useState<"all" | "active" | "resolved" | "projects">("all");
  const [isConfirmingDeleteTicket, setIsConfirmingDeleteTicket] = useState<string | null>(null);

  // User management states
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState<boolean>(false);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);

  // Creation state (users/collaborators)
  const [newUserForm, setNewUserForm] = useState({
    name: "",
    email: "",
    password: "",
    department: "Financeiro",
    role: "colaborador" as UserRole
  });
  const [isSubmittingUser, setIsSubmittingUser] = useState<boolean>(false);
  const [userFormError, setUserFormError] = useState<string>("");
  const [userFormSuccess, setUserFormSuccess] = useState<string>("");

  // Initialize requester name and department when opening modal
  useEffect(() => {
    if (isNewTicketModalOpen && currentSession) {
      setSelectedRequesterName(currentSession.name);
      setSelectedRequesterDepartment(currentSession.department);
    }
  }, [isNewTicketModalOpen, currentSession]);

  const handleGoToHome = () => {
    setActiveTab("painel");
    setSelectedTicketId(null);
    setSelectedTechProfile(null);
    setIsTechProfileModalOpen(false);
    setIsMyTicketsModalOpen(false);
    setIsNewTicketModalOpen(false);
    setMobileMenuOpen(false);
  };

  // Fetch tickets helper with multi-tier fallback (API Express -> Direct Supabase Browser -> Local Cache)
  const fetchTickets = async (showQuietly = false) => {
    if (!showQuietly) {
      // Hydrate instantly from the local cache on first load so the preloader
      // isn't blocked on the network round-trip; the fetch below still runs
      // to refresh with live data once it lands.
      let hydratedFromCache = false;
      if (tickets.length === 0) {
        try {
          const cached = localStorage.getItem("gran7_tickets_cache");
          const cachedTickets = cached ? JSON.parse(cached) : null;
          if (Array.isArray(cachedTickets) && cachedTickets.length > 0) {
            setTickets(cachedTickets);
            setLoading(false);
            hydratedFromCache = true;
          }
        } catch (e) {}
      }
      if (!hydratedFromCache) setLoading(true);
    }
    setIsPolling(true);
    let loadedTickets: Ticket[] | null = null;

    try {
      const response = await apiFetch("/api/tickets");
      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          loadedTickets = await response.json();
        }
      }
    } catch (error) {
      console.warn("API de chamados indisponível via HTTP, buscando via Supabase Direto/Cache local:", error);
    }

    // Tier 2: Try direct browser Supabase client if server returned HTML or failed
    if (!loadedTickets || !Array.isArray(loadedTickets)) {
      const supabaseData = await fetchTicketsFromSupabase();
      if (supabaseData && Array.isArray(supabaseData) && supabaseData.length > 0) {
        loadedTickets = supabaseData;
      }
    }

    // Tier 3: Load from localStorage cache
    if (!loadedTickets || !Array.isArray(loadedTickets)) {
      try {
        const cached = localStorage.getItem("gran7_tickets_cache");
        if (cached) {
          loadedTickets = JSON.parse(cached);
        }
      } catch (e) {
        console.warn("Falha ao ler cache local de chamados:", e);
      }
    }

    setTicketsError(!(loadedTickets && Array.isArray(loadedTickets)));
    if (loadedTickets && Array.isArray(loadedTickets)) {
      setTickets(loadedTickets);
      setLastUpdated(new Date());
      try {
        localStorage.setItem("gran7_tickets_cache", JSON.stringify(loadedTickets));
      } catch (e) {}
    }

    setLoading(false);
    setIsPolling(false);
  };

  // Fetch users helper
  const fetchUsers = async () => {
    let loadedUsers: User[] | null = null;

    try {
      const response = await apiFetch("/api/users");
      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          loadedUsers = await response.json();
        }
      }
    } catch (error) {
      console.warn("API de colaboradores indisponível via HTTP, buscando via Supabase Direto/Cache local:", error);
    }

    // Tier 2: Try direct browser Supabase client
    if (!loadedUsers || !Array.isArray(loadedUsers)) {
      const supabaseUsers = await fetchUsersFromSupabase();
      if (supabaseUsers && Array.isArray(supabaseUsers) && supabaseUsers.length > 0) {
        loadedUsers = supabaseUsers;
      }
    }

    // Tier 3: Load from localStorage cache
    if (!loadedUsers || !Array.isArray(loadedUsers)) {
      try {
        const cached = localStorage.getItem("gran7_users_cache");
        if (cached) {
          loadedUsers = JSON.parse(cached);
        }
      } catch (e) {}
    }

    // Tier 4: Fall back to INITIAL_USERS
    if (!loadedUsers || !Array.isArray(loadedUsers) || loadedUsers.length === 0) {
      loadedUsers = INITIAL_USERS;
    }

    if (loadedUsers && Array.isArray(loadedUsers)) {
      setUsers(loadedUsers);
      try {
        localStorage.setItem("gran7_users_cache", JSON.stringify(loadedUsers));
      } catch (e) {}
    }
  };

  // Fetch database status
  const fetchDbStatus = async () => {
    setDbChecking(true);
    try {
      const response = await apiFetch("/api/supabase/status");
      if (response.ok) {
        const data = await response.json();
        setDbStatus(data);
      }
    } catch (e) {
      console.error("Erro ao carregar status do banco de dados:", e);
    } finally {
      setDbChecking(false);
    }
  };

  // Fetch database SQL Schema instructions
  const fetchDbSchema = async () => {
    try {
      const response = await apiFetch("/api/supabase/sql");
      if (response.ok) {
        const data = await response.text();
        setDbSqlSchema(data);
      }
    } catch (e) {
      console.error("Erro ao buscar schema SQL:", e);
    }
  };

  // Push local cache data to Supabase DB
  const handlePushSync = async () => {
    setSyncingDb("push");
    setSyncDbError(null);
    try {
      const response = await apiFetch("/api/supabase/sync", { method: "POST" });
      if (response.ok) {
        setSyncingDb("success");
        await fetchTickets();
        await fetchUsers();
        fetchDbStatus();
        setTimeout(() => setSyncingDb("idle"), 3000);
      } else {
        const errData = await response.json();
        setSyncDbError(errData.error || "Erro desconhecido ao enviar dados.");
        setSyncingDb("error");
      }
    } catch (e: any) {
      setSyncDbError(e.message || "Erro de rede ao conectar à API.");
      setSyncingDb("error");
    }
  };

  // Pull Supabase DB data into local cache files
  const handlePullSync = async () => {
    setSyncingDb("pull");
    setSyncDbError(null);
    try {
      const response = await apiFetch("/api/supabase/pull", { method: "POST" });
      if (response.ok) {
        const data = await response.json();
        setSyncingDb("success");
        await fetchTickets();
        await fetchUsers();
        fetchDbStatus();
        alert(`Sincronização concluída com sucesso! ${data.ticketsCount} chamados e ${data.usersCount} colaboradores foram importados do Supabase e salvos localmente.`);
        setTimeout(() => setSyncingDb("idle"), 3000);
      } else {
        const errData = await response.json();
        setSyncDbError(errData.error || "Erro desconhecido ao puxar dados.");
        setSyncingDb("error");
      }
    } catch (e: any) {
      setSyncDbError(e.message || "Erro de rede ao conectar à API.");
      setSyncingDb("error");
    }
  };

  // Pull database schema and status on technician session mount
  useEffect(() => {
    if (isTechUser) {
      fetchDbStatus();
      fetchDbSchema();
    }
  }, [currentSession, isTechUser]);

  // Force non-technicians to stay on the main tickets queue ('painel')
  useEffect(() => {
    if (currentSession && !isTechUser) {
      if (activeTab !== "painel" && activeTab !== "chamados") {
        setActiveTab("painel");
      }
    }
  }, [currentSession, activeTab, isTechUser]);

  // Poll tickets and users every 15 seconds for real-time fidelity with low egress overhead
  useEffect(() => {
    fetchTickets();
    fetchUsers();

    // Send a heartbeat ping to the server to register online presence
    const sendHeartbeat = () => {
      if (currentSession?.email || currentSession?.name) {
        apiFetch("/api/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: currentSession.email,
            name: currentSession.name
          })
        })
          .then(() => fetchUsers())
          .catch((err) => {
            console.warn("Falha ao enviar heartbeat:", err);
          });
      }
    };

    sendHeartbeat();

    const interval = setInterval(() => {
      fetchTickets(true);
      fetchUsers();
      sendHeartbeat();
    }, 10000);
    return () => clearInterval(interval);
  }, [currentSession?.email, currentSession?.name]);

  // Tell the server presence should clear right away instead of waiting for
  // the heartbeat to time out, whenever the tab is actually closing.
  // sendBeacon (not fetch) is used because it's guaranteed to fire during unload.
  const sendOfflineBeacon = (session?: { email?: string; name?: string; token?: string } | null) => {
    const s = session || currentSessionRef.current;
    if (!s || (!s.email && !s.name)) return;
    try {
      // Aviso de PRESENÇA apenas: não encerra a sessão (F5, navegação e fechar aba também disparam este evento).
      // sendBeacon não envia cabeçalhos, então o token vai no corpo só para o servidor confirmar quem está saindo.
      const blob = new Blob([JSON.stringify({ email: s.email, name: s.name, token: s.token })], { type: "application/json" });
      navigator.sendBeacon(getApiUrl("/api/offline"), blob);
    } catch (e) {}
  };

  const currentSessionRef = useRef(currentSession);
  useEffect(() => {
    currentSessionRef.current = currentSession;
  }, [currentSession]);

  useEffect(() => {
    const handler = () => sendOfflineBeacon();
    window.addEventListener("beforeunload", handler);
    window.addEventListener("pagehide", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
      window.removeEventListener("pagehide", handler);
    };
  }, []);

  // Audio notification helper using Web Audio API for maximum reliability
  const playNotificationSound = () => {
    try {
      const tone = (localStorage.getItem("gran7_notif_sound_tone") as SoundTone) || "gran7";
      const volStr = localStorage.getItem("gran7_notif_volume");
      const volume = volStr !== null ? parseFloat(volStr) : 0.8;
      playCustomNotificationSound(tone, volume);
    } catch (error) {
      console.warn("Navegador bloqueou a reprodução automática de som de notificação:", error);
    }
  };

  // Watch for new tickets to show notifications and play sound
  useEffect(() => {
    // If the app is still loading and we have no tickets, wait until initial load completes
    if (loading && tickets.length === 0) return;

    if (!hasInitializedTicketsRef.current) {
      // First load: register all existing ticket IDs so we don't spam notifications on startup
      tickets.forEach(t => seenTicketIds.current.add(t.id));
      // Also register all existing comment IDs so we don't spam comment notifications on startup
      tickets.forEach(t => {
        t.comments?.forEach(c => seenCommentIds.current.add(c.id));
      });
      hasInitializedTicketsRef.current = true;
      return;
    }

    let hasNewNotification = false;
    let shouldPlaySound = false;
    const newlyDetected: AppNotification[] = [];

    tickets.forEach((t) => {
      // 1. Check for new tickets
      if (!seenTicketIds.current.has(t.id)) {
        seenTicketIds.current.add(t.id);
        
        // Play notification sound if the current user is a technician OR if they are the collaborator who opened this ticket
        if (currentSession?.role === "tecnico" || t.requesterName === currentSession?.name) {
          shouldPlaySound = true;
        }

        // Visual notifications (on-screen pop-ups): technicians see every new
        // ticket; collaborators only see ones they opened themselves (e.g.
        // when a technician opens it on their behalf).
        if (currentSession?.role === "tecnico" || t.requesterName === currentSession?.name) {
          hasNewNotification = true;
          showDesktopNotification(
            `🔔 Novo Chamado #${t.id} • ${t.title}`,
            `Solicitante: ${t.requesterName} (${t.requesterDepartment || "TI"}) | Prioridade: ${t.priority.toUpperCase()}`,
            t.id
          );
          const newNotif: AppNotification = {
            id: `notif-${Date.now()}-${t.id}`,
            ticketId: t.id,
            title: t.title,
            requesterName: t.requesterName,
            timestamp: new Date(),
            type: "ticket"
          };
          newlyDetected.push(newNotif);
        }
      }

      // 2. Check for new comments (messages)
      t.comments?.forEach((c) => {
        if (!seenCommentIds.current.has(c.id)) {
          seenCommentIds.current.add(c.id);

          // Do not notify if the current user wrote the comment themselves
          if (c.authorName === currentSession?.name) {
            return;
          }

          // Decide if user is relevant for this comment:
          // Technicians get all comment notifications.
          // Collaborators only get comment notifications for their own tickets.
          const isUserRelevant = currentSession?.role === "tecnico" || t.requesterName === currentSession?.name;

          if (isUserRelevant) {
            shouldPlaySound = true;
            hasNewNotification = true;

            showDesktopNotification(
              `💬 Chat HelpDesk • ${t.title}`,
              `${c.authorName}: ${c.content}`,
              t.id
            );

            const newNotif: AppNotification = {
              id: `notif-${Date.now()}-${c.id}`,
              ticketId: t.id,
              title: t.title,
              requesterName: t.requesterName,
              timestamp: new Date(),
              type: "comment",
              commentText: c.content,
              commentAuthor: c.authorName
            };
            newlyDetected.push(newNotif);
          }
        }
      });
    });

    if (hasNewNotification && newlyDetected.length > 0) {
      setNotifications((prev) => {
        // Keep up to 5 notifications at most to avoid screen clutter
        const combined = [...newlyDetected, ...prev];
        return combined.slice(0, 5);
      });

      // Automatically clear notifications after 8 seconds
      newlyDetected.forEach((notif) => {
        setTimeout(() => {
          setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
        }, 8000);
      });
    }

    // Trigger the audio chime sound
    if (shouldPlaySound) {
      playNotificationSound();
    }
  }, [tickets, loading, currentSession?.role, currentSession?.name]);

  // Handlers
  const handleProfileSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const listToSearch = users.length > 0 ? users : USER_PROFILES;
    const profile = listToSearch.find((p) => p.name === e.target.value);
    if (profile) {
      const sessionData: UserSession = {
        name: profile.name,
        department: profile.department,
        role: profile.role,
        email: profile.email
      };
      setCurrentSession(sessionData);
      localStorage.setItem("gran7_session", JSON.stringify(sessionData));
      setSelectedTicketId(null);
      setNotifications([]); // Clear current notifications when switching users
      seenTicketIds.current.clear();
      hasInitializedTicketsRef.current = false;
      if (profile.role !== "tecnico") {
        setActiveTab("painel");
      }
    }
  };

  const handleLogout = () => {
    // Logout EXPLÍCITO: revoga o token no servidor (e limpa a presença). `keepalive` garante o envio mesmo
    // que a página recarregue em seguida. fetch direto (não apiFetch) para um 401 não provocar novo reload.
    const token = currentSession?.token;
    if (token) {
      fetch(getApiUrl("/api/logout"), { method: "POST", headers: { Authorization: `Bearer ${token}` }, keepalive: true }).catch(() => {});
    }
    sendOfflineBeacon(currentSession);
    setCurrentSession(null);
    localStorage.removeItem("gran7_session");
    setSelectedTicketId(null);
    setActiveTab("painel");
    setNotifications([]); // Clear current notifications on logout
    seenTicketIds.current.clear();
    hasInitializedTicketsRef.current = false;
  };

  const handleResetData = async () => {
    if (confirm("Deseja realmente redefinir o banco de dados para os dados padrão?")) {
      try {
        const response = await apiFetch("/api/reset", { method: "POST" });
        if (response.ok) {
          await fetchTickets();
          await fetchUsers();
          setSelectedTicketId(null);
          handleLogout();
        }
      } catch (error) {
        console.error("Erro ao resetar dados:", error);
      }
    }
  };

  const handleDeleteTicket = async (ticketId: string) => {
    if (!currentSession || currentSession.role !== "tecnico") return;
    
    const targetTicket = tickets.find(t => t.id === ticketId);
    if (!targetTicket || !getAssignedTechs(targetTicket.assignedTo).includes(currentSession.name)) {
      alert("Apenas um dos técnicos responsáveis por este chamado pode excluí-lo.");
      return;
    }

    // Confirm with the server before touching local state/Supabase — it's
    // the only place that verifies the deletion is actually authorized.
    try {
      const response = await apiFetch(`/api/tickets/${ticketId}`, { method: "DELETE" });
      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        alert(errData?.error || "Não foi possível excluir o chamado.");
        return;
      }
    } catch (error) {
      console.warn("Erro ao enviar exclusão para API server:", error);
      alert("Sem conexão com o servidor. Não foi possível excluir o chamado.");
      return;
    }

    setTickets(prev => prev.filter(t => t.id !== ticketId));
    setIsConfirmingDeleteTicket(null);
    setSelectedTicketId(null);

    deleteTicketFromSupabase(ticketId).catch(e => console.warn("Erro ao excluir no Supabase pelo navegador:", e));
  };

  const handleAddFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    fileArray.forEach((file) => {
      if (file.type.startsWith("image/")) {
        compressImage(file)
          .then((compressedUrl) => {
            setNewTicketForm((prev) => {
              const newAttachments = [...prev.attachments, { name: file.name, url: compressedUrl, type: file.type }];
              const firstImage = newAttachments.find(a => a.type.startsWith("image/"))?.url || "";
              return {
                ...prev,
                attachments: newAttachments,
                screenshot: prev.screenshot || firstImage
              };
            });
          })
          .catch(() => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const resultUrl = reader.result as string;
              setNewTicketForm((prev) => {
                const newAttachments = [...prev.attachments, { name: file.name, url: resultUrl, type: file.type }];
                const firstImage = newAttachments.find(a => a.type.startsWith("image/"))?.url || "";
                return {
                  ...prev,
                  attachments: newAttachments,
                  screenshot: prev.screenshot || firstImage
                };
              });
            };
            reader.readAsDataURL(file);
          });
      } else {
        // PDF or other documents
        const reader = new FileReader();
        reader.onloadend = () => {
          const resultUrl = reader.result as string;
          setNewTicketForm((prev) => {
            const newAttachments = [...prev.attachments, { name: file.name, url: resultUrl, type: file.type }];
            return {
              ...prev,
              attachments: newAttachments
            };
          });
        };
        reader.readAsDataURL(file);
      }
    });
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSession) return;
    if (!newTicketForm.title.trim() || !newTicketForm.description.trim()) return;

    setIsSubmittingTicket(true);
    let createdTicket: Ticket | null = null;

    try {
      const response = await apiFetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTicketForm.title,
          description: newTicketForm.description,
          requesterName: (currentSession.role === "tecnico" && selectedRequesterName) ? selectedRequesterName : currentSession.name,
          requesterDepartment: (currentSession.role === "tecnico" && selectedRequesterDepartment) ? selectedRequesterDepartment : currentSession.department,
          screenshot: newTicketForm.screenshot || undefined,
          projectDeadline: newTicketForm.projectDeadline || undefined,
          attachments: newTicketForm.attachments
        })
      });

      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          createdTicket = await response.json();
        }
      }
    } catch (error) {
      console.warn("Erro ao enviar chamado para API, criando localmente com sincronização Supabase:", error);
    }

    // Fallback if API returned HTML or failed
    if (!createdTicket) {
      const now = new Date();
      const nextId = String(Date.now()).slice(-4);
      createdTicket = {
        id: nextId,
        title: newTicketForm.title,
        description: newTicketForm.description,
        category: "Outros",
        priority: "Média",
        status: "Aberto",
        requesterName: (currentSession.role === "tecnico" && selectedRequesterName) ? selectedRequesterName : currentSession.name,
        requesterDepartment: (currentSession.role === "tecnico" && selectedRequesterDepartment) ? selectedRequesterDepartment : currentSession.department,
        assignedTo: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        slaLimit: new Date(now.getTime() + 24 * 3600000).toISOString(),
        aiCategory: "Aguardando Triagem",
        aiPriority: "Média",
        aiReasoning: "Abertura enviada com sucesso.",
        aiSuggestions: "Aguardando atendimento técnico.",
        comments: [],
        screenshot: newTicketForm.screenshot || undefined,
        projectDeadline: newTicketForm.projectDeadline || undefined,
        attachments: newTicketForm.attachments
      };
    }

    // Save directly to Supabase DB from browser
    saveTicketToSupabase(createdTicket).catch(e => console.warn("Erro ao salvar no Supabase pelo navegador:", e));

    setIsNewTicketModalOpen(false);
    setNewTicketForm({ title: "", description: "", screenshot: "", projectDeadline: "", attachments: [] });

    const finalTicket = createdTicket;
    setTickets(prev => [finalTicket, ...prev.filter(t => t.id !== finalTicket.id)]);
    setSelectedTicketId(finalTicket.id);
    setIsSubmittingTicket(false);
  };

  // Esc fecha o formulário de cadastro/edição mesmo quando o foco não está dentro dele.
  useEffect(() => {
    if (!isUserModalOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsUserModalOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isUserModalOpen]);

  const applyUserPhoto = (id: string, photo: string | null) => {
    setUsers(prev => prev.map(u => (u.id === id ? { ...u, photo } : u)));
    setSelectedTechProfile(prev => (prev && prev.id === id ? { ...prev, photo } : prev));
  };

  const handlePhotoPicked = async (file: File | undefined) => {
    const target = selectedTechProfile;
    if (!file || !target) return;
    setPhotoError("");
    setPhotoBusy(true);
    try {
      const photo = await fileToAvatarDataUrl(file);
      const res = await apiFetch(`/api/users/${target.id}/photo`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photo }) });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Não foi possível salvar a foto.");
      }
      applyUserPhoto(target.id, photo);
    } catch (e: any) {
      setPhotoError(e?.message || "Não foi possível salvar a foto.");
    } finally {
      setPhotoBusy(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const handleRemovePhoto = async () => {
    const target = selectedTechProfile;
    if (!target) return;
    setPhotoError("");
    setPhotoBusy(true);
    try {
      const res = await apiFetch(`/api/users/${target.id}/photo`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Não foi possível remover a foto.");
      }
      applyUserPhoto(target.id, null);
    } catch (e: any) {
      setPhotoError(e?.message || "Não foi possível remover a foto.");
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleStartEditUser = (user: User) => {
    setEditingUserId(user.id);
    // Map legacy spellings (e.g. "Contabil") onto the canonical sector list.
    const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
    const canonicalDept = USER_DEPARTMENTS.find(d => norm(d) === norm(user.department || "")) || user.department;
    setNewUserForm({
      name: user.name,
      email: user.email,
      password: user.password || "",
      department: canonicalDept,
      role: user.role
    });
    setUserFormError("");
    setUserFormSuccess("");
  };

  const handleCancelEditUser = () => {
    setEditingUserId(null);
    setNewUserForm({
      name: "",
      email: "",
      password: "",
      department: "Financeiro",
      role: "colaborador"
    });
    setUserFormError("");
    setUserFormSuccess("");
  };

  const handleCreateOrUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserFormError("");
    setUserFormSuccess("");

    const isEdit = !!editingUserId;
    if (!newUserForm.name.trim() || !newUserForm.email.trim() || (!isEdit && !newUserForm.password.trim())) {
      setUserFormError(isEdit ? "Por favor, preencha o nome e e-mail." : "Por favor, preencha o nome, e-mail e senha de acesso.");
      return;
    }

    setIsSubmittingUser(true);
    let savedUser: User | null = null;
    let apiSucceeded = false;

    try {
      const url = editingUserId ? `/api/users/${editingUserId}` : "/api/users";
      const method = editingUserId ? "PUT" : "POST";

      const response = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUserForm)
      });

      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          savedUser = await response.json();
          apiSucceeded = true;
        }
      } else if (response.status >= 400 && response.status < 500) {
        // Server explicitly rejected the change (validation, permission, duplicate e-mail…):
        // show the reason instead of pretending it was saved locally.
        const errData = await response.json().catch(() => null);
        setUserFormError(errData?.error || "Não foi possível salvar o colaborador.");
        setIsSubmittingUser(false);
        return;
      }
    } catch (error) {
      console.warn("Erro ao salvar colaborador na API, salvando via Supabase/Local:", error);
    }

    if (!savedUser) {
      savedUser = {
        id: editingUserId || String(1000 + Math.floor(Math.random() * 9000)),
        name: newUserForm.name.trim(),
        email: newUserForm.email.trim().toLowerCase(),
        password: newUserForm.password.trim(),
        department: newUserForm.department,
        role: newUserForm.role as "colaborador" | "tecnico",
        mustChangePassword: false
      };
    }

    // Direct browser Supabase save: only needed as a fallback when the API call
    // itself failed. When the API succeeds, the server already syncs Supabase on
    // its own — and it never returns the password hash to the client, so re-sending
    // savedUser here would upsert an empty password and lock the user out.
    if (!apiSucceeded && savedUser.password) {
      saveUserToSupabase(savedUser).catch(e => console.warn("Erro ao salvar usuário no Supabase pelo navegador:", e));
    }

    if (editingUserId) {
      handleCancelEditUser();
      setIsUserModalOpen(false);
    } else {
      setIsUserModalOpen(false);
      setNewUserForm({
        name: "",
        email: "",
        password: "",
        department: "Financeiro",
        role: "colaborador"
      });
    }

    const finalUser = savedUser;
    setUsers(prev => [finalUser, ...prev.filter(u => u.id !== finalUser.id)]);
    setIsSubmittingUser(false);
  };

  const handleDeleteUserClick = (user: User) => {
    setDeletingUser(user);
  };

  const handleConfirmDeleteUser = async () => {
    if (!deletingUser) return;
    const deletedId = deletingUser.id;
    const emailDeleted = deletingUser.email;
    setDeletingUser(null);

    try {
      const response = await apiFetch(`/api/users/${deletedId}`, { method: "DELETE" });
      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        alert(errData?.error || "Não foi possível remover o colaborador.");
        return;
      }
    } catch (error) {
      console.warn("Erro ao enviar deleção para API:", error);
      alert("Sem conexão com o servidor. Não foi possível remover o colaborador.");
      return;
    }

    setUsers(prev => prev.filter(u => u.id !== deletedId));
    deleteUserFromSupabase(deletedId).catch(e => console.warn("Erro ao excluir usuário no Supabase pelo navegador:", e));

    if (currentSession?.email === emailDeleted) {
      handleLogout();
    }
  };

  const handleUpdateTicketMeta = async (ticketId: string, fields: Partial<Ticket>) => {
    const targetTicket = tickets.find(t => t.id === ticketId);
    if (!targetTicket) return;

    // Ask the server first — it's the only place that actually knows whether
    // this requester is allowed to touch an already-assigned ticket. Only
    // apply the change locally/to Supabase once the server has confirmed it,
    // so a rejected request can't be forced through via the optimistic
    // update or the direct-to-Supabase fallback.
    let serverTicket: Ticket | null = null;
    try {
      const payload = {
        ...fields,
        requesterUser: currentSession?.name || null
      };
      const response = await apiFetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        alert(errData?.error || "Não foi possível atualizar o chamado.");
        return;
      }
      serverTicket = await response.json().catch(() => null);
    } catch (error) {
      console.warn("Erro ao atualizar chamado na API:", error);
      alert("Sem conexão com o servidor. Não foi possível atualizar o chamado.");
      return;
    }

    // O servidor é a fonte oficial de status, comentários do sistema e trilha de SLA (pausas).
    // Adotar a resposta evita que o salvamento direto do navegador sobrescreva esses campos.
    const updatedTicket: Ticket = serverTicket && serverTicket.id === ticketId
      ? serverTicket
      : { ...targetTicket, ...fields, updatedAt: new Date().toISOString() };

    setTickets(prev => prev.map(t => t.id === ticketId ? updatedTicket : t));
    saveTicketToSupabase(updatedTicket).catch(e => console.warn("Erro ao salvar chamado no Supabase pelo navegador:", e));
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicketId || (!newCommentText.trim() && !commentAttachment)) return;

    const targetTicket = tickets.find(t => t.id === selectedTicketId);
    if (!targetTicket) return;

    const newComment: Comment = {
      id: String(Date.now()),
      authorName: currentSession.name,
      authorRole: currentSession.role,
      content: newCommentText.trim() || `[Anexo: ${commentAttachmentName || 'Documento/Imagem'}]`,
      timestamp: new Date().toISOString()
    };

    const updatedTicket: Ticket = {
      ...targetTicket,
      comments: [...targetTicket.comments, newComment],
      updatedAt: new Date().toISOString()
    };

    setTickets(prev => prev.map(t => t.id === selectedTicketId ? updatedTicket : t));
    setNewCommentText("");
    setCommentAttachment(null);
    setCommentAttachmentName("");

    saveTicketToSupabase(updatedTicket).catch(e => console.warn("Erro ao salvar comentário no Supabase pelo navegador:", e));

    try {
      const res = await apiFetch(`/api/tickets/${selectedTicketId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorName: currentSession.name,
          authorRole: currentSession.role,
          content: newCommentText.trim() || `[Anexo: ${commentAttachmentName || 'Documento/Imagem'}]`,
          attachmentUrl: commentAttachment || undefined,
          attachmentName: commentAttachmentName || undefined
        })
      });
      // Estado oficial do servidor (ex.: SLA retomado quando o solicitante responde).
      const data = res.ok ? await res.json().catch(() => null) : null;
      if (data?.ticket?.id === targetTicket.id) {
        const official: Ticket = data.ticket;
        setTickets(prev => prev.map(t => t.id === official.id ? official : t));
        saveTicketToSupabase(official).catch(e => console.warn("Erro ao salvar chamado no Supabase pelo navegador:", e));
      }
    } catch (error) {
      console.warn("Erro ao enviar comentário para API:", error);
    }
  };

  let statusText = "Inicializando sistemas...";
  let StatusIcon = Terminal;
  if (preloaderProgress < 25) {
    statusText = "Conectando ao banco de dados Supabase...";
    StatusIcon = Database;
  } else if (preloaderProgress < 50) {
    statusText = "Carregando módulos de atendimento...";
    StatusIcon = Cpu;
  } else if (preloaderProgress < 75) {
    statusText = "Sincronizando fila de chamados...";
    StatusIcon = Layers;
  } else if (preloaderProgress < 95) {
    statusText = "Verificando conexões de segurança SSL...";
    StatusIcon = Lock;
  } else {
    statusText = "Pronto para iniciar!";
    StatusIcon = CheckCircle;
  }

  const preloaderJSX = showPreloader ? (
    <div
      className={`fixed inset-0 z-[9999] bg-app flex flex-col items-center justify-center font-sans overflow-hidden transition-all duration-200 ease-in-out ${
        preloaderFadeOut ? "opacity-0 scale-95 pointer-events-none" : "opacity-100 scale-100"
      }`}
    >
      {/* Clean Corporate Card */}
      <div className="relative z-10 max-w-[340px] w-full mx-4 border border-default bg-surface rounded-2xl p-6 sm:p-8 shadow-2xl text-center flex flex-col items-center gap-6">
        {/* Top Status Badge */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-default text-[10px] font-bold tracking-wider text-secondary uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>PORTAL DE ATENDIMENTO CORPORATIVO</span>
        </div>

        {/* Clean Logo */}
        <div className="w-16 h-16 flex items-center justify-center my-1">
          <img
            src={logoMin}
            alt="GRAN7"
            className="w-14 h-14 object-contain"
          />
        </div>

        {/* Text Area */}
        <div className="text-center">
          <Gran7Brand size="lg" showSubtitle={true} subtitleText="SISTEMA DE GESTÃO DE CHAMADOS" />
        </div>

        {/* Progress Section */}
        <div className="w-full space-y-2 mt-2">
          <div className="flex justify-between items-center text-[10px] font-bold text-secondary px-0.5">
            <span className="uppercase text-[10px] tracking-wider text-secondary truncate">
              {statusText}
            </span>
            <span className="text-emerald-400 font-mono font-bold">{Math.round(preloaderProgress)}%</span>
          </div>
          <div className="w-full h-1.5 bg-surface rounded-full border border-default/80 overflow-hidden">
            <div
              className={`h-full bg-emerald-600 rounded-full transition-all duration-150 ease-out ${
                preloaderProgress >= 99 && preloaderProgress < 100 ? "animate-pulse" : ""
              }`}
              style={{ width: `${preloaderProgress}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between w-full border-t border-default/60 pt-3 text-[9px] text-muted font-medium">
          <span>GRAN7 NUTRITION &amp; BIOTECHNOLOGY</span>
          <span className="text-secondary font-mono">v2.4</span>
        </div>
      </div>
    </div>
  ) : null;

  // Selected ticket calculation
  // Técnicos veem qualquer chamado; colaboradores apenas os próprios (vale também para acesso direto por URL).
  const selectedTicket = useMemo(() => {
    const t = tickets.find(x => x.id === selectedTicketId);
    if (!t || !currentSession) return null;
    return currentSession.role === "tecnico" || t.requesterName === currentSession.name ? t : null;
  }, [tickets, selectedTicketId, currentSession]);

  // ── Workspace do chamado: rota /chamados/:id, transição e retorno ──
  const closeTicket = useTicketRoute(selectedTicketId, setSelectedTicketId);
  const reduceMotion = useReducedMotion() ?? false;
  const contentRef = useRef<HTMLDivElement>(null);
  const queueScrollRef = useRef(0);
  const pressTimerRef = useRef<number | undefined>(undefined);
  const [pressedTicketId, setPressedTicketId] = useState<string | null>(null);
  const [expandOrigin, setExpandOrigin] = useState<ExpandOrigin | null>(null);

  useEffect(() => () => window.clearTimeout(pressTimerRef.current), []);

  const openTicket = useCallback((id: string, origin?: DOMRect) => {
    if (pressTimerRef.current) return; // ignora duplo clique durante a transição
    queueScrollRef.current = contentRef.current?.scrollTop ?? 0;
    if (reduceMotion || !origin) {
      setSelectedTicketId(id);
      return;
    }
    const title = tickets.find(t => t.id === id)?.title ?? "";
    setPressedTicketId(id);
    pressTimerRef.current = window.setTimeout(() => {
      pressTimerRef.current = undefined;
      setPressedTicketId(null);
      setExpandOrigin({ id, title, rect: { top: origin.top, left: origin.left, width: origin.width, height: origin.height } });
      setSelectedTicketId(id);
    }, REVEAL.pressMs);
  }, [reduceMotion, tickets]);

  // Esc volta para a fila (sem interferir em campos de texto nem na pré-visualização de imagem)
  useEffect(() => {
    if (!selectedTicketId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || previewImage) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      closeTicket();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedTicketId, previewImage, closeTicket]);

  // Mesma lógica de leitura/compressão usada antes pelo modal (seleção de arquivo e colagem de imagem)
  const attachFileToComment = (file: File, fallbackName = "anexo") => {
    const name = file.name || fallbackName;
    const readPlain = () => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCommentAttachment(reader.result as string);
        setCommentAttachmentName(name);
      };
      reader.readAsDataURL(file);
    };
    if (file.type.startsWith("image/")) {
      compressImage(file)
        .then((url) => {
          setCommentAttachment(url);
          setCommentAttachmentName(name);
        })
        .catch(readPlain);
    } else {
      readPlain();
    }
  };

  const toggleDesktopNotifications = async () => {
    if (desktopNotificationPermission === "granted") {
      testDesktopNotification();
    } else {
      const res = await requestDesktopNotificationPermission();
      if (res === "granted") testDesktopNotification();
    }
  };

  const isAssignedToOther = useMemo(() => {
    return !!(selectedTicket && currentSession && currentSession.role === "tecnico" && selectedTicket.assignedTo && !getAssignedTechs(selectedTicket.assignedTo).includes(currentSession.name));
  }, [selectedTicket, currentSession]);

  // Role-based tickets filter: technicians see everything, collaborators only see their own tickets
  const userVisibleTickets = useMemo(() => {
    if (!currentSession) return [];
    return tickets.filter(t => 
      currentSession.role === "tecnico" || t.requesterName === currentSession.name
    );
  }, [tickets, currentSession]);

  // Todos os prazos/vencimentos vêm do motor único (src/lib/sla), em horas úteis. O campo legado
  // `slaLimit` (horas corridas) não decide mais atraso, urgência nem vencimento exibido.
  // `nowMs` se atualiza a cada minuto para os selos refletirem o tempo útil decorrido.
  const nowMs = useNow(60_000);
  const isTicketOverdue = useCallback((t: Ticket) => engineIsOverdue(t, nowMs), [nowMs]);
  const getSlaEscalation = useCallback((t: Ticket) => engineSlaEscalation(t, nowMs), [nowMs]);

  // Filtered tickets calculation
  const filteredTickets = useMemo(() => {
    const byNewest = (a: Ticket, b: Ticket) => {
      const ta = new Date(a.createdAt).getTime() || 0;
      const tb = new Date(b.createdAt).getTime() || 0;
      return tb - ta;
    };
    return [...userVisibleTickets].sort(byNewest).filter(t => {
      // Tab filtering: hide active projects from normal ticket queue and vice versa
      if (activeTab === "painel") {
        // "Fila de Chamados" hides active projects
        if (PROJECTS_MODULE_ENABLED && t.projectDeadline && t.status !== "Resolvido" && t.status !== "Fechado") {
          return false;
        }
      } else if (activeTab === "projetos") {
        // "Projetos em Andamento" shows all projects
        if (!t.projectDeadline) {
          return false;
        }
      }

      const matchesSearch = 
        t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.id.includes(searchTerm) ||
        t.requesterName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.assignedTo && t.assignedTo.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesCategory = selectedCategory === "All" || t.category === selectedCategory;
      const matchesPriority = selectedPriority === "All" || t.priority === selectedPriority;
      const matchesStatus = 
        selectedStatus === "All" || 
        (selectedStatus === "Active" ? (t.status === "Aberto" || t.status === "Em Atendimento" || t.status === "Aguardando Solicitante") : t.status === selectedStatus);

      return matchesSearch && matchesCategory && matchesPriority && matchesStatus;
    });
  }, [userVisibleTickets, activeTab, searchTerm, selectedCategory, selectedPriority, selectedStatus]);

  // Operational metrics
  const totalTickets = userVisibleTickets.length;
  // Fila Ativa excludes active projects with long dates
  const activeTickets = useMemo(() => {
    return userVisibleTickets.filter(t => t.status !== "Resolvido" && t.status !== "Fechado" && (!PROJECTS_MODULE_ENABLED || !t.projectDeadline));
  }, [userVisibleTickets]);

  const activeProjects = useMemo(() => {
    return userVisibleTickets.filter(t => t.status !== "Resolvido" && t.status !== "Fechado" && !!t.projectDeadline);
  }, [userVisibleTickets]);

  const resolvedTickets = useMemo(() => {
    return userVisibleTickets.filter(t => t.status === "Resolvido" || t.status === "Fechado");
  }, [userVisibleTickets]);

  const criticalTickets = useMemo(() => {
    return activeTickets.filter(t => t.priority === "Urgente" || t.priority === "Alta");
  }, [activeTickets]);
  
  // SLA Overdue count (includes standard overdue and projects that passed their deadline)
  const allActiveTickets = useMemo(() => {
    return userVisibleTickets.filter(t => t.status !== "Resolvido" && t.status !== "Fechado");
  }, [userVisibleTickets]);

  const overdueTickets = useMemo(() => {
    return allActiveTickets.filter(t => isTicketOverdue(t));
  }, [allActiveTickets, isTicketOverdue]);

  // Eficiência do SLA = resolvidos dentro do prazo / resolvidos avaliáveis (horas úteis).
  // Sem chamados avaliáveis o resultado é `null` ("sem dados"), nunca 100%.
  const slaMetrics = useMemo(() => computeSlaMetrics(userVisibleTickets, nowMs), [userVisibleTickets, nowMs]);
  // SLA e TMA do técnico no perfil: resolvidos no prazo ÷ resolvidos avaliáveis (SLA original, horas úteis) e
  // tempo útil médio até a primeira resolução. Mesmo motor e mesma regra de responsável da tabela
  // "Desempenho por Técnico"; sem dados ⇒ null (nunca 100%).
  const profileTechSla = useMemo(() => {
    if (!isTechProfileModalOpen || !selectedTechProfile) return null;
    return techProfileMetrics(tickets, selectedTechProfile.name, nowMs);
  }, [isTechProfileModalOpen, selectedTechProfile?.name, tickets, nowMs]);
  const slaCompliance = slaMetrics.resolution.pct;

  // Category counts
  const catStats = useMemo(() => {
    const stats = { Hardware: 0, Software: 0, Redes: 0, Acesso: 0, Sistemas: 0, Outros: 0 };
    userVisibleTickets.forEach(t => { if (stats[t.category] !== undefined) stats[t.category]++; });
    return stats;
  }, [userVisibleTickets]);

  // Priority counts for quick indicators
  const prioStats = useMemo(() => {
    const stats = { Urgente: 0, Alta: 0, Média: 0, Baixa: 0 };
    userVisibleTickets.forEach(t => { if (stats[t.priority] !== undefined) stats[t.priority]++; });
    return stats;
  }, [userVisibleTickets]);

  // Chamado só após a autenticação ter sido confirmada pelo servidor (LoginScreen); não refaz o login.
  const handleLoginSuccess = (session: UserSession) => {
    // Sem animação quando precisa trocar a senha (outra tela) ou com movimento reduzido.
    const fx = session.mustChangePassword ? null : resolveAuthFx();
    if (fx) setAuthFx(fx);
    setCurrentSession(session);
    localStorage.setItem("gran7_session", JSON.stringify(session));
    if (session.email || session.name) {
      apiFetch("/api/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: session.email, name: session.name })
      }).then(() => fetchUsers()).catch(() => {});
    }
  };

  // A tela de login permanece montada (mesma posição na árvore) enquanto a transição roda.
  const loginLayer = (!currentSession || authFx) ? (
    <LoginLayer exiting={!!authFx && !!currentSession} vars={authFx}>
      <LoginScreen onLoginSuccess={handleLoginSuccess} />
    </LoginLayer>
  ) : null;

  if (!currentSession) {
    return (
      <>
        {null}
        {loginLayer}
        {preloaderJSX}
      </>
    );
  }

  if (currentSession.mustChangePassword) {
    return (
      <>
        <ChangePasswordScreen
          session={currentSession}
          onPasswordChanged={(updatedSession) => {
            setCurrentSession(updatedSession);
            localStorage.setItem("gran7_session", JSON.stringify(updatedSession));
          }}
          onLogout={() => {
            setCurrentSession(null);
            localStorage.removeItem("gran7_session");
          }}
        />
        {preloaderJSX}
      </>
    );
  }

  const isQueueTab = activeTab !== "projetos" && activeTab !== "sla" && activeTab !== "colaboradores" && activeTab !== "banco_dados";

  return (
    <>
    <div
      className={`bg-app text-primary font-sans relative${authFx ? " g7-enter" : ""}`}
      style={authFx ?? undefined}
    >
      <AppLayout
        activeTab={activeTab}
        contentRef={contentRef}
        onNavigate={(tab) => { if (selectedTicketId) closeTicket(); setActiveTab(tab); }}
        onGoHome={() => { if (selectedTicketId) closeTicket(); handleGoToHome(); }}
        isTechUser={isTechUser}
        user={{ name: currentSession.name, department: currentSession.department, photo: users.find(u => u.email && currentSession.email && u.email.toLowerCase() === currentSession.email.toLowerCase())?.photo ?? null }}
        logoSrc={resolvedTheme === "light" ? logoBlack : logoImg}
        markSrc={logoMin}
        searchTerm={searchTerm}
        onSearchChange={(value) => {
          if (selectedTicketId) closeTicket();
          setSearchTerm(value);
          if (activeTab !== "painel" && activeTab !== "projetos") setActiveTab("painel");
        }}
        techStatus={users
          .filter(u => u.role === "tecnico")
          .map((u, idx) => ({
            key: u.id || String(idx),
            name: u.name,
            isOnline: !!(u.isOnline || (currentSession && (
              (u.email && currentSession.email && u.email.toLowerCase() === currentSession.email.toLowerCase()) ||
              (u.name && currentSession.name && u.name.toLowerCase() === currentSession.name.toLowerCase())
            ))),
          }))
          .sort((a, b) => (b.isOnline ? 1 : 0) - (a.isOnline ? 1 : 0))}
        notificationPermission={typeof window !== "undefined" && "Notification" in window ? desktopNotificationPermission : "unsupported"}
        onRequestNotifications={() => { requestDesktopNotificationPermission(); }}
        onOpenNotificationGuide={() => setIsNotificationGuideOpen(true)}
        onTestNotification={() => { testDesktopNotification(); }}
        onLogout={() => { setSelectedTicketId(null); handleLogout(); }}
        onOpenProfile={() => {
          const myProfile = users.find(u => u.name === currentSession.name || (u.email && currentSession.email && u.email.toLowerCase() === currentSession.email.toLowerCase())) || {
            id: "self",
            name: currentSession.name,
            email: currentSession.email || `${currentSession.name.toLowerCase().replace(/s+/g, ".")}@gran7.com.br`,
            role: currentSession.role,
            department: currentSession.department || "Geral",
            isOnline: true
          };
          setSelectedTechProfile(myProfile);
          setProfileModalTab("overview");
          setProfileTicketsFilter("all");
          setIsTechProfileModalOpen(true);
        }}
      >
      {/* Main Full-Width Content Container */}
      <AnimatePresence mode="wait" initial={false}>
      {selectedTicketId ? (
        <motion.div
          key="ticket-workspace"
          className="md:h-full"
          initial={false}
          exit={reduceMotion ? { opacity: 0, transition: { duration: 0.01 } } : { opacity: 0, scale: REVEAL.exit.scale, transition: { duration: REVEAL.exit.duration, ease: REVEAL.ease } }}
        >
          {selectedTicket ? (
            <TicketWorkspace
              ticket={selectedTicket}
              currentSession={currentSession}
              users={users}
              isTechUser={isTechUser}
              isAssignedToOther={isAssignedToOther}
              isOverdue={isTicketOverdue(selectedTicket)}
              slaLabel={getSlaEscalation(selectedTicket).label}
              getAssignedTechs={getAssignedTechs}
              getFirstAssignedTech={getFirstAssignedTech}
              onUpdateMeta={handleUpdateTicketMeta}
              onDelete={handleDeleteTicket}
              confirmingDeleteId={isConfirmingDeleteTicket}
              setConfirmingDeleteId={setIsConfirmingDeleteTicket}
              notificationPermission={typeof window !== "undefined" && "Notification" in window ? desktopNotificationPermission : "unsupported"}
              onToggleNotifications={toggleDesktopNotifications}
              onPreviewImage={setPreviewImage}
              commentText={newCommentText}
              setCommentText={setNewCommentText}
              commentAttachment={commentAttachment}
              commentAttachmentName={commentAttachmentName}
              onClearAttachment={() => { setCommentAttachment(null); setCommentAttachmentName(""); }}
              onAttachFile={attachFileToComment}
              onSubmitComment={handleAddComment}
              onBack={closeTicket}
              reduceMotion={reduceMotion}
            />
          ) : loading ? (
            <div className="p-6 max-w-[1800px] mx-auto" aria-busy="true" aria-label="Carregando chamado">
              <div className="h-16 rounded-xl bg-surface border border-default motion-safe:animate-pulse" />
              <div className="mt-4 grid grid-cols-1 xl:grid-cols-[28fr_45fr_27fr] gap-4">
                {[0, 1, 2].map(i => <div key={i} className="h-80 rounded-xl bg-surface border border-default motion-safe:animate-pulse" />)}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={SearchX}
              title="Chamado não encontrado"
              description="Ele pode ter sido removido ou você não tem permissão para visualizá-lo."
              secondaryAction={{ label: "Voltar para a fila", onClick: closeTicket }}
            />
          )}
        </motion.div>
      ) : (
      <motion.div
        key="queue-view"
        initial={reduceMotion ? false : { opacity: 0, y: REVEAL.queueIn.y }}
        animate={{ opacity: 1, y: 0, transition: { duration: reduceMotion ? 0 : REVEAL.queueIn.duration, ease: REVEAL.ease } }}
        exit={{ opacity: 0, transition: { duration: 0.01 } }}
        onAnimationStart={() => {
          if (queueScrollRef.current && contentRef.current) contentRef.current.scrollTop = queueScrollRef.current;
        }}
      >
      <main className="w-full max-w-[1800px] mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        
        {/* Cabeçalho da página — somente no módulo Fila de Chamados */}
        {isQueueTab && (
          <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="min-w-0">
              <h2 className="font-display text-2xl font-bold tracking-tight text-primary">Fila de Chamados</h2>
              <p className="mt-1.5 text-sm text-secondary">Acompanhe, priorize e atenda os chamados abertos pela empresa.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fetchTickets(true)}
                disabled={isPolling}
                title="Atualizar lista"
                className="h-9 px-3 inline-flex items-center gap-2 rounded-lg border border-default bg-surface hover:bg-surface-2 text-[13px] text-secondary hover:text-primary transition-colors duration-150 cursor-pointer disabled:opacity-70"
              >
                <RefreshCw className={`h-4 w-4 ${isPolling ? "motion-safe:animate-spin text-emerald-500" : ""}`} />
                <span className="hidden lg:inline tabular-nums whitespace-nowrap">
                  {lastUpdated ? `Atualizado às ${lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Atualizar"}
                </span>
                <span className="md:hidden sr-only">Atualizar</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewTicketForm((f) => ({ ...f, projectDeadline: "" }));
                  setIsNewTicketModalOpen(true);
                }}
                className="h-9 px-4 inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-sm font-semibold shadow-card transition-colors duration-150 cursor-pointer"
              >
                <PlusCircle className="h-4 w-4" />
                Novo Chamado
              </button>
            </div>
          </header>
        )}

        {/* Dynamic Bento Grid Layout */}
        <AnimatePresence mode="wait">
          {activeTab === "sla" && currentSession.role === "tecnico" ? (
            <motion.div
              key="sla"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              <SlaAnalytics 
                tickets={tickets} 
                users={users} 
                loading={loading}
                error={ticketsError}
                refreshing={isPolling}
                onRefresh={() => fetchTickets(true)}
                onViewUserProfile={(user) => {
                  setSelectedTechProfile(user);
                  setIsTechProfileModalOpen(true);
                }}
                onSelectTicket={(ticketId) => {
                  setSelectedTicketId(ticketId);
                  setActiveTab("chamados");
                }}
              />
            </motion.div>
          ) : activeTab === "colaboradores" && currentSession.role === "tecnico" ? (
            <motion.div
              key="colaboradores"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="w-full"
            >
            <CollaboratorsPage
              users={users.length > 0 ? users : (USER_PROFILES as unknown as User[])}
              tickets={tickets}
              session={currentSession}
              getAssignedTechs={getAssignedTechs}
              filters={{ search: colabSearchTerm, sector: colabSectorFilter, role: colabRoleFilter, status: colabStatusFilter, sort: colabSortBy }}
              onFilters={(patch) => {
                if (patch.search !== undefined) setColabSearchTerm(patch.search);
                if (patch.sector !== undefined) setColabSectorFilter(patch.sector);
                if (patch.role !== undefined) setColabRoleFilter(patch.role);
                if (patch.status !== undefined) setColabStatusFilter(patch.status);
                if (patch.sort !== undefined) setColabSortBy(patch.sort);
              }}
              onClearFilters={() => {
                setColabSearchTerm(DEFAULT_COLLAB_FILTERS.search);
                setColabSectorFilter(DEFAULT_COLLAB_FILTERS.sector);
                setColabRoleFilter(DEFAULT_COLLAB_FILTERS.role);
                setColabStatusFilter(DEFAULT_COLLAB_FILTERS.status);
                setColabSortBy(DEFAULT_COLLAB_FILTERS.sort);
              }}
              onAdd={() => { handleCancelEditUser(); setIsUserModalOpen(true); }}
              onEdit={(user) => { handleStartEditUser(user); setIsUserModalOpen(true); }}
              onViewProfile={(user, opener) => {
                profileOpenerRef.current = opener;
                setSelectedTechProfile(user);
                setIsTechProfileModalOpen(true);
              }}
            />
          </motion.div>
        ) : activeTab === "banco_dados" && currentSession?.role === "tecnico" ? (
          <motion.div
            key="banco_dados"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-6"
          >
            
            {/* Header / Intro banner */}
            <div className="bg-app border border-default rounded-2xl p-6 shadow-lg relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2 max-w-2xl">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
                    <Database className="h-5 w-5" />
                  </span>
                  <h3 className="text-base font-bold text-primary uppercase tracking-wider">Central de Sincronização do Banco de Dados</h3>
                </div>
                <p className="text-xs text-secondary leading-relaxed">
                  Gerencie o fluxo de dados em nuvem via <strong className="text-primary">Supabase</strong> com fallback automático para <strong className="text-primary">Armazenamento Local Autônomo</strong>. Nosso sistema de redundância garante que o suporte nunca pare, mesmo que a nuvem esteja indisponível.
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-2.5">
                <button
                  onClick={() => {
                    fetchDbStatus();
                    fetchTickets();
                    fetchUsers();
                  }}
                  disabled={dbChecking}
                  className="px-4 py-2 bg-surface hover:bg-surface-2 text-secondary hover:text-primary font-bold rounded-xl text-xs border border-default transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${dbChecking ? "animate-spin" : ""}`} />
                  Recarregar Tudo
                </button>
              </div>
            </div>

            {/* Bento Grid Analytics Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Card 1: Connection Status */}
              <div className="bg-app border border-default rounded-2xl p-5 flex flex-col justify-between min-h-[160px] shadow-lg">
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">Status da Conexão</p>
                    {dbStatus?.connected ? (
                      <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                    ) : (
                      <span className="flex h-2 w-2 relative">
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                      </span>
                    )}
                  </div>
                  
                  <div className="mt-3">
                    {dbStatus?.connected ? (
                       <div>
                         <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded uppercase tracking-wider">
                          Nuvem Online
                         </span>
                         <p className="text-[11px] text-secondary mt-2.5 leading-relaxed">
                          Conectado com sucesso ao banco de dados Supabase. Leituras e escritas estão ativas e sendo persistidas em nuvem em tempo real.
                         </p>
                       </div>
                     ) : (
                       <div>
                         <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded uppercase tracking-wider">
                           Modo Redundante / Local
                         </span>
                         <p className="text-[11px] text-secondary mt-2.5 leading-relaxed">
                           {dbStatus?.configured 
                            ? "Não foi possível conectar ao Supabase. Operando em modo de redundância local segura." 
                            : "Credenciais do Supabase ausentes no painel Secrets do AI Studio. Usando banco local."}
                         </p>
                       </div>
                     )}
                  </div>
                </div>

                <div className="pt-4 border-t border-default/50 mt-4 flex items-center justify-between">
                  <span className="text-[9px] font-mono text-muted">
                    Host: {dbStatus?.connected ? "supabase.co" : "cache local"}
                  </span>
                  <button
                    onClick={fetchDbStatus}
                    disabled={dbChecking}
                    className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    {dbChecking ? "Testando..." : "Testar Conexão →"}
                  </button>
                </div>
              </div>

              {/* Card 2: Cache Inventory */}
              <div className="bg-app border border-default rounded-2xl p-5 flex flex-col justify-between min-h-[160px] shadow-lg">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-secondary">Inventário de Registros Locais</p>
                  
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="bg-app/40 border border-default p-3 rounded-xl">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-muted block">Chamados</span>
                      <span className="text-xl font-black text-primary font-mono mt-0.5 block">{tickets.length}</span>
                    </div>
                    <div className="bg-app/40 border border-default p-3 rounded-xl">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-muted block">Colaboradores</span>
                      <span className="text-xl font-black text-primary font-mono mt-0.5 block">{users.length}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-default/50 mt-4 text-[10px] text-secondary leading-tight">
                  Os arquivos <code className="text-emerald-400 font-mono">tickets-db.json</code> e <code className="text-emerald-400 font-mono">users-db.json</code> mantêm seus dados seguros no servidor.
                </div>
              </div>

            </div>

            {/* Sync Control Center */}
            <div className="bg-app border border-default rounded-2xl p-6 shadow-lg space-y-6">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-primary uppercase tracking-wider">Painel de Sincronização Bidirecional</h4>
                <p className="text-[11px] text-secondary">Escolha o fluxo de sincronização para reconciliar dados entre a nuvem e o cache do servidor local.</p>
              </div>

              {syncingDb === "success" && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs flex items-center gap-2 animate-in fade-in duration-200">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  <span>Sincronização concluída com sucesso! Os dados foram unificados no destino.</span>
                </div>
              )}

              {syncingDb === "error" && syncDbError && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs space-y-1.5 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span className="font-bold">A sincronização falhou</span>
                  </div>
                  <p className="text-[11px] text-rose-300/90 leading-relaxed pl-6">
                    {syncDbError}. Certifique-se de que as tabelas existem no Supabase (use as instruções SQL abaixo no SQL Editor para criá-las).
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Push Sync Card */}
                <div className="bg-app/50 border border-default rounded-2xl p-5 hover:border-emerald-500/20 transition duration-350 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <Upload className="h-5 w-5" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-primary uppercase tracking-wider">Exportar Local → Supabase (Push)</h5>
                      <p className="text-[11px] text-secondary mt-1.5 leading-relaxed">
                        Envia todos os chamados e colaboradores salvos localmente para o banco de dados do Supabase. Use após configurar um novo banco ou resolver quedas de conexão.
                      </p>
                    </div>
                  </div>

                  <div className="pt-6">
                    <button
                      onClick={handlePushSync}
                      disabled={syncingDb === "push" || syncingDb === "pull" || !dbStatus?.configured}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 shadow-sm"
                    >
                      {syncingDb === "push" ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          Enviando dados...
                        </>
                      ) : (
                        <>
                          <Upload className="h-3.5 w-3.5" />
                          Exportar Dados para o Supabase
                        </>
                      )}
                    </button>
                    {!dbStatus?.configured && (
                      <p className="text-[9px] text-center text-amber-500 mt-2 font-medium">
                        * Configure as credenciais do Supabase (SUPABASE_URL e SUPABASE_KEY) nas Secrets para habilitar.
                      </p>
                    )}
                  </div>
                </div>

                {/* Pull Sync Card */}
                <div className="bg-app/50 border border-default rounded-2xl p-5 hover:border-emerald-500/20 transition duration-350 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-primary uppercase tracking-wider">Importar Supabase → Local (Pull)</h5>
                      <p className="text-[11px] text-secondary mt-1.5 leading-relaxed">
                        Puxa todos os chamados e colaboradores persistidos no Supabase e substitui o cache local do servidor. Ideal para inicializar novos ambientes ou baixar dados inseridos remotamente.
                      </p>
                    </div>
                  </div>

                  <div className="pt-6">
                    <button
                      onClick={() => {
                        if (confirm("Aviso: Esta ação irá sobrescrever todos os chamados e colaboradores salvos localmente com os dados armazenados no Supabase. Deseja prosseguir?")) {
                          handlePullSync();
                        }
                      }}
                      disabled={syncingDb === "push" || syncingDb === "pull" || !dbStatus?.configured}
                      className="w-full py-2 bg-surface hover:bg-surface-2 text-secondary hover:text-primary border border-default font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                    >
                      {syncingDb === "pull" ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          Baixando dados...
                        </>
                      ) : (
                        <>
                          <Database className="h-3.5 w-3.5 text-secondary" />
                          Importar Dados do Supabase
                        </>
                      )}
                    </button>
                    {!dbStatus?.configured && (
                      <p className="text-[9px] text-center text-amber-500 mt-2 font-medium">
                        * Configure as credenciais do Supabase (SUPABASE_URL e SUPABASE_KEY) nas Secrets para habilitar.
                      </p>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* SQL Script Instruction Card */}
            <div className="bg-app border border-default rounded-2xl p-6 shadow-lg space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-default/80 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Terminal className="h-4.5 w-4.5 text-emerald-400" />
                    <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Estrutura de Tabelas SQL do Supabase</h4>
                  </div>
                  <p className="text-[11px] text-secondary">Instruções e código SQL para criar a arquitetura de tabelas no banco de dados PostgreSQL do Supabase.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(dbSqlSchema);
                      setCopySuccess(true);
                      setTimeout(() => setCopySuccess(false), 2000);
                    }}
                    className="px-3 py-1.5 bg-surface hover:bg-surface-2 text-secondary hover:text-primary font-bold rounded-xl text-[10px] uppercase tracking-wider border border-default transition flex items-center gap-1.5 cursor-pointer"
                  >
                    {copySuccess ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-secondary" />
                        Copiar Código SQL
                      </>
                    )}
                  </button>
                  <a
                    href={`data:text/plain;charset=utf-8,${encodeURIComponent(dbSqlSchema)}`}
                    download="supabase_schema.sql"
                    className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold rounded-xl text-[10px] uppercase tracking-wider border border-emerald-500/20 transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Download .sql
                  </a>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[11px] text-secondary leading-relaxed">
                  Para criar as tabelas manualmente, acesse o painel do seu projeto no <strong className="text-primary">Supabase</strong>, vá em <strong className="text-primary">SQL Editor</strong>, clique em <strong className="text-primary">New Query</strong>, cole o código abaixo e clique em <strong className="text-primary">Run</strong>.
                </p>

                <div className="relative rounded-xl overflow-hidden border border-default bg-app/90">
                  <div className="absolute top-3 right-3 bg-surface px-2 py-0.5 rounded text-[8px] font-mono font-bold text-muted uppercase tracking-widest select-none border border-default">
                    PostgreSQL
                  </div>
                  <pre className="p-4 text-[10px] font-mono text-secondary overflow-x-auto max-h-72 leading-relaxed whitespace-pre select-all">
                    {dbSqlSchema || "Carregando estrutura SQL..."}
                  </pre>
                </div>
              </div>
            </div>

          </motion.div>
        ) : (
          <motion.div
            key="painel"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start"
          >
          
          {/* MAIN SECTION: Full width tickets grid and triage panel */}
          <div className="transition-all duration-300 space-y-6 xl:col-span-12 min-w-0">
            
            {/* Indicadores — cards independentes (apenas equipe de TI, mesma regra anterior) */}
            {isTechUser && activeTab !== "projetos" && (
              <section aria-label="Indicadores da fila" className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                <StatCard
                  icon={ListTodo}
                  label="Chamados ativos"
                  value={activeTickets.length}
                  hint="Na fila de atendimento"
                  active={selectedStatus === "Active"}
                  onClick={() => { setActiveTab("painel"); setSelectedStatus("Active"); setSelectedPriority("All"); setSelectedCategory("All"); setSearchTerm(""); }}
                />
                <StatCard
                  icon={Hourglass}
                  label="Aguardando"
                  hint="Ainda sem atendimento"
                  value={activeTickets.filter(t => t.status === "Aberto").length}
                  tone={activeTickets.some(t => t.status === "Aberto") ? "amber" : "neutral"}
                  active={selectedStatus === "Aberto"}
                  onClick={() => { setActiveTab("painel"); setSelectedStatus("Aberto"); setSelectedPriority("All"); setSelectedCategory("All"); setSearchTerm(""); }}
                />
                <StatCard
                  icon={Wrench}
                  label="Em atendimento"
                  hint="Sendo atendidos agora"
                  value={activeTickets.filter(t => t.status === "Em Atendimento").length}
                  tone="sky"
                  active={selectedStatus === "Em Atendimento"}
                  onClick={() => { setActiveTab("painel"); setSelectedStatus("Em Atendimento"); setSelectedPriority("All"); setSelectedCategory("All"); setSearchTerm(""); }}
                />
                <StatCard
                  icon={Flame}
                  label="Críticos"
                  value={criticalTickets.length}
                  tone={criticalTickets.length > 0 ? "rose" : "neutral"}
                  hint="Prioridade alta ou urgente"
                  onClick={() => {
                    setActiveTab("painel");
                    setSelectedStatus("Active");
                    setSelectedPriority(activeTickets.some(t => t.priority === "Urgente") ? "Urgente" : "Alta");
                    setSelectedCategory("All");
                    setSearchTerm("");
                  }}
                />
                <StatCard
                  icon={AlertTriangle}
                  label="Vencidos"
                  value={activeTickets.filter(t => isTicketOverdue(t)).length}
                  tone={activeTickets.some(t => isTicketOverdue(t)) ? "rose" : "neutral"}
                  hint={`${slaMetrics.nearDue} em risco · ${slaMetrics.waitingRequester} aguardando · ${slaMetrics.reopening.currentlyReopened} reaberto(s)`}
                />
                <StatCard
                  icon={CheckCircle2}
                  label="Resolvidos"
                  hint="Resolvidos e fechados"
                  value={resolvedTickets.length}
                  tone="emerald"
                  active={selectedStatus === "Resolvido"}
                  onClick={() => { setActiveTab("painel"); setSelectedStatus("Resolvido"); setSelectedPriority("All"); setSelectedCategory("All"); setSearchTerm(""); }}
                />
                <StatCard
                  icon={Inbox}
                  label="Todos os chamados"
                  value={activeTickets.length + resolvedTickets.length}
                  hint="Do mais recente ao mais antigo"
                  active={selectedStatus === "All"}
                  onClick={() => { setActiveTab("painel"); setSelectedStatus("All"); setSelectedPriority("All"); setSelectedCategory("All"); setSearchTerm(""); }}
                />
                <StatCard
                  icon={Gauge}
                  label="Eficiência do SLA"
                  value={slaCompliance === null ? "—" : `${slaCompliance}%`}
                  tone="neutral"
                  progress={slaCompliance === null ? undefined : slaCompliance}
                  hint={slaCompliance === null ? "Sem chamados resolvidos avaliáveis" : `${slaMetrics.resolution.met} no prazo · ${slaMetrics.resolution.breached} com atraso · ${slaMetrics.resolution.evaluated} avaliados`}
                  onClick={() => setActiveTab("sla")}
                />
              </section>
            )}

            {isTechUser && activeTab === "projetos" && (
              <div className="bg-surface border border-default rounded-xl shadow-card overflow-hidden">
                <div className="grid grid-cols-3 divide-x divide-default">

                      {/* Item 1: Total de Projetos */}
                      <div className="p-2.5 sm:p-3 flex flex-col justify-between">
                        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-secondary">Total de Projetos</p>
                        <div className="flex items-center justify-between mt-1 gap-2 w-full">
                          <span className="text-lg sm:text-xl font-black text-primary leading-none">
                            {userVisibleTickets.filter(t => !!t.projectDeadline).length}
                          </span>
                          <span className="text-emerald-400 text-[9px] font-bold bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 whitespace-nowrap">
                            {userVisibleTickets.filter(t => !!t.projectDeadline && (t.status === "Resolvido" || t.status === "Fechado")).length} Concluídos
                          </span>
                        </div>
                      </div>

                      {/* Item 2: Projetos em Dia */}
                      <div className="p-2.5 sm:p-3 flex flex-col justify-between">
                        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-secondary">Projetos em Dia</p>
                        <div className="flex items-center justify-between mt-1 gap-2 w-full">
                          <span className="text-lg sm:text-xl font-black text-emerald-400 leading-none">
                            {(() => {
                              const activeProjs = userVisibleTickets.filter(t => !!t.projectDeadline && t.status !== "Resolvido" && t.status !== "Fechado");
                              const overdueProjs = activeProjs.filter(t => isTicketOverdue(t));
                              return activeProjs.length - overdueProjs.length;
                            })()}
                          </span>
                          <span className="text-secondary text-[9px] font-bold bg-surface px-2 py-0.5 rounded-md border border-default whitespace-nowrap">
                            SLA Monitorado
                          </span>
                        </div>
                      </div>

                      {/* Item 3: Fora do Prazo / Críticos */}
                      <button
                        onClick={() => {
                          setSelectedStatus("All");
                          setSelectedPriority("All");
                          setSelectedCategory("All");
                          setSearchTerm("");
                        }}
                        className="p-2.5 sm:p-3 flex flex-col justify-between text-left transition hover:bg-surface-2/40 cursor-pointer group"
                      >
                        <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-secondary group-hover:text-rose-400 transition-colors">Atrasados / Críticos</p>
                        <div className="flex items-center justify-between mt-1 gap-2 w-full">
                          <span className={`text-lg sm:text-xl font-black leading-none ${
                            userVisibleTickets.filter(t => !!t.projectDeadline && t.status !== "Resolvido" && t.status !== "Fechado" && isTicketOverdue(t)).length > 0 ? "text-rose-500" : "text-primary"
                          }`}>
                            {userVisibleTickets.filter(t => !!t.projectDeadline && t.status !== "Resolvido" && t.status !== "Fechado" && isTicketOverdue(t)).length}
                          </span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md border whitespace-nowrap ${
                            userVisibleTickets.filter(t => !!t.projectDeadline && t.status !== "Resolvido" && t.status !== "Fechado" && isTicketOverdue(t)).length > 0 ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-surface text-secondary border-default"
                          }`}>
                            {userVisibleTickets.filter(t => !!t.projectDeadline && t.status !== "Resolvido" && t.status !== "Fechado" && isTicketOverdue(t)).length > 0 ? "Ação Requerida" : "Cronograma OK"}
                          </span>
                        </div>
                      </button>
                    
                </div>
              </div>
            )}

            {/* Filters Bar, Tickets List & Projects Dashboard */}
            {activeTab === "projetos" ? (
              <div className="space-y-6">
                
                {/* Dashboard Control Bar */}
                <div className="bg-app border border-default rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
                      <Briefcase className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-primary uppercase tracking-wider">Painel de Projetos</h4>
                      <p className="text-[10px] text-secondary">Gerenciamento ágil de projetos corporativos</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + 7);
                      setNewTicketForm((f) => ({ ...f, projectDeadline: d.toISOString().split("T")[0] }));
                      setIsNewTicketModalOpen(true);
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-full transition flex items-center gap-2 text-xs shadow-md cursor-pointer shrink-0"
                  >
                    <PlusCircle className="h-4 w-4" />
                    <span>Novo Projeto</span>
                  </button>
                </div>

                {/* Subtitle / Search & Filters for projects */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-app border border-default rounded-2xl p-4 shadow-lg">
                  <div className="sm:col-span-2 relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-muted">
                      <Search className="h-4 w-4" />
                    </span>
                    <input
                      type="text"
                      placeholder="Buscar projetos..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-app border border-default rounded-xl py-2 pl-9 pr-4 text-xs text-primary placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                    />
                  </div>
                  
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="bg-app border border-default text-secondary text-xs rounded-xl py-2 px-3 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all cursor-pointer"
                  >
                    <option value="All">Categoria (Todas)</option>
                    <option value="Hardware">Hardware</option>
                    <option value="Software">Software</option>
                    <option value="Redes">Redes</option>
                    <option value="Acesso">Acesso</option>
                    <option value="Sistemas">Sistemas</option>
                    <option value="Outros">Outros</option>
                  </select>

                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="bg-app border border-default text-secondary text-xs rounded-xl py-2 px-3 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all cursor-pointer"
                  >
                    <option value="Active">Ativos (Todos)</option>
                    <option value="All">Status (Todos)</option>
                    <option value="Aberto">Aberto</option>
                    <option value="Em Atendimento">Em Atendimento</option>
                    <option value="Resolvido">Resolvido</option>
                    <option value="Fechado">Fechado</option>
                  </select>
                </div>

                {/* Sub-Views Content Container */}
                <div className="min-h-[300px]">
                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-12 text-secondary gap-3">
                      <RefreshCw className="h-8 w-8 animate-spin text-emerald-400" />
                      <p className="text-xs">Carregando projetos corporativos...</p>
                    </div>
                  ) : filteredTickets.length === 0 ? (
                    <div className="text-center py-16 bg-app border border-default rounded-2xl text-muted font-mono shadow-lg">
                      <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Nenhum projeto encontrado</p>
                      <p className="text-[10px] text-muted mt-2">Ajuste os filtros ou crie um novo chamado definindo uma Data Limite.</p>
                    </div>
                  ) : (
                    /* KANBAN BOARD VIEW */
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4">
                      {(() => {
                        const columns = [
                          { title: "Não Iniciado", status: "Aberto" as const, bg: "border-t-amber-500", text: "text-amber-400", dot: "bg-amber-400" },
                          { title: "Em Desenvolvimento", status: "Em Atendimento" as const, bg: "border-t-sky-500", text: "text-sky-400", dot: "bg-sky-400" },
                          { title: "Finalizado", status: "Resolvido" as const, bg: "border-t-emerald-500", text: "text-emerald-400", dot: "bg-emerald-400" }
                        ];

                        return columns.map((col, colIdx) => {
                          const colProjects = filteredTickets.filter((p) => {
                            if (col.status === "Resolvido") {
                              return p.status === "Resolvido" || p.status === "Fechado";
                            }
                            if (col.status === "Em Atendimento") {
                              return p.status === "Em Atendimento" || p.status === "Pendente" || p.status === "Testando";
                            }
                            return p.status === col.status;
                          });

                          const isDraggedOver = draggedOverColumn === col.status;
                          
                          // Dynamic style for column when dragged over
                          let highlightClass = "border-default bg-app";
                          if (isDraggedOver) {
                            if (col.status === "Aberto") {
                              highlightClass = "border-amber-500/50 bg-amber-500/5 scale-[1.01]";
                            } else if (col.status === "Em Atendimento") {
                              highlightClass = "border-sky-500/50 bg-sky-500/5 scale-[1.01]";
                            } else if (col.status === "Resolvido") {
                              highlightClass = "border-emerald-500/50 bg-emerald-500/5 scale-[1.01]";
                            }
                          }

                          return (
                            <div 
                              key={col.status}
                              id={`kanban-col-${col.status.toLowerCase().replace(/\s+/g, '-')}`}
                              onDragOver={(e) => {
                                e.preventDefault();
                                if (draggedOverColumn !== col.status) {
                                  setDraggedOverColumn(col.status);
                                }
                              }}
                              onDragLeave={() => {
                                setDraggedOverColumn(null);
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                setDraggedOverColumn(null);
                                const projectId = e.dataTransfer.getData("text/plain") || draggedProjectId;
                                if (projectId) {
                                  handleUpdateTicketMeta(projectId, { status: col.status as Ticket["status"] });
                                }
                              }}
                              className={`border p-3 flex flex-col min-h-[550px] transition-all duration-300 rounded-2xl w-full ${highlightClass}`}
                            >
                              
                              {/* Column Header */}
                              <div className="flex items-center justify-between border-b border-default pb-3 mb-3">
                                <div className="flex items-center gap-2">
                                  <span className={`h-1.5 w-1.5 rounded-full ${col.dot} shadow-sm animate-pulse`} />
                                  <span className="text-[10px] font-black uppercase text-primary tracking-wider flex items-center gap-1.5">
                                    {col.title}
                                    {col.status === "Resolvido" && <Check className="h-3 w-3 text-emerald-400" />}
                                  </span>
                                </div>
                                <span className="text-[10px] font-bold bg-surface px-2 py-0.5 rounded text-secondary font-mono border border-default">
                                  {colProjects.length}
                                </span>
                              </div>

                              {/* Column Cards Container */}
                              <div className="space-y-3 flex-1 overflow-y-auto max-h-[500px] pr-1 scrollbar-thin">
                                {colProjects.length === 0 ? (
                                  <div className="text-center py-12 border border-dashed border-default/40 rounded-xl text-muted text-[10px] font-mono">
                                    Nenhum projeto nesta etapa
                                  </div>
                                ) : (
                                  colProjects.map((project) => {
                                    const isSelected = project.id === selectedTicketId;
                                    const commentsCount = project.comments.filter(c => c.authorRole !== "system").length;
                                    
                                    // Project dynamic estimation progress
                                    let progressVal = 15;
                                    if (project.status === "Resolvido" || project.status === "Fechado") {
                                      progressVal = 100;
                                    } else if (project.status === "Em Atendimento") {
                                      progressVal = commentsCount >= 3 ? 80 : commentsCount === 2 ? 60 : commentsCount === 1 ? 40 : 30;
                                    } else if (project.status === "Testando") {
                                      progressVal = 90;
                                    } else if (project.status === "Pendente") {
                                      progressVal = 20;
                                    }

                                    // Priority custom pills
                                    const priorityText = project.priority === "Urgente" ? "text-rose-400 bg-rose-500/10" : project.priority === "Alta" ? "text-amber-400 bg-amber-500/10" : "text-secondary bg-surface";

                                    return (
                                      <div
                                        key={project.id}
                                        id={`kanban-card-${project.id}`}
                                        draggable
                                        onDragStart={(e) => {
                                          e.dataTransfer.setData("text/plain", project.id);
                                          setDraggedProjectId(project.id);
                                        }}
                                        onDragEnd={() => {
                                          setDraggedProjectId(null);
                                          setDraggedOverColumn(null);
                                        }}
                                        onClick={() => setSelectedTicketId(project.id)}
                                        className={`p-3 bg-app hover:bg-app border transition-all duration-200 cursor-pointer rounded-xl flex flex-col justify-between gap-3 relative group overflow-hidden ${
                                          isSelected 
                                            ? "border-emerald-500 ring-1 ring-emerald-500/35 bg-app" 
                                            : "border-default hover:border-default"
                                        }`}
                                      >
                                        <div className="space-y-1.5">
                                          <div className="flex items-center justify-between text-[8px] text-muted font-bold uppercase font-mono">
                                            <span>#{project.id}</span>
                                            <span className={`px-1.5 py-0.5 rounded text-[7px] font-black tracking-wider uppercase ${priorityText}`}>
                                              {project.priority}
                                            </span>
                                          </div>
                                          
                                          {/* Custom Tag Indicator similar to user's screenshot */}
                                          <div className="flex flex-wrap gap-1">
                                            {project.status === "Aberto" && (
                                              <span className="text-[7px] font-black bg-surface text-secondary border border-default rounded px-1 uppercase tracking-wider">
                                                IDEIA
                                              </span>
                                            )}
                                            {project.status === "Em Atendimento" && (
                                              <span className="text-[7px] font-black bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded px-1 uppercase tracking-wider">
                                                EXECUÇÃO
                                              </span>
                                            )}
                                            {project.status === "Testando" && (
                                              <span className="text-[7px] font-black bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded px-1 uppercase tracking-wider">
                                                TESTE
                                              </span>
                                            )}
                                            {project.status === "Resolvido" && (
                                              <span className="text-[7px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded px-1 uppercase tracking-wider">
                                                ENTREGUE
                                              </span>
                                            )}
                                            {project.status === "Fechado" && (
                                              <span className="text-[7px] font-black bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded px-1 uppercase tracking-wider">
                                                ABORTADO
                                              </span>
                                            )}
                                            {project.status === "Pendente" && (
                                              <span className="text-[7px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded px-1 uppercase tracking-wider">
                                                AGUARDANDO
                                              </span>
                                            )}
                                          </div>

                                          <h6 className="text-[11px] font-extrabold text-primary group-hover:text-emerald-400 transition-colors line-clamp-1 leading-tight">{project.title}</h6>
                                          <p className="text-[10px] text-secondary line-clamp-2 leading-relaxed">{project.description}</p>
                                        </div>

                                        {/* Progress line */}
                                        <div className="h-1 bg-app/60 rounded-full overflow-hidden">
                                          <div className="h-full bg-emerald-400 transition-all duration-300 shadow-[0_0_6px_rgba(52,211,153,0.3)]" style={{ width: `${progressVal}%` }} />
                                        </div>

                                        {/* Quick status moves / assignees */}
                                        <div className="flex items-center justify-between border-t border-default/40 pt-2 text-[9px] text-muted font-bold">
                                          <div className="flex items-center gap-1 text-[8px] bg-surface px-1.5 py-0.5 rounded text-emerald-400 border border-default">
                                            <Calendar className="h-2.5 w-2.5" />
                                            <span>
                                              {(() => {
                                                try {
                                                  const [y, m, d] = project.projectDeadline.split("-");
                                                  return `${d}/${m}`;
                                                } catch (e) {
                                                  return project.projectDeadline;
                                                }
                                              })()}
                                            </span>
                                          </div>

                                          <div className="flex items-center gap-1.5">
                                            {project.status !== "Resolvido" && project.status !== "Fechado" && (
                                              <>
                                                {project.status === "Aberto" && (
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleUpdateTicketMeta(project.id, { status: "Em Atendimento" });
                                                    }}
                                                    className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded hover:bg-emerald-500/20 text-[8px] font-black uppercase cursor-pointer"
                                                    title="Iniciar Atendimento"
                                                  >
                                                    Iniciar →
                                                  </button>
                                                )}
                                                {(project.status === "Em Atendimento" || project.status === "Pendente" || project.status === "Testando") && (
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleUpdateTicketMeta(project.id, { status: "Resolvido" });
                                                    }}
                                                    className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded hover:bg-emerald-500/20 text-[8px] font-black uppercase cursor-pointer"
                                                    title="Concluir Projeto"
                                                  >
                                                    Concluir ✓
                                                  </button>
                                                )}
                                              </>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>

              </div>
            ) : (
              <section className="bg-surface border border-default rounded-xl min-w-0 shadow-card overflow-hidden">
                <QueueToolbar
                  filters={{ search: searchTerm, category: selectedCategory, priority: selectedPriority, status: selectedStatus }}
                  onSearch={setSearchTerm}
                  onCategory={setSelectedCategory}
                  onPriority={setSelectedPriority}
                  onStatus={setSelectedStatus}
                  onClear={() => {
                    setSelectedCategory("All");
                    setSelectedPriority("All");
                    setSelectedStatus("Active");
                    setSearchTerm("");
                  }}
                  resultCount={filteredTickets.length}
                />
                {loading ? (
                  <TicketTableSkeleton />
                ) : ticketsError && userVisibleTickets.length === 0 ? (
                  <EmptyState
                    icon={ServerCrash}
                    tone="rose"
                    title="Não foi possível carregar os chamados"
                    description="O servidor e o banco não responderam e não há dados salvos neste dispositivo. Verifique a conexão e tente de novo."
                    action={{ label: "Tentar novamente", icon: RefreshCw, onClick: () => fetchTickets() }}
                  />
                ) : filteredTickets.length === 0 ? (
                  hasActiveFilters({ search: searchTerm, category: selectedCategory, priority: selectedPriority, status: selectedStatus }) ? (
                    <EmptyState
                      icon={SearchX}
                      title="Nenhum chamado corresponde aos filtros"
                      description="Tente outros termos ou remova algum filtro para ampliar a busca."
                      secondaryAction={{
                        label: "Limpar filtros",
                        onClick: () => {
                          setSelectedCategory("All");
                          setSelectedPriority("All");
                          setSelectedStatus("Active");
                          setSearchTerm("");
                        },
                      }}
                    />
                  ) : (
                    <EmptyState
                      icon={Inbox}
                      tone="emerald"
                      title={userVisibleTickets.length > 0 ? "Fila em dia" : "Nenhum chamado registrado"}
                      description={
                        userVisibleTickets.length > 0
                          ? "Não há chamados ativos no momento. Use a aba Resolvidos para consultar o histórico."
                          : "Quando um chamado for aberto, ele aparecerá aqui."
                      }
                      action={{
                        label: "Novo chamado",
                        icon: PlusCircle,
                        onClick: () => {
                          setNewTicketForm((f) => ({ ...f, projectDeadline: "" }));
                          setIsNewTicketModalOpen(true);
                        },
                      }}
                    />
                  )
                ) : (
                  <TicketTable
                    tickets={filteredTickets}
                    selectedId={selectedTicketId}
                    pressedId={pressedTicketId}
                    getDueAt={(t) => resolutionDueAt(t, nowMs)}
                    isReopened={(t) => engineIsReopened(t, nowMs)}
                    onSelect={openTicket}
                    getSlaLabel={(t) => getSlaEscalation(t).label}
                    getAssignees={getAssignedTechs}
                  />
                )}
              </section>
            )}

          </div>

          {/* RIGHT SECTION (Col 5): Bento Ticket Detail, Diagnosis Panel & Activity */}
          {!rightSidebarCollapsed && (
            <div className={`xl:col-span-5 space-y-6 animate-in fade-in slide-in-from-right-3 duration-300 ${
              selectedTicketId ? "block" : "hidden xl:block"
            }`}>

            {/* Selected Ticket Deep-Dive & Action Console */}
            {selectedTicket ? (
              <div className="bg-app border border-emerald-500/10 rounded-2xl overflow-hidden shadow-2xl">
                
                {/* Detail Header */}
                <div className="p-4 md:p-5 bg-surface border-b border-default/60 flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setSelectedTicketId(null)}
                      className="xl:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface hover:bg-surface border border-default text-xs font-bold text-emerald-400 transition cursor-pointer active:scale-95 shrink-0"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <span>Voltar</span>
                    </button>
                    <div>
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest block mb-0.5">Diagnóstico Completo</span>
                      <h3 className="text-sm font-bold text-primary">Chamado #{selectedTicket.id}</h3>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Status updater for technicians */}
                    {currentSession.role === "tecnico" ? (
                       <select
                        value={selectedTicket.status}
                        onChange={(e) => handleUpdateTicketMeta(selectedTicket.id, { status: e.target.value as Ticket["status"] })}
                        disabled={isAssignedToOther}
                        className={`bg-app border border-default text-xs font-bold rounded-lg px-2 py-1 focus:outline-none transition ${
                          selectedTicket.status === "Aberto" ? "text-amber-400 focus:border-amber-500" :
                          selectedTicket.status === "Em Atendimento" ? "text-sky-400 focus:border-sky-500" :
                          selectedTicket.status === "Resolvido" ? "text-emerald-400 focus:border-emerald-500" :
                          "text-secondary focus:border-default"
                        } ${isAssignedToOther ? "opacity-50 cursor-not-allowed text-muted" : ""}`}
                        title={isAssignedToOther ? `Apenas o técnico responsável (${selectedTicket.assignedTo}) pode alterar o status.` : ""}
                      >
                        <option value="Aberto" className="text-amber-400 font-bold bg-app">Aberto</option>
                        <option value="Em Atendimento" className="text-sky-400 font-bold bg-app">Em Atendimento</option>
                        <option value="Resolvido" className="text-emerald-400 font-bold bg-app">Resolvido</option>
                        <option value="Fechado" className="text-secondary font-bold bg-app">Fechado</option>
                      </select>
                    ) : (
                      <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded bg-surface border transition ${
                        selectedTicket.status === "Aberto" ? "text-amber-400 border-amber-500/20" :
                        selectedTicket.status === "Em Atendimento" ? "text-sky-400 border-sky-500/20 shadow-[0_0_10px_rgba(56,189,248,0.05)]" :
                        selectedTicket.status === "Resolvido" ? "text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.05)]" :
                        "text-secondary border-default/30"
                      }`}>
                        {selectedTicket.status}
                      </span>
                    )}
                  </div>
                </div>

                {/* Main scrollable body */}
                <div className="p-5 space-y-5 max-h-[550px] xl:max-h-[calc(100vh-220px)] overflow-y-auto">
                  
                  {/* Requester overview */}
                  <div className="p-3 bg-app/40 rounded-xl border border-emerald-950/20 text-xs space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-muted font-medium">Solicitado por:</span>
                      <strong className="text-primary">{selectedTicket.requesterName}</strong>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted font-medium">Departamento:</span>
                      <span className="text-secondary">{selectedTicket.requesterDepartment}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted font-medium">SLA Limite:</span>
                      <span className="text-rose-400 font-semibold">
                        {new Date(selectedTicket.slaLimit).toLocaleDateString("pt-BR")} {new Date(selectedTicket.slaLimit).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {selectedTicket.projectDeadline && (
                      <div className="flex justify-between items-center border-t border-default/40 pt-1.5">
                        <span className="text-muted font-medium flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-emerald-400" />
                          Limite do Projeto:
                        </span>
                        <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 text-[11px]">
                          {(() => {
                            try {
                              const [year, month, day] = selectedTicket.projectDeadline.split("-");
                              if (year && month && day) {
                                return `${day}/${month}/${year}`;
                              }
                              return selectedTicket.projectDeadline;
                            } catch (e) {
                              return selectedTicket.projectDeadline;
                            }
                          })()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* AI Intelligent Triage Bento Block */}
                  {selectedTicket.aiCategory && (
                    <div className="p-4 bg-emerald-500/5 rounded-xl border border-emerald-500/10 space-y-3 shadow-[0_0_15px_rgba(16,185,129,0.02)]">
                      <div className="flex items-center justify-between border-b border-emerald-950/25 pb-2 mb-1">
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Sparkles className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
                          Triagem Inteligente & Diagnóstico (IA)
                        </span>
                        {selectedTicket.screenshot && (
                          <span className="text-[9px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-1">
                            <Camera className="h-2.5 w-2.5" /> Print Analisado por IA
                          </span>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-app/40 p-2 rounded-lg border border-default">
                          <span className="text-muted block text-[9px] uppercase tracking-wider">Categoria IA</span>
                          <span className="text-emerald-400 font-bold">{selectedTicket.aiCategory}</span>
                        </div>
                        <div className="bg-app/40 p-2 rounded-lg border border-default">
                          <span className="text-muted block text-[9px] uppercase tracking-wider">Prioridade IA</span>
                          <span className={`font-bold ${
                            selectedTicket.aiPriority === "Urgente" ? "text-rose-400" :
                            selectedTicket.aiPriority === "Alta" ? "text-amber-400" :
                            selectedTicket.aiPriority === "Média" ? "text-emerald-400" : "text-secondary"
                          }`}>{selectedTicket.aiPriority}</span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-secondary uppercase tracking-wider block">Justificativa Técnica</span>
                        <p className="text-secondary text-xs leading-relaxed whitespace-pre-line italic">
                          "{selectedTicket.aiReasoning}"
                        </p>
                      </div>

                      {selectedTicket.aiSuggestions && (
                        <div className="space-y-1.5 pt-1 border-t border-emerald-950/25">
                          <span className="text-[10px] font-bold text-secondary uppercase tracking-wider block">Soluções Recomendadas</span>
                          <div className="text-secondary text-xs leading-relaxed space-y-1 bg-app/30 p-2.5 rounded-lg border border-default/60 font-sans">
                            {selectedTicket.aiSuggestions.split("\n").map((line, index) => (
                              <div key={index} className="flex gap-2 items-start">
                                <span className="text-emerald-400 font-bold select-none">•</span>
                                <span>{line.replace(/^\d+[\.\-\s]+/, "")}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Service Registry / Ticket Metrics Log */}
                  {(() => {
                    const assignmentComments = selectedTicket.comments.filter(c => 
                      c.authorRole === "system" && 
                      (c.content.includes("Responsável atribuído:") || c.content.includes("assumiu o chamado") || c.content.includes("transferido de"))
                    );
                    
                    const resolutionComment = selectedTicket.comments.find(c => 
                      c.authorRole === "system" && 
                      c.content.includes("Status alterado de") && 
                      c.content.includes("para **Resolvido**")
                    );

                    const hasAssignment = selectedTicket.assignedTo !== null;
                    const isResolved = selectedTicket.status === "Resolvido";

                    let firstAssumedTime: string | null = null;
                    if (assignmentComments.length > 0) {
                      firstAssumedTime = assignmentComments[0].timestamp;
                    }

                    let durationText = "";
                    if (isResolved) {
                      if (resolutionComment) {
                        const match = resolutionComment.content.match(/Tempo total (?:de atendimento|desde a abertura): \*\*(.*?)\*\*/);
                        if (match && match[1]) {
                          durationText = match[1];
                        }
                      }
                      
                      if (!durationText && firstAssumedTime) {
                        const diffMs = new Date(selectedTicket.updatedAt).getTime() - new Date(firstAssumedTime).getTime();
                        durationText = formatDurationText(diffMs);
                      } else if (!durationText) {
                        const diffMs = new Date(selectedTicket.updatedAt).getTime() - new Date(selectedTicket.createdAt).getTime();
                        durationText = diffMs > 0 ? formatDurationText(diffMs) : "Imediato";
                      }
                    } else if (hasAssignment && firstAssumedTime) {
                      const diffMs = Date.now() - new Date(firstAssumedTime).getTime();
                      durationText = `${formatDurationText(diffMs)} (em andamento)`;
                    }

                    return (
                      <div className="p-3 bg-emerald-500/5 rounded-xl border border-emerald-500/10 text-xs space-y-2">
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block border-b border-emerald-950/25 pb-1 mb-1">Registro de Atendimento</span>
                        <div className="flex justify-between items-center gap-4">
                          <span className="text-secondary font-medium shrink-0">Técnicos Responsáveis:</span>
                          {selectedTicket.assignedTo ? (
                            <div className="flex flex-wrap gap-1 justify-end">
                              {getAssignedTechs(selectedTicket.assignedTo).map((t, i) => (
                                <span key={i} className="bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded text-[10px] border border-emerald-500/20 font-bold shadow-sm">
                                  {t}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <strong className="text-emerald-400">Aguardando Técnico</strong>
                          )}
                        </div>
                        
                        {firstAssumedTime && (
                          <div className="flex justify-between items-center">
                            <span className="text-secondary font-medium">Início do Atendimento:</span>
                            <span className="text-secondary">
                              {new Date(firstAssumedTime).toLocaleDateString("pt-BR")} {new Date(firstAssumedTime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        )}

                        {durationText && (
                          <div className="flex justify-between items-center">
                            <span className="text-secondary font-medium">Tempo de Resolução:</span>
                            <span className="text-emerald-400 font-semibold">{durationText}</span>
                          </div>
                        )}

                        {isResolved && resolutionComment && (
                          <div className="flex justify-between items-center border-t border-emerald-500/10 pt-1.5 mt-1 text-[10px] text-secondary italic">
                            <span>Resolvido em: {new Date(resolutionComment.timestamp).toLocaleDateString("pt-BR")} {new Date(resolutionComment.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Original issue description block */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-muted uppercase tracking-wider">Descrição do Problema</span>
                    <div className="bg-app p-4 rounded-xl border border-default text-xs text-primary leading-relaxed whitespace-pre-line">
                      {selectedTicket.description}
                    </div>
                  </div>

                  {/* Attached files and screenshots block */}
                  {((selectedTicket.attachments && selectedTicket.attachments.length > 0) || selectedTicket.screenshot) && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-muted uppercase tracking-wider flex items-center gap-1.5">
                        <Paperclip className="h-3.5 w-3.5 text-emerald-400" />
                        Prints e Arquivos Anexados
                      </span>
                      <div className="bg-app/40 p-4 rounded-xl border border-default/60 space-y-3">
                        {/* If we have multiple attachments */}
                        {selectedTicket.attachments && selectedTicket.attachments.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {selectedTicket.attachments.map((file, idx) => {
                              const isImage = file.type.startsWith("image/");
                              const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
                              
                              return (
                                <div key={idx} className="flex flex-col p-2.5 rounded-xl bg-surface/60 border border-default hover:border-default transition justify-between gap-2.5">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    {isImage ? (
                                      <div className="w-10 h-10 rounded-lg overflow-hidden border border-default flex-shrink-0 bg-app flex items-center justify-center">
                                        <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
                                      </div>
                                    ) : (
                                      <div className={`w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center bg-app border border-default ${isPdf ? "text-red-400" : "text-emerald-400"}`}>
                                        <FileText className="h-5 w-5" />
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-semibold text-primary truncate" title={file.name}>
                                        {file.name}
                                      </p>
                                      <p className="text-[9px] text-muted uppercase font-mono tracking-wider">
                                        {isPdf ? "Documento PDF" : isImage ? "Imagem" : "Arquivo"}
                                      </p>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {isImage ? (
                                      <button
                                        onClick={() => setPreviewImage(file.url)}
                                        className="flex-1 py-1 px-2.5 bg-app hover:bg-surface border border-default rounded-lg text-[10px] font-bold text-secondary hover:text-emerald-400 flex items-center justify-center gap-1 transition cursor-pointer"
                                      >
                                        <Eye className="h-3 w-3" /> Visualizar
                                      </button>
                                    ) : (
                                      <a
                                        href={file.url}
                                        download={file.name}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-1 py-1 px-2.5 bg-app hover:bg-surface border border-default rounded-lg text-[10px] font-bold text-secondary hover:text-emerald-400 flex items-center justify-center gap-1 transition text-center"
                                      >
                                        <Upload className="h-3 w-3 rotate-180" /> Abrir / Baixar
                                      </a>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          /* Legacy single screenshot fallback */
                          <div className="flex flex-col items-center">
                            <button 
                              onClick={() => setPreviewImage(selectedTicket.screenshot || null)} 
                              className="relative block rounded-lg overflow-hidden border border-default group cursor-zoom-in max-w-full text-left"
                              title="Clique para abrir em tela cheia"
                            >
                              <img 
                                src={selectedTicket.screenshot} 
                                alt="Print do chamado" 
                                className="max-h-64 object-contain rounded-lg group-hover:scale-[1.015] transition-all duration-200" 
                              />
                              <div className="absolute inset-0 bg-app/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <span className="bg-app/95 text-primary text-[10px] font-bold px-2.5 py-1.5 rounded-xl border border-default shadow-xl flex items-center gap-1">
                                  <Eye className="h-3.5 w-3.5 text-emerald-400" /> Ver Imagem Completa
                                </span>
                              </div>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Interactive Control Controls (TI Assignment / Priority changer) */}
                  {isTechUser && (
                    <div className="p-4 bg-app border border-emerald-950/20 rounded-xl space-y-3">
                      <span className="text-[10px] font-bold text-secondary uppercase tracking-wider block">Painel do Técnico (Atendimento)</span>
                      
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        
                        {/* Assign to multiple technicians option */}
                        <div className="space-y-1.5 col-span-2 md:col-span-1">
                          <label className="text-secondary block text-[10px] font-bold uppercase tracking-wider">Técnicos Atribuídos</label>
                          {(() => {
                            const assignedTechs = getAssignedTechs(selectedTicket.assignedTo);
                            const firstTech = getFirstAssignedTech(selectedTicket);
                            const canManageAssignments = assignedTechs.length === 0 || (currentSession && currentSession.name === firstTech);

                            if (assignedTechs.length === 0) {
                              return (
                                <motion.button
                                  whileHover={{ scale: 1.01 }}
                                  whileTap={{ scale: 0.99 }}
                                  onClick={() => handleUpdateTicketMeta(selectedTicket.id, { assignedTo: currentSession.name })}
                                  className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 border border-emerald-400/20 shadow-lg shadow-emerald-950/20 hover:shadow-emerald-500/10 text-xs transition-all uppercase tracking-wider font-mono mt-1"
                                >
                                  <UserPlus className="h-4 w-4 animate-pulse text-white shrink-0" />
                                  Assumir Chamado
                                </motion.button>
                              );
                            }

                            return (
                              <>
                                <div 
                                  className="bg-app/80 p-2 rounded-xl border border-default/60 max-h-48 overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-neutral-800 scrollbar-track-transparent"
                                  title={!canManageAssignments ? `Apenas o primeiro técnico responsável (${firstTech}) pode alterar as atribuições.` : ""}
                                >
                                  {users
                                    .filter(u => u.role === "tecnico")
                                    .map(tech => {
                                      const isAssigned = getAssignedTechs(selectedTicket.assignedTo).includes(tech.name);
                                      const initials = tech.name
                                        .split(" ")
                                        .map((n: string) => n[0])
                                        .join("")
                                        .slice(0, 2)
                                        .toUpperCase();

                                      return (
                                        <div 
                                          key={tech.id} 
                                          onClick={() => {
                                            if (!canManageAssignments) return;
                                            const currentTechs = getAssignedTechs(selectedTicket.assignedTo);
                                            let updatedTechs: string[];
                                            if (currentTechs.includes(tech.name)) {
                                              updatedTechs = currentTechs.filter(name => name !== tech.name);
                                            } else {
                                              updatedTechs = [...currentTechs, tech.name];
                                            }
                                            const assignedStr = updatedTechs.length > 0 ? updatedTechs.join(", ") : null;
                                            handleUpdateTicketMeta(selectedTicket.id, { assignedTo: assignedStr });
                                          }}
                                          className={`group flex items-center justify-between p-2 rounded-lg border transition-all text-left select-none ${
                                            isAssigned
                                              ? "bg-emerald-950/15 border-emerald-500/20 text-emerald-300"
                                              : "bg-app border-default/60 text-secondary hover:border-default/80 hover:text-primary"
                                          } ${!canManageAssignments ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
                                        >
                                          <div className="flex items-center gap-2 min-w-0">
                                            {/* Avatar with Initials & Online Status Dot */}
                                            <div className="relative shrink-0">
                                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold border transition-colors ${
                                                isAssigned 
                                                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/20" 
                                                  : "bg-surface text-muted border-default"
                                              }`}>
                                                {initials}
                                              </div>
                                              {tech.isOnline && (
                                                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full border border-black shrink-0 animate-pulse" title="Online" />
                                              )}
                                            </div>
                                            
                                            <div className="min-w-0 leading-tight">
                                              <span className={`text-[11px] font-semibold block truncate ${isAssigned ? 'text-emerald-300' : 'text-secondary group-hover:text-primary'}`}>
                                                {tech.name}
                                              </span>
                                              <span className="text-[8px] text-muted font-bold uppercase tracking-wider block">Suporte</span>
                                            </div>
                                          </div>

                                          {/* Custom Checkbox/Lock Indicator */}
                                          <div className="shrink-0 flex items-center justify-center">
                                            {!canManageAssignments ? (
                                              isAssigned ? (
                                                <div className="w-4 h-4 rounded-full bg-emerald-500/10 text-emerald-500/60 flex items-center justify-center border border-emerald-500/10">
                                                  <Lock className="h-2.5 w-2.5" />
                                                </div>
                                              ) : null
                                            ) : isAssigned ? (
                                              <div className="w-4 h-4 rounded-full bg-emerald-500 text-black flex items-center justify-center shadow-md shadow-emerald-950/40">
                                                <Check className="h-2.5 w-2.5 stroke-[3]" />
                                              </div>
                                            ) : (
                                              <div className="w-4 h-4 rounded-full border border-default bg-app transition-colors group-hover:border-default" />
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                </div>
                                {!canManageAssignments && (
                                  <div className="p-2 bg-amber-500/5 border border-amber-500/10 rounded-lg text-[10px] text-amber-500 leading-normal font-medium flex items-start gap-1.5">
                                    <Lock className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                                    <span>Apenas o técnico inicialmente responsável (<strong>{firstTech}</strong>) pode gerenciar as atribuições.</span>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
 
                        {/* Adjust priority manually */}
                        <div className="space-y-1.5 col-span-2 md:col-span-1">
                          <label className="text-secondary block text-[10px] font-bold uppercase tracking-wider">Prioridade Operacional</label>
                          <div className="relative">
                            <select
                              value={selectedTicket.priority}
                              onChange={(e) => handleUpdateTicketMeta(selectedTicket.id, { priority: e.target.value as Ticket["priority"] })}
                              disabled={isAssignedToOther}
                              className={`w-full bg-app border border-default rounded-xl py-2 px-3 text-xs text-primary focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/25 transition-all ${
                                isAssignedToOther 
                                  ? "opacity-60 cursor-not-allowed text-muted" 
                                  : "hover:border-default/80 cursor-pointer"
                              }`}
                              title={isAssignedToOther ? `Apenas o técnico responsável (${selectedTicket.assignedTo}) pode alterar a prioridade.` : ""}
                            >
                              <option value="Baixa">Baixa</option>
                              <option value="Média">Média</option>
                              <option value="Alta">Alta</option>
                              <option value="Urgente">Urgente</option>
                            </select>
                          </div>
                        </div>
 
                      </div>

                      {/* Alterar Solicitante (Visible to technicians) */}
                      <div className="pt-2.5 border-t border-emerald-950/10 space-y-1.5">
                        <label className="text-secondary block text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                          <UserIcon className="h-3.5 w-3.5 text-emerald-400" />
                          Alterar Solicitante (Colaborador)
                        </label>
                        <select
                          value={selectedTicket.requesterName}
                          disabled={isAssignedToOther}
                          onChange={(e) => {
                            const selectedUser = users.find(u => u.name === e.target.value);
                            if (selectedUser) {
                              if (confirm(`Deseja realmente alterar o solicitante deste chamado para ${selectedUser.name}?`)) {
                                handleUpdateTicketMeta(selectedTicket.id, {
                                  requesterName: selectedUser.name,
                                  requesterDepartment: selectedUser.department
                                });
                              }
                            }
                          }}
                          className={`w-full bg-app border border-default rounded-xl py-2 px-3 text-xs text-secondary focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/25 transition-all ${
                            isAssignedToOther 
                              ? "opacity-60 cursor-not-allowed text-muted" 
                              : "hover:border-default/80 cursor-pointer"
                          }`}
                          title={isAssignedToOther ? `Apenas o técnico responsável (${selectedTicket.assignedTo}) pode alterar o solicitante.` : ""}
                        >
                          {users.map(u => (
                            <option key={u.id} value={u.name}>
                              {u.name} ({u.department || "Suporte"})
                            </option>
                          ))}
                        </select>
                        <p className="text-[9px] text-muted font-medium">Altere o colaborador que solicitou este chamado de suporte.</p>
                      </div>

                      {/* SLA/Ticket Type Setting (Visible to all technicians) */}
                      {currentSession?.role === "tecnico" && (
                        <div className="pt-2.5 border-t border-emerald-950/10 space-y-1.5">
                          <label className="text-secondary block text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <FolderKanban className="h-3.5 w-3.5 text-emerald-400" />
                            Tipo de SLA (Chamado ou Projeto)
                          </label>
                          <select
                            value={selectedTicket.projectDeadline ? "projeto" : "chamado"}
                            disabled={isAssignedToOther}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === "chamado") {
                                handleUpdateTicketMeta(selectedTicket.id, { projectDeadline: "" });
                              } else {
                                // Default project deadline is 7 days from now
                                const defaultDeadline = new Date();
                                defaultDeadline.setDate(defaultDeadline.getDate() + 7);
                                const dateStr = defaultDeadline.toISOString().split("T")[0];
                                handleUpdateTicketMeta(selectedTicket.id, { projectDeadline: dateStr });
                              }
                            }}
                            className="w-full bg-app border border-default rounded-xl py-2 px-3 text-xs text-secondary focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/25 transition-all hover:border-default/80 cursor-pointer"
                          >
                            <option value="chamado">Chamado Padrão (SLA Baseado em Horas)</option>
                            <option value="projeto">Projeto em Andamento (SLA Baseado em Data Limite)</option>
                          </select>
                          <p className="text-[9px] text-muted font-medium">
                            Selecione se este item deve ser tratado como um chamado padrão com SLA por prioridade ou um projeto de longo prazo com data limite de entrega.
                          </p>
                        </div>
                      )}

                      {/* Project Deadline Setting (Visible to all technicians and only if configured as a project) */}
                      {currentSession?.role === "tecnico" && selectedTicket.projectDeadline && (
                        <div className="pt-2.5 border-t border-emerald-950/10 space-y-1.5">
                          <label className="text-secondary block text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-emerald-400" />
                            Definir Data Limite do Projeto
                          </label>
                          <WindowsDatePicker
                            value={selectedTicket.projectDeadline}
                            onChange={(date) => handleUpdateTicketMeta(selectedTicket.id, { projectDeadline: date })}
                          />
                          <p className="text-[9px] text-muted font-medium">Defina ou altere o prazo limite para a conclusão do projeto associado a este chamado.</p>
                        </div>
                      )}

                      {/* Transfer Option (Only visible to the first assigned technician) */}
                      {getFirstAssignedTech(selectedTicket) === currentSession.name && (
                        <div className="pt-2.5 border-t border-emerald-950/10 space-y-1.5">
                          <label className="text-secondary block text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <RefreshCw className="h-3.5 w-3.5 text-emerald-400" />
                            Transferir chamado para outro técnico:
                          </label>
                          <select
                            defaultValue=""
                            className="w-full bg-app border border-default rounded-xl py-2 px-3 text-xs text-secondary focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/25 transition-all hover:border-default/80 cursor-pointer"
                            onChange={(e) => {
                              const targetTechName = e.target.value;
                              if (targetTechName) {
                                if (confirm(`Deseja realmente transferir este chamado para ${targetTechName}?`)) {
                                  handleUpdateTicketMeta(selectedTicket.id, { assignedTo: targetTechName });
                                }
                                e.target.value = ""; // reset selection
                              }
                            }}
                          >
                            <option value="" disabled>Selecione o técnico de destino...</option>
                            {users
                              .filter(u => u.role === "tecnico" && u.name !== currentSession.name)
                              .map(tech => (
                                <option key={tech.id} value={tech.name}>
                                  {tech.name} ({tech.department || "Suporte"}) {tech.isOnline ? "• Online" : ""}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action Button: Finalizar Chamado */}
                  <div className="p-4 bg-app border border-emerald-950/20 rounded-xl space-y-2">
                    <span className="text-[10px] font-bold text-secondary uppercase tracking-wider block">Ações Disponíveis</span>
                    
                    {isAssignedToOther && (
                      <div className="p-2.5 bg-amber-500/5 border border-amber-500/15 rounded-lg text-[10px] text-amber-400 leading-normal font-medium flex items-center gap-2 mb-2">
                        <span>⚠️ Este chamado está sob responsabilidade de <strong>{selectedTicket.assignedTo}</strong>. Apenas um dos responsáveis pode alterar ou finalizá-lo.</span>
                      </div>
                    )}

                    {selectedTicket.status !== "Resolvido" && selectedTicket.status !== "Fechado" ? (
                      <button
                        onClick={() => {
                          if (isAssignedToOther) {
                            alert(`Este chamado está atribuído a ${selectedTicket.assignedTo}. Apenas um dos técnicos responsáveis pode finalizá-lo.`);
                            return;
                          }
                          handleUpdateTicketMeta(selectedTicket.id, { status: "Resolvido" });
                        }}
                        disabled={isAssignedToOther}
                        className={`w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-sm cursor-pointer font-display ${isAssignedToOther ? "opacity-40 cursor-not-allowed" : ""}`}
                        title={isAssignedToOther ? `Apenas ${selectedTicket.assignedTo} pode finalizar este chamado` : ""}
                      >
                        <CheckCircle className="h-4 w-4" />
                        Finalizar Chamado (Marcar como Resolvido)
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          if (isAssignedToOther) {
                            alert(`Este chamado está atribuído a ${selectedTicket.assignedTo}. Apenas um dos técnicos responsáveis pode reabri-lo.`);
                            return;
                          }
                          handleUpdateTicketMeta(selectedTicket.id, { status: "Aberto" });
                        }}
                        disabled={isAssignedToOther}
                        className={`w-full py-2.5 bg-app hover:bg-surface text-primary font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 border border-emerald-950/25 cursor-pointer font-display ${isAssignedToOther ? "opacity-40 cursor-not-allowed" : ""}`}
                        title={isAssignedToOther ? `Apenas ${selectedTicket.assignedTo} pode reabrir este chamado` : ""}
                      >
                        <RefreshCw className="h-4 w-4 text-emerald-400" />
                        Reabrir Chamado (Definir como Aberto)
                      </button>
                    )}

                    {/* Excluir Chamado (Apenas para os técnicos responsáveis) */}
                    {currentSession.role === "tecnico" && (
                      <div className="pt-2 border-t border-default mt-2">
                        {!getAssignedTechs(selectedTicket.assignedTo).includes(currentSession.name) ? (
                          <button
                            type="button"
                            disabled
                            className="w-full py-2 bg-app text-muted border border-default/40 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-not-allowed"
                            title={`Apenas os técnicos responsáveis (${selectedTicket.assignedTo || 'Nenhum'}) podem excluir este chamado.`}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted" />
                            Excluir Chamado (Apenas Responsável)
                          </button>
                        ) : isConfirmingDeleteTicket === selectedTicket.id ? (
                          <div className="flex gap-2 w-full">
                            <button
                              type="button"
                              onClick={() => handleDeleteTicket(selectedTicket.id)}
                              className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-primary font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-rose-600/20"
                            >
                              <Trash2 className="h-4 w-4" />
                              Confirmar Exclusão?
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsConfirmingDeleteTicket(null)}
                              className="px-3 py-2 bg-surface hover:bg-surface-2 text-secondary font-medium rounded-xl text-xs border border-default transition cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setIsConfirmingDeleteTicket(selectedTicket.id)}
                            className="w-full py-2 bg-app hover:bg-rose-950/15 text-rose-400 hover:text-rose-300 border border-emerald-950/20 hover:border-rose-900/30 font-semibold rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Excluir Chamado
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* OS Local Notification Callout for Chat */}
                  <div className={`p-3 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 ${
                    desktopNotificationPermission === "granted"
                      ? "bg-emerald-950/20 border-emerald-500/20 text-emerald-300"
                      : desktopNotificationPermission === "denied"
                      ? "bg-rose-950/20 border-rose-500/30 text-rose-300"
                      : "bg-emerald-500/10 border-emerald-500/30 text-primary"
                  }`}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`p-2 rounded-lg shrink-0 ${
                        desktopNotificationPermission === "granted"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : desktopNotificationPermission === "denied"
                          ? "bg-rose-500/20 text-rose-400"
                          : "bg-emerald-600 text-white font-semibold"
                      }`}>
                        <BellRing className={`h-4 w-4 ${desktopNotificationPermission !== "granted" ? "animate-bounce" : ""}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-[11px] uppercase tracking-wider block truncate">
                            {desktopNotificationPermission === "granted"
                              ? "Notificações do Sistema Operacional Ativas"
                              : desktopNotificationPermission === "denied"
                              ? "Notificações do SO Bloqueadas"
                              : "Ative as Notificações Nativas do Sistema para este Chat"}
                          </span>
                        </div>
                        <p className="text-[10px] text-secondary leading-tight mt-0.5">
                          {desktopNotificationPermission === "granted"
                            ? "Sua área de trabalho avisará instantaneamente quando houver novas mensagens neste chamado."
                            : desktopNotificationPermission === "denied"
                            ? "Bloqueado no navegador. Clique ao lado para saber como permitir alertas de chat."
                            : "Para não perder mensagens deste chamado sem precisar ficar olhando para esta tela, ative as Notificações do SO."}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                      {desktopNotificationPermission === "granted" ? (
                        <button
                          type="button"
                          onClick={testDesktopNotification}
                          className="w-full sm:w-auto px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-bold text-[10px] rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Sparkles className="h-3 w-3 text-emerald-400" />
                          Testar Pop-up SO
                        </button>
                      ) : desktopNotificationPermission === "denied" ? (
                        <button
                          type="button"
                          onClick={() => setIsNotificationGuideOpen(true)}
                          className="w-full sm:w-auto px-3 py-1.5 bg-rose-500 hover:bg-rose-400 text-primary font-bold text-[10px] rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <HelpCircle className="h-3.5 w-3.5" />
                          Como Desbloquear
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await requestDesktopNotificationPermission();
                            if (res === "granted") {
                              testDesktopNotification();
                            }
                          }}
                          className="w-full sm:w-auto px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[10.5px] rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer shadow-sm font-sans"
                        >
                          <Bell className="h-3.5 w-3.5" />
                          Ativar no SO
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Interaction history and discussion thread */}
                  <div className="space-y-3 pt-2">
                    <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">Histórico de Discussão & Logs</span>
                    
                    <div className="space-y-2">
                      {selectedTicket.comments
                        .filter((comment) => comment.authorRole !== "ai")
                        .map((comment) => {
                        const isSystem = comment.authorRole === "system";
                        const isAI = comment.authorRole === "ai";
                        const isTechnical = comment.authorRole === "tecnico";

                        return (
                          <div
                            key={comment.id}
                            className={`p-3 rounded-xl border text-xs leading-relaxed ${
                              isSystem ? "bg-app/40 text-secondary border-default text-center py-2 italic font-mono text-[10px]" :
                              isAI ? "bg-emerald-950/5 text-emerald-300 border-emerald-500/10" :
                              isTechnical ? "bg-surface text-primary border-emerald-950/20" :
                              "bg-app text-primary border-default"
                            }`}
                          >
                            {!isSystem && (
                              <div className="flex justify-between items-center mb-1.5">
                                <span className="font-bold flex items-center gap-1">
                                  {isAI && <Sparkles className="h-3 w-3 text-emerald-400" />}
                                  {comment.authorName}
                                  <span className="text-[9px] font-normal text-muted">
                                    ({comment.authorRole})
                                  </span>
                                </span>
                                <span className="text-[10px] text-muted">
                                  {new Date(comment.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                              </div>
                            )}
                            
                            <p className="whitespace-pre-line text-xs">{comment.content}</p>

                            {comment.attachmentUrl && (
                              <div className="mt-2.5 p-2 bg-app/50 rounded-lg border border-default/60 flex items-center gap-2 max-w-sm" onClick={(e) => e.stopPropagation()}>
                                {comment.attachmentUrl.startsWith("data:image/") ? (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewImage(comment.attachmentUrl || null)}
                                    className="relative h-12 w-12 rounded-md overflow-hidden border border-default flex-shrink-0 cursor-zoom-in text-left"
                                    title="Clique para ver imagem cheia"
                                  >
                                    <img 
                                      src={comment.attachmentUrl} 
                                      alt="Anexo" 
                                      className="h-full w-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-app/40 opacity-0 hover:opacity-100 flex items-center justify-center transition">
                                      <Eye className="h-3 w-3 text-primary" />
                                    </div>
                                  </button>
                                ) : (
                                  <div className="h-10 w-10 rounded-md bg-surface border border-default flex items-center justify-center text-emerald-400 flex-shrink-0">
                                    <FileText className="h-5 w-5" />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-[10px] font-bold text-secondary truncate">{comment.attachmentName || "Anexo"}</p>
                                  <a
                                    href={comment.attachmentUrl}
                                    download={comment.attachmentName || "anexo.png"}
                                    className="text-[9px] text-emerald-400 hover:text-emerald-300 font-bold uppercase tracking-wider inline-flex items-center gap-1 mt-0.5 cursor-pointer"
                                  >
                                    Baixar arquivo
                                  </a>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>

                {/* Live Comments Thread Input bar */}
                <div className="border-t border-default bg-app flex flex-col">
                  {/* Attachment Preview Box */}
                  {commentAttachment && (
                    <div className="px-4 py-2 bg-app/80 border-b border-default flex items-center justify-between gap-3 text-xs animate-in slide-in-from-bottom-2 duration-150">
                      <div className="flex items-center gap-2 min-w-0">
                        {commentAttachment.startsWith("data:image/") ? (
                          <img 
                            src={commentAttachment} 
                            alt="Preview do anexo" 
                            className="h-8 w-8 rounded object-cover border border-default"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded bg-surface border border-default flex items-center justify-center text-emerald-400">
                            <FileText className="h-4 w-4" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-secondary truncate">{commentAttachmentName}</p>
                          <p className="text-[9px] text-muted uppercase font-medium">Pronto para enviar</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setCommentAttachment(null);
                          setCommentAttachmentName("");
                        }}
                        className="p-1 rounded-lg bg-surface hover:bg-surface-2 border border-default text-secondary hover:text-primary transition cursor-pointer flex items-center justify-center"
                        title="Remover anexo"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  <form onSubmit={handleAddComment} className="p-4 flex gap-2 items-center">
                    {/* File attach input helper */}
                    <input
                      type="file"
                      id="comment-file-input"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.type.startsWith("image/")) {
                            compressImage(file)
                              .then((compressedUrl) => {
                                setCommentAttachment(compressedUrl);
                                setCommentAttachmentName(file.name);
                              })
                              .catch(() => {
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  setCommentAttachment(reader.result as string);
                                  setCommentAttachmentName(file.name);
                                };
                                reader.readAsDataURL(file);
                              });
                          } else {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setCommentAttachment(reader.result as string);
                              setCommentAttachmentName(file.name);
                            };
                            reader.readAsDataURL(file);
                          }
                        }
                        e.target.value = "";
                      }}
                    />
                    <label
                      htmlFor="comment-file-input"
                      className="p-2.5 bg-surface hover:bg-surface border border-default text-secondary hover:text-primary rounded-xl transition cursor-pointer flex items-center justify-center flex-shrink-0"
                      title="Anexar imagem ou documento"
                    >
                      <Paperclip className="h-4 w-4" />
                    </label>

                    <input
                      type="text"
                      value={newCommentText}
                      onChange={(e) => setNewCommentText(e.target.value)}
                      onPaste={(e) => {
                        const item = e.clipboardData?.items?.[0];
                        if (item && item.type.startsWith("image/")) {
                          const file = item.getAsFile();
                          if (file) {
                            compressImage(file)
                              .then((compressedUrl) => {
                                setCommentAttachment(compressedUrl);
                                setCommentAttachmentName(file.name || "imagem_colada.png");
                              })
                              .catch(() => {
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  setCommentAttachment(reader.result as string);
                                  setCommentAttachmentName(file.name || "imagem_colada.png");
                                };
                                reader.readAsDataURL(file);
                              });
                          }
                        } else if (item && item.type.startsWith("application/")) {
                          const file = item.getAsFile();
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setCommentAttachment(reader.result as string);
                              setCommentAttachmentName(file.name || "documento_colado.pdf");
                            };
                            reader.readAsDataURL(file);
                          }
                        }
                      }}
                      placeholder={commentAttachment ? "Adicione um comentário opcional..." : "Adicionar comentário ao chamado..."}
                      className="flex-1 bg-surface border border-default text-xs rounded-xl px-3 py-2.5 text-primary placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                    />
                    <button
                      type="submit"
                      className="bg-emerald-500 hover:bg-emerald-400 text-black p-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center cursor-pointer flex-shrink-0"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </form>
                </div>

              </div>
            ) : null}

            </div>
          )}

        </motion.div>
        )}
        </AnimatePresence>

      </main>
      </motion.div>
      )}
      </AnimatePresence>
      </AppLayout>

      {expandOrigin && <TicketExpandOverlay origin={expandOrigin} onDone={() => setExpandOrigin(null)} />}

      {/* Modal: My Tickets History */}
      {isMyTicketsModalOpen && currentSession && (
        <div 
          onClick={() => setIsMyTicketsModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-app/80 backdrop-blur-sm p-4 cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-app border border-default w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh] cursor-default"
          >
            
            {/* Modal Header */}
            <div className="p-5 border-b border-default flex items-center justify-between bg-app/50 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                  <Layers className="h-4 w-4 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-display font-extrabold text-primary text-base">Meus Chamados</h3>
                  <p className="text-[10px] text-secondary">Gerencie todos os chamados abertos por você</p>
                </div>
              </div>
              <button
                onClick={() => setIsMyTicketsModalOpen(false)}
                className="text-secondary hover:text-primary text-xs font-bold bg-surface hover:bg-surface-2 px-3 py-1.5 rounded-xl transition cursor-pointer border border-default/55"
              >
                Fechar
              </button>
            </div>

            {/* Segmented view controls for technicians */}
            {currentSession.role === "tecnico" && (
              <div className="px-6 py-2 border-b border-default flex gap-2 bg-app/40">
                <button
                  onClick={() => {
                    setMyTicketsViewMode("created");
                    setMyTicketsTab("all");
                  }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer border ${
                    myTicketsViewMode === "created"
                      ? "bg-surface text-primary border-default"
                      : "bg-transparent text-secondary border-transparent hover:text-primary"
                  }`}
                >
                  Chamados Criados
                </button>
                <button
                  onClick={() => {
                    setMyTicketsViewMode("resolved");
                    setMyTicketsTab("all");
                  }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer border ${
                    myTicketsViewMode === "resolved"
                      ? "bg-emerald-500 text-muted border-emerald-500 shadow-sm"
                      : "bg-transparent text-secondary border-transparent hover:text-primary"
                  }`}
                >
                  Meus Atendimentos Resolvidos
                </button>
              </div>
            )}

            {/* Profile context summary */}
            <div className="px-4 sm:px-6 py-2.5 sm:py-3 bg-app/20 border-b border-default/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-surface flex items-center justify-center text-[8px] sm:text-[10px] font-bold text-emerald-400 border border-default shrink-0">
                  {currentSession.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase()}
                </div>
                <div className="flex flex-wrap items-baseline gap-1 sm:gap-1.5">
                  <span className="text-secondary font-semibold text-[11px] sm:text-xs">{currentSession.name}</span>
                  <span className="text-muted text-[9px] sm:text-[10px] font-medium">({currentSession.department})</span>
                </div>
              </div>
              <div className="text-[9px] sm:text-[10px] text-muted font-medium">
                {myTicketsViewMode === "resolved" ? (
                  <>
                    Total de chamados resolvidos por você: <strong className="text-emerald-400">{tickets.filter(t => getAssignedTechs(t.assignedTo).includes(currentSession.name) && (t.status === "Resolvido" || t.status === "Fechado")).length}</strong>
                  </>
                ) : (
                  <>
                    Total de chamados criados: <strong className="text-secondary">{tickets.filter(t => t.requesterName === currentSession.name).length}</strong>
                  </>
                )}
              </div>
            </div>

            {/* Tabs filter */}
            {myTicketsViewMode === "created" ? (
              <div className="p-3 sm:p-4 border-b border-default flex gap-1.5 sm:gap-2 overflow-x-auto scrollbar-none">
                <button
                  onClick={() => setMyTicketsTab("all")}
                  className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    myTicketsTab === "all"
                      ? "bg-emerald-500 text-muted shadow-lg shadow-emerald-500/10"
                      : "bg-app text-secondary hover:text-primary border border-default"
                  }`}
                >
                  <span>Todos</span>
                  <span className={`text-[8px] sm:text-[10px] font-extrabold px-1 sm:px-1.5 py-0.5 rounded-md ${
                    myTicketsTab === "all" ? "bg-app/20 text-muted" : "bg-surface text-secondary"
                  }`}>
                    {tickets.filter(t => t.requesterName === currentSession.name).length}
                  </span>
                </button>

                <button
                  onClick={() => setMyTicketsTab("unresolved")}
                  className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    myTicketsTab === "unresolved"
                      ? "bg-emerald-500 text-muted shadow-lg shadow-emerald-500/10"
                      : "bg-app text-secondary hover:text-primary border border-default"
                  }`}
                >
                  <span>Pendentes</span>
                  <span className={`text-[8px] sm:text-[10px] font-extrabold px-1 sm:px-1.5 py-0.5 rounded-md ${
                    myTicketsTab === "unresolved" ? "bg-app/20 text-muted" : "bg-surface text-secondary"
                  }`}>
                    {tickets.filter(t => t.requesterName === currentSession.name && t.status !== "Resolvido" && t.status !== "Fechado").length}
                  </span>
                </button>

                <button
                  onClick={() => setMyTicketsTab("resolved")}
                  className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    myTicketsTab === "resolved"
                      ? "bg-emerald-500 text-muted shadow-lg shadow-emerald-500/10"
                      : "bg-app text-secondary hover:text-primary border border-default"
                  }`}
                >
                  <span>Resolvidos</span>
                  <span className={`text-[8px] sm:text-[10px] font-extrabold px-1 sm:px-1.5 py-0.5 rounded-md ${
                    myTicketsTab === "resolved" ? "bg-app/20 text-muted" : "bg-surface text-secondary"
                  }`}>
                    {tickets.filter(t => t.requesterName === currentSession.name && (t.status === "Resolvido" || t.status === "Fechado")).length}
                  </span>
                </button>
              </div>
            ) : (
              <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-default bg-app/20 flex items-center justify-between gap-3">
                <span className="text-[10px] sm:text-xs text-secondary font-bold uppercase tracking-wider truncate">Histórico de Atendimentos Concluídos</span>
                <span className="text-[9px] sm:text-xs bg-emerald-500/10 text-emerald-400 font-semibold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg sm:rounded-xl border border-emerald-500/20 whitespace-nowrap">
                  {tickets.filter(t => getAssignedTechs(t.assignedTo).includes(currentSession.name) && (t.status === "Resolvido" || t.status === "Fechado")).length} Chamado(s)
                </span>
              </div>
            )}

            {/* List Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[250px] max-h-[50vh]">
              {(() => {
                const baseList = myTicketsViewMode === "resolved"
                  ? tickets.filter(t => getAssignedTechs(t.assignedTo).includes(currentSession.name) && (t.status === "Resolvido" || t.status === "Fechado"))
                  : tickets.filter(t => t.requesterName === currentSession.name);

                const filteredList = myTicketsViewMode === "resolved" ? baseList : baseList.filter(t => {
                  if (myTicketsTab === "unresolved") {
                    return t.status !== "Resolvido" && t.status !== "Fechado";
                  }
                  if (myTicketsTab === "resolved") {
                    return t.status === "Resolvido" || t.status === "Fechado";
                  }
                  return true;
                });

                if (filteredList.length === 0) {
                  return (
                    <div className="py-12 text-center text-muted space-y-3">
                      <CheckCircle className="h-8 w-8 text-muted mx-auto" />
                      <div>
                        <h4 className="text-xs font-bold text-secondary">Nenhum chamado encontrado</h4>
                        <p className="text-[10px] text-muted mt-1">Não há registros para esta categoria no momento.</p>
                      </div>
                    </div>
                  );
                }

                return filteredList.map((ticket) => {
                  const priorityBorder = 
                    ticket.priority === "Urgente" ? "border-l-rose-500" :
                    ticket.priority === "Alta" ? "border-l-amber-500" :
                    ticket.priority === "Média" ? "border-l-emerald-500" : "border-l-neutral-700";

                  const priorityTextClass = 
                    ticket.priority === "Urgente" ? "text-rose-400" :
                    ticket.priority === "Alta" ? "text-amber-400" :
                    ticket.priority === "Média" ? "text-emerald-400" : "text-secondary";

                  return (
                    <div
                      key={ticket.id}
                      onClick={() => {
                        setSelectedTicketId(ticket.id);
                        setIsMyTicketsModalOpen(false);
                      }}
                      className={`p-3.5 bg-app/50 hover:bg-app/50 rounded-xl border border-default border-l-4 ${priorityBorder} flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition cursor-pointer hover:border-emerald-500/20 group`}
                    >
                      <div className="space-y-1 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-bold text-muted">#{ticket.id}</span>
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            ticket.status === "Aberto" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                            ticket.status === "Em Atendimento" ? "bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-[0_0_10px_rgba(56,189,248,0.05)]" :
                            ticket.status === "Resolvido" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.05)]" :
                            ticket.status === "Fechado" ? "bg-surface-2/40 text-secondary border border-default/30" :
                            "bg-surface text-secondary border border-default"
                          }`}>
                            {ticket.status}
                          </span>
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            ticket.category === 'Acesso' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                            ticket.category === 'Redes' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            ticket.category === 'Hardware' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                            ticket.category === 'Software' ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' :
                            ticket.category === 'Sistemas' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            'bg-surface text-secondary'
                          }`}>
                            {ticket.category}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-primary group-hover:text-emerald-400 transition-colors line-clamp-1">{ticket.title}</h4>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted">
                          <span>
                            Aberto em: {new Date(ticket.createdAt).toLocaleDateString("pt-BR")} às {new Date(ticket.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {ticket.projectDeadline && (
                            <span className="flex items-center gap-1 text-emerald-400 font-semibold bg-emerald-500/5 px-1.5 py-0.2 rounded border border-emerald-500/10">
                              <Calendar className="h-3 w-3" />
                              Limite Projeto: {(() => {
                                try {
                                  const [year, month, day] = ticket.projectDeadline.split("-");
                                  return `${day}/${month}/${year}`;
                                } catch (e) {
                                  return ticket.projectDeadline;
                                }
                              })()}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex sm:flex-col items-start sm:items-end justify-between sm:justify-center gap-1.5 flex-shrink-0 text-[10px]">
                        <span className={`font-bold uppercase ${priorityTextClass}`}>{ticket.priority}</span>
                        <span className="text-secondary font-medium">
                          {ticket.assignedTo ? `Técnicos: ${ticket.assignedTo}` : "Sem técnico atribuído"}
                        </span>
                        <span className="text-emerald-500 font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                          Ver Detalhes <ArrowRight className="h-3 w-3" />
                        </span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            <div className="p-4 border-t border-default bg-app/30 text-center text-[10px] text-muted">
              Dica: Clique em qualquer chamado para abrir os detalhes completos e interagir com o suporte.
            </div>

          </div>
        </div>
      )}

      {/* Modal: Perfil Completo do Usuário */}
      <AnimatePresence>
      {isTechProfileModalOpen && selectedTechProfile && (() => {
        // Técnico = nível de acesso Técnico (mesmo critério da tabela). Antes bastava o setor conter "ti", o que tratava
        // colaboradores de setores como "TI" ou "Logística" como técnicos.
        const userIsTech = selectedTechProfile.role === "tecnico" || (selectedTechProfile.role as string) === "ti";
        // "Métricas" só existe para técnico; se o estado guardou essa aba de outro perfil, cai em "Visão geral".
        const profileTab = profileModalTab === "metrics" && !userIsTech ? "overview" : profileModalTab;
        const isCurrentSessionUser = currentSession && (selectedTechProfile.name === currentSession.name || selectedTechProfile.email === currentSession.email);

        // Tickets
        const requestedTickets = tickets.filter(t => t.requesterName === selectedTechProfile.name);
        const assignedTickets = tickets.filter(t => getAssignedTechs(t.assignedTo).includes(selectedTechProfile.name));
        const allUserTickets = userIsTech ? Array.from(new Set([...requestedTickets, ...assignedTickets])) : requestedTickets;

        const totalTicketsCount = allUserTickets.length;
        const activeTicketsCount = allUserTickets.filter(t => t.status !== "Resolvido" && t.status !== "Fechado").length;
        const resolvedTicketsCount = allUserTickets.filter(t => t.status === "Resolvido" || t.status === "Fechado").length;
        const projectTicketsCount = allUserTickets.filter(t => !!t.projectDeadline).length;

        // Technician SLA metrics
        const techSlaPct = profileTechSla?.pct ?? null;
        const techSlaSub = profileTechSla && profileTechSla.resolved > 0
          ? `${profileTechSla.onTime} de ${profileTechSla.resolved} resolvidos no prazo${isSmallSample(profileTechSla.resolved) ? " · amostra pequena" : ""}`
          : "Nenhum resolvido avaliável";

        // TMA em horas úteis (motor oficial, primeira resolução, descontadas as pausas) — mesma fonte do card de SLA.
        const techTmaStr = profileTechSla && profileTechSla.avgResolutionMin !== null ? formatBusinessMinutes(profileTechSla.avgResolutionMin) : "Sem dados";
        const techTmaSub = profileTechSla && profileTechSla.resolved > 0
          ? `Média de ${profileTechSla.resolved} resolvido${profileTechSla.resolved > 1 ? "s" : ""} · horas úteis${isSmallSample(profileTechSla.resolved) ? " · amostra pequena" : ""}`
          : "Nenhum resolvido avaliável";

        // Recent Activity Comments by this user
        const userComments = tickets
          .flatMap(t => (t.comments || []).filter(c => c.authorName === selectedTechProfile.name).map(c => ({ ...c, ticketTitle: t.title, ticketId: t.id })))
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 15);

        // Filtered tickets for Tickets Tab
        const filteredTickets = allUserTickets.filter(t => {
          if (profileTicketsFilter === "active") return t.status !== "Resolvido" && t.status !== "Fechado";
          if (profileTicketsFilter === "resolved") return t.status === "Resolvido" || t.status === "Fechado";
          if (profileTicketsFilter === "projects") return !!t.projectDeadline;
          return true;
        });

        const profilePresence = presenceOf(selectedTechProfile, currentSession);
        const canEditProfile = currentSession?.role === "tecnico" && users.some(u => u.id === selectedTechProfile.id);
        const canEditPhoto = canEditProfile; // somente Técnico (TI/Admin), e só para contas cadastradas
        const initials = selectedTechProfile.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase() || "U";

        return (
          <Drawer ariaLabel={`Perfil de ${selectedTechProfile.name}`} onClose={() => setIsTechProfileModalOpen(false)} restoreFocusTo={profileOpenerRef}>
            {/* Cabeçalho */}
            <div className="px-5 pt-5 pb-4 border-b border-default bg-surface">
              <div className="flex items-start gap-3.5">
                <Avatar name={selectedTechProfile.name} photo={selectedTechProfile.photo} className="h-14 w-14 text-lg" fallbackClassName="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20" />
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-lg font-bold text-primary leading-snug break-words">{selectedTechProfile.name}</h2>
                  <p className="text-sm text-secondary">{selectedTechProfile.department || "—"}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md border border-default bg-surface-2 text-xs font-medium text-secondary">
                      {userIsTech ? <Shield className="h-3 w-3" /> : <UserIcon className="h-3 w-3" />}
                      {roleLabel(userIsTech ? "tecnico" : "colaborador")}
                    </span>
                    {profilePresence !== "unknown" && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-secondary">
                        <span className={`h-2 w-2 rounded-full ${profilePresence === "online" ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"}`} />
                        {profilePresence === "online" ? "Online" : "Offline"}
                      </span>
                    )}
                    {isCurrentSessionUser && <span className="text-xs text-muted">· Sua conta</span>}
                  </div>
                </div>
                <button type="button" onClick={() => setIsTechProfileModalOpen(false)} aria-label="Fechar perfil" title="Fechar (Esc)" className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-lg text-secondary hover:text-primary hover:bg-surface-2 transition-colors duration-150 cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {(canEditProfile || isCurrentSessionUser || canEditPhoto) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {canEditPhoto && (
                    <>
                      <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => handlePhotoPicked(e.target.files?.[0])} />
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        disabled={photoBusy}
                        aria-busy={photoBusy}
                        className="h-9 px-3.5 inline-flex items-center gap-2 rounded-lg border border-default bg-surface hover:bg-surface-2 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-medium text-primary transition-colors duration-150 cursor-pointer"
                      >
                        <Camera className="h-4 w-4 text-secondary" aria-hidden />
                        {photoBusy ? "Enviando…" : selectedTechProfile.photo ? "Alterar foto" : "Adicionar foto"}
                      </button>
                      {selectedTechProfile.photo && (
                        <button
                          type="button"
                          onClick={handleRemovePhoto}
                          disabled={photoBusy}
                          className="h-9 px-3 inline-flex items-center gap-2 rounded-lg text-sm font-medium text-secondary hover:text-primary hover:bg-surface-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />Remover foto
                        </button>
                      )}
                    </>
                  )}
                  {canEditProfile && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = selectedTechProfile;
                        setIsTechProfileModalOpen(false);
                        handleStartEditUser(target);
                        setIsUserModalOpen(true);
                      }}
                      className="h-9 px-3.5 inline-flex items-center gap-2 rounded-lg border border-default bg-surface hover:bg-surface-2 text-sm font-medium text-primary transition-colors duration-150 cursor-pointer"
                    >
                      Editar colaborador
                    </button>
                  )}
                  {isCurrentSessionUser && (
                    <button
                      type="button"
                      onClick={() => { setIsTechProfileModalOpen(false); setIsNewTicketModalOpen(true); }}
                      className="h-9 px-3.5 inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors duration-150 cursor-pointer"
                    >
                      <PlusCircle className="h-4 w-4" />Novo Chamado
                    </button>
                  )}
                </div>
              )}
              {photoError && <p role="alert" className="mt-2 text-[13px] text-rose-800 dark:text-rose-300">{photoError}</p>}
            </div>

            {/* Abas */}
            <div role="tablist" aria-label="Seções do perfil" className="flex px-2 border-b border-default bg-surface overflow-x-auto scrollbar-none">
              {([
                { id: "overview", label: "Visão geral", icon: UserIcon, count: null },
                { id: "tickets", label: "Chamados", icon: FileText, count: totalTicketsCount },
                { id: "metrics", label: "Métricas", icon: Cpu, count: null },
                { id: "activity", label: "Atividade", icon: MessageSquare, count: userComments.length },
              ] as const).filter(({ id }) => id !== "metrics" || userIsTech).map(({ id, label, icon: Icon, count }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={profileTab === id}
                  onClick={() => setProfileModalTab(id)}
                  className={`py-2.5 px-2.5 text-[13px] font-medium inline-flex items-center gap-1 border-b-2 whitespace-nowrap cursor-pointer transition-colors duration-150 ${
                    profileTab === id ? "border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-400" : "border-transparent text-secondary hover:text-primary"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {label}
                  {count !== null && <span className="text-[11px] bg-surface-2 text-secondary font-semibold px-1.5 rounded-full">{count}</span>}
                </button>
              ))}
            </div>

            {/* Conteúdo */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-app" role="tabpanel">

                {/* TAB 1: VISÃO GERAL */}
                {profileTab === "overview" && (
                  <div className="space-y-6 animate-in fade-in duration-200">
                    
                    {/* Consolidated Bento Cards */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-surface border border-default/80 rounded-xl p-4 space-y-1">
                        <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">Total de Chamados</span>
                        <div className="text-2xl font-extrabold text-primary">{totalTicketsCount}</div>
                        <span className="text-[10px] text-muted block">Registrados no sistema</span>
                      </div>

                      <div className="bg-surface border border-default/80 rounded-xl p-4 space-y-1">
                        <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider block">Em Aberto / Ativos</span>
                        <div className="text-2xl font-extrabold text-amber-700 dark:text-amber-400">{activeTicketsCount}</div>
                        <span className="text-[10px] text-muted block">Aguardando/em fila</span>
                      </div>

                      <div className="bg-surface border border-default/80 rounded-xl p-4 space-y-1">
                        <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">Resolvidos / Fechados</span>
                        <div className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400">{resolvedTicketsCount}</div>
                        <span className="text-[10px] text-muted block">Finalizados com sucesso</span>
                      </div>

                      <div className="bg-surface border border-default/80 rounded-xl p-4 space-y-1">
                        <span className="text-[10px] font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wider block">
                          {userIsTech ? "SLA Cumprimento" : "Resolutividade"}
                        </span>
                        <div className="text-2xl font-extrabold text-sky-700 dark:text-sky-400">
                          {userIsTech ? (techSlaPct !== null ? `${techSlaPct}%` : "Sem dados") : totalTicketsCount > 0 ? `${Math.round((resolvedTicketsCount / totalTicketsCount) * 100)}%` : "—"}
                        </div>
                        <span className="text-[10px] text-muted block">{userIsTech ? techSlaSub : "Taxa de conclusão"}</span>
                      </div>
                    </div>

                    {/* Personal & Account Details Card */}
                    <div className="bg-surface border border-default/80 rounded-2xl p-5 space-y-4">
                      <div className="flex items-center justify-between border-b border-default/60 pb-3">
                        <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                          <UserIcon className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                          Informações da Conta & Acesso
                        </h4>
                        {selectedTechProfile.id && <span className="text-[10px] font-mono text-muted">ID: {selectedTechProfile.id}</span>}
                      </div>

                      <div className="grid grid-cols-1 gap-4 text-xs">
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-muted uppercase">Nome Completo</span>
                          <p className="font-semibold text-primary">{selectedTechProfile.name}</p>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-muted uppercase">E-mail de Contato</span>
                          <p className="font-semibold text-primary break-all">{selectedTechProfile.email || "—"}</p>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-muted uppercase">Cargo / Nível de Permissão</span>
                          <p className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                            <Shield className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
                            {userIsTech ? "Administrativo & Técnico de Suporte TI" : "Colaborador Solicitante de Chamados"}
                          </p>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-muted uppercase">Setor / Departamento</span>
                          <p className="font-semibold text-primary">{selectedTechProfile.department || "—"}</p>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-muted uppercase">Presença</span>
                          <p className="font-semibold text-primary flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${profilePresence === "online" ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"}`} />
                            {profilePresence === "online" ? "Online" : profilePresence === "offline" ? "Offline" : "Sem informação"}
                          </p>
                        </div>

                      </div>
                    </div>

                    {/* Quick Preview of Recent Tickets */}
                    <div className="bg-surface border border-default/80 rounded-2xl p-5 space-y-4">
                      <div className="flex items-center justify-between border-b border-default/60 pb-3">
                        <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                          <Clock className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                          Últimos Chamados Registrados
                        </h4>
                        <button
                          onClick={() => setProfileModalTab("tickets")}
                          className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          Ver Todos ({totalTicketsCount}) <ArrowRight className="h-3 w-3" />
                        </button>
                      </div>

                      {allUserTickets.length === 0 ? (
                        <div className="text-center py-6 text-muted text-xs">
                          Nenhum chamado registrado para este perfil até o momento.
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {allUserTickets.slice(0, 3).map((ticket) => (
                            <div
                              key={ticket.id}
                              onClick={() => {
                                setSelectedTicketId(ticket.id);
                                setIsTechProfileModalOpen(false);
                              }}
                              className="p-3 bg-surface-2/60 border border-default/80 rounded-xl flex items-center justify-between gap-3 hover:border-emerald-500/30 transition cursor-pointer group"
                            >
                              <div className="space-y-0.5 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-[9px] font-mono text-secondary">#{ticket.id}</span>
                                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-surface-2 text-secondary">
                                    {ticket.status}
                                  </span>
                                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                                    {ticket.category}
                                  </span>
                                </div>
                                <h5 className="text-xs font-bold text-primary group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors truncate">
                                  {ticket.title}
                                </h5>
                              </div>
                              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                Abrir <ArrowRight className="h-3 w-3" />
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>
                )}

                {/* TAB 2: CHAMADOS & HISTÓRICO */}
                {profileTab === "tickets" && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    
                    {/* Filter Pills */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setProfileTicketsFilter("all")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                          profileTicketsFilter === "all"
                            ? "bg-emerald-600 text-white"
                            : "bg-surface text-secondary hover:text-primary border border-default/80"
                        }`}
                      >
                        Todos ({totalTicketsCount})
                      </button>

                      <button
                        onClick={() => setProfileTicketsFilter("active")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                          profileTicketsFilter === "active"
                            ? "bg-amber-500 text-white"
                            : "bg-surface text-secondary hover:text-primary border border-default/80"
                        }`}
                      >
                        Ativos / Pendentes ({activeTicketsCount})
                      </button>

                      <button
                        onClick={() => setProfileTicketsFilter("resolved")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                          profileTicketsFilter === "resolved"
                            ? "bg-emerald-600 text-white"
                            : "bg-surface text-secondary hover:text-primary border border-default/80"
                        }`}
                      >
                        Resolvidos ({resolvedTicketsCount})
                      </button>

                      <button
                        onClick={() => setProfileTicketsFilter("projects")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                          profileTicketsFilter === "projects"
                            ? "bg-sky-600 text-white"
                            : "bg-surface text-secondary hover:text-primary border border-default/80"
                        }`}
                      >
                        Com Prazo de Projeto ({projectTicketsCount})
                      </button>
                    </div>

                    {/* List Area */}
                    <div className="space-y-3">
                      {filteredTickets.length === 0 ? (
                        <div className="py-12 text-center text-muted space-y-2 bg-surface border border-default/80 rounded-2xl">
                          <CheckCircle className="h-8 w-8 text-muted mx-auto" />
                          <h4 className="text-xs font-bold text-secondary">Nenhum chamado encontrado</h4>
                          <p className="text-[10px] text-muted">Não há chamados para o filtro selecionado neste perfil.</p>
                        </div>
                      ) : (
                        filteredTickets.map((ticket) => {
                          const priorityBorder = 
                            ticket.priority === "Urgente" ? "border-l-rose-500" :
                            ticket.priority === "Alta" ? "border-l-amber-500" :
                            ticket.priority === "Média" ? "border-l-emerald-500" : "border-l-zinc-700";

                          const isClosed = ticket.status === "Resolvido" || ticket.status === "Fechado";

                          return (
                            <div
                              key={ticket.id}
                              onClick={() => {
                                setSelectedTicketId(ticket.id);
                                setIsTechProfileModalOpen(false);
                              }}
                              className={`p-4 bg-surface border border-default/80 rounded-xl flex flex-col gap-2 hover:border-emerald-500/40 transition cursor-pointer group border-l-4 ${priorityBorder}`}
                            >
                              <div className="space-y-1 flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-[10px] bg-surface text-secondary border border-default px-1.5 py-0.2 rounded font-mono">
                                    #{ticket.id}
                                  </span>
                                  <span className={`border text-[9px] font-bold uppercase px-1.5 py-0.2 rounded ${
                                    isClosed 
                                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" 
                                      : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                                  }`}>
                                    {ticket.status}
                                  </span>
                                  <span className="bg-surface text-secondary text-[9px] font-bold uppercase px-1.5 py-0.2 rounded">
                                    {ticket.category}
                                  </span>
                                </div>
                                <h4 className="text-xs font-bold text-primary group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors truncate">
                                  {ticket.title}
                                </h4>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted">
                                  <span>Criado em: {new Date(ticket.createdAt).toLocaleDateString("pt-BR")}</span>
                                  <span>•</span>
                                  <span>Solicitante: {ticket.requesterName}</span>
                                  {ticket.assignedTo && (
                                    <>
                                      <span>•</span>
                                      <span>Técnico: {ticket.assignedTo}</span>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center justify-between gap-1 shrink-0 text-[10px]">
                                <span className="font-extrabold text-secondary uppercase">{ticket.priority}</span>
                                <span className="text-emerald-700 dark:text-emerald-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                  Ver Chamado <ArrowRight className="h-3 w-3" />
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                  </div>
                )}

                {/* TAB 3: MÉTRICAS & DESEMPENHO */}
                {profileTab === "metrics" && userIsTech && (
                  <div className="space-y-5 animate-in fade-in duration-200">
                    <div className="bg-surface border border-default/80 rounded-2xl p-5 space-y-4">
                      <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                        <Cpu className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                        Relatório de Desempenho do Perfil
                      </h4>

                      <div className="grid grid-cols-1 gap-3 text-center">
                        <div className="p-4 bg-surface-2/60 border border-default/80 rounded-xl space-y-1">
                          <span className="text-[10px] font-bold text-muted uppercase block">Total de Atendimentos</span>
                          <span className="text-2xl font-black text-primary">{totalTicketsCount}</span>
                          <span className="text-[10px] text-muted block">Registros associados</span>
                        </div>

                        <div className="p-4 bg-surface-2/60 border border-default/80 rounded-xl space-y-1">
                          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase block">SLA de Atendimento</span>
                          <span className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{techSlaPct !== null ? `${techSlaPct}%` : "Sem dados"}</span>
                          <span className="text-[10px] text-muted block">{techSlaSub}</span>
                        </div>

                        <div className="p-4 bg-surface-2/60 border border-default/80 rounded-xl space-y-1">
                          <span className="text-[10px] font-bold text-sky-700 dark:text-sky-400 uppercase block">Tempo Médio (TMA)</span>
                          <span className="text-2xl font-black text-sky-700 dark:text-sky-400">{techTmaStr}</span>
                          <span className="text-[10px] text-muted block">{techTmaSub}</span>
                        </div>
                      </div>
                    </div>

                    {/* Categories distribution */}
                    <div className="bg-surface border border-default/80 rounded-2xl p-5 space-y-4">
                      <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                        <Layers className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                        Distribuição por Categorias de Suporte
                      </h4>

                      {["Software", "Hardware", "Redes", "Acesso", "Sistemas", "Outros"].map((cat) => {
                        const count = allUserTickets.filter(t => t.category === cat).length;
                        const pct = totalTicketsCount > 0 ? Math.round((count / totalTicketsCount) * 100) : 0;
                        return (
                          <div key={cat} className="space-y-1 text-xs">
                            <div className="flex items-center justify-between font-medium">
                              <span className="text-secondary">{cat}</span>
                              <span className="text-muted">{count} chamado(s) ({pct}%)</span>
                            </div>
                            <div className="w-full bg-surface rounded-full h-1.5 overflow-hidden border border-default">
                              <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* TAB 4: ATIVIDADES RECENTES */}
                {profileTab === "activity" && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <div className="bg-surface border border-default/80 rounded-2xl p-5 space-y-4">
                      <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                        Histórico de Respostas & Comentários
                      </h4>

                      {userComments.length === 0 ? (
                        <div className="text-center py-8 text-muted text-xs">
                          Nenhum comentário ou resposta registrada por este perfil no histórico de chamados.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {userComments.map((comment) => (
                            <div
                              key={comment.id}
                              onClick={() => {
                                setSelectedTicketId(comment.ticketId);
                                setIsTechProfileModalOpen(false);
                              }}
                              className="p-3.5 bg-surface-2/60 border border-default/80 rounded-xl space-y-2 hover:border-emerald-500/30 transition cursor-pointer group"
                            >
                              <div className="flex items-center justify-between text-[10px] text-muted">
                                <span className="font-bold text-emerald-700 dark:text-emerald-400 group-hover:underline flex items-center gap-1">
                                  #{comment.ticketId} • {comment.ticketTitle}
                                </span>
                                <span>{new Date(comment.timestamp).toLocaleDateString("pt-BR")} às {new Date(comment.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                              </div>
                              <p className="text-xs text-secondary line-clamp-2 italic">
                                "{comment.content}"
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}


            </div>
          </Drawer>
        );
      })()}
      </AnimatePresence>

      {/* Slide-over Modal: Create New Ticket */}
      {isUserModalOpen && (
        <div onClick={() => setIsUserModalOpen(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreateOrUpdateUser}
            onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setIsUserModalOpen(false); } }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-form-title"
            className="bg-app border border-default w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-xl shadow-raised"
          >
            <div className="px-5 py-4 border-b border-default flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 id="user-form-title" className="font-display text-lg font-bold text-primary flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden />
                  {editingUserId ? "Editar Colaborador" : "Adicionar Colaborador"}
                </h3>
                <p className="text-[13px] text-secondary mt-0.5">{editingUserId ? "Atualize os dados de acesso do colaborador." : "Crie uma conta para um novo colaborador."}</p>
              </div>
              <button type="button" onClick={() => setIsUserModalOpen(false)} aria-label="Fechar" className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-lg text-secondary hover:text-primary hover:bg-surface-2 cursor-pointer"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              {userFormError && <p role="alert" className="text-[13px] text-rose-800 dark:text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2.5">{userFormError}</p>}
              <div className="space-y-1.5">
                <label htmlFor="uf-name" className="block text-sm font-medium text-primary">Nome completo <span className="text-rose-700 dark:text-rose-400">*</span></label>
                <input id="uf-name" type="text" required autoFocus value={newUserForm.name} onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })} className="h-10 w-full bg-surface border border-default rounded-lg px-3 text-sm text-primary focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="uf-email" className="block text-sm font-medium text-primary">E-mail <span className="text-rose-700 dark:text-rose-400">*</span></label>
                <input id="uf-email" type="email" required value={newUserForm.email} onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })} className="h-10 w-full bg-surface border border-default rounded-lg px-3 text-sm text-primary focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="uf-pass" className="block text-sm font-medium text-primary">{editingUserId ? "Nova senha (opcional)" : <>Senha inicial <span className="text-rose-700 dark:text-rose-400">*</span></>}</label>
                <input id="uf-pass" type="password" autoComplete="new-password" required={!editingUserId} value={newUserForm.password} onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })} className="h-10 w-full bg-surface border border-default rounded-lg px-3 text-sm text-primary focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15" />
                {editingUserId && <p className="text-xs text-muted leading-relaxed">Deixe em branco para manter a senha atual. Ao definir uma nova, o usuário será desconectado e precisará escolher a própria senha no próximo acesso.</p>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="uf-dept" className="block text-sm font-medium text-primary">Setor <span className="text-rose-700 dark:text-rose-400">*</span></label>
                  <select id="uf-dept" required value={newUserForm.department} onChange={(e) => setNewUserForm({ ...newUserForm, department: e.target.value })} className="h-10 w-full bg-surface border border-default rounded-lg px-2.5 text-sm text-primary focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 cursor-pointer">
                    {!USER_DEPARTMENTS.includes(newUserForm.department) && newUserForm.department && (
                      <option value={newUserForm.department}>{newUserForm.department}</option>
                    )}
                    {USER_DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="uf-role" className="block text-sm font-medium text-primary">Nível de acesso</label>
                  <select id="uf-role" value={newUserForm.role} onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value as UserRole })} className="h-10 w-full bg-surface border border-default rounded-lg px-2.5 text-sm text-primary focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 cursor-pointer">
                    <option value="colaborador">Colaborador</option>
                    <option value="tecnico">Técnico (TI / Admin)</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="px-5 py-3.5 border-t border-default bg-surface flex justify-end gap-2">
              <button type="button" onClick={() => setIsUserModalOpen(false)} className="h-10 px-4 rounded-lg border border-default bg-surface hover:bg-surface-2 text-sm font-medium text-secondary cursor-pointer">Cancelar</button>
              <button type="submit" disabled={isSubmittingUser} aria-busy={isSubmittingUser} className="h-10 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer">
                {isSubmittingUser && <RefreshCw className="h-4 w-4 motion-safe:animate-spin" aria-hidden />}
                {isSubmittingUser ? "Salvando…" : editingUserId ? "Salvar alterações" : "Cadastrar colaborador"}
              </button>
            </div>
          </form>
        </div>
      )}

      {isNewTicketModalOpen && (
        <div 
          onClick={() => setIsNewTicketModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-app/80 backdrop-blur-sm p-4 cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-app border border-default w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 cursor-default"
          >
            
            {/* Modal Header */}
            <div className="p-5 border-b border-default flex items-center justify-between bg-app/50">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-emerald-400" />
                <h3 className="font-display font-extrabold text-primary text-base">{newTicketForm.projectDeadline ? "Novo Projeto" : "Novo Chamado de Suporte"}</h3>
              </div>
              <button
                onClick={() => setIsNewTicketModalOpen(false)}
                className="text-secondary hover:text-primary text-xs font-bold bg-surface hover:bg-surface-2 border border-default/50 px-3 py-1.5 rounded-xl transition cursor-pointer"
              >
                Fechar
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateTicket} className="p-6 space-y-4">
              
              {/* Profile Context warning / Requester Info */}
              {isTechUser ? (
                <div className="bg-app/50 p-3.5 rounded-xl border border-default space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-muted block text-[10px] uppercase tracking-wider font-bold">Solicitando como:</span>
                      <strong className="text-primary text-sm">{selectedRequesterName || currentSession.name}</strong>
                    </div>
                    <div className="text-right">
                      <span className="text-muted block text-[10px] uppercase tracking-wider font-bold">Departamento:</span>
                      <span className="text-emerald-400 font-medium text-xs">{selectedRequesterDepartment || currentSession.department}</span>
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-extrabold uppercase tracking-widest text-muted flex items-center gap-1">
                      <Users className="h-3 w-3 text-emerald-400" />
                      Alterar Solicitante (Apenas Técnicos)
                    </label>
                    <select
                      value={users.find(u => u.name === selectedRequesterName)?.id || ""}
                      onChange={(e) => {
                        const u = users.find(user => user.id === e.target.value);
                        if (u) {
                          setSelectedRequesterName(u.name);
                          setSelectedRequesterDepartment(u.department);
                        } else {
                          setSelectedRequesterName(currentSession.name);
                          setSelectedRequesterDepartment(currentSession.department);
                        }
                      }}
                      className="w-full bg-app border border-default rounded-lg py-2 px-2.5 text-xs text-secondary focus:outline-none focus:border-emerald-500 transition-all cursor-pointer"
                    >
                      <option value="">{currentSession.name} (Você - {currentSession.department})</option>
                      {users
                        .filter(u => u.name !== currentSession.name)
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(u => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.role === "tecnico" ? "Técnico" : "Colaborador"} - {u.department})
                          </option>
                        ))
                      }
                    </select>
                  </div>
                </div>
              ) : (
                <div className="bg-app/50 p-3 rounded-xl border border-default text-xs text-secondary flex items-center justify-between">
                  <div>
                    <span className="text-muted block text-[10px]">Solicitando como:</span>
                    <strong className="text-primary">{currentSession.name}</strong>
                  </div>
                  <div>
                    <span className="text-muted block text-[10px]">Departamento:</span>
                    <span className="text-emerald-400 font-medium">{currentSession.department}</span>
                  </div>
                </div>
              )}

              {/* Title input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-secondary">{newTicketForm.projectDeadline ? "Nome do Projeto *" : "Título do Chamado *"}</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Impressora do faturamento não liga"
                  value={newTicketForm.title}
                  onChange={(e) => setNewTicketForm({ ...newTicketForm, title: e.target.value })}
                  className="w-full bg-app border border-default rounded-xl py-2 px-3 text-xs text-primary placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                />
              </div>

              {/* Description input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-secondary">Descrição Detalhada *</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Forneça o máximo de detalhes possível. Ex: Marca/Modelo do equipamento, mensagem de erro exibida, tentativas já feitas, se o problema afeta mais pessoas."
                  value={newTicketForm.description}
                  onChange={(e) => setNewTicketForm({ ...newTicketForm, description: e.target.value })}
                  className="w-full bg-app border border-default rounded-xl py-2 px-3 text-xs text-primary placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all resize-none"
                />
              </div>

              {/* Tipo de Atendimento selection */}
              {currentSession.role === "tecnico" && PROJECTS_MODULE_ENABLED && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-secondary flex items-center gap-1.5">
                      <FolderKanban className="h-3.5 w-3.5 text-emerald-400" />
                      Tipo de Atendimento
                    </label>
                    <select
                      value={newTicketForm.projectDeadline ? "projeto" : "chamado"}
                      onChange={(e) => {
                        if (e.target.value === "chamado") {
                          setNewTicketForm({ ...newTicketForm, projectDeadline: "" });
                        } else {
                          const defaultDeadline = new Date();
                          defaultDeadline.setDate(defaultDeadline.getDate() + 7);
                          const dateStr = defaultDeadline.toISOString().split("T")[0];
                          setNewTicketForm({ ...newTicketForm, projectDeadline: dateStr });
                        }
                      }}
                      className="w-full bg-app border border-default rounded-xl py-2 px-3 text-xs text-secondary focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all cursor-pointer"
                    >
                      <option value="chamado">Chamado Padrão</option>
                      <option value="projeto">Projeto em Andamento</option>
                    </select>
                  </div>

                  {/* If "projeto" is selected, show the date picker for deadline */}
                  {!!newTicketForm.projectDeadline && (
                    <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                      <label className="text-xs font-bold text-secondary flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-emerald-400" />
                        Data Limite do Projeto *
                      </label>
                      <WindowsDatePicker
                        value={newTicketForm.projectDeadline}
                        onChange={(date) => setNewTicketForm({ ...newTicketForm, projectDeadline: date })}
                      />
                    </div>
                  )}
                </div>
              )}



              {/* Screenshot and multiple attachments field */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-secondary flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Camera className="h-3.5 w-3.5 text-emerald-400" />
                    Anexar Prints / Imagens / PDFs (Opcional)
                  </span>
                  <span className="text-[10px] text-muted font-normal">
                    {newTicketForm.attachments.length} {newTicketForm.attachments.length === 1 ? "anexo" : "anexos"}
                  </span>
                </label>
                
                <div 
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files) {
                      handleAddFiles(e.dataTransfer.files);
                    }
                  }}
                  onPaste={(e) => {
                    const items = e.clipboardData?.items;
                    if (items) {
                      const files: File[] = [];
                      for (let i = 0; i < items.length; i++) {
                        const item = items[i];
                        if (item.kind === "file") {
                          const file = item.getAsFile();
                          if (file) files.push(file);
                        }
                      }
                      if (files.length > 0) {
                        handleAddFiles(files);
                      }
                    }
                  }}
                  className="border border-dashed border-default hover:border-emerald-500/20 bg-app hover:bg-app transition rounded-xl p-4 text-center cursor-pointer relative group"
                >
                  <input
                    type="file"
                    multiple
                    accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
                    onChange={(e) => {
                      if (e.target.files) {
                        handleAddFiles(e.target.files);
                      }
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <Upload className="h-5 w-5 text-muted group-hover:text-emerald-400 mx-auto mb-1.5 transition-colors" />
                  <p className="text-[11px] text-secondary font-medium">
                    Clique para selecionar ou <span className="text-emerald-400">arraste e solte</span> arquivos aqui
                  </p>
                  <p className="text-[9px] text-muted mt-0.5">
                    Aceita imagens, PDFs e documentos. Ctrl+V para colar prints.
                  </p>
                </div>

                {/* Attachments Preview Grid */}
                {newTicketForm.attachments.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 max-h-48 overflow-y-auto pr-1">
                    {newTicketForm.attachments.map((file, idx) => {
                      const isImage = file.type.startsWith("image/");
                      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
                      
                      return (
                        <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-surface/40 border border-default hover:border-default transition">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {isImage ? (
                              <div className="w-8 h-8 rounded-lg overflow-hidden border border-default flex-shrink-0 bg-app flex items-center justify-center">
                                <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
                              </div>
                            ) : (
                              <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center bg-app border border-default ${isPdf ? "text-red-400" : "text-emerald-400"}`}>
                                <FileText className="h-4 w-4" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-semibold text-secondary truncate animate-pulse-once" title={file.name}>
                                {file.name}
                              </p>
                              <p className="text-[9px] text-muted capitalize">
                                {isPdf ? "Documento PDF" : isImage ? "Imagem" : "Arquivo"}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setNewTicketForm((prev) => {
                                const newAttachments = prev.attachments.filter((_, i) => i !== idx);
                                const firstImage = newAttachments.find(a => a.type.startsWith("image/"))?.url || "";
                                return {
                                  ...prev,
                                  attachments: newAttachments,
                                  screenshot: firstImage
                                };
                              });
                            }}
                            className="p-1 text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                            title="Remover anexo"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Actions buttons */}
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-default">
                <button
                  type="button"
                  onClick={() => setIsNewTicketModalOpen(false)}
                  className="px-4 py-2 bg-surface hover:bg-surface-2 text-secondary font-semibold rounded-xl text-xs border border-default transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTicket}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
                >
                  {isSubmittingTicket ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      Processando IA...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-3.5 w-3.5" />
                      Enviar Chamado
                    </>
                  )}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {deletingUser && (
        <div 
          onClick={() => setDeletingUser(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-app/80 backdrop-blur-sm p-4 cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-app border border-default w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 cursor-default"
          >
            <div className="p-5 border-b border-default bg-app/50 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-rose-400" />
              <h3 className="font-display font-extrabold text-primary text-sm">Excluir Conta do Colaborador</h3>
            </div>
            
            <div className="p-6 space-y-4">
              <p className="text-xs text-secondary leading-relaxed">
                Tem certeza que deseja excluir o colaborador <strong className="text-primary">{deletingUser.name}</strong>?
              </p>
              <div className="p-3 bg-app/50 border border-default rounded-xl space-y-1">
                <div className="text-[10px] text-muted">Setor / Departamento:</div>
                <div className="text-xs text-primary font-bold">{deletingUser.department}</div>
                <div className="text-[10px] text-muted mt-2">E-mail Corporativo:</div>
                <div className="text-xs text-primary font-mono">{deletingUser.email}</div>
              </div>
              <p className="text-[10px] text-rose-400/90 italic">
                Aviso: Esta ação é permanente e removerá todas as credenciais de acesso deste usuário.
              </p>
            </div>

            <div className="p-4 bg-app/20 border-t border-default flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                className="px-4 py-2 bg-surface hover:bg-surface border border-default text-secondary font-semibold rounded-xl text-xs transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteUser}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-primary font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Real-time Notification Center */}
      {currentSession && notifications.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none font-sans">
          {notifications.map((notif) => {
            const isComment = notif.type === "comment";
            const toastStyle = (localStorage.getItem("gran7_notif_toast_style") as ToastStyle) || "emerald";

            let cardContainerStyle = "bg-surface border border-emerald-500/50 shadow-2xl";
            if (isComment) {
              cardContainerStyle = "bg-surface border border-cyan-500/50 shadow-2xl";
            }
            if (toastStyle === "glass") {
              cardContainerStyle = "bg-app/95 border border-default shadow-xl";
            } else if (toastStyle === "compact") {
              cardContainerStyle = "bg-surface border border-default shadow-lg py-2.5 px-3.5";
            }

            return (
              <div
                key={notif.id}
                onClick={() => {
                  setSelectedTicketId(notif.ticketId);
                  setActiveTab("painel");
                  setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
                }}
                className={`${cardContainerStyle} text-primary rounded-2xl p-4 flex flex-col pointer-events-auto cursor-pointer animate-in slide-in-from-bottom duration-300 hover:scale-[1.02] transition-all duration-200 group`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isComment ? 'bg-cyan-400' : 'bg-emerald-400'} opacity-75`}></span>
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${isComment ? 'bg-cyan-500' : 'bg-emerald-500'}`}></span>
                    </span>
                    <span className={`text-[10px] font-mono font-bold ${isComment ? 'text-cyan-400' : 'text-emerald-400'} uppercase tracking-widest flex items-center gap-1`}>
                      {isComment ? (
                        <>
                          <MessageSquare className="h-3 w-3" /> NOVA MENSAGEM
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3 w-3" /> NOVO CHAMADO ABERTO
                        </>
                      )}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
                    }}
                    className="text-secondary hover:text-primary transition-colors p-1 -m-1 focus:outline-none flex items-center justify-center"
                    title="Fechar"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                
                <h4 className={`font-display font-extrabold text-sm mt-2 text-primary ${isComment ? 'group-hover:text-cyan-300' : 'group-hover:text-emerald-300'} transition-colors line-clamp-1`}>
                  {notif.title}
                </h4>

                {isComment && notif.commentText && (
                  <p className="text-secondary text-xs mt-1.5 bg-app/40 border border-default/40 px-2.5 py-2 rounded-xl italic line-clamp-2 leading-relaxed">
                    "{notif.commentText}"
                  </p>
                )}
                
                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-default text-xs">
                  <span className="text-secondary font-mono text-[10px]">
                    {isComment ? "Por: " : "De: "}<span className="text-primary font-sans font-semibold">{isComment ? notif.commentAuthor : notif.requesterName}</span>
                  </span>
                  <span className="text-[9px] text-muted font-mono">
                    {notif.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full-Screen Image Preview Modal */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-app/95 backdrop-blur-md p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewImage(null)}
        >
          {/* Top toolbar */}
          <div className="w-full max-w-5xl flex items-center justify-between mb-4 px-2 select-none" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-emerald-400" />
              <span className="text-xs font-bold text-secondary uppercase tracking-widest">Visualização do Anexo</span>
            </div>
            <div className="flex items-center gap-3">
              <a 
                href={previewImage} 
                download="screenshot.png"
                className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-default text-secondary font-bold rounded-xl text-[10px] uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5"
              >
                Download
              </a>
              <button
                onClick={() => setPreviewImage(null)}
                className="p-1.5 rounded-xl bg-surface hover:bg-surface-2 border border-default text-secondary hover:text-primary transition cursor-pointer flex items-center justify-center"
                title="Fechar visualização"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          
          {/* Main Image frame */}
          <div className="relative max-w-5xl max-h-[80vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <img 
              src={previewImage} 
              alt="Visualização ampliada" 
              className="max-w-full max-h-[80vh] object-contain rounded-2xl border border-default shadow-2xl animate-in zoom-in-95 duration-200"
            />
          </div>

          <p className="text-[10px] text-muted font-medium uppercase mt-4 select-none">Clique em qualquer lugar fora para fechar</p>
        </div>
      )}

      {/* Notification Guide Modal */}
      <NotificationGuideModal
        isOpen={isNotificationGuideOpen}
        onClose={() => setIsNotificationGuideOpen(false)}
        onRetryPermission={requestDesktopNotificationPermission}
        onTestNotification={testDesktopNotification}
        currentPermission={desktopNotificationPermission}
      />

      {/* Notification Customizer Modal */}
      <NotificationCustomizerModal
        isOpen={isNotificationCustomizerOpen}
        onClose={() => setIsNotificationCustomizerOpen(false)}
        desktopPermission={desktopNotificationPermission}
        onRequestDesktopPermission={requestDesktopNotificationPermission}
        onTriggerTestNotification={(customTitle, customBody) => {
          showDesktopNotification(
            customTitle || "⚡ GRAN7 HELP • Alerta de Teste",
            customBody || "Sua notificação personalizada foi enviada com sucesso!",
            selectedTicketId || undefined
          );
        }}
      />

      {preloaderJSX}
    </div>
    {loginLayer}
    </>
  );
}
