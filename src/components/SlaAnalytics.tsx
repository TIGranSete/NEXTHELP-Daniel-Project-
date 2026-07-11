import { useState } from "react";
import { Ticket } from "../types";
import { AlertCircle, Clock, CheckCircle2, TrendingUp, HelpCircle, Activity, Download, Calendar, User, Users, X, FileText, Layers } from "lucide-react";
import { jsPDF } from "jspdf";

const isTicketOverdue = (t: Ticket) => {
  if (t.status === "Resolvido" || t.status === "Fechado") return false;
  if (t.projectDeadline) {
    const deadlineDate = new Date(t.projectDeadline);
    deadlineDate.setHours(23, 59, 59, 999);
    return deadlineDate.getTime() < Date.now();
  }
  return new Date(t.slaLimit).getTime() < Date.now();
};

interface SlaAnalyticsProps {
  tickets: Ticket[];
  users?: any[];
  onViewUserProfile?: (user: any) => void;
}

export default function SlaAnalytics({ tickets, users = [], onViewUserProfile }: SlaAnalyticsProps) {
  const [period, setPeriod] = useState<string>("all");
  const [selectedTech, setSelectedTech] = useState<string>("all");
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [selectedTechForExport, setSelectedTechForExport] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [selectedSectorForMembers, setSelectedSectorForMembers] = useState<string | null>(null);

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
  const filteredTickets = tickets.filter(t => {
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
  });

  // Filter tickets that are resolved or closed and have valid createdAt & updatedAt
  const resolvedWithTime = filteredTickets.filter(t => 
    (t.status === "Resolvido" || t.status === "Fechado") && t.createdAt && t.updatedAt
  );

  let averageResolutionTimeStr = "N/A";
  if (resolvedWithTime.length > 0) {
    const totalMs = resolvedWithTime.reduce((sum, t) => {
      const duration = new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime();
      return sum + (duration > 0 ? duration : 0);
    }, 0);
    const avgMs = totalMs / resolvedWithTime.length;
    
    // Format average resolution time elegantly
    const avgMinutes = avgMs / (1000 * 60);
    if (avgMinutes < 1) {
      averageResolutionTimeStr = `${Math.round(avgMs / 1000)}s`;
    } else if (avgMinutes < 60) {
      averageResolutionTimeStr = `${Math.round(avgMinutes)} min`;
    } else {
      const hours = Math.floor(avgMinutes / 60);
      const mins = Math.round(avgMinutes % 60);
      averageResolutionTimeStr = mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
  }

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

  // Group by sector (requesterDepartment)
  const sectorCounts: Record<string, number> = {};
  filteredTickets.forEach(t => {
    const dept = t.requesterDepartment ? t.requesterDepartment.trim() : "";
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
    const dept = t.requesterDepartment ? t.requesterDepartment.trim() : "Geral";
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
  const slaCompliancePercent = total > 0 ? Math.round(((total - overdueCount) / total) * 100) : 100;

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
    doc.setTextColor(15, 23, 42); // slate-900
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
      ["Taxa de Cumprimento de SLA", `${slaCompliancePercent}%`, "Meta Corporativa: 92%"],
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
        doc.setTextColor(15, 23, 42); // Restore default slate-900
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
      const slaCompliance = totalAssigned > 0 ? Math.round(((totalAssigned - overdue) / totalAssigned) * 100) : 100;

      // TMA calculation
      const resolvedWithTime = techTickets.filter(t => 
        (t.status === "Resolvido" || t.status === "Fechado") && t.createdAt && t.updatedAt
      );

      let tmaStr = "N/A";
      if (resolvedWithTime.length > 0) {
        const totalMs = resolvedWithTime.reduce((sum, t) => {
          const duration = new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime();
          return sum + (duration > 0 ? duration : 0);
        }, 0);
        const avgMs = totalMs / resolvedWithTime.length;
        const avgMinutes = avgMs / (1000 * 60);
        if (avgMinutes < 1) {
          tmaStr = `${Math.round(avgMs / 1000)}s`;
        } else if (avgMinutes < 60) {
          tmaStr = `${Math.round(avgMinutes)} min`;
        } else {
          const hours = Math.floor(avgMinutes / 60);
          const mins = Math.round(avgMinutes % 60);
          tmaStr = mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
        }
      }

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
      doc.text(`${summary.slaCompliance}%`, 125, yPos);
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
      doc.text(`Eficiencia / SLA Individual: ${summary.slaCompliance}%`, 20, yPos + 22);
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
    const slaCompliance = totalAssigned > 0 ? Math.round(((totalAssigned - overdue) / totalAssigned) * 100) : 100;

    const resolvedWithTime = techTickets.filter(t => 
      (t.status === "Resolvido" || t.status === "Fechado") && t.createdAt && t.updatedAt
    );

    let tmaStr = "N/A";
    if (resolvedWithTime.length > 0) {
      const totalMs = resolvedWithTime.reduce((sum, t) => {
        const duration = new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime();
        return sum + (duration > 0 ? duration : 0);
      }, 0);
      const avgMs = totalMs / resolvedWithTime.length;
      const avgMinutes = avgMs / (1000 * 60);
      if (avgMinutes < 1) {
        tmaStr = `${Math.round(avgMs / 1000)}s`;
      } else if (avgMinutes < 60) {
        tmaStr = `${Math.round(avgMinutes)} min`;
      } else {
        const hours = Math.floor(avgMinutes / 60);
        const mins = Math.round(avgMinutes % 60);
        tmaStr = mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
      }
    }

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
    doc.text(`Indice de SLA Individual: ${slaCompliance}%`, 22, yPos + 30);
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


  return (
    <div className="bg-black rounded-2xl border border-emerald-500/15 p-6 shadow-neon-sm hover:shadow-neon transition-all duration-500 mb-8 animate-in fade-in duration-300">
      
      {/* Dynamic Header with Indicators & Tag */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center space-x-2">
          <Activity className="h-5 w-5 text-emerald-400 animate-pulse" />
          <h2 className="font-display text-lg font-bold text-white tracking-tight">Indicadores Operacionais <span className="text-emerald-400 font-mono text-xs ml-2">[SLA & Métricas]</span></h2>
        </div>
        <span className="text-xs bg-emerald-500/10 text-emerald-400 px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 self-start sm:self-auto border border-emerald-500/20 shadow-neon-sm">
          <TrendingUp className="h-3.5 w-3.5" /> Tempo de Resposta Reduzido por IA
        </span>
      </div>

      {/* Control Panel: Period Filter, Technician Filter and Export Button */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6 p-4 bg-[#050505] border border-neutral-900 rounded-2xl">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                <Calendar className="h-4 w-4 text-emerald-400" />
                Período:
              </label>
              <div className="flex flex-wrap bg-black border border-neutral-900 p-1 rounded-xl shadow-sm">
                {[
                  { id: "7d", label: "Últimos 7 dias" },
                  { id: "30d", label: "Últimos 30 dias" },
                  { id: "90d", label: "Últimos 90 dias" },
                  { id: "all", label: "Todo o período" },
                  { id: "custom", label: "Personalizado" }
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPeriod(p.id)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                      period === p.id 
                        ? "bg-emerald-400 text-black font-extrabold shadow-neon-sm" 
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {period === "custom" && (
              <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200 mt-2 lg:mt-0 bg-black/40 border border-neutral-900/60 rounded-xl p-1.5">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-black border border-neutral-900 rounded-lg py-1 px-2 text-[10px] text-slate-300 focus:outline-none focus:border-emerald-500 cursor-pointer font-bold uppercase"
                />
                <span className="text-[9px] text-slate-500 font-bold uppercase">até</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-black border border-neutral-900 rounded-lg py-1 px-2 text-[10px] text-slate-300 focus:outline-none focus:border-emerald-500 cursor-pointer font-bold uppercase"
                />
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
              <User className="h-4 w-4 text-emerald-400" />
              Técnico Responsável:
            </label>
            <select
              value={selectedTech}
              onChange={(e) => setSelectedTech(e.target.value)}
              className="bg-black border border-neutral-900 text-xs text-slate-300 rounded-xl px-3 py-1.5 focus:outline-none focus:border-emerald-500 font-bold uppercase tracking-wider transition cursor-pointer"
            >
              <option value="all">Todos os Técnicos</option>
              {technicians.map(tech => (
                <option key={tech} value={tech}>{tech}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 self-start xl:self-auto w-full sm:w-auto">
          <button
            onClick={exportToPdf}
            className="px-4 py-2 bg-neutral-900 hover:bg-neutral-850 text-slate-300 border border-neutral-800 font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-xs cursor-pointer"
          >
            <Download className="h-4 w-4 text-emerald-400" />
            Relatório Geral
          </button>
          <button
            onClick={() => {
              setSelectedTechForExport(selectedTech);
              setIsExportModalOpen(true);
            }}
            className="px-4 py-2 bg-emerald-400 hover:bg-emerald-300 text-black font-extrabold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-xs shadow-neon cursor-pointer"
          >
            <User className="h-4 w-4" />
            Exportar por Técnico
          </button>
        </div>
      </div>

      {/* Grid of KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        
        {/* KPI 1: SLA Compliance */}
        <div className="bg-[#050505] border border-neutral-900 hover:border-emerald-500/20 rounded-2xl p-4 flex flex-col justify-between min-h-[120px] transition-all">
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[10px]">Cumprimento de SLA</span>
            <Clock className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-3xl font-black font-display text-white neon-glow-text">{slaCompliancePercent}%</div>
            <p className="text-[10px] text-neutral-500 mt-1 font-mono">Meta corporativa: 92%</p>
          </div>
          {/* Progress Micro Bar */}
          <div className="w-full bg-neutral-950 h-1 rounded-full mt-2 overflow-hidden">
            <div 
              className="bg-emerald-400 h-full rounded-full transition-all duration-500 shadow-neon-sm" 
              style={{ width: `${slaCompliancePercent}%` }}
            ></div>
          </div>
        </div>

        {/* KPI 2: Critical in Queue */}
        <div className="bg-[#050505] border border-neutral-900 hover:border-emerald-500/20 rounded-2xl p-4 flex flex-col justify-between min-h-[120px] transition-all">
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[10px]">Críticos Ativos</span>
            <AlertCircle className={`h-4 w-4 ${criticalCount > 0 ? "text-rose-500 animate-pulse" : "text-neutral-500"}`} />
          </div>
          <div>
            <div className="text-3xl font-black font-display text-white">{criticalCount}</div>
            <p className="text-[10px] text-neutral-500 mt-1 font-mono">Prioridade Alta/Urgente</p>
          </div>
          {/* Status color indicator */}
          <div className="mt-2 text-[10px] flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${criticalCount > 0 ? "bg-rose-500 animate-ping" : "bg-emerald-400"}`}></span>
            <span className="text-neutral-400 font-mono">{criticalCount > 0 ? "Ação imediata" : "Fila sob controle"}</span>
          </div>
        </div>

        {/* KPI 3: Resolved tickets */}
        <div className="bg-[#050505] border border-neutral-900 hover:border-emerald-500/20 rounded-2xl p-4 flex flex-col justify-between min-h-[120px] transition-all">
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[10px]">Resolvidos Recentes</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-3xl font-black font-display text-white">{resolvedCount}</div>
            <p className="text-[10px] text-neutral-500 mt-1 font-mono">Eficiência da equipe de TI</p>
          </div>
          <div className="w-full bg-neutral-950 h-1 rounded-full mt-2 overflow-hidden">
            <div 
              className="bg-emerald-400 h-full rounded-full" 
              style={{ width: `${total > 0 ? (resolvedCount / total) * 100 : 0}%` }}
            ></div>
          </div>
        </div>

        {/* KPI 4: Tempo Médio de Atendimento (TMA) */}
        <div className="bg-[#050505] border border-neutral-900 hover:border-emerald-500/20 rounded-2xl p-4 flex flex-col justify-between min-h-[120px] transition-all">
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[10px]">Tempo Médio (TMA)</span>
            <Clock className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-3xl font-black font-display text-white neon-glow-text">{averageResolutionTimeStr}</div>
            <p className="text-[10px] text-neutral-500 mt-1 font-mono">Tempo médio de conclusão</p>
          </div>
          <div className="mt-2 text-[10px] flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
            <span className="text-neutral-400 font-mono">Baseado em {resolvedWithTime.length} chamado(s)</span>
          </div>
        </div>

        {/* KPI 5: Volume de Projetos */}
        <div className="bg-[#050505] border border-neutral-900 hover:border-emerald-500/20 rounded-2xl p-4 flex flex-col justify-between min-h-[120px] transition-all">
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[10px]">Volume de Projetos</span>
            <Layers className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-3xl font-black font-display text-white">{projectsCount}</div>
            <p className="text-[10px] text-neutral-500 mt-1 font-mono">{activeProjectsCount} ativos // {resolvedProjectsCount} ok</p>
          </div>
          {/* Completion rate bar */}
          <div className="w-full bg-neutral-950 h-1 rounded-full mt-2 overflow-hidden">
            <div 
              className="bg-emerald-400 h-full rounded-full transition-all duration-500 shadow-neon-sm" 
              style={{ width: `${projectsCount > 0 ? (resolvedProjectsCount / projectsCount) * 100 : 0}%` }}
            ></div>
          </div>
        </div>

        {/* KPI 6: Triagem Automática */}
        <div className="bg-emerald-950/15 border border-emerald-500/30 text-white rounded-2xl p-4 flex flex-col justify-between min-h-[120px] shadow-neon-sm hover:border-emerald-500/40 transition-all">
          <div className="flex items-center justify-between text-emerald-300 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[10px]">Automação com IA</span>
            <span className="bg-emerald-400 text-black font-extrabold text-[8px] tracking-wider px-1.5 py-0.5 rounded uppercase font-mono shadow-neon-sm">Gemini v3.5</span>
          </div>
          <div>
            <div className="text-3xl font-black font-display text-emerald-400 neon-glow-text">94.8%</div>
            <p className="text-[10px] text-emerald-300/80 mt-1 font-mono">Redução no tempo de triagem</p>
          </div>
          <p className="text-[9px] text-emerald-400/60 italic font-medium">Classificação e dicas geradas instantaneamente</p>
        </div>

      </div>

      {/* Interactive Charts: Category Distribution and Ticket States */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 font-mono">
        
        {/* Category distribution visualizer */}
        <div className="lg:col-span-7 bg-[#050505] border border-neutral-900 rounded-2xl p-5 hover:border-emerald-500/10 transition-all">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-4">Volume de Chamados por Categoria</h3>
          <div className="space-y-3.5">
            {allCategoryEntries.map(([cat, count]) => {
              const pct = Math.round((count / maxCategoryCount) * 100);
              const totalPct = total > 0 ? Math.round((count / total) * 100) : 0;
              
              // Map categories to beautiful electric colors fitting the dark theme
              const barColors: Record<string, string> = {
                Hardware: "bg-amber-500",
                Software: "bg-emerald-300 shadow-neon-sm",
                Redes: "bg-emerald-400 shadow-neon-sm",
                Acesso: "bg-rose-500",
                Sistemas: "bg-emerald-500 shadow-neon-sm",
                Outros: "bg-neutral-500",
                Projetos: "bg-cyan-400 shadow-neon-sm"
              };

              const unit = cat === "Projetos" ? (count !== 1 ? "projetos" : "projeto") : (count !== 1 ? "chamados" : "chamado");

              return (
                <div key={cat} className="flex items-center space-x-3 text-xs">
                  <div className="w-20 font-semibold text-neutral-300 truncate">{cat}</div>
                  <div className="flex-1 bg-black border border-neutral-950 h-6 rounded-lg overflow-hidden relative flex items-center px-2.5">
                    <div 
                      className={`absolute top-0 left-0 bottom-0 ${barColors[cat] || "bg-neutral-500"} rounded-r-lg transition-all duration-700 opacity-85`}
                      style={{ width: `${Math.max(pct, 5)}%` }}
                    ></div>
                    <span className="relative z-10 text-[10px] font-extrabold text-black uppercase">
                      {count} {unit}
                    </span>
                  </div>
                  <div className="w-10 text-right text-emerald-400 text-[10px] font-bold">{totalPct}%</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Dynamic Ticket State doughnut layout */}
        <div className="lg:col-span-5 bg-[#050505] border border-neutral-900 rounded-2xl p-5 flex flex-col justify-between hover:border-emerald-500/10 transition-all">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3">Distribuição por Status</h3>
          
          <div className="flex items-center justify-center py-4 flex-1">
            {/* Elegant SVG Custom Doughnut Chart */}
            <div className="relative h-32 w-32 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 42 42">
                <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#121212" strokeWidth="4"></circle>
                
                {total > 0 ? (
                  <>
                    {/* Open circle segment */}
                    <circle 
                      cx="21" cy="21" r="15.915" fill="transparent" 
                      stroke="#f59e0b" strokeWidth="4" 
                      strokeDasharray={`${(openCount / total) * 100} ${100 - (openCount / total) * 100}`}
                      strokeDashoffset="100"
                    ></circle>
                    {/* In progress circle segment */}
                    <circle 
                      cx="21" cy="21" r="15.915" fill="transparent" 
                      stroke="#00FF55" strokeWidth="4" 
                      strokeDasharray={`${(inProgressCount / total) * 100} ${100 - (inProgressCount / total) * 100}`}
                      strokeDashoffset={`${100 - (openCount / total) * 100}`}
                    ></circle>
                    {/* Resolved circle segment */}
                    <circle 
                      cx="21" cy="21" r="15.915" fill="transparent" 
                      stroke="#00802B" strokeWidth="4" 
                      strokeDasharray={`${(resolvedCount / total) * 100} ${100 - (resolvedCount / total) * 100}`}
                      strokeDashoffset={`${100 - (openCount / total) * 100 - (inProgressCount / total) * 100}`}
                    ></circle>
                  </>
                ) : null}
              </svg>
              {/* Inner Label */}
              <div className="absolute flex flex-col items-center">
                <span className="text-2xl font-black font-display text-white neon-glow-text">{total}</span>
                <span className="text-[9px] uppercase tracking-wider text-neutral-500 font-bold">Total</span>
              </div>
            </div>
          </div>

          {/* Map legend labels */}
          <div className="grid grid-cols-3 gap-2.5 text-[10px] pt-3 border-t border-neutral-900">
            <div className="flex flex-col items-center p-1.5 bg-amber-500/5 rounded-xl border border-amber-500/10 text-center">
              <span className="font-bold text-amber-400">{openCount}</span>
              <span className="text-neutral-400 text-[9px] font-semibold">Abertos</span>
            </div>
            <div className="flex flex-col items-center p-1.5 bg-emerald-500/5 rounded-xl border border-emerald-500/10 text-center">
              <span className="font-bold text-emerald-400">{inProgressCount}</span>
              <span className="text-neutral-400 text-[9px] font-semibold">Em Fila</span>
            </div>
            <div className="flex flex-col items-center p-1.5 bg-emerald-950/10 rounded-xl border border-emerald-400/20 text-center">
              <span className="font-bold text-emerald-300">{resolvedCount}</span>
              <span className="text-neutral-400 text-[9px] font-semibold">Concluídos</span>
            </div>
          </div>

        </div>

      </div>

      {/* Top Sectors and Top Requesters section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 font-mono mt-6">
        {/* Left Panel: CHAMADOS POR SETOR / DEPARTAMENTO */}
        <div className="bg-[#050505] border border-neutral-900 rounded-2xl p-5 hover:border-emerald-500/10 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">Chamados por Setor / Departamento</h3>
              <span className="border border-emerald-500/30 text-emerald-400 px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono">
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
                      className="w-24 md:w-32 font-semibold text-neutral-300 truncate cursor-pointer hover:text-emerald-400 hover:underline transition-all flex items-center gap-1"
                      title="Clique para ver os membros deste setor"
                    >
                      {sector.name}
                    </div>
                    <div 
                      onClick={() => setSelectedSectorForMembers(sector.name)}
                      className="flex-1 bg-black border border-neutral-950 hover:border-emerald-500/30 cursor-pointer h-8 rounded-xl overflow-hidden relative flex items-center px-3.5 transition-all group/bar"
                      title="Clique para ver os membros deste setor"
                    >
                      <div 
                        className="absolute top-0 left-0 bottom-0 bg-emerald-500 rounded-r-xl transition-all duration-700 opacity-90 shadow-neon-sm group-hover/bar:bg-emerald-400"
                        style={{ width: `${Math.max(barWidthPct, 5)}%` }}
                      ></div>
                      <span className="relative z-10 text-[10px] font-extrabold text-black uppercase">
                        {sector.count} {sector.count === 1 ? "Chamado" : "Chamados"}
                      </span>
                    </div>
                    <div className="w-10 text-right text-emerald-400 text-xs font-bold font-mono">{sector.percentage}%</div>
                  </div>
                );
              })}
              {sortedSectors.length === 0 && (
                <div className="text-center py-6 text-xs text-neutral-500 font-medium">Nenhum chamado registrado por setor.</div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel: CHAMADOS POR USUÁRIO (TOP SOLICITANTES) */}
        <div className="bg-[#050505] border border-neutral-900 rounded-2xl p-5 hover:border-emerald-500/10 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">Chamados por Usuário (Top Solicitantes)</h3>
              <span className="border border-emerald-500/30 text-emerald-400 px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono">
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
                      <span className="text-emerald-400 group-hover/user:text-teal-400 text-xs font-extrabold">{getInitials(user.name)}</span>
                    </div>
                    
                    {/* User Info */}
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="font-bold text-white text-xs truncate group-hover/user:text-teal-400 transition-colors">{user.name}</span>
                      <span className="text-[10px] text-slate-500 mt-0.5 truncate">{user.department}</span>
                    </div>

                    {/* Progress Bar with count */}
                    <div className="w-28 sm:w-44 bg-black border border-neutral-950 h-8 rounded-xl overflow-hidden relative flex items-center px-3.5 shrink-0">
                      <div 
                        className="absolute top-0 left-0 bottom-0 bg-teal-500 rounded-r-xl transition-all duration-700 opacity-90 shadow-neon-sm"
                        style={{ width: `${Math.max(barWidthPct, 5)}%` }}
                      ></div>
                      <span className="relative z-10 text-[10px] font-extrabold text-black uppercase">
                        {user.count} {user.count === 1 ? "Chamado" : "Chamados"}
                      </span>
                    </div>
                    
                    {/* Percentage */}
                    <div className="w-10 text-right text-teal-400 text-xs font-bold font-mono shrink-0">{user.percentage}%</div>
                  </div>
                );
              })}
              {sortedUsers.length === 0 && (
                <div className="text-center py-6 text-xs text-neutral-500 font-medium">Nenhum chamado registrado por usuário.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sector Members Modal */}
      {selectedSectorForMembers && (() => {
        const sectorTickets = filteredTickets.filter(t => t.requesterDepartment && t.requesterDepartment.trim().toLowerCase() === selectedSectorForMembers.trim().toLowerCase());
        
        // Group these by requesterName to get the unique members of this sector and how many tickets they opened
        const memberStats: Record<string, { count: number; department: string }> = {};
        sectorTickets.forEach(t => {
          const name = t.requesterName ? t.requesterName.trim() : "";
          const dept = t.requesterDepartment ? t.requesterDepartment.trim() : "";
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
            className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 font-mono cursor-pointer"
          >
            <div 
              onClick={(e) => e.stopPropagation()}
              className="bg-[#050505] border border-neutral-900 w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh] cursor-default"
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-neutral-900 flex items-center justify-between bg-black/50">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <Users className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Membros de {selectedSectorForMembers}</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">{sectorMembers.length} colaboradores com chamados abertos</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedSectorForMembers(null)}
                  className="text-slate-400 hover:text-white text-xs font-bold bg-neutral-900 hover:bg-neutral-800 px-3 py-1.5 rounded-xl transition cursor-pointer border border-neutral-800"
                >
                  Fechar
                </button>
              </div>

              {/* Members List */}
              <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-[150px] max-h-[50vh]">
                {sectorMembers.length === 0 ? (
                  <div className="text-center py-12 text-xs text-slate-500">
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
                      className="flex items-center justify-between p-3 bg-black border border-neutral-950 hover:border-emerald-500/20 rounded-xl cursor-pointer hover:bg-white/5 transition-all group"
                      title="Clique para ver o perfil"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                          <span className="text-emerald-400 text-xs font-bold">{getInitials(member.name)}</span>
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-neutral-200 group-hover:text-emerald-400 transition-colors">{member.name}</h4>
                          <span className="text-[9px] text-slate-500 font-medium">{member.department}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-3">
                        <span className="text-[10px] font-bold text-slate-400 uppercase bg-neutral-900 border border-neutral-800 px-2 py-1 rounded-lg">
                          {member.count} {member.count === 1 ? "Chamado" : "Chamados"}
                        </span>
                        <span className="text-[10px] text-emerald-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
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
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#050505] border border-neutral-900 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-neutral-900 bg-black/30 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Download className="h-5 w-5 text-emerald-400" />
                <h3 className="font-display font-bold text-sm text-white">Exportação de SLA por Técnico</h3>
              </div>
              <button 
                onClick={() => setIsExportModalOpen(false)}
                className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              {/* Selector */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-emerald-400" />
                  Selecione o Técnico:
                </label>
                <select
                  value={selectedTechForExport}
                  onChange={(e) => setSelectedTechForExport(e.target.value)}
                  className="w-full bg-black border border-neutral-900 text-xs text-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 font-bold uppercase tracking-wider transition cursor-pointer"
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
                      className="w-full p-4 text-left rounded-2xl bg-neutral-900/40 hover:bg-neutral-900 border border-neutral-900 hover:border-emerald-500/20 transition-all cursor-pointer flex gap-3.5 group"
                    >
                      <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 group-hover:bg-emerald-500 group-hover:text-black transition-all">
                        <Layers className="h-4.5 w-4.5 text-emerald-400 group-hover:text-black" />
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors">Relatório Geral Consolidado</div>
                        <div className="text-[10px] text-slate-500 mt-1 font-medium leading-relaxed">Gera um único arquivo PDF contendo um painel comparativo e as páginas individuais de cada técnico.</div>
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
                      className="w-full p-4 text-left rounded-2xl bg-neutral-900/40 hover:bg-neutral-900 border border-neutral-900 hover:border-emerald-500/20 transition-all cursor-pointer flex gap-3.5 group"
                    >
                      <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 group-hover:bg-emerald-500 group-hover:text-black transition-all">
                        <FileText className="h-4.5 w-4.5 text-emerald-400 group-hover:text-black" />
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors">Exportar PDFs Individuais (Lote)</div>
                        <div className="text-[10px] text-slate-500 mt-1 font-medium leading-relaxed">Gera e faz o download automático de um PDF exclusivo e separado para cada um dos técnicos cadastrados.</div>
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
                    className="w-full p-4 text-left rounded-2xl bg-neutral-900/40 hover:bg-emerald-500/10 border border-neutral-900 hover:border-emerald-500/30 transition-all cursor-pointer flex gap-3.5 group"
                  >
                    <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 group-hover:bg-emerald-500 group-hover:text-black transition-all">
                      <User className="h-4.5 w-4.5 text-emerald-400 group-hover:text-black" />
                    </div>
                    <div className="flex-1">
                      <div className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors">Relatório Individualizado do Técnico</div>
                      <div className="text-[10px] text-slate-500 mt-1 font-medium leading-relaxed">Gera um PDF elegante contendo apenas as métricas de performance, categorias e lista de chamados de <strong className="text-emerald-400">{selectedTechForExport}</strong>.</div>
                    </div>
                  </button>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-black/40 border-t border-neutral-900 text-center text-[10px] text-slate-500 font-medium">
              Escolha o formato ideal para a sua auditoria operacional.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
