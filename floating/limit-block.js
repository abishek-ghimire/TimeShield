document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const site = params.get('site');
    const originalUrl = params.get('orig');
    
    if (site) {
        document.getElementById('siteName').textContent = site;
    }

    // Add "Go Back" button if original URL is available
    if (originalUrl) {
        const goBackBtn = document.createElement('a');
        goBackBtn.href = '#';
        goBackBtn.className = 'action';
        goBackBtn.textContent = '← Go Back to Previous Page';
        goBackBtn.style.marginRight = '10px';
        goBackBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = decodeURIComponent(originalUrl);
        });
        
        // Insert before the options link
        const optionsLink = document.getElementById('optionsLink');
        if (optionsLink) {
            optionsLink.parentNode.insertBefore(goBackBtn, optionsLink);
        }
    }

    // Redirect cleanly to options page screen time tab
    const optionsLink = document.getElementById('optionsLink');
    if (optionsLink) {
        optionsLink.addEventListener('click', (e) => {
            e.preventDefault();
            chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html#screentime') });
            // Alternatively, #screentime if the hash mapping logic handles it, but Options HTML expects click to switch.
            // A full tab create ensures it works smoothly from an iframe or redirect page.
        });
    }
});
