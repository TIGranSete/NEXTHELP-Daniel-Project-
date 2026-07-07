import React, { useState } from "react";
import { UserSession } from "../types";
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
import { changeUserPassword } from "../lib/supabase-client-db";
import loginBg from "../assets/images/WALLPAPER GRAN7 4.png";
import logoImg from "../assets/images/logo.png";

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
      const isSuccess = await changeUserPassword(session.email, newPassword);

      if (isSuccess) {
        setSuccess(true);
        // Wait a moment so the user sees the success state
        setTimeout(() => {
          onPasswordChanged({
            ...session,
            mustChangePassword: false
          });
        }, 2000);
      } else {
        setError("Ocorreu um erro ao salvar a nova senha no banco de dados.");
      }
    } catch (err: any) {
      console.error("Erro ao alterar senha:", err);
      setError(`Erro ao salvar nova senha: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      id="change_password_container" 
      className="min-h-screen bg-black flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden font-sans bg-cover bg-center"
      style={{ backgroundImage: `url(${loginBg})` }}
    >
      {/* Background overlay mask for enhanced text contrast */}
      <div className="absolute inset-0 bg-black/80 z-0 pointer-events-none"></div>

      <div className="w-full max-w-md space-y-6 z-10 animate-in fade-in duration-500">
        
        {/* App Logo & Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <img 
              src="/assets/logo.png" 
              alt="GRAN7" 
              className="h-20 w-auto object-contain max-w-full transition-transform hover:scale-105 duration-300"
            />
          </div>
          <h1 className="font-display font-extrabold text-2xl tracking-tight text-white">
            Primeiro Acesso Detectado
          </h1>
          <p className="text-xs text-neutral-400 max-w-xs mx-auto">
            Olá, <strong className="text-emerald-400">{session.name}</strong>. Para garantir a segurança de sua conta no GRAN7 HELP, defina uma senha pessoal de acesso.
          </p>
        </div>

        {/* Change Password Box */}
        <div className="bg-[#050505] border border-emerald-500/10 hover:border-emerald-500/30 transition-all duration-300 rounded-3xl p-8 shadow-neon space-y-6">
          
          <div className="border-b border-emerald-500/10 pb-3 flex items-center gap-2 justify-center">
            <ShieldAlert className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-emerald-400 tracking-wide uppercase neon-glow-text">
              Estabelecer Nova Senha
            </h2>
          </div>

          {success ? (
            <div className="p-6 text-center space-y-4 animate-in zoom-in duration-300">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="h-6 w-6 animate-bounce" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white">Senha Atualizada!</h3>
                <p className="text-[11px] text-neutral-400">
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
              <div className="bg-neutral-900/40 border border-emerald-950/20 rounded-xl p-3.5 space-y-2 text-[11px]">
                <p className="font-bold text-neutral-400 uppercase text-[9px] tracking-wider mb-1">
                  Requisitos de Segurança:
                </p>
                <div className="flex items-center gap-2">
                  <div className={`h-1.5 w-1.5 rounded-full transition-all ${hasMinLength ? "bg-emerald-400 shadow-neon-sm" : "bg-neutral-600"}`} />
                  <span className={hasMinLength ? "text-emerald-400 font-medium" : "text-neutral-500"}>
                    Pelo menos 6 caracteres
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`h-1.5 w-1.5 rounded-full transition-all ${hasLetter ? "bg-emerald-400 shadow-neon-sm" : "bg-neutral-600"}`} />
                  <span className={hasLetter ? "text-emerald-400 font-medium" : "text-neutral-500"}>
                    Pelo menos uma letra
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`h-1.5 w-1.5 rounded-full transition-all ${hasNumber ? "bg-emerald-400 shadow-neon-sm" : "bg-neutral-600"}`} />
                  <span className={hasNumber ? "text-emerald-400 font-medium" : "text-neutral-500"}>
                    Pelo menos um número
                  </span>
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Nova Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="Defina sua nova senha"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-black border border-emerald-950/40 rounded-xl py-2.5 pl-10 pr-10 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/15 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-neutral-500 hover:text-emerald-400 transition"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Confirmar Nova Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                  <input
                    type="password"
                    required
                    placeholder="Confirme sua nova senha"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-black border border-emerald-950/40 rounded-xl py-2.5 pl-10 pr-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/15 transition-all"
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
                className="w-full bg-emerald-400 hover:bg-emerald-300 disabled:bg-neutral-800 disabled:opacity-40 text-black font-extrabold rounded-2xl py-3 text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-neon hover:shadow-neon-lg active:scale-[0.98]"
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
