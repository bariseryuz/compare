/**
 * HTTP API for Railway / cloud hosting (no Electron — no GUI libraries required).
 * Desktop app: use `npm start` (Electron). Server: `node server.js` or `npm run start:web`.
 */
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runCompare } = require('./compare-core');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 52 * 1024 * 1024, files: 2 }
});

app.use(express.json({ limit: '2mb' }));

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'doccompare-api' });
});

app.post('/api/compare', upload.fields([{ name: 'file1', maxCount: 1 }, { name: 'file2', maxCount: 1 }]), async (req, res) => {
  const f1 = req.files?.file1?.[0];
  const f2 = req.files?.file2?.[0];
  if (!f1 || !f2) {
    return res.status(400).json({ error: 'Send multipart form with fields file1 and file2.' });
  }

  const ext1 = path.extname(f1.originalname || '') || '.bin';
  const ext2 = path.extname(f2.originalname || '') || '.bin';
  const safe1 = `doc1-${Date.now()}-${Math.random().toString(36).slice(2)}${ext1}`;
  const safe2 = `doc2-${Date.now()}-${Math.random().toString(36).slice(2)}${ext2}`;
  const p1 = path.join(os.tmpdir(), safe1.replace(/[^a-zA-Z0-9._-]/g, '_'));
  const p2 = path.join(os.tmpdir(), safe2.replace(/[^a-zA-Z0-9._-]/g, '_'));

  try {
    fs.copyFileSync(f1.path, p1);
    fs.copyFileSync(f2.path, p2);
  } catch (err) {
    try {
      fs.unlinkSync(f1.path);
    } catch {}
    try {
      fs.unlinkSync(f2.path);
    } catch {}
    return res.status(500).json({ error: `Could not stage files: ${err.message}` });
  }

  try {
    fs.unlinkSync(f1.path);
    fs.unlinkSync(f2.path);
  } catch {}

  try {
    const result = await runCompare(p1, p2);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Compare failed' });
  } finally {
    try {
      fs.unlinkSync(p1);
    } catch {}
    try {
      fs.unlinkSync(p2);
    } catch {}
  }
});

app.use('/symbols', express.static(path.join(__dirname, 'symbols')));
app.use(express.static(path.join(__dirname, 'public-web')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`DocCompare web API listening on port ${PORT}`);
});
