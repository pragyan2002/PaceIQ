# Design System Strategy: The Kinetic Architect

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Kinetic Architect."** While the foundation draws from the modular, block-based utility of Notion, we are transcending the "static document" feel to create an environment that breathes with the energy of a professional athlete. 

This system rejects the "template" look. We break the rigid grid through **intentional asymmetry**—offsetting data blocks to create a sense of forward motion—and **tonal depth**. By utilizing a high-contrast typography scale against sophisticated, layered surfaces, we transform a simple coaching tool into a high-end editorial experience. It isn't just a dashboard; it’s a performance journal.

---

## 2. Colors: High-Octane Minimalism
Our palette balances the "Crisp White" sterile environment of a laboratory with the "International Orange" of elite sports performance.

*   **Primary (`#a73400`) & Primary Container (`#d14300`):** These are your "Pace Indicators." Use them sparingly to guide the eye toward the most critical action or metric.
*   **The "No-Line" Rule:** We strictly prohibit the use of 1px solid borders to define sections. Content blocks must be separated by background color shifts. For example, a `surface-container-low` (`#f3f3f3`) sidebar sitting against a `surface` (`#f9f9f9`) main stage. 
*   **Surface Hierarchy & Nesting:** Treat the UI as physical layers. Use the `surface-container` tiers to nest information. An inner workout detail card should use `surface-container-highest` (`#e2e2e2`) to "pop" against a `surface-container-low` page layout.
*   **The "Glass & Gradient" Rule:** To avoid a flat, "out-of-the-box" feel, use Glassmorphism for floating navigation or hovering HUDs (Heads-Up Displays). Apply `surface` colors at 80% opacity with a `20px` backdrop-blur. 
*   **Signature Textures:** For primary CTAs, do not use flat fills. Use a subtle linear gradient transitioning from `primary` to `primary_container` at a 135-degree angle to provide a "machined" metallic sheen.

---

## 3. Typography: Editorial Authority
We use **Inter** not as a default, but as a precision instrument. The hierarchy is designed to mimic a high-end sports magazine.

*   **Display & Headline:** Use `display-lg` (3.5rem) and `headline-lg` (2rem) for performance metrics (e.g., your 5K PR). These should feel massive and authoritative. Reduce letter-spacing by `-0.02em` on these sizes to increase visual tension.
*   **Body & Label:** Use `body-md` (0.875rem) for all instructional AI coaching text. This smaller size creates a sophisticated contrast against the large display headers, emphasizing the "Architect" aesthetic.
*   **The "Unit" Treatment:** Always style units (e.g., "km/h" or "bpm") using `label-sm` in `on_surface_variant`. This ensures the numerical data remains the hero.

---

## 4. Elevation & Depth: Tonal Layering
Depth in this system is a result of light and material, not artificial strokes.

*   **The Layering Principle:** Achieve lift by stacking. Place a `surface_container_lowest` (#ffffff) card on a `surface_container` (#eeeeee) background. The contrast provides all the "border" you need.
*   **Ambient Shadows:** For floating elements like Modals or "Start Run" buttons, use an extra-diffused shadow: `0px 20px 40px rgba(167, 52, 0, 0.08)`. Note the tint: the shadow is a low-opacity version of our `primary` color, making the element look like it’s glowing rather than casting a dirty gray shadow.
*   **The "Ghost Border" Fallback:** If accessibility requires a container boundary, use a "Ghost Border": `outline-variant` at 15% opacity. It should be felt, not seen.
*   **Kinetic Motion:** Elements should never just "appear." Use `200ms cubic-bezier(0.4, 0, 0.2, 1)` for all surface transitions, creating a snappy, athletic feel.

---

## 5. Components: Modular Performance Blocks

*   **Action Blocks (Buttons):**
    *   *Primary:* Gradient fill (`primary` to `primary_container`), `xl` (0.75rem) rounded corners, white text.
    *   *Secondary:* `surface_container_high` background with `primary` text. No border.
*   **Performance Chips:** Use `full` (9999px) roundedness. These represent "Tags" or "Quick Filters" (e.g., "Trail," "Tempo"). Use `secondary_fixed` with `on_secondary_fixed_variant` for a muted, premium look.
*   **The "Metric" Card:**
    *   Forbid divider lines. Use `1.5rem` (spacing-6) of vertical white space to separate the metric value from the trend graph.
    *   Background: `surface_container_lowest`.
    *   Corner Radius: `xl` (0.75rem).
*   **Input Fields:** Use a "Minimalist Tray" style. No 4-sided box. Use a subtle `surface_variant` background and a `2px` bottom-border that activates to `primary` on focus.
*   **AI Coach Chat Bubbles:** Use `surface_container_low` for the AI and `primary_container` for the user. Avoid sharp corners; use `lg` (0.5rem) to keep the "Soft Minimalism" vibe.

---

## 6. Do’s and Don’ts

### Do:
*   **Do** use asymmetrical layouts. Place a large headline on the left and a small data point on the right with significant "negative" space between them.
*   **Do** use the spacing scale religiously. Stick to `8` (2rem) for major section gaps to maintain a "breathable" high-end feel.
*   **Do** use `primary` for data visualization (graphs, progress rings) to link the brand color to the user's success.

### Don’t:
*   **Don’t** use black (`#000000`). Use `on_surface` (`#1a1c1c`) for text to maintain a softer, more sophisticated editorial tone.
*   **Don’t** use 1px gray dividers. If you need to separate content, use a `1px` height `surface_container_highest` block or simply more white space.
*   **Don’t** use standard "Drop Shadows." If an element doesn't have a tinted ambient shadow or a tonal background shift, it shouldn't have elevation.