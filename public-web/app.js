/**
 * DocCompare web UI — same layout/CSS as Electron; uses POST /api/compare.
 */
const LARGE_BYTES = 50 * 1024 * 1024;
const DEFAULT_LABEL_SECOND = 'Only in second document';
const DEFAULT_LABEL_FIRST = 'Only in first document';

function countLogicalLines(s) {
  if (!s) return 0;
  const parts = s.replace(/\r\n/g, '\n').split('\n');
  if (parts.length && parts[parts.length - 1] === '') parts.pop();
  return parts.length;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shortFileName(name, max = 28) {
  const t = String(name);
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
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

function renderDiffSections(diffData, name1, name2, resultArea) {
  resultArea.innerHTML = '';
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

function displayFileInfoWeb(file, spanEl, zoneEl) {
  if (!file) {
    spanEl.style.display = 'none';
    zoneEl.classList.remove('active');
    return;
  }
  const mb = (file.size / (1024 * 1024)).toFixed(2);
  const isWarning = file.size > LARGE_BYTES;
  spanEl.className = isWarning ? 'file-info warning' : 'file-info';
  const icon = isWarning ? '⚠️' : '✓';
  spanEl.innerHTML = `<span class="file-info-icon">${icon}</span><span>${escapeHtml(file.name)} • ${mb}MB</span>`;
  spanEl.style.display = 'flex';
  zoneEl.classList.add('active');
}

function setupZone(zone, input, span) {
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  input.addEventListener('change', () => {
    displayFileInfoWeb(input.files[0], span, zone);
  });

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
  });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) {
      try {
        const dt = new DataTransfer();
        dt.items.add(f);
        input.files = dt.files;
      } catch {
        return;
      }
      displayFileInfoWeb(f, span, zone);
    }
  });
}

function safeName(name) {
  return String(name || 'file').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 120);
}

