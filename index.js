import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendPasswordResetEmail, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

window.kayitIslemiDevamEdiyor = false; 

onAuthStateChanged(auth, (user) => { 
    if (user && !window.kayitIslemiDevamEdiyor) window.location.href = "feed.html"; 
});

const loginSection = document.getElementById('login-section');
const registerSection = document.getElementById('register-section');
const errorMsg = document.getElementById('error-message');
const successMsg = document.getElementById('success-message');
const subtitle = document.getElementById('form-subtitle');

function showError(msg) { errorMsg.innerText = msg; errorMsg.style.display = 'block'; successMsg.style.display = 'none'; }
function showSuccess(msg) { successMsg.innerText = msg; successMsg.style.display = 'block'; errorMsg.style.display = 'none'; }

document.getElementById('show-register').addEventListener('click', () => { loginSection.style.display = 'none'; registerSection.style.display = 'block'; errorMsg.style.display = 'none'; subtitle.innerText = "Aramıza katıl."; });
document.getElementById('show-login').addEventListener('click', () => { registerSection.style.display = 'none'; loginSection.style.display = 'block'; errorMsg.style.display = 'none'; subtitle.innerText = "Dünyana bağlan."; });

document.getElementById('login-btn').addEventListener('click', async () => {
    const identifier = document.getElementById('login-email').value.trim(); 
    const pass = document.getElementById('login-pass').value;
    
    if(!identifier || !pass) return showError("Lütfen tüm alanları doldurun.");
    
    const btn = document.getElementById('login-btn'); 
    btn.disabled = true; btn.innerText = "Bekleyin...";
    
    try {
        let loginEmail = identifier;
        
        if (!identifier.includes('@')) {
            const userDoc = await getDoc(doc(db, "users", identifier.toLowerCase()));
            if (userDoc.exists() && userDoc.data().email) {
                loginEmail = userDoc.data().email; 
            } else {
                throw new Error("user-not-found");
            }
        }
        
        await signInWithEmailAndPassword(auth, loginEmail, pass);
        
    } catch (error) { 
        if (error.message === "user-not-found") showError("Bu kullanıcı adıyla kayıtlı bir hesap bulunamadı.");
        else showError("E-posta/Kullanıcı adı veya şifre hatalı."); 
        btn.disabled = false; btn.innerText = "Giriş Yap"; 
    }
});

document.getElementById('register-btn').onclick = async function(e) {
    e.preventDefault(); 
    
    if (window.kayitIslemiDevamEdiyor) return; 
    
    let username = document.getElementById('reg-username').value.trim().toLowerCase();
    const fullName = document.getElementById('reg-fullname').value.trim();
    const email = document.getElementById('reg-email').value.trim(); 
    const birthDate = document.getElementById('reg-birthdate').value;
    const gender = document.getElementById('reg-gender').value;
    const location = document.getElementById('reg-location').value.trim();
    const pass = document.getElementById('reg-pass').value;
    const passConfirm = document.getElementById('reg-pass-confirm').value;
    
    if(!username || !fullName || !email || !birthDate || !gender || !location || !pass || !passConfirm) {
        return showError("Lütfen tüm bilgileri eksiksiz doldurun.");
    }
    if(username.includes(' ')) return showError("Kullanıcı adında boşluk olamaz.");
    if(pass.length < 6) return showError("Şifre en az 6 karakter olmalıdır.");
    if(pass !== passConfirm) return showError("Şifreler birbiriyle eşleşmiyor!");
    if(!/\d/.test(pass) || !/[a-zA-Z]/.test(pass)) return showError("Şifreniz en az bir harf ve bir rakam içermelidir.");

    window.kayitIslemiDevamEdiyor = true; 
    const btn = document.getElementById('register-btn'); 
    btn.disabled = true; 
    btn.innerText = "Kaydediliyor...";
    
    try {
        const userRef = doc(db, "users", username); 
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) { 
            btn.disabled = false; btn.innerText = "Kayıt Ol ve Katıl"; 
            window.kayitIslemiDevamEdiyor = false; 
            return showError("Bu kullanıcı adı zaten alınmış!"); 
        }

        let user;
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
            user = userCredential.user;
            await updateProfile(user, { displayName: username });
            await user.getIdToken(true); 
        } catch (authError) {
            console.error("Auth Kayıt Hatası:", authError);
            window.kayitIslemiDevamEdiyor = false;
            btn.disabled = false; btn.innerText = "Kayıt Ol ve Katıl";
            if(authError.code === 'auth/email-already-in-use') return showError("Bu e-posta adresi zaten kullanılıyor.");
            return showError("Hata: " + authError.message);
        }

        try {
            await setDoc(doc(db, "users", username), {
                email: email, fullName: fullName, birthDate: birthDate, gender: gender, location: location,
                followers: [], following: [], followRequests: [], bio: "Merhaba, ben Mozaik'te yeniyim!", 
                isPrivate: false, isVerified: false, isBanned: false, createdAt: serverTimestamp()
            });
            
            localStorage.setItem('mozaik_username', username);
            
        } catch (firestoreError) {
            console.error("Firestore Yazma Hatası:", firestoreError);
            window.kayitIslemiDevamEdiyor = false;
            btn.disabled = false; btn.innerText = "Kayıt Ol ve Katıl";
            return showError("Veritabanına yazılamadı! Lütfen konsolu kontrol edin.");
        }
        
        window.location.href = "feed.html"; 
        
    } catch (error) { 
        console.error("Beklenmeyen Hata:", error); 
        window.kayitIslemiDevamEdiyor = false; 
        showError("Sistemde beklenmeyen bir hata oluştu.");
        btn.disabled = false; btn.innerText = "Kayıt Ol ve Katıl"; 
    }
};

const forgotModal = document.getElementById('forgot-modal');
document.getElementById('open-forgot-modal').addEventListener('click', () => { forgotModal.style.display = 'flex'; });
document.getElementById('close-forgot-modal').addEventListener('click', () => { forgotModal.style.display = 'none'; });

document.getElementById('send-reset-btn').addEventListener('click', async () => {
    const email = document.getElementById('forgot-email').value.trim();
    if(!email) return alert("Lütfen e-posta adresinizi girin.");
    const btn = document.getElementById('send-reset-btn'); btn.disabled = true; btn.innerText = "Gönderiliyor...";
    try {
        await sendPasswordResetEmail(auth, email);
        forgotModal.style.display = 'none';
        showSuccess("Şifre sıfırlama linki e-postanıza gönderildi!");
    } catch(error) { alert("Hata: " + error.message); } 
    finally { btn.disabled = false; btn.innerText = "Sıfırlama Linki Gönder"; document.getElementById('forgot-email').value = ''; }
});