// Cumulative percentage breakpoints for the PDF export's own quality-step retries (see
// QUALITY_STEPS in albumExportJobs.ts — up to 5 full re-render passes at descending JPEG quality
// until the file fits under its target size). Each attempt's own processedCount/totalCount used to
// be shown directly, which meant the visible percentage restarted at 0% every time a retry began a
// fresh pass — confusing, and not what a single "0.00% to 100%" export should look like. This maps
// each attempt's own progress into a fixed band instead, so the displayed number only ever climbs
// forward across the WHOLE export regardless of how many passes it actually takes, and only ever
// reaches 100% on genuine completion. Shared between GalleryManageView.tsx's own export flow and
// AlbumQuickAccessButton.tsx's quick-export shortcut — both poll the same job shape.
const PDF_QUALITY_STEP_BREAKPOINTS = [0, 60, 80, 90, 95, 100];

export function pdfBandedPct(qualityStepIndex: number, processedCount: number, totalCount: number): number {
  const i = Math.min(qualityStepIndex, PDF_QUALITY_STEP_BREAKPOINTS.length - 2);
  const bandStart = PDF_QUALITY_STEP_BREAKPOINTS[i];
  const bandEnd = PDF_QUALITY_STEP_BREAKPOINTS[i + 1];
  const withinBand = totalCount > 0 ? processedCount / totalCount : 0;
  return bandStart + (bandEnd - bandStart) * withinBand;
}
