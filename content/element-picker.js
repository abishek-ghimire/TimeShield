// Element picker tool for users to block elements
class ElementPicker {
  constructor() {
    this.active = false;
    this.highlightedElement = null;
    // Store bound handlers as instance properties so removeEventListener works correctly
    this._onMouseOver = this.onMouseOver.bind(this);
    this._onMouseOut = this.onMouseOut.bind(this);
    this._onClick = this.onClick.bind(this);
    this._onKeyDown = this.onKeyDown.bind(this);
    this.setupListeners();
  }

  setupListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'startElementPicker') {
        this.startPicker();
        sendResponse({ success: true });
      }
      return true;
    });
  }

  startPicker() {
    if (this.active) return;
    this.active = true;

    this.createPickerUI();

    document.addEventListener('mouseover', this._onMouseOver);
    document.addEventListener('mouseout', this._onMouseOut);
    document.addEventListener('click', this._onClick, true);
    document.addEventListener('keydown', this._onKeyDown);

    document.body.style.cursor = 'crosshair';
  }

  stopPicker() {
    this.active = false;

    if (this.highlightedElement) {
      this.highlightedElement.style.outline = '';
      this.highlightedElement = null;
    }

    document.removeEventListener('mouseover', this._onMouseOver);
    document.removeEventListener('mouseout', this._onMouseOut);
    document.removeEventListener('click', this._onClick, true);
    document.removeEventListener('keydown', this._onKeyDown);

    const ui = document.getElementById('element-picker-ui');
    if (ui) ui.remove();

    document.body.style.cursor = '';
  }

  createPickerUI() {
    const existing = document.getElementById('element-picker-ui');
    if (existing) existing.remove();

    const ui = document.createElement('div');
    ui.id = 'element-picker-ui';
    ui.innerHTML = `
      <div style="
        position: fixed;
        top: 16px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(15,23,42,0.9);
        color: white;
        padding: 12px 24px;
        border-radius: 100px;
        z-index: 2147483647;
        font-family: 'Inter', -apple-system, sans-serif;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 8px 30px rgba(0,0,0,0.4);
        border: 1px solid rgba(255,255,255,0.1);
        backdrop-filter: blur(12px);
        display: flex;
        align-items: center;
        gap: 10px;
      ">
        <span style="font-size:18px;">🎯</span>
        Click any element to block it &nbsp;<kbd style="background:rgba(255,255,255,0.1); border-radius:4px; padding:2px 6px; font-size:12px;">Esc</kbd> to cancel
      </div>
    `;
    document.body.appendChild(ui);
  }

  onMouseOver(event) {
    if (!this.active) return;

    if (this.highlightedElement) {
      this.highlightedElement.style.outline = '';
    }

    const el = event.target;
    el.style.outline = '2px solid #f43f5e';
    el.style.outlineOffset = '2px';
    this.highlightedElement = el;
  }

  onMouseOut(event) {
    if (!this.active || !this.highlightedElement) return;
    this.highlightedElement.style.outline = '';
    this.highlightedElement.style.outlineOffset = '';
    this.highlightedElement = null;
  }

  onClick(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!this.active) return;

    const element = event.target;
    const selector = this.generateSelector(element);

    this.showBlockDialog(selector, element);
  }

  onKeyDown(event) {
    if (event.key === 'Escape') {
      this.stopPicker();
    }
  }

  generateSelector(element) {
    // Best: ID
    if (element.id) {
      return `#${CSS.escape(element.id)}`;
    }

    // Class-based (skip dynamic/generic single-char classes)
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.trim().split(/\s+/).filter(c => c.length > 2);
      if (classes.length > 0) {
        return '.' + classes.map(c => CSS.escape(c)).join('.');
      }
    }

    // Tag + src/href attributes
    const tag = element.tagName.toLowerCase();
    const attrs = [];

    const src = element.getAttribute('src');
    if (src) attrs.push(`[src*="${src.substring(0, 30)}"]`);

    const href = element.getAttribute('href');
    if (href) attrs.push(`[href*="${href.substring(0, 30)}"]`);

    return tag + attrs.join('');
  }

  showBlockDialog(selector, element) {
    // Remove existing dialog
    const old = document.getElementById('element-picker-dialog');
    if (old) old.remove();

    const dialog = document.createElement('div');
    dialog.id = 'element-picker-dialog';
    dialog.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(15,23,42,0.97);
      color: white;
      padding: 28px;
      border-radius: 20px;
      border: 1px solid rgba(255,255,255,0.1);
      box-shadow: 0 25px 50px rgba(0,0,0,0.5);
      z-index: 2147483647;
      font-family: 'Inter', -apple-system, sans-serif;
      min-width: 340px;
      backdrop-filter: blur(16px);
    `;

    dialog.innerHTML = `
      <h3 style="margin:0 0 8px; font-size:16px; font-weight:600;">Block Element</h3>
      <p style="color:#94a3b8; font-size:13px; margin:0 0 16px;">Selector: <code style="background:rgba(255,255,255,0.05); padding:2px 6px; border-radius:4px; font-size:12px;">${selector}</code></p>
      <div style="margin-bottom:16px;">
        <label style="display:block; margin-bottom:6px; color:#94a3b8; font-size:13px;">Apply to:</label>
        <select id="picker-block-scope" style="width:100%; padding:10px; border-radius:10px; border: 1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.05); color:white; font-size:13px;">
          <option value="domain">This website only</option>
          <option value="global">All websites</option>
        </select>
      </div>
      <div style="display:flex; gap:10px; justify-content:flex-end;">
        <button id="picker-cancel" style="padding:10px 18px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:10px; color:white; cursor:pointer; font-size:13px;">Cancel</button>
        <button id="picker-confirm" style="padding:10px 18px; background:#f43f5e; border:none; border-radius:10px; color:white; cursor:pointer; font-size:13px; font-weight:600;">Block</button>
      </div>
    `;

    document.body.appendChild(dialog);

    document.getElementById('picker-cancel').onclick = () => {
      dialog.remove();
      this.stopPicker();
    };

    document.getElementById('picker-confirm').onclick = () => {
      const scope = document.getElementById('picker-block-scope').value;

      chrome.runtime.sendMessage({
        action: 'blockElement',
        selector: selector,
        domain: scope === 'domain' ? window.location.hostname : '*'
      });

      // Immediately hide the element
      element.style.setProperty('display', 'none', 'important');

      dialog.remove();
      this.stopPicker();
    };
  }
}

// Initialize once
new ElementPicker();
