import { CustomizationManager } from '../utils/CustomizationManager';
import { CardManager } from '../utils/CardManager';
import { Entity, CardConfig } from '../types/types';
import { DashboardConfig } from '../config/DashboardConfig';
import { localize } from '../utils/LocalizationService';
import { RTLHelper } from '../utils/RTLHelper';

export class CamerasSection {
  private customizationManager: CustomizationManager;
  private cardManager: CardManager;

  constructor(customizationManager: CustomizationManager, cardManager?: CardManager) {
    this.customizationManager = customizationManager;
    this.cardManager = cardManager || new CardManager(customizationManager);
  }

  async render(
    container: HTMLElement,
    camerasEntities: Entity[],
    hass: any,
    onTallToggle?: (entityId: string, areaId: string) => void | Promise<void | boolean>,
    context: string = 'home',
    enableNavigation: boolean = true,
    sectionId: string = 'cameras_section'
  ): Promise<void> {
    // Apply saved carousel order if available
    const sortedCameras = await this.sortCamerasByOrder(camerasEntities, sectionId, context);
    
    // Add cameras section title with navigation
    const titleDiv = document.createElement('div');
    titleDiv.className = 'apple-home-section-title';
    
    if (enableNavigation) {
      // Create clickable wrapper for just the title text and chevron
      const clickableWrapper = document.createElement('div');
      clickableWrapper.className = 'clickable-section-title';
      clickableWrapper.innerHTML = `<span>${localize('section_titles.cameras')}</span><ha-icon icon="${RTLHelper.isRTL() ? 'mdi:chevron-left' : 'mdi:chevron-right'}" class="section-arrow"></ha-icon>`;
      
      // Add click handler to the wrapper
      clickableWrapper.addEventListener('click', () => {
        this.navigateToPath('cameras');
      });
      
      titleDiv.appendChild(clickableWrapper);
    } else {
      titleDiv.innerHTML = `<span>${localize('section_titles.cameras')}</span>`;
    }
    
    container.appendChild(titleDiv);
    
    // Create carousel container
    const carouselContainer = document.createElement('div');
    carouselContainer.className = 'carousel-container';
    
    const carouselGrid = document.createElement('div');
    carouselGrid.className = 'carousel-grid cameras';
    carouselGrid.dataset.areaId = sectionId;
    carouselGrid.dataset.sectionType = 'cameras';
    
    // Create camera cards
    for (const entity of sortedCameras) {
      const cardConfig = this.createEntityCard(entity.entity_id, hass, entity);
      if (cardConfig) {
        cardConfig.section_type = 'cameras';
        // Cameras should be tall by default but even taller
        cardConfig.is_tall = true;
        // Add camera-specific settings
        (cardConfig as any).camera_view = 'snapshot';
        (cardConfig as any).refresh_interval = 10000; // 10 seconds
        
        await this.createAndAppendCard(cardConfig, carouselGrid, hass, onTallToggle, context);
      }
    }
    
    carouselContainer.appendChild(carouselGrid);
    
    // Add click-and-drag scrolling for desktop users
    this.setupDragScroll(carouselContainer);
    
    container.appendChild(carouselContainer);
  }

  private createEntityCard(entityId: string, hass: any, entity?: Entity): CardConfig | null {
    const state = hass.states[entityId];
    if (!state) {
      return null;
    }
    
    const friendlyName = state?.attributes?.friendly_name || entityId.split('.')[1].replace(/_/g, ' ');
    const domain = entityId.split('.')[0];
    
    // Determine card type and properties
    let cardType = 'custom:apple-home-card';
    let isTallCard = false;
    
    // Check if domain should be tall by default
    if (DashboardConfig.isDefaultTallDomain(domain)) {
      isTallCard = true;
    }
    
    // Check if there's a custom tall card setting from customizations
    if (entity && typeof (entity as any).is_tall !== 'undefined') {
      isTallCard = (entity as any).is_tall;
    }
    
    const card: CardConfig = {
      type: cardType,
      entity: entityId,
      name: friendlyName,
      domain: domain,
      is_tall: isTallCard
    };
    
    return card;
  }

