import { collection, addDoc, doc, updateDoc, arrayUnion, arrayRemove, getDoc, getDocs, query, where, orderBy, limit, deleteDoc, serverTimestamp, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";
import { auth, db, storage } from './firebase-config.js';
window.auth = auth;

// =====================================
// GLOBAL HİKÂYE DEĞİŞKENLERİ
// =====================================
window.activeStoryUsers = []; 
window.currentStoryUserIndex = 0; 
window.currentStoryIndex = 0; 
let storyTimerInterval = null; 
let storyProgress = 0; 
let isStoryPaused = false; 
let storyDetailsTab = 'views';
let pointerDownTime = 0;
let isLongPress = false;
let storiesUnsubscribe = null;
window.editorState = { image: { left: 50, top: 50, scale: 1 }, text: { left: 50, top: 50, scale: 1 } };

function generateStoryId() { return 'story_' + Math.random().toString(36).substr(2, 9); }

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
        }, {passive: true});

        viewer.addEventListener('touchend', e => {
            const touchEndX = e.changedTouches[0].screenX;
            const touchEndY = e.changedTouches[0].screenY;
            const diffX = touchStartX - touchEndX;
            const diffY = touchStartY - touchEndY;

            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
                if (diffX > 0) window.nextStory();
                else window.prevStory();
            } else if (diffY < -100) {
                window.closeStoryViewer();
            }
        });
    }
});

// =====================================
// 2. POINTER HANDLERS (Masaüstü Tıklama + Basılı Tutma)
// =====================================
window.handleStoryPointerDown = function() {
    pointerDownTime = Date.now();
    isLongPress = false;
    // 300ms sonra basılı tutma → duraklatma
    window._storyLongPressTimer = setTimeout(() => {
        isLongPress = true;
        window.pauseStory();
    }, 300);
};

window.handleStoryPointerUp = function(direction) {
    clearTimeout(window._storyLongPressTimer);
    const elapsed = Date.now() - pointerDownTime;
    
    if (isLongPress) {
        // Uzun basış sona erdi → devam et
        isLongPress = false;
        window.resumeStory();
    } else if (elapsed < 300) {
        // Kısa tıklama → ileri/geri
        if (direction === 'next') window.nextStory();
        else window.prevStory();
    }
};

// =====================================
// 3. SÜRÜKLE-BIRAK HİKÂYE EDİTÖRÜ (VİDEO DESTEKLİ)
// =====================================

window.openAddStoryModal = function() {
    document.getElementById('add-story-modal').style.display = 'flex'; 
    document.getElementById('story-text-input').value = ''; 
    const fileInput = document.getElementById('story-image-input');
    fileInput.value = ''; 
    fileInput.accept = "image/*,video/mp4,video/webm";
    
    // Görsel önizlemeyi gizle
    const imgPreview = document.getElementById('editor-image-preview');
    imgPreview.style.display = 'none';
    imgPreview.src = '';
    
    // Video önizlemeyi gizle
    const vidPreview = document.getElementById('editor-video-preview');
    if (vidPreview) { vidPreview.style.display = 'none'; vidPreview.src = ''; }
    
    document.getElementById('editor-text-preview').innerText = '';
    document.getElementById('editor-text-preview').style.pointerEvents = 'none'; 
    document.getElementById('editor-text-preview').style.background = 'transparent';
    document.getElementById('img-scale-slider').disabled = true; 
    document.getElementById('text-scale-slider').disabled = true;
    window.editorState.image = { left: 50, top: 50, scale: 1 }; 
    window.editorState.text = { left: 50, top: 50, scale: 1, color: 'white', bg: 'transparent', weight: 'normal' }; 
    window.closeStoryCamera();
    window.applyEditorTransforms();
};

window.toggleTextBackground = function() {
    const bgStates = ['transparent', 'rgba(0,0,0,0.5)', 'rgba(255,255,255,0.7)'];
    const currentIdx = bgStates.indexOf(window.editorState.text.bg);
    window.editorState.text.bg = bgStates[(currentIdx + 1) % bgStates.length];
    window.applyEditorTransforms();
};

window.toggleTextBold = function() {
    window.editorState.text.weight = window.editorState.text.weight === 'bold' ? 'normal' : 'bold';
    window.applyEditorTransforms();
};

window.changeTextColor = function(color) {
    window.editorState.text.color = color;
    window.applyEditorTransforms();
};

let cameraStream = null;
window.openStoryCamera = async function() {
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        const videoEl = document.getElementById('story-camera-video');
        videoEl.srcObject = cameraStream;
        document.getElementById('story-camera-container').style.display = 'block';
    } catch(e) {
        alert("Kameraya erişilemedi: " + e.message);
    }
};

window.closeStoryCamera = function() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        cameraStream = null;
    }
    const container = document.getElementById('story-camera-container');
    if(container) container.style.display = 'none';
};

window.captureStoryPhoto = function() {
    const videoEl = document.getElementById('story-camera-video');
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    canvas.getContext('2d').drawImage(videoEl, 0, 0);
    
    // Convert to File
    canvas.toBlob((blob) => {
        const file = new File([blob], "camera_capture.jpg", { type: "image/jpeg" });
        
        // Mock a file input event
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        document.getElementById('story-image-input').files = dataTransfer.files;
        
        window.loadEditorImage({ target: { files: [file] } });
        window.closeStoryCamera();
    }, 'image/jpeg', 0.8);
};

