import { collection, addDoc, doc, updateDoc, arrayUnion, getDoc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";
import { db, storage } from './firebase-config.js';

// Global Hikaye Değişkenleri
window.activeStoryUsers = []; 
window.currentStoryUserIndex = 0; 
window.currentStoryIndex = 0; 
let storyTimerInterval = null; 
let storyProgress = 0; 
let isStoryPaused = false; 
let storyDetailsTab = 'views';
window.editorState = { image: { left: 50, top: 50, scale: 1 }, text: { left: 50, top: 50, scale: 1 } };

function generateStoryId() { return Math.random().toString(36).substr(2, 9); }

// =====================================
// 1. DOKUNMATİK KAYDIRMA (SWIPE) GESTURES
// =====================================
let touchStartX = 0; let touchStartY = 0;

document.addEventListener('DOMContentLoaded', () => {
    const viewer = document.getElementById('story-viewer-overlay');
    if(viewer) {
        viewer.addEventListener('touchstart', e => {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
            window.pauseStory();
        }, {passive: true});

        viewer.addEventListener('touchend', e => {
            const touchEndX = e.changedTouches[0].screenX;
            const touchEndY = e.changedTouches[0].screenY;
            const diffX = touchStartX - touchEndX;
            const diffY = touchStartY - touchEndY;

            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
                // Yatay Kaydırma
                if (diffX > 0) window.nextStory(); // Sola Kaydırma (Sonraki)
                else window.prevStory(); // Sağa Kaydırma (Önceki)
            } else if (diffY < -100) {
                // Aşağı Kaydırma (Kapat)
                window.closeStoryViewer();
            } else {
                // Sadece Tıklama (Resume)
                window.resumeStory();
            }
        });
    }
});

// =====================================
// INSTAGRAM SÜRÜKLE-BIRAK HİKAYE EDİTÖRÜ (VİDEO DESTEKLİ)
// =====================================

window.openAddStoryModal = function() {
    document.getElementById('add-story-modal').style.display = 'flex'; 
    document.getElementById('story-text-input').value = ''; 
    const fileInput = document.getElementById('story-image-input');
    fileInput.value = ''; 
    fileInput.accept = "image/*,video/mp4,video/webm"; // Video desteği açıldı
    
    document.getElementById('editor-image-preview').style.display = 'none'; 
    document.getElementById('editor-text-preview').innerText = '';
    document.getElementById('editor-text-preview').style.pointerEvents = 'none'; 
    document.getElementById('editor-text-preview').style.background = 'transparent';
    document.getElementById('img-scale-slider').disabled = true; 
    document.getElementById('text-scale-slider').disabled = true;
    window.editorState.image = { left: 50, top: 50, scale: 1 }; window.editorState.text = { left: 50, top: 50, scale: 1 }; window.applyEditorTransforms();
};

window.updateEditorText = function(val) {
    const txtEl = document.getElementById('editor-text-preview'); txtEl.innerText = val;
    if(val.trim() !== "") { txtEl.style.pointerEvents = 'auto'; txtEl.style.background = 'rgba(0,0,0,0.5)'; document.getElementById('text-scale-slider').disabled = false; } 
    else { txtEl.style.pointerEvents = 'none'; txtEl.style.background = 'transparent'; document.getElementById('text-scale-slider').disabled = true; }
};

window.loadEditorImage = function(event) {
    const file = event.target.files[0];
    if(file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.getElementById('editor-image-preview'); 
            img.src = e.target.result; 
            img.style.display = 'block'; 
            document.getElementById('img-scale-slider').disabled = false;
        }
        reader.readAsDataURL(file);
    }
};

window.updateScale = function(type, val) { window.editorState[type].scale = parseFloat(val); window.applyEditorTransforms(); };

window.applyEditorTransforms = function() {
    const imgEl = document.getElementById('editor-image-preview'); const txtEl = document.getElementById('editor-text-preview');
    const iState = window.editorState.image; const tState = window.editorState.text;
    imgEl.style.left = iState.left + '%'; imgEl.style.top = iState.top + '%'; imgEl.style.transform = `translate(-50%, -50%) scale(${iState.scale})`;
    txtEl.style.left = tState.left + '%'; txtEl.style.top = tState.top + '%'; txtEl.style.transform = `translate(-50%, -50%) scale(${tState.scale})`;
};

