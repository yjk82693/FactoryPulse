import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { getConfig } from "../config";
import { useAccessToken } from "../auth/useAccessToken";
import { createConsoleStore } from "./createStore";
import { MemoryConsoleStore, type ConsoleStore } from "./store";
import type { ConsoleCatalog, ConsoleMeta } from "./types";
import { HttpConsoleStore } from "./httpStore";

const StoreContext = createContext<ConsoleStore | null>(null);

export function ConsoleProvider({
  children,
  store,
}: {
  children: ReactNode;
  store?: ConsoleStore;
}) {
  const fallback = useRef<MemoryConsoleStore | null>(null);
  if (!fallback.current) {
    fallback.current = new MemoryConsoleStore();
  }
  const value = store ?? fallback.current;
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function ConfiguredConsoleProvider({ children }: { children: ReactNode }) {
  const config = getConfig();
  const { getToken } = useAccessToken();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const store = useMemo(
    () => createConsoleStore(config, () => getTokenRef.current()),
    [config],
  );

  useEffect(() => {
    if (store instanceof HttpConsoleStore) {
      void store.refresh();
    }
  }, [store]);

  return <ConsoleProvider store={store}>{children}</ConsoleProvider>;
}

export function useConsoleStore(): ConsoleStore {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error("useConsoleStore requires ConsoleProvider");
  }
  return store;
}

export function useConsoleCatalog(): ConsoleCatalog {
  const store = useConsoleStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function useConsoleMeta(): ConsoleMeta {
  const store = useConsoleStore();
  return useSyncExternalStore(store.subscribe, store.getMeta, store.getMeta);
}

export function useSelectedMachine() {
  const catalog = useConsoleCatalog();
  return useMemo(
    () => catalog.machines.find((item) => item.id === catalog.selectedMachineId) ?? null,
    [catalog],
  );
}
