// sidebar.js dosyası
function loadSidebar() {
    const sidebarHTML = `
        <nav class="sidebar-left">
            <a href="feed.html" class="logo-desktop">Mozaik.</a>
            <div class="desktop-nav">
                <a href="feed.html" class="desktop-nav-item" id="nav-feed">🏠 Anasayfa</a>
                <a href="search.html" class="desktop-nav-item" id="nav-search">🔍 Keşfet</a>
                <a href="notifications.html" class="desktop-nav-item" id="nav-notifications">🔔 Bildirimler</a>
                <a href="chat.html" class="desktop-nav-item" id="nav-chat">✉️ Sohbet</a>
                <a href="feed.html?tab=bookmarks" class="desktop-nav-item" id="nav-bookmarks">🔖 Yer İşaretleri</a>
                <a href="#" class="desktop-nav-item" onclick="window.openSettingsModal()">⚙️ Ayarlar</a>
                <a href="#" class="desktop-nav-item" style="color: #ef4444;" onclick="window.logoutUser()">🚪 Çıkış Yap</a>
            </div>
            <button class="desktop-post-btn" onclick="window.location.href='feed.html?action=post'">İçerik Paylaş</button>
            
            <div class="sidebar-user-menu" onclick="window.goToMyProfile()">
                <div class="sidebar-user-avatar" id="desktop-sidebar-avatar">👤</div>
                <div class="sidebar-user-info">
                    <div class="sidebar-user-name" id="desktop-sidebar-name">Yükleniyor...</div>
                    <div class="sidebar-user-handle" id="desktop-sidebar-handle">@bekleniyor</div>
                </div>
            </div>
        </nav>
    `;
    
    // HTML'i ekrana bas
    document.getElementById('sidebar-container').innerHTML = sidebarHTML;

    // Hangi sayfadaysak o butonu koyu renk (aktif) yap
    const path = window.location.pathname;
    if (path.includes('search.html')) document.getElementById('nav-search').classList.add('active');
    else if (path.includes('notifications.html')) document.getElementById('nav-notifications').classList.add('active');
    else if (path.includes('chat.html')) document.getElementById('nav-chat').classList.add('active');
    else if (path.includes('bookmarks')) document.getElementById('nav-bookmarks').classList.add('active');
    else document.getElementById('nav-feed').classList.add('active'); // Varsayılan anasayfa
}

// Dosya çağırıldığında fonksiyonu otomatik çalıştır
loadSidebar();