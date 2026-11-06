import React, { useCallback, useEffect, useState } from "react";
import AppSidebar from "./AppSidebar";
import AppTopbar, { TechStatus } from "./AppTopbar";
import { NavTab, breadcrumbFor, visibleGroups } from "./navigation";

const STORAGE_KEY = "gran7_sidebar_collapsed";

function readCollapsed(): boolean {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "1") return true;
    if (stored === "0") return false;
  } catch {
    /* localStorage indisponível: usa padrão */
  }
  // Sem preferência salva: tablets começam recolhidos
  return typeof window !== "undefined" && window.innerWidth < 1024;
}

interface AppLayoutProps {
  activeTab: NavTab;
  onNavigate: (tab: NavTab) => void;
  onGoHome: () => void;
  isTechUser: boolean;
  user: { name: string; department?: string; photo?: string | null };
  onOpenProfile: () => void;
  onLogout: () => void;
  logoSrc: string;
  markSrc: string;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  techStatus: TechStatus[];
  notificationPermission: NotificationPermission | "unsupported";
  onRequestNotifications: () => void;
  onOpenNotificationGuide: () => void;
  onTestNotification: () => void;
  /** Referência ao contêiner rolável do conteúdo (usada para restaurar a rolagem da fila). */
  contentRef?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}

export default function AppLayout(p: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, c ? "0" : "1");
      } catch {
        /* ignora */
      }
      return !c;
    });
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <div className="app-shell h-screen w-full flex bg-app text-primary font-sans overflow-hidden">
      <AppSidebar
        groups={visibleGroups(p.isTechUser)}
        activeTab={p.activeTab}
        onNavigate={p.onNavigate}
        onLogoClick={p.onGoHome}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        logoSrc={p.logoSrc}
        markSrc={p.markSrc}
        user={{ ...p.user, roleLabel: p.isTechUser ? "TI Gran7" : "Colaborador" }}
        onOpenProfile={p.onOpenProfile}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <AppTopbar
          breadcrumb={breadcrumbFor(p.activeTab)}
          searchTerm={p.searchTerm}
          onSearchChange={p.onSearchChange}
          techStatus={p.techStatus}
          showTechStatus={p.isTechUser}
          notificationPermission={p.notificationPermission}
          onRequestNotifications={p.onRequestNotifications}
          onOpenNotificationGuide={p.onOpenNotificationGuide}
          onTestNotification={p.onTestNotification}
          onOpenMobileMenu={() => setMobileOpen(true)}
          onLogout={p.onLogout}
          user={{ name: p.user.name, photo: p.user.photo, roleLabel: p.isTechUser ? "TI Gran7" : "Colaborador" }}
          onOpenProfile={p.onOpenProfile}
        />
        <div ref={p.contentRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">{p.children}</div>
      </div>
    </div>
  );
}
