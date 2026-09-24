const fs = require('fs');
let content = fs.readFileSync('feed.html', 'utf8');

// The exact strings are present in these lines:
// Line 43: âš™ï¸  (Gear)
content = content.replace(content.match(/(<a href=\"#\" class=\"sidebar-bottom-item\" onclick=\"window.openSettingsModal\(\)\">)(.*?)( Ayarlar)/)[2], '⚙️');

// Line 73, 79, 284: ğŸ“  (Location Pin)
const locMatch = content.match(/(<div class=\"icon-btn\" title=\"Konum\" onclick=\"window.addLocation\(false\)\">)(.*?)(<\/div>)/);
if(locMatch) content = content.replace(new RegExp(locMatch[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '📍');

// Line 78, 283: ğŸ–¼ï¸  (Media)
const mediaMatch = content.match(/(<label for=\"image-input\" class=\"icon-btn\" title=\"Medya\">)(.*?)(<\/label>)/);
if (mediaMatch) content = content.replace(new RegExp(mediaMatch[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '🖼️');

// Line 97: ğŸ”  (Search)
const searchMatch = content.match(/(<span>)(.*?)(<\/span>\s*<\/div>\s*<\/div>\s*<div class=\"who-to-follow\">)/);
if(searchMatch) content = content.replace(new RegExp(searchMatch[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '🔍');

// Line 147: ğŸ˜  (Heart Eyes)
const rxMatches = content.match(/window\.sendQuickReaction\('([^']+)'\)/g);
if(rxMatches) {
    const emoji1 = rxMatches[0].match(/'([^']+)'/)[1];
    content = content.replace(new RegExp(emoji1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '😍');
    
    // Line 150: ğŸ‘  (Clap)
    const emoji2 = rxMatches[1].match(/'([^']+)'/)[1];
    content = content.replace(new RegExp(emoji2.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '👏');
}

// Line 155: âœˆï¸  (Send)
const sendMatch = content.match(/(<button class=\"story-action-btn\" onclick=\"window.sendStoryReply\(\)\" title=\"Gönder\" style=\"font-size: 20px;\">)(.*?)(<\/button>)/);
if(sendMatch) content = content.replace(new RegExp(sendMatch[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '✈️');

// Line 156: ğŸ¤  (Handshake/Like)
const likeMatch = content.match(/(title=\"Hikayeyi Beğen\">)(.*?)(<\/button>)/);
if(likeMatch) content = content.replace(new RegExp(likeMatch[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '🤍');

// Line 163: ğŸ‘ ï¸  (Eye)
const eyeMatch = content.match(/(<div class=\"story-viewers-btn\" onclick=\"window.showStoryViewers\(\)\">)(.*?)( <span)/);
if(eyeMatch) content = content.replace(new RegExp(eyeMatch[2].trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '👁️');

// Line 180: ğŸ—‘ï¸  (Trash)
const trashMatch = content.match(/(width:100%;\">)(.*?)( Hikayeyi Sil)/);
if(trashMatch) content = content.replace(new RegExp(trashMatch[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '🗑️');

// Line 226: ğŸ“  (Select)
const selectMatch = content.match(/(color:#334155;\">)(.*?)( Seç)/);
if(selectMatch) content = content.replace(new RegExp(selectMatch[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '🖼️');

// Line 229: ğŸŒ  (Globe)
const globeMatch = content.match(/(<option value=\"public\">)(.*?)( Herkes)/);
if(globeMatch) content = content.replace(new RegExp(globeMatch[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '🌍');

// Line 262: ğŸ“ž (Phone)
const phoneMatch = content.match(/(id=\"accept-call-btn\">)(.*?)(<\/button>)/);
if(phoneMatch) content = content.replace(new RegExp(phoneMatch[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '📞');

// Finally, clear any stray `✖` broken bytes just in case (the close icon)
content = content.replace(/âœ–/g, '✖');

fs.writeFileSync('feed.html', content, 'utf8');
console.log('Fixed feed.html emojis dynamically');
