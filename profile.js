import { onAuthStateChanged, signOut, deleteUser, updateProfile } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { collection, addDoc, onSnapshot, query, orderBy, limit, startAfter, doc, updateDoc, arrayUnion, arrayRemove, deleteDoc, getDoc, getDocs, serverTimestamp, setDoc, where } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";
import { auth, db, storage } from './firebase-config.js';

let currentUser = null; let myUsername = null; let allUsersData = {}; 
let currentFeedTab = 'discover'; let myFollowingList = []; let myBookmarks = []; let globalPosts = []; 
let currentlyEditingPostId = null; let postToShare = null; let activeReplyParentId = null; 
const MAX_CHARS = 280;

let currentProfileTab = 'posts';
let currentProfileFollowers = [];
let currentProfileFollowing = [];
let isTargetPrivate = false;
let isTargetVerified = false;
let isFollowing = false;
let isRequested = false;
let activeChats = [];

let lastVisiblePostSnap = null;
const POSTS_PER_PAGE = 10;
let isLoadingMore = false;
let hasMorePosts = true;
let isPostsLoaded = false;

const urlParams = new URLSearchParams(window.location.search);
let targetUsername = urlParams.get('user');

// KAYDIRMA İLE YENİ GÖNDERİ ÇEKME
window.addEventListener('scroll', () => { 
    if (isLoadingMore || !hasMorePosts) return; 
    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 200) { 
        isLoadingMore = true; 
        loadUserPosts(true); 
        setTimeout(() => { isLoadingMore = false; }, 1000); 
    } 
});

document.addEventListener('click', function(event) {
    if (!event.target.closest('.post-options-btn')) { document.querySelectorAll('.dropdown-menu').forEach(menu => menu.style.display = 'none'); }
    if (event.target.classList.contains('modal-overlay') && event.target.id !== 'story-viewer-overlay') {
        event.target.style.display = 'none';
        if(event.target.id === 'post-detail-modal') { window.currentOpenPostId = null; activeReplyParentId = null; document.getElementById('post-detail-container').innerHTML = ''; }
        if(event.target.id === 'story-details-modal' || event.target.id === 'story-share-modal') { if(window.resumeStory) window.resumeStory(); }
    }
});

window.goToMyProfile = function() { if(myUsername) window.location.href = 'profile.html?user=' + myUsername; };
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

window.logoutUser = function() { signOut(auth).then(() => { window.location.href = "index.html"; }); };

window.openSupportModal = function() {
    const settingsModal = document.getElementById('settings-modal');
    if(settingsModal) settingsModal.style.display = 'none';
    document.getElementById('support-message-input').value = '';
    document.getElementById('support-modal').style.display = 'flex';
};

window.sendSupportMessage = async function() {
    const btn = document.getElementById('send-support-btn');
    const message = document.getElementById('support-message-input').value.trim();
    
    if (!message) { window.showToast?.("Lütfen bir mesaj yazın.", "error") || alert("Lütfen bir mesaj yazın."); return; }
    btn.disabled = true; btn.innerText = "Gönderiliyor...";

    try {
        await addDoc(collection(db, "tickets"), {
            sender: myUsername || "Bilinmeyen Kullanıcı",
            message: message,
            createdAt: serverTimestamp(),
            status: "Yeni"
        });
        window.showToast?.("Mesajınız başarıyla iletildi. Teşekkür ederiz!", "success") || alert("Gönderildi.");
        document.getElementById('support-modal').style.display = 'none';
    } catch (error) {
        console.error("Hata:", error);
        alert("Mesaj gönderilirken bir hata oluştu.");
    } finally {
        btn.disabled = false; btn.innerText = "Gönder";
    }
};

window.showMyFollowing = function() { window.closeMobileSidebar(); if (allUsersData[myUsername]) { window.showUserList("Ağım", allUsersData[myUsername].following || []); } };
window.showMyFollowers = function() { window.closeMobileSidebar(); if (allUsersData[myUsername]) { window.showUserList("Takipçiler", allUsersData[myUsername].followers || []); } };

window.showUserList = function(title, userArray) {
    const titleEl = document.getElementById('users-list-title'); if(titleEl) titleEl.innerText = title;
    const container = document.getElementById('users-list-container'); if(!container) return;
    container.innerHTML = '';
    if(userArray.length === 0) { container.innerHTML = '<p style="text-align:center; color:#64748b; padding:20px;">Liste boş.</p>'; } 
    else {
        userArray.forEach(uname => {
            let uData = allUsersData[uname] || {}; let avatarHtml = uData.avatarUrl ? `<img src="${uData.avatarUrl}">` : `👤`; let vHtml = uData.isVerified ? '<span class="verified-badge">☑️</span>' : '';
            container.innerHTML += `<div onclick="window.location.href='profile.html?user=${uname}'" class="user-row"><div class="row-avatar">${avatarHtml}</div><div><div style="font-weight:700; color:#0f172a;">${uData.fullName || uname} ${vHtml}</div><div style="font-size:13px; color:#64748b;">@${uname}</div></div></div>`;
        });
    }
    document.getElementById('users-list-modal').style.display = 'flex';
};
document.getElementById('close-list-btn')?.addEventListener('click', () => { document.getElementById('users-list-modal').style.display = 'none'; });

