const fs = require('fs');
['search.js', 'profile.js'].forEach(file => {
    let code = fs.readFileSync(file, 'utf8');
    const lines = code.split('\n');
    console.log(`\n--- ${file} ---`);
    lines.forEach((l, i) => {
        if(l.includes('post-detail-modal')) console.log('Line ' + i + ': ' + l.trim());
    });
});
