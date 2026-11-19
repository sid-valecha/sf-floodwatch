# Task 8 report

DONE. incident_key added to Grok schema/prompt; grouping in src/lib/reports/group.ts (pipeline calls mergeIncidents); Report.alsoReportedBy/relatedUrls; ReportSheet shows "+N similar posts" with links; data/curated.seed.json merged in route withNews with id+url de-dup (curated wins). Neighborhood polygons: Oak St/Panhandle points fall in "Golden Gate Park" (not Haight Ashbury/Lone Mountain), Moscone in "South of Market".

Verification: 3 node:test tests pass; npm run build passes; no-key dev curl = snapshot 16 + 5 news + 3 curated = 24, no dup ids/urls. No live xAI call made (schema field not confirmed against API).

Concerns: group.ts is a new file (needed so node --test can import without pulling extension-less imports); extraction runs in parallel batches of 5 so same-incident posts in different batches may get different keys; strict schema untested live.
