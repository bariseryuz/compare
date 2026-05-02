/**
 * Custom Gemini analysis: user prompt + one or many documents (extracted text).
 * Used by POST /api/analyze on the web server and Electron IPC.
 */
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { extractText } = require('./compare-core');

const MAX_FILES = 45;

/**
 * Total extracted characters sent to the model.
 * gemini-2.5-flash has a 1 000 000 token context window.
 * ~4 chars per token → 800k chars ≈ 200k tokens — leaves plenty of room for the prompt + response.
 */
const MAX_CHARS_TOTAL = 800_000;

/**
 * System instruction sent as a dedicated system turn (not mixed into the user message).
 * This is the single biggest lever for answer quality.
 */
const SYSTEM_INSTRUCTION = `\
You are an expert document analyst. The user has uploaded one or more documents. \
Their text was machine-extracted from formats like PDF, Word, Excel, CSV, and plain text, \
so there may be minor artifacts: broken words at line ends, missing spaces between sentences, \
garbled table layout, or OCR noise. Read past these artifacts and reason about the actual content.

Your job:
- Answer the user's question or follow their instructions precisely, using ONLY the information \
  found in the provided documents.
- If a specific fact, number, name, or section is asked about, quote the relevant excerpt directly \
  and state which document it came from.
- If something is not in the documents, say clearly: "I cannot find this in the provided documents."
- Do NOT make up information or draw on outside knowledge beyond what the documents contain.
- Match the output format the user asks for (table, bullet list, numbered list, prose, etc.). \
  If no format is requested, use clear headings and bullet points for easy reading.
- When comparing multiple documents, explicitly name the document for every claim.
- Be concise and direct. Do not pad your answer with disclaimers or generic summaries unless asked.`;

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

  // ── Build document bundle ────────────────────────────────────────────────
  const parts = [];
  let used = 0;
  const skipped = [];
  const included = [];

  for (const entry of fileEntries) {
    const fp = entry.path;
    const label = entry.originalName || path.basename(fp);
    const ext = path.extname(label).toLowerCase();

    let body;
    try {
      body = await extractText(fp);
    } catch (e) {
      parts.push(`=== DOCUMENT: ${label} ===\n[Could not extract text: ${e.message}]\n`);
      continue;
    }

    if (!body || !body.trim()) {
      parts.push(`=== DOCUMENT: ${label} ===\n[No readable text found in this file.]\n`);
      continue;
    }

    // Build a mini-header with useful metadata
    const lineCount = body.split('\n').filter((l) => l.trim()).length;
    const wordCount = body.split(/\s+/).filter(Boolean).length;
    const header = `=== DOCUMENT: ${label} (${ext.slice(1).toUpperCase() || 'TXT'}, ~${wordCount.toLocaleString()} words, ~${lineCount.toLocaleString()} lines) ===\n`;

    const remaining = MAX_CHARS_TOTAL - used - header.length - 4;
    if (remaining <= 200) {
      skipped.push(label);
      continue;
    }

    let slice = body;
    let truncated = false;
    if (slice.length > remaining) {
      // Keep as much as possible but end on a complete line
      const cutPoint = body.lastIndexOf('\n', remaining);
      slice = cutPoint > remaining * 0.8
        ? body.slice(0, cutPoint)
        : body.slice(0, remaining);
      truncated = true;
    }

    const block = `${header}\n${slice}\n${truncated ? '\n[… document truncated — context limit reached …]\n' : ''}`;
    parts.push(block);
    used += block.length;
    included.push(label);

    if (used >= MAX_CHARS_TOTAL) break;
  }

  if (!parts.length) {
    return {
      diff: [{ value: 'Error: Could not extract readable text from any of the uploaded files.', added: false, removed: false }],
      meta: null
    };
  }

  let bundle = parts.join('\n\n');
  if (skipped.length) {
    bundle += `\n\n[Note: ${skipped.length} additional file(s) were not included because the context limit was reached: ${skipped.join(', ')}]`;
  }

  // ── Call Gemini ──────────────────────────────────────────────────────────
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelId,
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: {
        temperature: 0.1,        // Low temp → factual, precise answers
        topP: 0.95,
        maxOutputTokens: 16384,  // Enough for long tables / detailed reports
      }
    });

    const userMessage = `## Your question / instructions\n\n${promptText}\n\n## Document contents\n\n${bundle}`;

    const result = await model.generateContent(userMessage);
    const text = result.response.text().trim();

    return {
      diff: [{ value: text, added: false, removed: false }],
      meta: {
        file1Label: 'Your question',
        file2Label: `${included.length} file(s)`,
        kind1: 'text',
        kind2: 'text',
        aiOnly: true,
        plainEnglish: '',
        plainEnglishSub: '',
        bullets: [
          `Model: ${modelId}.`,
          `${included.length} file(s) read.`,
          ...(skipped.length ? [`${skipped.length} file(s) skipped (context limit).`] : [])
        ],
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
