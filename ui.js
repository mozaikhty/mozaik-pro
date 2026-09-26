// ui.js - GÜNCELLENMİŞ VE GÜVENLİ SÜRÜM

function loadUIComponents() {
    const path = window.location.pathname;
    const page = path.split('/').pop() || 'feed.html';

    // === SOL MENÜ ===
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
                </div>
            
            <button class="desktop-post-btn" onclick="window.openMainPostModal?.() || window.location.href='feed.html?action=post'">Gönderi Yayınla</button>

            <div class="sidebar-user-menu ${page === 'profile.html' ? 'active' : ''}" onclick="window.goToMyProfile?.()">
                <div class="sidebar-user-avatar" id="desktop-sidebar-avatar">👤</div>
                <div class="sidebar-user-info">
                    <div class="sidebar-user-name" id="desktop-sidebar-name">Yükleniyor...</div>
                    <div class="sidebar-user-handle" id="desktop-sidebar-handle">@bekleniyor</div>
                </div>
                <div style="font-size: 20px; color: #64748b; margin-left: auto; padding: 5px; cursor: pointer;" onclick="event.stopPropagation(); window.openSettingsModal()">⚙️</div>
            </div>
        </div>
    `;

    // === ALT MENÜ ===
    const bottomNavHTML = ``; // Mevcutta feed.html içinde barınıyor

    // === AYARLAR MODALI ===
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
                    <div style="font-size: 16px; font-weight: 600; color: #334155; cursor: pointer;" class="settings-text" onclick="window.openSupportModal?.()">❓ Yardım ve İletişim</div>
                    <div style="font-size: 16px; font-weight: 600; color: #ef4444; cursor: pointer; padding-top: 15px; border-top: 1px solid #f1f5f9;" class="settings-text" onclick="window.logoutUser?.()">🚪 Çıkış Yap</div>
                </div>
            </div>
        </div>
    `;

    // === TOAST (BİLDİRİM) TASARIMI ===
    const toastHTML = `
        <style>
            #toast-container {
                position: fixed;
                bottom: 30px;
                right: 30px;
                z-index: 9999;
                display: flex;
                flex-direction: column;
                gap: 12px;
                pointer-events: none;
            }
            .toast-msg {
                min-width: 250px;
                max-width: 350px;
                color: white;
                padding: 16px 20px;
                border-radius: 12px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                font-size: 14px;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 12px;
                transform: translateX(120%);
                opacity: 0;
                transition: all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
                pointer-events: auto;
            }
            .toast-msg.show {
                transform: translateX(0);
                opacity: 1;
            }
            .toast-success { background-color: #10b981; }
            .toast-error { background-color: #ef4444; }
            .toast-info { background-color: #3b82f6; }
            
            @media (max-width: 1000px) {
                #toast-container {
                    bottom: 80px; 
                    right: 20px;
                    left: 20px;
                    align-items: center;
                }
            }
        </style>
        <div id="toast-container"></div>
    `;

    // HTML'leri Ekrana Bas
    const sidebarContainer = document.getElementById('sidebar-container');
    if (sidebarContainer) sidebarContainer.innerHTML = sidebarHTML;

    const bottomNavContainer = document.getElementById('bottom-nav-container');
    if (bottomNavContainer) bottomNavContainer.innerHTML = bottomNavHTML;

    if (!document.getElementById('settings-modal')) {
        document.body.insertAdjacentHTML('beforeend', settingsModalHTML);
    }
    
    if (!document.getElementById('toast-container')) {
        document.body.insertAdjacentHTML('beforeend', toastHTML);
    }

    // === MOBİL YAN PANEL OVERLAY ===
    const mobilePanelHTML = `
        <div id="mobile-side-panel-overlay" class="fixed inset-0 z-[6000] hidden bg-black/40 transition-opacity duration-300 opacity-0" onclick="window.closeMobilePanel(event)"></div>
    `;
    if (!document.getElementById('mobile-side-panel-overlay')) {
        document.body.insertAdjacentHTML('beforeend', mobilePanelHTML);
    }
    
    // Sağ sütun varsa mobilde kapatma butonu ekle (Günün görevi duplicate sorunu için temizlendi)
    const rightSidebar = document.getElementById('right-sidebar');
    if (rightSidebar && !document.getElementById('mobile-panel-close-btn')) {
        rightSidebar.insertAdjacentHTML('afterbegin', `
            <div id="mobile-panel-close-btn" class="flex lg:hidden items-center justify-between pb-4 mb-4 border-b border-slate-200 dark:border-gray-800">
                <span class="font-bold text-lg text-slate-800 dark:text-white">Menü</span>
                <button class="text-3xl leading-none text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white transition" onclick="window.closeMobilePanel(event)">&times;</button>
            </div>
        `);
    }
}

