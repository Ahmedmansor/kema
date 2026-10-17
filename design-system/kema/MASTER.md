# Kema design system

## Product and source
Arabic, RTL, personal laboratory tracker. Local-first, one patient, no invented medical records or medication names. Built using the user-requested UI UX Pro Max skill (installed under `tools/skills/ui-ux-pro-max`).

Ran `--design-system` for `personal health laboratory dashboard accessible` and retried with `healthcare patient portal minimal`. Both produced presentation/marketing layout patterns, which are inappropriate for a personal dashboard. The dashboard information architecture is therefore a considered fallback, not a claimed database match. Retained the relevant healthcare calm green/cyan palette and accessibility guidance, while rejecting animation-heavy and low-contrast styling. The chart search `longitudinal laboratory trends --domain chart` matched Trend Over Time / Line Chart.

## Visual direction
Quiet, legible light surfaces, restrained green, warm amber for high values, blue for low values. White cards with thin borders, 16–18px corner radius. Outline SVG icons in one consistent family. No external scripts, font requests, analytics, medical imagery, or dependency downloads at runtime.

Arabic font: local Segoe UI, then Tahoma and Arial. The font returned by the skill does not meet the Arabic coverage requirement. Numeric values use tabular Latin digits. Semantic color tokens live in `public/styles.css`.

## Structure
Desktop: 240px right navigation, top context bar, maximum-width main area. Overview: welcome and record counts, latest results, main timeline, medication/backup side panels, recent lab dates. Mobile: four-item bottom navigation, two-column summary cards, single-column content. Breakpoints 1250, 1050, 800, 600px. Respect safe-area insets.

## Charts
Actual timestamps determine X position. One test and one unit per chart, straight connections between measured points, no fabricated intermediate measurements or zero-filled gaps. Report values are the source of reference bands; reference is labeled as the latest report's range. Individual status uses each result's own range. Clinical goals and diagnostic thresholds are not inferred. Every chart has a details panel, focusable points, period selectors, and a detailed table on the trends page. Medications use actual start/end dates and explicit test categories.

## Accessibility
Visible labels, native form controls and dialog, keyboard focus, labeled icon buttons, descriptive page titles, text plus symbol for statuses, 44px controls, reduced-motion support, accessible table alternatives. Mobile and desktop QA required. No dark mode in this version.

## Workflow improvements
Keep the four primary navigation destinations. Add a compact secondary tool row for comparison, doctor summary, documents and recoverable deletion history. A complete report is the primary add action, with single-result entry retained. Show real measurement dates directly on summary cards. Backup reminders are inline and reflect the last full download plus subsequent changes.

Bulk entry: shared report metadata, labeled rows, optional PDF, blank rows ignored, atomic validation. The skill's `bulk data entry validation --domain ux` matched Bulk Actions and Inline Validation. The comparison query returned multi-variable chart guidance; precise patient results use a raw table instead of radar charts, with neutral signed differences and explicit missing/ambiguous states.

PDF review: self-hosted PDF.js canvas viewer with page/zoom buttons next to editable results on desktop, stacked panes on mobile; no third-party requests. Full JSON exports include locally stored PDF bytes. Doctor summary is an isolated print layout with repeated table headers, one report reference per result and no navigation or app controls in the printed output.
