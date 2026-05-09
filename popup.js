document.addEventListener('DOMContentLoaded', () => {
    const mainView = document.getElementById('main-view');
    const settingsView = document.getElementById('settings-view');
    const settingsBtn = document.getElementById('settings-btn');
    const backBtn = document.getElementById('back-btn');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const aiKeyInput = document.getElementById('ai-key');
    
    const resultsDiv = document.getElementById('results');
    const noResultsDiv = document.getElementById('no-results');
    const vulnList = document.getElementById('vulnerability-list');
    const currentScannedUrl = document.getElementById('current-scanned-url');
    const statusBanner = document.getElementById('status-banner');
    const statusText = document.getElementById('status-text');

    const aiAnalyzeBtn = document.getElementById('ai-analyze-btn');
    const aiInsightBox = document.getElementById('ai-insight-box');
    const aiInsightText = document.getElementById('ai-insight-text');

    let currentScanData = null;

    // Load API Key
    chrome.storage.local.get(['geminiApiKey'], (data) => {
        if (data.geminiApiKey) {
            aiKeyInput.value = data.geminiApiKey;
        }
    });

    // View Toggling
    settingsBtn.addEventListener('click', () => {
        mainView.classList.add('hidden');
        settingsView.classList.remove('hidden');
    });

    backBtn.addEventListener('click', () => {
        settingsView.classList.add('hidden');
        mainView.classList.remove('hidden');
    });

    saveSettingsBtn.addEventListener('click', () => {
        chrome.storage.local.set({ geminiApiKey: aiKeyInput.value.trim() }, () => {
            saveSettingsBtn.textContent = 'Saved!';
            setTimeout(() => { saveSettingsBtn.textContent = 'Save'; }, 1500);
        });
    });

    // Fetch Autonomous Results
    chrome.runtime.sendMessage({ action: 'get_current_results' }, (response) => {
        statusBanner.classList.add('hidden');
        
        if (response && !response.error) {
            currentScanData = response;
            renderResults(response.results, response.url);
        } else {
            noResultsDiv.classList.remove('hidden');
        }
    });

    // AI Analysis
    aiAnalyzeBtn.addEventListener('click', () => {
        if (!currentScanData) return;
        
        chrome.storage.local.get(['geminiApiKey'], (data) => {
            aiAnalyzeBtn.disabled = true;
            aiAnalyzeBtn.textContent = '✨ Analyzing...';
            
            chrome.runtime.sendMessage({
                action: 'ai_analyze',
                apiKey: data.geminiApiKey || '',
                data: currentScanData
            }, (response) => {
                aiAnalyzeBtn.disabled = false;
                aiAnalyzeBtn.textContent = '✨ Regenerate Insights';
                aiInsightBox.classList.remove('hidden');
                
                if (response && response.ai_insight) {
                    aiInsightText.textContent = response.ai_insight;
                } else if (response && response.error) {
                    aiInsightText.textContent = response.error;
                } else {
                    aiInsightText.textContent = 'Failed to generate insights.';
                }
            });
        });
    });

    function renderResults(results, url) {
        currentScannedUrl.textContent = new URL(url).hostname;
        vulnList.innerHTML = '';
        
        // Sort: Issues first
        const sortedResults = results.sort((a, b) => {
            if (a.status === 'Likely Safe' && b.status !== 'Likely Safe') return 1;
            if (a.status !== 'Likely Safe' && b.status === 'Likely Safe') return -1;
            return 0;
        });

        sortedResults.forEach(res => {
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

            let detailsHtml = '';
            if (res.details && res.details.length > 0) {
                detailsHtml = `<div class="details-box">`;
                res.details.forEach(d => {
                    detailsHtml += `<p>• ${d}</p>`;
                });
                detailsHtml += `</div>`;
            }

            li.innerHTML = `
                <div class="li-header">
                    <div>
                        <span class="vuln-id">${res.id}</span>
                        <span class="vuln-name">${res.name}</span>
                    </div>
                    <div class="status-indicator ${statusClass}">
                        <span>${statusIcon}</span> ${statusText}
                    </div>
                </div>
                ${detailsHtml}
            `;
            vulnList.appendChild(li);
        });

        resultsDiv.classList.remove('hidden');
    }
});
