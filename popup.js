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

    // Fast load API Key
    chrome.storage.local.get(['geminiApiKey'], (data) => {
        if (data.geminiApiKey) aiKeyInput.value = data.geminiApiKey;
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
            saveSettingsBtn.textContent = 'SAVED';
            setTimeout(() => { saveSettingsBtn.textContent = 'SAVE'; }, 1500);
        });
    });

    // Fetch Autonomous Results Immediately (High Speed)
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
            aiAnalyzeBtn.textContent = 'INITIATING AI UPLINK...';
            
            chrome.runtime.sendMessage({
                action: 'ai_analyze',
                apiKey: data.geminiApiKey || '',
                data: currentScanData
            }, (response) => {
                aiAnalyzeBtn.disabled = false;
                aiAnalyzeBtn.textContent = 'REGENERATE INSIGHTS';
                aiInsightBox.classList.remove('hidden');
                
                if (response && response.ai_insight) {
                    typeWriterEffect(aiInsightText, response.ai_insight);
                } else if (response && response.error) {
                    aiInsightText.textContent = 'ERROR: ' + response.error;
                } else {
                    aiInsightText.textContent = 'ERR: UPLINK FAILED.';
                }
            });
        });
    });

    function typeWriterEffect(element, text) {
        element.textContent = '';
        let i = 0;
        function type() {
            if (i < text.length) {
                element.textContent += text.charAt(i);
                i++;
                setTimeout(type, 10); // Fast typing
            }
        }
        type();
    }

    function renderResults(results, url) {
        currentScannedUrl.textContent = `TARGET: ${new URL(url).hostname}`;
        vulnList.innerHTML = '';
        
        // Sort: CRIT > WARN > SAFE
        const sortedResults = results.sort((a, b) => {
            if (a.status === 'Likely Safe' && b.status !== 'Likely Safe') return 1;
            if (a.status !== 'Likely Safe' && b.status === 'Likely Safe') return -1;
            if (a.status === 'Check Manually' && b.status === 'Possible Issue') return -1;
            if (a.status === 'Possible Issue' && b.status === 'Check Manually') return 1;
            return 0;
        });

        // Fast DOM fragment injection
        const fragment = document.createDocumentFragment();

        sortedResults.forEach((res, index) => {
            const li = document.createElement('li');
            li.style.animationDelay = `${index * 0.1}s`;
            
            let statusPrefix = '[ OK ]';
            let statusClass = 'status-safe';
            let statusText = 'SAFE';

            if (res.status === 'Possible Issue') {
                statusPrefix = '[WARN]';
                statusClass = 'status-warning';
                statusText = 'WARN';
            } else if (res.status === 'Check Manually') {
                statusPrefix = '[FAIL]';
                statusClass = 'status-danger';
                statusText = 'CRIT';
            }

            let detailsHtml = '';
            if (res.details && res.details.length > 0) {
                detailsHtml = `<div class="details-box">`;
                res.details.forEach(d => {
                    detailsHtml += `<p>> ${d}</p>`;
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
                        <span>${statusPrefix}</span> ${statusText}
                    </div>
                </div>
                ${detailsHtml}
            `;
            fragment.appendChild(li);
        });

        vulnList.appendChild(fragment);
        resultsDiv.classList.remove('hidden');
    }
});
