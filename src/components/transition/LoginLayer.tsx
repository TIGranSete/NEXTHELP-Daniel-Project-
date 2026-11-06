import React from "react";
import "./auth-transition.css";

interface LoginLayerProps {
  /** true enquanto a transição pós-login está rodando (a interface já está montada por trás). */
  exiting: boolean;
  /** Variáveis CSS --g7-* vindas de resolveAuthFx(). */
  vars: React.CSSProperties | null;
  children: React.ReactNode;
}

/**
 * Envolve a LoginScreen sem desmontá-la: o mesmo elemento fica na mesma posição da árvore
 * antes, durante e (até o fim) depois do login, então a animação de saída roda sobre a tela
 * real e a interface interna aparece por trás dela. Fora da transição é um <div> neutro.
 */
export default function LoginLayer({ exiting, vars, children }: LoginLayerProps) {
  return (
    <div
      className={exiting ? "g7-login-layer g7-exiting" : undefined}
      style={exiting ? (vars ?? undefined) : undefined}
      aria-hidden={exiting || undefined}
      inert={exiting || undefined}
    >
      {children}
      {exiting && <div className="g7-glow-sweep" aria-hidden />}
    </div>
  );
}
