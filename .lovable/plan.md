## Continuous Bar with Ghosted Weekends

Replace the current split-segment calendar bars with a single continuous bar that spans weekends, but visually "ghosts" (lowers opacity on) the portion covering Saturday/Sunday. Weekend calendar cells will be blended in to look nearly like weekdays.

### Changes

**`src/components/calendar/CalendarView.tsx`**

1. **Bar rendering**: Replace the segmented `<div>` array with one continuous outer bar from `startCol` to `endCol`. Inside it, render a `flex` row of per-column inner divs. Working-day columns get `opacity-100`, weekend columns get `opacity-40`. No gaps between columns — the bar reads as one continuous shape.

2. **Text overlay**: The job label and time render in an absolutely-positioned text layer on top of the bar so it stays fully readable even over the ghosted weekend portions. Add a subtle `text-shadow` or dark text-stroke for contrast insurance.

3. **Drag handles**: Keep the resize handles at the true left/right edges of the bar (the actual start and end dates), since that's what users drag to extend.

4. **Weekend cells**: Remove or soften the diagonal stripe background and the "off" micro-label on weekend cells. Replace with a very subtle tint (e.g. `bg-muted/20`) so columns blend in with weekdays and the bar itself carries the "weekend" visual cue.

5. **Continuation arrows**: Drop the `←` / `→` arrows since the bar is now physically continuous.

### No backend changes required.

### Visual result
A single uninterrupted color bar flows across the week grid. The chunks sitting on Sat/Sun look paler/ghosted, making it obvious those days don't count, while Mon–Fri chunks stay solid and bright.