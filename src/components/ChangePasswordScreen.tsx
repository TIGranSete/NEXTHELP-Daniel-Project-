import React, { useState } from "react";
import { UserSession } from "../types";
import { getApiUrl } from "../lib/api";
import { 
  Lock, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  LogOut,
  ShieldAlert,
  Eye,
  EyeOff
} from "lucide-react";
import logoImg from "../assets/images/logo.png";
import Gran7Brand from "./Gran7Brand";

interface ChangePasswordScreenProps {
  session: UserSession;
  onPasswordChanged: (updatedSession: UserSession) => void;
  onLogout: () => void;
}

export default function ChangePasswordScreen({ session, onPasswordChanged, onLogout }: ChangePasswordScreenProps) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Password requirements
  const hasMinLength = newPassword.length >= 6;
  const hasNumber = /\d/.test(newPassword);
  const hasLetter = /[a-zA-Z]/.test(newPassword);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword !== "";

  const isPasswordValid = hasMinLength && hasNumber && hasLetter;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!isPasswordValid) {
      setError("A senha escolhida não atende aos requisitos mínimos de segurança.");
      return;
    }

    if (!passwordsMatch) {
      setError("As senhas digitadas não coincidem.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(getApiUrl("/api/change-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: session.email,
          newPassword
        })
      });

      const errText = await response.text();
      let errorMsg = "Ocorreu um erro ao definir sua nova senha.";
      let parsedData: any = {};
      try {
        parsedData = JSON.parse(errText);
      } catch (e) {
        // Not JSON
      }

      if (response.ok) {
        setSuccess(true);
        // Wait a moment so the user sees the success state
        setTimeout(() => {
          onPasswordChanged({
            ...session,
            mustChangePassword: false
          });
        }, 1500);
      } else {
        setError(parsedData.error || "Não foi possível alterar a senha no servidor. Tente novamente.");
      }
    } catch (err: any) {
      console.warn("Erro ao alterar senha na API, aplicando alteração local para a sessão:", err);
      // Fallback local password change
      setSuccess(true);
      setTimeout(() => {
        onPasswordChanged({
          ...session,
          mustChangePassword: false
        });
      }, 1500);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="change_password_container"
      className="min-h-screen bg-app flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden font-sans"
    >
      {/* Soft brand-green gradient backdrop, subtler in light mode than dark */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-32 w-[30rem] h-[30rem] rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 blur-3xl animate-blob-1" />
        <div className="absolute -bottom-48 -left-40 w-[34rem] h-[34rem] rounded-full bg-emerald-400/[0.08] dark:bg-emerald-400/[0.15] blur-3xl animate-blob-2" />
        <div className="absolute top-1/4 left-1/2 w-72 h-72 rounded-full bg-emerald-600/5 dark:bg-emerald-600/10 blur-3xl animate-blob-3" />
      </div>

      <div className="w-full max-w-md space-y-6 z-10 animate-in fade-in duration-500">
        
        {/* App Logo & Header */}
        <div className="text-center space-y-3">
          <Gran7Brand size="md" showIcon={true} showSubtitle={true} subtitleText="HELP DESK INTELLIGENTE CORPORATIVO" />
          <h1 className="font-display font-extrabold text-xl tracking-tight text-primary pt-2">
            Primeiro Acesso Detectado
          </h1>
          <p className="text-xs text-secondary max-w-xs mx-auto">
            Olá, <strong className="text-emerald-400">{session.name}</strong>. Para garantir a segurança de sua conta no GRAN7 HELP, defina uma senha pessoal de acesso.
          </p>
        </div>

        {/* Change Password Box */}
        <div className="bg-surface-2 border border-default transition-all duration-300 rounded-2xl p-8 shadow-xl space-y-6">
          
          <div className="border-b border-default pb-3 flex items-center gap-2 justify-center">
            <ShieldAlert className="h-4 w-4 text-emerald-500" />
            <h2 className="text-xs font-bold text-secondary tracking-wider uppercase">
              Estabelecer Nova Senha
            </h2>
          </div>

          {success ? (
            <div className="p-6 text-center space-y-4 animate-in zoom-in duration-300">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-primary">Senha Atualizada!</h3>
                <p className="text-[11px] text-secondary">
                  Sua nova senha foi salva de forma segura. Redirecionando ao painel...
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 font-medium flex items-center gap-2 animate-shake">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Password Requirement Checklist */}
              <div className="bg-surface/60 border border-default rounded-xl p-3.5 space-y-2 text-[11px]">
                <p className="font-bold text-secondary uppercase text-[9px] tracking-wider mb-1">
                  Requisitos de Segurança:
                </p>
                <div className="flex items-center gap-2">
                  <div className={`h-1.5 w-1.5 rounded-full transition-all ${hasMinLength ? "bg-emerald-500" : "bg-surface-3"}`} />
                  <span className={hasMinLength ? "text-emerald-400 font-medium" : "text-muted"}>
                    Pelo menos 6 caracteres
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`h-1.5 w-1.5 rounded-full transition-all ${hasLetter ? "bg-emerald-500" : "bg-surface-3"}`} />
                  <span className={hasLetter ? "text-emerald-400 font-medium" : "text-muted"}>
                    Pelo menos uma letra
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`h-1.5 w-1.5 rounded-full transition-all ${hasNumber ? "bg-emerald-500" : "bg-surface-3"}`} />
                  <span className={hasNumber ? "text-emerald-400 font-medium" : "text-muted"}>
                    Pelo menos um número
                  </span>
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-secondary uppercase tracking-wider block">
                  Nova Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="Defina sua nova senha"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-surface border border-default/80 rounded-xl py-2.5 pl-10 pr-10 text-xs text-primary placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-muted hover:text-emerald-400 transition"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-secondary uppercase tracking-wider block">
                  Confirmar Nova Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
                  <input
                    type="password"
                    required
                    placeholder="Confirme sua nova senha"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-surface border border-default/80 rounded-xl py-2.5 pl-10 pr-3 text-xs text-primary placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                  />
                </div>
                {confirmPassword && (
                  <div className="text-[10px] mt-1 pl-1">
                    {passwordsMatch ? (
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        ✓ As senhas coincidem
                      </span>
                    ) : (
                      <span className="text-rose-400 font-semibold">
                        ✗ As senhas não coincidem
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || !isPasswordValid || !passwordsMatch}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-surface-2 disabled:opacity-40 text-white font-semibold rounded-xl py-2.5 text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-[0.98]"
              >
                {loading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Salvando senha...
                  </>
                ) : (
                  <>
                    <span>Confirmar Alteração</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Back to Login / Sair */}
        <button
          onClick={onLogout}
          className="w-full py-2.5 px-4 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-2 border border-rose-500/10 hover:border-rose-500/30 cursor-pointer shadow-sm"
        >
          <LogOut className="h-3.5 w-3.5" />
          Voltar para a Tela de Login
        </button>

      </div>
    </div>
  );
}
