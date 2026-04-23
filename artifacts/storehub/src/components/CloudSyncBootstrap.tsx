import { useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { isCloudMode } from "../services/storageMode";
import { installAutoPush, pullAll } from "../services/cloudSync";

/**
 * Mounts inside both AuthProvider and AppProvider.
 * - Always installs the auto-push hook on localStorage (no-op when not in cloud mode).
 * - When the user is authenticated AND cloud mode is on → pulls all data from
 *   the server into localStorage on boot, then writes start streaming back up.
 */
export function CloudSyncBootstrap() {
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    installAutoPush();
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) return;
    if (!isCloudMode()) return;
    void pullAll().then((res) => {
      if (!res.ok) console.warn("[CloudSync] pull failed:", res.error);
      else window.dispatchEvent(new CustomEvent("storehub:cloud-hydrated"));
    });
  }, [isAuthenticated, isLoading]);

  return null;
}
