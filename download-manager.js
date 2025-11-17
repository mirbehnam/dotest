// Multi-threaded Download Manager with Pause/Resume support

class DownloadManager {
    constructor() {
        this.downloads = new Map();
        this.maxChunks = 4; // Number of parallel chunks
        this.chunkSize = 1024 * 1024; // 1MB chunks
    }

    async startDownload(videoInfo) {
        const downloadId = this.generateId();

        const download = {
            id: downloadId,
            url: videoInfo.url,
            filename: videoInfo.filename,
            status: 'initializing', // initializing, downloading, paused, completed, error
            progress: 0,
            totalSize: 0,
            downloadedSize: 0,
            speed: 0,
            chunks: [],
            startTime: Date.now(),
            pausedChunks: []
        };

        this.downloads.set(downloadId, download);
        this.notifyProgress(downloadId);

        try {
            // Get file size
            const headResponse = await fetch(videoInfo.url, { method: 'HEAD' });
            const totalSize = parseInt(headResponse.headers.get('content-length') || '0');
            const supportsRange = headResponse.headers.get('accept-ranges') === 'bytes';

            download.totalSize = totalSize;
            download.supportsRange = supportsRange;

            if (!supportsRange || totalSize === 0) {
                // Fallback to single-threaded download
                return await this.singleThreadDownload(downloadId, videoInfo.url);
            }

            // Multi-threaded download
            await this.multiThreadDownload(downloadId);

        } catch (error) {
            download.status = 'error';
            download.error = error.message;
            this.notifyProgress(downloadId);
            throw error;
        }

        return downloadId;
    }

    async multiThreadDownload(downloadId) {
        const download = this.downloads.get(downloadId);

        // Check if already paused during initialization
        if (download.status === 'paused') {
            console.log(`Download ${downloadId} was paused during initialization, waiting...`);
            // Wait until resumed
            while (download.status === 'paused') {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        const chunkSize = Math.ceil(download.totalSize / this.maxChunks);

        // Create chunks
        const chunks = [];
        for (let i = 0; i < this.maxChunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize - 1, download.totalSize - 1);

            chunks.push({
                index: i,
                start: start,
                end: end,
                downloaded: 0,
                total: end - start + 1,
                status: 'pending',
                data: null
            });
        }

        download.chunks = chunks;

        // Only change to downloading if not paused
        if (download.status !== 'paused') {
            download.status = 'downloading';
        }
        this.notifyProgress(downloadId);

        // Download chunks in parallel
        const downloadPromises = chunks.map(chunk =>
            this.downloadChunk(downloadId, chunk)
        );

        await Promise.all(downloadPromises);

        // Combine chunks and save
        await this.combineAndSave(downloadId);
    }

    async downloadChunk(downloadId, chunk) {
        try {
            chunk.status = 'downloading';

            const download = this.downloads.get(downloadId);
            const response = await fetch(download.url, {
                headers: {
                    'Range': `bytes=${chunk.start}-${chunk.end}`
                }
            });

            if (!response.ok) {
                throw new Error(`Chunk ${chunk.index} download failed: ${response.status}`);
            }

            const reader = response.body.getReader();
            const chunks = [];

            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                // Check if paused - always get fresh state from Map
                let currentDownload = this.downloads.get(downloadId);
                if (currentDownload && currentDownload.status === 'paused') {
                    console.log(`Chunk ${chunk.index} paused, waiting...`);
                }
                while (currentDownload && currentDownload.status === 'paused') {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    // Re-check status after waiting
                    currentDownload = this.downloads.get(downloadId);
                    if (!currentDownload || currentDownload.status !== 'paused') {
                        console.log(`Chunk ${chunk.index} resumed!`);
                        break;
                    }
                }

                // Check if cancelled
                const cancelCheck = this.downloads.get(downloadId);
                if (!cancelCheck || cancelCheck.status === 'cancelled') {
                    reader.cancel();
                    throw new Error('Download cancelled');
                }

                chunks.push(value);
                chunk.downloaded += value.length;

                // Update download progress - get fresh reference
                const progressDownload = this.downloads.get(downloadId);
                if (progressDownload) {
                    progressDownload.downloadedSize += value.length;

                    // Calculate speed
                    const elapsed = (Date.now() - progressDownload.startTime) / 1000;
                    progressDownload.speed = progressDownload.downloadedSize / elapsed;

                    // Update progress
                    progressDownload.progress = (progressDownload.downloadedSize / progressDownload.totalSize) * 100;
                    this.notifyProgress(downloadId);
                }
            }

            // Combine chunk data
            const totalLength = chunks.reduce((acc, arr) => acc + arr.length, 0);
            const combinedArray = new Uint8Array(totalLength);
            let offset = 0;
            for (const arr of chunks) {
                combinedArray.set(arr, offset);
                offset += arr.length;
            }

            chunk.data = combinedArray;
            chunk.status = 'completed';

        } catch (error) {
            chunk.status = 'error';
            chunk.error = error.message;
            throw error;
        }
    }

