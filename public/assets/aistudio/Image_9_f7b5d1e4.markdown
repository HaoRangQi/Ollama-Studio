---
name: Electric Lavender macOS Local AI
colors:
  surface: '#14121d'
  surface-dim: '#14121d'
  surface-bright: '#3a3744'
  surface-container-lowest: '#0f0d18'
  surface-container-low: '#1c1a25'
  surface-container: '#201e2a'
  surface-container-high: '#2b2834'
  surface-container-highest: '#36333f'
  on-surface: '#e6e0f0'
  on-surface-variant: '#cac3d7'
  inverse-surface: '#e6e0f0'
  inverse-on-surface: '#312f3b'
  outline: '#948ea0'
  outline-variant: '#494454'
  surface-tint: '#cdbdff'
  primary: '#cdbdff'
  on-primary: '#370096'
  primary-container: '#7952ec'
  on-primary-container: '#f9f3ff'
  inverse-primary: '#673dd9'
  secondary: '#cbbeff'
  on-secondary: '#330c90'
  secondary-container: '#4d31a8'
  on-secondary-container: '#bdadff'
  tertiary: '#ffafd3'
  on-tertiary: '#620040'
  tertiary-container: '#ba4385'
  on-tertiary-container: '#fff2f5'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e7deff'
  primary-fixed-dim: '#cdbdff'
  on-primary-fixed: '#20005f'
  on-primary-fixed-variant: '#4f1ac1'
  secondary-fixed: '#e7deff'
  secondary-fixed-dim: '#cbbeff'
  on-secondary-fixed: '#1e0061'
  on-secondary-fixed-variant: '#4b2fa6'
  tertiary-fixed: '#ffd8e7'
  tertiary-fixed-dim: '#ffafd3'
  on-tertiary-fixed: '#3d0026'
  on-tertiary-fixed-variant: '#85145a'
  background: '#14121d'
  on-background: '#e6e0f0'
  surface-variant: '#36333f'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  display-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.005em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: 0em
  body-lg:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: -0.005em
  body-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  label-lg:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Geist
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Geist
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  code-md:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-compact: 0.75rem
  margin: 1.5rem
  margin-window: 1.25rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system blends Material 3 Expressive philosophies with native macOS desktop elegance, tailored specifically for local neural runtime interactions and Ollama model orchestration. The visual character merges playful, organic display geometry with razor-sharp developer-grade typography, establishing an interface that feels both approachable and uncompromisingly powerful.

### Personality & Tone
- **Luminous & Kinetic:** Electric lavender highlights pulse against deep obsidian canvas layers to signal inference telemetry, streaming tokens, and model memory allocation.
- **Approachable Precision:** Organic pill structures, generous curvature, and ambient translucency soften the raw technical weight of local hardware orchestration.
- **Mac-Native Fidelity:** Subtly integrates desktop-native conventions—such as multi-pane navigation, vibrant dark-mode surface stacking, and compact utility bars—with expressive Material You dynamic tonal hierarchies.

### Design Movement
The interface operates at the intersection of **Material 3 Expressive** and **Refined macOS Dark Translucency**. Rather than hard skeletal borders or harsh skeuomorphism, spatial hierarchy relies on tinted surface tiers (`surface-container-lowest` through `surface-container-highest`), soft outer rim illumination (1px 8% white/lavender inner borders), and saturated, dynamic glow states during active tensor operations.

## Colors

The palette employs deep dark-mode tonal layering to eliminate eye strain during prolonged session work while reserving luminous neon frequencies for inference feedback, chat bubbles, and parameter chips.

