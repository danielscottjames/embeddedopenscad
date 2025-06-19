# Embedded OpenSCAD

This is a very WIP extension that enables you to preview and export OpenSCAD files without leaving VS Code.

## Features

- Preview OpenSCAD models directly in VS Code
- Export OpenSCAD models to STL files
- Support for OpenSCAD libraries (BOSL2, etc.) via user-defined library paths
- Enhanced error handling with descriptive error messages

## Configuration

### User Library Path

You can specify a path to your OpenSCAD libraries directory which will be loaded into the WebAssembly filesystem:

1. Go to Settings (File > Preferences > Settings)
2. Search for "Embedded OpenSCAD"
3. Enter the full path to your OpenSCAD libraries directory in the "User Library Path" field

Example: `/Users/username/openscad/libraries` or `C:\openscad\libraries`

**Important Directory Structure:**
- The User Library Path should be a directory that contains library folders (like BOSL2, MCAD, etc.)
- For BOSL2, your directory structure should look like this:
  ```
  User Library Path/
  └── BOSL2/
      ├── std.scad
      ├── ... (other BOSL2 files)
  ```

**Using Libraries in Your OpenSCAD Files:**
- Include BOSL2: `include <BOSL2/std.scad>`
- Include other libraries: `include <LibraryName/file.scad>`

The extension will recursively load all `.scad` files from the library directories into the WASM filesystem in the standard OpenSCAD library location, making them available for use with `include` or `use` statements in your OpenSCAD files.

## Troubleshooting

### Common Error Codes

When using the extension, you may encounter numeric error codes. Here's what some of these codes typically mean:

- **1034824**: Library or include file not found. Check that your User Library Path exists and contains valid .scad files.
- **1034912**: Module or function not found. The library may be loaded but the specified module/function cannot be found or has errors.
- **1034928**: Error loading library files. The User Library Path may not be accessible or might contain invalid files.

### Library Issues

When including libraries like BOSL2, make sure:

1. The User Library Path is set to the parent directory containing the library folder
2. You're using the correct include syntax: `include <BOSL2/std.scad>`
3. The library files are properly installed (for BOSL2, ensure you have the complete library with all files)

### Viewing Debug Information

If you encounter errors:

1. Use the "Show OpenSCAD Output Log" command from the command palette to view detailed logs
2. Check the error messages for specific details about what went wrong
3. Examine the output logs to see how libraries are being loaded

### Where Do Error Codes Come From?

The error codes come from a combination of:

1. Emscripten/WebAssembly runtime errors
2. OpenSCAD internal error codes 
3. Standard system error codes mapped to the WASM environment

Unfortunately, there's no comprehensive published list of all OpenSCAD WASM error codes. The extension attempts to decode these errors into meaningful messages based on known patterns.
