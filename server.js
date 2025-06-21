const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

// 1️⃣ Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// 2️⃣ Route "/" to index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Existing /stream endpoint for scraping
app.get('/stream', (req, res) => {
  // ... your existing code ...
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
