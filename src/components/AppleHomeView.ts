import { AppleHomeCard } from './AppleHomeCard';
import { DragAndDropManager } from '../utils/DragAndDropManager';
import { EditModeManager } from '../utils/EditModeManager';
import { AppleHeader, HeaderConfig } from '../sections/AppleHeader';
import { CustomizationManager } from '../utils/CustomizationManager';
import { CardManager } from '../utils/CardManager';
import { setupLocalize, localize } from '../utils/LocalizationService';
import { AppleChips } from '../sections/AppleChips';
import { ChipsConfigurationManager } from '../utils/ChipsConfigurationManager';
import { HomePage } from '../pages/HomePage';
import { GroupPage } from '../pages/GroupPage';
import { RTLHelper } from '../utils/RTLHelper';
import { RoomPage } from '../pages/RoomPage';
import { ScenesPage } from '../pages/ScenesPage';
import { CamerasPage } from '../pages/CamerasPage';
import { DeviceGroup } from '../config/DashboardConfig';
import { RegistrySubscriptionManager, RegistryChangeCallback, RegistryChangeEvent } from '../utils/RegistrySubscriptionManager';

export class AppleHomeView extends HTMLElement {
  // Dashboard-specific management - keyed by dashboard URL base
  private static dashboardActiveInstances = new Map<string, AppleHomeView>();
  private static dashboardStateListeners = new Map<string, (isActive: boolean) => void>();
  
  private config?: any;
  private _hass?: any;
  private _config?: any;
  private content?: HTMLElement;
  // Targeted event routing: entity_id -> cards that render it.
  private entityCardIndex: Map<string, Set<AppleHomeCard>> = new Map();
  // Cards that must receive every hass update regardless of state diff (cameras).
  private alwaysUpdateCards: Set<AppleHomeCard> = new Set();
  // Set true whenever this.content's card DOM changes; triggers a lazy index rebuild.
  private indexDirty: boolean = true;
  private contentMutationObserver?: MutationObserver;
  private _rendered = false;
  private _isTransitioning = false; // Add transition state
  private _lastRenderTime = 0; // Track when last render happened
  private _modeSwitchDebounce: number | null = null; // Prevent rapid mode switching
  private chipsElement?: AppleChips;
  private visibilityChangeHandler?: () => void; // Add visibility change handler
  private globalRefreshHandler?: (event: Event) => void; // Add global refresh handler
  private currentDashboardKey: string = 'default'; // Track current dashboard key
  
  // Registry subscription handlers for automatic updates
  private registrySubscriptionManager?: RegistrySubscriptionManager;
  private registryChangeHandler?: RegistryChangeCallback;
  private rtlChangeHandler?: (isRTL: boolean, language: string) => void;
  private _lastLanguage?: string; // Track language for change detection
  
  // Helper methods for dashboard-specific management
  private getDashboardKey(): string {
    // Extract dashboard key directly from URL (independent method)
    const currentPath = window.location.pathname;
    const dashboardMatch = currentPath.match(/\/([^\/]+)/);
    return dashboardMatch && dashboardMatch[1] ? dashboardMatch[1] : 'default';
  }
  
  private getCurrentActiveInstance(): AppleHomeView | undefined {
    return AppleHomeView.dashboardActiveInstances.get(this.currentDashboardKey);
  }
  
  private setCurrentActiveInstance(instance: AppleHomeView | undefined): void {
    if (instance) {
      AppleHomeView.dashboardActiveInstances.set(this.currentDashboardKey, instance);
    } else {
      AppleHomeView.dashboardActiveInstances.delete(this.currentDashboardKey);
    }
  }
  
  // Page renderers
  private homePage: HomePage;
  private groupPage: GroupPage;
  private roomPage: RoomPage;
  private scenesPage: ScenesPage;
  private camerasPage: CamerasPage;

  // Managers
  private customizationManager: CustomizationManager;
  private cardManager: CardManager;
  private editModeManager: EditModeManager;
  private appleHeader: AppleHeader;
  private refreshCallback: () => void;
  private dragAndDropManager: DragAndDropManager;

  constructor() {
    super();
    
    // Initialize dashboard key for this instance
    this.currentDashboardKey = this.getDashboardKey();
    
    // Initialize callbacks
    this.refreshCallback = () => this.refreshDashboard();

    // Initialize managers as instance-specific but use singleton for customization
    this.customizationManager = CustomizationManager.getInstance();
    this.cardManager = new CardManager(this.customizationManager);
    this.editModeManager = new EditModeManager((editMode) => this.handleEditModeChange(editMode));
    
    // Create instance-specific header (NO SINGLETON!) and pass editModeManager
    this.appleHeader = new AppleHeader(true);
    this.appleHeader.setEditModeManager(this.editModeManager);
    this.appleHeader.addRefreshCallback(this.refreshCallback);
    
    this.dragAndDropManager = new DragAndDropManager(
      (areaId: string) => this.handleSaveCurrentOrder(areaId),
      this.customizationManager,
      'home' // Use home context for home page
    );
    
    // Initialize page renderers
    this.homePage = new HomePage();
    this.groupPage = new GroupPage();
    this.roomPage = new RoomPage();
    this.scenesPage = new ScenesPage();
    this.camerasPage = new CamerasPage();
    
    // Set up header manager dependencies
    this.appleHeader.setCustomizationManager(this.customizationManager);
    
  }

