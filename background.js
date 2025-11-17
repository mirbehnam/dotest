// Background service worker for Video Download Manager

// Install event
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('Video Download Manager installed successfully!');
    } else if (details.reason === 'update') {
        console.log('Video Download Manager updated to version ' + chrome.runtime.getManifest().version);
    }
});

// Listen for download events
chrome.downloads.onChanged.addListener((delta) => {
    if (delta.state) {
        if (delta.state.current === 'complete') {
            console.log('Download completed:', delta.id);
        } else if (delta.state.current === 'interrupted') {
            console.log('Download interrupted:', delta.id);
        }
    }

    if (delta.error) {
        console.error('Download error:', delta.error.current);
    }
});

// Handle messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'downloadVideo') {
        chrome.downloads.download({
            url: request.url,
            filename: request.filename || undefined,
            saveAs: false
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ success: true, downloadId: downloadId });
            }
        });
        return true; // Keep the message channel open for async response
    }

    if (request.action === 'batchDownload') {
        const downloads = request.downloads || [];
        const results = [];

        // Download files sequentially
        (async () => {
            for (const download of downloads) {
                try {
                    const downloadId = await new Promise((resolve, reject) => {
                        chrome.downloads.download({
                            url: download.url,
                            filename: download.filename || undefined,
                            saveAs: false
                        }, (id) => {
                            if (chrome.runtime.lastError) {
                                reject(chrome.runtime.lastError);
                            } else {
                                resolve(id);
                            }
                        });
                    });

                    results.push({ success: true, downloadId: downloadId, url: download.url });

                    // Add a small delay between downloads
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (error) {
                    results.push({ success: false, error: error.message, url: download.url });
                }
            }

            sendResponse({ success: true, results: results });
        })();

        return true; // Keep the message channel open for async response
    }
});

// Context menu for right-click download (optional enhancement)
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'downloadVideo',
        title: 'دانلود با Video Download Manager',
        contexts: ['link'],
        targetUrlPatterns: [
            '*://*/*.mkv*',
            '*://*/*.mp4*',
            '*://*/*.avi*',
            '*://*/*.mov*',
            '*://*/*.wmv*',
            '*://*/*.flv*',
            '*://*/*.webm*',
            '*://*/*.m4v*'
        ]
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'downloadVideo' && info.linkUrl) {
        const filename = info.linkUrl.split('/').pop().split('?')[0];

        chrome.downloads.download({
            url: info.linkUrl,
            filename: filename || undefined,
            saveAs: true
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                console.error('Download failed:', chrome.runtime.lastError);
            } else {
                console.log('Download started:', downloadId);
            }
        });
    }
});
