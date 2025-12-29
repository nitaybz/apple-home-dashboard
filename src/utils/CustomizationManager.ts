import { DashboardConfig } from '../config/DashboardConfig';
import { localize } from './LocalizationService';
import { DashboardStateManager } from './DashboardStateManager';

export class CustomizationManager {
  private static instance: CustomizationManager | null = null;
  private customizations: any = { home: {}, pages: {}, ui: {}, background: {} };
  private _hass?: any;
  private isLoaded = false;
  // Track the dashboard key this manager is associated with
  private currentDashboardKey: string | null = null;
  private dashboardStateListener?: (isActive: boolean, dashboardKey?: string | null) => void;

  constructor(hass?: any) {
    this._hass = hass;
    
    // Listen for dashboard activation to load corresponding customizations
    // The DashboardStateManager now properly tracks which dashboards are Apple Home
    this.dashboardStateListener = async (isActive: boolean, dashboardKey?: string | null) => {
      if (isActive && this._hass && dashboardKey) {
        // Check if we're switching between different Apple Home dashboards
        const isSwitchingDashboards = this.currentDashboardKey !== null && 
                                       this.currentDashboardKey !== dashboardKey;
        
        if (isSwitchingDashboards || !this.isLoaded) {
          try {
            this.currentDashboardKey = dashboardKey;
            // Load customizations for the current dashboard key
            const loaded = await this.loadCustomizations();
            await this.setCustomizations(loaded);
            // Trigger global refresh to update UI and background
            this.triggerGlobalDashboardRefresh();
          } catch (err) {
            console.error('Error reloading customizations on dashboard change:', err);
          }
        }
      } else if (!isActive) {
        // Reset the current dashboard key when leaving Apple Home dashboards
        this.currentDashboardKey = null;
      }
    };
    DashboardStateManager.getInstance().addListener(this.dashboardStateListener);
  }

  // Singleton pattern to ensure we have one shared instance
  static getInstance(hass?: any): CustomizationManager {
    if (!CustomizationManager.instance) {
      CustomizationManager.instance = new CustomizationManager(hass);
    }
    if (hass && !CustomizationManager.instance._hass) {
      CustomizationManager.instance._hass = hass;
    }
    return CustomizationManager.instance;
  }

  async setCustomizations(customizations: any) {
    const migratedCustomizations = this.migrateToNewStructure(customizations || {});
    this.customizations = JSON.parse(JSON.stringify(migratedCustomizations));
    this.isLoaded = true;
  }

  // Migrate old structure to new structure
  private migrateToNewStructure(oldCustomizations: any): any {
    // Handle null/undefined customizations
    if (!oldCustomizations || typeof oldCustomizations !== 'object') {
      return {
        home: {},
        pages: {},
        ui: {},
        background: {}
      };
    }

    // If it's already in the new structure, return as-is
    if (oldCustomizations.home || oldCustomizations.pages) {
      return {
        home: oldCustomizations.home || {},
        pages: oldCustomizations.pages || {},
        ui: oldCustomizations.ui || {},
        background: oldCustomizations.background || {}
      };
    }

    // Migrate old structure
    const newStructure: any = {
      home: {
        excluded_from_dashboard: oldCustomizations.areas?.excludedFromDashboard || [],
        excluded_from_home: oldCustomizations.areas?.excludedFromHome || [],
        sections: {
          order: oldCustomizations.areas?.sectionsOrder || [],
          hidden: oldCustomizations.areas?.hiddenSections || []
        },
        favorites: oldCustomizations.areas?.favoriteAccessories || oldCustomizations.areas?.favorites || [],
        chips_order: oldCustomizations.areas?.chipsOrder || oldCustomizations.areas?.chips_order || [],
        tall_cards: oldCustomizations.entities?.tallCards || oldCustomizations.entities?.tall_cards || [],
        entities_order: {} as any
      },
      pages: {} as any,
      ui: {
        hide_header: oldCustomizations.ui?.hideHeader || oldCustomizations.ui?.hide_header || false,
        hide_sidebar: oldCustomizations.ui?.hideSidebar || oldCustomizations.ui?.hide_sidebar || false
      },
      background: oldCustomizations.background || { type: 'preset', value: 'default' }
    };

    // Migrate entity orders from old entities structure
    if (oldCustomizations.entities) {
      Object.keys(oldCustomizations.entities).forEach(areaId => {
        const areaData = oldCustomizations.entities[areaId];
        
        // Home page entity orders
        if (areaData.cardOrder) {
          newStructure.home.entities_order[areaId] = areaData.cardOrder;
        }
        
        // Migrate carousel orders (cameras, scenes)
        if (areaData.camerasOrder) {
          newStructure.home.entities_order.cameras = areaData.camerasOrder;
        }
        if (areaData.scenesOrder) {
          newStructure.home.entities_order.scenes = areaData.scenesOrder;
        }

        // Create page structure for areas
        if (areaData.cardOrder_room || areaData.lightingOrder || areaData.climateOrder || areaData.securityOrder || areaData.mediaOrder) {
          newStructure.pages[areaId] = {};
          
          if (areaData.cardOrder_room) {
            newStructure.pages[areaId].order = areaData.cardOrder_room;
          }
          if (areaData.lightingOrder) {
            newStructure.pages[areaId].lighting_order = areaData.lightingOrder;
          }
          if (areaData.climateOrder) {
            newStructure.pages[areaId].climate_order = areaData.climateOrder;
          }
          if (areaData.securityOrder) {
            newStructure.pages[areaId].security_order = areaData.securityOrder;
          }
          if (areaData.mediaOrder) {
            newStructure.pages[areaId].media_order = areaData.mediaOrder;
          }
          
          // Migrate tall cards for this area
          if (areaData.tallCards || areaData.tall_cards) {
            newStructure.pages[areaId].tall_cards = areaData.tallCards || areaData.tall_cards;
          }
        }
      });
    }

    return newStructure;
  }

