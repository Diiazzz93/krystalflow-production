import type { SpecPayload } from "@/lib/customer-specs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Beaker, Package, Layers, Image as ImageIcon } from "lucide-react";

interface Props {
  spec: SpecPayload;
  compact?: boolean;
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium break-words">{value || <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}

export function CustomerSpecsView({ spec, compact }: Props) {
  const { filling, packing, palletising, references } = spec;
  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <Card className="border-l-4 border-l-primary">
        <CardHeader className="py-3 flex flex-row items-center gap-2">
          <Beaker className="size-4 text-primary" />
          <CardTitle className="text-base">Filling instructions</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <KV label="Product type" value={filling.productType} />
          <KV label="Bottle / container" value={filling.containerType} />
          <KV label="Fill size" value={filling.fillSize} />
          <KV label="Cap type" value={filling.capType} />
          <KV label="Trigger / sprayer" value={filling.triggerSprayer} />
          <KV label="Label positioning" value={filling.labelPositioning} />
          <div className="md:col-span-3">
            <KV label="Label requirements" value={filling.labelRequirements} />
          </div>
          <div className="md:col-span-3">
            <KV label="Hazard / SDS notes" value={filling.hazardSdsNotes} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-l-4 border-l-amber-500">
        <CardHeader className="py-3 flex flex-row items-center gap-2">
          <Package className="size-4 text-amber-500" />
          <CardTitle className="text-base">Packing instructions</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <KV label="Units per carton" value={packing.unitsPerCarton} />
          <KV label="Carton type" value={packing.cartonType} />
          <KV
            label="Carton label"
            value={
              <Badge variant={packing.cartonLabelRequired ? "default" : "secondary"}>
                {packing.cartonLabelRequired ? "Required" : "Not required"}
              </Badge>
            }
          />
          <KV
            label="Trigger in carton"
            value={
              <Badge variant={packing.triggerInCarton ? "default" : "secondary"}>
                {packing.triggerInCarton ? "Yes" : "No"}
              </Badge>
            }
          />
          <div className="md:col-span-3">
            <KV label="Special packing notes" value={packing.packingNotes} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-l-4 border-l-emerald-500">
        <CardHeader className="py-3 flex flex-row items-center gap-2">
          <Layers className="size-4 text-emerald-500" />
          <CardTitle className="text-base">Palletising instructions</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <KV label="Pallet type" value={palletising.palletType} />
          <KV label="Cartons per layer" value={palletising.cartonsPerLayer} />
          <KV label="Layers high" value={palletising.layersHigh} />
          <div className="md:col-span-3">
            <KV label="Configuration notes" value={palletising.configurationNotes} />
          </div>
          <div className="md:col-span-3">
            <KV label="Wrap requirements" value={palletising.wrapRequirements} />
          </div>
          <div className="md:col-span-3">
            <KV label="Pallet label requirements" value={palletising.palletLabelRequirements} />
          </div>
          <div className="md:col-span-3">
            <KV label="Special customer requirements" value={palletising.specialRequirements} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-l-4 border-l-sky-500">
        <CardHeader className="py-3 flex flex-row items-center gap-2">
          <ImageIcon className="size-4 text-sky-500" />
          <CardTitle className="text-base">Reference photos</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <RefPhoto label="Example pallet" src={references.palletPhoto} />
          <RefPhoto label="Example carton" src={references.cartonPhoto} />
          <RefPhoto label="Label placement" src={references.labelPhoto} />
        </CardContent>
      </Card>
    </div>
  );
}

function RefPhoto({ label, src }: { label: string; src?: string }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="aspect-video rounded-md border border-dashed border-border bg-muted/30 grid place-items-center overflow-hidden">
        {src ? (
          <img src={src} alt={label} className="object-cover w-full h-full" />
        ) : (
          <span className="text-xs text-muted-foreground">No photo uploaded</span>
        )}
      </div>
    </div>
  );
}
