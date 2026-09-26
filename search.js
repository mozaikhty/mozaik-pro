import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { collection, onSnapshot, query, orderBy, doc, getDoc, getDocs, limit, startAfter, where } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import './shared.js';

let allPosts = []; 
let allUsersData = {}; 
let globalTrendingTags = []; 
let currentCategory = 'all'; 
let myUsername = null; 
let activeChats = [];

let lastVisiblePost = null;
let isFetchingPosts = false;
let hasMorePosts = true;
let allUsersCache = [];

const searchInput = document.getElementById('smart-search-input'); 
const searchSuggestions = document.getElementById('search-suggestions');
const exploreResults = document.getElementById('explore-results');
const popularResults = document.getElementById('popular-results');

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

async function fetchGlobalTrendingTags() {
    try {
        const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(100));
        const snap = await getDocs(q);
        const tagScores = {};
        
        snap.forEach(docSnap => {
            const data = docSnap.data();
            const text = data.content || data.text || "";
            const matches = text.match(/#([a-zA-Z0-9ğüşıöçĞÜŞİÖÇ_]+)/g);
            if (matches) {
                const uniqueTags = [...new Set(matches.map(t => t.toLowerCase()))];
                uniqueTags.forEach(tag => { tagScores[tag] = (tagScores[tag] || 0) + 1; });
            }
        });
        
        globalTrendingTags = Object.keys(tagScores).map(tag => { 
            return { tag: tag, score: tagScores[tag] }; 
        }).sort((a, b) => b.score - a.score);
        
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
        let targetCount = 15;
        
        while (newPosts.length < targetCount && loopCount < 5 && hasMorePosts) {
            let q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(15));
            if (lastVisiblePost) {
                q = query(collection(db, "posts"), orderBy("createdAt", "desc"), startAfter(lastVisiblePost), limit(15));
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
                    const hasVideo = data.media && data.media.some(m => m.type === 'video');
                    const hasPhoto = (data.media && data.media.some(m => m.type === 'image')) || data.imageUrl;
                    
                    if (currentCategory === 'video' && !hasVideo) matchesCategory = false;
                    else if (currentCategory === 'fotoğraf' && !hasPhoto) matchesCategory = false;
                    else if (currentCategory === 'yazı' && (hasVideo || hasPhoto)) matchesCategory = false;
                    else if (currentCategory !== 'video' && currentCategory !== 'fotoğraf' && currentCategory !== 'yazı') {
                        matchesCategory = text.includes(currentCategory);
                    }
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
                if(exploreResults) exploreResults.innerHTML = '<div class="col-span-full text-center text-slate-400 dark:text-gray-500 py-10">Bu kategoride içerik bulunamadı.</div>';
                if(popularResults) popularResults.innerHTML = '';
            }
        } else {
            await window.fetchMissingUsers(Array.from(neededUsers));
            
            newPosts.sort((a,b) => b.score - a.score);
            
            if(isLoadMore) {
                allPosts = [...allPosts, ...newPosts];
            } else {
                allPosts = newPosts;
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
            if(u.avatarUrl) {
                const imgTag = `<img src="${window.sanitizeUrl(u.avatarUrl)}" class="w-full h-full object-cover">`;
                const hAv = document.getElementById('mobile-avatar-header'); if(hAv) hAv.innerHTML = imgTag;
            }
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
    
    const categories = ['all', 'fotoğraf', 'video', 'müzik', 'yazı', 'konum', 'ruh hali'];
    categories.forEach(c => {
        let elId = 'cat-' + (c === 'all' ? 'all' : (c === 'fotoğraf' ? 'foto' : c));
        let el = document.getElementById(elId);
        if(el) {
            if (c === cat) {
                el.className = "w-14 h-14 rounded-2xl bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-400/50 flex justify-center items-center text-xl shadow-sm transition";
            } else {
                el.className = "w-14 h-14 rounded-2xl bg-slate-100 dark:bg-gray-800 text-slate-500 dark:text-gray-400 border border-slate-200 dark:border-gray-700 flex justify-center items-center text-xl transition hover:bg-slate-200 dark:hover:bg-gray-700";
            }
        }
    });

    const widgets = document.getElementById('explore-widgets');
    const header = document.getElementById('explore-results-header');
    if (cat !== 'all') {
        if(widgets) widgets.style.display = 'none';
        if(header) header.style.display = 'none';
    } else {
        if(widgets) widgets.style.display = 'block';
        if(header) header.style.display = 'flex';
    }
    
    allPosts = [];
    lastVisiblePost = null;
    hasMorePosts = true;
    if(exploreResults) exploreResults.innerHTML = '';
    if(popularResults) popularResults.innerHTML = '';
    
    loadExplorePosts(false);
};

function renderExplore(postsToRender = [], append = false) {
    if(!exploreResults) return;
    if(postsToRender.length === 0) return;
    
    let popularArr = [];
    let gridArr = [];

    if (!append && currentCategory === 'all' && postsToRender.length >= 4) {
        popularArr = postsToRender.slice(0, 5);
        gridArr = postsToRender.slice(5);
    } else {
        gridArr = postsToRender;
    }

    if (popularResults && popularArr.length > 0) {
        let popHtml = '';
        popularArr.forEach(post => {
            const author = post.isRepost ? post.originalPostAuthor : post.author;
            const aData = allUsersData[author] || {};
            const avatar = aData.avatarUrl ? `<img src="${window.sanitizeUrl(aData.avatarUrl)}" class="w-6 h-6 rounded-full border border-slate-300 dark:border-gray-500 object-cover">` : `<div class="w-6 h-6 rounded-full border border-slate-300 dark:border-gray-500 bg-slate-200 dark:bg-gray-700 flex items-center justify-center text-[10px]">👤</div>`;
            const likes = post.likes ? post.likes.length : 0;
            const comments = post.comments ? post.comments.length : 0;
            
            let thumbnail = 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=400&q=80';
            let tagIcon = 'location-dot'; let tagText = post.location || 'Gönderi';

            if (post.media && post.media.length > 0) {
                thumbnail = post.media[0].url;
                if(post.media[0].type === 'video') { tagIcon = 'play'; tagText = 'Video'; }
                else { tagIcon = 'camera'; tagText = 'Fotoğraf'; }
            } else if (post.imageUrl) {
                thumbnail = post.imageUrl;
                tagIcon = 'camera'; tagText = 'Fotoğraf';
            } else {
                tagIcon = 'file-lines'; tagText = 'Yazı';
            }

            let cleanText = post.content || post.text || "";
            cleanText = cleanText.replace(/<[^>]*>?/gm, ''); 

            popHtml += `
            <div class="min-w-[240px] md:min-w-[280px] h-[320px] rounded-2xl overflow-hidden relative flex-shrink-0 snap-start cursor-pointer group border border-slate-200 dark:border-gray-800 shadow-sm" onclick="window.openPostDetail('${post.id}')">
                <img src="${window.sanitizeUrl(thumbnail)}" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition duration-500">
                <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent"></div>
                
                <div class="absolute top-3 left-3 bg-black/50 backdrop-blur-md px-2 py-1 rounded-lg text-[10px] text-white flex items-center gap-1 border border-white/10">
                    <i class="fa-solid fa-${tagIcon}"></i> ${window.escapeHtml(tagText)}
                </div>
                
                <div class="absolute bottom-4 left-4 right-4">
                    <div class="flex items-center gap-2 mb-2" onclick="event.stopPropagation(); window.location.href='profile.html?user=${window.escapeHtml(author)}'">
                        ${avatar}
                        <span class="text-white text-xs font-medium">@${window.escapeHtml(author)}</span>
                    </div>
                    ${cleanText ? `<p class="text-white text-sm font-semibold line-clamp-1 mb-2">${window.escapeHtml(cleanText)}</p>` : ''}
                    <div class="flex gap-4 text-gray-300 text-xs font-medium">
                        <span class="flex items-center gap-1" onclick="event.stopPropagation(); window.showLikes('${post.id}', event)"><i class="fa-solid fa-heart"></i> ${likes}</span>
                        <span class="flex items-center gap-1"><i class="fa-solid fa-comment"></i> ${comments}</span>
                    </div>
                </div>
            </div>`;
        });
        popularResults.innerHTML = popHtml;
    }

    if (exploreResults && gridArr.length > 0) {
        let gridHtml = '';
        gridArr.forEach((post, index) => {
            let thumbnail = '';
            let iconHtml = '';
            
            if (post.media && post.media.length > 1) {
                thumbnail = post.media[0].url;
                iconHtml = `<i class="fa-regular fa-images"></i> Fotoğraf`;
            } else if (post.media && post.media.length === 1) {
                let m = post.media[0];
                thumbnail = m.url;
                if(m.type === 'video') iconHtml = `<i class="fa-solid fa-play"></i> Video`;
                else iconHtml = `<i class="fa-solid fa-camera"></i> Fotoğraf`;
            } else if (post.imageUrl) {
                thumbnail = post.imageUrl;
                iconHtml = `<i class="fa-solid fa-camera"></i> Fotoğraf`;
            } else {
                iconHtml = `<i class="fa-regular fa-file-lines"></i> Yazı`;
            }

            let cleanText = post.content || post.text || "";
            cleanText = cleanText.replace(/<[^>]*>?/gm, ''); 

            let spanClass = (index % 7 === 0) ? 'col-span-2 aspect-[2/1]' : 'col-span-1 aspect-[4/5]';
            if (!thumbnail) spanClass = 'col-span-1 aspect-[4/5] bg-slate-100 dark:bg-gray-800 border border-slate-200 dark:border-gray-700';

            gridHtml += `
            <div class="rounded-xl overflow-hidden relative cursor-pointer group ${spanClass} shadow-sm dark:shadow-none" onclick="window.openPostDetail('${post.id}')">
                ${thumbnail ? `<img src="${window.sanitizeUrl(thumbnail)}" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition duration-500">` : `<div class="p-4 h-full flex items-center justify-center text-center"><p class="text-xs text-slate-600 dark:text-gray-300 line-clamp-4">${window.escapeHtml(cleanText)}</p></div>`}
                
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition duration-300 flex flex-col justify-end p-3 pointer-events-none">
                    ${thumbnail && cleanText ? `<p class="text-white text-xs line-clamp-2">${window.escapeHtml(cleanText)}</p>` : ''}
                </div>
                
                <div class="absolute top-2 left-2 bg-black/50 backdrop-blur-md px-2 py-1 rounded-md text-[10px] text-white flex items-center gap-1 border border-white/10 pointer-events-none">
                    ${iconHtml}
                </div>
            </div>`;
        });

        if (append) exploreResults.insertAdjacentHTML('beforeend', gridHtml);
        else exploreResults.innerHTML = gridHtml;
    }
}

let searchTimeout = null;
searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => { performSmartSearch(); }, 300); 
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
    
    const matchedTags = globalTrendingTags.filter(t => t.tag.toLowerCase().includes(q)).slice(0, 3);
    if(matchedTags.length > 0) {
        html += '<div class="px-4 py-2 text-[10px] font-bold text-slate-400 dark:text-gray-500 uppercase tracking-wider">Etiketler</div>';
        matchedTags.forEach(t => {
            html += `
                <div class="flex items-center gap-3 px-4 py-2 hover:bg-slate-50 dark:hover:bg-gray-800 cursor-pointer transition" onclick="window.setCategory('${t.tag}'); document.getElementById('smart-search-input').value=''; document.getElementById('search-suggestions').style.display='none';">
                    <div class="w-8 h-8 rounded-full bg-slate-200 dark:bg-gray-700 flex items-center justify-center text-slate-600 dark:text-gray-300">#</div>
                    <div><div class="text-sm font-bold text-slate-900 dark:text-white">${t.tag}</div><div class="text-[10px] text-slate-400 dark:text-gray-500">Popüler Etiket</div></div>
                </div>
            `;
        });
    }
    
    const trLower = (str) => str.replace(/I/g,'ı').replace(/İ/g,'i').toLowerCase();
    const searchQ = trLower(q);
    
    const matchedUsers = allUsersCache.filter(u => {
        const uName = trLower(u.username || "");
        const fName = trLower(u.fullName || "");
        return uName.includes(searchQ) || fName.includes(searchQ);
    }).slice(0, 4);
    
    if(matchedUsers.length > 0) {
        html += '<div class="px-4 py-2 text-[10px] font-bold text-slate-400 dark:text-gray-500 uppercase tracking-wider mt-2">Kişiler</div>';
        matchedUsers.forEach(u => {
            const avatarHtml = u.avatarUrl ? `<img src="${window.sanitizeUrl(u.avatarUrl)}" class="w-full h-full object-cover">` : '👤';
            html += `
                <div class="flex items-center gap-3 px-4 py-2 hover:bg-slate-50 dark:hover:bg-gray-800 cursor-pointer transition" onclick="window.location.href='profile.html?user=${window.escapeHtml(u.username)}'">
                    <div class="w-8 h-8 rounded-full bg-slate-200 dark:bg-gray-700 overflow-hidden flex items-center justify-center">${avatarHtml}</div>
                    <div><div class="text-sm font-bold text-slate-900 dark:text-white">${window.escapeHtml(u.fullName || u.username)}</div><div class="text-[10px] text-slate-400 dark:text-gray-500">@${window.escapeHtml(u.username)}</div></div>
                </div>
            `;
        });
    }
    
    if(!html) html = '<div class="p-4 text-center text-slate-400 dark:text-gray-500 text-sm">Sonuç bulunamadı.</div>';
    searchSuggestions.innerHTML = html;
}

window.openPostDetail = async function(postId) {
    if(!postId) return;
    const modal = document.getElementById('post-detail-modal');
    const container = document.getElementById('post-detail-container');
    if(!modal || !container) return;
    
    document.body.classList.add('modal-open');
    modal.style.display = 'flex';
    container.innerHTML = '<div style="padding:40px; text-align:center;" class="text-slate-500 dark:text-gray-400">Yükleniyor...</div>';
    
    try {
        const postRef = doc(db, "posts", postId);
        const postSnap = await getDoc(postRef);
        if(!postSnap.exists()) { container.innerHTML = '<div style="padding:40px; text-align:center;" class="text-red-500">Gönderi bulunamadı veya silinmiş.</div>'; return; }
        
        const postData = postSnap.data();
        let originalAuthor = postData.author; if(postData.isRepost) originalAuthor = postData.originalPostAuthor;
        await window.fetchMissingUsers([originalAuthor]);
        
        const authorData = allUsersData[originalAuthor] || {};
        const vHtml = authorData.isVerified ? '<span style="color:#1da1f2; font-size:14px; margin-left:4px;">☑️</span>' : '';
        const avatarImg = authorData.avatarUrl ? `<img src="${window.sanitizeUrl(authorData.avatarUrl)}" class="w-full h-full object-cover rounded-full">` : `👤`;
        const fullName = window.escapeHtml(authorData.fullName || originalAuthor);
        
        let mediaHtmlDetail = '';
        if (postData.media && postData.media.length > 1) {
            let slides = postData.media.map(m => {
                let tag = m.type === 'video' ? `<video controls playsinline onclick="event.stopPropagation()" src="${window.sanitizeUrl(m.url)}" style="width:100%; max-height:60vh; border-radius:8px; object-fit:contain;"></video>` : `<img src="${window.sanitizeUrl(m.url)}" style="width:100%; max-height:60vh; border-radius:8px; object-fit:contain;">`;
                return `<div style="flex: 0 0 100%; scroll-snap-align: start;">${tag}</div>`;
            }).join('');
            mediaHtmlDetail = `<div style="display:flex; overflow-x:auto; scroll-snap-type: x mandatory; gap: 10px; padding-bottom: 10px; max-width: 100%; margin-bottom:15px;">${slides}</div>`;
        } else if (postData.media && postData.media.length === 1) {
            let m = postData.media[0];
            let tag = m.type === 'video' ? `<video controls playsinline onclick="event.stopPropagation()" src="${window.sanitizeUrl(m.url)}" style="width:100%; max-height:60vh; border-radius:8px; object-fit:contain;"></video>` : `<img src="${window.sanitizeUrl(m.url)}" style="width:100%; max-height:60vh; border-radius:8px; margin-bottom:15px; border:1px solid #e2e8f0; object-fit:contain;">`;
            mediaHtmlDetail = tag;
        } else if (postData.imageUrl) {
            mediaHtmlDetail = `<img src="${window.sanitizeUrl(postData.imageUrl)}" style="width:100%; max-height:60vh; border-radius:8px; margin-bottom:15px; border:1px solid #e2e8f0; object-fit:contain;">`;
        }
        
        let cleanContent = postData.content || postData.text || "";
        cleanContent = cleanContent.replace(/<[^>]*>?/gm, ''); 
        
        container.innerHTML = `
            <div style="padding: 10px 25px 25px 25px;">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:15px; cursor:pointer;" onclick="window.location.href='profile.html?user=${window.escapeHtml(originalAuthor)}'">
                    <div style="width:48px; height:48px; border-radius:50%; background:#e2e8f0; overflow:hidden; display:flex; justify-content:center; align-items:center; font-size:24px; border: 1px solid #cbd5e1;">${avatarImg}</div>
                    <div style="flex:1;">
                        <div style="font-weight:700; font-size:16px;" class="text-slate-900 dark:text-white">${fullName} ${vHtml}</div>
                        <div class="text-slate-500 dark:text-gray-400 text-sm">@${window.escapeHtml(originalAuthor)}</div>
                    </div>
                </div>
                ${mediaHtmlDetail}
                <div class="text-base leading-relaxed text-slate-800 dark:text-gray-200 mb-4 break-words">
                    ${window.escapeHtml(cleanContent).replace(/#([a-zA-Z0-9ğüşıöçĞÜŞİÖÇ_]+)/g, `<a href="#" onclick="window.closePostDetail(); window.setCategory('#$1');" class="text-cyan-500 font-medium hover:underline">#$1</a>`)}
                </div>
                <div class="flex gap-4 text-slate-500 dark:text-gray-400 font-semibold pt-4 border-t border-slate-200 dark:border-gray-800">
                    <span onclick="window.showLikes('${postId}', event)" class="cursor-pointer hover:text-red-500 transition">❤️ ${postData.likes ? postData.likes.length : 0} Beğeni</span>
                    <span>💬 ${postData.comments ? postData.comments.length : 0} Yorum</span>
                </div>
            </div>
        `;
    } catch(e) { console.error(e); }
};

window.closePostDetail = function() { document.body.classList.remove('modal-open');
    const modal = document.getElementById('post-detail-modal');
    if(modal) modal.style.display = 'none';
    document.body.classList.remove('modal-open');
};

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const pdm = document.getElementById('post-detail-modal');
        if (pdm && pdm.style.display === 'flex') {
            window.closePostDetail();
        }
    }
});
