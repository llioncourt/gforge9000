# Fix browser video converter loading

## Goal
Make “Prepare for streaming” load the bundled converter reliably instead of falling back to a normal video upload.

## Changes
- Replace the incompatible converter wrapper currently served to the browser with the matching ES-module build expected by the worker.
- Load the same-origin converter script directly, while keeping the hosted WebAssembly engine file.
- Preserve the existing normal-upload fallback and dedicated error window.

## Verification
- Confirm the converter and engine URLs return the expected file types.
- Exercise converter initialization in the browser.
- Check the current preview build and upload flow for new runtime errors.
