import { onAuthStateChanged, signOut, deleteUser, updateProfile } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { collection, addDoc, onSnapshot, query, orderBy, limit, startAfter, doc, updateDoc, arrayUnion, arrayRemove, deleteDoc, getDoc, getDocs, serverTimestamp, setDoc, where } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";
import { auth, db, storage } from './firebase-config.js';
import './shared.js';

let currentUser = null; let myUsername = null; let allUsersData = {}; 
let currentFeedTab = 'discover'; let myFollowingList = []; let myBookmarks = []; let globalPosts = []; 
let currentlyEditingPostId = null; let postToShare = null; let activeReplyParentId = null; 
const MAX_CHARS = 2200;

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

window.logoutUser = function() { signOut(auth).then(() => { window.location.href = "index.html"; }); };

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
        window.myUsername = myUsername; window.allUsersData = allUsersData;

        if (!targetUsername) { targetUsername = myUsername; }
        
        const checkMyBan = await getDoc(doc(db, "users", myUsername));
        if (checkMyBan.exists() && checkMyBan.data().isBanned === true) { signOut(auth).then(() => { window.location.href = "index.html"; }); return; }

        onSnapshot(doc(db, "users", myUsername), async (docSnap) => { 
            if(docSnap.exists()) {
                const u = docSnap.data();
                allUsersData[myUsername] = u;
                myFollowingList = u.following || []; 
                myBookmarks = u.bookmarks || []; 
                
                await window.fetchMissingUsers(myFollowingList);
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

        const urlPostId = urlParams.get('post');
        if (urlPostId) {
            setTimeout(() => { window.openPostDetail(urlPostId); }, 400);
        }
        
    } else { window.location.href = "index.html"; }
});

window.toggleLike = async function(postId, isLiked, postAuthor, event, isDoubleTap = false) { 
    event.stopPropagation();
    if (window.isActionLocked && window.isActionLocked('like_' + postId)) return; 
    
    let isDouble = (event && event.type === 'dblclick') || isDoubleTap;
    if (isDouble && isLiked) return; 

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
            console.error("Silme hatası:", e);
            alert("İçerik silinirken bir hata oluştu."); 
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
        } catch (error) { console.error("Yeniden paylaşım hatası:", error); }
    }
};

window.toggleDropdown = function(postId, event) {
    event.stopPropagation();
    document.querySelectorAll('.dropdown-menu').forEach(menu => { if(menu.id !== `dropdown-${postId}`) menu.style.display = 'none'; });
    const menu = document.getElementById(`dropdown-${postId}`);
    if(menu) menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
};

window.pinPost = async function(postId) {
    try {
        const userRef = doc(db, "users", myUsername);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            const currentPinned = userSnap.data().pinnedPostId;
            if (currentPinned === postId) {
                await updateDoc(userRef, { pinnedPostId: null });
            } else {
                await updateDoc(userRef, { pinnedPostId: postId });
            }
        }
    } catch(e) { console.error('Sabitleme hatası:', e); }
};

window.openEditModal = function(postId, currentContent) { currentlyEditingPostId = postId; document.getElementById('edit-post-input').value = currentContent; document.getElementById('edit-post-modal').style.display = 'flex'; };