window.switchProfileTab = function(tabName) {
    currentProfileTab = tabName;
    document.querySelectorAll('.feed-tabs .feed-tab').forEach(t => t.classList.remove('active'));
    const activeTab = document.getElementById(tabName === 'posts' ? 'tab-profile-posts' : 'tab-profile-replies');
    if(activeTab) activeTab.classList.add('active');
    
    if (isPostsLoaded) { window.renderProfileFeed(); } else { loadUserPosts(); }
};

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = auth.currentUser || user; 
        myUsername = user.displayName || localStorage.getItem('mozaik_username') || user.email.split('@')[0];
        window.myUsername = myUsername;

        if (!targetUsername) { targetUsername = myUsername; }
        
        const checkMyBan = await getDoc(doc(db, "users", myUsername));
        if (checkMyBan.exists() && checkMyBan.data().isBanned === true) { signOut(auth).then(() => { window.location.href = "index.html"; }); return; }

        window.fetchMissingUsers = async function(usernamesArray) {
            const missing = usernamesArray.filter(u => u && !allUsersData[u]);
            if (missing.length === 0) return;
            await Promise.all(missing.map(async (uname) => {
                try {
                    const uSnap = await getDoc(doc(db, "users", uname));
                    if (uSnap.exists()) allUsersData[uname] = uSnap.data();
                } catch(e) {}
            }));
        };

        onSnapshot(doc(db, "users", myUsername), async (docSnap) => { 
            if(docSnap.exists()) {
                const u = docSnap.data();
                allUsersData[myUsername] = u;
                myFollowingList = u.following || []; 
                myBookmarks = u.bookmarks || []; 
                
                await window.fetchMissingUsers(myFollowingList);

                const mobName = document.getElementById('sidebar-name-mobile'); if(mobName) mobName.innerText = u.fullName || myUsername;
                const mobHandle = document.getElementById('sidebar-handle-mobile'); if(mobHandle) mobHandle.innerText = '@' + myUsername;
                const folCount = document.getElementById('sidebar-following-count'); if(folCount) folCount.innerText = myFollowingList.length;
                const folersCount = document.getElementById('sidebar-followers-count'); if(folersCount) folersCount.innerText = (u.followers || []).length;
                
                if(u.avatarUrl) {
                    const imgTag = `<img src="${u.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">`;
                    const a1 = document.getElementById('mobile-avatar-header'); if(a1) a1.innerHTML = imgTag;
                    const a2 = document.getElementById('sidebar-avatar-mobile'); if(a2) a2.innerHTML = imgTag;
                }
                loadUserProfileData();
            }
        });

        onSnapshot(query(collection(db, "chats"), where("participants", "array-contains", myUsername)), (snapshot) => { 
            activeChats = activeChats.filter(c => c.type === 'group'); 
            snapshot.forEach(docSnap => { activeChats.push({ id: docSnap.id, ...docSnap.data(), type:'private' }); }); 
            if(window.attachCallListeners) window.attachCallListeners(activeChats); 
        });
        onSnapshot(query(collection(db, "groups"), where("members", "array-contains", myUsername)), (snapshot) => { 
            activeChats = activeChats.filter(c => c.type === 'private'); 
            snapshot.forEach(docSnap => { activeChats.push({ id: docSnap.id, ...docSnap.data(), type:'group' }); }); 
            if(window.attachCallListeners) window.attachCallListeners(activeChats); 
        });
        
    } else { window.location.href = "index.html"; }
});

window.toggleLike = async function(postId, isLiked, postAuthor, event) { 
    event.stopPropagation();
    if (window.isActionLocked && window.isActionLocked('like_' + postId)) return; 

    const postObj = globalPosts.find(p => p.id === postId);
    if (postObj) {
        if (!postObj.data.likes) postObj.data.likes = [];
        if (isLiked) {
            postObj.data.likes = postObj.data.likes.filter(u => u !== myUsername);
        } else {
            postObj.data.likes.push(myUsername);
        }
        window.renderProfileFeed(); 
        if (window.currentOpenPostId === postId) window.openPostDetail(postId);
    }

    const postRef = doc(db, "posts", postId); 
    if (isLiked) { 
        await updateDoc(postRef, { likes: arrayRemove(myUsername) }); 
    } else { 
        await updateDoc(postRef, { likes: arrayUnion(myUsername) }); 
        if (postAuthor !== myUsername) { 
            await addDoc(collection(db, "notifications"), { type: 'like', sender: myUsername, recipient: postAuthor, postId: postId, createdAt: serverTimestamp() }); 
        } 
    } 
};

window.toggleBookmark = async function(postId, isBookmarked, event) {
    event.stopPropagation(); const myRef = doc(db, "users", myUsername);
    if (isBookmarked) { await updateDoc(myRef, { bookmarks: arrayRemove(postId) }); } else { await updateDoc(myRef, { bookmarks: arrayUnion(postId) }); }
};

window.deletePost = async function(postId) { 
    if(confirm("Bu gönderiyi kalıcı olarak silmek istediğinize emin misiniz?")) {
        try {
            let postObj = globalPosts.find(p => p.id === postId);
            globalPosts = globalPosts.filter(p => p.id !== postId);
            window.renderProfileFeed();
            const detailModal = document.getElementById('post-detail-modal');
            if (detailModal) detailModal.style.display = 'none';
            window.currentOpenPostId = null;

            if (postObj && postObj.data && postObj.data.imageUrl && !postObj.data.isRepost) {
                try {
                    const imageRef = ref(storage, postObj.data.imageUrl);
                    await deleteObject(imageRef); 
                } catch(imgErr) {}
            }
            await deleteDoc(doc(db, "posts", postId)); 
        } catch(e) {
            console.error("Firebase Silme Hatası:", e);
            alert("SİSTEM HATASI: " + e.message); 
        }
    } 
};

window.repostPost = async function(postId, originalAuthor, event) {
    event.stopPropagation();
    if(confirm(`@${originalAuthor} adlı kullanıcının içeriğini ağınıza eklemek ister misiniz?`)) {
        const originalPost = globalPosts.find(p => p.id === postId); if(!originalPost) return;
        try {
            await addDoc(collection(db, "posts"), { isRepost: true, originalPostId: postId, originalPostAuthor: originalAuthor, content: originalPost.data.content || '', imageUrl: originalPost.data.imageUrl || null, author: myUsername, authorEmail: currentUser.email, createdAt: serverTimestamp(), likes: [], comments: [] });
            alert("Ağınıza eklendi! 🔁");
            loadUserPosts(); 
        } catch (error) { console.error("Hata: ", error); }
    }
};

window.toggleDropdown = function(postId, event) {
    event.stopPropagation();
    document.querySelectorAll('.dropdown-menu').forEach(menu => { if(menu.id !== `dropdown-${postId}`) menu.style.display = 'none'; });
    const menu = document.getElementById(`dropdown-${postId}`);
    if(menu) menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
};

