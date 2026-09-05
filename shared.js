// ==========================================
// MOZAİK - ORTAK PAYLAŞIMLI FONKSİYONLAR (shared.js)
// ==========================================
// Bu dosya, birden fazla sayfa dosyasında (feed, chat, profile, notifications, search)
// tekrar eden fonksiyonları tek bir yerde toplar. Her sayfa dosyası bu modülü import eder.

import { collection, addDoc, doc, getDoc, setDoc, updateDoc, arrayUnion, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { db } from './firebase-config.js';

// =====================================
// 1. EKSİK KULLANICI VERİLERİNİ ÇEKME
// =====================================
// Her sayfa kendi allUsersData nesnesini tutar ve window.allUsersData olarak paylaşır.
// Bu fonksiyon, verisi henüz çekilmemiş kullanıcıları toplu olarak Firestore'dan yükler.

window.fetchMissingUsers = async function(usernamesArray) {
    const allUsersData = window.allUsersData || {};
    const missing = usernamesArray.filter(u => u && !allUsersData[u]);
    if (missing.length === 0) return;
    await Promise.all(missing.map(async (uname) => {
        try {
            const uSnap = await getDoc(doc(db, "users", uname));
            if (uSnap.exists()) allUsersData[uname] = uSnap.data();
        } catch(e) {}
    }));
};

// =====================================
// 2. KULLANICI LİSTESİ MODALI
// =====================================

window.showUserList = function(title, userArray) {
    const allUsersData = window.allUsersData || {};
    const titleEl = document.getElementById('users-list-title'); 
    if(titleEl) titleEl.innerText = title;
    const container = document.getElementById('users-list-container'); 
    if(!container) return;
    container.innerHTML = '';
    if(userArray.length === 0) { 
        container.innerHTML = '<p style="text-align:center; color:#64748b; padding:20px;">Liste boş.</p>'; 
    } else {
        let html = '';
        userArray.forEach(uname => {
            let uData = allUsersData[uname] || {}; 
            let avatarHtml = uData.avatarUrl ? `<img src="${uData.avatarUrl}" style="width:100%;height:100%;object-fit:cover;">` : `👤`; 
            let vHtml = uData.isVerified ? '<span class="verified-badge" style="font-size:14px; margin-left:4px;">☑️</span>' : '';
            // DOMPurify varsa sanitize et, yoksa düz metin kullan
            let safeName = (typeof DOMPurify !== 'undefined') ? DOMPurify.sanitize(uData.fullName || uname) : (uData.fullName || uname);
            html += `<div onclick="window.location.href='profile.html?user=${uname}'" class="user-row"><div class="row-avatar">${avatarHtml}</div><div><div style="font-weight:700; color:#0f172a;">${safeName} ${vHtml}</div><div style="font-size:13px; color:#64748b;">@${uname}</div></div></div>`;
        });
        container.innerHTML = html;
    }
    document.getElementById('users-list-modal').style.display = 'flex';
};

// Kullanıcı listesi modalını kapatma
document.getElementById('close-list-btn')?.addEventListener('click', () => { 
    document.getElementById('users-list-modal').style.display = 'none'; 
});

// =====================================
// 3. TAKİP LİSTELERİNİ GÖSTERME
// =====================================

window.showMyFollowing = function() { 
    window.closeMobileSidebar(); 
    const allUsersData = window.allUsersData || {};
    const myUsername = window.myUsername;
    if (allUsersData[myUsername]) { 
        window.showUserList("Ağım", allUsersData[myUsername].following || []); 
    } 
};

window.showMyFollowers = function() { 
    window.closeMobileSidebar(); 
    const allUsersData = window.allUsersData || {};
    const myUsername = window.myUsername;
    if (allUsersData[myUsername]) { 
        window.showUserList("Takipçiler", allUsersData[myUsername].followers || []); 
    } 
};

// =====================================
// 4. DESTEK MODALI VE MESAJ GÖNDERME
// =====================================

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
        const myUsername = window.myUsername;
        // DOMPurify varsa sanitize et
        const safeMessage = (typeof DOMPurify !== 'undefined') ? DOMPurify.sanitize(message) : message;
        await addDoc(collection(db, "tickets"), {
            sender: myUsername || "Bilinmeyen Kullanıcı",
            message: safeMessage,
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

// =====================================
// 5. MOBİL SIDEBAR AÇMA/KAPAMA
// =====================================

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

// =====================================
// 6. HIZLI TAKİP ETME (QUICK FOLLOW)
// =====================================

window.quickFollow = async function(targetUser) {
    try {
        const myUsername = window.myUsername;
        const allUsersData = window.allUsersData || {};
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
