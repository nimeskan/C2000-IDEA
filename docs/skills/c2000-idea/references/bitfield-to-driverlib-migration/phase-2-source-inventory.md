# Phase 2 — Source inventory

List everything in the project that touches the hardware. The tables you build here are the checklist
for Phases 3, 5 and 7: a register access missing from them is not converted.

Run the report on the target project's files; they are still identical to the source. Never edit the
source project.

## 2.1 Classify the files

List the files of the active build configuration from the project folder and from the `<link>` entries
in its `.project`. Skip the build configuration folders. Put each file in one class:

| Class | How to recognize it |
|---|---|
| Device support | Same name (case can differ) as a file in `<c2000ware_path>/device_support/<device>/common/source`, `common/include`, `headers/source`, `headers/include` or `headers/cmd`. |
| Linker | `*.cmd` that is not device support. |
| CLA | `*.cla`. |
| User | Everything else. |

`<device>` is the device family in lower case. For each device support file, record whether the project
copies or links it, and whether a copy differs from the SDK file: a modified copy holds user changes,
and Phase 5 ports its body.

## 2.2 Build the register table

For each User and CLA file:

1. Call `get_bitfield_to_driverlib_migration_report(filePath, device)` with the file's absolute path.
   Each issue is one access, with a fix type: `write`, `read`, `access` or `whole`.
2. The report lists only accesses that start with `XxxRegs.`. Search the file for `Regs`, `.bit.`,
   `.all` and `->`, and read the code around every hit. Add what the report misses, with fix type
   `manual`:
   - accesses through a pointer to a register struct (`p->CMPA.bit.CMPA`, `&EPwm1Regs`);
   - every access in a `.cla` file;
   - macros from device support headers that access registers (for example in `*_cla_defines.h`);
   - `PieVectTable` assignments;
   - CPU registers and intrinsics: `IER`, `IFR`, `EINT`, `DINT`, `ERTM`, `EALLOW`, `EDIS`, `DELAY_US`.

Write one row per access to the log:

```
## Phase 2 — Register table
| # | File | Line | Access | R/W | Fix type |
|---|---|---|---|---|---|
```

## 2.3 Calls into device support code

List every call from a User or CLA file into a device support function (`InitSysCtrl`, `InitPieCtrl`,
`InitPieVectTable`, `InitGpio`, `GPIO_SetupPinMux`, `InitEPwm1Gpio`, `DMAInitialize`, `SetVREF`, and so
on). Read its body in the source project's copy (or the SDK file the project links) and record what it
does, including the functions it calls:

```
## Phase 2 — Device support calls
| Call | File:line | Body source | What it does (registers and values) |
|---|---|---|---|
```

Also list the device support names the User files use that are not calls: header includes, type names
(`Uint16`, `int32`, `float32`, `bool_t`) and macros.

## 2.4 Checkpoint

Tell the user:

- the number of User and CLA files, register accesses (from the report and `manual`) and device support
  calls;
- the modified device support files.

Set Phase 2 to COMPLETE and return to `bitfield-to-driverlib-migration.md`.
