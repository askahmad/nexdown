document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('online-downloader-form');
    const urlInput = document.getElementById('online-url');
    const formatQualitySelect = document.getElementById('online-format-quality');
    const statusArea = document.getElementById('online-status');
    const statusTitle = document.getElementById('online-status-title');
    const statusDesc = document.getElementById('online-status-desc');
    const errorArea = document.getElementById('online-error');
    const errorDesc = document.getElementById('online-error-desc');
    const successArea = document.getElementById('online-success');
    const successLink = document.getElementById('online-download-link');
    const submitBtn = document.getElementById('online-submit-btn');

    // Helper to detect service type from URL
    function detectService(url) {
        const lower = url.toLowerCase();
        if (lower.includes('youtube.com') || lower.includes('youtu.be') || lower.includes('youtube-nocookie.com')) {
            return 'youtube';
        }
        if (lower.includes('tiktok.com')) {
            return 'tiktok';
        }
        if (lower.includes('instagram.com')) {
            return 'instagram';
        }
        if (lower.includes('twitter.com') || lower.includes('x.com')) {
            return 'twitter';
        }
        if (lower.includes('reddit.com')) {
            return 'reddit';
        }
        if (lower.includes('vimeo.com')) {
            return 'vimeo';
        }
        if (lower.includes('soundcloud.com')) {
            return 'soundcloud';
        }
        return 'Frontend'; // Default fallback list
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const rawUrl = urlInput.value.trim();
            const [downloadMode, videoQuality] = formatQualitySelect.value.split('|');

            if (!rawUrl) return;

            // Reset UI states
            statusArea.classList.remove('hidden');
            errorArea.classList.add('hidden');
            successArea.classList.add('hidden');
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.7';

            statusTitle.textContent = "Analyzing video link...";
            statusDesc.textContent = "Retrieving active server list. Please wait...";

            try {
                // 1. Fetch working API instances list
                const listRes = await fetch('https://cobalt.directory/api/working?type=api');
                if (!listRes.ok) {
                    throw new Error("Unable to fetch active downloader server list.");
                }
                const listData = await listRes.json();
                const workingApis = listData.data;

                if (!workingApis) {
                    throw new Error("No active downloader servers found.");
                }

                // 2. Detect the service type and filter working APIs
                const service = detectService(rawUrl);
                let apisToTry = workingApis[service] || workingApis['Frontend'] || [];

                // Shuffle or ensure we have at least some fallback APIs if the service list is empty
                if (apisToTry.length === 0) {
                    // Try to gather all unique APIs
                    apisToTry = Array.from(new Set(Object.values(workingApis).flat()));
                }

                if (apisToTry.length === 0) {
                    throw new Error("No downloader servers are available right now. Please try again later.");
                }

                console.log(`Service detected: ${service}. Found ${apisToTry.length} servers to try.`);

                // 3. Try each API endpoint sequentially until one succeeds
                let success = false;
                let lastErrorMsg = "Connection failed.";

                for (let i = 0; i < apisToTry.length; i++) {
                    const apiEndpoint = apisToTry[i];
                    statusTitle.textContent = `Processing video (Server ${i + 1}/${apisToTry.length})...`;
                    statusDesc.textContent = `Connecting to high-speed download tunnel...`;
                    console.log(`Trying API: ${apiEndpoint}`);

                    try {
                        const response = await fetch(apiEndpoint, {
                            method: 'POST',
                            headers: {
                                'Accept': 'application/json',
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                url: rawUrl,
                                downloadMode: downloadMode, // 'auto' or 'audio'
                                videoQuality: videoQuality, // '1080', '720', '480', '360', 'best'
                                filenamePattern: 'classic'
                            })
                        });

                        const data = await response.json();

                        if (response.ok && data.url) {
                            // Success!
                            statusArea.classList.add('hidden');
                            successArea.classList.remove('hidden');
                            successLink.href = data.url;
                            successLink.download = data.filename || "download";
                            success = true;
                            console.log("Download URL fetched successfully from:", apiEndpoint);
                            break; // Stop trying other servers
                        } else {
                            lastErrorMsg = data.text || (data.error && data.error.code) || "Server returned an error.";
                            console.warn(`Server ${apiEndpoint} failed:`, lastErrorMsg);
                        }
                    } catch (fetchErr) {
                        lastErrorMsg = fetchErr.message || "Network request failed.";
                        console.warn(`Failed to connect to ${apiEndpoint}:`, lastErrorMsg);
                    }
                }

                if (!success) {
                    throw new Error(lastErrorMsg);
                }

            } catch (err) {
                // Show final error message
                statusArea.classList.add('hidden');
                errorArea.classList.remove('hidden');
                errorDesc.textContent = err.message || "Something went wrong. Please check your internet connection or make sure the URL is valid.";
            } finally {
                submitBtn.disabled = false;
                submitBtn.style.opacity = '1';
            }
        });
    }
});
