// firebase-config.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app-check.js";
import { getToken } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app-check.js";

import { getAuth } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

// Firebase Ayarlarınız
const firebaseConfig = { 
    apiKey: "AIzaSyC07_DzrwOlwWwopQZhUkHL1sj2zPDIT7k", 
    authDomain: "mozaiksosyalmedya.firebaseapp.com", 
    projectId: "mozaiksosyalmedya", 
    storageBucket: "mozaiksosyalmedya.firebasestorage.app", 
    messagingSenderId: "492534131254", 
    appId: "1:492534131254:web:6644008a553294be05c697" 
};

// Uygulamayı Başlat
const app = initializeApp(firebaseConfig); 

// GÖRÜNMEZ SPAM VE BOT KORUMASI (APP CHECK)
if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:') {
        self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
        console.log("App Check: Yerel geliştirme ortamı algılandı, DEBUG TOKEN modu aktif edildi.");
    }
}
const appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider('6LcwbZ4sAAAAAPJm8ty9Edqyjn_-6COG2rj_axCA'),
    isTokenAutoRefreshEnabled: true
});

// --- APP CHECK DEBUG ---
if (typeof window !== 'undefined') {
    getToken(appCheck, false).then(() => {
        console.log("App Check: Token başarıyla alındı.");
    }).catch((error) => {
        console.error("App Check: Token Alınamadı! Hata:", error);
    });
}
// -----------------------


// Diğer sayfalarda kullanmak üzere dışa aktar (Export)
export const auth = getAuth(app); 
export const db = getFirestore(app); 
export const storage = getStorage(app);