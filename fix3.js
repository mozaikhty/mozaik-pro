const fs = require('fs');

let content = fs.readFileSync('feed.html', 'utf8');

const replacements = [
    [/âš™ï¸ /g, '⚙️'],
    [/ğŸ“ /g, '📍'], // Will catch all ğŸ“ 
    [/ğŸ–¼ï¸ /g, '🖼️'],
    [/ğŸ” /g, '🔍'],
    [/ğŸ˜ /g, '😍'],
    [/ğŸ‘ /g, '👏'],
    [/âœˆï¸ /g, '✈️'],
    [/ğŸ¤ /g, '🤝'],
    [/ğŸ‘ ï¸ /g, '👁️'],
    [/ğŸ—‘ï¸ /g, '🗑️'],
    [/ğŸŒ /g, '🌍'],
    [/ğŸ“ž/g, '📞'],
    [/ğŸ“Œ/g, '📌'],
    [/ğŸ“·/g, '📷'],
    [/ğŸ“¸/g, '📸'],
    [/ğŸ“µ/g, '🎥'],
    [/ğŸ“´/g, '📼']
];

replacements.forEach(([regex, replacement]) => {
    content = content.replace(regex, replacement);
});

// Since ğŸ“  is ambiguous between 📍 and 📌 (usually it's 📍 if location), I replaced all with 📍. But wait!
// Line 226: Seç (image icon?) usually 🖼️ or 📷. The text says "Seç". Let's use 🖼️.
content = content.replace(/📍 Seç/g, '🖼️ Seç');
content = content.replace(/📍 <span/g, '📍 <span'); // This is location preview, so 📍 is correct.

fs.writeFileSync('feed.html', content, 'utf8');
console.log('Fixed feed.html emojis');
