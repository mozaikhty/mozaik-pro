const fs = require('fs');

let css = fs.readFileSync('style.css', 'utf8');

// Fix any mojibake in style.css just in case
css = css
    .replace(/ÅŸ/g, 'ş').replace(/Ä±/g, 'ı').replace(/Ã¼/g, 'ü').replace(/ÄŸ/g, 'ğ')
    .replace(/Ã§/g, 'ç').replace(/Ã¶/g, 'ö').replace(/Ä°/g, 'İ').replace(/Ã‡/g, 'Ç')
    .replace(/Ã–/g, 'Ö').replace(/Åž/g, 'Ş').replace(/^\uFEFF/, '');

const newCSS = `
/* MOBİL HEADER COMPACT MODE */
@media (max-width: 1000px) {
    .header-sticky, .chat-header-main {
        transition: background 0.3s ease, backdrop-filter 0.3s ease, border-color 0.3s ease !important;
    }
    
    .header-sticky.compact, .chat-header-main.compact {
        background: transparent !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        border-bottom-color: transparent !important;
        pointer-events: none !important;
    }

    .header-sticky.compact .mobile-logo-text,
    .header-sticky.compact .feed-tabs,
    .header-sticky.compact .search-header-box,
    .header-sticky.compact .category-pills-wrapper,
    .chat-header-main.compact .header-title,
    .chat-header-main.compact .header-icons {
        opacity: 0 !important;
        pointer-events: none !important;
        transform: translateY(-10px) !important;
    }

    .header-sticky .mobile-logo-text,
    .header-sticky .feed-tabs,
    .header-sticky .search-header-box,
    .header-sticky .category-pills-wrapper,
    .chat-header-main .header-title,
    .chat-header-main .header-icons {
        transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
    }

    .header-sticky.compact #mobile-avatar-header,
    .chat-header-main.compact #mobile-avatar-header {
        pointer-events: auto !important;
        background: rgba(226, 232, 240, 0.9) !important;
        backdrop-filter: blur(5px) !important;
        box-shadow: 0 4px 10px rgba(0,0,0,0.1) !important;
    }
    
    body.dark-mode .header-sticky.compact #mobile-avatar-header,
    body.dark-mode .chat-header-main.compact #mobile-avatar-header {
        background: rgba(30, 41, 59, 0.9) !important;
    }
}
`;

// Remove the one appended by PowerShell just now to avoid duplicates
css = css.replace(/\/\* MOBİL HEADER COMPACT MODE \*\/[\s\S]*?(?=\/\*|$)/g, '');
css += newCSS;

fs.writeFileSync('style.css', css, 'utf8');
console.log('Appended safely to style.css');