window.updateEditorText = function(val) {
    const txtEl = document.getElementById('editor-text-preview'); txtEl.innerText = val;
    if(val.trim() !== "") { 
        txtEl.style.pointerEvents = 'auto'; 
        if(window.editorState.text.bg === 'transparent') window.editorState.text.bg = 'rgba(0,0,0,0.5)';
        document.getElementById('text-scale-slider').disabled = false; 
    } 
    else { 
        txtEl.style.pointerEvents = 'none'; 
        window.editorState.text.bg = 'transparent'; 
        document.getElementById('text-scale-slider').disabled = true; 
    }
    window.applyEditorTransforms();
};

// Video + Görsel önizleme düzeltmesi
window.loadEditorImage = function(event) {

    const file = event.target.files[0];
    if(!file) return;
    
    const imgPreview = document.getElementById('editor-image-preview');
    const vidPreview = document.getElementById('editor-video-preview');
    
    if (file.type.startsWith('video/')) {
        // VIDEO: <video> elementinde göster
        imgPreview.style.display = 'none';
        if (vidPreview) {
            const url = URL.createObjectURL(file);
            vidPreview.src = url;
            vidPreview.style.display = 'block';
            vidPreview.muted = true;
            vidPreview.play().catch(() => {});
            document.getElementById('img-scale-slider').disabled = false;
        }
    } else {
        // GÖRSEL: <img> elementinde göster
        if (vidPreview) { vidPreview.style.display = 'none'; vidPreview.src = ''; }
        const reader = new FileReader();
        reader.onload = function(e) {
            imgPreview.src = e.target.result; 
            imgPreview.style.display = 'block'; 
            document.getElementById('img-scale-slider').disabled = false;
        }
        reader.readAsDataURL(file);
    }
};

window.updateScale = function(type, val) { window.editorState[type].scale = parseFloat(val); window.applyEditorTransforms(); };

window.applyEditorTransforms = function() {
    const imgEl = document.getElementById('editor-image-preview'); const txtEl = document.getElementById('editor-text-preview');
    const vidEl = document.getElementById('editor-video-preview');
    const iState = window.editorState.image; const tState = window.editorState.text;
    imgEl.style.left = iState.left + '%'; imgEl.style.top = iState.top + '%'; imgEl.style.transform = `translate(-50%, -50%) scale(${iState.scale})`;
    if (vidEl) { vidEl.style.left = iState.left + '%'; vidEl.style.top = iState.top + '%'; vidEl.style.transform = `translate(-50%, -50%) scale(${iState.scale})`; }
    txtEl.style.left = tState.left + '%'; txtEl.style.top = tState.top + '%'; txtEl.style.transform = `translate(-50%, -50%) scale(${tState.scale})`;
    txtEl.style.color = tState.color || 'white';
    txtEl.style.backgroundColor = tState.bg || 'transparent';
    txtEl.style.fontWeight = tState.weight || 'normal';
    txtEl.style.padding = tState.bg === 'transparent' ? '0' : '5px 10px';
    txtEl.style.borderRadius = '8px';
};

function makeDraggable(elId, type) {
    const el = document.getElementById(elId); if(!el) return;
    const board = document.getElementById('story-editor-board'); let isDragging = false, startX, startY, initLeft, initTop;
    const startDrag = (e) => { if(e.target !== el) return; isDragging = true; startX = e.touches ? e.touches[0].clientX : e.clientX; startY = e.touches ? e.touches[0].clientY : e.clientY; initLeft = window.editorState[type].left; initTop = window.editorState[type].top; el.style.cursor = 'grabbing'; e.preventDefault(); };
    const doDrag = (e) => { if(!isDragging) return; let currentX = e.touches ? e.touches[0].clientX : e.clientX; let currentY = e.touches ? e.touches[0].clientY : e.clientY; let dx = currentX - startX; let dy = currentY - startY; window.editorState[type].left = initLeft + (dx / board.offsetWidth) * 100; window.editorState[type].top = initTop + (dy / board.offsetHeight) * 100; window.applyEditorTransforms(); };
    const endDrag = () => { isDragging = false; el.style.cursor = 'grab'; };
    el.addEventListener('mousedown', startDrag); el.addEventListener('touchstart', startDrag, {passive: false}); document.addEventListener('mousemove', doDrag); document.addEventListener('touchmove', doDrag, {passive: false}); document.addEventListener('mouseup', endDrag); document.addEventListener('touchend', endDrag);
}

setTimeout(() => { 
    makeDraggable('editor-image-preview', 'image'); 
    makeDraggable('editor-video-preview', 'image'); // Video da image koordinatlarını paylaşır
    makeDraggable('editor-text-preview', 'text'); 
}, 1000);

