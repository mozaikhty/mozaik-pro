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
        const actionCodeSettings = {
            url: window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/reset-password.html'),
            handleCodeInApp: false
        };
        await sendPasswordResetEmail(auth, email, actionCodeSettings);
        showSuccess("Eğer bu e-posta sistemde kayıtlıysa, şifre sıfırlama linki gönderilmiştir.");
        emailInput.value = '';
    } catch (error) {
        console.error(error);
        // Güvenlik: Aynı mesajı göster
        showSuccess("Eğer bu e-posta sistemde kayıtlıysa, şifre sıfırlama linki gönderilmiştir.");
    } finally {
        btn.disabled = false;
        btn.innerText = "Sıfırlama Bağlantısı Gönder";
    }
});
