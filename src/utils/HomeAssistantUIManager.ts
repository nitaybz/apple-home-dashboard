import { CustomizationManager } from './CustomizationManager';
import { DashboardStateManager } from './DashboardStateManager';
import { localize } from './LocalizationService';

export interface HomeAssistantUIState {
  headerVisible: boolean;
  sidebarVisible: boolean;
}

export class HomeAssistantUIManager {
  private static instance: HomeAssistantUIManager | null = null;
  private state: HomeAssistantUIState;
  private headerElement: HTMLElement | null = null;
  private huiRootElement: HTMLElement | null = null;
  private initialized = false;
  private customizationManager: CustomizationManager | null = null;
  private originalState: HomeAssistantUIState | null = null;
  private dashboardStateManager: DashboardStateManager | null = null;
  private listenerSetup = false;
  private lastSidebarState: boolean | null = null;
  private dashboardStateListener?: (isActive: boolean, dashboardKey?: string | null) => void;
  private restoreTimeout: number | null = null;

  private constructor() {
    // Initialize with default visible state - will be overridden by dashboard settings
    this.state = {
      headerVisible: true,
      sidebarVisible: true
    };
  }

  public static getInstance(): HomeAssistantUIManager {
    if (!HomeAssistantUIManager.instance) {
      HomeAssistantUIManager.instance = new HomeAssistantUIManager();
      // Initialize only once
      HomeAssistantUIManager.instance.initialize();
    }
    return HomeAssistantUIManager.instance;
  }

  public static initializeWithCustomizations(customizationManager: CustomizationManager): HomeAssistantUIManager {
    const instance = HomeAssistantUIManager.getInstance();
    instance.setCustomizationManager(customizationManager);
    return instance;
  }

  private setCustomizationManager(customizationManager: CustomizationManager): void {
    this.customizationManager = customizationManager;
    
    if (!this.listenerSetup) {
      this.setupDashboardStateListener();
      this.listenerSetup = true;
    }
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    
    await this.waitForHomeAssistant();
    this.applyUIState();
    this.initialized = true;
  }

  private async waitForHomeAssistant(): Promise<void> {
    await customElements.whenDefined("home-assistant");
    await customElements.whenDefined("home-assistant-main");
  }

  // Utility: breadth-first search through nested shadow-DOM
  private deepQuery(root: any, sel: string): HTMLElement | null {
    const stack = [root];
    while (stack.length) {
      const n = stack.pop();
      if (!n) continue;
      const found = n.querySelector?.(sel);
      if (found) return found;
      n.children && stack.push(...n.children);
      n.shadowRoot && stack.push(n.shadowRoot);
    }
    return null;
  }


  private collapseHeader(hide: boolean = true): void {
    const haRoot = document.querySelector("home-assistant");
    const huiRoot = this.deepQuery(haRoot, "hui-root");
    const headerEl = huiRoot?.shadowRoot?.querySelector(".header");

    if (!huiRoot || !headerEl) {
      return;
    }

    this.huiRootElement = huiRoot as HTMLElement;
    this.headerElement = headerEl as HTMLElement;

    try {
      if (hide) {
        this.headerElement.style.display = "none";
        this.huiRootElement.style.setProperty("--mdc-top-app-bar-height", "0px");
        this.huiRootElement.style.setProperty("--header-height", "0px");

        const viewElement = this.huiRootElement.shadowRoot?.querySelector("#view") as HTMLElement;
        if (viewElement) {
          viewElement.style.setProperty("padding-top", "0px");
        }
      } else {
        this.headerElement.style.display = "";
        this.huiRootElement.style.removeProperty("--mdc-top-app-bar-height");
        this.huiRootElement.style.removeProperty("--header-height");
        
        const viewElement = this.huiRootElement.shadowRoot?.querySelector("#view") as HTMLElement;
        if (viewElement) {
          viewElement.style.removeProperty("padding-top");
        }
      }

      this.huiRootElement.dispatchEvent(
        new Event("iron-resize", { bubbles: true, composed: true })
      );
    } catch (error) {
      console.warn('Error in collapseHeader:', error);
    }
  }

