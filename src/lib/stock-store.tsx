// Supabase-backed stock store.
// Same hook API as before (`useStockStore` returning `{ items, addItem, updateItem }`),
// but data lives in `public.inventory_items`. RLS enforces who can write.
// On first load by an admin/manager, if the table is empty, we seed from MOCK_STOCK
// so existing demo data continues to appear in dropdowns and the Stock page.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { MOCK_STOCK, type StockItem, type StockCategory } from "@/lib/stock";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export interface NewStockInput {
  name: string;
  sku: string;
  category: StockCategory;
  quantityOnHand: number;
  unit: string;
  location: string;
  source?: string;
  notes?: string;
  dateReceived?: string;
  reorderLevel?: number;
}

export type AdjustmentType = "received" | "damaged" | "correction" | "stocktake";

export interface StockAdjustment {
  id: string;
  inventoryItemId: string;
  userId: string | null;
  userName: string;
  adjustmentType: AdjustmentType;
  quantityChange: number;
  previousQuantity: number;
  newQuantity: number;
  reason: string;
  notes: string | null;
  adjustmentDate: string;
  createdAt: string;
}

export interface AdjustmentInput {
  adjustmentType: AdjustmentType;
  /** received/damaged/correction: signed delta. stocktake: absolute new total. */
  value: number;
  reason: string;
  notes?: string;
  adjustmentDate: string;
}

interface StockStoreValue {
  items: StockItem[];
  loading: boolean;
  addItem: (input: NewStockInput) => Promise<StockItem | null>;
  updateItem: (id: string, patch: Partial<StockItem>) => Promise<void>;
  adjustStock: (id: string, input: AdjustmentInput) => Promise<void>;
  listAdjustments: (id: string) => Promise<StockAdjustment[]>;
  refresh: () => Promise<StockItem[]>;
}

const Ctx = createContext<StockStoreValue | null>(null);

// DB row → app StockItem
function rowToItem(r: Record<string, unknown>): StockItem {
  return {
    id: String(r.id),
    sku: String(r.sku ?? ""),
    name: String(r.name ?? ""),
    category: (r.category as StockCategory) ?? "Other",
    quantityOnHand: Number(r.quantity_on_hand ?? 0),
    availableStock: Number(r.available_stock ?? 0),
    allocatedStock: Number(r.allocated_stock ?? 0),
    reorderLevel: Number(r.reorder_level ?? 0),
    location: String(r.location ?? ""),
    unit: String(r.unit ?? "units"),
    source: (r.source as string) ?? undefined,
    notes: (r.notes as string) ?? undefined,
    dateReceived: (r.date_received as string) ?? undefined,
    lastUpdated: String(r.last_updated ?? new Date().toISOString()),
  };
}

function inputToRow(input: NewStockInput) {
  return {
    sku: input.sku.trim(),
    name: input.name.trim(),
    category: input.category,
    quantity_on_hand: input.quantityOnHand,
    available_stock: input.quantityOnHand,
    allocated_stock: 0,
    reorder_level: input.reorderLevel ?? 0,
    location: input.location.trim(),
    unit: input.unit.trim(),
    source: input.source?.trim() || null,
    notes: input.notes?.trim() || null,
    date_received: input.dateReceived || null,
  };
}

function patchToRow(patch: Partial<StockItem>) {
  const row: Record<string, unknown> = {};
  if (patch.sku !== undefined) row.sku = patch.sku;
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.quantityOnHand !== undefined) row.quantity_on_hand = patch.quantityOnHand;
  if (patch.availableStock !== undefined) row.available_stock = patch.availableStock;
  if (patch.allocatedStock !== undefined) row.allocated_stock = patch.allocatedStock;
  if (patch.reorderLevel !== undefined) row.reorder_level = patch.reorderLevel;
  if (patch.location !== undefined) row.location = patch.location;
  if (patch.unit !== undefined) row.unit = patch.unit;
  if (patch.source !== undefined) row.source = patch.source;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.dateReceived !== undefined) row.date_received = patch.dateReceived;
  row.last_updated = new Date().toISOString();
  return row;
}

