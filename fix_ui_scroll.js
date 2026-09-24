const fs = require('fs');

let uiJS = fs.readFileSync('ui.js', 'utf8');

// Strip old scroll logic completely
uiJS = uiJS.replace(/\/\/ --- NAV AND HEADER SCROLL BEHAVIOR ---[\s\S]*/, '');

const newLogic = `// --- NAV AND HEADER SCROLL BEHAVIOR ---
(function() {
    function initScroll() {
        let isCompact = false;
        let lastScrollY = window.scrollY || document.documentElement.scrollTop || 0;
        
        // Setup base transitions for headers
        const headers = document.querySelectorAll('.header-sticky, .chat-header-main');
        headers.forEach(h => {
            h.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.3s ease, background 0.3s ease';
        });

        const searchContainers = document.querySelectorAll('.inbox-search-container, #inbox-tabs');
        searchContainers.forEach(s => {
            s.style.transition = 'all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)';
            s.style.overflow = 'hidden';
        });

        function onScroll(currentY) {
            // 1. Bottom Nav Logic
            const nav = document.querySelector('.bottom-nav');
            if (currentY > 50 && !isCompact) {
                isCompact = true;
                if (nav) nav.classList.add('compact');
            } else if (currentY <= 10 && isCompact) {
                isCompact = false;
                if (nav) nav.classList.remove('compact');
            }

            // 2. Header Logic
            if (currentY <= 10) {
                // AT TOP: Show full header
                document.body.classList.remove('h-state-down', 'h-state-up');
            } else {
                const delta = currentY - lastScrollY;
                if (Math.abs(delta) > 5) {
                    if (delta > 0) {
                        // SCROLL DOWN: Hide completely
                        document.body.classList.add('h-state-down');
                        document.body.classList.remove('h-state-up');
                    } else {
                        // SCROLL UP: Compact avatar
                        document.body.classList.add('h-state-up');
                        document.body.classList.remove('h-state-down');
                    }
                    lastScrollY = currentY;
                }
            }
        }

        // Attach listeners safely
        window.addEventListener('scroll', () => {
            onScroll(window.scrollY || document.documentElement.scrollTop);
        }, { passive: true });

        const inboxList = document.querySelector('.inbox-list');
        if (inboxList) {
            inboxList.addEventListener('scroll', () => {
                onScroll(inboxList.scrollTop);
            }, { passive: true });
        }
        
        // Initial check
        setTimeout(() => {
            const currentY = window.scrollY || (inboxList ? inboxList.scrollTop : 0);
            lastScrollY = currentY;
            if (currentY > 50) {
                isCompact = true;
                const nav = document.querySelector('.bottom-nav');
                if (nav) nav.classList.add('compact');
                document.body.classList.add('h-state-down');
            }
        }, 150);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initScroll);
    } else {
        initScroll();
    }
})();
`;

fs.writeFileSync('ui.js', uiJS + newLogic, 'utf8');
console.log('ui.js updated with new robust logic');