document.getElementById('save-edited-post-btn')?.addEventListener('click', async () => {
    if(!currentlyEditingPostId) return; const newContent = document.getElementById('edit-post-input').value.trim(); if(!newContent) return;
    if (newContent.length > 280) { alert("Gönderi en fazla 280 karakter olabilir!"); return; }
    
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
            let uData = allUsersData[uname] || {}; let avatarHtml = uData.avatarUrl ? `<img src=\"${window.sanitizeUrl(uData.avatarUrl)}\">` : `👤`; let vHtml = uData.isVerified ? '<span class=\"verified-badge\">☑️</span>' : '';
            container.innerHTML += `<div class=\"user-row\" onclick=\"window.sendPostAsMessage('${window.escapeHtml(uname)}')\"><div class=\"row-avatar\">${avatarHtml}</div><div style=\"flex:1;\"><div style=\"font-weight:700;\">${window.escapeHtml(uData.fullName || uname)} ${vHtml}</div><div style=\"font-size:13px; color:#64748b;\">@${window.escapeHtml(uname)}</div></div><button style=\"background:#f1f5f9; color:#0f172a; border:1px solid #cbd5e1; padding:6px 15px; border-radius:6px; font-weight:600; cursor:pointer;\">Gönder</button></div>`;
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

function generateUniqueId() { return Math.random().toString(36).substr(2, 9); }

window.closePostDetail = function() {
    document.getElementById('post-detail-modal').style.display = 'none'; window.currentOpenPostId = null; activeReplyParentId = null;
    document.getElementById('post-detail-container').innerHTML = ''; document.body.classList.remove('modal-open'); window.history.replaceState({}, document.title, window.location.pathname);
};

window.openPostDetail = async function(postId) {
    window.currentOpenPostId = postId; activeReplyParentId = null;
    let postObj = globalPosts.find(p => p.id === postId); 
    if (!postObj) {
        try {
            const pSnap = await getDoc(doc(db, "posts", postId));
            if (pSnap.exists()) {
                let pData = pSnap.data();
                if (pData.content) pData.content = DOMPurify.sanitize(pData.content);
                postObj = { id: pSnap.id, data: pData };
                globalPosts.push(postObj);
                const authorsToFetch = [postObj.data.author];
                if (postObj.data.originalPostAuthor) authorsToFetch.push(postObj.data.originalPostAuthor);
                await window.fetchMissingUsers(authorsToFetch);
            }
        } catch (e) {
            console.error("Gönderi detayı getirilemedi:", e);
        }
    }
    if(!postObj) return; const postData = postObj.data; 
    
    let originalAuthor = postData.author; if(postData.isRepost) { originalAuthor = postData.originalPostAuthor; }
    const authorData = allUsersData[originalAuthor] || {}; const likesArray = postData.likes || []; const isLiked = likesArray.includes(myUsername);
    const vHtml = authorData.isVerified ? '<span class=\"verified-badge\">☑️</span>' : ''; const avatarImg = authorData.avatarUrl ? `<img src=\"${window.sanitizeUrl(authorData.avatarUrl)}\" style=\"width:100%;height:100%;object-fit:cover; border-radius:50%;\">` : `👤`;
    const fullName = window.escapeHtml(authorData.fullName || originalAuthor);
    
    let timeString = "";
    if (postData.createdAt) {
        if (typeof postData.createdAt.toMillis === 'function') { timeString = new Date(postData.createdAt.toMillis()).toLocaleString('tr-TR', {day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}); } 
        else if (postData.createdAt.seconds) { timeString = new Date(postData.createdAt.seconds * 1000).toLocaleString('tr-TR', {day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
    }
    
    let locHtml = postData.location ? `<span style="font-size:14px; color:#3b82f6; margin-left:10px;">📍 ${window.escapeHtml(postData.location)}</span>` : '';
    let repostLabel = "";
    if(postData.isRepost) { repostLabel = `<div style=\"color:#64748b; font-weight:600; font-size:12px; margin-bottom:10px; padding:0 20px;\">🔁 @${postData.author} ağında paylaştı</div>`; }

            let mediaHtmlDetail = '';
            if (postData.media && postData.media.length > 1) {
                let slides = postData.media.map(m => {
                    let tag = m.type === 'video' ? `${window.renderCustomVideo(window.sanitizeUrl(m.url), "", "modal-" + Math.random().toString(36).substr(2,9), window.currentOpenPostId)}` : `<img src="${window.sanitizeUrl(m.url)}" style="width:100%; max-height:60vh; border-radius:8px; object-fit:contain;">`;
                    return `<div style="flex: 0 0 100%; scroll-snap-align: start;">${tag}</div>`;
                }).join('');
                mediaHtmlDetail = `<div style="display:flex; overflow-x:auto; scroll-snap-type: x mandatory; gap: 10px; padding-bottom: 10px; max-width: 100%; margin-bottom:15px;">${slides}</div>`;
            } else if (postData.media && postData.media.length === 1) {
                let m = postData.media[0];
                let tag = m.type === 'video' ? `${window.renderCustomVideo(window.sanitizeUrl(m.url), "", "modal-" + Math.random().toString(36).substr(2,9), window.currentOpenPostId)}` : `<img src="${window.sanitizeUrl(m.url)}" style="width:100%; max-height:60vh; border-radius:8px; margin-bottom:15px; border:1px solid #334155; object-fit:contain;">`;
                mediaHtmlDetail = tag;
            } else if (postData.imageUrl) {
                mediaHtmlDetail = `<img src="${window.sanitizeUrl(postData.imageUrl)}" style="width:100%; max-height:60vh; border-radius:8px; margin-bottom:15px; border:1px solid #334155; object-fit:contain;">`;
            }

            let html = `
                ${repostLabel}
                <div style="padding: 10px 25px 25px 25px; border-bottom:1px solid #334155;">
                    <div style="display:flex; align-items:center; gap:12px; margin-bottom:15px; cursor:pointer;" onclick="window.location.href='profile.html?user=${originalAuthor}'">
                        <div style="width:48px; height:48px; border-radius:50%; background:#1e293b; overflow:hidden; display:flex; justify-content:center; align-items:center; font-size:24px; border: 1px solid #334155;">${avatarImg}</div>
                        <div style="flex:1;">
                            <div style="font-weight:700; font-size:16px; color:white;">${fullName} ${vHtml}</div>
                            <div style="color:#94a3b8; font-size:14px;">@${originalAuthor} ${locHtml}</div>
                        </div>
                    </div>
                    <div style="font-size:16px; line-height:1.6; color:white; margin-bottom:15px; word-wrap:break-word;">
                        ${postData.content ? DOMPurify.sanitize(postData.content).replace(/#([a-zA-Z0-9ğüşıöçĞÜŞİÖÇ_]+)/g, `<a href="search.html?tag=$1" style="color:#06b6d4; font-weight:500; text-decoration:none;">#$1</a>`) : ''}
                    </div>
                    ${mediaHtmlDetail}
                    <div style="color:#64748b; font-size:13px; padding-bottom:15px; border-bottom:1px solid #334155;">${timeString}</div>
            
            <div style=\"display:flex; justify-content:flex-start; gap:30px; padding:15px 0; color:#94a3b8;\">
                <div class=\"action-item\" onclick=\"document.getElementById('detail-comment-input').focus()\"><span class=\"action-icon\" style="background:#1e293b; border-color:#334155;">💬</span> ${(postData.comments || []).length}</div>
                <div class=\"action-item repost-box\" onclick=\"window.repostPost('${postId}', '${originalAuthor}', event)\"><span class=\"action-icon\" style="background:#1e293b; border-color:#334155;">🔁</span></div>
                <div class=\"action-item like-box ${isLiked ? 'liked' : ''}\" onclick=\"window.toggleLike('${postId}', ${isLiked}, '${originalAuthor}', event)\"><span class=\"action-icon\" style="background:#1e293b; border-color:#334155;">${isLiked ? '❤️' : '🤍'}</span> <span onclick=\"window.showLikes('${postId}', event)\">${likesArray.length}</span></div>
                <div class=\"action-item ${myBookmarks.includes(postId) ? 'liked' : ''}\" onclick=\"window.toggleBookmark('${postId}', ${myBookmarks.includes(postId)}, event)\" title=\"Yer İşaretlerine Ekle/Çıkar\"><span class=\"action-icon\" style="background:#1e293b; border-color:#334155;">${myBookmarks.includes(postId) ? '🔖' : '📑'}</span></div>
                <div class=\"action-item\" onclick=\"window.openShareModal('${postId}', event)\"><span class=\"action-icon\" style="background:#1e293b; border-color:#334155;">📤</span></div>
            </div>
        </div>

        <div class=\"comments-wrapper\" style=\"padding: 0 25px;\">
            ${buildCommentsTree(postData.comments || [], null, 0, postId, originalAuthor)}
        </div>
        
        <div style=\"position:sticky; bottom:0; background:#151e32; padding:20px 25px; border-top:1px solid #334155; display:flex; flex-direction:column; gap:10px;\">
            <div id=\"replying-to-info\" style=\"display:none; font-size:13px; color:#94a3b8;\">
                Yanıtlanıyor: <b id=\"replying-to-name\"></b> <span style=\"cursor:pointer; color:#ef4444; margin-left:10px;\" onclick=\"window.cancelDetailReply()\">İptal</span>
            </div>
            <div style=\"display:flex; gap:10px;\">
                <input type=\"text\" id=\"detail-comment-input\" maxlength=\"500\" style=\"flex:1; background:#1e293b; border:1px solid #334155; padding:12px 15px; border-radius:8px; outline:none; font-size:15px; color:white;\" placeholder=\"Görüşünüzü bildirin...\">
                <button onclick=\"window.sendDetailComment('${postId}', '${originalAuthor}')\" style=\"background:#06b6d4; color:white; border:none; border-radius:8px; padding:0 20px; font-weight:600; cursor:pointer;\">Gönder</button>
            </div>
        </div>
    `;
    const contentBox = document.getElementById('post-detail-content-box');
    if(contentBox) contentBox.scrollTop = 0; 
    document.getElementById('post-detail-container').innerHTML = html; window.initVideoPlayers(); window.observeVideos();
    document.getElementById('post-detail-modal').style.display = 'flex';
    document.body.classList.add('modal-open');
    document.getElementById('post-detail-modal').onclick = function(e) { if(e.target === this) window.closePostDetail(); };
};

function buildCommentsTree(allComments, parentId, depth = 0, postId = null, postAuthor = null) {
    if (depth > 15) return ''; 
    let html = ''; const safeParentId = parentId || null;
    const children = allComments.filter(c => (c.parentId || null) === safeParentId).sort((a,b) => a.timestamp - b.timestamp);
    
    children.forEach(c => {
        const cUserData = allUsersData[c.author] || {}; const avatarHtml = cUserData.avatarUrl ? `<img src=\"${window.sanitizeUrl(cUserData.avatarUrl)}\" style="width:100%;height:100%;object-fit:cover;">` : `👤`;
        const vHtml = cUserData.isVerified ? `<span class=\"verified-badge\" style=\"font-size:12px;\">☑️</span>` : '';
        const safeCommentId = c.id || ('legacy_' + Math.random().toString(36).substr(2, 9));

        let deleteBtnHtml = '';
        if (myUsername === c.author || myUsername === postAuthor) { deleteBtnHtml = `<div class=\"comment-action-btn\" style=\"color:#ef4444;\" onclick=\"window.deleteComment('${postId}', '${safeCommentId}')\">Sil</div>`; }

        html += `
            <div class=\"comment-node\" style="background:#1e293b; border-color:#334155;">
                <div class=\"comment-header\">
                    <div class=\"comment-avatar\" onclick=\"window.location.href='profile.html?user=${c.author}'\" style=\"cursor:pointer; border-radius:50%;\">${avatarHtml}</div>
                    <div class=\"comment-body\">
                        <div><a href=\"profile.html?user=${window.escapeHtml(c.author)}\" class=\"comment-author-name\" style="color:white;">${window.escapeHtml(cUserData.fullName || c.author)}</a> ${vHtml} <span style=\"color:#94a3b8; font-size:13px; font-weight:normal;\">@${window.escapeHtml(c.author)}</span></div>
                        <div class=\"comment-text\" style="color:#cbd5e1;">${DOMPurify.sanitize(c.text)}</div>
                        <div class=\"comment-actions\" style="color:#94a3b8;">
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
    if (text.length > 500) { alert("Yorumunuz en fazla 500 karakter olabilir!"); return; }
    if (window.isActionLocked && window.isActionLocked('comment_' + postId)) { return; }
    const newComment = { id: generateUniqueId(), text: text, author: myUsername, timestamp: Date.now(), parentId: activeReplyParentId };
    
    const postObj = globalPosts.find(p => p.id === postId);
    if (postObj) {
        if (!postObj.data.comments) postObj.data.comments = [];
        postObj.data.comments.push(newComment);
        window.renderProfileFeed();
        window.openPostDetail(postId);
    }

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

// ==========================================
// 1. PROFİL BİLGİLERİNİ YÜKLEME VE BUTONLARI AYARLAMA (Tailwind Güncellemesi)
// ==========================================
function loadUserProfileData() {
    onSnapshot(doc(db, "users", targetUsername), async (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            const isMe = (targetUsername === myUsername);
            const isInfoHidden = data.hideInfo || false;

            const dFullName = document.getElementById('display-fullname'); 
            if(dFullName) dFullName.innerHTML = `${window.escapeHtml(data.fullName || targetUsername)} ${data.isVerified ? '<span class="verified-badge">☑️</span>' : ''}`;
            const dUsername = document.getElementById('display-username'); 
            if(dUsername) dUsername.innerText = `@${targetUsername}`;
            
            let detailsHtml = '';
            if (!isInfoHidden || isMe) {
                if(data.location) detailsHtml += `<span>📍 ${window.escapeHtml(data.location)}</span>`;
                if(data.birthDate) detailsHtml += `<span>🎈 Doğum tarihi: ${window.escapeHtml(new Date(data.birthDate).toLocaleDateString('tr-TR', {day:'numeric',month:'long',year:'numeric'}))}</span>`;
            }
            const dDetails = document.getElementById('display-details'); if(dDetails) dDetails.innerHTML = detailsHtml;
            if (data.bio) {
                const dBio = document.getElementById('display-bio'); if(dBio) dBio.innerText = data.bio;
            }
            
            if (data.avatarUrl) { document.getElementById('profile-avatar').innerHTML = `<img src="${window.sanitizeUrl(data.avatarUrl)}" class="w-full h-full object-cover">`; }
            else { document.getElementById('profile-avatar').innerHTML = `👤`; }
            
            currentProfileFollowers = data.followers || []; currentProfileFollowing = data.following || [];
            const folCount = document.getElementById('followers-count'); if(folCount) folCount.innerText = currentProfileFollowers.length; 
            const fIngCount = document.getElementById('following-count'); if(fIngCount) fIngCount.innerText = currentProfileFollowing.length;
            
            isTargetPrivate = data.isPrivate || false; isTargetVerified = data.isVerified || false; 
            
            const pBadge = document.getElementById('private-badge-container');
            if(isTargetPrivate) { if(pBadge) pBadge.innerHTML = `<div class="bg-gray-800 text-gray-300 border border-gray-700 text-xs px-2 py-1 rounded-md inline-block mt-2">🔒 Bu hesap gizli</div>`; }
            else { if(pBadge) pBadge.innerHTML = ''; }
            
            const amIFollowing = currentProfileFollowers.includes(myUsername);

            // Aksiyon Butonları (Tailwind Güncellemesi)
            const actionContainer = document.getElementById('action-buttons-container');
            if (isMe) {
                if(actionContainer) actionContainer.innerHTML = `<button class="bg-gray-800 border border-gray-600 hover:bg-gray-700 text-white w-full py-2 rounded-xl font-bold transition text-sm" onclick="window.openProfileEdit()">Profili Düzenle</button>`;
            } else {
                const mySnap = await getDoc(doc(db, "users", myUsername)); 
                if(mySnap.exists() && mySnap.data().following) isFollowing = mySnap.data().following.includes(targetUsername); 
                isRequested = (data.followRequests || []).includes(myUsername);
                
                if(actionContainer) actionContainer.innerHTML = `
                    <button class="bg-gray-800 border border-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-xl transition flex items-center justify-center" onclick="window.location.href='chat.html?user=${targetUsername}'" title="Mesaj Gönder"><i class="fa-regular fa-envelope text-lg"></i></button>
                    <button id="main-follow-btn" class="w-full bg-cyan-600 hover:bg-cyan-700 text-white py-2 rounded-xl font-bold transition text-sm" onclick="window.toggleFollow()">Takip Et</button>
                `;
                updateFollowButtonUI();
            }

            const fBox = document.getElementById('followers-box');
            if(fBox) fBox.onclick = () => { if(isTargetPrivate && !isMe && !amIFollowing) return; window.showUserList("Takipçiler", currentProfileFollowers); };
            const fIngBox = document.getElementById('following-box');
            if(fIngBox) fIngBox.onclick = () => { if(isTargetPrivate && !isMe && !amIFollowing) return; window.showUserList("Ağım", currentProfileFollowing); };

            const feedContainer = document.getElementById('profile-feed-container');
            if (isTargetPrivate && !isMe && !amIFollowing) {
                if(feedContainer) {
                    feedContainer.style.display = 'block';
                    feedContainer.innerHTML = `<div style="padding:50px 20px; text-align:center;"><div style="font-size:40px; margin-bottom:10px;">🔒</div><div style="font-size:18px; font-weight:800; color:#e2e8f0;">Bu hesap gizli</div><div style="color:#64748b; font-size:14px;">İçeriklerini görmek için takip edin.</div></div>`;
                }
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
            if(fCont) {
                fCont.style.display = 'block';
                fCont.innerHTML = `<div style="padding:40px; text-align:center; color:#64748b;">Bu hesap mevcut değil.</div>`;
            }
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

    if(!newFullName) { alert("İsim zorunludur!"); return; }
    if (newFullName.length > 50) { alert("İsim en fazla 50 karakter olabilir!"); return; }
    if (newBio.length > 150) { alert("Biyografi en fazla 250 karakter olabilir!"); return; }
    if (newLocation.length > 50) { alert("Konum en fazla 50 karakter olabilir!"); return; }

    if (rawAvatarFile && !rawAvatarFile.type.match(/^(image\/(jpeg|png|webp|gif))$/)) { alert("Sadece güvenli profil fotoğrafı formatları yüklenebilir."); return; }
    if (rawAvatarFile && rawAvatarFile.size > 5 * 1024 * 1024) { alert("Profil fotoğrafı 10 MB'dan büyük olamaz!"); return; }
    
    saveBtn.innerText = "Sıkıştırılıyor..."; saveBtn.disabled = true;
    
    let newAvatarUrl = document.getElementById('profile-avatar').querySelector('img') ? document.getElementById('profile-avatar').querySelector('img').src : null; 
    
    try {
        if (rawAvatarFile) { 
            const avatarFile = await window.compressImage(rawAvatarFile, 400, 400, 0.8, 300 * 1024); 
            saveBtn.innerText = "Fotoğraf yükleniyor...";
            const avatarRef = ref(storage, `avatars/${auth.currentUser.uid}_${Date.now()}_${avatarFile.name.replace(/[^a-zA-Z0-9.]/g, "")}`);
            await uploadBytes(avatarRef, avatarFile);
            newAvatarUrl = await getDownloadURL(avatarRef);
        }

        saveBtn.innerText = "Kaydediliyor...";

        await setDoc(doc(db, "users", myUsername), { 
            fullName: newFullName, birthDate: newBirthDate, gender: newGender, location: newLocation, bio: newBio, 
            isPrivate: isPrivateChecked, hideInfo: isHideInfoChecked, 
            avatarUrl: newAvatarUrl 
        }, { merge: true });
        
        document.getElementById('edit-modal').style.display = 'none';
    } catch (e) { alert("Yükleme sırasında hata oluştu!"); console.error("Profil güncelleme hatası:", e); } 
    finally { saveBtn.innerText = "Güncelle"; saveBtn.disabled = false; }
});

document.getElementById('trigger-delete-account-btn')?.addEventListener('click', async () => {
    if(!confirm("DİKKAT! Hesabınız, tüm gönderileriniz ve fotoğraflarınız KALICI olarak silinecek. Onaylıyor musunuz?")) return;
    
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

        setTimeout(() => { window.location.href = "index.html"; }, 1500);

    } catch (error) {
        console.error("Hesap silinemedi:", error);
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
        alert("Takip işlemi gerçekleştirilemedi.");
    }
    btn.disabled = false;
};

function updateFollowButtonUI() {
    const btn = document.getElementById('main-follow-btn'); 
    if(!btn) return;
    
    if(isFollowing) { 
        btn.className = 'w-full bg-gray-800 border border-gray-600 hover:bg-gray-700 text-white py-2 rounded-xl font-bold transition text-sm';
        btn.innerText = "Ağınızda"; 
    } 
    else if (isRequested) { 
        btn.className = 'w-full bg-gray-800 border border-gray-600 hover:bg-gray-700 text-white py-2 rounded-xl font-bold transition text-sm';
        btn.innerText = "İstek Gönderildi"; 
    } 
    else { 
        btn.className = 'w-full bg-cyan-600 hover:bg-cyan-700 text-white py-2 rounded-xl font-bold transition text-sm';
        btn.innerText = "Takip Et"; 
    }
}

async function loadUserPosts(isLoadMore = false) {
    const feedContainer = document.getElementById('profile-feed-container'); 
    if (!isLoadMore) { 
        if(feedContainer) {
            feedContainer.style.display = 'block';
            feedContainer.innerHTML = '<div style="padding:40px; text-align:center; color:#64748b;">Yükleniyor...</div>';
        }
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
        console.error("Kullanıcı gönderileri yüklenemedi:", error);
        if(feedContainer && !isLoadMore) {
            feedContainer.style.display = 'block';
            feedContainer.innerHTML = '<div style="padding:40px; text-align:center; color:#ef4444;">Gönderiler yüklenemedi. Lütfen daha sonra tekrar deneyin.</div>';
        }
    }
}

// ==========================================
// 2. YENİ MOZAİK (ASİMETRİK) GRID RENDER SİSTEMİ
// ==========================================
window.renderProfileFeed = function() { 
    window.currentGlobalPosts = globalPosts;
    const feedContainer = document.getElementById('profile-feed-container'); 
    if(!feedContainer) return;
    feedContainer.innerHTML = ''; 
    
    let userPostCount = 0;
    
    globalPosts.forEach((postObj) => {
        let postData = postObj.data;
        const postId = postObj.id; 
        
        if (postData.author === targetUsername && !postData.isRepost) userPostCount++;

        // Profil sayfasında sadece kullanıcının kendi postlarını gösteriyoruz 
        if (postData.author === targetUsername) {
            
            let thumbnailUrl = '';
            let iconHtml = '';
            
            if (postData.media && postData.media.length > 1) {
                thumbnailUrl = postData.media[0].url;
                iconHtml = `<i class="fa-regular fa-images text-white drop-shadow-md text-sm"></i>`;
            } else if (postData.media && postData.media.length === 1) {
                let m = postData.media[0];
                thumbnailUrl = m.url;
                if (m.type === 'video') {
                    iconHtml = `<i class="fa-solid fa-play text-white drop-shadow-md text-sm"></i>`;
                }
            } else if (postData.imageUrl) {
                thumbnailUrl = postData.imageUrl;
            } else if (postData.content) {
                iconHtml = `<i class="fa-regular fa-file-lines text-white drop-shadow-md text-sm"></i>`;
            }

            const postDiv = document.createElement('div'); 
            postDiv.className = 'mosaic-item bg-gray-800 flex items-center justify-center relative group';
            postDiv.onclick = () => window.openPostDetail(postId); 

            if (thumbnailUrl) {
                postDiv.innerHTML = `
                    <img src="${window.sanitizeUrl(thumbnailUrl)}" class="w-full h-full object-cover">
                    ${iconHtml ? `<div class="absolute top-2 right-2">${iconHtml}</div>` : ''}
                    <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-4 text-white text-sm font-bold">
                        <span>❤️ ${postData.likes ? postData.likes.length : 0}</span>
                        <span>💬 ${postData.comments ? postData.comments.length : 0}</span>
                    </div>
                `;
            } else {
                let cleanText = postData.content.replace(/<[^>]*>?/gm, '');
                postDiv.innerHTML = `
                    <div class="p-3 w-full h-full flex flex-col justify-center items-center text-center bg-gray-800">
                        <p class="text-xs text-gray-300 line-clamp-4 overflow-hidden">${window.escapeHtml(cleanText)}</p>
                    </div>
                    ${iconHtml ? `<div class="absolute top-2 right-2">${iconHtml}</div>` : ''}
                `;
            }

            feedContainer.appendChild(postDiv);
        }
    });
    
    const hCount = document.getElementById('header-post-count');
    if(hCount) hCount.innerText = userPostCount;
    
    if(userPostCount === 0 && feedContainer) {
        feedContainer.style.display = 'block';
        feedContainer.innerHTML = `<div style="padding:40px; text-align:center;"><div style="font-size:40px; margin-bottom:10px;">📭</div><div style="font-size:18px; font-weight:800; color:#e2e8f0;">Henüz içerik yok</div><div style="color:#64748b; font-size:14px;">Paylaşılan mozaikler burada görünecek.</div></div>`;
    } else {
        feedContainer.style.display = 'grid';
    }
};