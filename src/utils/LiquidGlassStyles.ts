/**
 * iOS 26 Liquid Glass Design System
 * Centralized styles for glass effect buttons and design tokens used throughout the dashboard.
 * Import and inject these styles once, then use the CSS classes and variables.
 */

/**
 * CSS Custom Properties (Design Tokens) for consistent styling across components.
 * These should be injected at the :root level for global access.
 */
export const designTokensCSS = `
    :root {
      /* ============================================
         Apple Home Design Tokens
         ============================================ */
      
      /* Border Radius */
      --apple-card-radius: 22px;
      --apple-modal-radius: 22px;
      --apple-chip-radius: 50px;
      --apple-input-radius: 10px;
      --apple-toggle-radius: 11px;
      --apple-button-radius: 50%;
      
      /* Action Button Size - Unified size for all action buttons */
      --apple-action-btn-size: 40px;
      --apple-action-icon-size: 22px;
      
      /* Card Height - responsive, changes via media queries */
      --apple-card-height: 70px;
      
      /* Card Icon - the circle with icon inside entity cards */
      --apple-card-icon-size: 40px;
      --apple-card-icon-font-size: 24px;
      
      /* Camera Height - responsive, changes via media queries */
      --apple-camera-height: 220px;
      
      /* Typography */
      --apple-title-size: 28px;
      --apple-section-title-size: 17px;
      --apple-card-name-size: 15px;
      --apple-card-state-size: 13px;
      --apple-temp-font-size-regular: 16px;
      --apple-temp-font-size-tall: 40px;
      
      /* Chip Sizes */
      --apple-chip-height: 32px;
      --apple-chip-padding: 3px 16px 3px 8px;
      --apple-chip-gap: 6px;
      --apple-chip-icon-size: 24px;
      --apple-chip-name-size: 13px;
      --apple-chip-status-size: 11px;
      
      /* Spacing */
      --apple-section-gap: 20px;
      --apple-card-gap: 10px;
      --apple-card-padding: 10px;
      
      /* Page Padding - horizontal padding for the dashboard */
      --apple-page-padding: 22px;
      --apple-page-padding-bottom: 22px;
      
      /* ============================================
         Card & Chip Background Colors
         Change transparency from one place for all cards/chips
         ============================================ */
      
      /* Inactive/Off state backgrounds */
      --apple-card-bg-inactive: rgba(0, 0, 0, 0.3);
      --apple-chip-bg-inactive: rgba(0, 0, 0, 0.3);
      --apple-icon-bg-inactive: rgba(0, 0, 0, 0.2);
      
      /* Active/On state backgrounds */
      --apple-card-bg-active: #ffffff;
      --apple-chip-bg-active: rgba(255, 255, 255, 0.9);
      
      /* Text colors */
      --apple-text-inactive: #ffffff;
      --apple-text-active: #1d1d1f;
      --apple-icon-inactive: rgba(142, 142, 147, 0.8);
      
      /* ============================================
         Grid Columns - Card span values (out of 12 column grid)
         Lower span = more columns: span 2 = 6 cols, span 3 = 4 cols, span 4 = 3 cols, span 6 = 2 cols
         
         BREAKPOINT REFERENCE (container width, accounting for 44px padding):
         - XL:      >= 1356px container (1400px+ viewport)  → 6 columns
         - Large:   1056-1355px container (1100-1399px viewport) → 4 columns
         - Medium:  756-1055px container (800-1099px viewport) → 4 columns
         - Tablet:  556-755px container (600-799px viewport) → 3 columns
         - Mobile:  356-555px container (400-599px viewport) → 2 columns
         - Small:   316-355px container (360-399px viewport) → 2 columns
         - XS:      < 316px container (< 360px viewport) → 1 column
         ============================================ */
      --apple-card-span-xl: 2;       /* 6 columns - Extra large screens */
      --apple-card-span-desktop: 3;  /* 4 columns - Desktop/Large tablets */
      --apple-card-span-tablet: 4;   /* 3 columns - Tablet portrait */
      --apple-card-span-mobile: 6;   /* 2 columns - Mobile */
      --apple-card-span-xs: 12;      /* 1 column - Extra small / accessibility */
    }
    
    /* ============================================
       Mobile Overrides (< 768px viewport)
       Smaller typography and buttons for mobile devices
       ============================================ */
    @media (max-width: 767px) {
      :root {
        /* Card & Camera Heights - Mobile */
        --apple-card-height: 70px;
        --apple-camera-height: 200px;
        
        /* Card Icon - Mobile */
        --apple-card-icon-size: 42px;
        --apple-card-icon-font-size: 28px;
        
        /* Typography - Mobile */
        --apple-title-size: 32px;
        --apple-section-title-size: 20px;
        --apple-card-name-size: 16px;
        --apple-card-state-size: 14px;
        --apple-temp-font-size-regular: 16px;
        --apple-temp-font-size-tall: 40px;
        
        /* Action Buttons - Mobile */
        --apple-action-btn-size: 40px;
        --apple-action-icon-size: 22px;
        
        /* Chips - Mobile */
        --apple-chip-height: 36px;
        --apple-chip-icon-size: 24px;
        --apple-chip-name-size: 13px;
        --apple-chip-status-size: 12px;
        
        /* Page Padding - Mobile */
        --apple-page-padding: 16px;
        --apple-page-padding-bottom: 16px;

        /* Spacing */
        --apple-section-gap: 20px;
        --apple-card-gap: 10px;
        --apple-card-padding: 8px;
      }
    }
    
    /* ============================================
       Small Mobile Overrides (< 400px viewport)
       Even smaller padding for compact screens
       ============================================ */
    @media (max-width: 399px) {
      :root {
        /* Page Padding - Small Mobile */
        --apple-page-padding: 12px;
        --apple-page-padding-bottom: 12px;
        
        /* Typography - Small Mobile */
        --apple-temp-font-size-regular: 16px;
        --apple-temp-font-size-tall: 40px;
      }
    }
`;

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
      /* Unified button size */
      width: var(--apple-action-btn-size, 40px) !important;
      height: var(--apple-action-btn-size, 40px) !important;
      min-width: var(--apple-action-btn-size, 40px) !important;
    }

    .liquid-glass-btn:active {
      transform: scale(0.95);
    }

    .liquid-glass-btn ha-icon {
      position: relative;
      z-index: 2;
      --mdc-icon-size: var(--apple-action-icon-size, 22px);
    }

    .liquid-glass-btn svg {
      position: relative;
      z-index: 2;
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
      backdrop-filter: blur(5px) saturate(1.5) !important;
      -webkit-backdrop-filter: blur(5px) saturate(1.5) !important;
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
let tokensInjected = false;

/**
 * Injects the design tokens (CSS custom properties) into the document head.
 * Safe to call multiple times - will only inject once.
 */
export function injectDesignTokens(): void {
  if (tokensInjected) return;
  
  const existingStyle = document.getElementById('apple-design-tokens');
  if (existingStyle) {
    tokensInjected = true;
    return;
  }

  const style = document.createElement('style');
  style.id = 'apple-design-tokens';
  style.textContent = designTokensCSS;

  document.head.appendChild(style);
  tokensInjected = true;
}

/**
 * Injects the liquid glass button styles into the document head.
 * Safe to call multiple times - will only inject once.
 * Note: This only works for elements NOT inside shadow DOMs.
 * For shadow DOM elements, include liquidGlassCSS in the component's style block.
 */
export function injectLiquidGlassStyles(): void {
  // Always inject design tokens first
  injectDesignTokens();
  
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
 * All buttons now use the same unified size
 */
export const LiquidGlassClasses = {
  /** Header buttons (menu, back, sidebar) - transparent glass */
  headerButton: 'liquid-glass-btn liquid-glass-transparent',
  
  /** Modal cancel/X button - dark glass */
  modalCancel: 'liquid-glass-btn liquid-glass-dark',
  
  /** Modal done/confirm button - light glass */
  modalDone: 'liquid-glass-btn liquid-glass-light',
} as const;
