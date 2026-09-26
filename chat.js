import './app.js';
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, updateDoc, onSnapshot, query, orderBy, serverTimestamp, getDoc, doc, where, arrayUnion, arrayRemove, deleteDoc, limitToLast } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";
import { auth, db, storage } from './firebase-config.js';
import './shared.js';

let currentUser = null; let myUsername = null; let chatId = null; let isGroupChat = false;
let allUsersData = {}; let activeChats = []; let myFollowing = [];
let currentReplyData = null; let typingTimeout = null;
let currentInboxTab = 'all'; 

let unsubscribeMessages = null;
let unsubscribeChatMeta = null;

const urlParams = new URLSearchParams(window.location.search);
const targetUsername = urlParams.get('user');
const targetGroupId = urlParams.get('group');

function debounce(func, delay) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

window.goToChatProfile = function() {
    if (!isGroupChat && targetUsername) { window.location.href = 'profile.html?user=' + targetUsername; }
};
window.goToMyProfile = function() { if(myUsername) window.location.href = 'profile.html?user=' + myUsername; };

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
        currentInboxTab = e.currentTarget.getAttribute('data-tab');
        updateInboxDisplay();
    });
});

document.getElementById('open-emoji-btn')?.addEventListener('click', () => {
    const picker = document.getElementById('chat-emoji-picker');
    if(picker) picker.classList.toggle('hidden');
    if(picker) picker.classList.toggle('flex');
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
        picker.classList.add('hidden');
        picker.classList.remove('flex');
    }
});

