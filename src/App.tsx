import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Ticket, Comment, UserSession, UserRole, User, Attachment } from "./types";
import { getApiUrl } from "./lib/api";
import SlaAnalytics from "./components/SlaAnalytics";
import LoginScreen from "./components/LoginScreen";
import ChangePasswordScreen from "./components/ChangePasswordScreen";
import WindowsDatePicker from "./components/WindowsDatePicker";
import PlantationBackground from "./components/PlantationBackground";
import logoImg from "./assets/images/logo.png";
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
  BellOff
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

export default function App() {
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
  
  // Navigation tabs (Only available for IT team)
  const [activeTab, setActiveTab] = useState<"painel" | "projetos" | "sla" | "colaboradores" | "banco_dados">("painel");
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [modulesCollapsed, setModulesCollapsed] = useState<boolean>(false);
  const [isMobileModulesOpen, setIsMobileModulesOpen] = useState<boolean>(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState<boolean>(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [projectViewMode, setProjectViewMode] = useState<"bento" | "kanban" | "timeline">("bento");

  // Database status and synchronization states
  const [dbStatus, setDbStatus] = useState<{ configured: boolean; connected: boolean; error: string | null } | null>(null);
  const [dbChecking, setDbChecking] = useState<boolean>(false);
  const [syncingDb, setSyncingDb] = useState<"idle" | "push" | "pull" | "success" | "error">("idle");
  const [syncDbError, setSyncDbError] = useState<string | null>(null);
  const [dbSqlSchema, setDbSqlSchema] = useState<string>("");
  const [copySuccess, setCopySuccess] = useState<boolean>(false);

  // App states
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
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
    }, 2500); // Enforce a minimum of 2.5 seconds for a premium system boots/loading effect
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let currentProgress = 0;
    const interval = setInterval(() => {
      if (currentProgress < 30) {
        currentProgress += Math.floor(Math.random() * 5) + 2; // steady start
      } else if (currentProgress < 75) {
        currentProgress += Math.floor(Math.random() * 3) + 1; // progressive loading
      } else if (currentProgress < 92) {
        currentProgress += (Math.random() > 0.5 ? 1 : 0); // slow and steady toward final hold
      } else {
        // Hold at 92% until real loading completes & min time has elapsed
        clearInterval(interval);
      }
      setPreloaderProgress(Math.min(currentProgress, 92));
    }, 45); // elegant, readable progression

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
      }, 250);

      const unmountTimer = setTimeout(() => {
        setShowPreloader(false);
      }, 850);

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
      const notification = new Notification(title, options);
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
      const options: NotificationOptions & { data?: any } = {
        body,
        icon: "/src/assets/images/7.png",
        badge: "/src/assets/images/7.png",
        tag: ticketId ? `ticket-${ticketId}` : undefined,
        requireInteraction: true,
        data: ticketId ? { ticketId } : undefined
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
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
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
  const [isConfirmingDeleteTicket, setIsConfirmingDeleteTicket] = useState<string | null>(null);

  // User management states
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
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

  // Fetch tickets helper
  const fetchTickets = async (showQuietly = false) => {
    if (!showQuietly) setLoading(true);
    setIsPolling(true);
    try {
      const response = await fetch(getApiUrl("/api/tickets"));
      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await response.json();
          setTickets(data);
          setLastUpdated(new Date());
        } else {
          const text = await response.text();
          console.warn("Retorno da API de chamados não é JSON (provavelmente HTML de carregamento ou erro do servidor):", text.substring(0, 100));
        }
      } else {
        console.warn("API de chamados retornou erro HTTP:", response.status, response.statusText);
      }
    } catch (error) {
      console.error("Erro ao sincronizar chamados:", error);
    } finally {
      setLoading(false);
      setIsPolling(false);
    }
  };

  // Fetch users helper
  const fetchUsers = async () => {
    try {
      const response = await fetch(getApiUrl("/api/users"));
      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await response.json();
          setUsers(data);
        } else {
          const text = await response.text();
          console.warn("Retorno da API de colaboradores não é JSON (provavelmente HTML de carregamento ou erro do servidor):", text.substring(0, 100));
        }
      } else {
        console.warn("API de colaboradores retornou erro HTTP:", response.status, response.statusText);
      }
    } catch (error) {
      console.error("Erro ao carregar colaboradores:", error);
    }
  };

  // Fetch database status
  const fetchDbStatus = async () => {
    setDbChecking(true);
    try {
      const response = await fetch(getApiUrl("/api/supabase/status"));
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
      const response = await fetch(getApiUrl("/api/supabase/sql"));
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
      const response = await fetch(getApiUrl("/api/supabase/sync"), { method: "POST" });
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
      const response = await fetch(getApiUrl("/api/supabase/pull"), { method: "POST" });
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
    if (currentSession?.role === "tecnico") {
      fetchDbStatus();
      fetchDbSchema();
    }
  }, [currentSession]);

  // Force non-technicians to stay on the main tickets queue ('painel')
  useEffect(() => {
    if (currentSession && currentSession.role !== "tecnico") {
      if (activeTab !== "painel") {
        setActiveTab("painel");
      }
    }
  }, [currentSession, activeTab]);

  // Poll tickets and users every 15 seconds for real-time fidelity with low egress overhead
  useEffect(() => {
    fetchTickets();
    fetchUsers();

    // Send a heartbeat ping to the server to register online presence
    const sendHeartbeat = () => {
      if (currentSession?.email) {
        fetch(getApiUrl("/api/heartbeat"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: currentSession.email })
        }).catch((err) => {
          console.warn("Falha ao enviar heartbeat:", err);
        });
      }
    };

    sendHeartbeat();

    const interval = setInterval(() => {
      fetchTickets(true);
      fetchUsers();
      sendHeartbeat();
    }, 15000);
    return () => clearInterval(interval);
  }, [currentSession?.email]);

  // Audio notification helper using Web Audio API for maximum reliability
  const playNotificationSound = () => {
    try {
      let ctx = audioContextRef.current;
      
      // Fallback: If not unlocked or created yet, try creating it now
      if (!ctx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;
        ctx = new AudioContextClass();
        audioContextRef.current = ctx;
      }
      
      if (ctx.state === "suspended") {
        ctx.resume();
      }
      
      const now = ctx.currentTime;
      
      // Gentle synthesizer double chime/bell sound (C5 -> E5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(523.25, now); // C5
      gain1.gain.setValueAtTime(0.12, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.4);
      
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(659.25, now + 0.12); // E5
      gain2.gain.setValueAtTime(0.12, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.52);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.52);
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

        // Visual notifications (on-screen pop-ups) only appear for the IT team (technicians)
        if (currentSession?.role === "tecnico") {
          hasNewNotification = true;
          showDesktopNotification(
            `Novo Chamado: ${t.title}`,
            `Solicitante: ${t.requesterName} (${t.requesterDepartment || "TI"})`,
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
              `Mensagem em: ${t.title}`,
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
        const response = await fetch(getApiUrl("/api/reset"), { method: "POST" });
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
    
    try {
      const response = await fetch(getApiUrl(`/api/tickets/${ticketId}`), {
        method: "DELETE",
        headers: {
          "x-user-role": currentSession.role,
          "x-user-name": currentSession.name
        }
      });

      if (response.ok) {
        setIsConfirmingDeleteTicket(null);
        setSelectedTicketId(null);
        await fetchTickets();
      } else {
        const errData = await response.json();
        alert(errData.error || "Erro ao excluir o chamado.");
      }
    } catch (error) {
      console.error("Erro ao excluir chamado:", error);
    }
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
    try {
      const response = await fetch(getApiUrl("/api/tickets"), {
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
        const newTicket = await response.json();
        setIsNewTicketModalOpen(false);
        setNewTicketForm({ title: "", description: "", screenshot: "", projectDeadline: "", attachments: [] });
        await fetchTickets();
        // Auto-select the newly created ticket to show AI Triage immediately
        setSelectedTicketId(newTicket.id);
      }
    } catch (error) {
      console.error("Erro ao abrir chamado:", error);
    } finally {
      setIsSubmittingTicket(false);
    }
  };

  const handleStartEditUser = (user: User) => {
    setEditingUserId(user.id);
    setNewUserForm({
      name: user.name,
      email: user.email,
      password: user.password || "",
      department: user.department,
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
    try {
      const url = editingUserId ? `/api/users/${editingUserId}` : "/api/users";
      const method = editingUserId ? "PUT" : "POST";

      const response = await fetch(getApiUrl(url), {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUserForm)
      });

      if (response.ok) {
        const data = await response.json();
        if (editingUserId) {
          setUserFormSuccess(`Colaborador ${data.name} atualizado com sucesso!`);
          handleCancelEditUser();
        } else {
          setUserFormSuccess(`Colaborador ${data.name} cadastrado com sucesso!`);
          setNewUserForm({
            name: "",
            email: "",
            password: "",
            department: "Financeiro",
            role: "colaborador"
          });
        }
        await fetchUsers(); // Atualiza a lista em tempo real
      } else {
        const errData = await response.json();
        setUserFormError(errData.error || "Erro ao salvar informações do colaborador.");
      }
    } catch (error) {
      console.error("Erro ao salvar colaborador:", error);
      setUserFormError("Erro de conexão ao processar as informações.");
    } finally {
      setIsSubmittingUser(false);
    }
  };

  const handleDeleteUserClick = (user: User) => {
    setDeletingUser(user);
  };

  const handleConfirmDeleteUser = async () => {
    if (!deletingUser) return;
    
    try {
      const response = await fetch(getApiUrl(`/api/users/${deletingUser.id}`), {
        method: "DELETE"
      });

      if (response.ok) {
        const emailDeleted = deletingUser.email;
        setDeletingUser(null);
        await fetchUsers();
        
        // If logged in as deleted user, log out immediately
        if (currentSession?.email === emailDeleted) {
          handleLogout();
        }
      } else {
        const errData = await response.json();
        alert(errData.error || "Erro ao excluir o colaborador.");
        setDeletingUser(null);
      }
    } catch (error) {
      console.error("Erro ao deletar:", error);
      alert("Erro de conexão ao tentar excluir colaborador.");
      setDeletingUser(null);
    }
  };

  const handleUpdateTicketMeta = async (ticketId: string, fields: Partial<Ticket>) => {
    try {
      const payload = {
        ...fields,
        requesterUser: currentSession?.name || null
      };
      const response = await fetch(getApiUrl(`/api/tickets/${ticketId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        const updated = await response.json();
        // Update local state smoothly
        setTickets(prev => prev.map(t => t.id === ticketId ? updated : t));
      } else {
        const errData = await response.json();
        alert(errData.error || "Erro ao atualizar chamado.");
      }
    } catch (error) {
      console.error("Erro ao atualizar chamado:", error);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicketId || (!newCommentText.trim() && !commentAttachment)) return;

    try {
      const response = await fetch(getApiUrl(`/api/tickets/${selectedTicketId}/comments`), {
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

      if (response.ok) {
        const newComment = await response.json();
        setTickets(prev => prev.map(t => {
          if (t.id === selectedTicketId) {
            return {
              ...t,
              comments: [...t.comments, newComment],
              updatedAt: new Date().toISOString()
            };
          }
          return t;
        }));
        setNewCommentText("");
        setCommentAttachment(null);
        setCommentAttachmentName("");
      }
    } catch (error) {
      console.error("Erro ao adicionar comentário:", error);
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
      className={`fixed inset-0 z-[9999] bg-[#030303] flex flex-col items-center justify-center font-sans overflow-hidden transition-all duration-700 ease-in-out ${
        preloaderFadeOut ? "opacity-0 scale-105 pointer-events-none" : "opacity-100 scale-100"
      }`}
    >
      {/* Subtle high-tech background grid overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(16,185,129,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(16,185,129,0.03)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      {/* Ambient glowing blobs */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/[0.03] rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-emerald-400/[0.04] rounded-full blur-[80px] pointer-events-none" />

      {/* Main Glassmorphic Card */}
      <div className="relative z-10 max-w-[290px] xs:max-w-[320px] sm:max-w-sm w-full mx-4 border border-emerald-500/10 bg-neutral-950/50 backdrop-blur-md rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-[0_0_80px_rgba(16,185,129,0.05),inset_0_1px_1px_rgba(255,255,255,0.05)] text-center flex flex-col items-center gap-5 sm:gap-7 overflow-hidden">
        {/* Futuristic HUD corner brackets */}
        <div className="absolute top-0 left-0 w-3 sm:w-4 h-3 sm:h-4 border-t-2 border-l-2 border-emerald-500/30" />
        <div className="absolute top-0 right-0 w-3 sm:w-4 h-3 sm:h-4 border-t-2 border-r-2 border-emerald-500/30" />
        <div className="absolute bottom-0 left-0 w-3 sm:w-4 h-3 sm:h-4 border-b-2 border-l-2 border-emerald-500/30" />
        <div className="absolute bottom-0 right-0 w-3 sm:w-4 h-3 sm:h-4 border-b-2 border-r-2 border-emerald-500/30" />

        {/* Top HUD Tag */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full bg-emerald-950/20 border border-emerald-500/10 text-[7px] sm:text-[8px] font-mono font-bold tracking-wider text-emerald-400 uppercase">
          <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>SISTEMA ATIVO // SECURE GATEWAY</span>
        </div>

        {/* Logo Area with dynamic rings */}
        <div className="relative w-20 h-20 sm:w-28 sm:h-28 flex items-center justify-center mt-1 sm:mt-2">
          {/* Dashed outer spinner */}
          <div className="absolute inset-0 rounded-full border border-dashed border-emerald-500/20 animate-[spin_12s_linear_infinite]" />
          {/* Glowing ring */}
          <div className="absolute -inset-1 rounded-full border border-emerald-500/10 animate-pulse-slow" />
          {/* Pulse flare */}
          <div className="absolute -inset-2 rounded-full border border-emerald-400/5 animate-ping [animation-duration:4s]" />
          
          {/* Deep glow underlogo */}
          <div className="absolute inset-3 sm:inset-4 bg-emerald-500/10 rounded-full blur-lg sm:blur-xl" />

          <img
            src={logoMin}
            alt="GRAN7"
            className="w-11 h-11 sm:w-16 sm:h-16 object-contain relative z-10 filter drop-shadow-[0_0_12px_rgba(16,185,129,0.35)] transition-all duration-300"
          />
        </div>

        {/* Text Area */}
        <div className="space-y-1 sm:space-y-1.5 text-center">
          <h1 className="font-display font-black text-lg sm:text-2xl tracking-tight text-white flex items-center justify-center">
            GRAN<span className="text-emerald-400 font-bold italic">7</span><span className="text-emerald-400 font-light tracking-[0.2em] ml-1 sm:ml-1.5"> HELP</span>
          </h1>
          <p className="text-[8px] sm:text-[10px] uppercase tracking-[0.2em] sm:tracking-[0.25em] text-slate-500 font-extrabold">Help Desk inteligente corporativo</p>
        </div>

        {/* Detailed Progress Loading Section */}
        <div className="w-full space-y-1.5 sm:space-y-2 mt-1 sm:mt-2">
          {/* Percentage & Status Label Row */}
          <div className="flex justify-between items-center text-[8px] sm:text-[10px] font-mono font-bold tracking-wider text-slate-400 px-0.5">
            <div className="flex items-center gap-1 sm:gap-1.5 text-emerald-400/90">
              <StatusIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5 animate-pulse text-emerald-400" />
              <span className="uppercase text-[8px] sm:text-[9px] font-mono tracking-widest text-slate-400 truncate max-w-[140px] xs:max-w-[180px] sm:max-w-[200px]">
                {statusText}
              </span>
            </div>
            <span className="text-emerald-400 font-mono font-extrabold">{preloaderProgress}%</span>
          </div>
          {/* Progress Bar Container */}
          <div className="w-full h-1.5 sm:h-2 bg-neutral-950/80 rounded-full border border-neutral-900 overflow-hidden p-[1px]">
            <div 
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-300 rounded-full shadow-[0_0_12px_rgba(16,185,129,0.6)] transition-all duration-100 ease-out"
              style={{ width: `${preloaderProgress}%` }}
            />
          </div>
        </div>

        {/* Small HUD style metadata footer */}
        <div className="flex items-center justify-between w-full border-t border-neutral-900/50 pt-3 sm:pt-4 text-[7px] sm:text-[8px] font-mono text-slate-600 uppercase tracking-widest mt-0.5 sm:mt-1">
          <span>SSL SECURE CONNECTION</span>
          <span className="text-emerald-500/50 font-bold">READY v2.4.0</span>
        </div>
      </div>
    </div>
  ) : null;

  // Selected ticket calculation
  const selectedTicket = useMemo(() => {
    return tickets.find(t => t.id === selectedTicketId) || null;
  }, [tickets, selectedTicketId]);

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

  // Helper function to check if a ticket/project is overdue
  const isTicketOverdue = useCallback((t: Ticket) => {
    if (t.status === "Resolvido" || t.status === "Fechado") return false;
    if (t.projectDeadline) {
      const deadlineDate = new Date(t.projectDeadline);
      deadlineDate.setHours(23, 59, 59, 999);
      return deadlineDate.getTime() < Date.now();
    }
    return new Date(t.slaLimit).getTime() < Date.now();
  }, []);

  // Filtered tickets calculation
  const filteredTickets = useMemo(() => {
    return userVisibleTickets.filter(t => {
      // Tab filtering: hide active projects from normal ticket queue and vice versa
      if (activeTab === "painel") {
        // "Fila de Chamados" hides active projects
        if (t.projectDeadline && t.status !== "Resolvido" && t.status !== "Fechado") {
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
        (selectedStatus === "Active" ? (t.status === "Aberto" || t.status === "Em Atendimento") : t.status === selectedStatus);

      return matchesSearch && matchesCategory && matchesPriority && matchesStatus;
    });
  }, [userVisibleTickets, activeTab, searchTerm, selectedCategory, selectedPriority, selectedStatus]);

  // Operational metrics
  const totalTickets = userVisibleTickets.length;
  // Fila Ativa excludes active projects with long dates
  const activeTickets = useMemo(() => {
    return userVisibleTickets.filter(t => t.status !== "Resolvido" && t.status !== "Fechado" && !t.projectDeadline);
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

  const slaCompliance = useMemo(() => {
    return totalTickets > 0 ? Math.round(((totalTickets - overdueTickets.length) / totalTickets) * 100) : 100;
  }, [totalTickets, overdueTickets]);

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

  if (!currentSession) {
    return (
      <>
        <LoginScreen 
          users={users} 
          onLoginSuccess={(session) => {
            setCurrentSession(session);
            localStorage.setItem("gran7_session", JSON.stringify(session));
          }} 
        />
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

  return (
    <div className="min-h-screen bg-black text-slate-100 flex flex-col md:flex-row font-sans relative">
      <PlantationBackground />

      {/* Mobile Top Header */}
      <div className="md:hidden flex items-center justify-between px-4 py-3.5 bg-[#060606] border-b border-emerald-950/20 sticky top-0 z-40 backdrop-blur-md bg-black/85">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-1.5 rounded-xl bg-neutral-900 border border-neutral-800 text-slate-400 hover:text-white transition active:scale-95 cursor-pointer flex items-center justify-center"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5 text-emerald-400" />
          </button>
          
          <button 
            onClick={handleGoToHome}
            className="flex items-center hover:opacity-85 transition active:scale-98 cursor-pointer text-left"
            title="Ir para o início"
          >
            <img 
              src={logoImg} 
              alt="GRAN7 HELP" 
              className="h-8 md:h-9 w-auto object-contain shrink-0"
            />
          </button>
        </div>

        {/* Quick User Avatar Button at Right */}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              if (currentSession?.role === "tecnico") {
                setMyTicketsViewMode("resolved");
              } else {
                setMyTicketsViewMode("created");
              }
              setMyTicketsTab("all");
              setIsMyTicketsModalOpen(true);
            }}
            className="w-8 h-8 rounded-full bg-neutral-950 border border-neutral-850 flex items-center justify-center text-xs font-bold text-emerald-400 shadow-md active:scale-95"
            title={`Ver chamados de ${currentSession.name}`}
          >
            {currentSession.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase()}
          </button>
        </div>
      </div>

      {/* Animated Mobile Slide-out Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Dark Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 md:hidden"
            />

            {/* Slide-out Menu */}
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-4/5 max-w-[320px] bg-[#060606] border-r border-emerald-950/30 z-50 flex flex-col md:hidden overflow-hidden shadow-2xl shadow-black"
            >
              {/* Drawer Brand Header */}
              <div className="p-4 flex items-center justify-between border-b border-emerald-950/20 bg-[#0a0a0a]">
                <button 
                  onClick={handleGoToHome}
                  className="flex items-center hover:opacity-85 transition active:scale-98 cursor-pointer text-left"
                  title="Ir para o início"
                >
                  <img 
                    src={logoImg} 
                    alt="GRAN7 HELP" 
                    className="h-8 w-auto object-contain shrink-0"
                  />
                </button>

                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-slate-400 hover:text-white transition active:scale-95"
                  aria-label="Fechar menu"
                >
                  <X className="h-4 w-4 text-emerald-400" />
                </button>
              </div>

              {/* Drawer Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                
                {/* Access identity card */}
                <div className="p-4 bg-[#0a0a0a] rounded-2xl border border-emerald-950/30 shadow-xl">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Identidade de Acesso</span>
                    <span className={`text-[9px] px-2.5 py-0.5 rounded-full font-bold uppercase ${currentSession.role === "tecnico" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-emerald-600/5 text-emerald-300 border border-emerald-500/10"}`}>
                      {currentSession.role === "tecnico" ? "Técnico" : "Colaborador"}
                    </span>
                  </div>

                  <div 
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setIsMyTicketsModalOpen(true);
                    }}
                    className="flex items-center gap-3 p-2 bg-black rounded-xl border border-neutral-900 hover:border-emerald-400/20 cursor-pointer transition-all duration-200"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#050505] border border-neutral-800 flex items-center justify-center text-xs font-bold text-emerald-400 shrink-0">
                      {currentSession.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase()}
                    </div>
                    <div className="overflow-hidden flex-1">
                      <p className="text-xs font-bold text-white truncate">{currentSession.name}</p>
                      <p className="text-[9px] text-neutral-400 truncate">{currentSession.department}</p>
                    </div>
                    <span className="text-[9px] text-emerald-400 font-semibold pr-1 shrink-0">Ver</span>
                  </div>

                  <div className="mt-3.5 flex flex-col gap-2">
                    <button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        if (currentSession?.role === "tecnico") {
                          setMyTicketsViewMode("resolved");
                        } else {
                          setMyTicketsViewMode("created");
                        }
                        setMyTicketsTab("all");
                        setIsMyTicketsModalOpen(true);
                      }}
                      className="w-full py-2 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border border-emerald-500/20 cursor-pointer"
                    >
                      <Layers className="h-3.5 w-3.5" />
                      Ver Meus Chamados
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        const result = await requestDesktopNotificationPermission();
                        if (result === "granted") {
                          showDesktopNotification(
                            "Notificações Ativadas!",
                            "Agora você receberá notificações na área de trabalho mesmo fora do site!"
                          );
                        }
                      }}
                      className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border cursor-pointer ${
                        desktopNotificationPermission === "granted"
                          ? "bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : desktopNotificationPermission === "denied"
                          ? "bg-rose-500/5 hover:bg-rose-500/10 text-rose-400 border-rose-500/20"
                          : "bg-blue-500/5 hover:bg-blue-500/10 text-blue-400 border-blue-500/20"
                      }`}
                    >
                      {desktopNotificationPermission === "granted" ? (
                        <>
                          <Bell className="h-3.5 w-3.5 text-emerald-400" />
                          Notificações Ativas
                        </>
                      ) : desktopNotificationPermission === "denied" ? (
                        <>
                          <BellOff className="h-3.5 w-3.5 text-rose-400" />
                          Notificações Bloqueadas
                        </>
                      ) : (
                        <>
                          <Bell className="h-3.5 w-3.5 text-blue-400 animate-bounce" />
                          Ativar Notificações PC
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        handleLogout();
                      }}
                      className="w-full py-2 px-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border border-rose-500/20 cursor-pointer"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sair da Conta
                    </button>
                  </div>
                </div>

                {/* Dashboard Metrics */}
                <div className="space-y-3">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">
                    {currentSession.role === "tecnico" ? "Métricas Globais" : "Minhas Métricas"}
                  </span>
                  
                  <div className={`grid ${currentSession.role === "tecnico" ? "grid-cols-3" : "grid-cols-1"} gap-2`}>
                    <button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setActiveTab("painel");
                        setSelectedStatus("Active");
                      }}
                      className={`p-2.5 rounded-xl border text-left transition-all hover:bg-emerald-500/5 ${
                        activeTab === "painel" && selectedStatus === "Active" ? "border-emerald-500/40 bg-emerald-500/10" : "bg-black/50 border-neutral-900"
                      }`}
                    >
                      <p className="text-[9px] font-medium text-slate-500 leading-tight">Fila Ativa</p>
                      <p className="text-lg font-bold text-white mt-1">{activeTickets.length}</p>
                    </button>
                    
                    {currentSession.role === "tecnico" && (
                      <>
                        <button
                          onClick={() => {
                            setMobileMenuOpen(false);
                            setActiveTab("projetos");
                          }}
                          className={`p-2.5 rounded-xl border text-left transition-all hover:bg-emerald-500/5 ${
                            activeTab === "projetos" ? "border-emerald-500/40 bg-emerald-500/10" : "bg-black/50 border-neutral-900"
                          }`}
                        >
                          <p className="text-[9px] font-medium text-slate-500 leading-tight">Projetos</p>
                          <p className="text-lg font-bold text-white mt-1">{activeProjects.length}</p>
                        </button>
                        <button
                          onClick={() => {
                            setMobileMenuOpen(false);
                            setActiveTab("sla");
                          }}
                          className={`p-2.5 rounded-xl border text-left transition-all hover:bg-emerald-500/5 ${
                            activeTab === "sla" ? "border-emerald-500/40 bg-emerald-500/10" : "bg-black/50 border-neutral-900"
                          }`}
                        >
                          <p className="text-[9px] font-medium text-slate-500 leading-tight">SLA Geral</p>
                          <p className="text-lg font-bold text-emerald-400 mt-1">{slaCompliance}%</p>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Ticket Categories Monitoring */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                    {currentSession.role === "tecnico" ? "Monitoramento por Categorias" : "Minhas Categorias"}
                  </span>
                  {Object.entries(catStats).map(([cat, count]) => (
                    <button
                      key={cat}
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setSelectedCategory(selectedCategory === cat ? "All" : cat);
                      }}
                      className={`w-full flex items-center justify-between text-xs px-3 py-2 rounded-xl border transition-all ${selectedCategory === cat ? "bg-emerald-500/10 text-emerald-400 border-emerald-400/30 font-semibold" : "text-slate-400 border-transparent hover:bg-neutral-900/40"}`}
                    >
                      <span className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          cat === 'Acesso' ? 'bg-rose-400' :
                          cat === 'Redes' ? 'bg-emerald-400' :
                          cat === 'Hardware' ? 'bg-amber-400' :
                          cat === 'Software' ? 'bg-emerald-400 shadow-neon-sm' :
                          cat === 'Sistemas' ? 'bg-emerald-500 shadow-neon-sm' : 'bg-neutral-500'
                        }`} />
                        {cat}
                      </span>
                      <span className="bg-[#111] px-1.5 py-0.5 rounded text-[10px] font-bold text-neutral-400 font-mono">{count}</span>
                    </button>
                  ))}
                </div>

              </div>

              {/* Drawer Footer */}
              <div className="p-4 border-t border-neutral-900 bg-[#0a0a0a]">
                <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    GRAN7 HELP <span className="text-neutral-600 font-bold">v2.4.0</span>
                  </span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      
      {/* Sidebar - Bento Style (Desktop only) */}
      <aside className={`hidden md:flex md:flex-col ${sidebarCollapsed ? "md:w-20" : "md:w-80"} bg-[#060606] border-b md:border-b-0 md:border-r border-emerald-950/20 shrink-0 transition-all duration-300 relative`}>
        <div className={`p-4 flex transition-all border-b border-emerald-950/20 ${
          sidebarCollapsed 
            ? "md:flex-col md:p-3 md:py-4 gap-3 items-center justify-center" 
            : "md:p-6 items-center justify-between"
        }`}>
          {!sidebarCollapsed ? (
            <button 
              onClick={handleGoToHome}
              className="block transition-all duration-200 hover:opacity-85 cursor-pointer text-left focus:outline-none"
              title="Ir para o início"
            >
              <img 
                src={logoImg} 
                alt="GRAN7 HELP" 
                className="h-12 w-auto object-contain max-w-full"
              />
            </button>
          ) : (
            <button 
              onClick={handleGoToHome}
              className="hidden md:flex items-center justify-center transition-all duration-200 hover:opacity-85 cursor-pointer focus:outline-none"
              title="Ir para o início"
            >
              <img 
                src={logoMin} 
                alt="GRAN7" 
                className="w-10 h-10 object-contain rounded-lg border border-emerald-400/20 shadow-md shrink-0"
              />
            </button>
          )}

          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-slate-400 hover:text-white transition cursor-pointer flex items-center justify-center"
            title={sidebarCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4 text-emerald-400" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {sidebarCollapsed ? (
          /* Collapsed Mini-Sidebar (Only visible on desktop md:flex, hidden on mobile) */
          <div className="hidden md:flex flex-col items-center flex-1 py-4 justify-between animate-in fade-in duration-300">
            <div className="space-y-6 flex flex-col items-center w-full">
              {/* User Avatar Badge with click to show My Tickets */}
              <button 
                onClick={() => {
                  if (currentSession?.role === "tecnico") {
                    setMyTicketsViewMode("resolved");
                  } else {
                    setMyTicketsViewMode("created");
                  }
                  setMyTicketsTab("all");
                  setIsMyTicketsModalOpen(true);
                }}
                className="w-10 h-10 rounded-full bg-neutral-950 border border-neutral-900 flex items-center justify-center text-xs font-bold text-emerald-400 hover:border-emerald-400/40 hover:bg-emerald-500/10 transition-all cursor-pointer shadow-md group relative"
                title={`Ver chamados de ${currentSession.name}`}
              >
                {currentSession.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase()}
                <span className="absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-black"></span>
              </button>

              {/* Quick Metrics Icons */}
              <div className="flex flex-col gap-3 items-center w-full px-2">
                <button 
                  onClick={() => {
                    setActiveTab("painel");
                    setSelectedStatus("Active");
                  }}
                  className={`p-2 bg-neutral-950/50 hover:bg-emerald-500/5 hover:border-emerald-500/30 rounded-xl border flex items-center justify-center transition-all cursor-pointer relative group ${
                    activeTab === "painel" && selectedStatus === "Active" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" : "border-neutral-900 text-slate-400"
                  }`}
                  title={`Fila Ativa: ${activeTickets.length} (Clique para filtrar)`}
                >
                  <Layers className="h-4 w-4" />
                  <span className="absolute -top-1.5 -right-1.5 bg-emerald-500 text-black text-[8px] font-black h-4 w-4 rounded-full flex items-center justify-center scale-90 border border-black">{activeTickets.length}</span>
                </button>

                {currentSession?.role === "tecnico" && (
                  <>
                    <button 
                      onClick={() => {
                        setActiveTab("projetos");
                      }}
                      className={`p-2 bg-neutral-950/50 hover:bg-emerald-500/5 hover:border-emerald-500/30 rounded-xl border flex items-center justify-center transition-all cursor-pointer relative group ${
                        activeTab === "projetos" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" : "border-neutral-900 text-slate-400"
                      }`}
                      title={`Projetos em Andamento: ${activeProjects.length} (Clique para filtrar)`}
                    >
                      <Briefcase className="h-4 w-4" />
                      <span className="absolute -top-1.5 -right-1.5 bg-emerald-500 text-black text-[8px] font-black h-4 w-4 rounded-full flex items-center justify-center scale-90 border border-black">{activeProjects.length}</span>
                    </button>

                    <button 
                      onClick={() => setActiveTab("sla")}
                      className={`p-2 bg-neutral-950/50 hover:bg-emerald-500/5 hover:border-emerald-500/30 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
                        activeTab === "sla" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" : "border-neutral-900 text-slate-400"
                      }`}
                      title={`SLA Geral: ${slaCompliance}% (Clique para gerenciar)`}
                    >
                      <Clock className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>

              {/* Category mini dots */}
              <div className="flex flex-col gap-2.5 pt-4 border-t border-neutral-900/60 w-full items-center">
                {Object.entries(catStats).map(([cat, count]) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(selectedCategory === cat ? "All" : cat)}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                      selectedCategory === cat 
                        ? "bg-emerald-500/10 border border-emerald-400/45 text-emerald-400" 
                        : "bg-transparent border border-transparent hover:bg-neutral-900/40 text-slate-500 hover:text-white"
                    }`}
                    title={`${cat}: ${count} chamados`}
                  >
                    <span className={`w-2 h-2 rounded-full ${
                      cat === 'Acesso' ? 'bg-rose-400' :
                      cat === 'Redes' ? 'bg-emerald-400' :
                      cat === 'Hardware' ? 'bg-amber-400' :
                      cat === 'Software' ? 'bg-emerald-400 shadow-neon-sm' :
                      cat === 'Sistemas' ? 'bg-emerald-500 shadow-neon-sm' : 'bg-neutral-500'
                    }`} />
                  </button>
                ))}
              </div>
            </div>

            {/* Logout button at the bottom */}
            <button
              onClick={handleLogout}
              className="p-2 bg-rose-500/5 hover:bg-rose-500/15 border border-rose-500/10 hover:border-rose-500/25 text-rose-400 rounded-xl transition cursor-pointer"
              title="Sair da Conta"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          /* Normal Expanded Sidebar (Visible on desktop & mobile when open) */
          <div className="flex flex-col flex-1 overflow-y-auto animate-in fade-in duration-200">
            {/* Current user session switcher badge */}
            <div className="p-4 mx-4 my-4 bg-[#0a0a0a] rounded-2xl border border-emerald-950/35 shadow-xl shadow-black/40">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Identidade de Acesso</span>
                <span className={`text-[9px] px-2.5 py-0.5 rounded-full font-bold uppercase ${currentSession.role === "tecnico" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-emerald-600/5 text-emerald-300 border border-emerald-500/10"}`}>
                  {currentSession.role === "tecnico" ? "Técnico" : "Colaborador"}
                </span>
              </div>

              <div 
                onClick={() => setIsMyTicketsModalOpen(true)}
                className="flex items-center gap-3 p-2 rounded-xl bg-black hover:bg-[#050505] border border-neutral-900 hover:border-emerald-400/30 cursor-pointer transition-all duration-200 group relative"
                title="Clique para ver seus chamados"
              >
                <div className="w-9 h-9 rounded-full bg-[#050505] border border-neutral-800 flex items-center justify-center text-sm font-bold text-emerald-400 group-hover:bg-emerald-400/10 group-hover:border-emerald-400/30 transition-all">
                  {currentSession.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase()}
                </div>
                <div className="overflow-hidden flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors truncate">{currentSession.name}</p>
                    <Layers className="h-3 w-3 text-neutral-500 group-hover:text-emerald-400 transition-colors flex-shrink-0" />
                  </div>
                  <p className="text-[10px] text-neutral-400 group-hover:text-neutral-300 transition-colors truncate">{currentSession.department}</p>
                </div>
                <span className="text-[9px] text-neutral-500 group-hover:text-emerald-400 font-medium transition-colors pr-1">Ver</span>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                <button
                  onClick={() => {
                    if (currentSession?.role === "tecnico") {
                      setMyTicketsViewMode("resolved");
                    } else {
                      setMyTicketsViewMode("created");
                    }
                    setMyTicketsTab("all");
                    setIsMyTicketsModalOpen(true);
                  }}
                  className="w-full py-1.5 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border border-emerald-500/20 cursor-pointer shadow-sm"
                >
                  <Layers className="h-3.5 w-3.5" />
                  Ver Meus Chamados
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    const result = await requestDesktopNotificationPermission();
                    if (result === "granted") {
                      showDesktopNotification(
                        "Notificações Ativadas!",
                        "Agora você receberá notificações na área de trabalho mesmo fora do site!"
                      );
                    }
                  }}
                  className={`w-full py-1.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border cursor-pointer ${
                    desktopNotificationPermission === "granted"
                      ? "bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : desktopNotificationPermission === "denied"
                      ? "bg-rose-500/5 hover:bg-rose-500/10 text-rose-400 border-rose-500/20"
                      : "bg-blue-500/5 hover:bg-blue-500/10 text-blue-400 border-blue-500/20"
                  }`}
                >
                  {desktopNotificationPermission === "granted" ? (
                    <>
                      <Bell className="h-3.5 w-3.5 text-emerald-400" />
                      Notificações Ativas
                    </>
                  ) : desktopNotificationPermission === "denied" ? (
                    <>
                      <BellOff className="h-3.5 w-3.5 text-rose-400" />
                      Notificações Bloqueadas
                    </>
                  ) : (
                    <>
                      <Bell className="h-3.5 w-3.5 text-blue-400 animate-bounce" />
                      Ativar Notificações PC
                    </>
                  )}
                </button>

                <button
                  onClick={handleLogout}
                  className="w-full py-1.5 px-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border border-rose-500/20 cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sair da Conta
                </button>
              </div>
            </div>

            {/* Quick Help Desk Statistics / Bento Mini Blocks */}
            <div className="px-6 py-2 flex-1 space-y-4">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                {currentSession.role === "tecnico" ? "Métricas Globais" : "Minhas Métricas"}
              </span>
              
              <div className={`grid ${currentSession.role === "tecnico" ? "grid-cols-3" : "grid-cols-1"} gap-2`}>
                <button
                  onClick={() => {
                    setActiveTab("painel");
                    setSelectedStatus("Active");
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all hover:bg-emerald-500/5 hover:border-emerald-500/30 cursor-pointer ${
                    activeTab === "painel" && selectedStatus === "Active" ? "border-emerald-500/40 bg-emerald-500/10" : "bg-black/50 border-neutral-900"
                  }`}
                  title="Filtrar por fila ativa"
                >
                  <p className="text-[9px] font-medium text-slate-500 leading-tight">
                    {currentSession.role === "tecnico" ? "Fila Ativa" : "Meus Ativos"}
                  </p>
                  <p className="text-lg font-bold text-white mt-1">{activeTickets.length}</p>
                </button>
                
                {currentSession.role === "tecnico" && (
                  <>
                    <button
                      onClick={() => {
                        setActiveTab("projetos");
                      }}
                      className={`p-2.5 rounded-xl border text-left transition-all hover:bg-emerald-500/5 hover:border-emerald-500/30 cursor-pointer ${
                        activeTab === "projetos" ? "border-emerald-500/40 bg-emerald-500/10" : "bg-black/50 border-neutral-900"
                      }`}
                      title="Filtrar por projetos em andamento"
                    >
                      <p className="text-[9px] font-medium text-slate-500 leading-tight">
                        Projetos
                      </p>
                      <p className="text-lg font-bold text-white mt-1">{activeProjects.length}</p>
                    </button>
                    <button
                      onClick={() => setActiveTab("sla")}
                      className={`p-2.5 rounded-xl border text-left transition-all hover:bg-emerald-500/5 hover:border-emerald-500/30 cursor-pointer ${
                        activeTab === "sla" ? "border-emerald-500/40 bg-emerald-500/10" : "bg-black/50 border-neutral-900"
                      }`}
                      title="Ver painel de SLA"
                    >
                      <p className="text-[9px] font-medium text-slate-500 leading-tight">
                        SLA Geral
                      </p>
                      <p className={`text-lg font-bold mt-1 ${activeTab === "sla" ? "text-emerald-400" : "text-emerald-500"}`}>{slaCompliance}%</p>
                    </button>
                  </>
                )}
              </div>

              {/* Quick Filter Counters list */}
              <div className="space-y-1.5 pt-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">
                  {currentSession.role === "tecnico" ? "Monitoramento por Categorias" : "Minhas Categorias"}
                </span>
                {Object.entries(catStats).map(([cat, count]) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(selectedCategory === cat ? "All" : cat)}
                    className={`w-full flex items-center justify-between text-xs px-3 py-1.5 rounded-lg transition-all ${selectedCategory === cat ? "bg-emerald-500/10 text-emerald-400 border border-emerald-400/30 shadow-neon-sm font-semibold" : "text-slate-400 hover:bg-[#111]/40 hover:text-white"}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        cat === 'Acesso' ? 'bg-rose-400' :
                        cat === 'Redes' ? 'bg-emerald-400' :
                        cat === 'Hardware' ? 'bg-amber-400' :
                        cat === 'Software' ? 'bg-emerald-400 shadow-neon-sm' :
                        cat === 'Sistemas' ? 'bg-emerald-500 shadow-neon-sm' : 'bg-neutral-500'
                      }`} />
                      {cat}
                    </span>
                    <span className="bg-[#111] px-1.5 py-0.5 rounded text-[10px] font-bold text-neutral-400 font-mono">{count}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Footer info & resetting data */}
            <div className="p-4 border-t border-neutral-900 mt-auto">
              <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  GRAN7 HELP Online <span className="text-neutral-600 font-bold ml-0.5">v2.4.0</span>
                </span>
                {currentSession?.role === "tecnico" && (
                  <span 
                    onClick={() => setActiveTab("banco_dados")}
                    className={`flex items-center gap-1.5 cursor-pointer transition ${dbStatus?.connected ? "text-emerald-400 hover:text-emerald-300 font-bold" : "text-amber-500 hover:text-amber-400"}`}
                    title={dbStatus?.connected ? "Conectado ao Supabase (Clique para gerenciar)" : "Modo Cache Local Ativo (Clique para gerenciar)"}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${dbStatus?.connected ? "bg-emerald-400 animate-pulse" : "bg-amber-500"}`} />
                    {dbStatus?.connected ? "DB: Nuvem" : "DB: Local"}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Pane */}
      <main className="flex-1 p-4 md:p-6 flex flex-col gap-6 overflow-x-hidden">
        
        {/* Top Header Controls */}
        <header className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-display font-extrabold text-white tracking-tight">
              {currentSession.role === "tecnico" ? "Central de Atendimento em Tempo Real" : "Meu Portal de Suporte"}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
              <span>{currentSession.role === "tecnico" ? "GRAN7 HELP Monitoramento" : `Bem-vindo, ${currentSession.name}`}</span>
              <span>•</span>
              <div className="flex items-center gap-1 text-slate-300">
                <RefreshCw className={`h-3 w-3 ${isPolling ? "animate-spin text-emerald-400" : ""}`} />
                <span>Atualizado: {lastUpdated ? lastUpdated.toLocaleTimeString("pt-BR") : "--:--:--"}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-stretch md:items-end gap-2.5 shrink-0">
            {/* First Row: Modules Navigation (Upper right corner) */}
            {currentSession.role === "tecnico" && (
              <>
                {/* Desktop view: collapsible horizontal navigation */}
                <div className="hidden md:flex items-center gap-2 justify-end w-full md:w-auto">
                  <button
                    onClick={() => setModulesCollapsed(!modulesCollapsed)}
                    className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-slate-400 hover:text-white transition cursor-pointer flex items-center justify-center h-9 shrink-0"
                    title={modulesCollapsed ? "Expandir módulos de atendimento" : "Recolher módulos de atendimento"}
                  >
                    {modulesCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <ChevronLeft className="h-4 w-4" />
                    )}
                  </button>

                  <div 
                    className={`flex items-center transition-all duration-300 ease-in-out bg-black rounded-xl shadow-sm ${
                      modulesCollapsed 
                        ? "max-w-0 opacity-0 border-transparent p-0 gap-0 pointer-events-none overflow-hidden" 
                        : "max-w-full md:max-w-[1000px] opacity-100 border border-neutral-900 p-1 gap-1.5 overflow-x-auto scrollbar-none"
                    }`}
                  >
                    <button
                      onClick={() => setActiveTab("painel")}
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 ${activeTab === "painel" ? "bg-emerald-400 text-black font-extrabold shadow-neon" : "text-slate-400 hover:text-white"}`}
                    >
                      Fila de Chamados
                    </button>
                    <button
                      onClick={() => setActiveTab("projetos")}
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 ${activeTab === "projetos" ? "bg-emerald-400 text-black font-extrabold shadow-neon" : "text-slate-400 hover:text-white"}`}
                    >
                      Projetos em Andamento
                    </button>
                    <button
                      onClick={() => setActiveTab("sla")}
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 ${activeTab === "sla" ? "bg-emerald-400 text-black font-extrabold shadow-neon" : "text-slate-400 hover:text-white"}`}
                    >
                      Análise de SLA
                    </button>
                    <button
                      onClick={() => setActiveTab("colaboradores")}
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 ${activeTab === "colaboradores" ? "bg-emerald-400 text-black font-extrabold shadow-neon" : "text-slate-400 hover:text-white"}`}
                    >
                      Gestão de Colaboradores
                    </button>
                    {currentSession?.role === "tecnico" && (
                      <button
                        onClick={() => {
                          setActiveTab("banco_dados");
                          fetchDbStatus();
                        }}
                        className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 ${activeTab === "banco_dados" ? "bg-emerald-400 text-black font-extrabold shadow-neon" : "text-slate-400 hover:text-white"}`}
                      >
                        Banco de Dados
                      </button>
                    )}
                  </div>
                </div>

                {/* Mobile view: beautiful custom selector dropdown */}
                <div className="relative md:hidden w-full">
                  <button
                    onClick={() => setIsMobileModulesOpen(!isMobileModulesOpen)}
                    className="w-full h-10 flex items-center justify-between px-4 bg-black border border-neutral-850 hover:border-emerald-500/40 rounded-xl text-xs font-semibold text-white transition-all cursor-pointer shadow-md focus:outline-none"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)] animate-pulse" />
                      <span className="text-slate-500 uppercase tracking-wider text-[9px] font-bold">Módulo:</span>
                      <span className="text-emerald-400 font-black tracking-tight">
                        {activeTab === "painel" && "Fila de Chamados"}
                        {activeTab === "projetos" && "Projetos em Andamento"}
                        {activeTab === "sla" && "Análise de SLA"}
                        {activeTab === "colaboradores" && "Gestão de Colaboradores"}
                        {activeTab === "banco_dados" && "Banco de Dados"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-emerald-400">
                      <span className="text-[9px] uppercase tracking-wider font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 font-bold">Menu</span>
                      <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${isMobileModulesOpen ? "rotate-90" : ""}`} />
                    </div>
                  </button>
                  
                  {isMobileModulesOpen && (
                    <>
                      {/* Fullscreen Backdrop Overlay */}
                      <div 
                        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-all duration-200"
                        onClick={() => setIsMobileModulesOpen(false)}
                      />
                      {/* Floating custom dropdown options list */}
                      <div className="absolute left-0 right-0 mt-1.5 z-50 bg-[#050505] border border-neutral-900 rounded-xl p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.8)] flex flex-col gap-1 select-none">
                        <div className="px-3 py-2 text-[9px] uppercase tracking-widest text-slate-500 font-black border-b border-neutral-900/50 mb-1 flex items-center justify-between">
                          <span>Navegar para Módulo</span>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                        </div>
                        
                        <button
                          onClick={() => {
                            setActiveTab("painel");
                            setIsMobileModulesOpen(false);
                          }}
                          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeTab === "painel" ? "bg-emerald-400/10 text-emerald-400 border border-emerald-500/20" : "text-slate-400 hover:text-white hover:bg-neutral-900 border border-transparent"}`}
                        >
                          <Layers className="h-4 w-4 text-emerald-400 shrink-0" />
                          <span className="flex-1 text-left">Fila de Chamados</span>
                          {activeTab === "painel" && <Check className="h-3.5 w-3.5 text-emerald-400 font-black" />}
                        </button>
                        
                        <button
                          onClick={() => {
                            setActiveTab("projetos");
                            setIsMobileModulesOpen(false);
                          }}
                          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeTab === "projetos" ? "bg-emerald-400/10 text-emerald-400 border border-emerald-500/20" : "text-slate-400 hover:text-white hover:bg-neutral-900 border border-transparent"}`}
                        >
                          <FolderKanban className="h-4 w-4 text-emerald-400 shrink-0" />
                          <span className="flex-1 text-left">Projetos em Andamento</span>
                          {activeTab === "projetos" && <Check className="h-3.5 w-3.5 text-emerald-400 font-black" />}
                        </button>
                        
                        <button
                          onClick={() => {
                            setActiveTab("sla");
                            setIsMobileModulesOpen(false);
                          }}
                          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeTab === "sla" ? "bg-emerald-400/10 text-emerald-400 border border-emerald-500/20" : "text-slate-400 hover:text-white hover:bg-neutral-900 border border-transparent"}`}
                        >
                          <Sliders className="h-4 w-4 text-emerald-400 shrink-0" />
                          <span className="flex-1 text-left">Análise de SLA</span>
                          {activeTab === "sla" && <Check className="h-3.5 w-3.5 text-emerald-400 font-black" />}
                        </button>
                        
                        <button
                          onClick={() => {
                            setActiveTab("colaboradores");
                            setIsMobileModulesOpen(false);
                          }}
                          className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeTab === "colaboradores" ? "bg-emerald-400/10 text-emerald-400 border border-emerald-500/20" : "text-slate-400 hover:text-white hover:bg-neutral-900 border border-transparent"}`}
                        >
                          <Users className="h-4 w-4 text-emerald-400 shrink-0" />
                          <span className="flex-1 text-left">Gestão de Colaboradores</span>
                          {activeTab === "colaboradores" && <Check className="h-3.5 w-3.5 text-emerald-400 font-black" />}
                        </button>
                        
                        {currentSession?.role === "tecnico" && (
                          <button
                            onClick={() => {
                              setActiveTab("banco_dados");
                              fetchDbStatus();
                              setIsMobileModulesOpen(false);
                            }}
                            className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeTab === "banco_dados" ? "bg-emerald-400/10 text-emerald-400 border border-emerald-500/20" : "text-slate-400 hover:text-white hover:bg-neutral-900 border border-transparent"}`}
                          >
                            <Database className="h-4 w-4 text-emerald-400 shrink-0" />
                            <span className="flex-1 text-left">Banco de Dados</span>
                            {activeTab === "banco_dados" && <Check className="h-3.5 w-3.5 text-emerald-400 font-black" />}
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            {/* Second Row: Page Actions (Aligned nicely underneath) */}
            <div className="flex items-center gap-2.5 justify-end w-full">
              {(activeTab === "painel" || activeTab === "projetos") && (
                <button
                  onClick={() => setRightSidebarCollapsed(!rightSidebarCollapsed)}
                  className="px-4 py-2 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-slate-400 hover:text-white rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-xs cursor-pointer h-9 shrink-0 font-medium"
                  title={rightSidebarCollapsed ? "Mostrar painel lateral direito" : "Esconder painel lateral direito"}
                >
                  <Columns className={`h-4 w-4 ${rightSidebarCollapsed ? "text-emerald-400" : ""}`} />
                  <span>{rightSidebarCollapsed ? "Mostrar Painel" : "Recolher Painel"}</span>
                </button>
              )}

              <button
                onClick={() => setIsNewTicketModalOpen(true)}
                className="px-4 py-2 bg-emerald-400 hover:bg-emerald-300 text-black font-extrabold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-xs shadow-neon hover:shadow-neon-lg cursor-pointer h-9 shrink-0"
              >
                <PlusCircle className="h-4 w-4" />
                <span>Abrir Novo Chamado</span>
              </button>
            </div>
          </div>
        </header>

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
                onViewUserProfile={(user) => {
                  setSelectedTechProfile(user);
                  setIsTechProfileModalOpen(true);
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
              className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start"
            >
            
            {/* Top Stat row taking full width */}
            <div className="xl:col-span-12 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-[#0a0a0a] border border-emerald-500/10 rounded-2xl p-4 flex flex-col justify-between min-h-[110px]">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total de Contas Sincronizadas</p>
                <div className="flex items-end justify-between mt-2">
                  <span className="text-3xl font-black text-white">{(users.length > 0 ? users : USER_PROFILES).length}</span>
                  <span className="text-emerald-400 text-[9px] font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    Live Database
                  </span>
                </div>
              </div>
              <div className="bg-[#0a0a0a] border border-emerald-500/10 rounded-2xl p-4 flex flex-col justify-between min-h-[110px]">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Equipe de TI</p>
                <span className="text-3xl font-black text-emerald-400 mt-2">
                  {(users.length > 0 ? users : USER_PROFILES).filter(u => u.role === "tecnico").length}
                </span>
              </div>
              <div className="bg-[#0a0a0a] border border-emerald-500/10 rounded-2xl p-4 flex flex-col justify-between min-h-[110px]">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Colaboradores</p>
                <span className="text-3xl font-black text-emerald-500 mt-2">
                  {(users.length > 0 ? users : USER_PROFILES).filter(u => u.role === "colaborador").length}
                </span>
              </div>
            </div>

            {/* Left Panel: List (Full Width) */}
            <div className="xl:col-span-12 space-y-6">
              {/* Collaborators List Card */}
              <div className="bg-[#0a0a0a] border border-neutral-900 rounded-2xl overflow-hidden shadow-lg">
                {(() => {
                  const allColabs = users.length > 0 ? users : USER_PROFILES;
                  const colabDepartments = Array.from(new Set(
                    allColabs.map(u => u.department).filter(Boolean)
                  )).sort();

                  // Pre-calculate ticket counts to avoid filtering full tickets array inside .sort comparator (O(N log N) -> O(N))
                  const ticketsCreatedMap = new Map();
                  const ticketsSolvedMap = new Map();
                  
                  tickets.forEach(t => {
                    if (t.requesterName) {
                      ticketsCreatedMap.set(t.requesterName, (ticketsCreatedMap.get(t.requesterName) || 0) + 1);
                    }
                    if (t.assignedTo && (t.status === "Resolvido" || t.status === "Fechado")) {
                      const techs = getAssignedTechs(t.assignedTo);
                      techs.forEach(tech => {
                        ticketsSolvedMap.set(tech, (ticketsSolvedMap.get(tech) || 0) + 1);
                      });
                    }
                  });

                  const filteredAndSortedUsers = allColabs
                    .filter(u => {
                      // 1. Search filter
                      const term = colabSearchTerm.toLowerCase();
                      const matchesSearch = 
                        u.name.toLowerCase().includes(term) || 
                        (u.email && u.email.toLowerCase().includes(term)) || 
                        (u.department && u.department.toLowerCase().includes(term));
                      if (!matchesSearch) return false;

                      // 2. Sector filter
                      if (colabSectorFilter !== "All" && u.department !== colabSectorFilter) {
                        return false;
                      }

                      // 3. Role filter
                      if (colabRoleFilter !== "All") {
                        const isTech = u.role === "tecnico";
                        if (colabRoleFilter === "tecnico" && !isTech) return false;
                        if (colabRoleFilter === "colaborador" && isTech) return false;
                      }

                      // 4. Online status filter
                      const isOnline = !!(u.isOnline || (currentSession && (
                        (u.email && currentSession.email && u.email.toLowerCase() === currentSession.email.toLowerCase()) ||
                        (u.name && currentSession.name && u.name.toLowerCase() === currentSession.name.toLowerCase())
                      )));
                      if (colabStatusFilter !== "All") {
                        if (colabStatusFilter === "online" && !isOnline) return false;
                        if (colabStatusFilter === "offline" && isOnline) return false;
                      }

                      return true;
                    })
                    .sort((a, b) => {
                      const aTicketsCreated = ticketsCreatedMap.get(a.name) || 0;
                      const bTicketsCreated = ticketsCreatedMap.get(b.name) || 0;
                      const aTicketsSolved = ticketsSolvedMap.get(a.name) || 0;
                      const bTicketsSolved = ticketsSolvedMap.get(b.name) || 0;

                      if (colabSortBy === "tickets_created") {
                        return bTicketsCreated - aTicketsCreated; // Descending
                      } else if (colabSortBy === "tickets_resolved") {
                        return bTicketsSolved - aTicketsSolved; // Descending
                      } else {
                        // Default sort: online first, then alphabetical
                        const aOnline = !!(a.isOnline || (currentSession && (
                          (a.email && currentSession.email && a.email.toLowerCase() === currentSession.email.toLowerCase()) ||
                          (a.name && currentSession.name && a.name.toLowerCase() === currentSession.name.toLowerCase())
                        )));
                        const bOnline = !!(b.isOnline || (currentSession && (
                          (b.email && currentSession.email && b.email.toLowerCase() === currentSession.email.toLowerCase()) ||
                          (b.name && currentSession.name && b.name.toLowerCase() === currentSession.name.toLowerCase())
                        )));
                        if (aOnline && !bOnline) return -1;
                        if (!aOnline && bOnline) return 1;
                        return a.name.localeCompare(b.name);
                      }
                    });

                  return (
                    <>
                      {/* Search & Advanced Filters Bar */}
                      <div className="p-5 border-b border-neutral-900 bg-black/50 space-y-4">
                        {/* Top Row: Title & Search */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div>
                            <h3 className="font-display font-extrabold text-white text-sm flex items-center gap-2">
                              <Users className="h-4 w-4 text-emerald-400" />
                              Diretório de Colaboradores
                            </h3>
                            <p className="text-[10px] text-slate-400">Visualização em tempo real das contas ativas e métricas de chamados</p>
                          </div>
                          <div className="relative w-full md:w-80">
                            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                            <input
                              type="text"
                              placeholder="Buscar por nome, email ou setor..."
                              value={colabSearchTerm}
                              onChange={(e) => setColabSearchTerm(e.target.value)}
                              className="w-full bg-black border border-neutral-900 rounded-xl py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                            />
                          </div>
                        </div>

                        {/* Bottom Row: Quick filters dropdowns */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-3 border-t border-neutral-900/40">
                          {/* Sector Filter */}
                          <div className="flex flex-col gap-1">
                            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Setor / Departamento</label>
                            <select
                              value={colabSectorFilter}
                              onChange={(e) => setColabSectorFilter(e.target.value)}
                              className="bg-black border border-neutral-900 rounded-lg p-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
                            >
                              <option value="All">Todos os Setores</option>
                              {colabDepartments.map(dept => (
                                <option key={dept} value={dept}>{dept}</option>
                              ))}
                            </select>
                          </div>

                          {/* Role Filter */}
                          <div className="flex flex-col gap-1">
                            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Nível de Acesso</label>
                            <select
                              value={colabRoleFilter}
                              onChange={(e) => setColabRoleFilter(e.target.value)}
                              className="bg-black border border-neutral-900 rounded-lg p-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
                            >
                              <option value="All">Todos os Acessos</option>
                              <option value="tecnico">Técnicos (TI)</option>
                              <option value="colaborador">Colaboradores</option>
                            </select>
                          </div>

                          {/* Connection Status Filter */}
                          <div className="flex flex-col gap-1">
                            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Status</label>
                            <select
                              value={colabStatusFilter}
                              onChange={(e) => setColabStatusFilter(e.target.value)}
                              className="bg-black border border-neutral-900 rounded-lg p-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
                            >
                              <option value="All">Todos os Status</option>
                              <option value="online">Online</option>
                              <option value="offline">Offline</option>
                            </select>
                          </div>

                          {/* Sorting */}
                          <div className="flex flex-col gap-1">
                            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Ordenar por</label>
                            <select
                              value={colabSortBy}
                              onChange={(e) => setColabSortBy(e.target.value)}
                              className="bg-black border border-neutral-900 rounded-lg p-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
                            >
                              <option value="name">Nome (A-Z)</option>
                              <option value="tickets_created">Mais Chamados Criados</option>
                              <option value="tickets_resolved">Mais Chamados Resolvidos (TI)</option>
                            </select>
                          </div>

                          {/* Reset Filters */}
                          <div className="flex items-end">
                            <button
                              onClick={() => {
                                setColabSearchTerm("");
                                setColabSectorFilter("All");
                                setColabRoleFilter("All");
                                setColabStatusFilter("All");
                                setColabSortBy("name");
                              }}
                              disabled={
                                colabSearchTerm === "" &&
                                colabSectorFilter === "All" &&
                                colabRoleFilter === "All" &&
                                colabStatusFilter === "All" &&
                                colabSortBy === "name"
                              }
                              className="w-full h-[32px] bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-30 disabled:hover:bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:border-emerald-400/40 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                            >
                              <Filter className="h-3.5 w-3.5" />
                              Limpar Filtros
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="divide-y divide-neutral-900 max-h-[500px] xl:max-h-[calc(100vh-270px)] overflow-y-auto">
                        {filteredAndSortedUsers.length === 0 ? (
                          <div className="p-8 text-center text-slate-500 text-xs">
                            Nenhum colaborador ou técnico atende aos filtros aplicados.
                          </div>
                        ) : (
                          filteredAndSortedUsers.map((user, index) => {
                            const isTech = user.role === "tecnico";
                            const isOnline = !!(user.isOnline || (currentSession && (
                              (user.email && currentSession.email && user.email.toLowerCase() === currentSession.email.toLowerCase()) ||
                              (user.name && currentSession.name && user.name.toLowerCase() === currentSession.name.toLowerCase())
                            )));

                            // Calculate ticket stats
                            const uCreatedCount = tickets.filter(t => t.requesterName === user.name).length;
                            const uActiveCount = tickets.filter(t => t.requesterName === user.name && t.status !== "Resolvido" && t.status !== "Fechado").length;
                            const uResolvedCount = tickets.filter(t => getAssignedTechs(t.assignedTo).includes(user.name) && (t.status === "Resolvido" || t.status === "Fechado")).length;

                            return (
                              <div
                                key={user.id || index}
                                onClick={() => {
                                  setSelectedTechProfile(user);
                                  setIsTechProfileModalOpen(true);
                                }}
                                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#080808]/50 transition cursor-pointer group/tech"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="relative shrink-0">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover/tech:border-emerald-400/40 transition`}>
                                      {user.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase()}
                                    </div>
                                    {isOnline ? (
                                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-black animate-pulse" title="Ativo / Online"></span>
                                    ) : (
                                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-neutral-700 rounded-full border-2 border-black" title="Inativo"></span>
                                    )}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-bold text-white group-hover/tech:text-emerald-400 transition-colors">{user.name}</span>
                                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold bg-emerald-950/40 text-emerald-300 border border-emerald-500/20`}>
                                        {isTech ? "TI" : "User"}
                                      </span>
                                      {isOnline && (
                                        <span className="text-[8.5px] font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 border border-emerald-500/25 px-1 py-0.2 rounded">
                                          Online
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-x-3 gap-y-1.5 mt-1">
                                      <p className="text-[10px] text-slate-400">{user.email}</p>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-4 text-right justify-between sm:justify-end w-full sm:w-auto">
                                  <div className="text-left sm:text-right">
                                    <span className="text-[10px] text-slate-500 block">Departamento</span>
                                    <span className="text-[11px] font-semibold text-slate-300">{user.department}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="bg-black border border-emerald-950/20 px-2.5 py-1 rounded-lg text-[11px] font-mono flex items-center gap-1.5 text-emerald-300">
                                      <span className="text-slate-500">Acesso:</span>
                                      <span className="text-white font-bold">{isTech ? "Técnico de TI" : "Colaborador"}</span>
                                    </div>
                                    <span className="text-[9px] font-bold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded-lg transition-all group-hover/tech:shadow-neon-sm">
                                      Ver Perfil
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
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
            <div className="bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-6 shadow-lg relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2 max-w-2xl">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
                    <Database className="h-5 w-5" />
                  </span>
                  <h3 className="text-base font-bold text-white uppercase tracking-wider">Central de Sincronização do Banco de Dados</h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Gerencie o fluxo de dados em nuvem via <strong className="text-white">Supabase</strong> com fallback automático para <strong className="text-white">Armazenamento Local Autônomo</strong>. Nosso sistema de redundância garante que o suporte nunca pare, mesmo que a nuvem esteja indisponível.
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
                  className="px-4 py-2 bg-[#151515] hover:bg-[#202020] text-slate-300 hover:text-white font-bold rounded-xl text-xs border border-neutral-900 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${dbChecking ? "animate-spin" : ""}`} />
                  Recarregar Tudo
                </button>
              </div>
            </div>

            {/* Bento Grid Analytics Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Card 1: Connection Status */}
              <div className="bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-5 flex flex-col justify-between min-h-[160px] shadow-lg">
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Status da Conexão</p>
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
                         <p className="text-[11px] text-slate-300 mt-2.5 leading-relaxed">
                          Conectado com sucesso ao banco de dados Supabase. Leituras e escritas estão ativas e sendo persistidas em nuvem em tempo real.
                         </p>
                       </div>
                     ) : (
                       <div>
                         <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded uppercase tracking-wider">
                           Modo Redundante / Local
                         </span>
                         <p className="text-[11px] text-slate-400 mt-2.5 leading-relaxed">
                           {dbStatus?.configured 
                            ? "Não foi possível conectar ao Supabase. Operando em modo de redundância local segura." 
                            : "Credenciais do Supabase ausentes no painel Secrets do AI Studio. Usando banco local."}
                         </p>
                       </div>
                     )}
                  </div>
                </div>

                <div className="pt-4 border-t border-neutral-900/50 mt-4 flex items-center justify-between">
                  <span className="text-[9px] font-mono text-slate-500">
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
              <div className="bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-5 flex flex-col justify-between min-h-[160px] shadow-lg">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Inventário de Registros Locais</p>
                  
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="bg-black/40 border border-neutral-900 p-3 rounded-xl">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">Chamados</span>
                      <span className="text-xl font-black text-white font-mono mt-0.5 block">{tickets.length}</span>
                    </div>
                    <div className="bg-black/40 border border-neutral-900 p-3 rounded-xl">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">Colaboradores</span>
                      <span className="text-xl font-black text-white font-mono mt-0.5 block">{users.length}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-neutral-900/50 mt-4 text-[10px] text-slate-400 leading-tight">
                  Os arquivos <code className="text-emerald-400 font-mono">tickets-db.json</code> e <code className="text-emerald-400 font-mono">users-db.json</code> mantêm seus dados seguros no servidor.
                </div>
              </div>

              {/* Card 3: Redundancy Details */}
              <div className="bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-5 flex flex-col justify-between min-h-[160px] shadow-lg">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Garantia de Redundância</p>
                  
                  <p className="text-[11px] text-slate-300 mt-3 leading-relaxed">
                    A arquitetura foi projetada para realizar <strong className="text-white">auto-cura</strong>: se o banco de dados falhar no login ou abertura de chamados, os dados são salvos localmente e podem ser sincronizados posteriormente.
                  </p>
                </div>

                <div className="bg-emerald-950/20 border border-emerald-500/10 p-2 rounded-lg text-[9px] text-emerald-400 flex items-start gap-1.5 mt-3 leading-snug">
                  <Shield className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>Segurança operacional máxima ativada. Suas operações são resilientes a falhas de API de terceiros.</span>
                </div>
              </div>

            </div>

            {/* Sync Control Center */}
            <div className="bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-6 shadow-lg space-y-6">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">Painel de Sincronização Bidirecional</h4>
                <p className="text-[11px] text-slate-400">Escolha o fluxo de sincronização para reconciliar dados entre a nuvem e o cache do servidor local.</p>
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
                <div className="bg-black/50 border border-neutral-900 rounded-2xl p-5 hover:border-emerald-500/20 transition duration-350 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <Upload className="h-5 w-5" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-white uppercase tracking-wider">Exportar Local → Supabase (Push)</h5>
                      <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                        Envia todos os chamados e colaboradores salvos localmente para o banco de dados do Supabase. Use após configurar um novo banco ou resolver quedas de conexão.
                      </p>
                    </div>
                  </div>

                  <div className="pt-6">
                    <button
                      onClick={handlePushSync}
                      disabled={syncingDb === "push" || syncingDb === "pull" || !dbStatus?.configured}
                      className="w-full py-2 bg-emerald-400 hover:bg-emerald-300 text-black font-extrabold rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 shadow-neon"
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
                <div className="bg-black/50 border border-neutral-900 rounded-2xl p-5 hover:border-emerald-500/20 transition duration-350 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-white uppercase tracking-wider">Importar Supabase → Local (Pull)</h5>
                      <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
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
                      className="w-full py-2 bg-[#151515] hover:bg-[#202020] text-slate-300 hover:text-white border border-neutral-900 font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                    >
                      {syncingDb === "pull" ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          Baixando dados...
                        </>
                      ) : (
                        <>
                          <Database className="h-3.5 w-3.5 text-slate-400" />
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
            <div className="bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-6 shadow-lg space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-900/80 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Terminal className="h-4.5 w-4.5 text-emerald-400" />
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">Estrutura de Tabelas SQL do Supabase</h4>
                  </div>
                  <p className="text-[11px] text-slate-400">Instruções e código SQL para criar a arquitetura de tabelas no banco de dados PostgreSQL do Supabase.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(dbSqlSchema);
                      setCopySuccess(true);
                      setTimeout(() => setCopySuccess(false), 2000);
                    }}
                    className="px-3 py-1.5 bg-[#151515] hover:bg-[#202020] text-slate-300 hover:text-white font-bold rounded-xl text-[10px] uppercase tracking-wider border border-neutral-900 transition flex items-center gap-1.5 cursor-pointer"
                  >
                    {copySuccess ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-slate-400" />
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
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Para criar as tabelas manualmente, acesse o painel do seu projeto no <strong className="text-white">Supabase</strong>, vá em <strong className="text-white">SQL Editor</strong>, clique em <strong className="text-white">New Query</strong>, cole o código abaixo e clique em <strong className="text-white">Run</strong>.
                </p>

                <div className="relative rounded-xl overflow-hidden border border-neutral-900 bg-black/90">
                  <div className="absolute top-3 right-3 bg-neutral-900 px-2 py-0.5 rounded text-[8px] font-mono font-bold text-slate-500 uppercase tracking-widest select-none border border-neutral-850">
                    PostgreSQL
                  </div>
                  <pre className="p-4 text-[10px] font-mono text-slate-300 overflow-x-auto max-h-72 leading-relaxed whitespace-pre select-all">
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
          
          {/* LEFT SECTION (Col 7): Tickets List & Core Triage Panel */}
          <div className={`transition-all duration-300 space-y-6 ${rightSidebarCollapsed ? "xl:col-span-12" : "xl:col-span-7"} ${
            selectedTicketId ? "hidden xl:block" : "block"
          }`}>
            
            {/* Bento Grid Analytics Widget Row */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              {activeTab === "projetos" ? (
                <>
                  {/* Card 1: Total de Projetos */}
                  <div className="bg-[#0a0a0a] border border-neutral-900 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 flex flex-col justify-between min-h-[90px] sm:min-h-[110px] shadow-lg">
                    <p className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wider sm:tracking-widest text-slate-400">Total de Projetos</p>
                    <div className="flex items-baseline sm:items-end justify-between mt-1 sm:mt-2 gap-1 flex-wrap sm:flex-nowrap w-full">
                      <span className="text-xl sm:text-3xl font-black text-white leading-none">
                        {userVisibleTickets.filter(t => !!t.projectDeadline).length}
                      </span>
                      <span className="text-emerald-400 text-[8px] sm:text-[10px] font-bold bg-emerald-500/10 px-1 sm:px-2 py-0.5 rounded border border-emerald-500/20 whitespace-nowrap">
                        {userVisibleTickets.filter(t => !!t.projectDeadline && (t.status === "Resolvido" || t.status === "Fechado")).length} Concluídos
                      </span>
                    </div>
                  </div>

                  {/* Card 2: Projetos em Dia */}
                  <div className="bg-[#0a0a0a] border border-neutral-900 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 flex flex-col justify-between min-h-[90px] sm:min-h-[110px] shadow-lg">
                    <p className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wider sm:tracking-widest text-slate-400">Projetos em Dia</p>
                    <div className="flex items-baseline sm:items-end justify-between mt-1 sm:mt-2 gap-1 flex-wrap sm:flex-nowrap w-full">
                      <span className="text-xl sm:text-3xl font-black text-emerald-400 leading-none">
                        {(() => {
                          const activeProjs = userVisibleTickets.filter(t => !!t.projectDeadline && t.status !== "Resolvido" && t.status !== "Fechado");
                          const overdueProjs = activeProjs.filter(t => isTicketOverdue(t));
                          return activeProjs.length - overdueProjs.length;
                        })()}
                      </span>
                      <span className="text-slate-400 text-[8px] sm:text-[10px] font-bold bg-neutral-900 px-1 sm:px-2 py-0.5 rounded border border-neutral-850 whitespace-nowrap">
                        SLA Monitorado
                      </span>
                    </div>
                  </div>

                  {/* Card 3: Fora do Prazo / Críticos */}
                  <button
                    onClick={() => {
                      setSelectedStatus("All");
                      setSelectedPriority("All");
                      setSelectedCategory("All");
                      setSearchTerm("");
                    }}
                    className="bg-[#0a0a0a] border border-neutral-900 hover:border-rose-500/30 hover:bg-rose-950/5 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 flex flex-col justify-between min-h-[90px] sm:min-h-[110px] shadow-lg text-left transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer focus:outline-none focus:ring-1 focus:ring-rose-500/20 group"
                  >
                    <p className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wider sm:tracking-widest text-slate-400 group-hover:text-rose-400 transition-colors">Atrasados / Críticos</p>
                    <div className="flex items-baseline sm:items-end justify-between mt-1 sm:mt-2 gap-1 flex-wrap sm:flex-nowrap w-full">
                      <span className={`text-xl sm:text-3xl font-black leading-none ${
                        userVisibleTickets.filter(t => !!t.projectDeadline && t.status !== "Resolvido" && t.status !== "Fechado" && isTicketOverdue(t)).length > 0 ? "text-rose-500" : "text-white"
                      }`}>
                        {userVisibleTickets.filter(t => !!t.projectDeadline && t.status !== "Resolvido" && t.status !== "Fechado" && isTicketOverdue(t)).length}
                      </span>
                      <span className={`text-[8px] sm:text-[10px] font-bold px-1 sm:px-2 py-0.5 rounded border whitespace-nowrap ${
                        userVisibleTickets.filter(t => !!t.projectDeadline && t.status !== "Resolvido" && t.status !== "Fechado" && isTicketOverdue(t)).length > 0 ? "bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse" : "bg-neutral-900 text-slate-400 border-neutral-850"
                      }`}>
                        {userVisibleTickets.filter(t => !!t.projectDeadline && t.status !== "Resolvido" && t.status !== "Fechado" && isTicketOverdue(t)).length > 0 ? "Ação Requerida" : "Cronograma OK"}
                      </span>
                    </div>
                  </button>
                </>
              ) : (
                <>
                  {/* Card 1: Tickets em Aberto */}
                  <button 
                    onClick={() => {
                      setActiveTab("painel");
                      setSelectedStatus("Active");
                      setSelectedPriority("All");
                      setSelectedCategory("All");
                      setSearchTerm("");
                    }}
                    className="bg-[#0a0a0a] border border-neutral-900 hover:border-emerald-500/30 hover:bg-emerald-950/5 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 flex flex-col justify-between min-h-[90px] sm:min-h-[110px] shadow-lg text-left transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500/20 group"
                  >
                    <p className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wider sm:tracking-widest text-slate-400 group-hover:text-emerald-400 transition-colors">Chamados Ativos</p>
                    <div className="flex items-baseline sm:items-end justify-between mt-1 sm:mt-2 gap-1 flex-wrap sm:flex-nowrap w-full">
                      <span className="text-xl sm:text-3xl font-black text-white leading-none">{activeTickets.length}</span>
                      <span className="text-amber-400 text-[8px] sm:text-[10px] font-bold bg-amber-500/10 px-1 sm:px-2 py-0.5 rounded border border-amber-500/20 whitespace-nowrap">
                        Aguardando TI
                      </span>
                    </div>
                  </button>

                  {/* Card 2: SLA compliance status */}
                  <button 
                    onClick={() => {
                      setActiveTab("sla");
                    }}
                    className="bg-[#0a0a0a] border border-neutral-900 hover:border-emerald-500/30 hover:bg-emerald-950/5 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 flex flex-col justify-between min-h-[90px] sm:min-h-[110px] shadow-lg text-left transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500/20 group"
                  >
                    <p className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wider sm:tracking-widest text-slate-400 group-hover:text-emerald-400 transition-colors">Eficiência (SLA)</p>
                    <div className="flex items-baseline sm:items-end justify-between mt-1 sm:mt-2 gap-1 flex-wrap sm:flex-nowrap w-full">
                      <span className="text-xl sm:text-3xl font-black text-emerald-400 leading-none">{slaCompliance}%</span>
                      <span className="text-emerald-400 text-[8px] sm:text-[10px] font-bold bg-emerald-500/10 px-1 sm:px-2 py-0.5 rounded border border-emerald-500/20 whitespace-nowrap">
                        Meta: 92%
                      </span>
                    </div>
                  </button>

                  {/* Card 3: Critical alerts pending */}
                  <button 
                    onClick={() => {
                      setActiveTab("painel");
                      setSelectedStatus("Active");
                      // Filter by Urgente if any exists, otherwise Alta
                      const hasUrgent = activeTickets.some(t => t.priority === "Urgente");
                      setSelectedPriority(hasUrgent ? "Urgente" : "Alta");
                      setSelectedCategory("All");
                      setSearchTerm("");
                    }}
                    className="bg-[#0a0a0a] border border-neutral-900 hover:border-rose-500/30 hover:bg-rose-950/5 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 flex flex-col justify-between min-h-[90px] sm:min-h-[110px] shadow-lg text-left transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer focus:outline-none focus:ring-1 focus:ring-rose-500/20 group"
                  >
                    <p className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wider sm:tracking-widest text-slate-400 group-hover:text-rose-400 transition-colors">Casos Críticos</p>
                    <div className="flex items-baseline sm:items-end justify-between mt-1 sm:mt-2 gap-1 flex-wrap sm:flex-nowrap w-full">
                      <span className={`text-xl sm:text-3xl font-black leading-none ${criticalTickets.length > 0 ? "text-rose-500" : "text-white"}`}>
                        {criticalTickets.length}
                      </span>
                      <span className={`text-[8px] sm:text-[10px] font-bold px-1 sm:px-2 py-0.5 rounded border whitespace-nowrap ${criticalTickets.length > 0 ? "bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse" : "bg-neutral-900 text-slate-400 border-neutral-850"}`}>
                        {criticalTickets.length > 0 ? "Ação Urgente" : "Fila Limpa"}
                      </span>
                    </div>
                  </button>
                </>
              )}
            </div>

            {/* Filters Bar, Tickets List & Projects Dashboard */}
            {activeTab === "projetos" ? (
              <div className="space-y-6">
                
                {/* Dashboard Control Bar */}
                <div className="bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20 shadow-neon-sm">
                      <Briefcase className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider">Painel de Projetos</h4>
                      <p className="text-[10px] text-slate-400">Visão geral, quadros e cronogramas de entregas corporativas</p>
                    </div>
                  </div>

                  {/* Mode switcher tabs */}
                  <div className="flex items-center gap-1.5 bg-black p-1 rounded-xl border border-neutral-900 self-start md:self-auto shrink-0">
                    <button
                      onClick={() => setProjectViewMode("bento")}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                        projectViewMode === "bento" 
                          ? "bg-emerald-400 text-black font-extrabold shadow-neon" 
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <Layers className="h-3.5 w-3.5" />
                      <span>Bento</span>
                    </button>
                    <button
                      onClick={() => setProjectViewMode("kanban")}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                        projectViewMode === "kanban" 
                          ? "bg-emerald-400 text-black font-extrabold shadow-neon" 
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <FolderKanban className="h-3.5 w-3.5" />
                      <span>Kanban</span>
                    </button>
                    <button
                      onClick={() => setProjectViewMode("timeline")}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 ${
                        projectViewMode === "timeline" 
                          ? "bg-emerald-400 text-black font-extrabold shadow-neon" 
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <Calendar className="h-3.5 w-3.5" />
                      <span>Cronograma</span>
                    </button>
                  </div>
                </div>

                {/* Subtitle / Search & Filters for projects */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-4 shadow-lg">
                  <div className="sm:col-span-2 relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
                      <Search className="h-4 w-4" />
                    </span>
                    <input
                      type="text"
                      placeholder="Buscar projetos..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-black border border-neutral-900 rounded-xl py-2 pl-9 pr-4 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                    />
                  </div>
                  
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="bg-black border border-neutral-900 text-slate-300 text-xs rounded-xl py-2 px-3 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all cursor-pointer"
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
                    className="bg-black border border-neutral-900 text-slate-300 text-xs rounded-xl py-2 px-3 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all cursor-pointer"
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
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-3">
                      <RefreshCw className="h-8 w-8 animate-spin text-emerald-400" />
                      <p className="text-xs">Carregando projetos corporativos...</p>
                    </div>
                  ) : filteredTickets.length === 0 ? (
                    <div className="text-center py-16 bg-[#0a0a0a] border border-neutral-900 rounded-2xl text-neutral-500 font-mono shadow-lg">
                      <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Nenhum projeto encontrado</p>
                      <p className="text-[10px] text-neutral-600 mt-2">Ajuste os filtros ou crie um novo chamado definindo uma Data Limite.</p>
                    </div>
                  ) : projectViewMode === "bento" ? (
                    
                    /* BENTO CARD VIEW */
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredTickets.map((project) => {
                        const isSelected = project.id === selectedTicketId;
                        const commentsCount = project.comments.filter(c => c.authorRole !== "system").length;
                        
                        // Priority colors
                        const priorityColor = 
                          project.priority === "Urgente" ? "text-rose-400 bg-rose-500/10 border-rose-500/20" :
                          project.priority === "Alta" ? "text-amber-400 bg-amber-500/10 border-amber-500/20" :
                          project.priority === "Média" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : 
                          "text-neutral-400 bg-neutral-900 border-neutral-800";

                        // Project Progress Calculation
                        let progressVal = 15;
                        if (project.status === "Resolvido" || project.status === "Fechado") {
                          progressVal = 100;
                        } else if (project.status === "Em Atendimento") {
                          if (commentsCount >= 4) progressVal = 85;
                          else if (commentsCount === 3) progressVal = 70;
                          else if (commentsCount === 2) progressVal = 55;
                          else if (commentsCount === 1) progressVal = 40;
                          else progressVal = 30;
                        }

                        // Time Calculation
                        let timeBadge = null;
                        const isOverdue = isTicketOverdue(project);
                        
                        if (project.projectDeadline) {
                          const diffTime = new Date(project.projectDeadline).getTime() - Date.now();
                          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                          
                          if (isOverdue) {
                            timeBadge = (
                              <span className="flex items-center gap-1 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/25 rounded-full animate-pulse">
                                <Clock className="h-3 w-3" />
                                Atrasado por {Math.abs(diffDays)}d
                              </span>
                            );
                          } else if (diffDays === 0) {
                            timeBadge = (
                              <span className="flex items-center gap-1 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full animate-pulse">
                                <Clock className="h-3 w-3" />
                                Vence Hoje
                              </span>
                            );
                          } else if (diffDays <= 3) {
                            timeBadge = (
                              <span className="flex items-center gap-1 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full">
                                <Clock className="h-3 w-3" />
                                Limite em {diffDays}d
                              </span>
                            );
                          } else {
                            timeBadge = (
                              <span className="flex items-center gap-1 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
                                <Clock className="h-3 w-3" />
                                {diffDays}d restantes
                              </span>
                            );
                          }
                        }

                        return (
                          <div
                            key={project.id}
                            onClick={() => setSelectedTicketId(project.id)}
                            className={`p-5 bg-gradient-to-br from-[#0a0a0a] to-[#050505] hover:to-[#0d0d0d] border rounded-2xl transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[200px] relative overflow-hidden group ${
                              isSelected 
                                ? "border-emerald-400 ring-2 ring-emerald-400/25 bg-black shadow-neon-sm" 
                                : "border-neutral-900 hover:border-neutral-800"
                            }`}
                          >
                            <div className="space-y-3.5">
                              {/* Card Header row */}
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] font-mono font-bold text-slate-500 uppercase">
                                    #{project.id}
                                  </span>
                                  <span className={`text-[8px] md:text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                    project.status === "Aberto" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                                    project.status === "Em Atendimento" ? "bg-sky-500/10 text-sky-400 border-sky-500/20" :
                                    project.status === "Resolvido" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                    "bg-zinc-850 text-zinc-400 border-zinc-800"
                                  }`}>
                                    {project.status}
                                  </span>
                                </div>
                                {timeBadge}
                              </div>

                              {/* Title / Info */}
                              <div>
                                <h5 className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors line-clamp-1">{project.title}</h5>
                                <p className="text-[11px] text-slate-400 line-clamp-2 mt-1 leading-relaxed">{project.description}</p>
                              </div>
                            </div>

                            {/* Middle section: progress bar */}
                            <div className="space-y-1.5 my-3.5">
                              <div className="flex items-center justify-between text-[10px] font-bold">
                                <span className="text-slate-500 uppercase tracking-wider text-[8px]">Progresso Estimado</span>
                                <span className="text-emerald-400 font-mono">{progressVal}%</span>
                              </div>
                              <div className="h-1.5 bg-black/80 rounded-full overflow-hidden border border-neutral-900">
                                <div 
                                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(52,211,153,0.3)]"
                                  style={{ width: `${progressVal}%` }}
                                />
                              </div>
                            </div>

                            {/* Footer: Tech assignments and stats */}
                            <div className="flex items-center justify-between border-t border-neutral-900/50 pt-3 mt-1.5 gap-2">
                              <div className="flex items-center gap-1.5">
                                <div className="flex -space-x-1.5 overflow-hidden">
                                  {project.assignedTo ? (
                                    getAssignedTechs(project.assignedTo).map((t, idx) => (
                                      <div 
                                        key={idx} 
                                        className="h-5 w-5 rounded-full bg-neutral-900 border border-neutral-800 text-[8px] font-bold text-emerald-400 flex items-center justify-center shadow-sm"
                                        title={t}
                                      >
                                        {t.substring(0, 2).toUpperCase()}
                                      </div>
                                    ))
                                  ) : (
                                    <span className="text-[9px] text-slate-500 italic">Sem responsável</span>
                                  )}
                                </div>
                                {project.assignedTo && (
                                  <span className="text-[8px] text-slate-500 font-bold uppercase truncate max-w-[80px]">
                                    {getAssignedTechs(project.assignedTo)[0]}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2 text-slate-500 text-[10px]">
                                {commentsCount > 0 && (
                                  <span className="flex items-center gap-1" title={`${commentsCount} atualizações`}>
                                    <MessageSquare className="h-3 w-3" />
                                    <span>{commentsCount}</span>
                                  </span>
                                )}
                                <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase border ${priorityColor}`}>
                                  {project.priority}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                  ) : projectViewMode === "kanban" ? (
                    
                    /* KANBAN BOARD VIEW */
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 overflow-x-auto pb-4">
                      
                      {(() => {
                        const columns = [
                          { title: "Pendente", status: "Aberto", bg: "border-t-amber-500", text: "text-amber-400", dot: "bg-amber-400" },
                          { title: "Em Execução", status: "Em Atendimento", bg: "border-t-sky-500", text: "text-sky-400", dot: "bg-sky-400" },
                          { title: "Concluído", status: "Resolvido", bg: "border-t-emerald-500", text: "text-emerald-400", dot: "bg-emerald-400" }
                        ];

                        return columns.map((col, colIdx) => {
                          const colProjects = filteredTickets.filter(p => {
                            if (col.status === "Resolvido") {
                              return p.status === "Resolvido" || p.status === "Fechado";
                            }
                            return p.status === col.status;
                          });

                          return (
                            <div key={colIdx} className="bg-[#050505] border border-neutral-900 rounded-2xl p-3 flex flex-col min-h-[500px]">
                              
                              {/* Column Header */}
                              <div className={`flex items-center justify-between border-b border-neutral-900/60 pb-3 mb-3 border-t-2 ${col.bg} pt-1.5 px-1`}>
                                <div className="flex items-center gap-2">
                                  <span className={`h-1.5 w-1.5 rounded-full ${col.dot} shadow-sm animate-pulse`} />
                                  <span className="text-[10px] font-black uppercase text-white tracking-widest">{col.title}</span>
                                </div>
                                <span className="text-[10px] font-bold bg-neutral-900 px-2 py-0.5 rounded text-slate-400 font-mono border border-neutral-850">
                                  {colProjects.length}
                                </span>
                              </div>

                              {/* Column Cards Container */}
                              <div className="space-y-3 flex-1 overflow-y-auto max-h-[480px] pr-1">
                                {colProjects.length === 0 ? (
                                  <div className="text-center py-10 border border-dashed border-neutral-900/40 rounded-xl text-neutral-600 text-[10px] font-mono">
                                    Nenhum projeto nesta etapa
                                  </div>
                                ) : (
                                  colProjects.map((project) => {
                                    const isSelected = project.id === selectedTicketId;
                                    const commentsCount = project.comments.filter(c => c.authorRole !== "system").length;
                                    
                                    let progressVal = 15;
                                    if (project.status === "Resolvido" || project.status === "Fechado") {
                                      progressVal = 100;
                                    } else if (project.status === "Em Atendimento") {
                                      progressVal = commentsCount >= 3 ? 80 : commentsCount === 2 ? 60 : commentsCount === 1 ? 40 : 30;
                                    }

                                    return (
                                      <div
                                        key={project.id}
                                        onClick={() => setSelectedTicketId(project.id)}
                                        className={`p-3.5 bg-[#0a0a0a] hover:bg-neutral-900/40 border rounded-xl cursor-pointer transition-all duration-200 relative group flex flex-col justify-between gap-3 ${
                                          isSelected 
                                            ? "border-emerald-400 ring-1 ring-emerald-400/20 bg-black" 
                                            : "border-neutral-900 hover:border-neutral-850"
                                        }`}
                                      >
                                        <div className="space-y-1.5">
                                          <div className="flex items-center justify-between text-[8px] text-slate-500 font-bold uppercase font-mono">
                                            <span>#{project.id}</span>
                                            <span className={project.priority === "Urgente" ? "text-rose-400" : project.priority === "Alta" ? "text-amber-400" : "text-slate-400"}>
                                              {project.priority}
                                            </span>
                                          </div>
                                          <h6 className="text-[11px] font-extrabold text-white group-hover:text-emerald-400 transition-colors line-clamp-1 leading-tight">{project.title}</h6>
                                          <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">{project.description}</p>
                                        </div>

                                        {/* Progress line */}
                                        <div className="h-1 bg-black/60 rounded-full overflow-hidden">
                                          <div className="h-full bg-emerald-400 transition-all duration-300" style={{ width: `${progressVal}%` }} />
                                        </div>

                                        {/* Quick status moves / assignees */}
                                        <div className="flex items-center justify-between border-t border-neutral-900/40 pt-2 text-[9px] text-slate-500">
                                          <div className="flex items-center gap-1 font-semibold text-[8px] bg-neutral-900 px-1.5 py-0.5 rounded text-emerald-400 border border-neutral-850">
                                            <Calendar className="h-2.5 w-2.5" />
                                            <span>
                                              {(() => {
                                                try {
                                                  const [y, m, d] = project.projectDeadline!.split("-");
                                                  return `${d}/${m}`;
                                                } catch (e) {
                                                  return project.projectDeadline;
                                                }
                                              })()}
                                            </span>
                                          </div>

                                          {/* Quick Actions Switch for tech role */}
                                          {currentSession.role === "tecnico" && (
                                            <div className="flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                              {project.status === "Aberto" && (
                                                <button
                                                  onClick={() => handleUpdateTicketMeta(project.id, { status: "Em Atendimento" })}
                                                  className="px-1.5 py-0.5 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded hover:bg-sky-500/20 text-[8px] font-black uppercase cursor-pointer"
                                                  title="Assumir Projeto"
                                                >
                                                  Iniciar →
                                                </button>
                                              )}
                                              {project.status === "Em Atendimento" && (
                                                <button
                                                  onClick={() => handleUpdateTicketMeta(project.id, { status: "Resolvido" })}
                                                  className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded hover:bg-emerald-500/20 text-[8px] font-black uppercase cursor-pointer"
                                                  title="Concluir Projeto"
                                                >
                                                  Concluir ✓
                                                </button>
                                              )}
                                            </div>
                                          )}
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

                  ) : (
                    
                    /* TIMELINE VIEW */
                    <div className="relative border border-neutral-900 rounded-2xl bg-[#030303] p-5 md:p-6 overflow-hidden shadow-lg">
                      <div className="absolute left-6 md:left-8 top-10 bottom-10 w-[1px] bg-gradient-to-b from-emerald-500/30 via-emerald-500/10 to-neutral-900" />

                      <div className="space-y-6 relative z-10">
                        {(() => {
                          const sortedProjects = [...filteredTickets].sort((a, b) => 
                            new Date(a.projectDeadline!).getTime() - new Date(b.projectDeadline!).getTime()
                          );

                          return sortedProjects.map((project, index) => {
                            const isSelected = project.id === selectedTicketId;
                            const isOverdue = isTicketOverdue(project);
                            
                            // Color code
                            const statusColor = 
                              project.status === "Resolvido" || project.status === "Fechado" ? "border-emerald-500 bg-emerald-500" :
                              isOverdue ? "border-rose-500 bg-rose-500 shadow-[0_0_10px_rgba(239,68,68,0.4)] animate-pulse" :
                              "border-amber-500 bg-amber-500";

                            return (
                              <div
                                key={project.id}
                                onClick={() => setSelectedTicketId(project.id)}
                                className="flex gap-4 md:gap-6 items-start cursor-pointer group"
                              >
                                {/* Timeline Bullet node */}
                                <div className={`w-3 h-3 rounded-full border-2 ${statusColor} mt-1.5 shrink-0 z-10 transition-all duration-300 group-hover:scale-125`} />

                                {/* Card on the right */}
                                <div className={`flex-1 p-4 bg-[#0a0a0a] border hover:border-neutral-850 rounded-xl transition-all duration-200 ${
                                  isSelected ? "border-emerald-400/50 bg-black shadow-neon-sm" : "border-neutral-900"
                                }`}>
                                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-1.5 mb-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[9px] font-bold text-slate-500 font-mono uppercase">#{project.id}</span>
                                      <h6 className="text-xs font-black text-white group-hover:text-emerald-400 transition-colors">{project.title}</h6>
                                    </div>
                                    <div className="text-[10px] font-bold text-emerald-400 flex items-center gap-1 bg-emerald-500/5 px-2 py-0.5 rounded-full border border-emerald-500/15">
                                      <Calendar className="h-3 w-3" />
                                      <span>
                                        Entrega: {(() => {
                                          try {
                                            const [y, m, d] = project.projectDeadline!.split("-");
                                            return `${d}/${m}/${y}`;
                                          } catch (e) {
                                            return project.projectDeadline;
                                          }
                                        })()}
                                      </span>
                                    </div>
                                  </div>

                                  <p className="text-[11px] text-slate-400 line-clamp-1 leading-relaxed">{project.description}</p>
                                  
                                  <div className="flex items-center justify-between border-t border-neutral-900/50 pt-2.5 mt-2.5 text-[9px] text-slate-500">
                                    <span>Resp: <strong className="text-slate-400">{project.assignedTo || "Sem responsável"}</strong></span>
                                    <span className="uppercase tracking-wider font-extrabold text-[8px] bg-neutral-900 px-1.5 py-0.5 rounded text-neutral-400 border border-neutral-850">{project.category}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>

                  )}
                </div>

              </div>
            ) : (
              <div className="bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-4 md:p-6 shadow-lg">
                
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      Fila de Chamados
                    </h3>
                    <span className="text-[10px] bg-black text-emerald-400 px-2 py-0.5 rounded border border-neutral-900 font-bold uppercase tracking-wide">
                      Real-Time
                    </span>
                  </div>

                  {/* Reset Filters action */}
                  {(selectedCategory !== "All" || selectedPriority !== "All" || selectedStatus !== "Active" || searchTerm) && (
                    <button
                      onClick={() => {
                        setSelectedCategory("All");
                        setSelectedPriority("All");
                        setSelectedStatus("Active");
                        setSearchTerm("");
                      }}
                      className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 self-start md:self-auto cursor-pointer"
                    >
                      <Filter className="h-3 w-3" />
                      Limpar Filtros
                    </button>
                  )}
                </div>

                {/* Advanced search & quick status filters */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
                  
                  {/* Search query input */}
                  <div className="sm:col-span-2 relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
                      <Search className="h-4 w-4" />
                    </span>
                    <input
                      type="text"
                      placeholder="Buscar ID, título, autor ou responsável..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-black border border-neutral-900 rounded-xl py-2 pl-9 pr-4 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                    />
                  </div>

                  {/* Priority Selection Filter */}
                  <select
                    value={selectedPriority}
                    onChange={(e) => setSelectedPriority(e.target.value)}
                    className="bg-black border border-neutral-900 text-slate-300 text-xs rounded-xl py-2 px-3 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all cursor-pointer"
                  >
                    <option value="All">Prioridade (Todas)</option>
                    <option value="Baixa">Baixa</option>
                    <option value="Média">Média</option>
                    <option value="Alta">Alta</option>
                    <option value="Urgente">Urgente</option>
                  </select>

                  {/* Status Selection Filter */}
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="bg-black border border-neutral-900 text-slate-300 text-xs rounded-xl py-2 px-3 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all cursor-pointer"
                  >
                    <option value="Active">Ativos (Aberto / Em Atendimento)</option>
                    <option value="All">Status (Todos)</option>
                    <option value="Aberto">Aberto</option>
                    <option value="Em Atendimento">Em Atendimento</option>
                    <option value="Resolvido">Resolvido</option>
                    <option value="Fechado">Fechado</option>
                  </select>

                </div>

                {/* Main Interactive Ticket List container */}
                <div className="space-y-3 max-h-[580px] xl:max-h-[calc(100vh-250px)] overflow-y-auto pr-1">
                  {loading ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-3">
                      <RefreshCw className="h-8 w-8 animate-spin text-emerald-400" />
                      <p className="text-xs">Sincronizando banco de dados corporativo...</p>
                    </div>
                  ) : filteredTickets.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-neutral-900 rounded-xl text-neutral-500 font-mono">
                      <p className="text-xs font-bold text-emerald-400">Nenhum chamado corresponde aos filtros selecionados.</p>
                      <p className="text-[10px] text-neutral-600 mt-1">Experimente limpar a busca ou os filtros de prioridade acima.</p>
                    </div>
                  ) : (
                    filteredTickets.map((ticket) => {
                      const isSelected = ticket.id === selectedTicketId;
                      const commentsCount = ticket.comments.filter(c => c.authorRole !== "system").length;
                      
                      // Priority border coloring
                      const priorityBorder = 
                        ticket.priority === "Urgente" ? "border-l-rose-500" :
                        ticket.priority === "Alta" ? "border-l-amber-500" :
                        ticket.priority === "Média" ? "border-l-emerald-500" : "border-l-neutral-700";

                      const priorityTextClass = 
                        ticket.priority === "Urgente" ? "text-rose-400" :
                        ticket.priority === "Alta" ? "text-amber-400" :
                        ticket.priority === "Média" ? "text-emerald-400" : "text-neutral-400";

                      return (
                        <div
                          id={`ticket-card-${ticket.id}`}
                          key={ticket.id}
                          onClick={() => setSelectedTicketId(ticket.id)}
                          className={`p-2.5 md:p-4 bg-[#050505] hover:bg-[#0c0c0c] rounded-lg md:rounded-2xl border border-neutral-900 border-l-4 ${priorityBorder} flex flex-col md:flex-row justify-between md:items-center gap-2 md:gap-4 transition-all cursor-pointer ${isSelected ? "ring-2 ring-emerald-400/35 bg-black border-emerald-400/20 shadow-neon-sm" : ""}`}
                        >
                          <div className="flex-1 space-y-0.5 md:space-y-2">
                             <div className="flex flex-wrap items-center gap-1 md:gap-2">
                              <span className="text-[8px] md:text-[10px] font-bold text-neutral-400 uppercase">
                                #{ticket.id}
                              </span>
                              <span className={`text-[8px] md:text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded ${
                                ticket.status === "Aberto" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                                ticket.status === "Em Atendimento" ? "bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-[0_0_10px_rgba(56,189,248,0.05)]" :
                                ticket.status === "Resolvido" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.05)]" :
                                ticket.status === "Fechado" ? "bg-zinc-800/40 text-zinc-400 border border-zinc-700/30" :
                                "bg-[#151515] text-neutral-400 border border-neutral-900"
                              }`}>
                                {ticket.status}
                              </span>
                              <span className={`text-[8px] md:text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded ${
                                ticket.category === 'Acesso' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                                ticket.category === 'Redes' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                ticket.category === 'Hardware' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                ticket.category === 'Software' ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' :
                                ticket.category === 'Sistemas' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                'bg-neutral-900 text-neutral-300'
                              }`}>
                                {ticket.category}
                              </span>
                              <span className={`text-[8px] md:text-[10px] font-bold uppercase ${priorityTextClass}`}>
                                {ticket.priority}
                              </span>
                            </div>

                            <h4 className="text-[11px] sm:text-xs md:text-sm font-bold text-neutral-200 line-clamp-1">{ticket.title}</h4>
                            
                            <div className="flex flex-wrap items-center gap-x-2 md:gap-x-4 gap-y-0.5 text-[9px] md:text-xs text-slate-500">
                              <span>Solicitante: <strong className="text-slate-400">{ticket.requesterName}</strong> ({ticket.requesterDepartment.split(" / ")[0]})</span>
                              <span>•</span>
                              <span>Aberto: {new Date(ticket.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às {new Date(ticket.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                              {ticket.projectDeadline && (
                                <>
                                  <span>•</span>
                                  <span className="flex items-center gap-1 text-emerald-400 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 text-[8px] md:text-[10px]">
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
                                </>
                              )}
                            </div>
                          </div>

                          {/* Responsible and stats alignment block */}
                          <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center shrink-0 border-t md:border-t-0 border-neutral-900/30 pt-1 md:pt-0 gap-1 md:gap-2">
                            <div className="text-right">
                              <p className="text-[8px] md:text-[10px] text-slate-500 font-bold uppercase">Atribuído a</p>
                              <div className="mt-0.5 md:mt-1">
                                {ticket.assignedTo ? (
                                  <div className="flex flex-wrap gap-1 justify-end">
                                    {getAssignedTechs(ticket.assignedTo).map((t, i) => (
                                      <span key={i} className="bg-emerald-500/10 text-emerald-400 px-1 py-0.5 rounded text-[8px] md:text-[9px] border border-emerald-500/20 font-bold shadow-sm">
                                        {t}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-slate-500 italic text-[9px] md:text-xs block text-right">Ninguém</span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 md:gap-3 mt-0.5 md:mt-1 text-slate-500">
                              {commentsCount > 0 && (
                                <div className="flex items-center gap-1" title={`${commentsCount} comentários de suporte`}>
                                  <MessageSquare className="h-3 w-3" />
                                  <span className="text-[10px] md:text-xs font-semibold">{commentsCount}</span>
                                </div>
                              )}

                              {/* IA Triaged icon badge indicator */}
                              {ticket.aiCategory && (
                                <div className="flex items-center gap-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded text-[8px] md:text-[9px] font-bold" title="Triagem inteligente realizada por IA">
                                  <Sparkles className="h-2.5 w-2.5" />
                                  <span>IA</span>
                                </div>
                              )}
                            </div>
                          </div>

                        </div>
                      );
                    })
                  )}
                </div>

              </div>
            )}
          </div>

          {/* RIGHT SECTION (Col 5): Bento Ticket Detail, Diagnosis Panel & Activity */}
          {!rightSidebarCollapsed && (
            <div className={`xl:col-span-5 space-y-6 animate-in fade-in slide-in-from-right-3 duration-300 ${
              selectedTicketId ? "block" : "hidden xl:block"
            }`}>
            
            {/* Live active team indicator module - Bento Grid Block */}
            <div className="bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-5 shadow-lg">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <Users className="h-4 w-4 text-emerald-400" />
                  Equipe de TI Ativa
                </h3>
                <span className="text-[10px] bg-black text-emerald-400 px-2 py-0.5 rounded border border-neutral-900 font-bold uppercase tracking-wide flex items-center gap-1 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Live
                </span>
              </div>
              
              <div className="space-y-3 max-h-[280px] xl:max-h-[calc(100vh-620px)] overflow-y-auto pr-1">
                {(() => {
                  const filteredList = users
                    .filter(u => u.role === "tecnico")
                    .map(u => {
                      const isOnline = !!(u.isOnline || (currentSession && (
                        (u.email && currentSession.email && u.email.toLowerCase() === currentSession.email.toLowerCase()) ||
                        (u.name && currentSession.name && u.name.toLowerCase() === currentSession.name.toLowerCase())
                      )));
                      return { ...u, isOnline };
                    })
                    // Sort by online status first, then by name
                    .sort((a, b) => {
                      if (a.isOnline && !b.isOnline) return -1;
                      if (!a.isOnline && b.isOnline) return 1;
                      return (a.name || "").localeCompare(b.name || "");
                    });

                  if (filteredList.length === 0) {
                    return (
                      <div className="p-4 text-center border border-dashed border-neutral-900 rounded-xl">
                        <p className="text-xs text-slate-500">Nenhum técnico de TI cadastrado.</p>
                      </div>
                    );
                  }

                  return filteredList.map((user, idx) => {
                    const initials = user.name
                      ? user.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase()
                      : "TI";
                    
                    // Deterministic/unique colors based on index or name
                    const bgClasses = [
                      "bg-emerald-950/20 text-emerald-400 border-emerald-500/20",
                      "bg-teal-950 text-teal-400 border-teal-500/30",
                      "bg-emerald-950 text-emerald-400 border-emerald-500/30",
                      "bg-neutral-950 text-emerald-300 border-neutral-800",
                    ];
                    const colorClass = bgClasses[idx % bgClasses.length];

                    return (
                      <div key={user.id || idx} className={`flex items-center justify-between p-2.5 bg-black/40 rounded-xl border transition ${user.isOnline ? "border-emerald-500/25 bg-emerald-500/5" : "border-emerald-950/15 hover:bg-[#080808]"}`}>
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold ${colorClass}`}>
                              {initials}
                            </div>
                            {user.isOnline ? (
                              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-black animate-pulse" title="Ativo / Online"></span>
                            ) : (
                              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-neutral-700 rounded-full border-2 border-black" title="Inativo"></span>
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white">{user.name}</p>
                            <p className="text-[10.5px] text-slate-400 font-medium">
                              {user.department || "Suporte Técnico"} • <span className={user.isOnline ? "text-emerald-400 font-semibold" : "text-neutral-500"}>{user.isOnline ? "Ativo" : "Ausente"}</span>
                            </p>
                          </div>
                        </div>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border ${user.isOnline ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-neutral-900 border-neutral-850 text-neutral-500"}`}>
                          {user.isOnline ? "Online" : "Suporte"}
                        </span>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Selected Ticket Deep-Dive & Action Console */}
            {selectedTicket ? (
              <div className="bg-[#0a0a0a] border border-emerald-500/10 rounded-2xl overflow-hidden shadow-2xl">
                
                {/* Detail Header */}
                <div className="p-4 md:p-5 bg-[#0e0e0e] border-b border-neutral-900/60 flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setSelectedTicketId(null)}
                      className="xl:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-xs font-bold text-emerald-400 transition cursor-pointer active:scale-95 shrink-0"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <span>Voltar</span>
                    </button>
                    <div>
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest block mb-0.5">Diagnóstico Completo</span>
                      <h3 className="text-sm font-bold text-white">Chamado #{selectedTicket.id}</h3>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Status updater for technicians */}
                    {currentSession.role === "tecnico" ? (
                       <select
                        value={selectedTicket.status}
                        onChange={(e) => handleUpdateTicketMeta(selectedTicket.id, { status: e.target.value as Ticket["status"] })}
                        disabled={isAssignedToOther}
                        className={`bg-black border border-neutral-800 text-xs font-bold rounded-lg px-2 py-1 focus:outline-none transition ${
                          selectedTicket.status === "Aberto" ? "text-amber-400 focus:border-amber-500" :
                          selectedTicket.status === "Em Atendimento" ? "text-sky-400 focus:border-sky-500" :
                          selectedTicket.status === "Resolvido" ? "text-emerald-400 focus:border-emerald-500" :
                          "text-zinc-400 focus:border-zinc-500"
                        } ${isAssignedToOther ? "opacity-50 cursor-not-allowed text-slate-500" : ""}`}
                        title={isAssignedToOther ? `Apenas o técnico responsável (${selectedTicket.assignedTo}) pode alterar o status.` : ""}
                      >
                        <option value="Aberto" className="text-amber-400 font-bold bg-neutral-950">Aberto</option>
                        <option value="Em Atendimento" className="text-sky-400 font-bold bg-neutral-950">Em Atendimento</option>
                        <option value="Resolvido" className="text-emerald-400 font-bold bg-neutral-950">Resolvido</option>
                        <option value="Fechado" className="text-zinc-400 font-bold bg-neutral-950">Fechado</option>
                      </select>
                    ) : (
                      <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded bg-[#0e0e0e] border transition ${
                        selectedTicket.status === "Aberto" ? "text-amber-400 border-amber-500/20" :
                        selectedTicket.status === "Em Atendimento" ? "text-sky-400 border-sky-500/20 shadow-[0_0_10px_rgba(56,189,248,0.05)]" :
                        selectedTicket.status === "Resolvido" ? "text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.05)]" :
                        "text-zinc-400 border-zinc-700/30"
                      }`}>
                        {selectedTicket.status}
                      </span>
                    )}
                  </div>
                </div>

                {/* Main scrollable body */}
                <div className="p-5 space-y-5 max-h-[550px] xl:max-h-[calc(100vh-220px)] overflow-y-auto">
                  
                  {/* Requester overview */}
                  <div className="p-3 bg-black/40 rounded-xl border border-emerald-950/20 text-xs space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-medium">Solicitado por:</span>
                      <strong className="text-white">{selectedTicket.requesterName}</strong>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-medium">Departamento:</span>
                      <span className="text-slate-300">{selectedTicket.requesterDepartment}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-medium">SLA Limite:</span>
                      <span className="text-rose-400 font-semibold">
                        {new Date(selectedTicket.slaLimit).toLocaleDateString("pt-BR")} {new Date(selectedTicket.slaLimit).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {selectedTicket.projectDeadline && (
                      <div className="flex justify-between items-center border-t border-neutral-900/40 pt-1.5">
                        <span className="text-slate-500 font-medium flex items-center gap-1">
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
                        <div className="bg-black/40 p-2 rounded-lg border border-neutral-900">
                          <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Categoria IA</span>
                          <span className="text-emerald-400 font-bold">{selectedTicket.aiCategory}</span>
                        </div>
                        <div className="bg-black/40 p-2 rounded-lg border border-neutral-900">
                          <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Prioridade IA</span>
                          <span className={`font-bold ${
                            selectedTicket.aiPriority === "Urgente" ? "text-rose-400" :
                            selectedTicket.aiPriority === "Alta" ? "text-amber-400" :
                            selectedTicket.aiPriority === "Média" ? "text-emerald-400" : "text-slate-400"
                          }`}>{selectedTicket.aiPriority}</span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Justificativa Técnica</span>
                        <p className="text-slate-300 text-xs leading-relaxed whitespace-pre-line italic">
                          "{selectedTicket.aiReasoning}"
                        </p>
                      </div>

                      {selectedTicket.aiSuggestions && (
                        <div className="space-y-1.5 pt-1 border-t border-emerald-950/25">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Soluções Recomendadas</span>
                          <div className="text-slate-300 text-xs leading-relaxed space-y-1 bg-black/30 p-2.5 rounded-lg border border-neutral-900/60 font-sans">
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
                          <span className="text-slate-400 font-medium shrink-0">Técnicos Responsáveis:</span>
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
                            <span className="text-slate-400 font-medium">Início do Atendimento:</span>
                            <span className="text-slate-300">
                              {new Date(firstAssumedTime).toLocaleDateString("pt-BR")} {new Date(firstAssumedTime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        )}

                        {durationText && (
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400 font-medium">Tempo de Resolução:</span>
                            <span className="text-emerald-400 font-semibold">{durationText}</span>
                          </div>
                        )}

                        {isResolved && resolutionComment && (
                          <div className="flex justify-between items-center border-t border-emerald-500/10 pt-1.5 mt-1 text-[10px] text-slate-400 italic">
                            <span>Resolvido em: {new Date(resolutionComment.timestamp).toLocaleDateString("pt-BR")} {new Date(resolutionComment.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Original issue description block */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Descrição do Problema</span>
                    <div className="bg-black p-4 rounded-xl border border-neutral-900 text-xs text-slate-200 leading-relaxed whitespace-pre-line">
                      {selectedTicket.description}
                    </div>
                  </div>

                  {/* Attached files and screenshots block */}
                  {((selectedTicket.attachments && selectedTicket.attachments.length > 0) || selectedTicket.screenshot) && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Paperclip className="h-3.5 w-3.5 text-emerald-400" />
                        Prints e Arquivos Anexados
                      </span>
                      <div className="bg-black/40 p-4 rounded-xl border border-neutral-900/60 space-y-3">
                        {/* If we have multiple attachments */}
                        {selectedTicket.attachments && selectedTicket.attachments.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {selectedTicket.attachments.map((file, idx) => {
                              const isImage = file.type.startsWith("image/");
                              const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
                              
                              return (
                                <div key={idx} className="flex flex-col p-2.5 rounded-xl bg-neutral-900/60 border border-neutral-900 hover:border-neutral-800 transition justify-between gap-2.5">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    {isImage ? (
                                      <div className="w-10 h-10 rounded-lg overflow-hidden border border-neutral-800 flex-shrink-0 bg-black flex items-center justify-center">
                                        <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
                                      </div>
                                    ) : (
                                      <div className={`w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center bg-black border border-neutral-800 ${isPdf ? "text-red-400" : "text-emerald-400"}`}>
                                        <FileText className="h-5 w-5" />
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-semibold text-slate-200 truncate" title={file.name}>
                                        {file.name}
                                      </p>
                                      <p className="text-[9px] text-slate-500 uppercase font-mono tracking-wider">
                                        {isPdf ? "Documento PDF" : isImage ? "Imagem" : "Arquivo"}
                                      </p>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {isImage ? (
                                      <button
                                        onClick={() => setPreviewImage(file.url)}
                                        className="flex-1 py-1 px-2.5 bg-neutral-950 hover:bg-neutral-900 border border-neutral-850 rounded-lg text-[10px] font-bold text-slate-300 hover:text-emerald-400 flex items-center justify-center gap-1 transition cursor-pointer"
                                      >
                                        <Eye className="h-3 w-3" /> Visualizar
                                      </button>
                                    ) : (
                                      <a
                                        href={file.url}
                                        download={file.name}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-1 py-1 px-2.5 bg-neutral-950 hover:bg-neutral-900 border border-neutral-850 rounded-lg text-[10px] font-bold text-slate-300 hover:text-emerald-400 flex items-center justify-center gap-1 transition text-center"
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
                              className="relative block rounded-lg overflow-hidden border border-neutral-900 group cursor-zoom-in max-w-full text-left"
                              title="Clique para abrir em tela cheia"
                            >
                              <img 
                                src={selectedTicket.screenshot} 
                                alt="Print do chamado" 
                                className="max-h-64 object-contain rounded-lg group-hover:scale-[1.015] transition-all duration-200" 
                              />
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <span className="bg-black/95 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-xl border border-neutral-800 shadow-xl flex items-center gap-1">
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
                  {currentSession.role === "tecnico" && (
                    <div className="p-4 bg-black border border-emerald-950/20 rounded-xl space-y-3">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Painel do Técnico (Atendimento)</span>
                      
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        
                        {/* Assign to multiple technicians option */}
                        <div className="space-y-1.5 col-span-2 md:col-span-1">
                          <label className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">Técnicos Atribuídos</label>
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
                                  className="bg-neutral-950/80 p-2 rounded-xl border border-neutral-900/60 max-h-48 overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-neutral-800 scrollbar-track-transparent"
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
                                              : "bg-[#060606] border-neutral-900/60 text-slate-400 hover:border-neutral-800/80 hover:text-slate-200"
                                          } ${!canManageAssignments ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
                                        >
                                          <div className="flex items-center gap-2 min-w-0">
                                            {/* Avatar with Initials & Online Status Dot */}
                                            <div className="relative shrink-0">
                                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold border transition-colors ${
                                                isAssigned 
                                                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/20" 
                                                  : "bg-neutral-900 text-slate-500 border-neutral-800"
                                              }`}>
                                                {initials}
                                              </div>
                                              {tech.isOnline && (
                                                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full border border-black shrink-0 animate-pulse" title="Online" />
                                              )}
                                            </div>
                                            
                                            <div className="min-w-0 leading-tight">
                                              <span className={`text-[11px] font-semibold block truncate ${isAssigned ? 'text-emerald-300' : 'text-slate-300 group-hover:text-slate-100'}`}>
                                                {tech.name}
                                              </span>
                                              <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider block">Suporte</span>
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
                                              <div className="w-4 h-4 rounded-full border border-neutral-800 bg-black transition-colors group-hover:border-neutral-700" />
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
                          <label className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">Prioridade Operacional</label>
                          <div className="relative">
                            <select
                              value={selectedTicket.priority}
                              onChange={(e) => handleUpdateTicketMeta(selectedTicket.id, { priority: e.target.value as Ticket["priority"] })}
                              disabled={isAssignedToOther}
                              className={`w-full bg-[#060606] border border-neutral-900 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/25 transition-all ${
                                isAssignedToOther 
                                  ? "opacity-60 cursor-not-allowed text-slate-500" 
                                  : "hover:border-neutral-800/80 cursor-pointer"
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
                        <label className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
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
                          className={`w-full bg-[#060606] border border-neutral-900 rounded-xl py-2 px-3 text-xs text-slate-300 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/25 transition-all ${
                            isAssignedToOther 
                              ? "opacity-60 cursor-not-allowed text-slate-500" 
                              : "hover:border-neutral-800/80 cursor-pointer"
                          }`}
                          title={isAssignedToOther ? `Apenas o técnico responsável (${selectedTicket.assignedTo}) pode alterar o solicitante.` : ""}
                        >
                          {users.map(u => (
                            <option key={u.id} value={u.name}>
                              {u.name} ({u.department || "Suporte"})
                            </option>
                          ))}
                        </select>
                        <p className="text-[9px] text-slate-500 font-medium">Altere o colaborador que solicitou este chamado de suporte.</p>
                      </div>

                      {/* SLA/Ticket Type Setting (Visible to all technicians) */}
                      {currentSession?.role === "tecnico" && (
                        <div className="pt-2.5 border-t border-emerald-950/10 space-y-1.5">
                          <label className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
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
                            className="w-full bg-[#060606] border border-neutral-900 rounded-xl py-2 px-3 text-xs text-slate-300 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/25 transition-all hover:border-neutral-800/80 cursor-pointer"
                          >
                            <option value="chamado">Chamado Padrão (SLA Baseado em Horas)</option>
                            <option value="projeto">Projeto em Andamento (SLA Baseado em Data Limite)</option>
                          </select>
                          <p className="text-[9px] text-slate-500 font-medium">
                            Selecione se este item deve ser tratado como um chamado padrão com SLA por prioridade ou um projeto de longo prazo com data limite de entrega.
                          </p>
                        </div>
                      )}

                      {/* Project Deadline Setting (Visible to all technicians and only if configured as a project) */}
                      {currentSession?.role === "tecnico" && selectedTicket.projectDeadline && (
                        <div className="pt-2.5 border-t border-emerald-950/10 space-y-1.5">
                          <label className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-emerald-400" />
                            Definir Data Limite do Projeto
                          </label>
                          <WindowsDatePicker
                            value={selectedTicket.projectDeadline}
                            onChange={(date) => handleUpdateTicketMeta(selectedTicket.id, { projectDeadline: date })}
                          />
                          <p className="text-[9px] text-slate-500 font-medium">Defina ou altere o prazo limite para a conclusão do projeto associado a este chamado.</p>
                        </div>
                      )}

                      {/* Transfer Option (Only visible to the first assigned technician) */}
                      {getFirstAssignedTech(selectedTicket) === currentSession.name && (
                        <div className="pt-2.5 border-t border-emerald-950/10 space-y-1.5">
                          <label className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <RefreshCw className="h-3.5 w-3.5 text-emerald-400" />
                            Transferir chamado para outro técnico:
                          </label>
                          <select
                            defaultValue=""
                            className="w-full bg-[#060606] border border-neutral-900 rounded-xl py-2 px-3 text-xs text-slate-300 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/25 transition-all hover:border-neutral-800/80 cursor-pointer"
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
                  <div className="p-4 bg-black border border-emerald-950/20 rounded-xl space-y-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Ações Disponíveis</span>
                    
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
                        className={`w-full py-2.5 bg-emerald-400 hover:bg-emerald-300 text-black font-extrabold rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-neon hover:shadow-neon-lg cursor-pointer font-display ${isAssignedToOther ? "opacity-40 cursor-not-allowed" : ""}`}
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
                        className={`w-full py-2.5 bg-black hover:bg-neutral-900 text-slate-200 font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 border border-emerald-950/25 cursor-pointer font-display ${isAssignedToOther ? "opacity-40 cursor-not-allowed" : ""}`}
                        title={isAssignedToOther ? `Apenas ${selectedTicket.assignedTo} pode reabrir este chamado` : ""}
                      >
                        <RefreshCw className="h-4 w-4 text-emerald-400" />
                        Reabrir Chamado (Definir como Aberto)
                      </button>
                    )}

                    {/* Excluir Chamado (Apenas para os técnicos responsáveis) */}
                    {currentSession.role === "tecnico" && (
                      <div className="pt-2 border-t border-neutral-900 mt-2">
                        {!getAssignedTechs(selectedTicket.assignedTo).includes(currentSession.name) ? (
                          <button
                            type="button"
                            disabled
                            className="w-full py-2 bg-neutral-950 text-neutral-600 border border-neutral-900/40 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-not-allowed"
                            title={`Apenas os técnicos responsáveis (${selectedTicket.assignedTo || 'Nenhum'}) podem excluir este chamado.`}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-neutral-700" />
                            Excluir Chamado (Apenas Responsável)
                          </button>
                        ) : isConfirmingDeleteTicket === selectedTicket.id ? (
                          <div className="flex gap-2 w-full">
                            <button
                              type="button"
                              onClick={() => handleDeleteTicket(selectedTicket.id)}
                              className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-rose-600/20"
                            >
                              <Trash2 className="h-4 w-4" />
                              Confirmar Exclusão?
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsConfirmingDeleteTicket(null)}
                              className="px-3 py-2 bg-[#151515] hover:bg-[#202020] text-slate-300 font-medium rounded-xl text-xs border border-neutral-900 transition cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setIsConfirmingDeleteTicket(selectedTicket.id)}
                            className="w-full py-2 bg-black hover:bg-rose-950/15 text-rose-400 hover:text-rose-300 border border-emerald-950/20 hover:border-rose-900/30 font-semibold rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Excluir Chamado
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Interaction history and discussion thread */}
                  <div className="space-y-3 pt-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Histórico de Discussão & Logs</span>
                    
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
                              isSystem ? "bg-black/40 text-slate-400 border-neutral-900 text-center py-2 italic font-mono text-[10px]" :
                              isAI ? "bg-emerald-950/5 text-emerald-300 border-emerald-500/10" :
                              isTechnical ? "bg-[#0e0e0e] text-slate-200 border-emerald-950/20" :
                              "bg-black text-slate-200 border-neutral-900"
                            }`}
                          >
                            {!isSystem && (
                              <div className="flex justify-between items-center mb-1.5">
                                <span className="font-bold flex items-center gap-1">
                                  {isAI && <Sparkles className="h-3 w-3 text-emerald-400" />}
                                  {comment.authorName}
                                  <span className="text-[9px] font-normal text-slate-500">
                                    ({comment.authorRole})
                                  </span>
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  {new Date(comment.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                              </div>
                            )}
                            
                            <p className="whitespace-pre-line text-xs">{comment.content}</p>

                            {comment.attachmentUrl && (
                              <div className="mt-2.5 p-2 bg-black/50 rounded-lg border border-neutral-900/60 flex items-center gap-2 max-w-sm" onClick={(e) => e.stopPropagation()}>
                                {comment.attachmentUrl.startsWith("data:image/") ? (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewImage(comment.attachmentUrl || null)}
                                    className="relative h-12 w-12 rounded-md overflow-hidden border border-neutral-800 flex-shrink-0 cursor-zoom-in text-left"
                                    title="Clique para ver imagem cheia"
                                  >
                                    <img 
                                      src={comment.attachmentUrl} 
                                      alt="Anexo" 
                                      className="h-full w-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center transition">
                                      <Eye className="h-3 w-3 text-white" />
                                    </div>
                                  </button>
                                ) : (
                                  <div className="h-10 w-10 rounded-md bg-neutral-900 border border-neutral-800 flex items-center justify-center text-emerald-400 flex-shrink-0">
                                    <FileText className="h-5 w-5" />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-[10px] font-bold text-slate-300 truncate">{comment.attachmentName || "Anexo"}</p>
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
                <div className="border-t border-neutral-900 bg-black flex flex-col">
                  {/* Attachment Preview Box */}
                  {commentAttachment && (
                    <div className="px-4 py-2 bg-neutral-950/80 border-b border-neutral-900 flex items-center justify-between gap-3 text-xs animate-in slide-in-from-bottom-2 duration-150">
                      <div className="flex items-center gap-2 min-w-0">
                        {commentAttachment.startsWith("data:image/") ? (
                          <img 
                            src={commentAttachment} 
                            alt="Preview do anexo" 
                            className="h-8 w-8 rounded object-cover border border-neutral-800"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded bg-neutral-900 border border-neutral-800 flex items-center justify-center text-emerald-400">
                            <FileText className="h-4 w-4" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-slate-300 truncate">{commentAttachmentName}</p>
                          <p className="text-[9px] text-slate-500 uppercase font-medium">Pronto para enviar</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setCommentAttachment(null);
                          setCommentAttachmentName("");
                        }}
                        className="p-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-slate-400 hover:text-white transition cursor-pointer flex items-center justify-center"
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
                      className="p-2.5 bg-[#0e0e0e] hover:bg-neutral-900 border border-neutral-900 text-slate-400 hover:text-slate-200 rounded-xl transition cursor-pointer flex items-center justify-center flex-shrink-0"
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
                      className="flex-1 bg-[#0e0e0e] border border-neutral-900 text-xs rounded-xl px-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all"
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
            ) : (
              <div className="bg-[#0a0a0a] border border-emerald-950/15 rounded-2xl p-8 text-center text-slate-500 space-y-3">
                <AlertCircle className="h-10 w-10 text-emerald-400 mx-auto" />
                <div>
                  <h4 className="text-sm font-bold text-slate-300">Nenhum chamado selecionado</h4>
                  <p className="text-xs mt-1">Selecione qualquer ticket na fila da prioridade ao lado para verificar os detalhes, histórico de conversas, e recomendações em tempo real geradas por IA.</p>
                </div>
              </div>
            )}

            </div>
          )}

        </motion.div>
        )}
        </AnimatePresence>

      </main>

      {/* Modal: My Tickets History */}
      {isMyTicketsModalOpen && currentSession && (
        <div 
          onClick={() => setIsMyTicketsModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-[#0a0a0a] border border-neutral-900 w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh] cursor-default"
          >
            
            {/* Modal Header */}
            <div className="p-5 border-b border-neutral-900 flex items-center justify-between bg-black/50 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                  <Layers className="h-4 w-4 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-display font-extrabold text-white text-base">Meus Chamados</h3>
                  <p className="text-[10px] text-slate-400">Gerencie todos os chamados abertos por você</p>
                </div>
              </div>
              <button
                onClick={() => setIsMyTicketsModalOpen(false)}
                className="text-slate-400 hover:text-white text-xs font-bold bg-neutral-900 hover:bg-neutral-800 px-3 py-1.5 rounded-xl transition cursor-pointer border border-neutral-800/55"
              >
                Fechar
              </button>
            </div>

            {/* Segmented view controls for technicians */}
            {currentSession.role === "tecnico" && (
              <div className="px-6 py-2 border-b border-neutral-900 flex gap-2 bg-black/40">
                <button
                  onClick={() => {
                    setMyTicketsViewMode("created");
                    setMyTicketsTab("all");
                  }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer border ${
                    myTicketsViewMode === "created"
                      ? "bg-neutral-900 text-white border-neutral-800"
                      : "bg-transparent text-slate-400 border-transparent hover:text-white"
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
                      ? "bg-emerald-500 text-slate-950 border-emerald-500 shadow-neon-sm"
                      : "bg-transparent text-slate-400 border-transparent hover:text-white"
                  }`}
                >
                  Meus Atendimentos Resolvidos
                </button>
              </div>
            )}

            {/* Profile context summary */}
            <div className="px-4 sm:px-6 py-2.5 sm:py-3 bg-black/20 border-b border-neutral-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-neutral-900 flex items-center justify-center text-[8px] sm:text-[10px] font-bold text-emerald-400 border border-neutral-800 shrink-0">
                  {currentSession.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase()}
                </div>
                <div className="flex flex-wrap items-baseline gap-1 sm:gap-1.5">
                  <span className="text-slate-400 font-semibold text-[11px] sm:text-xs">{currentSession.name}</span>
                  <span className="text-slate-500 text-[9px] sm:text-[10px] font-medium">({currentSession.department})</span>
                </div>
              </div>
              <div className="text-[9px] sm:text-[10px] text-slate-500 font-medium">
                {myTicketsViewMode === "resolved" ? (
                  <>
                    Total de chamados resolvidos por você: <strong className="text-emerald-400">{tickets.filter(t => getAssignedTechs(t.assignedTo).includes(currentSession.name) && (t.status === "Resolvido" || t.status === "Fechado")).length}</strong>
                  </>
                ) : (
                  <>
                    Total de chamados criados: <strong className="text-slate-300">{tickets.filter(t => t.requesterName === currentSession.name).length}</strong>
                  </>
                )}
              </div>
            </div>

            {/* Tabs filter */}
            {myTicketsViewMode === "created" ? (
              <div className="p-3 sm:p-4 border-b border-neutral-900 flex gap-1.5 sm:gap-2 overflow-x-auto scrollbar-none">
                <button
                  onClick={() => setMyTicketsTab("all")}
                  className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    myTicketsTab === "all"
                      ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/10"
                      : "bg-black text-slate-400 hover:text-white border border-neutral-900"
                  }`}
                >
                  <span>Todos</span>
                  <span className={`text-[8px] sm:text-[10px] font-extrabold px-1 sm:px-1.5 py-0.5 rounded-md ${
                    myTicketsTab === "all" ? "bg-black/20 text-slate-950" : "bg-neutral-900 text-slate-400"
                  }`}>
                    {tickets.filter(t => t.requesterName === currentSession.name).length}
                  </span>
                </button>

                <button
                  onClick={() => setMyTicketsTab("unresolved")}
                  className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    myTicketsTab === "unresolved"
                      ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/10"
                      : "bg-black text-slate-400 hover:text-white border border-neutral-900"
                  }`}
                >
                  <span>Pendentes</span>
                  <span className={`text-[8px] sm:text-[10px] font-extrabold px-1 sm:px-1.5 py-0.5 rounded-md ${
                    myTicketsTab === "unresolved" ? "bg-black/20 text-slate-950" : "bg-neutral-900 text-slate-400"
                  }`}>
                    {tickets.filter(t => t.requesterName === currentSession.name && t.status !== "Resolvido" && t.status !== "Fechado").length}
                  </span>
                </button>

                <button
                  onClick={() => setMyTicketsTab("resolved")}
                  className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    myTicketsTab === "resolved"
                      ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/10"
                      : "bg-black text-slate-400 hover:text-white border border-neutral-900"
                  }`}
                >
                  <span>Resolvidos</span>
                  <span className={`text-[8px] sm:text-[10px] font-extrabold px-1 sm:px-1.5 py-0.5 rounded-md ${
                    myTicketsTab === "resolved" ? "bg-black/20 text-slate-950" : "bg-neutral-900 text-slate-400"
                  }`}>
                    {tickets.filter(t => t.requesterName === currentSession.name && (t.status === "Resolvido" || t.status === "Fechado")).length}
                  </span>
                </button>
              </div>
            ) : (
              <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-neutral-900 bg-black/20 flex items-center justify-between gap-3">
                <span className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-wider truncate">Histórico de Atendimentos Concluídos</span>
                <span className="text-[9px] sm:text-xs bg-emerald-500/10 text-emerald-400 font-semibold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg sm:rounded-xl border border-emerald-500/20 shadow-neon-sm whitespace-nowrap">
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
                    <div className="py-12 text-center text-slate-500 space-y-3">
                      <CheckCircle className="h-8 w-8 text-slate-700 mx-auto" />
                      <div>
                        <h4 className="text-xs font-bold text-slate-400">Nenhum chamado encontrado</h4>
                        <p className="text-[10px] text-slate-500 mt-1">Não há registros para esta categoria no momento.</p>
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
                    ticket.priority === "Média" ? "text-emerald-400" : "text-neutral-400";

                  return (
                    <div
                      key={ticket.id}
                      onClick={() => {
                        setSelectedTicketId(ticket.id);
                        setIsMyTicketsModalOpen(false);
                      }}
                      className={`p-3.5 bg-black/50 hover:bg-[#080808]/50 rounded-xl border border-neutral-900 border-l-4 ${priorityBorder} flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition cursor-pointer hover:border-emerald-500/20 group`}
                    >
                      <div className="space-y-1 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-bold text-neutral-500">#{ticket.id}</span>
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            ticket.status === "Aberto" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                            ticket.status === "Em Atendimento" ? "bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-[0_0_10px_rgba(56,189,248,0.05)]" :
                            ticket.status === "Resolvido" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.05)]" :
                            ticket.status === "Fechado" ? "bg-zinc-800/40 text-zinc-400 border border-zinc-700/30" :
                            "bg-neutral-900 text-neutral-400 border border-neutral-850"
                          }`}>
                            {ticket.status}
                          </span>
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            ticket.category === 'Acesso' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                            ticket.category === 'Redes' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            ticket.category === 'Hardware' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                            ticket.category === 'Software' ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' :
                            ticket.category === 'Sistemas' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            'bg-neutral-900 text-neutral-300'
                          }`}>
                            {ticket.category}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-neutral-200 group-hover:text-emerald-400 transition-colors line-clamp-1">{ticket.title}</h4>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-neutral-500">
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
                        <span className="text-slate-400 font-medium">
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

            <div className="p-4 border-t border-neutral-900 bg-black/30 text-center text-[10px] text-slate-500">
              Dica: Clique em qualquer chamado para abrir os detalhes completos e interagir com o suporte.
            </div>

          </div>
        </div>
      )}

      {/* Modal: Perfil do Técnico */}
      {isTechProfileModalOpen && selectedTechProfile && (
        <div 
          onClick={() => setIsTechProfileModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-[#0a0a0a] border border-neutral-900 w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh] cursor-default"
          >
            
            {/* Modal Header */}
            <div className="p-5 border-b border-neutral-900 flex items-center justify-between bg-black/50 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-400 font-bold text-base">
                  {selectedTechProfile.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-display font-extrabold text-white text-base flex items-center gap-2">
                    {selectedTechProfile.name}
                    {selectedTechProfile.role === "tecnico" ? (
                      <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        TÉCNICO
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        COLABORADOR
                      </span>
                    )}
                  </h3>
                  <p className="text-[10px] text-slate-400">{selectedTechProfile.email} • {selectedTechProfile.department}</p>
                </div>
              </div>
              <button
                onClick={() => setIsTechProfileModalOpen(false)}
                className="text-slate-400 hover:text-white text-xs font-bold bg-neutral-900 hover:bg-neutral-800 px-3 py-1.5 rounded-xl transition cursor-pointer border border-neutral-800"
              >
                Fechar
              </button>
            </div>

            {/* Stats section */}
            {(() => {
              const isTechnician = selectedTechProfile.role === "tecnico";

              if (isTechnician) {
                const techResolvedTickets = tickets.filter(t => getAssignedTechs(t.assignedTo).includes(selectedTechProfile.name) && (t.status === "Resolvido" || t.status === "Fechado"));
                const techActiveTickets = tickets.filter(t => getAssignedTechs(t.assignedTo).includes(selectedTechProfile.name) && t.status !== "Resolvido" && t.status !== "Fechado");
                const totalTechTickets = techResolvedTickets.length + techActiveTickets.length;

                // SLA compliance for this technician
                const techOverdue = techActiveTickets.filter(t => isTicketOverdue(t)).length;
                const techSlaCompliance = totalTechTickets > 0 ? Math.round(((totalTechTickets - techOverdue) / totalTechTickets) * 100) : 100;

                // Average resolution time (TMA)
                let techAvgResolutionTimeStr = "N/A";
                if (techResolvedTickets.length > 0) {
                  const totalMs = techResolvedTickets.reduce((sum, t) => {
                    if (t.createdAt && t.updatedAt) {
                      const duration = new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime();
                      return sum + (duration > 0 ? duration : 0);
                    }
                    return sum;
                  }, 0);
                  const avgMs = totalMs / techResolvedTickets.length;
                  const avgMinutes = avgMs / (1000 * 60);
                  if (avgMinutes < 1) {
                    techAvgResolutionTimeStr = `${Math.round(avgMs / 1000)}s`;
                  } else if (avgMinutes < 60) {
                    techAvgResolutionTimeStr = `${Math.round(avgMinutes)} min`;
                  } else {
                    const hours = Math.floor(avgMinutes / 60);
                    const mins = Math.round(avgMinutes % 60);
                    techAvgResolutionTimeStr = mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
                  }
                }

                return (
                  <>
                    <div className="grid grid-cols-3 gap-4 p-5 bg-black/40 border-b border-neutral-900">
                      <div className="bg-[#050505] border border-neutral-900 rounded-xl p-3 text-center">
                        <span className="text-[9px] font-bold text-slate-500 uppercase block tracking-wider mb-1">Resolvidos</span>
                        <span className="text-xl font-black text-emerald-400">{techResolvedTickets.length}</span>
                      </div>
                      <div className="bg-[#050505] border border-neutral-900 rounded-xl p-3 text-center">
                        <span className="text-[9px] font-bold text-slate-500 uppercase block tracking-wider mb-1">SLA Individual</span>
                        <span className="text-xl font-black text-white">{techSlaCompliance}%</span>
                      </div>
                      <div className="bg-[#050505] border border-neutral-900 rounded-xl p-3 text-center">
                        <span className="text-[9px] font-bold text-slate-500 uppercase block tracking-wider mb-1">Tempo Médio (TMA)</span>
                        <span className="text-xl font-black text-emerald-400">{techAvgResolutionTimeStr}</span>
                      </div>
                    </div>

                    <div className="px-6 py-4 bg-black/20 border-b border-neutral-900 flex items-center justify-between">
                      <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Aba de Chamados Resolvidos</span>
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-xl font-bold uppercase">
                        Histórico de Eficiência
                      </span>
                    </div>

                    {/* List Area */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-[250px] max-h-[45vh]">
                      {techResolvedTickets.length === 0 ? (
                        <div className="py-12 text-center text-slate-500 space-y-3">
                          <CheckCircle className="h-8 w-8 text-slate-700 mx-auto" />
                          <div>
                            <h4 className="text-xs font-bold text-slate-400">Nenhum chamado resolvido ainda</h4>
                            <p className="text-[10px] text-slate-500 mt-1">Este técnico ainda não finalizou nenhum chamado ou não há registros de atendimentos concluídos.</p>
                          </div>
                        </div>
                      ) : (
                        techResolvedTickets.map((ticket) => {
                          const priorityBorder = 
                            ticket.priority === "Urgente" ? "border-l-rose-500" :
                            ticket.priority === "Alta" ? "border-l-amber-500" :
                            ticket.priority === "Média" ? "border-l-emerald-500" : "border-l-neutral-700";

                          const priorityTextClass = 
                            ticket.priority === "Urgente" ? "text-rose-400" :
                            ticket.priority === "Alta" ? "text-amber-400" :
                            ticket.priority === "Média" ? "text-emerald-400" : "text-neutral-400";

                          return (
                            <div
                              key={ticket.id}
                              onClick={() => {
                                setSelectedTicketId(ticket.id);
                                setIsTechProfileModalOpen(false);
                              }}
                              className={`p-4 bg-black border border-neutral-900 rounded-xl flex flex-col sm:flex-row justify-between gap-3 hover:border-emerald-500/30 transition cursor-pointer group border-l-4 ${priorityBorder}`}
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] bg-neutral-900 text-slate-400 border border-neutral-800 px-1.5 py-0.2 rounded font-mono">
                                    #{ticket.id}
                                  </span>
                                  <span className="bg-emerald-950 text-emerald-400 border border-emerald-900/30 text-[9px] font-bold uppercase px-1.5 py-0.2 rounded">
                                    {ticket.status}
                                  </span>
                                  <span className="bg-neutral-900 text-slate-400 text-[9px] font-bold uppercase px-1.5 py-0.2 rounded">
                                    {ticket.category}
                                  </span>
                                </div>
                                <h4 className="text-xs font-bold text-neutral-200 group-hover:text-emerald-400 transition-colors line-clamp-1">{ticket.title}</h4>
                                <p className="text-[10px] text-neutral-500">
                                  Resolvido em: {new Date(ticket.updatedAt).toLocaleDateString("pt-BR")} às {new Date(ticket.updatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                </p>
                              </div>

                              <div className="flex sm:flex-col items-start sm:items-end justify-between sm:justify-center gap-1 flex-shrink-0 text-[10px]">
                                <span className={`font-bold uppercase ${priorityTextClass}`}>{ticket.priority}</span>
                                <span className="text-slate-500 font-medium">Solicitante: {ticket.requesterName}</span>
                                <span className="text-emerald-500 font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                  Ver Detalhes <ArrowRight className="h-3 w-3" />
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </>
                );
              } else {
                // For collaborators: list of all tickets requested by them
                const userTickets = tickets.filter(t => t.requesterName === selectedTechProfile.name);
                const userActiveTickets = userTickets.filter(t => t.status !== "Resolvido" && t.status !== "Fechado");
                const userResolvedTickets = userTickets.filter(t => t.status === "Resolvido" || t.status === "Fechado");

                return (
                  <>
                    <div className="grid grid-cols-3 gap-4 p-5 bg-black/40 border-b border-neutral-900">
                      <div className="bg-[#050505] border border-neutral-900 rounded-xl p-3 text-center">
                        <span className="text-[9px] font-bold text-slate-500 uppercase block tracking-wider mb-1">Total de Chamados</span>
                        <span className="text-xl font-black text-emerald-400">{userTickets.length}</span>
                      </div>
                      <div className="bg-[#050505] border border-neutral-900 rounded-xl p-3 text-center">
                        <span className="text-[9px] font-bold text-slate-500 uppercase block tracking-wider mb-1">Ativos</span>
                        <span className="text-xl font-black text-amber-400">{userActiveTickets.length}</span>
                      </div>
                      <div className="bg-[#050505] border border-neutral-900 rounded-xl p-3 text-center">
                        <span className="text-[9px] font-bold text-slate-500 uppercase block tracking-wider mb-1">Concluídos</span>
                        <span className="text-xl font-black text-emerald-400">{userResolvedTickets.length}</span>
                      </div>
                    </div>

                    <div className="px-6 py-4 bg-black/20 border-b border-neutral-900 flex items-center justify-between">
                      <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Histórico Geral de Chamados</span>
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-xl font-bold uppercase">
                        Linha do Tempo
                      </span>
                    </div>

                    {/* List Area */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-[250px] max-h-[45vh]">
                      {userTickets.length === 0 ? (
                        <div className="py-12 text-center text-slate-500 space-y-3">
                          <CheckCircle className="h-8 w-8 text-slate-700 mx-auto" />
                          <div>
                            <h4 className="text-xs font-bold text-slate-400">Nenhum chamado aberto ainda</h4>
                            <p className="text-[10px] text-slate-500 mt-1">Este colaborador ainda não registrou nenhum chamado de suporte.</p>
                          </div>
                        </div>
                      ) : (
                        userTickets.map((ticket) => {
                          const priorityBorder = 
                            ticket.priority === "Urgente" ? "border-l-rose-500" :
                            ticket.priority === "Alta" ? "border-l-amber-500" :
                            ticket.priority === "Média" ? "border-l-emerald-500" : "border-l-neutral-700";

                          const priorityTextClass = 
                            ticket.priority === "Urgente" ? "text-rose-400" :
                            ticket.priority === "Alta" ? "text-amber-400" :
                            ticket.priority === "Média" ? "text-emerald-400" : "text-neutral-400";

                          const isClosed = ticket.status === "Resolvido" || ticket.status === "Fechado";

                          return (
                            <div
                              key={ticket.id}
                              onClick={() => {
                                setSelectedTicketId(ticket.id);
                                setIsTechProfileModalOpen(false);
                              }}
                              className={`p-4 bg-black border border-neutral-900 rounded-xl flex flex-col sm:flex-row justify-between gap-3 hover:border-emerald-500/30 transition cursor-pointer group border-l-4 ${priorityBorder}`}
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] bg-neutral-900 text-slate-400 border border-neutral-800 px-1.5 py-0.2 rounded font-mono">
                                    #{ticket.id}
                                  </span>
                                  <span className={`border text-[9px] font-bold uppercase px-1.5 py-0.2 rounded ${
                                    isClosed 
                                      ? "bg-emerald-950 text-emerald-400 border-emerald-900/30" 
                                      : "bg-amber-950 text-amber-400 border-amber-900/30"
                                  }`}>
                                    {ticket.status}
                                  </span>
                                  <span className="bg-neutral-900 text-slate-400 text-[9px] font-bold uppercase px-1.5 py-0.2 rounded">
                                    {ticket.category}
                                  </span>
                                </div>
                                <h4 className="text-xs font-bold text-neutral-200 group-hover:text-emerald-400 transition-colors line-clamp-1">{ticket.title}</h4>
                                <p className="text-[10px] text-neutral-500">
                                  Criado em: {new Date(ticket.createdAt).toLocaleDateString("pt-BR")} às {new Date(ticket.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                </p>
                              </div>

                              <div className="flex sm:flex-col items-start sm:items-end justify-between sm:justify-center gap-1 flex-shrink-0 text-[10px]">
                                <span className={`font-bold uppercase ${priorityTextClass}`}>{ticket.priority}</span>
                                <span className="text-slate-500 font-medium">
                                  {ticket.assignedTo ? `Técnicos: ${ticket.assignedTo}` : "Sem técnico atribuído"}
                                </span>
                                <span className="text-emerald-500 font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                  Ver Detalhes <ArrowRight className="h-3 w-3" />
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </>
                );
              }
            })()}

            <div className="p-4 border-t border-neutral-900 bg-black/30 text-center text-[10px] text-slate-500">
              Clique em qualquer chamado para visualizar o histórico de soluções.
            </div>

          </div>
        </div>
      )}

      {/* Slide-over Modal: Create New Ticket */}
      {isNewTicketModalOpen && (
        <div 
          onClick={() => setIsNewTicketModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-[#0a0a0a] border border-neutral-900 w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 cursor-default"
          >
            
            {/* Modal Header */}
            <div className="p-5 border-b border-neutral-900 flex items-center justify-between bg-black/50">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-emerald-400" />
                <h3 className="font-display font-extrabold text-white text-base">Novo Chamado de Suporte</h3>
              </div>
              <button
                onClick={() => setIsNewTicketModalOpen(false)}
                className="text-slate-400 hover:text-white text-xs font-bold bg-neutral-900 hover:bg-neutral-800 border border-neutral-800/50 px-3 py-1.5 rounded-xl transition cursor-pointer"
              >
                Fechar
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateTicket} className="p-6 space-y-4">
              
              {/* Profile Context warning / Requester Info */}
              {currentSession.role === "tecnico" ? (
                <div className="bg-black/50 p-3.5 rounded-xl border border-neutral-900 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-slate-500 block text-[10px] uppercase tracking-wider font-bold">Solicitando como:</span>
                      <strong className="text-white text-sm">{selectedRequesterName || currentSession.name}</strong>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-500 block text-[10px] uppercase tracking-wider font-bold">Departamento:</span>
                      <span className="text-emerald-400 font-medium text-xs">{selectedRequesterDepartment || currentSession.department}</span>
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 flex items-center gap-1">
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
                      className="w-full bg-black border border-neutral-800 rounded-lg py-2 px-2.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500 transition-all cursor-pointer"
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
                <div className="bg-black/50 p-3 rounded-xl border border-neutral-900 text-xs text-slate-300 flex items-center justify-between">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Solicitando como:</span>
                    <strong className="text-white">{currentSession.name}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Departamento:</span>
                    <span className="text-emerald-400 font-medium">{currentSession.department}</span>
                  </div>
                </div>
              )}

              {/* Title input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400">Título do Chamado *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Impressora do faturamento não liga"
                  value={newTicketForm.title}
                  onChange={(e) => setNewTicketForm({ ...newTicketForm, title: e.target.value })}
                  className="w-full bg-black border border-neutral-900 rounded-xl py-2 px-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                />
              </div>

              {/* Description input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400">Descrição Detalhada *</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Forneça o máximo de detalhes possível. Ex: Marca/Modelo do equipamento, mensagem de erro exibida, tentativas já feitas, se o problema afeta mais pessoas."
                  value={newTicketForm.description}
                  onChange={(e) => setNewTicketForm({ ...newTicketForm, description: e.target.value })}
                  className="w-full bg-black border border-neutral-900 rounded-xl py-2 px-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all resize-none"
                />
              </div>

              {/* Tipo de Atendimento selection */}
              {currentSession.role === "tecnico" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
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
                      className="w-full bg-black border border-neutral-900 rounded-xl py-2 px-3 text-xs text-slate-300 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all cursor-pointer"
                    >
                      <option value="chamado">Chamado Padrão</option>
                      <option value="projeto">Projeto em Andamento</option>
                    </select>
                  </div>

                  {/* If "projeto" is selected, show the date picker for deadline */}
                  {!!newTicketForm.projectDeadline && (
                    <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-150">
                      <label className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
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
                <label className="text-xs font-bold text-slate-400 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Camera className="h-3.5 w-3.5 text-emerald-400" />
                    Anexar Prints / Imagens / PDFs (Opcional)
                  </span>
                  <span className="text-[10px] text-neutral-500 font-normal">
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
                  className="border border-dashed border-neutral-900 hover:border-emerald-500/20 bg-black hover:bg-[#070707] transition rounded-xl p-4 text-center cursor-pointer relative group"
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
                  <Upload className="h-5 w-5 text-slate-500 group-hover:text-emerald-400 mx-auto mb-1.5 transition-colors" />
                  <p className="text-[11px] text-slate-400 font-medium">
                    Clique para selecionar ou <span className="text-emerald-400">arraste e solte</span> arquivos aqui
                  </p>
                  <p className="text-[9px] text-slate-500 mt-0.5">
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
                        <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-neutral-900/40 border border-neutral-900 hover:border-neutral-800 transition">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {isImage ? (
                              <div className="w-8 h-8 rounded-lg overflow-hidden border border-neutral-850 flex-shrink-0 bg-black flex items-center justify-center">
                                <img src={file.url} alt={file.name} className="w-full h-full object-cover" />
                              </div>
                            ) : (
                              <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center bg-black border border-neutral-850 ${isPdf ? "text-red-400" : "text-emerald-400"}`}>
                                <FileText className="h-4 w-4" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-semibold text-slate-300 truncate animate-pulse-once" title={file.name}>
                                {file.name}
                              </p>
                              <p className="text-[9px] text-slate-500 capitalize">
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
              <div className="pt-4 flex items-center justify-end gap-3 border-t border-neutral-900">
                <button
                  type="button"
                  onClick={() => setIsNewTicketModalOpen(false)}
                  className="px-4 py-2 bg-[#151515] hover:bg-[#202020] text-slate-300 font-semibold rounded-xl text-xs border border-neutral-900 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTicket}
                  className="px-5 py-2 bg-emerald-400 hover:bg-emerald-300 text-black font-extrabold rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-neon hover:shadow-neon-lg"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-[#0a0a0a] border border-neutral-900 w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 cursor-default"
          >
            <div className="p-5 border-b border-neutral-900 bg-black/50 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-rose-400" />
              <h3 className="font-display font-extrabold text-white text-sm">Excluir Conta do Colaborador</h3>
            </div>
            
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-300 leading-relaxed">
                Tem certeza que deseja excluir o colaborador <strong className="text-white">{deletingUser.name}</strong>?
              </p>
              <div className="p-3 bg-black/50 border border-neutral-900 rounded-xl space-y-1">
                <div className="text-[10px] text-slate-500">Setor / Departamento:</div>
                <div className="text-xs text-slate-200 font-bold">{deletingUser.department}</div>
                <div className="text-[10px] text-slate-500 mt-2">E-mail Corporativo:</div>
                <div className="text-xs text-slate-200 font-mono">{deletingUser.email}</div>
              </div>
              <p className="text-[10px] text-rose-400/90 italic">
                Aviso: Esta ação é permanente e removerá todas as credenciais de acesso deste usuário.
              </p>
            </div>

            <div className="p-4 bg-black/20 border-t border-neutral-900 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                className="px-4 py-2 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-slate-300 font-semibold rounded-xl text-xs transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteUser}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition cursor-pointer"
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
            return (
              <div
                key={notif.id}
                onClick={() => {
                  setSelectedTicketId(notif.ticketId);
                  setActiveTab("painel");
                  // Clear this notification on click
                  setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
                }}
                className={`bg-[#05090e]/95 border-2 ${isComment ? 'border-cyan-500/80 hover:border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.25)]' : 'border-emerald-500/80 hover:border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.25)]'} text-white rounded-2xl p-4 flex flex-col pointer-events-auto cursor-pointer animate-in slide-in-from-bottom duration-300 hover:scale-[1.02] transition-all duration-200 group`}
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
                    className="text-slate-400 hover:text-white transition-colors p-1 -m-1 focus:outline-none flex items-center justify-center"
                    title="Fechar"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                
                <h4 className={`font-display font-extrabold text-sm mt-2 text-slate-100 ${isComment ? 'group-hover:text-cyan-300' : 'group-hover:text-emerald-300'} transition-colors line-clamp-1`}>
                  {notif.title}
                </h4>

                {isComment && notif.commentText && (
                  <p className="text-slate-300 text-xs mt-1.5 bg-black/40 border border-neutral-900/40 px-2.5 py-2 rounded-xl italic line-clamp-2 leading-relaxed">
                    "{notif.commentText}"
                  </p>
                )}
                
                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-neutral-900 text-xs">
                  <span className="text-slate-400 font-mono text-[10px]">
                    {isComment ? "Por: " : "De: "}<span className="text-slate-200 font-sans font-semibold">{isComment ? notif.commentAuthor : notif.requesterName}</span>
                  </span>
                  <span className="text-[9px] text-slate-500 font-mono">
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
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/95 backdrop-blur-md p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewImage(null)}
        >
          {/* Top toolbar */}
          <div className="w-full max-w-5xl flex items-center justify-between mb-4 px-2 select-none" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-emerald-400" />
              <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">Visualização do Anexo</span>
            </div>
            <div className="flex items-center gap-3">
              <a 
                href={previewImage} 
                download="screenshot.png"
                className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-slate-300 font-bold rounded-xl text-[10px] uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5"
              >
                Download
              </a>
              <button
                onClick={() => setPreviewImage(null)}
                className="p-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-slate-400 hover:text-white transition cursor-pointer flex items-center justify-center"
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
              className="max-w-full max-h-[80vh] object-contain rounded-2xl border border-neutral-900 shadow-2xl animate-in zoom-in-95 duration-200"
            />
          </div>

          <p className="text-[10px] text-slate-500 font-medium uppercase mt-4 select-none">Clique em qualquer lugar fora para fechar</p>
        </div>
      )}

      {preloaderJSX}
    </div>
  );
}
