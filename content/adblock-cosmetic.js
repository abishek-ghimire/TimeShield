/**
 * SurgicalCosmeticFilter — SAFE Rule System
 *
 * S — Block Sponsored markers (aria-label="Sponsored", data-ad*)
 * A — Block Ad domains / iframes (googleads, doubleclick, etc.)
 * F — Filter precisely, not broadly (never div[class*="text"])
 * E — Exclude ALL user text containers (post bodies, captions, comments)
 *
 * Facebook/Instagram/Twitter captions will NEVER be blocked because:
 *  1. Social media post containers are always whitelisted by role/testid/class
 *  2. Elements with meaningful user text (> 30 chars) are always skipped
 *  3. The ad score threshold requires 2+ HARD signals, not just class names
 *  4. Class/ID name matching is disabled — it was the primary source of false positives
 */
class SurgicalCosmeticFilter {
  constructor() {
    // ── Hard Ad Signals (each = 1 point unless noted) ──────────────────────
    // These are clear, unambiguous indicators of an advertisement.
    this.adAriaLabels = [
      'sponsored', 'advertisement', 'ad', 'promoted post', 'promoted'
    ];

    // Known ad-network iframe src patterns (Verified Domains)
    this.adIframeSrcs = [
      'googleads.g.doubleclick.net', 'googlesyndication.com',
      'adnxs.com', 'taboola.com', 'outbrain.com', 'rubiconproject.com',
      'media.net', 'smartadserver.com', 'criteo.com', 'amazon-adsystem.com'
    ];

    // Verified data attributes that only appear on actual ad slots
    this.adDataAttrs = [
      'data-ad-slot', 'data-ad-client', 'data-ad-unit',
      'data-ad-format', 'data-ad', 'data-sponsored', 'data-promoted',
      'data-revive-zoneid', 'data-dfp-ad', 'data-google-av-cxn'
    ];

    // ── Whitelist: NEVER block these ───────────────────────────────────────
    // Role attributes that indicate user-facing content
    this.safeRoles = [
      'article', 'main', 'complementary', 'contentinfo',
      'feed', 'listitem', 'comment', 'region', 'document'
    ];

    // Facebook/Instagram/Threads specific test IDs and classes
    // These are used for posts, captions, comments — NEVER ads
    this.fbSafeSelectors = [
      // Facebook post containers and captions (Comet UI)
      '[data-testid="post_message"]',
      '[data-testid="comment_body"]',
      '[data-testid="story-subtitle"]',
      '[data-testid="react-composer-root"]',
      '[data-ad-preview="message"]',          // FB post preview
      'div[dir="auto"]',                      // Standard FB post text container
      'span[dir="auto"]',
      '.x1hc1f62',                            // FB post text styling classes
      '.x78zum5',
      '.x1jx94hy',
      '[role="article"]',                     // VERY IMPORTANT: Posts are articles
      '[aria-posinset]',                      // Feed items
      '[data-pagelet]',                       // FB page sections
      '.userContent',
      '.userContentWrapper',
      '.commentable_item',
      '.UFIComment',
      // Instagram
      '[data-testid="caption"]',
      '._aagv',
      // Twitter/X
      '[data-testid="tweetText"]',
      '[data-testid="tweet"]',
      // Generic post/comment indicators
      '[aria-label*="comment"]',
      '[aria-label*="post"]',
      '[aria-label*="caption"]',
      '[aria-label*="description"]'
    ];

    // Minimum text length — elements with this much user text are NEVER blocked
    // Increased to 40 to better protect user captions, bios, and descriptions
    this.MIN_SAFE_TEXT = 40;

    this.isEnabled = false;
    this.externalSelectors = new Set();
    this.init();
  }

