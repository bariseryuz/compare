/**
 * DocCompare web UI — POST /api/analyze (prompt + files).
 */
const MAX_ANALYZE_FILES = 45;

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

function safeName(name) {
  return String(name || 'file').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 120);
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

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const analyzeFilesInput  = document.getElementById('analyzeFilesInput');
  const analyzeFolderInput = document.getElementById('analyzeFolderInput');
  const analyzeUploadZone  = document.getElementById('analyzeUploadZone');
  const analyzeZoneActions = document.getElementById('analyzeZoneActions');
  const analyzePickFiles   = document.getElementById('analyzePickFiles');
  const analyzePickFolder  = document.getElementById('analyzePickFolder');
  const analyzeClearFiles  = document.getElementById('analyzeClearFiles');
  const analyzeFileSummary = document.getElementById('analyzeFileSummary');
  const analyzePrompt      = document.getElementById('analyzePrompt');
  const analyzeBtn         = document.getElementById('analyzeBtn');
  const analyzeStatus      = document.getElementById('analyzeStatus');
  const statusDiv          = document.getElementById('status');
  const progressDiv        = document.getElementById('progress');
  const resultsCard        = document.getElementById('resultsCard');
  const resultArea         = document.getElementById('result');
  const resultsTitleText   = document.getElementById('resultsTitleText');
  const summaryPanel       = document.getElementById('summaryPanel');
  const downloadBtn        = document.getElementById('downloadBtn');
  const copyBtn            = document.getElementById('copyBtn');
  const clearBtn           = document.getElementById('clearBtn');

  let analyzeFileList = [];
  let lastMeta = null;
  let lastPrompt = '';

  // ── File list helpers ──────────────────────────────────────────────────────
  function updateSummary() {
    if (!analyzeFileSummary) return;
    if (!analyzeFileList.length) {
      analyzeFileSummary.textContent = 'No files in your list yet.';
      if (analyzeUploadZone) analyzeUploadZone.classList.remove('active');
      return;
    }
    const names = analyzeFileList.map((f) => f.webkitRelativePath || f.name);
    const preview = names.slice(0, 6).join(', ');
    analyzeFileSummary.textContent =
      `${analyzeFileList.length} file(s): ${preview}${names.length > 6 ? ' …' : ''}`;
    if (analyzeUploadZone) analyzeUploadZone.classList.add('active');
  }

  function addFiles(fileList) {
    for (const f of Array.from(fileList || [])) {
      if (analyzeFileList.length >= MAX_ANALYZE_FILES) break;
      analyzeFileList.push(f);
    }
    if (analyzeFileList.length >= MAX_ANALYZE_FILES && analyzeStatus) {
      analyzeStatus.textContent = `Using first ${MAX_ANALYZE_FILES} files only.`;
    }
    updateSummary();
  }

  // ── Upload zone: click body → file picker (not folder picker) ─────────────
  if (analyzeUploadZone) {
    analyzeUploadZone.addEventListener('click', (e) => {
      // Ignore clicks on the action buttons inside the zone
      if (analyzeZoneActions && analyzeZoneActions.contains(e.target)) return;
      analyzeFilesInput.click();
    });
    analyzeUploadZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        analyzeFilesInput.click();
      }
    });
    analyzeUploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      analyzeUploadZone.classList.add('dragover');
    });
    analyzeUploadZone.addEventListener('dragleave', () => {
      analyzeUploadZone.classList.remove('dragover');
    });
    analyzeUploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      analyzeUploadZone.classList.remove('dragover');
      if (e.dataTransfer && e.dataTransfer.files.length) {
        addFiles(e.dataTransfer.files);
      }
    });
  }

  // ── Buttons inside zone ────────────────────────────────────────────────────
  if (analyzePickFiles) {
    analyzePickFiles.addEventListener('click', (e) => {
      e.stopPropagation();
      analyzeFilesInput.click();
    });
  }
  if (analyzePickFolder) {
    analyzePickFolder.addEventListener('click', (e) => {
      e.stopPropagation();
      analyzeFolderInput.click();
    });
  }
  if (analyzeClearFiles) {
    analyzeClearFiles.addEventListener('click', (e) => {
      e.stopPropagation();
      analyzeFileList = [];
      updateSummary();
      if (analyzeStatus) analyzeStatus.textContent = '';
    });
  }

  // ── Hidden input change handlers ───────────────────────────────────────────
  if (analyzeFilesInput) {
    analyzeFilesInput.addEventListener('change', (e) => {
      addFiles(e.target.files);
      e.target.value = '';
    });
  }
  if (analyzeFolderInput) {
    analyzeFolderInput.addEventListener('change', (e) => {
      addFiles(e.target.files);
      e.target.value = '';
    });
  }

  // ── AI submit ──────────────────────────────────────────────────────────────
  async function runSearch() {
    if (!analyzeBtn || analyzeBtn.disabled) return;
    const prompt = (analyzePrompt && analyzePrompt.value) || '';
    if (!prompt.trim()) {
      if (analyzeStatus) analyzeStatus.textContent = '⚠️ Enter your question or instructions.';
      return;
    }
    if (!analyzeFileList.length) {
      if (analyzeStatus) analyzeStatus.textContent = '⚠️ Add at least one file first.';
      return;
    }

    analyzeBtn.disabled = true;
    if (analyzeStatus) analyzeStatus.textContent = '';
    if (statusDiv) statusDiv.textContent = '';
    if (progressDiv) progressDiv.style.display = 'block';
    resultsCard.classList.remove('active');
    lastMeta = null;
    lastPrompt = prompt.trim();

    try {
      const fd = new FormData();
      fd.append('prompt', lastPrompt);
      for (const f of analyzeFileList) {
        fd.append('documents', f, f.webkitRelativePath || f.name);
      }

      const r = await fetch('/api/analyze', { method: 'POST', body: fd });
      const response = await r.json();
      if (!r.ok) throw new Error(response.error || r.statusText || 'Request failed');

      lastMeta = response.meta || null;
      const diffData = response.diff || [];
      const body =
        Array.isArray(diffData) && diffData[0] && typeof diffData[0].value === 'string'
          ? diffData[0].value
          : '';

      resultsCard.classList.add('results-section--analyze');
      if (resultsTitleText) resultsTitleText.textContent = 'AI response';
      if (summaryPanel) { summaryPanel.hidden = true; summaryPanel.innerHTML = ''; }

      renderAiExchange(resultArea, {
        promptText: lastPrompt,
        responseText: body,
        contextLabel: `${analyzeFileList.length} file(s) sent`
      });

      const hasError = typeof body === 'string' && body.startsWith('Error:');
      if (analyzeStatus) analyzeStatus.textContent = hasError ? '❌ See message below.' : '✅ Done.';
      if (statusDiv) statusDiv.textContent = hasError ? '❌ Analysis failed.' : '';
      resultsCard.classList.add('active');
      setTimeout(() => resultsCard.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);

    } catch (err) {
      resultArea.innerHTML = '';
      const span = document.createElement('span');
      span.className = 'diff-error';
      span.textContent = `Error: ${err.message}`;
      resultArea.appendChild(span);
      if (analyzeStatus) analyzeStatus.textContent = '❌ Request failed.';
      if (statusDiv) statusDiv.textContent = '';
      resultsCard.classList.add('active');
    } finally {
      analyzeBtn.disabled = false;
      if (progressDiv) progressDiv.style.display = 'none';
    }
  }

  if (analyzeBtn) analyzeBtn.addEventListener('click', runSearch);
  if (analyzePrompt) {
    analyzePrompt.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (e.metaKey || e.ctrlKey || !e.shiftKey) {
        e.preventDefault();
        runSearch();
      }
    });
  }

  // ── Download ───────────────────────────────────────────────────────────────
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      try {
        const outPre = resultArea.querySelector('.ai-output');
        if (!outPre || !outPre.textContent.trim()) {
          if (statusDiv) statusDiv.textContent = '⚠️ Run an analysis first.';
          return;
        }
        const reqPre = resultArea.querySelector('.ai-prompt-display');
        const ctxEl  = resultArea.querySelector('.ai-exchange-context');
        let report = `AI REPORT\n================================================\nGenerated: ${new Date().toLocaleString()}\n================================================\n\n`;
        if (reqPre && reqPre.textContent.trim()) {
          report += `YOUR REQUEST\n------------------------------------------------\n${reqPre.textContent}\n\n`;
        }
        if (ctxEl && ctxEl.textContent.trim()) report += `${ctxEl.textContent}\n\n`;
        report += `RESPONSE\n------------------------------------------------\n${outPre.textContent}\n`;
        if (lastMeta && lastMeta.bullets && lastMeta.bullets.length) {
          report += `\nNotes:\n`;
          lastMeta.bullets.forEach((x) => { report += `• ${x}\n`; });
        }
        const blob = new Blob([report], { type: 'text/plain' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `AI_Analysis_${new Date().toISOString().slice(0, 10)}.txt`;
        link.click();
        URL.revokeObjectURL(link.href);
        if (statusDiv) statusDiv.textContent = '📥 Report saved!';
      } catch (err) { console.error(err); }
    });
  }

  // ── Copy ───────────────────────────────────────────────────────────────────
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        const text = resultArea.innerText.trim();
        if (!text) { if (statusDiv) statusDiv.textContent = '⚠️ Nothing to copy yet.'; return; }
        await navigator.clipboard.writeText(text);
        if (statusDiv) statusDiv.textContent = '📋 Copied!';
        setTimeout(() => { if (statusDiv) statusDiv.textContent = ''; }, 2000);
      } catch { if (statusDiv) statusDiv.textContent = '❌ Copy failed.'; }
    });
  }

  // ── Clear ──────────────────────────────────────────────────────────────────
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      analyzeFileList = [];
      updateSummary();
      if (analyzePrompt) analyzePrompt.value = '';
      if (analyzeStatus) analyzeStatus.textContent = '';
      if (statusDiv) statusDiv.textContent = '';
      lastMeta = null;
      lastPrompt = '';
      resultArea.innerHTML = '';
      if (summaryPanel) { summaryPanel.hidden = true; summaryPanel.innerHTML = ''; }
      resultsCard.classList.remove('active', 'results-section--analyze');
      if (resultsTitleText) resultsTitleText.textContent = 'Response';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
});
