import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Factory, Eye } from "lucide-react";
import { useStore } from "@/lib/store";
import { useStockStore } from "@/lib/stock-store";
import type { Job } from "@/lib/types";
import { computeJobStockCheck } from "@/lib/job-stock";
import { JobStockDialog } from "@/components/jobs/JobStockDialog";
import { cn } from "@/lib/utils";

const ACTIVE_STATUSES = new Set([
  "Scheduled",
  "Setup",
  "Filling",
  "Capping",
  "Labelling",
  "Packing",
  "QC Review",
  "Delayed",
  "On Hold",
  "Requires Review",
]);

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ActiveJobsSection() {
  const { jobs } = useStore();
  const { items: stockItems } = useStockStore();
  const [selected, setSelected] = useState<Job | null>(null);

  const active = useMemo(
    () =>
      jobs
        .filter((j) => ACTIVE_STATUSES.has(j.status))
        .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart)),
    [jobs],
  );

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Factory className="size-4" />
            Active production jobs
            <Badge variant="outline" className="ml-2 font-medium">
              {active.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Planned qty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Readiness</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {active.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No active production jobs.
                    </TableCell>
                  </TableRow>
                ) : (
                  active.map((j) => {
                    const check = computeJobStockCheck(j, stockItems);
                    const tone = !check.hasSelections
                      ? {
                          row: "",
                          dot: "bg-muted-foreground",
                          text: "text-muted-foreground",
                          label: "No stock selected",
                        }
                      : check.hasShort
                      ? {
                          row: "bg-red-500/5",
                          dot: "bg-red-500",
                          text: "text-red-600 dark:text-red-400",
                          label: "Shortage",
                        }
                      : check.hasLow
                        ? {
                            row: "bg-amber-500/5",
                            dot: "bg-amber-500",
                            text: "text-amber-600 dark:text-amber-400",
                            label: "Low stock",
                          }
                        : {
                            row: "",
                            dot: "bg-emerald-500",
                            text: "text-emerald-600 dark:text-emerald-400",
                            label: "All in stock",
                          };
                    return (
                      <TableRow key={j.id} className={tone.row}>
                        <TableCell className="font-mono text-xs">{j.id}</TableCell>
                        <TableCell className="font-medium">
                          {j.product}{" "}
                          <span className="text-muted-foreground text-xs">{j.bottleSize}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {j.quantity.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{j.status}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fmtDate(j.scheduledStart)}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn("text-sm font-medium", tone.text)}
                          >
                            {check.hasSelections ? (check.ready ? "Job ready" : "Not ready") : "Not checked"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("font-medium gap-1.5", tone.text)}>
                            <span className={cn("size-1.5 rounded-full", tone.dot)} />
                            {tone.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelected(j)}
                            className="gap-1.5"
                          >
                            <Eye className="size-3.5" />
                            View Job
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <JobStockDialog
        job={selected}
        open={selected !== null}
        onOpenChange={(o) => !o && setSelected(null)}
      />
    </>
  );
}
