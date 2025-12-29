import { CustomizationManager } from '../utils/CustomizationManager';
import { CardManager } from '../utils/CardManager';
import { DataService } from '../utils/DataService';
import { DashboardConfig, DeviceGroup } from '../config/DashboardConfig';
import { ScenesSection } from '../sections/ScenesSection';
import { CamerasSection } from '../sections/CamerasSection';
import { AreaSection } from '../sections/AreaSection';
import { StatusSection } from '../sections/StatusSection';
import { Entity } from '../types/types';
import { localize } from '../utils/LocalizationService';

export class RoomPage {
  private customizationManager?: CustomizationManager;
  private cardManager?: CardManager;
  private scenesSection?: ScenesSection;
  private camerasSection?: CamerasSection;
  private areaSection?: AreaSection;
  private statusSection?: StatusSection;
  private _hass?: any;
  private _areaId?: string;
  private _config?: any;
  private _container?: HTMLElement; // Store reference to the container

  constructor() {
    // Regular class constructor
  }

  set hass(hass: any) {
    this._hass = hass;
    
    // Update status section if it exists
    if (this.statusSection) {
      this.statusSection.hass = hass;
    }
  }

  get hass() {
    return this._hass;
  }

  async setConfig(config: any) {
    this._config = config;
    this._areaId = config.areaId;
    
    // Initialize customization manager from config
    if (config.customizations && this._hass) {
      this.customizationManager = CustomizationManager.getInstance(this._hass);
      this.cardManager = new CardManager(this.customizationManager);
      await this.customizationManager.setCustomizations(config.customizations);
      this.initializeSections();
    }
  }

  private initializeSections() {
    if (this.customizationManager) {
      this.scenesSection = new ScenesSection(this.customizationManager, this.cardManager);
      this.camerasSection = new CamerasSection(this.customizationManager, this.cardManager);
      this.areaSection = new AreaSection(this.customizationManager, this.cardManager);
      this.statusSection = new StatusSection(this.customizationManager, this.cardManager);
      
      // Note: No DragAndDropManager needed - AppleHomeView handles drag and drop like for HomePage
    }
  }

  private createRoomTitle(areaName: string): HTMLElement {
    const titleElement = document.createElement('h1');
    titleElement.className = 'apple-page-title';
    titleElement.textContent = areaName;
    return titleElement;
  }