    async combineAndSave(downloadId) {
        const download = this.downloads.get(downloadId);

        try {
            // Sort chunks by index
            download.chunks.sort((a, b) => a.index - b.index);

            // Calculate total size
            const totalSize = download.chunks.reduce((acc, chunk) => acc + chunk.data.length, 0);

            // Combine all chunks
            const combinedData = new Uint8Array(totalSize);
            let offset = 0;

            for (const chunk of download.chunks) {
                combinedData.set(chunk.data, offset);
                offset += chunk.data.length;
            }

            // Create blob and download
            const blob = new Blob([combinedData]);
            const url = URL.createObjectURL(blob);

            // Trigger download using Chrome's download API
            await new Promise((resolve, reject) => {
                chrome.downloads.download({
                    url: url,
                    filename: this.sanitizeFilename(download.filename),
                    saveAs: false
                }, (downloadItemId) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        // Wait for download to complete
                        const listener = (delta) => {
                            if (delta.id === downloadItemId && delta.state) {
                                if (delta.state.current === 'complete') {
                                    chrome.downloads.onChanged.removeListener(listener);
                                    URL.revokeObjectURL(url);
                                    resolve();
                                } else if (delta.state.current === 'interrupted') {
                                    chrome.downloads.onChanged.removeListener(listener);
                                    URL.revokeObjectURL(url);
                                    reject(new Error('Download interrupted'));
                                }
                            }
                        };
                        chrome.downloads.onChanged.addListener(listener);
                    }
                });
            });

