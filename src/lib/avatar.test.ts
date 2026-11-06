import test from "node:test";
import assert from "node:assert/strict";
import { coverCrop, validateSourceFile, MAX_SOURCE_BYTES } from "./avatar";

test("recorte quadrado centralizado (paisagem, retrato e quadrada)", () => {
  assert.deepEqual(coverCrop(400, 200), { sx: 100, sy: 0, side: 200 });
  assert.deepEqual(coverCrop(200, 400), { sx: 0, sy: 100, side: 200 });
  assert.deepEqual(coverCrop(300, 300), { sx: 0, sy: 0, side: 300 });
});

test("validação do arquivo: só JPEG/PNG/WEBP e até 8 MB", () => {
  assert.equal(validateSourceFile({ type: "image/png", size: 1000 }), null);
  assert.equal(validateSourceFile({ type: "image/webp", size: MAX_SOURCE_BYTES }), null);
  assert.match(validateSourceFile({ type: "image/gif", size: 1000 })!, /JPEG, PNG ou WEBP/);
  assert.match(validateSourceFile({ type: "application/pdf", size: 1000 })!, /JPEG, PNG ou WEBP/);
  assert.match(validateSourceFile({ type: "image/jpeg", size: MAX_SOURCE_BYTES + 1 })!, /muito grande/);
});

import { validPhotoDataUrl, MAX_PHOTO_CHARS } from "./photoValidation";
const b64 = (bytes: number[], pad = 30) => Buffer.from([...bytes, ...new Array(pad).fill(0)]).toString("base64");
const PNG_B64 = b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPG_B64 = b64([0xff, 0xd8, 0xff, 0xe0]);
const WEBP_B64 = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x24, 0, 0, 0]), Buffer.from("WEBPVP8 "), Buffer.alloc(30)]).toString("base64");

test("servidor: aceita JPEG, PNG e WEBP reais", () => {
  assert.equal(validPhotoDataUrl(`data:image/png;base64,${PNG_B64}`), true);
  assert.equal(validPhotoDataUrl(`data:image/jpeg;base64,${JPG_B64}`), true);
  assert.equal(validPhotoDataUrl(`data:image/webp;base64,${WEBP_B64}`), true);
});

test("servidor: recusa formato não permitido, conteúdo disfarçado, lixo e excesso de tamanho", () => {
  assert.equal(validPhotoDataUrl(`data:image/gif;base64,${b64([0x47, 0x49, 0x46, 0x38])}`), false);
  assert.equal(validPhotoDataUrl(`data:image/jpeg;base64,${PNG_B64}`), false); // PNG rotulado como JPEG
  assert.equal(validPhotoDataUrl(`data:image/png;base64,${JPG_B64}`), false);
  assert.equal(validPhotoDataUrl("javascript:alert(1)"), false);
  assert.equal(validPhotoDataUrl("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="), false);
  assert.equal(validPhotoDataUrl(`data:image/png;base64,${PNG_B64}!!`), false);
  assert.equal(validPhotoDataUrl(undefined), false);
  assert.equal(validPhotoDataUrl(123), false);
  assert.equal(validPhotoDataUrl(`data:image/png;base64,${PNG_B64}` + "A".repeat(MAX_PHOTO_CHARS)), false);
});
