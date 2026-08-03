import React from "react";
import { X, Lock, Bell, CheckCircle, RefreshCw, ShieldAlert, Laptop } from "lucide-react";

interface NotificationGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRetryPermission: () => Promise<NotificationPermission | "default">;
  onTestNotification: () => void;
  currentPermission: NotificationPermission;
}

export default function NotificationGuideModal({
  isOpen,
  onClose,
  onRetryPermission,
  onTestNotification,
  currentPermission
}: NotificationGuideModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-[#080808] border border-emerald-500/30 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-emerald-500/20 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20 shrink-0">
              <Laptop className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                Notificações no Sistema Operacional
              </h3>
              <p className="text-[11px] text-slate-400">
                Alerta nativo no Windows / Mac / Linux para o Chat do HelpDesk
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Current status pill */}
        <div className={`p-3 rounded-xl border flex items-center justify-between text-xs font-semibold ${
          currentPermission === "granted"
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
            : currentPermission === "denied"
            ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
            : "bg-blue-500/10 border-blue-500/30 text-blue-300"
        }`}>
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 shrink-0" />
            <span>
              Status atual:{" "}
              {currentPermission === "granted"
                ? "Ativo (Permitido pelo Sistema)"
                : currentPermission === "denied"
                ? "Bloqueado pelo Navegador"
                : "Pendente de Liberação"}
            </span>
          </div>
          {currentPermission === "granted" && (
            <span className="bg-emerald-400 text-black font-extrabold text-[9px] px-2 py-0.5 rounded uppercase font-mono">
              OK
            </span>
          )}
        </div>

        {/* Steps guide if blocked */}
        {currentPermission === "denied" ? (
          <div className="space-y-3 bg-black/60 p-4 rounded-xl border border-neutral-900 text-xs">
            <p className="font-bold text-slate-200 flex items-center gap-1.5 text-xs">
              <ShieldAlert className="h-4 w-4 text-amber-400" />
              Como desbloquear as Notificações no seu navegador:
            </p>

            <ol className="space-y-2.5 text-slate-300 text-[11px] list-decimal list-inside pl-1">
              <li className="leading-relaxed">
                Clique no ícone de <strong className="text-white">cadeado (🔒) ou ajuste de site</strong> ao lado esquerdo da URL (endereço da página).
              </li>
              <li className="leading-relaxed">
                Localize a opção <strong className="text-white">Notificações (Notifications)</strong>.
              </li>
              <li className="leading-relaxed">
                Altere de <strong className="text-rose-400">Bloquear</strong> para <strong className="text-emerald-400">Permitir</strong>.
              </li>
              <li className="leading-relaxed">
                Clique no botão de recarregar ou pressione <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded font-mono text-[10px] text-slate-300">F5</kbd>.
              </li>
            </ol>
          </div>
        ) : (
          <div className="space-y-2 text-xs text-slate-300 leading-relaxed bg-black/40 p-3.5 rounded-xl border border-neutral-900">
            <p className="font-bold text-emerald-400">
              Por que usar Notificações Locais no Sistema Operacional?
            </p>
            <p>
              Ao responder chamados ou conversar com o suporte, as Notificações do Sistema enviam popups nativos na sua barra do Windows ou do macOS, mesmo que o navegador esteja minimizado ou você esteja trabalhando em outros programas.
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            Fechar
          </button>

          {currentPermission === "granted" ? (
            <button
              type="button"
              onClick={onTestNotification}
              className="px-5 py-2 bg-emerald-400 hover:bg-emerald-300 text-black rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer shadow-neon"
            >
              <CheckCircle className="h-4 w-4" />
              Testar Notificação do SO
            </button>
          ) : currentPermission === "denied" ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-md"
            >
              <RefreshCw className="h-4 w-4" />
              Recarregar Página
            </button>
          ) : (
            <button
              type="button"
              onClick={async () => {
                const res = await onRetryPermission();
                if (res === "granted") {
                  onTestNotification();
                }
              }}
              className="px-5 py-2 bg-emerald-400 hover:bg-emerald-300 text-black rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer shadow-neon"
            >
              <Bell className="h-4 w-4" />
              Ativar Notificações no SO
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
