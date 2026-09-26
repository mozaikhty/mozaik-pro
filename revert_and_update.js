const fs = require('fs');

['feed.js', 'search.js', 'profile.js'].forEach(file => {
    try {
        let code = fs.readFileSync(file, 'utf8');

        // Revert native video to renderCustomVideo in openPostDetail
        code = code.replace(
            /\`<video controls playsinline onclick="event\.stopPropagation\(\)" src="\$\{window\.sanitizeUrl\(m\.url\)\}" class="w-full max-h-\[60vh\] rounded-xl object-contain"\><\/video>\`/g,
            '`<div class="mt-3">` + window.renderCustomVideo(window.sanitizeUrl(m.url), "", "modal-" + Math.random().toString(36).substr(2,9), postId) + `</div>`'
        );

        code = code.replace(
            /\`<video controls playsinline onclick="event\.stopPropagation\(\)" src="\$\{window\.sanitizeUrl\(m\.url\)\}" class="w-full max-h-\[60vh\] rounded-xl object-contain mb-4"\><\/video>\`/g,
            '`<div class="mt-3">` + window.renderCustomVideo(window.sanitizeUrl(m.url), "", "modal-" + Math.random().toString(36).substr(2,9), postId) + `</div>`'
        );

        code = code.replace(
            /\`<video controls playsinline onclick="event\.stopPropagation\(\)" src="\$\{window\.sanitizeUrl\(m\.url\)\}" style="width:100%; max-height:60vh; border-radius:8px; object-fit:contain;"\><\/video>\`/g,
            '`<div class="mt-3">` + window.renderCustomVideo(window.sanitizeUrl(m.url), "", "modal-" + Math.random().toString(36).substr(2,9), postId) + `</div>`'
        );

        // Replace observeVideos with observeModalVideos in openPostDetail
        code = code.replace(/window\.initVideoPlayers\?\.\(\);\s*window\.observeVideos\?\.\(\);/g, 'window.initVideoPlayers?.(); window.observeModalVideos?.();');

        fs.writeFileSync(file, code, 'utf8');
        console.log(`Reverted and updated ${file}`);
    } catch (err) {
        console.error(err);
    }
});