window.openMobilePanel = function(event) {
    if(event) event.stopPropagation();
    let overlay = document.getElementById('mobile-side-panel-overlay');
    let sidebar = document.getElementById('right-sidebar');
    
    // Eğer sayfada sağ panel yoksa (Örn: Keşfet, Mesajlar, Reels), dinamik olarak oluştur
    if (!sidebar) {
        const sidebarHTML = `
        <div id="right-sidebar" class="responsive-right-sidebar hidden lg:flex flex-col space-y-4 sticky top-20 h-fit">
            <div id="mobile-panel-close-btn" class="flex lg:hidden items-center justify-between pb-4 mb-4 border-b border-slate-200 dark:border-gray-800">
                <span class="font-bold text-lg text-slate-800 dark:text-white">Menü</span>
                <button class="text-3xl leading-none text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white transition" onclick="window.closeMobilePanel(event)">&times;</button>
            </div>
            
            <div class="rounded-2xl p-5 bg-[url('https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=500&q=80')] bg-cover bg-center relative overflow-hidden group cursor-pointer shadow-sm" onclick="window.goToMyProfile()">
                <div class="absolute inset-0 bg-slate-900/60 group-hover:bg-slate-900/50 transition"></div>
                <div class="relative z-10">
                    <div class="flex items-center gap-2 mb-2">
                        <i class="fa-solid fa-face-smile text-cyan-400"></i>
                        <span class="font-bold text-sm text-white">Senin Mozaik'in</span>
                    </div>
                    <p class="text-xs text-gray-200">Profiline gitmek için tıkla.</p>
                    <p class="text-xs text-white mt-8 font-medium">Hayatını mozaik gibi<br>bir araya getir. ✨</p>
                </div>
            </div>
            
            <div class="rounded-2xl p-5 bg-white dark:bg-[#151e32] border border-slate-200 dark:border-purple-900/50 shadow-sm transition-colors duration-300">
                <div class="flex items-center gap-2 mb-3 border-b border-slate-100 dark:border-gray-800 pb-2">
                    <div class="w-7 h-7 rounded-full bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400"><i class="fa-solid fa-cube text-xs"></i></div>
                    <span class="font-bold text-sm text-slate-900 dark:text-white">Önerilen Hesaplar</span>
                </div>
                <div id="who-to-follow-list" class="space-y-2 mt-2">
                    <div class="text-sm text-slate-500 dark:text-gray-400 py-2 text-center">Öneriler yükleniyor...</div>
                </div>
            </div>
        </div>`;
        
        document.body.insertAdjacentHTML('beforeend', sidebarHTML);
        sidebar = document.getElementById('right-sidebar');
        
        if (window.renderWhoToFollowGlobal) {
            window.renderWhoToFollowGlobal();
        }
    } else {
        if (window.renderWhoToFollowGlobal && document.getElementById('who-to-follow-list') && document.getElementById('who-to-follow-list').innerHTML.includes('yükleniyor')) {
            window.renderWhoToFollowGlobal();
        }
    }
    
    if(overlay && sidebar) {
        overlay.classList.remove('hidden');
        void overlay.offsetWidth;
        overlay.classList.remove('opacity-0');
        document.body.classList.add('mobile-panel-open');
        document.body.style.overflow = 'hidden';
    }
};

window.closeMobilePanel = function(event) {
    if(event) event.stopPropagation();
    const overlay = document.getElementById('mobile-side-panel-overlay');
    if(overlay) {
        overlay.classList.add('opacity-0');
        document.body.classList.remove('mobile-panel-open');
        setTimeout(() => {
            overlay.classList.add('hidden');
            document.body.style.overflow = '';
        }, 300);
    }
};

