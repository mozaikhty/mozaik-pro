import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, updateDoc, onSnapshot, query, orderBy, serverTimestamp, getDoc, doc, where, arrayUnion, arrayRemove, deleteDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";
import { auth, db, storage } from './firebase-config.js';

let currentUser = null; let myUsername = null; let chatId = null; let isGroupChat = false;
let allUsersData = {}; let activeChats = []; let myFollowing = [];
let currentReplyData = null; let typingTimeout = null;
let currentInboxTab = 'all'; 

// Firebase dinleyici (Listener) sızıntılarını önlemek için temizleme değişkenleri
let unsubscribeMessages = null;
let unsubscribeChatMeta = null;

let callListeners = {};
let peerConnection; let localStream; let remoteStream; let currentCallDocId = null; let currentCallChatId = null; let currentCallCollection = null; let isCallVideo = false;
const callOverlay = document.getElementById('call-overlay'); const localVideo = document.getElementById('local-video'); const remoteVideo = document.getElementById('remote-video');

const servers = { 
    iceServers: [
        { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
        { urls: "turn:a.relay.metered.ca:80", username: "5e02baae988ebf25bd9eec65", credential: "q/9eO+rV0H/sA75Q" },
        { urls: "turn:a.relay.metered.ca:443", username: "5e02baae988ebf25bd9eec65", credential: "q/9eO+rV0H/sA75Q" },
        { urls: "turn:a.relay.metered.ca:443?transport=tcp", username: "5e02baae988ebf25bd9eec65", credential: "q/9eO+rV0H/sA75Q" }
    ] 
};

const urlParams = new URLSearchParams(window.location.search);
const targetUsername = urlParams.get('user');
const targetGroupId = urlParams.get('group');

// Arama kutularının performansı için Debounce (Gecikme) fonksiyonu
function debounce(func, delay) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

// UI Yönlendirmeleri
window.goToChatProfile = function() {
    if (!isGroupChat && targetUsername) { window.location.href = 'profile.html?user=' + targetUsername; }
};
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
    if(btn) { btn.disabled = true; btn.innerText = "Gönderiliyor..."; }

    try {
        await addDoc(collection(db, "tickets"), {
            sender: myUsername || "Bilinmeyen Kullanıcı",
            message: DOMPurify.sanitize(message),
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

window.showMyFollowing = function() {
    window.closeMobileSidebar();
    if (allUsersData[myUsername]) { window.showUserList("Ağım", allUsersData[myUsername].following || []); }
};
window.showMyFollowers = function() {
    window.closeMobileSidebar();
    if (allUsersData[myUsername]) { window.showUserList("Takipçiler", allUsersData[myUsername].followers || []); }
};

window.showUserList = function(title, userArray) {
    const titleEl = document.getElementById('users-list-title'); if(titleEl) titleEl.innerText = title;
    const container = document.getElementById('users-list-container'); if(!container) return;
    let html = '';
    if(userArray.length === 0) { html = '<p style="text-align:center; color:#64748b; padding:20px;">Henüz kimse yok.</p>'; } 
    else {
        userArray.forEach(uname => {
            let uData = allUsersData[uname] || {}; let avatarHtml = uData.avatarUrl ? `<img src="${uData.avatarUrl}">` : `👤`; let vHtml = uData.isVerified ? '<span class="verified-badge" style="font-size:14px; margin-left:4px;">☑️</span>' : '';
            let safeName = DOMPurify.sanitize(uData.fullName || uname);
            html += `<a href="profile.html?user=${uname}" class="user-row"><div class="row-avatar">${avatarHtml}</div><div><div style="font-weight:700; color:#0f172a;">${safeName} ${vHtml}</div><div style="font-size:13px; color:#64748b;">@${uname}</div></div></a>`;
        });
    }
    container.innerHTML = html;
    document.getElementById('users-list-modal').style.display = 'flex';
};
document.getElementById('close-list-btn')?.addEventListener('click', () => { document.getElementById('users-list-modal').style.display = 'none'; });

window.showNewChatScreen = function() {
    const emptyState = document.getElementById('chat-empty-state'); if(emptyState) emptyState.style.display = 'none';
    const chatView = document.getElementById('chat-view'); if(chatView) chatView.style.display = 'none';
    const newChatState = document.getElementById('new-chat-state'); if(newChatState) newChatState.style.display = 'flex';
    document.body.classList.add('chat-active');
};
window.closeNewChatScreen = function() {
    const newChatState = document.getElementById('new-chat-state'); if(newChatState) newChatState.style.display = 'none';
    const emptyState = document.getElementById('chat-empty-state'); if(emptyState) emptyState.style.display = 'flex';
    document.body.classList.remove('chat-active');
};

document.querySelectorAll('#inbox-tabs .feed-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        document.querySelectorAll('#inbox-tabs .feed-tab').forEach(t => t.classList.remove('active'));
        const target = e.currentTarget;
        target.classList.add('active');
        currentInboxTab = target.getAttribute('data-tab');
        updateInboxDisplay();
    });
});

document.getElementById('open-emoji-btn')?.addEventListener('click', () => {
    const picker = document.getElementById('chat-emoji-picker');
    if(picker) picker.style.display = picker.style.display === 'none' ? 'flex' : 'none';
});
document.querySelectorAll('#chat-emoji-picker .emoji-item').forEach(el => {
    el.addEventListener('click', (e) => {
        const input = document.getElementById('msg-input');
        if(input) input.value += e.target.innerText;
        const sBtn = document.getElementById('send-btn');
        if(sBtn) sBtn.disabled = false;
    });
});
document.addEventListener('click', function(event) {
    const btn = document.getElementById('open-emoji-btn');
    const picker = document.getElementById('chat-emoji-picker');
    if (btn && picker && !btn.contains(event.target) && !picker.contains(event.target)) {
        picker.style.display = 'none';
    }
});

document.getElementById('chat-image-input')?.addEventListener('change', (e) => {
    if(e.target.files.length > 0) { 
        const sBtn = document.getElementById('send-btn'); if(sBtn) sBtn.disabled = false; 
        const uploadLabel = document.getElementById('img-upload-label'); if(uploadLabel) uploadLabel.style.color = '#10b981'; 
    }
});
document.getElementById('msg-input')?.addEventListener('input', (e) => {
    const sBtn = document.getElementById('send-btn');
    const imgInp = document.getElementById('chat-image-input');
    if(e.target.value.trim().length > 0) {
        if(sBtn) sBtn.disabled = false;
    } else if (imgInp && imgInp.files.length === 0) {
        if(sBtn) sBtn.disabled = true;
    }
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user; myUsername = user.displayName || localStorage.getItem('mozaik_username') || user.email.split('@')[0];
        
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
                myFollowing = u.following || [];
                
                await window.fetchMissingUsers(myFollowing);
                
                const mobName = document.getElementById('sidebar-name-mobile'); if(mobName) mobName.innerText = u.fullName || myUsername;
                const mobHandle = document.getElementById('sidebar-handle-mobile'); if(mobHandle) mobHandle.innerText = '@' + myUsername;
                const mobFolCount = document.getElementById('sidebar-following-count'); if(mobFolCount) mobFolCount.innerText = myFollowing.length;
                const mobFolersCount = document.getElementById('sidebar-followers-count'); if(mobFolersCount) mobFolersCount.innerText = (u.followers || []).length;
                
                if(u.avatarUrl) {
                    const imgTag = `<img src="${u.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">`;
                    const mobAv = document.getElementById('mobile-avatar-header'); if(mobAv) mobAv.innerHTML = imgTag;
                    const sideAv = document.getElementById('sidebar-avatar-mobile'); if(sideAv) sideAv.innerHTML = imgTag;
                    const deskAv = document.getElementById('desktop-sidebar-avatar'); if(deskAv) deskAv.innerHTML = imgTag;
                }
                const deskName = document.getElementById('desktop-sidebar-name'); if(deskName) deskName.innerText = u.fullName || myUsername;
                const deskHandle = document.getElementById('desktop-sidebar-handle'); if(deskHandle) deskHandle.innerText = '@' + myUsername;
            }
            updateInboxDisplay(); 
        });
        
        onSnapshot(query(collection(db, "chats"), where("participants", "array-contains", myUsername)), async (snapshot) => { 
            activeChats = activeChats.filter(c => c.type === 'group'); 
            let neededUsers = new Set();
            snapshot.forEach(docSnap => { 
                const data = docSnap.data();
                activeChats.push({ id: docSnap.id, ...data, type:'private' }); 
                if(data.participants) data.participants.forEach(p => neededUsers.add(p));
            }); 
            await window.fetchMissingUsers(Array.from(neededUsers));
            updateInboxDisplay(); 
            attachCallListeners(); 
        });

        onSnapshot(query(collection(db, "groups"), where("members", "array-contains", myUsername)), async (snapshot) => { 
            activeChats = activeChats.filter(c => c.type === 'private'); 
            let neededUsers = new Set();
            snapshot.forEach(docSnap => { 
                const data = docSnap.data();
                activeChats.push({ id: docSnap.id, ...data, type:'group' }); 
                if(data.members) data.members.forEach(m => neededUsers.add(m));
            }); 
            await window.fetchMissingUsers(Array.from(neededUsers));
            updateInboxDisplay(); 
            attachCallListeners(); 
        });

        if (targetUsername || targetGroupId) {
            document.body.classList.add('chat-active');
            const emptyState = document.getElementById('chat-empty-state'); if(emptyState) emptyState.style.display = 'none';
            const newChatState = document.getElementById('new-chat-state'); if(newChatState) newChatState.style.display = 'none';
            const chatView = document.getElementById('chat-view'); if(chatView) chatView.style.display = 'flex';
            setupActiveChat();
        }

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
                        const callStatus = document.getElementById('call-status-text'); if(callStatus) callStatus.innerText = `@${callData.caller} Arıyor...`;
                        const acceptBtn = document.getElementById('accept-call-btn'); if(acceptBtn) acceptBtn.style.display = 'block';
                        if(callOverlay) callOverlay.style.display = 'flex';
                        const vCont = document.getElementById('video-container'); if(vCont) vCont.style.display = isCallVideo ? 'flex' : 'none';
                    }
                    if (change.type === 'modified' && callData.status === 'answered' && callData.caller === myUsername && currentCallDocId === change.doc.id) {
                        const callStatus = document.getElementById('call-status-text'); if(callStatus) callStatus.innerText = "Bağlandı";
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

document.getElementById('dm-search-input')?.addEventListener('input', debounce(updateInboxDisplay, 300));

function updateInboxDisplay() {
    const text = document.getElementById('dm-search-input')?.value.toLowerCase().trim() || "";
    const container = document.getElementById('dm-list'); 
    if(!container) return;
    
    let html = ''; 
    
    let allConversations = [...activeChats];
    allConversations.sort((a, b) => { let timeA = a.updatedAt ? a.updatedAt.toMillis() : 0; let timeB = b.updatedAt ? b.updatedAt.toMillis() : 0; return timeB - timeA; });
    
    let filteredConversations = allConversations.filter(conv => {
        let isUnread = false;
        if (conv.unreadBy && conv.unreadBy.includes(myUsername)) { isUnread = true; }
        else if (!conv.unreadBy && conv.lastSender && conv.lastSender !== myUsername) { isUnread = true; }

        if (currentInboxTab === 'unread') return isUnread;
        if (currentInboxTab === 'groups') return conv.type === 'group';
        return true; 
    });

    if(text) { 
        filteredConversations = filteredConversations.filter(c => { 
            if(c.type === 'group') return c.name.toLowerCase().includes(text); 
            if(c.type === 'private') { const otherUser = c.participants.find(p => p !== myUsername); return otherUser && otherUser.toLowerCase().includes(text); } 
            return false; 
        }); 
    }

    if (filteredConversations.length > 0) {
        filteredConversations.forEach(conv => {
            let title = ''; let avatar = ''; let link = '';
            
            let isUnread = false;
            if (conv.unreadBy && conv.unreadBy.includes(myUsername)) { isUnread = true; }
            else if (!conv.unreadBy && conv.lastSender && conv.lastSender !== myUsername) { isUnread = true; }

            let timeAgoStr = ""; if(conv.updatedAt) { const date = conv.updatedAt.toDate(); timeAgoStr = date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0'); }

            if (conv.type === 'private') {
                const otherUser = conv.participants.find(p => p !== myUsername); const uData = allUsersData[otherUser] || {};
                title = DOMPurify.sanitize(`${uData.fullName || otherUser}`);
                title += uData.isVerified ? '<span style="color:#3b82f6; font-size:14px; margin-left:4px;">☑️</span>' : '';
                avatar = uData.avatarUrl ? `<img src="${uData.avatarUrl}">` : '👤'; link = `chat.html?user=${otherUser}`;
            } else {
                title = DOMPurify.sanitize(conv.name); 
                avatar = `<div style="background:#10b981; color:white; width:100%; height:100%; display:flex; align-items:center; justify-content:center;">👥</div>`; link = `chat.html?group=${conv.id}`;
            }
            
            let lastMsgText = conv.lastMessage || 'Sohbet başlatıldı'; 
            if(lastMsgText.includes('https://firebasestorage.googleapis.com')) lastMsgText = '📷 Fotoğraf';
            let subtitleHtml = isUnread ? `<span class="unread-text">${DOMPurify.sanitize(lastMsgText)}</span> <div class="unread-dot"></div>` : `<span class="read-text">${DOMPurify.sanitize(lastMsgText)}</span>`;
            const isActive = (targetUsername && link.includes(targetUsername)) || (targetGroupId && link.includes(targetGroupId));
            
            html += `<a href="${link}" class="dm-user-card ${isActive ? 'active' : ''}"><div class="dm-avatar">${avatar}</div><div class="dm-info"><div class="dm-username">${title}</div><div class="dm-subtitle">${subtitleHtml}</div></div><div class="time-badge">${timeAgoStr}</div></a>`;
        });
    } else { html = '<p style="text-align:center; color:#64748b; padding:20px;">Sohbet bulunamadı.</p>'; }
    
    container.innerHTML = html;
}

document.getElementById('new-chat-search')?.addEventListener('input', debounce((e) => {
    const text = e.target.value.toLowerCase().trim(); const container = document.getElementById('new-chat-results'); if(!container) return;
    let html = '';
    if(!text) { container.innerHTML = ''; return; }
    
    const searchResults = Object.keys(allUsersData).filter(uid => uid !== myUsername && uid.toLowerCase().includes(text));
    if (searchResults.length > 0) {
        searchResults.forEach(uid => {
            const uData = allUsersData[uid] || {}; const avatar = uData.avatarUrl ? `<img src="${uData.avatarUrl}">` : '👤';
            const safeTitle = DOMPurify.sanitize(uData.fullName || uid);
            const title = `${safeTitle} ${uData.isVerified ? '<span style="color:#3b82f6; font-size:14px; margin-left:4px;">☑️</span>' : ''}`;
            html += `<label class="group-user-label" onclick="window.location.href='chat.html?user=${uid}'"><div style="display:flex; align-items:center; gap:10px;"><div style="width:36px; height:36px; border-radius:8px; overflow:hidden; border:1px solid #cbd5e1;">${avatar}</div>${title}</div></label>`;
        });
    }
    container.innerHTML = html;
}, 300));

const openGroupModalBtn = document.getElementById('open-group-modal');
if (openGroupModalBtn) {
    openGroupModalBtn.addEventListener('click', () => {
        const groupModal = document.getElementById('group-modal'); if(groupModal) groupModal.style.display = 'flex';
        const listDiv = document.getElementById('group-users-list'); if(!listDiv) return;
        
        let html = '';
        if(myFollowing.length === 0) { listDiv.innerHTML = '<div style="padding:10px; color:#64748b; text-align:center;">Önce ağınıza birilerini eklemelisiniz!</div>'; return; }
        myFollowing.forEach(uid => {
            const uData = allUsersData[uid] || {}; const avatar = uData.avatarUrl ? `<img src="${uData.avatarUrl}" style="width:100%; height:100%; object-fit:cover;">` : '👤';
            html += `<label class="group-user-label"><div style="display:flex; align-items:center; gap:10px;"><div style="width:36px; height:36px; border-radius:8px; overflow:hidden; border:1px solid #cbd5e1;">${avatar}</div>@${uid}</div><input type="checkbox" class="group-member-checkbox" value="${uid}" style="width:18px; height:18px;"></label>`;
        });
        listDiv.innerHTML = html;
    });
}

document.getElementById('create-group-btn')?.addEventListener('click', async () => {
    const groupNameInp = document.getElementById('group-name-input');
    const groupName = groupNameInp ? groupNameInp.value.trim() : '';
    const selectedCheckboxes = document.querySelectorAll('.group-member-checkbox:checked');
    if(!groupName || selectedCheckboxes.length === 0) return alert("İsim ve en az 1 kişi gerekli!");
    const members = [myUsername, ...Array.from(selectedCheckboxes).map(cb => cb.value)]; 
    const btn = document.getElementById('create-group-btn'); if(btn) { btn.disabled = true; btn.innerText = "Oluşturuluyor..."; }
    try {
        const newGroupRef = await addDoc(collection(db, "groups"), { 
            name: DOMPurify.sanitize(groupName),
            members: members, 
            createdBy: myUsername, 
            lastMessage: 'Grup oluşturuldu', 
            lastSender: myUsername, 
            updatedAt: serverTimestamp() 
        });
        window.location.href = `chat.html?group=${newGroupRef.id}`;
    } catch(e) { alert("Hata!"); if(btn) { btn.disabled = false; btn.innerText = "Grubu Oluştur"; } }
});

async function setupActiveChat() {
    if (unsubscribeChatMeta) { unsubscribeChatMeta(); unsubscribeChatMeta = null; }
    if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; }

    if (targetUsername) {
        isGroupChat = false; chatId = [myUsername, targetUsername].sort().join('_');
        const addMemBtn = document.getElementById('add-member-btn'); if(addMemBtn) addMemBtn.style.display = 'none';
        try { 
            const uSnap = await getDoc(doc(db, "users", targetUsername)); 
            if (uSnap.exists()) {
                const data = uSnap.data();
                const safeName = DOMPurify.sanitize(data.fullName || targetUsername);
                const uText = document.getElementById('chat-username-text'); if(uText) uText.innerHTML = `${safeName} ${data.isVerified ? '<span style="color:#3b82f6; font-size:16px;">☑️</span>' : ''}`;
                const cSub = document.getElementById('chat-subtitle'); if(cSub) cSub.innerText = `@${targetUsername}`;
                const cAv = document.getElementById('chat-avatar'); if (data.avatarUrl && cAv) cAv.innerHTML = `<img src="${data.avatarUrl}">`; 
            }
        } catch(e) {}
    } else if (targetGroupId) {
        isGroupChat = true; chatId = targetGroupId;
        const cAv = document.getElementById('chat-avatar'); if(cAv) cAv.innerHTML = `👥`;
        const addMemBtn = document.getElementById('add-member-btn'); if(addMemBtn) addMemBtn.style.display = 'flex';
        try {
            const gSnap = await getDoc(doc(db, "groups", targetGroupId));
            if (gSnap.exists()) {
                const gData = gSnap.data(); 
                const uText = document.getElementById('chat-username-text'); if(uText) uText.innerText = DOMPurify.sanitize(gData.name);
                const otherMembers = gData.members.filter(m => m !== myUsername).join(', ');
                const cSub = document.getElementById('chat-subtitle'); if(cSub) cSub.innerText = `Sen, ${otherMembers}`;
            } else { alert("Grup bulunamadı!"); window.location.href = "chat.html"; }
        } catch(e) {}
    }

    const colName = isGroupChat ? "groups" : "chats";

    updateDoc(doc(db, colName, chatId), {
        unreadBy: arrayRemove(myUsername)
    }).catch(e=>{});

    unsubscribeChatMeta = onSnapshot(doc(db, colName, chatId), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data(); const typingObj = data.typing || {}; let typingUsers = [];
            for (let usr in typingObj) { if (usr !== myUsername && typingObj[usr] === true) typingUsers.push(usr); }
            const indicator = document.getElementById('typing-indicator'); const subtitle = document.getElementById('chat-subtitle');
            if (typingUsers.length > 0) { 
                if(subtitle) subtitle.style.display = 'none'; 
                if(indicator) {
                    indicator.style.display = 'flex'; 
                    indicator.innerHTML = `<span>${isGroupChat ? typingUsers.join(', ') + ' yazıyor...' : 'yazıyor...'}</span>`;
                } 
            } 
            else { 
                if(indicator) indicator.style.display = 'none'; 
                if(subtitle) subtitle.style.display = 'block'; 
            }
        }
    });

    loadMessages();
}