function makeDraggable(elId, type) {
    const el = document.getElementById(elId); if(!el) return;
    const board = document.getElementById('story-editor-board'); let isDragging = false, startX, startY, initLeft, initTop;
    const startDrag = (e) => { if(e.target !== el) return; isDragging = true; startX = e.touches ? e.touches[0].clientX : e.clientX; startY = e.touches ? e.touches[0].clientY : e.clientY; initLeft = window.editorState[type].left; initTop = window.editorState[type].top; el.style.cursor = 'grabbing'; e.preventDefault(); };
    const doDrag = (e) => { if(!isDragging) return; let currentX = e.touches ? e.touches[0].clientX : e.clientX; let currentY = e.touches ? e.touches[0].clientY : e.clientY; let dx = currentX - startX; let dy = currentY - startY; window.editorState[type].left = initLeft + (dx / board.offsetWidth) * 100; window.editorState[type].top = initTop + (dy / board.offsetHeight) * 100; window.applyEditorTransforms(); };
    const endDrag = () => { isDragging = false; el.style.cursor = 'grab'; };
    el.addEventListener('mousedown', startDrag); el.addEventListener('touchstart', startDrag, {passive: false}); document.addEventListener('mousemove', doDrag); document.addEventListener('touchmove', doDrag, {passive: false}); document.addEventListener('mouseup', endDrag); document.addEventListener('touchend', endDrag);
}

setTimeout(() => { makeDraggable('editor-image-preview', 'image'); makeDraggable('editor-text-preview', 'text'); }, 1000);

document.getElementById('submit-story-btn')?.addEventListener('click', async () => {
    const textVal = document.getElementById('story-text-input').value.trim();
    let rawFile = document.getElementById('story-image-input').files[0];
    let file = rawFile;
    if(!textVal && !rawFile) return;

    let mediaType = 'image';
    if(rawFile && rawFile.type.startsWith('video/')) {
        mediaType = 'video';
        if (rawFile.size > 25 * 1024 * 1024) { alert("Video 25 MB'dan büyük olamaz!"); return; } // Video sınırı
    } else if (rawFile && rawFile.size > 10 * 1024 * 1024) { 
        alert("Hikaye fotoğrafı 10 MB'dan büyük olamaz!"); return; 
    }

    const btn = document.getElementById('submit-story-btn'); btn.disabled = true; btn.innerText = mediaType === 'video' ? "Video Yükleniyor..." : "Sıkıştırılıyor...";
    try {
        let imgUrl = null;
        if(rawFile) { 
            // Videoyu sıkıştırma, direkt yükle. Sadece resmi sıkıştır.
            if(mediaType === 'image' && window.compressImage) file = await window.compressImage(rawFile, 1080, 1920, 0.7);
            
            btn.innerText = "Yükleniyor...";
            const fileName = `stories/${Date.now()}_${file.name}`;
            const storageRef = ref(storage, fileName);
            await uploadBytes(storageRef, file);
            imgUrl = await getDownloadURL(storageRef);
        }
        const finalLayout = JSON.parse(JSON.stringify(window.editorState));
        const safeText = textVal ? DOMPurify.sanitize(textVal) : '';
        const newStory = { id: 'story_' + generateStoryId(), text: safeText, imageUrl: imgUrl, mediaType: mediaType, createdAt: Date.now(), likes: [], views: [], layout: finalLayout };

        await updateDoc(doc(db, "users", window.myUsername), { stories: arrayUnion(newStory) });
        document.getElementById('add-story-modal').style.display = 'none';
    } catch(e) { console.error("Hikaye yükleme hatası:", e); alert("Hata oluştu."); } 
    finally { btn.disabled = false; btn.innerText = "Hikayemi Yayınla"; }
});

// =====================================
// HİKAYE GÖSTERİM MANTIĞI & VİDEO ENTEGRASYONU
// =====================================

window.pauseStory = function() { 
    isStoryPaused = true; 
    if(storyTimerInterval) { clearInterval(storyTimerInterval); storyTimerInterval = null; } 
    const vidEl = document.getElementById('story-viewer-video');
    if(vidEl && !vidEl.paused) vidEl.pause();
};

