const fs = require('fs');

let code = fs.readFileSync('ui.js', 'utf8');

const marker = '// --- BOTTOM NAV SCROLL BEHAVIOR ---';
const idx = code.indexOf(marker);
if (idx !== -1) {
    code = code.substring(0, idx);
}

const scrollLogic = `// --- BOTTOM NAV SCROLL BEHAVIOR ---
document.addEventListener('DOMContentLoaded', () => {
    let isCompact = false;
    
    function handleNavScroll(currentScrollY) {
        const nav = document.querySelector('.bottom-nav');
        if (!nav) return;
        
        if (currentScrollY > 50 && !isCompact) {
            isCompact = true;
            nav.classList.add('compact');
        } else if (currentScrollY <= 10 && isCompact) {
            isCompact = false;
            nav.classList.remove('compact');
        }
    }

    // Ana sayfalar için window scroll
    window.addEventListener('scroll', () => {
        handleNavScroll(window.scrollY || document.documentElement.scrollTop);
    }, { passive: true });

    // Mesajlar sayfası (chat.html) için özel scroll container
    const inboxList = document.getElementById('inbox-list');
    if (inboxList) {
        inboxList.addEventListener('scroll', () => {
            handleNavScroll(inboxList.scrollTop);
        }, { passive: true });
    }
    
    // İlk yüklemede durum kontrolü
    setTimeout(() => {
        const wScroll = window.scrollY || document.documentElement.scrollTop;
        const iScroll = inboxList ? inboxList.scrollTop : 0;
        if (wScroll > 50 || iScroll > 50) {
            handleNavScroll(51); // Zorla tetikle
        }
    }, 100);
});
`;

code += scrollLogic;
fs.writeFileSync('ui.js', code, 'utf8');
console.log('ui.js updated for chat scroll');
