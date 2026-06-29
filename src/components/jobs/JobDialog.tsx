import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import {
  ALL_STATUSES,
  PRIORITIES,
  STATUS_COLORS,
  completedPallets,
  completedQuantity,
  estimatedFinish,
  fmtDateTime,
  originalPallets,
  originalQuantity,
  progressPalletPct,

  remainingPallets,
  remainingQuantity,
  runtimeMinutes,
  uid,

} from "@/lib/utils-domain";
import type { Job, ReadyState } from "@/lib/types";
import { Progress } from "@/components/ui/progress";
import { JobStockCheck } from "@/components/jobs/JobStockCheck";
import { computeJobStockCheck } from "@/lib/job-stock";

import { SlidersHorizontal, CalendarOff } from "lucide-react";
import { toast } from "sonner";
import { findSetupForJob, useLineSetups } from "@/lib/line-setups";
import { LineSetupViewerDialog } from "@/components/line-setup/LineSetupViewerDialog";
import { StockCombobox } from "@/components/jobs/StockCombobox";
import { useStockStore } from "@/lib/stock-store";
import { resolveCategory, type StockCategory, type StockItem } from "@/lib/stock";
import { JobSheetActions } from "@/components/jobs/JobSheetActions";

function parseBottleSize(name: string, fallback: string): string {
  const m = name.match(/(\d+(?:\.\d+)?)\s*(ml|L|l)\b/);
  if (!m) return fallback;
  return `${m[1]}${m[2].toLowerCase() === "l" ? "L" : "ml"}`;
}

function parseBottlesPerCarton(name: string, fallback: number | undefined): number | undefined {
  const m = name.match(/(\d+)\s*[xX×]\s*\d/);
  return m ? Number(m[1]) : fallback;
}

/**
 * Decide whether the source Sales Order is denominated in cartons or bottles.
 * Looks at the product code/name for boxed-fill markers like "6XBOTTLEFILL",
 * "CARTONFILL", "12X1L" etc. Falls back to bottlesPerCarton / cartonsOrdered.
 */
function isCartonOrder(job: Pick<Job, "product" | "sku" | "cartonsOrdered" | "bottlesPerCarton">): boolean {
  const text = `${job.product ?? ""} ${job.sku ?? ""}`.toUpperCase();
  if (/\d+X[A-Z]*BOTTLEFILL/.test(text)) return true;
  if (/CARTONFILL/.test(text)) return true;
  if (/\b\d+\s*[X×]\s*\d/.test(text)) return true;
  if ((job.cartonsOrdered ?? 0) > 0) return true;
  if ((job.bottlesPerCarton ?? 1) > 1) return true;
  return false;
}

function byCategory(items: StockItem[], cat: StockCategory) {
  return items.filter((i) => resolveCategory(i) === cat);
}

function stockLabel(item: StockItem) {
  return `${item.availableStock.toLocaleString()} ${item.unit} avail`;
}

const READY_STATES: ReadyState[] = ["Pending", "Ready", "Issue"];
const COLORS = ["#0ea5e9", "#22c55e", "#f97316", "#a855f7", "#ec4899", "#14b8a6", "#eab308"];

function emptyJob(): Job {
  return {
    id: uid(),
    customer: "",
    product: "",
    sku: "",
    bottleSize: "",
    quantity: 0,
    pallets: 1,
    dueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    priority: "Normal",
    line: "L1",
    operator: "",
    bottlesPerHour: 3000,
    setupMinutes: 30,
    notes: "",
    rawMaterial: "Pending",
    labels: "Pending",
    packaging: "Pending",
    status: "Scheduled",
    bottlesCompleted: 0,
    palletsCompleted: 0,
    downtimeMinutes: 0,
    actualRuntimeMinutes: 0,
    customerColor: COLORS[0],
    createdAt: new Date().toISOString(),
  };
}

function toLocalInput(iso: string | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  jobId?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultStart?: string;
  defaultLine?: string;
}

