// feed.js
import { db } from './firebase-config.js';
import { MozaikApp } from './app.js';
import { collection, query, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// DOM Elementleri
const feedContainer = document.createElement('div');
feedContainer.className = 'feed-main-content'; // CSS'e eklenmesi gereken feed iskeleti
document.getElementById('app-root').appendChild(feedContainer);

// Gönderileri Dinleme ve Ekrana Basma
function loadFeed() {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(50));
    
    onSnapshot(q, (snapshot) => {
        feedContainer.innerHTML = ''; // Sadece ana kapsayıcıyı temizleriz, içeriği DOM API ile basarız
        
        if(snapshot.empty) {
            feedContainer.textContent = "Buralar çok sessiz...";
            return;
        }

        snapshot.forEach((doc) => {
            const postData = doc.data();
            const postElement = createPostElement(doc.id, postData);
            feedContainer.appendChild(postElement);
        });
    });
}

// 🚀 İŞTE YENİ DOM MANİPÜLASYONU YAKLAŞIMI
function createPostElement(postId, post) {
    // 1. Ana Kapsayıcıyı Yarat
    const postDiv = document.createElement('div');
    postDiv.className = 'post';
    postDiv.id = `post-${postId}`;

    // 2. Güvenli Metin İşleme (Boş metin hatasına karşı koruma eklendi)
    // Eğer post.text veritabanında yoksa, undefined yerine '' (boş metin) kullanır.
    const cleanText = DOMPurify.sanitize(post.text || '');

    // 3. İç Elementleri Yarat (String yerine Element kullanıyoruz)
    const headerDiv = document.createElement('div');
    headerDiv.className = 'post-header';
    // Eğer author alanı yoksa sistem çökmesin diye 'bilinmeyen' atanır.
    headerDiv.textContent = `@${post.author || 'bilinmeyen'}`; 

    const contentDiv = document.createElement('div');
    contentDiv.className = 'post-content';
    contentDiv.innerHTML = cleanText; // Sanitize edildiği için innerHTML güvenli

    const actionDiv = document.createElement('div');
    actionDiv.className = 'post-actions';
    
    const likeBtn = document.createElement('button');
    likeBtn.className = 'btn-primary';
    // Eksik beğeni dizisi hatasına karşı koruma (|| []) eklendi
    likeBtn.textContent = `❤️ Beğen (${(post.likes || []).length})`;
    
    // Window objesine fonksiyon atamak yerine, direkt butona Event Listener ekliyoruz!
    likeBtn.addEventListener('click', () => {
        handleLike(postId); 
    });

    actionDiv.appendChild(likeBtn);

    // 4. Parçaları Birleştir
    postDiv.appendChild(headerDiv);
    postDiv.appendChild(contentDiv);
    postDiv.appendChild(actionDiv);

    return postDiv;
}

function handleLike(postId) {
    // Firebase beğeni mantığı buraya...
    // MozaikApp henüz yüklenmemişse hata vermemesi için ?. kullanıldı
    console.log(`${postId} id'li gönderi beğenildi. Kullanıcı:`, MozaikApp?.state?.currentUser || 'Bilinmiyor');
}

// Sayfa yüklenince Feed'i başlat
loadFeed();