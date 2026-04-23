export type StorageMode = "local" | "cloud";

const KEY = "storehub_storage_mode";

export function getStorageMode(): StorageMode {
  const v = localStorage.getItem(KEY);
  return v === "cloud" ? "cloud" : "local";
}

export function setStorageMode(mode: StorageMode): void {
  localStorage.setItem(KEY, mode);
  window.dispatchEvent(new CustomEvent("storehub:storage-mode-changed", { detail: mode }));
}

export function isCloudMode(): boolean {
  return getStorageMode() === "cloud";
}
