const fs = require('fs');
let css = fs.readFileSync('style.css', 'utf8');

// Remove the previously appended CSS
css = css.replace(/\/\* MOBİL HEADER COMPACT MODE \*\/[\s\S]*?(?=\/\*|$)/g, '');

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
    .header-sticky.compact .header-info,
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
    .header-sticky .header-info,
    .chat-header-main .header-title,
    .chat-header-main .header-icons {
        transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
    }

    .header-sticky.compact #mobile-avatar-header,
    .chat-header-main.compact #mobile-avatar-header,
    .header-sticky.compact .back-arrow {
        pointer-events: auto !important;
        background: rgba(226, 232, 240, 0.9) !important;
        backdrop-filter: blur(5px) !important;
        box-shadow: 0 4px 10px rgba(0,0,0,0.1) !important;
        border-radius: 8px; /* For back arrow to look like a button if it wasn't already */
    }
    
    body.dark-mode .header-sticky.compact #mobile-avatar-header,
    body.dark-mode .chat-header-main.compact #mobile-avatar-header,
    body.dark-mode .header-sticky.compact .back-arrow {
        background: rgba(30, 41, 59, 0.9) !important;
    }
}
`;

css += newCSS;
fs.writeFileSync('style.css', css, 'utf8');
console.log('Fixed CSS appended');
