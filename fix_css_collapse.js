const fs = require('fs');
let css = fs.readFileSync('style.css', 'utf8');

// Strip previous mobile header logic
css = css.replace(/\/\* MOBİL HEADER COMPACT MODE \*\/[\s\S]*/, '');

const newCSS = `/* MOBİL HEADER COMPACT MODE */
@media (max-width: 1000px) {
    /* Base transitions for collapsing */
    .header-sticky, .chat-header-main {
        transition: max-height 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), 
                    min-height 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), 
                    padding 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), 
                    opacity 0.3s ease, 
                    background 0.3s ease !important;
        overflow: hidden;
        max-height: 200px; /* Safe upper bound for normal state */
    }

    /* SCROLL DOWN: Completely collapse the header (bypasses sticky transform bugs) */
    body.h-state-down .header-sticky,
    body.h-state-down .chat-header-main {
        max-height: 0 !important;
        min-height: 0 !important;
        padding-top: 0 !important;
        padding-bottom: 0 !important;
        opacity: 0 !important;
        border: none !important;
        pointer-events: none !important;
    }

    /* Inbox specific elements collapse too */
    body.h-state-down .inbox-search-container,
    body.h-state-down #inbox-tabs {
        max-height: 0 !important;
        opacity: 0 !important;
        margin-bottom: 0 !important;
        padding-top: 0 !important;
        padding-bottom: 0 !important;
        border: none !important;
    }

    /* SCROLL UP: Expand back, but make it transparent */
    body.h-state-up .header-sticky,
    body.h-state-up .chat-header-main {
        background: transparent !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        border-bottom-color: transparent !important;
        pointer-events: none !important;
    }

    /* Hide children by fading them out */
    body.h-state-up .header-sticky .mobile-logo-text,
    body.h-state-up .header-sticky .feed-tabs:not(#inbox-tabs),
    body.h-state-up .header-sticky .search-header-box,
    body.h-state-up .header-sticky .category-pills-wrapper,
    body.h-state-up .header-sticky .header-info,
    body.h-state-up .chat-header-main .header-title,
    body.h-state-up .chat-header-main .header-icons {
        opacity: 0 !important;
        pointer-events: none !important;
        transform: translateY(-15px);
        transition: all 0.3s ease !important;
    }

    /* Keep avatar visible and interactive */
    body.h-state-up .header-sticky #mobile-avatar-header,
    body.h-state-up .chat-header-main #mobile-avatar-header,
    body.h-state-up .header-sticky .back-arrow {
        pointer-events: auto !important;
        background: rgba(226, 232, 240, 0.95) !important;
        backdrop-filter: blur(10px) !important;
        -webkit-backdrop-filter: blur(10px) !important;
        box-shadow: 0 4px 10px rgba(0,0,0,0.1) !important;
        border-radius: 8px;
        transition: all 0.3s ease !important;
    }
    
    body.dark-mode.h-state-up .header-sticky #mobile-avatar-header,
    body.dark-mode.h-state-up .chat-header-main #mobile-avatar-header,
    body.dark-mode.h-state-up .header-sticky .back-arrow {
        background: rgba(30, 41, 59, 0.95) !important;
    }
}
`;

fs.writeFileSync('style.css', css + newCSS, 'utf8');
console.log('style.css updated with collapse logic');
