import { db } from './firebase-config.js';
import { collection, query, orderBy, limit, getDocs, doc, getDoc, updateDoc, arrayUnion, arrayRemove, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

let myUsername = localStorage.getItem('mozaik_username') || null;
const auth = getAuth();
onAuthStateChanged(auth, (user) => {
    if (user && user.displayName) {
        myUsername = user.displayName;
    }
});

let reelsPosts = [];
let isMuted = localStorage.getItem('mozaik_video_muted') !== 'false';
let reelsObserver = null;
let startVideoId = new URLSearchParams(window.location.search).get('video');
let allUsersData = {}; // Cache for user info

// Güvenlik ve performans için XSS koruması (shared.js'den)
function escapeHtml(unsafe) {
    if(!unsafe) return '';
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

async function fetchUserData(username) {
    if (allUsersData[username]) return allUsersData[username];
    try {
        const uDoc = await getDoc(doc(db, "users", username));
        if (uDoc.exists()) {
            allUsersData[username] = uDoc.data();
            return allUsersData[username];
        }
    } catch(e) {}
    return null;
}

async function initReels() {
    const container = document.getElementById('reels-container');
    container.innerHTML = '<div class="reels-loader">Videolar Yükleniyor...</div>';
    
    try {
        let cachedData = sessionStorage.getItem('mozaik_reels_data');
        if (cachedData) {
            try {
                reelsPosts = JSON.parse(cachedData);
            } catch(e) { console.warn("Cache parse hatası", e); }
        }
        
        // Eğer cache boşsa veya doğrudan linkle gelindiyse Firebase'den çek
        if (!reelsPosts || reelsPosts.length === 0) {
            reelsPosts = [];
            // Önce startVideoId'yi çek (direkt link ile gelinirse)
            if (startVideoId) {
                const docSnap = await getDoc(doc(db, "posts", startVideoId));
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.media && data.media.some(m => m.type === 'video')) {
                        reelsPosts.push({ id: docSnap.id, data: data });
                    }
                }
            }
            
            // Diğer son videoları çek
            const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(20));
            const snap = await getDocs(q);
            snap.docs.forEach(d => {
                if (d.id === startVideoId) return; 
                const data = d.data();
                if (data.media && data.media.some(m => m.type === 'video')) {
                    reelsPosts.push({ id: d.id, data: data });
                }
            });
        }

        // Listeyi başlatılmak istenen videoya göre kaydır (en üste al)
        if (startVideoId) {
            const index = reelsPosts.findIndex(p => p.id === startVideoId);
            if (index > 0) {
                const targetPost = reelsPosts.splice(index, 1)[0];
                reelsPosts.unshift(targetPost); // İlk sıraya yerleştir
            }
        }
        
        // Kullanıcı bilgilerini arkaplanda çek
        reelsPosts.forEach(p => {
            fetchUserData(p.data.author).then(() => {
                // Sadece profil fotosunu ve tiki güncellemek için basit dom işlemi yapılabilir.
                const authorData = allUsersData[p.data.author];
                if(authorData) {
                    const el = document.getElementById('rauthor-' + p.id);
                    if(el) {
                        const vHtml = authorData.isVerified ? '<span class="verified-badge" style="font-size:12px; margin-left:4px;">☑️</span>' : '';
                        const avatarUrl = authorData.avatarUrl ? authorData.avatarUrl : ''; 
                        const avatarHtml = avatarUrl ? `<img src="${avatarUrl}">` : `👤`;
                        el.innerHTML = `${avatarHtml}<span>${escapeHtml(authorData.fullName || p.data.author)} ${vHtml}</span>`;
                    }
                }
            });
        });
        
        renderReels();
        
    } catch (e) {
        console.error("Reels yükleme hatası:", e);
        container.innerHTML = '<div class="reels-loader" style="flex-direction:column; gap:20px;"><div style="color:#ef4444;">Video yüklenemedi.</div><button onclick="window.history.back()" style="padding:10px 20px; background:#ef4444; color:#fff; border:none; border-radius:8px; cursor:pointer; font-weight:bold;">‹ Geri dön</button></div>';
    }
}

