- This is an Arduino project running on a microcontroller
- There is very limited compute power and memory available
- Toolchain is SDCC C90-only (no C++ keywords or features)
- Use `arduino-cli compile --fqbn CH55xDuino:mcs51:ch552:usb_settings=user148,clock=16internal --export-binaries` to compile firmware inside the `Keypad.Firmware` folder
- Always compile the firmware after making changes to test
- You can only delete files by running shell commands, the patch tool does not work for this
- Include `--clean` when compiling after deleting/renaming files to clear the Arduino build cache
abcdddd