const fs = require('fs');
let code = fs.readFileSync('ui.js', 'utf8');

const oldLogic = code.match(/\/\/ --- BOTTOM NAV SCROLL BEHAVIOR ---[\s\S]*/)[0];

const newLogic = `// --- NAV AND HEADER SCROLL BEHAVIOR ---
document.addEventListener('DOMContentLoaded', () => {
    let isCompact = false;
    let lastHeaderScrollY = 0;
    
    function handleScrollAll(currentScrollY) {
        // 1. BOTTOM NAV LOGIC (Independent)
        const nav = document.querySelector('.bottom-nav');
        if (currentScrollY > 50 && !isCompact) {
            isCompact = true;
            if (nav) nav.classList.add('compact');
        } else if (currentScrollY <= 10 && isCompact) {
            isCompact = false;
            if (nav) nav.classList.remove('compact');
        }
        
        // 2. HEADER LOGIC (Directional)
        if (currentScrollY <= 10) {
            document.body.classList.remove('header-state-down', 'header-state-up');
            // 'header-state-top' is the default state without classes
        } else {
            const delta = currentScrollY - lastHeaderScrollY;
            if (Math.abs(delta) > 5) { // Anti-flicker threshold
                if (delta > 0) {
                    // Scrolling DOWN
                    document.body.classList.remove('header-state-up');
                    document.body.classList.add('header-state-down');
                } else {
                    // Scrolling UP
                    document.body.classList.remove('header-state-down');
                    document.body.classList.add('header-state-up');
                }
            }
        }
        lastHeaderScrollY = currentScrollY;
    }

    // Ana sayfalar için window scroll
    window.addEventListener('scroll', () => {
        handleScrollAll(window.scrollY || document.documentElement.scrollTop);
    }, { passive: true });

    // Mesajlar sayfası (chat.html) için özel scroll container
    const inboxList = document.querySelector('.inbox-list');
    if (inboxList) {
        inboxList.addEventListener('scroll', () => {
            handleScrollAll(inboxList.scrollTop);
        }, { passive: true });
    }
    
    // İlk yüklemede durum kontrolü
    setTimeout(() => {
        const wScroll = window.scrollY || document.documentElement.scrollTop;
        const iScroll = inboxList ? inboxList.scrollTop : 0;
        const initScroll = Math.max(wScroll, iScroll);
        
        if (initScroll > 50) {
            isCompact = true;
            const nav = document.querySelector('.bottom-nav');
            if (nav) nav.classList.add('compact');
            
            // Assume we arrived here by scrolling down
            document.body.classList.add('header-state-down');
            lastHeaderScrollY = initScroll;
        }
    }, 100);
});
`;

code = code.replace(oldLogic, newLogic);
fs.writeFileSync('ui.js', code, 'utf8');
console.log('ui.js updated for directional scroll');
