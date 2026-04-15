// Main ad blocking engine - Maximum coverage
export class AdBlockEngine {
  constructor(manager) {
    this.manager = manager;
    this.activeRules = [];
    this.dynamicRulesetId = 20001; // custom rules start here
  }

  /**
   * Apply compiled DNR rules in the ID range 2001–20000.
   * Clears old rules in that range first to avoid conflicts.
   */
  async applyRules(rules) {
    try {
      // Remove old ad-blocking dynamic rules (ID range 2001–20000)
      const allDynamic = await chrome.declarativeNetRequest.getDynamicRules();
      const oldIds = allDynamic.map(r => r.id).filter(id => id >= 2001 && id <= 20000);
      if (oldIds.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: oldIds });
      }

      // Chrome allows at most 5,000 dynamic rules total
      const MAX_DYNAMIC = 5000;
      const rulesToAdd = rules.slice(0, MAX_DYNAMIC);

      if (rulesToAdd.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({ addRules: rulesToAdd });
      }
      this.activeRules = rulesToAdd;
      console.log(`🛡️ Applied ${rulesToAdd.length} dynamic DNR rules`);

      // Also apply session rules for additional third-party coverage
      await this.applySessionRules();

    } catch (error) {
      console.error('❌ Failed to apply DNR rules:', error);
    }
  }

  /**
   * Session rules (up to 5,000 extra) — block all third-party scripts/media.
   * These are cleared when the browser session ends.
   */
  async applySessionRules() {
    try {
      // Clear existing session rules
      const existing = await chrome.declarativeNetRequest.getSessionRules();
      if (existing.length > 0) {
        await chrome.declarativeNetRequest.updateSessionRules({
          removeRuleIds: existing.map(r => r.id)
        });
      }

      const sessionRules = [
        // Block all third-party tracking pixels (1x1 images)
        {
          id: 50001,
          priority: 3,
          action: { type: 'block' },
          condition: {
            domainType: 'thirdParty',
            resourceTypes: ['ping', 'csp_report'],
          }
        },
        // Block high-risk third-party iframes (ad iframes)
        {
          id: 50002,
          priority: 2,
          action: { type: 'block' },
          condition: {
            urlFilter: '||ad.doubleclick.net^',
            resourceTypes: ['sub_frame', 'script', 'image', 'xmlhttprequest']
          }
        },
        // Google IMA SDK (YouTube ads)
        {
          id: 50003,
          priority: 3,
          action: { type: 'block' },
          condition: {
            urlFilter: '||imasdk.googleapis.com^',
            resourceTypes: ['script', 'xmlhttprequest', 'sub_frame']
          }
        },
        // Block all pagead requests
        {
          id: 50004,
          priority: 3,
          action: { type: 'block' },
          condition: {
            urlFilter: '||pagead2.googlesyndication.com^',
            resourceTypes: ['script', 'xmlhttprequest', 'sub_frame', 'image']
          }
        },
        // Block YouTube ad API specifically
        {
          id: 50005,
          priority: 3,
          action: { type: 'block' },
          condition: {
            urlFilter: '||www.youtube.com/api/stats/ads^',
            resourceTypes: ['xmlhttprequest', 'ping', 'image']
          }
        },
        {
          id: 50006,
          priority: 3,
          action: { type: 'block' },
          condition: {
            urlFilter: '||www.youtube.com/pagead^',
            resourceTypes: ['script', 'xmlhttprequest', 'sub_frame', 'image']
          }
        },
        {
          id: 50007,
          priority: 3,
          action: { type: 'block' },
          condition: {
            urlFilter: '||www.youtube.com/ptracking^',
            resourceTypes: ['xmlhttprequest', 'ping', 'image']
          }
        },
        {
          id: 50008,
          priority: 3,
          action: { type: 'block' },
          condition: {
            urlFilter: '||s.youtube.com/api/stats/ads^',
            resourceTypes: ['xmlhttprequest', 'ping', 'image']
          }
        },
        // Block ad-related redirectors
        {
          id: 50009,
          priority: 3,
          action: { type: 'block' },
          condition: {
            urlFilter: '||adclick.g.doubleclick.net^',
            resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest']
          }
        },
        // Block Facebook pixel
        {
          id: 50010,
          priority: 3,
          action: { type: 'block' },
          condition: {
            urlFilter: '||connect.facebook.net/en_US/fbevents.js',
            resourceTypes: ['script']
          }
        },
        // Block Google Analytics beacon
        {
          id: 50011,
          priority: 3,
          action: { type: 'block' },
          condition: {
            urlFilter: '||www.google-analytics.com/collect^',
            resourceTypes: ['xmlhttprequest', 'ping', 'image']
          }
        },
        {
          id: 50012,
          priority: 3,
          action: { type: 'block' },
          condition: {
            urlFilter: '||www.google-analytics.com/j/collect^',
            resourceTypes: ['xmlhttprequest', 'ping', 'image']
          }
        },
        {
          id: 50013,
          priority: 3,
          action: { type: 'block' },
          condition: {
            urlFilter: '||www.google-analytics.com/r/collect^',
            resourceTypes: ['xmlhttprequest', 'ping', 'image']
          }
        },
        {
          id: 50014,
          priority: 3,
          action: { type: 'block' },
          condition: {
            urlFilter: '||analytics.google.com/g/collect^',
            resourceTypes: ['xmlhttprequest', 'ping', 'image']
          }
        },
        // Microsoft Clarity (spyware)
        {
          id: 50015,
          priority: 3,
          action: { type: 'block' },
          condition: {
            urlFilter: '||www.clarity.ms^',
            resourceTypes: ['script', 'xmlhttprequest', 'ping', 'image']
          }
        },
        // HotJar (session recording)
        {
          id: 50016,
          priority: 3,
          action: { type: 'block' },
          condition: {
            urlFilter: '||static.hotjar.com^',
            resourceTypes: ['script', 'xmlhttprequest']
          }
        },
        // Taboola video ads
        {
          id: 50017,
          priority: 3,
          action: { type: 'block' },
          condition: {
            urlFilter: '||cdn.taboola.com^',
            resourceTypes: ['script', 'xmlhttprequest', 'sub_frame', 'image']
          }
        },
        // Outbrain widget
        {
          id: 50018,
          priority: 3,
          action: { type: 'block' },
          condition: {
            urlFilter: '||widgets.outbrain.com^',
            resourceTypes: ['script', 'xmlhttprequest', 'sub_frame', 'image']
          }
        },
        // Criteo bidder
        {
          id: 50019,
          priority: 3,
          action: { type: 'block' },
          condition: {
            urlFilter: '||bidder.criteo.com^',
            resourceTypes: ['script', 'xmlhttprequest', 'sub_frame']
          }
        },
        // Block Spotify ads API
        {
          id: 50020,
          priority: 3,
          action: { type: 'block' },
          condition: {
            urlFilter: '||api.spotify.com/v1/ads^',
            resourceTypes: ['xmlhttprequest']
          }
        }
      ];

      await chrome.declarativeNetRequest.updateSessionRules({ addRules: sessionRules });
      console.log(`🔒 ${sessionRules.length} session rules applied`);

    } catch (error) {
      console.warn('Session rules (possibly unsupported in this browser):', error.message);
    }
  }

  /**
   * Clear all ad-blocking rules (dynamic and session).
   */
  async clearRules() {
    try {
      // Clear dynamic rules including custom filters (ID range 2001+)
      const allDynamic = await chrome.declarativeNetRequest.getDynamicRules();
      const ids = allDynamic.map(r => r.id).filter(id => id >= 2001);
      if (ids.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ids });
      }

      // Clear session rules
      const session = await chrome.declarativeNetRequest.getSessionRules();
      if (session.length > 0) {
        await chrome.declarativeNetRequest.updateSessionRules({
          removeRuleIds: session.map(r => r.id)
        });
      }
      this.activeRules = [];
      console.log('🗑️ Ad blocker rules cleared');
    } catch (error) {
      console.error('❌ Failed to clear DNR rules:', error);
    }
  }

  /**
   * Add a user-defined custom rule (block by URL pattern).
   * Custom rules are stored in ID range 20001+.
   */
  async addCustomRule(rule) {
    const customRule = {
      id: this.dynamicRulesetId++,
      priority: 5,
      action: { type: 'block' },
      condition: {
        urlFilter: rule.filter,
        resourceTypes: rule.resourceTypes || ['script', 'image', 'xmlhttprequest', 'sub_frame']
      }
    };

    await chrome.declarativeNetRequest.updateDynamicRules({ addRules: [customRule] });
    await this.saveCustomRule(rule);
    console.log(`✅ Custom rule added: ${rule.filter}`);
  }

  /**
   * Persist a custom rule to storage.
   */
  async saveCustomRule(rule) {
    const result = await chrome.storage.local.get('customFilters');
    const customFilters = Array.isArray(result.customFilters) ? result.customFilters : [];
    customFilters.push(rule);
    await chrome.storage.local.set({ customFilters });
  }

  /**
   * Reload custom rules from storage after a service worker restart.
   */
  async reloadCustomRules() {
    const result = await chrome.storage.local.get('customFilters');
    const customFilters = Array.isArray(result.customFilters) ? result.customFilters : [];
    for (const rule of customFilters) {
      try {
        const dnrRule = {
          id: this.dynamicRulesetId++,
          priority: 5,
          action: { type: 'block' },
          condition: {
            urlFilter: rule.filter || rule,
            resourceTypes: rule.resourceTypes || ['script', 'image', 'xmlhttprequest', 'sub_frame']
          }
        };
        await chrome.declarativeNetRequest.updateDynamicRules({ addRules: [dnrRule] });
      } catch (e) {
        // Rule might already exist
      }
    }
  }
}
