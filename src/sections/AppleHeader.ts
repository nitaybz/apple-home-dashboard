import { HomeAssistantUIManager } from '../utils/HomeAssistantUIManager';
import { SectionReorderManager } from '../utils/SectionReorderManager';
import { CustomizationManager } from '../utils/CustomizationManager';
import { EditModeManager } from '../utils/EditModeManager';
import { HomeSettingsManager } from '../utils/HomeSettingsManager';
import { AppleChips, ChipsConfig } from './AppleChips';
import { DeviceGroup } from '../config/DashboardConfig';
import { EntityState } from '../types/types';
import { localize } from '../utils/LocalizationService';
import { RTLHelper } from '../utils/RTLHelper';
import { injectLiquidGlassStyles, LiquidGlassClasses, liquidGlassCSS } from '../utils/LiquidGlassStyles';

export interface HeaderConfig {
  title: string;
  isGroupPage: boolean;
  isSpecialPage?: boolean;
  showMenu: boolean;
  showBackButton?: boolean;
  chipsElement?: HTMLElement;
}

export class AppleHeader {
  private static instance: AppleHeader | null = null;
  private headerElement?: HTMLElement;
  private titleElement?: HTMLElement;
  private scrolledTitleElement?: HTMLElement;
  private menuButton?: HTMLButtonElement;
  private dropdown?: HTMLElement;
  private chipsContainer?: HTMLElement;
  private scrolledChipsContainer?: HTMLElement;
  private isDropdownOpen = false;
  private currentConfig: HeaderConfig = { title: localize('pages.my_home'), isGroupPage: false, showMenu: true };
  private container?: HTMLElement;
  private _hass?: any;
  private uiManager: HomeAssistantUIManager;
  private sectionReorderManager?: SectionReorderManager;
  private homeSettingsManager?: HomeSettingsManager;
  private customizationManager?: CustomizationManager;
  private editModeManager?: EditModeManager;
  private onRefreshCallbacks: Array<() => void> = [];
  private scrollListener?: () => void;
  private resizeListener?: () => void;
  private clickOutsideListener?: (e: Event) => void;
  private escapeKeyListener?: (e: KeyboardEvent) => void;
  private sidebarObserver?: MutationObserver | ResizeObserver;
  private tempSidebarCloseHandler?: (e: Event) => void;

  // Allow both singleton and instance creation for stateless architecture
  constructor(forceInstance = false) {
    this.uiManager = HomeAssistantUIManager.getInstance();
  }

  static getInstance(): AppleHeader {
    if (!AppleHeader.instance) {
      AppleHeader.instance = new AppleHeader();
    }
    return AppleHeader.instance;
  }

  /**
   * Set the EditModeManager instance
   */
  setEditModeManager(editModeManager: EditModeManager) {
    this.editModeManager = editModeManager;
  }

  /**
   * Get the current edit mode state from EditModeManager
   */
  get editMode(): boolean {
    return this.editModeManager?.editMode || false;
  }