document.addEventListener('DOMContentLoaded', () => {
  const file1Input = document.getElementById('file1Input');
  const file2Input = document.getElementById('file2Input');
  const file1Zone = document.getElementById('file1Zone');
  const file2Zone = document.getElementById('file2Zone');
  const file1Span = document.getElementById('file1');
  const file2Span = document.getElementById('file2');
  const compare = document.getElementById('compare');
  const statusDiv = document.getElementById('status');
  const progressDiv = document.getElementById('progress');
  const resultsCard = document.getElementById('resultsCard');
  const resultArea = document.getElementById('result');
  const downloadBtn = document.getElementById('downloadBtn');
  const copyBtn = document.getElementById('copyBtn');
  const clearBtn = document.getElementById('clearBtn');
  const changeCount = document.getElementById('changeCount');
  const addedCount = document.getElementById('addedCount');
  const removedCount = document.getElementById('removedCount');
  const summaryPanel = document.getElementById('summaryPanel');
  const similarityStat = document.getElementById('similarityStat');
  const mutualCount = document.getElementById('mutualCount');
  const statLabelSecond = document.getElementById('statLabelSecond');
  const statLabelFirst = document.getElementById('statLabelFirst');
  const diffLegend = document.getElementById('diffLegend');

  let lastMeta = null;

  setupZone(file1Zone, file1Input, file1Span);
  setupZone(file2Zone, file2Input, file2Span);

  compare.addEventListener('click', async () => {
    const a = file1Input.files[0];
    const b = file2Input.files[0];
    if (!a || !b) {
      statusDiv.textContent = '⚠️ Please select both files';
      return;
    }

    compare.disabled = true;
    statusDiv.textContent = '⏳ Analyzing documents...';
    progressDiv.style.display = 'block';
    resultsCard.classList.remove('active');
    lastMeta = null;

    try {
      const fd = new FormData();
      fd.append('file1', a, a.name);
      fd.append('file2', b, b.name);
      const r = await fetch('/api/compare', { method: 'POST', body: fd });
      const response = await r.json();
      if (!r.ok) {
        throw new Error(response.error || r.statusText || 'Request failed');
      }

      const diffData = response.diff;
      lastMeta = response.meta || null;

      if (summaryPanel) {
        if (lastMeta) {
          summaryPanel.hidden = false;
          const lead = lastMeta.plainEnglish || 'Here is how the two files compare.';
          const sub = lastMeta.plainEnglishSub || 'Scroll down to see highlighted differences.';
          const extra =
            lastMeta.bullets && lastMeta.bullets.length
              ? `<ul class="summary-bullets">${lastMeta.bullets.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`
              : '';
          summaryPanel.innerHTML = `
            <div class="plain-english-box">
              <p class="plain-english-lead">${escapeHtml(lead)}</p>
              <p class="plain-english-sub">${escapeHtml(sub)}</p>
            </div>
            ${extra}
          `;
        } else {
          summaryPanel.hidden = true;
          summaryPanel.innerHTML = '';
        }
      }

      if (lastMeta && statLabelSecond && statLabelFirst) {
        statLabelSecond.textContent = `Only in: ${shortFileName(lastMeta.file2Label)}`;
        statLabelFirst.textContent = `Only in: ${shortFileName(lastMeta.file1Label)}`;
        if (diffLegend) diffLegend.innerHTML = buildDiffLegendHtml(lastMeta);
      } else {
        if (statLabelSecond) statLabelSecond.textContent = DEFAULT_LABEL_SECOND;
        if (statLabelFirst) statLabelFirst.textContent = DEFAULT_LABEL_FIRST;
        if (diffLegend) diffLegend.innerHTML = '';
      }

      if (similarityStat) {
        similarityStat.textContent =
          lastMeta && typeof lastMeta.similarityPct === 'number' ? `~${lastMeta.similarityPct}%` : '—';
      }
      if (mutualCount) {
        mutualCount.textContent =
          lastMeta && typeof lastMeta.mutualLines === 'number' ? String(lastMeta.mutualLines) : '—';
      }

      let added = 0;
      let removed = 0;
      diffData.forEach((part) => {
        const n = countLogicalLines(part.value);
        if (part.added) added += n;
        if (part.removed) removed += n;
      });

      const name1 = a.name || 'Document 1';
      const name2 = b.name || 'Document 2';
      renderDiffSections(diffData, name1, name2, resultArea);

      changeCount.textContent = added + removed;
      addedCount.textContent = added;
      removedCount.textContent = removed;

      const hasError = diffData.some(
        (p) => typeof p.value === 'string' && p.value.startsWith('Error:')
      );
      statusDiv.textContent = hasError
        ? '❌ Could not complete comparison — see message below.'
        : '✅ Analysis complete!';
      resultsCard.classList.add('active');
      setTimeout(() => {
        resultsCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 200);
    } catch (err) {
      resultArea.innerHTML = '';
      const span = document.createElement('span');
      span.className = 'diff-error';
      span.textContent = `Error: ${err.message}`;
      resultArea.appendChild(span);
      statusDiv.textContent = '❌ Error during comparison';
      summaryPanel.hidden = true;
      summaryPanel.innerHTML = '';
      resultsCard.classList.add('active');
    } finally {
      compare.disabled = false;
      progressDiv.style.display = 'none';
    }
  });

  downloadBtn.addEventListener('click', () => {
    try {
      const a = file1Input.files[0];
      const b = file2Input.files[0];
      if (!a || !b) {
        statusDiv.textContent = '⚠️ Run a comparison with two files before downloading.';
        return;
      }
      const filename1 = a.name;
      const filename2 = b.name;

      let report = `DOCUMENT COMPARISON AUDIT REPORT\n`;
      report += `================================================\n`;
      report += `Generated: ${new Date().toLocaleString()}\n`;
      report += `Source 1:  ${filename1}\n`;
      report += `Source 2:  ${filename2}\n`;
      report += `================================================\n\n`;

      report += `SUMMARY OF CHANGES\n`;
      report += `------------------------------------------------\n`;
      report += `Lines that don’t match (total): ${changeCount.textContent}\n`;
      report += `Lines only in second file: ${addedCount.textContent}\n`;
      report += `Lines only in first file:  ${removedCount.textContent}\n`;
      if (lastMeta) {
        report += `Lines that match in both: ${mutualCount && mutualCount.textContent !== '—' ? mutualCount.textContent : '—'}\n`;
        report += `Roughly how much is the same: ~${lastMeta.similarityPct}%\n`;
        report += `\nPLAIN ENGLISH\n`;
        report += `------------------------------------------------\n`;
        if (lastMeta.plainEnglish) report += `${lastMeta.plainEnglish}\n\n`;
        if (lastMeta.plainEnglishSub) report += `${lastMeta.plainEnglishSub}\n\n`;
        if (lastMeta.bullets && lastMeta.bullets.length) {
          report += `Extra notes:\n`;
          lastMeta.bullets.forEach((x) => {
            report += `• ${x}\n`;
          });
          report += `\n`;
        }
      }
      report += `------------------------------------------------\n\n`;

      report += `DETAILED LOG (THREE SECTIONS)\n`;
      report += `Line tags: [2] = only second file, [1] = only first file, [=] = both files, […] = long match shortened, [!] = error\n`;
      report += `------------------------------------------------\n\n`;

      const sections = resultArea.querySelectorAll('.diff-section');
      if (sections.length) {
        sections.forEach((sec) => {
          const heading = sec.querySelector('.diff-section-heading');
          const intro = sec.querySelector('.diff-section-intro');
          if (heading) report += `${heading.textContent}\n`;
          if (intro) report += `${intro.textContent}\n\n`;
          sec.querySelectorAll('.diff-section-body span').forEach((seg) => {
            const prefix =
              seg.className === 'diff-added'
                ? '[2] '
                : seg.className === 'diff-removed'
                  ? '[1] '
                  : seg.className === 'diff-mutual'
                    ? '[=] '
                    : seg.className === 'diff-error'
                      ? '[!] '
                      : seg.className === 'diff-omitted'
                        ? '[…] '
                        : '    ';
            report += `${prefix}${seg.textContent}\n`;
          });
          report += `\n`;
        });
      } else {
        resultArea.querySelectorAll('span').forEach((seg) => {
          const prefix =
            seg.className === 'diff-added'
              ? '[2] '
              : seg.className === 'diff-removed'
                ? '[1] '
                : seg.className === 'diff-mutual'
                  ? '[=] '
                  : seg.className === 'diff-error'
                    ? '[!] '
                    : seg.className === 'diff-omitted'
                      ? '[…] '
                      : '    ';
          report += `${prefix}${seg.textContent}\n`;
        });
      }

      const blob = new Blob([report], { type: 'text/plain' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Report_${safeName(filename1)}_vs_${safeName(filename2)}.txt`;
      link.click();
      URL.revokeObjectURL(link.href);
      statusDiv.textContent = '📥 Audit report saved!';
    } catch (err) {
      console.error(err);
    }
  });

  copyBtn.addEventListener('click', async () => {
    try {
      const summaryText =
        summaryPanel && !summaryPanel.hidden ? summaryPanel.innerText.trim() : '';
      const bodyText = resultArea.innerText.trim();
      const content = [summaryText, bodyText].filter(Boolean).join('\n\n──────────\n\n');
      if (!content.trim()) {
        statusDiv.textContent = '⚠️ Nothing to copy yet — compare two files first.';
        return;
      }
      await navigator.clipboard.writeText(content);
      statusDiv.textContent = '📋 Copied to clipboard!';
      setTimeout(() => {
        statusDiv.textContent = '';
      }, 2000);
    } catch (err) {
      statusDiv.textContent = '❌ Copy failed — try selecting the text manually.';
    }
  });

  clearBtn.addEventListener('click', () => {
    file1Input.value = '';
    file2Input.value = '';
    file1Span.style.display = 'none';
    file2Span.style.display = 'none';
    file1Zone.classList.remove('active');
    file2Zone.classList.remove('active');
    resultArea.innerHTML = '';
    lastMeta = null;
    summaryPanel.hidden = true;
    summaryPanel.innerHTML = '';
    if (similarityStat) similarityStat.textContent = '—';
    if (mutualCount) mutualCount.textContent = '—';
    if (statLabelSecond) statLabelSecond.textContent = DEFAULT_LABEL_SECOND;
    if (statLabelFirst) statLabelFirst.textContent = DEFAULT_LABEL_FIRST;
    if (diffLegend) diffLegend.innerHTML = '';
    statusDiv.textContent = '';
    resultsCard.classList.remove('active');
    changeCount.textContent = '0';
    addedCount.textContent = '0';
    removedCount.textContent = '0';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});
