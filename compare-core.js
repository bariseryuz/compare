/**
 * Shared document comparison logic (used by Electron main and Railway web server).
 */
const path = require('path');
const fs = require('fs');
const diff = require('diff');
const pdfParse = require('pdf-parse');
const { parse: csvParse } = require('csv-parse/sync');
const mammoth = require('mammoth');
const XLSX = require('xlsx');

const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024;

function docKindFromExt(ext) {
  const e = ext.toLowerCase();
  if (e === '.pdf') return 'pdf';
  if (e === '.docx') return 'word';
  if (['.xlsx', '.xls', '.xlsm', '.xlsb', '.ods'].includes(e)) return 'excel';
  if (e === '.csv') return 'csv';
  return 'text';
}

function isExcelExt(ext) {
  return ['.xlsx', '.xls', '.xlsm', '.xlsb', '.ods'].includes((ext || '').toLowerCase());
}

function lineCountText(s) {
  if (!s) return 0;
  const parts = s.replace(/\r\n/g, '\n').split('\n');
  if (parts.length && parts[parts.length - 1] === '') parts.pop();
  return parts.length;
}

function collapseUnchangedChunks(changes, maxLines = 42) {
  const out = [];
  for (const part of changes) {
    if (part.added || part.removed) {
      out.push(part);
      continue;
    }
    const n = lineCountText(part.value);
    if (n <= maxLines) {
      out.push(part);
      continue;
    }
    const lines = part.value.replace(/\r\n/g, '\n').split('\n');
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    const headN = 18;
    const tailN = 18;
    const hidden = Math.max(0, lines.length - headN - tailN);
    const head = lines.slice(0, headN).join('\n');
    const tail = lines.slice(-tailN).join('\n');
    out.push({
      value: `${head}\n\n⋯ ─── ${hidden} unchanged lines (identical in both files) ─── ⋯\n\n${tail}\n`,
      added: false,
      removed: false,
      collapsed: true
    });
  }
  return out;
}

function countMutualLines(changes) {
  let n = 0;
  for (const p of changes) {
    if (!p.added && !p.removed && p.value) {
      n += lineCountText(p.value);
    }
  }
  return n;
}

function countDiffLines(changes) {
  let added = 0;
  let removed = 0;
  for (const p of changes) {
    if (p.added) added += lineCountText(p.value);
    else if (p.removed) removed += lineCountText(p.value);
  }
  return { added, removed, total: added + removed };
}

function similarityFromDiff(changes) {
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  for (const p of changes) {
    const len = p.value ? p.value.length : 0;
    if (p.added) added += len;
    else if (p.removed) removed += len;
    else unchanged += len;
  }
  const total = added + removed + unchanged;
  const pct = total > 0 ? Math.round((unchanged / total) * 100) : 100;
  return { added, removed, unchanged, similarityPct: pct, totalChars: total };
}

function buildExcelSheetMeta(file1Path, file2Path) {
  try {
    const wb1 = XLSX.readFile(file1Path);
    const wb2 = XLSX.readFile(file2Path);
    const set2 = new Set(wb2.SheetNames);
    const onlyInFile1 = wb1.SheetNames.filter((n) => !set2.has(n));
    const onlyInFile2 = wb2.SheetNames.filter((n) => !wb1.SheetNames.includes(n));
    const shared = wb1.SheetNames.filter((n) => set2.has(n));
    const sharedDetails = [];
    for (const name of shared) {
      const csv1 = XLSX.utils.sheet_to_csv(wb1.Sheets[name]);
      const csv2 = XLSX.utils.sheet_to_csv(wb2.Sheets[name]);
      const lines1 = lineCountText(csv1);
      const lines2 = lineCountText(csv2);
      const identical = csv1.replace(/\r\n/g, '\n').trim() === csv2.replace(/\r\n/g, '\n').trim();
      sharedDetails.push({ name, lines1, lines2, identical });
    }
    return { onlyInFile1, onlyInFile2, sharedDetails };
  } catch {
    return null;
  }
}

function buildComparisonMeta(file1, file2, changes, excelMeta) {
  const base1 = path.basename(file1);
  const base2 = path.basename(file2);
  const kind1 = docKindFromExt(path.extname(file1));
  const kind2 = docKindFromExt(path.extname(file2));
  const sim = similarityFromDiff(changes);
  const mutualLines = countMutualLines(changes);
  const diffLines = countDiffLines(changes);
  const bullets = [];

  let plainEnglish;
  let plainEnglishSub;
  if (diffLines.total === 0) {
    plainEnglish = `Nothing looks different between “${base1}” and “${base2}” in the text we could read.`;
    plainEnglishSub =
      'If you expected changes, the format may hide them (for example scanned PDFs). Your original files were not modified.';
  } else {
    plainEnglish = `Roughly ${diffLines.total.toLocaleString()} lines are not the same between the two files.`;
    plainEnglishSub = `About ${sim.similarityPct}% of the text matches in both files. Green highlights text that appears only in “${base2}”. Red highlights text that appears only in “${base1}”. Light gray is text that appears in both. The app never edits your files—it only shows a read-only comparison.`;
  }

  if (kind1 === 'excel' || kind2 === 'excel') {
    plainEnglishSub +=
      ' Spreadsheets are compared as plain text, not cell-by-cell, so big tables can look noisy.';
  }

  bullets.push(
    `${mutualLines.toLocaleString()} lines match word-for-word in both files. Very long matching sections are shortened in the list so you can scroll to real differences faster.`
  );

  if (excelMeta) {
    const bits = [];
    if (excelMeta.onlyInFile1.length) {
      bits.push(`Tabs only in first file: ${excelMeta.onlyInFile1.join(', ')}`);
    }
    if (excelMeta.onlyInFile2.length) {
      bits.push(`Tabs only in second file: ${excelMeta.onlyInFile2.join(', ')}`);
    }
    const rows = excelMeta.sharedDetails;
    const maxRows = 6;
    for (let i = 0; i < rows.length && i < maxRows; i++) {
      const row = rows[i];
      bits.push(
        row.identical
          ? `Tab “${row.name}”: looks the same in both.`
          : `Tab “${row.name}”: text differs between the two files.`
      );
    }
    if (rows.length > maxRows) {
      bits.push(`${rows.length - maxRows} more tab(s)—see the full list below.`);
    }
    bullets.push(...bits);
  }

  return {
    file1Label: base1,
    file2Label: base2,
    kind1,
    kind2,
    plainEnglish,
    plainEnglishSub,
    bullets,
    similarityPct: sim.similarityPct,
    mutualLines,
    diffLineCounts: diffLines,
    stats: { addedChars: sim.added, removedChars: sim.removed }
  };
}

