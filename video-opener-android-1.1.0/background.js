/**
 * Video Opener for Android – Background Script
 * Minimal service worker – handles browser_action tap (future: settings page)
 */
browser.browserAction.onClicked.addListener((tab) => {
  // Inject content script manually in case it didn't auto-run
  browser.tabs.executeScript(tab.id, { file: "content.js" }).catch(() => {});
  browser.tabs.insertCSS(tab.id, { file: "content.css" }).catch(() => {});
});