document.getElementById('chat-image-input')?.addEventListener('change', (e) => {
    if(e.target.files.length > 0) { 
        const sBtn = document.getElementById('send-btn'); if(sBtn) sBtn.disabled = false; 
        const uploadLabel = document.getElementById('img-upload-label'); if(uploadLabel) uploadLabel.classList.add('text-[#06b6d4]', 'border-[#06b6d4]'); 
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
        window.myUsername = myUsername; window.allUsersData = allUsersData;
        
        onSnapshot(doc(db, "users", myUsername), async (docSnap) => { 
            if(docSnap.exists()) {
                const u = docSnap.data();
                allUsersData[myUsername] = u;
                myFollowing = u.following || [];
                
                await window.fetchMissingUsers(myFollowing);
                
                if(u.avatarUrl) {
                    const imgTag = `<img src="${window.sanitizeUrl(u.avatarUrl)}" class="w-full h-full object-cover">`;
                    const mobAv = document.getElementById('mobile-avatar-header'); if(mobAv) mobAv.innerHTML = imgTag;
                }
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
            window.attachCallListeners(activeChats); 
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
            window.attachCallListeners(activeChats); 
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

            let timeAgoStr = ""; 
            if(conv.updatedAt) { 
                const date = conv.updatedAt.toDate(); 
                const now = new Date();
                if(date.getDate() === now.getDate() && date.getMonth() === now.getMonth()) {
                    timeAgoStr = date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0'); 
                } else {
                    timeAgoStr = date.toLocaleDateString('tr-TR', {day:'numeric', month:'short'});
                }
            }

            if (conv.type === 'private') {
                const otherUser = conv.participants.find(p => p !== myUsername); const uData = allUsersData[otherUser] || {};
                title = DOMPurify.sanitize(`${uData.fullName || otherUser}`);
                title += uData.isVerified ? '<i class="fa-solid fa-circle-check text-blue-500 text-[10px] ml-1"></i>' : '';
                avatar = uData.avatarUrl ? `<img src="${window.sanitizeUrl(uData.avatarUrl)}" class="w-full h-full object-cover">` : '👤'; link = `chat.html?user=${window.escapeHtml(otherUser)}`;
            } else {
                title = DOMPurify.sanitize(conv.name); 
                avatar = `<div class="bg-gradient-to-tr from-green-500 to-emerald-400 text-white w-full h-full flex items-center justify-center font-bold text-lg"><i class="fa-solid fa-user-group"></i></div>`; 
                link = `chat.html?group=${conv.id}`;
            }
            
            let lastMsgText = conv.lastMessage || 'Sohbet başlatıldı'; 
            if(lastMsgText.includes('https://firebasestorage.googleapis.com')) lastMsgText = '📷 Fotoğraf';
            
            const isActive = (targetUsername && link.includes(targetUsername)) || (targetGroupId && link.includes(targetGroupId));
            
            let subtitleHtml = isUnread ? `<b class="text-white">${DOMPurify.sanitize(lastMsgText)}</b>` : `<span class="text-gray-400">${DOMPurify.sanitize(lastMsgText)}</span>`;

            html += `
            <div class="flex items-center gap-4 p-3 rounded-2xl transition cursor-pointer border border-transparent hover:border-gray-700 hover:bg-[#151e32] mb-1 dm-user-card ${isActive ? 'bg-[#1e293b] border-[#06b6d4]/50' : ''}" onclick="window.location.href='${link}'">
                <div class="w-14 h-14 rounded-2xl bg-gray-800 overflow-hidden flex-shrink-0 border border-gray-700 flex justify-center items-center text-xl">${avatar}</div>
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-center mb-1">
                        <h4 class="text-sm font-bold text-white truncate flex items-center">${title}</h4>
                        <span class="text-[10px] font-semibold ${isUnread ? 'text-[#06b6d4]' : 'text-gray-500'}">${timeAgoStr}</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <p class="text-xs truncate max-w-[85%]">${subtitleHtml}</p>
                        ${isUnread ? '<div class="w-2.5 h-2.5 rounded-full bg-[#06b6d4] shadow-[0_0_8px_rgba(6,182,212,0.8)]"></div>' : ''}
                    </div>
                </div>
            </div>`;
        });
    } else { html = '<p class="text-center text-gray-500 py-10">Sohbet bulunamadı.</p>'; }
    
    container.innerHTML = html;
}

document.getElementById('new-chat-search')?.addEventListener('input', debounce((e) => {
    const text = e.target.value.toLowerCase().trim(); const container = document.getElementById('new-chat-results'); if(!container) return;
    let html = '';
    if(!text) { container.innerHTML = ''; return; }
    
    const searchResults = Object.keys(allUsersData).filter(uid => uid !== myUsername && uid.toLowerCase().includes(text));
    if (searchResults.length > 0) {
        searchResults.forEach(uid => {
            const uData = allUsersData[uid] || {}; 
            const avatar = uData.avatarUrl ? `<img src="${window.sanitizeUrl(uData.avatarUrl)}" class="w-full h-full object-cover">` : '👤';
            const safeTitle = DOMPurify.sanitize(uData.fullName || uid);
            const title = `${safeTitle} ${uData.isVerified ? '<i class="fa-solid fa-circle-check text-blue-500 text-[10px] ml-1"></i>' : ''}`;
            
            html += `
            <div class="flex items-center justify-between p-3 hover:bg-gray-800 rounded-xl cursor-pointer transition border border-transparent hover:border-gray-700" onclick="window.location.href='chat.html?user=${window.escapeHtml(uid)}'">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-gray-700 overflow-hidden border border-gray-600 flex items-center justify-center">${avatar}</div>
                    <div><div class="text-sm font-bold text-white flex items-center">${title}</div><div class="text-[11px] text-gray-500">@${window.escapeHtml(uid)}</div></div>
                </div>
                <i class="fa-solid fa-chevron-right text-gray-600 text-xs"></i>
            </div>`;
        });
    } else {
        html = '<div class="text-center text-gray-500 py-4 text-sm">Kullanıcı bulunamadı.</div>';
    }
    container.innerHTML = html;
}, 300));

const openGroupModalBtn = document.getElementById('open-group-modal');
if (openGroupModalBtn) {
    openGroupModalBtn.addEventListener('click', () => {
        const groupModal = document.getElementById('group-modal'); if(groupModal) groupModal.style.display = 'flex';
        const listDiv = document.getElementById('group-users-list'); if(!listDiv) return;
        
        let html = '';
        if(myFollowing.length === 0) { listDiv.innerHTML = '<div class="text-center text-gray-500 py-4 text-sm">Önce ağınıza birilerini eklemelisiniz!</div>'; return; }
        myFollowing.forEach(uid => {
            const uData = allUsersData[uid] || {}; const avatar = uData.avatarUrl ? `<img src="${window.sanitizeUrl(uData.avatarUrl)}" class="w-full h-full object-cover">` : '👤';
            html += `
            <label class="flex items-center justify-between p-3 hover:bg-gray-800 rounded-xl cursor-pointer transition border border-transparent hover:border-gray-700">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-gray-700 overflow-hidden border border-gray-600 flex items-center justify-center">${avatar}</div>
                    <div class="text-sm font-bold text-white">@${window.escapeHtml(uid)}</div>
                </div>
                <input type="checkbox" class="group-member-checkbox w-5 h-5 accent-[#06b6d4]" value="${window.escapeHtml(uid)}">
            </label>`;
        });
        listDiv.innerHTML = html;
    });
}

document.getElementById('create-group-btn')?.addEventListener('click', async () => {
    const groupNameInp = document.getElementById('group-name-input');
    const groupName = groupNameInp ? groupNameInp.value.trim() : '';
    if (groupName.length > 50) { alert("Grup adı en fazla 50 karakter olabilir!"); return; }
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
                const uText = document.getElementById('chat-username-text'); if(uText) uText.innerHTML = `${safeName} ${data.isVerified ? '<i class="fa-solid fa-circle-check text-blue-500 text-[10px] ml-1"></i>' : ''}`;
                const cSub = document.getElementById('chat-subtitle'); if(cSub) cSub.innerText = `@${targetUsername}`;
                const cAv = document.getElementById('chat-avatar'); if (data.avatarUrl && cAv) cAv.innerHTML = `<img src="${window.sanitizeUrl(data.avatarUrl)}" class="w-full h-full object-cover">`; 
            }
        } catch(e) {}
    } else if (targetGroupId) {
        isGroupChat = true; chatId = targetGroupId;
        const cAv = document.getElementById('chat-avatar'); if(cAv) cAv.innerHTML = `<div class="bg-gradient-to-tr from-green-500 to-emerald-400 text-white w-full h-full flex items-center justify-center font-bold text-lg"><i class="fa-solid fa-user-group"></i></div>`;
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
                if(subtitle) subtitle.classList.add('hidden'); 
                if(indicator) {
                    indicator.classList.remove('hidden'); 
                    indicator.innerText = `${isGroupChat ? window.escapeHtml(typingUsers.join(', ')) + ' yazıyor...' : 'yazıyor...'}`;
                } 
            } 
            else { 
                if(indicator) indicator.classList.add('hidden'); 
                if(subtitle) subtitle.classList.remove('hidden'); 
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
    const rpBox = document.getElementById('reply-preview-box'); 
    if(rpBox) { rpBox.classList.remove('hidden'); rpBox.classList.add('flex'); }
    const mInput = document.getElementById('msg-input'); if(mInput) mInput.focus();
};

window.cancelReply = function() { 
    currentReplyData = null; 
    const rpBox = document.getElementById('reply-preview-box'); 
    if(rpBox) { rpBox.classList.add('hidden'); rpBox.classList.remove('flex'); } 
};

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
        if (newText.trim().length > 1000) { alert("Mesaj en fazla 1000 karakter olabilir!"); return; }
        const colName = isGroupChat ? "groups" : "chats";
        await updateDoc(doc(db, colName, chatId, "messages", msgId), { text: newText.trim(), isEdited: true }); 
    }
};

