import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ShippedPallet {
  id: string;
  jobId: string;
  palletNumber: number;
  shippedAt: string; // ISO
  shippedBy: string | null;
  notes: string | null;
}

interface Row {
  id: string;
  job_id: string;
  pallet_number: number;
  shipped_at: string;
  shipped_by: string | null;
  notes: string | null;
}

function rowToShipped(r: Row): ShippedPallet {
  return {
    id: r.id,
    jobId: r.job_id,
    palletNumber: r.pallet_number,
    shippedAt: r.shipped_at,
    shippedBy: r.shipped_by,
    notes: r.notes,
  };
}

/** Shipments scoped to a single job. */
export function useJobShipments(jobId: string | null | undefined) {
  const [items, setItems] = useState<ShippedPallet[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!jobId) {
      setItems([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("shipped_pallets")
      .select("*")
      .eq("job_id", jobId)
      .order("pallet_number", { ascending: true });
    setLoading(false);
    if (error) {
      toast.error(`Failed to load shipments: ${error.message}`);
      return;
    }
    setItems(((data ?? []) as Row[]).map(rowToShipped));
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  const markShipped = useCallback(
    async (palletNumber: number, shippedAt?: string) => {
      if (!jobId) return;
      const { data, error } = await supabase
        .from("shipped_pallets")
        .insert({
          job_id: jobId,
          pallet_number: palletNumber,
          shipped_at: shippedAt ?? new Date().toISOString(),
        })
        .select()
        .single();
      if (error || !data) {
        toast.error(error?.message ?? "Could not mark pallet shipped");
        return;
      }
      setItems((prev) => [...prev, rowToShipped(data as Row)].sort((a, b) => a.palletNumber - b.palletNumber));
    },
    [jobId],
  );

  const unmarkShipped = useCallback(
    async (palletNumber: number) => {
      if (!jobId) return;
      const { error } = await supabase
        .from("shipped_pallets")
        .delete()
        .eq("job_id", jobId)
        .eq("pallet_number", palletNumber);
      if (error) {
        toast.error(error.message);
        return;
      }
      setItems((prev) => prev.filter((s) => s.palletNumber !== palletNumber));
    },
    [jobId],
  );

  return { items, loading, reload: load, markShipped, unmarkShipped };
}

/** All shipments across every job (for the Shipping page). */
export function useAllShipments() {
  const [items, setItems] = useState<ShippedPallet[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("shipped_pallets")
      .select("*")
      .order("shipped_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error(`Failed to load shipments: ${error.message}`);
      return;
    }
    setItems(((data ?? []) as Row[]).map(rowToShipped));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markShipped = useCallback(
    async (jobId: string, palletNumber: number, shippedAt?: string) => {
      const { data, error } = await supabase
        .from("shipped_pallets")
        .insert({
          job_id: jobId,
          pallet_number: palletNumber,
          shipped_at: shippedAt ?? new Date().toISOString(),
        })
        .select()
        .single();
      if (error || !data) {
        toast.error(error?.message ?? "Could not mark pallet shipped");
        return;
      }
      setItems((prev) => [rowToShipped(data as Row), ...prev]);
    },
    [],
  );

  const unmarkShipped = useCallback(async (jobId: string, palletNumber: number) => {
    const { error } = await supabase
      .from("shipped_pallets")
      .delete()
      .eq("job_id", jobId)
      .eq("pallet_number", palletNumber);
    if (error) {
      toast.error(error.message);
      return;
    }
    setItems((prev) => prev.filter((s) => !(s.jobId === jobId && s.palletNumber === palletNumber)));
  }, []);

  return { items, loading, reload: load, markShipped, unmarkShipped };
}