document.getElementById('delete-chat-btn')?.addEventListener('click', async () => {
    if(confirm("Sohbeti kalıcı olarak silmek istediğinize emin misiniz?")) {
        await deleteDoc(doc(db, isGroupChat ? "groups" : "chats", chatId)); window.location.href = "chat.html";
    }
});

window.prepareReply = function(msgId, sender, text) {
    let summary = text; if (text.includes('firebasestorage.googleapis.com')) summary = '📷 Fotoğraf';
    currentReplyData = { id: msgId, sender: sender, text: summary };
    const rpSender = document.getElementById('reply-preview-sender'); if(rpSender) rpSender.innerText = sender;
    const rpMsg = document.getElementById('reply-preview-msg'); if(rpMsg) rpMsg.innerText = summary.length > 50 ? summary.substring(0, 50) + "..." : summary;
    const rpBox = document.getElementById('reply-preview-box'); if(rpBox) rpBox.style.display = 'flex';
    const mInput = document.getElementById('msg-input'); if(mInput) mInput.focus();
};

window.cancelReply = function() { 
    currentReplyData = null; 
    const rpBox = document.getElementById('reply-preview-box'); if(rpBox) rpBox.style.display = 'none'; 
};
document.getElementById('cancel-reply-btn')?.addEventListener('click', window.cancelReply);

