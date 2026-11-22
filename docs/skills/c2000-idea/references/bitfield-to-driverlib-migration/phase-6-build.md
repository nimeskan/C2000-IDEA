# Phase 6 — Build

Start only if the log shows Phase 5 COMPLETE and every file in the Phase 5 table has a sub-agent in
**Converted by**. If not, go back to Phase 5.

Build every configuration of the target project until it has no errors.

## 6.1 Clean build

Delete the active configuration's build output (`*.obj`, `*.d`, `*.out` in its build directory), then
`buildProject`. Deleted source files can otherwise still appear compiled. Read the `output` of
`buildProject`; the build log file is not rewritten.

## 6.2 Fix the errors

For each error, fix the cause in the file it names, following `phase-5-convert-rules.md` for any change
to register access. Typical causes:

- A device support type, macro or header still in use.
- A driverlib function or enum name that does not exist: find the right one in the driverlib headers and
  check it with `get_driverlib_function`.
- A name defined both by a leftover device support header and by driverlib: remove the device support
  include.
- A linker error: a missing symbol from a deleted device support file (port its body as in Phase 5), or
  memory that is too small (tell the user which section and how much is missing; do not drop code to
  make it fit).

Rebuild after each round of fixes. If the same error survives two rounds, stop and ask the user.

## 6.3 Other configurations

Build every other build configuration the same way. Code in `#ifdef _FLASH` blocks and other
configuration-specific code is checked only there. Note any error that appears only in one
configuration.

Record the builds, the errors and their fixes in the log, set Phase 6 to COMPLETE and return to
`bitfield-to-driverlib-migration.md`.
