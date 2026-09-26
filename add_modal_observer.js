const fs = require('fs');
let code = fs.readFileSync('shared.js', 'utf8');

const modalObserverCode = `
window.initModalVideoObserver = function() {
    if(window.modalVideoObserver) { window.modalVideoObserver.disconnect(); window.modalVideoObserver = null; }
    if(!window.modalVideoObserver) {
        window.modalVideoObserver = new IntersectionObserver((entries) => {
            let activeVideo = null;
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    activeVideo = entry.target;
                } else {
                    entry.target.pause();
                }
            });

            if (activeVideo) {
                const globalMuted = localStorage.getItem('mozaik_video_muted') !== 'false';
                
                const modalCont = document.getElementById('post-detail-modal');
                if (modalCont) {
                    modalCont.querySelectorAll('.auto-play-video').forEach(v => {
                        if (v !== activeVideo) v.pause();
                    });
                }

                activeVideo.muted = globalMuted;
                const uniqueId = activeVideo.id.replace('video-', '');
                const btn = document.querySelector(\`#player-\${uniqueId} .mz-control-mute\`);
                if (btn) btn.innerText = globalMuted ? '🔇' : '🔊';

                activeVideo.play().catch((err) => {
                    if (err.name === 'NotAllowedError') {
                        activeVideo.muted = true;
                        if (btn) btn.innerText = '🔇';
                        activeVideo.play().catch(()=>{});
                    }
                });
            }
        }, { threshold: 0.6 });
    }
};

window.observeModalVideos = function() {
    if (!window.modalVideoObserver) return;
    const modalCont = document.getElementById('post-detail-modal');
    if (modalCont) {
        modalCont.querySelectorAll('.mz-video').forEach(video => {
            window.modalVideoObserver.observe(video);
        });
    }
};

window.initModalVideoObserver();
`;

code = code.replace(/window\.initVideoObserver\(\);/, 'window.initVideoObserver();\n' + modalObserverCode);
fs.writeFileSync('shared.js', code, 'utf8');
console.log('Added modalVideoObserver');
