// ==========================================
// MOZAİK - MERKEZİ WebRTC ARAMA MODÜLÜ (webrtc.js)
// ==========================================
// Tüm sesli/görüntülü arama mantığı bu dosyada toplanmıştır.
// chat.js, search.js, feed.js, profile.js → sadece window.startCall() ve
// window.attachCallListeners() çağırır; kendi yerel kopyalarını tutmaz.

import { collection, doc, getDoc, updateDoc, addDoc, setDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { db } from './firebase-config.js';

// =====================================
// 1. DURUM DEĞİŞKENLERİ (TEK KAYNAK)
// =====================================
let callListeners = {};
let peerConnection = null;
let localStream = null;
let remoteStream = null;
let currentCallDocId = null;
let currentCallChatId = null;
let currentCallCollection = null;
let isCallVideo = false;
let callTimeoutId = null;           // 30 sn zaman aşımı timer'ı
let isInCall = false;               // Çift arama koruması
let remoteDescriptionSet = false;   // ICE candidate race condition koruması
let pendingCandidates = [];         // setRemoteDescription öncesi biriken candidate'lar

// =====================================
// 2. DOM REFERANSLARI
// =====================================
const callOverlay = document.getElementById('call-overlay');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const callStatusText = document.getElementById('call-status-text');
const acceptCallBtn = document.getElementById('accept-call-btn');
const endCallBtn = document.getElementById('end-call-btn');
const videoContainer = document.getElementById('video-container');

// =====================================
// 3. STUN/TURN SUNUCU YAPILANDIRMASI
// =====================================
// TURN sunucuları NAT arkasındaki kullanıcılar (mobil veri, kurumsal ağlar,
// çoğu WiFi ağı) arasında bağlantı kurulabilmesi için ZORUNLUDUR.
const servers = {
    iceServers: [
        { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
        { urls: "turn:a.relay.metered.ca:80", username: "5e02baae988ebf25bd9eec65", credential: "q/9eO+rV0H/sA75Q" },
        { urls: "turn:a.relay.metered.ca:443", username: "5e02baae988ebf25bd9eec65", credential: "q/9eO+rV0H/sA75Q" },
        { urls: "turn:a.relay.metered.ca:443?transport=tcp", username: "5e02baae988ebf25bd9eec65", credential: "q/9eO+rV0H/sA75Q" }
    ],
    iceCandidatePoolSize: 10
};

// =====================================
// 4. ARAMA ZAMANI AŞIMI (30 SN)
// =====================================
const CALL_TIMEOUT_MS = 30000;

function startCallTimeout() {
    clearCallTimeout();
    callTimeoutId = setTimeout(async () => {
        // Hâlâ çalıyor durumundaysa zaman aşımına düşür
        if (currentCallDocId && currentCallCollection && currentCallChatId) {
            try {
                const callRef = doc(db, currentCallCollection, currentCallChatId, "calls", currentCallDocId);
                const callSnap = await getDoc(callRef);
                if (callSnap.exists() && callSnap.data().status === 'ringing') {
                    await updateDoc(callRef, { status: 'missed' });
                    await addDoc(collection(db, currentCallCollection, currentCallChatId, "messages"), {
                        type: 'system',
                        text: isCallVideo ? 'Cevapsız görüntülü arama' : 'Cevapsız sesli arama',
                        sender: window.myUsername,
                        createdAt: serverTimestamp()
                    });
                }
            } catch (e) { /* sessiz hata */ }
        }
        window.endCallUI();
    }, CALL_TIMEOUT_MS);
}

function clearCallTimeout() {
    if (callTimeoutId) {
        clearTimeout(callTimeoutId);
        callTimeoutId = null;
    }
}

// =====================================
// 5. GELEN ARAMALARI DİNLEME
// =====================================
window.attachCallListeners = function(activeChats) {
    if (!window.myUsername) return;

    activeChats.forEach(chat => {
        if (!callListeners[chat.id]) {
            const colName = chat.type === 'group' ? "groups" : "chats";
            const callRef = collection(db, colName, chat.id, "calls");

            callListeners[chat.id] = onSnapshot(callRef, (snapshot) => {
                snapshot.docChanges().forEach(async (change) => {
                    const callData = change.doc.data();

                    // --- GELEN ARAMA ---
                    if (change.type === 'added' && callData.status === 'ringing' && callData.caller !== window.myUsername) {
                        // Zaten bir aramadaysak yeni aramayı otomatik reddet
                        if (isInCall) return;

                        isInCall = true;
                        currentCallDocId = change.doc.id;
                        currentCallChatId = chat.id;
                        currentCallCollection = colName;
                        isCallVideo = callData.type === 'video';

                        // Arayüzü aç
                        if (callStatusText) callStatusText.innerText = `@${callData.caller} Arıyor...`;
                        if (acceptCallBtn) acceptCallBtn.style.display = 'block';
                        if (callOverlay) callOverlay.style.display = 'flex';
                        if (videoContainer) videoContainer.style.display = isCallVideo ? 'flex' : 'none';
                    }

                    // --- ARAMAMIZ KABUL EDİLDİ ---
                    if (change.type === 'modified' && callData.status === 'answered' && callData.caller === window.myUsername && currentCallDocId === change.doc.id) {
                        clearCallTimeout();
                        if (callStatusText) callStatusText.innerText = "Bağlandı";

                        try {
                            const desc = new RTCSessionDescription(callData.answer);
                            await peerConnection.setRemoteDescription(desc);
                            remoteDescriptionSet = true;

                            // Biriken callee ICE candidate'ları ekle
                            for (const c of pendingCandidates) {
                                await peerConnection.addIceCandidate(new RTCIceCandidate(c));
                            }
                            pendingCandidates = [];
                        } catch (e) {
                            console.error("Bağlantı kurma hatası:", e.code || e.message || "Bilinmeyen hata");
                        }
                    }

                    // --- ARAMA SONLANDI ---
                    if (change.type === 'modified' && (callData.status === 'ended' || callData.status === 'missed') && currentCallDocId === change.doc.id) {
                        window.endCallUI();
                    }
                });
            });
        }
    });
};

// =====================================
// 6. ARAMA BAŞLATMA (CALLER - Arayan Taraf)
// =====================================
// chat.js'den çağrılır: window.startCall(chatId, 'chats', true, myUsername)
window.startCall = async function(chatId, collectionName, isVideo, callerUsername) {
    // Çift arama koruması
    if (isInCall) {
        alert("Zaten bir aramada olduğunuz için yeni arama başlatılamaz.");
        return;
    }
    isInCall = true;
    isCallVideo = isVideo;
    remoteDescriptionSet = false;
    pendingCandidates = [];

    // Arayüzü göster
    if (callStatusText) callStatusText.innerText = "Aranıyor...";
    if (acceptCallBtn) acceptCallBtn.style.display = 'none';
    if (callOverlay) callOverlay.style.display = 'flex';
    if (videoContainer) videoContainer.style.display = isVideo ? 'flex' : 'none';

    try {
        // Medya erişimi al
        localStream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true });
        if (isVideo && localVideo) localVideo.srcObject = localStream;

        // PeerConnection oluştur
        peerConnection = new RTCPeerConnection(servers);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        remoteStream = new MediaStream();
        if (remoteVideo) remoteVideo.srcObject = remoteStream;

        peerConnection.ontrack = event => {
            event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
        };

        // Bağlantı durumu izleme
        setupConnectionMonitoring();

        // Firestore referansları
        currentCallCollection = collectionName;
        currentCallChatId = chatId;
        const callDocRef = doc(collection(db, collectionName, chatId, "calls"));
        currentCallDocId = callDocRef.id;

        // ICE Candidate'ları yaz (caller tarafı)
        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                addDoc(collection(db, collectionName, chatId, "calls", currentCallDocId, "callerCandidates"), event.candidate.toJSON());
            }
        };

        // Offer oluştur ve Firestore'a yaz
        const offerDescription = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offerDescription);

        await setDoc(callDocRef, {
            offer: { type: offerDescription.type, sdp: offerDescription.sdp },
            caller: callerUsername,
            type: isVideo ? 'video' : 'audio',
            status: 'ringing',
            createdAt: serverTimestamp()
        });

        // Callee ICE Candidate'larını dinle
        onSnapshot(collection(db, collectionName, chatId, "calls", currentCallDocId, "calleeCandidates"), (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const candidateData = change.doc.data();
                    if (remoteDescriptionSet && peerConnection) {
                        peerConnection.addIceCandidate(new RTCIceCandidate(candidateData));
                    } else {
                        // Remote description henüz ayarlanmadıysa biriktir
                        pendingCandidates.push(candidateData);
                    }
                }
            });
        });

        // 30 saniye zaman aşımı başlat
        startCallTimeout();

    } catch (e) {
        alert("Kamera/Mikrofon erişimi reddedildi veya başka bir hata oluştu.");
        window.endCallUI();
    }
};

