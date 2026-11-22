# Bitfield-to-Driverlib Migration Workflow (same device)

Convert a C2000 project written in bitfield register style (`XxxRegs.REG.bit.FIELD`) to driverlib style,
on the same device. The result is a driverlib + SysConfig clone of the project; every register access
becomes a driverlib call, or an `HWREG` access when driverlib has no function, that writes the same
fields with the same values.

The device does not change, so the converted project must do exactly what the source does. Phase 7
checks that register by register. All register facts come from the TRM through `ti-asm-mcp`; all
driverlib facts come from the IDEA MCP. Never recall either from memory.

## When to use

The user has a project for a newer F28x device in bitfield style and wants it in driverlib style. Use
`device-migration.md` when the device changes, and `gen2-device-migration.md` when the source is a Gen 2
device (F2802x, F2803x, F2805x, F2806x, F2833x, F28M35x, F28M36x): Gen 2 devices have no driverlib.

Run this workflow before a device migration when the source is in bitfield style.

## Required inputs

1. **Source project** — the CCS project to convert.

The device comes from the project (Phase 0). It must have driverlib: a
`<c2000ware_path>/driverlib/<device in lower case>/` folder.

## Dependencies

**idea-mcp** (required):
- `get_projects()` — the project and its device
- `get_bitfield_to_driverlib_migration_report(filePath, sourceDevice)` — every bitfield access of a file,
  with candidate driverlib functions
- `get_driverlib_function(device, names)` — signature and body of driverlib functions

**ccs-project MCP** (required):
- `getProducts`, `getProjectDescriptors`, `getProjectProductReferences`
- `copyProject`, `buildProject`, `waitForResult`
- `getToolFlags`, `setToolFlags`, `getActiveSysConfigMCPVersion`

**ccs-sysconfig MCP** (required):
- `listFiles`, `openFile`, `closeFile`, `save`
- `getModuleInstances`, `getInstanceConfiguration`, `changeConfiguration`, `addModuleInstances`
- `getClockTreeInstances`, `traceClockSignal`, `getErrorsAndWarnings`
- `listGeneratedArtifacts`, `readGeneratedArtifact`

**ti-asm-mcp** (required): the device TRM.

**Skills:**
- `syscfg-openfile-recovery` (next to this skill) — the device part number and package table (Phase 1).
- `references/timing-analyzer.md` and `references/pinout-analyzer.md` of this skill — run on both
  projects in Phase 7.

## Migration log

The log is `c2000-bitfield-to-driverlib.md` in the **target project's directory**. Phase 1 creates it
once the target project exists; every later phase appends its section. It holds the register table, the
plan and the per-file progress, so it is the record a reviewer and a resumed session work from.

Never overwrite an earlier phase's section. The only in-place edits are the Phase Status rows and the
per-file progress rows. If your context is getting long or you lose track, re-read the log.

## Resuming a paused migration

Read `c2000-bitfield-to-driverlib.md` first. Find the last phase marked COMPLETE and, in Phase 5, the last
file marked DONE. Read only the phase file you resume and continue from there. Never repeat a step the log
records as complete.

## How to run this workflow

### Rules that are never skipped

1. **You never edit a project source file.** A sub-agent converts every file, even a project with one file
   or one register access. This keeps your context small enough for a project with many files. Use the
   Agent tool. If you have no Agent tool, stop and tell the user.
2. **Run phases 0 to 8 in order.** Read phase N only after the log shows phase N-1 COMPLETE. Do not read
   ahead, and do not stop before Phase 8 is COMPLETE.
3. **Phase 7 always starts four analyzer sub-agents and the reviewer sub-agent.** Whether an analyzer
   applies to the project is the analyzer's decision, not yours.
4. **The log is the gate.** Each phase file says what the log must show before the next phase starts. If
   it does not show it, the phase is not complete.

Read one phase file at a time, complete every step in it, then return here and read the next one. Phase 5
dispatches sub-agents; the orchestrator never reads `phase-5-convert-rules.md` itself.

0. `bitfield-to-driverlib-migration/phase-0-preflight.md` — inputs, device and MCP checks.
1. `bitfield-to-driverlib-migration/phase-1-target-project.md` — clone the project, add SysConfig and
   driverlib, create the log.
2. `bitfield-to-driverlib-migration/phase-2-source-inventory.md` — every file, register access and
   device support call of the source.
3. `bitfield-to-driverlib-migration/phase-3-plan.md` — clocks, interrupts, whole-register writes and
   device support replacements, approved by the user.
4. `bitfield-to-driverlib-migration/phase-4-project-settings.md` — SysConfig clocks; remove device
   support from the target project.
5. `bitfield-to-driverlib-migration/phase-5-convert.md` — convert every file (one sub-agent per file,
   rules in `bitfield-to-driverlib-migration/phase-5-convert-rules.md`).
6. `bitfield-to-driverlib-migration/phase-6-build.md` — clean build of every configuration.
7. `bitfield-to-driverlib-migration/phase-7-verify.md` — check the target against the source, register
   by register.
8. `bitfield-to-driverlib-migration/phase-8-report.md` — final report.

## Do / Don't

- Don't edit the source project. It is the reference.
- Don't edit anything in the SDK, and don't link SDK files into the target project. Device support files
  are removed from the target; their behavior is ported (Phase 5).
- Don't recall register, driverlib or pin facts from memory. Every one comes from the MCPs.
- Don't fetch the report's TRM links. They are for the user's browser. Read the TRM through `ti-asm-mcp`.
- Don't write TRM section numbers into the log or the code. Find TRM content by title every time.
- Do keep the source's file and function structure, so each target function can be compared with the
  source function it came from.
- Do stop and ask the user when an MCP call fails or returns something you cannot interpret.
