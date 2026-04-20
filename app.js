// ==========================================
// MOZAİK - GLOBAL UYGULAMA İŞLEVLERİ (app.js)
// ==========================================

import { signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { auth } from './firebase-config.js';

/**
 * 1. FOTOĞRAF SIKIŞTIRMA ALGORİTMASI
 * Gönderi paylaşırken, profil fotoğrafı güncellerken veya sohbette 
 * medya gönderirken tüm sistem bu fonksiyonu kullanır.
 */
window.compressImage = function(file, maxWidth = 1200, maxHeight = 1200, quality = 0.7) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type.startsWith('image/')) return resolve(file);
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = event => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width; let height = img.height;
                
                if (width > height && width > maxWidth) { 
                    height = Math.round(height * (maxWidth / width)); 
                    width = maxWidth; 
                } else if (height > maxHeight) { 
                    width = Math.round(width * (maxHeight / height)); 
                    height = maxHeight; 
                }
                
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob(blob => {
                    if(blob) {
                        const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", { type: 'image/webp', lastModified: Date.now() });
                        resolve(compressedFile);
                    } else { 
                        resolve(file); 
                    }
                }, 'image/webp', quality);
            };
            img.onerror = error => reject(error);
        };
        reader.onerror = error => reject(error);
    });
};

/**
 * 2. ÇIKIŞ YAPMA İŞLEVİ (LOGOUT)
 * Tüm sayfalardaki sol menü (veya mobil alt menü) üzerinden tetiklenir.
 */
window.logoutUser = function() { 
    signOut(auth).then(() => { 
        // Varsa yerel önbellekteki verileri temizle
        localStorage.removeItem('mozaik_username'); 
        // Giriş sayfasına yönlendir
        window.location.href = "index.html"; 
    }).catch((error) => {
        console.error("Çıkış yapılırken hata oluştu:", error);
        alert("Çıkış yapılamadı, lütfen tekrar deneyin.");
    });
};

/**
 * 3. BİLDİRİM (TOAST) GÖSTERİCİ
 * JS dosyalarımızda kullanılan window.showToast fonksiyonunun global karşılığı.
 */
window.showToast = function(message, type = 'info') {
    // Şimdilik alert olarak gösteriyoruz, isterseniz ileride buraya 
    // ekranda beliren şık bir bildirim (toast) UI'ı kodlayabilirsiniz.
    if(type === 'error') {
        console.error(message);
        alert("Hata: " + message);
    } else if(type === 'success') {
        console.log("Başarılı: " + message);
        // alert(message); // Başarılı mesajlarını alert ile bölmemek için yoruma alındı
    } else {
        console.log(message);
    }
};