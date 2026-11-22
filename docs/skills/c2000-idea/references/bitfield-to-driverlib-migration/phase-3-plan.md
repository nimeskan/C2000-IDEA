# Phase 3 — Plan

Decide how the target does what the source does: the clocks, the interrupts, the whole-register writes
and each device support call. Take every fact from the device TRM (`ti-asm-mcp`), driverlib
(`get_driverlib_function`) and the C2000Ware files named below. Phase 5 implements this plan.

`<driverlib>` is `<c2000ware_path>/driverlib/<device>/driverlib`.

## 3.1 Clocks

`Device_init()` sets the clocks from the SysConfig clock tree, not from the source's `InitSysCtrl`. Work
out the clocks the source runs, from the code the application executes (usually `InitSysCtrl` and the
functions it calls, in the source project's copy):

1. Oscillator source: internal oscillator, crystal or external oscillator. If the code selects an external
   clock and does not state its frequency, ask the user for it.
2. PLL multiplier and divider settings, and the resulting SYSCLK.
3. The peripheral clocks: low-speed clock (LSPCLK) and any peripheral with its own clock divider.

```
## Phase 3 — Clocks
| Clock | Set by | Setting | Frequency |
|---|---|---|---|
```

The table must have a row for the oscillator source (crystal, external clock or internal oscillator), the
PLL, SYSCLK and LSPCLK, and a list of every peripheral clock `InitSysCtrl` enables.

Phase 4 sets the SysConfig clock tree to these values.

## 3.2 Whole-register writes

A `.all` write sets every field of the register; driverlib functions usually set one. For each `whole`
row of the register table, and each `manual` row that writes a whole register, split the value into the
fields the TRM defines:

```
## Phase 3 — Whole-register writes
| # | TRM register | TRM title used | Field | Bits | Value | Meaning |
|---|---|---|---|---|---|---|
```

To find a register in the TRM:

1. `search_trm_keywords(device, "<register name>")` with only the name. Use a result titled
   "<register name> Register (Offset = …)".
2. If no result has that title, take the peripheral's chapter number from any result that mentions the
   peripheral, call `list_trm_headings(device, chapter, limit: 4)` and take the heading titled
   "<register name> Register".
3. `get_trm_section(device, sectionId)` returns the bit field table, reset values and allowed values.

If the TRM does not define a field, write `not described` in TRM title used and tell the user.

## 3.3 Interrupts

For each interrupt the application uses: the vector it assigns, its ISR, the `INT_` name in
`<driverlib>/inc/hw_ints.h` and its PIE acknowledge group.

```
## Phase 3 — Interrupts
| Source vector | ISR | INT_ | ACK group |
|---|---|---|---|
```

## 3.4 Device support replacements

For each call of Phase 2, step 2.3, choose what replaces it. Common replacements:

| Device support | Driverlib |
|---|---|
| `InitSysCtrl()` | `Device_init()`, then `Device_enableAllPeripherals()` if the source body enables every peripheral clock, or `SysCtl_enablePeripheral()` for each it enables |
| `InitGpio()` | `Device_initGPIO()` |
| `InitPieCtrl()` | `Interrupt_initModule()` (it also clears `IER` and `IFR`) |
| `InitPieVectTable()` | `Interrupt_initVectorTable()` |
| `GPIO_SetupPinMux()`, `InitEPwmNGpio()` and other pin set-up | `GPIO_setPinConfig()`, `GPIO_setPadConfig()`, `GPIO_setQualificationMode()`, `GPIO_setDirectionMode()` for the same pins and settings |
| `DMAInitialize()` | `DMA_initController()` and `DMA_setEmulationMode(DMA_EMULATION_FREE_RUN)` (the source body also sets `DEBUGCTRL.FREE`) |
| `SetVREF()`, `AdcSetMode()` | `ADC_setVREF()` or `ADC_setMode()`, whichever the device has. The source body also loads the factory ADC trims: if the driverlib body does not, add `ADC_setOffsetTrim()` for each ADC the code uses |
| `DELAY_US(x)` | `DEVICE_DELAY_US(x)`. On CPU2, `device.h` has no `DEVICE_SYSCLK_FREQ`: define it |

For every replacement, compare its body (`get_driverlib_function`; for `Device_init` and
`Device_initGPIO` read the generated `syscfg/device.c` with `readGeneratedArtifact`) with the source
body. Anything the source body does that the replacement does not, plan explicitly. A function with no
replacement is ported: Phase 5 copies its body into the calling file as a `static` function and converts
it.

```
## Phase 3 — Device support replacements
| Call | Replaced by | Also needed | Differences |
|---|---|---|---|
```

**Differences** lists what the target does that the source did not (for example clocks enabled for
peripherals the source left off). Every difference must be approved here; Phase 7 classes any other
difference as a defect.

## 3.5 Checkpoint

Show the user the clocks, the interrupts, the device support replacements and their differences. Ask
for approval or changes. Record the answer in the log, set Phase 3 to COMPLETE and return to
`bitfield-to-driverlib-migration.md`.