            download.status = 'completed';
            download.progress = 100;
            this.notifyProgress(downloadId);

        } catch (error) {
            download.status = 'error';
            download.error = error.message;
            this.notifyProgress(downloadId);
            throw error;
        }
    }

    async singleThreadDownload(downloadId, url) {
        const download = this.downloads.get(downloadId);

        try {
            // Check if paused during initialization
            if (download.status === 'paused') {
                console.log(`Download ${downloadId} was paused during initialization, waiting...`);
                // Wait until resumed
                while (download.status === 'paused') {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            // Only change to downloading if not paused
            if (download.status !== 'paused') {
                download.status = 'downloading';
            }
            this.notifyProgress(downloadId);

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Download failed: ${response.status}`);
            }

            const reader = response.body.getReader();
            const chunks = [];
            let receivedLength = 0;

            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                // Check if paused - always get fresh state
                let currentDownload = this.downloads.get(downloadId);
                if (currentDownload && currentDownload.status === 'paused') {
                    console.log(`Download ${downloadId} paused, waiting...`);
                }
                while (currentDownload && currentDownload.status === 'paused') {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    // Re-check status after waiting
                    currentDownload = this.downloads.get(downloadId);
                    if (!currentDownload || currentDownload.status !== 'paused') {
                        console.log(`Download ${downloadId} resumed!`);
                        break;
                    }
                }

                // Check if cancelled
                const cancelCheck = this.downloads.get(downloadId);
                if (!cancelCheck || cancelCheck.status === 'cancelled') {
                    reader.cancel();
                    throw new Error('Download cancelled');
                }

                chunks.push(value);
                receivedLength += value.length;

                // Update progress - get fresh reference
                const progressDownload = this.downloads.get(downloadId);
                if (progressDownload) {
                    progressDownload.downloadedSize = receivedLength;

                    if (progressDownload.totalSize > 0) {
                        progressDownload.progress = (receivedLength / progressDownload.totalSize) * 100;
                    } else {
                        progressDownload.progress = 0;
                    }

                    // Calculate speed
                    const elapsed = (Date.now() - progressDownload.startTime) / 1000;
                    progressDownload.speed = receivedLength / elapsed;

                    this.notifyProgress(downloadId);
                }
            }

            // Combine chunks
            const combinedData = new Uint8Array(receivedLength);
            let offset = 0;
            for (const chunk of chunks) {
                combinedData.set(chunk, offset);
                offset += chunk.length;
            }

            // Create blob and download
            const blob = new Blob([combinedData]);
            const url = URL.createObjectURL(blob);

            await new Promise((resolve, reject) => {
                chrome.downloads.download({
                    url: url,
                    filename: this.sanitizeFilename(download.filename),
                    saveAs: false
                }, (downloadItemId) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        URL.revokeObjectURL(url);
                        resolve();
                    }
                });
            });

            download.status = 'completed';
            download.progress = 100;
            this.notifyProgress(downloadId);

        } catch (error) {
            download.status = 'error';
            download.error = error.message;
            this.notifyProgress(downloadId);
            throw error;
        }
    }

    pauseDownload(downloadId) {
        const download = this.downloads.get(downloadId);
        if (download) {
            // Allow pausing in any state except completed, error, or already paused
            if (download.status === 'downloading' || download.status === 'initializing') {
                download.status = 'paused';
                console.log(`Download ${downloadId} paused from ${download.status}`);
                this.notifyProgress(downloadId);
                return true;
            } else if (download.status === 'paused') {
                console.log(`Download ${downloadId} already paused`);
                return true;
            } else {
                console.log(`Cannot pause download ${downloadId}, current status: ${download.status}`);
                return false;
            }
        }
        return false;
    }

    resumeDownload(downloadId) {
        const download = this.downloads.get(downloadId);
        if (download) {
            if (download.status === 'paused') {
                download.status = 'downloading';
                console.log(`Download ${downloadId} resumed`);
                this.notifyProgress(downloadId);
                return true;
            } else if (download.status === 'downloading') {
                console.log(`Download ${downloadId} already downloading`);
                return true;
            } else {
                console.log(`Cannot resume download ${downloadId}, current status: ${download.status}`);
                return false;
            }
        }
        return false;
    }

    cancelDownload(downloadId) {
        const download = this.downloads.get(downloadId);
        if (download) {
            download.status = 'cancelled';
            this.notifyProgress(downloadId);
            this.downloads.delete(downloadId);
        }
    }

    getDownload(downloadId) {
        return this.downloads.get(downloadId);
    }

    getAllDownloads() {
        return Array.from(this.downloads.values());
    }

    notifyProgress(downloadId) {
        const download = this.downloads.get(downloadId);
        if (download) {
            // Send message to all listeners
            chrome.runtime.sendMessage({
                type: 'download-progress',
                downloadId: downloadId,
                download: this.serializeDownload(download)
            }).catch(() => {
                // Ignore errors if no listeners
            });
        }
    }

    serializeDownload(download) {
        // Remove non-serializable data (like Uint8Array)
        const serialized = { ...download };
        if (serialized.chunks) {
            serialized.chunks = serialized.chunks.map(chunk => ({
                ...chunk,
                data: null // Don't send chunk data
            }));
        }
        return serialized;
    }

    sanitizeFilename(filename) {
        return filename.replace(/[<>:"/\\|?*]/g, '_');
    }

    generateId() {
        return `dl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    formatSpeed(bytesPerSecond) {
        return this.formatBytes(bytesPerSecond) + '/s';
    }
}

// Export for use in background script
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DownloadManager;
}
