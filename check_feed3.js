const fs = require('fs');
let code = fs.readFileSync('feed.js', 'utf8');
const lines = code.split('\n');
const startIdx = lines.findIndex(l => l.includes('window.openPostDetail ='));
console.log(lines.slice(startIdx + 80, startIdx + 110).join('\n'));
