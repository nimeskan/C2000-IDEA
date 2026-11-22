# Phase 5 — Convert (orchestrator)

Convert each User and CLA file in the target project with one sub-agent per file. You dispatch, check
and record; you do not read `phase-5-convert-rules.md` yourself and you do not edit the files.

## 5.1 File order

Headers first, then C files in dependency order: a file whose functions others call comes before its
callers; the file holding `main()` comes last. CLA files go after the headers they include. Write the
order to the log:

```
## Phase 5 — Files
| # | File | Status | Converted by | Register rows | Notes |
|---|---|---|---|---|---|
```

Status is PENDING, DONE or BLOCKED. **Converted by** is the sub-agent's name or id. A file with no
sub-agent in this column is not DONE, even if it has no register access: the sub-agent decides that.

## 5.2 Dispatch

For each file in order, call the Agent tool with this briefing as its prompt:

```
Convert <target project dir>/<file> from bitfield style to driverlib style. Device: <device>.
Read <skill dir>/references/bitfield-to-driverlib-migration/phase-5-convert-rules.md and follow it.
Log: <target project dir>/c2000-bitfield-to-driverlib.md. Your inputs are its sections
"Phase 2 — Register table" and "Phase 2 — Device support calls" (rows of this file), and all
"Phase 3" sections.
Source project: <source project dir> (read only; it holds the device support bodies).
C2000Ware: <c2000ware_path>. Use the IDEA MCP for the bitfield report and driverlib functions, and the
TI ASM MCP for the TRM.
Edit only this file. Return the report the rules describe.
```

Run one sub-agent at a time: a later file can depend on what an earlier one changed.

## 5.3 Check each result

When a sub-agent returns:

1. Every register-table row and every device support call of the file is in its report, as converted.
   A missing row means the file is not done: send the sub-agent back.
   Every driverlib function the file now calls is in the report's "Functions read" list, and every
   `HWREG` row has its "Searched" entry. Search the file for `HWREG` and list every driverlib call (names like `Module_function`) to check. Anything
   missing goes back to the sub-agent.
2. Run `get_bitfield_to_driverlib_migration_report` on the file. Only issues on commented-out lines may
   remain. Any other issue goes back to the sub-agent.
3. Search the file for what must be gone: `Regs.`, `.bit.`, `.all`, `PieVectTable`, device support
   header names, function names, macros and type names from Phase 2. Any hit goes back to the sub-agent.
4. Append the sub-agent's report to the log under `## Phase 5 — <file>`, and set the file's row to DONE.

If a sub-agent reports a row it cannot convert without a decision from the user, set the file to
BLOCKED, ask the user and dispatch it again with the answer.

## Phase 5 complete

When every file is DONE and has a sub-agent in **Converted by**, set Phase 5 to COMPLETE and return to
`bitfield-to-driverlib-migration.md`.
