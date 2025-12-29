import { DashboardConfig } from '../config/DashboardConfig';
import { SnapshotManager } from '../utils/SnapshotManager';
import { CardConfig, EntityState } from '../types/types';
import { localize } from '../utils/LocalizationService';
import { RTLHelper } from '../utils/RTLHelper';

export class AppleHomeCard extends HTMLElement {
  private config?: CardConfig;
  private _hass?: any;
  private entity?: string;
  private name?: string;
  private domain?: string;
  private isTall?: boolean;
  private defaultIcon?: string;
  private cameraView?: string;
  private refreshInterval?: number;
  private snapshotManager?: SnapshotManager;
  private cameraSnapshotFailed?: boolean = false;
  private cameraImages: HTMLImageElement[] = [];
  private visibleImageIndex: number = 0;
  private queryTimer?: number;
  private lastDisplayedTimestamp?: number;
  private boundCardClick?: (e: Event) => void;
  private boundIconClick?: (e: Event) => void;

  constructor() {
    super();
  }

  connectedCallback() {
    // If this is a camera card being reattached (has snapshotManager but no images/timer),
    // we need to reinitialize the display since render() won't be called
    if (this.domain === 'camera' && this.cameraView === 'snapshot' && 
        this.snapshotManager && this.cameraImages.length === 0 && !this.queryTimer) {
      // Use setTimeout to ensure shadowRoot content is ready
      setTimeout(() => {
        const cameraContainer = this.shadowRoot?.querySelector('.camera-container') as HTMLElement;
        if (cameraContainer && this.cameraImages.length === 0) {
          this.setupCameraImages(cameraContainer);
          this.lastDisplayedTimestamp = undefined; // Force showing current snapshot
          this.queryAndUpdateSnapshot();
          
          if (!this.queryTimer) {
            this.queryTimer = window.setInterval(() => {
              this.queryAndUpdateSnapshot();
            }, 1000);
          }
        }
      }, 50);
    }
  }

  disconnectedCallback() {
    this.cleanup();
  }

  private cleanup() {
    // Clear query timer
    if (this.queryTimer) {
      clearInterval(this.queryTimer);
      this.queryTimer = undefined;
    }
    
    // Remove click event listeners
    if (this.shadowRoot) {
      const card = this.shadowRoot.querySelector('.apple-home-card');
      const icon = this.shadowRoot.querySelector('.info-icon');
      
      if (card && this.boundCardClick) {
        card.removeEventListener('click', this.boundCardClick);
      }
      if (icon && this.boundIconClick) {
        icon.removeEventListener('click', this.boundIconClick);
      }
    }
    
    // Clean up camera resources
    this.cameraImages.forEach(img => {
      img.remove();
    });
    this.cameraImages = [];
    
    // Note: We don't unregister from SnapshotManager here because the camera
    // might still be valid and we want background fetching to continue
  }

  static getStubConfig() {
    return { entity: 'light.example' };
  }

  setConfig(config: CardConfig) {
    if (!config.entity) {
      throw new Error('You need to define an entity');
    }
    this.config = config;
    this.entity = config.entity;
    this.name = config.name;
    this.domain = config.domain || config.entity.split('.')[0];
    this.isTall = config.is_tall || false;
    this.defaultIcon = (config as any).default_icon;
    this.cameraView = (config as any).camera_view;
    this.refreshInterval = (config as any).refresh_interval || 10000;
    
    // Set design class based on configuration
    this.className = this.isTall ? 'tall-design' : 'regular-design';
  }

  set hass(hass: any) {
    const oldHass = this._hass;
    this._hass = hass;
    
    // Update snapshot manager if it exists
    if (this.snapshotManager) {
      this.snapshotManager.setHass(hass);
    }
    
    if (!oldHass) {
      this.render();
    } else if (this.entity && oldHass.states[this.entity] && hass.states[this.entity]) {
      const oldState = oldHass.states[this.entity];
      const newState = hass.states[this.entity];
      
      if (oldState.state !== newState.state || 
          oldState.attributes.brightness !== newState.attributes.brightness ||
          JSON.stringify(oldState.attributes.rgb_color) !== JSON.stringify(newState.attributes.rgb_color)) {
        this.render();
      }
    } else if (this.entity && (!oldHass.states[this.entity] || !hass.states[this.entity])) {
      this.render();
    }
  }