export function StockStoreProvider({ children }: { children: ReactNode }) {
  const { user, hasRole } = useAuth();
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const seededRef = useRef(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("*")
      .order("last_updated", { ascending: false });
    if (error) {
      console.error("[stock] load failed", error);
      toast.error(`Failed to load stock: ${error.message}`);
      return [] as StockItem[];
    }
    const mapped = (data ?? []).map(rowToItem);
    setItems(mapped);
    return mapped;
  }, []);

  // Initial load + one-time seed for empty table (admin/manager only).
  useEffect(() => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const loaded = await load();
      if (cancelled) return;
      if (loaded.length === 0 && !seededRef.current && hasRole("admin", "manager")) {
        seededRef.current = true;
        const rows = MOCK_STOCK.map((m) => ({
          sku: m.sku,
          name: m.name,
          category: m.category ?? "Other",
          quantity_on_hand: m.quantityOnHand,
          available_stock: m.availableStock,
          allocated_stock: m.allocatedStock,
          reorder_level: m.reorderLevel,
          location: m.location,
          unit: m.unit,
          last_updated: m.lastUpdated,
        }));
        const { error: seedErr } = await supabase.from("inventory_items").insert(rows);
        if (seedErr) {
          console.error("[stock] seed failed", seedErr);
        } else {
          await load();
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, hasRole, load]);

  const addItem = useCallback<StockStoreValue["addItem"]>(
    async (input) => {
      const { data, error } = await supabase
        .from("inventory_items")
        .insert(inputToRow(input))
        .select()
        .single();
      if (error || !data) {
        toast.error(error?.message ?? "Could not add stock item");
        return null;
      }
      const item = rowToItem(data);
      setItems((prev) => [item, ...prev]);
      return item;
    },
    [],
  );

  const updateItem = useCallback<StockStoreValue["updateItem"]>(async (id, patch) => {
    const { data, error } = await supabase
      .from("inventory_items")
      .update(patchToRow(patch) as never)
      .eq("id", id)
      .select()
      .single();
    if (error || !data) {
      toast.error(error?.message ?? "Could not update stock item");
      return;
    }
    const item = rowToItem(data);
    setItems((prev) => prev.map((i) => (i.id === id ? item : i)));
  }, []);

  const adjustStock = useCallback<StockStoreValue["adjustStock"]>(
    async (id, input) => {
      const current = items.find((i) => i.id === id);
      if (!current) {
        toast.error("Stock item not found");
        return;
      }
      const previous = current.quantityOnHand;
      const newQty =
        input.adjustmentType === "stocktake"
          ? input.value
          : previous + input.value;
      if (!Number.isFinite(newQty) || newQty < 0) {
        toast.error("Resulting quantity cannot be negative");
        return;
      }
      const delta = newQty - previous;
      const newAvailable = Math.max(0, current.availableStock + delta);

      const { data: updated, error: updErr } = await supabase
        .from("inventory_items")
        .update({
          quantity_on_hand: newQty,
          available_stock: newAvailable,
          last_updated: new Date().toISOString(),
        } as never)
        .eq("id", id)
        .select()
        .single();
      if (updErr || !updated) {
        toast.error(updErr?.message ?? "Could not adjust stock");
        return;
      }

      const { error: insErr } = await supabase.from("stock_adjustments").insert({
        inventory_item_id: id,
        user_id: user?.id ?? null,
        user_name: user?.name ?? user?.email ?? "Unknown",
        adjustment_type: input.adjustmentType,
        quantity_change: delta,
        previous_quantity: previous,
        new_quantity: newQty,
        reason: input.reason,
        notes: input.notes?.trim() || null,
        adjustment_date: input.adjustmentDate,
      } as never);
      if (insErr) {
        toast.error(`Stock updated but history not recorded: ${insErr.message}`);
      }

      const item = rowToItem(updated);
      setItems((prev) => prev.map((i) => (i.id === id ? item : i)));
    },
    [items, user],
  );

  const listAdjustments = useCallback<StockStoreValue["listAdjustments"]>(
    async (id) => {
      const { data, error } = await supabase
        .from("stock_adjustments")
        .select("*")
        .eq("inventory_item_id", id)
        .order("created_at", { ascending: false });
      if (error) {
        toast.error(`Failed to load history: ${error.message}`);
        return [];
      }
      return (data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id),
        inventoryItemId: String(r.inventory_item_id),
        userId: (r.user_id as string) ?? null,
        userName: String(r.user_name ?? ""),
        adjustmentType: r.adjustment_type as AdjustmentType,
        quantityChange: Number(r.quantity_change ?? 0),
        previousQuantity: Number(r.previous_quantity ?? 0),
        newQuantity: Number(r.new_quantity ?? 0),
        reason: String(r.reason ?? ""),
        notes: (r.notes as string) ?? null,
        adjustmentDate: String(r.adjustment_date ?? ""),
        createdAt: String(r.created_at ?? ""),
      }));
    },
    [],
  );

  const value = useMemo(
    () => ({ items, loading, addItem, updateItem, adjustStock, listAdjustments, refresh: load }),
    [items, loading, addItem, updateItem, adjustStock, listAdjustments, load],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStockStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStockStore must be used within StockStoreProvider");
  return ctx;
}
