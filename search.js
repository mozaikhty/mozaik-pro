import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { collection, onSnapshot, query, orderBy, doc, setDoc, arrayUnion, addDoc, serverTimestamp, where, getDoc, limit, startAt, endAt, getDocs } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';

let allUsers = []; let allPosts = []; let allUsersData = {}; let trendingTags = []; let currentTab = 'users'; let myUsername = null; let myFollowing = [];

// GLOBAL ÇAĞRI DİNLEYİCİ DEĞİŞKENLERİ
let activeChats = [];
let callListeners = {};
let peerConnection; let localStream; let remoteStream; let currentCallDocId = null; let currentCallChatId = null; let currentCallCollection = null; let isCallVideo = false;
const callOverlay = document.getElementById('call-overlay'); const localVideo = document.getElementById('local-video'); const remoteVideo = document.getElementById('remote-video');
const servers = { iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }] };

const tabUsers = document.getElementById('tab-users'); const tabTags = document.getElementById('tab-tags');
const searchInput = document.getElementById('search-input'); const resultsContainer = document.getElementById('search-results');

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

window.openSupportModal = function() {
    const settingsModal = document.getElementById('settings-modal');
    if(settingsModal) settingsModal.style.display = 'none';
    const supportInput = document.getElementById('support-message-input');
    if(supportInput) supportInput.value = '';
    const supportModal = document.getElementById('support-modal');
    if(supportModal) supportModal.style.display = 'flex';
};

window.sendSupportMessage = async function() {
    const btn = document.getElementById('send-support-btn');
    const input = document.getElementById('support-message-input');
    const message = input ? input.value.trim() : '';
    
    if (!message) { window.showToast?.("Lütfen bir mesaj yazın.", "error") || alert("Lütfen bir mesaj yazın."); return; }
    if(btn) { btn.disabled = true; btn.innerText = "Gönderiliyor..."; }

    try {
        await addDoc(collection(db, "tickets"), {
            sender: myUsername || "Bilinmeyen Kullanıcı",
            message: message,
            createdAt: serverTimestamp(),
            status: "Yeni"
        });
        window.showToast?.("Mesajınız başarıyla iletildi. Teşekkür ederiz!", "success") || alert("Gönderildi.");
        const modal = document.getElementById('support-modal');
        if(modal) modal.style.display = 'none';
    } catch (error) {
        console.error("Hata:", error);
        alert("Mesaj gönderilirken bir hata oluştu.");
    } finally {
        if(btn) { btn.disabled = false; btn.innerText = "Gönder"; }
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
            let uData = allUsersData[uname] || {}; let avatarHtml = uData.avatarUrl ? `<img src="${uData.avatarUrl}">` : `👤`; let vHtml = uData.isVerified ? '<span class="verified-badge" style="font-size:14px; margin-left:2px;">☑️</span>' : '';
            container.innerHTML += `<div onclick="window.location.href='profile.html?user=${uname}'" class="user-row"><div class="row-avatar">${avatarHtml}</div><div><div style="font-weight:700; color:#0f172a;">${uData.fullName || uname} ${vHtml}</div><div style="font-size:13px; color:#64748b;">@${uname}</div></div></div>`;
        });
    }
    document.getElementById('users-list-modal').style.display = 'flex';
};
document.getElementById('close-list-btn')?.addEventListener('click', () => { document.getElementById('users-list-modal').style.display = 'none'; });

function switchTab(tab) {
    currentTab = tab;
    if(tab === 'users') { tabUsers?.classList.add('active'); tabTags?.classList.remove('active'); if(searchInput) searchInput.placeholder = "Kişi arayın..."; } 
    else { tabTags?.classList.add('active'); tabUsers?.classList.remove('active'); if(searchInput) searchInput.placeholder = "Gündem arayın (örn: yazilim)..."; }
    const urlParams = new URLSearchParams(window.location.search); const tagParam = urlParams.get('tag');
    if(tab === 'tags' && tagParam && searchInput) searchInput.value = tagParam; else if(searchInput) searchInput.value = ''; performSearch(); 
}

tabUsers?.addEventListener('click', () => switchTab('users')); 
tabTags?.addEventListener('click', () => switchTab('tags'));

