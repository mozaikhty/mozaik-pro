const fs = require('fs');
['profile.js', 'feed.js'].forEach(file => {
    let code = fs.readFileSync(file, 'utf8');
    const lines = code.split('\n');
    const idx = lines.findIndex(l => l.includes('window.closePostDetail ='));
    console.log(`\n--- ${file} ---`);
    console.log(lines.slice(idx, idx + 8).join('\n'));
});