  get hass() {
    return this._hass;
  }

  private render() {
    if (!this._hass || !this.entity) {
      return;
    }
    
    const state = this._hass.states[this.entity];
    if (!state) {
      this.renderErrorState(localize('errors.entity_not_found'));
      return;
    }
    
    const name = this.name || state.attributes.friendly_name || this.entity.split('.')[1].replace(/_/g, ' ');
    
    // Check if we're in a status section context (modal or status chips)
    const isInStatusContext = this.closest('.status-modal-cards') || this.closest('.status-chips-container');
    const forceWhiteIcons = Boolean(isInStatusContext);
    
    const entityData = DashboardConfig.getEntityData(state, this.domain!, this.isTall, forceWhiteIcons);
    
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
    }
    
    // For camera cards, clear the timer and image references before re-rendering
    // The innerHTML replacement will destroy the DOM elements, so we need fresh references
    if (this.domain === 'camera' && this.cameraView === 'snapshot') {
      if (this.queryTimer) {
        clearInterval(this.queryTimer);
        this.queryTimer = undefined;
      }
      this.cameraImages = [];
      this.lastDisplayedTimestamp = undefined;
    }

    // Check if we're in edit mode by looking at parent wrapper
    const isEditMode = this.closest('.entity-card-wrapper')?.classList.contains('edit-mode') || false;

    // Create icon or temperature display or camera snapshot
    let iconElement: string;
    let tempText = '';

    if (this.domain === 'climate' && state.attributes.current_temperature !== undefined) {
      tempText = `${state.attributes.current_temperature.toFixed(1)}°`;
    } else {
      tempText = `--.-°`;
    }
    
    if (this.domain === 'climate') {
      iconElement = `
        <div class="info-icon temperature-display">
          <span class="temperature-text" dir="ltr">${tempText}</span>
        </div>
      `;
    } else if (this.domain === 'camera' && this.cameraView === 'snapshot') {
      const state = this._hass.states[this.entity!];
      const cameraState = state?.state;
      
      // Check if camera entity is unavailable
      if (!cameraState || cameraState === 'unavailable' || cameraState === 'unknown' || cameraState === 'off') {
        // Camera entity unavailable - show camera-off icon
        iconElement = `
          <div class="camera-icon-unavailable">
            <ha-icon icon="mdi:camera-off"></ha-icon>
          </div>
        `;
      } else if (this.cameraSnapshotFailed) {
        // Camera available but snapshot failed - show camera icon
        iconElement = `
          <div class="camera-icon-no-snapshot">
            <ha-icon icon="mdi:camera"></ha-icon>
          </div>
        `;
      } else {
        // Camera available and should have snapshot - show container
        iconElement = `
          <div class="camera-container">
            <div class="camera-overlay">
              <span class="camera-timestamp" id="camera-timestamp-${this.entity?.replace(/\./g, '-')}"></span>
            </div>
          </div>
        `;
      }
    } else {
      // Use default icon if specified, otherwise use entity icon
      const icon = this.defaultIcon || entityData.icon;
      
      // For scenes, scripts, and buttons, use a button-style icon without circle
      if (this.domain === 'scene' || this.domain === 'script' || this.domain === 'button' || this.domain === 'input_button') {
        iconElement = `
          <div class="info-icon scene-icon">
            <ha-icon icon="${icon}"></ha-icon>
          </div>
        `;
      } else {
        iconElement = `
          <div class="info-icon">
            <ha-icon icon="${icon}"></ha-icon>
          </div>
        `;
      }
    }
    