  connectedCallback() {
    // Create and store visibility change handler to pause cameras when hidden
    this.visibilityChangeHandler = () => {
      if (document.hidden) {
        // Pause all cameras when page becomes hidden
        this.pauseCameras();
      } else {
        // Resume cameras when page becomes visible
        this.resumeCameras();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityChangeHandler);

    // Create and store global refresh handler
    this.globalRefreshHandler = (event: Event) => {
      const customEvent = event as CustomEvent;
      // Only refresh if we have hass and this is a different customization update
      if (this._hass && customEvent.detail?.customizations) {
        this.handleGlobalRefresh(customEvent.detail.customizations);
      }
    };
    document.addEventListener('apple-home-dashboard-refresh', this.globalRefreshHandler);
    
    // Set up registry subscription manager for automatic updates
    this.setupRegistrySubscriptions();
    
    // Set up RTL change detection
    this.setupRTLChangeDetection();
    
    // Note: Dashboard registration is handled by the strategy when it generates the dashboard
    // The DashboardStateManager tracks which dashboards are Apple Home dashboards
    
    // CRITICAL: Set this as the active instance for this dashboard
    this.setCurrentActiveInstance(this);

  }

  disconnectedCallback() {
    // Persist anything still held back by edit mode, so pending reorders are not
    // lost if the view is torn down (navigation, reload) before edit mode ends.
    void this.customizationManager.flushDeferredSaves();

    // Clean up event listeners
    if (this.visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
    }
    if (this.globalRefreshHandler) {
      document.removeEventListener('apple-home-dashboard-refresh', this.globalRefreshHandler);
    }

    // Stop watching content for card DOM changes
    if (this.contentMutationObserver) {
      this.contentMutationObserver.disconnect();
      this.contentMutationObserver = undefined;
    }

    // Clean up registry subscription handlers
    this.cleanupRegistrySubscriptions();
    
    // Clean up RTL change detection
    this.cleanupRTLChangeDetection();
    
    // Clean up instance-specific header callbacks
    if (this.refreshCallback) {
      this.appleHeader.removeRefreshCallback(this.refreshCallback);
    }
    
    // Clean up managers and their resources
    if (this.dragAndDropManager) {
      this.dragAndDropManager.disableDragAndDrop(this.content!);
    }
    
    // Clear active instance reference if this is the active one for this dashboard
    if (this.getCurrentActiveInstance() === this) {
      this.setCurrentActiveInstance(undefined);
    }
    
    // Clean up all camera managers in the current content
    this.cleanupCameras();
    
    // Note: We don't manually set dashboard inactive here
    // The DashboardStateManager handles this automatically via URL change detection
  }

  private async handleGlobalRefresh(customizations: any) {
    try {
      // Update the customization manager with fresh data
      await this.customizationManager.setCustomizations(customizations);
      
      // Update config with fresh customizations
      this.config = {
        ...this.config,
        customizations: customizations
      };
      
      // Apply changes immediately if not already rendered by customization changes
      this._rendered = false;
      await this.renderPage('globalRefresh');
      
    } catch (error) {
      console.error('🏠 APPLE HOME: Error during global refresh:', error);
    }
  }

  /**
   * Set up registry subscription manager for automatic updates
   * This handles: entity area changes, device moves, entity hide/delete/disable
   */
  private setupRegistrySubscriptions(): void {
    this.registrySubscriptionManager = RegistrySubscriptionManager.getInstance();
    
    // Create the handler for registry changes
    this.registryChangeHandler = (event) => {
      if (this.editModeManager?.editMode) return;
      this.handleRegistryChange(event);
    };
    
    this.registrySubscriptionManager.addListener(this.registryChangeHandler);
    
    // Initialize with hass if available
    if (this._hass) {
      this.registrySubscriptionManager.setHass(this._hass);
    }
  }

  /**
   * Clean up registry subscriptions
   */
  private cleanupRegistrySubscriptions(): void {
    if (this.registryChangeHandler && this.registrySubscriptionManager) {
      this.registrySubscriptionManager.removeListener(this.registryChangeHandler);
    }
    this.registryChangeHandler = undefined;
  }

  /**
   * Handle registry changes with surgical DOM updates - no full page rebuilds.
   */
  private async handleRegistryChange(event: RegistryChangeEvent): Promise<void> {
    if (!this._rendered || this._isTransitioning || !this._hass || !this.content) return;

    switch (event.type) {
      case 'entity':
        await this.handleEntityChange(event);
        break;
      case 'area':
        await this.handleAreaChange(event);
        break;
      case 'device':
        // Device area changes affect entities on that device.
        // The entity registry events will fire separately for those, so no action needed here.
        break;
    }
  }

  private async handleEntityChange(event: RegistryChangeEvent): Promise<void> {
    const entityId = event.data?.entity_id;
    if (!entityId || !this.content || !this._hass) return;

    if (event.action === 'remove') {
      this.fadeOutCard(entityId);
      return;
    }

    // For create/update, check current entity registry state from hass
    const entityReg = this._hass.entities?.[entityId];

    if (event.action === 'update' && entityReg) {
      // Entity hidden or disabled → fade out
      if (entityReg.hidden_by || entityReg.disabled_by) {
        this.fadeOutCard(entityId);
        return;
      }

      // Check if entity moved areas
      const newAreaId = entityReg.area_id
        || (entityReg.device_id ? this._hass.devices?.[entityReg.device_id]?.area_id : null)
        || 'no_area';

      const wrapper = this.content.querySelector(`.entity-card-wrapper[data-entity-id="${entityId}"]`) as HTMLElement;
      if (wrapper) {
        const currentGrid = wrapper.closest('.area-entities') as HTMLElement;
        const currentAreaId = currentGrid?.dataset?.areaId;

        if (currentAreaId && currentAreaId !== newAreaId) {
          // Entity moved to a different area
          const targetGrid = this.content.querySelector(`.area-entities[data-area-id="${newAreaId}"]`) as HTMLElement;
          if (targetGrid) {
            // Move card to the target area grid
            wrapper.style.transition = 'opacity 0.2s ease';
            wrapper.style.opacity = '0';
            await new Promise(r => setTimeout(r, 200));
            targetGrid.appendChild(wrapper);
            wrapper.style.opacity = '1';
          } else {
            // Target area not on this page - just remove card
            this.fadeOutCard(entityId);
          }
          this.cleanupEmptySection(currentGrid);
        }
      }
      // If card not in DOM but entity exists and isn't hidden → was previously hidden, skip
      // It will appear on next navigation
    }
  }

  private async handleAreaChange(event: RegistryChangeEvent): Promise<void> {
    if (!this.content || !this._hass) return;

    if (event.action === 'remove') {
      const areaId = event.data?.area_id;
      if (!areaId) return;
      const grid = this.content.querySelector(`.area-entities[data-area-id="${areaId}"]`) as HTMLElement;
      if (grid) {
        const title = grid.previousElementSibling as HTMLElement;
        grid.style.transition = 'opacity 0.2s ease';
        grid.style.opacity = '0';
        if (title?.classList.contains('area-title')) {
          title.style.transition = 'opacity 0.2s ease';
          title.style.opacity = '0';
        }
        await new Promise(r => setTimeout(r, 200));
        grid.remove();
        if (title?.classList.contains('area-title')) title.remove();
      }
      return;
    }

    if (event.action === 'update') {
      // Area renamed - update all matching titles
      try {
        const areas = await this._hass.callWS({ type: 'config/area_registry/list' });
        for (const area of areas) {
          const grid = this.content.querySelector(`.area-entities[data-area-id="${area.area_id}"]`);
          if (grid) {
            const title = grid.previousElementSibling;
            if (title?.classList.contains('area-title')) {
              const span = title.querySelector('span');
              if (span && span.textContent !== area.name) {
                span.textContent = area.name;
              }
            }
          }
        }
      } catch {
        // Silent fail
      }
    }
  }

  private fadeOutCard(entityId: string): void {
    if (!this.content) return;
    const wrapper = this.content.querySelector(`.entity-card-wrapper[data-entity-id="${entityId}"]`) as HTMLElement;
    if (!wrapper) return;

    const parentGrid = wrapper.closest('.area-entities') as HTMLElement;

    // Cleanup the card's resources before removing
    const card = wrapper.querySelector('apple-home-card') as any;
    if (card && typeof card.cleanup === 'function') card.cleanup();

    wrapper.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    wrapper.style.opacity = '0';
    wrapper.style.transform = 'scale(0.8)';
    setTimeout(() => {
      wrapper.remove();
      if (parentGrid) this.cleanupEmptySection(parentGrid);
    }, 250);
  }

  private cleanupEmptySection(grid: HTMLElement): void {
    if (!grid || grid.children.length > 0) return;
    const title = grid.previousElementSibling as HTMLElement;
    grid.style.transition = 'opacity 0.2s ease';
    grid.style.opacity = '0';
    if (title?.classList.contains('area-title')) {
      title.style.transition = 'opacity 0.2s ease';
      title.style.opacity = '0';
    }
    setTimeout(() => {
      grid.remove();
      if (title?.classList.contains('area-title')) title.remove();
    }, 200);
  }

  /**
   * Set up RTL change detection
   */
  private setupRTLChangeDetection(): void {
    this.rtlChangeHandler = (isRTL: boolean, language: string) => {
      // Handle RTL/language change
      this.handleRTLChange(isRTL, language);
    };
    
    RTLHelper.addListener(this.rtlChangeHandler);
  }

  /**
   * Clean up RTL change detection
   */
  private cleanupRTLChangeDetection(): void {
    if (this.rtlChangeHandler) {
      RTLHelper.removeListener(this.rtlChangeHandler);
    }
    this.rtlChangeHandler = undefined;
  }

  /**
   * Handle RTL/language changes
   */
  private handleRTLChange(isRTL: boolean, language: string): void {
    // Update wrapper content direction class
    if (this.content) {
      const wrapperContent = this.shadowRoot?.querySelector('.wrapper-content');
      if (wrapperContent) {
        wrapperContent.classList.remove('rtl', 'ltr');
        wrapperContent.classList.add(isRTL ? 'rtl' : 'ltr');
      }
    }
    
    // Force re-render to update all RTL-dependent UI elements
    if (this._rendered && !this._isTransitioning) {
      this._rendered = false;
      this.renderPage('rtlChange');
    }
  }

  async setConfig(config: any) {
    
    // Store old config for comparison
    const oldConfig = this._config;
    
    // CRITICAL FIX: Force complete reset on every config change
    // This prevents state corruption during navigation
    this._rendered = false;
    
    
    this.config = config;

    // CRITICAL: Always load fresh customizations from storage instead of using config
    // This ensures we get the latest settings even when navigating between pages
    if (this._hass) {
      await this.loadAndApplyCustomizations();
    } else {
      // If no hass yet, set the config customizations as fallback
      await this.customizationManager.setCustomizations(config.customizations || { 
        home: { sections: { order: [], hidden: [] }, favorites: [], excluded_from_dashboard: [], excluded_from_home: [] }, 
        pages: {}, 
        ui: {}, 
        background: {} 
      });
    }
    
    this._config = config;
    
    // Update header title if available
    if (this.appleHeader && config.title) {
      // For room pages, use areaName as title, not config.title
      const titleToUse = config.pageType === 'room' ? (config.areaName || config.title) : config.title;
      this.appleHeader.setTitle(titleToUse);
    } else {
    }
    
    // Smart render: only full re-render if structural changes occurred
    if (this._hass) {
      if (this.needsFullRender(oldConfig, config)) {
        this.renderPage('setConfig-fullRender');
      } else {
        // Just update existing components with new config
        this.updateConfigProperties(config);
      }
    }
  }

  private needsFullRender(oldConfig: any, newConfig: any): boolean {
    // No old config means first render
    if (!oldConfig) return true;
    
    // Check for structural changes that require full re-render
    return (
      oldConfig.pageType !== newConfig.pageType ||
      oldConfig.areaId !== newConfig.areaId ||
      oldConfig.areaName !== newConfig.areaName ||
      oldConfig.deviceGroup !== newConfig.deviceGroup ||
      oldConfig.activeGroup !== newConfig.activeGroup
    );
  }

  private updateConfigProperties(config: any): void {
    // Update title without full render
    if (this.appleHeader && config.title !== this.config?.title) {
      // For room pages, use areaName as title, not config.title
      const titleToUse = config.pageType === 'room' ? (config.areaName || config.title) : config.title;
      this.appleHeader.setTitle(titleToUse);
    }
    
    // Update chips active group if changed
    if (this.chipsElement && config.activeGroup !== this.config?.activeGroup) {
      this.chipsElement.setActiveGroup(config.activeGroup);
    }
    
    // Update existing cards with new hass if available (no diff baseline after a config change)
    this.updateExistingCards(undefined, this._hass);

    // Update chips to reflect any config changes
    this.updateChips();
  }

  private updateEntityVisibility(entityId: string, isVisible: boolean): void {
    // Fast DOM manipulation for visibility changes
    if (this.content) {
      const cardWrapper = this.content.querySelector(`[data-entity-id="${entityId}"]`);
      if (cardWrapper) {
        (cardWrapper as HTMLElement).style.display = isVisible ? '' : 'none';
      }
    }
  }

  private async updateHeaderForConfig() {
    if (!this.content || !this.config) return;
    
    // Remove existing group title (but keep Apple Home header)
    const existingGroupTitle = this.content.querySelector('.apple-group-title');
    if (existingGroupTitle) {
      existingGroupTitle.remove();
    }
    
    // Determine page type for header configuration
    const isGroupPage = this.config.pageType === 'group';
    const isSpecialPage = ['room', 'scenes', 'cameras'].includes(this.config.pageType);
    
    // Always ensure Apple Home header exists and is properly configured
    
    // Configure header based on page type - direct to AppleHeader
    if (!isGroupPage && !isSpecialPage) {
      // Home page: configure header for home (show menu, use home title)
      const homeConfig: HeaderConfig = {
        title: this.config.title || localize('pages.my_home'),
        isGroupPage: false,
        showMenu: true
      };
      await this.appleHeader.init(this.content, homeConfig);
      // Update page content padding after header is initialized
      this.appleHeader.updatePageContentPadding();
    } else {
      // Group/Special pages: configure header (show menu and back button for special pages)
      let pageTitle = this.config.title || 'Page';
      let showBackButton = false;
      
      // Set appropriate title and back button based on page type
      if (this.config.pageType === 'room') {
        // For room pages, use config.title (which should be the room name from apple-home-strategy.ts)
        // This matches how group pages work - they just use config.title directly
        pageTitle = this.config.title || localize('pages.default_room');
        showBackButton = true;
      } else if (this.config.pageType === 'scenes') {
        pageTitle = localize('pages.scenes');
        showBackButton = true;
      } else if (this.config.pageType === 'cameras') {
        pageTitle = localize('pages.cameras');
        showBackButton = true;
      }
      
      const pageConfig: HeaderConfig = {
        title: pageTitle,
        isGroupPage: isGroupPage, // Use same styling as group pages
        isSpecialPage: isSpecialPage, // Add special page flag for immediate scroll header
        showMenu: !isGroupPage, // Show menu for special pages
        showBackButton: showBackButton // Show back button for special pages
      };
      await this.appleHeader.init(this.content, pageConfig);
    }
    
    // Update page content padding after header is initialized
    this.appleHeader.updatePageContentPadding();
    
    // Always ensure chips are properly configured and connected to header
    this.ensureChipsConfiguredForHeader();
  }

  private ensureChipsConfiguredForHeader() {
    
    // Only set chips to header if this is a group page
    const isGroupPage = this.config?.pageType === 'group';
    const isSpecialPage = ['room', 'scenes', 'cameras'].includes(this.config?.pageType);
    
    // Hide chips completely for special pages (room, scenes, cameras)
    if (isSpecialPage) {
      this.appleHeader.setChipsElement(null); // Clear header chips for special pages
      // Also hide the permanent chips container
      const chipsContainer = this.content?.querySelector('.permanent-chips') as HTMLElement;
      if (chipsContainer) {
        chipsContainer.style.display = 'none';
      }
      return;
    }
    
    if (!isGroupPage) {
      this.appleHeader.setChipsElement(null); // Clear header chips for home page
      // Show chips container for non-special pages
      const chipsContainer = this.content?.querySelector('.permanent-chips') as HTMLElement;
      if (chipsContainer) {
        chipsContainer.style.display = 'block';
      }
      return;
    }
    
    // Make sure chips exist and are configured
    this.ensureChipsExist();
    
    // Pass chips to header if they're properly configured (group pages only)
    if (this.chipsElement && this.chipsElement.isConfigured() && this.chipsElement.hass) {
      this.appleHeader.setChipsElement(this.chipsElement);
    } else if (this.chipsElement) {
      this.configureChips();
      
      // Try again after configuration
      if (this.chipsElement.isConfigured() && this.chipsElement.hass) {
        this.appleHeader.setChipsElement(this.chipsElement);
      } else {
      }
    } else {
    }
  }

  set hass(hass: any) {
    const oldHass = this._hass;
    this._hass = hass;
    
    // Setup localization with the new hass instance
    setupLocalize(hass);
    
    // Update managers with new hass
    this.customizationManager.setHass(hass);
    this.appleHeader.setHass(hass);
    
    // Update registry subscription manager with new hass
    if (this.registrySubscriptionManager) {
      this.registrySubscriptionManager.setHass(hass);
    }
    
    // Check for RTL/language changes on every hass update
    const currentLanguage = hass?.locale?.language || hass?.language;
    if (this._lastLanguage && currentLanguage && this._lastLanguage !== currentLanguage) {
      // Language changed - check for RTL change
      RTLHelper.checkForChanges(hass);
    }
    this._lastLanguage = currentLanguage;
    
    // Only load customizations on first hass set, not on every hass update
    // This prevents unnecessary re-rendering and title updates on entity state changes
    const isFirstHassSet = !oldHass;
    if (isFirstHassSet) {
      // CRITICAL: Load fresh customizations only on first hass set
      // This ensures navigation to any page gets the latest excluded entities
      this.loadAndApplyCustomizations();
    }
    
    // Ensure shadow root exists (but don't recreate if it exists)
    this.ensureShadowRootExists();
    
    // Only render if this is the first time
    if (!this._rendered) {
      this.renderPage('setHass-firstTime');
      this._rendered = true;
    } else {
      // Optimized updates: route the new hass only to affected cards
      this.updateExistingCards(oldHass, this._hass);
      this.updateChips();
    }
  }

  private async loadAndApplyCustomizations() {
    if (!this._hass) return;
    
    try {
      // Load customizations from storage
      const customizations = await this.customizationManager.loadCustomizations();
      
      // Set the loaded customizations
      await this.customizationManager.setCustomizations(customizations);
      
      // Update config with loaded customizations
      if (this.config) {
        const oldCustomizations = this.config.customizations;
        
        this.config = {
          ...this.config,
          customizations: customizations
        };
        
        // If page is already rendered and customizations changed, check if full render is needed
        // BUT SKIP re-render if we're in edit mode to prevent breaking drag and drop
        if (this._rendered && JSON.stringify(oldCustomizations) !== JSON.stringify(customizations)) {
          const isInEditMode = this.editModeManager?.editMode;
          
          if (!isInEditMode) {
            // Check if the changes require a full render or just UI updates
            const needsFullRender = this.customizationChangesRequireRender(oldCustomizations, customizations);
            
            if (needsFullRender) {
              this._rendered = false;
              this.renderPage('customizationChange');
            }
          }
        }
      }
      
    } catch (error) {
      console.error('🏠 APPLE HOME: Error loading customizations:', error);
    }
  }

  /**
   * Check if customization changes require a full page render
   * vs just UI-only updates (like background, header/sidebar visibility)
   */
  private customizationChangesRequireRender(oldCustomizations: any, newCustomizations: any): boolean {
    // Entity-related changes that require full render
    const entityChangingKeys = ['home', 'pages'];
    
    for (const key of entityChangingKeys) {
      if (JSON.stringify(oldCustomizations?.[key]) !== JSON.stringify(newCustomizations?.[key])) {
        return true;
      }
    }
    
    return false;
  }


  /**
   * Detect if this is a navigation change vs regular hass update
   */
  private isNavigationChange(oldHass: any, newHass: any): boolean {
    if (!oldHass) return true; // First load
    
    // Check if this component needs to render different content
    // This is more conservative than always re-rendering
    const hasContent = this.content && this.content.children.length > 0;
    const hasChips = this.chipsElement && this.chipsElement.isConfigured();
    
    // Force recreation if content or chips are missing (indicating navigation)
    if (!hasContent || !hasChips) {
      return true;
    }
    
    return false;
  }

  /**
   * CRITICAL FIX: Force complete component recreation
   * This solves navigation state issues by ensuring clean state
   */
  private forceCompleteRecreation() {
    
    // Reset all state flags
    this._rendered = false;
    
    // Clear chips reference to force recreation
    if (this.chipsElement) {
      this.chipsElement = undefined;
    }
    
    // Ensure shadow root is properly initialized
    this.ensureShadowRootExists();
    
    // Remove only dynamic content, keep permanent elements (header, chips) in place
    if (this.content) {
      const permanentSelectors = ['.apple-home-header.permanent-header', '.permanent-chips'];
      Array.from(this.content.children).forEach(child => {
        const isPermanent = permanentSelectors.some(sel => child.matches(sel));
        if (!isPermanent) child.remove();
      });

      const permanentChips = this.content.querySelector('.permanent-chips') as HTMLElement;
      if (permanentChips) {
        this.chipsElement = new AppleChips(permanentChips, this.customizationManager);
        this.setupChipsCallback();
      }
    }
  }

  private async ensureShadowRootExists() {
    let structureCreated = false;
    
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
    }
    
    // Check if HTML structure exists, not just shadow root
    const wrapperContent = this.shadowRoot!.querySelector('.wrapper-content');
    if (!wrapperContent) {
      structureCreated = true;
      this.shadowRoot!.innerHTML = `
        <style>
          /* ============================================
             Responsive Design System
             ============================================
             Breakpoints:
             - Desktop: > 1199px (4 columns)
             - Tablet: 768px - 1199px (3 columns)
             - Mobile: 480px - 767px (2 columns)
             - Small Mobile: 360px - 479px (2 columns, smaller)
             - Extra Small / Accessibility: < 360px (1 column)
             
             Accessibility considerations:
             - Respects prefers-reduced-motion
             - Scales with user font-size preferences
             - Single column for accessibility enlarged displays
             ============================================ */
          
          :host {
            display: block;
            padding: 0 var(--apple-page-padding, 22px) var(--apple-page-padding-bottom, 22px) var(--apple-page-padding, 22px);
            box-sizing: border-box;
            width: 100%;
            background: transparent;
            position: relative;
            /* Enable container queries - responds to available space, not screen */
            container-type: inline-size;
            container-name: apple-home-view;
            /* Local variables - only for values that need container-specific overrides */
            --card-gap: var(--apple-card-gap, 10px);
            --section-margin: var(--apple-section-gap, 20px);
          }
          
          /* Reduce motion for accessibility */
          @media (prefers-reduced-motion: reduce) {
            :host * {
              animation-duration: 0.01ms !important;
              animation-iteration-count: 1 !important;
              transition-duration: 0.01ms !important;
            }
          }
          
          .wrapper-content {
            width: 100%;
            max-width: none;
          }
          
          .permanent-chips {
            display: block;
            width: 100%;
            position: relative;
          }
          
          /* Page title (big title below header) */
          .apple-page-title {
            font-size: var(--apple-title-size, 28px);
            font-weight: 700;
            color: #ffffff;
            margin: 10px 0 15px 0;
            letter-spacing: -0.5px;
            line-height: 1.2;
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
            display: block;
            visibility: visible;
          }
          
          .area-section {
            margin-bottom: var(--section-margin);
          }
          .area-title {
            font-weight: 600;
            font-size: var(--apple-section-title-size, 17px);
            color: #fff;
            margin: 20px 0 6px;
            padding: 0;
            letter-spacing: 0.2px;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }

          /* Special section titles (Scenes, Cameras) */
          .apple-home-section-title {
            font-size: var(--apple-section-title-size, 17px);
            font-weight: 600;
            color: #fff;
            margin: 20px 0 6px;
            padding: 0;
            letter-spacing: 0.2px;
          }

          /* Clickable section titles with arrows */
          .clickable-section-title {
            display: inline-flex;
            align-items: center;
            justify-content: flex-start;
            cursor: pointer;
            transition: opacity 0.2s ease;
            user-select: none;
            font-size: inherit;
            font-weight: inherit;
            color: inherit;
          }

          .clickable-section-title .section-arrow {
            color: rgba(255, 255, 255, 0.6);
            --mdc-icon-size: 22px;
            transition: color 0.2s ease;
          }

          /* Special section titles (Scenes, Cameras) */
          .permanent-chips + .apple-home-section-title, .permanent-chips + .area-title,
          .apple-status-section + .apple-home-section-title,
          .apple-status-section + .area-title {
            margin: 12px 0 6px;
          }

          /* Carousel grid styles - extends to screen edge like Apple Home */
          .carousel-container {
            overflow-x: auto;
            overflow-y: hidden;
            margin-bottom: var(--section-margin);
            contain: layout style;
            margin-inline-start: calc(-1 * var(--apple-page-padding, 22px));
            margin-inline-end: calc(-1 * var(--apple-page-padding, 22px));
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none; /* Firefox */
            -ms-overflow-style: none; /* IE/Edge */
            user-select: none;
          }

          .carousel-container::-webkit-scrollbar {
            display: none; /* Chrome/Safari */
          }

          .carousel-grid {
            display: inline-flex;
            gap: var(--card-gap);
            padding-inline-start: var(--apple-page-padding, 22px);
            padding-inline-end: var(--apple-page-padding, 22px);
            min-width: 100%;
            box-sizing: border-box;
          }

          /* Scenes carousel - cards about 90% of regular card width like Apple Home */
          .carousel-grid.scenes {
            gap: var(--card-gap);
          }
          
          .carousel-grid.scenes .entity-card-wrapper {
            /* Scene cards are 90% of regular card width and height */
            /* 4 columns: (100cqw - 3 gaps) / 4 * 0.9 */
            flex: 0 0 calc((100cqw - 3 * var(--card-gap, 10px)) / 4 * 0.9);
            height: calc(var(--apple-card-height, 70px) * 0.9);
          }

          /* Camera carousel - Apple-style tight grid */
          .carousel-grid.cameras {
            gap: 2px; /* Very tight spacing like Apple Home */
            /* Remove end padding as we'll use a spacer approach for percentage-based widths */
            padding-inline-end: 0;
          }
          
          /* Camera carousel: add spacer at end to maintain edge padding */
          .carousel-grid.cameras::after {
            content: '';
            flex-shrink: 0;
            width: var(--apple-page-padding, 22px);
            min-width: var(--apple-page-padding, 22px);
          }

          .carousel-grid .entity-card-wrapper {
            flex: 0 0 auto;
            width: calc(23% - 9px); /* Match regular grid sizing (span 3 of 12) */
            height: var(--apple-card-height, 70px);
            display: flex;
            flex-direction: column;
            position: relative;
            grid-column: unset; /* Override grid column for carousel */
          }

          .carousel-grid.cameras .entity-card-wrapper {
            height: var(--apple-camera-height, 180px); /* Taller for cameras */
            /* Camera cards are 120% of regular card width on desktop */
            /* 4 columns: (100cqw - 3 gaps) / 4 * 1.2 */
            flex: 0 0 calc((100cqw - 3 * var(--card-gap, 10px)) / 4 * 1.2);
          }

          /* Ensure camera cards are always tall in carousel */
          .carousel-grid.cameras .entity-card-wrapper {
            grid-row: unset; /* Override grid row */
          }

          /* Apple-style camera card border radius - handled at element level */
          .carousel-grid.cameras .entity-card-wrapper apple-home-card {
            overflow: hidden;
          }

          /* Default border radius for all apple-home-card elements */
          apple-home-card {
            border-radius: var(--apple-card-radius, 25px);
            overflow: hidden;
          }

          /* Camera carousel: remove border radius from middle cards */
          .carousel-grid.cameras .entity-card-wrapper apple-home-card {
            border-radius: 0;
          }

          /* Camera carousel: first card gets left rounded corners */
          .carousel-grid.cameras .entity-card-wrapper:first-child apple-home-card {
            border-radius: var(--apple-card-radius, 25px) 0 0 var(--apple-card-radius, 25px);
          }

          /* Camera carousel: last card gets right rounded corners */
          .carousel-grid.cameras .entity-card-wrapper:last-child apple-home-card {
            border-radius: 0 var(--apple-card-radius, 25px) var(--apple-card-radius, 25px) 0;
          }

          /* Camera carousel: single card gets full rounded corners */
          .carousel-grid.cameras .entity-card-wrapper:first-child:last-child apple-home-card {
            border-radius: var(--apple-card-radius, 25px);
          }

          /* RTL Support for camera carousel border-radius */
          .wrapper-content.rtl .carousel-grid.cameras .entity-card-wrapper:first-child apple-home-card {
            border-radius: 0 var(--apple-card-radius, 25px) var(--apple-card-radius, 25px) 0; /* Right rounded corners in RTL */
          }

          .wrapper-content.rtl .carousel-grid.cameras .entity-card-wrapper:last-child apple-home-card {
            border-radius: var(--apple-card-radius, 25px) 0 0 var(--apple-card-radius, 25px); /* Left rounded corners in RTL */
          }

          /* Ensure edit mode works properly with carousels */
          .carousel-grid .entity-card-wrapper.edit-mode {
            transition: transform 0.2s ease, opacity 0.2s ease;
            animation: apple-home-shake 1.3s ease-in-out infinite;
            touch-action: none;
          }

          /* Weather + Energy side-by-side row */
          .weather-energy-row {
            display: flex;
            gap: 12px;
            margin-top: 20px;
            align-items: stretch;
          }
          .weather-energy-row .apple-weather-card,
          .weather-energy-row .apple-energy-card {
            flex: 1;
            margin-top: 0;
            width: auto;
            min-width: 0;
            overflow: hidden;
          }
          .weather-energy-row .apple-weather-card {
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          /* Force weather card to stack its inner layout when in the row at medium widths */
          @container apple-home-view (max-width: 1100px) {
            .weather-energy-row .weather-card-inner {
              flex-direction: column;
              gap: 10px;
            }
            .weather-energy-row .weather-clock-side {
              padding-right: 0;
              border-right: none;
              padding-bottom: 10px;
              border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }
          }
          @container apple-home-view (max-width: 755px) {
            .weather-energy-row {
              flex-direction: column;
            }
            .weather-energy-row .apple-weather-card,
            .weather-energy-row .apple-energy-card {
              width: 100%;
            }
            /* Restore weather card's row layout when stacked vertically (has full width) */
            .weather-energy-row .weather-card-inner {
              flex-direction: row;
              gap: 24px;
            }
            .weather-energy-row .weather-clock-side {
              padding-right: 24px;
              border-right: 1px solid rgba(255, 255, 255, 0.1);
              padding-bottom: 0;
              border-bottom: none;
            }
          }
          @container apple-home-view (max-width: 555px) {
            .weather-energy-row .weather-card-inner {
              flex-direction: column;
              gap: 10px;
              text-align: center;
            }
            .weather-energy-row .weather-clock-side {
              padding-right: 0;
              border-right: none;
              padding-bottom: 10px;
              border-bottom: 1px solid rgba(255, 255, 255, 0.1);
              align-items: center;
            }
          }

          /* Grid layouts for special pages (non-carousel) */
          .room-group-grid, .scenes-grid, .cameras-grid {
            display: grid;
            grid-template-columns: repeat(12, 1fr);
            grid-auto-rows: var(--apple-card-height, 70px);
            gap: var(--card-gap);
            margin-bottom: var(--section-margin);
            contain: layout style;
          }

          .room-group-grid .entity-card-wrapper,
          .scenes-grid .entity-card-wrapper,
          .cameras-grid .entity-card-wrapper {
            grid-column: span 3; /* Default: 4 columns */
            display: flex;
            flex-direction: column;
            position: relative;
          }

          /* Cameras should be tall by default in grid view */
          .cameras-grid .entity-card-wrapper {
            grid-row: span 2;
          }

          /* Room group section titles */
          .room-group-title {
            font-size: var(--apple-section-title-size, 17px);
            font-weight: 600;
            color: #fff;
            margin: 30px 0 16px;
            padding: 0;
            letter-spacing: 0.3px;
          }

          /* Group section spacing */
          .room-group-section {
            margin-bottom: var(--section-margin);
          }

          .room-group-section:last-child {
            margin-bottom: 16px;
          }
          
          .area-entities {
            display: grid;
            grid-template-columns: repeat(12, 1fr);
            grid-auto-rows: var(--apple-card-height, 70px);
            gap: var(--card-gap);
            margin-bottom: 24px;
          }
          
          .entity-card-wrapper {
            grid-column: span 3; /* Default: 4 columns */
            display: flex;
            flex-direction: column;
            position: relative;
          }
          
          .entity-card-wrapper.edit-mode {
            transition: transform 0.2s ease, opacity 0.2s ease;
            animation: apple-home-shake 1.3s ease-in-out infinite;
            touch-action: none; /* Prevent default touch behaviors for drag */
          }
          
          /* Mobile: Better touch feedback */
          @media (hover: none) and (pointer: coarse) {
            .entity-card-wrapper.edit-mode {
              /* Stronger visual feedback for touch */
              animation: apple-home-shake 1.8s ease-in-out infinite;
              touch-action: none;
            }
          }
          
          @keyframes apple-home-shake {
            0%, 100% { transform: translateX(0px) rotate(0deg); }
            10% { transform: translateX(-1px) rotate(-0.6deg); }
            20% { transform: translateX(1px) rotate(0.6deg); }
            30% { transform: translateX(-1px) rotate(-0.6deg); }
            40% { transform: translateX(1px) rotate(0.6deg); }
            50% { transform: translateX(-1px) rotate(-0.6deg); }
            60% { transform: translateX(1px) rotate(0.6deg); }
            70% { transform: translateX(-1px) rotate(-0.6deg); }
            80% { transform: translateX(1px) rotate(0.6deg); }
            90% { transform: translateX(-1px) rotate(-0.6deg); }
          }
          
          /* Drag and drop styles */
          .drag-placeholder {
            background: transparent !important;
            border: none !important;
            transition: opacity 0.2s ease !important;
            pointer-events: none !important;
            min-height: 70px !important;
            position: relative !important;
          }
          
          /* SortableJS ghost element - the placeholder left behind (empty space indicator) */
          .sortable-ghost {
            opacity: 0.2 !important;
            background: rgba(255, 255, 255, 0.05) !important;
            border-radius: var(--apple-card-radius, 25px) !important;
            box-shadow: none !important;
          }
          
          .sortable-ghost > * {
            opacity: 0 !important;
          }
          
          /* SortableJS chosen element - the original element being dragged */
          .sortable-chosen {
            /* Keep original appearance but disable animations */
            animation: none !important;
          }
          
          /* SortableJS drag element - during native drag (not used with forceFallback) */
          .sortable-drag {
            opacity: 1 !important;
          }
          
          /* SortableJS fallback element - the floating clone that follows cursor/touch */
          .sortable-fallback {
            position: fixed !important;
            opacity: 1 !important;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5) !important;
            transform: scale(1.05) rotate(2deg) !important;
            border-radius: var(--apple-card-radius, 25px) !important;
            z-index: 100000 !important;
            pointer-events: none !important;
            transition: none !important;
          }
          
          /* Smooth transitions for cards making room during drag operations */
          .entity-card-wrapper:not(.dragging):not(.sortable-ghost) {
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          }
          
          .entity-card-wrapper.dragging,
          .entity-card-wrapper.sortable-chosen {
            /* Dragging styles */
            animation: none !important; /* Disable shake animation during drag */
          }
          
          .entity-card-wrapper.animating {
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          }
          
          /* Chip wrapper sortable styles */
          /* Ghost placeholder - hide completely, we just show the gap */
          .chip-wrapper.sortable-ghost {
            opacity: 0 !important;
            visibility: hidden !important;
          }
          
          .chip-wrapper.sortable-ghost > * {
            opacity: 0 !important;
            visibility: hidden !important;
          }
          
          /* Hide the original chip being dragged (matches scene card behavior) */
          .chip-wrapper.sortable-drag {
            opacity: 0 !important;
            visibility: hidden !important;
            transition: none !important;
          }
          
          /* Chip sortable fallback - the floating clone that follows cursor/touch */
          .chip-wrapper.sortable-fallback {
            position: fixed !important;
            opacity: 1 !important;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5) !important;
            transform: scale(1.05) rotate(2deg) !important;
            border-radius: var(--apple-chip-radius, 50px) !important;
            z-index: 100000 !important;
            pointer-events: none !important;
            transition: none !important;
          }
          
          /* Ensure the chip inside fallback is properly styled */
          .chip-wrapper.sortable-fallback .chip {
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
            padding: 4px 20px 4px 10px !important;
            border-radius: var(--apple-chip-radius, 50px) !important;
            background: rgba(255, 255, 255, 0.25) !important;
            backdrop-filter: blur(20px) !important;
            -webkit-backdrop-filter: blur(20px) !important;
          }
          
          /* Smooth transitions for chips making room during drag */
          .chip-wrapper:not(.dragging):not(.sortable-ghost) {
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          }
          
          .chip-wrapper.sortable-chosen,
          .chip-wrapper.dragging {
            animation: none !important; /* Disable shake animation during drag */
          }
          
          .entity-controls {
            position: absolute;
            top: -8px;
            right: -8px;
            display: none;
            gap: 4px;
            z-index: 10;
            opacity: 0.99;
            transform: scaleX(-1);
          }
          
          :host(.edit-mode) .entity-controls,
          .edit-mode .entity-controls,
          .entity-card-wrapper.edit-mode .entity-controls {
            display: flex !important;
          }
          
          .entity-control-btn {
            background: rgb(234 234 234 / 90%);
            border: none;
            border-radius: 50%;
            width: 28px;
            height: 28px;
            color: #666;
            cursor: pointer;
            font-size: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background-color 0.2s ease, color 0.2s ease, opacity 0.2s ease;
            backdrop-filter: blur(10px);
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          }
          
          .entity-control-btn.tall-toggle {
            background: #dfdfdfe6;
            color: #3d3d3d;
            font-size: 14px;
            font-weight: 600;
            line-height: 1;
          }
          
          .entity-control-btn.tall-toggle ha-icon {
            --mdc-icon-size: 18px;
          }
          
          .entity-control-btn.tall-toggle.active {
            background: rgba(255, 255, 255, 0.9);
            color: #666;
          }
          
          .entity-card-wrapper.tall {
            grid-row: span 2;
          }
          
          /* ============================================
             EXTRA LARGE CONTAINER (1356px+ container = 1400px+ viewport)
             6 columns layout - like Apple Home on large screens
             Uses container query - responds to available space!
             ============================================ */
          @container apple-home-view (min-width: 1356px) {
            .entity-card-wrapper,
            .room-group-grid .entity-card-wrapper,
            .scenes-grid .entity-card-wrapper,
            .cameras-grid .entity-card-wrapper {
              grid-column: span var(--apple-card-span-xl, 2); /* 6 columns */
            }

            /* Carousel adjustments for XL */
            .carousel-grid .entity-card-wrapper {
              width: calc(16.666% - 8px); /* 6 columns */
            }

            /* Scene carousel - 90% of 6-column card width */
            .carousel-grid.scenes .entity-card-wrapper {
              /* 6 columns: (100cqw - 5 gaps) / 6 * 0.9 */
              flex: 0 0 calc((100cqw - 5 * var(--card-gap, 10px)) / 6 * 0.9);
            }

            /* Camera carousel - 120% of 6-column card width */
            .carousel-grid.cameras .entity-card-wrapper {
              height: var(--apple-camera-height, 180px);
              /* 6 columns: (100cqw - 5 gaps) / 6 * 1.2 */
              flex: 0 0 calc((100cqw - 5 * var(--card-gap, 10px)) / 6 * 1.2);
            }
          }

          /* ============================================
             LARGE CONTAINER (1056-1355px container = 1100-1399px viewport)
             4 columns layout
             ============================================ */
          @container apple-home-view (min-width: 1056px) and (max-width: 1355px) {
            .entity-card-wrapper,
            .room-group-grid .entity-card-wrapper,
            .scenes-grid .entity-card-wrapper,
            .cameras-grid .entity-card-wrapper {
              grid-column: span var(--apple-card-span-desktop, 3); /* 4 columns */
            }

            /* Carousel adjustments */
            .carousel-grid .entity-card-wrapper {
              width: calc(25% - 8px); /* 4 columns */
            }

            /* Scene carousel - 90% of 4-column card width */
            .carousel-grid.scenes .entity-card-wrapper {
              /* 4 columns: (100cqw - 3 gaps) / 4 * 0.9 */
              flex: 0 0 calc((100cqw - 3 * var(--card-gap, 10px)) / 4 * 0.9);
            }

            /* Camera carousel - 120% of 4-column card width */
            .carousel-grid.cameras .entity-card-wrapper {
              height: var(--apple-camera-height, 180px);
              /* 4 columns: (100cqw - 3 gaps) / 4 * 1.2 */
              flex: 0 0 calc((100cqw - 3 * var(--card-gap, 10px)) / 4 * 1.2);
            }
          }

          /* ============================================
             MEDIUM CONTAINER (756-1055px container = 800-1099px viewport)
             4 columns layout - good for tablet landscape
             ============================================ */
          @container apple-home-view (min-width: 756px) and (max-width: 1055px) {
            .wrapper-content {
              --card-gap: 10px;
            }
            
            .entity-card-wrapper,
            .room-group-grid .entity-card-wrapper,
            .scenes-grid .entity-card-wrapper,
            .cameras-grid .entity-card-wrapper {
              grid-column: span var(--apple-card-span-desktop, 3); /* 4 columns */
            }

            /* Carousel adjustments for medium */
            .carousel-grid .entity-card-wrapper {
              width: calc(25% - 8px); /* 4 columns */
            }

            /* Scene carousel - 90% of 4-column card width */
            .carousel-grid.scenes .entity-card-wrapper {
              /* 4 columns: (100cqw - 3 gaps) / 4 * 0.9 */
              flex: 0 0 calc((100cqw - 3 * var(--card-gap, 10px)) / 4 * 0.9);
            }

            /* Camera carousel - 120% of 4-column card width */
            .carousel-grid.cameras .entity-card-wrapper {
              height: var(--apple-camera-height, 220px);
              /* 4 columns: (100cqw - 3 gaps) / 4 * 1.2 */
              flex: 0 0 calc((100cqw - 3 * var(--card-gap, 10px)) / 4 * 1.2);
            }
          }

          /* ============================================
             TABLET CONTAINER (556-755px container = 600-799px viewport)
             3 columns layout
             ============================================ */
          @container apple-home-view (min-width: 556px) and (max-width: 755px) {
            .wrapper-content {
              --card-gap: 10px;
            }
            
            .entity-card-wrapper,
            .room-group-grid .entity-card-wrapper,
            .scenes-grid .entity-card-wrapper,
            .cameras-grid .entity-card-wrapper {
              grid-column: span var(--apple-card-span-tablet, 4); /* 3 columns */
            }

            /* Carousel adjustments for tablet */
            .carousel-grid .entity-card-wrapper {
              width: calc(33.333% - 8px); /* 3 columns */
            }

            /* Scene carousel - 90% of 3-column card width */
            .carousel-grid.scenes .entity-card-wrapper {
              /* 3 columns: (100cqw - 2 gaps) / 3 * 0.9 */
              flex: 0 0 calc((100cqw - 2 * var(--card-gap, 10px)) / 3 * 0.9);
            }

            /* Camera carousel - 120% of 3-column card width */
            .carousel-grid.cameras .entity-card-wrapper {
              height: var(--apple-camera-height, 220px);
              /* 3 columns: (100cqw - 2 gaps) / 3 * 1.2 */
              flex: 0 0 calc((100cqw - 2 * var(--card-gap, 10px)) / 3 * 1.2);
            }
          }
          
          /* ============================================
             MOBILE CONTAINER (356-555px container = 400-599px viewport)
             2 columns layout
             ============================================ */
          @container apple-home-view (min-width: 356px) and (max-width: 555px) {
            .wrapper-content {
              --card-gap: 10px;
              --section-margin: 18px;
            }
            
            .apple-page-title {
              font-size: var(--apple-title-size, 28px);
              margin-bottom: 10px;
              margin-bottom: 20px;
            }
            
            .entity-card-wrapper,
            .room-group-grid .entity-card-wrapper,
            .scenes-grid .entity-card-wrapper,
            .cameras-grid .entity-card-wrapper {
              grid-column: span var(--apple-card-span-mobile, 6); /* 2 columns */
            }
            
            .entity-card-wrapper.tall {
              grid-row: span 2;
            }

            /* Cameras still tall on mobile */
            .cameras-grid .entity-card-wrapper {
              grid-row: span 2;
            }

            /* Carousel adjustments for mobile */
            .carousel-grid .entity-card-wrapper {
              width: calc(46% - 6px); /* 2 columns */
            }

            /* Scene carousel - 90% of 2-column card width */
            .carousel-grid.scenes .entity-card-wrapper {
              /* 2 columns: (100cqw - 1 gap) / 2 * 0.9 */
              flex: 0 0 calc((100cqw - var(--card-gap, 10px)) / 2 * 0.9);
            }

            /* Camera carousel - 110% of 2-column card width */
            .carousel-grid.cameras .entity-card-wrapper {
              height: var(--apple-camera-height, 220px);
              /* 2 columns: (100cqw - 1 gap) / 2 * 1.1 */
              flex: 0 0 calc((100cqw - var(--card-gap, 10px)) / 2 * 1.1);
            }
            
            /* Touch-friendly controls for mobile */
            .entity-controls {
              top: -10px;
              right: -10px;
              gap: 6px;
            }
            
            .entity-control-btn {
              font-size: 14px;
              padding: 0;
            }
          }

          /* ============================================
             SMALL CONTAINER (316-355px container = 360-399px viewport)
             2 columns but smaller cards
             ============================================ */
          @container apple-home-view (min-width: 316px) and (max-width: 355px) {
            .wrapper-content {
              --card-gap: 8px;
              --section-margin: 16px;
            }
            
            .apple-page-title {
              font-size: 22px;
            }
            
            .area-title,
            .apple-home-section-title,
            .room-group-title {
              font-size: 16px;
              margin-top: 16px;
            }
            
            .entity-card-wrapper,
            .room-group-grid .entity-card-wrapper,
            .scenes-grid .entity-card-wrapper {
              grid-column: span var(--apple-card-span-mobile, 6); /* 2 columns */
            }

            /* Cameras go full width on small container */
            .cameras-grid .entity-card-wrapper {
              grid-column: span 12;
              grid-row: span 2;
            }

            /* Scene carousel - 90% of 2-column card width */
            .carousel-grid.scenes .entity-card-wrapper {
              /* 2 columns: (100cqw - 1 gap) / 2 * 0.9 */
              flex: 0 0 calc((100cqw - var(--card-gap, 8px)) / 2 * 0.9);
            }

            /* Camera carousel - 110% of 2-column card width */
            .carousel-grid.cameras .entity-card-wrapper {
              height: var(--apple-camera-height, 220px);
              /* 2 columns: (100cqw - 1 gap) / 2 * 1.1 */
              flex: 0 0 calc((100cqw - var(--card-gap, 8px)) / 2 * 1.1);
            }
          }

          /* ============================================
             EXTRA SMALL CONTAINER (< 316px container = < 360px viewport)
             Single column layout - like Apple Home
             Also triggered by very narrow containers
             ============================================ */
          @container apple-home-view (max-width: 315px) {
            .wrapper-content {
              --card-gap: 8px;
              --section-margin: 14px;
            }
            
            .apple-page-title {
              font-size: 20px;
            }
            
            .area-title,
            .apple-home-section-title,
            .room-group-title {
              font-size: 15px;
              margin-top: 14px;
            }
            
            .entity-card-wrapper,
            .room-group-grid .entity-card-wrapper,
            .scenes-grid .entity-card-wrapper,
            .cameras-grid .entity-card-wrapper {
              grid-column: span var(--apple-card-span-xs, 12) !important; /* 1 column */
            }

            /* Scene carousel - 90% of 1-column card width */
            .carousel-grid.scenes .entity-card-wrapper {
              /* 1 column: 100cqw * 0.9 */
              flex: 0 0 calc(100cqw * 0.9);
            }

            /* Camera carousel - 100% of 1-column card width */
            .carousel-grid.cameras .entity-card-wrapper {
              height: var(--apple-camera-height, 220px);
              /* 1 column: 100cqw * 1.0 */
              flex: 0 0 100cqw;
            }

            /* Carousel: single item visible */
            .carousel-grid .entity-card-wrapper {
              max-width: 100%;
            }
          }
          
          /* ============================================
             FALLBACK: Media queries for older browsers
             or when container queries don't apply
             Uses viewport width (not container) - slightly different thresholds
             ============================================ */
          @media (max-width: 359px) {
            :host {
              padding: 0 var(--apple-page-padding, 10px) var(--apple-page-padding-bottom, 10px) var(--apple-page-padding, 10px);
              --card-gap: 8px;
              --section-margin: 14px;
            }
            
            .apple-page-title {
              font-size: 20px;
            }
            
            .area-title,
            .apple-home-section-title,
            .room-group-title {
              font-size: 15px;
              margin-top: 14px;
            }
            
            /* Single column for all cards */
            .entity-card-wrapper {
              grid-column: span var(--apple-card-span-xs, 12) !important;
            }

            .room-group-grid .entity-card-wrapper,
            .scenes-grid .entity-card-wrapper {
              grid-column: span var(--apple-card-span-xs, 12) !important;
            }
            
            /* Tall cards span 2 rows in single column */
            .entity-card-wrapper.tall {
              grid-row: span 2;
            }

            /* Carousel: single item visible */
            .carousel-grid .entity-card-wrapper {
              width: 100% !important;
              max-width: 100%;
            }

            /* Camera carousel - consistent look, 100% width */
            .carousel-grid.cameras .entity-card-wrapper {
              height: var(--apple-camera-height, 220px);
            }
          }
          
          /* ============================================
             ACCESSIBILITY: Large Text / Zoom Detection
             Container queries handle responsive layout properly.
             This fallback only kicks in for extremely narrow viewports
             on high-DPI devices where container queries might not apply.
             ============================================ */
          @media (max-width: 320px) and (min-resolution: 2dppx) {
            /* Very small high DPI screens - accessibility zoom */
            .room-group-grid .entity-card-wrapper,
            .scenes-grid .entity-card-wrapper {
              grid-column: span var(--apple-card-span-xs, 12);
            }
          }
          
          /* Very narrow viewport (accessibility zoom or split screen) */
          @media (max-width: 320px) {
            :host {
              padding: 0 var(--apple-page-padding, 8px) var(--apple-page-padding-bottom, 8px) var(--apple-page-padding, 8px);
            }
            
            .apple-page-title {
              font-size: 20px;
            }
            
            .area-title,
            .apple-home-section-title,
            .room-group-title {
              font-size: 16px;
            }
            
            /* Even smaller cards for very narrow screens */
            .carousel-grid.cameras .entity-card-wrapper {
              height: 150px;
            }
          }
        </style>
        <div class="wrapper-content ${RTLHelper.isRTL() ? 'rtl' : 'ltr'}">
          <div class="page-content">
            <div class="apple-home-header permanent-header"></div>
            <div class="permanent-chips"></div>
          </div>
        </div>
      `;
    }
    
    // Always ensure we have the references after HTML structure exists
    this.content = this.shadowRoot!.querySelector('.page-content') as HTMLElement;
    this.setupContentMutationObserver();

    // Only update chips reference if we don't have one or if it's not connected
    if (!this.chipsElement) {
      const chipsContainer = this.content.querySelector('.permanent-chips') as HTMLElement;
      if (chipsContainer) {
        this.chipsElement = new AppleChips(chipsContainer, this.customizationManager);
        this.setupChipsCallback();
      } else {
      }
    }
    
    // Only initialize header when structure is created for the first time
    // This prevents repeated header initialization calls
    if (structureCreated) {
      await this.updateHeaderForConfig();
    }
  }

