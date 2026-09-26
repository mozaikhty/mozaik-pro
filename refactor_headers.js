const fs = require('fs');

const unifiedHeaderTemplate = `
    <!-- YENİ ÜST MENÜ (HEADER) -->
    <header class="sticky top-0 z-40 bg-white/90 dark:bg-[#0b1121]/90 backdrop-blur-md border-b border-slate-200 dark:border-gray-800 transition-colors duration-300">
        <div class="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <!-- Logo -->
            <div class="flex items-center space-x-1 text-2xl font-bold text-slate-900 dark:text-white tracking-wide cursor-pointer" onclick="window.scrollTo(0,0)">
                <span>M</span>
                <div class="flex grid grid-cols-2 gap-0.5">
                    <div class="w-2 h-2 bg-pink-500 rounded-sm"></div>
                    <div class="w-2 h-2 bg-blue-500 rounded-sm"></div>
                    <div class="w-2 h-2 bg-cyan-400 rounded-sm"></div>
                    <div class="w-2 h-2 bg-purple-500 rounded-sm"></div>
                </div>
                <span>zaik</span>
            </div>

            <!-- Ortadaki Menü -->
            __CENTER_NAV__

            <!-- Sağ İkonlar -->
            <div class="flex items-center space-x-6 text-xl text-slate-600 dark:text-gray-300">
                <i class="fa-regular fa-comment-dots cursor-pointer hover:text-cyan-500 dark:hover:text-white transition" onclick="window.location.href='chat.html'"></i>
                <!-- Mobil profil avatarı (Sadece mobilde görünür) -->
                <div id="mobile-avatar-header" class="md:hidden w-8 h-8 rounded-full bg-slate-200 dark:bg-gray-800 overflow-hidden cursor-pointer" onclick="window.goToMyProfile()">👤</div>
            </div>
        </div>
    </header>
`;

function extractNav(html) {
    const navMatch = html.match(/<nav[^>]*>([\s\S]*?)<\/nav>/);
    if (navMatch) {
        let navContent = navMatch[1];
        return `<nav class="hidden md:flex space-x-8 text-sm font-medium">\n${navContent}\n            </nav>`;
    }
    return '';
}

// 1. SEARCH.HTML
let searchHtml = fs.readFileSync('search.html', 'utf8');
const searchNav = extractNav(searchHtml);
let searchNewHeader = unifiedHeaderTemplate.replace('__CENTER_NAV__', searchNav);

// Find and remove old desktop header
searchHtml = searchHtml.replace(/<header class="hidden lg:block[\s\S]*?<\/header>/, searchNewHeader);

// Find old mobile header and extract the search input
const searchMobileMatch = searchHtml.match(/(<!-- MOBILE HEADER -->[\s\S]*?<div class="lg:hidden[^>]*>)\s*([\s\S]*?)(<div id="mobile-avatar-header"[\s\S]*?<\/div>\s*<\/div>)/);
if (searchMobileMatch) {
    const searchInput = searchMobileMatch[2]; // the search input block
    const newMobileBar = `
    <!-- MOBILE SEARCH BAR -->
    <div class="md:hidden px-4 py-3 bg-white/95 dark:bg-[#0b1121]/95 border-b border-slate-200 dark:border-gray-800 z-30 sticky top-16">
        ${searchInput.trim()}
    </div>
    `;
    searchHtml = searchHtml.replace(searchMobileMatch[0], newMobileBar);
}
fs.writeFileSync('search.html', searchHtml, 'utf8');
console.log('Fixed search.html');

// 2. CHAT.HTML
let chatHtml = fs.readFileSync('chat.html', 'utf8');
const chatNav = extractNav(chatHtml);
let chatNewHeader = unifiedHeaderTemplate.replace('__CENTER_NAV__', chatNav);

chatHtml = chatHtml.replace(/<header class="hidden lg:block[\s\S]*?<\/header>/, chatNewHeader);

// Chat mobile header might have page specific content?
const chatMobileMatch = chatHtml.match(/(<!-- MOBILE HEADER -->[\s\S]*?<div class="lg:hidden[^>]*>)\s*([\s\S]*?)(<div id="mobile-avatar-header"[\s\S]*?<\/div>\s*<\/div>)/);
if (chatMobileMatch) {
    const chatInput = chatMobileMatch[2]; 
    if (chatInput.trim().length > 0 && !chatInput.includes('logo')) {
        const newMobileBar = `
        <!-- MOBILE SPECIFIC BAR -->
        <div class="md:hidden px-4 py-3 bg-white/95 dark:bg-[#0b1121]/95 border-b border-slate-200 dark:border-gray-800 z-30 sticky top-16">
            ${chatInput.trim()}
        </div>
        `;
        chatHtml = chatHtml.replace(chatMobileMatch[0], newMobileBar);
    } else {
        chatHtml = chatHtml.replace(chatMobileMatch[0], ''); // Delete if it only had logo/avatar
    }
}
fs.writeFileSync('chat.html', chatHtml, 'utf8');
console.log('Fixed chat.html');

// 3. NOTIFICATIONS.HTML
let notifHtml = fs.readFileSync('notifications.html', 'utf8');
const notifNav = extractNav(notifHtml);
let notifNewHeader = unifiedHeaderTemplate.replace('__CENTER_NAV__', notifNav);

notifHtml = notifHtml.replace(/<header class="hidden lg:block[\s\S]*?<\/header>/, notifNewHeader);

const notifMobileMatch = notifHtml.match(/(<!-- MOBILE HEADER -->[\s\S]*?<div class="lg:hidden[^>]*>)\s*([\s\S]*?)(<div id="mobile-avatar-header"[\s\S]*?<\/div>\s*<\/div>)/);
if (notifMobileMatch) {
    const notifInput = notifMobileMatch[2]; 
    if (notifInput.trim().length > 0 && !notifInput.includes('logo')) {
        const newMobileBar = `
        <!-- MOBILE SPECIFIC BAR -->
        <div class="md:hidden px-4 py-3 bg-white/95 dark:bg-[#0b1121]/95 border-b border-slate-200 dark:border-gray-800 z-30 sticky top-16">
            ${notifInput.trim()}
        </div>
        `;
        notifHtml = notifHtml.replace(notifMobileMatch[0], newMobileBar);
    } else {
        notifHtml = notifHtml.replace(notifMobileMatch[0], '');
    }
}
fs.writeFileSync('notifications.html', notifHtml, 'utf8');
console.log('Fixed notifications.html');
