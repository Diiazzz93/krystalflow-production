import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { CalendarView } from "@/components/calendar/CalendarView";
import { JobDialog } from "@/components/jobs/JobDialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/calendar")({
  component: CalendarPage,
});

function CalendarPage() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [defaultStart, setDefaultStart] = useState<string | undefined>();
  const [defaultLine, setDefaultLine] = useState<string | undefined>();

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Production calendar</h1>
            <p className="text-sm text-muted-foreground">
              Visualise line capacity across day, week, and month.
            </p>
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setDefaultStart(undefined);
              setDefaultLine(undefined);
              setOpen(true);
            }}
          >
            <Plus className="size-4 mr-1" /> New job
          </Button>
        </div>
        <CalendarView
          onSelectJob={(id) => {
            setEditing(id);
            setDefaultStart(undefined);
            setDefaultLine(undefined);
            setOpen(true);
          }}
          onCreate={(start, line) => {
            setEditing(null);
            setDefaultStart(start);
            setDefaultLine(line);
            setOpen(true);
          }}
        />
      </div>
      <JobDialog
        jobId={editing}
        open={open}
        onOpenChange={setOpen}
        defaultStart={defaultStart}
        defaultLine={defaultLine}
      />
    </AppShell>
  );
}
