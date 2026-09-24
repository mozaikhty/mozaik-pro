const fs = require('fs');
let code = fs.readFileSync('ui.js', 'utf8');

code = code.replace(/document\.getElementById\('inbox-list'\)/g, "document.querySelector('.inbox-list')");

fs.writeFileSync('ui.js', code, 'utf8');
console.log('Fixed inbox-list selector in ui.js');
