const fs = require('fs');
let content = fs.readFileSync('feed.html', 'utf8');

// Line 97
content = content.replace(/<span>ğŸ” <\/span>/g, '<span>🔍</span>');

// Line 150
content = content.replace(/onclick=\"window\.sendQuickReaction\('ğŸ‘ '\)\">ğŸ‘ <\/span>/g, `onclick="window.sendQuickReaction('👏')">👏</span>`);

// Line 163
content = content.replace(/ğŸ‘ ï¸  <span id=\"story-view-count\">/g, '👁️ <span id="story-view-count">');

fs.writeFileSync('feed.html', content, 'utf8');
console.log('Fixed final emojis');
