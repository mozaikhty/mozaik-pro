import { auth } from './firebase-config.js';
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

const btn = document.getElementById('send-reset-btn');
const emailInput = document.getElementById('forgot-email');
const errorMsg = document.getElementById('error-message');
const successMsg = document.getElementById('success-message');

function showError(msg) { errorMsg.innerText = msg; errorMsg.style.display = 'block'; successMsg.style.display = 'none'; }
function showSuccess(msg) { successMsg.innerText = msg; successMsg.style.display = 'block'; errorMsg.style.display = 'none'; }

btn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    if (!email) {
        return showError("Lütfen e-posta adresinizi girin.");
    }
    
    btn.disabled = true;
    btn.innerText = "Gönderiliyor...";
    
    try {
        let actionCodeSettings = null;
        
        // Eğer uygulama file:// protokolü ile çalışmıyorsa (yani HTTP/HTTPS ise) özel yönlendirmeyi kullan.
        // file:// protokolünde Firebase yönlendirmeyi reddedeceği için varsayılan Firebase ekranına düşmesine izin ver.
        if (window.location.protocol !== 'file:') {
            actionCodeSettings = {
                url: window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/reset-password.html'),
                handleCodeInApp: false
            };
        }
        
        if (actionCodeSettings) {
            await sendPasswordResetEmail(auth, email, actionCodeSettings);
        } else {
            await sendPasswordResetEmail(auth, email);
        }
        
        showSuccess("Şifre sıfırlama linki e-posta adresinize başarıyla gönderildi! (Lütfen Spam/Gereksiz kutunuzu da kontrol edin.)");
        emailInput.value = '';
    } catch (error) {
        console.error("Firebase Auth Hatası:", error);
        
        // Gerçek Firebase hatalarını Türkçeleştirip ekrana basıyoruz
        if (error.code === 'auth/user-not-found') {
            showError("Bu e-posta adresine kayıtlı bir hesap bulunamadı.");
        } else if (error.code === 'auth/invalid-email') {
            showError("Lütfen geçerli bir e-posta adresi girin.");
        } else if (error.code === 'auth/unauthorized-continue-uri') {
            showError("Sistem Hatası: Yönlendirme URL'si Firebase Console'da yetkilendirilmemiş. (Authorized Domains ayarlarını kontrol edin)");
        } else if (error.code === 'auth/too-many-requests') {
            showError("Çok fazla istekte bulundunuz. Lütfen biraz bekleyip tekrar deneyin.");
        } else {
            showError("Bir hata oluştu: " + (error.message || "Bilinmeyen hata"));
        }
    } finally {
        btn.disabled = false;
        btn.innerText = "Sıfırlama Bağlantısı Gönder";
    }
});
