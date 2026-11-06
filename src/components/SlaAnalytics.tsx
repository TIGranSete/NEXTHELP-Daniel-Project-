import { useMemo, useState } from "react";
import { Ticket } from "../types";
import { AlertCircle, Clock, CheckCircle2, TrendingUp, HelpCircle, Activity, Download, Calendar, User, Users, X, FileText, Layers, ChevronDown, ChevronUp } from "lucide-react";
import { jsPDF } from "jspdf";
import WindowsDatePicker from "./WindowsDatePicker";
import { computeSlaMetrics } from "../lib/sla/metrics";
import { computeTicketSla, formatBusinessMinutes } from "../lib/sla/ticketSla";
import { DEFAULT_CALENDAR } from "../lib/sla/config";
import { isTicketOverdue as engineIsOverdue } from "../lib/sla/compat";
import { useNow } from "../hooks/useNow";
import { canonicalDepartment, departmentKey } from "../lib/departments";
import { evaluateTickets } from "../lib/sla/dashboardData";
import SlaHeader, { PERIOD_OPTIONS } from "./sla-dashboard/SlaHeader";
import SlaDashboard from "./sla-dashboard/SlaDashboard";

/** Percentual de SLA: sem chamados avaliáveis NÃO é 100% — é "Sem dados". */
const pctLabel = (p: number | null) => (p === null ? "Sem dados" : `${p}%`);

/** Tempo médio de resolução em MINUTOS ÚTEIS (só chamados com data de resolução confiável). */
function averageBusinessResolution(tickets: Ticket[]): { label: string; count: number } {
  const now = Date.now();
  let sum = 0;
  let count = 0;
  for (const t of tickets) {
    if (t.status !== "Resolvido" && t.status !== "Fechado") continue;
    const sla = computeTicketSla(t, now);
    if (sla.applicable && sla.resolution.resolvedAt !== null) {
      sum += sla.resolution.consumedMin;
      count++;
    }
  }
  return { label: count > 0 ? formatBusinessMinutes(sum / count) : "Sem dados", count };
}

// Atraso decidido pelo motor único de SLA (horas úteis) — não mais pelo slaLimit em horas corridas.
const isTicketOverdue = (t: Ticket) => engineIsOverdue(t, Date.now());

interface SlaAnalyticsProps {
  tickets: Ticket[];
  users?: any[];
  onViewUserProfile?: (user: any) => void;
  onSelectTicket?: (ticketId: string) => void;
  /** Carregamento inicial dos chamados (sem dados ainda). */
  loading?: boolean;
  /** A última tentativa de buscar os chamados falhou. */
  error?: boolean;
  /** Atualização em andamento (botão "Atualizar"). */
  refreshing?: boolean;
  /** Busca os chamados novamente. */
  onRefresh?: () => void;
}

