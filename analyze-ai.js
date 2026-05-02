/**
 * Custom Gemini analysis: user prompt + one or many documents (extracted text).
 * Used by POST /api/analyze on the web server.
 */
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { extractText } = require('./compare-core');

const MAX_FILES = 45;
/** Total extracted characters sent to the model (approximate context budget). */
const MAX_CHARS_TOTAL = 380_000;

async function runCustomAnalysis(fileEntries, userPrompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      diff: [{ value: 'Error: GEMINI_API_KEY is not set in the environment.', added: false, removed: false }],
      meta: null
    };
  }

  const promptText = String(userPrompt || '').trim();
  if (!promptText) {
    return {
      diff: [{ value: 'Error: Please enter what you want the AI to analyze.', added: false, removed: false }],
      meta: null
    };
  }

  if (!fileEntries || !fileEntries.length) {
    return {
      diff: [{ value: 'Error: Upload at least one document.', added: false, removed: false }],
      meta: null
    };
  }

  const modelId = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const parts = [];
  let used = 0;
  const skipped = [];

  for (const entry of fileEntries) {
    const fp = entry.path;
    const label = entry.originalName || path.basename(fp);
    let body;
    try {
      body = await extractText(fp);
    } catch (e) {
      parts.push(`### ${label}\n_(Could not extract text: ${e.message})_\n`);
      continue;
    }
    const header = `### ${label}\n`;
    const remaining = MAX_CHARS_TOTAL - used - header.length;
    if (remaining <= 0) {
      skipped.push(label);
      continue;
    }
    let slice = body;
    if (slice.length > remaining) {
      slice = `${slice.slice(0, remaining)}\n\n[…truncated; budget exhausted…]`;
      used = MAX_CHARS_TOTAL;
    } else {
      used += header.length + slice.length;
    }
    parts.push(`${header}\n${slice}\n`);
    if (used >= MAX_CHARS_TOTAL) break;
  }

  let bundle = parts.join('\n');
  if (skipped.length) {
    bundle += `\n\n_(Not included: ${skipped.length} more file(s) — context limit.)_\n`;
  }

  const preamble = `You are a document analyst. The user extracted plain text from uploaded files (PDF, Word, Excel, CSV, etc.). Answer based only on that content. If something is not in the documents, say you cannot see it. Follow the user's instructions for format (tables, bullets, etc.).`;

  const fullPrompt = `${preamble}\n\n## What the user wants\n${promptText}\n\n## Extracted document contents\n${bundle}`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelId });
    const result = await model.generateContent(fullPrompt);
    const text = result.response.text().trim();

    const n = fileEntries.length;

    return {
      diff: [{ value: text, added: false, removed: false }],
      meta: {
        file1Label: 'Your question',
        file2Label: `${n} file(s)`,
        kind1: 'text',
        kind2: 'text',
        aiOnly: true,
        plainEnglish: '',
        plainEnglishSub: '',
        bullets: [`Model: ${modelId}.`, `${n} file(s) sent (truncated if very large).`],
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

module.exports = {
  runCustomAnalysis,
  MAX_FILES,
  MAX_CHARS_TOTAL
};
