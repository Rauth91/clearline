# ClearLine consolidation — 16 destinations → 9

**Target shape**

Sections (5): Cockpit · Site Survey · System Design · Go-Live · Migration
Tools (4): Call Analysis · Readiness · Device Config · End-User Guide
Reference: folded into the command palette, no destination

**Migration Workspace does not change.** Not its route, not its structure,
not its 1,697 lines. It stays exactly where it is.

**Order matters.** `lib/referenceIndex.js` imports `YEALINK_CODES` from
`components/YealinkCodes.jsx` and `CODECS` / `DSCP` / `QOS_TIPS` /
`SIP_CODES` from `components/CodecRef.jsx`. Extract the data before you
touch the components, or search breaks mid-way.

One prompt per commit. Run the app between each.

---

## 1 — Extract the reference data

> Move the data out of two components into plain JSON modules. No UI
> changes, no behaviour changes.
>
> Create `src/data/yealinkCodes.js` exporting `YEALINK_CODES`, moved
> verbatim from `components/YealinkCodes.jsx`.
>
> Create `src/data/codecRef.js` exporting `CODECS`, `DSCP`, `QOS_TIPS`,
> and `SIP_CODES`, moved verbatim from `components/CodecRef.jsx`.
>
> Update `lib/referenceIndex.js` to import from `src/data/` instead of
> from the components. Update both components to import their own data
> back from `src/data/`.
>
> `YealinkCodes.jsx` should drop from 1,448 lines to roughly 150 — it
> becomes a renderer over the array, nothing more. If the render logic
> genuinely varies per code type, keep the variation but say which parts
> and why.
>
> Do not change a single code, caveat, or model string.
>
> Touch only these five files: `src/data/yealinkCodes.js` (new),
> `src/data/codecRef.js` (new), `lib/referenceIndex.js`,
> `components/YealinkCodes.jsx`, `components/CodecRef.jsx`. If you believe
> another file needs changing, stop and tell me instead of editing it.

Verify: every Yealink code still renders, palette search still finds them.

---

## 2 — Reference stops being a destination

> Remove `codec` and `firmware` from the `TOOLS` array and `TOOL_LABELS`
> in `App.jsx`. Remove their lazy imports and route cases.
>
> Extend `lib/referenceIndex.js` to also index the firmware table from
> `lib/firmwareTable.js`, so codec, QoS, SIP codes, and firmware are all
> searchable from `CommandPalette.jsx`.
>
> Keep `CodecRef.jsx` and `FirmwareRefs.jsx` as components — they render
> inside palette result detail views. They just stop being top-level tools.
>
> In `lib/router.js`, `#/tools/codec` and `#/tools/firmware` should open
> the command palette pre-filtered to that source rather than 404.
>
> Touch only these three files: `App.jsx`, `lib/referenceIndex.js`,
> `lib/router.js`. If you believe another file needs changing, stop and
> tell me instead of editing it.

Verify: `Cmd+K`, type "opus", get codec results. Old bookmarks still work.

---

## 3 — Runbook folds into Go-Live

> `components/Runbook.jsx` (199 lines) becomes a tab inside `GoLive.jsx`
> rather than its own section.
>
> Remove `runbook` from `SECTION_LABELS` in `App.jsx` and from the route
> parser in `lib/router.js`. Add it as a chip in Go-Live's `NavChipStrip`.
>
> `#/job/:id/runbook` redirects to `#/job/:id/golive?tab=runbook`.
>
> Do not merge the components — Runbook stays its own file, rendered by
> Go-Live.
>
> Touch only these three files: `App.jsx`, `components/GoLive.jsx`,
> `lib/router.js`. If you believe another file needs changing, stop and
> tell me instead of editing it.

Verify: existing runbook links resolve, content unchanged.

---

## 4 — Call Analysis

