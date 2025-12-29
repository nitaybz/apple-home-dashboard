import { CustomizationManager } from '../utils/CustomizationManager';
import { DataService } from '../utils/DataService';
import { DashboardConfig } from '../config/DashboardConfig';
import { ScenesSection } from '../sections/ScenesSection';
import { CamerasSection } from '../sections/CamerasSection';
import { AreaSection } from '../sections/AreaSection';
import { FavoritesSection } from '../sections/FavoritesSection';
import { Entity, Area } from '../types/types';

export class HomePage {
  private customizationManager?: CustomizationManager;
  private scenesSection?: ScenesSection;
  private camerasSection?: CamerasSection;
  private areaSection?: AreaSection;
  private favoritesSection?: FavoritesSection;
  private _hass?: any;
  private _title?: string;
  private _config?: any;

  constructor() {
    // Regular class constructor
  }

  set hass(hass: any) {
    this._hass = hass;
  }

  async setConfig(config: any) {
    this._config = config;
    this._title = config.title;
    
    // Initialize customization manager from config
    if (config.customizations && this._hass) {
      this.customizationManager = CustomizationManager.getInstance(this._hass);
      await this.customizationManager.setCustomizations(config.customizations);
      this.initializeSections();
    }
  }

  private initializeSections() {
    if (this.customizationManager) {
      this.scenesSection = new ScenesSection(this.customizationManager);
      this.camerasSection = new CamerasSection(this.customizationManager);
      this.areaSection = new AreaSection(this.customizationManager);
      this.favoritesSection = new FavoritesSection(this.customizationManager);
    }
  }

  private createHomeTitle(title: string): HTMLElement {
    const titleElement = document.createElement('h1');
    titleElement.className = 'apple-page-title';
    titleElement.textContent = title;
    return titleElement;
  }

