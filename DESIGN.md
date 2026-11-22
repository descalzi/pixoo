---
name: Pixoo Studio
description: A pocket studio for a 64×64 pixel display
colors:
  bg: "#15122B"
  surface: "#1E1A3A"
  surface-2: "#262150"
  border: "#2F2A55"
  fg: "#F1EEFF"
  fg-muted: "#ADA6D6"
  accent: "#8B7BFF"
  on-accent: "#120F26"
  fill-pink: "#FF8FC7"
  fill-mint: "#7CF0C5"
  fill-gold: "#FFD36B"
typography:
  display:
    fontFamily: "Bricolage Grotesque, Rethink Sans, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Rethink Sans, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Rethink Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
rounded:
  control: "12px"
  card: "16px"
  panel: "24px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    height: "44px"
---

# Design System: Pixoo Studio

## Overview
**Creative North Star: "The arcade cabinet's back room"**: a tidy, friendly workbench where the glowing panel is the star.
Source style: uiux library §10.10 Playful SaaS, palette P3 Midnight Arcade (dark lead, light alternative), applied under Operate rules: the style owns type, palette, density and the signature move; layout and controls stay standard.
**Signature move:** every effect choice is a live, animated miniature of itself, so the picker *is* the gallery.
**Key characteristics:** one stage that always shows exactly what will be sent; each section owns a colour; connection details live in Settings, with a status pill in the top bar.

## Colors
Strategy: Full palette, restrained in area. Each section keeps one colour across nav, heading marker and selection: Effects pink, Draw mint, Info gold, Play and Settings violet (the accent). Fills always carry dark text (`#120F26` / `#15122B`). Status uses ok/warn/crit plus a word, never colour alone.

## Typography
Display: Bricolage Grotesque 700–800 for headings and readouts. UI: Rethink Sans 400/500/600. Numbers use tabular figures. Sizes: 2 / 1.5 / 1.25 / 1 / 0.875 / 0.8125 rem.

## Layout
Phones: top bar, stage, section panel, bottom nav (5 items, icon + label). From 1024 px: labelled sidebar, stage sticky on the left, section panel on the right. Settings hides the stage. 4 px spacing base.

## Elevation & Depth
Tonal layering (bg < surface < surface-2) with 1 px borders; one soft offset shadow on the stage frame and toasts.

## Shapes
12 px controls, 16 px cards, 24 px panels, full pills. The stage frame stays dark in both themes, like the device's own bezel.

## Components
Buttons (primary, secondary, ghost, icon; 44 px min, scale .97 on press, disabled + busy states), segmented radios, live effect tiles, colour swatches with 46 px hit areas, choice cards, toasts (polite live region; undo for clear/delete).

## Do's and Don'ts
- Do keep the stage honest: what's on it is what Send sends.
- Do pair every state colour with text.
- Don't add glows, gradients on text, or emoji icons; icons come from the one authored SVG set in `index.html`.
