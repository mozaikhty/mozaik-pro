const fs = require('fs');
const html = fs.readFileSync('feed.html', 'utf8');

// Find the start of app-container
const appIdx = html.indexOf('<div class="app-container">');

// We want to KEEP the modals.
// Let's extract the modals from the old HTML.
const storyDetailsModal = html.match(/<div class="modal-overlay" id="story-details-modal"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
const storyShareModal = html.match(/<div class="modal-overlay" id="story-share-modal"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
const addStoryModal = html.match(/<div class="modal-overlay" id="add-story-modal"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
const mainPostModal = html.match(/<div id="main-post-modal" class="modal-overlay"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
const postDetailModal = html.match(/<div class="modal-overlay" id="post-detail-modal"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
const shareDmModal = html.match(/<div class="modal-overlay" id="share-dm-modal"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
const usersListModal = html.match(/<div class="modal-overlay" id="users-list-modal"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
const editPostModal = html.match(/<div class="modal-overlay" id="edit-post-modal"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
const supportModal = html.match(/<div class="modal-overlay" id="support-modal"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);

console.log({
    storyDetails: !!storyDetailsModal,
    storyShare: !!storyShareModal,
    addStory: !!addStoryModal,
    mainPost: !!mainPostModal,
    postDetail: !!postDetailModal,
    shareDm: !!shareDmModal,
    usersList: !!usersListModal,
    editPost: !!editPostModal,
    support: !!supportModal
});
