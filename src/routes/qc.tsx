import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { fmtDateTime } from "@/lib/utils-domain";
import { QCDialog } from "@/components/jobs/QCDialog";
import { usePersistedQcId } from "@/lib/qc-open-state";
import { CheckCircle2, ShieldAlert, XCircle, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/qc")({
  component: QCPage,
});

function QCPage() {
  const { jobs, qc } = useStore();
  const [filter, setFilter] = useState<"all" | "Pass" | "Fail">("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [productFilter, setProductFilter] = useState<string>("all");
  const [jobId, setJobId] = usePersistedQcId();
  const [prefillEntryId, setPrefillEntryId] = useState<string | null>(null);
  const [lookup, setLookup] = useState("");
  const [standaloneOpen, setStandaloneOpen] = useState(false);

  function handleLookup() {
    const q = lookup.trim().toUpperCase();
    if (!q) return;
    const match = qc.find(
      (e) => (e.palletCode ?? "").toUpperCase() === q || e.id.toUpperCase() === q,
    );
    if (!match) {
      toast.error("No pallet found", { description: `Code ${q} did not match any QC entry.` });
      return;
    }
    setPrefillEntryId(match.id);
    setJobId(match.jobId);
    toast.success(`Found pallet #${match.palletNumber}`, {
      description: `${jobs.find((j) => j.id === match.jobId)?.customer ?? ""} — opening filled form.`,
    });
  }

  const passRate = qc.length
    ? Math.round((qc.filter((q) => q.result === "Pass").length / qc.length) * 100)
    : 100;
  const failCount = qc.filter((q) => q.result === "Fail").length;
  const reviewJobs = jobs.filter((j) => j.status === "Requires Review");

  const customers = useMemo(() => {
    const set = new Set<string>();
    qc.forEach((e) => {
      const job = jobs.find((j) => j.id === e.jobId);
      if (job) set.add(job.customer);
    });
    return Array.from(set).sort();
  }, [qc, jobs]);

  const products = useMemo(() => {
    const set = new Set<string>();
    qc.forEach((e) => {
      const job = jobs.find((j) => j.id === e.jobId);
      if (job) set.add(job.product);
    });
    return Array.from(set).sort();
  }, [qc, jobs]);

  const entries = useMemo(
    () =>
      qc
        .filter((q) => filter === "all" || q.result === filter)
        .filter((q) => {
          if (customerFilter === "all") return true;
          const job = jobs.find((j) => j.id === q.jobId);
          return job?.customer === customerFilter;
        })
        .filter((q) => {
          if (productFilter === "all") return true;
          const job = jobs.find((j) => j.id === q.jobId);
          return job?.product === productFilter;
        })
        .sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        ),
    [qc, filter, customerFilter, productFilter, jobs],
  );

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Quality control</h1>
            <p className="text-sm text-muted-foreground">
              Pallet-level checks across every production run.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLookup();
            }}
            className="flex items-center gap-2"
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={lookup}
                onChange={(e) => setLookup(e.target.value)}
                placeholder="Pallet code (e.g. KS-…)"
                className="w-72 pl-8 font-mono text-xs uppercase"
              />
            </div>
            <Button type="submit" variant="outline">Look up pallet</Button>
          </form>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI label="QC checks" value={qc.length} />
          <KPI label="Pass rate" value={`${passRate}%`} tone="green" />
          <KPI label="Failures" value={failCount} tone={failCount ? "red" : "muted"} />
          <KPI label="Jobs flagged" value={reviewJobs.length} tone={reviewJobs.length ? "amber" : "muted"} />
        </div>

        {reviewJobs.length > 0 && (
          <Card className="border-red-500/40 bg-red-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-300">
                <ShieldAlert className="size-4" /> Jobs requiring review
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {reviewJobs.map((j) => (
                <button
                  key={j.id}
                  onClick={() => setJobId(j.id)}
                  className="rounded-md border border-border bg-card px-3 py-2 text-left hover:bg-accent/40"
                >
                  <div className="font-medium">{j.customer}</div>
                  <div className="text-xs text-muted-foreground">
                    {j.product} · {j.sku}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All results</SelectItem>
                <SelectItem value="Pass">Pass only</SelectItem>
                <SelectItem value="Fail">Fail only</SelectItem>
              </SelectContent>
            </Select>
            <Select value={customerFilter} onValueChange={setCustomerFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All companies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All companies</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={productFilter} onValueChange={setProductFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All products" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All products</SelectItem>
                {products.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(customerFilter !== "all" || productFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCustomerFilter("all");
                  setProductFilter("all");
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={jobId ?? ""}
              onValueChange={(v) => setJobId(v || null)}
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Choose a job…" />
              </SelectTrigger>
              <SelectContent>
                {jobs
                  .filter((j) => j.status !== "Complete")
                  .map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.customer} — {j.product}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button
              variant="default"
              onClick={() => {
                setJobId(null);
                setPrefillEntryId(null);
                setStandaloneOpen(true);
              }}
            >
              <CheckCircle2 className="size-4 mr-1" /> New QC check
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>QC timeline</CardTitle>
          </CardHeader>
          <CardContent>
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No QC entries yet.</p>
            ) : (
              <ol className="relative border-s border-border ms-3 space-y-4">
                {entries.map((e) => {
                  const job = jobs.find((j) => j.id === e.jobId);
                  return (
                    <li key={e.id} className="ms-4">
                      <span
                        className={`absolute -start-1.5 mt-1.5 size-3 rounded-full ${
                          e.result === "Pass" ? "bg-emerald-500" : "bg-red-500"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setPrefillEntryId(e.id);
                          setJobId(e.jobId);
                        }}
                        className="block w-full text-left rounded-md px-2 py-1 -mx-2 hover:bg-accent/40 focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 text-sm font-medium">
                              {e.result === "Pass" ? (
                                <CheckCircle2 className="size-4 text-emerald-500" />
                              ) : (
                                <XCircle className="size-4 text-red-500" />
                              )}
                              {job?.customer ?? e.title ?? "Standalone check"} — Pallet #{e.palletNumber}
                              {e.palletCode && (
                                <code className="text-[10px] font-mono text-muted-foreground">{e.palletCode}</code>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {job?.product} · {fmtDateTime(e.timestamp)} · {e.operatorName}
                            </p>
                          </div>
                          <Badge
                            className={
                              e.result === "Pass"
                                ? "bg-emerald-600 text-white"
                                : "bg-red-600 text-white"
                            }
                          >
                            {e.result}
                          </Badge>
                        </div>
                        {e.notes && <p className="text-xs mt-1">{e.notes}</p>}
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <QCDialog
        standalone
        open={standaloneOpen}
        onOpenChange={setStandaloneOpen}
      />

      {jobId && (
        <QCDialog
          jobId={jobId}
          open={!!jobId}
          onOpenChange={(v) => {
            if (!v) {
              setJobId(null);
              setPrefillEntryId(null);
            }
          }}
          prefillEntryId={prefillEntryId}
        />
      )}
    </AppShell>
  );
}

function KPI({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string | number;
  tone?: "muted" | "green" | "red" | "amber";
}) {
  const toneCls = {
    muted: "text-foreground",
    green: "text-emerald-600 dark:text-emerald-400",
    red: "text-red-600 dark:text-red-400",
    amber: "text-amber-600 dark:text-amber-400",
  }[tone];
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold tabular-nums ${toneCls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
