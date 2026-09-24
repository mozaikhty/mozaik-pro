const fs = require('fs');

let code = fs.readFileSync('ui.js', 'utf8');

// The scroll logic is at the bottom
const oldLogic = `    function handleNavScroll(currentScrollY) {
        const nav = document.querySelector('.bottom-nav');
        if (!nav) return;
        
        if (currentScrollY > 50 && !isCompact) {
            isCompact = true;
            nav.classList.add('compact');
        } else if (currentScrollY <= 10 && isCompact) {
            isCompact = false;
            nav.classList.remove('compact');
        }
    }`;

const newLogic = `    function handleNavScroll(currentScrollY) {
        const nav = document.querySelector('.bottom-nav');
        const header = document.querySelector('.header-sticky');
        const chatHeader = document.querySelector('.chat-header-main');
        
        if (currentScrollY > 50 && !isCompact) {
            isCompact = true;
            if (nav) nav.classList.add('compact');
            if (header) header.classList.add('compact');
            if (chatHeader) chatHeader.classList.add('compact');
        } else if (currentScrollY <= 10 && isCompact) {
            isCompact = false;
            if (nav) nav.classList.remove('compact');
            if (header) header.classList.remove('compact');
            if (chatHeader) chatHeader.classList.remove('compact');
        }
    }`;

code = code.replace(oldLogic, newLogic);
fs.writeFileSync('ui.js', code, 'utf8');
console.log('Updated ui.js scroll handler');
