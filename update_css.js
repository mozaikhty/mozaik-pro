const fs = require('fs');
let css = fs.readFileSync('style.css', 'utf8');

// Remove the old CSS
css = css.replace(/\/\* MOBİL HEADER COMPACT MODE \*\/[\s\S]*?(?=\/\*|$)/g, '');

const newCSS = `/* MOBİL HEADER COMPACT MODE */
@media (max-width: 1000px) {
    /* Header transition */
    .header-sticky, .chat-header-main {
        transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), background 0.3s ease, backdrop-filter 0.3s ease, border-color 0.3s ease !important;
    }
    
    /* Elements to animate */
    .header-sticky .mobile-logo-text,
    .header-sticky .feed-tabs,
    .header-sticky .search-header-box,
    .header-sticky .category-pills-wrapper,
    .header-sticky .header-info,
    .chat-header-main .header-title,
    .chat-header-main .header-icons {
        transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
    }

    /* SCROLL DOWN */
    body.header-state-down .header-sticky,
    body.header-state-down .chat-header-main {
        transform: translateY(-100%) !important;
    }

    body.header-state-down .inbox-search-container,
    body.header-state-down #inbox-tabs {
        max-height: 0 !important;
        opacity: 0 !important;
        margin-bottom: 0 !important;
        padding-top: 0 !important;
        padding-bottom: 0 !important;
        border: none !important;
    }

    /* SCROLL UP */
    body.header-state-up .header-sticky,
    body.header-state-up .chat-header-main {
        transform: translateY(0) !important;
        background: transparent !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        border-bottom-color: transparent !important;
        pointer-events: none !important;
    }

    body.header-state-up .header-sticky .mobile-logo-text,
    body.header-state-up .header-sticky .feed-tabs:not(#inbox-tabs),
    body.header-state-up .header-sticky .search-header-box,
    body.header-state-up .header-sticky .category-pills-wrapper,
    body.header-state-up .header-sticky .header-info,
    body.header-state-up .chat-header-main .header-title,
    body.header-state-up .chat-header-main .header-icons {
        opacity: 0 !important;
        pointer-events: none !important;
        transform: translateY(-10px) !important;
    }

    body.header-state-up .header-sticky #mobile-avatar-header,
    body.header-state-up .chat-header-main #mobile-avatar-header,
    body.header-state-up .header-sticky .back-arrow {
        pointer-events: auto !important;
        background: rgba(226, 232, 240, 0.9) !important;
        backdrop-filter: blur(5px) !important;
        box-shadow: 0 4px 10px rgba(0,0,0,0.1) !important;
        border-radius: 8px;
    }
    
    body.dark-mode.header-state-up .header-sticky #mobile-avatar-header,
    body.dark-mode.header-state-up .chat-header-main #mobile-avatar-header,
    body.dark-mode.header-state-up .header-sticky .back-arrow {
        background: rgba(30, 41, 59, 0.9) !important;
    }

    /* Base for inbox containers */
    .inbox-search-container, #inbox-tabs {
        transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        max-height: 100px; 
        overflow: hidden;
    }
}
`;

css += newCSS;
fs.writeFileSync('style.css', css, 'utf8');
console.log('style.css updated for header states');
