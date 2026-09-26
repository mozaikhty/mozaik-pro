const fs = require('fs');
const html = fs.readFileSync('feed.html', 'utf8');

let newUiStart = html.indexOf('<div id="new-mozaik-ui"');
let depth = 1;
let currentIdx = html.indexOf('>', newUiStart) + 1;
let endIdx = -1;

while(depth > 0 && currentIdx < html.length) {
    let nextDiv = html.indexOf('<div', currentIdx);
    let nextClose = html.indexOf('</div>', currentIdx);
    
    if (nextClose === -1) break;
    
    if (nextDiv !== -1 && nextDiv < nextClose) {
        depth++;
        currentIdx = nextDiv + 4;
    } else {
        depth--;
        currentIdx = nextClose + 6;
        endIdx = currentIdx;
    }
}

if (endIdx !== -1) {
    const newUiHtml = html.substring(newUiStart, endIdx);
    fs.writeFileSync('extracted_new_ui.html', newUiHtml, 'utf8');
    console.log('Extracted new UI');
} else {
    console.log('Failed to extract new UI');
}
