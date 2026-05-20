import { useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { isCloudMode } from "../services/storageMode";
import { installAutoPush, pullAll, clearStaleLocalStorage } from "../services/cloudSync";

/**
 * Mounts inside both AuthProvider and AppProvider.
 * - Always installs the auto-push hook on localStorage (no-op when not in cloud mode).
 * - When the user is authenticated AND cloud mode is on → pulls all data from
 *   the server into localStorage on boot, then writes start streaming back up.
 */
export function CloudSyncBootstrap() {
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    clearStaleLocalStorage();
    installAutoPush();
  }, []);

  useEffect(() => {
    const activeStore = sessionStorage.getItem("sh_active_store_id");
    console.log(`[CloudSyncBootstrap] useEffect: isLoading=${isLoading}, isAuthenticated=${isAuthenticated}, activeStore=${activeStore}`);
    if (isLoading) return;
    if (!isAuthenticated) return;
    // Always pull in store-view mode (business owner viewing a store).
    // In normal mode, respect the stored storage-mode preference.
    const isStoreView = !!sessionStorage.getItem("sh_active_store_id");
    if (!isStoreView && !isCloudMode()) {
      console.log(`[CloudSyncBootstrap] Skipping pullAll: isStoreView=${isStoreView}, isCloudMode=${isCloudMode()}`);
      return;
    }
    console.log(`[CloudSyncBootstrap] Calling pullAll()`);
    void pullAll().then((res) => {
      if (!res.ok) console.warn("[CloudSync] pull failed:", res.error);
      else {
        console.log(`[CloudSyncBootstrap] pullAll succeeded`);
        window.dispatchEvent(new CustomEvent("storehub:cloud-hydrated"));
      }
    });
  }, [isAuthenticated, isLoading]);

  return null;
}
