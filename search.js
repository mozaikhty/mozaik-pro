import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { collection, onSnapshot, query, orderBy, doc, updateDoc, arrayUnion, arrayRemove, addDoc, serverTimestamp, where, getDoc, limit, startAt, endAt, getDocs, startAfter } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import './shared.js';

let allPosts = []; 
let allUsersData = {}; 
let globalTrendingTags = []; 
let currentCategory = 'all'; 
let myUsername = null; 
let myFollowing = [];
let activeChats = [];

let lastVisiblePost = null;
let isFetchingPosts = false;
let hasMorePosts = true;
let allUsersCache = [];

const searchInput = document.getElementById('smart-search-input'); 
const searchSuggestions = document.getElementById('search-suggestions');
const exploreResults = document.getElementById('explore-results');
const categoryPillsContainer = document.getElementById('category-pills-container');

window.goToMyProfile = function() { if(myUsername) window.location.href = 'profile.html?user=' + myUsername; };

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        myUsername = user.displayName || localStorage.getItem('mozaik_username') || user.email.split('@')[0];
        window.myUsername = myUsername; window.allUsersData = allUsersData;
        fetchData();
        
        onSnapshot(query(collection(db, "chats"), where("participants", "array-contains", myUsername)), (snapshot) => { 
            activeChats = activeChats.filter(c => c.type === 'group'); 
            snapshot.forEach(docSnap => { activeChats.push({ id: docSnap.id, ...docSnap.data(), type:'private' }); }); 
            window.attachCallListeners(activeChats); 
        });
        onSnapshot(query(collection(db, "groups"), where("members", "array-contains", myUsername)), (snapshot) => { 
            activeChats = activeChats.filter(c => c.type === 'private'); 
            snapshot.forEach(docSnap => { activeChats.push({ id: docSnap.id, ...docSnap.data(), type:'group' }); }); 
            window.attachCallListeners(activeChats); 
        });
    } else { window.location.href = "index.html"; }
});

function renderWhoToFollow() {
    const container = document.getElementById('who-to-follow-list');
    if (!container) return;
    let eligibleUsers = Object.keys(allUsersData).filter(uid => uid !== myUsername && !myFollowing.includes(uid));
    eligibleUsers = eligibleUsers.sort(() => 0.5 - Math.random()).slice(0, 3);
    if (eligibleUsers.length === 0) {
        container.innerHTML = '<div style="font-size:14px; color:#64748b; padding: 10px 0;">Şu an için yeni öneri yok.</div>';
        return;
    }
    let html = '';
    eligibleUsers.forEach(uid => {
        const uData = allUsersData[uid];
        const avatarHtml = uData.avatarUrl ? `<img src="${window.sanitizeUrl(uData.avatarUrl)}" style="width:100%;height:100%;object-fit:cover;">` : `👤`;
        const fullName = window.escapeHtml(uData.fullName || uid);
        const vHtml = uData.isVerified ? '<span style="color:#1da1f2; font-size:14px; margin-left:4px;">☑️</span>' : '';
        html += `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-top:15px; cursor:pointer; padding: 8px; border-radius: 8px; transition: 0.2s;" class="user-row" onclick="window.location.href='profile.html?user=${window.escapeHtml(uid)}'">
                <div style="display:flex; align-items:center; gap:10px; overflow:hidden;">
                    <div style="width:40px; height:40px; border-radius:8px; background:#e2e8f0; overflow:hidden; display:flex; justify-content:center; align-items:center; font-size:20px; flex-shrink:0; border: 1px solid #cbd5e1;">${avatarHtml}</div>
                    <div style="overflow:hidden;">
                        <div style="font-weight:700; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#0f172a;">${fullName} ${vHtml}</div>
                        <div style="color:#64748b; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">@${window.escapeHtml(uid)}</div>
                    </div>
                </div>
                <button onclick="event.stopPropagation(); window.quickFollow('${window.escapeHtml(uid)}')" style="background:#f1f5f9; color:#0f172a; border:1px solid #cbd5e1; padding:6px 12px; border-radius:6px; font-weight:600; cursor:pointer; flex-shrink:0; transition:0.2s; font-size:13px;">Ekle</button>
            </div>
        `;
    });
    container.innerHTML = html;
}

