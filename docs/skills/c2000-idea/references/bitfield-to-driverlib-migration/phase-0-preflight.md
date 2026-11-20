# Phase 0 — Inputs and pre-flight

Run this phase once, before Phase 1. Nothing is written yet: the log is created in Phase 1, so keep these
results in your session context.

## 0.1 Inputs

Take the source project from the user's request. If it is missing, ask for it.

## 0.2 Probe the MCP servers

| Server | Probe | If it fails |
|---|---|---|
| IDEA MCP | `get_projects()` | Stop. Ask the user to enable the IDEA MCP. |
| CCS Project MCP | `getProducts` | Stop. Ask the user to register the CCS Project MCP. |
| CCS SysConfig MCP | `listFiles` | Stop. Ask the user to register the CCS SysConfig MCP. |
| TI ASM MCP | `list_devices` | Stop. Ask the user to enable the TI ASM MCP. |

## 0.3 Find the project and its device

1. Find the project in `get_projects()`. If it is missing, call `get_projects(rescan: true)` once.
2. The device is the project's `currentDevice`.
3. If the project is still missing or has no device (legacy "Generic C28xx" projects), take the part
   from `targetConfigs/*.ccxml`, map it to its family and confirm the family with the user.
4. Call `getProjectDescriptors` and note the project's `location`, build configurations and active
   configuration.

## 0.4 Validate the device

1. If the device is a Gen 2 family (F2802x, F2803x, F2805x, F2806x, F2833x, F28M35x, F28M36x), tell the
   user it has no driverlib, point them to the Gen 2 device migration and stop.
2. `getProjectProductReferences` gives the project's C2000Ware path (`c2000ware_path`) and version.
   `<c2000ware_path>/driverlib/<device in lower case>/` must exist.
3. `list_devices` of the TI ASM MCP must list the device.

If a check fails, tell the user which and stop.

## Phase 0 complete

Tell the user the project, device, MCP status and C2000Ware path, and that Phase 1 creates the target
project. Return to `bitfield-to-driverlib-migration.md`.
