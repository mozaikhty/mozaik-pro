import { collection, doc, getDoc, updateDoc, addDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { db } from './firebase-config.js';

let callListeners = {};
let peerConnection; let localStream; let remoteStream;
let currentCallDocId = null; let currentCallChatId = null; let currentCallCollection = null; let isCallVideo = false;

const callOverlay = document.getElementById('call-overlay');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const servers = { iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }] };

// Gelen aramaları dinleyen ana fonksiyon
window.attachCallListeners = function(activeChats) {
    if(!window.myUsername) return; // Kullanıcı adı henüz yüklenmediyse bekle
    activeChats.forEach(chat => {
        if (!callListeners[chat.id]) {
            const colName = chat.type === 'group' ? "groups" : "chats";
            const callRef = collection(db, colName, chat.id, "calls");
            
            callListeners[chat.id] = onSnapshot(callRef, (snapshot) => {
                snapshot.docChanges().forEach(async (change) => {
                    const callData = change.doc.data();
                    
                    // Biri bizi arıyor
                    if (change.type === 'added' && callData.status === 'ringing' && callData.caller !== window.myUsername) {
                        currentCallDocId = change.doc.id; currentCallChatId = chat.id; currentCallCollection = colName; isCallVideo = callData.type === 'video';
                        document.getElementById('call-status-text').innerText = `@${callData.caller} Arıyor...`;
                        document.getElementById('accept-call-btn').style.display = 'block';
                        if(callOverlay) callOverlay.style.display = 'flex';
                        document.getElementById('video-container').style.display = isCallVideo ? 'flex' : 'none';
                    }
                    
                    // Aramamız açıldı
                    if (change.type === 'modified' && callData.status === 'answered' && callData.caller === window.myUsername && currentCallDocId === change.doc.id) {
                        document.getElementById('call-status-text').innerText = "Bağlandı";
                        const desc = new RTCSessionDescription(callData.answer);
                        await peerConnection.setRemoteDescription(desc);
                    }
                    
                    // Arama sonlandı
                    if (change.type === 'modified' && (callData.status === 'ended' || callData.status === 'missed') && currentCallDocId === change.doc.id) {
                        window.endCallUI();
                    }
                });
            });
        }
    });
}

// Aramayı Kabul Etme
document.getElementById('accept-call-btn')?.addEventListener('click', async () => {
    document.getElementById('accept-call-btn').style.display = 'none';
    document.getElementById('call-status-text').innerText = "Bağlanıyor...";
    const callDocRef = doc(db, currentCallCollection, currentCallChatId, "calls", currentCallDocId);
    const callData = (await getDoc(callDocRef)).data();
    
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: isCallVideo, audio: true });
        if(isCallVideo && localVideo) localVideo.srcObject = localStream;
        
        peerConnection = new RTCPeerConnection(servers);
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        
        remoteStream = new MediaStream();
        if(remoteVideo) remoteVideo.srcObject = remoteStream;
        
        peerConnection.ontrack = event => { event.streams[0].getTracks().forEach(track => { remoteStream.addTrack(track); }); };
        peerConnection.onicecandidate = event => { if(event.candidate) { addDoc(collection(db, currentCallCollection, currentCallChatId, "calls", currentCallDocId, "calleeCandidates"), event.candidate.toJSON()); } };
        
        await peerConnection.setRemoteDescription(new RTCSessionDescription(callData.offer));
        const answerDescription = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answerDescription);
        
        await updateDoc(callDocRef, { answer: { type: answerDescription.type, sdp: answerDescription.sdp }, status: 'answered' });
        
        onSnapshot(collection(db, currentCallCollection, currentCallChatId, "calls", currentCallDocId, "callerCandidates"), (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if(change.type === 'added') { peerConnection.addIceCandidate(new RTCIceCandidate(change.doc.data())); }
            });
        });
        document.getElementById('call-status-text').innerText = "Bağlandı";
    } catch(e) {
        alert("Kamera/Mikrofon erişimi reddedildi!");
        updateDoc(callDocRef, { status: 'ended' });
        window.endCallUI();
    }
});

// Aramayı Reddetme / Bitirme
document.getElementById('end-call-btn')?.addEventListener('click', async () => {
    if(currentCallDocId && currentCallCollection && currentCallChatId) {
        const callRef = doc(db, currentCallCollection, currentCallChatId, "calls", currentCallDocId);
        const callSnap = await getDoc(callRef);
        if(callSnap.exists()) {
            const callData = callSnap.data();
            if(callData.status === 'ringing') {
                await updateDoc(callRef, { status: 'missed' });
                await addDoc(collection(db, currentCallCollection, currentCallChatId, "messages"), { type: 'system', text: callData.type === 'video' ? 'Cevapsız görüntülü arama' : 'Cevapsız sesli arama', sender: window.myUsername, createdAt: serverTimestamp() });
            } else {
                await updateDoc(callRef, { status: 'ended' });
            }
        }
    }
    window.endCallUI();
});

// Arayüzü Sıfırlama
window.endCallUI = function() {
    if (callOverlay) callOverlay.style.display = 'none';
    if(localStream) { localStream.getTracks().forEach(track => track.stop()); }
    if(remoteStream) { remoteStream.getTracks().forEach(track => track.stop()); }
    if(peerConnection) { peerConnection.close(); }
    localStream = null; remoteStream = null; peerConnection = null;
    currentCallDocId = null; currentCallChatId = null; currentCallCollection = null;
    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;
}