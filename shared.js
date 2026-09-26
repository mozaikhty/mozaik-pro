// ==========================================
// MOZAİK - ORTAK PAYLAŞIMLI FONKSİYONLAR (shared.js)
// ==========================================
// Bu dosya, birden fazla sayfa dosyasında (feed, chat, profile, notifications, search)
// tekrar eden fonksiyonları tek bir yerde toplar. Her sayfa dosyası bu modülü import eder.

import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { collection, addDoc, doc, getDoc, setDoc, updateDoc, arrayUnion, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';

// =====================================
// GLOBAL BAN CHECK
// =====================================
window.initVideoObserver = function() {
    if(window.videoObserver) { window.videoObserver.disconnect(); window.videoObserver = null; }
    if(!window.videoObserver) {
        window.videoObserver = new IntersectionObserver((entries) => {
            let activeVideo = null;
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    activeVideo = entry.target;
                } else {
                    entry.target.pause();
                }
            });

            if (activeVideo) {
                // Sadece ekrandaki aktif videoyu oynat ve global ses durumunu uygula
                const globalMuted = localStorage.getItem('mozaik_video_muted') !== 'false';
                
                // Diğer tüm videoları durdur ve sessize al (Garanti olsun diye)
                document.querySelectorAll('.auto-play-video').forEach(v => {
                    if (v !== activeVideo) {
                        v.pause();
                    }
                });

                activeVideo.muted = globalMuted;
                const uniqueId = activeVideo.id.replace('video-', '');
                const btn = document.querySelector(`#player-${uniqueId} .mz-control-mute`);
                if (btn) btn.innerText = globalMuted ? '🔇' : '🔊';

                activeVideo.play().catch((err) => {
                    console.warn("AUTOPLAY BLOCKED OR ABORTED:", err.name, err.message);
                    // Sadece NotAllowedError (Autoplay policy) ise sessize al.
                    // AbortError ise sessize alma, çünkü video zaten yükleniyor veya iptal edildi.
                    if (err.name === 'NotAllowedError') {
                        activeVideo.muted = true;
                        if (btn) btn.innerText = '🔇';
                        activeVideo.play().catch(()=>{});
                    }
                });
            }
        }, { threshold: 0.6 }); // %60 görünürlük
    }
    document.querySelectorAll('.auto-play-video').forEach(vid => {
        window.videoObserver.observe(vid);
    });
};

window.handleMediaClick = function(postId, isLiked, postAuthor, event) {
    event.stopPropagation(); // Post detayına gitmesini engelle
    if (event.type === 'click' && event.button !== 0) return; // Sadece sol tık veya dokunma
    
    const now = Date.now();
    if (!window.lastClickTime) window.lastClickTime = {};
    const lastTime = window.lastClickTime[postId] || 0;
    
    if (now - lastTime < 300) { // Çift tıklama / dokunma algılandı
        window.lastClickTime[postId] = 0;
        window.toggleLike(postId, isLiked, postAuthor, event, true);
    } else {
        window.lastClickTime[postId] = now;
        // Eğer video ise native controls varsa zaten pause/play olur. Ekstra koda gerek yok.
    }
};
onAuthStateChanged(auth, async (user) => {
    if (user && !window.location.href.includes('admin.html')) {
        const myUsername = user.displayName || user.email.split('@')[0];
        const checkMyBan = await getDoc(doc(db, "users", myUsername));
        if (checkMyBan.exists()) {
            const data = checkMyBan.data();
            if (data.isBanned === true) {
                let stillBanned = true;
                if (data.banData && data.banData.expiresAt) {
                    if (data.banData.expiresAt.toMillis() < Date.now()) {
                        // Süresi dolmuş! Otomatik kaldır
                        stillBanned = false;
                        let banHistory = data.banHistory || [];
                        const oldBan = data.banData;
                        oldBan.unbannedAt = new Date();
                        oldBan.unbannedBy = "System (Auto Expire)";
                        banHistory.push(oldBan);
                        await updateDoc(doc(db, "users", myUsername), { isBanned: false, banData: null, banHistory: banHistory });
                    }
                }
                if (stillBanned) {
                    signOut(auth).then(() => { window.location.href = "index.html"; });
                }
            }
        }
    }
});

