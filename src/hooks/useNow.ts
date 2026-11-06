import { useEffect, useState } from "react";

/** Instante atual (ms) que se atualiza a cada `intervalMs`, para recalcular prazos de SLA na tela. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
