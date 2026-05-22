import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Search, Star, Pencil, Eye, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLineSetups, type LineSetupPreset } from "@/lib/line-setups";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/layout/AppShell";
import { LineSetupViewerDialog } from "@/components/line-setup/LineSetupViewerDialog";
import { LineSetupEditorDialog } from "@/components/line-setup/LineSetupEditorDialog";

export const Route = createFileRoute("/line-setup")({
  head: () => ({
    meta: [
      { title: "Line Setup — Krystalshield" },
      { name: "description", content: "Saved filling line setup presets for quick changeovers." },
    ],
  }),
  component: LineSetupPage,
});

const ALL = "__all__";

function LineSetupPage() {
  const { presets, toggleFavourite } = useLineSetups();
  const { hasRole } = useAuth();
  const canManage = hasRole("admin", "manager", "operator");

  const [search, setSearch] = useState("");
  const [productFilter, setProductFilter] = useState<string>(ALL);
  const [bottleFilter, setBottleFilter] = useState<string>(ALL);
  const [favOnly, setFavOnly] = useState(false);

  const [viewerId, setViewerId] = useState<string | null>(null);
  const [editorId, setEditorId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const products = useMemo(
    () => Array.from(new Set(presets.map((p) => p.product))).sort(),
    [presets],
  );
  const bottles = useMemo(
    () => Array.from(new Set(presets.map((p) => p.bottleSize))).sort(),
    [presets],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return presets.filter((p) => {
      if (favOnly && !p.favourite) return false;
      if (productFilter !== ALL && p.product !== productFilter) return false;
      if (bottleFilter !== ALL && p.bottleSize !== bottleFilter) return false;
      if (!q) return true;
      return (
        p.product.toLowerCase().includes(q) ||
        p.bottleSize.toLowerCase().includes(q) ||
        p.line.toLowerCase().includes(q) ||
        (p.notes ?? "").toLowerCase().includes(q)
      );
    });
  }, [presets, search, productFilter, bottleFilter, favOnly]);

  const recent = useMemo(
    () =>
      [...presets]
        .filter((p) => p.lastUsedAt)
        .sort((a, b) => (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? ""))
        .slice(0, 4),
    [presets],
  );

  const viewerPreset = viewerId ? presets.find((p) => p.id === viewerId) ?? null : null;

  function openNew() {
    setEditorId(null);
    setEditorOpen(true);
  }
  function openEdit(id: string) {
    setEditorId(id);
    setEditorOpen(true);
  }

  return (
    <AppShell>
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Line Setup</h1>
          <p className="text-muted-foreground text-sm md:text-base">
            Saved filling line configurations. Recall a preset to speed up product changeovers.
          </p>
        </div>
        {canManage && (
          <Button size="lg" onClick={openNew} className="text-base">
            <Plus className="size-5" /> New setup
          </Button>
        )}
      </div>

      {recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Clock className="size-4" /> Recently used
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {recent.map((p) => (
              <RecentCard key={p.id} preset={p} onOpen={() => setViewerId(p.id)} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search product, bottle size, line, notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-11 text-base"
            />
          </div>
          <Select value={productFilter} onValueChange={setProductFilter}>
            <SelectTrigger className="h-11 w-[200px]"><SelectValue placeholder="Product" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All products</SelectItem>
              {products.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={bottleFilter} onValueChange={setBottleFilter}>
            <SelectTrigger className="h-11 w-[160px]"><SelectValue placeholder="Bottle size" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All sizes</SelectItem>
              {bottles.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant={favOnly ? "default" : "outline"}
            onClick={() => setFavOnly((v) => !v)}
            className="h-11"
          >
            <Star className={`size-4 ${favOnly ? "fill-current" : ""}`} /> Favourites
          </Button>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
            No setups match your filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((p) => (
              <PresetCard
                key={p.id}
                preset={p}
                canEdit={canManage}
                onView={() => setViewerId(p.id)}
                onEdit={() => openEdit(p.id)}
                onToggleFav={() => toggleFavourite(p.id)}
              />
            ))}
          </div>
        )}
      </section>

      <LineSetupViewerDialog
        preset={viewerPreset}
        open={!!viewerId}
        onOpenChange={(v) => !v && setViewerId(null)}
      />
      <LineSetupEditorDialog
        presetId={editorId}
        open={editorOpen}
        onOpenChange={setEditorOpen}
      />
    </div>
  );
}

function PresetCard({
  preset,
  canEdit,
  onView,
  onEdit,
  onToggleFav,
}: {
  preset: LineSetupPreset;
  canEdit: boolean;
  onView: () => void;
  onEdit: () => void;
  onToggleFav: () => void;
}) {
  return (
    <article className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3 hover:border-primary/50 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-lg leading-tight truncate">{preset.product}</h3>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <Badge variant="secondary">{preset.bottleSize}</Badge>
            <Badge variant="outline">Line {preset.line.replace(/^L/, "")}</Badge>
            <Badge variant="outline" className="text-xs">
              {preset.successfulRuns} runs
            </Badge>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleFav}
          aria-label={preset.favourite ? "Unfavourite" : "Favourite"}
        >
          <Star
            className={`size-5 ${preset.favourite ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
          />
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <Row k="Fill" v={`${preset.fillVolumeMl} ml @ ${preset.fillSpeedPct}%`} />
        <Row k="Conveyor" v={`${preset.conveyorSpeedHz} Hz`} />
        <Row k="Capper" v={`${preset.capperTorqueNm} Nm`} />
        <Row k="Label" v={`${preset.labelOffsetMm} mm / ${preset.labelTempC}°C`} />
      </dl>

      <div className="flex items-center gap-2 pt-1 mt-auto">
        <Button variant="default" className="flex-1 h-10 text-base" onClick={onView}>
          <Eye className="size-4" /> Open
        </Button>
        {canEdit && (
          <Button variant="outline" className="h-10" onClick={onEdit} aria-label="Edit">
            <Pencil className="size-4" />
          </Button>
        )}
      </div>
    </article>
  );
}

function RecentCard({ preset, onOpen }: { preset: LineSetupPreset; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="rounded-lg border border-border bg-card p-3 text-left hover:border-primary/50 transition-colors"
    >
      <div className="font-medium truncate">{preset.product}</div>
      <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-1.5">
        <span>{preset.bottleSize}</span>
        <span>·</span>
        <span>Line {preset.line.replace(/^L/, "")}</span>
        {preset.lastUsedAt && (
          <>
            <span>·</span>
            <span>{new Date(preset.lastUsedAt).toLocaleDateString()}</span>
          </>
        )}
      </div>
    </button>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium tabular-nums text-right truncate">{v}</dd>
    </>
  );
}
