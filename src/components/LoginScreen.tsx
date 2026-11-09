import React, { useRef, useState } from "react";
import { UserSession } from "../types";
import { apiFetch } from "../lib/api";
import { 
  Lock, 
  Mail, 
  ArrowRight, 
  AlertCircle, 
  RefreshCw
} from "lucide-react";
import logoImg from "../assets/images/logo.png";
import logoBlack from "../assets/images/logo-black.png";
import { Sun, Moon } from "lucide-react";
import Gran7Brand from "./Gran7Brand";
import LoginBackdrop from "./login-backdrop/LoginBackdrop";

interface LoginScreenProps {
  onLoginSuccess: (session: UserSession) => void;
}

const REMEMBERED_EMAIL_KEY = "gran7_remembered_email";

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [email, setEmail] = useState(() => localStorage.getItem(REMEMBERED_EMAIL_KEY) || "");
  const [password, setPassword] = useState("");
  const [rememberEmail, setRememberEmail] = useState(() => !!localStorage.getItem(REMEMBERED_EMAIL_KEY));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [logoError, setLogoError] = useState(false);
  // Tela de login SEMPRE abre no tema claro; o botão alterna só aqui (não altera a preferência do app).
  const [dark, setDark] = useState(false);
  // "Esqueci a senha" (colaboradores): mesmo cartão, formulário alternativo.
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [fpEmail, setFpEmail] = useState("");
  const [fpPass, setFpPass] = useState("");
  const [fpConfirm, setFpConfirm] = useState("");
  const [fpLoading, setFpLoading] = useState(false);
  const [fpError, setFpError] = useState("");
  const [fpOk, setFpOk] = useState("");
  // Trava síncrona contra envios duplicados (o estado `loading` só reflete no próximo render).
  const submittingRef = useRef(false);

  const openForgot = () => {
    setFpEmail(email.trim());
    setFpPass(""); setFpConfirm(""); setFpError(""); setFpOk("");
    setError("");
    setMode("forgot");
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setFpError("");
    if (!fpEmail.trim() || !fpPass) { setFpError("Informe o e-mail e a nova senha."); return; }
    if (fpPass.length < 6 || !/\d/.test(fpPass) || !/[a-zA-Z]/.test(fpPass)) {
      setFpError("A senha deve ter ao menos 6 caracteres, com letras e números.");
      return;
    }
    if (fpPass !== fpConfirm) { setFpError("As senhas não coincidem."); return; }
    setFpLoading(true);
    try {
      const res = await apiFetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ email: fpEmail.trim(), newPassword: fpPass })
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setEmail(fpEmail.trim());
        setPassword("");
        setFpOk(data?.message || "Senha redefinida com sucesso.");
        setMode("login");
        return;
      }
      setFpError(data?.error || "Não foi possível redefinir a senha. Tente novamente.");
    } catch {
      setFpError("Sem conexão com o servidor. Verifique sua internet e tente novamente.");
    } finally {
      setFpLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Por favor, preencha o e-mail corporativo e a senha.");
      return;
    }

    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    setError("");
    setFpOk("");
    let succeeded = false;

    try {
      const response = await apiFetch("/api/login", {
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
        if (rememberEmail) {
          localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
        } else {
          localStorage.removeItem(REMEMBERED_EMAIL_KEY);
        }
        succeeded = true;
        onLoginSuccess({
          name: user.name,
          department: user.department,
          role: user.role,
          email: user.email,
          mustChangePassword: user.mustChangePassword,
          token: user.token
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
      // Em caso de sucesso o botão continua em "Autenticando…" durante a transição de saída.
      if (!succeeded) {
        submittingRef.current = false;
        setLoading(false);
      }
    }
  };

  return (
    <div
      id="login_container"
      className={`min-h-screen ${dark ? "bg-[#08090B]" : "bg-[#f5f7f8]"} flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden font-sans`}
    >
      {/* Decorative 3D "7" + particles (behind everything, never intercepts input) */}
      <LoginBackdrop light={!dark} />

      <button
        type="button"
        onClick={() => setDark((v) => !v)}
        title={dark ? "Mudar para tema claro" : "Mudar para tema escuro"}
        aria-label={dark ? "Mudar para tema claro" : "Mudar para tema escuro"}
        className={`absolute top-4 right-4 z-20 w-9 h-9 flex items-center justify-center rounded-lg border transition-colors cursor-pointer ${dark ? "text-zinc-300 border-white/10 hover:bg-white/10" : "text-slate-600 border-slate-200 bg-white/70 hover:bg-white"}`}
      >
        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <div className="w-full max-w-md space-y-6 z-10 relative lbd-reveal">
        
        {/* App Logo & Header */}
        <div className="text-center space-y-3 mb-2">
          {!logoError ? (
            <div className="flex flex-col items-center justify-center space-y-3">
              <img
                src={dark ? logoImg : logoBlack}
                alt="GRAN7 HELP"
                className="h-16 sm:h-20 w-auto object-contain max-w-full"
                onError={() => setLogoError(true)}
              />
              <p className={`font-sans font-semibold text-[10px] sm:text-[11px] ${dark ? "text-zinc-400" : "text-slate-500"} uppercase tracking-[0.2em] flex items-center gap-2 justify-center`}>
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
        <div className={`border transition-colors duration-300 rounded-2xl p-8 space-y-6 ${dark ? "bg-[#111317]/85 border-white/10 shadow-[0_24px_70px_-12px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.05)]" : "bg-white/95 border-slate-200 shadow-[0_24px_60px_-16px_rgba(24,33,43,0.18)]"}`}>
          
          <div className={`border-b pb-3 text-center ${dark ? "border-white/10" : "border-slate-200"}`}>
            <h2 className={`text-xs font-bold tracking-wider uppercase ${dark ? "text-zinc-400" : "text-slate-600"}`}>Acessar Conta Corporativa</h2>
          </div>

          {error && (
            <div className={`p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs ${dark ? "text-rose-400" : "text-rose-600"} font-medium flex items-center gap-2 animate-shake`}>
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {fpOk && mode === "login" && (
            <div className={`p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs font-medium flex items-center gap-2 ${dark ? "text-emerald-400" : "text-emerald-700"}`}>
              <span>{fpOk}</span>
            </div>
          )}

          {mode === "forgot" ? (
          <form onSubmit={handleForgot} className="space-y-4">
            <p className={`text-xs leading-relaxed ${dark ? "text-zinc-400" : "text-slate-600"}`}>
              Informe o seu e-mail corporativo e escolha uma nova senha. Disponível apenas para colaboradores.
            </p>
            {fpError && (
              <div className={`p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs ${dark ? "text-rose-400" : "text-rose-600"} font-medium flex items-center gap-2 animate-shake`}>
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{fpError}</span>
              </div>
            )}
            {([
              { label: "E-mail Corporativo", type: "email", value: fpEmail, set: setFpEmail, ph: "usuario@gran7.com.br", ac: "username", Icon: Mail },
              { label: "Nova Senha", type: "password", value: fpPass, set: setFpPass, ph: "Mín. 6 caracteres, com letras e números", ac: "new-password", Icon: Lock },
              { label: "Confirmar Nova Senha", type: "password", value: fpConfirm, set: setFpConfirm, ph: "Repita a nova senha", ac: "new-password", Icon: Lock },
            ] as const).map((f) => (
              <div key={f.label} className="space-y-1.5">
                <label className={`text-[10px] font-bold uppercase tracking-wider block ${dark ? "text-zinc-400" : "text-slate-600"}`}>{f.label}</label>
                <div className="relative">
                  <f.Icon className={`absolute left-3.5 top-2.5 h-4 w-4 ${dark ? "text-zinc-500" : "text-slate-400"}`} />
                  <input
                    type={f.type}
                    autoComplete={f.ac}
                    required
                    placeholder={f.ph}
                    value={f.value}
                    onChange={(e) => f.set(e.target.value)}
                    className={`w-full border rounded-xl py-2.5 pl-10 pr-3 text-xs focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all duration-200 ${dark ? "bg-black/30 border-white/10 text-zinc-100 placeholder-zinc-600 focus:bg-black/40" : "bg-white border-slate-300 text-slate-900 placeholder-slate-400"}`}
                  />
                </div>
              </div>
            ))}
            <button
              type="submit"
              disabled={fpLoading}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-60"
            >
              {fpLoading ? (<><RefreshCw className="h-3.5 w-3.5 animate-spin text-white" />Redefinindo...</>) : "Redefinir senha"}
            </button>
            <button
              type="button"
              onClick={() => { setMode("login"); setFpError(""); }}
              className={`w-full text-center text-[11px] font-semibold cursor-pointer transition-colors ${dark ? "text-zinc-400 hover:text-zinc-200" : "text-slate-500 hover:text-slate-800"}`}
            >
              Voltar para o login
            </button>
          </form>
          ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className={`text-[10px] font-bold uppercase tracking-wider block ${dark ? "text-zinc-400" : "text-slate-600"}`}>E-mail Corporativo</label>
              <div className="relative">
                <Mail className={`absolute left-3.5 top-2.5 h-4 w-4 ${dark ? "text-zinc-500" : "text-slate-400"}`} />
                <input
                  type="email"
                  name="username"
                  autoComplete="username"
                  required
                  placeholder="usuario@gran7.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full border rounded-xl py-2.5 pl-10 pr-3 text-xs focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all duration-200 ${dark ? "bg-black/30 border-white/10 text-zinc-100 placeholder-zinc-600 focus:bg-black/40" : "bg-white border-slate-300 text-slate-900 placeholder-slate-400"}`}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={`text-[10px] font-bold uppercase tracking-wider block ${dark ? "text-zinc-400" : "text-slate-600"}`}>Senha de Acesso</label>
              <div className="relative">
                <Lock className={`absolute left-3.5 top-2.5 h-4 w-4 ${dark ? "text-zinc-500" : "text-slate-400"}`} />
                <input
                  type="password"
                  name="current-password"
                  autoComplete="current-password"
                  required
                  placeholder="Sua senha corporativa"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full border rounded-xl py-2.5 pl-10 pr-3 text-xs focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all duration-200 ${dark ? "bg-black/30 border-white/10 text-zinc-100 placeholder-zinc-600 focus:bg-black/40" : "bg-white border-slate-300 text-slate-900 placeholder-slate-400"}`}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberEmail}
                onChange={(e) => setRememberEmail(e.target.checked)}
                className="h-3.5 w-3.5 rounded accent-emerald-500 cursor-pointer"
              />
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${dark ? "text-zinc-400" : "text-slate-600"}`}>
                Lembrar meu e-mail neste dispositivo
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 hover:-translate-y-px hover:shadow-[0_8px_24px_-6px_rgba(52,199,50,0.55)] active:translate-y-0 active:scale-[0.98] text-white font-semibold rounded-xl text-xs transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-60"
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
          <button
              type="button"
              onClick={openForgot}
              className={`w-full text-center text-[11px] font-semibold cursor-pointer transition-colors ${dark ? "text-emerald-400 hover:text-emerald-300" : "text-emerald-700 hover:text-emerald-600"}`}
            >
              Esqueceu a senha?
            </button>
          </form>
          )}
        </div>

        {/* Footer signature */}
        <div className={`flex items-center justify-between text-[10px] font-medium pt-2 border-t ${dark ? "text-zinc-500 border-white/10" : "text-slate-500 border-slate-200"}`}>
          <span>Gran7 Nutrição e Fisiologia Vegetal</span>
          <span className={`font-mono ${dark ? "text-zinc-400" : "text-slate-500"}`}>v2.4</span>
        </div>
      </div>
    </div>
  );
}
