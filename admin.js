import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { collection, onSnapshot, doc, updateDoc, deleteDoc, query, orderBy, getDocs, where, addDoc, serverTimestamp, limit, getDoc, startAt, endAt } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { ref, deleteObject } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";
import { auth, db, storage } from './firebase-config.js';

const ADMIN_USERNAME = "mozaik"; 
let allUsers = []; 
let recentPostsLog = [];
let recentNotifsLog = [];

onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            // --- GÜVENLİK KONTROLÜ ---
            const adminDocRef = doc(db, "admins", user.uid);
            const adminDoc = await getDoc(adminDocRef);

            if (!adminDoc.exists()) { 
                if (window.showToast) window.showToast("Yönetici yetkiniz bulunmamaktadır!", "error");
                else alert("Sistem Yönetimi sayfasına giriş yetkiniz bulunmamaktadır!");
                setTimeout(() => { window.location.href = "feed.html"; }, 1500);
                return; 
            }
            
            const myUsername = user.displayName || user.email.split('@')[0];
            const profileLink = document.getElementById('my-profile-link');
            if(profileLink) profileLink.href = `profile.html?user=${myUsername}`;
            
            loadUsers(); 
            loadTickets();
            loadActivityStream(); 
            
        } catch (error) {
            console.error("Yetki kontrolü sırasında hata oluştu:", error);
            if (window.showToast) window.showToast("Bağlantı hatası. Yönlendiriliyorsunuz.", "error");
            else alert("Bağlantı hatası veya yetkisiz erişim. Anasayfaya yönlendiriliyorsunuz.");
            setTimeout(() => { window.location.href = "feed.html"; }, 1500);
        }
    } else { 
        window.location.href = "index.html"; 
    }
});

const secUsers = document.getElementById('users-section');
const secActivity = document.getElementById('activity-section');
const secTickets = document.getElementById('tickets-section');
const btnUsers = document.getElementById('tab-users-btn');
const btnActivity = document.getElementById('tab-activity-btn');
const btnTickets = document.getElementById('tab-tickets-btn');

btnUsers?.addEventListener('click', () => { if(secUsers) secUsers.style.display='block'; if(secActivity) secActivity.style.display='none'; if(secTickets) secTickets.style.display='none'; btnUsers.classList.add('active'); btnActivity?.classList.remove('active'); btnTickets?.classList.remove('active'); });
btnActivity?.addEventListener('click', () => { if(secUsers) secUsers.style.display='none'; if(secActivity) secActivity.style.display='block'; if(secTickets) secTickets.style.display='none'; btnActivity.classList.add('active'); btnUsers?.classList.remove('active'); btnTickets?.classList.remove('active'); });
btnTickets?.addEventListener('click', () => { if(secUsers) secUsers.style.display='none'; if(secActivity) secActivity.style.display='none'; if(secTickets) secTickets.style.display='block'; btnTickets.classList.add('active'); btnUsers?.classList.remove('active'); btnActivity?.classList.remove('active'); });

function loadUsers() {
    const q = query(collection(db, "users"), limit(50));
    onSnapshot(q, (snapshot) => {
        allUsers = [];
        snapshot.forEach(docSnap => { allUsers.push({ id: docSnap.id, ...docSnap.data() }); });
        renderUserList(allUsers);
    });
}

function renderUserList(users) {
    const list = document.getElementById('users-list'); 
    if(!list) return;
    list.innerHTML = '';
    
    if(users.length === 0) { list.innerHTML = '<p style="color:#aaa; text-align:center;">Kullanıcı bulunamadı.</p>'; return; }
    
    users.forEach(user => {
        const isVerified = user.isVerified || false; const isBanned = user.isBanned || false;
        let badgesHtml = ''; if (isVerified) badgesHtml += '<span class="badge bg-blue">VIP</span>'; if (isBanned) badgesHtml += '<span class="badge bg-red">BANLI</span>';

        list.innerHTML += `
            <div class="list-item">
                <div class="user-info">@${user.id} ${badgesHtml}</div>
                <div class="action-btns">
                    <button class="btn-verify" onclick="window.toggleVerify('${user.id}', ${isVerified})">${isVerified ? 'Tiki Al' : 'Tik Ver'}</button>
                    <button class="${isBanned ? 'btn-unban' : 'btn-ban'}" onclick="window.toggleBan('${user.id}', ${isBanned})">${isBanned ? 'Ban Aç' : 'Banla'}</button>
                    <button class="btn-posts" onclick="window.viewUserPosts('${user.id}')">Postlar</button>
                    <button class="btn-delete" onclick="window.deleteUserCompletely('${user.id}')">Sil</button>
                </div>
            </div>
        `;
    });
}