  /**
   * Rebuild the entity->card index from the currently rendered DOM. Runs at most
   * once per DOM change (guarded by indexDirty), never on the steady hot path.
   */
  private rebuildEntityCardIndex(): void {
    this.entityCardIndex.clear();
    this.alwaysUpdateCards.clear();
    if (!this.content) {
      this.indexDirty = false;
      return;
    }
    const cards = this.content.querySelectorAll('apple-home-card');
    cards.forEach((el) => {
      const card = el as AppleHomeCard;
      if (card.needsContinuousHass) {
        this.alwaysUpdateCards.add(card);
        return;
      }
      const id = card.entityId;
      if (!id) return;
      let set = this.entityCardIndex.get(id);
      if (!set) {
        set = new Set<AppleHomeCard>();
        this.entityCardIndex.set(id, set);
      }
      set.add(card);
    });
    this.indexDirty = false;
  }

  /**
   * Cheap reference-compare diff of hass.states. HA replaces the state object on
   * every change, so identity inequality == changed. Also reports removed ids.
   * O(#entities) pointer comparisons; no JSON, no per-attribute work.
   */
  private computeChangedEntityIds(oldHass: any, newHass: any): string[] {
    const changed: string[] = [];
    const newStates = newHass?.states;
    if (!newStates) return changed;
    const oldStates = oldHass?.states;
    if (!oldStates) return Object.keys(newStates);
    for (const id in newStates) {
      if (oldStates[id] !== newStates[id]) changed.push(id);
    }
    for (const id in oldStates) {
      if (!(id in newStates)) changed.push(id);
    }
    return changed;
  }

