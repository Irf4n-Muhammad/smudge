# Raka visual assets

`artwork.png` is a transparent sprite sheet generated with the built-in imagegen tool from the
approved Raka mockup (October 5, 2026). It contains the pencil hand, avatar, brush lettering,
skateboard and sketchbook cover photographs, and notebook paper. No external image service is
required at runtime. Images are synthetic demo artwork, not photographs of a real profile owner.

The source image is stored intact. SVG viewBoxes and explicit clipping paths in the package shell
select each region without duplicating embedded image bytes. Keep those coordinates synchronized
when replacing the artwork. Manifest asset 30000000-0000-4000-8000-000000000001 is seeded as shared
local media. Existing publications keep their source and assets.

Generation prompt (built-in tool, transparent background):

Create production web illustration assets matching the attached approved design EXACTLY in style.
Output ONE 1536x1024 transparent PNG sprite sheet, in a strict 3 columns x 2 rows grid of six equal
512x512 cells. Each subject entirely within its cell with 24px transparent padding; no labels or
cell borders. Top-left: extract/recreate the large black ink crosshatched hand gripping diagonal
pencil from the design, with its torn brushstroke wrist, white paper fill, pencil lettering KEEP
DRAWING. Top-middle: circular manga-style portrait of the same black-haired adult in black beanie
from design, on scarlet background with white circular border. Top-right: ONLY black rough brush
lettering 'raka' with small crown above, transparent around lettering, like exact header reference.
Bottom-left: realistic photograph matching the skateboard against red brick wall from reference,
square image filling cell interior, no text overlays. Bottom-middle: realistic overhead coffee and
open ink sketchbook photograph matching reference, square image filling cell interior, no text
overlays. Bottom-right: a BLANK cream lightly blue-ruled notebook sheet with irregular torn edges
and left binder holes, very subtle paper fibers, full cell interior, no drawings or lettering.
Preserve authentic hand-ink imperfections, gritty printed texture, original composition subjects.
This is a reusable asset sheet, NOT a UI screenshot. Transparent gutters; clean separation, no
artwork crossing its cell.

## Skate cat extraction

Saved asset: `assets/raka/skate-cat.png`. Built-in imagegen, transparent background, with the approved
1024×1536 profile mockup as reference. This is illustrated starter decoration, not a user submission.

Prompt: Use case: background-extraction. Input image is the approved UI reference. Extract ONLY the hand-drawn cat riding a skateboard from the Drawing Relay section (around x240–550,y570–790). Preserve its scratchy black ink crosshatching, sunglasses, body, tail, red crown and blue ground strokes as closely as possible. Output one tightly framed wide illustration on a genuinely transparent background. No notebook paper, no UI, no words, no other doodles, no surrounding stars. Do not redesign the cat or turn it into smooth vector clipart. This is a production decoration asset for a live HTML canvas.

## Original approved reference

`reference.png` is an unchanged copy of the user-supplied 1024×1536 reference, not a regenerated
image. Shared asset 30000000-0000-4000-8000-000000000003. SVG viewBoxes select original story and photo artwork; the cleaned derivative below
supplies header and relay backgrounds. Live UI owns identity, statistics and interactive controls.
Reference pixels are used only for the Raka identity; other owners keep their own live name.
The full source includes baked-in UI, but it is never used as a single page-sized screenshot overlay.

## Clean artwork plate

`clean-paper-v1.png` was edited with the built-in imagegen tool from `reference.png`.
Prompt: Preserve the exact layout, illustration, grain and colors; remove the header controls,
identity/follow text, story circles, relay participants, contribution count and CTA lettering;
reconstruct continuous paper underneath, preserving the blank torn red CTA shape.
The full generation prompt is recorded in this task's imagegen call.

The profile and relay use this plate without rectangular masks or flat color repairs.
Identity, stories, participant initials, counts and controls are independent live elements.
Original post photography continues to use the unchanged reference. This remains a bundled
illustrated example: the decoration is raster artwork, not individually editable vector objects.
