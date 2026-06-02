// Runtime stock store.
// Wraps MOCK_STOCK in a React context so newly added items propagate to the
// Stock page, job stock checks, and manufacturing readiness calculations.
// Persisted to localStorage so manually added stock survives refresh.
// Swap the initial state / persistence for `useQuery(['stock'], fetchStock)`
// and a mutation when wiring the real backend.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { MOCK_STOCK, type StockItem } from "@/lib/stock";

export interface NewStockInput {
  name: string;
  sku: string;
  category: StockItem["category"];
  quantityOnHand: number;
  unit: string;
  location: string;
  source?: string;
  notes?: string;
  dateReceived?: string;
  reorderLevel?: number;
}

interface StockStoreValue {
  items: StockItem[];
  addItem: (input: NewStockInput) => StockItem;
  updateItem: (id: string, patch: Partial<StockItem>) => void;
}

const Ctx = createContext<StockStoreValue | null>(null);
const STORAGE_KEY = "krystalflow.stock.v1";

function uid() {
  return `stk-${Math.random().toString(36).slice(2, 9)}`;
}

function loadInitial(): StockItem[] {
  if (typeof window === "undefined") return MOCK_STOCK;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return MOCK_STOCK;
    const parsed = JSON.parse(raw) as StockItem[];
    return Array.isArray(parsed) && parsed.length ? parsed : MOCK_STOCK;
  } catch {
    return MOCK_STOCK;
  }
}

export function StockStoreProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<StockItem[]>(() => loadInitial());

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore quota errors
    }
  }, [items]);

  const addItem = useCallback<StockStoreValue["addItem"]>((input) => {
    const item: StockItem = {
      id: uid(),
      sku: input.sku.trim(),
      name: input.name.trim(),
      quantityOnHand: input.quantityOnHand,
      availableStock: input.quantityOnHand,
      allocatedStock: 0,
      reorderLevel: input.reorderLevel ?? 0,
      location: input.location.trim(),
      unit: input.unit.trim(),
      lastUpdated: new Date().toISOString(),
      category: input.category,
      source: input.source?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      dateReceived: input.dateReceived,
    };
    setItems((prev) => [item, ...prev]);
    return item;
  }, []);

  const updateItem = useCallback<StockStoreValue["updateItem"]>((id, patch) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, ...patch, lastUpdated: new Date().toISOString() } : i,
      ),
    );
  }, []);

  const value = useMemo(() => ({ items, addItem, updateItem }), [items, addItem, updateItem]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStockStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStockStore must be used within StockStoreProvider");
  return ctx;
}