// =====================================
// 4. HİKÂYE PAYLAŞMA (YENİ: stories KOLEKSİYONU)
// =====================================
document.getElementById('submit-story-btn')?.addEventListener('click', async () => {
    try {
        const uSnap = await getDoc(doc(db, "users", window.myUsername));
        if (uSnap.exists()) {
            const uData = uSnap.data();
            const today = new Date().toISOString().split('T')[0];
            if (uData.lastStoryDate === today && (uData.storyCountToday || 0) >= 10) {
                alert("Günlük 10 hikaye sınırına ulaştınız! Lütfen yarın tekrar deneyin.");
                return;
            }
        }
    } catch(e) {}

    const textVal = document.getElementById('story-text-input').value.trim();
    if (textVal && textVal.length > 300) { alert("Hikaye metni en fazla 300 karakter olabilir!"); return; }
    let rawFile = document.getElementById('story-image-input').files[0];
    let file = rawFile;
    if(!textVal && !rawFile) return;

    let mediaType = 'image';
    if (rawFile) {
        const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
        const MAX_VIDEO_SIZE = 20 * 1024 * 1024;

        console.log("=== UPLOAD DEBUG (STORY) ===");
        console.log("Video adı:", rawFile.name);
        console.log("Video MIME:", rawFile.type);
        console.log("Video boyutu (bytes):", rawFile.size);
        console.log("Video boyutu (MB):", (rawFile.size / (1024 * 1024)).toFixed(2));
        console.log("İzin verilen maksimum boyut (MB):", (MAX_VIDEO_SIZE / (1024 * 1024)).toFixed(2));
        console.log("====================");

        if (rawFile.type.startsWith('video/')) {
            mediaType = 'video';
            if (!rawFile.type.match(/^video\/(mp4|webm|quicktime)/i)) { 
                alert("Sadece MP4, WEBM ve MOV video formatları yüklenebilir."); 
                return; 
            }
            if (rawFile.size > MAX_VIDEO_SIZE) {
                alert("Video boyutu çok büyük. Maksimum 20 MB video yükleyebilirsiniz."); 
                return; 
            }
        } else {
            if (!rawFile.type.match(/^(image\/(jpeg|png|webp|gif))/i)) { 
                alert("Sadece güvenli fotoğraf formatları yüklenebilir."); 
                return; 
            }
            if (rawFile.size > MAX_IMAGE_SIZE) {
                alert("Fotoğraf boyutu çok büyük. Maksimum 5 MB fotoğraf yükleyebilirsiniz."); 
                return; 
            }
        }
    }

    const btn = document.getElementById('submit-story-btn'); btn.disabled = true; btn.innerText = mediaType === 'video' ? "Video Yükleniyor..." : "Sıkıştırılıyor...";
    try {
        let imgUrl = null;
        let storagePath = null;
        if(rawFile) { 
            if(mediaType === 'image' && window.compressImage) file = await window.compressImage(rawFile, 1080, 1920, 0.7);
            
            btn.innerText = "Yükleniyor...";
            
            const uid = (window.auth && window.auth.currentUser) ? window.auth.currentUser.uid : 'anon';
            storagePath = `${mediaType === 'video' ? 'story_videos' : 'stories'}/${uid}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, "")}`;

            const storageRef = ref(storage, storagePath);
            
            await new Promise((resolve, reject) => {
                const uploadTask = uploadBytesResumable(storageRef, file, { contentType: file.type });
                uploadTask.on('state_changed', 
                    (snapshot) => {
                        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        btn.innerText = "Yükleniyor... %" + Math.round(progress);
                    },
                    (error) => reject(error),
                    () => resolve()
                );
            });

            imgUrl = await getDownloadURL(storageRef);
        }
        const finalLayout = JSON.parse(JSON.stringify(window.editorState));
        const safeText = textVal ? DOMPurify.sanitize(textVal) : '';
        
        // YENİ: Bağımsız stories koleksiyonuna yaz
        const privacyVal = document.getElementById('story-privacy-select')?.value || 'public';
        const newStory = { 
            id: generateStoryId(),
            author: window.myUsername,
            text: safeText, 
            imageUrl: imgUrl, 
            storagePath: storagePath,
            mediaType: mediaType, 
            createdAt: Date.now(), 
            likes: [], 
            views: [], 
            layout: finalLayout,
            privacy: privacyVal
        };

        await addDoc(collection(db, "stories"), newStory);
        try {
            const today = new Date().toISOString().split('T')[0];
            const uSnap = await getDoc(doc(db, "users", window.myUsername));
            if (uSnap.exists()) {
                const uData = uSnap.data();
                let newCount = (uData.lastStoryDate === today) ? (uData.storyCountToday || 0) + 1 : 1;
                await updateDoc(doc(db, "users", window.myUsername), { lastStoryDate: today, storyCountToday: newCount });
            }
        } catch(e) {}

        
        // Eski sisteme de geriye dönük uyumluluk: users dokümanına da ekle
        try {
            await updateDoc(doc(db, "users", window.myUsername), { stories: arrayUnion(newStory) });
        } catch(e) { /* eski sisteme yazamazsak sorun değil */ }
        
        document.getElementById('add-story-modal').style.display = 'none';
    } catch(e) { console.error("Hikaye yükleme hatası:", e.code || "Bilinmeyen hata"); alert("Hata oluştu."); } 
    finally { btn.disabled = false; btn.innerText = "Hikayemi Yayınla"; }
});

