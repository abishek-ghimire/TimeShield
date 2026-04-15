// Filter list management - comprehensive ad blocking
export class FilterListManager {
  constructor() {
    this.lists = {
      // Core Lists (highest quality, always enabled)
      easyList: {
        url: 'https://easylist.to/easylist/easylist.txt',
        enabled: true,
        category: 'ads',
        priority: 1
      },
      easyPrivacy: {
        url: 'https://easylist.to/easylist/easyprivacy.txt',
        enabled: true,
        category: 'tracking',
        priority: 1
      },

      // uBlock Origin lists (very comprehensive)
      uBlockBase: {
        url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
        enabled: true,
        category: 'ads',
        priority: 1
      },
      uBlockPrivacy: {
        url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt',
        enabled: true,
        category: 'tracking',
        priority: 1
      },
      uBlockAnnoyances: {
        url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/annoyances.txt',
        enabled: true,
        category: 'annoyances',
        priority: 2
      },
      uBlockBadware: {
        url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/badware.txt',
        enabled: true,
        category: 'security',
        priority: 1
      },
      uBlockUnbreak: {
        url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/unbreak.txt',
        enabled: true,
        category: 'unbreak',
        priority: 3
      },

      // AdGuard lists (broad coverage)
      adGuardBase: {
        url: 'https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_2_Base/filter.txt',
        enabled: true,
        category: 'ads',
        priority: 1
      },
      adGuardTracking: {
        url: 'https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_3_Spyware/filter.txt',
        enabled: true,
        category: 'tracking',
        priority: 1
      },
      adGuardSocial: {
        url: 'https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_4_Social/filter.txt',
        enabled: true,
        category: 'annoyances',
        priority: 2
      },
      adGuardAnnoyances: {
        url: 'https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_14_Annoyances/filter.txt',
        enabled: true,
        category: 'annoyances',
        priority: 2
      },

      // Specialty lists
      fanboysAnnoyances: {
        url: 'https://easylist.to/easylist/fanboy-annoyance.txt',
        enabled: true,
        category: 'annoyances',
        priority: 2
      },
      fanboySocial: {
        url: 'https://easylist.to/easylist/fanboy-social.txt',
        enabled: true,
        category: 'annoyances',
        priority: 2
      },
      peterLowe: {
        url: 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=1&mimetype=plaintext',
        enabled: true,
        category: 'ads',
        priority: 1
      },
      malwareDomains: {
        url: 'https://raw.githubusercontent.com/DandelionSprout/adfilt/master/Alternate%20versions%20Anti-Malware%20List/AntiMalwareHosts.txt',
        enabled: true,
        category: 'security',
        priority: 1
      },
      urlHaus: {
        url: 'https://urlhaus-filter.pages.dev/urlhaus-filter-online.txt',
        enabled: true,
        category: 'security',
        priority: 1
      },

      // Cookie consent banners (GDPR popups)
      easyListCookies: {
        url: 'https://secure.fanboy.co.nz/fanboy-cookiemonster.txt',
        enabled: true,
        category: 'annoyances',
        priority: 2
      },

      // Anti-Coinminer
      antiCoinMiner: {
        url: 'https://raw.githubusercontent.com/nicehash/NiceHashQuickMiner/main/deploy/NiceHashQuickMiner@latest/blocklist.txt',
        enabled: true,
        category: 'security',
        priority: 1
      }
    };

    // Load saved settings
    this.loadSettings();
  }

  async loadAllLists() {
    let allFilters = [];
    const sortedLists = Object.entries(this.lists).sort((a, b) =>
      (a[1].priority || 9) - (b[1].priority || 9)
    );

    for (const [name, list] of sortedLists) {
      if (!list.enabled) continue;
      try {
        const filters = await this.loadList(name, list.url);
        allFilters = allFilters.concat(filters);
        console.log(`✅ [${list.category}] ${name}: ${filters.length} filters`);
      } catch (error) {
        console.warn(`⚠️ Failed to load ${name}:`, error.message);
      }
    }

    // Add custom filters (always last)
    const customFilters = await this.loadCustomFilters();
    allFilters = allFilters.concat(customFilters);
    console.log(`📊 Total filters loaded: ${allFilters.length}`);

    return allFilters;
  }