window.openEditModal = function(postId, currentContent) { currentlyEditingPostId = postId; document.getElementById('edit-post-input').value = currentContent; document.getElementById('edit-post-modal').style.display = 'flex'; };

document.getElementById('save-edited-post-btn')?.addEventListener('click', async () => {
    if(!currentlyEditingPostId) return; const newContent = document.getElementById('edit-post-input').value.trim(); if(!newContent) return;
    
    const postObj = globalPosts.find(p => p.id === currentlyEditingPostId);
    if (postObj) {
        postObj.data.content = newContent;
        postObj.data.isEdited = true;
        window.renderProfileFeed();
        if (window.currentOpenPostId === currentlyEditingPostId) window.openPostDetail(currentlyEditingPostId);
    }
    document.getElementById('edit-post-modal').style.display = 'none';
    try { await updateDoc(doc(db, "posts", currentlyEditingPostId), { content: newContent, isEdited: true }); } catch(e) {}
});

window.openShareModal = function(postId, event) {
    event.stopPropagation(); postToShare = postId; const container = document.getElementById('share-users-list'); container.innerHTML = '';
    if(myFollowingList.length === 0) { container.innerHTML = '<div style=\"padding:20px; text-align:center; color:#64748b;\">İletmek için önce ağınıza kişi eklemelisiniz.</div>'; }
    else {
        myFollowingList.forEach(uname => {
            let uData = allUsersData[uname] || {}; let avatarHtml = uData.avatarUrl ? `<img src=\"${uData.avatarUrl}\">` : `👤`; let vHtml = uData.isVerified ? '<span class=\"verified-badge\">☑️</span>' : '';
            container.innerHTML += `<div class=\"user-row\" onclick=\"window.sendPostAsMessage('${uname}')\"><div class=\"row-avatar\">${avatarHtml}</div><div style=\"flex:1;\"><div style=\"font-weight:700;\">${uData.fullName || uname} ${vHtml}</div><div style=\"font-size:13px; color:#64748b;\">@${uname}</div></div><button style=\"background:#f1f5f9; color:#0f172a; border:1px solid #cbd5e1; padding:6px 15px; border-radius:6px; font-weight:600; cursor:pointer;\">Gönder</button></div>`;
        });
    }
    document.getElementById('share-dm-modal').style.display = 'flex';
};

window.sendPostAsMessage = async function(targetUser) {
    if(!postToShare) return; const chatId = [myUsername, targetUser].sort().join('_'); const postLink = `${window.location.origin}/profile.html?post=${postToShare}`;
    const messageData = { text: `🔗 İçerik İletildi: ${postLink}`, sender: myUsername, createdAt: serverTimestamp(), isRead: false, type: 'regular' };
    await addDoc(collection(db, "chats", chatId, "messages"), messageData);
    await setDoc(doc(db, "chats", chatId), { participants: [myUsername, targetUser], lastMessage: '🔗 İçerik İletildi', lastSender: myUsername, updatedAt: serverTimestamp() }, { merge: true });
    alert(`İçerik iletildi.`); document.getElementById('share-dm-modal').style.display = 'none';
};

window.showLikes = function(postId, event) { event.stopPropagation(); const postObj = globalPosts.find(p => p.id === postId); if(!postObj) return; const likesArray = postObj.data.likes || []; if(likesArray.length === 0) return; window.showUserList("Beğenenler", likesArray); };

function generateUniqueId() { return Math.random().toString(36).substr(2, 9); }

window.closePostDetail = function() {
    document.getElementById('post-detail-modal').style.display = 'none'; window.currentOpenPostId = null; activeReplyParentId = null;
    document.getElementById('post-detail-container').innerHTML = ''; window.history.replaceState({}, document.title, window.location.pathname);
};

