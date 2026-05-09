// Passive DOM analysis for vulnerabilities
function analyzeDOM() {
    const findings = [];
    
    // 1. Check for insecure forms (HTTP submission, missing tokens)
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        const action = form.getAttribute('action') || '';
        if (action.toLowerCase().startsWith('http://') && window.location.protocol === 'https:') {
            findings.push({ type: 'A02', message: 'Form submits to insecure HTTP endpoint.' });
        }
        
        const hasPassword = form.querySelector('input[type="password"]');
        const hasHiddenToken = Array.from(form.querySelectorAll('input[type="hidden"]')).some(input => 
            input.name.toLowerCase().includes('csrf') || input.name.toLowerCase().includes('token')
        );
        
        if (hasPassword && !hasHiddenToken && form.method.toLowerCase() === 'post') {
            findings.push({ type: 'A07', message: 'Password form might be missing Anti-CSRF token.' });
        }
    });

    // 2. Check for missing SRI (Subresource Integrity) on external scripts
    const scripts = document.querySelectorAll('script[src]');
    scripts.forEach(script => {
        const src = script.getAttribute('src');
        if (src && src.startsWith('http') && !src.includes(window.location.hostname)) {
            if (!script.getAttribute('integrity')) {
                findings.push({ type: 'A08', message: `External script missing integrity attribute.` });
            }
        }
    });

    // 3. Search for sensitive HTML comments
    const iterator = document.createNodeIterator(document, NodeFilter.SHOW_COMMENT, null, false);
    let curNode;
    while (curNode = iterator.nextNode()) {
        const comment = curNode.nodeValue.toLowerCase();
        if (comment.includes('todo') || comment.includes('password') || comment.includes('secret') || comment.includes('admin')) {
            findings.push({ type: 'A05', message: 'Potentially sensitive information found in HTML comments.' });
            break; // Record once to prevent noise
        }
    }

    // 4. Check for Generator meta tags (info exposure)
    const generator = document.querySelector('meta[name="generator"]');
    if (generator) {
        findings.push({ type: 'A05', message: `Framework version exposed via meta generator: ${generator.content}` });
    }

    return findings;
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'analyze_dom') {
        const findings = analyzeDOM();
        sendResponse({ domFindings: findings });
    }
    return true;
});
