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

    // HTML'leri Ekrana Bas (Null Kontrolleri Eklendi)
    const sidebarContainer = document.getElementById('sidebar-container');
    if (sidebarContainer) sidebarContainer.innerHTML = sidebarHTML;

    const bottomNavContainer = document.getElementById('bottom-nav-container');
    if (bottomNavContainer) bottomNavContainer.innerHTML = bottomNavHTML;

    if (!document.getElementById('settings-modal')) {
        document.body.insertAdjacentHTML('beforeend', settingsModalHTML);
    }
    
    if (!document.getElementById('toast-container')) {
        document.body.insertAdjacentHTML('beforeend', toastHTML);

    // === MOBİL YAN PANEL ===
    const mobilePanelHTML = `
        <div id="mobile-side-panel-overlay" class="fixed inset-0 z-[6000] hidden bg-black/40 transition-opacity duration-300 opacity-0" onclick="window.closeMobilePanel(event)">
            <div id="mobile-side-panel" class="absolute top-0 right-0 h-full w-[85%] max-w-[400px] bg-white dark:bg-[#0b1121] shadow-[-10px_0_30px_rgba(0,0,0,0.1)] transform translate-x-full transition-transform duration-300 flex flex-col" onclick="event.stopPropagation()">
                <div class="flex items-center justify-between p-5 border-b border-slate-200 dark:border-gray-800">
                    <span class="font-bold text-lg text-slate-800 dark:text-white">Menü</span>
                    <button class="text-3xl leading-none text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-white transition" onclick="window.closeMobilePanel()">&times;</button>
                </div>
                <div class="flex-1 overflow-y-auto p-5">
                    <!-- İçerik alanı (Kullanıcı daha sonra belirleyecek) -->
                </div>
            </div>
        </div>
    `;
    if (!document.getElementById('mobile-side-panel-overlay')) {
        document.body.insertAdjacentHTML('beforeend', mobilePanelHTML);
    }

    }
}

// === GLOBAL TOAST FONKSİYONU ===
window.showToast = function(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if(!container) return; // Sayfada toast container yoksa hata fırlatmasını engeller

    const toast = document.createElement('div');
    toast.className = 'toast-msg toast-' + type;
    
    let icon = '✅';
    if(type === 'error') icon = '❌';
    if(type === 'info') icon = 'ℹ️';

    // Güvenlik: Mesajı escape et (XSS önlemi)
    const safeMessage = window.escapeHtml ? window.escapeHtml(message) : message;
    toast.innerHTML = '<span>' + icon + '</span> <span>' + safeMessage + '</span>';
    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400); 
    }, 3000);
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

    // Gizli modlarda localStorage kısıtlamasına karşı Try-Catch bloğu
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
            this.currentState = 'expanded'; // expanded, hidden, compact
            this.isBottomCompact = false;
            
            // DOM Elements
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

            // Init state
            setTimeout(() => {
                const initY = window.scrollY || (scrollableContainers.length > 0 ? scrollableContainers[0].scrollTop : 0);
                this.lastScrollY = initY;
                // Sadece mobilde scroll varsa gizle
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
            
            // Apply states to body instead of header directly for more robust CSS targeting
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
            // MASAÜSTÜNDE SABİT KALMASI İÇİN
            if (window.innerWidth > 1024) {
                this.setHeaderState('expanded');
                return;
            }

            // 1. Alt Navigasyon Mantığı (Bağımsız)
            if (currentY > 50) this.setBottomNavState(true);
            else if (currentY <= 10) this.setBottomNavState(false);

            // 2. Akıllı Header Durum Makinesi
            if (currentY <= 10) {
                // DURUM A / D: En üste gelindi, her şey görünür.
                this.setHeaderState('expanded');
            } else {
                const delta = currentY - this.lastScrollY;
                
                // Titreme önleyici tolerans
                if (Math.abs(delta) > 5) {
                    if (delta > 0) {
                        // DURUM B: Aşağı kaydırma
                        this.setHeaderState('hidden');
                    } else {
                        // DURUM C: Sayfanın ortasında yukarı kaydırma
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


window.openMobilePanel = function() {
    const overlay = document.getElementById('mobile-side-panel-overlay');
    const panel = document.getElementById('mobile-side-panel');
    if(overlay && panel) {
        overlay.classList.remove('hidden');
        void overlay.offsetWidth;
        overlay.classList.remove('opacity-0');
        panel.classList.remove('translate-x-full');
        document.body.style.overflow = 'hidden';
    }
};

window.closeMobilePanel = function(event) {
    const overlay = document.getElementById('mobile-side-panel-overlay');
    const panel = document.getElementById('mobile-side-panel');
    if(overlay && panel) {
        overlay.classList.add('opacity-0');
        panel.classList.add('translate-x-full');
        setTimeout(() => {
            overlay.classList.add('hidden');
            document.body.style.overflow = '';
        }, 300);
    }
};