async function extractText(filepath) {
  const ext = path.extname(filepath).toLowerCase();
  const fileSize = fs.statSync(filepath).size;

  if (ext === '.pdf') {
    return await extractPdfText(filepath);
  } else if (ext === '.csv') {
    return await extractCsvText(filepath);
  } else if (ext === '.docx') {
    return await extractDocxText(filepath);
  } else if (isExcelExt(ext)) {
    return await extractExcelText(filepath);
  } else {
    if (fileSize > LARGE_FILE_THRESHOLD) {
      return await extractLargeTextFile(filepath);
    } else {
      return fs.readFileSync(filepath, 'utf8');
    }
  }
}

async function extractPdfText(filepath) {
  try {
    const data = fs.readFileSync(filepath);
    const pdf = await pdfParse(data);

    let text = pdf.text;
    text = text.replace(/([a-zA-Z])\n([a-z][a-z]+)/g, '$1$2');
    text = text.replace(/\r/g, '');
    text = text.replace(/[ ]+/g, ' ');
    text = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n');

    return text;
  } catch (err) {
    throw new Error(`PDF parsing failed: ${err.message}`);
  }
}

async function extractCsvText(filepath) {
  try {
    const fileSize = fs.statSync(filepath).size;
    const data = fs.readFileSync(filepath, 'utf8');

    const records = csvParse(data, {
      columns: false,
      bom: true,
      relax_column_count: true,
      skip_empty_lines: false
    });

    if (fileSize > LARGE_FILE_THRESHOLD) {
      let csvText = `[CSV File - ${records.length} rows]\n`;
      csvText += records.slice(0, 1000).map((r) => r.join(',')).join('\n');
      if (records.length > 1000) {
        csvText += `\n... and ${records.length - 1000} more rows ...\n`;
      }
      return csvText;
    }
    return records.map((r) => r.join(',')).join('\n');
  } catch (err) {
    throw new Error(`CSV parsing failed: ${err.message}`);
  }
}

async function extractExcelText(filepath) {
  try {
    const workbook = XLSX.readFile(filepath, { cellDates: true });
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return '';
    }
    let fullText = '';

    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) return;
      const csv = XLSX.utils.sheet_to_csv(sheet);
      fullText += `--- Sheet: ${sheetName} ---\n${csv}\n\n`;
    });

    return fullText.trim();
  } catch (err) {
    throw new Error(`Excel parsing failed: ${err.message}`);
  }
}

async function extractLargeTextFile(filepath) {
  return new Promise((resolve, reject) => {
    let text = '';
    let lineCount = 0;
    const rl = require('readline').createInterface({
      input: fs.createReadStream(filepath, { encoding: 'utf8' }),
      crlfDelay: Infinity
    });

    rl.on('line', (line) => {
      text += line + '\n';
      lineCount++;
      if (lineCount >= 100000) {
        rl.close();
      }
    });

    rl.on('close', () => {
      if (lineCount >= 100000) {
        text += `\n... file truncated (${lineCount} lines) ...\n`;
      }
      resolve(text);
    });

    rl.on('error', reject);
  });
}

async function extractDocxText(filepath) {
  try {
    const result = await mammoth.extractRawText({ path: filepath });

    let text = result.value;
    text = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n');

    return text;
  } catch (err) {
    throw new Error(`Word (DOCX) parsing failed: ${err.message}`);
  }
}

async function runCompare(file1, file2) {
  try {
    if (!file1 || !file2) {
      throw new Error('Two file paths are required.');
    }
    if (!fs.existsSync(file1)) {
      throw new Error(`File not found: ${path.basename(file1)}`);
    }
    if (!fs.existsSync(file2)) {
      throw new Error(`File not found: ${path.basename(file2)}`);
    }
    const ext1 = path.extname(file1).toLowerCase();
    const ext2 = path.extname(file2).toLowerCase();
    const excelMeta =
      isExcelExt(ext1) && isExcelExt(ext2) ? buildExcelSheetMeta(file1, file2) : null;

    const txt1 = await extractText(file1);
    const txt2 = await extractText(file2);

    const cleanTxt1 = txt1.replace(/\r\n/g, '\n').trim();
    const cleanTxt2 = txt2.replace(/\r\n/g, '\n').trim();

    const rawChanges = diff.diffLines(cleanTxt1, cleanTxt2);
    const changes = collapseUnchangedChunks(rawChanges);
    const meta = buildComparisonMeta(file1, file2, rawChanges, excelMeta);

    return { diff: changes, meta };
  } catch (err) {
    return {
      diff: [{ value: `Error: ${err.message}`, added: false, removed: false }],
      meta: null
    };
  }
}

module.exports = {
  runCompare,
  LARGE_FILE_THRESHOLD
};