  async loadList(name, url) {
    try {
      // Check cache freshness (24h)
      const cached = await this.loadFromCache(name);
      if (cached && cached._cacheAge && (Date.now() - cached._cacheAge < 86400000)) {
        return cached;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const text = await response.text();
      const filters = this.parseFilterList(text);
      await this.cacheList(name, text);
      return filters;
    } catch (error) {
      // Try loading from cache as fallback
      const cached = await this.loadFromCache(name);
      if (cached && cached.length > 0) {
        console.log(`📦 Using cache for ${name}`);
        return cached;
      }
      throw error;
    }
  }

  parseFilterList(text) {
    const lines = text.split('\n');
    const filters = [];
    let count = 0;

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments, blank lines, and list headers
      if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('[Adblock') ||
        trimmed.startsWith('#') || trimmed.startsWith('%')) {
        continue;
      }

      // Cosmetic filter (##)
      if (trimmed.includes('##') || trimmed.includes('#@#') ||
        trimmed.includes('#?#') || trimmed.includes('#$#')) {
        filters.push({ type: 'cosmetic', rule: trimmed });
        count++;
        continue;
      }

      // Exception rules (@@)
      if (trimmed.startsWith('@@')) {
        filters.push({ type: 'exception', rule: trimmed.slice(2) });
        count++;
        continue;
      }

      // Skip complex option rules that don't translate well to DNR
      // (e.g. $redirect=, $rewrite=, $csp= etc.)
      if (trimmed.includes('$redirect=') || trimmed.includes('$rewrite=') ||
        trimmed.includes('$csp=') || trimmed.includes('$removeparam=')) {
        continue;
      }

      // Network filter
      if (trimmed.length > 3) {
        filters.push({ type: 'network', rule: trimmed });
        count++;
      }
    }

    return filters;
  }

  async cacheList(name, content) {
    const key = `list_cache_${name}`;
    await chrome.storage.local.set({
      [key]: {
        content,
        timestamp: Date.now()
      }
    });
  }

  async loadFromCache(name) {
    const key = `list_cache_${name}`;
    const data = await chrome.storage.local.get(key);
    if (data[key]) {
      const parsed = this.parseFilterList(data[key].content);
      parsed._cacheAge = data[key].timestamp;
      return parsed;
    }
    return null;
  }

  async loadCustomFilters() {
    const data = await chrome.storage.local.get('customFilters');
    const customRules = data.customFilters || [];

    return customRules.map(rule => {
      const ruleStr = typeof rule === 'string' ? rule : (rule.filter || '');
      if (!ruleStr) return null;

      // Support the ## selector format for cosmetic rules
      if (ruleStr.includes('##')) {
        return { type: 'cosmetic', rule: ruleStr };
      }
      return { type: 'network', rule: ruleStr };
    }).filter(r => r !== null);
  }

  async updateAllLists() {
    // Clear cache so all lists are re-downloaded
    const keys = Object.keys(this.lists).map(name => `list_cache_${name}`);
    await chrome.storage.local.remove(keys);
    return this.loadAllLists();
  }

  async toggleList(name, enabled) {
    if (this.lists[name]) {
      this.lists[name].enabled = enabled;
      await this.saveSettings();
    }
  }

  async saveSettings() {
    const settings = {};
    for (const [name, list] of Object.entries(this.lists)) {
      settings[name] = { enabled: list.enabled };
    }
    await chrome.storage.local.set({ filterListSettings: settings });
  }

  async loadSettings() {
    const data = await chrome.storage.local.get('filterListSettings');
    if (data.filterListSettings) {
      for (const [name, cfg] of Object.entries(data.filterListSettings)) {
        if (this.lists[name]) {
          this.lists[name].enabled = cfg.enabled;
        }
      }
    }
  }
}
