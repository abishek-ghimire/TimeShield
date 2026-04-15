// Shared storage management utility
export class StorageManager {
  static async get(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, resolve);
    });
  }

  static async set(data) {
    return new Promise((resolve) => {
      chrome.storage.local.set(data, resolve);
    });
  }

  static async updateAdStats(stats) {
    const current = await this.get('adBlockStats');
    const updated = {
      adsBlocked: (current.adBlockStats?.adsBlocked || 0) + (stats.adsBlocked || 0),
      bandwidthSaved: (current.adBlockStats?.bandwidthSaved || 0) + (stats.bandwidthSaved || 0),
      timeSaved: (current.adBlockStats?.timeSaved || 0) + (stats.timeSaved || 0)
    };
    await this.set({ adBlockStats: updated });
    return updated;
  }

  static async getFilterLists() {
    const data = await this.get('filterLists');
    return data.filterLists || {};
  }

  static async saveFilterLists(lists) {
    await this.set({ filterLists: lists });
  }

  static async getCustomFilters() {
    const data = await this.get('customFilters');
    return data.customFilters || [];
  }

  static async addCustomFilter(filter) {
    const filters = await this.getCustomFilters();
    filters.push(filter);
    await this.set({ customFilters: filters });
    return filters;
  }

  static async removeCustomFilter(index) {
    const filters = await this.getCustomFilters();
    filters.splice(index, 1);
    await this.set({ customFilters: filters });
    return filters;
  }

  static async getWhitelist() {
    const data = await this.get('whitelist');
    return data.whitelist || [];
  }

  static async isWhitelisted(domain) {
    const whitelist = await this.getWhitelist();
    return whitelist.some(site => domain.includes(site));
  }

  static getDefaultBlockedSites() {
    return [
      'facebook.com',
      'twitter.com',
      'instagram.com',
      'youtube.com',
      'reddit.com',
      'netflix.com'
    ];
  }
}
