const fs = require('fs');
let html = fs.readFileSync('feed.html', 'utf8');

// I will move ALL modals outside of app-container, right before new-mozaik-ui.
// Or actually, if I just remove `display: none !important;` from `.app-container` and instead add `display: none !important;` to `.mozaik-layout`!
// The modals are direct children of `.app-container` or siblings?
// Let's check feed.html.
