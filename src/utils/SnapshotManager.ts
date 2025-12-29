import { CustomizationManager } from './CustomizationManager';
import { DashboardStateManager } from './DashboardStateManager';

interface SnapshotData {
  entityId: string;
  base64Data: string | null;
  timestamp: number;
  isLoading: boolean;
  hasError: boolean;
  fetchTimer?: number; // Individual timer for each camera
}

/**
 * SnapshotManager - Global singleton that manages individual camera snapshots
 * Each camera has its own setTimeout cycle: fetch → wait 10s → fetch → repeat
 * Camera cards query this manager every second to get the latest snapshot and timestamp
 * Pauses when user leaves dashboard, resumes when they return
 */
export class SnapshotManager {
  private static instance: SnapshotManager | null = null;
  private snapshots: Map<string, SnapshotData> = new Map();
  private fetchInterval: number = 10000; // 10 seconds
  private hass?: any;
  private dashboardStateManager: DashboardStateManager;
  private isPaused = false;
  private dashboardStateListener?: (isActive: boolean, dashboardKey?: string | null) => void;

  private constructor() {
    this.dashboardStateManager = DashboardStateManager.getInstance();
    
    // Listen for dashboard state changes
    this.dashboardStateListener = (isActive: boolean, dashboardKey?: string | null) => {
      if (isActive) {
        this.resume();
      } else {
        this.pause();
      }
    };
    this.dashboardStateManager.addListener(this.dashboardStateListener);
  }

  static getInstance(): SnapshotManager {
    if (!SnapshotManager.instance) {
      SnapshotManager.instance = new SnapshotManager();
    }
    return SnapshotManager.instance;
  }

  public setHass(hass: any): void {
    this.hass = hass;
  }

  /**
   * Register a camera entity - adds it to the fetch queue and starts its individual timer
   */
  public registerCamera(entityId: string): void {
    if (!this.snapshots.has(entityId)) {
      this.snapshots.set(entityId, {
        entityId,
        base64Data: null,
        timestamp: 0,
        isLoading: false,
        hasError: false
      });
      
      // Start immediate fetch cycle for new camera
      this.startCameraFetchCycle(entityId);
    }
  }

  /**
   * Unregister a camera entity - removes it from the fetch queue and clears its timer
   */
  public unregisterCamera(entityId: string): void {
    const snapshotData = this.snapshots.get(entityId);
    if (snapshotData?.fetchTimer) {
      clearTimeout(snapshotData.fetchTimer);
    }
    
    this.snapshots.delete(entityId);
  }

  /**
   * Check if a camera is already registered
   */
  public isRegistered(entityId: string): boolean {
    return this.snapshots.has(entityId);
  }

  /**
   * Get the latest snapshot data for a camera
   * Camera cards call this every second to check for updates
   */
  public getSnapshot(entityId: string): SnapshotData | null {
    return this.snapshots.get(entityId) || null;
  }

  /**
   * Get how many seconds ago the last snapshot was taken
   */
  public getSecondsAgo(entityId: string): number {
    const snapshotData = this.snapshots.get(entityId);
    if (!snapshotData || snapshotData.timestamp === 0) {
      return 0;
    }
    return Math.floor((Date.now() - snapshotData.timestamp) / 1000);
  }

  /**
   * Force refresh a specific camera snapshot
   */
  public forceRefresh(entityId: string): void {
    if (this.snapshots.has(entityId)) {
      // Clear existing timer and start immediate fetch
      const snapshotData = this.snapshots.get(entityId);
      if (snapshotData?.fetchTimer) {
        clearTimeout(snapshotData.fetchTimer);
        snapshotData.fetchTimer = undefined;
      }
      this.startCameraFetchCycle(entityId);
    }
  }

  /**
   * Start the fetch cycle for a specific camera
   * Immediately fetches, then schedules next fetch after 10 seconds
   */
  private startCameraFetchCycle(entityId: string): void {
    if (this.isPaused) {
      return;
    }

    this.fetchSnapshot(entityId);
  }