onAuthStateChanged(auth, (user) => {
    if (user) {
        myUsername = user.displayName || localStorage.getItem('mozaik_username') || user.email.split('@')[0];
        fetchData();
        
        onSnapshot(query(collection(db, "chats"), where("participants", "array-contains", myUsername)), (snapshot) => { 
            activeChats = activeChats.filter(c => c.type === 'group'); 
            snapshot.forEach(docSnap => { activeChats.push({ id: docSnap.id, ...docSnap.data(), type:'private' }); }); 
            attachCallListeners(); 
        });
        onSnapshot(query(collection(db, "groups"), where("members", "array-contains", myUsername)), (snapshot) => { 
            activeChats = activeChats.filter(c => c.type === 'private'); 
            snapshot.forEach(docSnap => { activeChats.push({ id: docSnap.id, ...docSnap.data(), type:'group' }); }); 
            attachCallListeners(); 
        });

    } else { window.location.href = "index.html"; }
});

function attachCallListeners() {
    activeChats.forEach(chat => {
        if (!callListeners[chat.id]) {
            const colName = chat.type === 'group' ? "groups" : "chats";
            const callRef = collection(db, colName, chat.id, "calls");
            callListeners[chat.id] = onSnapshot(callRef, (snapshot) => {
                snapshot.docChanges().forEach(async (change) => {
                    const callData = change.doc.data();
                    if (change.type === 'added' && callData.status === 'ringing' && callData.caller !== myUsername) {
                        currentCallDocId = change.doc.id;
                        currentCallChatId = chat.id;
                        currentCallCollection = colName;
                        isCallVideo = callData.type === 'video';
                        const cText = document.getElementById('call-status-text'); if(cText) cText.innerText = `@${callData.caller} Arıyor...`;
                        const aBtn = document.getElementById('accept-call-btn'); if(aBtn) aBtn.style.display = 'block';
                        if(callOverlay) callOverlay.style.display = 'flex';
                        const vCont = document.getElementById('video-container'); if(vCont) vCont.style.display = isCallVideo ? 'flex' : 'none';
                    }
                    if (change.type === 'modified' && callData.status === 'answered' && callData.caller === myUsername && currentCallDocId === change.doc.id) {
                        const cText = document.getElementById('call-status-text'); if(cText) cText.innerText = "Bağlandı";
                        const desc = new RTCSessionDescription(callData.answer);
                        await peerConnection.setRemoteDescription(desc);
                    }
                    if (change.type === 'modified' && (callData.status === 'ended' || callData.status === 'missed') && currentCallDocId === change.doc.id) {
                        endCallUI();
                    }
                });
            });
        }
    });
}

document.getElementById('accept-call-btn')?.addEventListener('click', async () => {
    document.getElementById('accept-call-btn').style.display = 'none'; 
    document.getElementById('call-status-text').innerText = "Bağlanıyor...";
    const callDocRef = doc(db, currentCallCollection, currentCallChatId, "calls", currentCallDocId); 
    const callData = (await getDoc(callDocRef)).data();
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: isCallVideo, audio: true });
        if(isCallVideo && localVideo) localVideo.srcObject = localStream;
        peerConnection = new RTCPeerConnection(servers);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        remoteStream = new MediaStream(); if(remoteVideo) remoteVideo.srcObject = remoteStream;
        peerConnection.ontrack = event => { event.streams[0].getTracks().forEach(track => { remoteStream.addTrack(track); }); };
        
        peerConnection.onicecandidate = event => { 
            if(event.candidate) { 
                addDoc(collection(db, currentCallCollection, currentCallChatId, "calls", currentCallDocId, "calleeCandidates"), event.candidate.toJSON()); 
            } 
        };
        
        const offerDescription = callData.offer; 
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offerDescription));
        const answerDescription = await peerConnection.createAnswer(); 
        await peerConnection.setLocalDescription(answerDescription);
        
        await updateDoc(callDocRef, { answer: { type: answerDescription.type, sdp: answerDescription.sdp }, status: 'answered' });
        
        onSnapshot(collection(db, currentCallCollection, currentCallChatId, "calls", currentCallDocId, "callerCandidates"), (snapshot) => { 
            snapshot.docChanges().forEach((change) => { 
                if(change.type === 'added') { 
                    const candidate = new RTCIceCandidate(change.doc.data()); 
                    peerConnection.addIceCandidate(candidate); 
                } 
            }); 
        });
        const cText = document.getElementById('call-status-text'); if(cText) cText.innerText = "Bağlandı";
    } catch(e) { alert("Erişim reddedildi!"); updateDoc(callDocRef, { status: 'ended' }); endCallUI(); }
});

