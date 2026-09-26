const fs = require('fs');
let html = fs.readFileSync('feed.html', 'utf8');

// Delete <div id="sidebar-container"></div>
html = html.replace('<div id="sidebar-container"></div>', '');

// Delete <main class="feed-main"> ... </main>
const mainStart = html.indexOf('<main class="feed-main">');
const mainEnd = html.indexOf('</main>', mainStart) + 7;
if (mainStart !== -1 && mainEnd !== -1) {
    html = html.substring(0, mainStart) + html.substring(mainEnd);
}

// Delete <div class="search-box-right"> ... </div>
const searchStart = html.indexOf('<div class="search-box-right">');
const searchEndStr = '</div> <!-- /search-box-right -->'; // Assuming there's a comment or we just match the div
const searchEndIdx = html.indexOf('</div>', html.indexOf('</div>', html.indexOf('</div>', searchStart)+1)+1); 
// Better yet, use a regex to replace search-box-right to its end
html = html.replace(/<div class="search-box-right">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/, '');

// Actually, DOMParser is much safer! Since we have Node.js, we can use JSDOM, but we might not have it.
