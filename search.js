import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { collection, onSnapshot, query, orderBy, doc, setDoc, arrayUnion, addDoc, serverTimestamp, where, getDoc, limit, startAt, endAt, getDocs } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import './shared.js';

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
        window.myUsername = myUsername; window.allUsersData = allUsersData;
        fetchData();
        
        onSnapshot(query(collection(db, "chats"), where("participants", "array-contains", myUsername)), (snapshot) => { 
            activeChats = activeChats.filter(c => c.type === 'group'); 
            snapshot.forEach(docSnap => { activeChats.push({ id: docSnap.id, ...docSnap.data(), type:'private' }); }); 
            window.attachCallListeners(activeChats); 
        });
        onSnapshot(query(collection(db, "groups"), where("members", "array-contains", myUsername)), (snapshot) => { 
            activeChats = activeChats.filter(c => c.type === 'private'); 
            snapshot.forEach(docSnap => { activeChats.push({ id: docSnap.id, ...docSnap.data(), type:'group' }); }); 
            window.attachCallListeners(activeChats); 
        });

    } else { window.location.href = "index.html"; }
});


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
        const avatarHtml = uData.avatarUrl ? `<img src="${window.sanitizeUrl(uData.avatarUrl)}" style="width:100%;height:100%;object-fit:cover;">` : `👤`;
        const fullName = window.escapeHtml(uData.fullName || uid);
        const vHtml = uData.isVerified ? '<span style="color:#1da1f2; font-size:14px; margin-left:4px;">☑️</span>' : '';
        
        html += `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-top:15px; cursor:pointer; padding: 8px; border-radius: 8px; transition: 0.2s;" class="user-row" onclick="window.location.href='profile.html?user=${window.escapeHtml(uid)}'">
                <div style="display:flex; align-items:center; gap:10px; overflow:hidden;">
                    <div style="width:40px; height:40px; border-radius:8px; background:#e2e8f0; overflow:hidden; display:flex; justify-content:center; align-items:center; font-size:20px; flex-shrink:0; border: 1px solid #cbd5e1;">${avatarHtml}</div>
                    <div style="overflow:hidden;">
                        <div style="font-weight:700; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#0f172a;">${fullName} ${vHtml}</div>
                        <div style="color:#64748b; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">@${window.escapeHtml(uid)}</div>
                    </div>
                </div>
                <button onclick="event.stopPropagation(); window.quickFollow('${window.escapeHtml(uid)}')" style="background:#f1f5f9; color:#0f172a; border:1px solid #cbd5e1; padding:6px 12px; border-radius:6px; font-weight:600; cursor:pointer; flex-shrink:0; transition:0.2s; font-size:13px;">Ekle</button>
            </div>
        `;
    });
    container.innerHTML = html;
}


// 🚀 GÜVENLİ GÜNCELLEME: `post.content` ve `post.text` için koruma eklendi
function calculateTrendingTags() {
    const tagCounts = {};
    allPosts.forEach(post => {
        const postText = post.content || post.text || ""; // Hem content hem text alanını kontrol et
        if (postText) {
            const matches = postText.match(/#([a-zA-Z0-9ğüşıöçĞÜŞİÖÇ_]+)/g);
            if (matches) { matches.forEach(tag => { const lowerTag = tag.toLowerCase(); tagCounts[lowerTag] = (tagCounts[lowerTag] || 0) + 1; }); }
        }
    });
    trendingTags = Object.keys(tagCounts).map(tag => { return { tag: tag, count: tagCounts[tag] }; }).sort((a, b) => b.count - a.count).slice(0, 15);
}



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
                const imgTag = `<img src="${window.sanitizeUrl(u.avatarUrl)}" style="width:100%;height:100%;object-fit:cover;">`;
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
            const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(25));
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
            console.error("Gündem yükleme hatası:", error.code || "Bilinmeyen hata");
        }
    }
    loadTrendingPosts();
}

