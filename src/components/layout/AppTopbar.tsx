import React, { useEffect, useRef, useState } from "react";
import { Bell, BellOff, BellRing, ChevronRight, LogOut, Menu, Search, Users, X } from "lucide-react";
import ThemeToggle from "../ThemeToggle";

export interface TechStatus {
  key: string;
  name: string;
  isOnline: boolean;
}

interface AppTopbarProps {
  breadcrumb: [string, string];
  searchTerm: string;
  onSearchChange: (value: string) => void;
  techStatus: TechStatus[];
  showTechStatus: boolean;
  notificationPermission: NotificationPermission | "unsupported";
  onRequestNotifications: () => void;
  onOpenNotificationGuide: () => void;
  onTestNotification: () => void;
  onOpenMobileMenu: () => void;
  onLogout: () => void;
  user: { name: string; roleLabel: string; photo?: string | null };
  onOpenProfile: () => void;
}

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

export const topbarIconBtn =
  "relative w-9 h-9 flex items-center justify-center rounded-lg text-secondary hover:text-primary hover:bg-surface-2 border border-transparent hover:border-default transition-colors duration-150 cursor-pointer";

const popover =
  "absolute right-0 mt-2 bg-surface border border-default rounded-xl shadow-pop z-50 motion-safe:animate-[g7-pop_.14s_ease-out]";