> Merge `CallDiagnostic.jsx` (150 lines) and `PacketCapture.jsx` (259)
> into one tool at `components/CallAnalysis.jsx`.
>
> Both answer the same question — why did this call fail — with different
> importers. The merged tool has one dropzone that accepts both NetSapiens
> CSV and `.pcap` / `.pcapng`, detects the type, and routes to the right
> parser. `lib/pcap.js`, `lib/pcapWorker.js`, and `lib/sipLadder.js` are
> untouched.
>
> After parsing, both paths converge on the same SIP ladder view. The
> existing `components/callAnalysisUi.jsx` already holds shared ladder UI
> — use it as the common surface rather than duplicating.
>
> Registry: `calldiag` and `pcap` become a single `callanalysis` entry in
> the `troubleshoot` group. Both old routes redirect to it.
>
> Touch only these three files: `components/CallAnalysis.jsx` (new),
> `App.jsx`, `lib/router.js`. If you believe another file needs changing,
> stop and tell me instead of editing it.

Verify: upload a CSV, upload a pcap. Same ladder, same detail panel.

---

## 5 — Readiness

> Merge `NetworkCheck.jsx` (328), `PortChecklist.jsx` (284), and
> `RouterAdvisor.jsx` (262) into `components/Readiness.jsx`.
>
> These answer "is this site ready." Three tabs inside one tool, via
> `NavChipStrip`: Network · Ports · Router.
>
> `lib/networkProbes.js`, `lib/networkReadiness.js`, `lib/routerAdvisor.js`,
> and `lib/routerProfiles.js` are untouched. `components/NetworkShared.jsx`
> stays as the shared surface.
>
> One thing to add rather than just merge: a single readiness verdict at
> the top — ready / blocked / unknown — derived from all three tabs. If
> that requires logic that doesn't exist yet, say so and stop rather than
> inventing thresholds.
>
> Registry: `netcheck`, `ports`, `router` → one `readiness` entry. All
> three old routes redirect.
>
> Touch only these three files: `components/Readiness.jsx` (new),
> `App.jsx`, `lib/router.js`. If you believe another file needs changing,
> stop and tell me instead of editing it.

Verify: each tab works standalone as before. Deep links land on the right tab.

---

## 6 — Device Config

> Merge `YealinkCodes.jsx` and `AlgoConfig.jsx` (327) into
> `components/DeviceConfig.jsx` — two tabs, Yealink and Algo.
>
> By this point Yealink is a thin renderer over `src/data/yealinkCodes.js`,
> so this is mostly a shell.
>
> `lib/yealinkShape.js` is untouched.
>
> Registry: `yealink` and `algo` → one `deviceconfig` entry in the
> `configure` group. Both old routes redirect.
>
> Touch only these three files: `components/DeviceConfig.jsx` (new),
> `App.jsx`, `lib/router.js`. If you believe another file needs changing,
> stop and tell me instead of editing it.

---

## 7 — Registry cleanup

> Final state of `App.jsx`:
>
> ```
> WORKSPACES: siteSurvey, systemDesign, goLive   (unchanged)
> TOOLS: callanalysis (troubleshoot)
>        readiness    (troubleshoot)
>        deviceconfig (configure)
>        quickcard    (configure)
> ```
>
> `SECTION_LABELS` loses `runbook`. `TOOL_LABELS` matches the four above.
>
> Audit `lib/router.js`: every removed route must redirect, never 404.
> The full legacy list is `calldiag`, `pcap`, `netcheck`, `ports`,
> `router`, `yealink`, `algo`, `codec`, `firmware`, and
> `#/job/:id/runbook`.
>
> Delete the lazy imports for components that are no longer routed
> directly. Do not delete the component files themselves.
>
> Do not touch `MigrationWorkspace.jsx` or its route.
>
> Touch only these two files: `App.jsx`, `lib/router.js`. If you believe
> another file needs changing, stop and tell me instead of editing it.

Verify: every old bookmark resolves. Dock shows five. Tools shows four.

---

## What did not get deleted

Nothing. Every parser, table, and profile survives:

`pcap.js` · `sipLadder.js` · `networkProbes.js` · `networkReadiness.js`
`routerAdvisor.js` · `routerProfiles.js` · `firmwareTable.js`
`yealinkShape.js` · `migrationExtensions.js` · every Yealink code

Four tools became sections inside tools that own a question. Two became
search results. One became a tab.

If dogfooding says a merge was wrong, splitting back out is a registry
entry and a route case — cheap, because none of the logic moved.