  async init() {
    // 1. Initial state check
    const result = await chrome.storage.local.get(['adBlockEnabled']);
    this.isEnabled = result.adBlockEnabled === true; // Default to disabled

    if (this.isEnabled) {
      this.toggleBodyClass(true);
      this.startFiltering();
      this.loadCustomFilters();
    }

    // 2. Listen for toggle changes
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.adBlockEnabled) {
        this.isEnabled = changes.adBlockEnabled.newValue !== false;
        this.toggleBodyClass(this.isEnabled);
        if (this.isEnabled) {
          this.startFiltering();
        } else {
          this.restoreAll();
        }
      }
    });
  }

  toggleBodyClass(enabled) {
    if (document.body) {
      if (enabled) {
        document.body.classList.add('ts-adblock-active');
      } else {
        document.body.classList.remove('ts-adblock-active');
      }
    } else {
      document.addEventListener('DOMContentLoaded', () => this.toggleBodyClass(enabled));
    }
  }

  startFiltering() {
    // Delay initial scan slightly so the DOM has settled
    if (document.body) {
      setTimeout(() => this.scanAndBlock(), 500);
      // Periodic recovery scan: if something safe was hidden, re-show it
      if (!this.recoveryInterval) {
        this.recoveryInterval = setInterval(() => this.recoverSafeElements(), 1500);
      }
    }
    if (!this.observer) {
      this.setupObserver();
    }
  }

  restoreAll() {
    // 1. Unhide all elements blocked by JS
    const blocked = document.querySelectorAll('[data-ts-blocked="true"]');
    blocked.forEach(el => {
      el.style.display = '';
      el.removeAttribute('data-ts-blocked');
    });

    // 2. Remove cosmetic style tag if it exists
    const style = document.getElementById('ts-cosmetic-rules');
    if (style) style.remove();

    this.toggleBodyClass(false);

    // 3. Stop observation
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.recoveryInterval) {
      clearInterval(this.recoveryInterval);
      this.recoveryInterval = null;
    }
  }

  async loadCustomFilters() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getCosmeticFilters',
        domain: window.location.hostname
      });
      if (response && Array.isArray(response)) {
        this.applyCustomRules(response);
      }
    } catch (e) {
      console.warn('TimeShield: Could not load custom filters');
    }
  }

  applyCustomRules(rules) {
    if (!rules || !Array.isArray(rules)) return;

    // Add these rules to our internal list for surgical scanning
    for (const rule of rules) {
      const selector = rule.selector;
      if (selector && !this.isDangerousSelector(selector)) {
        this.externalSelectors.add(selector.trim());
      }
    }

    // Run an immediate scan with new rules
    this.scanAndBlock();
  }

  isDangerousSelector(selector) {
    if (!selector || selector.length > 500) return true;
    const unsafePatterns = [
      /\[class\*=["']?(text|content|body|container|wrapper|description|caption|message|post|comment|article|story|feed|timeline|user|author)\b/i,
      /\[role=["']?(article|main|feed|listitem|comment|region|document|complementary|contentinfo|navigation)["']?\]/i,
      /\b(post|comment|story|feed|main|body|text|content|nav|menu)\b/i,
      /^(div|span|p|section|article|aside|main)$/
    ];
    return unsafePatterns.some(p => p.test(selector));
  }

  setupObserver() {
    this.observer = new MutationObserver((mutations) => {
      if (!this.isEnabled) return;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            // If the element is part of a post, skip it entirely
            if (node.closest('[role="article"], [data-testid="post_message"]')) continue;

            // Small delay so FB/IG can finish rendering
            setTimeout(() => this.processElement(node), 200);
          }
        }
      }
    });

    this.observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  scanAndBlock() {
    // Combine base surgical selectors with external ones
    const baseList = [
      'ins', 'iframe', '[data-ad-slot]', '[data-ad-client]',
      '[data-ad-unit]', '[data-ad-format]', '[data-revive-zoneid]',
      '[data-sponsored]', '[aria-label="Sponsored"]',
      '[aria-label="Sponsored content"]', 'shreddit-ad-post',
      'ytd-ad-slot-renderer', 'ytd-companion-slot-renderer',
      '[id^="google_ads_"]', '[id^="div-gpt-ad"]'
    ];

    const combinedSelector = [...new Set([...baseList, ...this.externalSelectors])].join(',');

    try {
      const candidates = document.querySelectorAll(combinedSelector);
      candidates.forEach(el => this.processElement(el));
    } catch (e) {
      // Fallback if combined selector is invalid
      baseList.forEach(s => document.querySelectorAll(s).forEach(el => this.processElement(el)));
    }
  }

  processElement(el) {
    if (!el || !el.isConnected) return;
    if (el.getAttribute('data-ts-blocked') === 'true') return;

    // ── 1. Fast-path: always-safe checks ─────────────────────────────────
    if (this.isDefinitelySafe(el)) return;

    const score = this.calculateAdScore(el);
    if (score >= 3 || this.isKnownAdElement(el)) {
      this.hideElement(el);
    }
  }

  /**
   * Periodically check if any safe element was hidden (e.g., by CSS filters)
   * and force it to be visible.
   */
  recoverSafeElements() {
    const safeSelector = this.fbSafeSelectors.join(',');
    try {
      const candidates = document.querySelectorAll(safeSelector);
      candidates.forEach(el => {
        if (window.getComputedStyle(el).display === 'none') {
          // If we didn't block it ourselves, it might be an external filter
          if (el.getAttribute('data-ts-blocked') !== 'true') {
            el.style.setProperty('display', 'block', 'important');
            el.style.setProperty('visibility', 'visible', 'important');
            el.style.setProperty('opacity', '1', 'important');
          }
        }
      });
    } catch (e) { }
  }

  /**
   * Returns true if this element should NEVER be blocked.
   */
  isDefinitelySafe(el) {
    // a) Already hidden by us — skip
    if (el.getAttribute('data-ts-blocked') === 'true') return true;

    // b) ARIA roles that indicate user content
    const role = el.getAttribute('role');
    if (role && this.safeRoles.includes(role)) return true;

    // c) Contenteditable — user is typing in this
    if (el.isContentEditable) return true;

    // d) Social-media post/comment/caption/article selectors
    try {
      if (el.matches(this.fbSafeSelectors.join(','))) return true;
      // CRITICAL: If inside an article (post), it's safe
      if (el.closest('[role="article"]')) return true;
    } catch (e) { }

    // e) Any ancestor is a safe selector
    try {
      if (el.closest(this.fbSafeSelectors.join(','))) return true;
    } catch (e) { }

    // f) Element contains substantial user-generated text
    const text = el.textContent || '';
    if (text.trim().length > this.MIN_SAFE_TEXT) {
      const hasHardSignal = this.hasImmediateAdSignal(el);
      if (!hasHardSignal) return true;
    }

    return false;
  }

  /**
   * Checks for the single strongest signal.
   */
  hasImmediateAdSignal(el) {
    // aria-label exactly matches a sponsored label
    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
    for (const label of this.adAriaLabels) {
      if (ariaLabel === label) return true;
    }
    // Verified ad data attribute present
    for (const attr of this.adDataAttrs) {
      if (el.hasAttribute(attr)) return true;
    }
    return false;
  }

  /**
   * Score-based detection — only hard, explicit signals count.
   * Class/ID name fuzzy matching is intentionally EXCLUDED to avoid
   * false-positives on Facebook's minified class names.
   */
  calculateAdScore(el) {
    let score = 0;

    // ── Signal A: Verified ad data attributes (1 pt each, max 2) ──────────
    let attrHits = 0;
    for (const attr of this.adDataAttrs) {
      if (el.hasAttribute(attr)) {
        attrHits++;
        if (attrHits >= 2) break;
      }
    }
    score += Math.min(attrHits, 2);

    // ── Signal B: aria-label exactly matches sponsored label (1.5 pts) ─────
    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase().trim();
    if (this.adAriaLabels.includes(ariaLabel)) score += 1.5;

    // ── Signal C: The element's DIRECT text is ONLY "Sponsored" / "Ad" ─────
    //   (not contained — direct text, so it won't false-positive post bodies)
    const directText = (el.textContent || '').trim();
    if (
      directText === 'Sponsored' ||
      directText === 'Ad' ||
      directText === 'Promoted' ||
      directText === 'Advertisement'
    ) {
      score += 1.5;
    }

    // ── Signal D: Facebook's obfuscated Sponsored label (hidden spans) ─────
    //   FB hides "Sponsored" using a stack of absolutely-positioned spans.
    //   More than 6 such spans inside a small container = strong ad signal.
    const hiddenSpans = el.querySelectorAll('span[style*="position: absolute"]');
    if (hiddenSpans.length > 6) score += 1;

    // ── Signal E: Element ID is an explicit ad slot (1 pt) ─────────────────
    const elId = el.id || '';
    if (
      elId.startsWith('google_ads_') ||
      elId.startsWith('div-gpt-ad') ||
      elId === 'adsbygoogle' ||
      elId.startsWith('taboola-')
    ) {
      score += 1;
    }

    return score;
  }

  /**
   * Absolute-confidence ad elements that don't need scoring.
   */
  isKnownAdElement(el) {
    // AdSense <ins> tags
    if (el.tagName === 'INS' && el.className === 'adsbygoogle') return true;

    // YouTube ad renderers (custom elements)
    if (el.tagName === 'YTD-AD-SLOT-RENDERER') return true;
    if (el.tagName === 'YTD-COMPANION-SLOT-RENDERER') return true;
    if (el.tagName === 'SHREDDIT-AD-POST') return true;

    // Ad-network iframes
    if (el.tagName === 'IFRAME') {
      const src = (el.src || '').toLowerCase();
      return this.adIframeSrcs.some(pattern => src.includes(pattern));
    }

    return false;
  }

  hideElement(el) {
    el.style.setProperty('display', 'none', 'important');
    el.setAttribute('data-ts-blocked', 'true');
  }
}

// Initialize
if (document.body) {
  window.surgicalFilter = new SurgicalCosmeticFilter();
} else {
  document.addEventListener('DOMContentLoaded', () => {
    window.surgicalFilter = new SurgicalCosmeticFilter();
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (window.surgicalFilter) {
    if (message.action === 'refreshFilters') {
      window.surgicalFilter.loadCustomFilters();
      sendResponse({ success: true });
    } else if (message.action === 'applyCosmeticRules' && message.rules) {
      window.surgicalFilter.applyCustomRules(message.rules);
      sendResponse({ success: true });
    }
  }
  return true;
});

