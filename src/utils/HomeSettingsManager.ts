import { CustomizationManager } from './CustomizationManager';
import { DashboardConfig } from '../config/DashboardConfig';
import { localize } from './LocalizationService';
import { BackgroundManager } from './BackgroundManager';
import { HomeAssistantUIManager } from './HomeAssistantUIManager';
import { injectLiquidGlassStyles, LiquidGlassClasses } from './LiquidGlassStyles';

export interface HomeSettingsData {
  favoriteAccessories: string[];
  excludedFromDashboard: string[];
  excludedFromHome: string[];
  includedSwitches: string[];
  extraAccessories: string[];
  backgroundType: 'preset' | 'custom';
  customBackground?: string;
  presetBackground?: string;
  hideHeader?: boolean;
  hideSidebar?: boolean;
  showSwitches?: boolean;
}

export class HomeSettingsManager {
  private modal?: HTMLElement;
  private customizationManager: CustomizationManager;
  private onSaveCallback: () => void;
  private hass: any;
  private requiresRender: boolean = false;
  private settings: HomeSettingsData = {
    favoriteAccessories: [],
    excludedFromDashboard: [],
    excludedFromHome: [],
    includedSwitches: [],
    extraAccessories: [],
    backgroundType: 'preset',
    presetBackground: BackgroundManager.DEFAULT_BACKGROUND,
    showSwitches: false
  };
  private tempSettings: HomeSettingsData = {
    favoriteAccessories: [],
    excludedFromDashboard: [],
    excludedFromHome: [],
    includedSwitches: [],
    extraAccessories: [],
    backgroundType: 'preset',
    presetBackground: BackgroundManager.DEFAULT_BACKGROUND,
    showSwitches: false
  };
  private availableEntities: any[] = [];
  private allEntitiesForInclusion: any[] = [];

  constructor(customizationManager: CustomizationManager, onSaveCallback: () => void) {
    this.customizationManager = customizationManager;
    this.onSaveCallback = onSaveCallback;
  }

  public async showHomeSettingsModal(hass: any) {
    this.hass = hass;
    await this.loadSettings();
    await this.loadAvailableEntities();
    this.createModal();
    this.setupEventListeners();
    this.showModal();
  }

  private async loadSettings() {
    await this.customizationManager.ensureCustomizationsLoaded();
    const customizations = this.customizationManager.getCustomizations();
    
    // Use BackgroundManager to get the current background config properly
    const backgroundManager = new BackgroundManager(this.customizationManager);
    const currentBackground = backgroundManager.getCurrentBackground();
    
    this.settings = {
      favoriteAccessories: customizations.home?.favorites || [],
      excludedFromDashboard: customizations.home?.excluded_from_dashboard || [],
      excludedFromHome: customizations.home?.excluded_from_home || [],
      includedSwitches: customizations.home?.included_switches || [],
      extraAccessories: customizations.home?.extra_accessories || [],
      backgroundType: currentBackground.type,
      customBackground: currentBackground.type === 'custom' ? currentBackground.backgroundImage : undefined,
      presetBackground: currentBackground.type === 'preset' ? currentBackground.backgroundImage : BackgroundManager.DEFAULT_BACKGROUND,
      hideHeader: customizations.ui?.hide_header || false,
      hideSidebar: customizations.ui?.hide_sidebar || false,
      showSwitches: customizations.home?.show_switches || false
    };

    // Create a copy for temporary editing
    this.tempSettings = {
      favoriteAccessories: [...this.settings.favoriteAccessories],
      excludedFromDashboard: [...this.settings.excludedFromDashboard],
      excludedFromHome: [...this.settings.excludedFromHome],
      includedSwitches: [...this.settings.includedSwitches],
      extraAccessories: [...this.settings.extraAccessories],
      backgroundType: this.settings.backgroundType,
      customBackground: this.settings.customBackground,
      presetBackground: this.settings.presetBackground,
      hideHeader: this.settings.hideHeader,
      hideSidebar: this.settings.hideSidebar,
      showSwitches: this.settings.showSwitches
    };
    
    }

  private async loadAvailableEntities() {
    if (!this.hass) return;

    // Get all entities that are supported by the dashboard
    this.availableEntities = Object.values(this.hass.states)
      .filter((state: any) => {
        const domain = state.entity_id.split('.')[0];
        if (!DashboardConfig.isSupportedDomain(domain)) {
          return false;
        }
        
        // Check if entity is hidden in the entity registry
        const entityRegistry = this.hass.entities?.[state.entity_id];
        if (entityRegistry && entityRegistry.hidden_by) {
          return false;
        }
        
        // Check if entity is disabled in the entity registry
        if (entityRegistry && entityRegistry.disabled_by) {
          return false;
        }
        
        return true;
      })
      .map((state: any) => ({
        entity_id: state.entity_id,
        friendly_name: state.attributes.friendly_name || state.entity_id,
        domain: state.entity_id.split('.')[0],
        state: state.state,
        attributes: state.attributes,
        area_id: state.attributes.area_id || null
      }))
      .sort((a, b) => a.friendly_name.localeCompare(b.friendly_name));

    // Get ALL entities for the "Include Additional Entities" feature
    // This includes entities not normally shown in the dashboard (sensors, input_boolean, button, etc.)
    this.allEntitiesForInclusion = Object.values(this.hass.states)
      .filter((state: any) => {
        const domain = state.entity_id.split('.')[0];
        
        // Check if entity is hidden in the entity registry
        const entityRegistry = this.hass.entities?.[state.entity_id];
        if (entityRegistry && entityRegistry.hidden_by) {
          return false;
        }
        
        // Check if entity is disabled in the entity registry
        if (entityRegistry && entityRegistry.disabled_by) {
          return false;
        }

        // Check if entity is unavailable
        const isAvailable = state.state && !['unavailable', 'unknown'].includes(state.state.toLowerCase());
        if (!isAvailable) {
          return false;
        }
        
        // Exclude entities that are already supported domains (they're already in the dashboard)
        if (DashboardConfig.isSupportedDomain(domain)) {
          return false;
        }
        
        // Exclude some domains that don't make sense as cards
        const excludedDomains = [
          'automation', 'person', 'zone', 'device_tracker', 'sun', 'weather',
          'persistent_notification', 'conversation', 'tts', 'stt', 'update',
          'calendar', 'group', 'image', 'notify', 'number', 'select', 'text',
          'time', 'date', 'datetime'
        ];
        if (excludedDomains.includes(domain)) {
          return false;
        }
        
        return true;
      })
      .map((state: any) => ({
        entity_id: state.entity_id,
        friendly_name: state.attributes.friendly_name || state.entity_id,
        domain: state.entity_id.split('.')[0],
        state: state.state,
        attributes: state.attributes,
        area_id: state.attributes.area_id || null
      }))
      .sort((a, b) => a.friendly_name.localeCompare(b.friendly_name));
  }

