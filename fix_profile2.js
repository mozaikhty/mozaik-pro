const fs = require('fs');
let code = fs.readFileSync('profile.js', 'utf8');

code = code.replace(
    /window\.initVideoPlayers\(\);\s*window\.observeVideos\(\);/g,
    'window.initVideoPlayers?.(); window.observeModalVideos?.();'
);

fs.writeFileSync('profile.js', code, 'utf8');
console.log('Fixed profile.js');