// =====================================
// 5. HİKÂYE GÖSTERİM & VİDEO MANTIĞI
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
            vidEl.play().catch(() => {}); // Autoplay policy safe
        } else {
            if(storyTimerInterval) { clearInterval(storyTimerInterval); } 
            storyTimerInterval = setInterval(window.storyTick, 100); 
        }
    } 
};

// =====================================
// 6. HİKÂYE RENDER (YENİ: stories koleksiyonu + geriye dönük uyumluluk)
// =====================================
window.renderStories = function() {
    const container = document.getElementById('stories-container'); 
    if(!container || !window.allUsersData || !window.myUsername) return; 
    window.activeStoryUsers = []; 
    let myStories = []; 
    const readStories = JSON.parse(localStorage.getItem('readStories') || '[]');
    const now = Date.now();
    const dayMs = 24*60*60*1000;
    
    // Hem eski users.stories hem de yeni stories koleksiyonundan verileri birleştir
    const allStoryMap = {}; // username -> stories[]
    
    // 1. Eski sistemden (users dokümanı)
    Object.keys(window.allUsersData).forEach(uid => {
        const uData = window.allUsersData[uid];
        if(uData.stories && Array.isArray(uData.stories)) {
            const valid = uData.stories.filter(s => now - s.createdAt < dayMs);
            if(valid.length > 0) {
                if(!allStoryMap[uid]) allStoryMap[uid] = [];
                valid.forEach(s => {
                    if (!allStoryMap[uid].some(existing => existing.id === s.id)) {
                        allStoryMap[uid].push(s);
                    }
                });
            }
        }
    });
    
    // 2. Yeni stories koleksiyonundan (window._cachedStories)
    if (window._cachedStories) {
        window._cachedStories.forEach(s => {
            if (now - s.createdAt < dayMs) {
                const author = s.author;
                if(!allStoryMap[author]) allStoryMap[author] = [];
                if (!allStoryMap[author].some(existing => existing.id === s.id)) {
                    allStoryMap[author].push(s);
                }
            }
        });
    }
    
    // 3. activeStoryUsers listesini oluştur
    Object.keys(allStoryMap).forEach(uid => {
        const stories = allStoryMap[uid].sort((a,b) => a.createdAt - b.createdAt);
        if (uid === window.myUsername) myStories = stories;
        else if (window.myFollowingList && window.myFollowingList.includes(uid)) {
            window.activeStoryUsers.push({ username: uid, stories: stories });
        }
    });
    
    if(myStories.length > 0) window.activeStoryUsers.unshift({ username: window.myUsername, stories: myStories });

    let html = '';
    if(myStories.length === 0) {
        const myAvatar = window.allUsersData[window.myUsername]?.avatarUrl ? `<img src="${window.sanitizeUrl(window.allUsersData[window.myUsername].avatarUrl)}">` : '👤';
        html += `<div class="flex flex-col items-center space-y-1 min-w-[72px] cursor-pointer" onclick="window.openAddStoryModal()">
    <div class="w-16 h-16 rounded-full border border-gray-600 flex items-center justify-center relative bg-card" style="background-color: #151e32;">
        <i class="fa-solid fa-plus text-2xl text-gray-400"></i>
    </div>
    <span class="text-xs text-gray-400">Hikayen</span>
</div>`;
    }

    window.activeStoryUsers.forEach(uObj => {
        const uData = window.allUsersData[uObj.username] || {}; 
        const avatar = uData.avatarUrl ? `<img src="${window.sanitizeUrl(uData.avatarUrl)}">` : '👤'; 
        const safeName = uObj.username === window.myUsername ? 'Sen' : DOMPurify.sanitize(uData.fullName ? uData.fullName.split(' ')[0] : uObj.username);
        const allRead = uObj.stories.every(s => readStories.includes(s.id)); 
        const ringClass = allRead ? 'read' : 'unread';
        
    let bgStyle = ringClass === 'has-unseen' ? 'background: linear-gradient(45deg, #06b6d4, #a855f7, #ec4899);' : 'background: #475569;';
    html += `<div class="flex flex-col items-center space-y-1 min-w-[72px] cursor-pointer" onclick="window.openStoryViewer('${window.escapeHtml(uObj.username)}')">
    <div class="w-16 h-16 rounded-full p-0.5 relative" style="${bgStyle}">
        ${avatar.replace('<img ', '<img class="w-full h-full rounded-full border-2 border-app object-cover" style="border-color: #0b1121;" ').replace('<div ', '<div class="w-full h-full rounded-full border-2 border-app flex items-center justify-center overflow-hidden" style="border-color: #0b1121;" ')}
    </div>
    <span class="text-xs text-gray-300 truncate w-full text-center">${safeName}</span>
</div>`;
    });
    container.innerHTML = html;
};