function loadMessages() {
    const collectionName = isGroupChat ? "groups" : "chats";
    const messagesRef = collection(db, collectionName, chatId, "messages");
    
    unsubscribeMessages = onSnapshot(query(messagesRef, orderBy("createdAt", "asc"), limitToLast(50)), (snapshot) => {
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
                const icon = data.text.includes('görüntülü') ? '<i class="fa-solid fa-video"></i>' : (data.text.includes('katıldı') ? '<i class="fa-solid fa-user-plus"></i>' : '<i class="fa-solid fa-phone"></i>');
                html += `<div class="flex justify-center my-4"><span class="bg-gray-800/80 text-gray-400 text-xs px-4 py-1.5 rounded-full border border-gray-700 shadow-sm">${icon} ${DOMPurify.sanitize(data.text)} - ${timeString}</span></div>`;
                return; 
            }

            if (!isMe && !data.isRead) { 
                updateDoc(doc(db, collectionName, chatId, "messages", docSnap.id), { isRead: true }).catch(e=>{}); 
            }

            let senderNameHtml = ''; if (isGroupChat && !isMe) senderNameHtml = `@${window.escapeHtml(data.sender)}`;

            let tickHtml = '';
            if (isMe) {
                let isRead = false; if (isGroupChat) isRead = data.readBy && data.readBy.length > 0; else isRead = data.isRead === true;
                tickHtml = `<span class="text-[10px] font-bold tracking-tighter ${isRead ? 'text-cyan-300' : 'text-white/60'}" title="${isRead ? 'Görüldü' : 'İletildi'}">${isRead ? '✓✓' : '✓'}</span>`;
            }

            let replyHtml = ''; if (data.replyTo) replyHtml = `<div class="bg-black/20 border-l-2 border-[#06b6d4] p-2 rounded-lg text-xs mb-2 text-gray-200 truncate"><b class="text-[#06b6d4]">@${window.escapeHtml(data.replyTo.sender)}</b>: ${data.replyTo.text}</div>`;
            let imageHtml = ''; if (data.imageUrl) imageHtml = `<img src="${window.sanitizeUrl(data.imageUrl)}" class="max-w-full max-h-64 rounded-xl mb-2 object-cover border border-white/10 shadow-sm">`;
            const safeText = data.text ? data.text.replace(/'/g, "\\'").replace(/"/g, '&quot;') : '';
            
            let actionsHtml = `<div class="flex gap-4 text-[11px] text-gray-500 mt-1 opacity-0 group-hover:opacity-100 transition px-2">`;
            actionsHtml += `<span class="cursor-pointer hover:text-[#06b6d4] transition font-semibold" onclick="window.prepareReply('${docSnap.id}', '${data.sender}', '${safeText}')">Yanıtla</span>`;
            if (isMe) {
                if(!data.imageUrl) actionsHtml += `<span class="cursor-pointer hover:text-white transition font-semibold" onclick="window.editMessage('${docSnap.id}', '${safeText}', ${timeMillis})">Düzenle</span>`;
                actionsHtml += `<span class="cursor-pointer hover:text-red-400 transition font-semibold" onclick="window.deleteMessage('${docSnap.id}')">Sil</span>`;
            }
            actionsHtml += `</div>`;

            let bubbleClass = isMe ? 'bg-gradient-to-tr from-cyan-600 to-blue-600 text-white rounded-2xl rounded-tr-sm shadow-md' : 'bg-[#1e293b] text-gray-200 border border-gray-700 rounded-2xl rounded-tl-sm shadow-sm';

            html += `
                <div class="flex flex-col w-full group ${isMe ? 'items-end' : 'items-start'} mb-4">
                    ${senderNameHtml ? `<span class="text-[10px] text-gray-500 font-bold mb-1 ml-1">${senderNameHtml}</span>` : ''}
                    <div class="max-w-[85%] md:max-w-[70%]">
                        <div class="p-3 ${bubbleClass}">
                            ${replyHtml}
                            ${imageHtml}
                            ${data.text ? `<div class="text-[15px] leading-relaxed break-words">${data.text}</div>` : ''}
                            <div class="flex justify-end items-center gap-1.5 mt-1.5 opacity-80">
                                ${data.isEdited ? '<span class="text-[9px] italic mr-1">düzenlendi</span>' : ''}
                                <span class="text-[10px] font-medium">${timeString}</span>
                                ${tickHtml}
                            </div>
                        </div>
                        ${actionsHtml}
                    </div>
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

let lastTypingUpdate = 0;
msgInput?.addEventListener('input', () => {
    if (!chatId) return;
    const now = Date.now();
    const chatRef = doc(db, isGroupChat ? "groups" : "chats", chatId);
    
    if (now - lastTypingUpdate > 2000) {
        lastTypingUpdate = now;
        updateDoc(chatRef, { [`typing.${myUsername}`]: true }).catch(e=>{});
    }
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        updateDoc(chatRef, { [`typing.${myUsername}`]: false }).catch(e=>{});
        lastTypingUpdate = 0;
    }, 2000);
});

async function sendMessage() {
    if(!msgInput) return;
    const text = msgInput.value.trim(); 
    const file = imgInput ? imgInput.files[0] : null;
    if (!text && !file) return;

    if (file && !file.type.match(/^(image\/(jpeg|png|webp|gif))$/)) {
        alert("Sadece güvenli fotoğraf (JPEG, PNG, WEBP, GIF) formatları yüklenebilir.");
        if(imgInput) imgInput.value = '';
        return;
    }
    if (file && file.size > 5 * 1024 * 1024) {
        alert("Göndermek istediğiniz fotoğraf 5 MB'dan büyük olamaz!");
        if(imgInput) imgInput.value = ''; 
        const upLabel = document.getElementById('img-upload-label'); if(upLabel) { upLabel.classList.remove('text-[#06b6d4]', 'border-[#06b6d4]'); upLabel.classList.add('text-gray-400'); }
        if (text.length === 0 && sendBtn) sendBtn.disabled = true;
        return; 
    }

    if(sendBtn) sendBtn.disabled = true; 
    msgInput.value = ''; 
    const picker = document.getElementById('chat-emoji-picker'); if(picker) { picker.classList.add('hidden'); picker.classList.remove('flex'); }
    const uploadLabel = document.getElementById('img-upload-label'); if(uploadLabel) { uploadLabel.classList.remove('text-[#06b6d4]', 'border-[#06b6d4]'); uploadLabel.classList.add('text-gray-400'); }
    
    try {
        let imgUrl = null;
        if(file) {
            const compressedImg = await window.compressImage(file, 1200, 1200, 0.75, 800 * 1024);
            const fileName = `chats/${auth.currentUser.uid}_${Date.now()}_${compressedImg.name.replace(/[^a-zA-Z0-9.]/g, "")}`;
            const storageRef = ref(storage, fileName);
            await uploadBytes(storageRef, compressedImg);
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
        if (text.length > 1000) { alert("Mesaj en fazla 1000 karakter olabilir!"); return; }
        if (!isGroupChat) {
            await setDoc(chatRef, { participants: [myUsername, targetUsername], ...updateData }, { merge: true });
        } else {
            await updateDoc(chatRef, updateData);
        }

        await addDoc(messagesRef, msgData);
        await updateDoc(chatRef, { [`typing.${myUsername}`]: false }).catch(e=>{});
    } catch (error) {
        throw error;
    }
}

sendBtn?.addEventListener('click', sendMessage);
msgInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

document.getElementById('video-call-btn')?.addEventListener('click', () => {
    const colName = isGroupChat ? "groups" : "chats";
    if (window.startCall) window.startCall(chatId, colName, true, myUsername);
});
document.getElementById('audio-call-btn')?.addEventListener('click', () => {
    const colName = isGroupChat ? "groups" : "chats";
    if (window.startCall) window.startCall(chatId, colName, false, myUsername);
});

document.getElementById('add-member-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('add-member-modal'); if(modal) modal.style.display = 'flex';
    const inp = document.getElementById('add-member-search'); if(inp) { inp.value = ''; inp.focus(); }
    const res = document.getElementById('add-member-results'); if(res) res.innerHTML = '<div style="padding:10px; color:#64748b; text-align:center; font-size:13px;">Kişi aratın...</div>';
});

document.getElementById('add-member-search')?.addEventListener('input', debounce((e) => {
    const text = e.target.value.toLowerCase().trim();
    const container = document.getElementById('add-member-results');
    if(!container) return;
    
    let html = '';
    
    if(!text) {
        container.innerHTML = '<div style="padding:10px; color:#64748b; text-align:center; font-size:13px;">İsim veya kullanıcı adı yazın...</div>';
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
            const avatar = uData.avatarUrl ? `<img src="${window.sanitizeUrl(uData.avatarUrl)}" class="w-full h-full object-cover">` : '👤';
            const safeTitle = DOMPurify.sanitize(uData.fullName || uid);
            
            html += `
                <div class="flex items-center justify-between p-2 hover:bg-gray-800 rounded-xl transition">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-gray-700 overflow-hidden flex justify-center items-center">${avatar}</div>
                        <div>
                            <div class="font-bold text-sm text-white">${safeTitle}</div>
                            <div class="text-xs text-gray-500">@${window.escapeHtml(uid)}</div>
                        </div>
                    </div>
                    <button onclick="window.addMemberToGroup('${window.escapeHtml(uid)}')" class="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition">Ekle</button>
                </div>
            `;
        });
    } else {
        html = '<div style="padding:10px; color:#64748b; text-align:center; font-size:13px;">Kişi bulunamadı veya zaten grupta.</div>';
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
        console.error("Gruba kişi eklenemedi:", error);
    }
};