  private formatPresetName(presetName: string): string {
    return localize(`wallpaper_presets.${presetName}`) || (presetName.charAt(0).toUpperCase() + presetName.slice(1));
  }

  private createModal() {
    this.modal = document.createElement('div');
    this.modal.className = 'apple-home-settings-modal';
    
    this.modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <div class="modal-header">
          <button class="modal-cancel ${LiquidGlassClasses.modalCancel}">
            <ha-icon icon="mdi:close"></ha-icon>
          </button>
          <h2>${localize('settings.title')}</h2>
          <button class="modal-done ${LiquidGlassClasses.modalDone}">
            <ha-icon icon="mdi:check"></ha-icon>
            <div class="save-spinner"></div>
          </button>
        </div>
        <div class="modal-body">
          ${this.renderSettingsContent()}
        </div>
      </div>
    `;

    this.addModalStyles();
    document.body.appendChild(this.modal);
  }

  private renderSettingsContent(): string {
    return `
      <div class="settings-section">
        <h3 class="settings-section-header">${localize('settings.favorite_accessories')}</h3>
        <div class="settings-card">
          <div class="entity-selector" data-setting="favoriteAccessories">
            <div class="autocomplete-container">
              <input type="text" class="autocomplete-input" placeholder="${localize('settings.search_accessories')}" />
              <div class="autocomplete-results"></div>
            </div>
            <div class="selected-entities">
              ${this.renderSelectedEntities(this.tempSettings.favoriteAccessories)}
            </div>
          </div>
        </div>
        <p class="settings-section-description">${localize('settings.favorite_accessories_description')}</p>
      </div>

      <div class="settings-section">
        <h3 class="settings-section-header">${localize('settings.exclude_from_home')}</h3>
        <div class="settings-card">
          <div class="entity-selector" data-setting="excludedFromHome">
            <div class="autocomplete-container">
              <input type="text" class="autocomplete-input" placeholder="${localize('settings.search_accessories')}" />
              <div class="autocomplete-results"></div>
            </div>
            <div class="selected-entities">
              ${this.renderSelectedEntities(this.tempSettings.excludedFromHome)}
            </div>
          </div>
        </div>
        <p class="settings-section-description">${localize('settings.exclude_from_home_description')}</p>
      </div>

      <div class="settings-section">
        <h3 class="settings-section-header">${localize('settings.exclude_from_dashboard')}</h3>
        <div class="settings-card">
          <div class="entity-selector" data-setting="excludedFromDashboard">
            <div class="autocomplete-container">
              <input type="text" class="autocomplete-input" placeholder="${localize('settings.search_accessories')}" />
              <div class="autocomplete-results"></div>
            </div>
            <div class="selected-entities">
              ${this.renderSelectedEntities(this.tempSettings.excludedFromDashboard)}
            </div>
          </div>
        </div>
        <p class="settings-section-description">${localize('settings.exclude_from_dashboard_description')}</p>
      </div>

      <div class="settings-section">
        <div class="settings-card switch-card">
          <div class="switch-setting-row">
            <span class="option-text">${localize('settings.show_switches_cards')}</span>
            <div class="ui-setting-toggle" id="switches-toggle">
              <div class="toggle-switch"></div>
            </div>
          </div>
        </div>
        <p class="settings-section-description">${localize('settings.show_switches_cards_description')}</p>
      </div>

      <div class="settings-section" id="included-switches-section" style="display: ${this.tempSettings.showSwitches ? 'none' : 'block'};">
        <h3 class="settings-section-header">${localize('settings.include_specific_switches')}</h3>
        <div class="settings-card">
          <div class="entity-selector" data-setting="includedSwitches">
            <div class="autocomplete-container">
              <input type="text" class="autocomplete-input" placeholder="${localize('settings.search_switches')}" />
              <div class="autocomplete-results"></div>
            </div>
            <div class="selected-entities">
              ${this.renderSelectedEntities(this.tempSettings.includedSwitches)}
            </div>
          </div>
        </div>
        <p class="settings-section-description">${localize('settings.include_switches_description')}</p>
      </div>

      <div class="settings-section">
        <h3 class="settings-section-header">${localize('settings.extra_accessories')}</h3>
        <div class="settings-card">
          <div class="entity-selector" data-setting="extraAccessories">
            <div class="autocomplete-container">
              <input type="text" class="autocomplete-input" placeholder="${localize('settings.search_entities')}" />
              <div class="autocomplete-results"></div>
            </div>
            <div class="selected-entities">
              ${this.renderSelectedEntitiesForInclusion(this.tempSettings.extraAccessories)}
            </div>
          </div>
        </div>
        <p class="settings-section-description">${localize('settings.extra_accessories_description')}</p>
      </div>

      <div class="settings-section">
        <h3 class="settings-section-header">${localize('settings.home_wallpaper')}</h3>
        <div class="settings-card">
          <div class="wallpaper-options">
            <div class="wallpaper-option-row" data-action="upload">
              <span class="option-text upload-text">${localize('settings.take_photo')}</span>
            </div>
            <div class="wallpaper-option-row" data-action="presets">
              <span class="option-text">${localize('settings.choose_from_existing')}</span>
              <ha-icon icon="mdi:chevron-right" class="option-arrow"></ha-icon>
            </div>
          </div>
          
          <div class="current-wallpaper-preview">
            <div class="wallpaper-preview-image" id="current-wallpaper-preview"></div>
          </div>
          
          <input type="file" id="background-file-input" accept="image/*" style="display: none;">
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-card switch-card">
          <div class="switch-setting-row">
            <span class="option-text">${localize('settings.hide_ha_header')}</span>
            <div class="ui-setting-toggle" id="header-toggle">
              <div class="toggle-switch"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-card switch-card" data-setting="sidebar">
          <div class="switch-setting-row">
            <span class="option-text">${localize('settings.hide_ha_sidebar')}</span>
            <div class="ui-setting-toggle" id="sidebar-toggle">
              <div class="toggle-switch"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderSelectedEntities(entityIds: string[]): string {
    return entityIds.map(entityId => {
      // Check both lists since favorites may include manually added entities
      let entity = this.availableEntities.find(e => e.entity_id === entityId);
      if (!entity) {
        entity = this.allEntitiesForInclusion.find(e => e.entity_id === entityId);
      }
      if (!entity) return '';
      
      return `
        <div class="selected-entity-chip" data-entity-id="${entityId}">
          <span class="entity-name">${entity.friendly_name}</span>
          <ha-icon icon="mdi:close" class="remove-entity"></ha-icon>
        </div>
      `;
    }).join('');
  }

  private renderSelectedEntitiesForInclusion(entityIds: string[]): string {
    return entityIds.map(entityId => {
      // Check both lists since included entities may come from either
      let entity = this.allEntitiesForInclusion.find(e => e.entity_id === entityId);
      if (!entity) {
        entity = this.availableEntities.find(e => e.entity_id === entityId);
      }
      if (!entity) {
        // Entity might be saved but no longer exists - show entity_id
        return `
          <div class="selected-entity-chip" data-entity-id="${entityId}">
            <span class="entity-name">${entityId}</span>
            <ha-icon icon="mdi:close" class="remove-entity"></ha-icon>
          </div>
        `;
      }
      
      return `
        <div class="selected-entity-chip" data-entity-id="${entityId}">
          <span class="entity-name">${entity.friendly_name}</span>
          <ha-icon icon="mdi:close" class="remove-entity"></ha-icon>
        </div>
      `;
    }).join('');
  }

  private addModalStyles() {
    // Inject centralized liquid glass button styles
    injectLiquidGlassStyles();
    
    if (document.querySelector('#apple-home-settings-styles')) return;

    const style = document.createElement('style');
    style.id = 'apple-home-settings-styles';
    style.textContent = `
      .apple-home-settings-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .apple-home-settings-modal.show {
        opacity: 1;
      }

      .modal-backdrop {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }

      .modal-content {
        position: relative;
        width: 700px;
        max-width: 90vw;
        max-height: 85vh;
        background: rgba(28, 28, 30, 1);
        border-radius: var(--apple-modal-radius, 20px);
        overflow-y: auto;
        overflow-x: hidden;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
        transform: scale(0.9);
        opacity: 0;
        transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      }

      .apple-home-settings-modal.show .modal-content {
        transform: scale(1);
        opacity: 1;
      }

      .modal-header {
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        position: sticky;
        top: 0;
        z-index: 10;
      }

      .modal-header::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: -30px;
        background: linear-gradient(
          to bottom,
          rgba(28, 28, 30, 1) 0%,
          rgba(28, 28, 30, 0.95) 30%,
          rgba(28, 28, 30, 0.7) 60%,
          rgba(28, 28, 30, 0) 100%
        );
        z-index: -1;
        pointer-events: none;
      }

      .modal-header h2 {
        margin: 0;
        font-size: 17px;
        font-weight: 600;
        color: white;
        text-align: center;
        flex: 1;
      }

      /* Modal-specific button positioning */
      .modal-header .modal-cancel,
      .modal-header .modal-done {
        z-index: 2;
      }

      .modal-body {
        padding: 0;
        padding-bottom: 20px;
      }

      .settings-section {
        padding: 10px 20px;
        position: relative;
        overflow: visible;
        min-width: 0;
        max-width: 100%;
      }

      .settings-section:last-child {
        border-bottom: none;
      }

      .settings-section-header {
        margin: 0 0 8px 0;
        font-size: 13px;
        font-weight: 400;
        letter-spacing: 0.5px;
        color: rgba(255, 255, 255, 0.6);
      }
      .settings-section-description {
        margin: 8px 0 0 0;
        font-size: 14px;
        color: rgba(255, 255, 255, 0.6);
        line-height: 1.4;
      }

      .settings-card {
        background: rgba(44, 44, 46, 0.6);
        border-radius: var(--apple-input-radius, 10px);
        padding: 0 16px 16px 16px;
        position: relative;
        overflow: visible;
      }

      .settings-card.switch-card {
        padding: 0 16px;
      }


      .switch-setting-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        transition: all 0.2s ease;
        min-height: 50px;
      }


      .settings-section-content {
        position: relative;
        overflow: visible;
      }

      .entity-selector {
        position: relative;
        overflow: visible;
        min-width: 0;
        max-width: 100%;
      }

      .autocomplete-container {
        position: relative;
        margin-bottom: 0;
        overflow: visible;
        min-width: 0;
        max-width: 100%;
      }

      .autocomplete-input {
        width: 100%;
        box-sizing: border-box;
        padding: 12px 16px;
        background: rgba(39, 39, 39, 0.8);
        border: 1px solid rgba(84, 84, 88, 0.8);
        border-radius: var(--apple-input-radius, 10px);
        color: white;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s ease;
        margin-top: 16px;
      }

      .autocomplete-input:focus {
        border-color: #ffaf00;
      }

      .autocomplete-input::placeholder {
        color: rgba(255, 255, 255, 0.4);
      }

      .autocomplete-results {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: rgba(44, 44, 46, 0.95);
        border: 1px solid rgba(84, 84, 88, 0.8);
        border-radius: var(--apple-input-radius, 10px);
        max-height: 200px;
        overflow-y: auto;
        z-index: 1000;
        display: none;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        min-width: 200px;
      }

      .autocomplete-results.show {
        display: block;
      }

      .autocomplete-result {
        padding: 12px 16px;
        cursor: pointer;
        border-bottom: 0.5px solid rgba(84, 84, 88, 0.2);
        transition: background 0.2s ease;
      }

      .autocomplete-result:last-child {
        border-bottom: none;
      }

      .autocomplete-result:hover {
        background: rgba(84, 84, 88, 0.3);
      }

      .autocomplete-result-name {
        color: white;
        font-size: 14px;
        font-weight: 500;
      }

      .autocomplete-result-id {
        color: rgba(255, 255, 255, 0.6);
        font-size: 12px;
        margin-top: 2px;
      }

      .selected-entities {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        min-height: 0;
        padding: 0;
        transition: all 0.3s ease;
      }

      .selected-entities:has(div) {
        margin-top: 16px;
      }

      .selected-entity-chip {
        display: flex;
        align-items: center;
        background: rgba(255, 175, 0, 0.2);
        border: 1px solid rgba(255, 175, 0, 0.4);
        border-radius: var(--apple-card-radius, 25px);
        padding: 6px 6px 6px 14px;
        gap: 8px;
        transition: all 0.2s ease;
      }

      .selected-entity-chip:hover {
        background: rgba(255, 175, 0, 0.3);
      }

      .entity-name {
        color: white;
        font-size: 13px;
        font-weight: 500;
      }

      .remove-entity {
        color: rgba(255, 255, 255, 0.6);
        cursor: pointer;
        width: 16px;
        height: 16px;
        --mdc-icon-size: 16px;
        transition: color 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .remove-entity:hover {
        color: white;
      }

      @media (max-width: 480px) {
        .apple-home-settings-modal {
          align-items: flex-end;
          justify-content: center;
        }

        .modal-content {
          width: 100vw;
          height: calc(100dvh - env(safe-area-inset-top) - 20px);
          max-width: 100vw;
          max-height: calc(100dvh - env(safe-area-inset-top) - 20px);
          border-radius: var(--apple-modal-radius, 20px) var(--apple-modal-radius, 20px) 0 0;
          transform: translateY(100%);
          opacity: 1;
          margin: 0;
        }

        .apple-home-settings-modal.show .modal-content {
          transform: translateY(0);
          opacity: 1;
        }
        
        .settings-section {
          padding: 16px;
        }
      }
      
      /* Extra small / accessibility screens */
      @media (max-width: 359px) {
        .modal-content {
          height: calc(100dvh - env(safe-area-inset-top) - 10px);
        }
        
        .modal-header h2 {
          font-size: 16px;
        }
        
        .settings-section {
          padding: 12px;
        }
        
        .setting-item-description {
          font-size: 12px;
        }
        
        .option-text {
          font-size: 15px;
        }
        
        .wallpaper-preview-image {
          width: 100px;
          height: 160px;
        }
      }
      
      /* Reduce motion for accessibility */
      @media (prefers-reduced-motion: reduce) {
        .modal-content,
        .selected-entities,
        .selected-entity-chip,
        .ui-setting-toggle,
        .toggle-switch {
          transition: none !important;
        }
      }

      /* Background Settings Styles */
      .wallpaper-options {
        margin-bottom: 24px;
      }

      .wallpaper-option-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 0;
        border-bottom: 1px solid rgba(84, 84, 88, 0.8);
        cursor: pointer;
        transition: background-color 0.2s ease;
        height: 25px;
      }
      .wallpaper-option-row:last-child {
        margin-bottom: 0;
      }

      .option-text {
        font-size: 17px;
        font-weight: 400;
        color: #ffffff;
      }

      .upload-text {
        color: #FF9500;
      }

      .option-arrow {
        --mdc-icon-size: 30px;
        color: rgba(255, 255, 255, 0.5);
      }

      .current-wallpaper-preview {
        display: flex;
        justify-content: center;
      }

      .wallpaper-preview-image {
        width: 120px;
        height: 200px;
        background-size: cover !important;
        background-position: center !important;
        background-repeat: no-repeat !important;
        border: 1px solid rgba(255, 255, 255, 0.1);
      }

      /* iOS 26 Flat Toggle Switch */
      .ui-setting-toggle {
        width: 51px;
        height: 22px;
        background: rgba(60, 60, 67, 0.45);
        border-radius: 11px;
        position: relative;
        transition: background-color 0.25s ease;
        cursor: pointer;
        border: none;
        outline: none;
      }

      .ui-setting-toggle.active {
        background: #30D158;
      }

      .toggle-switch {
        width: 27px;
        height: 18px;
        background: white;
        border-radius: 9px;
        position: absolute;
        top: 2px;
        left: 2px;
        transition: transform 0.25s cubic-bezier(0.23, 1, 0.32, 1);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
      }

      .ui-setting-toggle.active .toggle-switch {
        transform: translateX(20px);
      }

      /* Loading state styles */
      .apple-home-settings-modal.saving .modal-content {
        pointer-events: none;
      }

      .apple-home-settings-modal.saving .modal-done,
      .apple-home-settings-modal.saving .modal-cancel {
        pointer-events: none;
        opacity: 0.5;
      }

      .modal-done .save-spinner {
        display: none;
        width: 18px;
        height: 18px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      .apple-home-settings-modal.saving .modal-done ha-icon {
        display: none;
      }

      .apple-home-settings-modal.saving .modal-done .save-spinner {
        display: block;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `;
    
    document.head.appendChild(style);
  }

  private setupEventListeners() {
    if (!this.modal) return;

    // Cancel button
    const cancelBtn = this.modal.querySelector('.modal-cancel');
    cancelBtn?.addEventListener('click', () => this.closeModal());

    // Done button
    const doneBtn = this.modal.querySelector('.modal-done');
    doneBtn?.addEventListener('click', () => this.saveAndClose());

    // Backdrop click
    const backdrop = this.modal.querySelector('.modal-backdrop');
    backdrop?.addEventListener('click', () => this.closeModal());

    // Setup autocomplete for each section
    this.setupAutocomplete();

    // Setup remove entity buttons
    this.setupRemoveButtons();

    // Escape key
    document.addEventListener('keydown', this.handleEscapeKey);

    // Setup background settings
    this.setupBackgroundEventListeners();
  }

  private setupAutocomplete() {
    const selectors = this.modal?.querySelectorAll('.entity-selector');
    selectors?.forEach(selector => {
      const input = selector.querySelector('.autocomplete-input') as HTMLInputElement;
      const results = selector.querySelector('.autocomplete-results') as HTMLElement;
      const setting = selector.getAttribute('data-setting') as keyof HomeSettingsData;

      if (!input || !results || !setting) return;

      input.addEventListener('input', (e) => {
        const query = (e.target as HTMLInputElement).value.toLowerCase().trim();
        this.showAutocompleteResults(query, results, setting);
      });

      input.addEventListener('focus', (e) => {
        const query = (e.target as HTMLInputElement).value.toLowerCase().trim();
        this.showAutocompleteResults(query, results, setting);
      });

      // Hide results when clicking outside
      document.addEventListener('click', (e) => {
        if (!selector.contains(e.target as Node)) {
          results.classList.remove('show');
        }
      });

      // With absolute positioning, we don't need scroll repositioning
      // but we might want to resize on window resize
      const resizeHandler = () => {
        if (results.classList.contains('show')) {
          this.positionAutocompleteResults(results);
        }
      };
      
      window.addEventListener('resize', resizeHandler);
      
      // Store cleanup function for later
      (results as any)._cleanup = () => {
        window.removeEventListener('resize', resizeHandler);
      };
    });
  }

  private showAutocompleteResults(query: string, resultsContainer: HTMLElement, setting: keyof HomeSettingsData) {
    const alreadySelected = this.tempSettings[setting];
    
    // Use the appropriate entity list based on setting type
    let entityList: any[];
    if (setting === 'extraAccessories') {
      entityList = this.allEntitiesForInclusion;
    } else if (setting === 'favoriteAccessories') {
      // For favorites, include both available entities AND extra accessories
      // This allows users to set manually added entities as favorites
      const extraAccessoryIds = new Set(this.tempSettings.extraAccessories);
      const includedFromOtherList = this.allEntitiesForInclusion.filter(e => extraAccessoryIds.has(e.entity_id));
      entityList = [...this.availableEntities, ...includedFromOtherList];
    } else {
      entityList = this.availableEntities;
    }
    
    // Filter entities based on query and exclude already selected ones
    let filteredEntities = entityList.filter(entity => {
      const matchesQuery = query === '' || 
        entity.friendly_name.toLowerCase().includes(query) ||
        entity.entity_id.toLowerCase().includes(query);
      const notSelected = !Array.isArray(alreadySelected) || !alreadySelected.includes(entity.entity_id);
      
      // Exclude cameras from favorites
      if (setting === 'favoriteAccessories' && entity.domain === 'camera') {
        return false;
      }
      
      // Exclude switches from favorites, excludedFromDashboard, and excludedFromHome if showSwitches is disabled
      if (!this.tempSettings.showSwitches && entity.domain === 'switch') {
        if (setting === 'favoriteAccessories' || setting === 'excludedFromDashboard' || setting === 'excludedFromHome') {
          return false;
        }
      }
      
            // For included switches, only show switches that are not outlets and are available
      if (setting === 'includedSwitches') {
        if (entity.domain !== 'switch') {
          return false;
        }
        // Check if it's not an outlet (outlets typically have device_class of 'outlet' or contain 'outlet' in the name)
        const isOutlet = entity.attributes?.device_class === 'outlet' || 
                         entity.entity_id.toLowerCase().includes('outlet') ||
                         entity.friendly_name.toLowerCase().includes('outlet');
        if (isOutlet) {
          return false;
        }
        // Only show available entities (not unavailable, unknown, etc.)
        const isAvailable = entity.state && !['unavailable', 'unknown', 'none', 'null', ''].includes(entity.state.toLowerCase());
        if (!isAvailable) {
          return false;
        }
      }
      
      // For extraAccessories, only show entities that are not already part of the supported domains
      // (those are already in the dashboard)
      if (setting === 'extraAccessories') {
        // Only show available entities
        const isAvailable = entity.state && !['unavailable', 'unknown'].includes(entity.state.toLowerCase());
        if (!isAvailable) {
          return false;
        }
      }
      
      return matchesQuery && notSelected;
    }).slice(0, 10); // Limit to 10 results

    if (filteredEntities.length === 0 && query !== '') {
      resultsContainer.innerHTML = '<div class="autocomplete-result"><div class="autocomplete-result-name">No entities found</div></div>';
      this.positionAutocompleteResults(resultsContainer);
      resultsContainer.classList.add('show');
      return;
    }

    if (query === '' && filteredEntities.length === 0) {
      resultsContainer.classList.remove('show');
      return;
    }

    resultsContainer.innerHTML = filteredEntities.map(entity => `
      <div class="autocomplete-result" data-entity-id="${entity.entity_id}">
        <div class="autocomplete-result-name">${entity.friendly_name}</div>
        <div class="autocomplete-result-id">${entity.entity_id}</div>
      </div>
    `).join('');

    // Add click handlers
    resultsContainer.querySelectorAll('.autocomplete-result').forEach(result => {
      result.addEventListener('click', (e) => {
        const entityId = (e.currentTarget as HTMLElement).getAttribute('data-entity-id');
        if (entityId) {
          this.addEntityToSetting(entityId, setting);
          resultsContainer.classList.remove('show');
          // Clear input
          const input = resultsContainer.parentElement?.querySelector('.autocomplete-input') as HTMLInputElement;
          if (input) input.value = '';
        }
      });
    });

    // Position the dropdown
    this.positionAutocompleteResults(resultsContainer);
    resultsContainer.classList.add('show');
  }

  private positionAutocompleteResults(resultsContainer: HTMLElement) {
    // With absolute positioning, the dropdown automatically positions itself
    // relative to the autocomplete-container, so no manual positioning needed.
    // Just ensure it has the right width if we want to match the input
    const input = resultsContainer.parentElement?.querySelector('.autocomplete-input') as HTMLInputElement;
    if (input) {
      const inputRect = input.getBoundingClientRect();
      // Optional: Set a minimum width to match input, but let CSS handle the positioning
      if (resultsContainer.style.minWidth !== `${inputRect.width}px`) {
        resultsContainer.style.minWidth = `${inputRect.width}px`;
      }
    }
  }

  private refreshAutocompleteResults() {
    // Refresh autocomplete results for all currently visible autocomplete sections
    const selectors = this.modal?.querySelectorAll('.entity-selector');
    selectors?.forEach(selector => {
      const input = selector.querySelector('.autocomplete-input') as HTMLInputElement;
      const results = selector.querySelector('.autocomplete-results') as HTMLElement;
      const setting = selector.getAttribute('data-setting') as keyof HomeSettingsData;
      
      if (input && results && setting && results.classList.contains('show')) {
        const query = input.value.toLowerCase().trim();
        this.showAutocompleteResults(query, results, setting);
      }
    });
  }

  private addEntityToSetting(entityId: string, setting: keyof HomeSettingsData) {
    const settingValue = this.tempSettings[setting];
    if (Array.isArray(settingValue) && !settingValue.includes(entityId)) {
      settingValue.push(entityId);
      this.updateSelectedEntitiesDisplay(setting);
    }
  }

  private removeEntityFromSetting(entityId: string, setting: keyof HomeSettingsData) {
    const settingValue = this.tempSettings[setting];
    if (Array.isArray(settingValue)) {
      const index = settingValue.indexOf(entityId);
      if (index > -1) {
        settingValue.splice(index, 1);
        this.updateSelectedEntitiesDisplay(setting);
      }
    }
  }

  private updateSelectedEntitiesDisplay(setting: keyof HomeSettingsData) {
    const selector = this.modal?.querySelector(`[data-setting="${setting}"]`);
    const selectedContainer = selector?.querySelector('.selected-entities');
    if (selectedContainer) {
      const settingValue = this.tempSettings[setting];
      if (Array.isArray(settingValue)) {
        // Use the appropriate render method for extra accessories
        if (setting === 'extraAccessories') {
          selectedContainer.innerHTML = this.renderSelectedEntitiesForInclusion(settingValue);
        } else {
          selectedContainer.innerHTML = this.renderSelectedEntities(settingValue);
        }
        this.setupRemoveButtons();
      }
    }
  }

  private setupRemoveButtons() {
    this.modal?.querySelectorAll('.remove-entity').forEach(button => {
      button.addEventListener('click', (e) => {
        const chip = (e.target as HTMLElement).closest('.selected-entity-chip');
        const entityId = chip?.getAttribute('data-entity-id');
        const selector = (e.target as HTMLElement).closest('.entity-selector');
        const setting = selector?.getAttribute('data-setting') as keyof HomeSettingsData;
        
        if (entityId && setting) {
          this.removeEntityFromSetting(entityId, setting);
        }
      });
    });
  }

  private showModal() {
    if (!this.modal) return;
    
    // Block background scrolling
    document.body.style.overflow = 'hidden';
    
    requestAnimationFrame(() => {
      this.modal?.classList.add('show');
    });
  }

  private closeModal() {
    if (!this.modal) return;

    // Cleanup autocomplete event listeners
    this.modal.querySelectorAll('.autocomplete-results').forEach(results => {
      if ((results as any)._cleanup) {
        (results as any)._cleanup();
      }
    });

    // Restore background scrolling
    document.body.style.overflow = '';

    this.modal.classList.remove('show');
    
    setTimeout(() => {
      document.removeEventListener('keydown', this.handleEscapeKey);
      if (this.modal && this.modal.parentNode) {
        this.modal.parentNode.removeChild(this.modal);
      }
      this.modal = undefined;
    }, 300);
  }

  private async saveAndClose() {
    // Show loading state immediately
    if (this.modal) {
      this.modal.classList.add('saving');
    }

    // Check if changes require a full re-render (entity list changes) vs just DOM updates (UI/background)
    this.requiresRender = 
      JSON.stringify(this.settings.favoriteAccessories) !== JSON.stringify(this.tempSettings.favoriteAccessories) ||
      JSON.stringify(this.settings.excludedFromDashboard) !== JSON.stringify(this.tempSettings.excludedFromDashboard) ||
      JSON.stringify(this.settings.excludedFromHome) !== JSON.stringify(this.tempSettings.excludedFromHome) ||
      JSON.stringify(this.settings.includedSwitches) !== JSON.stringify(this.tempSettings.includedSwitches) ||
      JSON.stringify(this.settings.extraAccessories) !== JSON.stringify(this.tempSettings.extraAccessories) ||
      this.settings.showSwitches !== this.tempSettings.showSwitches;
    
    // Apply temporary settings to actual settings
    this.settings.favoriteAccessories = [...this.tempSettings.favoriteAccessories];
    this.settings.excludedFromDashboard = [...this.tempSettings.excludedFromDashboard];
    this.settings.excludedFromHome = [...this.tempSettings.excludedFromHome];
    this.settings.includedSwitches = [...this.tempSettings.includedSwitches];
    this.settings.extraAccessories = [...this.tempSettings.extraAccessories];
    this.settings.backgroundType = this.tempSettings.backgroundType;
    this.settings.customBackground = this.tempSettings.customBackground;
    this.settings.presetBackground = this.tempSettings.presetBackground;
    this.settings.hideHeader = this.tempSettings.hideHeader;
    this.settings.hideSidebar = this.tempSettings.hideSidebar;
    this.settings.showSwitches = this.tempSettings.showSwitches;

    // Start modal fade immediately (while save happens in parallel)
    if (this.modal) {
      this.modal.style.transition = 'opacity 0.3s ease-out';
      this.modal.style.opacity = '0';
    }
    
    // Run save operation (this is the potentially slow part)
    try {
      await this.saveSettings();
    } catch (error) {
      console.error('Error saving settings:', error);
    }

    // Apply visual changes immediately (these are fast DOM operations)
    this.applyVisualChanges();
    
    // Clean up modal after fade animation
    setTimeout(() => {
      // Restore background scrolling
      document.body.style.overflow = '';
      
      // Remove modal from DOM
      document.removeEventListener('keydown', this.handleEscapeKey);
      if (this.modal && this.modal.parentNode) {
        this.modal.parentNode.removeChild(this.modal);
      }
      this.modal = undefined;
      
      // Trigger callback if re-render is needed
      if (this.onSaveCallback && this.requiresRender) {
        this.onSaveCallback();
      }
    }, 300);
  }

  /**
   * Apply visual changes immediately without waiting for storage
   */
  private applyVisualChanges(): void {
    // Apply background immediately using applyBackgroundOnly (no save)
    const backgroundManagerConfig = {
      type: this.settings.backgroundType,
      backgroundImage: this.settings.backgroundType === 'custom' 
        ? this.settings.customBackground 
        : this.settings.presetBackground
    };
    const backgroundManager = new BackgroundManager(this.customizationManager);
    backgroundManager.applyBackgroundOnly(backgroundManagerConfig);
    
    // Apply UI settings immediately using HomeAssistantUIManager
    const uiManager = HomeAssistantUIManager.initializeWithCustomizations(this.customizationManager);
    uiManager.reapplyDashboardSettings();
  }

  private async saveSettings() {
    // Prepare all section updates
    const home = this.customizationManager.getCustomization('home') || {};
    home.favorites = this.settings.favoriteAccessories;
    home.excluded_from_dashboard = this.settings.excludedFromDashboard;
    home.excluded_from_home = this.settings.excludedFromHome;
    home.included_switches = this.settings.includedSwitches;
    home.extra_accessories = this.settings.extraAccessories;
    home.show_switches = this.settings.showSwitches;
    
    const ui = this.customizationManager.getCustomization('ui') || {};
    ui.hide_header = this.settings.hideHeader;
    ui.hide_sidebar = this.settings.hideSidebar;

    const background = {
      type: this.settings.backgroundType,
      value: this.settings.backgroundType === 'custom' 
        ? this.settings.customBackground 
        : this.settings.presetBackground
    };
    
    // Single batch save operation instead of 3-4 separate saves
    await this.customizationManager.batchSetCustomizations({
      home,
      ui,
      background
    });
  }

  private setupBackgroundEventListeners() {
    if (!this.modal) return;

    // Handle wallpaper option row clicks
    const wallpaperRows = this.modal.querySelectorAll('.wallpaper-option-row');
    wallpaperRows.forEach(row => {
      row.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const action = target.dataset.action;
        
        if (action === 'upload') {
          // Upload photo
          document.getElementById('background-file-input')?.click();
        } else if (action === 'presets') {
          // Open presets selection view
          this.openPresetsView();
        }
      });
    });

