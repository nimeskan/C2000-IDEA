# Phase 5 — Convert rules (sub-agent)

You convert one file of the target project from bitfield style to driverlib style, on the same device.
The log's Phase 2 and 3 sections say what the file does and how the target does it. The converted file
must write the same fields with the same values, in the same order: the same functions, with only the
register access changed.

Take every fact from the bitfield report and `get_driverlib_function` (IDEA MCP), the device TRM (TI ASM
MCP) and the C2000Ware driverlib headers. Never recall a driverlib signature, register name or value from
memory.

`<driverlib>` is `<c2000ware_path>/driverlib/<device>/driverlib`.

## Run the report

Call `get_bitfield_to_driverlib_migration_report(filePath, device)` on your file. Each issue has:

| Part | Use |
|---|---|
| Fix type | `write` (`Regs.REG.bit.FIELD = value`), `read` (`x = Regs.REG.bit.FIELD`), `access` (in an expression), `whole` (`Regs.REG.all`) |
| Original pattern | The source line. |
| Available driverlib functions | Candidates, listed per register, not per field: pick the one for the field. |
| Function definitions | The exact `get_driverlib_function` call for the candidates. |
| Raw access | Register width and offset in the device support struct, when there is no candidate. The `hw_*.h` offset can use a different base. |
| Register Bit Details | Shift, mask and description of the field. |
| TRM Link | For the user's browser. Do not fetch it. |

## Headers and types

- Replace the device support headers (`f28x_project.h`, `<device>_device.h`, `<device>_examples.h`) with
  `#include "driverlib.h"` and `#include "device.h"`.
- Replace the device support type names with the C99 ones: `Uint16` → `uint16_t`, `int32` → `int32_t`,
  `float32` → `float32_t`, `bool_t` → `bool`, and so on.

## Device support calls

For each call the log lists for this file (Phase 2, step 2.3):

1. If Phase 3, step 3.4 names a replacement, use it, with everything in its **Also needed** column.
2. Otherwise, copy the body from the source project's copy (Phase 2 says where it is) into this file as a
   `static` function with the same name, and convert it like any other code.
3. Replace each device support macro with its driverlib equivalent, or with its expansion converted
   like any other code.

## Register accesses

For each register-table row of this file:

1. Pick the driverlib function that writes or reads the field: from the report's candidates, or from
   `<driverlib>/<module>.h`, `interrupt.h` and `sysctl.h` when the report lists none.
2. Call `get_driverlib_function` for every driverlib function you use, and read its signature and body:
   it must write exactly the fields you need, you must know what else it writes, and you must know what
   it returns (a `bool` is 0 or 1, never a mask). Never use a function you have not read. One function can
   cover several rows; use one call for them.
3. `HWREG`/`HWREGH` is the last resort. Before using it, search the driverlib headers of the module
   (`<driverlib>/<module>.h`) for a function that writes the register or field. If one exists, use it: a
   function that writes the same register is always better than a raw write. Only if none exists, use
   `HWREG`/`HWREGH` with the base address from `inc/hw_memmap.h`, the offset `<MODULE>_O_<REG>` and the
   field masks and shifts `<MODULE>_<REG>_<FIELD>_M`/`_S` from `inc/hw_<module>.h`.
4. Protected registers: the source wrapped writes to them in `EALLOW`/`EDIS`, and the driverlib functions
   for the same register do too (read their bodies). Wrap every `HWREG` write to such a register in
   `EALLOW`/`EDIS`. Without it the write is silently ignored on the device.
5. When the bit details are not enough, read the register in the TRM as Phase 3, step 3.2 describes.
   Never infer a bit value or field name the TRM does not give.

Enum values, base macros and `INT_` names are in `<driverlib>`.

## Special cases

- **Whole-register writes:** a `.all` write sets every field. Use the Phase 3 field split; when the
  driverlib calls you use touch only some fields, set the remaining fields to the same values
  explicitly.
- **Register-struct pointers:** a function that takes a pointer to a register struct takes the module
  base address (`uint32_t base`) instead. Callers pass the `_BASE` macro.
- **CLA files:** they are built by the CLA compiler. Use `HWREG`/`HWREGH` with the `inc/hw_*.h` headers,
  not the other driverlib headers. `Cla1Regs` accesses in C28x code use `cla.h` functions.
- **Write-1-to-clear flags and values encoded as size minus one:** compare the register encoding with
  what the driverlib argument means (read the body).
- **Pull-ups:** a GPIO pull-up is enabled by writing 0 to its pull-up disable bit. Use
  `GPIO_PIN_TYPE_PULLUP` exactly where the source enables one, and `GPIO_PIN_TYPE_STD` where it disables
  it.
- **Order:** keep the source's order of writes where the TRM requires one (for example the ePWM
  time-base clock sync around ePWM set-up, ADC power-up delays).
- **Interrupts:** use the Phase 3 interrupt table. `PieVectTable.X = &isr` becomes
  `Interrupt_register(INT_X, &isr)`. Enabling a CPU interrupt and its PIE bit becomes
  `Interrupt_enable(INT_X)`. Writing `PIEACK` becomes `Interrupt_clearACKGroup(INTERRUPT_ACK_GROUPn)`.
  `EINT` becomes `Interrupt_enableGlobal()`. `IER = 0; IFR = 0;` after `Interrupt_initModule()` is removed.
- **RAM functions:** if the generated `syscfg/device.c` already copies the RAM functions, remove the
  source's copy. Keep the section names the project's linker file uses.

## Comments

Keep the user's comments. Add a comment only where the target code is not obvious from the call itself,
and keep it short. Do not describe the conversion; the log records it.

## Report

Return:

```
### Converted rows
| Row # | Source access | Target code (line) | How (function / HWREG) | Searched (HWREG rows only) |
|---|---|---|---|---|

### Functions read
<every driverlib function the file now calls, each read with get_driverlib_function>

### Device support calls
| Call | Replaced by / ported as |
|---|---|

### Needs a decision
<rows you could not convert without the user, and why>
```
