# Document Difference Desktop App (Electron)

This project is a Node.js/Electron desktop application for comparing two documents (PDF, CSV, or text) and showing their textual differences.

## Setup

1. Install Node.js (v16+ recommended).
2. Open a terminal in `doc_diff_app`.
3. Run:
   ```bash
   npm install
   npm start
   ```

## Features

- Graphic user interface built with Electron.
- Select two files using file picker dialogs.
- Supports PDF, CSV, and plain text files.
- Text extraction from PDFs using `pdf-parse` and parsing CSVs with `csv-parse`.
- Unified diff generated with the `diff` package and displayed in a textarea.

## Usage

1. Click **Choose File 1** and **Choose File 2** to pick documents.
2. Click **Compare** to see differences.

## Development

- `main.js` handles Electron app lifecycle, file dialogs, and text extraction.
- `preload.js` exposes safe IPC APIs to the renderer.
- `renderer.js` drives the UI logic in the browser window.

## Notes

- The diff output is a plain-text unified diff; it can be copied or saved externally.
- Expand file type support by modifying `extractText` in `main.js`.
