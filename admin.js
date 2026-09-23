// ==========================================
// MOZAİK — ADMIN PANELİ (admin.js)
// ==========================================
// Tüm admin işlemleri: Dashboard, Kullanıcı CRUD, Arşiv, Destek, Loglar.
// Firebase Firestore serverless mimarisi kullanılır.

import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { collection, onSnapshot, doc, updateDoc, deleteDoc, query, orderBy, getDocs, where, addDoc, serverTimestamp, limit, getDoc, startAt, endAt, getCountFromServer } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { ref, deleteObject } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";
import { auth, db, storage } from './firebase-config.js';

// =====================================
// 1. DURUM DEĞİŞKENLERİ
// =====================================
let adminUsername = '';
let allUsers = [];
let filteredUsers = [];
let currentPage = 1;
const PAGE_SIZE = 20;
let currentFilter = 'all';
let allTickets = [];
let currentTicketFilter = 'all';
let recentPostsLog = [];
let recentNotifsLog = [];
let deleteTargetUser = null;

let allAdminLogs = [];
let filteredAdminLogs = [];
let currentLogPage = 1;
const LOG_PAGE_SIZE = 20;

// =====================================
// 2. YETKİLENDİRME
// =====================================
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    try {
        const adminDoc = await getDoc(doc(db, "admins", user.uid));
        if (!adminDoc.exists()) {
            showAdminToast("Yönetici yetkiniz bulunmamaktadır!", "error");
            setTimeout(() => { window.location.href = "feed.html"; }, 1500);
            return;
        }
        adminUsername = user.displayName || user.email.split('@')[0];
        const nameEl = document.getElementById('admin-name');
        if (nameEl) nameEl.textContent = '@' + adminUsername;
        initPanel();
    } catch (e) {
        showAdminToast("Bağlantı hatası. Yönlendiriliyorsunuz.", "error");
        setTimeout(() => { window.location.href = "feed.html"; }, 1500);
    }
});

window.logoutUser = function() {
    signOut(auth).then(() => { window.location.href = "index.html"; });
};

// =====================================
// 3. PANEL BAŞLATMA
// =====================================
function initPanel() {
    loadUsers();
    loadTickets();
    loadActivityStream();
    loadAdminLogs();
    loadDashboardStats();
    setupNavigation();
    setupFilters();
    setupSearch();
    setupModals();
    setupMobileMenu();
}

// =====================================
// 4. SAYFA NAVİGASYONU
// =====================================
function setupNavigation() {
    document.querySelectorAll('.nav-link[data-page]').forEach(link => {
        link.addEventListener('click', () => {
            const page = link.dataset.page;
            switchPage(page);
        });
    });
}

window.switchPage = function(page) {
    document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-link[data-page]').forEach(l => l.classList.remove('active'));
    const targetPage = document.getElementById('page-' + page);
    const targetLink = document.querySelector(`.nav-link[data-page="${page}"]`);
    if (targetPage) targetPage.classList.add('active');
    if (targetLink) targetLink.classList.add('active');
    const titles = { dashboard: 'Genel Bakış', users: 'Kullanıcı Yönetimi', archive: 'Kişi Arşivi', tickets: 'Destek Talepleri', logs: 'İşlem Geçmişi' };
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = titles[page] || '';
    // Mobilde sidebar kapat
    document.getElementById('admin-sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('show');
};

// =====================================
// 5. MOBİL MENÜ
// =====================================
function setupMobileMenu() {
    document.getElementById('hamburger-btn')?.addEventListener('click', () => {
        document.getElementById('admin-sidebar')?.classList.toggle('open');
        document.getElementById('sidebar-overlay')?.classList.toggle('show');
    });
    document.getElementById('sidebar-overlay')?.addEventListener('click', () => {
        document.getElementById('admin-sidebar')?.classList.remove('open');
        document.getElementById('sidebar-overlay')?.classList.remove('show');
    });
}

// =====================================
// 6. DASHBOARD İSTATİSTİKLERİ
// =====================================
async function loadDashboardStats() {
    try {
        // Kullanıcı istatistikleri (allUsers yüklendikten sonra güncellenir)
        // Gönderi sayısı
        const postsSnap = await getCountFromServer(collection(db, "posts"));
        const postCount = postsSnap.data().count;
        setText('stat-total-posts', postCount);
    } catch (e) {
        // getCountFromServer desteklenmiyorsa
    }
}

function updateDashboardFromUsers() {
    setText('stat-total-users', allUsers.length);
    const active = allUsers.filter(u => !u.isBanned).length;
    const banned = allUsers.filter(u => u.isBanned).length;
    setText('stat-active-users', active);
    setText('stat-banned-users', banned);
}

function updateDashboardFromTickets() {
    setText('stat-total-tickets', allTickets.length);
    const pending = allTickets.filter(t => !t.status || t.status === 'Yeni').length;
    setText('stat-pending-tickets', pending);
}

// =====================================
// 7. KULLANICI YÖNETİMİ
// =====================================
function loadUsers() {
    const q = query(collection(db, "users"), limit(500));
    onSnapshot(q, (snapshot) => {
        allUsers = [];
        snapshot.forEach(docSnap => { allUsers.push({ id: docSnap.id, ...docSnap.data() }); });
        updateDashboardFromUsers();
        applyUserFilter();
    });
}

function setupFilters() {
    // Kullanıcı filtreleri
    document.querySelectorAll('[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            currentPage = 1;
            applyUserFilter();
        });
    });
    // Ticket filtreleri
    document.querySelectorAll('[data-ticket-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-ticket-filter]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTicketFilter = btn.dataset.ticketFilter;
            renderTickets();
        });
    });
}

