# DocCompare — Wiki

**DocCompare** is a small desktop app (Electron) that compares two documents and shows **what is different** and **what is the same**. It never edits your original files.

---

## Table of contents

1. [What it does](#what-it-does)
2. [Supported file types](#supported-file-types)
3. [Install and run](#install-and-run)
4. [How to compare (step by step)](#how-to-compare-step-by-step)
5. [Understanding the results](#understanding-the-results)
6. [Spreadsheets (Excel)](#spreadsheets-excel)
7. [Export and reports](#export-and-reports)
8. [Building a Windows installer](#building-a-windows-installer)
9. [Troubleshooting](#troubleshooting)
10. [Privacy and files](#privacy-and-files)

---

## What it does

- You pick **two files**: first = one document, second = the other.
- The app **reads the text** inside each file (PDF text layer, Word, Excel as exported text, CSV, plain text).
- It shows a **comparison**: text that appears only in the second file, only in the first file, and text that appears in **both**.
- Your files on disk are **read-only** for this process; the app does **not** save over them.

---

## Supported file types

| Type | Extensions | Notes |
|------|------------|--------|
| PDF | `.pdf` | Uses the PDF text layer. Scanned images without OCR may show little or no text. |
| Word | `.docx` | Not legacy `.doc`. |
| Excel | `.xlsx`, `.xls` | Compared as **plain text rows** (like CSV), not cell-by-cell like Excel’s own compare. |
| CSV | `.csv` | |
| Plain text | `.txt` and similar | Large text files may be handled in chunks. |

---

## Install and run

**Requirements:** [Node.js](https://nodejs.org/) (LTS recommended, e.g. v18+).

1. Open a terminal in the project folder (`doc_diff_app`).
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the app:
   ```bash
   npm start
   ```

---

## How to compare (step by step)

1. **First document** — click the zone or drag a file in. This is your “first” or “baseline” side.
2. **Second document** — same for the other file.
3. Click **Compare Documents** (or the main compare button).
4. Read the **plain-English summary** at the top of the results, then scroll the colored view if you need detail.
5. Use **Download Report** or **Copy Results** if you want to save or share the output.

---

## Understanding the results

### Plain English box

After a compare, the top section explains in **simple language**:

- Roughly how many **lines differ**, or that **nothing** showed as different.
- Roughly **how much text matches** in both files (a percentage — a guide, not a legal “match %”).
- That **green / red / gray** are only **labels** for the comparison; your files are not modified.

### Colors in the detailed view

| Color / style | Meaning |
|----------------|--------|
| **Green** | Text that shows up **only in the second file** you chose. |
| **Red** | Text that shows up **only in the first file** you chose. |
| **Light gray (neutral)** | Text that is **the same in both** files (“mutual” content). |
| **Dark gray, dashed border** | A **long** stretch that matched in both files; the **middle is hidden** so the list is shorter. Nothing was deleted from your files — only the **display** is shortened. |

The legend updates with **short versions of your filenames** so it is clear which file is which.

### Numbers at a glance

- **Lines that don’t match (total)** — counts lines that appear on one side only (both colors combined).
- **Only in: [second file name]** / **Only in: [first file name]** — split counts.
- **Lines that match in both** — lines of text that are identical in both files.
- **Roughly how much is the same** — approximate similarity by length.

---

## Spreadsheets (Excel)

Excel files are turned into **text** (sheet by sheet, similar to CSV). That means:

- The tool does **not** behave like Excel’s “Track Changes” or a **cell-by-cell** diff.
- If a number moves to another row, it can look like a **large** change even if the spreadsheet “means” the same thing.

For heavy spreadsheet work, a dedicated **spreadsheet compare** tool may be better; DocCompare is best when you want a **quick text-level** view across many formats in one app.

---

## Export and reports

- **Download Report** — saves a **text file** with the summary and the detailed tagged lines.
- **Copy Results** — copies the summary and the detailed view to the clipboard.

---

## Building a Windows installer

From `doc_diff_app`:

```bash
npm run dist
```

This uses **electron-builder** and produces an installer under `dist/` (see `package.json` for targets, e.g. NSIS on Windows). You can share that installer; recipients may see a **SmartScreen** warning for unsigned apps until you use a code-signing certificate.

---

## Troubleshooting

| Issue | What to try |
|--------|-------------|
| **Nothing looks different** but you expect changes | PDF might be a scan (no text). Try Word/text export or OCR first. |
| **Excel looks noisy** | Expected for large tables; comparison is line text, not cells. |
| **GitHub shows only README** | Your code may be on another **branch** (e.g. `master` vs `main`). Switch branch on GitHub. |
| **Push rejected** | Remote has commits you don’t have locally — `git pull` (sometimes with `--allow-unrelated-histories`) then push, or use an **empty** new repo for a clean first push. |

---

## Privacy and files

- Processing happens **on your computer** in the Electron app.
- The app does **not** upload your documents to a server for comparison (unless you change the code to do so).
- Do not commit secrets (API keys, passwords) into Git; use `.gitignore` for local-only files.

---

## Project layout (short)

| File | Role |
|------|------|
| `main.js` | Electron window, file dialogs, text extraction, diff logic. |
| `preload.js` | Safe bridge between UI and main process. |
| `renderer.js` | Buttons, results panel, copy/download. |
| `index.html` | Layout and styles. |

---

## Using this page on GitHub

1. Open your repository on GitHub.  
2. Click **Wiki**.  
3. **Create the first page** (often named **Home**).  
4. Paste the contents of this file (or link to `wiki/Home.md` in the repo if you prefer to keep the wiki in the codebase).

You can split sections into separate wiki pages later if you want.

---

*Last updated to match DocCompare behavior: plain-English summary, mutual lines, Excel sheet notes, and Windows installer via `npm run dist`.*
