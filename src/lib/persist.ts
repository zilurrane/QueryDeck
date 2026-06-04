// Local persistence: tauri-plugin-store for non-secret state, OS keychain
// (via Rust commands) for connection passwords.

import { load, type Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";

let storePromise: Promise<Store> | null = null;
function getStore(): Promise<Store> {
  if (!storePromise) storePromise = load("querydeck.json");
  return storePromise;
}

export async function loadKey<T>(key: string, fallback: T): Promise<T> {
  try {
    const s = await getStore();
    const v = await s.get<T>(key);
    return v === undefined || v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

export async function saveKey<T>(key: string, value: T): Promise<void> {
  try {
    const s = await getStore();
    await s.set(key, value);
    await s.save();
  } catch {
    /* ignore persistence failures */
  }
}

export const secretSet = (key: string, value: string) =>
  invoke<void>("secret_set", { key, value });
export const secretGet = (key: string) => invoke<string | null>("secret_get", { key });
export const secretDelete = (key: string) => invoke<void>("secret_delete", { key });