let searchTimeoutAdmin = null;
document.getElementById('admin-user-search')?.addEventListener('input', async (e) => {
    const text = e.target.value.toLowerCase().trim();
    clearTimeout(searchTimeoutAdmin);
    
    if (!text) { renderUserList(allUsers); return; } 

    searchTimeoutAdmin = setTimeout(async () => {
        const list = document.getElementById('users-list');
        if(list) list.innerHTML = '<p style="color:#aaa; text-align:center;">Aranıyor... 🔍</p>';
        try {
            const q = query(collection(db, "users"), orderBy("__name__"), startAt(text), endAt(text + '\uf8ff'), limit(20));
            const snap = await getDocs(q);
            let searchResults = [];
            snap.forEach(d => searchResults.push({ id: d.id, ...d.data() }));
            renderUserList(searchResults);
        } catch(error) { console.error("Admin arama hatası:", error); }
    }, 500); 
});

window.toggleVerify = async function(username, status) { if(confirm("Emin misin?")) await updateDoc(doc(db, "users", username), { isVerified: !status }); };
window.toggleBan = async function(username, status) { if(confirm("Emin misin?")) await updateDoc(doc(db, "users", username), { isBanned: !status }); };

// --- STORAGE (KOTA) KORUMALI KULLANICI SİLME İŞLEMİ ---
window.deleteUserCompletely = async function(username) {
    if(confirm(`DİKKAT! @${username} adlı kullanıcıyı ve TÜM fotoğraflarını sistemden tamamen silmek istediğinize emin misiniz?`)) {
        try {
            // 1. Kullanıcının profil ve kapak fotoğraflarını sil
            const userRef = doc(db, "users", username);
            const userSnap = await getDoc(userRef);
            if(userSnap.exists()) {
                const uData = userSnap.data();
                if(uData.avatarUrl) await deleteObject(ref(storage, uData.avatarUrl)).catch(()=>console.log("Avatar zaten silinmiş veya bulunamadı."));
                if(uData.bannerUrl) await deleteObject(ref(storage, uData.bannerUrl)).catch(()=>console.log("Banner zaten silinmiş veya bulunamadı."));
            }

            // 2. Kullanıcının gönderi fotoğraflarını ve postları sil
            const q = query(collection(db, "posts"), where("author", "==", username));
            const snap = await getDocs(q);
            for (const d of snap.docs) {
                const postData = d.data();
                if(postData.imageUrl && !postData.isRepost) {
                    await deleteObject(ref(storage, postData.imageUrl)).catch(()=>console.log("Post resmi zaten silinmiş veya bulunamadı."));
                }
                await deleteDoc(doc(db, "posts", d.id));
            }

            // 3. Kullanıcı belgesini sil
            await deleteDoc(userRef);
            
            if(window.showToast) window.showToast("Kullanıcı ve tüm verileri kazındı!", "success");
            else alert("Kullanıcı ve tüm verileri kazındı!");
        } catch(error) {
            console.error("Kullanıcı silme hatası:", error);
            if(window.showToast) window.showToast("Silme hatası: " + error.message, "error");
            else alert("Silme hatası: " + error.message);
        }
    }
};

window.viewUserPosts = async function(username) {
    const modal = document.getElementById('admin-posts-modal');
    if(modal) modal.style.display = 'flex';
    const list = document.getElementById('admin-posts-list');
    if(!list) return;
    list.innerHTML = 'Gönderiler aranıyor...';
    
    const q = query(collection(db, "posts"), where("author", "==", username));
    const snap = await getDocs(q);
    
    if(snap.empty) { list.innerHTML = '<p style="color:#aaa;">Bu kullanıcının hiç gönderisi yok.</p>'; return; }
    
    let html = '';
    snap.forEach(d => {
        const data = d.data();
        const cleanContent = DOMPurify.sanitize(data.content || '');
        const imageHtml = data.imageUrl ? `<img src="${data.imageUrl}" style="max-width:100%; border-radius:5px; margin-bottom:10px; pointer-events:none;">` : '';
        html += `
            <div class="admin-post-item" id="admin-post-${d.id}">
                <div class="admin-post-content">${cleanContent}</div>
                ${imageHtml}
                <button class="admin-delete-post-btn" onclick="window.adminDeletePost('${d.id}', '${username}')">🚨 Kurallara Aykırı - Sil ve Bildir</button>
            </div>
        `;
    });
    list.innerHTML = html;
};

