const fs = require('fs');

let css = fs.readFileSync('style.css', 'utf8');
let uiJS = fs.readFileSync('ui.js', 'utf8');

// 1. CLEANUP CSS
// Remove ALL previous scroll-hide logic
css = css.replace(/\/\* MOBİL HEADER COMPACT MODE \*\/[\s\S]*/, '');
// If there are any stray h-state or header-state classes, remove them
css = css.replace(/body\.h-state-down[\s\S]*?\}/g, '');
css = css.replace(/body\.h-state-up[\s\S]*?\}/g, '');
css = css.replace(/body\.header-state-down[\s\S]*?\}/g, '');
css = css.replace(/body\.header-state-up[\s\S]*?\}/g, '');

const newArchitectureCSS = `
/* ==========================================================================
   MOBİL HEADER SCROLL-HIDE ARCHITECTURE
   ========================================================================== */
@media (max-width: 1000px) {
    /* 1. Doğru Mimari: Mobilde header'lar sticky değil, fixed olmalıdır. 
       Bu sayede transform animasyonları donanım hızlandırmasıyla pürüzsüz çalışır. */
    .header-sticky, .chat-header-main {
        position: fixed !important;
        top: 0;
        left: 0;
        width: 100%;
        max-width: 100vw;
        box-sizing: border-box;
        z-index: 1000;
        transition: transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), background 0.3s ease !important;
    }

    /* Fixed header'ın altında kalan içeriğin örtülmemesi için padding */
    .feed-main:not(#inbox-column) {
        padding-top: 110px !important; /* Feed tabs (40px) + Header top (60px) */
    }
    #inbox-column {
        padding-top: 75px !important; /* Mesajlar header yüksekliği */
    }

    /* 2. Scroll Aşağı: Tamamen Gizle */
    .header-sticky.header-hidden, 
    .chat-header-main.header-hidden {
        transform: translateY(-110%) !important;
        pointer-events: none !important;
    }

    /* Inbox arama sekmeleri: Header gizlenirken bunlar da yukarı daralır */
    .inbox-search-container, #inbox-tabs {
        transition: max-height 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.3s ease;
        max-height: 120px;
        overflow: hidden;
        opacity: 1;
    }
    .inbox-search-container.search-hidden, #inbox-tabs.search-hidden {
        max-height: 0 !important;
        opacity: 0 !important;
        margin-bottom: 0 !important;
        padding-top: 0 !important;
        padding-bottom: 0 !important;
        border: none !important;
    }

    /* 3. Scroll Yukarı: Yalnızca Avatar Göster (Kompakt Mod) */
    .header-sticky.header-compact,
    .chat-header-main.header-compact {
        transform: translateY(0) !important;
        background: transparent !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        border-bottom-color: transparent !important;
        pointer-events: none !important;
    }

    /* Kompakt modda header içindeki diğer öğeleri gizle */
    .header-sticky.header-compact .mobile-logo-text,
    .header-sticky.header-compact .feed-tabs:not(#inbox-tabs),
    .header-sticky.header-compact .search-header-box,
    .header-sticky.header-compact .category-pills-wrapper,
    .header-sticky.header-compact .header-info,
    .chat-header-main.header-compact .header-title,
    .chat-header-main.header-compact .header-icons {
        opacity: 0 !important;
        pointer-events: none !important;
        transform: translateY(-15px);
        transition: all 0.3s ease !important;
    }

    /* Yalnızca avatarı ve geri tuşunu tıklanabilir ve görünür bırak */
    .header-sticky.header-compact #mobile-avatar-header,
    .chat-header-main.header-compact #mobile-avatar-header,
    .header-sticky.header-compact .back-arrow {
        pointer-events: auto !important;
        opacity: 1 !important;
        background: rgba(226, 232, 240, 0.95) !important;
        backdrop-filter: blur(10px) !important;
        -webkit-backdrop-filter: blur(10px) !important;
        box-shadow: 0 4px 10px rgba(0,0,0,0.1) !important;
        border-radius: 8px;
        transition: all 0.3s ease !important;
    }
    
    body.dark-mode .header-sticky.header-compact #mobile-avatar-header,
    body.dark-mode .chat-header-main.header-compact #mobile-avatar-header,
    body.dark-mode .header-sticky.header-compact .back-arrow {
        background: rgba(30, 41, 59, 0.95) !important;
    }
}
`;
fs.writeFileSync('style.css', css + newArchitectureCSS, 'utf8');