// 1. Etiketleri arka planda hesapla (Global Trending Tags)
async function fetchGlobalTrendingTags() {
    try {
        const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(200));
        const snap = await getDocs(q);
        const tagScores = {};
        
        snap.forEach(docSnap => {
            const data = docSnap.data();
            const text = data.content || data.text || "";
            const matches = text.match(/#([a-zA-Z0-9ğüşıöçĞÜŞİÖÇ_]+)/g);
            if (matches) {
                const uniqueTags = [...new Set(matches.map(t => t.toLowerCase()))];
                
                const likes = data.likes ? data.likes.length : 0;
                const comments = data.comments ? data.comments.length : 0;
                let recencyBonus = 0;
                if(data.createdAt && data.createdAt.toMillis) {
                    const hoursOld = (Date.now() - data.createdAt.toMillis()) / (1000 * 60 * 60);
                    recencyBonus = Math.max(0, 50 - hoursOld);
                }
                const score = likes * 2 + comments * 3 + recencyBonus + 1;
                
                uniqueTags.forEach(tag => { 
                    tagScores[tag] = (tagScores[tag] || 0) + score; 
                });
            }
        });
        
        globalTrendingTags = Object.keys(tagScores).map(tag => { 
            return { tag: tag, score: tagScores[tag] }; 
        }).sort((a, b) => b.score - a.score);
        
        renderCategoryPills();
    } catch (e) { console.error("Trend etiketler hesaplanamadı:", e); }
}

async function fetchAllUsersForSearch() {
    try {
        const uSnap = await getDocs(collection(db, "users"));
        allUsersCache = [];
        uSnap.forEach(docSnap => {
            const data = docSnap.data();
            allUsersCache.push({ username: docSnap.id, ...data });
            allUsersData[docSnap.id] = data;
        });
        renderWhoToFollow();
    } catch (e) { console.error("Kullanıcılar çekilemedi:", e); }
}

function processPostData(docSnap) {
    const data = docSnap.data();
    data.id = docSnap.id;
    const likes = data.likes ? data.likes.length : 0;
    const comments = data.comments ? data.comments.length : 0;
    let recencyBonus = 0;
    if(data.createdAt && data.createdAt.toMillis) {
        const hoursOld = (Date.now() - data.createdAt.toMillis()) / (1000 * 60 * 60);
        recencyBonus = Math.max(0, 50 - hoursOld);
    }
    data.score = likes * 2 + comments * 3 + recencyBonus;
    return data;
}

async function loadExplorePosts(isLoadMore = false) {
    if(isFetchingPosts || !hasMorePosts) return;
    isFetchingPosts = true;
    
    const loadingInd = document.getElementById('loading-indicator');
    if(loadingInd) loadingInd.style.display = 'block';

    try {
        let newPosts = [];
        let neededUsers = new Set();
        let loopCount = 0;
        let targetCount = 12;
        
        // Kategori seçiliyse veritabanından bulana kadar (max 5 kere) limit(12) çekeriz.
        while (newPosts.length < targetCount && loopCount < 5 && hasMorePosts) {
            let q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(12));
            if (lastVisiblePost) {
                q = query(collection(db, "posts"), orderBy("createdAt", "desc"), startAfter(lastVisiblePost), limit(12));
            }

            const snapshot = await getDocs(q);
            if(snapshot.empty) {
                hasMorePosts = false;
                break;
            }

            lastVisiblePost = snapshot.docs[snapshot.docs.length - 1];
            
            snapshot.forEach(docSnap => { 
                const data = processPostData(docSnap);
                
                let matchesCategory = true;
                if(currentCategory !== 'all') {
                    const text = (data.content || data.text || "").toLowerCase();
                    matchesCategory = text.includes(currentCategory);
                }
                
                if (matchesCategory) {
                    newPosts.push(data); 
                    neededUsers.add(data.author);
                    if (data.isRepost && data.originalPostAuthor) neededUsers.add(data.originalPostAuthor);
                }
            }); 
            
            if (currentCategory === 'all') break; 
            loopCount++;
        }

        if(newPosts.length === 0) {
            if(!isLoadMore && (!allPosts || allPosts.length === 0)) {
                if(exploreResults) exploreResults.innerHTML = '<div style="color:#64748b; padding:40px; text-align:center;">Bu kategoride içerik bulunamadı.</div>';
            }
        } else {
            await window.fetchMissingUsers(Array.from(neededUsers));
            
            // Kendi içinde score'a göre sırala
            newPosts.sort((a,b) => b.score - a.score);
            
            if(isLoadMore) {
                allPosts = [...allPosts, ...newPosts];
            } else {
                allPosts = newPosts;
                if(exploreResults) exploreResults.innerHTML = '';
            }
            
            renderExplore(newPosts, isLoadMore);
        }
    } catch(error) {
        console.error("Gönderi yükleme hatası:", error);
    }
    
    if(loadingInd) loadingInd.style.display = 'none';
    isFetchingPosts = false;
}

