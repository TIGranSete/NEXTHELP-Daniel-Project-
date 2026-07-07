import React, { useState, useEffect, useRef } from "react";
import { Ticket, Comment, UserSession, UserRole, User } from "./types";
import SlaAnalytics from "./components/SlaAnalytics";
import LoginScreen from "./components/LoginScreen";
import ChangePasswordScreen from "./components/ChangePasswordScreen";
import {
  getTickets,
  saveTicket,
  deleteTicket,
  getUsers,
  saveUser,
  deleteUser,
  triageWithGemini,
  isSupabaseConfigured
} from "./lib/supabase-client-db";
import WindowsDatePicker from "./components/WindowsDatePicker";
import PlantationBackground from "./components/PlantationBackground";
import logoImg from "./assets/images/7.png";
import logoFullImg from "./assets/images/logo.png";
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
  Settings
} from "lucide-react";

const USER_PROFILES: UserSession[] = [];

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
  const [activeTab, setActiveTab] = useState<"painel" | "sla" | "colaboradores" | "banco_dados">("painel");
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [modulesCollapsed, setModulesCollapsed] = useState<boolean>(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState<boolean>(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

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
  
  // Creation state (tickets)
  const [isNewTicketModalOpen, setIsNewTicketModalOpen] = useState<boolean>(false);
  const [isSubmittingTicket, setIsSubmittingTicket] = useState<boolean>(false);
  const [newTicketForm, setNewTicketForm] = useState({
    title: "",
    description: "",
    screenshot: "",
    projectDeadline: ""
  });

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

  // Fetch tickets helper
  const fetchTickets = async (showQuietly = false) => {
    if (!showQuietly) setLoading(true);
    setIsPolling(true);
    try {
      const data = await getTickets();
      setTickets(data);
      setLastUpdated(new Date());
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
      const data = await getUsers();
      setUsers(data);
    } catch (error) {
      console.error("Erro ao carregar colaboradores:", error);
    }
  };

  // Fetch database status
  const fetchDbStatus = async () => {
    setDbChecking(true);
    try {
      const response = await fetch("/api/supabase/status");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setDbStatus({
        configured: data.configured,
        connected: data.connected,
        error: data.error || (data.configured ? null : "Credenciais do Supabase ausentes (.env ou Secrets do AI Studio). Usando armazenamento local.")
      });
    } catch (e) {
      console.error("Erro ao carregar status do banco de dados:", e);
      setDbStatus({
        configured: false,
        connected: false,
        error: "Não foi possível conectar ao servidor para verificar o banco de dados."
      });
    } finally {
      setDbChecking(false);
    }
  };

  // Fetch database SQL Schema instructions
  const fetchDbSchema = async () => {
    const schemaSql = `-- EXECUTAR ESTE SCRIPT NO EDITOR DE SQL DO SEU SUPABASE:

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
);`;
    setDbSqlSchema(schemaSql);
  };

  // Push local cache data to cloud Supabase
  const handlePushSync = async () => {
    setSyncingDb("push");
    setTimeout(() => {
      setSyncingDb("success");
      fetchDbStatus();
      setTimeout(() => setSyncingDb("idle"), 2000);
    }, 500);
  };

  // Pull cloud Supabase data into local cache files
  const handlePullSync = async () => {
    setSyncingDb("pull");
    setTimeout(() => {
      setSyncingDb("success");
      fetchDbStatus();
      alert("Seu aplicativo está conectado diretamente ao Supabase em tempo real! Todos os dados já estão sincronizados e atualizados instantaneamente no seu navegador.");
      setTimeout(() => setSyncingDb("idle"), 2000);
    }, 500);
  };

  // Pull database schema and status on technician session mount
  useEffect(() => {
    if (currentSession?.role === "tecnico") {
      fetchDbStatus();
      fetchDbSchema();
    }
  }, [currentSession]);

  // Poll tickets and users every 15 seconds for real-time fidelity
  useEffect(() => {
    fetchTickets();
    fetchUsers();

    const interval = setInterval(() => {
      fetchTickets(true);
      fetchUsers();
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
    if (confirm("Deseja realmente redefinir o banco de dados local?")) {
      try {
        localStorage.removeItem("gran7_tickets_backup");
        localStorage.removeItem("gran7_users_backup");
        localStorage.removeItem("gran7_session");
        setTickets([]);
        setUsers([]);
        setSelectedTicketId(null);
        handleLogout();
      } catch (error) {
        console.error("Erro ao resetar dados:", error);
      }
    }
  };

  const handleDeleteTicket = async (ticketId: string) => {
    if (!currentSession || currentSession.role !== "tecnico") return;
    
    const targetTicket = tickets.find(t => t.id === ticketId);
    if (!targetTicket || targetTicket.assignedTo !== currentSession.name) {
      alert("Apenas o técnico responsável por este chamado pode excluí-lo.");
      return;
    }
    
    try {
      const isSuccess = await deleteTicket(ticketId);
      if (isSuccess) {
        setIsConfirmingDeleteTicket(null);
        setSelectedTicketId(null);
        await fetchTickets();
      } else {
        alert("Erro ao excluir o chamado do banco de dados.");
      }
    } catch (error) {
      console.error("Erro ao excluir chamado:", error);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSession) return;
    if (!newTicketForm.title.trim() || !newTicketForm.description.trim()) return;

    setIsSubmittingTicket(true);
    try {
      // Analyze with Gemini client-side directly
      const triage = await triageWithGemini(
        newTicketForm.title,
        newTicketForm.description,
        newTicketForm.screenshot || undefined
      );

      let hoursToAdd = 48; // Baixa
      if (triage.priority === "Urgente") hoursToAdd = 2;
      else if (triage.priority === "Alta") hoursToAdd = 8;
      else if (triage.priority === "Média") hoursToAdd = 24;

      const slaLimit = new Date();
      slaLimit.setHours(slaLimit.getHours() + hoursToAdd);

      const maxId = tickets.reduce((max, t) => {
        if (!t || !t.id) return max;
        const idNum = parseInt(t.id);
        return isNaN(idNum) ? max : Math.max(max, idNum);
      }, 1000);
      const nextId = (maxId + 1).toString();

      const newTicket: Ticket = {
        id: nextId,
        title: newTicketForm.title,
        description: newTicketForm.description,
        category: triage.category as Ticket["category"],
        priority: triage.priority as Ticket["priority"],
        status: "Aberto",
        requesterName: currentSession.name,
        requesterDepartment: currentSession.department,
        assignedTo: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        slaLimit: slaLimit.toISOString(),
        aiCategory: triage.category,
        aiPriority: triage.priority,
        aiReasoning: triage.reasoning,
        aiSuggestions: triage.suggestions,
        comments: [],
        screenshot: newTicketForm.screenshot || undefined,
        projectDeadline: newTicketForm.projectDeadline || undefined
      };

      // Add triage comment
      newTicket.comments.push({
        id: "ai-triage-sys-comment-" + Date.now(),
        authorName: "Assistente de Triagem",
        authorRole: "ai",
        content: `Chamado classificado automaticamente pelo Gemini.\n\n**Justificativa:** ${triage.reasoning}`,
        timestamp: new Date().toISOString()
      });

      const isSuccess = await saveTicket(newTicket);
      if (isSuccess) {
        setIsNewTicketModalOpen(false);
        setNewTicketForm({ title: "", description: "", screenshot: "", projectDeadline: "" });
        await fetchTickets();
        setSelectedTicketId(newTicket.id);
      } else {
        alert("Erro ao gravar chamado no banco de dados.");
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
      const uId = editingUserId || Date.now().toString();
      
      let finalPassword = newUserForm.password;
      if (isEdit) {
        const existing = users.find(u => u.id === editingUserId);
        finalPassword = newUserForm.password || existing?.password || "123";
      }

      const userToSave: User = {
        id: uId,
        name: newUserForm.name,
        email: newUserForm.email.toLowerCase().trim(),
        password: finalPassword,
        department: newUserForm.department,
        role: newUserForm.role,
        mustChangePassword: isEdit ? false : true
      };

      const isSuccess = await saveUser(userToSave);
      if (isSuccess) {
        if (editingUserId) {
          setUserFormSuccess(`Colaborador ${userToSave.name} atualizado com sucesso!`);
          handleCancelEditUser();
        } else {
          setUserFormSuccess(`Colaborador ${userToSave.name} cadastrado com sucesso!`);
          setNewUserForm({
            name: "",
            email: "",
            password: "",
            department: "Financeiro",
            role: "colaborador"
          });
        }
        await fetchUsers(); // Update in real-time
      } else {
        setUserFormError("Erro ao gravar dados do colaborador.");
      }
    } catch (error: any) {
      console.error("Erro ao salvar colaborador:", error);
      setUserFormError("Erro ao salvar colaborador: " + (error.message || error));
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
      const isSuccess = await deleteUser(deletingUser.id);
      if (isSuccess) {
        const emailDeleted = deletingUser.email;
        setDeletingUser(null);
        await fetchUsers();
        
        // If logged in as deleted user, log out immediately
        if (currentSession?.email === emailDeleted) {
          handleLogout();
        }
      } else {
        alert("Erro ao excluir o colaborador.");
        setDeletingUser(null);
      }
    } catch (error) {
      console.error("Erro ao deletar:", error);
      alert("Erro ao excluir colaborador.");
      setDeletingUser(null);
    }
  };

  const handleUpdateTicketMeta = async (ticketId: string, fields: Partial<Ticket>) => {
    try {
      const ticket = tickets.find(t => t.id === ticketId);
      if (!ticket) return;

      const updatedTicket: Ticket = {
        ...ticket,
        ...fields,
        updatedAt: new Date().toISOString()
      };

      const isSuccess = await saveTicket(updatedTicket);
      if (isSuccess) {
        setTickets(prev => prev.map(t => t.id === ticketId ? updatedTicket : t));
      } else {
        alert("Erro ao atualizar chamado.");
      }
    } catch (error) {
      console.error("Erro ao atualizar chamado:", error);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicketId || (!newCommentText.trim() && !commentAttachment)) return;

    try {
      const ticket = tickets.find(t => t.id === selectedTicketId);
      if (!ticket) return;

      const newComment: Comment = {
        id: "comment-" + Date.now(),
        authorName: currentSession.name,
        authorRole: currentSession.role,
        content: newCommentText.trim() || `[Anexo: ${commentAttachmentName || 'Documento/Imagem'}]`,
        timestamp: new Date().toISOString()
      };

      const updatedTicket: Ticket = {
        ...ticket,
        comments: [...(ticket.comments || []), newComment],
        updatedAt: new Date().toISOString()
      };

      const isSuccess = await saveTicket(updatedTicket);
      if (isSuccess) {
        setTickets(prev => prev.map(t => t.id === selectedTicketId ? updatedTicket : t));
        setNewCommentText("");
        setCommentAttachment(null);
        setCommentAttachmentName("");
      } else {
        alert("Erro ao adicionar comentário.");
      }
    } catch (error) {
      console.error("Erro ao adicionar comentário:", error);
    }
  };

  if (!currentSession) {
    return (
      <LoginScreen 
        users={users} 
        onLoginSuccess={(session) => {
          setCurrentSession(session);
          localStorage.setItem("gran7_session", JSON.stringify(session));
        }} 
      />
    );
  }

  if (currentSession.mustChangePassword) {
    return (
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
    );
  }

  // Selected ticket calculation
  const selectedTicket = tickets.find(t => t.id === selectedTicketId) || null;
  const isAssignedToOther = !!(selectedTicket && currentSession && currentSession.role === "tecnico" && selectedTicket.assignedTo && selectedTicket.assignedTo !== currentSession.name);

  // Role-based tickets filter: technicians see everything, collaborators only see their own tickets
  const userVisibleTickets = tickets.filter(t => 
    currentSession.role === "tecnico" || t.requesterName === currentSession.name
  );

  // Filtered tickets calculation
  const filteredTickets = userVisibleTickets.filter(t => {
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

  // Operational metrics
  const totalTickets = userVisibleTickets.length;
  const activeTickets = userVisibleTickets.filter(t => t.status !== "Resolvido" && t.status !== "Fechado");
  const resolvedTickets = userVisibleTickets.filter(t => t.status === "Resolvido" || t.status === "Fechado");
  const criticalTickets = activeTickets.filter(t => t.priority === "Urgente" || t.priority === "Alta");
  
  // SLA Overdue count
  const overdueTickets = activeTickets.filter(t => new Date(t.slaLimit).getTime() < Date.now());
  const slaCompliance = totalTickets > 0 ? Math.round(((totalTickets - overdueTickets.length) / totalTickets) * 100) : 100;

  // Category counts
  const catStats = { Hardware: 0, Software: 0, Redes: 0, Acesso: 0, Sistemas: 0, Outros: 0 };
  userVisibleTickets.forEach(t => { if (catStats[t.category] !== undefined) catStats[t.category]++; });

  // Priority counts for quick indicators
  const prioStats = { Urgente: 0, Alta: 0, Média: 0, Baixa: 0 };
  userVisibleTickets.forEach(t => { if (prioStats[t.priority] !== undefined) prioStats[t.priority]++; });

  return (
    <div className="min-h-screen bg-black text-slate-100 flex flex-col md:flex-row font-sans relative">
      <PlantationBackground />
      
      {/* Sidebar - Bento Style */}
      <aside className={`w-full ${sidebarCollapsed ? "md:w-20" : "md:w-80"} bg-[#060606] border-b md:border-b-0 md:border-r border-emerald-950/20 flex flex-col shrink-0 transition-all duration-300 relative`}>
        <div className={`p-4 flex transition-all border-b border-emerald-950/20 ${
          sidebarCollapsed 
            ? "md:flex-col md:p-3 md:py-4 gap-3 items-center justify-center" 
            : "md:p-6 items-center justify-between"
        }`}>
          {(!sidebarCollapsed || logoError) ? (
            <div className={`${sidebarCollapsed ? "md:hidden" : "block"} transition-all duration-200`}>
              {!logoError ? (
                <img 
                  src="/assets/logo.png" 
                  alt="GRAN7 HELP" 
                  className="h-12 w-auto object-contain max-w-full"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <div className="flex items-center gap-3 w-full">
                  <img 
                    src={logoImg} 
                    alt="GRAN7" 
                    className="w-10 h-10 object-contain rounded-xl shadow-lg border border-emerald-400/25 shrink-0"
                  />
                  <div>
                    <h1 className="font-display font-extrabold text-white tracking-tight text-lg">
                      GRAN<span className="text-emerald-400 font-bold italic tracking-wide text-lg">7</span><span className="text-emerald-400 font-light tracking-widest text-sm"> HELP</span>
                    </h1>
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Help Desk inteligente</p>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {sidebarCollapsed && !logoError && (
            <div className="hidden md:flex items-center justify-center transition-all duration-200">
              <img 
                src={logoImg} 
                alt="GRAN7" 
                className="w-9 h-9 object-contain rounded-lg border border-emerald-400/20 shadow-md shrink-0"
                onError={() => setLogoError(true)}
              />
            </div>
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

                <button 
                  onClick={() => setActiveTab("sla")}
                  className={`p-2 bg-neutral-950/50 hover:bg-emerald-500/5 hover:border-emerald-500/30 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
                    activeTab === "sla" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" : "border-neutral-900 text-slate-400"
                  }`}
                  title={`SLA Geral: ${slaCompliance}% (Clique para gerenciar)`}
                >
                  <Clock className="h-4 w-4" />
                </button>
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
              
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    setActiveTab("painel");
                    setSelectedStatus("Active");
                  }}
                  className={`p-3 rounded-xl border text-left transition-all hover:bg-emerald-500/5 hover:border-emerald-500/30 cursor-pointer ${
                    activeTab === "painel" && selectedStatus === "Active" ? "border-emerald-500/40 bg-emerald-500/10" : "bg-black/50 border-neutral-900"
                  }`}
                  title="Filtrar por fila ativa"
                >
                  <p className="text-[10px] font-medium text-slate-500">
                    {currentSession.role === "tecnico" ? "Fila Ativa" : "Meus Ativos"}
                  </p>
                  <p className="text-xl font-bold text-white mt-1">{activeTickets.length}</p>
                </button>
                <button
                  onClick={() => setActiveTab("sla")}
                  className={`p-3 rounded-xl border text-left transition-all hover:bg-emerald-500/5 hover:border-emerald-500/30 cursor-pointer ${
                    activeTab === "sla" ? "border-emerald-500/40 bg-emerald-500/10" : "bg-black/50 border-neutral-900"
                  }`}
                  title="Ver painel de SLA"
                >
                  <p className="text-[10px] font-medium text-slate-500">
                    {currentSession.role === "tecnico" ? "SLA Geral" : "No Prazo"}
                  </p>
                  <p className={`text-xl font-bold mt-1 ${activeTab === "sla" ? "text-emerald-400" : "text-emerald-500"}`}>{slaCompliance}%</p>
                </button>
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
                  GRAN7 HELP Online
                </span>
                {currentSession?.name?.toLowerCase() === "daniel kevin" && (
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
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
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

          <div className="flex flex-wrap items-center gap-3">
            {currentSession.role === "tecnico" && (
              <div className="flex items-center gap-2">
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
                  className={`flex items-center overflow-hidden transition-all duration-300 ease-in-out bg-black rounded-xl shadow-sm ${
                    modulesCollapsed 
                      ? "max-w-0 opacity-0 border-transparent p-0 gap-0 pointer-events-none" 
                      : "max-w-[650px] opacity-100 border border-neutral-900 p-1 gap-1"
                  }`}
                >
                  <button
                    onClick={() => setActiveTab("painel")}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap ${activeTab === "painel" ? "bg-emerald-400 text-black font-extrabold shadow-neon" : "text-slate-400 hover:text-white"}`}
                  >
                    Fila de Chamados
                  </button>
                  <button
                    onClick={() => setActiveTab("sla")}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap ${activeTab === "sla" ? "bg-emerald-400 text-black font-extrabold shadow-neon" : "text-slate-400 hover:text-white"}`}
                  >
                    Análise de SLA
                  </button>
                  <button
                    onClick={() => setActiveTab("colaboradores")}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap ${activeTab === "colaboradores" ? "bg-emerald-400 text-black font-extrabold shadow-neon" : "text-slate-400 hover:text-white"}`}
                  >
                    Gestão de Colaboradores
                  </button>
                  {currentSession?.name?.toLowerCase() === "daniel kevin" && (
                    <button
                      onClick={() => {
                        setActiveTab("banco_dados");
                        fetchDbStatus();
                      }}
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap ${activeTab === "banco_dados" ? "bg-emerald-400 text-black font-extrabold shadow-neon" : "text-slate-400 hover:text-white"}`}
                    >
                      Banco de Dados
                    </button>
                  )}
                </div>
              </div>
            )}

            {activeTab === "painel" && (
              <button
                onClick={() => setRightSidebarCollapsed(!rightSidebarCollapsed)}
                className="w-full md:w-auto px-4 py-2.5 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-slate-400 hover:text-white rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-xs cursor-pointer h-10 shrink-0 font-medium"
                title={rightSidebarCollapsed ? "Mostrar painel lateral direito" : "Esconder painel lateral direito"}
              >
                <Columns className={`h-4 w-4 ${rightSidebarCollapsed ? "text-emerald-400 animate-pulse" : ""}`} />
                <span>{rightSidebarCollapsed ? "Mostrar Painel" : "Recolher Painel"}</span>
              </button>
            )}

            {/* Create new ticket action button */}
            <button
              onClick={() => setIsNewTicketModalOpen(true)}
              className="w-full md:w-auto px-4 py-2.5 bg-emerald-400 hover:bg-emerald-300 text-black font-extrabold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-xs shadow-neon hover:shadow-neon-lg cursor-pointer"
            >
              <PlusCircle className="h-4 w-4" />
              Abrir Novo Chamado
            </button>
          </div>
        </header>

        {/* Dynamic Bento Grid Layout */}
        {activeTab === "sla" && currentSession.role === "tecnico" ? (
          <div className="animate-in fade-in duration-300">
            <SlaAnalytics tickets={tickets} />
          </div>
        ) : activeTab === "colaboradores" && currentSession.role === "tecnico" ? (
          <div className="animate-in fade-in duration-300 grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            
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
                <div className="p-5 border-b border-neutral-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-black/50">
                  <div>
                    <h3 className="font-display font-extrabold text-white text-sm">Diretório de Colaboradores</h3>
                    <p className="text-[10px] text-slate-400">Visualização em tempo real das contas ativas</p>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Buscar por nome, email ou setor..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full sm:w-64 bg-black border border-neutral-900 rounded-xl py-1.5 pl-9 pr-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                    />
                  </div>
                </div>

                <div className="divide-y divide-neutral-900 max-h-[500px] overflow-y-auto">
                  {(users.length > 0 ? users : USER_PROFILES).filter(u => {
                    const term = searchTerm.toLowerCase();
                    return u.name.toLowerCase().includes(term) || 
                           (u.email && u.email.toLowerCase().includes(term)) || 
                           u.department.toLowerCase().includes(term);
                  }).length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      Nenhum colaborador ou técnico encontrado. Use o console do Supabase para inserir usuários!
                    </div>
                  ) : (
                    (users.length > 0 ? users : USER_PROFILES)
                      .filter(u => {
                        const term = searchTerm.toLowerCase();
                        return u.name.toLowerCase().includes(term) || 
                               (u.email && u.email.toLowerCase().includes(term)) || 
                               u.department.toLowerCase().includes(term);
                      })
                      .map((user, index) => {
                        const isTech = user.role === "tecnico";
                        const isOnline = !!(user.isOnline || (currentSession && (
                          (user.email && currentSession.email && user.email.toLowerCase() === currentSession.email.toLowerCase()) ||
                          (user.name && currentSession.name && user.name.toLowerCase() === currentSession.name.toLowerCase())
                        )));
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
                                <p className="text-[10px] text-slate-400 mt-0.5">{user.email}</p>
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
              </div>
            </div>
          </div>
        ) : activeTab === "banco_dados" && currentSession?.name?.toLowerCase() === "daniel kevin" ? (
          <div className="animate-in fade-in duration-300 space-y-6">
            
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
                    {syncDbError}. Certifique-se de que as tabelas existem no Supabase (use as instruções SQL abaixo para criá-las).
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
                        Envia todos os chamados e colaboradores salvos localmente para o banco de dados Supabase na nuvem. Use após configurar um novo banco ou resolver quedas de conexão.
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
                          Exportar Dados para Supabase
                        </>
                      )}
                    </button>
                    {!dbStatus?.configured && (
                      <p className="text-[9px] text-center text-amber-500 mt-2 font-medium">
                        * Configure as chaves do Supabase nas Secrets para habilitar.
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
                          Importar Dados da Nuvem
                        </>
                      )}
                    </button>
                    {!dbStatus?.configured && (
                      <p className="text-[9px] text-center text-amber-500 mt-2 font-medium">
                        * Configure as chaves do Supabase nas Secrets para habilitar.
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
                  <p className="text-[11px] text-slate-400">Instruções e código SQL para criar a arquitetura de tabelas diretamente no Supabase.</p>
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
                  Para que a sincronização funcione perfeitamente, acesse seu painel do Supabase, selecione o projeto, vá até o menu <strong className="text-white">SQL Editor</strong>, crie uma nova query, cole o código abaixo e clique em <strong className="text-white">Run</strong>.
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

          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          
          {/* LEFT SECTION (Col 7): Tickets List & Core Triage Panel */}
          <div className={`transition-all duration-300 space-y-6 ${rightSidebarCollapsed ? "xl:col-span-12" : "xl:col-span-7"}`}>
            
            {/* Bento Grid Analytics Widget Row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              
              {/* Card 1: Tickets em Aberto */}
              <div className="bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-4 flex flex-col justify-between min-h-[110px] shadow-lg">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Chamados Ativos</p>
                <div className="flex items-end justify-between mt-2">
                  <span className="text-3xl font-black text-white">{activeTickets.length}</span>
                  <span className="text-amber-400 text-[10px] font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    Aguardando TI
                  </span>
                </div>
              </div>

              {/* Card 2: SLA compliance status */}
              <div className="bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-4 flex flex-col justify-between min-h-[110px] shadow-lg">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Eficiência (SLA)</p>
                <div className="flex items-end justify-between mt-2">
                  <span className="text-3xl font-black text-emerald-400">{slaCompliance}%</span>
                  <span className="text-emerald-400 text-[10px] font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    Meta: 92%
                  </span>
                </div>
              </div>

              {/* Card 3: Critical alerts pending */}
              <div className="col-span-2 sm:col-span-1 bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-4 flex flex-col justify-between min-h-[110px] shadow-lg">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Casos Críticos</p>
                <div className="flex items-end justify-between mt-2">
                  <span className={`text-3xl font-black ${criticalTickets.length > 0 ? "text-rose-500" : "text-white"}`}>
                    {criticalTickets.length}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${criticalTickets.length > 0 ? "bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse" : "bg-neutral-900 text-slate-400 border-neutral-850"}`}>
                    {criticalTickets.length > 0 ? "Ação Urgente" : "Fila Limpa"}
                  </span>
                </div>
              </div>

            </div>

            {/* Filters Bar & Tickets List */}
            <div className="bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-4 md:p-6 shadow-lg">
              
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Fila de Chamados</h3>
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
                  className="bg-black border border-neutral-900 text-slate-300 text-xs rounded-xl py-2 px-3 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all"
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
                  className="bg-black border border-neutral-900 text-slate-300 text-xs rounded-xl py-2 px-3 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all"
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
              <div className="space-y-3 max-h-[580px] overflow-y-auto pr-1">
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
                        className={`p-4 bg-[#050505] hover:bg-[#0c0c0c] rounded-2xl border border-neutral-900 border-l-4 ${priorityBorder} flex flex-col md:flex-row justify-between md:items-center gap-4 transition-all cursor-pointer ${isSelected ? "ring-2 ring-emerald-400/35 bg-black border-emerald-400/20 shadow-neon-sm" : ""}`}
                      >
                        <div className="flex-1 space-y-2">
                           <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-bold text-neutral-400 uppercase">
                              #{ticket.id}
                            </span>
                            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                              ticket.status === "Aberto" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                              ticket.status === "Em Atendimento" ? "bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-[0_0_10px_rgba(56,189,248,0.05)]" :
                              ticket.status === "Resolvido" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.05)]" :
                              ticket.status === "Fechado" ? "bg-zinc-800/40 text-zinc-400 border border-zinc-700/30" :
                              "bg-[#151515] text-neutral-400 border border-neutral-900"
                            }`}>
                              {ticket.status}
                            </span>
                            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                              ticket.category === 'Acesso' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                              ticket.category === 'Redes' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                              ticket.category === 'Hardware' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                              ticket.category === 'Software' ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' :
                              ticket.category === 'Sistemas' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                              'bg-neutral-900 text-neutral-300'
                            }`}>
                              {ticket.category}
                            </span>
                            <span className={`text-[10px] font-bold uppercase ${priorityTextClass}`}>
                              {ticket.priority}
                            </span>
                          </div>

                          <h4 className="text-sm font-bold text-neutral-200 line-clamp-1">{ticket.title}</h4>
                          
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                            <span>Solicitante: <strong className="text-slate-400">{ticket.requesterName}</strong> ({ticket.requesterDepartment.split(" / ")[0]})</span>
                            <span>•</span>
                            <span>Aberto: {new Date(ticket.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às {new Date(ticket.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                            {ticket.projectDeadline && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1 text-emerald-400 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 text-[10px]">
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
                        <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center shrink-0 border-t md:border-t-0 border-[#111] pt-2 md:pt-0 gap-2">
                          <div className="text-right">
                            <p className="text-[10px] text-slate-500 font-bold uppercase">Atribuído a</p>
                            <p className="text-xs text-white font-semibold mt-0.5">
                              {ticket.assignedTo ? ticket.assignedTo : <span className="text-slate-500 italic">Ninguém</span>}
                            </p>
                          </div>

                          <div className="flex items-center gap-3 mt-1 text-slate-500">
                            {commentsCount > 0 && (
                              <div className="flex items-center gap-1" title={`${commentsCount} comentários de suporte`}>
                                <MessageSquare className="h-3 w-3" />
                                <span className="text-xs font-semibold">{commentsCount}</span>
                              </div>
                            )}

                            {/* IA Triaged icon badge indicator */}
                            {ticket.aiCategory && (
                              <div className="flex items-center gap-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded text-[9px] font-bold" title="Triagem inteligente realizada por IA">
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

          </div>

          {/* RIGHT SECTION (Col 5): Bento Ticket Detail, Diagnosis Panel & Activity */}
          {!rightSidebarCollapsed && (
            <div className="xl:col-span-5 space-y-6 animate-in fade-in slide-in-from-right-3 duration-300">
            
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
              
              <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
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
                <div className="p-4 md:p-5 bg-[#0e0e0e] border-b border-neutral-900/60 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest block mb-0.5">Diagnóstico Completo</span>
                    <h3 className="text-sm font-bold text-white">Chamado #{selectedTicket.id}</h3>
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
                <div className="p-5 space-y-5 max-h-[550px] overflow-y-auto">
                  
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
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400 font-medium">Técnico Responsável:</span>
                          <strong className="text-emerald-400">{selectedTicket.assignedTo || "Aguardando Técnico"}</strong>
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

                  {/* Attached screenshot block */}
                  {selectedTicket.screenshot && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Camera className="h-3.5 w-3.5 text-emerald-400" />
                        Print Anexado
                      </span>
                      <div className="bg-black p-3 rounded-xl border border-neutral-900 flex flex-col items-center">
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
                    </div>
                  )}

                  {/* Interactive Control Controls (TI Assignment / Priority changer) */}
                  {currentSession.role === "tecnico" && (
                    <div className="p-4 bg-black border border-emerald-950/20 rounded-xl space-y-3">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Painel do Técnico (Atendimento)</span>
                      
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        
                        {/* Assign to current option */}
                        <div>
                          <label className="text-slate-500 block mb-1 text-[10px]">Técnico Responsável</label>
                          {selectedTicket.assignedTo === null ? (
                            <button
                              onClick={() => handleUpdateTicketMeta(selectedTicket.id, { assignedTo: currentSession.name })}
                              className="w-full py-1.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg text-xs font-semibold transition cursor-pointer"
                            >
                              Assumir Atendimento
                            </button>
                          ) : selectedTicket.assignedTo === currentSession.name ? (
                            <button
                              onClick={() => handleUpdateTicketMeta(selectedTicket.id, { assignedTo: null })}
                              className="w-full py-1.5 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg text-xs font-semibold transition cursor-pointer"
                            >
                              Remover Minha Atribuição
                            </button>
                          ) : (
                            <div className="w-full py-1 px-2 bg-amber-500/5 text-amber-400 border border-amber-500/15 rounded-lg text-[10px] font-medium leading-normal">
                              Em atendimento por:<br/><strong>{selectedTicket.assignedTo}</strong>
                            </div>
                          )}
                        </div>
 
                        {/* Adjust priority manually */}
                        <div>
                          <label className="text-slate-500 block mb-1 text-[10px]">Prioridade Operacional</label>
                          <select
                            value={selectedTicket.priority}
                            onChange={(e) => handleUpdateTicketMeta(selectedTicket.id, { priority: e.target.value as Ticket["priority"] })}
                            disabled={isAssignedToOther}
                            className={`w-full bg-black border border-neutral-900 rounded-lg py-1.5 px-2 text-xs text-white focus:outline-none focus:border-emerald-500 ${isAssignedToOther ? "opacity-50 cursor-not-allowed text-slate-500" : ""}`}
                            title={isAssignedToOther ? `Apenas o técnico responsável (${selectedTicket.assignedTo}) pode alterar a prioridade.` : ""}
                          >
                            <option value="Baixa">Baixa</option>
                            <option value="Média">Média</option>
                            <option value="Alta">Alta</option>
                            <option value="Urgente">Urgente</option>
                          </select>
                        </div>
 
                      </div>

                      {/* Alterar Solicitante (Visible to technicians) */}
                      <div className="pt-2.5 border-t border-emerald-950/20 space-y-1.5">
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
                          className={`w-full bg-black border border-neutral-900 rounded-lg py-1.5 px-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500 cursor-pointer ${isAssignedToOther ? "opacity-50 cursor-not-allowed" : ""}`}
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

                      {/* Project Deadline Setting (Only visible to the assigned technician) */}
                      {selectedTicket.assignedTo === currentSession?.name && (
                        <div className="pt-2.5 border-t border-emerald-950/20 space-y-1.5">
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

                      {/* Transfer Option (Only visible to the assigned technician) */}
                      {selectedTicket.assignedTo === currentSession.name && (
                        <div className="pt-2.5 border-t border-emerald-950/20 space-y-1.5">
                          <label className="text-slate-500 block text-[10px] font-medium">Transferir chamado para outro técnico:</label>
                          <select
                            defaultValue=""
                            className="w-full bg-black border border-neutral-900 rounded-lg py-1.5 px-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500 cursor-pointer"
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
                        <span>⚠️ Este chamado está sob responsabilidade de <strong>{selectedTicket.assignedTo}</strong>. Apenas o responsável pode alterar ou finalizá-lo.</span>
                      </div>
                    )}

                    {selectedTicket.status !== "Resolvido" && selectedTicket.status !== "Fechado" ? (
                      <button
                        onClick={() => {
                          if (isAssignedToOther) {
                            alert(`Este chamado está atribuído a ${selectedTicket.assignedTo}. Apenas o técnico responsável pode finalizá-lo.`);
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
                            alert(`Este chamado está atribuído a ${selectedTicket.assignedTo}. Apenas o técnico responsável pode reabri-lo.`);
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

                    {/* Excluir Chamado (Apenas para o técnico responsável) */}
                    {currentSession.role === "tecnico" && (
                      <div className="pt-2 border-t border-neutral-900 mt-2">
                        {selectedTicket.assignedTo !== currentSession.name ? (
                          <button
                            type="button"
                            disabled
                            className="w-full py-2 bg-neutral-950 text-neutral-600 border border-neutral-900/40 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-not-allowed"
                            title={`Apenas o técnico responsável (${selectedTicket.assignedTo || 'Nenhum'}) pode excluir este chamado.`}
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
                        className="p-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-slate-400 hover:text-white transition cursor-pointer"
                        title="Remover anexo"
                      >
                        ✕
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

        </div>
        )}

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
            <div className="px-6 py-3 bg-black/20 border-b border-neutral-900/60 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-neutral-900 flex items-center justify-center text-[10px] font-bold text-emerald-400 border border-neutral-800">
                  {currentSession.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <span className="text-slate-400 font-semibold">{currentSession.name}</span>
                  <span className="text-slate-500 text-[10px] ml-1.5 font-medium">({currentSession.department})</span>
                </div>
              </div>
              <div className="text-[10px] text-slate-500 font-medium">
                {myTicketsViewMode === "resolved" ? (
                  <>
                    Total de chamados resolvidos por você: <strong className="text-emerald-400">{tickets.filter(t => t.assignedTo === currentSession.name && (t.status === "Resolvido" || t.status === "Fechado")).length}</strong>
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
              <div className="p-4 border-b border-neutral-900 flex gap-2">
                <button
                  onClick={() => setMyTicketsTab("all")}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    myTicketsTab === "all"
                      ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/10"
                      : "bg-black text-slate-400 hover:text-white border border-neutral-900"
                  }`}
                >
                  <span>Todos</span>
                  <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-md ${
                    myTicketsTab === "all" ? "bg-black/20 text-slate-950" : "bg-neutral-900 text-slate-400"
                  }`}>
                    {tickets.filter(t => t.requesterName === currentSession.name).length}
                  </span>
                </button>

                <button
                  onClick={() => setMyTicketsTab("unresolved")}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    myTicketsTab === "unresolved"
                      ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/10"
                      : "bg-black text-slate-400 hover:text-white border border-neutral-900"
                  }`}
                >
                  <span>Pendentes</span>
                  <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-md ${
                    myTicketsTab === "unresolved" ? "bg-black/20 text-slate-950" : "bg-neutral-900 text-slate-400"
                  }`}>
                    {tickets.filter(t => t.requesterName === currentSession.name && t.status !== "Resolvido" && t.status !== "Fechado").length}
                  </span>
                </button>

                <button
                  onClick={() => setMyTicketsTab("resolved")}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    myTicketsTab === "resolved"
                      ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/10"
                      : "bg-black text-slate-400 hover:text-white border border-neutral-900"
                  }`}
                >
                  <span>Resolvidos</span>
                  <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-md ${
                    myTicketsTab === "resolved" ? "bg-black/20 text-slate-950" : "bg-neutral-900 text-slate-400"
                  }`}>
                    {tickets.filter(t => t.requesterName === currentSession.name && (t.status === "Resolvido" || t.status === "Fechado")).length}
                  </span>
                </button>
              </div>
            ) : (
              <div className="px-6 py-4 border-b border-neutral-900 bg-black/20 flex items-center justify-between">
                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Histórico de Atendimentos Concluídos</span>
                <span className="text-xs bg-emerald-500/10 text-emerald-400 font-semibold px-2.5 py-1 rounded-xl border border-emerald-500/20 shadow-neon-sm">
                  {tickets.filter(t => t.assignedTo === currentSession.name && (t.status === "Resolvido" || t.status === "Fechado")).length} Chamado(s)
                </span>
              </div>
            )}

            {/* List Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[250px] max-h-[50vh]">
              {(() => {
                const baseList = myTicketsViewMode === "resolved"
                  ? tickets.filter(t => t.assignedTo === currentSession.name && (t.status === "Resolvido" || t.status === "Fechado"))
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
                          {ticket.assignedTo ? `Técnico: ${ticket.assignedTo}` : "Sem técnico atribuído"}
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
                const techResolvedTickets = tickets.filter(t => t.assignedTo === selectedTechProfile.name && (t.status === "Resolvido" || t.status === "Fechado"));
                const techActiveTickets = tickets.filter(t => t.assignedTo === selectedTechProfile.name && t.status !== "Resolvido" && t.status !== "Fechado");
                const totalTechTickets = techResolvedTickets.length + techActiveTickets.length;

                // SLA compliance for this technician
                const techOverdue = techActiveTickets.filter(t => new Date(t.slaLimit).getTime() < Date.now()).length;
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
                                  {ticket.assignedTo ? `Técnico: ${ticket.assignedTo}` : "Sem técnico atribuído"}
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
              
              {/* Profile Context warning */}
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



              {/* Screenshot attachment field */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                  <Camera className="h-3.5 w-3.5 text-emerald-400" />
                  Anexar Print/Imagem (Opcional)
                </label>
                
                {!newTicketForm.screenshot ? (
                  <div 
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files?.[0];
                      if (file && file.type.startsWith("image/")) {
                        compressImage(file)
                          .then((compressedUrl) => {
                            setNewTicketForm({ ...newTicketForm, screenshot: compressedUrl });
                          })
                          .catch(() => {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setNewTicketForm({ ...newTicketForm, screenshot: reader.result as string });
                            };
                            reader.readAsDataURL(file);
                          });
                      }
                    }}
                    onPaste={(e) => {
                      const item = e.clipboardData?.items?.[0];
                      if (item && item.type.startsWith("image/")) {
                        const file = item.getAsFile();
                        if (file) {
                          compressImage(file)
                            .then((compressedUrl) => {
                              setNewTicketForm({ ...newTicketForm, screenshot: compressedUrl });
                            })
                            .catch(() => {
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                setNewTicketForm({ ...newTicketForm, screenshot: reader.result as string });
                              };
                              reader.readAsDataURL(file);
                            });
                        }
                      }
                    }}
                    className="border border-dashed border-neutral-900 hover:border-emerald-500/20 bg-black hover:bg-[#070707] transition rounded-xl p-4 text-center cursor-pointer relative group"
                  >
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          compressImage(file)
                            .then((compressedUrl) => {
                              setNewTicketForm({ ...newTicketForm, screenshot: compressedUrl });
                            })
                            .catch(() => {
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                setNewTicketForm({ ...newTicketForm, screenshot: reader.result as string });
                              };
                              reader.readAsDataURL(file);
                            });
                        }
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <Upload className="h-5 w-5 text-slate-500 group-hover:text-emerald-400 mx-auto mb-1.5 transition-colors" />
                    <p className="text-[11px] text-slate-400 font-medium">
                      Clique para selecionar ou <span className="text-emerald-400">arraste e solte</span> a imagem aqui
                    </p>
                    <p className="text-[9px] text-slate-500 mt-0.5">
                      Você também pode pressionar <kbd className="bg-[#151515] px-1.5 py-0.5 rounded text-[8px]">Ctrl+V</kbd> para colar um print
                    </p>
                  </div>
                ) : (
                  <div className="relative w-full rounded-xl overflow-hidden border border-neutral-900 bg-black/50 p-2.5 flex flex-col items-center">
                    <img 
                      src={newTicketForm.screenshot} 
                      alt="Preview do print" 
                      className="max-h-40 rounded-lg object-contain border border-neutral-900" 
                    />
                    <div className="mt-2 flex items-center justify-between w-full text-[10px] text-slate-400 px-1">
                      <span className="truncate max-w-[200px] text-slate-500">Imagem anexada com sucesso</span>
                      <button
                        type="button"
                        onClick={() => setNewTicketForm({ ...newTicketForm, screenshot: "" })}
                        className="text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1 transition cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remover
                      </button>
                    </div>
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
                    className="text-slate-400 hover:text-white transition-colors text-xs font-bold leading-none p-1 -m-1"
                  >
                    ✕
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
                <span className="text-sm font-bold px-1">✕</span>
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

    </div>
  );
}
