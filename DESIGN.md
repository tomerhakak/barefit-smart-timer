# BareFit design

The supplied client image is the visual contract: dark photographic gym, athlete to the right, oversized neon-lime circular countdown, white condensed numerals, round counter and three primary controls. The large timer is the focal point. No dashboard cards or marketing sections.

Palette: work/ready #B4FF00; preparation #57B7FF; rest/between sets #FFB146; canvas #0B0E08; panels #151912; primary text #F6F6F4. Phase names accompany all colors. Hebrew UI uses locally bundled Heebo; countdown uses Anton with tabular numerals. TV controls must have visible focus; phone controls minimum 44px touch targets.

The generated `public/assets/gym.png` is a clean photographic background derived from the user's image with the built-in imagegen tool. Prompt: remove all branding, Hebrew text, numerals, circular UI and buttons; reconstruct the dark gym; preserve the athlete on the far right, lighting and composition; leave dark negative space for a real timer; no text or interface. All timer UI is rendered in code. `icon.svg` is a code-created provisional B/f mark; replace with the client's official vector brand asset before final release. Font license notices are stored with assets.


Hall mode: optional high-contrast distance layout, enabled for new installs. White tabular Anton digits occupy most of the screen; phase accent is applied only for the applicable closing window (3 seconds normally, 10 on the true final round). Thin linear progress replaces the circular ring in this mode. The photo is dimmed to 12%, and secondary workout details are hidden. The original reference-inspired circular screen remains selectable.
