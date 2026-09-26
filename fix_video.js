const fs = require('fs');
let code = fs.readFileSync('feed.js', 'utf8');

// Line 456 (in openPostDetail) -> uses postId
code = code.replace(
    /let tag = m\.type === 'video' \? `<video onclick="event\.stopPropagation\(\)" src="\$\{window\.sanitizeUrl\(m\.url\)\}" controls class="([^"]+)"><\/video>`/,
    "let tag = m.type === 'video' ? `<video onclick=\"event.stopPropagation(); window.location.href='reels.html?video=${postId}'\" src=\"${window.sanitizeUrl(m.url)}\" controls class=\"$1 mz-video auto-play-video\"></video>`"
);

// Line 462 (in openPostDetail) -> uses postId
code = code.replace(
    /mediaHtmlDetail = m\.type === 'video' \? `<video onclick="event\.stopPropagation\(\)" src="\$\{window\.sanitizeUrl\(m\.url\)\}" controls class="([^"]+)"/g,
    "mediaHtmlDetail = m.type === 'video' ? `<video onclick=\"event.stopPropagation(); window.location.href='reels.html?video=${postId}'\" src=\"${window.sanitizeUrl(m.url)}\" controls class=\"$1 mz-video auto-play-video\""
);

// Line 652 (in renderFeed) -> uses post.id
code = code.replace(
    /let tag = m\.type === 'video' \? `<video onclick="event\.stopPropagation\(\)" src="\$\{window\.sanitizeUrl\(m\.url\)\}" controls class="([^"]+)"><\/video>`/g,
    "let tag = m.type === 'video' ? `<video onclick=\"event.stopPropagation(); window.location.href='reels.html?video=${post.id}'\" src=\"${window.sanitizeUrl(m.url)}\" controls class=\"$1 mz-video auto-play-video\"></video>`"
);

// Line 658 (in renderFeed) -> uses post.id
code = code.replace(
    /mediaHtml = m\.type === 'video' \? `<video onclick="event\.stopPropagation\(\)" src="\$\{window\.sanitizeUrl\(m\.url\)\}" controls class="([^"]+)"/g,
    "mediaHtml = m.type === 'video' ? `<video onclick=\"event.stopPropagation(); window.location.href='reels.html?video=${post.id}'\" src=\"${window.sanitizeUrl(m.url)}\" controls class=\"$1 mz-video auto-play-video\""
);

fs.writeFileSync('feed.js', code, 'utf8');
console.log('Modified video tags in feed.js');
