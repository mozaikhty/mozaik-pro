import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { collection, onSnapshot, query, orderBy, doc, updateDoc, arrayUnion, arrayRemove, addDoc, serverTimestamp, where, getDoc, limit, startAt, endAt, getDocs } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import './shared.js';

let allUsers = []; let allPosts = []; let allUsersData = {}; let trendingTags = []; let currentTab = 'explore'; let currentCategory = 'all'; let myUsername = null; let myFollowing = [];
let activeChats = [];

const tabExplore = document.getElementById('tab-explore'); const tabTrending = document.getElementById('tab-trending');
const searchInput = document.getElementById('smart-search-input'); 
const searchSuggestions = document.getElementById('search-suggestions');
const exploreResults = document.getElementById('explore-results');
const trendingResults = document.getElementById('trending-results');
const categoryPillsContainer = document.getElementById('category-pills-container');

window.goToMyProfile = function() { if(myUsername) window.location.href = 'profile.html?user=' + myUsername; };

function switchTab(tab) {
    currentTab = tab;
    if(tab === 'explore') { 
        tabExplore?.classList.add('active'); tabTrending?.classList.remove('active'); 
        exploreResults.style.display = 'block'; trendingResults.style.display = 'none';
        categoryPillsContainer.style.display = 'flex';
        renderExplore();
    } else { 
        tabTrending?.classList.add('active'); tabExplore?.classList.remove('active'); 
        exploreResults.style.display = 'none'; trendingResults.style.display = 'block';
        categoryPillsContainer.style.display = 'none';
        renderTrendingList();
    }
}

tabExplore?.addEventListener('click', () => switchTab('explore')); 
tabTrending?.addEventListener('click', () => switchTab('trending'));

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

function calculateTrendingTags() {
    const tagScores = {};
    allPosts.forEach(post => {
        const postText = post.content || post.text || ""; 
        if (postText) {
            const matches = postText.match(/#([a-zA-Z0-9ğüşıöçĞÜŞİÖÇ_]+)/g);
            if (matches) { 
                const uniqueTags = [...new Set(matches.map(t => t.toLowerCase()))];
                uniqueTags.forEach(tag => { 
                    tagScores[tag] = (tagScores[tag] || 0) + (post.score || 1); 
                }); 
            }
        }
    });
    trendingTags = Object.keys(tagScores).map(tag => { return { tag: tag, score: tagScores[tag] }; }).sort((a, b) => b.score - a.score).slice(0, 15);
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
        renderWhoToFollow(); 
    });

    async function loadTrendingPosts() {
        try {
            const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(100));
            const snapshot = await getDocs(q);
            allPosts = []; 
            let neededUsers = new Set();
            snapshot.forEach(docSnap => { 
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
                
                allPosts.push(data); 
                neededUsers.add(data.author);
                if (data.isRepost && data.originalPostAuthor) neededUsers.add(data.originalPostAuthor);
            }); 
            
            allPosts.sort((a,b) => b.score - a.score);
            
            await window.fetchMissingUsers(Array.from(neededUsers));
            calculateTrendingTags(); 
            
            const urlParams = new URLSearchParams(window.location.search); 
            if(urlParams.get('tag')) {
                currentCategory = urlParams.get('tag').toLowerCase();
                if(!currentCategory.startsWith('#')) currentCategory = '#' + currentCategory;
            }
            
            renderCategoryPills();
            switchTab('explore');
        } catch(error) {
            console.error("Gündem yükleme hatası:", error);
        }
    }
    loadTrendingPosts();
}

window.setCategory = function(cat) {
    currentCategory = cat;
    renderCategoryPills();
    renderExplore();
};

function renderCategoryPills() {
    let html = `<div class="category-pill ${currentCategory === 'all' ? 'active' : ''}" onclick="window.setCategory('all')">Tümü</div>`;
    trendingTags.forEach(t => {
        const isActive = currentCategory === t.tag ? 'active' : '';
        html += `<div class="category-pill ${isActive}" onclick="window.setCategory('${t.tag}')">${t.tag}</div>`;
    });
    if(categoryPillsContainer) categoryPillsContainer.innerHTML = html;
}

function renderExplore() {
    if(!exploreResults) return;
    
    let filtered = allPosts;
    if(currentCategory !== 'all') {
        filtered = allPosts.filter(p => {
            const text = (p.content || p.text || "").toLowerCase();
            return text.includes(currentCategory);
        });
    }
    
    if(filtered.length === 0) {
        exploreResults.innerHTML = '<div style="color:#64748b; padding:40px; text-align:center;">Bu kategoride içerik bulunamadı.</div>';
        return;
    }
    
    let html = '';
    filtered.forEach(post => {
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
        cleanText = cleanText.replace(/<[^>]*>?/gm, '');
        
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
    exploreResults.innerHTML = html;
}

function renderTrendingList() {
    if(!trendingResults) return;
    if (trendingTags.length === 0) { trendingResults.innerHTML = '<div style="color:#64748b; padding:40px; text-align:center;">Henüz gündem oluşmamış...</div>'; return; }
    let html = ``;
    trendingTags.forEach(item => { 
        html += `<a class="trending-item" onclick="window.setCategory('${item.tag}'); switchTab('explore');">
                    <div class="trend-category">Gündem</div>
                    <div class="trend-name">${item.tag}</div>
                    <div class="trend-count">Yüksek Etkileşim</div>
                 </a>`; 
    });
    trendingResults.innerHTML = html;
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
    const q = searchInput.value.toLowerCase().trim();
    if(!q) { searchSuggestions.style.display = 'none'; return; }
    
    searchSuggestions.style.display = 'block';
    searchSuggestions.innerHTML = '<div style="padding:15px 20px; color:#64748b; font-size:14px;">Aranıyor...</div>';
    
    let html = '';
    
    // 1. Tags Match
    const matchedTags = trendingTags.filter(t => t.tag.includes(q)).slice(0, 3);
    if(matchedTags.length > 0) {
        html += '<div style="padding:10px 20px; font-size:12px; font-weight:700; color:#94a3b8; text-transform:uppercase;">Etiketler</div>';
        matchedTags.forEach(t => {
            html += `
                <div class="suggestion-item" onclick="window.setCategory('${t.tag}'); switchTab('explore'); document.getElementById('search-suggestions').style.display='none';">
                    <div class="suggestion-icon">#</div>
                    <div class="suggestion-content">
                        <div class="suggestion-title">${t.tag}</div>
                        <div class="suggestion-subtitle">Gündem Etiketi</div>
                    </div>
                </div>
            `;
        });
    }
    
    // 2. Users Match
    let matchedUsers = [];
    try {
        const uQ = query(collection(db, "users"), orderBy("__name__"), startAt(q), endAt(q + '\uf8ff'), limit(3));
        const uSnap = await getDocs(uQ);
        uSnap.forEach(docSnap => {
            const user = docSnap.data();
            const username = docSnap.id;
            matchedUsers.push({username, ...user});
            allUsersData[username] = user;
        });
    } catch(e) { console.error("User search err:", e); }
    
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
    
    // 3. Topics Match
    const matchedPosts = allPosts.filter(p => {
        const text = (p.content || p.text || "").toLowerCase();
        return text.includes(q) && !text.includes('#'+q); 
    }).slice(0, 3);
    
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
                    ${window.escapeHtml(cleanContent).replace(/#([a-zA-Z0-9ğüşıöçĞÜŞİÖÇ_]+)/g, `<a href="#" onclick="window.closePostDetail(); window.setCategory('#$1'); switchTab('explore');" style="color:#3b82f6; font-weight:500; text-decoration:none;">#$1</a>`)}
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