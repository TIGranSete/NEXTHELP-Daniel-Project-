import React, { useState, useEffect } from "react";
import {
  Bell,
  Volume2,
  VolumeX,
  Sparkles,
  X,
  Check,
  Play,
  Monitor,
  Layout,
  Sliders,
  Send,
  HelpCircle,
  Laptop
} from "lucide-react";

export type SoundTone = "gran7" | "bell" | "cyber" | "matrix" | "mute";
export type ToastStyle = "emerald" | "glass" | "compact";

interface NotificationCustomizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTriggerTestNotification: (customTitle?: string, customBody?: string) => void;
  desktopPermission: NotificationPermission;
  onRequestDesktopPermission: () => Promise<NotificationPermission>;
}

export function playCustomNotificationSound(tone: SoundTone = "gran7", volume: number = 0.8) {
  if (tone === "mute" || volume <= 0) return;

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    const now = ctx.currentTime;
    const vol = Math.max(0, Math.min(1, volume));

    if (tone === "gran7") {
      // Classic Double Chime (C5 -> E5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(523.25, now);
      gain1.gain.setValueAtTime(0.15 * vol, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.4);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(659.25, now + 0.12);
      gain2.gain.setValueAtTime(0.15 * vol, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.52);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.52);
    } else if (tone === "bell") {
      // Brass Bell Harmonic Chime (F5 -> A5 -> C6)
      const freqs = [698.46, 880, 1046.5];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = now + idx * 0.09;
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.2 * vol, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.6);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.6);
      });
    } else if (tone === "cyber") {
      // High-tech Cyber Pulse (Short rapid double beep)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "square";
      osc1.frequency.setValueAtTime(880, now);
      gain1.gain.setValueAtTime(0.08 * vol, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.08);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "square";
      osc2.frequency.setValueAtTime(1760, now + 0.1);
      gain2.gain.setValueAtTime(0.1 * vol, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.25);
    } else if (tone === "matrix") {
      // Smooth Matrix Sine Sweep
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.3);
      gain.gain.setValueAtTime(0.18 * vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    }
  } catch (err) {
    console.warn("Erro ao reproduzir som customizado:", err);
  }
}