### Functional Roles
- **Primary (`#7952EC`):** Electric Lavender. Drives interactive controls, active inference indicators, floating primary action pills, and high-emphasis toggles.
- **Secondary (`#9E86FF`):** Soft Heliotrope. Used for contextual floating toolbars, syntax accents, subtle selection rings, and secondary metadata pills.
- **Tertiary (`#F472B6`):** Pastel Berry. Highlights hardware thresholds (VRAM saturation, high temperature parameters), experimental quantizations, and system warnings.
- **Neutral / Canvas Layers (`#13111C` base):**
  - `surface-container-lowest`: `#0C0A12` (Window backdrop & terminal logs)
  - `surface-container-low`: `#13111C` (Sidebar model lists & navigation)
  - `surface-container`: `#1A1726` (Standard chat viewport & workspace)
  - `surface-container-high`: `#231F33` (Card modules, prompt builders, parameter sheets)
  - `surface-container-highest`: `#2E2A42` (Elevated pills, hover highlights, active input containers)

### State Color Guidance
Interactive hover states must not shift opacity blindly. Instead, apply a 6% overlay of `primary_color_hex` to container backgrounds. Active streaming tokens emit an animated 20% alpha glow of `#7952EC` along the baseline container edge.

## Typography

The typography pairs the geometric, rounded optimism of **Plus Jakarta Sans** for prominent headers with the engineered clarity of **Geist** for generated prose, JSON responses, model telemetry, and parameter metadata.

### Application Rules
- **Plus Jakarta Sans** governs titles, empty-state welcomes, model cards, and modal headings. Its rounded forms provide the signature Material You expressiveness.
- **Geist** drives all local AI conversation streams, parameter sliders, system prompt configurations, and compact telemetry pills. The tight geometric apertures ensure high legibility even when rendered at small scale in multi-pane sidebars.
- **Code & Markdown Outputs:** Streaming responses in markdown utilize `code-md` nested inside `surface-container-lowest` preformatted wrappers with highlighted syntax tinted in secondary heliotrope and tertiary berry hues.

## Layout & Spacing

The layout is built for responsive macOS desktop windows, organized around a multi-column fluid workspace consisting of an extensible navigation/model rail, a conversational stage, and an optional collapsible telemetry sheet.

### Grid & Layout Structure
- **Three-Pane Desktop Architecture:**
  - **Left Navigation Rail / Model Drawer:** Fixed width (`260px` default, collapsible to `64px` icon dock) with `gutter-compact` interior spacing.
  - **Primary Chat Canvas:** Fluid width with a centered conversational max-width boundary of `840px` to guarantee comfortable reading line lengths.
  - **Right Telemetry / Parameter Inspector:** Collapsible drawer (`320px`) housing dynamic hardware monitors (GPU layers, context size, temperature).
- **macOS Window Integration:** Uses `margin-window` (20px / 1.25rem) around detached floating bars to preserve the native translucent macOS traffic light chrome area (first 38px of the top edge left uncluttered).
- **Spacing Rhythm:** Structured strictly around 4px / 8px increments. Compact list items use `space-sm` gaps, while conversation message clusters use `space-md` separation and section stacks employ `space-xl`.

## Elevation & Depth

Visual hierarchy uses Material 3 tonal stacking reinforced by ambient luminous backdrops rather than sharp drop shadows.

### Tonal Tiers & Lighting
- **Level 0 (Base Canvas):** Background layer (`#0C0A12`) with subtle desktop wallpaper vibrancy filtering through 15% blur opacity.
- **Level 1 (Structural Panels):** Sidebar and chat areas resting on `#13111C` and `#1A1726`. Zero blur shadows; separation achieved solely through tonal value contrast.
- **Level 2 (Cards & Inspectors):** Model selection cards and parameter groups placed on `#231F33`, bounded by a faint translucent border: `1px solid rgba(255, 255, 255, 0.06)`.
- **Level 3 (Floating Action Pills & Prompts):** Floating compose fields and prompt action bars sit on `#2E2A42` elevated by an ambient tinted shadow:
  - `box-shadow: 0 12px 32px -8px rgba(12, 10, 18, 0.65), 0 0 20px 2px rgba(121, 82, 236, 0.15);`
  - Subtle `1px` top-lit inner border: `rgba(158, 134, 255, 0.25)`.
