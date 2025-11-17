// Background service worker for Video Download Manager with Multi-threading support

// Import the download manager
importScripts('download-manager.js');

// Create download manager instance
const downloadManager = new DownloadManager();

// Install event
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('Video Download Manager installed successfully!');

        // Create context menu
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
    } else if (details.reason === 'update') {
        console.log('Video Download Manager updated to version ' + chrome.runtime.getManifest().version);
    }
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Start downloads (multi-threaded)
    if (request.type === 'start-downloads') {
        const videos = request.videos || [];

        (async () => {
            try {
                const downloadIds = [];

                for (const video of videos) {
                    const downloadId = await downloadManager.startDownload({
                        url: video.url,
                        filename: video.filename
                    });
                    downloadIds.push(downloadId);
                }

                sendResponse({ success: true, downloadIds: downloadIds });
            } catch (error) {
                console.error('Download error:', error);
                sendResponse({ success: false, error: error.message });
            }
        })();

        return true; // Keep message channel open for async response
    }

    // Get all downloads
    if (request.type === 'get-all-downloads') {
        const downloads = downloadManager.getAllDownloads();
        sendResponse({ success: true, downloads: downloads });
        return false;
    }

    // Pause download
    if (request.type === 'pause-download') {
        downloadManager.pauseDownload(request.downloadId);
        sendResponse({ success: true });
        return false;
    }

    // Resume download
    if (request.type === 'resume-download') {
        downloadManager.resumeDownload(request.downloadId);
        sendResponse({ success: true });
        return false;
    }

    // Cancel download
    if (request.type === 'cancel-download') {
        downloadManager.cancelDownload(request.downloadId);
        sendResponse({ success: true });
        return false;
    }

    // Clear completed downloads
    if (request.type === 'clear-completed-downloads') {
        const allDownloads = downloadManager.getAllDownloads();
        allDownloads.forEach(download => {
            if (download.status === 'completed') {
                downloadManager.cancelDownload(download.id);
            }
        });
        sendResponse({ success: true });
        return false;
    }

    // Legacy support for old download method
    if (request.action === 'downloadVideo') {
        (async () => {
            try {
                const downloadId = await downloadManager.startDownload({
                    url: request.url,
                    filename: request.filename || request.url.split('/').pop()
                });
                sendResponse({ success: true, downloadId: downloadId });
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }
});

// Context menu handler
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'downloadVideo' && info.linkUrl) {
        const filename = info.linkUrl.split('/').pop().split('?')[0];

        downloadManager.startDownload({
            url: info.linkUrl,
            filename: filename
        }).then(() => {
            console.log('Download started from context menu');

            // Open downloads page
            chrome.tabs.create({ url: chrome.runtime.getURL('downloads.html') });
        }).catch(error => {
            console.error('Download failed:', error);
        });
    }
});

// Listen for Chrome download events (for fallback downloads)
chrome.downloads.onChanged.addListener((delta) => {
    if (delta.state) {
        if (delta.state.current === 'complete') {
            console.log('Chrome download completed:', delta.id);
        } else if (delta.state.current === 'interrupted') {
            console.log('Chrome download interrupted:', delta.id);
        }
    }

    if (delta.error) {
        console.error('Chrome download error:', delta.error.current);
    }
});
