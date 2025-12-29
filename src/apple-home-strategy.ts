/**
 * Apple Home Dashboard Strategy - Stateless Implementation
 * Apple Home-like automatic dashboard for Home Assistant
 * 
 * Version: 2.1.0 - Stateless Architecture
 * Author: Apple Home Dashboard Team
 * 
 * This follows the proven mushroom-strategy pattern of stateless configuration generation.
 * No component instances, no singletons, no shared state - just pure configuration.
 */

import { DashboardConfig, DeviceGroup } from './config/DashboardConfig';
import { AppleHomeCard } from './components/AppleHomeCard';
import { AppleHomeView } from './components/AppleHomeView';
import { CustomizationManager } from './utils/CustomizationManager';
import { setupLocalize, localize } from './utils/LocalizationService';
import { BackgroundManager } from './utils/BackgroundManager';
import { HomeAssistantUIManager } from './utils/HomeAssistantUIManager';
import { SnapshotManager } from './utils/SnapshotManager';
import { RTLHelper } from './utils/RTLHelper';
import { injectLiquidGlassStyles } from './utils/LiquidGlassStyles';

// Inject liquid glass styles early at module load time
injectLiquidGlassStyles();

// Extend window interface for TypeScript
declare global {
  interface Window {
    customCards?: any[];
    customStrategies?: { [key: string]: any };
    appleHomeCleanupRegistered?: boolean;
  }
}

import { DashboardStateManager } from './utils/DashboardStateManager';

/**
 * Extract the dashboard key from the current URL
 * /apple-home/home -> "apple-home"
 */
function getCurrentDashboardKey(): string {
  const path = window.location.pathname;
  const match = path.match(/^\/([^\/]+)/);
  return match ? match[1] : 'lovelace';
}

/**
 * Main strategy function - generates dashboard configuration
 * This is called by Home Assistant's strategy system
 */