// Realtime stories dinleyici
window.listenToStories = function() {
    if (storiesUnsubscribe) storiesUnsubscribe();
    
    const cutoff = Date.now() - 24*60*60*1000;
    const q = query(collection(db, "stories"), where("createdAt", ">", cutoff), orderBy("createdAt", "desc"), limit(200));
    
    storiesUnsubscribe = onSnapshot(q, (snapshot) => {
        window._cachedStories = [];
        snapshot.forEach(docSnap => {
            window._cachedStories.push({ ...docSnap.data(), _docId: docSnap.id });
        });
        if(window.renderStories) window.renderStories();
    }, (error) => {
        console.error("Hikaye dinleme hatası:", error.code || "Bilinmeyen hata");
    });
};

window.openStoryViewer = function(username) { 
    window.currentStoryUserIndex = window.activeStoryUsers.findIndex(u => u.username === username); 
    window.currentStoryIndex = 0; 
    if(window.currentStoryUserIndex !== -1) { 
        document.getElementById('story-viewer-overlay').style.display = 'flex'; 
        renderCurrentStory(); 
    } 
};

window.closeStoryViewer = function() { 
    document.getElementById('story-viewer-overlay').style.display = 'none'; 
    document.getElementById('story-reply-input').value = ''; 
    if(storyTimerInterval) { clearInterval(storyTimerInterval); storyTimerInterval = null; }
    const vidEl = document.getElementById('story-viewer-video');
    if(vidEl) { vidEl.pause(); vidEl.src = ""; }
    isStoryPaused = false; 
    window.currentStoryIndex = 0;
    if(window.renderStories) window.renderStories(); 
};

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
    
    const userObj = window.activeStoryUsers[window.currentStoryUserIndex]; 
    if (!userObj || !userObj.stories || !userObj.stories[window.currentStoryIndex]) { window.closeStoryViewer(); return; }
    const story = userObj.stories[window.currentStoryIndex];
    
    let readStories = JSON.parse(localStorage.getItem('readStories') || '[]');
    if(!readStories.includes(story.id)) { readStories.push(story.id); localStorage.setItem('readStories', JSON.stringify(readStories)); }
    if (userObj.username !== window.myUsername && !(story.views || []).includes(window.myUsername)) { addStoryView(story); }

    const uData = window.allUsersData[userObj.username] || {};
    const safeFullName = DOMPurify.sanitize(uData.fullName || userObj.username);

    document.getElementById('story-viewer-avatar-container').innerHTML = uData.avatarUrl ? `<img src="${window.sanitizeUrl(uData.avatarUrl)}" style="width:100%;height:100%;object-fit:cover;">` : '👤';
    document.getElementById('story-viewer-name').innerHTML = `${safeFullName} ${uData.isVerified ? '<span style="color:#1da1f2; font-size:14px; margin-left:4px;">☑️</span>' : ''}`;
    const secs = Math.floor((Date.now() - story.createdAt) / 1000); document.getElementById('story-viewer-time').innerText = secs < 60 ? `${secs}s` : (secs < 3600 ? `${Math.floor(secs/60)}d` : `${Math.floor(secs/3600)}sa`);

    if (userObj.username === window.myUsername) { 
        document.getElementById('story-footer').style.display = 'none'; 
        document.getElementById('story-footer-owner').style.display = 'flex'; 
        document.getElementById('story-view-count').innerText = (story.views || []).length; 
    } else { 
        document.getElementById('story-footer').style.display = 'flex'; 
        document.getElementById('story-footer-owner').style.display = 'none'; 
        document.getElementById('story-like-btn').innerText = story.likes && story.likes.includes(window.myUsername) ? '❤️' : '🤍'; 
    }

    const imgEl = document.getElementById('story-viewer-image'); 
    const txtEl = document.getElementById('story-viewer-text');
    
    let vidEl = document.getElementById('story-viewer-video');
    if(!vidEl) {
        vidEl = document.createElement('video');
        vidEl.id = 'story-viewer-video';
        vidEl.style.width = '100%'; vidEl.style.height = '100%'; vidEl.style.objectFit = 'cover';
        vidEl.style.position = 'absolute'; vidEl.style.top = '0'; vidEl.style.left = '0';
        vidEl.playsInline = true; vidEl.autoplay = true; 
        vidEl.muted = true; // Autoplay policy: başlangıçta sessiz
        imgEl.parentNode.appendChild(vidEl);
    }

    // Mute/Unmute butonu güncelle
    const muteBtn = document.getElementById('story-mute-btn');
    if (muteBtn) muteBtn.innerText = vidEl.muted ? '🔇' : '🔊';

    if(story.mediaType === 'video') {
        imgEl.style.display = 'none';
        vidEl.style.display = 'block';
        vidEl.src = story.imageUrl;
        vidEl.onended = window.nextStory;
        
        // Autoplay policy: önce sessiz dene, kullanıcı unmute edebilir
        vidEl.play().catch(() => {});
        
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

    // Layout & Styles
    const targetMedia = story.mediaType === 'video' ? vidEl : imgEl;
    if(story.layout) {
        targetMedia.style.width = 'auto'; targetMedia.style.height = 'auto'; targetMedia.style.maxWidth = '100%'; targetMedia.style.maxHeight = '100%'; targetMedia.style.left = story.layout.image.left + '%'; targetMedia.style.top = story.layout.image.top + '%'; targetMedia.style.transform = `translate(-50%, -50%) scale(${story.layout.image.scale})`;
        txtEl.style.left = story.layout.text.left + '%'; txtEl.style.top = story.layout.text.top + '%'; txtEl.style.transform = `translate(-50%, -50%) scale(${story.layout.text.scale})`; 
        
        // Apply text styles from layout if they exist
        txtEl.style.color = story.layout.text.color || 'white';
        txtEl.style.backgroundColor = story.layout.text.bg || (story.text ? 'rgba(0,0,0,0.5)' : 'transparent');
        txtEl.style.fontWeight = story.layout.text.weight || 'normal';
        txtEl.style.padding = txtEl.style.backgroundColor === 'transparent' ? '0' : '5px 10px';
        txtEl.style.borderRadius = '8px';
    } else {
        targetMedia.style.width = '100%'; targetMedia.style.height = '100%'; targetMedia.style.maxWidth = 'none'; targetMedia.style.maxHeight = 'none'; targetMedia.style.left = '0'; targetMedia.style.top = '0'; targetMedia.style.transform = 'none'; targetMedia.style.objectFit = 'cover';
        txtEl.style.left = '50%'; txtEl.style.top = '50%'; txtEl.style.transform = 'translate(-50%, -50%)'; 
        txtEl.style.backgroundColor = story.text ? 'rgba(0,0,0,0.5)' : 'transparent';
        txtEl.style.color = 'white';
        txtEl.style.padding = story.text ? '5px 10px' : '0';
        txtEl.style.borderRadius = '8px';
    }

    const progressContainer = document.getElementById('story-progress-container'); progressContainer.innerHTML = '';
    userObj.stories.forEach((s, idx) => { progressContainer.innerHTML += `<div class="story-progress-bar"><div class="story-progress-fill" id="story-fill-${idx}" style="width:${idx < window.currentStoryIndex ? '100%' : '0%'}"></div></div>`; });
    
    if (!isStoryPaused && story.mediaType !== 'video') { storyTimerInterval = setInterval(window.storyTick, 100); }
    window.preloadNextStory();
}

