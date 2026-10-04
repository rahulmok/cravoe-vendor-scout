---
name: Bengal Stay Scout
description: Charcoal-and-bronze hotel research with photography and evidence.
colors:
  ground: "#101111"
  surface: "#191b1a"
  surface-raised: "#202321"
  ink: "#f2efe9"
  muted: "#aaa99f"
  line: "#383c37"
  bronze: "#d5b58a"
  green: "#b3cfb1"
  primary-text: "#171912"
  primary-hover: "#e3c7a3"
  secondary-hover: "#30352f"
  photo-overlay: "#171c17eb"
  photo-label: "#efe1cb"
typography:
  display:
    fontSize: "clamp(40px,4.7vw,70px)"
    fontWeight: 550
    lineHeight: 1.16
    letterSpacing: "-.03em"
    fontFamily: "Stay Sans, sans-serif"
  property-title:
    fontSize: "clamp(22px,2vw,29px)"
    fontWeight: 550
    lineHeight: 1.22
    letterSpacing: "-.03em"
    fontFamily: "Stay Sans, sans-serif"
  section:
    fontSize: "29px"
    fontWeight: 500
    lineHeight: 1.16
    letterSpacing: "-.03em"
    fontFamily: "Stay Sans, sans-serif"
  body:
    fontSize: "16px"
    lineHeight: 1.6
    fontFamily: "Stay Sans, sans-serif"
  action:
    fontSize: "14px"
    fontWeight: 650
    fontFamily: "Stay Sans, sans-serif"
rounded:
  label: "5px"
  control: "8px"
  surface: "12px"
spacing:
  compact: "12px"
  standard: "20px"
  panel: "28px"
  grid-column: "30px"
  grid-row: "44px"
components:
  button-primary:
    backgroundColor: "{colors.bronze}"
    textColor: "{colors.primary-text}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "13px 20px"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.action}"
    rounded: "{rounded.control}"
    padding: "13px 20px"
  property-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.surface}"
  approach-panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.surface}"
    padding: "28px"
---

# Design System: Bengal Stay Scout

## Overview

**Creative North Star: "The Dark Destination Contact Sheet"**

A destination photographer's contact sheet translated into the user's selected dark luxury direction. Charcoal surfaces, restrained bronze and large real property photographs establish the atmosphere; source-linked creator evidence supplies the substance. Self-hosted Manrope keeps the hierarchy contemporary and composed.

The user selected dark luxury and code-first. The reference service failed twice; the degraded grounded direction supplied the contact-sheet metaphor. No successful catalog seed key or quality-bar cards were returned. This document records shipped code, not a generated reference specification.

**Key Characteristics:**
- Large, attributed property photography
- Charcoal surfaces with restrained bronze
- Visible evidence and uncertainty
- Compact mobile setup before the first photograph

## Colors

### Primary
Bronze identifies the live scout action, selected tab rules, source links and saved states. Primary controls invert to dark text. Hover lightens bronze rather than adding another accent.

### Secondary
Soft green marks WhatsApp, disclosure excerpts and active research. It communicates a specific operational state rather than luxury decoration.

### Neutral
Near-black ground, charcoal surfaces and a slightly raised control tone carry most of the page. Warm off-white leads text; muted warm gray supports metadata. Quiet gray-green rules separate evidence sections.

**The Restrained Bronze Rule.** Use bronze for action, selection and evidence emphasis; leave the surrounding photography and surfaces visually dominant.

## Typography

Self-hosted **Manrope** is registered as **Stay Sans**, with variable weights (200–800) and a sans-serif fallback. The main display uses the frontmatter scale; property-detail display uses (34–60px), weight (500). Card titles use weight (550), section titles (500), and actions (650). Body inherits a (1.6) line-height; summaries use (14px) and (1.8), evidence descriptions use (14px) and (1.9). Paragraphs cap at (72ch).

Mobile introduction titles use (34px), line-height (1.1), and a maximum of (18ch). Mobile intro copy uses (12px). Compact source/status metadata remains smaller, while card action labels are (12px) after the final corrective overrides.

## Layout

The centered main area caps at (1500px), with (4vw) gutters. Horizontal navigation is (94px) tall. Desktop introduction uses a (1.5fr / 1fr) grid, (80px) gap and (64px 0 48px) padding. Multiple results form two columns with (30px) column and (44px) row gaps.

A single result becomes a full-width horizontal spread: photo and evidence body use (1.55fr / 1fr) columns; the photo has a (460px) minimum height. The detail page expands to a wide gallery, followed by flexible evidence and a sticky (370px) outreach column with a (70px) gap. The outreach panel sticks at (22px) and scrolls within the viewport.

At (1150px) and below, spacing contracts and the outreach column becomes (330px). At (800px) and below, navigation scrolls horizontally, introduction and detail columns stack, the single-result spread stacks, and gutters become (5vw). The final mobile override compresses introduction padding to (22px 0 20px); destination select and scout action share a row, filters share two columns, and the first photograph follows a compact setup. Multiple result cards become one column at (580px).

## Elevation & Depth

Information cards rely on charcoal tonal layering rather than shadows. Photo labels use translucent dark backgrounds; category labels add (2px) backdrop blur. Only the confirmation toast uses `0 12px 40px #0006`.

Photo crops scale to (1.035) on hover over (.7s cubic-bezier(.16,1,.3,1)). Primary and secondary controls transition background and text over (.2s). Background progress breathes over (2s ease-in-out). Reduced-motion preference removes transitions and animation.

## Shapes

Cards, gallery and outreach surfaces use the surface radius; buttons and fields use the control radius; photograph labels use the smaller label radius. Photographs clip cleanly to the card silhouette. Fine rules divide evidence without multiplying enclosed boxes.

## Components

**Buttons:** Bronze primary, raised-charcoal secondary and transparent bronze text variants. Primary and secondary share (48px) minimum height, frontmatter padding and inline SVG actions. Disabled buttons use opacity (.45) and a waiting cursor. Visible focus is a (2px) bronze outline offset by (5px).

**Fields:** Charcoal background, gray-green border, (13px 15px) padding, control radius and (48px) minimum height. Search combines an authored SVG with an input; its wrapper uses a (2px) bronze focus-within outline offset by (2px).

**Navigation and tabs:** Muted text brightens on hover and activation. Active navigation and result tabs carry a thin bronze lower rule. On mobile the horizontal header navigation scrolls rather than reducing label legibility.

**Photographic property card:** Actual image and attribution lead, with category and guest rating kept separate. Creator count, explicit disclosure count and quality uncertainty remain readable below. The whole image and authored SVG title arrow open the property; saving is a separate control. Multiple cards use portrait-like stacked compositions; the single-result variant uses the horizontal spread.

**Property detail and outreach:** Full-page gallery leads a divided evidence trail and persistent outreach column. Source links use authored SVG arrows. Gallery controls use authored left/right SVG paths. Editable drafts feed copy, WhatsApp and email actions; opening a draft does not send it.

**Photo labels:** Translucent labels identify category, guest rating and creator evidence over the photo. They are informational, not filters. Attribution remains linked and separate from the image-opening control.

## Do's and Don'ts

### Do:
- Do keep star category separate from guest review rating.
- Do display real photo attribution and linked evidence.
- Do use authored SVG arrows for navigation and external actions.
- Do keep WhatsApp and email draft bodies consistent with the editable outreach text.
- Do preserve visible focus and reduced-motion treatment.

### Don't:
- Don't fabricate property photographs, creator proof or leads for empty states.
- Don't hide pending quality or uncertain sponsorship behind a luxury presentation.
- Don't apply this hotel system to the restaurant scout.
