import { Button } from "@/components/ui/button";
import { FileDown, Printer } from "lucide-react";
import { toast } from "sonner";
import type { Job } from "@/lib/types";
import { downloadJobPdf, printJobPdf } from "@/lib/job-pdf";
import { useLineSetups } from "@/lib/line-setups";
import { useStockStore } from "@/lib/stock-store";

interface Props {
  job: Job;
  variant?: "ghost" | "secondary" | "outline";
  size?: "sm" | "default";
  className?: string;
  /** Hide labels (icon-only) — useful in tight rows */
  iconOnly?: boolean;
}

/**
 * Reusable Print + Download Job Sheet PDF actions.
 * Pulls line setup presets + stock from their stores so the PDF has
 * full stock requirements / line setup values automatically.
 */
export function JobSheetActions({
  job,
  variant = "ghost",
  size = "sm",
  className,
  iconOnly = false,
}: Props) {
  const { presets } = useLineSetups();
  const { items } = useStockStore();

  const handlePrint = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      printJobPdf(job, presets, items);
    } catch (err) {
      console.error(err);
      toast.error("Could not open print dialog");
    }
  };

  const handleDownload = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      downloadJobPdf(job, presets, items);
      toast.success(`Job sheet downloaded for ${job.id.slice(0, 8)}`);
    } catch (err) {
      console.error(err);
      toast.error("Could not generate PDF");
    }
  };

  return (
    <div className={`flex items-center gap-1 ${className ?? ""}`}>
      <Button
        size={size}
        variant={variant}
        onClick={handlePrint}
        title="Print job sheet"
      >
        <Printer className="size-4" />
        {!iconOnly && <span className="ml-1">Print</span>}
      </Button>
      <Button
        size={size}
        variant={variant}
        onClick={handleDownload}
        title="Download job sheet PDF"
      >
        <FileDown className="size-4" />
        {!iconOnly && <span className="ml-1">PDF</span>}
      </Button>
    </div>
  );
}