document.getElementById('end-call-btn')?.addEventListener('click', async () => { 
    if(currentCallDocId && currentCallCollection && currentCallChatId) { 
        const callRef = doc(db, currentCallCollection, currentCallChatId, "calls", currentCallDocId);
        const callSnap = await getDoc(callRef);
        if(callSnap.exists()) {
            const callData = callSnap.data();
            if(callData.status === 'ringing') {
                await updateDoc(callRef, { status: 'missed' });
                await addDoc(collection(db, currentCallCollection, currentCallChatId, "messages"), {
                    type: 'system', text: callData.type === 'video' ? 'Cevapsız görüntülü arama' : 'Cevapsız sesli arama', sender: myUsername, createdAt: serverTimestamp()
                });
            } else {
                await updateDoc(callRef, { status: 'ended' });
            }
        }
    } 
    endCallUI(); 
});

function endCallUI() { 
    if (callOverlay) callOverlay.style.display = 'none'; 
    if(localStream) { localStream.getTracks().forEach(track => track.stop()); } 
    if(remoteStream) { remoteStream.getTracks().forEach(track => track.stop()); } 
    if(peerConnection) { peerConnection.close(); } 
    localStream = null; remoteStream = null; peerConnection = null; currentCallDocId = null; currentCallChatId = null; currentCallCollection = null;
    if (localVideo) localVideo.srcObject = null; 
    if (remoteVideo) remoteVideo.srcObject = null; 
}

function renderWhoToFollow() {
    const container = document.getElementById('who-to-follow-list');
    if (!container) return;

    let eligibleUsers = Object.keys(allUsersData).filter(uid => {
        return uid !== myUsername && !myFollowing.includes(uid);
    });

    eligibleUsers = eligibleUsers.sort(() => 0.5 - Math.random()).slice(0, 3);

    if (eligibleUsers.length === 0) {
        container.innerHTML = '<div style="font-size:14px; color:#64748b; padding: 10px 0;">Şu an için yeni öneri yok.</div>';
        return;
    }

    let html = '';
    eligibleUsers.forEach(uid => {
        const uData = allUsersData[uid];
        const avatarHtml = uData.avatarUrl ? `<img src="${uData.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">` : `👤`;
        const fullName = uData.fullName || uid;
        const vHtml = uData.isVerified ? '<span style="color:#1da1f2; font-size:14px; margin-left:4px;">☑️</span>' : '';
        
        html += `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-top:15px; cursor:pointer; padding: 8px; border-radius: 8px; transition: 0.2s;" class="user-row" onclick="window.location.href='profile.html?user=${uid}'">
                <div style="display:flex; align-items:center; gap:10px; overflow:hidden;">
                    <div style="width:40px; height:40px; border-radius:8px; background:#e2e8f0; overflow:hidden; display:flex; justify-content:center; align-items:center; font-size:20px; flex-shrink:0; border: 1px solid #cbd5e1;">${avatarHtml}</div>
                    <div style="overflow:hidden;">
                        <div style="font-weight:700; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#0f172a;">${fullName} ${vHtml}</div>
                        <div style="color:#64748b; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">@${uid}</div>
                    </div>
                </div>
                <button onclick="event.stopPropagation(); window.quickFollow('${uid}')" style="background:#f1f5f9; color:#0f172a; border:1px solid #cbd5e1; padding:6px 12px; border-radius:6px; font-weight:600; cursor:pointer; flex-shrink:0; transition:0.2s; font-size:13px;">Ekle</button>
            </div>
        `;
    });
    container.innerHTML = html;
}

