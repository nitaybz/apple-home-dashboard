/**
 * Central configuration for Apple Home Dashboard
 * Handles entity styling, grouping  static readonly DOMAIN_TO_GROUP: Record<string, DeviceGroup> = {
    'light': DeviceGroup.LIGHTING,
    'switch': DeviceGroup.OTHER, // Outlets and switches
    'climate': DeviceGroup.CLIMATE,
    'fan': DeviceGroup.CLIMATE,
    'cover': DeviceGroup.CLIMATE, // Default - garage doors go to security
    'lock': DeviceGroup.SECURITY,
    'alarm_control_panel': DeviceGroup.SECURITY,
    'media_player': DeviceGroup.MEDIA,
    'camera': DeviceGroup.SECURITY,
    'binary_sensor': DeviceGroup.SECURITY, // Motion, occupancy, contact sensors
    'sensor': DeviceGroup.OTHER // Temperature, humidity, battery sensors
  };rocessing
 */

import { EntityData, EntityState } from '../types/types';
import { localize } from '../utils/LocalizationService';

// =====================================================================
// ENUMS AND INTERFACES
// =====================================================================

export enum DeviceGroup {
  LIGHTING = 'lighting',
  CLIMATE = 'climate', 
  SECURITY = 'security',
  WATER = 'water',
  MEDIA = 'media',
  OTHER = 'other'
}

export interface GroupStyle {
  iconColor: string;
  activeIconColor?: string;
  icon: string;
  name: string | (() => string);
}

// =====================================================================
// CONSTANTS
// =====================================================================

// Special climate colors based on hvac mode
const CLIMATE_MODE_COLORS = {
  heat: '#ff8d13',
  heating: '#ff8d13',
  cool: '#48a0ff',
  cooling: '#48a0ff',
  auto: '#34c759',
  heat_cool: '#34c759',
  dry: '#466680',
  fan_only: '#000000',
  off: '#ffffff'
};

export class DashboardConfig {
  // =====================================================================
  // GROUP CONFIGURATION
  // =====================================================================

  /**
   * Device group styling configurations
   * Following Apple Home's color conventions
   */
  static readonly GROUP_STYLES: Record<DeviceGroup, GroupStyle> = {
    [DeviceGroup.LIGHTING]: {
      iconColor: '#ffcc06', // Yellow for lights
      icon: 'mdi:lightbulb',
      name: () => localize('groups.lights')
    },
    [DeviceGroup.CLIMATE]: {
      iconColor: '#00c0e8', // Blue for climate/fans/covers
      icon: 'mdi:fan',
      name: () => localize('groups.climate')
    },
    [DeviceGroup.SECURITY]: {
      iconColor: '#00cbbf', // Teal for security devices
      icon: 'mdi:lock',
      name: () => localize('groups.security')
    },
    [DeviceGroup.WATER]: {
      iconColor: '#0b78f6', // Dark blue for water devices
      icon: 'mdi:water-outline',
      name: () => localize('groups.water')
    },
    [DeviceGroup.MEDIA]: {
      iconColor: '#ffffff', // White for media players
      activeIconColor: '#696969', // Dark grey when active for visibility
      icon: 'mdi:speaker',
      name: () => localize('groups.media')
    },
    [DeviceGroup.OTHER]: {
      iconColor: '#ffcc0f', // Yellow for switches/outlets (same as lights)
      icon: 'mdi:light-switch',
      name: () => localize('groups.other')
    }
  };

  /**
   * Domain to device group mapping
   */
  static readonly DOMAIN_TO_GROUP: Record<string, DeviceGroup> = {
    'light': DeviceGroup.LIGHTING,
    'switch': DeviceGroup.OTHER, // Outlets and switches
    'climate': DeviceGroup.CLIMATE,
    'fan': DeviceGroup.CLIMATE,
    'cover': DeviceGroup.CLIMATE, // Default - garage doors go to security
    'lock': DeviceGroup.SECURITY,
    'alarm_control_panel': DeviceGroup.SECURITY,
    'media_player': DeviceGroup.MEDIA,
    'camera': DeviceGroup.SECURITY,
    'binary_sensor': DeviceGroup.SECURITY, // Motion, occupancy, contact sensors
    'sensor': DeviceGroup.SECURITY,
    'vacuum': DeviceGroup.OTHER // Robot vacuums
  };

  // =====================================================================
  // DOMAIN CONFIGURATION
  // =====================================================================

  /**
   * Supported domains for the main dashboard
   */
  static readonly SUPPORTED_DOMAINS = [
    'light', 'switch', 'cover', 'climate', 'fan', 'media_player', 
    'lock', 'alarm_control_panel', 'scene', 'script', 'camera', 'vacuum'
  ] as const;

  /**
   * Additional domains used by StatusSection
   */
  static readonly STATUS_SECTION_DOMAINS = [
    'sensor', 'binary_sensor'
  ] as const;

  /**
   * Domains that should appear in scenes section
   */
  static readonly SCENES_DOMAINS = ['scene', 'script'] as const;

  /**
   * Domains that should appear in cameras section
   */
  static readonly CAMERAS_DOMAINS = ['camera'] as const;

  /**
   * Domains that should be displayed as tall cards by default
   */
  static readonly DEFAULT_TALL_DOMAINS = ['climate', 'lock', 'alarm_control_panel', 'camera', 'vacuum'] as const;

  // =====================================================================
  // STYLING CONSTANTS
  // =====================================================================

  // Common inactive styling (same for all devices)
  // Uses CSS variables from LiquidGlassStyles.ts for centralized control
  private static readonly INACTIVE_STYLE = {
    backgroundColor: 'var(--apple-card-bg-inactive, rgba(56, 56, 56, 0.46))',
    iconColor: 'var(--apple-icon-inactive, rgba(142, 142, 147, 0.8))',
    iconBackgroundColor: 'var(--apple-icon-bg-inactive, rgba(0, 0, 0, 0.2))',
    textColor: 'var(--apple-text-inactive, #ffffff)'
  };

  // Common active styling (same base for all devices)
  private static readonly ACTIVE_BASE_STYLE = {
    backgroundColor: 'var(--apple-card-bg-active, #ffffff)',
    textColor: 'var(--apple-text-active, #1d1d1f)'
  };

  // =====================================================================
  // UTILITY METHODS
  // =====================================================================

  /**
   * Check if a cover entity is a garage door or gate based on device class
   * @param entityId The entity ID to check
   * @param attributes The entity attributes
   * @returns true if it's a garage door or gate
   */
  static isGarageDoorOrGate(entityId: string, attributes: any): boolean {
    const deviceClass = attributes?.device_class?.toLowerCase();
    return (deviceClass === 'garage' || deviceClass === 'gate');
  }

  /**
   * Check if a switch entity is an outlet based on device class
   * @param entityId The entity ID to check  
   * @param attributes The entity attributes
   * @returns true if it's an outlet
   */
  static isOutlet(entityId: string, attributes: any): boolean {
    const deviceClass = attributes?.device_class?.toLowerCase();
    return deviceClass === 'outlet';
  }

  /**
   * Get the device group for an entity with special handling
   * @param domain The entity domain
   * @param entityId The entity ID (optional)
   * @param attributes The entity attributes (optional)
   * @param showSwitches Whether to show switch entities (default: false)
   * @returns The device group or undefined if entity should be hidden
   */
  static getDeviceGroup(domain: string, entityId?: string, attributes?: any, showSwitches?: boolean): DeviceGroup | undefined {
    // Special handling for covers that might be garage doors or gates
    if (domain === 'cover' && entityId && attributes) {
      if (this.isGarageDoorOrGate(entityId, attributes)) {
        return DeviceGroup.SECURITY;
      }
    }
    
    // Special handling for switches
    if (domain === 'switch' && entityId && attributes) {
      if (this.isOutlet(entityId, attributes)) {
        return DeviceGroup.OTHER; // Outlets always go to "Other" group
      } else if (showSwitches === true) {
        return DeviceGroup.OTHER; // Non-outlet switches go to "Other" when enabled
      } else if (showSwitches === undefined) {
        // When showSwitches is not provided (e.g., from styling), assume the entity
        // is valid since it passed initial filtering, so give it proper styling
        return DeviceGroup.OTHER; // Default to "Other" group for styling purposes
      } else {
        return undefined; // Hide non-outlet switches when setting is explicitly disabled
      }
    }
    
    // Special handling for sensors based on device_class
    if (domain === 'sensor' && attributes) {
      const deviceClass = attributes.device_class;
      const unitOfMeasurement = attributes.unit_of_measurement;
      
      // Temperature sensors go to Climate
      if (deviceClass === 'temperature' || unitOfMeasurement === '°C' || unitOfMeasurement === '°F') {
        return DeviceGroup.CLIMATE;
      }
      // Humidity sensors go to Climate
      if (deviceClass === 'humidity') {
        return DeviceGroup.CLIMATE;
      }
      // Illuminance/light sensors go to Lighting
      if (deviceClass === 'illuminance' || unitOfMeasurement === 'lx') {
        return DeviceGroup.LIGHTING;
      }
      // Battery sensors go to Other (or could be shown anywhere)
      if (deviceClass === 'battery') {
        return DeviceGroup.OTHER;
      }
      // Default sensors to Security (for things like smoke, gas, etc.)
      return DeviceGroup.SECURITY;
    }
    
    // Special handling for binary_sensors based on device_class
    if (domain === 'binary_sensor' && attributes) {
      const deviceClass = attributes.device_class;
      
      // Motion and occupancy could be considered security or climate-related
      // Keep them in Security for now as they are typically security-related
      if (deviceClass === 'motion' || deviceClass === 'occupancy') {
        return DeviceGroup.SECURITY;
      }
      // Door, window, opening sensors are security
      if (deviceClass === 'door' || deviceClass === 'window' || deviceClass === 'opening' || 
          deviceClass === 'garage_door' || deviceClass === 'lock') {
        return DeviceGroup.SECURITY;
      }
      // Smoke, gas, carbon monoxide are security
      if (deviceClass === 'smoke' || deviceClass === 'gas' || deviceClass === 'carbon_monoxide') {
        return DeviceGroup.SECURITY;
      }
      // Light sensors (binary) go to Lighting
      if (deviceClass === 'light') {
        return DeviceGroup.LIGHTING;
      }
      // Default binary sensors to Security
      return DeviceGroup.SECURITY;
    }
    
    return this.DOMAIN_TO_GROUP[domain];
  }

  /**
   * Get the group style for a device group
   * @param group The device group
   * @returns The group style configuration
   */
  static getGroupStyle(group: DeviceGroup): GroupStyle {
    return this.GROUP_STYLES[group];
  }

  // =====================================================================
  // DOMAIN VALIDATION METHODS
  // =====================================================================

  /**
   * Check if a domain is supported by the dashboard
   * @param domain The entity domain to check
   * @returns true if the domain is supported
   */
  static isSupportedDomain(domain: string): boolean {
    return this.SUPPORTED_DOMAINS.includes(domain as any);
  }

  /**
   * Check if a domain is valid for status section usage
   * @param domain The entity domain to check
   * @returns true if the domain can be used in status calculations
   */
  static isStatusDomain(domain: string): boolean {
    return this.SUPPORTED_DOMAINS.includes(domain as any) || 
           this.STATUS_SECTION_DOMAINS.includes(domain as any);
  }

  /**
   * Check if a domain should appear in the scenes section
   * @param domain The entity domain to check
   * @returns true if the domain should appear in scenes
   */
  static isScenesDomain(domain: string): boolean {
    return this.SCENES_DOMAINS.includes(domain as any);
  }

  /**
   * Check if a domain should appear in the cameras section
   * @param domain The entity domain to check
   * @returns true if the domain should appear in cameras
   */
  static isCamerasDomain(domain: string): boolean {
    return this.CAMERAS_DOMAINS.includes(domain as any);
  }

  /**
   * Check if a domain should be excluded from regular area processing
   * @param domain The entity domain to check
   * @returns true if the domain should be handled in special sections
   */
  static isSpecialSectionDomain(domain: string): boolean {
    return this.isScenesDomain(domain) || this.isCamerasDomain(domain);
  }

  /**
   * Check if a domain should be displayed as a tall card by default
   * @param domain The entity domain to check
   * @returns true if the domain should be tall by default
   */
  static isDefaultTallDomain(domain: string): boolean {
    return this.DEFAULT_TALL_DOMAINS.includes(domain as any);
  }

  // =====================================================================
  // ENTITY STYLING AND DATA PROCESSING
  // =====================================================================

  /**
   * Apply group-based styling for active devices
   * Active: white icon, colored background circle
   * Uses activeIconColor if defined in group style, otherwise defaults to white
   */
  private static applyGroupStyling(group: DeviceGroup): Partial<EntityData> {
    const groupStyle = this.getGroupStyle(group);
    
    // Use activeIconColor if defined, otherwise default to white
    const iconColor = groupStyle.activeIconColor || '#ffffff';
    
    return {
      ...this.ACTIVE_BASE_STYLE,
      iconBackgroundColor: groupStyle.iconColor,
      iconColor
    };
  }

  /**
   * Apply inactive styling with group color for icon
   * Inactive: colored icon, gray background circle
   */
  private static applyInactiveStyling(group?: DeviceGroup): Partial<EntityData> {
    if (group) {
      const groupStyle = this.getGroupStyle(group);
      return {
        ...this.INACTIVE_STYLE,
        iconColor: groupStyle.iconColor
      };
    }
    return this.INACTIVE_STYLE;
  }

  /**
   * Get fallback icon based on domain and state
   */
  private static getFallbackIcon(domain: string, entityState: string, attributes: any, entityId?: string): string {
    switch (domain) {
      case 'light':
        return 'mdi:lightbulb';
      case 'switch':
        // Special handling for outlets
        if (entityId && this.isOutlet(entityId, attributes)) {
          return 'mdi:power-socket';
        }
        // Fallback for other switches (though they should be hidden)
        return 'mdi:light-switch';
      case 'cover':
        // Special handling for garage doors and gates
        if (entityId && this.isGarageDoorOrGate(entityId, attributes)) {
          switch (entityState) {
            case 'opening':
              return 'mdi:garage-open';
            case 'closing':
              return 'mdi:garage';
            case 'open':
              return 'mdi:garage-open';
            case 'closed':
            default:
              return 'mdi:garage';
          }
        }
        // Regular covers (blinds, shutters, etc.)
        if (entityState === 'opening' || entityState === 'closing') {
          return 'mdi:window-shutter-cog';
        }
        return entityState === 'open' ? 'mdi:window-shutter-open' : 'mdi:window-shutter';
      case 'climate':
        return 'mdi:thermostat';
      case 'fan':
        return 'mdi:fan';
      case 'media_player':
        return this.getMediaPlayerIcon(entityState, attributes);
      case 'lock':
        return entityState === 'unlocked' ? 'mdi:lock-open' : 'mdi:lock';
      case 'alarm_control_panel':
        return 'mdi:alarm-light';
      case 'button':
        return 'mdi:gesture-tap-button';
      case 'input_boolean':
        return entityState === 'on' ? 'mdi:toggle-switch' : 'mdi:toggle-switch-off';
      case 'input_button':
        return 'mdi:gesture-tap-button';
      case 'vacuum':
        return entityState === 'cleaning' ? 'mdi:robot-vacuum' : 'mdi:robot-vacuum';
      default:
        return 'mdi:help-circle';
    }
  }

  /**
   * Apply special climate styling based on hvac mode
   * Climate uses mode-specific colors but follows same icon/background logic
   */
  private static applyClimateStyling(entityState: string, isActive: boolean): Partial<EntityData> {
    const climateColor = (CLIMATE_MODE_COLORS as any)[entityState] || CLIMATE_MODE_COLORS.off;
    
    if (isActive) {
      // Active climate: white icon, colored background (but transparent for climate)
      return {
        ...this.ACTIVE_BASE_STYLE,
        iconBackgroundColor: 'transparent',
        iconColor: climateColor
      };
    } else {
      // Inactive climate: colored icon, gray background
      return {
        ...this.INACTIVE_STYLE,
        iconColor: climateColor
      };
    }
  }

  /**
   * Get media player icon based on device class and state
   */
  private static getMediaPlayerIcon(entityState: string, attributes: any): string {
    const deviceClass = attributes.device_class;
    
    // Use device class for specific icons (no state-based changes)
    switch (deviceClass) {
      case 'tv':
        return 'mdi:television';
      case 'speaker':
        return 'mdi:speaker';
      case 'receiver':
        return 'mdi:audio-video';
      case 'music':
        return 'mdi:music';
      default:
        // Fallback to generic cast icon
        return 'mdi:cast';
    }
  }

  /**
   * Get entity data with styling and status information
   */
  static getEntityData(state: EntityState, domain: string, isTall: boolean = false, forceWhiteIcons: boolean = false, hass?: any): EntityData {
    
    const entityState = state.state;
    const attributes = state.attributes;
    
    // Handle unavailable, unknown, or other problematic states
    const isUnavailableState = ['unavailable', 'unknown', 'none', 'null', ''].includes(entityState.toLowerCase());
    
    // If unavailable, apply off styling and translate the status text
    if (isUnavailableState) {
      return {
        isActive: false,
        backgroundColor: this.INACTIVE_STYLE.backgroundColor,
        iconColor: '#ffffff', // White icon for unavailable entities
        iconBackgroundColor: this.INACTIVE_STYLE.iconBackgroundColor,
        textColor: this.INACTIVE_STYLE.textColor,
        stateText: this.getUnavailableStateText(entityState),
        icon: attributes.icon || this.getFallbackIcon(domain, entityState, attributes, state.entity_id)
      };
    }

    // Handle status domains (includes both supported and status-section domains)
    if (!this.isStatusDomain(domain)) {
      return this.handleUnsupportedDomain(entityState, attributes, domain, state.entity_id);
    }

    // Get device group and determine if active
    const deviceGroup = this.getDeviceGroup(domain, state.entity_id, attributes);
    const isActive = this.isEntityActive(domain, entityState, attributes);
    
    const icon = attributes.icon || this.getFallbackIcon(domain, entityState, attributes, state.entity_id);
    const stateText = this.getStateText(domain, entityState, attributes, hass);

    // Apply styling based on domain and state
    let styling: Partial<EntityData>;
    if (domain === 'climate') {
      // Climate domain uses special mode-based colors
      styling = this.applyClimateStyling(entityState, isActive);
    } else if (isActive && deviceGroup) {
      // Use group-based styling for active devices
      styling = this.applyGroupStyling(deviceGroup);
    } else {
      // Use inactive styling with group color for icon
      styling = this.applyInactiveStyling(deviceGroup);
    }

    // Override icon color if forceWhiteIcons is true
    if (forceWhiteIcons) {
      styling = {
        ...styling,
        iconColor: '#ffffff'
      };
    }

    return {
      isActive,
      backgroundColor: styling.backgroundColor || this.INACTIVE_STYLE.backgroundColor,
      iconColor: styling.iconColor || this.INACTIVE_STYLE.iconColor,
      iconBackgroundColor: styling.iconBackgroundColor || this.INACTIVE_STYLE.iconBackgroundColor,
      textColor: styling.textColor || this.INACTIVE_STYLE.textColor,
      stateText,
      icon
    };
  }

  /**
   * Determine if an entity should be considered active based on domain and state
   */
  private static isEntityActive(domain: string, entityState: string, attributes?: any): boolean {
    let result;
    switch (domain) {
      case 'light':
      case 'switch':
      case 'fan':
        result = entityState === 'on';
        break;
      case 'cover':
        result = entityState === 'open' || entityState === 'opening';
        break;
      case 'climate':
        result = entityState !== 'off';
        break;
      case 'media_player':
        result = ['playing', 'paused', 'buffering', 'on'].includes(entityState);
        break;
      case 'lock':
        // Locked state should look like "off" (inactive), unlocked state is active
        result = entityState === 'unlocked';
        break;
      case 'alarm_control_panel':
        // Disarmed state should look like "off" (inactive), all other states are active
        result = entityState !== 'disarmed';
        break;
      case 'binary_sensor':
        // Most binary sensors are active when 'on', which corresponds to detected/open/unsafe states
        result = entityState === 'on';
        break;
      case 'sensor':
         // Sensors are always considered active for status display
        result = true;
        break;
      case 'input_boolean':
        result = entityState === 'on';
        break;
      case 'button':
      case 'input_button':
        // Buttons are always shown as actionable (similar to scenes)
        result = true;
        break;
      case 'vacuum':
        // Vacuum is active when cleaning, returning, or any state other than docked/idle/off
        result = ['cleaning', 'returning', 'paused'].includes(entityState);
        break;
      default:
        result = ['on', 'active', 'enabled', 'open', 'unlocked'].includes(entityState.toLowerCase());
    }
    
    return result;
  }

  /**
   * Get localized state text for an entity
   */
  private static getStateText(domain: string, entityState: string, attributes: any, hass?: any): string {
    switch (domain) {
      case 'light':
        if (entityState === 'on' && attributes.brightness) {
          const brightness = Math.round((attributes.brightness / 255) * 100);
          return `${brightness}%`;
        }
        return entityState === 'on' ? localize('status.on') : localize('status.off');

      case 'switch':
        return entityState === 'on' ? localize('status.on') : localize('status.off');

      case 'cover':
        if (entityState === 'closed') {
          return localize('status.closed');
        } else if (entityState === 'open') {
          const position = attributes.current_position;
          if (typeof position === 'number' && position < 100 && position > 0) {
            return `${position}% ${localize('status.open')}`;
          }
          return localize('status.open');
        } else {
          // opening, closing, or other transitional states
          return entityState.charAt(0).toUpperCase() + entityState.slice(1);
        }

      case 'climate':
        return this.getClimateStateText(entityState, attributes, hass);

      case 'fan':
        if (entityState === 'on' && attributes.percentage && typeof attributes.percentage === 'number') {
          return `${attributes.percentage}%`;
        }
        return entityState === 'on' ? localize('status.on') : localize('status.off');

      case 'media_player':
        return this.getMediaPlayerStateText(entityState);

      case 'lock':
        return this.getLockStateText(entityState);

      case 'alarm_control_panel':
        return this.getAlarmStateText(entityState);

      case 'binary_sensor':
        return this.getBinarySensorStateText(entityState, attributes);

      case 'sensor':
        return this.getSensorStateText(entityState, attributes);

      case 'input_boolean':
        return entityState === 'on' ? localize('status.on') : localize('status.off');

      case 'button':
      case 'input_button':
        // Buttons show when they were last pressed or just 'Press' if never pressed
        return localize('status.press') || 'Press';

      case 'vacuum':
        return this.getVacuumStateText(entityState, attributes);

      default:
        return entityState === 'on' ? localize('status.on') : localize('status.off');
    }
  }

  /**
   * Get climate-specific state text
   */
  private static getClimateStateText(entityState: string, attributes: any, hass?: any): string {
    const targetTemp = attributes.temperature;
    const targetTempHigh = attributes.target_temp_high;
    const targetTempLow = attributes.target_temp_low;
    // Get temperature unit from entity attributes, or from Home Assistant config, or fallback to °C
    const tempUnit = attributes.unit_of_measurement || hass?.config?.unit_system?.temperature || '°C';

    switch (entityState) {
      case 'heat':
      case 'heating':
        return targetTemp ? `${localize('status.heat_to')} ${targetTemp}${tempUnit}` : localize('status.heat_to');
      case 'cool':
      case 'cooling':
        return targetTemp ? `${localize('status.cool_to')} ${targetTemp}${tempUnit}` : localize('status.cool_to');
      case 'auto':
      case 'heat_cool':
        if (targetTempLow && targetTempHigh) {
          return `${localize('status.auto')} ${targetTempLow}-${targetTempHigh}${tempUnit}`;
        } else if (targetTemp) {
          return `${localize('status.auto')} ${targetTemp}${tempUnit}`;
        }
        return localize('status.auto');
      case 'dry':
        return localize('status.dry');
      case 'fan_only':
        return localize('status.fan_only');
      case 'off':
        return localize('status.off');
      default:
        return entityState.charAt(0).toUpperCase() + entityState.slice(1);
    }
  }

  /**
   * Get media player-specific state text
   */
  private static getMediaPlayerStateText(entityState: string): string {
    switch (entityState) {
      case 'playing':
        return localize('status.playing');
      case 'paused':
        return localize('status.paused');
      case 'buffering':
        return localize('status.buffering');
      case 'idle':
        return localize('status.idle');
      case 'standby':
        return localize('status.standby');
      case 'on':
        return localize('status.on');
      default:
        return localize('status.off');
    }
  }

  /**
   * Get vacuum-specific state text
   */
  private static getVacuumStateText(entityState: string, attributes: any): string {
    switch (entityState) {
      case 'cleaning':
        return localize('status.cleaning');
      case 'docked':
        return localize('status.docked');
      case 'returning':
        return localize('status.returning');
      case 'paused':
        return localize('status.paused');
      case 'idle':
        return localize('status.idle');
      case 'error':
        return localize('status.error');
      case 'off':
        return localize('status.off');
      default:
        return entityState.charAt(0).toUpperCase() + entityState.slice(1);
    }
  }

  /**
   * Get lock-specific state text
   */
  private static getLockStateText(entityState: string): string {
    switch (entityState) {
      case 'locked':
        return localize('status.locked');
      case 'unlocked':
        return localize('status.unlocked');
      case 'jammed':
        return localize('status.jammed');
      default:
        return localize('status.off');
    }
  }

  /**
   * Get alarm control panel-specific state text
   */
  private static getAlarmStateText(entityState: string): string {
    switch (entityState) {
      case 'disarmed':
        return localize('status.disarmed');
      case 'armed_home':
        return localize('status.armed_home');
      case 'armed_away':
        return localize('status.armed_away');
      case 'armed_night':
        return localize('status.armed_night');
      case 'armed_vacation':
        return localize('status.armed_vacation');
      case 'armed_custom_bypass':
        return localize('status.armed_custom_bypass');
      case 'pending':
        return localize('status.pending');
      case 'arming':
        return localize('status.arming');
      case 'disarming':
        return localize('status.disarming');
      case 'triggered':
        return localize('status.triggered');
      default:
        return localize('status.unknown');
    }
  }

  /**
   * Get binary sensor-specific state text
   */
  private static getBinarySensorStateText(entityState: string, attributes: any): string {
    const deviceClass = attributes.device_class;
    const friendlyName = attributes.friendly_name;
    
    if (entityState === 'on') {
      switch (deviceClass) {
        case 'motion':
          return localize('motion.detected');
        case 'occupancy':
          return localize('occupancy.detected');
        case 'door':
        case 'window':
        case 'opening':
          return localize('status.open');
        case 'garage_door':
          return localize('status.open');
        case 'moisture':
        case 'gas':
        case 'problem':
          return localize('status.detected');
        case 'safety':
          return localize('status.unsafe');
        case 'smoke':
          return localize('smoke.detected');
        case 'sound':
          return localize('status.detected');
        case 'vibration':
          return localize('status.detected');
        case 'lock':
          return localize('status.locked');
        case 'plug':
          return localize('status.plugged_in');
        case 'presence':
          return localize('status.home');
        case 'power':
          return localize('status.on');
        case 'running':
          return localize('status.running');
        case 'update':
          return localize('status.update_available');
        default:
          return localize('status.on');
      }
    } else {
      switch (deviceClass) {
        case 'motion':
          return localize('motion.not_detected');
        case 'occupancy':
          return localize('occupancy.not_detected');
        case 'door':
        case 'window':
        case 'opening':
          return localize('status.closed');
        case 'garage_door':
          return localize('status.closed');
        case 'moisture':
        case 'gas':
        case 'problem':
          return localize('status.clear');
        case 'safety':
          return localize('status.safe');
        case 'smoke':
          return localize('smoke.not_detected');
        case 'sound':
          return localize('status.clear');
        case 'vibration':
          return localize('status.clear');
        case 'lock':
          return localize('status.unlocked');
        case 'plug':
          return localize('status.unplugged');
        case 'presence':
          return localize('status.away');
        case 'power':
          return localize('status.off');
        case 'running':
          return localize('status.idle');
        case 'update':
          return localize('status.up_to_date');
        default:
          return localize('status.off');
      }
    }
  }

  /**
   * Get sensor-specific state text
   */
  private static getSensorStateText(entityState: string, attributes: any): string {
    const deviceClass = attributes.device_class;
    const unitOfMeasurement = attributes.unit_of_measurement;
    
    // If it has a unit of measurement, show the value with unit
    if (unitOfMeasurement && entityState !== 'unavailable' && entityState !== 'unknown') {
      return `${entityState} ${unitOfMeasurement}`;
    }
    
    // Handle special device classes
    switch (deviceClass) {
      case 'battery':
        return entityState !== 'unavailable' && entityState !== 'unknown' ? `${entityState}%` : entityState;
      case 'humidity':
        return entityState !== 'unavailable' && entityState !== 'unknown' ? `${entityState}%` : entityState;
      case 'temperature':
        return entityState !== 'unavailable' && entityState !== 'unknown' ? `${entityState}°` : entityState;
      case 'timestamp':
        // Return the raw timestamp for now
        return entityState;
      default:
        return entityState;
    }
  }

  /**
   * Get translated text for unavailable states
   */
  private static getUnavailableStateText(entityState: string): string {
    switch (entityState.toLowerCase()) {
      case 'unavailable':
        return localize('status.unavailable');
      case 'unknown':
        return localize('status.unknown');
      case 'none':
      case 'null':
      case '':
        return localize('status.none');
      default:
        return entityState;
    }
  }

  /**
   * Handle unsupported domains (fallback behavior)
   */
  private static handleUnsupportedDomain(entityState: string, attributes: any, domain: string, entityId?: string): EntityData {
    const isActive = ['on', 'active', 'enabled', 'open', 'unlocked'].includes(entityState.toLowerCase());
    const stateText = isActive ? localize('status.on') : localize('status.off');
    const icon = attributes.icon || this.getFallbackIcon(domain, entityState, attributes, entityId);

    return {
      isActive,
      backgroundColor: isActive ? this.ACTIVE_BASE_STYLE.backgroundColor : this.INACTIVE_STYLE.backgroundColor,
      iconBackgroundColor: isActive ? '#34c759' : this.INACTIVE_STYLE.iconBackgroundColor,
      iconColor: isActive ? '#ffffff' : this.INACTIVE_STYLE.iconColor,
      textColor: isActive ? this.ACTIVE_BASE_STYLE.textColor : this.INACTIVE_STYLE.textColor,
      stateText,
      icon
    };
  }



