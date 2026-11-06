import type { ElementType } from "react";
import {
  Layers,
  FolderKanban,
  Clock,
  Users,
  LayoutDashboard,
  Ticket,
  BookOpen,
  BarChart3,
  Settings,
} from "lucide-react";

/** Módulos que realmente existem hoje (valores de `activeTab` em App.tsx). */
export type NavTab = "painel" | "projetos" | "sla" | "colaboradores" | "banco_dados";

export interface NavItem {
  id: NavTab;
  label: string;
  icon: ElementType;
  /** Somente equipe de TI enxerga (mesma regra da navegação anterior: isTechUser). */
  techOnly?: boolean;
}

export interface NavGroup {
  id: string;
  /** Rótulo da seção da sidebar (grupos consecutivos com o mesmo rótulo compartilham o cabeçalho). */
  section: string;
  label: string;
  icon: ElementType;
  items: NavItem[];
}

/**
 * Navegação ativa da Fase 1. Todos os itens abaixo apontam para telas já existentes.
 * Permissões idênticas às do header antigo: Fila para todos; demais só para TI.
 */
/**
 * Módulo "Projetos em Andamento": DESATIVADO por ora (não é necessário no momento).
 * O código e os dados foram preservados; para reativar basta mudar para `true`.
 * Enquanto estiver desativado: o item some do menu, a Fila mostra também os chamados que têm prazo
 * de projeto (para não ficarem invisíveis) e o formulário de Novo Chamado não oferece "Projeto".
 */
export const PROJECTS_MODULE_ENABLED = false;

const ALL_NAV_GROUPS: NavGroup[] = [
  {
    id: "chamados",
    section: "Operação",
    label: "Central de Chamados",
    icon: Ticket,
    items: [{ id: "painel", label: "Fila de Chamados", icon: Layers }],
  },
  {
    id: "projetos",
    section: "Gestão",
    label: "Gestão de Projetos",
    icon: FolderKanban,
    items: [{ id: "projetos", label: "Projetos em Andamento", icon: FolderKanban, techOnly: true }],
  },
  {
    id: "sla",
    section: "Gestão",
    label: "Controle de SLA",
    icon: Clock,
    items: [{ id: "sla", label: "Análise de SLA", icon: Clock, techOnly: true }],
  },
  {
    id: "colaboradores",
    section: "Gestão",
    label: "Gestão de Colaboradores",
    icon: Users,
    items: [{ id: "colaboradores", label: "Gestão de Colaboradores", icon: Users, techOnly: true }],
  },
];

export const NAV_GROUPS: NavGroup[] = ALL_NAV_GROUPS.filter((g) => PROJECTS_MODULE_ENABLED || g.id !== "projetos");

/**
 * Registro de planejamento (NÃO renderizado). Serve de roteiro para as próximas fases;
 * nenhum destes itens gera página, botão ou indicador até existir funcionalidade real.
 */
export const PLANNED_MODULES: { group: string; icon: ElementType; items: string[] }[] = [
  { group: "Painel Principal", icon: LayoutDashboard, items: ["Visão Geral (Dashboard)", "Minha Atividade"] },
  { group: "Central de Chamados", icon: Ticket, items: ["Abrir Novo Chamado", "Meus Chamados", "Histórico de Chamados"] },
  { group: "Gestão de Projetos", icon: FolderKanban, items: ["Tarefas", "Prazos e Entregas"] },
  { group: "Controle de SLA", icon: Clock, items: ["Indicadores", "Chamados em Risco", "Violações de SLA"] },
  { group: "Gestão de Colaboradores", icon: Users, items: ["Equipe Técnica", "Departamentos e Unidades"] },
  { group: "Base de Conhecimento", icon: BookOpen, items: ["Artigos", "Soluções Frequentes", "Procedimentos"] },
  { group: "Relatórios", icon: BarChart3, items: ["Relatórios Operacionais", "Produtividade", "Exportações"] },
  { group: "Administração", icon: Settings, items: ["Configurações", "Categorias e Prioridades", "Perfis e Permissões", "Auditoria"] },
];

export function visibleGroups(isTechUser: boolean): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.techOnly || isTechUser),
  })).filter((g) => g.items.length > 0);
}

/** [módulo, página] para o breadcrumb da topbar. */
export function breadcrumbFor(tab: NavTab): [string, string] {
  for (const g of NAV_GROUPS) {
    const item = g.items.find((i) => i.id === tab);
    if (item) return [g.label, item.label];
  }
  return ["Gran7 Help", "Administração"];
}