export function JobDialog({ jobId, open, onOpenChange, defaultStart, defaultLine }: Props) {
  const { jobs, lines, addJob, updateJob, completeJob, deleteJob } = useStore();
  const { can } = useAuth();
  const canDelete = can("jobs:delete");
  const canEdit = can("jobs:create") || can("jobs:edit");
  const canComplete = can("jobs:update-progress") || can("jobs:edit");
  const existing = useMemo(() => jobs.find((j) => j.id === jobId) ?? null, [jobs, jobId]);
  const [form, setForm] = useState<Job>(() => existing ?? emptyJob());
  const { presets } = useLineSetups();
  const [setupOpen, setSetupOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [confirmComplete, setConfirmComplete] = useState(false);
  const matchedSetup = useMemo(
    () => findSetupForJob(presets, form.product, form.bottleSize),
    [presets, form.product, form.bottleSize],
  );

  const { items: stockItems } = useStockStore();
  const bottleStock = useMemo(() => byCategory(stockItems, "Bottles"), [stockItems]);
  const capStock = useMemo(() => byCategory(stockItems, "Caps"), [stockItems]);
  const labelStock = useMemo(() => byCategory(stockItems, "Labels"), [stockItems]);
  const cartonStock = useMemo(() => byCategory(stockItems, "Cartons"), [stockItems]);
  const liquidStock = useMemo(() => byCategory(stockItems, "Liquid / IBC"), [stockItems]);

  useEffect(() => {
    if (open) {
      const base = existing ?? emptyJob();
      setForm({
        ...base,
        scheduledStart: defaultStart ?? base.scheduledStart,
        line: defaultLine ?? base.line,
      });
    }
  }, [open, existing, defaultStart, defaultLine]);

  const isEdit = !!existing;
  const set = <K extends keyof Job>(k: K, v: Job[K]) => setForm((f) => ({ ...f, [k]: v }));

  const finishEta = estimatedFinish(form);
  const runtime = runtimeMinutes(form);

  function save() {
    if (!form.customer || !form.product) return;
    if (isEdit) updateJob(form.id, form);
    else addJob(form);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {isEdit ? "Edit Production Job" : "New Production Job"}
            {isEdit && (
              <Badge className={STATUS_COLORS[form.status]}>{form.status}</Badge>
            )}
            {(() => {
              const c = computeJobStockCheck(form, stockItems);

              if (!c.hasSelections) return null;

              if (c.hasShort)
                return (
                  <Badge variant="outline" className="border-red-500/40 text-red-600 dark:text-red-400">
                    Stock short
                  </Badge>
                );
              if (c.hasLow)
                return (
                  <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
                    Stock low
                  </Badge>
                );
              return (
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
                  Job ready
                </Badge>
              );
            })()}
          </DialogTitle>
          <DialogDescription>
            Configure the run, line, and readiness checks for this filling job.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Customer">
            <Input value={form.customer} onChange={(e) => set("customer", e.target.value)} />
          </Field>
          <Field label="Product">
            <Input value={form.product} onChange={(e) => set("product", e.target.value)} />
          </Field>
          <Field label="Bottle">
            <StockCombobox
              items={bottleStock}
              value={form.bottleSku}
              placeholder="Search bottles…"
              emptyText="No bottles in stock"
              onSelect={(opt) =>
                setForm((f) => ({
                  ...f,
                  bottleSku: opt.sku,
                  sku: opt.sku,
                  bottleSize: parseBottleSize(opt.name, f.bottleSize),
                }))
              }
            />
          </Field>
          <Field label="Cap">
            <StockCombobox
              items={capStock}
              value={form.capSku}
              placeholder="Search caps…"
              emptyText="No caps in stock"
              onSelect={(opt) => set("capSku", opt.sku)}
            />
          </Field>
          <Field label="Label">
            <StockCombobox
              items={labelStock}
              value={form.labelSku}
              placeholder="Search labels…"
              emptyText="No labels in stock"
              onSelect={(opt) => set("labelSku", opt.sku)}
            />
          </Field>
          <Field label="Carton">
            <StockCombobox
              items={cartonStock}
              value={form.cartonSku}
              placeholder="Search cartons…"
              emptyText="No cartons in stock"
              onSelect={(opt) =>
                setForm((f) => ({
                  ...f,
                  cartonSku: opt.sku,
                  bottlesPerCarton: parseBottlesPerCarton(opt.name, f.bottlesPerCarton),
                }))
              }
            />
          </Field>


          <Field label="Liquid / Product to Fill">
            <StockCombobox
              items={liquidStock}
              value={form.liquidSku}
              placeholder="Search liquid / IBC…"
              emptyText="No liquid stock items"
              onSelect={(opt) => set("liquidSku", opt.sku)}
            />
          </Field>

          {(() => {
            const cartonMode = isCartonOrder(form);
            const bpc = form.bottlesPerCarton && form.bottlesPerCarton > 0 ? form.bottlesPerCarton : 1;
            const cartons =
              form.cartonsOrdered ??
              (cartonMode && bpc > 1 ? Math.round((form.quantity || 0) / bpc) : 0);
            return (
              <>
                <Field
                  label={`Quantity (cartons)${cartonMode ? " — primary" : ""}`}
                >
                  <Input
                    type="number"
                    value={cartons || ""}
                    placeholder={cartonMode ? "e.g. 135" : "optional"}
                    onChange={(e) => {
                      const c = Number(e.target.value) || 0;
                      setForm((f) => {
                        const per = f.bottlesPerCarton && f.bottlesPerCarton > 0 ? f.bottlesPerCarton : 1;
                        return {
                          ...f,
                          cartonsOrdered: c || undefined,
                          quantity: c * per,
                        };
                      });
                    }}
                  />
                </Field>
                <Field label={`Quantity (bottles)${!cartonMode ? " — primary" : ""}`}>
                  <Input
                    type="number"
                    value={form.quantity}
                    onChange={(e) => {
                      const b = Number(e.target.value) || 0;
                      setForm((f) => {
                        const per = f.bottlesPerCarton && f.bottlesPerCarton > 0 ? f.bottlesPerCarton : 1;
                        return {
                          ...f,
                          quantity: b,
                          cartonsOrdered: per > 1 ? Math.round(b / per) : f.cartonsOrdered,
                        };
                      });
                    }}
                  />
                </Field>
              </>
            );
          })()}
          <Field label="Bottle size (e.g. 500ml, 1L)">
            <Input
              value={form.bottleSize}
              onChange={(e) => set("bottleSize", e.target.value)}
            />
          </Field>
          <Field label="Bottles per carton">
            <Input
              type="number"
              value={form.bottlesPerCarton ?? ""}
              placeholder="12"
              onChange={(e) =>
                set(
                  "bottlesPerCarton",
                  e.target.value ? Number(e.target.value) : undefined,
                )
              }
            />
          </Field>
          <Field label="Pallets">
            <Input
              type="number"
              value={form.pallets}
              onChange={(e) => set("pallets", Number(e.target.value))}
            />
          </Field>
          <Field label="Due date">
            <Input
              type="date"
              value={form.dueDate.slice(0, 10)}
              onChange={(e) => set("dueDate", e.target.value)}
            />
          </Field>
          <Field label="Priority">
            <Select value={form.priority} onValueChange={(v) => set("priority", v as Job["priority"]) }>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Production line">
            <Select value={form.line} onValueChange={(v) => set("line", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {lines.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Operator">
            <Input value={form.operator} onChange={(e) => set("operator", e.target.value)} />
          </Field>
          <Field label="Bottles / hour">
            <Input
              type="number"
              value={form.bottlesPerHour}
              onChange={(e) => set("bottlesPerHour", Number(e.target.value))}
            />
          </Field>
          <Field label="Setup / changeover (min)">
            <Input
              type="number"
              value={form.setupMinutes}
              onChange={(e) => set("setupMinutes", Number(e.target.value))}
            />
          </Field>
          <Field label="Scheduled start">
            <Input
              type="datetime-local"
              value={toLocalInput(form.scheduledStart)}
              onChange={(e) => set("scheduledStart", new Date(e.target.value).toISOString())}
            />
          </Field>
          <Field label="Scheduled end (optional)">
            <Input
              type="datetime-local"
              value={form.scheduledEnd ? toLocalInput(form.scheduledEnd) : ""}
              onChange={(e) =>
                set(
                  "scheduledEnd",
                  e.target.value ? new Date(e.target.value).toISOString() : undefined,
                )
              }
            />
          </Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={(v) => set("status", v as Job["status"]) }>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Raw material">
            <ReadySel value={form.rawMaterial} onChange={(v) => set("rawMaterial", v)} />
          </Field>
          <Field label="Labels">
            <ReadySel value={form.labels} onChange={(v) => set("labels", v)} />
          </Field>
          <Field label="Packaging">
            <ReadySel value={form.packaging} onChange={(v) => set("packaging", v)} />
          </Field>
          <Field label="Customer colour">
            <div className="flex flex-wrap gap-2 pt-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set("customerColor", c)}
                  className={`size-6 rounded-full border-2 ${form.customerColor === c ? "border-foreground" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </Field>
          <Field label="Calendar label (optional)">
            <Input
              value={form.calendarLabel ?? ""}
              placeholder={form.product}
              onChange={(e) => set("calendarLabel", e.target.value || undefined)}
            />
          </Field>
        </div>

        <JobStockCheck job={form} />

        <Field label="Notes">
          <Textarea
            rows={2}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </Field>

        {isEdit && (
          <div className="rounded-lg border border-border p-3 bg-muted/30 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Production progress</span>
              <span className="text-muted-foreground tabular-nums">
                {progressPalletPct(form)}% complete
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs">
              <ProgressStat
                label="Original order"
                primary={`${originalQuantity(form).toLocaleString()} units`}
                secondary={`${originalPallets(form)} pallets`}
              />
              <ProgressStat
                label="Completed"
                tone="emerald"
                primary={`${completedQuantity(form).toLocaleString()} units`}
                secondary={`${completedPallets(form)} pallets`}
              />
              <ProgressStat
                label="Remaining"
                tone="amber"
                primary={`${remainingQuantity(form).toLocaleString()} units`}
                secondary={`${remainingPallets(form)} pallets`}
              />
            </div>

            <Progress value={progressPalletPct(form)} />

            <div className="grid grid-cols-3 gap-3 pt-1">
              <Field label="Bottles done">
                <Input
                  type="number"
                  value={form.bottlesCompleted}
                  onChange={(e) => set("bottlesCompleted", Number(e.target.value))}
                />
              </Field>
              <Field label="Pallets done">
                <Input
                  type="number"
                  value={form.palletsCompleted}
                  onChange={(e) => set("palletsCompleted", Number(e.target.value))}
                />
              </Field>
              <Field label="Downtime (min)">
                <Input
                  type="number"
                  value={form.downtimeMinutes}
                  onChange={(e) => set("downtimeMinutes", Number(e.target.value))}
                />
              </Field>
            </div>
            <p className="text-[11px] text-muted-foreground">
              KrystalFlow tracks progress against the original Sales Order without modifying it in Unleashed. Approved QC pallets create their own Assembly.
            </p>
          </div>
        )}


        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
            <span>Est. runtime: <span className="font-medium text-foreground">{Math.floor(runtime / 60)}h {runtime % 60}m</span></span>
            <span>Est. finish: <span className="font-medium text-foreground">{fmtDateTime(finishEta)}</span></span>
          </div>
          <Button variant="outline" size="sm" onClick={() => setSetupOpen(true)}>
            <SlidersHorizontal className="size-4" />
            View Line Setup
            {matchedSetup && (
              <Badge variant="secondary" className="ml-1">match</Badge>
            )}
          </Button>
        </div>

        <LineSetupViewerDialog
          preset={matchedSetup}
          open={setupOpen}
          onOpenChange={setSetupOpen}
        />

        <DialogFooter className="gap-2 sm:gap-2">
          {isEdit && canDelete && (
            <Button
              variant="destructive"
              onClick={() => {
                setDeleteText("");
                setConfirmDelete(true);
              }}
              className="mr-auto"
            >
              Delete
            </Button>
          )}
          {isEdit && (
            <JobSheetActions job={form} variant="outline" />
          )}
          {isEdit && canEdit && form.scheduledStart && (
            <Button
              variant="outline"
              onClick={() => {
                const prevStart = form.scheduledStart;
                const prevEnd = form.scheduledEnd;
                updateJob(form.id, { scheduledStart: undefined, scheduledEnd: undefined });
                toast.success("Job unscheduled", {
                  description: `${form.customer} — ${form.product}`,
                  action: {
                    label: "Undo",
                    onClick: () =>
                      updateJob(form.id, { scheduledStart: prevStart, scheduledEnd: prevEnd }),
                  },
                });
                onOpenChange(false);
              }}
            >
              <CalendarOff className="size-4 mr-1" />
              Remove from calendar
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {canEdit ? "Cancel" : "Close"}
          </Button>
          {canEdit && (
            <Button onClick={save}>{isEdit ? "Save changes" : "Create job"}</Button>
          )}
        </DialogFooter>
      </DialogContent>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this job?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes <strong>{form.product || "this job"}</strong>
              {form.customer ? ` for ${form.customer}` : ""}. This cannot be undone —
              the job will be removed from the calendar and database.
              <br />
              <br />
              Type <strong>DELETE</strong> below to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={deleteText}
            onChange={(e) => setDeleteText(e.target.value)}
            placeholder="Type DELETE to confirm"
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteText.trim() !== "DELETE"}
              onClick={() => {
                deleteJob(form.id);
                setConfirmDelete(false);
                onOpenChange(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ReadySel({ value, onChange }: { value: ReadyState; onChange: (v: ReadyState) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as ReadyState)}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        {READY_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function ProgressStat({
  label,
  primary,
  secondary,
  tone,
}: {
  label: string;
  primary: string;
  secondary: string;
  tone?: "emerald" | "amber";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "amber"
        ? "text-amber-700 dark:text-amber-300"
        : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-background/60 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${toneClass}`}>{primary}</div>
      <div className="text-[11px] text-muted-foreground tabular-nums">{secondary}</div>
    </div>
  );
}

