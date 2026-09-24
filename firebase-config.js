// firebase-config.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app-check.js";
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
const appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider('6LcwbZ4sAAAAAPJm8ty9Edqyjn_-6COG2rj_axCA'),
    isTokenAutoRefreshEnabled: true
});

// Diğer sayfalarda kullanmak üzere dışa aktar (Export)
export const auth = getAuth(app); 
export const db = getFirestore(app); 
export const storage = getStorage(app);