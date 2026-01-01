/**
 * RegistrySubscriptionManager - Manages subscriptions to Home Assistant registries
 * 
 * Provides real-time updates when:
 * - Entity areas change
 * - Devices are moved between areas
 * - Entities are hidden, deleted, or disabled
 * - Entity IDs change
 * - Areas are created, renamed, or deleted
 */

export interface RegistryChangeEvent {
  type: 'entity' | 'device' | 'area' | 'entity_state';
  action: 'create' | 'update' | 'remove';
  data?: any;
}

export type RegistryChangeCallback = (event: RegistryChangeEvent) => void;

export class RegistrySubscriptionManager {
  private static instance: RegistrySubscriptionManager | null = null;
  
  private hass: any = null;
  private entityRegistryUnsubscribe: (() => void) | null = null;
  private deviceRegistryUnsubscribe: (() => void) | null = null;
  private areaRegistryUnsubscribe: (() => void) | null = null;
  
  private listeners: Set<RegistryChangeCallback> = new Set();
  private isSubscribed = false;
  
  // Debounce mechanism to prevent rapid-fire updates
  private pendingUpdate: ReturnType<typeof setTimeout> | null = null;
  private debounceMs = 500;
  
  // Cache for detecting meaningful changes
  private lastEntityHash: string = '';
  private lastDeviceHash: string = '';
  private lastAreaHash: string = '';
  
  // Polling fallback
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private pollingIntervalMs = 3000; // Check every 3 seconds

  private constructor() {}

  static getInstance(): RegistrySubscriptionManager {
    if (!RegistrySubscriptionManager.instance) {
      RegistrySubscriptionManager.instance = new RegistrySubscriptionManager();
    }
    return RegistrySubscriptionManager.instance;
  }

  /**
   * Set the Home Assistant instance and initialize subscriptions
   */
  setHass(hass: any): void {
    const hassChanged = this.hass !== hass;
    this.hass = hass;
    
    // Re-subscribe if hass instance changed
    if (hassChanged && hass?.connection) {
      this.subscribe();
    }
  }

  /**
   * Add a listener for registry changes
   */
  addListener(callback: RegistryChangeCallback): void {
    this.listeners.add(callback);
  }

  /**
   * Remove a listener
   */
  removeListener(callback: RegistryChangeCallback): void {
    this.listeners.delete(callback);
  }

  /**
   * Subscribe to all registry updates
   */
  private async subscribe(): Promise<void> {
    if (!this.hass?.connection) {
      return;
    }

    // Unsubscribe from previous subscriptions
    this.unsubscribe();

    try {
      // Try to subscribe to registry events using the new API
      // Home Assistant 2023.4+ uses config/entity_registry/list for full list
      // and state_changed events for real-time updates
      
      // Subscribe to entity registry updates
      try {
        this.entityRegistryUnsubscribe = await this.hass.connection.subscribeEvents(
          (event: any) => this.handleEntityRegistryEvent(event),
          'entity_registry_updated'
        );
      } catch (e) {
        // Event subscription not available
      }

      // Subscribe to device registry updates  
      try {
        this.deviceRegistryUnsubscribe = await this.hass.connection.subscribeEvents(
          (event: any) => this.handleDeviceRegistryEvent(event),
          'device_registry_updated'
        );
      } catch (e) {
        // Event subscription not available
      }

      // Subscribe to area registry updates
      try {
        this.areaRegistryUnsubscribe = await this.hass.connection.subscribeEvents(
          (event: any) => this.handleAreaRegistryEvent(event),
          'area_registry_updated'
        );
      } catch (e) {
        // Event subscription not available
      }

      this.isSubscribed = true;
      
      // Initialize hashes with current state
      await this.initializeHashes();
      
      // Always use polling as a safety net (even if subscriptions work)
      // This catches cases where WebSocket events might be missed
      this.startPollingFallback();
      
    } catch (error) {
      // Fallback: Use polling-based updates if subscriptions fail
      console.warn('Apple Home Dashboard: Registry subscriptions not available, using polling fallback');
      this.startPollingFallback();
    }
  }

  /**
   * Initialize hashes with current registry state
   */
  private async initializeHashes(): Promise<void> {
    if (!this.hass) return;
    
    try {
      const [entities, devices, areas] = await Promise.all([
        this.hass.callWS({ type: 'config/entity_registry/list' }),
        this.hass.callWS({ type: 'config/device_registry/list' }),
        this.hass.callWS({ type: 'config/area_registry/list' })
      ]);

      this.lastEntityHash = this.createEntityHash(entities);
      this.lastDeviceHash = this.createDeviceHash(devices);
      this.lastAreaHash = this.createAreaHash(areas);
    } catch (error) {
      // Silent fail - will be initialized on first change check
    }
  }

  /**
   * Handle entity registry update events
   */
  private handleEntityRegistryEvent(event: any): void {
    // Event contains { action: 'create'|'update'|'remove', entity_id: string }
    this.scheduleUpdate({ 
      type: 'entity', 
      action: event.data?.action || 'update',
      data: event.data 
    });
  }

