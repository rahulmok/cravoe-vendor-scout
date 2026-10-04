---
name: Bengal Stay Scout
description: A composed hotel collaboration research workspace.
colors:
  ink: "#122342"
  muted: "#57657d"
  action: "#2558e8"
  action-hover: "#1646cb"
  navigation: "#102546"
  navigation-hover: "#1a355c"
  navigation-selected: "#24446d"
  navigation-label: "#b9c9e0"
  canvas: "#f3f6fb"
  surface: "#fff"
  border: "#dce3ed"
  research-surface: "#e5edff"
  focus: "#7a9af5"
  selected-border: "#5e83e9"
  confirmed-surface: "#dceee5"
  confirmed-text: "#245a43"
  signal-surface: "#fff0d7"
  signal-text: "#7d5414"
  unknown-surface: "#edf1f7"
  unknown-text: "#52637d"
  stage-surface: "#e4ecff"
  stage-text: "#284fa2"
  starter-surface: "#f1edf8"
  starter-text: "#6b5589"
typography:
  display:
    fontFamily: "'Stay Sans', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "clamp(28px,2.8vw,40px)"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-.025em"
  title:
    fontFamily: "'Stay Sans', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "21px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-.025em"
  body:
    fontFamily: "'Stay Sans', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "16px"
    lineHeight: 1.5
  label:
    fontFamily: "'Stay Sans', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 600
rounded:
  tag: "5px"
  field: "7px"
  control: "8px"
  surface: "12px"
spacing:
  compact: "8px"
  control: "12px"
  standard: "16px"
  panel: "20px"
  workspace: "22px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  property-row:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.surface}"
    padding: "19px"
  dossier:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.surface}"
    padding: "20px"
---

# Design System: Bengal Stay Scout

## Overview

**Creative North Star: "The Property Research Desk"**

A composed research workspace: a dark navigation spine anchors white property records and a source-rich dossier. Manrope supplies a confident, compact hierarchy; cobalt marks actions and selection, while restrained status colors express evidence quality.

This is a code-led snapshot scoped to `app/hotels`; the metaphor describes the implemented system and is not a separately approved brand identity.

**Key Characteristics:**
- Navy navigation and cobalt actions
- White evidence-led property rows
- Compact Manrope hierarchy
- Borders and tonal layers before shadows

## Colors

### Primary
Cobalt action identifies research, copying and selected tabs. Deep navy gives navigation a stable visual anchor; hover and selected tones preserve its hierarchy.

### Secondary
Green confirms sourced collaboration evidence; amber identifies creator signals. Pale cobalt marks pipeline stages and muted violet identifies starter candidates. Every status carries text as well as color.

### Neutral
Cool canvas surrounds white records. Dark ink leads the hierarchy, muted text supports metadata, and fine borders separate related information.

## Typography

The locally hosted Manrope variable font is registered as **Stay Sans** (weights 200–800). The fallback stack is recorded above. Headings use compact negative tracking; body and controls remain straightforward. Property titles use the title role, dossier titles are (24px), evidence body is (13px) with a (1.6) line-height, and compact status labels are (11px). Tabular numerals stabilize fit scores and counts.

## Layout

Desktop uses a sticky (224px) navigation rail, a centered main area capped at (1800px), and (36px) horizontal main padding. The property workspace pairs a flexible list with a (340px) dossier and a (22px) gap. The dossier is sticky at (20px), with viewport-limited scrolling.

At (1500px) and above, the dossier widens to (390px). At (1200px) and below, the rail and dossier narrow. At (1000px) and below, the dossier follows the list and the idle panel disappears. At (700px) and below, navigation becomes a horizontal scrolling strip, the main gutter becomes (16px), filters use two columns and property images shrink to (70px × 90px).

## Elevation & Depth

Rows, coverage cards and the dossier use borders and tonal layering without shadows. Only the transient toast lifts with `0 8px 24px #11294b26`. Controls transition background, border and text over (.18s ease); row borders use (.2s ease). Toast entry uses (.25s cubic-bezier(.16,1,.3,1)); reduced-motion disables animations and transitions.

## Shapes

Large information surfaces have gently curved corners using the surface radius. Controls use the control radius, fields the field radius, and status tags the tag radius. Property photography is clipped inside a compact rectangle. Selection strengthens the row border rather than lifting the card.

## Components

**Buttons:** Confident compact controls with a (46px) minimum height. Cobalt primary and white bordered secondary variants share padding and geometry. Small controls use (38px) minimum height. Link actions remain transparent. Disabled controls reduce opacity to (.55) and show a waiting cursor.

**Fields:** Search fields combine an icon and borderless input inside a bordered wrapper. Dossier fields use a near-white background, (10px 11px) padding and a (43px) minimum height. Focus-visible uses a (3px) focus outline offset by (3px); the search wrapper uses a (2px) focus-within outline.

**Navigation:** Icon and text buttons sit on the navy rail, with separate hover and active tones. Desktop targets have a (48px) minimum height; mobile targets use (40px).

**Property row:** Image, location, hotel category, guest rating, summary, evidence tags and fit score form one selectable record. Its pale footer separates research and shortlist actions. Summaries clamp to two lines on desktop and three on mobile.

**Property dossier:** A white, bordered research container with evidence/contact and outreach tabs. Thin dividers group classification, creator evidence, contacts and source trail. Active tabs use cobalt text and a bottom rule.

**Evidence chips:** Compact text-backed statuses use semantic tonal backgrounds. They remain distinct from the pipeline stage and starter tag.

## Do's and Don'ts

### Do:
- Do keep hotel category, guest rating and fit score visually distinct.
- Do pair evidence colors with readable status text.
- Do retain visible focus treatment and reduced-motion support.

### Don't:
- Don't use property photography as a substitute for evidence.
- Don't spread the action cobalt across every surface.
- Don't apply this scoped hotel system to the restaurant scout.