function setupSearch() {
    // Kullanıcı arama
    let searchTimeout = null;
    document.getElementById('user-search')?.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentPage = 1;
            applyUserFilter();
        }, 300);
    });

    // Global arama (topbar)
    document.getElementById('global-search')?.addEventListener('input', (e) => {
        const text = e.target.value.trim();
        if (text.length > 0) {
            switchPage('users');
            const userSearch = document.getElementById('user-search');
            if (userSearch) userSearch.value = text;
            currentPage = 1;
            applyUserFilter();
        }
    });

    // Log Arama
    document.getElementById('log-search')?.addEventListener('input', () => {
        currentLogPage = 1;
        applyLogsFilter();
    });

    document.getElementById('log-type-filter')?.addEventListener('change', () => {
        currentLogPage = 1;
        applyLogsFilter();
    });

    // Arşiv arama
    setupArchiveSearch();
}

function applyUserFilter() {
    const searchText = (document.getElementById('user-search')?.value || '').toLowerCase().trim();
    filteredUsers = allUsers.filter(u => {
        // Metin filtresi
        if (searchText && !u.id.toLowerCase().includes(searchText)) return false;
        // Durum filtresi
        if (currentFilter === 'active' && u.isBanned) return false;
        if (currentFilter === 'banned' && !u.isBanned) return false;
        if (currentFilter === 'verified' && !u.isVerified) return false;
        return true;
    });
    renderUsersTable();
}

