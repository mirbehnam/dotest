// Downloads page script

let downloads = new Map();

// DOM Elements
const downloadsContainer = document.getElementById('downloadsContainer');
const emptyState = document.getElementById('emptyState');
const clearCompletedBtn = document.getElementById('clearCompletedBtn');

// Event Listeners
clearCompletedBtn.addEventListener('click', clearCompleted);

// Listen for download progress updates
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'download-progress') {
        updateDownload(message.download);
    }
});

// Initialize - load current downloads
chrome.runtime.sendMessage({ type: 'get-all-downloads' }, (response) => {
    if (response && response.downloads) {
        response.downloads.forEach(download => {
            downloads.set(download.id, download);
        });
        renderDownloads();
    }
});

function updateDownload(download) {
    downloads.set(download.id, download);
    renderDownloads();
}

function renderDownloads() {
    if (downloads.size === 0) {
        emptyState.style.display = 'block';
        downloadsContainer.querySelectorAll('.download-item').forEach(item => item.remove());
        return;
    }

    emptyState.style.display = 'none';

    // Sort downloads by start time (newest first)
    const sortedDownloads = Array.from(downloads.values())
        .sort((a, b) => b.startTime - a.startTime);

    sortedDownloads.forEach(download => {
        let item = document.getElementById(`download-${download.id}`);

        if (!item) {
            item = createDownloadItem(download);
            downloadsContainer.insertBefore(item, emptyState);
        } else {
            updateDownloadItem(item, download);
        }
    });
}

function createDownloadItem(download) {
    const item = document.createElement('div');
    item.className = `download-item ${download.status}`;
    item.id = `download-${download.id}`;

    item.innerHTML = `
        <div class="download-header">
            <div class="download-info">
                <div class="download-filename">${escapeHtml(download.filename)}</div>
                <div class="download-meta">
                    <span class="status-badge status-${download.status}">
                        ${getStatusText(download.status)}
                    </span>
                    ${download.totalSize > 0 ? `<span>حجم: ${formatBytes(download.totalSize)}</span>` : ''}
                    ${download.speed > 0 ? `<span>سرعت: ${formatSpeed(download.speed)}</span>` : ''}
                </div>
            </div>
            <div class="download-controls" data-download-id="${download.id}">
                ${getControlButtons(download)}
            </div>
        </div>

        <div class="progress-section">
            <div class="progress-bar-container">
                <div class="progress-bar ${download.status}" style="width: ${download.progress}%"></div>
            </div>
            <div class="progress-details">
                <span class="progress-text">${Math.round(download.progress)}%</span>
                <span>${formatBytes(download.downloadedSize)} / ${formatBytes(download.totalSize)}</span>
            </div>
        </div>

        ${download.chunks && download.chunks.length > 0 ? `
            <div class="chunks-info">
                ${download.chunks.map(chunk => `
                    <div class="chunk-indicator ${chunk.status}">
                        <div class="chunk-progress" style="width: ${(chunk.downloaded / chunk.total) * 100}%"></div>
                    </div>
                `).join('')}
            </div>
        ` : ''}

        ${download.error ? `
            <div class="error-message">
                ❌ خطا: ${escapeHtml(download.error)}
            </div>
        ` : ''}
    `;

    // Add event listeners to control buttons
    const controls = item.querySelector('.download-controls');
    controls.addEventListener('click', handleControlClick);

    return item;
}

