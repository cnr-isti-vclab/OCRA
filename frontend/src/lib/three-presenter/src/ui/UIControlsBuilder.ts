/**
 * UIControlsBuilder - Builder pattern for creating 3D viewer UI controls
 * 
 * This module provides a clean, declarative API for creating button-based UI controls
 * for 3D viewers. It handles:
 * - Button creation with consistent styling
 * - Icon management (Bootstrap Icons)
 * - Event handlers (hover, click)
 * - Container layout and positioning
 * - Responsive hover effects
 * 
 * @module UIControlsBuilder
 * @author OCRA Team
 */

/**
 * Configuration for a single button control
 */
export interface ButtonConfig {
  /** Unique identifier for the button */
  id: string;
  /** Bootstrap icon class (e.g., 'bi-house', 'bi-camera') */
  icon: string;
  /** Custom HTML content (overrides icon if provided) */
  customHTML?: string;
  /** Tooltip text on hover */
  title: string;
  /** Click event handler */
  onClick: () => void;
  /** Initial visibility state */
  visible?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Configuration for the button container
 */
export interface ContainerConfig {
  /** Container position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Container layout direction: 'vertical' | 'horizontal' */
  direction?: 'vertical' | 'horizontal';
  /** Gap between buttons (Bootstrap gap class, e.g., 'gap-2') */
  gap?: string;
  /** Z-index for stacking */
  zIndex?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Result of building UI controls
 */
export interface UIControlsResult {
  /** The container element holding all buttons */
  container: HTMLDivElement;
  /** Map of button elements by ID */
  buttons: Map<string, HTMLButtonElement>;
}

/**
 * UIControlsBuilder - Creates and manages UI button controls
 * 
 * Example usage:
 * ```typescript
 * const builder = new UIControlsBuilder();
 * const controls = builder
 *   .setContainer({ position: 'top-left', direction: 'vertical' })
 *   .addButton({
 *     id: 'home',
 *     icon: 'bi-house',
 *     title: 'Reset camera view',
 *     onClick: () => this.resetCamera()
 *   })
 *   .addButton({
 *     id: 'screenshot',
 *     icon: 'bi-camera',
 *     title: 'Take screenshot',
 *     onClick: () => this.takeScreenshot()
 *   })
 *   .build();
 * 
 * // Attach to mount point
 * mount.appendChild(controls.container);
 * 
 * // Access individual buttons
 * const homeButton = controls.buttons.get('home');
 * ```
 */
export class UIControlsBuilder {
  private containerConfig: ContainerConfig = {
    position: 'top-left',
    direction: 'vertical',
    gap: 'gap-2',
    zIndex: '1000'
  };
  
  private buttons: ButtonConfig[] = [];
  
  /**
   * Configure the button container
   */
  setContainer(config: Partial<ContainerConfig>): this {
    this.containerConfig = { ...this.containerConfig, ...config };
    return this;
  }
  
  /**
   * Add a button to the control panel
   */
  addButton(config: ButtonConfig): this {
    this.buttons.push(config);
    return this;
  }
  
  /**
   * Add multiple buttons at once
   */
  addButtons(configs: ButtonConfig[]): this {
    this.buttons.push(...configs);
    return this;
  }
  
  /**
   * Build the UI controls and return the result
   */
  build(): UIControlsResult {
    const container = this.createContainer();
    const buttonElements = new Map<string, HTMLButtonElement>();
    
    // Create each button
    for (const config of this.buttons) {
      const button = this.createButton(config);
      container.appendChild(button);
      buttonElements.set(config.id, button);
    }
    
    return {
      container,
      buttons: buttonElements
    };
  }
  
  /**
   * Create the container element
   */
  private createContainer(): HTMLDivElement {
    const container = document.createElement('div');
    
    // Base classes
    const baseClasses = ['position-absolute', 'd-flex'];
    
    // Position classes
    const positionClasses = this.getPositionClasses(this.containerConfig.position!);
    
    // Direction classes
    const directionClass = this.containerConfig.direction === 'horizontal' 
      ? 'flex-row' 
      : 'flex-column';
    
    // Gap
    const gapClass = this.containerConfig.gap || 'gap-2';
    
    // Margin for spacing from edges
    const marginClass = 'm-2';
    
    // Combine all classes
    const allClasses = [
      ...baseClasses,
      ...positionClasses,
      directionClass,
      gapClass,
      marginClass,
      this.containerConfig.className || ''
    ].filter(c => c.length > 0);
    
    container.className = allClasses.join(' ');
    container.style.zIndex = this.containerConfig.zIndex || '1000';
    
    return container;
  }
  
  /**
   * Get Bootstrap positioning classes based on position config
   */
  private getPositionClasses(position: string): string[] {
    switch (position) {
      case 'top-left':
        return ['top-0', 'start-0'];
      case 'top-right':
        return ['top-0', 'end-0'];
      case 'bottom-left':
        return ['bottom-0', 'start-0'];
      case 'bottom-right':
        return ['bottom-0', 'end-0'];
      default:
        return ['top-0', 'start-0'];
    }
  }
  
  /**
   * Create a single button element
   */
  private createButton(config: ButtonConfig): HTMLButtonElement {
    const button = document.createElement('button');
    
    // Set content - custom HTML or icon
    if (config.customHTML) {
      button.innerHTML = config.customHTML;
    } else {
      button.innerHTML = `<i class="bi ${config.icon}"></i>`;
    }
    
    // Base button classes - Bootstrap styling
    // Note: We don't include 'd-flex' here because it uses !important and conflicts with display: none
    // Instead, we'll set display via inline style
    const baseClasses = [
      'btn',
      'btn-light',
      'p-2',
      'shadow-sm',
      'rounded',
      'align-items-center',
      'justify-content-center'
    ];
    
    // Add custom classes if provided
    const allClasses = [...baseClasses, config.className || ''].filter(c => c.length > 0);
    button.className = allClasses.join(' ');
    
    // Set tooltip
    button.title = config.title;
    
    // Initial visibility - use inline style to override Bootstrap classes
    if (config.visible === false) {
      button.style.display = 'none';
    } else {
      button.style.display = 'flex';
    }
    
    // Add hover effects for scale animation
    button.addEventListener('mouseenter', () => {
      button.style.transform = 'scale(1.05)';
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.transform = 'scale(1)';
    });
    
    // Add click handler
    button.addEventListener('click', config.onClick);
    
    return button;
  }
  
  /**
   * Reset the builder to initial state
   */
  reset(): this {
    this.buttons = [];
    this.containerConfig = {
      position: 'top-left',
      direction: 'vertical',
      gap: 'gap-2',
      zIndex: '1000'
    };
    return this;
  }
}

/**
 * Utility function to create a simple button (non-builder pattern)
 * 
 * @param config Button configuration
 * @returns The created button element
 */
export function createButton(config: ButtonConfig): HTMLButtonElement {
  const builder = new UIControlsBuilder();
  builder.addButton(config);
  const result = builder.build();
  return result.buttons.get(config.id)!;
}

/**
 * Utility function to create a button container with buttons
 * 
 * @param containerConfig Container configuration
 * @param buttonConfigs Array of button configurations
 * @returns The UI controls result
 */
export function createButtonPanel(
  containerConfig: Partial<ContainerConfig>,
  buttonConfigs: ButtonConfig[]
): UIControlsResult {
  const builder = new UIControlsBuilder();
  builder.setContainer(containerConfig);
  builder.addButtons(buttonConfigs);
  return builder.build();
}
