const fs = require('fs');

function fixMojibake(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content
        .replace(/ÅŸ/g, 'ş')
        .replace(/Ä±/g, 'ı')
        .replace(/Ã¼/g, 'ü')
        .replace(/ÄŸ/g, 'ğ')
        .replace(/Ã§/g, 'ç')
        .replace(/Ã¶/g, 'ö')
        .replace(/Ä°/g, 'İ')
        .replace(/Ã‡/g, 'Ç')
        .replace(/Ã–/g, 'Ö')
        .replace(/Åž/g, 'Ş')
        .replace(/ğŸ‘¤/g, '👤')
        .replace(/ğŸ”–/g, '🔖')
        .replace(/âš™ï¸ /g, '⚙️')
        .replace(/ğŸšª/g, '🚪')
        .replace(/âœ“/g, '✓')
        .replace(/ğŸ“ /g, '📌') // Note: there are two 📌 / 📍
        .replace(/âœ–/g, '✖')
        .replace(/ğŸ–¼ï¸ /g, '🖼️')
        .replace(/ğŸ” /g, '🔍')
        .replace(/Â©/g, '©')
        .replace(/ğŸ”‡/g, '🔇')
        .replace(/ğŸ˜‚/g, '😂')
        .replace(/ğŸ˜ /g, '😍')
        .replace(/ğŸ”¥/g, '🔥')
        .replace(/ğŸ˜¢/g, '😢')
        .replace(/ğŸ‘ /g, '👏')
        .replace(/ğŸ˜®/g, '😮')
        .replace(/âœˆï¸ /g, '✈️')
        .replace(/ğŸ¤ /g, '🤝')
        .replace(/ğŸ“¤/g, '📤')
        .replace(/ğŸ‘ ï¸ /g, '👁️')
        .replace(/ğŸ—‘ï¸ /g, '🗑️')
        .replace(/ğŸ“ /g, '📍')
        .replace(/ğŸ“¸/g, '📸')
        .replace(/ğŸŒ /g, '🌍')
        .replace(/ğŸ‘¥/g, '👥')
        .replace(/ğŸ’š/g, '💚')
        .replace(/ğŸ“ž/g, '📞')
        .replace(/ğŸ“µ/g, '🎥')
        .replace(/ğŸ“Œ/g, '📌')
        .replace(/^\uFEFF/, ''); // Remove BOM if exists
    fs.writeFileSync(filePath, content, 'utf8');
}

fixMojibake('feed.html');
fixMojibake('ui.js');
console.log('Fixed');
