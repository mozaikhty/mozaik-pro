const fs = require('fs');
const html = fs.readFileSync('feed.html', 'utf8');

function extractModals(html) {
    const modals = [];
    let startIdx = 0;
    while (true) {
        let match = html.indexOf('class="modal-overlay"', startIdx);
        let match2 = html.indexOf('class="modal-overlay ', startIdx);
        let match3 = html.indexOf(' class="modal-overlay"', startIdx);
        let match4 = html.indexOf('"modal-overlay"'); // generic
        
        let found = [];
        if (match !== -1) found.push(match);
        if (match2 !== -1) found.push(match2);
        if (match3 !== -1) found.push(match3);
        
        if (found.length === 0) break;
        let bestMatch = Math.min(...found);
        
        let divStart = html.lastIndexOf('<div', bestMatch);
        
        let depth = 1;
        let currentIdx = bestMatch + 15;
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
            const modalHtml = html.substring(divStart, endIdx);
            if (!modals.includes(modalHtml)) { // prevent duplicates if loops intersect
                modals.push(modalHtml);
            }
            startIdx = endIdx;
        } else {
            break;
        }
    }
    return modals;
}

const modals = extractModals(html);
console.log('Extracted', modals.length, 'modals');
fs.writeFileSync('extracted_modals.html', modals.join('\n\n'), 'utf8');
