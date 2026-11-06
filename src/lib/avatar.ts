/**
 * Preparo da foto de perfil no navegador: recorta em quadrado (centralizado), reduz para 256×256 e
 * comprime em JPEG. O servidor revalida tipo, conteúdo e tamanho — esta etapa só evita enviar fotos grandes.
 */
export const AVATAR_SIZE = 256;
export const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
export const MAX_RESULT_CHARS = 300_000;
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Recorte "cover": maior quadrado centralizado da imagem original. */
export function coverCrop(width: number, height: number): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height);
  return { sx: Math.round((width - side) / 2), sy: Math.round((height - side) / 2), side };
}

/** Mensagem de erro para um arquivo inválido, ou `null` se puder ser usado. */
export function validateSourceFile(file: { type: string; size: number }): string | null {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) return "Use uma imagem JPEG, PNG ou WEBP.";
  if (file.size > MAX_SOURCE_BYTES) return "A imagem é muito grande (máximo de 8 MB).";
  return null;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Não foi possível ler a imagem.")); };
    img.src = url;
  });
}

export async function fileToAvatarDataUrl(file: File, size = AVATAR_SIZE): Promise<string> {
  const invalid = validateSourceFile(file);
  if (invalid) throw new Error(invalid);
  const img = await loadImage(file);
  const { sx, sy, side } = coverCrop(img.naturalWidth, img.naturalHeight);
  if (side <= 0) throw new Error("Imagem inválida.");
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Seu navegador não suporta o preparo da imagem.");
  ctx.fillStyle = "#ffffff"; // PNG com transparência não vira fundo preto no JPEG
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  for (const q of [0.86, 0.78, 0.7, 0.6]) {
    const out = canvas.toDataURL("image/jpeg", q);
    if (out.length <= MAX_RESULT_CHARS) return out;
  }
  throw new Error("Não foi possível reduzir a imagem o bastante. Tente outra foto.");
}
