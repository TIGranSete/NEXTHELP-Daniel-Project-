import React, { useState } from "react";
import { UserSession, User } from "../types";
import { 
  Shield, 
  Lock, 
  Mail, 
  ArrowRight, 
  AlertCircle, 
  RefreshCw,
  Database
} from "lucide-react";
import loginBg from "../assets/images/WALLPAPER GRAN7 4.png";
import logoImg from "../assets/images/7.png";

interface LoginScreenProps {
  users: User[];
  onLoginSuccess: (session: UserSession) => void;
}

export default function LoginScreen({ users, onLoginSuccess }: LoginScreenProps) {
  // Login fields
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
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      if (response.ok) {
        const user = await response.json();
        onLoginSuccess({
          name: user.name,
          department: user.department,
          role: user.role,
          email: user.email,
          mustChangePassword: user.mustChangePassword
        });
      } else {
        const errText = await response.text();
        let errorMsg = "Credenciais inválidas. Verifique seu e-mail e senha.";
        try {
          const errData = JSON.parse(errText);
          errorMsg = errData.error || errorMsg;
        } catch (e) {
          errorMsg = `Erro no servidor (${response.status}): ${errText.substring(0, 80)}`;
        }
        setError(errorMsg);
      }
    } catch (err: any) {
      console.error("Erro na requisição de login:", err);
      setError(`Erro de conexão ao servidor: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      id="login_container" 
      className="min-h-screen bg-black flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden font-sans bg-cover bg-center"
      style={{ backgroundImage: `url(${loginBg})` }}
    >
      
      {/* Background overlay mask for enhanced text contrast */}
      <div className="absolute inset-0 bg-black/75 z-0 pointer-events-none"></div>

      <div className="w-full max-w-md space-y-6 z-10 animate-in fade-in duration-500">
        
        {/* App Logo & Header */}
        <div className="text-center space-y-2">
          {!logoError ? (
            <div className="flex justify-center mb-6">
              <img 
                src="/assets/logo.png" 
                alt="GRAN7 HELP" 
                className="h-20 w-auto object-contain max-w-full"
                onError={() => setLogoError(true)}
              />
            </div>
          ) : (
            <>
              <div className="inline-flex w-16 h-16 items-center justify-center mb-3">
                <img 
                  src={logoImg} 
                  alt="GRAN7" 
                  className="w-16 h-16 object-contain rounded-2xl shadow-2xl shadow-emerald-500/20 border border-emerald-400/30"
                />
              </div>
              <h1 className="font-display font-extrabold text-3xl tracking-tight text-white">
                GRAN<span className="text-emerald-400 font-bold italic tracking-wide text-3xl">7</span><span className="text-emerald-400 font-light tracking-widest text-2xl"> HELP</span>
              </h1>
            </>
          )}
          {/* Subtitle removed as requested */}
        </div>

        {/* Login Box */}
        <div className="bg-[#050505] border border-emerald-500/10 hover:border-emerald-500/30 transition-all duration-300 rounded-3xl p-8 shadow-neon-sm hover:shadow-neon space-y-6">
          
          <div className="border-b border-emerald-500/10 pb-3 text-center">
            <h2 className="text-sm font-bold text-emerald-400 tracking-wide uppercase neon-glow-text">Acessar Conta Corporativa</h2>
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
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">E-mail Corporativo</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="email"
                  required
                  placeholder="usuario@gransete.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-black border border-emerald-950/40 rounded-xl py-2.5 pl-10 pr-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/15 transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Senha de Acesso</label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="password"
                  required
                  placeholder="Sua senha corporativa"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-black border border-emerald-950/40 rounded-xl py-2.5 pl-10 pr-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/15 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-emerald-400 hover:bg-emerald-300 text-black font-extrabold rounded-xl text-xs transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer shadow-neon hover:shadow-neon-lg disabled:opacity-60"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-black" />
                  Autenticando...
                </>
              ) : (
                <>
                  Entrar no Sistema
                  <ArrowRight className="h-4 w-4 text-black" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Info blocks removed as requested */}

      </div>
    </div>
  );
}
