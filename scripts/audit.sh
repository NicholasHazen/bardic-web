#!/bin/sh
# W6 audit: build the e2e client into dist-audit, then run the accessibility scan and the performance run, one worker each,
# one after the other (the performance numbers are meaningless if anything else is running).
#   sh scripts/audit.sh            both
#   sh scripts/audit.sh a11y       only the accessibility scan (about 10 to 20 minutes)
#   sh scripts/audit.sh perf       only the 500-book performance run (about 3 minutes)
set -e
cd "$(dirname "$0")/.."
VITE_E2E=1 BARDIC_DIST=dist-audit npx vite build --outDir dist-audit --emptyOutDir
what="${1:-all}"
status=0
if [ "$what" = all ] || [ "$what" = a11y ]; then
  BARDIC_DIST=dist-audit npx playwright test --config=playwright.audit.config.ts e2e/a11y.spec.ts --output=/tmp/pw-audit || status=1
fi
if [ "$what" = all ] || [ "$what" = perf ]; then
  BARDIC_DIST=dist-audit npx playwright test --config=playwright.audit.config.ts e2e/perf.spec.ts --output=/tmp/pw-audit || status=1
fi
echo "reports: design/a11y-report.json design/perf-report.json"
exit $status