  /**
   * Determine if sidebar button should be shown
   * Show when user needs access to sidebar overlay but can't get it through HA's own UI:
   * - Mobile: Show when HA header is hidden (no access to HA's menu button)
   * - Desktop: Show when HA sidebar is hidden (no direct sidebar access)
   * - Both: Don't show if HA header is visible (since it has its own menu button)
   */
  private shouldShowSidebarButton(): boolean {
    // Don't show if back button is already there
    if (this.currentConfig.showBackButton) {
      return false;
    }

    // Check current UI state
    const headerVisible = this.uiManager.isHeaderVisible();
    const headerHidden = !headerVisible;
    const sidebarHidden = !this.uiManager.isSidebarVisible();

    // Also check customization settings (for cases where UI hasn't been applied yet)
    let customHeaderHidden = false;
    let customSidebarHidden = false;

    if (this.customizationManager) {
      customHeaderHidden = this.customizationManager.isHeaderHidden();
      customSidebarHidden = this.customizationManager.isSidebarHidden();
    }

    // If HA header is visible, don't show our sidebar button since HA already provides menu access
    if (headerVisible && !customHeaderHidden) {
      return false;
    }

    // Check if we're on mobile
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
      // On mobile: show when header is hidden (user needs access to sidebar overlay)
      return headerHidden || customHeaderHidden;
    } else {
      // On desktop: show when sidebar is hidden AND header is hidden
      // (if header is visible, user can use HA's menu button)
      return (sidebarHidden || customSidebarHidden) && (headerHidden || customHeaderHidden);
    }
  }

  /**
   * Initialize the header with configuration
   */
  async init(container: HTMLElement, config: HeaderConfig) {

    const containerChanged = this.container !== container;
    // Better config change detection - check before updating currentConfig
    const configChanged = JSON.stringify(this.currentConfig) !== JSON.stringify(config);

    this.container = container;

    // Only recreate if container changed or header doesn't exist
    if (containerChanged || !this.headerElement) {
      this.cleanup();
      this.currentConfig = { ...config }; // Update config before creating
      await this.createHeaderStructure();
      this.setupEventListeners();
      this.setupScrollBehavior();
    } else if (configChanged) {
      this.reconfigure(config);
      this.currentConfig = { ...config }; // Update config after reconfiguring
    }

  }

  /**
   * Reconfigure existing header without recreating DOM
   */
  private reconfigure(config: HeaderConfig) {
    // Update menu button visibility
    if (this.menuButton) {
      this.menuButton.style.display = config.showMenu ? 'flex' : 'none';
    }

    // Update title in scrolled header if needed
    if (this.scrolledTitleElement && config.title !== this.currentConfig.title) {
      this.scrolledTitleElement.textContent = config.title;
    }

    // Clear chips if switching from group to home page
    if (!config.isGroupPage && this.scrolledChipsContainer) {
      this.scrolledChipsContainer.innerHTML = '';
    }

  }

  /**
   * Set the title (only for scrolled header)
   */
  setTitle(title: string) {
    // Prevent repeated updates with the same title
    if (this.currentConfig.title === title) {
      return;
    }

    this.currentConfig.title = title;

    // Update scrolled title element if it exists
    if (this.scrolledTitleElement) {
      this.scrolledTitleElement.textContent = title;
    }
  }

  /**
   * Force update the title directly in the DOM, bypassing any caching
   */
  forceUpdateTitle(title: string) {
    this.currentConfig.title = title;

    // Force update the DOM element regardless of previous state
    if (this.scrolledTitleElement) {
      this.scrolledTitleElement.textContent = title;
    }

    // Also update any other title elements that might exist
    const titleElements = this.headerElement?.querySelectorAll('.apple-header-scrolled-title');
    titleElements?.forEach((element: Element) => {
      element.textContent = title;
    });
  }

  /**
   * Set chips element for group pages
   */
  setChipsElement(chipsElement: any | null) {

    if (chipsElement && this.headerElement) {
      // Find the header chips container
      const headerChipsContainer = this.headerElement.querySelector('.apple-header-scrolled-chips') as HTMLElement;


      if (headerChipsContainer) {

        // Create a new AppleChips instance for the header

        if (chipsElement.isConfigured && chipsElement.isConfigured() && chipsElement.hass) {
          const headerChips = new AppleChips(headerChipsContainer, this.customizationManager);
          headerChips.setConfig(chipsElement.getConfig());
          headerChips.hass = chipsElement.hass;
          headerChips.setActiveGroup(chipsElement.getActiveGroup());

        } else {
        }
      } else {
      }
    } else if (!this.currentConfig.isGroupPage && this.headerElement) {
      // For home page, clear header chips
      const headerChipsContainer = this.headerElement.querySelector('.apple-header-scrolled-chips') as HTMLElement;
      if (headerChipsContainer) {
        headerChipsContainer.innerHTML = '';
      }
    }
  }

  /**
   * Update page content padding based on current header configuration
   * This should be called after the page content is available
   */
  updatePageContentPadding() {
    if (this.headerElement && this.container) {
      // The container IS the page-content element, so add the class directly to it
      if (this.currentConfig.isGroupPage) {
        this.container.classList.add('has-fixed-header');
      } else {
        this.container.classList.remove('has-fixed-header');
      }
    }
  }

  /**
   * Simple function to find a width container
   */
  private findWidthContainer(): HTMLElement | null {
    // Try home-assistant first
    const homeAssistantElement = document.querySelector('home-assistant') as HTMLElement;
    const homeAssistantMain = homeAssistantElement?.shadowRoot?.querySelector('home-assistant-main') as HTMLElement;
    const haDrawer = homeAssistantMain?.shadowRoot?.querySelector('ha-drawer') as HTMLElement;
    const haPanelLovelace = haDrawer?.querySelector('ha-panel-lovelace') as HTMLElement;

    if (haPanelLovelace) {
      const rect = haPanelLovelace.getBoundingClientRect();
      if (rect.width > 0) {
        return haPanelLovelace;
      }
    }

    // Fallback to body
    const body = document.body;
    return body;
  }

  /**
   * Simple header positioning
   */
  private updateFixedHeaderPosition() {
    if (!this.headerElement || !this.currentConfig.isGroupPage) {
      return;
    }

    const container = this.findWidthContainer();
    if (!container) {
      // Simple fallback: assume 256px sidebar
      if (RTLHelper.isRTL()) {
        this.headerElement.style.right = '256px';
        this.headerElement.style.left = 'auto';
      } else {
        this.headerElement.style.left = '256px';
        this.headerElement.style.right = 'auto';
      }
      this.headerElement.style.width = `${window.innerWidth - 256}px`;
      this.headerElement.style.top = '0px';
      return;
    }

    const rect = container.getBoundingClientRect();

    // Apply positioning - RTL aware
    if (RTLHelper.isRTL()) {
      this.headerElement.style.right = `${window.innerWidth - rect.right}px`;
      this.headerElement.style.left = 'auto';
    } else {
      this.headerElement.style.left = `${rect.left}px`;
      this.headerElement.style.right = 'auto';
    }
    this.headerElement.style.width = `${rect.width}px`;
    this.headerElement.style.top = this.getHomeAssistantHeaderHeight() + 'px';
  }

  /**
   * Wait for Home Assistant interface to be ready
   */
  private waitForHAInterface(): Promise<void> {
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 100; // 5 seconds max wait

      const checkInterface = () => {
        attempts++;

        const homeAssistantElement = document.querySelector('home-assistant');
        const homeAssistantMain = homeAssistantElement?.shadowRoot?.querySelector('home-assistant-main');
        const haDrawer = homeAssistantMain?.shadowRoot?.querySelector('ha-drawer');
        const haPanelLovelace = haDrawer?.querySelector('ha-panel-lovelace');
        const huiRoot = haPanelLovelace?.shadowRoot?.querySelector('hui-root');

        if (homeAssistantElement && homeAssistantMain && haDrawer && haPanelLovelace && huiRoot) {
          // Additional check: make sure hui-root has its shadow DOM
          if (huiRoot.shadowRoot) {
            resolve();
            return;
          }
        }

        if (attempts >= maxAttempts) {
          // Timeout - resolve anyway to prevent hanging
          resolve();
          return;
        }

        setTimeout(checkInterface, 50);
      };

      checkInterface();
    });
  }

  /**
   * Get the height of Home Assistant's native header if it exists
   */
  private getHomeAssistantHeaderHeight(): number {
    try {
      const homeAssistantElement = document.querySelector('home-assistant') as HTMLElement;
      if (!homeAssistantElement?.shadowRoot) return 0;

      const homeAssistantMain = homeAssistantElement.shadowRoot.querySelector('home-assistant-main') as HTMLElement;
      if (!homeAssistantMain?.shadowRoot) return 0;

      const haDrawer = homeAssistantMain.shadowRoot.querySelector('ha-drawer') as HTMLElement;
      if (!haDrawer) return 0;

      const haPanelLovelace = haDrawer.querySelector('ha-panel-lovelace') as HTMLElement;
      if (!haPanelLovelace?.shadowRoot) return 0;

      const huiRoot = haPanelLovelace.shadowRoot.querySelector('hui-root') as HTMLElement;
      if (!huiRoot?.shadowRoot) return 0;

      const header = huiRoot.shadowRoot.querySelector('.header') as HTMLElement;
      if (!header) return 0;

      const rect = header.getBoundingClientRect();
      return rect.height;
    } catch (error) {
      // Silently handle errors during DOM traversal
      return 0;
    }
  }

  /**
   * Update the CSS custom property for HA header height
   */
  private updateHAHeaderHeight() {
    const headerHeight = this.getHomeAssistantHeaderHeight();
    if (this.headerElement) {
      this.headerElement.style.setProperty('--ha-header-height', `${headerHeight}px`);
    }
  }

  private async createHeaderStructure() {
    if (!this.container) {
      console.error('No container available for header creation');
      return;
    }

    // Check if we have a permanent header element to populate
    const existingHeader = this.container.querySelector('.apple-home-header.permanent-header') as HTMLElement;

    if (existingHeader) {
      // Populate the existing header element
      existingHeader.innerHTML = `
        <div class="apple-header-content">
          ${this.currentConfig.showBackButton ? `
            <button class="apple-header-back-button ${LiquidGlassClasses.headerButton}">
              <ha-icon icon="${RTLHelper.getBackIcon()}"></ha-icon>
            </button>
          ` : this.shouldShowSidebarButton() ? `
            <button class="apple-header-sidebar-button ${LiquidGlassClasses.headerButton}">
              <ha-icon icon="mdi:menu"></ha-icon>
            </button>
          ` : ''}
          <div class="apple-header-scrolled">
            <div class="apple-header-scrolled-title-container">
              <h2 class="apple-header-scrolled-title">${this.currentConfig.title}</h2>
            </div>
            <div class="apple-header-scrolled-chips"></div>
          </div>
          ${this.currentConfig.showMenu ? `
            <button class="apple-header-menu-button ${LiquidGlassClasses.headerButton}">
              ${this.getMenuButtonContent()}
            </button>
            <div class="apple-header-dropdown">
              ${this.getDropdownContent()}
            </div>
          ` : ''}
        </div>
      `;

      // Use the existing header as our header element
      this.headerElement = existingHeader;

      // Add RTL class handling
      if (RTLHelper.isRTL()) {
        this.headerElement.classList.add('rtl');
        this.headerElement.classList.remove('ltr');
      } else {
        this.headerElement.classList.add('ltr');
        this.headerElement.classList.remove('rtl');
      }

      // Add group-page class if this is a group page
      if (this.currentConfig.isGroupPage) {
        this.headerElement.classList.add('group-page');
        // Also add class to page content for padding
        const pageContent = this.container?.querySelector('.page-content') as HTMLElement;
        if (pageContent) {
          pageContent.classList.add('has-fixed-header');
        }
      } else {
        this.headerElement.classList.remove('group-page');
        // Remove padding class from page content
        const pageContent = this.container?.querySelector('.page-content') as HTMLElement;
        if (pageContent) {
          pageContent.classList.remove('has-fixed-header');
        }
      }
    } else {
      // Create only the sticky header (no big title - that's handled by pages)
      const headerHTML = `
        <div class="apple-home-header ${RTLHelper.isRTL() ? 'rtl' : 'ltr'}">
          <div class="apple-header-content">
            ${this.currentConfig.showBackButton ? `
              <button class="apple-header-back-button ${LiquidGlassClasses.headerButton}">
                <ha-icon icon="${RTLHelper.getBackIcon()}"></ha-icon>
              </button>
            ` : this.shouldShowSidebarButton() ? `
              <button class="apple-header-sidebar-button ${LiquidGlassClasses.headerButton}">
                <ha-icon icon="mdi:menu"></ha-icon>
              </button>
            ` : ''}
            <div class="apple-header-scrolled">
              <div class="apple-header-scrolled-title-container">
                <h2 class="apple-header-scrolled-title">${this.currentConfig.title}</h2>
              </div>
              <div class="apple-header-scrolled-chips"></div>
            </div>
            ${this.currentConfig.showMenu ? `
              <button class="apple-header-menu-button ${LiquidGlassClasses.headerButton}">
                ${this.getMenuButtonContent()}
              </button>
              <div class="apple-header-dropdown">
                ${this.getDropdownContent()}
              </div>
            ` : ''}
          </div>
        </div>
      `;

      // Insert the HTML structure
      this.container.insertAdjacentHTML('afterbegin', headerHTML);

      // Get reference to the created element
      this.headerElement = this.container.querySelector('.apple-home-header') as HTMLElement;
    }

    // Add RTL class handling to header element
    if (this.headerElement) {
      if (RTLHelper.isRTL()) {
        this.headerElement.classList.add('rtl');
        this.headerElement.classList.remove('ltr');
      } else {
        this.headerElement.classList.add('ltr');
        this.headerElement.classList.remove('rtl');
      }
    }

    // Add group-page class if this is a group page
    if (this.currentConfig.isGroupPage && this.headerElement) {
      this.headerElement.classList.add('group-page');
    } else if (this.headerElement) {
      this.headerElement.classList.remove('group-page');
    }

    // Get references to the elements (whether existing or newly created)
    this.scrolledTitleElement = this.headerElement.querySelector('.apple-header-scrolled-title') as HTMLElement;
    this.scrolledChipsContainer = this.headerElement.querySelector('.apple-header-scrolled-chips') as HTMLElement;

    if (this.currentConfig.showMenu) {
      this.menuButton = this.headerElement.querySelector('.apple-header-menu-button') as HTMLButtonElement;
      this.dropdown = this.headerElement.querySelector('.apple-header-dropdown') as HTMLElement;

      // Load dropdown content asynchronously
      if (this.dropdown) {
        this.dropdown.innerHTML = await this.getDropdownContent();
      }
    }

    // Add styles
    this.addStyles();

    // Set the HA header height CSS custom property for sticky positioning
    this.updateHAHeaderHeight();

    // Wait for HA interface and set up proper monitoring
    this.waitForHAInterface().then(() => {
      // Update header height once interface is ready
      this.updateHAHeaderHeight();

      // Set up observers after interface is ready
      this.setupSidebarObserver();

      if (this.currentConfig.isGroupPage) {
        this.updateFixedHeaderPosition();

        // Additional delayed check for refresh scenarios
        setTimeout(() => {
          this.updateHAHeaderHeight();
          this.updateFixedHeaderPosition();
        }, 200);
      }

      // Update sidebar button visibility after UI state is ready
      setTimeout(() => {
        this.updateSidebarButtonVisibility();
      }, 300);
    });

  }

  private getMenuButtonContent(): string {
    if (this.editMode) {
      return `<ha-icon icon="mdi:check"></ha-icon>`;
    }
    // iOS 26 Liquid Glass style - larger dots without circle outline
    return `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="6" cy="12" r="2" fill="currentColor"/>
        <circle cx="12" cy="12" r="2" fill="currentColor"/>
        <circle cx="18" cy="12" r="2" fill="currentColor"/>
      </svg>
    `;
  }

  private getDropdownContent(): string {
    // Determine edit text based on page type
    let editText = localize('edit.edit_home_view');
    if (this.currentConfig.title === localize('pages.scenes')) {
      editText = localize('edit.edit_scenes_view');
    } else if (this.currentConfig.title === localize('pages.cameras')) {
      editText = localize('edit.edit_cameras_view');
    } else if (this.currentConfig.showBackButton) {
      // Room pages have back button
      editText = localize('edit.edit_room_view');
    }

    // Check if we're on mobile to conditionally hide sidebar toggle
    const isMobile = window.innerWidth <= 768;
    const sidebarSection = isMobile ? '' : `
      <div class="dropdown-item settings-item sidebar-toggle">
        <span class="item-checkmark"></span>
        <ha-icon icon="${RTLHelper.isRTL() ? 'mdi:dock-right' : 'mdi:dock-left'}"></ha-icon>
        <span>${this.uiManager.getSidebarToggleText()}</span>
      </div>`;

    // Get rooms section
    const roomsSection = this.getRoomsSection();

    return `
      <div class="dropdown-item settings-item home-settings-item">
        <span class="item-checkmark"></span>
        <ha-icon icon="mdi:cog-outline"></ha-icon>
        <span>${localize('ui_actions.home_settings')}</span>
      </div>
      <div class="dropdown-item settings-item edit-item">
        <span class="item-checkmark"></span>
        <ha-icon icon="mdi:view-grid-outline"></ha-icon>
        <span>${editText}</span>
      </div>
      <div class="dropdown-item settings-item reorder-item">
        <span class="item-checkmark"></span>
        <ha-icon icon="mdi:view-sequential-outline"></ha-icon>
        <span>${localize('ui_actions.reorder_sections')}</span>
      </div>
      <div class="dropdown-item settings-item header-toggle">
        <span class="item-checkmark"></span>
        <ha-icon icon="mdi:page-layout-header"></ha-icon>
        <span>${this.uiManager.getHeaderToggleText()}</span>
      </div>${sidebarSection}${roomsSection}
    `;
  }

  private getRoomsSection(): string {
    if (!this._hass) {
      return '';
    }

    try {
      // Get areas from hass
      const areas = this._hass.areas ? Object.values(this._hass.areas) : [];

      // Check if there are entities without areas (Default Room)
      let hasDefaultRoom = false;
      try {
        const entities = this._hass.entities ? Object.values(this._hass.entities) : [];
        const devices = this._hass.devices ? Object.values(this._hass.devices) : [];

        // Check if any entities would be grouped under 'no_area'
        hasDefaultRoom = entities.some((entity: any) => {
          if (!entity.area_id && entity.device_id) {
            const device = devices.find((d: any) => d.id === entity.device_id);
            return !(device as any)?.area_id;
          }
          return !entity.area_id;
        });
      } catch (error) {
        // If we can't determine, assume there might be a default room
        hasDefaultRoom = true;
      }

      // Get section order from customizations if available
      let orderedAreas = areas;
      if (this.customizationManager) {
        const customizations = this.customizationManager.getCustomizations();
        const sectionOrder = customizations.home?.sections?.order || [];
        const hiddenSections = customizations.home?.sections?.hidden || [];

        // Filter out hidden areas and sort by order
        orderedAreas = areas
          .filter((area: any) => {
            const areaId = area.area_id || area.id;
            return !hiddenSections.includes(areaId);
          })
          .sort((a: any, b: any) => {
            const aIdA = a.area_id || a.id;
            const aIdB = b.area_id || b.id;
            const orderA = sectionOrder.indexOf(aIdA);
            const orderB = sectionOrder.indexOf(aIdB);

            // If both are in order list, sort by order
            if (orderA !== -1 && orderB !== -1) {
              return orderA - orderB;
            }
            // If only A is in order, A comes first
            if (orderA !== -1) return -1;
            // If only B is in order, B comes first  
            if (orderB !== -1) return 1;
            // Neither in order, sort by name
            return (a.name || aIdA).localeCompare(b.name || aIdB);
          });

        // Add Default Room if it exists and is not hidden
        if (hasDefaultRoom && !hiddenSections.includes('no_area')) {
          const defaultRoomOrder = sectionOrder.indexOf('no_area');
          const defaultRoom = {
            area_id: 'no_area',
            id: 'no_area',
            name: localize('pages.default_room')
          };

          if (defaultRoomOrder !== -1) {
            // Insert at specific position
            orderedAreas.push(defaultRoom);
            orderedAreas.sort((a: any, b: any) => {
              const aIdA = a.area_id || a.id;
              const aIdB = b.area_id || b.id;
              const orderA = sectionOrder.indexOf(aIdA);
              const orderB = sectionOrder.indexOf(aIdB);

              if (orderA !== -1 && orderB !== -1) {
                return orderA - orderB;
              }
              if (orderA !== -1) return -1;
              if (orderB !== -1) return 1;
              return (a.name || aIdA).localeCompare(b.name || aIdB);
            });
          } else {
            // Add at end if no specific order
            orderedAreas.push(defaultRoom);
          }
        }
      } else if (hasDefaultRoom) {
        // Add Default Room at end if no customization manager
        orderedAreas.push({
          area_id: 'no_area',
          id: 'no_area',
          name: localize('pages.default_room')
        });
      }

      if (orderedAreas.length === 0) {
        return '';
      }

      // Detect current room from URL
      const currentPath = window.location.pathname;
      const roomMatch = currentPath.match(/room-([^/]+)$/);
      const currentRoomId = roomMatch ? roomMatch[1] : null;

      // Build rooms dropdown section
      const roomItems = orderedAreas
        .map((area: any, index: number) => {
          const areaId = area.area_id || area.id;
          const areaName = area.name || areaId;
          const isActive = currentRoomId === areaId;
          return `
            <div class="dropdown-item room-item${isActive ? ' active' : ''}" data-room-id="${areaId}">
              <span class="room-checkmark"></span>
              <span>${areaName}</span>
            </div>
          `;
        }).join('');

      return `
        <div class="dropdown-separator-thick"></div>
        ${roomItems}
      `;
    } catch (error) {
      console.error('Error getting rooms section:', error);
      return '';
    }
  }

  private setupEventListeners() {
    // Back button click (if it exists)
    const backButton = this.headerElement?.querySelector('.apple-header-back-button') as HTMLButtonElement;
    if (backButton) {
      backButton.addEventListener('click', (e: Event) => {
        e.stopPropagation();
        this.navigateToHome();
      });
    }

    // Sidebar button click (if it exists)
    const sidebarButton = this.headerElement?.querySelector('.apple-header-sidebar-button') as HTMLButtonElement;
    if (sidebarButton) {
      sidebarButton.addEventListener('click', (e: Event) => {
        e.stopPropagation();
        this.openSidebar();
      });
    }

    // Window resize listener to update button visibility based on mobile/desktop
    if (!this.resizeListener) {
      this.resizeListener = () => {
        setTimeout(() => {
          this.updateSidebarButtonVisibility();
        }, 100); // Debounce resize events
      };
      window.addEventListener('resize', this.resizeListener);
    }

    if (!this.menuButton || !this.dropdown) return;

    // Menu button click
    this.menuButton.addEventListener('click', (e: Event) => {
      e.stopPropagation();

      if (this.editMode) {
        this.toggleEditMode();
      } else {
        this.toggleDropdown();
      }
    });

    // Set up initial dropdown event listeners
    this.setupDropdownItemListeners();

    // Remove existing document listeners if any
    if (this.clickOutsideListener) {
      document.removeEventListener('click', this.clickOutsideListener);
    }
    if (this.escapeKeyListener) {
      document.removeEventListener('keydown', this.escapeKeyListener);
    }

    // Close dropdown when clicking outside
    this.clickOutsideListener = (e: Event) => {
      if (!this.headerElement?.contains(e.target as Node)) {
        this.closeDropdown();
      }
    };
    document.addEventListener('click', this.clickOutsideListener);

    // Escape key
    this.escapeKeyListener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.closeDropdown();
      }
    };
    document.addEventListener('keydown', this.escapeKeyListener);
  }

  private setupDropdownItemListeners() {
    if (!this.dropdown) return;

    // Dropdown items
    this.dropdown.querySelector('.home-settings-item')?.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      this.showHomeSettingsModal();
      this.closeDropdown();
    });

    this.dropdown.querySelector('.edit-item')?.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      this.toggleEditMode();
      this.closeDropdown();
    });

    this.dropdown.querySelector('.header-toggle')?.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      this.toggleHeader();
      this.closeDropdown();
    });

    this.dropdown.querySelector('.sidebar-toggle')?.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      this.toggleSidebar();
      this.closeDropdown();
    });

    this.dropdown.querySelector('.reorder-item')?.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      this.showReorderModal();
      this.closeDropdown();
    });

    // Room navigation items
    this.dropdown.querySelectorAll('.room-item').forEach((roomItem) => {
      roomItem.addEventListener('click', (e: Event) => {
        e.stopPropagation();
        const roomId = (roomItem as HTMLElement).getAttribute('data-room-id');
        if (roomId) {
          this.navigateToRoom(roomId);
        }
        this.closeDropdown();
      });
    });
  }

  private setupScrollBehavior() {
    if (!this.headerElement) {
      console.error('No headerElement found for scroll behavior setup');
      return;
    }


    // Remove existing scroll listener if any
    if (this.scrollListener) {
      window.removeEventListener('scroll', this.scrollListener);
    }

    // Remove existing resize listener if any
    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
    }

    let ticking = false;

    const updateHeader = () => {
      if (!this.headerElement) return;

      const scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;

      // For special pages (room/scene/cameras), show header immediately when scrolling
      // For home page, keep the 70px threshold
      const scrollThreshold = this.currentConfig.isSpecialPage ? 1 : 30;

      if (scrollTop > scrollThreshold) {
        this.headerElement.classList.add('scrolled');
      } else {
        this.headerElement.classList.remove('scrolled');
      }

      ticking = false;
    };

    this.scrollListener = () => {
      if (!ticking) {
        requestAnimationFrame(updateHeader);
        ticking = true;
      }
    };

    // Resize listener to update header positioning and HA header height
    this.resizeListener = () => {
      requestAnimationFrame(() => {
        // Update HA header height for sticky positioning (all pages)
        this.updateHAHeaderHeight();

        // Update fixed header positioning only for group pages
        if (this.currentConfig.isGroupPage) {
          this.updateFixedHeaderPosition();
        }
      });
    };

    window.addEventListener('scroll', this.scrollListener);
    window.addEventListener('resize', this.resizeListener);

    // Note: Observers are now set up in the initialization flow after HA interface is ready
  }

  /**
   * Set up multiple observers to catch sidebar changes and HA header changes
   */
  private setupSidebarObserver() {
    // Clean up existing observer
    if (this.sidebarObserver) {
      this.sidebarObserver.disconnect();
    }

    // Find the elements
    const homeAssistant = document.querySelector('home-assistant');
    const homeAssistantMain = homeAssistant?.shadowRoot?.querySelector('home-assistant-main');
    const haDrawer = homeAssistantMain?.shadowRoot?.querySelector('ha-drawer') as HTMLElement;
    const haPanelLovelace = haDrawer?.querySelector('ha-panel-lovelace') as HTMLElement;
    const huiRoot = haPanelLovelace?.shadowRoot?.querySelector('hui-root') as HTMLElement;

    // Try multiple observation strategies
    const observers: Array<MutationObserver | ResizeObserver> = [];

    // 1. Watch home-assistant-main for attribute changes (sidebar)
    if (homeAssistantMain) {
      const mainObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.attributeName === 'expanded') {
            requestAnimationFrame(() => {
              this.updateHAHeaderHeight();
              this.updateSidebarButtonVisibility(); // Update sidebar button when sidebar state changes
              if (this.currentConfig.isGroupPage) {
                this.updateFixedHeaderPosition();
              }
            });
          }
        });
      });

      mainObserver.observe(homeAssistantMain, {
        attributes: true,
        attributeFilter: ['expanded'],
        attributeOldValue: true
      });
      observers.push(mainObserver);
    }

    // 2. Watch hui-root for changes (header visibility changes)
    if (huiRoot && huiRoot.shadowRoot) {
      const huiObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          // Watch for any changes in the hui-root shadow DOM
          if (mutation.type === 'childList' || mutation.type === 'attributes') {
            requestAnimationFrame(() => {
              this.updateHAHeaderHeight();
              this.updateSidebarButtonVisibility(); // Update sidebar button when UI changes
              if (this.currentConfig.isGroupPage) {
                this.updateFixedHeaderPosition();
              }
            });
          }
        });
      });

      huiObserver.observe(huiRoot.shadowRoot, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden']
      });
      observers.push(huiObserver);
    }

    // 3. Watch for header element specifically
    if (huiRoot?.shadowRoot) {
      const header = huiRoot.shadowRoot.querySelector('.header') as HTMLElement;
      if (header) {
        const headerObserver = new MutationObserver(() => {
          requestAnimationFrame(() => {
            this.updateHAHeaderHeight();
            this.updateSidebarButtonVisibility(); // Update sidebar button when header changes
            if (this.currentConfig.isGroupPage) {
              this.updateFixedHeaderPosition();
            }
          });
        });

        headerObserver.observe(header, {
          attributes: true,
          attributeFilter: ['style', 'class', 'hidden']
        });
        observers.push(headerObserver);

        // Also use ResizeObserver on the header
        if (window.ResizeObserver) {
          const headerResizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(() => {
              this.updateHAHeaderHeight();
              if (this.currentConfig.isGroupPage) {
                this.updateFixedHeaderPosition();
              }
            });
          });

          headerResizeObserver.observe(header);
          observers.push(headerResizeObserver);
        }
      }
    }

    // 4. Watch ha-drawer with ResizeObserver (backup)
    if (haDrawer && window.ResizeObserver) {
      const drawerResizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          this.updateHAHeaderHeight();
          if (this.currentConfig.isGroupPage) {
            this.updateFixedHeaderPosition();
          }
        });
      });

      drawerResizeObserver.observe(haDrawer);
      observers.push(drawerResizeObserver);
    }

    // 5. Watch ha-panel-lovelace with ResizeObserver (backup)
    if (haPanelLovelace && window.ResizeObserver) {
      const panelResizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          this.updateHAHeaderHeight();
          if (this.currentConfig.isGroupPage) {
            this.updateFixedHeaderPosition();
          }
        });
      });

      panelResizeObserver.observe(haPanelLovelace);
      observers.push(panelResizeObserver);
    }

    // Store a cleanup function that disconnects all observers
    this.sidebarObserver = {
      disconnect: () => {
        observers.forEach(observer => observer.disconnect());
      }
    } as any;
  }

  private toggleDropdown() {
    if (!this.dropdown) return;

    this.isDropdownOpen = !this.isDropdownOpen;

    // Refresh dropdown content when opening to ensure current state is reflected
    if (this.isDropdownOpen) {
      this.dropdown.innerHTML = this.getDropdownContent();
      // Event listeners need to be re-attached after innerHTML change
      this.setupDropdownItemListeners();

      // Position dropdown to stay within viewport
      this.positionDropdown();
    }

    this.dropdown.classList.toggle('open', this.isDropdownOpen);
  }

  private positionDropdown() {
    if (!this.dropdown || !this.menuButton) return;

    const buttonRect = this.menuButton.getBoundingClientRect();
    const dropdownHeight = this.dropdown.offsetHeight;
    const dropdownWidth = this.dropdown.offsetWidth;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const spaceBelow = viewportHeight - buttonRect.bottom;
    const spaceAbove = buttonRect.top;

    // Reset positioning classes
    this.dropdown.classList.remove('dropdown-above');

    // If there's not enough space below and more space above, show above
    if (spaceBelow < dropdownHeight + 20 && spaceAbove > dropdownHeight + 20) {
      this.dropdown.classList.add('dropdown-above');
    }

    // Handle horizontal positioning for RTL
    if (RTLHelper.isRTL()) {
      const spaceOnLeft = buttonRect.left;
      const spaceOnRight = viewportWidth - buttonRect.right;

      // Reset positioning
      this.dropdown.style.right = 'auto';
      this.dropdown.style.left = 'auto';

      // If dropdown would overflow on the left, adjust position
      if (spaceOnLeft < dropdownWidth + 10) {
        this.dropdown.style.left = '10px';
      } else {
        this.dropdown.style.left = '10px'; // Keep consistent with CSS
      }
    } else {
      const spaceOnRight = viewportWidth - buttonRect.right;

      // Reset positioning
      this.dropdown.style.right = 'auto';
      this.dropdown.style.left = 'auto';

      // If dropdown would overflow on the right, adjust position
      if (spaceOnRight < dropdownWidth + 10) {
        this.dropdown.style.right = '10px';
      } else {
        this.dropdown.style.right = '10px'; // Keep consistent with CSS
      }
    }
  }

  private closeDropdown() {
    if (!this.dropdown) return;

    this.isDropdownOpen = false;
    this.dropdown.classList.remove('open');
  }

  private toggleEditMode() {

    if (!this.editModeManager) {
      return;
    }

    // Use EditModeManager to toggle (this will trigger the callback)
    this.editModeManager.toggleEditMode();

    // Update UI based on new state
    if (this.menuButton) {
      this.menuButton.innerHTML = this.getMenuButtonContent();
      this.menuButton.classList.toggle('edit-mode', this.editMode);
    }

    this.dropdown?.querySelector('.edit-item')?.classList.toggle('active', this.editMode);
  }

  private toggleHeader() {
    this.uiManager.toggleHeader();
    this.updateDropdownTexts();
    this.updateSidebarButtonVisibility(); // Update sidebar button when header visibility changes
  }

  private toggleSidebar() {
    this.uiManager.toggleSidebar();
    this.updateDropdownTexts();
    this.updateSidebarButtonVisibility(); // Update sidebar button when sidebar visibility changes
  }

  /**
   * Open the Home Assistant sidebar as a temporary overlay
   * This mimics mobile behavior where sidebar appears temporarily
   */
  private openSidebar() {

    try {
      // Since we now use hass-dock-sidebar to make desktop behave like mobile,
      // we can use the same approach for both mobile and desktop!
      const ha = document.querySelector("home-assistant");
      if (!ha?.shadowRoot) {
        return;
      }

      const main = ha.shadowRoot.querySelector("home-assistant-main");
      if (!main) {
        return;
      }


      // Use Home Assistant's native toggle menu event - works for both mobile and desktop now!
      main.dispatchEvent(new CustomEvent("hass-toggle-menu", {
        detail: { open: true }, // explicitly open the sidebar
        bubbles: true,
        composed: true,
      }));


    } catch (error) {
      console.error('❌ AppleHeader: Error dispatching sidebar toggle event:', error);

      // Fallback to manual approach if the event system fails
      this.openSidebarManually();
    }
  }

  /**
   * Fallback manual sidebar opening for when Home Assistant event system doesn't work
   * (e.g., when sidebar is completely hidden by dashboard settings)
   */
  /**
   * Fallback manual sidebar opening for when Home Assistant event system doesn't work
   * (e.g., when sidebar is completely hidden by dashboard settings)
   */
  private openSidebarManually() {

    try {
      // Find elements using the same method as HomeAssistantUIManager
      const homeAssistant = document.querySelector('home-assistant');
      if (!homeAssistant?.shadowRoot) {
        console.warn('❌ AppleHeader: Home Assistant element not found in fallback');
        return;
      }

      const main = homeAssistant.shadowRoot.querySelector('home-assistant-main') as HTMLElement;
      if (!main?.shadowRoot) {
        console.warn('❌ AppleHeader: Home Assistant main element not found in fallback');
        return;
      }

      const drawer = main.shadowRoot.querySelector('ha-drawer') as any;
      if (!drawer) {
        console.warn('❌ AppleHeader: HA drawer not found in fallback');
        return;
      }


      const isMobile = window.innerWidth <= 768;

      // Look for the app layout or main content area
      const appDrawerLayout = main.shadowRoot.querySelector('app-drawer-layout') ||
        main.shadowRoot.querySelector('ha-app-layout');

      if (appDrawerLayout) {

        // Try to find the actual drawer mechanism
        const actualDrawer = appDrawerLayout.querySelector('app-drawer') ||
          appDrawerLayout.querySelector('mwc-drawer');

        if (actualDrawer) {

          // Try to open this drawer
          if (typeof (actualDrawer as any).open === 'function') {
            (actualDrawer as any).open();
          } else if ((actualDrawer as any).opened !== undefined) {
            (actualDrawer as any).opened = true;
          }

          // Create backdrop for both mobile and desktop
          this.createSidebarBackdrop(actualDrawer);
          return;
        }
      }

      if (isMobile) {
        // Mobile-specific manual approach

        // First, try to find and trigger the native HA mobile menu
        const haAppLayout = main.shadowRoot.querySelector('ha-app-layout');
        const appDrawerLayoutFallback = main.shadowRoot.querySelector('app-drawer-layout');

        if (haAppLayout || appDrawerLayoutFallback) {
          const layout = (haAppLayout || appDrawerLayoutFallback) as HTMLElement;

          // Try to find the drawer inside the layout
          const layoutDrawer = layout.querySelector('app-drawer') as any;
          if (layoutDrawer) {

            // Set up smooth animation
            layoutDrawer.style.transition = 'transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)';

            // Open the drawer
            if (typeof layoutDrawer.open === 'function') {
              layoutDrawer.open();
            } else {
              layoutDrawer.opened = true;
            }

            // Create backdrop for click-outside behavior
            this.createSidebarBackdrop(layoutDrawer);
            return;
          }
        }

        // Final fallback: Manual mobile drawer styling

        // Style the drawer for mobile overlay
        drawer.style.cssText = `
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          height: 100vh !important;
          width: 256px !important;
          z-index: 101 !important;
          transform: translateX(0px) !important;
          visibility: visible !important;
          display: block !important;
          background: var(--sidebar-background-color, var(--card-background-color, #1e1e1e)) !important;
          box-shadow: 2px 0 8px rgba(0, 0, 0, 0.3) !important;
          transition: transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1) !important;
        `;

        // Find and show sidebar content
        const sidebarContent = drawer.querySelector('ha-sidebar') ||
          drawer.querySelector('[role="navigation"]') ||
          drawer.querySelector('.mdc-drawer__content') ||
          drawer.firstElementChild;

        if (sidebarContent) {
          (sidebarContent as HTMLElement).style.cssText = `
            visibility: visible !important;
            display: block !important;
            height: 100% !important;
            width: 100% !important;
          `;
        }

        // Create backdrop
        this.createSidebarBackdrop(drawer);

      } else {
        // Desktop approach - temporarily remove collapsed styles with animation
        const wasCollapsed = main.hasAttribute('collapsed');

        if (wasCollapsed) {
          // Add transition for smooth animation
          main.style.transition = 'margin-left 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)';
          drawer.style.transition = 'transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)';

          // Remove collapsed state
          main.removeAttribute('collapsed');
          main.style.removeProperty('--mdc-drawer-width');
          main.style.removeProperty('--app-drawer-width');

          // Ensure drawer is visible
          drawer.style.transform = 'translateX(0px)';
          drawer.style.visibility = 'visible';
          drawer.style.display = 'block';

          // Set up click outside to restore collapsed state
          this.setupTemporarySidebarClose(drawer, main, true);
        } else {
          // If not collapsed, try to show it anyway
          drawer.style.transform = 'translateX(0px)';
          drawer.style.visibility = 'visible';
          drawer.style.display = 'block';
          drawer.style.transition = 'transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)';

          this.createSidebarBackdrop(drawer);
        }
      }


    } catch (error) {
      console.error('❌ AppleHeader: Error in manual sidebar opening:', error);
    }
  }

  /**
   * Create a backdrop for mobile sidebar overlay
   */
  private createSidebarBackdrop(drawer: any) {
    // Remove existing backdrop
    const existingBackdrop = document.querySelector('.apple-sidebar-backdrop');
    if (existingBackdrop) {
      existingBackdrop.remove();
    }

    // Create new backdrop - only cover the area not occupied by sidebar
    const backdrop = document.createElement('div');
    backdrop.className = 'apple-sidebar-backdrop';

    // RTL-aware positioning
    const isRTL = RTLHelper.isRTL();
    backdrop.style.cssText = `
      position: fixed;
      top: 0;
      ${isRTL ? 'right' : 'left'}: 256px;
      width: calc(100vw - 256px);
      height: 100vh;
      background: transparent;
      z-index: 99;
      pointer-events: all;
    `;

    // Add click handler to close sidebar
    backdrop.addEventListener('click', () => {
      this.closeMobileSidebar(drawer);
    });

    document.body.appendChild(backdrop);
  }

  /**
   * Close mobile sidebar overlay
   */
  private closeMobileSidebar(drawer: any) {

    // Check if this is an app-drawer that can be closed properly
    if (typeof drawer.close === 'function') {
      drawer.close();
    } else if (drawer.opened !== undefined) {
      drawer.opened = false;
    } else {
      // Manual close with animation
      drawer.style.transform = 'translateX(-100%)';

      // Clean up styles after animation
      setTimeout(() => {
        drawer.style.cssText = '';

        // Also reset any nested content
        const sidebarContent = drawer.querySelector('ha-sidebar') ||
          drawer.querySelector('[role="navigation"]') ||
          drawer.querySelector('.mdc-drawer__content') ||
          drawer.firstElementChild;

        if (sidebarContent) {
          (sidebarContent as HTMLElement).style.cssText = '';
        }
      }, 300); // Match transition duration
    }

    // Remove backdrop
    const backdrop = document.querySelector('.apple-sidebar-backdrop');
    if (backdrop) {
      backdrop.remove();
    }
  }

  /**
   * Set up click-outside-to-close behavior for temporary sidebar
   */
  private setupTemporarySidebarClose(drawer: any, mainElement?: HTMLElement, wasCollapsed?: boolean) {
    // Remove any existing temporary close handler
    if (this.tempSidebarCloseHandler) {
      document.removeEventListener('click', this.tempSidebarCloseHandler);
    }

    // Create a new temporary close handler
    this.tempSidebarCloseHandler = (event: Event) => {
      const target = event.target as HTMLElement;

      // Don't close if clicking on the sidebar button itself
      if (target.closest('.apple-header-sidebar-button')) {
        return;
      }

      // Don't close if clicking inside the drawer
      if (target.closest('ha-drawer')) {
        return;
      }

      // Close the drawer
      if (typeof drawer.close === 'function') {
        drawer.close();
      } else if (typeof drawer.toggle === 'function' && drawer.opened) {
        drawer.toggle();
      }

      // Restore collapsed state if it was previously collapsed
      if (wasCollapsed && mainElement) {
        mainElement.setAttribute('collapsed', '');
        mainElement.style.setProperty('--mdc-drawer-width', '0px');
        mainElement.style.setProperty('--app-drawer-width', '0px');

        // Clean up transitions after animation completes
        setTimeout(() => {
          mainElement.style.removeProperty('transition');
          if (drawer) {
            drawer.style.removeProperty('transition');
          }
        }, 300);
      }

      // Remove this temporary handler
      document.removeEventListener('click', this.tempSidebarCloseHandler!);
      this.tempSidebarCloseHandler = undefined;
    };

    // Add the handler after a small delay to prevent immediate closing
    setTimeout(() => {
      document.addEventListener('click', this.tempSidebarCloseHandler!);
    }, 100);
  }

  /**
   * Update sidebar button visibility based on current UI state
   * Call this when header/sidebar visibility changes
   */
  public updateSidebarButtonVisibility() {
    if (!this.headerElement) return;

    const sidebarButton = this.headerElement.querySelector('.apple-header-sidebar-button') as HTMLElement;
    const shouldShow = this.shouldShowSidebarButton();

    if (shouldShow && !sidebarButton && !this.currentConfig.showBackButton) {
      // Need to add the sidebar button - insert it dynamically
      this.addSidebarButton();
    } else if (!shouldShow && sidebarButton) {
      // Need to remove the sidebar button
      sidebarButton.remove();
    } else if (sidebarButton && this.currentConfig.showBackButton) {
      // Remove sidebar button if back button is now showing
      sidebarButton.remove();
    }
  }

  /**
   * Dynamically add sidebar button to existing header
   */
  private addSidebarButton() {
    if (!this.headerElement) return;

    const headerContent = this.headerElement.querySelector('.apple-header-content');
    if (!headerContent) return;

    // Create the sidebar button element
    const sidebarButton = document.createElement('button');
    sidebarButton.className = `apple-header-sidebar-button ${LiquidGlassClasses.headerButton}`;
    sidebarButton.innerHTML = '<ha-icon icon="mdi:menu"></ha-icon>';

    // Add event listener
    sidebarButton.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      this.openSidebar();
    });

    // Insert at the beginning of header content
    headerContent.insertBefore(sidebarButton, headerContent.firstChild);
  }

  public updateDropdownTexts() {
    if (!this.dropdown) return;

    const headerToggle = this.dropdown.querySelector('.header-toggle span');
    if (headerToggle) {
      headerToggle.textContent = this.uiManager.getHeaderToggleText();
    }

    const sidebarToggle = this.dropdown.querySelector('.sidebar-toggle span');
    if (sidebarToggle) {
      sidebarToggle.textContent = this.uiManager.getSidebarToggleText();
    }
  }

  private async showReorderModal() {
    if (!this.customizationManager || !this._hass) {
      console.warn('CustomizationManager or hass not available for section reordering');
      return;
    }

    if (!this.sectionReorderManager) {
      this.sectionReorderManager = new SectionReorderManager(
        this.customizationManager,
        () => {
          this.onRefreshCallbacks.forEach(callback => callback());
        }
      );
    }

    try {
      const areas = await this.getAreas();
      await this.sectionReorderManager.showReorderModal(areas, this._hass);
    } catch (error) {
      console.error('Error showing section reorder modal:', error);
    }
  }

  private async showHomeSettingsModal() {
    if (!this.customizationManager || !this._hass) {
      console.warn('CustomizationManager or hass not available for home settings');
      return;
    }

    if (!this.homeSettingsManager) {
      this.homeSettingsManager = new HomeSettingsManager(
        this.customizationManager,
        () => {
          this.onRefreshCallbacks.forEach(callback => callback());
        }
      );
    }

    try {
      await this.homeSettingsManager.showHomeSettingsModal(this._hass);
    } catch (error) {
      console.error('Error showing home settings modal:', error);
    }
  }

  private async getAreas(): Promise<any[]> {
    if (!this._hass) return [];

    try {
      if (this._hass.areas) {
        return Object.values(this._hass.areas);
      }

      const areas = await this._hass.callWS({
        type: 'config/area_registry/list',
      });

      return areas || [];
    } catch (error) {
      console.warn('Could not fetch areas:', error);
      return [];
    }
  }

  private navigateToHome() {
    const currentPath = window.location.pathname;
    let basePath = '';

    // Handle different dashboard URL patterns
    if (currentPath.startsWith('/lovelace/')) {
      basePath = '/lovelace/';
    } else if (currentPath === '/lovelace') {
      basePath = '/lovelace/';
    } else {
      // Custom dashboard: extract the dashboard name
      const pathParts = currentPath.split('/').filter(part => part.length > 0);
      if (pathParts.length > 0) {
        basePath = `/${pathParts[0]}/`;
      } else {
        basePath = '/lovelace/';
      }
    }

    // Navigate to home
    const newUrl = `${basePath}home`;

    // Navigate using Home Assistant's system
    window.history.pushState(null, '', newUrl);
    const event = new Event('location-changed', { bubbles: true, composed: true });
    window.dispatchEvent(event);
  }

  private navigateToRoom(roomId: string) {
    const currentPath = window.location.pathname;
    let basePath = '';

    // Handle different dashboard URL patterns
    if (currentPath.startsWith('/lovelace/')) {
      basePath = '/lovelace/';
    } else if (currentPath === '/lovelace') {
      basePath = '/lovelace/';
    } else {
      // Custom dashboard: extract the dashboard name
      const pathParts = currentPath.split('/').filter(part => part.length > 0);
      if (pathParts.length > 0) {
        basePath = `/${pathParts[0]}/`;
      } else {
        basePath = '/lovelace/';
      }
    }

    // Navigate to room using the same pattern as AreaSection
    const newUrl = `${basePath}room-${roomId}`;

    // Navigate using Home Assistant's system
    window.history.pushState(null, '', newUrl);
    const event = new Event('location-changed', { bubbles: true, composed: true });
    window.dispatchEvent(event);
  }

  private addStyles() {
    // Inject centralized liquid glass button styles (for non-shadow DOM contexts)
    injectLiquidGlassStyles();
    
    if (document.querySelector('#apple-header-styles')) return;

    const style = document.createElement('style');
    style.id = 'apple-header-styles';
    style.textContent = `
      /* Include liquid glass styles for shadow DOM context */
      ${liquidGlassCSS}
      
      /* Sticky header for home page, fixed for group pages */
      .apple-home-header {
        position: sticky;
        top: var(--ha-header-height, 0px);
        left: 0;
        right: 0;
        z-index: 3;
        background: transparent;
        transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
        width: calc(100% + 2 * var(--apple-page-padding, 22px));
        margin-left: calc(-1 * var(--apple-page-padding, 22px));
        min-height: 44px;
      }

      .apple-home-header.rtl {
        margin-left: 0;
        margin-right: calc(-1 * var(--apple-page-padding, 22px));
      }

      /* Fixed positioning for group pages to prevent jumping */
      .apple-home-header.group-page {
        position: fixed;
        top: 0;
        left: 0;
        margin-left: 0;
        width: 100%;
        /* Dynamic positioning will be applied via JavaScript */
      }

      /* RTL fixed positioning for group pages */
      .apple-home-header.group-page.rtl {
        left: auto;
        right: 0;
        margin-left: 0;
        margin-right: 0;
      }

      .apple-home-header.scrolled {
        background: transparent;
      }

      .apple-home-header.scrolled::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        -webkit-mask-image: linear-gradient(
          to bottom,
          rgba(0, 0, 0, 1) 0%,
          rgba(0, 0, 0, 0.7) 40%,
          rgba(0, 0, 0, 0) 100%
        );
        mask-image: linear-gradient(
          to bottom,
          rgba(0, 0, 0, 1) 0%,
          rgba(0, 0, 0, 0.7) 40%,
          rgba(0, 0, 0, 0) 100%
        );
        z-index: -1;
        pointer-events: none;
      }

      .apple-header-content {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 12px var(--apple-page-padding, 22px);
        position: relative;
      }

      /* Back button - positioning only (glass effect from .liquid-glass-transparent) */
      .apple-header-back-button {
        position: absolute;
        left: 16px;
        top: 50%;
        transform: translateY(-50%);
        z-index: 10;
      }

      .apple-header-back-button:active {
        transform: translateY(-50%) scale(0.95);
      }

      /* Fixed top position for group pages */
      .apple-home-header.group-page .apple-header-back-button {
        top: 12px;
        transform: none;
      }

      .apple-home-header.group-page .apple-header-back-button:active {
        transform: scale(0.95);
      }

      /* RTL positioning for group-page back button */
      .apple-home-header.group-page.rtl .apple-header-back-button {
        left: auto;
        right: 16px;
        top: 12px;
        transform: none;
      }

      .apple-header-back-button ha-icon {
        --mdc-icon-size: 26px;
        flex-shrink: 0;
        position: relative;
        z-index: 2;
      }

      .apple-home-header.rtl .apple-header-back-button {
        left: auto;
        right: 16px;
      }

      /* Mobile adjustments for back button */
      @media (max-width: 768px) {
        .apple-header-back-button {
          left: 12px;
          width: 34px;
          height: 34px;
          min-width: 34px;
        }

        .apple-home-header.rtl .apple-header-back-button {
          left: auto;
          right: 12px;
        }
      }

      /* Sidebar button - positioning only (glass effect from .liquid-glass-transparent) */
      .apple-header-sidebar-button {
        position: absolute;
        left: 16px;
        top: 50%;
        transform: translateY(-50%);
        z-index: 10;
      }

      .apple-header-sidebar-button:active {
        transform: translateY(-50%) scale(0.95);
      }

      .apple-header-sidebar-button ha-icon {
        --mdc-icon-size: 22px;
        position: relative;
        z-index: 2;
      }

      .apple-home-header.rtl .apple-header-sidebar-button {
        left: auto !important;
        right: 16px !important;
      }

      /* Fixed top position for group pages */
      .apple-home-header.group-page .apple-header-sidebar-button {
        top: 13px;
        transform: none;
      }

      .apple-home-header.group-page .apple-header-sidebar-button:active {
        transform: scale(0.95);
      }

      /* RTL positioning for group-page sidebar button on desktop */
      .apple-home-header.group-page.rtl .apple-header-sidebar-button {
        left: auto !important;
        right: 16px !important;
      }

      /* Mobile adjustments for sidebar button */
      @media (max-width: 768px) {
        .apple-header-sidebar-button {
          left: 12px;
          width: 34px;
          height: 34px;
          min-width: 34px;
        }

        .apple-home-header.group-page .apple-header-sidebar-button {
          top: 13px;
        }

        /* RTL positioning for group-page sidebar button on mobile */
        .apple-home-header.group-page.rtl .apple-header-sidebar-button {
          left: auto !important;
          right: 12px !important;
          top: 10px;
        }

        .apple-home-header.rtl .apple-header-sidebar-button {
          left: auto !important;
          right: 12px !important;
        }
      }

      /* Scrolled content (center) */
      .apple-header-scrolled {
        opacity: 0;
        visibility: hidden;
        transition: all 0.2s ease;
        pointer-events: none;
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }

      .apple-home-header.scrolled .apple-header-scrolled {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        width: 100%;
      }

        .apple-header-scrolled-title-container {
          min-height: 44px;
          display: flex;
          align-items: center;
        }

      .apple-header-scrolled-title {
        font-size: 17px;
        font-weight: 600;
        color: #ffffff;
        margin: 0;
        letter-spacing: -0.4px;
        white-space: nowrap;
      }

      .apple-header-scrolled-chips {
        display: none; /* Hidden by default - only show when scrolled */
        transition: all 0.2s ease;
        width: 100%;
        overflow-x: auto;
        overflow-y: hidden;
        scroll-behavior: smooth;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }

      .apple-header-scrolled-chips::-webkit-scrollbar {
        display: none;
      }

      /* Show chips in header only when scrolled */
      .apple-home-header.scrolled .apple-header-scrolled-chips {
        display: block;
      }

      /* Menu button - positioning only (glass effect from .liquid-glass-transparent) */
      .apple-header-menu-button {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        right: 16px;
        z-index: 10;
        font-family: inherit;
      }

      .apple-header-menu-button:active {
        transform: translateY(-50%) scale(0.95);
      }

      /* Fixed top position for group pages */
      .apple-home-header.group-page .apple-header-menu-button {
        top: 12px;
        transform: none;
      }

      .apple-home-header.group-page .apple-header-menu-button:active {
        transform: scale(0.97);
      }

      /* RTL positioning for group-page menu button */
      .apple-home-header.group-page.rtl .apple-header-menu-button {
        right: auto !important;
        left: 16px !important;
        top: 12px;
        transform: none;
      }

      .apple-home-header.rtl .apple-header-menu-button {
        right: auto !important;
        left: 16px !important;
      }

      /* Mobile adjustments for menu button */
      @media (max-width: 768px) {
        .apple-header-menu-button {
          right: 12px;
          width: 34px;
          height: 34px;
          min-width: 34px;
        }

        .apple-home-header.rtl .apple-header-menu-button {
          right: auto !important;
          left: 12px !important;
        }
      }

      .apple-header-menu-button.edit-mode {
        background: rgba(255, 149, 0, 0.85) !important;
        box-shadow: 
          inset 0 0 0 1px rgba(255, 255, 255, 0.3),
          inset 0 1px 0 rgba(255, 255, 255, 0.4),
          inset 0 -1px 0 rgba(0, 0, 0, 0.1),
          0 2px 8px rgba(255, 149, 0, 0.3) !important;
      }

      .apple-header-menu-button.edit-mode::before {
        background: linear-gradient(
          135deg,
          rgba(255, 255, 255, 0.5) 0%,
          rgba(255, 200, 100, 0.2) 25%,
          rgba(255, 255, 255, 0.35) 50%,
          rgba(255, 200, 100, 0.15) 75%,
          rgba(255, 255, 255, 0.45) 100%
        ) !important;
      }

      .apple-header-menu-button.edit-mode:hover {
        background: rgba(255, 159, 10, 0.9) !important;
      }

      .apple-header-menu-button.edit-mode:active {
        background: rgba(255, 139, 0, 0.95) !important;
      }

      .apple-header-menu-button.edit-mode ha-icon {
        --mdc-icon-size: 22px;
      }

      /* Dropdown */
      .apple-header-dropdown {
        position: absolute;
        top: calc(100% - 50px);
        right: 10px;
        width: 220px;
        max-height: calc(100vh - 150px);
        overflow-y: auto;
        overflow-x: hidden;
        scrollbar-width: none;
        -ms-overflow-style: none;
        background: rgba(30, 30, 30, 0.75);
        backdrop-filter: blur(50px) saturate(180%);
        -webkit-backdrop-filter: blur(50px) saturate(180%);
        border-radius: var(--apple-modal-radius, 20px);
        padding: 4px 0;
        opacity: 0;
        visibility: hidden;
        transform: translateY(-6px) scale(0.96);
        transition: all 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        z-index: 2000;
        pointer-events: none;
        box-shadow: 
          0 0 0 0.5px rgba(255, 255, 255, 0.1),
          0 10px 40px rgba(0, 0, 0, 0.4);
      }

      .apple-header-dropdown::-webkit-scrollbar {
        display: none;
      }

      .apple-home-header.rtl .apple-header-dropdown {
        right: auto;
        left: 10px;
      }

      .apple-header-dropdown.open {
        opacity: 1;
        visibility: visible;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }

      .apple-header-dropdown.dropdown-above {
        top: auto;
        bottom: calc(100% - 18px);
        transform: translateY(6px) scale(0.96);
      }

      .apple-header-dropdown.dropdown-above.open {
        transform: translateY(0) scale(1);
      }

      .dropdown-separator {
        height: 0.5px;
        background: rgba(255, 255, 255, 0.1);
        margin: 4px 16px;
      }

      .dropdown-separator-thick {
        height: 0.5px;
        background: rgba(255, 255, 255, 0.15);
        margin: 6px 16px;
      }

      .dropdown-item {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 12px;
        padding: 0 12px;
        color: rgba(255, 255, 255, 0.9);
        cursor: pointer;
        transition: background 0.15s ease;
        font-size: 15px;
        font-weight: 400;
        letter-spacing: -0.2px;
        line-height: 1.3;
        min-height: 40px;
        direction: inherit;
      }

      .dropdown-item:hover {
        background: rgba(255, 255, 255, 0.08);
      }

      .dropdown-item:active {
        background: rgba(255, 255, 255, 0.12);
      }

      .dropdown-item span {
        flex: 1;
        direction: inherit;
        text-align: start;
      }

      .dropdown-item ha-icon {
        opacity: 0.6;
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        color: rgba(255, 255, 255, 0.9);
        --mdc-icon-size: 20px;
      }

      /* Checkmark placeholder for all items */
      .dropdown-item .item-checkmark,
      .dropdown-item .room-checkmark {
        width: 20px;
        height: 20px;
        flex-shrink: 0;
        flex: 0 0 20px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      /* Room items with checkmark space */
      .dropdown-item.room-item {
        padding: 0 12px;
      }

      .dropdown-item.room-item.active .room-checkmark::before {
        content: '✓';
        font-size: 15px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.9);
      }

      .apple-home-header.rtl .dropdown-item ha-icon {
        order: 2;
      }

      .apple-home-header.rtl .dropdown-item span {
        order: 1;
      }

      .apple-home-header.rtl .dropdown-item.room-item {
        padding-left: 20px;
        padding-right: 16px;
      }

      .dropdown-item.edit-item.active {
        background: rgba(255, 255, 255, 0.08);
      }

      .dropdown-item.edit-item.active ha-icon {
        opacity: 1;
      }

      /* Room items without icons should not have justify-content: space-between */
      .dropdown-item.room-item {
        justify-content: flex-start;
      }

      /* Ensure numeric content stays LTR in RTL layouts */
      .apple-header-content [data-numeric],
      .apple-header-content .numeric,
      .apple-header-content input[type="number"],
      .dropdown-item .number {
        direction: ltr;
        text-align: right;
        unicode-bidi: embed;
      }

      /* Ensure proper text alignment for RTL text in LTR numeric contexts */
      .apple-home-header.rtl .apple-header-content [data-numeric],
      .apple-home-header.rtl .apple-header-content .numeric,
      .apple-home-header.rtl .apple-header-content input[type="number"],
      .apple-home-header.rtl .dropdown-item .number {
        text-align: left; /* Numbers should be left-aligned even in RTL */
      }


      /* Shadow DOM support - ensure RTL styles work within shadow roots */
      :host([dir="rtl"]) .apple-header-back-button,
      :host-context([dir="rtl"]) .apple-header-back-button {
        left: auto;
        right: 16px;
        justify-content: flex-end;
      }

      :host([dir="rtl"]) .apple-header-menu-button,
      :host-context([dir="rtl"]) .apple-header-menu-button {
        right: auto;
        left: 16px;
      }

      :host([dir="rtl"]) .apple-header-dropdown,
      :host-context([dir="rtl"]) .apple-header-dropdown {
        right: auto;
        left: 10px;
      }

      /* Add top padding to page content when header is fixed (group pages) */
      .page-content.has-fixed-header {
        padding-top: 68px; /* Header height + some margin */
      }

      /* Responsive - tablet */
      @media (max-width: 768px) {

        .apple-home-header {
          width: calc(100% + 32px);
          margin-left: -16px;
        }
        
        .apple-home-header.group-page {
          width: 100%;
          margin-left: 0;
        }
        
        .apple-header-content {
          padding: 8px 16px;
        }

        .apple-header-scrolled-title {
          font-size: 16px;
        }
        
        /* Adjust padding for mobile fixed header */
        .page-content.has-fixed-header {
          padding-top: 60px; /* Slightly less on mobile */
        }
      }
      
      /* Small mobile adjustments */
      @media (max-width: 479px) {
        .apple-home-header {
          width: calc(100% + 24px);
          margin-left: -12px;
        }
        
        .apple-header-content {
          padding: 8px 12px;
        }
        
        .apple-header-scrolled-title {
          font-size: 15px;
        }
        
        .apple-header-dropdown {
          width: 200px;
          right: 8px;
        }
        
        .apple-home-header.rtl .apple-header-dropdown {
          right: auto;
          left: 8px;
        }
      }
      
      /* Extra small / accessibility */
      @media (max-width: 359px) {
        .apple-home-header {
          width: calc(100% + 20px);
          margin-left: -10px;
        }
        
        .apple-header-content {
          padding: 6px 10px;
        }
        
        .apple-header-scrolled-title {
          font-size: 14px;
        }
        
        .apple-header-dropdown {
          width: 180px;
          right: 6px;
        }
        
        .apple-home-header.rtl .apple-header-dropdown {
          right: auto;
          left: 6px;
        }
        
        .dropdown-item {
          padding: 10px 14px;
          font-size: 14px;
        }
        
        .page-content.has-fixed-header {
          padding-top: 50px;
        }
      }
      
      /* Reduce motion for accessibility */
      @media (prefers-reduced-motion: reduce) {
        .apple-home-header,
        .apple-header-scrolled,
        .apple-header-dropdown,
        ha-drawer,
        home-assistant-main {
          transition: none !important;
        }
      }

      /* Sidebar overlay styles for mobile behavior */
      .apple-sidebar-backdrop {
        position: fixed !important;
        top: 0 !important;
        left: 256px !important;
        width: calc(100vw - 256px) !important;
        height: 100vh !important;
        background: transparent !important;
        z-index: 99 !important;
        pointer-events: all !important;
      }

      /* RTL sidebar backdrop positioning */
      [dir="rtl"] .apple-sidebar-backdrop {
        left: auto !important;
        right: 256px !important;
      }

      /* Smooth sidebar animations */
      ha-drawer {
        transition: transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1) !important;
      }
      
      /* RTL positioning for Home Assistant drawer */
      [dir="rtl"] ha-drawer {
        left: auto !important;
        right: 0 !important;
      }

      home-assistant-main {
        transition: margin-left 0.3s cubic-bezier(0.4, 0.0, 0.2, 1) !important;
      }
      
      /* RTL margin adjustment for main content */
      [dir="rtl"] home-assistant-main {
        margin-left: 0 !important;
        margin-right: 256px !important;
      }

      /* Ensure sidebar content is visible when opened */
      ha-drawer ha-sidebar,
      ha-drawer [role="navigation"],
      ha-drawer .mdc-drawer__content {
        transition: opacity 0.2s ease !important;
      }

      @media (max-width: 768px) {
        ha-drawer {
          position: fixed !important;
          z-index: 101 !important;
        }
        
        [dir="rtl"] ha-drawer {
          left: auto !important;
          right: 0 !important;
        }
        
        .apple-sidebar-backdrop {
          left: 256px !important;
          width: calc(100vw - 256px) !important;
        }
        
        [dir="rtl"] .apple-sidebar-backdrop {
          left: auto !important;
          right: 256px !important;
        }
        
        [dir="rtl"] home-assistant-main {
          margin-left: 0 !important;
          margin-right: 0 !important;
        }
      }
    `;

    const rootNode = this.container?.getRootNode();
    if (rootNode && rootNode instanceof ShadowRoot) {
      rootNode.appendChild(style);
    } else {
      document.head.appendChild(style);
    }
  }

  private cleanup() {
    // Remove existing scroll listener
    if (this.scrollListener) {
      window.removeEventListener('scroll', this.scrollListener);
      this.scrollListener = undefined;
    }

    // Remove existing resize listener
    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
      this.resizeListener = undefined;
    }

    // Clean up sidebar observer
    if (this.sidebarObserver) {
      this.sidebarObserver.disconnect();
      this.sidebarObserver = undefined;
    }

    // Remove document event listeners
    if (this.clickOutsideListener) {
      document.removeEventListener('click', this.clickOutsideListener);
      this.clickOutsideListener = undefined;
    }
    if (this.escapeKeyListener) {
      document.removeEventListener('keydown', this.escapeKeyListener);
      this.escapeKeyListener = undefined;
    }

    // Clean up temporary sidebar close handler
    if (this.tempSidebarCloseHandler) {
      document.removeEventListener('click', this.tempSidebarCloseHandler);
      this.tempSidebarCloseHandler = undefined;
    }

    // Remove existing elements
    this.container?.querySelector('.apple-home-header')?.remove();
    this.container?.querySelector('.apple-static-title')?.remove();

    // Remove fixed header padding class if it exists - container IS the page-content
    if (this.container) {
      this.container.classList.remove('has-fixed-header');
    }

    // Clear references
    this.headerElement = undefined;
    this.menuButton = undefined;
    this.dropdown = undefined;
    this.scrolledTitleElement = undefined;
    this.scrolledChipsContainer = undefined;
  }

  // Public API
  private lastSetHassTime = 0;
  private setHassCallCount = 0;
  private setHassTimeout: NodeJS.Timeout | null = null;
  private pendingHass: any = null;

  setHass(hass: any) {
    const now = Date.now();
    this.setHassCallCount++;

    // Store the latest hass object
    this.pendingHass = hass;

    // If we have a pending timeout, clear it
    if (this.setHassTimeout) {
      clearTimeout(this.setHassTimeout);
    }

    // Debounce setHass calls - only process after 100ms of no new calls
    this.setHassTimeout = setTimeout(() => {
      this.processSetHass(this.pendingHass);
      this.setHassTimeout = null;
    }, 100);
  }

  private processSetHass(hass: any) {
    this._hass = hass;

    // Initialize RTL detection with Home Assistant data
    RTLHelper.initialize(hass);

    // Only update home title from hass if on home page and title hasn't been set recently
    // Don't override titles for special pages (room, scenes, cameras) - only for actual home page
    if (!this.currentConfig.isGroupPage && !this.currentConfig.isSpecialPage && hass?.config?.location_name) {
      const newTitle = hass.config.location_name;
      // Prevent repeated calls with the same title
      if (this.currentConfig.title !== newTitle) {
        this.setTitle(newTitle);
      }
    }
  }

  setCustomizationManager(customizationManager: CustomizationManager) {
    this.customizationManager = customizationManager;
  }

  resetEditMode() {
    if (this.editMode && this.editModeManager) {
      // Exit edit mode through EditModeManager
      this.editModeManager.toggleEditMode();

      // Update UI to reflect exit from edit mode
      if (this.menuButton) {
        this.menuButton.innerHTML = this.getMenuButtonContent();
        this.menuButton.classList.remove('edit-mode');
      }

      // Update dropdown UI
      this.dropdown?.querySelector('.edit-item')?.classList.remove('active');
    }
  }

  addRefreshCallback(callback: () => void) {
    this.onRefreshCallbacks.push(callback);
  }

  removeRefreshCallback(callback: () => void) {
    const index = this.onRefreshCallbacks.indexOf(callback);
    if (index > -1) {
      this.onRefreshCallbacks.splice(index, 1);
    }
  }

  /**
   * Force update of header positioning (useful when DOM changes)
   */
  updateHeaderPosition() {
    if (this.currentConfig.isGroupPage) {
      this.updateFixedHeaderPosition();
    }
  }

  destroy() {
    this.cleanup();

    const style = document.querySelector('#apple-header-styles');
    if (style) {
      style.remove();
    }
  }
}
