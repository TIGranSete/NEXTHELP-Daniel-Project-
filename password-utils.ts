import bcrypt from "bcryptjs";
import crypto from "crypto";

const BCRYPT_REGEX = /^\$2[aby]\$/;
const LEGACY_SHA256_REGEX = /^[a-f0-9]{64}$/i;

function isAlreadyHashed(value: string): boolean {
  return BCRYPT_REGEX.test(value) || LEGACY_SHA256_REGEX.test(value);
}

function legacySha256(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// Hashes a plain-text password with bcrypt. Safe to call on a value that is
// already hashed (bcrypt or the legacy unsalted SHA-256 format) — it is
// returned unchanged instead of being hashed again.
export function hashPassword(password: string): string {
  if (!password) return "";
  if (isAlreadyHashed(password)) return password;
  return bcrypt.hashSync(password, 10);
}

// Verifies a plain-text password against a stored value, supporting bcrypt
// (current format) and the legacy unsalted SHA-256 hashes that predate this
// migration, so existing accounts keep working until they set a new password.
export function verifyPassword(password: string, stored: string): boolean {
  if (!password || !stored) return false;
  if (BCRYPT_REGEX.test(stored)) {
    return bcrypt.compareSync(password, stored);
  }
  if (LEGACY_SHA256_REGEX.test(stored)) {
    return legacySha256(password) === stored;
  }
  return stored === password;
}
