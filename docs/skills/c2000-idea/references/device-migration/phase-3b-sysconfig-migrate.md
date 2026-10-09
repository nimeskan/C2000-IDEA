# Phase 3B — SysConfig Peripheral Migration and CMD Normalization

> You are executing **Phase 3B** of the SysConfig migration.
> Phase 3A is complete: the target `.syscfg` is already open, the `device_support` module
> is confirmed present.
> Your scope: migrate peripheral configuration to the target device, normalize the CMD
> module to match the source linker style.
> **Do not re-read phase-3a or any other phase file.**

**Stop and ask the user** if any MCP tool call fails, returns an unexpected error, or
produces a result you cannot interpret. Do not guess, retry blindly, or skip the step.

---

## Rules for Phase 3B

- Do keep the source project unchanged — it is the golden reference.
- Do mirror the source's linker style: a CMD module in the target syscfg if the source
  used one, a plain `.cmd` (CMD module removed) if the source used a plain file.
- Don't modify or migrate SysConfig-generated output files.
- Don't invoke SysConfig MCP regeneration until the full `.syscfg` migration is complete.

---

## Determine your path (read this first)

**Before running any step, read the Phase 3A checkpoint in `c2000-migration.md`.**
Look for the `Phase 3A: COMPLETE` entry.

If the `c2000-migration.md` checkpoint is missing or unclear, re-derive the path:
- Open the target project's `.syscfg` via `openFile`, then call `getModuleInstances`.
  Inspect the returned module list contains `device_support` or not. If it is absent notify to user, and terminate the migration mentioning the reason.
- check the status of whether source-has-syscfg (whether the source project had `.syscfg` file). If it did, then that source has been copied to the target    
  project already. If not then the universal project's syscfg file was kept.
  In the case where there was no `.syscfg` file in the source project, we just need to normalize the CMD module. Hence jump to the 3.10 step. 

---

## 3.4 Get migration targets (source-has-syscfg only)

Call `listMigrationTargets` to retrieve all candidate device + package combinations.

- **If the list is empty**, the installed SysConfig version may not support migration for
  this target — report to the user and fall back to manual SysConfig reconfiguration.

## 3.5 Filter (source-has-syscfg only)

Narrow the list to entries matching the target device family the user originally requested
for the migration.

## 3.6 Prompt the user (source-has-syscfg only)

Present the filtered device/package options and ask the user which specific device and
package to use. If no entries match the target family, stop and report to the user with
the full unfiltered list so the user can select the closest available target.

## 3.7 Migrate (source-has-syscfg only)

Call `migrate` with the `device`, `package` and `variant` of the user's selected entry. If
several entries share that device and package, use the first one's `variant`.
 > If the `migrate` tool for SysConfig MCP repeatedly fails. Pause and ask the user to manually
 > click the migrate button in the SysConfig GUI and confirm that they have clicked the migrate button 
 > and saved the file.

## 3.8 Check errors

Call `getErrorsAndWarnings`. Review all errors and warnings.

## 3.9 Fix issues iteratively

- Use `changeConfiguration` to resolve errors.
- If a module or configurable no longer exists on the target device, use
  `getModuleDescription` and `getInstanceConfiguration` to explore available options
  and find the best equivalent.
- **Only use configurable values that `getModuleDescription` lists as valid** — do not
  invent values not in the allowed set.
- **If no valid equivalent value exists for a removed configurable**, do not set a
  placeholder — remove the configurable or leave it at the module default, and record
  it as a deferred item in `c2000-migration.md` for user review.
- After each fix, re-run `getErrorsAndWarnings` to check progress.
- Iterate until all errors are resolved.
- If an issue cannot be resolved after reasonable investigation, report it to the user.
- Leave errors whose `moduleId` starts with `/driverlib/clocktree/` to Phase 3C.

> **WARNING: Peripheral module entirely absent from the target device:**
> Some errors indicate that a whole peripheral module (e.g., `EPWM`, `CMPSS`, `ADC`, `CLB` tile 
> count beyond what the target has) simply does not exist on the target device —
> `getModuleDescription` will return an error or empty result for these modules.
> When you encounter this:
> 1. Do **not** try to fix it with `changeConfiguration` — the module cannot be configured
>    on a device that lacks the peripheral.
> 2. Call `removeModuleInstances` to remove the absent module from the syscfg entirely.
> 3. Record it in `c2000-migration.md` as:
>    `FEATURE-ABSENT: <module-name> — peripheral not available on <target-device>`.
> 4. Tell the user immediately: *"Module `<module>` has been removed because this
>    peripheral does not exist on `<target-device>`. You must implement equivalent
>    functionality differently or confirm it is not needed for your application."*
> 5. Re-run `getErrorsAndWarnings` after removal to check for cascading errors.

## 3.10 Normalize the CMD module (mirror the source linker style)

Make the target syscfg's CMD module match the **source linker style** recorded in Phase 2
(step 2.5). First call `getModuleInstances` to see whether a CMD module is currently present.

- **Source used a CMD module** → the target keeps a CMD module. It should already be present
  (it came in with the copied source syscfg).

  If the CMD module is somehow absent, `addModuleInstances` to add it first.

- **Source used a plain `.cmd` file** → the target must not have a CMD module (Phase 2
  already set up the plain `.cmd`). If one is present (e.g., from the universal template),
  call `removeModuleInstances` to remove CMD module, so it does not generate a competing linker
  command file.

## Phase 3B complete — hand off to Phase 3C

Write a micro-checkpoint to `c2000-migration.md`:
```
Phase 3B: COMPLETE
  migrated to: <device / package / variant> (or: not migrated — source had no syscfg)
  errors resolved: <N>  deferred: <K>
  CMD module: kept / removed
```

**Do not call `save` or `closeFile` — the file stays open.** Read `phase-3c-clocking.md` and proceed.
