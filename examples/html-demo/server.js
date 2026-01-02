#!/usr/bin/env node

// Simple HTTP server to serve the HTML demo
const http = require('http');
const fs = require('fs');
const path = require('path');

const port = 8080;
const demoDir = path.join(__dirname, 'html-demo');

const server = http.createServer((req, res) => {
  let filePath = path.join(demoDir, req.url === '/' ? 'index.html' : req.url);

  // Security: prevent directory traversal
  if (!filePath.startsWith(demoDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath);
    const contentType = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json'
    }[ext] || 'text/plain';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(port, () => {
  console.log(`🚀 HTML Demo server running at http://localhost:${port}`);
  console.log(`📖 Open http://localhost:${port} in your browser`);
  console.log(`🔧 Make sure the StackTrail server is running on port 4000`);
});