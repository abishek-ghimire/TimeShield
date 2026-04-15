document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const site = params.get('site');
    if (site) {
        document.getElementById('siteName').textContent = site;
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
