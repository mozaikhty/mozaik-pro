import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { collection, onSnapshot, query, where, orderBy, doc, getDoc, updateDoc, arrayRemove, arrayUnion, setDoc, deleteDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';

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
    container.innerHTML = '';
    if(userArray.length === 0) { container.innerHTML = '<p style="text-align:center; color:#64748b; padding:20px;">Liste boş.</p>'; } 
    else {
        let html = '';
        userArray.forEach(uname => {
            let uData = allUsersData[uname] || {}; let avatarHtml = uData.avatarUrl ? `<img src="${uData.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">` : `👤`; let vHtml = uData.isVerified ? '<span class="verified-badge" style="font-size:14px; margin-left:4px;">☑️</span>' : '';
            html += `<div onclick="window.location.href='profile.html?user=${uname}'" class="user-row"><div class="row-avatar">${avatarHtml}</div><div><div style="font-weight:700; color:#0f172a;">${uData.fullName || uname} ${vHtml}</div><div style="font-size:13px; color:#64748b;">@${uname}</div></div></div>`;
        });
        container.innerHTML = html;
    }
    document.getElementById('users-list-modal').style.display = 'flex';
};

document.getElementById('close-list-btn')?.addEventListener('click', () => { document.getElementById('users-list-modal').style.display = 'none'; });

onAuthStateChanged(auth, (user) => {
    if (user) {
        myUsername = user.displayName || user.email.split('@')[0];
        
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
                    const imgTag = `<img src="${u.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">`;
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

        // 2. AŞAMA: SADECE BİZE GELEN BİLDİRİMLERİ DİNLİYORUZ
        onSnapshot(query(collection(db, "notifications"), where("recipient", "==", myUsername), orderBy("createdAt", "desc")), async (snapshot) => {
            myNotifications = [];
            let neededUsers = new Set();
            
            snapshot.forEach(docSnap => { 
                const data = docSnap.data();
                myNotifications.push({ id: docSnap.id, ...data }); 
                if(data.sender) neededUsers.add(data.sender);
            });
            
            await window.fetchMissingUsers(Array.from(neededUsers));
            renderNotifications();
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
            window.showToast?.("Hesap gizli. Takip isteği gönderildi!", "success") || alert("Hesap gizli. Takip isteği gönderildi!");
        } else {
            await setDoc(myRef, { following: arrayUnion(targetUser) }, { merge: true });
            await setDoc(targetRef, { followers: arrayUnion(myUsername) }, { merge: true });
            await addDoc(collection(db, "notifications"), { type: 'follow', sender: myUsername, recipient: targetUser, createdAt: serverTimestamp() });
        }
    } catch (e) {
        console.error("Takip etme hatası: ", e);
    }
};

window.deleteNotification = async function(notifId, event) {
    event.stopPropagation();
    if(confirm("Bu bildirimi silmek istiyor musunuz?")) {
        await deleteDoc(doc(db, "notifications", notifId));
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
            const avatarHtml = uData.avatarUrl ? `<img src="${uData.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">` : `👤`;
            html += `
                <div class="notif-card" style="cursor:default;">
                    <div class="notif-avatar" style="width:44px; height:44px; font-size:22px; display:flex; justify-content:center; align-items:center;">${avatarHtml}</div>
                    <div class="notif-body">
                        <div class="notif-text"><b>@${reqUser}</b> sizi ağına eklemek istiyor.</div>
                        <div class="btn-group">
                            <button class="req-btn btn-accept" onclick="window.acceptRequest('${reqUser}')">Kabul Et</button>
                            <button class="req-btn btn-reject" onclick="window.rejectRequest('${reqUser}')">Reddet</button>
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
            const avatarHtml = senderData.avatarUrl ? `<img src="${senderData.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">` : `👤`;
            
            let icon = ''; let text = ''; let link = '#';
            if(notif.type === 'like') { icon = '❤️'; text = `<b>@${notif.sender}</b> içeriğinizi beğendi.`; link = `profile.html?post=${notif.postId}`; }
            else if(notif.type === 'comment') { icon = '💬'; text = `<b>@${notif.sender}</b> içeriğinize yanıt verdi.`; link = `profile.html?post=${notif.postId}`; }
            else if(notif.type === 'follow') { icon = '🤝'; text = `<b>@${notif.sender}</b> sizi ağına ekledi.`; link = `profile.html?user=${notif.sender}`; }
            
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
    } catch(e) { console.error(e); } 
};

window.rejectRequest = async function(reqUser) { 
    try { 
        await updateDoc(doc(db, "users", myUsername), { followRequests: arrayRemove(reqUser) }); 
        window.showToast?.("Bağlantı isteği reddedildi.", "info");
    } catch(e) { console.error(e); } 
};