  async render(
    container: HTMLElement,
    areaId: string,
    areaName: string,
    hass: any,
    onTallToggle?: (entityId: string, areaId: string) => void | Promise<void | boolean>
  ): Promise<void> {
    // Store container reference for use in save methods
    this._container = container;
    
    // Preserve existing header and permanent chips elements
    const existingHeader = container.querySelector('.apple-home-header');
    const existingPermanentChips = container.querySelector('.permanent-chips');
    
    // Clear container but preserve important elements
    container.innerHTML = '';
    
    // Re-insert preserved elements in correct order
    if (existingHeader) {
      container.appendChild(existingHeader);
    }
    
    // Add room title
    const roomTitle = this.createRoomTitle(areaName);
    container.appendChild(roomTitle);
    
    // Re-insert permanent chips after title (this ensures chips are always below h1)
    if (existingPermanentChips) {
      container.appendChild(existingPermanentChips);
    }

    try {
      // Get data from Home Assistant
      const areas = await DataService.getAreas(hass);
      const entities = await DataService.getEntities(hass);
      const devices = await DataService.getDevices(hass);
      
      // Get showSwitches, includedSwitches, and extraAccessories settings
      const showSwitches = await this.customizationManager?.getShowSwitches() || false;
      const includedSwitches = await this.customizationManager?.getIncludedSwitches() || [];
      const extraAccessories = await this.customizationManager?.getExtraAccessories() || [];
      
      // Filter entities for supported domains and exclude those marked for exclusion
      const supportedEntities = entities.filter(entity => {
        const domain = entity.entity_id.split('.')[0];
        
        // Check if this entity is in the extraAccessories list (manually added entities)
        if (extraAccessories.includes(entity.entity_id)) {
          return true;
        }
        
        if (!DashboardConfig.isSupportedDomain(domain)) {
          return false;
        }
        
        // Additional filtering for switches based on showSwitches setting and includedSwitches
        if (domain === 'switch') {
          const entityState = hass.states[entity.entity_id];
          
          // If showSwitches is true, use the standard device group logic
          if (showSwitches) {
            const entityGroup = DashboardConfig.getDeviceGroup(domain, entity.entity_id, entityState?.attributes, showSwitches);
            return entityGroup !== undefined;
          } else {
            // If showSwitches is false, only show switches that are in includedSwitches or are outlets
            const isOutlet = DashboardConfig.isOutlet(entity.entity_id, entityState?.attributes);
            const isIncluded = includedSwitches.includes(entity.entity_id);
            return isOutlet || isIncluded;
          }
        }
        
        return true;
      });

      // Create a separate list for status section that includes sensor domains
      const statusEntities = entities.filter(entity => {
        const domain = entity.entity_id.split('.')[0];
        
        if (!DashboardConfig.isStatusDomain(domain)) {
          return false;
        }
        
        // Apply same switch filtering logic for status section
        if (domain === 'switch') {
          const entityState = hass.states[entity.entity_id];
          
          // If showSwitches is true, use the standard device group logic
          if (showSwitches) {
            const entityGroup = DashboardConfig.getDeviceGroup(domain, entity.entity_id, entityState?.attributes, showSwitches);
            return entityGroup !== undefined;
          } else {
            // If showSwitches is false, only show switches that are in includedSwitches or are outlets
            const isOutlet = DashboardConfig.isOutlet(entity.entity_id, entityState?.attributes);
            const isIncluded = includedSwitches.includes(entity.entity_id);
            return isOutlet || isIncluded;
          }
        }
        
        return true;
      });

      // Now apply exclusions asynchronously to both lists
      const filteredEntities = [];
      const filteredStatusEntities = [];
      
      for (const entity of supportedEntities) {
        const isExcluded = await this.customizationManager?.isEntityExcludedFromDashboard(entity.entity_id) || false;
        if (!isExcluded) {
          filteredEntities.push(entity);
        }
      }
      
      for (const entity of statusEntities) {
        const isExcluded = await this.customizationManager?.isEntityExcludedFromDashboard(entity.entity_id) || false;
        if (!isExcluded) {
          filteredStatusEntities.push(entity);
        }
      }
      
      // Group regular entities by area (excluding sensors)
      const entitiesByArea = DataService.groupEntitiesByArea(filteredEntities, areas, devices);
      
      // Group status entities by area (including sensors)
      const statusEntitiesByArea = DataService.groupEntitiesByArea(filteredStatusEntities, areas, devices);
      
      // Get entities for this specific area
      const areaEntities = entitiesByArea[areaId] || [];
      const statusAreaEntities = statusEntitiesByArea[areaId] || [];
      
      // Add status section after title but before main content
      if (this.statusSection && statusAreaEntities.length > 0) {
        await this.statusSection.render(container, statusAreaEntities, hass, areaId);
      }
      
      // Separate entities by device groups for organized display
      const entitiesByGroup: { [group: string]: Entity[] } = {};
      const deviceGroups = [
        DeviceGroup.LIGHTING,
        DeviceGroup.CLIMATE, 
        DeviceGroup.SECURITY,
        DeviceGroup.MEDIA,
        DeviceGroup.WATER,
        DeviceGroup.OTHER
      ];

      // Initialize groups
      deviceGroups.forEach(group => {
        entitiesByGroup[group] = [];
      });

      // Categorize entities by device group, but separate cameras from security
      areaEntities.forEach(entity => {
        const domain = entity.entity_id.split('.')[0];
        const entityState = this.hass?.states[entity.entity_id];
        
        let entityGroup: DeviceGroup | undefined;
        
        // Special handling for switches when showSwitches is false
        if (domain === 'switch' && !showSwitches) {
          const isOutlet = DashboardConfig.isOutlet(entity.entity_id, entityState?.attributes);
          const isIncluded = includedSwitches.includes(entity.entity_id);
          
          if (isOutlet || isIncluded) {
            entityGroup = DeviceGroup.OTHER; // Force included switches and outlets to OTHER group
          } else {
            entityGroup = undefined; // Hide other switches
          }
        } else {
          entityGroup = DashboardConfig.getDeviceGroup(domain, entity.entity_id, entityState?.attributes, showSwitches);
        }
        
        if (entityGroup && deviceGroups.includes(entityGroup)) {
          entitiesByGroup[entityGroup].push(entity);
        }
      });

      // Separate cameras from security group
      const cameraEntities = entitiesByGroup[DeviceGroup.SECURITY].filter(entity => 
        entity.entity_id.split('.')[0] === 'camera'
      );
      
      // Remove cameras from security group
      entitiesByGroup[DeviceGroup.SECURITY] = entitiesByGroup[DeviceGroup.SECURITY].filter(entity => 
        entity.entity_id.split('.')[0] !== 'camera'
      );

      // Apply user customizations
      if (!this.customizationManager) {
        throw new Error('CustomizationManager not initialized');
      }
      
      const customizations = this.customizationManager.getCustomizations();
      
      // Apply area-specific customizations from pages structure
      const pageCustomizations = customizations.pages?.[areaId];
      if (pageCustomizations) {
        // Apply entity order customizations for each group
        deviceGroups.forEach(group => {
          const groupEntities = entitiesByGroup[group];
          const groupOrderKey = `${group.toLowerCase()}_order`;
          const groupOrder = pageCustomizations[groupOrderKey];
          
          if (groupEntities.length > 0 && groupOrder && Array.isArray(groupOrder)) {
            const sortedEntities = [...groupEntities].sort((a, b) => {
              const aOrder = groupOrder.indexOf(a.entity_id);
              const bOrder = groupOrder.indexOf(b.entity_id);
              
              if (aOrder !== -1 && bOrder !== -1) {
                return aOrder - bOrder;
              }
              if (aOrder !== -1) return -1;
              if (bOrder !== -1) return 1;
              return 0;
            });
            entitiesByGroup[group] = sortedEntities;
          }
          
          // Apply tall card settings from room page tall_cards
          if (pageCustomizations.tall_cards) {
            entitiesByGroup[group].forEach(entity => {
              if (pageCustomizations.tall_cards.includes(entity.entity_id)) {
                (entity as any).is_tall = true;
              } else if (pageCustomizations.tall_cards.includes(`!${entity.entity_id}`)) {
                (entity as any).is_tall = false;
              }
            });
          }
        });
      }

      // Render cameras section first (like home page carousel)
      if (cameraEntities.length > 0) {
        await this.renderCamerasSection(container, cameraEntities, hass, onTallToggle);
      }

      // Then render other sections in the specified order: Lights, Climate, Security, Speakers & TVs
      await this.renderGroupedSections(
        container,
        entitiesByGroup,
        hass,
        onTallToggle
      );
      
    } catch (error) {
      console.error('Error rendering room page:', error);
    }
  }

