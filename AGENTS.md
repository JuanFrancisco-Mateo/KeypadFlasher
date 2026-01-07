General:
- You can only delete files by running shell commands, the patch tool does not work for this
  - TODO: Remove when fixed: https://github.com/microsoft/vscode/issues/275705
- Do not worry about backwards compatibility, breaking changes are no problem
  - The only exception to this is the import/export file format, which should remain compatible

Keypad.Firmware:
- This is an Arduino project running on a microcontroller
- There is very limited compute power and memory available
- Toolchain is SDCC C90-only (no C++ keywords or features)
- Use `arduino-cli compile --fqbn CH55xDuino:mcs51:ch552:usb_settings=user148,clock=16internal --export-binaries` to compile firmware inside the `Keypad.Firmware` folder
- Always compile the firmware after making changes to test
- Include `--clean` when compiling after deleting/renaming files to clear the Arduino build cache
abcdddd

Keypad.Flasher.Server:
- This is a .NET backend server application
- Use `dotnet build` to compile
- Use `dotnet test` to run unit tests
- Always run build and unit tests after changing backend code
- `ImplicitUsings` is enabled so common namespaces are included automatically and do not need to be added

Keypad.Flasher.Client:
- This is a React frontend application
- Use `npm run build` to compile
- Always compile after changing frontend code to test
- TypeScript is used with strict type checking enabled, avoid using `any` type
