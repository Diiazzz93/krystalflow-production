import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useStore } from "@/lib/store";
import type { Job } from "@/lib/types";
import { STATUS_DOT, fmtTime, jobEnd } from "@/lib/utils-domain";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type View = "month" | "week" | "day";

interface Props {
  onSelectJob: (id: string) => void;
  onCreate: (start: string, line?: string) => void;
}

export function CalendarView({ onSelectJob, onCreate }: Props) {
  const { jobs, lines, updateJob } = useStore();
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));

  const range = useMemo(() => buildRange(cursor, view), [cursor, view]);

  function shift(dir: 1 | -1) {
    const d = new Date(cursor);
    if (view === "month") d.setMonth(d.getMonth() + dir);
    else if (view === "week") d.setDate(d.getDate() + 7 * dir);
    else d.setDate(d.getDate() + dir);
    setCursor(startOfDay(d));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shift(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(startOfDay(new Date()))}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={() => shift(1)}>
            <ChevronRight className="size-4" />
          </Button>
          <h2 className="ml-2 text-lg font-semibold">{rangeLabel(cursor, view)}</h2>
        </div>
        <div className="inline-flex rounded-md border border-border bg-card p-0.5">
          {(["day", "week", "month"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "px-3 py-1.5 text-sm rounded capitalize transition-colors",
                view === v
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === "month" ? (
        <MonthGrid days={range} jobs={jobs} onCreate={onCreate} onSelectJob={onSelectJob} onUpdateJob={updateJob} />
      ) : (
        <LineSchedule
          days={range}
          jobs={jobs}
          lines={lines}
          onCreate={onCreate}
          onSelectJob={onSelectJob}
        />
      )}
    </div>
  );
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function buildRange(cursor: Date, view: View) {
  if (view === "day") return [new Date(cursor)];
  if (view === "week") {
    const start = new Date(cursor);
    start.setDate(start.getDate() - start.getDay()); // Sunday start
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }
  // month
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function rangeLabel(cursor: Date, view: View) {
  if (view === "day")
    return cursor.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  if (view === "month")
    return cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const start = new Date(cursor);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function MonthGrid({
  days,
  jobs,
  onCreate,
  onSelectJob,
  onUpdateJob,
}: {
  days: Date[];
  jobs: Job[];
  onCreate: (s: string) => void;
  onSelectJob: (id: string) => void;
  onUpdateJob: (id: string, patch: Partial<Job>) => void;
}) {
  const month = days[15].getMonth();
  const today = new Date();
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const dragRef = useRef<{
    mode: "move" | "resize-end" | "resize-start";
    jobId: string;
    origIdx: number;
    origStart: Date;
    origEnd: Date;
    moved: boolean;
    currentIdx: number;
  } | null>(null);
  const [dragState, setDragState] = useState<{
    id: string;
    delta: number;
    mode: "move" | "resize-end" | "resize-start";
  } | null>(null);

  function cellIdxAt(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const cell = (el as HTMLElement).closest("[data-day-idx]") as HTMLElement | null;
    if (!cell) return null;
    const v = cell.getAttribute("data-day-idx");
    return v ? Number(v) : null;
  }

  function startDrag(
    e: React.PointerEvent,
    job: Job,
    mode: "move" | "resize-end" | "resize-start",
    barStartIdx: number,
    barEndIdx: number,
  ) {
    e.stopPropagation();
    e.preventDefault();
    const origIdx = mode === "resize-end" ? barEndIdx : barStartIdx;
    dragRef.current = {
      mode,
      jobId: job.id,
      origIdx,
      origStart: new Date(job.scheduledStart),
      origEnd: jobEnd(job),
      moved: false,
      currentIdx: origIdx,
    };

    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const idx = cellIdxAt(ev.clientX, ev.clientY);
      if (idx == null) return;
      if (idx !== d.origIdx) d.moved = true;
      d.currentIdx = idx;
      setDragState({ id: d.jobId, delta: idx - d.origIdx, mode: d.mode });
    };
    const onUp = () => {
      const d = dragRef.current;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (!d) return;
      const days = d.currentIdx - d.origIdx;
      if (d.moved && days !== 0) {
        if (d.mode === "move") {
          const ns = new Date(d.origStart); ns.setDate(ns.getDate() + days);
          const ne = new Date(d.origEnd); ne.setDate(ne.getDate() + days);
          onUpdateJob(d.jobId, { scheduledStart: ns.toISOString(), scheduledEnd: ne.toISOString() });
        } else if (d.mode === "resize-end") {
          const ne = new Date(d.origEnd); ne.setDate(ne.getDate() + days);
          if (ne > d.origStart) {
            onUpdateJob(d.jobId, { scheduledEnd: ne.toISOString() });
          }
        } else {
          const ns = new Date(d.origStart); ns.setDate(ns.getDate() + days);
          if (ns < d.origEnd) {
            onUpdateJob(d.jobId, { scheduledStart: ns.toISOString() });
          }
        }
      }
      dragRef.current = null;
      setDragState(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="grid grid-cols-7 text-xs font-medium border-b border-border bg-muted/40">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-2 py-2 text-muted-foreground">{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => {
        const weekStart = new Date(week[0]); weekStart.setHours(0,0,0,0);
        const weekEnd = new Date(week[6]); weekEnd.setHours(23,59,59,999);

        const weekJobs = jobs
          .filter((j) => {
            const s = new Date(j.scheduledStart);
            const e = jobEnd(j);
            return s <= weekEnd && e >= weekStart;
          })
          .map((j) => {
            const s = new Date(j.scheduledStart);
            const e = jobEnd(j);
            const startCol = s < weekStart ? 0 : s.getDay();
            const endCol = e > weekEnd ? 6 : e.getDay();
            const span = endCol - startCol + 1;
            return {
              job: j,
              startCol,
              span,
              continuesBefore: s < weekStart,
              continuesAfter: e > weekEnd,
              absStartIdx: wi * 7 + (s < weekStart ? 0 : s.getDay()),
              absEndIdx: wi * 7 + (e > weekEnd ? 6 : e.getDay()),
            };
          })
          .sort((a, b) => b.span - a.span);

        const rows: { startCol: number; endCol: number }[][] = [];
        const placed = weekJobs.map((wj) => {
          let rowIdx = 0;
          while (true) {
            const row = rows[rowIdx] ?? [];
            const conflict = row.some(
              (r) => !(wj.startCol + wj.span - 1 < r.startCol || wj.startCol > r.endCol),
            );
            if (!conflict) {
              row.push({ startCol: wj.startCol, endCol: wj.startCol + wj.span - 1 });
              rows[rowIdx] = row;
              return { ...wj, row: rowIdx };
            }
            rowIdx++;
          }
        });

        const BAR_H = 20;
        const BAR_GAP = 2;
        const barsHeight = rows.length * (BAR_H + BAR_GAP);

        return (
          <div
            key={wi}
            className="relative grid grid-cols-7 border-b border-border last:border-b-0"
          >
            {week.map((d, di) => {
              const out = d.getMonth() !== month;
              const isToday = sameDay(d, today);
              const absIdx = wi * 7 + di;
              return (
                <div
                  key={di}
                  data-day-idx={absIdx}
                  onDoubleClick={() => {
                    const s = new Date(d);
                    s.setHours(8, 0, 0, 0);
                    onCreate(s.toISOString());
                  }}
                  className={cn(
                    "min-h-28 border-r border-border last:border-r-0 p-1.5 flex flex-col gap-1 cursor-pointer hover:bg-accent/30 transition-colors",
                    out && "bg-muted/20 text-muted-foreground",
                    dragState && "hover:bg-primary/10",
                  )}
                >
                  <div
                    className={cn(
                      "text-xs font-medium",
                      isToday &&
                        "inline-flex items-center justify-center size-6 rounded-full bg-primary text-primary-foreground self-start",
                    )}
                  >
                    {d.getDate()}
                  </div>
                  <div style={{ height: barsHeight }} />
                </div>
              );
            })}
            <div className="pointer-events-none absolute inset-x-0" style={{ top: 28 }}>
              {placed.map(({ job, startCol, span, row, continuesBefore, continuesAfter, absStartIdx, absEndIdx }) => {
                const isDragging = dragState?.id === job.id;
                return (
                  <div
                    key={job.id + "-" + wi}
                    className="pointer-events-auto absolute group"
                    style={{
                      top: row * (BAR_H + BAR_GAP),
                      height: BAR_H,
                      left: `calc(${(startCol / 7) * 100}% + 4px)`,
                      width: `calc(${(span / 7) * 100}% - 8px)`,
                    }}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onPointerDown={(e) => startDrag(e, job, "move", absStartIdx, absEndIdx)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!dragRef.current?.moved) onSelectJob(job.id);
                      }}
                      className={cn(
                        "h-full w-full text-left text-[11px] truncate rounded px-1.5 py-0.5 text-white font-medium shadow-sm cursor-grab active:cursor-grabbing select-none touch-none",
                        isDragging && "ring-2 ring-ring opacity-70",
                      )}
                      style={{ backgroundColor: job.customerColor }}
                      title={`${job.customer} — ${job.product} (drag to move, drag right edge to extend)`}
                    >
                      {continuesBefore && "← "}
                      {fmtTime(job.scheduledStart)} {job.customer}
                      {continuesAfter && " →"}
                    </div>
                    {!continuesAfter && (
                      <div
                        onPointerDown={(e) => startDrag(e, job, "resize", absStartIdx, absEndIdx)}
                        className="absolute top-0 right-0 h-full w-2 cursor-ew-resize bg-black/20 opacity-0 group-hover:opacity-100 rounded-r touch-none"
                        title="Drag to extend"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {dragState && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 -translate-x-1/2 bg-foreground text-background text-xs px-3 py-1.5 rounded-full shadow-lg z-50">
          {dragState.mode === "move" ? "Move" : "Extend"} by {dragState.delta > 0 ? "+" : ""}{dragState.delta} day{Math.abs(dragState.delta) === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}

const HOUR_PX = 36;
const START_HOUR = 6;
const END_HOUR = 22;
const TOTAL_HOURS = END_HOUR - START_HOUR;

function LineSchedule({
  days,
  jobs,
  lines,
  onCreate,
  onSelectJob,
}: {
  days: Date[];
  jobs: Job[];
  lines: { id: string; name: string }[];
  onCreate: (s: string, line?: string) => void;
  onSelectJob: (id: string) => void;
}) {
  const today = new Date();
  return (
    <div className="space-y-6">
      {days.map((d) => (
        <div key={d.toISOString()} className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 py-2 border-b border-border bg-muted/40 flex items-center gap-2">
            <span
              className={cn(
                "text-sm font-semibold",
                sameDay(d, today) && "text-primary",
              )}
            >
              {d.toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>
            {sameDay(d, today) && (
              <span className="text-xs bg-primary text-primary-foreground rounded px-1.5 py-0.5">
                Today
              </span>
            )}
          </div>
          <div className="grid" style={{ gridTemplateColumns: `64px repeat(${lines.length}, minmax(0, 1fr))` }}>
            <div className="border-r border-border">
              <div className="h-8 border-b border-border" />
              {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                <div
                  key={i}
                  style={{ height: HOUR_PX }}
                  className="text-[10px] text-muted-foreground px-1.5 border-b border-border"
                >
                  {String(START_HOUR + i).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {lines.map((line) => {
              const dayStart = new Date(d); dayStart.setHours(0,0,0,0);
              const dayEnd = new Date(d); dayEnd.setHours(23,59,59,999);
              const lineJobs = jobs.filter((j) => {
                if (j.line !== line.id) return false;
                const s = new Date(j.scheduledStart);
                const e = jobEnd(j);
                return s <= dayEnd && e >= dayStart;
              });
              return (
                <div key={line.id} className="border-r border-border relative">
                  <div className="h-8 border-b border-border px-2 flex items-center text-xs font-medium truncate">
                    {line.name}
                  </div>
                  <div
                    className="relative"
                    style={{ height: TOTAL_HOURS * HOUR_PX }}
                    onDoubleClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const y = e.clientY - rect.top;
                      const hour = START_HOUR + Math.floor(y / HOUR_PX);
                      const s = new Date(d);
                      s.setHours(hour, 0, 0, 0);
                      onCreate(s.toISOString(), line.id);
                    }}
                  >
                    {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                      <div
                        key={i}
                        style={{ top: i * HOUR_PX, height: HOUR_PX }}
                        className="absolute inset-x-0 border-b border-border/60"
                      />
                    ))}
                    {lineJobs.map((j) => {
                      const jobStart = new Date(j.scheduledStart);
                      const jobFinish = jobEnd(j);
                      // Clip to this day's visible window
                      const visibleStart = jobStart < dayStart ? dayStart : jobStart;
                      const visibleEnd = jobFinish > dayEnd ? dayEnd : jobFinish;
                      const startH = Math.max(
                        START_HOUR,
                        visibleStart.getHours() + visibleStart.getMinutes() / 60,
                      );
                      const endH = Math.min(
                        END_HOUR,
                        visibleEnd.getHours() + visibleEnd.getMinutes() / 60 +
                          (visibleEnd.getDate() !== d.getDate() ? 24 : 0),
                      );
                      const top = (startH - START_HOUR) * HOUR_PX;
                      const height = Math.max(24, (endH - startH) * HOUR_PX);
                      const continuesBefore = jobStart < dayStart;
                      const continuesAfter = jobFinish > dayEnd;
                      return (
                        <motion.button
                          key={j.id}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          onClick={(ev) => { ev.stopPropagation(); onSelectJob(j.id); }}
                          className="absolute left-1 right-1 rounded-md text-left p-1.5 text-white text-[11px] shadow-sm hover:ring-2 hover:ring-ring overflow-hidden"
                          style={{
                            top,
                            height,
                            backgroundColor: j.customerColor,
                          }}
                        >
                          <div className="flex items-center gap-1.5 font-semibold truncate">
                            <span className={cn("size-1.5 rounded-full", STATUS_DOT[j.status])} />
                            {continuesBefore && "← "}{j.customer}{continuesAfter && " →"}
                          </div>
                          <div className="truncate opacity-90">{j.product}</div>
                          <div className="opacity-75 text-[10px]">
                            {fmtTime(jobStart)} – {fmtTime(jobFinish)}
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Double-click an empty slot to schedule a new job. Click a job to edit.
      </p>
    </div>
  );
}
