// Popup script for Video Download Manager

let allVideoLinks = [];
let filteredVideoLinks = [];
let activeFilter = 'all';

// DOM Elements
const scanButton = document.getElementById('scanButton');
const refreshButton = document.getElementById('refreshButton');
const downloadsPageButton = document.getElementById('downloadsPageButton');
const videoGroupsContainer = document.getElementById('videoGroups');
const statusMessage = document.getElementById('statusMessage');
const actionBar = document.getElementById('actionBar');
const selectedCountSpan = document.getElementById('selectedCount');
const selectAllButton = document.getElementById('selectAllButton');
const deselectAllButton = document.getElementById('deselectAllButton');
const downloadButton = document.getElementById('downloadButton');
const filterButtons = document.querySelectorAll('.filter-btn');

// Event Listeners
scanButton.addEventListener('click', scanPage);
refreshButton.addEventListener('click', scanPage);
downloadsPageButton.addEventListener('click', openDownloadsPage);
selectAllButton.addEventListener('click', selectAll);
deselectAllButton.addEventListener('click', deselectAll);
downloadButton.addEventListener('click', downloadSelected);

filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const filter = btn.getAttribute('data-filter');
        setActiveFilter(filter);
    });
});

// Initialize
showStatus('آماده اسکن صفحه', 'info');

function openDownloadsPage() {
    chrome.tabs.create({ url: chrome.runtime.getURL('downloads.html') });
}

async function scanPage() {
    showStatus('در حال اسکن صفحه...', 'info');
    scanButton.innerHTML = '🔍 در حال اسکن... <span class="loading"></span>';
    scanButton.disabled = true;

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab || !tab.id) {
            throw new Error('نمی‌توان تب فعال را یافت');
        }

        // Send message to content script
        chrome.tabs.sendMessage(tab.id, { action: 'extractVideoLinks' }, (response) => {
            if (chrome.runtime.lastError) {
                showStatus('خطا: ' + chrome.runtime.lastError.message, 'error');
                scanButton.innerHTML = '🔍 اسکن صفحه';
                scanButton.disabled = false;
                return;
            }

            if (response && response.success) {
                allVideoLinks = response.links;
                // Add original index to each video
                allVideoLinks.forEach((video, idx) => {
                    video.originalIndex = idx;
                });
                filteredVideoLinks = [...allVideoLinks];

                if (allVideoLinks.length > 0) {
                    showStatus(`${allVideoLinks.length} لینک ویدیویی پیدا شد!`, 'success');
                    displayVideoGroups();
                    actionBar.style.display = 'flex';
                } else {
                    showStatus('هیچ لینک ویدیویی پیدا نشد', 'error');
                    videoGroupsContainer.innerHTML = `
                        <div class="empty-state">
                            <p>هیچ لینک ویدیویی در این صفحه پیدا نشد</p>
                            <p class="hint">لطفا به صفحه‌ای بروید که لینک‌های دانلود ویدیو دارد</p>
                        </div>
                    `;
                }
            }

            scanButton.innerHTML = '🔍 اسکن صفحه';
            scanButton.disabled = false;
        });
    } catch (error) {
        showStatus('خطا: ' + error.message, 'error');
        scanButton.innerHTML = '🔍 اسکن صفحه';
        scanButton.disabled = false;
    }
}

function displayVideoGroups() {
    // Group videos by format, codec, and resolution
    const groups = groupVideos(filteredVideoLinks);

    if (Object.keys(groups).length === 0) {
        videoGroupsContainer.innerHTML = `
            <div class="empty-state">
                <p>هیچ ویدیویی با فیلتر انتخابی پیدا نشد</p>
                <p class="hint">فیلتر دیگری را امتحان کنید</p>
            </div>
        `;
        return;
    }

    videoGroupsContainer.innerHTML = '';

    Object.keys(groups).forEach(groupName => {
        const videos = groups[groupName];
        const groupElement = createGroupElement(groupName, videos);
        videoGroupsContainer.appendChild(groupElement);
    });

    updateSelectedCount();
}

function groupVideos(videos) {
    const groups = {};

    videos.forEach((video) => {
        // Create a group key based on format, codec, and resolution
        const format = video.format || 'unknown';
        const codec = video.codec || 'unknown';
        const resolution = video.resolution || 'unknown';

        const groupKey = `${format.toUpperCase()} - ${codec.toUpperCase()} - ${resolution.toUpperCase()}`;

        if (!groups[groupKey]) {
            groups[groupKey] = [];
        }

        // Keep the originalIndex that was set in scanPage
        groups[groupKey].push(video);
    });

    // Sort groups by name
    const sortedGroups = {};
    Object.keys(groups).sort().forEach(key => {
        sortedGroups[key] = groups[key];
    });

    return sortedGroups;
}

function createGroupElement(groupName, videos) {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'video-group';

    const headerDiv = document.createElement('div');
    headerDiv.className = 'group-header';
    headerDiv.innerHTML = `
        <span class="group-title">${groupName}</span>
        <span class="group-count">${videos.length} فایل</span>
    `;

    const listDiv = document.createElement('div');
    listDiv.className = 'video-list';

    videos.forEach(video => {
        const videoItem = createVideoItem(video);
        listDiv.appendChild(videoItem);
    });

    groupDiv.appendChild(headerDiv);
    groupDiv.appendChild(listDiv);

    return groupDiv;
}