  /**
   * The single page object that is actually rendered for this view instance,
   * selected by pageType. Only this page needs the new hass; the other four
   * page objects are never rendered here.
   */
  private getActivePage(): any {
    switch (this.config?.pageType) {
      case 'group': return this.groupPage;
      case 'room': return this.roomPage;
      case 'scenes': return this.scenesPage;
      case 'cameras': return this.camerasPage;
      default: return this.homePage;
    }
  }

  /**
   * Watch this.content for card add/remove/move (full re-render, edit-mode drag,
   * registry surgical updates) and mark the index dirty for a lazy rebuild on the
   * next push. Observes light DOM only (childList + subtree) — NOT attributes and
   * NOT across shadow boundaries, so in-place card updates and camera image swaps
   * (which live in each card's shadowRoot) never trigger a rebuild.
   */
  private setupContentMutationObserver(): void {
    if (!this.content) return;
    if (this.contentMutationObserver) {
      this.contentMutationObserver.disconnect();
    }
    this.indexDirty = true;
    this.contentMutationObserver = new MutationObserver(() => {
      this.indexDirty = true;
    });
    this.contentMutationObserver.observe(this.content, {
      childList: true,
      subtree: true,
    });
  }

  private updateExistingCards(oldHass: any, newHass: any) {
    if (!this.content || !newHass) return;

    // Rebuild the index only when the card DOM actually changed since last push.
    if (this.indexDirty) {
      this.rebuildEntityCardIndex();
    }

    // Camera (continuous) cards always get the latest hass for snapshot auth.
    this.alwaysUpdateCards.forEach((card) => {
      if (card.hass !== newHass) card.hass = newHass;
    });

    if (!oldHass) {
      // No baseline to diff against (first update / config change): refresh all
      // indexed cards once. Still O(cards) but only on this rare path.
      this.entityCardIndex.forEach((cards) => {
        cards.forEach((card) => {
          if (card.hass !== newHass) card.hass = newHass;
        });
      });
    } else {
      // Steady hot path: touch only cards whose entity changed this push.
      const changedIds = this.computeChangedEntityIds(oldHass, newHass);
      const updated = new Set<AppleHomeCard>();
      for (const id of changedIds) {
        const cards = this.entityCardIndex.get(id);
        if (!cards) continue;
        cards.forEach((card) => {
          if (updated.has(card)) return;
          updated.add(card);
          if (card.hass !== newHass) card.hass = newHass;
        });
      }
    }

    // Active-page guard: only the rendered page object needs the new hass.
    const activePage = this.getActivePage();
    if (activePage) activePage.hass = newHass;
  }

