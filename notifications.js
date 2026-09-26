import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { collection, onSnapshot, query, where, orderBy, doc, getDoc, updateDoc, arrayRemove, arrayUnion, setDoc, deleteDoc, addDoc, serverTimestamp, limit } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import './shared.js';

let myUsername = null; let allUsersData = {}; let myRequests = []; let myNotifications = [];
let currentTab = 'all';

// Sekme Tasarım Güncellemeleri
const tabAll = document.getElementById('tab-all');
const tabReq = document.getElementById('tab-requests');

tabAll?.addEventListener('click', () => { 
    currentTab = 'all'; 
    tabAll.classList.add('text-cyan-400', 'border-cyan-400');
    tabAll.classList.remove('text-gray-500', 'border-transparent');
    tabReq?.classList.remove('text-cyan-400', 'border-cyan-400');
    tabReq?.classList.add('text-gray-500', 'border-transparent');
    renderNotifications(); 
});

tabReq?.addEventListener('click', () => { 
    currentTab = 'requests'; 
    tabReq.classList.add('text-cyan-400', 'border-cyan-400');
    tabReq.classList.remove('text-gray-500', 'border-transparent');
    tabAll?.classList.remove('text-cyan-400', 'border-cyan-400');
    tabAll?.classList.add('text-gray-500', 'border-transparent');
    renderNotifications(); 
});

window.goToMyProfile = function() { if(myUsername) window.location.href = 'profile.html?user=' + myUsername; };

onAuthStateChanged(auth, (user) => {
    if (user) {
        myUsername = user.displayName || localStorage.getItem('mozaik_username') || user.email.split('@')[0];
        window.myUsername = myUsername; window.allUsersData = allUsersData;
        
        onSnapshot(doc(db, "users", myUsername), async (docSnap) => { 
            if(docSnap.exists()) {
                const u = docSnap.data();
                allUsersData[myUsername] = u;
                myRequests = u.followRequests || [];
                
                const needed = [...(u.following || []), ...myRequests];
                await window.fetchMissingUsers(needed);
                
                if(u.avatarUrl) {
                    const imgTag = `<img src="${window.sanitizeUrl(u.avatarUrl)}" class="w-full h-full object-cover">`;
                    const hAv = document.getElementById('mobile-avatar-header'); if(hAv) hAv.innerHTML = imgTag;
                }
            }
            renderNotifications(); 
            renderWhoToFollow();
        });

        onSnapshot(query(collection(db, "notifications"), where("recipient", "==", myUsername), limit(50)), async (snapshot) => {
            myNotifications = [];
            let neededUsers = new Set();
            
            snapshot.forEach(docSnap => { 
                const data = docSnap.data();
                myNotifications.push({ id: docSnap.id, ...data }); 
                if(data.sender) neededUsers.add(data.sender);
            });
            
            myNotifications.sort((a, b) => {
                const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
                const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
                return timeB - timeA;
            });

            await window.fetchMissingUsers(Array.from(neededUsers));
            renderNotifications();
        }, (err) => {
            console.error("Bildirim akışı hatası:", err);
        });

    } else { window.location.href = "index.html"; }
});

function renderWhoToFollow() {
    const container = document.getElementById('who-to-follow-list');
    if (!container) return;
    const myFollowingList = allUsersData[myUsername]?.following || [];

    let eligibleUsers = Object.keys(allUsersData).filter(uid => {
        return uid !== myUsername && !myFollowingList.includes(uid);
    });

    eligibleUsers = eligibleUsers.sort(() => 0.5 - Math.random()).slice(0, 4);

    if (eligibleUsers.length === 0) {
        container.innerHTML = '<div class="text-sm text-gray-500 text-center py-4">Şu an için yeni öneri yok.</div>';
        return;
    }

    let html = '';
    eligibleUsers.forEach(uid => {
        const uData = allUsersData[uid];
        const avatarHtml = uData.avatarUrl ? `<img src="${window.sanitizeUrl(uData.avatarUrl)}" class="w-full h-full object-cover">` : `<span class="text-xs">👤</span>`;
        const fullName = window.escapeHtml(uData.fullName || uid);
        const vHtml = uData.isVerified ? '<i class="fa-solid fa-circle-check text-blue-500 text-[10px] ml-1"></i>' : '';
        
        html += `
            <div class="flex justify-between items-center cursor-pointer hover:bg-gray-800 p-2 rounded-xl transition" onclick="window.location.href='profile.html?user=${window.escapeHtml(uid)}'">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full overflow-hidden border border-gray-600 bg-gray-700 flex items-center justify-center">${avatarHtml}</div>
                    <div>
                        <p class="text-sm font-bold text-white flex items-center">${fullName} ${vHtml}</p>
                        <p class="text-[11px] text-gray-400">@${window.escapeHtml(uid)}</p>
                    </div>
                </div>
                <button onclick="event.stopPropagation(); window.quickFollow('${window.escapeHtml(uid)}')" class="border border-gray-600 text-xs px-4 py-1.5 rounded-full text-white hover:bg-gray-700 transition font-semibold">Ekle</button>
            </div>
        `;
    });
    container.innerHTML = html;
}

