import React from "react";

/**
 * Renderiza texto com **negrito** e quebras de linha como elementos React.
 * Nunca usa dangerouslySetInnerHTML: qualquer HTML no conteúdo é exibido como texto.
 */
export default function RichText({ text, className }: { text: string; className?: string }) {
  const lines = String(text ?? "").split("\n");
  return (
    <span className={className}>
      {lines.map((line, li) => (
        <React.Fragment key={li}>
          {li > 0 && <br />}
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, pi) =>
            part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
              <strong key={pi} className="font-semibold text-primary">{part.slice(2, -2)}</strong>
            ) : (
              <React.Fragment key={pi}>{part}</React.Fragment>
            )
          )}
        </React.Fragment>
      ))}
    </span>
  );
}

export const stripMarkdown = (s: string) => s.replace(/\*\*/g, "");