export default function AppTopbar(props: AppTopbarProps) {
  const {
    breadcrumb, searchTerm, onSearchChange, techStatus, showTechStatus,
    notificationPermission, onRequestNotifications, onOpenNotificationGuide, onTestNotification,
    onOpenMobileMenu, onLogout, user, onOpenProfile,
  } = props;

  const team = usePopover();
  const notif = usePopover();
  const onlineCount = techStatus.filter((t) => t.isOnline).length;
  const BellIcon = notificationPermission === "granted" ? BellRing : notificationPermission === "default" ? Bell : BellOff;
  const initials = user.name.split(" ").filter(Boolean).map((n) => n[0]).join("").substring(0, 2).toUpperCase();

  return (
    <header className="h-14 shrink-0 flex items-center gap-3 px-4 lg:px-6 border-b border-default bg-app/85 backdrop-blur-md z-30">
      <button type="button" onClick={onOpenMobileMenu} className={`md:hidden ${topbarIconBtn}`} aria-label="Abrir menu" title="Abrir menu">
        <Menu className="h-5 w-5" />
      </button>

      <nav aria-label="Você está em" className="min-w-0 flex items-center gap-1.5 text-sm">
        <span className="hidden lg:inline text-muted truncate">{breadcrumb[0]}</span>
        <ChevronRight className="hidden lg:block h-3.5 w-3.5 text-muted shrink-0" aria-hidden />
        <h1 className="font-display font-semibold text-primary truncate">{breadcrumb[1]}</h1>
      </nav>

      <div className="hidden lg:block flex-1 max-w-md mx-auto relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" aria-hidden />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar chamados…"
          aria-label="Buscar chamados"
          className="w-full h-9 bg-surface-2/70 hover:bg-surface-2 border border-default rounded-lg pl-9 pr-8 text-sm text-primary placeholder:text-muted focus:outline-none focus:bg-surface focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition"
        />
        {searchTerm && (
          <button type="button" onClick={() => onSearchChange("")} aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted hover:text-primary cursor-pointer">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1">
        {showTechStatus && techStatus.length > 0 && (
          <div className="relative" ref={team.ref}>
            <button
              type="button"
              onClick={() => team.setOpen((v) => !v)}
              aria-expanded={team.open}
              title="Disponibilidade da equipe de TI"
              className="h-9 px-2.5 mr-1 flex items-center gap-2 rounded-lg border border-default bg-surface hover:bg-surface-2 text-sm transition-colors cursor-pointer"
            >
              <span className="relative flex w-2 h-2">
                {onlineCount > 0 && <span className="absolute inset-0 rounded-full bg-emerald-400/60 motion-safe:animate-ping" aria-hidden />}
                <span className={`relative w-2 h-2 rounded-full ${onlineCount > 0 ? "bg-emerald-500" : "bg-surface-3"}`} />
              </span>
              <Users className="h-4 w-4 text-secondary" aria-hidden />
              <span className="font-semibold text-primary tabular-nums">{onlineCount}/{techStatus.length}</span>
              <span className="hidden xl:inline text-secondary">TI ativa</span>
            </button>
            {team.open && (
              <div className={`${popover} w-64 max-h-80 overflow-y-auto p-2`}>
                <p className="px-2 pt-1 pb-2 text-xs font-semibold text-secondary">Equipe de TI</p>
                {techStatus.map((t) => (
                  <div key={t.key} className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${t.isOnline ? "bg-emerald-500" : "bg-surface-3"}`} />
                    <span className="truncate flex-1 text-primary">{t.name}</span>
                    <span className={`text-xs ${t.isOnline ? "text-emerald-700 dark:text-emerald-400" : "text-muted"}`}>{t.isOnline ? "Online" : "Ausente"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="relative" ref={notif.ref}>
          <button type="button" onClick={() => notif.setOpen((v) => !v)} aria-expanded={notif.open} aria-label="Notificações" title="Notificações" className={topbarIconBtn}>
            <BellIcon className="h-[18px] w-[18px]" />
          </button>
          {notif.open && (
            <div className={`${popover} w-72 p-4 space-y-3`}>
              <p className="text-sm font-semibold text-primary">Notificações do sistema</p>
              {notificationPermission === "granted" && (
                <>
                  <p className="text-sm text-secondary">Ativas. Você será avisado sobre novos chamados neste dispositivo.</p>
                  <button type="button" onClick={onTestNotification} className="w-full h-9 rounded-lg bg-surface-2 hover:bg-surface-3 border border-default text-sm font-medium text-primary cursor-pointer transition-colors">Enviar teste</button>
                </>
              )}
              {notificationPermission === "denied" && (
                <>
                  <p className="text-sm text-secondary">Bloqueadas pelo navegador.</p>
                  <button type="button" onClick={() => { notif.setOpen(false); onOpenNotificationGuide(); }} className="w-full h-9 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold cursor-pointer transition-colors">Como desbloquear</button>
                </>
              )}
              {notificationPermission === "default" && (
                <>
                  <p className="text-sm text-secondary">Ative para receber alertas de novos chamados.</p>
                  <button type="button" onClick={onRequestNotifications} className="w-full h-9 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold cursor-pointer transition-colors">Ativar notificações</button>
                </>
              )}
              {notificationPermission === "unsupported" && <p className="text-sm text-secondary">Este navegador não oferece suporte a notificações.</p>}
            </div>
          )}
        </div>

        <ThemeToggle />

        <span className="hidden sm:block mx-2 h-6 w-px bg-default" aria-hidden />

        <button
          type="button"
          onClick={onOpenProfile}
          title="Ver perfil completo"
          aria-label={`Perfil de ${user.name}`}
          className="flex items-center gap-2.5 pl-1 pr-2 h-10 rounded-lg hover:bg-surface-2 transition-colors cursor-pointer"
        >
          <span className="w-8 h-8 rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30 flex items-center justify-center text-xs font-bold text-emerald-700 dark:text-emerald-400">{user.photo ? <img src={user.photo} alt="" draggable={false} className="h-full w-full rounded-full object-cover" /> : initials}</span>
          <span className="hidden lg:block text-left leading-tight">
            <span className="block text-sm font-medium text-primary max-w-[9rem] truncate">{user.name}</span>
            <span className="block text-xs text-muted">{user.roleLabel}</span>
          </span>
        </button>

        <button type="button" onClick={onLogout} className={`${topbarIconBtn} hover:!text-rose-500 hover:!bg-rose-500/10`} aria-label="Sair da conta" title="Sair da conta">
          <LogOut className="h-[18px] w-[18px]" />
        </button>
      </div>
    </header>
  );
}
