import React, { useState, useEffect, useRef } from "react";
import { UserSession, User } from "../types";
import { getApiUrl } from "../lib/api";
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
import logoImg from "../assets/images/logo.png";
import logoMin from "../assets/images/7.png";

interface LoginScreenProps {
  users: User[];
  onLoginSuccess: (session: UserSession) => void;
}

export default function LoginScreen({ users, onLoginSuccess }: LoginScreenProps) {
  // Login fields
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = canvas.width = window.innerWidth || 800;
    let height = canvas.height = window.innerHeight || 600;

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth || 800;
      height = canvas.height = window.innerHeight || 600;
      initPhysiologySystem();
    };
    window.addEventListener("resize", handleResize);

    // 1. Corporate Plant Cells (Hexagonal/Parenchyma Network) & Physiology Nodes
    interface BioNode {
      x: number;
      y: number;
      baseX: number;
      baseY: number;
      radius: number;
      pulse: number;
      pulseSpeed: number;
      label?: string;
      colorType: "emerald" | "amber" | "sky" | "white";
    }

    interface BioLink {
      source: number;
      target: number;
      activePulse: number;
      pulseSpeed: number;
    }

    interface MicroParticle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      colorType: "emerald" | "amber" | "sky" | "white";
      alpha: number;
      phase: number;
    }

    const cellNodes: BioNode[] = [];
    const cellLinks: BioLink[] = [];
    const microParticles: MicroParticle[] = [];

    // Initialize clean, high-end abstract vascular nodes
    const initPhysiologySystem = () => {
      try {
        cellNodes.length = 0;
        cellLinks.length = 0;
        microParticles.length = 0;

        const cols = 6;
        const rows = 5;
        const safeWidth = width > 0 ? width : 800;
        const safeHeight = height > 0 ? height : 600;
        const spacingX = safeWidth / (cols + 1);
        const spacingY = safeHeight / (rows + 1);

        // Create highly-structured plant tissue nodes
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const organicOffset = (r % 2 === 0 ? spacingX * 0.2 : -spacingX * 0.2);
            const x = (c + 1) * spacingX + organicOffset + (Math.random() - 0.5) * 10;
            const y = (r + 1) * spacingY + (Math.random() - 0.5) * 10;

            // Technical nutrient abbreviations for faint high-tech overlay
            let label: string | undefined;
            let colorType: "emerald" | "amber" | "sky" | "white" = "emerald";

            if ((r + c) % 4 === 0) {
              const labels = ["N", "P", "K", "Mg", "Ca", "Fe", "H₂O", "CO₂", "ATP"];
              label = labels[(r + c) % labels.length];
              if (label === "ATP" || label === "P") colorType = "amber";
              else if (label === "H₂O" || label === "Ca") colorType = "sky";
              else if (label === "Fe") colorType = "white";
            }

            cellNodes.push({
              x,
              y,
              baseX: x,
              baseY: y,
              radius: Math.random() * 1.5 + 1.2,
              pulse: Math.random() * Math.PI * 2,
              pulseSpeed: 0.005 + Math.random() * 0.008,
              label,
              colorType,
            });
          }
        }

        // Create links mimicking intercellular channels / vascular connectivity
        for (let i = 0; i < cellNodes.length; i++) {
          const nodeA = cellNodes[i];
          const distances = cellNodes
            .map((nodeB, idx) => ({ idx, dist: Math.hypot(nodeA.x - nodeB.x, nodeA.y - nodeB.y) }))
            .filter(item => item.idx !== i)
            .sort((a, b) => a.dist - b.dist)
            .slice(0, 2); // Connect to 2 closest nodes for a cleaner network

          distances.forEach(({ idx }) => {
            if (i < idx) {
              cellLinks.push({
                source: i,
                target: idx,
                activePulse: Math.random(),
                pulseSpeed: 0.001 + Math.random() * 0.003,
              });
            }
          });
        }

        // Add elegant, floating micro mineral-nutrients
        const types: ("emerald" | "amber" | "sky" | "white")[] = ["emerald", "amber", "sky", "white"];
        for (let i = 0; i < 30; i++) {
          microParticles.push({
            x: Math.random() * safeWidth,
            y: Math.random() * safeHeight,
            vx: (Math.random() - 0.5) * 0.15,
            vy: (Math.random() - 0.5) * 0.15,
            radius: Math.random() * 1.2 + 0.8,
            colorType: types[i % types.length],
            alpha: 0.2 + Math.random() * 0.4,
            phase: Math.random() * Math.PI * 2,
          });
        }
      } catch (err) {
        console.error("Error initializing physiology wallpaper:", err);
      }
    };

    initPhysiologySystem();

    const getColorStr = (type: "emerald" | "amber" | "sky" | "white", alpha: number) => {
      const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
      if (type === "emerald") return `rgba(16, 185, 129, ${a})`;
      if (type === "amber") return `rgba(245, 158, 11, ${a})`;
      if (type === "sky") return `rgba(56, 189, 248, ${a})`;
      return `rgba(226, 232, 240, ${a})`;
    };

    const render = () => {
      try {
        ctx.clearRect(0, 0, width, height);

        // Deep biological ambient light (photosynthetic energy aura)
        const safeWidth = width > 0 ? width : 800;
        const safeHeight = height > 0 ? height : 600;
        const radGradRadius = Math.max(safeWidth, safeHeight) * 0.8;
        if (radGradRadius > 0) {
          const gradBg = ctx.createRadialGradient(
            safeWidth * 0.5,
            safeHeight * 0.5,
            10,
            safeWidth * 0.5,
            safeHeight * 0.5,
            radGradRadius
          );
          gradBg.addColorStop(0, "rgba(4, 47, 31, 0.15)"); // Deep emerald green glow
          gradBg.addColorStop(0.6, "rgba(2, 15, 10, 0.05)"); // Dark teal
          gradBg.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = gradBg;
          ctx.fillRect(0, 0, safeWidth, safeHeight);
        }

        // 1. Draw cellular connections (Plant Cell Walls & Vascular bundles)
        ctx.strokeStyle = "rgba(16, 185, 129, 0.05)";
        ctx.lineWidth = 1;
        cellLinks.forEach((link) => {
          const s = cellNodes[link.source];
          const t = cellNodes[link.target];
          if (!s || !t) return;

          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(t.x, t.y);
          ctx.stroke();

          // Active sap/nutrient flow pulse along the cellular pathways
          link.activePulse += link.pulseSpeed;
          if (link.activePulse > 1) link.activePulse = 0;

          const pulseX = s.x + (t.x - s.x) * link.activePulse;
          const pulseY = s.y + (t.y - s.y) * link.activePulse;

          ctx.beginPath();
          ctx.arc(pulseX, pulseY, 1.2, 0, Math.PI * 2);
          ctx.fillStyle = getColorStr(s.colorType, 0.3);
          ctx.fill();
        });

        // 2. Draw Tissue Nodes & Subtle High-tech labels
        cellNodes.forEach((node) => {
          node.pulse += node.pulseSpeed;
          // Slow sway mimicking cell sap circulation
          const swayX = Math.sin(node.pulse) * 3;
          const swayY = Math.cos(node.pulse) * 3;
          node.x = node.baseX + swayX;
          node.y = node.baseY + swayY;

          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
          ctx.fillStyle = getColorStr(node.colorType, 0.12);
          ctx.fill();

          // Core dot of active metabolism
          ctx.beginPath();
          ctx.arc(node.x, node.y, 0.7, 0, Math.PI * 2);
          ctx.fillStyle = getColorStr(node.colorType, 0.35);
          ctx.fill();

          // Technical monospace label overlays for corporate telemetry feel
          if (node.label) {
            ctx.font = `500 8px "JetBrains Mono", monospace`;
            ctx.fillStyle = getColorStr(node.colorType, 0.25);
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(`[${node.label}]`, node.x, node.y - 7);
          }
        });

        // 3. Draw Floating Micro-particles (Nutrients, Water, minerals)
        microParticles.forEach((p) => {
          p.x += p.vx;
          p.y += p.vy;

          // Wrap boundaries
          if (p.x < 0) p.x = safeWidth;
          if (p.x > safeWidth) p.x = 0;
          if (p.y < 0) p.y = safeHeight;
          if (p.y > safeHeight) p.y = 0;

          p.phase += 0.008;
          const currentAlpha = p.alpha * (0.6 + Math.sin(p.phase) * 0.4);

          // Ambient micro glow
          const glowRadius = p.radius * 3;
          if (glowRadius > 0) {
            const glowGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowRadius);
            glowGrad.addColorStop(0, getColorStr(p.colorType, currentAlpha * 0.25));
            glowGrad.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = glowGrad;
            ctx.beginPath();
            ctx.arc(p.x, p.y, glowRadius, 0, Math.PI * 2);
            ctx.fill();
          }

          // Precise micro core
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius * 0.7, 0, Math.PI * 2);
          ctx.fillStyle = getColorStr(p.colorType, currentAlpha * 0.6);
          ctx.fill();
        });

        // Sunlight / Photosynthesis corporate linear beam overlay
        const beamGrad = ctx.createLinearGradient(0, 0, safeWidth, safeHeight);
        beamGrad.addColorStop(0, "rgba(16, 185, 129, 0.015)"); // Mint green energy
        beamGrad.addColorStop(0.4, "rgba(245, 158, 11, 0.008)"); // Golden micro-beam
        beamGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = beamGrad;
        ctx.fillRect(0, 0, safeWidth, safeHeight);
      } catch (err) {
        console.error("Error drawing biology wallpaper frame:", err);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

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

      {/* Animated plant nutrition and physiology canvas wallpaper */}
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none opacity-60"
      />

      <div className="w-full max-w-md space-y-6 z-10 animate-in fade-in duration-500">
        
        {/* App Logo & Header */}
        <div className="text-center space-y-2">
          {!logoError ? (
            <div className="flex justify-center mb-6">
              <img 
                src={logoImg} 
                alt="GRAN7 HELP" 
                className="h-20 w-auto object-contain max-w-full"
                onError={() => setLogoError(true)}
              />
            </div>
          ) : (
            <>
              <div className="inline-flex w-16 h-16 items-center justify-center mb-3">
                <img 
                  src={logoMin} 
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