function createVideoItem(video) {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'video-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'video-checkbox';
    checkbox.dataset.index = video.originalIndex;
    checkbox.addEventListener('change', updateSelectedCount);

    const infoDiv = document.createElement('div');
    infoDiv.className = 'video-info';

    const nameDiv = document.createElement('div');
    nameDiv.className = 'video-name';
    nameDiv.textContent = video.filename;
    nameDiv.title = video.url;

    const detailsDiv = document.createElement('div');
    detailsDiv.className = 'video-details';

    if (video.format) {
        const formatTag = document.createElement('span');
        formatTag.className = 'video-tag tag-format';
        formatTag.textContent = video.format.toUpperCase();
        detailsDiv.appendChild(formatTag);
    }

    if (video.codec) {
        const codecTag = document.createElement('span');
        codecTag.className = 'video-tag tag-codec';
        codecTag.textContent = video.codec.toUpperCase();
        detailsDiv.appendChild(codecTag);
    }

    if (video.resolution) {
        const resolutionTag = document.createElement('span');
        resolutionTag.className = 'video-tag tag-resolution';
        resolutionTag.textContent = video.resolution.toUpperCase();
        detailsDiv.appendChild(resolutionTag);
    }

    if (video.size) {
        const sizeTag = document.createElement('span');
        sizeTag.className = 'video-tag tag-size';
        sizeTag.textContent = video.size;
        detailsDiv.appendChild(sizeTag);
    }

    if (video.quality) {
        const qualityTag = document.createElement('span');
        qualityTag.className = 'video-tag';
        qualityTag.style.background = '#fef3c7';
        qualityTag.style.color = '#92400e';
        qualityTag.textContent = video.quality.toUpperCase();
        detailsDiv.appendChild(qualityTag);
    }

    infoDiv.appendChild(nameDiv);
    infoDiv.appendChild(detailsDiv);

    itemDiv.appendChild(checkbox);
    itemDiv.appendChild(infoDiv);

    return itemDiv;
}

function setActiveFilter(filter) {
    activeFilter = filter;

    // Update button states
    filterButtons.forEach(btn => {
        if (btn.getAttribute('data-filter') === filter) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Filter videos
    if (filter === 'all') {
        filteredVideoLinks = [...allVideoLinks];
    } else {
        filteredVideoLinks = allVideoLinks.filter(video => {
            const searchStr = `${video.format} ${video.codec} ${video.resolution} ${video.filename}`.toLowerCase();
            return searchStr.includes(filter.toLowerCase());
        });
    }

    displayVideoGroups();

    if (filteredVideoLinks.length > 0) {
        showStatus(`${filteredVideoLinks.length} ویدیو با فیلتر "${filter}" پیدا شد`, 'info');
    } else {
        showStatus(`هیچ ویدیویی با فیلتر "${filter}" پیدا نشد`, 'error');
    }
}

function updateSelectedCount() {
    const checkboxes = document.querySelectorAll('.video-checkbox:checked');
    selectedCountSpan.textContent = checkboxes.length;
}

function selectAll() {
    const checkboxes = document.querySelectorAll('.video-checkbox');
    checkboxes.forEach(cb => cb.checked = true);
    updateSelectedCount();
}

function deselectAll() {
    const checkboxes = document.querySelectorAll('.video-checkbox');
    checkboxes.forEach(cb => cb.checked = false);
    updateSelectedCount();
}

async function downloadSelected() {
    const checkboxes = document.querySelectorAll('.video-checkbox:checked');

    if (checkboxes.length === 0) {
        showStatus('لطفا حداقل یک ویدیو را انتخاب کنید', 'error');
        return;
    }

    const selectedVideos = [];
    checkboxes.forEach(cb => {
        const index = parseInt(cb.dataset.index);
        selectedVideos.push(allVideoLinks[index]);
    });

    showStatus(`شروع دانلود ${selectedVideos.length} فایل...`, 'info');
    downloadButton.disabled = true;

    // Send videos to background script for multi-threaded download
    chrome.runtime.sendMessage({
        type: 'start-downloads',
        videos: selectedVideos
    }, (response) => {
        if (response && response.success) {
            showStatus(`${selectedVideos.length} دانلود شروع شد! برای مشاهده پیشرفت روی دکمه "دانلودها" کلیک کنید`, 'success');
            downloadButton.disabled = false;

            // Uncheck all after starting downloads
            setTimeout(() => {
                deselectAll();
            }, 2000);

            // Optionally open downloads page
            setTimeout(() => {
                openDownloadsPage();
            }, 500);
        } else {
            showStatus('خطا در شروع دانلود: ' + (response?.error || 'نامشخص'), 'error');
            downloadButton.disabled = false;
        }
    });
}

function sanitizeFilename(filename) {
    // Remove invalid characters from filename
    return filename.replace(/[<>:"/\\|?*]/g, '_');
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function showStatus(message, type = 'info') {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
}
