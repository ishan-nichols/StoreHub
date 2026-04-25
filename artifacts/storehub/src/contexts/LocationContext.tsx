import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import {
  getLocations,
  getActiveLocationId,
  setActiveLocationId,
  type StoreLocation,
} from "../services/locationService";

interface LocationContextValue {
  locations: StoreLocation[];
  activeLocationId: string | null;
  activeLocation: StoreLocation | null;
  setActiveLocation: (id: string) => void;
  isMultiLocation: boolean;
  refreshLocations: () => Promise<void>;
}

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [locations, setLocations] = useState<StoreLocation[]>([]);
  const [activeLocationId, setActiveLocationIdState] = useState<string | null>(
    getActiveLocationId,
  );

  const refreshLocations = useCallback(async () => {
    try {
      const rows = await getLocations();
      setLocations(rows);

      // Auto-select default if nothing active yet
      if (!getActiveLocationId() && rows.length > 0) {
        const def = rows.find((l) => l.isDefault) ?? rows[0];
        setActiveLocationId(def.id);
        setActiveLocationIdState(def.id);
      }
    } catch {
      // silent — unauthenticated pages will just have empty locations
    }
  }, []);

  useEffect(() => {
    void refreshLocations();
  }, [refreshLocations]);

  const setActiveLocation = useCallback((id: string) => {
    setActiveLocationId(id);
    setActiveLocationIdState(id);
  }, []);

  const activeLocation = locations.find((l) => l.id === activeLocationId) ?? null;

  const value: LocationContextValue = {
    locations,
    activeLocationId,
    activeLocation,
    setActiveLocation,
    isMultiLocation: locations.length > 1,
    refreshLocations,
  };

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocation must be used within LocationProvider");
  return ctx;
}
