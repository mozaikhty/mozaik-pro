import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { collection, onSnapshot, query, where, orderBy, doc, getDoc, updateDoc, arrayRemove, arrayUnion, setDoc, deleteDoc, addDoc, serverTimestamp, limit } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import './shared.js';

let myUsername = null; let allUsersData = {}; let myRequests = []; let myNotifications = [];
let currentTab = 'all';

document.getElementById('tab-all')?.addEventListener('click', () => { 
    currentTab = 'all'; 
    document.getElementById('tab-all').classList.add('active'); 
    document.getElementById('tab-requests')?.classList.remove('active'); 
    renderNotifications(); 
});

document.getElementById('tab-requests')?.addEventListener('click', () => { 
    currentTab = 'requests'; 
    document.getElementById('tab-requests').classList.add('active'); 
    document.getElementById('tab-all')?.classList.remove('active'); 
    renderNotifications(); 
});

window.goToMyProfile = function() { if(myUsername) window.location.href = 'profile.html?user=' + myUsername; };




onAuthStateChanged(auth, (user) => {
    if (user) {
        myUsername = user.displayName || localStorage.getItem('mozaik_username') || user.email.split('@')[0];
        window.myUsername = myUsername; window.allUsersData = allUsersData;
        
        // 1. AŞAMA: KENDİ PROFİLİMİZİ DİNLİYORUZ (İstekler ve Takipçi sayısı için)
        onSnapshot(doc(db, "users", myUsername), async (docSnap) => { 
            if(docSnap.exists()) {
                const u = docSnap.data();
                allUsersData[myUsername] = u;
                myRequests = u.followRequests || [];
                
                const needed = [...(u.following || []), ...myRequests];
                await window.fetchMissingUsers(needed);
                
                const mobName = document.getElementById('sidebar-name-mobile'); if(mobName) mobName.innerText = u.fullName || myUsername;
                const mobHandle = document.getElementById('sidebar-handle-mobile'); if(mobHandle) mobHandle.innerText = '@' + myUsername;
                const mobFolCount = document.getElementById('sidebar-following-count'); if(mobFolCount) mobFolCount.innerText = (u.following || []).length;
                const mobFolersCount = document.getElementById('sidebar-followers-count'); if(mobFolersCount) mobFolersCount.innerText = (u.followers || []).length;
                
                if(u.avatarUrl) {
                    const imgTag = `<img src="${window.sanitizeUrl(u.avatarUrl)}" style="width:100%;height:100%;object-fit:cover;">`;
                    const hAv = document.getElementById('mobile-avatar-header'); if(hAv) hAv.innerHTML = imgTag;
                    const sAv = document.getElementById('sidebar-avatar-mobile'); if(sAv) sAv.innerHTML = imgTag;
                    const dAv = document.getElementById('desktop-sidebar-avatar'); if(dAv) dAv.innerHTML = imgTag;
                }
                
                const deskName = document.getElementById('desktop-sidebar-name'); if(deskName) deskName.innerText = u.fullName || myUsername;
                const deskHandle = document.getElementById('desktop-sidebar-handle'); if(deskHandle) deskHandle.innerText = '@' + myUsername;
            }
            
            renderNotifications(); 
            renderWhoToFollow();
        });

        // 2. AŞAMA: SADECE BİZE GELEN BİLDİRİMLERİ DİNLİYORUZ (Index hatasını önlemek için orderBy JS tarafında yapılır, limit(50) ile kota korunur)
        onSnapshot(query(collection(db, "notifications"), where("recipient", "==", myUsername), limit(50)), async (snapshot) => {
            myNotifications = [];
            let neededUsers = new Set();
            
            snapshot.forEach(docSnap => { 
                const data = docSnap.data();
                myNotifications.push({ id: docSnap.id, ...data }); 
                if(data.sender) neededUsers.add(data.sender);
            });
            
            // Tarihe göre sıralama (en yeniden eskiye)
            myNotifications.sort((a, b) => {
                const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
                const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
                return timeB - timeA;
            });

            await window.fetchMissingUsers(Array.from(neededUsers));
            renderNotifications();
        }, (err) => {
            console.error("Bildirim akışı hatası:", err.code || "Bilinmeyen hata");
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



window.deleteNotification = async function(notifId, event) {
    event.stopPropagation();
    if(confirm("Bu bildirimi silmek istiyor musunuz?")) {
        try {
            myNotifications = myNotifications.filter(n => n.id !== notifId);
            renderNotifications();
            await deleteDoc(doc(db, "notifications", notifId));
            window.showToast?.("Bildirim silindi.", "info");
        } catch(e) {
            console.error("Bildirim silme hatası:", e.code || "Bilinmeyen hata");
        }
    }
};

function renderNotifications() {
    const container = document.getElementById('notifications-list'); 
    if(!container) return;
    container.innerHTML = '';
    
    if (currentTab === 'requests') {
        if (myRequests.length === 0) { container.innerHTML = '<div class="empty-text"><span>📬</span>Bekleyen bağlantı isteğiniz yok.</div>'; return; }
        let html = '';
        myRequests.forEach(reqUser => {
            const uData = allUsersData[reqUser] || {};
            const avatarHtml = uData.avatarUrl ? `<img src="${window.sanitizeUrl(uData.avatarUrl)}" style="width:100%;height:100%;object-fit:cover;">` : `👤`;
            html += `
                <div class="notif-card" style="cursor:default;">
                    <div class="notif-avatar" style="width:44px; height:44px; font-size:22px; display:flex; justify-content:center; align-items:center;">${avatarHtml}</div>
                    <div class="notif-body">
                        <div class="notif-text"><b>@${window.escapeHtml(reqUser)}</b> sizi ağına eklemek istiyor.</div>
                        <div class="btn-group">
                            <button class="req-btn btn-accept" onclick="window.acceptRequest('${window.escapeHtml(reqUser)}')">Kabul Et</button>
                            <button class="req-btn btn-reject" onclick="window.rejectRequest('${window.escapeHtml(reqUser)}')">Reddet</button>
                        </div>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    } else {
        if (myNotifications.length === 0) { container.innerHTML = '<div class="empty-text"><span>🔔</span>Burada görecek bir şey yok. Henüz...<br><br>Gelişmeler, bağlantılar ve çok daha fazlası burada yer alır.</div>'; return; }
        let html = '';
        myNotifications.forEach(notif => {
            const senderData = allUsersData[notif.sender] || {};
            const avatarHtml = senderData.avatarUrl ? `<img src="${window.sanitizeUrl(senderData.avatarUrl)}" style="width:100%;height:100%;object-fit:cover;">` : `👤`;
            
            let icon = ''; let text = ''; let link = '#';
            if(notif.type === 'like') { icon = '❤️'; text = `<b>@${window.escapeHtml(notif.sender)}</b> içeriğinizi beğendi.`; link = `profile.html?post=${notif.postId}`; }
            else if(notif.type === 'comment') { icon = '💬'; text = `<b>@${window.escapeHtml(notif.sender)}</b> içeriğinize yanıt verdi.`; link = `profile.html?post=${notif.postId}`; }
            else if(notif.type === 'follow') { icon = '🤝'; text = `<b>@${window.escapeHtml(notif.sender)}</b> sizi ağına ekledi.`; link = `profile.html?user=${window.escapeHtml(notif.sender)}`; }
            else if(notif.type === 'admin_delete') { icon = '⚠️'; text = `Bir gönderiniz kurallara uymadığı gerekçesiyle yönetici tarafından kaldırıldı.`; link = '#'; }
            
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
                <div class="notif-card" onclick="window.location.href='${link}'">
                    <button class="delete-notif-btn" title="Bildirimi Sil" onclick="window.deleteNotification('${notif.id}', event)">✕</button>
                    <div class="notif-icon">${icon}</div>
                    <div class="notif-body">
                        <div class="notif-sender">
                            <div class="notif-avatar" style="font-size:20px; display:flex; justify-content:center; align-items:center;">${avatarHtml}</div>
                        </div>
                        <div class="notif-text">${text}</div>
                        <div class="notif-time">${timeAgo}</div>
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
    } catch(e) { console.error("İstek işleme hatası:", e.code || "Bilinmeyen hata"); } 
};

window.rejectRequest = async function(reqUser) { 
    try { 
        await updateDoc(doc(db, "users", myUsername), { followRequests: arrayRemove(reqUser) }); 
        window.showToast?.("Bağlantı isteği reddedildi.", "info");
    } catch(e) { console.error("İstek işleme hatası:", e.code || "Bilinmeyen hata"); } 
};