  private collapseSidebar(hide: boolean = true): void {
    if (this.lastSidebarState === hide) {
      return;
    }
    
    this.lastSidebarState = hide;
    
    try {
      const ha = document.querySelector("home-assistant");
      const main = ha?.shadowRoot?.querySelector("home-assistant-main");
      
      if (!main) {
        console.warn('Home Assistant main element not found for sidebar control');
        this.lastSidebarState = null;
        return;
      }

      if (hide) {
        main.dispatchEvent(new CustomEvent("hass-dock-sidebar", {
          detail: { dock: "always_hidden" },
          bubbles: true,
          composed: true,
        }));
      } else {
        this.dockAfterDrawerClosed(main, "docked");
      }
      
    } catch (error) {
      console.warn('Error in collapseSidebar:', error);
      this.lastSidebarState = null;
    }
  }

  private async dockAfterDrawerClosed(main: Element, targetDock: string = "docked"): Promise<void> {
    const drawer = main.shadowRoot?.querySelector("ha-drawer");

    // Check if drawer is already non-blocking
    const isOpen = (drawer as any)?.mdcFoundation?.isOpen?.() || (drawer as any)?.open === true;
    
    if (!isOpen) {
      // Already non-blocking, dock immediately
      main.dispatchEvent(new CustomEvent("hass-dock-sidebar", {
        detail: { dock: targetDock },
        bubbles: true,
        composed: true,
      }));
      return;
    }

    // Build a promise that resolves when the drawer is guaranteed non-blocking
    const waitForNonBlocking = () =>
      new Promise<void>((resolve) => {
        let done = false;
        const finish = () => { 
          if (done) return; 
          done = true; 
          cleanup(); 
          resolve(); 
        };

        const cleanups: (() => void)[] = [];

        // 1) Drawer closed event
        if (drawer) {
          const onClosed = () => finish();
          drawer.addEventListener("MDCDrawer:closed", onClosed, { once: true });
          cleanups.push(() => drawer.removeEventListener("MDCDrawer:closed", onClosed));
        }

        // 2) Body overflow released by ha-drawer adapter
        const bodyObs = new MutationObserver(() => {
          const inline = document.body.style.overflow;
          const computed = getComputedStyle(document.body).overflow;
          if (inline !== "hidden" && computed !== "hidden") finish();
        });
        bodyObs.observe(document.body, { attributes: true, attributeFilter: ["style"] });
        cleanups.push(() => bodyObs.disconnect());

        // 3) Modal attribute removed from main
        const mainObs = new MutationObserver(() => {
          if (!main.hasAttribute("modal")) finish();
        });
        mainObs.observe(main, { attributes: true, attributeFilter: ["modal"] });
        cleanups.push(() => mainObs.disconnect());

        function cleanup() { 
          cleanups.forEach((fn) => fn()); 
        }
      });

    // Step A: ensure the drawer is closing
    main.dispatchEvent(new CustomEvent("hass-toggle-menu", {
      detail: { open: false },
      bubbles: true,
      composed: true,
    }));

    // Step B: wait until the overlay is truly gone
    await waitForNonBlocking();

    // Extra safety check as suggested
    if (document.body.style.overflow === "hidden") {
      main.dispatchEvent(new CustomEvent("hass-toggle-menu", {
        detail: { open: false },
        bubbles: true,
        composed: true,
      }));
    }

    // Step C: now it is safe to change the docking mode
    main.dispatchEvent(new CustomEvent("hass-dock-sidebar", {
      detail: { dock: targetDock },
      bubbles: true,
      composed: true,
    }));
  }

  private applyUIState(): void {
    this.collapseHeader(!this.state.headerVisible);
    this.collapseSidebar(!this.state.sidebarVisible);
  }

  public async toggleHeader(): Promise<boolean> {
    this.state.headerVisible = !this.state.headerVisible;
    
    // Save to customizations if we have a customization manager
    if (this.customizationManager) {
      await this.customizationManager.setHeaderVisibility(!this.state.headerVisible);
    }
    
    this.collapseHeader(!this.state.headerVisible);
    
    return this.state.headerVisible;
  }

  public async toggleSidebar(): Promise<boolean> {
    this.state.sidebarVisible = !this.state.sidebarVisible;
    
    // Save to customizations if we have a customization manager
    if (this.customizationManager) {
      await this.customizationManager.setSidebarVisibility(!this.state.sidebarVisible);
    }
    
    // Reset the last state tracker since this is a manual toggle
    this.lastSidebarState = null;
    
    // Re-find elements in case DOM changed
    this.collapseSidebar(!this.state.sidebarVisible);
    
    return this.state.sidebarVisible;
  }

  public isHeaderVisible(): boolean {
    return this.state.headerVisible;
  }

  public isSidebarVisible(): boolean {
    return this.state.sidebarVisible;
  }

