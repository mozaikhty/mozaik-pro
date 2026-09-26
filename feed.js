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

let activeChats = [];
let lastVisiblePostSnap = null; const POSTS_PER_PAGE = 10; let isLoadingMore = false; let hasMorePosts = true;

document.addEventListener('click', function(event) {
    if (!event.target.closest('.post-options-btn')) { 
        document.querySelectorAll('[id^="dropdown-"]').forEach(menu => menu.classList.add('hidden')); 
    }
    if (event.target.classList.contains('modal-overlay') && event.target.id !== 'story-viewer-overlay') {
        event.target.style.display = 'none';
        if(event.target.id === 'post-detail-modal') { window.closePostDetail(); return; }
        if(event.target.id === 'story-details-modal' || event.target.id === 'story-share-modal') { if(window.resumeStory) window.resumeStory(); }
    }
});

window.goToMyProfile = function() { if(myUsername) window.location.href = 'profile.html?user=' + myUsername; };
window.logoutUser = function() { signOut(auth).then(() => { window.location.href = "index.html"; }); };

window.switchFeedTab = function(tabName) {
    currentFeedTab = tabName;
    document.getElementById('tab-discover').classList.replace('border-cyan-500', 'border-transparent');
    document.getElementById('tab-discover').classList.replace('dark:border-cyan-400', 'border-transparent');
    document.getElementById('tab-discover').classList.replace('text-cyan-600', 'text-slate-500');
    document.getElementById('tab-discover').classList.replace('dark:text-cyan-400', 'dark:text-gray-400');
    
    document.getElementById('tab-following').classList.replace('border-cyan-500', 'border-transparent');
    document.getElementById('tab-following').classList.replace('dark:border-cyan-400', 'border-transparent');
    document.getElementById('tab-following').classList.replace('text-cyan-600', 'text-slate-500');
    document.getElementById('tab-following').classList.replace('dark:text-cyan-400', 'dark:text-gray-400');
    
    const activeTab = document.getElementById(`tab-${tabName}`);
    if (activeTab) {
        activeTab.classList.replace('border-transparent', 'border-cyan-500');
        activeTab.classList.replace('text-slate-500', 'text-cyan-600');
        // Dark mode overrides
        activeTab.classList.add('dark:border-cyan-400', 'dark:text-cyan-400');
        activeTab.classList.remove('dark:text-gray-400');
    }
    renderFeed();
};

window.showBookmarksTab = function() { window.switchFeedTab('bookmarks'); };

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user; myUsername = currentUser.displayName || localStorage.getItem('mozaik_username') || currentUser.email.split('@')[0];
        window.myUsername = myUsername; 
        const checkMyBan = await getDoc(doc(db, "users", myUsername));
        if (checkMyBan.exists() && checkMyBan.data().isBanned === true) { signOut(auth).then(() => { window.location.href = "index.html"; }); return; }

        onSnapshot(doc(db, "users", myUsername), async (docSnap) => { 
            if(docSnap.exists()) {
                const u = docSnap.data(); allUsersData[myUsername] = u; myFollowingList = u.following || []; myBookmarks = u.bookmarks || []; 
                window.allUsersData = allUsersData; window.myFollowingList = myFollowingList; 
                await window.fetchMissingUsers(myFollowingList);
                
                if(u.avatarUrl) {
                    const imgTag = `<img src="${window.sanitizeUrl(u.avatarUrl)}" class="w-full h-full object-cover">`;
                    const deskAv = document.getElementById('desktop-input-avatar'); if(deskAv) deskAv.innerHTML = imgTag;
                    const mobAv = document.getElementById('mobile-avatar-header'); if(mobAv) mobAv.innerHTML = imgTag;
                    const modAv = document.getElementById('modal-avatar'); if(modAv) modAv.innerHTML = imgTag;
                }
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
        
        if (window.cleanupExpiredStories) { setTimeout(() => { window.cleanupExpiredStories(); }, 5000); }
        
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
    } catch(error) { console.error("Gönderiler yüklenemedi:", error); }
}

function renderWhoToFollow() {
    const container = document.getElementById('who-to-follow-list'); if (!container) return;
    let eligibleUsers = Object.keys(allUsersData).filter(uid => { return uid !== myUsername && !myFollowingList.includes(uid); });
    eligibleUsers = eligibleUsers.sort(() => 0.5 - Math.random()).slice(0, 3);
    if (eligibleUsers.length === 0) { container.innerHTML = '<div class="text-sm text-slate-500 dark:text-gray-400 py-2">Şu an için yeni öneri yok.</div>'; return; }
    
    let html = '';
    eligibleUsers.forEach(uid => {
        const uData = allUsersData[uid]; 
        const avatarHtml = uData.avatarUrl ? `<img src="${window.sanitizeUrl(uData.avatarUrl)}" class="w-8 h-8 rounded-full object-cover">` : `<div class="w-8 h-8 rounded-full bg-slate-200 dark:bg-gray-700 flex items-center justify-center font-bold text-xs text-slate-500 dark:text-gray-300">👤</div>`;
        const fullName = window.escapeHtml(uData.fullName || uid); 
        const vHtml = uData.isVerified ? '<i class="fa-solid fa-circle-check text-blue-500 text-[10px] ml-1"></i>' : '';
        
        html += `
        <div class="flex justify-between items-center cursor-pointer hover:bg-slate-50 dark:hover:bg-[#1e293b] p-2 rounded-xl transition" onclick="window.location.href='profile.html?user=${window.escapeHtml(uid)}'">
            <div class="flex items-center gap-2">
                ${avatarHtml}
                <div>
                    <p class="text-xs font-bold text-slate-900 dark:text-white flex items-center">${fullName} ${vHtml}</p>
                    <p class="text-[10px] text-slate-500 dark:text-gray-400">@${window.escapeHtml(uid)}</p>
                </div>
            </div>
            <button onclick="event.stopPropagation(); window.quickFollow('${window.escapeHtml(uid)}')" class="bg-slate-100 dark:bg-transparent border border-slate-200 dark:border-gray-600 text-xs px-3 py-1 rounded-full text-slate-700 dark:text-white hover:bg-slate-200 dark:hover:bg-gray-700 transition font-semibold">Takip Et</button>
        </div>`;
    });
    container.innerHTML = html;
}

function updateCharCount(inputId, counterId, btnId) {
    const input = document.getElementById(inputId); const counter = document.getElementById(counterId); const btn = document.getElementById(btnId);
    if(!input || !counter || !btn) return;
    const remaining = MAX_CHARS - input.value.length; counter.innerText = remaining;
    if (remaining <= 20) { counter.classList.add('text-red-500'); } else { counter.classList.remove('text-red-500'); }
    if (input.value.trim().length > 0) btn.disabled = false; else btn.disabled = true;
}

document.getElementById('post-text')?.addEventListener('input', () => updateCharCount('post-text', 'inline-char-count', 'share-btn'));
document.getElementById('modal-post-text')?.addEventListener('input', () => updateCharCount('modal-post-text', 'modal-char-count', 'modal-share-btn'));

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
            btn.disabled = false;
        } catch(e) { alert("Konum bilgisi alınamadı."); btn.innerText = originalText; btn.disabled = false; }
    }, () => { alert("Konum izni reddedildi."); btn.innerText = originalText; btn.disabled = false; });
};

