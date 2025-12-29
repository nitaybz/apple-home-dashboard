/**
 * iOS 26 Liquid Glass Button Styles
 * Centralized styles for glass effect buttons used throughout the dashboard.
 * Import and inject these styles once, then use the CSS classes.
 */

/**
 * The raw CSS string for liquid glass button styles.
 * Use this to inject into shadow DOMs or component-specific style blocks.
 */
export const liquidGlassCSS = `
    /* ============================================
       iOS 26 Liquid Glass Button System
       ============================================ */

    /* Base liquid glass button */
    .liquid-glass-btn {
      border: none !important;
      border-radius: 50% !important;
      color: rgba(255, 255, 255, 0.9) !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 0 !important;
      outline: none !important;
      transition: all 0.2s ease !important;
      position: relative;
      isolation: isolate;
    }

    .liquid-glass-btn:active {
      transform: scale(0.95);
    }

    .liquid-glass-btn ha-icon {
      position: relative;
      z-index: 2;
    }

    .liquid-glass-btn svg {
      position: relative;
      z-index: 2;
    }

    /* Small buttons (34px) - for modals */
    .liquid-glass-btn-sm {
      width: 34px !important;
      height: 34px !important;
      min-width: 34px !important;
    }

    .liquid-glass-btn-sm ha-icon {
      --mdc-icon-size: 20px;
    }

    /* Medium buttons (36px) - for headers */
    .liquid-glass-btn-md {
      width: 36px !important;
      height: 36px !important;
      min-width: 36px !important;
    }

    .liquid-glass-btn-md ha-icon {
      --mdc-icon-size: 22px;
    }

    /* Mobile adjustments */
    @media (max-width: 768px) {
      .liquid-glass-btn-md {
        width: 34px !important;
        height: 34px !important;
        min-width: 34px !important;
      }
    }
    
    /* Small mobile adjustments */
    @media (max-width: 479px) {
      .liquid-glass-btn-md {
        width: 32px !important;
        height: 32px !important;
        min-width: 32px !important;
      }
      
      .liquid-glass-btn-md ha-icon {
        --mdc-icon-size: 20px;
      }
      
      .liquid-glass-btn-sm {
        width: 30px !important;
        height: 30px !important;
        min-width: 30px !important;
      }
      
      .liquid-glass-btn-sm ha-icon {
        --mdc-icon-size: 18px;
      }
    }
    
    /* Extra small / accessibility */
    @media (max-width: 359px) {
      .liquid-glass-btn-md {
        width: 30px !important;
        height: 30px !important;
        min-width: 30px !important;
      }
      
      .liquid-glass-btn-md ha-icon {
        --mdc-icon-size: 18px;
      }
      
      .liquid-glass-btn-sm {
        width: 28px !important;
        height: 28px !important;
        min-width: 28px !important;
      }
      
      .liquid-glass-btn-sm ha-icon {
        --mdc-icon-size: 16px;
      }
    }
    
    /* Reduce motion for accessibility */
    @media (prefers-reduced-motion: reduce) {
      .liquid-glass-btn {
        transition: none !important;
      }
    }

    /* Transparent glass - reflects background color through blur */
    .liquid-glass-transparent {
      background: rgba(0, 0, 0, 0.2) !important;
      backdrop-filter: blur(5px) saturate(1.3) !important;
      -webkit-backdrop-filter: blur(5px) saturate(1.3) !important;
      box-shadow: 
        inset 0 0 0 1px rgba(255, 255, 255, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.25),
        inset 0 -1px 0 rgba(0, 0, 0, 0.1),
        0 2px 8px rgba(0, 0, 0, 0.12) !important;
    }

    .liquid-glass-transparent::before {
      content: '' !important;
      position: absolute !important;
      inset: -1px !important;
      border-radius: 50% !important;
      padding: 1px !important;
      background: linear-gradient(
        135deg,
        rgba(255, 255, 255, 0.4) 0%,
        rgba(255, 255, 255, 0.15) 25%,
        rgba(255, 255, 255, 0.25) 50%,
        rgba(255, 255, 255, 0.1) 75%,
        rgba(255, 255, 255, 0.35) 100%
      ) !important;
      -webkit-mask: 
        linear-gradient(#fff 0 0) content-box, 
        linear-gradient(#fff 0 0) !important;
      -webkit-mask-composite: xor !important;
      mask-composite: exclude !important;
      pointer-events: none !important;
      z-index: 1 !important;
    }

    .liquid-glass-transparent:hover {
      background: rgba(0, 0, 0, 0.25) !important;
      box-shadow: 
        inset 0 0 0 1px rgba(255, 255, 255, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.35),
        inset 0 -1px 0 rgba(0, 0, 0, 0.1),
        0 4px 12px rgba(0, 0, 0, 0.15) !important;
    }

    .liquid-glass-transparent:hover::before {
      background: linear-gradient(
        135deg,
        rgba(255, 255, 255, 0.5) 0%,
        rgba(255, 255, 255, 0.2) 25%,
        rgba(255, 255, 255, 0.35) 50%,
        rgba(255, 255, 255, 0.15) 75%,
        rgba(255, 255, 255, 0.45) 100%
      ) !important;
    }

    .liquid-glass-transparent:active {
      background: rgba(0, 0, 0, 0.3) !important;
    }

    /* Dark glass - for cancel/X buttons in modals */
    .liquid-glass-dark {
      background: rgba(60, 60, 60, 0.6) !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
    }

    .liquid-glass-dark:hover {
      background: rgba(70, 70, 70, 0.7) !important;
    }

    .liquid-glass-dark:active {
      background: rgba(80, 80, 80, 0.8) !important;
    }

    /* Light glass - for done/confirm buttons in modals */
    .liquid-glass-light {
      background: rgba(120, 120, 120, 0.5) !important;
      backdrop-filter: blur(12px) !important;
      -webkit-backdrop-filter: blur(12px) !important;
    }

    .liquid-glass-light:hover {
      background: rgba(130, 130, 130, 0.6) !important;
    }

    .liquid-glass-light:active {
      background: rgba(140, 140, 140, 0.7) !important;
    }
`;

let stylesInjected = false;

/**
 * Injects the liquid glass button styles into the document head.
 * Safe to call multiple times - will only inject once.
 * Note: This only works for elements NOT inside shadow DOMs.
 * For shadow DOM elements, include liquidGlassCSS in the component's style block.
 */
export function injectLiquidGlassStyles(): void {
  if (stylesInjected) return;
  
  const existingStyle = document.getElementById('liquid-glass-styles');
  if (existingStyle) {
    stylesInjected = true;
    return;
  }

  const style = document.createElement('style');
  style.id = 'liquid-glass-styles';
  style.textContent = liquidGlassCSS;

  document.head.appendChild(style);
  stylesInjected = true;
}

/**
 * CSS class combinations for common button types
 */
export const LiquidGlassClasses = {
  /** Header buttons (menu, back, sidebar) - 36px, transparent glass */
  headerButton: 'liquid-glass-btn liquid-glass-btn-md liquid-glass-transparent',
  
  /** Modal cancel/X button - 34px, dark glass */
  modalCancel: 'liquid-glass-btn liquid-glass-btn-sm liquid-glass-dark',
  
  /** Modal done/confirm button - 34px, light glass */
  modalDone: 'liquid-glass-btn liquid-glass-btn-sm liquid-glass-light',
} as const;
