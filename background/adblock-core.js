// Main ad blocking engine
export class AdBlockEngine {
  constructor(manager) {
    this.manager = manager;
    this.activeRules = [];
    this.strictMode = false;
    this.dynamicRulesetId = 1;
  }
  
  async applyRules(rules) {
    try {
      // Remove old rules
      const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
      const oldRuleIds = oldRules.map(rule => rule.id);
      
      if (oldRuleIds.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: oldRuleIds
        });
      }
      
      // Add new rules (limit to 5000)
      const rulesToAdd = rules.slice(0, 5000);
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: rulesToAdd
      });
      
      this.activeRules = rulesToAdd;
      
    } catch (error) {
      console.error('Failed to apply DNR rules:', error);
    }
  }
  
  async enableStrictMode() {
    this.strictMode = true;
    
    // Create strict rules (block more resources)
    const strictRules = this.createStrictRules();
    
    // Apply as session rules (temporary)
    await chrome.declarativeNetRequest.updateSessionRules({
      addRules: strictRules
    });
  }
  
  async disableStrictMode() {
    this.strictMode = false;
    
    // Remove all session rules
    const sessionRules = await chrome.declarativeNetRequest.getSessionRules();
    const sessionRuleIds = sessionRules.map(rule => rule.id);
    
    if (sessionRuleIds.length > 0) {
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: sessionRuleIds
      });
    }
  }
  
  createStrictRules() {
    // Block additional resource types during focus mode
    return [
      {
        id: 10001,
        priority: 2,
        action: { type: 'block' },
        condition: {
          resourceTypes: ['script', 'image', 'stylesheet', 'font', 'media'],
          domainType: 'thirdParty'
        }
      },
      {
        id: 10002,
        priority: 2,
        action: { type: 'block' },
        condition: {
          urlFilter: '||doubleclick.net',
          resourceTypes: ['script', 'image', 'xmlhttprequest']
        }
      }
    ];
  }
  
  async addCustomRule(rule) {
    const customRule = {
      id: this.dynamicRulesetId++,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: rule.filter,
        resourceTypes: rule.resourceTypes || ['script', 'image', 'xmlhttprequest']
      }
    };
    
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [customRule]
    });
    
    // Save to custom filters
    await this.saveCustomRule(rule);
  }
  
  async saveCustomRule(rule) {
    const { customFilters } = await chrome.storage.local.get('customFilters') || { customFilters: [] };
    customFilters.push(rule);
    await chrome.storage.local.set({ customFilters });
  }
}