  // Default Apple-style gradient background (beautiful sunrise/sunset theme)
  private static readonly DEFAULT_BACKGROUND = `
    url(data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAIBAQEBAQIBAQECAgICAgQDAgICAgUEBAMEBgUGBgYFBgYGBwkIBgcJBwYGCAsICQoKCgoKBggLDAsKDAkKCgr/2wBDAQICAgICAgUDAwUKBwYHCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgr/wAARCANABcADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDb2D1NLU/kP6ipa/o9XPwcr1J5J96k8j3qTyPei/c1XmV/JPvS7G9KnorPUWhD+8FH7w1a8j3o8j3q+dC5YlTY3pS7D6irXke9FUaWsV6KseR70/YPU1ne5Ayin7B6mjYPU0E8oyin7B6mjYPU0ByjKKfsHqafsPqKB8pDRU2w+oo2H1FGocqIadsPqKm8j3o8j3pXFylfyPepKf5a/wB6jy1/vU+cpU0hlAt1ByAPzqbYfUUbD6il7RFXRD5J9/zpdjelPp2w+opi0ItjelPqTyPejyPegLBSbB6mn7D6ineR71VrDt3K/ke9SU9EI+tP2H1FHMGiIaXycelSbWPal2H1FR7RBdMhoqT7Oak8j3plEWweppam2H1FOjj7k1mBXp2w+oqbyPen7B6mgCtsPqKNh9RU0URJo8j3q7oehFsHqaNg9TVmjyPei4rkOw+optWKUqR3FO9wuVqX5/erPkufSjyXHpWfOXoQbB6mlqbYfUU7yPegLXK9FWPI96k8j3ouO5W2D1NLVryXPpS+S/tRcnkuVfJHtTtq+lWPJf2pPJcelF0HIiGirHke9Hke9AtCvRVjyPeisx3SK9SVYooHdleip9g9TRsHqaAuMoqbYfUUbD6igdpdiGipth9RRsPqKAtLsNop2w+op3ke9Bab7EdFSUeR70DIdkvoafsb0qXYfUUbD6igXIRbG9KNrelS+X70eX70+cfIQ0VNsPqKd5HvRzmPsiDa3pS/vKm8j3o8j3rPnRXskR0VJ5J96d5bVZag2Q0VP5a/3qPLX+9Uc6D2ciCirewepo2D1NHOg5GVKkqfYPU0vlr6ijnQcjK9O2H1FTeR71J5HvR7RCSRV2H1FNq55HvR5HvRzoLIq7D6ineSferewepo2D1NWGhUoq19lP8AeH50fZT/AHh+dK6NE0irRVjyPejyPemLkRXoq55A/vUvkD+8aXtRchSqSrPkD+8af5HvSdRMajYqbG9KNjelWfs/+z+tHln0/Ws/aMOUq0Vcp2z/ADmj2hfIVPJajyWq3s/zmjZ/nNHtB2ZV2Tf3j+dP+yj+8fzq3s/zmjZ/nNHtBcrKtFWPI96PI96rQXIV6d5fvVryPejyPejQOQr0VNsFLsHqax9oXykFLsb0qejyv9n9a09qTyEGxvSjY3pVjyR7Uuw+oqPbMrlK2xvSn1NsPqKXYPU0e1uHJcgoqxtT+6fzo2p/dP50e0FyIq7P85pct/d/WrPkin7B6mh1bmiplfyTS+Sfepto/wAmjYP8mjnI9mQ+Sfek8n/Oan2f5zT9h9RT5w9mVNn+c0bP85qzsX0o2D1NZc7L9myts/zmjZ/nNWdi+lGxfSnzh7NkOxvSjY3pU2wf3aNg9KOcPZsh2N6UbG9Km2L6UbB6mj2jD2bIKXY3pU2wepo2D1NHtGHs2VvM9qdU+wepo2D1NHtGg9myCip9g9TRsH92j2kg9myCl2N6VNsH92jYPSj2jD2bIdjelGxvSpti+lGxfSjnD2bIdjelJU+xfSjYvpR7Rh7NkeW/u/rRlv7v61JsX0o2L6Uc4ezZF+8o/eVP5I9qPJHtUe0YuQr+SPal/eGp/Kf1o8p/WhTsVylYw5Oc0eR71c8j3o8j3pc6F7NlPyPejyPerexfSjYvpRzi5Ct+8pvke9W9i+lGxfSj2g+RFb95TfI96t7F9KNi+lHtA5EVtn+c0mxvSp6K19oP2ZHRT949DRvHoaOdBykIjIGM0uw+oqbyR/e/WjyR/e/WpsLlZW8lvT9aPJb0/WrNFToHsit5LUeS1WNi+lLRoCplfyT70eSfepth9RTaYrWI6PJPvUlFGjElYZsb0pmz/OasbF9aNi+tPnZXsyvsPqKXyWqxsHqaNi+lTcPZnj+wepp8cRbgDipvJPvT/If1Feqrs8j2S7kewepp/lP6VL9lH94/nSG1AGc0aI2IalwfQ0otx3H60fZ19P1rP2lgG+Xn+E0eWP7pqXyR7U/yPencjkRBg+howfQ1N5a/3qf+7o9oh+zK2D6GjB9DU/kn3p2w+oplchW+b0/Sl8p/SrOweppaTdgKnkN70eQ3vVrYPU0tPnAg+zn3o+zn3qfB9KMH0oFZEPkt70eS3vVqiouxkPlN6UeS3p+lWvJPvR5J96RFkQfZz71Hg+hqz5bUeW1aDditg+howfQ1Z8tqBG2aBWRFg+ho2H+8fyqfyPejyPes/aIsg2H+8fyp3lexqfy/ejy/ejnAr+U/pR5T+lWNh9RRsPqK05xakflP6UeU/pU+xvSjY3pRdDIPKf0p/lt/eqTY3pS7D6igCDyz707yv85qTY3pT6jYCLYPU0/YfUU7yPejyPejnAZg+hpPI96kpQjZ5FI0G+WPejyx71LSFQaqMzMj8r2NHlexqfy2pNjelHMgGbD6ineR71JRUmhH5HvR5HvUmD6UYPpQIj8j3qSl2N6U7yH9RQHLch2N6UBWzyKslOf/AK9Gz/OaXtC+Uj8p/Sn4PoafRU3HZIZg+ho+zn3qTaaNp/yaXtGHKiP7Ofej7Ofeptg9TS07sLIg+zn3o+zn3qek2D1NF2FkR+V7Gl8sf3TUlFFwshmD6GjB9DT6Xa3pVJ3BuxBl/f8AKn4b0NPwfSpPI96zuhkfke9FTbD6ijYfUUuYq6IcD0owPSpth9RS+UP7360cwXK+W/u/rT9v+x+tS/u/UflS0vaIfKQfZ/c/lT/LH901NsPqKbS9rIYzB9DRg+hqxtP+TRtNV8yfkQ/ZR6imeR71Yo8j3pe1YXIfKf0pMH0NT07YfUVVyiLB9DRg+hp9SUN2AgwfQ0YPoatDoKWubmE3Yr/Z5Paj7PJ7VYwfSjB9KauGpX+zye1P+yj+8fzqXB9KdsPqKHcNSD7KP7x/OnYPoam2D1NLSV2HIyLYvpRsX0qWnbP85p6hyMr+WtP8ke1SbG9KXYfUUWFykP2VvU0fZm9TU+wepo2D1NV7R9zYhwfQ0YPoam2D1NGweppAR7F9KNg9TUmweppaVgItg9TTvJ/zmn0UwG7P85o2f5zTqk8j3o5wI/I96PI96k8kUvkj2qeYCLyPeipPI96kqQIti+lGwepqWilYdyHyfb9KPJ9v0qzsX0o2L6UXQ/Zsg8sf3TR5Y/umpdjelGxvSmKw3YPU0bB6mpaKXKjXlIfLWjy1qanbD6iiyDlIvIP92jyD/dqby1/vUeWv96oHZEPkH+7TvK9jUtP3r60DK3lP6UmD6Gp6K0C1iDB9DT/LH901JUlAFfZ/smjZ/smrFFRdhZlfyx/dNHlj+6an8se9Hlj3qwIPLH900uD6Gp6KzCzK/lj+6aXB9DVjY3pRsb0oCzK+D6Gm+V7GrNFLQu1yt5XsaPK9jVrY3pSUyLMr+WP7po8sf3TVjyT70eSfendhZlfaf7v6UbT/AHf0qx5HvR5HvSNCvs/2TS4Poas7D6ijYfUVndgVvIP92jB9DU2wepp+w+oqriK2D6GjB9DVnYfUUmxvSqIsyvg+ho8g/wB2rOw+oo2H1FMLMrYPoaPIP92rGxvSjY3pSCzK+D6GjB9DVjY3pRsb0oCzK/kH0ow3oasbG9KNjelAWZH9nPvR9nPvU9FArIqYPoaPIP8Adqxsb0pcL7/nTQ7MrYPoaMH0NT07YfUUgsyt5B/u0eQf7tWNjelGxvSndhZlfB9DRg+hqenbD6ikKyK2D6GjB9DVnYfUUbD6igLIq7T/AHf0o2n+7+lWKTevrQFkQeWP7po8sf3TUlSU7sdmQeQf7tBtyRjbVnYfUUzYPU0gKuD6GjB9DVuo6vnZPIQYPoaPs596s/u6P3dHtPMj2ZW8hvejyG9TVn93R+7o9og9mVxE4GMUmD6Gp6KZrax5PT/K9jUnlexp+w+orr9pc8cg8r2NOwfQ1LsPqKXyvY01UYEOD6GnRwkD5RUnlj3p6dahVNTXcj8p/Sjyn9Kk2H1FL5XsaftQsR+V7GjyvY1PsPqKd5HvVaCK3lexo8r2NWfI96PI96XtURZlfyPejyPeptn+c1Js/wA5o9qiyv5T+lHlP6VZ2D1NGweprS5Fit5T+lHlP6VawPQUYHoKXMgsV/I96PI96sYHoKKE7g0ReV7GjyvY1N5XsKPK9hU+0EQ+V7Gn+U/pU1FXoBD5T+lHlP6VNRTAjpcH0NT0VGhoV/I96PI96n8r2NHlexrO7Ai8t/7tHlv/AHTUu2X/ACKNg9TVe0FZEXlP6UeU/pVjYfUUzyx70/aDIvKf0o8p/SrGw+oo8tqPaARYPoaMH0NS7D6ineR71VzPQgwfQ1Jg+hqbyW/vD86d5CepqXK5otSvg+howfQ1bwPQUzyE9TSTuFiKk8r2NTeQnqafgegouPbcreV7GnfZ296f5HvT9g9TTTL0ZB5HvS4PoaseV7Cn+R71nzsNCpg+hp9WPI96KLjTsV6TyvY1Zo8j3ovcG7jPs596Ps596m2D1NORM/SldFlTyn9Kfg+hqcqB/D+lG0f3f0pe0MyDB9DSbT/d/SrWz/OaNn+c0e0ArYPoad5TdlNT7P8AOaNn+c0e0Ah+zv6/pR9nf1/Sp/KPoaPJPofyqOdjsyH7Ofek+zmpfK9hT/JB6N+tX7QqyIvKPoaeU4/+vTvJP91vyqTyT7fnUe0HZlfyPelwfQ1N5Y96XI9RSWpPIkRbB6mjYPU07ax6KfyqeobsU4pEH2c+9H2c+9T0Uk2yXoQ/ZT/eH502rFFUXch+yn+8Pzo+yt/e/Wpqf5Y96QrlfyH9RTcH0NWvLHvS5HrVXYrsjpv2cf7VTYPpRg+lTYYzB9DSeWP+eY/KpMH0p2w+oo22HciwfQ0YPoan8j3o8j3p3C5HgelGB6U/yvY07B9DU2RqkRbT/d/Sjaf7v6VLg+hp9OyE1Yh8p/SkwfQ1PRTEQYPoaMH0NT0UAMwfQ0YPoafUlAEGD6GjB9DU9FAEXlexo8r2NSeV7Gn+U/pQOzIdp9KCpIxg1Y8j3p/2Zf8AJo9owsU/K9jT/sj1P5Cepp9Rcsq/ZHo+yPVzYfUU2jmYEP2cf7VJHb7Rg9as7D6il2D1NF2FkQeR70eR71YwPQUYHoKLisiDB9DRg+hqfA9BRgegpDIMH0NO8r2NS0UXsaakXlexo8r2NS0/YPU09AIPI96PI96n2D1NGweppAV/K9jTsH0NTbB6mn/Zj6D86aYakGwepo2D1NS+R70eR71kBBsb0o2N6Va8se9Hlj3qvasCrg+howfQ1b8j3o8j3ouVzEGD6GjB9DVrYPU0bB6mncLsq4PoaMH0NWtg9TRsHqaLhdkOD6GjB9DVjyvYUeV7Ci47lXyz70eV7Grmwepo2D1NQF2VcH0NGD6GrWweppvlewq7hdlXyvY0eV7GrtFQK7KmD6GjB9DVuigoreV7Gjyh6GrXlewo8r2FK5oU/s596Ps596ueSfUUbWHai4chV+y/7Bo8r2NWaNn+z+lR7QSbZV+yP6Gj7I/oat+V7Ckpe0DkZU+zn3pvlexq7S+V7Cj2gcjKPlexo8r2NXaXy4fQflR7QfIUfK9jR5XsaveV7Ck8hf7oo9oLkKvlv/dNJ5b/AN01b8hf7opv2f8A2f1o9oHIytlx6/lR5Lnuas/Z/wDZ/Wjyh/dp+0RPIyt9nPvR9nPvVjyvYUlPnEQ/Z1PJpcL6GpaKrnJ5CLC+ho8hfepaKOcOQhy/v+VGX9/yqxx/cNOwfSo9oi+VlXyX9TR5L+pq1RRzi5X2K3lz+jflTPLm9D+VXKKOcOV9ij5A9DQEIOfKq/g+hpPJNRzoORlLyx70eWPer3kn1FJ9nHtWnt2P2JS8r2NHlexq39n/ANn9aTyh6Cl7RByvsVfK9jTsH0NS7D2NGw+orT2iIuyLB9DUeD6GrOw+opPm/u/pR7QLsr/Zz70fZz71YyfT9Kb5Y96OcOYh+zn3o+zn3qeigLsg8hPU0eQnqanwPQUYHoKnmJPKdh9RTvJPvTvso/v0/wAgf3jXb7Q8si8k+9EcRPQZqby/el2L6UKoBH5J/u/rTvK/zmnbF9Kft/2P1qvaj5GQ+R70/wAlqWpKj2litSPyT70eSfep9g9TS1N2TdlbyTS+SferPkj2pKr2oXZX8k+9KsbdAKnqSj2oXIPsr+oo+yv6ipf3ho+ccmpuHIyHyD/eFHkH+8KkPBxR5HvTuidRn2Zv8mjyz/dFWti+lGxfSldjK/kv7Unkv/k1N5HvR5HvW90A37Ox7D86Ps7DsPzqbyPQ0eR71jzMOQh8l/8AJpNjelT+R70/YPU1r7QdmVfszf5NSbG9Kn8j3o8j3o5mHKyDY3pTvJb1qXyPen7B6mi7GokAgwMZpSjEYxUuw9jRsPqKz1HZEHktR5LVNlf7v60+tFNisVPsz+v60fZm9f1qbYP7tP2H1FP2jM+Vsh8k+9Hkn3qfYvpRsX0pe0D2Yw27DqaVYyOP1qQQ4pdh9RU85pCmRbG9KfT/ACx/fH5UeWP74/Klzs05GMpmxvSpvLH98flSeWP7/wClHOw5GR+X707yD3YU/YvpS0c7ZXIN2f5zRs/zmpPL96DbADORUc4chHsPqKd5HvU+wepo2D1NLnYEFFT7F9KWjnYEWz/pmaNg9TUmxfSjYvpS5i7DKKfsX0pcH0pp3C1iOipKKYyOnYf3/OnYPpRg+lRzMBuH9/zp32aX2/OjB9KsZHrVN2E20V/s0vt+dH2aX2/OrFFTzMnmZD9mHv8AnT9jelTbB6mjYPU0r3Fch2N6UbG9Km2D1NGxfSgCHY3pRsb0qel8ke1AFfY3pUn2Zv8AJqejyPei4EPkp70/Y3pT6kpNpAVfKk/u/rR5Un939asbD6ik3t60+c2uiDypP7v60eVJ/d/Wp97etG9vWjnC5H9mb/Jo+zN/k1Pg+popc4rkH2Zv8mpNjelS7D6ijYfUUc4XI/Ib0FJsb0qeimFyLyW9aPJapafsX0oNErlfyWo8lqsbF9KNi+lAcrIdjelH2Zv8mpti+lGwepoC1iH7M3+TRsb0qx5I9qf5HvQFrlTY3pUv2Y+h/OpvI96fsX0oBJkOxvSk8of3B+VT7B6mjYPU0BdkOxvSjY3pU2wepo2p/k0Alch2N6UbG9KfT9g9TUXYWZD9mb/Jo2N6VNsHqafsPqKLtBZsi2N6UbG9Kl2H1FLsX0pD5SDyPeneX71LsX0o2L6U7hyoXyD/AHhTNjelTbF9KNg9TSLtfYh2N6UbG9Kk8ke1P8j3qLIdiHy/ejy/ep/JHtSVYcqIfL96PL96l2L6UbF9Kd2UM8j3o8j3p+xfSlouwI6PI96kopXsAUVJRSsxWRH5HvTvL96dRRzpC5kN8v3o8v3qXYPU0bB6mmUReX70eX71P5I9qPJHtSAgQd6dU3kp6Gl2L6VPOivZsgoqbyo/7v60uxfSpdSwezZF+8o/eVP5K+n60ZX+7+tCqXDkZB+8o+c8Gp8r/d/WjyV9P1odSwcjIfs8vp+tJ5Un939ateR70eR71HtEX7Mr/ZpfQfnTfKk/u/rVryPek2L6UvaIPZlbypP7v60eVJ/d/WrWIff86jo9og9mM2N6UbG9KkxH6Gkp+0Rr7MZsb0p3kv7UtFBInkv7UzyT71YoqfaICv5J96KsUVQFfyPejyPerFFT7Q05CvR5J96sUzyR7UJoXKiKipKKLIXKiEq2TxT9jelTeV7GjyvY1z3sSQ7G9KNjelT+R70VVy7Ir0/YPU0tL5I9qVhkOxfSpPJf2p3kj2pKYDPszeh/Ok8k+9SUUrWAj8k+9Hkn3qTB9KMH0ro0Fyoj8k+9Hkn3qxRSuPkK9Hkn3qSimkkZkPl+9OqSilZAR+Sfem+X71LsX0o2L6UXAi8oe35UeX71LsX0o2L6UXAi8oe35UeUPb8ql2L6UbB6mgCDyPek8g1Y2L6UbF9KVx8iK/kt603Y3pVrYvpUexfSqdRGXs2R+S1HkGp/JT3o8lPej2iD2bPIvs596kwfQ1P5HvT9g9TXf7Q8fkK/lH0NJ5TelTU/YvpS9ogK/lexqSKEtxjipaKmxoR0eSfepKKOZEcrI/JPvS7G9KfUlCdx8pH5B/vU3Yf71TUVXtA9kReQ/qKf9mHv+dTeR70eR71HOSQ/Zh7/AJ1JsPqKd5HvT9g9TRzjuRpHt6UbB6mn7D6in+SPakphyEVFS+SPajyR6CnzNj5WR4b0NGG9DUnk/wCc0eSPal7QrkI8H0NGD6Gpdh9RS+WPenzsViLZL6Gjy3/umpqKftEP2aI/m7gUfN2AqSpK0VS4/Z3K3kS+lHkS+lT+Z7UB8nGKz9qg9kN8sf3TTMH0NTeQ/qKTe3pS5xDfLH900eWP7tT7B6mjYPU0+YehBs/2f0o2f7P6VPsHqaNg9TTFZEOD6GjB9DU2weppaB2IMH0NGD6Gp6KnmYciGYPoaPs596f5HvUnke9TewnZFfyT70uD6GpQgIzuo8v3q73NOUi2N6UbG9KfTth9RTAi2N6UbG9KnooFqMwfQ0YPoafUnke9Juwm2iDB9DRg+hqeilzBzEGD6GjB9DU9FO6NiDB9DUm1j2NP8j3qQQ4Oc0cyFcg2N6UbG9Kt+SP7360eSP7360uZmPMyrsk9DS/Zn9BVvYfUUbD6ioub8xB9mH94/nQLYD+I/nVjYPU0bB6mmK7I/KPv+VJsP96pqKizI5CLcf7hp2D6Gn0UXsacgzB9DRg+hp9SU0iFAh2H1FO8kepp+G/vfpSeX70c4cvYZiX0NJtl9DU/lt/epKfOh2RGBgUeR71JRUCswoqSigRB9nPvRg+hqfyPeitCuUZg+howfQ1NsHqaNg9TS9oacqIdjelP8j3qSis07iUER+SfejyT71JRWnMh8pHTvKf0qbyPeilzoEkQ+U/pTvI96kowfSmOwzB9DT6KKErA1cKKKKYuVC4PoaMH0NPwfSjB9KXMh6jMH0NL5T+lTUVBNyHyn9KPKf0qaigLkdFT7B6mjYPU0G2oyin7B6mjYPU0BqMoqXax7UbWHaj2iFzEexvSjY3pT6KA5hmxvSjY3pU/kj1/Wij2g7kHlv8A3TS+W/8AdNTUVn7RBZEfkN/dNHkN/dNWKKXtEPlK/kN/dNHkN/dNWKKPaofKQ+W/900eW/8AdNWfKbsP1pNv+x+tR7SJXsSv5b/3TT8H0NTeS3p+tO2N6Ue1QnRZB5b/AN00eW/901Y8s/3z+VJ5Z/v/AKUe0NPZIg8t/wC6aPLf+6an8tv71Hlt/eq9Q9kiPB9DRg+hqfyD/k0eSfb86j2kTX2bIMH0NP2n+7+lWPI96PI96nnEqdiDB9DRg+hqfyD/AHhR5B/vCteZD5GQ+W/900eW/wDdNTeR70/YPU1lzMXsit5b/wB00vkS/wB2rOR6iilzMv2fcq+W/wDdNKYJMdKs0uzPG4fnT5mHsyvsb0o+zn3qej91WF0OxB9nPvR9nPvV3y/eo/L96r2jFoVvs596Ps596t1HU8yHYg+zn3o+zn3qepKOZBYqfZz70fZz71Z2D+9RsH96q9oxaFb7Ofej7OferOwf3qk2D+9R7RhoVfs7+v6UzyG96t0VHtTS5U+zn3o+zn3qeij2iHzIg+zn3o+zn3qfyPejyPej2ocxBsb0o2N6VP5HvR5HvS50Z8iICGJzijDehqfyPeiqWpqrkPlv/dNAjcHJWpqPI96XtRcxB9mb/Jo+zN/k1ZCqR1o2L60rsxKnkS/3absb0q9sHqaNg9TT5gKflH3/ACo8o+/5VPtT+9+tGxfWn7Rm6bIdn+z+lGz/AGf0qxSbB6mmGpBtP939KCpxwv6VPsHqaNg9TQGpV2N6UbG9KnMOTnNHke9K6MeVkGD6GjY3pUuw+oo2H1FMLMiwfQ0YPoal2H1FGw+ooMiv5T+lHlv/AHTVjYfUU2gBmD6Gj7Ofen0UAQ+U/pR5T+lTU7YfUUAQ+Q3900eQ3901YyPUUZHqK15gK/kN/dNO8t/7pqbI9RRTTuB5J5De9P8AJPvTth9RTq7jyOREPlP6UeU/pU3ke9Hke9ZiuR+Xn+E0eWP7tS+W396lw/rV87C7GbB6mjYPU1JsX0qTavpUe0QEHkj1NHkj1NS4HqKMZ7ij2g+VjPKf0o8p/SpqKBXI/JP91vyp3lP6VNRWY7kH2c+9H2c+9TbB6mlrUQ3yT/dH5UeSf7o/KpqKnQ0IfJP90flR5J/uj8qmoo0AreV7GjyvY1LRVXM7jNp/yKNp/wAipti+lGxfSj2oXIcN6Gn/AGeT2qxRVJWC9iv5Df3TR5Df3TVil8tv71JVUXqReR70eR71JUlK4kyv5HvT9g9TUvke9Hke9HtCSDY3pRsb0qzsPqKNh9RVe0L1IcD0FGB6Cpth9RRsPqKXMSReV7CjB9DU/ke9Hke9HMxFTY/90/lRsf8Aun8qt0VnzFcpH5HvR5HvVjyPepKu7EkUvs7e1HkN7Vc3CmUe0Y7MjwPQUnlexqWpKQkrlXyT/dH5Unkn+7+lW6Kd2bkHkn+7+lO8r2NS0UjHlIvK9jSeSf7o/KpqKA5SPA9BS4PoafRWhq0R7P8AZ/SlwfQ0+iswSsGB6CjA9KdsPqKdWZLsR0uD6Gn1JQCdiDB9DRg+hp2c9jUtU6tjRK5Bg+hpfJP90flU1FL2qHyjfLT0/Slynt+VS0Vl7TyNivS4b0NP8j3orQBmD6GjB9DU9FArsgwfQ1Jg+hp9FArsZg+howfQ1P5HvR5HvS5kSMwfQ0YPoafTth9RSTAg8r2NLUlFUaDMH0NGD6Gn0UE8ouD6GjB9DU9FZ+0CxBg+howfQ0+itA5RmD6GjB9DU/ke9FK6DlI9n+z+lGz/AGf0qSincaG+W/8Ado8t/wC7U1Ow/rR7RE+zK/ln3/Kjyz7/APfNT7mHejc3rU+1YeyI8H0NP2/9NP0p2w+oqTYfUU7oXIRYPoaMH0NS7D6im+R70XQ+RDMH0NGD6Gp6KXtUachX2n+7+lLtf+6fyqeiknYRHz/dP5Uc/wB0/lUwTjrQUwM5qfaodkQeV7GnYPoal2H1FO8j3o9qi/ZkGD6GjB9DU/ke9Hke9HtUL2aIfLf+6aPJf0FT7G9KfS9qaezIMH0NGD6Gp/I96Kz9oL2ZB9nPvT/JP91vyqSpPJNHtR+zIc/9M6Tyj/zzqfyPejyPej2hpyEH2c+9O8r2NTbT6UYPoajnYe8QeW/900/7OferOw+oo2H1FHOyvZFfyT/dH5UeSf7o/KrHl+9Oo52WoFXyT/dH5U/B9DU4IxRketRzgo2I8D0FGB6CneW1O8g0AR7P9n9KkwPQVJ5HvRg+lAmrlfZ/s/pRs/2f0qxRVcxqR4HoKTyh6GpaKV2BF5XsaXA9BUlO2H1FICLyvYU3yvQGp9h9RQEIOaAIvs596MH0NT0VVkRZkGD6GjB9DUmD6Gn0WQWIMH0NGD6Gpdh9RSbD6ipLItp/u/pRtP8Ad/SpMH0owfSj2gCeV7GjyvY0uD6U7efQVmTYi8r2FHlewqTYfUUu8+grRFDfI96KdsPqKNh9RQA3yPemeV7Cpd59BRsPqKYEWD6GjB9DUuw+oo2H1FICLB9DRg+hp9FZk8ozyvYUYPoal2H1FGw+orQoiwfQ0YPoafTth9RQBFg+howfQ1LsPqKAhBzQA0dOaKkqPyPegx5RPKHoaQwgjGDTqkoHZFQ2+Tnn8qXy/erVR0GvMReV7GlwPQVJR5HvQBHgegpDF7GpcH0owfSgCEBccg0uF9DUtFZ85nyMj8j3o8j3p2w+op1aCsR+R70zyR/dX8qnooCxV8k/3R+VHkn+6Pyq1Tdh9RQZ8pB5R9/yo8o+/wCVTl8HGKAnP/16DX2USDYn90flSfZx/tVY2p/e/Wm+R70XJ5UR7P8AZ/SjZ/s/pUnke9O8tqLlHkmweppakwPQUeR716B5FiOirH2ce1H2ce1L2qFZFeirH2ce1GB6Cj2qM+Qr1JTjCo7U7A9BTAjoqSigAwPQUYHoKcgGOg607A9BQaaEeB6CipMD0FGB6CgNAopfKB5P8qPKA5H8qz9ojHlEqSm+UvcUeUnpWhQ6im+UnpTqACn7B6mmUUAFFSUUAJsHqaNg9TS0/wCT2oAZRTvL96CnHWndhyjakqTA9BRgegppk3sR0VJgegp+xP7o/KldFchBT9g9TTtp9KMH0NDdwG7B6mjYPU1LgegowPQUgI8D0puwdjU2z/Z/SjZ/s/pQaaEIQEZp1SYHoKMD0FBmM8s+1P8AI96kwPQUYHoKDQjo8j3qTA9BUmB6CsuawFfyPeirGB6CjA9BR7QCrsPqKNh9RU2z/Z/SjZ/s/pVcxoQ7D6inVJs/2f0o2f7P6UcwWE2D1NGwepqXA9BUmB6CqbsQlcrbB6ml8gVYwPQUYHoKXMPlKdS+Sv8AeP51Pgegp+xP7o/Ks+ZlWsVfIT1NPqfYn90flRsT+6Pyo5u4EFFT7U/uj8qNqf3R+VHMBBRVjA9BRgego5gK/kn3pdjelT4HoKMD0FNTsHtBNg9TRsHqal+zj2o+zj2pcz7gV6Kn2J/dH5UuB6CqUmzVqxFsHqaNg9TVjEfotGI/RanmkZEFFSYHoKkwPQVRoQ4T1NGE9TU2B6CjA9BS9qKyI/I96KkwPQU7yT/dH5UyeREW1vSl8iQ96nwfQ0YPoaOZmvKiLyPeipcH0NGD6GkIip+wepp2D6Gn4HoKNw2Itg9TRsHqalwPQUYHoKi4XI/I96PI96kwPQVJgegp3YaFbGO5p/7w1N9nHtRgegq0w5COipcH0NGD6GgLEVO2H1FS7E/uj8qXA9BUXZrqyvRVnyR/dX8qPJH91fyp8yFysr4X+9+lPqbyk9KPKT0rL2jL9myGirFFHtH3H7Mr+R71J5HvUlFHO+4ezGfZm/yaPszf5NT0VkHs2R+Uff8AOjyj7/nUlFAcjE2D1NG5fWpfI96PI96DT2bI6KmMSA4xS7E/uj8qrnkTZkFHke9W9qf3R+VG1P7o/KsvaGtrFfYPU0bB6mrG1P7o/Kk8pfSjQVkQ0VPtT+6Pyo2p/dH5UJ2GMooqTA9BTd0aEdFT7E/uj8qNif3R+VK49CCip9if3R+VGxP7o/KncNCCjJ9an2J/dH5Uuz/Z/ShME7FfJ9akyfWpNn+z+lGz/Z/SqBu5Hk+tGT61Js/2f0o2f7P6UCI6Kk2f7P6UbP8AZ/SgCOpPI96kwPQUYHoKnmAi2D1NAUDual2f7P6VP5af3RR7SwFTyPejyPerGB6CjA9BUmhF5a/3qZ5HvVjA9BUmwf8APMf980nUsFit5a/3qPLX+9VnYP8AnmP++aNg/wCeY/75pe1ArbB6mjYPU1a82P8Aun8qPNj/ALp/KndgU/JX+8fzo8lf7x/OrXmJ/cH5UeYn9wflU3ZdiDyPemeSv94/nVrev/PsPyo8xP7g/Ki7CxV8lf7x/Ol+zD3/ADqz5if3B+VPDIDnb+lF2GxU+yj0P50n2SarhZSc4/Sjcvp+lT7SqLUqC1lAxxR5Ev8AcNXPM/zin7x/dH5Ue0qmfIzNwfWjB9TWl5kf9z9KXC+hp+1YcpmYPqaMH1NaXlw/3Vo8uH+6tHtTT2aM3B9TRg+prS8iH/nmv5UeRD/zzX8qPai9mZuD6mjB9TWl9kg9P0p/2S2/uj8qPahyIyqZke/51sf2fD/z7il+wW/90Uvak+yZjb29afg+prV/smH2/Kj+y4P+ev6U/al+yMrB9TTN7etav9lJ/wA9jTP7Kh/57NR7UjkKFFXv7Ff/AJ6/+O0f2K/9w/lR7Ufsijg+powfU1e/sy4/54D8qZ/Z9x/zyX8qPai5CpRVz7Fcf88E/Ko/sj/8+60e1J5Spx6H86OPQ/nU/wBnHtR9nHtWguR9iDj0P50ceh/Op8D0FH2ce1LQOQi2D1NGwepqQBccgUHaBnAqbszsQ8eh/Ok49P1qTZ/s/pRs/wBn9Ks05COnbD6inbP9n9KNn+z+lAEdL5Z9qfs/2f0o2f7P6UAQ+WtHlrUsg8scr+lJuT+7+lAHktSUmxfSjYvpXTzo8z2TFop3kp7/AJ0eSnvUe0J9mx1FN8lPejyU96PaC9kOwPSjA9KTYvpRtX0o9oP2LFoop+xfStOexCpsZRT9i+lGxfSo9oh8gylLkjFO2L6UbF9Kv2gWYnme1Hme1P8AKjP/AOugxR4/+vUc7M+RBn/aNL5fvR5Uf939aXYvpVXZXsmxlFP2L6UbF9Kr2pXsRlSU/YvpRsX0pe1L9ncZS/Zm/wAmnbF9Kk2L6Ue1F7Igp21/7361LsX0o2L6Ue0KsyLY3rQEbPWrOxfSjYvpR7QnUZRT9i+lSbB6mlzozVK5BTvL96l2L6U7K/3f1rT2twdKxFRT9q+lGxfSs+dC9kJ5fvR5fvT8r/d/WjK/3f1rT2rD2Qzy/ejy/epdi+lGxfSoVQPZEXl+9PiG04zTti+lGxfSru2HshlSU/YP7tGwf3aQ/ZIZT9g9TTv+A0Dn+GgtsYUyc5pvke9TeSn+TT8r/d/Wn7Rk+zRWoqbyU9DTvI96QvZIjpNg9TUvke9JsX0oN7oj2D1NGwepqfyo/wC7+tSeSnvQR7NFXyD2YUeSf7361PsX0o2L6U07EezRHsHqaNg9TUmxfSpNi+lICt5b/wB007yPep9i+lGxfSndl8qIPI96kp+xfSjYvpSuR7NDKKm8qP8Au/rR5Uf939aehpyENFSYPpRg+lIz9nEi2D1NLT9g/u1JsX0qrpGqVyL95T/KY/xU+n7F9KVyvZkHke9Hke9T7F9KNi+lF2aWRBR5HvUlFIYUeR70VJ5HvQBH5HvUmyX1FHke9SUCZH5HvTth9RTqPI96Lgl3I6Km8lPejyU96jnQrEew+oo2H1FS7B6mjyvY1V0PUZRU+xfSjYvpUC5SDyPepPI96d5Kf5NPyv8Ad/Wp9oURUVLkf3P1qTyR7U1UuBWp29fSpdi+lGxfSl7SxSViHYafgegp+xfSjYvpWV2UMwPSjA9Kn2D1NH2Zf8mqbaGrMgqSn/Zl/wAmjYPU0J3BjKKfsHqak2D1NDdgSuMpNg9TUmwepo2L6UnIaj3GUU/YvpRsX0o5g5RN4/u06l8lak8laftLF6oioqbyU96XYvpWadxpJjKKfsX0o2L6Ux8qIth9RTqm8lPejyU96C7or7D6ineR71N5Ke9Hkp70BchoqbyU96d5Y/umgEkV6Kn2D+7RsH92gfKhlFSeWP7ppPsy/wCTQHKMoqfYvpR9mX/JoNRlFT7F9KNq+lP2jFyogoqSis/asj2fmQ7D/eqTy/epdi+lSfZl/wAmi7DkSK3l+9TU/wCzL/k0nkp70XuHInsQ04WrA5yKs7F9KNi+lHMwIKKn2D1NGweppE8pW8z2o8z2qx5Ke9SeSnvUaGvs4shoqbyU96PJT3pC9kQ0zz09DVnyU96PJT3pp2H7NFbz09DUuw+oqTyU96PJT3ouHs0R7D6ijan979ak8lPejyU96LsXshnye1Hye1Gwf3ak2L6UXKI/k9qWk2L6UbF9KQB+6/54/pRvHoaNi+lGxfSndgLSfJ7VJsX0o2L6UtgI/k9qWn7F9KNi+lADfLi/uj9KPLi/uj9KfRR7Qq6I/I96jqfYvpRsX0p3JIKPP9qn2L6UbF9KLgQef7U/7SPU/lUmxfSjYvpRdBoM86f+6Pzp/wBqnP8AEKNi+lL5HvWVyUJ5/wDtijz/AEcflR9lH94/nR9lH94/nT5aRp7o/wC1v/zw/Wnx3cRGR+hqr9mX/JpaOQOdFvz4fejz4feqvz+9PxJ6CjkD2hb+X+9+tHy+v61Ty/oKbvb1o5Bc5obYv8ij7PH71S+0r6j8qT7QnqPyrPkL9oi3/Ztv6D86Z/ZEXp+tRx3bjgU77e1HJVHaixP7Ci/uj86j/sKL+/ViPUFNP+3r6VF6o/3JnyeHiefOpkuhzRjPnVrfbofenebD60e1rD9nTMT+x7umf2bdf88K6H916H86PLi/ufrR9YrB7Cmzm/7OvP8AnjLUflT/APPEV1n2SKmfY4f736UfWGHsDkJBMTzUX77zK66TS7aX70JqD+wrD/ngtafWCPYHhe0f5NG0VP5fvSeQP7xr0PaHi8kSDZ/nNSbP85qTy/ejy/ep5yiGirHke9Hke9T7UV0V6Km8v3p3kH+8Kdxkfke9FTeX70eX71ftCfZxIaKm8v3o8v3o9oO5DUmB6CneX70eX70e0F7OI3A9BT9i+lO8pv8Anp+lHlN/z0/Sj2guSI3YPU0uB6Cl8laPJX1o9oaez8hfIj9aPIj9ak8v3o8v3qboj2Qu5P8AIpfs4pPJajyWpXF7JDKX7OP7wqTyVo8lfWq9qX7IdsX0o8gf3aMN/e/SjDf3v0qLMj2IeQP7tO8ke1Nw3979Kk2v/e/SnqHs7C+R70UmG/vfpUmG/vfpRcXIhnke9GB6CpKXB9DRzspRZFRgelSYPpRg+lac7DlI8D0FFTeX70eX70w5SLcw70bmPep6KOdi9kR5PrRk+tO8v3qTy/egOUhyfWpKd5fvR5fvQUlYbRU+xfSjYvpRcj2SIKkp+xfSjYvpRcfs/IZRT8N/e/SlqfaB7NIjoqTB9TRg+pp87DkQ3zPajzPan7D6ikpe0Hyjtn+c0bP85o2D+9RsH96q9pEfKh2B6UYHpS7G9KNjelH1gLxEwPQUYHoKd5fvTvIP94UfWGxeziR07y/enYPpRg+lP2iKG+WPSjyx6VN5HvR5HvRzj9mQ+X70eX71J5T+lHlP6Uc4iPy/eneR71Jg+lGD6VPOx2RHgegowPQVJg+lG0/88KOdhZDdw/uCnU7y/ejy/eqVSxY3A9BRgegowfSpMH0pe0kT8yOipvL96PL96r2hQ2ijY/8Aeo+zN6io9oHs2GB6Ck3j0NP+y/7VSeX70vagQ1Jgegp3l+9Hl+9Z8wDcD0FGB6Cn+S1HktVXAZgelGB6U/yWo8lqLoBaKd5fvR5fvWYDaKd5fvR5fvWhXKNoq15fvR5fvU8wcpDTcp6fpVjYP71Gwf3qTdy/ZMhoqXym/wCen6U/y5PWn7Uv2cSLYPU0bB6mpfLl/vD8qf5Df3jR7UPZxIKd5ntUnl+9L5Df3jR7UORdRlFTeX707yPej2jZfIyLYvpRtX0qbY3pRsb0qOdj5CEhXHIpafsX0qT7KPUUrtlezTIKXyvYVN9lHqKTy/ejUPZ2E8r2FJUv2Zv8mj7M3+TU6h7NDPLWlyf+elTeStHkrQVyEWB6Cnfu6d5cY70/7LnuKPaj9mQUVN9l/wBqj7J/tUXQiLY3pRsb0qfy5PWk+zt/fouacgzA9KMD0qby/ejy/egCv+8o/eVN5cnrR5cnrQHIR4HpRgelT+S1HktRdAQUVP5LUn2X/arO4DaKf5LUeS1aXQDKkqSipd2Jq5HRUlFKzFykdFP+yj+8fzo+yj+8fzp2DlIKKs7G9KNjelUa+92K1FWdjelGxvSs7oPe7CUUuxvSjY3pRdE8shKKXY3pRsb0oug5ZCUVLsb0qPY3pSuPlYlFLsb0o2N6U7oXLISipdjelGxvSlcjlkRU/Ke35U77M3+TRsb0pKoPlaIqKl2N6UbG9KLhZ9iKipdjelGxvSo9qOw3Ke35UZT2/KpfLk9aZ9mb/Jq/aj5RuU9vyoynt+VO2N6UfZm/yaPaisxuU9vypCUxx/Kn/Zm/yaf5cnrR7UfKV6Kn8lqbsb0rPmBxsRUvkn1FS+X70eX70cwvZkXkj2o8kegqTY3pRsb0p+1D2SIqKl2N6UbG9KPahYiowPQU/a3979KNr/3v0rX2iM7MZRgegp3l+9Hl+9TzCUWhuB6CjA9BTvL96PL96OYdhmU9vyoynt+VO2N6UbG9KftSLMj3j/nnS7z6Cn7G9KNjelFxWZFSbx6GptjelM8v3oTuOzF3j0NP+2vH1lqPy/ejy/emNcyJotWcj/W0+LVZDxj8KreX/wBMqPLPrS5KPc25y9/bS/8API0+PVYs4ORWbsb0p2X9BWfsYC9pVPHvL96k8v3qXYPU0bB6muq9jztehF5fvR5fvUuwepo2D1NZFWIvL96PL96l2D1NGweprW7J1GUVL5I9qPJHtSGRUVL5I9qf5HvRcXs0R0VJR5HvSuL2aI6f5S/89P0qb7Ofej7Ofei41BIj8gf3jRhf736U/wAj3o8j3o9oCgR+R70eR707Z/nNAjycY/WjUv2Y7yPejyPepKkoVS5nyMi+zD0P50nlR/3f1qain7RhyMZ5EX92jyIv7tSYPoaSn7RhyMTYPU0nlRf3B+VPwfQ0YPoaXOVZEfkR+lOCJ6U/L+/5UZf3/Kj2gajfKi9vyo8qL2/KpcH0NGD6Gj2guTyGbD6ijYfUVJ5L+pp/2c+9HOMg8taPLWp/s596Ps596Ocgi8g/3qPIP96pcH0NGD6GtOcd2ReR70eR71Y+zmjB9KLoLsr+Qf71OFsQfv1Ng+lGD6UucLsj8qH0o8qH0qfyvY0eV7GjmEV/LT+6Kf5Q9vyqXYvpRsX0o52HKyv5EX940CCLP3qseV7GjyvY0c4XZH5af3RR5af3RUnlexp3kH+7SuBD5af3RRsHqamwfQ0YPoaLgR+Wfajyz7VYwfQ0YPoaOYCtS+WfarH2c+9H2c+9FwIvI96Kl+zn3owfQ0cwDd6+tG9fWpfI96PI96V2a+zI8D0pDjFP8hf7ppfLH92q9sybITy/f9KPL96Xa/r+lOwfQ1lzD9ncTA9BRgegpcH0NGD6GjmJ5SLyT/e/WpPI96lwfQ0YPoa2KIqPI96lwfQ0YPoaAI8L/e/SjyB/eNT0VN0P2TI/I96KXB9DR9nPvWfMHshIcDoc1JS/Zz70fZz70e1D2TEwPSjA9Kf5R/umneR7VrzIPZMg8v3qTy/eneR70eR71HtWa+zG+X70eX71L5XsaPK9jR7Ri5EReX70fZf9qrHkD+6fzo8gf3T+dHtGHIiP7L/tUkUW4Y3fpVnyB/dP50eQP7p/Oj2jDkRD5H+3+lLEm07s1L5A/un86PIH939aPaMORDaKf5R/umkKHH+r/Ws/al8g3A9KTYPU1Z8sf3TS4Poad7l+zsQeX70eX71Pg+howfQ07jI4osnrT/I96XB9DS4k9GouAgjIGM0uw+op3ke9Hke9In2RHRVjyPejyPenzF+yiQ+X70/yB/eNTJFxjFGxfSldjaIvL96PL96nwfQ0YPoadySDy/eneR71Lg+ho8n2q7sCLyPepKkopFpWI6PI96kpfs596m4xPI96Kl+zn3o+zn3pXY7EVSUnlexo8r2NZtphysWin+Q/qKPIf1FTcOVjKKXY392jY/8Adp+0QWXcip/lr/eqTyH9RTdjelP2o7dytUlS4PoaMH0NPmNLEX72pKlwfQ0YPoaXMwsRVHVnB9DRg+hp8wWK1SVLg+ho+zn3o5gSIqkpfs596MH0NK9wt2E8j3oqXB9DRg+hrIq1iKipcH0NGD6GtBa9yKipcH0NGD6GgNe5FRU2X9/yoy/v+VAa9xvke9Hke9S/Zz70YPoazGReR71J5HvS4PoaMH0NAEP2Uf3j+dH2Uf3j+dWaKd2ZlfyPen+S1S0VPtTQj8j3o8j3qSimZkPl+9Hl+9S7B/do2D0oMxlFS4PoaMH0NRdmhFRUmP8Aph+tLiP0NF2BF5HvR5HvUvkxf3T+VH2c+9F2XdEVFS/Zz70nlTelF2K0SOipPKm9KX7Ofei7C0SKipfs596j+zn3ouwtESjyPel+zn3owfQ0XY9BKPI96XB9DRg+houw0E8j3o8j3pcH0NGD6Gi7ATEnoKjx/wBMP1qXB9DT8H0p8zCyK9FSYPpS4Poan2iGQ7V9KNi+lS+QfQ0eQfQ1PtSfZrsRbF9KNi+lS+QfQ0eSfQ0e1D2a7EPl+9Hl+9TYPpRg+lX7VEeyRBsb0o2N6VYwfQ1Hg+hpe0QezRFRU3ltUfkL/dNX7Qfs4jaKlwfQ0vltT9oHs4kNR1ZwfQ0fZz70e1sZaM8j8r2FHlewq59kH90fnR9kH90fnVe1MeVFPB9DRg+hq39mX0H50z7GP7p/76p+1DlK+D6GjB9DVz7IP7o/Oo/sY/un/vqkqocpFRVn7IP7o/Ok8mD3o9sHIV6KseTB70eTB70e2DkIef7gpef7gqXyofSpPI96n2qM/ZkXP9wUc/3BUvke9Hke9HtUHsyDY3pUmD6GpPLb+9T/ACPeq9qxWZX8j3o8qb0qx5Z/55frR5HvR7VhZkfkn3p/kt6frR5a/wB6pPLH98flR7Vj5ER+S3p+tHkt6frUnlj++Pyo8sf3x+VHtQ5ER+S3p+tHkt6frTsL/e/SpPIH940e1DkRF5I9TTvKX3/On729aNzetX7Yfs0M8g/3f1pfIP8AdH507C/3v0owv979Kz9oLkRF5HvR5HvViiteYQYHoKMD0FLg+350YPt+dYgM8v3o8v3p1SeSfendlezI6PJPvUnke9O8v0YU/asXIiDyz6H8qf5bf3R+VTCEHvR5I/vfrVe1CyIfKb0o8pvSpfLHvR5Y96fMx2QzyPejyPepvLajy2pcwrEXlMP4qXL+/wCVS7V9KXyR/e/Wj2oWIMv6fpR83p+lTbU/yaf5Ke9HtRENFSYPpR5HvS5gsR5P+RS5Pt+VTbU/yaTyU96ftQsQ0VYoo9qx8iIsH/nnSfvKm8r/AGf1p2z/ADmj2rI9mV/3lHzng1Y2f5zRs/zml7Vj9mR/Zied9H2U/wB+pvI96TyWqeZ9y/Z2IcH0NHlewqfyT70eSfenzMv2b7EXlexp/H981JsPqKNh9RRcdmR7D6im4PpU2w+opDGSMZouFmReR71Jk+tSeR71J5HvTv2MSvk+tGT61Y8j3o8j3ouwK+P+mH60VY8j3o8j3ouzayK/72pKk8j3qSs2xWI8D0FJ5Q9DUvke9SUuY2sVvK9jT/Kb0qbyT70U+ZhYgwfQ0YPoal2H1FOo1MyDB9DUmD6GpNjelGxvSnqaJWIvI96k8j3pdjelPoHYj8j3owPQVJRQAYHoKMD0FJsHqafsPqKYDaKdsPqKNh9RTWg7MbRUnkn3op8whuw+oo2H1FP2N6Uuw+oouFiLB9DT6XY3pT6dwI6KkqxSbsBB9nPvT9p/u/pUlFLmFYMD0FN+zj/ap2R60+KHaMKKSdhkRUZ6/pR5Pt+lWdqntRsHqaPa2F7NEQCgY2/pT8H0NPoo9rY0SsMwfQ0YPoal2H1FHlv/AHTR7YPZkWD6Gn1J5HvRR7YZHgegowPQVJRWfOAYHoKMD0FFFHOAzY3pR9mb/Jp9P3r60/al8tiHa/8Ak0bX/wAmpt6+tGwepo9oLlIdr/5NG1vSpt6+tMo9oHKM+zN/k0bG9Kd5a/3qPLX+9R7ULC0UVJUhykdHke9SVHRew1EPI96PI96Kkp3YWI6KkopC5SPzR/dH5U/ePQ0tFT7QdhPl/u/pR8v939KWilzoVhPl/u/pR8v939KWneX70c6CwzyvY07B9DTvJak8v3pqohpJCYPoaMH0NPyPUU3dH6iqATB9DSYPpUu1vSjY3pU+1Qa9iL97UlLsb0o8s+1Z+0BISineW3qPzpuD/k1rdCCpKKKy9oVYjqTA9KXzG/u0lHtASCiiij2gWI8D0FGB6CpKKoRHgego+zj2qSii9hkfke9H72pKPI96n2oWI98voKfvHoaWiruIbvi9RTsD0FH7qk8tf71ILWDyR/dP5UuJPQUnl/8ATY/lS5k9RQCI8D0FSYHoKMyeooyP+eI/OgA/dUeR70UeR70EWDyPeo/I96k8j3o8j3ovYLEdFSUUAR+SfWjA9Kk8j3pnkj2oL9oR5Pt+VGT7flU/ke9R4PpRdD9oxmT7flSZP+RUvkj2puxfSi4e0QzA9BRgdhRg+lKAcjiq5gDB9DRg+hp9GJPQVzXYDMH0NGD6Gn0UXYDMH0NGD6Gn0UXYHm/2L3P50fYvc/nV+K+s5emKljEMlcXtaxr7OkZn9mD1P51GdLTsxra8uL1/Sn/Z4v7x/Kj66afV0zB/sz/apn9mL/e/Wuh+xQ+lH2KH0o+vGX1NHPf2Yv8Ae/Wj7FN610H2CL1pv9mxUfXe4fUjB+xS/wB6j7FL/ereOmxA4pv9mj/JroWLI+pGJ5EnvR5Elbf9mj/Jo/s0f5NP62L6kzD+yv6Gj7MP7/6Vt/2e/rTf7Nf1NX9YpkfVmZPke9Hke9a39nP/AHjUf9myf3jT+s0hfVqpnfZ1/v0nkP8A5Faf9mSf3x+VM+wze1X9Y8yPq1Uz/I96l+zN/k1b/sz/AGqPsdx6j8qPbB9WZT8pP+eZp+wepqx9lm/vCj7LP/eFX7UPYFfYPU0fZR/eP51Z2XH/ADzH50vlt/eo9qjP2XmVfso/vH86f9l/2qn8tv71Hlt/eo9qgVPzIfso/vH86j+yj+8fzq3s/wA5o2f5zS9qUlYqfZR/eP50fZR/eP51b2f5zRs/zmj2oWRU+zD/AJ4mj7KP7x/OrPke9Hke9aXRlZkP2X/ao+y/7VWdg9TRsHqaVx2Ifsr+opfsv+1U1FF2FrDPIH940eQP7xp9FF2FkM8gf3jSeQP71SeSKk8j3ouy/ZEPl+9Hl+9TUUXZHs0RbB6mjYPU1L5HvR5HvRdj5URbB6mj7KP7x/OrGwepo2D1NPUVkQ+QnqaPIT1NS7f9j9aXYPU07hZEPkJ6mjyE9TU2wepo2D1NF0FkQ+QnqaPIT1NPwfSjB9K0GHke9Hke9P2D1NP8v3rO6F7NdiHyPepPI96KfsHqavRleyRF5fvR5fvUuwepo2D1NPmQ7DKKfsHqaNg9TSvEvQi2D1p/Hofzp/ke9P2D1NHuk+yRF9l/2qPsv+1UmX9/yo2ze/5VF0L2RFx6H86k8hPU0/yPejyPer9pEfskHke9M+zH0/WpfL96PL96z50HsiLY3pT/ACPenbB/ep3kD+9R7RFWuR0VIeDipK1VmFmV6Kk8j3opaBysj8j3qTyPepti+tGxfWs7oVrDNg9TR9lH94/nUtJsHqad0wI/so/vH86Pso/vH86lopXiBF5LUvke9TBMjOad5B/vCn7VC5kVtg9TRsHqan+yn+8PzqTy/en7SJpdFbyE9TUv2X3/AFqan7B6mgy5iv8AZR/eP50fZR/eP51LRTuy7si2D1NH2Uf3j+dTHAOMH86fWXtUtguyDyB/eNAgAOd1T+R70eR70e2C7E+yj+8fzpPsq/3v1qbyPejyPel7VC9iyLYPU0bB6mpvJX0/WjyV9P1rT2qNfZsh2D1NO+zedxt/Wp/I96PKm9Kz9qh+xGiK3h4o8tam8j3o8j3pe1NbIg8rH8Z/KpPIH941NsX0o2L6U/ak+y8iLy1p3kL/AHqfsHqaNg9TR7UaTRHsX1NGwepqWn7B6msvaA20QeR70/7KP7x/OpNg9TRsHqaftOwkQ+QP7xo8gf3jUmD6Gn1XMxIh+y/7VJ5A/vGn+R71JRzMe4zyB/eNHkD+8am2D1NGwepqfatl2uQ+QP7xo8gf3jU2wepo2D1NHtmBD5A/vGjyB/eNTbB6mjYPU0/ayHZkPkD+8aPIH941NsHqaNg9TQIh8gf3jTtg9TU4TIzmjy/es+cCDYPU0bB6mp/L96PL96OcCDYPU0fZR/eP51P5fvR5fvRzgQbB6mj7KP7x/OpNg9TT/L96OcCDYPU1JsHqaXyPeii9yWuxB5A/vGgWQBzvNT0U/aPuFiL7KP7x/OpPso/vH86WikKzE2D1NH2Uf3j+dLUlJuwcrIvso/vH86Ng9TS0U9Q5WJsHqaNg9TS0UBysXyB/eNHkD+8afRUXY/eGeQP7xo8gf3jT6KOZlDPIH940eQP7xp9FX7SQrIZ5A/vGjyH9TT6Ki7GN+y/7VH2X/ap1FF2AzyB/eNHkD+8afT949DRdgQ+Q/qaPIH941PUdF2AzyB/eNHkD+8ano8j3o9ow5CDyB/eNHkD+8afg+powfU0e0ZmM8gf3jR5A/vGn0Ue0YaDPIH940eQP7xp9L8/vR7RhoR+QP7xpvlp6mrGwepo2D1NX7RjsReX70CCF+d1S7B6mjYPU01VYWI/so/vH86Ps8vvS+R70mxfSp5kZ+zuHlv6mm+Uf7x/On4k9BTtr/wB79aVzWyIvIH940eQP7xp9JvHoaE2wsxvkD+8aPIH940/91T9g9TVe0kKzK+wepo2D1NS+R70eR70uZGdmRfZh/eP50fZh/eP51JsHqaNg9TRzIRX+zD+8fzpvkj+8atbB6mjYPU1vzI2SK+wepo2D1NWaKLmditsHqaNg9TVmo/I96wTNLI8iiuW/hJqSK6cHiU0zyPepBDg5zWd0YluLUp4v4z+VWYtaHWVT+VZ59hS7W9KicKJaqVjYj1S2k6D9Kminjk/5a1heZ7U/dJ/cNc/1WmdHtzoPNP8AdP5UYPoaw455COJKmj1C6i+7Kan6ojT25t/VKP8AgFZMeuXYP3qfFrky8eWKPYVDT29I0/Kf1p+D6GsyLXO3kipotcjH1rNUK3cft6Rb8of3KPKH9yq8WuRY6fnUn9rx0clUv2lIk+fshpfn/uGmxalD3FPiubSYf62s+SsVdDfK9jR5McvVf0qwjw9Mc0/GP4P1qE6pdkVfscX900z7An9w1c2N6UbW9K09qL2aKf8AZr/3v0pn9nv7flWh8/aj94aftapHskZ32Env+lN/s9vT9K1trHtS4X3/ADq/rIvZUjH/ALOamf2ef+eB/Ktry2/vUeW396j6yzP6vSMb7C/pR9hP9+tr7Mf7n60fZv8AY/WtfrLD6sjCkspeTt/Sj7FIP4f0rd+zf7P61H9nH9z9ar64R9TML7DL/c/Sj7JL6fpW99lX/Jo+yr/k0/rqMvqKML7LJ/zzNN8k/wB2t/7In+TR9kT/ACav66H1JGB5HvR5HvW39jH/ADz/AFo+xj/nn+tH10n6mY/kH+9+lHkn+9+lbP8AZx/55Uf2fBjofzrT62L6uzG8iP1/Sn+S394/lWj/AGUf7v60z+ycdqv6yu5H1esUfKb/ACKPKb/Iq79hm9B+dL9knrT6xSF7KqURCMcqfyp2z/Z/Srn2T2NM8qX3/Kj2vmZ+zZU8of5FHl+9WvJPvR5J96ftEZ8hB5XsKMH0NWvJb0/Wm7G9TV+0Q+Up+VH6Gj7OfermD6GjB9DT5h3ZT+zt70/yT/e/Wp/KX+5S+Sfencdyv5HvR5HvVjyT70eSfelzC5iHyn9Kd5HvViiquhXIMH0NJ5HvViii6C5UwfQ0YPoat0/yX9qCyn5XsaPK9jVzyX9qPJf2p86AgyP8ijI9/wAqueQe2Pzo8g/5NZe0RmUMH0NSfZz71P5HvUnke9aGhUwfQ0YPoat+R70CDJxmgCpg+hqTB9DVn7Kf7w/Oj7Kf7w/Os/aRFdFbB9DRg+hq55Cepo8hPU0e1QXKeD6GjE/of1q55Cepo8hPU0e0QFPB9DT9p/u/pVr7MPf86Psw9/zpcyC6K2D6Gnbj/cNW/sw9/wA6Psw9/wA6vQOTuV/NH900/B9DUvkSetHkSetT7VdheyIsH0NGD6Gp8H0ox/0w/WsvasPYvuQYPoaMH0NT+R71J5HvR7Zh7F9yDB9DSYPpVnK/3f1oyv8Ad/Wn7Y19iV/s596f5Df3TViisvasPYoj+y+1Gz/Z/SrHke9Hke9P2rNPZIr+WP7po8sf3TVzyT70eSfes/bIPZLsVfIH90/nT/IP92p/JPvS7G9KPbDVIg8n/YqTyT/dH5U/Y3pRsb0o9sXoR/Zz70YPoanorQm5Bg+howfQ1PRRdDuQYPoaf5HvUlFF0K4zB9DRg+hp9O2H1FA7kWD6GjB9DUuw+op1AXfYjoqSik3YkjoqSilzAR0VNsPqKNh9RTugIaKm2H1FOouhpFfZ/s/pUmB6CiinzmmpH5HvR5HvUlO2H1FLnHeRDs/2f0qTA9BTth9RRsPqKPaC1G4HoKMD0FSeSfek2L6VndDVxmB6CjA9BT9i+lO2N6UXQytRVrC+/wCdG8+gp3RBDgegowPSrFFaXRXKQYPoaMH0NT0VNl3D2RBg+hpdh9RU1FGncPZEHln2pfK/6afpU1FUaezIPLPtR5Z9qnoosHsyv5J/vfrR5cNSVJWV0T7NlfyT/e/WpPI96koouhezZHRUlHkn3oug9myPyPeipKKLl+zZH5J9aKkEWRkr+tHlf7P60/aIz5SOm5f3/KpvK/2f1o8r/Z/Wj2iBKxBk+35U+pPK/wBn9aPK/wBn9aSqIbVyOip9i+lM8r/Z/Wn7RC5SOo6mx/00pfJf2oIGUU7yn9vzpfJP/PQUXQxmB6CjA9BUnke9HlTelK5jykdFGJPQUU7o1Ciiii6AKKKXY3pRdAJRT949DTPOP939K0uiAwPSjA9KXzT6UmIvSsrk8oYHpUdSYi9KKLoOUXB9DTN59BTqKuyNLIZg+ho+zn3p9L5rD+GmHIxMSego80f3R+VSUUySOo6sVHQBHRUlFAEeD6VJgegooq/aB7IjoqXY3pRsb0qBexPINh9RTqh8v3qasfaNCXkSUU3y/ejy/el7UdmS7F9KNq+lMop8zF7FD/m9B+dP2H1FR+X706hVWhpWCiinb/8AOKXMw5UOop3l+9Hl+9HMxjsD0owPSm+X71J5fvVcwBvPoKTeaOPU/lT8f7X6UcyJsOiuJv8A61SQ30sXInqCIseQaf8AMO5/Kn7OiHtEW4tZnHGf0qaHWCeDiqHkf7dO2nua51Qo9y1UrGpFq0J6Dn0qRb+GWsfy/en+SvrULDs1+sWNiJ4ennj6U+sfbN/f/SpIZJiOtZewNPbmnvX1qTcP7w/Ks+G8l/56fpUn9pf9NBR7Ev2iL3mH+7T/AD/aqMWo57g+9PS8iIway9jYOdFzz09DT6r/AGuD+8f++aT7RbdifyqOTyHzIs0VBx6n8qfj/a/Sj2ZpyklJ9lH94/nSbj6/+O//AF6Nx9f/AB3/AOvV3RIv2Uf3j+dH2Uf3j+dS8+o/Kjn1H5VXOAeR71F9lH94/nUvPqPyp2//ADilzAVvszf5NH2Zv8mrOYvWjMXqKPagV/s7+p/Oj7O/qfzq1lP71FHtUBU+zj+8KZ9nP90fnV7yPejyPer9qBnfZh7fnTPsI/vfzrT+zZ7igWwBzmj2ouSiZH2M/wCTSfYpvb8q2Ps7f36jFqAc7z+Vb/WWYfV6RkfZz/zyo8j3/WtnyB/eNH2Me9P61Ij6sjG8j3pdrelan2GH/nmPy/8Ar037BB/e/SrWID6sjMorR/stf7/6Uf2Wv9/9Kv6yjL6sij5X+1+lHlf7X6Va/sxf+en6Uv2Af3v0qvrRP1Yo+R70eR71e+xyeo/Km/Yj6it/ai9lEp+R71J5J96sfYj6in/ZB/fP5Ue1D2cSn5Len60/95Vn7IP75/Kj7IP75/Ko9qHs4lbyz/eFHln+8Ks/ZB/fP5UfZB/fP5Ue1D2cSt5Z/vCpvs5/vGn/AGQf3z+VP+y/7VHtBeyiQ/Zz/eNH2c/3jU32X/ao+y/7VL2geyiV/sv+1R9l/wBqrH2X/ap/2b3qPbM29miL7Of7xo+zn+8al+yn+8f0pfL96r2ovZRIPso/vH86loIINSU/ak2uR+R70eR71J5HvS7G9KXtGV7JEP2f/OaPs/8AnNTbG9KXy/es/asPZoi8geo/WjyQOQRUvl+9LsP/ADzP50e1H7NDPI96dsPqKf5A/vGjyB/eNP2pQzY3rRsb1qTy/ejy/ej2oENSY/6YfrU2wf3qNg/vUrMCGpKdsH96jYP71FmA2pKKKyE1cjqSiigGrhRTvL96bWvMw5UFFO8v3o8v3o5mHKh1FFFHMzTlQ3y/en4j9DSU7y/eqVawWG0U7y/ejy/esvbMOVDaKd5fvTvI/wBv9KPbMOVEdL8/vT/JT+/R5H+3+lQqo7EdFSeR/t/pR5Kf36ftgCo6seR/t/pR5H+3+lK6Ah2H1FO8j3qTyP8Ab/Sj7Knqa15uwFepPI96k8j/AG/0o8j/AG/0o5gI/I96PI96k8j/AG/0o8j/AG/0o5gI/wB1UlJ9kH98/lUgiMZwDSu+o7MZRTvL96Psv+1TCzG+f7Uef7U77L/tUeX70BZshqTyPepPI/2/0o8j/b/StBEdFSeQP7/6U7y/egCGipvsv+1R9l/2qAIaPI96m8s+v6UeWfX9KrmLtYho/dVN5fvTufUflRzCskV/JPr+tFTeWfX9Kk8s+v6Uva2G0VfI96KteWfX9Kj8s+v6U+YLX3IaKm8v3o8v3rEOVENEHept/wDnFHl+9AJDajq15fvR5fvSuhWIaKm8v3o8v3ougsQ0VN5fvR5fvUBYhoqb7L/tUfZf9qgLIho8j3qb7L/tUfZf9qgLEew+optTfZf9qmmDj736UXsX7JkdFO8v3o8v3oJ5UNwPSjA9Kk+zn+9+lN8v3rJSDlRHvH92nYHpT/KPrT/L9T+lHtCvZFfYfUUbG9ak8v3o8v3p+0Rn7IbSbW/55U/y/ejy/etPbCsQ+R70eR71N5fvR5fvR7UCLyE9TR5CepqXy/ejy/egCLyE9TR5CepqXy/ejy/egCr5HvR5HvVjyP8Ab/SjyP8Ab/So5mBX/e0VN5fvR5fvW47Mhoqb7L/tUz7IP75/Kk2Kwyin/ZB/fP5Uvkf7f6UXCxH5/tUlN8v3o8v3pmY2ineWfX9KPLPr+lADaKf5cn94/lSeWfX9KADYfUUbD6ipvI/2/wBKd9kP98flWhNjxmpKjwfSpK5m7CSuFSUUUcyLsEHeiiilzCshfIT1NO2D1NMzJ6il3t61DaQyXYfUU2in7V9KvmJ5RlSUUU/bD1CiipKaq3DUjp/yd8Uv7qjyPej2jDUTzsetP/eGneR70UuZGfskxN49DS07yX9TSbT6U7oY+N+5FG7/AGKbsPqKf5bf3qLsv2RNsHqaNg9TTPJH979akyPWkmKzCik2L6VJtX0q7okZgelP2D1NMorG9jQn2D1NP3n0FQ1JQGxJ5o/uj8qfFc4PFQU/YvpQBPDcz44P51J9rf8AyKqbF9KWs3EvnZeiugOc/pUn2xf7w/75rNqSjkNOcv8A2q19Gp3mW/r+tZvmL/dqTYvpR7NBzI0959KbWd5i/wB2pIJAOQKy9mxc5e8oetO2+9VPMn/vGnQ3Urcij2Zfti1RUCXELH71TfuvU/lSvYOcf5ntTvP9qh8z2o8z2qNTRTRN5/tRSbx6GjYvpTvcqyFopNi+lLTuFkFFGD6UYPpSCyDyPejyPenbz6CnUm7BZEdHke9SVJVXYWK/ke9NMYxU1HSj2gWRD9mHv+dM+zL2/nVryAeS1P8AI96XtTDlKHlH+9+tHkn/AJ51e2L6UzyPer9qT7MreS1O+zN/k1PR5HvR7U09mV/I96bsPqKt5X+7+tGV/u/rWvtEZ+yRV8tf71Hlr/eqb7M3b+dSbG9KPaILIreR70eR71a2en86Nnr/ADrL2ofIq+R70VZyv939aNq/88q19og9kVvI96Ks+Svp+tHkr6frR7RB7Ir7G9KTyPepfIH940eQP7xrT2oeyI9jelPqTB9KMH0pe1D2RH5HvRUlFHtgsFFSUeR70e2FysjoqTyPeii4crI6Kkoo5kHKxn2Zv8mjY3pT6KY/ZkdFP2r6UtBFhNg9TRsHqaWn7F9KvmRdmMo8j3p+xfSjYvpRzIq1huxvSj7M3+TT6Xe3rUe1FZoNjelGxvSje3rRvb1p+1fcVmGxvSjY3pRvb1o3N60vasLMXCetOpfszH/9dG1h2rL2iCyEooo/1tM05WFFHke9GIvSgOUKkIEYwaKKBcrCiipK0ER4k9BRUlHke9AEdP2D1NLRQAmwepo2D1NLRQAnlr/eo8tf71LRT9qOwUU/YvpRsX0p8yER7B6mjYPU1LR5HvV3YCbB6mjYPU0tFF2BHRUlFTzIAoqSis/bHTykdJ9nHr+tWNi+lBVQDxWnthEJQ54FGxvSgswJ5o3N61XtWc/UdsHqaNg9TUm1fSjYvpU+2Ogj2D1NAUDuaWimPlZHRSlTngUYPoaXMjnadw49D+dHHofzqbYvpRsX0pcxXskQUVPsX0o2L6UcwuVkFFT7F9KNi+lHMLlZBRU+xfSjYvpWWhVhmP8Aph+tFP2L6UbF9Kd0LlYyin7F9KNi+lXdhysNg9TRsHqaWis7s2E2D1NGweppaKLsBnkRf3aPJX1P50+oti+lJyQ0rjvIT1NAgTPU0+kEgBzineIhrQcnnvUXke9TGZc9D+VLsX0o0MbMi+yn+8Pzo+yn+8PzqXePQ0bx6GldG1iL7Kf7w/Oj7Ke7frU1FAFfyMd6j8j3q3tU9qNi+lP2qMeUqeR70Vb2L6UYt/b86FVQWKewepo2D1NT/wCjVL9mX/Jpe0Fa5T2D1NLU/wBmX/Jo+zL/AJNCq2CxUyfWjJ9as+Qf7tN2L6UCI96+tPwnqaXYvpRsX0o9rYnlQnkSDvTcH1NSUVr7ZhZkeD6mo6seSfeo6PbPuUkR0VJ5HvR5HvR7V9x2DB9TRg+po8j3qSl7ZkWZ41sX0o2L6UtFTzEj9i+lGxfSloqQE2L6VJsT+7TYyCeDT6zNBNi+lGxfSlqSq5jMj8r/AGf1o8r/AGf1qT97Tsv7/lR7RgL5af3RR5af3RS+f7U/ePQ1IEexfSjYvpTsR+ho3xehrbmAd5af3RUnlp/dFMorEB/lp/dFHlp/dFMqXfF6Gndidxvlp/dFHlp/dpaKfMLmDA9KMD0p/wAntS0rsLMjwPSpMD0FLg+hp9F2LUTYvpRsX0paKu7LEhRTnIqTy0/uiloo0MyPA9BUmB6Ciisx6hgegp+xfSlpPK9jTEL5HvRRS4PoaVxq7H4HoKMD0FLg+hqendgk2RbF9KNi+lOwfQ0YPoasQebH/dP5U/A9BRRSRpZhgegooqSpvYB32hP7po+0J/dNAkBHX9KdWftIishYrkE4xzT4bhWGVFR0Vdx+0J/MX+7UnmJ/cqpB3p+8ehpXRpzlzzF/u0eYv92qe6X/ACak+0r/AJFTyIOct7k9DS7F9Krfa39TT/tLf5FR7NF+0pEhKg42/rRlf7v61H9pPr+lS/aYf7p/Oj2aJ1GbR/k1JsX0pu+L0NO3r61I+UNi+lLsPoafu/2T+VG7/ZP5UGxHsX0qTYvpRvHoadg+hoAbsX0o2L6U7dF/k0YPoaAG7F9KNi+lOwfQ0YPoaAHeWn90UhjTB+WnUHoa0ArbF9Kk2L6VKOgooMeUi2L6UbF9KlooDlIti+lH2Zf8mlorMOUi2L6VJsX0qWitA5SLYvpRsX0pakrQOUi2L6UbF9Kd5p/un8qZvPoKLokX7Mv+TR9mX/Jp3mn+6fypKAE+zL/k0fZl/wAmlooATYvpRsX0paXzT/dP5UAN2L6UbF9KWigBNi+lGxfSpfP9qKAE2L6UbF9KXI9akyPUUARbF9KNi+lP/eGj95T5wGbF9KN6f3BT/wB5R+8o50AzYvpUnlp/dFN/eehp+IvSp9qVqJ5af3RUnlp/dFMopOpceonlp/dFPynoabg+lGD6Ue1F7w/YvpSbV2/uh9Kfg+howfQ0cwXG7F9KNi+lLg+lGD6UcwX8hNi+lSeWn90UtFUbDMIOCgo+T+4Km8r2NLTuiPZoi2L6UbF9Kfx/z0p4U55Bp8wiPyVo8lal2Z6tRsH96ldmvIhm0f5NG0f5NTYPoajwfQ0XQ7eYnkD0FHkD0FLtb0o2N6U+dCsu4mB7/nRge/507C+/50m1vSlzoLDti+lAtwO/607B9DRg+houO3mN2J/dH5UbE/uj8qdg+howfQ0/aEeyQ3Yn90flRsT+6Pyp2D6Gn0e0D2SItif3R+VS4HoKPI96KXtQ9n5ibF9KNi+lN8g+lSYPoaz50aezG7F9KNi+lOwfQ0nke9ae1D2YmxfSjYvpTsH0NGD6Gs/aIPZjdi+lGxfSnYPoaMH0Nae1D2Y3YvpRsX0paPI96ftR6CbF9KNi+lLRR7VgJsX0o2L6VLRR7UCLYvpR9mX/ACaWikmAn2Zf8mjYvpS1JTWpDTIti+lSbE/u0tFNaCG+SnvR5Ke9Oo8j3oHYb5Ke9Hkp707yPeihBYb5Ke9L5af3RS0U9BDfJT3o8lPeneR71JSQ7FbYvpRsX0qzUdK3mIi2L6UbF9Kloot5gRbE/u0bE/u1LUnke9SBW2L6UyrHke9Hk/8ATCq9qh6FbYvpUmxfSpfJ/wCmFHke9AEWxfSjYvpUvke9HkeppWCyIti+lR/Zl/yal8g0eQanmRgyL7Mv+TS4HoKk8qb0pfs596LiIdj+n86k8xP7lNwfQ0YPoadzpsO2L6UbF9Kbg+howfQ0BYdsX0pmB6ClAk9DS7z6Ckc7uM+zL/k1H9mX/JqfefQUbz6CjUViDYvpRsX0qbB9DRg+hpiIfsy/5NGxfSp/Lajy2pe1L1INi+lSeWn90Uvke9GD6VfMM8Xop3l+9Hl+9Y+0RzjaXY3pS+X70/j1P5UvaoCKirFFHtTQjoqSpKPagR+f7Uef7VJRR7UBN49DRvHoaWpKPagR0oVgc4p/ke9EQmi4NXzMB4ZQOtG9fWkicfw1JvPoKkz5BtFSUUvaE8qCo6sUU/aIOVFepIO9SUUe0Q+UKKdsPqKEHel7QepFtf8AyafUuw+opdh9RV8zAbR5/tTth9RTqkLEdSUZHrRketAmrh5/tRUmR60ZHrQHKiOpdjelPooH7NDNjelP8yX+6Kb5EY71L5Sn+Kl7Uv2TDePQ0tFFVzk2bCipKKOcauiOpKdsPqKNh9RWSlYbVyGpdjelT0Vq3clu5Bsb0qTY3pT6KQhmxvSiBG54qeigCDY3pUmxvSp6KAI6Kkp2w+opXRKQ2iipKEy7MjwPSjA9Km2H1FGw+oquZiIacJWzyadUlTdDsxu//OKN/wDnFOpd7etK6Nudh5w9qf5/tTN7etG9vWpDnY+imb29aN7etAudj/P9qPP9qd5fvR5fvQV7TyG+f7UUYPpSgZNBO4lFKWYE80+gHNi+Y392o9jelS7D6ijYfUUEkWxvSjY3pUuw+oo2H1FAENL5o/54in+f7Uef7U07FLQZsb0o2N6U+ikSM2N6UbG9Kl2H1FG8+goAi2N6VJsT0/lUu8+gqIyEDOKAGeVJ/d/Wk2N6U+ik6yYDNjelL5Un939ad5/tUlNVbAQ+VJ/d/WjypP7v61N+9oo9swIst/d/WpMt/d/WlqTn0H51l7exZHRRT949DWvt0F0Mo8/2oop8wrsZtf8AyaArjtU9H72s+Y3sNKc9aPL96dRRzMXIM2v/AJNAVx2qfyPeijmZXKQlPepNh/vVL8ntS0XYezI6Kfh/QU7YfUVYrMiqSn7R6frS1PtkaeyZHRUlLjJ/fVr7Uz5H2IqkqXzDx5PFJSdRM19ncjqSiiqD2TCo/wB1U2yP1FOoJsVth/55n86dtf8AyanoqfagR0VJRVAQbG9KNjelT1JWhXKiDY3pRsb0qeisySDY3pRsb0qzsPqKNh9RU8zArbG9KNjelWdh9RTaOZgQbG9KNjelT0VQEGxvSjY3pU9FAEdFWKKzNbMrgGPpTNjelWvIf1FJsPqK0vcyIaKm2H1FGw+ooAi2N6UbG9KnooNbMr0fvam3n0FG8+goMiLY3pRsb0qzsPqKNh9RWvOVylWpKm3n0FH2U/3h+dZp2JtchoqbYfUUbD6ijnQENFTbD6ipNh9RWnOVyoq0Va2H1FGw+oo5w5UVaKseR70uD/z2P5VHMSVqKm2R+op1HMBXoqxRRzAV6Zsb0q3Ufke9HMBHRU2w+op1HMBXoqxTdh9RRzAQ0VNsPqKN59BRzXAh/dUfuqm2H1FGw+opcyAh8j3qPyPerWw+opnkP6ilzIBvln1puW/u/rU+w+opmyT1NF0yOREFNwvv+dWdh/55n86TYfUUFlfYfUUeW/8AdNWNh9RRsPqKBWKtJvHoaubJPU0ygErFeirHke9Hke9AuVFeiptknc0bz6CgxIaKk84/3f0o84/3f0oNuVEdFSYPpRg+lAcqPFPLP90U7yWqTyh6/rT/ALMPf86x5mc+hB5LUkceRkCp/Lm/uijY3pWfM2O6I4yRxt/Kjef7gp+T6GjyT71sMXyz/dFHln+6Kf5J96k8k+9Rdj0IvJajyWqXyT70uxvSmm2HukPktT/L96k8t/7po8t/7po1HoJ5Z/uijyz/AHRTvKHr+tSeUPX9aWpnoN8s/wB0Un2ce1SeSfepPJPvQLQg2N6U/J/u1J5J96PJPvVcyLGmJ88L+tHlSf3f1qbyT7077MB6/nRzB7KRF5Z/uijyz/dFTbB6mjYPU0ryJ1G+Wf7oo8s/3RU2wepo2D1NF5C+Q3yz/dFO+zn0H5UbB6mpNg9TS1RSI/s59B+VH2c+g/KpNg9TUm8ehouxlf7OfQflT/KHt+VS7B6mnfJ71GoEHlD2/Kjyh7flU/kJ6mjyE9TSuxakfln+6KPLP90VNsHqad5CeprXmGR+Wf7oo8s/3RUnkJ6mjyE9TRcCPyz/AHRUnln+6KdsHqaN4PY0rsfsxluoOcKKMD0FT7x6GjePQ0XMrSIfLP8AdFSeWf7op2wepo2D1NK9y2rjfLP90VJ5Z/uin+SfepPJPvQSkyDyz/dFHln+6Km8oev60bh/k0XQWZD5Z/uijyz/AHRU/kn3oyfQ1d0TZDPLP90UeWfN+6Kf5J96k8k+9F0FkM8s/wB0UeWf7op/kn3o8k+9O6FYZ5Z/uipPLP8AdFP8k+9SeSfelzIVmReS1HktU32Zv8mjY3pU3Zpysh8lqk8lqdsb0qTY3pRdhysr+Wf7oo8s/wB0VP5J96PJPvWd2HKyDyz/AHRTvJapPK/zmpPK/wA5pqRm00V/JajyWqxsHqaNg9TSuzQr+S1HktVjYPU0bB6mi7Ar+S1SeQak8r/OaPK/zmq5kZEPln+6KPLP90VNsHqad5CeppcxrYr+Wf7oqTyz/dFSeQnqaPIT1NPmQWI/LP8AdFR+Wf7oqx8nvR5Cepo5kFiv5Z/uijyz/dFWfKg/vN+YpDAuOCaXMgsV/LP90VJ5Z/uin+SfepPJHofzrH2vmaWIPLP90UeWf7oqfyT70UvbMixB5Z/uijyz/dFT+SPQ/nR5I9D+dP2vmXYZ5Z/uijyz/dFP8k+9Hkn3qb+ZHKhnln+6KN5/uCpPIT1NHkJ6mi6LsV/LP90VJ5Z/uin+SPQ/nT/LHvVKpcLEPln+6KPLP90VN5Y96PLHvS+Y7Ih8s/3RR5Z/uipvLHvR5Y96r2gWRD5Z/uil80/88l/Kp/IT1NHkJ6ms7m3KN2r/AHR+VG1f7o/KpfJPvTPIT1NIdiPef7gqTef7gp/kn3o8k+9BVkM8s/3RR5Z/uipNjelGxvSnoFkR+Wf7oqTyz/dFGxvSpNjelae0C1hMD0FGB6CjyT71J5J96i6NSPA9BRgegqTyT71J5J966jMi2r/dH5Um9fSpvJPvR5J96PaoRD5Q9vyo3D0H5VN5J96PJPvQMb5Q9vypuB6CpNkXoaPJPvRcu1xvlD2/KjcPQflU3kn3o8k+9Z+2GQ+UPb8qk8oe35VN5J96PJPvS9sPQh8oe35UnlRegqfyT70eSfej2zDQh8oe35UeUPb8qm+xH1P50eSfej2zDQh8oe35U7A9BUnkn3p32Ye/50e2B2IcD0FGB6Cpvsw9/wA6Psw9/wA6vmQiLd/sj8qN3+yPyqX7MPf86Psw9/zrP2oaEOB6CjA9BU32Ye/50fZh7/nT9qBDgegpd3+yPyqX7MPf86Psw9/zo9qBDgegqTA9BTvsw9/zo+zD3/OttAIcD0FLu/2R+VS/Zh7/AJ0fZh7/AJ0aAQ4HoKMD0FTfZh7/AJ0fZh7/AJ09AIvLP90UeWf7oqfyT70eSfetNAI8D0FGB6CpPJPvR9iPqfzpAR4HoKMD0FTfZh7/AJ0JB35/OkBFsb0o2N6VP5J96PJPvS5kBBsb0qTY3pU/2Sf0NSfYv+nmldgVfL96Psv+1VryYff9KX+z29f1qfaoWhV8lPX+VN2H0rR/s8ep/Ok+wj/n3P5indmXMyp9lPqaTyIv7tXf7PHqfzo/s8ep/OtroOYp+UPb8qPKHt+VXPsw9/zo+zS+/wCdF0FzP8v3o8v3q/8AYZv+eX60v9nj1P50XQNsz/L96PL9/wBKv/2YP+WpJ/Gj+zE9/wA6LoOZmfsb0p/ke9XfsI/5+qP7Pb1/Wi6DkM/yZ/aj7M3+TV/yJ/7ppfIH92ajQOQofZf9qmfZz/s1f/s8ep/Oj7MPf86FboGpQ+zn/Zo+zn/Zq/8AZh7/AJ0fYZvQ0BqUPs5/2absb0q7/Z49T+dJ9nH/AD80mhlX7Of9mm+Wf7oq79mHv+dH2eD1P5imGpS2N6UeWf7oq19if1H50zyT71OqGQeWf7oo8s/3RVjyofVvzFM8tf7pouw0K2w/89R+VHln+6KsbG9KNjelIVkV/LP90UeWf7oqz5a/3TSbG9KAsivsb0o2N6VL9mHv+dO8k+9PQzcIkGxvSjY3pUv2b2P50eW39w/nWPtWP2cSDyX9aTyx6/pVryT70eSfer9qJwueG+X71J5fvUnkp70uweprzvaMZF5fvR5fvUvmJ6GpNg9TVqtJmhW2H1FGyf1H61Z2D1NGwepo9pIzuRbD6ijYfarOwepqTZB6n9KPaSArFDntQEOe1WfKt/8An5NSfZR/eP50e2kL2a7FbYfUUfZT/eH51Z2D1NSbB6ml7Zo15Wil9lP94fnSeVL6Cr2wepp/kp70/bNhYoGMZp+w+oq7sHqaTy1o9sZ+zIfIP94VJ5B/vCpvLP8AfP5UnHqfyrbmfQPZxIvIP94Um32H5VY8se9AjGe9HMx+xRD5XsKPK9hVun7F9Kn2skR7Iq+V7CjyvYVa2D1NSbB6mui5NmUfK9hUnlewqfB9KkrD2rHZlTyvYUeV7CrdFP2oWZU3f7I/KnfP7Vdope0YWZSwfRafsPqKtUU/ahZlXYfUU+FieeKt0UvasOVlXYfUU/yvYVPg+lABJxii7EQeV7CgRZOMCrdFL2jCxB5XsKPK9hVrYvpRsX0rLmAZ9nHtR9nHtViipuzKxUt4MAtmlFrz96rOxfSjYvpV+0ZoM+zj2o+zj2qxRUXZFip5XsKk8r2FT0/YvpVc7FYq+V7CjyvK7CrWwepo2D1NahySKu7/AGR+VSeV7Cptg9TSQooBPNA1Fkew+oqSGPMPOOlSBOOtPjQAcnNL21hWRH5XsKPK9hU2xfSjYvpR9YQWIfK9hUnlewp2xfSjYvpR7dBYZ5HvSEADOBVmjrV8yFoVhACM0v2cVY6UVzXZVirs/wA5o2f5zVjzPapPM9qr2zFYq+QKkwPQVYoqLsLIr/Zx7UfZx7VY8j3op3YWRX+zj2owPQVP5i/3aWldhYr4HoKXyvYVa2L6UbV9KBNFXyvYUeV7Cp6KnmQuVkG7/ZH5Ubv9kflU9FUacrIPK9hR5XsKt+QaBycUBYg8mT+6v5UeV7Cpz14orP2jHysg8mT+6v5UeTJ/dX8qtbU/yaNqf5NTzIOUq+V7Cj7J9Knop8yOnlRB5XsKPsn0q9sX0o2L6VpYVij9k+lHlewq9sX0oKqBnFFgsVfK9hR5XsKtBVxyKNi+lZ+2Fysq+V7CjyvYVa2L6UbF9KPbBysq+V7CjyvYVa2L6UbF9KPbBysq+V7Cn+QKsYPpRg+lLmQ7NEHlewo8r2FWti+lGxfSldlFXyvYUeV7CrWxfSpNi+lbqrcCD7OPaj7OPapd7etG9vWp5kaEX2ce1L5XsKnp+xfStEx8rKvlD0FSeV7Cpti+lSbF9K09s2CVyj5XsKk8r2FWti+lGxfSs+ZBysq+V7CjyvYVa3j0NGxfStPbMLXKvlewo8r2FW6Ky9qHKyDyvYUeV7CrdFHtQ5WR/Zx7UfZx7VJRSDlZH9nHtR9nHtUmR60ZHrQHKyDyvYUeV7Cp6KrmQcrIPK9hR5XsKnoo5kHKyDyvYUeV7Cp6kwfU0+ZD5Sp5XsKPK9hU9FLmQuVjPK9hR5XsKfRRzIOVjPK9hR5XsKfT949DT5kHKyHyvYUeV7Cp6K6LoqyIPK9hR5XsKnoqfbILIg8r2FHlewqejcPQVrzXKsQeV7CpPK9hUmD6Gkp3QWZB5XsKN3+yPyqen7F9Kn2yBIh8r2FHlewqbYvpRsX0p8wcrGfZxRgegp+xfSjYvpUcwrIMH0WjB9FqTYPU0bB6mldD5WN3f7I/Kjd/sj8qm2D1NGweppXHyjd59BRsP/PcflUvkp70/wAqL1/Wt+YXulfyvYVP9gHqKXZJ6vU2wepqmzIg+wD1FSQ2gUdBS+enoam3j0NJ3Js2Q/ZPpT/s49qfvHoaNg9TSCzRD5XsKPK9hVnyU96PJT3oIsit5XsKPK9hVnyU96k8lPetCbop+V/00/Sk8r2FXfJT3o8lPegFYpC1Mh4Ao+yfSrvkp/ywz7c0eQnSec/nRcOpR+zj2pPsqegq/wCTb+9Hkp70BoUfsw/55D8qPsw/55D8qvfYk9T+dH2JPU/nWZVjN+xr/wA8Vo+xr/zxWr/2Uf3j+dH2Uf3j+dAWKH2a4/54J+dL9nl/2a0PKj/yajMKY4BoFymb9nuv7o/Kkn03uFGK0/Kj/wAmk+zRe/51z+2KMr+zIfQVH9hh9R+Va/2Vf+eNL9lH94/nR7ZmqRj/ANlH1FNGnTk44ra+yj+8fzpPJT3o9szIwzaT54X9KT7J9K2tg9TR9nt/esuYDG8oe35UzyIfb8q2Pso/vH86T7Pb1Sq1B6GZ9n9h+dM+zj2rT+z2/vUf2Uf88DR7U0sj58yfQ0ZPoaKkry+dmXs2Hlf7P60eV/s/rRUlX7QBmxvSjY3pT6kwPQUe1fcBmxvSjY3pUsSnPyiiJTngUe1fcdhNjelSbX/yadsX0p/7us/aIa0ItrelSbG9KNjelGxvStPaj0DY3pRsb0qTzG/u1JsT0/lR7UNCPY3pRsb0qTYnp/Kn+R70e1DQj8o+n60eWfT9akqStvbSGQ+XJ6frR5cnp+tTVJR7Zi1KvlSf3f1qTypP7v61NTth9RR7ZhqRwAnqn61Jt/2P1p32ce1P2L6Vp7UXukfkv60CJvWpN49DS4HoKXtSRmxvSjY3pT6KV2Avln0P50eWfQ/nT6Ki7AZsb0o2N6U/yPejyPeruwGbG9Kk2N6VL5fvR5fvVe1JUEM8p/WjymHepcD0FGB6Cl7Uohw/pRh/Srnlp/dpfLT+6Kz9oBWw/pRh/SrPlp/dFHlp/dFHtAK+W7r+tTbG9KfRWntSPZDNjelGxvSn+f7UUe1D2QzY3pUmxj2pKko9qDppEflf7P60eV/s/rUu4f3RS7h/cFIz9kyLY3pRsb0qxk+35UZPoPyp+1Y/ZlfY3pRsb0qfB9KMfvelae1YuRDNrHtRAjc8VPSykAjIrK/kHIiPY3pRsb0qeEEZqPB9KLsmyF2N6UQI3PFJg+lSYPpRdhZC7G9KNjelJUlAWQzY3pRsb0p9FAWQzY3pRsb0p9SUBZDdv+x+tG3/AGP1p1FV7VjG7f8AY/Wjb/sfrTqKPasBu3/Y/Wm+Vj+H9alyfb8qMze35Ue1ZfsmReVn+H9adt/2P1qbA9BTgy5+6KkXsyLY3pRsb0p54OKKzJI/K/2f1qTyv9n9aKKDoDyv9n9aPK/2f1qSigBmw/3aNh/u0+is7sCPyv8AZ/Wjyv8AZ/WpKKPagR+V/s/rR5X+z+tSUUXZoJtX0o2L6VLgegowPQUe1YrEWxfSjaByBUuB6CjA9BR7VhYg2N6UbG9KnowPQVndjINjelGxvSp8D0FFF2AzY3pRsb0qbYvpRsX0o9ogIdjelG1vSp8D0FGB6CtDQiw3979Kfs96dgegp+xfSn7Yn2RDtb0o+zN/k0/B9KdvPoKRRFsb0qSBG54p9FFxPUSO2x0Xn607Y3pUmT7flUmT7flWntGFmV9jelL9mPoPzq1gegpCBjgCgXKQ7G9KNjelTBFxyKNi+lZ+2Y7EOxvSjY3pT6Kd2MZsb0o2N6VJk+35VJk+35VftGTZkXlZ/h/Wjyv9n9akorO7KGbG9KNjelT4HoKMD0Fa3ZNmQeWf7tP8r/Z/Wpcn2/KjJ9vyrT2o7Ij2MO1GxvSp8D0FGB6CldhZEGxvSjY3pU9GB6Ci7BWZX8r/AGf1o8r/AGf1qSii7NLIj8r/AGf1qTyv9n9aKK0GHlf7P61H5X+z+tWKKzuxWRX8r/Z/WpPK/wBn9akoouwsiPyv9n9aPK/2f1qxRRdjK/lf7P60n2Yeh/OrNFP2oFfyv9n9ad9n/wBn9amoo9qBDt/2P1o2/wCx+tTVJT9qzOyK/lf7P60nlJ/dH51LgegowPQVp7QuyI/K/wBn9aT7MPQ/nVnA9BRgegpe0CyINjelGxvSp8D0FGB6Cn7QZBsb0o2N6VZ8v3o8v3pe1Y9CLY3pRsb0qXy/ejZ+8xmj2oaEUSGPqP1o3n+6fzqSQAnkUmB6Ckm2JoZ5jf3ak3D/AJ5j/P40vl+9BTAzmn7VhZEv2df7n60eaP7hoG3HOKZ5o/uj8q15kSohu/2Kl8xv7tVqKonkLPmN/do+1NDzio/tP+wPypKNQUWWd1x/k0bJ/Sq/2n/YH5Ufaf8AYH5UtR8pc2J6fyo3Rf5NQfaU/ufpR9pT+5+lF2FifzG/u0bG9Kg+0p/c/SgXCE42fpRdj+RPsb0o8xv7tJ5o/uj8qT7Sv+RUe3YrR7E3mN/dqPdcf5NM3xeopd49DT9uznHbJ/SjZP6U3ePQ0fah6/pR7dhoO2N6UbG9KZ9sj9f0pd8vpTuP2DF3f7FG7/Yp/mD0pm+39BWHMHsZDPMb+7Rmf0FO+0j1P5UfaR6n8qXMSN2N6UbG9Kf5o/uj8qj80f3R+VHMdFkM2N6UbG9KfgeklHmj+6Pyo5gshmxvSjY3pTzMJuw49qXzx/zzX8qjmMyPY3pUexvSrHnj/nmv5UeeP+ea/lRzAfM1SVHgegp5RccCvPckjodFC1JVc8HFS4Poan26MeVj6KkwPQUYHoKX1iJXsB+5fWm5l9vyNOwvoKML6Cl7VIfKIZMnP9Kk2e9N8/2o8/2rXmZCpEkHepKjoqeY0uh5U5+9T9nvTaIO9PmJ9mS5PqaMn1NJUmB6CmVyj96y96ky3t+VQQgHORUmB6CsvaoOUf8AaE9B+VPJQjH9KbgegowPQUe1QcoU/Lf3f1pv2hf7lGV/u/rT9siPZD8D0FSYHoKjwfSjB9K09oUmkP8AIH92j7OPSl8/2o8/2p+0QaD9y+tG5P8AIplSU/aoXsRxKRilyn+RUX7sVJ+7p+1RmLtX0o2L6U3zG/u0eY392tfagSb29aNzetPwPQUYHoKXtjblHgKRnFLgegpNi+lGxfSsfaow9hLuS4HpRgegooq7sVmJsT+6PypaKkwPQVPMNKwzcaNxp+B6CjA9BWntRezI6XEfoafgegowPQUcxQ1lUDIUflTvI96ewG3pSOPQUJiqDaKkoo5iAog70VJT9oaEeT60ZPrUlFHtPMx9mFFFFHOUFSYHpUdHn+1MCTA9KMD0ohlB7Uef7UASYHoKMD0FR+f7VJ5qen6VXML2aFwv979KML/e/Sko85f+eY/Kj2ovZjtw/uCk3D+6KTzU9P0qbyh7flRzD9khtR1JtH939KPNH9z9KOYtoKKN9v6CjzV7r+lHMO6Hfu6P3dN35/gFSYHoKz9sMb+7o+TtTsD0FGB6Cj2oWY395UuW/u/rTMD0FGB6Cl7YXsx37uj93SbG9KNjelX7QY4FgPu/rUmW/u/rUexfSl+zj2qHVuP2TCio8H0owfSrEWPOH939KCAajornNuVCi5GPuUv2kf3BTakp3RKo3G7h/cFH2kf3BTqkoug9gN3/AOcUb/8AOKdgegowPQUh+xY37SP7go+0j+4KdRVe0QvYDdme9Jsj9RT8D0FH2ce1SP2LGZP/ADwFPpmT7flUgOT2/Kg09iOynt+VISmOP5U7A9BRgegrL2qI5WLsPpRsPpT6Km7L9iR0UUVua8pJSxgA8Co8n1NPoMQwPQU6MDYOKdgZ8jFEIBzkVqtGW1cfvX1o3r60uB6CjA9BT9siBm1qNrelPorL2o7MZsb0o2N6U+ij2wWYVJUdFIRJR/qqKKCeUjoqxgegowPQVtzBykdFSYHoKMD0FacwcpHUlLk+g/KjJ9vyqi/YiUVJgegowPQVPMPlI6jqTA9BUmB6CjmDlG/u6P3dOwPQVHgego9qFmO/d0fu6dgegowPQUe1DlZHRT949DRvHoafMhcrGVJSbx6GlwPQUuZD5WGT/kUuT7flSUVQvYhRTsJ6UYT0pXNfYjaKdhPSjCelFw9gSYiPYUYiHYUuU9P0o+X0/Sl7Rh7Fifu6dUmB6Coti+lCaMvYjKsYHoKKPs49qo2SsGB6CjA9BUnke9Hke9AXRHgegoqx9nHtR9nHtQYKLRDNAF6jIqPyk9KtfZx7UeVN6UBYr4HoKMD0FWPs49qPs49qBcrKvkr/AM9D+dSEoQen5VL5KDuKPJT1FPUftCp9nj70/Yn90flVj7Gv/PUVL9nHtT9qyEmUtif3R+VGxP7o/KrP2ce1H2ce1HtWFmVtif3R+VN89PQ1P5HvR5HvR7ULMi2J/dH5UbE/uj8ql8j3o8j3o9qxWYz5/ekqTyPegwCLqKXtQsyOk2J/dH5UuP8Aph+tHke9P2otRnnp6GjzLf1X8qfRiT0FHtRjNv8A07r+lS7z6Cm4k9BUdHtQ1F89PQ0u+4/uj86bUnmj+6Pype1C4mW9vyo3j0NMo80f3R+VZ+0Cw/ePQ0n7r+6PyptFHtGA7EXoKPNf1qL7T/sD8qZvPoKfOaKMix5kv/PWl3j0NQYHoKMD0FL2hHKw8/2o8/2qOnbz6CruXYseY/8AeNG8+gqHz/ajz/aouRynzT5h9f0qTYf71NorwvaeR6PKTfav9mj7V/s1D5/tU32o/wB0flVe0Fy9iX7Sv+RR59v/AHqj89/QUb5vWn7Vh7Nlnz/apPP9qr0n2jH8Jo9q2Hs2XaKrfaVH/wCqpTOIeSeta3MvZFjz/apPP9qr+f7VJ5/tRcPZE+8ehojBI4qsbkg/cqSBzz8tHtzP2JPCCMk0+mwSdeKk8z2pOqmCTQ2in7x6GlyPWr5gCpIO9N3n0FNpOVwLHn+1SVXg71IeBms2A7zPajzPagJx1o8v3qPaGtkLvX1qTevrSfu6PJT3o9qw9khd6+tP8z2pPJHtSU/bMXskO/eUfvKTy2/vUb29a19sL2SJIwAeBSYj9KXc1G5vWn7cz9mJUnn+1FFY+2Zr7Ik8/wBqkqDbFR5bf3q29szF0kT0VHUlL2zBULklR0VLlf7v60e2H7ASilyv939aMr/d/Wj2wewJNjelGxvSn0Vp7cXsUM2N6UbW9KXzPapNn+c1n7cfsCIhc/e/SjC/3v0qXzPajzPaq+seRj7J9xNjelGxvSpti+lGxfSq9uHsn3IdjelGxvSpti+lGxfSj24/ZPuR7F9Kk2L6UtFHtzX2aE3L60b19aWitfbIx9ihN6+tG9fWpaKPbIfsERb19afv9qdRR7ZB7DswoqSisvbmnKFFFFa+2QcrDA9KCAaKKPbIXKM2tRtf/Jp9SVn7dEey8yDY3pUmxvSn0Ue2QvZPuM2N6UbG9KfRR7ZD9k+4VJRRS9ubBRTvM9qPM9qz9sAbD6ik2N6Uvme1Hme1HtxNXE2v/k0uw+oqTzPajzPaj24JWItjelLsPqKk8z2o2f5zR7cErEWxvSjY3pUuz/OaNn+c0e3FyjfI96XY3pUuw+optJ1bmwzY3pRsb0p9FL2oBRTvL96dU+2AjoqSij2wEdFSUUe2AjqSijyPeq5gCiiijmAKKko8j3p+0NCOnp0/Gl8j3orX25mFSxf6ukgI9ako9sAza3pRsb0pfM9qPM9qz9sOzE2N6UbG9Kl2f5zUfme1HtgsxNjelGxvSl8z2o8z2o9sFmJsb0qTY3pS+Z7UbPb9aPbBZjaKkqSr9qhEdFFFO7D2SDJ9aMn1qSitUrgSUUUVuBHk+tGT60UVmA/evrRsHqaZVip9tECHfF6il3r61LRR7WPcCOipKKormINjelTb19aWirdS5JHRUlFMadiOipKKB8xHk+tGT61Y/dUVPMHMV8n1oyfWrFFHMHMN+zN/e/Wj7M3979adUlLmYuZleirFFa05D5ivUlSUeR70cwm7j949DS0VJ5HvSTMhu8+go3n0FTVH5HvRzMBu8+gp1SeR70eR71ZPKR1JR5P/AE8UeVN6UByhR5HvR5U3pUmyX1FBNhojAHT9ai8n3P51PUfn+1VzE+yfcPI96PI96k8/2o8/2qR2RH5HvR5HvUvmj1FBlGOtVyMLIZ9lH92So/sx9B+dWd49DRvHoayuOyK32Y+g/OjYfUVZ3j0NLRcLFPZL6io/sft+tXKjqLmhX+x+361H5HvVz97RSugK29fWjYPU1P8AuxR5EfrS9qBV8j3pn2Zv8mrPkufSjyk9KzVVICt9mb/JqP7M3+TVum+VF/cH5VXtUgKtFXPJPvUX2Uf3j+dP2qFqQfuqKn+yj+8fzo+yj+8fzo9qg1IKKf5D+oo8h/UUvaoLsi2H1FNp/wBlH94/nR9lH94/nR7VG97EOxvSjY3pU9Qb29a29qSfN1FFFfOe0PQ5Aoo84+9Lvb1pOrYPZ3H0UmxfSn+X71r7UXs12G1J5/tTfL96PL96Pah7Ndh3n+1SQHkj2qHYP71OrR1NNB+yTLEHepPP9qqBmAwDT/P9qydQwsy55/tR5/tVfz/apKTqW6CLXmv60ea/rUNSUe2YE32kf3Kk3D+4Kq1JVe2RXsi19oT0/Sl+0J6D8qp+cfU0/ee4p8xl7Nl7zh/d/SneZ7VUEi45WpNqf5NL2orMs+cPSjzh6fpVOpoJyhwRU8yL1LG8+gpwn55FV4Zqsef7VqMmFwuOR+lLuT/IqL93R5i1noR7Mdk+tSZPrUfn+1P3j0NVzBYXJ9aMn1pN49DS4PpTTuDViSpKi2L6UbF9Kn2iYJ2Jak8j3pn2gf3RUv2hP7tLnKv2GkEdRUhnPYfpTFuc8Ecd+KkIINKnVYm+4lO2H1FN8/2oqkTYdsPqKbUlFO9gHeX70BOetOoq/asrlAz5OcUUVJUcwco7y/ejy/em1JUe2ZFmN8v3o8v3p1SU1VbE7ob9l/2qj8v3p1Fae0ZQ7y/ejy/em0Ue0kBN5ntR5ntTaKPaSIuiSim7B/eo2D+9Wntgsh3ke9SVDv8A84o3/wCcU/bILImwPSjA9Kbv/wA4o3+/6Ue2QWQnkj0FHkj0FH2hf7lH2hf7lHtkHskSeWfakpvmLTzIR6VV2NWF2H1FJsPcilD8f/Wo2epqfbINBd6+tHlr/epsJJGDT6zVUPZob5ntS7o/7hpak8j3p+0HZDfM9qPM9qdRR7ULIb5ntRv9BTqKPahZDvL96PL96dRWPtgsxvl+9Hl+9Ooo9sFmN8v3o8v3p1FHtgsxvl+9SeX706in7ULMKKKPI96x9sKwUUVJR7YTVgopvznkUfOOTWXtmFh1FFFbXEGIfSjA9KKKDQMD0p+5P8imVJQqtzMb+8o/eU6iq9qzQKKSBF54qTYvpV+1Ai8v3p1H+qoo9qTzBUlR1MlawZQ2iiitOYnlJKG6H6UVHRzByhUlRnqasVg3YtK5HTU71NTU4zmtach8o2pKKkrbmGlYjoqSitU7jI6k/wCWtFFaKdgJKKKKvmAKKKKz5jMKKKKz5iuUKKKKOYOUKkooqiSOiipPI96rmAjqSo6kpN3AKKKPI96QElFSeR70eR710GZXoqxRWhPKV6KkqOg2CpKKjoAkqOipKAJPP9qPP9qPI96KzMxfMb+7R9pb/IqPe3rRvb1pe2Ksx/n+1SfbPf8ASoti+lGxfSj2yIsWPtK/5FG63/yaqef7Uef7Vr7Risy/5i/3af8Au6ztz/5FAmyelHtWDiaHnL6/pRhf736VU3S+po+0Ten61j9bFYueZ7UeZF6VS+2z/wB2pPts390Vt7WkHsiz5Y9/zpPKB9fzqv8AbJ/9n8qX+0D/AHRS9tSCzJPL/wBoUZzxuH5Un20en6Ufa4R/CaV6IasSinG5hJzj9aXePQ1F0FkJ5j/3jR5j/wB406k8r2NLmATefQU2n+V7GmUcw72CiiisQ5iOipKj/e0BzBRUlJ8ntWPMSM8j3qPyPep9g9TS0XAr0UUVnzFcwfvajqSijmC43zPagMJOMUBAR96jYP71R7VmnujfI96Z9mb/ACaf5HvRWvtyj5Z8v3qTy/eo/M9qk2f5zXzvtT1vZIPL96N/+cUeZ7Ub/UUe1D2RLz/cFHP9wVHtHpUhlGOFH5Vr7RC9mN2N6VJtb0pBPxyKPP8Aaj2iJ1FIXP3v0qXeP7tNop+1QvZj8p7flSjGeaMD0FGB6CtFXsOxLtJ6CjY3pTdwFSbh/kUvbHPYd5y+v6VJ5y+v6VH56/3TQCufu/rUe0Q/YssbG9KNjelQ7l7mpPPl/vVftmKzHbG9Kk2N6VAbgYxM1L9oHr+lP2wWZLUlQxOP4adV+1J0J949DT959BVbJ9TT/P8Aao9qVYtQSuOlSfvKqwkDrT9w/wAil7ZhYsfaF9P0qT7QnoPyql5reg/KpIZW9B+VZ+0EosueYfQ/lR5h9D+VQ4HoKMD0Fa+3ZXsS55o/uj8qflPb8qqfaB6fpUmR7/lS9uwsS4X+9+lLE+BnP6VB5zev6VJ5p/vGq9uyvZEtFJ5p/ur+VHmn+6v5UczD2ZLUlQGU54U/lUnmn+6fyo5r7GI/A9KMD0FRwnOakrb2oD9i+lG1fSmUVPtWKz7lvKe35UZT2/KoKsYHoKGHsbdQo84en6U2MDbkCnVLlYXKSUVHUlPnK9n5knn+1Hn+1R5P+RS5Pt+VFzP2Y/z/AGqSovOX+6PyqXA9BSckAUUmF9BS0J3AkoqOpKYBgelGB6UUUXYDNrelLhvQUm5/8ipNz/5FHtGAuG9BRhvQUm9vWpN7etHtGAzDegqTDegpN7etG9vWj2jAXD+lGHNJvb1o3N60/aMBf3dH7uk2se1SbWHasvagJRRRRdk2ZJgegqTA9BUeR61JketW3YLMjwPQUU/C+goO0DOBWSZIyil2se1HmN/dp3Rp7NiVJTPMb+7R5jf3aLoPZsdvX1o3r60/EXoKNsR7Cs7j9myHJ9aASDnNSbR6UYHoKYiTA9KMD0oorX27AMD0FGB6Cijz/apvcCOpKkwPQVHtH939KgbVgoowPQVJgegoBK5HRUmB6Ck3j0NAWGUU/EfotHm+5q+ZFC4HoKMD0FFLk+poTuQPopmT6mjJ9TV8wD8D0owPQUzDn1/OjDj1/Oj2wE9FFFbAFSQADOBUdSVpAAwPSjA9KP8AlrRRdgSQAc8UVHUlABABzxRRRQAYHoKMD0FLagEnIqYgYPFLmszNbjF6D6UUf62iuxbGgVL5Z/uiojBg4zUogBOOfzo9qQPwIuwqPA83GKlII7UlXzCDA9BRgegp+F9BRhfQVpzAM+zj2oxB6D9KKKz5gCin/J7VLgegrTmRmR0VJgegowPQUcwEdFPwvoKML6CjmAZUdXMD0FR4HoKOYCLYn90flS1Jgego8j3rTmLSsR0U/wCT2o+T2p8wyCipMD0FSYHoKftEZkdHke9SYHoKMD0FHOBHRUmB6CjA9BR7RAR1HVjA9BRgego9ogI6kqTA9BRgegqeY0K9FSYHoKMD0FV7RGYYHpRgelSYHoKMD0FTzGhXqSpMD0FGB6Cs+YzI8D0FR4HoKkwPQUYHoKOY0I8D0FSYHoKMD0FGB6CpAMD0owPQUYHoKMD0FRyIAoowPQVJgegqOYCOo6kwPQVJgego5gI6KMD0FGB6Cs+YAo8/2pML6CjCw9hRzAM80f3R+VSb5fQU0Px/9ao/L96XtgJftU390VJ9qm/uiq3l+9SeX70e28wJvtY/yKPtY/yKh8v3qPy/ej2yAtfah7flT/tMH+RVPYvpR5i/3aPrSAuebD/d/Wmfu/QfnVD7QfQflUnnMP4R+VZ+1YeyLu4f3BTcD0FVvMl9qXfL6Cj2rAseaP7o/KjzR/dH5VW+0zf3R+dH2lf8ij2oE+//ADijy/eoftZ/yKPtZ/yKPamg7zD6/pRsP96m/az/AJFL9rg/umn7UBd/+cUeX703z/ajzYfWj2oj5a8sf3x+VG6T+8aZT9i+lfO+1Po/ZIT5v85qTz4/SmbF9KNi+lO6H7FD/l/zipP3lRZf3/Kly/v+VHMzH2IuW/u/rUmW/u/rUYDY+9+lSYb+9+lHtWHsgy3939af+8pmG/vfpUmG/vfpSdRi9khNy+pqTK+pqLy2/vUb29atVrD9ii3RUfn+1S4PoaPao5/ZSH4HoKMD0FMwfQ1J5p/un8qPbIPZSH1Jgegqv5/tUnn+1P26M/ZokwPQUYHoKj8/2o8/2quZB7ND8t/d/WnbG9Kb5kX9+pIRF/e/Sq9rEj2YuT60ZPrTvL96X7O39+l7VFWQtSVH5HvUlZ+1QC8f8/X6UlFSUe1QWbF2t6VJC5PO2mxEgcDNLR7U1syTz/aiiir9qIkimz/9ajz/AGpNi+lGxfSj2qAlpct6ml3n0FG8+gp+1iA7A9Kfl/UVDg+hqTzT/dP5Vn7Ylq/QmBbH3f1o84/88xTN4/uGitPaonkJ/tCeg/KjKe35VBUla+1QvYonynt+VGU9vyplHn+1P2qF7FD8p7flUn2lf8imUef7UvaoPYj/ALSv+RUvnn+6Kj88/wB0Unz/ANz9aXtUHsif7V/s1J9pX+5UWD6Gn7T6U/axD2aHb/T+VJhf736U3a3939TS7n9D+dL2qM/ZE+U9vyoynt+VV/MX+7T8xeoo9qibIfhf736VJsb1H5U3C+hqTzV/un8qftEV7IMp7flSefH/AHR+VJ5jf3ak8xv7tHtESHmN/do8xv7tMyvv+VPhMfv+Vae1ATzR/dH5VJABzwKjqSs/amYYHoKPNH90flS4j9DRiP0NHtQE80f3R+VSeaP7o/Ko6KLl+zZJ5o/uj8qMD0FR4/6YfrUlF2HIwwPSn7k/yKb5K1J5K0uZC9kJgelGB6UuV9KMr6UcyNfYsb9n9x+VH2f3H5U7ZF/do3R+lV7VC9lcZ9nCdMflUnl+9Juj9KN0Y5xS9qh+yF3R+op+T6mk8sH+Gjyx/dNZ+1iYBRSeYv8AdqTzF/u1p7QBlFG8f3DRvH9w1PMgDJ9akyfWk8xf7tHmL/dqvaALRSYX0NJhfQ0vaICbA9KCOOKj80/8+1L5p/59jWftUbX8iUFMc/yo+0J6fpTfNP8Az7UzD/8APAflTI9l5k/mj+6PyqPA9BUX2aYn9+M1KIBBzbwUzQT7KP7x/OpajzN/z70Y/wCmH61PtRX8hftP+wPyqfA9BUWxfSl8/wBqZlaxJgegowPQVH5o/wCfYUmxfSgEmx9qAQcipsD0FQ7/APOKPL/6ZUvahZkvnD/nn+lJARKuSoFMyPQ/lS5Hv+Vbe2ESqQDyKfgegpGj2EZOfwpQAOBXTSqpkuzQYHoKMD0FFFbFBgegoop+xfSgBlFP2L6UbF9KrmQrolopShl4IzRg+hqSBMD0FSYHoKZg+hpIbYA/KpouBJAAM4FSVHgnoKlwfQ10XOcSjA9KME9BTzIM8rVUmAycDjijA9KXB9DT6q4BgegpvlJ6VLsX0o2L6Vq3cBmB6U8xAdTS/vaKunTIDI/54j86MD0FFFaezDQZsb0o2N6U/j/nhSeUf7prcn2g3Y3pRsb0p/ke9SeVD6VPsw9oVNjelSfZm/yan8j3oo9mP2pH5HvRRRVgR4HoKMSegp5Y5+7QGOfu0he0GUUpU54BowfQ1gbcrEopcH0NGD6GgfKxKKZg+hqTB9DQHKJRS4PoaMH0NAcrEopcH0NGD6GgOVhk+poyfU07YvpRsX0rMkZRT9i+lGxfSswGUzyE9TU2xfSjYvpTbua2GUUU/avpTc0PlYyipKKx9sHKyOipKZg+hrMOVkVFP2L6UbF9KC7C0HoaXB9DSFTjkUEcrEAGBxTMD0qTpUcwJ6Cue4crI6Kk8sf3TR5Y/umg05WR0VJvH9w0nlj+7QHKxk/ao/P9qfsX0o2L6UroOUZRT9i+lGxfSi6DlYtHn+1MwfQ0YPoawJH0UzzT/dP5UYPoaAH0UzB9DRg+hoATA9KMn1pcH0NJg+lZ3LauFJ9pX/IqHa3pRtb0p6ByE9SebN61X8/2o8/2qyD5owfQ0YPoal2n+6fzqTYfUV8r9YR9x9VZWwfQ0YPoasfZj60uw+tP6whfVmQ4PpS4Poal2D1pdg9TT+uoj6qxmB6VHU3lD2/KpPKHt+VL26F7IiwfQ0YPoal2H1o8s9yKf11D+qsTyVo8lal8v3qTyz6/pR9cRn7JkP2d/Q/lR9nf0P5Va8v3o8v3pfXTn9nIht1bk5z+FHlyetWth9RRsPqK0+uD9mxn2daPs6+9S0daPrYvqg3y/emeUff8qn2H1FP2N6UvraMvqqIPL96PL96n2N6UbDF1FH1tC+qobhv736U/b/sfrTvKb2/Kjym9vyrX62V9WQ2BOOtT+SvrSeWP7tSeWP7prH25l9VYzY3pRsb0qbyz6fpR5Z9P0ro+sIPYsTy/ejy/eneWP7pp+wepo+sIX1VjPLk9ak2v6/pT9g9TRsHqaf1iI/YjcH0NSYPoaXy/epII/f8ASl9YgH1VkWD6GpMH0NL5fvUnl+9L66g9kQ1JTvKPr+lHln1/Sq9vEPqzI/L96khQjoc0b/8AOKk8v3/Sn9YQeyDb/sfrRt/2P1qTyT/d/SjyT/dH5VH1sXsg8v3o8v3p+7/ZH5VJuH9wfrWf1tdw9iyPB9vzqTa3pT/IH9wVJk+hpfXER7N9iLLf3f8AP50eS1SfZ1/ufrR9nX+5+tafW0T9WDYvpRsX0qTyPr+dHkfX86r6wivZy7C+f7VJ5/tSbU/umiC2Ug9qlYxB7JhuPofyo8o+/wCVSeR9fzp/2b2o+uJmfsWQeUff8qk8uX/nvT/s3tUn2b2o+toapMZsm9R+VJ5g9/yqXyWoy3pWn16IexZF5g9/yqTy/ely3pUnkN/zx/Wj68g9iyLYPU/lUmwep/KpP+A/+O0eUPb8qf11EfVZEe//ADijy/erP2c+g/Kj7OfQflS+uor2JW8v3o8uX1q55Pt+lHk+36UfXYh7Er+XL60eX71Y8ken6U/yPaj67EfsmQeX70eXL61P5B/u0eQf7tH12IezkQeXL60eXL61b8g/3aPIPpT+uxD2cimLef8Au0fZm/yaueSPajyR7Vl9cRz+yRW+zH0qT7IPQ1Y8j3o8j3q/boPZ3K32M+p/Kn/Zf9qpvI96l+zN6H86n66jH2RW2Reho2j/AJ4n86u/Zm9D+dH2ZvQ/nVe3iHsyj5Z/59D+dH2M+p/Krvkn3o8knsfzrX6xEfs/Ir+WP7po8sf3TVj7O3900eQ3901P1yIezK3kL/cNHkL/AHDV3yT6Go/JPvVe3Q/Z+RW8hf7hp+3/AGP1q15J96Mn0NHt0Hsyrt/2P1o2/wCx+tWvJPvUnkH+8KPbxDkKmxvSjY3pVvyD/eFHkH+8KXt4hyFTY3pRsb0q35B/vCpPI96PbxDkKPl+9Hl+9aHk+36UeT7fpR7eJnysz/L96m8j/b/SrXk+36UeT7fpWnt4i5Cp5LUeS1W/J9v0o8n2/Ss/bofKyr5H+3+lHkf7f6Va8n2/Sjyfb9Kv20RchUMJAyW/SpBCTyDU5g46fpTxCMf/AFq0p10PkZHsb0qExYON36Vb8n2/SjyOf/rV00q6uJQZT8v3o8v3q19nbzak8j3rp+sI05GVvJajyWq35Pt+lSQwZzx+lT9YM+RlbY3pRsb0qz5Pt+lHk+36UvbGfIyLY3pRsb0qXyfb9Kkhgznj9KPbhyMrGMnqtPCEDgVL9nHofyqX7OPQ/lXZSkjL2ZV8sf3TUgtiOBmrPkH+7QIAa1pyRPs2VtkXoak8sf3TU32b2p/2c+g/OurQXsyr5XOcH6Uvlj+6atG3Ao+zj0P5V0U2g9myrs/2f0pdp/59zVzyVo+xL611aD9myt5Y/umo/LH901d+xr60fY19aPZoXs2Uin/PBfpT5W/6dyateT7UeSPai5nyMq/vvejZJ6mrv2L/AGv1o8j3rPmFyMp+WP7po8sf3TVzyD60eQa1uP2bKXlH3/KmeWP7pq55HvR5HvWXMHIyn5Y/umjyx/dNWfIFH2EetHOHIyt5Y/umjyx/dNWvs49D+VH2ceh/Ksbo19myp5R9/wAqPKPv+VWvIX+9S/Z1Pes+YXIyr5Y/umjyx/dNWfsJ9KPIP92j2qHyMq+Uff8AKjyj7/lVryR7UeSPao9qg9myr5R9/wAqPKPv+VWvJHtR5PtR7VB7Nlbyx/dNSeWP7pqXyR7UeSPasfborkZW8sf3TR5Y/umrPkj2o8n2qPbD9myt5Y/umjyx/dNWfs/ufypn2ceh/KsvbRFyMrYPoab5Z75NWjAB1oMI7VjVrLobezZXwfQ0YPoaseStHkrVe2iHs2Vdi+lGxewq15K0eStR9bRfs2UfJajyWq95K0eStR9bDkZR8lqBDPmrf2ceh/Kj7OPQ/lR9aD2bK2D6GjB9DVn7OPQ/lR9nHofyrP2yDkZT8v3o8v3q39n9z+VR/Z/c/lU+1QcjKnl+9Hl+9W/s/ufyo+z+5/Kj2qDkZU8v3o8v3qx9nHofyo+zj0P5Vn7WJXsyv5fvTdrf3xVr7OPQ/lR9nHofyp+2QezKu1v74o2t/fFWvs49D+VR/Zx6H8qXtkHsyp5R/vCjyj/eFWvIFHkCj267lcjKnl+9Hl+9Wfs/uPyo+z+4/Ks/rAcjK3l+9Hl+9TeQf7wo8g/3hR9YDkZD5fvR5h9D+VTeQf7wo8g/3hR7cORkPl+9Gyf1H61N9nb1p/2Y+35UfWEHIz5sqTA9BVjypvSivhfbyP0r6rEr+R71H5HvVzyPejyPej28g+qxK/ke9R4k9BWhR5HvR7eQfVYmfgelHmj+6Pyq55HvRR7eQfVYkO4eg/Kn+UPb8qfUlZ+3kH1VFbYvpRsX0q7hP7tGE/u0fWJGX1WPYg8pexo8qb1/U1b+zp6UAJn7tP65Mx+rRKfn+1S7G7irez/Z/Sj7L7VPt2R7FdiAyNnhaPMb+7U+z/Z/SpNn+z+lP28g+rFbYPU1JsHqam+zx+9H2eP3pfWH3I9kU9lS7D71N9nHtUn2ce1V9bkP2RVgjXmpPLWpvs0Xv+dH2aL3/OtProvYjYIQc9PyqTyR7U/EfoaMR+ho+umf1ZDPJ9xUnH+f/wBdPxH6GpMR+ho+uh9WRB5I9qk8gDuPzp+I/Q0Yj9DR9dD6shnl+9SBOetOwn92jCf3af1xmX1FdyTfH6/pR5cf96k2D1NGwepqfbS7j+qLsS+U3t+VHlN7flSYPqaXB9TR7eRl9WgJtH+RUnlr/eo2L6UbF9K1Vdh9WiJsHrUuxfSl8hf71T/ZB/fP5U/rj7j5IoreX70/d/sj8qd5XsaPK9jS9ux8iH+Q390VLbw4zlRUmweppCgxxmuf27M+RC28KDoo/Ojyl7KPbmlwfWpPONSsZPuHIhvld8ijyfcUu3/aP51JAvX5j+ddX1uRl7NEWz/Oak8z2/Wl2L6VJsX0rH64x+zQnmf7NGz2/WnVJS+sSM+RDSuTnbUn2b2puD6mpMH1NP28xewQ37N7UfZvapsH1NGD60/rrHyIb5Q/uijyh/dFO49P1qX5PetfrjDkRB5Q/uinmIY6VJ8nvUnye9H1xsOREHkj+6fypfJH90/lVjYPU0bB6ml7dh7NEcEI5+U/lUnkj+6fyqTYPU1JsHqaPbsPZoq+SPf86k8ke/50/B9KMH0p+3ZHIh/lD0NHkj0P5U/YfUVLsHqay9vIPZlXyR7/AJ0/yPepth9RUmw+orX27H7NFLyR7/nR5I9/zq7sPqKj2H1FHt2Hs0Q+R70eR71a2H1FGw+ope3YOlEhFuSM80fZz71KEOOtS7B2Nb+3ObkRXFsuOSal8hfT9KkC8feP51L5R/v/AK1z+3aJ9miLyR/dP5UeSP7p/KpNg9TRsHqa6frD7mHs0R+SP7p/KjyR/dP5VY2D1NGwepo+sPuHs0V/JH90/lT/ACfb9Kl2D1NGwepo+sPuHs0Vvs6f3P0o+zp/c/Sr1GCego+sPudHsolfA9BR9l9qs7f9ofnRvh/vD8619uxeyRW+yn0H5UfZT6D8ql3t61J5bf3qrmZX1aJW+yn0H5VJ9lPoPyqXy2/vVJ5bf3qOaXcPq0St9nk9qPs8ntVgzYOMUef7VftmL2USr5Pt+lHk+36VaqSn7ZmPskVfsX+cUeT7fpVqil7Zj9kip9gPqaPs596tbB6mjYPU1HtmHs0VvJ9v0o8n2/SrVFX7ZmPIir5Pt+lSeT7fpVqij2zDkRVMGR0/SgQYHT9KvG3yMZqNV/hFb0q7Rr7JFTyG9P0o8hvT9KtbB6mjYPN6muz6xIfsokXk+36UeT7fpVnYPU0bB6mj6xIPZRIvJ9v0o/4D+lWdg9TRsHqa7PamXs0VvI9v0qX7KB1P6VNsKin48qqpt7szVNFX7OPQ/lUn2ceh/Kpv9bVit/asy5EVvs3uPypDbjPX9KthCRmnkEHFVTrNEezRXFuAfvfpSC2HqPyq3sPqKfsPqK9CjWbFyRM/7EvrUht4T6/lVkp6VIE9TXoUrm3Iil5APSj7CD0NXmDHjilFqVHNdVK5nyIq+T7fpR5Pt+lXvLWjy1rW0g5EUfJ9v0o8n2/StLYvqKT7Ip4DD86LSDkRm/Yl9ak+yS1d+yn+8Pzo2H1FY+0Zl7JFL7EvrR5K1d2H1FR/ZT/eH50vaMPZoq/Z4Pb9KDYLj71Xth9RUew+oqPaMn2cTP8AswPOaX7KPUVf2H1FIUIGa5LMPZxKP2Ueoo+yj1FW9h9RR9lP94fnWHtGHs0VDbZ7igW/uPyq3sPqKTb7j8amrWaD2aK32dPX9Kj+zD1H5Ve2H1FR7DF3FYe3ZryRKv2Yeo/KkNsMdf0q3sPqKQoQM0vbyD2cSqLYY6/pS/Zh6j8qshCRml2H1FcvtmHJEp/Zx6H8qPs49D+VWv8AVVHS9qzXkiR/Z09f0o+zp6/pVrYfUVHsPqKx9sxciIPso9RR/Z4/vCpaPP8Aas/bMORFb7P7j8qDb8dvyqzQeRij2zNuQrC3GKX7OParA4GKK5vbSDkK/wBnHtR9nHtUnn+1Hn+1R7Zj9miPyPejyPepPNH90flRWP1iRXJEj8j3o8j3qSil9YkHJEq+R9aj8n2/SrXmj+6Pyoo+sSNfZoq+T7fpR5Pt+lWqKPrEg9mir9nHofyo+zj0P5VLsHqaNg9TWft5D9mir9n9z+VH2f3P5Va2D1NGwepo9uxeziVfs/ufyo+z+5/Kptg9TRsHqaPbsPZxKv2f3P5UfZ/c/lVrYPU0bB6mj27D2cSD7L7UfZfarGB/z2H5VHWXtmbezRH9l9qj+y+1WKk/dUvbMXs0VPso9D+VH2Ueh/Krfmf7Apm0/wCTR9ZfcPZxK32Aeoo+zj2qx/13/GisvrYeziVvs/uPyqP7P7j8qu4PpUeIvStPbMPZxPm+jyPepKK8v2Mj767K/ke9SeR71JRS5VYpbkfke9FSUVkIj8j3o8j3qSis/Zor3iOirlV6SdySOpPI96lwfQ0YPoayuyuYSipPI96PI96n2bMSPA9BUmB6CjyPepPI96z9mBHRUlSUGhHRUlFBmQlOetHl+9P3t60b29a0F7ISipKKDL2YUVJRQHswoqSigPZhRUlFZmfswooqSgPZhUlR1JXQHswqSo6KDP2RJUlR0ef7UB7Il2N6UbG9KSpKDL2bF2N6UbWHOKfRQL2bJ96+tG5T3qvtX0qUdeannMHRsP3L61JvX1qPYvpUmxfSsfamRJtX0o2qO1Q7n/yKk3P/AJFa+1YE9FFFI5ySio4COeakyPWgCSiiiDvQAVJUdFAElSVHRWhoWKKMj1oyPWgzCio6kq07mg7Z71IEwc5qLe3rUm9vWn7YysyfA9KMD0qLan+TUtY8wvYokoqOpK2KJKKjqSgAooooAsUVXqxWZmSUVD9qP90flU1aWAKKKkoAaUyc5o8v3p1FBh7FBgelSYHpUdSUCCijI9aK6AGoQMk04kDqaTbbwc9MU15/mPFa0EbU6QlxAZh96jyD/wA9G/OipK6zYKPI96jqSgAoHBzR+6ooAcbXn71SfZfRqg/0j2/WloF7Isef7VJB3qnRWhj7Jltbg5wRzQvoR0qO3YmLB9Klz++rlrbGdWmR0UUVJkOcDjinU14Rxz+tTVVHYh7BRRRWwiTAHQUVHketGR610AFFSUVoAVJUdSUAGB6Ug+8aWkH3jW9HciruS0UUV2mRJUkHeo4O9SV0GZJRRUlaUtzMKbjc3HSlYkDIpxJC4r18JSsAkJJzk1JRRDDXogFFSUeR71oAQE880ZPrRg+lSYPpQAeR70VJRWgFeipKKzMyOipKKAF3MO9RVN9lP94fnTaw5EZKxXopdzetAZs8msvYmnvCUT9qPI96KzsQFR+R71JRWZoR+R70UUVzgtiOipKK5a25oR0ef7UUViAVH5HvUlH+qrM0I6KKJv3Vc4BUn+tqOiaGswCaGhuh+lFDdD9KDQB+6A+lFC9B9KK43uAUY/6YfrUdFTc6CSio6KxMw/dUebD60eR70UGhHR5/tR+6qOszQKPP9qKKAJKjo8/2o/e0GgUUfvajoAk/dVHRRWftEAfuqKj8/wBqJvIrMA82H1o8/wBqKjoOgk8/2qOijz/aswCpKr+f7Uef7Vze2YEnn+1HmzetR+f7UUe2YElFR0Ue2YHz3Uh6GpPI96PI966T6gjo8j3qSo65vYs0CipKKPYsCOo6k8j3qTyPej2LAq/Zff8AWpvI96koqvZGhF9lH94/nR9lH94/nUtFVZAR0VYqPyPesPYgFFSUUvZrsZkH2Zv8mj7M3+TU9FZ+wNBN6+tG9fWpNq+lG1fSsvYsBnke9FSVHWvsl3MwqSijyPej2S7gHke9FFSeR71l7FgR+R71J5HvR5HvRketLYA8j3o8j3oo/e1XsQCipKK09kgCiiioF7IKKkooICDvUlR1JQAVJ5/tUdFBPsyxR5/tUdSUGfsySio6KCSxk+tGT61D5fvR5fvWHumfsSbJ9ak881D5fvRv9P5Ue6HsEXYbhev9Kk+0L6fpVPevrRuX1pWZh7BlzzF/u1JsX0qrub1o+0t/kVmZ+yfYsbG9Kk2N6VX3t61Jvb1rQXspdixsb0o2sO1V97etG9vWgPZS7FrevrUm5fWq+F9Kk2r6Ue0MvZDtx/yKlw47VB5i/wB2pNi+lAKCY/Z6Gjf/AJxUNTfaE/umgz9kO8/2qQ8jFR5HrUnnitCB32r/AGaN4/u02pKLleyEy3939alqO3AGcVJUe2Y/ZBUnn+1R1JR7a4eyCCfHIqb7Uf7o/Kof9VR+6rTRmXskSebD60ebD60Zh/596P3VWUSUC4IOcUUUATFMnOaN/wDnFQ0eR71XKL2RP9qH90/lUtU6d9lP94fnQ0hlrz/ajz/ao6KkCcA5zu/Ci4XdjmolYk4JpJNyY2fjW1LVk+zVyMsxGCx/OjyLj+7S/am/u/pR9qb+7+lesa6k1Hn+1Hn+1FLcYn2h/wC6KPtD/wB0UfaQOqn8qP8AR/b9Kz9qAfaH/uim7G9Kd9lH94/nR5N16imq1gJaPtB/umorXofrUtL2qAKKKKPaoCZWxwamqvTlbHBq2jGrSJqKh8z2o8z2pWZl7Jk1FQ/av9mpPM9qLMPZMmoqHy/epPL96sz9ih2B6UYHpTfL96NnoaA9iiaiijz/AGo9oZezEDAnANSkgcmogwPepC3O3FdNPcPZaiwd6KKK6aO5k9ySpKjg71JB3ruMCSiipKulsZhUlRwd6sQd676O5mEHenMecAUOwxgUKABuNelRpdQG1JR5HvRXqIzFJzjin0eR71MSFGB1relSsBHsP96pNn+1ThY8ff8A0qX7CP75rp9mL2pWqOrlFHIZe0K9FWPI96PI96OQPaFeip/so/vH86i+yt/e/Ws/ZooXevrUFWPI96iDLng1h7BMSGUUv2U/3h+dJXEO9yOipKjn7UAFR1LzbmkrnAjoo8j3o/1VcZotg8j3qOpKjrMAqOrH7qo5ofWuSruaEdH+qo/1VFctXY0CiiisAI6P9VRRQaB+4moaDg89qKjb/WH6UAH7qipKjrjOhbBR5/tR5/tR5/tQAf8AXx+NFR+d5tHke9ZgSebD61H5/tRmH1o82b1rMv2S7h5/tRR/qqPP9qzNQ8j3qOm7/wDOKjzN/erMfsUSFWJz/WovNb0p/wC6o87p5FL2iN7BiX0oxBEKjqOsfbICcTHjyRUZbnA60wkDk0gIIzWdWtYhUxaj8/2pvl+9Hl+9Y+2ZtZDvP9qPP9qh8v3o3/5xR7ZhZEnmS+lGz0/nTftmO/6UfaBWXtBknke9FV/P9qkrL2pHIiTz/ajz/aq9FHtQ5EO3+/6Ub/8AOKi3t61H9pb/ACKPalniO9fWjevrRsX0qTYvpXv+yPcI2+7S0jfdNLQVSYUUVJWZp7Qj8j3qTyPeiisygo8j3ooqfYo0CpPI96jqSqAPI96KKKn2KAPI96PI96KKkAo8j3oqSs/YAFHke9FFZ+zkAUeR703y/epPL96fsmL2o2ipKKQyOipPI96KPZyAKPI96b5ntUkD+1R7N9ivajqKKKz5ESHke9Hke9FSeR71YEdHke9FSUcgEdFSVJWYFfyPepKk8j3qOj2aCwUVJR5HvWdwtcKKk8j3ooMwooooAKkqOpKACpKjqSpe4EZ6mpKYQcnipMH0NQjnsxKsVXwfSrGD6UpAFFFFSZklFFFaAFTG5XHC/pUf2o/3R+VTUAHn+1Sef7VDhPSpMIapszVIf5jf3al80/3BUH2of3T+VSb4PWsTD2MiTYvpUmxfSo96+tG9fWsx+xZJsX0qS3UDOBUe9fWpNynvQHsWS0VBvb1o3t61p7JisW/P9qPP9qr1JQZElFR+R71JQBJ5/tUnn+1V/I96krQCUXRAxipTdZGNtVakp3Rl7IftU9qPNUfw0ypKftmai/aj/dH5Uf6R7/rS2vU/SpqkxvZkH+ke/wCtT0UUCbuFKCcjmoqkrVqxY1vkc8dDQZsnIHX2qYgMMEVAdyHHSvRo1hJ3EPJzSggEE+tJTvtR/uj8qoZI14qj7tQ0puSeMfpTlAApmtGjZifbHHYflU320+h/Kq9FHKx+xiWMn1o88+lQb29aW2YknJrbUn2aH5PqaICeeTSYI6iitdDTQn+1D+6fyo+1D+6fyqPZB6VJsX0pcqI9nET7Uf7o/Kj7Ue6/pTaKLIqyJg+BjFSeZ7VW3t61PUtWOd0bElFFFIgKKKKAJMn1oqOpK6qdK24BBUrNu7VGBk4oKkdOa63RlcmqPqX7QRhSOnWmHDEKKbFESa6qNGy1Oaqi2QSuKl8j3/Worc5GalyBxRSo23PPqklSQd6jg71JXdSpXOYkqSEgZJqMkCXJ/wA81JCSSSa9GjRAkqQkDqajhOATUpJY5Jrvo0bmKVyX7KByWpvke/61JFFngVJDDXfRpW1IVyEWxByGqQgbsk1P5AU5zTySTk130oMl1UV/I96k8j3oorU5g8j3ooorQAooorMBwj/zmgODxtptFT7Id0R1FcNtIGKs4PpRg+lYKnY6fdKSvk05bdTwW5qa4t81GpJHIrKtSUkNvQgpVbb2p0sRJwRTK5K1G2w9yOipV+8KirgrAFFFFZgR/wCqooorkqlfZI6kE+DnFR/8takriNiOaGo/+WVSf6qiDvWZoR/8taKJ+1HMMNc5oR/8taKKKzOgKKIO9E37qk2rAQN1P1pKD1NEP/Tf8awAk/1tH/Xx+NR+f7Uf8ta5wDz/AGqP97UlHn+1ZnQNynrR56Q9DUPnTzdajEGT+/p+0Z0Es0ry81Htb0pPP9qPP9q5vaICPzYfWpPMmqvUn72sq2xb3F2R+n8qj2N6Uvme1R/aieiVl9Y8h6k1Hn+1Q7/X+VHl+9Ye2YrIJrr2o+1Z/gpv2gD0qPI9ay9oMk8/2qOecAZNJsX0o8xf7tZ+1HoL5/tUdJ5i/wB2jYvpS9qGhGtyzGpCQtQUouQOdvNZ1qqNybevrR9qH90/lUX7uj93WPtV3AdRUfnj+7R54/u1l7VGZJ5/tUfn+1R0ef7VsB43RRRX2Psj1AooopAFFFFZ+zYEmB6UhAIxiloo9mwCijz/AGpMFeQePSs6tI29oSwd6KKKz9mja4wk5PNSfaD71EeporQ5yxRRRWZ0DShJ+9RsP96nUef7Vj7IBvl+9SeX703z/apKPZAN+y/7VHl+9OqSj2QEdFSUVJoFFFSUGZCHwMYo8z2qaip9igCim+X70eX71l7JgOooqSkaFegcHNSUVoZklFN8v3o2Y53VHsmA6ipKKy5DblG+Z7UeZ7U6pKysjD2rIvLX+9Um9fWlop+zQxv2U/3h+dNpdp9KMH0NACVP9lH94/nS0UFJIKKKkpeyQtCOin+Wv96jevrWXsWSqoz97UguCO1FFHsWVYkNxzwtFJuX1o3r60vZM5W2LRUv2qL+6fyo+1RH+E0eyYaiUU77Uf7o/KpqRBHk+tGT60UVoZk+9fWjcvrSfaE/uml2L6VHs2O8WS0fvabB5nNH7ysvZBYmqTz/AGqH95R+8o9kFh3n+1Sef7VHRWhkT/aV/wAij7Sv+RUO1j2qTaw7UB7BD/P9qKjoouBcoqOpKzOckoqOigCxUlV6PP8AagCxRVfz/apPP9q0AkqxVeigyauWKDyMVXqxQS1Yko69ai2L6UFVx0rb2oaC7ZP7n60bZP7n61J5/tR5/tW3tmV7UjowPSg8HFBnwM4rc1Qz7M3+TUmxvSgxpn7n61Lgf3P1rD2we1RFsb0o2N6VNsX0o2L6Vp7eQe2IQGXkj9adgNzUhVByRTgrHnFb0a99xe1TId6+tG9fWpNi+lGxfSuvmRXtIkFSef7VY8uI/wAI/Sjy4h/CP0p+1QvaxIftR/uj8qmopPso/vH86nRj0YtSeR71H5HvRVmRJR/qqKK2pbGYVJUdSVsaBUlR1YroomY2T/Wipv8AVVClTeR712U/hOWqLCc8Yq1bw/LxSQW69D1qzBY3F9N9nt4PMrvo0fbnnVqyI4cgYUU4gjqKsf2Lq8MQ/cVFXoKl7BHJ7YclSp90VFJ2qW2+7W1HYoc/3jT4ICTgUyP7xqzBbc4P6V6FAy6E0MNSr1H1qKpbfrXbSMvsj5+1FFFdT1OV7hR5HvRUdaAFFFFABRRRQBJUdFSUAR0VJUdZgOSDOcmm05O9Orlqje5ST7ooT7oqUW+BgGkkgyuDXLWOh7DKgueuKmuug+tJ0fJrjqAtCrQOoqVPvCo/+Xj8f61zVy+olFFR1wHQV7jrRB3oPU0VxmhJP2qODvUk/ao5+1c1XY0Cib97RB3qP/lrUGhJUdE372o/P9q4qrtItbkmB6Co5wOOBUnn+1R/8tP3+elZtjDzvKqP/lrUlR+d+9qACiio/O6eRXP7U6Bnmv6UbW/5eB9afUdZe0R0Efn+1MVycGChZRcdf9XTmbHAqKtWxZDsb0o2NN2pfM9qPtX+zWP1geo7A9Kj8/2pu/1/lUfl+9Ye2YrIlWXHJFRElj8vagkscdKRm7DpXLVql63F/eUfOeDUX2lv8ije3rWXtGOzA3GT0pMn1qPz/aiszUdcsCBg0u9fWovtCf3TQAo4uuvej2oDfP8Aajz/AGpn2lv8ikrL2iCzCiio/P8AamaEn72io/P9qKAJPP8Aajz/AGqOisrIfsWFFFR1qI8fqSqv7upP3dfpH1dFe2Yu5fWjevrTd7etG9vWsPq7D2zHbF9KNqjtSeZ7UeZ7UfV2a+2JqKjo8/2rH2LHckqSq32kf3T+VS+f7UexZoSVJUfn+1Hn+1Y+yAkoqPz/AGo8/wBqPZASYHpRgelR+f7VJR7ICTA9BRgelR0Vl7NgSef7VJVeis/ZAWMD0pCoxwKZRQBJRUXmL/do8xf7tHsjb2hJvX1qTevrTPP9qPP9qfsWZ+1JKKi8xf7tSeYv92j2Jp7Qlo8/2qDL+/5Uv2h/Q/lWPs0STUVF5zev6UYb+9+lHs0V7Qn3/wCcVIE561DRWXsg9oWKKjoo9kSO8vHGP1o2f5zTqKy9ijb2o3zPagPKTjFTUUexQe1GlCT96jYf71OoqPZmIVJUdSeR71QDShJ+9RsP96neR70eR71PswHbD/eo2H+9Tako9mA3y/ejy/enUeR70eyuA7Yf71Gw/wB6nUU/ZMBu/wBRVjzPajy/ejy/euf2a7Baw2iiinyGYVJUdS4PoaxkAv2U/wB4fnTaKn+yj+8fzrXYwtcWpKjqSsCwooooAKkqOpKACiiiuiwClWzwKPMb+7SUVl7AfMxfMb+7UnmN/dpPI96PI96PYD5mT719aNy+tQwI3PFSbW9Ky9izm0H1JUHlt/eqTy2/vVl7FhYnoqPIi70ZHrSESUUeR71J5HvWhmFSVHRQBJRRRXQBJRRR+6oMyTJ9aUE5HNRUVKjqBIvQfSg8jFRAjA57UuR612rY0FyfU1Pk+tQ+ZF6UeZ7VPsmU1ctUVHRS9ic/KOk7UwW4AxmnvyAadW1DYa2I6abYk5DfrU1FbUmxkX2ZT/8ArqWiitORASUeef7tGR/kUm4dM1qqZqhfP9qKKKsyJKB5/fH61ELYA5zUtdtLcAqS361HVlYORz3roikBGxOSM0+H/XfjQYOTzUlbLY5xT90VPAMnFMh+6Pxp/wDqa2gctUtW7YOK6jRYrc2kQtz24rloZwRWvpOsiHqf3de/gKlBHkYukzpMCud1uO2gupLeA9auz6/iLP2esa5uBcTZ9O1d2Jq0a7PPwtJjqV/vGkt/9ePrSv8AeNctA61uWYbfapqakf7ppa76JmTgDA4paIIeB9KK76Zz9wooqOuokKKKKDsCiiig43uFFFSUAFFFFABRRRWYBRRRQAVERnvT1bPBptedWpXHsR1HUgORUdchuVx0FR1bT7g+lQz9PxriqmvQiqPn/j2/SpKjg71w1TcjqObqKJ+1Sr1H1riNCKiiisnsaEdH/LWiftR5/tXG9jdbEFx1pKD1NMXqPrXM9Ckrk9Hn+1R/62iub2jN7IKjmmon7VHWVWqBJR/qqj8/2ornOgZ5jf3aj2NN2pS5z92j7Uf7lZfWEXqQgEnAp/nheMUG4CjgVEADyx61x1q3MXuO8/2oqMT5GcUGfg8VBI395R579xTQeOaMj1rD2jNuVEdwcmiio/P9qyKJKKKKzAjooooAr0UVHQaBRR5/tR5/tQAUVHRWZ0ElR+f7UUUAFFFR1zgSUVHRXQc543RTv3dH7uv1n2TOL2o2pKb+7o/d0eyYe1JP3dH7uocH0owfSs+Q09qO3+oqTzPaotzUbm9ay9lE09oiXzPajzPaovtLf5FSbm9aPZxH7Qk4/v0cf3/0qKio9ig9oS8f3/0o4/v/AKVFR5/tR7FB7QsUVD58fpR58fpS9gjb2zJdy+tSfaV/yKq/aX9P0qP7c3r+lY+wF7Zl7z/cflR559vyrOmusDlqin1MdQaPZLuP635Gt9uX+9+lR/b1/vfpWJNqffFRzayOn2ip9iR9afY3vtR/uj8qPt59vyrnJtdbtc/pRDq7dN36Vn7Fke1On/tD2/Sj7f8A5xWBDq7f8/P6VLDrB6UeyYe0R0Hn+1Sef7Vhf2svpUn9qj0/SsfYs29sa32g0faD71lf2n/s1F/aw/umn7Ey9qja+3N/e/Sj7c3979KwP7c9qP8AhIP9n9aPZMXtDovtnv8ApUn2z3/Sue/ttfX9Kkg1pemaPZM29sdB9uX+9+lSwTgjIrn4dT74qxDeVl7Nh7Y3PP8AapPP9qyYb5uxFWTe/wCcVkqJp7Z9DRo8/wBqoQ3DnkfypftD+h/KsvZFe1L1FV/P9qk8/wBqfsTT2xMUyc5o8v3psM1Sef7Vl7AB3l+9Hl+9N8/2qTz/AGo9gA3y/ejy/enUef7UewAKkqPz/aip9jEr2zJKKPP9qPP9qj6uHtpElFR0v2lv8itPYxD20iTe3rRuY96i88elSeeKXsEc/tZBRR5/tR5/tR7CIrMkqxgelQ/aj/dH5Ufaj/dH5UeyQ00iTYf71H2r2/So/tR/uj8ql+1D+6fyqPYWHzXJLcYBGaWo6KXsRliio8j1oyPWn7IAoqOin7AwuyxUlR5HrRketL2RuFSVH5/tRWtjMtB8DGKPM9qq+f7VJ5/tXN7Fk28ibZ6GpPL96q+f7VJ5/tWXsxWRN5fvUnl+9VfP9qk8/wBqPZhZEmT60ZPrUfn+1Hn+1SItQ3XtUn2r/Zqvv/zijf8A5xVezJ90sfav9mjzPaq/l+9SGTAz/Sj2Ye6Sv9001QMHimG4GyhZ+DxSpgtiaio6PP8AakUSVJVfz/apPP8AagCxR5HvUdFdBmWKKh+1H+6Pyo+1H+6PyoMyak+1D+6fyqL7Uf7o/Kj7Uf7o/KgC15/tRTd/+cVJ5fvV/WEK6G0UUVp7VDJKKYygcg0+qpVeYNySio6krp9szMKk/dVHR+9rWnVvuBICQcirAIPIqv5/tRBPg5FdNKrYCTz/AGqSDvTMH0p8HevQumZlq1702mx96mopnLVFT7wqWG8+fHaok+8Kl/5aV3UdzEkeWfgZp9t96mLD0p9t96vTpfCcVX4S3F91vpTrXqfpTH+6aUAnoK7aOxzLVFipKKkrvpE9RzdB9KdTW6D6U6u2kcrCo6KK2JCiiigCSo6kooAKKKKACo6kooAKKKKACiiiswGvTac9Nrkqje5Xn7UifdFC3GRnFSKYdvWuate1jpexWi/1gptPuPvj6UyvPrGv2iOo6k/1NRXHSvMqsukN+zMf/wBdRiVgfu1PUdefzo2Ix05ooqPz/auOs9DpWwjMFqMDu1CqBzSEljgHiuGtWNEhtFFHn+1Ye0ZuMwx5/rTArZ5p1R+f7Vze0R0ElR0eePSo8j1rl9uAef7UE4Gabs9TUcr85J/SsvbMuyEJOTzUWT60Hk5ommrjNSTyB61HRRWZmJtU9qj2r6U3e3rRuY96ftWdA7cvrUX2odl/Sl2L6UbF9Ky9qAo4GKKKjrMCOabuajqSo6zNAooqOtACijz/AGooAKjoooOgKKKKAI6KkqOswCiiitACjz/aio6APGftX+zUn2r/AGao/a2/un8qPtbf3T+Vfs3sZHy3tS99q/2aPtX+zVH7YfQ/lUn9oH+9/wCO0exkHtSz5w/vfpR5w/vfpVf7S1H2k96XsmH1tFrzz/co88/886reYPX9KPMHr+lZexJ+uotUef7VT8/2/SpPtnv+lZexN1i4lnzG/u0bG9Kr/aF/uUfaF/uUeyZr9aLHmN/do8xv7tV/tC/3Kj+3J6UeyYfWi55jf3aj81h/DVf7cnpVWe/44X8c0eyYfWjQmmPXZVC+1Unov4VRvdTZuSB9KxtT1cw9h+dZ+xZl9aRrXmstD/D+tZ954lI4878zXJ614raL7s1cpqnjgQHmcE/Wl7APrSPRZvFjdM1Tn8ZsP+W+fbFeVXvxGT/nvWVefEVYP+W/6U/ZD9qewf8ACWD/AJ6mpP8AhKrf/n4rxGf4lnobio4PiWR/y8UfVWP2p73B4ti/57fhV6DxLH90XP614PZfE0H/AJbVs2fxGtu7/rWXs2ae1Pb4fE5HHnVJ/wAJOf8Ant+teSw/EHH/AC8/pUn/AAsG2/5+ax9lEPaHqU3ignrN+tU5vF3bzq8svfiPnrcGsq8+I3rNR7JB7Q9en8Z2+Mfaf1qL/hMbf/nvXiV78TR3mqt/wtMeb/rqf1QPanvcHjMf8/NWIPFkHQXGa8FsvikOnm1ow/Es/wDPT9aPqoe1Pd4fE3of0rRs/ETDj7V+leGaZ8SFGB5uK6LTPiDbz9Jv1rL2Bp7Q9mstdHQn9KvQ3/fNeW6Z4uQ8GX8zW9Z+KPO4879aPYIPanfw6r3I/WrMN9b56H864qDxM3/Px+lXIPEB6E/pWPsjX6yzrYb63z0P51JDcD0P51y8HiCD+9+lWIdZhP8Ay9D6Yo9kg+ss6X7a1SQzRdMfrXOQ6x2q5DqffFR7G5r9aZt/aB6fpUm4f5FZUN56L+tWfOH9w0fVX2NvrbLm4f5FSfaB6fpVPzR6UeaPSl9WD62y2TPn7wo3N/eFVPOb1/Sjzm9f0rL6sL2kS39ob1FG5v7wqDzm9f0o85vX9KPqwe0iW/tDeopPtDetVfOb1/Sj7W39/wD8do+rIPaRLn2hPT9KNyf5FUvt59P0o+3n0/Sj2Qe0iXd6+tG5fWqf28ev6Ufbx7/lR7JmX1ku+cP7v6VJ5/tWd/ay+lRf2nH/AHax9ixe1Rq/aV/yKPtK/wCRWX/aw/umj+1h/dNaexD2pqfaV/yKl8/2/SsX+1/9ipP7X/2Kfsh/WTa8/wBqPP8Aasv7aP736UQ3o9aXsWL2hqef7VJ5/tWZ9sH94/8AfNSfa1/v/wDjtZexYe0L/n+1Sef7Vmfa1/v/APjtSfa1/v8A/jtHsg9oy/5/tR5/tWf9s9/0o+2e/wClH1YPaGj9oH90VIZ0xwtZX2z3/SpPtnv+lZeyZr7RGh5/tUnn+1Zn2o+/5VJ9qPv+VR9VD2qL/n+1Hn+1UPtR9/yo+1H3/Kj6qHtUanmn0o80+lZ/2o+/5Un2s/5FL6qHtUaX2r/Zo+1f7NZ4uQR979KPtI/v/pWPsomXtUan2r/Zo+1f7NZ/2j/a/Sj7R/tfpR7KIe1RofaR/cqT7V/s1l/aP9r9Kk+0f7X6UeyQe1L/AJkn9+pPOX1/Ss37W39//wAdqT7W39//AMdrP2SD2zL/APaHt+lH9oe36Vm/bPf9Kl+2j0H5UfV0M0ftX+zR9q/2azvtzf3v0o+3N/e/Sr9kbaF/z/apPP8AaqH25v736Ufbm9f0o9kYmt9ub+4KX7cf7grN+2R+v6UG8THB/Ss/YIVkXvP9qm+1H+6PyrJ+2e/6VJ9s9/0qRml9qP8AdH5VL9qH90/lWZ9s9/0o+2e/6VoBp/ah/dP5Ufah/dP5VQ8/2o8/2oA1PP8Aajz/AGqh9ub+9+lJ5/tTuwNT7Z7/AKVJ9s9/0ql9qH90/lUvn+1P20TK7Ln2z3/SpPNh9aoQI3PFELt6Vv7Qd0aC+UTzUxGOi1RWY56fjU0MxHIH4VpTxVjCrTLXKnJFSxDOWFQxSginAEHHavUo10ZE5lIGcVLjeOvIqHpU0QCnIrvpVdTmvrYkftT7b71Mb7op9sfInHSvcpP3Tjq/CWYP9Was2vQ/Wq0H+rNXq7Y7HNVHx/dNLSP900tdVEzWxIvQfSikBGBzS130zn7kdFSUVsSR0VJRQAUUUVoAUUUUAFFFFABRRRQAVJUdSZHrXLUH0K+T61HUmCOopFXHJHNctWrY6bqxV2se1ARs8ipPNb+4aAjZ5Fc/1g1uyOclrjkY6UydvIG0c+9JPcE9arqW6DpXn1Z6FexG3BxNj3olGKAAJs/561DPOSdxHHYV4FWrdnXRpD6ibd/CKPtHov6VGJjj5q8+tWNfZMUEHoaiLAdaWabuarC4z2rz6tVG/stCQS4OcUGYn/8AVUfm/wB7mo/OPY/pXLVxSNfZeRLUfn+1Q/av9mo/tWeAtcntzT2TLBTJzmoxJg5/pUf2rHAWo5rn2rm9szX2ZKJgBjb+lKZhjpVbdb/5NHmqP4ax9qXYk+0r/kUbl9arfaH9P0qL7S3p+lZe0Y/ZFnz5PSo/nPBpn2of3T+VRfbz7flR7RmvsyY8nNHn+1U/P9qPtnv+lZjNDz/aovtQ/un8qoef7Uef7VmaF/7UP7p/KovtR/uj8qq+f7VH5/tQBe+0If4TUX2jH8Iqr9pUf/qqP7Sp/wD1UFexZZ8/2o8/2qv5/tUfn+1BJc8/2qPz/aq/n+1R+f7VodBcoqn9s9/0o+2e/wClZgXPP9qj8/2qv9s9/wBKj+2e/wClaAXPP9qPP9qz/tnv+lJ/ay+lZgaPn+1Hn+1Z/wBs9/0qL7cv979KXskBo+f7VH5/tVL7cv8Ae/So/t49/wAq1FdGj5/tR5/tWd9vHv8AlR9vHv8AlQF0eGf2uPQflUn9pD+4K4r/AISAehqT/hIF/wCe/wClfv8A9U8z83+tHYf2iv8Aco/tFf7lcl/wkH+z+tH/AAkH+z+tZfVWH1tHW/2iv9yj+0V/uVyX/CQf7P60f8JD/wBNaPqrD62jrf7RX+5S/wBoD/nsfzrkf+Eg/wBn9aP+Eh/6a0fVGH1tHXf2j/02P/fVSf2ofSuO/t5KP7eSs/qbH9bOw/tJvX9KP7Sb1/SuQ/t8f8/AqT+3x/z8Cj6qzT62u51f9pN6/pR/aTev6Vyn9u0f27R9VYfW13Ol/tFv7lU5tVbpisCfxDg4AqlP4jA4C1lyI0+tSNbVPEAWuU1/Xy0XNR6nr+Yv+PjNcZ4n8QZ4W4rP2TNfbEHibxaW8z/SOK4PWvFlz1E/FP8AFGtYGPtOPXiuK1PUvOFa0sNcFVNCbxLcY/14/KqV74nnl6Tj8qxJ5yeTUda+yNvaGj/blx/z1H5Uf25cf89R+VZ3n+1Hn+1L2YzXg1uaHpcVo2fi2SHkXdcv5/tR5/tWXsUHtTvrLx/Kf+Xmibx9MD/x9Vw3mN/do81h/DWX1akbe2Z1c/jq+m63GKpT+Lr2b/l5NYO5vWj7S3+RT9ghXZpz6zcTf8vFRf2ldf3hVCpKv2cQuzUg1ySHpLVmDxDKei1iAv60G4fHNZ+wQe2Z1tj4ruoJcif9a6rQPHR/d/viPcNXk8FwAchf1q9Y65NCeV/EGsvqiNvanu+jeOT/AM9810OmeOsdLnHpXgOm+LjCeGrdsvGhHWeuX6oHtT3eHx8x5+0VZh8fN3nrwP8A4T+5/wCe360Q/ECfP+urL6qx+0Z9E2XxCi6GetWy8dwdPtH6V86WXj+56faK2dM+IDDGLj9Kx+qi9sfQ9l4tabn7Sa3dL8Qmc4/lXhPh/wAaeef+PjFdlovif+9cUexY/aHrVlrhPANXYdVbrXA2WuY4E9asGvdjS9mL62jsf7Wb0qT+1m9K5ODVx0+0/pUn9sL/AHv/AB2n7IX1xdjqP7VPp+lH9qn0/Suc/tUf8/QqL+2F/vf+O0eyD64jqv7WX0o/tZfSuU/tuL3/ACo/t+M8c1lyI2+tnTf2la+h/Ok/tRf+ef61yv8AwkA9DUX/AAkH+z+tHIP2p2P26D++aim1U9N1cf8A8JAfQVWm8TMeDcVl7PzD2p2v9q+/6VH/AGr7/pXDT+K2P/Lc1Wm8V84a4o9mHtT0D+2x/dFJ/bqf89hXnc3jNcf6+q83jpR/y3rMs9J/t2o/+EkH/PwPzrzKbxzbAf6+o/8AhOR/z2P5VmB6jDr46efUn9u15VD45XvPViHxyv8Az8UAeo/27ViHV+3n15nY+M/S4/CtGz8WsP8Alv8AhQB6P/aQ/uCpP7RH/PX9a4SHxM3/AD3/ADq7D4i45mrQDr/7Wb0qX+1j/dFccNeQj7p/OpTrqY4FL2SM/bo6z+1/9ij+1/8AYrlxquRnP6VJ/avv+lTdGvtkdJ/a/wDsVJ/a/wDsVy39rn0P5UDVznp+lR7MftvM6z+1f9gflR/av+wPyrlRr4xzcVL/AG7/ANNq5SPe7nS/2r/sD8qP7V/2B+Vc1/btR/2x/nFAa9zrv7VH/PMUf2qP+eYrlf7do/t2ouhnT/2svpUv9p/7Ncf/AG7/ANNqP7drO6Ok6/8AtZfSl/tMf89x+dcnDr3Y1J/btZ3C6Os/tP8A2aP7T/2a5T+3j6n86k/t9vWi6LOrh1PvipP7T/2a5D+2D/z8mpP+Egb/AJ7/AKVkB1f9p/7NSf2n/s1yv9uH2/KpP7c9qAOm/tP/AGak/tP/AGa5n+3Paj+3PajQDqv7T/2aP7T/ANmua/ttfX9Kk/ttfX9KVzQ6H+0/9mpPtnv+lc7/AG4fb8qP7cPt+VZ+1iB0X2z3/SpPtnv+lc7/AG57VJBqw6kUuZAb32z3/SpPtnv+lYX9rD+6aP7WH900XiB0MN5Un2z3/Suf/tMnoh/KpRqRzylYXQHQ/wBoe36Ufb/b9KwxqHHT9KP7Q9qx9sjW6Ohhv19f0qT7cv8Ae/Sud+3N6/8AjtSQ6o/WsvaIXs0dFBqBHAk/SpINRbP+s/SsSHUu9WIdS71P1lB7NG/BfE9F/WpIb1v7v61gQ6n3xViHU++PwpfWUZeyOgimHerkM2Olc5Dqpx0/Cr0F4COvFddLFsyqUmbHncYIpzSkH7tZsN2B3xVj7X6nP4V7VHMDm9lboaUM59OalUADmqEF1bjirME/fH1r2aOYnJWpXLsExBypq7b3JIyRj1rMgl5zirMFwV7Z+lerTzC5yVqJbtV5ODmrirjvWZbygHIGKtwTD7wH1r1KeLuclYlqSoftCscFakKEV6lHFk3HUUsXU0+vRSucz3I6KkowfSrOsjooooON7hRRRQAUUUVmAUUUef7UaAFFFMlkJ5xXLVqnUPn7VVuJ8jOcD6UXFxbHjt/Oq5umJzj9K8qrUe5dKkSXHJHf2qO4uOPeoJZj1Y/QYqvNesx54ry6uKszT2JZ88D+H9Kjll7kfSq814BxVaa87GvFxWYanZSolmab2qKaYnqMVTmvOPmao5rzPUV4tXMDqpUSzNNxkioprgnotU5tUGeBVefVf/1V5dXMKJ1qky+suD/9amGcEj2rKn1UA5AqtPrcB4K5rgq5pROlYVm0LoYxn9KiN2M/e/ALWBN4ht+1V5vEIPH2ivPq4+ibLCVmdJNfHuRUc196kVy03ie3/wCex+lUp/GltbnPnH865P7VNv7PrnYf2ufaq39rmuMm+IFiOPt9Up/iRpX/AD8Vz/2qdP8AZVU73+2j/kVFPrJPBNedTfEyx/5+apTfFOy9az/tU6v7IrHp02s571H/AGyPX9K8tn+K9h2FV5/ixAOQKn6+bf2VWPVv7ZqP+3h/k15JP8WD3gHeq0/xYHUwDv2oWOJ/sauevHXMHGKP+Eh/6a147/wtlfUUz/hcE/rJ+VbfW13N/wCxq/Y9i/t8en60f2+P+e1eMf8AC3p/75/Kj/hcE/8Az6n86PrXmY/2VXPY/wC319aP7fX1rxj/AIXAPQUf8LgHoK1+t+Yf2VXPY/8AhIU/vD86T/hIU/vfrXjH/C3xRN8X5v8AIrX60w/squew/wBv/wDTej+34P71eLTfF6b3qP8A4WzP6Gj60a/2XWPaf7ftv+e5/Kj+3x/z3rxab4sT5z+9qt/wti+/6a0fWg/suse5f28Kj/t+2/57n8q8O/4Wlf8A/Pej/haV/wD896PrTD+y657b/b9t/wA9z+VH9v23/Pf9K8Nn+Jmof895KrzfEbVz/wAt5KPrTD+y6x7t/wAJDB/z8H8qj/4SC2/57n8q8I/4T/V/+fiSo/8AhONW/wCfiWn7dGqyw92/4Se3/wCev6Uf8JPb/wDPX9K8F/4TPUP+fiWj/hLNQ/vS/wDf6j26H/Zh7t/wk1h/z8Un/CXaf/z8V4N/wkl97/8Af6op9evqPboX9mM97PjWwPH24VF/wnNiP+XgV4V/b192J/Oq39sX3m9fxrSlWRl/ZZy/9vD1H50f28PUfnXF/wBsf5xUn9sf5xX9Q6n4Vqdf/bq+350f26vt+dch/bH+cVH/AGx/nFZa9w1Oz/t5f+e4o/t5f+e4rjP7ZHr+lR/26P8AJo+Yzt/7eX/nuKDry4P78VxH9sj1/SkOvTYPNHzDU7n+3aP+ElHtXB/27/02o/t2uU0O8/4SQf8APwPzo/4SUe1cH/btH9u0Aegf8JH7VHN4qA615/8A27R/btQaHbzeLV6faKr3vicDgVxn9r/9N6rzax2rI0Oh1PxOTx9orlda1rzfrVe+1QAYFxWTe3v2jk1noa6mfrN28/UVz96pHUVr3n77rVOeG4x/qKSrSR03MnKetGUFTz2FzUc1hc+lP2y7nUVqKsfYrn/Io/sy6/uisfamhBuP+RRuNT/2Zdf3RUv9l3PtWf1pdwKVSVZ/su59qX+yP9up9rEdmM2r6UFFx0p39l3P90VJ/ZVz/dFP61QNLMr7/UfrS7x6frVj+y7n+4KP7Luf7grP21F9Qsyttb0o2t6VY/su59qP7Lufaj20Qsxm8en61FvHofzq/wD2eP7n60n9kUvbUe4WZVyv939alguLjH3ePXNSf2Vc/wBwVL/ZVx/co9rh+4WZF9un9qWCefpuz+FWP7OuB2FH9nXHoKx9tQHaQtveTMOtaOm6hNFN96s77Lc/3qsQWhhGAaFWoBaR3mgeIPKJFdt4f8Tf3p68i02W5gOQDXRaXrNxF1WuW6DVHtmmeJV6C4rWsvEi9Gm/KvILPxM0J9s1oweLXHHnH6Vj7YwserQeK0/56/hVn/hKo/8AnrXkkHjRxxtP0q1/wmh/57fpT9sx2PUP+EtP/PWl/wCEtP8Az1FeW/8ACbH/AJ7Co/8AhNj/AM9hWPtWa+wZ6t/wl8f/AD3/AEqP/hME/wCex/KvKP8AhMH/AOeoqObxu/8Az2FZ86NvYnqc/i4dPOqvP4zPaavLJvHjdpqpzePGP/LesfaI29kepT+M2/571TvPHODzc15ZP40n7z/rVKfxrN086j2qH7I9Om8cL/z8VnXvxAH/AD2rzSbxNNj/AF9Up/EFxnAHH0rm9szT2R6RN8QD2mqtN4/PaevOpvEFweftNVzq+Af9IqjT2Z6N/wAJzdf89zR/wmV1/wA/Brzca3gYxUkHiEdCK5TX2R6TB41uBx51WIfGtx/z2rzaHxD2K1JD4h7ebV+0Zr7E9VsvHAPHn1tWfjhhx9orxqDXp6uQ+JPSesvaMX1Y9usvHR6GetGDxmvQz14XB42uIB/r6sw/EL1n/DFa+1kZ+yPeIPG46GWrMHjYHjzq8Ph+ISn/AJb1Yh+I47T/AK0e1Zl9V8j2z/hMP+m1Sf8ACYD/AJ7V4z/wn6/89/8Ax2pP+E/X/nt/47WXtTX6uex/8JYP74o/4Swf89BXjn/CwB/z1P5VJ/wsAf8APU/lWXtGP6qexf8ACVr/AM9P1o/4Stf+en6149/wsEf89x+dR/8ACwR/z3H51j7Vl/VT2X/hK1/56frR/wAJWv8Af/WvGv8AhYI/57j86rTfERe9xR7Vh9VPah41XH+upf8AhNl/57CvEf8AhZf/AE8H86T/AIWGP+fj9az1N/qjPbv+Exi/5+KP+Eyi/wCfivEv+Fh/9PA/OpIfH/8A08D6Vj7U0+qeZ7Z/wma/8/H6VJ/wmQ/5+BXi3/Cfr/z2/wDHakh8fqOs/wCFP2qD2J7T/wAJZ/08frS/8Jl/08V4/wD8J8f+e3/jtH/CfH/nt/47Wft/If1U9m/4Tb/psKk/4S2L/nvXiZ+IR/vj8qsw/EMd5Kw9qyfqaPaYPFjf8/H4VL/wljf89RXjcPj497k/lViHx963X4YqPas3+qI9lh8St/z1qSDxKe8pryOHxw3/AD91dg8YuOt1+lHtmH1SJ6zD4mHTzKk/t8f3BXlMPjNe9xVj/hOF/wCe/wClY+1J+pxPUf7dh9al/t9vWvL4fHa/896kg8dWxGfPNL60bfVEen/2+PX9aP7ZPr+lea/8JwP+ex/KpP8AhObb/ntWf1tB9VPS/wC3h/z1FSQ6wOnnD868x/4Tu27XA/KpP+E6tzx9oFZfW2P6oenQ+ILf+6Kk/t/0lH5V5f8A8Ju3/Pf9Kf8A8JxD/wA/FZfW2aLAHqX9v/8ATb9aP7f/AOm3615l/wAJzbDg3QqP/hOrb/n5/wA/nWH1s2+o+R6r/b/t+tSw+Jj6V5L/AMJwf+fj/wAdpf8AhPz/AM9f/Ha5vrRr9Q8j16DxQ/TzasQ+KH6bK8d/4WEP+e/61LD4+GOTXL9fZqsrPZIPELdD/OrMPieDP/Hz+teKw/EUelWYPiNcdpufrWP9oGv9mM9sh8TW3/PwKuw+JB614dB8SpicA81dh+IU3cfrWX9pmX9jVz3CHxNADxcVZg8QY4Iz6V4pD8Rr/wBKuWfxH1HPWj+3vYmNTIap7ZD4h7H9Kuxa0OMGvG7L4g3Pr+Natj8QSRkiu+lxRROCrktY9Xg1kZxnPNXINUwB3rzKy8cW/a5PStK08VnODcfhXvYXimgefVypnpEGtY+UVYg1Qg5H5VwFn4o5wbitGHxAOn4V9HhOJEeXVyq253EGoetWYb1T71x8OvdjV2DWP/119Jhc/oVjy6uXtHUGfngVLDLnkH8K52DVsGtKDVBnJFfU4XNaByVaVjTBI6Gl3HuKhiuweMfjU0Uu+vZpVqFY49RKjqSiuoRHRUlFAEdFSYJ6Co55vK68fWoaSHZsVSc4Jpu/yjgDNV5r/nGM/SqsuqDqFrzsViqNA6HSRenuLcDrVW41FQT3rNm1HPI6VnTasB3+teDis0obnTSwhrT3uTz/ACqlNqQ6n8qzJtX7ZrNn1qYcAfhXy2LzrsehRwhvTan6D8KpTapjkj61gz61cfhjpWdPqU/U18tis+sepRwFzp5tZA4J/Kq0/iCDp+VcrNeT956pzXk/eevm8VxGd9LLzqZ/E8PQVSm8WQn/AJeOtctNPNnbVG4n9R9K+cxPEdZ7HoUsBROln8aW+Obg471SvPHVvjp9AK5i+O3oKqXAHGT+deXVzmse1SyqgdDfePz1zis688fT9DWFcZUggcVXueVBFc39qV2ehSy+gjUn8c3w65qne+M77OfOrOuINvBNRTQ0LFVzqpYSgS3viDUJz/r5azptTv8AFSVHWtLFM6PZYcj82b1qPzZvWpKjrX2qNHSsR/varz9quVXp+1QvZFG5YYGDUW41fn7VHWyqIpUrdCnOT61XyfWr/wBlH94/nVSn7WwJ+RXn7VHVyq9X7Zo2I8n1qPJ9akorT2yMvZEBAHQ5qKrFFa0qtw9iV6jq55HvUdbe0F7Ar+R70VYqPyPel7Qz9miOo/I96sUUe1QeyK/ke9Hke9SUUe1QuREfke9R+R71Yo8j3o9qhFfyPejyPerHke9RblPetvasPZDPI96KkorT2rI5WR+R70eR71JUdP2zMghho8j3qSDvRWntUY1KZ4d8396pOf71JDGfX9RUm4+v61/Sf9qI/nb6oM+zL/k1H9mX/Jqfyvr+dR+V9fzrL+1DX6oM8j2qPyPap/IX1o8lPWsf7WF9WRDmjNP8lv8AJo8hv8mj+1TX6sV/JH94UZH94VP5D/5NHkN/k1n/AGqx/VkQ+QfX9aj5q39nP9+o/s5/v1n/AGqafVvIr5H94VHkf3hVv7OfT9aj+xH+5+tL+1DT6syDcPWo9w9RVz7C3r+tH2dv7361l/aht9UkZM8GKrTWXrW39m9xUX2XHORWP9qGywpgTaaOmaj/ALMB/jrcnt+weq08OOC5p/2gbfUzIGmKTnyc/hUJ00Hvitkxf7VH2XPOce1c31o1o4RGONIX1P51IdIXH/162fs7f36k+z/7ZrH60bfU0YP9jv8A88D+dH9lv/eP51u/YB7/AJ0fYB7/AJ1n9ZN/Ysxv7Gf3/Oj+xn9f1re+wD+7+tH2Af3f1pfWvMXsjB/sdf8Anl+lH9mr/c/St/7Avt+dJ9gX2/OsvrfmHszF/sZf71H9jr/zy/Sug+xL60fYl9aPrgeyOe/sf/Oak/sz/arc+x+361J5HvVfWzX2SMH+yvb9aP7K9v1rY+yY43VL9ib1rH62zT6sYP8AZLetSf2S3rWz9n/2f1o+z/7P61r9bYfVmY/9le361J/ZQ9vzrU8r/pp+lTfZz/eNZfW2H1Yxf7KHt+dH9lD2/OtTyv8App+lTfZz/eNH1th9WM6GwX0/WrNvCq9Fqx9nP940eQf71L60w+rDoX8rtn8ak+1f7NJ5R/vUbm9ax+tMx+qrsJ5/tR9suPQfnUfn+1RzTdzT+ss2+rMk/tK59R+VQf2qfSqk97g4L/pVOe+I6v8ApW31t9w9kjSm1Keqtxrc/a4/DFZU2qt/z3qlPrhHBaj2oezRtz6zMBzPVafW5uy1gzawOmarzawP+fisrsZuz60Om0VHPqncKBXOzayOmRVefWRjg0/eYHQT64OnJqtNrfbFc/PrYHAqvPqx6gV0ewuaG7PrrHgH9Ki/tX3/AErC+3N/e/Sovtnv+lbewA6T+3aP7d/6bVz/ANs9/wBKi8xf7tHsDW6Om/t5v+e5qSDxCw4NcxDde1WIdQ7YrL2JZ10OvnoasQ6+ehrjoNUB5x+FSf2jceorL2ROp1s2vdhUf/CR+1cv9s9/0o+2e/6UeyDU6b/hJ5v7tWYPFo/571x39oe36Ufb/UfpWnsWUdz/AMJnN/z3NH/CZzf89zXD/wBo3HqKX7Z7/pWXsmb6na/8Jldf8/Bo/wCEyuv+fg1xX2z3/SpPtv8A02rH2bF7FnY/8Jjcf896J/GNwT/rhXHfbPf9KP7T/wBmj2Q/Ys6r/hK5v+e360f8JXN/z2/WuV+2e/6UfbPf9Kz9kjX2TOl/4Si5/wCeo/Klm8UXGOJq537Z7/pR5/tR7NG3szpofFE+P9dU/wDwl1x/cFct5/tR5/tWXsDT2Z2cPi2XOPtFWYPEs+OLiuH+2e/6VYhvKx9mh+yO0h8S3GP+PipP+EluPWuL+2e/6VZ+3N/e/SsvZIPYs6mHxPP0xUkPim4x/r/1rlvtzf3v0qT7S3+RUewNPZHVw+Jbn+9Vyy8S3P8Az8VxkN+3r+lXIb9vX9KycWjT2Z3Nn4on7itGDxJPt/4+M1wVhfE5BNa1nN3rkqofskztINfuB0NXYNaufWuasp8jIrQivcDiuS4vZG5b6ncDnHNSw31zjrWdDegjg1Yhvc9DXL7VdjenSuXYb65Iqf7dcdgPzrP+2f5xT2vGzx/KsqtVbI19gaX2ub/nuPzqT7Tdf3R+dZ32z3/Sj7Z7/pWXtTT2Jol7k/8A66l8y5/yazvtzf3v0qUX57/yrlrPY19ii95s3rR5s3rVb7cv979Kl8/2rA0LHmzetHmzetR+f7VJDNWNY66aRJ5s3rUkM1RwzVJ5/tXKaliG8qxDeVnwd6sQd6yq0uxoakM1XLKfByKxo7jbWjDNXLVN07m/aSnqOvatCynyM1zsE5U5Fa9nMB82K4KtIlqx0NvcY+laVrJ/EOtc5Zzd61rCft+VcfmYVKRuwy5GQMVq2F4QMZ59a520k7seB2rWsrgHkGp9tXPLrUbnRWUo6kVrWc3fNc5ZzAnI/CtKxmOOfwr2cBmFdHiYmkdLY33YGr0N9n8PasCOXIyBzWlBLkZr6jCZhX6HgVqNmbUOqd60IdT9q52C4GAR+Iq1bzivrcHmtc4KuFR0kOoTnvVuz1cjj7RXORT5GRV2GXvX1+A4grnBVwh1VvqizDGKmtL3zzx0rl4b2uh0DE4/wr7PKs0+uVjy6tL2OpfGM8iqc2qrCe1WLwAwyDP41zWo3mZea780zD6orhSp+2NG918w8+1Zt5qxPp71Qvb0eXgCqfn84Ar4fFcS11sd9LCGhNq4EnTpUc15OBwB+dZc0xIz3ogvQMW5PP0rxaudVqz1Z1UsKWJZpwMGq856cUCfAzsxQzbR0rgxeLaOpUivOQenbrVSfHarc+B8rHjtVUEjoa8GrVrnVSsUp+1Urn7taU3+p/CqNz92vFxJ6FEqT9qpzQ1cn7VXn7V83iup30yjNwmRVKeA4BJrRn/1dU7j7g+teLU+E76e5mz9qoSnBHNac9Z95Uo9en8RRnU569ajuSc4HarMz5GcdKo3JBIIqaVKzO6kRXBJxmq8/aiftUc01bKCNtEFR0ef7VXmmrqVKxDdySftUc/ao/P9qrzTUezYiSftUfn+1Vp74Dgmq0+rHqBW90jWzL001Vri4x2/OqM+qE/4VSm1PvitLhY1J5yTk1X+2e/6Vlzan3xUf9p/7NDp3NzU8/2qPzv+m9Y/9p/7NRT60o4zV+yFc2ftnv8ApR9s9/0rCn1QD/Co/wC1h/dNa+yuF2bvn+1R+f7Vg/2v/sUf2v8A7FP2LC7N77Z7/pUf20+h/KsX+1/9io/7WP8AdFb6h7KZvfbPf9KPtnv+lYP9r/7FH9r/AOxS94PeN77Z7/pUf2z3/SsT+1F/55/rR/ai/wDPP9an2JlaRt/bPf8ASo/tnv8ApWT/AGv/ALFR/wBrH+6Kq0jT3ja+2e/6UfbPf9Kxf7WP90VF/azelFmFmb/n+1R/bPf9KxP7Wb0qL+0/9mtLMz5ToPtnv+lR/bPf9Kw/7T/2aPtlx6D86Vl3D2BufbPf9KPtnv8ApXP/AGz3/Sj7Z7/pW4/ZM6D7Z7/pUf8AagzjbWGLzHIP6U03YI3Z/Stae5y1aVzhYAOeBViqVvLjoal+2j1/Sv2p1T8FVixgelR4HpUX28e/5VF9vPp+lZe2Qy1RVX7efT9KPt59P0o9sgJqh2H+9UU98TwTUX2z3/SslXYFyiqY1Pjlaj/tP/ZrcrmL+xfSjao7Vk/2zjsPyo/tkeg/KnqbeyfY06D04rI/t4en6f8A1qJ9dXoM1kzb2RoGc5PFJ55rJOqNn/W1GNTYnHnVy8rNOY1J7oAZIqrPe/7P51mz6uSMF6yr3XVg5N1W6oGxuz39v6VXm1WA8ba5m88W28HSb8TWVe+OuMfaK66WFrFe1O0/tmL+5+tEOqQ/3f1rzebxwev2v8hUll4xYf8ALzn2rb6oL2yPS7fVCATjPtVyKYk7lP4Vwul+IPP5+0c963bPWsNxXBWpa3OqlsdJBOQcin5PrWXFec8VYhvK5DU1KKr+f7UfbPf9KxswLlFU/tnv+lH2z3/SizL9mi5UdU/tnv8ApR9s9/0rPlL5S5RWfNqX/Teop9ZGODWnKSan2lf8ijz7f+9WHNrKjj7RUc+tqOK29gV7pu/brX3qKa+ts9a56fxEITxNmqU/iZjx5/5U/Y2F7p1X9pQ/3T+dRf21D/d/WuNm8V+T/wAthVOfxv6TflWv1V9jL2p3p1pgcZ/SpP7Wb0rzmHx0f+fr9KsQeMz0+1Vj9VrmntEd9/azelS/2lF/erhYPGZ6faakg8Zn/n5p/Va4e0R239rj+5Un28f5FcbD4qg6efR/wlEH/Pf9aw9lX7FaHVS3u84P41BPfgHFcxN4nhAwB9cCqd54k7VVKm7Abt5qnkfdFZN9rXO0DmsK98QiYfL+dZ82t4GAK6aVAxNmbWW6bf1qlPrfbH61iz3pnOTVf7Z7/pXWsKgNqfVV7L+FVp74nrVLz/ao/P8AatFSQFz7Z7/pUfn+1V6K0Asef7Uef7VHRQaEnn+1Q/ah/dP5U6igCPz/AGqSo6k8j3rM0CpPP9qjqSgCx5w/u/pR5w/u/pUdSVmaB5w/u/pR5w9P0qOpKADz/ajz/aiigA8/2qSo/I96krM0Cjz/AGog71J5HvSexoIboA4xS0htQTnNS+R71z6mgUVJ5HvUnke9QZkdSUeR71J5HvWSTR2EdSVJ5HvUnke9ZWYEcHepKkhhqTyPepN0rEdWIO9Hke9Hke9ZjJKkoqTyPegAg71Ztep+lRQQEnAqSsnqaF+xn3DNatnN3rFteh+tXoO9cNX4jdb2NyyvSDwa1oL0F+K52GarkM1efV3Bq50EN5ViG8rAgviOAavRTgqSPSshmr9s9/0qT7Z7/pWXDNkZFSQzVxvc6DU+2e/6VJ9s9/0rL8/2qTz/AGrMa3NT7Z7/AKUfbPf9Kz/P9qkrMs1IbypIbysuDvUlc50GqL0jof0qQ35zwf0rKqSDvWdWkO7NqDUD0NWoJwRkVhwd6swS3HQVma6M14ZqkhmrOt5rn+KrMHeucj2poQy5GDV+xmIHIrMg71ch8+uarTOlVUakM1aVjcADn8KyYO9XbYA5J6Vw1ti3UizegmbPTitC0vSOgzWJZiY81qWc3euVUvIwqVTesboMM1q2M4PNc5ZzAHdWpZS5rlq0bHPUZ0lnNjmtGzn+YkVhWc1aNjN82TSonk192b9lNxWhDNWDDKD82PqKvQTHHPXuK97C1Tx6tI3Ib3HSrkF7isOGarllcYP8q9uji7nnVqNjaguMDOKs/awe+PwrJF7g53fpViG4Ir3aOPsctWlY27SY4ziut8MH/RcVwtlPnmu98Nn/AIl8Qr9N4Mq+2r6ng4+kSaxMIbSQZ7VxV5e4lxXW+JZv9AxmuCu5j5vBzWvGWL9jW9kGX0iXzcDyP51R+2eVznPv0pBcYPT9KpXtyfPwK/M6uKPZ9kW57jH/AOqop7n/AJeBVHzR6VF5w7CuH6+a+yNaC9+0RcjmpDcnPArBgvhDNjP4VowzZ5FdNLHKsaeyRYDnqDTLjHGDSfaB6fpUW9fWitVN/YDJ+1VLj7q1bqC4+6teXM66RnzN09qpzHBBrQuQARiqU0NeXiqSvY7qTKlxgHjrVG4+Zwauz9qpTHB24/GvFqYSx6FAp3K5xzWdOdoArRmbJAx+tUJ6y+qKx6FKpZFK5AOCTVCab2q5cDGOaz7yijSNPa9iOaaqc/apJpqr1v7JGpHNNUc01E/aq83n1BoE01V570DqaPP9qrXXQfWtDVK7IZ78kYNUppqsT9qpz9qa3N6RXmmqvNNViftVeftQty2V6jnnAGTUk5HrUc5HHNbjI7iYsc7qrSyHOS1PuuoqGqS0NfahUfn+1FFa0hB5/tUfn+1FFagFR1JUfke9BHtWLuP+RUe40/ypvSo/I96rlQe0YUUvkT+lSfZj6/rRdGXtSKipPINHkz+n6VroL2rK9FS/Zj6/rR9nP/PD9f8A69ZXQ/alaipPJ/6YUeR70/aIPah5/tUfn+1S/Zz/AM8P1/8Ar0fZj6/rSug9qRUUvkXHpR5Fx6UXQe1EqPz/AGqTyOM7qjhs5/N5rWkY1qup5r/bQ9R/3zR/bQ9v++a87/4TRP8AnuKP+E0TtOK/oD6qz+efao9C/tsev6VF/bY9T+VcF/wmQ/56/qaT/hKx/wA9P1rL6ox+2O+/tsep/KmDW4M1wn/CVj/np+tRzeLF6FT+FH1Rh7Y7ubXoKrzeIIBwByK8/m8WeQMib8qz7zxxnrcc+9FLLy/ao9Dm8QW/+RVf/hJR6fpXmE/jjn/X1Xm8c8f66uxYA39qj1D/AISRev2mov8AhK1/57H8q8q/4TS6/wCfj9arf8Jnceg/Kr/s839setf8JYf+ep/Ol/4SmH/n4/WvJv8AhM5vb/vmj/hM5vUf981n9QZr7Y9Z/wCEkH/Peq03ibnAlrzOHxld0TeK7rp51Zf2ew9sdvqnjJoMZnxXPan4yAGBNn61yl3rN1OeuPwqsbgenPrXVSwlgdU2p/FVxN2x9KpTatPN1qp9oHtR9oX2rr9ihcyLP2z3/SpIdT74rN8v3o8v3rL2JR1+jeILiGbJnrr9G8QeleUwTCCQkD8K39M1nyDzPXHi8J2OmlVPU7LWSOlaUOt9iK83svEwEX/Hz+lWP+EsH/Pf9K8b6q0zu9rY9D/ttvX9Kkg1o9N36V57/wAJUf8AnqKl/wCEqb/ntR9SQe2O+/tlPSo/7Zj9K4X/AISn3qL/AISo/wDPYUfUTP2p3M3iC3B96pz+JTEe/wCdcTN4t7Fapz+IJ/8An4z+FKlgA9qdre+KzBz5+KzpvGYHAnzXHT63czdbj8qpT6n3xXXSwAvapHaT+OMjBIqtP4yA/wAK4/7Zc+1Rzyk85/Stvqhn7Q6abxbc9QfwqtN4muMf8fBrn/P9qK09ii7mpNrNxN3qP+1D6VTop+yC5b+2XHoPzqT7Zceg/OqFHn+1HsyzT/tG49RS/wBpTf8APes395Un7ys/ZGhpQazcDpP+FWf+EguP736VjZHrUmR61l7NAan9tXH/AD3NRzalPWfRR7JAWPtnv+lR/bPf9Kj8j3orSyAk8/2qTz/aq9SVAEnn+1Hn+1R+R71JQBJ5/tRUdWKT0AjqxRRUGgzY3pRsb0o3t60nke9Ae0RLsb0o2N6UQO3PNSb29aA9oiKpKXY3pR9mb/JrK6D2iEqSlt1cZwKPszf5NF0HtEO3r60b19ad9nT+8aPs6f3jU2Rp7VieR71JUnkj+9+tJ5Q/vD86yL9q+4ypPJx3p/lD+8PzqTy5T6UB7V9xnke9SeR70vlt/eqSG2ufX9K5bMv2zIvI96kqX7I//PGpfstx/wA8f0osw9syr5HvUnke9WP7Nm/54VP/AGdcegqTb2r7lSpKuf2NP6j86INGnrO6H7Yrww1J5HvV2Hw9cdas/wDCPTetY+6L2xmww1J5HvWlB4em9ak/4RiX1P51ibe1M2jyPetyDw1MOlSQeGwOgqeYftUYkFuT0qT7Kf7w/Ot+Hwt3qSDwoTyIKw9uX9ZMCGBf71WvKU8bq3oPCZPS3qxD4aYjIgrJ1Ww+teZzsMDdA36VYhgb+9+ldBD4YBPFvmrsHhj0tvzrl9quxr9YZz8MNWIfProoPDXf7N+Zq1BoOP8AlgBWOrNvrSOcgguDzirkME/U/lW/DoWe/wBKnh0BjwYfxrlqNi+tMwvKuvSpYIbkD/j1FdDD4eH/ADx/WrMHh5e8QqDVYs5mGK56lf1qzBZzzdK6aHRbcDIOTViDR1btj8a56yGsWczDps9WP7OuPQV039iQf36k/su39azsjT64jmPsE/pVn+x5vWulh01c4Iz75qSG0X+7+tYj+tPsc3Botz6VYh8PXHWui+yN/c/8eqSCLd2o9mjX60jCg0QdSavQaMBzitiGGrMNiSMgVzexH9aiY0Oj96uQ6P3rThsV9KsQ29v1xWPsUT9bRRg0YnkCrkOlN0q3BATwKsw27DtR7Jh9bRBBpXrBV2zsoR0P6VPBGAMAVYgcHORWXssOxrFoWCyI75rRs7OCo4DnNXICcEVy1aLTNXWJYYQDwc+taNlEBkA/Sq0S45FWLbGDkdK8+pQTMVWZo2JtQOevuKuwNagj/Cs6Aeq/rVyCUZ+5+tV7FHN7Tua1uMDFWrUnnmqsHenWoIzkVGpyVTShmq5FKDzWdHMfvDtVmGau+irnLVpF+3nyM1LDN3FUreb5aswzV69Hc5axvaH/AKyP6V6No8Pk6fHz1rznQMzPGw616VZQeTaxiv2ngKlp7Q+WzMy/GM3kWwyPxrzy/uMHOM47V3Xj6YwWsVeeXs5MwANeNx7V/wBtOrK6X7kPP9qr3kw8nmk8xf7tRzIs0WcV+ee1Z7XsWV/OO7OOKZ5/tURnOOBUcs4Hy15dY6qVGwTSL1xViy1IQjyJzk96zpbkZ5FQG5XH/wBasqWK9izb6r5HSwzVIJ8HOKxdM1Yzf6OF/eVoQ3J7LXrqqmHsi5vA4xn3qOeTpxR5fvQU461jZF+xRWuCCBiq0/artwMAYNQSgMB61y1qTubUjJmhqlNbgf8A6605rcbMkc1Rn7Vj7PuddLcz5oapzQ1qXABxmqU1uvpWDo2Ov2sjGvoQTgn9KzpoF6bvzrduYCOprNvLOo9iifbO5lzQ9jVf7H7frWhPET1qn/qqzasbqsmU5rOq81nWh5/tR+4mqfZsPamPNZ1WnsQeSK3PLX+9Uc1qvrR7ORt9aXc5qfST0BqK40ojv+NdN9mX/Jpn2a1/vH8qPZsPrXmcnPphHBqvNo/euwmtB6j86rT6aOgej2TL+tI5T+yx60f2MPT9a6f+zD/z1FH9mH/nqKPZh9aRyk2j96j/ALH/AM5rr/7Lb/np+lQ/2Wv/AD0/SqsL6z5nLf2EP8io/wCxh6frXX/2WP8AngKP7JX1o0NvrDOQ/sYen60f2CPQflXX/wBkr60f2SvrQH1iRyH9hUf2F/0xrrv7Mj/vVL/ZS9jU+0Zj9aOQ/sEf88KP+EbH/PuPyrsjp5H/ACxP5Uf2a39/9KftGZ/WvM43/hGx/wA+4/Kj/hHPeuy/shv71S/2QP7xo9ow+teZxH/COe9H/COe9dx/Z3/TL9KP7M/2qXtWHtTh/wDhHPej/hHP+mFdx/Zn+1Sf2Lb0c7NPaHEf8I571H/wjQ9q7v8Asr0t6P7KP/PvRzsj615nCf8ACOe9H/CNj/n3H5V3f9iL6frUf9iL6frR7Rl+0OI/4Rz3o/4Rz3ruP7H/AM5o/sf/ADml7Qz9ocN/wjRznf8AhUY8M20Ax9nruzpTL826ov7GZuf61vSqPqZe28j8voNauD1Wj+2p/wC5+gqnUlf1l7Fn89N2LP8AbVx/z3pP7ZuPf86qbmHeo97etY+yNDQ/tu4/57fpUc2tXFVqKXs0a3CfU7g8E1Tmmn6VY8j3qPyPetNDf2xVzN/eo8uX1qz5Q/vD86Uw8f6inzGntfMp0Vc8n/phR5P/AEwqPao29qZ9Hke9aP2Kb/nh+lSfYp/+eH6Ue1Qe1M/Y3pRsb0rQ+xT/APPD9KPsU/8Azw/Ss7l+2M6itD+yZv8An2pP7Jm/59jTujb2qKO1j2o2N6Vd/sm4/wCeFH9k3XpWftaPcr2uHKeM/wAH60fZ/Vf1q/8A2Xdf3aP7Ev8A+6aftaPcv2xRDIKsQ3C9j+lW/wDhHNT/AOfaj+w7r0qPaUO4e2I4b2YHH2n9Kf8AbZ/7wqzBodwf+WP40f2JN/e/SuT/AGc39qu4z7bJ/wA/FJ9um9asf2Fcf3x+dS/8I3cUf7P3MfbkHmzetBlmx1qwPDs/Zak/4Ry//u/pS9rhjX2pR86b/np+lR/aP9r9K1/+Ed1D1/8AHaP+EXn/AL361n7bDj9qYm7/AG/0oB5+/wDpW1/wiF1/z0FH/CIXX/PQUe2oB7Uxti+lGxfSt7/hEJ/7w/OpP+EQn/vD86x+tUDX2xzv2Zf8mpPsy/5NdF/wiE/94fnUsHhGcdCPrR9boB7Y5nyPepK6X/hDLj2/OpYPCbHkW4+tZ/WqBt7VHK+R71H5HvXXf8Iaf+eAqxB4Mbr5A/Oj63QD2pxvlTelSeVN6V3EHgw/88T9al/4Qw/88qw+uUQ9scN5Fx/zwo8m4/54V3n/AAhTf88/1qSDwSepip/2hQF7ZHCfYbj+8KIbG4/54V3/APwhg/55j8zUn/CGD/nmv5msf7QoFe1PP/sa/wDPCWpvssv/AD7Cu/8A+ELX/niv51J/whY/54j86z+t0Sfao4D+zX/54Uf2M/8Azx/WvQYPBfc25q1/whfrbUfWx+28zzf+y5v+eJ/KpP7Em/55GvSv+EKP/PGpIPBLdfIrL6+jT2p5j/Y176GrEHh6/wDwr0v/AIQof8+4/OrP/CFD/n3H51j/AGgHtTyv+wLj0qT/AIRm4/ya9T/4Qk/88h+dSQeCW7xVn/aLNPbI8s/4Rmb1NSf8IzN6mvVP+EJ/6Z1J/wAISP8Ann+tL+0WHtkeWw+E5cdKk/4RGb+7L+deo/8ACGD/AJ9/51IPCIzzbmn9fZR5X/widz/eH51Yh8HXHpXq0HhFf+eB/Ol/4RNfQ/nWH9oMx9qzyuHwbc/3xUn/AAhrd5f0r1eDwpGP+WFSf8I4n/PCs/7QYvanl0PgZT/yw/SpP+EHUd/0r1L/AIRof88Kl/4Rof8APvS+tj9qeWQ+B2J4tzUn/CHH/nhXqf8AwjY/54fpUn/CN/8ATv8ApUfXBe1PLf8AhCm/54fqasQeCnx/x7/rXpH/AAjkn/PCpf8AhGo/+eJ/OsfrbH7VnmsHgw9fs9S/8IYf+eA/OvTP+EYP94Un/CPt/wA8P1pfW0ae2PPf+EPb/nlUkPg9uvk16H/wj59RUn/CPH/niKy+tMPanAQ+D26+TUn/AAiDf88q7/8A4R4/88RUn/CPr/zx/Wj62w9qzgf+EQ/6YfrUkPhDHP2f8c13v9gegNO/sC3/AOfU/wDfVZ/XB+1OIg8IKefJ/HFWv+EXtf8Anifyrr/7JH/PrUn9jj+5+tZe28w9qzj/APhGD6CpP+EYP/PtXZ/2P/nNH9j/AOc0e2Zp7Y5D/hH2/wCeH61JD4efr9nrrv7Hb/nl+lSf2W3/AD0/SsvbD9scv/wjD/8APD9Kk/sB+5P5V1MOmds1J/Zo/v8A60e2YfWpHLweHOP9R+tWYNCXrk10H9mD0/WlGmDPT9ay9tIXtWYX9kW+f9RT4dIAroP7MPr+tSf2Z/tVl7Zmvtqxjf2WKl/s22/u1sjSWx1qT+zLr+6Kx9qiecxINJHQtVn7CPT9a1fsdx6j8qP7OuPQVj7ZHR7axn/Yh/dH51J9iH90fnWh/Zn+1Un9mf7VZe2D27MyGxb0/WpIbdun9a1P7PP96l/s8/3qy9szX2xRwPQU+FRg4FaH2Ae/50fYB7/nWfMjTmKX2XPIapPL96t/2YPU/nUn9mr6frRzI29sih5ntUnme1aH9n+/60f2f7/rWNzb2zKtuCc4qXY3pT/I96k8j3o5ma+2FgdueakgZueaWC2yOtWDa4Gd1Ze0YvaiQSMOQKswzOev41Fvb1qTy2/vVl7Y1J4psnIqxBOQciqcHerEHesALkMx7Vdt7jFZ0HerkHerRvujYhmqxDNVOzq5B3rmrbEFyAn1q5DMe1U4O9Wbc7STiub2b7DW5oQ3BzkH8KtW9xmsyGarEHetuVFNJmrbTfNxVuGasy2+9Vvz/anR3OStuaEM1WLMAYA96z4ZquWdd+D3PPq0rnXeEz59zHx35r06DvXnPgGEzajEPevSj14r+gOA6X/CXc+MzL+Mcd8Spvs8UZ9q83uJv3vTPNdv8UZv9KIrzi4mHm9M1+e8cYpf2oe/k1L9yWaP+WVVoZSOQc+1ONwCc7a+LpVUz1vZMgu828vPc+tUp7gkc1Y1MZ5ashpyDkd/aufFndSpE91PtXJ4PYYqCabeeO1RTXGGyRn0qHzSTkj8MV5PtGjrpUieC9MEtbemao08OTXKyynOSPpUllqRspOV/ditsNizR0Ttob9vWpPtLf5FY1neefyDVyGau/2zMPZWLv2lv8iop+1R+d5tE/atLh7NFeftVO8h7VoVXmhoAz5oarz9qsT9qjn7UHQZ88POKpzQ1ot1P1qtP2rmT1MWtLmTdpgYx+tZs0Nbk0NU5oaw9nEn2qMGeTpxVea69q1prOs2/sc80/ZIr2pDDeVJ5/tWfNBcQdRUf2z3/SkbXNbz4f736Um9vWsr+0/9mpP7TH92tDD2dXsaX2d/X9ai+zN6/rVeDVCP8Kk+3N/e/SrMvbLsJ5HvR5HvU3mZ70bIf71HsjL2oz7Ep52frSeTH61Pgf3v0o47N+lZfVGbfWip9nT+8aPs6f3jVsqc8Cj7M3+TWXsEa+0Kv2dv79H2dv79T/Z0/vGk+zp2Y0vYG3tmRfZxRU4hBGd360zI9azFoiSio6PP9qBliiq/nik+2T+g/OgLl3yPejyPeq/9p/7NSfbLf0/WgCT7H7frR9j9v1pv2iD/AJ+D+VSfaj/dH5U7C9tLuReUf7x/Oo/KP979atbF9KPsy/5Na3TM/aor/Z2/v0fZ2/v1PhPSjCelT7FdzT2zGfZ2/v1H5Mfr+lP/AHdB2Y4o9gP2zIxbkHcxoMcTcKKk4J9TUanA6/pTpUr6mTqH5Zf8IyfWj/hGh/z6ivSIfCTdfs9Wf+ENP/PAfnX9Nf2sfg/svI8y/wCEbX+9R/wja/369N/4Qz/piKk/4Q3/AKYisv7Vib+yZ5d/wjX/AEx/z+dSf8I16w/5/OvTv+EN/wCmI/OpP+ENH/PMfmaw/tNGvsWeZf8ACJn/AJ9v1o/4RM/8+3616j/whh/v/wDjtH/CGH+//wCO1l/agexZ5d/wizf88aX/AIQ9/wDniPzr1T/hDfWEfrUkHg3uYax/tNmvsjyv/hEv+mFH/CJf9MK9X/4Qc/8APEVH/wAIO3/PEfnR/aZfs0eYf8Ik3/PL9Kkh8IsekP6V6h/wg4/55H86k/4Q0f3zWX9qD9mjzD/hEgOPKH5Uf8IkP+eI/KvU4PBo67jUn/CGj++az+voPZo8s/4RLv5Bo/4Qz3r1n/hDF/59qT/hEh/z7mpWao19kzyf/hDR/wA8h+dSf8IbP/zxNes/8Ian/Pt+tH/CGp/z7frWf18PZM8q/wCEPH/PAVJ/whw/54ivVYfBp9fxzUkPg094P1p/XkaeyZ5TD4GH/Pv+tSf8IOP+ff8AWvVv+EQH/PAVJ/wh5/59x+VY/Xw9keVQeDP+mP61J/wg/wD0x/8AHq9Wg8KA8i1P1qT/AIRQf8+xpfXzb2Z5N/whY/vfpVgeBV/5416t/wAIifT9aP8AhET/AJNZ/X2HskeU/wDCDt/zw/Wpf+EMP/PEfnXqn/CJf9Mqk/4RL/pnWX9o+YHlf/CDH/n3P/fVSf8ACDH/AJ9//Hq9W/4Rm3/54n86k/4Rv/piaX9omp5T/wAIKf8Anj+tSf8ACCn/AJ4/rXq3/CNj/nhR/wAI2P8AnhWX9ogeVf8ACDr/AM8P1qzD4F7fZvzr1D/hGv8Ap3o/4Rr/AKd6X9oG2h5n/wAIN/07j86l/wCEIP8Azw/WvS/+EaP/AD7/AKVL/wAIwaj64g1PM/8AhDj/AM8R+dH/AAhx/wCeI/OvS/7B9v0qX/hH4f7o/Ol9cQanmf8Awhp/vVJ/wg5/54frXpn/AAj8P/PD9aP+Efh/54frWX1sDzv/AIQ1f+epqSDwanUxGvRP+EeP/PEVL/wj/wDtfpWX1tl3POYPBkXeGpf+EMh/54/rXoP9h+9Sf2H70vrTC55//wAIdD/zwFH/AAikX/PCvQP7D96k/sP3p/WmGh5//wAIp/07frUkHhTHP2X9a7z+yEHBgo/seP8Ayay+tsDif+EV/wCmNSQ+FD1+z/jXbf2ZH/eqSHTI+maPrbNziP8AhFf9kfnUn/COH/n1Fdz/AGP/AJzR/Y/+c1n7aRhc4r/hG/Yf5/Cpf+EaHb+Vdh/Zn+1Un9jw+tHtZCOQ/wCEXHeAflUv/COj2/Kuu/sf/OaP7H/zmsfasv2hyP8Awi4/54D8qkPh1Mf6iuq/s0f3xUn9mf7VHtWP2hyf9hf9MaP7C/6YV1n9n29H9mf7Vbe0fci5zH9if9O4pf7D966n+y3/AL4o/st/74rH2rCxzX9i/wDTH9Kk/sX/AKY/pXQ/Zbf/AJ6H/vmpfsUH98/lR7QNjmf7F/6Y/pUn9h+9dD9if1H50v2KD++fyo9qgOd/siP/AJ4VL/ZSf8+4/Kug+wL/AHf1o+wr/d/WsfaMNDn/AOy1/wCeNSf2Wv8Azxrchtl9Kk+zL/k0/aG3Mjn/AOyV9ak/slfWtz7Mv+TS/wBnj+7/AOPUe0C5i/2PJ/k0f2PJ/k1v/Zz6/rR9mPr+tZe1Q9TE/seT/JqT+x5P8mtv7M3+TR9mb/Jo9qLUxP7Hk/yak/seU8G2rc8iT1o8iT1o9qPUyf7NH/PH9KP7NH/PH9K1vs6DvRhPSsvaIDI/sZ/79Sf2M/8AfrU8of3zUnlr/eoVRHQZn9jH1P50v9k2/wDcP51peWv96jevrR7RAZg0jdyW4qVtNtgcAVeYkcDvSfdGFH41lWqgV/sMPvSfYW/u/rVuisPbGhB9hb+7+tAsWzyv61P+6qOn7ZdgD7H7frUnke9Hn+1Hmw+tZmhJ5HvUnke9V/tnv+lH2z3/AEoNCTy4aPJPr+tV/OI6j9Kk8/2pmhcHlYFHlQ+lV1n4HHajz/auYCx+6o8j3qv+9ooNCxRUGD6GjB9DWYFuio6Mj1oNuYkqSo6PI96DYKkpkAPPBp8APpUezZ0EoODnFSMQTkUsFuOKmissVjVLp1LkkFXIYaIYavW9v5PJ4pmyRDDD2FXIYaPI96kg71i2dLdyxB3qxB3qvAD/AJNSwynt/OsReyRetyDkCrNUoJV6rUsEoHSsDoVFl2F27CpIXb0qlBMe4qTz/ai5kqT7F6GYp2q3a3GVyOT6VmwSFeQc+1TNcAnO2p9o2ZVaVzWhn7jpWjaT4lyawLS4Y53GtXSZsPjvXVg6n7+x51WlY9R+FkSzajEAe9egz5riPg/Cc+f38mu4mOYTX9M8I0vYZLc/Pc00xx5X8Ub3GqSHORmvPbybJI96634k3mdUuDXn97OwuMj1r8L4uxXts0qn2eVUv3BpJMc9Knhl4z+dYEF8cYFaUN72rxcAvbHs+xJbuf8Ac/erEuZ/KrWmmrG1UDAJFa4ql+5NvZWI55vmFU5b4Yyab5+08Cql5N+7zXzld2ijqpPUknvwBgGmfbhjJP6VmTTVTm1PyaKKaR30qbudXoviERS/Z66Wz1L/APVXl8OpmDpXT+H/ABAJ69SlVuFWkdtBORyPxqfz/asOG8rQhvK6vann1qPVFzz/AGqvP2ohmorQ5CvP2qnP2q5P2qnP2oOhbFeftVe45GKsT9qpXFxiswZWn+YDB5FUpjxg1cvTkkj2qhcAMN3Sg46lPUS4Vs8Cq81s3pSef7Uef7V0GPtTOnsQeorNvdLK8H866Bl296rTWof+LBrnqUhusjmJ7S5g6mqc7XPPNb95Z+fWfeWfesvYtHWsUzL+2TwnipIdY7UXlnVOaG5h6gUkkxL2DNSDWM1JDqffFc95ix8460v9p/7NFkHsUdbDrDIQfyNW4L7PIrjINV45Gfap4NYIPFbHNVpXOw80f3R+VIZRjhR+Vc5BrBHQ1Zg1thxW10Zm79q/2aPtX+zWXBqMUw4fH4VZ+1t/f/8AHay9khe2ZaM4Jzz+VG0f3v0qv54/551J54/551l9S8zX24/yDVeayPcVa+1f7NJuHp+tP6ozR1kylPBcQdRVf97WvtX0qLFt61j9WZTuZPn+1R+bN61qfYoZu1V5tMP/ACwX8KXsyiv9s9/0qT+0/wDZqvNps9RzQz9az9kRdlz+2P8AOKs/2zce/wCdY3mzetR+f7VfIhHQweIWHBqW31qAcGuZ+2e/6VJ9s9/0peziFzphqtvN1FHnWvoa5n7Z7/pUn9p/7NaAdPsX0qHY3pXPQazcQ9J6sweJSOAatUxanzJD4Xfr9nx9ak/4RiH/AJ4H866aGzqX7Hb+p/Kv1ariWj8lVNHL/wDCNN/z71J/wjTf8+9dP9j9v1qT7H7frWX1ws5n/hGP+mX6Uf8ACMf9Mv0rp/sdv6n8qTyofSn9aKsznf8AhGf+mP6Uf8Ix/wBMv0rpvKh9Kj8qH0o5wujB/wCEf/2v0qWHw9b9a3fI96PI96x9qGpj/wDCP23/ADwP50n9gQen61u+VD6UeVD6Vj9ZkbGH/YUPpR/Y8PrW55UPpR5UPpR7cDD/ALH/AM5qT+yP+mFbH7qj91R7cDH/ALH/AM5qT+wq1KKPbrsBlf2AvpUv9jW/t+ValFP26L1Mv+x/85qT+x4fWtCij26HqZ/9j/5zUn9mf7VXKkrH2rFZMqf2fb+h/Oj+z7f0P51bqSn7UftEVP7LX/np+lL/AGba/wB4/lVv7SfX9KX7SfU/lWXtA9oin/Ztr/eP5U/+y1/56fpVjzLf+/8ApS/aT6n8qOcPaIrf2Wv/AD0/Sj+y1/56fpVn7SfU/lR9p9z+VHOg9ohn9lD/ACaT+yfp+dSiVT2o81PSsfarsa6EH2P2/Wpfsdv6n8qTz/aipLJPsVt/kUfYrb/IqSig0GfY7f1P5VJ9jt/U/lUe9vWje3rRcXOT/Y7f1/SjyPeiindBZh5UPpR5HvRR5HvRuGwfuqk8qH0oorIYeR70UeR70VuiGH7qjyPeipKLBcg2N6VJ9mb/ACafUlYFe2ZHR5HvR5sPrUnn+1ANsPI96KPNh9aPP9qCdWM2N6VNtFM8/wBqk8/2p3Ye1Y3vt7+tKFIOd1L5/tR5/tWdZ3NfahUlR+f7VH9sHr+lIkseR70eR71H9s9/0o+2e/6UASeR70eR71H9sHr+lH20ev6UASeR70eR71H9s9/0qP7Z7/pQBcoqn9s9/wBKPtnv+lAFyiqf2z3/AEo+2e/6UAXKKr/bPf8ASo/tnv8ApQdHtjS3j+7R9qH9ysv7f7/+O0fb/f8A8drMr2pqfah/co+1D+5WX9v9/wDx2j+1/wDYoD2pqfah/co+1D+5WP8A2sf7oo/tY/3RQHtDa8/2o8/2rEGtsRnP6Un9p/7NLU2Nr7efb8qPt59vyrF/tP8A2aj/ALT/ANms7MDe+3n2/Kj7Uf7o/KsX7Z7/AKUfbPf9KLMDY+2e/wClMGqkHpWP9uf1/wDHaTzj/d/SixobH9p/7NH2z3/Ss22LEnNS/wCke361h7AC79tPofyqL7a3pUf2Zf8AJqWCADgUeyRPtkHn+1Hn+1SeR71J9iP939ax9mae1I/tKep/Klwv979KtfYm9akhsm/vfpW3sR+1KlSwAgHHQ1a+xY6D9afBABww/Wj2AU6tithf736VJ9nX+/VoW7Y+/QQ2PvZ/Cj2Ae1IPJPrUnkn+9+tTeZF6UfaIfT9ay9izUbBZE9BR9j9v1qX7c3979KPtzf3v0rSxoBs2Xt+tStFbZ5qr9s9/0qV5/mPFc9awEqmHPU/jinVAo881bg71gb0rhDD6VMkYHAqOJ8ZAq5bqNpNUkdVOlcLWHrVmD75+lR2wwTTzckHAX9Kk6qRZtgQMGpfP9qpG4AGcVL5/tUukzrp6lzz/AGqTz/as/wA/2qTz/al7Jm1i/wDaH/uij7Q/90Vn/bl/vfpR9uX+9+lV7FF2RrwzbuR19qsrcBu1Yn2z3/SpIbyuKrRNrGxDN3qzbzgT1jQzVchmrjqHMacFwD0NSG+UjAb9KzfP/wBiohec9f0rjumy/ZSsbMd8WIArpfD2J5IiD2xXF2MonOfSuu8JHzpY69TL6V66ODFUn9XPcvhPD5GnyTfrXWXZEMUh9qwfhrY+RovStTX5vJ0m5x/zwr+ocn/c8On5div32NPD/iLeGe/k9hXnt5Nk9ODXa+P5/wDSZT2x6V57qc7edkDHtX8ycSVfbY6qfo+VUf3BL9vzLytatlegR4HeuYmvDWjot761jldXSx7CZ0QuA3QVla31A9asLPyeKr33+rWvdqasowZZiTVO9lyKk1G48ibis+8m718xiqWppR2K95N3rOuJckVLeTd6yb+fmualsephtSyL9cct+lXNN1qezmwTg1zk15+9ohvK7qKR1+xPW9F8QW97FW7Z3leReH9f+xv5P2j93XeaXrXn9a6FoeZUp2OrhlKcg5Hep1ueDgdaxobyrUV4UPHSujc8+rSLU01V5+1STTVXrcCOftVK4t81dn7VSue31oAzbhgQBtqo8w61dvwME/Ss29GCR9K3VK+xhVola6ue+Kj+1BOq5zUVxcbecVU8/wBqapJnm1kjQ88/5FHnH2/Ks/z/AGqTz/an7FGXtCf7Sv8AkVXmRfWmhRj71G0f3qy9mkbFOeyTqDWdeWfet7zPaq8yCXqKHRJ9ocreWdZ09gsPUZrrptNHTbWXe6aMfd/GsfZNHSqqOYuDcwEYP6Uf2v8A7FaV7pYPX86zr3S16frWJs6g+DVWJ4GfapINaJ4xWNPb3EH3hUX2z3/Stbi5DrINaIHymrsGuDO1p64s6qT1FSQa2eh5o0OWrhrnfw6x2q5DrEFeeQ66emKuQeIGHBrS3Y5/ZM7+G8FPMwIxt/SuKg1s9DPWjB4hU8Gq9iTqjqPtK/5FG9fWsaHXIP7v61Y/tY/886r2Zt7U0ftCen6UfaE9B+VUv7Q9v0o+1f7FHsg9qXvOH939KjxD6VD579hR58npWPsTX2o6ezgm61Xn0fg1N58npR58npR7EPamVNpNx6/pVee1uIev8q3ftCf3aiuPsuOOtY+w8iDn53usHBqK4ubvO1T171uT2cE3Wqc2m470vY+QGZPfEw1WivLgzZLfhitafRcDgZqn/Yc/nferSlSscftWeY+f7VJ5/tVeGapPP9q/RD809qyx5/tR5/tUfn+1Hn+1Zm5J5/tR5/tUfn+1Hn+1BHOixUdR+f7UUFliiq/n+1Hn+1R7BdwLFFR+f7UU/q9+oFiiq/n+1Hn+1ZeyZV/Msef7Uef7VXoqyix5/tR5/tUdR0AWPP8Aajz/AGqOigCx5/tR9s9/0qvRUeyZN/Mk8/2qTz/ao/Nh9aPP9qvYok8/2oqPz/ajzYfWk9gJKkqPzYfWj7Z7/pWA+dElSVT+2e/6Uf2n/s0Flyiqf9p/7NH9p/7NAGhRWf8A2n/s1H/af+zU8pXMan7qpP3VY/8Aaf8As0f2n/s1lYv2xsef7Uef7Vj/ANsf5xUf9sf5xRYPbG55/tUfn+1Y/wDaf+zR/af+zRYPbG/9vHv+VIb8EY/pWD/af+zR/af+zW2pPtDfF8oH3v0o+3L/AHv0rnP7T/2ak/tP/ZrP2S7h7VG59s9/0pf7VP8Ad/SsL7Z7/pR5s3rRYZsf2n/s1J/af+zWH5s3rR5s3rRZmt0bf25f736Ufb1/vfpWR5s3rRU2Q/bI1Ptnv+lH2z3/AErP8/2oosjL2xof2n/s1H9s9/0qn5/tR5/tTsHtTQ+2e/6UfbPf9Kz/AD/aj7Z7/pT5UI0Ptnv+lS/bm/vfpWd9s9/0o+2e/wClZexYXRofbPf9KPP9qz/tnv8ApUf9p/7NL2TD2hr/AGlf8ij7Sv8AkVif2x/nFH9sf5xWvsjU3PP9qPtnv+lYP9uH2/Kov7bb1/SsTbmR0f2z3/Sj7Z7/AKVzn9tt6/pUf9tt6/pWuoro6f7Z7/pUc15XOf223r+lRf2x/nFZDudR/af+zR/af+zXJ/2n/s1J/af+zQK50n9p/wCzR/af+zXN/bPf9Kj+2XHoPzoDmOn/ALbX1/So59aGCAawPNm9ak82b1oDmZtHViTnd+lR/wBqz+tZMHerHke9Zmvti7/aN2O4pn9o3fqKigsO5NH2A+350eyH7Z9iX7Zd+g/Ojzbr1ogsQpzmrP2Sf+8KPZD9qyPLf3f1qSAtz8v61Yg00HjJqzDpnbNHsn2J+tIpZb+7+tSeS3p+taMOmds1JDZwZp+xfYPraM6FPYfnViFPTH51d8qD0qT91Wn1VdzL62uxS+yXPtUsNmfT9auUUfVUH1sjhsR6CpIbIdQKPP8AapPP9qfsWL2rJYIYewqXcg+9/Sqvn+1MF8RwD+lY+ysbUqxbyfWjzz6VT+2e/wClH2z3/SszU0PP9qk+2e/6Vkz6gOgqtPqx6gUjoNn+0Pb9KBqO3mubn1s9AKjn1sngUal+yOoGtgDH9Kj/ALc9q5mbWO1R/wBsf5xR7NG/JE6n+1F/55/rR/aqj/ln+tczDqq9f0qx9vWbvWPsTo9izb/tf/YqU3ykH5v0rFiuGzwasQO3PNRZmvsjXhmqxB3qvDDVyGGuEgmgk68VYgfORjrUMHepK19ijs0LVu4A+7Un2r/ZqqL0EZz+lBuAO1LkO1WsXvtCUeeg5ArP+1f7NR/av9mtvqxZpGfJzij7YR0P6Vmfbn9f0o+3P6/pWnsgNX+0Pb9Kj+3/AOcVQ+1J61H5q+lL2KNDV+2Hsw/KpPtnv+lY/wBs9/0o8/B6Vn7JmxtpefKOf0qeKb5/xrHguMLx2q/Zz5fIrhqtGqdzXhmqx5/tWdbd/rSXN4TXk1n0Bq5ek1D5sCo/tnv+lZ815UUd7/CO9Yqnqb0lodNpc5E2T6V3/gwGeSMe1eaaNN5sv4V6p8MovPuovWvoMppXxyPOzN2oHv8A4Gg8jw/Hk1J4zm8nRLirfh63EGk22f8AnjWX4/mMGgSAdq/oyq/ZZFY/KqT9tjj59+IV9/pUnXFef6nMfO4rs/HUyi8krgNUm6Zr+Ws6X+3n63lVK2HE8/2q7o97++zWFNNT7S9MMuB2rHAaV0dVZaHdRzfuzUd3Ocjms60vB5efWrE0pHUV9eldGNzH1rj8Kwp5+jdq6HWzmBT781yt4fs8ufX3rxcwpAnoQ3k3esS+nyc1o3dwTWLeTV5TpM9DC1kV5pqj+2eTzVO8m71WN8B3/Sronp0m7mzDeV1XhLxNn/R7mvPGvSvf9Ks2WqCGXz4DXohVptHuWlaqZzg1rWd5XmPhLxZ50UYNdppeqHpS2OGrSOkEpDZ28UrTHHAqhDeVJ5/tW9J6nD7Isef7VXn7Uef7VHW9IS2Kc/aqFxb4rTn7VSuug+tdZzXMO+BI49qzZG8oYPStfU+1ZM4D4NWlY5KtPXUrC9wc5/SpRfA9T+lVLsKOlVDMQeRSdFM4KlM2vtI/uUfaV/uVmfak9akhul9KPYoxuavn+1R+f7VT84/3f0o84+lZeyYFqdxx8tV54xKPu07z/ao6z9ii7FG80/3rNvdH9Grcn7VXmho9j2L9qcte6eRwR+NZV5p4/uj611s9iDyRVK90ojoaPZ9zX2i7nHSwTQ/eNV7nJwSK6C900qQR+dZV5pvb9aXsjWlikZ/2zyeas/2oOPlqtLZE9qpTm4gxgUUqVzq0qs3rfWZjw3SrkWuFTg/hXLfbPf8ASpPtnv8ApW2xlUoo7CDXiKtW+t46z1xUOqHv+VTw6xP18/j0xQ7dTlq4U7+HxHkAGbpWjBr4Nedxa8Omav22vjGCal0jlqo7yG/tpqsQ3S+lcRDrHarkOsdqXIzH2rR1X2r1WpPtX+zXOwa8Ohq1BqAPOfwquRGvtrGt5/tRVCDUx1K/rUovUz/9aquh+2LAuuPu0eZ7U3z/AGqPz/aufmQe1Jt4/u1HuH9wUzzVPO2jzF/u1t7MPbI8Mg71YrF/tf8A2Kl/tYf3TX2lmflxq0ef7Vlfbl/vfpR9uX+9+lKzA1fP9qPNh9axvt49/wAqPt49/wAqdmBs+f7VH9s9/wBKyvtQ/un8qi+1H+6PyoswNv7Zb+h/Ok+2e/6VkfaW/wAij7S3+RU+wKszX/tP/Zo+2e/6Vj+f7Uv25v736VfKdRr/ANp/7NH9p/7NZH25v736VF9s9/0o5QNz+0/9mj+0/wDZrF/tY/3RUX9rN6ViLmRv/wBp/wCzR/af+zWB/azelJ9s9/0oFzG5/af+zR/af+zXP/bPf9Kj/tP/AGan6v5lanR/22vr+lH9tr6/pXOfbPf9KPtlx6D86Pq4anR/22vr+lR/22vr+lYHn+1HmzetH1cNTf8A7bX1/Sj+219f0rAqT97R9XDU2/7bX1/Sj+219f0rI/e0eVN6U/q6K9qaX9r/AOxR/a/+xVLyLj+7Un2C5/vCj2EBadi1/aw/umof7Uufal/sj/bqT+yP9us/ZId/MPtt3/cH50fbbv8AuD86m+x+361JDZ1Hs5B7UreddegqXzZvWrH2P2/WpPI96PZyD2pT/e1J+9qx5HvRR7OQe1K/lTelSeR71Y82H1o87yq19ihXRH5HvR5HvUv2y39D+dR/2jb+pp+xQXQ/yPepIYar/wBp/wCzUf8Aao9BR7FBp2LkMNSeR71l/wBsj1/Sj+2R6/pS9ihmp+6o82H1rH/tkev6VH/bI9aPYGxuebD60v2y39D+dc5/bntUf9ue1Z+xmB032z3/AEqvNqffFc5/bT/5FR/2w/8Az8Vr9X8zTU6P+2P84qOfWO2K5r+2x6H8qP7cHv8AlVWF7NHQf2ov/Paj+3B7/lXN/wBrD+6ai/tf/YqfYGvszpf7Zb+7R/bLf3awPtnv+lR/bR6/pS9ia+zOg/tj/OKjm1jtWN9uX+9+lL5/tR7AWhqf2n/s0f2n/s1n1JS9gVct/bW9KPtrelU/JuPX9KsQwXPXd+lR7Nh7Ul80f3R+VJ5o/u/pTYbW67H9Klg01zxn8arUXtWOog71NDpU/rV2HRV64qfZMz9sVPI96k8j3rQg0cDoKuQ6R38il7KQvbGPDDP1qSGznrY/sz/aqzDZW2fvfpU+yl2MvaGNDpnbNWIdM7ZrU8j3qTyPetfqpl7Uz4dM7ZqxBpnbNXcr6frRlf7v61P1IPaorw6U1WYLIjkJ+tSfav8AZoxj+D9a1+rMFVC3t4u5I/GpMP7/AJ1H9q/2aPtX+zT9gw9qyapPP9qpeanpUnmL/dqPYFF3z/ajz/asue9J6mj7Z7/pWlkBqef7Uef7Vj/bPf8ASo/tnv8ApWPKaGx9s9/0o+2Y7/pWSb8g4/pQdWyMbKwujSxqm9A6n9KZNeVkrqSjkrzVa41ksa5LlUaJstqw7Co5dWLctXM3msjOD+VU7jxJjhR9aep30qSOt/tZvSo/7Wb0rjf7eP8Ad/WpP7fxzj9afsWdPs0dbNrHaqc+scYNc/8A2nn+Go5rysfZM19kbc2qjGf0qP8AtYf3TWRDN5tWKPZM1LJvZ5uKtQLPjn+dUrGJ84z+ladlaMBxT9izR3JbFWBBI9a1rOHtUdlaA9K1LKyyaXshqs0FlZE9BWlBA46CooIGHIqzB5nNZeyRl7UswqsXarHmL/dqj9pb/Io+0t/kUeyRr7Zl7zF/u0eao/hqj9pb/IqP7c3r+lHs0HtmaH24+v6VH9uPr+lZ094DwTSeanpT9mjrVZmn9vRe5H4UwX9v3BrL+0Kw6fpQLhccVt7E1pVTR+0Gl+3N/e/Ssn7Sf7ho+0n+4aXKzb2po/bPf9KPtnv+lU/P9qDPgZxRZnR7RGh5/tUkM2OlU4O9XIQQSDXLVqqJv7U07T7n4mtCC4BPFZUH+rNWhOYeQeteJVLTsXbi9yTk1SmvT61XmvfWs+a8rjNbt7GnPfKR1qSxnEwyB0rE8/2rT0uf970/CqdLQ9Glax12gf64/Q17J8JbIeZFheTXjfhM+fNGK91+EFmPOjr6Dhul7bNKR4Gf/wAA95sYfJtIrfHSDrXN/EycQeHsDqa6ROn41x3xYm8nSo8+9fvGcfucqqn5dl+uOPnf4gT5unrgdSm9a7L4gTf6U9cDqU3rX8vZt/vx+yYD+AV/P9qdHPyGHpVC4m+WmtP047VnR+Izxb0Oz0W9aaLjvWkJ3zyK5jw/e5HJregnYQ+1fbYVXomTq3QXs3nQ5ArlNcPkyiuin7Vha8M8Y+lcGPwpl7SyMGScA81lXvGeKuTjBxWfeTd68D2SZ10Kpl6n2rHmm71qangYFY14ASRjpilSuj2aNUaLwZ5P6VJFqgzwOPSs6aao4ZvKr0ae51e17nV6LrU9pLxcV6R4Z8Si9hjzPXisN5joa6fwl4n/ALMus/8ALM0jlq0up7bZXxHSr1vcZrkPD+tfaIs1sQ3lBhfozoPP9qj8/wBqoW85zgVMtySCSOldVLUw9k7Es/as+ftVue5AGRVSftXZEwKd5WVcw/LWzP2rKvuVOPauiRy1TJuid3WszUIelbbw/NVC5h6VRyVDI+3gHr+lWBd453/pUF7AP+PiAVS+3NbnIPHfisfZI8ytSNuG9k7VJ9sk9f0rHg1AdDUv25f736Vr7JHHdpmv9sj9f0qXzF/u1j/aV/yKs/bPf9KPZo1Vcv8AmL/dqPYvpUH2z3/Sjz/aj2aH7dD9i+lVp7Y9qeblgcf0o3t61AOsUL6wzyBWdeaX5wyK2ZWJIBplxb9xWFWl1Qk2jkrzSsdDWVe6Uen6iu1msCetZl7p+Dtx+NNMulWrHDX2l/ZzgN1qnM1xDweD611t7pgJww/Gsi+0ll4U8VR00sXfcxvtK+n6VJDfr0BpJtKXpvqnNbTQ9WFB1e2Rfh1Hn+lWYLtuzViCc44T9aIby4x9z9ar2QfuTpINcuYDjHT0q3b+IgRzXKxXYIxUovSDgH9Ko5atK520Gtr0q7BrORXAx6kYDnqBUtt4iuOlaeyRy1qR6DDrfb7T+dXodbHTbXn8HiEdCK0odY96w9ijlujuYdSXrn8MVY/tJfX9K4eHWW9avQay3p+tHsbC9ojqvta/3/8Ax2jzl9f0rCt9ZhHI61L/AGsafshe0R4V5/tUn2z3/SsuG8qT7Z7/AKV9r7I+A9san2z3/So/tnv+lZfn+1Hn+1Hsg9san2z3/Sj+0/8AZrL8/wBqPP8Aaj2Qe2ND+0/9mj+0/wDZrPorLkD2xof2n/s1H9s9/wBKp+R71J5HvWvsg9sWPtnv+lHn+1V/I96k8qb0rHlQe2JPtnv+lHn+1H2P2/WpPsft+tHs4m3tEV/P9qKsf2Z/tVJBphPArb2Rj7Yp5P8AkVJmb/IrTg0pTxirH9kr61Hs2TdGJ5HvUnlTelbf9kr61J/ZK+tPQr2xgfY/b9asf2Z/tVsQWVuDwKk8mCDpT9mHtzIg0sn/ABqX+yT/AHhWt+6o82H1pXLKNvpSkdam/sy1/umrP2y39D+dH2y39D+dZ+zFp3IoLO3P3al+x2/qfyqr/aw/umov7X/2KPZBZGl5UPpR+6rK/tZfSov7W+n5Vp7Fl+1ZtebD60v2y39D+dc/PrJJqL+2T6/pS+q+ZtdHQfbLf0/Wj+07X+8a5ebWP+m9V/7dp/VV3C6Ov/ttfX9Kj/ttf8iuU/t0f5NV5tfHrWn1VF+yZ1U+tnoBUX9st/z8Vy03iM/89z+VVv8AhIn/AOetNYUv2Ujr/wC2m9P0qL+12/5+P1rkv7dqP+2P84rT6qzb6q+51n9sf5xR/bH+cVyX9r3Hr+lJ/aF1/fH5U/qoeyZ1c+sg8YFVv7Y/ziud+33H9z9aj+0n+5R7EXsjo/7bf0/Wj+1m9K537So//VUm9fWsvYs29gbX9vn0FRT6yTwTWVkeoo3D1o9kaezNH+2Z/QflSf2jceoqhUkFHskOxY+2e/6Uef7UeR6GpIYaxMfbIKKkhs6sQ6Z2zWYe2K9SQw1ch0ztmrkGmE8Cgj6yZflz1J5J/vfrW1BonfNWINEHUmgy+smH9kT+7+tWYNNAGAK3IdKXpVmDTAOBR7MPrLRgwaaScB/0qzDozdd36Vuw2dSQ2dP2TM/rDMqHRR1xVmDRgOcVqQw1J5HvS9mhe1M+HTO2asQ2cGasVJWXsYh7Ur/Y/b9asQw1HUnn+1b+zZlzokg71JVfz/ajz/aj2bDnRYo8/wBqr/bPf9Kj+2e/6UezYc6Lnn+1Hn+1U/tnv+lH2z3/AEqSy55/tR5/tVP7Z7/pUf2z3/SgDQ8/2o8/2rP+2e/6VHNqffFBoaHn+1H2z3/SsebU++Kjm1PvigXsjc+2e/6UfbPf9Kw/7T/2aJ9TA5NK6L9k+5qTXlV/7T/2ax5tY7Vnzax2rG7NPZG5NrHaq82vdq5q+15ejVlXHiEDpPWaoHoUqJ2x13AzikGvZGcfrXCf8JEcZE9Srr3HNOrhDr+qeR28+rsePtI/Kq0+rseN/wClcxDq5HJP6UTax3J/DFZ/VGka+yRr3Gqbe34VmXWqAN/Sovty/wB79KrBtowRUqk+ppStcvfbPf8ASpIZqght29KuWVgwOcU7M19oi5Zq3pVyG2bpin2VlxWtZaUB941i3YyVZoq2Nhx8orRh0pv+ferNnbe361oQ23+z+tYttke1K1npbdP1rRsrBj1qSFfb9aub/QU7B7UZb2+O9XrdcgnNVPtX+zU324/3BVOizL2hb+1D+6fyo+1D+6fyqh9s9/0o+2e/6UvZIr2sS/8Aah/dP5Ufah/dP5VmfbR6/pUc16PWj2SD2sTX+3j3/Kqs98TwTWd9s9/0o8/2o9khqrEuTXlR/bPf9KpG5I/gqL7V/s1t7N9ja7ND7R/tfpS+afWqHn+1Hn+1P2Z1K3c0POHpUnnD0NUxcA9BRUm3ti2s/GCOasw8ZqlAAWJB6dangb5iprnqnXSqmlp/3vxNXIO9Urbv9auwd68Ktud1PYsef7VHNeVX8/2qveXlcNXRmhJNegDk1TlvQR1qvNeAjBquJgOAKz9lodtLRmpDNWtpU370k9q52zm71u6MxmlC1Z6VKkeieBof30eT2r6D+Clnm7jyK8E8ARDz46+lPg3Z/Z/LGa+q4Mpe2zSkfJ8UVbUD08dOlcD8X5R9nI/6Y13y9BXnPxmmO2v2DijTKj88yXXHHzp8QJgLqXjvxxXnmpTHzeK7rx//AKySvPdS4kJr+Z8f/vh+zYT+CULicnGaTz/aq885Jyaj8/2pU1ocmLqnReH7w+cPpXTQzfuq4TRb3ybvOOldnZzDyq+zy3+AcS3LE/asrWof3WQfwrRqlqZPldO1bYqldGNWrbQ43VMM5X0NZt5zx+YrV1v5ZQwrGuRkfyr5KrSZrSq2RlaowOAD+NY14drHHtWveDH6Vj3hzWCVmd+FxbuZ801V/P8AapLyqc01ddLc9P2ty5DeeTVyzvaw/P8AarEN55NdV0aKtY9H8DeLvJm8mYV6Lpmp/aIc14HZ6l5PNeieDPFv2yLM/wDrKz1ROjPTYr8FcYq5Hcbq5qz1Lzua1IZqVImrc0PP9qjn7VHDN5tFehQ2ZzVRLn7tUL3ofpVu5+7VSftWlHZnLU1ZTn7Vnz9q0J+1U5+1dR55k38HFZOpWfaAVvT788VRngI4NbKm2c9rnPG4EPU9algvcdMfjU15aHPn25z7GsueYwdOlDos8mtSNb7Z7/pUkN5WNDfr6/pViG+U8A/pR7FmJtQXZPSpPtTD/wDVWVDe1L9tXsf0peyZj7U1fPjPajz4/Ss6C9U9RU3mL/drL2Rr7VFqeRickVHtYdqb9pX/ACKPtK/5FHsjT2sgnReOKq3Fvip/tbf3T+VRXTPkD+lP2LGrlCaz86s+80wHqPxrcqvNDS9k+xmcreaY/T9ayrzSm6Y/Guynsj1BrOvNNk9fxrL2SBVbHDT6U3T9apzWDeldle6WDjJrNvdLx3z71B1LGROc+WAYP8qZ9oER4NaF9ZjHI/Ws2eD0HHrXRSVzWnikJDe1J9s9/wBKz5zjFRfaVi7/AKVt7J2NE3Y2je88N+lSQapc9M1gwXZHRvzFWftnv+la+xsHs7nRw+IAflBP4VdtvEPG1hzXKC+weP5UG9J6n9KPZHPWo6WO9ttZ52nmp01jBwDXCW+t3ERwauw+ICDjB+oo9ku55VSm7nGwO3PNSbpz3q3DpnbNWIbOvqfZn577Qy/I96f9juPUflWr9j9v1qT7H7frWfIVZGN9juPUflUv2O49R+VbX2A+351L9gHv+dXdGeiMT7Hceo/KpIdM7ZrX+yj+8fzqXyPelzBzGPDpnbNWv7JP94Vd/wBH9v0o8+3/AL1ZODNitBpJ6E1J/ZH+3Uv2+2/umifVbfpR7JgH2Ff7v61L5UPpVX+1/wDYqP8AtY/3RR7JgaXke9H7qsj+229f0qP+229f0rb2LA2/P9qPttt/k1z/APbB/wAio/7YPp+lH1VgdH9uX+9+lRz6qOornP7YPp+lR/2ufT9KPqpvyo6L+1/9io5tW77a5qfV1H8X6VF/bS9if++a2+qeQrI6X+229f0qObWm6faK5v8AttvX9Ki/t3/a/StPqjN/ZHQTawf+fj9ajm1g9PtFc/8A2ncj+IVH9uuT6VqqdEPZM6H+1uMk4/Coxq5PT+VYXmz4xmjzZvWj2COinSua82sqP+Xiq82tL/z3rM/e0eR71FkaexRe/tz2qObW8nGKq1H5/tTH7FFifUp5upqt9rn/ALopnn+1V/P9qDpSsW/tlx6D86Z5s3rVfz/ajz/agY7D0Yf0ptFa8xr7Ufhv736Uec3r+lRgMRnd+lWDbtj79c/tx+2YkCnn5zUm093NESc4AqTy88EfrVmP1sjKknO6pNh/vVYhsO+fwqzDYj/Jrl2M3jF2KkEBPAqX7Ma0INJA43VZh0Qdd1Z3SMvrUjKhgXpuqx9iX1rYh0hf7v61Yh0cdRa09TJ4mXcw4dNXpj8c1Yh0hey/rW9Bo79c49quQaYehb9KDH6yu5gQ6P3qxBo5PQV0ENnbjpVjyPesvZGfOYsGiHqaswaSOhNavke9Hke9Hsh+0KcNkB0FWIbOrO5vWpN7etHsjH2zK/2Fv7v61Y+wN/d/Wje3rR9pb/IpeyYaj/JP979aPJPr+tR+f7Uef7VuMs7W9KPMb+7VLz/aj7Z7/pS9nJG3tC55/tR9s9/0rP8Atnv+lH2z3/SoMS59s9/0o+2e/wClZ/n+1Hn+1AGh9s9/0qP7Z7/pVPz/AGqPz/asro0NDz/aj7Z7/pWf5/tUf2z3/SjmQGh9s9/0qvPqgHJrJvtbzwKzpdYHefNQ3c6adK50f9qD0qT7Z7/pXH/24KWHXR0z9OKzOv6r5nX/AGz3/SifUwOTXMQ+IG6faKkm1VutBj7NG1LqgPQVSuNa7A1jT60SMVk3ms9VE/NFjWlSudPPqpPeq0+vYOftGa5CfxD2Aqv/AMJB/s/rXUqTOv6o2dqNbUDr+lE2tL/z8VxP9vt60f2+1ZfVfM1+qHWz61gf8fNZt7qhPOPwrKGtjnNUZtWOc4/Cj6qFGi0W73UyTz+VZ815Vae/WbqaZXV7Ox6JY+2e/wClXIbyes+GH97WlZ2O75v0pVSfapFuGcq1XoPnFMsbHsTWlY6UAdwP41zVtzJViOC18zrzV6GxHUAVcs9N/wD11oWem/8A665jL2vmU7PTf/11q2Wllv8AGrVlYgHOKvQWJPIFZmXtewyx0soCSc+9akViGO4GlgtwOgqzAAMmuerSsP2w+CIxDhf1qxlv7v61X85vX9KPOb1/Sn7Jox9qXPtDf3KPtDf3Kp/a2/v/APjtR/a2/v8A/jtHs2HtTR8/2qOa8rO8xf7tHmL/AHa09ijX2qLv2z3/AEqM3nHX9KpeYv8AdqPzF/u0/YoPaov/AGj/AGv0qPf/AJxVTzF/u0eYv92j2Qrlv7V6rUf2r/ZqHz/ajz/asfZNmxOLjd/DSfadvy7ah8/2qMzknJFbKgmdVLVFzz/ajz/aq/n+1SVJsWo5utTQd6qxfxVNB3rnq6GlN6F+Lo1W4P8AVmqcXRvrVyD/AFdcNY9KnuWLXoam8/2qr9oLKcimT3xBxivPr62sd1F2RZmvKz729xUN7dZ6t+lZU12FPJ/SuH2Suae0RZm1D2pbefIzWab4kYz+lSW9xtrX2R3Udzfs5j5tdF4f/wCPj8K5XS+QTXXeGP8Aj4/CuOqe4v4B6r8OISJYz2zX0v8AB6xMUfnEf8sea+ePhlZfvYsGvpn4YWXk6eTX3vAdL/bD884tq/uTqx0rzb4zfek+pr0lfu15l8X/AN8bj2Nfo3FH+4nyOQ/78fOfjn/WP9K881v7p/CvQ/HP+tf6V55rfSv53zCl/tB+yUf4BiT9qr+f7VJP2qnP1FOjueTW/il2ynIm612emzedFHXn0E/JrsPDN6Z4a+iy3Q5n3Nt5+nFR33+rWiT/AFQpbkZK17dUwqnK6/AfNwDj0Nc5e3GTxXWeJoFJxXIXq8evTPvXy2KpexrGNKtZmdeTjBB4rIvRmtK8Ujkis+4Az8prz3TaZ30quplXee4rPn7VoXhA5JrJvGUfdralSPQpYoh8/wBqkhmqtcYbAzUX2r2/SuhUrnV7U1obytnRtfuLK6jnt65W3uN3artlegjg1r7BoPaHtnhjX7a8jjuK6izvK8Q8G+Jv7MvPI8/93XqOman58UQ+0VzVKZ1XuddDeVJ5/tWPZ3o8qrkM1XTOWqW1n+XpUE/akWf5elMmmr06TOTqVrjpVKX+Gr1x0/CqMv8ADXRS3OXF7lWftVW6HQ1cmTODmq1wu0A5rp2Z5ntDOmh7GsbULP5Rn8K3Z4cHBNZzw/LUmdW1zngCh9qTz9v8Oc1cvLPbznOeorMmJtzjqKlps4qtKxbt707gM1bhvKxFn+YcVPDeVq3ZnJV3NyCY+lWIbysGHUParAv8nH9Kn2dyNTa8/wBqk8/2rKivjnAWrEGosOAtS7h7Uvfaf9kflR9p/wBgflVbz/ajz/atLIXtESVHR9tb+5R9tb+5Wd2P2pHP2qK4t81LRP2p+zQzPmsh3FZ95ZDritiftVeaGp9ijO5zN9phP8P45rEvdLKkAoPrXaS2Ld2rPvbEkct+lZezZPtTir3S/Xj3rIvtP8jnH5d67W90pgeCT+FZV3pmeeh9a116HTSxRyc+1uKjEzQ8AVuXulhhtIrNnsHHI5rVM66WL7kP2lf8ipINRA5AqjNG3QmowzZ5Nb+xbNvatm19tO/Gf0oN8AcZ/SsJbzLA5/SkTU/mzinZE1bHZwd6l/0f3/Ssj+3Pao/7c9q+l9iflVzc8619DS/b7b+6a57+3Pao59bPQCn7ELnQ/wBq2/oai/tY/wB0VzP9uH+8PyqP+3D/AHv0pfVA0Oq/tY/3RVWfUyeTXPf26n901F/bo/uCq+qWNFTZ0c2rr03fpUf9rr/e/SuY/tl/QflR/bL+g/Ktfq6H7OR1H9p/9NB/31VebWx021zX9tt6/pUf9p3X96tPZIPZM6SbWuMfrVWfWlBxya5wXdwei/rTTPOBgNk+tHskaU6djov7bH/Px+lR/wDCRQf3v0rCxP8A3/0o5HO6tfZo19mbP9sn1qP+2Lis2Bz/AHakhckHApWQ/Z+ZZN9LMcE0efJ61AZIQcZqTzYfWsfbIzI6k8j3o8/2o+2e/wClWT7ZjvLHp+tSeZ7VT+0f7X6Ufaf9r9KVkbe2sXd6+tS1j/bPf9KPtnv+lT7VD9qzU82H1o8/2rL+1n/Io80/3T+VPlL9t5l/7ev979Kj+3r/AHv0qj9oX+5UmZP7v6mstzX6zJEv2r/ZqP7V/s0nlP2NSfZLv1/Sixl9a8xn2k/3Ki4/ufrVj+y7j+7VmDRJ/Wgx+vIzoYR/c/WpDAMdP1rWg0QdasQ6KvXFGgvrpiQ2dWYdKbp+tb8Oj96uQ6P3rjJ+so52DSR0NXodLHp+NbsGjE8gVYh0pun60h/WUYUGj+gqxDo/et6DST0JqzBYgcgU7NmXtmYkGjk9BVmHRW6/Z61/I96k8j3p8rF7ZlGDSR0JqzDY22eBVmjz/ar9kY+2fcj+x+361J5HvR5/tR5/tR7JmhJDDUlV/P8Aajz/AGrICxUlU/tnv+lH2z3/AEoAuef7Uef7VT8/2o8/2oAuef7VH5/tVPz/AGo8/wBqALnn+1Hn+1U/P9qj8/2oAuef7UfbPf8ASs/z/aoZ9QHQUAaX2z3/AEqL7cv979KyJ9TJ5NU59YJPNKqzrpUtDf8At49/ypP7X/2K52bWO1V/7X/6b1yHV9XZ1f29fX9KPty/3v0rnIdS/wCm9XIbygyq07s1/ty/3v0qP7ePf8qzPtnv+lRzan3xT0M/ZRNKfVj2FZt7rJPWs+81IdScVj6nrKnoK19kdNKldmhea8OhrGvPEAJwbisbVvEKrjFYt5r3bFdVLCM9mjRVjq/+EhU/w1J/bg/57muG/tiT/IqWDU27r+FP6mzf2R6BDrS9M1J/ba+v6VxdlrOeMVZGqYOdtL6o10MvYo6S+1nArFv9TPH8qpi/568fSqk023JY0Ki2wo2JbzWccA1WGs55z+lUrxwMjHTFVa9WlSO+nsa0GpkHDDrVqG8rFtSMGtKGH0rGrSTCpaxoQ3pHQ1L9ob3pljZleduauWenHoFx71Opze1RWiiBGAKuwaWcbcfjWjaaceifnWjZaPjpXFVXvGH1tGdZ6YMYrWstFatCx0fBznHvWrHpbE4zx61y1avY5Pa3M2z03/8AXWpZaYTwPzq/BYLD0GauwWQHQVymftSrBp56mr0NkB0FWPI96koF7RhDEexqyDzyai8/2o8/2oD2jJTgn7/6VJ5y+v6VS8/2o8/2rL2SD2hc8/2qPz/aq/2z3/So/tnv+lHskK7Lnn+1Hn+1U/P9qj8/2rr9iw17l/7Sv+RR9pX/ACKoef7VH5/tWPs0bFzz/ajz/aqfn+1Hn+1Brdljz/apDcAdR+lU6cy46Cj2ZrR7F7z/AGo8/wBqo/aj/dH5VL9qH90/lQa3LPn+1SecD1H6VX8/2o8/2rM6S5UkM1U6sQd6zAtRfxVNB3qGL+KrUAPpXHWOykWoVJXj0qxn5gx6VDB3qQzZGMV5VTY66Na42Zvf9Kr3lzz1/SobybvWXNeVgdftCzdXe7vWfLPgGoppqiFwG6Cr9kjWjqS+f7VYg71Tq5Zw9qKux7OF6m3pXQ123hKEedH9K47S4cDH5133guEeaa8arue1vRbPZvhNZZli4/TNfTPge3EOkkkfSvnv4QWY8yMY719I+GIfI0iI1+q+H1L/AJen5PxdV/fGkOBivKPil1uPrXqc/avKPiZP8zgjvX13E/8AAPGyD/eD588c/wCuk+leea390/hXofjn/XSf7teea3/rR9a/AMw/3g/X6H+7mBeVmz/N8zdKvXlZt0ckD0ralT6Hj1mKZ+QMV0Xhe94wewrmc5IP51qeHpj53Tt/Su/AL98c53MUuRipMYGBVOzmHlVYJA6mvp1SVjCrVKWtQ+dFmuJ1qIRTZHeu71H/AFX4VxevQ9xXj4/CX1Obqc7dvgYx6VlzuDjK1o3qLg9qpToMj5q8V0rmjrWMe8cgkN7Vn3oJO5a0L5duSOMVnTEHr1rb2J1UqplTg9ar+f7Veu3PpVK4B4J71rSvY7qVUTz/AGqzDft6/pWd5/tR5/tWrppm3tV3Oks73tXbeBvFmf8AR7i4/eV5dBfEdDW3pupzWcv2i3NKtRNaVax7rpepGdvvVtw3lebeE/E322KMYrrrG+K8Vw7nf7W5v+f7Uef7VThmqx5/tXdS2OULjp+FVZf4atN0P0qrL/DXVS3ODF7le6HANVro/NU8/aqlwMHFeh7J9Dx6xFP2qnP2qxVeftTqUbGSKc0NY2qWIuBzW7P2qnNDWIaHJzm4hl6Zp6z/ACjir2q2QmPNZEhFug70mcVXYvQ3lWI73jisb7UP7p/KpIZ8rkVqchuQXYIHH6VLDKPQflWPBNwPpViG8qk0c5qQyjsKsfa/T+VZfn+1Sef7VQGh5/tUnn+1ZvmD1/SpPMHr+lR7Jm3tC59q/wBmj7V/s1D549KPtAqrIy9sh3me1RzydOKd5/tRS9mIhmTze1V5l9qseZ7VHPJ04peyRjbyM+8sD2as6+0knndW/P2qvNDRoV7Y5K+0jvu698Vl3minrurs59PPUVmXulAnkfjWPs11BVmjir7SQTkDn1zWZcac3VjXcX2mtxt/Ose80bbyBWtK50rFeZyM1u3Q/wA6z4bZvN6V1V7pQPQ/jWbcaWbeXk103Zq8TIzf7WX0o/ttfX9KwYVuZux/KpApz0r7X2KPgvYmrPq7niq02rMetUvI96PI96VzX2LJP7Suf71H224lPX9aj8j3opFWJPNm9aP3tR+f7Uef7VmBY8j3o8j3qP7Z7/pUf2z3/SgCx+6pzz9OKzZtT74ptzqY4OKC4LUvzSx+/wCdRzXTelY8+qt1/Sq1xqh6kZ9q6vZM6rG5/af+zR/af+zXPf2qPQVH9tH979KPZm10dP8A2sAOEp41RehWuZN4QOD+lXIJ7k/erlq0+hx1aiRtC7LcZ/SnG9C9/wBKzYXuOKf5HvWF2cNWsty59s9/0qP7Z7/pUcNnPViGzo945vbLsJ9pX/Io8+X1qaDS7nrirMGiHqTT5WL62ilun9f50nl3Fa0GiDqYKuw6KvXFKw/bmPDaSHoB+VSQ2aHoP0rdg0cDoKsQ6Z2zWWhPtkYMGlN0L1Zg0vsWNbcOnnpirMGnknG2qszL2zMSDRgOQKuQ6Z2zWxDZ1JBZE9BSsx2Zlw6P3qxDpnbNasFiTyBUv2U/3h+dFjYzYdM7ZqSDTCeBWpRRoBDBYWx5BNS29vij7UP7p/KpfP8AajUCTyPeiq32of3T+VS+f7UrASef7Uef7VW+1D+6fyo+1D+6fyp2YFnz/ajz/aqP2o/3R+VH2o/3R+VHKwL3n+1Hn+1U/tAoNxgdKQ0mXPP9qPP9qo/aj/dH5VD5/tXLzGvKann+1R+f7VQ+3N/e/Sk8/wBqOYOU0PP9qPP9qz/P9qPOP939Kzt5lWZoef7Uef7Vn+f7Uef7U7MC39qH90/lR9qH90/lVTz/AGqPz/ajlQFr7Uf7o/KoZ5yTk1XmvKrzXlOyAuz3owRnNZ15qX/6qp3mpeTzWFqOsA8E1pSpNnZSpKqat74gGMBefrWbL4h5wRXPXviNMbSKzL7W2JrX6pc9SlhWzrv7d/6b0Q6x2riv7bX1/SpIdaXoDR9UZ6HsTvLHW/PPNatpqQzkD8K89stb7YrdsdayMGuWrRa3Mq1C60OtOp4PAqCe7I61jQ6mcZA/CoLjUwY+n1o9mcdWlqXNU1TyuB0rk9c1QZ4PWruq32y355Nc3qU2OSf/AK9dVCj1Z10aKKV9qhz/AErO+2e/6Ut6CJRkdTVKvW9iesi59s9/0qSG99Kp1Zhtz/k0eyAv2d6T3rQhvfSseGGrlvycVjI5Kppec/pR+8p0EBJwKvw2C+lc9zk9szI+x+dUtvpmT1rag0tcdKuQaMByBVe1QLGeRkxaRkYL/XitKx0RV5H51p2OjZOSO/Wtay0fvXK6xy1cXdmVZaQw6L+tatnpuRg1qQ6Z2zVyDTCeBWTqsx9s+xUs9LJJA/OtCy0o55H41dt7LuF/M1ahhrlu2HtdCGCwJ5NXoYaIO9SUvZMxbuSQd6kqOo/P9qLIr2pc8/2o8/2qn5/tR5/tSJLHn+1R+f7VX8/2o8/2oAsef7Uef7VT8/2o8/2rMCx5/tUfn+1R/aBUfnj0oOmzJ/tQ/un8qPtQ/un8qqef7Uef7VvzIs0PP9qj8/2qv5/tR5/tWBoWPP8Aajz/AGqvR5/tQb2Rb+1D+6fyo+1D0NVPP9qkouaWRYqb7Uf7o/KqtSVmalzA9KkgA9Kq2vU/SrUHegCSDvVu3+81QQd6twQ/Ma5K2x00vhLMMNT233agg71On3RXDV2RoiWormb5ajluM4z3qlcz8YrkOyjuLezgdTWfNcr60yaaqc01ZezRruxwnYHLDilbd/DVfKnjNSwGuj2R2UixB3rVsPvD8azoO9a2kwdxXFW+E9rC7m9o8PrXf+DIB5sVcRo8PtXpHgWH97Fn0rx6qvI9j/lwe7fBuz/1eBX0Do8HkWsff9zXifwgsuYhivcYeIcY7V+38B0vY4I/HuKav+2kk/8AqD9K8g+JU3Mma9fn/wBQfpXjnxL6yfjXdxH/AAGY5B/HPCPHP+tk+leb652r0fx1/rh9K841ztX4Ziv45+sUf4Bzt5Wa9Xrys2QgDJrWlueNXImmHUDr7VY0aVjd4rP805xj9KtW0x83Ga9DCfxzgq1TvLKcGHNaMM1YOlXH7qNcVrQEc819ZRMbj70jHPtXMeIYRktmumI29elYusQZ4rgxVLQy9scPqbeTJxzWVMRgEVs6xF5UuaxrheQR+NfLVaOppIy71Bk5FZ86qBkCtK/AB4rOvMd66lTVhqsZt0M8k+nFU7g5OzFXL0nBXHpVGcYxWtI6/atbFOftR5/tUk/aq56cVstdjWlWfUkhmq5DNWX9KsQzVt7M6qda51/hnXxpl3kH93Xpugazbzw8V4hZXvY/hXZ+DPE3ky+RPcc152Kwx00qrTses2V8R0q5b3GK57TdTE8XWtSG8rKj8J1Gl5/7zpRP9/FVmuMPkCpf+Wld8NzkrIbP1qpc/eqWXqahr1sO7nhVivP2qG66CrU/aqN11FdJxkc6ZwQapzx9OaszovHFR3CrjgVy+yJuZ99b5GBWRqdl53BFbk3IBqjddR9Kkk5WaC4gA+0DtUfn+1bepWX2iDGa5y98+CbyDWhzXLsd+QuMU+C9B6Gsg3Ten6U+C9yMipdCxjVpaHQ28m7vUn2tf7//AI7WFBeAcCrkN5S9h5nHdmv9uT1/SrP2sf5FYcM1Wvt59vyqyFI1vP8Aajz/AGrPhmqTz/atBe1Ze8+T0o8+T0qr5/tUnn+1Zle2JvPk9KP3lQ+f7Uef7UB7Ydh/SowHzyKd5/tR5/tQHtiHzPaqs0NXKjqPYowMuazrOvNKGeDW9O7cc1XmRvWtVRSA5q90sjg/nWVfaKDzmuuntCetUZ7J+oNUHtTw2CZzyD+tSec/oaxv7T/2aPtnv+lfWHy3tmann+1RzXtZf2z3/So5r0dCaDX25rS34AwVqP7ePT9KxvtD/wB0/lS4etbGv1pGl/bAYbQho/tP/ZrOAC1IYjnA5/Gsjlq4vXQs/wBp/wCzRNeVF9nb+/UkNk3979KDl+sSK/nXHp+tRZnn52ZrS/sz/aqSHTf+mFbWNvrZizR9iD+dRfZbiuj/ALM/2qkh0fvR7Q0+ueRzkOl3PXFWYNJPQmuig0dzyE/WrEGiv1K/rT9qzP64znoNGHfn61ow6Z2zW9DomOWNXINFB+bGBWN0Y1KtzBg0wngVeg0Q9Sa2odM7Zq5DpnbNImyMGDRB1NXoNHA6Ctj+zP8AaqT7H7frQFzLh0fvViHTO2a1ILInoKk8j3oMbMz4dM7ZqSGzq5UlZ+zibWRX+x+361J9j9v1qSjz/an7FGoQQEnAqb7Kf7w/OofP9qPP9qfsg1JKm8629/zqrR5/tVAW/tQ/un8qPtQ/un8qqef7Uef7VlyoXKi5UP2o/wB0flUPn+1FCQJFr7Uf7o/Kj7Uf7o/KqPn+1Hn+1Fkaljz/AGo8/wBqr+f7VH5/tTuBY8/2o8/2qv5/tVea8rDmYGh5/tQZsjGKzvty/wB79KrT6seoFIu5pfbPf9KPP9qyP7cP979Ki/tw/wB4flWfsGV7LyNz7Z7/AKVH9s9/0rHuNZA9ary+IRtwB9SafsNDqpUtDc/tP/Zo+2e/6VzI18k8jili14kcT/pWfspHVSwvY6WK9yeKk+2e/wClc/DrGev51cg1QbvmHFefV3On6qzYE/tUpmHb+VY0N56EVYhvKFVZzVcKXPP9qj8/2qPz++P0qOaaus4PYskmmrPvb0AcmiaasnVpuRmmlc2olbWdTJOQa5TW9ZLNitPWJ8YA7VyGsXBX5Qa9jC09D18HuRXuoleT+VVv7SuPWs+9nycmq/n+1eh7I9U2f7UHvUkGpDqW/Cue8/2qSG8o9ibezOrsdTBH9K1LPU9vBH0rjLK9Il4rXsr4EcmvPq0u5R2MGqDqKdcar6CubjvQv3DUq3g29f0rldBI46xo3l52rIvJgzcU64m+Wqsy56nFdVKlqY0ihPJ04qHyR7/nV6WxXHI/WpItLUCulNG/tSvDEB8n61PZ2eDxzV6HS+MZrSsdI4z+tZVXqYvFpGfDZk/dFadjpQAwT+NaNnou3pWhZaKTz/OuarVscdXF3KtppvykHj3q/YaWSc/rWjZaMcda0bLTABgfnXJ7exy1Khmw6Sem6tGx0UDmtGHTO2auQ2dZe0kyPaFOHTT0zVyHTO2auQQEnAq3b2+KzMGyvBppPIPFW4LXAwDTqkpWZXth3l+9SBOetQ1H5/tRZh7ZFncfWj7Qfeq3n+1Hn+1OxPMWPP8Aao/P9qq/ah3Wl+1D+6fyoq0nYV9Sz5/tUX2of3T+VVPP9qPP9qx946i39qH90/lUX2o/3R+VVfP9qPP9qLMC55/tUfn+1U6d9qP90flUlJotef7Uef7VTp32o/3R+VAcxa8/2o8/2qvR5/tQbFjz/aio/P8Aajz/AGrM0LFFR0UGhY8/2qSq8HepK1TNCSp7XofrVSprXqfpWSN3sXLXqfpV6DvVa16H61Zg71y1tjVFiDvVyCq8HerFclXc6CSo55sio5pqrzXlchoSzS5PH5VVnlyuWqOaXP3h9KpXMxzyfwqFSbKp1BbmR+hWqu1vSm+Yv92oygxwK39mjdVUWScDNPtxgmoLfpU9sScg0VaVz0KRpWH3h+Na2kw8cVk2P3h+Nb2lQ/LxXkVtj3sLudF4fgJm616h8ObI+dGB0xXm+gQZmxmvWfhlZfvY8fSuZUnc9Kt/APoP4S2R2RAjv3r1lwa83+EkA3RAj9a9KOOhr914Rpexyw/Fs6q/7cJe/wCol+leM/Err+VexX//AB6S14z8Q/vH8Ky4o/gHXkH8c8M8c/66T/drzfW/+PgfSvR/HX+uH0rzjxD/AK8fSvxCt/HP1aj/AADnL84U/hWVdTjdxWjezYG7FY05weOgrppUrHg4rcjuJABnFFvOsEnJ/Cq8xLNg9KGmUcAc130rXPK9uzttBvPOijrdhuDjiuO8N3o7muosp8jNfSYX+AFZ6mkAccHrWbqfarv2g+lUrytqtK1E5Tjdch/e4z2xXN3Z3HkdOtdZ4lhIPH1rk9XcqoK/nXy+KpfvzofkZ2pdD9BWXdferTvORx6VmXWQc0UQXwmfOjccVTnRuOKuz7+1U5t+RmqTaM/aFW4AOM1WnVfSrM9VrkA4roUDVVhmAeoponKnBHHrUYn2H+fFO4NI3pVS5DNWvpd75LxGuagY85WrtjdbTkrSaud/tbnq3hLX/Oh4H72uvs73PSvGtA1n7FJFcZr0jw/rQniyTzXDVpHdSqnWwzVZt7jBxWNZ3lXIZq2orQdbYsT3HQYqPz/aorj7y1GbkA42n8q9TDngVlqLVeb/AF341JVeftXY9jAjn7VHN1FSVXnqDnK8/BxVeftV2d245qlP2rJUkBTn7Vlappf2iLI61sz9qpzQ0NXA5C+gMBwarDg5ro9U0z7RDjNc5eQ+RLzWpmTxXqn5Sasw3gAwKyDck9R+lTQ3vGVpezRx1aRuw3lWPP8AasCK/YHANWIb9vX9Ky9ijl5TXM+TnFSfbPf9KzYNQPQ1Lb3Ga2MTVhnPY1KLjnmsqGarHn+1Bl7Rlwz5PSpfPHv+VUvP9qPP9qy9ig9oXPP9qKr+f7VJ5/tWoySio6Ky9krkXCftRUdFajgR1XmhqxUdBJ8rwd6k8j3q5DZ1Y/sz/ar62zPhvaLuZf2P2/Wj7H7frWxDpnbNWIdM7Zp8oe18zDg0wDgVJDpnbNdBDpnbNSQ6YT/yw/KnyoPaeZhw6Z2zViDTCeBXQQaYBwKsQ6Z2zWOhjdmBBpZP+NWYNJPQmtqHTO2asQ6Z2zRc21MD+xG9P1qSDRD1Nb/2P2/WrH2P2/WtbtjOeg0RRzVn+x/85rY+xH+7+tSQwHsKz1ZoZcOm/wDTCrEOmds1c+zmpdp9KFECCGzkqSGzkqapK19kA3yJPWpP3lN8/wBqPP8Aan7IB37yj95TfP8Aajz/AGo9kBYo8/2qPz/ajz/al7E3uiTz/ajz/aq/nijzx6VjysLosef7VH5/tR5/tUdZe0iDZY8/2qPz/aq9FaC5ix5/tR5/tVfz/aisOZmnMWPP9qPP9qr+eKDcYHSsh3RMZCT1/SlEhBzn9Kg8/wBqPP8AasfbSF7JEnn+1Hn+1U5pqj+2e/6VsbFz7Z7/AKVHNeVnzXlV5r31NAF+S7xnJqncatzkjn0rNvtVz2/CsbUte8nk9K6KVKx1UqNzfn1k/QetZ97r+cgdulcxe+JcA1k3viY9z+ldVLDXPTpYS52f9vN/z8VWm8Snpk1xc+vntVebXj0rX6qzr+prqzs5fEzBgPO/WqVx4nOcYArkV1zaeajOqqP4RR7I66VFI6n/AISBvWpYPELDgmuR/tU+bjdUsGrE8g1l7E29ij0Cy8RjpWlBrQPFec2mpCH5lrZsdZGDzzXn1cIg9id9DqffFWIrw9q4qDXCON36VpQauD/Fz6Yrz/YtGHsbnX299zkVJ5/tXP2epDOcVbN4FP19qdLVnBVwrLE84HJrJ1S7IOSfpRe3pJ5rL1C+29vpXVRZyOmrlPWZvlzXMav2rW1CfcMgVi6tN0zXqYRanTR0RhXf36rT9qsy/fqtP2rvPcpEPl+9Hl+9OqSGIdM0GvtCxZ1pWE1UIIcck81ehiKnAP4iszGrWNGKYMM9M1YgZRnAqtYwZOK07OyA5ArGqcNaqEHepPsft+tWodPPWrsGlAdB+Ncpxe2RmQaYDwD+NXYNLT+9+latnpP+1+NaEOk9t1Bl7ZsyYNHUc4rXstIPX7NitGz03t+taMGlk9Pzqb9jL2iM2y0rHBNaMOmds1oQ2dXIbOubVmd0inDpp6Zq5DZ1YhhqSCDPAp2ViW2EEBJwKm+yn+8PzqW16H60tcvKF2FSVHQZ8DOK19imZElHn+1VftQ7r+lL9qH90/lXMOzH/aj/AHR+VRfaD71F5/tR5/tXfZFk32o/3R+VQ+f7VH5/tR5/tRZWC1iTz/ajz/ao/P8Aao/P9q4W3ctJEnn+1Hn+1R1HSOkk8/2o8/2qOo6ALHn+1FV/P9qPP9qALHn+1Hn+1V/P9qKALf2of3T+VH2of3T+VVPP9qkrnOgk8/2qSq9SUGhYqSq9SQd6DQsVJVerFBoPj+6asW33ajj+6asW8GBiorGvQuWvQ/WraVDB3qZAT0FefXNy1gelIQMdKZUZn4PFRzASTTVTmmommrLnnJOTXMlc6CW4uM1n3M3zc0+abuaqS3OBjFdEaTN6LsP881J559Kh8z2qS3fJxin7M6NexegqxZ1TgrQgrmqnfSNGy6fhW/pnesWy+5+Nb2md68yr8J7mF+JnVeGIR5sdew/DKH99GK8m8JQnziTXtXwxsiZY/wBK56C/2g6sXVtQPoP4VQERxkDr3rucgd65P4YQmC1/7Y110hPGK/eMgpeyy1H4zmNq2OZDqf8Ax6Sf9cK8S+JU/wDrM+hr23VP+PWX6V4d8RJv9YPY9683ij+AehkH+8HiXjmb97JXmWtT5aTAr0Xxz/rZPpXm2tz5n/lX4zW/jn6qv93Od1Sb5hmsqbov1rR1L/XisW8m+7XfS3PnsV1GTzDoo60wTBRz/Ko5sAZP41ASScmu6lSueHudB4bvf3vFdppsw8rmvP8AQZvJlwK7DTZu4r2sv1Rv0N616n6VDP2qOGapJ5yTk12M5jC8QQDya4nUYD53H513+pwhoTiuO1+FhJ8vYV4mPpFwq6HPXXQVm3gHpWldEYHNZs9cFLYV3YzL08nB9KpTk8c1oXlU5+1dbaD2qKc/aq9wQMZq5P2qvPz1paD9qUJ1b0qPY3pUtwJFIBqP95VmvtEScg8nipIZih6Zqv8AcPXNBuCp4HFBtSrGtZXu3pXWeEvEIhm8mc/WuAgn7E8d62LG+YS4PSo9izrpVT2HTNSIPA4rahva888M+IfOiyOc11Vle/aORXMqXQ7lWsbvne1DT8HjtVOGbzoqkafg8dq78NucNUsCfgcVWuug+tILoAYxTq9DdHEQ3XUfSo7okYwabTbrtUPU5625DUc/aprrqPpVWgzGTMwxzVOd245q3P2qvP2qORBZFS4h+asXVNL8+tm46iq80NELAtji7yHyZcmofP8Ak6V0mp6V50Xy5rm7yG4ibiuimrMhqwomGBx+lWYbwVnLPwOO1L5/tSe5zGvBenGCKsR3uMfNj8Kxre4z1qaG9Hr+dP2bOWrSbNyG8p8M/OKyIbypY5TuyBWRyVFobfn+1EM1Z8F4BwKk+2eh/Sj2RBqQzVJ5/tWfBPnkVJDNWYFzz/ajz/aq/n+1Hn+1BmWPP9qPP9qr+f7Uef7Vr7JkXLHn+1RzTVH5/tUfn+1FKlcDwuDTCeBV6DST0JrW+x+361JDZ19Tds+N9mjPh0ztmpIdM7ZrUhs6k8j3rKzMDPh0ztmpP7M/2q0PI96KfKBT/sz/AGqk+x+361Yoo5UdBHDDUnke9FSU7ICOpKj8/wBqPP8AatQJKKj8/wBqPP8AagCSio/P9qj8/wBq0AsUef7VX8/2qPz/AGoNCx5/tR5/tVfz/ao/tnv+lAFzz/ajz/aqf2z3/SpPP9qALnn+1Hn+1V/P9qPP9qy9sa2ROWAOB1pelV/P9qRrgjgD9K5qtawlSJfP9qPP9qi8xf7tR+Yv92uT2zNPYFmiovMX+7UfmL/do9sw9gWfP9qPP9qreYv92o/MX+7R7Zj9j5lkTYGMUef7VX8/2qOaaueyNyx5/tUc01U5ryq95qXf9K3VK5fsvIuTXlUp9UwN2PwrKvNTJxkfUVlXus8AH8a6qWGOqlhDdm1n5eP0qje6wT1rn7zxD/08Vk3mtH1xXVSwx2UsAdHe69b9jWDe6qB2/CsmfViegqtNe4GM100qLR30cKXL29A6msqa/X1pk15VOefHJrRKx6KpWJJryj7Z7/pVGZx13VGZAB1/SuvlNPYo0vO9qa0pzkCqvn+1Hn+1c1WmIufbPf8ASiC9B6Gqc01R+f7VXsWdBuQ3lWINT9vwrnoJNvQ1dhmrH2V9wOlstYJGFP4VoWesA98H0rkob30q7ZXw6EfSuSrhTnO6sdVft+VX/wC1weiVxdlqW7735VbGpPjha5HhUZ1lc6SfVB1C1nXl5WX/AGn/ALNRzXnrWvs0ed7FBezYOQayr7oT9Klmm82q9ehS0Zs7IqzQuOKrzQyVpeR70eR71XMjb2xmwwlzgCr0Nl6CrkNkewq9ZaV6n8aL3Ma1ZvYo2OlZ/wAa1LOywOBVy30n/wDWa0LTS8nrx2Nc9aq2cftilb6VjgGtKy0wZ6/SrFnDB1HftW1Z2lupGKzq1LmVWq2UItNyetaMGmE8A1dsbDPJH4VpQ2XpWJyJGfDpnbNaMGlk/wCNXYNPHU1ahhqbN7iKsGnjqavQw1JDDUkHeqtYCOGGrEMNR1JWYBUxcEY21H5fvR5fvXP7BXFdE3n+oo8/2qOo63siAo8/2qPz/aioNAnn8vk1l6n4rsLHrPVnUpT9l6V5H45vL+C7kzP+FYUaV3qdFOmmehw+OLe4lyJ/rWxZapBLFmvnQ+MdR0qb/R/x5r0H4c+OrjU/K+0dDXfVwFaj+9Na1Kh/y7PUqKr2k3nR4FSTTd65r6HHbWxJVejz/ao6mVmikrElFR+f7VH5/tXEaknn+1FR+f7UUASUef7VH5/tUfn+1BoWPP8Aaio/P9qPP9qALFSef7VXqSszQkp6fdFQVOn3RWZvS2FqxVeDvViDvWh2j1+7U0f3jUNt92po/vGs6m5S3L8MAHQVYhhqvB3qxB3rnJLkHepKjqPz/auc6Cx5/tVee9A6mo55wOTWfPOScmgW4+a/ycA5qnczccn9KiuL85wDVGeck5NJUEddKkWZ589sVF5/tVfz/ajz/atfZxOouVLB0/Gq0HerMHT8azrjW5dte9aVn/jWba960rOuCqddL4jWsvufjXRaNDzzWDpf3GrotHgzXm1dj6LCbnb+E4BviNe3fCyACaM+n614z4MhG+OvdvhPZYEe0Vrl9H22NDNKv+xHvvgaEw2GPWuhIyMVi+FYvJ0/ntWsxxg1+9ZXS9jgqR+NVX/tBW1ub/iWyY/5968R+Ik3yyD255r2rWP+Qbc/9cTXiHxD6TfSvneKP4B9Bw//ABzw3x396WvN9b/1kn0r0Px1/rq841f7r/59a/JLfvz9OWuHOd1QYGB1NYtwcEH2rV1Msen4VjXHX8a7qdKx8xitiC67VALgEZxS3xGBzUQ+5+Fd9HY8pbFzS58yZIrs9EvSYkzXCWE5Mpya6/w7N+6jr1MvGdTBMCMrUvn+1UbCfmrVesZlK97/AIVy/iSHIIH1Fddc58gE9a5zXosRD64rycdS0sBxV/1/Ks6ftWtqn+trJnrwFsV9kz7yq89XJ+1U5+1di2OWp0Kc/aq8/arE/aqV10FT7E0KtyxLZz3qtk+tST1HXXY6CTA9KjIBpvl+9R7PQ1FkL2qRN5/tV2xn2nNZe9vWrME7nkVPs0zb2sTptG1M2csZxXe6JqvnRexryyxvjnB79K6PwzrIim+zznkVnWo6aHVRqnp1negxg1Mk3zZFYelXuSBWgl581FAKxf8AP9qKrwzVJ5/tXaYFio5+1FQ3RGBzWzdznIZ+1Rz9qkqOftVGZHP2qvP2qSftUc/ak9gI5ugqvP2q3KRgc9qgnI9a5DMy5+1ZGtaWZD7Vtz9qo3QJYVs9rlOzRx95BPDypye4qrXTanptvJHx+Vc7eWXkda6KL9qJDYb89DzUkN+P7orNmmo8/wBq39kh+6a9vfq33T+lWYZvSsC2uSnIq3Be+hrF0WjgrJI24b8ZxVnz/asOG8qzb3xBABpOJ517M2IZH7VZglYHNYsN6Qcg1eh1D2rKzM/aml5/tUnn+1Zn25v736VJ9pb/ACKfsmZWL/n+1FV/PFH2gVIWZY8/2o8/2qv5/tUnn+1dAjg4YakqPz/ajz/avfTSPjvaLuWKKr+f7Uef7UXQyx5/tRVfz/ao/P8Aai6Asef7Uef7VX8/2o8/2rUCx5/tR5/tVfz/AGqP7Z7/AKVlzICx5/tR5/tVfz/ao/tnv+lTzM0Lnn+1R+f7VS+1t/f/APHajmu27t+lP2zD2b7Gh9pX/IqP7Sv+RVT7Z7/pUU97gc1lz3L9kXZrw4xmq02qeR1n/Gsm81Rojmue1vxZbWPJnrqpI7KOA9sdfNrQ9aP7a9/0rzK98e3PoT9KIPHlz0wa29liD1VlTPUYdat/SpIb3PQivNofGhPWatKy8WBpOJwaxrUq/Uxq5UegfbPf9KQ3ZP8AFj8K5Wz8TCbkDnHBzVyPVvNPJrzK1rXMlg0jf+2e/wClSef7Vixar0I/KpIL896xraAqTNbz/ajz/as2DUB0NWvP9q57sPZNFjz/AGo8/wBqr+f7Uef7UcyMvZIsef7VH5/tVD7efb8qj+3N/e/StPYyNPYl+aao5pqoTXxc7SagnvsfKOK1o0erAs3F8MYzzWdd3xPBb9KjuLsAYx+NZ13ela7uQ3o0iLU9S7GsC/1M5/pU2qXBEvFZE/au6lSPYpaISfUcE7aoT3pPU1HP2qvXoJJHaSTTeVUf2z3/AEqOaaqc01QBcmmqv5/tVfz/AGqPz/atPYnQSUVH5/tR5/tQBJR5/tUfn+1FZgSUVHUh6GtDoHeZ7VJBJ7U0cDFSQd6nmMPbImtlxyanjuMn5arxNnIFT00u5yVapet7/wBT+lWjqBXjP6Vj24JzgVct7XcMsK5qySZk6xc+1N/dP5UfamPBFJ5Ev92rEGnqOi1hoT7dDKk8j3qSGHtVqCwB5qtDL2hDDZelWIbOrcFiByP1q9BYk8gVNmzJVEilZ6b/APrrUstN7frVuy0sDgfnWjZ2dYp2Of2qKdnpv/66r69P/Zlrn3roIYYOtV9e0f8AtK18g1kc6ep5bP4/NnqHkXFx+NdV4Y+KdvN5f+kV518SfA2rwyST2EEsnNchod5r2maiRcQSxx471639n0a1D2p2JXR9a6BrNhqkGYJ+fet23bHDCvAvAnxAaBo/tFxXsfg3xLBqcGTcdO1eDVpexYVcK0dJFDzipKrmaCGM+fP3qvPr9hD1uK0OKxreX70eX71jw+KdP/5+P1qSDxRYHpP+tBr7Nmx5fvUe/wAnv+lU/wDhIrGaLPnfrXF/Ef4kf2NFm3noD2Z3c2o28PW5/SiHV7acfuLn9K+dL343TTS8XBqt/wAL0v7IcT80/q9dnb9QZ9MC8wOG/wDHaTz/AGr5+0v9o64/5eJ8c10ujfHq3n5Mv5VlVw1dh9QaPXt+OMUpAbkGuY8P+P8ASdT4+0V0VreQTQ83FJM4KtL2Iy+gE0GcCuH8YeDP7Vz5IrvLmb5axdWm8iEmk9wo9TxbWvA19BJgnj2qTwzCPD/+v/5Y10HjLxasBktbfjFed614hv55pBbt+lessTWrUfZVDvpYS57NpXxT08RxQXFx+VdPp2tQanHmCvm7Rv7Wnu4vtBl969q8AQzwad/pFeViqfsTKrS9kdkevFRz9qj8/wBqj8/2rA5iSiq/n+1Hn+1BoWPP9qj8/wBqj8/2o8/2rP2JoSef7Uef7VX8/wBqk8/2rnOgkqSq/n+1Hn+1AFjz/apKr+f7VJB3oAtf8tKmqo/3jU9QzoobFiDvViDvVODvVyDvWRoWIO9WIO9U4O9aEHehDW5Pbd/rUtRW3f60fah/dP5Vzg1qTLP83T9KWabZ71D5/tVZ5yc5rH2KOuiF9cY5NZk18e5ommqnNNW9Kitkdlgmmqv5/tUU8z9hVbz3HJFdPsWdPKy95/tUkHeqfn+1WIZqxtYyLkHer1s2ODWbDNVyGasKtJS3Dc0rbJOT2rSszzjFZNhLzmtKyGAB9a5KtKx6GE2N7Suv510+ife/OuY0rr+Jrq9A+9Xk1T6PC7s7/wAGQgyxV798J4PmiOa8O8Dw+dNFmvoL4T2nMQArrySl7bG3OTP6v+xHtnh+HyNOwauL90VBo37nT48+tTp90V+80NMMfjj3M3xT/wAeEv0rxb4idJvpXsvin/jwl+leNeP4eJSfT0r47ig+s4f6Hhnjj/XSfSvMvEP35f8APrXpvj7/AF8v0ry/xBNlpT/nvX5T/wAvz9KX+7nM6oBkcdqyb3qfrWvqfUfSsS9m/fde9elT+I+XxxFP2qrddR9KS4uM1F5/tXaeMkWbWYZYfpXS+GJv3aDvXIW/3mre8PXvzda7cL/HK6nZ2c3erlZ9nN3q5DNXuJ2E1cmucEZB6Vka1BmD+VaIJHIrO1PPknHpWFWjqT0OF16EmTr0rBuOSB6da6XXYfT9K5q+O0EjqcV83VpfvyypP2qnP2qxNNVO8m71Rm9iOftVK66D61LPOAMmqlxcZrQ5mRT9qr1JP2qOtDrkV5yeOajyfWpJpqr+f7VoSSef7VLb3GKrVH5/tQaGrDcMOhrR0q9YzYJrnYZu9adlfL0BpqkaHo3h7W/NjyTmt6yvgeAa840DUvJljxXZaXdCeHJWo5NTT2iOmimyc1Y8/wBqyob4E4BqzDeVbVgqPQ0muQRjFRpMDnK/pVXz/anRz9eKvoctbYdP2qMdRR5/tTFn5HHegl7DpgMDioJwOOKFn4HHao/P9q0OcKjn7UVHP2rP2bAr3BAxmqlxAAcZq1ddB9agqlSFpcpzQ1l6lZ+fFzWxP2rPvKPZ22HdHH6pY+RNn8sVmspY5Heur1G0guPlNc5f2P2abcD0rro1jp3Kvn+1S/aP9kflVY8HFR+f7V3WTEakE2Rmp4L7PHesVJ+f/rVat7jd2rldA82tRN2G996sQ3lYVvfbqt296MYJpewOOtRsbUN5ViCcg5FYcN5ViG8rP2cjjv5m19qP90flUv28e/5VkQ3lSfbPf9KzFc0/tQ/un8qLe4zVH7cf+e5p8E+Js0Bc/9k=)
  `;

  /**
   * Get the default background for the dashboard
   * @returns {string} The default background image URL
   */
  static getDefaultBackground() {
    return this.DEFAULT_BACKGROUND;
  }

}
