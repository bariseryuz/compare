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

runWhenDomReady(initializeApp);

function initializeApp() {
  try {
    // 1. Element Selection
    const file1Zone = document.getElementById('file1Zone');
    const file2Zone = document.getElementById('file2Zone');
    const compare = document.getElementById('compare');
    const file1Span = document.getElementById('file1');
    const file2Span = document.getElementById('file2');
    const resultArea = document.getElementById('result');
    const statusDiv = document.getElementById('status');
    const progressDiv = document.getElementById('progress');
    const resultsCard = document.getElementById('resultsCard');
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

    let file1Path = null;
    let file2Path = null;
    let lastComparisonMeta = null;

    // 2. Helper: Display File Metadata
    async function displayFileInfo(filepath, spanElement, zoneElement) {
      try {
        const fileInfo = await window.electronAPI.getFileSize(filepath);
        if (fileInfo) {
          const isWarning = fileInfo.isLarge;
          spanElement.className = isWarning ? 'file-info warning' : 'file-info';
          const icon = isWarning ? '⚠️' : '✓';
          const filename = filepath.split(/[\\/]/).pop();
          spanElement.innerHTML = `<span class="file-info-icon">${icon}</span><span>${filename} • ${fileInfo.mb}MB</span>`;
          spanElement.style.display = 'flex';
          zoneElement.classList.add('active');
        } else {
          spanElement.style.display = 'none';
        }
      } catch (err) {
        console.error('Error displaying file info:', err);
      }
    }

    // 3. Helper: Setup Select/Drag & Drop
    function setupDragDrop(zoneElement, spanElement, assignPath) {
      zoneElement.addEventListener('click', async () => {
        try {
          const path = await window.electronAPI.selectFile();
          if (path) {
            assignPath(path);
            await displayFileInfo(path, spanElement, zoneElement);
          }
        } catch (err) {
          console.error('Error selecting file:', err);
        }
      });

      zoneElement.addEventListener('dragover', (e) => {
        e.preventDefault();
        zoneElement.classList.add('dragover');
      });

      zoneElement.addEventListener('dragleave', (e) => {
        e.preventDefault();
        zoneElement.classList.remove('dragover');
      });

      zoneElement.addEventListener('drop', async (e) => {
        e.preventDefault();
        zoneElement.classList.remove('dragover');
        if (e.dataTransfer && e.dataTransfer.files.length > 0) {
          const file = e.dataTransfer.files[0];
          if (file.path) {
            if (window.electronAPI.validateFilePath) {
              const check = await window.electronAPI.validateFilePath(file.path);
              if (!check.valid) {
                const st = document.getElementById('status');
                if (st) st.textContent = `⚠️ ${check.reason || 'Invalid file.'}`;
                return;
              }
            }
            assignPath(file.path);
            await displayFileInfo(file.path, spanElement, zoneElement);
          }
        }
      });
    }

    setupDragDrop(file1Zone, file1Span, (p) => { file1Path = p; });
    setupDragDrop(file2Zone, file2Span, (p) => { file2Path = p; });

    // 4. Action: Compare Documents
    if (compare) {
      compare.addEventListener('click', async () => {
        try {
          if (!file1Path || !file2Path) {
            statusDiv.textContent = '⚠️ Please select both files';
            return;
          }
          
          compare.disabled = true;
          statusDiv.textContent = '⏳ Analyzing documents...';
          progressDiv.style.display = 'block';
          resultsCard.classList.remove('active');
          
          const response = await window.electronAPI.compareFiles(file1Path, file2Path);
          let diffData;
          lastComparisonMeta = null;
          if (Array.isArray(response)) {
            diffData = response;
          } else {
            diffData = response.diff;
            lastComparisonMeta = response.meta;
          }

          if (summaryPanel) {
            if (lastComparisonMeta) {
              summaryPanel.hidden = false;
              const lead =
                lastComparisonMeta.plainEnglish ||
                'Here is how the two files compare.';
              const sub =
                lastComparisonMeta.plainEnglishSub ||
                'Scroll down to see highlighted differences.';
              const extra =
                lastComparisonMeta.bullets && lastComparisonMeta.bullets.length
                  ? `<ul class="summary-bullets">${lastComparisonMeta.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`
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
          if (lastComparisonMeta && statLabelSecond && statLabelFirst) {
            statLabelSecond.textContent = `Only in: ${shortFileName(lastComparisonMeta.file2Label)}`;
            statLabelFirst.textContent = `Only in: ${shortFileName(lastComparisonMeta.file1Label)}`;
            if (diffLegend) diffLegend.innerHTML = buildDiffLegendHtml(lastComparisonMeta);
          } else {
            if (statLabelSecond) statLabelSecond.textContent = DEFAULT_LABEL_SECOND;
            if (statLabelFirst) statLabelFirst.textContent = DEFAULT_LABEL_FIRST;
            if (diffLegend) diffLegend.innerHTML = '';
          }
          if (similarityStat) {
            similarityStat.textContent =
              lastComparisonMeta && typeof lastComparisonMeta.similarityPct === 'number'
                ? `~${lastComparisonMeta.similarityPct}%`
                : '—';
          }
          if (mutualCount) {
            mutualCount.textContent =
              lastComparisonMeta && typeof lastComparisonMeta.mutualLines === 'number'
                ? String(lastComparisonMeta.mutualLines)
                : '—';
          }

          let added = 0;
          let removed = 0;

          diffData.forEach((part) => {
            const n = countLogicalLines(part.value);
            if (part.added) added += n;
            if (part.removed) removed += n;
          });

          renderDiffSections(diffData, file1Path, file2Path, resultArea);
          
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
          }, 300);

        } catch (err) {
          resultArea.textContent = `Error: ${err.message}`;
          statusDiv.textContent = '❌ Error during comparison';
        } finally {
          compare.disabled = false;
          progressDiv.style.display = 'none';
        }
      });
    }

    // 5. Action: Download Professional Report (The "Correct Format")
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        try {
          if (!file1Path || !file2Path) {
            statusDiv.textContent = '⚠️ Run a comparison with two files before downloading.';
            return;
          }
          const filename1 = file1Path.split(/[\\/]/).pop();
          const filename2 = file2Path.split(/[\\/]/).pop();
          
          // Constructing a professional plain-text report
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
          if (lastComparisonMeta) {
            report += `Lines that match in both: ${mutualCount && mutualCount.textContent !== '—' ? mutualCount.textContent : '—'}\n`;
            report += `Roughly how much is the same: ~${lastComparisonMeta.similarityPct}%\n`;
            report += `\nPLAIN ENGLISH\n`;
            report += `------------------------------------------------\n`;
            if (lastComparisonMeta.plainEnglish) {
              report += `${lastComparisonMeta.plainEnglish}\n\n`;
            }
            if (lastComparisonMeta.plainEnglishSub) {
              report += `${lastComparisonMeta.plainEnglishSub}\n\n`;
            }
            if (lastComparisonMeta.bullets && lastComparisonMeta.bullets.length) {
              report += `Extra notes:\n`;
              lastComparisonMeta.bullets.forEach((b) => {
                report += `• ${b}\n`;
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

          const safeName = (name) =>
            String(name || 'file').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 120);

          const blob = new Blob([report], { type: 'text/plain' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = `Report_${safeName(filename1)}_vs_${safeName(filename2)}.txt`;
          link.click();
          URL.revokeObjectURL(link.href);
          
          statusDiv.textContent = '📥 Audit report saved!';
        } catch (err) {
          console.error('Download failed:', err);
        }
      });
    }

    // 6. Action: Copy Results
    if (copyBtn) {
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
          setTimeout(() => { statusDiv.textContent = ''; }, 2000);
        } catch (err) {
          console.error('Copy failed:', err);
          statusDiv.textContent = '❌ Copy failed — try selecting the text manually.';
        }
      });
    }

    // 7. Action: New Comparison (Clear)
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        file1Path = null;
        file2Path = null;
        file1Span.style.display = 'none';
        file2Span.style.display = 'none';
        file1Zone.classList.remove('active');
        file2Zone.classList.remove('active');
        resultArea.innerHTML = '';
        lastComparisonMeta = null;
        if (summaryPanel) {
          summaryPanel.hidden = true;
          summaryPanel.innerHTML = '';
        }
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
    }

  } catch (err) {
    console.error('Fatal initialization error:', err);
  }
}