  public getHeaderToggleText(): string {
    return this.state.headerVisible ? localize('toggles.hide_header') : localize('toggles.show_header');
  }

  public getSidebarToggleText(): string {
    return this.state.sidebarVisible ? localize('toggles.hide_sidebar') : localize('toggles.show_sidebar');
  }

  /**
   * Setup dashboard state listener for immediate UI updates
   */
  private setupDashboardStateListener(): void {
    if (!this.customizationManager) {
      return;
    }

    this.dashboardStateManager = DashboardStateManager.getInstance();
    
    // Store original state BEFORE any dashboard modifications
    this.originalState = {
      headerVisible: true, // Default HA state
      sidebarVisible: true // Default HA state  
    };
    
    // Apply dashboard settings immediately if we're already in dashboard
    if (this.dashboardStateManager.isDashboardActive()) {
      this.applyDashboardUISettings();
    }
    
    // Create and store the listener so we can remove it later
    this.dashboardStateListener = (isActive: boolean, dashboardKey?: string | null) => {
      if (isActive) {
        // Cancel pending restoration
        if (this.restoreTimeout !== null) {
          clearTimeout(this.restoreTimeout);
          this.restoreTimeout = null;
        }
        // Entering dashboard - apply dashboard UI settings
        requestAnimationFrame(() => {
          this.applyDashboardUISettings();
        });
      } else {
        // Leaving dashboard - schedule restoration after delay
        this.restoreTimeout = window.setTimeout(() => {
          this.restoreOriginalUIState();
          this.restoreTimeout = null;
        }, 300);
      }
    };
    
    this.dashboardStateManager.addListener(this.dashboardStateListener);
  }

  private applyDashboardUISettings(): void {
    if (!this.customizationManager) return;

    const shouldHideHeader = this.customizationManager.isHeaderHidden();
    const shouldHideSidebar = this.customizationManager.isSidebarHidden();

    // Update state to match customizations
    this.state.headerVisible = !shouldHideHeader;
    this.state.sidebarVisible = !shouldHideSidebar;

    this.collapseHeader(!this.state.headerVisible);
    this.collapseSidebar(!this.state.sidebarVisible);
  }

  /**
   * Force reapplication of dashboard UI settings - call when settings change
   */
  public reapplyDashboardSettings(): void {
    if (this.customizationManager) {
      this.applyDashboardUISettings();
      
      if (!this.headerElement) {
        setTimeout(() => {
          this.applyDashboardUISettings();
        }, 500);
      }
    }
  }

  /**
   * Restore the original Home Assistant UI state
   */
  private restoreOriginalUIState(): void {
    if (!this.originalState) return;

    // Force restoration to default HA state
    const needsHeaderRestore = !this.originalState.headerVisible;
    const needsSidebarRestore = !this.originalState.sidebarVisible;

    // Restore header if it was hidden
    if (needsHeaderRestore || !this.state.headerVisible) {
      this.state.headerVisible = true;
      this.collapseHeader(false); // Show header
    }

    // Restore sidebar if it was hidden
    if (needsSidebarRestore || !this.state.sidebarVisible) {
      // Reset the last state tracker to force restoration
      this.lastSidebarState = null;
      this.state.sidebarVisible = true;
      this.collapseSidebar(false); // Show sidebar
    }
  }

  /**
   * Stop dashboard state listening
   */
  private stopDashboardStateListener(): void {
    // Clear any pending restore timeout
    if (this.restoreTimeout !== null) {
      clearTimeout(this.restoreTimeout);
      this.restoreTimeout = null;
    }
    
    // Remove the listener from DashboardStateManager
    if (this.dashboardStateManager && this.dashboardStateListener) {
      this.dashboardStateManager.removeListener(this.dashboardStateListener);
      this.dashboardStateListener = undefined;
    }
    this.dashboardStateManager = null;
  }

  /**
   * Cleanup method for complete shutdown
   */
  public cleanup(): void {
    this.listenerSetup = false;
    this.lastSidebarState = null;
    this.stopDashboardStateListener();
    this.restoreOriginalUIState();
  }

  public static resetInstance(): void {
    // Only for testing or complete cleanup
    if (HomeAssistantUIManager.instance) {
      HomeAssistantUIManager.instance.cleanup();
      HomeAssistantUIManager.instance.collapseHeader(false);
      HomeAssistantUIManager.instance.collapseSidebar(false);
      HomeAssistantUIManager.instance = null;
    }
  }
}
