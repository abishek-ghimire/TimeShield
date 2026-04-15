// Cosmetic filtering (hide ad elements)
class CosmeticFilter {
  constructor() {
    this.hiddenElements = new Set();
    this.observer = null;
    this.init();
  }
  
  init() {
    // Request cosmetic filters for this domain
    this.requestFilters();
    
    // Setup observer for dynamic content
    this.setupObserver();
    
    // Listen for filter updates
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === 'applyCosmeticFilters') {
        this.applyFilters(message.filters);
      }
    });
  }
  
  async requestFilters() {
    const domain = window.location.hostname;
    chrome.runtime.sendMessage({
      action: 'getCosmeticFilters',
      domain: domain
    }, (filters) => {
      if (filters && filters.length > 0) {
        this.applyFilters(filters);
      }
    });
  }
  
  applyFilters(filters) {
    const style = document.createElement('style');
    style.id = 'adblock-cosmetic-filters';
    style.textContent = filters.map(f => 
      `${f.selector} { display: none !important; }` 
    ).join('\n');
    
    // Remove old style if exists
    const oldStyle = document.getElementById('adblock-cosmetic-filters');
    if (oldStyle) oldStyle.remove();
    
    document.head.appendChild(style);
    
    // Also hide existing elements
    filters.forEach(filter => {
      try {
        const elements = document.querySelectorAll(filter.selector);
        elements.forEach(el => {
          el.style.setProperty('display', 'none', 'important');
          this.hiddenElements.add(el);
        });
      } catch (e) {
        // Invalid selector, skip
      }
    });
  }
  
  setupObserver() {
    this.observer = new MutationObserver((mutations) => {
      // Check for new ad elements
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) { // Element node
            this.checkNewElement(node);
          }
        });
      });
    });
    
    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  checkNewElement(element) {
    // Check if element matches any ad selector
    const styles = document.getElementById('adblock-cosmetic-filters');
    if (styles) {
      const rules = styles.sheet?.cssRules || [];
      for (const rule of rules) {
        try {
          if (element.matches(rule.selectorText)) {
            element.style.setProperty('display', 'none', 'important');
            this.hiddenElements.add(element);
          }
        } catch (e) {
          // Skip invalid
        }
      }
    }
  }
}

// Initialize
if (document.body) {
  new CosmeticFilter();
} else {
  document.addEventListener('DOMContentLoaded', () => {
    new CosmeticFilter();
  });
}
