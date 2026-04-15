// Filter list management
export class FilterListManager {
  constructor() {
    this.lists = {
      easyList: {
        url: 'https://easylist.to/easylist/easylist.txt',
        enabled: true,
        category: 'ads'
      },
      easyPrivacy: {
        url: 'https://easylist.to/easylist/easyprivacy.txt',
        enabled: true,
        category: 'tracking'
      },
      uBlockAnnoyances: {
        url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/annoyances.txt',
        enabled: true,
        category: 'annoyances'
      },
      fanboysAnnoyances: {
        url: 'https://easylist.to/easylist/fanboy-annoyance.txt',
        enabled: false,
        category: 'annoyances'
      },
      malwareDomains: {
        url: 'https://raw.githubusercontent.com/DandelionSprout/adfilt/master/Alternate%20versions%20Anti-Malware%20List/AntiMalwareHosts.txt',
        enabled: true,
        category: 'security'
      }
    };
  }
  
  async loadAllLists() {
    let allFilters = [];
    
    for (const [name, list] of Object.entries(this.lists)) {
      if (list.enabled) {
        try {
          const filters = await this.loadList(name, list.url);
          allFilters = allFilters.concat(filters);
          console.log(`✅ Loaded ${name}: ${filters.length} filters`);
        } catch (error) {
          console.error(`Failed to load ${name}:`, error);
        }
      }
    }
    
    // Add custom filters
    const customFilters = await this.loadCustomFilters();
    allFilters = allFilters.concat(customFilters);
    
    return allFilters;
  }
  
  async loadList(name, url) {
    try {
      const response = await fetch(url);
      const text = await response.text();
      
      // Parse filter list
      const filters = this.parseFilterList(text);
      
      // Cache locally
      await this.cacheList(name, text);
      
      return filters;
    } catch (error) {
      // Try loading from cache
      return await this.loadFromCache(name);
    }
  }
  
  parseFilterList(text) {
    const lines = text.split('\n');
    const filters = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip comments and empty lines
      if (trimmed === '' || trimmed.startsWith('!') || trimmed.startsWith('[Adblock')) {
        continue;
      }
      
      // Separate network filters from cosmetic filters
      if (trimmed.includes('##') || trimmed.includes('#@#')) {
        // Cosmetic filter - handled by content script
        filters.push({ type: 'cosmetic', rule: trimmed });
      } else {
        // Network filter - for DNR
        filters.push({ type: 'network', rule: trimmed });
      }
    }
    
    return filters;
  }
  
  async cacheList(name, content) {
    const cache = {};
    cache[`list_${name}`] = {
      content: content,
      timestamp: Date.now()
    };
    await chrome.storage.local.set(cache);
  }
  
  async loadFromCache(name) {
    const data = await chrome.storage.local.get(`list_${name}`);
    if (data[`list_${name}`]) {
      return this.parseFilterList(data[`list_${name}`].content);
    }
    return [];
  }
  
  async loadCustomFilters() {
    const data = await chrome.storage.local.get('customFilters');
    return (data.customFilters || []).map(rule => ({
      type: 'network',
      rule: rule.filter
    }));
  }
  
  async updateAllLists() {
    for (const [name, list] of Object.entries(this.lists)) {
      if (list.enabled) {
        try {
          await this.loadList(name, list.url);
        } catch (error) {
          console.error(`Failed to update ${name}:`, error);
        }
      }
    }
  }
  
  async toggleList(name, enabled) {
    if (this.lists[name]) {
      this.lists[name].enabled = enabled;
      await this.saveSettings();
    }
  }
  
  async saveSettings() {
    await chrome.storage.local.set({ filterLists: this.lists });
  }
  
  async loadSettings() {
    const data = await chrome.storage.local.get('filterLists');
    if (data.filterLists) {
      this.lists = { ...this.lists, ...data.filterLists };
    }
  }
}
