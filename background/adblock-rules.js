// Convert filters to DNR rules
export class RuleCompiler {
  constructor() {
    this.ruleId = 1;
    this.maxRules = 5000;
  }
  
  async compile(filters) {
    const rules = [];
    
    // Process network filters
    for (const filter of filters) {
      if (filter.type === 'network' && rules.length < this.maxRules) {
        const rule = this.convertToDNR(filter.rule);
        if (rule) {
          rule.id = this.ruleId++;
          rules.push(rule);
        }
      }
    }
    
    return rules;
  }
  
  convertToDNR(filter) {
    try {
      // Handle different filter patterns
      if (filter.startsWith('||')) {
        // Domain filter: ||example.com^
        return this.createDomainRule(filter.slice(2));
      } else if (filter.startsWith('|')) {
        // Exact URL filter: |https://example.com/ad.js
        return this.createExactRule(filter.slice(1, -1));
      } else if (filter.startsWith('@@')) {
        // Exception rule: @@||example.com^
        return this.createExceptionRule(filter.slice(2));
      } else if (filter.includes('*')) {
        // Wildcard filter: */ad/*
        return this.createWildcardRule(filter);
      } else {
        // Generic filter: /ad.js
        return this.createGenericRule(filter);
      }
    } catch (error) {
      return null;
    }
  }
  
  createDomainRule(domain) {
    // Remove trailing ^ if present
    domain = domain.replace(/\^$/, '');
    
    return {
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: `||${domain}^`,
        resourceTypes: ['script', 'image', 'stylesheet', 'font', 'media', 'xmlhttprequest', 'sub_frame']
      }
    };
  }
  
  createExactRule(url) {
    return {
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: `|${url}|`,
        resourceTypes: ['script', 'image', 'xmlhttprequest']
      }
    };
  }
  
  createExceptionRule(filter) {
    return {
      priority: 2, // Higher priority to override blocks
      action: { type: 'allow' },
      condition: {
        urlFilter: filter,
        resourceTypes: ['script', 'image', 'stylesheet', 'font', 'media', 'xmlhttprequest', 'sub_frame']
      }
    };
  }
  
  createWildcardRule(filter) {
    return {
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: filter.replace(/\*/g, '*'),
        resourceTypes: ['script', 'image', 'xmlhttprequest']
      }
    };
  }
  
  createGenericRule(filter) {
    return {
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: filter,
        resourceTypes: ['script', 'image', 'xmlhttprequest']
      }
    };
  }
  
  // Group similar rules to save space
  optimizeRules(rules) {
    const optimized = [];
    const domainMap = new Map();
    
    // Group by domain
    for (const rule of rules) {
      if (rule.condition.urlFilter && rule.condition.urlFilter.startsWith('||')) {
        const domain = rule.condition.urlFilter.slice(2);
        if (!domainMap.has(domain)) {
          domainMap.set(domain, []);
        }
        domainMap.get(domain).push(rule);
      } else {
        optimized.push(rule);
      }
    }
    
    // Merge rules for same domain
    for (const [domain, domainRules] of domainMap) {
      if (domainRules.length > 1) {
        // Create single rule with multiple resource types
        const resourceTypes = new Set();
        for (const rule of domainRules) {
          rule.condition.resourceTypes.forEach(rt => resourceTypes.add(rt));
        }
        
        optimized.push({
          id: this.ruleId++,
          priority: 1,
          action: { type: 'block' },
          condition: {
            urlFilter: `||${domain}^`,
            resourceTypes: Array.from(resourceTypes)
          }
        });
      } else {
        optimized.push(domainRules[0]);
      }
    }
    
    return optimized;
  }
}
