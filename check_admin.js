const fs = require('fs');
if(fs.existsSync('admin.html')) {
    const html = fs.readFileSync('admin.html', 'utf8');
    const sections = html.match(/<section id="[^"]+"/g) || [];
    console.log('Sections: ' + sections.join(', '));
}