window.deleteNotification = async function(notifId, event) {
    event.stopPropagation();
    if(confirm("Bu bildirimi silmek istiyor musunuz?")) {
        try {
            myNotifications = myNotifications.filter(n => n.id !== notifId);
            renderNotifications();
            await deleteDoc(doc(db, "notifications", notifId));
        } catch(e) {
            console.error("Bildirim silme hatası:", e);
        }
    }
};

window.viewTicket = async function(ticketId) {
    const modal = document.getElementById('ticket-modal');
    const content = document.getElementById('ticket-modal-content');
    if(!modal || !content) return;
    
    modal.style.display = 'flex';
    content.innerHTML = '<div style="text-align:center; padding:20px; color:#64748b;">Yükleniyor...</div>';
    
    try {
        const ticketSnap = await getDoc(doc(db, "tickets", ticketId));
        if(!ticketSnap.exists()) {
            content.innerHTML = '<div class="text-red-400 p-4 text-center">Bu destek talebi bulunamadı veya silinmiş.</div>';
            return;
        }
        
        const data = ticketSnap.data();
        const dateStr = data.createdAt ? data.createdAt.toDate().toLocaleString('tr-TR') : '';
        const replyDateStr = data.repliedAt ? data.repliedAt.toDate().toLocaleString('tr-TR') : '';
        
        let html = `
            <div class="bg-gray-800 p-4 rounded-xl mb-4 border border-gray-700">
                <div class="text-xs text-gray-400 mb-1">Sizin Mesajınız (${dateStr})</div>
                <div class="text-sm text-gray-200 leading-relaxed">${window.escapeHtml(data.message || '')}</div>
            </div>
        `;
        
        if (data.adminReply) {
            html += `
                <div class="bg-blue-900/20 border-l-4 border-blue-500 p-4 rounded-xl">
                    <div class="text-xs text-blue-400 font-bold mb-1">Yönetici Yanıtı (${replyDateStr})</div>
                    <div class="text-sm text-gray-200 leading-relaxed">${window.escapeHtml(data.adminReply)}</div>
                </div>
            `;
        }
        
        content.innerHTML = html;
    } catch (e) {
        content.innerHTML = '<div class="text-red-400 p-4 text-center">Talep yüklenirken bir hata oluştu.</div>';
    }
};