  async ensureCustomizationsLoaded(): Promise<void> {
    if (!this.isLoaded && this._hass) {
      const loadedCustomizations = await this.loadCustomizations();
      await this.setCustomizations(loadedCustomizations);
    }
  }

  getCustomizations() {
    return this.customizations;
  }

  setHass(hass: any) {
    this._hass = hass;
  }

  async saveCardOrder(areaId: string, entityOrder: string[], domain?: string) {
    await this.saveCardOrderWithContext(areaId, entityOrder, 'home', domain);
  }

  async saveCardOrderWithContext(areaId: string, entityOrder: string[], context: string = 'home', domain?: string) {
    if (context === 'home') {
      // Save to home.entities_order
      const homeData = this.getCustomization('home');
      if (!homeData.entities_order) {
        homeData.entities_order = {};
      }
      homeData.entities_order[areaId] = entityOrder;
      await this.setCustomization('home', homeData);
    } else if (context === 'cameras') {
      // Special case: cameras page saves to pages.cameras.order
      const pagesData = this.getCustomization('pages');
      if (!pagesData.cameras) {
        pagesData.cameras = {};
      }
      pagesData.cameras.order = entityOrder;
      await this.setCustomization('pages', pagesData);
    } else if (context === 'scenes') {
      // Special case: scenes page saves to pages.scenes.order
      const pagesData = this.getCustomization('pages');
      if (!pagesData.scenes) {
        pagesData.scenes = {};
      }
      pagesData.scenes.order = entityOrder;
      await this.setCustomization('pages', pagesData);
    } else {
      // For area pages, save to pages.{areaId}.{domain}_order
      const pagesData = this.getCustomization('pages');
      if (!pagesData[areaId]) {
        pagesData[areaId] = {};
      }
      
      if (domain) {
        // Save to domain-specific order (e.g., lighting_order, climate_order)
        const orderKey = `${domain.toLowerCase()}_order`;
        pagesData[areaId][orderKey] = entityOrder;
      } else {
        // Fallback to general order for backward compatibility
        pagesData[areaId].order = entityOrder;
      }
      await this.setCustomization('pages', pagesData);
    }
  }

  getSavedCardOrder(areaId: string, domain?: string): string[] {
    return this.getSavedCardOrderWithContext(areaId, 'home', domain);
  }

  getSavedCardOrderWithContext(areaId: string, context: string = 'home', domain?: string): string[] {
    if (context === 'home') {
      const homeData = this.getCustomization('home');
      return homeData.entities_order?.[areaId] || [];
    } else if (context === 'cameras') {
      const pagesData = this.getCustomization('pages');
      return pagesData.cameras?.order || [];
    } else if (context === 'scenes') {
      const pagesData = this.getCustomization('pages');
      return pagesData.scenes?.order || [];
    } else {
      const pagesData = this.getCustomization('pages');
      if (domain) {
        // Get from domain-specific order (e.g., lighting_order, climate_order)
        const orderKey = `${domain.toLowerCase()}_order`;
        return pagesData[areaId]?.[orderKey] || [];
      } else {
        // Fallback to general order for backward compatibility
        return pagesData[areaId]?.order || [];
      }
    }
  }

