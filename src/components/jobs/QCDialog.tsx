import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/store";
import type { QCEntry } from "@/lib/types";
import { fmtDateTime, uid } from "@/lib/utils-domain";
import { CheckCircle2, XCircle, Image as ImageIcon } from "lucide-react";

const CHECKS = [
  ["fillLevel", "Fill level"],
  ["capTightness", "Cap tightness"],
  ["labelAlignment", "Label alignment"],
  ["batchCode", "Batch code verified"],
  ["leakCheck", "Leak check"],
  ["bottleCondition", "Bottle condition"],
] as const;

type CheckKey = (typeof CHECKS)[number][0];

interface Props {
  jobId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function QCDialog({ jobId, open, onOpenChange }: Props) {
  const { jobs, qc, addQC } = useStore();
  const job = jobs.find((j) => j.id === jobId);
  const history = useMemo(
    () =>
      qc
        .filter((q) => q.jobId === jobId)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [qc, jobId],
  );

  const nextPallet = (job?.palletsCompleted ?? 0) + 1;

  const [palletNumber, setPalletNumber] = useState(nextPallet);
  const [checks, setChecks] = useState<Record<CheckKey, "Pass" | "Fail">>({
    fillLevel: "Pass",
    capTightness: "Pass",
    labelAlignment: "Pass",
    batchCode: "Pass",
    leakCheck: "Pass",
    bottleCondition: "Pass",
  });
  const [bottleCount, setBottleCount] = useState(1200);
  const [operatorName, setOperatorName] = useState(job?.operator ?? "");
  const [supervisorSignoff, setSupervisorSignoff] = useState("");
  const [notes, setNotes] = useState("");

  if (!job) return null;

  function toggle(k: CheckKey) {
    setChecks((c) => ({ ...c, [k]: c[k] === "Pass" ? "Fail" : "Pass" }));
  }

  function submit() {
    const result: "Pass" | "Fail" = Object.values(checks).some((v) => v === "Fail")
      ? "Fail"
      : "Pass";
    const entry: QCEntry = {
      id: uid(),
      jobId,
      palletNumber,
      ...checks,
      bottleCount,
      operatorName,
      supervisorSignoff,
      notes,
      timestamp: new Date().toISOString(),
      result,
    };
    addQC(entry);
    setPalletNumber((n) => n + 1);
    setNotes("");
    setChecks({
      fillLevel: "Pass",
      capTightness: "Pass",
      labelAlignment: "Pass",
      batchCode: "Pass",
      leakCheck: "Pass",
      bottleCondition: "Pass",
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Quality Control — {job.product}</DialogTitle>
          <DialogDescription>
            {job.customer} · SKU {job.sku} · {job.bottleSize}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-6">
          <section className="space-y-4">
            <h3 className="text-sm font-semibold">New QC check</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-muted-foreground">Pallet #</Label>
                <Input
                  type="number"
                  value={palletNumber}
                  onChange={(e) => setPalletNumber(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-muted-foreground">Bottle count</Label>
                <Input
                  type="number"
                  value={bottleCount}
                  onChange={(e) => setBottleCount(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="space-y-2">
              {CHECKS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggle(key)}
                  className={`w-full flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors ${
                    checks[key] === "Pass"
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : "border-red-500/40 bg-red-500/10"
                  }`}
                >
                  <span className="font-medium">{label}</span>
                  {checks[key] === "Pass" ? (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                      <CheckCircle2 className="size-4" /> Pass
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-red-600 dark:text-red-400 text-xs font-semibold">
                      <XCircle className="size-4" /> Fail
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-muted-foreground">Operator</Label>
                <Input value={operatorName} onChange={(e) => setOperatorName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase text-muted-foreground">Supervisor sign-off</Label>
                <Input
                  value={supervisorSignoff}
                  onChange={(e) => setSupervisorSignoff(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-muted-foreground">Notes / issues</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground border border-dashed rounded-md px-3 py-2">
              <ImageIcon className="size-4" />
              Photo upload (placeholder — coming soon)
            </div>

            <Button className="w-full" onClick={submit}>
              Submit QC check
            </Button>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">QC history</h3>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No QC checks recorded yet.</p>
            ) : (
              <ol className="relative border-s border-border ms-3 space-y-3">
                {history.map((h) => (
                  <li key={h.id} className="ms-4">
                    <span
                      className={`absolute -start-1.5 mt-1.5 size-3 rounded-full ${
                        h.result === "Pass" ? "bg-emerald-500" : "bg-red-500"
                      }`}
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Pallet #{h.palletNumber}</span>
                      <Badge
                        className={
                          h.result === "Pass"
                            ? "bg-emerald-600 text-white"
                            : "bg-red-600 text-white"
                        }
                      >
                        {h.result}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{fmtDateTime(h.timestamp)}</p>
                    <p className="text-xs text-muted-foreground">
                      {h.operatorName} · {h.bottleCount} bottles
                      {h.supervisorSignoff && ` · sign-off ${h.supervisorSignoff}`}
                    </p>
                    {h.notes && <p className="text-xs mt-1">{h.notes}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
