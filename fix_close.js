const fs = require('fs');
let code = fs.readFileSync('search.js', 'utf8');

code = code.replace(
    /window\.closePostDetail = function\(\) \{[\s\S]*?\};\n/,
    `window.closePostDetail = function() { 
    document.body.classList.remove('modal-open');
    const modal = document.getElementById('post-detail-modal');
    if(modal) modal.style.display = 'none';
    const cont = document.getElementById('post-detail-container');
    if(cont){ cont.querySelectorAll('video').forEach(v => v.pause()); cont.innerHTML = ''; }
};\n`
);

fs.writeFileSync('search.js', code, 'utf8');
console.log('Fixed closePostDetail in search.js');
