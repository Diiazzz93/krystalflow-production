import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, CheckCircle2, FileDown, Printer } from "lucide-react";
import type { Job } from "@/lib/types";
import { computeJobStockCheck } from "@/lib/job-stock";
import { JobStockCheck } from "./JobStockCheck";
import { cn } from "@/lib/utils";
import { downloadJobPdf, printJobPdf } from "@/lib/job-pdf";
import { useLineSetups } from "@/lib/line-setups";
import { useCustomerSpecs } from "@/lib/customer-specs";
import { CustomerSpecsView } from "@/components/customer-specs/CustomerSpecsView";
import { toast } from "sonner";

interface Props {
  job: Job | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function fmtDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function JobStockDialog({ job, open, onOpenChange }: Props) {
  const { presets } = useLineSetups();
  const { getSpecForCustomer } = useCustomerSpecs();
  if (!job) return null;
  const check = computeJobStockCheck(job);
  const totalMissing = check.requirements.reduce((s, r) => s + r.missing, 0);
  const customerSpec = getSpecForCustomer(job.customer);

  const handleDownload = () => {
    try {
      downloadJobPdf(job, presets);
      toast.success(`Run sheet PDF generated for ${job.id}`);
    } catch (e) {
      console.error(e);
      toast.error("Could not generate PDF");
    }
  };
  const handlePrint = () => {
    try {
      printJobPdf(job, presets);
    } catch (e) {
      console.error(e);
      toast.error("Could not open print preview");
    }
  };

  const summaryTone = check.hasShort
    ? "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400"
    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <DialogTitle>Stock requirements — {job.id}</DialogTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handlePrint}>
                <Printer className="size-4 mr-1" /> Print
              </Button>
              <Button size="sm" onClick={handleDownload}>
                <FileDown className="size-4 mr-1" /> Generate Job PDF
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className={cn("rounded-lg border p-3 flex items-center gap-3", summaryTone)}>
          {check.hasShort ? (
            <AlertTriangle className="size-5" />
          ) : (
            <CheckCircle2 className="size-5" />
          )}
          <div className="flex-1">
            <div className="font-semibold">
              {check.hasShort ? "Stock Shortage Detected" : "Ready to Run"}
            </div>
            {check.hasShort && (
              <div className="text-xs">
                {check.shortCount} item{check.shortCount === 1 ? "" : "s"} short ·{" "}
                {totalMissing.toLocaleString()} units needed
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border p-3 space-y-2">
          <div className="font-medium text-sm">Job details</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
            <Detail label="Job number" value={job.id} />
            <Detail label="Product" value={`${job.product} ${job.bottleSize}`} />
            <Detail label="Planned quantity" value={`${job.quantity.toLocaleString()} bottles`} />
            <Detail label="Scheduled run" value={fmtDate(job.scheduledStart)} />
            <Detail label="Filling line" value={job.line} />
            <Detail label="Status" value={<Badge variant="outline">{job.status}</Badge>} />
          </div>
        </div>

        <JobStockCheck job={job} />
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