// =====================================
// 7. GÖRÜNTÜLENME & BEĞENİ (YENİ: stories koleksiyonu)
// =====================================
async function addStoryView(story) {
    // Yerel güncelleme
    if(!story.views) story.views = []; 
    if(!story.views.includes(window.myUsername)) story.views.push(window.myUsername);
    
    // Firestore güncelleme — yeni stories koleksiyonundan
    try {
        if (story._docId) {
            await updateDoc(doc(db, "stories", story._docId), { views: arrayUnion(window.myUsername) });
        } else {
            // Eski formattaki hikâye — stories koleksiyonunda ara
            const q = query(collection(db, "stories"), where("id", "==", story.id), limit(1));
            const snap = await getDocs(q);
            if (!snap.empty) {
                await updateDoc(snap.docs[0].ref, { views: arrayUnion(window.myUsername) });
            }
        }
    } catch(e) { /* Sessizce geç — eski format olabilir */ }
}

window.nextStory = function() { 
    const userObj = window.activeStoryUsers[window.currentStoryUserIndex]; 
    if(window.currentStoryIndex < userObj.stories.length - 1) { 
        window.currentStoryIndex++; renderCurrentStory(); 
    } else { 
        if(window.currentStoryUserIndex < window.activeStoryUsers.length - 1) { 
            window.currentStoryUserIndex++; window.currentStoryIndex = 0; renderCurrentStory(); 
        } else { window.closeStoryViewer(); } 
    } 
};

window.prevStory = function() { 
    if(window.currentStoryIndex > 0) { 
        window.currentStoryIndex--; renderCurrentStory(); 
    } else { 
        if(window.currentStoryUserIndex > 0) { 
            window.currentStoryUserIndex--; 
            window.currentStoryIndex = window.activeStoryUsers[window.currentStoryUserIndex].stories.length - 1; 
            renderCurrentStory(); 
        } else { renderCurrentStory(); } 
    } 
};

// Mute/Unmute toggle
window.toggleStoryMute = function() {
    const vidEl = document.getElementById('story-viewer-video');
    const muteBtn = document.getElementById('story-mute-btn');
    if (vidEl) {
        vidEl.muted = !vidEl.muted;
        if (muteBtn) muteBtn.innerText = vidEl.muted ? '🔇' : '🔊';
    }
};

// =====================================
// 8. UÇUŞAN EMOJİLER (QUICK REACTIONS)
// =====================================

