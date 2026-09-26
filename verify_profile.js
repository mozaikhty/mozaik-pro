const fs = require('fs');
let code = fs.readFileSync('profile.js', 'utf8');
const lines = code.split('\n');
const idx = lines.findIndex(l => l.includes("document.getElementById('post-detail-container').innerHTML = html;"));
console.log(lines.slice(idx - 2, idx + 2).join('\n'));
