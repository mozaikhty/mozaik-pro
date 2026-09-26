const fs = require('fs');
let js = fs.readFileSync('ui.js', 'utf8');

js = js.replace(
    /insertAdjacentHTML\('beforeend', toastHTML\);\s*\/\/ === MOBİL YAN PANEL OVERLAY ===/,
    "insertAdjacentHTML('beforeend', toastHTML);\n    }\n\n    // === MOBİL YAN PANEL OVERLAY ==="
);

fs.writeFileSync('ui.js', js, 'utf8');
console.log('Fixed syntax error!');
