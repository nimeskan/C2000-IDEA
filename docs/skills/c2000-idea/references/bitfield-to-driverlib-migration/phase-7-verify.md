# Phase 7 — Verify

Check that the target does exactly what the source does. The device is the same, so every register
field must end with the same value, except the differences approved in Phase 3.

## 7.1 Report

Run `get_bitfield_to_driverlib_migration_report` on every converted file. Only issues on commented-out
lines may remain.

## 7.2 Compare register settings

For every row of each file's Phase 5 report, work out what the target code writes: read the body of each
driverlib call with `get_driverlib_function` and follow it to the register and field writes. For `HWREG`
accesses, use the macros' values. Compare each with the source access, field by field:

| Class | Meaning |
|---|---|
| Same | Same register, fields and values. |
| Planned | A difference listed and approved in Phase 3, step 3.4. |
| Defect | Anything else, including a field the target writes and the source did not. |

```
## Phase 7 — Comparison
| Row # | Register | Source fields and values | Target fields and values | Class |
|---|---|---|---|---|
```

Fix each Defect following `phase-5-convert-rules.md`, rebuild (Phase 6) and compare the row again.

## 7.3 Timing and pins

Read `references/timing-analyzer.md` and `references/pinout-analyzer.md` of this skill and run both
workflows, in full, on the source project and on the target project. Do not replace them with your own
or the reviewer's comparison. Every result must be identical. Each difference is a Defect.

## 7.4 Leftovers

Search the target project for:

- bitfield access: `Regs.`, `.bit.`, `.all`, `PieVectTable`;
- device support headers, function names, macros and type names;
- `<link>` entries to SDK files in `.project`, and device support paths in `.cproject`.

Each hit is a Defect.

## 7.5 Review

Start a reviewer sub-agent with the source project directory, the target project directory and the log.
Ask it to compare each target function with the source function it came from, using the TRM and the
driverlib bodies, and to report every register field whose final value differs, except the Phase 3
approved differences. Ask it to cite TRM content by title, never by section number. Fix what it finds as
in 7.2.

## 7.6 Checkpoint

Show the user the comparison summary (count per class), the timing and pin results and the reviewer's
findings with their fixes. Record them in the log, set Phase 7 to COMPLETE and return to
`bitfield-to-driverlib-migration.md`.