  private async createAndAppendCard(
    cardConfig: any,
    container: HTMLElement,
    hass: any,
    onTallToggle?: (entityId: string, areaId: string) => void | Promise<void | boolean>,
    context: string = 'home'
  ): Promise<void> {
    try {
      let cardElement: HTMLElement;
      
      if (cardConfig.type === 'custom:apple-home-card') {
        cardElement = document.createElement('apple-home-card') as HTMLElement;
        
        // Determine if card should be tall based on customizations
        const shouldBeTall = this.cardManager.shouldCardBeTall(cardConfig.entity, container.dataset.areaId || 'unknown', context);
        const configWithTall = { ...cardConfig, is_tall: shouldBeTall };
        
        // Add camera-specific settings if specified
        if ((cardConfig as any).camera_view) {
          configWithTall.camera_view = (cardConfig as any).camera_view;
        }
        if ((cardConfig as any).refresh_interval) {
          configWithTall.refresh_interval = (cardConfig as any).refresh_interval;
        }
        
        (cardElement as any).setConfig(configWithTall);
        (cardElement as any).hass = hass;
      } else {
        // Handle other card types
        const customCardType = cardConfig.type.replace('custom:', '');
        if (customElements.get(customCardType)) {
          cardElement = document.createElement(customCardType);
          if (cardElement && typeof (cardElement as any).setConfig === 'function') {
            (cardElement as any).setConfig(cardConfig);
            (cardElement as any).hass = hass;
          }
        } else {
          cardElement = document.createElement('div');
          cardElement.innerHTML = `<div style="color: red;">Unknown card type: ${cardConfig.type}</div>`;
        }
      }
      
      const wrapper = document.createElement('div');
      wrapper.className = 'entity-card-wrapper';
      wrapper.dataset.entityId = cardConfig.entity;
      
      // Check if this is a carousel container to adjust wrapper sizing
      const isCarousel = container.classList.contains('carousel-grid');
      const sectionType = container.dataset.sectionType;
      
      // Determine if card should be tall based on customizations
      let shouldBeTall = this.cardManager.shouldCardBeTall(cardConfig.entity, container.dataset.areaId || 'unknown', context);
      
      // For cameras in carousel, they should always be "tall" but with special sizing
      if (isCarousel && sectionType === 'cameras') {
        shouldBeTall = true;
      }
      
      if (shouldBeTall) {
        wrapper.classList.add('tall');
      }
      
      // Always add edit mode controls
      const controlsDiv = document.createElement('div');
      controlsDiv.className = 'entity-controls';
      
      let controlsHTML = '';
      
      // Get entity domain to check if it's a camera or scene
      const entityDomain = cardConfig.entity ? cardConfig.entity.split('.')[0] : '';
      const isFixedSizeEntity = ['camera', 'scene', 'script'].includes(entityDomain);
      
      // Only show tall toggle for regular entities (not carousels, cameras, or scenes)
      if (!isCarousel && !isFixedSizeEntity) {
        controlsHTML = `
          <button class="entity-control-btn tall-toggle ${shouldBeTall ? 'active' : ''}" 
                  data-action="toggle-tall" 
                  title="Toggle card design">
            <ha-icon icon="mdi:${shouldBeTall ? 'arrow-collapse' : 'arrow-expand'}"></ha-icon>
          </button>
        `;
      }
      
      controlsDiv.innerHTML = controlsHTML;
      
      // Add event listeners for controls
      const tallToggle = controlsDiv.querySelector('.tall-toggle') as HTMLButtonElement;
      if (tallToggle && onTallToggle) {
        tallToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          onTallToggle(cardConfig.entity, container.dataset.areaId || 'unknown');
        });
      }
      
