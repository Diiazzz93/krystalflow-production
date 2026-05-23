import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import type { Line } from "@/lib/types";

function emptyLine(): Line {
  return { id: `L${Date.now().toString(36)}`, name: "", capacityBph: 1000 };
}

export function LinesPanel() {
  const { lines, addLine, updateLine, deleteLine, jobs } = useStore();
  const [editing, setEditing] = useState<Line | null>(null);
  const [isNew, setIsNew] = useState(false);

  function startNew() {
    setEditing(emptyLine());
    setIsNew(true);
  }

  function startEdit(l: Line) {
    setEditing({ ...l });
    setIsNew(false);
  }

  function save() {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast.error("Line name is required");
      return;
    }
    if (!editing.capacityBph || editing.capacityBph <= 0) {
      toast.error("Capacity must be greater than 0");
      return;
    }
    if (isNew) {
      addLine(editing);
      toast.success(`Added "${editing.name}"`);
    } else {
      updateLine(editing.id, editing);
      toast.success(`Updated "${editing.name}"`);
    }
    setEditing(null);
  }

  function remove(line: Line) {
    const used = jobs.some((j) => j.line === line.id);
    if (used) {
      toast.error(`Cannot delete "${line.name}" — it is assigned to existing jobs.`);
      return;
    }
    if (!confirm(`Delete line "${line.name}"?`)) return;
    deleteLine(line.id);
    toast.success("Line deleted");
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Filling lines</CardTitle>
          <CardDescription>
            Add, edit or remove the production lines available for scheduling.
          </CardDescription>
        </div>
        <Button onClick={startNew}>
          <Plus className="size-4" /> New line
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {lines.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No lines yet. Click <strong>New line</strong> to add one.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lines.map((l) => (
              <div key={l.id} className="rounded-md border border-border p-3 space-y-1 bg-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{l.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {l.capacityBph.toLocaleString()} bottles/hour · {l.id}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" onClick={() => startEdit(l)} aria-label="Edit">
                      <Pencil className="size-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(l)} aria-label="Delete">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {editing && (
          <div className="rounded-md border border-border p-4 space-y-4 bg-muted/30">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">{isNew ? "Add line" : `Edit ${editing.name || "line"}`}</h4>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
                  <X className="size-4" /> Cancel
                </Button>
                <Button size="sm" onClick={save}>
                  <Save className="size-4" /> Save
                </Button>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Line ID</Label>
                <Input
                  value={editing.id}
                  disabled={!isNew}
                  onChange={(e) => setEditing({ ...editing, id: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-xs text-muted-foreground">Name</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Line 4 — Specialty"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Capacity (bottles/hour)</Label>
                <Input
                  type="number"
                  value={editing.capacityBph}
                  onChange={(e) =>
                    setEditing({ ...editing, capacityBph: Number(e.target.value) || 0 })
                  }
                />
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
