import Sortable from 'sortablejs';
import { ChipsConfigurationManager } from './ChipsConfigurationManager';

/**
 * DragAndDropManager using SortableJS with custom visual drag element
 */
export class DragAndDropManager {
  private saveOrderCallback: (areaId: string) => void;
  private customizationManager: any;
  private context: string;
  private sortableInstances: Map<HTMLElement, Sortable> = new Map();
  private static globalStylesInjected: boolean = false;
  
  // Global flag to indicate reordering is in progress (used by other components to disable conflicting behaviors)
  public static isReordering: boolean = false;
  
  // Custom drag visual element
  private dragVisual: HTMLElement | null = null;

  constructor(saveOrderCallback: (areaId: string) => void, customizationManager?: any, context: string = 'home') {
    this.saveOrderCallback = saveOrderCallback;
    this.customizationManager = customizationManager;
    this.context = context;
    
    this.injectGlobalStyles();
  }

  /**
   * Inject styles for drag elements
   */
  private injectGlobalStyles(): void {
    if (DragAndDropManager.globalStylesInjected) return;
    
    const style = document.createElement('style');
    style.id = 'sortable-drag-styles';
    style.textContent = `
      /* Custom drag visual element */
      .drag-visual-clone {
        position: fixed !important;
        pointer-events: none !important;
        z-index: 100000 !important;
        opacity: 0.95 !important;
        box-shadow: 0 15px 50px rgba(0, 0, 0, 0.5) !important;
        transform: scale(1.03) rotate(2deg) !important;
        border-radius: var(--apple-card-radius, 25px) !important;
        transition: transform 0.1s ease, box-shadow 0.1s ease !important;
        overflow: hidden !important;
      }
      
      .drag-visual-clone.chip {
        border-radius: var(--apple-chip-radius, 50px) !important;
      }
      
      /* Ghost - the placeholder showing where item will drop */
      .sortable-ghost {
        opacity: 0.3 !important;
        background: rgba(255, 255, 255, 0.1) !important;
        border-radius: var(--apple-card-radius, 25px) !important;
      }
      
      /* Hide controls on ghost and dragged elements */
      .sortable-ghost .entity-controls,
      .sortable-drag .entity-controls,
      .sortable-chosen .entity-controls,
      .dragging .entity-controls {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
      }
      
      /* Hide the actual element being dragged (SortableJS moves it) */
      .sortable-drag {
        opacity: 0 !important;
        visibility: hidden !important;
      }
      
      /* Ghost placeholder for chips */
      .chip-wrapper.sortable-ghost {
        opacity: 0.3 !important;
        background: rgba(255, 255, 255, 0.1) !important;
        border-radius: var(--apple-chip-radius, 50px) !important;
      }
      .chip-wrapper.sortable-ghost .chip {
        opacity: 0.3 !important;
      }
      
      /* Prevent images from interfering with drag */
      .entity-card-wrapper img,
      .entity-card-wrapper .camera-container,
      .entity-card-wrapper .camera-snapshot {
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
    DragAndDropManager.globalStylesInjected = true;
  }

  /**
   * Create a visual clone of the element for dragging
   * Simply copy the computed styles from the actual card elements
   */
  private createDragVisual(element: HTMLElement, x: number, y: number, isChip: boolean = false): void {
    this.removeDragVisual();
    
    const rect = element.getBoundingClientRect();
    
    this.dragVisual = document.createElement('div');
    this.dragVisual.className = 'drag-visual-clone' + (isChip ? ' chip' : '');
    this.dragVisual.style.width = rect.width + 'px';
    this.dragVisual.style.height = rect.height + 'px';
    this.dragVisual.style.left = (x - rect.width / 2) + 'px';
    this.dragVisual.style.top = (y - rect.height / 2) + 'px';
    
    const card = element.querySelector('apple-home-card');
    if (card && card.shadowRoot) {
      const innerCard = card.shadowRoot.querySelector('.apple-home-card') as HTMLElement;
      if (innerCard) {
        // Just copy the card's styles directly
        const cardStyle = window.getComputedStyle(innerCard);
        this.dragVisual.style.background = cardStyle.background;
        this.dragVisual.style.backdropFilter = cardStyle.backdropFilter;
        (this.dragVisual.style as any).webkitBackdropFilter = (cardStyle as any).webkitBackdropFilter;
        this.dragVisual.style.borderRadius = cardStyle.borderRadius;
        
        // Check if this is a camera card - look for camera-specific elements
        const cameraContainer = innerCard.querySelector('.camera-container') as HTMLElement;
        const cameraIconUnavailable = innerCard.querySelector('.camera-icon-unavailable') as HTMLElement;
        const cameraIconNoSnapshot = innerCard.querySelector('.camera-icon-no-snapshot') as HTMLElement;
        
        if (cameraContainer || cameraIconUnavailable || cameraIconNoSnapshot) {
          // This is a camera card - handle specially
          this.createCameraDragVisual(innerCard, cameraContainer, cameraIconUnavailable, cameraIconNoSnapshot);
        } else {
          // Clone the entire inner card structure with inline styles
          const clone = this.cloneWithStyles(innerCard);
          clone.style.width = '100%';
          clone.style.height = '100%';
          this.dragVisual.appendChild(clone);
        }
      }
    } else if (isChip) {
      // For chips, the actual chip element is inside the wrapper
      const chipElement = element.querySelector('.chip') as HTMLElement;
      if (chipElement) {
        const chipStyle = window.getComputedStyle(chipElement);
        this.dragVisual.style.background = chipStyle.background || chipStyle.backgroundColor;
        this.dragVisual.style.backdropFilter = chipStyle.backdropFilter || 'blur(20px)';
        (this.dragVisual.style as any).webkitBackdropFilter = (chipStyle as any).webkitBackdropFilter || 'blur(20px)';
        this.dragVisual.style.borderRadius = chipStyle.borderRadius || '20px';
        
        // Clone the chip content
        const clone = this.cloneWithStyles(chipElement);
        clone.style.width = '100%';
        clone.style.height = '100%';
        clone.style.margin = '0';
        this.dragVisual.appendChild(clone);
      } else {
        // Fallback - just clone the wrapper
        const clone = this.cloneWithStyles(element);
        clone.style.width = '100%';
        clone.style.height = '100%';
        this.dragVisual.appendChild(clone);
      }
    } else {
      this.dragVisual.style.background = 'rgba(128, 128, 128, 0.5)';
    }
    
    document.body.appendChild(this.dragVisual);
  }

  /**
   * Create drag visual specifically for camera cards
   */
  private createCameraDragVisual(
    innerCard: HTMLElement, 
    cameraContainer: HTMLElement | null,
    cameraIconUnavailable: HTMLElement | null,
    cameraIconNoSnapshot: HTMLElement | null
  ): void {
    const cardStyle = window.getComputedStyle(innerCard);
    
    // Create a container that matches the card layout
    const container = document.createElement('div');
    container.style.cssText = `
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      position: relative;
      overflow: hidden;
      border-radius: ${cardStyle.borderRadius};
    `;
    
    if (cameraContainer) {
      // Working camera - find the visible snapshot image
      const images = Array.from(cameraContainer.querySelectorAll('img')) as HTMLImageElement[];
      let visibleImgSrc: string | null = null;
      
      for (const img of images) {
        const imgStyle = window.getComputedStyle(img);
        if (imgStyle.opacity !== '0' && img.src) {
          visibleImgSrc = img.src;
          break;
        }
      }
      
      if (visibleImgSrc) {
        const imgClone = document.createElement('img');
        imgClone.src = visibleImgSrc;
        imgClone.style.cssText = `
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: inherit;
        `;
        container.appendChild(imgClone);
      } else {
        // No visible image yet
        container.innerHTML = `
          <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.3);">
            <ha-icon icon="mdi:camera" style="color: white; --mdc-icon-size: 48px;"></ha-icon>
          </div>
        `;
      }
    } else if (cameraIconUnavailable) {
      // Unavailable camera
      container.innerHTML = `
        <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
          <ha-icon icon="mdi:camera-off" style="color: rgba(255,255,255,0.6); --mdc-icon-size: 48px;"></ha-icon>
        </div>
      `;
    } else if (cameraIconNoSnapshot) {
      // Camera available but no snapshot
      container.innerHTML = `
        <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
          <ha-icon icon="mdi:camera" style="color: rgba(255,255,255,0.6); --mdc-icon-size: 48px;"></ha-icon>
        </div>
      `;
    }
    
    // Add the entity name at bottom if present
    const entityName = innerCard.querySelector('.entity-name');
    if (entityName) {
      const nameClone = document.createElement('div');
      const nameStyle = window.getComputedStyle(entityName);
      nameClone.textContent = entityName.textContent;
      nameClone.style.cssText = `
        position: absolute;
        bottom: 12px;
        left: 12px;
        right: 12px;
        color: white;
        font-size: ${nameStyle.fontSize};
        font-weight: ${nameStyle.fontWeight};
        text-shadow: 0 1px 3px rgba(0,0,0,0.8);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      `;
      container.appendChild(nameClone);
    }
    
    this.dragVisual!.appendChild(container);
  }

  /**
   * Clone an element and apply its computed styles inline
   */
  private cloneWithStyles(element: HTMLElement): HTMLElement {
    const clone = element.cloneNode(false) as HTMLElement;
    const style = window.getComputedStyle(element);
    
    // Copy key styles inline
    const stylesToCopy = [
      'display', 'flexDirection', 'alignItems', 'justifyContent', 'gap',
      'padding', 'margin', 'width', 'height', 'minWidth', 'minHeight',
      'color', 'fontSize', 'fontWeight', 'fontFamily', 'textAlign',
      'background', 'backgroundColor', 'borderRadius',
      'overflow', 'whiteSpace', 'textOverflow'
    ];
    
    stylesToCopy.forEach(prop => {
      (clone.style as any)[prop] = (style as any)[prop];
    });
    
    // Handle children
    element.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        clone.appendChild(child.cloneNode(true));
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const childEl = child as HTMLElement;
        // Handle ha-icon specially
        if (childEl.tagName === 'HA-ICON') {
          const haIcon = childEl as any;
          const iconName = haIcon.icon || haIcon.getAttribute('icon');
          const iconStyle = window.getComputedStyle(childEl);
          const iconClone = document.createElement('ha-icon');
          iconClone.setAttribute('icon', iconName || 'mdi:help');
          iconClone.style.color = iconStyle.color;
          (iconClone.style as any)['--mdc-icon-size'] = iconStyle.getPropertyValue('--mdc-icon-size') || '24px';
          clone.appendChild(iconClone);
        } else if (childEl.tagName === 'IMG') {
          // Clone images with their current src
          const img = childEl as HTMLImageElement;
          const imgClone = document.createElement('img');
          imgClone.src = img.src;
          imgClone.style.cssText = `
            width: 100%;
            height: 100%;
            object-fit: cover;
            pointer-events: none;
          `;
          clone.appendChild(imgClone);
        } else if (childEl.classList.contains('camera-container')) {
          // For camera containers, try to find and clone the visible image
          const visibleImg = childEl.querySelector('img[style*="opacity: 1"], img:not([style*="opacity: 0"])') as HTMLImageElement;
          if (visibleImg && visibleImg.src) {
            const cameraClone = document.createElement('div');
            cameraClone.style.cssText = `
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              overflow: hidden;
            `;
            const imgClone = document.createElement('img');
            imgClone.src = visibleImg.src;
            imgClone.style.cssText = `
              width: 100%;
              height: 100%;
              object-fit: cover;
            `;
            cameraClone.appendChild(imgClone);
            clone.appendChild(cameraClone);
          } else {
            // Fallback - just show camera icon
            const placeholder = document.createElement('div');
            placeholder.style.cssText = `
              width: 100%;
              height: 100%;
              display: flex;
              align-items: center;
              justify-content: center;
              background: rgba(0,0,0,0.3);
            `;
            placeholder.innerHTML = '<ha-icon icon="mdi:camera" style="color: white; --mdc-icon-size: 32px;"></ha-icon>';
            clone.appendChild(placeholder);
          }
        } else {
          clone.appendChild(this.cloneWithStyles(childEl));
        }
      }
    });
    
    return clone;
  }

  /**
   * Update drag visual position
   */
  private updateDragVisual(x: number, y: number): void {
    if (!this.dragVisual) return;
    
    const width = this.dragVisual.offsetWidth;
    const height = this.dragVisual.offsetHeight;
    
    this.dragVisual.style.left = (x - width / 2) + 'px';
    this.dragVisual.style.top = (y - height / 2) + 'px';
  }

  /**
   * Remove drag visual
   */
  private removeDragVisual(): void {
    if (this.dragVisual && this.dragVisual.parentNode) {
      this.dragVisual.parentNode.removeChild(this.dragVisual);
    }
    this.dragVisual = null;
  }

  /**
   * Get common Sortable options
   */
  private getBaseSortableOptions(isCarousel: boolean = false): Sortable.Options {
    return {
      animation: 150,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      
      // Touch settings
      delay: 150,
      delayOnTouchOnly: true,
      touchStartThreshold: 5,
      
      // Scroll settings - enable for carousels with edge scrolling
      scroll: true,
      scrollSensitivity: 100,
      scrollSpeed: 15,
      bubbleScroll: true,
      
      // Visual classes
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen', 
      dragClass: 'sortable-drag',
      
      // Use fallback for touch support, but we'll handle the visual ourselves
      forceFallback: true,
      fallbackClass: 'sortable-fallback-hidden',
      fallbackOnBody: false, // Keep it in container, we handle visual
      fallbackTolerance: 3,
      
      swapThreshold: 0.65,
      
      // Filter out control buttons only - NOT images (they're in shadow DOM anyway)
      filter: '.entity-controls, .entity-control-btn',
      preventOnFilter: false,
      
      // Handle filtered elements
      onFilter: () => {
        // Filtering handled by SortableJS
      },
      
      onMove: () => {
        return true; // Allow all moves
      },
    };
  }

  enableDragAndDrop(container: HTMLElement): void {
    // Handle grid containers
    const gridContainers = container.querySelectorAll('.area-entities, .room-group-grid');
    gridContainers.forEach(gridContainer => {
      this.setupGridSortable(gridContainer as HTMLElement);
    });
    
    // Handle carousel containers - exclude chips
    const carouselContainers = container.querySelectorAll('.carousel-grid:not(.chips)');
    carouselContainers.forEach(carouselGrid => {
      this.setupCarouselSortable(carouselGrid as HTMLElement);
    });

    // Handle chips
    if (container.classList.contains('permanent-chips')) {
      this.enableChipsCarousel(container);
    }
  }

  private setupGridSortable(gridContainer: HTMLElement): void {
    const existingInstance = this.sortableInstances.get(gridContainer);
    if (existingInstance) {
      existingInstance.destroy();
    }

    const areaId = gridContainer.dataset.areaId;
    
    // Track touch/mouse position for visual
    let lastX = 0, lastY = 0;
    
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (e instanceof TouchEvent) {
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
      } else {
        lastX = e.clientX;
        lastY = e.clientY;
      }
      this.updateDragVisual(lastX, lastY);
    };
    
    const sortable = new Sortable(gridContainer, {
      ...this.getBaseSortableOptions(false),
      draggable: '.entity-card-wrapper',
      
      onStart: (evt) => {
        DragAndDropManager.isReordering = true;
        evt.item.classList.add('dragging');
        
        // Hide ALL entity-controls in the grid during drag
        // (SortableJS creates multiple elements including a fallback clone)
        gridContainer.querySelectorAll('.entity-controls').forEach((ctrl) => {
          (ctrl as HTMLElement).style.visibility = 'hidden';
        });
        
        // Get initial position from the event
        const originalEvent = (evt as any).originalEvent;
        const touch = (originalEvent as TouchEvent)?.touches?.[0];
        const mouse = originalEvent as MouseEvent;
        lastX = touch?.clientX ?? mouse?.clientX ?? 0;
        lastY = touch?.clientY ?? mouse?.clientY ?? 0;
        
        // Create our custom visual
        this.createDragVisual(evt.item, lastX, lastY);
        
        // Listen for moves
        document.addEventListener('mousemove', onMove);
        document.addEventListener('touchmove', onMove, { passive: true });
        
        if ('vibrate' in navigator) navigator.vibrate(50);
        document.body.style.userSelect = 'none';
      },
      
      onEnd: (evt) => {
        DragAndDropManager.isReordering = false;
        evt.item.classList.remove('dragging');
        
        // Show ALL entity-controls again
        gridContainer.querySelectorAll('.entity-controls').forEach((ctrl) => {
          (ctrl as HTMLElement).style.visibility = '';
        });
        
        // Remove our custom visual
        this.removeDragVisual();
        
        // Remove listeners
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('touchmove', onMove);
        
        document.body.style.userSelect = '';
        if ('vibrate' in navigator) navigator.vibrate(30);
        
        this.reconnectSingleCameraManager(evt.item);
        
        if (areaId) {
          this.saveOrderCallback(areaId);
        }
      }
    });
    
    this.sortableInstances.set(gridContainer, sortable);
  }

  private setupCarouselSortable(carouselGrid: HTMLElement): void {
    const existingInstance = this.sortableInstances.get(carouselGrid);
    if (existingInstance) {
      existingInstance.destroy();
    }

    // Get the scrollable container (parent of carousel-grid)
    const scrollContainer = carouselGrid.closest('.carousel-container') as HTMLElement;

    let lastX = 0, lastY = 0;
    let currentScrollSpeed = 0; // The actual speed used by animation
    let scrollAnimationId: number | null = null;
    
    // Smooth scroll animation loop - reads currentScrollSpeed each frame
    const animateScroll = () => {
      if (!scrollContainer || currentScrollSpeed === 0) {
        scrollAnimationId = null;
        return;
      }
      
      const maxScroll = scrollContainer.scrollWidth - scrollContainer.clientWidth;
      const currentScroll = scrollContainer.scrollLeft;
      
      // Stop if we've hit the bounds
      if ((currentScrollSpeed < 0 && currentScroll <= 0) || 
          (currentScrollSpeed > 0 && currentScroll >= maxScroll)) {
        currentScrollSpeed = 0;
        scrollAnimationId = null;
        return;
      }
      
      scrollContainer.scrollLeft += currentScrollSpeed;
      scrollAnimationId = requestAnimationFrame(animateScroll);
    };
    
    const updateScrollSpeed = (x: number) => {
      if (!scrollContainer) return;
      
      const containerRect = scrollContainer.getBoundingClientRect();
      const maxScroll = scrollContainer.scrollWidth - scrollContainer.clientWidth;
      const currentScroll = scrollContainer.scrollLeft;
      const scrollZone = 100;
      const maxSpeed = 15;
      const minSpeed = 3;
      
      const distFromLeft = x - containerRect.left;
      const distFromRight = containerRect.right - x;
      
      const canScrollLeft = currentScroll > 0;
      const canScrollRight = currentScroll < maxScroll;
      
      let newSpeed = 0;
      
      if (distFromLeft < scrollZone && distFromLeft >= 0 && canScrollLeft) {
        const ratio = 1 - (distFromLeft / scrollZone);
        newSpeed = -(minSpeed + ratio * (maxSpeed - minSpeed));
      } else if (distFromRight < scrollZone && distFromRight >= 0 && canScrollRight) {
        const ratio = 1 - (distFromRight / scrollZone);
        newSpeed = minSpeed + ratio * (maxSpeed - minSpeed);
      }
      
      // Only update if speed changed significantly (prevents jitter)
      if (Math.abs(newSpeed - currentScrollSpeed) > 0.5 || (newSpeed === 0 && currentScrollSpeed !== 0)) {
        currentScrollSpeed = newSpeed;
        
        // Start animation if needed and not already running
        if (currentScrollSpeed !== 0 && scrollAnimationId === null) {
          scrollAnimationId = requestAnimationFrame(animateScroll);
        }
      }
    };
    
    const stopScrolling = () => {
      currentScrollSpeed = 0;
      if (scrollAnimationId) {
        cancelAnimationFrame(scrollAnimationId);
        scrollAnimationId = null;
      }
    };
    
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (e instanceof TouchEvent) {
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
      } else {
        lastX = e.clientX;
        lastY = e.clientY;
      }
      this.updateDragVisual(lastX, lastY);
      updateScrollSpeed(lastX);
    };

    const sortable = new Sortable(carouselGrid, {
      ...this.getBaseSortableOptions(true),
      draggable: '.entity-card-wrapper',
      direction: 'horizontal',
      
      // Disable SortableJS built-in scroll - we handle it manually
      scroll: false,
      
      onChoose: () => {
        // Item chosen for drag
      },
      
      onStart: (evt) => {
        DragAndDropManager.isReordering = true;
        evt.item.classList.add('dragging');
        
        // Hide ALL entity-controls in the carousel during drag
        carouselGrid.querySelectorAll('.entity-controls').forEach((ctrl) => {
          (ctrl as HTMLElement).style.visibility = 'hidden';
        });
        
        const originalEvent = (evt as any).originalEvent;
        const touch = (originalEvent as TouchEvent)?.touches?.[0];
        const mouse = originalEvent as MouseEvent;
        lastX = touch?.clientX ?? mouse?.clientX ?? 0;
        lastY = touch?.clientY ?? mouse?.clientY ?? 0;
        
        this.createDragVisual(evt.item, lastX, lastY);
        
        document.addEventListener('mousemove', onMove);
        document.addEventListener('touchmove', onMove, { passive: true });
        
        if ('vibrate' in navigator) navigator.vibrate(50);
        document.body.style.userSelect = 'none';
      },
      
      onEnd: (evt) => {
        evt.item.classList.remove('dragging');
        
        // Stop smooth scrolling
        stopScrolling();
        
        // Show ALL entity-controls again
        carouselGrid.querySelectorAll('.entity-controls').forEach((ctrl) => {
          (ctrl as HTMLElement).style.visibility = '';
        });
        
        this.removeDragVisual();
        
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('touchmove', onMove);
        
        document.body.style.userSelect = '';
        if ('vibrate' in navigator) navigator.vibrate(30);
        
        this.reconnectSingleCameraManager(evt.item);
        
        const carousel = evt.item.closest('.carousel-grid') as HTMLElement;
        if (carousel) {
          this.updateCarouselConfiguration(carousel);
        }
      }
    });
    
    this.sortableInstances.set(carouselGrid, sortable);
  }

  enableChipsCarousel(container: HTMLElement): void {
    const chipsCarousel = container.querySelector('.chips-grid') as HTMLElement;
    if (!chipsCarousel) return;
    
    const existingInstance = this.sortableInstances.get(chipsCarousel);
    if (existingInstance) {
      existingInstance.destroy();
    }

    // Get the scrollable container
    const scrollContainer = chipsCarousel.closest('.carousel-container, .chips-carousel-container') as HTMLElement;

    let lastX = 0, lastY = 0;
    let scrollSpeed = 0;
    let scrollAnimationId: number | null = null;
    
    const smoothScroll = () => {
      if (scrollContainer && scrollSpeed !== 0) {
        const maxScroll = scrollContainer.scrollWidth - scrollContainer.clientWidth;
        const currentScroll = scrollContainer.scrollLeft;
        
        if ((scrollSpeed < 0 && currentScroll <= 0) || 
            (scrollSpeed > 0 && currentScroll >= maxScroll)) {
          scrollSpeed = 0;
          scrollAnimationId = null;
          return;
        }
        
        scrollContainer.scrollLeft += scrollSpeed;
        scrollAnimationId = requestAnimationFrame(smoothScroll);
      } else {
        scrollAnimationId = null;
      }
    };
    
    const updateScrollSpeed = (x: number) => {
      if (!scrollContainer) return;
      
      const containerRect = scrollContainer.getBoundingClientRect();
      const maxScroll = scrollContainer.scrollWidth - scrollContainer.clientWidth;
      const currentScroll = scrollContainer.scrollLeft;
      const scrollZone = 80;
      const maxSpeed = 12;
      const minSpeed = 2;
      
      const distFromLeft = x - containerRect.left;
      const distFromRight = containerRect.right - x;
      
      const canScrollLeft = currentScroll > 0;
      const canScrollRight = currentScroll < maxScroll;
      
      if (distFromLeft < scrollZone && distFromLeft >= 0 && canScrollLeft) {
        const ratio = 1 - (distFromLeft / scrollZone);
        scrollSpeed = -(minSpeed + ratio * (maxSpeed - minSpeed));
      } else if (distFromRight < scrollZone && distFromRight >= 0 && canScrollRight) {
        const ratio = 1 - (distFromRight / scrollZone);
        scrollSpeed = minSpeed + ratio * (maxSpeed - minSpeed);
      } else {
        scrollSpeed = 0;
      }
      
      if (scrollSpeed !== 0 && !scrollAnimationId) {
        scrollAnimationId = requestAnimationFrame(smoothScroll);
      }
    };
    
    const stopScrolling = () => {
      scrollSpeed = 0;
      if (scrollAnimationId) {
        cancelAnimationFrame(scrollAnimationId);
        scrollAnimationId = null;
      }
    };
    
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (e instanceof TouchEvent) {
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
      } else {
        lastX = e.clientX;
        lastY = e.clientY;
      }
      this.updateDragVisual(lastX, lastY);
      updateScrollSpeed(lastX);
    };

    const sortable = new Sortable(chipsCarousel, {
      ...this.getBaseSortableOptions(true),
      draggable: '.chip-wrapper',
      direction: 'horizontal',
      scroll: false,
      
      onStart: (evt) => {
        DragAndDropManager.isReordering = true;
        evt.item.classList.add('dragging');
        
        const originalEvent = (evt as any).originalEvent;
        const touch = (originalEvent as TouchEvent)?.touches?.[0];
        const mouse = originalEvent as MouseEvent;
        lastX = touch?.clientX ?? mouse?.clientX ?? 0;
        lastY = touch?.clientY ?? mouse?.clientY ?? 0;
        
        this.createDragVisual(evt.item, lastX, lastY, true);
        
        document.addEventListener('mousemove', onMove);
        document.addEventListener('touchmove', onMove, { passive: true });
        
        if ('vibrate' in navigator) navigator.vibrate(50);
        document.body.style.userSelect = 'none';
      },
      
      onEnd: (evt) => {
        DragAndDropManager.isReordering = false;
        evt.item.classList.remove('dragging');
        stopScrolling();
        this.removeDragVisual();
        
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('touchmove', onMove);
        
        document.body.style.userSelect = '';
        if ('vibrate' in navigator) navigator.vibrate(30);
        
        const chipsGrid = evt.item.closest('.carousel-grid.chips') as HTMLElement;
        if (chipsGrid) {
          this.updateChipsOrder(chipsGrid);
        }
      }
    });
    
    this.sortableInstances.set(chipsCarousel, sortable);
  }

  private updateChipsOrder(chipsGrid: HTMLElement): void {
    const chipWrappers = Array.from(chipsGrid.querySelectorAll('.chip-wrapper'));
    const newOrder: string[] = [];
    
    chipWrappers.forEach((wrapper) => {
      const chipId = (wrapper as HTMLElement).dataset.chipId || (wrapper as HTMLElement).dataset.entityId;
      if (chipId) newOrder.push(chipId);
    });
    
    if (this.customizationManager) {
      ChipsConfigurationManager.saveChipsOrder(this.customizationManager, newOrder);
    }
  }

  private updateCarouselConfiguration(carousel: HTMLElement): void {
    const areaId = carousel.dataset.areaId;
    const sectionType = carousel.dataset.sectionType;
    
    if (!areaId || !sectionType) return;
    
    const entityWrappers = Array.from(carousel.querySelectorAll('.entity-card-wrapper'));
    const newOrder: string[] = [];
    
    entityWrappers.forEach((wrapper) => {
      let entityId = (wrapper as HTMLElement).dataset.entityId;
      if (!entityId) {
        const appleHomeCard = wrapper.querySelector('apple-home-card') as any;
        if (appleHomeCard) {
          entityId = appleHomeCard.entity || appleHomeCard.entityId || appleHomeCard.getAttribute('entity');
        }
      }
      if (entityId) newOrder.push(entityId);
    });
    
    if (this.customizationManager) {
      this.customizationManager.updateCarouselOrderWithContext(areaId, sectionType, newOrder, this.context);
    }
  }

  private reconnectSingleCameraManager(wrapper: HTMLElement): void {
    const appleHomeCard = wrapper.querySelector('apple-home-card') as any;
    if (appleHomeCard && typeof appleHomeCard.reloadCameraImage === 'function') {
      appleHomeCard.reloadCameraImage();
    }
  }

  disableDragAndDrop(container: HTMLElement): void {
    const gridContainers = container.querySelectorAll('.area-entities, .room-group-grid');
    gridContainers.forEach(gridContainer => {
      const instance = this.sortableInstances.get(gridContainer as HTMLElement);
      if (instance) {
        instance.destroy();
        this.sortableInstances.delete(gridContainer as HTMLElement);
      }
    });
    
    const carouselContainers = container.querySelectorAll('.carousel-grid');
    carouselContainers.forEach(carouselGrid => {
      const instance = this.sortableInstances.get(carouselGrid as HTMLElement);
      if (instance) {
        instance.destroy();
        this.sortableInstances.delete(carouselGrid as HTMLElement);
      }
    });
  }

  destroy(): void {
    this.removeDragVisual();
    this.sortableInstances.forEach((instance) => instance.destroy());
    this.sortableInstances.clear();
  }
}
