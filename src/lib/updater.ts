import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

// The Update handle returned by check() is not serializable, so we keep it
// here (module scope) rather than in the store, and reuse it to install.
let pending: Update | null = null;

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  body?: string;
}

/** Query the configured endpoint. Returns update info, or null if up to date. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const update = await check();
  if (update) {
    pending = update;
    return {
      version: update.version,
      currentVersion: update.currentVersion,
      body: update.body || undefined,
    };
  }
  pending = null;
  return null;
}

/** Download + install the pending update, reporting byte progress, then relaunch. */
export async function downloadAndInstall(
  onProgress?: (downloaded: number, total: number | null) => void
): Promise<void> {
  if (!pending) throw new Error("No update is pending — run checkForUpdate first.");
  let downloaded = 0;
  let total: number | null = null;
  await pending.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength ?? null;
        onProgress?.(0, total);
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress?.(downloaded, total);
        break;
      case "Finished":
        onProgress?.(total ?? downloaded, total);
        break;
    }
  });
  // On Windows the installer exits the app itself; elsewhere we relaunch.
  await relaunch();
}

export async function currentVersion(): Promise<string> {
  return getVersion();
}
