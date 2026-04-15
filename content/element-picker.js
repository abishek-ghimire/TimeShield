// Element picker tool for users to block elements
class ElementPicker {
  constructor() {
    this.active = false;
    this.highlightedElement = null;
    this.setupListeners();
  }
  
  setupListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'startElementPicker') {
        this.startPicker();
        sendResponse({ success: true });
      }
    });
  }
  
  startPicker() {
    if (this.active) return;
    
    this.active = true;
    
    // Add picker UI
    this.createPickerUI();
    
    // Add event listeners
    document.addEventListener('mouseover', this.onMouseOver.bind(this));
    document.addEventListener('mouseout', this.onMouseOut.bind(this));
    document.addEventListener('click', this.onClick.bind(this), true);
    
    // Change cursor
    document.body.style.cursor = 'crosshair';
  }
  
  stopPicker() {
    this.active = false;
    
    // Remove highlight
    if (this.highlightedElement) {
      this.highlightedElement.style.outline = '';
    }
    
    // Remove listeners
    document.removeEventListener('mouseover', this.onMouseOver.bind(this));
    document.removeEventListener('mouseout', this.onMouseOut.bind(this));
    document.removeEventListener('click', this.onClick.bind(this), true);
    
    // Remove UI
    const ui = document.getElementById('element-picker-ui');
    if (ui) ui.remove();
    
    // Reset cursor
    document.body.style.cursor = '';
  }
  
  createPickerUI() {
    const ui = document.createElement('div');
    ui.id = 'element-picker-ui';
    ui.innerHTML = `
      <div style="position:fixed; top:10px; left:50%; transform:translateX(-50%); 
                  background:#333; color:white; padding:10px 20px; border-radius:5px; 
                  z-index:999999; font-family:Arial; box-shadow:0 2px 10px rgba(0,0,0,0.3);">
        Click on an element to block it (Esc to cancel)
      </div>
    `;
    document.body.appendChild(ui);
  }
  
  onMouseOver(event) {
    if (!this.active) return;
    
    const element = event.target;
    
    // Remove previous highlight
    if (this.highlightedElement) {
      this.highlightedElement.style.outline = '';
    }
    
    // Highlight new element
    element.style.outline = '2px solid #ff4444';
    this.highlightedElement = element;
  }
  
  onMouseOut(event) {
    if (!this.active || !this.highlightedElement) return;
    
    this.highlightedElement.style.outline = '';
    this.highlightedElement = null;
  }
  
  onClick(event) {
    event.preventDefault();
    event.stopPropagation();
    
    if (!this.active) return;
    
    const element = event.target;
    
    // Generate selector
    const selector = this.generateSelector(element);
    
    // Show block confirmation
    this.showBlockDialog(selector, element);
  }
  
  generateSelector(element) {
    // Simple ID selector if available
    if (element.id) {
      return `#${element.id}`;
    }
    
    // Class-based selector
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.split(' ').filter(c => c.trim());
      if (classes.length > 0) {
        return '.' + classes.join('.');
      }
    }
    
    // Tag + attributes
    const tag = element.tagName.toLowerCase();
    const attributes = [];
    
    if (element.getAttribute('src')) {
      attributes.push(`[src*="${element.getAttribute('src').substring(0, 20)}"]`);
    }
    
    if (element.getAttribute('href')) {
      attributes.push(`[href*="${element.getAttribute('href').substring(0, 20)}"]`);
    }
    
    return tag + attributes.join('');
  }
  
  showBlockDialog(selector, element) {
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
      background:white; padding:20px; border-radius:8px; 
      box-shadow:0 4px 20px rgba(0,0,0,0.3); z-index:1000000;
      font-family:Arial; min-width:300px;
    `;
    
    dialog.innerHTML = `
      <h3 style="margin-top:0; color:#333;">Block Element</h3>
      <p style="color:#666; font-size:14px;">Selector: <code>${selector}</code></p>
      <div style="margin:15px 0;">
        <label style="display:block; margin-bottom:5px; color:#333;">Block on:</label>
        <select id="block-scope" style="width:100%; padding:5px;">
          <option value="domain">This website only</option>
          <option value="global">All websites</option>
        </select>
      </div>
      <div style="display:flex; gap:10px; justify-content:flex-end;">
        <button id="cancel-block" style="padding:5px 15px; background:#ccc; border:none; border-radius:3px; cursor:pointer;">Cancel</button>
        <button id="confirm-block" style="padding:5px 15px; background:#ff4444; color:white; border:none; border-radius:3px; cursor:pointer;">Block Element</button>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    // Handle buttons
    document.getElementById('cancel-block').onclick = () => {
      dialog.remove();
      this.stopPicker();
    };
    
    document.getElementById('confirm-block').onclick = () => {
      const scope = document.getElementById('block-scope').value;
      
      // Send to background
      chrome.runtime.sendMessage({
        action: 'blockElement',
        selector: selector,
        domain: scope === 'domain' ? window.location.hostname : '*'
      });
      
      // Hide element immediately
      element.style.setProperty('display', 'none', 'important');
      
      dialog.remove();
      this.stopPicker();
    };
    
    // Handle Escape key
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        dialog.remove();
        document.removeEventListener('keydown', onKeyDown);
        this.stopPicker();
      }
    };
    document.addEventListener('keydown', onKeyDown);
  }
}

// Initialize
new ElementPicker();