window.resumeStory = function() { 
    if(document.getElementById('story-viewer-overlay').style.display === 'flex') { 
        isStoryPaused = false; 
        
        const vidEl = document.getElementById('story-viewer-video');
        if(vidEl && vidEl.style.display === 'block') {
            vidEl.play(); // Video ise videoyu oynat, timer'ı video tetikleyecek
        } else {
            if(storyTimerInterval) { clearInterval(storyTimerInterval); } 
            storyTimerInterval = setInterval(window.storyTick, 100); 
        }
    } 
};

window.renderStories = function() {
    const container = document.getElementById('stories-container'); if(!container || !window.allUsersData || !window.myUsername) return; 
    window.activeStoryUsers = []; let myStories = []; const readStories = JSON.parse(localStorage.getItem('readStories') || '[]');
    Object.keys(window.allUsersData).forEach(uid => {
        const uData = window.allUsersData[uid];
        if(uData.stories && Array.isArray(uData.stories)) {
            const valid = uData.stories.filter(s => Date.now() - s.createdAt < 24*60*60*1000);
            if(valid.length > 0) { if(uid === window.myUsername) myStories = valid; else if(window.myFollowingList.includes(uid)) { window.activeStoryUsers.push({ username: uid, stories: valid }); } }
        }
    });
    if(myStories.length > 0) window.activeStoryUsers.unshift({ username: window.myUsername, stories: myStories });

    let html = '';
    if(myStories.length === 0) {
        const myAvatar = window.allUsersData[window.myUsername]?.avatarUrl ? `<img src="${window.allUsersData[window.myUsername].avatarUrl}">` : '👤';
        html += `<div class="story-item" onclick="window.openAddStoryModal()"><div class="story-avatar-wrapper add-story"><div class="story-avatar">${myAvatar}<div class="story-add-badge">+</div></div></div><div class="story-username">Sen</div></div>`;
    }

    window.activeStoryUsers.forEach(uObj => {
        const uData = window.allUsersData[uObj.username]; const avatar = uData.avatarUrl ? `<img src="${uData.avatarUrl}">` : '👤'; 
        const safeName = uObj.username === window.myUsername ? 'Sen' : DOMPurify.sanitize(uData.fullName ? uData.fullName.split(' ')[0] : uObj.username);
        const allRead = uObj.stories.every(s => readStories.includes(s.id)); const ringClass = allRead ? 'read' : 'unread';
        html += `<div class="story-item" onclick="window.openStoryViewer('${uObj.username}')"><div class="story-avatar-wrapper ${ringClass}"><div class="story-avatar">${avatar}</div></div><div class="story-username">${safeName}</div></div>`;
    });
    container.innerHTML = html;
}

window.openStoryViewer = function(username) { window.currentStoryUserIndex = window.activeStoryUsers.findIndex(u => u.username === username); window.currentStoryIndex = 0; if(window.currentStoryUserIndex !== -1) { document.getElementById('story-viewer-overlay').style.display = 'flex'; renderCurrentStory(); } }

window.closeStoryViewer = function() { 
    document.getElementById('story-viewer-overlay').style.display = 'none'; 
    document.getElementById('story-reply-input').value = ''; 
    if(storyTimerInterval) { clearInterval(storyTimerInterval); storyTimerInterval = null; }
    const vidEl = document.getElementById('story-viewer-video');
    if(vidEl) { vidEl.pause(); vidEl.src = ""; } // Video temizliği
    isStoryPaused = false; 
    window.currentStoryIndex = 0;
    if(window.renderStories) window.renderStories(); 
}

window.storyTick = function() { 
    storyProgress += 2; 
    const fill = document.getElementById(`story-fill-${window.currentStoryIndex}`); 
    if(fill) fill.style.width = storyProgress + '%'; 
    if(storyProgress >= 100) { 
        if(storyTimerInterval) { clearInterval(storyTimerInterval); storyTimerInterval = null; }
        window.nextStory(); 
    } 
};

window.preloadNextStory = function() {
    try {
        const currentUser = window.activeStoryUsers[window.currentStoryUserIndex];
        if(!currentUser) return;
        const nextIndex = window.currentStoryIndex + 1;
        
        let nextStoryObj = null;
        if(nextIndex < currentUser.stories.length) nextStoryObj = currentUser.stories[nextIndex];
        else if (window.currentStoryUserIndex + 1 < window.activeStoryUsers.length) nextStoryObj = window.activeStoryUsers[window.currentStoryUserIndex + 1].stories[0];

        if(nextStoryObj && nextStoryObj.imageUrl && nextStoryObj.mediaType !== 'video') {
            const img = new Image(); img.src = nextStoryObj.imageUrl;
        }
    } catch(e) {}
};