window.sendQuickReaction = async function(emoji) {
    const targetUser = window.activeStoryUsers[window.currentStoryUserIndex]?.username; 
    if (!targetUser || targetUser === window.myUsername) return;

    const floater = document.createElement('div');
    floater.innerText = emoji;
    floater.style.position = 'absolute';
    floater.style.bottom = '80px';
    floater.style.left = (Math.random() * 60 + 20) + '%';
    floater.style.fontSize = '40px';
    floater.style.pointerEvents = 'none';
    floater.style.transition = 'all 1.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    floater.style.zIndex = '9999';
    document.getElementById('story-viewer-overlay').appendChild(floater);

    setTimeout(() => {
        floater.style.transform = `translateY(-400px) scale(1.5) rotate(${Math.random() * 40 - 20}deg)`;
        floater.style.opacity = '0';
    }, 50);
    setTimeout(() => floater.remove(), 1550);

    try {
        const chatId = [window.myUsername, targetUser].sort().join('_'); 
        const story = window.activeStoryUsers[window.currentStoryUserIndex].stories[window.currentStoryIndex];
        let storySummary = "🖼️ Hikaye Tepkisi: " + (story.mediaType === 'video' ? "(Video)" : (story.imageUrl ? "(Görsel)" : `"${story.text.substring(0, 20)}..."`));
        
        await addDoc(collection(db, "chats", chatId, "messages"), { text: `${storySummary}\n\n${emoji}`, sender: window.myUsername, createdAt: serverTimestamp(), isRead: false, type: 'regular' });
        await setDoc(doc(db, "chats", chatId), { participants: [window.myUsername, targetUser], lastMessage: `${emoji} Hikayeye tepki`, lastSender: window.myUsername, unreadBy: [targetUser], updatedAt: serverTimestamp() }, { merge: true });
    } catch(e) { console.error("Tepki gönderilemedi:", e.code || "Bilinmeyen hata"); }
};

window.sendStoryReply = async function() {
    const input = document.getElementById('story-reply-input'); const text = input.value.trim(); if(!text) return;
    if (text.length > 500) { alert("Yanıtınız en fazla 500 karakter olabilir!"); return; }
    const targetUser = window.activeStoryUsers[window.currentStoryUserIndex].username; if (targetUser === window.myUsername) return; 
    const chatId = [window.myUsername, targetUser].sort().join('_'); const story = window.activeStoryUsers[window.currentStoryUserIndex].stories[window.currentStoryIndex];
    let storySummary = "🖼️ Hikayeye Yanıt: " + (story.mediaType === 'video' ? "(Video)" : (story.imageUrl ? "(Görsel)" : `"${story.text.substring(0, 20)}..."`));
    const safeText = DOMPurify.sanitize(text);
    await addDoc(collection(db, "chats", chatId, "messages"), { text: `${storySummary}\n\n${safeText}`, sender: window.myUsername, createdAt: serverTimestamp(), isRead: false, type: 'regular' });
    await setDoc(doc(db, "chats", chatId), { participants: [window.myUsername, targetUser], lastMessage: "Hikayeye yanıt", lastSender: window.myUsername, unreadBy: [targetUser], updatedAt: serverTimestamp() }, { merge: true });
    alert("Yanıtınız gönderildi! 🚀"); input.value = ''; window.resumeStory(); window.closeStoryViewer();
};

// =====================================
// 9. HİKÂYE BEĞENİ (YENİ: stories koleksiyonu)
// =====================================
window.likeStory = async function() {
    const targetUser = window.activeStoryUsers[window.currentStoryUserIndex]?.username; if (!targetUser || targetUser === window.myUsername) return;
    const story = window.activeStoryUsers[window.currentStoryUserIndex].stories[window.currentStoryIndex]; if (!story) return;
    const isLiked = story.likes && story.likes.includes(window.myUsername);
    
    // Yerel optimistic güncelleme
    if(isLiked) { story.likes = story.likes.filter(u => u !== window.myUsername); document.getElementById('story-like-btn').innerText = '🤍'; } 
    else { if(!story.likes) story.likes = []; story.likes.push(window.myUsername); document.getElementById('story-like-btn').innerText = '❤️'; window.sendQuickReaction('❤️'); }
    
    // Firestore güncelleme — stories koleksiyonu
    try {
        if (story._docId) {
            if (isLiked) await updateDoc(doc(db, "stories", story._docId), { likes: arrayRemove(window.myUsername) });
            else await updateDoc(doc(db, "stories", story._docId), { likes: arrayUnion(window.myUsername) });
        } else {
            const q = query(collection(db, "stories"), where("id", "==", story.id), limit(1));
            const snap = await getDocs(q);
            if (!snap.empty) {
                if (isLiked) await updateDoc(snap.docs[0].ref, { likes: arrayRemove(window.myUsername) });
                else await updateDoc(snap.docs[0].ref, { likes: arrayUnion(window.myUsername) });
            }
        }
        
        if(!isLiked) { 
            await setDoc(doc(db, "chats", [window.myUsername, targetUser].sort().join('_')), { participants: [window.myUsername, targetUser], lastMessage: "❤️ Hikaye beğenildi", lastSender: window.myUsername, unreadBy: [targetUser], updatedAt: serverTimestamp() }, { merge: true }); 
        }
    } catch(e) { console.error("Beğeni hatası:", e.code || "Bilinmeyen hata"); }
};

