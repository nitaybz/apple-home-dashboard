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

export class AppleHomeView extends HTMLElement {
  // Dashboard-specific management - keyed by dashboard URL base
  private static dashboardActiveInstances = new Map<string, AppleHomeView>();
  private static dashboardStateListeners = new Map<string, (isActive: boolean) => void>();
  
  private config?: any;
  private _hass?: any;
  private _config?: any;
  private content?: HTMLElement;
  private _rendered = false;
  private _isTransitioning = false; // Add transition state
  private _lastRenderTime = 0; // Track when last render happened
  private _modeSwitchDebounce: number | null = null; // Prevent rapid mode switching
  private chipsElement?: AppleChips;
  private visibilityChangeHandler?: () => void; // Add visibility change handler
  private globalRefreshHandler?: (event: Event) => void; // Add global refresh handler
  private currentDashboardKey: string = 'default'; // Track current dashboard key
  
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
      (areaId) => this.handleSaveCurrentOrder(areaId),
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
    
    // Note: Dashboard registration is handled by the strategy when it generates the dashboard
    // The DashboardStateManager tracks which dashboards are Apple Home dashboards
    
    // CRITICAL: Set this as the active instance for this dashboard
    this.setCurrentActiveInstance(this);

  }

  disconnectedCallback() {
    // Clean up event listeners
    if (this.visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
    }
    if (this.globalRefreshHandler) {
      document.removeEventListener('apple-home-dashboard-refresh', this.globalRefreshHandler);
    }
    
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

  async setConfig(config: any) {
    
    // Store old config for comparison
    const oldConfig = this._config;
    
    // CRITICAL FIX: Force complete reset on every config change
    // This prevents state corruption during navigation
    this._rendered = false;
    
    
    // Check if this is actually a different config
    const configChanged = JSON.stringify(this.config) !== JSON.stringify(config);
    
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
    
    // Update existing cards with new hass if available
    this.updateExistingCards(this._hass);
    
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
      // Optimized updates: just update existing components with new hass
      this.updateExistingCards(this._hass);
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
    
    // Clear existing content but preserve permanent elements (header, chips)
    if (this.content) {
      // Save permanent elements before clearing
      const permanentHeader = this.content.querySelector('.apple-home-header.permanent-header');
      const permanentChips = this.content.querySelector('.permanent-chips');
      
      this.content.innerHTML = '';
      
      // Restore permanent elements in correct order
      if (permanentHeader) {
        this.content.appendChild(permanentHeader);
      }
      if (permanentChips) {
        this.content.appendChild(permanentChips);
        this.chipsElement = new AppleChips(permanentChips as HTMLElement, this.customizationManager);
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
            padding: 0 22px 22px 22px;
            box-sizing: border-box;
            width: 100%;
            background: transparent;
            position: relative;
            /* CSS custom properties for responsive sizing */
            --card-gap: 12px;
            --card-row-height: 80px;
            --section-margin: 32px;
            --title-font-size: 34px;
            --section-title-font-size: 20px;
            --page-padding: 22px;
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
            font-size: clamp(24px, 7vw, var(--title-font-size));
            font-weight: 700;
            color: #ffffff;
            margin: 0 0 14px 0;
            letter-spacing: -0.8px;
            line-height: 1.2;
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
            display: block;
            visibility: visible;
          }
          
          .area-section {
            margin-bottom: var(--section-margin);
          }
          .area-title {
            font-weight: 500;
            font-size: clamp(17px, 4.5vw, var(--section-title-font-size));
            color: #fff;
            margin: 30px 0 6px;
            padding: 0;
            letter-spacing: 0.3px;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }

          /* Special section titles (Scenes, Cameras) */
          .apple-home-section-title {
            font-size: clamp(17px, 4.5vw, var(--section-title-font-size));
            font-weight: 500;
            color: #fff;
            margin: 30px 0 6px;
            padding: 0;
            letter-spacing: 0.4px;
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
            --mdc-icon-size: clamp(22px, 5vw, 26px);
            transition: color 0.2s ease;
          }

          /* Special section titles (Scenes, Cameras) */
          .permanent-chips + .apple-home-section-title, .permanent-chips + .area-title,
          .apple-status-section + .apple-home-section-title,
          .apple-status-section + .area-title {
            margin: 16px 0 6px;
          }

          /* Carousel grid styles */
          .carousel-container {
            overflow-x: auto;
            overflow-y: hidden;
            margin-bottom: var(--section-margin);
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none; /* Firefox */
            -ms-overflow-style: none; /* IE/Edge */
            user-select: none;
          }

          .carousel-container::-webkit-scrollbar {
            display: none; /* Chrome/Safari */
          }

          .carousel-grid {
            display: flex;
            gap: var(--card-gap);
          }

          /* Camera carousel - Apple-style tight grid */
          .carousel-grid.cameras {
            gap: 2px; /* Very tight spacing like Apple Home */
            padding: 0 2px; /* Small padding to allow for outer border radius */
          }

          .carousel-grid .entity-card-wrapper {
            flex: 0 0 auto;
            width: calc(23% - 9px); /* Match regular grid sizing (span 3 of 12) */
            height: 70px;
            display: flex;
            flex-direction: column;
            position: relative;
            grid-column: unset; /* Override grid column for carousel */
          }

          .carousel-grid.cameras .entity-card-wrapper {
            height: 210px; /* Taller for cameras */
            width: calc(23% - 1.5px); /* Tighter width for cameras to account for smaller gap */
            min-width: 160px; /* Minimum width to ensure cameras don't get too small */
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
            border-radius: 16px;
            overflow: hidden;
          }

          /* Camera carousel: remove border radius from middle cards */
          .carousel-grid.cameras .entity-card-wrapper apple-home-card {
            border-radius: 0;
          }

          /* Camera carousel: first card gets left rounded corners */
          .carousel-grid.cameras .entity-card-wrapper:first-child apple-home-card {
            border-radius: 16px 0 0 16px;
          }

          /* Camera carousel: last card gets right rounded corners */
          .carousel-grid.cameras .entity-card-wrapper:last-child apple-home-card {
            border-radius: 0 16px 16px 0;
          }

          /* Camera carousel: single card gets full rounded corners */
          .carousel-grid.cameras .entity-card-wrapper:first-child:last-child apple-home-card {
            border-radius: 16px;
          }

          /* RTL Support for camera carousel border-radius */
          .wrapper-content.rtl .carousel-grid.cameras .entity-card-wrapper:first-child apple-home-card {
            border-radius: 0 16px 16px 0; /* Right rounded corners in RTL */
          }

          .wrapper-content.rtl .carousel-grid.cameras .entity-card-wrapper:last-child apple-home-card {
            border-radius: 16px 0 0 16px; /* Left rounded corners in RTL */
          }

          /* Ensure edit mode works properly with carousels */
          .carousel-grid .entity-card-wrapper.edit-mode {
            transition: all 0.2s ease;
            animation: apple-home-shake 1.3s ease-in-out infinite;
            touch-action: none;
          }

          /* Grid layouts for special pages (non-carousel) */
          .room-group-grid, .scenes-grid, .cameras-grid {
            display: grid;
            grid-template-columns: repeat(12, 1fr);
            grid-auto-rows: var(--card-row-height);
            gap: var(--card-gap);
            margin-bottom: var(--section-margin);
          }

          .room-group-grid .entity-card-wrapper,
          .scenes-grid .entity-card-wrapper,
          .cameras-grid .entity-card-wrapper {
            grid-column: span 3;
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
            font-size: clamp(17px, 4.5vw, 20px);
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
            grid-auto-rows: var(--card-row-height);
            gap: var(--card-gap);
            margin-bottom: 24px;
          }
          
          .entity-card-wrapper {
            grid-column: span 3;
            display: flex;
            flex-direction: column;
            position: relative;
          }
          
          .entity-card-wrapper.edit-mode {
            transition: all 0.2s ease;
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
            transition: all 0.2s ease !important;
            pointer-events: none !important;
            min-height: 70px !important;
            position: relative !important;
          }
          
          /* SortableJS ghost element - the placeholder left behind (empty space indicator) */
          .sortable-ghost {
            opacity: 0.2 !important;
            background: rgba(255, 255, 255, 0.05) !important;
            border-radius: 16px !important;
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
            border-radius: 16px !important;
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
            border-radius: 20px !important;
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
            border-radius: 20px !important;
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
            transition: all 0.2s ease;
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
             TABLET BREAKPOINT (768px - 1199px)
             3 columns layout
             ============================================ */
          @media (max-width: 1199px) {
            :host {
              --card-gap: 10px;
              --card-row-height: 76px;
            }
            
            .entity-card-wrapper {
              grid-column: span 4;
            }

            /* Grid pages responsive for tablet */
            .room-group-grid .entity-card-wrapper,
            .scenes-grid .entity-card-wrapper,
            .cameras-grid .entity-card-wrapper {
              grid-column: span 4;
            }

            /* Carousel adjustments for tablet */
            .carousel-grid .entity-card-wrapper {
              width: calc(31.333% - 8px); /* Match tablet grid sizing (span 4 of 12) */
            }

            .carousel-grid.cameras .entity-card-wrapper {
              height: 190px;
              width: calc(31.333% - 0.67px); /* Tighter width for cameras with 2px gap */
            }
          }
          
          /* ============================================
             MOBILE BREAKPOINT (480px - 767px)
             2 columns layout
             ============================================ */
          @media (max-width: 767px) {
            :host {
              padding: 0 16px;
              --card-gap: 10px;
              --card-row-height: 72px;
              --section-margin: 24px;
              --page-padding: 16px;
            }
            
            .apple-page-title {
              font-size: clamp(24px, 7vw, 28px);
              margin-bottom: 10px;
            }
            
            .entity-card-wrapper {
              grid-column: span 6;
            }
            
            .entity-card-wrapper.tall {
              grid-row: span 2;
            }

            /* Grid pages responsive for mobile */
            .room-group-grid .entity-card-wrapper,
            .scenes-grid .entity-card-wrapper,
            .cameras-grid .entity-card-wrapper {
              grid-column: span 6;
            }

            /* Cameras still tall on mobile */
            .cameras-grid .entity-card-wrapper {
              grid-row: span 2;
            }

            /* Carousel adjustments for mobile */
            .carousel-grid .entity-card-wrapper {
              width: calc(46% - 6px); /* Match mobile grid sizing (span 6 of 12) */
            }

            .carousel-grid.cameras .entity-card-wrapper {
              height: 170px;
              width: calc(46% - 1px); /* Tighter width for cameras with 2px gap */
              min-width: 140px;
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
             SMALL MOBILE BREAKPOINT (360px - 479px)
             2 columns but smaller cards
             ============================================ */
          @media (max-width: 479px) {
            :host {
              padding: 0 12px;
              --card-gap: 8px;
              --card-row-height: 68px;
              --section-margin: 20px;
            }
            
            .apple-page-title {
              font-size: 24px;
            }
            
            .area-title,
            .apple-home-section-title,
            .room-group-title {
              font-size: 17px;
              margin-top: 20px;
            }

            /* Cameras go full width on small mobile */
            .cameras-grid .entity-card-wrapper {
              grid-column: span 12;
              grid-row: span 2;
            }

            /* Camera carousel adjustments - show 1.5 cameras */
            .carousel-grid.cameras .entity-card-wrapper {
              height: 160px;
              width: calc(65% - 1px);
              min-width: 180px;
            }
            
            /* Single camera takes more space */
            .carousel-grid.cameras .entity-card-wrapper:first-child:last-child {
              width: 100%;
              max-width: 100%;
            }
            
            /* Two cameras show side by side but larger */
            .carousel-grid.cameras .entity-card-wrapper:first-child:nth-last-child(2),
            .carousel-grid.cameras .entity-card-wrapper:last-child:nth-child(2) {
              width: calc(50% - 1px);
              min-width: 140px;
            }
          }

          /* ============================================
             EXTRA SMALL / ACCESSIBILITY BREAKPOINT (< 360px)
             Single column layout - like Apple Home
             Also triggered by large text/zoom accessibility
             ============================================ */
          @media (max-width: 359px) {
            :host {
              padding: 0 10px;
              --card-gap: 8px;
              --card-row-height: 64px;
              --section-margin: 16px;
            }
            
            .apple-page-title {
              font-size: 22px;
            }
            
            /* Single column for all cards */
            .entity-card-wrapper {
              grid-column: span 12 !important;
            }

            .room-group-grid .entity-card-wrapper,
            .scenes-grid .entity-card-wrapper {
              grid-column: span 12 !important;
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

            /* Camera carousel - full width single camera */
            .carousel-grid.cameras .entity-card-wrapper {
              height: 180px;
              width: 100% !important;
              min-width: auto;
            }
            
            /* All cameras get rounded corners in single column mode */
            .carousel-grid.cameras .entity-card-wrapper apple-home-card {
              border-radius: 16px !important;
            }
          }
          
          /* ============================================
             ACCESSIBILITY: Large Text / Zoom Detection
             When user has accessibility settings for 
             larger text, switch to single column
             ============================================ */
          @media (max-width: 400px) and (min-resolution: 2dppx) {
            /* High DPI small screens - likely accessibility zoom */
            .room-group-grid .entity-card-wrapper,
            .scenes-grid .entity-card-wrapper {
              grid-column: span 12;
            }
          }
          
          /* Very narrow viewport (accessibility zoom or split screen) */
          @media (max-width: 320px) {
            :host {
              padding: 0 8px;
              --card-row-height: 60px;
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

  private updateExistingCards(hass: any) {
    // Update all existing apple-home-card elements with new hass
    // Only update if hass actually changed to avoid unnecessary work
    if (this.content && hass) {
      const cards = this.content.querySelectorAll('apple-home-card');
      cards.forEach((card: any) => {
        if (card && card.hass !== hass) {
          card.hass = hass;
        }
      });
    }
    
    // Update page instances with new hass data
    if (this.homePage) {
      this.homePage.hass = hass;
    }
    if (this.roomPage) {
      this.roomPage.hass = hass;
    }
    if (this.groupPage) {
      this.groupPage.hass = hass;
    }
    if (this.scenesPage) {
      this.scenesPage.hass = hass;
    }
    if (this.camerasPage) {
      this.camerasPage.hass = hass;
    }
  }

  private handleEditModeChange(editMode: boolean) {

    
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
    
    // Add stack trace for debugging (only first few lines)
    const stack = new Error().stack?.split('\n').slice(1, 4).join('\n');
    
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
    }

    // Mark as rendered immediately after render logic completes
    this._rendered = true;

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
    // Skip refresh if we're in edit mode to prevent breaking drag and drop
    if (this.editModeManager?.editMode) {
      return;
    }
    
    // Force re-render with updated customizations
    if (!this._hass) return;
    
    try {
      // Get fresh customizations from the manager
      const freshCustomizations = this.customizationManager.getCustomizations();
      
      // Update config with fresh customizations (always update to ensure sync)
      this.config = {
        ...this.config,
        customizations: JSON.parse(JSON.stringify(freshCustomizations)) // Deep clone to ensure change detection works
      };
      
      // Force re-render - the callback was triggered because something changed
      this._rendered = false;
      await this.renderPage('refreshCallback');
      
    } catch (error) {
      console.error('Error refreshing dashboard:', error);
      // Fallback: just re-render existing page
      this._rendered = false;
      await this.renderPage('refreshCallback-error');
    }
  }
}