window.openPostDetail = function(postId) {
    window.currentOpenPostId = postId; activeReplyParentId = null;
    const postObj = globalPosts.find(p => p.id === postId); if(!postObj) return; const postData = postObj.data; 
    
    let originalAuthor = postData.author; if(postData.isRepost) { originalAuthor = postData.originalPostAuthor; }
    const authorData = allUsersData[originalAuthor] || {}; const likesArray = postData.likes || []; const isLiked = likesArray.includes(myUsername);
    const vHtml = authorData.isVerified ? '<span class=\"verified-badge\">☑️</span>' : ''; const avatarImg = authorData.avatarUrl ? `<img src=\"${authorData.avatarUrl}\" style=\"width:100%;height:100%;object-fit:cover;\">` : `👤`;
    const fullName = authorData.fullName || originalAuthor;
    
    let timeString = "";
    if (postData.createdAt) {
        if (typeof postData.createdAt.toMillis === 'function') { timeString = new Date(postData.createdAt.toMillis()).toLocaleString('tr-TR', {day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}); } 
        else if (postData.createdAt.seconds) { timeString = new Date(postData.createdAt.seconds * 1000).toLocaleString('tr-TR', {day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
    }
    
    let locHtml = postData.location ? `<span style="font-size:14px; color:#3b82f6; margin-left:10px;">📍 ${postData.location}</span>` : '';
    let repostLabel = "";
    if(postData.isRepost) { repostLabel = `<div style=\"color:#64748b; font-weight:600; font-size:12px; margin-bottom:10px; padding:0 20px;\">🔁 @${postData.author} ağında paylaştı</div>`; }

    let html = `
        ${repostLabel}
        <div style=\"padding: 10px 25px 25px 25px; border-bottom:1px solid #f1f5f9;\">
            <div style=\"display:flex; align-items:center; gap:12px; margin-bottom:15px; cursor:pointer;\" onclick=\"window.location.href='profile.html?user=${originalAuthor}'\">
                <div style=\"width:48px; height:48px; border-radius:8px; background:#e2e8f0; overflow:hidden; display:flex; justify-content:center; align-items:center; font-size:24px; border: 1px solid #cbd5e1;\">${avatarImg}</div>
                <div style=\"flex:1;\">
                    <div style=\"font-weight:700; font-size:16px; color:#0f172a;\">${fullName} ${vHtml}</div>
                    <div style=\"color:#64748b; font-size:14px;\">@${originalAuthor} ${locHtml}</div>
                </div>
            </div>
            <div style=\"font-size:16px; line-height:1.6; color:#334155; margin-bottom:15px; word-wrap:break-word;\">
                ${postData.content ? postData.content.replace(/#([a-zA-Z0-9ğüşıöçĞÜŞİÖÇ_]+)/g, `<a href=\"search.html?tag=$1\" style=\"color:#3b82f6; font-weight:500; text-decoration:none;\">#$1</a>`) : ''}
            </div>
            ${postData.imageUrl ? `<img src=\"${postData.imageUrl}\" style=\"width:100%; border-radius:8px; margin-bottom:15px; border:1px solid #e2e8f0;\">` : ''}
            <div style=\"color:#94a3b8; font-size:13px; padding-bottom:15px; border-bottom:1px solid #f1f5f9;\">${timeString}</div>
            
            <div style=\"display:flex; justify-content:flex-start; gap:30px; padding:15px 0; color:#64748b;\">
                <div class=\"action-item\" onclick=\"document.getElementById('detail-comment-input').focus()\"><span class=\"action-icon\">💬</span> ${(postData.comments || []).length}</div>
                <div class=\"action-item repost-box\" onclick=\"window.repostPost('${postId}', '${originalAuthor}', event)\"><span class=\"action-icon\">🔁</span></div>
                <div class=\"action-item like-box ${isLiked ? 'liked' : ''}\" onclick=\"window.toggleLike('${postId}', ${isLiked}, '${originalAuthor}', event)\"><span class=\"action-icon\">${isLiked ? '❤️' : '🤍'}</span> <span onclick=\"window.showLikes('${postId}', event)\">${likesArray.length}</span></div>
                <div class=\"action-item ${myBookmarks.includes(postId) ? 'liked' : ''}\" onclick=\"window.toggleBookmark('${postId}', ${myBookmarks.includes(postId)}, event)\" title=\"Yer İşaretlerine Ekle/Çıkar\"><span class=\"action-icon\">${myBookmarks.includes(postId) ? '🔖' : '📑'}</span></div>
                <div class=\"action-item\" onclick=\"window.openShareModal('${postId}', event)\"><span class=\"action-icon\">📤</span></div>
            </div>
        </div>

        <div class=\"comments-wrapper\" style=\"padding: 0 25px;\">
            ${buildCommentsTree(postData.comments || [], null, 0, postId, originalAuthor)}
        </div>
        
        <div style=\"position:sticky; bottom:0; background:white; padding:20px 25px; border-top:1px solid #f1f5f9; display:flex; flex-direction:column; gap:10px;\">
            <div id=\"replying-to-info\" style=\"display:none; font-size:13px; color:#64748b;\">
                Yanıtlanıyor: <b id=\"replying-to-name\"></b> <span style=\"cursor:pointer; color:#ef4444; margin-left:10px;\" onclick=\"window.cancelDetailReply()\">İptal</span>
            </div>
            <div style=\"display:flex; gap:10px;\">
                <input type=\"text\" id=\"detail-comment-input\" style=\"flex:1; background:#f8fafc; border:1px solid #e2e8f0; padding:12px 15px; border-radius:8px; outline:none; font-size:15px; color:#0f172a;\" placeholder=\"Görüşünüzü bildirin...\">
                <button onclick=\"window.sendDetailComment('${postId}', '${originalAuthor}')\" style=\"background:#2c3e50; color:white; border:none; border-radius:8px; padding:0 20px; font-weight:600; cursor:pointer;\">Gönder</button>
            </div>
        </div>
    `;
    const contentBox = document.getElementById('post-detail-content-box');
    if(contentBox) contentBox.scrollTop = 0; 
    document.getElementById('post-detail-container').innerHTML = html;
    document.getElementById('post-detail-modal').style.display = 'flex';
};

function buildCommentsTree(allComments, parentId, depth = 0, postId = null, postAuthor = null) {
    if (depth > 15) return ''; 
    let html = ''; const safeParentId = parentId || null;
    const children = allComments.filter(c => (c.parentId || null) === safeParentId).sort((a,b) => a.timestamp - b.timestamp);
    
    children.forEach(c => {
        const cUserData = allUsersData[c.author] || {}; const avatarHtml = cUserData.avatarUrl ? `<img src=\"${cUserData.avatarUrl}\">` : `👤`;
        const vHtml = cUserData.isVerified ? `<span class=\"verified-badge\" style=\"font-size:12px;\">☑️</span>` : '';
        const safeCommentId = c.id || ('legacy_' + Math.random().toString(36).substr(2, 9));

        let deleteBtnHtml = '';
        if (myUsername === c.author || myUsername === postAuthor) { deleteBtnHtml = `<div class=\"comment-action-btn\" style=\"color:#ef4444;\" onclick=\"window.deleteComment('${postId}', '${safeCommentId}')\">Sil</div>`; }

        html += `
            <div class=\"comment-node\">
                <div class=\"comment-header\">
                    <div class=\"comment-avatar\" onclick=\"window.location.href='profile.html?user=${c.author}'\" style=\"cursor:pointer;\">${avatarHtml}</div>
                    <div class=\"comment-body\">
                        <div><a href=\"profile.html?user=${c.author}\" class=\"comment-author-name\">${cUserData.fullName || c.author}</a> ${vHtml} <span style=\"color:#64748b; font-size:13px; font-weight:normal;\">@${c.author}</span></div>
                        <div class=\"comment-text\">${c.text}</div>
                        <div class=\"comment-actions\">
                            <div class=\"comment-action-btn\" onclick=\"window.setDetailReply('${safeCommentId}', '${c.author}')\">Yanıtla</div>
                            ${deleteBtnHtml}
                        </div>
                    </div>
                </div>
                <div class=\"comment-replies\">
                    ${buildCommentsTree(allComments, safeCommentId, depth + 1, postId, postAuthor)}
                </div>
            </div>
        `;
    });
    return html;
}

window.setDetailReply = function(commentId, authorName) { activeReplyParentId = commentId; document.getElementById('replying-to-info').style.display = 'block'; document.getElementById('replying-to-name').innerText = '@' + authorName; document.getElementById('detail-comment-input').focus(); };
window.cancelDetailReply = function() { activeReplyParentId = null; document.getElementById('replying-to-info').style.display = 'none'; };

window.sendDetailComment = async function(postId, postAuthor) {
    const input = document.getElementById('detail-comment-input'); const text = input.value.trim(); if (!text) return;
    const newComment = { id: generateUniqueId(), text: text, author: myUsername, timestamp: Date.now(), parentId: activeReplyParentId };
    
    const postObj = globalPosts.find(p => p.id === postId);
    if (postObj) {
        if (!postObj.data.comments) postObj.data.comments = [];
        postObj.data.comments.push(newComment);
        window.renderProfileFeed();
        window.openPostDetail(postId);
    }

    await updateDoc(doc(db, "posts", postId), { comments: arrayUnion(newComment) });
    if (postAuthor !== myUsername && !activeReplyParentId) { await addDoc(collection(db, "notifications"), { type: 'comment', sender: myUsername, recipient: postAuthor, postId: postId, createdAt: serverTimestamp() }); }
    input.value = ''; window.cancelDetailReply();
};

window.deleteComment = async function(postId, commentId) {
    if(confirm("Bu yorumu silmek istediğinize emin misiniz?")) {
        const postObj = globalPosts.find(p => p.id === postId);
        if (postObj && postObj.data.comments) {
            postObj.data.comments = postObj.data.comments.filter(c => c.id !== commentId && c.parentId !== commentId);
            window.renderProfileFeed();
            window.openPostDetail(postId);
        }

        try {
            const postRef = doc(db, "posts", postId); const postSnap = await getDoc(postRef);
            if(postSnap.exists()) {
                const postData = postSnap.data();
                const updatedComments = postData.comments.filter(c => c.id !== commentId && c.parentId !== commentId);
                await updateDoc(postRef, { comments: updatedComments }); 
            }
        } catch(e) { console.error("Yorum silinemedi:", e); alert("Yorum silinirken bir hata oluştu."); }
    }
};

function loadUserProfileData() {
    onSnapshot(doc(db, "users", targetUsername), async (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const isMe = (targetUsername === myUsername);
            const isInfoHidden = data.hideInfo || false;

            const hName = document.getElementById('header-name'); if(hName) hName.innerText = data.fullName || targetUsername;
            const dFullName = document.getElementById('display-fullname'); if(dFullName) dFullName.innerHTML = `${data.fullName || targetUsername} ${data.isVerified ? '<span class="verified-badge">☑️</span>' : ''}`;
            const dUsername = document.getElementById('display-username'); if(dUsername) dUsername.innerText = `@${targetUsername}`;
            
            let detailsHtml = '';
            if (!isInfoHidden || isMe) {
                if(data.location) detailsHtml += `<span>📍 ${data.location}</span>`;
                if(data.birthDate) detailsHtml += `<span>🎈 Doğum tarihi: ${new Date(data.birthDate).toLocaleDateString('tr-TR', {day:'numeric',month:'long',year:'numeric'})}</span>`;
                if(data.createdAt) detailsHtml += `<span>🗓️ ${data.createdAt.toDate().toLocaleDateString('tr-TR', {month:'long',year:'numeric'})} tarihinde katıldı</span>`;
            }
            const dDetails = document.getElementById('display-details'); if(dDetails) dDetails.innerHTML = detailsHtml;
            if (data.bio) {
                const dBio = document.getElementById('display-bio'); if(dBio) dBio.innerText = data.bio;
            }
            
            if (data.avatarUrl) { document.getElementById('profile-avatar').innerHTML = `<img src="${data.avatarUrl}">`; }
            else { document.getElementById('profile-avatar').innerHTML = `👤`; }

            const bannerDiv = document.getElementById('profile-banner');
            if (data.bannerUrl) { bannerDiv.innerHTML = `<img src="${data.bannerUrl}">`; }
            else { bannerDiv.innerHTML = ``; }
            
            currentProfileFollowers = data.followers || []; currentProfileFollowing = data.following || [];
            const folCount = document.getElementById('followers-count'); if(folCount) folCount.innerText = currentProfileFollowers.length; 
            const fIngCount = document.getElementById('following-count'); if(fIngCount) fIngCount.innerText = currentProfileFollowing.length;
            
            isTargetPrivate = data.isPrivate || false; isTargetVerified = data.isVerified || false; 
            
            const pBadge = document.getElementById('private-badge-container');
            if(isTargetPrivate) { if(pBadge) pBadge.innerHTML = `<div class="private-badge">🔒 Bu hesap gizli</div>`; }
            else { if(pBadge) pBadge.innerHTML = ''; }
            
            const amIFollowing = currentProfileFollowers.includes(myUsername);

            const actionContainer = document.getElementById('action-buttons-container');
            if (isMe) {
                if(actionContainer) actionContainer.innerHTML = `<button class="edit-profile-btn" onclick="window.openProfileEdit()">Profili düzenle</button>`;
            } else {
                const mySnap = await getDoc(doc(db, "users", myUsername)); 
                if(mySnap.exists() && mySnap.data().following) isFollowing = mySnap.data().following.includes(targetUsername); 
                isRequested = (data.followRequests || []).includes(myUsername);
                
                if(actionContainer) actionContainer.innerHTML = `
                    <button class="icon-action-btn" onclick="window.location.href='chat.html?user=${targetUsername}'" title="Mesaj Gönder">✉️</button>
                    <button id="main-follow-btn" class="follow-btn" onclick="window.toggleFollow()">Takip Et</button>
                `;
                updateFollowButtonUI();
            }

            const fBox = document.getElementById('followers-box');
            if(fBox) fBox.onclick = () => { if(isTargetPrivate && !isMe && !amIFollowing) return; window.showUserList("Takipçiler", currentProfileFollowers); };
            const fIngBox = document.getElementById('following-box');
            if(fIngBox) fIngBox.onclick = () => { if(isTargetPrivate && !isMe && !amIFollowing) return; window.showUserList("Ağım", currentProfileFollowing); };

            const feedContainer = document.getElementById('profile-feed-container');
            if (isTargetPrivate && !isMe && !amIFollowing) {
                if(feedContainer) feedContainer.innerHTML = `<div style="padding:50px 20px; text-align:center;"><div style="font-size:28px; font-weight:800; margin-bottom:10px; color:#0f172a;">Bu hesap gizli</div><div style="color:#64748b; font-size:15px;">İçeriklerini görmek için takip edin.</div></div>`;
                isPostsLoaded = false; 
            } else { 
                if (!isPostsLoaded) {
                    loadUserPosts(); 
                } else {
                    window.renderProfileFeed(); 
                }
            }
        } else {
            const fCont = document.getElementById('profile-feed-container');
            if(fCont) fCont.innerHTML = `<div style="padding:40px; text-align:center; color:#64748b;">Bu hesap mevcut değil.</div>`;
        }
    });
}