function renderCurrentStory() {
    if(storyTimerInterval) { clearInterval(storyTimerInterval); storyTimerInterval = null; }
    storyProgress = 0; 
    
    const userObj = window.activeStoryUsers[window.currentStoryUserIndex]; const story = userObj.stories[window.currentStoryIndex];
    let readStories = JSON.parse(localStorage.getItem('readStories') || '[]');
    if(!readStories.includes(story.id)) { readStories.push(story.id); localStorage.setItem('readStories', JSON.stringify(readStories)); }
    if (userObj.username !== window.myUsername && !(story.views || []).includes(window.myUsername)) { addStoryView(userObj.username, story.id); }

    const uData = window.allUsersData[userObj.username];
    const safeFullName = DOMPurify.sanitize(uData.fullName || userObj.username);

    document.getElementById('story-viewer-avatar-container').innerHTML = uData.avatarUrl ? `<img src="${uData.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">` : '👤';
    document.getElementById('story-viewer-name').innerHTML = `${safeFullName} ${uData.isVerified ? '<span style="color:#1da1f2; font-size:14px; margin-left:4px;">☑️</span>' : ''}`;
    const secs = Math.floor((Date.now() - story.createdAt) / 1000); document.getElementById('story-viewer-time').innerText = secs < 60 ? `${secs}s` : (secs < 3600 ? `${Math.floor(secs/60)}d` : `${Math.floor(secs/3600)}sa`);

    if (userObj.username === window.myUsername) { document.getElementById('story-footer').style.display = 'none'; document.getElementById('story-footer-owner').style.display = 'flex'; document.getElementById('story-view-count').innerText = (story.views || []).length; } 
    else { document.getElementById('story-footer').style.display = 'flex'; document.getElementById('story-footer-owner').style.display = 'none'; document.getElementById('story-like-btn').innerText = story.likes && story.likes.includes(window.myUsername) ? '❤️' : '🤍'; }

    const imgEl = document.getElementById('story-viewer-image'); 
    const txtEl = document.getElementById('story-viewer-text');
    
    // VİDEO ELEMENTİ OLUŞTURMA VEYA SEÇME
    let vidEl = document.getElementById('story-viewer-video');
    if(!vidEl) {
        vidEl = document.createElement('video');
        vidEl.id = 'story-viewer-video';
        vidEl.style.width = '100%'; vidEl.style.height = '100%'; vidEl.style.objectFit = 'cover';
        vidEl.style.position = 'absolute'; vidEl.style.top = '0'; vidEl.style.left = '0';
        vidEl.playsInline = true; vidEl.autoplay = true; vidEl.muted = false;
        imgEl.parentNode.appendChild(vidEl);
    }

    if(story.mediaType === 'video') {
        imgEl.style.display = 'none';
        vidEl.style.display = 'block';
        vidEl.src = story.imageUrl;
        vidEl.onended = window.nextStory;
        
        vidEl.ontimeupdate = () => {
            if(!isStoryPaused) {
                const percentage = (vidEl.currentTime / vidEl.duration) * 100;
                const fill = document.getElementById(`story-fill-${window.currentStoryIndex}`); 
                if(fill) fill.style.width = percentage + '%';
            }
        };
    } else {
        vidEl.style.display = 'none'; vidEl.pause(); vidEl.src = "";
        if(story.imageUrl) { imgEl.src = story.imageUrl; imgEl.style.display = 'block'; } else { imgEl.style.display = 'none'; }
    }

    if(story.text) { txtEl.innerText = story.text; txtEl.style.display = 'block'; } else { txtEl.style.display = 'none'; } 

    // Düzenleme Katmanı
    const targetMedia = story.mediaType === 'video' ? vidEl : imgEl;
    if(story.layout) {
        targetMedia.style.width = 'auto'; targetMedia.style.height = 'auto'; targetMedia.style.maxWidth = '100%'; targetMedia.style.maxHeight = '100%'; targetMedia.style.left = story.layout.image.left + '%'; targetMedia.style.top = story.layout.image.top + '%'; targetMedia.style.transform = `translate(-50%, -50%) scale(${story.layout.image.scale})`;
        txtEl.style.left = story.layout.text.left + '%'; txtEl.style.top = story.layout.text.top + '%'; txtEl.style.transform = `translate(-50%, -50%) scale(${story.layout.text.scale})`; txtEl.style.background = story.text ? 'rgba(0,0,0,0.5)' : 'transparent';
    } else {
        targetMedia.style.width = '100%'; targetMedia.style.height = '100%'; targetMedia.style.maxWidth = 'none'; targetMedia.style.maxHeight = 'none'; targetMedia.style.left = '0'; targetMedia.style.top = '0'; targetMedia.style.transform = 'none'; targetMedia.style.objectFit = 'cover';
        txtEl.style.left = '50%'; txtEl.style.top = '50%'; txtEl.style.transform = 'translate(-50%, -50%)'; txtEl.style.background = 'rgba(0,0,0,0.5)';
    }

    const progressContainer = document.getElementById('story-progress-container'); progressContainer.innerHTML = '';
    userObj.stories.forEach((s, idx) => { progressContainer.innerHTML += `<div class="story-progress-bar"><div class="story-progress-fill" id="story-fill-${idx}" style="width:${idx < window.currentStoryIndex ? '100%' : '0%'}"></div></div>`; });
    
    // Eğer resimse timer'ı başlat, video ise videonun timeupdate'i ilerletecek.
    if (!isStoryPaused && story.mediaType !== 'video') { storyTimerInterval = setInterval(window.storyTick, 100); }
    window.preloadNextStory();
}

