const fs = require('fs');

['feed.js', 'search.js', 'profile.js'].forEach(file => {
    try {
        let code = fs.readFileSync(file, 'utf8');

        code = code.replace(
            /document\.getElementById\('post-detail-container'\)\.innerHTML = '';/g,
            "const cont = document.getElementById('post-detail-container'); if(cont){ cont.querySelectorAll('video').forEach(v => v.pause()); cont.innerHTML = ''; }"
        );

        fs.writeFileSync(file, code, 'utf8');
        console.log(`Updated closePostDetail in ${file}`);
    } catch (err) {
        console.error(err);
    }
});
