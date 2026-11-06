import React, { useState } from "react";
import { ChevronDown, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { NavGroup, NavItem, NavTab } from "./navigation";

export const SIDEBAR_EXPANDED = 256;
export const SIDEBAR_COLLAPSED = 72;

interface SidebarUser {
  name: string;
  department?: string;
  photo?: string | null;
  roleLabel: string;
}

interface AppSidebarProps {
  groups: NavGroup[];
  activeTab: NavTab;
  onNavigate: (tab: NavTab) => void;
  onLogoClick: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  logoSrc: string;
  markSrc: string;
  user: SidebarUser;
  onOpenProfile: () => void;
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).map((n) => n[0]).join("").substring(0, 2).toUpperCase();
}

interface NavButtonProps {
  key?: React.Key;
  item: NavItem;
  active: boolean;
  compact: boolean;
  nested?: boolean;
  onClick: () => void;
}

function NavButton({ item, active, compact, nested, onClick }: NavButtonProps) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      title={compact ? item.label : undefined}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={`group relative w-full flex items-center rounded-lg text-sm font-medium transition-colors duration-150 cursor-pointer ${
        compact ? "justify-center h-11" : `h-10 gap-2.5 px-2 ${nested ? "ml-4 w-[calc(100%-1rem)]" : ""}`
      } ${
        active
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "text-secondary hover:bg-surface-2 hover:text-primary"
      }`}
    >
      {active && !compact && <span className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r-full bg-emerald-500" aria-hidden />}
      <span
        className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center transition-colors duration-150 ${
          active
            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/30"
            : "text-secondary group-hover:text-primary"
        }`}
      >
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </span>
      {!compact && <span className="truncate">{item.label}</span>}
    </button>
  );
}

function SectionLabel({ label, compact, first }: { label: string; compact: boolean; first: boolean }) {
  if (compact) return first ? null : <div className="my-2 mx-3 h-px bg-sidebar-line" role="separator" />;
  return <p className={`px-3 text-xs font-semibold tracking-wide text-muted ${first ? "mb-1.5" : "mt-5 mb-1.5"}`}>{label}</p>;
}

function SidebarBody({
  groups, activeTab, onNavigate, onLogoClick, collapsed, logoSrc, markSrc, user, onOpenProfile, trailing,
}: Pick<AppSidebarProps, "groups" | "activeTab" | "onNavigate" | "onLogoClick" | "logoSrc" | "markSrc" | "user" | "onOpenProfile"> & {
  collapsed: boolean;
  trailing?: React.ReactNode;
}) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  return (
    <>
      <div className={`h-14 shrink-0 flex items-center border-b border-sidebar-line ${collapsed ? "justify-center" : "px-4 justify-between"}`}>
        <button
          type="button"
          onClick={onLogoClick}
          className="flex items-center cursor-pointer rounded-md"
          title="Ir para o início"
          aria-label="Ir para o início"
        >
          <img
            src={collapsed ? markSrc : logoSrc}
            alt="GRAN7"
            className={collapsed ? "h-9 w-9 object-contain" : "h-10 w-auto object-contain"}
          />
        </button>
        {trailing}
      </div>

      <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-4">
        {groups.map((group, gi) => {
          const showSection = gi === 0 || groups[gi - 1].section !== group.section;
          const sectionEl = showSection ? <SectionLabel label={group.section} compact={collapsed} first={gi === 0} /> : null;

          if (group.items.length === 1) {
            const item = group.items[0];
            return (
              <React.Fragment key={group.id}>
                {sectionEl}
                <div className="space-y-1">
                  <NavButton item={item} active={activeTab === item.id} compact={collapsed} onClick={() => onNavigate(item.id)} />
                </div>
              </React.Fragment>
            );
          }

          const hasActive = group.items.some((i) => i.id === activeTab);
          const open = openGroups[group.id] ?? hasActive;
          const GroupIcon = group.icon;
          if (collapsed) {
            return (
              <React.Fragment key={group.id}>
                {sectionEl}
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <NavButton key={item.id} item={item} active={activeTab === item.id} compact onClick={() => onNavigate(item.id)} />
                  ))}
                </div>
              </React.Fragment>
            );
          }
          return (
            <React.Fragment key={group.id}>
              {sectionEl}
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenGroups((s) => ({ ...s, [group.id]: !open }))}
                className="w-full h-10 px-2.5 flex items-center gap-3 rounded-lg text-sm font-medium text-secondary hover:bg-surface-2 hover:text-primary transition-colors cursor-pointer"
              >
                <span className="w-8 h-8 shrink-0 flex items-center justify-center"><GroupIcon className="h-[18px] w-[18px]" /></span>
                <span className="truncate flex-1 text-left">{group.label}</span>
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
              </button>
              {open && (
                <div className="mt-1 space-y-1">
                  {group.items.map((item) => (
                    <NavButton key={item.id} item={item} nested active={activeTab === item.id} compact={false} onClick={() => onNavigate(item.id)} />
                  ))}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-sidebar-line p-3">
        <button
          type="button"
          onClick={onOpenProfile}
          title={collapsed ? `${user.name} — ver perfil` : "Ver perfil completo"}
          aria-label={`Ver perfil de ${user.name}`}
          className={`w-full flex items-center gap-3 rounded-xl p-2 bg-surface-2/60 hover:bg-surface-2 border border-transparent hover:border-default transition-colors cursor-pointer ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <span className="relative w-9 h-9 shrink-0 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30 flex items-center justify-center text-xs font-bold text-emerald-700 dark:text-emerald-400">
            {user.photo ? <img src={user.photo} alt="" draggable={false} className="h-full w-full rounded-full object-cover" /> : initials(user.name)}
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-sidebar" aria-hidden />
          </span>
          {!collapsed && (
            <span className="min-w-0 text-left">
              <span className="block text-sm font-semibold text-primary truncate">{user.name}</span>
              <span className="block text-xs text-secondary truncate">
                {user.roleLabel}
                {user.department && !user.roleLabel.toLowerCase().includes(user.department.toLowerCase()) ? ` · ${user.department}` : ""}
              </span>
            </span>
          )}
        </button>
      </div>
    </>
  );
}

