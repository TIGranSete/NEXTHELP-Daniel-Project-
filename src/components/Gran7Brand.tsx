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
  subtitleText = "SISTEMA DE GESTÃO DE CHAMADOS",
  showIcon = false,
  className = "",
  glow = false,
}) => {
  // Title size mapping
  const textSizeClasses = {
    xs: "text-xs",
    sm: "text-base sm:text-lg",
    md: "text-xl sm:text-2xl",
    lg: "text-2xl sm:text-3xl",
    xl: "text-3xl sm:text-4xl",
  }[size];

  // Subtitle size mapping
  const subtitleSizeClasses = {
    xs: "text-[8px]",
    sm: "text-[9px] sm:text-[10px]",
    md: "text-[10px] sm:text-[11px]",
    lg: "text-[11px] sm:text-[12px]",
    xl: "text-[12px] sm:text-[13px]",
  }[size];

  // Icon size mapping
  const iconSizeClasses = {
    xs: "w-5 h-5",
    sm: "w-7 h-7",
    md: "w-10 h-10",
    lg: "w-12 h-12 sm:w-14 sm:h-14",
    xl: "w-16 h-16 sm:w-20 sm:h-20",
  }[size];

  return (
    <div className={`flex flex-col items-center justify-center text-center select-none ${className}`}>
      {/* Optional Top Brand Icon */}
      {showIcon && (
        <div className="relative flex items-center justify-center mb-2">
          <img
            src={logoMin}
            alt="GRAN7 Logo"
            className={`${iconSizeClasses} object-contain relative z-10`}
          />
        </div>
      )}

      {/* Clean Corporate Wordmark */}
      <div className={`font-sans ${textSizeClasses} leading-tight tracking-tight flex items-center justify-center gap-2`}>
        <span className="text-white font-extrabold tracking-tight">
          GRAN<span className="text-emerald-500 font-black">7</span>
        </span>
        <span className="text-emerald-400 font-bold tracking-tight">
          HELP
        </span>
      </div>

      {/* Subtitle / Tagline */}
      {showSubtitle && (
        <div className="mt-1.5 flex items-center justify-center gap-2">
          <p className={`font-sans font-semibold uppercase ${subtitleSizeClasses} text-zinc-400 tracking-wider`}>
            {subtitleText}
          </p>
        </div>
      )}
    </div>
  );
};

export default Gran7Brand;

