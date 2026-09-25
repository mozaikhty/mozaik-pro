// feed.js
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, limit, startAfter, doc, updateDoc, arrayUnion, arrayRemove, deleteDoc, getDoc, getDocs, serverTimestamp, setDoc, where } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

import { auth, db, storage } from './firebase-config.js';
import './shared.js';



let currentUser = null; let myUsername = null; let allUsersData = {}; 
let currentFeedTab = 'discover'; let myFollowingList = []; let myBookmarks = []; let globalPosts = []; 
let currentlyEditingPostId = null; let postToShare = null; let activeReplyParentId = null; 
const MAX_CHARS = 2200;

// GLOBAL ÇAĞRI DİNLEYİCİ DEĞİŞKENLERİ
let activeChats = [];

let lastVisiblePostSnap = null; const POSTS_PER_PAGE = 10; let isLoadingMore = false; let hasMorePosts = true;

document.addEventListener('click', function(event) {
    if (!event.target.closest('.post-options-btn')) { document.querySelectorAll('.dropdown-menu').forEach(menu => menu.style.display = 'none'); }
    if (event.target.classList.contains('modal-overlay') && event.target.id !== 'story-viewer-overlay') {
        event.target.style.display = 'none';
        if(event.target.id === 'post-detail-modal') { window.currentOpenPostId = null; activeReplyParentId = null; document.getElementById('post-detail-container').innerHTML = ''; }
        if(event.target.id === 'story-details-modal' || event.target.id === 'story-share-modal') { if(window.resumeStory) window.resumeStory(); }
    }
});

window.goToMyProfile = function() { if(myUsername) window.location.href = 'profile.html?user=' + myUsername; };
window.logoutUser = function() { signOut(auth).then(() => { window.location.href = "index.html"; }); };

window.switchFeedTab = function(tabName) {
    currentFeedTab = tabName;
    document.querySelectorAll('.feed-tabs .feed-tab').forEach(t => t.classList.remove('active'));
    if(tabName === 'discover') document.getElementById('tab-discover').classList.add('active');
    if(tabName === 'following') document.getElementById('tab-following').classList.add('active');
    renderFeed();
};

window.showBookmarksTab = function() { window.closeMobileSidebar(); currentFeedTab = 'bookmarks'; document.querySelectorAll('.feed-tabs .feed-tab').forEach(t => t.classList.remove('active')); renderFeed(); };

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user; myUsername = currentUser.displayName || localStorage.getItem('mozaik_username') || currentUser.email.split('@')[0];
        window.myUsername = myUsername; // webrtc.js'nin kim olduğumuzu bilmesi için eklendi
        const checkMyBan = await getDoc(doc(db, "users", myUsername));
        if (checkMyBan.exists() && checkMyBan.data().isBanned === true) { signOut(auth).then(() => { window.location.href = "index.html"; }); return; }

        onSnapshot(doc(db, "users", myUsername), async (docSnap) => { 
            if(docSnap.exists()) {
                const u = docSnap.data(); allUsersData[myUsername] = u; myFollowingList = u.following || []; myBookmarks = u.bookmarks || []; 
                window.allUsersData = allUsersData; window.myFollowingList = myFollowingList; // story.js için eklendi
                await window.fetchMissingUsers(myFollowingList);
                document.getElementById('sidebar-name-mobile').innerText = u.fullName || myUsername; document.getElementById('sidebar-handle-mobile').innerText = '@' + myUsername;
                document.getElementById('sidebar-following-count').innerText = myFollowingList.length; document.getElementById('sidebar-followers-count').innerText = (u.followers || []).length;
                if(u.avatarUrl) {
                    const imgTag = `<img src="${window.sanitizeUrl(u.avatarUrl)}" style="width:100%;height:100%;object-fit:cover;">`;
                    document.getElementById('desktop-input-avatar').innerHTML = imgTag; document.getElementById('mobile-avatar-header').innerHTML = imgTag;
                    document.getElementById('sidebar-avatar-mobile').innerHTML = imgTag; document.getElementById('modal-avatar').innerHTML = imgTag;
                    const deskAvatar = document.getElementById('desktop-sidebar-avatar'); if(deskAvatar) deskAvatar.innerHTML = imgTag;
                }
                const deskName = document.getElementById('desktop-sidebar-name'); if(deskName) deskName.innerText = u.fullName || myUsername;
                const deskHandle = document.getElementById('desktop-sidebar-handle'); if(deskHandle) deskHandle.innerText = '@' + myUsername;
            }
            renderWhoToFollow(); 
            if(window.listenToStories && !window._storiesListening) { window.listenToStories(); window._storiesListening = true; } 
            else if(window.renderStories) window.renderStories(); 
            renderFeed(); 
        });

        onSnapshot(query(collection(db, "chats"), where("participants", "array-contains", myUsername)), (snapshot) => { 
            activeChats = activeChats.filter(c => c.type === 'group'); snapshot.forEach(docSnap => { activeChats.push({ id: docSnap.id, ...docSnap.data(), type:'private' }); }); if(window.attachCallListeners) window.attachCallListeners(activeChats); 
        });
        onSnapshot(query(collection(db, "groups"), where("members", "array-contains", myUsername)), (snapshot) => { 
            activeChats = activeChats.filter(c => c.type === 'private'); snapshot.forEach(docSnap => { activeChats.push({ id: docSnap.id, ...docSnap.data(), type:'group' }); }); if(window.attachCallListeners) window.attachCallListeners(activeChats); 
        });

        loadFeedPosts(); 
        
        // Arka planda kullanıcının eski hikayelerini temizle (Maliyet Optimizasyonu)
        if (window.cleanupExpiredStories) {
            setTimeout(() => { window.cleanupExpiredStories(); }, 5000); 
        }
        
        const urlParams = new URLSearchParams(window.location.search);
        if(urlParams.get('tab') === 'bookmarks') { setTimeout(() => { window.showBookmarksTab(); }, 100); }
        if(urlParams.get('action') === 'post') { setTimeout(() => { window.openMainPostModal(); }, 300); }
        if(urlParams.get('post')) { setTimeout(() => { window.openPostDetail(urlParams.get('post')); }, 400); }
    } else { window.location.href = "index.html"; }
});

// =====================================
// ANA AKIŞ VE POST FONKSİYONLARI 
// =====================================

window.addEventListener('scroll', () => { if (isLoadingMore || !hasMorePosts) return; if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 200) { isLoadingMore = true; loadFeedPosts(true); setTimeout(() => { isLoadingMore = false; }, 1000); } });