// --- STORAGE (KOTA) KORUMALI GÖNDERİ SİLME İŞLEMİ ---
window.adminDeletePost = async function(postId, author) {
    if(confirm("Gönderi kalıcı silinecek, fotoğrafı depodan yok edilecek ve kullanıcıya ceza bildirimi gidecek. Emin misiniz?")) {
        try {
            const postRef = doc(db, "posts", postId);
            const postSnap = await getDoc(postRef);
            
            if(postSnap.exists()) {
                const postData = postSnap.data();
                if(postData.imageUrl && !postData.isRepost) {
                    await deleteObject(ref(storage, postData.imageUrl)).catch(()=>console.log("Resim bulunamadı."));
                }
            }

            await deleteDoc(postRef);
            await addDoc(collection(db, "notifications"), { type: 'admin_delete', sender: ADMIN_USERNAME, recipient: author, createdAt: serverTimestamp() });
            
            // DOM'dan doğrudan temizle
            document.getElementById(`admin-post-${postId}`)?.remove();
            
            if(window.showToast) window.showToast("Gönderi ve fotoğraf kalıcı olarak silindi!", "success");
            else alert("Gönderi ve fotoğraf kalıcı olarak silindi!");
            
        } catch(error) {
            console.error("Gönderi silme hatası:", error);
            if(window.showToast) window.showToast("Gönderi silinemedi.", "error");
            else alert("Gönderi silinemedi.");
        }
    }
};

function loadActivityStream() {
    const qPosts = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(300));
    onSnapshot(qPosts, (snapshot) => {
        recentPostsLog = [];
        snapshot.forEach(docSnap => { recentPostsLog.push({ id: docSnap.id, _actType: 'post', ...docSnap.data() }); });
        const searchInp = document.getElementById('activity-search-input');
        if(searchInp && searchInp.value.startsWith('@')) {
            const currentUsername = searchInp.value.replace('@','');
            renderUserFolders(currentUsername);
        }
    });

    const qNotifs = query(collection(db, "notifications"), orderBy("createdAt", "desc"), limit(400));
    onSnapshot(qNotifs, (snapshot) => {
        recentNotifsLog = [];
        snapshot.forEach(docSnap => { recentNotifsLog.push({ id: docSnap.id, _actType: 'notif', ...docSnap.data() }); });
        const searchInp = document.getElementById('activity-search-input');
        if(searchInp && searchInp.value.startsWith('@')) {
            const currentUsername = searchInp.value.replace('@','');
            renderUserFolders(currentUsername);
        }
    });
}

const actSearchInput = document.getElementById('activity-search-input');
const actAutoList = document.getElementById('activity-autocomplete-list');

actSearchInput?.addEventListener('input', (e) => {
    let text = e.target.value.toLowerCase().trim();
    if(actAutoList) actAutoList.innerHTML = '';
    
    if(!text) { 
        if(actAutoList) actAutoList.style.display = 'none'; 
        const actList = document.getElementById('activity-list'); if(actList) actList.innerHTML = '';
        const actInfo = document.getElementById('activity-info-text'); if(actInfo) actInfo.style.display = 'block';
        return; 
    }
    
    if(text.startsWith('@')) text = text.substring(1);
    
    const filtered = allUsers.filter(u => u.id.toLowerCase().includes(text));
    
    if(filtered.length === 0) { 
        if(actAutoList) actAutoList.style.display = 'none'; 
        return; 
    }
    
    if(actAutoList) {
        actAutoList.style.display = 'block';
        filtered.forEach(u => {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            div.innerHTML = `👤 <span>@${u.id}</span>`;
            div.onclick = () => {
                actSearchInput.value = '@' + u.id; 
                actAutoList.style.display = 'none'; 
                renderUserFolders(u.id); 
            };
            actAutoList.appendChild(div);
        });
    }
});

document.addEventListener('click', function(event) {
    if (actSearchInput && actAutoList && !actSearchInput.contains(event.target) && !actAutoList.contains(event.target)) {
        actAutoList.style.display = 'none';
    }
});

function createLogHtml(log) {
    let timeStr = log.createdAt ? log.createdAt.toDate().toLocaleString('tr-TR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'}) : 'Az önce';
    if (log._actType === 'post') {
        let contentPreview = log.content ? (log.content.length > 50 ? log.content.substring(0, 50) + '...' : log.content) : '(Sadece Fotoğraf)';
        return `
            <div class="activity-item act-post">
                <div class="act-icon">📝</div>
                <div class="act-content">
                    <b>@${log.author}</b> yeni bir gönderi paylaştı: <i>"${contentPreview}"</i>
                    <span class="act-time">${timeStr}</span>
                </div>
            </div>`;
    } else {
        let icon = '🔔'; let actionText = ''; let cssClass = '';
        if (log.type === 'like') { icon = '❤️'; actionText = 'gönderisini beğendi.'; cssClass = 'act-like'; }
        else if (log.type === 'comment') { icon = '💬'; actionText = 'gönderisine yorum yaptı.'; cssClass = 'act-comment'; }
        else if (log.type === 'follow') { icon = '🤝'; actionText = 'takip etmeye başladı.'; cssClass = 'act-follow'; }
        else if (log.type === 'admin_delete') { return ''; } 

        if(log.sender === log.recipient) return ''; 

        return `
            <div class="activity-item ${cssClass}">
                <div class="act-icon">${icon}</div>
                <div class="act-content">
                    <b>@${log.sender}</b>, <b>@${log.recipient}</b> adlı kullanıcının ${actionText}
                    <span class="act-time">${timeStr}</span>
                </div>
            </div>`;
    }
}