  applySavedCardOrder(cards: any[], savedOrder: string[]): any[] {
    // Create a map for quick lookup
    const cardMap = new Map();
    cards.forEach(card => {
      // Handle both card objects (with .entity) and entity objects (with .entity_id)
      const entityId = card.entity || card.entity_id;
      if (entityId) {
        cardMap.set(entityId, card);
      }
    });
    
    // Build ordered array based on saved order
    const orderedCards: any[] = [];
    const usedEntities = new Set();
    
    // First, add cards in the saved order
    savedOrder.forEach(entityId => {
      if (cardMap.has(entityId)) {
        orderedCards.push(cardMap.get(entityId));
        usedEntities.add(entityId);
      }
    });
    
    // Then, add any cards that weren't in the saved order (new entities)
    cards.forEach(card => {
      const entityId = card.entity || card.entity_id;
      if (entityId && !usedEntities.has(entityId)) {
        orderedCards.push(card);
      }
    });
    

    
    return orderedCards;
  }

  async saveCustomizations() {
    if (!this._hass) {
      console.error('🏠 APPLE HOME: No Home Assistant instance available for saving');
      return;
    }
    
    try {
      const success = await this.saveCustomizationsToStorage(this._hass, this.customizations);
      
      if (!success) {
        console.error('🏠 APPLE HOME: Failed to save customizations - check Home Assistant setup');
        console.error('🏠 APPLE HOME: Please create an input_text helper named "apple_home_dashboard_config" for persistent storage');
      }
      // Removed global refresh - individual components should handle their own updates
    } catch (error) {
      console.error('🏠 APPLE HOME: Error in saveCustomizations:', error);
    }
  }

  /**
   * Trigger a global dashboard refresh event that all pages can listen to
   */
  triggerGlobalDashboardRefresh() {
    const event = new CustomEvent('apple-home-dashboard-refresh', {
      detail: { 
        customizations: this.customizations,
        timestamp: Date.now()
      },
      bubbles: true,
      composed: true
    });
    
    // Dispatch on document to ensure all components can hear it
    document.dispatchEvent(event);
    
    // Also dispatch on window for broader coverage
    window.dispatchEvent(event);
  }

  async loadCustomizations(): Promise<any> {
    if (!this._hass) {
      console.error('🏠 APPLE HOME: No Home Assistant instance available for loading');
      return { home: {}, pages: {}, ui: {}, background: {} };
    }
    
    try {
      // Try to get the current dashboard key dynamically
      const dashboardKey = await this.getCurrentDashboardKey(this._hass);
      
      // Load from lovelace config
      const lovelaceResult = await this._hass.callWS({
        type: 'lovelace/config',
        url_path: dashboardKey
      });
      
      if (lovelaceResult && lovelaceResult.customizations) {
        return lovelaceResult.customizations;
      }
      
      return { home: {}, pages: {}, ui: {}, background: {} };
      
    } catch (error) {
      console.error('🏠 APPLE HOME: Error loading customizations:', error);
      return { home: {}, pages: {}, ui: {}, background: {} };
    }
  }

  private async saveCustomizationsToStorage(hass: any, customizations: any): Promise<boolean> {
    try {
      // Try to get the current dashboard key dynamically
      const dashboardKey = await this.getCurrentDashboardKey(hass);
      
      // Get current dashboard config
      const currentConfig = await hass.callWS({
        type: 'lovelace/config',
        url_path: dashboardKey
      });
      
      // Update config with customizations
      const updatedConfig = {
        ...currentConfig,
        customizations: customizations
      };
      
      // Save updated config back to dashboard
      await hass.callWS({
        type: 'lovelace/config/save',
        url_path: dashboardKey,
        config: updatedConfig
      });
      
      // Hide the dashboard update notification
      this.hideNotificationAfterSave();
      
      return true;
      
    } catch (error) {
      console.error('🏠 APPLE HOME: Error saving customizations:', error);
      return false;
    }
  }

