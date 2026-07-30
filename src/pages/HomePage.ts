import { CustomizationManager } from '../utils/CustomizationManager';
import { DataService } from '../utils/DataService';
import { DashboardConfig } from '../config/DashboardConfig';
import { ScenesSection } from '../sections/ScenesSection';
import { CamerasSection } from '../sections/CamerasSection';
import { AreaSection } from '../sections/AreaSection';
import { FavoritesSection } from '../sections/FavoritesSection';
import { WeatherSection } from '../sections/WeatherSection';
import { EnergySection } from '../sections/EnergySection';
import { Entity, Area } from '../types/types';

export class HomePage {
  private customizationManager?: CustomizationManager;
  private scenesSection?: ScenesSection;
  private camerasSection?: CamerasSection;
  private areaSection?: AreaSection;
  private favoritesSection?: FavoritesSection;
  private weatherSection?: WeatherSection;
  private energySection?: EnergySection;
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
      this.weatherSection = new WeatherSection(this.customizationManager);
      this.energySection = new EnergySection(this.customizationManager);
    }
  }

  private createHomeTitle(): HTMLElement {
    const titleElement = document.createElement('h1');
    titleElement.className = 'apple-page-title';
    titleElement.textContent = this._title || '';
    return titleElement;
  }

  async render(
    container: HTMLElement,
    hass: any,
    onTallToggle?: (entityId: string, areaId: string) => void | Promise<void | boolean>
  ): Promise<void> {
    // Remove only dynamic content, keep permanent elements (header, chips) in place
    const permanentSelectors = ['.apple-home-header', '.permanent-chips'];
    Array.from(container.children).forEach(child => {
      const isPermanent = permanentSelectors.some(sel => child.matches(sel));
      if (!isPermanent) child.remove();
    });

    // Add home title after header but before chips, same position as the other pages'
    // .apple-page-title. In compact header mode this is hidden via CSS since the home name
    // is already shown in the always-visible sticky header instead (see AppleHeader's
    // alwaysShowTitle); with compact mode off it's the only place the title is shown.
    const homeTitle = this.createHomeTitle();
    const existingPermanentChips = container.querySelector('.permanent-chips');
    if (existingPermanentChips) {
      container.insertBefore(homeTitle, existingPermanentChips);
    } else {
      container.appendChild(homeTitle);
    }

    try {
      // Fetch all data in parallel
      const [areas, entities, devices, showSwitches, includedSwitches, extraAccessories] = await Promise.all([
        DataService.getAreas(hass),
        DataService.getEntities(hass),
        DataService.getDevices(hass),
        this.customizationManager?.getShowSwitches().then(v => v || false) ?? Promise.resolve(false),
        this.customizationManager?.getIncludedSwitches().then(v => v || []) ?? Promise.resolve([] as string[]),
        this.customizationManager?.getExtraAccessories().then(v => v || []) ?? Promise.resolve([] as string[])
      ]);
      
      // Filter entities for supported domains and exclude those marked for exclusion
      const supportedEntities = entities.filter(entity => {
        const domain = entity.entity_id.split('.')[0];

        // Check if this entity is in the extraAccessories list (manually added entities)
        if (extraAccessories.includes(entity.entity_id)) {
          return true;
        }

        // Exclude configuration and diagnostic entities from auto-discovery
        // These should only be included via custom entities (extra accessories)
        if (entity.entity_category === 'config' || entity.entity_category === 'diagnostic') {
          return false;
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

      // Batch-fetch exclusion lists once, then filter synchronously
      const excludedFromDashboard = new Set(await this.customizationManager?.getExcludedFromDashboard() || []);
      const excludedFromHome = new Set(await this.customizationManager?.getExcludedFromHome() || []);

      const filteredEntities = supportedEntities.filter(entity => !excludedFromDashboard.has(entity.entity_id));

      // Separate special section entities from regular area entities
      const scenesEntities: typeof filteredEntities = [];
      const camerasEntities: typeof filteredEntities = [];
      const regularEntities: typeof filteredEntities = [];

      for (const entity of filteredEntities) {
        if (excludedFromHome.has(entity.entity_id)) continue;
        const domain = entity.entity_id.split('.')[0];
        if (DashboardConfig.isScenesDomain(domain)) {
          scenesEntities.push(entity);
        } else if (DashboardConfig.isCamerasDomain(domain)) {
          camerasEntities.push(entity);
        } else if (!DashboardConfig.isSpecialSectionDomain(domain)) {
          regularEntities.push(entity);
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
    if (!this.customizationManager || !this.scenesSection || !this.camerasSection || !this.areaSection || !this.favoritesSection || !this.weatherSection || !this.energySection) {
      throw new Error('Required sections not initialized');
    }
    
    // Get section order and hidden sections
    const sectionOrder = this.customizationManager.getSavedSectionOrder();
    const hiddenSections = this.customizationManager.getHiddenSections();
    
    // Create a map of all available sections (closures accept optional target container)
    const availableSections = new Map<string, (target?: HTMLElement) => Promise<void>>();

    // Add weather section if a weather entity is configured and exists
    const weatherEntity = await this.customizationManager?.getWeatherEntity();
    const hasWeather = !!(weatherEntity && hass.states[weatherEntity]);
    if (hasWeather) {
      availableSections.set('weather_section', async (target?: HTMLElement) => {
        await this.weatherSection!.render(target || container, hass);
      });
    }

    // Add energy section if enabled in settings and energy sensors exist
    const showEnergy = await this.customizationManager?.getShowEnergy();
    const hasEnergy = !!(showEnergy && EnergySection.hasEnergySensors(hass));
    if (hasEnergy) {
      availableSections.set('energy_section', async (target?: HTMLElement) => {
        await this.energySection!.render(target || container, hass);
      });
    }

    // Add favorites section if there are favorites defined
    const hasFavorites = await this.customizationManager?.hasFavoriteAccessories();
    if (hasFavorites) {
      availableSections.set('favorites_section', async (target?: HTMLElement) => {
        await this.favoritesSection!.render(target || container, allEntities, hass, onTallToggle);
      });
    }

    // Add scenes section if there are any scenes or scripts
    if (scenesEntities.length > 0) {
      availableSections.set('scenes_section', async (target?: HTMLElement) => {
        await this.scenesSection!.render(target || container, scenesEntities, hass, onTallToggle);
      });
    }

    // Add cameras section if there are any cameras
    if (camerasEntities.length > 0) {
      availableSections.set('cameras_section', async (target?: HTMLElement) => {
        await this.camerasSection!.render(target || container, camerasEntities, hass, onTallToggle);
      });
    }

    // Add area sections
    for (const areaId of Object.keys(entitiesByArea)) {
      if (entitiesByArea[areaId].length > 0) {
        availableSections.set(areaId, async (target?: HTMLElement) => {
          await this.areaSection!.renderSingleArea(target || container, areaId, entitiesByArea[areaId], hass, onTallToggle, 'home');
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
          // Weather/energy sections default to first position when newly added
          if (sectionId === 'weather_section' || sectionId === 'energy_section') {
            orderedSectionIds.unshift(sectionId);
          } else {
            orderedSectionIds.push(sectionId);
          }
        }
      }
    } else {
      // Default order: weather, energy, cameras, scenes, favorites, then areas alphabetically
      orderedSectionIds = Array.from(availableSections.keys()).sort((a, b) => {
        if (a === 'weather_section') return -1;
        if (b === 'weather_section') return 1;
        if (a === 'energy_section') return -1;
        if (b === 'energy_section') return 1;
        if (a === 'cameras_section') return -1;
        if (b === 'cameras_section') return 1;
        if (a === 'scenes_section') return -1;
        if (b === 'scenes_section') return 1;
        if (a === 'favorites_section') return -1;
        if (b === 'favorites_section') return 1;
        return a.localeCompare(b);
      });
    }

    // Render sections in order, pairing adjacent weather+energy in a side-by-side row
    const rendered = new Set<string>();
    for (let i = 0; i < orderedSectionIds.length; i++) {
      const sectionId = orderedSectionIds[i];
      if (rendered.has(sectionId) || hiddenSections.includes(sectionId) || !availableSections.has(sectionId)) continue;

      // Check if weather and energy are adjacent — pair them side-by-side
      if ((sectionId === 'weather_section' || sectionId === 'energy_section') && hasWeather && hasEnergy) {
        const otherSection = sectionId === 'weather_section' ? 'energy_section' : 'weather_section';
        if (!rendered.has(otherSection) && !hiddenSections.includes(otherSection) && availableSections.has(otherSection)) {
          // Find the next visible section after current
          let nextVisible: string | null = null;
          for (let j = i + 1; j < orderedSectionIds.length; j++) {
            const nextId = orderedSectionIds[j];
            if (!rendered.has(nextId) && !hiddenSections.includes(nextId) && availableSections.has(nextId)) {
              nextVisible = nextId;
              break;
            }
          }

          if (nextVisible === otherSection) {
            // Adjacent! Wrap in a side-by-side row
            const wrapper = document.createElement('div');
            wrapper.className = 'weather-energy-row';
            container.appendChild(wrapper);
            await availableSections.get(sectionId)!(wrapper);
            await availableSections.get(otherSection)!(wrapper);
            rendered.add(sectionId);
            rendered.add(otherSection);
            continue;
          }
        }
      }

      await availableSections.get(sectionId)!();
      rendered.add(sectionId);
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