// 2. CLEANUP UI.JS
// Strip old scroll behaviors
uiJS = uiJS.replace(/\/\/ --- NAV AND HEADER SCROLL BEHAVIOR ---[\s\S]*/, '');

const newUIJS = `// --- NAV AND HEADER SCROLL BEHAVIOR ---
(function() {
    class ScrollManager {
        constructor() {
            this.lastScrollY = 0;
            this.isBottomCompact = false;
            
            // DOM Elements
            this.header = document.querySelector('.header-sticky') || document.querySelector('.chat-header-main');
            this.bottomNav = document.querySelector('.bottom-nav');
            this.inboxSearch = document.querySelector('.inbox-search-container');
            this.inboxTabs = document.querySelector('#inbox-tabs');
            
            // Clean inline transitions that override CSS
            if (this.header) {
                this.header.style.transition = '';
            }

            this.bindEvents();
        }

        bindEvents() {
            // Ana pencere scroll (Anasayfa, Keşfet, Profil)
            window.addEventListener('scroll', () => {
                this.handleScroll(window.scrollY || document.documentElement.scrollTop);
            }, { passive: true });

            // Mesajlar sayfası özel scroll container
            const inboxList = document.querySelector('.inbox-list');
            if (inboxList) {
                inboxList.addEventListener('scroll', () => {
                    this.handleScroll(inboxList.scrollTop);
                }, { passive: true });
            }

            // İlk açılışta state'i ayarla
            setTimeout(() => {
                const initY = window.scrollY || (inboxList ? inboxList.scrollTop : 0);
                this.lastScrollY = initY;
                if (initY > 50) {
                    if (this.bottomNav) {
                        this.isBottomCompact = true;
                        this.bottomNav.classList.add('compact');
                    }
                    if (this.header) {
                        this.header.classList.add('header-hidden');
                    }
                }
            }, 100);
        }

        handleScroll(currentY) {
            // 1. Alt Navigasyon (Bağımsız çalışır)
            if (currentY > 50 && !this.isBottomCompact) {
                this.isBottomCompact = true;
                if (this.bottomNav) this.bottomNav.classList.add('compact');
            } else if (currentY <= 10 && this.isBottomCompact) {
                this.isBottomCompact = false;
                if (this.bottomNav) this.bottomNav.classList.remove('compact');
            }

            // 2. Üst Header Yönlü Animasyon
            if (currentY <= 10) {
                // En üstteyken her şeyi normal haline döndür
                if (this.header) {
                    this.header.classList.remove('header-hidden', 'header-compact');
                }
                if (this.inboxSearch) this.inboxSearch.classList.remove('search-hidden');
                if (this.inboxTabs) this.inboxTabs.classList.remove('search-hidden');
            } else {
                const delta = currentY - this.lastScrollY;
                
                // Titremeyi önlemek için sadece 5px'ten büyük hareketleri işle
                if (Math.abs(delta) > 5) {
                    if (delta > 0) {
                        // Aşağı kaydırma: Tamamen gizle
                        if (this.header) {
                            this.header.classList.add('header-hidden');
                            this.header.classList.remove('header-compact');
                        }
                        if (this.inboxSearch) this.inboxSearch.classList.add('search-hidden');
                        if (this.inboxTabs) this.inboxTabs.classList.add('search-hidden');
                    } else {
                        // Yukarı kaydırma: Kompakt avatarı göster
                        if (this.header) {
                            this.header.classList.add('header-compact');
                            this.header.classList.remove('header-hidden');
                        }
                        if (this.inboxSearch) this.inboxSearch.classList.remove('search-hidden');
                        if (this.inboxTabs) this.inboxTabs.classList.remove('search-hidden');
                    }
                    this.lastScrollY = currentY;
                }
            }
        }
    }

    // Sayfa DOM'u hazır olduğunda veya zaten hazırsa başlat
    function init() {
        new ScrollManager();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
`;
fs.writeFileSync('ui.js', uiJS + newUIJS, 'utf8');
console.log('Done rewriting core architecture');
