# HOLIFRIDAY Refactor Plan

Safe order:

1. Move pure planning helpers to `src/lib/planning.ts`.
2. Move `PlanningSuitePanel` to `src/components/PlanningSuitePanel.tsx`.
3. Move `GanttWhatIfPanel` to `src/components/GanttWhatIfPanel.tsx`.
4. Move `TeamScheduleView` to `src/components/TeamScheduleView.tsx`.
5. Keep `App.tsx` as the coordinator only.

Do not move all components in one commit. Build after each step.
