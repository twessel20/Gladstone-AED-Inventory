# Isolated PDF Export Test

Stable production baseline: v96. **Do not load this branch's exporter from `index.html` or `sw.js` until validated.**

## Acceptance criteria

1. Executive Summary is page 1.
2. Group title is shown at the top (for example, Community Center AED Report).
3. Every AED selected in the generated report is represented in the PDF exactly once.
4. Each AED detail includes current component dates, quarterly inspection information, deployment information, and status / return-to-service history present in the generated report.
5. Long AED details paginate normally without clipping.
6. No blank trailing pages.
7. Letter portrait page size with mobile-independent layout.
8. Open PDF and Share PDF use the exact same PDF blob.
9. Canceling the iOS share sheet does not alter app state.
10. No global click interception, service-worker changes, or production script injection during isolated testing.

## Design direction

The production failure pattern came from mixing responsive DOM capture and global event interception into the PWA. The isolated exporter should instead receive an explicit report data snapshot and build pages from that snapshot. It should not query/rewrite the live app while generating the PDF.

The production app remains on v96 while this work is isolated on `pdf-export-isolated-test`.
