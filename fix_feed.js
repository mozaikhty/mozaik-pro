const fs = require('fs');
let code = fs.readFileSync('feed.js', 'utf8');

// Replace in carousel
code = code.replace(
    /`\<div class="mt-3"\>` \+ window\.renderCustomVideo\(window\.sanitizeUrl\(m\.url\), '', postId \+ '-' \+ idx, postId\) \+ `\<\/div\>`/g,
    '`<video controls playsinline onclick="event.stopPropagation()" src="${window.sanitizeUrl(m.url)}" class="w-full max-h-[60vh] rounded-xl object-contain"></video>`'
);

// Replace in single item
code = code.replace(
    /`\<div class="mt-3"\>` \+ window\.renderCustomVideo\(window\.sanitizeUrl\(m\.url\), '', postId, postId\) \+ `\<\/div\>`/g,
    '`<video controls playsinline onclick="event.stopPropagation()" src="${window.sanitizeUrl(m.url)}" class="w-full max-h-[60vh] rounded-xl object-contain mb-4"></video>`'
);

fs.writeFileSync('feed.js', code, 'utf8');
console.log('Fixed feed.js');
