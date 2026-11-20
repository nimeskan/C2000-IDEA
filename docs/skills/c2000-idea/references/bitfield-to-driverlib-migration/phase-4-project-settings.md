# Phase 4 — Project settings

Set the SysConfig clocks and remove device support from the target project, so the converted files
build against driverlib and the generated `syscfg/device.h` only. Stop and ask the user if any MCP call
fails or returns something you cannot interpret.

## 4.1 SysConfig clocks

Open the target's `.syscfg` (`openFile`). Set the clock tree to the Phase 3 clocks: oscillator, PLL and
the peripheral clock dividers. Change values only with `changeConfiguration`, using the `choices` from
`getInstanceConfiguration`. Check every frequency with `traceClockSignal`; each must match Phase 3.

`getErrorsAndWarnings` must report no error. `save`, then `closeFile`.

## 4.2 Remove the device support files

Delete every Device support file of Phase 2, step 2.1 from the target project. For a linked file, delete
its `<link>` from `.project` instead. A modified copy is deleted too: the source project keeps it, and
Phase 5 ports its body.

Keep `<device>_codestartbranch.asm`: it is the program entry point. Keep the project's own linker
command files.

## 4.3 Remove the device support paths

In every `<cconfiguration>` of the target's `.cproject`, delete:

- the include paths into `device_support/<device>/common/include` and `headers/include`. They are often
  macros such as `${C2000WARE_COMMON_INCLUDE}` or `${INSTALLROOT_<DEVICE>}/common/include`;
- the `<device>_Headers_nonBIOS.cmd` library and the `headers/cmd` search path in the linker options.

Delete the `<listOptionValue value="..."/>` lines. Without this the SDK's `device.h` is included, not the
generated `syscfg/device.h`.

Poll `getToolFlags(project, "compiler")` and `getToolFlags(project, "linker")` until those paths are
gone. Change nothing else in the project before they are: CCS would overwrite the edit.

## 4.4 Build

Delete the active configuration's `*.obj`, `*.d` and `*.out` files, then `buildProject`. The User files
still use device support, so compile errors in them are expected. Errors in the generated SysConfig
files are not: fix them before Phase 5.

Record the clocks with their `traceClockSignal` values, the deleted files and the removed paths in the
log, set Phase 4 to COMPLETE and return to `bitfield-to-driverlib-migration.md`.