// 🚀 GÜVENLİ GÜNCELLEME: `text` değişkeninin mutlaka String formunda olmasını sağlıyoruz
function formatHashtags(text) { 
    if (!text) return ""; 
    let safeText = String(text).replace(/</g, "&lt;").replace(/>/g, "&gt;"); 
    return safeText.replace(/#([a-zA-Z0-9ğüşıöçĞÜŞİÖÇ_]+)/g, `<a href="search.html?tag=$1" class="hashtag">#$1</a>`); 
}

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
                
                const avatarHtml = user.avatarUrl ? `<img src="${window.sanitizeUrl(user.avatarUrl)}" style="width:100%;height:100%;object-fit:cover;">` : '👤';
                const fullName = window.escapeHtml(user.fullName || username);
                const vHtml = user.isVerified ? '<span style="color:#1da1f2; font-size:15px; margin-left:4px;">☑️</span>' : '';
                html += `<a href="profile.html?user=${window.escapeHtml(username)}" class="search-user-item">
                            <div class="search-avatar">${avatarHtml}</div>
                            <div class="search-user-info">
                                <div class="search-username">${fullName} ${vHtml}</div>
                                <div class="search-handle">@${window.escapeHtml(username)}</div>
                            </div>
                         </a>`;
            });
            resultsContainer.innerHTML = html;
        } catch(e) { 
            console.error("Arama hatası:", e.code || "Bilinmeyen hata"); 
            resultsContainer.innerHTML = '<div style="color:#ef4444; padding:40px; text-align:center;">Arama yapılamadı.</div>'; 
        }
    } else {
        const searchTag = typedText.startsWith('#') ? typedText : `#${typedText}`;
        
        // 🚀 GÜVENLİ GÜNCELLEME: `post.content` ve `post.text` için koruma eklendi
        const filteredPosts = allPosts.filter(post => {
            const pText = post.content || post.text || "";
            return pText && pText.toLowerCase().includes(searchTag);
        });
        
        if (filteredPosts.length === 0) { resultsContainer.innerHTML = '<div style="color:#64748b; padding:40px; text-align:center;">Bu etikete sahip içerik yok...</div>'; return; }
        
        let neededUsers = new Set();
        filteredPosts.forEach(p => neededUsers.add(p.author));
        await window.fetchMissingUsers(Array.from(neededUsers));

        let html = '';
        filteredPosts.forEach(post => {
            // 🚀 GÜVENLİ GÜNCELLEME: Hem content hem text koruması
            const cleanContent = DOMPurify.sanitize(post.content || post.text || '');
            const formattedContent = formatHashtags(cleanContent);
            const authorData = allUsersData[post.author] || {};
            const vHtml = authorData.isVerified ? '<span style="color:#1da1f2; font-size:14px; margin-left:4px;">☑️</span>' : '';
            const fullName = window.escapeHtml(authorData.fullName || post.author);
            const avatarImg = authorData.avatarUrl ? `<img src="${window.sanitizeUrl(authorData.avatarUrl)}" style="width:100%;height:100%;object-fit:cover;">` : `👤`;
            
            let locationHtml = post.location ? `<span style="font-size:13px; color:#3b82f6; margin-left:8px;">📍 ${window.escapeHtml(post.location)}</span>` : '';
            
            html += `
                <div class="post" onclick="window.location.href='profile.html?user=${window.escapeHtml(post.author)}'">
                    <div class="post-left"><div class="post-avatar-img">${avatarImg}</div></div>
                    <div class="post-right">
                        <div class="post-header-info">
                            <div class="author-group"><span class="author-name">${fullName}</span>${vHtml} <span class="author-username">@${window.escapeHtml(post.author)}</span> ${locationHtml}</div>
                        </div>
                        <div class="post-content">${formattedContent}</div>
                    </div>
                </div>
            `;
        });
        resultsContainer.innerHTML = html;
    }
}