async function addStoryView(ownerUsername, storyId) {
    const userObj = window.activeStoryUsers.find(u => u.username === ownerUsername);
    if(userObj) { const s = userObj.stories.find(st => st.id === storyId); if(s) { if(!s.views) s.views = []; if(!s.views.includes(window.myUsername)) s.views.push(window.myUsername); } }
    try {
        const userRef = doc(db, "users", ownerUsername); const userSnap = await getDoc(userRef);
        if(userSnap.exists() && userSnap.data().stories) {
            const updatedStories = userSnap.data().stories.map(s => { if(s.id === storyId) { let sViews = s.views || []; if(!sViews.includes(window.myUsername)) sViews.push(window.myUsername); return { ...s, views: sViews }; } return s; });
            await updateDoc(userRef, { stories: updatedStories });
        }
    } catch(e) {}
}

window.nextStory = function() { const userObj = window.activeStoryUsers[window.currentStoryUserIndex]; if(window.currentStoryIndex < userObj.stories.length - 1) { window.currentStoryIndex++; renderCurrentStory(); } else { if(window.currentStoryUserIndex < window.activeStoryUsers.length - 1) { window.currentStoryUserIndex++; window.currentStoryIndex = 0; renderCurrentStory(); } else { window.closeStoryViewer(); } } }
window.prevStory = function() { if(window.currentStoryIndex > 0) { window.currentStoryIndex--; renderCurrentStory(); } else { if(window.currentStoryUserIndex > 0) { window.currentStoryUserIndex--; window.currentStoryIndex = window.activeStoryUsers[window.currentStoryUserIndex].stories.length - 1; renderCurrentStory(); } else { renderCurrentStory(); } } }

// =====================================
// UÇUŞAN EMOJİLER (QUICK REACTIONS)
// =====================================

window.sendQuickReaction = async function(emoji) {
    const targetUser = window.activeStoryUsers[window.currentStoryUserIndex]?.username; 
    if (!targetUser || targetUser === window.myUsername) return;

    // 1. Uçuşan Animasyon Oluştur
    const floater = document.createElement('div');
    floater.innerText = emoji;
    floater.style.position = 'absolute';
    floater.style.bottom = '80px';
    floater.style.left = (Math.random() * 60 + 20) + '%'; // Rastgele yatay konum
    floater.style.fontSize = '40px';
    floater.style.pointerEvents = 'none';
    floater.style.transition = 'all 1.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    floater.style.zIndex = '9999';
    document.getElementById('story-viewer-overlay').appendChild(floater);

    // Animasyonu Tetikle
    setTimeout(() => {
        floater.style.transform = `translateY(-400px) scale(1.5) rotate(${Math.random() * 40 - 20}deg)`;
        floater.style.opacity = '0';
    }, 50);
    setTimeout(() => floater.remove(), 1550);

    // 2. DM Gönder (Sessizce)
    try {
        const chatId = [window.myUsername, targetUser].sort().join('_'); 
        const story = window.activeStoryUsers[window.currentStoryUserIndex].stories[window.currentStoryIndex];
        let storySummary = "🖼️ Hikaye Tepkisi: " + (story.mediaType === 'video' ? "(Video)" : (story.imageUrl ? "(Görsel)" : `"${story.text.substring(0, 20)}..."`));
        
        await addDoc(collection(db, "chats", chatId, "messages"), { text: `${storySummary}\n\n${emoji}`, sender: window.myUsername, createdAt: serverTimestamp(), isRead: false, type: 'regular' });
        await setDoc(doc(db, "chats", chatId), { participants: [window.myUsername, targetUser], lastMessage: `${emoji} Hikayeye tepki`, lastSender: window.myUsername, unreadBy: [targetUser], updatedAt: serverTimestamp() }, { merge: true });
    } catch(e) { console.error("Tepki gönderilemedi:", e); }
};

