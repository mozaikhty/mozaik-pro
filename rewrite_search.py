import sys
import re

with open('search.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove switchTab logic since tabs are gone
content = re.sub(r'const tabExplore = document\.getElementById\(\'tab-explore\'\); const tabTrending = document\.getElementById\(\'tab-trending\'\);\n', '', content)
content = re.sub(r'let currentTab = \'explore\'; ', '', content)
content = re.sub(r'function switchTab\(tab\) \{.*?\}\n\ntabExplore\?.*?tabTrending\?.*?\n\n', '', content, flags=re.DOTALL)
content = re.sub(r'const trendingResults = document\.getElementById\(\'trending-results\'\);\n', '', content)
content = re.sub(r'function renderTrendingList.*?\}\n', '', content, flags=re.DOTALL)

# Add pagination logic and user caching
replacement_logic = """let lastVisiblePost = null;
let isFetchingPosts = false;
let hasMorePosts = true;
let allUsersCache = [];

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
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

async function loadExplorePosts(isLoadMore = false) {
    if(isFetchingPosts || !hasMorePosts) return;
    isFetchingPosts = true;
    
    const loadingInd = document.getElementById('loading-indicator');
    if(loadingInd) loadingInd.style.display = 'block';

    try {
        let q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(12));
        if (isLoadMore && lastVisiblePost) {
            q = query(collection(db, "posts"), orderBy("createdAt", "desc"), startAfter(lastVisiblePost), limit(12));
        }

        const snapshot = await getDocs(q);
        if(snapshot.empty) {
            hasMorePosts = false;
            if(loadingInd) loadingInd.style.display = 'none';
            if(!isLoadMore && (!allPosts || allPosts.length === 0)) {
                if(exploreResults) exploreResults.innerHTML = '<div style="color:#64748b; padding:40px; text-align:center;">İçerik bulunamadı.</div>';
            }
            isFetchingPosts = false;
            return;
        }

        lastVisiblePost = snapshot.docs[snapshot.docs.length - 1];
        
        let newPosts = [];
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
            
            newPosts.push(data); 
            neededUsers.add(data.author);
            if (data.isRepost && data.originalPostAuthor) neededUsers.add(data.originalPostAuthor);
        }); 
        
        await window.fetchMissingUsers(Array.from(neededUsers));
        
        newPosts.sort((a,b) => b.score - a.score);
        
        if(isLoadMore) {
            allPosts = [...allPosts, ...newPosts];
        } else {
            allPosts = newPosts;
            if(exploreResults) exploreResults.innerHTML = '';
        }
        
        calculateTrendingTags(); 
        renderCategoryPills();
        renderExplore(newPosts, isLoadMore);
        
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
        renderWhoToFollow(); 
    });

    fetchAllUsersForSearch();
    loadExplorePosts(false);
}

window.addEventListener('scroll', debounce(() => {
    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
        loadExplorePosts(true);
    }
}, 200));
"""
content = re.sub(r'function fetchData\(\) \{.*\}loadTrendingPosts\(\);\n\}', replacement_logic, content, flags=re.DOTALL)

# Update calculateTrendingTags to limit to 10
content = re.sub(r'\.slice\(0, 15\);', '.slice(0, 10);', content)
# Add startAfter to imports
content = re.sub(r'startAt, endAt, getDocs', 'startAt, endAt, getDocs, startAfter', content)

# Update renderExplore to take array and append
render_explore_logic = """function renderExplore(postsToRender = allPosts, append = false) {
    if(!exploreResults) return;
    
    let filtered = postsToRender;
    if(currentCategory !== 'all') {
        filtered = postsToRender.filter(p => {
            const text = (p.content || p.text || "").toLowerCase();
            return text.includes(currentCategory);
        });
    }
    
    if(filtered.length === 0 && !append) {
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
    
    if(append) {
        exploreResults.insertAdjacentHTML('beforeend', html);
    } else {
        exploreResults.innerHTML = html;
    }
}"""
content = re.sub(r'function renderExplore\(\) \{.*\}    exploreResults\.innerHTML = html;\n\}', render_explore_logic, content, flags=re.DOTALL)

# Update setCategory to fully re-render all known posts when switching
set_category_logic = """window.setCategory = function(cat) {
    currentCategory = cat;
    renderCategoryPills();
    renderExplore(allPosts, false);
};"""
content = re.sub(r'window\.setCategory = function\(cat\) \{.*?renderExplore\(\);\n\};', set_category_logic, content, flags=re.DOTALL)

# Update search to use allUsersCache properly
smart_search_logic = """async function performSmartSearch() {
    if(!searchInput || !searchSuggestions) return;
    const rawQ = searchInput.value;
    const q = rawQ.toLowerCase().trim();
    if(!q) { searchSuggestions.style.display = 'none'; return; }
    
    searchSuggestions.style.display = 'block';
    
    let html = '';
    
    const matchedTags = trendingTags.filter(t => t.tag.toLowerCase().includes(q)).slice(0, 5);
    if(matchedTags.length > 0) {
        html += '<div style="padding:10px 20px; font-size:12px; font-weight:700; color:#94a3b8; text-transform:uppercase;">Etiketler</div>';
        matchedTags.forEach(t => {
            html += `
                <div class="suggestion-item" onclick="window.setCategory('${t.tag}'); document.getElementById('smart-search-input').value=''; document.getElementById('search-suggestions').style.display='none';">
                    <div class="suggestion-icon">#</div>
                    <div class="suggestion-content">
                        <div class="suggestion-title">${t.tag}</div>
                        <div class="suggestion-subtitle">Popüler Etiket (${t.score} Puan)</div>
                    </div>
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
}"""
content = re.sub(r'async function performSmartSearch\(\) \{.*\}    searchSuggestions\.innerHTML = html;\n\}', smart_search_logic, content, flags=re.DOTALL)

with open('search.js', 'w', encoding='utf-8') as f:
    f.write(content)
