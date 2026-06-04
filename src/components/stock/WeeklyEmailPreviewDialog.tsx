import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useStockStore } from "@/lib/stock-store";
import { useBranding } from "@/lib/branding";
import { buildWeeklyEmailHtml } from "@/lib/stock-alerts";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function WeeklyEmailPreviewDialog({ open, onOpenChange }: Props) {
  const { items } = useStockStore();
  const branding = useBrandingSafe();
  const html = useMemo(
    () => buildWeeklyEmailHtml(items, { brand: branding }),
    [items, branding],
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Weekly stock alert email — preview</DialogTitle>
          <DialogDescription>
            Template only. No email is sent yet. Once email delivery is configured this will be
            scheduled to send weekly to your team.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto rounded-md border border-border bg-black">
          <iframe title="Weekly stock email" srcDoc={html} className="w-full h-[60vh] bg-black" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function useBrandingSafe(): string {
  try {
    const b = useBranding();
    return b?.branding?.companyName ?? "KrystalFlow";
  } catch {
    return "KrystalFlow";
  }
}