async function loadFeedPosts(isLoadMore = false) {
    if (!isLoadMore) { globalPosts = []; lastVisiblePostSnap = null; hasMorePosts = true; }
    if (!hasMorePosts) return;

    let q = lastVisiblePostSnap 
        ? query(collection(db, "posts"), orderBy("createdAt", "desc"), startAfter(lastVisiblePostSnap), limit(POSTS_PER_PAGE))
        : query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(POSTS_PER_PAGE));

    try {
        const snapshot = await getDocs(q);
        let neededUsers = new Set();
        
        if (snapshot.empty) {
            hasMorePosts = false;
            if (isLoadMore) return;
        } else {
            lastVisiblePostSnap = snapshot.docs[snapshot.docs.length - 1];
            snapshot.forEach(doc => { 
                let safeData = doc.data();
                if(safeData.content) safeData.content = DOMPurify.sanitize(safeData.content);
                neededUsers.add(safeData.author); 
                if(safeData.isRepost && safeData.originalPostAuthor) neededUsers.add(safeData.originalPostAuthor); 
                if(safeData.comments) { safeData.comments.forEach(c => { if(c.text) c.text = DOMPurify.sanitize(c.text); if(c.author) neededUsers.add(c.author); }); }
                globalPosts.push({ id: doc.id, data: safeData }); 
            });
            await window.fetchMissingUsers(Array.from(neededUsers));
        }

        if (snapshot.docs.length < POSTS_PER_PAGE) { hasMorePosts = false; }
        if(window.currentOpenPostId) { window.openPostDetail(window.currentOpenPostId); }
        renderWhoToFollow(); renderFeed(); 
    } catch(error) { console.error("Gönderiler yüklenemedi:", error.code || "Bilinmeyen hata"); }
}

function renderWhoToFollow() {
    const container = document.getElementById('who-to-follow-list'); if (!container) return;
    let eligibleUsers = Object.keys(allUsersData).filter(uid => { return uid !== myUsername && !myFollowingList.includes(uid); });
    eligibleUsers = eligibleUsers.sort(() => 0.5 - Math.random()).slice(0, 3);
    if (eligibleUsers.length === 0) { container.innerHTML = '<div style="font-size:14px; color:#64748b; padding: 10px 0;">Şu an için yeni öneri yok.</div>'; return; }
    let html = '';
    eligibleUsers.forEach(uid => {
        const uData = allUsersData[uid]; const avatarHtml = uData.avatarUrl ? `<img src="${window.sanitizeUrl(uData.avatarUrl)}" style="width:100%;height:100%;object-fit:cover;">` : `👤`;
        const fullName = window.escapeHtml(uData.fullName || uid); const vHtml = uData.isVerified ? '<span class="verified-badge">☑️</span>' : '';
        html += `<div style="display:flex; align-items:center; justify-content:space-between; margin-top:15px; cursor:pointer; padding: 8px; border-radius: 8px; transition: 0.2s;" class="user-row" onclick="window.location.href='profile.html?user=${window.escapeHtml(uid)}'"><div style="display:flex; align-items:center; gap:10px; overflow:hidden;"><div style="width:40px; height:40px; border-radius:8px; background:#e2e8f0; overflow:hidden; display:flex; justify-content:center; align-items:center; font-size:20px; flex-shrink:0; border: 1px solid #cbd5e1;">${avatarHtml}</div><div style="overflow:hidden;"><div style="font-weight:700; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#0f172a;">${fullName} ${vHtml}</div><div style="color:#64748b; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">@${window.escapeHtml(uid)}</div></div></div><button onclick="event.stopPropagation(); window.quickFollow('${window.escapeHtml(uid)}')" style="background:#f1f5f9; color:#0f172a; border:1px solid #cbd5e1; padding:6px 12px; border-radius:6px; font-weight:600; cursor:pointer; flex-shrink:0; transition:0.2s; font-size:13px;">Ekle</button></div>`;
    });
    container.innerHTML = html;
}



function updateCharCount(inputId, counterId, btnId) {
    const input = document.getElementById(inputId); const counter = document.getElementById(counterId); const btn = document.getElementById(btnId);
    const remaining = MAX_CHARS - input.value.length; counter.innerText = remaining;
    if (remaining <= 20) { counter.classList.add('limit'); } else { counter.classList.remove('limit'); }
    if (input.value.trim().length > 0) btn.classList.add('active'); else btn.classList.remove('active');
}

document.getElementById('post-text').addEventListener('input', () => updateCharCount('post-text', 'inline-char-count', 'share-btn'));
document.getElementById('modal-post-text').addEventListener('input', () => updateCharCount('modal-post-text', 'modal-char-count', 'modal-share-btn'));

window.openMainPostModal = function() { document.getElementById('main-post-modal').style.display = 'flex'; document.getElementById('modal-post-text').focus(); };
let currentPostLocation = null; let currentModalLocation = null;

