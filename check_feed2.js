const fs = require('fs');
let code = fs.readFileSync('feed.js', 'utf8');
const lines = code.split('\n');
const startIdx = lines.findIndex(l => l.includes('window.openPostDetail ='));
console.log(lines.slice(startIdx + 50, startIdx + 80).join('\n'));
