/**
 * RTL Helper Utility
 * 
 * Provides utilities for detecting and handling right-to-left languages
 * in the Apple Home Dashboard.
 */

// List of RTL language codes
const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur', 'yi', 'ku', 'dv'];

export type RTLChangeCallback = (isRTL: boolean, language: string) => void;

/**
 * Detect if the current language is RTL based on Home Assistant locale
 * or browser language
 */
export class RTLHelper {
  private static _isRTL: boolean | null = null;
  private static _currentLanguage: string | null = null;
  private static _listeners: Set<RTLChangeCallback> = new Set();
  private static _lastHass: any = null;

  /**
   * Add a listener for RTL/language changes
   */
  static addListener(callback: RTLChangeCallback): void {
    this._listeners.add(callback);
  }

  /**
   * Remove a listener
   */
  static removeListener(callback: RTLChangeCallback): void {
    this._listeners.delete(callback);
  }

  /**
   * Notify all listeners of RTL change
   */
  private static notifyListeners(): void {
    const isRTL = this._isRTL || false;
    const language = this._currentLanguage || 'en';
    
    this._listeners.forEach(callback => {
      try {
        callback(isRTL, language);
      } catch (error) {
        console.error('Apple Home Dashboard: Error in RTL change listener:', error);
      }
    });
  }

  /**
   * Initialize RTL detection from Home Assistant
   * Returns true if direction changed
   */
  static initialize(hass?: any): boolean {
    const previousIsRTL = this._isRTL;
    const previousLanguage = this._currentLanguage;
    
    let lang = 'en';
    let isRTL = false;

    // Store hass reference for update checks
    this._lastHass = hass;

    // Try to get RTL info from Home Assistant translation metadata
    if (hass?.localize?.translationMetadata?.translations) {
      const currentLang = hass.locale?.language || hass.language || 'en';
      const translationData = hass.localize.translationMetadata.translations[currentLang];
      
      if (translationData?.isRTL !== undefined) {
        isRTL = translationData.isRTL;
        lang = currentLang;
      }
    }
    
    // Fallback to manual detection if HA doesn't provide RTL info
    if (!isRTL && hass) {
      lang = hass.locale?.language || hass.language || navigator.language.split('-')[0] || 'en';
      isRTL = RTL_LANGUAGES.includes(lang);
    }

    // Fallback to browser language
    if (!hass) {
      lang = navigator.language.split('-')[0] || 'en';
      isRTL = RTL_LANGUAGES.includes(lang);
    }

    this._isRTL = isRTL;
    this._currentLanguage = lang;

    // Set document direction if RTL
    this.updateDocumentDirection();

    // Check if direction or language changed
    const directionChanged = previousIsRTL !== null && previousIsRTL !== isRTL;
    const languageChanged = previousLanguage !== null && previousLanguage !== lang;
    
    if (directionChanged || languageChanged) {
      this.notifyListeners();
    }

    return directionChanged;
  }

  /**
   * Check for language changes and update if needed
   * Returns true if direction changed
   */
  static checkForChanges(hass?: any): boolean {
    const hassToUse = hass || this._lastHass;
    if (!hassToUse) return false;

    const previousIsRTL = this._isRTL;
    const previousLanguage = this._currentLanguage;
    
    // Re-initialize with current hass
    this.initialize(hassToUse);
    
    // Return true if direction changed
    return previousIsRTL !== this._isRTL || previousLanguage !== this._currentLanguage;
  }

  /**
   * Check if current language is RTL
   */
  static isRTL(): boolean {
    if (this._isRTL === null) {
      this.initialize();
    }
    return this._isRTL || false;
  }

  /**
   * Get current language code
   */
  static getCurrentLanguage(): string {
    if (this._currentLanguage === null) {
      this.initialize();
    }
    return this._currentLanguage || 'en';
  }

  /**
   * Update document direction attribute
   */
  static updateDocumentDirection(): void {
    const isRTL = this.isRTL();
    
    // Set on document element
    document.documentElement.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
    
    // Also set on body for extra compatibility
    document.body.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
    
    // Add class to document for CSS targeting
    document.documentElement.classList.toggle('rtl', isRTL);
    document.documentElement.classList.toggle('ltr', !isRTL);
  }

  /**
   * Get appropriate icon for back/forward navigation based on RTL
   */
  static getBackIcon(): string {
    return this.isRTL() ? 'mdi:chevron-right' : 'mdi:chevron-left';
  }

  /**
   * Get appropriate icon for forward/next navigation based on RTL
   */
  static getForwardIcon(): string {
    return this.isRTL() ? 'mdi:chevron-left' : 'mdi:chevron-right';
  }

  /**
   * Get appropriate positioning for dropdowns and popovers
   */
  static getDropdownAlignment(): 'left' | 'right' {
    return this.isRTL() ? 'left' : 'right';
  }

  /**
   * Get logical CSS property names based on RTL direction
   */
  static getLogicalProperty(property: string): string {
    if (!this.isRTL()) {
      return property;
    }

    // Map physical properties to logical ones for RTL
    const rtlPropertyMap: Record<string, string> = {
      'left': 'right',
      'right': 'left',
      'margin-left': 'margin-right',
      'margin-right': 'margin-left',
      'padding-left': 'padding-right',
      'padding-right': 'padding-left',
      'border-left': 'border-right',
      'border-right': 'border-left',
      'text-align: left': 'text-align: right',
      'text-align: right': 'text-align: left',
      'float: left': 'float: right',
      'float: right': 'float: left'
    };

    return rtlPropertyMap[property] || property;
  }

  /**
   * Apply RTL-aware inline styles to an element
   */
  static applyRTLStyles(element: HTMLElement, styles: Record<string, string>): void {
    Object.entries(styles).forEach(([property, value]) => {
      const logicalProperty = this.getLogicalProperty(property);
      (element.style as any)[logicalProperty] = value;
    });
  }

  /**
   * Get direction-aware transform for positioning
   */
  static getDirectionalTransform(x: number, y: number = 0): string {
    const adjustedX = this.isRTL() ? -x : x;
    return `translate(${adjustedX}px, ${y}px)`;
  }
}