function fetchData() {
    onSnapshot(doc(db, "users", myUsername), (docSnap) => {
        if(docSnap.exists()) {
            const u = docSnap.data();
            allUsersData[myUsername] = u;
            myFollowing = u.following || [];
            
            const mobName = document.getElementById('sidebar-name-mobile'); if(mobName) mobName.innerText = u.fullName || myUsername;
            const mobHandle = document.getElementById('sidebar-handle-mobile'); if(mobHandle) mobHandle.innerText = '@' + myUsername;
            const mobFolCount = document.getElementById('sidebar-following-count'); if(mobFolCount) mobFolCount.innerText = myFollowing.length;
            const mobFolersCount = document.getElementById('sidebar-followers-count'); if(mobFolersCount) mobFolersCount.innerText = (u.followers || []).length;
            
            if(u.avatarUrl) {
                const imgTag = `<img src="${window.sanitizeUrl(u.avatarUrl)}" style="width:100%;height:100%;object-fit:cover;">`;
                const hAv = document.getElementById('mobile-avatar-header'); if(hAv) hAv.innerHTML = imgTag;
                const sAv = document.getElementById('sidebar-avatar-mobile'); if(sAv) sAv.innerHTML = imgTag;
                const dAv = document.getElementById('desktop-sidebar-avatar'); if(dAv) dAv.innerHTML = imgTag;
            }
            const dName = document.getElementById('desktop-sidebar-name'); if(dName) dName.innerText = u.fullName || myUsername;
            const dHandle = document.getElementById('desktop-sidebar-handle'); if(dHandle) dHandle.innerText = '@' + myUsername;
        }
    });

    fetchAllUsersForSearch();
    fetchGlobalTrendingTags();
    loadExplorePosts(false);
}

window.addEventListener('scroll', debounce(() => {
    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
        loadExplorePosts(true);
    }
}, 200));

window.setCategory = function(cat) {
    currentCategory = cat;
    renderCategoryPills();
    
    // Reset pagination and reload
    allPosts = [];
    lastVisiblePost = null;
    hasMorePosts = true;
    if(exploreResults) exploreResults.innerHTML = '';
    
    if(searchInput) {
        searchInput.value = '';
        if(searchSuggestions) searchSuggestions.style.display = 'none';
    }
    
    loadExplorePosts(false);
};

function renderCategoryPills() {
    let html = `<div class="category-pill ${currentCategory === 'all' ? 'active' : ''}" onclick="window.setCategory('all')">Tümü</div>`;
    
    // Gündem etiketlerinden en popüler 10 tanesini üst barda gösteriyoruz. (Diğerleri aramada var).
    const top10 = globalTrendingTags.slice(0, 10);
    top10.forEach(t => {
        const isActive = currentCategory === t.tag ? 'active' : '';
        html += `<div class="category-pill ${isActive}" onclick="window.setCategory('${t.tag}')">${t.tag}</div>`;
    });
    
    if(categoryPillsContainer) categoryPillsContainer.innerHTML = html;
}

