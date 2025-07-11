// Background script for the bookmark sharing extension
// This handles any background tasks and extension lifecycle events

chrome.runtime.onInstalled.addListener(() => {
  console.log('Bookmark Sharer extension installed');
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  // This will open the popup - no additional handling needed
  // as the popup is defined in manifest.json
});

// Optional: Handle keyboard shortcuts if you want to add them later
chrome.commands?.onCommand?.addListener((command) => {
  if (command === 'export-bookmarks') {
    // Open popup or perform quick export
    chrome.action.openPopup();
  }
});

// Handle download completion (optional - for better UX)
chrome.downloads?.onChanged?.addListener((delta) => {
  if (delta.state && delta.state.current === 'complete') {
    // Could show a notification here if needed
    console.log('Download completed');
  }
});