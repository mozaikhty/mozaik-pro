const fs = require('fs');
let code = fs.readFileSync('feed.js', 'utf8');
const lines = code.split('\n');
const idx = lines.findIndex((l, i) => i > 500 && l.includes("document.getElementById('post-detail-modal').style.display"));
console.log(lines.slice(idx - 2, idx + 2).join('\n'));