function renderUserFolders(username) {
    const actInfo = document.getElementById('activity-info-text'); if(actInfo) actInfo.style.display = 'none';
    const listDiv = document.getElementById('activity-list'); if(!listDiv) return;
    
    let combinedLogs = [...recentPostsLog, ...recentNotifsLog];
    
    let filteredLogs = combinedLogs.filter(log => {
        let u1 = log.author ? log.author.toLowerCase() : "";
        let u2 = log.sender ? log.sender.toLowerCase() : "";
        let u3 = log.recipient ? log.recipient.toLowerCase() : "";
        return (u1 === username || u2 === username || u3 === username);
    });

    filteredLogs.sort((a, b) => {
        let timeA = a.createdAt ? a.createdAt.toMillis() : 0;
        let timeB = b.createdAt ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
    });

    if(filteredLogs.length === 0) {
        listDiv.innerHTML = `<p style="color:#aaa; text-align:center; padding:20px; background:#2c3e50; border-radius:8px;"><b>@${username}</b> adlı kullanıcıya ait son dönemde hiçbir kayıt bulunamadı.</p>`;
        return;
    }

    let catPosts = filteredLogs.filter(l => l._actType === 'post');
    let catLikes = filteredLogs.filter(l => l._actType === 'notif' && l.type === 'like');
    let catComments = filteredLogs.filter(l => l._actType === 'notif' && l.type === 'comment');
    let catFollows = filteredLogs.filter(l => l._actType === 'notif' && l.type === 'follow');
    
    let finalHtml = `<div style="margin-bottom:15px; font-size:15px;"><b>@${username}</b> adlı kişinin arşiv dosyaları:</div>`;

    function buildFolder(title, color, items) {
        if(items.length === 0) return '';
        let html = `<details class="log-folder" style="border-left-color:${color};"><summary>📁 ${title} (${items.length})</summary><div class="folder-content">`;
        items.forEach(l => html += createLogHtml(l));
        html += `</div></details>`;
        return html;
    }

    finalHtml += buildFolder("Paylaşılan Gönderiler", "#3498db", catPosts);
    finalHtml += buildFolder("Beğeni Hareketleri", "#e74c3c", catLikes);
    finalHtml += buildFolder("Yorum Hareketleri", "#2ecc71", catComments);
    finalHtml += buildFolder("Takip Hareketleri", "#9b59b6", catFollows);

    listDiv.innerHTML = finalHtml;
}

function loadTickets() {
    onSnapshot(query(collection(db, "tickets"), orderBy("createdAt", "desc")), (snapshot) => {
        const list = document.getElementById('tickets-list'); if(!list) return;
        list.innerHTML = '';
        
        if(snapshot.empty) { 
            list.innerHTML = '<p style="color:#aaa; text-align:center; padding: 20px;">Bekleyen destek veya şikayet talebi yok. Her şey yolunda! 🎉</p>'; 
            return; 
        }
        
        snapshot.forEach(docSnap => {
            const data = docSnap.data(); 
            let dateStr = data.createdAt ? data.createdAt.toDate().toLocaleString('tr-TR', { day:'2-digit', month:'long', hour:'2-digit', minute:'2-digit'}) : "Az önce";
            
            const cleanMsg = DOMPurify.sanitize(data.message || '');
            
            list.innerHTML += `
                <div class="ticket-item" id="ticket-${docSnap.id}">
                    <div class="ticket-header">
                        <span style="color:#3498db;">Gönderen: <b style="color:white;">@${data.sender || 'Bilinmeyen'}</b></span>
                        <span>${dateStr}</span>
                    </div>
                    <div class="ticket-msg" style="margin-top:10px; margin-bottom:15px; font-style:italic;">"${cleanMsg}"</div>
                    <button class="delete-ticket" onclick="window.deleteTicket('${docSnap.id}')">Çözüldü Olarak İşaretle (Sil)</button>
                    <div style="clear:both;"></div>
                </div>
            `;
        });
    });
}

window.deleteTicket = async function(id) { 
    if(confirm("Bu destek talebini çözüldü olarak işaretleyip listeden silmek istiyor musunuz?")) { 
        await deleteDoc(doc(db, "tickets", id)); 
        document.getElementById(`ticket-${id}`)?.remove();
    } 
};