  private handleEditModeChange(editMode: boolean) {
    // Entering edit mode holds customization writes in memory. Every
    // `lovelace/config/save` makes Home Assistant re-render the dashboard from
    // the strategy, which rebuilds this component and resets edit mode - so
    // persisting on each drop would exit edit mode after every single card move.
    // Changes are flushed once, when the user leaves edit mode.
    if (editMode) {
      this.customizationManager.beginDeferredSaves();
    } else {
      void this.customizationManager.flushDeferredSaves();
    }

    // Update chips edit mode
    if (this.chipsElement) {
      this.chipsElement.setEditMode(editMode);
    }
    
    // Handle drag and drop for different page types
    if (this.config?.pageType === 'room') {
      // For room pages, use the main drag and drop manager (same as home page)
      // Room pages now let AppleHomeView handle drag and drop like other sections
      if (editMode) {
        // Enable drag and drop with a small delay to ensure cards are rendered
        setTimeout(() => {
          this.dragAndDropManager!.enableDragAndDrop(this.content!);
          // Update entity wrapper styles for edit mode - SAME AS HOME PAGE
          const entityWrappers = this.content!.querySelectorAll('.entity-card-wrapper');
          entityWrappers.forEach((wrapper) => {
            const element = wrapper as HTMLElement;
            element.classList.toggle('edit-mode', true);
            
            const appleHomeCard = element.querySelector('apple-home-card') as any;
            if (appleHomeCard && typeof appleHomeCard.refreshEditMode === 'function') {
              appleHomeCard.refreshEditMode();
            }
          });
        }, 100);
      } else {
        this.dragAndDropManager!.disableDragAndDrop(this.content!);
        // Update entity wrapper styles when disabling edit mode
        const entityWrappers = this.content!.querySelectorAll('.entity-card-wrapper');
        entityWrappers.forEach((wrapper) => {
          const element = wrapper as HTMLElement;
          element.classList.toggle('edit-mode', false);
        
          const appleHomeCard = element.querySelector('apple-home-card') as any;
          if (appleHomeCard && typeof appleHomeCard.refreshEditMode === 'function') {
            appleHomeCard.refreshEditMode();
          }
        });
        
        // Save current layout when exiting edit mode
        this.saveCurrentLayout();
      }
    } else if (this.config?.pageType === 'cameras') {
      // For cameras pages, use the cameras page's drag and drop handler
      if (this.camerasPage) {
        this.camerasPage.updateDragAndDrop(editMode, this.content!);
      }
    } else if (this.config?.pageType === 'scenes') {
      // For scenes pages, use the scenes page's drag and drop handler
      if (this.scenesPage) {
        this.scenesPage.updateDragAndDrop(editMode, this.content!);
      }
    } else {
      // For home page and other pages, use the main drag and drop manager
      // Update drag and drop based on edit mode
      if (editMode) {
        // Add a small delay to ensure cards are fully rendered
        setTimeout(() => {
          this.dragAndDropManager.enableDragAndDrop(this.content!);
          // Update entity wrapper styles for edit mode
          const entityWrappers = this.content!.querySelectorAll('.entity-card-wrapper');
          entityWrappers.forEach((wrapper) => {
            const element = wrapper as HTMLElement;
            element.classList.toggle('edit-mode', true);
            
            const appleHomeCard = element.querySelector('apple-home-card') as any;
            if (appleHomeCard && typeof appleHomeCard.refreshEditMode === 'function') {
              appleHomeCard.refreshEditMode();
            }
          });
        }, 100);
      } else {
        this.dragAndDropManager.disableDragAndDrop(this.content!);
        // Update entity wrapper styles
        // Update entity wrapper styles for edit mode
        const entityWrappers = this.content!.querySelectorAll('.entity-card-wrapper');
        entityWrappers.forEach((wrapper) => {
          const element = wrapper as HTMLElement;
          element.classList.toggle('edit-mode', false);
        
          const appleHomeCard = element.querySelector('apple-home-card') as any;
          if (appleHomeCard && typeof appleHomeCard.refreshEditMode === 'function') {
            appleHomeCard.refreshEditMode();
          }
        });
        
        // Save current layout when exiting edit mode
        this.saveCurrentLayout();
      }
      
      // Update host styles
          // Update host styles for edit mode
      this.classList.toggle('edit-mode', editMode);
    }
  }

