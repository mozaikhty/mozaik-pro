import { auth } from './firebase-config.js';
import { verifyPasswordResetCode, confirmPasswordReset } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

const btn = document.getElementById('reset-btn');
const passInput = document.getElementById('new-password');
const passConfirmInput = document.getElementById('new-password-confirm');
const errorMsg = document.getElementById('error-message');
const successMsg = document.getElementById('success-message');
const resetForm = document.getElementById('reset-form');
const loadingSpinner = document.getElementById('loading-spinner');
const subtitle = document.getElementById('reset-subtitle');

function showError(msg) { errorMsg.innerText = msg; errorMsg.style.display = 'block'; successMsg.style.display = 'none'; }
function showSuccess(msg) { successMsg.innerText = msg; successMsg.style.display = 'block'; errorMsg.style.display = 'none'; }

// URL'den oobCode (Action Code) al
const urlParams = new URLSearchParams(window.location.search);
const actionCode = urlParams.get('oobCode');

async function initResetFlow() {
    if (!actionCode) {
        loadingSpinner.style.display = 'none';
        showError("Geçersiz veya eksik sıfırlama bağlantısı. Lütfen e-postanızdaki bağlantıyı eksiksiz kopyaladığınızdan emin olun.");
        return;
    }

    try {
        // Kodun geçerli olup olmadığını doğrula (süresi geçmiş mi vs.)
        const email = await verifyPasswordResetCode(auth, actionCode);
        
        // Geçerliyse formu göster
        loadingSpinner.style.display = 'none';
        resetForm.style.display = 'block';
        subtitle.innerText = email + " hesabı için yeni şifre belirleyin.";
        
    } catch (error) {
        console.error(error);
        loadingSpinner.style.display = 'none';
        if (error.code === 'auth/invalid-action-code' || error.code === 'auth/expired-action-code') {
            showError("Bu sıfırlama bağlantısı geçersiz veya süresi dolmuş. Lütfen yeni bir bağlantı talep edin.");
        } else {
            showError("Bağlantı doğrulanırken bir hata oluştu.");
        }
    }
}

initResetFlow();

btn.addEventListener('click', async () => {
    const password = passInput.value;
    const confirmPassword = passConfirmInput.value;
    
    if (!password || !confirmPassword) {
        return showError("Lütfen tüm alanları doldurun.");
    }
    
    if (password.length < 6) {
        return showError("Şifreniz en az 6 karakter olmalıdır.");
    }
    
    if (password !== confirmPassword) {
        return showError("Şifreler eşleşmiyor. Lütfen kontrol edin.");
    }
    
    btn.disabled = true;
    btn.innerText = "Güncelleniyor...";
    
    try {
        await confirmPasswordReset(auth, actionCode, password);
        resetForm.style.display = 'none';
        subtitle.style.display = 'none';
        showSuccess("Şifreniz başarıyla güncellendi! Artık yeni şifrenizle giriş yapabilirsiniz.");
        
        // 3 saniye sonra otomatik yönlendirme
        setTimeout(() => {
            window.location.href = "index.html";
        }, 3000);
        
    } catch (error) {
        console.error(error);
        if (error.code === 'auth/weak-password') {
            showError("Lütfen daha güçlü bir şifre belirleyin.");
        } else {
            showError("Şifre güncellenirken bir hata oluştu. Lütfen tekrar deneyin.");
        }
        btn.disabled = false;
        btn.innerText = "Şifremi Güncelle";
    }
});