  async render(
    container: HTMLElement,
    hass: any,
    title: string,
    onTallToggle?: (entityId: string, areaId: string) => void | Promise<void | boolean>
  ): Promise<void> {
    // Preserve existing header and permanent chips elements
    const existingHeader = container.querySelector('.apple-home-header');
    const existingPermanentChips = container.querySelector('.permanent-chips');
    
    // Clear container but preserve important elements
    container.innerHTML = '';
    
    // Re-insert preserved elements in correct order
    if (existingHeader) {
      container.appendChild(existingHeader);
    }
    
    // Add home title
    const homeTitle = this.createHomeTitle(title);
    container.appendChild(homeTitle);
    
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

      // Now apply exclusions asynchronously
      const filteredEntities = [];
      for (const entity of supportedEntities) {
        const isExcluded = await this.customizationManager?.isEntityExcludedFromDashboard(entity.entity_id) || false;
        if (!isExcluded) {
          filteredEntities.push(entity);
        }
      }
      
      // Separate special section entities from regular area entities
      const scenesEntities = [];
      const camerasEntities = [];
      const regularEntities = [];

      for (const entity of filteredEntities) {
        const domain = entity.entity_id.split('.')[0];
        const isExcludedFromHome = await this.customizationManager?.isEntityExcludedFromHome(entity.entity_id) || false;
        
        if (!isExcludedFromHome) {
          if (DashboardConfig.isScenesDomain(domain)) {
            scenesEntities.push(entity);
          } else if (DashboardConfig.isCamerasDomain(domain)) {
            camerasEntities.push(entity);
          } else if (!DashboardConfig.isSpecialSectionDomain(domain)) {
            regularEntities.push(entity);
          }
        }
      }
      
      // Group regular entities by area
      const entitiesByArea = DataService.groupEntitiesByArea(regularEntities, areas, devices);
      
      // Apply user customizations
      if (!this.customizationManager) {
        throw new Error('CustomizationManager not initialized');
      }
      
      const customizations = this.customizationManager.getCustomizations();
      const customizedAreas = this.applyCustomizations(entitiesByArea, customizations);
      
      // Render sections in order based on customizations
      await this.renderSectionsInOrder(
        container, 
        customizedAreas, 
        scenesEntities, 
        camerasEntities, 
        filteredEntities, // Pass all filtered entities for favorites
        hass, 
        onTallToggle
      );
      
    } catch (error) {
      console.error('Error rendering home page:', error);
    }
  }

  private async renderSectionsInOrder(
    container: HTMLElement,
    entitiesByArea: { [areaId: string]: Entity[] },
    scenesEntities: Entity[],
    camerasEntities: Entity[],
    allEntities: Entity[],
    hass: any,
    onTallToggle?: (entityId: string, areaId: string) => void | Promise<void | boolean>
  ): Promise<void> {
    if (!this.customizationManager || !this.scenesSection || !this.camerasSection || !this.areaSection || !this.favoritesSection) {
      throw new Error('Required sections not initialized');
    }
    
    // Get section order and hidden sections
    const sectionOrder = this.customizationManager.getSavedSectionOrder();
    const hiddenSections = this.customizationManager.getHiddenSections();
    
    // Create a map of all available sections
    const availableSections = new Map<string, () => Promise<void>>();
    
    // Add favorites section if there are favorites defined
    const hasFavorites = await this.customizationManager?.hasFavoriteAccessories();
    if (hasFavorites) {
      availableSections.set('favorites_section', async () => {
        await this.favoritesSection!.render(container, allEntities, hass, onTallToggle);
      });
    }
    
    // Add scenes section if there are any scenes or scripts
    if (scenesEntities.length > 0) {
      availableSections.set('scenes_section', async () => {
        await this.scenesSection!.render(container, scenesEntities, hass, onTallToggle);
      });
    }
    
    // Add cameras section if there are any cameras
    if (camerasEntities.length > 0) {
      availableSections.set('cameras_section', async () => {
        await this.camerasSection!.render(container, camerasEntities, hass, onTallToggle);
      });
    }
    
    // Add area sections
    for (const areaId of Object.keys(entitiesByArea)) {
      if (entitiesByArea[areaId].length > 0) {
        availableSections.set(areaId, async () => {
          await this.areaSection!.renderSingleArea(container, areaId, entitiesByArea[areaId], hass, onTallToggle, 'home');
        });
      }
    }
    
    // Apply section ordering
    let orderedSectionIds: string[] = [];
    
    if (sectionOrder.length > 0) {
      // Use saved order
      orderedSectionIds = sectionOrder.filter(id => availableSections.has(id));
      
      // Add any new sections that weren't in the saved order
      for (const sectionId of availableSections.keys()) {
        if (!orderedSectionIds.includes(sectionId)) {
          orderedSectionIds.push(sectionId);
        }
      }
    } else {
      // Default order: cameras, scenes, favorites, then areas alphabetically
      orderedSectionIds = Array.from(availableSections.keys()).sort((a, b) => {
        if (a === 'cameras_section') return -1;
        if (b === 'cameras_section') return 1;
        if (a === 'scenes_section') return -1;
        if (b === 'scenes_section') return 1;
        if (a === 'favorites_section') return -1;
        if (b === 'favorites_section') return 1;
        return a.localeCompare(b);
      });
    }
    
    // Render sections in order, respecting visibility settings
    for (const sectionId of orderedSectionIds) {
      if (!hiddenSections.includes(sectionId) && availableSections.has(sectionId)) {
        await availableSections.get(sectionId)!();
      }
    }
  }

  private applyCustomizations(entitiesByArea: { [areaId: string]: Entity[] }, customizations: any): { [areaId: string]: Entity[] } {
    const result: { [areaId: string]: Entity[] } = {};
    
    // Apply area order customizations
    const areaIds = Object.keys(entitiesByArea);
    let sortedAreaIds = areaIds;
    
    if (customizations.home?.sections?.order) {
      sortedAreaIds = [...areaIds].sort((a, b) => {
        const aOrder = customizations.home.sections.order!.indexOf(a);
        const bOrder = customizations.home.sections.order!.indexOf(b);
        
        // If both areas have custom order, use it
        if (aOrder !== -1 && bOrder !== -1) {
          return aOrder - bOrder;
        }
        // If only one has custom order, prioritize it
        if (aOrder !== -1) return -1;
        if (bOrder !== -1) return 1;
        // If neither has custom order, keep original order
        return 0;
      });
    }
    
    // Apply entity customizations within each area
    for (const areaId of sortedAreaIds) {
      const areaEntities = [...entitiesByArea[areaId]];
      const areaCustomizations = customizations.home?.entities_order?.[areaId];
      
      if (areaCustomizations) {
        // Apply entity order - areaCustomizations is now the array directly
        const entityOrder = Array.isArray(areaCustomizations) ? areaCustomizations : [];
        if (entityOrder.length > 0) {
          areaEntities.sort((a, b) => {
            const aOrder = entityOrder.indexOf(a.entity_id);
            const bOrder = entityOrder.indexOf(b.entity_id);
            
            if (aOrder !== -1 && bOrder !== -1) {
              return aOrder - bOrder;
            }
            if (aOrder !== -1) return -1;
            if (bOrder !== -1) return 1;
            return 0;
          });
        }
      }
        
      // Apply tall card settings from home.tall_cards
      if (customizations.home?.tall_cards) {
        areaEntities.forEach(entity => {
          if (customizations.home.tall_cards.includes(entity.entity_id)) {
            (entity as any).is_tall = true;
          } else if (customizations.home.tall_cards.includes(`!${entity.entity_id}`)) {
            (entity as any).is_tall = false;
          }
        });
      }
      
      result[areaId] = areaEntities;
    }
    
    return result;
  }
}
