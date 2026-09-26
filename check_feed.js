const fs = require('fs');
let code = fs.readFileSync('feed.js', 'utf8');
const lines = code.split('\n');
const idx = lines.findIndex(l => l.includes('document.getElementById(\'post-detail-modal\')'));
console.log(lines.slice(idx - 10, idx + 5).join('\n'));
