/**
 * Validação da foto de perfil NO SERVIDOR (o navegador já reduz a imagem, mas nunca é confiável).
 * Aceita somente data URL de JPEG/PNG/WEBP cujo conteúdo realmente é essa imagem (confere os bytes iniciais)
 * e com tamanho limitado. Usa `Buffer`: importar apenas no servidor/testes.
 */
export const MAX_PHOTO_CHARS = 400_000; // ~300 KB de imagem; o navegador envia 256×256 comprimida (~20–60 KB)

export function validPhotoDataUrl(v: unknown): v is string {
  if (typeof v !== "string" || v.length > MAX_PHOTO_CHARS) return false;
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(v);
  if (!m) return false;
  const head = Buffer.from(m[2].slice(0, 24), "base64");
  if (m[1] === "jpeg") return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  if (m[1] === "png") return head.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  return head.subarray(0, 4).toString("ascii") === "RIFF" && head.subarray(8, 12).toString("ascii") === "WEBP";
}
