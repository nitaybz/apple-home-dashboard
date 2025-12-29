/**
 * DashboardStateManager - Manages dashboard enter/leave state for Apple Home Dashboard
 * 
 * Key concept: This manager tracks WHICH specific dashboard(s) are using the Apple Home Strategy.
 * A user can have multiple Apple Home dashboards (e.g., /apple-home, /tablet-dashboard).
 * When navigating between dashboards, we need to know if we're still in an Apple Home Dashboard
 * or if we've navigated to a different dashboard type.
 */
export class DashboardStateManager {
  private static instance: DashboardStateManager | null = null;
  private isActive = false;
  
  // Set of dashboard keys (URL path segments) that are Apple Home Dashboards
  // e.g., for URL /apple-home/home, the key is "apple-home"
  private registeredDashboardKeys: Set<string> = new Set();
  
  // The currently active dashboard key (if any)
  private currentDashboardKey: string | null = null;
  
  private listeners: Set<(isActive: boolean, dashboardKey: string | null) => void> = new Set();
  private navigationListenersSetup = false;
  
  // Track last processed path to avoid duplicate processing
  private lastProcessedPath: string = '';

  private constructor() {
    this.setupNavigationListeners();
  }

  static getInstance(): DashboardStateManager {
    if (!DashboardStateManager.instance) {
      DashboardStateManager.instance = new DashboardStateManager();
    }
    return DashboardStateManager.instance;
  }

  /**
   * Register a dashboard key as an Apple Home Dashboard
   * Called when the strategy generates a dashboard
   */
  registerDashboard(dashboardKey: string): void {
    this.registeredDashboardKeys.add(dashboardKey);
    
    // Check if we're currently on this dashboard
    const currentKey = this.extractDashboardKey(window.location.pathname);
    if (currentKey === dashboardKey) {
      this.setDashboardActive(dashboardKey);
    }
  }

  /**
   * Unregister a dashboard key (useful for cleanup)
   */
  unregisterDashboard(dashboardKey: string): void {
    this.registeredDashboardKeys.delete(dashboardKey);
    
    // If this was the active dashboard, deactivate
    if (this.currentDashboardKey === dashboardKey) {
      this.setDashboardInactive();
    }
  }

  /**
   * Register a listener for dashboard state changes
   * Listener receives: (isActive, dashboardKey)
   */
  addListener(callback: (isActive: boolean, dashboardKey?: string | null) => void): void {
    this.listeners.add(callback);
  }

  /**
   * Remove a listener
   */
  removeListener(callback: (isActive: boolean, dashboardKey?: string | null) => void): void {
    this.listeners.delete(callback);
  }

  /**
   * Get current dashboard state
   */
  isDashboardActive(): boolean {
    return this.isActive;
  }

  /**
   * Get current active dashboard key
   */
  getCurrentDashboardKey(): string | null {
    return this.currentDashboardKey;
  }

  /**
   * Get all registered dashboard keys
   */
  getRegisteredDashboardKeys(): string[] {
    return Array.from(this.registeredDashboardKeys);
  }

  /**
   * Extract the dashboard key from a URL path
   * /apple-home/home -> "apple-home"
   * /lovelace/0 -> "lovelace"
   * /config/dashboard -> null (excluded)
   */
  private extractDashboardKey(path: string): string | null {
    // Match first path segment
    const match = path.match(/^\/([^\/]+)/);
    if (!match) {
      return null;
    }
    
    const key = match[1];
    
    // Exclude core HA pages that are not dashboards
    const excludedKeys = [
      'config',
      'developer-tools',
      'hacs',
      'dev-tools',
      'api',
      'logbook',
      'history',
      'profile',
      'media-browser',
      'energy',
      'map',
      'todo',
      'calendar',
      'auth',
      '_my_redirect'
    ];
    
    if (excludedKeys.includes(key)) {
      return null;
    }
    
    return key;
  }