function updateDownloadItem(item, download) {
    item.className = `download-item ${download.status}`;

    // Update progress bar
    const progressBar = item.querySelector('.progress-bar');
    if (progressBar) {
        progressBar.style.width = `${download.progress}%`;
        progressBar.className = `progress-bar ${download.status}`;
    }

    // Update progress text
    const progressText = item.querySelector('.progress-text');
    if (progressText) {
        progressText.textContent = `${Math.round(download.progress)}%`;
    }

    // Update downloaded size
    const progressDetails = item.querySelector('.progress-details span:last-child');
    if (progressDetails) {
        progressDetails.textContent = `${formatBytes(download.downloadedSize)} / ${formatBytes(download.totalSize)}`;
    }

    // Update status badge
    const statusBadge = item.querySelector('.status-badge');
    if (statusBadge) {
        statusBadge.className = `status-badge status-${download.status}`;
        statusBadge.textContent = getStatusText(download.status);
    }

    // Update speed
    const speedSpan = item.querySelector('.download-meta span:last-child');
    if (speedSpan && download.speed > 0) {
        speedSpan.textContent = `سرعت: ${formatSpeed(download.speed)}`;
    }

    // Update control buttons
    const controls = item.querySelector('.download-controls');
    if (controls) {
        controls.innerHTML = getControlButtons(download);
    }

    // Update chunks
    if (download.chunks && download.chunks.length > 0) {
        const chunksInfo = item.querySelector('.chunks-info');
        if (chunksInfo) {
            download.chunks.forEach((chunk, index) => {
                const chunkIndicator = chunksInfo.children[index];
                if (chunkIndicator) {
                    const chunkProgress = chunkIndicator.querySelector('.chunk-progress');
                    if (chunkProgress) {
                        chunkProgress.style.width = `${(chunk.downloaded / chunk.total) * 100}%`;
                    }
                    chunkIndicator.className = `chunk-indicator ${chunk.status}`;
                }
            });
        }
    }

    // Update error message
    if (download.error) {
        let errorMsg = item.querySelector('.error-message');
        if (!errorMsg) {
            errorMsg = document.createElement('div');
            errorMsg.className = 'error-message';
            item.appendChild(errorMsg);
        }
        errorMsg.textContent = `❌ خطا: ${download.error}`;
    }
}

function getControlButtons(download) {
    const buttons = [];

    if (download.status === 'downloading') {
        buttons.push(`
            <button class="control-btn pause-btn" data-action="pause" title="توقف">
                ⏸️
            </button>
        `);
    }

    if (download.status === 'paused') {
        buttons.push(`
            <button class="control-btn resume-btn" data-action="resume" title="ادامه">
                ▶️
            </button>
        `);
    }

    if (download.status === 'downloading' || download.status === 'paused') {
        buttons.push(`
            <button class="control-btn cancel-btn" data-action="cancel" title="لغو">
                ❌
            </button>
        `);
    }

    return buttons.join('');
}

function handleControlClick(event) {
    const button = event.target.closest('.control-btn');
    if (!button) return;

    const action = button.dataset.action;
    const downloadId = button.closest('.download-controls').dataset.downloadId;

    switch (action) {
        case 'pause':
            chrome.runtime.sendMessage({
                type: 'pause-download',
                downloadId: downloadId
            });
            break;

        case 'resume':
            chrome.runtime.sendMessage({
                type: 'resume-download',
                downloadId: downloadId
            });
            break;

        case 'cancel':
            if (confirm('آیا مطمئن هستید که می‌خواهید این دانلود را لغو کنید؟')) {
                chrome.runtime.sendMessage({
                    type: 'cancel-download',
                    downloadId: downloadId
                });
                // Remove from UI
                const item = document.getElementById(`download-${downloadId}`);
                if (item) {
                    item.remove();
                    downloads.delete(downloadId);
                    if (downloads.size === 0) {
                        emptyState.style.display = 'block';
                    }
                }
            }
            break;
    }
}

function clearCompleted() {
    const completedDownloads = Array.from(downloads.values())
        .filter(d => d.status === 'completed');

    if (completedDownloads.length === 0) {
        return;
    }

    if (confirm(`آیا می‌خواهید ${completedDownloads.length} دانلود تکمیل شده را پاک کنید؟`)) {
        completedDownloads.forEach(download => {
            const item = document.getElementById(`download-${download.id}`);
            if (item) {
                item.remove();
            }
            downloads.delete(download.id);
        });

        if (downloads.size === 0) {
            emptyState.style.display = 'block';
        }

        // Notify background script
        chrome.runtime.sendMessage({
            type: 'clear-completed-downloads'
        });
    }
}

function getStatusText(status) {
    const statusTexts = {
        'initializing': 'در حال آماده‌سازی',
        'downloading': 'در حال دانلود',
        'paused': 'متوقف شده',
        'completed': 'تکمیل شده',
        'error': 'خطا',
        'cancelled': 'لغو شده'
    };
    return statusTexts[status] || status;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function formatSpeed(bytesPerSecond) {
    return formatBytes(bytesPerSecond) + '/s';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Auto-refresh every second for smooth progress updates
setInterval(() => {
    // Request updated downloads from background
    chrome.runtime.sendMessage({ type: 'get-all-downloads' }, (response) => {
        if (response && response.downloads) {
            response.downloads.forEach(download => {
                downloads.set(download.id, download);
            });
            renderDownloads();
        }
    });
}, 1000);
