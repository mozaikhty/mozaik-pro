// ==========================================
// MOZAİK - ORTAK PAYLAŞIMLI FONKSİYONLAR (shared.js)
// ==========================================
// Bu dosya, birden fazla sayfa dosyasında (feed, chat, profile, notifications, search)
// tekrar eden fonksiyonları tek bir yerde toplar. Her sayfa dosyası bu modülü import eder.

import { collection, addDoc, doc, getDoc, setDoc, updateDoc, arrayUnion, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { db } from './firebase-config.js';

// =====================================
// 0. GÜVENLİK YARDIMCI FONKSİYONLARI
// =====================================

/**
 * HTML özel karakterlerini escape eder. XSS saldırılarını önler.
 * Kullanıcı verileri (fullName, location, username vb.) innerHTML'e
 * yerleştirilmeden ÖNCE bu fonksiyondan geçirilmelidir.
 */
window.escapeHtml = function(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/`/g, '&#96;');
};

/**
 * URL'lerin güvenli olduğunu doğrular. Yalnızca https:// ile başlayan
 * URL'leri kabul eder. javascript:, data:, vbscript: gibi tehlikeli
 * protokolleri engeller. Geçersiz URL'ler için boş string döner.
 */
window.sanitizeUrl = function(url) {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) return trimmed;
    return '';
};

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
            const safeAvatarUrl = window.sanitizeUrl(uData.avatarUrl);
            let avatarHtml = safeAvatarUrl ? `<img src="${safeAvatarUrl}" style="width:100%;height:100%;object-fit:cover;">` : `👤`; 
            let vHtml = uData.isVerified ? '<span class="verified-badge" style="font-size:14px; margin-left:4px;">☑️</span>' : '';
            let safeName = window.escapeHtml(uData.fullName || uname);
            const safeUname = window.escapeHtml(uname);
            html += `<div onclick="window.location.href='profile.html?user=${safeUname}'" class="user-row"><div class="row-avatar">${avatarHtml}</div><div><div style="font-weight:700; color:#0f172a;">${safeName} ${vHtml}</div><div style="font-size:13px; color:#64748b;">@${safeUname}</div></div></div>`;
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
    if (message.length > 2000) { window.showToast?.("Mesajınız en fazla 2000 karakter olabilir.", "error") || alert("Mesajınız en fazla 2000 karakter olabilir."); return; }
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
        console.error("Destek bileti gönderilemedi:", error.code || "Bilinmeyen hata");
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
        console.error("Hızlı takip hatası:", e.code || "Bilinmeyen hata");
    }
};

// =====================================
// 7. AKILLI GÖRSEL SIKIŞTIRMA (CANVAS API)
// =====================================
// Kullanıcı 5 MB - 10 MB fotoğraf seçse dahi çözünürlüğü optimize eder,
// .webp formatına çevirir ve dosya boyutunu maksimum 800 KB (500 KB - 1 MB) altına indirir.

window.compressImage = function(file, maxWidth = 1200, maxHeight = 1200, quality = 0.75, maxSizeBytes = 800 * 1024) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type.startsWith('image/')) return resolve(file);
        
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = event => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // En boy oranını koruyarak maksimum sınırları uygula
                if (width > height && width > maxWidth) {
                    height = Math.round(height * (maxWidth / width));
                    width = maxWidth;
                } else if (height > maxHeight) {
                    width = Math.round(width * (maxHeight / height));
                    height = maxHeight;
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Kademeli sıkıştırma: Dosya hedef boyutu aşarsa kaliteyi düşür
                const tryCompress = (q) => {
                    canvas.toBlob(blob => {
                        if (!blob) return resolve(file);
                        
                        // Hedef boyuttan büyükse ve kalite 0.4'ün üzerindeyse kaliteyi azaltıp tekrar dene
                        if (blob.size > maxSizeBytes && q > 0.4) {
                            tryCompress(q - 0.15);
                        } else {
                            const newFileName = file.name.replace(/\.[^/.]+$/, "") + ".webp";
                            const compressedFile = new File([blob], newFileName, {
                                type: 'image/webp',
                                lastModified: Date.now()
                            });
                            resolve(compressedFile);
                        }
                    }, 'image/webp', q);
                };
                
                tryCompress(quality);
            };
            img.onerror = error => reject(error);
        };
        reader.onerror = error => reject(error);
    });
};