// =====================================
// 0. GÜVENLİK YARDIMCI FONKSİYONLARI
// =====================================

/**
 * HTML özel karakterlerini escape eder. XSS saldırılarını önler.
 * Kullanıcı verileri (fullName, location, username vb.) innerHTML'e
 * yerleştirilmeden ÖNCE bu fonksiyondan geçirilmelidir.
 */
window.escapeHtml = function(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/`/g, '&#96;');
};

/**
 * URL'lerin güvenli olduğunu doğrular. Yalnızca https:// ile başlayan
 * URL'leri kabul eder. javascript:, data:, vbscript: gibi tehlikeli
 * protokolleri engeller. Geçersiz URL'ler için boş string döner.
 */
window.sanitizeUrl = function(url) {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) return trimmed;
    return '';
};

// =====================================
// 1. EKSİK KULLANICI VERİLERİNİ ÇEKME
// =====================================
// Her sayfa kendi allUsersData nesnesini tutar ve window.allUsersData olarak paylaşır.
// Bu fonksiyon, verisi henüz çekilmemiş kullanıcıları toplu olarak Firestore'dan yükler.

window.fetchMissingUsers = async function(usernamesArray) {
    const allUsersData = window.allUsersData || {};
    const missing = usernamesArray.filter(u => u && !allUsersData[u]);
    if (missing.length === 0) return;
    await Promise.all(missing.map(async (uname) => {
        try {
            const uSnap = await getDoc(doc(db, "users", uname));
            if (uSnap.exists()) allUsersData[uname] = uSnap.data();
        } catch(e) {}
    }));
};

// =====================================
// 2. KULLANICI LİSTESİ MODALI
// =====================================

window.showUserList = function(title, userArray) {
    const allUsersData = window.allUsersData || {};
    const titleEl = document.getElementById('users-list-title'); 
    if(titleEl) titleEl.innerText = title;
    const container = document.getElementById('users-list-container'); 
    if(!container) return;
    container.innerHTML = '';
    if(userArray.length === 0) { 
        container.innerHTML = '<p style="text-align:center; color:#64748b; padding:20px;">Liste boş.</p>'; 
    } else {
        let html = '';
        userArray.forEach(uname => {
            let uData = allUsersData[uname] || {}; 
            const safeAvatarUrl = window.sanitizeUrl(uData.avatarUrl);
            let avatarHtml = safeAvatarUrl ? `<img src="${safeAvatarUrl}" style="width:100%;height:100%;object-fit:cover;">` : `👤`; 
            let vHtml = uData.isVerified ? '<span class="verified-badge" style="font-size:14px; margin-left:4px;">☑️</span>' : '';
            let safeName = window.escapeHtml(uData.fullName || uname);
            const safeUname = window.escapeHtml(uname);
            html += `<div onclick="window.location.href='profile.html?user=${safeUname}'" class="user-row"><div class="row-avatar">${avatarHtml}</div><div><div style="font-weight:700; color:#0f172a;">${safeName} ${vHtml}</div><div style="font-size:13px; color:#64748b;">@${safeUname}</div></div></div>`;
        });
        container.innerHTML = html;
    }
    document.getElementById('users-list-modal').style.display = 'flex';
};

// Kullanıcı listesi modalını kapatma
document.getElementById('close-list-btn')?.addEventListener('click', () => { 
    document.getElementById('users-list-modal').style.display = 'none'; 
});

// =====================================
// 3. TAKİP LİSTELERİNİ GÖSTERME
// =====================================

window.showMyFollowing = function() { 
    window.closeMobileSidebar(); 
    const allUsersData = window.allUsersData || {};
    const myUsername = window.myUsername;
    if (allUsersData[myUsername]) { 
        window.showUserList("Ağım", allUsersData[myUsername].following || []); 
    } 
};

window.showMyFollowers = function() { 
    window.closeMobileSidebar(); 
    const allUsersData = window.allUsersData || {};
    const myUsername = window.myUsername;
    if (allUsersData[myUsername]) { 
        window.showUserList("Takipçiler", allUsersData[myUsername].followers || []); 
    } 
};

// =====================================
// 4. DESTEK MODALI VE MESAJ GÖNDERME
// =====================================

window.openSupportModal = function() {
    const settingsModal = document.getElementById('settings-modal');
    if(settingsModal) settingsModal.style.display = 'none';
    const sInput = document.getElementById('support-message-input');
    if(sInput) sInput.value = '';
    const sModal = document.getElementById('support-modal');
    if(sModal) sModal.style.display = 'flex';
};

window.sendSupportMessage = async function() {
    const btn = document.getElementById('send-support-btn');
    const input = document.getElementById('support-message-input');
    const message = input ? input.value.trim() : '';
    
    if (!message) { window.showToast?.("Lütfen bir mesaj yazın.", "error") || alert("Lütfen bir mesaj yazın."); return; }
    if (message.length > 2000) { window.showToast?.("Mesajınız en fazla 2000 karakter olabilir.", "error") || alert("Mesajınız en fazla 2000 karakter olabilir."); return; }
    if(btn) { btn.disabled = true; btn.innerText = "Gönderiliyor..."; }

    try {
        const myUsername = window.myUsername;
        // DOMPurify varsa sanitize et
        const safeMessage = (typeof DOMPurify !== 'undefined') ? DOMPurify.sanitize(message) : message;
        await addDoc(collection(db, "tickets"), {
            sender: myUsername || "Bilinmeyen Kullanıcı",
            message: safeMessage,
            createdAt: serverTimestamp(),
            status: "Yeni"
        });
        window.showToast?.("Mesajınız başarıyla iletildi. Teşekkür ederiz!", "success") || alert("Gönderildi.");
        const modal = document.getElementById('support-modal');
        if(modal) modal.style.display = 'none';
    } catch (error) {
        console.error("Destek bileti gönderilemedi:", error.code || "Bilinmeyen hata");
        alert("Mesaj gönderilirken bir hata oluştu.");
    } finally {
        if(btn) { btn.disabled = false; btn.innerText = "Gönder"; }
    }
};

// =====================================
// 5. MOBİL SIDEBAR AÇMA/KAPAMA
// =====================================

window.openMobileSidebar = function() { 
    const overlay = document.getElementById('mobile-sidebar-overlay');
    if(overlay) overlay.style.display = 'block'; 
    setTimeout(() => { document.getElementById('mobile-sidebar')?.classList.add('open'); }, 10); 
};

window.closeMobileSidebar = function() { 
    document.getElementById('mobile-sidebar')?.classList.remove('open'); 
    setTimeout(() => { 
        const overlay = document.getElementById('mobile-sidebar-overlay');
        if(overlay) overlay.style.display = 'none'; 
    }, 300); 
};

// =====================================
// 6. HIZLI TAKİP ETME (QUICK FOLLOW)
// =====================================

window.quickFollow = async function(targetUser) {
    try {
        const myUsername = window.myUsername;
        const allUsersData = window.allUsersData || {};
        const myRef = doc(db, "users", myUsername);
        const targetRef = doc(db, "users", targetUser);
        const targetData = allUsersData[targetUser] || {};
        
        if (targetData.isPrivate) {
            await setDoc(targetRef, { followRequests: arrayUnion(myUsername) }, { merge: true });
            window.showToast?.("Hesap gizli. Takip isteği gönderildi!", "success") || alert("Hesap gizli. Takip isteği gönderildi!");
        } else {
            await setDoc(myRef, { following: arrayUnion(targetUser) }, { merge: true });
            await setDoc(targetRef, { followers: arrayUnion(myUsername) }, { merge: true });
            await addDoc(collection(db, "notifications"), { type: 'follow', sender: myUsername, recipient: targetUser, createdAt: serverTimestamp() });
        }
    } catch (e) {
        console.error("Hızlı takip hatası:", e.code || "Bilinmeyen hata");
    }
};

// =====================================
// 7. AKILLI GÖRSEL SIKIŞTIRMA (CANVAS API)
// =====================================
// Kullanıcı 5 MB - 10 MB fotoğraf seçse dahi çözünürlüğü optimize eder,
// .webp formatına çevirir ve dosya boyutunu maksimum 800 KB (500 KB - 1 MB) altına indirir.

window.compressImage = function(file, maxWidth = 1200, maxHeight = 1200, quality = 0.75, maxSizeBytes = 800 * 1024) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type.startsWith('image/')) return resolve(file);
        
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = event => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // En boy oranını koruyarak maksimum sınırları uygula
                if (width > height && width > maxWidth) {
                    height = Math.round(height * (maxWidth / width));
                    width = maxWidth;
                } else if (height > maxHeight) {
                    width = Math.round(width * (maxHeight / height));
                    height = maxHeight;
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Kademeli sıkıştırma: Dosya hedef boyutu aşarsa kaliteyi düşür
                const tryCompress = (q) => {
                    canvas.toBlob(blob => {
                        if (!blob) return resolve(file);
                        
                        // Hedef boyuttan büyükse ve kalite 0.4'ün üzerindeyse kaliteyi azaltıp tekrar dene
                        if (blob.size > maxSizeBytes && q > 0.4) {
                            tryCompress(q - 0.15);
                        } else {
                            const newFileName = file.name.replace(/\.[^/.]+$/, "") + ".webp";
                            const compressedFile = new File([blob], newFileName, {
                                type: 'image/webp',
                                lastModified: Date.now()
                            });
                            resolve(compressedFile);
                        }
                    }, 'image/webp', q);
                };
                
                tryCompress(quality);
            };
            img.onerror = error => reject(error);
        };
        reader.onerror = error => reject(error);
    });
};



window.showLikes = async function(postId, event) {
    if(event) event.stopPropagation();
    const titleEl = document.getElementById('users-list-title'); 
    const container = document.getElementById('users-list-container'); 
    if(!titleEl || !container) return;
    
    // Yükleniyor durumu (Sadece container içeriği değişecek, listeler bozulmayacak)
    titleEl.innerText = "Beğenenler";
    container.innerHTML = '<div style="text-align:center; padding:30px; color:#64748b; font-weight:600;">Yükleniyor...</div>';
    document.getElementById('users-list-modal').style.display = 'flex';
    
    try {
        const postRef = doc(db, "posts", postId);
        const postSnap = await getDoc(postRef);
        
        if (!postSnap.exists()) {
            container.innerHTML = '<p style="text-align:center; color:#64748b; padding:20px;">Gönderi bulunamadı.</p>';
            return;
        }
        
        let likesArray = postSnap.data().likes || [];
        
        // Remove duplicates if any
        likesArray = [...new Set(likesArray)];
        
        if (likesArray.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#64748b; padding:20px;">Henüz beğeni yok.</p>';
            return;
        }
        
        let html = '';
        window.allUsersData = window.allUsersData || {};
        
        for (const uname of likesArray) {
            let uData = window.allUsersData[uname];
            // Eksik kullanıcı bilgilerini doğrudan Firebase'den al (anlık getirme)
            if (!uData) {
                const uSnap = await getDoc(doc(db, "users", uname));
                if (uSnap.exists()) {
                    uData = uSnap.data();
                    window.allUsersData[uname] = uData; // Cache'e ekle
                }
            }
            
            if (uData) {
                const safeAvatarUrl = window.sanitizeUrl(uData.avatarUrl);
                let avatarHtml = safeAvatarUrl ? `<img src="${safeAvatarUrl}" style="width:100%;height:100%;object-fit:cover;">` : `👤`; 
                let vHtml = uData.isVerified ? '<span class="verified-badge" style="font-size:14px; margin-left:4px;">✔️</span>' : '';
                let safeName = window.escapeHtml(uData.fullName || uname);
                const safeUname = window.escapeHtml(uname);
                html += `<div onclick="window.location.href='profile.html?user=${safeUname}'" class="user-row"><div class="row-avatar">${avatarHtml}</div><div><div style="font-weight:700; color:#0f172a;">${safeName} ${vHtml}</div><div style="font-size:13px; color:#64748b;">@${safeUname}</div></div></div>`;
            }
        }
        
        if (html === '') {
            html = '<p style="text-align:center; color:#64748b; padding:20px;">Kullanıcı bilgileri alınamadı.</p>';
        }
        
        container.innerHTML = html;
        
    } catch (err) {
        console.error("Beğeni listesi alınırken hata:", err);
        container.innerHTML = '<p style="text-align:center; color:#ef4444; padding:20px;">Veriler alınırken bir hata oluştu.</p>';
    }
};



// MOZAİK CUSTOM VIDEO PLAYER LOGIC
window.renderCustomVideo = function(url, likeActionStr, uniqueId, postId = '') {
    const safeLikeAction = likeActionStr ? likeActionStr.replace(/"/g, '&quot;') : '';
    const isMuted = localStorage.getItem('mozaik_video_muted') !== 'false';
    return `
        <div class="mz-video-player" id="player-${uniqueId}" data-video-id="${uniqueId}" style="position:relative; width:100%; border-radius:8px; overflow:hidden; background:#000;">
            <video class="mz-video auto-play-video" disablePictureInPicture controlsList="nodownload noplaybackrate" id="video-${uniqueId}" src="${url}" playsinline loop ${isMuted ? 'muted' : ''} style="width:100%; max-height:400px; object-fit:contain; display:block; pointer-events:none;"></video>
            
            <!-- Video tiklama overlay'i: Reels'i açar -->
            <div class="mz-video-overlay" style="position:absolute; top:0; left:0; width:100%; height:100%; z-index:1; cursor:pointer; pointer-events:auto;" onclick="event.stopPropagation(); event.preventDefault(); window.openReelsViewer('${postId}')"></div>
            
            <!-- Sağ alttaki sadece ses kontrol butonu -->
            <button class="mz-control-btn mz-control-mute" onclick="event.stopPropagation(); event.preventDefault(); window.toggleVideoMute('${uniqueId}', event)" style="position:absolute; bottom:10px; right:10px; z-index:2; background:rgba(0,0,0,0.6); border:none; color:white; border-radius:50%; width:36px; height:36px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:16px;">${isMuted ? '🔇' : '🔊'}</button>
        </div>
    `;
};

window.handleVideoClick = function(id, event, likeActionStr, postId) {
    if (event) { event.stopPropagation(); event.preventDefault(); }
    const now = Date.now();
    if (!window.lastVideoClickTime) window.lastVideoClickTime = {};
    const lastTime = window.lastVideoClickTime[id] || 0;
    
    if (now - lastTime < 300) {
        window.lastVideoClickTime[id] = 0; // double click
        if (likeActionStr && likeActionStr.trim() !== '' && likeActionStr !== 'undefined') {
            try { eval(likeActionStr); } catch(e) {}
        }
    } else {
        window.lastVideoClickTime[id] = now;
        setTimeout(() => {
            if (window.lastVideoClickTime[id] !== 0) { // single click
                if (window.openReelsViewer && postId && postId !== 'undefined' && postId !== '') {
                    window.openReelsViewer(postId);
                } else {
                    window.toggleVideoPlay(id);
                }
            }
        }, 300);
    }
};

window.formatVideoTime = function(seconds) {
    if (isNaN(seconds)) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
};

window.toggleVideoPlay = function(id, event) {
    if (event) event.stopPropagation();
    const video = document.getElementById('video-' + id);
    if (!video) return;
    
    if (video.paused) {
        // Pause all other videos first
        document.querySelectorAll('.mz-video').forEach(v => {
            if (v !== video && !v.paused) v.pause();
        });
        video.play();
    } else {
        video.pause();
    }
};

window.toggleVideoMute = function(id, event) {
    if (event) event.stopPropagation();
    const video = document.getElementById('video-' + id);
    const btn = document.querySelector(`#player-${id} .mz-control-mute`);
    if (!video || !btn) return;
    
    video.muted = !video.muted; localStorage.setItem('mozaik_video_muted', video.muted);
    // Removed forced muting

    btn.innerText = video.muted ? '🔇' : '🔊';
};

