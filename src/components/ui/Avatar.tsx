import React from "react";

const initialsOf = (name: string) =>
  name.split(" ").filter(Boolean).map((n) => n[0]).join("").substring(0, 2).toUpperCase() || "U";

interface AvatarProps {
  name: string;
  /** Foto (data URL). Sem foto, mostra as iniciais. */
  photo?: string | null;
  /** Tamanho e tipografia (ex.: "h-10 w-10 text-sm"). */
  className?: string;
  /** Estilo do círculo de iniciais (cada tela mantém o seu visual atual). */
  fallbackClassName?: string;
}

/** Avatar redondo: foto quando existir, iniciais caso contrário. Decorativo (o nome já aparece ao lado). */
export default function Avatar({ name, photo, className = "h-10 w-10 text-sm", fallbackClassName = "bg-surface-2 text-secondary border border-default" }: AvatarProps) {
  if (photo) {
    return <img src={photo} alt="" aria-hidden="true" draggable={false} className={`shrink-0 rounded-full object-cover border border-default ${className}`} />;
  }
  return (
    <span className={`shrink-0 rounded-full font-semibold inline-flex items-center justify-center ${fallbackClassName} ${className}`} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}