export default function SlaAnalytics({ tickets, users = [], onViewUserProfile, onSelectTicket, loading = false, error = false, refreshing = false, onRefresh }: SlaAnalyticsProps) {
  const [period, setPeriod] = useState<string>("all");
  const [selectedTech, setSelectedTech] = useState<string>("all");
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [selectedTechForExport, setSelectedTechForExport] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [selectedSectorForMembers, setSelectedSectorForMembers] = useState<string | null>(null);
  const [statusCategoryFilter, setStatusCategoryFilter] = useState<string | null>(null);
  const [selectedCategoryForDetails, setSelectedCategoryForDetails] = useState<string | null>(null);
  const [categorySearchQuery, setCategorySearchQuery] = useState<string>("");
  const [categoryStatusTab, setCategoryStatusTab] = useState<string>("all");

  const handleUserClick = (userName: string, userDepartment: string) => {
    if (onViewUserProfile) {
      const foundUser = users.find(u => u.name && u.name.toLowerCase().trim() === userName.toLowerCase().trim());
      if (foundUser) {
        onViewUserProfile(foundUser);
      } else {
        onViewUserProfile({
          id: `mock-${userName}`,
          name: userName,
          email: `${userName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, ".")}@gransete.com`,
          department: userDepartment || "Geral",
          role: "colaborador" as const,
          mustChangePassword: false
        });
      }
    }
  };

  // Get all unique technicians who have been assigned tickets
  const technicians = Array.from(
    new Set(
      tickets
        .flatMap(t => {
          if (!t.assignedTo) return [];
          return t.assignedTo.split(",").map(s => s.trim()).filter(Boolean);
        })
    )
  ).sort();

  // Filter tickets by selected period and technician
  const nowMs = useNow(60_000);
  const filteredTickets = useMemo(() => tickets.filter(t => {
    // 1. Period filter
    if (period !== "all") {
      if (!t.createdAt) return false;
      const ticketDate = new Date(t.createdAt);
      if (isNaN(ticketDate.getTime())) return false;

      if (period === "custom") {
        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          if (ticketDate.getTime() < start.getTime()) return false;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (ticketDate.getTime() > end.getTime()) return false;
        }
      } else {
        const diffMs = Date.now() - ticketDate.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (period === "7d" && diffDays > 7) return false;
        if (period === "30d" && diffDays > 30) return false;
        if (period === "90d" && diffDays > 90) return false;
      }
    }

    // 2. Technician filter
    if (selectedTech !== "all") {
      if (!t.assignedTo) return false;
      const assigned = t.assignedTo.split(",").map(s => s.trim()).filter(Boolean);
      if (!assigned.includes(selectedTech)) return false;
    }

    return true;
  }), [tickets, period, selectedTech, startDate, endDate, nowMs]);

  // Tempo médio de resolução em horas úteis (não usa updatedAt, que muda a cada edição)
  const avgResolution = useMemo(() => averageBusinessResolution(filteredTickets), [filteredTickets, nowMs]);
  const averageResolutionTimeStr = avgResolution.label;
  const resolvedWithTime = { length: avgResolution.count };

  // Indicadores de SLA (primeira resposta e resolução, separados) — mesmo motor do servidor
  // O motor roda UMA vez por chamado e por minuto; todas as agregações do dashboard reutilizam este resultado.
  const slaItems = useMemo(() => evaluateTickets(filteredTickets, nowMs), [filteredTickets, nowMs]);
  const slaMetrics = useMemo(() => computeSlaMetrics(filteredTickets, nowMs), [filteredTickets, nowMs]);
  const periodLabel = period === "custom"
    ? `${startDate ? startDate.split("-").reverse().join("/") : "…"} a ${endDate ? endDate.split("-").reverse().join("/") : "…"}`
    : (PERIOD_OPTIONS.find((o) => o.id === period)?.label ?? "").toLowerCase();
  const clearFilters = () => { setPeriod("all"); setSelectedTech("all"); setStartDate(""); setEndDate(""); };

  // Compute analytics from filtered tickets
  const total = filteredTickets.length;
  const openCount = filteredTickets.filter(t => t.status === "Aberto").length;
  const inProgressCount = filteredTickets.filter(t => t.status === "Em Atendimento").length;
  const resolvedCount = filteredTickets.filter(t => t.status === "Resolvido" || t.status === "Fechado").length;

  // Calculate Urgent & High tickets currently open
  const criticalCount = filteredTickets.filter(t => 
    (t.priority === "Urgente" || t.priority === "Alta") && t.status !== "Resolvido" && t.status !== "Fechado"
  ).length;

  // Calculate average resolution or active tickets ratio
  const activeSlaTickets = filteredTickets.filter(t => t.status !== "Resolvido" && t.status !== "Fechado");
  const overdueCount = activeSlaTickets.filter(t => isTicketOverdue(t)).length;

  // Category counts for visual charting
  const categories: Record<Ticket["category"], number> = {
    Hardware: 0,
    Software: 0,
    Redes: 0,
    Acesso: 0,
    Sistemas: 0,
    Outros: 0
  };

  filteredTickets.forEach(t => {
    if (categories[t.category] !== undefined) {
      categories[t.category]++;
    } else {
      categories["Outros"]++;
    }
  });

  // Project statistics
  const projectsCount = filteredTickets.filter(t => !!t.projectDeadline).length;
  const resolvedProjectsCount = filteredTickets.filter(t => !!t.projectDeadline && (t.status === "Resolvido" || t.status === "Fechado")).length;
  const activeProjectsCount = filteredTickets.filter(t => !!t.projectDeadline && t.status !== "Resolvido" && t.status !== "Fechado").length;

  const categoryEntries = Object.entries(categories) as [Ticket["category"], number][];

  // Custom list of all categories including projects for display
  const allCategoryEntries: [string, number][] = [
    ...categoryEntries,
    ["Projetos", projectsCount]
  ];

  const maxCategoryCount = Math.max(...Object.values(categories), projectsCount, 1);

  // Helper to get category count for a specific status
  const getCategoriesForStatus = (status: string) => {
    const counts: Record<string, number> = {
      Hardware: 0,
      Software: 0,
      Redes: 0,
      Acesso: 0,
      Sistemas: 0,
      Outros: 0,
      Projetos: 0
    };
    
    filteredTickets.forEach(t => {
      const match = status === "Resolvido"
        ? (t.status === "Resolvido" || t.status === "Fechado")
        : (t.status === status);
      
      if (match) {
        if (t.projectDeadline) {
          counts["Projetos"]++;
        } else if (counts[t.category] !== undefined) {
          counts[t.category]++;
        } else {
          counts["Outros"]++;
        }
      }
    });
    
    return Object.entries(counts)
      .filter(([_, count]) => count > 0)
      .sort((a, b) => b[1] - a[1]);
  };

  // Group by sector (requesterDepartment)
  const sectorCounts: Record<string, number> = {};
  filteredTickets.forEach(t => {
    const dept = canonicalDepartment(t.requesterDepartment);
    if (dept) {
      sectorCounts[dept] = (sectorCounts[dept] || 0) + 1;
    }
  });

  const sortedSectors = Object.entries(sectorCounts)
    .map(([name, count]) => ({
      name,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count);

  const uniqueSectorsCount = sortedSectors.length;
  const maxSectorCount = Math.max(...sortedSectors.map(s => s.count), 1);

  // Group by user (requesterName)
  const userStats: Record<string, { count: number; department: string }> = {};
  filteredTickets.forEach(t => {
    const name = t.requesterName ? t.requesterName.trim() : "";
    const dept = canonicalDepartment(t.requesterDepartment) || "Geral";
    if (name) {
      if (!userStats[name]) {
        userStats[name] = { count: 0, department: dept };
      }
      userStats[name].count++;
      if (dept && dept !== "Geral") {
        userStats[name].department = dept;
      }
    }
  });

  const sortedUsers = Object.entries(userStats)
    .map(([name, stats]) => ({
      name,
      count: stats.count,
      department: stats.department,
      percentage: total > 0 ? Math.round((stats.count / total) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count);

  const uniqueUsersCount = sortedUsers.length;
  const maxUserCount = Math.max(...sortedUsers.map(u => u.count), 1);

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0] ? parts[0][0].toUpperCase() : "U";
  };

  // SLA compliance rate (Resolved tickets within deadline)
  const slaCompliancePercent = slaMetrics.resolution.pct; // null = sem dados (nunca 100% por padrão)

  // Export to PDF function
  const exportToPdf = () => {
    const doc = new jsPDF();
    
    // Header block
    doc.setFillColor(10, 10, 10);
    doc.rect(0, 0, 210, 40, "F");
    
    // Title
    doc.setTextColor(16, 185, 129); // Emerald Green
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("GRAN7 HELP", 15, 20);
    
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text("Portal de Suporte - Relatorio de Desempenho de SLA", 15, 30);
    
    // Generation Meta info
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(9);
    const dateStr = new Date().toLocaleString("pt-BR");
    doc.text(`Gerado em: ${dateStr}`, 140, 20);
    
    // Label for Period
    const periodLabelMap: Record<string, string> = {
      "7d": "Ultimos 7 dias",
      "30d": "Ultimos 30 dias",
      "90d": "Ultimos 90 dias",
      "all": "Todo o periodo",
      "custom": `Periodo Personalizado (${startDate || "N/A"} a ${endDate || "N/A"})`
    };
    doc.text(`Periodo: ${periodLabelMap[period]}`, 140, 26);
    
    if (selectedTech !== "all") {
      doc.text(`Tecnico: ${selectedTech}`, 140, 32);
    }
    
    // --- SECTION: INDICATORS ---
    doc.setTextColor(15, 23, 42); // zinc-900
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("1. Indicadores Gerais", 15, 55);
    
    // Line separator
    doc.setDrawColor(226, 232, 240);
    doc.line(15, 58, 195, 58);
    
    // KPI Table / Grid Representation
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    
    const kpis = [
      ["Metrica", "Valor", "Meta / Descricao"],
      ["SLA de Resolucao (horas uteis)", pctLabel(slaCompliancePercent), `${slaMetrics.resolution.met} de ${slaMetrics.resolution.evaluated} resolvidos no prazo`],
      ["SLA de Primeira Resposta (horas uteis)", pctLabel(slaMetrics.firstResponse.pct), `${slaMetrics.firstResponse.met} de ${slaMetrics.firstResponse.evaluated} avaliados`],
      ["Tempo Medio de Atendimento (TMA)", `${averageResolutionTimeStr}`, `Baseado em ${resolvedWithTime.length} chamado(s)`],
      ["Total de Chamados no Periodo", `${total}`, "-"],
      ["Chamados Criticos Ativos (Alta/Urgente)", `${criticalCount}`, "Fila Ativa de Suporte"],
      ["Chamados Concluidos (Resolvido/Fechado)", `${resolvedCount}`, "Eficiencia da equipe"],
      ["Chamados Fora do Prazo (Vencidos)", `${overdueCount}`, "Necessitam de atencao imediata"]
    ];
    
    let yPos = 68;
    kpis.forEach((row, idx) => {
      if (idx === 0) {
        doc.setFont("helvetica", "bold");
        doc.setFillColor(241, 245, 249);
        doc.rect(15, yPos - 4, 180, 7, "F");
      } else {
        doc.setFont("helvetica", "normal");
      }
      doc.text(row[0], 20, yPos);
      doc.text(row[1], 100, yPos);
      doc.text(row[2], 135, yPos);
      yPos += 8;
    });
    
    // --- SECTION: CATEGORIES BREAKDOWN ---
    yPos += 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("2. Distribuicao por Categoria", 15, yPos);
    
    yPos += 3;
    doc.line(15, yPos, 195, yPos);
    yPos += 7;
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    
    allCategoryEntries.forEach(([cat, count]) => {
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      doc.text(`${cat}:`, 20, yPos);
      const unit = cat === "Projetos" ? "projeto(s)" : "chamado(s)";
      doc.text(`${count} ${unit} (${pct}%)`, 60, yPos);
      yPos += 7;
    });
    
    // --- SECTION: TICKETS LIST ---
    yPos += 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("3. Detalhamento dos Chamados", 15, yPos);
    
    yPos += 3;
    doc.line(15, yPos, 195, yPos);
    yPos += 7;
    
    doc.setFontSize(9);
    // Table Headers
    doc.setFillColor(241, 245, 249);
    doc.rect(15, yPos - 4, 180, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.text("Titulo / ID", 18, yPos);
    doc.text("Categoria", 85, yPos);
    doc.text("Prioridade", 115, yPos);
    doc.text("Status", 145, yPos);
    doc.text("SLA", 175, yPos);
    
    yPos += 7;
    doc.setFont("helvetica", "normal");
    
    if (filteredTickets.length === 0) {
      doc.text("Nenhum chamado encontrado para o periodo selecionado.", 20, yPos);
    } else {
      filteredTickets.forEach((t) => {
        // Page break check
        if (yPos > 275) {
          doc.addPage();
          yPos = 20;
          // Re-draw small header on subsequent pages
          doc.setFillColor(10, 10, 10);
          doc.rect(0, 0, 210, 15, "F");
          doc.setTextColor(16, 185, 129);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.text("GRAN7 HELP - Portal de Suporte", 15, 10);
          
          doc.setTextColor(15, 23, 42);
          doc.setFontSize(9);
          // Table Headers on new page
          doc.setFillColor(241, 245, 249);
          doc.rect(15, yPos + 5, 180, 6, "F");
          doc.setFont("helvetica", "bold");
          doc.text("Titulo / ID", 18, yPos + 9);
          doc.text("Categoria", 85, yPos + 9);
          doc.text("Prioridade", 115, yPos + 9);
          doc.text("Status", 145, yPos + 9);
          doc.text("SLA", 175, yPos + 9);
          
          yPos += 20;
          doc.setFont("helvetica", "normal");
        }
        
        const shortId = t.id ? t.id.substring(0, 8) : "N/A";
        const titleStr = t.title.length > 30 ? t.title.substring(0, 28) + "..." : t.title;
        const isOverdue = isTicketOverdue(t);
        const slaStatus = isOverdue ? "Atrasado" : "No Prazo";
        
        doc.setFont("helvetica", "normal");
        doc.text(`${titleStr} (#${shortId})`, 18, yPos);
        doc.text(t.category, 85, yPos);
        doc.text(t.priority, 115, yPos);
        doc.text(t.status, 145, yPos);
        
        if (isOverdue) {
          doc.setTextColor(220, 38, 38); // Red
          doc.setFont("helvetica", "bold");
        } else {
          doc.setTextColor(22, 163, 74); // Green
        }
        doc.text(slaStatus, 175, yPos);
        doc.setTextColor(15, 23, 42); // Restore default zinc-900
        doc.setFont("helvetica", "normal");
        
        yPos += 7;
      });
    }
    
    // Save PDF
    doc.save(`relatorio-sla-${period}-${new Date().toISOString().split("T")[0]}.pdf`);
  };

  // Export technician performance metrics to PDF
  const exportTechsPerformancePdf = () => {
    const doc = new jsPDF();
    
    // Header block
    doc.setFillColor(10, 10, 10);
    doc.rect(0, 0, 210, 40, "F");
    
    // Title
    doc.setTextColor(16, 185, 129); // Emerald Green
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("GRAN7 HELP", 15, 20);
    
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text("Relatorio de Desempenho de SLA por Tecnico", 15, 30);
    
    // Generation Meta info
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(9);
    const dateStr = new Date().toLocaleString("pt-BR");
    doc.text(`Gerado em: ${dateStr}`, 140, 20);
    
    // Label for Period
    const periodLabelMap: Record<string, string> = {
      "7d": "Ultimos 7 dias",
      "30d": "Ultimos 30 dias",
      "90d": "Ultimos 90 dias",
      "all": "Todo o periodo",
      "custom": `Periodo Personalizado (${startDate || "N/A"} a ${endDate || "N/A"})`
    };
    doc.text(`Periodo: ${periodLabelMap[period]}`, 140, 26);
    doc.text(`Escopo: ${selectedTech === "all" ? "Todos os Tecnicos" : selectedTech}`, 140, 32);

    // List of technicians to include
    const techsToExport = selectedTech === "all" ? technicians : [selectedTech];

    if (techsToExport.length === 0) {
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Nenhum tecnico com chamados registrados no momento.", 15, 60);
      doc.save(`relatorio-desempenho-tecnicos.pdf`);
      return;
    }

    let yPos = 55;

    // --- SECTION 1: COMPARATIVE SUMMARY ---
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("1. Painel Comparativo dos Tecnicos", 15, yPos);
    
    yPos += 3;
    doc.setDrawColor(226, 232, 240);
    doc.line(15, yPos, 195, yPos);
    yPos += 7;

    // Table Header
    doc.setFillColor(241, 245, 249);
    doc.rect(15, yPos - 4, 180, 7, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Nome do Tecnico", 18, yPos);
    doc.text("Assinados", 75, yPos);
    doc.text("Resolvidos", 100, yPos);
    doc.text("SLA %", 125, yPos);
    doc.text("Tempo Medio (TMA)", 150, yPos);

    yPos += 8;
    doc.setFont("helvetica", "normal");

    // Compute metrics per technician for the summary table
    const techSummaries = techsToExport.map(tech => {
      // Filter tickets for this technician in the selected period
      const techTickets = tickets.filter(t => {
        const assigned = t.assignedTo ? t.assignedTo.split(",").map(s => s.trim()).filter(Boolean) : [];
        if (!assigned.includes(tech)) return false;
        if (period !== "all") {
          if (!t.createdAt) return false;
          const ticketDate = new Date(t.createdAt);
          if (isNaN(ticketDate.getTime())) return false;

          if (period === "custom") {
            if (startDate) {
              const start = new Date(startDate);
              start.setHours(0, 0, 0, 0);
              if (ticketDate.getTime() < start.getTime()) return false;
            }
            if (endDate) {
              const end = new Date(endDate);
              end.setHours(23, 59, 59, 999);
              if (ticketDate.getTime() > end.getTime()) return false;
            }
          } else {
            const diffMs = Date.now() - ticketDate.getTime();
            const diffDays = diffMs / (1000 * 60 * 60 * 24);
            if (period === "7d" && diffDays > 7) return false;
            if (period === "30d" && diffDays > 30) return false;
            if (period === "90d" && diffDays > 90) return false;
          }
        }
        return true;
      });

      const totalAssigned = techTickets.length;
      const totalResolved = techTickets.filter(t => t.status === "Resolvido" || t.status === "Fechado").length;
      const overdue = techTickets.filter(t => isTicketOverdue(t)).length;
      const slaCompliance = computeSlaMetrics(techTickets, Date.now()).resolution.pct;

      // TMA calculation
      const tmaInfo = averageBusinessResolution(techTickets);
      const tmaStr = tmaInfo.label;

      // Categories breakdown
      const cats: Record<string, number> = { Hardware: 0, Software: 0, Redes: 0, Acesso: 0, Sistemas: 0, Outros: 0 };
      techTickets.forEach(t => {
        if (cats[t.category] !== undefined) {
          cats[t.category]++;
        } else {
          cats["Outros"]++;
        }
      });

      return {
        name: tech,
        totalAssigned,
        totalResolved,
        slaCompliance,
        tmaStr,
        categories: cats,
        tickets: techTickets
      };
    });

    techSummaries.forEach(summary => {
      doc.text(summary.name, 18, yPos);
      doc.text(`${summary.totalAssigned}`, 75, yPos);
      doc.text(`${summary.totalResolved}`, 100, yPos);
      doc.text(pctLabel(summary.slaCompliance), 125, yPos);
      doc.text(summary.tmaStr, 150, yPos);
      yPos += 7;

      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
    });

    // --- SECTION 2: INDIVIDUAL DETAILS ---
    yPos += 6;
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("2. Metricas Detalhadas por Tecnico", 15, yPos);
    yPos += 3;
    doc.line(15, yPos, 195, yPos);
    yPos += 8;

    techSummaries.forEach((summary) => {
      // Check space before printing technician block (needs about 55 units of height)
      if (yPos > 220) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFillColor(248, 250, 252);
      doc.rect(15, yPos - 4, 180, 48, "F");
      doc.setDrawColor(226, 232, 240);
      doc.rect(15, yPos - 4, 180, 48, "S");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(16, 185, 129); // Emerald
      doc.text(`Tecnico: ${summary.name.toUpperCase()}`, 20, yPos + 2);
      doc.setTextColor(15, 23, 42); // Restore default

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`Total de chamados vinculados: ${summary.totalAssigned}`, 20, yPos + 9);
      doc.text(`Total de chamados concluidos: ${summary.totalResolved}`, 20, yPos + 15);
      
      doc.setFont("helvetica", "bold");
      doc.text(`Eficiencia / SLA Individual: ${pctLabel(summary.slaCompliance)}`, 20, yPos + 22);
      doc.text(`Tempo Medio de Atendimento (TMA): ${summary.tmaStr}`, 20, yPos + 29);
      doc.setFont("helvetica", "normal");

      // Category breakdown string
      const categoryStr = Object.entries(summary.categories)
        .filter(([_, count]) => count > 0)
        .map(([cat, count]) => `${cat}: ${count}`)
        .join(" | ");

      doc.text("Produtividade por Categorias:", 20, yPos + 36);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8.5);
      doc.text(categoryStr || "Nenhum chamado finalizado no periodo", 20, yPos + 41);
      doc.setFont("helvetica", "normal");

      yPos += 52;
    });

    // Save PDF
    doc.save(`relatorio-desempenho-tecnicos-${period}-${new Date().toISOString().split("T")[0]}.pdf`);
  };

  // Export beautiful individualized PDF report for a single technician
  const exportIndividualTechPdf = (techName: string) => {
    const doc = new jsPDF();
    
    // Header block
    doc.setFillColor(10, 10, 10);
    doc.rect(0, 0, 210, 40, "F");
    
    // Title
    doc.setTextColor(16, 185, 129); // Emerald Green
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("GRAN7 HELP", 15, 20);
    
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text("Relatorio de Desempenho Individual de SLA", 15, 30);
    
    // Generation Meta info
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(9);
    const dateStr = new Date().toLocaleString("pt-BR");
    doc.text(`Gerado em: ${dateStr}`, 140, 20);
    
    const periodLabelMap: Record<string, string> = {
      "7d": "Ultimos 7 dias",
      "30d": "Ultimos 30 dias",
      "90d": "Ultimos 90 dias",
      "all": "Todo o periodo",
      "custom": `Periodo Personalizado (${startDate || "N/A"} a ${endDate || "N/A"})`
    };
    doc.text(`Periodo: ${periodLabelMap[period]}`, 140, 26);
    doc.text(`Tecnico: ${techName}`, 140, 32);

    // Compute metrics for this specific technician
    const techTickets = tickets.filter(t => {
      const assigned = t.assignedTo ? t.assignedTo.split(",").map(s => s.trim()).filter(Boolean) : [];
      if (!assigned.includes(techName)) return false;
      if (period !== "all") {
        if (!t.createdAt) return false;
        const ticketDate = new Date(t.createdAt);
        if (isNaN(ticketDate.getTime())) return false;

        if (period === "custom") {
          if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            if (ticketDate.getTime() < start.getTime()) return false;
          }
          if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            if (ticketDate.getTime() > end.getTime()) return false;
          }
        } else {
          const diffMs = Date.now() - ticketDate.getTime();
          const diffDays = diffMs / (1000 * 60 * 60 * 24);
          if (period === "7d" && diffDays > 7) return false;
          if (period === "30d" && diffDays > 30) return false;
          if (period === "90d" && diffDays > 90) return false;
        }
      }
      return true;
    });

    const totalAssigned = techTickets.length;
    const resolvedTickets = techTickets.filter(t => t.status === "Resolvido" || t.status === "Fechado");
    const totalResolved = resolvedTickets.length;
    const overdue = techTickets.filter(t => isTicketOverdue(t)).length;
    const slaCompliance = computeSlaMetrics(techTickets, Date.now()).resolution.pct;

    const tmaInfo = averageBusinessResolution(techTickets);
    const tmaStr = tmaInfo.label;

    // Categories breakdown
    const cats: Record<string, number> = { Hardware: 0, Software: 0, Redes: 0, Acesso: 0, Sistemas: 0, Outros: 0 };
    techTickets.forEach(t => {
      if (cats[t.category] !== undefined) {
        cats[t.category]++;
      } else {
        cats["Outros"]++;
      }
    });

    let yPos = 55;

    // --- MAIN BANNER ---
    doc.setFillColor(248, 250, 252);
    doc.rect(15, yPos, 180, 52, "F");
    doc.setDrawColor(226, 232, 240);
    doc.rect(15, yPos, 180, 52, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(16, 185, 129); // Emerald Green
    doc.text(techName.toUpperCase(), 22, yPos + 8);
    doc.setTextColor(15, 23, 42); // Restore default

    doc.setFontSize(9.5);
    doc.setFont("helvetica", "normal");
    doc.text(`Total de chamados vinculados no periodo: ${totalAssigned}`, 22, yPos + 16);
    doc.text(`Total de chamados resolvidos no periodo: ${totalResolved}`, 22, yPos + 22);
    
    doc.setFont("helvetica", "bold");
    doc.text(`Indice de SLA Individual: ${pctLabel(slaCompliance)}`, 22, yPos + 30);
    doc.text(`Tempo Medio de Atendimento (TMA): ${tmaStr}`, 22, yPos + 36);
    doc.setFont("helvetica", "normal");

    const categoryList = Object.entries(cats)
      .filter(([_, count]) => count > 0)
      .map(([cat, count]) => `${cat}: ${count}`)
      .join(" | ");
    doc.text("Produtividade por Categorias:", 22, yPos + 43);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.text(categoryList || "Nenhum chamado atribuido ou finalizado no periodo", 22, yPos + 48);
    doc.setFont("helvetica", "normal");

    yPos += 64;

    // --- LIST OF RESOLVED TICKETS ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Historico de Chamados Resolvidos", 15, yPos);
    yPos += 3;
    doc.line(15, yPos, 195, yPos);
    yPos += 8;

    // Table Header
    doc.setFillColor(241, 245, 249);
    doc.rect(15, yPos - 4, 180, 7, "F");
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.text("Titulo", 18, yPos);
    doc.text("Categoria", 85, yPos);
    doc.text("Prioridade", 115, yPos);
    doc.text("Abertura", 140, yPos);
    doc.text("Resolvido em", 168, yPos);

    yPos += 8;
    doc.setFont("helvetica", "normal");

    if (resolvedTickets.length === 0) {
      doc.setTextColor(100, 116, 139);
      doc.text("Nenhum chamado resolvido registrado no periodo.", 18, yPos);
    } else {
      resolvedTickets.forEach(t => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
          
          // Re-draw simple header for table on next page
          doc.setFillColor(241, 245, 249);
          doc.rect(15, yPos - 4, 180, 7, "F");
          doc.setFontSize(8.5);
          doc.setFont("helvetica", "bold");
          doc.text("Titulo", 18, yPos);
          doc.text("Categoria", 85, yPos);
          doc.text("Prioridade", 115, yPos);
          doc.text("Abertura", 140, yPos);
          doc.text("Resolvido em", 168, yPos);
          yPos += 8;
          doc.setFont("helvetica", "normal");
        }

        const cleanTitle = t.title.length > 35 ? t.title.substring(0, 32) + "..." : t.title;
        doc.text(cleanTitle, 18, yPos);
        doc.text(t.category, 85, yPos);
        doc.text(t.priority, 115, yPos);
        
        const openDate = t.createdAt ? new Date(t.createdAt).toLocaleDateString("pt-BR") : "N/A";
        const closeDate = t.updatedAt ? new Date(t.updatedAt).toLocaleDateString("pt-BR") : "N/A";
        
        doc.text(openDate, 140, yPos);
        doc.text(closeDate, 168, yPos);
        
        yPos += 6.5;
      });
    }

    doc.save(`relatorio-individual-${techName.toLowerCase().replace(/\s+/g, "-")}-${period}-${new Date().toISOString().split("T")[0]}.pdf`);
  };


  const hasTickets = tickets.length > 0;
  const state: "loading" | "error" | "empty" | "no-match" | "ready" =
    !hasTickets && loading ? "loading" : !hasTickets && error ? "error" : !hasTickets ? "empty" : filteredTickets.length === 0 ? "no-match" : "ready";

  return (
    <div className="mb-8 space-y-5 sm:space-y-6" data-testid="sla-analytics">
      <SlaHeader
        period={period} onPeriod={setPeriod}
        startDate={startDate} endDate={endDate} onStartDate={setStartDate} onEndDate={setEndDate}
        tech={selectedTech} onTech={setSelectedTech} technicians={technicians}
        onRefresh={onRefresh} refreshing={refreshing}
        onExportGeneral={exportToPdf}
        onExportByTech={() => { setSelectedTechForExport(selectedTech); setIsExportModalOpen(true); }}
      />

      {error && hasTickets && (
        <div role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-900 dark:text-amber-200">
          Não foi possível atualizar os chamados agora. Os indicadores abaixo usam os últimos dados carregados e podem estar desatualizados.
        </div>
      )}

      {state === "loading" && (
        <div aria-busy="true" aria-label="Carregando indicadores" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-36 rounded-xl border border-default bg-surface motion-safe:animate-pulse" />)}</div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-[104px] rounded-xl border border-default bg-surface motion-safe:animate-pulse" />)}</div>
          <div className="h-72 rounded-xl border border-default bg-surface motion-safe:animate-pulse" />
        </div>
      )}
      {state === "error" && (
        <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/[0.06] p-8 text-center">
          <p className="text-base font-semibold text-primary">Não foi possível carregar os chamados</p>
          <p className="text-sm text-secondary mt-1">Os indicadores não foram calculados — isso não significa zero chamados.</p>
          {onRefresh && <button type="button" onClick={onRefresh} className="mt-4 h-10 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold cursor-pointer">Tentar novamente</button>}
        </div>
      )}
      {state === "empty" && (
        <div className="rounded-xl border border-dashed border-default bg-surface p-10 text-center">
          <p className="text-base font-semibold text-primary">Ainda não há chamados registrados</p>
          <p className="text-sm text-secondary mt-1">Os indicadores aparecem assim que houver chamados.</p>
        </div>
      )}
      {state === "no-match" && (
        <div className="rounded-xl border border-dashed border-default bg-surface p-10 text-center">
          <p className="text-base font-semibold text-primary">Nenhum chamado para os filtros selecionados</p>
          <p className="text-sm text-secondary mt-1">Ajuste o período ou o técnico para ver os indicadores.</p>
          <button type="button" onClick={clearFilters} className="mt-4 h-10 px-4 rounded-lg border border-default bg-surface hover:bg-surface-2 text-sm font-medium text-primary cursor-pointer">Limpar filtros</button>
        </div>
      )}
      {state === "ready" && <SlaDashboard items={slaItems} metrics={slaMetrics} periodLabel={periodLabel} />}

      {/* Volume e distribuição — painéis anteriores preservados (interações e modais inalterados) */}
      {state === "ready" && (
      <section aria-label="Volume e distribuição" className="rounded-xl border border-default bg-surface shadow-card p-4 sm:p-5">
        <h2 className="text-[15px] font-semibold text-primary">Volume e distribuição</h2>
        <p className="text-xs text-secondary mt-0.5">Chamados por categoria, setor e solicitante no período selecionado.</p>
      <div className="space-y-6 mt-6">
        {/* Interactive Charts: Category Distribution and Ticket States */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Category distribution visualizer */}
        <div className="lg:col-span-12 bg-app border border-default rounded-2xl p-5 hover:border-emerald-500/10 transition-all">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-secondary">Volume de Chamados por Categoria</h3>
            <span className="text-[10px] text-emerald-700 dark:text-emerald-400/80 font-mono flex items-center gap-1">
              <FileText className="w-3 h-3 text-emerald-700 dark:text-emerald-400" /> Clique no tipo para ver descrições
            </span>
          </div>
          <div className="space-y-3.5">
            {allCategoryEntries.map(([cat, count]) => {
              const pct = Math.round((count / maxCategoryCount) * 100);
              const totalPct = total > 0 ? Math.round((count / total) * 100) : 0;
              
              // Map categories to professional corporate colors
              const barColors: Record<string, string> = {
                Hardware: "bg-amber-500",
                Software: "bg-emerald-500",
                Redes: "bg-emerald-600",
                Acesso: "bg-rose-500",
                Sistemas: "bg-emerald-700",
                Outros: "bg-surface-3",
                Projetos: "bg-emerald-600"
              };

              const unit = cat === "Projetos" ? (count !== 1 ? "projetos" : "projeto") : (count !== 1 ? "chamados" : "chamado");

              return (
                <div 
                  key={cat} 
                  onClick={() => {
                    setSelectedCategoryForDetails(cat);
                    setCategorySearchQuery("");
                    setCategoryStatusTab("all");
                  }}
                  className="flex items-center space-x-3 text-xs p-1.5 rounded-xl hover:bg-surface/80 cursor-pointer border border-transparent hover:border-emerald-500/30 transition-all group/cat"
                  title={`Clique para ver as descrições dos chamados da categoria ${cat}`}
                >
                  <div className="w-20 font-semibold text-secondary truncate group-hover/cat:text-emerald-400 transition-colors flex items-center gap-1">
                    <span>{cat}</span>
                  </div>
                  <div className="flex-1 bg-app border border-subtle h-7 rounded-lg overflow-hidden relative flex items-center px-2.5 transition-all group-hover/cat:border-emerald-500/40">
                    <div 
                      className={`absolute top-0 left-0 bottom-0 ${barColors[cat] || "bg-surface-3"} rounded-r-lg transition-all duration-700 opacity-85 group-hover/cat:opacity-100`}
                      style={{ width: `${Math.max(pct, 5)}%`, minWidth: "7.5rem" }}
                    ></div>
                    <span className="relative z-10 text-[10px] font-extrabold text-black uppercase flex items-center justify-between w-full pr-1">
                      <span>{count} {unit}</span>
                      <span className="text-[9px] font-mono text-black/90 opacity-0 group-hover/cat:opacity-100 transition-opacity bg-white/60 px-1.5 py-0.5 rounded font-extrabold shadow-sm">
                        Ver descrições ➔
                      </span>
                    </span>
                  </div>
                  <div className="w-10 text-right text-emerald-700 dark:text-emerald-400 text-[10px] font-bold">{totalPct}%</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top Sectors and Top Requesters section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* Left Panel: CHAMADOS POR SETOR / DEPARTAMENTO */}
        <div className="bg-app border border-default rounded-2xl p-5 hover:border-emerald-500/10 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-secondary">Chamados por Setor / Departamento</h3>
              <span className="border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono">
                {uniqueSectorsCount} Setores
              </span>
            </div>
            
            <div className="space-y-4">
              {sortedSectors.slice(0, 6).map((sector) => {
                const barWidthPct = maxSectorCount > 0 ? (sector.count / maxSectorCount) * 100 : 0;
                return (
                  <div key={sector.name} className="flex items-center space-x-3 text-xs">
                    <div 
                      onClick={() => setSelectedSectorForMembers(sector.name)}
                      className="w-24 md:w-32 font-semibold text-secondary truncate cursor-pointer hover:text-emerald-400 hover:underline transition-all flex items-center gap-1"
                      title="Clique para ver os membros deste setor"
                    >
                      {sector.name}
                    </div>
                    <div 
                      onClick={() => setSelectedSectorForMembers(sector.name)}
                      className="flex-1 bg-app border border-subtle hover:border-emerald-500/30 cursor-pointer h-8 rounded-xl overflow-hidden relative flex items-center px-3.5 transition-all group/bar"
                      title="Clique para ver os membros deste setor"
                    >
                      <div 
                        className="absolute top-0 left-0 bottom-0 bg-emerald-600 rounded-r-xl transition-all duration-700 opacity-90 group-hover/bar:bg-emerald-500"
                        style={{ width: `${Math.max(barWidthPct, 5)}%`, minWidth: "7.5rem" }}
                      ></div>
                      <span className="relative z-10 text-[10px] font-extrabold text-black uppercase">
                        {sector.count} {sector.count === 1 ? "Chamado" : "Chamados"}
                      </span>
                    </div>
                    <div className="w-10 text-right text-emerald-700 dark:text-emerald-400 text-xs font-bold font-mono">{sector.percentage}%</div>
                  </div>
                );
              })}
              {sortedSectors.length === 0 && (
                <div className="text-center py-6 text-xs text-muted font-medium">Nenhum chamado registrado por setor.</div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel: CHAMADOS POR USUÁRIO (TOP SOLICITANTES) */}
        <div className="bg-app border border-default rounded-2xl p-5 hover:border-emerald-500/10 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-secondary">Chamados por Usuário (Top Solicitantes)</h3>
              <span className="border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono">
                {uniqueUsersCount} Usuários
              </span>
            </div>

            <div className="space-y-4">
              {sortedUsers.slice(0, 6).map((user) => {
                const barWidthPct = maxUserCount > 0 ? (user.count / maxUserCount) * 100 : 0;
                return (
                  <div 
                    key={user.name} 
                    onClick={() => handleUserClick(user.name, user.department)}
                    className="flex items-center space-x-3 text-xs p-1.5 rounded-xl hover:bg-white/5 cursor-pointer border border-transparent hover:border-teal-500/10 transition-all group/user"
                    title="Clique para ver o perfil do usuário"
                  >
                    {/* User Avatar */}
                    <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 group-hover/user:border-teal-500/35 flex items-center justify-center shrink-0 transition-colors">
                      <span className="text-emerald-700 dark:text-emerald-400 group-hover/user:text-teal-400 text-xs font-extrabold">{getInitials(user.name)}</span>
                    </div>
                    
                    {/* User Info */}
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="font-bold text-primary text-xs truncate group-hover/user:text-teal-400 transition-colors">{user.name}</span>
                      <span className="text-[10px] text-muted mt-0.5 truncate">{user.department}</span>
                    </div>

                    {/* Progress Bar with count */}
                    <div className="w-28 sm:w-44 bg-app border border-subtle h-8 rounded-xl overflow-hidden relative flex items-center px-3.5 shrink-0">
                      <div 
                        className="absolute top-0 left-0 bottom-0 bg-teal-600 rounded-r-xl transition-all duration-700 opacity-90"
                        style={{ width: `${Math.max(barWidthPct, 5)}%`, minWidth: "7.5rem" }}
                      ></div>
                      <span className="relative z-10 text-[10px] font-extrabold text-black uppercase">
                        {user.count} {user.count === 1 ? "Chamado" : "Chamados"}
                      </span>
                    </div>
                    
                    {/* Percentage */}
                    <div className="w-10 text-right text-teal-700 dark:text-teal-400 text-xs font-bold font-mono shrink-0">{user.percentage}%</div>
                  </div>
                );
              })}
              {sortedUsers.length === 0 && (
                <div className="text-center py-6 text-xs text-muted font-medium">Nenhum chamado registrado por usuário.</div>
              )}
            </div>
          </div>
        </div>
      </div>
      </div>
      </section>
      )}

      {/* Sector Members Modal */}
      {selectedSectorForMembers && (() => {
        const sectorTickets = filteredTickets.filter(t => t.requesterDepartment && departmentKey(t.requesterDepartment) === departmentKey(selectedSectorForMembers));
        
        // Group these by requesterName to get the unique members of this sector and how many tickets they opened
        const memberStats: Record<string, { count: number; department: string }> = {};
        sectorTickets.forEach(t => {
          const name = t.requesterName ? t.requesterName.trim() : "";
          const dept = canonicalDepartment(t.requesterDepartment);
          if (name) {
            if (!memberStats[name]) {
              memberStats[name] = { count: 0, department: dept };
            }
            memberStats[name].count++;
          }
        });

        const sectorMembers = Object.entries(memberStats).map(([name, info]) => ({
          name,
          count: info.count,
          department: info.department
        })).sort((a, b) => b.count - a.count);

        return (
          <div 
            onClick={() => setSelectedSectorForMembers(null)}
            className="fixed inset-0 bg-app/85 backdrop-blur-md z-50 flex items-center justify-center p-4 font-mono cursor-pointer"
          >
            <div 
              onClick={(e) => e.stopPropagation()}
              className="bg-app border border-default w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh] cursor-default"
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-default flex items-center justify-between bg-app/50">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <Users className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Membros de {selectedSectorForMembers}</h3>
                    <p className="text-[10px] text-secondary mt-0.5">{sectorMembers.length} colaboradores com chamados abertos</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedSectorForMembers(null)}
                  className="text-secondary hover:text-primary text-xs font-bold bg-surface hover:bg-surface-2 px-3 py-1.5 rounded-xl transition cursor-pointer border border-default"
                >
                  Fechar
                </button>
              </div>

              {/* Members List */}
              <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-[150px] max-h-[50vh]">
                {sectorMembers.length === 0 ? (
                  <div className="text-center py-12 text-xs text-muted">
                    Nenhum membro encontrado para este setor.
                  </div>
                ) : (
                  sectorMembers.map((member) => (
                    <div 
                      key={member.name}
                      onClick={() => {
                        handleUserClick(member.name, member.department);
                        setSelectedSectorForMembers(null);
                      }}
                      className="flex items-center justify-between p-3 bg-app border border-subtle hover:border-emerald-500/20 rounded-xl cursor-pointer hover:bg-white/5 transition-all group"
                      title="Clique para ver o perfil"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                          <span className="text-emerald-700 dark:text-emerald-400 text-xs font-bold">{getInitials(member.name)}</span>
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-primary group-hover:text-emerald-400 transition-colors">{member.name}</h4>
                          <span className="text-[9px] text-muted font-medium">{member.department}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-3">
                        <span className="text-[10px] font-bold text-secondary uppercase bg-surface border border-default px-2 py-1 rounded-lg">
                          {member.count} {member.count === 1 ? "Chamado" : "Chamados"}
                        </span>
                        <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                          Ver Perfil →
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Custom Export Modal for Individualization */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-app/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-app border border-default rounded-3xl w-full max-w-md overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-default bg-app/30 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Download className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
                <h3 className="font-display font-bold text-sm text-primary">Exportação de SLA por Técnico</h3>
              </div>
              <button 
                onClick={() => setIsExportModalOpen(false)}
                className="p-1.5 rounded-lg bg-surface hover:bg-surface border border-default text-secondary hover:text-primary transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              {/* Selector */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-secondary uppercase tracking-wider flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
                  Selecione o Técnico:
                </label>
                <select
                  value={selectedTechForExport}
                  onChange={(e) => setSelectedTechForExport(e.target.value)}
                  className="w-full bg-app border border-default text-xs text-primary rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 font-bold uppercase tracking-wider transition cursor-pointer"
                >
                  <option value="all">Todos os Técnicos</option>
                  {technicians.map(tech => (
                    <option key={tech} value={tech}>{tech}</option>
                  ))}
                </select>
              </div>

              {/* Action options */}
              <div className="space-y-3 pt-2">
                {selectedTechForExport === "all" ? (
                  <>
                    {/* Mode A: Combined / Consolidated PDF */}
                    <button
                      onClick={() => {
                        exportTechsPerformancePdf();
                        setIsExportModalOpen(false);
                      }}
                      className="w-full p-4 text-left rounded-2xl bg-surface/40 hover:bg-surface border border-default hover:border-emerald-500/20 transition-all cursor-pointer flex gap-3.5 group"
                    >
                      <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 group-hover:bg-emerald-500 group-hover:text-black transition-all">
                        <Layers className="h-4.5 w-4.5 text-emerald-700 dark:text-emerald-400 group-hover:text-black" />
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-bold text-primary group-hover:text-emerald-400 transition-colors">Relatório Geral Consolidado</div>
                        <div className="text-[10px] text-muted mt-1 font-medium leading-relaxed">Gera um único arquivo PDF contendo um painel comparativo e as páginas individuais de cada técnico.</div>
                      </div>
                    </button>

                    {/* Mode B: Multiple separate individual PDFs */}
                    <button
                      onClick={() => {
                        technicians.forEach(tech => {
                          exportIndividualTechPdf(tech);
                        });
                        setIsExportModalOpen(false);
                      }}
                      className="w-full p-4 text-left rounded-2xl bg-surface/40 hover:bg-surface border border-default hover:border-emerald-500/20 transition-all cursor-pointer flex gap-3.5 group"
                    >
                      <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 group-hover:bg-emerald-500 group-hover:text-black transition-all">
                        <FileText className="h-4.5 w-4.5 text-emerald-700 dark:text-emerald-400 group-hover:text-black" />
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-bold text-primary group-hover:text-emerald-400 transition-colors">Exportar PDFs Individuais (Lote)</div>
                        <div className="text-[10px] text-muted mt-1 font-medium leading-relaxed">Gera e faz o download automático de um PDF exclusivo e separado para cada um dos técnicos cadastrados.</div>
                      </div>
                    </button>
                  </>
                ) : (
                  /* Specific individual technician */
                  <button
                    onClick={() => {
                      exportIndividualTechPdf(selectedTechForExport);
                      setIsExportModalOpen(false);
                    }}
                    className="w-full p-4 text-left rounded-2xl bg-surface/40 hover:bg-emerald-500/10 border border-default hover:border-emerald-500/30 transition-all cursor-pointer flex gap-3.5 group"
                  >
                    <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 group-hover:bg-emerald-500 group-hover:text-black transition-all">
                      <User className="h-4.5 w-4.5 text-emerald-700 dark:text-emerald-400 group-hover:text-black" />
                    </div>
                    <div className="flex-1">
                      <div className="text-xs font-bold text-primary group-hover:text-emerald-400 transition-colors">Relatório Individualizado do Técnico</div>
                      <div className="text-[10px] text-muted mt-1 font-medium leading-relaxed">Gera um PDF elegante contendo apenas as métricas de performance, categorias e lista de chamados de <strong className="text-emerald-700 dark:text-emerald-400">{selectedTechForExport}</strong>.</div>
                    </div>
                  </button>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-app/40 border-t border-default text-center text-[10px] text-muted font-medium">
              Escolha o formato ideal para a sua auditoria operacional.
            </div>
          </div>
        </div>
      )}

      {/* Category Tickets Details Modal with Descriptions */}
      {selectedCategoryForDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-app/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-app border border-default rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-default flex items-center justify-between bg-app/60">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-700 dark:text-emerald-400 shrink-0">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm sm:text-base font-extrabold text-primary">
                      Chamados da Categoria: <span className="text-emerald-700 dark:text-emerald-400">{selectedCategoryForDetails}</span>
                    </h3>
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-mono">
                      {
                        filteredTickets.filter(t => {
                          const catStr = t.category as string;
                          if (selectedCategoryForDetails === "Projetos") return !!t.projectDeadline || catStr === "Projetos";
                          if (selectedCategoryForDetails === "Outros") return (!catStr || catStr === "Outros" || (catStr !== "Hardware" && catStr !== "Software" && catStr !== "Redes" && catStr !== "Acesso" && catStr !== "Sistemas" && catStr !== "Projetos")) && !t.projectDeadline;
                          return catStr === selectedCategoryForDetails && !t.projectDeadline;
                        }).length
                      } chamado(s)
                    </span>
                  </div>
                  <p className="text-xs text-secondary mt-0.5">
                    Exibindo descrições e detalhes completos dos chamados registrados.
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setSelectedCategoryForDetails(null);
                  setCategorySearchQuery("");
                  setCategoryStatusTab("all");
                }}
                className="p-2 rounded-xl text-secondary hover:text-primary hover:bg-surface border border-transparent hover:border-default transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Filter / Search Bar */}
            <div className="p-3.5 border-b border-default bg-app/80 flex flex-col sm:flex-row items-center justify-between gap-3 font-mono">
              {/* Search input */}
              <div className="relative w-full sm:w-80">
                <input
                  type="text"
                  value={categorySearchQuery}
                  onChange={(e) => setCategorySearchQuery(e.target.value)}
                  placeholder="Buscar por código, título, solicitante ou descrição..."
                  className="w-full bg-app border border-default focus:border-emerald-500/50 rounded-xl px-3 py-2 text-xs text-primary placeholder-neutral-500 focus:outline-none transition-all"
                />
              </div>

              {/* Status filter tabs */}
              <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto text-[10px]">
                {[
                  { id: "all", label: "Todos" },
                  { id: "Aberto", label: "Abertos" },
                  { id: "Em Atendimento", label: "Em Fila" },
                  { id: "Resolvido", label: "Resolvidos" },
                  { id: "Fechado", label: "Fechados" },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setCategoryStatusTab(tab.id)}
                    className={`px-2.5 py-1 rounded-lg border font-bold transition-all cursor-pointer ${
                      categoryStatusTab === tab.id
                        ? "bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/40"
                        : "bg-app text-secondary border-default hover:border-default"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Content - List of Tickets with Descriptions */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 custom-scrollbar">
              {(() => {
                const categoryList = filteredTickets.filter(t => {
                  let matchesCategory = false;
                  const catStr = t.category as string;
                  if (selectedCategoryForDetails === "Projetos") {
                    matchesCategory = !!t.projectDeadline || catStr === "Projetos";
                  } else if (selectedCategoryForDetails === "Outros") {
                    matchesCategory = (!catStr || catStr === "Outros" || (catStr !== "Hardware" && catStr !== "Software" && catStr !== "Redes" && catStr !== "Acesso" && catStr !== "Sistemas" && catStr !== "Projetos")) && !t.projectDeadline;
                  } else {
                    matchesCategory = catStr === selectedCategoryForDetails && !t.projectDeadline;
                  }

                  if (!matchesCategory) return false;

                  if (categoryStatusTab !== "all" && t.status !== categoryStatusTab) {
                    return false;
                  }

                  if (categorySearchQuery.trim()) {
                    const q = categorySearchQuery.toLowerCase().trim();
                    const matchId = t.id.toLowerCase().includes(q);
                    const matchTitle = t.title.toLowerCase().includes(q);
                    const matchDesc = (t.description || "").toLowerCase().includes(q);
                    const matchUser = (t.requesterName || "").toLowerCase().includes(q);
                    const matchDept = (t.requesterDepartment || "").toLowerCase().includes(q);
                    return matchId || matchTitle || matchDesc || matchUser || matchDept;
                  }

                  return true;
                });

                if (categoryList.length === 0) {
                  return (
                    <div className="py-12 text-center text-muted space-y-3 font-mono">
                      <HelpCircle className="h-10 w-10 text-muted mx-auto" />
                      <div>
                        <h4 className="text-sm font-bold text-secondary">Nenhum chamado encontrado</h4>
                        <p className="text-xs text-muted mt-1">
                          {categorySearchQuery ? "Nenhum resultado corresponde à sua busca." : "Não há chamados registrados para esta categoria com o filtro selecionado."}
                        </p>
                      </div>
                    </div>
                  );
                }

                return categoryList.map(ticket => {
                  const priorityBorder = 
                    ticket.priority === "Urgente" ? "border-l-rose-500" :
                    ticket.priority === "Alta" ? "border-l-amber-500" :
                    ticket.priority === "Média" ? "border-l-emerald-500" : "border-l-neutral-700";

                  return (
                    <div
                      key={ticket.id}
                      className={`bg-app/80 border border-default border-l-4 ${priorityBorder} rounded-2xl p-4 sm:p-5 space-y-3 transition-all hover:border-default shadow-lg`}
                    >
                      {/* Header row: ID, Badges, Date */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-default/80 pb-3">
                        <div className="flex flex-wrap items-center gap-2 font-mono">
                          <span className="text-xs font-black text-emerald-700 dark:text-emerald-400 bg-emerald-950/60 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                            #{ticket.id}
                          </span>
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                            ticket.status === "Aberto" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20" :
                            ticket.status === "Em Atendimento" ? "bg-teal-500/10 text-teal-700 dark:text-teal-400 border border-teal-500/20" :
                            ticket.status === "Resolvido" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20" :
                            ticket.status === "Fechado" ? "bg-surface-2/40 text-secondary border border-default/30" :
                            "bg-surface text-secondary border border-default"
                          }`}>
                            {ticket.status}
                          </span>
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                            ticket.priority === "Urgente" ? "bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20" :
                            ticket.priority === "Alta" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20" :
                            ticket.priority === "Média" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20" :
                            "bg-surface text-secondary border border-default"
                          }`}>
                            Prioridade: {ticket.priority}
                          </span>
                        </div>

                        <div className="text-[11px] text-muted font-mono flex items-center gap-1.5">
                          <Clock className="w-3 h-3 text-muted" />
                          <span>{new Date(ticket.createdAt).toLocaleDateString("pt-BR")} às {new Date(ticket.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      </div>

                      {/* Ticket Title & Solicitante */}
                      <div>
                        <h4 className="text-sm font-bold text-primary tracking-tight flex items-center gap-2">
                          {ticket.title}
                        </h4>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-secondary mt-1 font-mono">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3 text-emerald-700 dark:text-emerald-400" />
                            Solicitante: <strong className="text-primary">{ticket.requesterName || "Não informado"}</strong>
                          </span>
                          {ticket.requesterDepartment && (
                            <span className="bg-surface px-2 py-0.5 rounded text-[10px] text-secondary border border-default">
                              {ticket.requesterDepartment}
                            </span>
                          )}
                          {ticket.assignedTo && (
                            <span className="text-emerald-700 dark:text-emerald-400/90 text-[11px]">
                              Técnico: <strong>{ticket.assignedTo}</strong>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* DESCRIÇÃO COMPLETA DO CHAMADO */}
                      <div className="space-y-1.5 pt-1">
                        <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400/90 uppercase tracking-wider font-mono flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                          Descrição do Chamado:
                        </div>
                        <div className="p-3.5 bg-app/70 border border-default rounded-xl text-xs text-primary leading-relaxed font-sans whitespace-pre-line shadow-inner select-text">
                          {ticket.description && ticket.description.trim() ? ticket.description : <span className="text-muted italic">Sem descrição informada para este chamado.</span>}
                        </div>
                      </div>

                      {/* Optional Action Button to open complete ticket view */}
                      {onSelectTicket && (
                        <div className="pt-2 flex justify-end">
                          <button
                            onClick={() => {
                              onSelectTicket(ticket.id);
                              setSelectedCategoryForDetails(null);
                            }}
                            className="text-xs font-bold font-mono text-emerald-700 dark:text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                          >
                            Abrir Chamado Completo ➔
                          </button>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-default bg-app/60 flex items-center justify-between text-xs text-muted font-mono">
              <span>Clique em "Abrir Chamado Completo" para gerenciar o chamado.</span>
              <button
                onClick={() => setSelectedCategoryForDetails(null)}
                className="px-4 py-1.5 rounded-xl bg-surface hover:bg-surface text-primary font-bold transition cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