export default function NotificationCustomizerModal({
  isOpen,
  onClose,
  onTriggerTestNotification,
  desktopPermission,
  onRequestDesktopPermission
}: NotificationCustomizerModalProps) {
  const [selectedSound, setSelectedSound] = useState<SoundTone>("gran7");
  const [soundVolume, setSoundVolume] = useState<number>(0.8);
  const [toastStyle, setToastStyle] = useState<ToastStyle>("emerald");
  const [toastDuration, setToastDuration] = useState<number>(8);

  const [testTitle, setTestTitle] = useState<string>("💬 Chamado #1042 - Suporte Técnico TI");
  const [testMessage, setTestMessage] = useState<string>("Técnico respondeu: 'O servidor já foi reiniciado. Verifique por gentileza.'");
  const [isTestSending, setIsTestSending] = useState<boolean>(false);

  // Load preferences from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedSound = localStorage.getItem("gran7_notif_sound_tone") as SoundTone;
      if (savedSound) setSelectedSound(savedSound);

      const savedVol = localStorage.getItem("gran7_notif_volume");
      if (savedVol !== null) setSoundVolume(parseFloat(savedVol));

      const savedStyle = localStorage.getItem("gran7_notif_toast_style") as ToastStyle;
      if (savedStyle) setToastStyle(savedStyle);

      const savedDuration = localStorage.getItem("gran7_notif_toast_duration");
      if (savedDuration !== null) setToastDuration(parseInt(savedDuration, 10));
    }
  }, [isOpen]);

  const saveSound = (tone: SoundTone) => {
    setSelectedSound(tone);
    localStorage.setItem("gran7_notif_sound_tone", tone);
    playCustomNotificationSound(tone, soundVolume);
  };

  const saveVolume = (vol: number) => {
    setSoundVolume(vol);
    localStorage.setItem("gran7_notif_volume", vol.toString());
  };

  const saveStyle = (style: ToastStyle) => {
    setToastStyle(style);
    localStorage.setItem("gran7_notif_toast_style", style);
  };

  const saveDuration = (dur: number) => {
    setToastDuration(dur);
    localStorage.setItem("gran7_notif_toast_duration", dur.toString());
  };

  const handleTestNotification = async () => {
    setIsTestSending(true);
    playCustomNotificationSound(selectedSound, soundVolume);
    onTriggerTestNotification(testTitle, testMessage);
    setTimeout(() => {
      setIsTestSending(false);
    }, 600);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#080d14] border border-emerald-500/30 rounded-3xl shadow-[0_0_50px_rgba(16,185,129,0.15)] overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 md:p-6 border-b border-emerald-500/20 bg-gradient-to-r from-emerald-950/40 via-[#0a121c] to-[#080d14] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 rounded-2xl shadow-neon">
              <Sliders className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-display font-extrabold text-lg md:text-xl text-white tracking-tight flex items-center gap-2">
                Personalizador de Notificações
                <span className="bg-emerald-500 text-black font-extrabold text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider font-mono">
                  GRAN7 HELP
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure os sons, os alertas visuais e teste instantaneamente no navegador e no SO.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-slate-800/40 hover:bg-slate-800 rounded-xl transition border border-slate-700/50 cursor-pointer"
            title="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 md:p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
          
          {/* Section 1: Sound Generator Theme */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2 font-mono">
                <Volume2 className="h-4 w-4" /> Tom do Som da Notificação
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-slate-400">Volume: {Math.round(soundVolume * 100)}%</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={soundVolume}
                  onChange={(e) => saveVolume(parseFloat(e.target.value))}
                  className="w-24 accent-emerald-400 cursor-pointer"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {[
                { id: "gran7", label: "Gran7 Chime", desc: "Duplo tom suave", icon: "🎵" },
                { id: "bell", label: "Sino Brass", desc: "Triplo harmônico", icon: "🛎️" },
                { id: "cyber", label: "Cyber HUD", desc: "Beep futurista", icon: "🛸" },
                { id: "matrix", label: "Sweep Matrix", desc: "Onda de síntese", icon: "⚡" },
                { id: "mute", label: "Silencioso", desc: "Sem áudio", icon: "🔇" }
              ].map((item) => {
                const isActive = selectedSound === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => saveSound(item.id as SoundTone)}
                    className={`p-3 rounded-2xl border transition-all text-left flex flex-col justify-between cursor-pointer ${
                      isActive
                        ? "bg-emerald-500/20 border-emerald-400 text-white shadow-neon-sm"
                        : "bg-slate-900/60 border-slate-800/80 text-slate-300 hover:border-slate-700 hover:bg-slate-800/50"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-lg">{item.icon}</span>
                      {isActive ? (
                        <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-neon" />
                      ) : (
                        <Play className="h-3 w-3 text-slate-500 opacity-0 group-hover:opacity-100 transition" />
                      )}
                    </div>
                    <div className="mt-2">
                      <div className="text-xs font-bold leading-tight">{item.label}</div>
                      <div className="text-[9.5px] text-slate-400 mt-0.5">{item.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Visual Toast Style */}
          <div className="space-y-3 pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2 font-mono">
                <Layout className="h-4 w-4" /> Estilo do Card Flutuante (In-App)
              </label>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-400 text-[11px]">Duração:</span>
                {[3, 8, 15].map((d) => (
                  <button
                    key={d}
                    onClick={() => saveDuration(d)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition font-mono ${
                      toastDuration === d
                        ? "bg-cyan-500 text-black shadow-cyan-500/30 shadow-md"
                        : "bg-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { id: "emerald", title: "Cyber Emerald", tag: "NEON GREEN", border: "border-emerald-500/80 bg-[#05090e]", text: "Glow verde com badge interativo" },
                { id: "glass", title: "Glassmorphism Dark", tag: "TRANSLÚCIDO", border: "border-cyan-500/80 bg-slate-950/90", text: "Acabamento escuro sofisticado" },
                { id: "compact", title: "Compact Pill", tag: "MINIMALISTA", border: "border-amber-500/80 bg-neutral-950", text: "Design fino e direto ao ponto" }
              ].map((style) => {
                const isActive = toastStyle === style.id;
                return (
                  <button
                    key={style.id}
                    onClick={() => saveStyle(style.id as ToastStyle)}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                      isActive
                        ? "border-cyan-400 bg-cyan-500/10 shadow-[0_0_20px_rgba(6,182,212,0.15)]"
                        : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-white">{style.title}</span>
                      <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-bold">
                        {style.tag}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1.5 leading-tight">{style.text}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 3: OS Native Desktop Permission Banner */}
          <div className="space-y-3 pt-2 border-t border-slate-800/80">
            <label className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-2 font-mono">
              <Monitor className="h-4 w-4" /> Notificações Nativas do Sistema Operacional (Windows / Mac)
            </label>

            <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${
                  desktopPermission === "granted"
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                }`}>
                  <Laptop className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    {desktopPermission === "granted"
                      ? "Google Chrome Permite Pop-ups de Área de Trabalho"
                      : "Notificação de Sistema Pendente ou Bloqueada"}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {desktopPermission === "granted"
                      ? "Ícone oficial GRAN7 habilitado com atalho para abrir o chat diretamente."
                      : "Clique no botão para ativar os alertas nativos na barra do Windows."}
                  </p>
                </div>
              </div>

              {desktopPermission !== "granted" && (
                <button
                  type="button"
                  onClick={onRequestDesktopPermission}
                  className="px-4 py-2 bg-emerald-400 hover:bg-emerald-300 text-black font-extrabold text-xs rounded-xl transition cursor-pointer shrink-0 shadow-neon font-display"
                >
                  Ativar no SO
                </button>
              )}
            </div>
          </div>

          {/* Section 4: Instant Interactive Simulator */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-slate-900/60 to-black border border-emerald-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-300 font-mono flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-emerald-400 animate-pulse" /> Simulador de Teste Personalizado
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Dispara Áudio + Toast + SO</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
                  Título Personalizado
                </label>
                <input
                  type="text"
                  value={testTitle}
                  onChange={(e) => setTestTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
                  Mensagem Personalizada
                </label>
                <input
                  type="text"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-400"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleTestNotification}
              disabled={isTestSending}
              className="w-full py-2.5 bg-emerald-400 hover:bg-emerald-300 active:scale-[0.99] text-black font-extrabold text-xs rounded-xl transition shadow-neon font-display flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {isTestSending ? "Disparando Notificação..." : "Disparar Notificação de Teste Personalizada"}
            </button>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/80 flex items-center justify-between text-xs">
          <span className="text-slate-400 font-mono text-[11px]">
            Preferências salvas automaticamente no seu navegador.
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition cursor-pointer"
          >
            Concluir
          </button>
        </div>

      </div>
    </div>
  );
}
