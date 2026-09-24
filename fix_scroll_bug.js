const fs = require('fs');
let code = fs.readFileSync('ui.js', 'utf8');

const oldLogic = `        } else {
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
        lastHeaderScrollY = currentScrollY;`;

const newLogic = `        } else {
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
                lastHeaderScrollY = currentScrollY;
            }
        }`;

code = code.replace(oldLogic, newLogic);
fs.writeFileSync('ui.js', code, 'utf8');
console.log('Fixed scroll accumulator bug');
