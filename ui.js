// ui.js

// 1. Ortak Bileşenleri Yükleyen Ana Fonksiyon
function loadUIComponents() {
    // Mevcut sayfanın adını alıyoruz (Örn: "feed.html", "chat.html")
    const path = window.location.pathname;
    const page = path.split('/').pop() || 'feed.html';

    // === SOL MENÜ (Masaüstü Görünüm - Görselle Birebir Uyumlu) ===
    const sidebarHTML = `
        <div class="sidebar-left">
            <a href="feed.html" class="logo-desktop" style="text-decoration:none;">Mozaik.</a>
            
            <div class="desktop-nav">
                <a href="feed.html" class="desktop-nav-item ${page === 'feed.html' && !window.location.search.includes('bookmarks') ? 'active' : ''}">
                    <span style="width:24px;">🏠</span> Anasayfa
                </a>
                <a href="search.html" class="desktop-nav-item ${page === 'search.html' ? 'active' : ''}">
                    <span style="width:24px;">🔍</span> Keşfet
                </a>
                <a href="notifications.html" class="desktop-nav-item ${page === 'notifications.html' ? 'active' : ''}">
                    <span style="width:24px;">🔔</span> Bildirimler
                </a>
                <a href="chat.html" class="desktop-nav-item ${page === 'chat.html' ? 'active' : ''}">
                    <span style="width:24px;">✉️</span> Mesajlar
                </a>
                <a href="feed.html?tab=bookmarks" class="desktop-nav-item ${window.location.search.includes('bookmarks') ? 'active' : ''}">
                    <span style="width:24px;">🔖</span> Koleksiyonum
                </a>
                <a href="#" onclick="window.goToMyProfile(); return false;" class="desktop-nav-item ${page === 'profile.html' ? 'active' : ''}">
                    <span style="width:24px;">👤</span> Profil
                </a>
            </div>
            
            <button class="desktop-post-btn" onclick="window.openMainPostModal()">Gönderi Yayınla</button>

            <div class="sidebar-user-menu" onclick="window.openSettingsModal()">
                <div class="sidebar-user-avatar" id="desktop-sidebar-avatar">👤</div>
                <div class="sidebar-user-info">
                    <div class="sidebar-user-name" id="desktop-sidebar-name">Yükleniyor...</div>
                    <div class="sidebar-user-handle" id="desktop-sidebar-handle">@bekleniyor</div>
                </div>
                <div style="font-size: 20px; color: #64748b; margin-left: auto;">⚙️</div>
            </div>
        </div>
    `;

    // === ALT MENÜ (Mobil Cihazlar İçin) ===
    const bottomNavHTML = `
        <div class="bottom-nav">
            <a href="feed.html" class="nav-item ${page === 'feed.html' ? 'active' : ''}">🏠</a>
            <a href="search.html" class="nav-item ${page === 'search.html' ? 'active' : ''}">🔍</a>
            <a href="chat.html" class="nav-item ${page === 'chat.html' ? 'active' : ''}">✉️</a>
            <a href="notifications.html" class="nav-item ${page === 'notifications.html' ? 'active' : ''}">🔔</a>
        </div>
    `;

    // === AYARLAR & KARANLIK MOD MODALI ===
    const settingsModalHTML = `
        <div class="modal-overlay" id="settings-modal" style="z-index: 5000; display:none;">
            <div class="modal-content" style="padding:0;">
                <div class="modal-header" style="padding: 20px; margin:0;">
                    <h3 style="margin:0; font-size:16px;">Platform Ayarları</h3>
                    <button class="close-btn" onclick="document.getElementById('settings-modal').style.display='none'">&times;</button>
                </div>
                <div style="padding: 20px; display: flex; flex-direction: column; gap: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 15px; border-bottom: 1px solid #f1f5f9;" class="settings-row">
                        <div style="font-size: 16px; font-weight: 600; color: #334155;" class="settings-text">🌙 Gece Modu (Dark Mode)</div>
                        <label class="switch">
                          <input type="checkbox" id="dark-mode-toggle" onchange="window.toggleDarkMode()">
                          <span class="slider round"></span>
                        </label>
                    </div>
                    <div style="font-size: 16px; font-weight: 600; color: #334155; cursor: pointer;" class="settings-text" onclick="window.openSupportModal()">❓ Yardım ve İletişim</div>
                    
                    <div style="font-size: 16px; font-weight: 600; color: #ef4444; cursor: pointer; padding-top: 15px; border-top: 1px solid #f1f5f9;" class="settings-text" onclick="window.logoutUser()">🚪 Çıkış Yap</div>
                </div>
            </div>
        </div>
    `;

    // 2. HTML'leri Sayfaya Yerleştirme İşlemi
    const sidebarContainer = document.getElementById('sidebar-container');
    if (sidebarContainer) sidebarContainer.innerHTML = sidebarHTML;

    const bottomNavContainer = document.getElementById('bottom-nav-container');
    if (bottomNavContainer) bottomNavContainer.innerHTML = bottomNavHTML;

    // Ayarlar modalı sadece bir kere eklensin diye kontrol ediyoruz
    if (!document.getElementById('settings-modal')) {
        document.body.insertAdjacentHTML('beforeend', settingsModalHTML);
    }
}

// === GLOBAL FONKSİYONLAR (Tüm sayfalardan erişilecek) ===
window.openSettingsModal = function() {
    document.getElementById('settings-modal').style.display = 'flex';
    const toggle = document.getElementById('dark-mode-toggle');
    if(toggle) toggle.checked = document.body.classList.contains('dark-mode');
};

window.toggleDarkMode = function() {
    const isDark = document.getElementById('dark-mode-toggle').checked;
    if(isDark) { 
        document.body.classList.add('dark-mode'); 
        localStorage.setItem('theme', 'dark'); 
    } else { 
        document.body.classList.remove('dark-mode'); 
        localStorage.setItem('theme', 'light'); 
    }
};

// Sayfa yüklendiğinde UI bileşenlerini bas ve temayı uygula
document.addEventListener("DOMContentLoaded", () => {
    // 1. Bileşenleri yükle
    loadUIComponents();
    
    // 2. Temayı (Gece Modu) kontrol et
    if(localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-mode');
        const toggle = document.getElementById('dark-mode-toggle');
        if(toggle) toggle.checked = true;
    }
});