function renderReels() {
    const container = document.getElementById('reels-container');
    container.innerHTML = '';
    
    if (reelsPosts.length === 0) {
        container.innerHTML = '<div class="reels-loader" style="flex-direction:column; gap:20px;"><div>Gösterilecek video bulunamadı.</div><button onclick="window.history.back()" style="padding:10px 20px; background:#3b82f6; color:#fff; border:none; border-radius:8px; cursor:pointer; font-weight:bold;">‹ Geri dön</button></div>';
        return;
    }
    
    reelsPosts.forEach(post => {
        const html = generateReelsHTML(post);
        container.insertAdjacentHTML('beforeend', html);
    });
    
    setupObserver();
}

function generateReelsHTML(post) {
    const d = post.data;
    const videoMedia = d.media.find(m => m.type === 'video');
    if (!videoMedia) return '';
    
    // Yazar bilgisi henüz yüklenmediyse de default değerler koyalım
    const authorData = allUsersData[d.author] || {};
    const vHtml = authorData.isVerified ? '<span class="verified-badge" style="font-size:12px; margin-left:4px;">☑️</span>' : '';
    const avatarUrl = authorData.avatarUrl ? authorData.avatarUrl : ''; 
    const avatarHtml = avatarUrl ? `<img src="${avatarUrl}">` : `👤`;
    
    const likes = d.likes || [];
    const isLiked = myUsername && likes.includes(myUsername);
    const likeColor = isLiked ? '#ef4444' : '#ffffff';
    const likeIcon = isLiked ? '❤️' : '🤍';
    
    const comments = d.comments || [];
    
    return `
        <div class="reels-item" id="reels-item-${post.id}">
            <video src="${videoMedia.url}" 
                   id="rvideo-${post.id}" 
                   loop playsinline 
                   ${isMuted ? 'muted' : ''}
                   onclick="toggleReelsPlay('${post.id}')"></video>
                   
            <div class="reels-play-overlay" id="rplay-${post.id}">▶</div>
            <div class="reels-mute-overlay" id="rmute-${post.id}">${isMuted ? '🔇' : '🔊'}</div>
            
            <div class="reels-info">
                <div class="reels-author" id="rauthor-${post.id}" onclick="window.location.href='profile.html?user=${escapeHtml(d.author)}'">
                    ${avatarHtml}
                    <span>${escapeHtml(d.author)} ${vHtml}</span>
                </div>
                ${d.content ? `<div class="reels-desc">${escapeHtml(d.content)}</div>` : ''}
            </div>
            
            <div class="reels-actions">
                <div class="reels-action-btn" onclick="toggleLike('${post.id}', ${isLiked}, '${escapeHtml(d.author)}', event)">
                    <span id="rlike-icon-${post.id}" style="font-size: 28px; color: ${likeColor}; margin:0;">${likeIcon}</span>
                    <span id="rlike-count-${post.id}">${likes.length > 0 ? likes.length : 'Beğen'}</span>
                </div>
                <div class="reels-action-btn" onclick="window.location.href='feed.html?post=${post.id}'">
                    <span style="font-size: 28px; margin:0;">💬</span>
                    <span>${comments.length > 0 ? comments.length : 'Yorum'}</span>
                </div>
                <div class="reels-action-btn reels-mute-btn" onclick="toggleMute(event)" style="font-size:24px;">
                    ${isMuted ? '🔇' : '🔊'}
                </div>
            </div>
        </div>
    `;
}

function setupObserver() {
    if (reelsObserver) reelsObserver.disconnect();
    
    const videos = Array.from(document.querySelectorAll('.reels-item video'));
    
    reelsObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const video = entry.target;
            if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
                video.muted = isMuted;
                const playPromise = video.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        console.log('Autoplay engellendi, sessize alinip deneniyor:', error);
                        video.muted = true;
                        isMuted = true;
                        video.play().catch(e => {});
                        document.querySelectorAll('.reels-mute-btn').forEach(btn => btn.innerText = '🔇');
                        const postId = video.id.replace('rvideo-', '');
                        const muteOverlay = document.getElementById('rmute-' + postId);
                        if(muteOverlay) { muteOverlay.innerText = '🔇'; }
                    });
                }
            } else {
                video.pause();
                video.currentTime = 0;
            }
        });
    }, {
        root: document.getElementById('reels-container'),
        threshold: [0.0, 0.6, 1.0]
    });
    
    videos.forEach(video => {
        reelsObserver.observe(video);
    });
}