  private setupChipsCallback() {
    if (this.chipsElement) {
      this.chipsElement.setOnRenderCallback(() => {
        // Re-enable drag and drop for chips after they re-render
        if (this.editModeManager.editMode) {
          setTimeout(() => {
            const chipsContainer = this.content?.querySelector('.permanent-chips') as HTMLElement;
            if (chipsContainer) {
              this.dragAndDropManager.enableDragAndDrop(chipsContainer);
            }
          }, 50);
        }
      });
    }
  }

  private updatePage() {
  }

  // All drag-and-drop functionality is now handled by DragAndDropManager

  private async saveCurrentLayout() {
    // Use the customization manager to save
    try {
      await this.customizationManager.saveLayoutToStorage(this._hass!);
    } catch (error) {
      console.error('Error saving layout:', error);
    }
  }

  private handleSaveCurrentOrder(areaId: string) {
    // Implementation for saving the current card order
    const areaContainer = this.content!.querySelector(`[data-area-id="${areaId}"]`);
    if (!areaContainer) return;

    const wrappers = areaContainer.querySelectorAll('.entity-card-wrapper:not(.drag-placeholder)');
    const newOrder: string[] = [];

    wrappers.forEach(wrapper => {
      const entityId = (wrapper as HTMLElement).dataset.entityId;
      if (entityId) {
        newOrder.push(entityId);
      }
    });

    // Save the card order to customizations instead of trying to modify the config
    // This approach persists via Home Assistant storage and doesn't modify immutable objects
    // Use context-specific saving based on page type
    const context = this.getPageContext();
    
    // For room pages, extract the domain from the container's data-device-group attribute
    let domain: string | undefined;
    if (context === 'room') {
      const deviceGroup = (areaContainer as HTMLElement).dataset.deviceGroup;
      domain = deviceGroup;
    }
    
    this.customizationManager.saveCardOrderWithContext(areaId, newOrder, context, domain);
    

  }

