const fs = require('fs');
let js = fs.readFileSync('admin.js', 'utf8');

// Add uploadBytes and getDownloadURL to imports
if (!js.includes('uploadBytes')) {
    js = js.replace('import { ref, deleteObject }', 'import { ref, deleteObject, uploadBytes, getDownloadURL }');
}

const dailyTaskCode = `
// =====================================
// GÜNLÜK GÖREV YÖNETİMİ
// =====================================
let dailyTasksUnsubscribe = null;

function initDailyTasks() {
    if (dailyTasksUnsubscribe) return;
    
    const form = document.getElementById('daily-task-form');
    if(form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const btn = document.getElementById('dt-submit-btn');
            btn.innerText = "Kaydediliyor...";
            btn.disabled = true;
            
            try {
                const title = document.getElementById('dt-title').value;
                const desc = document.getElementById('dt-desc').value;
                const date = document.getElementById('dt-date').value;
                const active = document.getElementById('dt-active').checked;
                const fileInput = document.getElementById('dt-image');
                
                let imageUrl = null;
                
                if (fileInput.files.length > 0) {
                    const file = fileInput.files[0];
                    const fileName = \`daily_tasks/\${Date.now()}_\${file.name}\`;
                    const storageRef = ref(storage, fileName);
                    
                    // Compress image before upload using existing compressImage if available
                    // For admin, we can just upload directly for simplicity or use compressImage
                    await uploadBytes(storageRef, file);
                    imageUrl = await getDownloadURL(storageRef);
                }
                
                const taskData = {
                    title,
                    description: desc,
                    date,
                    active,
                    imageUrl,
                    createdAt: serverTimestamp(),
                    participants: []
                };
                
                await addDoc(collection(db, "dailyTasks"), taskData);
                
                form.reset();
                document.getElementById('dt-date').value = new Date().toISOString().split('T')[0];
                alert('Günlük görev başarıyla oluşturuldu.');
                
            } catch(e) {
                console.error('Error creating daily task:', e);
                alert('Görev oluşturulurken hata: ' + e.message);
            } finally {
                btn.innerText = "Görevi Kaydet";
                btn.disabled = false;
            }
        };
    }
    
    // Set default date
    const dateInput = document.getElementById('dt-date');
    if(dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }
    
    // Load list
    const tbody = document.getElementById('daily-tasks-tbody');
    const q = query(collection(db, "dailyTasks"), orderBy("date", "desc"), limit(20));
    dailyTasksUnsubscribe = onSnapshot(q, (snapshot) => {
        let html = '';
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#64748b;">Henüz görev oluşturulmamış.</td></tr>';
            return;
        }
        
        snapshot.forEach(docSnap => {
            const t = docSnap.data();
            const id = docSnap.id;
            const pCount = t.participants ? t.participants.length : 0;
            const statusBadge = t.active ? '<span class="badge-sm status-active">Aktif</span>' : '<span class="badge-sm status-banned">Pasif</span>';
            
            html += \`
                <tr>
                    <td>\${t.date}</td>
                    <td style="font-weight:600;">\${t.title}</td>
                    <td>\${statusBadge}</td>
                    <td>\${pCount} kişi</td>
                    <td>
                        <button onclick="window.toggleDailyTask('\${id}', \${!t.active})" style="background:\${t.active ? '#ef4444' : '#22c55e'}; color:#fff; border:none; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer;">
                            \${t.active ? 'Pasif Yap' : 'Aktif Yap'}
                        </button>
                        <button onclick="window.deleteDailyTask('\${id}')" style="background:transparent; color:#ef4444; border:1px solid #ef4444; padding:3px 7px; border-radius:4px; font-size:11px; margin-left:4px; cursor:pointer;">Sil</button>
                    </td>
                </tr>
            \`;
        });
        
        tbody.innerHTML = html;
    });
}

window.toggleDailyTask = async function(id, newState) {
    try {
        await updateDoc(doc(db, "dailyTasks", id), { active: newState });
    } catch(e) { alert('Hata: ' + e.message); }
};

window.deleteDailyTask = async function(id) {
    if(!confirm("Bu görevi silmek istediğinize emin misiniz? (Katılan gönderiler silinmez, sadece görev silinir)")) return;
    try {
        await deleteDoc(doc(db, "dailyTasks", id));
    } catch(e) { alert('Hata: ' + e.message); }
};
`;

if (!js.includes('initDailyTasks')) {
    js += '\n' + dailyTaskCode;
    
    // Also inject into switchPage
    const regex = /if\(pageId === 'users'\) loadUsers\(\);/;
    const replaceWith = "if(pageId === 'users') loadUsers();\n    if(pageId === 'dailyTasks') initDailyTasks();";
    if (js.match(regex)) {
        js = js.replace(regex, replaceWith);
    }
    
    fs.writeFileSync('admin.js', js, 'utf8');
    console.log('Updated admin.js');
}