window.openProfileEdit = async function() {
    document.getElementById('edit-modal').style.display = 'flex'; 
    const mySnap = await getDoc(doc(db, "users", myUsername));
    if(mySnap.exists()) {
        const d = mySnap.data();
        document.getElementById('edit-fullname-input').value = d.fullName || '';
        document.getElementById('edit-birthdate-input').value = d.birthDate || '';
        document.getElementById('edit-gender-input').value = d.gender || '';
        document.getElementById('edit-location-input').value = d.location || '';
        document.getElementById('edit-bio-input').value = d.bio !== "Merhaba, ben Mozaik'te yeniyim!" ? d.bio : '';
        document.getElementById('edit-private-input').checked = d.isPrivate || false;
        document.getElementById('edit-hideinfo-input').checked = d.hideInfo || false;
    }
};
document.getElementById('cancel-edit-btn')?.addEventListener('click', () => { document.getElementById('edit-modal').style.display = 'none'; });

document.getElementById('save-edit-btn')?.addEventListener('click', async () => {
    const saveBtn = document.getElementById('save-edit-btn'); 
    const newFullName = document.getElementById('edit-fullname-input').value.trim();
    const newBirthDate = document.getElementById('edit-birthdate-input').value;
    const newGender = document.getElementById('edit-gender-input').value;
    const newLocation = document.getElementById('edit-location-input').value.trim();
    const newBio = document.getElementById('edit-bio-input').value; 
    const isPrivateChecked = document.getElementById('edit-private-input').checked; 
    const isHideInfoChecked = document.getElementById('edit-hideinfo-input').checked; 
    
    let rawAvatarFile = document.getElementById('edit-avatar-input').files[0]; 
    let rawBannerFile = document.getElementById('edit-banner-input').files[0]; 

    if(!newFullName) { alert("İsim zorunludur!"); return; }

    if (rawAvatarFile && rawAvatarFile.size > 10 * 1024 * 1024) { alert("Profil fotoğrafı 10 MB'dan büyük olamaz!"); return; }
    if (rawBannerFile && rawBannerFile.size > 10 * 1024 * 1024) { alert("Kapak fotoğrafı 10 MB'dan büyük olamaz!"); return; }

    saveBtn.innerText = "Sıkıştırılıyor..."; saveBtn.disabled = true;
    
    let newAvatarUrl = document.getElementById('profile-avatar').querySelector('img') ? document.getElementById('profile-avatar').querySelector('img').src : null; 
    let newBannerUrl = document.getElementById('profile-banner').querySelector('img') ? document.getElementById('profile-banner').querySelector('img').src : null;
    
    try {
        if (rawAvatarFile) { 
            const avatarFile = await window.compressImage(rawAvatarFile, 400, 400, 0.7); 
            saveBtn.innerText = "Fotoğraf yükleniyor...";
            const avatarRef = ref(storage, `avatars/${Date.now()}_${avatarFile.name}`);
            await uploadBytes(avatarRef, avatarFile);
            newAvatarUrl = await getDownloadURL(avatarRef);
        }
        if (rawBannerFile) { 
            const bannerFile = await window.compressImage(rawBannerFile, 1200, 600, 0.7); 
            saveBtn.innerText = "Kapak yükleniyor...";
            const bannerRef = ref(storage, `banners/${Date.now()}_${bannerFile.name}`);
            await uploadBytes(bannerRef, bannerFile);
            newBannerUrl = await getDownloadURL(bannerRef);
        }

        saveBtn.innerText = "Kaydediliyor...";

        await setDoc(doc(db, "users", myUsername), { 
            fullName: newFullName, birthDate: newBirthDate, gender: newGender, location: newLocation, bio: newBio, 
            isPrivate: isPrivateChecked, hideInfo: isHideInfoChecked, 
            avatarUrl: newAvatarUrl, bannerUrl: newBannerUrl 
        }, { merge: true });
        
        document.getElementById('edit-modal').style.display = 'none';
    } catch (e) { alert("Yükleme sırasında hata oluştu!"); console.error(e); } 
    finally { saveBtn.innerText = "Güncelle"; saveBtn.disabled = false; }
});