window.addLocation = function(isModal) {
    if (!navigator.geolocation) { alert("Tarayıcınız konum özelliğini desteklemiyor."); return; }
    const btn = isModal ? document.getElementById('modal-share-btn') : document.getElementById('share-btn');
    const originalText = btn.innerText; btn.innerText = "Bulunuyor..."; btn.disabled = true;
    navigator.geolocation.getCurrentPosition(async (position) => {
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${position.coords.latitude}&lon=${position.coords.longitude}`);
            const data = await res.json();
            let locName = data.address ? (data.address.city || data.address.town || data.address.province || data.address.state || data.address.country) : "Bilinmeyen Konum";
            if(isModal) { currentModalLocation = locName; document.getElementById('modal-loc-text-span').innerText = locName; document.getElementById('modal-location-preview-text').style.display = 'block'; } 
            else { currentPostLocation = locName; document.getElementById('loc-text-span').innerText = locName; document.getElementById('location-preview-text').style.display = 'block'; }
            btn.classList.add('active');
        } catch(e) { alert("Konum bilgisi alınamadı."); } finally { btn.innerText = originalText; btn.disabled = false; }
    }, () => { alert("Konum izni reddedildi."); btn.innerText = originalText; btn.disabled = false; });
};

window.removeLocation = function(isModal) { if(isModal) { currentModalLocation = null; document.getElementById('modal-location-preview-text').style.display = 'none'; } else { currentPostLocation = null; document.getElementById('location-preview-text').style.display = 'none'; } };
window.closeMainPostModal = function() { document.getElementById('main-post-modal').style.display = 'none'; document.getElementById('modal-post-text').value = ''; document.getElementById('modal-char-count').innerText = MAX_CHARS; document.getElementById('modal-share-btn').classList.remove('active'); document.getElementById('modal-image-input').value = ''; document.getElementById('modal-image-preview-text').style.display = 'none'; window.removeLocation(true); };

document.getElementById('image-input').addEventListener('change', (e) => { 
    if(e.target.files.length > 0) { 
        const previewEl = document.getElementById('image-preview-text');
        previewEl.style.display = 'flex'; previewEl.style.flexWrap = 'wrap'; previewEl.style.gap = '5px'; previewEl.innerHTML = '';
        Array.from(e.target.files).forEach(file => {
            if (file.type.startsWith('video/')) {
                previewEl.innerHTML += `<video src="${URL.createObjectURL(file)}" autoplay muted loop style="max-height: 100px; border-radius: 8px; margin-top: 10px;"></video>`;
            } else {
                previewEl.innerHTML += `<img src="${URL.createObjectURL(file)}" style="max-height: 100px; border-radius: 8px; margin-top: 10px;">`;
            }
        });
        document.getElementById('share-btn').classList.add('active'); 
    }
});
document.getElementById('modal-image-input').addEventListener('change', (e) => { 
    if(e.target.files.length > 0) { 
        const previewEl = document.getElementById('modal-image-preview-text');
        previewEl.style.display = 'flex'; previewEl.style.flexWrap = 'wrap'; previewEl.style.gap = '5px'; previewEl.innerHTML = '';
        Array.from(e.target.files).forEach(file => {
            if (file.type.startsWith('video/')) {
                previewEl.innerHTML += `<video src="${URL.createObjectURL(file)}" autoplay muted loop style="max-height: 100px; border-radius: 8px; margin-top: 10px;"></video>`;
            } else {
                previewEl.innerHTML += `<img src="${URL.createObjectURL(file)}" style="max-height: 100px; border-radius: 8px; margin-top: 10px;">`;
            }
        });
        document.getElementById('modal-share-btn').classList.add('active'); 
    }
});

// GÖNDERİ PAYLAŞIRKEN FOTOĞRAF SIKIŞTIRMA 
async function submitPost(textId, imageId, btnId, previewId, isModal) {
    try {
        const uSnap = await getDoc(doc(db, "users", myUsername));
        if (uSnap.exists()) {
            const uData = uSnap.data();
            const today = new Date().toISOString().split('T')[0];
            if (uData.lastPostDate === today && (uData.postCountToday || 0) >= 20) {
                alert("Günlük 20 gönderi sınırına ulaştınız! Spamı önlemek için lütfen yarın tekrar deneyin.");
                return;
            }
        }
    } catch(e) {}

    const text = document.getElementById(textId).value.trim(); 
    let files = document.getElementById(imageId).files;
    let loc = isModal ? currentModalLocation : currentPostLocation;
    
    if(!text && files.length === 0 && !loc) return; 

    if (text.length > MAX_CHARS) {
        alert(`Gönderiniz en fazla ${MAX_CHARS} karakter olabilir!`);
        return;
    }

    if (window.isActionLocked && window.isActionLocked('submit_post')) {
        window.showToast?.("Lütfen yeni gönderi için birkaç saniye bekleyin.", "info");
        return;
    }

    if (files.length > 4) {
        alert("En fazla 4 medya dosyası yükleyebilirsiniz!");
        return;
    }

    for (let file of files) {
        
        if (!file.type.match(/^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime))/i)) {
            alert("Sadece güvenli fotoğraf (JPEG, PNG, WEBP, GIF) ve video (MP4, WEBM, MOV) formatları yüklenebilir.");
            return;
        }
        
        const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
        const MAX_VIDEO_SIZE = 20 * 1024 * 1024;
        
        console.log("=== UPLOAD DEBUG (FEED) ===");
        console.log("Video adı:", file.name);
        console.log("Video MIME:", file.type);
        console.log("Video boyutu (bytes):", file.size);
        console.log("Video boyutu (MB):", (file.size / (1024 * 1024)).toFixed(2));
        console.log("İzin verilen maksimum boyut (MB):", (MAX_VIDEO_SIZE / (1024 * 1024)).toFixed(2));
        console.log("====================");

        if (file.type.startsWith('image/') && file.size > MAX_IMAGE_SIZE) {
            alert("Fotoğraf boyutu çok büyük. Maksimum 5 MB fotoğraf yükleyebilirsiniz.");
            return;
        }
        if (file.type.startsWith('video/') && file.size > MAX_VIDEO_SIZE) {
            alert("Video boyutu çok büyük. Maksimum 20 MB video yükleyebilirsiniz.");
            return;
        }
        if (false) { // Dummy block to absorb the old condition

            alert("Seçtiğiniz medya 10 MB'dan büyük olamaz!");
            document.getElementById(imageId).value = ''; document.getElementById(previewId).style.display = 'none'; document.getElementById(btnId).classList.remove('active'); return; 
        }
    }
    
    const btn = document.getElementById(btnId); btn.disabled = true; btn.innerText = "Sıkıştırılıyor..."; 
    let mediaArray = [];
    
    try {
        if(files.length > 0) { 
            btn.innerText = "Yükleniyor...";
            for (let rawFile of files) {
                let file = rawFile;
                let isVideo = (file.type || '').startsWith('video/');
                if (!isVideo) {
                    file = await window.compressImage(rawFile, 1200, 1200, 0.75, 800 * 1024); 
                }
                const fileName = `posts/${auth.currentUser.uid}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, "")}`;
                const storageRef = ref(storage, fileName);
                
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
                const url = await getDownloadURL(storageRef);

                mediaArray.push({ url, type: isVideo ? 'video' : 'image', storagePath: fileName });
            }
        }
        
        let imageUrl = mediaArray.length > 0 ? mediaArray[0].url : null;
        
        await addDoc(collection(db, "posts"), { content: text, imageUrl: imageUrl, media: mediaArray, location: loc, author: myUsername, authorEmail: currentUser.email, createdAt: serverTimestamp(), likes: [], comments: [], isEdited: false, isRepost: false });
        
        try {
            const today = new Date().toISOString().split('T')[0];
            const uSnap = await getDoc(doc(db, "users", myUsername));
            if (uSnap.exists()) {
                const uData = uSnap.data();
                let newCount = (uData.lastPostDate === today) ? (uData.postCountToday || 0) + 1 : 1;
                await updateDoc(doc(db, "users", myUsername), { lastPostDate: today, postCountToday: newCount });
            }
        } catch(e) {}

        
        document.getElementById(textId).value = ''; document.getElementById(imageId).value = ''; document.getElementById(previewId).style.display = 'none'; window.removeLocation(isModal);
        btn.disabled = false; btn.innerText = "Yayınla"; btn.classList.remove('active'); updateCharCount(textId, isModal ? 'modal-char-count' : 'inline-char-count', btnId);
        if (isModal) window.closeMainPostModal();
        loadFeedPosts();
        
    } catch(e) { 
        console.error("Gönderi paylaşımı başarısız:", e);
        
        // Yarım kalan yüklemeleri (orphan files) Storage'dan temizle
        if (mediaArray && mediaArray.length > 0) {
            for (const m of mediaArray) {
                if (m.storagePath) {
                    try { await deleteObject(ref(storage, m.storagePath)); } catch(delErr) {}
                }
            }
        }
        
        btn.disabled = false; btn.innerText = "Yayınla"; 
        
        // Hata kodlarına göre anlaşılır mesajlar
        let errMsg = "Video yüklenirken bir hata oluştu. Lütfen tekrar deneyin. Detay: " + (e.message || e.toString());
        if (e.code === 'storage/unauthorized') errMsg = "Güvenlik engeli: App Check (reCAPTCHA) doğrulaması başarısız veya Firebase Storage yetkiniz yok (storage/unauthorized). Boyut sınırlarıyla ilgili bir sorun YOK.";
        else if (e.code === 'storage/canceled') errMsg = "Yükleme iptal edildi.";
        else if (e.code === 'storage/retry-limit-exceeded' || e.message?.includes('network')) errMsg = "Video yüklenemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.";
        
        alert(errMsg);
    }
}

document.getElementById('share-btn').addEventListener('click', () => submitPost('post-text', 'image-input', 'share-btn', 'image-preview-text', false));
document.getElementById('modal-share-btn').addEventListener('click', () => submitPost('modal-post-text', 'modal-image-input', 'modal-share-btn', 'modal-image-preview-text', true));

window.actionLocks = {};
window.isActionLocked = function(actionId) { if (window.actionLocks[actionId]) return true; window.actionLocks[actionId] = true; setTimeout(() => { window.actionLocks[actionId] = false; }, 1500); return false; };

window.toggleLike = async function(postId, isLiked, postAuthor, event, isDoubleTap = false) { 
    event.stopPropagation(); if (window.isActionLocked('like_' + postId)) return; 
    
    let isDouble = (event && event.type === 'dblclick') || isDoubleTap;
    if (isDouble && isLiked) return; // Do not unlike on double click

    if (isDouble && !isLiked) {
        const heart = event.target.parentNode.querySelector('.dblclick-heart');
        if(heart) {
            heart.style.transform = 'translate(-50%, -50%) scale(1.5)';
            setTimeout(() => { heart.style.transform = 'translate(-50%, -50%) scale(0)'; }, 800);
        }
    }

    const postObj = globalPosts.find(p => p.id === postId);
    if (postObj) { 
        if (!postObj.data.likes) postObj.data.likes = []; 
        if (isLiked) { postObj.data.likes = postObj.data.likes.filter(u => u !== myUsername); } 
        else { postObj.data.likes.push(myUsername); } 
        
        if (isDouble) {
            const postEl = event.target.closest('.post');
            if (postEl) {
                const likeBox = postEl.querySelector('.like-box');
                if (likeBox) {
                    likeBox.classList.add('liked');
                    likeBox.innerHTML = `<span class="action-icon">❤️</span> <span onclick="window.showLikes('${postId}', event)">${postObj.data.likes.length || ''}</span>`;
                    likeBox.setAttribute('onclick', `window.toggleLike('${postId}', true, '${postAuthor}', event)`);
                }
            }
        } else {
            renderFeed(); 
        }
        
        if (window.currentOpenPostId === postId) window.openPostDetail(postId); 
    }
    const postRef = doc(db, "posts", postId); 
    if (isLiked) { await updateDoc(postRef, { likes: arrayRemove(myUsername) }); } else { await updateDoc(postRef, { likes: arrayUnion(myUsername) }); if (postAuthor !== myUsername) { await addDoc(collection(db, "notifications"), { type: 'like', sender: myUsername, recipient: postAuthor, postId: postId, createdAt: serverTimestamp() }); } } 
};

window.toggleBookmark = async function(postId, isBookmarked, event) { event.stopPropagation(); const myRef = doc(db, "users", myUsername); if (isBookmarked) { await updateDoc(myRef, { bookmarks: arrayRemove(postId) }); } else { await updateDoc(myRef, { bookmarks: arrayUnion(postId) }); } };

window.deletePost = async function(postId) { 
    if(confirm("Bu gönderiyi kalıcı olarak silmek istediğinize emin misiniz?")) {
        try {
            let postObj = globalPosts.find(p => p.id === postId);
            globalPosts = globalPosts.filter(p => p.id !== postId); renderFeed();
            const detailModal = document.getElementById('post-detail-modal'); if (detailModal) detailModal.style.display = 'none'; window.currentOpenPostId = null;
            if (postObj && postObj.data && !postObj.data.isRepost) { 
                if (postObj.data.imageUrl) { try { await deleteObject(ref(storage, postObj.data.imageUrl)); } catch(imgErr) {} }
                if (postObj.data.media && Array.isArray(postObj.data.media)) {
                    for (const m of postObj.data.media) {
                        if (m.url) { try { await deleteObject(ref(storage, m.url)); } catch(imgErr) {} }
                    }
                }
            }
            await deleteDoc(doc(db, "posts", postId)); 
        } catch(e) {}
    } 
};

window.repostPost = async function(postId, originalAuthor, event) {
    event.stopPropagation();
    if(confirm(`@${originalAuthor} adlı kullanıcının içeriğini ağınıza eklemek ister misiniz?`)) {
        const originalPost = globalPosts.find(p => p.id === postId); if(!originalPost) return;
        try { await addDoc(collection(db, "posts"), { isRepost: true, originalPostId: postId, originalPostAuthor: originalAuthor, content: originalPost.data.content || '', imageUrl: originalPost.data.imageUrl || null, author: myUsername, authorEmail: currentUser.email, createdAt: serverTimestamp(), likes: [], comments: [] }); alert("Ağınıza eklendi! 🔁"); loadFeedPosts(); } catch (error) {}
    }
};

window.toggleDropdown = function(postId, event) { event.stopPropagation(); document.querySelectorAll('.dropdown-menu').forEach(menu => { if(menu.id !== `dropdown-${postId}`) menu.style.display = 'none'; }); const menu = document.getElementById(`dropdown-${postId}`); menu.style.display = menu.style.display === 'none' ? 'flex' : 'none'; };

window.pinPost = async function(postId) {
    try {
        const userRef = doc(db, "users", myUsername);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            const currentPinned = userSnap.data().pinnedPostId;
            if (currentPinned === postId) {
                await updateDoc(userRef, { pinnedPostId: null });
                window.showToast?.('Gönderi sabitlemeden kaldırıldı.', 'info');
            } else {
                await updateDoc(userRef, { pinnedPostId: postId });
                window.showToast?.('Gönderi profilinize sabitlendi.', 'info');
            }
        }
    } catch(e) { console.error('Sabitleme hatası:', e.code || 'Bilinmeyen hata'); }
};

window.openEditModal = function(postId, currentContent) { currentlyEditingPostId = postId; document.getElementById('edit-post-input').value = currentContent; document.getElementById('edit-post-modal').style.display = 'flex'; };

document.getElementById('save-edited-post-btn').addEventListener('click', async () => {
    if(!currentlyEditingPostId) return; const newContent = document.getElementById('edit-post-input').value.trim(); if(!newContent) return;
    if (newContent.length > 280) { alert("Gönderi en fazla 280 karakter olabilir!"); return; }
    const postObj = globalPosts.find(p => p.id === currentlyEditingPostId);
    if (postObj) { postObj.data.content = newContent; postObj.data.isEdited = true; renderFeed(); if (window.currentOpenPostId === currentlyEditingPostId) window.openPostDetail(currentlyEditingPostId); }
    document.getElementById('edit-post-modal').style.display = 'none';
    try { await updateDoc(doc(db, "posts", currentlyEditingPostId), { content: newContent, isEdited: true }); } catch(e) {}
});

window.openShareModal = function(postId, event) {
    event.stopPropagation(); postToShare = postId; const container = document.getElementById('share-users-list'); container.innerHTML = '';
    if(myFollowingList.length === 0) { container.innerHTML = '<div style="padding:20px; text-align:center; color:#64748b;">İletmek için önce ağınıza kişi eklemelisiniz.</div>'; }
    else {
        myFollowingList.forEach(uname => {
            let uData = allUsersData[uname] || {}; let avatarHtml = uData.avatarUrl ? `<img src="${window.sanitizeUrl(uData.avatarUrl)}">` : `👤`; let vHtml = uData.isVerified ? `<span class="verified-badge">☑️</span>` : '';
            container.innerHTML += `<div class="user-row"><div class="row-avatar">${avatarHtml}</div><div style="flex:1;"><div style="font-weight:700;">${window.escapeHtml(uData.fullName || uname)} ${vHtml}</div><div style="font-size:13px; color:#64748b;">@${window.escapeHtml(uname)}</div></div><button onclick="window.sendPostAsMessage('${window.escapeHtml(uname)}')" style="background:#f1f5f9; color:#0f172a; border:1px solid #cbd5e1; padding:6px 15px; border-radius:6px; font-weight:600; cursor:pointer;">Gönder</button></div>`;
        });
    }
    document.getElementById('share-dm-modal').style.display = 'flex';
};

window.sendPostAsMessage = async function(targetUser) {
    if(!postToShare) return; const chatId = [myUsername, targetUser].sort().join('_'); const postLink = `${window.location.origin}/profile.html?post=${postToShare}`;
    await addDoc(collection(db, "chats", chatId, "messages"), { text: `🔗 İçerik İletildi: ${postLink}`, sender: myUsername, createdAt: serverTimestamp(), isRead: false, type: 'regular' });
    await setDoc(doc(db, "chats", chatId), { participants: [myUsername, targetUser], lastMessage: '🔗 İçerik İletildi', lastSender: myUsername, updatedAt: serverTimestamp() }, { merge: true });
    alert(`İçerik iletildi.`); document.getElementById('share-dm-modal').style.display = 'none';
};


function generateUniqueId() { return Math.random().toString(36).substr(2, 9); }
window.closePostDetail = function() { document.getElementById('post-detail-modal').style.display = 'none'; window.currentOpenPostId = null; activeReplyParentId = null; document.getElementById('post-detail-container').innerHTML = ''; document.body.classList.remove('modal-open'); window.history.replaceState({}, document.title, window.location.pathname); };

window.openPostDetail = async function(postId) {
    window.currentOpenPostId = postId; activeReplyParentId = null; 
    let postObj = globalPosts.find(p => p.id === postId); 
    if (!postObj) {
        try {
            const pSnap = await getDoc(doc(db, "posts", postId));
            if (pSnap.exists()) {
                let pData = pSnap.data();
                if(pData.content) pData.content = DOMPurify.sanitize(pData.content);
                postObj = { id: pSnap.id, data: pData };
                globalPosts.push(postObj);
                const authorsToFetch = [postObj.data.author];
                if (postObj.data.originalPostAuthor) authorsToFetch.push(postObj.data.originalPostAuthor);
                await window.fetchMissingUsers(authorsToFetch);
            }
        } catch (e) {
            console.error("Gönderi getirme hatası:", e.code || "Bilinmeyen hata");
        }
    }
    if(!postObj) return; const postData = postObj.data; 
    let originalAuthor = postData.author; if(postData.isRepost) { originalAuthor = postData.originalPostAuthor; }
    const authorData = allUsersData[originalAuthor] || {}; const likesArray = postData.likes || []; const isLiked = likesArray.includes(myUsername);
    const vHtml = authorData.isVerified ? `<span class="verified-badge">☑️</span>` : ''; const avatarImg = authorData.avatarUrl ? `<img src="${window.sanitizeUrl(authorData.avatarUrl)}" style="width:100%;height:100%;object-fit:cover;">` : `👤`; const fullName = window.escapeHtml(authorData.fullName || originalAuthor);
    
    let timeString = "";
    if (postData.createdAt) { if (typeof postData.createdAt.toMillis === 'function') { timeString = new Date(postData.createdAt.toMillis()).toLocaleString('tr-TR', {day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}); } else if (postData.createdAt.seconds) { timeString = new Date(postData.createdAt.seconds * 1000).toLocaleString('tr-TR', {day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}); } }
    
    let locHtml = postData.location ? `<span style="font-size:14px; color:#3b82f6; margin-left:10px;">📍 ${window.escapeHtml(postData.location)}</span>` : '';
    let repostLabel = ""; if(postData.isRepost) { repostLabel = `<div style="color:#64748b; font-weight:600; font-size:12px; margin-bottom:10px; padding:0 20px;">🔁 @${window.escapeHtml(postData.author)} ağında paylaştı</div>`; }

            let mediaHtmlDetail = '';
            if (postData.media && postData.media.length > 1) {
                let slides = postData.media.map(m => {
                    let tag = m.type === 'video' ? `${window.renderCustomVideo(window.sanitizeUrl(m.url), "", "modal-" + Math.random().toString(36).substr(2,9), postId)}` : `<img src="${window.sanitizeUrl(m.url)}" style="width:100%; max-height:60vh; border-radius:8px; object-fit:contain;">`;
                    return `<div style="flex: 0 0 100%; scroll-snap-align: start;">${tag}</div>`;
                }).join('');
                mediaHtmlDetail = `<div style="display:flex; overflow-x:auto; scroll-snap-type: x mandatory; gap: 10px; padding-bottom: 10px; max-width: 100%; margin-bottom:15px;">${slides}</div>`;
            } else if (postData.media && postData.media.length === 1) {
                let m = postData.media[0];
                let tag = m.type === 'video' ? `${window.renderCustomVideo(window.sanitizeUrl(m.url), "", "modal-" + Math.random().toString(36).substr(2,9), postId)}` : `<img src="${window.sanitizeUrl(m.url)}" style="width:100%; max-height:60vh; border-radius:8px; margin-bottom:15px; border:1px solid #e2e8f0; object-fit:contain;">`;
                mediaHtmlDetail = tag;
            } else if (postData.imageUrl) {
                mediaHtmlDetail = `<img src="${window.sanitizeUrl(postData.imageUrl)}" style="width:100%; max-height:60vh; border-radius:8px; margin-bottom:15px; border:1px solid #e2e8f0; object-fit:contain;">`;
            }

            let html = `
                ${repostLabel}
                <div style="padding: 10px 25px 25px 25px; border-bottom:1px solid #f1f5f9;">
                    <div style="display:flex; align-items:center; gap:12px; margin-bottom:15px; cursor:pointer;" onclick="window.location.href='profile.html?user=${window.escapeHtml(originalAuthor)}'">
                        <div style="width:48px; height:48px; border-radius:8px; background:#e2e8f0; overflow:hidden; display:flex; justify-content:center; align-items:center; font-size:24px; border: 1px solid #cbd5e1;">${avatarImg}</div>
                        <div style="flex:1;">
                            <div style="font-weight:700; font-size:16px; color:#0f172a;">${fullName} ${vHtml}</div>
                            <div style="color:#64748b; font-size:14px;">@${window.escapeHtml(originalAuthor)} ${locHtml}</div>
                        </div>
                    </div>
                    <div style="font-size:16px; line-height:1.6; color:#334155; margin-bottom:15px; word-wrap:break-word;">
                        ${DOMPurify.sanitize(postData.content || '').replace(/#([a-zA-Z0-9ğüşıöçĞÜŞİÖÇ_]+)/g, `<a href="search.html?tag=$1" style="color:#3b82f6; font-weight:500; text-decoration:none;">#$1</a>`)}
                    </div>
                    ${mediaHtmlDetail}
                    <div style="color:#94a3b8; font-size:13px; padding-bottom:15px; border-bottom:1px solid #f1f5f9;">${timeString}</div>
            
            <div style="display:flex; justify-content:flex-start; gap:30px; padding:15px 0; color:#64748b;">
                <div class="action-item" onclick="document.getElementById('detail-comment-input').focus()"><span class="action-icon">💬</span> ${(postData.comments || []).length}</div>
                <div class="action-item repost-box" onclick="window.repostPost('${postId}', '${originalAuthor}', event)"><span class="action-icon">🔁</span></div>
                <div class="action-item like-box ${isLiked ? 'liked' : ''}" onclick="window.toggleLike('${postId}', ${isLiked}, '${originalAuthor}', event)"><span class="action-icon">${isLiked ? '❤️' : '🤍'}</span> <span onclick="window.showLikes('${postId}', event)">${likesArray.length}</span></div>
                <div class="action-item ${myBookmarks.includes(postId) ? 'liked' : ''}" onclick="window.toggleBookmark('${postId}', ${myBookmarks.includes(postId)}, event)" title="Yer İşaretlerine Ekle/Çıkar"><span class="action-icon">${myBookmarks.includes(postId) ? '🔖' : '📑'}</span></div>
                <div class="action-item" onclick="window.openShareModal('${postId}', event)" title="İlet"><span class="action-icon">📤</span></div>
            </div>
        </div>
        <div class="comments-wrapper" style="padding: 0 25px;">${buildCommentsTree(postData.comments || [], null, 0, postId, originalAuthor)}</div>
        <div style="position:sticky; bottom:0; background:white; padding:20px 25px; border-top:1px solid #f1f5f9; display:flex; flex-direction:column; gap:10px;">
            <div id="replying-to-info" style="display:none; font-size:13px; color:#64748b;">Yanıtlanıyor: <b id="replying-to-name"></b> <span style="cursor:pointer; color:#ef4444; margin-left:10px;" onclick="window.cancelDetailReply()">İptal</span></div>
            <div style="display:flex; gap:10px;"><input type="text" id="detail-comment-input" maxlength="500" style="flex:1; background:#f8fafc; border:1px solid #e2e8f0; padding:12px 15px; border-radius:8px; outline:none; font-size:15px; color:#0f172a;" placeholder="Görüşünüzü bildirin..."><button onclick="window.sendDetailComment('${postId}', '${originalAuthor}')" style="background:#2c3e50; color:white; border:none; border-radius:8px; padding:0 20px; font-weight:600; cursor:pointer;">Gönder</button></div>
        </div>
    `;
    document.getElementById('post-detail-content-box').scrollTop = 0; document.getElementById('post-detail-container').innerHTML = html; window.initVideoPlayers(); window.observeVideos(); document.getElementById('post-detail-modal').style.display = 'flex';
    document.body.classList.add('modal-open');
    document.getElementById('post-detail-modal').onclick = function(e) { if(e.target === this) window.closePostDetail(); };
};

function buildCommentsTree(allComments, parentId, depth = 0, postId = null, postAuthor = null) {
    if (depth > 15) return ''; let html = ''; const safeParentId = parentId || null;
    const children = allComments.filter(c => (c.parentId || null) === safeParentId).sort((a,b) => a.timestamp - b.timestamp);
    children.forEach(c => {
        const cUserData = allUsersData[c.author] || {}; const avatarHtml = cUserData.avatarUrl ? `<img src="${window.sanitizeUrl(cUserData.avatarUrl)}">` : `👤`;
        const vHtml = cUserData.isVerified ? `<span class="verified-badge" style="font-size:12px;">☑️</span>` : '';
        const safeCommentId = c.id || ('legacy_' + Math.random().toString(36).substr(2, 9));
        let deleteBtnHtml = ''; if (myUsername === c.author || myUsername === postAuthor) { deleteBtnHtml = `<div class="comment-action-btn" style="color:#ef4444;" onclick="window.deleteComment('${postId}', '${safeCommentId}')">Sil</div>`; }
        html += `<div class="comment-node"><div class="comment-header"><div class="comment-avatar" onclick="window.location.href='profile.html?user=${window.escapeHtml(c.author)}'" style="cursor:pointer;">${avatarHtml}</div><div class="comment-body"><div><a href="profile.html?user=${window.escapeHtml(c.author)}" class="comment-author-name">${window.escapeHtml(cUserData.fullName || c.author)}</a> ${vHtml} <span style="color:#64748b; font-size:13px; font-weight:normal;">@${window.escapeHtml(c.author)}</span></div><div class="comment-text">${DOMPurify.sanitize(c.text)}</div><div class="comment-actions"><div class="comment-action-btn" onclick="window.setDetailReply('${safeCommentId}', '${window.escapeHtml(c.author)}')">Yanıtla</div>${deleteBtnHtml}</div></div></div><div class="comment-replies">${buildCommentsTree(allComments, safeCommentId, depth + 1, postId, postAuthor)}</div></div>`;
    }); return html;
}

window.setDetailReply = function(commentId, authorName) { activeReplyParentId = commentId; document.getElementById('replying-to-info').style.display = 'block'; document.getElementById('replying-to-name').innerText = '@' + authorName; document.getElementById('detail-comment-input').focus(); };
window.cancelDetailReply = function() { activeReplyParentId = null; document.getElementById('replying-to-info').style.display = 'none'; };

window.sendDetailComment = async function(postId, postAuthor) {
    const input = document.getElementById('detail-comment-input'); const text = input.value.trim(); if (!text) return;
    if (text.length > 500) { alert("Yorumunuz en fazla 500 karakter olabilir!"); return; }
    if (window.isActionLocked && window.isActionLocked('comment_' + postId)) {
        window.showToast?.("Lütfen yeni yorum için birkaç saniye bekleyin.", "info");
        return;
    }
    const newComment = { id: generateUniqueId(), text: DOMPurify.sanitize(text), author: myUsername, timestamp: Date.now(), parentId: activeReplyParentId };
    const postObj = globalPosts.find(p => p.id === postId);
    if (postObj) { if (!postObj.data.comments) postObj.data.comments = []; postObj.data.comments.push(newComment); renderFeed(); window.openPostDetail(postId); }
    await updateDoc(doc(db, "posts", postId), { comments: arrayUnion(newComment) });
    
    let notifyTarget = postAuthor;
    if (activeReplyParentId && postObj && postObj.data && postObj.data.comments) {
        const parentComment = postObj.data.comments.find(c => c.id === activeReplyParentId);
        if (parentComment && parentComment.author) notifyTarget = parentComment.author;
    }
    if (notifyTarget && notifyTarget !== myUsername) {
        await addDoc(collection(db, "notifications"), { type: 'comment', sender: myUsername, recipient: notifyTarget, postId: postId, createdAt: serverTimestamp() });
    }

    input.value = ''; window.cancelDetailReply();
};

window.deleteComment = async function(postId, commentId) {
    if(confirm("Bu yorumu silmek istediğinize emin misiniz?")) {
        const postObj = globalPosts.find(p => p.id === postId);
        if (postObj && postObj.data.comments) { postObj.data.comments = postObj.data.comments.filter(c => c.id !== commentId && c.parentId !== commentId); renderFeed(); window.openPostDetail(postId); }
        try { const postRef = doc(db, "posts", postId); const postSnap = await getDoc(postRef); if(postSnap.exists()) { const postData = postSnap.data(); const updatedComments = postData.comments.filter(c => c.id !== commentId && c.parentId !== commentId); await updateDoc(postRef, { comments: updatedComments }); } } catch(e) {}
    }
};

function renderFeed() { window.currentGlobalPosts = globalPosts;
    const feedContainer = document.getElementById('feed-container'); feedContainer.innerHTML = ''; let displayedPosts = 0;
    globalPosts.forEach(post => {
        const postData = post.data; const isOwner = postData.author === myUsername; let originalAuthor = postData.author; if(postData.isRepost) { originalAuthor = postData.originalPostAuthor; }
        const isOriginalPrivate = allUsersData[originalAuthor]?.isPrivate || false; const amIFollowingOriginal = myFollowingList.includes(originalAuthor); const amIFollowingReposter = postData.isRepost ? myFollowingList.includes(postData.author) : false;
        if (currentFeedTab === 'following' && postData.author !== myUsername && !amIFollowingOriginal && !amIFollowingReposter) return;
        if (currentFeedTab === 'discover' && postData.author !== myUsername && isOriginalPrivate && !amIFollowingOriginal && !amIFollowingReposter) return;
        if (currentFeedTab === 'bookmarks' && !myBookmarks.includes(post.id)) return; 

        displayedPosts++;
        const likesArray = postData.likes || []; const isLiked = likesArray.includes(myUsername); const editedHtml = postData.isEdited ? '<span style="font-size:12px; color:#94a3b8; font-style:italic; margin-left:5px;">(düzenlendi)</span>' : '';
        const authorData = allUsersData[originalAuthor] || {}; const vHtml = authorData.isVerified ? `<span class="verified-badge">☑️</span>` : ''; const avatarImg = authorData.avatarUrl ? `<img src="${window.sanitizeUrl(authorData.avatarUrl)}" style="width:100%;height:100%;object-fit:cover;">` : `👤`; const fullName = window.escapeHtml(authorData.fullName || originalAuthor);
        
        let timeAgo = "";
        if(postData.createdAt) { let millis = 0; if (typeof postData.createdAt.toMillis === 'function') millis = postData.createdAt.toMillis(); else if (postData.createdAt.seconds) millis = postData.createdAt.seconds * 1000;
            if(millis > 0) { const secs = Math.floor((Date.now() - millis) / 1000); if(secs < 60) timeAgo = `${secs}s`; else if (secs < 3600) timeAgo = `${Math.floor(secs/60)}d`; else if (secs < 86400) timeAgo = `${Math.floor(secs/3600)}sa`; else timeAgo = `${Math.floor(secs/86400)}g`; } }
        
        let locationHtml = postData.location ? `<span style="font-size:13px; color:#3b82f6; margin-left:8px;">📍 ${window.escapeHtml(postData.location)}</span>` : '';
        const safeContentForEdit = postData.content ? postData.content.replace(/'/g, "\\'").replace(/"/g, '&quot;') : '';

        let repostHtml = ''; if(postData.isRepost) { const reposterName = postData.author === myUsername ? 'Sen' : window.escapeHtml(allUsersData[postData.author]?.fullName || postData.author); repostHtml = `<div class="repost-indicator" onclick="event.stopPropagation(); window.location.href='profile.html?user=${window.escapeHtml(postData.author)}'">🔁 ${reposterName} ağında paylaştı</div>`; }

        let mediaHtml = '';
        const likeAction = `window.handleMediaClick('${post.id}', ${isLiked}, '${originalAuthor}', event)`;
        if (postData.media && postData.media.length > 1) {
            let slides = postData.media.map(m => {
                let tag = m.type === 'video' ? `${window.renderCustomVideo(window.sanitizeUrl(m.url), likeAction, "feed-" + Math.random().toString(36).substr(2,9), post.id)}` : `<img src="${window.sanitizeUrl(m.url)}" style="width:100%; max-height:400px; object-fit:cover; border-radius:8px; cursor:pointer;" onclick="${likeAction}">`;
                return `<div style="flex: 0 0 100%; scroll-snap-align: start; position:relative;">${tag}<div class="dblclick-heart" id="heart-${post.id}" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%) scale(0); font-size:60px; color:white; text-shadow:0 0 10px rgba(0,0,0,0.5); pointer-events:none; transition:transform 0.3s ease;">❤️</div></div>`;
            }).join('');
            mediaHtml = `<div class="post-image-container"><div style="display:flex; overflow-x:auto; scroll-snap-type: x mandatory; gap: 10px; padding-bottom: 10px; max-width: 100%;">${slides}</div></div>`;
        } else if (postData.media && postData.media.length === 1) {
            let m = postData.media[0];
            let tag = m.type === 'video' ? `${window.renderCustomVideo(window.sanitizeUrl(m.url), likeAction, "feed-" + Math.random().toString(36).substr(2,9), post.id)}` : `<img src="${window.sanitizeUrl(m.url)}" class="post-image" style="cursor:pointer;" onclick="${likeAction}">`;
            mediaHtml = `<div class="post-image-container" style="position:relative;">${tag}<div class="dblclick-heart" id="heart-${post.id}" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%) scale(0); font-size:60px; color:white; text-shadow:0 0 10px rgba(0,0,0,0.5); pointer-events:none; transition:transform 0.3s ease;">❤️</div></div>`;
        } else if (postData.imageUrl) {
            mediaHtml = `<div class="post-image-container" style="position:relative;"><img src="${window.sanitizeUrl(postData.imageUrl)}" class="post-image" style="cursor:pointer;" onclick="${likeAction}"><div class="dblclick-heart" id="heart-${post.id}" style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%) scale(0); font-size:60px; color:white; text-shadow:0 0 10px rgba(0,0,0,0.5); pointer-events:none; transition:transform 0.3s ease;">❤️</div></div>`;
        }

        const postDiv = document.createElement('div'); postDiv.className = 'post'; postDiv.onclick = () => window.openPostDetail(post.id); 

        postDiv.innerHTML = `
            <div style="width:100%; display:flex; flex-direction:column;">
                ${repostHtml}
                <div style="display:flex; gap:15px;">
                    <div class="post-left">
                        <div class="post-avatar-img" onclick="event.stopPropagation(); window.location.href='profile.html?user=${window.escapeHtml(originalAuthor)}'" style="cursor:pointer;">${avatarImg}</div>
                    </div>
                    <div class="post-right">
                        <div class="post-header-info">
                            <div class="author-group" onclick="event.stopPropagation(); window.location.href='profile.html?user=${window.escapeHtml(originalAuthor)}'">
                                <span class="author-name">${fullName}</span>${vHtml} <span class="author-username">@${window.escapeHtml(originalAuthor)}</span> <span class="post-time">· ${timeAgo}</span> ${locationHtml} ${editedHtml}
                            </div>
                            <div style="position:relative;">
                                <button class="post-options-btn" onclick="window.toggleDropdown('${post.id}', event)">•••</button>
                                <div id="dropdown-${post.id}" class="dropdown-menu">
                                    ${(isOwner || (postData.isRepost && postData.author === myUsername)) ? `
                                        <div class="dropdown-item danger" onclick="event.stopPropagation(); window.deletePost('${post.id}')">Sil</div>
                                        ${!postData.isRepost ? `<div class="dropdown-item" onclick="event.stopPropagation(); window.openEditModal('${post.id}', '${safeContentForEdit}')">Düzenle</div>` : ''}
                                        <div class="dropdown-item" onclick="event.stopPropagation(); window.pinPost('${post.id}')">Sabitle</div>
                                    ` : `<div class="dropdown-item" onclick="event.stopPropagation(); alert('Bildirildi.')">Bildir</div>`}
                                </div>
                            </div>
                        </div>
                        <div class="post-content">${DOMPurify.sanitize(postData.content || '').replace(/#([a-zA-Z0-9ğüşıöçĞÜŞİÖÇ_]+)/g, `<a href="search.html?tag=$1" class="hashtag">#$1</a>`)}</div>
                        ${mediaHtml}
                        <div class="post-footer-actions">
                            <div class="action-item" onclick="event.stopPropagation(); window.openPostDetail('${post.id}')" title="Yanıtla"><span class="action-icon">💬</span> ${(postData.comments || []).length || ''}</div>
                            <div class="action-item repost-box" onclick="window.repostPost('${post.id}', '${originalAuthor}', event)" title="Ağınıza Ekle"><span class="action-icon">🔁</span> </div>
                            <div class="action-item like-box ${isLiked ? 'liked' : ''}" onclick="window.toggleLike('${post.id}', ${isLiked}, '${originalAuthor}', event)" title="Beğen"><span class="action-icon">${isLiked ? '❤️' : '🤍'}</span> <span onclick="window.showLikes('${post.id}', event)">${likesArray.length || ''}</span></div>
                            <div class="action-item ${myBookmarks.includes(post.id) ? 'liked' : ''}" onclick="window.toggleBookmark('${post.id}', ${myBookmarks.includes(post.id)}, event)" title="Kaydet"><span class="action-icon">${myBookmarks.includes(post.id) ? '🔖' : '📑'}</span></div>
                            <div class="action-item" onclick="window.openShareModal('${post.id}', event)" title="İlet"><span class="action-icon">📤</span></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        feedContainer.appendChild(postDiv);
    });
    window.initVideoPlayers(); window.observeVideos();
    if(displayedPosts === 0) { 
        if(currentFeedTab === 'bookmarks') { feedContainer.innerHTML = '<div style="padding: 60px 20px; text-align: center; color: #64748b;"><div style="font-size:40px; margin-bottom:15px;">📑</div><div style="font-size:18px; font-weight:700; color:#0f172a; margin-bottom:5px;">Henüz kaydedilmiş içerik yok.</div>İçeriklerdeki yer işareti ikonuna tıklayarak koleksiyonunuzu oluşturun.</div>'; } 
        else { feedContainer.innerHTML = '<div style="padding: 40px; text-align: center; color: #64748b;">Buralar çok sessiz...</div>'; }
    }
    if (window.initVideoObserver) window.initVideoObserver();
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const pdm = document.getElementById('post-detail-modal');
        if (pdm && pdm.style.display !== 'none' && pdm.style.display !== '') {
            window.closePostDetail();
        }
    }
});