window.seekVideo = function(id, event) {
    if (event) event.stopPropagation();
    const video = document.getElementById('video-' + id);
    const pbar = document.getElementById('pbar-' + id);
    if (!video || !pbar) return;
    
    const rect = pbar.getBoundingClientRect();
    const pos = (event.clientX - rect.left) / rect.width;
    video.currentTime = pos * video.duration;
};

window.toggleVideoFullscreen = function(id, event) {
    if (event) event.stopPropagation();
    const player = document.getElementById('player-' + id);
    if (!player) return;
    
    if (!document.fullscreenElement) {
        if (player.requestFullscreen) player.requestFullscreen();
        else if (player.webkitRequestFullscreen) player.webkitRequestFullscreen();
        player.classList.add('fullscreen');
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        player.classList.remove('fullscreen');
    }
};

// Initialize video listeners for updates
window.initVideoPlayers = function() {
    document.querySelectorAll('.mz-video').forEach(video => {
        if (video.dataset.initialized) return;
        video.dataset.initialized = 'true';
        
        const id = video.id.replace('video-', '');
        const player = document.getElementById('player-' + id);
        const pfill = document.getElementById('pfill-' + id);
        const timeEl = document.getElementById('time-' + id);
        const playBtn = player.querySelector('.mz-control-play');
        const overlay = document.getElementById('overlay-' + id);
        
        video.addEventListener('timeupdate', () => {
            if (!video.duration) return;
            const percent = (video.currentTime / video.duration) * 100;
            if (pfill) pfill.style.width = percent + '%';
            if (timeEl) timeEl.innerText = window.formatVideoTime(video.currentTime) + ' / ' + window.formatVideoTime(video.duration);
        });
        
        video.addEventListener('play', () => {
            player.classList.add('playing');
            player.classList.remove('paused');
            if (playBtn) playBtn.innerText = '⏸';
        });
        
        video.addEventListener('pause', () => {
            player.classList.remove('playing');
            player.classList.add('paused');
            if (playBtn) playBtn.innerText = '▶';
        });
        
        video.addEventListener('ended', () => {
            player.classList.remove('playing');
            player.classList.remove('paused');
            if (playBtn) playBtn.innerText = '▶';
            video.currentTime = 0; // reset
        });
    });
};



window.observeVideos = function() {
    if (!window.videoObserver) return;
    document.querySelectorAll('.mz-video').forEach(video => {
        window.videoObserver.observe(video);
    });
};


// ==========================================
// REELS VIEWER SYSTEM
// ==========================================

window.openReelsViewer = function(startPostId) {
    if (window.currentGlobalPosts) {
        const videoPosts = window.currentGlobalPosts.filter(p => p.data && p.data.media && p.data.media.some(m => m.type === 'video'));
        try {
            sessionStorage.setItem('mozaik_reels_data', JSON.stringify(videoPosts));
        } catch(e) {}
    }
    window.location.href = 'reels.html?video=' + startPostId;
};