window.sendStoryReply = async function() {
    const input = document.getElementById('story-reply-input'); const text = input.value.trim(); if(!text) return;
    const targetUser = window.activeStoryUsers[window.currentStoryUserIndex].username; if (targetUser === window.myUsername) return; 
    const chatId = [window.myUsername, targetUser].sort().join('_'); const story = window.activeStoryUsers[window.currentStoryUserIndex].stories[window.currentStoryIndex];
    let storySummary = "🖼️ Hikayeye Yanıt: " + (story.mediaType === 'video' ? "(Video)" : (story.imageUrl ? "(Görsel)" : `"${story.text.substring(0, 20)}..."`));
    const safeText = DOMPurify.sanitize(text);
    await addDoc(collection(db, "chats", chatId, "messages"), { text: `${storySummary}\n\n${safeText}`, sender: window.myUsername, createdAt: serverTimestamp(), isRead: false, type: 'regular' });
    await setDoc(doc(db, "chats", chatId), { participants: [window.myUsername, targetUser], lastMessage: "Hikayeye yanıt", lastSender: window.myUsername, unreadBy: [targetUser], updatedAt: serverTimestamp() }, { merge: true });
    alert("Yanıtınız gönderildi! 🚀"); input.value = ''; window.resumeStory(); window.closeStoryViewer();
};

window.likeStory = async function() {
    const targetUser = window.activeStoryUsers[window.currentStoryUserIndex]?.username; if (!targetUser || targetUser === window.myUsername) return;
    const story = window.activeStoryUsers[window.currentStoryUserIndex].stories[window.currentStoryIndex]; if (!story) return;
    const isLiked = story.likes && story.likes.includes(window.myUsername);
    if(isLiked) { story.likes = story.likes.filter(u => u !== window.myUsername); document.getElementById('story-like-btn').innerText = '🤍'; } 
    else { if(!story.likes) story.likes = []; story.likes.push(window.myUsername); document.getElementById('story-like-btn').innerText = '❤️'; window.sendQuickReaction('❤️'); } // Beğenilince de kalp uçsun
    try {
        const userRef = doc(db, "users", targetUser); const userSnap = await getDoc(userRef);
        if(userSnap.exists()) {
            const updatedStories = userSnap.data().stories.map(s => { if(s.id === story.id) { let sLikes = s.likes || []; if(isLiked) sLikes = sLikes.filter(u => u !== window.myUsername); else { if(!sLikes.includes(window.myUsername)) sLikes.push(window.myUsername); } return { ...s, likes: sLikes }; } return s; });
            await updateDoc(userRef, { stories: updatedStories });
            if(!isLiked) { await setDoc(doc(db, "chats", [window.myUsername, targetUser].sort().join('_')), { participants: [window.myUsername, targetUser], lastMessage: "❤️ Hikaye beğenildi", lastSender: window.myUsername, unreadBy: [targetUser], updatedAt: serverTimestamp() }, { merge: true }); }
        }
    } catch(e) {}
};

window.deleteCurrentStory = async function() {
    if(confirm("Bu hikayeyi kalıcı olarak silmek istediğinize emin misiniz?")) {
        const storyId = window.activeStoryUsers[window.currentStoryUserIndex].stories[window.currentStoryIndex].id;
        try {
            const userRef = doc(db, "users", window.myUsername); const userSnap = await getDoc(userRef);
            if(userSnap.exists()) { await updateDoc(userRef, { stories: userSnap.data().stories.filter(s => s.id !== storyId) }); document.getElementById('story-details-modal').style.display = 'none'; window.closeStoryViewer(); }
        } catch(e) {}
    }
};

