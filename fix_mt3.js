const fs = require('fs');
let code = fs.readFileSync('feed.js', 'utf8');

// Replace: window.renderCustomVideo(...)
// With: `<div class="mt-3">` + window.renderCustomVideo(...) + `</div>`

code = code.replace(/window\.renderCustomVideo\(window\.sanitizeUrl\(m\.url\), '', (postId \+ '-' \+ idx|postId|post\.id \+ '-' \+ idx|post\.id), (postId|post\.id)\)/g, 
    '`<div class="mt-3">` + window.renderCustomVideo(window.sanitizeUrl(m.url), \'\', $1, $2) + `</div>`');

fs.writeFileSync('feed.js', code, 'utf8');
console.log('Added mt-3 wrapper');