  /**
   * Check if the current URL is within an Apple Home Dashboard
   */
  private isCurrentUrlInAppleHomeDashboard(): { isInDashboard: boolean; dashboardKey: string | null } {
    const currentKey = this.extractDashboardKey(window.location.pathname);
    
    if (!currentKey) {
      return { isInDashboard: false, dashboardKey: null };
    }
    
    // Check if this key is registered as an Apple Home Dashboard
    if (this.registeredDashboardKeys.has(currentKey)) {
      return { isInDashboard: true, dashboardKey: currentKey };
    }
    
    return { isInDashboard: false, dashboardKey: null };
  }

  /**
   * Set dashboard as active
   */
  setDashboardActive(dashboardKey: string): void {
    const wasActive = this.isActive;
    const previousKey = this.currentDashboardKey;
    
    this.isActive = true;
    this.currentDashboardKey = dashboardKey;
    
    // Notify if state changed or if switching between different Apple Home dashboards
    if (!wasActive || previousKey !== dashboardKey) {
      this.notifyListeners(true, dashboardKey);
    }
  }

  /**
   * Set dashboard as inactive
   */
  setDashboardInactive(): void {
    const wasActive = this.isActive;
    
    this.isActive = false;
    this.currentDashboardKey = null;
    
    if (wasActive) {
      this.notifyListeners(false, null);
    }
  }

  /**
   * Setup real-time navigation event listeners for immediate detection
   */
  private setupNavigationListeners(): void {
    if (this.navigationListenersSetup) {
      return;
    }
    this.navigationListenersSetup = true;

    // Listen for popstate events (back/forward buttons)
    window.addEventListener('popstate', () => {
      this.handleNavigationChange();
    });

    // Listen for hashchange events
    window.addEventListener('hashchange', () => {
      this.handleNavigationChange();
    });

    // Intercept history methods only once globally
    if (!(window as any).__appleHomeDashboardHistoryIntercepted) {
      (window as any).__appleHomeDashboardHistoryIntercepted = true;
      
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;

      history.pushState = function(...args) {
        originalPushState.apply(history, args);
        // Use setTimeout to ensure URL has changed
        setTimeout(() => {
          DashboardStateManager.getInstance().handleNavigationChange();
        }, 0);
      };

      history.replaceState = function(...args) {
        originalReplaceState.apply(history, args);
        setTimeout(() => {
          DashboardStateManager.getInstance().handleNavigationChange();
        }, 0);
      };
    }

    // Listen for visibility changes (tab switches, etc.)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        setTimeout(() => {
          this.handleNavigationChange();
        }, 50);
      }
    });
  }

  /**
   * Handle navigation changes
   * This is the core detection logic
   */
  handleNavigationChange(): void {
    const currentPath = window.location.pathname;
    
    // Skip if we already processed this exact path
    if (currentPath === this.lastProcessedPath) {
      return;
    }
    this.lastProcessedPath = currentPath;
    
    const { isInDashboard, dashboardKey } = this.isCurrentUrlInAppleHomeDashboard();
    
    if (isInDashboard && dashboardKey) {
      // We're in an Apple Home Dashboard
      this.setDashboardActive(dashboardKey);
    } else if (this.isActive) {
      // We were active but now we're not in an Apple Home Dashboard
      this.setDashboardInactive();
    }
  }

  /**
   * Force a state check - useful after strategy initialization
   */
  checkCurrentState(): void {
    this.handleNavigationChange();
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(isActive: boolean, dashboardKey: string | null): void {
    this.listeners.forEach(callback => {
      try {
        callback(isActive, dashboardKey);
      } catch (error) {
        console.error('Apple Home Dashboard: Error in state listener:', error);
      }
    });
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.listeners.clear();
    this.registeredDashboardKeys.clear();
    this.currentDashboardKey = null;
    this.isActive = false;
    DashboardStateManager.instance = null;
  }
}