  private async renderGroupedSections(
    container: HTMLElement,
    entitiesByGroup: { [group: string]: Entity[] },
    hass: any,
    onTallToggle?: (entityId: string, areaId: string) => void | Promise<void | boolean>
  ): Promise<void> {
    if (!this.customizationManager || !this.areaSection) {
      throw new Error('Required sections not initialized');
    }

    // Define the order as shown in the images: Lights, Climate, Security, Speakers & TVs, Other
    const groupOrder = [
      DeviceGroup.LIGHTING,
      DeviceGroup.CLIMATE,
      DeviceGroup.SECURITY,
      DeviceGroup.MEDIA,  // Speakers & TVs
      DeviceGroup.OTHER   // Other (switches when enabled)
    ];

    // Render each group as a separate section
    for (const group of groupOrder) {
      const groupEntities = entitiesByGroup[group];
      
      if (!groupEntities || groupEntities.length === 0) {
        continue; // Skip empty groups
      }

      // Get group style for section title
      const groupStyle = DashboardConfig.getGroupStyle(group);
      
      // Add section title
      const titleDiv = document.createElement('div');
      titleDiv.className = 'apple-home-section-title';
      titleDiv.innerHTML = `<span>${typeof groupStyle.name === 'function' ? groupStyle.name() : groupStyle.name}</span>`;
      container.appendChild(titleDiv);

      // Create a grid container for this group (non-carousel)
      const gridContainer = document.createElement('div');
      gridContainer.className = 'room-group-grid';
      // Use main area ID for data attribute, not composite
      gridContainer.dataset.areaId = this._areaId;
      gridContainer.dataset.sectionType = 'room-group';
      gridContainer.dataset.deviceGroup = group;

      // Apply saved card order using domain-specific ordering and main area ID
      const savedOrder = this.customizationManager?.getSavedCardOrderWithContext(this._areaId!, this._areaId!, group);
      let orderedEntities = [...groupEntities];
      
      if (savedOrder && savedOrder.length > 0 && this.customizationManager) {
        orderedEntities = this.customizationManager.applySavedCardOrder(groupEntities, savedOrder);
      }

      // Create entity cards for this group
      for (const entity of orderedEntities) {
        const cardConfig = this.createEntityCard(entity.entity_id, hass, entity);
        if (cardConfig) {
          cardConfig.section_type = 'room-group';
          await this.createAndAppendCard(cardConfig, gridContainer, hass, onTallToggle);
        }
      }

      container.appendChild(gridContainer);
    }
  }

