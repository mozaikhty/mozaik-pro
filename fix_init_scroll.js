const fs = require('fs');
let code = fs.readFileSync('ui.js', 'utf8');

const oldLogic = `    // İlk yüklemede durum kontrolü
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
    }, 100);`;

const newLogic = `    // İlk yüklemede durum kontrolü
    setTimeout(() => {
        const wScroll = window.scrollY || document.documentElement.scrollTop;
        const iScroll = inboxList ? inboxList.scrollTop : 0;
        const initScroll = Math.max(wScroll, iScroll);
        
        lastHeaderScrollY = initScroll;
        
        if (initScroll > 50) {
            isCompact = true;
            const nav = document.querySelector('.bottom-nav');
            if (nav) nav.classList.add('compact');
            
            // Assume we arrived here by scrolling down
            document.body.classList.add('header-state-down');
        }
    }, 100);`;

code = code.replace(oldLogic, newLogic);
fs.writeFileSync('ui.js', code, 'utf8');
console.log('Fixed initScroll logic');
