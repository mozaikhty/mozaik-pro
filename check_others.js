const fs = require('fs');
['search.js', 'profile.js'].forEach(file => {
    let code = fs.readFileSync(file, 'utf8');
    const lines = code.split('\n');
    const idx = lines.findIndex(l => l.includes('window.openPostDetail'));
    console.log(`\n--- ${file} ---`);
    if (idx !== -1) {
        const endIdx = lines.findIndex((l, i) => i > idx + 10 && l.includes("document.getElementById('post-detail-modal').style.display"));
        if (endIdx !== -1) {
            console.log(lines.slice(endIdx - 4, endIdx + 2).join('\n'));
        } else {
            console.log('Could not find modal open line.');
        }
    } else {
        console.log('No openPostDetail function found!');
    }
});
