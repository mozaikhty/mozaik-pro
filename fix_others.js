const fs = require('fs');

['search.js', 'profile.js'].forEach(file => {
    try {
        let code = fs.readFileSync(file, 'utf8');

        // Replace in carousel (search.js / profile.js style)
        code = code.replace(
            /\`\$\{window\.renderCustomVideo\(window\.sanitizeUrl\(m\.url\), "", "modal-" \+ Math\.random\(\)\.toString\(36\)\.substr\(2,9\)\)\}\`/g,
            '`<video controls playsinline onclick="event.stopPropagation()" src="${window.sanitizeUrl(m.url)}" style="width:100%; max-height:60vh; border-radius:8px; object-fit:contain;"></video>`'
        );

        fs.writeFileSync(file, code, 'utf8');
        console.log(`Fixed ${file}`);
    } catch (err) {
        console.error(err);
    }
});