    this.shadowRoot!.innerHTML = `
      <style>
        ${this.getCardStyles(entityData, isEditMode)}
      </style>
      <div class="apple-home-card ${isEditMode ? 'edit-mode' : ''} ${this.domain === 'camera' && this.cameraView === 'snapshot' ? 'camera-card' : ''} ${RTLHelper.isRTL() ? 'rtl' : 'ltr'}">
        <div class="card-info">
          ${iconElement}
          ${this.domain === 'camera' && this.cameraView === 'snapshot' ? (() => {
            const state = this._hass.states[this.entity!];
            const cameraState = state?.state;
            
            // Show text content for unavailable cameras or snapshot failures
            if (!cameraState || cameraState === 'unavailable' || cameraState === 'unknown' || cameraState === 'off') {
              return `
                <div class="text-content camera-text">
                  <div class="entity-name">${name}</div>
                  <div class="entity-state camera-status">${localize('status_messages.unavailable')}</div>
                </div>
              `;
            } else if (this.cameraSnapshotFailed) {
              return `
                <div class="text-content camera-text">
                  <div class="entity-name">${name}</div>
                  <div class="entity-state camera-status">${localize('camera.no_snapshot_available')}</div>
                </div>
              `;
            }
            return ''; // No text content for working cameras
          })() : this.domain === 'camera' ? '' : `
          <div class="text-content">
            <div class="entity-name">${name}</div>
            ${(this.domain === 'scene' || this.domain === 'script' || this.domain === 'button' || this.domain === 'input_button') ? '' : `<div class="entity-state">${entityData.stateText}</div>`}
          </div>
          `}
        </div>
      </div>
    `;
    
    // Add click handlers only if not in edit mode
    if (!isEditMode) {
      this.setupClickHandlers();
    }
    
