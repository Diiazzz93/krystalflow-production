import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { QCFormValues, QCCheckKey } from "./qc-validation";

export type PartPalletValues = QCFormValues & {
  checks: Record<QCCheckKey, "Pass" | "Fail" | "">;
  palletType: "" | "CHEP" | "Recochem" | "Plain";
  linkedJobId: string;
  wantAssembly: boolean;
  fillOperator: string;
  finishedProductFileName: string;
  finalProductPhotoName: string;
};
export interface PartPallet {
  id: string;
  jobId: string;
  standalone: boolean;
  palletNumber: number;
  updatedAt: string;
  values: PartPalletValues;
}

// Drafts intentionally never enter QCEntry[]: no progress, shipping or assemblies.
export function partPalletWrite(values: PartPalletValues) {
  return {
    job_id: values.linkedJobId || "standalone",
    standalone: values.standalone,
    pallet_number: values.palletNumber,
    data: JSON.parse(JSON.stringify(values)),
    updated_at: new Date().toISOString(),
  };
}

export function usePartPallets() {
  const { user, can } = useAuth();
  const enabled = !!user && can("qc:complete");
  const [partPallets, setPartPallets] = useState<PartPallet[]>([]);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    const { data, error } = await supabase.from("qc_pallet_drafts").select("*").order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    setPartPallets((data ?? []).map(r => ({
      id: r.id, jobId: r.job_id, standalone: r.standalone,
      palletNumber: r.pallet_number, updatedAt: r.updated_at,
      values: r.data as unknown as PartPalletValues,
    })));
  }, [enabled]);
  useEffect(() => {
    if (!enabled) { setPartPallets([]); return; }
    const reload = () => { void refresh().catch(console.error); };
    reload();
    const channel = supabase.channel(`part-pallets-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "qc_pallet_drafts" }, reload).subscribe();
    window.addEventListener("focus", reload);
    return () => { void supabase.removeChannel(channel); window.removeEventListener("focus", reload); };
  }, [enabled, refresh]);
  const savePartPallet = async (values: PartPalletValues, existing?: PartPallet | null) => {
    if (!user || !enabled) throw new Error("Sign in as a QC operator to save part pallets.");
    const write = partPalletWrite(values);
    const query = existing
      ? supabase.from("qc_pallet_drafts").update(write).eq("id", existing.id).eq("updated_at", existing.updatedAt)
      : supabase.from("qc_pallet_drafts").insert({ ...write, created_by: user.id });
    const { data, error } = await query.select("id").single();
    if (error || !data) throw new Error(existing ? "Part pallet changed. Reopen it before saving again." : error?.message ?? "Could not save part pallet.");
    await refresh();
    return data.id;
  };
  return { partPallets, savePartPallet, refresh };
}