    // Handle file upload
    const fileInput = this.modal.querySelector('#background-file-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.addEventListener('change', async (e) => {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0];
        if (file) {
          await this.handleBackgroundFileUpload(file);
        }
      });
    }

    // Handle direct toggle clicks only
    const headerToggle = this.modal.querySelector('#header-toggle');
    const sidebarToggle = this.modal.querySelector('#sidebar-toggle');
    const switchesToggle = this.modal.querySelector('#switches-toggle');
    
    headerToggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.tempSettings.hideHeader = !this.tempSettings.hideHeader;
      this.updateUIToggle('header-toggle', this.tempSettings.hideHeader);
    });
    
    sidebarToggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.tempSettings.hideSidebar = !this.tempSettings.hideSidebar;
      this.updateUIToggle('sidebar-toggle', this.tempSettings.hideSidebar);
    });
    
    switchesToggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.tempSettings.showSwitches = !this.tempSettings.showSwitches;
      this.updateUIToggle('switches-toggle', this.tempSettings.showSwitches || false);

      // Show/hide the included switches section based on the showSwitches setting
      const includedSwitchesSection = this.modal?.querySelector('#included-switches-section') as HTMLElement;
      if (includedSwitchesSection) {
        includedSwitchesSection.style.display = this.tempSettings.showSwitches ? 'none' : 'block';
      }
      
      // Refresh autocomplete results for all sections that might have switch entities visible
      this.refreshAutocompleteResults();
    });

    setTimeout(() => {
      this.updateCurrentWallpaperPreview();
      this.initializeUIToggles();
    }, 100);
  }

  private updateCurrentWallpaperPreview() {
    const previewElement = this.modal?.querySelector('#current-wallpaper-preview') as HTMLElement;
    if (!previewElement) {
      return;
    }

    let backgroundStyle = '';
    
    // Use tempSettings to show immediate preview of changes
    if (this.tempSettings.backgroundType === 'custom' && this.tempSettings.customBackground) {
      backgroundStyle = this.tempSettings.customBackground;
    } else if (this.tempSettings.backgroundType === 'preset' && this.tempSettings.presetBackground) {
      backgroundStyle = BackgroundManager.getPresetBackground(this.tempSettings.presetBackground);
    } else {
      backgroundStyle = BackgroundManager.getDefaultBackground();
    }
    
    // Clear existing styles first
    previewElement.style.removeProperty('background');
    previewElement.style.removeProperty('background-image');
    
    // Apply the background style
    if (backgroundStyle.startsWith('url(')) {
      previewElement.style.setProperty('background-image', backgroundStyle);
      } else {
      previewElement.style.setProperty('background', backgroundStyle);
      }
    
    // Also check computed styles
    const computedStyles = window.getComputedStyle(previewElement);
    }

  private updateUIToggle(toggleId: string, isActive: boolean) {
    const toggle = this.modal?.querySelector(`#${toggleId}`) as HTMLElement;
    if (toggle) {
      if (isActive) {
        toggle.classList.add('active');
      } else {
        toggle.classList.remove('active');
      }
    }
  }

  private initializeUIToggles() {
    this.updateUIToggle('header-toggle', this.tempSettings.hideHeader || false);
    this.updateUIToggle('sidebar-toggle', this.tempSettings.hideSidebar || false);
    this.updateUIToggle('switches-toggle', this.tempSettings.showSwitches || false);
  }

  private openPresetsView() {
    // Create and show a presets selection modal/view
    const presetsModal = document.createElement('div');
    presetsModal.className = 'presets-selection-modal';
    
    presetsModal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content presets-content">
        <div class="modal-header">
          <button class="modal-cancel ${LiquidGlassClasses.modalCancel}">
            <ha-icon icon="mdi:close"></ha-icon>
          </button>
          <h2>${localize('ui_actions.choose_wallpaper')}</h2>
          <button class="modal-done ${LiquidGlassClasses.modalDone}">
            <ha-icon icon="mdi:check"></ha-icon>
          </button>
        </div>
        <div class="modal-body">
          <div class="presets-grid">
            ${BackgroundManager.getPresetNames().map(presetName => `
              <div class="preset-option ${this.tempSettings.backgroundType === 'preset' && this.tempSettings.presetBackground === presetName ? 'selected' : ''}" 
                   data-preset="${presetName}">
                <div class="preset-preview" style="background: ${BackgroundManager.getPresetBackground(presetName)}"></div>
                <div class="preset-name">${this.formatPresetName(presetName)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    // Add presets modal styles
    this.addPresetsModalStyles();
    
    document.body.appendChild(presetsModal);

    // Setup presets modal event listeners
    this.setupPresetsModalEventListeners(presetsModal);
    
    // Show the modal with animation
    requestAnimationFrame(() => {
      presetsModal.classList.add('show');
    });
  }

  private addPresetsModalStyles() {
    // Don't add styles if they already exist
    if (document.querySelector('#presets-modal-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'presets-modal-styles';
    style.textContent = `
      .presets-selection-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 10001;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .presets-selection-modal.show {
        opacity: 1;
      }

      .presets-selection-modal .modal-backdrop {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }

      .presets-content {
        position: relative;
        width: 700px;
        max-width: 90vw;
        max-height: 85vh;
        background: rgba(28, 28, 30, 1);
        border-radius: var(--apple-modal-radius, 20px);
        overflow-y: auto;
        overflow-x: hidden;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
        transform: scale(0.9);
        opacity: 0;
        transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      }

      .presets-selection-modal.show .presets-content {
        transform: scale(1);
        opacity: 1;
      }

      .presets-content .modal-header {
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        position: sticky;
        top: 0;
        z-index: 10;
      }

      .presets-content .modal-header::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: -30px;
        background: linear-gradient(
          to bottom,
          rgba(28, 28, 30, 1) 0%,
          rgba(28, 28, 30, 0.95) 30%,
          rgba(28, 28, 30, 0.7) 60%,
          rgba(28, 28, 30, 0) 100%
        );
        z-index: -1;
        pointer-events: none;
      }

      .presets-content .modal-header h2 {
        margin: 0;
        font-size: 17px;
        font-weight: 600;
        color: white;
        text-align: center;
        flex: 1;
      }

      .presets-content .modal-body {
        padding: 20px;
        padding-bottom: 20px;
      }

      .presets-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 16px;
        padding: 0;
      }

      .preset-option {
        cursor: pointer;
        border-radius: var(--apple-card-radius, 25px);
        padding: 8px;
        background: rgba(255, 255, 255, 0.05);
        transition: all 0.3s ease;
        border: 2px solid transparent;
        position: relative;
      }

      .preset-option:hover {
        background: rgba(255, 255, 255, 0.08);
        transform: translateY(-2px);
      }

      .preset-option.selected {
        border-color: #ffaf00;
        background: rgba(255, 175, 0, 0.1);
      }

      .preset-option.selected::after {
        content: '✓';
        position: absolute;
        top: 8px;
        right: 8px;
        background: #ffaf00;
        color: white;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: bold;
      }

      .preset-preview {
        width: 100%;
        height: 100px;
        border-radius: var(--apple-input-radius, 10px);
        background-size: cover !important;
        background-position: center !important;
        margin-bottom: 8px;
        position: relative;
        overflow: hidden;
      }

      .preset-name {
        text-align: center;
        font-size: 14px;
        font-weight: 500;
        color: #ffffff;
      }

      /* Presets modal button positioning */
      .presets-content .modal-cancel,
      .presets-content .modal-done {
        z-index: 2;
      }

      @media (max-width: 480px) {
        .presets-selection-modal {
          align-items: flex-end;
          justify-content: center;
        }

        .presets-content {
          width: 100vw;
          height: calc(100dvh - env(safe-area-inset-top) - 20px);
          max-width: 100vw;
          max-height: calc(100dvh - env(safe-area-inset-top) - 20px);
          border-radius: var(--apple-modal-radius, 20px) var(--apple-modal-radius, 20px) 0 0;
          transform: translateY(100%);
          opacity: 1;
          margin: 0;
        }

        .presets-selection-modal.show .presets-content {
          transform: translateY(0);
          opacity: 1;
        }
      }
    `;
    
    document.head.appendChild(style);
  }

  private setupPresetsModalEventListeners(presetsModal: HTMLElement) {
    // Store original settings for potential revert
    const originalSettings = {
      backgroundType: this.tempSettings.backgroundType,
      presetBackground: this.tempSettings.presetBackground,
      customBackground: this.tempSettings.customBackground
    };

    // Cancel button (X)
    const cancelBtn = presetsModal.querySelector('.modal-cancel');
    cancelBtn?.addEventListener('click', () => {
      // Revert temp settings to original state
      this.tempSettings.backgroundType = originalSettings.backgroundType;
      this.tempSettings.presetBackground = originalSettings.presetBackground;
      this.tempSettings.customBackground = originalSettings.customBackground;
      
      // Update the main modal preview to show reverted state
      this.updateCurrentWallpaperPreview();
      
      this.closePresetsModal(presetsModal);
    });

    // Done button (checkmark) - save and close
    const doneBtn = presetsModal.querySelector('.modal-done');
    doneBtn?.addEventListener('click', () => {
      // Keep current temp settings (already set by preset selection)
      this.updateCurrentWallpaperPreview();
      this.closePresetsModal(presetsModal);
    });

    // Backdrop click (treat as cancel)
    const backdrop = presetsModal.querySelector('.modal-backdrop');
    backdrop?.addEventListener('click', () => {
      // Revert temp settings to original state
      this.tempSettings.backgroundType = originalSettings.backgroundType;
      this.tempSettings.presetBackground = originalSettings.presetBackground;
      this.tempSettings.customBackground = originalSettings.customBackground;
      
      // Update the main modal preview to show reverted state
      this.updateCurrentWallpaperPreview();
      
      this.closePresetsModal(presetsModal);
    });

    // Preset selection - select but don't close (user clicks checkmark to confirm)
    const presetOptions = presetsModal.querySelectorAll('.preset-option');
    presetOptions.forEach(option => {
      option.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const preset = target.dataset.preset;
        
        if (preset) {
          // Update temp settings immediately
          this.tempSettings.backgroundType = 'preset';
          this.tempSettings.presetBackground = preset;
          
          // Update visual selection
          presetsModal.querySelectorAll('.preset-option').forEach(opt => {
            opt.classList.remove('selected');
          });
          target.classList.add('selected');
          
          // Update the main modal preview
          this.updateCurrentWallpaperPreview();
        }
      });
    });
  }

  private closePresetsModal(presetsModal: HTMLElement) {
    presetsModal.classList.remove('show');
    
    setTimeout(() => {
      if (presetsModal.parentNode) {
        presetsModal.parentNode.removeChild(presetsModal);
      }
      
      // Remove styles when no longer needed
      const styleElement = document.querySelector('#presets-modal-styles');
      if (styleElement) {
        styleElement.remove();
      }
    }, 300);
  }

  private async handleBackgroundFileUpload(file: File) {
    if (!file || !file.type.startsWith('image/')) {
      alert(localize('errors.invalid_image'));
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      alert(localize('errors.file_size_limit'));
      return;
    }

    try {
      const dataUrl = await BackgroundManager.imageToDataUrl(file);
      this.tempSettings.customBackground = dataUrl;
      this.tempSettings.backgroundType = 'custom';
      
      // Immediately update the current wallpaper preview
      this.updateCurrentWallpaperPreview();
      
    } catch (error) {
      console.error('Error converting image to base64:', error);
      alert(localize('errors.image_processing'));
    }
  }

  private handleEscapeKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      this.closeModal();
    }
  };

  public destroy() {
    this.closeModal();
    
    // Remove styles
    const styleElement = document.querySelector('#apple-home-settings-styles');
    if (styleElement) {
      styleElement.remove();
    }
  }
}
