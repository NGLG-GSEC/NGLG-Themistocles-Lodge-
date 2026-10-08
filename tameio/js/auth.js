/**
 * Optional password protection. Passwords are salted SHA-256 hashes kept in LocalStorage.
 * NOTE: client-side only – it deters casual access, it is not a substitute for server-side security.
 * @module auth
 */
import { ROLES } from './config.js';

export async function sha256(text) {
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // very weak fallback for insecure contexts (http://): FNV-1a x4
  let out = '';
  for (let k = 0; k < 4; k++) { let h = 0x811c9dc5 ^ k; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } out += h.toString(16).padStart(8, '0'); }
  return `weak-${out}`;
}

export const newSalt = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function hashPassword(pw, salt, role) { return sha256(`${salt}:${role}:${pw}`); }

/** Set (or clear with null) the password of a role. */
export async function setPassword(store, role, pw) {
  const auth = { ...store.settings.auth }; auth.salt ||= newSalt(); auth.hashes = { ...auth.hashes };
  if (pw) auth.hashes[role] = await hashPassword(pw, auth.salt, role); else delete auth.hashes[role];
  store.updateSettings({ auth });
}

export async function verify(store, role, pw) {
  const { hashes, salt } = store.settings.auth; if (!hashes[role]) return false;
  return (await hashPassword(pw, salt, role)) === hashes[role];
}

export const rolesWithPassword = (store) => Object.keys(ROLES).filter((r) => store.settings.auth.hashes[r]);