async function generateLovelaceDashboard(
  info: { hass: any; narrow?: boolean },
  options?: { title?: string }
) {
  const { hass } = info;
  
  // Initialize localization FIRST before any localize() calls
  setupLocalize(hass);
  
  // Initialize RTL support
  RTLHelper.initialize(hass);
  
  // CRITICAL: Register this dashboard with the DashboardStateManager
  // This is how we know which dashboards are Apple Home Dashboards
  const dashboardKey = getCurrentDashboardKey();
  const dashboardStateManager = DashboardStateManager.getInstance();
  dashboardStateManager.registerDashboard(dashboardKey);
  
  // Set this dashboard as active since we're generating it
  dashboardStateManager.setDashboardActive(dashboardKey);
  
  const views = [];

  // Load user customizations using CustomizationManager singleton
  const customizationManager = CustomizationManager.getInstance(hass);
  const customizations = await customizationManager.loadCustomizations();
  
  // Set the loaded customizations in the manager
  await customizationManager.setCustomizations(customizations);

  // Initialize snapshot manager
  const snapshotManager = SnapshotManager.getInstance();
  snapshotManager.setHass(hass);

  // Initialize background manager with loaded customizations
  const backgroundManager = new BackgroundManager(customizationManager);
  
  // Initialize background for dashboard (this will also set dashboard as active)
  backgroundManager.initializeBackground();

  // Initialize UI manager with customizations for header/sidebar control
  const uiManager = HomeAssistantUIManager.initializeWithCustomizations(customizationManager);
  
  // Apply UI settings once with a small delay to ensure DOM is ready
  setTimeout(() => {
    uiManager.reapplyDashboardSettings();
  }, 100);

  // Home view configuration - always first
  const homeTitle = options?.title || hass?.config?.location_name || localize('pages.my_home');
  views.push({
    title: homeTitle,
    path: 'home',
    icon: 'mdi:home',
    panel: true,
    cards: [{
      type: 'custom:apple-home-view',
      title: homeTitle,
      pageType: 'home',
      customizations: customizations
    }]
  });

  // Group view configurations - one for each device group (exclude OTHER group as it doesn't have its own page)
  const deviceGroups = (Object.keys(DashboardConfig.GROUP_STYLES) as DeviceGroup[]).filter(group => group !== DeviceGroup.OTHER);
  
  for (const group of deviceGroups) {
    const groupStyle = DashboardConfig.getGroupStyle(group);
    
    const groupName = typeof groupStyle.name === 'function' ? groupStyle.name() : groupStyle.name;
    
    views.push({
      title: groupName,
      path: group,
      icon: groupStyle.icon,
      panel: true,
      subview: true,
      cards: [{
        type: 'custom:apple-home-view',
        title: groupName,
        pageType: 'group',
        deviceGroup: group,
        customizations: customizations
      }]
    });
  }

  // Add special pages (Scenes and Cameras)
  views.push({
    title: localize('pages.scenes'),
    path: 'scenes',
    icon: 'mdi:palette',
    panel: true,
    subview: true,
    cards: [{
      type: 'custom:apple-home-view',
      title: localize('pages.scenes'),
      pageType: 'scenes',
      customizations: customizations
    }]
  });

  views.push({
    title: localize('pages.cameras'),
    path: 'cameras', 
    icon: 'mdi:cctv',
    panel: true,
    subview: true,
    cards: [{
      type: 'custom:apple-home-view',
      title: localize('pages.cameras'),
      pageType: 'cameras',
      customizations: customizations
    }]
  });

  // Add room views for each area
  try {
    const areas = await hass.callWS({ type: 'config/area_registry/list' });
    
    for (const area of areas) {
      views.push({
        title: area.name,
        path: `room-${area.area_id}`,
        icon: 'mdi:home-outline',
        panel: true,
        subview: true,
        cards: [{
          type: 'custom:apple-home-view',
          title: area.name,
          pageType: 'room',
          areaId: area.area_id,
          areaName: area.name,
          customizations: customizations
        }]
      });
    }
  } catch (error) {
    console.error('Error fetching areas for room views:', error);
  }

  // Add view for "Default Room" (entities without area)
  views.push({
    title: localize('pages.default_room'),
    path: 'room-no_area',
    icon: 'mdi:home-outline',
    panel: true,
    subview: true,
    cards: [{
      type: 'custom:apple-home-view',
      title: localize('pages.default_room'),
      pageType: 'room',
      areaId: 'no_area',
      areaName: localize('pages.default_room'),
      customizations: customizations
    }]
  });

  return { views };
}

/**
 * Strategy Class - Required by Home Assistant for proper strategy registration
 * This follows the Home Assistant strategy pattern exactly like mushroom-strategy
 */
class AppleHomeStrategy extends HTMLElement {
  /**
   * Generate a dashboard configuration
   * Called by Home Assistant when creating a dashboard with this strategy
   */
  static async generateDashboard(info: { hass: any; config: any }): Promise<{ views: any[] }> {
    // Extract options from config if available
    const options = info.config?.strategy?.options || {};
    
    // Use our stateless function
    return generateLovelaceDashboard({ hass: info.hass }, options);
  }
}

// Register custom elements (components still work exactly the same)
if (!customElements.get('apple-home-card')) {
  customElements.define('apple-home-card', AppleHomeCard);
}
if (!customElements.get('apple-home-view')) {
  customElements.define('apple-home-view', AppleHomeView);
}

// Register the strategy element with Home Assistant (required pattern)
if (!customElements.get('ll-strategy-apple-home-strategy')) {
  customElements.define('ll-strategy-apple-home-strategy', AppleHomeStrategy);
}

// Register the strategy with Home Assistant cards list
if (window.customCards) {
  window.customCards.push({
    type: 'custom:apple-home-strategy',
    name: 'Apple Home Strategy',
    description: 'Apple Home-style dashboard strategy with stateless architecture',
    preview: false
  });
}

// Also register the function for backward compatibility
window.customStrategies = window.customStrategies || {};
window.customStrategies['apple-home-strategy'] = generateLovelaceDashboard;