document.getElementById('trigger-delete-account-btn')?.addEventListener('click', async () => {
    if(!confirm("DİKKAT! Hesabınız, tüm gönderileriniz, profil ve kapak fotoğraflarınız KALICI olarak silinecek. Bu işlem geri alınamaz! Onaylıyor musunuz?")) return;
    
    const btn = document.getElementById('trigger-delete-account-btn'); 
    btn.disabled = true; btn.innerText = "Hesap ve Fotoğraflar Siliniyor...";

    try {
        const postsQuery = query(collection(db, "posts"), where("author", "==", myUsername));
        const postsSnap = await getDocs(postsQuery);
        
        for (const postDoc of postsSnap.docs) {
            const postData = postDoc.data();
            if (postData.imageUrl && !postData.isRepost) {
                try { await deleteObject(ref(storage, postData.imageUrl)); } catch(e) {}
            }
            await deleteDoc(doc(db, "posts", postDoc.id));
        }

        const userDocSnap = await getDoc(doc(db, "users", myUsername));
        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            if (userData.avatarUrl) { try { await deleteObject(ref(storage, userData.avatarUrl)); } catch(e) {} }
            if (userData.bannerUrl) { try { await deleteObject(ref(storage, userData.bannerUrl)); } catch(e) {} }
        }

        await deleteDoc(doc(db, "users", myUsername));

        const user = auth.currentUser;
        if(user) await deleteUser(user);

        if(window.showToast) window.showToast("Tüm verileriniz başarıyla silindi. Hoşça kalın!", "success");
        setTimeout(() => { window.location.href = "index.html"; }, 1500);

    } catch (error) {
        console.error("Hesap silinirken hata:", error);
        if(error.code === 'auth/requires-recent-login') {
            if(window.showToast) window.showToast("Güvenlik nedeniyle çıkış yapıp tekrar giriş yapmalısınız.", "error");
        } else {
            if(window.showToast) window.showToast("Silme hatası: " + error.message, "error");
        }
        btn.disabled = false; btn.innerText = "Hesabımı Kalıcı Olarak Sil";
    }
});

