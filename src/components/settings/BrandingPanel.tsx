import { useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, RotateCcw, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { useBranding, fileToDataUrl, type Branding } from "@/lib/branding";

export function BrandingPanel() {
  const { branding, update, reset } = useBranding();

  async function pick(field: keyof Branding, file?: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image too large (max 2MB)");
      return;
    }
    try {
      const url = await fileToDataUrl(file);
      update({ [field]: url } as Partial<Branding>);
      toast.success("Logo uploaded");
    } catch {
      toast.error("Failed to read image");
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Branding</CardTitle>
          <CardDescription>
            Customise the app for your business. Used on login, sidebar, dashboard, and all
            generated PDFs/reports. Stored locally for now — ready to move to cloud storage.
          </CardDescription>
        </div>
        <Button variant="outline" onClick={() => { reset(); toast.success("Branding reset"); }}>
          <RotateCcw className="size-4" /> Reset
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Company name">
            <Input
              value={branding.companyName}
              onChange={(e) => update({ companyName: e.target.value })}
              placeholder="Your company"
            />
          </Field>
          <Field label="App display name">
            <Input
              value={branding.appName}
              onChange={(e) => update({ appName: e.target.value })}
              placeholder="e.g. KrystalFlow"
            />
          </Field>
          <Field label="Primary brand colour">
            <ColorInput
              value={branding.primaryColor}
              onChange={(v) => update({ primaryColor: v })}
            />
          </Field>
          <Field label="Secondary brand colour">
            <ColorInput
              value={branding.secondaryColor}
              onChange={(v) => update({ secondaryColor: v })}
            />
          </Field>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <LogoUpload
            label="Sidebar/header logo"
            value={branding.sidebarLogo}
            onPick={(f) => pick("sidebarLogo", f)}
            onClear={() => update({ sidebarLogo: null })}
          />
          <LogoUpload
            label="Login screen logo"
            value={branding.loginLogo}
            onPick={(f) => pick("loginLogo", f)}
            onClear={() => update({ loginLogo: null })}
          />
          <LogoUpload
            label="PDF/report header logo"
            value={branding.pdfLogo}
            onPick={(f) => pick("pdfLogo", f)}
            onClear={() => update({ pdfLogo: null })}
          />
        </div>

        <div className="rounded-md border border-border p-4 bg-card/50 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Preview
          </div>
          <div
            className="flex items-center gap-3 rounded-md p-3"
            style={{ background: branding.primaryColor }}
          >
            {branding.sidebarLogo ? (
              <img
                src={branding.sidebarLogo}
                alt=""
                className="size-10 rounded-md bg-white/10 object-contain p-1"
              />
            ) : (
              <div
                className="size-10 rounded-md grid place-items-center font-bold text-white"
                style={{ background: branding.secondaryColor }}
              >
                {branding.companyName.slice(0, 1).toUpperCase() || "K"}
              </div>
            )}
            <div className="text-white">
              <div className="font-semibold leading-tight">{branding.companyName}</div>
              <div className="text-xs opacity-80">{branding.appName}</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-12 rounded-md border border-input bg-background cursor-pointer"
        aria-label="Pick colour"
      />
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" />
    </div>
  );
}

function LogoUpload({
  label,
  value,
  onPick,
  onClear,
}: {
  label: string;
  value: string | null;
  onPick: (f: File | null) => void;
  onClear: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="rounded-md border border-dashed border-border bg-card/40 p-3 flex flex-col items-center justify-center gap-2 min-h-[140px]">
        {value ? (
          <img src={value} alt="" className="max-h-20 object-contain" />
        ) : (
          <div className="text-muted-foreground flex flex-col items-center gap-1 text-xs">
            <ImageIcon className="size-6" />
            No logo uploaded
          </div>
        )}
        <input
          ref={ref}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => ref.current?.click()}>
            <Upload className="size-4" /> {value ? "Replace" : "Upload"}
          </Button>
          {value && (
            <Button size="sm" variant="ghost" onClick={onClear}>
              Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
