const fs = require('fs');
let css = fs.readFileSync('style.css', 'utf8');

// Strip all previous attempts
css = css.replace(/\/\* MOBİL HEADER COMPACT MODE \*\/[\s\S]*/, '');

const newCSS = `/* MOBİL HEADER COMPACT MODE */
@media (max-width: 1000px) {
    body.h-state-down .header-sticky,
    body.h-state-down .chat-header-main {
        transform: translateY(-120%) !important;
        opacity: 0 !important;
        pointer-events: none !important;
    }

    body.h-state-down .inbox-search-container,
    body.h-state-down #inbox-tabs {
        max-height: 0 !important;
        opacity: 0 !important;
        margin-bottom: 0 !important;
        padding-top: 0 !important;
        padding-bottom: 0 !important;
        border: none !important;
    }

    body.h-state-up .header-sticky,
    body.h-state-up .chat-header-main {
        transform: translateY(0) !important;
        background: transparent !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        border-bottom-color: transparent !important;
        pointer-events: none !important;
    }

    body.h-state-up .header-sticky .mobile-logo-text,
    body.h-state-up .header-sticky .feed-tabs:not(#inbox-tabs),
    body.h-state-up .header-sticky .search-header-box,
    body.h-state-up .header-sticky .category-pills-wrapper,
    body.h-state-up .header-sticky .header-info,
    body.h-state-up .chat-header-main .header-title,
    body.h-state-up .chat-header-main .header-icons {
        opacity: 0 !important;
        pointer-events: none !important;
        transform: translateY(-15px) !important;
    }

    body.h-state-up .header-sticky #mobile-avatar-header,
    body.h-state-up .chat-header-main #mobile-avatar-header,
    body.h-state-up .header-sticky .back-arrow {
        pointer-events: auto !important;
        background: rgba(226, 232, 240, 0.95) !important;
        backdrop-filter: blur(10px) !important;
        -webkit-backdrop-filter: blur(10px) !important;
        box-shadow: 0 4px 10px rgba(0,0,0,0.1) !important;
        border-radius: 8px;
    }
    
    body.dark-mode.h-state-up .header-sticky #mobile-avatar-header,
    body.dark-mode.h-state-up .chat-header-main #mobile-avatar-header,
    body.dark-mode.h-state-up .header-sticky .back-arrow {
        background: rgba(30, 41, 59, 0.95) !important;
    }
}
`;

fs.writeFileSync('style.css', css + newCSS, 'utf8');
console.log('style.css updated with clean logic');