  private getPageContext(): string {
    if (this.config?.pageType === 'room') {
      return 'room';
    } else if (this.config?.pageType === 'scenes') {
      return 'scenes';
    } else if (this.config?.pageType === 'cameras') {
      return 'cameras';
    } else if (this.config?.pageType === 'group') {
      return 'group';
    }
    return 'home';
  }

  private async renderPage(source: string = 'unknown') {
    if (!this.content || !this._hass || this._isTransitioning) {
      return;
    }
    
    // Prevent multiple renders within 500ms (accounts for settings save delays)
    const now = Date.now();
    if (now - this._lastRenderTime < 500) {
      return;
    }
    this._lastRenderTime = now;
    
    // Set transition state to prevent concurrent renders
    this._isTransitioning = true;

    // Smooth crossfade on re-renders to avoid visible flash
    const hasExistingContent = this.content && this.content.children.length > 2;

    // Save scroll position before rebuild
    const scrollParent = this.getScrollParent();
    const savedScrollTop = hasExistingContent && scrollParent ? scrollParent.scrollTop : 0;

    if (hasExistingContent) {
      this.content.style.transition = 'opacity 0.15s ease-out';
      this.content.style.opacity = '0';
      await new Promise(r => setTimeout(r, 150));
    }

    // **CRITICAL FIX**: Force complete chips reset when reusing component instance
    this.forceChipsReset();

    // Pause cameras before switching pages
    this.pauseCameras();

    try {
      if (this.config?.pageType === 'group' && this.config?.deviceGroup) {
        // Configure and render group page
        this.groupPage.hass = this._hass;
        this.groupPage.setConfig({
          group: this.config.deviceGroup as DeviceGroup,
          customizations: this.customizationManager.getCustomizations()
        });
        
        await this.groupPage.render(
          this.content,
          this.config.deviceGroup as DeviceGroup,
          this._hass,
          (entityId: string, areaId: string) => this.toggleTallCard(entityId, areaId)
        );
      } else if (this.config?.pageType === 'room' && this.config?.areaId && this.config?.areaName) {
        // Configure and render room page
        this.roomPage.hass = this._hass;
        this.roomPage.setConfig({
          areaId: this.config.areaId,
          customizations: this.customizationManager.getCustomizations()
        });
        
        await this.roomPage.render(
          this.content,
          this.config.areaId,
          this.config.areaName,
          this._hass,
          (entityId: string, areaId: string) => this.toggleTallCard(entityId, areaId)
        );
      } else if (this.config?.pageType === 'scenes') {
        // Configure and render scenes page
        this.scenesPage.hass = this._hass;
        this.scenesPage.setConfig({
          customizations: this.customizationManager.getCustomizations()
        });
        
        await this.scenesPage.render(
          this.content,
          this._hass,
          (entityId: string, areaId: string) => this.toggleTallCard(entityId, areaId)
        );
      } else if (this.config?.pageType === 'cameras') {
        // Configure and render cameras page
        this.camerasPage.hass = this._hass;
        this.camerasPage.setConfig({
          customizations: this.customizationManager.getCustomizations()
        });
        
        await this.camerasPage.render(
          this.content,
          this._hass,
          (entityId: string, areaId: string) => this.toggleTallCard(entityId, areaId)
        );
      } else {
        // Configure and render home page (default)
        const homeTitle = this.config?.title || this._hass?.config?.location_name || localize('pages.my_home');
        this.homePage.hass = this._hass;
        this.homePage.setConfig({
          title: homeTitle,
          customizations: this.customizationManager.getCustomizations()
        });
        
        await this.homePage.render(
          this.content,
          this._hass,
          homeTitle,
          (entityId: string, areaId: string) => this.toggleTallCard(entityId, areaId)
        );
      }
    } catch (error) {
      console.error('Error rendering page:', error);
      this._isTransitioning = false;
    }

    // Mark as rendered immediately after render logic completes
    this._rendered = true;

    // Fade content back in after rebuild
    if (this.content) {
      this.content.style.opacity = '1';
    }

    // Restore scroll position
    if (savedScrollTop > 0 && scrollParent) {
      scrollParent.scrollTop = savedScrollTop;
    }

    // CRITICAL: Ensure chips are recreated and properly configured after page render
    this.ensureChipsExist();
    
    // Update chips after page is rendered to reflect current state
    this.updateChips();
    
    // CRITICAL: Connect chips to header after everything is ready
    setTimeout(() => {
      this.ensureChipsConfiguredForHeader();
    }, 100);

    // Resume cameras after page is rendered
    setTimeout(() => {
      this.resumeCameras();
      this._isTransitioning = false;
    }, 200);
  }

  private configureChips() {
    if (!this.chipsElement) {
      return;
    }
    
    
    // Get chips settings from dashboard config - use defaults if not configured
    const chipsSettings = ChipsConfigurationManager.getSettingsFromConfig(this.config);
    
    // Set configuration from settings
    this.chipsElement.setConfig(chipsSettings.chips_config);
    
    // Set active group if specified in config
    if (this.config?.activeGroup) {
      this.chipsElement.setActiveGroup(this.config.activeGroup);
    }
    
    // Set hass if available
    if (this._hass) {
      this.chipsElement.hass = this._hass;
    }
    
  }

  /**
   * Reset chips configuration for component reuse
   * Since chips are now permanent, we just need to reconfigure them
   */
  private forceChipsReset() {
    
    // Make sure we have the chips reference from the correct location
    if (!this.chipsElement && this.content) {
      const chipsContainer = this.content.querySelector('.permanent-chips') as HTMLElement;
      if (chipsContainer) {
        this.chipsElement = new AppleChips(chipsContainer, this.customizationManager);
        this.setupChipsCallback();
      }
    }
    
    // Clear existing chips content to force clean state
    if (this.chipsElement) {
      this.chipsElement.clearContainer();
    }
    
    // Re-configure chips to ensure they have the proper config
    if (this._hass) {
      this.configureChips();
    } else {
    }
  }

  private ensureChipsExist() {
    
    // Chips are now permanent - just make sure we have the reference
    if (!this.chipsElement && this.content) {
      const chipsContainer = this.content.querySelector('.permanent-chips') as HTMLElement;
      if (chipsContainer) {
        this.chipsElement = new AppleChips(chipsContainer, this.customizationManager);
      }
    }
    
    // Debug chips state
    if (this.chipsElement) {
      
      // CRITICAL FIX: Always ensure chips are properly configured
      // This handles cases where the element exists but lost its config
      if (!this.chipsElement.isConfigured()) {
        this.configureChips();
      }
      
      // Ensure hass is set
      if (!this.chipsElement.hass && this._hass) {
        this.chipsElement.hass = this._hass;
      }
    } else {
    }
    
    // Configure chips for current page type
    if (this.chipsElement && this.chipsElement.isConfigured()) {
      const isGroupPage = this.config?.pageType === 'group';
      const isSpecialPage = ['room', 'scenes', 'cameras'].includes(this.config?.pageType);
      
      if (isGroupPage && this.config?.deviceGroup) {
        // Group page - set active group for highlighting using deviceGroup
        this.chipsElement.setActiveGroup(this.config.deviceGroup);
      } else if (isSpecialPage) {
        // Special pages - clear active group (no highlighting)
        this.chipsElement.setActiveGroup(undefined);
      } else {
        // Home page - clear active group
        this.chipsElement.setActiveGroup(undefined);
      }
    }
  }

  private updateChips() {
    if (this.chipsElement && this._hass) {
      // Only update if hass reference is different
      if (this.chipsElement.hass !== this._hass) {
        this.chipsElement.hass = this._hass;
      }
    }
  }

  // Customization functionality is now handled by CardManager
  private async toggleTallCard(entityId: string, areaId: string, clickedElement?: HTMLElement) {
    // Determine the correct context based on the current page type
    let context = 'home'; // default
    
    if (this.config?.pageType === 'room') {
      context = 'room';
    } else if (this.config?.pageType === 'scenes') {
      context = 'scenes';
    } else if (this.config?.pageType === 'cameras') {
      context = 'cameras';
    } else if (this.config?.pageType === 'group') {
      context = 'group';
    }
    // If pageType is undefined or 'home', context remains 'home'
    
    // Wait for the toggle operation to complete with the correct context
    const newTallState = await this.cardManager.toggleTallCard(entityId, areaId, context);
    
    // Now update the visual to match the new state - target the specific card that was clicked
    this.updateTallCardVisual(entityId, areaId, clickedElement, context);
    
    return newTallState;
  }

  private updateTallCardVisual(entityId: string, areaId: string, clickedElement?: HTMLElement, context?: string) {
    // Try to find the specific card wrapper based on context and entity ID
    let wrapper: HTMLElement | null = null;
    
    // Try context-specific selectors first
    if (context === 'home' && this.config?.pageType !== 'room') {
      // For home page, try to target the specific section based on areaId
      if (areaId === 'favorites') {
        wrapper = this.shadowRoot!.querySelector(`[data-area-id="favorites"] [data-entity-id="${entityId}"]`) as HTMLElement;
      } else if (areaId === 'cameras_section') {
        wrapper = this.shadowRoot!.querySelector(`[data-area-id="cameras_section"] [data-entity-id="${entityId}"]`) as HTMLElement;
      } else if (areaId === 'scenes_section') {
        wrapper = this.shadowRoot!.querySelector(`[data-area-id="scenes_section"] [data-entity-id="${entityId}"]`) as HTMLElement;
      } else {
        // For regular area sections, try to find the card within that specific area
        wrapper = this.shadowRoot!.querySelector(`[data-area-id="${areaId}"] [data-entity-id="${entityId}"]`) as HTMLElement;
      }
    } else {
      // For other contexts (room, cameras page, scenes page), target within the specific area
      wrapper = this.shadowRoot!.querySelector(`[data-area-id="${areaId}"] [data-entity-id="${entityId}"]`) as HTMLElement;
    }
    
    // Fallback to the old method if context-specific targeting fails
    if (!wrapper) {
      wrapper = this.shadowRoot!.querySelector(`[data-entity-id="${entityId}"]`) as HTMLElement;
    }
    
    if (!wrapper) return;
    
    const shouldBeTall = this.cardManager.shouldCardBeTall(entityId, areaId, context || 'home');
    
    // Update the wrapper class for grid sizing
    wrapper.classList.toggle('tall', shouldBeTall);
    
    // Update the card's design class
    const cardElement = wrapper.querySelector('apple-home-card') as any;
    if (cardElement) {
      // Update the card's configuration
      const currentConfig = cardElement.config || {};
      const newConfig = { ...currentConfig, is_tall: shouldBeTall };
      cardElement.setConfig(newConfig);
    }
    
    // Update the button visual state
    const button = wrapper.querySelector('.tall-toggle') as HTMLButtonElement;
    if (button) {
      button.classList.toggle('active', shouldBeTall);
      button.innerHTML = `<ha-icon icon="mdi:${shouldBeTall ? 'arrow-collapse' : 'arrow-expand'}"></ha-icon>`;
      button.title = shouldBeTall ? 'Switch to regular design' : 'Switch to tall design';
    }
  }

