// Cloud saves: a share code is the only identity. Works from any origin that
// serves the game — the API lives on fsociety.work and allows CORS.

import type { World } from "../world";
import { migrateSave } from "../save";

const CODE_KEY = "farspace-cloud-code";
import { activeSlot } from "../save";
function codeKey(): string { const n = activeSlot(); return n === 0 ? CODE_KEY : `${CODE_KEY}-${n}`; }
const BASE_KEY = "farspace-cloud-base";
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"; // no I/L/O/0/1 confusion, all valid base32-ish

export function cloudBase(): string {
  try {
    const override = localStorage.getItem(BASE_KEY);
    if (override) return override.replace(/\/$/, "");
  } catch { /* no storage */ }
  const h = location.hostname;
  if (h === "farspace.fsociety.work") return "";
  return "https://farspace.fsociety.work";
}

export function getCode(): string | null {
  try { return localStorage.getItem(codeKey()); } catch { return null; }
}

export function setCode(code: string | null): void {
  try {
    if (code) localStorage.setItem(codeKey(), code.toUpperCase());
    else localStorage.removeItem(codeKey());
  } catch { /* ignore */ }
}

export function newCode(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  setCode(out);
  return out;
}

export function validCode(code: string): boolean {
  return /^[A-Z2-7]{8,12}$/.test(code.toUpperCase());
}

export interface CloudResult { ok: boolean; error?: string; updatedAt?: number }

export async function push(world: World): Promise<CloudResult> {
  const code = getCode();
  if (!code) return { ok: false, error: "no code" };
  try {
    const r = await fetch(`${cloudBase()}/api/save/${code}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(world),
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const j = (await r.json()) as { updatedAt?: number };
    return { ok: true, updatedAt: j.updatedAt };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function pull(code: string): Promise<{ world: World; updatedAt: number } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const r = await fetch(`${cloudBase()}/api/save/${code.toUpperCase()}`, { signal: controller.signal });
    if (!r.ok) return null;
    const j = (await r.json()) as { updatedAt: number; world: unknown };
    const world = migrateSave(j.world);
    if (!world) return null;
    return { world, updatedAt: j.updatedAt };
  } catch {
    return null;
  } finally { clearTimeout(timeout); }
}

// ---- file export / import (offline moves, the self-hosted copy, backups)

export function exportFile(world: World): void {
  const blob = new Blob([JSON.stringify(world)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  a.href = url;
  a.download = `farspace-save-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function importFile(): Promise<World | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      try { resolve(migrateSave(JSON.parse(await f.text()))); } catch { resolve(null); }
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
