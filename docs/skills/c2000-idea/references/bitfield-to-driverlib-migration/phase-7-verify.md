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
| Defect | Anything else, including a field the target writes and the source did not, an `HWREG` write to a register a driverlib function also writes, and an `HWREG` write to a protected register without `EALLOW`/`EDIS`. |

```
## Phase 7 — Comparison
| Row # | Register | Source fields and values | Target fields and values | Class |
|---|---|---|---|---|
```

Fix each Defect following `phase-5-convert-rules.md`, rebuild (Phase 6) and compare the row again.

## 7.3 Timing and pins

Do not read `references/timing-analyzer.md` or `references/pinout-analyzer.md` yourself, and do not decide
that an analyzer does not apply: the analyzer decides. Call the Agent tool four times, one after the other,
once per briefing below. Each is its own sub-agent; never merge two into one. Wait for each result before
the next.

```
Follow <skill dir>/references/timing-analyzer.md on the project <source project name>.
Its "Running as a sub-agent" section applies. Project directory: <source project dir>.
Device family: <family>. Write only the report file the analyzer defines, into the project directory.
Return the result block the analyzer defines.
```

```
Same briefing, for the target project <target project name>, directory <target project dir>.
```

```
Follow <skill dir>/references/pinout-analyzer.md on the project <source project name>.
Its "Running as a sub-agent" section applies. Project directory: <source project dir>.
Device family: <family>. Expected package: <Phase 1 package>. Write only the report file the analyzer
defines, into the project directory. Return the result block the analyzer defines.
```

```
Same briefing, for the target project <target project name>, directory <target project dir>.
```

Do not replace them with your own or the reviewer's comparison. Compare the source and target results:
every result must be identical. Each difference is a Defect. Record the four results in the log under
`## Phase 7 — Analyzers`.

## 7.4 Leftovers

Search the target project for:

- bitfield access: `Regs.`, `.bit.`, `.all`, `PieVectTable`;
- device support headers, function names, macros and type names;
- `<link>` entries to SDK files in `.project`, and device support paths in `.cproject`.

Each hit is a Defect.

## 7.5 Review

Call the Agent tool once with this briefing:

```
Review the conversion from bitfield style to driverlib style of <target project dir>.
Source project (read only): <source project dir>. Log: <target project dir>/c2000-bitfield-to-driverlib.md.
Compare each target function with the source function it came from, using the TRM (TI ASM MCP) and the
driverlib bodies (IDEA MCP get_driverlib_function). Report every register field whose final value differs,
except the differences the log's "Phase 3 — Device support replacements" section approves.
Also report: every HWREG write to a register that a driverlib function also writes; every HWREG write
to a protected register without EALLOW/EDIS; every wait loop and its exit condition; every peripheral
clock the source enabled that the target does not.
Cite TRM content by title, never by section number. Edit nothing.
```

Fix what it finds as in 7.2.

## 7.6 Checkpoint

Phase 7 is COMPLETE only if the log has the four analyzer results and the reviewer's findings. If it does
not, run the missing sub-agents first.

Show the user the comparison summary (count per class), the timing and pin results and the reviewer's
findings with their fixes. Record them in the log, set Phase 7 to COMPLETE and return to
`bitfield-to-driverlib-migration.md`.

The next phase is Phase 8 (`phase-8-report.md`). The migration is not finished until it is COMPLETE.
