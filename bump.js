const fs = require('fs');
['feed.html', 'search.html', 'chat.html', 'notifications.html', 'profile.html'].forEach(file => {
    if(!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/ui\.js\?v=\d+/g, 'ui.js?v=18');
    content = content.replace(/style\.css\?v=\d+/g, 'style.css?v=18');
    // Also handle ones without v parameter
    content = content.replace(/"ui\.js"/g, '"ui.js?v=18"');
    content = content.replace(/"style\.css"/g, '"style.css?v=18"');
    fs.writeFileSync(file, content, 'utf8');
});
console.log('Bumped cache to v=18');
