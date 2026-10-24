import { createContext, useContext, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { MemoryConsoleStore, type ConsoleStore } from "./store";
import type { ConsoleCatalog } from "./types";

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

export function useSelectedMachine() {
  const catalog = useConsoleCatalog();
  return useMemo(
    () => catalog.machines.find((item) => item.id === catalog.selectedMachineId) ?? null,
    [catalog],
  );
}