window.actionLocks = {};
window.isActionLocked = function(actionId) {
    if (window.actionLocks[actionId]) return true;
    window.actionLocks[actionId] = true;
    setTimeout(() => { window.actionLocks[actionId] = false; }, 1500); 
    return false;
};

window.toggleFollow = async function() {
    if (window.isActionLocked('follow_' + targetUsername)) return; 

    const btn = document.getElementById('main-follow-btn'); btn.disabled = true;
    const myRef = doc(db, "users", myUsername); const targetRef = doc(db, "users", targetUsername);
    try {
        if(isFollowing) { 
            await updateDoc(myRef, { following: arrayRemove(targetUsername) }); 
            await updateDoc(targetRef, { followers: arrayRemove(myUsername) }); 
            isFollowing = false; 
        } 
        else if (isRequested) { 
            await updateDoc(targetRef, { followRequests: arrayRemove(myUsername) }); 
            isRequested = false; 
        } 
        else {
            if(isTargetPrivate) { 
                await updateDoc(targetRef, { followRequests: arrayUnion(myUsername) }); 
                isRequested = true; 
            } 
            else { 
                await updateDoc(myRef, { following: arrayUnion(targetUsername) }); 
                await updateDoc(targetRef, { followers: arrayUnion(myUsername) }); 
                isFollowing = true; 
                await addDoc(collection(db, "notifications"), { type: 'follow', sender: myUsername, recipient: targetUsername, createdAt: serverTimestamp() }); 
            }
        }
        updateFollowButtonUI();
    } catch (error) {
        console.error("Takip hatası:", error);
        alert("Takip işlemi başarısız oldu. Lütfen sayfayı yenileyip tekrar deneyin. (Hata: " + error.code + ")");
    }
    btn.disabled = false;
};

function updateFollowButtonUI() {
    const btn = document.getElementById('main-follow-btn'); 
    if(!btn) return;
    btn.className = 'follow-btn'; 
    if(isFollowing) { btn.innerText = "Ağınızda"; btn.classList.add('unfollow-btn'); } 
    else if (isRequested) { btn.innerText = "İstek Gönderildi"; btn.classList.add('unfollow-btn'); } 
    else { btn.innerText = "Takip Et"; }
}

async function loadUserPosts(isLoadMore = false) {
    const feedContainer = document.getElementById('profile-feed-container'); 
    if (!isLoadMore) { 
        if(feedContainer) feedContainer.innerHTML = '<div style="padding:40px; text-align:center; color:#64748b;">Yükleniyor...</div>';
        globalPosts = []; 
        lastVisiblePostSnap = null; 
        hasMorePosts = true; 
    }
    
    if (!hasMorePosts) return;

    let q;
    if (lastVisiblePostSnap) {
        q = query(collection(db, "posts"), where("author", "==", targetUsername), orderBy("createdAt", "desc"), startAfter(lastVisiblePostSnap), limit(POSTS_PER_PAGE));
    } else {
        q = query(collection(db, "posts"), where("author", "==", targetUsername), orderBy("createdAt", "desc"), limit(POSTS_PER_PAGE));
    }
    
    try {
        const snapshot = await getDocs(q);
        let neededUsers = new Set(); 
        if(targetUsername) neededUsers.add(targetUsername); 

        if (snapshot.empty) {
            hasMorePosts = false;
            if (!isLoadMore) isPostsLoaded = true;
        } else {
            lastVisiblePostSnap = snapshot.docs[snapshot.docs.length - 1];

            snapshot.forEach((postDoc) => {
                let postData = postDoc.data();
                if(postData.content) postData.content = DOMPurify.sanitize(postData.content);
                if(postData.comments) postData.comments.forEach(c => { 
                    if(c.text) c.text = DOMPurify.sanitize(c.text); 
                    if(c.author) neededUsers.add(c.author); 
                });
                
                neededUsers.add(postData.author); 
                if(postData.isRepost && postData.originalPostAuthor) neededUsers.add(postData.originalPostAuthor);

                globalPosts.push({ id: postDoc.id, data: postData }); 
            });

            await window.fetchMissingUsers(Array.from(neededUsers));
        }

        if (snapshot.docs.length < POSTS_PER_PAGE) { hasMorePosts = false; }
        isPostsLoaded = true;
        window.renderProfileFeed();

    } catch (error) {
        console.error("Gönderiler yüklenirken hata:", error);
        if(feedContainer && !isLoadMore) feedContainer.innerHTML = '<div style="padding:40px; text-align:center; color:#ef4444;">Gönderiler yüklenemedi. (Konsolda belirtilen Firebase Index ayarını yapmanız gerekebilir).</div>';
    }
}

