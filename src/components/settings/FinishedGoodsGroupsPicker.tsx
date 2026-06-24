// Settings UI: pick which Unleashed Product Groups represent finished /
// made-to-order goods. Items in these groups will be routed out of the
// "low / out of stock" alerts and shown in a separate "Made to order"
// section across the app.

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Factory, RefreshCw, Search } from "lucide-react";
import { createUnleashedClient } from "@/lib/unleashed/client";
import type { UnleashedProductGroup } from "@/lib/unleashed/types";
import {
  setFinishedGoodsGroups,
  useFinishedGoodsGroups,
} from "@/lib/finished-goods";
import { toast } from "sonner";

export function FinishedGoodsGroupsPicker({ canEdit }: { canEdit: boolean }) {
  const selected = useFinishedGoodsGroups();
  const [groups, setGroups] = useState<UnleashedProductGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    try {
      const client = createUnleashedClient();
      const list = await client.fetchProductGroups();
      list.sort((a, b) => a.GroupName.localeCompare(b.GroupName));
      setGroups(list);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not load Unleashed product groups",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const selectedSet = useMemo(
    () => new Set(selected.map((g) => g.trim())),
    [selected],
  );

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return groups;
    return groups.filter((g) => g.GroupName.toLowerCase().includes(t));
  }, [groups, q]);

  // Also surface any saved group that's no longer returned by Unleashed,
  // so it can still be unchecked.
  const orphans = useMemo(
    () =>
      selected.filter(
        (name) => !groups.some((g) => g.GroupName.trim() === name.trim()),
      ),
    [selected, groups],
  );

  async function toggle(name: string, on: boolean) {
    const next = new Set(selectedSet);
    if (on) next.add(name);
    else next.delete(name);
    try {
      await setFinishedGoodsGroups(Array.from(next));
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not save finished-goods groups",
      );
    }
  }

  return (
    <div className="rounded-md border border-border bg-card/50 p-3 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Factory className="size-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium">Made-to-order product groups</div>
            <p className="text-xs text-muted-foreground">
              Items in these Unleashed Product Groups are produced on demand. They
              won't trigger out-of-stock alerts — they'll show in a separate
              "Made to order" section instead.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-normal">
            {selected.length} selected
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search product groups"
          className="pl-8 h-9"
        />
      </div>

      <div className="max-h-56 overflow-auto rounded-md border border-border/60 divide-y divide-border/60">
        {filtered.length === 0 && !loading && (
          <div className="p-3 text-xs text-muted-foreground text-center">
            {groups.length === 0
              ? "No product groups loaded yet."
              : "No groups match your search."}
          </div>
        )}
        {filtered.map((g) => {
          const name = g.GroupName.trim();
          const checked = selectedSet.has(name);
          return (
            <label
              key={g.Guid ?? name}
              className="flex items-center gap-2.5 px-2.5 py-1.5 text-sm cursor-pointer hover:bg-muted/30"
            >
              <Checkbox
                checked={checked}
                disabled={!canEdit}
                onCheckedChange={(v) => void toggle(name, Boolean(v))}
              />
              <span className="truncate">{g.GroupName}</span>
            </label>
          );
        })}
        {orphans.map((name) => (
          <label
            key={`orphan-${name}`}
            className="flex items-center gap-2.5 px-2.5 py-1.5 text-sm cursor-pointer hover:bg-muted/30"
          >
            <Checkbox
              checked
              disabled={!canEdit}
              onCheckedChange={(v) => void toggle(name, Boolean(v))}
            />
            <span className="truncate text-muted-foreground italic">
              {name} <span className="text-[10px]">(no longer in Unleashed)</span>
            </span>
          </label>
        ))}
      </div>

      {!canEdit && (
        <p className="text-[11px] text-muted-foreground">
          Read-only — only Admins and Managers can change this.
        </p>
      )}
    </div>
  );
}