window.quickFollow = async function(targetUser) {
    try {
        const myRef = doc(db, "users", myUsername);
        const targetRef = doc(db, "users", targetUser);
        const targetData = allUsersData[targetUser] || {};
        
        if (targetData.isPrivate) {
            await setDoc(targetRef, { followRequests: arrayUnion(myUsername) }, { merge: true });
            alert("Hesap gizli. Takip isteği gönderildi!");
        } else {
            await setDoc(myRef, { following: arrayUnion(targetUser) }, { merge: true });
            await setDoc(targetRef, { followers: arrayUnion(myUsername) }, { merge: true });
            await addDoc(collection(db, "notifications"), { type: 'follow', sender: myUsername, recipient: targetUser, createdAt: serverTimestamp() });
        }
    } catch (e) {
        console.error("Takip etme hatası: ", e);
    }
};

function calculateTrendingTags() {
    const tagCounts = {};
    allPosts.forEach(post => {
        if (post.content) {
            const matches = post.content.match(/#([a-zA-Z0-9ğüşıöçĞÜŞİÖÇ_]+)/g);
            if (matches) { matches.forEach(tag => { const lowerTag = tag.toLowerCase(); tagCounts[lowerTag] = (tagCounts[lowerTag] || 0) + 1; }); }
        }
    });
    trendingTags = Object.keys(tagCounts).map(tag => { return { tag: tag, count: tagCounts[tag] }; }).sort((a, b) => b.count - a.count).slice(0, 15);
}

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

function fetchData() {
    onSnapshot(doc(db, "users", myUsername), (docSnap) => {
        if(docSnap.exists()) {
            const u = docSnap.data();
            allUsersData[myUsername] = u;
            myFollowing = u.following || [];
            
            const mobName = document.getElementById('sidebar-name-mobile'); if(mobName) mobName.innerText = u.fullName || myUsername;
            const mobHandle = document.getElementById('sidebar-handle-mobile'); if(mobHandle) mobHandle.innerText = '@' + myUsername;
            const mobFolCount = document.getElementById('sidebar-following-count'); if(mobFolCount) mobFolCount.innerText = myFollowing.length;
            const mobFolersCount = document.getElementById('sidebar-followers-count'); if(mobFolersCount) mobFolersCount.innerText = (u.followers || []).length;
            
            if(u.avatarUrl) {
                const imgTag = `<img src="${u.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">`;
                const hAv = document.getElementById('mobile-avatar-header'); if(hAv) hAv.innerHTML = imgTag;
                const sAv = document.getElementById('sidebar-avatar-mobile'); if(sAv) sAv.innerHTML = imgTag;
                const dAv = document.getElementById('desktop-sidebar-avatar'); if(dAv) dAv.innerHTML = imgTag;
            }
            const dName = document.getElementById('desktop-sidebar-name'); if(dName) dName.innerText = u.fullName || myUsername;
            const dHandle = document.getElementById('desktop-sidebar-handle'); if(dHandle) dHandle.innerText = '@' + myUsername;
        }
        renderWhoToFollow(); 
    });

    async function loadTrendingPosts() {
        try {
            const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(100));
            const snapshot = await getDocs(q);
            allPosts = []; 
            let neededUsers = new Set();
            snapshot.forEach(docSnap => { 
                const data = docSnap.data();
                allPosts.push(data); 
                neededUsers.add(data.author);
            }); 
            
            await window.fetchMissingUsers(Array.from(neededUsers));
            calculateTrendingTags(); 
            
            const urlParams = new URLSearchParams(window.location.search); 
            if(urlParams.get('tag') && currentTab === 'users') switchTab('tags'); else performSearch();
        } catch(error) {
            console.error("Gündem yüklenirken hata:", error);
        }
    }
    loadTrendingPosts();
}

function formatHashtags(text) { if (!text) return ""; let safeText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;"); return safeText.replace(/#([a-zA-Z0-9ğüşıöçĞÜŞİÖÇ_]+)/g, `<a href="search.html?tag=$1" class="hashtag">#$1</a>`); }

let searchTimeout = null;
searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        performSearch();
    }, 500); 
});

window.clickTrendingTag = function(tagWord) { if(searchInput) searchInput.value = tagWord; performSearch(); };