  /**
   * Handle device registry update events
   */
  private handleDeviceRegistryEvent(event: any): void {
    this.scheduleUpdate({ 
      type: 'device', 
      action: event.data?.action || 'update',
      data: event.data 
    });
  }

  /**
   * Handle area registry update events
   */
  private handleAreaRegistryEvent(event: any): void {
    this.scheduleUpdate({ 
      type: 'area', 
      action: event.data?.action || 'update',
      data: event.data 
    });
  }

  /**
   * Polling fallback mechanism
   */
  private startPollingFallback(): void {
    if (this.pollingInterval) return;
    
    this.pollingInterval = setInterval(() => {
      this.checkForChanges();
    }, this.pollingIntervalMs);
  }

  /**
   * Check for changes by comparing current state with cached state
   */
  private async checkForChanges(): Promise<void> {
    if (!this.hass) return;

    try {
      // Fetch current registry data
      const [entities, devices, areas] = await Promise.all([
        this.hass.callWS({ type: 'config/entity_registry/list' }),
        this.hass.callWS({ type: 'config/device_registry/list' }),
        this.hass.callWS({ type: 'config/area_registry/list' })
      ]);

      // Create hashes of relevant properties
      const entityHash = this.createEntityHash(entities);
      const deviceHash = this.createDeviceHash(devices);
      const areaHash = this.createAreaHash(areas);

      // Check for changes
      let changeType: string | null = null;

      if (entityHash !== this.lastEntityHash) {
        this.lastEntityHash = entityHash;
        changeType = 'entity';
      }

      if (deviceHash !== this.lastDeviceHash) {
        this.lastDeviceHash = deviceHash;
        changeType = changeType || 'device';
      }

      if (areaHash !== this.lastAreaHash) {
        this.lastAreaHash = areaHash;
        changeType = changeType || 'area';
      }

      if (changeType) {
        this.scheduleUpdate({ type: changeType as any, action: 'update' });
      }
    } catch (error) {
      // Silently fail - will retry on next poll
    }
  }

  /**
   * Create a hash of entity registry state for comparison
   */
  private createEntityHash(entities: any[]): string {
    if (!entities || !Array.isArray(entities)) return '';
    
    // Only include properties that affect the dashboard
    const relevantData = entities.map(e => ({
      id: e.entity_id,
      area: e.area_id || '',
      device: e.device_id || '',
      hidden: e.hidden_by || '',
      disabled: e.disabled_by || ''
    }));
    
    return JSON.stringify(relevantData.sort((a, b) => a.id.localeCompare(b.id)));
  }

  /**
   * Create a hash of device registry state for comparison
   */
  private createDeviceHash(devices: any[]): string {
    if (!devices || !Array.isArray(devices)) return '';
    
    const relevantData = devices.map(d => ({
      id: d.id,
      area: d.area_id || ''
    }));
    
    return JSON.stringify(relevantData.sort((a, b) => a.id.localeCompare(b.id)));
  }

  /**
   * Create a hash of area registry state for comparison
   */
  private createAreaHash(areas: any[]): string {
    if (!areas || !Array.isArray(areas)) return '';
    
    const relevantData = areas.map(a => ({
      id: a.area_id,
      name: a.name
    }));
    
    return JSON.stringify(relevantData.sort((a, b) => a.id.localeCompare(b.id)));
  }

  /**
   * Schedule a debounced update notification
   */
  private scheduleUpdate(event: RegistryChangeEvent): void {
    if (this.pendingUpdate) {
      clearTimeout(this.pendingUpdate);
    }

    this.pendingUpdate = setTimeout(() => {
      this.pendingUpdate = null;
      this.notifyListeners(event);
    }, this.debounceMs);
  }

  /**
   * Notify all listeners of a registry change
   */
  private notifyListeners(event: RegistryChangeEvent): void {
    this.listeners.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Apple Home Dashboard: Error in registry change listener:', error);
      }
    });
  }

  /**
   * Force an immediate refresh check
   */
  async forceRefresh(): Promise<void> {
    await this.checkForChanges();
  }

  /**
   * Unsubscribe from all registries
   */
  unsubscribe(): void {
    if (this.entityRegistryUnsubscribe) {
      try {
        this.entityRegistryUnsubscribe();
      } catch (e) {
        // Ignore errors during cleanup
      }
      this.entityRegistryUnsubscribe = null;
    }
    
    if (this.deviceRegistryUnsubscribe) {
      try {
        this.deviceRegistryUnsubscribe();
      } catch (e) {
        // Ignore errors during cleanup
      }
      this.deviceRegistryUnsubscribe = null;
    }
    
    if (this.areaRegistryUnsubscribe) {
      try {
        this.areaRegistryUnsubscribe();
      } catch (e) {
        // Ignore errors during cleanup
      }
      this.areaRegistryUnsubscribe = null;
    }

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    this.isSubscribed = false;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.unsubscribe();
    this.listeners.clear();
    this.hass = null;
    RegistrySubscriptionManager.instance = null;
  }
}
