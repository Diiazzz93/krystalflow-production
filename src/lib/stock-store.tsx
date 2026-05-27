// Runtime stock store.
// Wraps MOCK_STOCK in a React context so newly added items propagate to the
// Stock page, job stock checks, and manufacturing readiness calculations.
// Swap the initial state for `useQuery(['stock'], fetchStock)` when wiring
// the real backend.

import {
  createContext,
  useCallback,
  useContext,
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

function uid() {
  return `stk-${Math.random().toString(36).slice(2, 9)}`;
}

export function StockStoreProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<StockItem[]>(MOCK_STOCK);

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
