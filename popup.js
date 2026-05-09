document.addEventListener('DOMContentLoaded', async () => {
    const urlInput = document.getElementById('url-input');
    const scanBtn = document.getElementById('scan-btn');
    const clearBtn = document.getElementById('clear-btn');
    const loadingDiv = document.getElementById('loading');
    const resultsDiv = document.getElementById('results');
    const vulnList = document.getElementById('vulnerability-list');
    const currentScannedUrl = document.getElementById('current-scanned-url');

    // Get current tab URL
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url && !tabs[0].url.startsWith('chrome://')) {
            urlInput.value = tabs[0].url;
        }
    });

    // Load last scan result
    chrome.storage.local.get(['lastScanResult', 'lastScannedUrl'], (data) => {
        if (data.lastScanResult && data.lastScannedUrl) {
            urlInput.value = data.lastScannedUrl;
            renderResults(data.lastScanResult, data.lastScannedUrl);
        }
    });

    scanBtn.addEventListener('click', () => {
        const urlToScan = urlInput.value.trim();
        if (!urlToScan) return;

        // Basic URL validation
        try {
            new URL(urlToScan);
        } catch (e) {
            alert('Please enter a valid URL.');
            return;
        }

        startScan(urlToScan);
    });

    clearBtn.addEventListener('click', () => {
        urlInput.value = '';
        resultsDiv.classList.add('hidden');
        chrome.storage.local.remove(['lastScanResult', 'lastScannedUrl']);
    });

    function startScan(url) {
        resultsDiv.classList.add('hidden');
        loadingDiv.classList.remove('hidden');
        scanBtn.disabled = true;

        chrome.runtime.sendMessage({ action: 'scan_url', url: url }, (response) => {
            loadingDiv.classList.add('hidden');
            scanBtn.disabled = false;

            if (response && response.results) {
                renderResults(response.results, url);
                chrome.storage.local.set({ lastScanResult: response.results, lastScannedUrl: url });
            } else {
                alert('Scan failed or timed out.');
            }
        });
    }

    function renderResults(results, url) {
        currentScannedUrl.textContent = url;
        vulnList.innerHTML = '';

        results.forEach(res => {
            const li = document.createElement('li');
            
            let statusIcon = '🟢';
            let statusClass = 'status-safe';
            let statusText = 'Likely Safe';

            if (res.status === 'Possible Issue') {
                statusIcon = '🟡';
                statusClass = 'status-warning';
                statusText = 'Possible Issue';
            } else if (res.status === 'Check Manually') {
                statusIcon = '🔴';
                statusClass = 'status-danger';
                statusText = 'Check Manually';
            }

            li.innerHTML = `
                <div>
                    <span class="vuln-id">${res.id}</span>
                    <span class="vuln-name">${res.name}</span>
                </div>
                <div class="status-indicator ${statusClass}">
                    <span>${statusIcon}</span> ${statusText}
                </div>
            `;
            vulnList.appendChild(li);
        });

        resultsDiv.classList.remove('hidden');
    }
});