window.removeLocation = function(isModal) { if(isModal) { currentModalLocation = null; document.getElementById('modal-location-preview-text').style.display = 'none'; } else { currentPostLocation = null; document.getElementById('location-preview-text').style.display = 'none'; } };
window.closeMainPostModal = function() { document.getElementById('main-post-modal').style.display = 'none'; document.getElementById('modal-post-text').value = ''; document.getElementById('modal-char-count').innerText = MAX_CHARS; document.getElementById('modal-share-btn').disabled = true; document.getElementById('modal-image-input').value = ''; document.getElementById('modal-image-preview-text').style.display = 'none'; window.removeLocation(true); };

document.getElementById('image-input')?.addEventListener('change', (e) => { 
    if(e.target.files.length > 0) { 
        const previewEl = document.getElementById('image-preview-text');
        previewEl.style.display = 'flex'; previewEl.innerHTML = '';
        Array.from(e.target.files).forEach(file => {
            if (file.type.startsWith('video/')) {
                previewEl.innerHTML += `<video src="${URL.createObjectURL(file)}" autoplay muted loop class="max-h-24 rounded-lg mt-2"></video>`;
            } else {
                previewEl.innerHTML += `<img src="${URL.createObjectURL(file)}" class="max-h-24 rounded-lg mt-2">`;
            }
        });
        document.getElementById('share-btn').disabled = false; 
    }
});
document.getElementById('modal-image-input')?.addEventListener('change', (e) => { 
    if(e.target.files.length > 0) { 
        const previewEl = document.getElementById('modal-image-preview-text');
        previewEl.style.display = 'flex'; previewEl.innerHTML = '';
        Array.from(e.target.files).forEach(file => {
            if (file.type.startsWith('video/')) {
                previewEl.innerHTML += `<video src="${URL.createObjectURL(file)}" autoplay muted loop class="max-h-24 rounded-lg mt-2"></video>`;
            } else {
                previewEl.innerHTML += `<img src="${URL.createObjectURL(file)}" class="max-h-24 rounded-lg mt-2">`;
            }
        });
        document.getElementById('modal-share-btn').disabled = false; 
    }
});