window.deleteMessage = async function(msgId) {
    if(confirm("Silmek istediğinize emin misiniz?")) { 
        const colName = isGroupChat ? "groups" : "chats";
        await deleteDoc(doc(db, colName, chatId, "messages", msgId)); 
    }
};

window.editMessage = async function(msgId, oldText, timeMillis) {
    const now = Date.now();
    if (now - timeMillis > 900000) { alert("Sadece son 15 dakika içinde gönderilen mesajları düzenleyebilirsiniz!"); return; }
    const newText = prompt("Düzenleyin:", oldText);
    if (newText !== null && newText.trim() !== "" && newText !== oldText) { 
        const colName = isGroupChat ? "groups" : "chats";
        await updateDoc(doc(db, colName, chatId, "messages", msgId), { text: newText.trim(), isEdited: true }); 
    }
};

function loadMessages() {
    const collectionName = isGroupChat ? "groups" : "chats";
    const messagesRef = collection(db, collectionName, chatId, "messages");
    
    unsubscribeMessages = onSnapshot(query(messagesRef, orderBy("createdAt", "asc")), (snapshot) => {
        const messagesContainer = document.getElementById('chat-messages');
        if(!messagesContainer) return;
        
        let html = '';

        snapshot.forEach((docSnap) => {
            let data = docSnap.data(); 
            if(data.text) data.text = DOMPurify.sanitize(data.text);
            if(data.replyTo && data.replyTo.text) data.replyTo.text = DOMPurify.sanitize(data.replyTo.text);
            const isMe = data.sender === myUsername;
            
            let timeString = ''; let timeMillis = 0;
            if (data.createdAt) {
                const date = data.createdAt.toDate(); timeMillis = data.createdAt.toMillis();
                timeString = date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
            }

            if (data.type === 'system') {
                const icon = data.text.includes('görüntülü') ? '📹' : '📞';
                html += `<div class="system-message"><span>${icon} ${DOMPurify.sanitize(data.text)} - ${timeString}</span></div>`;
                return; 
            }

            if (!isMe && !data.isRead) { 
                updateDoc(doc(db, collectionName, chatId, "messages", docSnap.id), { isRead: true }).catch(e=>{}); 
            }

            let senderNameHtml = ''; if (isGroupChat && !isMe) senderNameHtml = `<div class="msg-sender-name">@${data.sender}</div>`;

            let tickHtml = '';
            if (isMe) {
                let isRead = false; if (isGroupChat) isRead = data.readBy && data.readBy.length > 0; else isRead = data.isRead === true;
                tickHtml = `<span class="msg-tick" style="color:${isRead ? '#6ee7b7' : 'rgba(255,255,255,0.6)'};" title="${isRead ? 'Görüldü' : 'İletildi'}">${isRead ? '✓✓' : '✓'}</span>`;
            }

            let replyHtml = ''; if (data.replyTo) replyHtml = `<div class="quoted-msg"><b>@${data.replyTo.sender}</b>: ${data.replyTo.text}</div>`;
            let imageHtml = ''; if (data.imageUrl) imageHtml = `<img src="${data.imageUrl}" class="msg-image">`;
            const safeText = data.text ? data.text.replace(/'/g, "\\'").replace(/"/g, '&quot;') : '';
            
            let actionsHtml = `<div class="msg-actions">`;
            actionsHtml += `<span class="action-link" onclick="window.prepareReply('${docSnap.id}', '${data.sender}', '${safeText}')">Yanıtla</span>`;
            if (isMe) {
                if(!data.imageUrl) actionsHtml += `<span class="action-link" onclick="window.editMessage('${docSnap.id}', '${safeText}', ${timeMillis})">Düzenle</span>`;
                actionsHtml += `<span class="action-link danger" onclick="window.deleteMessage('${docSnap.id}')">Sil</span>`;
            }
            actionsHtml += `</div>`;

            html += `
                <div class="message-wrapper ${isMe ? 'wrapper-me' : 'wrapper-them'}">
                    ${senderNameHtml}
                    <div class="message-bubble ${isMe ? 'msg-me' : 'msg-them'}">
                        ${replyHtml}
                        ${imageHtml}
                        ${data.text ? `<div>${data.text}</div>` : ''}
                        <div class="msg-meta">
                            ${data.isEdited ? '<span class="msg-edited">(düzenlendi)</span>' : ''}
                            <div class="msg-time">${timeString}</div>
                            ${tickHtml}
                        </div>
                    </div>
                    ${actionsHtml}
                </div>
            `;
        });
        messagesContainer.innerHTML = html;
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
}

const msgInput = document.getElementById('msg-input');
const sendBtn = document.getElementById('send-btn');
const imgInput = document.getElementById('chat-image-input');

msgInput?.addEventListener('input', () => {
    if (!chatId) return;
    const chatRef = doc(db, isGroupChat ? "groups" : "chats", chatId);
    updateDoc(chatRef, { [`typing.${myUsername}`]: true }).catch(e=>{});
    clearTimeout(typingTimeout); typingTimeout = setTimeout(() => { updateDoc(chatRef, { [`typing.${myUsername}`]: false }).catch(e=>{}); }, 1500);
});

async function sendMessage() {
    if(!msgInput) return;
    const text = msgInput.value.trim(); 
    const file = imgInput ? imgInput.files[0] : null;
    if (!text && !file) return;

    if (file && file.size > 5 * 1024 * 1024) {
        alert("Göndermek istediğiniz fotoğraf 5 MB'dan büyük olamaz!");
        if(imgInput) imgInput.value = ''; 
        const upLabel = document.getElementById('img-upload-label'); if(upLabel) upLabel.style.color = '#64748b'; 
        if (text.length === 0 && sendBtn) sendBtn.disabled = true;
        return; 
    }

    if(sendBtn) sendBtn.disabled = true; 
    msgInput.value = ''; 
    const picker = document.getElementById('chat-emoji-picker'); if(picker) picker.style.display = 'none';
    const uploadLabel = document.getElementById('img-upload-label'); if(uploadLabel) uploadLabel.style.color = '#64748b';
    
    try {
        let imgUrl = null;
        if(file) {
            const fileName = `chats/${Date.now()}_${file.name}`;
            const storageRef = ref(storage, fileName);
            await uploadBytes(storageRef, file);
            imgUrl = await getDownloadURL(storageRef);
        }
        
        await sendActualMessage(text, imgUrl);
    } catch(e) {
        console.error("Mesaj gönderim hatası:", e);
        alert("Mesaj gönderilirken hata oluştu!");
    }
    
    if(sendBtn) sendBtn.disabled = false; 
    msgInput.focus(); 
    if(imgInput) imgInput.value = ''; 
    window.cancelReply();
}

async function sendActualMessage(text, imgUrl) {
    const collectionName = isGroupChat ? "groups" : "chats";
    const chatRef = doc(db, collectionName, chatId);
    const messagesRef = collection(db, collectionName, chatId, "messages");
    
    let finalTxt = text; if(!text && imgUrl) finalTxt = "📷 Fotoğraf";
    
    const msgData = { 
        text: finalTxt, sender: myUsername, createdAt: serverTimestamp(), imageUrl: imgUrl,
        replyTo: currentReplyData ? { sender: currentReplyData.sender, text: currentReplyData.text } : null,
        isEdited: false, isRead: false, type: 'regular'
    };

    let summary = text; if(imgUrl) summary = "📷 Fotoğraf";
    
    let unreadList = [];
    if (!isGroupChat) {
        unreadList = [targetUsername];
    } else {
        const group = activeChats.find(c => c.id === chatId);
        if (group) unreadList = group.members.filter(m => m !== myUsername);
    }

    const updateData = { lastMessage: summary, lastSender: myUsername, unreadBy: unreadList, updatedAt: serverTimestamp() };

    try {
        if (!isGroupChat) {
            await setDoc(chatRef, { participants: [myUsername, targetUsername], ...updateData }, { merge: true });
        } else {
            await updateDoc(chatRef, updateData);
        }

        await addDoc(messagesRef, msgData);
        await updateDoc(chatRef, { [`typing.${myUsername}`]: false }).catch(e=>{});
    } catch (error) {
        console.error("Mesaj gönderilirken hata oluştu:", error);
        throw error;
    }
}

sendBtn?.addEventListener('click', sendMessage);
msgInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

document.getElementById('video-call-btn')?.addEventListener('click', () => startCall(true));
document.getElementById('audio-call-btn')?.addEventListener('click', () => startCall(false));

async function startCall(isVideo) {
    isCallVideo = isVideo; 
    const callStatus = document.getElementById('call-status-text'); if(callStatus) callStatus.innerText = "Aranıyor..."; 
    const acceptBtn = document.getElementById('accept-call-btn'); if(acceptBtn) acceptBtn.style.display = 'none'; 
    if(callOverlay) callOverlay.style.display = 'flex';
    const vCont = document.getElementById('video-container'); if(vCont) vCont.style.display = isVideo ? 'flex' : 'none'; 
    
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true });
        if(isVideo && localVideo) localVideo.srcObject = localStream;
        peerConnection = new RTCPeerConnection(servers);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        remoteStream = new MediaStream(); if(remoteVideo) remoteVideo.srcObject = remoteStream;
        peerConnection.ontrack = event => { event.streams[0].getTracks().forEach(track => { remoteStream.addTrack(track); }); };
        
        currentCallCollection = isGroupChat ? "groups" : "chats";
        currentCallChatId = chatId;
        const callDocRef = doc(collection(db, currentCallCollection, chatId, "calls")); 
        currentCallDocId = callDocRef.id;

        peerConnection.onicecandidate = event => { 
            if(event.candidate) { 
                addDoc(collection(db, currentCallCollection, currentCallChatId, "calls", currentCallDocId, "callerCandidates"), event.candidate.toJSON()); 
            } 
        };
        
        const offerDescription = await peerConnection.createOffer(); 
        await peerConnection.setLocalDescription(offerDescription);
        
        await setDoc(callDocRef, { offer: { type: offerDescription.type, sdp: offerDescription.sdp }, caller: myUsername, type: isVideo ? 'video' : 'audio', status: 'ringing', createdAt: serverTimestamp() });
        
        onSnapshot(collection(db, currentCallCollection, currentCallChatId, "calls", currentCallDocId, "calleeCandidates"), (snapshot) => { 
            snapshot.docChanges().forEach((change) => { 
                if(change.type === 'added') { 
                    const candidate = new RTCIceCandidate(change.doc.data()); 
                    peerConnection.addIceCandidate(candidate); 
                } 
            }); 
        });
    } catch(e) { alert("Erişim reddedildi!"); endCallUI(); }
}