// =====================================
// 7. ARAMAYI KABUL ETME (CALLEE - Aranan Taraf)
// =====================================
acceptCallBtn?.addEventListener('click', async () => {
    if (acceptCallBtn) acceptCallBtn.style.display = 'none';
    if (callStatusText) callStatusText.innerText = "Bağlanıyor...";

    const callDocRef = doc(db, currentCallCollection, currentCallChatId, "calls", currentCallDocId);
    let callData;
    try {
        const callSnap = await getDoc(callDocRef);
        callData = callSnap.data();
    } catch (e) {
        alert("Arama verisi alınamadı.");
        window.endCallUI();
        return;
    }

    // Arama artık ringing değilse (zaman aşımı veya iptal)
    if (!callData || callData.status !== 'ringing') {
        alert("Arama artık geçerli değil.");
        window.endCallUI();
        return;
    }

    try {
        // Medya erişimi al
        localStream = await navigator.mediaDevices.getUserMedia({ video: isCallVideo, audio: true });
        if (isCallVideo && localVideo) localVideo.srcObject = localStream;

        // PeerConnection oluştur
        peerConnection = new RTCPeerConnection(servers);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        remoteStream = new MediaStream();
        if (remoteVideo) remoteVideo.srcObject = remoteStream;

        peerConnection.ontrack = event => {
            event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
        };

        // Bağlantı durumu izleme
        setupConnectionMonitoring();

        // ICE Candidate'ları yaz (callee tarafı)
        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                addDoc(collection(db, currentCallCollection, currentCallChatId, "calls", currentCallDocId, "calleeCandidates"), event.candidate.toJSON());
            }
        };

        // Remote Description ayarla (offer) → Answer oluştur → Local Description ayarla
        await peerConnection.setRemoteDescription(new RTCSessionDescription(callData.offer));
        const answerDescription = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answerDescription);

        // Answer'ı ve durumu Firestore'a yaz
        await updateDoc(callDocRef, {
            answer: { type: answerDescription.type, sdp: answerDescription.sdp },
            status: 'answered'
        });

        // Caller ICE Candidate'larını dinle
        onSnapshot(collection(db, currentCallCollection, currentCallChatId, "calls", currentCallDocId, "callerCandidates"), (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added' && peerConnection) {
                    peerConnection.addIceCandidate(new RTCIceCandidate(change.doc.data()));
                }
            });
        });

        if (callStatusText) callStatusText.innerText = "Bağlandı";

    } catch (e) {
        alert("Kamera/Mikrofon erişimi reddedildi!");
        try { await updateDoc(callDocRef, { status: 'ended' }); } catch (err) { /* sessiz */ }
        window.endCallUI();
    }
});

