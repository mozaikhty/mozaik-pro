const fs = require('fs');
let code = fs.readFileSync('shared.js', 'utf8');

const replacement = `
window.observeModalVideos = function() {
    if (!window.modalVideoObserver) return;
    const modalCont = document.getElementById('post-detail-modal');
    if (modalCont) {
        modalCont.querySelectorAll('.mz-video').forEach(video => {
            window.modalVideoObserver.observe(video);
        });

        // Explicit fallback for immediate play, as requested
        setTimeout(() => {
            const firstVideo = modalCont.querySelector('.mz-video');
            if (firstVideo && firstVideo.paused) {
                const globalMuted = localStorage.getItem('mozaik_video_muted') !== 'false';
                firstVideo.muted = globalMuted;
                const uniqueId = firstVideo.id.replace('video-', '');
                const btn = document.querySelector('#player-' + uniqueId + ' .mz-control-mute');
                if (btn) btn.innerText = globalMuted ? '🔇' : '🔊';
                
                firstVideo.play().catch(err => {
                    if (err.name === 'NotAllowedError') {
                        firstVideo.muted = true;
                        if (btn) btn.innerText = '🔇';
                        firstVideo.play().catch(()=>{});
                    }
                });
            }
        }, 100);
    }
};
`;

code = code.replace(/window\.observeModalVideos = function\(\) \{[\s\S]*?\};\n/, replacement);
fs.writeFileSync('shared.js', code, 'utf8');
console.log('Fixed observeModalVideos fallback');