// =====================================
// 10. HİKÂYE SİLME (STORAGE TEMİZLİĞİ İLE)
// =====================================
window.deleteCurrentStory = async function() {
    if(confirm("Bu hikayeyi kalıcı olarak silmek istediğinize emin misiniz?")) {
        const story = window.activeStoryUsers[window.currentStoryUserIndex].stories[window.currentStoryIndex];
        try {
            // 1. Storage'daki dosyayı sil
            if (story.storagePath) {
                try { await deleteObject(ref(storage, story.storagePath)); } catch(e) {}
            } else if (story.imageUrl) {
                try { await deleteObject(ref(storage, story.imageUrl)); } catch(e) {}
            }
            
            // 2. Stories koleksiyonundan sil
            if (story._docId) {
                await deleteDoc(doc(db, "stories", story._docId));
            } else {
                const q = query(collection(db, "stories"), where("id", "==", story.id), limit(1));
                const snap = await getDocs(q);
                if (!snap.empty) await deleteDoc(snap.docs[0].ref);
            }
            
            // 3. Eski users.stories dizisinden de kaldır (geriye dönük uyumluluk)
            try {
                const userRef = doc(db, "users", window.myUsername); const userSnap = await getDoc(userRef);
                if(userSnap.exists() && userSnap.data().stories) { 
                    await updateDoc(userRef, { stories: userSnap.data().stories.filter(s => s.id !== story.id) }); 
                }
            } catch(e) {}
            
            document.getElementById('story-details-modal').style.display = 'none'; 
            window.closeStoryViewer();
        } catch(e) { console.error("Hikaye silme hatası:", e.code || "Bilinmeyen hata"); }
    }
};

// =====================================
// 11. HİKÂYE DETAY MODALLARI
// =====================================
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
            let uData = window.allUsersData[uname] || {}; let avatarHtml = uData.avatarUrl ? `<img src="${window.sanitizeUrl(uData.avatarUrl)}">` : `👤`; let vHtml = uData.isVerified ? '<span class="verified-badge" style="font-size:14px; margin-left:4px;">☑️</span>' : '';
            const safeName = DOMPurify.sanitize(uData.fullName || uname);
            html += `<div class="user-row" onclick="window.location.href='profile.html?user=${window.escapeHtml(uname)}'"><div class="row-avatar">${avatarHtml}</div><div><div style="font-weight:700; color:#0f172a;">${safeName} ${vHtml}</div><div style="font-size:13px; color:#64748b;">@${window.escapeHtml(uname)}</div></div></div>`;
        });
        container.innerHTML = html;
    } catch(e) {}
};

// =====================================
// 12. HİKÂYE PAYLAŞMA (DM İLETME)
// =====================================
window.openStoryShareModal = function() {
    window.pauseStory(); const container = document.getElementById('story-share-list'); container.innerHTML = '';
    if(!window.myFollowingList || window.myFollowingList.length === 0) { container.innerHTML = '<div style="padding:20px; text-align:center; color:#64748b;">İletmek için önce ağınıza kişi eklemelisiniz.</div>'; } 
    else {
        let html = '';
        window.myFollowingList.forEach(uname => {
            let uData = window.allUsersData[uname] || {}; let avatarHtml = uData.avatarUrl ? `<img src="${window.sanitizeUrl(uData.avatarUrl)}">` : `👤`; let vHtml = uData.isVerified ? '<span class="verified-badge">☑️</span>' : '';
            const safeName = DOMPurify.sanitize(uData.fullName || uname);
            html += `<div class="user-row"><div class="row-avatar">${avatarHtml}</div><div style="flex:1;"><div style="font-weight:700;">${safeName} ${vHtml}</div><div style="font-size:13px; color:#64748b;">@${window.escapeHtml(uname)}</div></div><button onclick="window.sendStoryAsMessage('${window.escapeHtml(uname)}')" style="background:#f1f5f9; color:#0f172a; border:1px solid #cbd5e1; padding:6px 15px; border-radius:6px; font-weight:600; cursor:pointer;">Gönder</button></div>`;
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

// =====================================
// 13. OTOMATİK SÜRE DOLAN HİKÂYE TEMİZLİĞİ
// =====================================
window.cleanupExpiredStories = async function() {
    if (!window.myUsername) return;

    try {
        // 1. Eski users.stories temizliği
        const userRef = doc(db, "users", window.myUsername);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            const data = userSnap.data();
            if (data.stories && data.stories.length > 0) {
                const now = Date.now();
                const validStories = [];
                const expiredStories = [];

                data.stories.forEach(story => {
                    if (now - story.createdAt > 24 * 60 * 60 * 1000) {
                        expiredStories.push(story);
                    } else {
                        validStories.push(story);
                    }
                });

                if (expiredStories.length > 0) {
                    for (const story of expiredStories) {
                        if (story.storagePath) {
                            try { await deleteObject(ref(storage, story.storagePath)); } catch(e) {}
                        } else if (story.imageUrl) {
                            try { await deleteObject(ref(storage, story.imageUrl)); } catch(e) {}
                        }
                    }
                    await updateDoc(userRef, { stories: validStories });
                }
            }
        }
        
        // 2. Yeni stories koleksiyonu temizliği
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        const q = query(collection(db, "stories"), where("author", "==", window.myUsername), where("createdAt", "<", cutoff));
        const snap = await getDocs(q);
        for (const docSnap of snap.docs) {
            const data = docSnap.data();
            if (data.storagePath) {
                try { await deleteObject(ref(storage, data.storagePath)); } catch(e) {}
            }
            await deleteDoc(docSnap.ref);
        }
    } catch(e) { 
        console.error("Hikaye temizleme hatası:", e.code || "Bilinmeyen hata"); 
    }
};