  private async renderCamerasSection(
    container: HTMLElement,
    cameraEntities: Entity[],
    hass: any,
    onTallToggle?: (entityId: string, areaId: string) => void | Promise<void | boolean>
  ): Promise<void> {
    if (!this.camerasSection || !this.customizationManager) {
      return;
    }

    // Use the CamerasSection to render cameras just like on the home page
    const cameraSectionId = `${this._areaId}_cameras`; // Room-specific camera section ID
    await this.camerasSection.render(
      container,
      cameraEntities,
      hass,
      onTallToggle,
      'room',
      false,  // Disable navigation in room pages
      cameraSectionId  // Use room-specific section ID
    );
  }

  private createEntityCard(entityId: string, hass: any, entity: Entity): any {
    if (!this.customizationManager) return null;

    const domain = entityId.split('.')[0];
    const stateObj = hass.states[entityId];
    
    if (!stateObj) return null;

    // Get user customizations for this entity (for individual entity overrides like names)
    const customizations = this.customizationManager.getCustomizations();
    const entityCustomizations = customizations.entities?.[entityId] || null;
    
    // Create base card configuration
    const cardConfig: any = {
      type: 'custom:apple-home-card',
      entity: entityId,
      name: entityCustomizations?.name || stateObj.attributes.friendly_name || entityId,
      area_id: entity.area_id,
      is_tall: this.cardManager?.shouldCardBeTall(entityId, this._areaId || 'unknown', this._areaId!) || false,
      ...entityCustomizations
    };

    return cardConfig;
  }

  private async createAndAppendCard(
    cardConfig: any,
    gridContainer: HTMLElement,
    hass: any,
    onTallToggle?: (entityId: string, areaId: string) => void | Promise<void | boolean>
  ): Promise<void> {
    // Create wrapper div for the card
    const wrapper = document.createElement('div');
    wrapper.className = 'entity-card-wrapper';
    wrapper.dataset.entityId = cardConfig.entity;
    wrapper.dataset.areaId = this._areaId || 'unknown';
    
    // Apply tall class if needed
    if (cardConfig.is_tall) {
      wrapper.classList.add('tall');
    }

    // Create the card element
    const cardElement = document.createElement('apple-home-card') as any;
    cardElement.setConfig(cardConfig);
    cardElement.hass = hass;

    // Add edit mode controls
    const controls = document.createElement('div');
    controls.className = 'entity-controls';
    
    // Tall toggle button
    const tallButton = document.createElement('button');
    tallButton.className = 'entity-control-btn tall-toggle';
    tallButton.innerHTML = `<ha-icon icon="mdi:${cardConfig.is_tall ? 'arrow-collapse' : 'arrow-expand'}"></ha-icon>`;
    tallButton.title = cardConfig.is_tall ? localize('edit.make_normal_size') : localize('edit.make_tall');
    tallButton.classList.toggle('active', cardConfig.is_tall);
    
    tallButton.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (onTallToggle) {
        // Use main area ID for tall card toggle, not the entity's area_id
        const newTallState = await onTallToggle(cardConfig.entity, this._areaId || 'unknown');
        
        // Get the actual state from customization manager to ensure consistency
        const actualTallState = this.cardManager?.shouldCardBeTall(cardConfig.entity, this._areaId || 'unknown', this._areaId!) || false;
        
        // Update visual state with the actual saved state
        this.updateTallCardVisual(wrapper, tallButton, cardConfig, actualTallState);
      }
    });

    controls.appendChild(tallButton);
    wrapper.appendChild(controls);
    wrapper.appendChild(cardElement);
    gridContainer.appendChild(wrapper);
  }

  private updateTallCardVisual(
    wrapper: HTMLElement,
    tallButton: HTMLElement,
    cardConfig: any,
    shouldBeTall: boolean
  ): void {
    // Update wrapper class
    wrapper.classList.toggle('tall', shouldBeTall);
    
    // Update button state
    tallButton.classList.toggle('active', shouldBeTall);
    tallButton.title = shouldBeTall ? localize('edit.make_normal_size') : localize('edit.make_tall');
    
    // Update icon
    const iconElement = tallButton.querySelector('ha-icon');
    if (iconElement) {
      iconElement.setAttribute('icon', shouldBeTall ? 'mdi:arrow-collapse' : 'mdi:arrow-expand');
    }
    
    // Update card config
    cardConfig.is_tall = shouldBeTall;
    
    // Find the card element and refresh it like in home page
    const cardElement = wrapper.querySelector('hui-card, ha-card, [is-card]') as any;
    if (cardElement) {
      // Don't trigger re-render - let the card handle its own updates
      // Removed: cardElement.hass = cardElement.hass;
      
      // Don't refresh edit mode - it can cause rerenders
      // Removed: cardElement.refreshEditMode();
    }
  }
}