document.getElementById('accept-call-btn')?.addEventListener('click', async () => {
    document.getElementById('accept-call-btn').style.display = 'none'; 
    const callStatus = document.getElementById('call-status-text'); if(callStatus) callStatus.innerText = "Bağlanıyor...";
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

document.getElementById('add-member-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('add-member-modal'); if(modal) modal.style.display = 'flex';
    const inp = document.getElementById('add-member-search'); if(inp) { inp.value = ''; inp.focus(); }
    const res = document.getElementById('add-member-results'); if(res) res.innerHTML = '<div style="padding:10px; color:#64748b; text-align:center;">Kişi aratın...</div>';
});

document.getElementById('add-member-search')?.addEventListener('input', debounce((e) => {
    const text = e.target.value.toLowerCase().trim();
    const container = document.getElementById('add-member-results');
    if(!container) return;
    
    let html = '';
    
    if(!text) {
        container.innerHTML = '<div style="padding:10px; color:#64748b; text-align:center;">İsim veya kullanıcı adı yazın...</div>';
        return;
    }

    const currentGroup = activeChats.find(c => c.id === chatId);
    const currentMembers = currentGroup ? currentGroup.members : [];

    const searchResults = Object.keys(allUsersData).filter(uid => {
        if(uid === myUsername || currentMembers.includes(uid)) return false; 
        const uData = allUsersData[uid];
        const fullName = (uData.fullName || "").toLowerCase();
        return uid.toLowerCase().includes(text) || fullName.includes(text);
    });

    if (searchResults.length > 0) {
        searchResults.forEach(uid => {
            const uData = allUsersData[uid] || {};
            const avatar = uData.avatarUrl ? `<img src="${uData.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">` : '👤';
            const safeTitle = DOMPurify.sanitize(uData.fullName || uid);
            
            html += `
                <div class="group-user-label" style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="width:36px; height:36px; border-radius:8px; overflow:hidden; border:1px solid #cbd5e1; display:flex; justify-content:center; align-items:center;">${avatar}</div>
                        <div>
                            <div style="font-weight:700; font-size:14px; color:#0f172a;">${safeTitle}</div>
                            <div style="font-size:12px; color:#64748b;">@${uid}</div>
                        </div>
                    </div>
                    <button onclick="window.addMemberToGroup('${uid}')" style="background:#3b82f6; color:white; border:none; padding:6px 14px; border-radius:6px; cursor:pointer; font-weight:600; transition:0.2s;">Ekle</button>
                </div>
            `;
        });
    } else {
        html = '<div style="padding:10px; color:#64748b; text-align:center;">Kişi bulunamadı veya zaten grupta.</div>';
    }
    container.innerHTML = html;
}, 300));

window.addMemberToGroup = async function(uid) {
    if(!confirm(`@${uid} adlı kişiyi gruba eklemek istediğinize emin misiniz?`)) return;
    try {
        await updateDoc(doc(db, "groups", chatId), {
            members: arrayUnion(uid),
            updatedAt: serverTimestamp()
        });

        await addDoc(collection(db, "groups", chatId, "messages"), {
            type: 'system',
            text: `@${uid} gruba katıldı.`,
            sender: myUsername,
            createdAt: serverTimestamp()
        });

        window.showToast?.("Kişi başarıyla eklendi!", "success") || alert("Eklendi");
        const modal = document.getElementById('add-member-modal'); if(modal) modal.style.display = 'none';
        
    } catch (error) {
        console.error("Gruba kişi ekleme hatası:", error);
        window.showToast?.("Kişi eklenirken bir hata oluştu.", "error") || alert("Hata oluştu.");
    }
};