function renderUsersTable() {
    const container = document.getElementById('users-table-container');
    if (!container) return;

    if (filteredUsers.length === 0) {
        container.innerHTML = '<div class="empty-state"><span class="empty-icon">👤</span><p>Sonuç bulunamadı.</p></div>';
        document.getElementById('users-pagination').innerHTML = '';
        return;
    }

    // Sayfalama
    const totalPages = Math.ceil(filteredUsers.length / PAGE_SIZE);
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageUsers = filteredUsers.slice(start, start + PAGE_SIZE);

    let html = `<table class="data-table">
        <thead><tr>
            <th>Kullanıcı</th>
            <th>Durum</th>
            <th>Kayıt</th>
            <th style="text-align:right">İşlem</th>
        </tr></thead><tbody>`;

    pageUsers.forEach(user => {
        const isVerified = user.isVerified || false;
        const isBanned = user.isBanned || false;
        const avatarHtml = user.avatarUrl
            ? `<img src="${escHtml(user.avatarUrl)}" alt="">`
            : '👤';
        const regDate = user.createdAt
            ? user.createdAt.toDate().toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—';

        let statusBadges = '';
        if (isBanned) statusBadges += '<span class="badge-sm status-banned">Banlı</span> ';
        else statusBadges += '<span class="badge-sm status-active">Aktif</span> ';
        if (isVerified) statusBadges += '<span class="badge-sm status-verified">VIP</span>';

        html += `<tr>
            <td><div class="user-cell">
                <div class="user-avatar">${avatarHtml}</div>
                <div><div class="user-name">@${escHtml(user.id)}</div><div class="user-sub">${escHtml(user.fullName || '')}</div></div>
            </div></td>
            <td>${statusBadges}</td>
            <td style="font-size:12px;color:#94a3b8">${regDate}</td>
            <td style="text-align:right">
                <div class="action-menu">
                    <button class="action-trigger" onclick="toggleActionMenu(event, '${escHtml(user.id)}')">⋯</button>
                    <div class="action-dropdown" id="actions-${escHtml(user.id)}">
                        <button onclick="openEditModal('${escHtml(user.id)}')">✏️ Düzenle</button>
                        <button onclick="toggleVerify('${escHtml(user.id)}', ${isVerified})">${isVerified ? '❌ VIP Kaldır' : '✅ VIP Yap'}</button>
                        <button onclick="toggleBan('${escHtml(user.id)}', ${isBanned})">${isBanned ? '🔓 Ban Aç' : '🔒 Banla'}</button>
                        <button onclick="viewUserPosts('${escHtml(user.id)}')">📝 Gönderiler</button>
                        <button class="danger" onclick="confirmDeleteUser('${escHtml(user.id)}')">🗑️ Sil</button>
                    </div>
                </div>
            </td>
        </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    // Sayfalama
    renderPagination(totalPages);
}

function renderPagination(totalPages) {
    const pagEl = document.getElementById('users-pagination');
    if (!pagEl || totalPages <= 1) { if (pagEl) pagEl.innerHTML = ''; return; }

    let html = `<button class="page-btn" onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>‹</button>`;
    for (let i = 1; i <= totalPages; i++) {
        if (i <= 3 || i > totalPages - 2 || Math.abs(i - currentPage) <= 1) {
            html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
        } else if (i === 4 && currentPage > 5) {
            html += '<span class="page-info">…</span>';
        } else if (i === totalPages - 2 && currentPage < totalPages - 4) {
            html += '<span class="page-info">…</span>';
        }
    }
    html += `<button class="page-btn" onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>›</button>`;
    html += `<span class="page-info">${filteredUsers.length} sonuç</span>`;
    pagEl.innerHTML = html;
}

window.goToPage = function(p) {
    const totalPages = Math.ceil(filteredUsers.length / PAGE_SIZE);
    if (p < 1 || p > totalPages) return;
    currentPage = p;
    renderUsersTable();
};

// =====================================
// 8. İŞLEM DROPDOWN
// =====================================
window.toggleActionMenu = function(event, userId) {
    event.stopPropagation();
    document.querySelectorAll('.action-dropdown.show').forEach(d => d.classList.remove('show'));
    const dropdown = document.getElementById('actions-' + userId);
    if (dropdown) dropdown.classList.toggle('show');
};

document.addEventListener('click', () => {
    document.querySelectorAll('.action-dropdown.show').forEach(d => d.classList.remove('show'));
});

// =====================================
// 9. KULLANICI İŞLEMLERİ
// =====================================
window.toggleVerify = async function(username, status) {
    try {
        await updateDoc(doc(db, "users", username), { isVerified: !status });
        await logAdminAction('verify', username, status ? 'VIP kaldırıldı' : 'VIP yapıldı');
        showAdminToast(status ? "VIP rozeti kaldırıldı." : "VIP rozeti verildi.", "success");
    } catch (e) {
        showAdminToast("İşlem başarısız.", "error");
    }
};

window.toggleBan = async function(username, status) {
    try {
        await updateDoc(doc(db, "users", username), { isBanned: !status });
        await logAdminAction('ban', username, status ? 'Ban kaldırıldı' : 'Banlandı');
        showAdminToast(status ? "Ban kaldırıldı." : "Kullanıcı banlandı.", "success");
    } catch (e) {
        showAdminToast("İşlem başarısız.", "error");
    }
};

window.confirmDeleteUser = function(username) {
    deleteTargetUser = username;
    document.getElementById('delete-target-user').textContent = '@' + username;
    openModal('modal-confirm-delete');
};

window.executeDeleteUser = async function() {
    if (!deleteTargetUser) return;
    const username = deleteTargetUser;
    const btn = document.getElementById('confirm-delete-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Siliniyor...'; }

    try {
        // 1. Kullanıcının fotoğraflarını sil
        const userRef = doc(db, "users", username);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            const uData = userSnap.data();
            if (uData.avatarUrl) await deleteObject(ref(storage, uData.avatarUrl)).catch(() => {});
            if (uData.bannerUrl) await deleteObject(ref(storage, uData.bannerUrl)).catch(() => {});
        }

        // 2. Kullanıcının postlarını ve fotoğraflarını sil
        const q = query(collection(db, "posts"), where("author", "==", username));
        const snap = await getDocs(q);
        for (const d of snap.docs) {
            const postData = d.data();
            if (postData.imageUrl && !postData.isRepost) {
                await deleteObject(ref(storage, postData.imageUrl)).catch(() => {});
            }
            await deleteDoc(doc(db, "posts", d.id));
        }

        // 3. Kullanıcı belgesini sil
        await deleteDoc(userRef);
        await logAdminAction('delete_user', username, 'Kullanıcı ve tüm verileri silindi');
        showAdminToast("Kullanıcı ve tüm verileri silindi.", "success");
    } catch (e) {
        showAdminToast("Silme işlemi başarısız.", "error");
    }

    deleteTargetUser = null;
    closeModal('modal-confirm-delete');
    if (btn) { btn.disabled = false; btn.textContent = '🗑️ Kalıcı Olarak Sil'; }
};

// =====================================
// 10. KULLANICI DÜZENLEME
// =====================================
window.openEditModal = function(username) {
    const user = allUsers.find(u => u.id === username);
    if (!user) return;
    document.getElementById('edit-user-id').value = username;
    document.getElementById('edit-username').value = '@' + username;
    document.getElementById('edit-fullname').value = user.fullName || '';
    document.getElementById('edit-bio').value = user.bio || '';
    document.getElementById('edit-location').value = user.location || '';
    openModal('modal-edit-user');
};

window.saveEditUser = async function() {
    const username = document.getElementById('edit-user-id').value;
    const fullName = document.getElementById('edit-fullname').value.trim();
    const bio = document.getElementById('edit-bio').value.trim();
    const location = document.getElementById('edit-location').value.trim();

    if (!username) return;
    if (fullName.length > 50) { showAdminToast("Ad soyad 50 karakteri aşamaz.", "error"); return; }
    if (bio.length > 250) { showAdminToast("Biyografi 250 karakteri aşamaz.", "error"); return; }
    if (location.length > 50) { showAdminToast("Konum 50 karakteri aşamaz.", "error"); return; }

    const btn = document.getElementById('save-edit-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Kaydediliyor...'; }

    try {
        await updateDoc(doc(db, "users", username), { fullName, bio, location });
        await logAdminAction('edit_user', username, 'Profil bilgileri güncellendi');
        showAdminToast("Kullanıcı bilgileri güncellendi.", "success");
        closeModal('modal-edit-user');
    } catch (e) {
        showAdminToast("Güncelleme başarısız.", "error");
    }
    if (btn) { btn.disabled = false; btn.textContent = '💾 Kaydet'; }
};

// =====================================
// 11. KULLANICI GÖNDERİLERİ
// =====================================
window.viewUserPosts = async function(username) {
    const title = document.getElementById('posts-modal-title');
    if (title) title.textContent = '@' + username + ' Gönderileri';
    const list = document.getElementById('user-posts-list');
    if (!list) return;
    list.innerHTML = '<div class="empty-state"><p>Yükleniyor...</p></div>';
    openModal('modal-user-posts');

    try {
        const q = query(collection(db, "posts"), where("author", "==", username), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        if (snap.empty) { list.innerHTML = '<div class="empty-state"><span class="empty-icon">📭</span><p>Gönderi bulunamadı.</p></div>'; return; }

        let html = '';
        snap.forEach(d => {
            const data = d.data();
            const content = DOMPurify.sanitize(data.content || '');
            const date = data.createdAt ? data.createdAt.toDate().toLocaleDateString('tr-TR') : '';
            const imgHtml = data.imageUrl ? `<img src="${escHtml(data.imageUrl)}" style="max-width:100%;border-radius:8px;margin:8px 0;pointer-events:none">` : '';
            html += `<div style="padding:12px;border:1px solid #334155;border-radius:8px;margin-bottom:10px;background:#0f172a" id="post-${d.id}">
                <div style="font-size:13px;color:#cbd5e1;margin-bottom:6px">${content}</div>
                ${imgHtml}
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
                    <span style="font-size:11px;color:#64748b">${date}</span>
                    <button class="btn-danger" style="padding:5px 10px;font-size:11px" onclick="adminDeletePost('${d.id}','${escHtml(username)}')">🚨 Sil</button>
                </div>
            </div>`;
        });
        list.innerHTML = html;
    } catch (e) {
        list.innerHTML = '<div class="empty-state"><p style="color:#ef4444">Yükleme hatası.</p></div>';
    }
};

window.adminDeletePost = async function(postId, author) {
    if (!confirm("Bu gönderiyi kalıcı olarak silmek istiyor musunuz?")) return;
    try {
        const postRef = doc(db, "posts", postId);
        const postSnap = await getDoc(postRef);
        if (postSnap.exists()) {
            const postData = postSnap.data();
            if (postData.imageUrl && !postData.isRepost) {
                await deleteObject(ref(storage, postData.imageUrl)).catch(() => {});
            }
        }
        await deleteDoc(postRef);
        await addDoc(collection(db, "notifications"), { type: 'admin_delete', sender: adminUsername, recipient: author, createdAt: serverTimestamp() });
        await logAdminAction('delete_post', author, 'Gönderi silindi: ' + postId);
        document.getElementById('post-' + postId)?.remove();
        showAdminToast("Gönderi silindi.", "success");
    } catch (e) {
        showAdminToast("Gönderi silinemedi.", "error");
    }
};

// =====================================
// 12. KİŞİ ARŞİVİ (LOGLAR)
// =====================================
function loadActivityStream() {
    const qPosts = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(300));
    onSnapshot(qPosts, (snapshot) => {
        recentPostsLog = [];
        snapshot.forEach(docSnap => { recentPostsLog.push({ id: docSnap.id, _actType: 'post', ...docSnap.data() }); });
    });

    const qNotifs = query(collection(db, "notifications"), orderBy("createdAt", "desc"), limit(400));
    onSnapshot(qNotifs, (snapshot) => {
        recentNotifsLog = [];
        snapshot.forEach(docSnap => { recentNotifsLog.push({ id: docSnap.id, _actType: 'notif', ...docSnap.data() }); });
        // Dashboard son aktiviteler
        renderRecentActivities();
    });
}

function renderRecentActivities() {
    const container = document.getElementById('recent-activities');
    if (!container) return;
    const logs = [...recentPostsLog, ...recentNotifsLog]
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
        .slice(0, 8);
    if (logs.length === 0) { container.innerHTML = '<div class="empty-state"><span class="empty-icon">📭</span><p>Aktivite yok.</p></div>'; return; }
    container.innerHTML = logs.map(l => createLogHtml(l)).filter(Boolean).join('');
}

function setupArchiveSearch() {
    const input = document.getElementById('archive-search');
    if (!input) return;

    input.addEventListener('input', () => {
        let text = input.value.toLowerCase().trim();
        const autoEl = document.getElementById('archive-autocomplete');
        if (!text) {
            if (autoEl) autoEl.innerHTML = '';
            const content = document.getElementById('archive-content');
            if (content) content.innerHTML = '<div class="empty-state"><span class="empty-icon">🕵️</span><p>Arşivini incelemek istediğiniz kişiyi arayın.</p></div>';
            return;
        }
        if (text.startsWith('@')) text = text.substring(1);
        const filtered = allUsers.filter(u => u.id.toLowerCase().includes(text)).slice(0, 8);
        if (filtered.length === 0 || !autoEl) { if (autoEl) autoEl.innerHTML = ''; return; }

        let html = '<div style="position:absolute;top:0;left:20px;right:20px;background:#1e293b;border:1px solid #334155;border-radius:8px;max-height:200px;overflow-y:auto;z-index:10;box-shadow:0 4px 16px rgba(0,0,0,.4)">';
        filtered.forEach(u => {
            html += `<div style="padding:10px 14px;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:13px;transition:.15s;color:#e2e8f0" 
                onmouseenter="this.style.background='#334155'" onmouseleave="this.style.background=''" 
                onclick="selectArchiveUser('${escHtml(u.id)}')">👤 @${escHtml(u.id)}</div>`;
        });
        html += '</div>';
        autoEl.innerHTML = html;
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target)) {
            const autoEl = document.getElementById('archive-autocomplete');
            if (autoEl) autoEl.innerHTML = '';
        }
    });
}

window.selectArchiveUser = function(username) {
    const input = document.getElementById('archive-search');
    if (input) input.value = '@' + username;
    const autoEl = document.getElementById('archive-autocomplete');
    if (autoEl) autoEl.innerHTML = '';
    renderArchiveFolders(username);
};

function renderArchiveFolders(username) {
    const container = document.getElementById('archive-content');
    if (!container) return;

    const combined = [...recentPostsLog, ...recentNotifsLog];
    const filtered = combined.filter(log => {
        const u1 = (log.author || '').toLowerCase();
        const u2 = (log.sender || '').toLowerCase();
        const u3 = (log.recipient || '').toLowerCase();
        return u1 === username.toLowerCase() || u2 === username.toLowerCase() || u3 === username.toLowerCase();
    });
    filtered.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state"><span class="empty-icon">📭</span><p>@${escHtml(username)} için kayıt bulunamadı.</p></div>`;
        return;
    }

    const catPosts = filtered.filter(l => l._actType === 'post');
    const catLikes = filtered.filter(l => l._actType === 'notif' && l.type === 'like');
    const catComments = filtered.filter(l => l._actType === 'notif' && l.type === 'comment');
    const catFollows = filtered.filter(l => l._actType === 'notif' && l.type === 'follow');

    let html = `<div style="padding:16px 20px;font-size:14px;color:#94a3b8;border-bottom:1px solid #334155">
        <b style="color:#f1f5f9">@${escHtml(username)}</b> arşiv dosyaları (${filtered.length} kayıt)
    </div>`;

    function buildFolder(title, icon, color, items) {
        if (items.length === 0) return '';
        let h = `<details class="archive-folder"><summary>${icon} ${title} <span style="font-size:12px;color:#64748b;margin-left:auto">(${items.length})</span></summary><div class="folder-body">`;
        items.forEach(l => { const logH = createLogHtml(l); if (logH) h += logH; });
        h += '</div></details>';
        return h;
    }

    html += buildFolder('Paylaşılan Gönderiler', '📝', '#3b82f6', catPosts);
    html += buildFolder('Beğeni Hareketleri', '❤️', '#ef4444', catLikes);
    html += buildFolder('Yorum Hareketleri', '💬', '#22c55e', catComments);
    html += buildFolder('Takip Hareketleri', '🤝', '#8b5cf6', catFollows);

    container.innerHTML = html;
}

function createLogHtml(log) {
    let timeStr = log.createdAt ? log.createdAt.toDate().toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Az önce';
    if (log._actType === 'post') {
        let preview = log.content ? (log.content.length > 60 ? log.content.substring(0, 60) + '...' : log.content) : '(Fotoğraf)';
        return `<div class="log-item"><div class="log-icon blue">📝</div><div class="log-text"><b>@${escHtml(log.author || '')}</b> gönderi paylaştı: <i>"${escHtml(preview)}"</i><span class="log-time">${timeStr}</span></div></div>`;
    } else {
        if (log.type === 'admin_delete' || log.sender === log.recipient) return '';
        let icon = '🔔', text = '', cls = '';
        if (log.type === 'like') { icon = '❤️'; text = 'gönderisini beğendi.'; cls = 'red'; }
        else if (log.type === 'comment') { icon = '💬'; text = 'gönderisine yorum yaptı.'; cls = 'green'; }
        else if (log.type === 'follow') { icon = '🤝'; text = 'takip etmeye başladı.'; cls = 'purple'; }
        else return '';
        return `<div class="log-item"><div class="log-icon ${cls}">${icon}</div><div class="log-text"><b>@${escHtml(log.sender || '')}</b>, <b>@${escHtml(log.recipient || '')}</b> ${text}<span class="log-time">${timeStr}</span></div></div>`;
    }
}

// =====================================
// 13. DESTEK TALEPLERİ
// =====================================
function loadTickets() {
    onSnapshot(query(collection(db, "tickets"), orderBy("createdAt", "desc")), (snapshot) => {
        allTickets = [];
        snapshot.forEach(docSnap => { allTickets.push({ id: docSnap.id, ...docSnap.data() }); });
        updateDashboardFromTickets();
        renderTickets();
    });
}

function renderTickets() {
    const container = document.getElementById('tickets-container');
    if (!container) return;

    let display = allTickets;
    if (currentTicketFilter !== 'all') {
        display = allTickets.filter(t => {
            const status = t.status || 'Yeni';
            return status === currentTicketFilter;
        });
    }

    if (display.length === 0) {
        container.innerHTML = '<div class="empty-state"><span class="empty-icon">🎉</span><p>' + (currentTicketFilter === 'all' ? 'Bekleyen destek talebi yok.' : 'Bu filtreye uygun talep yok.') + '</p></div>';
        return;
    }

    container.innerHTML = display.map(ticket => {
        const dateStr = ticket.createdAt ? ticket.createdAt.toDate().toLocaleString('tr-TR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'Az önce';
        const status = ticket.status || 'Yeni';
        const statusClass = status === 'Çözüldü' ? 'badge-green' : status === 'İnceleniyor' ? 'badge-yellow' : 'badge-blue';
        const cleanMsg = DOMPurify.sanitize(ticket.message || '');

        let replyHtml = '';
        if (ticket.adminReply) {
            const replyDate = ticket.repliedAt ? ticket.repliedAt.toDate().toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
            replyHtml = `<div style="background:#0f172a;padding:10px 12px;border-radius:6px;margin-top:10px;border-left:3px solid #6366f1">
                <div style="font-size:11px;color:#6366f1;margin-bottom:4px">Yönetici yanıtı ${ticket.repliedBy ? '(@' + escHtml(ticket.repliedBy) + ')' : ''} · ${replyDate}</div>
                <div style="font-size:13px;color:#cbd5e1">${DOMPurify.sanitize(ticket.adminReply)}</div>
            </div>`;
        }

        return `<div class="ticket-card" id="ticket-${escHtml(ticket.id)}">
            <div class="ticket-top">
                <div><span class="ticket-sender">@${escHtml(ticket.sender || 'Bilinmeyen')}</span></div>
                <div style="display:flex;align-items:center;gap:8px"><span class="ticket-status ${statusClass}">${status}</span><span class="ticket-date">${dateStr}</span></div>
            </div>
            <div class="ticket-msg">"${cleanMsg}"</div>
            ${replyHtml}
            <div class="ticket-actions">
                <button class="btn-primary" style="padding:5px 12px;font-size:12px" onclick="openTicketReply('${escHtml(ticket.id)}')">💬 Yanıtla</button>
                <button class="btn-secondary" style="padding:5px 12px;font-size:12px" onclick="updateTicketStatus('${escHtml(ticket.id)}','İnceleniyor')">🔄 İncele</button>
                <button style="padding:5px 12px;font-size:12px;background:#16a34a;color:#fff;border-radius:6px" onclick="updateTicketStatus('${escHtml(ticket.id)}','Çözüldü')">✅ Çözüldü</button>
                <button style="padding:5px 12px;font-size:12px;background:#dc2626;color:#fff;border-radius:6px" onclick="deleteTicket('${escHtml(ticket.id)}')">🗑️ Sil</button>
            </div>
        </div>`;
    }).join('');
}

window.openTicketReply = function(ticketId) {
    const ticket = allTickets.find(t => t.id === ticketId);
    if (!ticket) return;
    document.getElementById('reply-ticket-id').value = ticketId;
    document.getElementById('reply-ticket-sender').textContent = '@' + (ticket.sender || 'Bilinmeyen');
    document.getElementById('reply-ticket-message').textContent = ticket.message || '';
    document.getElementById('reply-text').value = '';
    openModal('modal-ticket-reply');
};

window.sendTicketReply = async function() {
    const ticketId = document.getElementById('reply-ticket-id').value;
    const replyText = document.getElementById('reply-text').value.trim();
    const newStatus = document.getElementById('reply-status').value;
    if (!ticketId || !replyText) { showAdminToast("Yanıt alanı boş bırakılamaz.", "error"); return; }
    if (replyText.length > 2000) { showAdminToast("Yanıt 2000 karakteri aşamaz.", "error"); return; }

    const btn = document.getElementById('send-reply-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Gönderiliyor...'; }

    try {
        const ticket = allTickets.find(t => t.id === ticketId);
        await updateDoc(doc(db, "tickets", ticketId), {
            adminReply: replyText,
            repliedAt: serverTimestamp(),
            repliedBy: adminUsername,
            status: newStatus
        });
        // Kullanıcıya bildirim gönder
        if (ticket && ticket.sender) {
            await addDoc(collection(db, "notifications"), {
                type: 'support_reply',
                sender: adminUsername,
                recipient: ticket.sender,
                text: replyText,
                ticketId: ticketId,
                createdAt: serverTimestamp()
            });
        }
        await logAdminAction('reply_ticket', ticket?.sender || ticketId, 'Destek talebine yanıt verildi');
        showAdminToast("Yanıt gönderildi.", "success");
        closeModal('modal-ticket-reply');
    } catch (e) {
        showAdminToast("Yanıt gönderilemedi.", "error");
    }
    if (btn) { btn.disabled = false; btn.textContent = '📤 Yanıt Gönder'; }
};

window.updateTicketStatus = async function(ticketId, status) {
    try {
        await updateDoc(doc(db, "tickets", ticketId), { status });
        await logAdminAction('update_ticket', ticketId, 'Durum: ' + status);
        showAdminToast("Talep durumu güncellendi.", "success");
    } catch (e) {
        showAdminToast("Güncelleme başarısız.", "error");
    }
};

window.deleteTicket = async function(ticketId) {
    if (!confirm("Bu destek talebini silmek istiyor musunuz?")) return;
    try {
        await deleteDoc(doc(db, "tickets", ticketId));
        await logAdminAction('delete_ticket', ticketId, 'Destek talebi silindi');
        showAdminToast("Talep silindi.", "success");
    } catch (e) {
        showAdminToast("Silme başarısız.", "error");
    }
};

// =====================================
// 14. ADMİN İŞLEM LOGLARI
// =====================================
async function logAdminAction(action, target, details) {
    try {
        await addDoc(collection(db, "admin_logs"), {
            action,
            admin: adminUsername,
            target,
            details,
            createdAt: serverTimestamp()
        });
    } catch (e) {
        console.error("Admin log kaydedilemedi:", e);
    }
}

function loadAdminLogs() {
    const q = query(collection(db, "admin_logs"), orderBy("createdAt", "desc"), limit(500));
    onSnapshot(q, (snapshot) => {
        allAdminLogs = [];
        snapshot.forEach(docSnap => { allAdminLogs.push({ id: docSnap.id, ...docSnap.data() }); });
        applyLogsFilter();
        renderRecentAdminLogs(allAdminLogs.slice(0, 8));
    }, (error) => {
        console.error("Admin logları yüklenirken hata:", error);
    });
}

function applyLogsFilter() {
    const typeFilter = document.getElementById('log-type-filter')?.value || 'all';
    const searchText = (document.getElementById('log-search')?.value || '').toLowerCase().trim();

    filteredAdminLogs = allAdminLogs.filter(log => {
        if (typeFilter !== 'all' && log.action !== typeFilter) return false;
        
        if (searchText) {
            const adminMatch = (log.admin || '').toLowerCase().includes(searchText);
            const targetMatch = (log.target || '').toLowerCase().includes(searchText);
            const detailsMatch = (log.details || '').toLowerCase().includes(searchText);
            if (!adminMatch && !targetMatch && !detailsMatch) return false;
        }
        return true;
    });

    renderAdminLogs();
}

function renderAdminLogs() {
    const container = document.getElementById('admin-logs-container');
    if (!container) return;
    
    if (filteredAdminLogs.length === 0) {
        container.innerHTML = '<div class="empty-state"><span class="empty-icon">📋</span><p>Henüz admin işlemi yok veya kritere uygun sonuç bulunamadı.</p></div>';
        document.getElementById('logs-pagination').innerHTML = '';
        return;
    }

    const totalPages = Math.ceil(filteredAdminLogs.length / LOG_PAGE_SIZE);
    if (currentLogPage > totalPages) currentLogPage = totalPages;
    const start = (currentLogPage - 1) * LOG_PAGE_SIZE;
    const pageLogs = filteredAdminLogs.slice(start, start + LOG_PAGE_SIZE);

    const actionIcons = {
        verify: '✅', ban: '🔒', delete_user: '🗑️', edit_user: '✏️',
        delete_post: '🚨', reply_ticket: '💬', update_ticket: '🔄', delete_ticket: '🗑️'
    };

    container.innerHTML = pageLogs.map(log => {
        const timeStr = log.createdAt ? log.createdAt.toDate().toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Az önce';
        const icon = actionIcons[log.action] || '📋';
        return `<div class="log-item">
            <div class="log-icon yellow">${icon}</div>
            <div class="log-text">
                <b>@${escHtml(log.admin || '')}</b> → <b>@${escHtml(log.target || '')}</b>: ${escHtml(log.details || '')}
                <span class="log-time">${timeStr}</span>
            </div>
        </div>`;
    }).join('');

    renderLogsPagination(totalPages);
}

function renderLogsPagination(totalPages) {
    const pagEl = document.getElementById('logs-pagination');
    if (!pagEl || totalPages <= 1) { if (pagEl) pagEl.innerHTML = ''; return; }

    let html = `<button class="page-btn" onclick="goToLogPage(${currentLogPage - 1})" ${currentLogPage === 1 ? 'disabled' : ''}>‹</button>`;
    for (let i = 1; i <= totalPages; i++) {
        if (i <= 3 || i > totalPages - 2 || Math.abs(i - currentLogPage) <= 1) {
            html += `<button class="page-btn ${i === currentLogPage ? 'active' : ''}" onclick="goToLogPage(${i})">${i}</button>`;
        } else if (i === 4 && currentLogPage > 5) {
            html += '<span class="page-info">…</span>';
        } else if (i === totalPages - 2 && currentLogPage < totalPages - 4) {
            html += '<span class="page-info">…</span>';
        }
    }
    html += `<button class="page-btn" onclick="goToLogPage(${currentLogPage + 1})" ${currentLogPage === totalPages ? 'disabled' : ''}>›</button>`;
    html += `<span class="page-info">${filteredAdminLogs.length} sonuç</span>`;
    pagEl.innerHTML = html;
}

window.goToLogPage = function(p) {
    const totalPages = Math.ceil(filteredAdminLogs.length / LOG_PAGE_SIZE);
    if (p < 1 || p > totalPages) return;
    currentLogPage = p;
    renderAdminLogs();
};

function renderRecentAdminLogs(logs) {
    const container = document.getElementById('recent-admin-logs');
    if (!container) return;
    if (logs.length === 0) {
        container.innerHTML = '<div class="empty-state"><span class="empty-icon">📋</span><p>Henüz işlem yok.</p></div>';
        return;
    }
    container.innerHTML = logs.map(log => {
        const timeStr = log.createdAt ? log.createdAt.toDate().toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Az önce';
        return `<div class="log-item"><div class="log-icon yellow">📋</div><div class="log-text"><b>@${escHtml(log.admin || '')}</b> → ${escHtml(log.details || '')}<span class="log-time">${timeStr}</span></div></div>`;
    }).join('');
}

// =====================================
// 15. MODAL YÖNETİMİ
// =====================================
function setupModals() {
    document.getElementById('save-edit-btn')?.addEventListener('click', saveEditUser);
    document.getElementById('confirm-delete-btn')?.addEventListener('click', executeDeleteUser);
    document.getElementById('send-reply-btn')?.addEventListener('click', sendTicketReply);

    // Overlay tıklamasıyla kapatma
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal.id);
        });
    });
}

window.openModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('show');
};

window.closeModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('show');
};

// =====================================
// 16. TOAST BİLDİRİM
// =====================================
function showAdminToast(msg, type) {
    const existing = document.querySelector('.admin-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'admin-toast ' + (type || 'info');
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

// =====================================
// 17. YARDIMCI FONKSİYONLAR
// =====================================
function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}