window.openStoryDetailsModal = function() { window.pauseStory(); document.getElementById('story-details-modal').style.display = 'flex'; window.switchStoryDetailsTab('views'); };
window.closeStoryDetailsModal = function() { document.getElementById('story-details-modal').style.display = 'none'; window.resumeStory(); }
window.switchStoryDetailsTab = function(tabName) {
    storyDetailsTab = tabName; document.querySelectorAll('#story-details-modal .feed-tab').forEach(t => t.classList.remove('active'));
    if(tabName === 'views') document.getElementById('tab-story-views').classList.add('active'); else document.getElementById('tab-story-likes').classList.add('active');
    const container = document.getElementById('story-details-list'); container.innerHTML = '';
    try {
        const userObj = window.activeStoryUsers[window.currentStoryUserIndex]; if (!userObj || !userObj.stories) return; const story = userObj.stories[window.currentStoryIndex]; if (!story) return;
        const listData = tabName === 'views' ? (story.views || []) : (story.likes || []);
        if (listData.length === 0) { container.innerHTML = `<p style="text-align:center; color:#64748b; padding:20px;">Henüz kimse yok.</p>`; return; }
        let html = '';
        listData.forEach(uname => {
            let uData = window.allUsersData[uname] || {}; let avatarHtml = uData.avatarUrl ? `<img src="${uData.avatarUrl}">` : `👤`; let vHtml = uData.isVerified ? '<span class="verified-badge" style="font-size:14px; margin-left:4px;">☑️</span>' : '';
            const safeName = DOMPurify.sanitize(uData.fullName || uname);
            html += `<div class="user-row" onclick="window.location.href='profile.html?user=${uname}'"><div class="row-avatar">${avatarHtml}</div><div><div style="font-weight:700; color:#0f172a;">${safeName} ${vHtml}</div><div style="font-size:13px; color:#64748b;">@${uname}</div></div></div>`;
        });
        container.innerHTML = html;
    } catch(e) {}
};

window.openStoryShareModal = function() {
    window.pauseStory(); const container = document.getElementById('story-share-list'); container.innerHTML = '';
    if(window.myFollowingList.length === 0) { container.innerHTML = '<div style=\"padding:20px; text-align:center; color:#64748b;\">İletmek için önce ağınıza kişi eklemelisiniz.</div>'; } 
    else {
        let html = '';
        window.myFollowingList.forEach(uname => {
            let uData = window.allUsersData[uname] || {}; let avatarHtml = uData.avatarUrl ? `<img src=\"${uData.avatarUrl}\">` : `👤`; let vHtml = uData.isVerified ? '<span class=\"verified-badge\">☑️</span>' : '';
            const safeName = DOMPurify.sanitize(uData.fullName || uname);
            html += `<div class=\"user-row\"><div class=\"row-avatar\">${avatarHtml}</div><div style=\"flex:1;\"><div style=\"font-weight:700;\">${safeName} ${vHtml}</div><div style=\"font-size:13px; color:#64748b;\">@${uname}</div></div><button onclick=\"window.sendStoryAsMessage('${uname}')\" style=\"background:#f1f5f9; color:#0f172a; border:1px solid #cbd5e1; padding:6px 15px; border-radius:6px; font-weight:600; cursor:pointer;\">Gönder</button></div>`;
        });
        container.innerHTML = html;
    }
    document.getElementById('story-share-modal').style.display = 'flex';
};

window.closeStoryShareModal = function() { document.getElementById('story-share-modal').style.display = 'none'; window.resumeStory(); }
window.sendStoryAsMessage = async function(targetUser) {
    const chatId = [window.myUsername, targetUser].sort().join('_'); const storyOwner = window.activeStoryUsers[window.currentStoryUserIndex].username;
    await addDoc(collection(db, "chats", chatId, "messages"), { text: `🔗 @${storyOwner} adlı kullanıcının hikayesi iletildi.`, sender: window.myUsername, createdAt: serverTimestamp(), isRead: false, type: 'regular' });
    await setDoc(doc(db, "chats", chatId), { participants: [window.myUsername, targetUser], lastMessage: '🔗 Hikaye İletildi', lastSender: window.myUsername, updatedAt: serverTimestamp() }, { merge: true });
    alert(`Hikaye iletildi.`); window.closeStoryShareModal();
};