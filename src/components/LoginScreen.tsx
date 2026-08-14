import React, { useState } from "react";
import { UserSession } from "../types";
import { getApiUrl } from "../lib/api";
import { 
  Lock, 
  Mail, 
  ArrowRight, 
  AlertCircle, 
  RefreshCw
} from "lucide-react";
import logoImg from "../assets/images/logo.png";
import Gran7Brand from "./Gran7Brand";

interface LoginScreenProps {
  onLoginSuccess: (session: UserSession) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [logoError, setLogoError] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Por favor, preencha o e-mail corporativo e a senha.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(getApiUrl("/api/login"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ email: email.trim(), password })
      });

      const contentType = response.headers.get("content-type");
      const isJson = contentType && contentType.includes("application/json");

      if (response.ok && isJson) {
        const user = await response.json();
        onLoginSuccess({
          name: user.name,
          department: user.department,
          role: user.role,
          email: user.email,
          mustChangePassword: user.mustChangePassword
        });
        return;
      }

      if (isJson) {
        const errData = await response.json().catch(() => null);
        if (errData && errData.error) {
          setError(errData.error);
          return;
        }
      }

      setError("Não foi possível contatar o servidor de autenticação. Tente novamente.");
    } catch (err: any) {
      console.warn("Erro na requisição de login para a API:", err);
      setError("Sem conexão com o servidor. Verifique sua internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      id="login_container" 
      className="min-h-screen bg-[#09090b] flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden font-sans"
    >
      <div className="w-full max-w-md space-y-6 z-10 animate-in fade-in duration-300">
        
        {/* App Logo & Header */}
        <div className="text-center space-y-3 mb-2">
          {!logoError ? (
            <div className="flex flex-col items-center justify-center space-y-3">
              <img 
                src={logoImg} 
                alt="GRAN7 HELP" 
                className="h-16 sm:h-20 w-auto object-contain max-w-full"
                onError={() => setLogoError(true)}
              />
              <p className="font-sans font-semibold text-[10px] sm:text-[11px] text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-2 justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>HELP DESK INTELIGENTE CORPORATIVO</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              </p>
            </div>
          ) : (
            <Gran7Brand size="lg" showIcon={true} showSubtitle={true} subtitleText="SISTEMA DE GESTÃO DE CHAMADOS" />
          )}
        </div>

        {/* Login Box */}
        <div className="bg-[#121215] border border-zinc-800/80 transition-all duration-300 rounded-2xl p-8 shadow-2xl space-y-6">
          
          <div className="border-b border-zinc-800/80 pb-3 text-center">
            <h2 className="text-xs font-bold text-zinc-300 tracking-wider uppercase">Acessar Conta Corporativa</h2>
          </div>

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 font-medium flex items-center gap-2 animate-shake">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Form Login */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">E-mail Corporativo</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-2.5 h-4 w-4 text-zinc-500" />
                <input
                  type="email"
                  required
                  placeholder="usuario@gran7.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#09090b] border border-zinc-800 rounded-xl py-2.5 pl-10 pr-3 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Senha de Acesso</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-2.5 h-4 w-4 text-zinc-500" />
                <input
                  type="password"
                  required
                  placeholder="Sua senha corporativa"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#09090b] border border-zinc-800 rounded-xl py-2.5 pl-10 pr-3 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-60"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-white" />
                  Autenticando...
                </>
              ) : (
                <>
                  Entrar no Sistema
                  <ArrowRight className="h-4 w-4 text-white" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer signature */}
        <div className="flex items-center justify-between text-[10px] text-zinc-500 font-medium pt-2 border-t border-zinc-800/60">
          <span>Gran7 Nutrição e Fisiologia Vegetal</span>
          <span className="text-zinc-400 font-mono">v2.4</span>
        </div>
      </div>
    </div>
  );
}