function renderNotifications() {
    const container = document.getElementById('notifications-list'); 
    if(!container) return;
    container.innerHTML = '';
    
    if (currentTab === 'requests') {
        if (myRequests.length === 0) { 
            container.innerHTML = '<div class="flex flex-col items-center justify-center py-20 text-gray-500"><i class="fa-solid fa-user-clock text-5xl mb-4 text-gray-700"></i><p class="font-semibold">Bekleyen bağlantı isteğiniz yok.</p></div>'; 
            return; 
        }
        let html = '';
        myRequests.forEach(reqUser => {
            const uData = allUsersData[reqUser] || {};
            const avatarHtml = uData.avatarUrl ? `<img src="${window.sanitizeUrl(uData.avatarUrl)}" class="w-full h-full object-cover">` : `<span class="text-lg">👤</span>`;
            
            html += `
                <div class="flex items-center gap-4 p-4 bg-[#151e32] border border-gray-800 rounded-2xl mb-3">
                    <div class="w-12 h-12 rounded-full bg-gray-700 overflow-hidden border border-gray-600 flex items-center justify-center flex-shrink-0 cursor-pointer" onclick="window.location.href='profile.html?user=${window.escapeHtml(reqUser)}'">${avatarHtml}</div>
                    <div class="flex-1">
                        <p class="text-sm text-gray-300"><b class="text-white cursor-pointer hover:underline" onclick="window.location.href='profile.html?user=${window.escapeHtml(reqUser)}'">@${window.escapeHtml(reqUser)}</b> sizi ağına eklemek istiyor.</p>
                        <div class="flex gap-3 mt-3">
                            <button class="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white py-1.5 rounded-lg text-sm font-bold transition" onclick="window.acceptRequest('${window.escapeHtml(reqUser)}')">Kabul Et</button>
                            <button class="flex-1 bg-transparent border border-gray-600 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/50 text-gray-300 py-1.5 rounded-lg text-sm font-bold transition" onclick="window.rejectRequest('${window.escapeHtml(reqUser)}')">Reddet</button>
                        </div>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    } else {
        if (myNotifications.length === 0) { 
            container.innerHTML = '<div class="flex flex-col items-center justify-center py-20 text-gray-500"><i class="fa-solid fa-bell-slash text-5xl mb-4 text-gray-700"></i><p class="font-semibold mb-2">Burada görecek bir şey yok. Henüz...</p><p class="text-xs text-center max-w-xs">Gelişmeler, bağlantılar ve çok daha fazlası burada yer alır.</p></div>'; 
            return; 
        }
        let html = '';
        myNotifications.forEach(notif => {
            const senderData = allUsersData[notif.sender] || {};
            const avatarHtml = senderData.avatarUrl ? `<img src="${window.sanitizeUrl(senderData.avatarUrl)}" class="w-full h-full object-cover">` : `<span class="text-sm">👤</span>`;
            
            let icon = ''; let text = ''; let link = '#'; let iconColor = '';
            if(notif.type === 'like') { icon = '<i class="fa-solid fa-heart"></i>'; iconColor = 'text-pink-500'; text = `<b class="text-white">@${window.escapeHtml(notif.sender)}</b> içeriğinizi beğendi.`; link = `profile.html?post=${notif.postId}`; }
            else if(notif.type === 'comment') { icon = '<i class="fa-solid fa-comment"></i>'; iconColor = 'text-blue-400'; text = `<b class="text-white">@${window.escapeHtml(notif.sender)}</b> içeriğinize yanıt verdi.`; link = `profile.html?post=${notif.postId}`; }
            else if(notif.type === 'follow') { icon = '<i class="fa-solid fa-user-plus"></i>'; iconColor = 'text-emerald-400'; text = `<b class="text-white">@${window.escapeHtml(notif.sender)}</b> sizi ağına ekledi.`; link = `profile.html?user=${window.escapeHtml(notif.sender)}`; }
            else if(notif.type === 'admin_delete') { icon = '<i class="fa-solid fa-triangle-exclamation"></i>'; iconColor = 'text-red-500'; text = `Bir gönderiniz kurallara uymadığı gerekçesiyle yönetici tarafından kaldırıldı.`; link = '#'; }
            else if(notif.type === 'support_reply') { 
                icon = '<i class="fa-solid fa-headset"></i>'; iconColor = 'text-cyan-400';
                let safeReply = notif.text ? window.escapeHtml(notif.text) : 'Yanıt eklendi.';
                text = `Destek talebiniz <b class="text-white">@${window.escapeHtml(notif.sender)}</b> tarafından yanıtlandı:<br><i class="text-gray-500 text-xs mt-1 block">"${safeReply}"</i>`; 
                link = notif.ticketId ? `javascript:window.viewTicket('${notif.ticketId}')` : '#'; 
            }
            
            let timeAgo = "";
            if(notif.createdAt) {
                let millis = 0;
                if (typeof notif.createdAt.toMillis === 'function') millis = notif.createdAt.toMillis();
                else if (notif.createdAt.seconds) millis = notif.createdAt.seconds * 1000;
                if(millis > 0) {
                    const secs = Math.floor((Date.now() - millis) / 1000);
                    if(secs < 60) timeAgo = `${secs}s`; else if (secs < 3600) timeAgo = `${Math.floor(secs/60)}d`; else if (secs < 86400) timeAgo = `${Math.floor(secs/3600)}sa`; else timeAgo = `${Math.floor(secs/86400)}g`;
                }
            }

            html += `
                <div class="flex items-start gap-4 p-4 bg-[#151e32] border border-gray-800 rounded-2xl mb-3 relative group transition hover:border-gray-600 cursor-pointer" onclick="window.location.href='${link}'">
                    <button class="absolute top-2 right-2 w-8 h-8 rounded-full hover:bg-red-500/20 text-gray-600 hover:text-red-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition border border-transparent hover:border-red-500/30" onclick="window.deleteNotification('${notif.id}', event)"><i class="fa-solid fa-xmark"></i></button>
                    
                    <div class="w-12 h-12 rounded-xl bg-gray-800/50 border border-gray-700 flex items-center justify-center text-xl flex-shrink-0 ${iconColor}">${icon}</div>
                    
                    <div class="flex-1 pr-6">
                        <div class="w-6 h-6 rounded-full overflow-hidden border border-gray-600 bg-gray-700 flex items-center justify-center mb-1">${avatarHtml}</div>
                        <p class="text-sm text-gray-300 leading-relaxed">${text}</p>
                        <span class="text-xs text-gray-500 font-semibold mt-2 block">${timeAgo}</span>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    }
}

window.acceptRequest = async function(reqUser) { 
    const myRef = doc(db, "users", myUsername); 
    const targetRef = doc(db, "users", reqUser); 
    try { 
        await updateDoc(myRef, { followRequests: arrayRemove(reqUser), followers: arrayUnion(reqUser) }); 
        await updateDoc(targetRef, { following: arrayUnion(myUsername) }); 
        await addDoc(collection(db, "notifications"), { type: 'follow', sender: reqUser, recipient: myUsername, createdAt: serverTimestamp() });
        window.showToast?.("Bağlantı isteği kabul edildi.", "success");
    } catch(e) { console.error("İstek işleme hatası:", e); } 
};

window.rejectRequest = async function(reqUser) { 
    try { 
        await updateDoc(doc(db, "users", myUsername), { followRequests: arrayRemove(reqUser) }); 
        window.showToast?.("Bağlantı isteği reddedildi.", "info");
    } catch(e) { console.error("İstek işleme hatası:", e); } 
};