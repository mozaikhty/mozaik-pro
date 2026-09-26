const fs = require('fs');
let code = fs.readFileSync('shared.js', 'utf8');

// Update observeVideos to only target feed-container
code = code.replace(
    /window\.observeVideos = function\(\) \{\s*if \(!window\.videoObserver\) return;\s*document\.querySelectorAll\('\.mz-video'\)\.forEach\(video => \{\s*window\.videoObserver\.observe\(video\);\s*\}\);\s*\};/,
    `window.observeVideos = function() {
    if (!window.videoObserver) return;
    const feedContainer = document.getElementById('feed-container');
    if (feedContainer) {
        feedContainer.querySelectorAll('.mz-video').forEach(video => {
            window.videoObserver.observe(video);
        });
    }
};`
);

// Update pause loop to only target feed-container
code = code.replace(
    /document\.querySelectorAll\('\.auto-play-video'\)\.forEach\(v => \{/g,
    `const feedCont = document.getElementById('feed-container');
                (feedCont ? feedCont.querySelectorAll('.auto-play-video') : []).forEach(v => {`
);

fs.writeFileSync('shared.js', code, 'utf8');
console.log('Restricted observer to feed-container');