  /**
   * Schedule the next fetch for a camera after current fetch completes
   */
  private scheduleNextFetch(entityId: string): void {
    if (this.isPaused) {
      return;
    }

    const snapshotData = this.snapshots.get(entityId);
    if (!snapshotData) return;

    // Clear existing timer if any
    if (snapshotData.fetchTimer) {
      clearTimeout(snapshotData.fetchTimer);
    }

    snapshotData.fetchTimer = window.setTimeout(() => {
      this.startCameraFetchCycle(entityId);
    }, this.fetchInterval);
  }

  /**
   * Pause snapshot fetching for all cameras (called when leaving dashboard)
   */
  private pause(): void {
    this.isPaused = true;
    
    // Clear all individual camera timers
    this.snapshots.forEach((snapshotData, entityId) => {
      if (snapshotData.fetchTimer) {
        clearTimeout(snapshotData.fetchTimer);
        snapshotData.fetchTimer = undefined;
      }
    });
  }

  /**
   * Resume snapshot fetching for all cameras (called when returning to dashboard)
   */
  private resume(): void {
    if (!this.isPaused) return;
    
    this.isPaused = false;
    
    // Restart fetch cycles for all registered cameras
    this.snapshots.forEach((snapshotData, entityId) => {
      this.startCameraFetchCycle(entityId);
    });
  }

  /**
   * Fetch snapshot for a specific camera
   */
  private async fetchSnapshot(entityId: string): Promise<void> {
    const snapshotData = this.snapshots.get(entityId);
    if (!snapshotData || !this.hass) {
      return;
    }

    // Allow concurrent fetches but prevent multiple simultaneous fetches for the same camera
    if (snapshotData.isLoading) {
      return;
    }

    snapshotData.isLoading = true;
    snapshotData.hasError = false;

    try {
      const state = this.hass.states[entityId];
      if (!state || state.state === 'unavailable') {
        snapshotData.hasError = true;
        snapshotData.isLoading = false;
        // Schedule next attempt even on error
        this.scheduleNextFetch(entityId);
        return;
      }

      const base64Data = await this.getCameraSnapshotBase64(entityId);
      
      if (base64Data) {
        snapshotData.base64Data = base64Data;
        snapshotData.timestamp = Date.now();
        snapshotData.hasError = false;
      } else {
        snapshotData.hasError = true;
      }
    } catch (error) {
      snapshotData.hasError = true;
    } finally {
      snapshotData.isLoading = false;
      // Always schedule next fetch regardless of success/failure
      this.scheduleNextFetch(entityId);
    }
  }

  /**
   * Get camera snapshot as base64 data URL
   */
  private async getCameraSnapshotBase64(entityId: string): Promise<string | null> {
    if (!this.hass) return null;

    try {
      const state = this.hass.states[entityId];
      if (!state || state.state === 'unavailable') {
        return null;
      }

      let imageUrl = '';
      
      // Get camera image URL
      if (state.attributes.entity_picture) {
        imageUrl = state.attributes.entity_picture;
      } else {
        // Fallback: use camera snapshot service
        const response = await this.hass.callService('camera', 'snapshot', {
          entity_id: entityId,
          filename: 'temp_snapshot.jpg'
        });
        
        if (response && response.path) {
          imageUrl = `/local/${response.path}`;
        }
      }

      if (!imageUrl) {
        return null;
      }

      // Add timestamp to prevent caching
      const separator = imageUrl.includes('?') ? '&' : '?';
      const timestampedUrl = `${imageUrl}${separator}_t=${Date.now()}`;
      
      // Convert to base64
      const response = await fetch(timestampedUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }
      
      const blob = await response.blob();
      
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

    } catch (error) {
      return null;
    }
  }

  /**
   * Cleanup - destroy the singleton
   */
  public static destroy(): void {
    if (SnapshotManager.instance) {
      // Remove the dashboard state listener
      if (SnapshotManager.instance.dashboardStateListener) {
        SnapshotManager.instance.dashboardStateManager.removeListener(
          SnapshotManager.instance.dashboardStateListener
        );
        SnapshotManager.instance.dashboardStateListener = undefined;
      }
      
      // Clear all individual camera timers
      SnapshotManager.instance.snapshots.forEach((snapshotData, entityId) => {
        if (snapshotData.fetchTimer) {
          clearTimeout(snapshotData.fetchTimer);
        }
      });
      SnapshotManager.instance.snapshots.clear();
      SnapshotManager.instance = null;
    }
  }
}
