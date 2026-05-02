/**
 * Gemini-based comparison: reads full extracted text and reports differences with
 * emphasis on part numbers / BOM-style identifiers (not line-by-line layout).
 *
 * Env: GEMINI_API_KEY (required), GEMINI_MODEL (optional).
 */
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { extractText, docKindFromExt } = require('./compare-core');

const MAX_CHARS_PER_DOC = 120_000;

function truncate(s, max) {
  if (!s || s.length <= max) return s;
  return `${s.slice(0, max)}\n\n[…truncated for model context…]`;
}

async function runCompareGemini(file1, file2) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        diff: [{ value: 'Error: GEMINI_API_KEY is not set.', added: false, removed: false }],
        meta: null
      };
    }

    const modelId = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const txt1 = truncate(await extractText(file1), MAX_CHARS_PER_DOC);
    const txt2 = truncate(await extractText(file2), MAX_CHARS_PER_DOC);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelId });

    const prompt = `You are comparing two technical / procurement documents provided as plain text (extracted from PDF, Word, Excel, etc.). The user cares most about **part numbers** (SKU, manufacturer part numbers, drawing numbers, item codes, revision codes—any alphanumeric identifiers used to specify components).

Documents:
- First file title: ${path.basename(file1)}
- Second file title: ${path.basename(file2)}

=== TEXT OF FIRST DOCUMENT ===
${txt1}
=== END FIRST DOCUMENT ===

=== TEXT OF SECOND DOCUMENT ===
${txt2}
=== END SECOND DOCUMENT ===

Instructions:
1. Read both documents in full (within what you received). Do not complain about formatting or line breaks—focus on meaning and identifiers.
2. Identify **part numbers and similar codes** in each document. Use reasonable judgment for what counts as a part number in context (e.g. patterns like ABC-12345, 12-345678-90, PN 123456, drawing DWG-001; ignore ordinary prose unless it clearly acts as an identifier).
3. Produce a structured report in **Markdown** with exactly these sections (use ### headings):

### Part numbers (or equivalent codes) only in the first document
(Bullet list; say "None found" if empty.)

### Part numbers (or equivalent codes) only in the second document
(Bullet list; say "None found" if empty.)

### Part numbers appearing in both documents
(Bullet list; note if descriptions, quantities, or revisions differ beside the same code.)

### Other substantive differences (non–part-number)
(Short bullets: quantities, dates, specs, legal text, etc.—only if relevant.)

### Summary for stakeholders (2–5 sentences)
Plain language: what changed between revisions or lists, focusing on part-number impact.

Rules:
- Do **not** paste entire documents back.
- If OCR/extraction garbled text, mention uncertainty briefly in Summary.
- Be precise with codes; do not invent part numbers not supported by the text.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    const base1 = path.basename(file1);
    const base2 = path.basename(file2);

    return {
      diff: [{ value: text, added: false, removed: false }],
      meta: {
        file1Label: base1,
        file2Label: base2,
        kind1: docKindFromExt(path.extname(file1)),
        kind2: docKindFromExt(path.extname(file2)),
        aiOnly: true,
        plainEnglish: '',
        plainEnglishSub: '',
        bullets: [`Model: ${modelId}.`],
        similarityPct: undefined,
        mutualLines: undefined,
        diffLineCounts: { added: 0, removed: 0, total: 0 },
        stats: { addedChars: 0, removedChars: 0 }
      }
    };
  } catch (err) {
    return {
      diff: [{ value: `Error: ${err.message}`, added: false, removed: false }],
      meta: null
    };
  }
}

module.exports = { runCompareGemini };
