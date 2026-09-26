const fs = require('fs');
let code = fs.readFileSync('shared.js', 'utf8');

// 1. Remove v.muted = true in IntersectionObserver
code = code.replace(
    /document\.querySelectorAll\('\.auto-play-video'\)\.forEach\(v => \{\s*if \(v !== activeVideo\) \{\s*v\.pause\(\);\s*v\.muted = true;\s*\}\s*\}\);/,
    `document.querySelectorAll('.auto-play-video').forEach(v => {
                    if (v !== activeVideo) {
                        v.pause();
                    }
                });`
);

// 2. Remove forced muting in toggleVideoMute
code = code.replace(
    /if \(!video\.muted\) \{\s*document\.querySelectorAll\('\.mz-video'\)\.forEach\(v => \{\s*if \(v !== video\) \{\s*v\.muted = true;\s*const otherBtn = document\.querySelector[^;]+;\s*if \(otherBtn\) otherBtn\.innerText = '🔇';\s*\}\s*\}\);\s*\}/,
    `// Removed forced muting`
);

fs.writeFileSync('shared.js', code, 'utf8');
console.log('Fixed shared.js');
