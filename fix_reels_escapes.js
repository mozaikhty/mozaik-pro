const fs = require('fs');
let s = fs.readFileSync('reels.js', 'utf8');

// Replace \` with `
s = s.replace(/\\`/g, '`');
// Replace \$ with $
s = s.replace(/\\\$/g, '$');

fs.writeFileSync('reels.js', s, 'utf8');
console.log("Fixed literal backslashes in reels.js");