window.renderProfileFeed = function() {
    const feedContainer = document.getElementById('profile-feed-container'); 
    if(!feedContainer) return;
    feedContainer.innerHTML = ''; 
    
    let userPostCount = 0;
    let pinnedPostId = null;
    if(allUsersData[targetUsername] && allUsersData[targetUsername].pinnedPostId) {
        pinnedPostId = allUsersData[targetUsername].pinnedPostId;
    }
    
    globalPosts.forEach((postObj) => {
        let postData = postObj.data;
        const postId = postObj.id; 
        
        if (postData.author === targetUsername && !postData.isRepost) userPostCount++;

        let shouldShow = false;
        if (currentProfileTab === 'posts') {
            if (postData.author === targetUsername) shouldShow = true;
        } else if (currentProfileTab === 'replies') {
            const hasCommented = (postData.comments || []).some(c => c.author === targetUsername);
            if (hasCommented || postData.author === targetUsername) shouldShow = true;
        }

        if (shouldShow) {
            const renderSinglePost = (isPinned) => {
                const likesArray = postData.likes || [];
                const isLiked = likesArray.includes(myUsername);
                const isOwner = postData.author === myUsername;
                const editedHtml = postData.isEdited ? '<span style="font-size:12px; color:#94a3b8; font-style:italic; margin-left:5px;">(düzenlendi)</span>' : '';
                
                const authorData = allUsersData[postData.author] || {};
                const vHtml = authorData.isVerified ? '<span class="verified-badge">☑️</span>' : '';
                const avatarImg = authorData.avatarUrl ? `<img src="${authorData.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">` : `👤`;
                const fullName = authorData.fullName || postData.author;
                
                let timeAgo = "";
                if(postData.createdAt) {
                    let millis = 0;
                    if (typeof postData.createdAt.toMillis === 'function') millis = postData.createdAt.toMillis();
                    else if (postData.createdAt.seconds) millis = postData.createdAt.seconds * 1000;
                    
                    if(millis > 0) {
                        const secs = Math.floor((Date.now() - millis) / 1000);
                        if(secs < 60) timeAgo = `${secs}s`; else if (secs < 3600) timeAgo = `${Math.floor(secs/60)}d`; else if (secs < 86400) timeAgo = `${Math.floor(secs/3600)}sa`; else timeAgo = `${Math.floor(secs/86400)}g`;
                    }
                }
                
                let locationHtml = postData.location ? `<span style="font-size:13px; color:#3b82f6; margin-left:8px;">📍 ${postData.location}</span>` : '';
                const safeContentForEdit = postData.content ? postData.content.replace(/'/g, "\\'").replace(/"/g, '&quot;') : '';

                let pinHtml = '';
                if(isPinned) {
                    pinHtml = `<div class="repost-indicator" style="color:#64748b; margin-left:35px; margin-bottom:5px;">📌 Sabitlenmiş İçerik</div>`;
                }

                const postDiv = document.createElement('div'); postDiv.className = 'post';
                postDiv.onclick = () => window.openPostDetail(postId); 

                postDiv.innerHTML = `
                    <div style="width:100%; display:flex; flex-direction:column;">
                        ${pinHtml}
                        <div style="display:flex; gap:15px;">
                            <div class="post-left" onclick="event.stopPropagation(); window.location.href='profile.html?user=${postData.author}'">
                                <div class="post-avatar-img" style="overflow:hidden; display:flex; align-items:center; justify-content:center;">${avatarImg}</div>
                            </div>
                            <div class="post-right">
                                <div class="post-header-info">
                                    <div class="author-group" onclick="event.stopPropagation(); window.location.href='profile.html?user=${postData.author}'">
                                        <span class="author-name">${fullName}</span>${vHtml} <span class="author-username">@${postData.author}</span> <span class="post-time">· ${timeAgo}</span> ${locationHtml}
                                        ${editedHtml}
                                    </div>
                                    <div style="position:relative;">
                                        <button class="post-options-btn" onclick="window.toggleDropdown('${postId}', event)">•••</button>
                                        <div id="dropdown-${postId}" class="dropdown-menu">
                                            ${isOwner ? `
                                                <div class="dropdown-item danger" onclick="event.stopPropagation(); window.deletePost('${postId}')">Sil</div>
                                                ${!postData.isRepost ? `<div class="dropdown-item" onclick="event.stopPropagation(); window.openEditModal('${postId}', '${safeContentForEdit}')">Düzenle</div>` : ''}
                                                <div class="dropdown-item" onclick="event.stopPropagation(); window.pinPost('${postId}')">Sabitle</div>
                                            ` : `<div class="dropdown-item" onclick="event.stopPropagation(); alert('Bildirildi.')">Bildir</div>`}
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="post-content">${postData.content ? postData.content.replace(/#([a-zA-Z0-9ğüşıöçĞÜŞİÖÇ_]+)/g, `<span style="color:#3b82f6;">#$1</span>`) : ''}</div>
                                
                                ${postData.imageUrl ? `
                                <div class="post-image-container" onclick="event.stopPropagation()">
                                    <img src="${postData.imageUrl}" class="post-image">
                                </div>` : ''}
                                
                                <div class="post-footer-actions">
                                    <div class="action-item" onclick="event.stopPropagation(); window.openPostDetail('${postId}')" title="Yanıtla"><span class="action-icon">💬</span> ${(postData.comments || []).length || ''}</div>
                                    <div class="action-item repost-box" onclick="window.repostPost('${postId}', '${postData.author}', event)" title="Ağına Ekle"><span class="action-icon">🔁</span> </div>
                                    <div class="action-item like-box ${isLiked ? 'liked' : ''}" onclick="window.toggleLike('${postId}', ${isLiked}, '${postData.author}', event)" title="Beğen"><span class="action-icon">${isLiked ? '❤️' : '🤍'}</span> <span onclick="window.showLikes('${postId}', event)">${likesArray.length || ''}</span></div>
                                    <div class="action-item" onclick="window.openShareModal('${postId}', event)" title="İlet"><span class="action-icon">📤</span></div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                return postDiv;
            };

            if(feedContainer) {
                if(postId === pinnedPostId) { feedContainer.prepend(renderSinglePost(true)); } 
                else { feedContainer.appendChild(renderSinglePost(false)); }
            }
        }
    });
    
    const hCount = document.getElementById('header-post-count');
    if(hCount) hCount.innerText = `${userPostCount} içerik`;
    
    if(userPostCount === 0 && feedContainer) {
        feedContainer.innerHTML = `<div style="padding:40px; text-align:center;"><div style="font-size:28px; font-weight:800; margin-bottom:10px; color:#0f172a;">Henüz bir içerik yok</div><div style="color:#64748b; font-size:15px;">Burada paylaşılanlar listelenecek.</div></div>`;
    }
};