async function performSearch() {
    if(!searchInput || !resultsContainer) return;
    const typedText = searchInput.value.toLowerCase().trim(); 
    resultsContainer.innerHTML = '<div style="padding:40px; text-align:center; color:#64748b;">Aranıyor... 🔍</div>'; 

    if (typedText === '') {
        if (currentTab === 'users') {
            resultsContainer.innerHTML = '<div style="color:#64748b; padding:40px; text-align:center; font-size:15px; font-weight:500;">Aramak için bir isim yazın... 🕵️‍♂️</div>';
        } else {
            if (trendingTags.length === 0) { resultsContainer.innerHTML = '<div style="color:#64748b; padding:40px; text-align:center;">Henüz gündem oluşmamış...</div>'; return; }
            let html = ``;
            trendingTags.forEach(item => { 
                html += `<a class="trending-item" onclick="window.clickTrendingTag('${item.tag}')">
                            <div class="trend-category">Gündem</div>
                            <div class="trend-name">${item.tag}</div>
                            <div class="trend-count">${item.count} İçerik</div>
                         </a>`; 
            });
            resultsContainer.innerHTML = html;
        }
        return;
    }

    if (currentTab === 'users') {
        try {
            const q = query(collection(db, "users"), orderBy("__name__"), startAt(typedText), endAt(typedText + '\uf8ff'), limit(15));
            const querySnapshot = await getDocs(q);
            
            if (querySnapshot.empty) { resultsContainer.innerHTML = '<div style="color:#64748b; padding:40px; text-align:center;">Kişi bulunamadı...</div>'; return; }
            
            let html = '';
            querySnapshot.forEach(docSnap => {
                const user = docSnap.data();
                const username = docSnap.id;
                allUsersData[username] = user; 
                
                const avatarHtml = user.avatarUrl ? `<img src="${user.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">` : '👤';
                const fullName = user.fullName || username;
                const vHtml = user.isVerified ? '<span style="color:#1da1f2; font-size:15px; margin-left:4px;">☑️</span>' : '';
                html += `<a href="profile.html?user=${username}" class="search-user-item">
                            <div class="search-avatar">${avatarHtml}</div>
                            <div class="search-user-info">
                                <div class="search-username">${fullName} ${vHtml}</div>
                                <div class="search-handle">@${username}</div>
                            </div>
                         </a>`;
            });
            resultsContainer.innerHTML = html;
        } catch(e) { 
            console.error("Arama hatası:", e); 
            resultsContainer.innerHTML = '<div style="color:#ef4444; padding:40px; text-align:center;">Arama yapılamadı.</div>'; 
        }
    } else {
        const searchTag = typedText.startsWith('#') ? typedText : `#${typedText}`;
        const filteredPosts = allPosts.filter(post => post.content && post.content.toLowerCase().includes(searchTag));
        
        if (filteredPosts.length === 0) { resultsContainer.innerHTML = '<div style="color:#64748b; padding:40px; text-align:center;">Bu etikete sahip içerik yok...</div>'; return; }
        
        let neededUsers = new Set();
        filteredPosts.forEach(p => neededUsers.add(p.author));
        await window.fetchMissingUsers(Array.from(neededUsers));

        let html = '';
        filteredPosts.forEach(post => {
            const cleanContent = DOMPurify.sanitize(post.content || '');
            const formattedContent = formatHashtags(cleanContent);
            const authorData = allUsersData[post.author] || {};
            const vHtml = authorData.isVerified ? '<span style="color:#1da1f2; font-size:14px; margin-left:4px;">☑️</span>' : '';
            const fullName = authorData.fullName || post.author;
            const avatarImg = authorData.avatarUrl ? `<img src="${authorData.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">` : `👤`;
            
            let locationHtml = post.location ? `<span style="font-size:13px; color:#3b82f6; margin-left:8px;">📍 ${post.location}</span>` : '';
            
            html += `
                <div class="post" onclick="window.location.href='profile.html?user=${post.author}'">
                    <div class="post-left"><div class="post-avatar-img">${avatarImg}</div></div>
                    <div class="post-right">
                        <div class="post-header-info">
                            <div class="author-group"><span class="author-name">${fullName}</span>${vHtml} <span class="author-username">@${post.author}</span> ${locationHtml}</div>
                        </div>
                        <div class="post-content">${formattedContent}</div>
                    </div>
                </div>
            `;
        });
        resultsContainer.innerHTML = html;
    }
}