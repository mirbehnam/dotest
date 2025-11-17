// Content script to extract video download links from web pages

(function() {
    'use strict';

    // Listen for messages from the popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'extractVideoLinks') {
            const videoLinks = extractVideoLinks();
            sendResponse({ success: true, links: videoLinks });
        }
        return true;
    });

    function extractVideoLinks() {
        const links = [];
        const videoExtensions = /\.(mkv|mp4|avi|mov|wmv|flv|webm|m4v)(\?|$|#)/i;
        const allLinks = document.querySelectorAll('a[href]');

        allLinks.forEach((link) => {
            const href = link.href;
            const text = link.textContent.trim();

            // Check if the link is a video file
            if (videoExtensions.test(href)) {
                const videoInfo = analyzeVideoLink(href, text, link);
                if (videoInfo) {
                    links.push(videoInfo);
                }
            }
        });

        // Also check for direct video links in the page source
        const pageText = document.body.innerHTML;
        const directLinkRegex = /(https?:\/\/[^\s<>"]+\.(mkv|mp4|avi|mov|wmv|flv|webm|m4v)(\?[^\s<>"]*)?)/gi;
        const matches = pageText.matchAll(directLinkRegex);

        for (const match of matches) {
            const url = match[1];
            // Avoid duplicates
            if (!links.find(l => l.url === url)) {
                const videoInfo = analyzeVideoLink(url, '', null);
                if (videoInfo) {
                    links.push(videoInfo);
                }
            }
        }

        return links;
    }

    function analyzeVideoLink(url, text, linkElement) {
        try {
            // Extract filename from URL
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            const filename = pathname.split('/').pop() || text || 'Unknown';

            // Decode URI component to handle encoded characters
            const decodedFilename = decodeURIComponent(filename);

            // Extract video information
            const info = {
                url: url,
                filename: decodedFilename,
                displayText: text || decodedFilename,
                format: extractFormat(url, decodedFilename),
                codec: extractCodec(url, decodedFilename, text),
                resolution: extractResolution(url, decodedFilename, text),
                quality: extractQuality(url, decodedFilename, text),
                size: extractSize(linkElement, text)
            };

            return info;
        } catch (error) {
            console.error('Error analyzing video link:', error);
            return null;
        }
    }

    function extractFormat(url, filename) {
        const formatMatch = filename.match(/\.(mkv|mp4|avi|mov|wmv|flv|webm|m4v)$/i);
        if (formatMatch) {
            return formatMatch[1].toLowerCase();
        }

        // Check URL if not in filename
        const urlFormatMatch = url.match(/\.(mkv|mp4|avi|mov|wmv|flv|webm|m4v)(\?|$|#)/i);
        if (urlFormatMatch) {
            return urlFormatMatch[1].toLowerCase();
        }

        return 'unknown';
    }

    function extractCodec(url, filename, text) {
        const combined = `${url} ${filename} ${text}`.toLowerCase();

        if (combined.includes('x265') || combined.includes('hevc') || combined.includes('h265')) {
            return 'x265';
        }
        if (combined.includes('x264') || combined.includes('avc') || combined.includes('h264')) {
            return 'x264';
        }
        if (combined.includes('av1')) {
            return 'av1';
        }
        if (combined.includes('vp9')) {
            return 'vp9';
        }
        if (combined.includes('xvid')) {
            return 'xvid';
        }

        return null;
    }

    function extractResolution(url, filename, text) {
        const combined = `${url} ${filename} ${text}`;

        // Common resolution patterns
        const resolutionPatterns = [
            { regex: /2160p|4k|uhd/i, value: '2160p' },
            { regex: /1440p|2k/i, value: '1440p' },
            { regex: /1080p|fhd|fullhd|full.hd/i, value: '1080p' },
            { regex: /720p|hd/i, value: '720p' },
            { regex: /480p|sd/i, value: '480p' },
            { regex: /360p/i, value: '360p' },
            { regex: /240p/i, value: '240p' },
            { regex: /3840x2160|2160x3840/i, value: '2160p' },
            { regex: /2560x1440|1440x2560/i, value: '1440p' },
            { regex: /1920x1080|1080x1920/i, value: '1080p' },
            { regex: /1280x720|720x1280/i, value: '720p' },
            { regex: /854x480|480x854/i, value: '480p' }
        ];

        for (const pattern of resolutionPatterns) {
            if (pattern.regex.test(combined)) {
                return pattern.value;
            }
        }

        return null;
    }

    function extractQuality(url, filename, text) {
        const combined = `${url} ${filename} ${text}`.toLowerCase();

        const qualityPatterns = [
            'bluray', 'blu-ray', 'brrip', 'bdrip',
            'webrip', 'web-dl', 'webdl',
            'hdtv', 'hdcam', 'cam',
            'dvdrip', 'dvd', 'hdrip'
        ];

        for (const quality of qualityPatterns) {
            if (combined.includes(quality)) {
                return quality;
            }
        }

        return null;
    }

    function extractSize(linkElement, text) {
        if (!linkElement) return null;

        // Try to find size information near the link
        const parent = linkElement.parentElement;
        if (parent) {
            const parentText = parent.textContent;
            // Look for size patterns like "1.5GB", "700MB", etc.
            const sizeMatch = parentText.match(/(\d+(?:\.\d+)?)\s*(gb|mb|kb|tb)/i);
            if (sizeMatch) {
                return sizeMatch[0];
            }
        }

        // Also check in link text
        const sizeMatch = text.match(/(\d+(?:\.\d+)?)\s*(gb|mb|kb|tb)/i);
        if (sizeMatch) {
            return sizeMatch[0];
        }

        return null;
    }

})();