function renderExplore(postsToRender = [], append = false) {
    if(!exploreResults) return;
    if(postsToRender.length === 0) return;
    
    let html = '';
    postsToRender.forEach(post => {
        const author = post.isRepost ? post.originalPostAuthor : post.author;
        const aData = allUsersData[author] || {};
        const avatar = aData.avatarUrl ? `<img src="${window.sanitizeUrl(aData.avatarUrl)}">` : `👤`;
        const likes = post.likes ? post.likes.length : 0;
        const comments = post.comments ? post.comments.length : 0;
        
        let mediaHtml = '';
        if (post.media && post.media.length > 1) {
            mediaHtml = `<div class="explore-card-media"><img src="${window.sanitizeUrl(post.media[0].url)}"><div class="explore-card-icon">📸 ${post.media.length}</div></div>`;
        } else if (post.media && post.media.length === 1) {
            let m = post.media[0];
            if(m.type === 'video') mediaHtml = `<div class="explore-card-media"><video src="${window.sanitizeUrl(m.url)}"></video><div class="explore-card-icon">▶️</div></div>`;
            else mediaHtml = `<div class="explore-card-media"><img src="${window.sanitizeUrl(m.url)}"></div>`;
        } else if (post.imageUrl) {
            mediaHtml = `<div class="explore-card-media"><img src="${window.sanitizeUrl(post.imageUrl)}"></div>`;
        }
        
        let cleanText = post.content || post.text || "";
        cleanText = cleanText.replace(/<[^>]*>?/gm, ''); // html temizle
        
        html += `
            <div class="explore-card" onclick="window.openPostDetail('${post.id}')">
                ${mediaHtml}
                <div class="explore-card-body">
                    ${cleanText ? `<div class="explore-card-text">${window.escapeHtml(cleanText)}</div>` : ''}
                    <div class="explore-card-footer">
                        <div class="explore-card-author" onclick="event.stopPropagation(); window.location.href='profile.html?user=${window.escapeHtml(author)}'">
                            ${avatar} <span style="font-size:13px; font-weight:600; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:80px;">${window.escapeHtml(aData.fullName || author)}</span>
                        </div>
                        <div class="explore-card-stats">
                            <span>❤️ ${likes}</span>
                            <span>💬 ${comments}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    if(append) {
        exploreResults.insertAdjacentHTML('beforeend', html);
    } else {
        exploreResults.innerHTML = html;
    }
}

let searchTimeout = null;
searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        performSmartSearch();
    }, 300); 
});
searchInput?.addEventListener('focus', () => {
    if(searchInput.value.trim().length > 0) searchSuggestions.style.display = 'block';
});
document.addEventListener('click', (e) => {
    if(searchInput && searchSuggestions && !searchInput.contains(e.target) && !searchSuggestions.contains(e.target)) {
        searchSuggestions.style.display = 'none';
    }
});

async function performSmartSearch() {
    if(!searchInput || !searchSuggestions) return;
    const rawQ = searchInput.value;
    const q = rawQ.toLowerCase().trim();
    if(!q) { searchSuggestions.style.display = 'none'; return; }
    
    searchSuggestions.style.display = 'block';
    let html = '';
    
    // 1. Etiket araması (Tüm globalTrendingTags içerisinden arama yapar, sadece top10 ile sınırlı değildir!)
    const matchedTags = globalTrendingTags.filter(t => t.tag.toLowerCase().includes(q)).slice(0, 5);
    if(matchedTags.length > 0) {
        html += '<div style="padding:10px 20px; font-size:12px; font-weight:700; color:#94a3b8; text-transform:uppercase;">Etiketler</div>';
        matchedTags.forEach(t => {
            html += `
                <div class="suggestion-item" onclick="window.setCategory('${t.tag}'); document.getElementById('search-suggestions').style.display='none';">
                    <div class="suggestion-icon">#</div>
                    <div class="suggestion-content">
                        <div class="suggestion-title">${t.tag}</div>
                        <div class="suggestion-subtitle">Popüler Etiket (${t.score} Puan)</div>
                    </div>
                </div>
            `;
        });
    }
    
    // 2. Kişi araması (Tam isim, kullanıcı adı, büyük-küçük Türkçe karakter duyarsız)
    const trLower = (str) => str.replace(/I/g,'ı').replace(/İ/g,'i').toLowerCase();
    const searchQ = trLower(q);
    
    const matchedUsers = allUsersCache.filter(u => {
        const uName = trLower(u.username || "");
        const fName = trLower(u.fullName || "");
        return uName.includes(searchQ) || fName.includes(searchQ);
    }).slice(0, 5);
    
    if(matchedUsers.length > 0) {
        html += '<div style="padding:10px 20px; font-size:12px; font-weight:700; color:#94a3b8; text-transform:uppercase; margin-top:10px;">Kişiler</div>';
        matchedUsers.forEach(u => {
            const avatarHtml = u.avatarUrl ? `<img src="${window.sanitizeUrl(u.avatarUrl)}" style="width:100%;height:100%;object-fit:cover;">` : '👤';
            html += `
                <div class="suggestion-item" onclick="window.location.href='profile.html?user=${window.escapeHtml(u.username)}'">
                    <div class="suggestion-icon" style="background:transparent; border:1px solid #e2e8f0;">${avatarHtml}</div>
                    <div class="suggestion-content">
                        <div class="suggestion-title">${window.escapeHtml(u.fullName || u.username)}</div>
                        <div class="suggestion-subtitle">@${window.escapeHtml(u.username)}</div>
                    </div>
                </div>
            `;
        });
    }
    
    // 3. Konu/Gönderi araması (Zaten yüklü gönderiler içinden arar)
    const matchedPosts = allPosts.filter(p => {
        const text = trLower(p.content || p.text || "");
        return text.includes(searchQ) && !text.includes('#'+searchQ); 
    }).slice(0, 5);
    
    if(matchedPosts.length > 0) {
        html += '<div style="padding:10px 20px; font-size:12px; font-weight:700; color:#94a3b8; text-transform:uppercase; margin-top:10px;">Konular & Gönderiler</div>';
        matchedPosts.forEach(p => {
            let cleanText = p.content || p.text || "";
            cleanText = cleanText.replace(/<[^>]*>?/gm, '');
            const author = p.isRepost ? p.originalPostAuthor : p.author;
            
            html += `
                <div class="suggestion-item" onclick="window.openPostDetail('${p.id}'); document.getElementById('search-suggestions').style.display='none';">
                    <div class="suggestion-icon">📝</div>
                    <div class="suggestion-content">
                        <div class="suggestion-title">${window.escapeHtml(cleanText)}</div>
                        <div class="suggestion-subtitle">@${window.escapeHtml(author)} tarafından paylaşıldı</div>
                    </div>
                </div>
            `;
        });
    }
    
    if(!html) {
        html = '<div style="padding:15px 20px; color:#64748b; font-size:14px; text-align:center;">Sonuç bulunamadı.</div>';
    }
    searchSuggestions.innerHTML = html;
}

// POST DETAIL LOGIC
window.openPostDetail = async function(postId) {
    if(!postId) return;
    const modal = document.getElementById('post-detail-modal');
    const container = document.getElementById('post-detail-container');
    if(!modal || !container) return;
    
    document.body.classList.add('modal-open');
    modal.style.display = 'flex';
    container.innerHTML = '<div style="padding:40px; text-align:center; color:#64748b;">Yükleniyor...</div>';
    
    try {
        const postRef = doc(db, "posts", postId);
        const postSnap = await getDoc(postRef);
        if(!postSnap.exists()) { container.innerHTML = '<div style="padding:40px; text-align:center; color:#ef4444;">Gönderi bulunamadı veya silinmiş.</div>'; return; }
        
        const postData = postSnap.data();
        let originalAuthor = postData.author; if(postData.isRepost) originalAuthor = postData.originalPostAuthor;
        await window.fetchMissingUsers([originalAuthor]);
        
        const authorData = allUsersData[originalAuthor] || {};
        const vHtml = authorData.isVerified ? '<span style="color:#1da1f2; font-size:14px; margin-left:4px;">☑️</span>' : '';
        const avatarImg = authorData.avatarUrl ? `<img src="${window.sanitizeUrl(authorData.avatarUrl)}" style="width:100%;height:100%;object-fit:cover;">` : `👤`;
        const fullName = window.escapeHtml(authorData.fullName || originalAuthor);
        
        let mediaHtmlDetail = '';
        if (postData.media && postData.media.length > 1) {
            let slides = postData.media.map(m => {
                let tag = m.type === 'video' ? `<video controls src="${window.sanitizeUrl(m.url)}" style="width:100%; max-height:60vh; border-radius:8px; background:black; object-fit:contain;"></video>` : `<img src="${window.sanitizeUrl(m.url)}" style="width:100%; max-height:60vh; border-radius:8px; object-fit:contain;">`;
                return `<div style="flex: 0 0 100%; scroll-snap-align: start;">${tag}</div>`;
            }).join('');
            mediaHtmlDetail = `<div style="display:flex; overflow-x:auto; scroll-snap-type: x mandatory; gap: 10px; padding-bottom: 10px; max-width: 100%; margin-bottom:15px;">${slides}</div>`;
        } else if (postData.media && postData.media.length === 1) {
            let m = postData.media[0];
            let tag = m.type === 'video' ? `<video controls src="${window.sanitizeUrl(m.url)}" style="width:100%; max-height:60vh; border-radius:8px; background:black; margin-bottom:15px; object-fit:contain;"></video>` : `<img src="${window.sanitizeUrl(m.url)}" style="width:100%; max-height:60vh; border-radius:8px; margin-bottom:15px; border:1px solid #e2e8f0; object-fit:contain;">`;
            mediaHtmlDetail = tag;
        } else if (postData.imageUrl) {
            mediaHtmlDetail = `<img src="${window.sanitizeUrl(postData.imageUrl)}" style="width:100%; max-height:60vh; border-radius:8px; margin-bottom:15px; border:1px solid #e2e8f0; object-fit:contain;">`;
        }
        
        let cleanContent = postData.content || postData.text || "";
        cleanContent = cleanContent.replace(/<[^>]*>?/gm, ''); 
        
        container.innerHTML = `
            <div style="padding: 10px 25px 25px 25px;">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:15px; cursor:pointer;" onclick="window.location.href='profile.html?user=${window.escapeHtml(originalAuthor)}'">
                    <div style="width:48px; height:48px; border-radius:8px; background:#e2e8f0; overflow:hidden; display:flex; justify-content:center; align-items:center; font-size:24px; border: 1px solid #cbd5e1;">${avatarImg}</div>
                    <div style="flex:1;">
                        <div style="font-weight:700; font-size:16px; color:#0f172a;">${fullName} ${vHtml}</div>
                        <div style="color:#64748b; font-size:14px;">@${window.escapeHtml(originalAuthor)}</div>
                    </div>
                </div>
                ${mediaHtmlDetail}
                <div style="font-size:16px; line-height:1.6; color:#334155; margin-bottom:15px; word-wrap:break-word;">
                    ${window.escapeHtml(cleanContent).replace(/#([a-zA-Z0-9ğüşıöçĞÜŞİÖÇ_]+)/g, `<a href="#" onclick="window.closePostDetail(); window.setCategory('#$1');" style="color:#3b82f6; font-weight:500; text-decoration:none;">#$1</a>`)}
                </div>
                <div style="display:flex; gap:15px; color:#64748b; font-weight:600; padding-top:15px; border-top:1px solid #f1f5f9;">
                    <span>❤️ ${postData.likes ? postData.likes.length : 0} Beğeni</span>
                    <span>💬 ${postData.comments ? postData.comments.length : 0} Yorum</span>
                </div>
            </div>
        `;
    } catch(e) { console.error(e); }
};

window.closePostDetail = function() {
    const modal = document.getElementById('post-detail-modal');
    if(modal) modal.style.display = 'none';
    document.body.classList.remove('modal-open');
};