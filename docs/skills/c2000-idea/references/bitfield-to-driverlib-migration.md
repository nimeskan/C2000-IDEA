# Bitfield-to-Driverlib Migration Workflow

This workflow converts legacy C2000 bitfield register-structure accesses (e.g.
`Regs.FIELD.bit.NAME`) into driverlib function calls, using the IDEA MCP
`get_bitfield_to_driverlib_migration_report` tool. All register details,
driverlib function suggestions, and TRM links come from the MCP. Never recall
register mappings from memory.

## When to use

The user has C2000 code that uses the older bitfield register-structure style
and wants to modernize it to use driverlib functions. This is NOT a
device-to-device migration — the code stays on the same device. Use the
device-migration reference instead if the user is moving between device families.

## How to run this workflow

### 1. Discover the project and its device

- Call `get_projects()` to list projects with their `currentDevice` and
  `deviceVariant`.
- If the list is empty or the expected project is missing, call
  `get_projects(rescan: true)` once, then retry.
- Identify the **sourceDevice** — this is the project's `currentDevice`. The
  bitfield tool needs it to look up register-to-function mappings for the
  correct device family.

### 2. Run the bitfield migration report per source file

For each C/H source file to convert:

- Call `get_bitfield_to_driverlib_migration_report(filePath, sourceDevice)`
  with the absolute file path and the device from step 1.
- The tool returns a structured markdown report and populates VS Code
  diagnostics (squiggly underlines) as a side effect.
- Work one file at a time: convert it, run the report on it again, then move
  on to the next file.

### 3. Understand the report structure

The report groups every bitfield register access into one of four fix types:

| Fix type | Meaning | Approach |
|----------|---------|----------|
| **write** | Bitfield assignment (`Regs.FIELD.bit.NAME = value`) | Use the matching driverlib write function from the candidates |
| **read** | Bitfield read (`x = Regs.FIELD.bit.NAME`) | Use the matching driverlib read function from the candidates |
| **access** | Bitfield access in an expression | Choose the best-matching driverlib function from the available list |
| **whole** | Whole-register access (`Regs.FIELD.all = value`) | Consider a driverlib peripheral configuration function instead of raw register write |

Each issue includes:
- **Original pattern** — the exact source line
- **Available driverlib functions** — candidate functions with their signatures,
  listed per register (not per bit); pick the one that matches the field
- **Function definitions** — the exact `get_driverlib_function` call that returns
  the source, with comments, of the candidates
- **Raw access** — register width and offset, given when no candidate exists
- **Register Bit Details** — shift, mask, and description for manual fixes
- **TRM Link** — link to the register documentation

**Reading TRM links:** Each issue may include a `TRM Link` pointing to the register's
documentation in the device Technical Reference Manual. When the register bit
details (shift, mask, description) are insufficient to construct a correct
driverlib call, fetch the TRM link using this protocol:

1. **Do not attempt to retrieve from the web** — These links are only for the user to 
  read information from the browser when they want to look at documentation.
2. **If you need the register info**  — Use the ti-asm-mcp to get the register content
5. **Locate the register section** — find the register name, bit field table, and
   allowed values.
6. **Read the full register section** for the specific bit being accessed — name, reset
   value, access type (R/W/RW), and description.
7. **Construct the driverlib call** using only data from the TRM — do not infer
   or hallucinate bit values or field names not present in the documentation.

### 4. Process the report

Work through issues in file order. For each issue:

1. Navigate to the reported line/column.
2. Choose the function from **Available driverlib functions** that matches the
   field and construct the call with the correct arguments using its signature
   and the register bit details. If the signature is not enough, call
   `get_driverlib_function` (the report shows the exact call).
3. If no function is listed, use the **Raw access** details and the register bit
   details (shift, mask).
4. For **whole**-register writes with no candidate function, consider whether a
   driverlib peripheral configuration function is more appropriate than a raw
   register write.
5. After editing the file, run the report on it again; only issues on commented-out
   lines should remain.

### 5. Build and fix what remains

The report covers register accesses only. The code around them may still use
device_support names that a driverlib project does not have. Build the driverlib
project that will hold the converted code and fix each error the compiler
reports. Legacy integer and float types map to the C99 names, for example
`Uint16` to `uint16_t`, `int32` to `int32_t` and `float32` to `float32_t`.
Common ones:

| device_support | driverlib |
|----------------|-----------|
| `#include "f28x_project.h"` | `#include "driverlib.h"`, `#include "device.h"` |
| `Uint8`, `Uint16`, `Uint32`, `Uint64`, `int16`, `int32`, `int64` | `uint8_t`, `uint16_t`, `uint32_t`, `uint64_t`, `int16_t`, `int32_t`, `int64_t` |
| `float32`, `float64` | `float32_t`, `float64_t` |
| `bool_t`, `status_t` | `bool` |
| `InitSysCtrl()` | `Device_init()` |
| `InitGpio()` | `Device_initGPIO()` |
| `InitPieCtrl()` | `Interrupt_initModule()` |
| `InitPieVectTable()` | `Interrupt_initVectorTable()` |
| `PieVectTable.X_INT = &isr;` | `Interrupt_register(INT_X, &isr);` |
| `IER \|= M_INTn` | `Interrupt_enable(INT_X)` for the interrupt being enabled |

### 6. Report back

After processing all files:

1. Summarize per file: how many issues were fixed vs. flagged for manual review.
2. List any registers where you could not find a confident driverlib replacement —
   flag these for the user.
3. List every file you modified so the user can review the diffs.

## Do / Don't

- Do take file paths and device names from `get_projects()` — never invent them.
- Do use Register Bit Details (shift, mask) to construct manual fixes when no
  driverlib function is listed.
- Do run the report on one source file at a time, and again after editing it.
- Don't recall C2000 register-to-driverlib mappings from memory — the MCP is the
  source of truth.
- Don't confuse this with device-to-device migration — bitfield-to-driverlib stays
  on the same device.
- Do fetch TRM register data using the ti-asm-mcp tool when needed.
- Don't fetch the TRM Links content. Those are just for the user to read manually if 
  they want to see it in a browser
- Don't guess bit values or allowed modes from the register name alone — verify in the
  TRM page content.