// =====================================
// 8. ARAMAYI REDDETME / BİTİRME
// =====================================
endCallBtn?.addEventListener('click', async () => {
    if (currentCallDocId && currentCallCollection && currentCallChatId) {
        try {
            const callRef = doc(db, currentCallCollection, currentCallChatId, "calls", currentCallDocId);
            const callSnap = await getDoc(callRef);
            if (callSnap.exists()) {
                const callData = callSnap.data();
                if (callData.status === 'ringing') {
                    await updateDoc(callRef, { status: 'missed' });
                    await addDoc(collection(db, currentCallCollection, currentCallChatId, "messages"), {
                        type: 'system',
                        text: callData.type === 'video' ? 'Cevapsız görüntülü arama' : 'Cevapsız sesli arama',
                        sender: window.myUsername || callData.caller,
                        createdAt: serverTimestamp()
                    });
                } else {
                    await updateDoc(callRef, { status: 'ended' });
                }
            }
        } catch (e) { /* sessiz hata */ }
    }
    window.endCallUI();
});

// =====================================
// 9. BAĞLANTI DURUMU İZLEME
// =====================================
function setupConnectionMonitoring() {
    if (!peerConnection) return;

    peerConnection.oniceconnectionstatechange = () => {
        const state = peerConnection?.iceConnectionState;
        if (state === 'disconnected') {
            if (callStatusText) callStatusText.innerText = "Bağlantı koptu, yeniden bağlanılıyor...";
        }
        if (state === 'failed') {
            if (callStatusText) callStatusText.innerText = "Bağlantı kurulamadı.";
            // 3 saniye sonra temizle
            setTimeout(() => window.endCallUI(), 3000);
        }
        if (state === 'connected' || state === 'completed') {
            if (callStatusText) callStatusText.innerText = "Bağlandı";
        }
    };

    peerConnection.onconnectionstatechange = () => {
        const state = peerConnection?.connectionState;
        if (state === 'failed' || state === 'closed') {
            window.endCallUI();
        }
    };
}

// =====================================
// 10. ARAYÜZÜ SIFIRLAMA VE TEMİZLEME
// =====================================
window.endCallUI = function() {
    clearCallTimeout();

    if (callOverlay) callOverlay.style.display = 'none';
    if (acceptCallBtn) acceptCallBtn.style.display = 'none';

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnection) {
        peerConnection.ontrack = null;
        peerConnection.onicecandidate = null;
        peerConnection.oniceconnectionstatechange = null;
        peerConnection.onconnectionstatechange = null;
        peerConnection.close();
    }

    localStream = null;
    remoteStream = null;
    peerConnection = null;
    currentCallDocId = null;
    currentCallChatId = null;
    currentCallCollection = null;
    isInCall = false;
    remoteDescriptionSet = false;
    pendingCandidates = [];

    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;
};