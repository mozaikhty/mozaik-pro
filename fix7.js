const fs = require('fs');
let content = fs.readFileSync('feed.html', 'utf8');

const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
    if (i === 96 && lines[i].includes('<span>')) {
        lines[i] = '                    <span>🔍</span>';
    }
    if (i === 149 && lines[i].includes('quick-reaction')) {
        lines[i] = '            <span class="quick-reaction-btn" onclick="window.sendQuickReaction(\'👏\')">👏</span>';
    }
    if (i === 162 && lines[i].includes('Görüntüleyenler')) {
        lines[i] = '                👁️ <span id="story-view-count">0</span> Görüntüleyenler';
    }
}

fs.writeFileSync('feed.html', lines.join('\n'), 'utf8');
console.log('Fixed final emojis part 3');
