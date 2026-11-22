# Phase 8 — Report

Write the final report to the log under `## Phase 8 — Report` and show it to the user:

1. **Projects:** source project, target project, device, SysConfig package, C2000Ware version.
2. **Files:** each converted file, with the number of rows converted with driverlib and with `HWREG`.
3. **Device support:** each call and what replaced it; each body ported as a `static` function; the
   deleted files, including modified copies.
4. **Clocks:** the SysConfig clock tree values, and that `Device_init()` sets them.
5. **Differences:** the Phase 3 approved differences.
6. **Verification:** the Phase 7 result per class, the timing and pin comparison, and the reviewer's
   findings.
7. **To check on hardware:** clocks and oscillator, ADC trims and references, and every Defect fixed in
   Phase 7.
8. **Builds:** the configurations built and the configurations not built.
9. **Sub-agents run:** one converter per file (name each file), the four analyzers (timing and pinout, on
   the source and the target) and the reviewer.

If the list in item 9 is missing a sub-agent, go back and run it. Do not set Phase 8 to COMPLETE without it.

Set Phase 8 to COMPLETE. The migration is complete.
