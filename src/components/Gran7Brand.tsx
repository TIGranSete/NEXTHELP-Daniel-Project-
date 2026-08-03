import React from "react";
import logoMin from "../assets/images/7.png";

interface Gran7BrandProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  showSubtitle?: boolean;
  subtitleText?: string;
  showIcon?: boolean;
  className?: string;
  glow?: boolean;
}

export const Gran7Brand: React.FC<Gran7BrandProps> = ({
  size = "md",
  showSubtitle = false,
  subtitleText = "HELP DESK INTELLIGENTE CORPORATIVO",
  showIcon = false,
  className = "",
  glow = true,
}) => {
  // Text size mappings
  const textSizeClasses = {
    xs: "text-xs tracking-tight",
    sm: "text-sm sm:text-base",
    md: "text-lg sm:text-2xl",
    lg: "text-2xl sm:text-3xl md:text-4xl",
    xl: "text-3xl sm:text-4xl md:text-5xl",
  }[size];

  // Subtitle size mappings
  const subtitleSizeClasses = {
    xs: "text-[7px] tracking-[0.2em]",
    sm: "text-[8px] sm:text-[9px] tracking-[0.22em]",
    md: "text-[9px] sm:text-[11px] tracking-[0.25em]",
    lg: "text-[10px] sm:text-[12px] tracking-[0.28em]",
    xl: "text-[12px] sm:text-[14px] tracking-[0.3em]",
  }[size];

  // Icon size mappings
  const iconSizeClasses = {
    xs: "w-6 h-6",
    sm: "w-8 h-8",
    md: "w-12 h-12",
    lg: "w-16 h-16 sm:w-20 sm:h-20",
    xl: "w-20 h-20 sm:w-24 sm:h-24",
  }[size];

  return (
    <div className={`flex flex-col items-center justify-center text-center select-none ${className}`}>
      {/* Optional Top Brand Icon (Green 7 Emblem) */}
      {showIcon && (
        <div className="relative flex items-center justify-center mb-2.5 sm:mb-4">
          {glow && (
            <>
              {/* Outer Pulsing Aura */}
              <div className="absolute -inset-2.5 rounded-full border border-emerald-400/20 animate-ping [animation-duration:3.5s]" />
              {/* Inner Glowing Backdrop */}
              <div className="absolute inset-1 bg-emerald-500/20 rounded-full blur-xl sm:blur-2xl" />
            </>
          )}
          <img
            src={logoMin}
            alt="GRAN7 Emblem"
            className={`${iconSizeClasses} object-contain relative z-10 filter drop-shadow-[0_0_16px_rgba(16,185,129,0.45)] transition-transform duration-300 hover:scale-105`}
          />
        </div>
      )}

      {/* Main Brand Title */}
      <div className={`font-display font-black ${textSizeClasses} leading-none flex items-center justify-center gap-1`}>
        {/* "GRAN" in high-contrast solid white with clean drop shadow */}
        <span className="text-white font-extrabold tracking-tight drop-shadow-[0_2px_12px_rgba(255,255,255,0.12)]">
          GRAN
        </span>

        {/* "7" in energetic green italic with neon drop shadow */}
        <span className="text-emerald-400 font-black italic ml-0.5 drop-shadow-[0_0_14px_rgba(52,211,153,0.7)]">
          7
        </span>

        {/* "HELP" with generous character spacing and green highlight */}
        <span className="text-emerald-400 font-bold tracking-[0.24em] sm:tracking-[0.28em] uppercase ml-1.5 sm:ml-2 drop-shadow-[0_0_10px_rgba(52,211,153,0.4)]">
          HELP
        </span>
      </div>

      {/* Subtitle / Tagline */}
      {showSubtitle && (
        <div className="mt-1.5 sm:mt-2 flex items-center justify-center gap-2">
          <span className="hidden sm:inline-block w-1.5 h-1.5 rounded-full bg-emerald-400/70 animate-pulse" />
          <p
            className={`font-mono font-bold uppercase ${subtitleSizeClasses} text-slate-400/95 tracking-[0.22em] sm:tracking-[0.28em] transition-colors`}
          >
            {subtitleText}
          </p>
          <span className="hidden sm:inline-block w-1.5 h-1.5 rounded-full bg-emerald-400/70 animate-pulse" />
        </div>
      )}
    </div>
  );
};

export default Gran7Brand;
