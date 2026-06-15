import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/AppShell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { completeAssembly } from "@/lib/unleashed/fill-ready.functions";

export const Route = createFileRoute("/assembly-approvals")({
  component: AssemblyApprovalsPage,
});

interface PendingJob {
  id: string;
  customer: string;
  product: string;
  sku: string;
  status: string;
  unleashed_sales_order_number: string | null;
  unleashed_assembly_id: string | null;
  unleashed_assembly_number: string | null;
  updated_at: string;
  data: any;
}

function AssemblyApprovalsPage() {
  const { user, hasRole } = useAuth();
  const completeFn = useServerFn(completeAssembly);
  const [rows, setRows] = useState<PendingJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canApprove = hasRole("admin", "manager");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("production_jobs")
      .select(
        "id, customer, product, sku, status, unleashed_sales_order_number, unleashed_assembly_id, unleashed_assembly_number, updated_at, data",
      )
      .eq("status", "Pending Assembly Approval")
      .order("updated_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((data ?? []) as unknown as PendingJob[]);
  }

  useEffect(() => {
    load();
  }, []);

  async function approve(job: PendingJob) {
    if (!confirm(`Complete Assembly ${job.unleashed_assembly_number ?? ""} in Unleashed?`)) return;
    setBusyId(job.id);
    try {
      await completeFn({ data: { jobId: job.id } });
      toast.success(`Assembly ${job.unleashed_assembly_number ?? ""} completed`);
      setRows((r) => r.filter((x) => x.id !== job.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to complete assembly");
    } finally {
      setBusyId(null);
    }
  }

  if (!user) return <AppShell><div>Sign in required.</div></AppShell>;

  return (
    <AppShell>
      <div className="space-y-6 max-w-6xl">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <ShieldCheck className="size-6" /> Assembly Approvals
            </h1>
            <p className="text-sm text-muted-foreground">
              Production jobs waiting for an Assembly to be completed in Unleashed.
            </p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {!canApprove && (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              You can view this list, but only administrators and managers can complete assemblies.
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Pending approvals</CardTitle>
            <CardDescription>
              {rows.length} job{rows.length === 1 ? "" : "s"} awaiting assembly completion
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {rows.length === 0 ? (
              <div className="text-sm text-muted-foreground p-6 text-center">
                Nothing pending. Jobs appear here when production sets their status to
                <Badge variant="secondary" className="mx-1">Pending Assembly Approval</Badge>.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sales Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Assembly</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-medium">
                        {job.unleashed_sales_order_number ?? "—"}
                      </TableCell>
                      <TableCell>{job.customer}</TableCell>
                      <TableCell>
                        <div className="font-medium">{job.product}</div>
                        <div className="text-xs text-muted-foreground">{job.sku}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {job.data?.quantity ?? "—"}
                      </TableCell>
                      <TableCell>
                        {job.unleashed_assembly_number ? (
                          <Badge variant="secondary">{job.unleashed_assembly_number}</Badge>
                        ) : (
                          <span className="text-xs text-red-400">Not linked</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(job.updated_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={() => approve(job)}
                          disabled={!canApprove || busyId === job.id || !job.unleashed_assembly_id}
                        >
                          <CheckCircle2 className="size-4" />
                          {busyId === job.id ? "Completing…" : "Complete Assembly"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
