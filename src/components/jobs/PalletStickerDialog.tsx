import { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import type { Job, QCEntry } from "@/lib/types";
import { fmtDateTime } from "@/lib/utils-domain";
import { useState } from "react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entry: QCEntry;
  job: Job;
}

export function PalletStickerDialog({ open, onOpenChange, entry, job }: Props) {
  const stickerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const code = entry.palletCode ?? entry.id;

  function handlePrint() {
    const node = stickerRef.current;
    if (!node) return;
    const win = window.open("", "_blank", "width=520,height=720");
    if (!win) {
      toast.error("Pop-up blocked — allow pop-ups to print stickers.");
      return;
    }
    win.document.write(`<!doctype html><html><head><title>Pallet sticker ${code}</title>
<style>
  @page { size: 100mm 150mm; margin: 6mm; }
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; padding: 0; color: #000; }
  .sticker { width: 88mm; border: 2px solid #000; border-radius: 6px; padding: 6mm; }
  .row { display: flex; justify-content: space-between; align-items: flex-start; gap: 4mm; }
  .brand { font-weight: 800; font-size: 11pt; letter-spacing: .04em; text-transform: uppercase; }
  .meta { font-size: 8pt; color: #333; }
  h2 { margin: 2mm 0; font-size: 14pt; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5mm 4mm; font-size: 9pt; margin-top: 2mm; }
  .grid div span { color: #555; display: block; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .04em; }
  .code { margin-top: 3mm; padding: 2mm; border: 1.5px dashed #000; text-align: center; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 700; font-size: 13pt; letter-spacing: .08em; }
  .foot { margin-top: 3mm; font-size: 7.5pt; text-align: center; color: #333; }
  .badge { display:inline-block; padding: 1mm 2mm; border-radius: 3px; font-size: 8pt; font-weight: 700; }
  .pass { background:#065f46; color:#fff; }
  .fail { background:#991b1b; color:#fff; }
</style></head><body>${node.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
      win.close();
    }, 250);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pallet sticker</DialogTitle>
          <DialogDescription>
            Print and apply to pallet #{entry.palletNumber}. Customers can quote
            this code if any issue arises.
          </DialogDescription>
        </DialogHeader>

        <div ref={stickerRef}>
          <div className="sticker rounded-md border-2 border-foreground bg-white p-4 text-black">
            <div className="row flex items-start justify-between gap-3">
              <div>
                <div className="brand text-[11px] font-extrabold uppercase tracking-wider">
                  Krystalshield
                </div>
                <div className="meta text-[9px] text-neutral-600">
                  {fmtDateTime(entry.timestamp)}
                </div>
              </div>
              <span
                className={`badge ${entry.result === "Pass" ? "pass bg-emerald-700 text-white" : "fail bg-red-800 text-white"} rounded px-1.5 py-0.5 text-[9px] font-bold uppercase`}
              >
                {entry.result}
              </span>
            </div>

            <h2 className="my-1 text-[14pt] font-bold leading-tight">
              {job.product}
            </h2>
            <div className="meta text-[9px] text-neutral-600">
              {job.customer} · SKU {job.sku} · {job.bottleSize}
            </div>

            <div className="grid mt-2 grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
              <div>
                <span className="block text-[8px] uppercase tracking-wider text-neutral-500">
                  Pallet
                </span>
                #{entry.palletNumber}
              </div>
              <div>
                <span className="block text-[8px] uppercase tracking-wider text-neutral-500">
                  Bottles
                </span>
                {entry.bottleCount}
              </div>
              {entry.mNumber && (
                <div>
                  <span className="block text-[8px] uppercase tracking-wider text-neutral-500">
                    M Number
                  </span>
                  {entry.mNumber}
                </div>
              )}
              {entry.boxesPerPallet !== undefined && (
                <div>
                  <span className="block text-[8px] uppercase tracking-wider text-neutral-500">
                    Boxes
                  </span>
                  {entry.boxesPerPallet}
                </div>
              )}
              <div>
                <span className="block text-[8px] uppercase tracking-wider text-neutral-500">
                  Line
                </span>
                {job.line}
              </div>
              <div>
                <span className="block text-[8px] uppercase tracking-wider text-neutral-500">
                  Operator
                </span>
                {entry.operatorName || "—"}
              </div>
            </div>

            <div className="code mt-3 rounded border border-dashed border-black p-1.5 text-center font-mono text-[13pt] font-bold tracking-widest">
              {code}
            </div>
            <div className="foot mt-3 text-center text-[8px] text-neutral-600">
              Quote this code to trace this pallet.
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleCopy}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy code"}
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="size-4" /> Print sticker
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
