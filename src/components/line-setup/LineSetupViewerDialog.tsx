import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star } from "lucide-react";
import type { LineSetupPreset } from "@/lib/line-setups";
import { useLineSetups } from "@/lib/line-setups";

interface Props {
  preset: LineSetupPreset | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** If set, shows an "Apply / Mark used" CTA in the footer. */
  onApply?: (preset: LineSetupPreset) => void;
}

export function LineSetupViewerDialog({ preset, open, onOpenChange, onApply }: Props) {
  const { toggleFavourite, markUsed } = useLineSetups();

  if (!preset) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>No saved setup</DialogTitle>
            <DialogDescription>
              There is no saved line setup that matches this product and bottle size yet.
              Create one from the Line Setup page to speed up future changeovers.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const groups: Array<{ title: string; rows: Array<[string, string]> }> = [
    {
      title: "Fill",
      rows: [
        ["Fill volume", `${preset.fillVolumeMl} ml`],
        ["Nozzle height", `${preset.fillNozzleHeightMm} mm`],
        ["Fill speed", `${preset.fillSpeedPct}%`],
      ],
    },
    {
      title: "Conveyor",
      rows: [
        ["Speed", `${preset.conveyorSpeedHz} Hz`],
        ["Tension", `${preset.conveyorTensionPct}%`],
      ],
    },
    {
      title: "Capper",
      rows: [
        ["Torque", `${preset.capperTorqueNm} Nm`],
        ["Head height", `${preset.capperHeadHeightMm} mm`],
      ],
    },
    {
      title: "Label",
      rows: [
        ["Offset", `${preset.labelOffsetMm} mm`],
        ["Temperature", `${preset.labelTempC}°C`],
      ],
    },
    {
      title: "Delays",
      rows: [
        ["Start delay", `${preset.startDelayMs} ms`],
        ["Stop delay", `${preset.stopDelayMs} ms`],
      ],
    },
    {
      title: "Sensors",
      rows: [
        ["Fill position", `${preset.sensorFillPositionMm} mm`],
        ["Cap position", `${preset.sensorCapPositionMm} mm`],
        ["Label position", `${preset.sensorLabelPositionMm} mm`],
      ],
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap text-xl">
            {preset.product}
            <Badge variant="secondary">{preset.bottleSize}</Badge>
            <Badge variant="outline">Line {preset.line.replace(/^L/, "")}</Badge>
            {preset.favourite && (
              <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30">
                <Star className="size-3 mr-1 fill-current" /> Favourite
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {preset.successfulRuns} successful run{preset.successfulRuns === 1 ? "" : "s"}
            {preset.lastUsedAt && ` · Last used ${new Date(preset.lastUsedAt).toLocaleDateString()}`}
            {preset.createdBy && ` · Saved by ${preset.createdBy}`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {groups.map((g) => (
            <div
              key={g.title}
              className="rounded-lg border border-border bg-muted/30 p-4"
            >
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                {g.title}
              </div>
              <dl className="space-y-1.5">
                {g.rows.map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-2">
                    <dt className="text-sm text-muted-foreground">{k}</dt>
                    <dd className="text-base font-semibold tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>

        {preset.notes && (
          <div className="rounded-lg border border-border p-3 text-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Notes</div>
            {preset.notes}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => toggleFavourite(preset.id)}
            className="mr-auto"
          >
            <Star className={`size-4 ${preset.favourite ? "fill-amber-400 text-amber-400" : ""}`} />
            {preset.favourite ? "Unfavourite" : "Favourite"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {onApply && (
            <Button
              onClick={() => {
                markUsed(preset.id);
                onApply(preset);
                onOpenChange(false);
              }}
            >
              Mark as used
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
