const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const app = express();

app.use(cors());
app.use(express.json());

app.get('/stream', (req, res) => {
  const { url, timeout = '5', mode = 'email' } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // 🧠 Choose script based on mode
  const script = mode === 'domain' ? 'domain_extractor.js' : 'scraper.js';
  const args = mode === 'domain' ? [url] : [url, timeout];

  const child = spawn('node', [script, ...args]);

  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    lines.forEach(line => res.write(`data: ${line}\n\n`));
  });

  child.stderr.on('data', (err) => {
    console.error(`[${script} Error] ${err}`);
  });

  child.on('close', (code) => {
    res.write(`event: done\ndata: end\n\n`);
    res.end();
    console.log(`🔚 ${script} process exited with code ${code}`);
  });
});

app.listen(3000, () => {
  console.log('✅ Server running at http://localhost:3000');
});