// === DİĞER FONKSİYONLAR ===
window.openSettingsModal = function() {
    const settingsModal = document.getElementById('settings-modal');
    if(settingsModal) {
        settingsModal.style.display = 'flex';
    }
    const toggle = document.getElementById('dark-mode-toggle');
    if(toggle) toggle.checked = document.body.classList.contains('dark-mode');
};

window.toggleDarkMode = function() {
    const toggle = document.getElementById('dark-mode-toggle');
    if(!toggle) return;
    
    const isDark = toggle.checked;
    
    if(isDark) { 
        document.body.classList.add('dark-mode'); 
    } else { 
        document.body.classList.remove('dark-mode'); 
    }

    try {
        if(isDark) {
            localStorage.setItem('theme', 'dark');
        } else {
            localStorage.setItem('theme', 'light');
        }
    } catch(e) {
        console.warn("Tarayıcı gizlilik ayarları nedeniyle tema tercihi kaydedilemedi.");
    }
};

function initUI() {
    loadUIComponents();
    try {
        if(localStorage.getItem('theme') === 'dark') {
            document.body.classList.add('dark-mode');
            const toggle = document.getElementById('dark-mode-toggle');
            if(toggle) toggle.checked = true;
        }
    } catch(e) {}
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
} else {
    initUI();
}

// --- NAV AND HEADER SCROLL BEHAVIOR ---
(function() {
    class ScrollManager {
        constructor() {
            this.lastScrollY = 0;
            this.currentState = 'expanded'; 
            this.isBottomCompact = false;
            this.bottomNav = document.querySelector('.bottom-nav');
            this.bindEvents();
        }

        bindEvents() {
            window.addEventListener('scroll', () => {
                this.handleScroll(window.scrollY || document.documentElement.scrollTop);
            }, { passive: true });

            const scrollableContainers = document.querySelectorAll('.inbox-list');
            scrollableContainers.forEach(container => {
                container.addEventListener('scroll', () => {
                    this.handleScroll(container.scrollTop);
                }, { passive: true });
            });

            setTimeout(() => {
                const initY = window.scrollY || (scrollableContainers.length > 0 ? scrollableContainers[0].scrollTop : 0);
                this.lastScrollY = initY;
                if (window.innerWidth <= 1024 && initY > 10) {
                    this.setBottomNavState(true);
                    this.setHeaderState('hidden');
                }
            }, 100);
        }

        setBottomNavState(isCompact) {
            if (this.isBottomCompact !== isCompact) {
                this.isBottomCompact = isCompact;
                
                if (isCompact) {
                    document.body.classList.add('sidebar-compact');
                } else {
                    document.body.classList.remove('sidebar-compact');
                }

                if (this.bottomNav) {
                    if (isCompact) this.bottomNav.classList.add('compact');
                    else this.bottomNav.classList.remove('compact');
                }
            }
        }

        setHeaderState(state) {
            if (this.currentState === state) return;
            this.currentState = state;
            
            if (state === 'expanded') {
                document.body.classList.remove('header-hidden', 'header-compact');
            } else if (state === 'hidden') {
                document.body.classList.add('header-hidden');
                document.body.classList.remove('header-compact');
            } else if (state === 'compact') {
                document.body.classList.add('header-compact');
                document.body.classList.remove('header-hidden');
            }
        }

        handleScroll(currentY) {
            if (window.innerWidth > 1024) {
                this.setHeaderState('expanded');
                return;
            }

            if (currentY > 50) this.setBottomNavState(true);
            else if (currentY <= 10) this.setBottomNavState(false);

            if (currentY <= 10) {
                this.setHeaderState('expanded');
            } else {
                const delta = currentY - this.lastScrollY;
                if (Math.abs(delta) > 5) {
                    if (delta > 0) {
                        this.setHeaderState('hidden');
                    } else {
                        this.setHeaderState('compact');
                    }
                    this.lastScrollY = currentY;
                }
            }
        }
    }

    function initScrollManager() {
        new ScrollManager();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initScrollManager);
    } else {
        initScrollManager();
    }
})();