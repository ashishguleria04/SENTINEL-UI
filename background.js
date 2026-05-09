chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'scan_url') {
        performScan(request.url).then(results => {
            sendResponse({ results: results });
        });
        return true; // Keep the message channel open for async response
    }
});

async function performScan(urlString) {
    let url;
    try {
        url = new URL(urlString);
    } catch (e) {
        return generateFallbackResults();
    }

    const results = [
        { id: 'A01', name: 'Broken Access Control', status: 'Likely Safe' },
        { id: 'A02', name: 'Cryptographic Failures', status: 'Likely Safe' },
        { id: 'A03', name: 'Injection', status: 'Likely Safe' },
        { id: 'A04', name: 'Insecure Design', status: 'Likely Safe' },
        { id: 'A05', name: 'Security Misconfiguration', status: 'Likely Safe' },
        { id: 'A06', name: 'Vulnerable Components', status: 'Likely Safe' },
        { id: 'A07', name: 'Ident. & Auth Failures', status: 'Likely Safe' },
        { id: 'A08', name: 'Software & Data Integrity', status: 'Likely Safe' },
        { id: 'A09', name: 'Security Logging', status: 'Likely Safe' },
        { id: 'A10', name: 'SSRF', status: 'Likely Safe' }
    ];

    const urlLower = url.href.toLowerCase();
    const pathLower = url.pathname.toLowerCase();

    // Superficial Checks based on URL

    // A01: Broken Access Control -> Check if URL contains admin, config, backup, .git, /.env
    const a01Keywords = ['admin', 'config', 'backup', '.git', '.env'];
    if (a01Keywords.some(kw => urlLower.includes(kw))) {
        results[0].status = 'Possible Issue';
    }

    // A02: Cryptographic Failures -> Check if site loads over HTTP
    if (url.protocol === 'http:') {
        results[1].status = 'Possible Issue';
    }

    // A03: Injection -> Check URL parameters for ?, =, or input forms presence
    if (url.search.includes('?') || url.search.includes('=')) {
        results[2].status = 'Possible Issue';
    }

    // A06: Vulnerable Components -> Check URL path for /wp-admin, /vendor/, /node_modules
    const a06Keywords = ['/wp-admin', '/vendor/', '/node_modules'];
    if (a06Keywords.some(kw => pathLower.includes(kw))) {
        results[5].status = 'Possible Issue';
    }

    // A07: Identification & Auth Failures -> Check for /login, /signin, /auth endpoints
    const a07Keywords = ['/login', '/signin', '/auth'];
    if (a07Keywords.some(kw => pathLower.includes(kw))) {
        results[6].status = 'Possible Issue'; 
    }

    // A10: SSRF -> Check if URL has fetch, proxy, url=, path= parameters
    const a10Keywords = ['fetch', 'proxy', 'url=', 'path='];
    if (a10Keywords.some(kw => urlLower.includes(kw))) {
        results[9].status = 'Possible Issue';
    }

    // Try fetching the page for headers (A04, A05, A08, A09)
    try {
        // Use a timeout of 3 seconds
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        // Fetching just HEAD to get headers without downloading full body
        const response = await fetch(urlString, { 
            method: 'HEAD', 
            mode: 'no-cors', 
            signal: controller.signal 
        });
        clearTimeout(timeoutId);

        // If no-cors, response.type will be 'opaque' and we can't read headers.
        if (response.type === 'opaque') {
            results[3].status = 'Check Manually'; // A04
            results[4].status = 'Check Manually'; // A05
            results[7].status = 'Check Manually'; // A08
            results[8].status = 'Check Manually'; // A09
        } else {
            // We can read headers!
            const headers = response.headers;
            
            // A04: Insecure Design -> Check if common headers missing (X-Frame-Options, CSP)
            if (!headers.has('X-Frame-Options') && !headers.has('Content-Security-Policy')) {
                results[3].status = 'Possible Issue';
            }

            // A05: Security Misconfiguration -> Check for Server version exposure
            if (headers.has('Server') || headers.has('X-Powered-By')) {
                results[4].status = 'Possible Issue';
            }

            // A08: Software & Data Integrity
            results[7].status = 'Check Manually';

            // A09: Security Logging & Monitoring
            results[8].status = 'Check Manually';
        }

    } catch (e) {
        // If page unreachable -> mark all as "Check Manually"
        return generateFallbackResults();
    }

    return results;
}

function generateFallbackResults() {
    return [
        { id: 'A01', name: 'Broken Access Control', status: 'Check Manually' },
        { id: 'A02', name: 'Cryptographic Failures', status: 'Check Manually' },
        { id: 'A03', name: 'Injection', status: 'Check Manually' },
        { id: 'A04', name: 'Insecure Design', status: 'Check Manually' },
        { id: 'A05', name: 'Security Misconfiguration', status: 'Check Manually' },
        { id: 'A06', name: 'Vulnerable Components', status: 'Check Manually' },
        { id: 'A07', name: 'Ident. & Auth Failures', status: 'Check Manually' },
        { id: 'A08', name: 'Software & Data Integrity', status: 'Check Manually' },
        { id: 'A09', name: 'Security Logging', status: 'Check Manually' },
        { id: 'A10', name: 'SSRF', status: 'Check Manually' }
    ];
}
