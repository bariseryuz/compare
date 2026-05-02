/**
 * Shared DOM helpers for the Electron renderer (loaded before renderer.js).
 */
function countLogicalLines(s) {
  if (!s) return 0;
  const parts = s.replace(/\r\n/g, '\n').split('\n');
  if (parts.length && parts[parts.length - 1] === '') parts.pop();
  return parts.length;
}

function runWhenDomReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shortFileName(name, max = 28) {
  const s = String(name);
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function buildDiffLegendHtml(meta) {
  const a = escapeHtml(shortFileName(meta.file1Label));
  const b = escapeHtml(shortFileName(meta.file2Label));
  return `
    <span class="legend-line"><span class="legend-swatch add" aria-hidden="true"></span><span><strong>Green</strong> — only in <strong>${b}</strong> (second document you chose).</span></span>
    <span class="legend-line"><span class="legend-swatch del" aria-hidden="true"></span><span><strong>Red</strong> — only in <strong>${a}</strong> (first document you chose).</span></span>
    <span class="legend-line"><span class="legend-swatch mutual" aria-hidden="true"></span><span><strong>Light gray</strong> — same words in both documents.</span></span>
    <span class="legend-line"><span class="legend-swatch skip" aria-hidden="true"></span><span><strong>Dark dashed block</strong> — a long stretch that matched; the middle is hidden so you can scroll faster.</span></span>
  `;
}

const DEFAULT_LABEL_SECOND = 'Only in second document';
const DEFAULT_LABEL_FIRST = 'Only in first document';

function createSpanForDiffPart(part) {
  const span = document.createElement('span');
  const isErrorLine = typeof part.value === 'string' && part.value.startsWith('Error:');
  if (isErrorLine) {
    span.className = 'diff-error';
    span.setAttribute('data-prefix', '! ');
  } else if (part.collapsed) {
    span.className = 'diff-omitted';
    span.setAttribute('data-prefix', '  ');
  } else if (part.added) {
    span.className = 'diff-added';
    span.setAttribute('data-prefix', '2 │ ');
  } else if (part.removed) {
    span.className = 'diff-removed';
    span.setAttribute('data-prefix', '1 │ ');
  } else {
    span.className = 'diff-mutual';
    span.setAttribute('data-prefix', '≡ ');
  }
  span.textContent = part.value;
  return span;
}

/**
 * Three sections: first file only, second file only, both files.
 */
function renderDiffSections(diffData, file1Path, file2Path, resultArea) {
  resultArea.innerHTML = '';
  const name1 = file1Path.split(/[\\/]/).pop() || 'Document 1';
  const name2 = file2Path.split(/[\\/]/).pop() || 'Document 2';

  const hasError = diffData.some(
    (p) => typeof p.value === 'string' && p.value.startsWith('Error:')
  );
  if (hasError) {
    diffData.forEach((part) => {
      resultArea.appendChild(createSpanForDiffPart(part));
    });
    return;
  }

  const removedParts = [];
  const addedParts = [];
  const mutualParts = [];
  diffData.forEach((part) => {
    if (part.added) addedParts.push(part);
    else if (part.removed) removedParts.push(part);
    else mutualParts.push(part);
  });

  function makeSection(heading, intro, parts) {
    const section = document.createElement('section');
    section.className = 'diff-section';
    const h = document.createElement('h3');
    h.className = 'diff-section-heading';
    h.textContent = heading;
    const introEl = document.createElement('p');
    introEl.className = 'diff-section-intro';
    introEl.textContent = intro;
    const body = document.createElement('div');
    body.className = 'diff-section-body';
    if (parts.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'diff-section-empty';
      empty.textContent = 'There is no text in this category.';
      body.appendChild(empty);
    } else {
      parts.forEach((part) => {
        body.appendChild(createSpanForDiffPart(part));
      });
    }
    section.appendChild(h);
    section.appendChild(introEl);
    section.appendChild(body);
    return section;
  }

  const introFirst = removedParts.length
    ? `The following content appears only in the first document (${name1}). It does not appear in the second document (${name2}).`
    : `There is no content that appears only in the first document (${name1}) and not in the second (${name2}).`;

  const introSecond = addedParts.length
    ? `The following content appears only in the second document (${name2}). It does not appear in the first document (${name1}).`
    : `There is no content that appears only in the second document (${name2}) and not in the first (${name1}).`;

  const introBoth = mutualParts.length
    ? `The following content appears in both documents—the same text in the first file (${name1}) and the second file (${name2}). Very long matching sections may be shortened in the middle so you can scroll to differences more easily.`
    : `There is no shared text in this category.`;

  resultArea.appendChild(
    makeSection(`1 — Details only in the first document (${name1})`, introFirst, removedParts)
  );
  resultArea.appendChild(
    makeSection(`2 — Details only in the second document (${name2})`, introSecond, addedParts)
  );
  resultArea.appendChild(
    makeSection(`3 — Details in both documents`, introBoth, mutualParts)
  );
}

function renderAiExchange(resultArea, { promptText, responseText, contextLabel }) {
  resultArea.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'ai-exchange';
  const p = String(promptText || '').trim();
  if (p) {
    const h = document.createElement('h3');
    h.className = 'ai-exchange-heading';
    h.textContent = 'Your request';
    const pre = document.createElement('pre');
    pre.className = 'ai-prompt-display';
    pre.textContent = p;
    wrap.appendChild(h);
    wrap.appendChild(pre);
  }
  const c = String(contextLabel || '').trim();
  if (c) {
    const ctx = document.createElement('p');
    ctx.className = 'ai-exchange-context';
    ctx.textContent = c;
    wrap.appendChild(ctx);
  }
  const h2 = document.createElement('h3');
  h2.className = 'ai-exchange-heading';
  h2.textContent = 'Response';
  const out = document.createElement('pre');
  out.className = 'ai-output';
  out.textContent = responseText || '';
  wrap.appendChild(h2);
  wrap.appendChild(out);
  resultArea.appendChild(wrap);
}