  getCardSize() {
    return 1;
  }

  private cleanupCameras() {
    // Find all apple-home-card elements and cleanup their cameras
    if (this.content) {
      const cards = this.content.querySelectorAll('apple-home-card');
      cards.forEach((card: any) => {
        if (card && typeof card.cleanup === 'function') {
          card.cleanup();
        }
      });
    }
  }

  private pauseCameras() {
    // Find all apple-home-card elements and pause their cameras
    if (this.content) {
      const cards = this.content.querySelectorAll('apple-home-card');
      cards.forEach((card: any) => {
        if (card && typeof card.pauseCamera === 'function') {
          card.pauseCamera();
        }
      });
    }
  }

  private resumeCameras() {
    // Find all apple-home-card elements and resume their cameras
    if (this.content) {
      const cards = this.content.querySelectorAll('apple-home-card');
      cards.forEach((card: any) => {
        if (card && typeof card.resumeCamera === 'function') {
          card.resumeCamera();
        }
      });
    }
  }

  private async refreshDashboard() {
    if (this.editModeManager?.editMode || !this._hass || !this.content) return;

    try {
      // Snapshot old customizations
      const oldHome = this.config?.customizations?.home || {};

      // Get fresh customizations
      const fresh = this.customizationManager.getCustomizations();
      this.config = { ...this.config, customizations: JSON.parse(JSON.stringify(fresh)) };
      const newHome = fresh?.home || {};

      let didChange = false;

      // --- Excluded entities ---
      const toRemove = new Set<string>();
      const toAdd = new Set<string>();
      this.diffLists(oldHome.excluded_from_dashboard, newHome.excluded_from_dashboard, toRemove, toAdd);
      if (!this.config?.pageType || this.config?.pageType === 'home') {
        this.diffLists(oldHome.excluded_from_home, newHome.excluded_from_home, toRemove, toAdd);
      }
      for (const entityId of toRemove) { this.fadeOutCard(entityId); didChange = true; }
      for (const entityId of toAdd) { this.addCardToDOM(entityId); didChange = true; }

      // --- Favorites ---
      const oldFav = new Set<string>(oldHome.favorites || []);
      const newFav = new Set<string>(newHome.favorites || []);
      const favRemoved = [...oldFav].filter(e => !newFav.has(e));
      const favAdded = [...newFav].filter(e => !oldFav.has(e));

      // Remove cards from favorites grid
      const favGrid = this.content.querySelector('.area-entities[data-area-id="favorites"]') as HTMLElement;
      for (const entityId of favRemoved) {
        const favCard = favGrid?.querySelector(`.entity-card-wrapper[data-entity-id="${entityId}"]`) as HTMLElement;
        if (favCard) {
          favCard.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
          favCard.style.opacity = '0';
          favCard.style.transform = 'scale(0.8)';
          setTimeout(() => {
            favCard.remove();
            // Clean up empty favorites section
            if (favGrid && favGrid.children.length === 0) {
              this.cleanupEmptySection(favGrid);
            }
          }, 250);
          didChange = true;
        }
      }

      // Add cards to favorites grid
      for (const entityId of favAdded) {
        this.addCardToFavorites(entityId);
        didChange = true;
      }

      // --- Custom header button ---
      const headerButtonChanged =
        oldHome.header_button_icon !== newHome.header_button_icon ||
        oldHome.header_button_path !== newHome.header_button_path;
      if (headerButtonChanged) {
        this.appleHeader.refreshCustomButton();
      }

      // --- Weather entity ---
      const weatherChanged = oldHome.weather_entity !== newHome.weather_entity;
      if (weatherChanged) {
        this._rendered = false;
        await this.renderPage('refreshCallback');
        return;
      }

      // --- Energy toggle ---
      const energyChanged = oldHome.show_energy !== newHome.show_energy;
      if (energyChanged) {
        this._rendered = false;
        await this.renderPage('refreshCallback');
        return;
      }

      // --- Switches toggle ---
      const switchesChanged = oldHome.showSwitches !== newHome.showSwitches;
      const includedSwitchesChanged = JSON.stringify(oldHome.includedSwitches || []) !== JSON.stringify(newHome.includedSwitches || []);
      if (switchesChanged || includedSwitchesChanged) {
        // Switches visibility changed - need rebuild since it affects many cards
        this._rendered = false;
        await this.renderPage('refreshCallback');
        return;
      }

      // --- Extra accessories ---
      const oldExtra = new Set<string>(oldHome.extraAccessories || []);
      const newExtra = new Set<string>(newHome.extraAccessories || []);
      const extraRemoved = [...oldExtra].filter(e => !newExtra.has(e));
      const extraAdded = [...newExtra].filter(e => !oldExtra.has(e));
      for (const entityId of extraRemoved) { this.fadeOutCard(entityId); didChange = true; }
      for (const entityId of extraAdded) { this.addCardToDOM(entityId); didChange = true; }

      // --- Section order ---
      const sectionOrderChanged = JSON.stringify(oldHome.sections?.order) !== JSON.stringify(newHome.sections?.order);
      if (sectionOrderChanged) {
        this._rendered = false;
        await this.renderPage('refreshCallback');
        return;
      }

      // --- Hidden sections ---
      const hiddenChanged = JSON.stringify(oldHome.sections?.hidden || []) !== JSON.stringify(newHome.sections?.hidden || []);
      if (hiddenChanged) {
        this._rendered = false;
        await this.renderPage('refreshCallback');
        return;
      }

      // If nothing changed at all, no need to do anything
      if (!didChange) {
        // Check for any other customization change we didn't handle
        const oldStr = JSON.stringify(oldHome);
        const newStr = JSON.stringify(newHome);
        if (oldStr !== newStr) {
          this._rendered = false;
          await this.renderPage('refreshCallback');
        }
      }

    } catch (error) {
      console.error('Error refreshing dashboard:', error);
    }
  }

  /**
   * Diff two entity lists to find what was added/removed.
   * Items added to an exclude list = entities removed from UI.
   * Items removed from an exclude list = entities added to UI.
   */
  private diffLists(
    oldList: string[] | undefined,
    newList: string[] | undefined,
    toRemoveFromUI: Set<string>,
    toAddToUI: Set<string>
  ): void {
    const oldSet = new Set(oldList || []);
    const newSet = new Set(newList || []);
    // Newly excluded → remove from UI
    for (const e of newSet) { if (!oldSet.has(e)) toRemoveFromUI.add(e); }
    // Newly un-excluded → add to UI
    for (const e of oldSet) { if (!newSet.has(e)) toAddToUI.add(e); }
  }

  /**
   * Create a card element and add it to the correct area grid with fade-in.
   */
  private addCardToDOM(entityId: string): void {
    if (!this._hass || !this.content) return;

    const state = this._hass.states[entityId];
    if (!state) return;

    // Don't add if already in DOM
    if (this.content.querySelector(`.entity-card-wrapper[data-entity-id="${entityId}"]`)) return;

    // Determine area
    const entityReg = this._hass.entities?.[entityId];
    const areaId = entityReg?.area_id
      || (entityReg?.device_id ? this._hass.devices?.[entityReg.device_id]?.area_id : null)
      || 'no_area';

    // Find the area grid
    const grid = this.content.querySelector(`.area-entities[data-area-id="${areaId}"]`) as HTMLElement;
    if (!grid) return; // Area not on this page

    // Create card
    const domain = entityId.split('.')[0];
    const friendlyName = state.attributes?.friendly_name || entityId.split('.')[1].replace(/_/g, ' ');

    const cardElement = document.createElement('apple-home-card') as any;
    cardElement.setConfig({
      type: 'custom:apple-home-card',
      entity: entityId,
      name: friendlyName,
      domain: domain,
      is_tall: false
    });
    cardElement.hass = this._hass;

    const wrapper = document.createElement('div');
    wrapper.className = 'entity-card-wrapper';
    wrapper.dataset.entityId = entityId;

    wrapper.appendChild(cardElement);

    // Fade in
    wrapper.style.opacity = '0';
    wrapper.style.transform = 'scale(0.8)';
    grid.appendChild(wrapper);

    requestAnimationFrame(() => {
      wrapper.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      wrapper.style.opacity = '1';
      wrapper.style.transform = 'scale(1)';
    });
  }

  /**
   * Add a card to the favorites section, creating the section if needed.
   */
  private addCardToFavorites(entityId: string): void {
    if (!this._hass || !this.content) return;

    const state = this._hass.states[entityId];
    if (!state) return;

    // Find or create the favorites grid
    let favGrid = this.content.querySelector('.area-entities[data-area-id="favorites"]') as HTMLElement;
    if (!favGrid) {
      // Create the favorites section
      const titleDiv = document.createElement('div');
      titleDiv.className = 'apple-home-section-title';
      titleDiv.innerHTML = `<span>${localize('section_titles.favorites')}</span>`;

      favGrid = document.createElement('div');
      favGrid.className = 'area-entities';
      favGrid.dataset.areaId = 'favorites';

      // Insert at top of content (after header and chips)
      const firstSection = this.content.querySelector('.apple-home-section-title, .area-title');
      if (firstSection) {
        this.content.insertBefore(favGrid, firstSection);
        this.content.insertBefore(titleDiv, favGrid);
      } else {
        this.content.appendChild(titleDiv);
        this.content.appendChild(favGrid);
      }
    }

    // Don't add if already in favorites grid
    if (favGrid.querySelector(`.entity-card-wrapper[data-entity-id="${entityId}"]`)) return;

    const domain = entityId.split('.')[0];
    const friendlyName = state.attributes?.friendly_name || entityId.split('.')[1].replace(/_/g, ' ');

    const cardElement = document.createElement('apple-home-card') as any;
    cardElement.setConfig({
      type: 'custom:apple-home-card',
      entity: entityId,
      name: friendlyName,
      domain: domain,
      is_tall: false
    });
    cardElement.hass = this._hass;

    const wrapper = document.createElement('div');
    wrapper.className = 'entity-card-wrapper';
    wrapper.dataset.entityId = entityId;
    wrapper.appendChild(cardElement);

    wrapper.style.opacity = '0';
    wrapper.style.transform = 'scale(0.8)';
    favGrid.appendChild(wrapper);

    requestAnimationFrame(() => {
      wrapper.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      wrapper.style.opacity = '1';
      wrapper.style.transform = 'scale(1)';
    });
  }

  private getScrollParent(): Element | null {
    let el: Element | null = this;
    while (el) {
      // Check host element if inside shadow DOM
      if (el instanceof ShadowRoot) {
        el = (el as ShadowRoot).host;
        continue;
      }
      if (el instanceof HTMLElement) {
        const style = window.getComputedStyle(el);
        if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight) {
          return el;
        }
      }
      el = el.parentElement || (el.getRootNode() as ShadowRoot)?.host || null;
    }
    return document.scrollingElement || document.documentElement;
  }
}