// Oynat/Durdur Mantığı (Sadece tıklandığında)
window.toggleReelsPlay = function(postId) {
    const video = document.getElementById('rvideo-' + postId);
    const playOverlay = document.getElementById('rplay-' + postId);
    
    if (!video) return;
    
    if (video.paused) {
        video.play();
        showOverlay(playOverlay, '▶');
    } else {
        video.pause();
        showOverlay(playOverlay, '⏸');
    }
};

window.toggleMute = function(event) {
    if(event) event.stopPropagation();
    isMuted = !isMuted; localStorage.setItem('mozaik_video_muted', isMuted);
    
    const videos = document.querySelectorAll('.reels-item video');
    videos.forEach(v => {
        v.muted = isMuted;
    });
    
    document.querySelectorAll('.reels-mute-btn').forEach(btn => {
        btn.innerText = isMuted ? '🔇' : '🔊';
    });
    
    // Orta ekranda ikon göster
    const activeVideo = Array.from(videos).find(v => !v.paused);
    if(activeVideo) {
        const postId = activeVideo.id.replace('rvideo-', '');
        const muteOverlay = document.getElementById('rmute-' + postId);
        if(muteOverlay) showOverlay(muteOverlay, isMuted ? '🔇' : '🔊');
    }
};

function showOverlay(element, text) {
    if(!element) return;
    element.innerText = text;
    element.style.opacity = '1';
    element.style.transform = 'translate(-50%, -50%) scale(1.2)';
    setTimeout(() => {
        element.style.opacity = '0';
        element.style.transform = 'translate(-50%, -50%) scale(1)';
    }, 500);
}

window.toggleLike = async function(postId, isCurrentlyLiked, postAuthor, event) {
    event.stopPropagation();
    if (!myUsername) { alert("Beğenmek için giriş yapmalısınız."); return; }
    
    const iconEl = document.getElementById('rlike-icon-' + postId);
    const countEl = document.getElementById('rlike-count-' + postId);
    let count = parseInt(countEl.innerText) || 0;
    
    if (isCurrentlyLiked) {
        iconEl.innerText = '🤍';
        iconEl.style.color = '#ffffff';
        count = Math.max(0, count - 1);
        countEl.innerText = count > 0 ? count : 'Beğen';
        event.currentTarget.setAttribute('onclick', `toggleLike('${postId}', false, '${postAuthor}', event)`);
    } else {
        iconEl.innerText = '❤️';
        iconEl.style.color = '#ef4444';
        count++;
        countEl.innerText = count;
        event.currentTarget.setAttribute('onclick', `toggleLike('${postId}', true, '${postAuthor}', event)`);
    }
    
    const postRef = doc(db, "posts", postId);
    try {
        if (isCurrentlyLiked) {
            await updateDoc(postRef, { likes: arrayRemove(myUsername) });
        } else {
            await updateDoc(postRef, { likes: arrayUnion(myUsername) });
            if (postAuthor !== myUsername) {
                await addDoc(collection(db, "notifications"), { type: 'like', sender: myUsername, recipient: postAuthor, postId: postId, createdAt: serverTimestamp() });
            }
        }
    } catch(e) { console.error("Like error:", e); }
};

window.addEventListener('keydown', (e) => {
    const container = document.getElementById('reels-container');
    const itemHeight = window.innerHeight;
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        container.scrollBy({ top: itemHeight, behavior: 'smooth' });
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        container.scrollBy({ top: -itemHeight, behavior: 'smooth' });
    } else if (e.key === 'Escape') {
        window.history.back();
    }
});

document.addEventListener('DOMContentLoaded', initReels);