      wrapper.appendChild(controlsDiv);
      wrapper.appendChild(cardElement);
      container.appendChild(wrapper);
      
    } catch (error) {
      console.error('Error creating card:', error);
    }
  }

  private navigateToPath(path: string) {
    const currentPath = window.location.pathname;
    let basePath = '';
    
    // Handle different dashboard URL patterns
    if (currentPath.startsWith('/lovelace/')) {
      basePath = '/lovelace/';
    } else if (currentPath === '/lovelace') {
      basePath = '/lovelace/';
    } else {
      // Custom dashboard: extract the dashboard name
      const pathParts = currentPath.split('/').filter(part => part.length > 0);
      if (pathParts.length > 0) {
        basePath = `/${pathParts[0]}/`;
      } else {
        basePath = '/lovelace/';
      }
    }
    
    // Clean path and construct full URL
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    const newUrl = `${basePath}${cleanPath}`;
    
    // Navigate using Home Assistant's system
    window.history.pushState(null, '', newUrl);
    const event = new Event('location-changed', { bubbles: true, composed: true });
    window.dispatchEvent(event);
  }

  private async sortCamerasByOrder(camerasEntities: Entity[], areaId: string, context: string = 'home'): Promise<Entity[]> {
    try {
      // Check if there's a saved manual order for cameras
      const savedOrder = this.customizationManager.getSavedCarouselOrderWithContext(areaId, 'cameras', context);
      if (savedOrder && savedOrder.length > 0) {
        // Apply saved order, similar to how scenes are ordered
        const entityMap = new Map(camerasEntities.map(entity => [entity.entity_id, entity]));
        const orderedCameras: Entity[] = [];
        
        // First, add cameras in the saved order
        savedOrder.forEach((entityId: string) => {
          if (entityMap.has(entityId)) {
            orderedCameras.push(entityMap.get(entityId)!);
            entityMap.delete(entityId); // Remove from map to avoid duplicates
          }
        });
        
        // Then, add any new cameras that weren't in the saved order
        const remainingCameras = Array.from(entityMap.values());
        orderedCameras.push(...remainingCameras);
        
        return orderedCameras;
      }
      
      // Default behavior: return cameras in original order
      return camerasEntities;
    } catch (error) {
      console.error('Error sorting cameras by order:', error);
      return camerasEntities;
    }
  }

  /**
   * Setup click-and-drag scrolling for desktop users
   */
  private setupDragScroll(container: HTMLElement): void {
    let isDown = false;
    let startX: number;
    let scrollLeft: number;
    let hasDragged = false;
    const dragThreshold = 5; // Minimum pixels moved to consider it a drag

    // Function to check if container has overflow and update cursor
    const updateDragState = () => {
      const hasOverflow = container.scrollWidth > container.clientWidth;
      if (hasOverflow) {
        container.style.cursor = 'grab';
      } else {
        container.style.cursor = '';
      }
      return hasOverflow;
    };

    // Initial check
    setTimeout(updateDragState, 100);

    container.addEventListener('mousedown', (e) => {
      // Skip if reordering is in progress or not left button or no overflow
      const { DragAndDropManager } = require('../utils/DragAndDropManager');
      if (DragAndDropManager.isReordering || e.button !== 0 || !updateDragState()) return;
      
      isDown = true;
      hasDragged = false;
      container.style.cursor = 'grabbing';
      startX = e.pageX - container.offsetLeft;
      scrollLeft = container.scrollLeft;
    });

    container.addEventListener('mouseleave', () => {
      isDown = false;
      updateDragState();
    });

    container.addEventListener('mouseup', () => {
      isDown = false;
      updateDragState();
    });

    container.addEventListener('mousemove', (e) => {
      // Stop if reordering started or not dragging
      const { DragAndDropManager } = require('../utils/DragAndDropManager');
      if (!isDown || DragAndDropManager.isReordering) {
        if (DragAndDropManager.isReordering) isDown = false; // Reset state
        return;
      }
      e.preventDefault();
      const x = e.pageX - container.offsetLeft;
      const walk = x - startX;
      
      // Mark as dragged if moved beyond threshold
      if (Math.abs(walk) > dragThreshold) {
        hasDragged = true;
      }
      
      container.scrollLeft = scrollLeft - walk;
    });

    // Prevent click events on cards when dragging
    container.addEventListener('click', (e) => {
      if (hasDragged) {
        e.preventDefault();
        e.stopPropagation();
        hasDragged = false;
      }
    }, true);
  }
}
