# Phase 1 — Target project

Clone the source project, give the clone SysConfig and driverlib, build it and start the log. The clone
keeps the project's own settings: include paths, defines, build configurations and linker files.

This phase edits the clone's `.cproject` and writes a `.syscfg` file by hand. CCS's own AI guide says
never to do either, but no MCP tool can: the project MCP cannot enable SysConfig, and the SysConfig MCP
cannot create a file. For this phase, do both.

## 1.1 Clone the project

Propose `<sourceProjectName>_driverlib` and confirm the name with the user. `copyProject(projectName,
newName)`. Work only in the clone from here on.

If the clone's `.project` has `<link>` entries for the user's own files (typical of F2807x and F2837x
projects), editing the clone's file edits the source. Copy each of those files into the clone folder and
delete its `<link>` from the clone's `.project`. Leave the links to device support files: Phase 4
removes them.

Call `get_projects(rescan: true)` and check the clone is listed with the source's device.

## 1.2 Enable SysConfig

If `getToolFlags(clone, "sysconfig")` returns flags, the clone already uses SysConfig: skip to 1.3.

Get the SysConfig version from `getActiveSysConfigMCPVersion`. Then, in every `<cconfiguration>` of the
clone's `.cproject` (one per build configuration, for example CPU1_RAM and CPU1_FLASH):

1. In the `OPT_TAGS` list, change `PRODUCTS=C2000WARE:<version>;` to
   `PRODUCTS=sysconfig:<sysconfig version>;C2000WARE:<version>;`. If `PRODUCTS=` is empty (legacy
   projects), set it to the same string, with the C2000Ware version from `getProducts`.
2. Add this tool immediately before `</toolChain>`. `<n>` is any number not already used in the file:

   ```xml
   <tool id="com.ti.ccstudio.buildDefinitions.sysConfig.<n>" name="SysConfig" superClass="com.ti.ccstudio.buildDefinitions.sysConfig">
       <option id="com.ti.ccstudio.buildDefinitions.sysConfig.PRODUCTS.<n>" superClass="com.ti.ccstudio.buildDefinitions.sysConfig.PRODUCTS" valueType="stringList">
           <listOptionValue value="${SYSCONFIG_TOOL_SYSCONFIG_MANIFEST}"/>
           <listOptionValue value="${COM_TI_C2000WARE_SYSCONFIG_MANIFEST}"/>
           <listOptionValue value="${C2000WARE_ROOT}/.metadata/sdk.json"/>
       </option>
   </tool>
   ```

3. Add this line inside `<extensions>`, after the `GmakeErrorParser` line:

   ```xml
   <extension id="com.ti.ccs.errorparser.SysConfigErrorParser" point="com.ti.ccs.project.ErrorParser"/>
   ```

4. Add this line inside `<macros>`:

   ```xml
   <stringMacro name="C2000WARE_ROOT" type="VALUE_PATH_ANY" value="${COM_TI_C2000WARE_INSTALL_DIR}"/>
   ```

Poll `getToolFlags(clone, "sysconfig")` until it returns flags. Change nothing else in the project before
it does: CCS would overwrite the edit. If it still reports "Unknown toolType 'sysconfig'" after a minute,
an edit is missing.

## 1.3 SysConfig script

If the clone has a `.syscfg` file, open it (`openFile`) and add the device support module with
`addModuleInstances` if it is missing; `save` and `closeFile`. Otherwise create
`<cloneDir>/<cloneName>.syscfg`:

```js
/**
 * @v2CliArgs --device "<device>" --package "<package>" --context "<context>"
 */
const device_support = scripting.addModule("/driverlib/device_support.js");
```

- `<device>` and `<package>`: the device's part number and its largest package, from the table in the
  `syscfg-openfile-recovery` skill. The project does not store the package: tell the user which one you
  used.
- `<context>`: `system`, except on the dual-core F2837xD, F2838x and F28P65x: `CPU1` or `CPU2`, the core
  the project runs on. With the wrong context SysConfig writes nothing and the build stops at a missing
  `c2000ware_libraries.cmd.genlibs`.

## 1.4 Linker flags

If the linker flags do not already have them, `setToolFlags` with `toolType` `linker` adds to every build
configuration:

```text
-i"${SYSCONFIG_TOOL_LIBRARY_PATH}" -i"${PROJECT_BUILD_DIR}/syscfg" -i"${C2000WARE_ROOT}" -l"c2000ware_libraries.cmd.genlibs" -l"board.cmd.genlibs"
```

## 1.5 Build

`buildProject` on the clone. Read the `output` of `buildProject`; the `_build.log` file is not
rewritten. It must build with no errors, and `<configuration>/syscfg/` must hold `device.c`, `device.h`,
`board.c`, `board.h`, `c2000ware_libraries.c` and `c2000ware_libraries.h`.

- `syscfg/` missing: the context in the `.syscfg` is wrong.
- Any other failure, for example the program no longer fits in RAM: stop and tell the user what the
  build reported.

## 1.6 Create the log

Create `c2000-bitfield-to-driverlib.md` in the clone's directory:

```markdown
# Bitfield-to-Driverlib Migration Log

| Field | Value |
|---|---|
| Source project | `<name>` |
| Source project directory | `<path>` |
| Device | `<family>` |
| SysConfig device / package / context | `<part>`, `<package>`, `<context>` |
| Target project | `<name>` |
| Target project directory | `<path>` |
| C2000Ware | `<path>`, `<version>` |
| Build configurations | `<names>`, active `<name>` |

## Pre-flight (Phase 0)

| MCP | Status |
|---|---|
| IDEA MCP | live |
| CCS Project MCP | live |
| CCS SysConfig MCP | live |
| TI ASM MCP | live |

## Phase Status

| Phase | Status | Notes |
|---|---|---|
| 0 — Pre-flight | COMPLETE | |
| 1 — Target project | COMPLETE | clone builds with SysConfig |
| 2 — Source inventory | PENDING | |
| 3 — Plan | PENDING | |
| 4 — Project settings | PENDING | |
| 5 — Convert | PENDING | |
| 6 — Build | PENDING | |
| 7 — Verify | PENDING | |
| 8 — Report | PENDING | |
```

## Phase 1 complete

Tell the user the target project name, the package used and that the clone builds. Return to
`bitfield-to-driverlib-migration.md`.