  private hideNotificationAfterSave(): void {
    customElements.whenDefined("notification-manager").then(() => {
      const homeAssistant = document.querySelector("home-assistant");
      if (!homeAssistant?.shadowRoot) return;
      
      const nm = homeAssistant.shadowRoot.querySelector("notification-manager");
      if (!nm?.shadowRoot) return;
      
      // Check if we already have our style to avoid duplicates
      const existingStyle = nm.shadowRoot.getElementById('apple-home-dashboard-hide');
      if (existingStyle) return;
      
      // Inject CSS to hide toasts immediately
      const style = document.createElement("style");
      style.id = 'apple-home-dashboard-hide';
      style.textContent = `ha-toast { display: none !important; }`;
      nm.shadowRoot.appendChild(style);
      
      // Set up interval to detect and close dashboard notifications
      let attempts = 0;
      const maxAttempts = 100; // Check for 10 seconds
      
      const checkInterval = setInterval(() => {
        attempts++;
        
        // Find and close the toast using the working method
        const toast = document.querySelector("home-assistant")?.shadowRoot
          ?.querySelector("notification-manager")?.shadowRoot
          ?.querySelector("ha-toast") as any;
        
        if (toast && typeof toast.close === 'function') {
          toast.close();
          clearInterval(checkInterval);
        } else if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
        }
      }, 100);
    });
  }

  private async getCurrentDashboardKey(hass: any): Promise<string | null> {
    try {
      // Parse dashboard name from current URL - this is the most reliable method
      const currentPath = window.location.pathname;
      
      // Extract the base dashboard identifier for STORAGE purposes
      // Examples: 
      // /lovelace/home -> null (default dashboard for HA storage)
      // /dashboard-test/home -> 'dashboard-test'  
      // /apple-home/home -> 'apple-home'
      
      const dashboardMatch = currentPath.match(/\/([^\/]+)/);
      if (dashboardMatch && dashboardMatch[1]) {
        const dashboardKey = dashboardMatch[1];
        
        // SPECIAL CASE: For Home Assistant storage, 'lovelace' should be null (default dashboard)
        // but for component isolation, we'll use 'lovelace' in other methods
        if (dashboardKey === 'lovelace') {
          return null; // Default dashboard for HA storage
        }
        
        return dashboardKey;
      }
      
      console.warn('🔑 Could not extract dashboard key from path:', currentPath);
      return null; // Default fallback for storage
    } catch (error) {
      console.error('🏠 APPLE HOME: Error getting dashboard key:', error);
      return null;
    }
  }

  /**
   * Get dashboard key for component isolation (different from storage key)
   * This ensures each dashboard has its own component instances
   */
  getComponentDashboardKey(): string {
    const currentPath = window.location.pathname;
    const dashboardMatch = currentPath.match(/\/([^\/]+)/);
    
    if (dashboardMatch && dashboardMatch[1]) {
      return dashboardMatch[1]; // Always return the actual path segment (including 'lovelace')
    }
    
    return 'default';
  }

  async saveCurrentLayout() {
    if (!this._hass) return;
    
    try {
      // Save the current layout to Home Assistant storage
      await this.saveCustomizationsToStorage(this._hass, this.customizations);
    } catch (error) {
      console.error('Error saving layout:', error);
      return { success: false, message: localize('errors.error_saving_layout') };
    }
  }

  async saveLayoutToStorage(hass: any) {
    try {
      // Save the current layout to Home Assistant storage
      await this.saveCustomizationsToStorage(hass, this.customizations);
    } catch (error) {
      console.error('Error saving layout to storage:', error);
      throw error;
    }
  }

  async updateCarouselOrder(areaId: string, sectionType: string, entityOrder: string[]) {
    await this.updateCarouselOrderWithContext(areaId, sectionType, entityOrder, 'home');
  }

  async updateCarouselOrderWithContext(areaId: string, sectionType: string, entityOrder: string[], context: string = 'home') {
    if (context === 'home') {
      // Store in home.entities_order
      const homeData = this.getCustomization('home');
      if (!homeData.entities_order) {
        homeData.entities_order = {};
      }
      
      // Handle special section IDs - remove '_section' suffix for storage
      const storageKey = areaId.endsWith('_section') ? areaId.replace('_section', '') : areaId;
      homeData.entities_order[storageKey] = entityOrder;
      await this.setCustomization('home', homeData);
    } else if (context === 'cameras') {
      // Special case: cameras page
      const pagesData = this.getCustomization('pages');
      if (!pagesData.cameras) {
        pagesData.cameras = {};
      }
      pagesData.cameras.order = entityOrder;
      await this.setCustomization('pages', pagesData);
    } else if (context === 'scenes') {
      // Special case: scenes page
      const pagesData = this.getCustomization('pages');
      if (!pagesData.scenes) {
        pagesData.scenes = {};
      }
      pagesData.scenes.order = entityOrder;
      await this.setCustomization('pages', pagesData);
    } else {
      // For other contexts, save to pages.{areaId}.order
      const pagesData = this.getCustomization('pages');
      if (!pagesData[areaId]) {
        pagesData[areaId] = {};
      }
      pagesData[areaId].order = entityOrder;
      await this.setCustomization('pages', pagesData);
    }
  }

  getSavedCarouselOrder(areaId: string, sectionType: string): string[] {
    return this.getSavedCarouselOrderWithContext(areaId, sectionType, 'home');
  }

  getSavedCarouselOrderWithContext(areaId: string, sectionType: string, context: string = 'home'): string[] {
    if (context === 'home') {
      // Get from home.entities_order
      const homeData = this.getCustomization('home');
      
      // Handle special section IDs - remove '_section' suffix for lookup
      const storageKey = areaId.endsWith('_section') ? areaId.replace('_section', '') : areaId;
      return homeData.entities_order?.[storageKey] || [];
    } else if (context === 'cameras') {
      const pagesData = this.getCustomization('pages');
      return pagesData.cameras?.order || [];
    } else if (context === 'scenes') {
      const pagesData = this.getCustomization('pages');
      return pagesData.scenes?.order || [];
    } else {
      // Get from pages.{areaId}.order
      const pagesData = this.getCustomization('pages');
      return pagesData[areaId]?.order || [];
    }
  }

  // Section reordering methods
  async saveSectionOrder(sectionOrder: string[]) {
    const homeData = this.getCustomization('home');
    if (!homeData.sections) {
      homeData.sections = {};
    }
    homeData.sections.order = sectionOrder;
    await this.setCustomization('home', homeData);
  }

  getSavedSectionOrder(): string[] {
    const homeData = this.getCustomization('home');
    return homeData.sections?.order || [];
  }

  async saveHiddenSections(hiddenSections: string[]) {
    const homeData = this.getCustomization('home');
    if (!homeData.sections) {
      homeData.sections = {};
    }
    homeData.sections.hidden = hiddenSections;
    await this.setCustomization('home', homeData);
  }

  getHiddenSections(): string[] {
    const homeData = this.getCustomization('home');
    return homeData.sections?.hidden || [];
  }

  isSectionVisible(sectionId: string): boolean {
    const hiddenSections = this.getHiddenSections();
    return !hiddenSections.includes(sectionId);
  }

  // Chips ordering methods
  async saveChipsOrder(chipsOrder: string[]) {
    const homeData = this.getCustomization('home');
    homeData.chips_order = chipsOrder;
    await this.setCustomization('home', homeData);
  }

  getSavedChipsOrder(): string[] {
    const homeData = this.getCustomization('home');
    return homeData.chips_order || [];
  }

  // Home Settings methods
  async getFavoriteAccessories(): Promise<string[]> {
    await this.ensureCustomizationsLoaded();
    const homeData = this.getCustomization('home');
    return homeData.favorites || [];
  }

  async getExcludedFromDashboard(): Promise<string[]> {
    await this.ensureCustomizationsLoaded();
    const homeData = this.getCustomization('home');
    return homeData.excluded_from_dashboard || [];
  }

  async getExcludedFromHome(): Promise<string[]> {
    await this.ensureCustomizationsLoaded();
    const homeData = this.getCustomization('home');
    return homeData.excluded_from_home || [];
  }

  async isEntityExcludedFromDashboard(entityId: string): Promise<boolean> {
    const excluded = await this.getExcludedFromDashboard();
    return excluded.includes(entityId);
  }

  async isEntityExcludedFromHome(entityId: string): Promise<boolean> {
    const excluded = await this.getExcludedFromHome();
    return excluded.includes(entityId);
  }

  async hasFavoriteAccessories(): Promise<boolean> {
    const favorites = await this.getFavoriteAccessories();
    return favorites.length > 0;
  }

  async getShowSwitches(): Promise<boolean> {
    await this.ensureCustomizationsLoaded();
    const homeData = this.getCustomization('home');
    return homeData.show_switches || false;
  }

  async getIncludedSwitches(): Promise<string[]> {
    await this.ensureCustomizationsLoaded();
    const homeData = this.getCustomization('home');
    return homeData.included_switches || [];
  }

  async getExtraAccessories(): Promise<string[]> {
    await this.ensureCustomizationsLoaded();
    const homeData = this.getCustomization('home');
    return homeData.extra_accessories || [];
  }

  // Dashboard state tracking methods - delegate to DashboardStateManager
  setDashboardActive(isActive: boolean): void {
    // This method is now just for backward compatibility
    // The actual state is managed by DashboardStateManager
    if (isActive) {
      this.currentDashboardKey = this.extractDashboardKeyFromUrl();
    } else {
      this.currentDashboardKey = null;
    }
  }

  private extractDashboardKeyFromUrl(): string | null {
    const path = window.location.pathname;
    const match = path.match(/^\/([^\/]+)/);
    return match ? match[1] : null;
  }

  isDashboardCurrentlyActive(): boolean {
    // Delegate to DashboardStateManager for accurate state
    return import('./DashboardStateManager').then(({ DashboardStateManager }) => {
      return DashboardStateManager.getInstance().isDashboardActive();
    }) as unknown as boolean;
  }

  getDashboardUrl(): string | null {
    // Return current path if we have a dashboard key
    return this.currentDashboardKey ? window.location.pathname : null;
  }

  // Check if current URL matches dashboard URL pattern
  // This now delegates to DashboardStateManager for consistency
  isCurrentlyInDashboard(): boolean {
    // Synchronous check - use the tracked dashboard key
    return this.currentDashboardKey !== null;
  }

  // UI Settings management
  getUISettings(): any {
    return this.customizations.ui || {};
  }

  setUISettings(uiSettings: any): void {
    // Use the generic setter which will preserve all other customizations
    this.customizations = {
      ...this.customizations,
      ui: { ...uiSettings }
    };
  }

  isHeaderHidden(): boolean {
    const uiSettings = this.getUISettings();
    return uiSettings.hide_header === true;
  }

  isSidebarHidden(): boolean {
    const uiSettings = this.getUISettings();
    return uiSettings.hide_sidebar === true;
  }

  async setHeaderVisibility(hidden: boolean): Promise<void> {
    await this.ensureCustomizationsLoaded();
    const uiSettings = this.getUISettings();
    uiSettings.hide_header = hidden;
    this.setUISettings(uiSettings);
    await this.saveCustomizations();
  }

  async setSidebarVisibility(hidden: boolean): Promise<void> {
    await this.ensureCustomizationsLoaded();
    const uiSettings = this.getUISettings();
    uiSettings.hide_sidebar = hidden;
    this.setUISettings(uiSettings);
    await this.saveCustomizations();
  }

  // Generic get/set methods for any customization section
  getCustomization(section: string): any {
    return this.customizations[section] || {};
  }

  async setCustomization(section: string, newSectionObject: any): Promise<void> {
    await this.ensureCustomizationsLoaded();
    
    // Preserve all existing customizations and only update the specified section
    this.customizations = {
      ...this.customizations,
      [section]: newSectionObject
    };
    
    await this.saveCustomizations();
  }

  /**
   * Batch update multiple customization sections in a single save operation.
   * This is more efficient than calling setCustomization multiple times.
   * @param updates - Object with section names as keys and their new data as values
   */
  async batchSetCustomizations(updates: Record<string, any>): Promise<void> {
    await this.ensureCustomizationsLoaded();
    
    // Apply all updates to in-memory customizations
    for (const [section, data] of Object.entries(updates)) {
      this.customizations = {
        ...this.customizations,
        [section]: data
      };
    }
    
    // Single save operation for all changes
    await this.saveCustomizations();
  }

  /**
   * Update a customization section in memory without saving.
   * Use with saveCustomizations() for batch operations.
   */
  setCustomizationLocal(section: string, newSectionObject: any): void {
    this.customizations = {
      ...this.customizations,
      [section]: newSectionObject
    };
  }

  // Convenience method for updating a single property within a section
  async updateCustomizationProperty(section: string, property: string, value: any): Promise<void> {
    const sectionData = this.getCustomization(section);
    sectionData[property] = value;
    await this.setCustomization(section, sectionData);
  }

  /**
   * Cleanup - destroy the singleton
   */
  static destroy(): void {
    if (CustomizationManager.instance) {
      // Remove the dashboard state listener
      if (CustomizationManager.instance.dashboardStateListener) {
        DashboardStateManager.getInstance().removeListener(
          CustomizationManager.instance.dashboardStateListener
        );
        CustomizationManager.instance.dashboardStateListener = undefined;
      }
      CustomizationManager.instance = null;
    }
  }
}