async function submitPost(textId, imageId, btnId, previewId, isModal) {
    try {
        const uSnap = await getDoc(doc(db, "users", myUsername));
        if (uSnap.exists()) {
            const uData = uSnap.data();
            const today = new Date().toISOString().split('T')[0];
            if (uData.lastPostDate === today && (uData.postCountToday || 0) >= 20) {
                alert("Günlük sınırınıza ulaştınız."); return;
            }
        }
    } catch(e) {}

    const text = document.getElementById(textId).value.trim(); 
    let files = document.getElementById(imageId).files;
    let loc = isModal ? currentModalLocation : currentPostLocation;
    
    if(!text && files.length === 0 && !loc) return; 
    if (text.length > MAX_CHARS) return;
    if (window.isActionLocked && window.isActionLocked('submit_post')) return;

    const btn = document.getElementById(btnId); btn.disabled = true; btn.innerText = "Yükleniyor..."; 
    let mediaArray = [];
    
    try {
        if(files.length > 0) { 
            for (let rawFile of files) {
                let file = rawFile;
                let isVideo = (file.type || '').startsWith('video/');
                if (!isVideo && file.name && (file.name.toLowerCase().endsWith('.mp4') || file.name.toLowerCase().endsWith('.mov'))) isVideo = true;
                if (!isVideo) { file = await window.compressImage(rawFile, 1200, 1200, 0.75, 800 * 1024); }

                const safeName = (file.name || 'video.mp4').replace(/[^a-zA-Z0-9.]/g, "");
                const fileName = `posts/${auth.currentUser.uid}_${Date.now()}_${safeName}`;
                const storageRef = ref(storage, fileName);
                
                await new Promise((resolve, reject) => {
                    const cType = file.type || (isVideo ? 'video/mp4' : 'image/jpeg');
                    file.arrayBuffer().then(buffer => {
                        const cleanBlob = new Blob([buffer], { type: cType });
                        const uploadTaskPromise = uploadBytes(storageRef, cleanBlob, { contentType: cType });
                        uploadTaskPromise.then(() => resolve()).catch((err) => reject(err));
                    });
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
        btn.disabled = false; btn.innerText = "Yayınla"; updateCharCount(textId, isModal ? 'modal-char-count' : 'inline-char-count', btnId);
        if(isModal) window.closeMainPostModal();
        loadFeedPosts();
        
    } catch(e) { 
        alert("Yüklenirken bir hata oluştu: " + e.message);
        btn.disabled = false; btn.innerText = "Yayınla"; 
    }
}

document.getElementById('share-btn')?.addEventListener('click', () => submitPost('post-text', 'image-input', 'share-btn', 'image-preview-text', false));
document.getElementById('modal-share-btn')?.addEventListener('click', () => submitPost('modal-post-text', 'modal-image-input', 'modal-share-btn', 'modal-image-preview-text', true));

window.actionLocks = {};
window.isActionLocked = function(actionId) { if (window.actionLocks[actionId]) return true; window.actionLocks[actionId] = true; setTimeout(() => { window.actionLocks[actionId] = false; }, 1500); return false; };

window.toggleLike = async function(postId, isLiked, postAuthor, event) { 
    event.stopPropagation(); if (window.isActionLocked('like_' + postId)) return; 
    
    const postObj = globalPosts.find(p => p.id === postId);
    if (postObj) { 
        if (!postObj.data.likes) postObj.data.likes = []; 
        if (isLiked) { postObj.data.likes = postObj.data.likes.filter(u => u !== myUsername); } 
        else { postObj.data.likes.push(myUsername); } 
        renderFeed(); 
        if (window.currentOpenPostId === postId) window.openPostDetail(postId); 
    }
    const postRef = doc(db, "posts", postId); 
    if (isLiked) { await updateDoc(postRef, { likes: arrayRemove(myUsername) }); } else { await updateDoc(postRef, { likes: arrayUnion(myUsername) }); if (postAuthor !== myUsername) { await addDoc(collection(db, "notifications"), { type: 'like', sender: myUsername, recipient: postAuthor, postId: postId, createdAt: serverTimestamp() }); } } 
};

window.toggleBookmark = async function(postId, isBookmarked, event) { 
    event.stopPropagation(); const myRef = doc(db, "users", myUsername); 
    if (isBookmarked) { 
        myBookmarks = myBookmarks.filter(id => id !== postId);
        await updateDoc(myRef, { bookmarks: arrayRemove(postId) }); 
    } else { 
        myBookmarks.push(postId);
        await updateDoc(myRef, { bookmarks: arrayUnion(postId) }); 
    } 
    renderFeed();
};

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
        try { await addDoc(collection(db, "posts"), { isRepost: true, originalPostId: postId, originalPostAuthor: originalAuthor, content: originalPost.data.content || '', imageUrl: originalPost.data.imageUrl || null, author: myUsername, authorEmail: currentUser.email, createdAt: serverTimestamp(), likes: [], comments: [] }); window.showToast?.("Ağınıza eklendi! 🔁"); loadFeedPosts(); } catch (error) {}
    }
};

window.toggleDropdown = function(postId, event) { 
    event.stopPropagation(); 
    document.querySelectorAll('[id^="dropdown-"]').forEach(menu => { 
        if(menu.id !== `dropdown-${postId}`) menu.classList.add('hidden'); 
    }); 
    const menu = document.getElementById(`dropdown-${postId}`); 
    if(menu) menu.classList.toggle('hidden'); 
};

window.pinPost = async function(postId) {
    try {
        const userRef = doc(db, "users", myUsername);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            const currentPinned = userSnap.data().pinnedPostId;
            if (currentPinned === postId) {
                await updateDoc(userRef, { pinnedPostId: null });
                window.showToast?.('Gönderi sabitlemeden kaldırıldı.');
            } else {
                await updateDoc(userRef, { pinnedPostId: postId });
                window.showToast?.('Gönderi profilinize sabitlendi.');
            }
        }
    } catch(e) {}
};

window.openEditModal = function(postId, currentContent) { currentlyEditingPostId = postId; document.getElementById('edit-post-input').value = currentContent; document.getElementById('edit-post-modal').style.display = 'flex'; };

document.getElementById('save-edited-post-btn')?.addEventListener('click', async () => {
    if(!currentlyEditingPostId) return; const newContent = document.getElementById('edit-post-input').value.trim(); if(!newContent) return;
    if (newContent.length > 280) { alert("Gönderi en fazla 280 karakter olabilir!"); return; }
    const postObj = globalPosts.find(p => p.id === currentlyEditingPostId);
    if (postObj) { postObj.data.content = newContent; postObj.data.isEdited = true; renderFeed(); if (window.currentOpenPostId === currentlyEditingPostId) window.openPostDetail(currentlyEditingPostId); }
    document.getElementById('edit-post-modal').style.display = 'none';
    try { await updateDoc(doc(db, "posts", currentlyEditingPostId), { content: newContent, isEdited: true }); } catch(e) {}
});

window.openShareModal = function(postId, event) {
    event.stopPropagation(); postToShare = postId; const container = document.getElementById('share-users-list'); container.innerHTML = '';
    if(myFollowingList.length === 0) { container.innerHTML = '<div class="text-center text-slate-500 dark:text-gray-400 p-4">İletmek için önce ağınıza kişi eklemelisiniz.</div>'; }
    else {
        myFollowingList.forEach(uname => {
            let uData = allUsersData[uname] || {}; let avatarHtml = uData.avatarUrl ? `<img src="${window.sanitizeUrl(uData.avatarUrl)}" class="w-10 h-10 rounded-full object-cover">` : `<div class="w-10 h-10 rounded-full bg-slate-200 dark:bg-gray-800 flex items-center justify-center">👤</div>`; 
            container.innerHTML += `<div class="flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-gray-800/50 rounded-xl cursor-pointer transition border border-transparent hover:border-slate-200 dark:hover:border-gray-700" onclick="window.sendPostAsMessage('${window.escapeHtml(uname)}')"><div class="flex-shrink-0">${avatarHtml}</div><div class="flex-1"><div class="font-bold text-slate-900 dark:text-white">${window.escapeHtml(uData.fullName || uname)}</div><div class="text-xs text-slate-500 dark:text-gray-400">@${window.escapeHtml(uname)}</div></div><button class="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm transition">Gönder</button></div>`;
        });
    }
    document.getElementById('share-dm-modal').style.display = 'flex';
};

window.sendPostAsMessage = async function(targetUser) {
    if(!postToShare) return; const chatId = [myUsername, targetUser].sort().join('_'); const postLink = `${window.location.origin}/profile.html?post=${postToShare}`;
    await addDoc(collection(db, "chats", chatId, "messages"), { text: `🔗 İçerik İletildi: ${postLink}`, sender: myUsername, createdAt: serverTimestamp(), isRead: false, type: 'regular' });
    await setDoc(doc(db, "chats", chatId), { participants: [myUsername, targetUser], lastMessage: '🔗 İçerik İletildi', lastSender: myUsername, updatedAt: serverTimestamp() }, { merge: true });
    window.showToast?.(`İçerik iletildi.`, 'success'); document.getElementById('share-dm-modal').style.display = 'none';
};

function generateUniqueId() { return Math.random().toString(36).substr(2, 9); }
window.closePostDetail = function() { document.body.classList.remove('modal-open'); document.getElementById('post-detail-modal').style.display = 'none'; window.currentOpenPostId = null; activeReplyParentId = null; document.getElementById('post-detail-container').innerHTML = ''; window.history.replaceState({}, document.title, window.location.pathname); };

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
                await window.fetchMissingUsers([postObj.data.author]);
            }
        } catch (e) {}
    }
    if(!postObj) return; const postData = postObj.data; 
    
    let originalAuthor = postData.author; if(postData.isRepost) { originalAuthor = postData.originalPostAuthor; }
    const authorData = allUsersData[originalAuthor] || {}; const likesArray = postData.likes || []; const isLiked = likesArray.includes(myUsername);
    const vHtml = authorData.isVerified ? `<i class="fa-solid fa-circle-check text-blue-500 text-xs ml-1"></i>` : ''; 
    const avatarImg = authorData.avatarUrl ? `<img src="${window.sanitizeUrl(authorData.avatarUrl)}" class="w-full h-full object-cover">` : `<div class="w-full h-full flex justify-center items-center">👤</div>`;
    const fullName = window.escapeHtml(authorData.fullName || originalAuthor);
    
    let timeString = "";
    if (postData.createdAt) {
        if (typeof postData.createdAt.toMillis === 'function') { timeString = new Date(postData.createdAt.toMillis()).toLocaleString('tr-TR', {day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}); } 
        else if (postData.createdAt.seconds) { timeString = new Date(postData.createdAt.seconds * 1000).toLocaleString('tr-TR', {day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
    }
    
    let locHtml = postData.location ? `<span class="text-cyan-500 text-sm ml-2">📍 ${window.escapeHtml(postData.location)}</span>` : '';
    let repostLabel = "";
    if(postData.isRepost) { repostLabel = `<div class="px-5 mb-2 text-xs font-semibold text-slate-500 dark:text-gray-400">🔁 @${postData.author} ağında paylaştı</div>`; }

    let mediaHtmlDetail = '';
    if (postData.media && postData.media.length > 1) {
        let slides = postData.media.map((m, idx) => {
            let tag = m.type === 'video' ? `<div class="mt-3">` + window.renderCustomVideo(window.sanitizeUrl(m.url), '', postId + '-' + idx, postId) + `</div>` : `<img src="${window.sanitizeUrl(m.url)}" class="w-full max-h-[60vh] rounded-xl object-contain">`;
            return `<div style="flex: 0 0 100%; scroll-snap-align: start;">${tag}</div>`;
        }).join('');
        mediaHtmlDetail = `<div style="display:flex; overflow-x:auto; scroll-snap-type: x mandatory; gap: 10px; padding-bottom: 10px; max-width: 100%; margin-bottom:15px;">${slides}</div>`;
    } else if (postData.media && postData.media.length === 1) {
        let m = postData.media[0];
        mediaHtmlDetail = m.type === 'video' ? `<div class="mt-3">` + window.renderCustomVideo(window.sanitizeUrl(m.url), '', postId, postId) + `</div>` : `<img src="${window.sanitizeUrl(m.url)}" class="w-full max-h-[60vh] rounded-xl object-contain mb-4">`;
    } else if (postData.imageUrl) {
        mediaHtmlDetail = `<img src="${window.sanitizeUrl(postData.imageUrl)}" class="w-full max-h-[60vh] rounded-xl object-contain mb-4">`;
    }

    const postContent = DOMPurify.sanitize(postData.content || '').replace(/#([a-zA-Z0-9ğüşıöçĞÜŞİÖÇ_]+)/g, `<a href="search.html?tag=$1" class="text-cyan-500 hover:underline" onclick="event.stopPropagation()">#$1</a>`);

    let html = `
        ${repostLabel}
        <div class="px-5 pb-4 border-b border-slate-200 dark:border-gray-800">
            <div class="flex items-center gap-3 mb-4 cursor-pointer" onclick="window.location.href='profile.html?user=${originalAuthor}'">
                <div class="w-12 h-12 rounded-full bg-slate-100 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 flex justify-center items-center overflow-hidden">${avatarImg}</div>
                <div class="flex-1">
                    <div class="font-bold text-slate-900 dark:text-white flex items-center">${fullName} ${vHtml}</div>
                    <div class="text-sm text-slate-500 dark:text-gray-400">@${originalAuthor} ${locHtml}</div>
                </div>
            </div>
            <div class="text-base leading-relaxed text-slate-800 dark:text-gray-200 mb-4 break-words">
                ${postContent}
            </div>
            ${mediaHtmlDetail}
            <div class="text-xs text-slate-500 dark:text-gray-400 pb-3">${timeString}</div>
            
            <div class="flex gap-6 py-3 text-slate-500 dark:text-gray-400 font-semibold border-t border-slate-200 dark:border-gray-800">
                <div class="cursor-pointer hover:text-blue-500 transition" onclick="document.getElementById('detail-comment-input').focus()">💬 ${(postData.comments || []).length}</div>
                <div class="cursor-pointer hover:text-green-500 transition" onclick="window.repostPost('${postId}', '${originalAuthor}', event)">🔁</div>
                <div class="cursor-pointer hover:text-red-500 transition ${isLiked ? 'text-red-500' : ''}" onclick="window.toggleLike('${postId}', ${isLiked}, '${originalAuthor}', event)">${isLiked ? '❤️' : '🤍'} <span onclick="window.showLikes('${postId}', event)">${likesArray.length}</span></div>
                <div class="cursor-pointer hover:text-cyan-500 transition ${myBookmarks.includes(postId) ? 'text-cyan-500' : ''}" onclick="window.toggleBookmark('${postId}', ${myBookmarks.includes(postId)}, event)">${myBookmarks.includes(postId) ? '🔖' : '📑'}</div>
                <div class="cursor-pointer hover:text-purple-500 transition" onclick="window.openShareModal('${postId}', event)">📤</div>
            </div>
        </div>

        <div class="px-5 pt-4">
            ${buildCommentsTree(postData.comments || [], null, 0, postId, originalAuthor)}
        </div>
        
        <div class="sticky bottom-0 bg-white dark:bg-[#151e32] p-4 border-t border-slate-200 dark:border-gray-800 flex flex-col gap-2">
            <div id="replying-to-info" class="hidden text-xs text-slate-500 dark:text-gray-400">
                Yanıtlanıyor: <b id="replying-to-name"></b> <span class="cursor-pointer text-red-500 ml-2" onclick="window.cancelDetailReply()">İptal</span>
            </div>
            <div class="flex gap-2">
                <input type="text" id="detail-comment-input" maxlength="500" class="flex-1 bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 px-4 py-2 rounded-xl outline-none text-sm text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-gray-500" placeholder="Görüşünüzü bildirin...">
                <button onclick="window.sendDetailComment('${postId}', '${originalAuthor}')" class="bg-cyan-600 hover:bg-cyan-700 text-white border-none rounded-xl px-4 font-bold cursor-pointer transition shadow-sm">Gönder</button>
            </div>
        </div>
    `;
    const contentBox = document.getElementById('post-detail-content-box');
    if(contentBox) contentBox.scrollTop = 0; 
    document.getElementById('post-detail-container').innerHTML = html; 
    window.initVideoPlayers?.(); window.observeVideos?.();
    document.getElementById('post-detail-modal').style.display = 'flex';
    document.body.classList.add('modal-open');
};

function buildCommentsTree(allComments, parentId, depth = 0, postId = null, postAuthor = null) {
    if (depth > 15) return ''; 
    let html = ''; const safeParentId = parentId || null;
    const children = allComments.filter(c => (c.parentId || null) === safeParentId).sort((a,b) => a.timestamp - b.timestamp);
    
    children.forEach(c => {
        const cUserData = allUsersData[c.author] || {}; const avatarHtml = cUserData.avatarUrl ? `<img src=\"${window.sanitizeUrl(cUserData.avatarUrl)}\" class="w-full h-full object-cover">` : `👤`;
        const vHtml = cUserData.isVerified ? `<i class="fa-solid fa-circle-check text-blue-500 text-[10px] ml-1"></i>` : '';
        const safeCommentId = c.id || ('legacy_' + Math.random().toString(36).substr(2, 9));

        let deleteBtnHtml = '';
        if (myUsername === c.author || myUsername === postAuthor) { deleteBtnHtml = `<div class="cursor-pointer text-red-500 hover:underline" onclick="window.deleteComment('${postId}', '${safeCommentId}')">Sil</div>`; }

        html += `
            <div class="mt-4 bg-slate-50 dark:bg-gray-800/50 p-3 rounded-xl border border-slate-200 dark:border-gray-700/50">
                <div class="flex gap-3 items-start">
                    <div class="w-8 h-8 rounded-full bg-slate-200 dark:bg-gray-700 flex items-center justify-center cursor-pointer overflow-hidden flex-shrink-0" onclick="window.location.href='profile.html?user=${c.author}'">${avatarHtml}</div>
                    <div class="flex-1">
                        <div><a href="profile.html?user=${window.escapeHtml(c.author)}" class="font-bold text-slate-800 dark:text-white text-sm hover:underline">${window.escapeHtml(cUserData.fullName || c.author)}</a> ${vHtml} <span class="text-slate-500 dark:text-gray-400 text-xs font-normal">@${window.escapeHtml(c.author)}</span></div>
                        <div class="text-sm text-slate-700 dark:text-gray-300 mt-1">${DOMPurify.sanitize(c.text)}</div>
                        <div class="flex gap-4 mt-2 text-xs font-semibold text-slate-500 dark:text-gray-400">
                            <div class="cursor-pointer hover:text-slate-800 dark:hover:text-white transition" onclick="window.setDetailReply('${safeCommentId}', '${c.author}')">Yanıtla</div>
                            ${deleteBtnHtml}
                        </div>
                    </div>
                </div>
                <div class="ml-4 pl-4 border-l-2 border-slate-200 dark:border-gray-700 mt-2">
                    ${buildCommentsTree(allComments, safeCommentId, depth + 1, postId, postAuthor)}
                </div>
            </div>
        `;
    });
    return html;
}

window.setDetailReply = function(commentId, authorName) { activeReplyParentId = commentId; const info = document.getElementById('replying-to-info'); if(info) info.classList.remove('hidden'); document.getElementById('replying-to-name').innerText = '@' + authorName; document.getElementById('detail-comment-input').focus(); };
window.cancelDetailReply = function() { activeReplyParentId = null; const info = document.getElementById('replying-to-info'); if(info) info.classList.add('hidden'); };

window.sendDetailComment = async function(postId, postAuthor) {
    const input = document.getElementById('detail-comment-input'); const text = input.value.trim(); if (!text) return;
    if (text.length > 500) { alert("Yorumunuz en fazla 500 karakter olabilir!"); return; }
    if (window.isActionLocked && window.isActionLocked('comment_' + postId)) { return; }
    const newComment = { id: generateUniqueId(), text: text, author: myUsername, timestamp: Date.now(), parentId: activeReplyParentId };
    
    const postObj = globalPosts.find(p => p.id === postId);
    if (postObj) {
        if (!postObj.data.comments) postObj.data.comments = [];
        postObj.data.comments.push(newComment);
        renderFeed();
        window.openPostDetail(postId);
    }

    await updateDoc(doc(db, "posts", postId), { comments: arrayUnion(newComment) });
    input.value = ''; window.cancelDetailReply();
};

window.deleteComment = async function(postId, commentId) {
    if(confirm("Bu yorumu silmek istediğinize emin misiniz?")) {
        const postObj = globalPosts.find(p => p.id === postId);
        if (postObj && postObj.data.comments) {
            postObj.data.comments = postObj.data.comments.filter(c => c.id !== commentId && c.parentId !== commentId);
            renderFeed();
            window.openPostDetail(postId);
        }

        try {
            const postRef = doc(db, "posts", postId); const postSnap = await getDoc(postRef);
            if(postSnap.exists()) {
                const postData = postSnap.data();
                const updatedComments = postData.comments.filter(c => c.id !== commentId && c.parentId !== commentId);
                await updateDoc(postRef, { comments: updatedComments }); 
            }
        } catch(e) {}
    }
};

// =====================================
// TAILWIND TASARIMLI RENDER FEED
// =====================================
function renderFeed() { 
    window.currentGlobalPosts = globalPosts;
    const feedContainer = document.getElementById('feed-container'); 
    if(!feedContainer) return;
    feedContainer.innerHTML = ''; 
    let displayedPosts = 0;
    
    globalPosts.forEach(post => {
        const postData = post.data; 
        const isOwner = postData.author === myUsername; 
        let originalAuthor = postData.author; 
        if(postData.isRepost) { originalAuthor = postData.originalPostAuthor; }
        
        const isOriginalPrivate = allUsersData[originalAuthor]?.isPrivate || false; 
        const amIFollowingOriginal = myFollowingList.includes(originalAuthor); 
        const amIFollowingReposter = postData.isRepost ? myFollowingList.includes(postData.author) : false;
        
        if (currentFeedTab === 'following' && postData.author !== myUsername && !amIFollowingOriginal && !amIFollowingReposter) return;
        if (currentFeedTab === 'discover' && postData.author !== myUsername && isOriginalPrivate && !amIFollowingOriginal && !amIFollowingReposter) return;
        if (currentFeedTab === 'bookmarks' && !myBookmarks.includes(post.id)) return; 

        displayedPosts++;
        const likesArray = postData.likes || []; 
        const isLiked = likesArray.includes(myUsername); 
        
        const authorData = allUsersData[originalAuthor] || {}; 
        const vHtml = authorData.isVerified ? `<i class="fa-solid fa-circle-check text-blue-500 text-[10px] ml-1"></i>` : ''; 
        const avatarImgSrc = authorData.avatarUrl ? window.sanitizeUrl(authorData.avatarUrl) : ''; 
        const avatarHtml = avatarImgSrc ? `<img src="${avatarImgSrc}" class="w-full h-full object-cover">` : `<div class="w-full h-full flex items-center justify-center font-bold text-xs text-slate-500 dark:text-gray-400">👤</div>`;
        const fullName = window.escapeHtml(authorData.fullName || originalAuthor);
        
        let timeAgo = "";
        if(postData.createdAt) { 
            let millis = 0; 
            if (typeof postData.createdAt.toMillis === 'function') millis = postData.createdAt.toMillis(); 
            else if (postData.createdAt.seconds) millis = postData.createdAt.seconds * 1000;
            if(millis > 0) { 
                const secs = Math.floor((Date.now() - millis) / 1000); 
                if(secs < 60) timeAgo = `${secs}s`; 
                else if (secs < 3600) timeAgo = `${Math.floor(secs/60)}d`; 
                else if (secs < 86400) timeAgo = `${Math.floor(secs/3600)}sa`; 
                else timeAgo = `${Math.floor(secs/86400)}g`; 
            } 
        }
        
        let locationHtml = postData.location ? `• <span class="text-cyan-500 dark:text-cyan-400"><i class="fa-solid fa-location-dot"></i> ${window.escapeHtml(postData.location)}</span>` : '';
        const safeContentForEdit = postData.content ? postData.content.replace(/'/g, "\\'").replace(/"/g, '&quot;') : '';

        let repostHtml = ''; 
        if(postData.isRepost) { 
            const reposterName = postData.author === myUsername ? 'Sen' : window.escapeHtml(allUsersData[postData.author]?.fullName || postData.author); 
            repostHtml = `<div class="text-xs text-slate-500 dark:text-gray-400 mb-3 cursor-pointer hover:text-slate-800 dark:hover:text-white transition flex items-center gap-1 font-medium" onclick="event.stopPropagation(); window.location.href='profile.html?user=${window.escapeHtml(postData.author)}'"><i class="fa-solid fa-retweet"></i> ${reposterName} ağında paylaştı</div>`; 
        }

        let mediaHtml = '';
        if (postData.media && postData.media.length > 1) {
            let slides = postData.media.map((m, idx) => {
                let tag = m.type === 'video' ? `<div class="mt-3">` + window.renderCustomVideo(window.sanitizeUrl(m.url), '', post.id + '-' + idx, post.id) + `</div>` : `<img src="${window.sanitizeUrl(m.url)}" class="w-full h-[400px] object-cover rounded-xl mt-3 border border-slate-100 dark:border-gray-800">`;
                return `<div style="flex: 0 0 100%; scroll-snap-align: start; position:relative;">${tag}</div>`;
            }).join('');
            mediaHtml = `<div style="display:flex; overflow-x:auto; scroll-snap-type: x mandatory; gap: 10px; padding-bottom: 10px; max-width: 100%;">${slides}</div>`;
        } else if (postData.media && postData.media.length === 1) {
            let m = postData.media[0];
            mediaHtml = m.type === 'video' ? `<div class="mt-3">` + window.renderCustomVideo(window.sanitizeUrl(m.url), '', post.id, post.id) + `</div>` : `<img src="${window.sanitizeUrl(m.url)}" class="w-full max-h-[500px] object-cover rounded-xl mt-3 border border-slate-100 dark:border-gray-800">`;
        } else if (postData.imageUrl) {
            mediaHtml = `<img src="${window.sanitizeUrl(postData.imageUrl)}" class="w-full max-h-[500px] object-cover rounded-xl mt-3 border border-slate-100 dark:border-gray-800">`;
        }

        const postContent = DOMPurify.sanitize(postData.content || '').replace(/#([a-zA-Z0-9ğüşıöçĞÜŞİÖÇ_]+)/g, `<a href="search.html?tag=$1" class="text-cyan-600 dark:text-cyan-400 hover:underline" onclick="event.stopPropagation()">#$1</a>`);

        const article = document.createElement('article');
        article.className = 'rounded-2xl p-5 space-y-3 shadow-sm dark:shadow-none border border-slate-200 dark:border-gray-800 bg-white dark:bg-[#151e32] transition duration-300 cursor-pointer';
        article.setAttribute('onclick', `window.openPostDetail('${post.id}')`);
        
        article.innerHTML = `
            ${repostHtml}
            <div class="flex justify-between items-start">
                <div class="flex items-center space-x-3 cursor-pointer" onclick="event.stopPropagation(); window.location.href='profile.html?user=${window.escapeHtml(originalAuthor)}'">
                    <div class="w-11 h-11 rounded-full object-cover border border-slate-200 dark:border-gray-700 bg-slate-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
                        ${avatarHtml}
                    </div>
                    <div>
                        <h4 class="font-bold text-slate-900 dark:text-white text-[15px] flex items-center">${fullName} ${vHtml}</h4>
                        <p class="text-[13px] text-slate-500 dark:text-gray-400">@${window.escapeHtml(originalAuthor)} • ${timeAgo} ${locationHtml}</p>
                    </div>
                </div>
                <div class="relative">
                    <i class="fa-solid fa-ellipsis text-slate-400 dark:text-gray-500 cursor-pointer hover:text-slate-700 dark:hover:text-white transition p-2" onclick="window.toggleDropdown('${post.id}', event)"></i>
                    <div id="dropdown-${post.id}" class="hidden absolute right-0 mt-1 w-36 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-slate-200 dark:border-gray-700 py-1 z-10 text-sm overflow-hidden">
                        ${(isOwner || (postData.isRepost && postData.author === myUsername)) ? `
                            <div class="px-4 py-2 hover:bg-slate-50 dark:hover:bg-gray-700 text-red-500 cursor-pointer transition font-medium" onclick="event.stopPropagation(); window.deletePost('${post.id}')"><i class="fa-solid fa-trash mr-2"></i> Sil</div>
                            ${!postData.isRepost ? `<div class="px-4 py-2 hover:bg-slate-50 dark:hover:bg-gray-700 text-slate-700 dark:text-white cursor-pointer transition font-medium" onclick="event.stopPropagation(); window.openEditModal('${post.id}', '${safeContentForEdit}')"><i class="fa-solid fa-pen mr-2"></i> Düzenle</div>` : ''}
                            <div class="px-4 py-2 hover:bg-slate-50 dark:hover:bg-gray-700 text-slate-700 dark:text-white cursor-pointer transition font-medium" onclick="event.stopPropagation(); window.pinPost('${post.id}')"><i class="fa-solid fa-thumbtack mr-2"></i> Sabitle</div>
                        ` : `<div class="px-4 py-2 hover:bg-slate-50 dark:hover:bg-gray-700 text-slate-700 dark:text-white cursor-pointer transition font-medium" onclick="event.stopPropagation(); alert('Bildirildi.')"><i class="fa-solid fa-flag mr-2"></i> Bildir</div>`}
                    </div>
                </div>
            </div>
            
            <p class="text-[15px] text-slate-800 dark:text-gray-200 break-words leading-relaxed">${postContent}</p>
            
            ${mediaHtml}
            
            <div class="flex justify-between items-center text-slate-500 dark:text-gray-400 text-sm mt-4 pt-3 border-t border-slate-100 dark:border-gray-800/50">
                <div class="flex items-center space-x-2 cursor-pointer hover:text-red-500 transition group font-medium" onclick="window.toggleLike('${post.id}', ${isLiked}, '${originalAuthor}', event)">
                    <div class="flex items-center justify-center w-8 h-8 rounded-full ${isLiked ? 'bg-red-50 dark:bg-red-500/20 text-red-500' : 'bg-slate-50 dark:bg-gray-800/50 group-hover:bg-red-50 dark:group-hover:bg-red-500/20'} transition">
                        <i class="${isLiked ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                    </div>
                    <span class="${isLiked ? 'text-red-500' : ''}">${likesArray.length || 0}</span>
                </div>
                <div class="flex space-x-2 sm:space-x-4">
                    <div class="flex items-center space-x-2 cursor-pointer hover:text-blue-500 transition group font-medium" onclick="event.stopPropagation(); window.openPostDetail('${post.id}')">
                        <div class="flex items-center justify-center w-8 h-8 rounded-full bg-slate-50 dark:bg-gray-800/50 group-hover:bg-blue-50 dark:group-hover:bg-blue-500/20 transition">
                            <i class="fa-regular fa-comment"></i>
                        </div>
                        <span class="hidden sm:inline">${(postData.comments || []).length || 0}</span>
                    </div>
                    <div class="flex items-center space-x-2 cursor-pointer hover:text-green-500 transition group font-medium" onclick="window.repostPost('${post.id}', '${originalAuthor}', event)">
                        <div class="flex items-center justify-center w-8 h-8 rounded-full bg-slate-50 dark:bg-gray-800/50 group-hover:bg-green-50 dark:group-hover:bg-green-500/20 transition">
                            <i class="fa-solid fa-retweet"></i>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2 cursor-pointer transition group font-medium ${myBookmarks.includes(post.id) ? 'text-cyan-500' : 'hover:text-cyan-500'}" onclick="window.toggleBookmark('${post.id}', ${myBookmarks.includes(post.id)}, event)">
                        <div class="flex items-center justify-center w-8 h-8 rounded-full ${myBookmarks.includes(post.id) ? 'bg-cyan-50 dark:bg-cyan-500/20' : 'bg-slate-50 dark:bg-gray-800/50 group-hover:bg-cyan-50 dark:group-hover:bg-cyan-500/20'} transition">
                            <i class="${myBookmarks.includes(post.id) ? 'fa-solid' : 'fa-regular'} fa-bookmark"></i>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2 cursor-pointer hover:text-purple-500 transition group font-medium" onclick="window.openShareModal('${post.id}', event)">
                        <div class="flex items-center justify-center w-8 h-8 rounded-full bg-slate-50 dark:bg-gray-800/50 group-hover:bg-purple-50 dark:group-hover:bg-purple-500/20 transition">
                            <i class="fa-regular fa-paper-plane"></i>
                        </div>
                    </div>
                </div>
            </div>
        `;
        feedContainer.appendChild(article);
    });
    
    if(displayedPosts === 0) { 
        if(currentFeedTab === 'bookmarks') { 
            feedContainer.innerHTML = '<div class="py-20 text-center"><div class="text-5xl mb-4 text-slate-300 dark:text-gray-700">📑</div><h3 class="text-xl font-bold text-slate-800 dark:text-white mb-2">Henüz kaydedilmiş içerik yok</h3><p class="text-slate-500 dark:text-gray-400">İçeriklerdeki yer işareti ikonuna tıklayarak koleksiyonunuzu oluşturun.</p></div>'; 
        } else { 
            feedContainer.innerHTML = '<div class="py-20 text-center text-slate-500 dark:text-gray-400">Buralar çok sessiz...</div>'; 
        }
    }
    window.initVideoPlayers?.();
    window.observeVideos?.();
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const pdm = document.getElementById('post-detail-modal');
        if (pdm && pdm.style.display === 'flex') {
            window.closePostDetail();
        }
    }
});