    // Initialize camera if this is a camera card AND camera is available
    if (this.domain === 'camera' && this.cameraView === 'snapshot' && this._hass && this.entity) {
      const state = this._hass.states[this.entity];
      const cameraState = state?.state;
      
      // Only clean up snapshot manager if camera is truly unavailable
      if (this.snapshotManager && 
          cameraState && 
          (cameraState === 'unavailable' || cameraState === 'unknown' || cameraState === 'off')) {
        this.cleanupCamera();
        this.cameraSnapshotFailed = false;
      }
      
      // Initialize camera display if camera is available
      if (cameraState && cameraState !== 'unavailable' && cameraState !== 'unknown' && cameraState !== 'off') {
        setTimeout(() => {
          const cameraContainer = this.shadowRoot?.querySelector('.camera-container') as HTMLElement;
          if (cameraContainer && this.cameraImages.length === 0) {
            // Get or create snapshot manager
            if (!this.snapshotManager) {
              this.snapshotManager = SnapshotManager.getInstance();
              this.snapshotManager.setHass(this._hass);
              this.snapshotManager.registerCamera(this.entity!);
            }
            
            // Setup camera images in the container
            this.setupCameraImages(cameraContainer);
            
            // Immediately check for existing snapshot and display it
            this.queryAndUpdateSnapshot();
            
            // Start query timer to check for new snapshots every second
            if (!this.queryTimer) {
              this.queryTimer = window.setInterval(() => {
                this.queryAndUpdateSnapshot();
              }, 1000);
            }
          }
        }, 100);
      }
    }
  }

  private initializeCamera(cameraContainer: HTMLElement, isEditMode: boolean): void {
    // Get snapshot manager (or reuse existing one)
    if (!this.snapshotManager) {
      this.snapshotManager = SnapshotManager.getInstance();
      this.snapshotManager.setHass(this._hass);
    }
    
    // Setup camera images in the container
    this.setupCameraImages(cameraContainer);
    
    // Register camera with snapshot manager (will reuse existing registration if it exists)
    this.snapshotManager.registerCamera(this.entity!);
    
    // Immediately check for existing snapshot and display it
    this.queryAndUpdateSnapshot();
    
    // Start query timer to check for new snapshots every second
    this.queryTimer = window.setInterval(() => {
      this.queryAndUpdateSnapshot();
    }, 1000);
  }

  private queryAndUpdateSnapshot(): void {
    if (!this.snapshotManager || !this.entity) {
      return;
    }

    const snapshotData = this.snapshotManager.getSnapshot(this.entity);
    if (!snapshotData) {
      return;
    }

    // Check if we have a new snapshot to display
    if (snapshotData.base64Data && snapshotData.timestamp !== this.lastDisplayedTimestamp) {
      this.handleSnapshotReceived(snapshotData.base64Data);
      this.lastDisplayedTimestamp = snapshotData.timestamp;
      this.cameraSnapshotFailed = false;
    } else if (snapshotData.hasError) {
      this.handleCameraSnapshotFailed();
    }

    // Update timestamp display
    this.updateCameraTimestamp();
  }

  private setupCameraImages(container: HTMLElement): void {
    // Create exactly 2 image elements stacked on top of each other
    for (let i = 0; i < 2; i++) {
      const img = document.createElement('img');
      img.className = 'camera-snapshot';
      img.draggable = false; // Prevent native image dragging
      img.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: inherit;
        transition: opacity 0.3s ease;
        border: none;
        outline: none;
        box-shadow: none;
        pointer-events: none;
        -webkit-user-drag: none;
        user-select: none;
      `;
      
      // Both images start hidden until we have content to show
      img.style.opacity = '0';
      img.style.zIndex = i === 0 ? '2' : '1';
      
      container.appendChild(img);
      this.cameraImages.push(img);
    }
  }

  private handleSnapshotReceived(base64Data: string): void {
    if (!this.cameraImages || this.cameraImages.length < 2) {
      return;
    }
    
    this.cameraSnapshotFailed = false;
    
    // Update the visible image
    const hiddenImageIndex = this.visibleImageIndex === 0 ? 1 : 0;
    const hiddenImage = this.cameraImages[hiddenImageIndex];
    const visibleImage = this.cameraImages[this.visibleImageIndex];

    if (!hiddenImage || !visibleImage) {
      return;
    }

    const onLoad = () => {
      hiddenImage.style.opacity = '1';
      hiddenImage.style.zIndex = '2';
      visibleImage.style.opacity = '0';
      visibleImage.style.zIndex = '1';
      
      this.visibleImageIndex = hiddenImageIndex;
      
      hiddenImage.removeEventListener('load', onLoad);
      hiddenImage.removeEventListener('error', onError);
    };

    const onError = () => {
      hiddenImage.removeEventListener('load', onLoad);
      hiddenImage.removeEventListener('error', onError);
    };

    hiddenImage.addEventListener('load', onLoad);
    hiddenImage.addEventListener('error', onError);
    
    hiddenImage.src = base64Data;
  }

  private cleanupCamera(): void {
    // Clear query timer
    if (this.queryTimer) {
      clearInterval(this.queryTimer);
      this.queryTimer = undefined;
    }
    
    // Remove camera images from DOM
    this.cameraImages.forEach(img => {
      img.remove();
    });
    this.cameraImages = [];
    
    // Reset display state
    this.lastDisplayedTimestamp = undefined;
    
    // Only unregister from SnapshotManager if camera is actually unavailable
    // Don't unregister during navigation - preserve the background fetching
    if (this._hass && this.entity) {
      const state = this._hass.states[this.entity];
      const cameraState = state?.state;
      
      if (!cameraState || cameraState === 'unavailable' || cameraState === 'unknown' || cameraState === 'off') {
        // Camera is truly unavailable - unregister it
        if (this.snapshotManager) {
          this.snapshotManager.unregisterCamera(this.entity);
        }
        this.snapshotManager = undefined;
      }
    } else {
      // No hass or entity - safe to fully cleanup
      if (this.snapshotManager && this.entity) {
        this.snapshotManager.unregisterCamera(this.entity);
      }
      this.snapshotManager = undefined;
    }
  }

  private setupClickHandlers() {
    const card = this.shadowRoot!.querySelector('.apple-home-card') as HTMLElement;
    const icon = this.shadowRoot!.querySelector('.info-icon') as HTMLElement;
    
    // Store bound references for cleanup
    this.boundCardClick = this.handleCardClick.bind(this);
    this.boundIconClick = this.handleIconClick.bind(this);
    
    if (card) {
      card.addEventListener('click', this.boundCardClick);
    }
    
    if (icon) {
      icon.addEventListener('click', this.boundIconClick);
    }
  }

  // Public method to force re-render when edit mode changes
  public refreshEditMode() {
    // Check if we're transitioning edit modes for camera cards
    const isEditMode = this.closest('.entity-card-wrapper')?.classList.contains('edit-mode') || false;
    
    if (this.domain === 'camera' && this.cameraView === 'snapshot' && this.snapshotManager) {
      // For camera cards, don't re-render because it destroys the DOM that SnapshotManager references
      // Just update the edit mode class on the existing card
      const card = this.shadowRoot?.querySelector('.apple-home-card');
      if (card) {
        if (isEditMode) {
          card.classList.add('edit-mode');
        } else {
          card.classList.remove('edit-mode');
        }
      }
      return; // Don't call render() for camera cards
    }
    
    // For non-camera cards, proceed with normal re-render
    this.render();
  }

  private renderErrorState(message: string) {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
    }
    
    this.shadowRoot!.innerHTML = `
      <style>
        .error-card {
          background: rgba(255, 59, 48, 0.1);
          border: 1px solid rgba(255, 59, 48, 0.3);
          border-radius: 16px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          height: 100%;
          box-sizing: border-box;
        }
        .error-text {
          color: #ff3b30;
          font-size: 14px;
          font-weight: 500;
          margin-bottom: 4px;
        }
        .entity-text {
          color: rgba(255, 59, 48, 0.6);
          font-size: 12px;
        }
      </style>
      <div class="error-card">
        <div class="error-text">${message}</div>
        <div class="entity-text">${this.entity}</div>
      </div>
    `;
  }

  private getCardStyles(entityData: any, isEditMode: boolean = false): string {
    return `
      :host {
        display: block;
        width: 100%;
        height: 100%;
        /* CSS custom properties for responsive sizing */
        --card-icon-size: 44px;
        --card-icon-font-size: 24px;
        --card-name-font-size: 17px;
        --card-state-font-size: 15px;
        --card-padding: 10px;
        --card-gap: 16px;
        --temp-font-size-regular: 14px;
        --temp-font-size-tall: 42px;
      }
      
      /* Reduce motion for accessibility */
      @media (prefers-reduced-motion: reduce) {
        :host * {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
        }
      }
      
      /* Mobile adjustments */
      @media (max-width: 767px) {
        :host {
          --card-icon-size: 40px;
          --card-icon-font-size: 22px;
          --card-name-font-size: 15px;
          --card-state-font-size: 13px;
          --card-padding: 8px;
          --card-gap: 12px;
          --temp-font-size-regular: 13px;
          --temp-font-size-tall: 36px;
        }
      }
      
      /* Small mobile adjustments */
      @media (max-width: 479px) {
        :host {
          --card-icon-size: 38px;
          --card-icon-font-size: 20px;
          --card-name-font-size: 14px;
          --card-state-font-size: 12px;
          --card-padding: 8px;
          --card-gap: 10px;
          --temp-font-size-regular: 12px;
          --temp-font-size-tall: 32px;
        }
      }
      
      /* Extra small / accessibility */
      @media (max-width: 359px) {
        :host {
          --card-icon-size: 36px;
          --card-icon-font-size: 18px;
          --card-name-font-size: 14px;
          --card-state-font-size: 12px;
          --card-padding: 8px;
          --card-gap: 10px;
          --temp-font-size-regular: 12px;
          --temp-font-size-tall: 28px;
        }
      }
      
      /* Regular Design - side by side layout */
      :host(.regular-design) {
        grid-row: span 1;
      }
      
      /* Tall Design - stacked layout */
      :host(.tall-design) {
        grid-row: span 2;
      }
      
      .apple-home-card {
        background: ${entityData.backgroundColor};
        padding: var(--card-padding);
        display: flex;
        flex-direction: column;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        border: none;
        position: relative;
        overflow: hidden;
        user-select: none;
        -webkit-user-select: none;
        -webkit-tap-highlight-color: transparent;
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        width: 100%;
        height: 100%;
        box-sizing: border-box;
      }
      
      /* Regular Design Card Layout */
      :host(.regular-design) .apple-home-card {
        justify-content: space-between;
      }
      
      /* Tall Design Card Layout */
      :host(.tall-design) .apple-home-card {
        justify-content: flex-start;
      }
      
      /* Camera cards - no padding to allow full background */
      :host(.tall-design) .apple-home-card.camera-card {
        padding: 0;
      }
      
      /* Edit mode - disable interactions */
      .apple-home-card.edit-mode {
        cursor: default !important;
      }
      
      .apple-home-card.edit-mode .info-icon {
        cursor: default !important;
      }
      
      .card-info {
        margin-top: 0;
        display: flex;
        height: 100%;
      }
      
      /* Regular Design - Icon and text side by side */
      :host(.regular-design) .card-info {
        flex-direction: row;
        align-items: center;
        justify-content: flex-start;
        gap: var(--card-gap);
      }
      
      /* Tall Design - Icon and text stacked vertically */
      :host(.tall-design) .card-info {
        flex-direction: column;
        align-items: flex-start;
        justify-content: flex-start;
        gap: 12px;
      }
      
      .info-icon {
        width: var(--card-icon-size);
        height: var(--card-icon-size);
        min-width: var(--card-icon-size);
        color: ${entityData.iconColor};
        background: ${entityData.iconBackgroundColor};
        transition: all 0.2s ease;
        cursor: pointer;
        flex-shrink: 0;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
      }
      
      .info-icon ha-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        --mdc-icon-size: var(--card-icon-font-size);
      }
      
      /* Scene/Script icon - no circle background */
      .info-icon.scene-icon {
        background: transparent !important;
        color: white !important;
      }
      
      .info-icon.scene-icon ha-icon {
        --mdc-icon-size: clamp(24px, 6vw, 32px);
        color: white !important;
      }
      
      /* Regular Design - Small temperature display */
      :host(.regular-design) .info-icon .temperature-text {
        font-size: var(--temp-font-size-regular);
        font-weight: 500;
        color: ${entityData.iconColor};
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
        letter-spacing: -0.3px;
        line-height: 1;
      }
      
      /* Tall Design - Large temperature display */
      :host(.tall-design) .info-icon .temperature-text {
        font-size: var(--temp-font-size-tall);
        font-weight: 600;
        color: ${entityData.iconColor};
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
        letter-spacing: -0.5px;
        line-height: 1;
      }
      
      /* For all climate cards, make the temperature icon transparent */
      .info-icon.temperature-display {
        background: transparent !important;
      }
      
      /* For tall design, make the temperature icon bigger */
      :host(.tall-design) .info-icon.temperature-display {
        width: auto;
        height: auto;
      }
        
      .text-content {
        flex: 1;
        min-width: 0;
        margin-top: 2px;
        display: flex;
        flex-direction: column;
      }
      
      /* Regular Design - Text centered vertically */
      :host(.regular-design) .text-content {
        justify-content: center;
      }
      
      /* Tall Design - Text at bottom */
      :host(.tall-design) .text-content {
        margin-top: auto;
        justify-content: flex-end;
      }
      
      .entity-name {
        font-size: var(--card-name-font-size);
        font-weight: 500;
        color: ${entityData.textColor};
        margin: 0 0 2px 0;
        line-height: 1.3;
        letter-spacing: -0.4px;
        word-wrap: break-word;
        word-break: break-word;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        max-height: calc(1.3em * 2);
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
      }
      
      .entity-state {
        font-size: var(--card-state-font-size);
        font-weight: 500;
        color: ${entityData.isActive ? 'rgba(29, 29, 31, 0.6)' : 'rgba(255, 255, 255, 0.6)'};
        margin: 0;
        line-height: 1.3;
        letter-spacing: -0.2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif;
      }

      /* Camera-specific styles */
      .camera-container {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        outline: none;
        -webkit-user-drag: none;
        user-select: none;
        -webkit-touch-callout: none;
      }

      /* Camera container takes full card space */
      :host(.tall-design) .card-info {
        flex-direction: column;
        height: 100%;
        position: relative;
        gap: 0;
      }

      :host(.tall-design) .camera-container {
        flex: 1;
      }

      .camera-snapshot {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: opacity 0.3s ease;
        border: none;
        outline: none;
        -webkit-user-drag: none;
        user-select: none;
        pointer-events: none;
        -webkit-touch-callout: none;
      }

      .camera-fallback {
        display: none;
      }

      .camera-overlay {
        position: absolute;
        bottom: 10px;
        left: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        z-index: 10;
      }

      .camera-timestamp {
        font-size: clamp(10px, 2.5vw, 12px);
        font-weight: 600;
        font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif;
        color: white;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
      }

      /* RTL Support for camera overlay positioning */
      .apple-home-card.rtl .camera-overlay {
        left: auto;
        right: 10px;
      }

      /* RTL Support for camera icons positioning */
      .apple-home-card.rtl .camera-icon-unavailable,
      .apple-home-card.rtl .camera-icon-no-snapshot {
        left: auto;
        right: 10px;
      }

      /* RTL Support for text content alignment */
      .apple-home-card.rtl .text-content {
        text-align: right;
        direction: rtl;
      }

      .apple-home-card.rtl .entity-name,
      .apple-home-card.rtl .entity-state {
        text-align: right;
        direction: rtl;
      }

      /* RTL Support for camera text positioning */
      .apple-home-card.rtl .camera-text {
        left: auto;
        right: 10px;
      }

      /* Camera icon when unavailable - positioned 10px from top and left */
      .camera-icon-unavailable {
        color: ${entityData.iconColor};
        background: transparent;
        transition: all 0.2s ease;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        position: absolute;
        top: 10px;
        left: 10px;
        z-index: 2;
      }

      .camera-icon-unavailable ha-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        --mdc-icon-size: clamp(24px, 6vw, 32px);
      }

      /* Camera icon when no snapshot available - positioned 10px from top and left */
      .camera-icon-no-snapshot {
        color: ${entityData.iconColor};
        background: transparent;
        transition: all 0.2s ease;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        position: absolute;
        top: 10px;
        left: 10px;
        z-index: 2;
      }

      .camera-icon-no-snapshot ha-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        --mdc-icon-size: clamp(24px, 6vw, 32px);
      }

      /* Camera loading state - matches camera error states */
      .camera-loading {
        color: ${entityData.iconColor};
        background: transparent;
        transition: all 0.2s ease;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        position: absolute;
        top: 10px;
        left: 10px;
        z-index: 2;
      }

      .camera-loading ha-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        --mdc-icon-size: clamp(24px, 6vw, 32px);
      }

      /* Camera text content uses standard card styling */
      :host(.tall-design) .camera-text {
        margin-top: 0;
        flex: 0 0 auto;
        position: absolute;
        bottom: 10px;
        left: 10px;
        z-index: 2;
      }

      /* Adjust card layout for cameras */
      :host(.tall-design) .apple-home-card {
        padding: var(--card-padding);
      }

      /* Mobile adjustments for card layout */
      @media (max-width: 768px) { 
        :host(.regular-design) .card-info {
            gap: var(--card-gap) !important;
        }
      }
      
      /* Extra small screens - single column */
      @media (max-width: 359px) {
        :host(.regular-design) .card-info {
          gap: 8px !important;
        }
        
        .entity-name {
          -webkit-line-clamp: 1;
          max-height: 1.3em;
        }
      }
    `;
  }

  private handleCardClick(event: Event) {
    if (!this._hass || !this.entity) return;
    
    // Check if the click was on the icon - if so, don't handle it here
    const target = event.target as HTMLElement;
    if (target.closest('.info-icon')) {
      return;
    }
    
    // Open more-info dialog for card area clicks
    this.dispatchEvent(new CustomEvent('hass-more-info', {
      bubbles: true,
      composed: true,
      detail: { entityId: this.entity }
    }));
  }

  private handleIconClick(event: Event) {
    if (!this._hass || !this.entity) return;
    
    // Prevent the card click from firing
    event.stopPropagation();
    
    const domain = this.entity.split('.')[0];
    const entityId = this.entity;
    
    // Handle different domains for icon clicks (toggle behavior)
    switch (domain) {
      case 'light':
      case 'switch':
      case 'fan':
        this._hass.callService(domain, 'toggle', { entity_id: entityId });
        break;
      case 'cover':
        const coverState = this._hass.states[entityId]?.state;
        if (coverState === 'open') {
          this._hass.callService('cover', 'close_cover', { entity_id: entityId });
        } else {
          this._hass.callService('cover', 'open_cover', { entity_id: entityId });
        }
        break;
      case 'lock':
        const lockState = this._hass.states[entityId]?.state;
        if (lockState === 'locked') {
          this._hass.callService('lock', 'unlock', { entity_id: entityId });
        } else {
          this._hass.callService('lock', 'lock', { entity_id: entityId });
        }
        break;
      case 'climate':
        // For climate, icon click opens more-info (since it's just showing temperature)
        this.dispatchEvent(new CustomEvent('hass-more-info', {
          bubbles: true,
          composed: true,
          detail: { entityId }
        }));
        break;
      case 'media_player':
        const mediaState = this._hass.states[entityId]?.state;
        if (mediaState === 'playing') {
          this._hass.callService('media_player', 'media_pause', { entity_id: entityId });
        } else if (mediaState === 'paused') {
          this._hass.callService('media_player', 'media_play', { entity_id: entityId });
        } else {
          this._hass.callService('media_player', 'turn_on', { entity_id: entityId });
        }
        break;
      case 'scene':
        this._hass.callService('scene', 'turn_on', { entity_id: entityId });
        break;
      case 'script':
        this._hass.callService('script', 'turn_on', { entity_id: entityId });
        break;
      case 'button':
        this._hass.callService('button', 'press', { entity_id: entityId });
        break;
      case 'input_button':
        this._hass.callService('input_button', 'press', { entity_id: entityId });
        break;
      case 'input_boolean':
        this._hass.callService('input_boolean', 'toggle', { entity_id: entityId });
        break;
      case 'camera':
        // For cameras, open more-info to show live feed
        this.dispatchEvent(new CustomEvent('hass-more-info', {
          bubbles: true,
          composed: true,
          detail: { entityId }
        }));
        break;
      default:
        // For unknown domains, icon click toggles if possible, otherwise opens more-info
        if (['binary_sensor', 'sensor'].includes(domain)) {
          // Read-only entities open more-info
          this.dispatchEvent(new CustomEvent('hass-more-info', {
            bubbles: true,
            composed: true,
            detail: { entityId }
          }));
        } else {
          // Try to toggle
          this._hass.callService('homeassistant', 'toggle', { entity_id: entityId });
        }
    }
  }

  private updateCameraTimestamp() {
    const timestampElement = this.shadowRoot?.querySelector('.camera-timestamp') as HTMLElement;
    if (timestampElement && this.snapshotManager && this.entity) {
      const snapshotData = this.snapshotManager.getSnapshot(this.entity);
      
      // Only show timestamp if we have actual snapshot data
      if (snapshotData && snapshotData.base64Data && snapshotData.timestamp > 0) {
        const secondsAgo = this.snapshotManager.getSecondsAgo(this.entity);
        timestampElement.textContent = this.formatTimeAgo(secondsAgo);
        timestampElement.style.display = '';
      } else {
        // Hide timestamp until we have real data
        timestampElement.style.display = 'none';
      }
    } 
  }

  private formatTimeAgo(secondsAgo: number): string {
    const diffMins = Math.floor(secondsAgo / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (secondsAgo <= 0) {
      return 'now';
    } else if (secondsAgo < 60) {
      return `${secondsAgo}s`;
    } else if (diffMins < 60) {
      return `${diffMins}m`;
    } else if (diffHours < 24) {
      return `${diffHours}h`;
    } else {
      return `${diffDays}d`;
    }
  }

  getCardSize() {
    return 1;
  }

  private handleCameraSnapshotFailed() {
    this.cameraSnapshotFailed = true;
    // Re-render to show "No snapshot available" state
    this.render();
  }

  public reloadCameraImage() {
    if (this.domain === 'camera' && this.cameraView === 'snapshot' && this._hass) {
      // Clean up existing setup
      this.cleanupCamera();
      
      // Reinitialize with global camera manager
      const cameraContainer = this.shadowRoot?.querySelector('.camera-container') as HTMLElement;
      if (cameraContainer) {
        this.initializeCamera(cameraContainer, false);
      }
    }
  }
}