export default function AppSidebar(props: AppSidebarProps) {
  const { collapsed, onToggleCollapsed, mobileOpen, onCloseMobile, onNavigate, onLogoClick, onOpenProfile, ...rest } = props;

  return (
    <>
      <aside
        aria-label="Menu lateral"
        style={{ width: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED }}
        className="hidden md:flex relative z-40 shrink-0 flex-col bg-sidebar border-r border-sidebar-line h-screen transition-[width] duration-200 ease-out"
      >
        <SidebarBody {...rest} collapsed={collapsed} onNavigate={onNavigate} onLogoClick={onLogoClick} onOpenProfile={onOpenProfile} />
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          className="absolute top-[15px] -right-3.5 z-10 w-7 h-7 rounded-full bg-surface border border-default text-secondary hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-500/50 shadow-card flex items-center justify-center cursor-pointer transition-colors"
        >
          {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
        </button>
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menu de navegação">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={onCloseMobile}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.2 }}
              className="absolute inset-y-0 left-0 w-[288px] max-w-[85vw] flex flex-col bg-sidebar border-r border-sidebar-line shadow-pop"
            >
              <SidebarBody
                {...rest}
                collapsed={false}
                onNavigate={(t) => { onNavigate(t); onCloseMobile(); }}
                onLogoClick={() => { onLogoClick(); onCloseMobile(); }}
                onOpenProfile={() => { onOpenProfile(); onCloseMobile(); }}
                trailing={
                  <button type="button" onClick={onCloseMobile} aria-label="Fechar menu" className="p-1.5 rounded-lg bg-surface-2 text-secondary hover:text-primary cursor-pointer">
                    <X className="h-4 w-4" />
                  </button>
                }
              />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
