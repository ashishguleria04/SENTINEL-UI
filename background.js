// Keep track of results per tab autonomously
const tabResults = {};

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Run scan automatically when page finishes loading
    if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
        runAutonomousScan(tabId, tab.url);
    }
});

async function runAutonomousScan(tabId, urlString) {
    let url;
    try {
        url = new URL(urlString);
    } catch (e) { return; }

    const results = initializeResults();
    let issueCount = 0;
    
    // 1. URL Heuristics (Nuanced parameters)
    analyzeUrl(url, results);

    // 2. Header Heuristics (Passive fetch)
    await analyzeHeaders(urlString, results);

    // 3. DOM Heuristics (Message Content Script)
    try {
        const domResponse = await chrome.tabs.sendMessage(tabId, { action: 'analyze_dom' });
        if (domResponse && domResponse.domFindings) {
            domResponse.domFindings.forEach(finding => {
                const target = results.find(r => r.id === finding.type);
                if (target) {
                    target.status = 'Possible Issue';
                    if (!target.details.includes(finding.message)) {
                        target.details.push(finding.message);
                    }
                }
            });
        }
    } catch (e) {
        // Content script might not be injected yet
    }

    // Tally issues
    results.forEach(r => {
        if (r.status === 'Possible Issue' || r.status === 'Check Manually') {
            issueCount++;
        }
    });

    // Save to memory
    tabResults[tabId] = { url: urlString, results: results, timestamp: Date.now() };
    
    // Update Extension Badge Autonomously
    if (issueCount > 0) {
        chrome.action.setBadgeText({ text: issueCount.toString(), tabId: tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#ef4444', tabId: tabId });
    } else {
        chrome.action.setBadgeText({ text: '✓', tabId: tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#22c55e', tabId: tabId });
    }
}

function initializeResults() {
    return [
        { id: 'A01', name: 'Broken Access Control', status: 'Likely Safe', details: [] },
        { id: 'A02', name: 'Cryptographic Failures', status: 'Likely Safe', details: [] },
        { id: 'A03', name: 'Injection', status: 'Likely Safe', details: [] },
        { id: 'A04', name: 'Insecure Design', status: 'Likely Safe', details: [] },
        { id: 'A05', name: 'Security Misconfiguration', status: 'Likely Safe', details: [] },
        { id: 'A06', name: 'Vulnerable Components', status: 'Likely Safe', details: [] },
        { id: 'A07', name: 'Ident. & Auth Failures', status: 'Likely Safe', details: [] },
        { id: 'A08', name: 'Software & Data Integrity', status: 'Likely Safe', details: [] },
        { id: 'A09', name: 'Security Logging', status: 'Likely Safe', details: [] },
        { id: 'A10', name: 'SSRF', status: 'Likely Safe', details: [] }
    ];
}

function analyzeUrl(url, results) {
    const urlLower = url.href.toLowerCase();
    const pathLower = url.pathname.toLowerCase();
    const searchLower = url.search.toLowerCase();

    // A01
    if (['admin', 'config', 'backup', '.git', '.env', 'api/users'].some(kw => pathLower.includes(kw))) {
        results[0].status = 'Possible Issue';
        results[0].details.push('Sensitive keywords found in URL path.');
    }
    if (searchLower.includes('id=') || searchLower.includes('user=')) {
         results[0].status = 'Possible Issue';
         results[0].details.push('Direct object reference pattern in URL parameters (IDOR risk).');
    }

    // A02
    if (url.protocol === 'http:') {
        results[1].status = 'Possible Issue';
        results[1].details.push('Site loads over unencrypted HTTP.');
    }

    // A03
    if (['select', 'union', '<script>', 'javascript:'].some(kw => searchLower.includes(kw))) {
        results[2].status = 'Possible Issue';
        results[2].details.push('Suspicious injection patterns detected in URL.');
    } else if (searchLower.includes('=')) {
        results[2].status = 'Check Manually';
        results[2].details.push('URL contains parameters. Manual validation of input sanitization recommended.');
    }

    // A06
    if (['/wp-admin', '/vendor/', '/node_modules', '.php'].some(kw => pathLower.includes(kw))) {
        results[5].status = 'Possible Issue';
        results[5].details.push('Indicator of potentially outdated technology stack in path.');
    }

    // A07
    if (['/login', '/signin', '/auth', 'jwt='].some(kw => urlLower.includes(kw))) {
        results[6].status = 'Check Manually'; 
        results[6].details.push('Authentication endpoint detected. Verify mechanisms manually.');
    }

    // A10
    if (['fetch=', 'proxy=', 'url=', 'path=', 'redirect=', 'uri='].some(kw => searchLower.includes(kw))) {
        results[9].status = 'Possible Issue';
        results[9].details.push('SSRF prone parameters detected in URL.');
    }
}

async function analyzeHeaders(urlString, results) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 800); // Super fast timeout for autonomy
        const response = await fetch(urlString, { method: 'HEAD', mode: 'no-cors', signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.type !== 'opaque') {
            const headers = response.headers;
            
            // A04
            if (!headers.has('X-Frame-Options') && !headers.has('Content-Security-Policy')) {
                results[3].status = 'Possible Issue';
                results[3].details.push('Missing protective headers (CSP, X-Frame-Options).');
            }

            // A05
            if (headers.has('Server') || headers.has('X-Powered-By')) {
                results[4].status = 'Possible Issue';
                results[4].details.push('Server version or technology exposed in headers.');
            }

            // A02 (HSTS)
            if (urlString.startsWith('https') && !headers.has('Strict-Transport-Security')) {
                results[1].status = 'Possible Issue';
                results[1].details.push('Missing HSTS header on HTTPS connection.');
            }
        }
    } catch (e) {
        // network error, ignore for passive checks
    }
}

// API to popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'get_current_results') {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const tabId = tabs[0].id;
            if (tabResults[tabId]) {
                sendResponse(tabResults[tabId]);
            } else {
                sendResponse({ error: 'No scan results yet' });
            }
        });
        return true; 
    }
    
    if (request.action === 'ai_analyze') {
        const apiKey = request.apiKey;
        const data = request.data;
        
        callAI(apiKey, data).then(aiResponse => {
            sendResponse({ ai_insight: aiResponse });
        }).catch(err => {
            sendResponse({ error: err.message });
        });
        return true;
    }
});

async function callAI(apiKey, scanData) {
    if (!apiKey) return "Please provide a Google Gemini API key in the settings for AI analysis.";
    
    const formattedData = scanData.results.filter(r => r.status !== 'Likely Safe').map(r => `${r.name}: ${r.details.join(', ')}`);
    const prompt = `You are an expert web security analyst. I ran a passive scanner on ${scanData.url}. Here are the findings: ${formattedData.length > 0 ? formattedData.join(' | ') : 'No obvious issues found.'}. Provide a concise, 3-sentence executive summary of the risk level and the most critical next step. Keep it professional.`;

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });
        
        const json = await response.json();
        if (json.error) return `AI Error: ${json.error.message}`;
        if (json.candidates && json.candidates[0]) {
            return json.candidates[0].content.parts[0].text;
        }
        return "AI analysis failed to generate a response.";
    } catch (e) {
        return `Connection to AI service failed: ${e.message}`;
    }
}
