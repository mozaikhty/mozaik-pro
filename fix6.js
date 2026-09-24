const fs = require('fs');
let content = fs.readFileSync('feed.html', 'utf8');

content = content.replace(/<span>ğŸ” .*?<\/span>/g, '<span>🔍</span>');
content = content.replace(/onclick=\"window\.sendQuickReaction\('ğŸ‘ .?'\)\">ğŸ‘ .*?<\/span>/g, `onclick="window.sendQuickReaction('👏')">👏</span>`);
content = content.replace(/ğŸ‘ ï¸ .*?<span id=\"story-view-count\">/g, '👁️ <span id="story-view-count">');

fs.writeFileSync('feed.html', content, 'utf8');
console.log('Fixed final emojis part 2');