- **Level 4 (Modals & Overlays):** Command palettes and download sheets resting on `#2E2A42` with 32px backdrop blur and `rgba(0, 0, 0, 0.75)` scrim.

## Shapes

The design system embraces an expressive pill-shaped visual language (`roundedness: 3`). Fully rounded capsules and broad organic radii define the personality of the macOS client.

### Shape Geometry Rules
- **Pills (`rounded-full` / `9999px`):** Used universally for action buttons, status indicators, telemetry chips, floating prompt triggers, and tag badges.
- **Large Surfaces (`rounded-xl` / `3rem` / `48px`):** Main chat response bubbles, floating prompt docks, and elevated hero cards.
- **Medium Surfaces (`rounded-lg` / `2rem` / `32px`):** Settings dialogs, model download panels, and drawer containers.
- **Compact Surface Units (`rounded-md` / `1rem` / `16px`):** Code block containers, text input fields, parameter slider tracks, and nested model detail panels.

## Components

### Buttons & Floating Action Pills
- **Primary Action Pill:** Fully rounded capsule (`min-height: 44px`, horizontal padding `24px`). Background set to `primary_color_hex` (`#7952EC`) with white text, font `label-lg`. On hover, transitions to a saturated glow (`box-shadow: 0 0 16px rgba(121, 82, 236, 0.45)`).
- **Secondary / Tonal Button:** Background in `surface-container-highest` with text tinted in `secondary_color_hex` (`#9E86FF`). Fully rounded pill shape with a 1px border `rgba(158, 134, 255, 0.15)`.
- **Floating Model Switcher Pill:** A high-delight pill floating at the top-center of the chat canvas. Displays model name (e.g., `llama3.3:70b`), current quantization, and a status dot. Features a subtle glass backdrop blur (`backdrop-filter: blur(16px)`).

### Chips & Status Tags
- **Telemetry Chips:** Fully rounded pills (`height: 24px`, padding `4px 12px`, typography `label-sm`).
  - *Active Inference:* `#7952EC` at 15% opacity background, `#9E86FF` text, featuring an animated 6px pulsing dot.
  - *VRAM / Resource Alert:* Tertiary berry background (`#F472B6` at 15%), `#F472B6` text.
- **Model Tag Chips:** Tactile selectable chips for filtering models (`Vision`, `Code`, `Embedding`, `7B`, `70B`). Inactive: `surface-container` with low contrast outline; Active: filled with `#7952EC` with bright contrast text.

### Input Fields & Compose Dock
- **Chat Prompt Dock:** Floating anchored island with `rounded-xl` (32px / 48px profile) resting over the bottom viewport edge. Background `#231F33` with an outer border `1px solid rgba(158, 134, 255, 0.2)`. Houses inline auto-resizing Geist input, attachment button, and an expressive circular send pill (`40px × 40px`).
- **Parameter Sliders & Number Fields:** Track containers use pill-shaped troughs with electric lavender slider thumbs that expand slightly upon user drag.

### Cards & Model Tiles
- **Model Library Cards:** Nested inside `surface-container-high` (`border-radius: 24px`, padding: `space-lg`). Includes model display name in `headline-sm`, parameter count tags, and a quick-action "Run" pill. Hover state elevates the card through a 1px electric lavender border highlight and subtle -2px Y-axis translation.

### Checkboxes, Radio Buttons & Toggles
- **Toggles:** Expressive oversized capsule switches (52px width, 32px height) following Material 3 guidelines. The active toggle knob displays a lavender-tinted checkmark icon when enabled.
- **Checkboxes:** Rounded squares (6px border radius) filled with `#7952EC` when checked, utilizing Geist mono symbols for precision.

### Code & Response Blocks
- **AI Response Bubbles:** Transparent background directly sitting on the chat canvas with an elevated background for code snippets (`#0C0A12`, rounded to 16px, framed in `1px solid rgba(255, 255, 255, 0.05)`). Copy actions and token velocity (`tokens/sec`) render in an attached top-right floating pill.