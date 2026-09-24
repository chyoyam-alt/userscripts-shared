// ==UserScript==
// @name         🌧️ Crack Ambient Weather FX (시간대 배경 & 날씨 효과)
// @namespace    crack-ambient-weather-fx
// @version      2.6.4
// @description  Crack 채팅방에 시간대 배경·화면 효과·키워드 자동 전환·사운드를 추가합니다.
// @downloadURL  https://gist.github.com/chyoyam-alt/e68afc01c22bc0e734b586244086714c/raw/AmbientWeatherFX.user.js
// @updateURL    https://gist.github.com/chyoyam-alt/e68afc01c22bc0e734b586244086714c/raw/AmbientWeatherFX.user.js
// @match        https://crack.wrtn.ai/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      pixabay.com
// @connect      cdn.pixabay.com
// ==/UserScript==

// UI 디자인 참고 출처 (Design reference / credit):
// fooontic — CodePen: https://codepen.io/fooontic/pen/KwpRaGr

(function () {
  'use strict';

  function extractWeatherSnapshot(markdown) {
    if (!(markdown instanceof HTMLElement)) return { plain: '', full: '', code: '' };
    const clone = markdown.cloneNode(true);
    clone.querySelectorAll('.csp-generated-scene-image, script, style, button, svg').forEach(el => el.remove());
    const codeSelector = '[data-sgb-codeblock], .wrtn-codeblock, pre, code';
    const code = normalizeExtractedLogText(Array.from(clone.querySelectorAll(codeSelector))
      .filter(el => !el.parentElement?.closest?.(codeSelector))
      .map(el => el.textContent || '').join('\n\n'));
    clone.querySelectorAll('.not-wrtn-markdown:not(.wrtn-codeblock):not([data-sgb-codeblock])').forEach(el => el.remove());
    const full = normalizeExtractedLogText(clone.textContent || '');
    clone.querySelectorAll('.not-wrtn-markdown, .wrtn-codeblock, [data-sgb-codeblock], pre, code').forEach(el => el.remove());
    return { plain: normalizeExtractedLogText(clone.textContent || ''), full, code };
  }

  function getExpectedWeatherEntry(messageId) {
    if (!/^[a-f0-9]{24}$/i.test(messageId || '')) return null;
    const group = document.querySelector(`main [data-message-group-id="${messageId}"]`);
    if (!(group instanceof HTMLElement) || group.closest('[role="dialog"]') || isUserMessageGroupByDomForScan(group)) return null;
    const rect = group.getBoundingClientRect();
    if (!isVisibleRect(rect)) return null;
    const chatBubble = group.querySelector('[data-sgb-bubble="chat"]');
    const markdown = (chatBubble || group).querySelector('.wrtn-markdown:not(.not-wrtn-markdown)');
    if (!(markdown instanceof HTMLElement) || markdown.closest('.not-wrtn-markdown') || String(markdown.textContent || '').trim().length < 2) return null;
    return {group, markdown, isAssistant: !!chatBubble, key: getMessageSortKey(group, markdown, 0, rect)};
  }


  // References / credits
  // - Rain visual: https://codepen.io/eskiiss/pen/vYqgZM
  // - Rain audio: Gentle Rain 01 by DRAGON-STUDIO, Pixabay
  //   https://pixabay.com/ko/sound-effects/%EC%9E%90%EC%97%B0-gentle-rain-01-437313/
  // - Cricket audio: Crickets by Lenguaverde (Freesound), Pixabay
  //   https://pixabay.com/ko/sound-effects/%EC%9E%90%EC%97%B0-crickets-26444/
  // - Shore wave audio: Gentle Ocean Shore Waves by DRAGON-STUDIO, Pixabay
  //   https://pixabay.com/ko/sound-effects/%EC%9E%90%EC%97%B0-gentle-ocean-shore-waves-499665/
  // - Fireworks audio: Firework Display 2, Pixabay
  //   https://pixabay.com/ko/sound-effects/%EB%8F%84%EC%8B%9C-013906-firework-display-2-57511/
  // - Underwater audio: Underwater, Pixabay
  //   https://pixabay.com/ko/sound-effects/%EC%9E%90%EC%97%B0-underwater-19568/
  // - Spell burst audio: "magic spell" by KoiRoylers, Pixabay (Pixabay Content License)
  //   https://pixabay.com/sound-effects/film-special-effects-magic-spell-353606/
  // - Underwater raylight reference: https://codepen.io/shawnuke/pen/ZEXYvQO
  // - Underwater floating particles reference: https://codepen.io/rlambert/pen/MXWxZK
  // - Sunlight rays reference: https://codepen.io/5265766F/pen/GRaMOEG
  // - Fog overlay reference: https://codepen.io/Ramvardhan/pen/JjWVZoE
  // - Grand magic-circle structure reference: https://codepen.io/_Developes/pen/PoRLwNE
  // - Afternoon floating dust reference: https://codepen.io/matthewwilliams/pen/Qbzmzr
  // - DAWN/SUNSET/NIGHT palette reference: https://codepen.io/Chathura-Jayasanka/pen/emBMYWJ
  // - Night meteor shower port: https://codepen.io/Misty1636/pen/ZdzZPe
  // - Night moon port: https://codepen.io/gambhirsharma/pen/RwEPjPK
  // - Fireworks reference: https://codepen.io/rukouen/pen/NbrOag
  // - Snowflake shape sprites only: https://codepen.io/simeydotme/pen/NWPxKxr
  //   Snowflake icons credited there to Freepik / Flaticon; CAWF keeps its own fall, sway, gust, timing, and count logic.
  // Notes: Crack-specific UI, controls, detection, timing, audio handling, and most CSS layers were custom-built/retuned for this userscript.

  // v0.5.12: fixes the time-background switch so it immediately hides/shows only the time layer.
  // v0.5.15: fog effect now fades out earlier toward the bottom; other weather/time layers unchanged.
  // v0.5.22: strengthen time backgrounds by applying 100%+ background opacity as brightness/contrast to every time palette.
  // v0.5.16: rain canvas performance tuning and screen-effect speed minimum opened to 20%.
  // v0.5.17: rain audio can be primed on the first user gesture / audio toggle click with silent audio unlock.
  // v0.5.19: floating button can be long-pressed/dragged, saved, clamped on resize, and fades when idle.
  // v0.5.16: rain canvas performance tuning + screen/falling effect speed minimum opened to 20%.
  // v0.5.33: suppress the sunlight screen effect while the detected/manual time background is dawn or night.
  // v0.6.0: startup optimization — settings panel is now lazy-created only when the floating button opens it.
  // v0.6.1: safe optimization — skip heavy panel field sync while the settings panel is closed.
  // v0.6.2: startup fix — only wait for Eri Lore Injector when it is already detected; otherwise start Weather FX immediately.
  // v0.6.3: port CodePen-style meteor shower + animated moon into the night time background layer.
  // v0.6.3 spread: distribute meteor start points across left/center/right so they do not feel right-heavy.
  // v0.6.4 optimization: transform-based meteors, softer glow, lighter stars, 40s moon drift, and reduced meteor count.
  // v0.6.5: restore the prettier v0.6.3 meteor shower while keeping lighter star twinkle; slow moon drift to 80s.
  // v0.6.6: keep the rich 15-meteor look, but move meteors with transform instead of margin for cheaper animation.
  // v0.6.7: balanced performance tune — 12 meteors/20s, slightly thinned CodePen stars, lighter observer, slower periodic scan, 30fps rain cap.
  // v0.6.8: restore rain canvas cap to 36fps because 30fps felt visibly stuttery; keep night-sky and scan optimizations.
  // v0.6.10: remove lightning and fix aurora ambient display.
  // v0.6.15: tune the heavy night+aurora combo — fewer aurora rays, softer blur, and fewer concurrent meteors while aurora is active.
  // v0.6.16: restore visible double aurora wash, lower the curtain slightly, unfreeze moon motion, and slow aurora-night meteors a bit.
  // v0.6.18: lower aurora's built-in default opacity while keeping the global effect opacity slider unchanged.
  // v0.6.25: restore mana's ◆◇✦ glyph-like sparkle look; keep the reduced count and slow local-orbit motion.
  // v0.6.26: temporary raw canvas mana restore attempt; superseded.
  // v0.6.28: restore the v0.6.12 custom CSS/DOM mana sprite look (dot/raw canvas) and remove the wrong external mana source link.
  // v0.6.29: remove the round dot mana shape; keep only non-round raw canvas mana sprites.
  // v0.6.30: replace the mana effect with the raw canvas mana implementation from v0.6.18.
  // v0.6.31: keep the v0.6.18 raw canvas mana shape, remove the wrong mana source link, reduce count to one-third, and change the motion to slow local floating/orbiting.
  // v0.6.32: keep the wide floating/orbiting mana distribution, leave two-thirds of the original v0.6.18 count, and slightly reduce particle size.
  // v0.6.33: correct mana count scaling from the v0.6.31 baseline, keep wide distribution, and give low/medium/high separate counts.
  // v0.6.34: tune mana counts to low/medium/high 110/160/200 while keeping the wide floating/orbit distribution.
  // v0.6.35: slightly increase firefly counts by intensity and balance horizontal distribution so the left side is not randomly sparse.
  // v0.6.39: reduce mana counts by 20 for each intensity while keeping the same wide distribution and orbit movement.
  // v0.6.42: reduce fantasy particle counts, prevent scroll-triggered log observer callback churn, and move constant rain canvas colors outside per-particle loops.
  // v0.6.43: allow aurora to render with any time background instead of limiting it to night/dawn.
  // v0.6.44: add Crack dataLayer generate_done trigger for auto log scan after 1.1s and remove periodic log rescans.
  // v0.6.45: speed up the moon texture animation by 10s and show a subtle same-position moon in dawn/sunset backgrounds.
  // v0.6.46: make firefly paths use effect-layer pixel coordinates instead of viewport vw/vh, reducing off-layer waste while keeping the same gentle distribution.
  // v0.6.47: decouple from Eri Lore Injector, keep the effect root outside React main, and harden SPA route reattachment.
  // v0.6.48: restore the effect root inside <main> behind chat UI, while keeping SPA-safe delayed reattachment and Lore independence.
  // v0.6.49: append the underlay instead of prepending it and defer root mounting briefly until Chasm Tools has a chance to attach.
  // v0.6.51: keep appendChild for Lore safety, but switch the root from fixed viewport coordinates to absolute inset underlay inside <main>.
  // v0.6.52: keep Weather root below chat even when Borderless Background Blur also raises main children z-index.
  // v0.6.53: place Weather between Borderless image layer and chat UI (sgb=0, cawf=1, chat=2).
  // v0.6.54: fix display specificity so the mounted weather root can become visible under <main>.
  // v0.6.55: remove obsolete Lore-wait/defer stubs and duplicate patch comments without changing behavior.
  // v0.7.2: replace hard-coded visibility hook with runtime opaque-frame unmasking for body underlay.
  // v0.7.3: keep already-tagged unmask targets to prevent transparent/readback flicker loops.
  // v0.7.4: unmask background-color only and stop treating gradients as opaque blockers to prevent white dark-mode layers.
  // v0.7.6: mount Weather FX inside the active background host instead of body z-index:-1 underlay.
  // v0.7.0: move Weather root out of <main> into body fixed underlay to avoid Eri Lore Injector button conflicts.
  // v0.7.7: add dominant-frame fallback and static→relative positioning for pure Crack rooms without sgb.
  // v0.7.8: use <main> itself as the pure Crack room mount host to avoid scroll-content-sized effect layers.
  // v0.8.0: append the pure-room mount box as the last main child so Eri header/button stacking stays intact.
  // v0.8.1: remove mount-box isolation to match sgb stacking and avoid trapping Eri header/button.
  // v0.8.2: place mount box as the first main child again and ignore collapsed sgb roots.
  // v0.8.10: remove dead box-shadow star CSS and throttle night-sky canvas measurement (no visual change).
  // v0.8.8: replace fixed box-shadow night stars with a size-aware canvas star field that runs only for night.
  // v0.8.9: make night canvas star twinkle clearer with more blinking stars, stronger alpha swing, faster twinkle, and a 48fps cap for this loop only.
  // v0.8.11: lower only the night canvas star-field frame cap from 48fps back to 36fps.
  // v0.8.12: fix firefly horizontal clustering by using a coprime slot step and full-layer waypoint spread.
  // v0.8.13: slightly increase firefly counts by intensity without changing size, speed, blink, or path logic.
  // v0.8.14: add optional Pixabay cricket ambience for the fireflies effect, with separate URL, volume, follow, and hidden-tab controls.
  // v0.8.15: consolidate rain/cricket audio UI into one sound menu with one enable toggle, one effect-link toggle, and one browser-unlock button.
  // v0.8.16: add a bottom shoreline/beach swash screen effect using CSS gradients and inline SVG foam layers.
  // v0.8.17: remove the sand strip and rebuild the shore effect as subtle waves rising from the bottom.
  // v0.8.18: remove stripe-like caustics/ripple gradients from the shore effect and soften the top fade.
  // v0.8.19: rebuild shore as layered surf: higher reach, rolling water sheets, drifting foam flecks, and staggered foam lines.
  // v0.8.20: make the shore/surf animations loop seamlessly by matching 0%/100% states and using a dash-period foam lace loop.
  // v0.8.21: make the shore foam edge organic with static SVG turbulence, thinner crest rims, softer spray, and denser crest flecks.
  // v0.8.22: refine shore foam with asymmetric crest paths, stronger vertical roughness, brighter crest flecks, and denser glints.
  // v0.9.0: rebuild shore into a perspective beach with blended sea color, sand texture, and synchronized wet-sand swash.
  // v0.9.1: make shore waves travel from the far/top area toward the near/bottom beach instead of bobbing in place.
  // v0.9.2: anchor the shore scene around the screen center and make foam/wash travel downward toward the bottom beach.
  // v0.9.3: boost shore foam visibility, tone down sea body, and speed up synchronized shore wash/foam motion.
  // v0.9.4: remove the sand strip again and make the shore read as water-only downwash.
  // v0.9.5: flip shore foam fill/wash direction so the white foam trails behind a downward-moving wave.
  // v0.9.6: soften the first appearance of shore foam so the crest fades in instead of covering the scene.
  // v0.9.7: add soft yoonseul/water-scale shimmer glints to the shore sea surface without external assets.
  // v0.9.8: rebuild from v0.9.7 and soften the white wave body/wash behind the shore foam while keeping the foam rim readable.
  // v0.9.9: add rolling foam sheets and spray patches inspired by wave-blob motion, without copying external assets.
  // v0.9.10: remove the heavy rolling foam sheets and add a subtle water-surface ripple shimmer behind the foam.
  // v0.9.11: add Pixabay gentle ocean shore wave audio to the unified sound menu and link it to the shore effect.
  // v0.9.12: add subtle water-wobble displacement and surface undulation so shore foam/ripples deform like water instead of sliding as static lines.
  // v0.9.13: slightly blue-shift the shore sea body while keeping time-background blend and shimmer layers intact.
  // v0.9.17: remove the experimental underwater effect and return to the stable pre-underwater shore/audio build.
  // v0.9.18: remove dead ambient time-effect CSS/keyframes and reduce shore SVG filter cost without intended visual changes.
  // v0.9.19: apply optional count trims and cache static night-sky stars to reduce per-frame canvas work.
  // v0.9.20: freeze shore SVG displacement, remove barely visible far shore layers, and trim shore sparkle particles for low-end PCs.
  // v1.0.5: move the panel status line to the very bottom of the settings panel.
  // v1.0.4: move the panel status line outside the sound details so it stays visible when the sound section is folded.
  // v1.0.3: simplify panel status sound text and show the matched original keyword.
  // v1.0.2: optimize keyword-detection scans by cleaning only the latest message, reusing the latest entry, and skipping same-effect rebuilds.
  // v1.0.7: skip user-message DOM groups during latest-log detection so keyword/time scans read AI replies only, without API calls or extra observers.
  // v1.0.7 bounds: clamp sgb-mode Weather FX bounds to the chat main rect without changing sgb layer order.
  // v1.4.0: cache ambient canvas measurements and add an ensureRoot fast path for non-underwater effects — performance only, behavior unchanged.
  // v1.9.2: replace only CAWF's crystalline snow silhouette with the nine Freepik snowflake sprites referenced by simeydotme's Sparticles CodePen; keep all CAWF motion and density logic unchanged.
  // v2.4.0: align runtime version/guard, slightly reduce feather counts, remove unused feather drafts, and split embedded assets into editor-safe chunks.
  // v2.5.0: add the approved Deep Space galaxy canvas module and audit default effect keywords without overwriting user-edited keyword sets.
// v2.5.1: further optimize galaxy dynamics (static-sky reuse, low-power budgets, cached sprites, resize-skip) and enrich the baked sky with subtle dust lanes/filaments/clusters.
  // v2.5.2: block galaxy and underwater rendering entirely on non-PC environments (mobile/coarse-pointer devices).
  // v2.5.3 hotfix: wait for the final assistant markdown DOM to settle after generate_done, then scan exactly once.
  // v2.5.4: hard-clip only the sunset time layer at its existing 60% fade boundary to prevent rare Chromium mask/compositor orange flashes below the sky.
  // v2.5.6: keep fireworks audio under the same time/visibility gate as the fireworks visual, and resync sound immediately when the detected/manual time changes.
  // v2.5.7: remove the no-op time-layer filter, compact rain arrays without splice churn, cache fireworks flash gradients, and move ambient FPS gates ahead of effect-state checks.
  // v2.5.5: remove the added galaxy filament/dust-lane stroke bands, chunk first-time galaxy baking across frames, and reuse one cached static galaxy sky between toggles.
  // v2.1.4: add a restrained ease-in pull only to the final pre-cluster convergence, making motes sweep inward faster without moving the 75% burst or its synchronized audio cue.
  // v2.1.3: replace the spell's frozen center charge with a tiny per-mote spiral compression so every light keeps moving through the charge beat and still bursts on the same 75% audio cue.
  // v2.1.2: restore the intended center charge, but remove the unintended mid-convergence hitch by keeping mote travel linear across its 51% waypoint; release easing and audio timing stay unchanged.
  // v2.1.1: remove the spell-mote center hold so the light keeps converging naturally through 75% and flows directly into the synchronized burst. Superseded by v2.1.2 after identifying the actual hitch at the 51% waypoint.
  // v2.1.0: embed KoiRoylers' Pixabay "magic spell" SFX with full source credit, add a spell-burst volume control, and fire it once at the 75% light-mote release cue using the same speed-aware CSS animation clock.
  // v2.0.8: restore the spell-mote release timing to the original v2.0.3 cadence while preserving the latest stage and mote sizing.
  // v2.0.7: trim the enlarged spell stage and motes by about five percent, and move the staged release to a balanced middle speed while preserving its final-fade trigger.
  // v2.0.6: enlarge the full spell stage with balanced sigil/bloom/wave scaling, enlarge motes and halos again, and add staged outward waypoints for a much slower final-fade release.
  // v2.0.5: enlarge spell motes again and stretch their outward travel, beginning the release during the sigil's final fade so the brighter burst remains readable before leaving the viewport.
  // v2.0.4: enlarge spell light motes and their glow, spread their convergence field farther beyond the sigil, extend edge travel, and slightly slow the outward release so the full-screen motion reads clearly.
  // v2.0.3: restore the spell release ring to its original restrained size, then make the actual light-mote cloud denser and clearly visible from viewport-edge convergence through viewport-exit release.
  // v2.0.2: give crystalline snow a restrained independent 3D tumble — slow spin, shallow tilt, and brief edge-on glints — while ordinary soft snow keeps its original fall.
  // v2.0.1: give spell casting its own spiral icon, restore viewport-wide convergence/release travel without resizing the magic-circle body, and tint the CodePen snowflake masks white instead of rendering their black source pixels.
  // v2.0.0: add a full blue-azure spell-casting effect with CSS/SVG magic circle, custom vector runes, micro-lights, and a release shockwave; no image assets.
  // v1.9.1: guarantee visible crystalline snow at every intensity, with intensity-scaled counts, clearer 5~9px silhouettes, and reduced crystal blur.
  // v1.9.0: add time-background crossfades, separate dawn/sunset cloud staging, counter-drifting fog depth, occasional crystalline snow, and notched/creased sakura petals.
  // v1.8.4: make the embedded twilight stars about 20~25% smaller and softly reduce star density around the upper-right moon position without leaving an obvious cutout.
  // v1.8.3: rebuild the embedded twilight texture from user references into a dense top-heavy star-dust field that softly dissolves downward, while keeping the lower sky transparent.
  // v1.8.2: replace the flat twilight CSS star field with an embedded transparent PNG texture, retain five independently layered CSS highlight stars, and keep the texture link-free/offline-safe.
  // v1.8.1: expand twilight from 10 to 28 transparent CSS stars across four depth groups, with mostly tiny dim points and independently paced twinkles; keep the horizon and moon area restrained.
  // v1.8.0: add a blue-hour early-evening background for 19:31~20:59, with cobalt/violet sky, fading horizon glow, sparse stars, and a soft moon; integrate it into time controls and effect compatibility.
  // v1.7.4: diversify firefly blink rhythms and add a very slow shared crosswind shift to snow without changing individual flakes' sway.
  // v1.7.3: lower small bokeh's baseline focus with softer discs, wider symmetric bloom, and no crisp lens rim.
  // v1.7.2: slow bokeh's base drift, deepen snow perspective, vary petal/leaf tones with subtle veins, diversify firefly glow colors, and add depth to candle motes.
  // v1.7.1: refine small bokeh into photographic symmetric blooms, leave more breathing room near the top, and show bokeh only at dawn/sunset/night.
  // v1.7.0: add a warm canvas bokeh effect with flat lens discs, opacity-linked focus softness, clearly visible slow drift, mobile budgets, auto-detection, and full panel integration.
  // v1.6.3: remove the floating ash screen effect and its renderer, keywords, settings, and panel integration; fireworks remains unchanged.
  // v1.6.2: restore immediate effect-amount rebuilding after the panel redesign by recognizing the new chip:intensity action alongside the legacy select:intensity action.
  // v1.6.1: add a green leaf screen effect using the sakura/leaves falling-petal style with a fresh green palette, full keyword/UI integration, and no engine changes.
  // v1.5.0: add a lightweight candlelight ambient effect with warm floor glow, irregular wall-shadow flicker, floating dust motes, auto-detection keywords, and full settings UI integration.
  // v1.6.0: redesign the settings panel into Effect/Keyword/Sound tabs, replace selects with icon chips, merge keyword editors into one draft-safe field, fold audio URL editors into channel cards, and add collapsible Screen Effect/Time Background groups.
  // v1.4.3: refine default auto-detection keywords, add effect-specific emoji triggers, remove broad false-positive terms, and migrate untouched v1.4.2 defaults.
  // v1.4.2: fully sleep offscreen canvas loops, add low-power DPR/FPS budgets, trim low-power aurora/time detail, and relax route fallback polling.
  // v1.4.1: skip unchanged bounds style writes, throttle scroll bounds refresh, cache mount-host checks, and make unlock gestures passive — performance only, behavior unchanged.
  // v1.3.7: cap underwater WebGL caustics at 30fps with a slightly smaller internal resolution, slow the fireworks canvas to 40fps, and cap night-sky star twinkle at 30fps — performance only, visuals unchanged.
  // v1.3.6: add Pixabay fireworks and underwater ambience audio channels to the unified sound menu and link them to their screen effects.
  // v1.3.5: reduce underwater plankton particle counts slightly across all intensity levels while keeping the same overall distribution pattern.
  // v1.3.4: reduce underwater plankton particle size slightly so the suspended particles feel subtler and less dominant.
  // v1.3.3: soften the brightest underwater caustics, add gentle mid-depth haze, and give floating particles a more natural current-like sway.
  // v1.3.2: fix runtime crash from an undefined underwater particle amount helper so the script no longer disappears.
  // v1.3.1: make underwater particles follow effect amount, slow them slightly, and smooth fade-in/out so particles do not pop.
  // v1.3.0: make underwater floating particles more visible and more active by increasing count, opacity, drift distance, and animation speed.
  // v1.2.9: replace the synthetic underwater plankton dots with CodePen-inspired floating particle layers that drift more naturally through the water.
  // v1.2.8: add subtle underwater surface shimmer, micro drifting plankton particles, and softer floor-edge fading to make the underwater scene feel richer.
  // v1.2.7: shorten underwater raylight reach so the rays stay closer to the top surface while keeping the same ray style.
  // v1.2.6: replace underwater rays with a CodePen raylight-style conic god-ray layer while leaving depth/floor caustics untouched.
  // v1.2.5: strengthen underwater god-rays and add more depth/edge shading to the underwater background while leaving floor caustics untouched.
  // v1.2.4: replace underwater depth wash with a solid ocean-gradient background and top glow while leaving rays/floor caustics unchanged.
  // v1.2.3: strengthen underwater top light rays again and recolor floor caustics to a softer sky-blue instead of neon cyan.
  // v1.2.1: remove the underwater bubble overlay/link, add a custom subtle depth wash, and keep the caustics/rays readable without a solid background.
  // v1.2.0: add CSS rising bubbles to underwater and lower/flatten underwater floor caustics so they sit on the bottom instead of stretching upward.
  // v1.1.9: slow fireworks baseline by 20%, keep speed affecting motion only, tilt underwater floor caustics farther, and hard-hide time layers while underwater is painted.
  // v1.1.8: restore underwater top light rays and tilt the CodePen WebGL caustics onto a floor plane without adding a color/black background.
  // v1.1.7: decouple fireworks size from effect speed, make intensity control fireworks amount, and fix underwater WebGL restart drawing to a detached canvas.
  // v1.1.6: make underwater caustics visible in CAWF root by drawing only bright caustic light with alpha, keeping the CodePen WebGL noise core.
  // v1.1.5: rebuild underwater back to the original CodePen full-layer WebGL caustics structure and remove CSS fallback ripples.
  // v1.1.4: make underwater a transparent overlay like other effects, clip it to CAWF root, remove dark vignette, and add visible CSS caustic ripples.
  // v1.1.3: make underwater caustics transparent/bright instead of an opaque black WebGL plane, and soften the vignette.
  // v1.0.8: replace the 400ms generate_done polling loop with a dataLayer.push hook while keeping the same delayed latest-log scan.
  // v1.0.9: add a night-only canvas fireworks screen effect adapted from rukouen's Realistic Fireworks Pen, with reduced particle counts and 36fps cap.
  // v1.0.10: fix fireworks canvas visibility by allowing the ambient layer to display for data-effect=fireworks and removing the ambient mask for that canvas.
  // v1.0.11: tune fireworks for smoother playback by reducing burst particles, enlarging each spark, and capping live particles.
  // v1.0.12: rebuild fireworks from big-dot bursts into smoother rocket launches with spark trails, central flashes, cached glow sprites, and capped live particles.
  // v1.1.0: add an underwater ambient effect with WebGL caustics adapted from loganmc, plus water wash, light rays, floor projection, and time-background suppression.
  // v1.1.1: move fireworks burst targets higher and slightly enlarge sparks/flashes while keeping the v1.0.12 trail style.

  // v2.6.3: time parser NFKC normalization — supports PM．10:23 / AM．7:05 and full-width AM/PM, digits, colon variants.
  const SCRIPT_NAME = 'Crack Ambient Weather FX';
  // v2.6.4: liquid-glass settings UI, fixed status header and idle launcher animation.
  const VERSION = '2.6.4';
  const STORE_KEY = 'cawf_settings_v1';
  const GUARD_KEY = '__CAWF_AMBIENT_WEATHER_FX_V257_LOADED__';

  if (window[GUARD_KEY]) return;
  window[GUARD_KEY] = true;

  // v0.6.47: Weather FX는 로어 인젝터의 ready/UI 플래그를 기다리지 않는다.
  // SPA 복귀 시 로어 메뉴와 초기화 타이밍이 엉키는 것을 막기 위해 완전 독립 실행한다.
  const INIT_FALLBACK_DELAY_MS = 0;

  const IDS = {
    root: 'cawf-root',
    rainCanvas: 'cawf-rain-canvas',
    timeLayer: 'cawf-time-layer',
    timeWash: 'cawf-time-wash-layer',
    timeDust: 'cawf-time-dust-layer',
    nightSky: 'cawf-night-sky-layer',
    ambient: 'cawf-ambient-layer',
    underwaterLayer: 'cawf-underwater-layer',
    underwaterCanvas: 'cawf-uw-canvas',
    particles: 'cawf-particles',
    style: 'cawf-style',
    button: 'cawf-floating-button',
    panel: 'cawf-panel'
  };

  const FLOATING_BTN_POS_KEY = 'cawf_floating_btn_pos_v1';

  const PIXABAY_RAIN_SOURCE_PAGE = 'https://pixabay.com/ko/sound-effects/%EC%9E%90%EC%97%B0-gentle-rain-01-437313/';
  const DEFAULT_RAIN_AUDIO_URL = PIXABAY_RAIN_SOURCE_PAGE;
  const PIXABAY_CRICKET_SOURCE_PAGE = 'https://pixabay.com/ko/sound-effects/%EC%9E%90%EC%97%B0-crickets-26444/';
  const DEFAULT_CRICKET_AUDIO_URL = PIXABAY_CRICKET_SOURCE_PAGE;
  const PIXABAY_WAVE_SOURCE_PAGE = 'https://pixabay.com/ko/sound-effects/%EC%9E%90%EC%97%B0-gentle-ocean-shore-waves-499665/';
  const DEFAULT_WAVE_AUDIO_URL = PIXABAY_WAVE_SOURCE_PAGE;
  const PIXABAY_FIREWORKS_SOURCE_PAGE = 'https://pixabay.com/ko/sound-effects/%EB%8F%84%EC%8B%9C-013906-firework-display-2-57511/';
  const DEFAULT_FIREWORKS_AUDIO_URL = PIXABAY_FIREWORKS_SOURCE_PAGE;
  const PIXABAY_UNDERWATER_SOURCE_PAGE = 'https://pixabay.com/ko/sound-effects/%EC%9E%90%EC%97%B0-underwater-19568/';
  const DEFAULT_UNDERWATER_AUDIO_URL = PIXABAY_UNDERWATER_SOURCE_PAGE;
  // Embedded, offline-safe copy of the credited 3.08s spell burst.
  // Source: "magic spell" by KoiRoylers, Pixabay Content License.
  // https://pixabay.com/sound-effects/film-special-effects-magic-spell-353606/
  const PIXABAY_SPELL_SOURCE_PAGE = 'https://pixabay.com/sound-effects/film-special-effects-magic-spell-353606/';
  const SPELL_BURST_AUDIO_DATA_URL = [
    'data:audio/mpeg;base64,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IQyzSFJqOepK77QoSXNwhAKGWeqqyqia8ioIhlDGSJqOf2Qot/ksRNNXeepXkZS2LKopJa8rgs1vkhzxshFLv7ypS2qIWEW2QgizUf8IibfaLQAIBZKRGaQmK1bAfLumuWvzT3HR9azS6SsIIknuWOj663yqCIHUXnJJBquCYB16LjoJgJOSdKxBEVYJRfEpVUrI8nJOR7/+9JE1AAFkm1I+wk1cLCNqP9gKYAXGaT7Jj08wskz3qRnssiTRQ5+hrp9LFethbUJUqhbo0JmfH6qVMaS1FUzuvlVrxmbYraTljQmAhyifJ5RMMej7ftclImqFVYl9ZQ6Prf//+a5Cx9lEmysRGiIEiYVAkGlxSKRU2ysmCIZIQAtilmOepgKTeX6z2ay45/79f//6hTdIAQdKlFRwCgSJJGo01G4SSJb+Ry8qyJzbOUSSNydMTMxIczZVqJIKLiqCDEKVSKFuWV0AhCM+6uQz631Kyqp0CRZKxOXLrWtadnNrVlbLT1bWtZqpyIINVC56ZtZp8CoU0lcVicueOkYIjqPIEh+y4giKiJSMcgPP0XWta1a55JAiOugJNwRHVatZMSEAEeFouk1h6rIgvmLspj5KerWmjJGYuXW9NtdaeZUroDI+utpZnpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq',
    'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqg=='
  ].join('');
  const AUDIO_RESOLVE_CACHE_KEY = 'cawf_audio_url_resolve_cache_v1';
  // v1.8.2: generated sparse twilight stars, chroma-keyed to alpha and embedded so no external image host is required.
  const TWILIGHT_STARFIELD_DATA_URL = [
    'data:image/png;base64,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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeJn/HwmRdbVz1adxAAAAAElFTkSuQmCC'
  ].join('');


  function getNightSkyLayerHtml() {
    // Meteor shower source: https://codepen.io/Misty1636/pen/ZdzZPe
    // Moon source: https://codepen.io/gambhirsharma/pen/RwEPjPK
    const meteors = Array.from({ length: 12 }, (_, index) => `<div class="cawf-cp-meteor cawf-cp-meteor-${index + 1}" aria-hidden="true"></div>`).join('');
    // 기존 box-shadow 별은 절대 px 좌표라 넓은 레이어 오른쪽이 빈다.
    // 레이어 폭만큼 매번 흩뿌리는 캔버스 별밭으로 대체한다.
    return `<div id="${IDS.nightSky}" aria-hidden="true"><canvas class="cawf-ns-canvas" aria-hidden="true"></canvas><div class="cawf-cp-moon" aria-hidden="true"></div>${meteors}</div>`;
  }

  const SPELLCAST_RUNE_PATHS = Object.freeze([
    'M-2 2.5L0-2.5 2 2.5M-1.2 .5H1.2',
    'M-2-2.4V2.4M-2-2.2L1.7-.7-2 .3 1.8 2.3',
    'M-2.2-2.2L1.8 0-2.2 2.2M-.6-1.3V1.3',
    'M-2.2 2.4L0-2.4 2.2 2.4M-1.8-1.1L1.8 1.1',
    'M-2-2.3V2.3M-2 0L2-2M-2 0L2 2',
    'M0-2.5V2.5M-2-1L2 1M-1.8 2L1.8-2'
  ]);

  function getSpellRuneRingHtml(count, y, scale = 1) {
    return Array.from({ length: count }, (_, index) => {
      const angle = ((360 / count) * index).toFixed(2);
      const path = SPELLCAST_RUNE_PATHS[(index * 5 + Math.floor(index / 3)) % SPELLCAST_RUNE_PATHS.length];
      return `<g transform="rotate(${angle} 50 50) translate(50 ${y}) scale(${scale})"><path d="${path}"></path></g>`;
    }).join('');
  }

  function getSpellcastLayerHtml() {
    return `
      <div class="cawf-spellcast" aria-hidden="true">
        <div class="cawf-spell-plane">
          <div class="cawf-spell-circle">
            <div class="cawf-spell-core cawf-spell-center"></div>
            <div class="cawf-spell-star cawf-spell-center"></div>
            <div class="cawf-spell-square cawf-spell-center"></div>
            <div class="cawf-spell-rune-ring cawf-spell-center">
              <svg viewBox="0 0 100 100"><g class="cawf-spell-runes">${getSpellRuneRingHtml(12, 4, 1)}</g></svg>
            </div>
            <div class="cawf-spell-double cawf-spell-center"></div>
            <div class="cawf-spell-stripes cawf-spell-center"></div>
            <div class="cawf-spell-quarter"><span></span><span></span><span></span><span></span></div>
            <div class="cawf-spell-cross cawf-spell-center"></div>
            <div class="cawf-spell-rect cawf-spell-center"></div>
            <div class="cawf-spell-rune-ring cawf-spell-rune-ring-large cawf-spell-center">
              <svg viewBox="0 0 100 100"><g class="cawf-spell-runes">${getSpellRuneRingHtml(24, 3, .86)}</g></svg>
            </div>
            <div class="cawf-spell-middle cawf-spell-center"></div>
            <div class="cawf-spell-big-star cawf-spell-center"></div>
            <div class="cawf-spell-outer cawf-spell-center"></div>
          </div>
        </div>
        <div class="cawf-spell-release"></div>
        <div class="cawf-spell-motes"></div>
        <i class="cawf-spell-sound-cue" aria-hidden="true"></i>
      </div>`;
  }

  function getSpellcastMoteCount() {
    // HTML 미리보기에서 보였던 화면 전체 광점층에 가깝게 복원한다.
    // v2.2.1: 저전력에서는 화면 전체 DOM 광점 수를 강하게 줄여 모바일 합성 부하를 낮춘다.
    const base = { low: 120, medium: 190, high: 280 }[state.settings.intensity] || 190;
    const scale = IS_LOW_POWER ? (IS_MOBILE ? .38 : .52) : (IS_MOBILE ? .78 : 1);
    return Math.max(IS_LOW_POWER ? 40 : 64, Math.round(base * scale));
  }

  function makeSpellcastMote(random, index) {
    const mote = document.createElement('i');
    const { width, height } = getParticleLayerSize();
    const minSide = Math.max(1, Math.min(width, height));
    const angle = random() * Math.PI * 2;
    // 가로로 넓은 실제 채팅 화면에서도 수렴점이 화면 가장자리/바깥에서 출발하고,
    // 해방 뒤에는 화면 밖까지 뻗도록 x/y 반경을 각 축 크기로 계산한다.
    const startRadiusX = width * (.48 + random() * .48);
    const startRadiusY = height * (.44 + random() * .54);
    const releaseRadiusX = width * (.70 + random() * .72);
    const releaseRadiusY = height * (.58 + random() * .78);
    const gatherAngle = angle + (-.42 + random() * .84);
    // 중앙 충전 구간에서도 모든 광점이 한 좌표에 얼어붙지 않도록,
    // 각 광점마다 작게 휘감기며 좁아지는 두 개의 압축 좌표를 만든다.
    const chargePhase = angle + .72;
    const chargeRadius1 = 7 + (index % 6) * 1.5;
    const chargeRadius2 = 2.5 + (index % 5) * .7;
    const tone = index % 7 === 0 ? '211,247,255' : (index % 4 === 0 ? '113,137,255' : '126,211,255');

    mote.style.setProperty('--sx', `${(Math.cos(angle) * startRadiusX).toFixed(1)}px`);
    mote.style.setProperty('--sy', `${(Math.sin(angle) * startRadiusY).toFixed(1)}px`);
    mote.style.setProperty('--gx', `${(Math.cos(gatherAngle) * minSide * (.075 + random() * .22)).toFixed(1)}px`);
    mote.style.setProperty('--gy', `${(Math.sin(gatherAngle) * minSide * (.055 + random() * .16)).toFixed(1)}px`);
    mote.style.setProperty('--c1x', `${(Math.cos(chargePhase) * chargeRadius1).toFixed(1)}px`);
    mote.style.setProperty('--c1y', `${(Math.sin(chargePhase) * chargeRadius1 * .64).toFixed(1)}px`);
    mote.style.setProperty('--c2x', `${(Math.cos(chargePhase + 1.12) * chargeRadius2).toFixed(1)}px`);
    mote.style.setProperty('--c2y', `${(Math.sin(chargePhase + 1.12) * chargeRadius2 * .64).toFixed(1)}px`);
    mote.style.setProperty('--rx', `${(Math.cos(angle) * releaseRadiusX).toFixed(1)}px`);
    mote.style.setProperty('--ry', `${(Math.sin(angle) * releaseRadiusY - height * (.035 + random() * .12)).toFixed(1)}px`);
    mote.style.setProperty('--mote-size', `${(1.10 + Math.pow(random(), 2.05) * 4.40).toFixed(2)}px`);
    mote.style.setProperty('--mote-alpha', (.42 + random() * .50).toFixed(3));
    mote.style.setProperty('--mote-rgb', tone);
    mote.style.setProperty('--twinkle-delay', `${(-random() * 2.4).toFixed(2)}s`);
    if (index % 7 === 0) mote.setAttribute('data-glow', 'true');
    return mote;
  }

  const LEGACY_DEFAULT_KEYWORDS = Object.freeze({
    rain: '비, 빗소리, 빗방울, 소나기, 장대비, 장마, 우산, 빗물',
    snow: '눈, 눈송이, 함박눈, 폭설, 첫눈, 눈발, 눈보라'
  });

  // v1.4.2까지의 기본값. 사용자가 손대지 않은 기본 키워드만 새 기본값으로 안전하게 이관한다.
  const PREVIOUS_DEFAULT_KEYWORDS = Object.freeze({
    rain: '빗소리, 빗방울, 소나기, 장대비, 장마, 우산, 빗물, 폭우, 호우, 가랑비, 이슬비, 부슬비, 소낙비, 빗줄기, 비바람, 추적추적, 주룩주룩, 비가 내리, 비에 젖',
    snow: '눈송이, 함박눈, 폭설, 눈발, 눈보라, 눈꽃, 눈밭, 진눈깨비, 싸락눈, 설경, 눈사람, 첫눈이, 첫눈을, 눈이 펑펑, 눈이 소복, 눈이 쌓',
    sakura: '벚꽃, 꽃잎, 벚나무, 꽃비, 봄바람, 연분홍, 벚꽃잎, 벚꽃길, 만개한 벚꽃, 꽃잎이 흩날',
    leaves: '낙엽, 단풍, 마른 잎, 바스락, 가을바람, 숲길, 가을, 단풍잎, 갈잎, 우수수, 낙엽이 흩날, 단풍이 물들',
    greenLeaves: '나뭇잎, 초록 잎, 잎사귀, 푸른 잎, 초록 나뭇잎, 신록, 녹음, 잎이 흔들, 잎이 흩날, 초록잎',
    fireflies: '반딧불, 반딧불이, 개똥벌레, 빛벌레, 여름밤, 풀벌레, 풀벌레 소리, 숲속의 빛',
    spellcast: '🪄, 마법진, 마법 시전, 주문 시전, 주문을 외, 주문을 읊, 영창, 술식, 마법진이, 마법진을, 마법진이 펼쳐, 마법진이 빛나, 주문이 발동, 주문이 완성, 마법을 시전, 마법을 발동, 결계가 펼쳐, 소환진, 소환 의식',
    mana: '마법, 마법진, 정령, 성역, 빛무리, 결계, 마나석, 마나의, 마나가, 마력이 흐, 주문을 외, 마법이 깃, 신성한 빛, 신비한 기운',
    sunlight: '햇빛, 햇살, 햇볕, 역광, 빛줄기, 창가의 빛, 화창, 쾌청, 눈부신 햇살, 따스한 햇살, 부서지는 햇살, 봄볕, 볕이 드',
    aurora: '오로라, 극광, 북극광, 초록빛 하늘, 보랏빛 하늘, 신비로운 하늘, 일렁이는 빛',
    sunset: '노을, 석양, 해질녘, 저녁놀, 황혼, 붉은 하늘',
    night: '밤하늘, 달빛, 별빛, 한밤, 새벽, 어둠',
    fog: '안개, 자욱한, 수증기, 김이 서린, 희뿌연, 안개 낀, 짙은 안개, 물안개, 운무, 안개가 자욱, 새벽 안개',
    shore: '바다, 해안, 파도, 물결, 포말, 물보라, 얕은 물, 잔물결, 밀려오는 물, 밀물, 파도가 밀려오는, 해변, 바닷가, 모래사장, 백사장, 파도가 부서, 출렁이는 파도',
    fireworks: '불꽃놀이, 폭죽, 축포, 불꽃이 터지, 밤하늘에 불꽃, fireworks, firework',
    underwater: '물속, 물 속, 수중, 바닷속, 바다 속, 해저, 심해, 잠수, 다이빙, 잠수함, 잠수복, 산소통, 가라앉, 물에 잠기, 물에 잠겨, 수면 아래, 헤엄쳐, 헤엄치, 깊은 물, 물밑'
  });

  // v2.4.0까지의 기본값. 사용자가 직접 편집하지 않은 항목만 아래 v2.5.0 감사본으로 이관한다.
  const V240_DEFAULT_KEYWORDS = Object.freeze({
    fireflies: '여름밤, 반딧불, 반딧불이, 개똥벌레, 빛벌레, 반딧불 무리, 반딧불이 날, 반딧불이 빛, 반딧불이 반짝',
    spellcast: '🌀, 마법진, 마법 시전, 주문 시전, 주문을 외, 주문을 읊, 영창, 술식, 마법진이, 마법진을, 마법진이 펼쳐, 마법진이 빛나, 주문이 발동, 주문이 완성, 마법을 시전, 마법을 발동, 결계가 펼쳐, 소환진, 소환 의식',
    mana: '🔮, 🪄, 마법, 마법진, 마나석, 마나 입자, 마나가, 마력이 흐, 마력이 일렁, 마법진이, 마법진을, 주문을 외, 마법이 깃, 신성한 빛, 신비한 기운',
    aurora: '오로라, 극광, 북극광, 오로라가 펼쳐, 오로라가 일렁, 오로라가 번져, 극광이 일렁, 밤하늘의 오로라',
    fog: '🌫️, 안개, 안개 낀, 짙은 안개, 물안개, 운무, 안개가 자욱, 안개가 깔, 안개가 피어, 새벽 안개, 시야를 가린 안개',
    shore: '🌊, 🏖️, 🏝️, 해안, 파도, 포말, 밀물, 해변, 바닷가, 모래사장, 백사장, 바닷바람, 파도가 밀려오, 파도가 부서, 파도가 출렁, 바다가 펼쳐, 바다를 바라',
    fireworks: '🎆, 🎇, 불꽃놀이, 폭죽, 축포, 불꽃이 터지, 밤하늘에 불꽃, 폭죽이 터지, fireworks, firework',
    underwater: '🤿, 🫧, 🐠, 물속, 물 속, 수중, 바닷속, 바다 속, 해저, 심해, 잠수, 다이빙, 잠수함, 잠수복, 산소통, 수면 아래, 물밑, 헤엄쳐, 헤엄치, 물속으로 잠수, 바닷속을 헤엄',
    feathers: '🪶, 깃털, 흰 깃털, 검은 깃털, 새하얀 깃털, 깃털이 흩날, 깃털이 떨어, 깃털이 날리, 깃털이 내려앉, 날개깃, 깃이 흩날, 천사의 날개, 날개에서 깃털이',
    sandstorm: '🏜️, 모래바람, 모래폭풍, 황사, 흙먼지, 모래 먼지, 모래가 날리, 모래가 흩날, 사막의 바람, 열사의 사막, 모래언덕, 황량한 사막'
  });

  const DEFAULT_KEYWORDS = Object.freeze({
    rain: '🌧️, 🌦️, ☔, 빗소리, 빗방울, 소나기, 장대비, 장맛비, 폭우, 호우, 가랑비, 이슬비, 부슬비, 소낙비, 빗줄기, 비바람, 추적추적, 주룩주룩, 비가 내리, 비가 쏟, 빗방울이 떨어, 빗줄기가 굵, 비에 젖, 우산을 펼, 우산을 쓰',
    snow: '❄️, 🌨️, ☃️, ⛄, 눈송이, 함박눈, 폭설, 눈발, 눈보라, 눈꽃, 눈밭, 진눈깨비, 싸락눈, 설경, 눈사람, 첫눈이, 첫눈을, 눈이 펑펑, 눈이 소복, 눈이 쌓, 눈송이가 날',
    sakura: '🌸, 벚꽃, 벚나무, 벚꽃잎, 벚꽃길, 벚꽃비, 꽃비가 내리, 만개한 벚꽃, 벚꽃이 만개, 벚꽃이 흩날, 벚꽃잎이 날',
    leaves: '🍂, 🍁, 가을, 낙엽, 단풍잎, 갈잎, 마른 잎, 낙엽길, 낙엽이 흩날, 낙엽이 쌓, 낙엽이 떨어, 단풍이 물들, 단풍잎이 날, 잎이 우수수',
    greenLeaves: '🍃, 🌿, 나뭇잎, 잎사귀, 초록 잎, 푸른 잎, 초록 나뭇잎, 신록, 녹음, 잎이 흔들, 잎이 흩날, 바람에 흔들리는 잎',
    fireflies: '반딧불, 반딧불이, 개똥벌레, 빛벌레, 반딧불 무리, 반딧불이 무리, 반딧불이 떼, 반딧불이 날, 반딧불이 빛, 반딧불이 반짝, 빛나는 반딧불',
    spellcast: '🪄, 마법진, 마법 시전, 주문 시전, 주문을 외, 주문을 읊, 영창, 술식, 마법진이, 마법진을, 마법진이 펼쳐, 마법진이 빛나, 주문이 발동, 주문이 완성, 마법을 시전, 마법을 발동, 결계가 펼쳐, 소환진, 소환 의식',
    mana: '🔮, 마나, 마나석, 마나 입자, 마나가, 마나가 흐, 마나가 피어, 마력이 흐, 마력이 일렁, 마력 입자, 마력의 빛, 마법 입자, 마법이 깃',
    bokeh: '보케, 빛망울, 빛 망울, 빛번짐, 빛 번짐, 아웃포커싱, 흐릿한 불빛, 초점이 흐려진 불빛, 번져 보이는 불빛, bokeh, out of focus',
    candlelight: '🕯️, 촛불, 촛불빛, 촛대, 양초, 촛불이 일렁, 촛불이 흔들, 촛불이 타오르, 촛불을 밝히, 촛불을 켜, 촛불 아래, 촛불 몇 개, candlelight',
    sunlight: '☀️, 🌞, 🌤️, 햇빛, 햇살, 햇볕, 역광, 눈부신 햇살, 따스한 햇살, 부서지는 햇살, 봄볕, 볕이 들, 햇빛이 비치, 햇살이 쏟, 화창한 날, 쾌청한 하늘',
    aurora: '오로라, 극광, 북극광, 남극광, 오로라가 펼쳐, 오로라가 일렁, 오로라가 번져, 극광이 일렁, 밤하늘의 오로라, 빛의 장막이 일렁',
    sunset: '🌇, 🌆, 노을, 석양, 해질녘, 저녁놀, 황혼, 붉은 노을, 노을이 번져, 해가 저물',
    night: '🌙, 🌃, 밤하늘, 달빛, 별빛, 한밤, 별이 반짝, 달이 떠오르',
    fog: '🌫️, 안개, 안개 속, 안갯속, 안개 낀, 짙은 안개, 물안개, 운무, 안개가 자욱, 안개가 깔, 안개가 피어, 새벽 안개, 시야를 가린 안개',
    shore: '🌊, 🏖️, 🏝️, 해안, 파도, 파도 소리, 철썩이는 파도, 포말, 밀물, 해변, 바닷가, 모래사장, 백사장, 바닷바람, 해풍, 파도가 밀려오, 파도가 부서, 파도가 출렁, 바다가 펼쳐, 바다를 바라',
    fireworks: '🎆, 🎇, 불꽃놀이, 폭죽, 축포, 불꽃이 터지, 불꽃이 수놓, 하늘을 수놓는 불꽃, 밤하늘에 불꽃, 폭죽이 터지, fireworks, firework',
    underwater: '🤿, 🫧, 물속, 물 속, 수중, 바닷속, 바다 속, 해저, 심해, 잠수, 다이빙, 잠수함, 잠수복, 산소통, 수면 아래, 수면 밑, 물 아래, 물밑, 헤엄쳐, 헤엄치, 물속으로 잠수, 바닷속을 헤엄',
    galaxy: '🌌, 🌠, 은하수, 은하수 띠, 은하, 성운, 심우주, 우주 공간, 광활한 우주, 끝없는 우주, 별의 바다, 별이 가득한 우주, 은하가 펼쳐, milky way, galaxy, nebula, deep space',
    feathers: '🪶, 깃털, 흰 깃털, 검은 깃털, 새하얀 깃털, 깃털비, 깃털이 흩날, 깃털이 떨어, 깃털이 날리, 깃털이 떠다니, 깃털이 춤추, 깃털이 내려앉, 날개깃, 깃이 흩날, 날개에서 깃털이',
    butterflies: '🦋, 나비 떼, 나비들이, 나비가 날아, 나비가 팔랑, 나비가 춤추, 호랑나비, 흰나비, 노랑나비, 봄 나비, 팔랑이는 나비, 나비의 날갯짓, 꽃밭의 나비',
    sandstorm: '모래바람, 모래폭풍, 사막 폭풍, 황사, 흙먼지, 모래 먼지, 모래가 날리, 모래가 흩날, 모래가 휘몰아, 모래 먼지가 휘날, 황사가 몰아, 사막의 바람'
  });

  const EFFECT_KEYWORD_FIELDS = Object.freeze({
    rain: 'keywordRain',
    snow: 'keywordSnow',
    sakura: 'keywordSakura',
    leaves: 'keywordLeaves',
    greenLeaves: 'keywordGreenLeaves',
    fireflies: 'keywordFireflies',
    spellcast: 'keywordSpellcast',
    mana: 'keywordMana',
    bokeh: 'keywordBokeh',
    candlelight: 'keywordCandlelight',
    sunlight: 'keywordSunlight',
    aurora: 'keywordAurora',
    fog: 'keywordFog',
    shore: 'keywordShore',
    fireworks: 'keywordFireworks',
    underwater: 'keywordUnderwater',
    galaxy: 'keywordGalaxy',
    feathers: 'keywordFeathers',
    butterflies: 'keywordButterflies',
    sandstorm: 'keywordSandstorm'
  });

  const SCREEN_EFFECT_PRIORITY = ['rain', 'snow', 'sakura', 'leaves', 'greenLeaves', 'feathers', 'fireflies', 'butterflies', 'spellcast', 'mana', 'bokeh', 'candlelight', 'sunlight', 'aurora', 'galaxy', 'fog', 'sandstorm', 'shore', 'fireworks', 'underwater'];
  const TIME_EFFECT_PRIORITY = ['dawn', 'morning', 'afternoon', 'sunset', 'twilight', 'night'];
  const PARTICLE_EFFECTS = new Set(['rain', 'snow', 'sakura', 'leaves', 'greenLeaves', 'fireflies', 'mana']);
  const AMBIENT_EFFECTS = new Set(['sunlight', 'fog', 'sandstorm', 'aurora', 'galaxy', 'spellcast', 'mana', 'bokeh', 'candlelight', 'shore', 'fireworks', 'underwater']);
  const TIME_EFFECTS = new Set(TIME_EFFECT_PRIORITY);
  const EFFECT_CHOICES = ['auto', 'none', ...SCREEN_EFFECT_PRIORITY];
  const TIME_CHOICES = ['auto', 'none', ...TIME_EFFECT_PRIORITY];
  const ACTIVE_EFFECT_CHOICES = ['none', ...SCREEN_EFFECT_PRIORITY];
  const ACTIVE_TIME_CHOICES = ['none', ...TIME_EFFECT_PRIORITY];

  const DEFAULTS = Object.freeze({
    enabled: true,
    visualEnabled: true, // legacy: used only for migration
    screenEffectEnabled: true,
    timeBackgroundEnabled: true,
    autoDetect: true,
    effect: 'auto',
    timeBackground: 'auto',
    intensity: 'medium',
    nightMeteors: true,
    powerSaver: 'auto', // v2.2.0: 절전 모드 auto | on | off
    galaxyMeteors: true,
    galaxyParallax: true,
    opacity: 0.74, // legacy: migrated into effectOpacity/timeOpacity
    speed: 1.0, // legacy: migrated into effectSpeed/timeSpeed
    effectOpacity: 0.74,
    timeOpacity: 0.82,
    effectSpeed: 1.0,
    timeSpeed: 1.0,
    overlayMode: 'above',
    showFloatingButton: true,

    soundEnabled: false,
    audioFollowEffect: true,
    audioUrl: DEFAULT_RAIN_AUDIO_URL,
    audioVolume: 0.24,
    audioWhileHidden: false,
    cricketAudioUrl: DEFAULT_CRICKET_AUDIO_URL,
    cricketAudioVolume: 0.16,
    waveAudioUrl: DEFAULT_WAVE_AUDIO_URL,
    waveAudioVolume: 0.17,
    fireworksAudioUrl: DEFAULT_FIREWORKS_AUDIO_URL,
    fireworksAudioVolume: 0.18,
    underwaterAudioUrl: DEFAULT_UNDERWATER_AUDIO_URL,
    underwaterAudioVolume: 0.14,
    spellAudioVolume: 0.28,

    // legacy aliases: kept so older saved settings and internal audio helpers migrate safely.
    audioEnabled: false,
    audioFollowRain: true,
    cricketAudioEnabled: false,
    cricketAudioFollowFireflies: true,
    cricketAudioWhileHidden: false,
    waveAudioEnabled: false,
    waveAudioFollowShore: true,
    waveAudioWhileHidden: false,
    fireworksAudioEnabled: false,
    fireworksAudioFollowFireworks: true,
    underwaterAudioEnabled: false,
    underwaterAudioFollowUnderwater: true,

    keywordRain: DEFAULT_KEYWORDS.rain,
    keywordSnow: DEFAULT_KEYWORDS.snow,
    keywordSakura: DEFAULT_KEYWORDS.sakura,
    keywordLeaves: DEFAULT_KEYWORDS.leaves,
    keywordGreenLeaves: DEFAULT_KEYWORDS.greenLeaves,
    keywordFireflies: DEFAULT_KEYWORDS.fireflies,
    keywordSpellcast: DEFAULT_KEYWORDS.spellcast,
    keywordMana: DEFAULT_KEYWORDS.mana,
    keywordBokeh: DEFAULT_KEYWORDS.bokeh,
    keywordCandlelight: DEFAULT_KEYWORDS.candlelight,
    keywordSunlight: DEFAULT_KEYWORDS.sunlight,
    keywordAurora: DEFAULT_KEYWORDS.aurora,
    keywordSunset: DEFAULT_KEYWORDS.sunset,
    keywordNight: DEFAULT_KEYWORDS.night,
    keywordFog: DEFAULT_KEYWORDS.fog,
    keywordShore: DEFAULT_KEYWORDS.shore,
    keywordFireworks: DEFAULT_KEYWORDS.fireworks,
    keywordUnderwater: DEFAULT_KEYWORDS.underwater,
    keywordGalaxy: DEFAULT_KEYWORDS.galaxy,
    keywordFeathers: DEFAULT_KEYWORDS.feathers,
    keywordButterflies: DEFAULT_KEYWORDS.butterflies,
    keywordSandstorm: DEFAULT_KEYWORDS.sandstorm,
    keywordFallback: 'off',
    includeCodeBlocksInDetection: false,

    debug: false
  });

  const EFFECT_LABELS = {
    auto: '자동',
    none: '끄기',
    rain: '비',
    snow: '눈',
    sakura: '벚꽃잎',
    leaves: '낙엽',
    greenLeaves: '나뭇잎',
    fireflies: '반딧불이',
    spellcast: '마법 시전',
    mana: '마나 입자',
    bokeh: '보케',
    candlelight: '촛불',
    sunlight: '햇빛',
    aurora: '오로라',
    fog: '안개',
    shore: '밀려오는 파도',
    fireworks: '불꽃놀이',
    underwater: '수중',
    galaxy: '은하수',
    feathers: '깃털',
    butterflies: '나비',
    sandstorm: '모래바람',
    dawn: '새벽',
    morning: '오전',
    afternoon: '오후',
    sunset: '노을',
    twilight: '초저녁',
    night: '밤'
  };

  const INTENSITY_LABELS = {
    low: '적게',
    medium: '보통',
    high: '많이'
  };

  const PARTICLE_COUNTS = {
    rain: { low: 42, medium: 78, high: 118 },
    snow: { low: 18, medium: 34, high: 54 },
    sakura: { low: 12, medium: 24, high: 38 },
    leaves: { low: 10, medium: 20, high: 32 },
    greenLeaves: { low: 10, medium: 20, high: 32 },
    fireflies: { low: 14, medium: 18, high: 24 },
    spellcast: { low: 0, medium: 0, high: 0 },
    mana: { low: 64, medium: 100, high: 110 },
    bokeh: { low: 18, medium: 30, high: 44 },
    candlelight: { low: 8, medium: 14, high: 22 },
    sunlight: { low: 0, medium: 0, high: 0 },
    aurora: { low: 0, medium: 0, high: 0 },
    sunset: { low: 0, medium: 0, high: 0 },
    twilight: { low: 0, medium: 0, high: 0 },
    night: { low: 0, medium: 0, high: 0 },
    fog: { low: 0, medium: 0, high: 0 },
    shore: { low: 0, medium: 0, high: 0 },
    fireworks: { low: 0, medium: 0, high: 0 },
    underwater: { low: 0, medium: 0, high: 0 },
    galaxy: { low: 0, medium: 0, high: 0 },
    feathers: { low: 11, medium: 18, high: 27 },
    butterflies: { low: 5, medium: 8, high: 12 },
    sandstorm: { low: 0, medium: 0, high: 0 }
  };

  // Shape-only reuse from https://codepen.io/simeydotme/pen/NWPxKxr
  // The Pen credits these transparent snowflake icons to Freepik / Flaticon.
  const SNOWFLAKE_SHAPE_URLS = Object.freeze([
    'https://assets.codepen.io/13471/snowflake.png',
    'https://assets.codepen.io/13471/snowflake(1).png',
    'https://assets.codepen.io/13471/snowflake(2).png',
    'https://assets.codepen.io/13471/snowflake(3).png',
    'https://assets.codepen.io/13471/snowflake(4).png',
    'https://assets.codepen.io/13471/snowflake(5).png',
    'https://assets.codepen.io/13471/snowflake(6).png',
    'https://assets.codepen.io/13471/snowflake(7).png',
    'https://assets.codepen.io/13471/snowflake(8).png'
  ]);

  const SAKURA_TONES = Object.freeze([
    'radial-gradient(circle at 30% 26%, rgba(255,255,255,.98), rgba(255,170,202,.98) 40%, rgba(255,86,146,.92) 100%)',
    'radial-gradient(circle at 32% 24%, rgba(255,255,255,.98), rgba(255,210,224,.98) 42%, rgba(255,126,168,.91) 100%)',
    'radial-gradient(circle at 30% 28%, rgba(255,242,247,.98), rgba(244,147,183,.97) 44%, rgba(194,65,112,.90) 100%)'
  ]);

  const AUTUMN_LEAF_TONES = Object.freeze([
    ['linear-gradient(135deg, rgba(255,196,84,.99), rgba(222,116,34,.96) 50%, rgba(146,70,22,.92))', 'rgba(91,49,20,.48)'],
    ['linear-gradient(135deg, rgba(255,165,75,.99), rgba(203,77,34,.97) 54%, rgba(110,40,25,.92))', 'rgba(82,34,24,.52)'],
    ['linear-gradient(135deg, rgba(232,194,97,.98), rgba(166,104,43,.96) 52%, rgba(88,55,31,.91))', 'rgba(70,45,26,.52)']
  ]);

  const GREEN_LEAF_TONES = Object.freeze([
    ['linear-gradient(135deg, rgba(204,255,156,.99), rgba(92,194,76,.97) 52%, rgba(36,124,52,.92))', 'rgba(25,91,42,.48)'],
    ['linear-gradient(135deg, rgba(171,239,135,.99), rgba(54,154,71,.97) 54%, rgba(18,91,50,.92))', 'rgba(16,74,40,.50)'],
    ['linear-gradient(135deg, rgba(223,255,148,.99), rgba(127,195,57,.97) 52%, rgba(55,119,38,.92))', 'rgba(48,94,31,.48)']
  ]);

  const FIREFLY_TONES = Object.freeze([
    ['rgba(166,255,88,.98)', 'rgba(190,255,126,.86)', 'rgba(72,255,106,.24)'],
    ['rgba(230,255,122,.98)', 'rgba(239,255,157,.84)', 'rgba(194,255,78,.23)'],
    ['rgba(143,255,170,.98)', 'rgba(171,255,190,.84)', 'rgba(79,255,164,.22)']
  ]);

  // v2.4.0: 실제 사용 중인 비행깃 SVG 한 종류만 유지한다.
  // 같은 SVG 원문을 base64로 부풀리지 않고 런타임에 URL 인코딩해 파일 용량과 편집기 부담을 줄인다.
  const FEATHER_SVG_URLS = Object.freeze([
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent([
    '<svg xmlns="http://www.w3.org/2000/svg" width="125pt" height="176" viewBox="0 0 125 132"><defs><style>*{stroke-linejoin:round;stroke-linecap:butt}</style></defs><g id="figure_1"><g id="axes_1"><g id="QuadContourSet_1"><path d="m104.839.75 1.008-.404 1.008-.229.258-.117h.704l-.962.439-.9.569-.108.052-1.008.212-.978.743-.03.037-1.008.927-1.008-.379-.568.423-.44.348-.856.66-.153.156-.578.851-.225 1.008-.205.377-.464.63-.35 1.008-.194.98-.013.028-.097 1.007-.728 1.008-.17.589-.155.419-.068 1.007-.36 1.008-.09 1.008-.02 1.007-.315.655-.199-.655-.28-1.007-.529-.73-.531-.278-.477-.374-1.008-.08-.605.454-.272 1.008.128 1.007.004 1.008-.018 1.007-.04 1.008-.205.817-.818-.817-.19-.132-.18.132-.232 1.008-.348 1.007-.248.42-.154-.42-.246-1.007-.474-1.008-.134-.078-1.008-.412-.527.49.008 1.008.072 1.007-.1 1.008-.18 1.008-.281.323-.594-.323-.415-.574-.196.574.183 1.007.013.025.375.983.2 1.007.185 1.008.249.46.306.548-.144 1.007-.162.277-.176-.277-.335-1.007-.498-.276-.323-.732-.311-1.008-.374-.487-.28-.52-.302-1.008-.426-.752-.196-.255-.404-1.008-.408-.701-.373.7-.137 1.009-.01 1.007-.488.223-.847-.223-.16-.086-.079.086.078.484.056.524-.005 1.007.114 1.008-.165.464-.89-.464-.118-.061-.07.061-.938.893-.097.115.097.086.759.921.25.326.466.682.101 1.008.34 1.007.1.078.4.93-.037 1.008-.363.604-.907-.604-.1-.303-1.009-.619-.022-.086.022-.302.061-.706-.061-.047-1.008-.606-.73-.354-.278-.403-.247.403-.274 1.007-.338 1.008.345 1.008.514.898.035.11.09 1.007-.125.541-1.008-.028-.272.494.272.419.383.59.58 1.007-.963.31-.867-.31-.09-1.008-.051-.027-.018.027-.053 1.008-.937.256-.39-.256-.618-.706-.847-.302-.161-.12-1.008-.411-.874-.477-.135-.086-1.008-.302-.873.388.873.456 1.008.149.085.403.602 1.008.322.964.046.043-.046.044-1.009.673-.317.291-.09 1.008-.6.486-.538-.486-.47-.426-1.009-.397-1.008.148-.674.675-.334.188-.482-.188-.526-.263-.861.263-.147.134-1.008.397-1.008-.115-1.008.107-1.008.074-.639.41-.37.23-1.007.644-.081.134.08.075 1.009.793.11.14.757 1.007.14.044 1.009.347 1.008.478.416.139-.416.195-1.008.712-1.008-.251-1.008-.232-1.00',
    '8-.262-1.008.055-.55-.217-.459-.447-1.008.136-.328.31.328.411.31.597.698.555 1.009.254.316.199.692.614 1.008.382.023.012-.023.014-1.008.277-1.008-.152-.59-.14-.419-.15-.388.15-.62.413-1.008-.19-1.008.012-1.008-.131-.667-.103-.34-.127-.178.127-.168 1.007.345.323 1.008.422.639.263.37.337 1.007.433.401.238.607.607.561.4.11 1.008-.296 1.007-.375.073-.114-.073-.894-.456-.856.456-.152.726-.145-.726-.863-.414-1.008-.412-.25-.181-.758-.665-.523-.343-.485-.485-1.008.011-.373.474.373.365.417.643.591.59.343.417.665.666.617.342.391.391.935.617.073.1.495.907-.495.287-.777-.287-.23-.174-1.009-.398-1.008.086-1.008.343-1.008-.569-.71-.295-.298-.196-1.008-.041-.296.237.296.379.173.628.835.927.162.081.802 1.008.044.044.643.963.365.399.516.609.492.71.324.298.393 1.007.291.595.31.413-.31.184-.867-.184-.141-.044-.63-.964-.378-.441-.721-.566-.287-.351-.279.35.279.948.032.06.493 1.008.483.753.142.254.4 1.008.218 1.008-.478 1.007.726.519.193.489.157 1.008-.07 1.007-.28.352-.596-.352-.412-.296-.542-.711-.453-1.008-.013-.058-1.008-.472-.492-.478-.516-.438-.6-.57-.408-.574-.388.575.388.739.245.268.433 1.008-.678.48-1.008-.282-.594-.198-.414-.257-.197.257-.039 1.008-.067 1.007-.211 1.008.514.719.24.289.238 1.007-.478.426-.24-.426-.768-.91-.473.91.07 1.008-.606.752-.299-.752-.333-1.008-.376-.424-.455-.583-.41-1.008-.143-.163-.263.163-.723 1.008.13 1.007-.152.433-.32-.433.26-1.007-.948-.288-.338.288-.04 1.007.324 1.008-.954.393-1.008.053-1.008-.133-.257-.313-.751-.435-.558-.573-.45-.381-.489-.626-.52-.503-.88-.505-.127-.13-.17.13-.23 1.008.4.488.346.52.094 1.007.066 1.007.502.732.302.276.504 1.008-.047 1.007.084 1.008-.843.772-.217.236-.369 1.007-.227 1.008-.195.507-.366.5-.316 1.008-.326.743-.881-.743-.127-.163-.857.163-.151.029-.014-.029-.34-1.008-.655-.275-.616.275-.392.303-.246-.303-.762-.555-.478-.452-.192-1.008.318-1.007-.656-.362-.268-.646.114-1.008-.159-1.007-.695-.695-.91.695.018 1.007.07 1.008-.078 1.008-.046 1.007-.062.095-.08-.095-.928-.843-.13-.164-.233-1.008-.645-.717-1.008.671-.282.046.282.353.097.655.018 1.007-.115.065-.115-.0',
    '65-.759-1.007-.134-.101-.014.1-.277 1.008.29.625.248.383-.247.255-.307-.255-.701-.365-1.008-.074-.202.439.202.196.656.811.352.352.642.656.366.516.523.492.3 1.007.185.538.171.47.319 1.008.296 1.007.222.341.17.667-.04 1.008-.13.172-1.008-.145-.052-.027-.956-.644-.465-.364-.543-.466-.485-.542-.523-.523-.438-.484-.57-.539-.63-.469-.378-.337-1.008-.07-1.008.172-.404.235.404.223 1.008.475.24.31.768.476 1.008.421.13.11.878.6.465.408.543.61.302.398.321 1.007-.623.571-.403-.57-.605-.556-.797-.452-.211-.139-.296.139-.712.562-.283.445.283.235.795.773.213.466.127.541-.127.482-1.008-.335-1.008.272-1.008.104-.67-.523-.339-.222-1.008-.409-.513-.376-.495-.165-.96-.843-.048-.044-1.008-.045-.115.09.115.219.578.788L4 97.74l.033.017.045-.017.963-.619.482.62-.482.866-.054.141.054.047.848.96.16.188.661.82-.056 1.008-.605.24-.488-.24-.52-.321-1.008-.205-1.008.048-1.008.037-1.008.397-1.008-.23v-.52l1.008.067 1.008-.234 1.008-.025.311-.022.697-.19.233.19.775.166 1.008.01.054-.176-.054-.067-.802-.94-.206-.233-.894-.775-.114-.118-1.008-.355-.564-.535-.444-.399-.76-.608.14-1.008.62-.516 1.008-.382 1.008.172.802.726.206.181 1.008.179.676.648.332.21 1.009.23.188-.44-.188-.22-.789-.788-.22-.247-.716-.76-.292-.993-.008-.015.008-.008.016.008.992.292.677.716.332.298.298-.298.71-.617 1.008.03 1.008-.235.543-.186-.543-.249-.675-.759-.333-.155-1.008-.253-.628-.6-.38-.21-1.009-.289-.61-.508.312-1.008.298-.19.262.19.747.166 1.008-.02 1.008.05.911.812.097.072.99.936.018.02.233-.02-.148-1.008.923-.534.534.534.474.428.36-.428-.16-1.008-.2-.581-.366-.426-.455-1.008-.187-.191-.817-.817-.191-.236-.792-.771.076-1.008.716-.58.58.58.428.188.21-.188.056-1.007.067-1.008-.142-1.008.817-.885.732.885.276.258.296-.258.604-1.007.108-.109.108.109.9.6.36-.6.648-.9 1.008-.082.983.982.025.323.316.684.692.333.73.675-.081 1.008-.649.704-.162.303.162.582.366.426.642.375 1.008-.218 1.009.146 1.008.389.316.315.62 1.008.072.06.026-.06.161-1.008.505-1.007.316-.316.123-.692.107-1.007.778-.842.18-.166.004-1.008-.06-1.007-.124-.247-.58-.76-.35-1.009-.078-.247-.58-.76.471-1.008-.73',
    '6-1.007-.163-.999-.009-.01.009-.014 1.008-.758.75.773.258.147.89.86.118.152 1.008.848.008.008 1 .36 1.008.202.713.446.295.047.114-.047.07-1.008-.184-.75-.258-.257-.417-1.008-.087-1.008-.246-.268-.479-.74.008-1.007.471-.47.408.47.174 1.008.426.398.332-.398-.082-1.008-.25-.692-.373-.316-.354-1.007-.226-1.008-.055-.466-.108-.542.108-.108.217.108.791.198.648.81.321 1.008.04.042.707.965.202 1.008.098.105.744.903.264.691.822.316.186.466.933-.466-.602-1.007-.33-.62-.259-.388.258-.31.517.31.491.227.635.78.374.272.165-.271.071-1.008.763-1.008.009-.008.008.008 1 .45.36-.45-.287-1.007-.073-.099-.803-.909-.205-.2-.858-.808-.15-.354-.539-.653.539-.915 1.008-.035.66.95.348.4.58.607.428.474.534.534.45 1.008.024.023 1.008.62 1.008-.435.66-.208.348-.19.158-.818-.158-.409-.6-.599-.295-1.007-.113-.221-.708-.787-.213-1.007-.087-.197-.58-.811.58-.936 1.008.62.187-.692-.187-.28-.727-.727-.281-.375-.633-.633-.375-.6-.408-.408-.571-1.007.979-.783 1.008.012 1.008.455.456.316.552.16.552-.16.456-.316.587.316.421.051 1.008.192.273-.243-.273-.18-.828-.828-.18-.1-.908-.908-.1-.121-.886-.886-.122-.188-.838-.82.629-1.007.209-.19.19.19.818.152.856.855.152.1 1.008.718.19.19.818.173.643-.173.365-.394.64.394.368.065 1.008-.019.028-.046.136-1.008-.164-.117-.89-.89-.118-.07-1.008-.126-.89-.812-.118-.049-1.008-.15-.866-.809-.142-.853-.108-.154.108-.109 1.008-.642 1.008.152.776.599.232.036.66-.036.348-.19 1.008-.41 1.008-.158.693-.25-.693-.132-1.008-.51-.426-.366-.526-1.007.952-.901.792-.107-.792-.36-.548-.647.548-.595 1.008.116.543.479.466.193 1.008.064.307-.257-.307-.25-.81-.758.3-1.008-.272-1.007.782-.564 1.008-.07 1.008.268.393.366.615.14 1.008-.019 1.008.034.31-.155-.31-.31-1.008-.508-.19-.19-.818-.6-.471-.408.47-.51 1.009-.106.946.616.062.045 1.008.429.677.534.331.138.191-.138.817-.708 1.008.05 1.008-.065.633.723.375.17.926.838.082.074.092-.074-.063-1.008-.029-.04-.855-.968-.153-.152-1.008-.843-.008-.012-1-1-.01-.008.01-.019.396-.989.612-.408 1.008-.434.44-.165.568-.365.569.365.44.141 1.008.458.39-.6-.319-1.007.937-.936.093-.071.896-1.008.019-.01',
    '.012.01.996.853.46-.853-.46-.427-.543-.58.543-.582.995-.426.013-.015 1.008-.725.164-.268-.164-.491-.258-.517-.564-1.007.822-.316.316.316.2 1.007.492.164.633.844.375.473.597.535.411.232.698-.232-.1-1.008-.482-1.008-.116-.14-.97-.867-.038-.156-.394-.852.394-.511 1.008.167.995-.664.013-.025.134-.982.091-1.008.783-.866 1.008.358.145-.5.025-1.007.163-1.008.675-.675.617.675.3 1.008.091.22.617.788.222 1.007.17.75.29-.75-.054-1.007-.129-1.008-.108-.647-.108-.36.108-.181.355-.827-.355-.552-.316-.456.316-.342.457.342.551.355.509.653.005 1.007.297 1.008.198.264.07-.264.016-1.008.056-1.007-.142-.818-.3-.19.3-.418 1.008-.568 1.008.203.41-.225.171-1.007.427-.512.365.512.558 1.007.085.036 1.008.18.02-.216.02-1.007-.04-.791-.108-.217-.54-1.007-.053-1.008.484-1.008.217-.108 1.008-.691 1.008.483.316.316.692.474.597.534.308 1.008.103.497.072-.497.03-1.008.108-1.008.018-1.007-.166-1.008.946-.71.193-.298.097-1.007.273-1.008.445-.51.132-.498.43-1.007.446-.891.018-.117.254-1.007.736-.648.643-.36.365-.365 1.009-.486 1.008.124.31-.28.698-.698.75-.31zM89.644 20.152l.074.292.11-.292-.11-.451zm-4.128 6.045.17.799.153-.799-.154-.57zm-5.174 7.054.303.997.097-.997-.097-.225zM74.13 34.26l.466.31.418.697.59.155.134-.155-.134-.737-.542-.27-.466-.117zm-1.04 3.022.404 1.008.094.233.04-.233.42-1.008-.46-.35zm-5.569 2.016.018.015.017-.015-.017-.02zm.946 0 .08.08.856.927.152.11.159-.11.008-1.007-.167-.259-1.008.082zm.065 1.007.015.018.016-.018-.016-.016zm-13.356 6.046.267.276 1.008-.158.14-.118-.14-.045-1.008-.162zm2.133 1.008.15.034 1.008.157 1.008.073.375-.264-.375-.18-1.008-.101-1.008.151zm-1.032 3.023.174.034.122-.034-.122-.047zM45.82 63.48l.493 1.008.059.046.15-.046-.055-1.008-.095-.113zm1.376 2.015.184.281.21-.28-.21-.45zm-7.068 2.015.196.185.403-.185-.403-.496zm1.044 1.008.16.181.32-.18-.32-.364zm-7.949 1.008.044.074.059-.074-.059-.202zm.901 2.015.151.363.182-.363-.182-.907zm7.864 0 .352.103.145-.103-.145-.271zm4.118 0 .244 1.008.022.029.117-.03.382-1.007-.499-.333zM35.019 72.55l.046 1.007.217.47.326-.47-.225-1.007-.1-.123zm-1.245 1.007.403 1.0',
    '08.097.059.139-.06.092-1.007-.23-.428zm3.506 2.016.018.023.045-.023-.045-.467zm.89 1.007.05 1.008.086.22.177-.22-.062-1.008-.115-.23zM14.694 91.695l.428.6.143-.6-.143-.36zm-1.608 1.007.02.022.093-.022-.093-.233zm-3.264 4.03.26.23.17-.23-.17-.165zM116.935 0h1.435l.582.367.936.64.072.027 1.008.749.523.232.485.485.19.523-.19.299-.138.709.138.215.62-.215.388-.259.258.259.322 1.007-.58.609-.235.399-.048 1.007.283.33 1.008-.166.844.844-.022 1.008-.079 1.007-.553 1.008-.19.19-.138.818-.312 1.007-.558.744-.099.264.099.36.548.648.46.663.258.344-.258.775-.032.233-.29 1.007-.686.836-.08.172.08.113 1.008.134.58.76-.58.716-.118.292.118.414.475.594.004 1.008-.033 1.007-.446.594-.127.414-.194 1.007.32.818.291-.818.718-.741v.728l-.013.013-.235 1.008.248.38v1.771l-.212.872-.12 1.008.332.459v5.087l-.2.5.2.5v.917l-.403.598.403.741v.899l-.17.375-.01 1.008.18.072v.397l-.494.538-.514.834-.215.174-.306 1.008-.487.486-.487-.486.223-1.008.264-.345.602-.663.317-1.007.089-.14.426-.868-.368-1.008-.058-.014-.331-.993.198-1.008.133-.317.323-.69.016-1.008.131-1.008-.47-.088-.052.088-.956.956-.05.052-.958.547-.525.46-.483.495-.365-.495.365-.494.45-.513.545-1.008.013-.02.528-.987.4-1.008.08-.187.338-.82-.338-.884-.547.883-.461.242-1.008.552-.254-.794.254-.423.408-.584.6-.68.338-.328.426-1.008-.764-.63-.212-.377.212-.31.407-.698.496-1.008.105-.174.32-.833-.32-.961-.625.96-.383.256-.594.752-.414.492-.508-.492.478-1.007.03-.017.722-.99.286-.473.47-.535.185-1.008.353-.564.37-.444.129-1.007-.5-.27-.526-.738.265-1.008-.746-.31-.299.31-.684 1.008-.025.03-.89.978-.118.087-.114-.087-.107-1.008.22-.257.436-.75.573-.71.31-.298.46-1.008.213-1.007.025-.04.363-.968.407-1.008.238-.237.533-.77.171-1.008.304-.859.1-.149.214-1.007-.314-.675-.5.675-.508.49-.427.517-.453 1.008-.128.246-.588.762-.258 1.007-.162.256-1.008.195-.548-.45.47-1.008.078-.124.479-.884.529-.747.185-.26-.185-.74-.23-.268.23-.806.057-.202.366-1.008.585-.73.13-.277-.13-.554-1.008-.152-.024-.302.024-.06.263-.947-.263-.862-.202-.146-.416-1.008-.39-.357-.893.357-.115.065-.101-.065-.59-1.007-.317-.',
    '211-.74.21-.269.135-.035-.134L116.694 0zm5.768 17.13.28.716.223-.716-.222-.358zm.135 10.076.146.41.776-.41-.776-.268zm.066 3.023.08.128.102-.128-.102-.147zm.935 0 .153.317.134-.317-.134-.403zm-1.955 1.008.092.247.165-.247-.165-.104zm2.08 1.007-.179 1.008.207.413.382-.413-.266-1.008-.116-.071zm-1.083 2.016-.055 1.007.158.147.146-.147.313-1.007-.46-.24zm-1.009 2.015.104.101.177-.101-.177-.191zm2.049 3.023.07.213.13-.213-.13-.285zm-.047 4.03.118.243.15-.243-.15-.333zm-.912 1.008-.053 1.008.075.074.075-.074-.01-1.008-.065-.028zm-4.01-30.315.06.086-.06.086-.034-.086zm-22.178 3.568.12.548.084 1.008-.204.949-.235-.949-.028-1.008zm-.01 1.556.01.039.009-.039-.009-.104zm25.212.786.416.222-.416.475-.256-.475zm-1.008 1.153.179.076.031 1.008-.21.21-.334-.21.278-1.008zm-1.008 1.782.192.31-.192.619-.263-.62zm-32.258 2.526.117.806-.117.807-.202-.807zm32.258 1.669.138.145-.138.114-.055-.114zm0 11.162.109.067-.11.082-.05-.082zm-43.347 1.111.223.971-.223.465-.356-.465zm46.37.838.964.133-.48 1.008-.483.358-.378-.358.28-1.008zm-50.402.77.267.371.64 1.008.1.1.506.907.503.538.24.47.605 1.008-.845.29-.174-.29-.571-1.008-.263-.237-.882-.77-.126-.127-.441-.881-.202-1.008zm-.053.371-.076 1.008.129.257.264-.257-.243-1.008-.021-.03zm.804 2.015.257.225.147-.225-.147-.264zm1.127 1.008.138.551.044-.551-.044-.087zm47.517-2.445.41.43-.397 1.007-.013.01-.728.998-.28.25-.6-.25.582-1.008.018-.024.721-.983zm-.044.43.044.158.063-.158-.063-.066zm-1.056 2.015.092.038.043-.038-.043-.165zm-51.32-1.041.007.033-.007.028-.021-.028zm8.065.012.007.021-.007.027-.012-.027zm-25.202.92.181.109-.18.155-.121-.155zm67.54.49.273.627-.272.25-.465-.25zm-.112.627.113.06.066-.06-.066-.152zM125 44.51v.59l-.155.244-.149 1.007.304.41v1.154l-.499.451-.51.303-.524.705-.483.519-.32-.519.273-1.008.047-.106.578-.901.259-1.008.17-.17.477-.837zm-1.026 2.849.018.071.085-.071-.085-.055zm-60.466-1.31.715.302.293.174 1.008.396.414.438.594.742.198.265-.198.192-1.008.018-1.008-.098-.167-.112-.84-.694-.421-.313-.563-1.008zm.19 1.31.818.409 1.008-.276.017-.133-.017-.018-1.008-.225zm11.907-',
    '1.86.228.852-.228.276-.303-.276zm43.347.61.11.242-.11.108-.185-.108zm3.024-.19.432.432-.432.472-.204-.472zm3.024 2.86v1.074l-.243.529.243.428v.913l-.529.674-.48.348-.647.66-.36.24-.665.767-.343.514-.475-.514.428-1.007.047-.065.79-.943.218-.325.612-.683.396-.833.174-.174.453-1.008zm-1.123 2.61.115.692.428-.692-.428-.243zm-.902 1.008.009.233.186-.233-.186-.013zm-1.138 2.015.139.15.1-.15-.1-.36zm.139-4.253.397.223-.397.747-.157-.747zm-66.532 2.013.442.225.566.438 1.008.354.605.216-.484 1.007-.121.023-.055-.023-.953-.317-.786-.69-.222-.323-.597-.685zm.975 1.233.033.028.233-.028-.233-.024zm64.549-1.517.115.509-.115.085-.243-.085zm-52.42 1.384.09.133-.09.046-.036-.046zM125 52.898v.697l-.31.817-.698.698-.22.31-.788.788-.184.22-.824.877-.086.13-.113 1.008-.066 1.007.265.237.346-.237.662-.819.688.82-.108 1.007-.58.58-.225.428-.783.782-.196.225-.812.85-.149.158-.86.86-.183.148-.824.782-.29.225-.718.927-.216.08.216.324 1.008.12.564.564-.556 1.008-.008.008-.237 1-.771.837-.063.17-.537 1.008-.288 1.008.07 1.007-.19.19-1.009.702-.092.116-.916.82-.16.188-.848.847-.409.16-.599.599-1.008.29-.562.119.562.272.899.735-.89 1.008.619 1.008-.628.693-.23.314-.778.698-.643.31-.365.365-.473.643-.535.534-.243.473-.765.765-.153.243-.855.855-.265.152-.743.744-.53.264-.478.479-1.008.473-.067.056-.941.94-.102.067.102.3.758.708-.65 1.008-.108.108-1.008.736-.29.163-.719.718-.5.29.101 1.008-.609.579-.39.428-.618.617-1.008.28-.692.11.155 1.008-.47.409-1.009.537-.049.062-.959.675-.818.333-.19.298-.451.71-.557.407-1.008.191-1.008-.34-1.008.634-1.008.09-.081.025.08.304.61.704.399.597.821.41-.821.374-.587-.374-.421-.245-.492.245.492.491.31.517-.31.258-1.008.213-.613-.471-.395-.09-1.009-.009-1.008.09-.044.009.044.066 1.008.378 1.009.347.135.217-.135.108-1.009.426-1.008.159-.663.314-.345.282-.614.726.614.499 1.008.115.64.393-.64.366-1.008.113-1.008.138-1.008.172-1.008.08-1.008.043-.176.096-.832.831-1.008.103-.321.074-.687.686-1.008.308-.04.013-.968.718-.5.29-.508.508-1.008.345-1.008.066-1.008.029-.818.06-.19.19-1.009.603-1.008.09-.6.124-.408.408-1.008.4',
    '24-.192.176.192.497.471.51-.47.409h-1.009l-.47-.409-.538-.08-.873.08-.135.109-1.008.54-.692.36-.316.315-1.008.625-.191.067-.184 1.007-.633.633-1.008.103-.346.272.346 1 .01.008-.01.01-.076-.01-.932-.052-.662-.956-.346-.076-.346.076-.663.782-.992.226-.016.008-1.008.47-1.008.32-1.008.01-1.008.098-1.008.056-.698.045.31 1.008.388.436.538.572.47.38.824.627.184.983.01.025-.01.008-.012-.008-.996-.314-1.008-.504-1.008.714-1.008-.23-.792-.674-.216-.16-1.008-.028-.776.188.395 1.008-.627.823-1.008-.265-.559-.558-.45-.243-.428.243.429.75.258.257-.258.345-1.008.272-.71-.617-.298-.127-1.009-.145-1.008-.464-.062.736.062.174.645.834.31 1.008-.774 1.007-.18.109-.109-.109-.9-.36-1.008-.539-.108-.108-.9-.53-1.008.409-.138.12-.87.641-.436.367-.572.508-.508-.508-.5-.16-1.008-.369-1.008-.003-.47.532-.538.654-.121.354h-.533l.51-1.008.144-.488.482-.52.526-.119 1.008.014.351.106.657.457 1.008.324.825-.781.183-.13.903-.878.105-.156 1.008.02.298.136.71.616 1.008.27.314.122.694.378.348-.378-.348-.625-.16-.383-.367-1.008-.214-1.007.741-.247.903.247.105.073 1.009.343.674-.416.334-.88 1.008.046 1.008.272.302-.446.706-.506 1.008-.273 1.008-.085 1.008.585.677-.728-.432-1.008.212-1.008.551-.185 1.008-.003 1.008-.158 1.008-.339 1.008-.032.481-.29.527-.319 1.008-.2.823-.489.185-.097 1.009-.162 1.008.173 1.008-.848.268-.074.731-1.007.009-.006 1.008-.356.735-.646.273-.206.932-.802.076-.033 1.008-.106 1.008-.196 1.008-.492.11-.18.898-.818.293-.19.715-.169 1.008-.259 1.008-.306.371-.273.637-.106 1.009-.099 1.008-.098 1.008-.229.69-.476.318-.205 1.008-.79.017-.013.99-.335.954-.672.055-.023 1.008-.23 1.008-.352.403-.403.605-.328 1.008-.146 1.008-.278.583-.256-.583-.952-.046-.055.046-.029.823-.979.185-.178.9-.83.023-1.007.085-.011 1.008-.208 1.008-.15 1.009-.217.5-.422.508-.75.34-.257.141-1.008.527-.165 1.008-.37.572-.473.436-.176.957-.831.05-.033 1.009-.076.799-.899.209-.088.866-.92.142-.07 1.008-.213.529-.724.48-.214 1.007-.167.876-.627.132-.207.76-.8-.76-.741-.097-.267.097-.082 1.008-.194 1.008-.719.013-.013.996-.56.546-.447-.546-.535-.376-.473.376-.272',
    '.661-.736.347-.228.78-.78.228-.192.912-.815.096-.098 1.008-.809.1-.1.908-.523.485-.485.523-.833.174-.175.753-1.007.081-.126.837-.882.171-.478.927-.53-.927-.452-.662.452-.346.107-1.008.157-1.008.677-.044.067-.964.328-1.008.667-.023.013-.985.182-1.008.359-.355-.541.355-.186 1.003-.822.005-.003 1.008-.28.964-.725.044-.027 1.008-.286 1.008-.184 1.008-.382.059-.128.949-.506 1.008-.216.137-.286-.137-.285-1.008-.379-.22-.344.22-.169.804-.838.204-.153 1.008-.253.848-.602.16-.103 1.008-.447.458-.457.55-.643.408-.365-.408-.674-.18-.334.18-.094.51.094.498.25.303-.25-.303-.368-.15-.64.15-.125.875-.882.133-.187.719-.82.29-.795.196-.213-.135-1.008-.061-.074-.283.074-.726.09-.113-.09-.895-.698-.747-.31.747-.668.308-.34.7-.98 1.009-.01.013-.017-.013-.036-.306-.971.306-.306.534.306.474.236.249-.236-.25-.306-.473-.702.474-.75.355-.258.52-1.007.133-.19.661-.818.347-.907.1-.1-.02-1.008.53-1.008.398-.604.378-.404.63-.752.256-.255.725-1.008.027-.046.635-.961zm-4.133 7.56.1.321.238-.321-.237-.264zm.912 0-.593 1.008.79.236.237-.236.202-1.008-.44-.196zm-1.347 2.015.536.353.337-.353-.337-.862zm-.936 1.008.464.394.394-.394-.394-.58zm-7.82 15.114.22.101.089-.1-.09-.074zm-1.836 2.016.039.022.067-.022-.067-.021zm-2.795 1.007.818.077.428-.077-.428-.145zm-2.506 1.008.3.29 1.008-.194.28-.096-.28-.333-1.008.25zm-1.82 1.008.104.157.692-.157-.692-.055zm18.249-28.689.514.475-.514.422-.367-.422zm-.107.475.107.123.15-.123-.15-.139zm-.901.69.37.317-.37.256-.292-.256zm-.035.317.035.03.044-.03-.044-.037zm-63.473.741.18.267-.18.509-.382-.509zm1.008 1.154.105.12-.105.278-.392-.277zM46.37 59.58l1.008.304.871.573.137.1 1.008.674.269.234.74.617 1.007.351.046.04.962.816.145.19-.145.48-1.008.046-.615.483.615.793.13.214.079 1.008.077 1.007-.181 1.008-.105.722-.619-.722-.219-1.008-.17-.217-.506-.79-.458-1.008-.044-.044-.582-.963-.426-.491-.485-.517-.523-.776-.306-.232-.528-1.007-.174-.18-.466-.828zm-.125.877.125.222.999-.222-.999-.235zm.89 1.008.243.39.617.617.351 1.008.04.042.838.966.17.28.6-.28-.03-1.008.438-.408.333-.6-.333-.114-1.008-.577-.316-.316-.692-.265-',
    '1.008-.735zm3.824 2.015.451.097.552-.097-.552-.216zm-.838 2.015.281.818.375-.818-.375-.6zm1.134 2.015.155.276.053-.276-.053-.55zm3.18-7.51 1.008.441.008.016.803 1.008.197.196.734.811.274.274.428.734-.428.717-.701-.717-.307-.307-1.008-.457-.172-.244-.471-1.007-.366-.566-.249-.442zm.82 1.465.188.5.236-.5-.236-.3zm.696 1.007.5.205.214-.205-.214-.236zm1.303 1.008.205.21.125-.21-.125-.214zm2.22-2.12.059.105-.058.032-.027-.032zm-1.007 2.878.107.25-.107.76-.528-.76zM46.37 76.325l.059.255.01 1.008-.025 1.007-.044.081-.048-.08-.13-1.008-.086-1.008zm-10.08 2.133.034.137-.035.239-.075-.239zm-6.05.954.28.191-.28.453-.139-.453zm10.082.155.015.036-.015.076-.02-.076zm-9.073 1.54.077.511-.077.37-.266-.37zm-1.008 1.689.638.838-.126 1.007-.512.444-.077-.444-.231-1.007zm-.057.838.057.248.118-.248-.118-.155zm70.621.976 1.009-.323.54.354-.54.245-1.009-.074-.058-.17zm.649.031.36.072.157-.072-.157-.103zm-85.326.329.46.679.548.828.126.18.182 1.007-.034 1.008-.274.57-.428-.57-.41-1.008-.17-.218-.412-.79-.115-1.007zm-.08.679.08.659.07-.66-.07-.103zm.933 2.015.155.382.057-.382-.057-.248zm82.816-2.163.366.148-.366.116-.582-.116zM20.161 87.95l1.008.341.312.38.103 1.008-.275 1.008-.14.153-.85-.153-.144-1.008-.014-.044-.1-.963zm.742 1.73.266.362.111-.363-.11-.499zm4.299-.087.02.086-.02.026-.012-.026zm-5.04 1.33.098.772-.099.185-.083-.185zM7.055 98.344l.27.403-.27.513-.513-.513zm1.009 1.108.19.303-.07 1.007-.12.025-.047-.025-.508-1.007zM.318 102.78l.69.476 1.008.43.138.101.58 1.008-.718.934-.403.074.403.483.219.524.79.395.544.613-.444 1.007-.1.124-.108-.124-.9-.364-.644.364-.365.187-1.008.354v-.383l.391-.158-.391-.642v-1.715l.307-.665-.307-.38V104.1l1.008.186.321-.5-.32-.155L0 103.388v-1.138zm1.198 2.015.5.272.21-.272-.21-.321zm-.694 2.015.186.117.047-.117-.047-.049zm.979 1.008.215.052.216-.052-.216-.093zm3.24-2.062.039.047-.04.067-.161-.067zm-4.033 5.436.986.656-.986.806-.493.202.213 1.008.28.23 1.008.344.316.433.692.674 1.008.267.13.067.7 1.007.178.175 1.008.316.53.517.478.415 1.009.498.08.095-.08.19-.919.817-.09.032-1.008.143-1.008.094-1.008',
    '.178-1.008.517-.044.044-.964.178-.875.83-.018 1.007.893.993.03.015.978.744 1.008-.061 1.008-.15 1.008-.46.093-.073.915-.114 1.009-.055 1.008-.018.267.187.023 1.008.184 1.007-.124 1.008.402 1.007.256.262 1.008.387 1.008.315.07.044.938.764.256.244.752.876 1.008-.453 1.008.378.36.206.648.526 1.008-.111.6-.415.408-.128.398.128.61.779.08.229h-.803l-.285-.46-1.008.287-1.008.032-1.008-.608-.775-.259-.233-.024-.067.024-.941.628-.6-.628-.408-.817-.19-.19-.818-.346-1.008-.472-.21-.19-.798-.2-.789-.808-.117-1.007.036-1.008-.138-.817-.233-.19.233-.262.057-.746-.057-.04-1.008-.01-1.009.04-.074.01-.934.735-1.008.134-1.008.044-1.008.018-1.008-.245-.687-.686-.316-1.008-.005-.932-.01-.075.01-.009 1.008-.947.281-.052.727-.727 1.008-.15 1.008-.052 1.008-.028.375-.05.633-.634.6-.374-.6-.173-.964-.835-.044-.042-1.008-.2-.786-.766-.222-.307-1.008-.192-.538-.508-.47-.444-1.008-.555-.008-.01-1-.642v-2.525zm23.186 19.764.058.037.95.809.568.199h-.827l-.75-.346-1.008.265-.113.081h-.624l.737-.526.843-.482z" clip-path="url(#p0dbbb3483e)" style="fill:#fff;fill-opacity:.1"/><path d="m106.855.439.962-.439h.576l-.53.554-1.008.451-.004.003-1.004.49-1.008.316-.264.201-.744.913-.102.095-.906.427-1.008-.088-.836.669-.173.276-.703.731-.305.293-.268.715-.39 1.007-.35.378-.307.63-.272 1.008-.055 1.007-.363 1.008-.01.028-.483.98-.14 1.007-.386.97-.017.038-.191 1.008.208.822.067.185.212 1.008.176 1.007.093 1.008.18 1.008.28.34.202.667.029 1.008-.23.426-.275-.426-.266-1.008-.468-.399-.453-.608-.18-1.008-.372-1.008-.003-.005-.579-1.002-.108-1.008-.32-.768-.906.768-.103.574-.12-.574-.888-.969-.267.97-.084 1.007-.014 1.007.097 1.008.077 1.008.19.684.109.323.372 1.008-.48.462-.17-.462-.606-1.008-.232-.032-.116.032-.892.406-.349.602-.443 1.008.001 1.007-.02 1.008-.197.24-.273-.24.025-1.008-.184-1.007-.532-1.008.198-1.008-.21-1.007-.032-.057-.271.057-.192 1.007.334 1.008-.333 1.008-.12 1.007.214 1.008.28 1.007.088.21.301.798.209 1.008.316 1.007-.395 1.008-.431.353-.26-.353-.748-.749-.352.749-.656.724-1.001-.724-.008-.022-.328-.986-.643-1.007.015-1.008-.052-.132',
    '-.447-.876-.408-1.007-.153-.394-.292.394-.716.404-.808-.404-.2-.109-.132.109-.084 1.007-.034 1.008-.054 1.008-.704.579-.394.428.394.522.333.486.418 1.008.153 1.007.032 1.008.07 1.008.002.015.166.992-.152 1.008.178 1.007.359 1.008-.407 1.008-.144.025-.015-.025-.364-1.008-.629-.738-.215-.27-.793-.994-.014-.013-.633-1.008-.361-.402-.669-.605-.339-.582-.493.582.034 1.007.135 1.008.324.858.046.15.186 1.007.145 1.008.631.729.109.278-.109.686-.349.322-.428 1.008.204 1.007-.181 1.008-.254.186-.144-.186-.61-1.008-.254-.401-.241-.606-.427-1.008-.34-.414-1.008-.218-.568-.376-.44-.223-1.008.026-.078.197.078.034.7.974.308.441.331.567.677.907.072.1.511 1.008.425.58.246.428.453 1.007.309.423.246.585-.152 1.007-.094.041-.052-.04-.712-1.008-.244-.165-.924-.843-.084-.085-.552-.922-.456-.62-.373-.388-.635-.597-.302-.41-.69-1.008-.016-.045-1.008-.56-.646.605.068 1.007.084 1.008.228 1.008.266.241.255.766-.255.62-.87-.62-.139-.155-.794-.852.209-1.008-.423-.532-.295-.476-.713-.627-1.008.61-.01.017-.998.88-.094.128.094.18.764.828.244.317.3.69.192 1.008.36 1.007.156.225.325.783-.325.606-.746-.606-.262-.184-1.008-.1-1.008-.118-.908-.606-.1-.082-.865.082-.052 1.008.917.799.24.209-.24.37-1.008.196-1.008.177-.096.264.096.177.713.83-.713.375-.792.634.792.938.035.07.973.66.326.347.682.754.173.253.13 1.008-.303.177-.177-.177-.831-.805-.247-.203-.761-.8-.484-.207-.524-.467-1.008.462-.008.005.008.007.334 1-.334.596-.525-.596-.483-.52-1.008-.307-.564-.18-.444-.27-.394.27.394.538.13.47.704 1.007.174.186.717.822.29.435.423.572.586.682.177.326.738 1.008-.915.514-.416-.514-.592-.814-.28-.194-.728-.639-.678-.369-.33-.269-.93.27.49 1.007.44.498.308.51.7.728.231.28.733 1.007.044.058.408.95.201 1.007-.61.656-.487-.656-.52-.587-.39-.42-.618-.629-.964-.38-.044-.021-.693-.986-.316-.53-.538-.477-.412-1.008-.058-.198-.226.198-.782.437-1.008-.09-.63-.347-.378-.214-1.008-.176-.37.39.37.267.853.74.155.13 1.008.425.534.453.474.403.458.605-.124 1.008-.334.76-.121.247-.224 1.008.033 1.007-.127 1.008-.14 1.008-.297 1.007-.132.12-.293-.12-.715-.643-.28-.364-.728-.676-',
    '.229-.332-.775-1.008-.004-.003-1.008-.276-.234.28.234.548.202.46.25 1.007-.109 1.007.393 1.008.272.643.154.365-.055 1.007-.021 1.008-.078.044-1.008.114-.762-.158-.246-.127-.349.127.349.209.188.799.168 1.007.064 1.008.088 1.007-.508.938-.563-.938-.445-.927-.261-.08-.747-.304-.5-.704-.504-1.007.157-1.008.296-1.008-.457-.332-1.008-.507-.609-.168-.4-.096-.148.096.149.152.427.855.58.692.819.316-.818.473-.656.535.002 1.007-.037 1.008-.003 1.007-.314.944-.03.064.03.29.053.718-.053.41-1.008.592-.502-1.002-.506-.805-.566-.203-.443-.182-.452-.826-.221-1.007-.335-.615-.688-.393-.32-.487-.18.487.18.32.394.688.155 1.007.46.82.565.188.442.31.31.698.32 1.007-.63.944-.894-.944.073-1.007-.187-.289-.186.289.123 1.007.055 1.008.008.022 1.008.364.038.622.367 1.007-.006 1.008-.35 1.007-.049.052-.03-.052-.468-1.007-.503-1.008-.007-.021-1.008-.748-.135-.238-.485-1.008-.225-1.008-.163-.516-.144.516-.305 1.008-.559.399-.254-.399-.335-1.008-.246-1.007.19-1.008-.357-1.008-.006-.002-.007.002-.63 1.008-.37.47-.245.538-.238 1.007.103 1.008-.194 1.008.11 1.007-.545.642-.381.366-.627.813-.424.194-.584.452-.16-.452.16-.472.274-.535.208-1.008-.225-1.007-.257-.406-.43.406-.578.884-.058.123-.332 1.008-.33 1.007-.288.657-.154.351-.214 1.008-.408 1.007-.232.565-.296.443-.712.831-.68-.831-.088-1.008-.24-.408-.857-.6-.034-1.007-.118-.157-.185.157-.103 1.008-.72.659-.058.348-.11 1.008-.84.924-.089.084-.528 1.007-.28 1.008-.11.957-.013.05-.767 1.008-.229.175-.19-.175-.124-1.007-.35-1.008.179-1.008.485-.566.237-.441.13-1.008.104-1.008-.012-1.007.075-1.008-.177-1.008-.357-.548-1.008.284-.155.264-.101 1.008.256.93.046.078.083 1.007-.129.445-.413.563-.466 1.008-.129.228-.282.78.2 1.007.082.232.35.776-.067 1.007-.283.624-1.008-.315-.539-.309-.469-.315-.381.315.258 1.008.123.15.962.857-.962.83-1.008-.114-1.008-.596-.273-.12-.735-.76-.314.76.314.97.014.038.536 1.008.458.752.076.255-.076.193-.466-.193-.542-.249-.461.25.345 1.007-.892.255-1.008.192-.779-.447-.23-.155-.31.155-.697.93-.145.078-.864.215-.767-.215-.24-.041-1.009-.271-1.008.198-.27.114.27.135.607.872.',
    '401.659.114.349.866 1.008.028.064.24.943-.207 1.008.162 1.007-.195.497-1.008-.387-.492.898.492.694.141.314-.14.69-.212.317.211.151.947.857-.947.947-1.008.035-.025.026-.465 1.007.49.227 1.008-.091.423.872.585.551.533.456.475.46.132.548.877.68.276.328-.276.654-.398.353-.61.218-1.009.174-1.008.212-1.008.402-.004.002-1.004.178-1.008.223-.64.607-.06 1.007.7.778.463.23.545.415 1.008-.138.879-.277.13-.02 1.007-.153 1.008-.125 1.009-.081 1.008-.066.638.445.22 1.008.15.73.024.277-.024.169-.22.839.22.41 1.008.568.044.03.964.596.654.411.354.288.757.72.25.292.472-.292.537-.361.393.36.615.379 1.008.576 1.008-.17 1.008-.24 1.008.269.148.194.397 1.008h-.465l-.08-.23-.61-.778-.398-.128-.409.128-.599.415-1.008.111-.647-.526-.361-.206-1.008-.378-1.008.453-.752-.876-.256-.244-.938-.764-.07-.044-1.008-.315-1.008-.387-.256-.262-.402-1.007.124-1.008-.184-1.007-.023-1.008-.267-.187-1.008.018-1.009.055-.915.114-.093.073-1.008.46-1.008.15-1.008.061-.978-.744-.03-.015-.893-.993.018-1.007.875-.83.964-.178.044-.044 1.008-.517 1.008-.178 1.008-.094 1.008-.143.09-.032.919-.818.08-.19-.08-.094-1.009-.498-.479-.415-.529-.517-1.008-.316-.179-.175-.7-1.007-.129-.067-1.008-.267-.692-.674-.316-.433-1.008-.344-.28-.23-.213-1.008.493-.202.986-.806-.986-.656-1.008.512v-.727l.2-.136-.2-.38v-1.095l1.008-.354.365-.187.643-.364.9.364.108.124.101-.124.444-1.007-.545-.613-.79-.395-.218-.524-.403-.483.403-.074.717-.934-.579-1.008-.138-.1-1.008-.431-.69-.476-.318-.53v-.752l1.008.23 1.008-.397 1.008-.037 1.008-.048 1.008.205.52.321.488.24.605-.24.056-1.008-.66-.82-.16-.187-.849-.96-.054-.048.054-.141.482-.867-.482-.619-.963.62-.045.016L4 97.74l-.397-1.007-.578-.788-.115-.22.115-.09 1.008.046.049.044.96.843.494.165.513.376 1.008.409.34.222.669.523 1.008-.104 1.008-.272 1.008.335.127-.482-.127-.541-.213-.466-.795-.773-.283-.235.283-.445.712-.562.296-.139.21.139.798.452.605.555.403.571.623-.57-.32-1.008-.303-.397-.543-.611-.465-.408-.879-.6-.13-.11-1.007-.421-.768-.476-.24-.31-1.008-.475-.404-.223.404-.235 1.008-.172 1.008.07.378.337.63.469.57.539.438.484.523.523',
    '.485.542.543.466.465.364.956.644.052.027 1.008.145.13-.172.04-1.008-.17-.667-.222-.34-.296-1.008-.319-1.008-.171-.47-.184-.538-.301-1.007-.523-.492-.366-.516-.642-.656-.352-.352-.656-.81-.202-.197.202-.439 1.008.074.701.365.307.255.247-.255-.247-.383-.29-.625.276-1.007.014-.101.134.1.759 1.008.115.065.115-.065-.018-1.007-.097-.655-.282-.353.282-.046 1.008-.67.645.716.233 1.008.13.164.928.843.08.095.062-.095.046-1.007.078-1.008-.07-1.008-.019-1.007.911-.695.695.695.159 1.007-.114 1.008.268.646.656.362-.318 1.007.192 1.008.478.452.762.555.246.303.392-.303.616-.275.656.275.339 1.008.014.029.15-.029.858-.163.127.163.88.743.327-.743.316-1.008.366-.5.195-.507.227-1.008.369-1.007.217-.236.843-.772-.084-1.008.047-1.007-.504-1.008-.302-.276-.502-.732-.066-1.007-.094-1.008-.346-.519-.4-.488.23-1.008.17-.13.126.13.882.505.52.503.488.626.45.381.558.573.751.435.257.313 1.008.133 1.008-.053.954-.393-.324-1.008.04-1.007.338-.288.948.288-.26 1.007.32.433.152-.433-.13-1.007.723-1.008.263-.163.143.163.41 1.008.455.583.376.424.333 1.008.3.752.604-.752-.07-1.008.474-.91.768.91.24.426.478-.426-.238-1.007-.24-.29-.514-.718.211-1.008.067-1.007.04-1.008.196-.257.414.257.594.198 1.008.281.678-.479-.433-1.008-.245-.268-.388-.74.388-.574.408.575.6.569.516.438.492.478 1.008.472.013.058.453 1.008.542.711.412.296.596.352.28-.352.07-1.007-.157-1.008-.193-.49-.726-.518.478-1.007-.219-1.008-.399-1.008-.142-.254-.483-.753-.493-1.008-.032-.06-.279-.947.279-.351.287.35.721.567.379.441.629.964.141.044.867.184.31-.184-.31-.413-.29-.595-.394-1.007-.324-.297-.492-.711-.516-.61-.365-.398-.643-.963-.044-.044-.802-1.008-.162-.081-.835-.927-.173-.628-.296-.38.296-.236 1.008.04.298.197.71.295 1.008.57 1.008-.344 1.008-.086 1.008.398.23.174.778.287.495-.287-.495-.906-.073-.101-.935-.617-.391-.39-.617-.343-.665-.666-.343-.416-.591-.591-.417-.643-.373-.365.373-.474 1.008-.01.485.484.523.343.758.665.25.181 1.008.412.863.414.145.726.151-.726.857-.456.894.456.114.073.375-.073.295-1.007-.109-1.008-.56-.4-.608-.607-.4-.238-1.009-.433-.37-.337-.638-.263-1.008-.422-.',
    '345-.323.168-1.007.177-.127.341.127.667.103 1.008.131 1.008-.012 1.008.19.62-.412.388-.151.42.15.589.14 1.008.152 1.008-.277.023-.014-.023-.012-1.008-.382-.692-.614-.316-.2-1.009-.253-.698-.555-.31-.597-.328-.41.328-.31 1.008-.137.46.447.549.217 1.008-.055 1.008.262 1.008.232 1.008.25 1.008-.71.416-.196-.416-.139-1.008-.478-1.008-.347-.141-.044-.757-1.007-.11-.14-1.008-.793-.081-.075.08-.134 1.009-.644.37-.23.638-.41 1.008-.074 1.008-.107 1.008.115 1.008-.397.147-.134.861-.263.526.263.482.188.334-.188.674-.675 1.008-.148 1.008.397.47.426.538.486.6-.486.09-1.008.318-.291 1.009-.673.046-.044-.046-.043-.322-.964-.602-1.008-.085-.403-1.008-.149-.873-.456.873-.388 1.008.302.135.086.874.477 1.008.41.16.121.848.302.617.706.39.256.938-.256.053-1.008.018-.027.05.027.09 1.008.868.31.963-.31-.58-1.008-.383-.589-.272-.419.272-.494 1.008.028.126-.541-.091-1.008-.035-.109-.514-.898-.345-1.008.338-1.008.274-1.007.247-.403.277.403.731.354 1.008.606.061.047-.061.706-.022.302.022.086 1.008.62.1.302.908.604.363-.604.038-1.008-.4-.93-.102-.078-.339-1.007-.101-1.008-.467-.682-.249-.326-.759-.92-.097-.087.097-.115.938-.893.07-.061.118.061.89.464.165-.464-.114-1.008.005-1.007-.056-.524-.078-.484.078-.086.161.086.847.223.489-.223.009-1.007.137-1.008.373-.701.408.7.404 1.009.196.255.426.752.303 1.008.28.52.373.487.31 1.008.324.732.498.276.335 1.007.176.277.162-.277.144-1.007-.306-.547-.249-.46-.186-1.009-.2-1.007-.374-.983-.013-.025-.183-1.007.196-.574.415.574.594.323.28-.323.18-1.008.1-1.008-.07-1.007-.009-1.008.527-.49 1.008.412.134.078.474 1.008.246 1.007.154.42.248-.42.348-1.007.231-1.008.18-.132.191.132.818.817.204-.817.041-1.008.018-1.007-.004-1.008-.128-1.007.272-1.008.605-.454 1.008.08.477.374.531.278.528.73.281 1.007.2.655.314-.655.02-1.007.09-1.008.36-1.008.068-1.007.155-.419.17-.589.728-1.008.097-1.007.013-.027.194-.98.35-1.009.464-.63.205-.377.225-1.008.578-.85.153-.157.855-.66.44-.348.569-.423 1.008.379 1.008-.927.03-.037.978-.743 1.008-.212.108-.052zM96.51 18.137l.028 1.008.235.949.204-.949-.085-1.008-.119-.548zm-9.01 8.061',
    '.202.807.117-.807-.117-.806zm-16.153 13.1.226.218.45-.218-.45-.168zm4.91 1.007.356.465.223-.465-.223-.97zm-4.32 1.008.203 1.008.44.88.127.127.882.771.263.237.57 1.008.175.29.845-.29-.606-1.008-.24-.47-.502-.538-.505-.907-.101-.1-.64-1.008-.267-.372zM60.16 43.328l-.223 1.008-.46.575-.371.433.37.216.865.791.144.066.635-.066-.284-1.007.47-1.008-.497-1.008-.324-.07zm9.376 0 .021.028.007-.028-.007-.033zm8.074 0 .012.027.007-.027-.007-.02zM61.7 44.336l.801.18.4-.18-.4-.206zm.826 2.015.563 1.008.42.313.841.694.167.112 1.008.098 1.008-.018.198-.192-.198-.265-.594-.742-.414-.438-1.008-.396-.293-.174-.715-.302zm12.777 0 .303.276.228-.276-.228-.852zm-20.841 2.015.983.376 1.005.632.003.002 1.008.267.891-.269-.891-.713-.257-.295-.751-.261-1.008-.106zm-4.672 3.023.614.367 1.008.307.275.334.733.474.902.534.106.106 1.008.616.559.285.45.416.288-.416-.288-.261-.48-.746-.529-.554-.287-.454-.72-.742-.458-.266-.55-.352-1.009-.07-1.008-.023zm5.445 0 .21.151 1.008.368.412.489.596.35 1.008.23.681-.58-.681-.52-.92-.488-.088-.075-1.008-.187-1.008.095zm-.387 1.008.597.685.222.323.786.69.953.317.055.023.12-.023.485-1.007-.605-.216-1.008-.354-.566-.438-.442-.225zm4.623 1.008.006.004.021-.004-.021-.01zM47.309 55.42l.07.07.771.937.237.237 1.008.5.514.271.494.339.333-.339-.333-.522-.25-.486-.758-.472-.738-.535-.27-.237-1.008-.11zm8.761 2.015.382.509.18-.509-.18-.267zm-1.084 1.008.458.946.323-.946-.323-.39zm2.082 0 .392.277.105-.277-.105-.121zM43.943 59.45l.412.457 1.008.066.11-.523-.11-.07-1.008-.48zm1.962 1.008.466.829.174.179.528 1.007.306.232.523.776.485.517.426.49.582.964.044.044.458 1.008.506.79.17.217.22 1.008.618.722.105-.722.18-1.008-.076-1.007-.078-1.008-.13-.214-.616-.793.615-.483 1.008-.046.145-.48-.145-.19-.962-.817-.046-.039-1.008-.351-.739-.617-.269-.234-1.008-.673-.137-.101-.871-.573-1.008-.304zm8.281 0 .25.442.365.566.47 1.007.173.244 1.008.457.307.307.7.717.43-.717-.43-.734-.273-.274-.734-.811-.197-.196-.803-1.008-.008-.016-1.009-.44zm5.263 1.008.027.032.058-.032-.058-.105zm-1.509 3.023.528.76.107-.76-.107-.25zM28.206 76.58l.02',
    '.043.053-.043-.053-.129zm17.9 0 .087 1.008.13 1.007.048.081.044-.08.026-1.008-.011-1.008-.059-.255zm-9.89 2.015.074.239.035-.239-.035-.137zm-6.114 1.008.14.453.28-.453-.28-.19zm10.201 0 .02.076.015-.076-.015-.036zm-21.396 1.008-.296 1.007.332 1.008.21.349.19-.349.329-1.008-.331-1.007-.188-.188zm12.077 1.007.266.37.077-.37-.077-.511zm-1.05 2.016.23 1.007.078.444.512-.444.126-1.007-.638-.838zm-14.332 2.015.115 1.007.412.79.17.218.41 1.008.428.57.274-.57.034-1.008-.182-1.008-.126-.18-.547-.827-.461-.679zm4.458 3.023.101.963.014.044.143 1.008.851.153.14-.153.275-1.008-.103-1.007-.312-.38-1.008-.342zm5.13 1.007.012.026.02-.026-.02-.086zm-5.112 2.016.083.185.099-.185-.099-.773zM6.543 98.748l.513.513.27-.513-.27-.403zm.967 1.008.508 1.007.047.025.12-.025.07-1.007-.19-.303zm2.147 0 .424.343.72-.343-.72-.2zm-4.778 6.046.161.067.04-.067-.04-.047zM111.895 0h.42l-.42.254L111.49 0zm3.024 0h1.775l.206 1.008.035.134.27-.134.739-.211.316.21.59 1.008.102.065.115-.065.893-.357.39.357.416 1.008.202.146.263.862-.263.947-.024.06.024.302 1.008.152.13.554-.13.277-.585.73-.366 1.008-.057.202-.23.806.23.268.185.74-.185.26-.53.747-.478.884-.077.124-.47 1.007.547.45 1.008-.194.162-.256.258-1.007.588-.762.128-.246.453-1.008.427-.518.508-.49.5-.674.314.675-.213 1.007-.101.15-.304.858-.17 1.008-.534.77-.238.237-.407 1.008-.363.967-.025.04-.213 1.008-.46 1.008-.31.298-.573.71-.435.75-.221.257.107 1.008.114.087.119-.087.889-.978.025-.03.684-1.008.299-.31.746.31-.265 1.008.527.737.499.27-.13 1.008-.37.444-.352.564-.185 1.008-.47.535-.286.472-.722.99-.03.018-.478 1.007.508.492.414-.492.594-.752.383-.255.625-.961.32.96-.32.834-.105.174-.496 1.008-.407.698-.212.31.212.377.764.63-.426 1.008-.338.329-.6.679-.408.584-.254.423.254.794 1.008-.552.46-.242.548-.883.338.883-.338.82-.08.188-.4 1.008-.528.988-.013.02-.546 1.007-.45.513-.364.494.365.495.483-.495.525-.46.957-.547.05-.052.957-.956.052-.088.47.088-.13 1.008-.017 1.007-.323.691-.133.317-.198 1.008.33.993.059.014.368 1.008-.426.868-.089.14-.317 1.007-.602.663-.264.345-.223 1.008.487.486.487-.486.3',
    '06-1.008.215-.174.514-.834.494-.538v1.72l-.532.834-.476.836-.171.171-.259 1.008-.578.9-.047.107-.273 1.008.32.519.483-.519.525-.705.51-.303.498-.45v.862l-.38.596-.454 1.008-.174.174-.396.833-.612.683-.217.325-.791.943-.047.065-.428 1.007.475.514.343-.514.665-.767.36-.24.648-.66.48-.348.528-.674v1.175l-.373.507-.635.961-.027.046-.725 1.008-.256.255-.63.752-.378.404-.398.604-.53 1.008.02 1.007-.1.101-.347.907-.661.817-.133.19-.52 1.008-.355.257-.474.75.474.703.249.306-.25.236-.473-.236-.534-.306-.306.306.306.97.013.037-.013.017-1.009.01-.7.98-.308.34-.747.668.747.31.895.698.113.09.726-.09.283-.074.06.074.136 1.008-.196.213-.29.794-.719.82-.133.188-.875.882-.15.126.15.64.303.367-.303.25-.498-.25-.51-.094-.18.094.18.334.408.674-.408.365-.55.643-.458.457-1.008.447-.16.103-.848.602-1.008.253-.204.153-.804.838-.22.17.22.343 1.008.379.137.285-.137.286-1.008.216-.95.506-.058.128-1.008.382-1.008.184-1.008.286-.044.027-.964.725-1.008.28-.005.003-1.003.822-.355.186.355.54 1.008-.358.985-.182.023-.013 1.008-.667.964-.328.044-.067 1.008-.677 1.008-.157.346-.107.662-.452.927.452-.927.53-.17.478-.838.882-.081.126-.753 1.007-.174.175-.523.833-.485.485-.907.522-.101.101-1.008.81-.096.097-.912.815-.229.193-.78.779-.346.228-.661.736-.376.272.376.473.546.535-.546.447-.996.56-.013.013-1.008.719-1.008.194-.097.082.097.267.76.74-.76.801-.132.207-.876.627-1.008.167-.48.214-.528.724-1.008.212-.142.071-.866.92-.21.088-.798.899-1.008.076-.05.033-.958.83-.436.177-.572.473-1.008.37-.527.165-.142 1.008-.34.258-.506.75-.501.42-1.009.219-1.008.149-1.008.208-.085.01-.024 1.009-.899.829-.185.178-.823.979-.046.029.046.055.583.952-.583.256-1.008.278-1.008.146-.605.328-.403.403-1.008.352-1.008.23-.055.023-.953.672-.99.335-.018.013-1.008.79-.318.205-.69.476-1.008.23-1.008.097-1.009.099-.637.106-.37.273-1.009.306-1.008.26-.715.168-.293.19-.897.818-.11.18-1.009.492-1.008.196-1.008.106-.076.033-.932.802-.273.206-.735.646-1.008.356-.009.006-.73 1.007-.27.074-1.007.848-1.008-.173-1.009.162-.185.097-.823.49-1.008.199-.527.319-.48.29-1.009.032-1.008.339-1.00',
    '8.158-1.008.003-.551.185-.212 1.008.432 1.008-.677.728-1.008-.585-1.008.085-1.008.273-.706.506-.302.446-1.008-.272-1.008-.046-.334.88-.674.416-1.009-.343-.105-.073-.903-.247-.741.247.214 1.007.368 1.008.16.383.347.625-.348.378-.694-.378-.314-.123-1.008-.269-.71-.616-.298-.137-1.008-.02-.105.157-.903.879-.183.129-.825.78-1.008-.323-.657-.457-.351-.106-1.008-.014-.526.12-.482.52-.145.487-.51 1.008h-.793l-.568-.2-.95-.808-.058-.037-.166.037-.843.482-.737.526h-.705l.434-.306.824-.702.184-.12 1.009-.23.54.35.468.399 1.008.215.425-.614.209-1.007.374-.232 1.008-.201 1.008.028 1.008.14.72.265.288.092.098-.092.91-.643.375-.365.633-.943 1.008.42 1.008.36.737.163.271.047.045-.047-.045-.12-.347-.888-.085-1.007.157-1.008.275-.067.284.067.724.302 1.008.265 1.009-.35.123-.217.885-.337 1.008-.172.805-.498.203-.233.799-.775.209-.182 1.008-.003 1.008-.208.67-.615.338-.426 1.008-.14 1.008.126 1.008-.34.462-.227.546-.264 1.008-.228.76-.516.248-.116 1.008-.464 1.008-.32 1.009.317 1.008-.217.239-.208.769-.547.44-.46.568-.36 1.008-.523.142-.125.866-.654.41-.354.598-.258 1.008-.14 1.008-.385.358-.224.65-.78.244-.228.764-.373 1.008-.21 1.008-.38.106-.044.902-.15 1.008-.162 1.009-.148 1.008-.22.76-.328.248-.123 1.008-.703.23-.182.778-.476 1.008-.425.15-.106.858-.352 1.008-.217.755-.439.253-.264 1.008-.474.874-.27-.874-.55-.618-.457.618-.206 1.008-.414.479-.388.419-1.007.11-.1.561-.908.447-.12 1.008-.157 1.008-.313 1.008-.254.402-.164.435-1.007.172-.095.872-.913.136-.077 1.008-.335.876-.596.132-.077 1.008-.463.538-.467.47-.309.859-.699.149-.103 1.008-.587.299-.318.71-.354.83-.653.177-.14 1.008-.538 1.008-.179.211-.15-.21-.267-.59-.741.59-.36.56-.648.447-.376.952-.632.056-.11.745-.897.252-1.008.011-.01 1.009-.744.228-.254.78-.514.494-.493.514-.434.642-.574.366-.373.722-.635.286-.249.922-.758.086-.086.774-.922.234-.254.659-.753.349-.54.444-.468-.444-.478-1.008.063-.571.415-.437.225-1.008.513-.403.27-.605.32-1.008.26-.783.427-.225.1-1.008.45-.848.458-.16.072-1.009.33-1.008.173-.326-.575.326-.153 1.008-.359.548-.496.46-.247 1.009-.55.21-.21.79',
    '8-.418.72-.59.288-.192 1.008-.445.493-.37.515-.315 1.008-.61.432-.083.554-1.008.022-.022 1.008-.886.06-.1.948-.728.268-.28.74-.554 1.008-.358.134-.095.874-.562.75-.445-.75-.832-.088-.176.088-.112 1.008-.823.024-.073.984-.513.465-.494.543-.456.548-.552.46-.646.317-.362-.317-.949-.088-.058-.92-.666-1.008.082-1.008-.032-.54-.392.47-1.008.07-.072.883-.935.125-.16.767-.848.241-.332.691-.675.317-.237.772-.771.237-.222.619-.786.389-.379.5-.628.508-.726.228-.282-.224-1.008-.004-.01-.225-.997.225-.32 1.008-.583.06-.105.114-1.008-.174-.057-.063.057-.945.653-.8.355-.208.14-.248-.14.248-.288.262-.72.746-.811.181-.196.795-1.008.032-.048.642-.96.366-.502.424-.505-.424-.57-.479.57-.53.39-.893.618-.114.077-.284-.077.2-1.008.084-.09.643-.918.365-.484.375-.523.633-.9.095-.108.372-1.008-.467-.714-.911.714-.097.07-.114-.07-.089-1.007.203-.245.426-.763.363-1.007-.79-.383-.372.383-.635.585-.5.422-.508.497-.778.51-.23.215-.468-.214.468-.624.159-.384.775-1.007.074-.085.724-.923.284-.288.571-.72.437-.608.293-.4.677-1.007.038-.084.477-.924.53-.726.219-.281-.114-1.008-.104-.162-.4.162-.608.396-.942.612-.066.021-1.008.474-.744-.495-.064-1.008.714-1.008.094-.103.493-.904.515-.708.156-.3.287-1.007-.443-.152-.282.152-.726.665-.514.342-.494.226-.72-.226.412-1.007.308-.357.603-.651-.603-.603-.842-.405.454-1.007.388-.162 1.008-.435 1.008-.244.14-.167-.14-.246-.926-.762-.082-.06-.58.06-.428.041-1.008.607-.557.36-.452.662-1.008-.108-.388-.554-.388-1.008.776-.43.97.43.038.015.007-.015 1.002-.647.278-.36.73-.823.15-.185-.15-.554-1.008-.1-1.009-.231-.17-.123.17-.095.433-.912.08-1.008-.32-1.007-.193-.194-.349-.814.18-1.008.17-.207.423-.8-.398-1.008-.026-.019-.021.019-.88 1.008-.107.085-1.008.2-.095-.285.095-.429.145-.579.863-.986.02-.022-.02-.075-.373-.932-.39-1.008.034-1.007-.279-.837-.05-.171.05-.061.107.06.901.401 1.008-.388.008-.012.449-1.008-.457-.304-1.008.088-.494-.791.423-1.008.071-.857.03-.15-.03-.051-1.008-.55-.174-.407.145-1.008.03-.143.741-.865.266-.372.265-.635.1-1.008.298-1.007.106-1.008-.384-1.008-.27-1.007-.115-.4-1.008-.35-.155-.258zm7',
    '.926 11.084.139.655.11-.655-.11-.232zm-3.927 3.023.034.086.06-.086-.06-.086zm2.802 6.046.256.475.416-.475-.416-.222zm-.808 1.007-.278 1.008.334.21.21-.21-.031-1.008-.18-.076zm-1.215 2.016.263.619.192-.62-.192-.309zm.208 4.03.055.114.138-.114-.138-.145zm.003 11.084.052.082.109-.082-.11-.067zm2.978 2.015-.28 1.008.378.358.483-.358.48-1.008-.963-.133zm-1.197 2.016-.721.983-.018.024-.582 1.008.6.25.28-.25.728-.999.013-.009.396-1.007-.41-.43zm1.138 1.007.157.105.095-.105-.095-.9zm-1.16 1.008.309.727.315-.727-.315-.423zm-2.172 1.008.465.25.272-.25-.272-.627zm-.728 1.007.185.108.11-.108-.11-.243zm3.005 0 .204.472.432-.472-.432-.432zm.047 4.03.157.748.397-.747-.397-.223zm.95 1.008.215.132.118-.132-.118-.329zm-2.044 1.008.243.085.115-.085-.115-.509zm2.022 2.015.237.435.35-.435-.35-.273zm-2.146 1.008.367.422.514-.422-.514-.475zm-.933 1.007.292.256.37-.256-.37-.317zm-18.92 28.214.058.171 1.009.074.54-.245-.54-.354-1.009.323zm-1.532 1.008.582.116.366-.116-.366-.148zm23.768-68.877.222.358-.222.716-.28-.716zm-28.226 2.062.05.311.048 1.008-.098.814-.12-.814.064-1.008zm-1.008 3.954.406.388.271 1.007-.677.64-.256-.64-.116-1.007zm5.04 1.216.032.18-.032.077-.043-.078zm-4.032 1.206.33.988-.33.528-.126-.528zm30.242.975v1.401l-.248-.38.235-1.008zm-1.008 3.641.134.403-.134.317-.153-.317zm-33.266.993.088.418.112 1.007-.2.396-.244-.396-.05-1.007zm3.024 1.292.033.133-.033.104-.016-.104zm-2.016 1.712.098.437-.098.516-.128-.516zM67.54 39.278l.017.02-.017.015-.018-.015zM125 38.7v1.339l-.403-.741zm-56.452 1.589.016.016-.016.018-.015-.018zm11.09 1.138.169.894-.17.377-.34-.377zm-24.194 4.717 1.008.162.14.045-.14.118-1.008.158-.267-.276zm16.129 3.787.338.45-.338.312-.23-.311zm-7.057 1.166.485.292-.485.158-.435-.158zm4.032 1.102.066.198.765 1.008-.83.436-.335-.436-.025-1.008zm-.036 1.206.036.046.09-.046-.09-.133zm1.044.419.124.588-.124.288-.187-.288zm-9.072 3.333.175.278-.175.23-.53-.23zm58.468 1.998 1.001.295-1.001.212-.452-.212zm3.024 1.107.439.196-.202 1.008-.237.236-.79-.236.593-1.008zm-61.492 2.04.015.171-.015.02-.022-.02zm60.484-.69.337.861',
    '-.337.353-.536-.353zm-1.008 1.29.394.579-.394.394-.464-.394zm-66.533 3.19.106.412.028 1.007-.02 1.008-.114.288-.119-.288-.154-1.008-.018-1.007zm-13.104.923.403.496-.403.185-.196-.185zm1.008 1.141.32.363-.32.181-.16-.18zm-8.065 1.17.059.2-.059.075-.044-.074zm1.008 1.31.182.906-.182.363-.151-.363zm1.008 1.791.101.123.225 1.007-.326.47-.217-.47-.046-1.007zm8.065 5.675.192.493-.192.493-.157-.493zm8.064.134.021.36-.02.15-.031-.15zm60.484.286.09.073-.09.101-.22-.1zm-68.548 2.754.248.342-.248.292-.237-.292zm53.427 5.317 1.008-.254.567.317-.567.175-1.008-.09-.097-.085zm-64.516 1.344.41.735-.155 1.007-.255.811-.198-.81-.151-1.008zm64.516 2.739.05.011-.05.02-.026-.02zm-88.71 12.489.156.621-.155.062-.07-.062zm1.009 1.133.155.496-.155.283-.262-.283zm32.258 18.547 1.008-.031.31.117-.31.35-1.008.088-.342-.438z" clip-path="url(#p0dbbb3483e)" style="fill:#fff;fill-opacity:.22"/><path d="m106.855 1.005 1.008-.45.53-.555h3.097l.405.254.42-.254h2.449l.155.259 1.008.35.116.399.269 1.007.384 1.008-.106 1.008-.298 1.007-.1 1.008-.265.635-.266.372-.742.865-.03.143-.144 1.008.174.407 1.008.55.03.05-.03.151-.071.857-.423 1.008.494.79 1.008-.087.457.304-.45 1.008-.007.012-1.008.388-.9-.4-.108-.061-.05.06.05.172.28.837-.035 1.007.39 1.008.373.932.02.075-.02.022-.863.986-.145.58-.095.428.095.285 1.008-.2.108-.085.879-1.008.021-.019.026.019.398 1.008-.424.8-.17.207-.179 1.008.35.814.193.194.319 1.007-.08 1.008-.433.912-.17.095.17.123 1.009.232 1.008.099.15.554-.15.185-.73.823-.278.36-1.002.647-.007.015-.037-.015-.97-.43-.777.43.388 1.008.388.554 1.008.108.452-.662.557-.36 1.008-.607.428-.04.58-.062.082.061.926.762.14.246-.14.167-1.008.244-1.008.435-.388.162-.454 1.007.842.405.603.603-.603.65-.308.358-.412 1.007.72.226.494-.226.514-.342.726-.665.282-.152.443.152-.287 1.007-.156.3-.515.708-.493.904-.094.103-.714 1.008.064 1.008.744.495 1.008-.474.066-.021.942-.612.609-.396.399-.162.104.162.114 1.008-.218.281-.53.726-.478.924-.038.084-.677 1.008-.293.399-.437.608-.571.72-.284.288-.724.923-.074.085-.775 1.007-.16.384-.467.624.468.214.23-.214.778',
    '-.51.507-.498.5-.422.636-.585.373-.383.79.383-.364 1.007-.426.763-.203.245.089 1.007.114.07.097-.07.91-.714.468.714-.372 1.008-.095.109-.633.899-.375.523-.365.484-.643.917-.085.09-.199 1.009.284.077.114-.077.894-.617.53-.391.478-.57.424.57-.424.505-.366.503-.642.96-.032.047-.795 1.008-.181.196-.746.811-.262.72-.248.288.248.14.207-.14.8-.355.946-.653.063-.057.174.057-.114 1.008-.06.105-1.008.583-.225.32.225.998.004.01.224 1.007-.228.282-.508.726-.5.628-.39.38-.618.785-.237.222-.772.771-.317.237-.69.675-.242.332-.767.849-.125.159-.883.935-.07.072-.47 1.008.54.392 1.008.032 1.008-.082.92.666.088.058.317.95-.317.361-.46.646-.548.552-.543.456-.465.494-.984.513-.024.073-1.008.823-.088.112.088.176.75.832-.75.445-.874.562-.134.095-1.008.358-.74.555-.268.28-.948.727-.06.1-1.008.886-.022.022-.554 1.008-.432.082-1.008.61-.515.315-.493.371-1.008.445-.288.192-.72.59-.798.418-.21.21-1.009.55-.46.247-.548.496-1.008.359-.326.153.326.575 1.008-.173 1.008-.33.161-.072.848-.457 1.008-.451.225-.1.783-.427 1.008-.26.605-.32.403-.27 1.008-.513.437-.225.57-.415 1.009-.063.444.478-.444.467-.349.54-.66.754-.233.254-.774.922-.086.086-.922.758-.286.25-.722.634-.366.373-.642.574-.514.434-.494.493-.78.514-.228.254-1.009.743-.011.011-.252 1.008-.745.896-.056.111-.952.632-.447.376-.56.649-.59.359.59.741.21.266-.21.151-1.009.179-1.008.538-.177.14-.83.653-.71.354-.299.318-1.008.587-.15.103-.858.7-.47.308-.538.467-1.008.463-.132.077-.876.596-1.008.335-.136.077-.872.913-.172.095-.435 1.007-.402.164-1.008.254-1.008.313-1.008.157-.447.12-.56.909-.111.099-.419 1.007-.479.388-1.008.414-.618.206.618.457.874.55-.874.27-1.008.474-.253.264-.755.439-1.008.217-.858.352-.15.106-1.008.425-.779.476-.23.182-1.007.703-.249.123-.76.327-1.007.221-1.009.148-1.008.162-.902.15-.106.044-1.008.38-1.008.21-.764.373-.244.228-.65.78-.358.224-1.008.386-1.008.14-.597.257-.411.354-.866.654-.142.125-1.008.524-.568.359-.44.46-.77.547-.238.208-1.008.217-1.009-.316-1.008.319-1.008.464-.247.116-.76.516-1.009.228-.546.264-.462.228-1.008.339-1.008-.127-1.008.14-.339.427-.67.615-1.0',
    '07.208-1.008.003-.21.182-.798.775-.203.233-.805.498-1.008.172-.885.337-.123.216-1.009.351-1.008-.265-.724-.302-.284-.067-.275.067-.157 1.008.085 1.007.347.888.045.12-.045.047-.27-.047-.738-.164-1.008-.358-1.008-.42-.633.942-.375.365-.91.643-.098.092-.288-.092-.72-.265-1.008-.14-1.008-.028-1.008.2-.374.233-.209 1.007-.425.614-1.008-.215-.469-.399-.54-.35-1.008.23-.184.12-.824.702-.434.306h-1.037l-.397-1.008-.148-.194-1.008-.269-1.008.24-1.008.17-1.008-.576-.615-.378-.393-.361-.537.36-.471.293-.25-.292-.758-.72-.354-.288-.654-.411-.964-.597-.044-.03-1.008-.567-.22-.41.22-.84.024-.168-.024-.277-.15-.73-.22-1.008-.638-.445-1.008.066-1.009.08-1.008.126-1.008.153-.129.02-.879.277-1.008.138-.545-.415-.463-.23-.7-.778.06-1.007.64-.607 1.008-.223 1.004-.178.004-.002 1.008-.402 1.008-.212 1.008-.174.611-.218.398-.353.276-.654-.276-.327-.877-.68-.132-.549-.475-.46-.533-.456-.585-.551-.423-.872-1.008.09-.49-.226.465-1.007.025-.026 1.008-.035.947-.947-.947-.857-.211-.15.211-.318.141-.69-.14-.314-.493-.694.492-.898 1.008.387.195-.497-.162-1.007.207-1.008-.24-.943-.028-.064-.866-1.008-.114-.35-.4-.658-.608-.872-.27-.135.27-.114 1.008-.198 1.008.27.241.042.767.215.864-.215.145-.078.698-.93.31-.155.23.155.778.447 1.008-.192.892-.255-.345-1.008.46-.249.543.25.466.192.076-.193-.076-.255-.458-.752-.536-1.008-.014-.039-.314-.969.314-.76.735.76.273.12 1.008.596 1.008.113.962-.829-.962-.858-.123-.15-.258-1.007.381-.315.47.315.538.31 1.008.314.283-.624.066-1.007-.349-.776-.082-.232-.2-1.008.282-.78.13-.227.465-1.008.413-.563.129-.445-.083-1.007-.046-.078-.256-.93.101-1.008.155-.264 1.008-.284.357.548.177 1.008-.075 1.008.012 1.007-.103 1.008-.131 1.008-.237.441-.485.566-.18 1.008.35 1.008.125 1.007.19.175.229-.175.767-1.007.012-.05.11-.958.281-1.008.528-1.007.09-.084.84-.924.11-1.008.057-.348.72-.66.103-1.007.185-.157.118.157.034 1.008.857.6.24.407.087 1.008.68.831.713-.831.296-.443.232-.565.408-1.007.214-1.008.154-.351.288-.657.33-1.007.332-1.008.058-.123.578-.884.43-.406.257.406.225 1.007-.208 1.008-.274.535-.16.472.16.452.584-.452.42',
    '4-.194.627-.813.381-.366.544-.642-.11-1.007.195-1.008-.103-1.008.238-1.007.244-.539.372-.469.629-1.008.007-.002.006.002.358 1.008-.19 1.008.245 1.007.335 1.008.254.399.559-.399.305-1.008.144-.516.163.516.225 1.008.485 1.008.135.238 1.008.748.007.021.503 1.008.467 1.007.031.052.048-.052.351-1.007.006-1.008-.367-1.007-.038-.622-1.008-.364-.008-.022-.055-1.008-.123-1.007.186-.289.187.289-.073 1.007.894.944.63-.944-.32-1.007-.31-.698-.442-.31-.566-.188-.459-.82-.155-1.007-.394-.688-.18-.32.18-.487.32.487.688.393.335.615.22 1.007.453.826.443.182.566.203.506.805.502 1.002 1.008-.592.053-.41-.053-.718-.03-.29.03-.064.314-.944.003-1.007.037-1.008-.002-1.007.656-.535.818-.473-.818-.316-.58-.692-.428-.855-.149-.152.149-.096.399.096.609.168 1.008.507.457.332-.296 1.008-.157 1.008.504 1.007.5.704.747.304.26.08.446.927.563.938.508-.938-.088-1.007-.064-1.008-.168-1.007-.188-.799-.349-.21.349-.126.246.127.762.158 1.008-.114.078-.044.021-1.008.055-1.007-.154-.365-.272-.643-.393-1.008.11-1.007-.25-1.008-.203-.46-.234-.548.234-.28 1.008.277.004.003.775 1.008.23.332.727.676.28.364.715.643.293.12.132-.12.297-1.007.14-1.008.127-1.008-.033-1.007.224-1.008.121-.248.334-.76.124-1.007-.458-.605-.474-.403-.534-.453-1.008-.425-.155-.13-.853-.74-.37-.267.37-.39 1.008.176.379.214.63.347 1.007.09.782-.437.226-.198.058.198.412 1.008.538.477.316.53.693.986.044.022.964.38.619.628.389.42.52.587.488.656.61-.656-.202-1.007-.408-.95-.044-.058-.733-1.008-.231-.279-.7-.728-.308-.51-.44-.498-.49-1.008.93-.269.33.27.678.368.729.639.279.194.592.814.416.514.915-.514-.738-1.008-.177-.326-.586-.682-.422-.572-.29-.435-.718-.822-.174-.186-.703-1.008-.131-.469-.394-.538.394-.27.444.27.564.18 1.008.307.483.52.525.596.334-.596-.334-1-.008-.007.008-.005 1.008-.462.524.467.484.207.761.8.247.203.831.805.177.177.303-.177-.13-1.008-.173-.253-.682-.754-.326-.347-.973-.66-.035-.07-.792-.938.792-.634.713-.374-.713-.831-.096-.177.096-.264 1.008-.177 1.008-.196.24-.37-.24-.21-.917-.798.052-1.008.865-.082.1.082.908.606 1.008.118 1.008.1.262.184.746.606.325-.606-.325-.783-.',
    '156-.225-.36-1.007-.192-1.008-.3-.69-.244-.317-.764-.828-.094-.18.094-.128.998-.88.01-.017 1.008-.61.713.627.295.476.423.532-.209 1.008.794.852.14.155.869.62.255-.62-.255-.766-.266-.241-.228-1.008-.084-1.008-.068-1.007.646-.604 1.008.559.016.045.69 1.007.302.411.635.597.373.387.456.62.552.923.084.085.924.843.244.165.712 1.007.052.041.094-.04.152-1.008-.246-.585-.31-.423-.452-1.007-.246-.429-.425-.58-.51-1.007-.073-.1-.677-.907-.331-.567-.308-.441-.7-.974-.078-.034.078-.197 1.008-.026.44.223.568.376 1.008.218.34.414.427 1.008.24.606.256.401.609 1.008.144.186.254-.186.181-1.008-.204-1.007.428-1.008.349-.322.109-.686-.109-.278-.63-.73-.146-1.007-.186-1.008-.046-.149-.324-.858-.135-1.008-.034-1.007.493-.582.34.582.668.605.361.402.633 1.008.014.013.793.994.215.27.629.738.364 1.008.015.025.144-.025.407-1.008-.359-1.008-.178-1.007.152-1.008-.166-.992-.002-.015-.07-1.008-.032-1.008-.153-1.007-.418-1.008-.333-.486-.394-.522.394-.428.704-.58.054-1.007.034-1.008.084-1.007.132-.109.2.109.808.404.716-.404.292-.394.153.394.408 1.007.447.876.052.132-.015 1.008.643 1.007.328.986.008.022 1 .724.657-.724.352-.749.749.749.259.353.43-.353.396-1.008-.316-1.007-.209-1.008-.301-.798-.087-.21-.28-1.007-.216-1.008.121-1.007.333-1.008-.334-1.008.192-1.007.27-.057.033.057.21 1.007-.198 1.008.532 1.008.184 1.007-.025 1.008.273.24.198-.24.02-1.008-.002-1.007.443-1.008.349-.602.892-.406.116-.032.232.032.605 1.008.17.462.48-.462-.371-1.008-.108-.323-.191-.684-.077-1.008-.097-1.008.014-1.007.084-1.008.267-.969.888.97.12.573.103-.574.905-.768.321.768.108 1.008.58 1.002.002.005.373 1.008.18 1.008.452.608.468.4.266 1.007.274.426.23-.426-.028-1.008-.202-.668-.28-.34-.18-1.007-.093-1.008-.176-1.007-.212-1.008-.067-.185-.208-.822.191-1.008.017-.038.386-.97.14-1.007.482-.98.01-.028.364-1.008.055-1.007.272-1.008.307-.63.35-.378.39-1.007.268-.715.305-.293.703-.731.173-.276.836-.669 1.008.088.906-.427.102-.095.744-.913.264-.2 1.008-.317 1.004-.49zm1.35.003-.342.22-1.008.377-.82.41-.188.177-1.008.633-.164.198-.23 1.008-.125 1.007-.471 1.008-.018.024-.009-',
    '.024-.313-1.008-.686-.935-.846.935v1.008l.301 1.007.289 1.008.256.739.105.269.15 1.007-.184 1.008-.071.161-.847.847-.161.172-.317.835-.065 1.008-.593 1.008-.034.028-.022-.028-.452-1.008-.237-1.008-.297-.763-.074-.244-.455-1.008-.361-1.008-.118-.705-.06.705-.27 1.008-.32 1.008-.156 1.007.342 1.008.464.712.202.296.209 1.007.446 1.008.151.032.773.975.235.353.477.655.086 1.008-.222 1.007-.34.419-.605-.419-.404-.11-.417-.897-.394-1.008-.197-.377-.605-.63.434-1.008-.786-1.008-.05-.046-.011.046-.162 1.008.088 1.007.084.807.22.201.27 1.008.1 1.007.18 1.008.238.372.51.636.115 1.007.383.85.154.158.327 1.007-.01 1.008-.47.074-.079-.074-.588-1.008-.342-.464-.597.464.145 1.008-.273 1.008-.283.47-.057.537.057.403.27.605-.27.403-.363.605-.645.496-1.008-.403-.067-.093-.34-1.008-.176-1.008-.425-.91-.048-.097-.44-1.008-.494-1.008-.026-.038-.448-.97-.408-1.007-.152-.263-.615-.744-.266-1.008-.127-.156-.194.156-.274 1.008.059 1.007.409.545.198.463.278 1.007.375 1.008.157.138.346.87.23 1.007.432.905.114.103.442 1.008.441 1.007.011.027.645.98.363.794.19.215-.19.856-.022.151-.986.783-.263-.783-.456-1.007-.289-.223-.288-.785-.177-1.008-.529-1.007-.014-.015-.326-.993-.231-1.008-.451-.776-.227-.231-.205-1.008-.46-1.008-.116-.178-.14.178-.578 1.008.086 1.008.297 1.007.335.414.292.594.163 1.008.313 1.007.24.393.277.615.201 1.008.179 1.007.35.419.238.589.1 1.007-.164 1.008-.173.17-.125-.17-.433-1.008-.45-.912-.075-.095-.313-1.008-.235-1.007-.385-.636-.946-.372.01-1.008-.072-.201-.109.201.07 1.008-.186 1.008.048 1.007.177.202.347.806.268 1.007.393.633.185.375-.084 1.008-.101.126-.144-.126-.864-.865-.158-.143-.324-1.008-.182-1.007-.344-.308-.666-.7-.342-.806-.857.806-.151.033-.026-.033-.3-1.007-.192-1.008-.49-.398-.266-.61-.365-1.007-.378-.838-.08-.17-.521-1.008-.407-.957-1.008.178-.3.78-.457 1.007.538 1.008.22.334.37.673.44 1.008-.058 1.008.255.765.058.242.085 1.008-.143.122-.342-.122-.666-.665-.109.665.11.475.232.532.17 1.008.245 1.008.03 1.007-.326 1.008-.352.51-.247-.51-.479-1.008-.282-.263-.447-.744-.56-.911-.117-.097-.782-1.008-.11-.137-.',
    '93-.87-.078-.125-.129.125-.198 1.007.209 1.008.118.242.333.766.434 1.007.241.279.339.729.37 1.008.3.438.243.57.202 1.007.28 1.008.282.564.125.443.187 1.008-.064 1.007-.248.322-.228-.322-.632-1.007-.148-.128-.453-.88-.198-1.007-.045-1.008-.312-.475-.785.475-.033 1.008-.19.257-.28-.257-.728-.195-.63-.813-.378-.511-.463-.497-.429-1.007-.116-.194-1.008-.299-.168.493.168.224.568.783.44.888.134.12.489 1.008.385.662.29.345.333 1.008.385.902.067.105.231 1.008-.298.319-.374-.319-.634-.517-.626-.49-.382-.46-.658-.548-.35-.321-.46-.687-.548-.893-.107-.114-.901-.942-.084-.066-.696-1.008-.228-.33-.956.33.386 1.008.038 1.008.308 1.007.224.506.183.502-.183.41-.967.597.967.685.158.323.766 1.008.084.144.738.863.27.39.302.618-.302.416-.341-.416-.667-.536-.75-.472-.258-.157-.63-.85-.378-.555-.41-.453.378-1.008-.342-1.007-.635-.567-.664-.44-.344-.354-.41.353.105 1.008.097 1.007.07 1.008.138.245.354.763-.122 1.007.284 1.008.492.573.29.435.348 1.007-.188 1.008-.45.276-.211-.276-.759-1.008-.038-.026-.753-.981-.255-.457-.684-.551.684-.81.312-.198-.312-.23-.495-.777-.513-.446-1.008.32-.273.126.273.116.714.891-.187 1.008-.527.403-.354-.403-.654-.35-1.008.061-.212.289.212.254.618.754.39.66.368.347-.368.39-.694-.39-.314-.131-.706.131.674 1.008.032.035.664.972.344.73.138.278.132 1.008-.27.502-.585-.502-.423-.269-.74-.739-.268-.26-.913-.748-.095-.099-.45.1.173 1.007.277.516.29.492-.29.294-.883-.294-.125-.05-1.008-.492-.496-.466-.512-.546-.481.546.48.532.447.476.562.691.23.316.547 1.008.23.297.42.71.578 1.008-.718 1.008-.28.338-.189-.338-.818-.744-.285-.264-.676-1.007-.047-.065-1.008-.427-.166.492.166.172.692.835.316.424.558.584.272 1.008.178.421.277.586.012 1.008-.215 1.007-.074.072-.166-.072-.842-.483-.715.483-.155 1.008-.138.16-.127-.16-.881-.832-.144-.176-.544-1.007-.32-.495-.236-.513-.226-1.007-.351-1.008-.196-.295-.928-.713-.08-.069-.138.07.027 1.007.111.472.229.536.105 1.007.25 1.008.208 1.007.216.538.123.47.106 1.008.04 1.007.017 1.008-.06 1.008-.226.418-.518-.418-.49-.582-.501-.426-.507-.949-1.008.879-.244.07-.764.66-.354-.66-.654-.57',
    '-.44.57.346 1.008.094.195.708.812.3.26.31.748.064 1.008.343 1.007.291.052.362.956.05 1.007-.137 1.008-.254 1.008-.02.042-.03-.042-.333-1.008-.236-1.008-.215-1.007-.195-.65-1.008.347-.513-.705-.495-.622-.466-.385-.542-.192-.185.192-.052 1.007.14 1.008.097.464.137.543.17 1.008-.085 1.008-.222.585-1.008-.031-.817-.554-.191-.33-1.008.197-.12.133.12.165.561.842-.252 1.008-.31.537-.906.47-.101.024-.059-.023-.95-.633-1.007.359-1.008.22-.23.054-.324 1.007-.096 1.008-.204 1.007-.154.424-.543.584-.466.26-.2-.26-.73-1.008-.078-.105-.749-.902-.259-.305-.66-.703-.348-.643-.299.643-.078 1.008-.194 1.007-.437.749-.13.26-.335 1.007-.165 1.007-.378.92-.048.088-.96.996-.773-.996-.235-.476-.39-.532-.162-1.007-.456-.786-1.008.327-.572.459-.436.806-.196.201-.812.952-.033.056-.458 1.008-.457 1.007-.06.09-.52.918-.2 1.008-.288.313-.502-.313-.506-.807-.74.807-.269.806-1.008-.068-.108.27-.424 1.007-.476.54-1.008-.386-1.008-.022-.884-.132-.124-.095-.035.095-.973.828-.156.18-.088 1.007-.764.845-.153.163-.855.837-.578-.837-.43-.425-.514.425.101 1.007-.175 1.008-.42.571-.315.437-.693.403-1.008.323-1.008-.139-.314.42.304 1.008-.333 1.008-.384 1.007-.281.61-1.008-.289-.98-.32-.01-1.008-.019-.03-.011.03.003 1.007-.037 1.008.045.174.133.833-.003 1.008-.13.359-.648.649.114 1.007.407 1.008-.027 1.008.154.18.415.827.206 1.008-.153 1.007.083 1.008.458.356.552.652-.359 1.007-.193.157-1.009.32-1.008.22-.887.311-.12.053-1.009.236-1.008.147-1.008.277-.31.295-.118 1.007.428.477 1.008.492 1.008-.134 1.008-.131 1.008-.127 1.008-.125 1.009-.118 1.008-.134 1.008.648.109.16.178 1.008.081 1.007.094 1.008.546.422.874.585.134.083 1.008.647.337.278.67.643.815-.643.194-.173.207.173.801.747.369.26.64.369 1.007-.294 1.008.001 1.008.08.648.852.36.72 1.008-.586.157-.134.851-.551 1.009-.238 1.008.604.87-.822.138-.113 1.008-.619 1.008-.14 1.008.048.58-.184.428-.183 1.008.058.979-.883.03-.035 1.007-.642 1.008.224.35-.554.117-1.008.541-.294 1.008-.14 1.008.156 1.008.165 1.009-.395 1.008-.32.47-.18-.47-.438-1.008-.52-.036-.05.036-.048.594-.959.414-.223 1.008-.292 1.008-.05',
    '5 1.008.382.47.188.538.266.759-.266.186-1.007.063-.052 1.008-.136 1.008.105.226.083.782.214.498-.214.51-.406 1.008-.451.343-.151.665-.28 1.008-.537.268-.19.74-.293 1.008.007 1.009.25 1.008-.52.601-.452.407-.284 1.008-.57.274-.154.734-.678.484-.33.524-.172 1.008-.401 1.008-.187.52-.247.488-.413.538-.595.47-.741 1.008-.26.04-.006.968-.11 1.008-.212 1.008-.126 1.008-.153 1.009-.216.588-.191.42-.166 1.008-.563.37-.279.638-.628.697-.38.31-.08 1.009-.258 1.008-.474.99-.195.018-.021.852-.987-.852-.407-1.008-.534-.202-.066.202-.029 1.008-.205 1.008-.14 1.008-.361.428-.273-.428-.897-.055-.11.055-.032 1.008-.447.555-.53.453-.175 1.008-.252 1.008-.221.84-.359.168-.108.95-.9.058-.04 1.009-.568.38-.399.628-.355 1.008-.403.367-.25.64-.375.971-.632.038-.033 1.008-.661.385-.314.623-.43.745-.578.263-.211 1.008-.54.326-.256.682-.537.712-.47-.048-1.008.344-.237 1.008-.69.07-.081.938-.788.332-.22.528-1.007.148-.122.66-.886.348-.32.787-.688.222-.285 1.008-.628.094-.094.914-.771.265-.237.743-.758.283-.25.725-.631.457-.376.55-.556.38-.452.629-.683.284-.324-.284-.89-1.008.434-.73.456-.278.289-1.008.485-.696.233-.312.195-1.008.354-1.008.43-.054.029-.955.427-1.008.374-.456.206-.552.24-1.008.297-1.008.005-.626-.542.626-.406 1.008-.57.032-.031.976-.458.994-.55.014-.01 1.008-.538.704-.46.305-.212 1.008-.53.323-.265.685-.456.9-.552.108-.092 1.008-.625.447-.29.56-.387.585-.62.424-.445.592-.564.416-.423.675-.584.333-.273.906-.735.102-.126.861-.881.147-.305.32-.703.688-.872.156-.136.852-.733.706-.274.302-.217 1.008-.7.091-.091-.09-.41-.197-.598-.812-.843-1.008.33-1.008-.029-1.008-.176-.598-.29.598-.975.014-.032.994-.791.167-.217.841-.878.122-.13-.122-.309-1.008-.077-.204-.62.204-.171 1.008-.582.133-.255.875-.534.443-.474.565-.418.638-.59.37-.339 1.009.147.892-.815.116-.07.498-.938-.498-.301-1.008-.233-1.009.135-.625.399-.383.117-1.008.385-.66.506-.348.15-.833-.15.833-.833.101-.175.907-.524.545-.484.463-.842.083-.165.925-.574.542-.434.467-.364.602-.644.406-.333.628-.674.38-.372.537-.636-.537-.512-1.008.458-.116.054-.892.192-1.009.376-.44.44-.568.',
    '169-1.008-.02-.49-.15.373-1.007.117-.176.512-.831.183-1.008.313-.446.51-.562.498-.455 1.009-.238.227-.314.78-.78.233-.228.186-1.008-.418-.836-1.008.813-.116.023-.893.521-1.008.326-1.008-.746-.08-.1.08-.034.78-.974.14-1.008-.92-.98-.022-.027-.408-1.008-.578-.788-.605-.22.555-1.007-.958-.403-1.008-.32-.311-.285-.367-1.008-.33-.907-.029-.1-.7-1.008.348-1.008.381-.57.175-.437-.037-1.008-.138-.174-.655.174-.353.079-.067-.079.05-1.007.017-.02.988-.988-.123-1.008-.052-1.007-.813-.958-.061-.05.061-.141.347-.867-.013-1.007-.05-1.008.596-1.008-.092-1.007-.788-.963-.015-.045.015-.201.124-.806.337-1.008.49-1.008.057-.057.512-.95-.044-1.008-.468-.78-1.008.27-.324-.498-.178-1.007.24-1.008.053-1.007-.006-1.008.175-1.008.04-.739.07-.268-.07-.18-.054-.828.054-.414.232-.594.382-1.007.043-1.008.19-1.008.161-.883.807-.124-.807-.161-.139-.847.14-.94.302-.067.494-1.008-.422-1.008-.266-1.007-.109-.066-1.008-.66-1.008.03zm4.628 0-.691 1.007.123 1.008.638.696 1.008-.31.332-.386-.016-1.008-.316-.836-.685-.171-.323-.04zm-1.176 4.03.238.873.219-.873-.219-.655zM94.702 19.145l-.063 1.008.12.814.097-.814-.049-1.008-.049-.31zm1.925 3.023.082 1.008.065.15.14-.15-.049-1.008-.09-.207zm-3.249 1.008.116 1.007.256.64.677-.64-.271-1.007-.406-.388zm4.06 1.007.072 1.008.272.508.377-.508-.217-1.008-.16-.323zm1.31 0 .042.078.032-.078-.032-.18zm-4.116 2.015.126.528.33-.528-.33-.988zM82.44 27.206l.222.763.396-.763-.396-.395zm7.992 4.03.051 1.008.244.396.2-.396-.112-1.007-.088-.418zm3.303 1.008.016.104.033-.104-.033-.133zm-2.128 2.016.128.516.098-.516-.098-.437zm28.199 7.053-.853.975-.044.033-.964.81-.29.197-.598 1.008.191 1.008.697.147.116-.147.87-1.008.022-.008.98-1 .028-.039.562-.968.446-.373.451-.635-.451-.77-1.008.606zm-40.508 1.008.34.377.17-.377-.17-.894zm40.34 5.038.323.064.023-.064-.023-.23zm-48.295 3.023.23.31.339-.31-.338-.45zm-7.261 1.007.435.158.485-.158-.485-.292zm4.108 1.008.025 1.008.334.436.831-.436-.765-1.008-.066-.198zm52.505 1.008.274.293.196-.293-.196-.19zM69.37 54.412l.187.288.124-.288-.124-.588zm-11.992 2.015.083.116.144-.116-.144-.078',
    'zm2.576 1.008.53.23.176-.23-.175-.278zm58.96 1.008.039.02.022-.02-.022-.025zm-.413 1.007.452.212 1.001-.212-1.001-.295zm-58.038 3.023.022.02.015-.02-.015-.171zm-7.326 4.03.018 1.008.154 1.008.12.288.113-.288.02-1.008-.028-1.007-.106-.412zm4.15 0 .174.421.215-.42-.215-.358zM42.32 76.58l.011 1.008.008.035.013-.035.032-1.008-.045-.046zm.87 2.015.157.493.192-.493-.192-.493zm8.191 0 .03.152.021-.152-.02-.359zm-8.27 3.023.236.292.248-.292-.248-.342zm-10.134 3.023.144 1.008.145.1.097-.1.117-1.008-.214-.305zm63.7 2.015.097.085 1.008.09.567-.175-.567-.317-1.008.254zm-64.768 2.016.15 1.007.2.811.254-.81.156-1.008-.41-.735zM13.026 98.748l.079.133.096-.133-.096-.07zm-5.03 5.038.069.062.155-.062-.155-.621zm.815 1.008.262.283.155-.283-.155-.496zM40.99 122.93l.342.438 1.008-.089.31-.349-.31-.117-1.008.03zm81.995-112.08.11.233-.11.655-.139-.655zm-14.113 9 .22.302-.22.172-.027-.172zm-8.065 7.48.131.883-.13.37-.397-.37zm-16.129 9.636.103.315-.103.592-.278-.592zM71.573 39.13l.45.168-.45.218-.226-.218zm14.112 1.377.219.806.043 1.008-.262.348-.145-.348-.18-1.008zm-25.201 2.751.324.07.497 1.008-.47 1.008.284 1.007-.635.066-.144-.066-.864-.791-.371-.216.37-.433.461-.575.223-1.008zm62.5-.83.095.9-.095.105-.157-.105zM62.5 44.13l.4.206-.4.18-.8-.18zm59.476-.217.315.423-.315.727-.309-.727zm-66.532 4.086 1.008.106.751.261.257.295.891.713-.891.27-1.008-.268-.003-.002-1.005-.632-.983-.376zm-5.04 2.945 1.007.023 1.008.07.551.352.457.266.72.742.288.454.53.554.479.746.288.261-.288.416-.45-.416-.559-.285-1.008-.616-.106-.106-.902-.534-.733-.474-.275-.334-1.008-.307-.614-.367zm1.924 1.453.091.059 1.008.234.186-.293-.186-.191-1.008-.064zm3.116-1.175 1.008-.095 1.008.187.088.075.92.487.681.52-.681.582-1.008-.232-.596-.35-.412-.488-1.008-.368-.21-.15zm67.54-.162.118.33-.118.131-.215-.132zm-63.508 2.336.021.009-.021.004-.006-.004zm38.306.843.27.173-.27.806-.06-.806zm25.202-.1.35.273-.35.435-.237-.435zm-75.605.935 1.008.11.27.236.738.535.758.472.25.486.333.522-.333.339-.494-.339-.514-.271-1.008-.5-.237-.237-.771-.937-.07-.07zm64.516-.144 1.008.149.555.',
    '34-.555.262-1.008.595-.343-.856zm-11.089 1.311.404.186.605.454.633.554-.012 1.008-.601 1.007-.02.017-1.009.353-.37-.37.194-1.007.176-.706.121-.302-.12-.201-.484-.807zm-34.274.744.156.45-.156.125-.13-.125zm-11.088 1.068.323.39-.323.946-.458-.946zm-11.09.847 1.009.48.11.07-.11.523-1.008-.066-.412-.457zm50.404.335.729.215.28.242.906-.242.101-.201.037.201.971.971.023.037.317 1.008-.34.388-.777-.388-.23-.116-.147.116.146.806.045.201-.045.037-.562.97-.311 1.009-.135.08-1.008.658-.317-.738-.691-.88-1.008.043-.082-.171.082-.19 1.008.09 1.008-.486.258-.422-.258-.421-.46-.586-.04-1.008.392-1.008zm17.137 7.186.363.083-.363.272-.151-.272zm-1.008.687.588.403-.588.355-.623-.355zm-2.016 1.133.66.278-.66.327-.962-.327zm-3.024 1.283 1.008-.361.973.364-.973.302-1.008-.293-.007-.01zM28.226 76.45l.053.13-.053.042-.02-.043zm-9.073 3.972.188.188.33 1.007-.328 1.008-.19.349-.21-.349-.332-1.008.296-1.007zm-.051 1.195.051.123.05-.123-.05-.125zm83.72 4.996.243.042-.242.081-.027-.08zm-8.064.942.675.108-.675.113-.563-.113zm7.057-.218.61.326-.61.337-.437-.337zm-2.017 1.076 1.008-.106.273.364-.273.21-1.008.371-.403-.581zm-1.008.828.616.437-.616.43-.806-.43zm-2.016 1.1 1.008-.26.22.605-.22.202-1.008.374-.655.432-.353.2-1.008.112-.969-.312.97-.282 1.007-.297.233-.429zm-.026.345.026.02.05-.02-.05-.011zm-67.514.917.37.09.044 1.008-.414.747-.52-.747.457-1.007zm58.468 1.08 1.008-.144 1.008.022.39.14-.39.12-1.008.088-1.008-.167-.076-.04zM10.08 99.556l.72.2-.72.343-.424-.343zM.2 110.84l-.201.136v-.516z" clip-path="url(#p0dbbb3483e)" style="fill:#fff;fill-opacity:.39"/><path d="m108.871.311 1.008-.028 1.008.66.11.065.265 1.007.422 1.008-.494 1.008-.303.067-.139.94.14.847.806.16-.807.125-.162.883-.189 1.008-.043 1.008-.382 1.007-.232.594-.054.414.054.828.07.18-.07.268-.04.74-.175 1.007.006 1.008-.053 1.007-.24 1.008.178 1.007.324.498 1.008-.27.468.78.044 1.008-.512.95-.058.057-.49 1.008-.336 1.008-.124.806-.015.201.015.045.788.963.092 1.007-.596 1.008.05 1.008.013 1.007-.347.867-.061.141.061.05.813.958.052 1.007.123 1.008-.988.987-.016.02-.051 1.008.06',
    '7.079.353-.079.655-.174.138.174.037 1.008-.175.436-.38.571-.349 1.008.7 1.008.03.1.329.907.367 1.008.311.285 1.008.32.958.403-.555 1.007.605.22.578.788.408 1.008.022.026.92.981-.14 1.008-.78.974-.08.033.08.101 1.008.746 1.008-.326.893-.52.116-.024 1.008-.813.418.836-.186 1.008-.232.227-.781.78-.227.315-1.009.238-.499.455-.509.562-.313.446-.183 1.008-.512.83-.117.177-.372 1.008.49.149 1.007.02.569-.17.44-.439 1.008-.376.892-.192.116-.054 1.008-.458.537.512-.537.636-.38.372-.628.674-.406.333-.602.644-.467.364-.542.434-.925.574-.083.165-.463.842-.545.484-.907.524-.1.175-.834.833.833.15.348-.15.66-.506 1.008-.385.383-.117.625-.399 1.009-.135 1.008.233.498.301-.498.939-.116.069-.892.815-1.009-.147-.37.34-.638.589-.565.418-.443.474-.875.534-.133.255-1.008.582-.204.17.204.62 1.008.078.122.31-.122.13-.84.877-.168.217-.994.791-.014.032-.598.976.598.29 1.008.175 1.008.03 1.008-.33.812.842.196.597.091.411-.09.091-1.009.7-.302.217-.706.274-.852.733-.156.136-.687.872-.32.703-.148.305-.86.88-.103.127-.906.735-.333.273-.675.584-.416.423-.592.564-.424.444-.584.62-.561.388-.447.29-1.008.625-.108.092-.9.552-.685.456-.323.265-1.008.53-.305.213-.704.459-1.008.538-.014.01-.994.55-.976.458-.032.032-1.008.569-.626.406.626.542 1.008-.005 1.008-.296.552-.24.456-.207 1.008-.374.955-.427.054-.029 1.008-.43 1.008-.354.312-.195.696-.233 1.008-.485.278-.29.73-.455 1.008-.434.284.89-.284.324-.628.683-.38.452-.551.556-.457.376-.725.631-.283.25-.743.758-.265.237-.914.77-.094.095-1.008.628-.222.285-.787.687-.349.321-.659.886-.148.122-.528 1.007-.332.22-.938.788-.07.08-1.008.69-.344.238.048 1.007-.712.471-.682.537-.326.256-1.008.54-.263.211-.745.578-.623.43-.385.314-1.008.661-.038.033-.97.632-.641.375-.367.25-1.008.403-.627.355-.381.4-1.009.566-.059.042-.949.9-.169.107-.839.359-1.008.22-1.008.253-.453.176-.555.529-1.008.447-.055.032.055.11.428.897-.428.273-1.008.361-1.008.14-1.008.205-.202.029.202.066 1.008.534.852.407-.852.987-.018.021-.99.195-1.008.474-1.008.257-.31.082-.698.379-.638.628-.37.279-1.008.563-.42.166-.588.19-1.009.217-1.008.153-1.00',
    '8.126-1.008.212-.967.11-.04.007-1.009.259-.47.741-.538.595-.488.413-.52.247-1.008.187-1.008.401-.524.172-.484.33-.734.678-.274.154-1.008.57-.407.284-.601.453-1.008.52-1.009-.25-1.008-.008-.74.292-.268.191-1.008.537-.665.28-.343.15-1.008.452-.51.406-.498.214-.782-.214-.226-.083-1.008-.105-1.008.136-.063.052-.186 1.007-.76.266-.537-.266-.47-.188-1.008-.382-1.008.055-1.008.292-.414.223-.594.959-.036.049.036.048 1.008.52.47.44-.47.18-1.008.32-1.009.394-1.008-.165-1.008-.156-1.008.14-.541.294-.117 1.008-.35.554-1.008-.224-1.008.642-.03.035-.978.883-1.008-.058-.428.183-.58.184-1.008-.048-1.008.14-1.008.62-.137.112-.871.822-1.008-.604-1.009.238-.85.551-.158.134-1.008.587-.36-.72-.648-.853-1.008-.08-1.008-.001-1.008.294-.639-.368-.369-.26-.8-.748-.208-.173-.194.173-.814.643-.671-.643-.337-.278-1.008-.647-.134-.083-.874-.585-.546-.422-.094-1.008-.08-1.007-.179-1.008-.11-.16-1.007-.648-1.008.134-1.009.118-1.008.125-1.008.127-1.008.131-1.008.134-1.008-.492-.428-.477.117-1.007.311-.295 1.008-.277 1.008-.147 1.008-.236.12-.053.888-.31 1.008-.22 1.009-.321.193-.157.359-1.007-.552-.652-.458-.356-.083-1.008.153-1.007-.206-1.008-.415-.828-.154-.18.027-1.007-.407-1.008-.114-1.007.648-.649.13-.359.003-1.008-.133-.833-.045-.174.037-1.008-.003-1.007.011-.03.02.03.01 1.007.979.321 1.008.289.281-.61.384-1.007.333-1.008-.304-1.008.314-.42 1.008.14 1.008-.324.693-.403.315-.437.42-.571.175-1.008-.1-1.007.513-.425.43.425.578.837.855-.837.153-.163.764-.845.088-1.008.156-.179.973-.828.035-.095.124.095.884.132 1.008.022 1.008.386.476-.54.424-1.008.108-.269 1.008.068.27-.806.739-.807.506.807.502.313.287-.313.2-1.008.52-.918.06-.09.458-1.007.458-1.008.033-.056.812-.952.196-.201.436-.806.572-.459 1.008-.327.456.786.162 1.007.39.532.235.476.773.996.96-.996.048-.087.378-.92.165-1.008.336-1.008.13-.259.436-.749.194-1.007.078-1.008.3-.643.348.643.66.703.258.305.75.902.077.105.73 1.008.2.26.466-.26.543-.584.154-.424.204-1.007.096-1.008.323-1.007.23-.054 1.009-.22 1.008-.36.949.633.059.023.1-.023.908-.47.309-.538.252-1.008-.561-.842-.12-.165.12-.133 1',
    '.008-.197.19.33.818.554 1.008.031.222-.585.085-1.008-.17-1.008-.137-.543-.097-.464-.14-1.008.052-1.007.185-.192.542.192.466.385.495.622.513.705 1.008-.347.195.65.215 1.007.236 1.008.333 1.008.03.042.02-.042.254-1.008.137-1.008-.05-1.007-.362-.956-.29-.052-.344-1.007-.065-1.008-.309-.748-.3-.26-.708-.812-.094-.195-.345-1.008.44-.57.653.57.354.66.764-.66.244-.07 1.008-.879.507.949.501.426.49.582.518.418.226-.418.06-1.008-.016-1.008-.04-1.007-.107-1.008-.123-.47-.216-.538-.208-1.007-.25-1.008-.105-1.007-.229-.536-.111-.472-.027-1.008.138-.069.08.07.928.712.196.295.351 1.008.226 1.007.236.513.32.495.544 1.007.144.176.881.832.127.16.138-.16.155-1.008.715-.483.842.483.166.072.074-.072.215-1.007-.012-1.008-.277-.586-.178-.421-.272-1.008-.558-.584-.316-.424-.692-.835-.166-.172.166-.492 1.008.427.047.065.676 1.007.285.264.818.744.19.338.279-.338.718-1.008-.579-1.007-.418-.711-.23-.297-.547-1.008-.231-.316-.562-.691-.446-.476-.481-.532.48-.546.513.546.496.466 1.008.493.125.049.883.294.29-.294-.29-.492-.277-.516-.174-1.008.45-.099.096.1.913.747.269.26.74.739.422.269.585.502.27-.502-.132-1.008-.138-.279-.344-.729-.664-.972-.032-.035-.674-1.008.706-.131.314.131.694.39.368-.39-.368-.347-.39-.66-.618-.754-.212-.254.212-.289 1.008-.062.654.35.354.404.527-.403.187-1.008-.714-.891-.273-.116.273-.126 1.008-.32.513.446.495.777.312.23-.312.198-.684.81.684.551.255.457.753.98.038.027.759 1.008.211.276.45-.276.188-1.008-.349-1.007-.289-.435-.492-.573-.284-1.008.122-1.007-.354-.763-.138-.245-.07-1.008-.097-1.007-.104-1.008.41-.353.343.353.664.44.635.568.342 1.007-.378 1.008.41.453.377.555.63.85.258.157.75.472.668.536.34.416.303-.416-.302-.619-.27-.389-.738-.863-.084-.144-.766-1.008-.158-.323-.967-.685.967-.597.183-.41-.183-.502-.224-.506-.308-1.007-.038-1.008-.386-1.008.956-.33.228.33.696 1.008.084.066.901.942.107.114.547.893.46.687.351.32.658.549.382.46.626.49.634.517.374.319.298-.319-.23-1.008-.068-.105-.385-.902-.334-1.008-.29-.345-.384-.662-.489-1.008-.134-.12-.44-.888-.568-.783-.168-.224.168-.493 1.008.3.116.193.43 1.007.462.497.378',
    '.51.63.814.728.195.28.257.19-.257.033-1.008.785-.475.312.475.045 1.008.198 1.007.453.88.148.128.632 1.007.228.322.248-.322.064-1.007-.187-1.008-.125-.443-.282-.564-.28-1.008-.202-1.008-.244-.569-.298-.438-.371-1.008-.339-.73-.24-.278-.435-1.007-.333-.766-.118-.242-.21-1.008.2-1.007.128-.125.079.125.93.87.109.137.782 1.008.116.097.561.91.447.745.282.263.479 1.008.247.51.352-.51.326-1.008-.03-1.007-.244-1.008-.17-1.008-.234-.532-.109-.475.11-.665.665.665.342.122.143-.122-.085-1.008-.058-.242-.255-.765.058-1.008-.44-1.008-.37-.673-.22-.334-.538-1.008.457-1.008.3-.779 1.008-.178.407.957.521 1.008.08.17.378.838.365 1.007.265.61.491.398.192 1.008.3 1.007.026.033.15-.033.858-.806.342.806.666.7.344.308.182 1.007.324 1.008.158.143.864.865.144.126.1-.126.085-1.008-.185-.375-.393-.633-.268-1.007-.347-.806-.177-.202-.048-1.007.185-1.008-.069-1.008.109-.201.072.201-.01 1.008.946.372.385.636.235 1.007.313 1.008.075.095.45.912.433 1.008.125.17.173-.17.164-1.008-.1-1.007-.237-.59-.351-.418-.179-1.007-.201-1.008-.277-.615-.24-.393-.313-1.007-.163-1.008-.292-.594-.335-.414-.297-1.007-.086-1.008.577-1.008.14-.178.117.178.46 1.008.205 1.008.227.231.45.776.232 1.008.326.993.014.015.529 1.007.177 1.008.288.785.289.223.456 1.007.263.783.986-.783.022-.151.19-.856-.19-.215-.363-.793-.645-.981-.01-.027-.442-1.007-.442-1.008-.114-.103-.432-.905-.23-1.007-.346-.87-.157-.138-.375-1.008-.278-1.007-.198-.463-.409-.545-.059-1.007.274-1.008.194-.156.127.156.266 1.008.615.744.152.263.408 1.008.448.97.026.037.495 1.008.439 1.008.048.098.425.91.176 1.007.34 1.008.067.093 1.008.403.645-.496.363-.605.27-.403-.27-.605-.057-.403.057-.537.283-.47.273-1.008-.145-1.008.597-.464.342.464.588 1.008.078.074.47-.074.01-1.008-.326-1.007-.154-.157-.383-.85-.116-1.008-.509-.636-.238-.372-.18-1.008-.1-1.007-.27-1.008-.22-.201-.084-.807-.088-1.007.162-1.008.01-.046.05.046.787 1.008-.434 1.007.605.631.197.377.394 1.008.417.897.404.11.604.419.34-.419.223-1.007-.086-1.008-.477-.655-.235-.353-.773-.975-.15-.032-.447-1.008-.21-1.007-.2-.296-.465-.712-.342-1.008.156-1.00',
    '7.32-1.008.27-1.008.06-.705.118.705.361 1.008.455 1.008.074.244.297.763.237 1.008.452 1.008.022.028.034-.028.593-1.008.065-1.008.317-.835.16-.172.848-.847.07-.161.185-1.008-.15-1.007-.105-.269-.256-.739-.289-1.008-.3-1.007V5.038l.845-.935.686.935.313 1.008.009.024.018-.024.471-1.008.126-1.007.229-1.008.164-.198 1.008-.633.188-.177.82-.41 1.008-.377.342-.22zm.623.697-.623.33-1.008.418-.59.26-.418.654-.392.353-.157 1.008-.279 1.007-.18.435-.268.573-.122 1.007-.313 1.008-.096 1.008-.21.974-.019.033-.531 1.008-.276 1.008-.181.891-.042.116-.439 1.008-.114 1.008.031 1.007-.215 1.008-.006 1.007-.044 1.008-.18.756-.098.252.027 1.007.037 1.008-.17 1.008-.217 1.007-.2 1.008-.313 1.007-.073.168-.295.84.06 1.008-.16 1.007-.446 1.008-.168.302-.548.706-.46.626-.3.381-.317 1.008-.39.986-.04.022-.704 1.007-.167 1.008-.098.138-.773.87-.235.364-.533.643-.475.308-.273-.308-.5-1.008-.235-.231-.537-.776-.286-1.008-.185-.291-.352.291.02 1.008.128 1.007.204.618.26.39.033 1.008-.293.942-1.008-.61-.914-.332-.042-1.008-.052-.13-.048.13.024 1.008-.302 1.007-.682.204-.29-.204-.718-.624-.929-.383-.08-.066-.386-.942-.621-.535-.293-.473-.45-1.007-.265-.2-.615-.808-.353-1.007-.04-.079-.997-.93.066-1.007-.078-.182-.344.182.334 1.008v1.008l.01.03.308.977.145 1.008.265 1.007.29.545.232.463.208 1.008.137 1.007.307 1.008.125.311.26.697.205 1.007.209 1.008.334.676.131.332.098 1.007-.07 1.008-.16.252-.116-.252-.192-1.008-.7-.9-.078-.107-.56-1.008-.37-.447-.6-.56-.26-1.008-.148-.4-.882-.608-.126-.074-.028.074-.466 1.008-.514.514-.252-.514-.437-1.008-.319-.53-.371-.478-.528-1.007-.109-.177-1-.83-.008-.011-.01.01-.05 1.008.06.132.372.875.336 1.008.3.637.26.37.34 1.008.342 1.008.066.172.332.836.25 1.007.186 1.008.161 1.007.08.596.058.412-.059.324-1.008-.114-.247-.21-.61-1.008-.15-.216-.666-.791-.343-.988-1.008.949-.504.039.152 1.007.102 1.008-.758.81-.952-.81-.056-.046-.198.046-.81.667-.287-.667-.721-.837-.17-.17-.423-1.008-.401-1.008-.014-.023-.915-.984-.093-.098-.546.098-.079 1.007.26 1.008.365.915.074.092-.074.147-.273.861.273.356.465.652.543.593.358.4',
    '14.587 1.008.063.095.423.913.002 1.007-.425.482-.353-.482-.655-.771-.2-.236-.808-.95-.077-.058-.931-.578-.378-.43-.63-.931-.198-.076-.766-1.008-.045-.267-.096.267-.091 1.008.02 1.007.146 1.008.021.024.654.984.355.762.19.245.113 1.008.142 1.007.048 1.008-.493.32-.25-.32-.748-1.008-.01-.006-.766-1.001-.243-.317-.556-.69-.452-.655-.756.654-.252.635-.19.373.19.178.398.83.408 1.007-.806.649-.673-.649-.335-.4-.331.4.022 1.008-.01 1.007-.689.213-.45-.213-.558-.458-.39.458-.618.53-.888-.53-.12-.063-1.008-.13-.142.193.142.263.447.745.447 1.008.114.197.49.81.248 1.008-.507 1.008-.008 1.007-.223.244-.372-.244-.636-.417-.234.417.048 1.008-.098 1.007-.724.7-.894.308-.095 1.008-.02.044-1.007.121-.153-.165-.818-1.008-.037-.035-.794-.973-.214-.351-.328.351-.113 1.008.024 1.008.043 1.007.039 1.008-.058 1.008-.47 1.007-.146.125-.168-.125-.84-.678-.637.678-.37.854-1.009-.574-.18.728.105 1.008.075.123.465.884.316 1.008.041 1.007-.134 1.008-.192 1.008-.474 1.007-.022.024-.026-.024-.684-1.007-.196-1.008-.102-.378-.705-.63-.303-.14-1.008-.67-.25.81-.002 1.008-.025 1.008-.258 1.007-.473.68-.366.328-.642.78-.87.228-.138.08-1.008.872-1.008-.003-1.008-.46-1.008.315-.264.203-.744.936-.028.072-.297 1.007-.335 1.008-.348.504-.994.504-.015.008-.007-.008-.77-1.008-.23-.306-.812-.702-.197-.229-.229.23-.431 1.007-.348.857-.142.15-.65 1.008-.216.407-.226.601-.684 1.008-.098.064-1.008.626-1.008-.226-.626.543-.382.28-.42.728-.588.74-.34.268-.668.711-.537-.711-.314-1.008-.157-.798-.31.798-.391 1.008-.307.213-.733.794-.275.232-1.008-.219-.416.995-.593.87-1.008-.584-.624.721-.384.265-1.008-.139-.33-.126-.678-.225-.819.225-.189.067-.598.941-.41.756-.232.252-.578 1.007-.198.26-1.008.396-.485.352-.523.543-.37.465-.638.618-.857.39-.151.086-.704.92-.304.37-.465.639-.543.82-.106.187-.325 1.008-.577.398-1.008-.067-.274.676.03 1.008-.238 1.008-.21 1.007.227 1.008.17 1.008.295.626.161.381.32 1.008-.338 1.007-.143.814-.02.194.02.015.84.993-.202 1.007-.638.517-1.009.232-.98.259-.028.02-1.008.437-1.008.136-1.008.113-.926.302-.082.163-.144.844.144.16 1.008.399 1.00',
    '8-.077 1.008-.076 1.008-.1 1.008-.125 1.009-.156.146-.025.862-.259.513.26.495.264.507.743.153 1.008.068 1.007.28.743.306.265.702.43.674.577.334.216.958.792.05.048.06-.048.948-.846 1.008.836.015.01.993.603 1.008-.194 1.008.203 1.008.008.555.388.453.675 1.008-.124 1.008-.547.017-.004.992-.307.646.307.362.187.198-.187.81-.667.57-.34.438-.273 1.008-.074 1.008-.022 1.008-.403 1.008.032.298-.269.71-.866.234-.141.383-1.008.391-.3 1.008-.161 1.008-.434 1.008.076 1.008-.007 1.008-.143.23-.038-.089-1.008.628-1.008.24-.12 1.008-.49 1.008-.353.554-.044.454-.056.098.056.91.348 1.008-.109.137-.24.87-.708 1.009.05 1.008.085 1.008.192.863-.626.145-.09 1.008-.334 1.008-.451.234-.133.774-.746 1.008.047 1.008.084 1.009.01.652-.402.356-.339 1.008-.626.082-.043.917-1.008.009-.008 1.008-.31 1.008-.266 1.008-.32.477-.103.531-.29.889-.718.12-.182.424-.825.583-.35 1.008-.074 1.008-.11 1.008-.146 1.008-.08 1.008-.143.419-.105.59-.266 1.008-.356.606-.386.402-.992.016-.015.992-.288 1.008-.195 1.008-.266.518-.259-.014-1.008-.504-.15-.27.15-.738.22-.766-.22.65-1.007.116-.08 1.008-.28 1.008-.144 1.008-.21 1.008-.178.307-.116-.266-1.007.967-.56.684-.448.324-.23 1.008-.306 1.008-.216.916-.256.092-.056 1.008-.635.335-.316.673-.473.835-.535.174-.16 1.008-.487.805-.36.203-.188 1.008-.5.491-.32.517-.445.866-.563.142-.141 1.008-.631.303-.236.705-.567.77-.44.238-.221 1.008-.731.084-.056-.078-1.007 1.002-.69.453-.318.555-.562.588-.446.42-.504.283-.503.725-.597.306-.411-.306-.652-1.008.592-.082.06-.926.851-.486.157-.522.695-1.008.005-1.008.057-.774.25-.234.139-1.008.129-.867-.268.867-.902.044-.105.964-.426 1.008-.257.54-.325.468-.343 1.008-.35.536-.315.472-.37 1.008-.595.045-.042.963-.616 1-.392.008-.016 1.009-.742.36-.25-.36-.385-1.009.177-.529.208-.479.32-1.008.325-1.008.272-.907.091-.1.02-1.009.38-1.008.184-.834.424-.174.121-1.008.28-1.008-.044-1.008-.152-.353-.205.353-.235 1.008-.346.83-.427.178-.079 1.008-.297 1.008-.184.766-.448.242-.187 1.008-.58.416-.24.592-.415 1.008-.362.417-.23.591-.44 1.008-.425.22-.143.789-.55.866-.458.142-.142 1.008-.592.4',
    '47-.274.56-.48.821-.527.188-.188 1.008-.648.162-.172.846-.886.128-.122.88-.894.13-.113.878-.718.357-.29.651-.807.196-.2-.196-.273-1.008.017-.767.256-.241.068-.37-.068.37-.252.245-.756.763-.633.732-.375.276-.218 1.008-.325.904-.464.104-.113 1.008-.32.661-.575.347-.779.096-.229-.096-.1-.26.1-.748.31-1.008.176-1.008-.214-1.008.05-1.008-.132-.236-.19.236-.34.4-.667-.4-.429-1.008.297-.2.132-.808.443-1.008.241-.772.323-.236.188-1.008.259-1.008-.002-1.008-.018-.677-.427.677-.266 1.008-.197 1.008-.42.104-.124.904-.428 1.008-.396.294-.184.714-.45 1.008-.295.423-.263.585-.51.63-.497.378-.276 1.008-.663.06-.069.948-.792.285-.215.723-.458.78-.55.228-.21 1.008-.683.124-.115.884-.81.389-.197-.389-.389-1.008.075-.488.314-.52.33-1.008.501-.348.176-.66.513-.742.495-.266.165-.195-.165.195-.598.193-.41-.193-.128-1.008-.161-.416-.718.416-.293 1.008-.48.317-.235.691-.386.977-.622.031-.024 1.008-.632.263-.351.745-.495.687-.513.321-.459.77-.549-.77-.399-1.008.325-.132.074-.876.423-.834.585-.174.151-1.008.38-.59.477-.418.268-1.008.36-1.008.368-.072.011-.936.12-1.008.228-1.008.492-.252.168.056 1.008-.812.54-1.008.16-.788-.7-.22-.196-.706.196-.302.755-.014.252.014.504.504.504.504.02 1.008.069.52.919-.52.26-.935.747-.073.058-1.008.304-1.008.029-1.009.49-.12.127-.804 1.007-.084.284-.463.724-.545.716-.792.292-.216.028-1.008.311-.83.668.83.992 1.008-.065 1.008-.26 1.008.019 1.008.07.648.252-.648.296-1.008.247-1.008.14-1.008-.467-.504.792-.504.83-.153.177-.855.401-1.008.235-1.008.01-1.008.267-.208.095-.8.716-1.008.205-.14.087-.616 1.007.756.64 1.008.206.142.162-.142.227-1.008.092-1.008.04-1.008-.053-1.008.13-.572.571-.436.364-1.009-.084-.504-.28-.504-.84-.42.84-.588.294-1.008.13-.882-.424.753-1.007.13-.142.767-.866.072-1.007.168-.2.756-.808.252-.312.61-.696.398-.482.537-.525.472-.482.676-.526.332-.644.327-.364.388-1.007.293-.86.081-.148.71-1.008.217-.503.247-.504.464-1.008.297-.504.342-.503.47-1.008.196-.248.568-.76.44-.853.135-.154.453-1.008.42-.659.258-.349.527-1.007.223-.401.377-.607.408-1.008.223-.322.445-.685.365-1.008.198-.305.493-.702.5',
    '09-1.008.006-.01.67-.998.338-.504.545-.503.463-.782.437-.226.571-.306.894-.702.102-1.007.013-.039 1.008-.702.756-.267.252-.116.891-.891.117-.138 1.008-.211 1.008.097.137-.756.184-1.008.423-1.007.264-.693.157-.315-.157-.133-.594-.875.36-1.007.035-1.008.104-1.008.095-.32.222-.687-.222-.84-.039-.168-.153-1.007.192-.87.1-.138-.1-.302-.062-.706.023-1.007.039-.36.116-.648-.116-.302-.2-.706.155-1.007-.226-1.008-.003-1.008.106-1.007.168-.661.154-.347-.154-.221-.221-.786.22-.936.039-.072.269-1.008.053-1.007.177-1.008.11-1.008.048-1.007.202-1.008.111-.598.083-.41.171-1.007.21-1.008.094-1.007-.01-1.008.084-1.008.197-1.007.078-1.008.101-.714.05-.294-.05-.705-.02-.302-.024-1.008-.012-1.007-.045-1.008.101-.779.045-.229.064-1.007-.109-.076zm-.65 19.145.027.172.22-.172-.22-.303zM98.78 21.16l.011.045.028-.045-.028-.094zm-5.142 7.054.113.4.163-.4-.163-.644zm6.773 0 .396.37.131-.37-.13-.884zm-17.396 2.015.366 1.008.29.587.375-.587-.28-1.008-.096-.182zm8.468 0 .084 1.008.168.425.309-.425-.069-1.008-.24-.683zm1.056 2.015-.09 1.008.163 1.008.13.351.292-.351-.002-1.008-.218-1.008-.071-.134zm-1.957 3.023.145.39.081-.39-.081-.372zM84.4 37.282l.278.592.103-.592-.103-.315zm.961 4.031.18 1.008.145.348.262-.348-.043-1.008-.219-.806zm-7.887 5.038.148.913.281-.913-.281-.27zm27.576 0 .798.798 1.008-.386.716-.412-.716-.972-1.008.288zM69.38 47.36l.175.378.075-.378-.075-.067zm28.34 7.053.061.806.27-.806-.27-.173zm22.089 0 .15.092.078-.092-.078-.074zm-8.258 1.008.343.856 1.008-.595.555-.261-.555-.341-1.008-.149zm6.712 0 .688.08.074-.08-.074-.122zm-17.941 1.007.483.807.121.201-.12.302-.177.706-.193 1.007.37.37 1.008-.353.02-.017.601-1.007.012-1.008-.633-.554-.605-.454-.404-.186zm-33.92 1.008.13.125.155-.125-.156-.45zm-3.977 1.008.074.14.177-.14-.177-.177zM94.65 59.45l-.392 1.008.04 1.008.46.586.258.421-.258.422-1.008.485-1.008-.09-.082.19.082.172 1.008-.043.691.88.317.738 1.008-.658.135-.08.31-1.008.563-.971.045-.037-.045-.201-.146-.806.146-.116.23.116.778.388.34-.388-.317-1.008-.023-.037-.971-.97-.037-.202-.1.201-.908.242-.279-.242-.729-.215zm-40.3',
    '75 6.046.16.678.184-.678-.184-.84zm57.469 1.008.151.272.363-.272-.363-.083zm-1.48 1.007.623.355.588-.355-.588-.403zm-2.355 1.008.962.327.66-.327-.66-.278zm-2.069 1.008.007.01 1.008.292.973-.302-.973-.364-1.008.36zm-15.996 2.015.882.196.294-.196-.294-.392zm16.83 12.092.18.81.55-.81-.55-.113zm-1.167 1.007.34.812.77-.812-.77-.147zm-2.711 2.015.027.081.242-.08-.242-.043zm-8.6 1.008.562.113.675-.113-.675-.108zm7.182 0 .437.337.61-.337-.61-.326zm-1.983 1.008.403.581 1.008-.37.273-.211-.273-.364-1.008.106zm2.172 0 .248.243.399-.243-.4-.226zm-72.434 1.007.1.326.164-.326-.163-.205zm68.85 0 .807.43.616-.43-.616-.437zm2.116 0 .707.362.415-.362-.415-.42zm-4.1 1.008-.233.429-1.008.297-.969.282.97.312 1.007-.113.353-.2.655-.431 1.008-.374.22-.202-.22-.605-1.008.26zm-68.072 1.008.299.258.137-.258-.137-.87zm1.244 0-.457 1.007.52.747.414-.747-.045-1.007-.37-.09zM112.903.967l.323.04.685.172.316.836.016 1.008-.332.386-1.008.31-.638-.696-.123-1.008.691-1.007zm-1.008 3.416.219.655-.219.873-.238-.873zm-15.12 17.578.09.207.049 1.008-.14.15-.065-.15-.082-1.008zm1.007 1.899.16.323.217 1.008-.377.508-.272-.508-.072-1.008zm-15.12 2.95.395.396-.396.763-.222-.763zm37.298 14.34 1.008-.607.451.77-.451.635-.446.373-.562.968-.028.04-.98.999-.023.008-.87 1.008-.115.147-.697-.147-.19-1.008.598-1.008.289-.197.964-.81.044-.033.853-.975zm0 5.978.023.23-.023.065-.323-.064zm-67.54 5.014 1.007.064.186.19-.186.294-1.008-.234-.09-.06zm68.548 1.074.196.189-.196.293-.274-.293zM57.46 56.349l.144.078-.144.116-.083-.116zm61.492 2.069.022.025-.022.02-.04-.02zm-10.081 3.841 1.008-.113.634.327-.634.212-1.008.1-.579-.312zm-2.016.865 1.008-.04.18.397-.18.098-1.008.034-.714-.132zM57.46 66.146l.215.358-.215.42-.173-.42zM42.339 76.534l.045.046-.032 1.008-.013.035-.008-.035-.011-1.008zm41.33 3.848.315.229-.315.252-.21-.252zm-64.516 1.11.05.126-.05.123-.051-.123zm14.113 2.844.214.305-.117 1.008-.097.1-.145-.1-.144-1.008zm53.428 8.107 1.008-.177 1.008-.083 1.008-.073 1.008.03.898.562-.898.274-1.008.234-1.008.16-1.008.331-.026.009-.982.205-1.009.061-1.008-.037-1.008-.173-',
    '1.008-.05-.252-.006.252-.007 1.008-.073 1.008-.34 1.008-.57.02-.018zm.932.26.076.04 1.008.167 1.008-.088.39-.12-.39-.14-1.008-.022-1.008.144zm-11.013.969 1.008-.158 1.008-.07 1.008-.028 1.008.09.936.204-.936.258-1.008.149-1.008-.038-1.008-.117-1.008-.216-.126-.036zm-63.508 5.006.096.07-.096.133-.079-.133z" clip-path="url(#p0dbbb3483e)" style="fill:#fff;fill-opacity:.6"/><path d="m109.879.932.11.076-.065 1.007-.045.23-.1.778.044 1.008.012 1.007.025 1.008.019.302.05.705-.05.294-.1.714-.079 1.008-.197 1.007-.084 1.008.01 1.008-.095 1.007-.209 1.008-.171 1.008-.083.409-.111.598-.202 1.008-.048 1.007-.11 1.008-.177 1.008-.053 1.007-.27 1.008-.037.072-.221.936.22.786.155.221-.154.347-.168.66-.106 1.008.003 1.008.226 1.008-.155 1.007.2.706.116.302-.116.648-.039.36-.023 1.007.062.706.1.302-.1.137-.192.87.153 1.008.039.168.222.84-.222.687-.095.32-.104 1.008-.035 1.008-.36 1.007.594.875.157.133-.157.315-.264.693-.423 1.007-.184 1.008-.137.756-1.008-.097-1.008.211-.117.138-.891.89-.252.117-.756.267-1.008.702-.013.039-.102 1.007-.894.702-.57.306-.438.226-.463.782-.545.503-.338.504-.67.998-.006.01-.51 1.008-.492.702-.198.305-.365 1.008-.445.685-.223.322-.408 1.008-.377.607-.223.4-.527 1.008-.258.35-.42.658-.453 1.008-.135.154-.44.853-.568.76-.196.248-.47 1.008-.342.503-.297.504-.464 1.008-.247.504-.218.503-.709 1.008-.081.148-.293.86-.388 1.007-.327.364-.332.644-.676.526-.472.482-.537.525-.397.482-.61.696-.253.312-.756.808-.168.2-.072 1.007-.768.866-.129.142-.753 1.007.882.424 1.008-.13.588-.294.42-.84.504.84.504.28 1.009.084.436-.364.572-.57 1.008-.131 1.008.054 1.008-.041 1.008-.092.142-.227-.142-.162-1.008-.206-.756-.64.616-1.007.14-.087 1.008-.205.8-.716.208-.095 1.008-.267 1.008-.01 1.008-.235.855-.4.153-.177.504-.831.504-.792 1.008.467 1.008-.14 1.008-.247.648-.296-.648-.252-1.008-.07-1.008-.02-1.008.261-1.008.065-.83-.992.83-.668 1.008-.31.216-.03.792-.291.545-.716.463-.724.084-.284.804-1.007.12-.126 1.009-.491 1.008-.029 1.008-.304.073-.058.935-.747.52-.26-.52-.92-1.008-.067-.504-.021-.504-.504-.014-.504.014-.252.302-',
    '.755.706-.196.22.196.788.7 1.008-.16.812-.54-.056-1.008.252-.168 1.008-.492 1.008-.229.936-.119.072-.01 1.008-.37 1.008-.359.419-.268.59-.476 1.007-.38.174-.152.834-.585.876-.423.132-.074 1.008-.325.77.4-.77.548-.32.46-.688.512-.745.495-.263.351-1.008.632-.03.024-.978.622-.691.386-.317.235-1.008.48-.416.293.416.718 1.008.16.193.13-.193.409-.195.598.195.165.266-.165.742-.495.66-.513.348-.176 1.008-.5.52-.331.488-.314 1.008-.075.389.389-.389.197-.884.81-.124.115-1.008.683-.229.21-.779.55-.723.458-.285.215-.948.792-.06.069-1.008.663-.378.276-.63.498-.585.51-.423.262-1.008.295-.714.45-.294.184-1.008.396-.904.428-.104.123-1.008.421-1.008.197-.677.266.677.427 1.008.018 1.008.002 1.008-.26.236-.187.772-.323 1.008-.241.808-.443.2-.132 1.008-.297.4.429-.4.668-.236.34.236.19 1.008.131 1.008-.05 1.008.214 1.008-.176.748-.31.26-.1.096.1-.096.23-.347.778-.66.575-1.009.32-.104.113-.904.464-1.008.325-.276.218-.732.375-.763.633-.245.756-.37.252.37.068.241-.068.767-.256 1.008-.017.196.273-.196.2-.65.807-.358.29-.877.718-.131.113-.88.894-.128.122-.846.886-.162.172-1.008.648-.188.188-.82.528-.56.48-.448.273-1.008.592-.142.142-.866.459-.789.549-.22.143-1.008.425-.591.44-.417.23-1.008.362-.592.415-.416.24-1.008.58-.242.187-.766.448-1.008.184-1.008.297-.177.08-.831.426-1.008.346-.353.235.353.205 1.008.152 1.008.043 1.008-.279.174-.121.834-.424 1.008-.185 1.008-.38.101-.019.907-.091 1.008-.272 1.008-.325.48-.32.528-.208 1.009-.177.36.385-.36.25-1.009.742-.008.016-1 .392-.963.616-.045.042-1.008.595-.472.37-.536.314-1.008.35-.468.344-.54.325-1.008.257-.964.426-.044.105-.867.902.867.268 1.008-.129.234-.139.774-.25 1.008-.057 1.008-.005.522-.695.486-.157.926-.851.082-.06 1.008-.592.306.652-.306.41-.725.598-.283.503-.42.504-.588.446-.555.562-.453.318-1.002.69.078 1.007-.084.056-1.008.73-.238.222-.77.44-.705.567-.303.236-1.008.63-.142.142-.866.563-.517.445-.491.32-1.008.5-.203.187-.805.361-1.008.486-.174.161-.835.535-.673.473-.335.316-1.008.635-.092.056-.916.256-1.008.216-1.008.307-.324.229-.684.447-.967.56.266 1.008-.307.116-1.008.179-1.008',
    '.209-1.008.144-1.008.28-.115.08-.65 1.007.765.22.738-.22.27-.15.504.15.014 1.008-.518.26-1.008.265-1.008.195-.992.288-.016.015-.402.992-.606.386-1.008.356-.59.266-.419.105-1.008.143-1.008.08-1.008.145-1.008.11-1.008.076-.583.349-.425.825-.12.182-.888.719-.531.289-.477.103-1.008.32-1.008.266-1.008.31-.009.008-.917 1.008-.082.043-1.008.626-.356.339-.652.402-1.009-.01-1.008-.084-1.008-.047-.774.746-.234.133-1.008.451-1.008.334-.145.09-.863.626-1.008-.192-1.008-.085-1.008-.05-.871.709-.137.239-1.008.11-.91-.35-.098-.055-.454.056-.554.044-1.008.353-1.008.49-.24.12-.628 1.008.089 1.008-.23.038-1.008.143-1.008.007-1.008-.076-1.008.434-1.008.16-.391.301-.383 1.008-.234.14-.71.867-.298.269-1.008-.032-1.008.403-1.008.022-1.008.074-.438.272-.57.34-.81.668-.198.187-.362-.187-.646-.307-.992.307-.017.004-1.008.547-1.008.124-.453-.675-.555-.388-1.008-.008-1.008-.203-1.008.194-.993-.603-.015-.01-1.008-.836-.948.846-.06.048-.05-.048-.958-.792-.334-.216-.674-.576-.702-.431-.306-.265-.28-.743-.068-1.007-.153-1.008-.507-.743-.495-.265-.513-.259-.862.26-.146.024-1.009.156-1.008.125-1.008.1-1.008.076-1.008.077-1.008-.398-.144-.16.144-.845.082-.163.926-.302 1.008-.113 1.008-.136 1.008-.438.028-.019.98-.26 1.009-.231.638-.517.202-1.007-.84-.993-.02-.015.02-.194.143-.814.337-1.007-.319-1.008-.161-.381-.296-.626-.17-1.008-.225-1.008.209-1.007.238-1.008-.03-1.008.274-.676 1.008.067.577-.398.325-1.008.106-.188.543-.82.465-.638.304-.37.704-.92.151-.087.857-.39.638-.617.37-.465.523-.543.485-.352 1.008-.396.198-.26.578-1.007.232-.252.41-.756.598-.94.19-.068.818-.225.678.225.33.126 1.008.14.384-.266.624-.72 1.008.582.593-.87.416-.994 1.008.22.275-.233.733-.794.307-.213.392-1.008.309-.798.157.798.314 1.008.537.711.668-.711.34-.269.588-.74.42-.727.382-.28.626-.543 1.008.226 1.008-.626.098-.064.684-1.008.226-.6.216-.408.65-1.007.142-.151.348-.857.431-1.008.23-.229.196.23.811.7.232.307.77 1.008.006.008.015-.008.994-.504.348-.504.335-1.008.297-1.007.028-.072.744-.936.264-.203 1.008-.315 1.008.46 1.008.003 1.008-.873.137-.08.871-.227.642-.78.366-.327',
    '.473-.68.258-1.008.025-1.008.003-1.008.25-.81 1.007.67.303.14.705.63.102.378.196 1.008.684 1.007.026.024.022-.024.474-1.007.192-1.008.134-1.008-.041-1.007-.316-1.008-.465-.884-.075-.123-.105-1.008.18-.728 1.008.574.37-.854.638-.678.84.678.168.125.145-.125.47-1.007.059-1.008-.04-1.008-.042-1.007-.024-1.008.113-1.008.328-.351.214.351.794.973.037.035.818 1.008.153.165 1.008-.12.02-.045.094-1.008.894-.308.724-.7.098-1.007-.048-1.008.234-.417.636.417.372.244.223-.244.008-1.007.507-1.008-.247-1.008-.491-.81-.114-.197-.447-1.008-.447-.745-.142-.263.142-.193 1.008.13.12.063.888.53.619-.53.39-.458.558.458.45.213.688-.213.01-1.007-.022-1.008.331-.4.335.4.673.649.806-.649-.408-1.008-.398-.829-.19-.178.19-.373.252-.635.756-.654.452.654.556.691.243.317.765 1.001.01.006.75 1.008.249.32.493-.32-.048-1.008-.142-1.007-.114-1.008-.19-.245-.354-.762-.654-.984-.02-.024-.148-1.008-.019-1.007.09-1.008.097-.267.045.267.766 1.008.198.076.63.931.378.43.93.578.078.057.807.95.2.237.656.771.353.482.425-.482-.002-1.007-.423-.913-.063-.095-.587-1.008-.358-.414-.543-.593-.465-.652-.273-.356.273-.861.074-.147-.074-.092-.365-.915-.26-1.008.079-1.007.546-.098.093.098.915.984.014.023.401 1.008.422 1.007.17.17.722.838.287.667.81-.667.198-.046.056.046.952.81.758-.81-.102-1.008-.152-1.007.504-.039 1.008-.95.343.989.665.791.151.216.61 1.008.247.21 1.008.114.06-.324-.06-.412-.079-.596-.16-1.007-.188-1.008-.25-1.007-.33-.836-.067-.172-.343-1.008-.34-1.007-.259-.371-.3-.637-.336-1.008-.372-.875-.06-.132.05-1.008.01-.01.008.01 1 .831.109.177.528 1.007.371.478.32.53.436 1.008.252.514.514-.514.466-1.008.028-.074.126.074.882.608.147.4.262 1.007.6.56.37.448.56 1.008.078.106.7.901.19 1.008.118.252.16-.252.07-1.008-.099-1.007-.131-.332-.334-.676-.209-1.008-.205-1.007-.26-.697-.125-.311-.307-1.008-.137-1.007-.208-1.008-.232-.463-.29-.545-.265-1.007-.145-1.008-.308-.978-.01-.03v-1.007l-.334-1.008.344-.182.078.182-.066 1.008.996.93.04.078.354 1.007.615.808.265.2.45 1.007.293.473.62.535.388.942.08.066.928.383.718.624.29.204.682-.204.302-1.007-.024-1.008.048-.13.052',
    '.13.042 1.008.914.332 1.008.61.293-.942-.033-1.008-.26-.39-.204-.618-.128-1.007-.02-1.008.352-.291.185.291.286 1.008.537.776.236.231.5 1.008.272.308.475-.308.533-.643.235-.365.773-.869.098-.138.167-1.008.705-1.007.038-.022.391-.986.317-1.008.3-.381.46-.626.548-.706.168-.302.446-1.008.16-1.007-.06-1.008.295-.84.073-.168.312-1.007.2-1.008.219-1.007.17-1.008-.038-1.008-.027-1.007.099-.252.179-.756.044-1.008.006-1.007.215-1.008-.031-1.007.114-1.008.439-1.008.042-.116.18-.891.277-1.008.531-1.008.02-.033.209-.974.096-1.008.313-1.008.122-1.007.268-.573.18-.435.279-1.007.157-1.008.392-.353.418-.655.59-.259 1.008-.418.623-.33zm-2.363 2.09-.148 1.009-.438 1.007-.075.161-.276.847-.295 1.007-.336 1.008-.101.264-.138.744-.132 1.007-.363 1.008-.375.718-.104.29-.226 1.007-.195 1.008-.132 1.008.014 1.007-.265 1.008-.1.285-.124.722-.097 1.008-.135 1.008-.014 1.007-.025 1.008-.05 1.008-.106 1.007-.283 1.008-.174.358-.189.65-.318 1.007-.044 1.008-.031 1.007-.426.779-.106.229-.444 1.008-.459.501-.395.506-.357 1.008-.256.551-.16.457-.454 1.007-.394.751-.099.257-.621 1.007-.288.329-.466.68-.542.627-.67.38-.338.217-.564-.217-.444-.832-.09.832-.146 1.007-.304 1.008-.468.354-.605-.354-.403-.372-.277.372-.731.776-1.008-.76-.027-.016-.981-.46-.605-.548-.403-.208-.597-.8-.411-.733-.28-.274-.454-1.008-.274-.48-.601.48.296 1.008.19 1.008.115.615.201.392.356 1.008.211 1.008.138 1.007.102.324.426.684.231 1.008.086 1.007.187 1.008.078.29.273.717-.273.884-1.008-.466-.366-.418-.315-1.007-.318-1.008-.01-.011-.73-.996-.278-.52-1.008-.47-1.008.197-.19-.215-.818-.568-.421.568.162 1.008.206 1.007.053.29.352.718.216 1.007.092 1.008.074 1.008-.734.991-.965-.991-.043-.027-1.008-.683-1.008.307-.187.403-.821.612-1.008.061-.23.334.23.835.073.173-.073.186-.269-.186-.74-.145-.61-.863-.397-.43-.534-.577-.339-1.008-.135-.157-.851-.85-.157-.324-.175.323-.258 1.008.33 1.008.103.11.775.897.233.391.573.617.22 1.008.215.957.044.05.321 1.008-.365.65-1.008-.395-.256-.255-.594-1.008-.158-.186-.698-.821-.31-.365-.861-.643-.147-.091-.807-.917-.201-.298-.42.298.003 1.008.3',
    '6 1.008.057.12.687.887.088 1.008.083 1.007.15.44.414.568-.003 1.008-.411.467-.823-.467-.185-.063-.737-.945-.272-.363-.626-.645-.382-.567-1.008-.101-.147.668.147.343.486.665.108 1.008-.594.75-1.008-.554-.46.811-.548.94-1.008-.25-.67.318-.338.5-1.008-.136-.342.644.23 1.007.112.27.533.738-.533.788-.134.22.01 1.007-.884.967-.09.04-.469 1.008-.45.744-.294.264-.713.378-.396.63-.298 1.007-.314.314-.52-.314-.488-.181-.762-.826-.246-.303-.826-.705-.182-.261-.077.261-.044 1.008.045 1.007.058 1.008-.056 1.008-.156 1.007-.779.669-.902-.669-.106-.085-.08.085-.281 1.008-.647.69-.329.318.185 1.007.144.523.338.485.066 1.007-.33 1.008-.074.142-.123.866-.192 1.007-.693.735-.824-.735-.184-.333-.415-.674-.284-1.008-.309-.291-.524.291-.146 1.008-.262 1.007-.076.121-.394.887-.614.837-.134.17-.874.644-.424.364-.328 1.008-.256.276-.749-.276-.26-.077-1.007-.242-1.008-.433-.735.752-.273.957-.05.05-.958.397-.183.611-.535 1.008-.29.305-1.009.414-.658-.72-.35-.516-.907-.49-.1-.074-.036.073-.32 1.008-.451 1.007-.202.393-.278.615-.408 1.008-.322.54-1.008.365-.217.102-.79.403-1.009.11-.653.495-.355.435-.378.573-.63.559-.425.448-.583.563-.933-.563-.075-.13-1.008.12-.01.01-.998.84-.605.168-.403.242-.42.765-.589.555-1.008-.428-1.008.615-1.008-.007-1.008-.268-1.008.28-.166.261-.305 1.008-.537.555-.29.452-.718.94-.185.068-.823.587-.398.42-.61.502-.53.506-.478.403-1.008.574-.024.03-.596 1.009-.388.29-.417.717-.24 1.008-.351.403-1.008.457-.42.147-.141 1.008-.133 1.008-.214 1.007.026 1.008.357 1.008.271 1.007.254.988.013.02-.013.022-.24.985-.177 1.008.417.7.307.308-.307.964-.005.043-1.003.812-1.009.16-.139.036-.869.612-1.008.175-1.008.055-1.008.086-.246.08-.396 1.007.642.224 1.008-.031 1.008-.03 1.008-.078.683-.085.325-.217 1.009-.362 1.008-.129 1.008.305.403.403.43 1.008.13 1.008.045.738.08.27.928.731.255.276.753.582 1.008.291 1.008-.384.86.518.148.109 1.008.609 1.008.017.295.273.713.23 1.008-.02 1.008.536.617.262.391.069.128-.07.88-.601 1.009-.182 1.008.191.649-.415.359-.273 1.008-.471 1.008-.004 1.008-.14.314-.12.694-.444 1.008-.069.364-.494.644-.99',
    '1.008-.017 1-.767.768-.24.24-.249 1.008-.292 1.008.065.831-.532.177-.739.095-.269.913-.42 1.009-.277 1.008-.23.224-.08.784-.574 1.008-.053 1.008.405.414-.786.594-.426 1.008.023 1.008.276.554.127.454.032.33-.032.678-.324 1.008-.4 1.008-.158.276-.126.732-.961.05-.046.958-.51 1.008.409.143.1.865.122.77-.121.239-.43.722-.578.286-.107 1.008-.67.215-.23.793-.807 1.008.063 1.008-.179.292-.085.716-.561 1.008-.408.048-.039.566-1.007.394-.352 1.008-.393 1.008-.03 1.008-.107 1.008-.09.807-.036.201-.044 1.008-.423 1.009-.244 1.008-.284.02-.013-.02-.146-.288-.861.288-.237 1.008-.426 1.008-.057 1.008-.09.732-.198-.732-.296-1.008-.144-.662-.568.662-.902.081-.105.927-.636 1.008-.113 1.008-.144.548-.115.46-.273.417-.734.591-.591 1.008-.402.023-.015.985-.696 1.008-.135.96-.177.048-.044 1.008-.583.67-.38.338-.338 1.008-.488.284-.182.725-.669 1.008-.216.273-.123.735-.68 1.008-.263.099-.064.909-.783.346-.225.662-.661.812-.347.196-.196 1.008-.662.261-.15.747-.692.447-.315-.447-.55-1.008-.371-.202-.086.202-.152 1.008-.58.334-.276-.334-.403-1.008.204-1.008.03-1.008-.21-1.008.085-1.008.11-.865.184-.143.127-1.008.475-1.008.084-1.009.025-1.008-.015-1.008-.07-1.008.023-1.008.05-1.008.168-1.008.133-1.008-.014-1.008-.11-1.008-.18-1.008-.087-1.008-.246-1.008-.348-.067-.015-.941-.217h-1.008l-1.008.174-.303.043-.706.094-1.008-.027-.025-.067-.192-1.008.217-.388.271-.62.737-.785.167-.222.829-1.008.013-.013 1.008-.5.658-.494.35-.269 1.008.073 1.008-.08.94-.732.068-.074 1.008-.746.175-.188.833-.892.124-.115.41-1.008.064-1.007.358-1.008.052-.074.634-.934.374-.952.024-.055.646-1.008.338-.595.164-.413.602-1.007.242-.217.718-.79.29-.521.17-.487.838-.998.01-.01.725-1.008.273-.28.585-.727.423-.432.566-.576.443-.728.18-.28.572-1.007.256-.284.383-.724.612-1.008.013-.013.482-.994.526-.66.197-.348.42-1.007.39-.425.299-.583.71-.9.08-.108.367-1.007.56-.744.135-.264.437-1.008.437-.444.308-.563.393-1.008.307-.375.259-.633.622-1.007.127-.13.318-.878.59-1.007.1-.101.4-.907.608-.882.084-.126.533-1.007.391-.477.357-.531.651-.749.343-.259.514-1.007.151-.272.307-.736.7',
    '02-.841.302-.166.706-.817.15-.191.621-1.008.237-.194.876-.813.132-.137.806-.871.202-.907.017-.1.376-1.008.18-1.008.097-1.008.075-1.007.04-1.008.072-1.007.15-.907.014-.101.121-1.008.123-1.007-.037-1.008-.22-.78-.101-.228-.22-1.007-.252-1.008.282-1.008.29-.657.106-.35.224-1.008-.062-1.007.144-1.008.13-1.008.16-1.007.307-.54.108-.468.13-1.008.04-1.007.08-1.008.083-1.007.176-1.008.391-.782.05-.226.128-1.007.037-1.008.038-1.008.079-1.007.03-1.008.06-1.008-.027-1.007-.01-1.008-.004-1.007-.018-1.008-.363-.56-1.008.053zm-27.04 37.283.17.984.168-.984-.169-.341zm.878 2.016.181 1.007.118.33.469-.33-.166-1.007-.303-.857zm-8.872 4.03.099.867.163-.867-.163-.18zm42.361 11.084.076.145 1.008-.064.109-.08-.109-.178-1.008.124zm-1.48 1.008.548.224.335-.224-.335-.196zm-2.012 1.007.544.403 1.008-.382.033-.02-.033-.125-1.008-.112zm-2.605 1.008-.343 1.008.468.16.688-.16.32-.202 1.008-.563.425-.243-.425-.566-1.008.241-1.008.277zm-.454 2.015.579.313 1.008-.101.634-.212-.634-.327-1.008.113zm6.228 0 .4.247.391-.247-.392-.21zm-8.38 1.008.715.132 1.008-.034.18-.098-.18-.398-1.008.041zm3.026 0 .713.535.818-.535-.818-.3zm4.33 0 .415.126.178-.126-.178-.305zm-6.896 1.008-.753.555-.956.452-.052.177-1.008.64-.975.19-.033.034-1.008.416-1.009.481-.067.077.067.096 1.009.475.663.437-.663.403-1.009.335-.668.27-.34.34-1.008.414-1.008.147-.269.106.27.101 1.007.052 1.008-.005.706-.148.302-.302 1.009-.216 1.008-.193 1.008-.219.163-.077.845-.567 1.008-.21.571-.23.437-.438 1.008-.392.605-.179.403-.381.881-.626.127-.343 1.008-.43.346-.235-.346-.403-1.008.189-.416.214-.592.287-1.008.14-.675-.427.675-.427 1.008-.13.24-.45-.24-.404-1.008.095-1.008.144zm5.22 0 .075.06.09-.06-.09-.046zm-4.991 6.045-.982.78-1.008.107-1.008.008-.585.113-.423.651-.464.357-.126 1.007-.418.195-1.009.668-.518.145.164 1.008-.654.414-1.008.173-1.008-.086-1.008.06-1.008-.014-1.008.07-1.008.281-.175.11.05 1.007.125.187.958.82-.958.523-1.008.064-1.008.342-1.008-.129-.444.208-.564.498-.867.51-.141.282-1.008.289-.146.436-.862.913-.323.095-.686.171-1.008.346-1.008.172-.51.319-.498.213-1.008.369-',
    '.547.425-.387 1.008.423 1.007-.236 1.008-.26.74-.231.268-.22 1.007-.558.592-1.008.23-1.008-.159-1.008-.192-1.008-.242-1.008-.211-1.008.587-.538.403.386 1.008.152.13 1.008.681.497.196.51.213 1.009.056 1.008.056 1.008-.028 1.008-.011 1.008.035 1.008.09 1.008-.09 1.008-.204.317-.117.691-.322 1.008-.28 1.009-.106 1.008-.07 1.008-.034 1.008-.15.194-.045.814-.437 1.008-.048 1.008-.106 1.008-.194.994-.223.014-.013 1.008-.729 1.008-.237.049-.029.96-.752.428-.255-.429-.49-1.008.094-1.008.157-1.008.2-.076.039-.932.653-1.008.112-1.008-.013-1.008-.01-1.008-.387-.614-.355.614-.33 1.008-.522.433-.156.575-.337 1.008-.299 1.008-.119 1.008-.175.133-.078.875-.68.791-.327.217-.217 1.008-.554.857-.237.151-.15 1.008-.64.589-.217.42-.403 1.008-.422.346-.183.662-.661 1.008-.3.077-.047.93-.796.329-.211.68-.68.56-.328.448-.572.382-.436.626-.567.425-.44.583-.527.765-.48-.765-.37-1.008.256-.387.113-.621.287-.622-.287-.279-1.007.9-.844.874-.164.135-.029.857-.979.151-.073 1.008-.547.691-.387.317-.296.382-.712-.382-.129-1.008-.088-.982-.79-.026-.048-1.008-.144-1.008.18zm6.558 1.008.524.03.036-.03-.036-.037zm-1.76 1.008.268.015.03-.015-.03-.085zm-12.883 2.015.046.017.152-.017-.152-.016zM83.459 80.61l.21.252.315-.252-.315-.23zm15.206 7.053.125.1h1.008l.254-.1-.254-.175-1.008.142zm1.071 3.023.062.022.017-.022-.017-.035zm-14.032 2.015-.019.018-1.008.57-1.008.34-1.008.073-.252.007.252.007 1.008.049 1.008.173 1.008.037 1.009-.061.982-.205.026-.009 1.008-.331 1.008-.16 1.008-.234.898-.274-.898-.563-1.008-.03-1.008.074-1.008.083-1.008.177zm-9.217 1.008.126.036 1.008.216 1.008.117 1.008.038 1.008-.149.936-.258-.936-.205-1.008-.089-1.008.027-1.008.07-1.008.159zM98.79 21.066l.028.094-.028.045-.01-.045zm-5.04 6.504.163.644-.163.4-.113-.4zm-10.08 2.477.096.182.279 1.008-.376.587-.289-.587-.366-1.008zm8.064-.5.24.682.069 1.008-.31.425-.167-.425-.084-1.008zm1.008 2.563.071.134.218 1.008.002 1.008-.291.351-.131-.351-.162-1.008.089-1.008zm-2.016 2.785.081.372-.081.39-.145-.39zM77.62 46.08l.281.27-.281.913-.148-.913zm28.226-.414 1.008-.288.716.972-.716.412-1.0',
    '08.386-.798-.798zm-36.29 1.625.074.067-.075.378-.175-.378zm50.403 7.046.078.074-.078.092-.15-.092zm-1.008.96.074.122-.074.08-.688-.08zM62.5 58.266l.177.177-.177.14-.074-.14zm-8.065 6.39.184.84-.184.678-.16-.678zm51.412 1.557.699.29-.7.292-.616-.291zM90.726 71.15l.294.392-.294.196-.882-.196zm16.129 12.37.548.114-.548.81-.181-.81zm-1.008.974.77.147-.77.812-.34-.812zm-4.032 3.952.399.226-.4.243-.247-.243zm-72.581 1.028.163.205-.163.326-.1-.326zm71.572-.214.415.42-.415.361-.707-.362zm-.188.42.188.096.11-.097-.11-.111zm-18.965.74 1.008-.02.678.287-.678.324-1.008.173-.621-.497zm-53.427.404.137.87-.137.26-.3-.26z" clip-path="url(#p0dbbb3483e)" style="fill:#fff;fill-opacity:.8"/><path d="m107.863 2.516 1.008-.054.363.56.018 1.009.005 1.007.01 1.008.027 1.007-.06 1.008-.031 1.008-.08 1.007-.037 1.008-.037 1.008-.128 1.007-.05.226-.391.782-.176 1.008-.082 1.007-.081 1.008-.04 1.007-.13 1.008-.108.468-.307.54-.16 1.007-.13 1.008-.144 1.008.062 1.007-.224 1.008-.105.35-.29.657-.283 1.008.251 1.008.221 1.007.1.229.221.779.037 1.008-.123 1.007-.12 1.008-.014.1-.151.908-.072 1.007-.04 1.008-.075 1.007-.097 1.008-.18 1.008-.376 1.007-.017.101-.202.907-.806.87-.132.138-.876.813-.237.194-.62 1.008-.151.19-.706.818-.302.166-.702.841-.307.736-.15.272-.515 1.007-.343.259-.65.749-.358.53-.39.478-.534 1.007-.084.126-.607.882-.4.907-.102.1-.59 1.008-.317.877-.127.13-.622 1.008-.259.633-.307.375-.393 1.008-.308.563-.437.444-.437 1.008-.134.264-.561.744-.366 1.007-.081.108-.71.9-.298.583-.391.425-.42 1.007-.197.348-.526.66-.482.994-.013.013-.612 1.008-.383.724-.256.284-.572 1.007-.18.28-.443.728-.566.576-.423.432-.585.727-.273.28-.725 1.008-.01.01-.838.998-.17.487-.29.52-.718.79-.242.218-.602 1.007-.164.413-.338.595-.646 1.008-.024.055-.374.952-.634.934-.052.074-.358 1.008-.064 1.007-.41 1.008-.124.115-.833.892-.175.188-1.008.746-.067.074-.941.732-1.008.08-1.008-.073-.35.269-.658.493-1.008.501-.013.013-.83 1.008-.166.222-.737.786-.27.619-.218.388.192 1.008.025.067 1.008.027.706-.094.303-.043 1.008-.174h1.008l.94.217.068.015 1.008.348 1.00',
    '8.246 1.008.088 1.008.18 1.008.11 1.008.013 1.008-.133 1.008-.168 1.008-.05 1.008-.022 1.008.07 1.008.014 1.009-.025 1.008-.084 1.008-.475.143-.127.865-.184 1.008-.11 1.008-.085 1.008.21 1.008-.03 1.008-.204.334.403-.334.276-1.008.58-.202.152.202.086 1.008.37.447.551-.447.315-.747.693-.261.15-1.008.661-.196.196-.812.347-.662.661-.346.225-.91.783-.098.064-1.008.264-.735.68-.273.122-1.008.216-.725.669-.284.182-1.008.488-.337.338-.67.38-1.009.583-.048.044-.96.177-1.008.135-.985.696-.023.015-1.008.402-.591.59-.417.735-.46.273-.548.115-1.008.144-1.008.113-.927.636-.081.105-.662.902.662.568 1.008.144.732.296-.732.197-1.008.091-1.008.057-1.008.426-.288.237.288.86.02.147-.02.013-1.008.284-1.009.244-1.008.423-.201.044-.807.036-1.008.09-1.008.108-1.008.03-1.008.392-.394.352-.566 1.007-.048.039-1.008.408-.716.56-.292.086-1.008.18-1.008-.064-.793.806-.215.231-1.008.67-.286.107-.722.578-.24.43-.769.121-.865-.121-.143-.101-1.008-.41-.959.51-.049.047-.732.961-.276.126-1.008.159-1.008.399-.678.324-.33.032-.454-.032-.554-.127-1.008-.276-1.008-.023-.594.426-.414.786-1.008-.405-1.008.053-.784.574-.224.08-1.008.23-1.009.278-.913.42-.095.268-.177.739-.83.532-1.009-.065-1.008.292-.24.249-.768.24-1 .767-.008.017-.644.99-.364.495-1.008.069-.694.444-.314.12-1.008.14-1.008.004-1.008.47-.36.274-.648.415-1.008-.19-1.009.18-.88.603-.128.069-.39-.07-.618-.261-1.008-.535-1.008.019-.713-.23-.295-.273-1.008-.017-1.008-.609-.149-.109-.859-.518-1.008.384-1.008-.291-.753-.582-.255-.276-.928-.732-.08-.269-.044-.738-.13-1.008-.431-1.008-.403-.403-1.008-.305-1.008.129-1.009.362-.325.217-.683.085-1.008.078-1.008.03-1.008.03-.642-.223.396-1.007.246-.08 1.008-.086 1.008-.055 1.008-.175.87-.612.138-.037 1.009-.16 1.003-.81.005-.044.307-.964-.307-.307-.417-.7.177-1.009.24-.985.013-.022-.013-.02-.254-.988-.271-1.007-.357-1.008-.026-1.008.214-1.007.133-1.008.14-1.008.42-.147 1.009-.457.351-.403.24-1.008.417-.716.388-.291.596-1.008.024-.031 1.008-.574.478-.403.53-.506.61-.501.398-.42.823-.588.185-.068.718-.94.29-.452.537-.555.305-1.008.166-.26 1.008-.28 1.008',
    '.267 1.008.007 1.008-.615 1.008.428.59-.555.419-.765.403-.242.605-.167.998-.84.01-.011 1.008-.12.075.13.933.563.583-.563.425-.448.63-.56.378-.572.355-.435.653-.496 1.008-.109.791-.403.217-.102 1.008-.365.322-.54.408-1.008.278-.615.202-.393.45-1.007.32-1.008.036-.073.101.073.907.491.35.517.658.72 1.009-.415.29-.305.535-1.008.183-.611.957-.397.05-.05.274-.957.735-.752 1.008.433 1.008.242.26.077.748.276.256-.276.328-1.008.424-.364.874-.643.134-.171.614-.837.394-.887.076-.12.262-1.008.146-1.008.524-.291.309.291.284 1.008.415.674.184.333.824.735.693-.735.192-1.007.123-.866.074-.142.33-1.008-.066-1.007-.338-.485-.144-.523-.185-1.007.33-.318.646-.69.281-1.008.08-.085.106.085.902.669.78-.669.155-1.007.056-1.008-.058-1.008-.045-1.007.044-1.008.077-.261.182.261.826.705.246.303.762.826.488.181.52.314.314-.314.298-1.007.396-.63.713-.378.295-.264.45-.744.468-1.007.09-.041.884-.967-.01-1.007.134-.22.533-.788-.533-.738-.111-.27-.23-1.007.341-.644 1.008.137.338-.501.67-.318 1.008.25.548-.94.46-.811 1.008.553.594-.75-.108-1.007-.486-.665-.147-.343.147-.668 1.008.1.382.568.626.645.272.363.737.945.185.063.823.467.41-.467.004-1.008-.414-.567-.15-.44-.083-1.008-.088-1.008-.687-.887-.056-.12-.361-1.008-.002-1.008.419-.298.201.298.807.917.147.09.86.644.31.365.699.821.158.186.594 1.008.256.255 1.008.394.365-.65-.321-1.007-.044-.05-.215-.957-.22-1.008-.573-.617-.233-.39-.775-.897-.102-.111-.331-1.008.258-1.008.175-.323.157.323.85.851.136.157.34 1.008.533.577.397.43.61.863.74.145.269.186.073-.186-.073-.173-.23-.835.23-.334 1.008-.061.821-.612.187-.403 1.008-.307 1.008.683.043.027.965.991.734-.991-.074-1.008-.092-1.008-.216-1.007-.352-.719-.053-.289-.206-1.007-.162-1.008.421-.568.819.568.19.215 1.007-.197 1.008.47.279.52.73.996.009.011.318 1.008.315 1.007.366.418 1.008.466.273-.884-.273-.718-.078-.29-.187-1.007-.086-1.007-.231-1.008-.426-.684-.102-.324-.138-1.007-.21-1.008-.357-1.008-.201-.392-.115-.615-.19-1.008-.296-1.008.6-.48.275.48.453 1.008.28.274.412.734.597.799.403.208.605.548.98.46.028.015 1.008.76.731-.775.277-.372.403.372.605.35',
    '4.468-.354.304-1.008.146-1.007.09-.832.444.832.564.217.339-.217.67-.38.54-.628.467-.68.288-.328.621-1.007.1-.257.393-.75.454-1.008.16-.457.256-.551.357-1.008.395-.506.46-.501.443-1.008.106-.23.426-.778.03-1.007.045-1.008.318-1.008.189-.649.174-.358.283-1.008.105-1.007.05-1.008.026-1.008.014-1.007.135-1.008.097-1.008.124-.722.1-.285.265-1.008-.014-1.007.132-1.008.195-1.008.226-1.007.104-.29.375-.718.363-1.008.132-1.007.138-.744.1-.264.337-1.008.295-1.007.276-.847.075-.16.438-1.008.148-1.008zM80.645 39.964l.17.341-.17.984-.169-.984zm1.008 1.5.303.857.166 1.007-.469.33-.118-.33-.181-1.007zm-9.072 4.707.163.18-.163.867-.099-.867zm42.338 11.21 1.008-.123.109.177-.109.081-1.008.064-.076-.145zm-1.008.866.335.196-.335.224-.548-.224zm-2.016.967 1.008.112.033.124-.033.021-1.008.382-.544-.403zm-3.024 1.196 1.008-.277 1.008-.241.425.566-.425.243-1.008.563-.32.202-.688.16-.468-.16.343-1.008zm6.048 1.854.392.21-.392.246-.399-.247zm-5.04.918.818.299-.818.535-.713-.535zm4.032-.006.178.305-.178.126-.415-.126zm-7.056 1.148 1.008-.144 1.008-.095.24.404-.24.45-1.008.13-.675.427.675.428 1.008-.14.592-.288.416-.214 1.008-.189.346.403-.346.234-1.008.431-.127.343-.881.626-.403.381-.605.179-1.008.392-.437.437-.571.232-1.008.209-.845.567-.163.077-1.008.22-1.008.192-1.009.216-.302.302-.706.148-1.008.005-1.008-.052-.269-.1.27-.107 1.007-.147 1.008-.415.34-.34.668-.27 1.009-.334.663-.403-.663-.437-1.009-.475-.067-.096.067-.077 1.009-.48 1.008-.417.033-.033.975-.192 1.008-.64.052-.176.956-.452.753-.555zm-1.625 2.18.617.29.699-.29-.7-.291zm6.665-2.06.09.045-.09.06-.075-.06zm-5.04 6.08 1.008-.181 1.008.144.026.047.982.79 1.008.09.382.128-.382.712-.317.296-.691.387-1.008.547-.151.073-.857.98-.135.028-.873.164-.9.844.278 1.007.622.287.621-.287.387-.113 1.008-.255.765.368-.765.481-.583.527-.425.44-.626.567-.382.436-.447.572-.561.328-.68.68-.328.21-.93.797-.078.048-1.008.299-.662.661-.346.183-1.009.422-.42.403-.588.218-1.008.638-.15.151-.858.237-1.008.554-.217.217-.79.328-.876.68-.133.077-1.008.175-1.008.119-1.008.299-.575.337-.433.156-1.008.522-.6',
    '14.33.614.355 1.008.388 1.008.01 1.008.012 1.008-.112.932-.653.076-.039 1.008-.2 1.008-.157 1.008-.094.429.49-.429.255-.959.752-.049.029-1.008.237-1.008.729-.014.013-.994.223-1.008.194-1.008.106-1.008.048-.814.437-.194.045-1.008.15-1.008.033-1.008.071-1.009.106-1.008.28-.69.322-.318.117-1.008.203-1.008.091-1.008-.09-1.008-.035-1.008.01-1.008.029-1.008-.056-1.008-.056-.51-.213-.498-.196-1.008-.682-.151-.13-.387-1.007.538-.403 1.008-.587 1.008.21 1.008.243 1.008.192 1.008.16 1.008-.23.557-.593.22-1.007.231-.269.261-.739.236-1.008-.423-1.007.387-1.008.547-.425 1.008-.37.498-.212.51-.32 1.008-.17 1.008-.347.686-.171.323-.095.862-.913.146-.436 1.008-.29.14-.281.868-.51.564-.498.444-.208 1.008.129 1.008-.342 1.008-.064.958-.523-.958-.82-.125-.187-.05-1.008.175-.109 1.008-.28 1.008-.07 1.008.013 1.008-.06 1.008.086 1.008-.173.654-.414-.164-1.008.518-.145 1.009-.668.418-.195.126-1.007.464-.357.423-.651.585-.113 1.008-.008 1.008-.106.982-.78zM81.032 90.686l.621.497 1.008-.173.678-.324-.678-.287-1.008.02zm32.88-19.182.035.037-.036.03-.524-.03zm-2.017.96.03.085-.03.015-.269-.015zM98.79 74.549l.152.016-.152.017-.046-.017zm0 13.082 1.008-.142.254.175-.254.1H98.79l-.125-.1zm2.016 1.937.11.111-.11.097-.188-.097zm-1.008 1.084.017.035-.017.022-.062-.022z" clip-path="url(#p0dbbb3483e)" style="fill:#fff;fill-opacity:.96"/></g><g id="QuadContourSet_2"><path d="m107.863 3.998.006.033.073 1.007.101 1.008.14 1.007-.15 1.008-.122 1.008.155 1.007.805.808.517.2.491.694.312.314.465 1.007-.777.313-.24.695.007 1.008.224 1.007-.084 1.008.06 1.007.033.056.038-.056.092-1.007-.116-1.008.577-1.007.024-1.008.393-.833.085-.175.516-1.007.17-1.008.011-1.008.226-.751.154-.256.854-.902.902.902.106.096 1.008.248.41.663-.02 1.008-.346 1.008.642 1.007.322.361.212-.36.796-.305.816.304-.586 1.008-.23.63-1.008-.02-.345.398.318 1.007.027.028.074-.028.934-.596.345.596-.345.305-.454.703-.002 1.007-.552.567-.63.441-.378.658-.416.35.416.344.34-.344.668-.387.638-.621.37-.356 1.009-.383.161-.269.281-1.007.566-.574 1.008-.273.338.847-.338.594-.397.413-.611.595-.574.',
    '413-.106 1.008-.179 1.007-.15.211-1.008.612-.188.185.188.34 1.009.457.57-.797.438-.339.573.339-.437 1.008-.136.206-.848.801.064 1.008.784.464.943.543-.475 1.008-.468.524-.492.484.492.683 1.008-.46.42.784.588.609.328.399-.328.538-1.008-.146-1.008.54-.127.076-.054 1.007.18.06.086-.06.923-.786.35.786-.2 1.008-.15.285-.851.723.85.454.403-.454.606-.405.89-.603.118-.09.134.09.09 1.008-.224.385-.441.622-.567.955-.106.053-.669 1.007-.233.369-.55.64.55.87.89-.87.118-.066.942-.943.066-.058.573.058.435.073.39-.073.618-.338.063.338-.063.133-.453.875-.14 1.008-.415.509-.324.498-.46 1.008-.224.162-.637.846-.371.511-.333.496-.675.995-.016.013-.907 1.008-.085.119-.785.888.785.464.482-.464.526-.431.541-.576.467-.469.537-.54.47-.713.405-.294.19-1.007.414-.512.527-.496.48-.952.366.952-.365.65-.331.358-.349 1.007-.328.352-.539.656-.47.881-.127.127-.49 1.007-.39.792-.203.216.203.648.626-.648.382-.096.696-.912.312-.314.466.314-.216 1.008-.25.393-.325.614-.42 1.008-.263.272-.558.736-.45.58-.36.427-.648.768-.269.24.269.34 1.008-.282.078-.058.93-.936.15-.072.583-1.007.275-.267.706.267-.302 1.007-.404.432-.37.576-.638.726-.223.282-.785.906-.102.101-.777 1.008-.13.141-.8.866.8.439.63-.439.379-.355.69-.652.318-.317.578-.69.43-.488.708.487-.632 1.008-.076.076-.928.931-.08.08-.65.928-.358.63-.684.378.377 1.007-.27 1.008-.431.514-.463.494-.545.628-.348.38-.66.831-.154.176-.58 1.008-.275.582-.423.425-.585.432-.766.576-.242.174-.843.833-.165.86-.056.148.056.019 1.008.152.428-.17.58-.32.412.32.596.618.533.389-.138 1.007-.395.444-.421.564-.587.618-.391.39-.617.66-.454.347-.554.779-.288.229.008 1.008-.728.367-.722.64-.286.198-1.008.29-.616.52-.392.357-.73.65-.278.55-.57.458-.135 1.008-.303.153-1.008.231-1.008.394-.37.23-.638.517-1.008.344-.243.146-.765.7-.952.308-.056.056-1.009.7-.807.251-.2.285-1.009.502-.662.22-.346.558-1.008.291-.275.16.275.183 1.008-.043.427-.14.581-.368 1.008-.222 1.008-.398.05-.02.959-.372 1.008-.614.077-.022.93-.296 1.009-.313.892-.398.116-.063 1.008-.649.48-.296.528-.367 1.008-.187.524.554-.524.49-.453.518-.555.699-.266.308',
    '-.62 1.008-.122.122-1.008.76-.125.125-.883.75-.241.258-.767.66-.375.348-.633.633-.518.374-.49.517-.862.491-.147.83-.038.178-.97.965-.031.042-.977.585-.7.423-.308.48-.818.528.818.423.484.584-.484.354-1.008.183-1.008.406-.067.065-.94.735-.693.272-.316.313-1.008.545-.24.15-.768.732-.538.276-.47.428-1.008.488-.18.091-.828.545-1.008.335-.272.128-.736.877-1.009.106-.071.025.071.517.254.49-.254.104-1.008.078-1.008.35-1.008.308-.897.168-.11.622-1.009.26-1.008.107-.044.019.044.14 1.008.659.264.208-.264.162-1.008.293-1.008.14-1.008.105-1.008.13-1.008.153-.064.025.064.15 1.008.29 1.008-.074 1.008-.018 1.008.39.671.27-.67.177-1.009.312-.502.518-.506.299-1.008.067-1.008.287-1.008.208-.933.147-.075.1-.265.907-.743.569-.604.439-.404.216-1.008.258-1.009.12-1.008.118-1.008.117-1.008.07-1.008.025-1.008.014-.28.07.089 1.007-.817.896-.076.112-.932.377-1.008.1-1.008.244-1.008.18-1.008.01-.224.096.224.417.421.591-.421.248-1.008.087-1.008.2-.418.473-.59.956-1.009-.31-1.008-.047-1.008-.182-.697-.417-.31-.114-1.009-.031-.294.145.294.507.46.5-.46.417-1.008.296-.885.295.545 1.008-.668.297-.772-.297-.236-.208-1.008-.28-1.008-.041-1.008-.4-.465.929.465.464.7.543-.7.238-.551-.238-.457-.457-1.008-.397-.627-.153-.381-.116-.146.116-.862.49-.659.517-.35.394-.496.614.497.507 1.008.18.552.32-.552.24-1.008.26-.989.508-.02.012-.069-.012-.939-.101-1.008-.218-1.008-.16-1.008.282-1.008-.266-.87-.544-.138-.092-1.008-.39-1.008-.518-.003-.008-1.005-.463-.557.463.557.687.567.32.44.266 1.009.546.35.196.658.534 1.008.229 1.008.176 1.008-.046.071.115-.07.717-.603.29-.406.014-.038-.014-.97-.614-1.008.196-.714.418-.294.166-.205-.166-.443-1.007-.36-.328-1.008-.27-1.008.055-1.008-.12-.689-.345-.197-1.007-.122-.072-1.008-.296-1.008-.45-.818.818-.19.475-.318-.475-.69-.744-.164-.264-.845-.502-.436.502-.572.83-.324.178-.615 1.007-.069.1-.045-.1-.263-1.007-.027-1.008-.355-1.008-.318-.404-1.008-.514-1.008-.006-.496.924-.512.252-1.008.729-1.008-.468-1.008-.373-.137-.14-.871-.256-1.008.089-.735.167-.273.094-1.008.347-1.009.179-1.008.138-1.008.159-.49.09-.518.193-1.008.109',
    '-.507-.301-.5-.246-.62-.762.324-1.007.295-.272 1.008.27 1.008-.363.916.365.092.02.087-.02.921-.67.42-.338.588-.258 1.009.102 1.008-.523 1.008-.32.019-.009.989-.502 1.008-.308.84-.197-.526-1.008-.314-.476-1.008-.527-.002-.005.002-.149.052-.858-.052-.097-.146-.91.146-.95 1.008.432.456-.49-.02-1.008-.22-1.008.4-1.007-.27-1.008-.346-.743-.128-.265-.182-1.007.31-.386 1.008-.594 1.008.504.177-.532-.177-.27-.414-.737.414-.739 1.008.085.98.654.028.024.056-.024.952-.952.008-.056.143-1.008.165-1.007.144-1.008.135-1.008.108-1.007.22-1.008.085-.475.107.475.538 1.008.31 1.007-.18 1.008.233.548 1.008-.448 1.008-.044 1.008.634.236-.69.22-1.008.23-1.007.322-.597.412-.41.271-1.009.174-1.007.008-1.008.144-.47.213.47.354 1.008-.161 1.007.288 1.008.034 1.008.261 1.007.019.019.585.989.409 1.008.014.008.007-.008.302-1.008-.03-1.008.729-.989 1.008.126.279-.144.29-1.008.439-.232.605-.776.246-1.007.157-.476.21-.532.798-.994 1.008.82 1.008-.805.059-.028.95-.184.45-.824.14-1.008.114-1.007.26-1.008-.021-1.008.063-1.007-.034-1.008.035-.162.14-.846-.14-.355-.312-.652-.005-1.008.317-.497.3.497.708.742.228.266.416 1.007.364.473.358.535.302 1.008.348.643 1.009.027.508.337.5.22.125-.22.545-1.007-.67-.947-.09-.06-.167-1.009.257-.782.151-.225.007-1.008-.158-.891-.085-.116.085-.041 1.008-.331 1.008-.418.698.79.31.443.631.564.377.559.204.449.804.624.974.383.034.072.24.936.768 1 .389-1-.03-1.008.152-1.007.083-1.008.414-.76.046-.247-.046-.19-.547-.818-.064-1.008.044-1.007-.102-1.008-.241-1.008-.098-.31-.215-.697-.1-1.008.022-1.007.293-.328 1.008.11.357.218.633 1.007.018.035 1.008-.021.252.994.038 1.007.016 1.008-.051 1.008.02 1.007-.106 1.008-.018 1.008-.01 1.007.05 1.008.246 1.007.478 1.008.093.485.078-.485.263-1.008.199-1.007.142-1.008.107-1.007-.01-1.008.032-1.008-.08-1.007-.053-1.008-.025-1.008-.252-1.007-.4-.97-.902-.038.193-1.007-.064-1.008-.236-.5-.496-.508-.512-.963-.022-.044-.718-1.008-.268-.644-.17-.364.06-1.007-.19-1.008.3-.409.253.41.755.81.201.197-.2.954-.053.053.052.012 1.008.547 1.008.066.753-.625.098-1.007.157-.646.248.646.072 1.007.253',
    ' 1.008.435.665.184.343.483 1.007.341.813.732-.813-.02-1.007-.124-1.008-.178-1.008-.125-1.007-.16-1.008-.125-.347-.32-.66-.22-1.008-.271-1.008-.15-1.007-.047-.1-.18-.908-.828-.888-.148-.12.148-.52.87-.487.138-.09.03.09.747 1.007.231.287.43.72.05 1.009.363 1.007.166.318.493.69.509 1.007.006.015.588.993.308 1.008.112.19.807.817.2.397.229-.397.78-.627.337-.38-.337-.524-1.008.125-.355-.609-.16-1.008.515-.337.296.337.712.702.925.306.083.04 1.008.28.116-.32-.116-.336-.833-.672.162-1.007.67-.22.316.22.693.745.798.262.21.085.017-.085-.017-.135-.378-.872-.63-.62-.28-.388-.601-1.007.14-1.008-.05-1.008-.217-.387-.498-.62-.454-1.008-.056-.103-.506-.905-.502-.5-.694-.507-.314-.267-.63-.74-.378-.779-.18-.23.18-.22.3.22.708.298.582.71.426.484 1.008.506.034.018.974.39.284-.39-.284-.499-.349-.509-.66-.908-.113-.1.114-.235 1.008-.021.253.256.755.592.417.416.591.577.394.43.614.94.505-.94-.22-1.007-.285-.5-.334-.508-.674-.863-.14-.144-.868-.866-.242-.142.242-.316 1.008.009.608.307.4.417.54-.417-.54-.388-.318-.62-.69-.82-.226-.187.226-.478 1.008-.011.964.489.044.053.052-.053.346-1.008-.398-.483-1.008-.356-.213-.168-.795-.555-.727-.453.727-1.002 1.008.865 1.008.135.008.002 1 .261.833.747.175.255.75.752-.75.607-.342.4.342.26.437.749.571.869.178.138.606 1.008.224.487.444.52.298 1.008.267.421.46.587.51 1.007.038.076.462.932.318 1.008.228.67.522.337.233 1.008.162 1.008.09.426.24-.426.017-1.008-.158-1.008-.098-.424-.395-.583-.276-1.008-.207-1.008-.13-.538-.385-.47-.365-1.007-.258-.43-.55-.578-.304-1.007-.154-.45-.279-.558-.494-1.007-.236-.397-.602-.611-.282-1.008.065-1.007-.189-.44-.36-.568-.432-1.008-.052-1.007-.14-1.008-.024-.092-.943-.915.41-1.008-.376-1.008.91-.47.374.47.605 1.008-.483 1.008.511.199.792.808.216.177.9.83.109.376 1.008-.159.066-.216-.066-.163-.508-.845-.41-1.007-.07-1.008-.02-.046-.405-.962-.23-1.007.635-.541.781.54.227.155.54.853.468.637.341.37.667.767.185.242.652 1.007.17.262.742.746.267.267.54.74.468.423.541.585.467.599.388-.599-.26-1.008-.128-.2-.34-.807-.42-1.008-.248-.249-.574-.758-.434-.618-.316-.39-.408-1.008-.284',
    '-.423-.468-.584-.54-.888-.076-.12-.8-1.008.876-.098.173.098.835.826.407.182.6.306.397.702.432 1.007.18.176.667.832.341.571.748-.571.051-1.008.209-.966.507.966.501.405.283.603.044 1.008.199 1.007.482.885.108.123.464 1.007.435 1.008.001.002.775 1.006.19 1.007.043.084.335-.084.12-1.007-.195-1.008-.19-1.008-.07-.17-.448-.837-.309-1.008-.2-1.007-.05-.116-.525-.892-.29-1.008-.194-.41-.497-.597-.248-1.008-.263-.541-.47-.467-.503-1.007-.035-.078-.482-.93-.29-1.008-.236-.746-.106-.261-.31-1.008-.36-1.007.776-.74.403.74.605.755.25.252.463 1.008.295.306.545.701.463.693.234.315.537 1.008.237.425.516.582.249 1.008.224 1.008.02.042.084-.042.62-1.008.174-1.008-.04-1.007-.316-1.008-.52-1.008-.003-.017-.163-.99-.015-1.008.178-.4.475.4.462 1.008.071.015.03-.015.143-1.008-.173-.54-.393-.467.142-1.008-.521-1.008-.213-1.007-.023-.051-.792-.957.352-1.008-.026-1.007-.21-1.008.446-1.008.23-.145 1.008-.686.144.831.439 1.008-.019 1.008.13 1.007.314.819.112.189.542 1.008.354.644.51.363.448 1.008.05.507 1.009.095.17.406.29 1.007.548.823.234.185.214 1.007.56.834.378.174.172 1.008.458.532.285-.532-.13-1.008-.155-.266-.496-.742-.19-1.007-.159-1.008-.152-1.007-.011-.038-.276-.97.047-1.008.229-.542.197.542.39 1.008.42.178.505.83.108 1.007.318 1.008.078.1.434.907.216 1.008.358.575.379-.575-.081-1.008-.186-1.007-.112-.227-.557-.78-.126-1.008-.183-1.008-.142-.29-.476-.718-.216-1.007-.141-1.008-.175-.382-.41-.626-.13-1.007-.163-1.008.703-.99.677.99.26 1.008.07.04.547.967.226 1.008.236.917.09.09.516 1.008.203 1.008.199.51.61.498.216 1.007.154 1.008.028.059.444-.06.4-1.007-.243-1.007-.257-1.008-.344-.456-.24-.552-.397-1.007-.371-.847-.162-.161-.3-1.008-.264-1.007-.282-.552-.516-.456-.207-1.008-.248-1.007-.037-.117-.57-.89-.173-1.008.106-1.008.637-.555.336.555.207 1.008.465.586.297.421.41 1.008.301.617.225.39.394 1.008.39.85.152.158.49 1.007.176 1.008.19.66 1.007-.136.453-.524.229-1.008-.419-1.007-.263-.5-.177-.508.177-.531.298.531.71.464.393-.464-.1-1.008.715-.218.267.218.338 1.008.403.59.34-.59-.036-1.008-.304-.58-.366-.427-.166-1.008-.355-1.007-.12-',
    '.128-.305-.88-.115-1.008.107-1.007.312-.788.246.788.383 1.007.266 1.008.113.106.836.902.172.54.206-.54.238-1.008.565-.697.063-.31-.063-.283-.207-.725.207-.793.095-.215.012-1.008.497-1.007.363-1.008.04-.34.096-.667.529-1.008.384-.87.236-.138-.014-1.007.683-1.008.103-.129 1.008-.786 1.008.826.65-.919.24-1.007-.6-1.008-.29-.304-.612-.704.612-.85.16-.157.517-1.008.313-1.007zm-2.781 8.094-.05 1.007.815.833.512-.833.03-1.007-.542-.665zm2.331 0-.325 1.007-.005 1.008-.039 1.008.017 1.007.368 1.008.434.302.419-.302.248-1.008.018-1.007-.027-1.008-.143-1.008-.134-1.007-.381-.777zm7.31 2.015.196.32.371-.32-.37-.332zm-8.133 5.038-.208 1.008.059 1.007.414.617.305-.617.089-1.007-.226-1.008-.168-.508zm9.145 4.03.192.2.332-.2-.332-.182zm-16.965 5.04.02.02.032-.02-.032-.016zm18.757 1.007.417.25.43-.25-.43-.253zm-.961 1.008.37.085.082-.085-.083-.16zm-11.771 2.015.044.105.017-.105-.017-.108zm1.013 0-.055 1.008.094.354.261-.354-.15-1.008-.111-.202zM85.562 34.26l-.215 1.007.176 1.008.162.32.361.687.43 1.008.218.917.096.09.912.599.331-.598-.067-1.008-.264-.327-.53-.68-.242-1.008-.236-.309-.631-.699-.321-1.007-.057-.116zm33.26 1.007.13.066.086-.066-.086-.385zM84.46 37.282l.145 1.008.073.274.103-.274-.003-1.008-.1-.35zm18.309 1.008.055.253.031-.253-.031-.104zm-17.655 1.008.148 1.007.243 1.008.141 1.008.04.049.542.958.151 1.008.316.667.47.34.122 1.008.143 1.008.273.545.324-.545.016-1.008.056-1.007-.396-.747-.17-.261-.331-1.008-.3-1.007-.207-.498-.666-.51-.09-1.008-.203-1.007-.05-.286zm-4.8 1.007.332.919.36-.919-.36-.755zm7.712 0-.323.806-.043.202.043.072 1.008.77.315-.842.008-1.008-.323-.418zm13.617 0-.245 1.008.418.572.229-.572-.022-1.008-.207-.335zm19.194 1.008.132.075.055-.075-.055-.094zm-39.344 1.008.084 1.007.077.177.174-.177-.07-1.007-.104-.53zm7.836 0 .19 1.007.2.31.28-.31-.238-1.007-.042-.055zm30.56 0 .072.101.049-.101-.05-.089zm-19.567 1.007-.315 1.008-.208.22-.545.788-.156 1.007-.307.473-.537.535-.246 1.007-.225.68-.667-.68-.34-.681-.348.681.165 1.008.182.125.368.883-.175 1.007-.193.194-.611.814.011 1.008-.408.313-.697.694-.071 ',
    '1.008-.24.189-.963-.19.147-1.007-.059-1.007.077-1.008-.21-.1-.045.1-.011 1.008-.339 1.007-.613.886-1.008-.112-.298.234-.71.65-.11.357.015 1.008-.138 1.008.117 1.007-.56 1.008.676.25.18-.25.165-1.008.663-.28.27-.727.236-1.008.502-.557.062-.45.946-.988.343.987-.044 1.008-.299.203-.786.805-.222.923-.395.084-.373 1.008-.24.564-.549.444-.209 1.007-.25.264-.927-.264.018-1.007-.1-.405-1.007.143-.233.262.063 1.007-.838.858-.449.15-.56.56-.224.448-.456 1.007-.133 1.008.814.355.273-.355.735-.984.276.984-.276.7-.394.307-.418 1.008-.196.23-.684.778-.325.492-.71.515-.298.592-.537.416-.352 1.008-.119.123-.746.884-.262.4-.667.608-.34.497-.605.51-.404.526-.47.482-.446 1.008-.092.09-.876.917-.132.132-.8.876-.208.237-.714.77-.294.322-.707.686-.301.351-.616.657-.392.392-.595.616-.413.384-.63.623-.378.4-.642.608-.366.387-.581.62-.427.43-.58.578-.429.425-.535.583-.473.417-.62.59-.388.346-.67.662-.338.336-.716.672-.292.244-.752.763-.256.23-.842.778-.166.145-.96.863-.048.042-1.008.666-.276.3-.732.438-.602.569-.406.282-.769.725-.24.19-.958.818-.05.042-1.007.51-.427.456-.581.36-.728.647-.28.2-1.009.783-.023.025-.985.428-.672.58-.336.195-1.008.778-.031.034-.977.397-.72.61-.288.17-1.008.54-.293.299-.715.318-.93.69-.078.045-1.008.401-.744.56-.264.122-1.008.36-.596.526-.412.181-1.008.384-.503.443-.505.213-1.009.368-.568.427-.44.163-1.008.32-.691.524-.317.13-1.008.281-.969.597-.039.016-1.008.287-1.008.368-.497.337-.511.16-1.008.26-1.008.453-.174.134-.834.247-1.008.225-1.008.331-.428.205-.58.094-.477-.094.477-.838.065-.17.943-.635 1.008-.298.101-.074.907-.76.262-.248.746-.813.191-.195.404-1.007.413-.814 1.008-.06.387-.134.621-.474.146-.534-.08-1.007.942-.771.132-.237.366-1.007.205-1.008.305-.58.135-.428.213-1.007.536-1.008-.884-.518-.379.518-.496 1.008-.133.17-.636.837-.3 1.008-.072.071-.884.937-.124.096-.945.911-.063.073-.847.935-.161.438-.712-.438-.296-.14-.508.14-.5.07-1.008.04-1.008.14-.25-.25-.56-1.008-.199-.397-1.008.297-.057.1-.116 1.008.099 1.007.074.508.123.5-.123.466-.737.542-.234 1.007-.037.07-.076-.07v-1.007l-.576-1.008-.356-.549-.',
    '297.55-.033 1.007-.266 1.007-.412.786-.134.222-.874.874-1.008-.256-.39.39-.618.664-.344.343.268 1.008.076.237.204.77.557 1.008-.761.266-1.008.614-.153.128-.855.267-1.008.222-1.008.306-.511.212-.497.263-1.008.36-.852.385.852.903.282.105.726.119 1.008-.044.314-.075.694-.116 1.008-.202 1.008-.139 1.008-.172 1.008-.113 1.008.08 1.008.524 1.008-.052.637.19.371.101.76-.101.248-.049 1.008-.312 1.009-.061 1.008-.152 1.008-.125 1.008-.012.779-.297.229-.489 1.008-.444.366-.075.642-.04.359.04-.36.29-.258.718.259.22 1.008.063 1.008-.11 1.008.028.428-.201-.109-1.008.69-.218.957.218.05.062 1.008.464 1.008-.027 1.008-.302 1.009.176 1.008.117 1.008-.303 1.008-.014.877-.173.13-.016 1.009-.307 1.008-.287 1.008-.211.48-.186.528-.307 1.008-.5.27-.2.738-.22 1.008-.063 1.008-.021 1.008-.248 1.008-.455.003-.002 1.005-.3 1.009-.16 1.008-.24.926-.307.082-.012 1.008.005 1.008-.158.884-.843.124-.072 1.008-.418 1.008-.447.077-.07.931-.392 1.008-.207 1.008.073 1.008-.004 1.008-.1 1.008-.17.916-.208-.194-1.008-.722-.572-1.008-.174-1.008.087-1.008.032-1.008-.045-1.008-.119-1.008-.076-1.008-.12-.12-.02.12-.092 1.008-.263 1.008-.017 1.008-.033 1.008-.014 1.008.021 1.008.215h1.008l1.008-.144 1.009-.045 1.008-.23 1.008-.354.157-.052.359-1.008.492-.264 1.008-.502.197-.241.81-.316 1.009-.248.742-.444.266-.192 1.008-.662.121-.153.887-.37 1.008-.381.303-.257.705-.306 1.008-.357.536-.345.472-.298.977-.71.031-.016 1.008-.34.979-.651.03-.03 1.008-.467.83-.51.178-.185 1.008-.51.451-.313.557-.32 1.008-.63.06-.058.948-.592.537-.416.471-.354 1.008-.608.057-.045.951-.916.196-.092-.196-.56-.483-.447.483-.257 1.008-.466.33-.285.678-.553.72-.455.288-.297.573-.71.435-.389.45-.619.558-.447.76-.56.249-.32 1.008-.616.072-.072.936-.871.159-.137-.16-.478-1.007.42-.036.058-.972.546-.5.462-.509.422-.922.585-.086.128-1.008.776-.144.104-.864.768-.522.24-.486.514-1.008.42-1.008.062-.023.011-.985.973-.09.035.09.2.41.808-.41.07-1.008-.006-1.008.812-.29.131-.718.262-.78.746-.228.044-.866-.044-.142-.072-1.008-.145-.315.217-.693.66-.594.347-.415.068-1.008.263-1.008.427-1.008.24',
    '7-.011.003-.997.316-1.008.093-1.008.594-.05.005-.958.068-1.008.135-.804.804-.204.04-1.008.243-1.008.058-.94.667-.068.068-1.008.647-.106.293.106.044 1.008.64 1.008.05.28.273-.28.045-1.008.027-1.008.13-1.008.156-1.008-.025-.998-.333-.01-.003-1.009-.215-1.008.006-1.008-.051-1.008.05-1.008-.01-1.008.11-1.008.103-1.008-.005-1.008.002-1.008-.496-1.008-.15-1.008.02-1.008.414-.449.225-.56.662-.692.346-.316.48-.509.528.499 1.007.01.006 1.009.005.498.997.51.132 1.008.316.798.56-.798.553-1.008.05-1.008-.112-1.009-.201-.992-.29-.016-.028-1.008-.587-1.008-.072-1.008-.015-1.008.267-1.008.227-.327-.8.327-.196 1.008-.617.14-.195.868-.427.65-.58.358-.215 1.008-.703.07-.09.938-.439.538-.569.47-.297.802-.71.207-.15 1.008-.794.044-.064.964-.497.48-.51.528-.348.685-.66.323-.25.848-.758.16-.145 1.003-.863.005-.004 1.008-.68.33-.323.678-.481.49-.527.518-.443.601-.564.407-.354.67-.654.338-.327.713-.68.295-.272.773-.736.235-.219.802-.789.206-.211.773-.797.236-.245.764-.762.244-.243.775-.765.233-.247.708-.76.3-.284.761-.724.247-.257.724-.75.284-.33.678-.678.33-.362.63-.646.378-.471.533-.537.475-.517.537-.49.471-.612.372-.396.636-.834.203-.174.658-1.007.147-.17.717-.838.291-.349.573-.658.435-.513.51-.495.498-.759.274-.249.51-1.007.224-.243.59-.765.419-.517.54-.49.468-.807.22-.201.542-1.008.246-.292.558-.716.45-.723.32-.284.308-1.008.38-.514.417-.493.383-1.008.208-.197.578-.81.43-.888.118-.12.515-1.008.375-.555.364-.453.276-1.007.368-.495.396-.513.32-1.008.292-.357.379-.65.312-1.008.317-.412.355-.595.424-1.008.23-.227.404-.78-.02-1.008.623-.637.246-.371.33-1.008.052-1.007.38-.233.372-.775.636-.987.019-.02.388-1.008-.061-1.008-.346-.737zm18.58 0 .05.056.08-.056-.08-.055zm-36.478 1.008.063 1.008.175.568.294-.568-.118-1.008-.176-.234zm-3.862 1.008.068.093.092-.093-.092-.138zm19.05 0 .171.286.067-.286-.067-.358zM72.257 46.35l.239 1.008.084.226.53.781.086 1.008.392.583 1.008-.195.056-.388-.056-.077-.653-.93-.355-.914-.246-.094-.305-1.008-.457-.58zm45.233 1.008.453.251.224-.251-.224-.545zm-47.06 2.016.135.138.617.87.39.536.608.471.4.316.637.692.3',
    '72.698.257.31.43 1.007.265 1.008.056.148.606.86.261 1.007.14.768.237-.768-.055-1.008-.073-1.007-.108-.232-.618-.776-.165-1.007-.225-.483-.589-.525-.373-1.008-.046-.073-1.003-.934-.005-.008-.993-1-.015-.035-1.008-.416zm18.268 0 .012.057.009-.057-.01-.047zm-3.215 1.008.033 1.007.17.6.349-.6-.206-1.007-.144-.21zm-15.209 1.007.29.397.246-.397-.245-.408zm4.07 0 .253.405.69.603.057 1.008.26.58.346.427.336 1.008.245 1.007.082.183.334.825.203 1.008.149 1.007.183 1.008.139.5.15.508.175 1.007.153 1.008.127 1.008.059 1.007.105 1.008.031 1.007.208.453.175.555.17 1.008-.063 1.007-.21 1.008-.072.418-.202-.418-.59-1.008-.057-1.007-.159-.213-.174-.795-.124-1.008-.121-1.007-.148-1.008-.199-1.007-.242-.628-.145-.38-.27-1.008-.22-1.007-.242-1.008-.131-.292-.243-.716-.334-1.007-.431-.935-.037-.073-.348-1.008-.553-1.007-.07-.36-.194-.648-.68-1.007-.134-.237-.724-.771-.284-.22-.364.22.055 1.008.309.328.175.68.107 1.007.35 1.007.376.567.178.441.17 1.008.244 1.007.403 1.008.013.027.366.98.184 1.008.257 1.008.2.54.221.468.208 1.007.181 1.008.201 1.007.198.649.123.36.177 1.007.034 1.007-.081 1.008-.253.424-.606-.424-.402-.388-.073-.62-.135-1.007-.167-1.008-.164-1.008-.345-1.007-.124-.162-.301-.846-.214-1.007-.28-1.008-.213-.342-.345-.666-.373-1.007-.29-.517-.386-.491-.622-.94-.081-.068-.928-.943-.134-.064-.874-.59-.217.59.217.633.21.374.227 1.008.436 1.008.135.198.418.81.328 1.007.263.623.116.385.263 1.007.498 1.008.13.295.138.712-.038 1.008.13 1.008.214 1.007.105 1.008.112 1.008.064 1.007.047 1.008-.081 1.008-.152 1.007.02 1.008-.558.263-.051-.263-.05-1.008-.091-1.007-.126-1.008-.067-1.008-.183-1.007-.44-1.008v-.002l-.247-1.006-.222-1.007-.193-1.008-.336-1.008-.01-.013-.451-.994-.471-1.008-.087-.158-.45-.85-.558-.607-.279-.4-.617-1.008-.112-.13-1.008-.782-.406.912.406.648.27.36.352 1.008.386.79.165.217.32 1.008.205 1.007.318.6.178.408.222 1.008.17 1.007.056 1.008.382.976.008.032.25 1.007.124 1.008.088 1.008.095 1.007-.043 1.008.058 1.007.156 1.008.06 1.008.064 1.007.006 1.008.005 1.008-.04 1.007.033 1.008.144.663.262-.663.747-1.003 1.008',
    '.043.041-.048.413-1.007.425-1.008-.077-1.008.156-1.007.05-.114.101.114.907.65.819-.65.189-.202 1.008-.544.262-.262-.262-.867-.034-.14-.267-1.008.216-1.008.043-1.007-.06-1.008.102-.071.044.07v1.009l.128 1.007.836.835.345.173.663.14.136-.14.872-.76.24-.248.768-.582.437-.425.571-.645.281-.363.727-.84.136-.168.651-1.007.221-.305.4-.703.608-.5.388-.508.62-.707.159-.3.528-1.008.321-.219.252-.789-.252-.724-.788.724-.22.322-.735.686-.273.159-.783.849-.09 1.007-.135.193-1.008.564-.462-.757-.039-1.007-.507-.884-.032-.124-.088-1.008-.055-1.007-.15-1.008-.16-1.007-.202-1.008-.32-.793-.048-.215-.204-1.007-.181-1.008-.12-1.008-.202-1.007-.254-.793-.06-.215-.35-1.008-.363-1.007-.235-.319-.506-.689-.275-1.007-.227-.374-.698-.634-.091-1.008-.22-.342-1.007-.493zm2.264 0 .005.014.017-.014-.017-.02zm14.077 0 .001 1.008.04.165.08-.165-.017-1.008-.063-.11zm-7.117 1.008.037 1.008.064.153.106-.153-.027-1.008-.079-.381zm2.755 0-.063 1.008.088 1.007.346.812.3.196.073 1.007.635.658.195-.658-.04-1.007-.155-.36-.509-.648-.238-1.007-.178-1.008-.083-.175zm35.627 0 .026.02.017-.02-.017-.026zm-44.41 1.008.081.288.217-.288-.217-.912zm41.397 0 .015.007.017-.007-.017-.013zm1.658 0 .373.262.227-.262-.227-.276zm-1.256 1.007.62.311.261-.31-.26-.37zm-40.77 1.008.06.192.111-.192-.111-.43zm1.73 0 .004 1.007.342.978.03.03.423 1.008.203 1.007.284 1.008.068.238.371.77.078 1.007.56.961.44-.96-.025-1.008-.094-1.008-.322-.897-.071-.11-.275-1.008-.206-1.008-.456-.695-.317-.313-.458-1.007-.233-.694zm37.118 0-.482.496-1.005.511-.003.002-1.008.468-.688.538-.32.252-1.008.384-.487.372-.52.315-1.009.634-.08.058-.928.534-.931.474-.077.082-1.008.633-.556.293-.452.697-.353.31.353.26 1.008.161.401-.42.607-.43 1.008-.234.309-.344.7-.367 1.007-.527.113-.114.895-.373 1.008-.63.007-.005 1.001-.54.512-.467.496-.38.745-.628.263-.386.897-.622.112-.105 1.008-.728.165-.174-.165-.416-1.008.034zM65.34 56.427l.185.083.24-.083-.24-.18zm.742 1.008.451.594.437-.594-.437-.744zm52.605 0 .266.094.101-.094-.101-.363zm-51.562 1.008.416.732.128-.732-.128-.274zm-4.681 1.007.057.04.026-.04-.02',
    '6-.036zm13.889 0 .118 1.008.163.877.16-.877-.04-1.008-.12-.808zm42.508 0 .112.092.206-.092-.206-.101zm-3.356 2.016.44 1.007.003.001h.001l.5-1.008-.5-.138zm-4.887 1.007-.718.333-1.008.19-.506.485-.502.163-1.008.03-.627.815-.381.173-1.008.367-.54.467-.468.315-1.008.466-.313.227-.695.364-1.009.283-.548.36-.46.62-1.008.378-.025.01.025.026.606.982-.606.244-1.008.257-.985.506.985.43 1.008-.016 1.008-.111.85-.303.158-.112 1.009-.498 1.008-.27 1.008.046.43-.173-.104-1.008.682-.833.423.833.585.418 1.008-.31.177-.108.83-.627 1.009-.328.082-.053.926-.772.345-.235.663-.456.89-.552.118-.202 1.008-.537.495-.268.513-.647.37-.361-.37-.4-1.008.311-.134-.919-.874-.417-1.008.16zM91.733 64.49v.003l.003-.003-.002-.002zm-27.566 1.007.072 1.008.272 1.007.005.01.53.998.146 1.008.066 1.007.266.861.066.147.221 1.008.12 1.007.08 1.008-.07 1.008-.027 1.007-.013 1.008-.15 1.007-.227.996-.001.012v1.008l-.2 1.007-.05 1.008.045 1.008-.058 1.007-.019 1.008-.02 1.007.034 1.008.265 1.008.004.01.01-.01.998-.333.516-.675.492-.966.012-.042.355-1.007.12-1.008.055-1.007.01-1.008.012-1.008-.014-1.007-.142-1.008.035-1.008.017-1.007-.012-1.008.008-1.007-.158-1.008-.284-1.008-.014-.02-.238-.987-.164-1.008-.202-1.008-.36-1.007-.044-.049-.431-.959-.3-1.008-.277-.668-.25-.34-.39-1.007-.368-.76zm18.36 2.015.134.663.332-.663-.332-.515zm26.267 1.008.077.048.11-.048-.11-.027zm-2.278 1.008.339.177.599-.177-.6-.116zm7.187 1.007-.8.292-1.008.22-1.008.234-.638.262-.37.346-1.008.508-.373.154-.635.408-1.008.24-.411.36-.597.513-1.008.114-.287.38.287.264 1.008.457 1.008-.652 1.008.033.205-.102.803-.696 1.008-.097.409-.215.6-.488 1.007-.116.563-.403.445-.376 1.008-.1.28-.532.728-.832.151-.176-.15-.265-1.009.178zm-1.004 3.023.204.2.237-.2-.237-.328zm-51.432 1.008.166 1.008.059.152.098-.152.086-1.008-.184-.759zm49.966 0-.346.307-1.008.264-.653.437-.355.203-1.008.202-.916.602-.092.059-1.008.227-.996.722-.012.01-1.008.216-1.008.276-.687.505-.321.111-1.009.128-1.008.368-.566.401-.442.13-1.008.267-.83.61-.178.111-1.008.189-1.008.127-1.008.413-.215.168.215.592 1.008.293 1.008-.0',
    '97 1.008-.057 1.008-.02 1.008-.007.3.304-.3.138-1.008.07-1.008.193-1.008.432-.192.175-.816.16-1.008-.087-.32-.073-.688-.192-.295.192-.53 1.007-.183.06-1.008.21-1.008.348-.85.39.458 1.007-.616.336-.762.672.762.449 1.008-.139 1.008-.169 1.008-.067.247-.074-.247-.171-1.008-.428-.562-.409.562-.226 1.008-.214h1.008l.86.44.148.086.239-.086.77-.33 1.007-.441.521-.236.487-.155 1.008-.453 1.008-.27.194-.13.814-.324 1.008-.307.512-.376.497-.303 1.008-.468.26-.237.748-.45.868-.558.14-.23 1.008-.563.354-.214.654-.55.401-.458.607-.877.139-.13.869-.928.088-.08.92-.598.454-.41.554-.47.56-.537.448-.493.487-.515-.487-.495zm-55.8 1.008.01.017.005-.017-.004-.068zm28.215 0 .021.102.108-.102-.108-.026zm19.557 0 .626.137.228-.137-.228-.25zM59.398 76.58l-.123 1.008-.014 1.007.117 1.008.098.147.29.86.054 1.008.079 1.008-.197 1.008-.226.412-.11-.412-.296-1.008.061-1.008-.619-1.007-.044-.029-.67-.979-.28-1.008-.058-.105-.106.105-.634 1.008-.268.11-.25-.11-.758-.317-.771-.69-.238-.277-.088.276-.008 1.008.096.303.638.705.37.543.17.464.071 1.008.156 1.008-.025 1.007-.009 1.008.013 1.007-.126 1.008-.25.345-.663.663-.345.175-.346.832-.184 1.008-.01 1.008-.11 1.007.053 1.008-.08 1.008.137 1.007.54.771.569-.77.44-.896.175-.112-.042-1.008-.133-.142-.13-.866-.126-1.007.174-1.008.082-.28 1.008-.285.115.565-.02 1.008-.046 1.007.029 1.008.04 1.008.383 1.007.507.394.28-.394.468-1.007.26-.74.15-.268.367-1.008.181-1.007.071-1.008.053-1.008.13-1.007.056-.34.263.34.364 1.007.198 1.008.183.594.365-.594.561-1.008.082-.957.01-.05.009-1.008-.02-.013-.437-.995.13-1.007-.049-1.008-.059-1.007-.082-1.008-.117-1.008.027-1.007-.065-1.008-.265-1.008-.09-.183-.55-.824-.38-1.008-.078-.274zm2.701 0-.148 1.008.017 1.007.115 1.008.014 1.008.11 1.007.095 1.008.1 1.008-.375 1.007-.056 1.008.529.945.006.062.054 1.008.041 1.008.05 1.007.307 1.008.55.56.387-.56.297-1.008.093-1.007-.008-1.008.015-1.008-.039-1.007-.007-1.008-.067-1.007-.119-1.008-.083-1.008-.242-1.007-.227-.95-.032-.058-.287-1.008-.24-1.007-.295-1.008-.154-.287zm16.503 5.038.027.096.088-.096-.088-.029zM49.16 82',
    '.626l-.02 1.008-.048 1.007.022 1.008-.052 1.007.047 1.008.248 1.008.038.29.064-.29.24-1.008-.05-1.008-.019-1.007.037-1.008.02-1.007-.089-1.008-.203-.373zm28.445 0 .016.078.073-.078-.073-.02zm27.961 3.023.28.105.131-.105-.13-.333zm-31.984 1.007.007.09.06-.09-.06-.006zm27.287 0 .946.21.31-.21-.31-.29zm3.63 0 .34.097.114-.097-.114-.3zm-6.296 1.008-.42.392-.406.616.405.232.558-.232.45-.48 1.008-.395.609-.133-.609-.264-1.008.092zm-29.761 1.008.106.033.038-.033-.038-.14zm26.307 0 .01.008 1.007.283.295-.291-.295-.156-1.008.152zm-46.692 1.007.25 1.008.08.253.023-.253.044-1.008-.067-.577zm33.814 0-.218.068-1.008.197-1.008.159-1.008.12-1.008.182-1.008-.106-1.008-.102-1.008-.065-1.008.34-.678.215.399 1.008.279.195 1.008.329.531.483.477.253 1.008.206 1.008-.017 1.008-.198 1.008.11 1.008.23 1.008.177 1.008-.043 1.008-.118 1.008-.184 1.008-.148.829-.268-.534-1.007.714-.647 1.008.327.258.32.75.339 1.008-.164.425-.175.515-1.008.068-.02.033.02.975.522 1.008-.099 1.008-.154 1.008-.138.204-.131-.204-.298-1.008-.274-.502-.436-.506-.241-1.008-.282-1.008.004-1.008-.007-1.008-.101-1.008-.004-1.008-.07-1.009.217-1.008.173-1.008.081-1.008.013zm14.667 0 .236.08.123-.08-.123-.239zm.197 1.008.04.02.042-.02-.043-.016zm-52.5 1.008-.252 1.007-.636.823-.14.185-.454 1.008-.055 1.007-.067 1.008-.191 1.007-.101.357-.162.651-.26 1.008-.146 1.007-.11 1.008.039 1.008.055 1.007.584.918.477-.918.162-1.007.194-1.008.103-1.008.072-.107 1.008-.748.052-.152.345-1.008.104-1.008.075-1.007-.005-1.008.056-1.007-.091-1.008-.233-1.008-.135-1.007-.168-.779zm22.27 2.015.027.208.206-.208-.206-.027zm-17.218 1.008-.686 1.007-.214.25-.331.758.019 1.007-.007 1.008.062 1.008.257.595.617-.595.391-.783.039-.225.134-1.008.074-1.007-.074-1.008-.136-1.007-.037-.106zm16.179 0 .058.285.329-.285-.329-.051zm19.879 0 .34.133 1.009.149 1.008-.16.268-.122-.268-.31-1.008-.332-1.009-.02zM60.36 95.725l.123.032.053-.032-.053-.114zm4.02 0 .135.431.46-.43-.46-.117zm-.97 1.008.097.257.263-.257-.263-.069zM39.805 97.74l-.49.47-.758.538.085 1.008-.021 1.007-.214 1.008-.1.232-.24.776-.308 1.0',
    '07.063 1.008.36 1.008.124.127.101-.127.49-1.008.418-.503.249-.505.392-1.007.014-1.008.137-1.008.216-.753.06-.254.01-1.008.125-1.008-.195-.794zm22.525 0 .17.25.293-.25-.293-.114zm5.765 0 .453.363.975-.363-.975-.298zm-6.645 1.008.042.029.028-.029-.028-.018zm-6.234 1.008.228.029.046-.03-.046-.2zm4.249 0 .01.068.142-.068-.141-.009zm-1.069 1.007.072.165.244-.165-.244-.047zm-6.002 1.008.025.006.013-.006-.013-.022zm5.04 0 .026.03.032-.03-.032-.013zm-8.094 2.015.055.009.021-.009-.02-.047zm-13.091 1.008-.054 1.008.095.183.092-.183-.018-1.008-.074-.072zm-.992 2.015-.004 1.008.03.108.085-.108.098-1.008-.184-.095zm15.047 0 .1.15.21-.15-.21-.049zm-18.12 3.023.074.276.216-.276-.216-.261zm-3.983 4.03.025.008.12-.007-.12-.022zm-.113 8.062.138.103 1.008.117.298-.22-.298-.344-1.008-.223zm7.462 0 .74.705 1.008.193 1.008-.359.523-.54-.523-.214-1.008-.161-1.008.008zM2.7 122.93l.324.598.3-.598-.3-1.006zm1.374 0 .966.3 1.008-.065 1.008-.198.117-.037-.117-.191-1.008-.211-1.008.078zm27.413 0 .771.194 1.008-.069 1.008.024.453-.149-.453-.09-1.008-.23-1.008-.106zM109.879 5.24l.212.805.124 1.007-.17 1.008-.166.754-.085-.754-.164-1.008.157-1.007zM98.79 9.61l.062.466.12 1.008.27 1.008-.452.83-.347-.83.221-1.008.073-1.008zm24.194.776.29.698-.149 1.008-.141.21-.546-.21.2-1.008zm-1.008 2.18.202.533-.202.402-.209-.402zm-22.178 1.7.288.849-.288.78-.304-.78zm-2.016 2.15.312.714.037 1.007.358 1.008-.707.229-.068-.229-.09-1.008.029-1.007zm-5.04 1.04.198.681-.198.325-.052-.325zm27.218 3.593.11.111-.11.35-.172-.35zm2.016.693.24.426-.24.55-.289-.55zm-25.202.733.256.7-.256.423-.16-.422zm24.194.412.55.289-.302 1.007-.248.362-.434-.362.109-1.007zm-23.186 1.028.173.268.173 1.008-.346.827-.413-.827-.025-1.008zm23.186 3.968.091.33-.091.235-.602-.234zM71.573 39l.454.298-.454.301-.357-.301zM125 38.898v.925l-.278-.525zM59.476 43.23l1.008-.065.986.162.022.052 1.008.49.638.466-.638.32-1.008-.094-.421.782.42.996.007.011-.006.008-1.008.105-.285-.113-.723-.512-1.008-.33-.14-.165-.868-.836-.334-.172.334-.172 1.008-.136.212-.7zm5.04-.131.394.228-.394.383-.952-.383zM125 ',
    '43.092v.816l-.218-.58zM65.524 44.32l.045.016-.045.021-.015-.021zm-2.016.68.887.344-.887.077-.123-.077zm60.484-.427.304.77-.304.512-.355-.511zM54.435 48.08l1.009-.037 1.008.301.14.022-.14.112-1.008.212-1.009-.217-.145-.107zm3.025.776.322.518-.322.128-.454-.128zm66.532.197.284.321-.284.691-.254-.691zm-73.589 1.923 1.008.107 1.008.303.006.003 1.002.5.464.508.544.748.294.26-.294.393-.98-.393-.028-.012-1.008-.772-.41-.224-.598-.517-1.008-.162-.693-.329zm6.049.368.189.045-.19.097-.85-.097zm1.008.713 1.008.19.248.15-.248.15-1.008-.055-.19-.095zm66.532 1.049.324.299-.324.525-.304-.525zM55.444 54.25l.156.161-.156.186-.232-.186zm-8.065.294 1.008.718.189.157.82.63.631.377-.632.604-1.008-.447-.157-.157-.851-.928-.08-.08zm3.024 2.595.165.295-.165.166-.271-.166zm-6.048 1.805 1.008.499.015.006-.015.726-1.008-.33-.39-.396zm5.04 1.356.484.157-.484.097-.162-.097zm2.016.863.666.302-.666.24-.69-.24zm6.049-.166.75.468-.75.203-.18-.203zm1.008.609.763.866.245.324.573.684-.474 1.008-.1.038-.02-.038-.325-1.008-.662-.57-.351-.438zm62.5.258.27.608-.27.291-.517-.29zm-31.25.693.257.923-.257.895-.21.113-.605 1.007-.193.237-.98-.237.317-1.007.663-.836.09-.172zm22.177.556.983.367-.983.43-.312-.43zm8.065-.316.452.683-.452.452-.599-.452zm-9.073 1.548.216.143-.216.127-.28-.127zm8.065-.275.284.418-.284.263-.46-.263zm-58.468 1.01.216.416-.216.667-.206-.667zm-3.024 1.38.02.044-.02.041-.02-.041zm-10.081 1.046.015.005-.015.01-.005-.01zm55.444.96.185.053-.185.306-.239-.306zm-28.226 3.88.11.204.163 1.007-.273.358-.054-.358.041-1.007zm-32.258.606 1.008.587.021.018-.021.033-1.008.383-.366-.416zm35.282-.107.475.712.213 1.008-.688.475-.246-.475v-1.008zm-49.395 2.727.635 1.008-.635.38-.17-.38.168-1.007zm8.064.9.044.108-.044.053-.034-.053zm6.049-.825.482.933-.25 1.008-.173 1.007-.021 1.008.206 1.008-.244.515-.3-.515.261-1.008-.02-1.008-.125-1.007-.058-1.008zm-5.04 1.728.114.213.029 1.007-.144.208-.125-.208-.121-1.007zm67.54 1.992 1.008.204.029.032-.03.044-1.007.249-.675-.293zm5.04.152.132.084-.132.072-.224-.072zm-90.726.832.24.26.142 1.007-.382.853-.355-.853.0',
    '35-1.007zm83.67-.076 1.008-.292.252.628-.252.155-1.008.397-.767.455-.241.08-1.009.278-1.008.049-.412-.407.412-.144 1.008-.29 1.009-.321.08-.252zm-70.565.723.626.62-.626.378-.149-.378zm77.621.45.351.17-.351.197-.216-.197zm-90.726 6.138.029.078.07 1.008-.099.782-.196-.782.114-1.008zm10.08.897 1.009.122.04.067-.04.233-.168.774-.344 1.008-.496.545-.312.463-.402 1.007-.294.495-.361.513-.163 1.008-.356 1.007.125 1.008.223 1.007.162 1.008-.638.98-.98-.98.064-1.008-.092-.296-.231-.711-.277-1.008.415-1.007-.088-1.008.18-.392.275-.616.637-1.007.097-.102.56-.906.448-.725.262-.283.522-1.007zm2.017 5.022.184.205-.184.932-.414-.932zm-15.121 10.161.443.12-.443.427-.14-.427zm48.387 1.855 1.008-.285 1.008.274 1.008-.119 1.008.094.407.317-.407.044-1.008.056-1.008-.044-1.008.069-1.008-.048-.844-.077zm-17.137 3 .782.303-.782.562-.765.446-.243.273-1.008.355-.363-.628.363-.165 1.008-.406.163-.437zm-20.161.834.854.477-.558 1.008-.296.34-.575-.34.269-1.008zm32.258.345.766.132-.766.129-.723-.129zm-49.395.99.225.15-.225.982-.312-.982zm33.266.117 1.008-.195.466.228-.466.288-1.008-.07-.064-.218zm-1.008.922.355.118-.355.187-.465-.187zm-2.016 1.113.048.013-.048.031-.05-.031zm-20.162.944.032.077-.032.043-.078-.043zm-6.048 10.35.046.81-.046.18-.07-.18z" clip-path="url(#p0dbbb3483e)" style="fill:#949ead;fill-opacity:.08"/><path d="m104.839 32.136.017.108-.017.105-.044-.105zm-19.154 2.008.057.116.32 1.007.632.7.236.308.242 1.007.53.681.264.327.067 1.008-.331.598-.912-.598-.096-.091-.219-.917-.429-1.008-.36-.688-.163-.32-.176-1.007.215-1.007zm17.138 4.042.031.104-.031.253-.055-.253zM80.645 39.55l.36.755-.36.919-.331-.919zm8.065.337.323.418-.008 1.008-.315.841-1.008-.769-.043-.072.043-.202.323-.806zm13.105.083.207.335.022 1.008-.23.572-.417-.572.245-1.008zm19.153 1.249.055.094-.055.075-.132-.075zm-39.315.572.104.53.07 1.007-.174.177-.077-.177-.084-1.007zm8.065.475.042.055.237 1.007-.28.31-.198-.31-.19-1.007zm30.242-.034.049.089-.05.101-.07-.101zm-19.154.359.346.737.061 1.008-.388 1.008-.019.02-.636.987-.372.775-.38.233-.052 1.007-.33 1.008-.246.371',
    '-.623.637.02 1.007-.405.78-.229.228-.424 1.008-.355.595-.317.412-.312 1.008-.379.65-.291.357-.321 1.008-.396.513-.368.495-.276 1.007-.364.453-.375.555-.515 1.008-.118.12-.43.887-.578.811-.208.197-.383 1.008-.417.493-.38.514-.309 1.008-.32.284-.45.723-.557.716-.246.292-.542 1.008-.22.201-.468.806-.54.49-.42.518-.589.765-.224.243-.51 1.007-.274.25-.499.758-.509.495-.435.513-.573.658-.29.35-.718.836-.147.17-.658 1.008-.203.174-.636.834-.372.396-.47.612-.538.49-.475.517-.533.537-.379.471-.63.646-.33.362-.677.678-.284.33-.724.75-.247.257-.761.724-.3.283-.708.761-.233.247-.775.765-.244.243-.764.762-.236.245-.773.797-.206.211-.802.79-.235.218-.773.736-.295.271-.713.681-.338.327-.67.654-.407.354-.6.564-.52.443-.489.527-.679.48-.329.324-1.008.68-.005.004-1.003.863-.16.145-.848.759-.323.249-.685.66-.527.347-.481.511-.964.497-.044.064-1.008.794-.207.15-.802.71-.47.297-.538.57-.938.438-.07.09-1.008.703-.358.215-.65.58-.867.427-.14.195-1.009.617-.327.196.327.8 1.008-.227 1.008-.267 1.008.015 1.008.072 1.008.587.016.027.992.29 1.009.202 1.008.111 1.008-.049.798-.554-.798-.56-1.008-.315-.51-.132-.498-.997-1.009-.005-.01-.006-.499-1.007.51-.529.315-.48.693-.345.56-.662.448-.225 1.008-.414 1.008-.02 1.008.15 1.008.496 1.008-.002 1.008.005 1.008-.102 1.008-.11 1.008.01 1.008-.051 1.008.05 1.008-.005 1.008.215.011.003.998.333 1.008.025 1.008-.156 1.008-.13 1.008-.027.28-.045-.28-.273-1.008-.05-1.008-.64-.106-.044.106-.293 1.008-.647.068-.068.94-.667 1.008-.058 1.008-.243.204-.04.804-.804 1.008-.135.958-.068.05-.005 1.008-.594 1.008-.093.997-.316.011-.003 1.008-.247 1.008-.427 1.008-.263.415-.068.594-.347.693-.66.315-.217 1.008.145.142.072.866.044.228-.044.78-.746.717-.262.29-.13 1.009-.813 1.008.005.41-.07-.41-.807-.09-.2.09-.035.985-.973.023-.01 1.008-.064 1.008-.42.486-.513.522-.24.864-.768.144-.104 1.008-.776.086-.128.922-.585.51-.422.499-.462.972-.546.036-.058 1.008-.42.159.478-.16.137-.935.87-.072.073-1.008.617-.249.318-.76.561-.558.447-.45.62-.435.388-.573.71-.287.297-.72.455-.68.553-.329.285-1.008.466-.483.257.483.446.196.56',
    '1-.196.092-.95.916-.058.045-1.008.608-.47.354-.538.416-.948.592-.06.057-1.008.631-.557.32-.451.314-1.008.509-.179.184-.83.511-1.007.468-.03.029-.979.651-1.008.34-.031.017-.977.709-.472.298-.536.345-1.008.357-.705.306-.303.257-1.008.38-.887.37-.121.154-1.008.662-.266.192-.742.444-1.008.248-.81.316-.198.241-1.008.502-.492.264-.36 1.008-.156.052-1.008.353-1.008.231-1.009.045-1.008.144H67.54l-1.008-.215-1.008-.021-1.008.014-1.008.033-1.008.017-1.008.263-.12.092.12.02 1.008.12 1.008.076 1.008.119 1.008.045 1.008-.032 1.008-.087 1.008.174.722.572.194 1.008-.916.208-1.008.17-1.008.1-1.008.004-1.008-.073-1.008.207-.93.392-.078.07-1.008.447-1.008.418-.124.072-.884.843-1.008.158-1.008-.005-.082.012-.926.307-1.008.24-1.009.16-1.005.3-.003.002-1.008.455-1.008.248-1.008.02-1.008.064-.738.22-.27.2-1.008.5-.529.307-.479.186-1.008.211-1.008.287-1.008.307-.131.016-.877.173-1.008.014-1.008.303-1.008-.117-1.009-.176-1.008.302-1.008.027-1.008-.464-.05-.062-.958-.218-.689.218.109 1.008-.428.201-1.008-.028-1.008.11-1.008-.063-.259-.22.259-.718.359-.29-.36-.04-.64.04-.367.075-1.008.444-.23.489-.778.297-1.008.012-1.008.125-1.008.152-1.009.06-1.008.313-.249.049-.759.101-.371-.101-.637-.19-1.008.052-1.008-.524-1.008-.08-1.008.113-1.008.172-1.008.139-1.008.202-.694.116-.314.075-1.008.044-.726-.12-.282-.104-.852-.903.852-.385 1.008-.36.497-.263.51-.212 1.009-.306 1.008-.222.855-.267.153-.128 1.008-.614.761-.266-.557-1.008-.204-.77-.076-.237-.268-1.008.344-.343.618-.664.39-.39 1.008.256.874-.874.134-.222.412-.786.266-1.007.033-1.008.297-.549.356.55.576 1.007v1.007l.076.07.037-.07.234-1.007.737-.542.123-.466-.123-.5-.074-.508-.1-1.007.117-1.008.057-.1 1.008-.297.2.397.559 1.008.25.25 1.008-.14 1.008-.04.5-.07.508-.14.296.14.712.438.161-.438.847-.935.063-.073.945-.91.124-.097.884-.937.071-.071.3-1.008.637-.836.133-.171.496-1.008.38-.518.883.518-.536 1.008-.213 1.007-.135.428-.305.58-.205 1.008-.366 1.007-.132.237-.943.77.08 1.008-.145.534-.621.474-.387.134-1.008.06-.413.814-.404 1.007-.191.195-.746.813-.262.248-.907.76-.101.074-1.008.298-.943.',
    '635-.065.17-.477.838.477.094.58-.094.428-.205 1.008-.33 1.008-.226.834-.247.174-.134 1.008-.453 1.008-.26.51-.16.498-.337 1.008-.368 1.008-.287.039-.016.97-.597 1.007-.28.317-.13.691-.526 1.008-.32.44-.162.568-.427 1.009-.368.505-.213.503-.443 1.008-.384.412-.18.596-.527 1.008-.36.264-.121.744-.56 1.008-.402.078-.046.93-.69.715-.317.293-.298 1.008-.54.288-.17.72-.611.977-.397.031-.034 1.008-.778.336-.195.672-.58.985-.428.023-.025 1.008-.783.28-.2.729-.648.58-.36.428-.455 1.008-.51.049-.042.959-.819.239-.189.769-.725.406-.282.602-.569.732-.439.276-.3 1.008-.665.048-.042.96-.863.166-.145.842-.778.256-.23.752-.763.292-.244.716-.672.338-.336.67-.662.389-.346.62-.59.472-.417.535-.583.43-.425.579-.579.427-.429.58-.62.367-.387.642-.608.377-.4.63-.623.414-.384.595-.616.392-.392.616-.657.3-.35.708-.687.294-.321.714-.771.207-.237.801-.876.132-.132.876-.918.092-.09.445-1.007.471-.482.404-.525.604-.511.34-.497.668-.608.262-.4.746-.884.119-.123.352-1.008.537-.416.298-.592.71-.515.325-.492.684-.778.196-.23.418-1.008.394-.307.276-.7-.276-.984-.735.984-.273.355-.814-.355.133-1.008.456-1.007.225-.449.559-.56.449-.149.838-.858-.063-1.007.233-.262 1.008-.143.099.405-.018 1.007.927.264.25-.264.21-1.007.548-.444.24-.564.373-1.008.395-.084.222-.923.786-.805.3-.203.043-1.008-.343-.987-.946.987-.062.451-.502.557-.236 1.008-.27.727-.663.28-.166 1.008-.18.25-.675-.25.56-1.008-.117-1.007.138-1.008-.015-1.008.11-.357.71-.65.298-.234 1.008.112.613-.886.339-1.007.011-1.008.045-.1.21.1-.077 1.008.06 1.007-.148 1.008.963.189.24-.19.071-1.007.697-.694.408-.313-.011-1.008.611-.814.193-.194.175-1.007-.368-.883-.182-.125-.165-1.008.347-.681.34.681.668.68.225-.68.246-1.007.537-.535.307-.473.156-1.007.545-.787.208-.221.315-1.008zM88.8 63.48l-.09.172-.663.836-.316 1.007.979.237.193-.237.604-1.007.21-.113.258-.895-.257-.923zm-4.148 9.069.025.036.023-.036-.023-.032zm-3.199 4.03.2.143.123-.143-.123-.223zm-1.085 1.008.277.336.26-.336-.26-.345zm-1.01 1.007.28.433.353-.433-.354-.292zm-.987 1.008.258.595.438-.595-.438-.283zm-.891 1.008.141.546.43-.546-.43-.1',
    '53zm-.93 1.007-.492 1.008.555.087.085-.087.235-1.008-.32-.06zm-1.671 2.016.726.167.167-.167-.167-.726zm-1.262 1.007.98.294.283-.294-.283-.84zm-.91 1.008.882.308.324-.308-.324-.983zm-.9 1.007.774.288.267-.288-.267-.858zm-1.036 1.008.802.324.328-.324-.328-.806zm-1.017 1.008.81.321.323-.321-.322-.8zm-1.223 1.007-.99.883-.128.125-.88.875-.142.133-.867.725-.278.282-.73.658-.38.35-.628.55-.51.458-.498.443-.664.564-.344.333-.963.675-.045.048-1.008.682-.294.277-.714.564-.52.444-.488.416-.779.592-.23.226-1.007.629-.172.152-.837.598-.516.41-.492.387-.956.62-.052.05-1.008.573-.484.385-.524.382-1.008.597-.034.029-.974.574-.598.434-.41.292-1.008.518-.266.197-.742.432-.906.576-.102.081-1.008.45-.759.476-.25.171-1.007.435-.658.402-.35.217-1.008.425-.63.366-.379.224-1.008.373-.77.41-.238.134-1.008.4-.945.474-.063.04-1.008.396-1.008.388-.343.184-.665.329-1.008.32-.858.358-.15.08-1.008.35-1.008.317-.651.26-.357.174-1.008.327-1.008.268-.766.24-.243.102-1.008.29-1.008.32-.777.295-.23.129-1.009.383-1.008.192-1.008.297-.013.007-.995.497-1.008.262-1.008.237-.044.011.044.067 1.008.406 1.008-.029 1.008-.037 1.008-.001 1.008.018 1.008-.05 1.008-.116.578-.258.43-.152 1.008-.306.954-.55.055-.027 1.008-.327 1.008-.194 1.008-.29.396-.169.612-.134 1.008-.127.724.261.284.221 1.008.249 1.008.011 1.008.056 1.008.31 1.008.101 1.008-.06.893.12.115.012 1.008.143 1.009.129 1.008-.006 1.008-.236 1.008-.032.094-.01-.094-.06-.685-.948.685-.628.26-.38.748-.148 1.008-.111 1.008-.098 1.008-.076 1.008.01 1.008.105 1.008-.016 1.008-.103 1.008-.051 1.008-.224 1.008-.242.203-.053.805-.853 1.009.015.52-.17-.52-1.005-1.009.465-1.008.504-1.008-.14-.314.176-.694.153-1.008-.107-1.008.121-1.008-.05-1.008-.014-1.008-.05-1.008-.03-1.008.08h-1.008l-1.008-.08-.37-.023-.638-.106-1.008-.06-1.008.038-.717.128-.292.085-1.008.504-1.008.396-.05.023-.958.29-1.008.263-1.008.102-1.008.137-.055-.792.055-.025 1.008-.272 1.008-.334.41-.377.598-.238 1.008-.349.475-.42.533-.243 1.008-.362.46-.403.549-.283 1.008-.421.35-.304.658-.346 1.008-.548.12-.113.888-.448.81-.56.198-.148 1.008-.',
    '457.505-.403.503-.35 1.008-.622.034-.035.974-.583.56-.425.448-.341 1.008-.654.014-.012.994-.595.536-.413.472-.376.86-.632.148-.15 1.008-.618.27-.24.739-.534.563-.473.445-.378.851-.63.157-.158 1.008-.639.218-.21.79-.61.445-.398.563-.509.58-.499.428-.409.71-.598.298-.31.911-.698.097-.117 1.008-.817.078-.073.93-.81.204-.198.804-.776.242-.232.766-.703.32-.304.688-.639.375-.369.633-.648.35-.36-.35-.829-1.008.813zm23.859 7.054.352.3 1.008-.294.01-.006-.01-.02-1.008-.155zm-2.476 1.007-.196.15-1.008.379-.828.48-.18.16-1.008.825-.03.022-.979.404-.856.603-.152.11-1.008.358-.765.54-.243.27-1.008.399-.425.339-.583.595-.768.412.768.315 1.008-.092.468-.223.54-.475.959-.532.05-.043 1.007-.504 1.008-.309.23-.152.779-.766.818-.242.19-.075.898-.932.11-.124 1.008-.405.891-.479.117-.155 1.008-.725.27-.128-.27-.32-1.008-.014zm-11.756 7.054.471.017 1.008.092.224-.11-.224-.672-1.008.607zm-14.486 1.008.844.077 1.008.048 1.008-.07 1.008.045 1.008-.056.407-.044-.407-.317-1.008-.094-1.008.119-1.008-.274-1.008.285zm12.49 0-.557.224-1.008.728-.207.055.207.026 1.008.23.719-.256.289-.638 1.008-.258.15-.111-.15-.906-1.008.23zm-9.858 2.015-.518 1.007.746.176 1.008.046 1.008-.073 1.008.05 1.009.425 1.008-.308.338-.316.67-.553 1.008-.38.12-.074-.12-.575-1.008-.205-1.008.134-1.007.646h-.001l-1.009.11-.701-.11-.307-.021-1.008.01-1.008.003zm-19.77 1.007-.163.437-1.008.406-.363.165.363.628 1.008-.355.243-.273.765-.446.782-.562-.782-.303zm-19.622 1.008-.27 1.008.576.34.296-.34.558-1.008-.854-.477zm31.841 0 .723.129.766-.129-.766-.132zm-15.47 1.008.064.218 1.008.07.466-.288-.466-.228-1.008.195zm-1.41 1.007.466.187.355-.187-.355-.118zm-1.6 1.008.05.031.048-.031-.048-.013zm-20.19 1.008.078.043.032-.043-.032-.077zm98.869-70.59.08.055-.08.056-.05-.056zm-36.29.829.175.234.118 1.008-.294.568-.175-.568-.063-1.008zm15.12.884.067.358-.067.286-.172-.286zm-25.201.786.457.58.305 1.007.246.094.355.913.653.931.056.077-.056.388-1.008.195-.392-.583-.086-1.008-.53-.781-.084-.226-.24-1.008zm13.104 4.4.144.21.206 1.007-.35.6-.169-.6-.033-1.007zm-15.12.81.245.407-.245.397-',
    '.29-.397zm4.032-.428 1.008.493.219.342.09 1.008.699.634.227.374.275 1.007.506.69.235.318.364 1.007.348 1.008.061.215.254.793.202 1.007.12 1.008.18 1.008.205 1.007.047.215.32.793.203 1.008.16 1.007.15 1.008.055 1.007.088 1.008.032.124.507.884.039 1.007.462.757 1.008-.564.134-.193.091-1.007.783-.85.273-.158.735-.686.22-.322.788-.724.252.724-.252.789-.321.22-.528 1.007-.159.3-.62.707-.388.508-.608.5-.4.703-.22.305-.652 1.007-.136.169-.727.839-.28.363-.572.645-.437.425-.769.582-.239.248-.872.76-.136.14-.663-.14-.345-.173-.836-.835-.128-1.007v-1.008l-.044-.071-.102.07.06 1.009-.043 1.007-.216 1.008.267 1.007.034.141.262.867-.262.262-1.008.544-.19.202-.818.65-.907-.65-.101-.114-.05.114-.156 1.007.077 1.008-.425 1.008-.413 1.007-.041.048-1.008-.043-.747 1.003-.262.663-.144-.663-.033-1.008.04-1.007-.005-1.008-.006-1.008-.064-1.007-.06-1.008-.156-1.008-.058-1.007.043-1.008-.095-1.007-.088-1.008-.124-1.008-.25-1.007-.008-.032-.382-.976-.056-1.008-.17-1.007-.222-1.008-.178-.408-.318-.6-.204-1.007-.321-1.008-.165-.218-.386-.79-.352-1.007-.27-.36-.406-.648.406-.912 1.008.781.112.131.617 1.008.28.4.557.608.45.849.087.158.47 1.008.451.994.01.013.337 1.008.193 1.008.222 1.007.247 1.006v.002l.44 1.008.183 1.007.067 1.008.126 1.008.09 1.007.05 1.008.052.263.558-.263-.02-1.008.152-1.007.08-1.008-.046-1.008-.064-1.007-.112-1.008-.105-1.008-.214-1.007-.13-1.008.038-1.008-.137-.712-.131-.295-.498-1.008-.263-1.007-.116-.385-.263-.623-.328-1.008-.418-.81-.135-.197-.436-1.008-.227-1.008-.21-.374-.217-.633.217-.59.874.59.134.064.928.943.08.067.623.941.386.491.29.517.373 1.007.345.666.213.342.28 1.008.214 1.007.3.846.125.162.345 1.007.164 1.008.167 1.008.135 1.007.073.62.402.388.606.424.253-.424.08-1.008-.033-1.007-.177-1.008-.123-.36-.198-.648-.2-1.007-.182-1.008-.208-1.007-.22-.469-.201-.54-.257-1.007-.184-1.007-.366-.98-.013-.028-.403-1.008-.243-1.007-.171-1.008-.178-.441-.377-.567-.35-1.007-.106-1.008-.175-.68-.309-.327-.055-1.008.364-.22.284.22.724.77.134.238.68 1.007.194.647.07.36.553 1.008.348 1.008.037.073.43.935.335 1.007.243.716.',
    '13.292.242 1.008.221 1.007.27 1.008.145.38.242.628.199 1.007.148 1.008.121 1.007.124 1.008.174.795.159.213.057 1.007.59 1.008.202.418.071-.418.21-1.008.064-1.007-.17-1.008-.175-.555-.208-.453-.03-1.007-.106-1.008-.059-1.007-.127-1.008-.153-1.008-.176-1.007-.149-.508-.14-.5-.182-1.008-.15-1.007-.202-1.008-.334-.825-.082-.183-.245-1.007-.336-1.008-.345-.428-.26-.58-.057-1.007-.691-.603-.253-.405zm-.028 9.904.028.133.03-.133-.03-.322zm-3.084 3.023.088.353.095-.353-.095-.81zm.917 2.015.08 1.008.099.307.102-.307-.031-1.008-.071-.335zm2.182 7.054-.04 1.007.053.358.273-.358-.164-1.007-.11-.204zm2.79 1.007v1.008l.247.475.688-.475-.213-1.008-.475-.712zM90.727 51.28l.063.11.016 1.008-.08.165-.039-.165-.001-1.008zm-4.032.943.083.175.178 1.008.238 1.007.509.647.154.36.041 1.008-.195.658-.635-.658-.073-1.007-.3-.196-.346-.812-.088-1.007.063-1.008zm35.282.15.017.025-.017.02-.026-.02zm-1.008.757.227.276-.227.262-.373-.262zm-1.008.914.26.37-.26.31-.621-.31zm-39.315.683.233.694.458 1.007.317.313.456.695.206 1.008.275 1.007.071.11.322.898.094 1.008.025 1.007-.44.961-.56-.96-.078-1.008-.37-.77-.069-.238-.284-1.008-.203-1.007-.423-1.008-.03-.03-.342-.978-.005-1.007zm37.299.312 1.008-.034.165.416-.165.174-1.008.728-.112.105-.897.622-.263.386-.745.629-.496.379-.512.467-1.001.54-.007.005-1.008.63-.895.373-.113.114-1.008.527-.7.367-.308.344-1.008.234-.607.43-.401.42-1.008-.162-.353-.259.353-.31.452-.697.556-.293 1.008-.633.077-.082.931-.474.929-.534.08-.058 1.007-.634.521-.315.487-.372 1.008-.384.32-.252.688-.538 1.008-.468.003-.002 1.005-.51.482-.497zm-2.017 6.29.501.138-.5 1.007v.001h-.004l-.44-1.008zm-5.04.888 1.008-.16.874.417.134.92 1.008-.312.37.4-.37.361-.513.647-.495.268-1.008.537-.118.202-.89.552-.663.456-.345.235-.926.772-.082.053-1.008.328-.831.627-.177.108-1.008.31-.585-.418-.423-.833-.682.833.104 1.008-.43.173-1.008-.046-1.008.27-1.009.498-.158.112-.85.303-1.008.11-1.008.017-.985-.43.985-.506 1.008-.257.606-.244-.606-.982-.025-.026.025-.01 1.008-.378.46-.62.548-.36 1.009-.283.695-.364.313-.227 1.008-.466.467-.315.54-.467 1.',
    '009-.367.38-.173.628-.815 1.008-.03.502-.163.506-.486 1.008-.189.718-.333zm.696 1.265.312.43.983-.43-.983-.367zm-.975 1.008.28.127.215-.127-.216-.143zm-8.024 4.03.239.306.185-.306-.185-.053zm-38.068-3.783.367.76.39 1.008.251.34.278.667.299 1.008.431.96.043.048.361 1.007.202 1.008.164 1.008.238.986.014.021.284 1.008.158 1.008-.008 1.007.012 1.008-.017 1.007-.035 1.008.142 1.008.014 1.007-.012 1.008-.01 1.008-.055 1.007-.12 1.008-.355 1.007-.012.042-.492.966-.516.675-.997.333-.01.01-.005-.01-.265-1.008-.034-1.008.02-1.007.02-1.008.057-1.007-.045-1.008.05-1.008.2-1.007v-1.008l.001-.012.226-.996.15-1.007.014-1.008.027-1.007.07-1.008-.08-1.008-.12-1.007-.221-1.008-.066-.147-.266-.86-.066-1.008-.146-1.008-.53-.998-.005-.01-.272-1.007-.072-1.008zm18.145 2.26.332.515-.332.663-.134-.663zm31.25 3.451 1.008-.178.151.265-.15.176-.73.832-.279.531-1.008.101-.445.376-.563.403-1.008.116-.599.488-.409.215-1.008.097-.803.696-.205.102-1.008-.033-1.008.652-1.008-.457-.287-.264.287-.38 1.008-.114.597-.514.41-.359 1.009-.24.635-.408.373-.154 1.008-.508.37-.346.638-.262 1.008-.235 1.008-.219.8-.292zm-1.008 2.782.237.328-.237.2-.204-.2zm-51.411.577.184.759-.086 1.008-.098.152-.059-.152-.166-1.008zm50.403.264.487.495-.487.515-.449.493-.559.538-.554.47-.454.409-.92.598-.088.08-.87.927-.138.13-.607.878-.401.459-.654.549-.354.214-1.008.564-.14.23-.868.558-.749.449-.26.237-1.007.468-.497.303-.512.376-1.008.307-.814.324-.194.13-1.008.27-1.008.453-.487.155-.52.236-1.009.44-.769.331-.239.086-.147-.086-.861-.44h-1.008l-1.008.214-.562.226.562.409 1.008.428.247.171-.247.074-1.008.067-1.008.17-1.008.138-.762-.449.762-.672.616-.336-.458-1.007.85-.39 1.008-.347 1.008-.21.182-.06.531-1.008.295-.192.689.192.319.073 1.008.088.816-.161.192-.175 1.008-.432 1.008-.193 1.008-.07.3-.138-.3-.304-1.008.007-1.008.02-1.008.057-1.008.097-1.008-.293-.215-.592.215-.168 1.008-.413 1.008-.127 1.008-.189.178-.11.83-.611 1.008-.266.442-.13.566-.402 1.008-.368 1.009-.128.321-.11.687-.506 1.008-.276 1.008-.217.012-.01.996-.721 1.008-.227.092-.059.916-.602 1.008-.202.355-',
    '.203.653-.437 1.008-.264.346-.307zm-10.188 5.533.108.05.885-.05-.885-.043zm2.457 0 .675.293 1.008-.249.029-.044-.03-.032-1.007-.204zm-2.269 1.008-.08.252-1.009.322-1.008.289-.412.144.412.407 1.008-.049 1.009-.278.241-.08.767-.455 1.008-.397.252-.155-.252-.628-1.008.292zm1.656 1.007.28.103.16-.103-.16-.157zm-2.57 1.008.834.233.431-.233-.431-.306zm-1.508 1.008.325.101.343-.101-.343-.189zm4.358-8.31.228.249-.228.137-.626-.137zm-44.355.982.079.274.379 1.008.55.824.09.183.266 1.008.064 1.008-.027 1.007.117 1.008.082 1.008.06 1.007.049 1.008-.131 1.007.438.995.019.013-.008 1.008-.011.05-.082.957-.56 1.008-.366.594-.183-.594-.198-1.008-.364-1.007-.263-.34-.057.34-.129 1.007-.053 1.008-.07 1.008-.182 1.007-.367 1.008-.15.269-.26.739-.468 1.007-.28.394-.507-.394-.383-1.007-.04-1.008-.029-1.008.047-1.007.02-1.008-.116-.565-1.008.284-.082.281-.174 1.008.126 1.007.13.866.133.142.042 1.008-.175.112-.44.895-.569.771-.54-.77-.137-1.008.08-1.008-.053-1.008.11-1.007.01-1.008.184-1.008.346-.832.345-.175.664-.663.25-.345.125-1.008-.013-1.007.009-1.008.025-1.007-.156-1.008-.071-1.008-.17-.464-.37-.543-.638-.705-.096-.303.008-1.008.088-.276.238.276.77.691.759.317.25.11.268-.11.634-1.008.106-.105.058.105.28 1.008.67.98.044.028.62 1.007-.062 1.008.297 1.008.109.412.226-.412.197-1.008-.079-1.008-.054-1.007-.29-.861-.098-.147-.117-1.008.014-1.007.123-1.008zm3.024-.013.154.287.295 1.008.24 1.007.287 1.008.032.057.227.95.242 1.008.083 1.008.119 1.008.067 1.007.007 1.008.039 1.007-.015 1.008.008 1.008-.093 1.007-.297 1.008-.387.56-.55-.56-.307-1.008-.05-1.007-.041-1.008-.054-1.008-.006-.062-.53-.945.057-1.008.375-1.007-.1-1.008-.094-1.008-.11-1.007-.015-1.008-.115-1.008-.017-1.007.148-1.008zm-13.105 5.96.203.373.089 1.008-.02 1.007-.037 1.008.02 1.007.05 1.008-.241 1.008-.064.29-.038-.29-.248-1.008-.047-1.008.052-1.007-.022-1.008.048-1.007.02-1.008zm56.452 3.063.13.333-.13.105-.281-.105zm-4.032 1.05.31.29-.31.21-.946-.21zm3.024-.01.114.3-.114.097-.34-.097zm-6.049 1.136 1.008-.092.609.264-.609.133-1.008.394-.45.48-.558.233-.405-.232.405-.616',
    '.421-.392zm-4.032 1.176 1.008-.152.295.156-.295.29-1.008-.282-.009-.008zm-12.097.794 1.008-.013 1.008-.08 1.008-.174 1.009-.216 1.008.069 1.008.004 1.008.101 1.008.007 1.008-.004 1.008.282.506.241.502.436 1.008.274.204.298-.204.131-1.008.138-1.008.154-1.008.1-.975-.523-.033-.02-.068.02-.515 1.008-.425.175-1.008.164-.75-.34-.258-.32-1.008-.326-.714.647.534 1.007-.829.268-1.008.148-1.008.184-1.008.118-1.008.043-1.008-.177-1.008-.23-1.008-.11-1.008.198-1.008.017-1.008-.206-.477-.253-.531-.483-1.008-.33-.28-.194-.398-1.008.678-.215 1.008-.34 1.008.065 1.008.102 1.008.106 1.008-.182 1.008-.12 1.008-.159 1.008-.197.218-.068zm14.113-.022.123.24-.123.079-.236-.08zm-52.42 1.476.17.779.134 1.007.233 1.008.09 1.008-.055 1.007.005 1.008-.075 1.007-.104 1.008-.345 1.008-.052.152-1.008.748-.072.107-.103 1.008-.194 1.008-.162 1.007-.477.918-.584-.918-.055-1.007-.038-1.008.11-1.008.146-1.007.26-1.008.16-.65.102-.358.19-1.007.068-1.008.055-1.007.454-1.008.14-.185.636-.823.251-1.007zm5.041 3.696.037.106.136 1.007.074 1.008-.074 1.007-.134 1.008-.039.225-.391.783-.617.595-.257-.595-.062-1.008.007-1.008-.02-1.007.332-.759.214-.249.686-1.007zm-9.072 2.334.195.794-.126 1.008-.008 1.008-.061.254-.216.753-.137 1.008-.014 1.008-.392 1.007-.25.505-.416.503-.49 1.008-.102.127-.123-.127-.361-1.008-.063-1.008.308-1.007.24-.776.1-.232.214-1.008.021-1.007-.085-1.008.758-.538.49-.47zm28.225.496.975.298-.975.363-.453-.363zm-32.258 7.28.074.072.018 1.008-.092.183-.095-.183.054-1.008zm-1.008 1.992.184.095-.098 1.008-.086.108-.03-.108.005-1.008zm-4.032 9.96.952.211-.952.441-.82-.44zm-3.024 4.683 1.008.223.298.344-.298.22-1.008-.117-.138-.103zm-23.186 1.25 1.008-.078 1.008.21.117.192-.117.037-1.008.198-1.008.066-.966-.3z" clip-path="url(#p0dbbb3483e)" style="fill:#75808f;fill-opacity:.12"/><path d="m74.597 60.136.03.322-.03.133-.028-.133zm-3.024 2.534.095.81-.095.354-.088-.353zm1.008 2.49.07.336.032 1.008-.102.307-.099-.307-.08-1.008zm12.096 7.358.023.032-.023.036-.025-.036zm-3.024 3.84.123.222-.123.143-.2-.143zm-1.008.885.26.345-.26.336-.277-.336zm',
    '-1.008 1.06.354.292-.354.433-.28-.433zM78.63 79.32l.438.283-.438.595-.258-.595zm23.186.24.885.043-.885.05-.108-.05zm-24.194.898.43.153-.43.546-.141-.546zm-1.008 1.1.32.06-.235 1.008-.085.087-.555-.087.492-1.008zm27.218-.097.16.157-.16.103-.28-.103zm-2.016.859.431.306-.431.233-.835-.233zm-26.21.588.167.726-.167.167-.726-.167zm24.193.537.343.189-.343.101-.325-.101zm-25.201.355.283.841-.283.294-.98-.294zm-1.008.866.324.983-.324.308-.882-.308zm-1.008 1.132.267.858-.267.288-.774-.288zm-1.008 1.06.328.806-.328.324-.802-.324zm-1.008 1.014.322.8-.322.321-.811-.321zm-2.017 1.791 1.008-.813.35.83-.35.36-.633.647-.375.37-.688.638-.32.304-.766.703-.242.232-.804.776-.204.198-.93.81-.078.073-1.008.817-.097.117-.911.699-.299.309-.71.598-.427.41-.58.498-.563.51-.445.398-.79.609-.218.21-1.008.639-.157.158-.851.63-.445.378-.563.473-.739.535-.27.239-1.008.618-.147.15-.86.632-.473.376-.536.413-.994.595-.014.012-1.008.654-.448.341-.56.425-.974.583-.034.035-1.008.622-.503.35-.505.403-1.008.457-.199.148-.81.56-.887.448-.12.113-1.008.548-.657.346-.351.304-1.008.421-.548.283-.46.403-1.009.362-.533.243-.475.42-1.008.35-.598.237-.41.377-1.008.334-1.008.272-.055.025.055.792 1.008-.137 1.008-.102 1.008-.262.958-.291.05-.023 1.008-.396 1.008-.504.292-.085.717-.128 1.008-.038 1.008.06.639.106.369.022 1.008.08 1.008.001 1.008-.08 1.008.03 1.008.05 1.008.014 1.008.05 1.008-.12 1.008.106.694-.153.314-.177 1.008.141 1.008-.504 1.009-.465.52 1.005-.52.17-1.009-.015-.805.853-.203.053-1.008.242-1.008.224-1.008.05-1.008.104-1.008.016-1.008-.104-1.008-.011-1.008.076-1.008.098-1.008.11-.748.15-.26.379-.685.628.685.949.094.059-.094.01-1.008.032-1.008.236-1.008.006-1.009-.13-1.008-.142-.115-.012-.893-.12-1.008.06-1.008-.102-1.008-.31-1.008-.055-1.008-.011-1.008-.249-.284-.22-.724-.262-1.008.127-.612.134-.396.17-1.008.289-1.008.194-1.008.327-.055.028-.954.549-1.008.306-.43.152-.578.258-1.008.116-1.008.05-1.008-.018h-1.008l-1.008.038-1.008.029-1.008-.406-.044-.067.044-.01 1.008-.238 1.008-.262.995-.497.013-.007 1.008-.297 1.008-.192 1.008-.383.23-.129.778-.',
    '296 1.008-.319 1.008-.29.243-.103.766-.239 1.008-.268 1.008-.327.357-.173.65-.261 1.009-.317 1.008-.35.15-.08.858-.358 1.008-.32.665-.33.343-.183 1.008-.388 1.008-.396.063-.04.945-.474 1.008-.4.239-.134.77-.41 1.007-.373.38-.224.629-.366 1.008-.425.35-.217.658-.402 1.008-.435.25-.17.758-.478 1.008-.449.102-.081.906-.576.742-.432.266-.197 1.008-.518.41-.292.598-.434.974-.574.034-.029 1.008-.597.524-.382.484-.385 1.008-.572.052-.05.956-.62.492-.388.516-.41.837-.598.172-.152 1.008-.629.23-.226.778-.592.488-.416.52-.444.714-.564.294-.277 1.008-.682.045-.048.963-.675.344-.333.664-.564.498-.443.51-.458.629-.55.38-.35.73-.658.277-.282.867-.725.141-.133.881-.875.127-.125.991-.883zm-19.225 16.139.072.017.028-.017-.028-.028zm-2.036 1.007.092.074.184-.074-.184-.05zm-1.115 1.008.199.016.026-.016-.026-.033zm-2.156 1.007.339.114.255-.114-.255-.122zm-1.908 1.008.23.124.404-.124-.403-.095zm-1.96 1.008.175.122.634-.122-.634-.074zm-1.999 1.007.157.107.863-.107-.863-.058zm-2.199 1.008.34.173.848-.173-.848-.115zm-2.09 1.008.414.139.673-.14-.673-.11zm-1.716 1.007.114.02.072-.02-.072-.025zm-1.714 2.015.82.441.952-.44-.952-.212zm62.312-20.327 1.008.154.01.02-.01.007-1.008.293-.352-.3zm-2.016.848 1.008.015.27.32-.27.127-1.008.725-.117.155-.891.48-1.008.404-.11.124-.898.932-.19.075-.818.242-.78.766-.229.152-1.008.309-1.008.504-.049.043-.959.532-.54.475-.468.223-1.008.092-.768-.315.768-.412.583-.595.425-.339 1.008-.398.243-.271.765-.54 1.008-.358.152-.11.856-.603.98-.404.029-.022 1.008-.825.18-.16.828-.48 1.008-.379.196-.15zm-12.097 7.322 1.008-.607.224.673-.224.11-1.008-.093-.47-.017zm-2.016.398 1.008-.23.15.906-.15.111-1.008.258-.29.638-.718.257-1.008-.23-.207-.027.207-.055 1.008-.728.556-.224zm-10.08 2.683 1.007-.004 1.008-.01.307.022.701.11 1.009-.11 1.008-.646 1.008-.134 1.008.205.12.575-.12.075-1.008.379-.67.553-.338.316-1.008.308-1.009-.426-1.008-.049-1.008.073-1.008-.046-.746-.176.518-1.007z" clip-path="url(#p0dbbb3483e)" style="fill:#575e6b;fill-opacity:.17"/><path d="m49.395 105.774.028.028-.028.017-.072-.017zm-2.016.985.184.05-',
    '.184.074-.092-.074zm-1.008 1.025.026.033-.026.016-.199-.016zm-2.016.918.255.122-.255.114-.34-.114zm-2.016 1.035.403.095-.403.124-.231-.124zm-2.016 1.03.634.073-.634.122-.175-.122zm-2.017 1.022.863.058-.863.107-.157-.107zm-2.016.951.848.115-.848.173-.34-.173zm-2.016 1.012.673.11-.673.14-.415-.14zm-2.016 1.093.072.025-.072.02-.114-.02z" clip-path="url(#p0dbbb3483e)" style="fill:#3d424c;fill-opacity:.22"/></g></g></g><defs><clipPath id="p0dbbb3483e"><path d="M0 0h125v132H0z"/></clipPath></defs></svg>'
  ].join(''))
  ]);

  const BUTTERFLY_TONES = Object.freeze([
    ['radial-gradient(circle at 78% 40%, rgba(255,214,120,.98), rgba(244,158,54,.96) 52%, rgba(122,66,26,.94) 100%)', 'rgba(58,34,16,.55)'],
    ['radial-gradient(circle at 78% 40%, rgba(255,255,255,.98), rgba(240,242,236,.96) 56%, rgba(196,202,190,.92) 100%)', 'rgba(120,126,116,.45)'],
    ['radial-gradient(circle at 78% 40%, rgba(168,214,255,.98), rgba(96,150,236,.96) 54%, rgba(38,64,140,.94) 100%)', 'rgba(24,38,86,.55)'],
    ['radial-gradient(circle at 78% 40%, rgba(255,244,150,.98), rgba(244,214,74,.96) 54%, rgba(158,118,32,.92) 100%)', 'rgba(96,72,22,.50)']
  ]);

  const IS_MOBILE = (() => {
    try {
      if (window.matchMedia && window.matchMedia('(max-width: 720px), (pointer: coarse)').matches) return true;
    } catch (e) {}
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent || '');
  })();
  const HW_LOW_POWER = IS_MOBILE || ((navigator.hardwareConcurrency || 8) <= 4) || ((navigator.deviceMemory || 8) <= 4);
  let HAS_BATTERY = false;         // 배터리 신호(노트북/태블릿) 감지 시 true
  let IS_LOW_POWER = HW_LOW_POWER; // v2.2.0: 절전 설정/배터리 감지로 런타임에 갱신된다.

  // 한곳에서 캔버스 렌더링 예산을 관리한다. 일반 데스크톱의 기존 품질은 유지하고,
  // 모바일/저전력/절전 모드에서만 내부 해상도와 프레임 상한을 낮춘다.
  // v2.2.0: IS_LOW_POWER가 런타임에 바뀔 수 있어, 로드 시 고정하지 않고 호출 시점에 계산한다.
  const CANVAS_FPS_TABLE = Object.freeze({
    rain: [16, 36],
    night: [12, 30],
    mana: [16, 36],
    bokeh: [16, 36],
    fireworks: [18, 40],
    underwater: [12, 30]
  });

  function getCanvasFps(effect) {
    const pair = CANVAS_FPS_TABLE[effect] || [24, 36];
    return IS_LOW_POWER ? pair[0] : pair[1];
  }

  function getCanvasDpr(kind) {
    const deviceDpr = Math.max(1, Number(window.devicePixelRatio) || 1);
    if (IS_LOW_POWER) return 0.75;
    return Math.min(kind === 'rain' ? 1.25 : 1.5, deviceDpr);
  }

  function computePowerSaveActive() {
    const mode = state.settings?.powerSaver || 'auto';
    if (mode === 'on') return true;
    if (mode === 'off') return false;
    return HW_LOW_POWER || HAS_BATTERY;
  }

  function applyPowerSaveMode(reason = 'power-save') {
    const next = computePowerSaveActive();
    const attr = next ? 'true' : 'false';
    try { document.documentElement.setAttribute('data-cawf-low-power', attr); } catch (e) {}
    state.root?.setAttribute?.('data-cawf-low-power', attr);
    if (next === IS_LOW_POWER) return;
    IS_LOW_POWER = next;

    // 새 FPS/해상도/입자 수가 즉시 반영되도록, 지금 돌고 있는 렌더 루프만 재기동한다.
    state.particleSignature = '';
    rebuildParticles(reason);
    if (state.rainAnimId) stopCanvasRain(false);
    if (state.ambientAnimId || state.underwaterAnimId) stopAmbientAnimation();
    stopNightSky();
    resumeActiveRenderLoops(reason);
    syncNightSky(reason);
  }

  function initBatteryPowerDetect() {
    // 배터리가 실제로 잡히는 기기(노트북/태블릿)만 auto 절전 대상으로 승격한다.
    // 데스크톱 크롬은 보통 charging=true, level=1, dischargingTime=Infinity라 걸리지 않는다.
    try {
      if (typeof navigator.getBattery !== 'function') return;
      navigator.getBattery().then(battery => {
        if (!battery) return;
        const check = () => {
          if (HAS_BATTERY) return;
          const portable =
            battery.charging === false ||
            Number.isFinite(battery.dischargingTime) ||
            (typeof battery.level === 'number' && battery.level < 0.995);
          if (portable) {
            HAS_BATTERY = true;
            applyPowerSaveMode('battery-detect');
          }
        };
        check();
        ['chargingchange', 'levelchange', 'dischargingtimechange'].forEach(ev => {
          try { battery.addEventListener(ev, check); } catch (e) {}
        });
      }).catch(() => {});
    } catch (e) {}
  }

  // 비는 바닥 효과 없이, 위에서 아래로 곧게 떨어지는 빗줄기만 사용.

  // 자동 감지는 위 DEFAULT_KEYWORDS / 설정창의 사용자 키워드만 사용한다.
  // Fantasy effect sources / inspirations:
  // - Aurora: https://codepen.io/TundraTech/pen/AbJQMb
  // - Fireflies: https://codepen.io/slyka85/pen/BJEbVL
  // - Fireworks: https://codepen.io/rukouen/pen/NbrOag

  const state = {
    settings: { ...DEFAULTS },
    root: null,
    rainCanvas: null,
    rainCtx: null,
    timeLayer: null,
    timeWash: null,
    nightSky: null,
    nightSkyCanvas: null,
    nightSkyCtx: null,
    nightSkyStars: null,
    nightSkyStaticCanvas: null,
    nightSkyStaticCtx: null,
    nightSkyDpr: 1,
    nightSkyAnimId: 0,
    nightSkyFrameAt: 0,
    nightSkyNeedsRebuild: true,
    ambient: null,
    underwaterLayer: null,
    underwaterCanvas: null,
    underwaterAnimId: 0,
    underwaterGl: null,
    underwaterProgram: null,
    underwaterSignature: '',
    rainDrops: [],
    rainSplashes: [],
    rainAnimId: 0,
    rainLastTs: 0,
    rainHitFloorY: 0,
    rainFloorAt: 0,
    rainFrameAt: 0,
    rainResizeAt: 0,
    rainResizeTimer: 0,
    particles: null,
    button: null,
    buttonPos: null,
    buttonDragging: false,
    buttonFadeTimer: 0,
    panel: null,
    visibilityObserver: null,
    effectInView: true,
    runtimePaused: false,
    effectHost: null,
    mountHost: null,
    mountHostCache: null,
    bounds: null,
    lastAppliedGeom: null,
    lastBoundsAt: 0,
    lastBoundsOk: false,
    scanTimer: 0,
    routeTimer: 0,
    routeBurstTimers: [],
    routeRaf: 0,
    boundsRefreshRaf: 0,
    boundsRefreshLastRun: 0,
    boundsRefreshTrailingTimer: 0,
    routeHookInstalled: false,
    navigationRouteHookInstalled: false,
    routeEntryObserver: null,
    routeEntryFallbackTimer: 0,
    routeEntryRaf1: 0,
    routeEntryRaf2: 0,
    pendingRouteEntryScan: false,
    pendingRouteEntryReason: '',
    uiTimer: 0,
    lastEpisodeId: '',
    pendingGenerateDoneScan: false,
    pendingGenerateDoneMessageId: '',
    generateReadyObserver: null,
    generateReadyFallbackTimer: 0,
    generateReadyRaf1: 0,
    generateReadyRaf2: 0,
    lastScannedDomSignature: '',
    lastScannedGroupNode: null,
    scanCount: 0,
    lastScanReason: '',
    lastScanAt: 0,
    lastTextHash: '',
    lastDetectedEffect: 'none',
    lastDetectedTimeEffect: 'none',
    lastDetectedKeyword: '',
    activeEffect: 'none',
    activeTimeEffect: 'none',
    particleSignature: '',
    ambientSignature: '',
    ambientAnimId: 0,
    ambientFrameAt: 0,
    ambientCanvas: null,
    ambientCtx: null,
    ambientEffectRuntime: null,
    ambientLastTs: 0,
    galaxySeed: (Math.random() * 1e9) | 0,
    galaxyRotation: Math.random() * Math.PI * 2,
    particleSeed: Date.now(),

    rainAudio: null,
    rainAudioUrl: '',
    rainAudioResolvedUrl: '',
    rainAudioMeta: null,
    rainNodes: null,
    rainStopTimer: 0,
    audioFadeTimer: 0,
    audioUnlocked: false,
    audioError: '',

    cricketAudio: null,
    cricketAudioUrl: '',
    cricketAudioResolvedUrl: '',
    cricketAudioMeta: null,
    cricketNodes: null,
    cricketStopTimer: 0,
    cricketAudioFadeTimer: 0,
    cricketAudioUnlocked: false,
    cricketAudioError: '',

    waveAudio: null,
    waveAudioUrl: '',
    waveAudioResolvedUrl: '',
    waveAudioMeta: null,
    waveNodes: null,
    waveStopTimer: 0,
    waveAudioFadeTimer: 0,
    waveAudioUnlocked: false,
    waveAudioError: '',
    fireworksAudio: null,
    fireworksAudioUrl: '',
    fireworksAudioResolvedUrl: '',
    fireworksAudioMeta: null,
    fireworksNodes: null,
    fireworksStopTimer: 0,
    fireworksAudioFadeTimer: 0,
    fireworksAudioUnlocked: false,
    fireworksAudioError: '',
    underwaterAudio: null,
    underwaterAudioUrl: '',
    underwaterAudioResolvedUrl: '',
    underwaterAudioMeta: null,
    underwaterNodes: null,
    underwaterStopTimer: 0,
    underwaterAudioFadeTimer: 0,
    underwaterAudioUnlocked: false,
    underwaterAudioError: '',
    spellAudio: null,
    spellAudioUnlocked: false,
    spellAudioPlaying: false,
    spellAudioError: '',

    silentAudioUri: '',
    autoUnlockBound: false
  };

  function log(...args) {
    if (state.settings.debug) console.log(`[${SCRIPT_NAME}]`, ...args);
  }

  function safeJsonParse(value, fallback = {}) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function clampValue(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function normalizeChoice(value, allowed, fallback) {
    const raw = String(value || '').trim();
    return allowed.includes(raw) ? raw : fallback;
  }

  function normalizeAudioUrl(value, fallback = '') {
    const raw = String(value || '').trim();
    if (!raw) return fallback;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^data:audio\//i.test(raw)) return raw;
    if (/^blob:/i.test(raw)) return raw;
    return fallback;
  }

  function normalizeKeywordText(value, fallback = '') {
    const raw = value === undefined || value === null ? String(fallback || '') : String(value);
    return raw
      .replace(/\r/g, '\n')
      .split('\n')
      .map(line => line.replace(/[	 ]+/g, ' ').trim())
      .join('\n')
      .trim();
  }

  function normalizeStoredKeywordText(value, fallback = '', ...legacyDefaults) {
    const normalized = normalizeKeywordText(value, fallback);
    // 이전 기본값이 localStorage에 그대로 저장된 경우만 새 기본값으로 자동 이관한다.
    // 사용자가 직접 편집한 값은 어느 이전 기본값과도 완전히 같지 않으므로 보존된다.
    if (legacyDefaults.some(item => item && normalized === normalizeKeywordText(item, ''))) {
      return normalizeKeywordText(fallback, '');
    }
    return normalized;
  }

  function normalizeDefaultKeyword(effect, value) {
    return normalizeStoredKeywordText(
      value,
      DEFAULT_KEYWORDS[effect] || '',
      V240_DEFAULT_KEYWORDS[effect] || '',
      PREVIOUS_DEFAULT_KEYWORDS[effect] || '',
      LEGACY_DEFAULT_KEYWORDS[effect] || ''
    );
  }

  function parseKeywordText(value) {
    const raw = normalizeKeywordText(value, '');
    if (!raw) return [];

    const seen = new Set();
    return raw
      .split(/[\n,，、|/]+/g)
      .map(item => item.trim())
      .filter(Boolean)
      .filter(item => {
        const key = normalizeForKeywordSearch(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function getKeywordsForEffect(effect) {
    const field = EFFECT_KEYWORD_FIELDS[effect];
    return field ? parseKeywordText(state.settings[field]) : [];
  }

  function getAudioNameFromUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    if (/^data:audio\//i.test(raw)) return 'data audio';
    if (/^blob:/i.test(raw)) return 'blob audio';
    try {
      const parsed = new URL(raw, location.href);
      const last = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname || 'audio url');
      return last || parsed.hostname || 'audio url';
    } catch (_) {
      return raw.slice(0, 80);
    }
  }

  function isPixabayPageUrl(url) {
    try {
      const parsed = new URL(String(url || ''), location.href);
      return /(^|\.)pixabay\.com$/i.test(parsed.hostname)
        && /\/sound-effects\//i.test(parsed.pathname)
        && !/\.(mp3|ogg|wav|m4a)(\?|#|$)/i.test(parsed.pathname);
    } catch (_) {
      return false;
    }
  }

  function isDirectAudioUrl(url) {
    const raw = String(url || '').trim();
    return /^data:audio\//i.test(raw)
      || /^blob:/i.test(raw)
      || /\.(mp3|ogg|wav|m4a)(\?|#|$)/i.test(raw)
      || /cdn\.pixabay\.com\/(?:download\/)?audio\//i.test(raw);
  }

  function hasPlayableAudioSource(audio) {
    const src = String(audio?.currentSrc || audio?.src || '').trim();
    return !!src && src !== state.silentAudioUri && !isPixabayPageUrl(src);
  }

  function readAudioResolveCache() {
    const cache = safeJsonParse(localStorage.getItem(AUDIO_RESOLVE_CACHE_KEY), {});
    return cache && typeof cache === 'object' ? cache : {};
  }

  function saveAudioResolveCache(sourceUrl, resolvedUrl) {
    if (!sourceUrl || !resolvedUrl || sourceUrl === resolvedUrl) return;
    const cache = readAudioResolveCache();
    cache[sourceUrl] = { url: resolvedUrl, at: Date.now() };
    localStorage.setItem(AUDIO_RESOLVE_CACHE_KEY, JSON.stringify(cache));
  }

  function getCachedResolvedAudioUrl(sourceUrl) {
    const item = readAudioResolveCache()[sourceUrl];
    if (!item?.url) return '';
    // Pixabay CDN 주소가 바뀔 수도 있으니 7일 이상 된 캐시는 무시.
    if (Date.now() - Number(item.at || 0) > 7 * 24 * 60 * 60 * 1000) return '';
    return normalizeAudioUrl(item.url, '');
  }

  function unescapeHtmlUrl(value) {
    return String(value || '')
      .replace(/\\u002F/g, '/')
      .replace(/\\\//g, '/')
      .replace(/&amp;/g, '&')
      .replace(/\\u0026/g, '&')
      .replace(/\\u003D/g, '=')
      .replace(/\\u003F/g, '?')
      .replace(/\\u003A/g, ':')
      .replace(/\\u002D/g, '-')
      .replace(/\\u002E/g, '.');
  }

  function extractAudioUrlFromPixabayHtml(html, pageUrl) {
    const source = unescapeHtmlUrl(html);
    const absolutePatterns = [
      /https?:\/\/cdn\.pixabay\.com\/(?:download\/)?audio\/[^"'<>\s]+?\.(?:mp3|ogg|wav|m4a)(?:\?[^"'<>\s]*)?/ig,
      /https?:\/\/pixabay\.com\/download\/audio\/[^"'<>\s]+?\.(?:mp3|ogg|wav|m4a)(?:\?[^"'<>\s]*)?/ig
    ];

    for (const pattern of absolutePatterns) {
      const matches = Array.from(source.matchAll(pattern)).map(match => unescapeHtmlUrl(match[0]));
      const best = matches.find(url => /cdn\.pixabay\.com\/download\/audio\//i.test(url))
        || matches.find(url => /cdn\.pixabay\.com\/audio\//i.test(url))
        || matches[0];
      if (best) return best;
    }

    const relative = source.match(/['"](\/download\/audio\/[^'"<>\s]+?\.(?:mp3|ogg|wav|m4a)(?:\?[^'"<>\s]*)?)['"]/i);
    if (relative?.[1]) return new URL(unescapeHtmlUrl(relative[1]), pageUrl).href;

    return '';
  }

  function gmFetchText(url) {
    return new Promise((resolve, reject) => {
      const request = typeof GM_xmlhttpRequest === 'function'
        ? GM_xmlhttpRequest
        : (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function' ? GM.xmlHttpRequest : null);

      if (!request) {
        reject(new Error('GM_xmlhttpRequest를 사용할 수 없어서 Pixabay 페이지에서 오디오 주소를 추출하지 못했어요.'));
        return;
      }

      request({
        method: 'GET',
        url,
        headers: { Accept: 'text/html,application/xhtml+xml,*/*' },
        onload: response => {
          const status = Number(response.status || 0);
          if (status >= 200 && status < 400) resolve(String(response.responseText || ''));
          else reject(new Error(`Pixabay 페이지 요청 실패: HTTP ${status || 'unknown'}`));
        },
        onerror: () => reject(new Error('Pixabay 페이지 요청이 실패했어요.')),
        ontimeout: () => reject(new Error('Pixabay 페이지 요청 시간이 초과됐어요.')),
        timeout: 15000
      });
    });
  }

  async function resolvePlayableAudioUrl(sourceUrl) {
    const url = normalizeAudioUrl(sourceUrl, '');
    if (!url) return '';
    if (isDirectAudioUrl(url)) return url;

    const cached = getCachedResolvedAudioUrl(url);
    if (cached && isDirectAudioUrl(cached)) return cached;

    if (!isPixabayPageUrl(url)) return url;

    const html = await gmFetchText(url);
    const resolved = normalizeAudioUrl(extractAudioUrlFromPixabayHtml(html, url), '');
    if (!resolved) {
      throw new Error('Pixabay 페이지에서 직접 오디오 주소를 찾지 못했어요. 다운로드 버튼으로 받은 mp3 직접 링크를 넣어 주세요.');
    }

    saveAudioResolveCache(url, resolved);
    return resolved;
  }

  function isEpisodePath(pathname = location.pathname) {
    return /\/stories\/[^/]+\/episodes\/[^/?#]+/.test(pathname)
      || /\/episodes\/[^/?#]+/.test(pathname);
  }

  function getEpisodeId(pathname = location.pathname) {
    const match = String(pathname || '').match(/\/episodes\/([^/?#]+)/);
    return match ? String(match[1] || '') : '';
  }

  function getElementRect(element) {
    if (!(element instanceof HTMLElement)) return null;
    const rect = element.getBoundingClientRect();
    if (!rect || rect.width < 80 || rect.height < 120) return null;
    return rect;
  }

  function findEffectViewport() {
    if (!isEpisodePath()) return null;

    // v0.2.16 safety:
    // Use the stable main chat host only. Putting the layer in body can cover the whole UI,
    // and putting it directly inside the virtual scroller can fight Crack's virtualization wrappers.
    const main = document.querySelector('main');
    const rect = getElementRect(main);
    return rect ? main : null;
  }

  function resetEffectHostMarker() {
    if (state.effectHost instanceof HTMLElement) {
      state.effectHost.removeAttribute('data-cawf-effect-host');
    }
  }

  function parkRootInBodyHidden(root) {
    if (!(root instanceof HTMLElement)) return;
    state.lastAppliedGeom = null;
    root.setAttribute('data-cawf-host-found', 'false');
    if (root.parentElement !== document.body) {
      document.body.appendChild(root);
    }
  }

  const BG_CLEAR_ATTR = 'data-cawf-bg-clear';

  function bgIsOpaque(value) {
    const raw = String(value || '').trim();
    if (!raw || raw === 'transparent') return false;
    const m = raw.match(/^rgba?\(([^)]+)\)/i);
    if (!m) return false;
    const parts = m[1].split(',').map(s => parseFloat(s));
    // 알파가 명시된 경우만 사용. rgb()는 알파 정보가 없어 과탐지를 유발하므로
    // 0.6 이상 충분히 불투명할 때만 가림막으로 본다.
    if (parts.length >= 4) return Number(parts[3]) >= 0.6;
    if (parts.length === 3) return true;
    return false;
  }

  function elementHasOpaqueBackdrop(el) {
    if (!(el instanceof HTMLElement)) return false;
    // v0.7.4: gradient/이미지 배경은 occluder로 보지 않는다(다크모드 흰 레이어 원인).
    // 오직 충분히 불투명한 background-color만 가림막으로 판정한다. ::before/::after도 색만 본다.
    const layers = [getComputedStyle(el), getComputedStyle(el, '::before'), getComputedStyle(el, '::after')];
    return layers.some(cs => cs && bgIsOpaque(cs.backgroundColor));
  }

  function getDominantChild(node, refArea) {
    let best = null;
    let bestArea = 0;
    const children = node.children;
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      if (!(child instanceof HTMLElement)) continue;
      if (child.id === IDS.root) continue;
      const rect = child.getBoundingClientRect();
      const area = Math.max(0, rect.width) * Math.max(0, rect.height);
      if (area > bestArea) { bestArea = area; best = child; }
    }
    // 단일 자식이 host 면적 절반 이상을 덮을 때만 '배경 프레임'으로 보고 더 내려간다.
    // 그렇지 않으면(메시지 리스트 등) 멈춰서 말풍선 배경은 건드리지 않는다.
    return best && bestArea >= refArea * 0.5 ? best : null;
  }

  function elementHasPaintedBackdrop(el) {
    // 마운트용: 색이든 그라데이션이든 '깔린 배경'이 있으면 호스트 후보로 본다.
    if (!(el instanceof HTMLElement)) return false;
    const cs = getComputedStyle(el);
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
    return bgIsOpaque(cs.backgroundColor);
  }

  function findDominantPaintedFrame(main) {
    // main에서 지배적 자식 체인을 따라 내려가며 호스트 후보를 찾는다.
    // 1순위: 배경이 실제로 칠해진(색/그라데이션) 큰 프레임 → 효과 뒤를 받쳐줘 흰 레이어가 없다.
    // 2순위(순정 방처럼 배경 프레임을 못 찾을 때): 가장 안쪽까지 도달한 지배적 프레임.
    //   배경이 없어도 isolation으로 stacking을 만들면 그 뒤 조상 배경이 비치고 효과가 그 위에 얹힌다.
    let node = main instanceof HTMLElement ? main : null;
    let depth = 0;
    let lastDominant = null;
    while (node instanceof HTMLElement && depth < 8) {
      if (node.children.length > 40) break;
      const rect = node.getBoundingClientRect();
      const area = Math.max(1, rect.width * rect.height);
      const dom = getDominantChild(node, area);
      if (!dom) break;
      if (elementHasPaintedBackdrop(dom)) return dom; // 1순위: 칠해진 프레임
      lastDominant = dom;                              // 2순위 후보(배경 무관, main보다 안쪽)
      node = dom;
      depth += 1;
    }
    return lastDominant;
  }

  function findPaintedAncestorForMain(mainEl) {
    // 순정 방 실제 구조 기준:
    // main 자체와 바로 위 wrapper는 투명이고, 그 위 조상 div가 rgb(20,20,19) 배경을 칠한다.
    // 효과는 이 '배경을 칠하는 조상'의 첫 자식으로 들어가야 한다.
    // 그래야 배경 위 / main·shell·헤더·채팅 아래에 놓이며, main/shell DOM은 전혀 건드리지 않는다.
    if (!(mainEl instanceof HTMLElement)) return null;

    const mainRect = mainEl.getBoundingClientRect();
    let node = mainEl.parentElement;
    let guard = 0;
    while (node instanceof HTMLElement && node !== document.documentElement && guard < 10) {
      if (node.id !== 'cawf-mount-box' && elementHasPaintedBackdrop(node)) {
        const r = node.getBoundingClientRect();
        const coversMain = r.width > 1 && r.height > 1
          && r.width >= mainRect.width * 0.75
          && r.height >= mainRect.height * 0.75;
        if (coversMain) return node;
      }
      node = node.parentElement;
      guard += 1;
    }

    // 최후 폴백: body도 실제 배경색이 있으면 쓸 수는 있다.
    // 단, 정상 케이스는 main 위의 rgb(20,20,19) 조상 div다.
    return elementHasPaintedBackdrop(document.body) ? document.body : null;
  }

  function ensureCawfMountBox(mainEl) {
    // 핵심 원칙:
    // - main 직계/ shell 내부는 React·에리 확프가 민감하게 보는 영역이라 절대 삽입하지 않는다.
    // - 대신 main 위쪽에서 실제 배경을 칠하는 조상 div를 찾아 그 '첫 자식'으로 box를 둔다.
    // - 이 위치는 조상 배경보다 위, 뒤따르는 main/shell/헤더/채팅보다 아래다.
    if (!(mainEl instanceof HTMLElement)) return null;

    const mountParent = findPaintedAncestorForMain(mainEl);
    if (!(mountParent instanceof HTMLElement)) return null;

    let box = document.getElementById('cawf-mount-box');
    if (!(box instanceof HTMLElement)) {
      box = document.createElement('div');
      box.id = 'cawf-mount-box';
      box.setAttribute('aria-hidden', 'true');
    }

    // main/shell은 건드리지 않고, 배경 조상 안의 가장 앞에 둔다.
    // 뒤에 오는 원래 앱 wrapper가 같은 stacking에서 box 위에 그려진다.
    if (box.parentElement !== mountParent || mountParent.firstElementChild !== box) {
      mountParent.insertBefore(box, mountParent.firstChild);
    }

    // sgb-bg-root와 같은 계열: fixed + z-index:0 + isolation 없음.
    // 크기는 applyRootBounds에서 mainRect에 맞춰 세팅한다.
    box.style.setProperty('position', 'fixed', 'important');
    box.style.setProperty('pointer-events', 'none', 'important');
    box.style.removeProperty('isolation');
    box.style.setProperty('z-index', '0', 'important');
    box.style.setProperty('overflow', 'hidden', 'important');
    return box;
  }

  function findEffectMountHost(main) {
    const cached = state.mountHostCache;
    if (cached?.host instanceof HTMLElement && cached.host.isConnected && performance.now() - Number(cached.at || 0) < 800) {
      if (cached.mode === 'sgb') {
        if (document.documentElement.classList.contains('sgb-bg-image-active')) {
          return { host: cached.host, mode: 'sgb' };
        }
        state.mountHostCache = null;
      } else if (cached.mode === 'box') {
        const parent = cached.host.parentElement;
        if (parent?.isConnected && parent.firstElementChild === cached.host) {
          return { host: cached.host, mode: 'box' };
        }
        state.mountHostCache = null;
      } else {
        state.mountHostCache = null;
      }
    } else if (cached) {
      state.mountHostCache = null;
    }

    // 1순위: 배경블러(sgb)에 '실제 배경 이미지가 활성화된 상태'일 때만 그 레이어에 얹는다.
    // SGB는 이미지가 없어도 #sgb-bg-root를 display:block/full-rect로 유지하지만,
    // html.sgb-bg-image-active가 없으면 CSS상 #sgb-bg-root { opacity:0 } 이라 그 안의 CAWF도 같이 사라진다.
    // 그래서 rect/display만 보지 말고, 이미지 활성 클래스 + 실제 img src까지 확인한다.
    const sgbRoot = document.getElementById('sgb-bg-root');
    if (sgbRoot instanceof HTMLElement && sgbRoot.isConnected) {
      const r = sgbRoot.getBoundingClientRect();
      const cs = getComputedStyle(sgbRoot);
      const img = sgbRoot.querySelector('#sgb-bg-img');
      const imgSrc = String(
        img?.getAttribute?.('src')
        || img?.getAttribute?.('data-src')
        || img?.currentSrc
        || ''
      ).trim();
      const hasActiveImage =
        document.documentElement.classList.contains('sgb-bg-image-active')
        && !!imgSrc
        && imgSrc !== 'about:blank';

      const visible =
        cs.display !== 'none'
        && cs.visibility !== 'hidden'
        && Number(cs.opacity || 1) > 0.01
        && r.width > 1
        && r.height > 1;

      if (visible && hasActiveImage) {
        state.mountHostCache = { host: sgbRoot, mode: 'sgb', at: performance.now() };
        return { host: sgbRoot, mode: 'sgb' };
      }
    }

    // 2순위(순정 방 / SGB ON이지만 이미지 없음 / 접힌 sgb):
    // main 위의 실제 배경 조상 안에 box를 깐다. main/shell 내부 DOM은 건드리지 않는다.
    const mainEl = main instanceof HTMLElement ? main : document.querySelector('main');
    const box = ensureCawfMountBox(mainEl);
    if (box) {
      state.mountHostCache = { host: box, mode: 'box', at: performance.now() };
      return { host: box, mode: 'box' };
    }

    state.mountHostCache = null;
    return null;
  }

  function weatherUnderlayShouldShow() {
    if (!state.settings.enabled || !isEpisodePath()) return false;
    const screen = getPaintedScreenEffect();
    const timeOn = state.settings.timeBackgroundEnabled && state.activeTimeEffect && state.activeTimeEffect !== 'none';
    return (screen && screen !== 'none') || timeOn;
  }

  function clearUnderlayUnmask() {
    const prev = state.bgClearedEls;
    if (prev) prev.forEach(el => { if (el.isConnected) el.removeAttribute(BG_CLEAR_ATTR); });
    state.bgClearedEls = null;
  }

  function refreshUnderlayUnmask(host) {
    // v0.7.5: 배경 투명화(unmask) 기능을 완전히 비활성화한다.
    // 기존 방식은 Crack 다크모드의 불투명 배경 프레임까지 data-cawf-bg-clear로 태깅해
    // 투명하게 뚫었고, 그 뒤 body/html 바닥의 흰색이 비쳐 다크모드 흰 화면을 만들었다.
    // 이제는 어떤 요소도 태깅하지 않고, 과거에 남았을 수 있는 태그만 정리한다.
    // → Crack 원본 배경(다크/라이트/방별 색)을 그대로 두고, 에리/배경블러와도 충돌하지 않는다.
    clearUnderlayUnmask();
  }


  function debugLayer(tag) {
    if (!state.settings.debug) return;
    const root = state.root;
    console.log(`[${SCRIPT_NAME}] layer:${tag}`, {
      route: location.pathname,
      episode: isEpisodePath(),
      rootParent: root?.parentElement?.tagName?.toLowerCase() || null,
      hostFound: root?.getAttribute?.('data-cawf-host-found') || null,
      visible: root?.getAttribute?.('data-cawf-visible') || null,
      bounds: state.bounds
    });
  }

  function scheduleBoundsRefresh(reason = 'viewport') {
    const now = performance.now();

    const run = () => {
      state.boundsRefreshRaf = 0;
      state.boundsRefreshLastRun = performance.now();
      state.lastBoundsAt = 0;
      applyRootBounds(true); // 위치/크기만 갱신. DOM parent 이동 없음.
    };

    if (state.boundsRefreshRaf) return;

    if (state.boundsRefreshLastRun && now - state.boundsRefreshLastRun < 200) {
      if (state.boundsRefreshTrailingTimer) return;
      state.boundsRefreshTrailingTimer = window.setTimeout(() => {
        state.boundsRefreshTrailingTimer = 0;
        if (state.boundsRefreshRaf) return;
        state.boundsRefreshRaf = window.requestAnimationFrame(run);
      }, 250);
      return;
    }

    state.boundsRefreshRaf = window.requestAnimationFrame(run);
  }

  function applyRootBounds(force = false) {
    const root = ensureRoot();

    const now = performance.now();
    if (!force && state.lastBoundsAt && now - state.lastBoundsAt < 420) return state.lastBoundsOk;
    state.lastBoundsAt = now;

    const main = findEffectViewport(); // 채팅방 + 유효 rect일 때만 <main>
    const mainRect = getElementRect(main);

    if (!main || !mainRect) {
      state.effectHost = null;
      state.mountHost = null;
      state.bounds = null;
      state.lastBoundsOk = false;
      parkRootInBodyHidden(root);
      document.documentElement.removeAttribute('data-cawf-layer-active');
      debugLayer('no-host');
      return false;
    }

    const mount = findEffectMountHost(main);
    if (!mount) {
      state.effectHost = main;
      state.mountHost = null;
      state.bounds = null;
      state.lastBoundsOk = false;
      parkRootInBodyHidden(root);
      document.documentElement.removeAttribute('data-cawf-layer-active');
      debugLayer('no-mount-host');
      return false;
    }

    const { host, mode } = mount;

    // 두 모드 공통: 효과는 채팅 main 영역 좌표/크기에만 가둔다.
    const mainLeft = Math.max(0, Number(mainRect.left) || 0);
    const mainTop = Math.max(0, Number(mainRect.top) || 0);
    const mainWidth = Math.max(1, Number(mainRect.width) || main.clientWidth || 1);
    const mainHeight = Math.max(1, Number(mainRect.height) || main.clientHeight || 1);

    const geomCache = state.lastAppliedGeom;
    const targetParentOk = mode === 'sgb'
      ? root.parentElement === host
      : (root.parentElement === host && host.firstElementChild === root);
    if (
      geomCache
      && geomCache.mode === mode
      && geomCache.hostEl === host
      && targetParentOk
      && Math.abs(Number(geomCache.left || 0) - mainLeft) < 1
      && Math.abs(Number(geomCache.top || 0) - mainTop) < 1
      && Math.abs(Number(geomCache.width || 0) - mainWidth) < 1
      && Math.abs(Number(geomCache.height || 0) - mainHeight) < 1
    ) {
      state.effectHost = main;   // 가시성 옵저버 / 로그 스캔용은 그대로 main
      state.mountHost = host;
      state.bounds = {
        left: Number(geomCache.left) || mainLeft,
        top: Number(geomCache.top) || mainTop,
        width: Math.max(1, Number(geomCache.width) || mainWidth),
        height: Math.max(1, Number(geomCache.height) || mainHeight)
      };
      state.lastBoundsOk = true;
      state.lastBoundsAt = now;
      debugLayer('host-ok');
      return true;
    }

    root.style.setProperty('position', 'absolute', 'important');
    root.style.setProperty('pointer-events', 'none', 'important');

    let width;
    let height;
    let left;
    let top;

    if (mode === 'sgb') {
      // sgb-bg-root는 fixed 전체화면이라, root에 inset:0를 주면 채팅 위 헤더까지 효과가 새어 올라간다.
      // sgb 모드에서도 채팅 main rect 좌표로 가둔다. (이미지/딤 위, 채팅 아래 레이어 순서는 그대로 유지)
      if (root.parentElement !== host) host.appendChild(root);
      root.style.setProperty('z-index', '1', 'important');
      root.style.removeProperty('inset');
      root.style.setProperty('left', `${mainLeft}px`, 'important');
      root.style.setProperty('top', `${mainTop}px`, 'important');
      root.style.setProperty('width', `${mainWidth}px`, 'important');
      root.style.setProperty('height', `${mainHeight}px`, 'important');

      width = mainWidth;
      height = mainHeight;
      left = mainLeft;
      top = mainTop;
    } else {
      // box 모드: 배경 조상 안 box를 main rect에 맞추고 root는 box를 가득 채운다(기존 동작 유지).
      if (root.parentElement !== host || host.firstElementChild !== root) host.prepend(root);
      root.style.setProperty('z-index', '0', 'important');

      host.style.setProperty('left', `${mainLeft}px`, 'important');
      host.style.setProperty('top', `${mainTop}px`, 'important');
      host.style.setProperty('width', `${mainWidth}px`, 'important');
      host.style.setProperty('height', `${mainHeight}px`, 'important');
      host.style.removeProperty('inset');

      root.style.setProperty('inset', '0', 'important');
      root.style.removeProperty('left');
      root.style.removeProperty('top');
      root.style.removeProperty('width');
      root.style.removeProperty('height');

      const hostRect = host.getBoundingClientRect();
      width = Math.max(1, Number(hostRect.width) || host.clientWidth || mainWidth);
      height = Math.max(1, Number(hostRect.height) || host.clientHeight || mainHeight);
      left = Number(hostRect.left) || 0;
      top = Number(hostRect.top) || 0;
    }

    root.style.setProperty('--cawf-width', `${width}px`);
    root.style.setProperty('--cawf-height', `${height}px`);
    root.setAttribute('data-cawf-host-found', 'true');

    state.effectHost = main;   // 가시성 옵저버 / 로그 스캔용은 그대로 main
    state.mountHost = host;

    const prevBounds = state.bounds;
    state.bounds = { left, top, width, height };
    state.lastBoundsOk = true;
    state.lastAppliedGeom = { mode, left, top, width, height, hostEl: host, parentOk: true };
    document.documentElement.setAttribute('data-cawf-layer-active', 'true');

    if (
      prevBounds &&
      getPaintedScreenEffect() === 'fireflies' &&
      (Math.abs(Number(prevBounds.width || 0) - width) > 2 || Math.abs(Number(prevBounds.height || 0) - height) > 2)
    ) {
      state.particleSignature = '';
      if (!state.fireflyBoundsRebuildRaf) {
        state.fireflyBoundsRebuildRaf = window.requestAnimationFrame(() => {
          state.fireflyBoundsRebuildRaf = 0;
          rebuildParticles('bounds-change');
        });
      }
    }

    debugLayer('host-ok');
    return true;
  }

  function normalizeSettings(raw = {}) {
    const soundEnabled = raw.soundEnabled === undefined
      ? (raw.audioEnabled === true || raw.cricketAudioEnabled === true || raw.waveAudioEnabled === true || raw.fireworksAudioEnabled === true || raw.underwaterAudioEnabled === true ? true : DEFAULTS.soundEnabled)
      : raw.soundEnabled === true;
    const audioFollowEffect = raw.audioFollowEffect === undefined
      ? (raw.audioFollowRain === false || raw.cricketAudioFollowFireflies === false || raw.waveAudioFollowShore === false ? false : DEFAULTS.audioFollowEffect)
      : raw.audioFollowEffect !== false;
    const audioWhileHidden = raw.audioWhileHidden === undefined
      ? (raw.cricketAudioWhileHidden === undefined
          ? (raw.waveAudioWhileHidden === undefined ? DEFAULTS.audioWhileHidden : raw.waveAudioWhileHidden === true)
          : raw.cricketAudioWhileHidden === true)
      : raw.audioWhileHidden === true;

    return {
      enabled: raw.enabled === undefined ? DEFAULTS.enabled : raw.enabled !== false,
      visualEnabled: raw.visualEnabled === undefined ? DEFAULTS.visualEnabled : raw.visualEnabled !== false,
      screenEffectEnabled: raw.screenEffectEnabled === undefined
        ? (raw.visualEnabled === undefined ? DEFAULTS.screenEffectEnabled : raw.visualEnabled !== false)
        : raw.screenEffectEnabled !== false,
      timeBackgroundEnabled: raw.timeBackgroundEnabled === undefined
        ? (raw.visualEnabled === undefined ? DEFAULTS.timeBackgroundEnabled : raw.visualEnabled !== false)
        : raw.timeBackgroundEnabled !== false,
      autoDetect: raw.autoDetect === undefined ? DEFAULTS.autoDetect : raw.autoDetect !== false,
      effect: normalizeChoice(raw.effect, EFFECT_CHOICES, DEFAULTS.effect),
      timeBackground: normalizeChoice(raw.timeBackground, TIME_CHOICES, DEFAULTS.timeBackground),
      intensity: normalizeChoice(raw.intensity, ['low', 'medium', 'high'], DEFAULTS.intensity),
      nightMeteors: raw.nightMeteors === undefined ? DEFAULTS.nightMeteors : raw.nightMeteors !== false,
      powerSaver: normalizeChoice(raw.powerSaver, ['auto', 'on', 'off'], DEFAULTS.powerSaver),
      galaxyMeteors: raw.galaxyMeteors === undefined ? DEFAULTS.galaxyMeteors : raw.galaxyMeteors !== false,
      galaxyParallax: raw.galaxyParallax === undefined ? DEFAULTS.galaxyParallax : raw.galaxyParallax !== false,
      opacity: clampValue(raw.opacity, 0.12, 1.5, DEFAULTS.opacity),
      speed: clampValue(raw.speed, 0.55, 1.75, DEFAULTS.speed),
      effectOpacity: clampValue(raw.effectOpacity ?? raw.opacity, 0.12, 1.5, DEFAULTS.effectOpacity),
      timeOpacity: clampValue(raw.timeOpacity ?? raw.opacity, 0.12, 2.0, DEFAULTS.timeOpacity),
      effectSpeed: clampValue(raw.effectSpeed ?? raw.speed, 0.2, 1.75, DEFAULTS.effectSpeed),
      timeSpeed: clampValue(raw.timeSpeed ?? raw.speed, 0.55, 1.75, DEFAULTS.timeSpeed),
      overlayMode: normalizeChoice(raw.overlayMode, ['above', 'under'], DEFAULTS.overlayMode),
      showFloatingButton: raw.showFloatingButton === undefined ? DEFAULTS.showFloatingButton : raw.showFloatingButton !== false,

      soundEnabled,
      audioFollowEffect,
      audioUrl: raw.audioUrl === undefined ? DEFAULTS.audioUrl : normalizeAudioUrl(raw.audioUrl, ''),
      audioVolume: clampValue(raw.audioVolume, 0, 1, DEFAULTS.audioVolume),
      audioWhileHidden,
      cricketAudioUrl: raw.cricketAudioUrl === undefined ? DEFAULTS.cricketAudioUrl : normalizeAudioUrl(raw.cricketAudioUrl, ''),
      cricketAudioVolume: clampValue(raw.cricketAudioVolume, 0, 1, DEFAULTS.cricketAudioVolume),
      waveAudioUrl: raw.waveAudioUrl === undefined ? DEFAULTS.waveAudioUrl : normalizeAudioUrl(raw.waveAudioUrl, ''),
      waveAudioVolume: clampValue(raw.waveAudioVolume, 0, 1, DEFAULTS.waveAudioVolume),
      fireworksAudioUrl: raw.fireworksAudioUrl === undefined ? DEFAULTS.fireworksAudioUrl : normalizeAudioUrl(raw.fireworksAudioUrl, ''),
      fireworksAudioVolume: clampValue(raw.fireworksAudioVolume, 0, 1, DEFAULTS.fireworksAudioVolume),
      underwaterAudioUrl: raw.underwaterAudioUrl === undefined ? DEFAULTS.underwaterAudioUrl : normalizeAudioUrl(raw.underwaterAudioUrl, ''),
      underwaterAudioVolume: clampValue(raw.underwaterAudioVolume, 0, 1, DEFAULTS.underwaterAudioVolume),
      spellAudioVolume: clampValue(raw.spellAudioVolume, 0, 1, DEFAULTS.spellAudioVolume),

      // legacy aliases: all mapped to the unified sound controls.
      audioEnabled: soundEnabled,
      audioFollowRain: audioFollowEffect,
      cricketAudioEnabled: soundEnabled,
      cricketAudioFollowFireflies: audioFollowEffect,
      cricketAudioWhileHidden: audioWhileHidden,
      waveAudioEnabled: soundEnabled,
      waveAudioFollowShore: audioFollowEffect,
      waveAudioWhileHidden: audioWhileHidden,
      fireworksAudioEnabled: soundEnabled,
      fireworksAudioFollowFireworks: audioFollowEffect,
      underwaterAudioEnabled: soundEnabled,
      underwaterAudioFollowUnderwater: audioFollowEffect,

      keywordRain: normalizeDefaultKeyword('rain', raw.keywordRain),
      keywordSnow: normalizeDefaultKeyword('snow', raw.keywordSnow),
      keywordSakura: normalizeDefaultKeyword('sakura', raw.keywordSakura),
      keywordLeaves: normalizeDefaultKeyword('leaves', raw.keywordLeaves),
      keywordGreenLeaves: normalizeDefaultKeyword('greenLeaves', raw.keywordGreenLeaves),
      keywordFireflies: normalizeDefaultKeyword('fireflies', raw.keywordFireflies),
      keywordSpellcast: normalizeDefaultKeyword('spellcast', raw.keywordSpellcast),
      keywordMana: normalizeDefaultKeyword('mana', raw.keywordMana),
      keywordBokeh: normalizeDefaultKeyword('bokeh', raw.keywordBokeh),
      keywordCandlelight: normalizeDefaultKeyword('candlelight', raw.keywordCandlelight),
      keywordSunlight: normalizeDefaultKeyword('sunlight', raw.keywordSunlight),
      keywordAurora: normalizeDefaultKeyword('aurora', raw.keywordAurora),
      keywordSunset: normalizeDefaultKeyword('sunset', raw.keywordSunset),
      keywordNight: normalizeDefaultKeyword('night', raw.keywordNight),
      keywordFog: normalizeDefaultKeyword('fog', raw.keywordFog),
      keywordShore: normalizeDefaultKeyword('shore', raw.keywordShore),
      keywordFireworks: normalizeDefaultKeyword('fireworks', raw.keywordFireworks),
      keywordUnderwater: normalizeDefaultKeyword('underwater', raw.keywordUnderwater),
      keywordGalaxy: normalizeDefaultKeyword('galaxy', raw.keywordGalaxy),
      keywordFeathers: normalizeDefaultKeyword('feathers', raw.keywordFeathers),
      keywordButterflies: normalizeDefaultKeyword('butterflies', raw.keywordButterflies),
      keywordSandstorm: normalizeDefaultKeyword('sandstorm', raw.keywordSandstorm),
      keywordFallback: normalizeChoice(raw.keywordFallback, ['off', 'keep'], DEFAULTS.keywordFallback),
      includeCodeBlocksInDetection: raw.includeCodeBlocksInDetection === undefined ? DEFAULTS.includeCodeBlocksInDetection : raw.includeCodeBlocksInDetection === true,

      debug: raw.debug === true
    };
  }

  function loadSettings() {
    state.settings = normalizeSettings(safeJsonParse(localStorage.getItem(STORE_KEY), {}));
    return state.settings;
  }

  function saveSettings(patch = {}, options = {}) {
    state.settings = normalizeSettings({ ...state.settings, ...patch });
    localStorage.setItem(STORE_KEY, JSON.stringify(state.settings));
    if (!selectionsNeedLogScan()) {
      clearGenerateDoneReadyWatch(); clearRouteEntryReadyWatch();
      state.pendingGenerateDoneScan = false; state.pendingRouteEntryScan = false;
    }
    applySettingsToDom();
    syncPanel();
    syncFloatingButton();
    if (!options.skipScan) {
      state.lastTextHash = '';
      clearPendingScan();
      scanLatestLog('settings');
    }
    return state.settings;
  }

  function clearPendingScan() {
    clearTimeout(state.scanTimer);
    state.scanTimer = 0;
  }

  function selectionsNeedLogScan() {
    const s = state.settings;
    if (!s.enabled) return false;
    return (s.screenEffectEnabled && s.autoDetect && s.effect === 'auto')
      || (s.timeBackgroundEnabled && s.timeBackground === 'auto');
  }

  function applyCurrentSelectionsNow(reason = 'ui-immediate') {
    clearPendingScan();
    applySettingsToDom();

    const s = state.settings;
    if (!s.enabled) {
      setActiveEffect('none', reason);
      setActiveTimeEffect('none', reason);
      return;
    }

    if (selectionsNeedLogScan()) {
      state.lastTextHash = '';
      scanLatestLog(reason);
      return;
    }

    const nextEffect = s.effect === 'auto' ? 'none' : normalizeChoice(s.effect, ACTIVE_EFFECT_CHOICES, 'none');
    const nextTimeEffect = s.timeBackground === 'auto' ? 'none' : normalizeChoice(s.timeBackground, ACTIVE_TIME_CHOICES, 'none');

    state.lastDetectedEffect = nextEffect;
    state.lastDetectedTimeEffect = nextTimeEffect;
    state.lastDetectedKeyword = '';
    setActiveEffect(nextEffect, reason);
    setActiveTimeEffect(nextTimeEffect, reason);
  }

  function resetSettings() {
    state.settings = { ...DEFAULTS };
    localStorage.removeItem(STORE_KEY);
    clearPanelKeywordDrafts();
    applySettingsToDom();
    rebuildParticles('settings-reset');
    syncPanel();
    syncFloatingButton();
    syncAudioWithEffect();
  }

  function hashText(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return String(hash >>> 0);
  }

  function seededRandom(seed) {
    let t = seed >>> 0;
    return function random() {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gcdInt(a, b) {
    a = Math.abs(a | 0);
    b = Math.abs(b | 0);
    while (b) { const t = b; b = a % b; a = t; }
    return a || 1;
  }

  function injectStyle() {
    document.getElementById(IDS.style)?.remove();

    const style = document.createElement('style');
    style.id = IDS.style;
    style.textContent = `
      /* v0.7.6: body underlay 대신, 실제 배경 호스트 안에 absolute inset:0로 얹는다.
         position/z-index는 applyRootBounds가 모드별로 inline !important로 세팅한다. */
      #${IDS.root} {
        position: absolute;
        inset: 0;
        overflow: hidden !important;
        pointer-events: none !important;
        user-select: none !important;
        contain: layout paint style;
        isolation: isolate;
        opacity: 1;
        transform: translateZ(0);
        display: none;
      }

      #${IDS.root}[data-cawf-host-found="true"][data-cawf-visible="true"] {
        display: block;
      }

      #${IDS.root}[data-cawf-host-found="false"] {
        display: none !important;
      }

      /* ===== Body underlay unmask (v0.7.2) =====
       * #cawf-root는 에리 안정성을 위해 body 직속 z-index:-1 underlay로 유지한다.
       * 하드코딩 추측 selector로 main 하위를 통째로 투명화하면 Crack 난독화 클래스가
       * 바뀔 때 빗나가(=배경이 안 보임) 깨진다. 대신 런타임에서 실제로 불투명한
       * "큰 프레임"만 data-cawf-bg-clear로 태깅하고 여기서는 그 태그만 투명화한다.
       * 배경(background)만 건드리고 z-index/position/DOM은 손대지 않아 에리와 분리된다.
       */
      /* v0.7.4: background-image는 건드리지 않는다.
       * Crack 다크모드는 프레임 배경을 gradient(background-image)로 칠하기도 하는데
       * 그걸 none으로 날리면 아래의 흰색이 비쳐 흰 레이어가 깔린다. 배경색만 투명화한다. */
      [data-cawf-bg-clear="true"] {
        background-color: transparent !important;
      }

      [data-cawf-bg-clear="true"]::before,
      [data-cawf-bg-clear="true"]::after {
        background-color: transparent !important;
      }

      /* 안 보일 때(탭 가림/화면 밖)만 애니메이션을 얼린다. 보이는 동안의 비주얼은 동일. */
      #${IDS.root}[data-cawf-anim-paused="true"] *,
      #${IDS.root}[data-cawf-anim-paused="true"]::before,
      #${IDS.root}[data-cawf-anim-paused="true"]::after {
        animation-play-state: paused !important;
      }

      /* paused 동안에는 will-change를 떨궈 GPU 레이어 메모리를 반환한다(보이는 비주얼 영향 없음). */
      #${IDS.root}[data-cawf-anim-paused="true"] #${IDS.timeDust},
      #${IDS.root}[data-cawf-anim-paused="true"] #${IDS.timeDust}::before,
      #${IDS.root}[data-cawf-anim-paused="true"] #${IDS.timeDust}::after,
      #${IDS.root}[data-cawf-anim-paused="true"] #${IDS.nightSky},
      #${IDS.root}[data-cawf-anim-paused="true"] #${IDS.nightSky} *,
      #${IDS.root}[data-cawf-anim-paused="true"] #${IDS.ambient} .cawf-candle-motes > i {
        will-change: auto !important;
      }

      /* 저전력 기기에서는 겹쳐도 체감이 적은 보조 레이어만 덜어낸다. */
      #${IDS.root}[data-cawf-low-power="true"][data-time-effect="afternoon"] #${IDS.timeDust}::after,
      #${IDS.root}[data-cawf-low-power="true"][data-time-effect="dawn"] #${IDS.timeDust}::after,
      #${IDS.root}[data-cawf-low-power="true"][data-time-effect="sunset"] #${IDS.timeDust}::after,
      #${IDS.root}[data-cawf-low-power="true"][data-time-effect="night"] #${IDS.timeLayer}::after {
        content: none !important;
        display: none !important;
        animation: none !important;
      }

      #${IDS.root}[data-cawf-low-power="true"][data-time-effect="night"] #${IDS.nightSky} .cawf-cp-meteor-9,
      #${IDS.root}[data-cawf-low-power="true"][data-time-effect="night"] #${IDS.nightSky} .cawf-cp-meteor-10,
      #${IDS.root}[data-cawf-low-power="true"][data-time-effect="night"] #${IDS.nightSky} .cawf-cp-meteor-11,
      #${IDS.root}[data-cawf-low-power="true"][data-time-effect="night"] #${IDS.nightSky} .cawf-cp-meteor-12 {
        display: none !important;
      }

      #${IDS.root}[data-cawf-low-power="true"] #${IDS.nightSky} .cawf-cp-moon {
        animation: none !important;
      }

      /* v2.2.0 절전: 실시간 배경 블러(가장 비싼 GPU 효과)를 끈다. 반투명 배경색이 대신한다. */
      html[data-cawf-low-power="true"] #${IDS.button},
      html[data-cawf-low-power="true"] #${IDS.panel} {
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }

      /* v2.2.0 절전: 새벽/노을 보조 구름은 매 프레임 다시 칠하는 방식이라 정지(모양은 유지). */
      #${IDS.root}[data-cawf-low-power="true"][data-time-effect="dawn"] #${IDS.timeDust}::before,
      #${IDS.root}[data-cawf-low-power="true"][data-time-effect="sunset"] #${IDS.timeDust}::before,
      #${IDS.root}[data-cawf-low-power="true"] #${IDS.timeLayer}[data-time-effect="dawn"] #${IDS.timeDust}::before,
      #${IDS.root}[data-cawf-low-power="true"] #${IDS.timeLayer}[data-time-effect="sunset"] #${IDS.timeDust}::before {
        animation: none !important;
      }

      /* v2.2.1 강절전: 시간대 배경은 현재 모양을 유지한 채 반복 리페인트만 멈춘다. */
      #${IDS.root}[data-cawf-low-power="true"] #${IDS.timeLayer}::before,
      #${IDS.root}[data-cawf-low-power="true"] #${IDS.timeLayer}::after,
      #${IDS.root}[data-cawf-low-power="true"] #${IDS.timeDust},
      #${IDS.root}[data-cawf-low-power="true"] #${IDS.timeDust}::before,
      #${IDS.root}[data-cawf-low-power="true"] #${IDS.timeDust}::after,
      #${IDS.root}[data-cawf-low-power="true"] #${IDS.nightSky} .cawf-cp-meteor {
        animation-play-state: paused !important;
        will-change: auto !important;
      }

      /* 비: 화면 전체에 옅은 습기/암부 (canvas 빗줄기와 함께 깔린다) */
      #${IDS.root}[data-effect="rain"]::before {
        content: '';
        position: absolute;
        inset: 0;
        background:
          radial-gradient(132% 96% at 50% -12%, rgba(44,60,92,.34), rgba(44,60,92,0) 60%),
          linear-gradient(180deg, rgba(16,24,44,.18), rgba(16,24,44,0) 32%);
        pointer-events: none;
      }

      #${IDS.rainCanvas} {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        display: none;
        pointer-events: none;
      }

      #${IDS.root}[data-effect="rain"] #${IDS.rainCanvas} {
        display: block;
      }

      #${IDS.rainCanvas},
      #${IDS.ambient},
      #${IDS.particles},
      #${IDS.root}[data-effect="rain"]::before {
        opacity: var(--cawf-effect-opacity, .74);
      }

      /* ===== Time background (새벽 / 오전 / 오후 / 노을 / 초저녁 / 밤) ===== */
      #${IDS.timeLayer} {
        position: absolute;
        inset: 0;
        overflow: hidden;
        pointer-events: none;
        display: none;
        opacity: var(--cawf-time-opacity, .82);
        --cawf-time-speed-safe: var(--cawf-time-speed, 1);
        -webkit-mask-image: linear-gradient(180deg, #000 0%, #000 26%, rgba(0,0,0,.88) 40%, rgba(0,0,0,.48) 50%, rgba(0,0,0,.14) 57%, transparent 60%);
        mask-image: linear-gradient(180deg, #000 0%, #000 26%, rgba(0,0,0,.88) 40%, rgba(0,0,0,.48) 50%, rgba(0,0,0,.14) 57%, transparent 60%);
      }

      /* 시간대가 바뀔 때 직전 레이어를 잠깐 보존해 새 하늘과 부드럽게 겹친다. */
      #${IDS.timeLayer}.cawf-time-transition-in {
        display: block !important;
        animation: cawf-time-crossfade-in 1.45s cubic-bezier(.22,.61,.36,1) both;
        will-change: opacity;
      }

      .cawf-time-transition-host {
        position: absolute;
        inset: 0;
        display: block;
        overflow: hidden;
        pointer-events: none;
        contain: layout paint style;
        isolation: isolate;
      }

      #${IDS.timeLayer}.cawf-time-transition-ghost {
        display: block !important;
        pointer-events: none;
        animation: cawf-time-crossfade-out 1.45s cubic-bezier(.22,.61,.36,1) both;
        will-change: opacity;
      }

      @keyframes cawf-time-crossfade-in {
        0% { opacity: 0; }
        100% { opacity: var(--cawf-time-opacity, .82); }
      }

      @keyframes cawf-time-crossfade-out {
        0% { opacity: var(--cawf-time-opacity, .82); }
        100% { opacity: 0; }
      }

      /* 100% 초과 배경 투명도용 보조 wash. 원본 색을 한 번 더 얹어서 hue는 유지하고 농도만 올린다. */
      #${IDS.timeWash} {
        position: absolute;
        inset: 0;
        pointer-events: none;
        display: none;
        opacity: var(--cawf-time-wash-boost-opacity, 0);
        z-index: 0;
      }

      #${IDS.timeLayer}::before,
      #${IDS.timeLayer}::after {
        z-index: 2;
      }

      #${IDS.timeDust} {
        z-index: 3;
      }

      #${IDS.root}[data-time-effect="morning"] #${IDS.timeLayer},
      #${IDS.root}[data-time-effect="afternoon"] #${IDS.timeLayer},
      #${IDS.root}[data-time-effect="sunset"] #${IDS.timeLayer},
      #${IDS.root}[data-time-effect="twilight"] #${IDS.timeLayer},
      #${IDS.root}[data-time-effect="night"] #${IDS.timeLayer},
      #${IDS.root}[data-time-effect="dawn"] #${IDS.timeLayer},
      #${IDS.timeLayer}[data-time-effect="morning"],
      #${IDS.timeLayer}[data-time-effect="afternoon"],
      #${IDS.timeLayer}[data-time-effect="sunset"],
      #${IDS.timeLayer}[data-time-effect="twilight"],
      #${IDS.timeLayer}[data-time-effect="night"],
      #${IDS.timeLayer}[data-time-effect="dawn"] {
        display: block;
      }

      #${IDS.root}[data-time-effect="morning"] #${IDS.timeWash},
      #${IDS.root}[data-time-effect="afternoon"] #${IDS.timeWash},
      #${IDS.root}[data-time-effect="sunset"] #${IDS.timeWash},
      #${IDS.root}[data-time-effect="twilight"] #${IDS.timeWash},
      #${IDS.root}[data-time-effect="night"] #${IDS.timeWash},
      #${IDS.root}[data-time-effect="dawn"] #${IDS.timeWash},
      #${IDS.timeLayer}[data-time-effect="morning"] #${IDS.timeWash},
      #${IDS.timeLayer}[data-time-effect="afternoon"] #${IDS.timeWash},
      #${IDS.timeLayer}[data-time-effect="sunset"] #${IDS.timeWash},
      #${IDS.timeLayer}[data-time-effect="twilight"] #${IDS.timeWash},
      #${IDS.timeLayer}[data-time-effect="night"] #${IDS.timeWash},
      #${IDS.timeLayer}[data-time-effect="dawn"] #${IDS.timeWash} {
        display: block;
      }

      /* 오전/오후는 빛줄기가 아래까지 내려오면 채팅 영역이 답답해 보여서 더 위에서 빠르게 페이드아웃 */
      #${IDS.root}[data-time-effect="morning"] #${IDS.timeLayer},
      #${IDS.root}[data-time-effect="afternoon"] #${IDS.timeLayer},
      #${IDS.timeLayer}[data-time-effect="morning"],
      #${IDS.timeLayer}[data-time-effect="afternoon"] {
        -webkit-mask-image: linear-gradient(180deg, #000 0%, #000 22%, rgba(0,0,0,.86) 34%, rgba(0,0,0,.44) 46%, rgba(0,0,0,.14) 55%, transparent 60%);
        mask-image: linear-gradient(180deg, #000 0%, #000 22%, rgba(0,0,0,.86) 34%, rgba(0,0,0,.44) 46%, rgba(0,0,0,.14) 55%, transparent 60%);
      }

      #${IDS.timeLayer}::before,
      #${IDS.timeLayer}::after {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      #${IDS.timeDust} {
        position: absolute;
        inset: -8% -10% 0 -10%;
        pointer-events: none;
        display: none;
        overflow: hidden;
        opacity: .80;
        mix-blend-mode: screen;
        filter: blur(.18px) drop-shadow(0 0 5px rgba(255,238,200,.18));
        will-change: transform, opacity;
      }

      #${IDS.timeDust}::before,
      #${IDS.timeDust}::after {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
        will-change: transform, opacity;
      }

      #${IDS.root}[data-time-effect="afternoon"] #${IDS.timeDust},
      #${IDS.timeLayer}[data-time-effect="afternoon"] #${IDS.timeDust} {
        display: block;
        background:
          radial-gradient(circle at 7% 12%, rgba(255,250,230,.68) 0 1.0px, transparent 2.3px),
          radial-gradient(circle at 16% 31%, rgba(255,238,202,.49) 0 1.4px, transparent 3px),
          radial-gradient(circle at 28% 18%, rgba(255,252,238,.70) 0 1.1px, transparent 2.5px),
          radial-gradient(circle at 39% 42%, rgba(255,230,184,.40) 0 1.8px, transparent 3.4px),
          radial-gradient(circle at 51% 26%, rgba(255,246,218,.56) 0 1.2px, transparent 2.8px),
          radial-gradient(circle at 64% 11%, rgba(255,252,236,.62) 0 1.0px, transparent 2.4px),
          radial-gradient(circle at 76% 34%, rgba(255,238,198,.45) 0 1.6px, transparent 3.3px),
          radial-gradient(circle at 89% 18%, rgba(255,250,226,.58) 0 1.1px, transparent 2.6px),
          radial-gradient(circle at 12% 56%, rgba(255,244,214,.32) 0 1.9px, transparent 3.8px),
          radial-gradient(circle at 33% 62%, rgba(255,252,232,.36) 0 1.5px, transparent 3.2px),
          radial-gradient(circle at 57% 54%, rgba(255,241,206,.30) 0 1.8px, transparent 3.6px),
          radial-gradient(circle at 83% 60%, rgba(255,248,230,.34) 0 1.6px, transparent 3.2px);
        animation: cawf-time-dust-field-a calc(48s / var(--cawf-time-speed-safe)) linear infinite alternate;
      }

      #${IDS.root}[data-time-effect="afternoon"] #${IDS.timeDust}::before,
      #${IDS.timeLayer}[data-time-effect="afternoon"] #${IDS.timeDust}::before {
        background:
          radial-gradient(circle at 10% 24%, rgba(255,250,235,.54) 0 .7px, transparent 2px),
          radial-gradient(circle at 22% 8%, rgba(255,238,204,.39) 0 1.1px, transparent 2.7px),
          radial-gradient(circle at 35% 36%, rgba(255,252,242,.50) 0 .8px, transparent 2.2px),
          radial-gradient(circle at 49% 14%, rgba(255,241,210,.41) 0 1.0px, transparent 2.5px),
          radial-gradient(circle at 61% 47%, rgba(255,250,232,.43) 0 .9px, transparent 2.4px),
          radial-gradient(circle at 72% 21%, rgba(255,235,198,.37) 0 1.2px, transparent 2.9px),
          radial-gradient(circle at 91% 42%, rgba(255,252,238,.45) 0 .8px, transparent 2.2px);
        opacity: .80;
        animation: cawf-time-dust-field-b calc(64s / var(--cawf-time-speed-safe)) linear infinite alternate-reverse;
      }

      #${IDS.root}[data-time-effect="afternoon"] #${IDS.timeDust}::after,
      #${IDS.timeLayer}[data-time-effect="afternoon"] #${IDS.timeDust}::after {
        background:
          radial-gradient(circle at 18% 18%, rgba(255,255,246,.41) 0 .55px, transparent 1.8px),
          radial-gradient(circle at 31% 49%, rgba(255,238,200,.30) 0 .9px, transparent 2.5px),
          radial-gradient(circle at 44% 10%, rgba(255,252,238,.39) 0 .6px, transparent 1.9px),
          radial-gradient(circle at 59% 31%, rgba(255,241,208,.32) 0 .85px, transparent 2.3px),
          radial-gradient(circle at 71% 7%, rgba(255,255,248,.36) 0 .55px, transparent 1.8px),
          radial-gradient(circle at 86% 50%, rgba(255,238,204,.30) 0 .9px, transparent 2.6px);
        opacity: .64;
        animation: cawf-time-dust-twinkle calc(8s / var(--cawf-time-speed-safe)) ease-in-out infinite alternate;
      }

      /* 오전: 배경색은 살짝 눌러서 빛줄기가 묻히지 않게 하고, rays 쪽을 조금 더 보이게 조정 */
      #${IDS.root}[data-time-effect="morning"] #${IDS.timeLayer},
      #${IDS.timeLayer}[data-time-effect="morning"] {
        background:
          radial-gradient(84% 42% at 20% -4%, rgba(255,248,228,.26), rgba(255,244,212,.10) 30%, transparent 64%),
          linear-gradient(180deg, rgba(78,142,208,.26) 0%, rgba(172,214,234,.23) 34%, rgba(234,244,232,.12) 56%, rgba(255,244,212,.06) 72%, transparent 100%);
        filter: saturate(1.03) brightness(calc(.86 * var(--cawf-time-brightness, 1))) contrast(var(--cawf-time-contrast, 1));
      }

      #${IDS.root}[data-time-effect="morning"] #${IDS.timeWash},
      #${IDS.timeLayer}[data-time-effect="morning"] #${IDS.timeWash} {
        background:
          radial-gradient(84% 42% at 20% -4%, rgba(255,248,228,.26), rgba(255,244,212,.10) 30%, transparent 64%),
          linear-gradient(180deg, rgba(78,142,208,.26) 0%, rgba(172,214,234,.23) 34%, rgba(234,244,232,.12) 56%, rgba(255,244,212,.06) 72%, transparent 100%);
      }

      #${IDS.root}[data-time-effect="morning"] #${IDS.timeLayer}::before,
      #${IDS.timeLayer}[data-time-effect="morning"]::before {
        left: -18%;
        top: -18%;
        right: -18%;
        bottom: auto;
        width: auto;
        height: 78%;
        background:
          radial-gradient(82% 34% at 48% 4%, rgba(255,255,246,.30), rgba(255,250,224,.12) 31%, transparent 72%),
          linear-gradient(103deg, transparent 0 8%, rgba(255,250,224,.24) 12%, rgba(255,250,224,.09) 19%, transparent 25% 37%, rgba(255,244,196,.16) 43%, transparent 50% 100%),
          linear-gradient(116deg, transparent 0 18%, rgba(255,255,246,.18) 24%, transparent 31% 55%, rgba(255,245,204,.13) 61%, transparent 69% 100%),
          linear-gradient(97deg, transparent 0 46%, rgba(255,250,224,.14) 53%, transparent 60% 75%, rgba(255,255,246,.10) 82%, transparent 90% 100%);
        filter: blur(8px);
        opacity: calc(.88 * var(--cawf-time-detail-strength, 1));
        mix-blend-mode: screen;
        transform: skewX(-6deg) rotate(-1.5deg);
        animation: cawf-time-rays calc(20s / var(--cawf-time-speed-safe)) ease-in-out infinite alternate;
      }

      #${IDS.root}[data-time-effect="morning"] #${IDS.timeLayer}::after,
      #${IDS.timeLayer}[data-time-effect="morning"]::after {
        background: radial-gradient(90% 56% at 26% 0%, rgba(255,255,246,.17), transparent 64%);
        opacity: calc(.68 * var(--cawf-time-detail-strength, 1));
        mix-blend-mode: screen;
        filter: blur(12px);
        animation: cawf-time-soft-breathe calc(24s / var(--cawf-time-speed-safe)) ease-in-out infinite alternate;
      }

      /* 오후: 배경 바탕은 조금 눌러주고, 먼지/빛 레이어는 더 잘 떠 보이게 조정 */
      #${IDS.root}[data-time-effect="afternoon"] #${IDS.timeLayer},
      #${IDS.timeLayer}[data-time-effect="afternoon"] {
        background:
          radial-gradient(84% 42% at 76% -4%, rgba(255,247,224,.22), rgba(255,244,214,.08) 34%, transparent 68%),
          radial-gradient(96% 52% at 24% 0%, rgba(74,150,216,.27), transparent 72%),
          linear-gradient(180deg, rgba(74,150,216,.24) 0%, rgba(170,210,228,.21) 34%, rgba(230,238,224,.12) 54%, rgba(255,240,210,.08) 72%, transparent 100%);
        filter: saturate(1.04) brightness(calc(.86 * var(--cawf-time-brightness, 1))) contrast(var(--cawf-time-contrast, 1));
      }

      #${IDS.root}[data-time-effect="afternoon"] #${IDS.timeWash},
      #${IDS.timeLayer}[data-time-effect="afternoon"] #${IDS.timeWash} {
        background:
          radial-gradient(84% 42% at 76% -4%, rgba(255,247,224,.22), rgba(255,244,214,.08) 34%, transparent 68%),
          radial-gradient(96% 52% at 24% 0%, rgba(74,150,216,.27), transparent 72%),
          linear-gradient(180deg, rgba(74,150,216,.24) 0%, rgba(170,210,228,.21) 34%, rgba(230,238,224,.12) 54%, rgba(255,240,210,.08) 72%, transparent 100%);
      }

      #${IDS.root}[data-time-effect="afternoon"] #${IDS.timeLayer}::before,
      #${IDS.timeLayer}[data-time-effect="afternoon"]::before {
        left: -18%;
        top: -14%;
        right: -18%;
        bottom: auto;
        width: auto;
        height: 76%;
        background:
          radial-gradient(84% 32% at 54% 7%, rgba(255,255,248,.24), rgba(255,252,232,.09) 32%, transparent 72%),
          linear-gradient(106deg, transparent 0 12%, rgba(255,252,232,.16) 17%, rgba(255,252,232,.06) 25%, transparent 31% 45%, rgba(255,246,216,.11) 52%, transparent 59% 100%),
          linear-gradient(119deg, transparent 0 8%, rgba(255,255,248,.11) 16%, transparent 23% 58%, rgba(255,252,232,.12) 66%, transparent 74% 100%),
          linear-gradient(94deg, transparent 0 36%, rgba(255,252,232,.08) 45%, transparent 52% 78%, rgba(255,255,248,.09) 86%, transparent 94% 100%);
        filter: blur(7px);
        opacity: calc(.74 * var(--cawf-time-detail-strength, 1));
        mix-blend-mode: screen;
        transform: skewX(-5deg) rotate(1deg);
        animation: cawf-time-rays calc(22s / var(--cawf-time-speed-safe)) ease-in-out infinite alternate;
      }

      #${IDS.root}[data-time-effect="afternoon"] #${IDS.timeLayer}::after,
      #${IDS.timeLayer}[data-time-effect="afternoon"]::after {
        inset: -4% -8% 0 -8%;
        background:
          radial-gradient(circle at 6% 10%, rgba(255,247,226,.58) 0 1.0px, transparent 2.2px),
          radial-gradient(circle at 15% 28%, rgba(255,240,206,.47) 0 1.4px, transparent 2.8px),
          radial-gradient(circle at 22% 16%, rgba(255,250,236,.66) 0 1.1px, transparent 2.4px),
          radial-gradient(circle at 30% 36%, rgba(255,238,196,.40) 0 1.7px, transparent 3.0px),
          radial-gradient(circle at 38% 22%, rgba(255,245,220,.60) 0 1.2px, transparent 2.5px),
          radial-gradient(circle at 46% 8%, rgba(255,249,232,.52) 0 1.0px, transparent 2.1px),
          radial-gradient(circle at 54% 30%, rgba(255,239,204,.45) 0 1.6px, transparent 3.0px),
          radial-gradient(circle at 62% 18%, rgba(255,248,228,.62) 0 1.2px, transparent 2.6px),
          radial-gradient(circle at 70% 12%, rgba(255,243,210,.50) 0 1.4px, transparent 2.8px),
          radial-gradient(circle at 84% 24%, rgba(255,237,198,.40) 0 1.8px, transparent 3.2px),
          radial-gradient(circle at 92% 14%, rgba(255,248,224,.56) 0 1.1px, transparent 2.5px);
        opacity: calc(.76 * var(--cawf-time-detail-strength, 1));
        filter: blur(.15px);
        mix-blend-mode: screen;
        animation: cawf-time-dust-float calc(34s / var(--cawf-time-speed-safe)) linear infinite alternate;
      }

      /* 새벽: 밤 배경처럼 위에서 아래로 쭉 칠해진 푸른 하늘 위에, 아래쪽으로 갈수록 핑크+주황 여명이 번진다. */
      #${IDS.root}[data-time-effect="dawn"] #${IDS.timeLayer},
      #${IDS.timeLayer}[data-time-effect="dawn"] {
        background:
          linear-gradient(180deg,
            rgba(6,14,42,.94) 0%,
            rgba(10,24,62,.88) 20%,
            rgba(20,46,96,.76) 38%,
            rgba(88,80,132,.56) 54%,
            rgba(198,120,142,.42) 72%,
            rgba(255,170,120,.34) 88%,
            rgba(255,214,184,.18) 100%);
        filter: saturate(1.08) brightness(calc(0.97 * var(--cawf-time-brightness, 1))) contrast(var(--cawf-time-contrast, 1));
      }

      #${IDS.root}[data-time-effect="dawn"] #${IDS.timeWash},
      #${IDS.timeLayer}[data-time-effect="dawn"] #${IDS.timeWash} {
        background:
          linear-gradient(180deg,
            rgba(6,14,42,.94) 0%,
            rgba(10,24,62,.88) 20%,
            rgba(20,46,96,.76) 38%,
            rgba(88,80,132,.56) 54%,
            rgba(198,120,142,.42) 72%,
            rgba(255,170,120,.34) 88%,
            rgba(255,214,184,.18) 100%);
      }

      #${IDS.root}[data-time-effect="dawn"] #${IDS.timeLayer}::before,
      #${IDS.timeLayer}[data-time-effect="dawn"]::before {
        background:
          radial-gradient(circle at 8% 14%, rgba(255,255,255,.62) 0 .72px, rgba(255,255,255,.18) 1.24px, transparent 2.45px),
          radial-gradient(circle at 18% 28%, rgba(222,236,255,.48) 0 .58px, rgba(222,236,255,.14) 1.08px, transparent 2.18px),
          radial-gradient(circle at 30% 10%, rgba(255,255,255,.60) 0 .68px, rgba(255,255,255,.17) 1.18px, transparent 2.38px),
          radial-gradient(circle at 42% 22%, rgba(216,232,255,.44) 0 .52px, rgba(216,232,255,.13) 1.02px, transparent 2.08px),
          radial-gradient(circle at 56% 13%, rgba(255,255,255,.58) 0 .66px, rgba(255,255,255,.17) 1.16px, transparent 2.32px),
          radial-gradient(circle at 68% 24%, rgba(214,228,255,.42) 0 .50px, rgba(214,228,255,.12) 1.00px, transparent 2.02px),
          radial-gradient(circle at 80% 15%, rgba(255,255,255,.56) 0 .64px, rgba(255,255,255,.16) 1.14px, transparent 2.28px),
          radial-gradient(circle at 92% 27%, rgba(216,230,255,.46) 0 .54px, rgba(216,230,255,.13) 1.04px, transparent 2.12px),
          linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,0) 30%);
        opacity: calc(.54 * var(--cawf-time-detail-strength, 1));
        filter: drop-shadow(0 0 4px rgba(178,202,255,.16));
        animation: cawf-time-stars-soft calc(6.2s / var(--cawf-time-speed-safe)) ease-in-out infinite alternate;
      }

      #${IDS.root}[data-time-effect="dawn"] #${IDS.timeLayer}::after,
      #${IDS.timeLayer}[data-time-effect="dawn"]::after {
        background:
          linear-gradient(180deg, transparent 0 36%, rgba(255,196,176,.08) 54%, rgba(255,168,126,.16) 74%, transparent 100%),
          radial-gradient(120% 42% at 50% 82%, rgba(255,148,116,.26), rgba(255,148,116,.10) 42%, transparent 76%);
        opacity: calc(.60 * var(--cawf-time-detail-strength, 1));
        filter: blur(16px);
        animation: cawf-time-horizon-breathe calc(46s / var(--cawf-time-speed-safe)) ease-in-out infinite alternate;
      }

      /* 노을: 바탕색은 조금만 누르고, 노을빛/구름/헤이즈가 더 잘 보이도록 밸런스를 재조정 */
      #${IDS.root}[data-time-effect="sunset"] #${IDS.timeLayer},
      #${IDS.timeLayer}[data-time-effect="sunset"] {
        /* The shared time mask is already fully transparent below 60%.
           Add a redundant hard clip at the same boundary so Chromium cannot briefly
           composite the hidden orange tail outside the mask during GPU repaint. */
        -webkit-clip-path: inset(0 0 40% 0);
        clip-path: inset(0 0 40% 0);
        background:
          linear-gradient(180deg,
            rgba(120,136,206,.56) 0%,
            rgba(142,122,214,.54) 16%,
            rgba(172,114,204,.50) 32%,
            rgba(214,132,160,.42) 44%,
            rgba(255,176,116,.40) 54%,
            rgba(255,132,80,.42) 62%,
            rgba(255,204,160,.18) 78%,
            transparent 100%);
        filter: saturate(1.07) brightness(calc(.91 * var(--cawf-time-brightness, 1))) contrast(var(--cawf-time-contrast, 1));
      }

      #${IDS.root}[data-time-effect="sunset"] #${IDS.timeWash},
      #${IDS.timeLayer}[data-time-effect="sunset"] #${IDS.timeWash} {
        background:
          linear-gradient(180deg,
            rgba(120,136,206,.56) 0%,
            rgba(142,122,214,.54) 16%,
            rgba(172,114,204,.50) 32%,
            rgba(214,132,160,.42) 44%,
            rgba(255,176,116,.40) 54%,
            rgba(255,132,80,.42) 62%,
            rgba(255,204,160,.18) 78%,
            transparent 100%);
      }

      #${IDS.root}[data-time-effect="sunset"] #${IDS.timeLayer}::before,
      #${IDS.timeLayer}[data-time-effect="sunset"]::before {
        background:
          linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,0) 24%),
          linear-gradient(180deg, transparent 24%, rgba(255,214,184,.11) 40%, rgba(255,174,118,.20) 56%, rgba(255,140,86,.14) 66%, transparent 84%),
          radial-gradient(116% 34% at 50% 58%, rgba(255,138,82,.26), rgba(255,138,82,.11) 38%, transparent 72%);
        opacity: calc(.76 * var(--cawf-time-detail-strength, 1));
        filter: blur(13px);
        animation: cawf-time-horizon-breathe calc(42s / var(--cawf-time-speed-safe)) ease-in-out infinite alternate;
      }

      #${IDS.root}[data-time-effect="sunset"] #${IDS.timeLayer}::after,
      #${IDS.timeLayer}[data-time-effect="sunset"]::after {
        background:
          linear-gradient(98deg, transparent 0 8%, rgba(255,224,196,.14) 24%, transparent 48% 100%),
          radial-gradient(104% 34% at 50% 56%, rgba(255,120,66,.24), rgba(255,120,66,.09) 40%, transparent 72%);
        opacity: calc(.62 * var(--cawf-time-detail-strength, 1));
        filter: blur(15px);
        animation: cawf-time-haze-drift calc(44s / var(--cawf-time-speed-safe)) ease-in-out infinite alternate;
      }

      /* 초저녁: 노을이 거의 사라진 뒤의 코발트/보라 박명 + 낮게 남은 잔광 + 드문 별 */
      #${IDS.root}[data-time-effect="twilight"] #${IDS.timeLayer},
      #${IDS.timeLayer}[data-time-effect="twilight"] {
        background:
          radial-gradient(110% 42% at 50% 3%, rgba(83,100,176,.24), transparent 70%),
          linear-gradient(180deg,
            rgba(20,29,73,.88) 0%,
            rgba(31,44,102,.82) 20%,
            rgba(55,61,126,.72) 37%,
            rgba(101,72,139,.56) 50%,
            rgba(181,91,139,.34) 61%,
            rgba(244,143,119,.18) 72%,
            transparent 94%);
        filter: saturate(1.08) brightness(calc(.94 * var(--cawf-time-brightness, 1))) contrast(var(--cawf-time-contrast, 1));
      }

      #${IDS.root}[data-time-effect="twilight"] #${IDS.timeWash},
      #${IDS.timeLayer}[data-time-effect="twilight"] #${IDS.timeWash} {
        background:
          radial-gradient(110% 42% at 50% 3%, rgba(83,100,176,.24), transparent 70%),
          linear-gradient(180deg,
            rgba(20,29,73,.88) 0%,
            rgba(31,44,102,.82) 20%,
            rgba(55,61,126,.72) 37%,
            rgba(101,72,139,.56) 50%,
            rgba(181,91,139,.34) 61%,
            rgba(244,143,119,.18) 72%,
            transparent 94%);
      }

      #${IDS.root}[data-time-effect="twilight"] #${IDS.timeLayer}::before,
      #${IDS.timeLayer}[data-time-effect="twilight"]::before {
        inset: -1.5%;
        background-image: url("${TWILIGHT_STARFIELD_DATA_URL}");
        background-position: center top;
        background-repeat: no-repeat;
        background-size: cover;
        opacity: calc(.56 * var(--cawf-time-detail-strength, 1));
        filter: saturate(.55) brightness(1.08) drop-shadow(0 0 4px rgba(190,210,255,.18));
        mix-blend-mode: screen;
        transform: scale(1.01);
        transform-origin: center top;
        animation: cawf-time-twilight-texture-drift calc(70s / var(--cawf-time-speed-safe)) ease-in-out infinite alternate;
      }

      #${IDS.root}[data-time-effect="twilight"] #${IDS.timeLayer}::after,
      #${IDS.timeLayer}[data-time-effect="twilight"]::after {
        background:
          linear-gradient(180deg, transparent 0 36%, rgba(191,113,160,.08) 50%, rgba(255,154,125,.13) 61%, transparent 76%),
          radial-gradient(128% 28% at 50% 57%, rgba(239,139,153,.20), rgba(155,92,153,.09) 42%, transparent 73%),
          radial-gradient(72% 24% at 72% 42%, rgba(126,145,218,.08), transparent 70%);
        opacity: calc(.78 * var(--cawf-time-detail-strength, 1));
        filter: blur(15px);
        mix-blend-mode: screen;
        animation: cawf-time-twilight-horizon calc(38s / var(--cawf-time-speed-safe)) ease-in-out infinite alternate;
      }

      /* PNG 별밭 위에서 따로 반짝이는 강조 별 5개. 달 주변과 수평선은 비워둔다. */
      #${IDS.root}[data-time-effect="twilight"] #${IDS.timeDust},
      #${IDS.timeLayer}[data-time-effect="twilight"] #${IDS.timeDust} {
        display: block;
        inset: 0;
        height: auto;
        opacity: 1;
        mix-blend-mode: screen;
        filter: drop-shadow(0 0 5px rgba(190,210,255,.22));
        background:
          radial-gradient(circle at 16% 18%, rgba(255,255,255,.76) 0 .72px, rgba(222,235,255,.18) 1.18px, transparent 2.25px),
          radial-gradient(circle at 69% 11%, rgba(239,247,255,.68) 0 .64px, rgba(207,226,255,.16) 1.08px, transparent 2.08px);
      }

      #${IDS.root}[data-time-effect="twilight"] #${IDS.timeDust}::before,
      #${IDS.timeLayer}[data-time-effect="twilight"] #${IDS.timeDust}::before {
        background:
          radial-gradient(circle at 41% 8%, rgba(255,255,255,.82) 0 .82px, rgba(225,237,255,.20) 1.28px, transparent 2.42px),
          radial-gradient(circle at 77% 28%, rgba(232,243,255,.72) 0 .70px, rgba(204,224,255,.17) 1.14px, transparent 2.18px);
        opacity: .62;
        animation: cawf-time-twilight-stars-b calc(8.6s / var(--cawf-time-speed-safe)) ease-in-out infinite alternate;
      }

      #${IDS.root}[data-time-effect="twilight"] #${IDS.timeDust}::after,
      #${IDS.timeLayer}[data-time-effect="twilight"] #${IDS.timeDust}::after {
        background:
          radial-gradient(circle at 55% 24%, rgba(255,255,255,.86) 0 .88px, rgba(218,234,255,.22) 1.36px, transparent 2.56px);
        opacity: .66;
        animation: cawf-time-twilight-stars-c calc(11.4s / var(--cawf-time-speed-safe)) ease-in-out infinite alternate-reverse;
      }

      /* 구름 레이어: CodePen https://codepen.io/vavik96/pen/vEdMXM 의 구름 이미지를 참고해 새벽/노을에만 가볍게 흐르게 */
      #${IDS.root}[data-time-effect="dawn"] #${IDS.timeDust},
      #${IDS.root}[data-time-effect="sunset"] #${IDS.timeDust},
      #${IDS.timeLayer}[data-time-effect="dawn"] #${IDS.timeDust},
      #${IDS.timeLayer}[data-time-effect="sunset"] #${IDS.timeDust} {
        display: block;
        inset: -2% -8% auto -8%;
        height: 56%;
        opacity: .10;
        mix-blend-mode: screen;
        filter: blur(.35px) drop-shadow(0 0 8px rgba(255,236,220,.12));
        background-image: url("https://s.cdpn.io/15514/clouds_2.png");
        background-repeat: repeat-x;
        background-size: 1000px auto;
        background-position: 0 0;
        animation: cawf-time-clouds-1 calc(66s / var(--cawf-time-speed-safe)) infinite linear;
      }

      #${IDS.root}[data-time-effect="dawn"] #${IDS.timeDust}::before,
      #${IDS.root}[data-time-effect="sunset"] #${IDS.timeDust}::before,
      #${IDS.timeLayer}[data-time-effect="dawn"] #${IDS.timeDust}::before,
      #${IDS.timeLayer}[data-time-effect="sunset"] #${IDS.timeDust}::before {
        background-image: url("https://s.cdpn.io/15514/clouds_1.png");
        background-repeat: repeat-x;
        background-size: 1000px auto;
        background-position: 0 8%;
        opacity: .20;
        animation: cawf-time-clouds-2 calc(50s / var(--cawf-time-speed-safe)) infinite linear;
      }

      #${IDS.root}[data-time-effect="dawn"] #${IDS.timeDust}::after,
      #${IDS.root}[data-time-effect="sunset"] #${IDS.timeDust}::after,
      #${IDS.timeLayer}[data-time-effect="dawn"] #${IDS.timeDust}::after,
      #${IDS.timeLayer}[data-time-effect="sunset"] #${IDS.timeDust}::after {
        background-image: url("https://s.cdpn.io/15514/clouds_3.png");
        background-repeat: repeat-x;
        background-size: 1579px auto;
        background-position: 0 18%;
        opacity: .08;
        animation: cawf-time-clouds-3 calc(57s / var(--cawf-time-speed-safe)) infinite linear;
      }

      /* 새벽도 100% 초과 구간에서 구름/성운 디테일이 같이 조금 더 살아나게 조정 */
      #${IDS.root}[data-time-effect="dawn"] #${IDS.timeDust},
      #${IDS.timeLayer}[data-time-effect="dawn"] #${IDS.timeDust} {
        opacity: calc(.12 * var(--cawf-time-detail-strength, 1));
      }

      #${IDS.root}[data-time-effect="dawn"] #${IDS.timeDust}::before,
      #${IDS.timeLayer}[data-time-effect="dawn"] #${IDS.timeDust}::before {
        opacity: calc(.14 * var(--cawf-time-detail-strength, 1));
      }

      #${IDS.root}[data-time-effect="dawn"] #${IDS.timeDust}::after,
      #${IDS.timeLayer}[data-time-effect="dawn"] #${IDS.timeDust}::after {
        opacity: calc(.09 * var(--cawf-time-detail-strength, 1));
      }

      /* 노을은 바탕색을 눌린 대신 구름이 조금 더 살아나도록 sunset 전용으로만 소폭 가산 */
      #${IDS.root}[data-time-effect="sunset"] #${IDS.timeDust},
      #${IDS.timeLayer}[data-time-effect="sunset"] #${IDS.timeDust} {
        opacity: calc(.14 * var(--cawf-time-detail-strength, 1));
      }

      #${IDS.root}[data-time-effect="sunset"] #${IDS.timeDust}::before,
      #${IDS.timeLayer}[data-time-effect="sunset"] #${IDS.timeDust}::before {
        opacity: calc(.17 * var(--cawf-time-detail-strength, 1));
      }

      #${IDS.root}[data-time-effect="sunset"] #${IDS.timeDust}::after,
      #${IDS.timeLayer}[data-time-effect="sunset"] #${IDS.timeDust}::after {
        opacity: calc(.10 * var(--cawf-time-detail-strength, 1));
      }

      /* 새벽은 높고 얇은 역방향 운층, 노을은 낮고 넓은 순방향 구름으로 장면을 분리한다. */
      #${IDS.root}[data-time-effect="dawn"] #${IDS.timeDust},
      #${IDS.timeLayer}[data-time-effect="dawn"] #${IDS.timeDust} {
        inset: -9% -8% auto -8%;
        height: 48%;
        filter: blur(.78px) drop-shadow(0 0 7px rgba(214,228,255,.10));
        animation-duration: calc(86s / var(--cawf-time-speed-safe));
        animation-direction: reverse;
      }

      #${IDS.root}[data-time-effect="dawn"] #${IDS.timeDust}::before,
      #${IDS.timeLayer}[data-time-effect="dawn"] #${IDS.timeDust}::before {
        animation-duration: calc(72s / var(--cawf-time-speed-safe));
        animation-direction: reverse;
      }

      #${IDS.root}[data-time-effect="dawn"] #${IDS.timeDust}::after,
      #${IDS.timeLayer}[data-time-effect="dawn"] #${IDS.timeDust}::after {
        animation-duration: calc(94s / var(--cawf-time-speed-safe));
        animation-direction: normal;
      }

      #${IDS.root}[data-time-effect="sunset"] #${IDS.timeDust},
      #${IDS.timeLayer}[data-time-effect="sunset"] #${IDS.timeDust} {
        inset: 3% -8% auto -8%;
        height: 62%;
        filter: blur(.24px) drop-shadow(0 0 10px rgba(255,218,190,.14));
        animation-duration: calc(62s / var(--cawf-time-speed-safe));
        animation-direction: normal;
      }

      #${IDS.root}[data-time-effect="sunset"] #${IDS.timeDust}::before,
      #${IDS.timeLayer}[data-time-effect="sunset"] #${IDS.timeDust}::before {
        animation-duration: calc(46s / var(--cawf-time-speed-safe));
        animation-direction: normal;
      }

      #${IDS.root}[data-time-effect="sunset"] #${IDS.timeDust}::after,
      #${IDS.timeLayer}[data-time-effect="sunset"] #${IDS.timeDust}::after {
        animation-duration: calc(72s / var(--cawf-time-speed-safe));
        animation-direction: reverse;
      }

      /* 밤: TIDES MOONLIT 팔레트 + 별만 반짝임. 해 뜬 듯한 빛 덩어리 제거 */
      #${IDS.root}[data-time-effect="night"] #${IDS.timeLayer},
      #${IDS.timeLayer}[data-time-effect="night"] {
        background:
          radial-gradient(104% 54% at 50% 0%, rgba(46,58,104,.44), rgba(30,42,82,.23) 38%, transparent 76%),
          linear-gradient(180deg, rgba(6,10,30,.84) 0%, rgba(10,18,44,.66) 42%, rgba(8,18,40,.38) 64%, rgba(8,18,40,.16) 76%, transparent 88%);
        filter: saturate(1.06) brightness(calc(.94 * var(--cawf-time-brightness, 1))) contrast(var(--cawf-time-contrast, 1));
      }

      #${IDS.root}[data-time-effect="night"] #${IDS.timeWash},
      #${IDS.timeLayer}[data-time-effect="night"] #${IDS.timeWash} {
        background:
          radial-gradient(104% 54% at 50% 0%, rgba(46,58,104,.44), rgba(30,42,82,.23) 38%, transparent 76%),
          linear-gradient(180deg, rgba(6,10,30,.84) 0%, rgba(10,18,44,.66) 42%, rgba(8,18,40,.38) 64%, rgba(8,18,40,.16) 76%, transparent 88%);
      }

      #${IDS.root}[data-time-effect="night"] #${IDS.timeLayer}::before,
      #${IDS.timeLayer}[data-time-effect="night"]::before {
        background:
          radial-gradient(circle at 8% 16%, rgba(255,255,255,.98) 0 .95px, rgba(255,255,255,.46) 1.45px, transparent 2.7px),
          radial-gradient(circle at 16% 38%, rgba(220,232,255,.86) 0 .8px, rgba(220,232,255,.34) 1.35px, transparent 2.5px),
          radial-gradient(circle at 25% 23%, rgba(255,255,255,.88) 0 .85px, rgba(255,255,255,.38) 1.35px, transparent 2.7px),
          radial-gradient(circle at 34% 45%, rgba(216,230,255,.72) 0 .75px, rgba(216,230,255,.32) 1.25px, transparent 2.4px),
          radial-gradient(circle at 43% 13%, rgba(255,255,255,.94) 0 1px, rgba(255,255,255,.38) 1.55px, transparent 2.9px),
          radial-gradient(circle at 52% 34%, rgba(220,232,255,.76) 0 .78px, rgba(220,232,255,.31) 1.25px, transparent 2.45px),
          radial-gradient(circle at 61% 18%, rgba(255,255,255,.82) 0 .82px, rgba(255,255,255,.35) 1.3px, transparent 2.6px),
          radial-gradient(circle at 70% 40%, rgba(216,230,255,.68) 0 .72px, rgba(216,230,255,.29) 1.2px, transparent 2.35px),
          radial-gradient(circle at 82% 20%, rgba(255,255,255,.86) 0 .88px, rgba(255,255,255,.34) 1.38px, transparent 2.65px),
          radial-gradient(circle at 93% 34%, rgba(220,232,255,.82) 0 .78px, rgba(220,232,255,.31) 1.24px, transparent 2.45px);
        opacity: calc(.90 * var(--cawf-time-detail-strength, 1));
        filter: drop-shadow(0 0 7px rgba(190,210,255,.42));
        animation: cawf-time-stars-a calc(4.6s / var(--cawf-time-speed-safe)) ease-in-out infinite alternate;
      }

      #${IDS.root}[data-time-effect="night"] #${IDS.timeLayer}::after,
      #${IDS.timeLayer}[data-time-effect="night"]::after {
        background:
          radial-gradient(circle at 14% 29%, rgba(255,255,255,.72) 0 .55px, transparent 2.2px),
          radial-gradient(circle at 31% 10%, rgba(222,235,255,.66) 0 .5px, transparent 2px),
          radial-gradient(circle at 47% 48%, rgba(255,255,255,.58) 0 .48px, transparent 1.9px),
          radial-gradient(circle at 66% 9%, rgba(255,255,255,.68) 0 .52px, transparent 2.05px),
          radial-gradient(circle at 78% 31%, rgba(222,235,255,.56) 0 .46px, transparent 1.9px),
          radial-gradient(circle at 90% 47%, rgba(255,255,255,.56) 0 .44px, transparent 1.85px);
        opacity: calc(.78 * var(--cawf-time-detail-strength, 1));
        filter: blur(.15px) drop-shadow(0 0 8px rgba(180,210,255,.34));
        animation: cawf-time-stars-b calc(6.8s / var(--cawf-time-speed-safe)) ease-in-out infinite alternate-reverse;
      }


      /*
       * Night sky CodePen port layer
       * - Meteor shower original structure: .star + .meteor-n + @keyframes meteor
       *   Source: https://codepen.io/Misty1636/pen/ZdzZPe
       * - Moon original structure: .canvas .moon, animated background-position + glow
       *   Source: https://codepen.io/gambhirsharma/pen/RwEPjPK
       * Retuned only for Crack: clipped to #${IDS.timeLayer}, night-only, semi-transparent, no global html/body reset.
       */
      #${IDS.nightSky} {
        position: absolute;
        inset: 0;
        display: none;
        overflow: hidden;
        pointer-events: none;
        z-index: 2;
        opacity: calc(.92 * var(--cawf-time-detail-strength, 1));
        -webkit-mask-image: linear-gradient(180deg, #000 0%, #000 47%, rgba(0,0,0,.74) 56%, rgba(0,0,0,.20) 66%, transparent 76%);
        mask-image: linear-gradient(180deg, #000 0%, #000 47%, rgba(0,0,0,.74) 56%, rgba(0,0,0,.20) 66%, transparent 76%);
      }

      #${IDS.root}[data-time-effect="night"] #${IDS.nightSky},
      #${IDS.root}[data-time-effect="dawn"] #${IDS.nightSky},
      #${IDS.root}[data-time-effect="sunset"] #${IDS.nightSky},
      #${IDS.root}[data-time-effect="twilight"] #${IDS.nightSky},
      #${IDS.timeLayer}[data-time-effect="night"] #${IDS.nightSky},
      #${IDS.timeLayer}[data-time-effect="dawn"] #${IDS.nightSky},
      #${IDS.timeLayer}[data-time-effect="sunset"] #${IDS.nightSky},
      #${IDS.timeLayer}[data-time-effect="twilight"] #${IDS.nightSky} {
        display: block;
      }

      #${IDS.root}[data-time-effect="dawn"] #${IDS.nightSky},
      #${IDS.root}[data-time-effect="sunset"] #${IDS.nightSky},
      #${IDS.timeLayer}[data-time-effect="dawn"] #${IDS.nightSky},
      #${IDS.timeLayer}[data-time-effect="sunset"] #${IDS.nightSky} {
        opacity: calc(.58 * var(--cawf-time-detail-strength, 1));
      }

      #${IDS.root}[data-time-effect="twilight"] #${IDS.nightSky},
      #${IDS.timeLayer}[data-time-effect="twilight"] #${IDS.nightSky} {
        opacity: calc(.72 * var(--cawf-time-detail-strength, 1));
      }

      #${IDS.root}[data-time-effect="dawn"] #${IDS.nightSky} .cawf-cp-meteor,
      #${IDS.root}[data-time-effect="sunset"] #${IDS.nightSky} .cawf-cp-meteor,
      #${IDS.root}[data-time-effect="twilight"] #${IDS.nightSky} .cawf-cp-meteor,
      #${IDS.timeLayer}[data-time-effect="dawn"] #${IDS.nightSky} .cawf-cp-meteor,
      #${IDS.timeLayer}[data-time-effect="sunset"] #${IDS.nightSky} .cawf-cp-meteor,
      #${IDS.timeLayer}[data-time-effect="twilight"] #${IDS.nightSky} .cawf-cp-meteor {
        display: none;
      }

      #${IDS.nightSky} .cawf-ns-canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        display: block;
        pointer-events: none;
      }

      #${IDS.nightSky} .cawf-cp-moon {
        position: absolute;
        top: clamp(22px, 7.2%, 76px);
        right: clamp(28px, 8.8%, 124px);
        width: clamp(56px, 9vw, 116px);
        height: clamp(56px, 9vw, 116px);
        border-radius: 50%;
        background-color: rgba(150,150,150,.58);
        background-image: url("https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_1k.jpg");
        background-size: 215%;
        background-position: left center;
        background-repeat: no-repeat;
        box-shadow: 0 0 clamp(18px, 4vw, 56px) clamp(1px, .8vw, 6px) rgba(255,255,255,.36);
        opacity: .34;
        mix-blend-mode: screen;
        filter: saturate(.76) brightness(1.04) contrast(.94);
        animation: cawf-cp-moon-texture calc(70s / var(--cawf-time-speed-safe)) linear infinite;
      }

      #${IDS.nightSky} .cawf-cp-moon::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 50%;
        background:
          radial-gradient(circle at 34% 30%, rgba(255,255,255,.18), transparent 18%),
          radial-gradient(circle at 68% 64%, rgba(0,0,0,.18), transparent 28%),
          linear-gradient(118deg, rgba(255,255,255,.20), rgba(255,255,255,0) 42%, rgba(0,0,0,.20));
        pointer-events: none;
      }

      #${IDS.nightSky} .cawf-cp-moon::after {
        content: '';
        position: absolute;
        inset: -14%;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(255,255,255,.22), rgba(255,255,255,.08) 42%, transparent 68%);
        opacity: .70;
        filter: blur(4px);
        pointer-events: none;
      }

      #${IDS.root}[data-time-effect="dawn"] #${IDS.nightSky} .cawf-cp-moon,
      #${IDS.root}[data-time-effect="sunset"] #${IDS.nightSky} .cawf-cp-moon,
      #${IDS.timeLayer}[data-time-effect="dawn"] #${IDS.nightSky} .cawf-cp-moon,
      #${IDS.timeLayer}[data-time-effect="sunset"] #${IDS.nightSky} .cawf-cp-moon {
        opacity: .16;
        box-shadow: 0 0 clamp(14px, 3vw, 42px) clamp(1px, .55vw, 4px) rgba(255,255,255,.16);
        filter: saturate(.62) brightness(1.12) contrast(.86);
      }

      #${IDS.root}[data-time-effect="dawn"] #${IDS.nightSky} .cawf-cp-moon::after,
      #${IDS.root}[data-time-effect="sunset"] #${IDS.nightSky} .cawf-cp-moon::after,
      #${IDS.timeLayer}[data-time-effect="dawn"] #${IDS.nightSky} .cawf-cp-moon::after,
      #${IDS.timeLayer}[data-time-effect="sunset"] #${IDS.nightSky} .cawf-cp-moon::after {
        opacity: .28;
        filter: blur(5px);
      }

      #${IDS.root}[data-time-effect="twilight"] #${IDS.nightSky} .cawf-cp-moon,
      #${IDS.timeLayer}[data-time-effect="twilight"] #${IDS.nightSky} .cawf-cp-moon {
        opacity: .30;
        box-shadow: 0 0 clamp(16px, 3.5vw, 48px) clamp(1px, .65vw, 5px) rgba(222,232,255,.24);
        filter: saturate(.68) brightness(1.08) contrast(.90);
      }

      #${IDS.root}[data-time-effect="twilight"] #${IDS.nightSky} .cawf-cp-moon::after,
      #${IDS.timeLayer}[data-time-effect="twilight"] #${IDS.nightSky} .cawf-cp-moon::after {
        opacity: .50;
        filter: blur(5px);
      }

      #${IDS.nightSky} .cawf-cp-meteor {
        position: absolute;
        width: 300px;
        height: 1px;
        transform: translate3d(0, -300px, 0) rotate(-45deg);
        transform-origin: left center;
        background-image: linear-gradient(to right, rgba(255,255,255,.94), rgba(255,255,255,0));
        opacity: 0;
        filter: drop-shadow(0 0 6px rgba(255,255,255,.46));
        will-change: transform, opacity;
        animation-name: cawf-cp-meteor;
        animation-duration: calc(20s / var(--cawf-time-speed-safe));
        animation-timing-function: linear;
        animation-iteration-count: infinite;
      }

      #${IDS.nightSky} .cawf-cp-meteor::before {
        content: '';
        position: absolute;
        width: 4px;
        height: 5px;
        border-radius: 50%;
        margin-top: -2px;
        background: rgba(255,255,255,.70);
        box-shadow: 0 0 15px 3px rgba(255,255,255,.86);
      }

      /* v0.6.7 balance: 12 rich meteors, still spread across the sky, with a slightly lower frequency. */
      #${IDS.nightSky} .cawf-cp-meteor-1 { top: 82px; left: 90%; animation-delay: -0.0s; }
      #${IDS.nightSky} .cawf-cp-meteor-2 { top: 154px; left: 62%; animation-delay: -1.67s; }
      #${IDS.nightSky} .cawf-cp-meteor-3 { top: 238px; left: 78%; animation-delay: -3.34s; }
      #${IDS.nightSky} .cawf-cp-meteor-4 { top: 112px; left: 44%; animation-delay: -5.01s; }
      #${IDS.nightSky} .cawf-cp-meteor-5 { top: 188px; left: 54%; animation-delay: -6.68s; }
      #${IDS.nightSky} .cawf-cp-meteor-6 { top: 64px; left: 72%; animation-delay: -8.35s; }
      #${IDS.nightSky} .cawf-cp-meteor-7 { top: 218px; left: 88%; animation-delay: -10.02s; }
      #${IDS.nightSky} .cawf-cp-meteor-8 { top: 132px; left: 35%; animation-delay: -11.69s; }
      #${IDS.nightSky} .cawf-cp-meteor-9 { top: 272px; left: 68%; animation-delay: -13.36s; }
      #${IDS.nightSky} .cawf-cp-meteor-10 { top: 96px; left: 50%; animation-delay: -15.03s; }
      #${IDS.nightSky} .cawf-cp-meteor-11 { top: 248px; left: 82%; animation-delay: -16.70s; }
      #${IDS.nightSky} .cawf-cp-meteor-12 { top: 72px; left: 28%; animation-delay: -18.37s; }


      @keyframes cawf-cp-moon-texture {
        to { background-position: right center; }
      }

      @keyframes cawf-cp-meteor {
        0% {
          opacity: 1;
          transform: translate3d(0, -300px, 0) rotate(-45deg);
        }
        12% {
          opacity: 0;
          transform: translate3d(-600px, 300px, 0) rotate(-45deg);
        }
        15% {
          opacity: 0;
          transform: translate3d(-600px, 300px, 0) rotate(-45deg);
        }
        100% {
          opacity: 0;
          transform: translate3d(-600px, 300px, 0) rotate(-45deg);
        }
      }

      @keyframes cawf-time-rays {
        0% { opacity: .48; transform: translate3d(-2.0%, -.9%, 0) skewX(-7deg) rotate(-1.2deg) scale(.99); }
        37% { opacity: .84; transform: translate3d(.4%, .2%, 0) skewX(-3deg) rotate(.6deg) scale(1.025); }
        68% { opacity: .64; transform: translate3d(1.7%, .8%, 0) skewX(-9deg) rotate(-.4deg) scale(1.01); }
        100% { opacity: .72; transform: translate3d(2.8%, 1.3%, 0) skewX(-5deg) rotate(.8deg) scale(1.02); }
      }

      @keyframes cawf-time-dust-float {
        0% { opacity: .40; transform: translate3d(-2.4%, -1.2%, 0) scale(1); }
        28% { opacity: .66; transform: translate3d(.8%, .3%, 0) scale(1.015); }
        58% { opacity: .56; transform: translate3d(2.8%, 1.2%, 0) scale(1.03); }
        100% { opacity: .44; transform: translate3d(5%, 2.4%, 0) scale(1.04); }
      }

      @keyframes cawf-time-dust-field-a {
        0% { opacity: .40; transform: translate3d(-3%, -1.5%, 0) scale(1); }
        35% { opacity: .68; transform: translate3d(.8%, .3%, 0) scale(1.018); }
        68% { opacity: .50; transform: translate3d(3.8%, 1.5%, 0) scale(1.035); }
        100% { opacity: .42; transform: translate3d(6.5%, 3%, 0) scale(1.05); }
      }

      @keyframes cawf-time-dust-field-b {
        0% { opacity: .26; transform: translate3d(2.5%, .7%, 0) scale(1.02); }
        48% { opacity: .58; transform: translate3d(-.6%, -.2%, 0) scale(1); }
        100% { opacity: .40; transform: translate3d(-4.5%, -2.2%, 0) scale(1.04); }
      }

      @keyframes cawf-time-dust-twinkle {
        0% { opacity: .28; transform: translate3d(.2%, -.1%, 0); }
        42% { opacity: .64; transform: translate3d(-.15%, .12%, 0); }
        100% { opacity: .30; transform: translate3d(.35%, .22%, 0); }
      }

      @keyframes cawf-time-horizon-breathe {
        0% { opacity: .30; transform: translate3d(-1.6%, -.6%, 0) scale(.98); }
        52% { opacity: .56; transform: translate3d(.8%, .4%, 0) scale(1.04); }
        100% { opacity: .44; transform: translate3d(1.8%, .8%, 0) scale(1.01); }
      }

      @keyframes cawf-time-twilight-horizon {
        0% { opacity: .58; transform: translate3d(-1.4%, -.5%, 0) scale(.99); }
        52% { opacity: .82; transform: translate3d(.7%, .35%, 0) scale(1.035); }
        100% { opacity: .68; transform: translate3d(1.5%, .7%, 0) scale(1.01); }
      }

      @keyframes cawf-time-stars-a {
        0% { opacity: .45; }
        42% { opacity: .98; }
        100% { opacity: .62; }
      }

      @keyframes cawf-time-stars-b {
        0% { opacity: .26; transform: translate3d(.25%, -.15%, 0); }
        55% { opacity: .78; transform: translate3d(-.2%, .12%, 0); }
        100% { opacity: .42; transform: translate3d(.12%, .2%, 0); }
      }

      @keyframes cawf-time-stars-soft {
        0% { opacity: .16; }
        52% { opacity: .42; }
        100% { opacity: .24; }
      }

      @keyframes cawf-time-twilight-texture-drift {
        0% { transform: translate3d(-.28%, -.10%, 0) scale(1.01); }
        100% { transform: translate3d(.28%, .14%, 0) scale(1.018); }
      }

      @keyframes cawf-time-twilight-stars-b {
        0% { opacity: .34; }
        46% { opacity: .70; }
        100% { opacity: .46; }
      }

      @keyframes cawf-time-twilight-stars-c {
        0% { opacity: .36; }
        58% { opacity: .78; }
        100% { opacity: .50; }
      }

      @keyframes cawf-time-clouds-1 {
        0% { background-position: 0 0; }
        100% { background-position: -1000px 0; }
      }

      @keyframes cawf-time-clouds-2 {
        0% { background-position: 0 8%; }
        100% { background-position: -1000px 8%; }
      }

      @keyframes cawf-time-clouds-3 {
        0% { background-position: 0 18%; }
        100% { background-position: -1579px 18%; }
      }

      /* ===== Ambient (햇빛 / 안개 / 촛불 / 밀려오는 파도 화면 이펙트) ===== */

      #${IDS.ambient} {
        position: absolute;
        inset: 0;
        overflow: hidden;
        pointer-events: none;
        display: none;
        -webkit-mask-image: linear-gradient(180deg, #000 0%, #000 28%, rgba(0,0,0,.84) 40%, rgba(0,0,0,.46) 50%, rgba(0,0,0,.14) 57%, transparent 60%);
        mask-image: linear-gradient(180deg, #000 0%, #000 28%, rgba(0,0,0,.84) 40%, rgba(0,0,0,.46) 50%, rgba(0,0,0,.14) 57%, transparent 60%);
      }

      #${IDS.root}[data-effect="sunlight"] #${IDS.ambient},
      #${IDS.root}[data-effect="fog"] #${IDS.ambient},
      #${IDS.root}[data-effect="sandstorm"] #${IDS.ambient},
      #${IDS.root}[data-effect="aurora"] #${IDS.ambient},
      #${IDS.root}[data-effect="galaxy"] #${IDS.ambient},
      #${IDS.root}[data-effect="spellcast"] #${IDS.ambient},
      #${IDS.root}[data-effect="mana"] #${IDS.ambient},
      #${IDS.root}[data-effect="bokeh"] #${IDS.ambient},
      #${IDS.root}[data-effect="candlelight"] #${IDS.ambient},
      #${IDS.root}[data-effect="shore"] #${IDS.ambient},
      #${IDS.root}[data-effect="fireworks"] #${IDS.ambient} {
        display: block;
      }

      #${IDS.root}[data-effect="spellcast"] #${IDS.ambient},
      #${IDS.root}[data-effect="mana"] #${IDS.ambient},
      #${IDS.root}[data-effect="bokeh"] #${IDS.ambient},
      #${IDS.root}[data-effect="galaxy"] #${IDS.ambient},
      #${IDS.root}[data-effect="fireworks"] #${IDS.ambient} {
        -webkit-mask-image: none;
        mask-image: none;
      }

      #${IDS.root}[data-effect="shore"] #${IDS.ambient} {
        opacity: calc(var(--cawf-effect-opacity, 1) * .88);
        background: linear-gradient(180deg, rgba(111,205,213,0) 0%, rgba(111,205,213,.035) 54%, rgba(177,231,226,.10) 76%, rgba(255,240,196,.13) 100%);
        mix-blend-mode: normal;
        -webkit-mask-image: linear-gradient(180deg, transparent 0%, transparent 45%, rgba(0,0,0,.12) 56%, rgba(0,0,0,.72) 71%, #000 100%);
        mask-image: linear-gradient(180deg, transparent 0%, transparent 45%, rgba(0,0,0,.12) 56%, rgba(0,0,0,.72) 71%, #000 100%);
      }

      #${IDS.ambient}::before,
      #${IDS.ambient}::after {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      /* ── 촛불: 아래쪽의 따뜻한 광원 + 불규칙한 벽 그림자 플리커 + 부유 먼지 ── */
      #${IDS.root}[data-effect="candlelight"] #${IDS.ambient} {
        opacity: var(--cawf-effect-opacity, 1);
        background:
          radial-gradient(120% 70% at 50% 108%,
            rgba(255,166,74,.15),
            rgba(255,140,54,.07) 44%,
            rgba(255,140,54,0) 74%),
          linear-gradient(0deg,
            rgba(255,150,58,.10) 0%,
            rgba(255,150,58,.04) 26%,
            rgba(255,150,58,0) 52%);
        mix-blend-mode: screen;
        -webkit-mask-image: linear-gradient(0deg, #000 0%, #000 42%, rgba(0,0,0,.75) 60%, rgba(0,0,0,.32) 78%, rgba(0,0,0,.10) 90%, transparent 100%);
        mask-image: linear-gradient(0deg, #000 0%, #000 42%, rgba(0,0,0,.75) 60%, rgba(0,0,0,.32) 78%, rgba(0,0,0,.10) 90%, transparent 100%);
      }

      #${IDS.root}[data-effect="candlelight"] #${IDS.ambient}::before {
        background:
          radial-gradient(46% 40% at 16% 104%,
            rgba(255,214,138,.34),
            rgba(255,168,74,.18) 38%,
            rgba(255,168,74,0) 72%),
          radial-gradient(38% 32% at 86% 106%,
            rgba(255,206,128,.28),
            rgba(255,158,64,.14) 40%,
            rgba(255,158,64,0) 72%),
          radial-gradient(80% 26% at 50% 106%,
            rgba(255,186,104,.12),
            rgba(255,186,104,0) 70%);
        mix-blend-mode: screen;
        filter: blur(6px);
        transform-origin: 50% 100%;
        animation: cawf-candle-breathe calc(6.1s / var(--cawf-effect-speed, 1)) ease-in-out infinite;
      }

      #${IDS.root}[data-effect="candlelight"] #${IDS.ambient}::after {
        background:
          radial-gradient(60% 34% at 18% 104%, rgba(255,226,160,.16), rgba(255,226,160,0) 68%),
          radial-gradient(50% 28% at 84% 106%, rgba(255,220,150,.13), rgba(255,220,150,0) 68%),
          linear-gradient(180deg, rgba(10,6,2,.16) 0%, rgba(10,6,2,.05) 34%, rgba(10,6,2,0) 58%);
        mix-blend-mode: normal;
        filter: blur(3px);
        transform-origin: 50% 100%;
        animation: cawf-candle-flicker calc(1.35s / var(--cawf-effect-speed, 1)) steps(1, end) infinite;
      }

      #${IDS.ambient} .cawf-candle-motes {
        position: absolute;
        inset: 0;
        pointer-events: none;
        mix-blend-mode: screen;
      }

      #${IDS.ambient} .cawf-candle-motes > i {
        position: absolute;
        left: var(--x, 50%);
        bottom: var(--y0, 4%);
        width: var(--size, 2.4px);
        height: var(--size, 2.4px);
        border-radius: 999px;
        background: radial-gradient(circle at 40% 35%,
          rgba(255,244,214,.95),
          rgba(255,208,132,.65) 50%,
          rgba(255,208,132,0) 100%);
        box-shadow: 0 0 var(--mote-glow, 6px) rgba(255,196,110,var(--mote-glow-a, .35));
        filter: blur(var(--mote-blur, 0px));
        opacity: 0;
        animation: cawf-candle-mote calc(var(--dur, 16s) / var(--cawf-effect-speed, 1)) ease-in-out infinite;
        animation-delay: var(--delay, 0s);
        will-change: transform, opacity;
      }

      @keyframes cawf-candle-breathe {
        0%, 100% { opacity: .86; transform: scale(1.000, 1.000); }
        18%      { opacity: .96; transform: scale(1.012, 1.030); }
        33%      { opacity: .80; transform: scale(.996, .984); }
        47%      { opacity: .92; transform: scale(1.006, 1.018); }
        64%      { opacity: .76; transform: scale(.992, .972); }
        79%      { opacity: .90; transform: scale(1.010, 1.024); }
      }

      @keyframes cawf-candle-flicker {
        0%   { opacity: .90; transform: translateX(0) scale(1.000); }
        11%  { opacity: .98; transform: translateX(.4px) scale(1.006); }
        23%  { opacity: .84; transform: translateX(-.5px) scale(.995); }
        34%  { opacity: .95; transform: translateX(.2px) scale(1.003); }
        45%  { opacity: .88; transform: translateX(-.3px) scale(.998); }
        58%  { opacity: 1; transform: translateX(.5px) scale(1.008); }
        71%  { opacity: .82; transform: translateX(-.4px) scale(.994); }
        84%  { opacity: .93; transform: translateX(.3px) scale(1.004); }
        100% { opacity: .90; transform: translateX(0) scale(1.000); }
      }

      @keyframes cawf-candle-mote {
        0% {
          transform: translate3d(0, 0, 0) scale(.7);
          opacity: 0;
        }
        16% { opacity: var(--alpha, .5); }
        50% {
          transform: translate3d(var(--sway, 2vw), calc(var(--rise, -20vh) * .55), 0) scale(1);
          opacity: var(--alpha-mid, .45);
        }
        84% { opacity: var(--alpha-end, .22); }
        100% {
          transform: translate3d(calc(var(--sway, 2vw) * -.6), var(--rise, -20vh), 0) scale(.75);
          opacity: 0;
        }
      }

      /* ── 햇빛: 창가에서 들어오는 따뜻한 빛줄기 (배경은 거의 칠하지 않음) ── */
      #${IDS.root}[data-effect="sunlight"] #${IDS.ambient} {
        background: radial-gradient(120% 80% at 86% -8%, rgba(255,236,180,.22), transparent 60%);
        mix-blend-mode: screen;
      }

      #${IDS.root}[data-effect="sunlight"] #${IDS.ambient}::before {
        left: -34%;
        top: -30%;
        right: auto;
        bottom: auto;
        width: 116%;
        height: 132%;
        background:
          linear-gradient(106deg, transparent 0 14%, rgba(255,247,212,.36) 18%, transparent 23% 35%, rgba(255,226,150,.22) 40%, transparent 46% 59%, rgba(255,250,222,.30) 63%, transparent 70% 100%),
          linear-gradient(118deg, transparent 0 25%, rgba(255,234,176,.18) 31%, transparent 38% 72%, rgba(255,252,228,.15) 79%, transparent 87% 100%);
        filter: blur(8px);
        opacity: .96;
        transform: skewX(-10deg);
        animation: cawf-sunray-sweep-main calc(18s / var(--cawf-effect-speed, 1)) ease-in-out infinite alternate;
      }

      #${IDS.root}[data-effect="sunlight"] #${IDS.ambient}::after {
        left: -24%;
        top: -12%;
        right: auto;
        bottom: auto;
        width: 84%;
        height: 62%;
        background:
          linear-gradient(122deg, transparent 0 33%, rgba(255,250,224,.24) 43%, transparent 52% 100%),
          linear-gradient(98deg, transparent 0 53%, rgba(255,224,148,.17) 60%, transparent 68% 100%);
        filter: blur(15px);
        opacity: .74;
        animation: cawf-sunray-sweep-soft calc(14s / var(--cawf-effect-speed, 1)) ease-in-out infinite alternate-reverse;
      }

      /* ── 안개: CodePen Fog Overlay에서 배경은 빼고 fog-1 / fog-2 두 레이어만 사용 ── */
      #${IDS.root}[data-effect="fog"] #${IDS.ambient} {
        background: none;
        mix-blend-mode: screen;
        -webkit-mask-image: linear-gradient(180deg, #000 0%, #000 24%, rgba(0,0,0,.84) 36%, rgba(0,0,0,.46) 48%, rgba(0,0,0,.16) 56%, transparent 60%);
        mask-image: linear-gradient(180deg, #000 0%, #000 24%, rgba(0,0,0,.84) 36%, rgba(0,0,0,.46) 48%, rgba(0,0,0,.16) 56%, transparent 60%);
      }

      #${IDS.root}[data-effect="fog"] #${IDS.ambient}::before,
      #${IDS.root}[data-effect="fog"] #${IDS.ambient}::after {
        top: 0;
        left: 0;
        right: auto;
        bottom: auto;
        width: 300%;
        height: 80%;
        background-repeat: repeat-x;
        background-size: auto 100%;
        background-position: 0 50%;
        filter: blur(.4px);
        will-change: transform;
      }

      #${IDS.root}[data-effect="fog"] #${IDS.ambient}::before {
        background-image: url("https://raw.githubusercontent.com/WebDevSHORTS/Fog-Overlay-Animation/f6f42d15e7303fa1bc939acf9caefc567cd1a232/img/fog-1.png");
        opacity: .50;
        animation: cawf-fog-marquee-slow calc(105s / var(--cawf-effect-speed, 1)) linear infinite;
      }

      #${IDS.root}[data-effect="fog"] #${IDS.ambient}::after {
        top: 8%;
        height: 72%;
        background-image: url("https://raw.githubusercontent.com/WebDevSHORTS/Fog-Overlay-Animation/f6f42d15e7303fa1bc939acf9caefc567cd1a232/img/fog-2.png");
        opacity: .40;
        animation: cawf-fog-marquee-fast calc(48s / var(--cawf-effect-speed, 1)) linear infinite;
      }

      /* ── 모래바람: 안개 텍스처를 세피아 틴트로 재활용, 한 방향 강풍 패럴랙스 ── */
      #${IDS.root}[data-effect="sandstorm"] #${IDS.ambient} {
        background:
          radial-gradient(130% 92% at 50% 110%, rgba(198,150,86,.30), rgba(198,150,86,0) 64%),
          linear-gradient(180deg, rgba(216,180,122,.08), rgba(190,144,80,.20) 66%, rgba(148,102,52,.28) 100%);
        -webkit-mask-image: linear-gradient(180deg, transparent 0%, rgba(0,0,0,.6) 9%, #000 22%, #000 100%);
        mask-image: linear-gradient(180deg, transparent 0%, rgba(0,0,0,.6) 9%, #000 22%, #000 100%);
      }

      #${IDS.root}[data-effect="sandstorm"] #${IDS.ambient}::before,
      #${IDS.root}[data-effect="sandstorm"] #${IDS.ambient}::after {
        top: 0;
        left: 0;
        right: auto;
        bottom: auto;
        width: 300%;
        height: 96%;
        background-repeat: repeat-x;
        background-size: auto 100%;
        background-position: 0 50%;
        will-change: transform;
      }

      #${IDS.root}[data-effect="sandstorm"] #${IDS.ambient}::before {
        background-image: url("https://raw.githubusercontent.com/WebDevSHORTS/Fog-Overlay-Animation/f6f42d15e7303fa1bc939acf9caefc567cd1a232/img/fog-1.png");
        opacity: .55;
        filter: sepia(1) saturate(2.6) hue-rotate(-10deg) brightness(.8) contrast(1.08) blur(.4px);
        animation: cawf-fog-marquee-slow calc(26s / var(--cawf-effect-speed, 1)) linear infinite;
      }

      #${IDS.root}[data-effect="sandstorm"] #${IDS.ambient}::after {
        top: 4%;
        height: 88%;
        background-image: url("https://raw.githubusercontent.com/WebDevSHORTS/Fog-Overlay-Animation/f6f42d15e7303fa1bc939acf9caefc567cd1a232/img/fog-2.png");
        opacity: .44;
        filter: sepia(1) saturate(2.3) hue-rotate(-7deg) brightness(.7) contrast(1.12) blur(.3px);
        animation: cawf-fog-marquee-slow calc(11s / var(--cawf-effect-speed, 1)) linear infinite;
      }

      @keyframes cawf-sunray-sweep-main {
        0% { opacity: .54; transform: translate3d(-4.5%, -1.8%, 0) skewX(-9deg) scaleX(.94); }
        38% { opacity: .96; transform: translate3d(-.8%, .4%, 0) skewX(-13deg) scaleX(1.02); }
        72% { opacity: .70; transform: translate3d(2.2%, .9%, 0) skewX(-8deg) scaleX(1.06); }
        100% { opacity: .88; transform: translate3d(4.2%, 1.6%, 0) skewX(-12deg) scaleX(.98); }
      }

      @keyframes cawf-sunray-sweep-soft {
        0% { opacity: .40; transform: translate3d(-2.2%, -.8%, 0) rotate(-1.5deg) scaleX(.96); }
        50% { opacity: .78; transform: translate3d(1.2%, .4%, 0) rotate(1deg) scaleX(1.04); }
        100% { opacity: .48; transform: translate3d(3.4%, 1.2%, 0) rotate(-.5deg) scaleX(1.01); }
      }

      @keyframes cawf-time-soft-breathe {
        0% { opacity: .46; transform: translate3d(-1.2%, -.6%, 0) scale(.98); }
        55% { opacity: .88; transform: translate3d(.8%, .4%, 0) scale(1.04); }
        100% { opacity: .64; transform: translate3d(1.5%, .9%, 0) scale(1.01); }
      }

      @keyframes cawf-time-haze-drift {
        0% { transform: translate3d(-2.5%, 0, 0); opacity: .44; }
        50% { transform: translate3d(.8%, .5%, 0); opacity: .74; }
        100% { transform: translate3d(3%, 0, 0); opacity: .52; }
      }

      @keyframes cawf-fog-marquee-slow {
        0% { transform: translate3d(0, 0, 0) scaleY(1); }
        50% { transform: translate3d(-33.3333%, -1.15%, 0) scaleY(1.022); }
        100% { transform: translate3d(-66.6667%, 0, 0) scaleY(1); }
      }

      @keyframes cawf-fog-marquee-fast {
        0% { transform: translate3d(-66.6667%, 0, 0) scaleY(1.012); }
        50% { transform: translate3d(-33.3333%, 1.25%, 0) scaleY(1.034); }
        100% { transform: translate3d(0, 0, 0) scaleY(1.012); }
      }


      /* ── 원근 해변: 화면 중앙 근처 바다 시작선 → 아래쪽 발치 모래로 파도가 내려친다. shore 전용 ── */

      /* ===== Underwater ambient effect =====
       * v1.2.1: custom CAWF overlay. No solid teal/black background; use a soft depth wash,
       * top-down rays, and floor caustics only so the chat background still breathes through.
       */
      #${IDS.root}[data-effect="underwater"] {
        isolation: auto;
      }

      #${IDS.underwaterLayer} {
        position: absolute;
        inset: 0;
        pointer-events: none;
        opacity: 0;
        transition: opacity .8s ease;
        z-index: 4;
        overflow: hidden;
        background: transparent !important;
      }

      #${IDS.root}[data-effect="underwater"] #${IDS.underwaterLayer} {
        opacity: 1;
      }

      /* underwater는 시간대 배경을 '상태'가 아니라 표시만 완전히 끈다. */
      #${IDS.root}[data-effect="underwater"] #${IDS.timeLayer},
      #${IDS.root}[data-effect="underwater"] #${IDS.timeWash},
      #${IDS.root}[data-effect="underwater"] #${IDS.nightSky},
      #${IDS.root}[data-effect="underwater"] #${IDS.timeDust} {
        display: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
      }

      #${IDS.root}[data-cawf-anim-paused="true"] #${IDS.underwaterLayer} *,
      #${IDS.root}[data-cawf-anim-paused="true"] #${IDS.underwaterLayer}::before,
      #${IDS.root}[data-cawf-anim-paused="true"] #${IDS.underwaterLayer}::after {
        animation-play-state: paused !important;
      }

      .cawf-uw-sand,
      .cawf-uw-water,
      .cawf-uw-vignette,
      .cawf-uw-bubbles {
        display: none !important;
        background: transparent !important;
      }

      .cawf-uw-depth {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 0;
        opacity: calc(var(--cawf-effect-opacity, 1) * .95);
        background:
          radial-gradient(70% 46% at 50% -12%, rgba(168,236,252,.5), rgba(168,236,252,0) 62%),
          radial-gradient(84% 42% at 50% 42%, rgba(116,170,214,.12), rgba(116,170,214,0) 72%),
          radial-gradient(135% 110% at 50% 4%, rgba(10,46,86,0) 30%, rgba(6,30,64,.6) 82%),
          linear-gradient(180deg,
            rgba(26,110,156,.95) 0%,
            rgba(17,82,130,.96) 34%,
            rgba(10,56,102,.97) 66%,
            rgba(5,32,68,.98) 100%);
        mix-blend-mode: normal;
        transform: translateZ(0);
      }

      /* v1.2.2: 이전 depth 보조 무늬가 굵은 세로 기둥처럼 보여서 제거.
         배경은 아주 얕은 수중 색감만 남기고, 빛줄기는 아래 .cawf-uw-rays에서만 담당한다. */
      .cawf-uw-depth::before,
      .cawf-uw-depth::after {
        content: none !important;
        display: none !important;
      }


      .cawf-uw-surface {
        position: absolute;
        left: -10%;
        right: -10%;
        top: -2%;
        height: 26%;
        pointer-events: none;
        z-index: 2;
        opacity: calc(var(--cawf-effect-opacity, 1) * .30);
        mix-blend-mode: screen;
        background:
          radial-gradient(78% 72% at 50% 0%, rgba(225,248,255,.34), rgba(225,248,255,0) 66%),
          repeating-linear-gradient(102deg,
            rgba(210,245,255,0) 0 7%, rgba(210,245,255,.07) 10%, rgba(210,245,255,0) 16%,
            rgba(255,255,255,0) 20%, rgba(255,255,255,.08) 24%, rgba(255,255,255,0) 30%);
        filter: blur(9px) saturate(1.06);
        -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,.95) 0%, rgba(0,0,0,.72) 48%, transparent 100%);
        mask-image: linear-gradient(to bottom, rgba(0,0,0,.95) 0%, rgba(0,0,0,.72) 48%, transparent 100%);
        animation: cawf-uw-surface-shift calc(18s / var(--cawf-effect-speed, 1)) ease-in-out infinite alternate;
      }

      .cawf-uw-drift {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 2;
        overflow: hidden;
        mix-blend-mode: screen;
        opacity: calc(var(--cawf-effect-opacity, 1) * .72);
      }

      .cawf-uw-drift::before,
      .cawf-uw-drift::after {
        content: none !important;
        display: none !important;
      }

      .cawf-uw-drift > span {
        position: absolute;
        left: var(--x, 50%);
        top: var(--y, 50%);
        width: var(--size, 4.2px);
        height: var(--size, 4.2px);
        margin-left: calc(var(--size, 4.2px) * -0.5);
        margin-top: calc(var(--size, 4.2px) * -0.5);
        border-radius: 50%;
        pointer-events: none;
        opacity: var(--alpha, .22);
        background: radial-gradient(circle at 34% 30%, rgba(255,255,255,.98) 0%, rgba(218,244,255,.90) 34%, rgba(185,229,255,.46) 62%, rgba(185,229,255,0) 78%);
        box-shadow: inset 1px 1px 2px rgba(255,255,255,.52), 0 0 6px rgba(160,226,255,.16);
        filter: blur(var(--blur, .15px));
        transform: translate3d(0, 0, 0) scale(var(--scale-start, 1));
        animation: cawf-uw-float var(--dur, 28s) ease-in-out infinite;
        animation-delay: var(--delay, 0s);
      }

      .cawf-uw-drift > span.cawf-uw-particle-soft {
        background: radial-gradient(circle at 36% 30%, rgba(247,253,255,.94) 0%, rgba(210,240,255,.76) 38%, rgba(184,224,255,.36) 64%, rgba(184,224,255,0) 80%);
        box-shadow: inset 1px 1px 2px rgba(255,255,255,.30);
      }

      .cawf-uw-drift > span.cawf-uw-particle-small {
        box-shadow: inset .6px .8px 1.6px rgba(255,255,255,.34), 0 0 4px rgba(170,228,255,.12);
      }

      @keyframes cawf-uw-surface-shift {
        0% { transform: translate3d(-1.4%, 0, 0) scaleX(1); opacity: .24; }
        50% { transform: translate3d(0%, 0, 0) scaleX(1.03); opacity: .34; }
        100% { transform: translate3d(1.4%, 0, 0) scaleX(1.01); opacity: .26; }
      }

      @keyframes cawf-uw-float {
        0% {
          transform: translate3d(0, 1.2vh, 0) rotate(0deg) scale(calc(var(--scale-start, 1) * .92));
          opacity: 0;
        }
        14% {
          opacity: calc(var(--alpha, .22) * .56);
        }
        30% {
          transform: translate3d(calc(var(--sway, 1.2vw) * -.34), calc(var(--dy, -10vh) * .18), 0) rotate(calc(var(--tilt-mid, 2.6deg) * -.35)) scale(calc(var(--scale-start, 1) * .99));
          opacity: calc(var(--alpha, .22) * .92);
        }
        58% {
          transform: translate3d(calc(var(--sway, 1.2vw) * .42), calc(var(--dy, -10vh) * .52), 0) rotate(var(--tilt-mid, 2.6deg)) scale(calc(var(--scale-end, 1.08) * .98));
          opacity: var(--alpha, .22);
        }
        84% {
          transform: translate3d(calc(var(--dx, 3.2vw) * .78), calc(var(--dy, -10vh) * .82), 0) rotate(calc(var(--tilt-end, 4deg) * -.32)) scale(calc(var(--scale-end, 1.08) * 1.01));
          opacity: calc(var(--alpha, .22) * .72);
        }
        100% {
          transform: translate3d(var(--dx, 3.2vw), var(--dy, -10vh), 0) rotate(var(--tilt-end, 4deg)) scale(var(--scale-end, 1.08));
          opacity: 0;
        }
      }

      .cawf-uw-rays {
        position: absolute;
        inset: -26% -52% 20%;
        pointer-events: none;
        z-index: 3;
        mix-blend-mode: screen;
        opacity: calc(var(--cawf-effect-opacity, 1) * .92);
        --cawf-uw-ray-tempo: calc(8.8s / var(--cawf-effect-speed, 1));
        --cawf-uw-ray-transp: transparent;
        --cawf-uw-ray-white: rgba(206, 249, 255, .92);
        --cawf-uw-ray-black: rgba(0, 0, 0, .74);
        --cawf-uw-ray-tint: rgba(92, 222, 255, .38);
        -webkit-mask-image: radial-gradient(farthest-side at 50% 0%, rgba(0,0,0,1) 0%, rgba(0,0,0,.9) 38%, rgba(0,0,0,.38) 66%, transparent 88%);
        mask-image: radial-gradient(farthest-side at 50% 0%, rgba(0,0,0,1) 0%, rgba(0,0,0,.9) 38%, rgba(0,0,0,.38) 66%, transparent 88%);
      }

      .cawf-uw-rays div {
        position: absolute;
        right: -50%;
        bottom: -28%;
        width: 200%;
        height: 210%;
        transform-origin: top center;
        opacity: .62;
        background:
          conic-gradient(from 130deg at 50% 0%,
            var(--cawf-uw-ray-transp),
            var(--cawf-uw-ray-tint),
            var(--cawf-uw-ray-transp),
            var(--cawf-uw-ray-tint), var(--cawf-uw-ray-tint), var(--cawf-uw-ray-tint),
            var(--cawf-uw-ray-transp), var(--cawf-uw-ray-transp),
            var(--cawf-uw-ray-tint), var(--cawf-uw-ray-tint),
            var(--cawf-uw-ray-transp) 100deg),
          conic-gradient(from 130deg at 50% 0%,
            var(--cawf-uw-ray-transp),
            var(--cawf-uw-ray-black),
            var(--cawf-uw-ray-transp), var(--cawf-uw-ray-transp), var(--cawf-uw-ray-transp),
            var(--cawf-uw-ray-black),
            var(--cawf-uw-ray-transp), var(--cawf-uw-ray-transp), var(--cawf-uw-ray-transp),
            var(--cawf-uw-ray-black), var(--cawf-uw-ray-black),
            var(--cawf-uw-ray-transp),
            var(--cawf-uw-ray-black), var(--cawf-uw-ray-black),
            var(--cawf-uw-ray-transp), var(--cawf-uw-ray-transp),
            var(--cawf-uw-ray-black),
            var(--cawf-uw-ray-transp) 100deg),
          conic-gradient(from 130deg at 50% 0%,
            var(--cawf-uw-ray-transp),
            var(--cawf-uw-ray-white),
            var(--cawf-uw-ray-transp),
            var(--cawf-uw-ray-white),
            var(--cawf-uw-ray-transp),
            var(--cawf-uw-ray-white),
            var(--cawf-uw-ray-transp),
            var(--cawf-uw-ray-white),
            var(--cawf-uw-ray-transp),
            var(--cawf-uw-ray-white),
            var(--cawf-uw-ray-transp),
            var(--cawf-uw-ray-white),
            var(--cawf-uw-ray-transp) 100deg);
        filter: blur(3px);
        animation: cawf-uw-raylight var(--cawf-uw-ray-tempo) ease-in-out infinite alternate;
      }

      .cawf-uw-rays div::before {
        content: "";
        position: absolute;
        inset: 0;
        background:
          conic-gradient(from 130deg at 50% 0%,
            var(--cawf-uw-ray-transp),
            var(--cawf-uw-ray-black),
            var(--cawf-uw-ray-transp),
            var(--cawf-uw-ray-black),
            var(--cawf-uw-ray-transp),
            var(--cawf-uw-ray-black), var(--cawf-uw-ray-black),
            var(--cawf-uw-ray-transp),
            var(--cawf-uw-ray-black), var(--cawf-uw-ray-black),
            var(--cawf-uw-ray-transp),
            var(--cawf-uw-ray-black),
            var(--cawf-uw-ray-transp),
            var(--cawf-uw-ray-black), var(--cawf-uw-ray-black),
            var(--cawf-uw-ray-transp),
            var(--cawf-uw-ray-black),
            var(--cawf-uw-ray-transp) 100deg);
        transform-origin: top center;
        animation: cawf-uw-raydark var(--cawf-uw-ray-tempo) linear infinite alternate;
      }

      .cawf-uw-rays div:nth-child(2) {
        opacity: .42;
        animation-duration: calc(12s / var(--cawf-effect-speed, 1));
        animation-direction: alternate-reverse;
        transform: rotateZ(-4deg) scaleX(1.06);
        filter: blur(8px);
      }

      @keyframes cawf-uw-raylight {
        0% { opacity: .26; transform: rotateZ(5deg) scaleX(1.04); }
        50% { opacity: .72; transform: rotateZ(0deg) scaleX(1.08); }
        100% { opacity: .34; transform: rotateZ(-5deg) scaleX(1.04); }
      }

      @keyframes cawf-uw-raydark {
        0% { opacity: .14; transform: rotateZ(15deg); }
        50% { opacity: .62; transform: rotateZ(0deg); }
        100% { opacity: .18; transform: rotateZ(-15deg); }
      }

      .cawf-uw-floor {
        position: absolute;
        left: -8%;
        right: -8%;
        bottom: -8%;
        height: 64%;
        pointer-events: none;
        z-index: 1;
        perspective: 720px;
        perspective-origin: 50% 52%;
        -webkit-mask-image: linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 62%, rgba(0,0,0,.55) 82%, transparent 100%);
        mask-image: linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 62%, rgba(0,0,0,.55) 82%, transparent 100%);
              isolation: isolate;
      }

      .cawf-uw-floor::after {
        content: "";
        position: absolute;
        inset: -2% -2% -4%;
        pointer-events: none;
        z-index: 2;
        background:
          radial-gradient(132% 96% at 50% 102%, transparent 0 50%, rgba(4,20,42,.06) 66%, rgba(4,20,42,.18) 85%, rgba(4,20,42,.30) 100%),
          linear-gradient(to top, rgba(4,18,38,.18) 0%, rgba(4,18,38,.06) 15%, transparent 36%);
        mix-blend-mode: multiply;
      }

      #${IDS.underwaterCanvas} {
        position: absolute;
        left: 50%;
        bottom: -10%;
        width: 260%;
        height: 155vh;
        display: block;
        pointer-events: none;
        mix-blend-mode: screen;
        opacity: calc(var(--cawf-effect-opacity, 1) * 1.02);
        filter: brightness(1.82) contrast(1.28) saturate(.84);
        transform: translateX(-50%) rotateX(68deg) translateZ(0);
        transform-origin: 50% 100%;
      }

      #${IDS.ambient} .cawf-shore-scene {
        position: absolute;
        left: -10%;
        right: -10%;
        bottom: -8%;
        height: clamp(250px, 56%, 640px);
        overflow: hidden;
        pointer-events: none;
        transform: translateZ(0);
        contain: layout paint style;
        --cawf-shore-speed-safe: var(--cawf-effect-speed, 1);
        /* top은 채팅 가독성용 페이드, 실제 바다는 중단부터 보이게 한다. */
        -webkit-mask-image: linear-gradient(0deg, #000 0%, #000 28%, rgba(0,0,0,.98) 48%, rgba(0,0,0,.78) 68%, rgba(0,0,0,.28) 86%, transparent 100%);
        mask-image: linear-gradient(0deg, #000 0%, #000 28%, rgba(0,0,0,.98) 48%, rgba(0,0,0,.78) 68%, rgba(0,0,0,.28) 86%, transparent 100%);
      }

      #${IDS.ambient} .cawf-shore-defs {
        position: absolute;
        width: 0;
        height: 0;
        overflow: hidden;
        pointer-events: none;
      }

      #${IDS.ambient} .cawf-shore-sea,
      #${IDS.ambient} .cawf-shore-depth-haze,
      #${IDS.ambient} .cawf-shore-yoonseul,
      #${IDS.ambient} .cawf-shore-sand,
      #${IDS.ambient} .cawf-shore-wet-sand,
      #${IDS.ambient} .cawf-shore-wet-trace,
      #${IDS.ambient} .cawf-shore-wash,
      #${IDS.ambient} .cawf-shore-ripples,
      #${IDS.ambient} .cawf-shore-undulation,
      #${IDS.ambient} .cawf-shore-foam,
      #${IDS.ambient} .cawf-shore-flecks {
        position: absolute;
        pointer-events: none;
      }

      /* 바다 본체: 화면 중앙 근처에서 시작. 시간대 배경색은 screen/soft-light blend로 흡수한다. */
      #${IDS.ambient} .cawf-shore-sea {
        left: -7%;
        right: -7%;
        top: 6%;
        bottom: -4%;
        background:
          linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(178,238,255,.10) 10%, rgba(76,198,244,.28) 32%, rgba(42,142,225,.36) 68%, rgba(48,146,220,.28) 100%),
          radial-gradient(120% 62% at 50% 20%, rgba(218,246,255,.14), rgba(110,207,246,.25) 42%, rgba(56,164,230,.35) 74%, rgba(255,255,255,0) 100%);
        filter: saturate(1.02) brightness(1.0) blur(.38px);
        opacity: .66;
        mix-blend-mode: screen;
        transform-origin: 50% 100%;
        animation: cawf-shore-sea-breathe calc(18s / var(--cawf-shore-speed-safe)) ease-in-out infinite;
      }

      #${IDS.ambient} .cawf-shore-sea::before,
      #${IDS.ambient} .cawf-shore-sea::after {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      #${IDS.ambient} .cawf-shore-sea::before {
        background:
          radial-gradient(ellipse at 12% 44%, rgba(255,255,255,.13), rgba(255,255,255,0) 34%),
          radial-gradient(ellipse at 34% 54%, rgba(180,255,242,.11), rgba(180,255,242,0) 38%),
          radial-gradient(ellipse at 60% 48%, rgba(255,255,255,.13), rgba(255,255,255,0) 35%),
          radial-gradient(ellipse at 88% 56%, rgba(190,255,244,.10), rgba(190,255,244,0) 38%);
        opacity: .40;
        filter: blur(2.35px);
        animation: cawf-shore-soft-bloom calc(20s / var(--cawf-shore-speed-safe)) ease-in-out infinite;
      }

      #${IDS.ambient} .cawf-shore-sea::after {
        background:
          radial-gradient(ellipse at 10% 32%, rgba(255,255,255,.18), rgba(255,255,255,0) 33%),
          radial-gradient(ellipse at 28% 40%, rgba(210,255,250,.18), rgba(210,255,250,0) 38%),
          radial-gradient(ellipse at 50% 38%, rgba(255,255,255,.17), rgba(255,255,255,0) 40%),
          radial-gradient(ellipse at 74% 42%, rgba(222,255,251,.17), rgba(222,255,251,0) 36%),
          radial-gradient(ellipse at 92% 52%, rgba(255,255,255,.13), rgba(255,255,255,0) 35%);
        opacity: .48;
        filter: blur(1.65px);
        animation: cawf-shore-glints calc(10.8s / var(--cawf-shore-speed-safe)) ease-in-out infinite reverse;
      }

      #${IDS.ambient} .cawf-shore-depth-haze {
        left: -4%;
        right: -4%;
        top: 0%;
        height: 42%;
        background:
          linear-gradient(180deg, rgba(225,255,250,0) 0%, rgba(225,255,250,.045) 42%, rgba(255,255,255,.060) 70%, rgba(255,255,255,0) 100%),
          radial-gradient(80% 40% at 50% 84%, rgba(255,255,255,.09), rgba(255,255,255,0) 68%);
        mix-blend-mode: screen;
        opacity: .38;
        filter: blur(1.2px);
        animation: cawf-shore-haze calc(22s / var(--cawf-shore-speed-safe)) ease-in-out infinite;
      }

      /* 윤슬/물비늘: 바다 본체 위, 포말 아래에 아주 얇은 비늘형 빛조각을 흩뿌린다. */
      #${IDS.ambient} .cawf-shore-yoonseul {
        left: -6%;
        right: -6%;
        top: 7%;
        bottom: 16%;
        overflow: hidden;
        mix-blend-mode: screen;
        opacity: calc(var(--cawf-effect-opacity, 1) * .78);
        filter: saturate(1.04) brightness(1.04);
        -webkit-mask-image: linear-gradient(180deg, transparent 0%, rgba(0,0,0,.20) 8%, #000 24%, #000 78%, rgba(0,0,0,.20) 94%, transparent 100%);
        mask-image: linear-gradient(180deg, transparent 0%, rgba(0,0,0,.20) 8%, #000 24%, #000 78%, rgba(0,0,0,.20) 94%, transparent 100%);
        animation: cawf-shore-yoonseul-drift calc(16s / var(--cawf-shore-speed-safe)) ease-in-out infinite;
      }

      #${IDS.ambient} .cawf-shore-yoonseul b {
        position: absolute;
        left: var(--x);
        top: var(--y);
        width: var(--w);
        height: var(--h);
        border-radius: 999px;
        pointer-events: none;
        background:
          linear-gradient(90deg, rgba(255,255,255,0), rgba(246,255,252,var(--op)) 42%, rgba(207,255,248,calc(var(--op) * .72)) 58%, rgba(255,255,255,0));
        box-shadow:
          0 0 5px rgba(255,255,255,.12),
          0 0 9px rgba(174,255,245,.07);
        filter: blur(var(--blur));
        opacity: 0;
        transform: translate3d(-50%, -50%, 0) rotate(var(--rot)) scaleX(.48);
        animation: cawf-shore-yoonseul-flare var(--dur) ease-in-out infinite;
        animation-delay: var(--delay);
        will-change: transform, opacity;
      }

      #${IDS.ambient} .cawf-shore-low .cawf-shore-yoonseul {
        opacity: calc(var(--cawf-effect-opacity, 1) * .52);
        filter: saturate(1.0) brightness(1.02);
      }

      #${IDS.ambient} .cawf-shore-low .cawf-shore-yoonseul b:nth-child(2n) {
        display: none;
      }

      /* v0.9.10: 물막 대신 바다 면 자체가 아주 살짝 흔들리는 잔물결. 포말선 아래에서만 은은하게 보인다. */
      #${IDS.ambient} .cawf-shore-ripples {
        left: -9%;
        right: -9%;
        top: 8%;
        bottom: 5%;
        overflow: hidden;
        mix-blend-mode: screen;
        opacity: calc(var(--cawf-effect-opacity, 1) * .38);
        filter: blur(1.15px) saturate(1.05);
        -webkit-mask-image: linear-gradient(180deg, transparent 0%, rgba(0,0,0,.28) 9%, #000 25%, #000 78%, rgba(0,0,0,.32) 92%, transparent 100%);
        mask-image: linear-gradient(180deg, transparent 0%, rgba(0,0,0,.28) 9%, #000 25%, #000 78%, rgba(0,0,0,.32) 92%, transparent 100%);
        animation: cawf-shore-ripple-drift calc(19s / var(--cawf-shore-speed-safe)) ease-in-out infinite;
      }

      #${IDS.ambient} .cawf-shore-ripples::before,
      #${IDS.ambient} .cawf-shore-ripples::after {
        content: '';
        position: absolute;
        inset: -10% -6%;
        pointer-events: none;
        background:
          radial-gradient(ellipse at 12% 20%, rgba(255,255,255,.00) 0 48%, rgba(238,255,252,.115) 50%, rgba(238,255,252,0) 54%),
          radial-gradient(ellipse at 34% 33%, rgba(255,255,255,.00) 0 47%, rgba(208,255,248,.090) 50%, rgba(208,255,248,0) 55%),
          radial-gradient(ellipse at 62% 25%, rgba(255,255,255,.00) 0 49%, rgba(255,255,255,.105) 51%, rgba(255,255,255,0) 55%),
          radial-gradient(ellipse at 82% 42%, rgba(255,255,255,.00) 0 46%, rgba(218,255,250,.080) 49%, rgba(218,255,250,0) 54%),
          radial-gradient(ellipse at 22% 62%, rgba(255,255,255,.00) 0 48%, rgba(255,255,255,.075) 51%, rgba(255,255,255,0) 56%),
          radial-gradient(ellipse at 70% 68%, rgba(255,255,255,.00) 0 47%, rgba(202,255,248,.070) 50%, rgba(202,255,248,0) 55%);
        background-size: 38% 24%, 42% 22%, 44% 26%, 40% 24%, 46% 22%, 44% 24%;
        background-repeat: no-repeat;
        opacity: .80;
        transform: translate3d(-1.4%, -6px, 0) scale(1.02);
        animation: cawf-shore-ripple-weave calc(14.5s / var(--cawf-shore-speed-safe)) ease-in-out infinite;
      }

      #${IDS.ambient} .cawf-shore-ripples::after {
        opacity: .48;
        filter: blur(1.9px);
        transform: translate3d(1.8%, 12px, 0) scale(1.04, .96);
        animation-duration: calc(23s / var(--cawf-shore-speed-safe));
        animation-direction: reverse;
      }

      #${IDS.ambient} .cawf-shore-low .cawf-shore-ripples {
        opacity: calc(var(--cawf-effect-opacity, 1) * .24);
        filter: blur(1.45px);
      }

      #${IDS.ambient} .cawf-shore-undulation {
        left: -11%;
        right: -11%;
        top: 10%;
        bottom: 2%;
        overflow: hidden;
        mix-blend-mode: screen;
        opacity: calc(var(--cawf-effect-opacity, 1) * .30);
        filter: blur(1.9px) saturate(1.02);
        -webkit-mask-image: linear-gradient(180deg, transparent 0%, rgba(0,0,0,.20) 8%, rgba(0,0,0,.82) 24%, #000 66%, rgba(0,0,0,.34) 88%, transparent 100%);
        mask-image: linear-gradient(180deg, transparent 0%, rgba(0,0,0,.20) 8%, rgba(0,0,0,.82) 24%, #000 66%, rgba(0,0,0,.34) 88%, transparent 100%);
        animation: cawf-shore-undulation-drift calc(17.5s / var(--cawf-shore-speed-safe)) ease-in-out infinite;
      }

      #${IDS.ambient} .cawf-shore-undulation::before,
      #${IDS.ambient} .cawf-shore-undulation::after {
        content: '';
        position: absolute;
        inset: -12% -8%;
        pointer-events: none;
        background:
          radial-gradient(ellipse at 8% 18%, rgba(255,255,255,0) 0 44%, rgba(235,255,252,.085) 47%, rgba(235,255,252,0) 55%),
          radial-gradient(ellipse at 26% 30%, rgba(255,255,255,0) 0 43%, rgba(196,255,248,.070) 47%, rgba(196,255,248,0) 56%),
          radial-gradient(ellipse at 48% 22%, rgba(255,255,255,0) 0 45%, rgba(255,255,255,.080) 48%, rgba(255,255,255,0) 56%),
          radial-gradient(ellipse at 70% 34%, rgba(255,255,255,0) 0 44%, rgba(210,255,250,.070) 48%, rgba(210,255,250,0) 57%),
          radial-gradient(ellipse at 90% 24%, rgba(255,255,255,0) 0 43%, rgba(255,255,255,.072) 47%, rgba(255,255,255,0) 55%);
        background-size: 46% 28%, 52% 30%, 48% 28%, 54% 32%, 46% 30%;
        background-repeat: no-repeat;
        transform: translate3d(-2.2%, -10px, 0) skewY(-1.2deg) scale(1.03, .98);
        opacity: .72;
        animation: cawf-shore-undulation-weave calc(13.2s / var(--cawf-shore-speed-safe)) ease-in-out infinite;
      }

      #${IDS.ambient} .cawf-shore-undulation::after {
        opacity: .46;
        filter: blur(2.8px);
        transform: translate3d(2.0%, 18px, 0) skewY(1.1deg) scale(1.05, .96);
        animation-duration: calc(21s / var(--cawf-shore-speed-safe));
        animation-direction: reverse;
      }

      #${IDS.ambient} .cawf-shore-low .cawf-shore-undulation {
        opacity: calc(var(--cawf-effect-opacity, 1) * .14);
        filter: blur(2.4px) saturate(1.0);
      }

      /* 모래사장: 맨 아래만. shore 마크업 내부라 shore일 때만 등장한다. */
      #${IDS.ambient} .cawf-shore-sand {
        left: -6%;
        right: -6%;
        bottom: -7%;
        height: 31%;
        background:
          linear-gradient(180deg, rgba(255,244,202,0) 0%, rgba(255,226,172,.15) 20%, rgba(224,174,112,.24) 54%, rgba(166,124,72,.19) 100%),
          radial-gradient(80% 36% at 46% 0%, rgba(255,255,255,.12), rgba(255,255,255,0) 72%);
        mix-blend-mode: soft-light;
        opacity: .82;
        filter: saturate(1.12) brightness(1.06);
      }

      #${IDS.ambient} .cawf-shore-sand::before {
        content: '';
        position: absolute;
        inset: 0;
        background:
          radial-gradient(circle at 8% 64%, rgba(255,255,255,.055) 0 1px, transparent 2.4px),
          radial-gradient(circle at 18% 42%, rgba(120,78,40,.040) 0 .9px, transparent 2.5px),
          radial-gradient(circle at 38% 72%, rgba(255,255,255,.044) 0 1px, transparent 2.6px),
          radial-gradient(circle at 66% 36%, rgba(120,78,40,.035) 0 .9px, transparent 2.5px),
          radial-gradient(circle at 86% 58%, rgba(255,255,255,.044) 0 1px, transparent 2.6px);
        background-size: 110px 74px, 124px 86px, 142px 92px, 118px 78px, 132px 88px;
        opacity: .62;
        filter: blur(.18px);
      }

      #${IDS.ambient} .cawf-shore-sand-specks,
      #${IDS.ambient} .cawf-shore-sand-specks b {
        position: absolute;
        pointer-events: none;
      }

      #${IDS.ambient} .cawf-shore-sand-specks { inset: 0; opacity: .82; }

      #${IDS.ambient} .cawf-shore-sand-specks b {
        left: var(--x);
        top: var(--y);
        width: var(--s);
        height: var(--s);
        border-radius: 999px;
        background: rgba(var(--sand-dot), var(--op));
        filter: blur(.18px);
      }

      /* v0.9.4: sand/wet overlays are disabled; shore now reads as water-only downwash. */
      #${IDS.ambient} .cawf-shore-sand,
      #${IDS.ambient} .cawf-shore-wet-sand,
      #${IDS.ambient} .cawf-shore-wet-trace {
        display: none !important;
      }

      /* 젖은 모래: 아래로 내려온 파도 도착 타이밍에 맞춰 확장된다. */
      #${IDS.ambient} .cawf-shore-wet-sand {
        left: -7%;
        right: -7%;
        bottom: -10%;
        height: 48%;
        border-radius: 50% 50% 0 0 / 36% 36% 0 0;
        background:
          linear-gradient(180deg, rgba(145,235,224,0) 0%, rgba(116,218,212,.16) 28%, rgba(230,194,132,.24) 62%, rgba(190,138,76,.20) 100%),
          radial-gradient(75% 34% at 50% 0%, rgba(255,255,255,.18), rgba(255,255,255,0) 70%);
        mix-blend-mode: soft-light;
        opacity: .14;
        filter: saturate(1.32) brightness(1.04) blur(2.1px);
        transform-origin: 50% 100%;
        animation: cawf-shore-wet-sand calc(10.5s / var(--cawf-shore-speed-safe)) ease-in-out infinite;
        will-change: transform, opacity;
      }

      #${IDS.ambient} .cawf-shore-wet-trace {
        left: -4%;
        right: -4%;
        bottom: 10%;
        height: 20%;
        background: radial-gradient(80% 34% at 50% 100%, rgba(220,255,248,.18), rgba(220,255,248,.08) 44%, rgba(255,255,255,0) 76%);
        mix-blend-mode: screen;
        opacity: .10;
        filter: blur(5.2px);
        transform-origin: 50% 100%;
        animation: cawf-shore-wet-trace calc(10.5s / var(--cawf-shore-speed-safe)) ease-in-out infinite;
        will-change: transform, opacity;
      }

      #${IDS.ambient} .cawf-shore-wash {
        left: -8%;
        width: 116%;
        top: 8%;
        /* v0.9.5: 파도는 위→아래로 내려오므로 흰 wash도 진행 방향의 뒤쪽(위쪽)에 남긴다. */
        border-radius: 0 0 50% 50% / 0 0 44% 44%;
        background:
          radial-gradient(92% 42% at 50% 0%, rgba(255,255,255,.14), rgba(210,255,249,.075) 48%, rgba(210,255,249,0) 74%),
          radial-gradient(40% 22% at 28% 34%, rgba(255,255,255,.08), rgba(255,255,255,0) 72%),
          radial-gradient(42% 24% at 74% 28%, rgba(255,255,255,.065), rgba(255,255,255,0) 74%);
        filter: blur(7.2px);
        mix-blend-mode: screen;
        opacity: .22;
        transform-origin: 50% 100%;
        will-change: transform, opacity;
      }

      #${IDS.ambient} .cawf-shore-wash-main {
        top: 4%;
        height: 72%;
        animation: cawf-shore-wash-main calc(10.5s / var(--cawf-shore-speed-safe)) ease-in-out infinite;
      }

      #${IDS.ambient} .cawf-shore-wash-front {
        top: 8%;
        height: 90%;
        opacity: .28;
        filter: blur(10.8px);
        animation: cawf-shore-wash-front calc(10.5s / var(--cawf-shore-speed-safe)) ease-in-out infinite;
      }


      #${IDS.ambient} .cawf-shore-foam {
        left: -10%;
        width: 120%;
        overflow: visible;
        filter: blur(.18px) drop-shadow(0 2px 8px rgba(255,255,255,.11));
        mix-blend-mode: screen;
        transform-origin: 50% 100%;
        will-change: transform, opacity;
      }
      /* foam은 중앙 바다 시작선 부근에 놓고, transform으로 아래쪽 모래까지 이동시킨다. */

      #${IDS.ambient} .cawf-shore-foam-back {
        top: 1%;
        height: 58%;
        opacity: .22;
        filter: blur(.72px) drop-shadow(0 2px 9px rgba(255,255,255,.09));
        animation: cawf-shore-foam-back calc(10.5s / var(--cawf-shore-speed-safe)) ease-in-out infinite;
      }

      #${IDS.ambient} .cawf-shore-foam-main {
        top: 3%;
        height: 72%;
        opacity: .70;
        animation: cawf-shore-foam-main calc(10.5s / var(--cawf-shore-speed-safe)) ease-in-out infinite;
      }

      #${IDS.ambient} .cawf-shore-foam-front {
        top: 5%;
        height: 88%;
        opacity: .62;
        filter: blur(.24px) drop-shadow(0 2px 7px rgba(255,255,255,.12));
        animation: cawf-shore-foam-front calc(10.5s / var(--cawf-shore-speed-safe)) ease-in-out infinite;
      }

      #${IDS.ambient} .cawf-shore-foam-fill {
        fill: rgba(225,255,252,.08);
        stroke: none;
      }

      #${IDS.ambient} .cawf-shore-foam-main .cawf-shore-foam-fill,
      #${IDS.ambient} .cawf-shore-foam-front .cawf-shore-foam-fill {
        fill: rgba(225,255,252,.105);
      }

      #${IDS.ambient} .cawf-shore-foam-rim {
        fill: none;
        stroke: rgba(255,255,255,.82);
        stroke-width: 3.0;
        stroke-linecap: round;
        stroke-linejoin: round;
        vector-effect: non-scaling-stroke;
      }

      #${IDS.ambient} .cawf-shore-foam-back .cawf-shore-foam-rim {
        stroke-width: 2.1;
        stroke: rgba(246,255,254,.58);
      }

      #${IDS.ambient} .cawf-shore-foam-main .cawf-shore-foam-rim {
        stroke-width: 3.2;
        stroke: rgba(255,255,255,.92);
      }

      #${IDS.ambient} .cawf-shore-foam-front .cawf-shore-foam-rim {
        stroke-width: 3.6;
        stroke: rgba(255,255,255,.88);
      }

      #${IDS.ambient} .cawf-shore-foam-lace {
        fill: none;
        stroke: rgba(255,255,255,.66);
        stroke-width: 1.7;
        stroke-linecap: round;
        stroke-dasharray: 11 9 3 17 7 13 31 19 5 27;
        stroke-linejoin: round;
        vector-effect: non-scaling-stroke;
        animation: cawf-shore-lace-flow calc(5.8s / var(--cawf-shore-speed-safe)) linear infinite;
      }

      #${IDS.ambient} .cawf-shore-foam-back .cawf-shore-foam-lace {
        stroke-width: 1.1;
        stroke: rgba(255,255,255,.42);
      }

      #${IDS.ambient} .cawf-shore-foam-soft {
        fill: none;
        stroke: rgba(255,255,255,.12);
        stroke-width: 25;
        stroke-linecap: round;
        stroke-linejoin: round;
        vector-effect: non-scaling-stroke;
      }

      #${IDS.ambient} .cawf-shore-foam-back .cawf-shore-foam-soft {
        stroke: rgba(235,255,252,.095);
        stroke-width: 21;
      }

      #${IDS.ambient} .cawf-shore-foam-main .cawf-shore-foam-soft,
      #${IDS.ambient} .cawf-shore-foam-front .cawf-shore-foam-soft {
        stroke: rgba(235,255,252,.13);
        stroke-width: 31;
      }

      #${IDS.ambient} .cawf-shore-flecks {
        left: -8%;
        right: -8%;
        bottom: -2%;
        height: 108%;
        overflow: visible;
        mix-blend-mode: screen;
        filter: blur(.06px);
      }

      #${IDS.ambient} .cawf-shore-flecks i {
        position: absolute;
        left: var(--x);
        bottom: var(--y);
        width: var(--w);
        height: var(--h);
        border-radius: 999px;
        background: rgba(255,255,255,var(--foam-alpha, .82));
        box-shadow: 0 0 4px rgba(255,255,255,.15), 0 0 9px rgba(170,255,245,.08);
        opacity: 0;
        transform-origin: 50% 50%;
        filter: blur(var(--blur, 0px));
        animation: cawf-shore-fleck var(--dur) ease-in-out infinite;
        animation-delay: var(--delay);
        will-change: transform, opacity;
      }

      #${IDS.ambient} .cawf-shore-fleck-far { box-shadow: 0 0 3px rgba(255,255,255,.09); }
      #${IDS.ambient} .cawf-shore-fleck-near { box-shadow: 0 0 5px rgba(255,255,255,.17), 0 0 10px rgba(170,255,245,.10); }

      #${IDS.ambient} .cawf-shore-low .cawf-shore-sand::before,
      #${IDS.ambient} .cawf-shore-low .cawf-shore-depth-haze { opacity: .38; filter: blur(.65px); }


      #${IDS.ambient} .cawf-shore-low .cawf-shore-sea,
      #${IDS.ambient} .cawf-shore-low .cawf-shore-wet-sand { filter: saturate(1.08) brightness(1.03) blur(.55px); }

      @keyframes cawf-shore-sea-breathe {
        0%, 100% { opacity: .70; transform: translate3d(-.8%, 0, 0) scale(1.018, .98); }
        42% { opacity: .88; transform: translate3d(.6%, 8px, 0) scale(1.035, 1.02); }
        76% { opacity: .78; transform: translate3d(1.0%, 3px, 0) scale(1.024, 1.00); }
      }

      @keyframes cawf-shore-haze {
        0%, 100% { opacity: .22; transform: translate3d(-1.2%, 0, 0) scale(1.01, .96); }
        42% { opacity: .38; transform: translate3d(.5%, 8px, 0) scale(1.02, 1.00); }
        74% { opacity: .28; transform: translate3d(1.0%, 16px, 0) scale(1.015, .98); }
      }

      @keyframes cawf-shore-soft-bloom {
        0%, 100% { opacity: .22; transform: translate3d(-2.4%, -6px, 0) scale(1.02); }
        42% { opacity: .44; transform: translate3d(.8%, 10px, 0) scale(1.052); }
        72% { opacity: .30; transform: translate3d(2.2%, 18px, 0) scale(1.028); }
      }

      @keyframes cawf-shore-glints {
        0%, 100% { opacity: .22; transform: translate3d(-1.6%, -8px, 0) scale(1.01); }
        46% { opacity: .52; transform: translate3d(.8%, 18px, 0) scale(1.045); }
        78% { opacity: .30; transform: translate3d(1.6%, 28px, 0) scale(1.018); }
      }


      @keyframes cawf-shore-yoonseul-drift {
        0%, 100% { opacity: .60; transform: translate3d(-.8%, -4px, 0) scale(1.008); }
        44% { opacity: .92; transform: translate3d(.7%, 14px, 0) scale(1.026); }
        76% { opacity: .70; transform: translate3d(1.2%, 24px, 0) scale(1.014); }
      }

      @keyframes cawf-shore-yoonseul-flare {
        0%, 100% { opacity: 0; transform: translate3d(-50%, -50%, 0) rotate(var(--rot)) scaleX(.35) scaleY(.72); }
        18% { opacity: calc(var(--op) * .36); transform: translate3d(calc(-50% + var(--dx) * .22), calc(-50% + var(--dy) * .12), 0) rotate(var(--rot)) scaleX(.70) scaleY(.82); }
        44% { opacity: var(--op); transform: translate3d(calc(-50% + var(--dx) * .62), calc(-50% + var(--dy) * .48), 0) rotate(var(--rot)) scaleX(1.28) scaleY(1); }
        68% { opacity: calc(var(--op) * .42); transform: translate3d(calc(-50% + var(--dx)), calc(-50% + var(--dy)), 0) rotate(var(--rot)) scaleX(.86) scaleY(.78); }
      }

      @keyframes cawf-shore-ripple-drift {
        0%, 100% { opacity: .26; transform: translate3d(-.8%, -5px, 0) scale(1.006, .992); }
        42% { opacity: .44; transform: translate3d(.7%, 12px, 0) scale(1.022, 1.012); }
        76% { opacity: .32; transform: translate3d(1.2%, 22px, 0) scale(1.012, 1.004); }
      }

      @keyframes cawf-shore-ripple-weave {
        0%, 100% { opacity: .58; transform: translate3d(-1.4%, -6px, 0) scale(1.02, .98); }
        40% { opacity: .86; transform: translate3d(.8%, 11px, 0) scale(1.055, 1.018); }
        72% { opacity: .66; transform: translate3d(2.2%, 20px, 0) scale(1.032, 1.004); }
      }

      @keyframes cawf-shore-undulation-drift {
        0%, 100% { opacity: .22; transform: translate3d(-.9%, -8px, 0) scale(1.008, .992); }
        44% { opacity: .36; transform: translate3d(.6%, 14px, 0) scale(1.024, 1.012); }
        76% { opacity: .27; transform: translate3d(1.1%, 25px, 0) scale(1.014, 1.004); }
      }

      @keyframes cawf-shore-undulation-weave {
        0%, 100% { opacity: .52; transform: translate3d(-2.2%, -10px, 0) skewY(-1.2deg) scale(1.03, .98); }
        38% { opacity: .80; transform: translate3d(.8%, 10px, 0) skewY(.7deg) scale(1.07, 1.018); }
        70% { opacity: .60; transform: translate3d(2.8%, 24px, 0) skewY(1.2deg) scale(1.04, 1.004); }
      }


      @keyframes cawf-shore-wet-sand {
        0%, 100% { opacity: .05; transform: translate3d(-.6%, 42px, 0) scale(1.03, .34); }
        54% { opacity: .12; transform: translate3d(-.2%, 22px, 0) scale(1.04, .55); }
        70% { opacity: .54; transform: translate3d(.6%, -12px, 0) scale(1.07, 1.08); }
        84% { opacity: .24; transform: translate3d(.1%, 8px, 0) scale(1.04, .72); }
        96% { opacity: .07; transform: translate3d(-.4%, 34px, 0) scale(1.025, .44); }
      }

      @keyframes cawf-shore-wet-trace {
        0%, 100% { opacity: .03; transform: translate3d(-.5%, 34px, 0) scale(1.02, .36); }
        60% { opacity: .07; transform: translate3d(.1%, 12px, 0) scale(1.03, .68); }
        74% { opacity: .20; transform: translate3d(.6%, -8px, 0) scale(1.04, 1.02); }
        88% { opacity: .11; transform: translate3d(.8%, 10px, 0) scale(1.03, .76); }
        96% { opacity: .04; transform: translate3d(-.4%, 28px, 0) scale(1.02, .48); }
      }

      @keyframes cawf-shore-wash-main {
        0%, 100% { opacity: .00; transform: translate3d(-1.0%, -96px, 0) scale(1.05, .34); }
        18% { opacity: .07; transform: translate3d(-.4%, -42px, 0) scale(1.058, .52); }
        38% { opacity: .28; transform: translate3d(.2%, 30px, 0) scale(1.070, .92); }
        58% { opacity: .26; transform: translate3d(.8%, 110px, 0) scale(1.060, 1.12); }
        82% { opacity: .055; transform: translate3d(-.6%, 206px, 0) scale(1.035, .56); }
      }

      @keyframes cawf-shore-wash-front {
        0%, 100% { opacity: .00; transform: translate3d(1.0%, -132px, 0) scale(1.08, .28); }
        34% { opacity: .06; transform: translate3d(.6%, -40px, 0) scale(1.09, .46); }
        56% { opacity: .20; transform: translate3d(-.4%, 72px, 0) scale(1.08, 1.02); }
        76% { opacity: .10; transform: translate3d(-1.0%, 178px, 0) scale(1.06, .68); }
        94% { opacity: .018; transform: translate3d(.6%, 252px, 0) scale(1.08, .36); }
      }

      @keyframes cawf-shore-foam-back {
        0%, 100% { opacity: .00; transform: translate3d(-.8%, -76px, 0) scale(1.03, .38); }
        16% { opacity: .08; transform: translate3d(-.2%, -32px, 0) scale(1.035, .54); }
        36% { opacity: .24; transform: translate3d(.6%, 38px, 0) scale(1.04, .96); }
        58% { opacity: .12; transform: translate3d(1.0%, 112px, 0) scale(1.03, .72); }
        80% { opacity: .03; transform: translate3d(-.7%, 184px, 0) scale(1.02, .50); }
      }

      @keyframes cawf-shore-foam-main {
        0%, 100% { opacity: .00; transform: translate3d(-1.3%, -118px, 0) scale(1.055, .34) rotate(-.08deg); }
        16% { opacity: .08; transform: translate3d(-.8%, -68px, 0) scale(1.060, .50) rotate(-.04deg); }
        38% { opacity: .48; transform: translate3d(-.2%, 20px, 0) scale(1.070, .98) rotate(.06deg); }
        58% { opacity: .76; transform: translate3d(.6%, 112px, 0) scale(1.060, 1.14) rotate(.08deg); }
        78% { opacity: .22; transform: translate3d(.2%, 198px, 0) scale(1.045, .74) rotate(-.04deg); }
        94% { opacity: .04; transform: translate3d(-.5%, 260px, 0) scale(1.025, .50) rotate(.06deg); }
      }

      @keyframes cawf-shore-foam-front {
        0%, 100% { opacity: .00; transform: translate3d(1.2%, -152px, 0) scale(1.06, .30); }
        28% { opacity: .06; transform: translate3d(.8%, -72px, 0) scale(1.07, .46); }
        50% { opacity: .46; transform: translate3d(.2%, 44px, 0) scale(1.07, 1.00); }
        70% { opacity: .42; transform: translate3d(-.6%, 152px, 0) scale(1.05, .86); }
        88% { opacity: .10; transform: translate3d(-.8%, 242px, 0) scale(1.035, .58); }
        98% { opacity: .02; transform: translate3d(1.0%, 300px, 0) scale(1.02, .42); }
      }

      @keyframes cawf-shore-lace-flow {
        0% { stroke-dashoffset: 0; opacity: .36; }
        50% { opacity: .80; }
        100% { stroke-dashoffset: -133; opacity: .36; }
      }

      @keyframes cawf-shore-fleck {
        0% { opacity: 0; transform: translate3d(0, -42px, 0) scale(.20) rotate(0deg); }
        18% { opacity: var(--op); transform: translate3d(var(--dx), -12px, 0) scale(1) rotate(var(--rot)); }
        54% { opacity: var(--op2); transform: translate3d(var(--dx2), 22px, 0) scale(.62) rotate(var(--rot2)); }
        100% { opacity: 0; transform: translate3d(var(--dx3), var(--dy3), 0) scale(.14) rotate(var(--rot)); }
      }

      /* ── 오로라: True Yukon Aurora(CodePen)식 세로 ray 구조를 확프용으로 경량 이식 ── */
      #${IDS.root}[data-effect="aurora"] #${IDS.ambient} {
        opacity: calc(var(--cawf-effect-opacity, 1) * .72);
        background:
          radial-gradient(100% 42% at 50% -6%, rgba(56,255,207,.17), rgba(56,255,207,0) 66%),
          radial-gradient(76% 34% at 70% 4%, rgba(160,116,255,.10), rgba(160,116,255,0) 72%),
          linear-gradient(180deg, rgba(2,10,30,.11), rgba(2,10,30,0) 62%);
        mix-blend-mode: screen;
        overflow: hidden;
        -webkit-mask-image: linear-gradient(180deg, #000 0%, #000 12%, rgba(0,0,0,.94) 34%, rgba(0,0,0,.50) 58%, transparent 74%);
        mask-image: linear-gradient(180deg, #000 0%, #000 12%, rgba(0,0,0,.94) 34%, rgba(0,0,0,.50) 58%, transparent 74%);
      }

      #${IDS.root}[data-effect="aurora"] #${IDS.ambient}::before,
      #${IDS.root}[data-effect="aurora"] #${IDS.ambient}::after {
        content: '';
        position: absolute;
        pointer-events: none;
        mix-blend-mode: screen;
      }

      #${IDS.root}[data-effect="aurora"] #${IDS.ambient}::before {
        left: -14%;
        right: -14%;
        top: -6%;
        height: 28%;
        border-radius: 50%;
        background:
          linear-gradient(90deg,
            rgba(32,255,181,.20),
            rgba(104,248,255,.36),
            rgba(178,135,255,.21),
            rgba(52,255,197,.18));
        filter: blur(12px);
        opacity: .64;
        animation: cawf-aurora-light-field calc(34s / var(--cawf-effect-speed-safe)) ease-in-out infinite alternate;
      }

      #${IDS.root}[data-effect="aurora"] #${IDS.ambient}::after {
        inset: -4% -14% 42% -14%;
        background:
          linear-gradient(92deg,
            rgba(95,255,181,0) 0%,
            rgba(95,255,181,.11) 14%,
            rgba(90,245,255,.21) 34%,
            rgba(165,122,255,.15) 54%,
            rgba(93,255,188,.11) 76%,
            rgba(95,255,181,0) 100%),
          linear-gradient(108deg,
            rgba(68,255,210,0) 0%,
            rgba(68,255,210,.07) 28%,
            rgba(196,150,255,.10) 52%,
            rgba(68,255,210,.06) 78%,
            rgba(68,255,210,0) 100%);
        filter: blur(22px);
        opacity: .68;
        animation: cawf-aurora-curtain calc(30s / var(--cawf-effect-speed-safe)) ease-in-out infinite alternate-reverse;
      }

      #${IDS.root}[data-effect="aurora"] #${IDS.ambient} .cawf-aurora-ray {
        position: absolute;
        left: var(--x, 50%);
        top: var(--top, -18%);
        width: var(--w, 16px);
        height: var(--h, 36%);
        border-radius: 999px;
        background: linear-gradient(180deg, var(--c1, rgba(114,255,204,.82)), var(--c2, rgba(104,248,255,.28)) 44%, rgba(0,0,0,0) 100%);
        filter: blur(var(--blur, 10px));
        opacity: 0;
        transform-origin: 50% 0%;
        mix-blend-mode: screen;
        will-change: transform, opacity;
        animation:
          cawf-aurora-ray-fade var(--dur, 14s) ease-in-out infinite alternate,
          cawf-aurora-ray-wiggle var(--wiggle-dur, 26s) ease-in-out infinite alternate;
        animation-delay: var(--delay, 0s), var(--wiggle-delay, 0s);
      }

      /* 밤 + 오로라 동시 사용 시 합성 부하를 낮추기 위한 조율 */
      #${IDS.root}[data-time-effect="night"][data-effect="aurora"] #${IDS.nightSky} .cawf-cp-meteor-9,
      #${IDS.root}[data-time-effect="night"][data-effect="aurora"] #${IDS.nightSky} .cawf-cp-meteor-10,
      #${IDS.root}[data-time-effect="night"][data-effect="aurora"] #${IDS.nightSky} .cawf-cp-meteor-11,
      #${IDS.root}[data-time-effect="night"][data-effect="aurora"] #${IDS.nightSky} .cawf-cp-meteor-12 {
        display: none;
      }

      #${IDS.root}[data-time-effect="night"][data-effect="aurora"] #${IDS.nightSky} .cawf-cp-meteor {
        animation-duration: calc(28s / var(--cawf-time-speed-safe));
        filter: drop-shadow(0 0 4px rgba(255,255,255,.30));
      }

      #${IDS.root}[data-time-effect="night"][data-effect="aurora"] #${IDS.nightSky} .cawf-cp-moon {
        animation-duration: calc(76s / var(--cawf-time-speed-safe));
      }


      #${IDS.ambient} .cawf-raw-canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        display: block;
        pointer-events: none;
      }

      #${IDS.root}[data-effect="mana"] #${IDS.ambient} .cawf-raw-canvas {
        mix-blend-mode: screen;
        opacity: calc(var(--cawf-effect-opacity, 1) * .92);
      }

      #${IDS.root}[data-effect="bokeh"] #${IDS.ambient} .cawf-raw-canvas {
        mix-blend-mode: screen;
        opacity: var(--cawf-effect-opacity, 1);
      }

      /* ── 마법 시전: 청람 SVG 룬 대마법진 + 미세광 수렴 + 해방 파동 ── */
      #${IDS.root}[data-effect="spellcast"] #${IDS.ambient} {
        opacity: var(--cawf-effect-opacity, 1);
        background:
          radial-gradient(ellipse at 50% 65%, rgba(72,126,255,.075) 0%, rgba(54,98,220,.028) 27%, transparent 58%),
          radial-gradient(circle at 50% 64%, rgba(139,220,255,.038), transparent 32%);
        mix-blend-mode: screen;
      }

      #${IDS.ambient} .cawf-spellcast {
        --spell-main: #7ed3ff;
        --spell-soft: rgba(139,220,255,.82);
        --spell-deep: rgba(112,133,255,.84);
        --spell-white: rgba(218,248,255,.96);
        position: absolute;
        inset: 0;
        overflow: hidden;
        color: var(--spell-main);
        pointer-events: none;
        isolation: isolate;
      }

      #${IDS.ambient} .cawf-spellcast::before,
      #${IDS.ambient} .cawf-spellcast::after {
        content: '';
        position: absolute;
        left: 50%;
        top: 64%;
        pointer-events: none;
        transform: translate(-50%, -50%);
        border-radius: 50%;
      }

      #${IDS.ambient} .cawf-spellcast::before {
        width: min(80vmin, 646px);
        height: min(38vmin, 304px);
        background: radial-gradient(ellipse, rgba(180,239,255,.15), rgba(89,146,255,.052) 37%, transparent 72%);
        filter: blur(9px);
        animation: cawf-spell-bloom calc(9.8s / var(--cawf-effect-speed, 1)) ease-in-out infinite;
      }

      #${IDS.ambient} .cawf-spellcast::after {
        width: min(24.7vmin, 190px);
        height: min(12.35vmin, 95px);
        background: radial-gradient(ellipse, rgba(238,253,255,.70), rgba(126,211,255,.21) 22%, rgba(112,133,255,.075) 48%, transparent 72%);
        filter: blur(4px);
        animation: cawf-spell-core-flash calc(9.8s / var(--cawf-effect-speed, 1)) ease-out infinite;
      }

      #${IDS.ambient} .cawf-spell-plane {
        position: absolute;
        left: 50%;
        top: 64%;
        width: 500px;
        height: 500px;
        transform: translate(-50%, -50%) perspective(900px) rotateX(64deg) rotateY(-8deg) rotateZ(-11deg) scale(var(--spell-scale, .72));
        transform-style: preserve-3d;
        filter: drop-shadow(0 0 6px rgba(126,211,255,.32)) drop-shadow(0 0 30px rgba(112,133,255,.19));
        animation: cawf-spell-cycle calc(9.8s / var(--cawf-effect-speed, 1)) linear infinite;
      }

      #${IDS.ambient} .cawf-spell-circle {
        position: absolute;
        inset: 0;
        transform-origin: 50% 50%;
        animation: cawf-spell-rotation calc(64s / var(--cawf-effect-speed, 1)) linear infinite;
      }

      #${IDS.ambient} .cawf-spell-center {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
      }

      #${IDS.ambient} .cawf-spell-star,
      #${IDS.ambient} .cawf-spell-star::after {
        width: 74px;
        height: 74px;
        border: 1px solid currentColor;
      }

      #${IDS.ambient} .cawf-spell-star { transform: translate(-50%, -50%) rotate(45deg); }
      #${IDS.ambient} .cawf-spell-star::after { content: ''; position: absolute; inset: -1px; transform: rotate(45deg); }

      #${IDS.ambient} .cawf-spell-core {
        width: 30px;
        height: 30px;
        border: 1px solid var(--spell-white);
        transform: translate(-50%, -50%) rotate(22.5deg);
        box-shadow: inset 0 0 12px rgba(126,211,255,.24), 0 0 14px rgba(126,211,255,.44);
      }

      #${IDS.ambient} .cawf-spell-core::after {
        content: '';
        position: absolute;
        inset: 5px;
        border: 1px solid currentColor;
        transform: rotate(45deg);
      }

      #${IDS.ambient} .cawf-spell-square,
      #${IDS.ambient} .cawf-spell-square::after {
        width: 64px;
        height: 64px;
        border: .7px solid currentColor;
      }

      #${IDS.ambient} .cawf-spell-square::after { content: ''; position: absolute; inset: -1px; transform: rotate(45deg); }

      #${IDS.ambient} .cawf-spell-rune-ring { width: 120px; height: 120px; }
      #${IDS.ambient} .cawf-spell-rune-ring-large {
        width: 350px;
        height: 350px;
        color: var(--spell-soft);
        opacity: .90;
        animation: cawf-spell-counter calc(76s / var(--cawf-effect-speed, 1)) linear infinite;
      }

      #${IDS.ambient} .cawf-spell-rune-ring svg { width: 100%; height: 100%; overflow: visible; }
      #${IDS.ambient} .cawf-spell-runes { fill: none; stroke: currentColor; stroke-width: .58; stroke-linecap: round; stroke-linejoin: round; }
      #${IDS.ambient} .cawf-spell-rune-ring-large .cawf-spell-runes { stroke-width: .38; }

      #${IDS.ambient} .cawf-spell-double {
        width: 146px;
        height: 146px;
        border: 1px solid currentColor;
        border-radius: 50%;
      }

      #${IDS.ambient} .cawf-spell-double::before { content: ''; position: absolute; inset: -12px; border: 1px solid var(--spell-deep); border-radius: 50%; }

      #${IDS.ambient} .cawf-spell-stripes {
        width: 240px;
        height: 240px;
        overflow: hidden;
        border: 3px solid var(--spell-soft);
        border-radius: 50%;
        opacity: .28;
        background: repeating-linear-gradient(45deg, transparent 0 4px, var(--spell-main) 4px 5px);
      }

      #${IDS.ambient} .cawf-spell-stripes::after {
        content: '';
        position: absolute;
        inset: 27px;
        border: 1px solid rgba(8,16,42,.84);
        border-radius: 50%;
        background: rgba(5,10,30,.34);
      }

      #${IDS.ambient} .cawf-spell-quarter { position: absolute; inset: 0; color: var(--spell-deep); }
      #${IDS.ambient} .cawf-spell-quarter span { position: absolute; left: 50%; top: 50%; width: 48px; height: 48px; border: .6px solid currentColor; }
      #${IDS.ambient} .cawf-spell-quarter span::after { content: ''; position: absolute; inset: -1px; border: .6px solid currentColor; transform: rotate(45deg); }
      #${IDS.ambient} .cawf-spell-quarter span:nth-child(1) { transform: translate(-154px,-132px); }
      #${IDS.ambient} .cawf-spell-quarter span:nth-child(2) { transform: translate(106px,-132px); }
      #${IDS.ambient} .cawf-spell-quarter span:nth-child(3) { transform: translate(-154px,84px); }
      #${IDS.ambient} .cawf-spell-quarter span:nth-child(4) { transform: translate(106px,84px); }

      #${IDS.ambient} .cawf-spell-cross,
      #${IDS.ambient} .cawf-spell-cross::before { width: 240px; height: .7px; background: var(--spell-soft); }
      #${IDS.ambient} .cawf-spell-cross { transform: translate(-50%, -50%) rotate(45deg); opacity: .70; }
      #${IDS.ambient} .cawf-spell-cross::before { content: ''; position: absolute; transform: rotate(90deg); }

      #${IDS.ambient} .cawf-spell-rect,
      #${IDS.ambient} .cawf-spell-rect::after { width: 290px; height: 140px; border: .7px solid var(--spell-deep); }
      #${IDS.ambient} .cawf-spell-rect::after { content: ''; position: absolute; inset: -1px; transform: rotate(90deg); }

      #${IDS.ambient} .cawf-spell-middle { width: 144px; height: 144px; border: 1px dashed var(--spell-soft); border-radius: 50%; }
      #${IDS.ambient} .cawf-spell-middle::before,
      #${IDS.ambient} .cawf-spell-middle::after { content: ''; position: absolute; left: 50%; top: 50%; width: 400px; height: .55px; background: var(--spell-deep); opacity: .54; }
      #${IDS.ambient} .cawf-spell-middle::before { transform: translate(-50%, -50%); }
      #${IDS.ambient} .cawf-spell-middle::after { transform: translate(-50%, -50%) rotate(90deg); }

      #${IDS.ambient} .cawf-spell-big-star,
      #${IDS.ambient} .cawf-spell-big-star::after { width: 320px; height: 320px; border: 1px dotted var(--spell-soft); }
      #${IDS.ambient} .cawf-spell-big-star { transform: translate(-50%, -50%) rotate(22.5deg); opacity: .72; }
      #${IDS.ambient} .cawf-spell-big-star::after { content: ''; position: absolute; inset: -1px; transform: rotate(45deg); }

      #${IDS.ambient} .cawf-spell-outer { width: 400px; height: 400px; border: 1px solid var(--spell-main); border-radius: 50%; }
      #${IDS.ambient} .cawf-spell-outer::before { content: ''; position: absolute; inset: -50px; border: 1px solid var(--spell-deep); border-radius: 50%; }

      #${IDS.ambient} .cawf-spell-release {
        position: absolute;
        left: 50%;
        top: 64%;
        width: min(66.5vmin, 522px);
        height: min(30.4vmin, 236px);
        border: 1px solid rgba(183,239,255,.72);
        border-radius: 50%;
        box-shadow: 0 0 15px rgba(126,211,255,.28), inset 0 0 12px rgba(112,133,255,.12);
        animation: cawf-spell-release calc(9.8s / var(--cawf-effect-speed, 1)) ease-out infinite;
      }

      #${IDS.ambient} .cawf-spell-motes { position: absolute; inset: 0; overflow: hidden; }
      #${IDS.ambient} .cawf-spell-motes > i {
        position: absolute;
        left: 50%;
        top: 64%;
        width: var(--mote-size, .7px);
        height: var(--mote-size, .7px);
        border-radius: 50%;
        background: rgba(var(--mote-rgb, 126,211,255), .96);
        box-shadow:
          0 0 9.5px rgba(var(--mote-rgb, 126,211,255), .72),
          0 0 21px rgba(var(--mote-rgb, 126,211,255), .22);
        opacity: 0;
        will-change: transform, opacity;
        animation: cawf-spell-mote calc(9.8s / var(--cawf-effect-speed, 1)) linear infinite;
      }

      #${IDS.ambient} .cawf-spell-motes > i[data-glow="true"] {
        box-shadow:
          0 0 13.5px rgba(var(--mote-rgb, 126,211,255), .92),
          0 0 34px rgba(var(--mote-rgb, 126,211,255), .42);
      }

      /* 음원 타이머가 아니라 비주얼과 같은 CSS 시계를 사용한다.
       * -25% 지연으로 첫 iteration 경계가 실제 광점 해방 시점(75%)에 도착한다. */
      #${IDS.ambient} .cawf-spell-sound-cue {
        position: absolute;
        width: 1px;
        height: 1px;
        left: 50%;
        top: 64%;
        opacity: 0;
        pointer-events: none;
        animation: cawf-spell-sound-clock calc(9.8s / var(--cawf-effect-speed, 1)) linear calc(-2.45s / var(--cawf-effect-speed, 1)) infinite;
      }

      @keyframes cawf-spell-rotation { to { transform: rotate(360deg); } }
      @keyframes cawf-spell-counter { to { transform: translate(-50%, -50%) rotate(-360deg); } }
      @keyframes cawf-spell-sound-clock { from { transform: translateZ(0); } to { transform: translateZ(0); } }

      @keyframes cawf-spell-cycle {
        0%, 8% { opacity: 0; filter: blur(3px) drop-shadow(0 0 0 transparent); }
        18% { opacity: .30; }
        32%, 62% { opacity: .76; filter: blur(0) drop-shadow(0 0 6px rgba(126,211,255,.34)) drop-shadow(0 0 26px rgba(112,133,255,.19)); }
        68% { opacity: 1; filter: brightness(1.42) drop-shadow(0 0 9px rgba(218,248,255,.66)) drop-shadow(0 0 36px rgba(112,133,255,.33)); }
        75% { opacity: .10; filter: blur(1px) brightness(1.75); }
        86%, 100% { opacity: 0; }
      }

      @keyframes cawf-spell-bloom {
        0%, 10%, 88%, 100% { opacity: 0; transform: translate(-50%, -50%) scale(.72); }
        28%, 58% { opacity: .58; transform: translate(-50%, -50%) scale(1); }
        68% { opacity: .95; transform: translate(-50%, -50%) scale(.86); }
        78% { opacity: 0; transform: translate(-50%, -50%) scale(1.28); }
      }

      @keyframes cawf-spell-core-flash {
        0%, 56%, 84%, 100% { opacity: 0; transform: translate(-50%, -50%) scale(.30); }
        64% { opacity: .32; }
        68% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        77% { opacity: 0; transform: translate(-50%, -50%) scale(2.2); }
      }

      @keyframes cawf-spell-release {
        0%, 65% { opacity: 0; transform: translate(-50%, -50%) rotate(-11deg) scale(.04); }
        68% { opacity: .92; transform: translate(-50%, -50%) rotate(-11deg) scale(.08); }
        81% { opacity: 0; transform: translate(-50%, -50%) rotate(-11deg) scale(1.72); }
        100% { opacity: 0; transform: translate(-50%, -50%) rotate(-11deg) scale(1.72); }
      }

      @keyframes cawf-spell-mote {
        0%, 5% { opacity: 0; transform: translate3d(var(--sx), var(--sy), 0) scale(.18); animation-timing-function: ease-in-out; }
        10% { opacity: calc(var(--mote-alpha, .65) * .72); transform: translate3d(var(--sx), var(--sy), 0) scale(.42); animation-timing-function: ease-in-out; }
        18% { opacity: var(--mote-alpha, .65); transform: translate3d(var(--sx), var(--sy), 0) scale(.72); }
        51% { opacity: var(--mote-alpha, .65); transform: translate3d(var(--gx), var(--gy), 0) scale(.90); animation-timing-function: cubic-bezier(.42, 0, 1, 1); }
        65% { opacity: calc(var(--mote-alpha, .65) * 1.10); transform: translate3d(var(--c1x), var(--c1y), 0) scale(1.10); }
        70% { opacity: 1; transform: translate3d(var(--c2x), var(--c2y), 0) scale(1.42); }
        75% { opacity: .94; transform: translate3d(0, 0, 0) scale(1.24); animation-timing-function: ease-in-out; }
        84% { opacity: calc(var(--mote-alpha, .65) * .92); transform: translate3d(var(--rx), var(--ry), 0) scale(.68); animation-timing-function: ease-in-out; }
        94%, 100% { opacity: 0; transform: translate3d(var(--rx), var(--ry), 0) scale(.10); }
      }

      /* ===== Particles (비 legacy / 눈 / 벚꽃 / 낙엽) ===== */
      #${IDS.particles} {
        position: absolute;
        inset: 0;
        overflow: hidden;
        pointer-events: none;
      }

      /* 개별 눈송이의 좌우 흔들림 위에, 무리 전체가 약 27초마다 천천히 풍향을 바꾸는 공통 바람을 더한다. */
      #${IDS.root}[data-effect="snow"] #${IDS.particles} {
        overflow: visible;
        animation: cawf-snow-shared-gust 54s ease-in-out infinite;
        will-change: transform;
      }

      #${IDS.root} .cawf-particle {
        position: absolute;
        left: var(--x, 50vw);
        top: var(--y, -16vh);
        pointer-events: none;
        will-change: transform, opacity;
        animation-delay: var(--delay, 0s);
        animation-duration: var(--dur, 9s);
        animation-timing-function: linear;
        animation-iteration-count: infinite;
      }

      /* ── 비: 위에서 아래로 곧게 떨어지는 얇은 빗줄기 (활성 비는 canvas가 담당) ── */
      #${IDS.root}[data-effect="rain"] .cawf-particle {
        width: var(--w, .7px);
        height: var(--len, 15vh);
        border-radius: 999px;
        background: linear-gradient(
          180deg,
          rgba(214,230,255,0) 0%,
          rgba(214,230,255,.06) 18%,
          rgba(224,238,255,.38) 72%,
          rgba(244,250,255,.66) 96%,
          rgba(244,250,255,.12) 100%
        );
        filter: drop-shadow(0 0 2px rgba(190,215,255,.12)) blur(var(--blur, 0px));
        opacity: var(--a, .34);
        animation-name: cawf-rain-fall;
      }

      /* ── 눈 ── */
      #${IDS.root}[data-effect="snow"] .cawf-particle {
        width: var(--size, 4px);
        height: var(--size, 4px);
        border-radius: 999px;
        background: radial-gradient(circle, rgba(255,255,255,.98), rgba(255,255,255,.78) 48%, rgba(226,238,255,.30) 76%, rgba(226,238,255,0) 100%);
        box-shadow: 0 0 var(--glow, 10px) rgba(255,255,255,var(--glow-a, .46));
        filter: blur(var(--blur, 0px));
        opacity: var(--a, .72);
        animation-name: cawf-soft-fall;
        animation-timing-function: ease-in-out;
      }

      /* 결정형의 모양만 CodePen 원본이 사용한 투명 PNG로 교체한다. 낙하/바람은 CAWF 애니메이션 그대로. */
      #${IDS.root}[data-effect="snow"] .cawf-particle[data-snow-shape="crystal"] {
        border-radius: 0;
        background-color: transparent;
        background:
          var(--snowflake-image),
          radial-gradient(circle, rgba(255,255,255,.54) 0 12%, rgba(226,238,255,.18) 28%, transparent 64%);
        background-position: center, center;
        background-repeat: no-repeat, no-repeat;
        background-size: contain, 72% 72%;
        box-shadow: none;
        /* 원본 PNG는 검은 마스크다. CodePen의 캔버스 색상 입히기를 CSS 흰색 반전으로 재현한다. */
        -webkit-filter: brightness(0) invert(1) drop-shadow(0 0 var(--crystal-glow, 3px) rgba(230,242,255,var(--glow-a, .42))) blur(var(--blur, 0px));
        filter: brightness(0) invert(1) drop-shadow(0 0 var(--crystal-glow, 3px) rgba(230,242,255,var(--glow-a, .42))) blur(var(--blur, 0px));
        mix-blend-mode: screen;
        transform-origin: 50% 50%;
        transform-style: preserve-3d;
        backface-visibility: visible;
        animation-name: cawf-crystal-fall;
      }

      /* ── 벚꽃잎 / 낙엽 ── */
      #${IDS.root}[data-effect="sakura"] .cawf-particle,
      #${IDS.root}[data-effect="leaves"] .cawf-particle,
      #${IDS.root}[data-effect="greenLeaves"] .cawf-particle {
        width: var(--size, 12px);
        height: var(--size, 12px);
        opacity: var(--a, .8);
        transform-style: preserve-3d;
        animation-name: cawf-petal-fall;
        animation-timing-function: ease-in-out;
      }

      #${IDS.root}[data-effect="sakura"] .cawf-particle::before,
      #${IDS.root}[data-effect="leaves"] .cawf-particle::before,
      #${IDS.root}[data-effect="greenLeaves"] .cawf-particle::before {
        content: '';
        display: block;
        width: 100%;
        height: 74%;
        transform: rotate(var(--spin, 18deg));
        transform-origin: center center;
        filter: drop-shadow(0 3px 7px rgba(0,0,0,.22));
        backface-visibility: visible;
      }

      #${IDS.root}[data-effect="sakura"] .cawf-particle::before {
        border-radius: 74% 26% 74% 26%;
        background: var(--petal-bg, radial-gradient(circle at 30% 26%, rgba(255,255,255,.98), rgba(255,170,202,.98) 40%, rgba(255,86,146,.92) 100%));
      }

      #${IDS.root}[data-effect="sakura"] .cawf-particle[data-petal-shape="notched"]::before {
        border-radius: 48% 48% 66% 66%;
        clip-path: polygon(7% 21%, 34% 2%, 50% 15%, 66% 2%, 93% 21%, 100% 48%, 82% 78%, 52% 100%, 48% 100%, 18% 78%, 0 48%);
      }

      #${IDS.root}[data-effect="sakura"] .cawf-particle::after {
        content: '';
        position: absolute;
        left: 49%;
        top: 9%;
        width: max(.55px, 4%);
        height: 48%;
        border-radius: 999px;
        background: linear-gradient(180deg, transparent, rgba(154,62,105,.30) 30% 72%, transparent);
        transform: rotate(var(--spin, 18deg)) rotate(5deg);
        transform-origin: 50% 100%;
        opacity: var(--petal-crease-a, .34);
        pointer-events: none;
      }

      #${IDS.root}[data-effect="leaves"] .cawf-particle::before {
        border-radius: 86% 12% 84% 16%;
        background: var(--leaf-bg, linear-gradient(135deg, rgba(255,196,84,.99), rgba(222,116,34,.96) 50%, rgba(146,70,22,.92)));
      }

      #${IDS.root}[data-effect="greenLeaves"] .cawf-particle::before {
        border-radius: 86% 12% 84% 16%;
        background: var(--leaf-bg, linear-gradient(135deg, rgba(204,255,156,.99), rgba(92,194,76,.97) 52%, rgba(36,124,52,.92)));
      }

      #${IDS.root}[data-effect="leaves"] .cawf-particle::after,
      #${IDS.root}[data-effect="greenLeaves"] .cawf-particle::after {
        content: '';
        position: absolute;
        left: 49%;
        top: 7%;
        width: max(.65px, 6%);
        height: 58%;
        border-radius: 999px;
        background: linear-gradient(180deg, transparent, var(--vein-color, rgba(86,48,20,.45)) 24% 78%, transparent);
        transform: rotate(var(--spin, 18deg)) rotate(12deg);
        transform-origin: 50% 100%;
        opacity: .52;
        pointer-events: none;
      }


      /* ── 깃털: 길고 우아한 비행깃 SVG가 정면을 유지하며 천천히 흔들려 낙하 ── */
      #${IDS.root}[data-effect="feathers"] .cawf-particle {
        width: var(--feather-w, calc(var(--size, 58px) * 1.4));
        height: var(--feather-h, var(--size, 58px));
        opacity: 0;
        background-image: var(--feather-image);
        background-position: center;
        background-repeat: no-repeat;
        background-size: contain;
        filter: drop-shadow(0 3px 5px rgba(0,0,0,.18)) drop-shadow(0 0 2px rgba(255,255,255,.16));
        transform-origin: var(--pivot-x, 24%) var(--pivot-y, 84%);
        animation-name: cawf-feather-drift;
        animation-timing-function: ease-in-out;
      }

      /* 은하수는 수중과 같은 전면 캔버스 계층에서, 합성 모드 없이 원본 심우주 색을 유지한다. */
      #${IDS.root}[data-effect="galaxy"] #${IDS.ambient} {
        z-index: 4;
        mix-blend-mode: normal;
        background: transparent;
        contain: strict;
      }

      #${IDS.root}[data-effect="feathers"] .cawf-particle[data-feather-shape="flight"] {
        --feather-w: calc(var(--size, 58px) * .92);
        --feather-h: var(--size, 58px);
      }

      #${IDS.root}[data-effect="feathers"] .cawf-particle::before,
      #${IDS.root}[data-effect="feathers"] .cawf-particle::after {
        content: none;
      }

      #${IDS.root}[data-cawf-low-power="true"][data-effect="feathers"] .cawf-particle {
        filter: none;
      }

      /* ── 나비: 몸통(span 배경) + 좌우 날개(::before/::after)가 접혔다 펴지는 날갯짓 ── */
      #${IDS.root}[data-effect="butterflies"] .cawf-particle {
        left: 0;
        top: 0;
        width: var(--size, 14px);
        height: calc(var(--size, 14px) * .78);
        opacity: var(--a, .8);
        background: radial-gradient(closest-side, rgba(52,42,34,.95), rgba(52,42,34,0) 74%);
        background-size: 22% 84%;
        background-position: center 46%;
        background-repeat: no-repeat;
        transform-style: preserve-3d;
        filter: drop-shadow(0 2px 3px rgba(0,0,0,.16));
        animation-name: cawf-butterfly-flight;
        animation-direction: alternate;
        animation-timing-function: ease-in-out;
      }

      #${IDS.root}[data-effect="butterflies"] .cawf-particle::before,
      #${IDS.root}[data-effect="butterflies"] .cawf-particle::after {
        content: '';
        position: absolute;
        top: 5%;
        width: 52%;
        height: 90%;
        background: var(--wing-bg, radial-gradient(circle at 78% 40%, rgba(255,214,120,.98), rgba(244,158,54,.96) 52%, rgba(122,66,26,.94) 100%));
        box-shadow: inset 0 0 0 1px var(--wing-edge, rgba(58,34,16,.4));
        border-radius: 92% 8% 62% 38% / 64% 30% 70% 36%;
        backface-visibility: visible;
        animation: cawf-btf-flap var(--flap, .3s) ease-in-out infinite;
        animation-delay: var(--flap-delay, 0s);
      }

      #${IDS.root}[data-effect="butterflies"] .cawf-particle::before {
        left: 0;
        transform-origin: 100% 50%;
      }

      #${IDS.root}[data-effect="butterflies"] .cawf-particle::after {
        right: 0;
        transform-origin: 0% 50%;
        animation-name: cawf-btf-flap-mirror;
      }

      @keyframes cawf-btf-flap {
        0%, 100% { transform: perspective(80px) rotateY(62deg); }
        50% { transform: perspective(80px) rotateY(8deg); }
      }

      @keyframes cawf-btf-flap-mirror {
        0%, 100% { transform: perspective(80px) scaleX(-1) rotateY(62deg); }
        50% { transform: perspective(80px) scaleX(-1) rotateY(8deg); }
      }

      @keyframes cawf-feather-drift {
        0% {
          transform: translate3d(0, -18vh, 0) rotate(var(--start-z, 0deg))
            scaleX(var(--mirror, 1)) scale(var(--scale, 1));
          opacity: 0;
        }
        6% { opacity: var(--a, .88); }
        20% {
          transform: translate3d(var(--sway-a, 6vw), 8vh, 0)
            rotate(calc(var(--start-z, 0deg) + var(--tilt-a, 18deg)))
            scaleX(var(--mirror, 1)) scale(var(--scale, 1));
        }
        40% {
          transform: translate3d(calc(var(--sway-b, 7vw) * -1), 34vh, 0)
            rotate(calc(var(--start-z, 0deg) + var(--tilt-b, -20deg)))
            scaleX(var(--mirror, 1)) scale(var(--scale, 1));
        }
        60% {
          transform: translate3d(calc(var(--sway-a, 6vw) * .76), 62vh, 0)
            rotate(calc(var(--start-z, 0deg) + var(--tilt-c, 12deg)))
            scaleX(var(--mirror, 1)) scale(var(--scale, 1));
        }
        80% {
          transform: translate3d(calc(var(--sway-b, 7vw) * -.62), 90vh, 0)
            rotate(calc(var(--start-z, 0deg) + var(--tilt-b, -20deg)))
            scaleX(var(--mirror, 1)) scale(var(--scale, 1));
        }
        97% { opacity: var(--a, .84); }
        100% {
          transform: translate3d(calc(var(--sway-a, 6vw) * .3), 120vh, 0)
            rotate(calc(var(--start-z, 0deg) + var(--tilt-a, 18deg)))
            scaleX(var(--mirror, 1)) scale(var(--scale, 1));
          opacity: 0;
        }
      }

      @keyframes cawf-butterfly-flight {
        0% { transform: translate3d(var(--x0, 40vw), var(--y0, 40vh), 0) rotate(-7deg); }
        16% { transform: translate3d(calc((var(--x0, 40vw) + var(--x1, 60vw)) / 2), calc((var(--y0, 40vh) + var(--y1, 50vh)) / 2 - 18px), 0) rotate(6deg); }
        33% { transform: translate3d(var(--x1, 60vw), var(--y1, 50vh), 0) rotate(-5deg); }
        50% { transform: translate3d(calc((var(--x1, 60vw) + var(--x2, 30vw)) / 2), calc((var(--y1, 50vh) + var(--y2, 60vh)) / 2 - 22px), 0) rotate(7deg); }
        66% { transform: translate3d(var(--x2, 30vw), var(--y2, 60vh), 0) rotate(-6deg); }
        83% { transform: translate3d(calc((var(--x2, 30vw) + var(--x3, 70vw)) / 2), calc((var(--y2, 60vh) + var(--y3, 35vh)) / 2 - 16px), 0) rotate(5deg); }
        100% { transform: translate3d(var(--x3, 70vw), var(--y3, 35vh), 0) rotate(-6deg); }
      }

      /* ── 반딧불이: slyka85 CodePen 원본 25개 .firefly 구조를 GSAP 없이 raw-ish port ── */
      #${IDS.root}[data-effect="fireflies"] .cawf-particle {
        left: 0;
        top: 0;
        width: 4px;
        height: 4px;
        position: absolute;
        border-radius: 50%;
        background-color: var(--fly-core, rgba(166,255,88,.98));
        box-shadow:
          0 0 var(--fly-glow-near, 17px) 2px var(--fly-glow-1, rgba(190,255,126,.86)),
          0 0 var(--fly-glow-far, 32px) 7px var(--fly-glow-2, rgba(72,255,106,.24));
        opacity: .72;
        transform: translate3d(var(--x0, 50vw), var(--y0, 50vh), 0) scale(var(--scale, 1));
        animation:
          cawf-firefly-codepen-flight var(--dur, 150s) linear infinite alternate,
          cawf-firefly-blink-single var(--blink, 18s) ease-in-out infinite;
        animation-delay: var(--delay, 0s), var(--blink-delay, 0s);
        will-change: transform, opacity;
      }

      #${IDS.root}[data-effect="fireflies"] .cawf-particle[data-blink-pattern="double"] {
        animation-name: cawf-firefly-codepen-flight, cawf-firefly-blink-double;
      }

      #${IDS.root}[data-effect="fireflies"] .cawf-particle[data-blink-pattern="long-pause"] {
        animation-name: cawf-firefly-codepen-flight, cawf-firefly-blink-long-pause;
      }

      /* ── 마나/마법 입자: Mana particle 원본의 canvas sprite를 소수 CSS sprite로 이식 ── */
      #${IDS.root}[data-effect="mana"] .cawf-particle {
        left: 0;
        top: 0;
        width: var(--size, 10px);
        height: var(--size, 10px);
        border-radius: var(--radius, 999px);
        background: var(--magic-bg, radial-gradient(circle, rgba(255,255,255,.98), rgba(165,210,255,.70) 42%, rgba(120,98,255,.22) 68%, rgba(120,98,255,0) 100%));
        box-shadow:
          0 0 11px rgba(170,205,255,.45),
          0 0 24px rgba(132,106,255,.22);
        opacity: 0;
        transform: translate3d(var(--x0, 50vw), var(--y0, 80vh), 0) rotate(var(--r0, 0deg)) scale(var(--s0, .2));
        animation: cawf-magic-dust-sprite var(--dur, 14s) ease-out infinite;
        animation-delay: var(--delay, 0s);
        will-change: transform, opacity;
      }

      #${IDS.root}[data-effect="mana"] .cawf-particle::before,
      #${IDS.root}[data-effect="mana"] .cawf-particle::after {
        content: '';
        position: absolute;
        left: 50%;
        top: 50%;
        width: 200%;
        height: 1px;
        border-radius: 999px;
        background: linear-gradient(90deg, transparent, rgba(225,235,255,.82), transparent);
        transform: translate(-50%, -50%) rotate(var(--spark-rot, 45deg));
        opacity: var(--spark-a, .28);
      }

      #${IDS.root}[data-effect="mana"] .cawf-particle::after {
        transform: translate(-50%, -50%) rotate(calc(var(--spark-rot, 45deg) + 90deg));
        opacity: calc(var(--spark-a, .28) * .56);
      }

      #${IDS.root}[data-effect="mana"] .cawf-particle[data-magic-shape="diamond"] {
        border-radius: 22%;
      }

      #${IDS.root}[data-effect="mana"] .cawf-particle[data-magic-shape="dot"]::before,
      #${IDS.root}[data-effect="mana"] .cawf-particle[data-magic-shape="dot"]::after {
        display: none;
      }

      @keyframes cawf-rain-fall {
        0% {
          transform: translate3d(0, -20vh, 0) rotate(0deg);
          opacity: 0;
        }
        10% { opacity: var(--a, .34); }
        92% { opacity: var(--a, .34); }
        100% {
          transform: translate3d(0, 126vh, 0) rotate(0deg);
          opacity: 0;
        }
      }

      @keyframes cawf-snow-shared-gust {
        0%, 100% { transform: translate3d(-1.1vw, 0, 0); }
        50% { transform: translate3d(1.5vw, 0, 0); }
      }

      @keyframes cawf-soft-fall {
        0% {
          transform: translate3d(0, -16vh, 0) scale(.78);
          opacity: 0;
        }
        12% { opacity: var(--a, .62); }
        30% { transform: translate3d(var(--sway, 5vw), 30vh, 0) scale(1); }
        58% { transform: translate3d(calc(var(--sway, 5vw) * -0.9), 62vh, 0) scale(.96); }
        86% { transform: translate3d(calc(var(--sway, 5vw) * 0.7), 92vh, 0) scale(.9); }
        100% {
          transform: translate3d(calc(var(--sway, 5vw) * -0.4), 116vh, 0) scale(.86);
          opacity: 0;
        }
      }

      /* 결정형만 종잇조각처럼 펄럭이지 않는 범위에서 천천히 입체 자전한다. */
      @keyframes cawf-crystal-fall {
        0% {
          transform: translate3d(0, -16vh, 0) scale(.78)
            rotateZ(0deg)
            rotateX(calc(var(--crystal-tilt, 34deg) * -.32))
            rotateY(calc(var(--crystal-turn, 58deg) * -.48));
          opacity: 0;
        }
        12% { opacity: var(--a, .72); }
        30% {
          transform: translate3d(var(--sway, 5vw), 30vh, 0) scale(1)
            rotateZ(calc(var(--crystal-spin, 150deg) * .27))
            rotateX(calc(var(--crystal-tilt, 34deg) * .44))
            rotateY(calc(var(--crystal-turn, 58deg) * .58));
        }
        58% {
          transform: translate3d(calc(var(--sway, 5vw) * -0.9), 62vh, 0) scale(.96)
            rotateZ(calc(var(--crystal-spin, 150deg) * .57))
            rotateX(calc(var(--crystal-tilt, 34deg) * -.38))
            rotateY(calc(var(--crystal-turn, 58deg) * -.62));
        }
        86% {
          transform: translate3d(calc(var(--sway, 5vw) * .7), 92vh, 0) scale(.9)
            rotateZ(calc(var(--crystal-spin, 150deg) * .84))
            rotateX(calc(var(--crystal-tilt, 34deg) * .34))
            rotateY(var(--crystal-turn, 58deg));
        }
        100% {
          transform: translate3d(calc(var(--sway, 5vw) * -0.4), 116vh, 0) scale(.86)
            rotateZ(var(--crystal-spin, 150deg))
            rotateX(calc(var(--crystal-tilt, 34deg) * -.28))
            rotateY(calc(var(--crystal-turn, 58deg) * -.36));
          opacity: 0;
        }
      }

      @keyframes cawf-petal-fall {
        0% {
          transform: translate3d(0, -18vh, 0) rotateZ(0deg) rotateY(0deg);
          opacity: 0;
        }
        10% { opacity: var(--a, .72); }
        38% {
          transform: translate3d(var(--drift, 8vw), 34vh, 0) rotateZ(calc(var(--rot, 160deg) * .45)) rotateY(180deg);
        }
        72% {
          transform: translate3d(calc(var(--drift, 8vw) * -0.45), 78vh, 0) rotateZ(calc(var(--rot, 160deg) * .78)) rotateY(420deg);
        }
        100% {
          transform: translate3d(calc(var(--drift, 8vw) * .7), 120vh, 0) rotateZ(var(--rot, 160deg)) rotateY(720deg);
          opacity: 0;
        }
      }

      @keyframes cawf-firefly-codepen-flight {
        0% { transform: translate3d(var(--x0, 50vw), var(--y0, 50vh), 0) scale(var(--scale, 1)); }
        33% { transform: translate3d(var(--x1, 25vw), var(--y1, 44vh), 0) scale(calc(var(--scale, 1) * .96)); }
        66% { transform: translate3d(var(--x2, 70vw), var(--y2, 60vh), 0) scale(calc(var(--scale, 1) * 1.05)); }
        100% { transform: translate3d(var(--x3, 45vw), var(--y3, 35vh), 0) scale(calc(var(--scale, 1) * .92)); }
      }

      @keyframes cawf-firefly-blink-single {
        0%, 60%, 100% { opacity: .18; }
        67% { opacity: .34; }
        72% { opacity: .90; }
        78% { opacity: .28; }
      }

      @keyframes cawf-firefly-blink-double {
        0%, 50%, 100% { opacity: .16; }
        58% { opacity: .78; }
        64% { opacity: .22; }
        71% { opacity: .92; }
        79% { opacity: .26; }
      }

      @keyframes cawf-firefly-blink-long-pause {
        0%, 8%, 100% { opacity: .66; }
        14% { opacity: .24; }
        25%, 86% { opacity: .09; }
        93% { opacity: .82; }
      }

      @keyframes cawf-aurora-light-field {
        0% { transform: translate3d(-4%, 0, 0) scaleX(.96); opacity: .46; }
        100% { transform: translate3d(4%, 3%, 0) scaleX(1.06); opacity: .88; }
      }

      @keyframes cawf-aurora-curtain {
        0% { transform: translate3d(-3%, -2%, 0) skewX(-8deg) scaleY(.96); opacity: .46; }
        100% { transform: translate3d(4.5%, 4%, 0) skewX(9deg) scaleY(1.12); opacity: .90; }
      }

      @keyframes cawf-aurora-ray-fade {
        0% { opacity: .02; }
        44% { opacity: var(--ray-opacity, .18); }
        100% { opacity: calc(var(--ray-opacity, .18) * .58); }
      }

      @keyframes cawf-aurora-ray-wiggle {
        0% { transform: translate3d(0, -8%, 0) skewX(var(--tilt, -6deg)) scaleX(.86); }
        50% { transform: translate3d(calc(var(--move, 18px) * .48), 2%, 0) skewX(calc(var(--tilt, -6deg) * -1)) scaleX(1.12); }
        100% { transform: translate3d(calc(var(--move, 18px) * .82), -2%, 0) skewX(var(--tilt, -6deg)) scaleX(1.00); }
      }

      @media (prefers-reduced-motion: reduce) {
        #${IDS.timeLayer}.cawf-time-transition-in,
        #${IDS.timeLayer}.cawf-time-transition-ghost {
          animation: none !important;
          will-change: auto;
        }

        #${IDS.root} .cawf-particle {
          animation-duration: calc(var(--dur, 9s) * 1.8) !important;
        }

        #${IDS.root}[data-effect="snow"] #${IDS.particles} {
          animation: none !important;
        }

        #${IDS.nightSky} .cawf-cp-meteor {
          animation-duration: calc(28s / var(--cawf-time-speed-safe)) !important;
        }
      }
    `;

    style.textContent += `
/* 2.6: all decorations remain inside the existing effect host. */
#${IDS.root}[data-effect="fireflies"] .cawf-particle {
  width:var(--size,4px); height:var(--size,4px); filter:blur(var(--fly-focus,0px));
}
#${IDS.root}[data-cawf-night-meteors="false"] #${IDS.nightSky} .cawf-cp-meteor { display:none !important; }
#${IDS.panel} .cawf-detail-row { padding:8px 0; gap:12px; }
#${IDS.panel} .cawf-detail-row > span { min-width:0; }
#${IDS.panel} .cawf-detail-row .cawf-seg { flex-shrink:0; }

`;
    style.textContent += "@property --cawfg-ang{syntax:\"<angle>\";inherits:false;initial-value:0deg}\n#cawf-panel,#cawf-floating-button{--accent:#6fa2ff;--accent-2:#9a86ff;  --st-bg:#141413;--st-ink:rgba(238,236,230,.9);--st-ink-2:rgba(238,236,230,.52);--st-line:rgba(255,255,255,.07);--st-bubble:rgba(255,255,255,.07);\n  --c-light:#fff;--c-dark:#000;--rl:.34;--rd:1.7;\n  --bg:color-mix(in srgb,#10131d 66%,transparent);--bg-solid:#151823;\n  --ink:#f2f4fa;--ink-2:rgba(226,232,248,.7);--ink-3:rgba(226,232,248,.44);\n  --line:rgba(255,255,255,.075);--fill:rgba(255,255,255,.05);--fill-2:rgba(255,255,255,.09);--fill-3:rgba(255,255,255,.16);\n  --track:rgba(255,255,255,.14);--knob:#fff;--ind:rgba(255,255,255,.14);--tip:#f2f4fa;--tip-ink:#11141c;\n  --ok:#7ddc9a;--warn:#ffb86e;--bad:#ff7a7a;\n  --spring:cubic-bezier(.34,1.56,.64,1);--ease:cubic-bezier(.22,.61,.36,1);--liquid:cubic-bezier(.65,0,.25,1.25);\n  --lg:\n    inset 0 0 0 1px color-mix(in srgb,var(--c-light) calc(var(--rl)*12%),transparent),\n    inset 1.8px 3px 0 -2px color-mix(in srgb,var(--c-light) calc(var(--rl)*90%),transparent),\n    inset -2px -2px 0 -2px color-mix(in srgb,var(--c-light) calc(var(--rl)*80%),transparent),\n    inset -3px -8px 1px -6px color-mix(in srgb,var(--c-light) calc(var(--rl)*60%),transparent),\n    inset -.3px -1px 4px 0 color-mix(in srgb,var(--c-dark) calc(var(--rd)*12%),transparent),\n    inset -1.5px 2.5px 0 -2px color-mix(in srgb,var(--c-dark) calc(var(--rd)*20%),transparent),\n    inset 0 3px 4px -2px color-mix(in srgb,var(--c-dark) calc(var(--rd)*20%),transparent),\n    inset 2px -6.5px 1px -4px color-mix(in srgb,var(--c-dark) calc(var(--rd)*10%),transparent),\n    0 1px 5px 0 color-mix(in srgb,var(--c-dark) calc(var(--rd)*10%),transparent),\n    0 6px 16px 0 color-mix(in srgb,var(--c-dark) calc(var(--rd)*8%),transparent);\n  --lg-sm:\n    inset 0 0 0 1px color-mix(in srgb,var(--c-light) calc(var(--rl)*16%),transparent),\n    inset 1px 1.6px 0 -1px color-mix(in srgb,var(--c-light) calc(var(--rl)*70%),transparent),\n    inset -1px -1.6px 0 -1px color-mix(in srgb,var(--c-dark) calc(var(--rd)*12%),transparent),\n    0 1px 3px color-mix(in srgb,var(--c-dark) calc(var(--rd)*9%),transparent);\n  --well:inset 0 1px 3px color-mix(in srgb,var(--c-dark) calc(var(--rd)*16%),transparent),inset 0 0 0 1px var(--line);\n}\n#cawf-panel[data-theme=\"light\"],#cawf-floating-button[data-theme=\"light\"]{  --rl:1;--rd:1;\n  --bg:color-mix(in srgb,#f4f6fb 58%,transparent);--bg-solid:#f3f4f8;\n  --ink:#141822;--ink-2:rgba(20,24,34,.68);--ink-3:rgba(20,24,34,.45);\n  --line:rgba(16,22,40,.08);--fill:rgba(16,22,40,.04);--fill-2:rgba(16,22,40,.07);--fill-3:rgba(16,22,40,.12);\n  --track:rgba(16,22,40,.13);--ind:rgba(255,255,255,.95);--tip:#141822;--tip-ink:#fff;\n  --ok:#1f9d57;--warn:#c4680f;--bad:#d9423d;}\n/* ── floating button ─────────────────────── */\n#cawf-floating-button{position:absolute;right:18px;bottom:16px;z-index:6;width:50px;height:50px;border-radius:50%;border:0;padding:0;font-size:22px;display:grid;place-items:center;cursor:pointer;\n  background:color-mix(in srgb,#1a1e2b 52%,transparent);-webkit-backdrop-filter:blur(16px) saturate(170%);backdrop-filter:blur(16px) saturate(170%);\n  box-shadow:var(--lg),0 14px 30px -10px rgba(0,0,0,.55);transition:transform .45s var(--spring),opacity .5s}\n#cawf-floating-button[data-theme=\"light\"]{background:color-mix(in srgb,#fff 55%,transparent)}\n#cawf-floating-button:hover{transform:translateY(-2px) scale(1.05)}\n#cawf-floating-button:active{transform:scale(.9)}\n#cawf-floating-button[data-faded=\"true\"]{opacity:.32}\n#cawf-floating-button[data-faded=\"true\"]:hover{opacity:1}\n#cawf-floating-button[data-active=\"true\"]::before{content:'';position:absolute;inset:-2px;border-radius:50%;padding:2px;background:conic-gradient(from var(--cawfg-ang),var(--accent),transparent 35%,var(--accent-2) 65%,transparent 85%,var(--accent));\n  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:cawfg-rot 4s linear infinite}\n#cawf-floating-button .dot{position:absolute;top:6px;right:6px;width:9px;height:9px;border-radius:50%;background:var(--ok);box-shadow:0 0 8px var(--ok),0 0 0 2px color-mix(in srgb,var(--st-bg) 60%,transparent);transform:scale(0);transition:transform .4s var(--spring)}\n#cawf-floating-button[data-audio=\"true\"] .dot{transform:scale(1)}\n#cawf-floating-button .ico{display:block;transition:transform .45s var(--spring)}\n#cawf-floating-button .ico.cawfg-pop{animation:cawfg-pop .5s var(--spring)}\n@keyframes cawfg-rot{to{--cawfg-ang:360deg}}\n@keyframes cawfg-pop{0%{transform:scale(.4) rotate(-20deg);opacity:0}100%{transform:none;opacity:1}}\n\n/* ── panel shell ─────────────────────────── */\n#cawf-panel{position:absolute;right:16px;bottom:78px;z-index:5;width:min(372px,calc(100% - 24px));max-height:min(700px,calc(100% - 96px));\n  display:flex;flex-direction:column;border-radius:26px;color:var(--ink);background:var(--bg);\n  -webkit-backdrop-filter:blur(26px) saturate(175%);backdrop-filter:blur(26px) saturate(175%);\n  box-shadow:var(--lg),0 30px 70px -14px rgba(0,0,0,.5);font-size:12px;line-height:1.35;overflow:hidden;isolation:isolate;\n  transform-origin:calc(100% - 26px) calc(100% + 40px);\n  transition:transform .6s var(--spring),opacity .3s ease,filter .4s ease}\n#cawf-panel[data-theme=\"light\"]{box-shadow:var(--lg),0 30px 60px -16px rgba(40,50,80,.38)}\n#cawf-panel[data-open=\"false\"]{transform:translate(6px,26px) scale(.18);opacity:0;filter:blur(10px);pointer-events:none;transition:transform .45s cubic-bezier(.5,0,.75,0),opacity .35s ease .08s,filter .35s}\nhtml[data-cawf-low-power=\"true\"] #cawf-panel,html[data-cawf-low-power=\"true\"] #cawf-floating-button{-webkit-backdrop-filter:none;backdrop-filter:none}\nhtml[data-cawf-low-power=\"true\"] #cawf-panel{background:var(--bg-solid)}\n\n#cawf-panel>*:not(.cawfg-spec){position:relative;z-index:1}\n#cawf-panel[data-anim=\"in\"] .stg{animation:cawfg-stgIn .6s var(--spring) both;animation-delay:calc(var(--i,0)*45ms + 80ms)}\n@keyframes cawfg-stgIn{from{opacity:0;transform:translateY(10px) scale(.98)}}\n#cawf-panel button{cursor:pointer}\n#cawf-panel :focus-visible{outline:2px solid var(--accent);outline-offset:1px}\n#cawf-panel [data-off=\"true\"]{opacity:.42;filter:saturate(.6);pointer-events:none;transition:opacity .3s}\n\n/* head */\n.cawfg-head{display:flex;align-items:center;gap:10px;padding:14px 14px 10px}\n.cawfg-app{width:36px;height:36px;border-radius:12px;flex:none;display:grid;place-items:center;font-size:19px;\n  background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 42%,transparent),color-mix(in srgb,var(--accent-2) 30%,transparent));box-shadow:var(--lg-sm)}\n.cawfg-app span{display:block}\n.cawfg-app span.cawfg-pop{animation:cawfg-pop .5s var(--spring)}\n.cawfg-title{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}\n.cawfg-title strong{font-size:14.5px;font-weight:750;letter-spacing:-.015em}\n.cawfg-title small{font-size:10px;color:var(--ink-3)}\n.cawfg-ib{width:30px;height:30px;flex:none;border-radius:50%;border:0;padding:0;display:grid;place-items:center;color:var(--ink-2);background:var(--fill);box-shadow:var(--lg-sm);transition:transform .3s var(--spring),background .2s,color .2s}\n.cawfg-ib:hover{background:var(--fill-2);color:var(--ink)}\n.cawfg-ib:active{transform:scale(.86)}\n.cawfg-ib svg{width:15px;height:15px}\n.cawfg-ib.sm{width:26px;height:26px}\n.cawfg-ib.sm svg{width:13px;height:13px}\n.cawfg-ib[aria-expanded=\"true\"]{background:color-mix(in srgb,var(--accent) 28%,transparent);color:var(--ink)}\n.cawfg-ib[aria-expanded=\"true\"] svg{transform:rotate(60deg)}\n.cawfg-ib svg{transition:transform .4s var(--spring)}\n\n/* switch */\n.cawfg-sw{--w:38px;--h:22px;position:relative;flex:none;width:var(--w);height:var(--h);border:0;padding:0;border-radius:999px;background:var(--track);box-shadow:var(--well);transition:background .35s ease}\n.cawfg-sw>i{position:absolute;top:2px;left:2px;width:calc(var(--h) - 4px);height:calc(var(--h) - 4px);border-radius:999px;background:var(--knob);\n  box-shadow:0 2px 6px rgba(0,0,0,.28),inset 0 -1px 1px rgba(0,0,0,.08);transition:left .5s var(--spring),width .22s ease}\n.cawfg-sw[aria-checked=\"true\"]{background:linear-gradient(120deg,var(--accent),var(--accent-2))}\n.cawfg-sw[aria-checked=\"true\"]>i{left:calc(var(--w) - var(--h) + 2px)}\n.cawfg-sw:active>i{width:calc(var(--h) + 5px)}\n.cawfg-sw[aria-checked=\"true\"]:active>i{left:calc(var(--w) - var(--h) - 5px)}\n.cawfg-sw.lg{--w:46px;--h:27px}\n.cawfg-sw.sm{--w:30px;--h:18px}\n\n/* now card */\n.cawfg-now{margin:0 12px;padding:5px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) 30px;gap:2px;align-items:center;border-radius:18px;background:var(--fill);box-shadow:var(--lg-sm);overflow:hidden}\n.cawfg-nt{display:flex;align-items:center;gap:6px;min-width:0;padding:5px 6px;border-radius:12px;transition:background .2s}\n.cawfg-nt:hover{background:var(--fill)}\n.cawfg-nt+.cawfg-nt{box-shadow:-1px 0 0 var(--line)}\n.cawfg-nt-ico{flex:none;width:22px;text-align:center;font-size:17px;line-height:1;position:relative}\n.cawfg-nt-t{display:flex;flex-direction:column;min-width:0}\n.cawfg-nt-t b{font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.cawfg-nt-t small{font-size:9.5px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.cawfg-nt[data-state=\"warn\"] .cawfg-nt-t small{color:var(--warn)}\n.cawfg-nt[data-state=\"play\"] .cawfg-nt-t small{color:var(--ok)}\n.cawfg-flip{animation:cawfg-flip .5s var(--spring)}\n@keyframes cawfg-flip{from{opacity:0;transform:translateY(7px) scale(.94)}}\n.cawfg-now.scan::after{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(100deg,transparent 25%,color-mix(in srgb,var(--accent) 34%,transparent) 50%,transparent 75%);transform:translateX(-100%);animation:cawfg-sweep .9s var(--ease) forwards}\n.cawfg-now{position:relative}\n@keyframes cawfg-sweep{to{transform:translateX(100%)}}\n.cawfg-rescan.cawfg-spin svg{animation:cawfg-spin .8s var(--ease)}\n@keyframes cawfg-spin{to{transform:rotate(360deg)}}\n\n/* equalizer */\n.cawfg-cawfg-eq{display:inline-flex;align-items:flex-end;gap:1.5px;height:10px}\n.cawfg-cawfg-eq i{width:2.5px;height:30%;border-radius:1px;background:var(--ok)}\n.cawfg-cawfg-eq[data-on=\"true\"] i{animation:cawfg-eq .9s ease-in-out infinite}\n.cawfg-cawfg-eq[data-on=\"true\"] i:nth-child(2){animation-delay:-.3s;animation-duration:.7s}\n.cawfg-cawfg-eq[data-on=\"true\"] i:nth-child(3){animation-delay:-.55s;animation-duration:1.1s}\n@keyframes cawfg-eq{0%,100%{height:25%}50%{height:100%}}\n\n/* quick row */\n.cawfg-quick{display:flex;gap:6px;padding:8px 12px 0}\n.cawfg-q{display:flex;align-items:center;gap:7px;min-height:34px;padding:4px 5px 4px 10px;border-radius:12px;background:var(--fill);box-shadow:var(--lg-sm);font-size:11.5px;font-weight:600;white-space:nowrap}\n.cawfg-q:first-child{flex:1}\n.cawfg-q>span{flex:1}\n\n/* segmented */\n.cawfg-seg{position:relative;display:inline-grid;grid-auto-flow:column;grid-auto-columns:1fr;padding:2px;border-radius:10px;background:var(--fill);box-shadow:var(--well);isolation:isolate;flex:none}\n.cawfg-seg>button{position:relative;z-index:1;border:0;background:none;font-size:11px;color:var(--ink-2);padding:0 9px;height:24px;border-radius:8px;white-space:nowrap;transition:color .25s}\n.cawfg-seg>button[aria-pressed=\"true\"]{color:var(--ink);font-weight:650}\n.cawfg-seg-ind{position:absolute;z-index:0;top:2px;bottom:2px;left:2px;width:calc((100% - 4px)/var(--n,3));border-radius:8px;background:var(--ind);box-shadow:var(--lg-sm);transform:translateX(calc(var(--i,0)*100%));transition:transform .5s var(--spring)}\n.cawfg-seg.sm>button{height:22px;font-size:10.5px;padding:0 8px}\n\n/* tabs */\n.cawfg-tabs{position:relative;margin:10px 12px 0;padding:3px;display:grid;grid-template-columns:repeat(4,1fr);border-radius:15px;background:var(--fill);box-shadow:var(--well)}\n.cawfg-tab{position:relative;z-index:1;height:34px;border:0;background:none;color:var(--ink-2);font-size:12px;font-weight:650;display:flex;align-items:center;justify-content:center;gap:5px;border-radius:12px;transition:color .25s}\n.cawfg-tab[aria-selected=\"true\"]{color:var(--ink)}\n.cawfg-tab .mark{width:6px;height:6px;border-radius:50%;background:var(--warn);box-shadow:0 0 6px var(--warn);display:none}\n.cawfg-tab[data-dirty=\"true\"] .mark{display:block}\n.cawfg-tab .cawfg-cawfg-eq{display:none;height:9px}\n.cawfg-tab[data-playing=\"true\"] .cawfg-cawfg-eq{display:inline-flex}\n.cawfg-tab-ind{position:absolute;z-index:0;top:3px;bottom:3px;left:3px;width:calc((100% - 6px)/4);border-radius:12px;background:var(--ind);box-shadow:var(--lg);transform:translateX(calc(var(--idx,0)*100%));transition:transform .55s var(--spring)}\n\n/* body & pages */\n.cawfg-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:12px 12px 14px;scrollbar-width:thin;scrollbar-color:var(--fill-3) transparent;\n  -webkit-mask-image:linear-gradient(180deg,transparent 0,#000 10px,#000 calc(100% - 12px),transparent);mask-image:linear-gradient(180deg,transparent 0,#000 10px,#000 calc(100% - 12px),transparent)}\n.cawfg-page{display:none}\n.cawfg-page[data-on=\"true\"]{display:block;animation:cawfg-pageIn .42s var(--ease)}\n.cawfg-page[data-on=\"true\"][data-dir=\"-1\"]{animation-name:cawfg-pageInL}\n@keyframes cawfg-pageIn{from{opacity:0;transform:translateX(16px)}}\n@keyframes cawfg-pageInL{from{opacity:0;transform:translateX(-16px)}}\n.cawfg-sh{display:flex;align-items:center;gap:8px;margin:0 2px 8px}\n.cawfg-sh b{font-size:12.5px;font-weight:750;white-space:nowrap}\n.cawfg-sh small{flex:1;min-width:0;font-size:10px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.cawfg-sh+.cawfg-sh{margin-top:14px}\n.cawfg-gap{height:12px}\n\n/* mode chips */\n.cawfg-mode{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px}\n.cawfg-m{position:relative;display:flex;align-items:center;gap:8px;min-height:40px;padding:6px 10px;border:0;border-radius:13px;background:var(--fill);box-shadow:inset 0 0 0 1px var(--line);text-align:left;overflow:hidden;transition:transform .3s var(--spring),background .25s,box-shadow .25s}\n.cawfg-m:hover{background:var(--fill-2)}\n.cawfg-m:active{transform:scale(.96)}\n.cawfg-m>span{font-size:16px;line-height:1}\n.cawfg-m b{display:block;font-size:12px;font-weight:700}\n.cawfg-m small{display:block;font-size:9.5px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.cawfg-m>div{min-width:0}\n.cawfg-m[aria-pressed=\"true\"],.cawfg-chip[aria-pressed=\"true\"]{background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 36%,transparent),color-mix(in srgb,var(--accent-2) 26%,transparent));\n  box-shadow:var(--lg-sm),0 0 0 1px color-mix(in srgb,var(--accent) 58%,transparent),0 6px 18px -8px var(--accent);color:var(--ink)}\n\n/* effect grid */\n.cawfg-fxgrid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px 5px}\n.cawfg-cap{display:flex;align-items:center;gap:6px;font-size:9.5px;font-weight:650;color:var(--ink-3);margin-top:3px}\n.cawfg-cap::after{content:'';flex:1;height:1px;background:var(--line)}\n.cawfg-chip{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;height:48px;padding:5px 2px 3px;border:0;border-radius:12px;\n  background:var(--fill);box-shadow:inset 0 0 0 1px var(--line);color:var(--ink-2);overflow:hidden;transition:transform .32s var(--spring),background .25s,color .2s,box-shadow .25s,opacity .3s}\n.cawfg-chip:hover{background:var(--fill-2);color:var(--ink);transform:translateY(-1px)}\n.cawfg-chip:active{transform:scale(.9)}\n.cawfg-chip-ico{font-size:17px;line-height:1;transition:transform .45s var(--spring),filter .3s,opacity .3s}\n.cawfg-chip[aria-pressed=\"true\"] .cawfg-chip-ico{transform:scale(1.14)}\n.cawfg-chip-lbl{font-size:10px;font-weight:650;white-space:nowrap}\n.cawfg-chip-tag{position:absolute;top:3px;right:4px;font-size:7.5px;font-weight:800;color:var(--ink-3);line-height:1}\n.cawfg-chip-snd{position:absolute;top:4px;left:4px;width:8px;height:8px;color:var(--ink-3)}\n.cawfg-chip-snd svg{display:block;width:8px;height:8px}\n.cawfg-chip[data-unavail=\"true\"] .cawfg-chip-ico{filter:grayscale(1);opacity:.45}\n.cawfg-chip[data-unavail=\"true\"] .cawfg-chip-lbl{opacity:.6}\n.cawfg-chip[data-detected=\"true\"]::before,.cawfg-period[data-detected=\"true\"]::before{content:'';position:absolute;inset:0;border-radius:inherit;padding:1.5px;z-index:2;pointer-events:none;\n  background:conic-gradient(from var(--cawfg-ang),var(--accent),transparent 30%,var(--accent-2) 55%,transparent 80%,var(--accent));\n  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:cawfg-rot 3s linear infinite}\n\n/* detail line */\n.cawfg-detail{margin-top:8px;display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:14px;background:var(--fill);box-shadow:inset 0 0 0 1px var(--line)}\n.cawfg-detail-ico{font-size:21px;line-height:1;flex:none}\n.cawfg-detail-m{flex:1;min-width:0}\n.cawfg-detail-m b{font-size:12px;font-weight:700}\n.cawfg-detail-m p{margin:2px 0 0;font-size:10px;color:var(--ink-3);line-height:1.4}\n.cawfg-pill{flex:none;font-size:9.5px;font-weight:750;padding:3px 8px;border-radius:999px;white-space:nowrap}\n.cawfg-pill.ok{color:var(--ok);background:color-mix(in srgb,var(--ok) 15%,transparent)}\n.cawfg-pill.warn{color:var(--warn);background:color-mix(in srgb,var(--warn) 15%,transparent)}\n.cawfg-pill.off{color:var(--ink-3);background:var(--fill-2)}\n\n/* tune card & rows */\n.cawfg-card{margin-top:8px;padding:2px 10px;border-radius:16px;background:var(--fill);box-shadow:var(--lg-sm)}\n.cawfg-row{display:flex;align-items:center;gap:10px;min-height:38px}\n.cawfg-card>.cawfg-row+.cawfg-row,.cawfg-card>.cawfg-rrow+.cawfg-rrow,.cawfg-card>.cawfg-row+.cawfg-rrow,.cawfg-card>.cawfg-rrow+.cawfg-row,.cawfg-card>.cawfg-acc .cawfg-row{border-top:1px solid var(--line)}\n.cawfg-rl{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;font-size:11.5px;font-weight:650}\n.cawfg-rl small{font-size:9.5px;font-weight:400;color:var(--ink-3)}\n.cawfg-rrow{display:flex;align-items:center;gap:8px;min-height:38px}\n.cawfg-rrow .cawfg-rl{flex:0 0 52px}\n.cawfg-rwrap{flex:1;min-width:0;position:relative;display:flex;align-items:center}\n.cawfg-rwrap[data-tick]::after{content:'';position:absolute;left:var(--tick);top:50%;width:2px;height:10px;margin:-5px 0 0 -1px;border-radius:1px;background:var(--ink-3);pointer-events:none;opacity:.6}\n.cawfg-out{flex:0 0 36px;text-align:right;font-size:11px;font-weight:650;font-variant-numeric:tabular-nums;color:var(--ink-2)}\n.cawfg-out.cawfg-bump{animation:cawfg-bump .3s var(--spring)}\n@keyframes cawfg-bump{50%{transform:scale(1.18);color:var(--ink)}}\n.cawfg-range{--p:50%;width:100%;height:24px;margin:0;-webkit-appearance:none;appearance:none;background:transparent;cursor:pointer}\n.cawfg-range::-webkit-slider-runnable-track{height:6px;border-radius:999px;background:linear-gradient(90deg,var(--accent),var(--accent-2)) 0/var(--p) 100% no-repeat,var(--track);box-shadow:inset 0 1px 2px rgba(0,0,0,.18)}\n.cawfg-range::-moz-range-track{height:6px;border-radius:999px;background:var(--track)}\n.cawfg-range::-moz-range-progress{height:6px;border-radius:999px;background:linear-gradient(90deg,var(--accent),var(--accent-2))}\n.cawfg-range::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;margin-top:-6px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.32),inset 0 -1px 1px rgba(0,0,0,.08);transition:transform .3s var(--spring),box-shadow .3s}\n.cawfg-range::-moz-range-thumb{width:18px;height:18px;border:0;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.32);transition:transform .3s var(--spring)}\n.cawfg-range:active::-webkit-slider-thumb{transform:scale(1.3);box-shadow:0 2px 8px rgba(0,0,0,.3),0 0 0 6px color-mix(in srgb,var(--accent) 24%,transparent)}\n.cawfg-range:active::-moz-range-thumb{transform:scale(1.3)}\n\n/* accordion */\n.cawfg-acc{display:grid;grid-template-rows:0fr;transition:grid-template-rows .42s var(--ease)}\n.cawfg-acc>div{overflow:hidden;min-height:0}\n.cawfg-acc[data-open=\"true\"]{grid-template-rows:1fr}\n.cawfg-acc-h{display:flex;align-items:center;gap:6px;padding-top:8px;font-size:10px;font-weight:700;color:var(--ink-3)}\n\n/* time ribbon */\n.cawfg-rib{position:relative;margin:22px 2px 6px}\n.cawfg-rib-bar{position:relative;display:flex;height:24px;border-radius:12px;overflow:hidden;\n  background:linear-gradient(90deg,#0d1430 0%,#1a2250 20.8%,#b56a86 25%,#ffc08c 29.2%,#8cc6ea 39.6%,#7ab8e2 60.4%,#f0ae70 70.8%,#ff8a5a 76%,#7a4f8e 81.3%,#2c3474 84.4%,#141c3c 87.5%,#0d1430 100%);\n  box-shadow:var(--lg-sm)}\n.cawfg-rib-seg{position:relative;flex:var(--w) 1 0;min-width:0;border:0;padding:0;background:transparent;font-size:11px;line-height:24px;text-align:center;transition:background .25s}\n.cawfg-rib-seg+.cawfg-rib-seg{box-shadow:inset 1px 0 0 rgba(255,255,255,.3)}\n.cawfg-rib-seg:hover{background:rgba(255,255,255,.14)}\n.cawfg-rib-seg[aria-pressed=\"true\"]{background:rgba(255,255,255,.2);box-shadow:inset 0 0 0 2px #fff}\n.cawfg-rib-seg span{filter:drop-shadow(0 1px 1px rgba(0,0,0,.35))}\n.cawfg-rib-ticks{display:flex;justify-content:space-between;margin-top:4px;font-size:9px;color:var(--ink-3);font-variant-numeric:tabular-nums}\n.cawfg-rib-mark{position:absolute;top:-4px;height:32px;left:var(--x,50%);width:2px;margin-left:-1px;border-radius:2px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.28),0 0 10px rgba(255,255,255,.9);transition:left .8s var(--spring),opacity .3s;pointer-events:none}\n.cawfg-rib-mark b{position:absolute;bottom:calc(100% + 3px);left:50%;transform:translateX(-50%);padding:1px 6px;border-radius:6px;font-size:9.5px;font-weight:750;white-space:nowrap;background:var(--tip);color:var(--tip-ink);font-variant-numeric:tabular-nums}\n\n\n.cawfg-rib-mark[hidden]{display:block;opacity:0}\n\n/* period tiles */\n.cawfg-periods{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}\n.cawfg-period{position:relative;height:60px;border:0;border-radius:14px;padding:0;overflow:hidden;color:#fff;text-align:left;background:var(--sky);\n  box-shadow:inset 0 0 0 1px rgba(255,255,255,.16),0 3px 10px -4px rgba(0,0,0,.4);transition:transform .35s var(--spring),box-shadow .3s}\n.cawfg-period::after{content:'';position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,.46),transparent 72%);pointer-events:none}\n.cawfg-period:hover{transform:translateY(-2px)}\n.cawfg-period:active{transform:scale(.94)}\n.cawfg-period-ico{position:absolute;top:6px;left:8px;z-index:1;font-size:14px;line-height:1}\n.cawfg-period-t{position:absolute;left:8px;right:6px;bottom:6px;z-index:1;display:flex;flex-direction:column}\n.cawfg-period-t b{font-size:12px;font-weight:750;text-shadow:0 1px 2px rgba(0,0,0,.45)}\n.cawfg-period-t small{font-size:9px;opacity:.88;font-variant-numeric:tabular-nums;text-shadow:0 1px 2px rgba(0,0,0,.45)}\n.cawfg-period[aria-pressed=\"true\"]{box-shadow:inset 0 0 0 2px #fff,0 0 0 2px color-mix(in srgb,var(--accent) 70%,transparent),0 8px 20px -8px var(--accent)}\n.cawfg-ck{position:absolute;top:6px;right:6px;z-index:1;width:18px;height:18px;border-radius:50%;background:#fff;color:#141822;display:grid;place-items:center;transform:scale(0);transition:transform .45s var(--spring)}\n.cawfg-ck svg{width:11px;height:11px}\n.cawfg-period[aria-pressed=\"true\"] .cawfg-ck{transform:scale(1)}\n\n/* keywords */\n.cawfg-kwgrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px}\n.cawfg-k{position:relative;display:flex;align-items:center;gap:4px;height:30px;padding:0 6px;border:0;border-radius:10px;background:var(--fill);box-shadow:inset 0 0 0 1px var(--line);color:var(--ink-2);font-size:10.5px;font-weight:650;white-space:nowrap;overflow:hidden;transition:transform .3s var(--spring),background .2s}\n.cawfg-k:hover{background:var(--fill-2)}\n.cawfg-k:active{transform:scale(.93)}\n.cawfg-k .i{font-size:12px}\n.cawfg-k .l{overflow:hidden;text-overflow:ellipsis}\n.cawfg-k .n{margin-left:auto;font-size:9px;color:var(--ink-3);font-variant-numeric:tabular-nums}\n.cawfg-k[aria-pressed=\"true\"]{color:var(--ink);background:color-mix(in srgb,var(--accent) 22%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 60%,transparent)}\n.cawfg-k[data-dirty=\"true\"]::after{content:'';position:absolute;top:4px;right:4px;width:5px;height:5px;border-radius:50%;background:var(--warn);box-shadow:0 0 6px var(--warn)}\n.cawfg-ed{margin-top:8px;padding:9px 10px 10px;border-radius:16px;background:var(--fill);box-shadow:var(--lg-sm)}\n.cawfg-ed-h{display:flex;align-items:center;gap:6px}\n.cawfg-ed-h .i{font-size:15px}\n.cawfg-ed-h b{font-size:12px;font-weight:750}\n.cawfg-ed-h small{flex:1;font-size:10px;color:var(--ink-3);font-variant-numeric:tabular-nums}\n.cawfg-link{border:0;background:none;padding:2px 4px;font-size:10.5px;font-weight:650;color:var(--ink-2);border-radius:6px}\n.cawfg-link:hover{color:var(--ink);background:var(--fill-2)}\n.cawfg-tags{margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;max-height:128px;overflow-y:auto;padding:2px;scrollbar-width:thin}\n.cawfg-tag{display:inline-flex;align-items:center;gap:2px;height:23px;padding:0 3px 0 8px;border-radius:999px;background:var(--fill-2);box-shadow:inset 0 0 0 1px var(--line);font-size:10.5px;animation:cawfg-tagIn .35s var(--spring)}\n.cawfg-tag.out{animation:cawfg-tagOut .2s ease forwards}\n.cawfg-tag button{width:17px;height:17px;border:0;border-radius:50%;padding:0;background:none;color:var(--ink-3);font-size:12px;line-height:1;display:grid;place-items:center}\n.cawfg-tag button:hover{background:var(--fill-3);color:var(--ink)}\n@keyframes cawfg-tagIn{from{opacity:0;transform:scale(.6)}}\n@keyframes cawfg-tagOut{to{opacity:0;transform:scale(.5);width:0;padding:0;margin:0}}\n.cawfg-tag-in{flex:1 0 110px;min-width:110px;height:23px;border:0;border-radius:999px;padding:0 10px;background:transparent;box-shadow:inset 0 0 0 1px var(--line);font-size:10.5px;outline:none}\n.cawfg-tag-in:focus{box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--accent) 70%,transparent);background:var(--fill)}\n.cawfg-tag-in::placeholder,.cawfg-raw::placeholder,.cawfg-test input::placeholder,.cawfg-url input::placeholder{color:var(--ink-3)}\n.cawfg-raw{display:block;width:100%;min-height:128px;margin-top:8px;padding:8px 10px;border:0;border-radius:12px;resize:vertical;background:var(--fill);box-shadow:var(--well);font-size:11px;line-height:1.55;outline:none}\n.cawfg-raw:focus{box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--accent) 70%,transparent)}\n.cawfg-test{margin-top:8px;padding:8px 10px;border-radius:14px;background:var(--fill);box-shadow:inset 0 0 0 1px var(--line)}\n.cawfg-test label{display:block;font-size:10px;font-weight:700;color:var(--ink-3);margin-bottom:5px}\n.cawfg-test input{width:100%;height:30px;border:0;border-radius:9px;padding:0 10px;background:var(--fill);box-shadow:var(--well);font-size:11px;outline:none}\n.cawfg-test input:focus{box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--accent) 70%,transparent)}\n.cawfg-test-out{display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin-top:6px;min-height:20px;font-size:10.5px;color:var(--ink-3)}\n.cawfg-test-out .r{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;font-weight:700;color:var(--ink);background:color-mix(in srgb,var(--accent) 22%,transparent);animation:cawfg-tagIn .35s var(--spring)}\n.cawfg-test-out mark{background:color-mix(in srgb,var(--warn) 26%,transparent);color:var(--ink);padding:1px 5px;border-radius:5px}\n\n/* sound */\n.cawfg-lock{display:flex;align-items:center;gap:9px;padding:8px 8px 8px 10px;border-radius:15px;background:color-mix(in srgb,var(--warn) 12%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--warn) 32%,transparent);transition:background .4s,box-shadow .4s}\n.cawfg-lock[data-state=\"open\"]{background:color-mix(in srgb,var(--ok) 11%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ok) 30%,transparent)}\n.cawfg-lock-ico{width:28px;height:28px;flex:none;border-radius:9px;display:grid;place-items:center;color:var(--warn);background:color-mix(in srgb,var(--warn) 16%,transparent)}\n.cawfg-lock[data-state=\"open\"] .cawfg-lock-ico{color:var(--ok);background:color-mix(in srgb,var(--ok) 16%,transparent)}\n.cawfg-lock-ico svg{width:15px;height:15px}\n.cawfg-lock-ico.cawfg-pop svg{animation:cawfg-pop .5s var(--spring)}\n.cawfg-lock-t{flex:1;min-width:0}\n.cawfg-lock-t b{display:block;font-size:11.5px;font-weight:750}\n.cawfg-lock-t small{display:block;font-size:9.5px;color:var(--ink-3)}\n.cawfg-tgrid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}\n.cawfg-tt{display:flex;align-items:center;gap:6px;padding:7px 7px 7px 10px;border-radius:13px;background:var(--fill);box-shadow:inset 0 0 0 1px var(--line)}\n.cawfg-tt>span{flex:1;min-width:0}\n.cawfg-tt b{display:block;font-size:11px;font-weight:700;white-space:nowrap}\n.cawfg-tt small{display:block;font-size:9px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.cawfg-mixer{margin-top:8px;padding:3px 8px;border-radius:16px;background:var(--fill);box-shadow:var(--lg-sm)}\n.cawfg-mx+.cawfg-mx{border-top:1px solid var(--line)}\n.cawfg-mx-row{display:grid;grid-template-columns:30px 62px minmax(0,1fr) 34px 26px;align-items:center;gap:6px;min-height:44px}\n.cawfg-mx-ico{position:relative;width:30px;height:30px;border-radius:10px;display:grid;place-items:center;font-size:15px;background:var(--fill-2);transition:background .35s,box-shadow .35s}\n.cawfg-mx[data-state=\"play\"] .cawfg-mx-ico{background:color-mix(in srgb,var(--accent) 26%,transparent);box-shadow:0 0 0 1px color-mix(in srgb,var(--accent) 50%,transparent),0 4px 12px -4px var(--accent)}\n.cawfg-mx-ico .cawfg-cawfg-eq{position:absolute;right:2px;bottom:2px;height:8px;opacity:0;transition:opacity .3s}\n.cawfg-mx-ico .cawfg-cawfg-eq i{width:2px}\n.cawfg-mx[data-state=\"play\"] .cawfg-mx-ico .cawfg-cawfg-eq{opacity:1}\n.cawfg-mx-n{min-width:0}\n.cawfg-mx-n b{display:block;font-size:11.5px;font-weight:700;white-space:nowrap}\n.cawfg-mx-n small{display:block;font-size:9px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.cawfg-mx[data-state=\"play\"] .cawfg-mx-n small{color:var(--ok)}\n.cawfg-mx[data-state=\"lock\"] .cawfg-mx-n small{color:var(--warn)}\n.cawfg-url{padding:2px 0 10px 36px;display:flex;flex-direction:column;gap:6px}\n.cawfg-url small{font-size:9.5px;color:var(--ink-3);line-height:1.45}\n.cawfg-url small a{color:var(--ink-2)}\n.cawfg-url input{width:100%;height:28px;border:0;border-radius:9px;padding:0 9px;background:var(--fill);box-shadow:var(--well);font-size:10.5px;outline:none}\n.cawfg-url input:focus{box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--accent) 70%,transparent)}\n.cawfg-url-btns{display:flex;gap:5px}\n\n/* buttons */\n.cawfg-btn{position:relative;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;border:0;border-radius:10px;font-size:11.5px;font-weight:700;color:var(--ink);background:var(--fill);box-shadow:var(--lg-sm);white-space:nowrap;transition:transform .3s var(--spring),background .2s,color .2s}\n.cawfg-btn:hover{background:var(--fill-2);transform:translateY(-1px)}\n.cawfg-btn:active{transform:scale(.94)}\n.cawfg-btn svg{width:13px;height:13px}\n.cawfg-btn.sm{height:26px;padding:0 10px;font-size:10.5px}\n.cawfg-btn.primary{color:#fff;background:linear-gradient(120deg,var(--accent),var(--accent-2));box-shadow:var(--lg-sm),0 6px 16px -6px var(--accent)}\n.cawfg-btn.primary::before{content:'';position:absolute;inset:0;background:linear-gradient(110deg,transparent 30%,rgba(255,255,255,.45) 50%,transparent 70%);transform:translateX(-120%);transition:transform .7s var(--ease)}\n.cawfg-btn.primary:hover::before{transform:translateX(120%)}\n.cawfg-btn[disabled]{opacity:.45;pointer-events:none}\n.cawfg-btn .cnt{min-width:16px;height:16px;padding:0 4px;border-radius:8px;font-size:9.5px;line-height:16px;background:rgba(255,255,255,.28)}\n.cawfg-btn[data-armed=\"true\"]{color:#fff;background:color-mix(in srgb,var(--bad) 78%,transparent)}\n.cawfg-btn .bar{position:absolute;left:0;right:0;bottom:0;height:2px;background:#fff;transform-origin:left;transform:scaleX(0)}\n.cawfg-btn[data-armed=\"true\"] .bar{animation:cawfg-countdown 3s linear forwards}\n@keyframes cawfg-countdown{from{transform:scaleX(1)}to{transform:scaleX(0)}}\n.cawfg-cawfg-ripple{position:absolute;border-radius:50%;pointer-events:none;background:currentColor;opacity:.22;transform:scale(0);animation:cawfg-ripple .6s var(--ease) forwards}\n@keyframes cawfg-ripple{to{transform:scale(1);opacity:0}}\n\n/* footer */\n.cawfg-foot{display:flex;align-items:center;gap:6px;padding:9px 12px 12px;border-top:1px solid var(--line)}\n.cawfg-foot [data-foot]{display:none;gap:6px;margin-left:auto}\n.cawfg-foot [data-foot][data-on=\"true\"]{display:flex;animation:cawfg-pageIn .35s var(--ease)}\n.cawfg-saved{margin-left:auto;display:inline-flex;align-items:center;gap:4px;font-size:10px;color:var(--ink-3);white-space:nowrap}\n.cawfg-saved svg{width:12px;height:12px}\n.cawfg-saved.pulse{color:var(--ok)}\n.cawfg-saved.pulse svg{animation:cawfg-pop .5s var(--spring)}\n.cawfg-foot[data-kw=\"true\"] .cawfg-saved{display:none}\n\n\n/* The header/status/navigation never participate in flex shrinking. */\n#cawf-panel{position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(78px,env(safe-area-inset-bottom));z-index:2147482601;width:min(372px,calc(100vw - 24px));max-height:min(700px,calc(100dvh - 96px));display:none;font-family:Pretendard,-apple-system,BlinkMacSystemFont,\"Apple SD Gothic Neo\",\"Malgun Gothic\",system-ui,sans-serif;box-sizing:border-box}\n#cawf-panel[data-open=\"true\"]{display:flex}\n#cawf-panel>header,#cawf-panel>.cawfg-now,#cawf-panel>.cawfg-quick,#cawf-panel>nav,#cawf-panel>footer{flex:0 0 auto}\n#cawf-panel>.cawfg-now{min-height:50px;overflow:visible}\n#cawf-panel .cawfg-nt{min-height:40px}\n#cawf-panel .cawfg-nt-ico{line-height:22px}\n#cawf-panel .cawfg-nt-t{gap:2px;line-height:1.4}\n#cawf-panel .cawfg-body{flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain;-webkit-mask-image:none;mask-image:none}\n#cawf-panel *,#cawf-panel *::before,#cawf-panel *::after{box-sizing:border-box}\n#cawf-panel button,#cawf-panel input,#cawf-panel textarea{font-family:inherit;color:inherit}\n#cawf-panel button{cursor:pointer}\n#cawf-panel [hidden]{display:none!important}\n#cawf-panel .cawfg-page[data-on=\"true\"]{display:block}\n#cawf-panel .cawfg-page:not([data-on=\"true\"]){display:none}\n#cawf-panel .cawfg-acc[data-cawf-galaxy-options]{display:block}\n#cawf-panel .cawfg-seg button[aria-pressed=\"true\"]{color:var(--ink)}\n#cawf-panel .cawfg-raw{color:var(--ink)}\n#cawf-panel .cawfg-url input{color:var(--ink);min-width:0}\n#cawf-panel .cawfg-mx-row{list-style:none;padding:4px 0;cursor:default}\n#cawf-panel .cawfg-mx-row::-webkit-details-marker{display:none}\n#cawf-panel .cawfg-mx-row::marker{content:''}\n#cawf-panel .cawfg-mx-n{font-size:11.5px;font-weight:700}\n#cawf-panel .cawfg-mx[open] .cawfg-ib{background:var(--fill-3)}\n#cawf-panel .cawfg-foot{flex-wrap:wrap;min-height:48px}\n#cawf-panel .cawfg-foot[data-kw=\"true\"]>[data-cawf-reset]{display:none}\n#cawf-panel .cawfg-foot [data-foot=\"kw\"]{flex-wrap:wrap}\n#cawf-panel .cawfg-rib-mark b{max-width:80px}\n#cawf-panel .cawfg-rib-mark::after{content:none;animation:none}\n#cawf-panel .cawfg-nt-t b{font-size:11.5px}\n#cawf-panel .cawfg-chip-lbl{font-size:10px}\n#cawf-panel .cawfg-q{min-width:0}\n#cawf-panel .cawfg-tgrid{grid-template-columns:repeat(2,minmax(0,1fr))}\n#cawf-panel .cawfg-tt{min-width:0}\n#cawf-panel .cawfg-tt b{white-space:normal}\n#cawf-panel .cawfg-sw{padding:0;color:var(--ink)}\n#cawf-panel .cawfg-btn.primary{color:#fff}\n#cawf-panel .cawfg-period{color:#fff}\n#cawf-panel .cawfg-rib-seg{color:#fff}\n#cawf-panel .cawfg-title strong{white-space:nowrap}\n#cawf-floating-button{position:fixed;left:0;top:0;right:auto;bottom:auto;z-index:2147482600;width:50px;height:50px;display:none;touch-action:none;color:var(--ink);line-height:1;box-sizing:border-box}\n#cawf-floating-button[data-visible=\"true\"]{display:grid}\n#cawf-floating-button[data-active=\"true\"]::before{animation-play-state:running;pointer-events:none}\n#cawf-floating-button[data-faded=\"true\"]:not(:hover):not(:focus-visible):not([data-panel-open=\"true\"])::before{animation-play-state:paused}\n#cawf-floating-button[data-panel-open=\"true\"],#cawf-floating-button:focus-visible{opacity:1}\n#cawf-floating-button[data-audio=\"true\"]::after{content:'';position:absolute;right:6px;top:6px;width:9px;height:9px;border-radius:50%;background:var(--ok);box-shadow:0 0 8px var(--ok)}\n#cawf-floating-button:focus-visible{outline:2px solid var(--accent);outline-offset:4px}\n@media(max-width:420px){#cawf-panel{right:8px;width:calc(100vw - 16px)}#cawf-panel .cawfg-head{gap:7px;padding-left:12px;padding-right:12px}#cawf-panel .cawfg-title small{font-size:9px}#cawf-panel .cawfg-quick{gap:5px}#cawf-panel .cawfg-q{gap:4px;padding-left:7px;font-size:10.5px}#cawf-panel .cawfg-seg.sm>button{padding:0 6px}}\n@media(max-height:520px){#cawf-panel{top:max(8px,env(safe-area-inset-top));bottom:auto;max-height:calc(100dvh - 16px)}#cawf-panel .cawfg-head{padding-top:8px;padding-bottom:6px}#cawf-panel .cawfg-foot{padding-top:6px;padding-bottom:6px}}\n@media(prefers-reduced-motion:reduce){#cawf-panel *,#cawf-panel *::before,#cawf-panel *::after,#cawf-floating-button,#cawf-floating-button::before{animation:none!important;transition:none!important}}\n";
    document.head.appendChild(style);
    state.lastAppliedGeom = null;
  }

  function ensureRoot() {
    // 빠른 경로(노트북 최적화): 루트와 핵심 자식이 이미 연결돼 있고 현재 효과가 수중이 아니면,
    // 매 프레임 반복되던 자식 재검증 + (비활성) 수중 입자 점검을 통째로 건너뛴다.
    // 수중이 켜진 게 아니므로 그때마다 수중 레이어 DOM을 점검할 이유가 없다.
    if (
      state.root && state.root.isConnected &&
      state.rainCanvas instanceof HTMLCanvasElement && state.rainCanvas.isConnected &&
      state.timeLayer instanceof HTMLElement && state.timeLayer.isConnected &&
      state.ambient instanceof HTMLElement && state.ambient.isConnected &&
      state.particles instanceof HTMLElement && state.particles.isConnected &&
      state.underwaterLayer instanceof HTMLElement && state.underwaterLayer.isConnected &&
      state.activeEffect !== 'underwater'
    ) {
      return state.root;
    }

    let root = document.getElementById(IDS.root);
    if (!root) {
      root = document.createElement('div');
      root.id = IDS.root;
      root.setAttribute('aria-hidden', 'true');
      root.setAttribute('data-cawf-host-found', 'false');
      root.setAttribute('data-cawf-low-power', IS_LOW_POWER ? 'true' : 'false');
      root.innerHTML = `<div id="${IDS.timeLayer}" aria-hidden="true"><div id="${IDS.timeWash}" aria-hidden="true"></div>${getNightSkyLayerHtml()}<div id="${IDS.timeDust}" aria-hidden="true"></div></div><canvas id="${IDS.rainCanvas}" aria-hidden="true"></canvas><div id="${IDS.ambient}" aria-hidden="true"></div><div id="${IDS.underwaterLayer}" aria-hidden="true"><div class="cawf-uw-depth"></div><div class="cawf-uw-surface"></div><div class="cawf-uw-drift"></div><div class="cawf-uw-rays"><div></div><div></div></div><div class="cawf-uw-floor"><canvas id="${IDS.underwaterCanvas}" aria-hidden="true"></canvas></div><div class="cawf-uw-bubbles" aria-hidden="true"></div><div class="cawf-uw-vignette"></div></div><div id="${IDS.particles}"></div>`;
      document.body.appendChild(root);
    }

    if (!root.querySelector(`#${IDS.timeLayer}`)) {
      root.insertAdjacentHTML('afterbegin', `<div id="${IDS.timeLayer}" aria-hidden="true"><div id="${IDS.timeWash}" aria-hidden="true"></div>${getNightSkyLayerHtml()}<div id="${IDS.timeDust}" aria-hidden="true"></div></div>`);
    }

    state.root = root;
    root.setAttribute('data-cawf-low-power', IS_LOW_POWER ? 'true' : 'false');
    state.rainCanvas = root.querySelector(`#${IDS.rainCanvas}`);
    state.rainCtx = state.rainCanvas instanceof HTMLCanvasElement ? state.rainCanvas.getContext('2d') : null;
    state.timeLayer = root.querySelector(`#${IDS.timeLayer}`);
    if (state.timeLayer instanceof HTMLElement) {
      state.timeLayer.setAttribute('data-time-effect', state.activeTimeEffect || 'none');
      if (!state.timeLayer.querySelector(`#${IDS.timeWash}`)) {
        state.timeLayer.insertAdjacentHTML('afterbegin', `<div id="${IDS.timeWash}" aria-hidden="true"></div>`);
      }
      if (!state.timeLayer.querySelector(`#${IDS.nightSky}`)) {
        const dust = state.timeLayer.querySelector(`#${IDS.timeDust}`);
        if (dust instanceof HTMLElement) dust.insertAdjacentHTML('beforebegin', getNightSkyLayerHtml());
        else state.timeLayer.insertAdjacentHTML('beforeend', getNightSkyLayerHtml());
      }
      if (!state.timeLayer.querySelector(`#${IDS.timeDust}`)) {
        state.timeLayer.insertAdjacentHTML('beforeend', `<div id="${IDS.timeDust}" aria-hidden="true"></div>`);
      }
      state.timeWash = state.timeLayer.querySelector(`#${IDS.timeWash}`);
      state.nightSky = state.timeLayer.querySelector(`#${IDS.nightSky}`);
      if (!(state.nightSkyCanvas instanceof HTMLCanvasElement) || !state.nightSkyCanvas.isConnected) {
        state.nightSkyCanvas = null;
        state.nightSkyCtx = null;
        state.nightSkyNeedsRebuild = true;
      }
    }

    if (!root.querySelector(`#${IDS.underwaterLayer}`)) {
      const ambient = root.querySelector(`#${IDS.ambient}`);
      const html = `<div id="${IDS.underwaterLayer}" aria-hidden="true"><div class="cawf-uw-depth"></div><div class="cawf-uw-surface"></div><div class="cawf-uw-drift"></div><div class="cawf-uw-rays"><div></div><div></div></div><div class="cawf-uw-floor"><canvas id="${IDS.underwaterCanvas}" aria-hidden="true"></canvas></div><div class="cawf-uw-vignette"></div></div>`;
      if (ambient instanceof HTMLElement) ambient.insertAdjacentHTML('afterend', html);
      else root.insertAdjacentHTML('beforeend', html);
    }
    state.underwaterLayer = root.querySelector(`#${IDS.underwaterLayer}`);
    root.querySelectorAll('.cawf-uw-water, .cawf-uw-sand, .cawf-uw-bubbles').forEach(el => el.remove());

    const uwLayer = root.querySelector(`#${IDS.underwaterLayer}`);
    if (uwLayer instanceof HTMLElement && state.activeEffect === 'underwater') {
      let depth = uwLayer.querySelector(':scope > .cawf-uw-depth');
      if (!(depth instanceof HTMLElement)) {
        depth = document.createElement('div');
        depth.className = 'cawf-uw-depth';
        uwLayer.insertBefore(depth, uwLayer.firstChild);
      }

      let surface = uwLayer.querySelector(':scope > .cawf-uw-surface');
      if (!(surface instanceof HTMLElement)) {
        surface = document.createElement('div');
        surface.className = 'cawf-uw-surface';
        const depthNext = depth.nextSibling;
        if (depthNext) uwLayer.insertBefore(surface, depthNext);
        else uwLayer.appendChild(surface);
      }

      let drift = uwLayer.querySelector(':scope > .cawf-uw-drift');
      if (!(drift instanceof HTMLElement)) {
        drift = document.createElement('div');
        drift.className = 'cawf-uw-drift';
        if (surface && surface.nextSibling) uwLayer.insertBefore(drift, surface.nextSibling);
        else uwLayer.appendChild(drift);
      }
      const amount = normalizeChoice(state.settings.intensity, ['low', 'medium', 'high'], 'medium');
      const particleTarget = amount === 'high' ? 74 : amount === 'low' ? 32 : 52;
      if (drift.children.length !== particleTarget || drift.dataset.cawfAmount !== amount) {
        const frag = document.createDocumentFragment();
        const ratio = particleTarget / 62;
        const groups = [
          { cls: 'cawf-uw-particle', count: Math.max(8, Math.round(22 * ratio)), minSize: 3.6, maxSize: 6.9, minDur: 19, maxDur: 32, minAlpha: .24, maxAlpha: .48, minBlur: 0, maxBlur: .25 },
          { cls: 'cawf-uw-particle cawf-uw-particle-soft', count: Math.max(8, Math.round(21 * ratio)), minSize: 2.6, maxSize: 5.6, minDur: 23, maxDur: 38, minAlpha: .18, maxAlpha: .38, minBlur: .02, maxBlur: .42 },
          { cls: 'cawf-uw-particle cawf-uw-particle-small', count: Math.max(8, particleTarget - Math.max(8, Math.round(22 * ratio)) - Math.max(8, Math.round(21 * ratio))), minSize: 1.6, maxSize: 3.3, minDur: 27, maxDur: 44, minAlpha: .14, maxAlpha: .28, minBlur: .04, maxBlur: .55 }
        ];
        const rand = (min, max) => min + Math.random() * (max - min);
        for (const group of groups) {
          for (let i = 0; i < group.count; i += 1) {
            const el = document.createElement('span');
            el.className = group.cls;
            const dur = rand(group.minDur, group.maxDur);
            el.style.setProperty('--x', `${rand(2, 98).toFixed(2)}%`);
            el.style.setProperty('--y', `${rand(8, 96).toFixed(2)}%`);
            el.style.setProperty('--size', `${rand(group.minSize, group.maxSize).toFixed(2)}px`);
            el.style.setProperty('--alpha', rand(group.minAlpha, group.maxAlpha).toFixed(3));
            el.style.setProperty('--blur', `${rand(group.minBlur, group.maxBlur).toFixed(2)}px`);
            el.style.setProperty('--dur', `${dur.toFixed(2)}s`);
            el.style.setProperty('--delay', `${(-rand(0, dur)).toFixed(2)}s`);
            el.style.setProperty('--dx', `${rand(-4.0, 4.0).toFixed(2)}vw`);
            el.style.setProperty('--dy', `${rand(-13.5, -4.8).toFixed(2)}vh`);
            el.style.setProperty('--sway', `${rand(.7, 2.2).toFixed(2)}vw`);
            el.style.setProperty('--tilt-mid', `${rand(-3.6, 3.6).toFixed(2)}deg`);
            el.style.setProperty('--tilt-end', `${rand(-5.5, 5.5).toFixed(2)}deg`);
            el.style.setProperty('--scale-start', rand(.90, 1.02).toFixed(3));
            el.style.setProperty('--scale-end', rand(1.02, 1.18).toFixed(3));
            frag.appendChild(el);
          }
        }
        drift.dataset.cawfAmount = amount;
        drift.replaceChildren(frag);
      }

      let rays = uwLayer.querySelector(':scope > .cawf-uw-rays');
      if (!(rays instanceof HTMLElement)) {
        rays = document.createElement('div');
        rays.className = 'cawf-uw-rays';
        rays.innerHTML = '<div></div><div></div>';
        if (drift && drift.nextSibling) uwLayer.insertBefore(rays, drift.nextSibling);
        else uwLayer.appendChild(rays);
      } else if (rays.children.length < 2) {
        rays.innerHTML = '<div></div><div></div>';
      }

      let floor = uwLayer.querySelector(':scope > .cawf-uw-floor');
      if (!(floor instanceof HTMLElement)) {
        floor = document.createElement('div');
        floor.className = 'cawf-uw-floor';
        const vignette = uwLayer.querySelector(':scope > .cawf-uw-vignette');
        uwLayer.insertBefore(floor, vignette || null);
      }

      let canvas = root.querySelector(`#${IDS.underwaterCanvas}`);
      if (!(canvas instanceof HTMLCanvasElement)) {
        canvas = document.createElement('canvas');
        canvas.id = IDS.underwaterCanvas;
        canvas.setAttribute('aria-hidden', 'true');
      }
      if (canvas.parentElement !== floor) floor.appendChild(canvas);

      let vignette = uwLayer.querySelector(':scope > .cawf-uw-vignette');
      if (!(vignette instanceof HTMLElement)) {
        vignette = document.createElement('div');
        vignette.className = 'cawf-uw-vignette';
        uwLayer.appendChild(vignette);
      }

    }
    state.underwaterCanvas = root.querySelector(`#${IDS.underwaterCanvas}`);
    state.ambient = root.querySelector(`#${IDS.ambient}`);
    state.particles = root.querySelector(`#${IDS.particles}`);
    return root;
  }

  function ensureFloatingButton() {
    let button = document.getElementById(IDS.button);
    if (!button) {
      button = document.createElement('button');
      button.id = IDS.button;
      button.type = 'button';
      button.title = '날씨/환경 이펙트 설정 (길게 눌러 이동)';
      button.textContent = '🌧️';
      document.body.appendChild(button);
    }
    state.button = button;
    button.setAttribute('aria-controls', IDS.panel);
    button.setAttribute('aria-label', '날씨·시간대 FX 설정');
    button.setAttribute('aria-expanded', String(state.panel?.getAttribute('data-open') === 'true'));
    syncGlassTheme();
    setupFloatingButtonInteractions(button);
    restoreFloatingButtonPosition();
    syncFloatingButton();
  }

  function getFloatingButtonSize() {
    const rect = state.button?.getBoundingClientRect?.();
    const w = rect && rect.width ? rect.width : 44;
    const h = rect && rect.height ? rect.height : 44;
    return { w, h };
  }

  function clampFloatingButtonPos(left, top) {
    const { w, h } = getFloatingButtonSize();
    const margin = 8;
    const maxLeft = Math.max(margin, (window.innerWidth || 0) - w - margin);
    const maxTop = Math.max(margin, (window.innerHeight || 0) - h - margin);
    return {
      left: Math.min(Math.max(margin, left), maxLeft),
      top: Math.min(Math.max(margin, top), maxTop)
    };
  }

  function applyFloatingButtonPos(left, top, save = false) {
    const button = state.button;
    if (!(button instanceof HTMLElement)) return;
    const pos = clampFloatingButtonPos(left, top);
    button.style.left = `${pos.left}px`;
    button.style.top = `${pos.top}px`;
    button.style.right = 'auto';
    button.style.bottom = 'auto';
    state.buttonPos = pos;
    positionGlassPanel();
    if (save) {
      try { localStorage.setItem(FLOATING_BTN_POS_KEY, JSON.stringify(pos)); } catch (_) {}
    }
  }

  function restoreFloatingButtonPosition() {
    const button = state.button;
    if (!(button instanceof HTMLElement)) return;

    const saved = safeJsonParse(localStorage.getItem(FLOATING_BTN_POS_KEY), null);
    if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
      applyFloatingButtonPos(saved.left, saved.top, false);
    } else {
      // 기존 CSS 기본 위치(right:18px, bottom:82px)를 px 좌표로 환산해 첫 위치 설정.
      const { w, h } = getFloatingButtonSize();
      const left = (window.innerWidth || 0) - w - 18;
      const top = (window.innerHeight || 0) - h - 16;
      applyFloatingButtonPos(left, top, false);
    }
    bumpFloatingButtonActivity();
  }

  function bumpFloatingButtonActivity() {
    const button = state.button;
    if (!(button instanceof HTMLElement)) return;
    button.setAttribute('data-faded', 'false');
    clearTimeout(state.buttonFadeTimer);
    state.buttonFadeTimer = window.setTimeout(() => {
      if (state.buttonDragging || state.panel?.getAttribute('data-open') === 'true') return;
      button.setAttribute('data-faded', 'true');
    }, 1000);
  }

  function setupFloatingButtonInteractions(button) {
    if (!(button instanceof HTMLElement)) return;
    if (button.getAttribute('data-cawf-drag-bound') === 'true') return;
    button.setAttribute('data-cawf-drag-bound', 'true');

    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;
    let moved = false;
    const DRAG_THRESHOLD = 5;

    button.addEventListener('pointerdown', event => {
      pointerId = event.pointerId;
      const rect = button.getBoundingClientRect();
      originLeft = rect.left;
      originTop = rect.top;
      startX = event.clientX;
      startY = event.clientY;
      moved = false;
      state.buttonDragging = false;
      bumpFloatingButtonActivity();
      try { button.setPointerCapture(pointerId); } catch (_) {}
    });

    button.addEventListener('pointermove', event => {
      if (pointerId === null || event.pointerId !== pointerId) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      moved = true;
      state.buttonDragging = true;
      button.setAttribute('data-faded', 'false');
      applyFloatingButtonPos(originLeft + dx, originTop + dy, false);
    });

    function endDrag(event) {
      if (pointerId === null || (event && event.pointerId !== pointerId)) return;
      try { button.releasePointerCapture(pointerId); } catch (_) {}
      pointerId = null;
      if (moved) {
        const rect = button.getBoundingClientRect();
        applyFloatingButtonPos(rect.left, rect.top, true);
      }
      state.buttonDragging = false;
      bumpFloatingButtonActivity();
    }

    button.addEventListener('pointerup', event => {
      const wasMoved = moved;
      endDrag(event);
      // 끌지 않았을 때만 클릭(패널 열기)으로 처리.
      if (!wasMoved) togglePanel();
    });

    button.addEventListener('pointercancel', endDrag);
    button.addEventListener('mouseenter', bumpFloatingButtonActivity);
    button.addEventListener('focus', bumpFloatingButtonActivity);
  }

  function getPanelKeywordDrafts(panel = state.panel) {
    if (!panel) return {};
    if (!panel.__cawfKeywordDrafts || typeof panel.__cawfKeywordDrafts !== 'object') {
      panel.__cawfKeywordDrafts = {};
    }
    return panel.__cawfKeywordDrafts;
  }

  function stashActiveKeywordDraft(panel = state.panel) {
    if (!panel) return;
    const textarea = panel.querySelector('[data-cawf-keyword-editor]');
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    const key = textarea.getAttribute('data-cawf-keywords');
    if (!key || !Object.prototype.hasOwnProperty.call(state.settings, key)) return;
    getPanelKeywordDrafts(panel)[key] = textarea.value;
  }

  function selectPanelKeywordEffect(effect, options = {}) {
    const panel = state.panel;
    if (!panel) return;
    const normalized = Object.prototype.hasOwnProperty.call(EFFECT_KEYWORD_FIELDS, effect) ? effect : 'rain';
    if (options.stash !== false) stashActiveKeywordDraft(panel);

    panel.dataset.cawfKeywordEffect = normalized;
    panel.querySelectorAll('[data-cawf-keyword-chip]').forEach(button => {
      if (!(button instanceof HTMLElement)) return;
      button.setAttribute('data-on', button.getAttribute('data-value') === normalized ? 'true' : 'false');
    });

    const textarea = panel.querySelector('[data-cawf-keyword-editor]');
    const field = EFFECT_KEYWORD_FIELDS[normalized];
    if (textarea instanceof HTMLTextAreaElement && field) {
      textarea.setAttribute('data-cawf-keywords', field);
      const drafts = getPanelKeywordDrafts(panel);
      textarea.value = Object.prototype.hasOwnProperty.call(drafts, field)
        ? String(drafts[field] ?? '')
        : String(state.settings[field] || '');
    }

    syncGlassKeywords(panel);
    const caption = panel.querySelector('[data-cawf-keyword-caption]');
    if (caption instanceof HTMLElement) {
      caption.textContent = `${EFFECT_LABELS[normalized] || '효과'} 자동 감지 키워드`;
    }
  }

  function setPanelTab(page) {
    const panel = state.panel;
    if (!panel) return;
    const normalized = ['fx', 'time', 'kw', 'snd'].includes(page) ? page : 'fx';
    if (panel.dataset.cawfPage === 'kw' && normalized !== 'kw') stashActiveKeywordDraft(panel);
    panel.dataset.cawfPage = normalized;
    panel.style.setProperty('--idx', ['fx', 'time', 'kw', 'snd'].indexOf(normalized));
    panel.querySelector('.cawfg-body').scrollTop = 0;
    panel.querySelector('.cawfg-foot').dataset.kw = String(normalized === 'kw');
    panel.querySelector('[data-foot="kw"]').dataset.on = String(normalized === 'kw');

    panel.querySelectorAll('[data-cawf-tab]').forEach(button => {
      if (!(button instanceof HTMLElement)) return;
      const active = button.getAttribute('data-cawf-tab') === normalized;
      button.setAttribute('data-on', active ? 'true' : 'false');
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.tabIndex = active ? 0 : -1;
    });
    panel.querySelectorAll('[data-cawf-page]').forEach(pageEl => {
      if (!(pageEl instanceof HTMLElement)) return;
      const active = pageEl.getAttribute('data-cawf-page') === normalized;
      pageEl.setAttribute('data-on', active ? 'true' : 'false');
      pageEl.hidden = !active;
    });
  }

  function clearPanelKeywordDrafts() {
    const panel = state.panel;
    if (!panel) return;
    panel.__cawfKeywordDrafts = {};
    selectPanelKeywordEffect(panel.dataset.cawfKeywordEffect || 'rain', { stash: false });
  }


  // v2.6.4: glass presentation adapter; existing engine and storage remain authoritative.
  const glassUI = (() => {
const ICON = {
  close:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  refresh:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"/><path d="M13.6 2.6v3.2h-3.2"/></svg>',
  gear:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="2.3"/><path d="M8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M3.6 12.4l1.2-1.2M11.2 4.8l1.2-1.2"/></svg>',
  info:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 7.3v4M8 4.9v.2"/></svg>',
  lock:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="3" y="7" width="10" height="7" rx="2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>',
  unlock:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><rect x="3" y="7" width="10" height="7" rx="2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 4.9-.7"/></svg>',
  check:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>',
  spk:'<svg viewBox="0 0 12 12" fill="currentColor"><path d="M1.5 4.3h2L6.6 2v8L3.5 7.7h-2z"/><path d="M8.4 3.9a3 3 0 0 1 0 4.2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  undo:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3.5L2.5 6 5 8.5"/><path d="M2.8 6h6.7a3.8 3.8 0 0 1 0 7.5H6"/></svg>',
  save:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>'
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const EFFECTS = [
  {id:'rain',label:'비',icon:'🌧️',snd:'빗소리'},
  {id:'snow',label:'눈',icon:'❄️'},
  {id:'fog',label:'안개',icon:'🌫️'},
  {id:'sandstorm',label:'모래바람',icon:'🏜️'},
  {id:'sunlight',label:'햇빛',icon:'☀️',tag:'낮',when:'새벽·초저녁·밤에는 숨겨져요'},
  {id:'sakura',label:'벚꽃잎',icon:'🌸'},
  {id:'leaves',label:'낙엽',icon:'🍂'},
  {id:'greenLeaves',label:'나뭇잎',icon:'🍃'},
  {id:'feathers',label:'깃털',icon:'🪶'},
  {id:'butterflies',label:'나비',icon:'🦋'},
  {id:'fireflies',label:'반딧불',icon:'✨',snd:'풀벌레'},
  {id:'bokeh',label:'보케',icon:'🟠',tag:'☾',when:'새벽·노을·초저녁·밤에만 보여요'},
  {id:'candlelight',label:'촛불',icon:'🕯️'},
  {id:'spellcast',label:'마법진',icon:'🌀',snd:'마법 폭발'},
  {id:'mana',label:'마나',icon:'🔮'},
  {id:'aurora',label:'오로라',icon:'💫'},
  {id:'galaxy',label:'은하수',icon:'🌌',tag:'PC',pc:true},
  {id:'fireworks',label:'불꽃놀이',icon:'🎆',snd:'불꽃놀이',tag:'☾',when:'초저녁·밤에만 보여요'},
  {id:'shore',label:'파도',icon:'🌊',snd:'파도'},
  {id:'underwater',label:'수중',icon:'🫧',snd:'수중음',tag:'PC',pc:true,note:'켜져 있는 동안 시간대 배경을 가려요'}
];
const EF = Object.fromEntries(EFFECTS.map(e => [e.id, e]));
const PRIORITY = SCREEN_EFFECT_PRIORITY;
const CLUSTERS = [
  {label:'날씨',span:5,ids:['rain','snow','fog','sandstorm','sunlight']},
  {label:'흩날림',span:5,ids:['sakura','leaves','greenLeaves','feathers','butterflies']},
  {label:'불빛',span:3,ids:['fireflies','bokeh','candlelight']},
  {label:'마법',span:2,ids:['spellcast','mana']},
  {label:'하늘',span:3,ids:['aurora','galaxy','fireworks']},
  {label:'물',span:2,ids:['shore','underwater']}
];
const TIMES = [
  {id:'dawn',label:'새벽',icon:'🌅',range:'05:00–06:59',sky:'linear-gradient(180deg,#060e2a 0%,#142e60 38%,#585084 56%,#c6788e 74%,#ffaa78 90%,#ffd6b8 100%)',stars:true},
  {id:'morning',label:'오전',icon:'🌤️',range:'07:00–11:59',sky:'linear-gradient(180deg,#4e8ed0 0%,#acd6ea 42%,#eaf4e8 72%,#fff4d4 100%)'},
  {id:'afternoon',label:'오후',icon:'☀️',range:'12:00–16:59',sky:'linear-gradient(180deg,#4a96d8 0%,#aad2e4 44%,#e6eee0 72%,#fff0d2 100%)'},
  {id:'sunset',label:'노을',icon:'🌇',range:'17:00–19:30',sky:'linear-gradient(180deg,#7888ce 0%,#8e7ad6 18%,#ac72cc 34%,#d684a0 50%,#ffb074 66%,#ff8450 80%,#ffcca0 100%)'},
  {id:'twilight',label:'초저녁',icon:'🌆',range:'19:31–20:59',sky:'linear-gradient(180deg,#141d49 0%,#1f2c66 24%,#373d7e 44%,#65488b 62%,#b55b8b 80%,#f48f77 100%)',stars:true},
  {id:'night',label:'밤',icon:'🌙',range:'21:00–04:59',sky:'linear-gradient(180deg,#060a1e 0%,#0a122c 50%,#0c1a38 100%)',stars:true}
];
const TM = Object.fromEntries(TIMES.map(t => [t.id, t]));
const RIBBON = [['night',300],['dawn',120],['morning',300],['afternoon',300],['sunset',151],['twilight',89],['night',180]];
const sw = (key, label, cls = '') => `<button type="button" class="cawfg-sw ${cls}" role="switch" aria-checked="false" data-cawf-toggle="${key}" aria-label="${label}"><i></i></button>`;
const seg = (key, opts, cls = '') => `<div class="cawfg-seg ${cls}" data-seg="${key}" style="--n:${opts.length}" role="group"><i class="cawfg-seg-ind"></i>${opts.map(o => `<button type="button" data-seg-v="${o[0]}" ${key !== 'kwMode' ? `data-cawf-chip="${key}" data-value="${o[0]}"` : ''} aria-pressed="false">${o[1]}</button>`).join('')}</div>`;
const range = (key, label, min, max, step, tick = '') => `<div class="cawfg-rrow"><span class="cawfg-rl">${label}</span><span class="cawfg-rwrap"${tick ? ` data-tick style="--tick:${tick}"` : ''}><input type="range" class="cawfg-range" data-cawf-range="${key}" min="${min}" max="${max}" step="${step}" aria-label="${label}"></span><output class="cawfg-out" data-cawf-output="${key}"></output></div>`;
function chip(e){
  return `<button type="button" class="cawfg-chip" data-ripple data-cawf-chip="effect" data-value="${e.id}" aria-pressed="false" title="${e.label}${e.snd ? ` · ${e.snd} 연동` : ''}">`
    + (e.snd ? `<span class="cawfg-chip-snd">${ICON.spk}</span>` : '')
    + (e.tag ? `<span class="cawfg-chip-tag">${e.tag}</span>` : '')
    + `<span class="cawfg-chip-ico">${e.icon}</span><span class="cawfg-chip-lbl">${e.label}</span></button>`;
}
function fxGrid(){
  let h = '';
  [[0],[1],[2,3],[4,5]].forEach(row => {
    row.forEach(i => { h += `<div class="cawfg-cap" style="grid-column:span ${CLUSTERS[i].span}">${CLUSTERS[i].label}</div>`; });
    row.forEach(i => CLUSTERS[i].ids.forEach(id => { h += chip(EF[id]); }));
  });
  return `<div class="cawfg-fxgrid">${h}</div>`;
}
function panelHTML(){
  const ribbon = RIBBON.map(([id, w]) => `<button type="button" class="cawfg-rib-seg" data-cawf-chip="timeBackground" data-value="${id}" style="--w:${w}" title="${TM[id].label} ${TM[id].range}" aria-pressed="false"><span>${w >= 89 ? TM[id].icon : ''}</span></button>`).join('');
  const periods = TIMES.map(t => `<button type="button" class="cawfg-period" data-ripple data-cawf-chip="timeBackground" data-value="${t.id}" style="--sky:${t.sky}" aria-pressed="false"><span class="cawfg-period-ico">${t.icon}</span><span class="cawfg-ck">${ICON.check}</span><span class="cawfg-period-t"><b>${t.label}</b><small>${t.range}</small></span></button>`).join('');
  const kwChips = PRIORITY.map(id => `<button type="button" class="cawfg-k" data-ripple data-cawf-keyword-chip data-value="${id}" aria-pressed="false"><span class="i">${EF[id].icon}</span><span class="l">${EF[id].label}</span><span class="n" data-kw-n="${id}"></span></button>`).join('');
  const mixer = `            <details class="cawf-sound-card cawfg-mx">
              <summary class="cawf-sound-summary cawfg-mx-row"><span class="cawfg-mx-ico">🌧️</span><span class="cawfg-mx-n">빗소리</span><input type="range" class="cawfg-range" min="0" max="1" step="0.01" data-cawf-range="audioVolume" aria-label="빗소리 볼륨"><span class="cawfg-out" data-cawf-output="audioVolume"></span><button type="button" class="cawfg-ib sm" data-cawf-sound-gear aria-label="빗소리 URL 설정">⚙</button></summary>
              <div class="cawfg-url"><small data-cawf-audio-url-status>기본 Pixabay 출처 페이지를 사용해요.</small><input type="text" spellcheck="false" placeholder="https://.../rain.mp3" data-cawf-audio-url><div class="cawfg-url-btns"><button type="button" class="cawfg-btn sm primary" data-cawf-apply-audio-url>URL 적용</button><button type="button" class="cawfg-btn sm" data-cawf-clear-audio-url>제거</button></div></div>
            </details>

            <details class="cawf-sound-card cawfg-mx">
              <summary class="cawf-sound-summary cawfg-mx-row"><span class="cawfg-mx-ico">✨</span><span class="cawfg-mx-n">풀벌레</span><input type="range" class="cawfg-range" min="0" max="1" step="0.01" data-cawf-range="cricketAudioVolume" aria-label="풀벌레 볼륨"><span class="cawfg-out" data-cawf-output="cricketAudioVolume"></span><button type="button" class="cawfg-ib sm" data-cawf-sound-gear aria-label="풀벌레 URL 설정">⚙</button></summary>
              <div class="cawfg-url"><small data-cawf-cricket-audio-url-status>기본 Pixabay Crickets 출처 페이지를 사용해요.</small><input type="text" spellcheck="false" placeholder="https://.../crickets.mp3" data-cawf-cricket-audio-url><div class="cawfg-url-btns"><button type="button" class="cawfg-btn sm primary" data-cawf-apply-cricket-audio-url>URL 적용</button><button type="button" class="cawfg-btn sm" data-cawf-clear-cricket-audio-url>제거</button></div></div>
            </details>

            <details class="cawf-sound-card cawfg-mx">
              <summary class="cawf-sound-summary cawfg-mx-row"><span class="cawfg-mx-ico">🌊</span><span class="cawfg-mx-n">파도</span><input type="range" class="cawfg-range" min="0" max="1" step="0.01" data-cawf-range="waveAudioVolume" aria-label="파도소리 볼륨"><span class="cawfg-out" data-cawf-output="waveAudioVolume"></span><button type="button" class="cawfg-ib sm" data-cawf-sound-gear aria-label="파도소리 URL 설정">⚙</button></summary>
              <div class="cawfg-url"><small data-cawf-wave-audio-url-status>기본 Pixabay Gentle Ocean Shore Waves 출처 페이지를 사용해요.</small><input type="text" spellcheck="false" placeholder="https://.../waves.mp3" data-cawf-wave-audio-url><div class="cawfg-url-btns"><button type="button" class="cawfg-btn sm primary" data-cawf-apply-wave-audio-url>URL 적용</button><button type="button" class="cawfg-btn sm" data-cawf-clear-wave-audio-url>제거</button></div></div>
            </details>

            <details class="cawf-sound-card cawfg-mx">
              <summary class="cawf-sound-summary cawfg-mx-row"><span class="cawfg-mx-ico">🌀</span><span class="cawfg-mx-n">마법 폭발</span><input type="range" class="cawfg-range" min="0" max="1" step="0.01" data-cawf-range="spellAudioVolume" aria-label="마법 폭발 효과음 볼륨"><span class="cawfg-out" data-cawf-output="spellAudioVolume"></span><button type="button" class="cawfg-ib sm" data-cawf-sound-gear aria-label="마법 폭발 효과음 출처">ⓘ</button></summary>
              <div class="cawfg-url"><small>내장 효과음 · “magic spell” by KoiRoylers · Pixabay Content License<br><a href="${PIXABAY_SPELL_SOURCE_PAGE}" target="_blank" rel="noopener noreferrer">Pixabay 원문 출처 보기</a></small></div>
            </details>

            <details class="cawf-sound-card cawfg-mx">
              <summary class="cawf-sound-summary cawfg-mx-row"><span class="cawfg-mx-ico">🎆</span><span class="cawfg-mx-n">불꽃놀이</span><input type="range" class="cawfg-range" min="0" max="1" step="0.01" data-cawf-range="fireworksAudioVolume" aria-label="불꽃놀이 볼륨"><span class="cawfg-out" data-cawf-output="fireworksAudioVolume"></span><button type="button" class="cawfg-ib sm" data-cawf-sound-gear aria-label="불꽃놀이 URL 설정">⚙</button></summary>
              <div class="cawfg-url"><small data-cawf-fireworks-audio-url-status>기본 Pixabay Firework Display 2 출처 페이지를 사용해요.</small><input type="text" spellcheck="false" placeholder="https://.../fireworks.mp3" data-cawf-fireworks-audio-url><div class="cawfg-url-btns"><button type="button" class="cawfg-btn sm primary" data-cawf-apply-fireworks-audio-url>URL 적용</button><button type="button" class="cawfg-btn sm" data-cawf-clear-fireworks-audio-url>제거</button></div></div>
            </details>

            <details class="cawf-sound-card cawfg-mx">
              <summary class="cawf-sound-summary cawfg-mx-row"><span class="cawfg-mx-ico">🫧</span><span class="cawfg-mx-n">수중음</span><input type="range" class="cawfg-range" min="0" max="1" step="0.01" data-cawf-range="underwaterAudioVolume" aria-label="수중음 볼륨"><span class="cawfg-out" data-cawf-output="underwaterAudioVolume"></span><button type="button" class="cawfg-ib sm" data-cawf-sound-gear aria-label="수중음 URL 설정">⚙</button></summary>
              <div class="cawfg-url"><small data-cawf-underwater-audio-url-status>기본 Pixabay Underwater 출처 페이지를 사용해요.</small><input type="text" spellcheck="false" placeholder="https://.../underwater.mp3" data-cawf-underwater-audio-url><div class="cawfg-url-btns"><button type="button" class="cawfg-btn sm primary" data-cawf-apply-underwater-audio-url>URL 적용</button><button type="button" class="cawfg-btn sm" data-cawf-clear-underwater-audio-url>제거</button></div></div>
            </details>
`;

  return `
  
  <header class="cawfg-head stg" style="--i:0">
    <div class="cawfg-app" aria-hidden="true"><span data-app-ico>🌧️</span></div>
    <div class="cawfg-title"><strong>날씨·시간대 FX</strong><small>최신 AI 로그를 읽고 자동으로 바꿔요 · v2.6.4</small></div>
    ${sw('enabled', '전체 사용', 'lg')}
    <button type="button" class="cawfg-ib" data-cawf-close aria-label="설정 닫기">${ICON.close}</button>
  </header>

  <section class="cawfg-now stg" style="--i:1" data-now aria-live="polite">
    <div class="cawfg-nt" data-nt="fx"><span class="cawfg-nt-ico" data-nt-ico>🌧️</span><span class="cawfg-nt-t"><b data-nt-val></b><small data-nt-sub></small></span></div>
    <div class="cawfg-nt" data-nt="time"><span class="cawfg-nt-ico" data-nt-ico></span><span class="cawfg-nt-t"><b data-nt-val></b><small data-nt-sub></small></span></div>
    <div class="cawfg-nt" data-nt="snd"><span class="cawfg-nt-ico" data-nt-ico><span class="cawfg-eq" data-nt-eq><i></i><i></i><i></i></span></span><span class="cawfg-nt-t"><b data-nt-val></b><small data-nt-sub></small></span></div>
    <button type="button" class="cawfg-ib sm cawfg-rescan" data-cawf-rescan aria-label="로그 다시 읽기" title="로그 다시 읽기">${ICON.refresh}</button>
  </section>

  <div class="cawfg-quick stg" style="--i:2" data-master-dim>
    <div class="cawfg-q"><span>🪄 자동 감지</span>${sw('autoDetect', '자동 감지', 'sm')}</div>
    <div class="cawfg-q"><span>⚡ 절전</span>${seg('powerSaver', [['auto','자동'],['on','켬'],['off','끔']], 'sm')}</div>
  </div>

  <nav class="cawfg-tabs stg" style="--i:3" role="tablist" aria-label="설정 탭">
    <i class="cawfg-tab-ind"></i>
    <button type="button" class="cawfg-tab" role="tab" data-cawf-tab="fx" aria-selected="true">화면</button>
    <button type="button" class="cawfg-tab" role="tab" data-cawf-tab="time" aria-selected="false">시간대</button>
    <button type="button" class="cawfg-tab" role="tab" data-cawf-tab="kw" aria-selected="false">키워드<span class="mark"></span></button>
    <button type="button" class="cawfg-tab" role="tab" data-cawf-tab="snd" aria-selected="false">사운드<span class="cawfg-eq" data-on="true"><i></i><i></i><i></i></span></button>
  </nav>

  <div class="cawfg-body stg" style="--i:4" data-master-dim>
    <section class="cawfg-page" data-cawf-page="fx" role="tabpanel">
      <div class="cawfg-sh"><b>화면 이펙트</b><small data-fx-meta></small>${sw('screenEffectEnabled', '화면 이펙트 사용')}</div>
      <div data-dim="screenEffectEnabled">
        <div class="cawfg-mode">
          <button type="button" class="cawfg-m" data-ripple data-cawf-chip="effect" data-value="auto" aria-pressed="false"><span>🪄</span><div><b>자동</b><small data-auto-sub></small></div></button>
          <button type="button" class="cawfg-m" data-ripple data-cawf-chip="effect" data-value="none" aria-pressed="false"><span>🚫</span><div><b>끄기</b><small>화면 효과 없음</small></div></button>
        </div>
        ${fxGrid()}
        <div class="cawfg-detail" data-fx-detail><span class="cawfg-detail-ico" data-d-ico></span><div class="cawfg-detail-m"><b data-d-name></b><p data-d-info></p></div><span class="cawfg-pill" data-d-pill></span></div>
        <div class="cawfg-card">
          <div class="cawfg-row"><span class="cawfg-rl" data-cawf-intensity-label>효과 양</span>${seg('intensity', [['low','적게'],['medium','보통'],['high','많이']])}</div>
          ${range('effectOpacity', '투명도', .12, 1.5, .01)}
          ${range('effectSpeed', '속도', .2, 1.75, .01)}
          <div class="cawfg-acc" data-cawf-galaxy-options hidden><div>
            <div class="cawfg-acc-h">🌌 은하수 전용</div>
            <div class="cawfg-row"><span class="cawfg-rl">유성<small>5~11초 간격으로 지나가요</small></span>${sw('galaxyMeteors', '은하수 유성')}</div>
            <div class="cawfg-row"><span class="cawfg-rl">마우스 시차<small>마우스를 따라 별의 깊이가 움직여요</small></span>${sw('galaxyParallax', '은하수 마우스 시차')}</div>
          </div></div>
        </div>
      </div>
    </section>

    <section class="cawfg-page" data-cawf-page="time" role="tabpanel">
      <div class="cawfg-sh"><b>시간대 배경</b><small data-time-meta></small>${sw('timeBackgroundEnabled', '시간대 배경 사용')}</div>
      <div data-dim="timeBackgroundEnabled">
        <div class="cawfg-rib">
          <div class="cawfg-rib-bar">${ribbon}</div>
          <span class="cawfg-rib-mark" data-rib-mark><b data-rib-time></b></span>
          <div class="cawfg-rib-ticks"><span>0시</span><span>6시</span><span>12시</span><span>18시</span><span>24시</span></div>
        </div>
        <div class="cawfg-mode">
          <button type="button" class="cawfg-m" data-ripple data-cawf-chip="timeBackground" data-value="auto" aria-pressed="false"><span>🪄</span><div><b>자동</b><small data-tauto-sub></small></div></button>
          <button type="button" class="cawfg-m" data-ripple data-cawf-chip="timeBackground" data-value="none" aria-pressed="false"><span>🚫</span><div><b>끄기</b><small>배경 없음</small></div></button>
        </div>
        <div class="cawfg-periods">${periods}</div>
        <div class="cawfg-card">
          <div class="cawfg-row"><span class="cawfg-rl">밤하늘 별똥별<small>밤 배경에서만 떨어져요</small></span>${sw('nightMeteors', '밤하늘 별똥별')}</div>
          ${range('timeOpacity', '투명도', .12, 2, .01, '46.8%')}
          ${range('timeSpeed', '속도', .55, 1.75, .01)}
        </div>
        <p style="margin:8px 4px 0;font-size:9.5px;color:var(--ink-3)">100%를 넘겨 배경의 밝기와 대비를 더 강하게 조절할 수 있어요.</p>
      </div>
    </section>

    <section class="cawfg-page" data-cawf-page="kw" role="tabpanel">
      <div class="cawfg-sh"><b>자동 감지 키워드</b><small>위쪽 효과일수록 우선으로 켜져요</small></div>
      <div class="cawfg-kwgrid">${kwChips}</div>
      <div class="cawfg-ed">
        <div class="cawfg-ed-h"><span class="i" data-ed-ico></span><b data-cawf-keyword-caption></b><small data-ed-count></small>
          ${seg('kwMode', [['tags','태그'],['raw','원문']], 'sm')}
          <button type="button" class="cawfg-link" data-kw-default title="이 효과만 기본 키워드로">기본값</button>
        </div>
        <div class="cawfg-tags" data-kw-tags></div>
        <textarea class="cawfg-raw" data-cawf-keyword-editor spellcheck="false" hidden placeholder="쉼표나 줄바꿈으로 구분해요"></textarea>
      </div>
      <div class="cawfg-test">
        <label>문장으로 테스트</label>
        <input type="text" data-kw-test placeholder="예: 창밖으로 빗소리가 들렸다 | 21:30" spellcheck="false">
        <div class="cawfg-test-out" data-kw-test-out></div>
      </div>
      <div class="cawfg-card">
        <div class="cawfg-row"><span class="cawfg-rl">키워드가 없을 때</span>${seg('keywordFallback', [['off','효과 끄기'],['keep','마지막 유지']], 'sm')}</div>
        <div class="cawfg-row"><span class="cawfg-rl">코드블록도 읽기<small>상태창 같은 코드블록 글도 감지에 포함</small></span>${sw('includeCodeBlocksInDetection', '코드블록도 읽기')}</div>
      </div>
    </section>

    <section class="cawfg-page" data-cawf-page="snd" role="tabpanel">
      <div class="cawfg-sh"><b>사운드</b><small>효과에 맞춰 자동으로 켜고 꺼요</small>${sw('soundEnabled', '사운드 사용')}</div>
      <div data-dim="soundEnabled">
        <div class="cawfg-lock" data-lock>
          <span class="cawfg-lock-ico" data-lock-ico>${ICON.lock}</span>
          <span class="cawfg-lock-t"><b data-lock-title></b><small data-lock-sub></small></span>
          <button type="button" class="cawfg-btn sm primary" data-cawf-unlock-audio>소리 허용</button>
        </div>
        <div class="cawfg-tgrid">
          <div class="cawfg-tt"><span><b>효과와 연동</b><small>맞는 효과일 때만 재생</small></span>${sw('audioFollowEffect', '효과와 연동', 'sm')}</div>
          <div class="cawfg-tt"><span><b>숨김 중 재생</b><small>다른 탭을 보는 동안에도</small></span>${sw('audioWhileHidden', '탭 숨김 중 재생', 'sm')}</div>
        </div>
        <div class="cawfg-mixer">${mixer}</div>
      </div>
    </section>
  </div>

  <footer class="cawfg-foot stg" style="--i:5">
    <button type="button" class="cawfg-btn sm" data-ripple data-cawf-reset><span data-reset-lbl>초기값</span><i class="bar"></i></button>
    <span class="cawfg-saved" data-saved>${ICON.check}<span>바뀌면 바로 저장돼요</span></span>
    <div data-foot="kw">
      <button type="button" class="cawfg-btn sm" data-ripple data-kw-discard>${ICON.undo}되돌리기</button>
      <button type="button" class="cawfg-btn sm primary" data-ripple data-cawf-save-keywords>${ICON.save}저장하고 다시 읽기<span class="cnt" data-kw-dirty-n>0</span></button>
    </div>
  </footer>`;
}

return { panelHTML, EF, TM, ICON, esc };
})();

  let glassThemeObserver = null;
  function positionGlassPanel() {
    const panel = state.panel, button = state.button;
    if (!panel || panel.getAttribute('data-open') !== 'true' || !button) return;
    const viewport = window.visualViewport;
    const vw = viewport?.width || innerWidth, vh = viewport?.height || innerHeight;
    const vx = viewport?.offsetLeft || 0, vy = viewport?.offsetTop || 0;
    const b = button.getBoundingClientRect();
    const width = Math.min(372, vw - 16);
    let top, available;
    const above = b.top - vy - 20, below = vy + vh - b.bottom - 20;
    if (above >= Math.min(420, vh - 88)) {
      available = Math.min(700, above); top = b.top - 12 - available;
    } else if (below >= Math.min(420, vh - 88)) {
      available = Math.min(700, below); top = b.bottom + 12;
    } else {
      available = Math.min(700, vh - 16); top = vy + 8;
    }
    let left = Math.max(vx + 8, Math.min(b.right - width, vx + vw - width - 8));
    // A button saved midway down the screen gets a side-by-side panel where space allows.
    if (top < b.bottom && top + available > b.top) {
      if (b.left - vx >= width + 20) left = b.left - width - 12;
      else if (vx + vw - b.right >= width + 20) left = b.right + 12;
      else {
        const sideSpace = Math.max(above, below);
        if (sideSpace >= 340) {
          available = sideSpace; top = above >= below ? vy + 8 : b.bottom + 12;
        }
        // On a narrow screen with a centrally saved button, keep the full panel usable.
        // Its own close control remains accessible even when there is no room beside the button.
      }
    }
    Object.assign(panel.style, {left:`${left}px`,right:'auto',top:`${top}px`,bottom:'auto',width:`${width}px`,maxHeight:`${available}px`});
  }
  function syncGlassTheme() {
    const nodes = [document.documentElement, document.body].filter(Boolean);
    const explicit = nodes.map(n => n.getAttribute('data-theme') || n.getAttribute('data-color-mode') || (n.classList.contains('dark') ? 'dark' : n.classList.contains('light') ? 'light' : '')).find(v => v === 'dark' || v === 'light');
    const theme = explicit || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    [state.panel, state.button].forEach(n => n?.setAttribute('data-theme', theme));
    if (!glassThemeObserver) {
      glassThemeObserver = new MutationObserver(syncGlassTheme);
      nodes.forEach(n => glassThemeObserver.observe(n, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-color-mode'] }));
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncGlassTheme);
    }
  }

  function syncGlassRanges(panel) {
    panel.querySelectorAll('[data-cawf-range]').forEach(input => {
      const key = input.dataset.cawfRange;
      const value = document.activeElement === input ? Number(input.value) : Number(state.settings[key]);
      input.style.setProperty('--p', `${Math.max(0, Math.min(100, (value - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100))}%`);
    });
  }

  function glassKeywordText(panel, effect) {
    const key = EFFECT_KEYWORD_FIELDS[effect];
    const drafts = getPanelKeywordDrafts(panel);
    return Object.prototype.hasOwnProperty.call(drafts, key) ? drafts[key] : state.settings[key] || '';
  }

  function syncGlassKeywords(panel, renderTags = true) {
    const effect = panel.dataset.cawfKeywordEffect || 'rain';
    const tags = parseKeywordText(glassKeywordText(panel, effect));
    const mode = panel.dataset.glassKeywordMode || 'tags';
    panel.querySelector('[data-cawf-keyword-editor]').hidden = mode !== 'raw';
    const box = panel.querySelector('[data-kw-tags]');
    box.hidden = mode !== 'tags';
    if (renderTags) {
      box.replaceChildren();
      tags.forEach((tag, i) => {
        const span = document.createElement('span'); span.className = 'cawfg-tag';
        span.append(document.createTextNode(tag));
        const button = document.createElement('button'); button.type = 'button'; button.textContent = '×';
        button.dataset.glassTagRemove = String(i); button.setAttribute('aria-label', `${tag} 지우기`);
        span.append(button); box.append(span);
      });
      const input = document.createElement('input'); input.className = 'cawfg-tag-in'; input.dataset.glassTagInput = '';
      input.placeholder = '키워드 추가…'; input.setAttribute('aria-label', '키워드 추가'); box.append(input);
    }
    let dirtyCount = 0;
    panel.querySelectorAll('[data-cawf-keyword-chip]').forEach(button => {
      const id = button.dataset.value;
      const dirty = parseKeywordText(glassKeywordText(panel, id)).join('\n') !== parseKeywordText(state.settings[EFFECT_KEYWORD_FIELDS[id]]).join('\n');
      dirtyCount += Number(dirty);
      button.dataset.dirty = String(dirty);
      button.setAttribute('aria-pressed', String(id === effect));
      button.querySelector('[data-kw-n]').textContent = parseKeywordText(glassKeywordText(panel, id)).length;
    });
    panel.querySelector('[data-kw-dirty-n]').textContent = dirtyCount;
    panel.querySelector('[data-cawf-tab="kw"]').dataset.dirty = String(dirtyCount > 0);
    panel.querySelector('[data-ed-count]').textContent = `${tags.length}개`;
    panel.querySelector('[data-ed-ico]').textContent = glassUI.EF[effect]?.icon || '•';
    const seg = panel.querySelector('[data-seg="kwMode"]');
    seg.style.setProperty('--i', mode === 'raw' ? 1 : 0);
    seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.segV === mode)));
    syncGlassKeywordTest(panel);
  }

  function syncGlassKeywordTest(panel) {
    const value = panel.querySelector('[data-kw-test]').value;
    const out = panel.querySelector('[data-kw-test-out]');
    if (!value.trim()) { out.textContent = '문장을 넣으면 저장 전 키워드로도 감지 결과를 확인할 수 있어요.'; return; }
    const source = normalizeForKeywordSearch(value);
    let found = '';
    for (const effect of SCREEN_EFFECT_PRIORITY) {
      const keyword = parseKeywordText(glassKeywordText(panel, effect)).find(k => source.includes(normalizeForKeywordSearch(k)));
      if (keyword) { found = `${glassUI.EF[effect]?.label || EFFECT_LABELS[effect]} · ${keyword}`; break; }
    }
    const minutes = extractTimeMinutesFromText(value);
    out.textContent = (found || '효과 키워드 없음') + (minutes == null ? '' : ` · ${EFFECT_LABELS[classifyMinutesToTimeEffect(minutes)]}`);
  }

  function setupGlassPanel(panel) {
    window.addEventListener('resize', positionGlassPanel);
    window.visualViewport?.addEventListener('resize', positionGlassPanel);
    window.visualViewport?.addEventListener('scroll', positionGlassPanel);
    panel.addEventListener('pointerdown', event => {
      const host = event.target instanceof Element ? event.target.closest('[data-ripple]') : null;
      if (!host || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const rect = host.getBoundingClientRect(), size = Math.max(rect.width, rect.height) * 2.2;
      const ripple = document.createElement('span'); ripple.className = 'cawfg-ripple';
      Object.assign(ripple.style, {width:`${size}px`,height:`${size}px`,left:`${event.clientX-rect.left-size/2}px`,top:`${event.clientY-rect.top-size/2}px`});
      host.append(ripple); setTimeout(() => ripple.remove(), 650);
    });
    panel.querySelector('[data-cawf-intensity-label]').closest('.cawfg-row').querySelectorAll('[data-value]').forEach(b => b.setAttribute('data-cawf-intensity-option', ''));
    panel.querySelectorAll('[data-cawf-tab]').forEach(button => {
      const page = panel.querySelector(`[data-cawf-page="${button.dataset.cawfTab}"]`);
      button.id = `cawfg-tab-${button.dataset.cawfTab}`; page.id = `cawfg-page-${button.dataset.cawfTab}`;
      button.setAttribute('aria-controls', page.id); page.setAttribute('aria-labelledby', button.id);
    });
    const updateTags = tags => {
      const editor = panel.querySelector('[data-cawf-keyword-editor]');
      editor.value = parseKeywordText(tags.join(', ')).join(', ');
      stashActiveKeywordDraft(panel); syncGlassKeywords(panel);
    };
    panel.addEventListener('click', event => {
      const t = event.target instanceof Element ? event.target : null; if (!t) return;
      const mode = t.closest('[data-seg="kwMode"] button');
      if (mode) { stashActiveKeywordDraft(panel); panel.dataset.glassKeywordMode = mode.dataset.segV; syncGlassKeywords(panel); }
      const remove = t.closest('[data-glass-tag-remove]');
      if (remove) { const tags = parseKeywordText(glassKeywordText(panel, panel.dataset.cawfKeywordEffect)); tags.splice(Number(remove.dataset.glassTagRemove), 1); updateTags(tags); }
      if (t.closest('[data-kw-default]')) {
        const editor = panel.querySelector('[data-cawf-keyword-editor]');
        editor.value = DEFAULT_KEYWORDS[panel.dataset.cawfKeywordEffect] || '';
        stashActiveKeywordDraft(panel); syncGlassKeywords(panel);
      }
      if (t.closest('[data-kw-discard]')) { clearPanelKeywordDrafts(); syncGlassKeywords(panel); }
    });
    panel.addEventListener('keydown', event => {
      const input = event.target;
      if (event.key === 'Escape') { closePanel(); state.button?.focus(); return; }
      if (input.matches('[data-cawf-tab]') && ['ArrowRight','ArrowLeft','Home','End'].includes(event.key)) {
        event.preventDefault(); const tabs = [...panel.querySelectorAll('[data-cawf-tab]')]; const i = tabs.indexOf(input);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length-1 : (i + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        setPanelTab(tabs[next].dataset.cawfTab); tabs[next].focus(); return;
      }
      if (!input.matches('[data-glass-tag-input]') || event.isComposing) return;
      if (event.key === 'Enter' || event.key === ',') {
        event.preventDefault(); const value = input.value.trim(); if (!value) return;
        updateTags([...parseKeywordText(glassKeywordText(panel, panel.dataset.cawfKeywordEffect)), value]);
        panel.querySelector('[data-glass-tag-input]').focus();
      } else if (event.key === 'Backspace' && !input.value) {
        const tags = parseKeywordText(glassKeywordText(panel, panel.dataset.cawfKeywordEffect)); tags.pop(); updateTags(tags);
        panel.querySelector('[data-glass-tag-input]').focus();
      }
    });
    panel.addEventListener('input', event => { if (event.target.matches('[data-kw-test]')) syncGlassKeywordTest(panel); });
    panel.querySelectorAll('details.cawf-sound-card').forEach(card => card.addEventListener('toggle', () => card.querySelector('[data-cawf-sound-gear]').setAttribute('aria-expanded', String(card.open))));
  }

  function syncGlassPanel(panel) {
    syncGlassTheme(); syncGlassRanges(panel); syncGlassKeywords(panel, false);
    const s = state.settings, $ = selector => panel.querySelector(selector);
    const put = (selector, text) => { const el = $(selector); if (el && el.textContent !== String(text)) el.textContent = text; };
    const effect = getPaintedScreenEffect();
    const time = s.enabled && s.timeBackgroundEnabled && effect !== 'underwater' ? state.activeTimeEffect : 'none';
    const sound = getActiveSoundLabel().replace(/^소리:\s*/, '');
    const soundPlaying = sound !== '없음';
    const current = [
      ['fx', glassUI.EF[effect]?.icon || '☁️', EFFECT_LABELS[effect] || '없음', '화면 효과'],
      ['time', glassUI.TM[time]?.icon || '◷', EFFECT_LABELS[time] || '없음', '시간대 배경'],
      ['snd', '', soundPlaying ? sound : '사운드', soundPlaying ? '재생 중' : s.soundEnabled ? '대기 중' : '꺼짐']
    ];
    current.forEach(([id, ico, value, sub]) => {
      if (ico) put(`[data-nt="${id}"] [data-nt-ico]`, ico);
      put(`[data-nt="${id}"] [data-nt-val]`, value);
      put(`[data-nt="${id}"] [data-nt-sub]`, sub);
      $(`[data-nt="${id}"]`).title = `${value} · ${sub}`;
    });
    $('[data-nt-eq]').dataset.on = String(soundPlaying);
    $('[data-cawf-tab="snd"]').dataset.playing = String(soundPlaying);
    put('[data-app-ico]', glassUI.EF[effect]?.icon || glassUI.TM[time]?.icon || '☁️');
    put('[data-auto-sub]', s.autoDetect ? `감지: ${EFFECT_LABELS[state.lastDetectedEffect] || '없음'}` : '자동 감지 꺼짐');
    put('[data-tauto-sub]', `감지: ${EFFECT_LABELS[state.lastDetectedTimeEffect] || '없음'}`);
    put('[data-fx-meta]', effect === 'none' ? '현재 표시 없음' : '현재 표시 중');
    put('[data-time-meta]', time === 'none' ? '현재 표시 없음' : '현재 표시 중');
    put('[data-d-ico]', glassUI.EF[state.activeEffect]?.icon || '☁️');
    put('[data-d-name]', EFFECT_LABELS[state.activeEffect] || '효과 없음');
    put('[data-d-info]', glassUI.EF[state.activeEffect]?.when || glassUI.EF[state.activeEffect]?.note || (s.effect === 'auto' ? '최신 AI 로그의 키워드에 맞춰 전환돼요.' : '선택한 효과를 수동으로 표시해요.'));
    put('[data-d-pill]', effect === 'none' ? '대기' : '표시 중');
    $('[data-d-pill]').className = `cawfg-pill ${effect === 'none' ? 'off' : 'ok'}`;
    const midpoint = { dawn:360,morning:570,afternoon:870,sunset:1095,twilight:1215,night:1380 }[time];
    const marker = $('[data-rib-mark]'); marker.hidden = midpoint == null;
    if (midpoint != null) { marker.style.setProperty('--x', `${midpoint/1440*100}%`); put('[data-rib-time]', EFFECT_LABELS[time]); }
    panel.querySelectorAll('[data-seg]:not([data-seg="kwMode"])').forEach(seg => {
      const buttons = [...seg.querySelectorAll('button')]; seg.style.setProperty('--i', Math.max(0, buttons.findIndex(b => b.dataset.value === String(s[seg.dataset.seg]))));
    });
    panel.querySelectorAll('[data-cawf-chip="effect"], [data-cawf-chip="timeBackground"]').forEach(button => {
      const key = button.dataset.cawfChip, active = key === 'effect' ? state.lastDetectedEffect : state.lastDetectedTimeEffect;
      button.dataset.detected = String(s[key] === 'auto' && button.dataset.value === active);
    });
    const channels = [
      ['audioVolume','audioUnlocked','rainNodes','audioError','rain'],
      ['cricketAudioVolume','cricketAudioUnlocked','cricketNodes','cricketAudioError','fireflies'],
      ['waveAudioVolume','waveAudioUnlocked','waveNodes','waveAudioError','shore'],
      ['spellAudioVolume','spellAudioUnlocked','spellAudioPlaying','spellAudioError','spellcast'],
      ['fireworksAudioVolume','fireworksAudioUnlocked','fireworksNodes','fireworksAudioError','fireworks'],
      ['underwaterAudioVolume','underwaterAudioUnlocked','underwaterNodes','underwaterAudioError','underwater']
    ];
    const errors = channels.map(c => state[c[3]]).filter(Boolean);
    const unlocked = channels.every(c => state[c[1]]);
    put('[data-lock-title]', !s.soundEnabled ? '사운드 꺼짐' : errors.length ? '사운드 확인 필요' : soundPlaying ? '사운드 재생 중' : unlocked ? '소리 허용됨' : '브라우저 소리 허용');
    put('[data-lock-sub]', !s.soundEnabled ? '사운드 스위치를 켜면 재생돼요' : errors[0] || (soundPlaying ? sound : unlocked ? '효과에 맞춰 재생을 기다리고 있어요' : '버튼을 눌러 소리를 허용할 수 있어요'));
    $('[data-lock]').title = getAudioStatusText();
    $('[data-lock]').dataset.state = soundPlaying || unlocked ? 'open' : 'locked';
    $('[data-lock-ico]').innerHTML = glassUI.ICON[soundPlaying || unlocked ? 'unlock' : 'lock'];
    channels.forEach(([key, allowed, nodes, error]) => {
      const card = $(`[data-cawf-range="${key}"]`).closest('.cawfg-mx');
      const playing = !!s.soundEnabled && !!state[allowed] && !!state[nodes];
      card.dataset.state = playing ? 'play' : state[error] ? 'lock' : 'wait';
      card.querySelector('.cawfg-mx-n').title = state[error] || (playing ? '재생 중' : state[allowed] ? '대기 중' : '브라우저 소리 허용 필요');
    });
    panel.querySelectorAll('[data-cawf-tab]').forEach(button => button.tabIndex = button.getAttribute('aria-selected') === 'true' ? 0 : -1);
  }

  function ensurePanel() {
    let panel = document.getElementById(IDS.panel);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = IDS.panel;
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', '날씨/환경 이펙트 설정');
      panel.innerHTML = glassUI.panelHTML();
      setupGlassPanel(panel);

      panel.addEventListener('click', handlePanelClick);
      panel.addEventListener('input', handlePanelInput);
      panel.addEventListener('input', () => { syncGlassRanges(panel); syncGlassKeywords(panel, false); });
      panel.addEventListener('change', handlePanelChange);
      panel.addEventListener('keydown', handlePanelKeydown);
      document.body.appendChild(panel);
    }

    state.panel = panel;
    getPanelKeywordDrafts(panel);
    if (!panel.dataset.cawfKeywordEffect) selectPanelKeywordEffect('rain', { stash: false });
    if (!panel.dataset.cawfPage) setPanelTab('fx');
    syncPanel();
  }

  function saveKeywordTextareas() {
    const panel = state.panel;
    if (!panel) return;

    stashActiveKeywordDraft(panel);
    const patch = {};
    const drafts = getPanelKeywordDrafts(panel);
    Object.entries(drafts).forEach(([key, value]) => {
      if (Object.prototype.hasOwnProperty.call(state.settings, key) && key.startsWith('keyword')) {
        patch[key] = value;
      }
    });

    saveSettings(patch, { skipScan: true });
    panel.__cawfKeywordDrafts = {};
    selectPanelKeywordEffect(panel.dataset.cawfKeywordEffect || 'rain', { stash: false });
    state.lastTextHash = '';
    clearPendingScan();
    scanLatestLog('keywords-save');
  }

  function handlePanelClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest('[data-cawf-close]')) {
      closePanel();
      return;
    }

    const tab = target.closest('[data-cawf-tab]');
    if (tab instanceof HTMLElement) {
      event.preventDefault();
      setPanelTab(tab.getAttribute('data-cawf-tab') || 'fx');
      return;
    }

    const soundGear = target.closest('[data-cawf-sound-gear]');
    if (soundGear instanceof HTMLElement) {
      event.preventDefault();
      event.stopPropagation();
      const card = soundGear.closest('details.cawf-sound-card');
      if (card instanceof HTMLDetailsElement) card.open = !card.open;
      return;
    }

    const keywordChip = target.closest('[data-cawf-keyword-chip]');
    if (keywordChip instanceof HTMLElement) {
      event.preventDefault();
      selectPanelKeywordEffect(keywordChip.getAttribute('data-value') || 'rain');
      return;
    }

    const settingChip = target.closest('[data-cawf-chip]');
    if (settingChip instanceof HTMLElement) {
      event.preventDefault();
      const key = settingChip.getAttribute('data-cawf-chip');
      const value = settingChip.getAttribute('data-value') || '';
      if (key && Object.prototype.hasOwnProperty.call(state.settings, key)) {
        const patch = { [key]: value };

        // v2.2.0: 절전 모드는 로그 재스캔 없이 렌더 예산만 갈아끼운다.
        if (key === 'powerSaver') {
          saveSettings(patch, { skipScan: true });
          applyPowerSaveMode(`chip:${key}`);
          syncPanel();
          return;
        }

        if (key === 'effect') patch.autoDetect = value === 'auto';
        saveSettings(patch, { skipScan: true });
        applyCurrentSelectionsNow(`chip:${key}`);
      }
      return;
    }

    const toggle = target.closest('[data-cawf-toggle]');
    if (toggle instanceof HTMLElement) {
      event.preventDefault();
      event.stopPropagation();

      const key = toggle.getAttribute('data-cawf-toggle');
      if (key && Object.prototype.hasOwnProperty.call(state.settings, key)) {
        const nextValue = !state.settings[key];
        toggle.setAttribute('data-on', nextValue ? 'true' : 'false');

        saveSettings({ [key]: nextValue }, { skipScan: true });

        if (key === 'soundEnabled') {
          if (!nextValue) {
            stopRainSound(false);
            stopCricketSound(false);
            stopWaveSound(false);
            stopFireworksSound(false);
            stopUnderwaterSound(false);
            stopSpellSound();
          } else {
            primeAudioUnlock().then(ok => {
              if (!ok) setupAutoUnlockOnGesture();
              syncAudioWithEffect(true);
            }).catch(() => {
              setupAutoUnlockOnGesture();
              syncAudioWithEffect();
            });
          }
          syncPanel();
          syncFloatingButton();
          return;
        }

        if (key === 'audioFollowEffect' || key === 'audioWhileHidden') {
          syncAudioWithEffect();
          syncPanel();
          syncFloatingButton();
          return;
        }

        // 설정 토글은 scan 예약을 기다리지 않고 즉시 실제 레이어 상태에 반영한다.
        // 자동 선택이면 최신 로그를 즉시 한 번 다시 읽고, 수동 선택이면 바로 setActive*로 칠한다.
        applyCurrentSelectionsNow(`toggle:${key}`);
      }
      return;
    }

    if (target.closest('[data-cawf-save-keywords]')) {
      saveKeywordTextareas();
      return;
    }

    if (target.closest('[data-cawf-unlock-audio]')) {
      // 브라우저 자동재생 정책 때문에, 사용자 클릭 순간에 두 오디오 채널을 한 번에 무음으로 잠금 해제한다.
      const rainAudio = ensureRainAudioElement();
      const cricketAudio = ensureCricketAudioElement();
      const waveAudio = ensureWaveAudioElement();
      const fireworksAudio = ensureFireworksAudioElement();
      const underwaterAudio = ensureUnderwaterAudioElement();
      const spellAudio = ensureSpellAudioElement();
      const unlockTasks = [];

      if (!state.audioUnlocked) {
        rainAudio.muted = false;
        rainAudio.volume = 0;
        if (!rainAudio.src || isPixabayPageUrl(rainAudio.src)) rainAudio.src = getSilentAudioDataUri();
        unlockTasks.push(rainAudio.play().then(() => { state.audioUnlocked = true; state.audioError = ''; }));
      }

      if (!state.cricketAudioUnlocked) {
        cricketAudio.muted = false;
        cricketAudio.volume = 0;
        if (!cricketAudio.src || isPixabayPageUrl(cricketAudio.src)) cricketAudio.src = getSilentAudioDataUri();
        unlockTasks.push(cricketAudio.play().then(() => { state.cricketAudioUnlocked = true; state.cricketAudioError = ''; }));
      }

      if (!state.waveAudioUnlocked) {
        waveAudio.muted = false;
        waveAudio.volume = 0;
        if (!waveAudio.src || isPixabayPageUrl(waveAudio.src)) waveAudio.src = getSilentAudioDataUri();
        unlockTasks.push(waveAudio.play().then(() => { state.waveAudioUnlocked = true; state.waveAudioError = ''; }));
      }

      if (!state.fireworksAudioUnlocked) {
        fireworksAudio.muted = false;
        fireworksAudio.volume = 0;
        const hasRealSource = hasPlayableAudioSource(fireworksAudio);
        if (!hasRealSource) fireworksAudio.src = getSilentAudioDataUri();
        unlockTasks.push(fireworksAudio.play().then(() => {
          state.fireworksAudioUnlocked = hasRealSource;
          if (hasRealSource) state.fireworksAudioError = '';
          else {
            fireworksAudio.pause();
            state.fireworksAudioError = '폭죽 음원을 준비한 뒤 브라우저 소리 허용을 한 번 더 눌러 주세요.';
          }
        }));
      }

      if (!state.underwaterAudioUnlocked) {
        underwaterAudio.muted = false;
        underwaterAudio.volume = 0;
        const hasRealSource = hasPlayableAudioSource(underwaterAudio);
        if (!hasRealSource) underwaterAudio.src = getSilentAudioDataUri();
        unlockTasks.push(underwaterAudio.play().then(() => {
          state.underwaterAudioUnlocked = hasRealSource;
          if (hasRealSource) state.underwaterAudioError = '';
          else {
            underwaterAudio.pause();
            state.underwaterAudioError = '수중 음원을 준비한 뒤 브라우저 소리 허용을 한 번 더 눌러 주세요.';
          }
        }));
      }

      if (!state.spellAudioUnlocked) {
        spellAudio.muted = false;
        spellAudio.volume = 0;
        unlockTasks.push(spellAudio.play().then(() => {
          spellAudio.pause();
          try { spellAudio.currentTime = 0; } catch (_) {}
          state.spellAudioUnlocked = true;
          state.spellAudioError = '';
        }));
      }

      Promise.allSettled(unlockTasks)
        .then(() => applyPendingAudioUrlsFromPanel())
        .then(() => {
          if (!state.fireworksAudioUnlocked || !state.underwaterAudioUnlocked) setupAutoUnlockOnGesture();
          syncAudioWithEffect(true);
          syncPanel();
          syncFloatingButton();
        })
        .catch(err => {
          const msg = err?.message || String(err || '브라우저 소리 허용 실패');
          state.audioError = msg;
          state.cricketAudioError = msg;
          state.waveAudioError = msg;
          state.fireworksAudioError = msg;
          state.underwaterAudioError = msg;
          state.spellAudioError = msg;
          syncPanel();
        });
      return;
    }

    if (target.closest('[data-cawf-apply-audio-url]')) {
      const input = state.panel?.querySelector('[data-cawf-audio-url]');
      const url = input instanceof HTMLInputElement ? input.value : '';
      setRainAudioUrl(url).catch(err => {
        state.audioError = err?.message || String(err || 'URL 적용 실패');
        syncPanel();
      });
      return;
    }

    if (target.closest('[data-cawf-clear-audio-url]')) {
      clearRainAudioUrl().catch(err => {
        state.audioError = err?.message || String(err || 'URL 제거 실패');
        syncPanel();
      });
      return;
    }

    if (target.closest('[data-cawf-apply-cricket-audio-url]')) {
      const input = state.panel?.querySelector('[data-cawf-cricket-audio-url]');
      const url = input instanceof HTMLInputElement ? input.value : '';
      setCricketAudioUrl(url).catch(err => {
        state.cricketAudioError = err?.message || String(err || '풀벌레 URL 적용 실패');
        syncPanel();
      });
      return;
    }

    if (target.closest('[data-cawf-clear-cricket-audio-url]')) {
      clearCricketAudioUrl().catch(err => {
        state.cricketAudioError = err?.message || String(err || '풀벌레 URL 제거 실패');
        syncPanel();
      });
      return;
    }

    if (target.closest('[data-cawf-apply-wave-audio-url]')) {
      const input = state.panel?.querySelector('[data-cawf-wave-audio-url]');
      const url = input instanceof HTMLInputElement ? input.value : '';
      setWaveAudioUrl(url).catch(err => {
        state.waveAudioError = err?.message || String(err || '파도소리 URL 적용 실패');
        syncPanel();
      });
      return;
    }

    if (target.closest('[data-cawf-clear-wave-audio-url]')) {
      clearWaveAudioUrl().catch(err => {
        state.waveAudioError = err?.message || String(err || '파도소리 URL 제거 실패');
        syncPanel();
      });
      return;
    }

    if (target.closest('[data-cawf-apply-fireworks-audio-url]')) {
      const input = state.panel?.querySelector('[data-cawf-fireworks-audio-url]');
      const url = input instanceof HTMLInputElement ? input.value : '';
      setFireworksAudioUrl(url).catch(err => {
        state.fireworksAudioError = err?.message || String(err || '불꽃놀이 URL 적용 실패');
        syncPanel();
      });
      return;
    }

    if (target.closest('[data-cawf-clear-fireworks-audio-url]')) {
      clearFireworksAudioUrl().catch(err => {
        state.fireworksAudioError = err?.message || String(err || '불꽃놀이 URL 제거 실패');
        syncPanel();
      });
      return;
    }

    if (target.closest('[data-cawf-apply-underwater-audio-url]')) {
      const input = state.panel?.querySelector('[data-cawf-underwater-audio-url]');
      const url = input instanceof HTMLInputElement ? input.value : '';
      setUnderwaterAudioUrl(url).catch(err => {
        state.underwaterAudioError = err?.message || String(err || '수중 URL 적용 실패');
        syncPanel();
      });
      return;
    }

    if (target.closest('[data-cawf-clear-underwater-audio-url]')) {
      clearUnderwaterAudioUrl().catch(err => {
        state.underwaterAudioError = err?.message || String(err || '수중 URL 제거 실패');
        syncPanel();
      });
      return;
    }

    if (target.closest('[data-cawf-rescan]')) {
      state.lastTextHash = '';
      clearPendingScan();
      scanLatestLog('manual-rescan');
      return;
    }

    if (target.closest('[data-cawf-reset]')) {
      resetSettings();
    }
  }

  function handlePanelKeydown(event) {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    if (event.key !== 'Enter') return;
    if (input?.hasAttribute?.('data-cawf-audio-url')) {
      event.preventDefault();
      setRainAudioUrl(input.value).catch(err => {
        state.audioError = err?.message || String(err || 'URL 적용 실패');
        syncPanel();
      });
      return;
    }
    if (input?.hasAttribute?.('data-cawf-cricket-audio-url')) {
      event.preventDefault();
      setCricketAudioUrl(input.value).catch(err => {
        state.cricketAudioError = err?.message || String(err || '풀벌레 URL 적용 실패');
        syncPanel();
      });
      return;
    }
    if (input?.hasAttribute?.('data-cawf-wave-audio-url')) {
      event.preventDefault();
      setWaveAudioUrl(input.value).catch(err => {
        state.waveAudioError = err?.message || String(err || '파도소리 URL 적용 실패');
        syncPanel();
      });
    }
    if (input?.hasAttribute?.('data-cawf-fireworks-audio-url')) {
      event.preventDefault();
      setFireworksAudioUrl(input.value).catch(err => {
        state.fireworksAudioError = err?.message || String(err || '불꽃놀이 URL 적용 실패');
        syncPanel();
      });
      return;
    }
    if (input?.hasAttribute?.('data-cawf-underwater-audio-url')) {
      event.preventDefault();
      setUnderwaterAudioUrl(input.value).catch(err => {
        state.underwaterAudioError = err?.message || String(err || '수중 URL 적용 실패');
        syncPanel();
      });
    }
  }

  function handlePanelInput(event) {
    const textarea = event.target instanceof HTMLTextAreaElement ? event.target : null;
    if (textarea?.hasAttribute('data-cawf-keyword-editor')) {
      const key = textarea.getAttribute('data-cawf-keywords');
      if (key && Object.prototype.hasOwnProperty.call(state.settings, key)) {
        getPanelKeywordDrafts()[key] = textarea.value;
      }
      return;
    }

    const input = event.target instanceof HTMLInputElement ? event.target : null;
    if (!input) return;

    const key = input.getAttribute('data-cawf-range');
    if (!key) return;

    saveSettings({ [key]: Number(input.value) }, { skipScan: true });

    if (key === 'audioVolume' || key === 'cricketAudioVolume' || key === 'waveAudioVolume' || key === 'fireworksAudioVolume' || key === 'underwaterAudioVolume' || key === 'spellAudioVolume') {
      updateMasterVolume();
      return;
    }


    if (key === 'effectSpeed') {
      state.particleSignature = '';
      rebuildParticles('effect-speed-change');
      if (state.activeEffect === 'rain') startCanvasRain('effect-speed-change');
    }


  }

  function handlePanelChange(event) {
    const select = event.target instanceof HTMLSelectElement ? event.target : null;
    if (!select) return;

    const key = select.getAttribute('data-cawf-select');
    if (!key) return;

    const patch = { [key]: select.value };
    if (key === 'effect' && select.value !== 'auto') patch.autoDetect = false;
    if (key === 'effect' && select.value === 'auto') patch.autoDetect = true;

    saveSettings(patch, { skipScan: true });
    applyCurrentSelectionsNow(`select:${key}`);
  }

  function openPanel() {
    ensurePanel();
    state.panel?.setAttribute('data-open', 'true');
    state.button?.setAttribute('data-panel-open', 'true');
    state.button?.setAttribute('aria-expanded', 'true');
    bumpFloatingButtonActivity();
    setPanelTab('fx');
    positionGlassPanel();
    state.panel.dataset.anim = 'in';
    clearTimeout(state.panel.__glassEnterTimer);
    state.panel.__glassEnterTimer = setTimeout(() => { state.panel.dataset.anim = ''; }, 1000);
    syncPanel();
  }

  function closePanel() {
    state.panel?.removeAttribute('data-open');
    state.button?.setAttribute('data-panel-open', 'false');
    state.button?.setAttribute('aria-expanded', 'false');
    bumpFloatingButtonActivity();
  }

  function togglePanel() {
    ensurePanel();
    if (state.panel?.getAttribute('data-open') === 'true') closePanel();
    else openPanel();
  }

  function shouldSuppressSunlightForTime(effect = state.activeEffect, timeEffect = state.activeTimeEffect) {
    const normalizedEffect = normalizeChoice(effect, ACTIVE_EFFECT_CHOICES, 'none');
    const normalizedTime = normalizeChoice(timeEffect, ACTIVE_TIME_CHOICES, 'none');
    if (normalizedEffect === 'sunlight' && ['dawn', 'twilight', 'night'].includes(normalizedTime)) return true;
    if (normalizedEffect === 'fireworks' && !['twilight', 'night'].includes(normalizedTime)) return true;
    if (normalizedEffect === 'bokeh' && !['dawn', 'sunset', 'twilight', 'night'].includes(normalizedTime)) return true;
    return false;
  }

  function getPaintedScreenEffect(effect = state.activeEffect, timeEffect = state.activeTimeEffect) {
    if (!state.settings.enabled || !state.settings.screenEffectEnabled) return 'none';
    const normalizedEffect = normalizeChoice(effect, ACTIVE_EFFECT_CHOICES, 'none');
    if (shouldSuppressSunlightForTime(normalizedEffect, timeEffect)) return 'none';
    return normalizedEffect;
  }

  function syncPaintedTimeLayer(screenEffect = getPaintedScreenEffect(), timeEffect = state.activeTimeEffect) {
    const root = ensureRoot();
    let paintedTimeEffect = (state.settings.enabled && state.settings.timeBackgroundEnabled && timeEffect && timeEffect !== 'none')
      ? timeEffect
      : 'none';
    if (screenEffect === 'underwater') paintedTimeEffect = 'none';
    root.setAttribute('data-time-effect', paintedTimeEffect);
    if (state.timeLayer instanceof HTMLElement) {
      state.timeLayer.setAttribute('data-time-effect', paintedTimeEffect);
      state.timeLayer.setAttribute('data-cawf-time-enabled', paintedTimeEffect !== 'none' ? 'true' : 'false');
      state.timeLayer.style.display = paintedTimeEffect === 'none' ? 'none' : '';
    }
    return paintedTimeEffect;
  }

  function applySettingsToDom() {
    const root = ensureRoot();
    const s = state.settings;
    const zIndex = '0';

    applyRootBounds(true);
    root.dataset.cawfNightMeteors = String(s.nightMeteors);
    root.style.setProperty('--cawf-opacity', '1');
    root.style.setProperty('--cawf-effect-opacity', String(s.effectOpacity));
    // 시간대 배경 투명도는 색감이 바뀌지 않게 alpha 중심으로 제어한다.
    // 100% 초과분은 hue를 바꾸는 brightness/contrast 대신, 별도 wash 복제 레이어와 디테일 레이어만 강화한다.
    const timeOpacityRaw = Math.max(0, Number(s.timeOpacity) || 0);
    const timeOpacityCss = Math.min(1, timeOpacityRaw);
    const timeBoostRatio = Math.max(0, timeOpacityRaw - 1);
    const timeDetailStrength = 1 + timeBoostRatio * 1.25;
    const timeWashBoostOpacity = Math.min(0.58, timeBoostRatio * 0.58);
    root.style.setProperty('--cawf-time-opacity', String(timeOpacityCss.toFixed(3)));
    root.style.setProperty('--cawf-time-brightness', '1');
    root.style.setProperty('--cawf-time-contrast', '1');
    root.style.setProperty('--cawf-time-detail-strength', String(timeDetailStrength.toFixed(3)));
    root.style.setProperty('--cawf-time-wash-boost-opacity', String(timeWashBoostOpacity.toFixed(3)));
    root.style.setProperty('--cawf-effect-speed', String(s.effectSpeed));
    root.style.setProperty('--cawf-time-speed', String(s.timeSpeed));
    root.style.setProperty('--cawf-z-index', zIndex);
    // v0.7.0: 위치/크기/z-index는 applyRootBounds(fixed underlay)가 단독 관리한다.
    // 여기서 position/inset/z-index를 다시 강제하면 fixed 레이아웃이 깨지므로 손대지 않는다.
    const paintedScreenEffect = getPaintedScreenEffect();
    root.setAttribute('data-effect', paintedScreenEffect);
    syncPaintedTimeLayer(paintedScreenEffect, state.activeTimeEffect);

    updateRootVisibility();
  }

  function applyAnimationPauseState() {
    const root = state.root || ensureRoot();
    // 탭이 가려졌거나, 채팅 효과 영역이 화면 밖이면 애니메이션을 멈춰 GPU/발열을 아낀다.
    const paused = document.hidden || state.effectInView === false;
    const wasPaused = state.runtimePaused;
    state.runtimePaused = paused;
    root.setAttribute('data-cawf-anim-paused', paused ? 'true' : 'false');

    // CSS만 pause하지 않고 JS 캔버스 루프도 완전히 취소한다.
    // 단순히 draw를 건너뛰며 rAF를 계속 예약하면 60/120Hz 기기에서 콜백 자체가 발열을 만든다.
    if (paused) {
      if (state.rainAnimId) stopCanvasRain(false);
      if (state.ambientAnimId || state.underwaterAnimId) {
        if (!pauseGalaxyAnimation()) stopAmbientAnimation();
      }
      stopNightSky();
      return;
    }

    if (wasPaused) resumeActiveRenderLoops('visibility-resume');
    else syncNightSky('pause-state');
  }

  function resumeActiveRenderLoops(reason = 'resume') {
    if (
      document.hidden ||
      state.effectInView === false ||
      state.root?.getAttribute?.('data-cawf-visible') !== 'true'
    ) return;

    const effect = getPaintedScreenEffect();
    if (effect === 'rain') startCanvasRain(reason);
    else if (effect === 'mana') startRawMagicDust(reason);
    else if (effect === 'bokeh') startRawBokeh(reason);
    else if (effect === 'galaxy') startRawGalaxy(reason);
    else if (effect === 'fireworks') startRawFireworks(reason);
    else if (effect === 'underwater') startUnderwater(reason);

    syncNightSky(reason);
  }

  function attachVisibilityObserver() {
    const target = state.effectHost || findEffectViewport();
    if (!(target instanceof HTMLElement) || typeof IntersectionObserver !== 'function') return;
    if (state.visibilityObserver?.__target === target) return;

    state.visibilityObserver?.disconnect?.();
    const observer = new IntersectionObserver(entries => {
      const entry = entries[0];
      state.effectInView = !!(entry && entry.isIntersecting);
      applyAnimationPauseState();
    }, { threshold: 0 });

    observer.__target = target;
    observer.observe(target);
    state.visibilityObserver = observer;
  }

  function updateRootVisibility() {
    const root = state.root || ensureRoot();
    const hasHost = applyRootBounds(false);
    const paintedScreenEffect = getPaintedScreenEffect();
    const visible = !!(
      hasHost &&
      state.settings.enabled &&
      isEpisodePath() &&
      ((paintedScreenEffect && paintedScreenEffect !== 'none') ||
       (state.settings.timeBackgroundEnabled && state.activeTimeEffect && state.activeTimeEffect !== 'none'))
    );
    root.setAttribute('data-cawf-visible', visible ? 'true' : 'false');
    if (visible) {
      document.documentElement.setAttribute('data-cawf-layer-active', 'true');
      refreshUnderlayUnmask(state.effectHost);
    } else {
      document.documentElement.removeAttribute('data-cawf-layer-active');
      clearUnderlayUnmask();
    }
    if (!visible) stopCanvasRain(true);
    attachVisibilityObserver();
    applyAnimationPauseState();
  }

  function syncFloatingButton() {
    if (!state.button) return;
    const shouldShow = !!state.settings.showFloatingButton && isEpisodePath();
    const paintedScreenEffect = getPaintedScreenEffect();
    state.button.setAttribute('data-visible', shouldShow ? 'true' : 'false');
    state.button.setAttribute('data-active', ((paintedScreenEffect && paintedScreenEffect !== 'none') || (state.settings.timeBackgroundEnabled && state.activeTimeEffect && state.activeTimeEffect !== 'none')) ? 'true' : 'false');
    state.button.setAttribute('data-audio', (
      (state.audioUnlocked && !!state.rainNodes) ||
      (state.cricketAudioUnlocked && !!state.cricketNodes) ||
      (state.waveAudioUnlocked && !!state.waveNodes) ||
      (state.fireworksAudioUnlocked && !!state.fireworksNodes) ||
      (state.underwaterAudioUnlocked && !!state.underwaterNodes) ||
      (state.spellAudioUnlocked && !!state.spellAudioPlaying)
    ) ? 'true' : 'false');

    const iconSource = (paintedScreenEffect && paintedScreenEffect !== 'none') ? paintedScreenEffect : (state.settings.timeBackgroundEnabled ? (state.activeTimeEffect || 'none') : 'none');
    const icon = {
      rain: '🌧️',
      snow: '❄️',
      sakura: '🌸',
      leaves: '🍂',
      greenLeaves: '🍃',
      fireflies: '✨',
      spellcast: '🌀',
      mana: '🔮',
      bokeh: '🟠',
      candlelight: '🕯️',
      sunlight: '☀️',
      aurora: '💫',
      galaxy: '🌌',
      fog: '🌫️',
      shore: '🌊',
      fireworks: '🎆',
      underwater: '🫧',
      feathers: '🪶',
      butterflies: '🦋',
      sandstorm: '🏜️',
      dawn: '🌅',
      morning: '🌤️',
      afternoon: '☀️',
      sunset: '🌇',
      twilight: '🌆',
      night: '🌙',
      none: '☁️',
      auto: '🌧️'
    }[iconSource] || '🌧️';
    state.button.textContent = icon;
  }

  function syncPanel() {
    const panel = state.panel;
    if (!panel || panel.getAttribute('data-open') !== 'true') return;
    const s = state.settings;
    syncGlassPanel(panel);

    panel.querySelectorAll('[data-cawf-toggle]').forEach(button => {
      if (!(button instanceof HTMLElement)) return;
      const key = button.getAttribute('data-cawf-toggle');
      button.setAttribute('data-on', s[key] ? 'true' : 'false');
      button.setAttribute('aria-checked', String(!!s[key]));
    });

    panel.querySelectorAll('[data-cawf-select]').forEach(select => {
      if (!(select instanceof HTMLSelectElement)) return;
      const key = select.getAttribute('data-cawf-select');
      if (key && document.activeElement !== select) select.value = String(s[key] || '');
    });

    panel.querySelectorAll('[data-cawf-chip]').forEach(button => {
      if (!(button instanceof HTMLElement)) return;
      const key = button.getAttribute('data-cawf-chip');
      const value = button.getAttribute('data-value');
      if (!key || value === null) return;
      button.setAttribute('data-on', String(s[key] ?? '') === value ? 'true' : 'false');
      button.setAttribute('aria-pressed', String(String(s[key] ?? '') === value));
    });

    const galaxySelected = s.effect === 'galaxy' || (s.effect === 'auto' && state.activeEffect === 'galaxy');
    const intensityLabel = panel.querySelector('[data-cawf-intensity-label]');
    if (intensityLabel instanceof HTMLElement) intensityLabel.textContent = galaxySelected ? '은하수 밀도' : '효과 양';
    const intensityLabels = galaxySelected
      ? { low: '은은', medium: '보통', high: '풍부' }
      : { low: '적게', medium: '보통', high: '많이' };
    panel.querySelectorAll('[data-cawf-intensity-option]').forEach(button => {
      if (!(button instanceof HTMLElement)) return;
      button.textContent = intensityLabels[button.getAttribute('data-value')] || button.textContent;
    });

    const galaxyOptions = panel.querySelector('[data-cawf-galaxy-options]');
    if (galaxyOptions instanceof HTMLElement) {
      galaxyOptions.hidden = !galaxySelected;
    }

    panel.querySelectorAll('[data-cawf-keyword-chip]').forEach(button => {
      if (!(button instanceof HTMLElement)) return;
      button.setAttribute('data-on', button.getAttribute('data-value') === (panel.dataset.cawfKeywordEffect || 'rain') ? 'true' : 'false');
    });

    panel.querySelectorAll('[data-cawf-range]').forEach(input => {
      if (!(input instanceof HTMLInputElement)) return;
      const key = input.getAttribute('data-cawf-range');
      if (key && document.activeElement !== input) input.value = String(s[key] ?? '');
    });

    panel.querySelectorAll('[data-cawf-keywords]').forEach(textarea => {
      if (!(textarea instanceof HTMLTextAreaElement)) return;
      const key = textarea.getAttribute('data-cawf-keywords');
      if (!key || document.activeElement === textarea) return;
      const drafts = getPanelKeywordDrafts(panel);
      textarea.value = Object.prototype.hasOwnProperty.call(drafts, key)
        ? String(drafts[key] ?? '')
        : String(s[key] || '');
    });

    const effectOpacityOut = panel.querySelector('[data-cawf-output="effectOpacity"]');
    if (effectOpacityOut instanceof HTMLElement) effectOpacityOut.textContent = `${Math.round(s.effectOpacity * 100)}%`;

    const timeOpacityOut = panel.querySelector('[data-cawf-output="timeOpacity"]');
    if (timeOpacityOut instanceof HTMLElement) timeOpacityOut.textContent = `${Math.round(s.timeOpacity * 100)}%`;

    const effectSpeedOut = panel.querySelector('[data-cawf-output="effectSpeed"]');
    if (effectSpeedOut instanceof HTMLElement) effectSpeedOut.textContent = `${Math.round(s.effectSpeed * 100)}%`;

    const timeSpeedOut = panel.querySelector('[data-cawf-output="timeSpeed"]');
    if (timeSpeedOut instanceof HTMLElement) timeSpeedOut.textContent = `${Math.round(s.timeSpeed * 100)}%`;

    const volumeOut = panel.querySelector('[data-cawf-output="audioVolume"]');
    if (volumeOut instanceof HTMLElement) volumeOut.textContent = `${Math.round(s.audioVolume * 100)}%`;

    const cricketVolumeOut = panel.querySelector('[data-cawf-output="cricketAudioVolume"]');
    if (cricketVolumeOut instanceof HTMLElement) cricketVolumeOut.textContent = `${Math.round(s.cricketAudioVolume * 100)}%`;

    const waveVolumeOut = panel.querySelector('[data-cawf-output="waveAudioVolume"]');
    if (waveVolumeOut instanceof HTMLElement) waveVolumeOut.textContent = `${Math.round(s.waveAudioVolume * 100)}%`;

    const fireworksVolumeOut = panel.querySelector('[data-cawf-output="fireworksAudioVolume"]');
    if (fireworksVolumeOut instanceof HTMLElement) fireworksVolumeOut.textContent = `${Math.round(s.fireworksAudioVolume * 100)}%`;

    const underwaterVolumeOut = panel.querySelector('[data-cawf-output="underwaterAudioVolume"]');
    if (underwaterVolumeOut instanceof HTMLElement) underwaterVolumeOut.textContent = `${Math.round(s.underwaterAudioVolume * 100)}%`;

    const spellVolumeOut = panel.querySelector('[data-cawf-output="spellAudioVolume"]');
    if (spellVolumeOut instanceof HTMLElement) spellVolumeOut.textContent = `${Math.round(s.spellAudioVolume * 100)}%`;

    const audioUrlInput = panel.querySelector('[data-cawf-audio-url]');
    if (audioUrlInput instanceof HTMLInputElement && document.activeElement !== audioUrlInput) {
      audioUrlInput.value = String(s.audioUrl || '');
    }

    const audioUrlStatus = panel.querySelector('[data-cawf-audio-url-status]');
    if (audioUrlStatus instanceof HTMLElement) {
      const meta = state.rainAudioMeta;
      audioUrlStatus.textContent = meta?.name ? `적용됨: ${meta.name}${meta.resolvedUrl && meta.resolvedUrl !== meta.url ? ' · 직접 오디오 자동 추출됨' : ''}` : '기본 Pixabay 출처 페이지가 들어가 있어요. 재생 시 직접 오디오 링크를 자동 추출해요';
    }

    const cricketAudioUrlInput = panel.querySelector('[data-cawf-cricket-audio-url]');
    if (cricketAudioUrlInput instanceof HTMLInputElement && document.activeElement !== cricketAudioUrlInput) {
      cricketAudioUrlInput.value = String(s.cricketAudioUrl || '');
    }

    const cricketAudioUrlStatus = panel.querySelector('[data-cawf-cricket-audio-url-status]');
    if (cricketAudioUrlStatus instanceof HTMLElement) {
      const meta = state.cricketAudioMeta;
      cricketAudioUrlStatus.textContent = meta?.name ? `적용됨: ${meta.name}${meta.resolvedUrl && meta.resolvedUrl !== meta.url ? ' · 직접 오디오 자동 추출됨' : ''}` : '기본 Pixabay Crickets 출처 페이지가 들어가 있어요. 재생 시 직접 오디오 링크를 자동 추출해요';
    }

    const waveAudioUrlInput = panel.querySelector('[data-cawf-wave-audio-url]');
    if (waveAudioUrlInput instanceof HTMLInputElement && document.activeElement !== waveAudioUrlInput) {
      waveAudioUrlInput.value = String(s.waveAudioUrl || '');
    }

    const waveAudioUrlStatus = panel.querySelector('[data-cawf-wave-audio-url-status]');
    if (waveAudioUrlStatus instanceof HTMLElement) {
      const meta = state.waveAudioMeta;
      waveAudioUrlStatus.textContent = meta?.name ? `적용됨: ${meta.name}${meta.resolvedUrl && meta.resolvedUrl !== meta.url ? ' · 직접 오디오 자동 추출됨' : ''}` : '기본 Pixabay Gentle Ocean Shore Waves 출처 페이지가 들어가 있어요. 재생 시 직접 오디오 링크를 자동 추출해요';
    }

    const fireworksAudioUrlInput = panel.querySelector('[data-cawf-fireworks-audio-url]');
    if (fireworksAudioUrlInput instanceof HTMLInputElement && document.activeElement !== fireworksAudioUrlInput) {
      fireworksAudioUrlInput.value = String(s.fireworksAudioUrl || '');
    }

    const fireworksAudioUrlStatus = panel.querySelector('[data-cawf-fireworks-audio-url-status]');
    if (fireworksAudioUrlStatus instanceof HTMLElement) {
      const meta = state.fireworksAudioMeta;
      fireworksAudioUrlStatus.textContent = meta?.name ? `적용됨: ${meta.name}${meta.resolvedUrl && meta.resolvedUrl !== meta.url ? ' · 직접 오디오 자동 추출됨' : ''}` : '기본 Pixabay Firework Display 2 출처 페이지가 들어가 있어요. 재생 시 직접 오디오 링크를 자동 추출해요';
    }

    const underwaterAudioUrlInput = panel.querySelector('[data-cawf-underwater-audio-url]');
    if (underwaterAudioUrlInput instanceof HTMLInputElement && document.activeElement !== underwaterAudioUrlInput) {
      underwaterAudioUrlInput.value = String(s.underwaterAudioUrl || '');
    }

    const underwaterAudioUrlStatus = panel.querySelector('[data-cawf-underwater-audio-url-status]');
    if (underwaterAudioUrlStatus instanceof HTMLElement) {
      const meta = state.underwaterAudioMeta;
      underwaterAudioUrlStatus.textContent = meta?.name ? `적용됨: ${meta.name}${meta.resolvedUrl && meta.resolvedUrl !== meta.url ? ' · 직접 오디오 자동 추출됨' : ''}` : '기본 Pixabay Underwater 출처 페이지가 들어가 있어요. 재생 시 직접 오디오 링크를 자동 추출해요';
    }

    const status = panel.querySelector('[data-cawf-status]');
    if (status instanceof HTMLElement) {
      const effectLabel = EFFECT_LABELS[state.activeEffect] || '없음';
      const detectLabel = EFFECT_LABELS[state.lastDetectedEffect] || '없음';
      const timeLabel = EFFECT_LABELS[state.activeTimeEffect] || '없음';
      const timeDetectLabel = EFFECT_LABELS[state.lastDetectedTimeEffect] || '없음';
      const soundLabel = getActiveSoundLabel();
      const keywordLabel = state.lastDetectedKeyword || '없음';
      status.textContent = `화면 효과: ${effectLabel} · 키워드 감지: ${detectLabel} (${keywordLabel}) · 시간대: ${timeLabel} (${timeDetectLabel}) · ${soundLabel}`;
    }
  }

  function getActiveSoundLabel() {
    if (!state.settings.soundEnabled) return '소리: 없음';
    const playing = [];
    if (state.audioUnlocked && state.rainNodes) playing.push('빗소리');
    if (state.cricketAudioUnlocked && state.cricketNodes) playing.push('풀벌레');
    if (state.waveAudioUnlocked && state.waveNodes) playing.push('파도소리');
    if (state.fireworksAudioUnlocked && state.fireworksNodes) playing.push('불꽃놀이');
    if (state.underwaterAudioUnlocked && state.underwaterNodes) playing.push('수중음');
    if (state.spellAudioUnlocked && state.spellAudioPlaying) playing.push('마법 폭발');
    return playing.length ? `소리: ${playing.join(', ')}` : '소리: 없음';
  }

  function getAudioStatusText() {
    if (!state.settings.soundEnabled) return '사운드 꺼짐';

    const rain = (() => {
      if (!state.settings.audioUrl) return '빗소리 URL 없음';
      if (state.audioError) return `빗소리 오류: ${state.audioError}`;
      if (!state.audioUnlocked) return '브라우저 소리 허용 필요';
      if (state.rainNodes) return '빗소리 재생 중';
      return state.settings.audioFollowEffect ? '빗소리 대기: 비 효과 전용' : '빗소리 대기 중';
    })();

    const cricket = (() => {
      if (!state.settings.cricketAudioUrl) return '풀벌레 URL 없음';
      if (state.cricketAudioError) return `풀벌레 오류: ${state.cricketAudioError}`;
      if (!state.cricketAudioUnlocked) return '브라우저 소리 허용 필요';
      if (state.cricketNodes) return '풀벌레 재생 중';
      return state.settings.audioFollowEffect ? '풀벌레 대기: 반딧불이 전용' : '풀벌레 대기 중';
    })();

    const wave = (() => {
      if (!state.settings.waveAudioUrl) return '파도소리 URL 없음';
      if (state.waveAudioError) return `파도소리 오류: ${state.waveAudioError}`;
      if (!state.waveAudioUnlocked) return '브라우저 소리 허용 필요';
      if (state.waveNodes) return '파도소리 재생 중';
      return state.settings.audioFollowEffect ? '파도소리 대기: 밀려오는 파도 전용' : '파도소리 대기 중';
    })();

    const fireworks = (() => {
      if (!state.settings.fireworksAudioUrl) return '불꽃놀이 URL 없음';
      if (state.fireworksAudioError) return `불꽃놀이 오류: ${state.fireworksAudioError}`;
      if (!state.fireworksAudioUnlocked) return '브라우저 소리 허용 필요';
      if (state.fireworksNodes) return '불꽃놀이 재생 중';
      return state.settings.audioFollowEffect ? '불꽃놀이 대기: 불꽃놀이 전용' : '불꽃놀이 대기 중';
    })();

    const underwater = (() => {
      if (!state.settings.underwaterAudioUrl) return '수중 URL 없음';
      if (state.underwaterAudioError) return `수중 오류: ${state.underwaterAudioError}`;
      if (!state.underwaterAudioUnlocked) return '브라우저 소리 허용 필요';
      if (state.underwaterNodes) return '수중음 재생 중';
      return state.settings.audioFollowEffect ? '수중음 대기: 수중 전용' : '수중음 대기 중';
    })();

    const spell = (() => {
      if (state.spellAudioError) return `마법 폭발 오류: ${state.spellAudioError}`;
      if (!state.spellAudioUnlocked) return '마법 폭발: 브라우저 소리 허용 필요';
      if (state.spellAudioPlaying) return '마법 폭발 재생 중';
      return '마법 폭발 대기: 광점 해방 시 1회';
    })();

    return `${rain} · ${cricket} · ${wave} · ${spell} · ${fireworks} · ${underwater}`;
  }

  function getParticleCount(effect) {
    const counts = PARTICLE_COUNTS[effect] || PARTICLE_COUNTS.rain;
    let n = counts[state.settings.intensity] || counts.medium;
    if (IS_LOW_POWER) n = Math.round(n * (IS_MOBILE ? 0.40 : 0.55));
    else if (IS_MOBILE) n = Math.round(n * 0.62);
    return Math.max(1, n);
  }


  function getEffectSpeedSafe() {
    return clampValue(state.settings.effectSpeed, 0.2, 1.75, 1);
  }

  function getSlowRainDensityScale() {
    // 속도를 20%까지 낮추면 빗방울이 오래 남아 캔버스 객체 수가 과하게 쌓일 수 있다.
    // 느린 비일수록 생성량/최대량만 부드럽게 줄여서 화면 밀도와 부하를 같이 안정화한다.
    const speed = getEffectSpeedSafe();
    if (speed >= 1) return 1;
    return Math.max(0.48, Math.sqrt(speed));
  }

  function getRainSpawnRate() {
    const base = { low: 0.8, medium: 1.25, high: 1.9 }[state.settings.intensity] || 1.25;
    const powerScale = IS_LOW_POWER ? (IS_MOBILE ? 0.48 : 0.58) : 1;
    return base * getSlowRainDensityScale() * powerScale;
  }

  function getRainMaxDrops() {
    const base = { low: 80, medium: 130, high: 190 }[state.settings.intensity] || 130;
    const powerScale = IS_LOW_POWER ? (IS_MOBILE ? 0.42 : 0.55) : 1;
    return Math.max(IS_LOW_POWER ? 18 : 36, Math.round(base * getSlowRainDensityScale() * powerScale));
  }

  function getRainMaxSplashes() {
    const base = { low: 18, medium: 32, high: 48 }[state.settings.intensity] || 32;
    const powerScale = IS_LOW_POWER ? (IS_MOBILE ? 0.40 : 0.52) : 1;
    return Math.max(IS_LOW_POWER ? 4 : 10, Math.round(base * getSlowRainDensityScale() * powerScale));
  }

  function resizeRainCanvas(forceBounds = false) {
    ensureRoot();

    // 노트북 최적화: 캔버스 실제 크기 재확인은 매 프레임 필요하지 않다.
    // resize 이벤트/강제 호출은 그대로 즉시 반영하고, 일반 루프에서는 약 500ms 간격으로만 확인한다.
    const now = performance.now();
    if (!forceBounds && state.rainCtx && state.rainResizeAt && now - state.rainResizeAt < 500) return true;
    state.rainResizeAt = now;

    if (!applyRootBounds(forceBounds)) return false;

    const canvas = state.rainCanvas;
    if (!(canvas instanceof HTMLCanvasElement)) return false;

    const dpr = getCanvasDpr('rain');
    const width = Math.max(1, Math.floor(state.bounds?.width || canvas.clientWidth || 1));
    const height = Math.max(1, Math.floor(state.bounds?.height || canvas.clientHeight || 1));
    const nextWidth = Math.floor(width * dpr);
    const nextHeight = Math.floor(height * dpr);

    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      state.rainCtx = canvas.getContext('2d');
      if (state.rainCtx) state.rainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      updateRainFloorY();
      return true;
    }

    if (!state.rainCtx) {
      state.rainCtx = canvas.getContext('2d');
      if (state.rainCtx) state.rainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return !!state.rainCtx;
  }

  function updateRainFloorY(force = true) {
    // 노트북 최적화: 입력창 위치(채팅 바닥)는 거의 안 변하므로
    // 매 프레임 querySelector+getBoundingClientRect 하지 않고 ~500ms 간격으로만 다시 잰다.
    const now = performance.now();
    if (!force && state.rainHitFloorY && state.rainFloorAt && now - state.rainFloorAt < 500) {
      return state.rainHitFloorY;
    }
    state.rainFloorAt = now;

    const bounds = state.bounds || { left: 0, top: 0, width: window.innerWidth || 1, height: window.innerHeight || 1 };
    const canvasHeight = Math.max(1, bounds.height || 1);
    let floorY = canvasHeight - 10;

    // 채팅 입력창이 효과 영역 안에 있을 때만 입력창 위쪽을 '채팅창 바닥'으로 사용한다.
    const input = document.querySelector('main .__chat_input_textarea');
    const inputBox = input instanceof HTMLElement
      ? input.closest('div[class*="rounded-lg"][class*="border"]')
      : null;

    if (inputBox instanceof HTMLElement) {
      const rect = inputBox.getBoundingClientRect();
      const relativeTop = rect.top - bounds.top;
      if (relativeTop > canvasHeight * 0.45 && relativeTop < canvasHeight - 20) {
        floorY = Math.max(canvasHeight * 0.52, relativeTop - 8);
      }
    }

    state.rainHitFloorY = floorY;
    return floorY;
  }

  function makeCanvasRainDrop(random = Math.random) {
    const width = Math.max(1, state.bounds?.width || state.rainCanvas?.clientWidth || window.innerWidth || 1);
    const floorY = state.rainHitFloorY || updateRainFloorY();
    const far = random() < 0.45;
    const speedFactor = getEffectSpeedSafe();

    return {
      x: random() * width,
      y: -20 - random() * 90,
      vx: (random() - 0.5) * (far ? 0.08 : 0.16),
      vy: (far ? 420 + random() * 360 : 620 + random() * 520) * speedFactor,
      len: far ? 8 + random() * 13 : 14 + random() * 22,
      w: far ? 0.45 + random() * 0.45 : 0.75 + random() * 0.75,
      alpha: far ? 0.16 + random() * 0.14 : 0.28 + random() * 0.22,
      depth: far ? 0.42 : 0.72 + random() * 0.28,
      floorY
    };
  }

  function makeCanvasRainSplash(x, y, colorAlpha = 0.36) {
    const count = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i += 1) {
      if (state.rainSplashes.length > getRainMaxSplashes()) state.rainSplashes.shift();
      state.rainSplashes.push({
        x,
        y,
        vx: (Math.random() * 80 - 40),
        vy: -(Math.random() * 85 + 30),
        r: 0.7 + Math.random() * 1.6,
        alpha: colorAlpha,
        life: 0,
        ttl: 0.38 + Math.random() * 0.26
      });
    }
  }

  function clearRainCanvas() {
    const ctx = state.rainCtx;
    if (!ctx) return;
    ctx.clearRect(0, 0, Math.max(1, state.bounds?.width || 1), Math.max(1, state.bounds?.height || 1));
  }

  function drawCanvasRainFrame(ts) {
    if (
      state.activeEffect !== 'rain' ||
      !state.settings.enabled ||
      !state.settings.screenEffectEnabled ||
      !isEpisodePath() ||
      document.hidden ||
      state.effectInView === false ||
      state.root?.getAttribute?.('data-cawf-visible') !== 'true'
    ) {
      stopCanvasRain(true);
      return;
    }

    // 프레임 제한 판정을 레이아웃 확인보다 먼저 수행해, 건너뛸 프레임에서는 DOM 측정도 하지 않는다.
    const minFrameMs = 1000 / getCanvasFps('rain');
    if (state.rainFrameAt && ts - state.rainFrameAt < minFrameMs) {
      state.rainAnimId = window.requestAnimationFrame(drawCanvasRainFrame);
      return;
    }
    state.rainFrameAt = ts;

    if (!applyRootBounds(false)) {
      stopCanvasRain(true);
      return;
    }

    resizeRainCanvas(false);
    const ctx = state.rainCtx;
    if (!ctx) return;

    const width = Math.max(1, state.bounds?.width || state.rainCanvas?.clientWidth || 1);
    const height = Math.max(1, state.bounds?.height || state.rainCanvas?.clientHeight || 1);
    const last = state.rainLastTs || ts;
    const dt = Math.min(IS_LOW_POWER ? 0.08 : 0.042, Math.max(0.001, (ts - last) / 1000));
    state.rainLastTs = ts;

    updateRainFloorY(false);
    ctx.clearRect(0, 0, width, height);

    const maxDrops = getRainMaxDrops();
    let spawn = getRainSpawnRate() * dt * 60;
    while (spawn > 0 && state.rainDrops.length < maxDrops) {
      if (spawn >= 1 || Math.random() < spawn) state.rainDrops.push(makeCanvasRainDrop());
      spawn -= 1;
    }

    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(220,236,255,1)';

    // One shared breeze calculation per frame, no DOM work per drop.
    const breeze = (18 + Math.sin(ts * 0.00021) * 38 + Math.sin(ts * 0.00057) * 14) * getEffectSpeedSafe();
    const drops = state.rainDrops;
    let keptDrops = 0;
    for (let i = 0; i < drops.length; i += 1) {
      const d = drops[i];
      const prevY = d.y;
      const drift = d.vx + breeze * (d.depth || 0.6);
      d.x += drift * dt;
      d.y += d.vy * dt;
      const floorY = state.rainHitFloorY || d.floorY || (height - 12);

      ctx.globalAlpha = d.alpha;
      ctx.lineWidth = d.w;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + drift / Math.max(1, d.vy) * d.len, d.y + d.len);
      ctx.stroke();

      if (prevY + d.len < floorY && d.y + d.len >= floorY) {
        if (d.depth > 0.6) makeCanvasRainSplash(d.x, floorY, Math.max(0.18, d.alpha * 0.9));
        continue;
      }

      if (d.y > height + 30 || d.x < -40 || d.x > width + 40) continue;

      drops[keptDrops++] = d;
    }
    drops.length = keptDrops;

    ctx.fillStyle = 'rgba(220,236,255,1)';
    const splashes = state.rainSplashes;
    let keptSplashes = 0;
    for (let i = 0; i < splashes.length; i += 1) {
      const s = splashes[i];
      s.life += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 340 * dt;
      const p = Math.max(0, 1 - s.life / s.ttl);
      ctx.globalAlpha = s.alpha * p;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * (0.8 + (1 - p) * 0.7), 0, Math.PI * 2);
      ctx.fill();
      if (s.life >= s.ttl || s.r <= 0) continue;
      splashes[keptSplashes++] = s;
    }
    splashes.length = keptSplashes;

    ctx.restore();
    state.rainAnimId = window.requestAnimationFrame(drawCanvasRainFrame);
  }

  function startCanvasRain(reason = 'manual') {
    const root = ensureRoot();
    // canvas를 resize하기 전에 root 표시 조건을 먼저 세팅해 둔다.
    // display:none 상태에서 브라우저가 canvas layout 값을 0으로 주는 경우를 피하기 위한 방어 코드.
    root.setAttribute('data-effect', 'rain');
    root.setAttribute('data-cawf-visible', 'true');
    root.setAttribute('data-cawf-host-found', 'true');
    state.lastBoundsAt = 0;

    if (!resizeRainCanvas(true)) {
      stopCanvasRain(true);
      updateRootVisibility();
      return;
    }
    updateRainFloorY();
    if (state.rainAnimId) return;
    state.rainLastTs = 0;
    state.rainAnimId = window.requestAnimationFrame(drawCanvasRainFrame);
    log('canvas rain started', reason);
  }

  function stopCanvasRain(clear = false) {
    if (state.rainAnimId) {
      window.cancelAnimationFrame(state.rainAnimId);
      state.rainAnimId = 0;
    }
    state.rainLastTs = 0;
    state.rainFrameAt = 0;
    state.rainResizeAt = 0;
    state.rainDrops = [];
    state.rainSplashes = [];
    if (clear) clearRainCanvas();
  }

  function getDurationRange(effect) {
    const speed = getEffectSpeedSafe();
    if (effect === 'rain') return [1.05 / speed, 1.9 / speed];
    if (effect === 'snow') return [8.5 / speed, 17 / speed];
    if (effect === 'sakura') return [7.5 / speed, 15 / speed];
    if (effect === 'leaves') return [6.8 / speed, 13.5 / speed];
    if (effect === 'greenLeaves') return [7.2 / speed, 14.2 / speed];
    if (effect === 'feathers') return [20 / speed, 34 / speed];
    if (effect === 'butterflies') return [26 / speed, 52 / speed];
    if (effect === 'fireflies') return [100 / speed, 200 / speed];
    if (effect === 'mana') return [18 / speed, 36 / speed];
    return [8 / speed, 14 / speed];
  }

  function getParticleLayerSize() {
    const rect = state.bounds || state.root?.getBoundingClientRect?.() || null;
    const width = Math.max(1, Math.round(Number(rect?.width || window.innerWidth || 1)));
    const height = Math.max(1, Math.round(Number(rect?.height || window.innerHeight || 1)));
    return { width, height };
  }

  function makeParticle(effect, random, index = 0, count = 1) {
    const span = document.createElement('span');
    span.className = 'cawf-particle';

    const [minDur, maxDur] = getDurationRange(effect);
    const dur = minDur + random() * (maxDur - minDur);
    const x = random() * 105 - 3;
    const delay = -random() * dur;
    const alphaBase = effect === 'rain' ? 0.18 + random() * 0.28 : 0.34 + random() * 0.55;

    span.style.setProperty('--x', `${x.toFixed(2)}vw`);
    span.style.setProperty('--delay', `${delay.toFixed(3)}s`);
    span.style.setProperty('--dur', `${dur.toFixed(3)}s`);
    span.style.setProperty('--a', alphaBase.toFixed(3));

    if (effect === 'rain') {
      // v0.2.1: 사선/폭우 연출 제거. 위에서 아래로 곧게 떨어지는 얇은 비만 남긴다.
      const isFar = random() < 0.55;
      if (isFar) {
        span.style.setProperty('--len', `${(8 + random() * 9).toFixed(2)}vh`);
        span.style.setProperty('--w', `${(0.35 + random() * 0.35).toFixed(2)}px`);
        span.style.setProperty('--drift', '0px');
        span.style.setProperty('--angle', '0deg');
        span.style.setProperty('--blur', `${(0.45 + random() * 0.65).toFixed(2)}px`);
        span.style.setProperty('--a', (alphaBase * 0.55).toFixed(3));
        span.style.setProperty('--dur', `${(dur * 1.18).toFixed(3)}s`);
      } else {
        span.style.setProperty('--len', `${(11 + random() * 13).toFixed(2)}vh`);
        span.style.setProperty('--w', `${(0.55 + random() * 0.65).toFixed(2)}px`);
        span.style.setProperty('--drift', '0px');
        span.style.setProperty('--angle', '0deg');
        span.style.setProperty('--blur', '0px');
      }
    } else if (effect === 'snow') {
      const crystalRatio = { low: 0.28, medium: 0.32, high: 0.36 }[state.settings.intensity] || 0.32;
      const crystalMinimum = Math.min(count, 3);
      const crystalTarget = Math.min(count, Math.max(crystalMinimum, Math.round(count * crystalRatio)));
      const crystalSlot = (index + ((state.particleSeed || 0) % Math.max(1, count))) % Math.max(1, count);
      const isCrystal = crystalSlot < crystalTarget;
      const size = isCrystal ? (6.2 + random() * 6.2) : (2.2 + random() * 6.5);
      span.style.setProperty('--size', `${size.toFixed(2)}px`);
      span.style.setProperty('--sway', `${(-9 + random() * 18).toFixed(2)}vw`);
      if (isCrystal) {
        span.dataset.snowShape = 'crystal';
        const shapeUrl = SNOWFLAKE_SHAPE_URLS[Math.floor(random() * SNOWFLAKE_SHAPE_URLS.length)] || SNOWFLAKE_SHAPE_URLS[0];
        const spinDirection = random() < .5 ? -1 : 1;
        const turnDirection = random() < .5 ? -1 : 1;
        span.style.setProperty('--snowflake-image', `url("${shapeUrl}")`);
        span.style.setProperty('--crystal-spin', `${(spinDirection * (105 + random() * 110)).toFixed(1)}deg`);
        span.style.setProperty('--crystal-tilt', `${(22 + random() * 28).toFixed(1)}deg`);
        span.style.setProperty('--crystal-turn', `${(turnDirection * (48 + random() * 24)).toFixed(1)}deg`);
      }
      // 크기·초점·낙하 속도를 함께 묶어 가까운 눈/중간 눈/먼 눈의 세 층을 만든다.
      if (size > 6) {
        span.style.setProperty('--blur', `${(0.65 + random() * 0.95).toFixed(2)}px`);
        span.style.setProperty('--glow', `${(13 + random() * 7).toFixed(2)}px`);
        span.style.setProperty('--glow-a', (0.24 + random() * 0.14).toFixed(3));
        span.style.setProperty('--a', (0.34 + random() * 0.28).toFixed(3));
        span.style.setProperty('--dur', `${(dur * (0.76 + random() * 0.12)).toFixed(3)}s`);
        span.style.setProperty('--sway', `${(-12 + random() * 24).toFixed(2)}vw`);
      } else if (size > 4) {
        span.style.setProperty('--blur', `${(0.12 + random() * 0.34).toFixed(2)}px`);
        span.style.setProperty('--glow', `${(8 + random() * 5).toFixed(2)}px`);
        span.style.setProperty('--glow-a', (0.30 + random() * 0.15).toFixed(3));
        span.style.setProperty('--a', (0.48 + random() * 0.30).toFixed(3));
      } else {
        span.style.setProperty('--blur', '0px');
        span.style.setProperty('--glow', `${(4 + random() * 4).toFixed(2)}px`);
        span.style.setProperty('--glow-a', (0.28 + random() * 0.14).toFixed(3));
        span.style.setProperty('--a', (0.50 + random() * 0.28).toFixed(3));
        span.style.setProperty('--dur', `${(dur * (1.08 + random() * 0.14)).toFixed(3)}s`);
      }
      if (isCrystal) {
        span.style.setProperty('--blur', `${(0.02 + random() * 0.10).toFixed(2)}px`);
        span.style.setProperty('--glow', `${(6 + random() * 4).toFixed(2)}px`);
        span.style.setProperty('--crystal-glow', `${(1.8 + random() * 2.4).toFixed(2)}px`);
        span.style.setProperty('--glow-a', (0.38 + random() * 0.14).toFixed(3));
        span.style.setProperty('--a', (0.70 + random() * 0.20).toFixed(3));
      }
      if (size <= 4) {
        span.style.setProperty('--dur', `${(dur * 1.45).toFixed(3)}s`);
        span.style.setProperty('--sway', `${(-3 + random() * 6).toFixed(2)}vw`);
        span.style.setProperty('--a', (0.28 + random() * 0.24).toFixed(3));
      }
    } else if (effect === 'sakura') {
      span.style.setProperty('--size', `${(8 + random() * 12).toFixed(2)}px`);
      span.style.setProperty('--drift', `${(-18 + random() * 36).toFixed(2)}vw`);
      span.style.setProperty('--rot', `${(110 + random() * 390).toFixed(2)}deg`);
      span.style.setProperty('--spin', `${(-55 + random() * 110).toFixed(2)}deg`);
      span.style.setProperty('--petal-bg', SAKURA_TONES[Math.floor(random() * SAKURA_TONES.length)] || SAKURA_TONES[0]);
      span.style.setProperty('--petal-crease-a', (0.24 + random() * 0.22).toFixed(3));
      span.dataset.petalShape = random() < 0.68 ? 'notched' : 'soft';
    } else if (effect === 'leaves') {
      const tone = AUTUMN_LEAF_TONES[Math.floor(random() * AUTUMN_LEAF_TONES.length)] || AUTUMN_LEAF_TONES[0];
      span.style.setProperty('--size', `${(10 + random() * 14).toFixed(2)}px`);
      span.style.setProperty('--drift', `${(-22 + random() * 44).toFixed(2)}vw`);
      span.style.setProperty('--rot', `${(160 + random() * 520).toFixed(2)}deg`);
      span.style.setProperty('--spin', `${(-70 + random() * 140).toFixed(2)}deg`);
      span.style.setProperty('--leaf-bg', tone[0]);
      span.style.setProperty('--vein-color', tone[1]);
    } else if (effect === 'greenLeaves') {
      const tone = GREEN_LEAF_TONES[Math.floor(random() * GREEN_LEAF_TONES.length)] || GREEN_LEAF_TONES[0];
      span.style.setProperty('--size', `${(10 + random() * 14).toFixed(2)}px`);
      span.style.setProperty('--drift', `${(-20 + random() * 40).toFixed(2)}vw`);
      span.style.setProperty('--rot', `${(140 + random() * 420).toFixed(2)}deg`);
      span.style.setProperty('--spin', `${(-64 + random() * 128).toFixed(2)}deg`);
      span.style.setProperty('--leaf-bg', tone[0]);
      span.style.setProperty('--vein-color', tone[1]);
    } else if (effect === 'feathers') {
      const shape = 'flight';
      const tiltDirection = random() < 0.5 ? -1 : 1;
      const sizeRoll = random();
      const featherSize = sizeRoll < 0.50
        ? 29 + random() * 6
        : sizeRoll < 0.85
          ? 37 + random() * 6
          : 46 + random() * 7;
      span.dataset.featherShape = shape;
      span.style.setProperty('--feather-image', 'url("' + FEATHER_SVG_URLS[0] + '")');
      span.style.setProperty('--size', `${featherSize.toFixed(2)}px`);
      span.style.setProperty('--sway-a', `${(4 + random() * 6).toFixed(2)}vw`);
      span.style.setProperty('--sway-b', `${(5 + random() * 6).toFixed(2)}vw`);
      span.style.setProperty('--start-z', `${(-52 + random() * 104).toFixed(2)}deg`);
      span.style.setProperty('--tilt-a', `${(tiltDirection * (12 + random() * 12)).toFixed(2)}deg`);
      span.style.setProperty('--tilt-b', `${(tiltDirection * -(14 + random() * 13)).toFixed(2)}deg`);
      span.style.setProperty('--tilt-c', `${(tiltDirection * (8 + random() * 10)).toFixed(2)}deg`);
      span.style.setProperty('--mirror', random() < 0.5 ? '-1' : '1');
      span.style.setProperty('--scale', (0.90 + random() * 0.16).toFixed(3));
      span.style.setProperty('--pivot-x', `${(20 + random() * 10).toFixed(2)}%`);
      span.style.setProperty('--pivot-y', `${(78 + random() * 12).toFixed(2)}%`);
      span.style.setProperty('--a', (0.70 + random() * 0.16).toFixed(3));
    } else if (effect === 'butterflies') {
      const { width: layerWidth, height: layerHeight } = getParticleLayerSize();
      const tone = BUTTERFLY_TONES[Math.floor(random() * BUTTERFLY_TONES.length)] || BUTTERFLY_TONES[0];
      const slotCount = Math.max(1, count);
      const coprimeStep = (() => {
        for (const step of [7, 5, 11, 13, 3, 17, 19, 1]) {
          if (gcdInt(step, slotCount) === 1) return step;
        }
        return 1;
      })();
      const slot = (index * coprimeStep) % slotCount;
      const centerX = 6 + ((slot + 0.5) / slotCount) * 88;
      const toPx = (pct, size) => Math.round((Math.max(0, Math.min(100, pct)) / 100) * Math.max(1, size));
      const anyX = () => toPx(4 + random() * 92, layerWidth);
      const midY = () => toPx(10 + random() * 78, layerHeight);
      span.style.setProperty('--size', `${(11 + random() * 8).toFixed(2)}px`);
      span.style.setProperty('--wing-bg', tone[0]);
      span.style.setProperty('--wing-edge', tone[1]);
      span.style.setProperty('--flap', `${(0.24 + random() * 0.2).toFixed(3)}s`);
      span.style.setProperty('--flap-delay', `${(-random() * 0.4).toFixed(3)}s`);
      span.style.setProperty('--x0', `${toPx(Math.max(2, Math.min(98, centerX + (-12 + random() * 24))), layerWidth)}px`);
      span.style.setProperty('--y0', `${midY()}px`);
      span.style.setProperty('--x1', `${anyX()}px`);
      span.style.setProperty('--y1', `${midY()}px`);
      span.style.setProperty('--x2', `${anyX()}px`);
      span.style.setProperty('--y2', `${midY()}px`);
      span.style.setProperty('--x3', `${anyX()}px`);
      span.style.setProperty('--y3', `${midY()}px`);
      span.style.setProperty('--a', (0.60 + random() * 0.32).toFixed(3));
    } else if (effect === 'fireflies') {
      // slyka85 CodePen original: 25 .firefly nodes, 4px, random x/y, scale .5~1.25, 100~200s bezier movement.
      // v0.6.35: keep the gentle random motion, but distribute starting/anchor points by horizontal slots so the left side does not go empty by chance.
      // v0.6.46: generate px coordinates from the active effect-layer size instead of viewport vw/vh, so created nodes stay inside the clipped FX layer.
      const { width: layerWidth, height: layerHeight } = getParticleLayerSize();
      const slotCount = Math.max(1, count);
      // index*7 % count는 count가 7과 약수를 공유하면(예: 14) 일부 슬롯에만 몰려 한쪽으로 쏠린다.
      // count와 서로소인 곱수를 골라 전 슬롯을 고르게 순회시킨다.
      const coprimeStep = (() => {
        for (const step of [7, 5, 11, 13, 3, 17, 19, 1]) {
          if (gcdInt(step, slotCount) === 1) return step;
        }
        return 1;
      })();
      const slot = (index * coprimeStep) % slotCount;
      const centerX = 4 + ((slot + 0.5) / slotCount) * 92;
      const clampPct = (value) => Math.max(2, Math.min(98, value));
      const toPx = (pct, size) => Math.round((Math.max(0, Math.min(100, pct)) / 100) * Math.max(1, size));
      // 시작점(x0/y0)은 슬롯 기준으로 고르게 깔고, 경유점(x1~x3)은 슬롯에 가두지 않고
      // 레이어 전체 폭에서 자유롭게 떠다니게 해서 오른쪽까지 골고루 분포시킨다.
      const startX = () => toPx(clampPct(centerX + (-14 + random() * 28)), layerWidth);
      const anyX = () => toPx(2 + random() * 96, layerWidth);
      const anyY = () => toPx(5 + random() * 90, layerHeight);

      const flyScale = 0.5 + random() * 0.75;
      const flyTone = FIREFLY_TONES[Math.floor(random() * FIREFLY_TONES.length)] || FIREFLY_TONES[0];
      // 슬롯 순환으로 낮은 입자 수에서도 세 점멸형이 반드시 함께 나오도록 한다(단일 50% / 이중 30% / 긴 암전 20%).
      const blinkSlot = (index * 7 + (state.particleSeed >>> 0)) % 10;
      const blinkPattern = blinkSlot < 5 ? 'single' : blinkSlot < 8 ? 'double' : 'long-pause';
      const blinkRange = blinkPattern === 'single'
        ? [13, 22]
        : blinkPattern === 'double'
          ? [18, 30]
          : [28, 42];
      const blinkDuration = blinkRange[0] + random() * (blinkRange[1] - blinkRange[0]);
      span.dataset.blinkPattern = blinkPattern;
      span.style.setProperty('--size', '4px');
      span.style.setProperty('--scale', flyScale.toFixed(3));
      span.style.setProperty('--fly-core', flyTone[0]);
      span.style.setProperty('--fly-glow-1', flyTone[1]);
      span.style.setProperty('--fly-glow-2', flyTone[2]);
      span.style.setProperty('--fly-glow-near', `${(13 + flyScale * 6).toFixed(2)}px`);
      span.style.setProperty('--fly-glow-far', `${(25 + flyScale * 10).toFixed(2)}px`);
      span.style.setProperty('--x0', `${startX()}px`);
      span.style.setProperty('--y0', `${anyY()}px`);
      span.style.setProperty('--x1', `${anyX()}px`);
      span.style.setProperty('--y1', `${anyY()}px`);
      span.style.setProperty('--x2', `${anyX()}px`);
      span.style.setProperty('--y2', `${anyY()}px`);
      span.style.setProperty('--x3', `${anyX()}px`);
      span.style.setProperty('--y3', `${anyY()}px`);
      span.style.setProperty('--dur', `${((100 + random() * 100) / getEffectSpeedSafe()).toFixed(2)}s`);
      span.style.setProperty('--fly-focus', flyScale < 0.75 ? '0.4px' : '0px');
      span.style.setProperty('--size', `${(2.6 + flyScale * 1.2).toFixed(2)}px`);
      span.style.setProperty('--delay', `${(-random() * 120).toFixed(3)}s`);
      span.style.setProperty('--blink', `${blinkDuration.toFixed(2)}s`);
      span.style.setProperty('--blink-delay', `${(-random() * blinkDuration).toFixed(3)}s`);
    } else if (effect === 'mana') {
      // Mana particle 원본은 canvas + GSAP sprites(대량)라, 마우스 추적 없이 소수 sprite 경로만 이식한다.
      const shapeRoll = random();
      const shape = shapeRoll < 0.45 ? 'dot' : shapeRoll < 0.76 ? 'spark' : 'diamond';
      span.dataset.magicShape = shape;
      span.style.setProperty('--size', `${(shape === 'dot' ? 3 + random() * 6 : 6 + random() * 12).toFixed(2)}px`);
      span.style.setProperty('--radius', shape === 'diamond' ? '22%' : '999px');
      span.style.setProperty('--a', (0.22 + random() * 0.46).toFixed(3));
      span.style.setProperty('--dur', `${(10 + random() * 12).toFixed(2)}s`);
      span.style.setProperty('--delay', `${(-random() * 16).toFixed(3)}s`);
      span.style.setProperty('--spark-rot', `${(random() * 180).toFixed(2)}deg`);
      span.style.setProperty('--spark-a', shape === 'dot' ? '0' : (0.18 + random() * 0.38).toFixed(3));
      const baseX = 8 + random() * 84;
      const startY = 76 + random() * 28;
      span.style.setProperty('--x0', `${baseX.toFixed(2)}vw`);
      span.style.setProperty('--y0', `${startY.toFixed(2)}vh`);
      span.style.setProperty('--x1', `${(baseX + (-10 + random() * 20)).toFixed(2)}vw`);
      span.style.setProperty('--y1', `${(startY - (18 + random() * 22)).toFixed(2)}vh`);
      span.style.setProperty('--x2', `${(baseX + (-18 + random() * 36)).toFixed(2)}vw`);
      span.style.setProperty('--y2', `${(startY - (42 + random() * 28)).toFixed(2)}vh`);
      span.style.setProperty('--x3', `${(baseX + (-26 + random() * 52)).toFixed(2)}vw`);
      span.style.setProperty('--y3', `${(startY - (70 + random() * 35)).toFixed(2)}vh`);
      span.style.setProperty('--r0', `${(random() * 360).toFixed(2)}deg`);
      span.style.setProperty('--r1', `${(random() * 360).toFixed(2)}deg`);
      span.style.setProperty('--r2', `${(random() * 360).toFixed(2)}deg`);
      span.style.setProperty('--r3', `${(random() * 360).toFixed(2)}deg`);
      span.style.setProperty('--s0', (0.10 + random() * 0.22).toFixed(3));
      span.style.setProperty('--s1', (0.56 + random() * 0.62).toFixed(3));
      span.style.setProperty('--s2', (0.28 + random() * 0.50).toFixed(3));
      span.style.setProperty('--s3', (0.08 + random() * 0.20).toFixed(3));
      if (shape === 'diamond') {
        span.style.setProperty('--magic-bg', 'linear-gradient(135deg, rgba(255,255,255,.96), rgba(155,205,255,.76) 42%, rgba(130,94,255,.34) 72%, rgba(130,94,255,0))');
      }

    }

    return span;
  }


  function pauseGalaxyAnimation() {
    const runtime = state.ambientEffectRuntime;
    if (!runtime || runtime.kind !== 'galaxy') return false;
    runtime.running = false;
    runtime.last = 0;
    if (state.ambientAnimId) {
      window.cancelAnimationFrame(state.ambientAnimId);
      state.ambientAnimId = 0;
    }
    return true;
  }

  function stopAmbientAnimation() {
    stopUnderwater();
    if (state.ambientAnimId) {
      window.cancelAnimationFrame(state.ambientAnimId);
      state.ambientAnimId = 0;
    }
    const runtime = state.ambientEffectRuntime;
    if (typeof runtime?.cleanup === 'function') {
      try { runtime.cleanup(); } catch (_) {}
    }
    state.ambientLastTs = 0;
    state.ambientFrameAt = 0;
    state.ambientEffectRuntime = null;
    state.ambientCanvas = null;
    state.ambientCtx = null;
  }

  function clearAmbientChildren() {
    stopAmbientAnimation();
    const ambient = state.ambient;
    if (ambient instanceof HTMLElement && ambient.childNodes.length) ambient.replaceChildren();
    state.ambientSignature = '';
  }

  function makeAuroraRay(index, random) {
    const ray = document.createElement('span');
    ray.className = 'cawf-aurora-ray';
    ray.setAttribute('aria-hidden', 'true');

    // True Yukon Aurora raw-ish mapping:
    // original Pug creates 0..200 .ray elements; SCSS distributes small/medium/big strands.
    const type = index % 10 < 5 ? 'small' : (index % 10 < 8 ? 'medium' : 'big');
    const palette = [
      ['rgba(24,196,153,.72)', 'rgba(79,255,225,.26)'],
      ['rgba(5,225,164,.64)', 'rgba(79,255,225,.22)'],
      ['rgba(20,190,255,.58)', 'rgba(164,106,255,.20)'],
      ['rgba(126,255,206,.62)', 'rgba(68,240,178,.18)'],
      ['rgba(160,110,255,.42)', 'rgba(79,255,225,.16)']
    ];
    const colors = palette[index % palette.length];

    const w = type === 'small' ? 2 + random() * 3 : (type === 'medium' ? 8 + random() * 12 : 18 + random() * 20);
    const h = type === 'small' ? 24 + random() * 20 : (type === 'medium' ? 30 + random() * 24 : 36 + random() * 28);
    const blur = type === 'small' ? 0.8 + random() * 1.8 : (type === 'medium' ? 4 + random() * 5 : 8 + random() * 8);
    const opacity = type === 'small' ? 0.03 + random() * 0.13 : (type === 'medium' ? 0.08 + random() * 0.13 : 0.06 + random() * 0.13);

    ray.style.setProperty('--x', `${(-8 + random() * 116).toFixed(2)}%`);
    ray.style.setProperty('--top', `${(-28 + random() * 18).toFixed(2)}%`);
    ray.style.setProperty('--w', `${w.toFixed(2)}px`);
    ray.style.setProperty('--h', `${h.toFixed(2)}%`);
    ray.style.setProperty('--blur', `${blur.toFixed(2)}px`);
    ray.style.setProperty('--ray-opacity', opacity.toFixed(3));
    ray.style.setProperty('--tilt', `${(-18 + random() * 36).toFixed(2)}deg`);
    ray.style.setProperty('--move', `${(-64 + random() * 128).toFixed(2)}px`);
    ray.style.setProperty('--dur', `${(10 + random() * 18).toFixed(2)}s`);
    ray.style.setProperty('--wiggle-dur', `${(18 + random() * 28).toFixed(2)}s`);
    ray.style.setProperty('--delay', `${(-random() * 12).toFixed(3)}s`);
    ray.style.setProperty('--wiggle-delay', `${(-random() * 18).toFixed(3)}s`);
    ray.style.setProperty('--c1', colors[0]);
    ray.style.setProperty('--c2', colors[1]);
    return ray;
  }


  function makeCandlelightMote(random) {
    const mote = document.createElement('i');
    mote.setAttribute('aria-hidden', 'true');

    const depth = random();
    let duration;
    let size;
    let alpha;
    let blur;
    let glow;
    let glowAlpha;
    let rise;
    if (depth < 0.22) {
      // 가까운 먼지는 크지만 흐리고 옅게 지나가게 한다.
      duration = 18 + random() * 13;
      size = 3.2 + random() * 2.8;
      alpha = 0.12 + random() * 0.18;
      blur = 0.55 + random() * 0.85;
      glow = 8 + random() * 6;
      glowAlpha = 0.18 + random() * 0.12;
      rise = -(18 + random() * 24);
    } else if (depth < 0.68) {
      duration = 13 + random() * 11;
      size = 1.5 + random() * 2.1;
      alpha = 0.24 + random() * 0.36;
      blur = random() * 0.28;
      glow = 5 + random() * 4;
      glowAlpha = 0.26 + random() * 0.14;
      rise = -(14 + random() * 21);
    } else {
      // 먼 먼지는 작고 비교적 선명하며 더 오래 남는다.
      duration = 18 + random() * 14;
      size = 0.8 + random() * 1.15;
      alpha = 0.18 + random() * 0.24;
      blur = random() * 0.16;
      glow = 3 + random() * 3;
      glowAlpha = 0.20 + random() * 0.12;
      rise = -(10 + random() * 16);
    }

    const nearLeft = random() < 0.5;
    const clusterX = nearLeft ? 8 + random() * 22 : 74 + random() * 22;

    mote.style.setProperty('--x', `${(random() < 0.25 ? random() * 100 : clusterX).toFixed(1)}%`);
    mote.style.setProperty('--y0', `${(2 + random() * 14).toFixed(1)}%`);
    mote.style.setProperty('--size', `${size.toFixed(2)}px`);
    mote.style.setProperty('--alpha', alpha.toFixed(3));
    mote.style.setProperty('--alpha-mid', (alpha * 0.9).toFixed(3));
    mote.style.setProperty('--alpha-end', (alpha * 0.5).toFixed(3));
    mote.style.setProperty('--dur', `${duration.toFixed(2)}s`);
    mote.style.setProperty('--delay', `${(-random() * duration).toFixed(2)}s`);
    mote.style.setProperty('--sway', `${(-2.5 + random() * 5).toFixed(2)}vw`);
    mote.style.setProperty('--rise', `${rise.toFixed(2)}vh`);
    mote.style.setProperty('--mote-blur', `${blur.toFixed(2)}px`);
    mote.style.setProperty('--mote-glow', `${glow.toFixed(2)}px`);
    mote.style.setProperty('--mote-glow-a', glowAlpha.toFixed(3));
    return mote;
  }

  function getCandlelightMoteCount() {
    const base = PARTICLE_COUNTS.candlelight?.[state.settings.intensity] || PARTICLE_COUNTS.candlelight.medium;
    const scale = IS_LOW_POWER ? (IS_MOBILE ? 0.40 : 0.55) : (IS_MOBILE ? 0.66 : 1);
    return Math.max(0, Math.round(base * scale));
  }

  function getShoreLayerHtml() {
    // 외부 이미지/영상 없이, CSS 그라데이션 + inline SVG 포말 + 작은 거품 입자로
    // 화면 중앙 근처에서 바다가 시작되고, 파도/포말이 아래쪽으로 밀려 내려오는 얕은 바다 착시를 만든다.
    // v0.9.0: shore 전용 마크업 안에 원근 바다를 넣고, 바다는 blend로 시간대 색을 흡수한다.
    // v0.9.4: 모래사장 띠를 제거하고, foam/wash가 중앙에서 갑자기 생기지 않도록 위쪽에서 먼저 형성되게 조정한다.
    // v0.9.5: 포말 fill을 파도 진행 방향의 뒤쪽(위쪽)으로 닫아, 아래에서 치는 파도처럼 보이는 착시를 줄인다.
    // v0.9.7: 바다 본체 위에 아주 얇은 윤슬/물비늘 sliver를 깔아 영상 같은 반짝임을 보강한다.
    // v0.9.10: 무거운 물막은 제거하고, 포말선 뒤의 바다 면이 살짝 흔들리는 수면 잔물결만 남긴다.
    // v0.9.12: 약한 SVG displacement + 수면 undulation 레이어로 포말선 자체가 물처럼 미세하게 비틀리게 한다.
    // v0.9.20: SVG displacement는 정적 질감으로 고정하고, 거의 보이지 않는 far 레이어를 제거해 shore 부하를 낮춘다.
    const pathBack = 'M-94 92 C4 58 82 118 170 92 C250 68 316 130 398 104 C482 76 548 74 632 118 C716 162 782 88 868 106 C954 124 1012 68 1100 98 C1184 126 1238 82 1300 108';
    const pathMain = 'M-98 124 C-2 74 86 154 176 120 C260 90 328 174 418 134 C502 98 570 108 650 158 C736 212 798 104 890 132 C978 160 1028 82 1120 122 C1200 158 1248 104 1308 132';
    const pathFront = 'M-106 162 C-8 104 82 190 178 156 C266 126 336 226 432 180 C516 140 586 150 666 204 C758 264 816 140 910 172 C1000 202 1052 124 1142 166 C1224 204 1264 150 1312 178';
    const pathLace = 'M-102 136 C-12 96 76 174 170 128 C252 86 334 190 426 144 C510 104 578 126 660 172 C748 218 810 118 904 148 C990 174 1042 102 1132 140 C1212 178 1248 126 1308 150';

    const lowDetail = IS_MOBILE || IS_LOW_POWER;
    const roughFilterNear = lowDetail ? '' : ' filter="url(#cawf-foam-rough-near)"';
    // Far/back foam is already blurred and low-opacity; keep displacement only on near foam for much cheaper desktop rendering.
    const roughFilterMid = '';
    const roughDefs = lowDetail ? '' : `<svg class="cawf-shore-defs" width="0" height="0" viewBox="0 0 0 0" aria-hidden="true" focusable="false">
        <defs>
          <!-- v0.9.20: feDisplacementMap scale 애니메이션을 제거해 매 프레임 SVG 노이즈 재계산을 막는다.
               near 포말의 찢어진 질감만 정적으로 유지하고, 실제 이동은 transform 애니메이션이 담당한다. -->
          <filter id="cawf-foam-rough-near" x="-20%" y="-30%" width="140%" height="150%" color-interpolation-filters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.074" numOctaves="2" seed="23" stitchTiles="stitch" result="n"/>
            <feDisplacementMap in="SourceGraphic" in2="n" scale="11" xChannelSelector="R" yChannelSelector="G"/>
          </filter>
        </defs>
      </svg>`;

    const rnd = seededRandom(((state.particleSeed || 1) ^ 0x51a5ea ^ 0x902) >>> 0);


    const fleckCount = IS_LOW_POWER ? (IS_MOBILE ? 14 : 24) : (IS_MOBILE ? 28 : 50);
    const flecks = Array.from({ length: fleckCount }, () => {
      const depthRoll = rnd();
      const depth = depthRoll < 0.38 ? 'far' : (depthRoll < 0.72 ? 'mid' : 'near');
      const x = (-5 + rnd() * 110).toFixed(2);
      let yMin, yMax, baseW, baseH, opBase, opSpan, blurBase, driftY, durBase;
      // CSS에서 bottom:var(--y)를 쓰므로 far는 높게, near는 낮게. transform은 위→아래로 흐르게 양수 dy를 사용한다.
      if (depth === 'far') {
        yMin = 66; yMax = 90; baseW = 0.40 + rnd() * 0.95; baseH = 0.28 + rnd() * 0.55; opBase = 0.14; opSpan = 0.24; blurBase = 0.20 + rnd() * 0.42; driftY = 22 + rnd() * 18; durBase = 7.2 + rnd() * 7.8;
      } else if (depth === 'mid') {
        yMin = 38; yMax = 70; baseW = 0.70 + rnd() * 1.75; baseH = 0.38 + rnd() * 0.92; opBase = 0.19; opSpan = 0.34; blurBase = rnd() < 0.42 ? rnd() * 0.28 : 0; driftY = 34 + rnd() * 26; durBase = 5.8 + rnd() * 7.0;
      } else {
        yMin = 13; yMax = 45; baseW = 1.00 + rnd() * 2.80; baseH = 0.48 + rnd() * 1.16; opBase = 0.23; opSpan = 0.42; blurBase = rnd() < 0.32 ? rnd() * 0.22 : 0; driftY = 48 + rnd() * 36; durBase = 4.8 + rnd() * 6.2;
      }
      const y = (yMin + Math.pow(rnd(), 0.82) * (yMax - yMin)).toFixed(2);
      const dx = (-28 + rnd() * 56);
      const dx2 = dx * (0.32 + rnd() * 0.82) + (-14 + rnd() * 28);
      const dx3 = dx * (0.92 + rnd() * 0.76) + (-22 + rnd() * 44);
      const opRaw = opBase + rnd() * opSpan;
      const rotRaw = -28 + rnd() * 56;
      return `<i aria-hidden="true" class="cawf-shore-fleck-${depth}" style="--x:${x}%;--y:${y}%;--dx:${dx.toFixed(1)}px;--dx2:${dx2.toFixed(1)}px;--dx3:${dx3.toFixed(1)}px;--dy3:${driftY.toFixed(1)}px;--w:${baseW.toFixed(2)}px;--h:${baseH.toFixed(2)}px;--op:${opRaw.toFixed(3)};--op2:${(opRaw * (0.42 + rnd() * 0.22)).toFixed(3)};--foam-alpha:${(depth === 'near' ? 0.88 : depth === 'mid' ? 0.82 : 0.70).toFixed(2)};--blur:${blurBase.toFixed(2)}px;--dur:calc(${durBase.toFixed(2)}s / var(--cawf-shore-speed-safe));--delay:${(-rnd() * 12.8).toFixed(2)}s;--rot:${rotRaw.toFixed(1)}deg;--rot2:${(-rotRaw * (0.62 + rnd() * 0.54)).toFixed(1)}deg"></i>`;
    }).join('');

    const yoonseulCount = IS_LOW_POWER ? (IS_MOBILE ? 10 : 16) : (IS_MOBILE ? 18 : 32);
    const yoonseul = Array.from({ length: yoonseulCount }, (_, index) => {
      // 윤슬길: 중앙 쪽에 더 많이, 가장자리에는 얇게 흩뿌린다. 점이 아니라 짧은 비늘형 빛조각.
      const laneRoll = rnd();
      const laneCenter = laneRoll < 0.64 ? (38 + rnd() * 24) : (8 + rnd() * 84);
      const x = Math.max(3, Math.min(97, laneCenter + (-7 + rnd() * 14))).toFixed(2);
      const depth = rnd();
      const y = (depth < 0.32 ? 18 + rnd() * 20 : depth < 0.74 ? 34 + rnd() * 30 : 58 + rnd() * 24).toFixed(2);
      const farFactor = Number(y) < 34 ? 0.58 : (Number(y) < 58 ? 0.82 : 1.0);
      const w = ((5.5 + rnd() * 22) * farFactor).toFixed(2);
      const h = ((0.55 + rnd() * 1.55) * farFactor).toFixed(2);
      const op = (0.10 + rnd() * 0.24).toFixed(3);
      const blur = (0.15 + rnd() * 0.70).toFixed(2);
      const rot = (-9 + rnd() * 18).toFixed(2);
      const dx = (-13 + rnd() * 26).toFixed(1);
      const dy = (10 + rnd() * 34).toFixed(1);
      const dur = (7.2 + rnd() * 8.8).toFixed(2);
      const delay = (-rnd() * 16).toFixed(2);
      return `<b aria-hidden="true" style="--x:${x}%;--y:${y}%;--w:${w}px;--h:${h}px;--op:${op};--blur:${blur}px;--rot:${rot}deg;--dx:${dx}px;--dy:${dy}px;--dur:calc(${dur}s / var(--cawf-shore-speed-safe));--delay:${delay}s"></b>`;
    }).join('');


    const sceneMode = lowDetail ? 'cawf-shore-low' : 'cawf-shore-rich';
    return `<div class="cawf-shore-scene ${sceneMode}" aria-hidden="true">
      ${roughDefs}
      <div class="cawf-shore-sea" aria-hidden="true"></div>
      <div class="cawf-shore-depth-haze" aria-hidden="true"></div>
      <div class="cawf-shore-yoonseul" aria-hidden="true">${yoonseul}</div>
      <div class="cawf-shore-ripples" aria-hidden="true"></div>
      <div class="cawf-shore-undulation" aria-hidden="true"></div>
      <div class="cawf-shore-wash cawf-shore-wash-main" aria-hidden="true"></div>
      <div class="cawf-shore-wash cawf-shore-wash-front" aria-hidden="true"></div>
      <svg class="cawf-shore-foam cawf-shore-foam-back" viewBox="0 0 1200 320" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path class="cawf-shore-foam-fill" d="${pathBack} L1310 -30 L-110 -30 Z"${roughFilterMid} />
        <path class="cawf-shore-foam-soft" d="${pathBack}" />
        <path class="cawf-shore-foam-rim" d="${pathBack}"${roughFilterMid} />
        <path class="cawf-shore-foam-lace" d="${pathBack}"${roughFilterMid} />
      </svg>
      <svg class="cawf-shore-foam cawf-shore-foam-main" viewBox="0 0 1200 320" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path class="cawf-shore-foam-fill" d="${pathMain} L1310 -30 L-110 -30 Z"${roughFilterNear} />
        <path class="cawf-shore-foam-soft" d="${pathMain}" />
        <path class="cawf-shore-foam-rim" d="${pathMain}"${roughFilterNear} />
        <path class="cawf-shore-foam-lace" d="${pathLace}"${roughFilterNear} />
      </svg>
      <svg class="cawf-shore-foam cawf-shore-foam-front" viewBox="0 0 1200 320" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path class="cawf-shore-foam-fill" d="${pathFront} L1310 -30 L-110 -30 Z"${roughFilterNear} />
        <path class="cawf-shore-foam-soft" d="${pathFront}" />
        <path class="cawf-shore-foam-rim" d="${pathFront}"${roughFilterNear} />
        <path class="cawf-shore-foam-lace" d="${pathFront}"${roughFilterNear} />
      </svg>
      <div class="cawf-shore-flecks" aria-hidden="true">${flecks}</div>
    </div>`;
  }

  function ensureAmbientCanvas(effect) {
    ensureRoot();
    const ambient = state.ambient;
    if (!(ambient instanceof HTMLElement)) return null;

    if (!(state.ambientCanvas instanceof HTMLCanvasElement) || state.ambientCanvas.dataset.cawfCanvasEffect !== effect) {
      stopAmbientAnimation();
      ambient.replaceChildren();
      const canvas = document.createElement('canvas');
      canvas.className = 'cawf-raw-canvas';
      canvas.dataset.cawfCanvasEffect = effect;
      canvas.setAttribute('aria-hidden', 'true');
      ambient.appendChild(canvas);
      state.ambientCanvas = canvas;
      state.ambientCtx = canvas.getContext('2d');
      state.ambientCanvasMeasuredAt = 0; // 새 캔버스는 즉시 한 번 측정
    }

    const canvas = state.ambientCanvas;
    const ctx = state.ambientCtx;
    if (!canvas || !ctx) return null;

    // 노트북 최적화: 캔버스 크기는 거의 안 변하므로 매 프레임 getBoundingClientRect(reflow)를
    // 하지 않고 ~500ms 간격으로만 다시 잰다. 마나/불꽃놀이 루프의 프레임당 강제 리플로우 제거.
    const now = performance.now();
    if (
      state.ambientCanvasMeasuredAt &&
      now - state.ambientCanvasMeasuredAt < 500 &&
      Number(state.ambientCanvasW) > 0 &&
      Number(state.ambientCanvasH) > 0
    ) {
      return {
        canvas,
        ctx,
        width: state.ambientCanvasW,
        height: state.ambientCanvasH,
        dpr: state.ambientCanvasDpr || 1
      };
    }
    state.ambientCanvasMeasuredAt = now;

    const rect = (state.root || ambient).getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || ambient.clientWidth || window.innerWidth || 1));
    const height = Math.max(1, Math.round(rect.height || ambient.clientHeight || window.innerHeight || 1));
    const dpr = getCanvasDpr('ambient');
    const targetW = Math.max(1, Math.round(width * dpr));
    const targetH = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (state.ambientEffectRuntime) state.ambientEffectRuntime.needsReset = true;
    }
    state.ambientCanvasW = width;
    state.ambientCanvasH = height;
    state.ambientCanvasDpr = dpr;
    return { canvas, ctx, width, height, dpr };
  }

  /* ============================================================
   * CAWF SPACE / GALAXY v2
   * Source: attached cawf_space_galaxy_v2.html
   * Visual math, noise, colors, density, meteor, and motion values are unchanged.
   * Only the demo shell is replaced with CAWF lifecycle/settings integration.
   * ============================================================ */
  function startRawGalaxy(reason = 'manual') {
    if (IS_MOBILE) {
      stopAmbientAnimation();
      log('galaxy skipped on non-PC environment', reason);
      return;
    }
    if (!isEpisodePath()) return;
    ensureRoot();

    const densityIdx = ({ low: 0, medium: 1, high: 2 })[
      normalizeChoice(state.settings.intensity, ['low', 'medium', 'high'], 'medium')
    ] ?? 1;
    const signature = `galaxy-deep-space-v2:${densityIdx}`;
    const existing = state.ambientEffectRuntime;
    if (
      existing?.kind === 'galaxy' &&
      existing.signature === signature &&
      existing.canvas instanceof HTMLCanvasElement &&
      existing.canvas.isConnected
    ) {
      existing.resume();
      state.ambientSignature = signature;
      return;
    }

    stopAmbientAnimation();
    const env = ensureAmbientCanvas('galaxy');
    if (!env) return;
    const cv = env.canvas;
    const cx2d = env.ctx;
    let skyCv = document.createElement('canvas');
    skyCv.className = 'cawf-raw-canvas cawf-galaxy-static-sky';
    skyCv.dataset.cawfGalaxySky = 'static';
    skyCv.setAttribute('aria-hidden', 'true');
    Object.assign(skyCv.style, {
      position: 'absolute',
      left: '-24px',
      top: '-24px',
      pointerEvents: 'none',
      willChange: 'transform',
    });
    cv.parentElement?.insertBefore(skyCv, cv);

    const CONFIG = {
      FPS_CAP: 30,
      DPR_MAX: 1,
      ROT_SPEED: 0.000010,
      DRIFT_AMP: 12,
      MOUSE_PARALLAX: 14,
      TWINKLE_COUNT: 150,
      FEATURE_STARS: 6,
      METEOR_MIN_GAP: 5000,
      METEOR_MAX_GAP: 11000,
      DENSITY_LEVELS: [
        { label: '은은', mul: 0.6 },
        { label: '보통', mul: 1.0 },
        { label: '풍부', mul: 1.5 },
      ],
    };

    let seed = state.galaxySeed;
    function mulberry32(a) {
      return function random() {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    let rnd = mulberry32(seed);
    const gauss = () => (rnd() + rnd() + rnd()) / 1.5 - 1;

    function makeNoise() {
      const P = new Uint8Array(512);
      const perm = Array.from({ length: 256 }, (_, i) => i);
      for (let i = 255; i > 0; i -= 1) {
        const j = (rnd() * (i + 1)) | 0;
        const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
      }
      for (let i = 0; i < 512; i += 1) P[i] = perm[i & 255];
      const fade = t => t * t * (3 - 2 * t);
      function n2(x, y) {
        const Xi = Math.floor(x), Yi = Math.floor(y);
        const X = Xi & 255, Y = Yi & 255;
        const u = fade(x - Xi), v = fade(y - Yi);
        const a = P[(P[X] + Y) & 511] / 255;
        const b = P[(P[(X + 1) & 255] + Y) & 511] / 255;
        const c = P[(P[X] + Y + 1) & 511] / 255;
        const d = P[(P[(X + 1) & 255] + Y + 1) & 511] / 255;
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
      }
      function fbm(x, y, oct) {
        let f = 0, amp = 0.5, tot = 0;
        for (let i = 0; i < oct; i += 1) {
          f += amp * n2(x, y); tot += amp;
          x = x * 2.03 + 17.1; y = y * 2.01 + 9.7; amp *= 0.5;
        }
        return f / tot;
      }
      return { n2, fbm };
    }

    let W = 0, H = 0, DPR = 1, originX = 0, originY = 0;
    let bgCanvas = null, nebCanvas = null, nebSize = 0, farStars = null, nearStars = null, vignette = null;
    let twinkles = [], features = [], meteors = [];
    let sprites = {};
    let rot = Number.isFinite(state.galaxyRotation) ? state.galaxyRotation : Math.random() * Math.PI * 2;
    const mouse = { tx: 0, ty: 0, x: 0, y: 0 };
    let lastSkyTx = Number.NaN, lastSkyTy = Number.NaN;
    let lastFitW = 0, lastFitH = 0;
    const featureSpriteCache = startRawGalaxy.__featureSpriteCache || (startRawGalaxy.__featureSpriteCache = new Map());
    const meteorSpriteCache = startRawGalaxy.__meteorSpriteCache || (startRawGalaxy.__meteorSpriteCache = new Map());

    // v2.5.5: 완성된 정적 은하 배경은 한 장만 보관한다.
    // 다른 효과로 갔다가 다시 은하수를 켤 때 무거운 성운/별밭 베이크를 반복하지 않는다.
    const getStaticSkyCache = () => startRawGalaxy.__staticSkyCache || null;
    const setStaticSkyCache = cache => { startRawGalaxy.__staticSkyCache = cache; };
    const nextBuildFrame = () => {
      // scheduler.yield()가 있으면 같은 프레임 예산 안에서 우선 양보하고, 없으면 0ms task로 폴백한다.
      // rAF처럼 매 청크마다 16ms씩 기다리지 않아 은하수가 늦게 뜨는 느낌도 최소화한다.
      if (globalThis.scheduler && typeof globalThis.scheduler.yield === 'function') return globalThis.scheduler.yield();
      return new Promise(resolve => window.setTimeout(resolve, 0));
    };

    function getDynamicBudget() {
      if (!IS_LOW_POWER) return { twinkleScale: 1, featureCount: CONFIG.FEATURE_STARS, fpsCap: CONFIG.FPS_CAP };
      return IS_MOBILE
        ? { twinkleScale: 0.64, featureCount: 4, fpsCap: 16 }
        : { twinkleScale: 0.72, featureCount: 4, fpsCap: 18 };
    }

    function getFeatureSpriteCached(name, colCore, colGlow) {
      const key = `${name}:${colCore}:${colGlow}`;
      const cached = featureSpriteCache.get(key);
      if (cached) return cached;
      const sprite = buildStarSprite(colCore, colGlow);
      featureSpriteCache.set(key, sprite);
      return sprite;
    }

    function getMeteorSprite(len) {
      const qLen = Math.max(84, Math.round(len / 12) * 12);
      const key = `meteor:${qLen}`;
      const cached = meteorSpriteCache.get(key);
      if (cached) return cached;

      const w = qLen + 18;
      const h = 24;
      const headX = qLen;
      const headY = h / 2;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      if (!g) return { canvas: c, headX, headY };

      g.globalCompositeOperation = 'lighter';
      const glow = g.createLinearGradient(6, headY, headX, headY);
      glow.addColorStop(0, 'rgba(0,0,0,0)');
      glow.addColorStop(0.55, 'rgba(155,190,255,0.18)');
      glow.addColorStop(1, 'rgba(255,255,255,0.58)');
      g.strokeStyle = glow;
      g.lineCap = 'round';
      g.lineWidth = 5.5;
      g.beginPath();
      g.moveTo(6, headY);
      g.lineTo(headX, headY);
      g.stroke();

      const core = g.createLinearGradient(8, headY, headX, headY);
      core.addColorStop(0, 'rgba(0,0,0,0)');
      core.addColorStop(0.42, 'rgba(170,205,255,0.30)');
      core.addColorStop(0.76, 'rgba(214,228,255,0.62)');
      core.addColorStop(1, 'rgba(255,255,255,0.98)');
      g.strokeStyle = core;
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(8, headY);
      g.lineTo(headX, headY);
      g.stroke();

      const rg = g.createRadialGradient(headX, headY, 0, headX, headY, 8);
      rg.addColorStop(0, 'rgba(255,255,255,0.96)');
      rg.addColorStop(0.22, 'rgba(226,236,255,0.88)');
      rg.addColorStop(0.55, 'rgba(170,205,255,0.34)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg;
      g.fillRect(headX - 8, headY - 8, 16, 16);

      const sprite = { canvas: c, headX, headY };
      meteorSpriteCache.set(key, sprite);
      return sprite;
    }

    function buildBackground() {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      const v = g.createLinearGradient(0, 0, 0, H);
      v.addColorStop(0, '#05070f');
      v.addColorStop(0.6, '#03040b');
      v.addColorStop(1, '#020207');
      g.fillStyle = v; g.fillRect(0, 0, W, H);

      g.globalCompositeOperation = 'lighter';
      const r1 = g.createRadialGradient(W * 0.14, H * 0.92, 0, W * 0.14, H * 0.92, Math.max(W, H) * 0.7);
      r1.addColorStop(0, 'rgba(22,60,80,0.06)');
      r1.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = r1; g.fillRect(0, 0, W, H);
      const r2 = g.createRadialGradient(W * 0.88, H * 0.06, 0, W * 0.88, H * 0.06, Math.max(W, H) * 0.6);
      r2.addColorStop(0, 'rgba(60,35,85,0.06)');
      r2.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = r2; g.fillRect(0, 0, W, H);
      return c;
    }

    function buildVignette() {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      const rg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.40, W / 2, H / 2, Math.hypot(W, H) * 0.62);
      rg.addColorStop(0, 'rgba(0,0,0,0)');
      rg.addColorStop(1, 'rgba(1,1,6,0.6)');
      g.fillStyle = rg; g.fillRect(0, 0, W, H);
      return c;
    }

    async function buildNebula(mul, buildToken) {
      const S = Math.ceil(Math.hypot(W, H) * 1.25);
      nebSize = S;
      const c = document.createElement('canvas');
      c.width = S; c.height = S;
      const g = c.getContext('2d');
      const cS = S / 2;

      const noise = makeNoise();
      const fbm = noise.fbm;
      const ph1 = rnd() * Math.PI * 2;

      const bandHalfN = 0.15;
      const halfW = S * bandHalfN;
      const meanderN = u => Math.sin(u * Math.PI * 1.6 + ph1) * 0.05;

      const R = Math.round(Math.min(560, Math.max(320, S / 4)));
      const nc = document.createElement('canvas');
      nc.width = R; nc.height = R;
      const ng = nc.getContext('2d');
      const img = ng.createImageData(R, R);
      const px = img.data;

      const BASE = 5.2;
      const WARP = 2.4;

      for (let y = 0; y < R; y += 1) {
        const v = y / R;
        for (let x = 0; x < R; x += 1) {
          const u = x / R;
          const d = (v - 0.5 - meanderN(u)) / bandHalfN;
          const ad = Math.abs(d);
          const fall = Math.exp(-ad * ad * 1.9);
          const i = (y * R + x) * 4;
          if (fall < 0.015) { px[i + 3] = 0; continue; }

          const bx = u * BASE, by = v * BASE;
          const wx = fbm(bx + 31.7, by + 11.3, 3);
          const wy = fbm(bx + 74.2, by + 47.9, 3);
          let n = fbm(bx + (wx - 0.5) * WARP, by + (wy - 0.5) * WARP, 4);
          n = Math.pow(Math.max(0, n), 1.7);

          const du = fbm(bx * 1.9 + 123.4, by * 1.9 + 55.2, 3);
          const dust = Math.max(0, du - 0.52) * 2.4 * Math.exp(-ad * ad * 3.2);
          const dens = n * fall * (1 - Math.min(1, dust * 1.5));

          let r0 = 120 + n * 115;
          let g0 = 140 + n * 105;
          let b0 = 190 + n * 65;
          const warmMask = Math.exp(-ad * ad * 5.5) * Math.max(0, wx - 0.42) * 1.4;
          r0 += warmMask * 95;
          g0 += warmMask * 40;
          b0 -= warmMask * 45;
          if (wy > 0.63) { r0 += 22; b0 += 26; g0 -= 6; }
          else if (wy < 0.37) { g0 += 20; b0 += 16; r0 -= 10; }
          const dustEdge = Math.min(1, dust) * 0.5;
          r0 = r0 * (1 - dustEdge) + 90 * dustEdge;
          g0 = g0 * (1 - dustEdge) + 62 * dustEdge;
          b0 = b0 * (1 - dustEdge) + 48 * dustEdge;

          px[i] = Math.min(255, r0);
          px[i + 1] = Math.min(255, g0);
          px[i + 2] = Math.min(255, b0);
          px[i + 3] = Math.min(230, dens * 235);
        }
        // v2.5.5: 픽셀 계산 자체는 그대로 두고 16행마다 브라우저에 한 프레임 양보한다.
        // 한 덩어리의 긴 JS 작업으로 채팅 UI가 순간 정지하는 현상만 줄인다.
        if ((y & 15) === 15) {
          await nextBuildFrame();
          if (state.ambientEffectRuntime !== runtime || runtime.buildToken !== buildToken) return null;
        }
      }
      ng.putImageData(img, 0, 0);
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(nc, 0, 0, S, S);

      g.globalCompositeOperation = 'lighter';
      const glow = g.createLinearGradient(0, cS - halfW * 1.4, 0, cS + halfW * 1.4);
      glow.addColorStop(0, 'rgba(0,0,0,0)');
      glow.addColorStop(0.5, 'rgba(190,200,235,0.055)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = glow;
      g.fillRect(0, cS - halfW * 1.6, S, halfW * 3.2);

      const scale = S / 1600;
      const starN = 5200 * mul;
      for (let i = 0; i < starN; i += 1) {
        const t = rnd();
        const x = t * S;
        const y = cS + meanderN(t) * S + gauss() * halfW * 0.95;
        const r = (0.28 + Math.pow(rnd(), 2.2) * 1.1) * scale;
        const a = 0.12 + Math.pow(rnd(), 1.6) * 0.75;
        const roll = rnd();
        g.fillStyle = roll < 0.84 ? `rgba(232,238,255,${a})`
          : roll < 0.93 ? `rgba(255,226,196,${a})`
            : `rgba(168,198,255,${a})`;
        g.beginPath();
        g.arc(x, y, r, 0, 6.283);
        g.fill();
        if (i > 0 && i % 900 === 0) {
          await nextBuildFrame();
          if (state.ambientEffectRuntime !== runtime || runtime.buildToken !== buildToken) return null;
        }
      }
      for (let i = 0; i < 1400 * mul; i += 1) {
        const x = rnd() * S, y = rnd() * S;
        const a = 0.06 + rnd() * 0.3;
        g.fillStyle = `rgba(225,232,255,${a})`;
        g.beginPath();
        g.arc(x, y, (0.25 + rnd() * 0.6) * scale, 0, 6.283);
        g.fill();
        if (i > 0 && i % 700 === 0) {
          await nextBuildFrame();
          if (state.ambientEffectRuntime !== runtime || runtime.buildToken !== buildToken) return null;
        }
      }

      // v2.5.5: v2.5.1에서 추가된 굵은 filament / dust-lane stroke는 제거.
      // 기본 FBM 성운 안의 먼지 결/암부는 위 픽셀 단계에서 그대로 살아 있으므로,
      // 화면을 가로지르는 반투명 '줄'만 사라지고 은하수 본체의 질감/색/밀도는 유지된다.

      const clusterCount = 3 + ((rnd() * 3) | 0);
      for (let i = 0; i < clusterCount; i += 1) {
        const cx = S * (0.12 + rnd() * 0.76);
        const cy = S * (0.14 + rnd() * 0.72);
        const spread = S * (0.008 + rnd() * 0.014);
        const members = 18 + ((rnd() * 34) | 0);
        const halo = g.createRadialGradient(cx, cy, 0, cx, cy, spread * 3.1);
        halo.addColorStop(0, 'rgba(188,200,255,0.07)');
        halo.addColorStop(0.4, 'rgba(142,120,255,0.03)');
        halo.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = halo;
        g.fillRect(cx - spread * 3.1, cy - spread * 3.1, spread * 6.2, spread * 6.2);
        for (let j = 0; j < members; j += 1) {
          const x = cx + gauss() * spread;
          const y = cy + gauss() * spread;
          const r = (0.26 + Math.pow(rnd(), 2.0) * 0.85) * scale;
          const a = 0.16 + Math.pow(rnd(), 1.4) * 0.68;
          const roll = rnd();
          g.fillStyle = roll < 0.80 ? `rgba(232,238,255,${a})`
            : roll < 0.92 ? `rgba(255,229,200,${a})`
              : `rgba(178,206,255,${a})`;
          g.beginPath();
          g.arc(x, y, r, 0, 6.283);
          g.fill();
        }
      }

      const nGal = 2 + (rnd() < 0.45 ? 1 : 0);
      for (let i = 0; i < nGal; i += 1) {
        const gx = S * (0.15 + rnd() * 0.7);
        const gy = cS + (rnd() < 0.5 ? -1 : 1) * halfW * (2.4 + rnd() * 1.2);
        const gr = S * (0.010 + rnd() * 0.012);
        g.save();
        g.translate(gx, gy);
        g.rotate(rnd() * Math.PI);
        g.scale(1, 0.36);
        const rg = g.createRadialGradient(0, 0, 0, 0, 0, gr);
        rg.addColorStop(0, 'rgba(255,238,220,0.20)');
        rg.addColorStop(0.4, 'rgba(185,180,235,0.09)');
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = rg;
        g.fillRect(-gr, -gr, gr * 2, gr * 2);
        g.restore();
      }

      return c;
    }

    function buildStarLayer(count, sizeMin, sizeMax, brightMul) {
      const pad = 60;
      const c = document.createElement('canvas');
      c.width = W + pad * 2; c.height = H + pad * 2;
      const g = c.getContext('2d');
      for (let i = 0; i < count; i += 1) {
        const x = rnd() * c.width, y = rnd() * c.height;
        const r = sizeMin + Math.pow(rnd(), 1.8) * (sizeMax - sizeMin);
        const a = (0.25 + rnd() * 0.75) * brightMul;
        const roll = rnd();
        const col = roll < 0.8 ? '232,238,255' : roll < 0.9 ? '255,228,200' : '172,200,255';
        if (r > 1.15) {
          const rg = g.createRadialGradient(x, y, 0, x, y, r * 2.4);
          rg.addColorStop(0, `rgba(${col},${a})`);
          rg.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = rg;
          g.fillRect(x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
        } else {
          g.fillStyle = `rgba(${col},${a})`;
          g.beginPath();
          g.arc(x, y, r, 0, 6.283);
          g.fill();
        }
      }
      return c;
    }

    function buildStarSprite(colCore, colGlow) {
      const s = 160, c = document.createElement('canvas');
      c.width = s; c.height = s;
      const g = c.getContext('2d');
      const m = s / 2;
      g.globalCompositeOperation = 'lighter';
      const rg = g.createRadialGradient(m, m, 0, m, m, m * 0.9);
      rg.addColorStop(0, `rgba(${colCore},0.85)`);
      rg.addColorStop(0.16, `rgba(${colGlow},0.30)`);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(0, 0, s, s);
      const spike = (len, wHalf, alpha) => {
        const lg = g.createLinearGradient(m - len, m, m + len, m);
        lg.addColorStop(0, 'rgba(0,0,0,0)');
        lg.addColorStop(0.5, `rgba(${colCore},${alpha})`);
        lg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = lg;
        g.fillRect(m - len, m - wHalf, len * 2, wHalf * 2);
      };
      spike(m * 0.95, 1.0, 0.75);
      g.save(); g.translate(m, m); g.rotate(Math.PI / 2); g.translate(-m, -m);
      spike(m * 0.95, 1.0, 0.75); g.restore();
      g.save(); g.translate(m, m); g.rotate(Math.PI / 4); g.translate(-m, -m);
      spike(m * 0.42, 0.7, 0.32); g.restore();
      g.save(); g.translate(m, m); g.rotate(-Math.PI / 4); g.translate(-m, -m);
      spike(m * 0.42, 0.7, 0.32); g.restore();
      return c;
    }

    function buildDynamics(mul) {
      const budget = getDynamicBudget();
      twinkles = [];
      const n = Math.round(CONFIG.TWINKLE_COUNT * mul * budget.twinkleScale);
      for (let i = 0; i < n; i += 1) {
        twinkles.push({
          x: rnd() * W, y: rnd() * H,
          r: 0.45 + rnd() * 1.0,
          ph: rnd() * Math.PI * 2,
          sp: 0.0008 + rnd() * 0.0022,
          warm: rnd() < 0.13,
        });
      }
      features = [];
      const keys = Object.keys(sprites);
      const featureCount = Math.max(4, budget.featureCount | 0);
      for (let i = 0; i < featureCount; i += 1) {
        features.push({
          x: W * (0.06 + rnd() * 0.88),
          y: H * (0.06 + rnd() * 0.88),
          size: (IS_LOW_POWER ? 16 : 18) + rnd() * (IS_LOW_POWER ? 22 : 26),
          ph: rnd() * Math.PI * 2,
          sp: 0.0004 + rnd() * 0.0008,
          sprite: sprites[keys[(rnd() * keys.length) | 0]],
        });
      }
    }

    function spawnMeteor() {
      const fromLeft = Math.random() < 0.5;
      const ang = (25 + Math.random() * 20) * Math.PI / 180;
      const speed = 0.7 + Math.random() * 0.5;
      const len = 90 + Math.random() * 110;
      meteors.push({
        x: fromLeft ? -40 + Math.random() * W * 0.4 : W * 0.6 + Math.random() * (W * 0.4 + 40),
        y: -30 + Math.random() * H * 0.25,
        vx: Math.cos(ang) * speed * (fromLeft ? 1 : -1),
        vy: Math.sin(ang) * speed,
        life: 0,
        ttl: 900 + Math.random() * 500,
        len,
        sprite: getMeteorSprite(len),
      });
    }

    function drawMeteors(dt) {
      for (let i = meteors.length - 1; i >= 0; i -= 1) {
        const mtr = meteors[i];
        mtr.life += dt;
        mtr.x += mtr.vx * dt;
        mtr.y += mtr.vy * dt;
        if (mtr.life > mtr.ttl || mtr.y > H + 60) { meteors.splice(i, 1); continue; }
        const p = mtr.life / mtr.ttl;
        const fade = p < 0.15 ? p / 0.15 : p > 0.7 ? (1 - p) / 0.3 : 1;
        const sprite = mtr.sprite || (mtr.sprite = getMeteorSprite(mtr.len));
        const ang = Math.atan2(mtr.vy, mtr.vx);
        cx2d.save();
        cx2d.globalAlpha = Math.max(0, fade);
        cx2d.translate(mtr.x, mtr.y);
        cx2d.rotate(ang);
        cx2d.drawImage(sprite.canvas, -sprite.headX, -sprite.headY);
        cx2d.restore();
      }
      cx2d.globalAlpha = 1;
    }

    async function buildAll(buildToken) {
      const mul = CONFIG.DENSITY_LEVELS[densityIdx].mul;
      rnd = mulberry32(seed);
      bgCanvas = buildBackground();
      vignette = buildVignette();
      nebCanvas = await buildNebula(mul, buildToken);
      if (!nebCanvas || state.ambientEffectRuntime !== runtime || runtime.buildToken !== buildToken) return false;
      farStars = buildStarLayer(Math.round(280 * mul), 0.4, 0.9, 0.5);
      nearStars = buildStarLayer(Math.round(160 * mul), 0.6, 1.7, 0.85);
      sprites = {
        cool: getFeatureSpriteCached('cool', '235,242,255', '150,180,255'),
        warm: getFeatureSpriteCached('warm', '255,240,220', '255,190,140'),
        violet: getFeatureSpriteCached('violet', '245,235,255', '190,150,255'),
      };
      buildDynamics(mul);
      return true;
    }

    function buildStaticSky() {
      if (!(skyCv instanceof HTMLCanvasElement)) return;
      const pad = 24;
      const SW = W + pad * 2;
      const SH = H + pad * 2;
      skyCv.width = SW;
      skyCv.height = SH;
      skyCv.style.width = SW + 'px';
      skyCv.style.height = SH + 'px';
      skyCv.style.transform = 'translate3d(0, 0, 0)';

      const g = skyCv.getContext('2d');
      if (!g) return;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, SW, SH);
      g.translate(pad, pad);
      g.drawImage(bgCanvas, -pad, -pad, SW, SH);
      g.save();
      g.translate(W / 2, H / 2);
      g.rotate(rot);
      g.drawImage(nebCanvas, -nebSize / 2, -nebSize / 2);
      g.restore();
      g.drawImage(farStars, -60, -60);
      g.drawImage(nearStars, -60, -60);
      g.drawImage(vignette, -pad, -pad, SW, SH);

      // v2.5.5: 정적 배경 + 동적 별 배치를 함께 1회 캐시.
      // 캔버스는 cleanup 때 DOM에서만 떼고 이 참조는 남겨 재사용한다.
      setStaticSkyCache({
        key: `galaxy-static-v255:${W}x${H}:${densityIdx}:${seed}:${rot.toFixed(6)}`,
        canvas: skyCv,
        twinkles: twinkles.map(item => ({ ...item })),
        features: features.map(item => ({ ...item })),
        sprites: { ...sprites },
      });

      bgCanvas = null;
      nebCanvas = null;
      farStars = null;
      nearStars = null;
      vignette = null;
    }

    async function fit(force = false) {
      DPR = CONFIG.DPR_MAX;
      const rect = (state.root || state.ambient).getBoundingClientRect();
      const nextW = Math.max(1, Math.round(rect.width || window.innerWidth || 1));
      const nextH = Math.max(1, Math.round(rect.height || window.innerHeight || 1));
      originX = Number(rect.left) || 0;
      originY = Number(rect.top) || 0;
      const sizeChanged = force
        || nextW !== lastFitW
        || nextH !== lastFitH
        || cv.width !== Math.round(nextW * DPR)
        || cv.height !== Math.round(nextH * DPR);
      W = nextW;
      H = nextH;
      if (!sizeChanged) {
        runtime.needsFit = false;
        return;
      }
      lastFitW = W;
      lastFitH = H;
      cv.width = Math.round(W * DPR);
      cv.height = Math.round(H * DPR);
      cv.style.width = W + 'px';
      cv.style.height = H + 'px';
      cx2d.setTransform(DPR, 0, 0, DPR, 0, 0);

      const cacheKey = `galaxy-static-v255:${W}x${H}:${densityIdx}:${seed}:${rot.toFixed(6)}`;
      const cached = getStaticSkyCache();
      if (cached?.key === cacheKey && cached.canvas instanceof HTMLCanvasElement) {
        if (skyCv !== cached.canvas) {
          if (skyCv instanceof HTMLCanvasElement) skyCv.remove();
          skyCv = cached.canvas;
          cv.parentElement?.insertBefore(skyCv, cv);
        }
        skyCv.style.transform = 'translate3d(0, 0, 0)';
        twinkles = Array.isArray(cached.twinkles) ? cached.twinkles.map(item => ({ ...item })) : [];
        features = Array.isArray(cached.features) ? cached.features.map(item => ({ ...item })) : [];
        sprites = cached.sprites ? { ...cached.sprites } : {};
        lastSkyTx = Number.NaN;
        lastSkyTy = Number.NaN;
        state.galaxyRotation = rot;
        runtime.needsFit = false;
        runtime.building = false;
        return;
      }

      const buildToken = ++runtime.buildToken;
      runtime.building = true;
      const built = await buildAll(buildToken);
      if (!built || state.ambientEffectRuntime !== runtime || runtime.buildToken !== buildToken) return;
      buildStaticSky();
      lastSkyTx = Number.NaN;
      lastSkyTy = Number.NaN;
      state.galaxyRotation = rot;
      runtime.needsFit = false;
      runtime.building = false;
    }

    let resizeTimer = 0;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (document.hidden || state.effectInView === false) {
          runtime.needsFit = true;
          return;
        }
        void fit();
      }, 180);
    };

    const onPointerMove = event => {
      if (!W || !H) return;
      mouse.tx = Math.max(-1, Math.min(1, ((event.clientX - originX) / W - 0.5) * 2));
      mouse.ty = Math.max(-1, Math.min(1, ((event.clientY - originY) / H - 0.5) * 2));
    };

    const onPointerLeave = () => {
      mouse.tx = 0;
      mouse.ty = 0;
    };

    let nextMeteorAt = 0;
    function drawFrame(now, dt) {
      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;
      const P = state.settings.galaxyParallax === false ? 0 : CONFIG.MOUSE_PARALLAX;

      if (skyCv instanceof HTMLCanvasElement) {
        const nextTx = P ? Number((mouse.x * P * 0.35).toFixed(1)) : 0;
        const nextTy = P ? Number((mouse.y * P * 0.35).toFixed(1)) : 0;
        if (nextTx !== lastSkyTx || nextTy !== lastSkyTy) {
          skyCv.style.transform = `translate3d(${nextTx}px, ${nextTy}px, 0)`;
          lastSkyTx = nextTx;
          lastSkyTy = nextTy;
        }
      }

      cx2d.clearRect(0, 0, W, H);
      cx2d.globalCompositeOperation = 'lighter';
      for (const s of twinkles) {
        const a = 0.22 + 0.78 * (0.5 + 0.5 * Math.sin(now * s.sp + s.ph));
        cx2d.fillStyle = s.warm ? `rgba(255,225,190,${a})` : `rgba(232,238,255,${a})`;
        cx2d.beginPath();
        cx2d.arc(s.x + mouse.x * P * 0.7, s.y + mouse.y * P * 0.7, s.r, 0, 6.283);
        cx2d.fill();
      }

      for (const f of features) {
        const pulse = 0.72 + 0.28 * Math.sin(now * f.sp + f.ph);
        const sz = f.size * (0.9 + pulse * 0.2);
        cx2d.globalAlpha = pulse;
        cx2d.drawImage(f.sprite,
          f.x - sz / 2 + mouse.x * P * 0.8,
          f.y - sz / 2 + mouse.y * P * 0.8, sz, sz);
      }
      cx2d.globalAlpha = 1;

      const meteorEnabled = state.settings.galaxyMeteors !== false;
      if (!meteorEnabled) {
        runtime.meteorWasEnabled = false;
      } else {
        if (!runtime.meteorWasEnabled) {
          nextMeteorAt = now + CONFIG.METEOR_MIN_GAP + Math.random() * (CONFIG.METEOR_MAX_GAP - CONFIG.METEOR_MIN_GAP);
          runtime.meteorWasEnabled = true;
        }
        if (now >= nextMeteorAt) {
          spawnMeteor();
          nextMeteorAt = now + CONFIG.METEOR_MIN_GAP + Math.random() * (CONFIG.METEOR_MAX_GAP - CONFIG.METEOR_MIN_GAP);
        }
      }
      drawMeteors(dt);

      cx2d.globalCompositeOperation = 'source-over';
    }

    function loop(now) {
      if (state.ambientEffectRuntime !== runtime || !runtime.running) return;
      state.ambientAnimId = window.requestAnimationFrame(loop);
      if (!runtime.last) { runtime.last = now; return; }
      const frameMin = 1000 / getDynamicBudget().fpsCap;
      const dt = now - runtime.last;
      if (dt < frameMin) return;
      runtime.last = now - (dt % frameMin);
      drawFrame(now, Math.min(dt, 66));
    }

    const onVisibilityChange = () => {
      if (document.hidden) {
        pauseGalaxyAnimation();
      } else if (
        state.ambientEffectRuntime === runtime &&
        state.effectInView !== false &&
        getPaintedScreenEffect() === 'galaxy'
      ) {
        runtime.resume();
      }
    };

    const cleanup = () => {
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      runtime.running = false;
      runtime.last = 0;
      runtime.buildToken += 1;
      runtime.building = false;
      state.galaxyRotation = rot;
      if (skyCv instanceof HTMLCanvasElement) skyCv.remove();
      skyCv = null;
      bgCanvas = null;
      nebCanvas = null;
      farStars = null;
      nearStars = null;
      vignette = null;
      twinkles = [];
      features = [];
      meteors = [];
      sprites = {};
    };

    const runtime = {
      kind: 'galaxy',
      signature,
      canvas: cv,
      running: true,
      last: 0,
      needsFit: false,
      building: false,
      buildToken: 0,
      meteorWasEnabled: state.settings.galaxyMeteors !== false,
      cleanup,
      resume() {
        if (state.ambientEffectRuntime !== runtime || runtime.running && state.ambientAnimId) return;
        if (runtime.needsFit) void fit();
        runtime.running = true;
        runtime.last = 0;
        state.ambientAnimId = window.requestAnimationFrame(loop);
      }
    };

    state.ambientEffectRuntime = runtime;
    window.addEventListener('resize', onResize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    void fit();
    nextMeteorAt = performance.now() + 2500;
    state.ambientAnimId = window.requestAnimationFrame(loop);
    state.ambientSignature = signature;
    log('galaxy deep-space canvas started', reason, signature);
  }

  // ── 마나 글로우 스프라이트 캐시: 매 프레임 createRadialGradient / shadowBlur 제거용 ──
  const _glowSpriteCache = new Map();
  function getManaGlowSprite(hue) {
    const key = Math.round(hue / 6) * 6; // 6도 단위 양자화(육안 구분 거의 없음)
    const cached = _glowSpriteCache.get('mana:' + key);
    if (cached) return cached;
    const R = 40, d = R * 2;
    const cv = document.createElement('canvas');
    cv.width = d;
    cv.height = d;
    const g = cv.getContext('2d');
    const grad = g.createRadialGradient(R, R, 0, R, R, R);
    grad.addColorStop(0, `hsla(${key}, 100%, 92%, 1)`);
    grad.addColorStop(0.45, `hsla(${key}, 100%, 70%, 0.45)`);
    grad.addColorStop(1, `hsla(${key}, 100%, 56%, 0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, d, d);
    _glowSpriteCache.set('mana:' + key, cv);
    return cv;
  }

  // ── 밤하늘 캔버스 별밭: 작고 뚜렷한 별만 ───────────────────────────────
  function nightSkyShouldRun() {
    return !!(
      state.settings.enabled &&
      state.settings.timeBackgroundEnabled &&
      state.activeTimeEffect === 'night' &&
      isEpisodePath() &&
      !document.hidden &&
      state.effectInView !== false &&
      state.root?.getAttribute?.('data-cawf-visible') === 'true'
    );
  }

  function buildNightSkyStars(width, height) {
    const rnd = seededRandom(((state.particleSeed || 1) ^ 0x5ca1ed ^ Math.round(width * 31 + height)) >>> 0);
    const density = (width * height) / (1920 * 1080);

    let small = Math.round(1000 * density);
    if (IS_LOW_POWER) small *= IS_MOBILE ? 0.28 : 0.42;
    else if (IS_MOBILE) small *= 0.5;
    const minStars = IS_LOW_POWER ? (IS_MOBILE ? 72 : 100) : 160;
    const maxStars = IS_LOW_POWER ? (IS_MOBILE ? 280 : 420) : (IS_MOBILE ? 560 : 1400);
    small = Math.max(minStars, Math.min(maxStars, Math.round(small)));

    const blueTint = 'rgba(220,232,255,1)';
    const white = 'rgba(255,255,255,1)';
    const stars = [];
    for (let i = 0; i < small; i += 1) {
      stars.push({
        x: rnd() * width,
        y: rnd() * height,
        s: rnd() < 0.66 ? 1 : (rnd() < 0.85 ? 1.4 : 2),
        base: 0.6 + rnd() * 0.4,
        blink: !IS_LOW_POWER && rnd() < 0.6,
        tw: 0.3 + rnd() * 0.85,
        phase: rnd() * Math.PI * 2,
        color: rnd() < 0.16 ? blueTint : white
      });
    }

    state.nightSkyStaticCanvas = null;
    state.nightSkyStaticCtx = null;
    state.nightSkyStars = { stars, startedAt: performance.now(), staticCanvas: null, staticW: 0, staticH: 0, staticDpr: 0 };
  }

  function ensureNightSkyStaticLayer(width, height) {
    const data = state.nightSkyStars;
    if (!data?.stars?.length) return null;

    const dpr = Math.max(0.5, Number(state.nightSkyDpr || 1));
    const tw = Math.max(1, Math.round(width * dpr));
    const th = Math.max(1, Math.round(height * dpr));
    if (
      data.staticCanvas instanceof HTMLCanvasElement &&
      data.staticW === width &&
      data.staticH === height &&
      data.staticDpr === dpr &&
      data.staticCanvas.width === tw &&
      data.staticCanvas.height === th
    ) {
      return data.staticCanvas;
    }

    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // blink:false 별은 평균 밝기로 한 번만 그린다. 매 프레임은 깜빡이는 별만 다시 그려 canvas fillRect 수를 줄인다.
    for (const s of data.stars) {
      if (s.blink) continue;
      const a = s.base * 0.82; // 기존 non-blink 흔들림 범위(0.62~1.0)의 평균값에 가깝게 고정
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;

    data.staticCanvas = canvas;
    data.staticW = width;
    data.staticH = height;
    data.staticDpr = dpr;
    state.nightSkyStaticCanvas = canvas;
    state.nightSkyStaticCtx = ctx;
    return canvas;
  }


function ensureNightSkyCanvas(force = false) {
    const ns = state.nightSky;
    if (!(ns instanceof HTMLElement)) return null;

    if (!(state.nightSkyCanvas instanceof HTMLCanvasElement) || !state.nightSkyCanvas.isConnected) {
      const found = ns.querySelector('.cawf-ns-canvas');
      state.nightSkyCanvas = found instanceof HTMLCanvasElement ? found : null;
      state.nightSkyCtx = state.nightSkyCanvas ? state.nightSkyCanvas.getContext('2d') : null;
      force = true; // 캔버스를 새로 잡았으면 즉시 한 번 측정
    }

    const canvas = state.nightSkyCanvas;
    const ctx = state.nightSkyCtx;
    if (!canvas || !ctx) return null;

    // 노트북 최적화: 별 레이어 크기는 거의 안 변하므로 매 프레임 getBoundingClientRect(reflow)를
    // 하지 않고 ~500ms 간격으로만 다시 잰다. 별 위치/모양/움직임은 동일(시각 변화 없음).
    const now = performance.now();
    if (!force && state.nightSkyStars && state.nightSkyMeasuredAt && now - state.nightSkyMeasuredAt < 500) {
      return { ctx, width: state.nightSkyW || 1, height: state.nightSkyH || 1 };
    }
    state.nightSkyMeasuredAt = now;

    const rect = ns.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || ns.clientWidth || 1));
    const height = Math.max(1, Math.round(rect.height || ns.clientHeight || 1));
    const dpr = getCanvasDpr('night');
    state.nightSkyDpr = dpr;
    const tw = Math.max(1, Math.round(width * dpr));
    const th = Math.max(1, Math.round(height * dpr));

    if (canvas.width !== tw || canvas.height !== th) {
      canvas.width = tw;
      canvas.height = th;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      state.nightSkyStaticCanvas = null;
      state.nightSkyStaticCtx = null;
      state.nightSkyNeedsRebuild = true;
    }

    state.nightSkyW = width;
    state.nightSkyH = height;

    if (state.nightSkyNeedsRebuild || !state.nightSkyStars) {
      buildNightSkyStars(width, height);
      state.nightSkyNeedsRebuild = false;
    }

    return { ctx, width, height };
  }

  function drawNightSkyFrame(ts) {
    if (!nightSkyShouldRun()) { stopNightSky(); return; }

    const minFrameMs = 1000 / getCanvasFps('night');
    if (state.nightSkyFrameAt && ts - state.nightSkyFrameAt < minFrameMs) {
      state.nightSkyAnimId = window.requestAnimationFrame(drawNightSkyFrame);
      return;
    }
    state.nightSkyFrameAt = ts;

    const env = ensureNightSkyCanvas();
    if (!env) {
      state.nightSkyAnimId = window.requestAnimationFrame(drawNightSkyFrame);
      return;
    }
    const { ctx, width, height } = env;
    const data = state.nightSkyStars;
    if (!data) {
      state.nightSkyAnimId = window.requestAnimationFrame(drawNightSkyFrame);
      return;
    }

    const speed = clampValue(state.settings.timeSpeed, 0.55, 1.75, 1);
    const elapsed = (ts - data.startedAt) / 1000 * speed;

    ctx.clearRect(0, 0, width, height);

    const staticLayer = ensureNightSkyStaticLayer(width, height);
    if (staticLayer) {
      ctx.globalAlpha = 1;
      ctx.drawImage(staticLayer, 0, 0, width, height);
    }

    for (const s of data.stars) {
      if (staticLayer && !s.blink) continue;
      const t = (Math.sin(elapsed * s.tw + s.phase) + 1) / 2;
      const a = s.blink ? s.base * (0.3 + 0.7 * t) : s.base * (0.62 + 0.38 * t);
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }

    ctx.globalAlpha = 1;
    if (IS_LOW_POWER) {
      // v2.2.1: 저전력 밤하늘은 한 프레임만 그려 정적 별밭으로 유지한다.
      state.nightSkyAnimId = 0;
      return;
    }
    state.nightSkyAnimId = window.requestAnimationFrame(drawNightSkyFrame);
  }

  function startNightSky(reason = 'manual') {
    ensureRoot();
    if (!ensureNightSkyCanvas()) return;
    if (state.nightSkyAnimId) return;
    state.nightSkyFrameAt = 0;
    state.nightSkyAnimId = window.requestAnimationFrame(drawNightSkyFrame);
    log('night sky canvas started', reason);
  }

  function stopNightSky() {
    if (state.nightSkyAnimId) {
      window.cancelAnimationFrame(state.nightSkyAnimId);
      state.nightSkyAnimId = 0;
    }
    state.nightSkyFrameAt = 0;
    state.nightSkyMeasuredAt = 0;
    const ctx = state.nightSkyCtx;
    const canvas = state.nightSkyCanvas;
    if (ctx && canvas) {
      try { ctx.clearRect(0, 0, canvas.width, canvas.height); } catch (_) {}
    }
  }

  function syncNightSky(reason = 'sync') {
    if (nightSkyShouldRun()) startNightSky(reason);
    else stopNightSky();
  }

  function startRawMagicDust(reason = 'manual') {
    const env = ensureAmbientCanvas('mana');
    if (!env) return;

    const total = getParticleCount('mana');
    const signature = `raw-mana-glowsprite-count-64-100-130:${total}:${state.settings.effectOpacity}:${state.settings.effectSpeed}:${Math.round(env.width)}x${Math.round(env.height)}:${state.particleSeed}`;
    if (signature === state.ambientSignature && state.ambientAnimId) return;

    const random = seededRandom(state.particleSeed + 1777);
    const sprites = [];
    for (let i = 0; i < total; i += 1) {
      const size = 5.5 + random() * 36.5;
      const orbitAngle = random() * Math.PI * 2;
      const orbitDir = random() > 0.5 ? 1 : -1;
      const hue = 205 + random() * 80;
      sprites.push({
        cx: random() * env.width,
        cy: random() * env.height,
        orbitX: 10 + random() * 58,
        orbitY: 7 + random() * 42,
        orbitAngle,
        orbitSpeed: orbitDir * (0.09 + random() * 0.22),
        floatX: 5 + random() * 26,
        floatY: 4 + random() * 20,
        floatSpeedX: 0.05 + random() * 0.12,
        floatSpeedY: 0.04 + random() * 0.10,
        phase: random() * Math.PI * 2,
        size,
        startScale: 0.1 + random() * 2.4,
        endScale: 0.2 + random() * 0.6,
        rot: random() * Math.PI * 2,
        rotSpeed: (-1 + random() * 2) * 0.9,
        hue,
        glow: getManaGlowSprite(hue),
        alpha: 0.16 + random() * 0.62,
        pulseSpeed: 0.22 + random() * 0.50
      });
    }

    state.ambientEffectRuntime = { effect: 'mana', sprites, startedAt: performance.now(), needsReset: false };
    state.ambientSignature = signature;

    const draw = (ts) => {
      const minFrameMs = 1000 / getCanvasFps('mana');
      if (state.ambientFrameAt && ts - state.ambientFrameAt < minFrameMs) {
        state.ambientAnimId = window.requestAnimationFrame(draw);
        return;
      }
      if (getPaintedScreenEffect() !== 'mana' || document.hidden || state.effectInView === false) {
        state.ambientFrameAt = ts;
        state.ambientAnimId = window.requestAnimationFrame(draw);
        return;
      }
      state.ambientFrameAt = ts;
      const nextEnv = ensureAmbientCanvas('mana');
      if (!nextEnv) return;
      const { ctx, width, height } = nextEnv;
      if (state.ambientEffectRuntime?.needsReset) {
        state.ambientSignature = '';
        startRawMagicDust('resize');
        return;
      }
      const runtime = state.ambientEffectRuntime;
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      const speedSafe = getEffectSpeedSafe();
      const elapsed = (ts - runtime.startedAt) / 1000 * speedSafe * 0.65;

      for (const s of runtime.sprites) {
        const angle = s.orbitAngle + elapsed * s.orbitSpeed;
        const cx = s.cx + Math.sin(elapsed * s.floatSpeedX + s.phase) * s.floatX;
        const cy = s.cy + Math.cos(elapsed * s.floatSpeedY + s.phase) * s.floatY;

        const x = (cx + Math.cos(angle) * s.orbitX + width) % width;
        const y = (cy + Math.sin(angle) * s.orbitY + height) % height;

        const pulse = (Math.sin(elapsed * s.pulseSpeed + s.phase) + 1) / 2;
        const breathe = 0.28 + pulse * 0.72;
        const a = Math.max(0, Math.min(1, breathe)) * s.alpha;
        if (a <= 0.002) continue;

        const scale = s.startScale + (s.endScale - s.startScale) * pulse;
        const r = Math.max(0.62, s.size * scale * 0.082);
        const drawR = r * 3.5;

        // 사전 베이크된 글로우 스프라이트로 대체(매 프레임 createRadialGradient 제거)
        ctx.globalAlpha = a;
        ctx.drawImage(s.glow, x - drawR, y - drawR, drawR * 2, drawR * 2);
        ctx.globalAlpha = 1;

        if (s.size > 22) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(s.rot + s.rotSpeed * elapsed);
          ctx.globalAlpha = a * 0.45;
          ctx.strokeStyle = `hsla(${s.hue}, 100%, 86%, 1)`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(-r * 2.4, 0);
          ctx.lineTo(r * 2.4, 0);
          ctx.moveTo(0, -r * 2.4);
          ctx.lineTo(0, r * 2.4);
          ctx.stroke();
          ctx.restore();
        }
      }

      ctx.globalAlpha = 1;
      ctx.restore();
      state.ambientAnimId = window.requestAnimationFrame(draw);
    };

    if (state.ambientAnimId) window.cancelAnimationFrame(state.ambientAnimId);
    state.ambientAnimId = window.requestAnimationFrame(draw);
    log('raw mana glow-sprite cache started', reason, signature);
  }

  function startRawBokeh(reason = 'manual') {
    const env = ensureAmbientCanvas('bokeh');
    if (!env) return;

    const total = getParticleCount('bokeh');
    const signature = `bokeh-flat-lens-soft-v4-low-focus:${total}:${state.settings.intensity}:${state.settings.effectSpeed}:${Math.round(env.width)}x${Math.round(env.height)}:${state.particleSeed}`;
    if (signature === state.ambientSignature && state.ambientAnimId) return;

    const random = seededRandom(state.particleSeed + 74129);
    const sceneScale = Math.max(0.72, Math.min(1.35, Math.min(env.width, env.height) / 720));
    const spriteScale = IS_LOW_POWER ? 1 : Math.min(1.35, Math.max(1, env.dpr || 1));

    const makeSprite = (orb) => {
      // 중심 하이라이트나 비대칭 명암을 넣지 않는다.
      // 같은 색의 평평한 원판이 가장자리에서 길게 풀리게 만들어 '공'이 아닌 렌즈 보케로 보이게 한다.
      const radius = orb.radius;
      const diffusion = Math.max(10 * sceneScale, radius * (0.72 + orb.softness * 1.02));
      const outerRadius = radius + diffusion;
      const extent = Math.ceil(outerRadius + 4);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(2, Math.ceil(extent * 2 * spriteScale));
      canvas.height = canvas.width;
      const g = canvas.getContext('2d');
      g.scale(spriteScale, spriteScale);

      const c = extent;
      const hue = orb.hue.toFixed(1);
      const saturation = orb.saturation.toFixed(1);
      const lightness = orb.lightness.toFixed(1);

      // 넓고 옅은 초점 이탈부. 중앙과 가장자리의 색상 밝기는 같고 alpha만 풀린다.
      const haze = g.createRadialGradient(c, c, 0, c, c, outerRadius);
      haze.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness}%, ${orb.bright ? 0.22 : 0.16})`);
      haze.addColorStop(0.34, `hsla(${hue}, ${saturation}%, ${lightness}%, ${orb.bright ? 0.18 : 0.13})`);
      haze.addColorStop(0.68, `hsla(${hue}, ${saturation}%, ${lightness}%, ${orb.bright ? 0.07 : 0.055})`);
      haze.addColorStop(1, `hsla(${hue}, ${saturation}%, ${lightness}%, 0)`);
      g.fillStyle = haze;
      g.fillRect(0, 0, extent * 2, extent * 2);

      const bodyRadius = radius + diffusion * (orb.bright ? 0.56 : 0.40);
      const plateau = orb.bright ? 0.10 : Math.max(0.20, 0.60 - orb.softness * 0.31);
      const shoulder = orb.bright ? 0.48 : Math.max(0.48, 0.83 - orb.softness * 0.17);
      const bodyAlpha = orb.bright ? 0.61 : 0.64;
      const disc = g.createRadialGradient(c, c, 0, c, c, bodyRadius);
      disc.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness}%, ${bodyAlpha})`);
      disc.addColorStop(plateau, `hsla(${hue}, ${saturation}%, ${lightness}%, ${bodyAlpha * 0.96})`);
      disc.addColorStop(shoulder, `hsla(${hue}, ${saturation}%, ${lightness}%, ${bodyAlpha * 0.46})`);
      disc.addColorStop(1, `hsla(${hue}, ${saturation}%, ${lightness}%, 0)`);
      g.fillStyle = disc;
      g.beginPath();
      g.arc(c, c, bodyRadius, 0, Math.PI * 2);
      g.fill();

      // 작은 보케는 한쪽 반사광 대신 정중앙 대칭형 광번짐을 얹는다.
      // 밝기 변화가 모든 방향으로 동일해 입체 구가 아니라 초점 밖의 실제 광원처럼 보인다.
      if (orb.bright) {
        const bloomRadius = bodyRadius * 0.96;
        const bloom = g.createRadialGradient(c, c, 0, c, c, bloomRadius);
        bloom.addColorStop(0, `hsla(${hue}, ${saturation}%, ${Math.min(88, orb.lightness + 18)}%, .22)`);
        bloom.addColorStop(0.18, `hsla(${hue}, ${saturation}%, ${Math.min(84, orb.lightness + 11)}%, .14)`);
        bloom.addColorStop(0.52, `hsla(${hue}, ${saturation}%, ${Math.min(78, orb.lightness + 5)}%, .050)`);
        bloom.addColorStop(1, `hsla(${hue}, ${saturation}%, ${lightness}%, 0)`);
        g.fillStyle = bloom;
        g.beginPath();
        g.arc(c, c, bloomRadius, 0, Math.PI * 2);
        g.fill();
      }

      // 상대적으로 선명한 보케도 딱딱한 선을 긋지 않고 아주 옅은 렌즈 테두리만 남긴다.
      if (orb.softness < 0.54) {
        const rim = g.createRadialGradient(c, c, 0, c, c, bodyRadius);
        rim.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness}%, 0)`);
        rim.addColorStop(0.58, `hsla(${hue}, ${saturation}%, ${lightness}%, 0)`);
        rim.addColorStop(0.76, `hsla(${hue}, ${saturation}%, ${lightness}%, .085)`);
        rim.addColorStop(0.92, `hsla(${hue}, ${saturation}%, ${lightness}%, .025)`);
        rim.addColorStop(1, `hsla(${hue}, ${saturation}%, ${lightness}%, 0)`);
        g.fillStyle = rim;
        g.beginPath();
        g.arc(c, c, bodyRadius, 0, Math.PI * 2);
        g.fill();
      }

      return { canvas, extent };
    };

    const orbs = [];
    for (let i = 0; i < total; i += 1) {
      const bright = random() < 0.28;
      const softness = bright ? (0.58 + random() * 0.24) : (0.58 + random() * 0.42);
      const cool = random() < 0.09;
      const red = !cool && random() < 0.17;
      const radius = (bright
        ? (5 + random() * 12)
        : (18 + random() * 22 + softness * (28 + random() * 42))) * sceneScale;
      const hue = cool ? (216 + random() * 30) : (red ? (2 + random() * 13) : (26 + random() * 18));
      const saturation = cool ? (24 + random() * 30) : (84 + random() * 16);
      const lightness = cool ? (60 + random() * 16) : (50 + random() * 16);
      const alpha = bright
        ? (0.42 + (1 - softness) * 0.38 + random() * 0.10)
        : (0.10 + (1 - softness) * 0.42 + random() * 0.08);
      const angle = random() * Math.PI * 2;
      // 작은 고휘도 보케가 화면을 휙휙 가로지르지 않도록 기본 이동을 특히 느리게 잡는다.
      const driftSpeed = (bright ? (1.2 + random() * 2.4) : (2.0 + random() * 4.2)) * sceneScale;
      // 상단은 채팅 가독성과 화면 여백을 위해 중심점 생성을 줄이고, 중하단으로 완만하게 치우친다.
      const y = env.height * (0.08 + Math.pow(random(), 0.78) * 0.92);
      const orb = {
        x: random() * env.width,
        y,
        vx: Math.cos(angle) * driftSpeed,
        vy: Math.sin(angle) * driftSpeed * 0.72,
        wobbleX: (bright ? (6 + random() * 18) : (10 + random() * 32)) * sceneScale,
        wobbleY: (bright ? (4 + random() * 12) : (7 + random() * 23)) * sceneScale,
        wobbleRate: bright ? (0.055 + random() * 0.095) : (0.08 + random() * 0.15),
        pulseRate: bright ? (0.07 + random() * 0.12) : (0.09 + random() * 0.18),
        phase: random() * Math.PI * 2,
        softness,
        radius,
        hue,
        saturation,
        lightness,
        alpha,
        bright,
        sprite: null
      };
      orb.sprite = makeSprite(orb);
      orbs.push(orb);
    }

    // 넓게 퍼진 보케를 먼저 그려 작은 보케가 묻히지 않게 한다.
    orbs.sort((a, b) => b.softness - a.softness);
    state.ambientEffectRuntime = {
      effect: 'bokeh',
      orbs,
      startedAt: performance.now(),
      needsReset: false
    };
    state.ambientSignature = signature;

    const draw = (ts) => {
      const minFrameMs = 1000 / getCanvasFps('bokeh');
      if (state.ambientFrameAt && ts - state.ambientFrameAt < minFrameMs) {
        state.ambientAnimId = window.requestAnimationFrame(draw);
        return;
      }
      if (getPaintedScreenEffect() !== 'bokeh' || document.hidden || state.effectInView === false) {
        state.ambientFrameAt = ts;
        state.ambientAnimId = window.requestAnimationFrame(draw);
        return;
      }
      const previousFrameAt = state.ambientFrameAt || ts;
      state.ambientFrameAt = ts;

      const nextEnv = ensureAmbientCanvas('bokeh');
      if (!nextEnv) return;
      const { ctx, width, height } = nextEnv;
      const runtime = state.ambientEffectRuntime;
      if (!runtime || runtime.effect !== 'bokeh' || runtime.needsReset) {
        state.ambientSignature = '';
        startRawBokeh('resize');
        return;
      }

      const speedSafe = getEffectSpeedSafe();
      const dt = Math.min(0.075, Math.max(0.008, (ts - previousFrameAt) / 1000)) * speedSafe;
      const elapsed = (ts - runtime.startedAt) / 1000 * speedSafe;

      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';

      for (const orb of runtime.orbs) {
        orb.x += orb.vx * dt;
        orb.y += orb.vy * dt;

        const margin = orb.sprite.extent;
        if (orb.x < -margin) orb.x = width + margin;
        else if (orb.x > width + margin) orb.x = -margin;
        const topFloor = height * 0.08;
        if (orb.y < topFloor) orb.y = height + margin;
        else if (orb.y > height + margin) orb.y = topFloor;

        const x = orb.x + Math.sin(elapsed * orb.wobbleRate + orb.phase) * orb.wobbleX;
        const y = orb.y + Math.cos(elapsed * orb.wobbleRate * 0.78 + orb.phase) * orb.wobbleY;
        const pulse = 0.86 + Math.sin(elapsed * orb.pulseRate + orb.phase) * 0.14;
        ctx.globalAlpha = Math.max(0, Math.min(1, orb.alpha * pulse));
        ctx.drawImage(
          orb.sprite.canvas,
          x - orb.sprite.extent,
          y - orb.sprite.extent,
          orb.sprite.extent * 2,
          orb.sprite.extent * 2
        );
      }

      ctx.globalAlpha = 1;
      ctx.restore();
      state.ambientAnimId = window.requestAnimationFrame(draw);
    };

    if (state.ambientAnimId) window.cancelAnimationFrame(state.ambientAnimId);
    state.ambientCtx?.clearRect?.(0, 0, env.width, env.height);
    state.ambientAnimId = window.requestAnimationFrame(draw);
    log('flat soft bokeh canvas started', reason, signature);
  }

  function getFireworkBurstCount() {
    const level = normalizeChoice(state.settings.intensity, ['low', 'medium', 'high'], 'medium');
    // v1.1.7: 효과 양은 불꽃 수/동시 유지량/발사 간격만 제어한다.
    // 크기는 effectSpeed와 분리하고, 아래 startRawFireworks의 고정 스케일이 담당한다.
    if (IS_LOW_POWER) {
      if (level === 'low') return 18;
      if (level === 'high') return 34;
      return 24;
    }
    if (level === 'low') return IS_MOBILE ? 26 : 40;
    if (level === 'high') return IS_MOBILE ? 60 : 96;
    return IS_MOBILE ? 40 : 68;
  }

  function getFireworkMaxLiveParticles() {
    const level = normalizeChoice(state.settings.intensity, ['low', 'medium', 'high'], 'medium');
    if (IS_LOW_POWER) {
      if (level === 'low') return 62;
      if (level === 'high') return 128;
      return 88;
    }
    if (level === 'low') return IS_MOBILE ? 105 : 190;
    if (level === 'high') return IS_MOBILE ? 250 : 430;
    return IS_MOBILE ? 165 : 310;
  }

  function getFireworkLaunchGap() {
    const level = normalizeChoice(state.settings.intensity, ['low', 'medium', 'high'], 'medium');
    if (IS_LOW_POWER) {
      if (level === 'low') return [2500, 4300];
      if (level === 'high') return [1350, 2650];
      return [1900, 3450];
    }
    if (level === 'low') return IS_MOBILE ? [1850, 3300] : [1600, 3000];
    if (level === 'high') return IS_MOBILE ? [900, 1850] : [680, 1450];
    return IS_MOBILE ? [1300, 2450] : [980, 2050];
  }


  function startUnderwater(reason = 'manual') {
    if (IS_MOBILE) {
      stopUnderwater();
      log('underwater skipped on non-PC environment', reason);
      return;
    }
    ensureRoot();
    if (!isEpisodePath()) return;
    let canvas = state.underwaterCanvas instanceof HTMLCanvasElement
      ? state.underwaterCanvas
      : document.getElementById(IDS.underwaterCanvas);
    if (!(canvas instanceof HTMLCanvasElement)) return;

    const rect = state.bounds || canvas.getBoundingClientRect?.() || { width: 1024, height: 1024 };
    const dpr = IS_LOW_POWER ? 0.72 : Math.min(window.devicePixelRatio || 1, 1.1);
    const minDimension = IS_LOW_POWER ? 240 : 320;
    const width = Math.max(minDimension, Math.min(1200, Math.round((Number(rect.width) || 1024) * dpr)));
    const height = Math.max(minDimension, Math.min(1200, Math.round((Number(rect.height) || 1024) * dpr)));
    const signature = `underwater-codepen-floor-caustics-v7-fpscap-res:${width}x${height}:${state.settings.effectOpacity}:${state.settings.effectSpeed}`;
    if (state.underwaterSignature === signature && state.underwaterAnimId && state.underwaterGl) return;

    // stopUnderwater()는 WebGL context 재사용 문제를 피하려고 canvas를 교체한다.
    // 교체 후에는 반드시 새 canvas를 다시 잡아야 화면에 실제로 그려진다.
    stopUnderwater();
    canvas = document.getElementById(IDS.underwaterCanvas);
    if (!(canvas instanceof HTMLCanvasElement)) return;
    state.underwaterCanvas = canvas;

    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false
    });
    if (!gl) {
      log('underwater webgl unavailable', reason);
      return;
    }
    // Own the context even if shader setup fails, so the next stop can release it.
    state.underwaterGl = gl;

    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Vertex shader: full-screen quad.
    const vertexShaderSource = `
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    // Fragment shader: CAWF underwater caustics core.
    const fragmentShaderSource = `
       precision highp float;
      uniform float time;
      uniform vec2 resolution;

      // Simple hash function for pseudo-random
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      // Voronoi/Worley noise
      float voronoi(vec2 uv) {
        vec2 i = floor(uv);
        vec2 f = fract(uv);
        float minDist = 1.0;
        for(int y = -1; y <= 1; y++) {
          for(int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 point = hash(i + neighbor) * vec2(1.0);
            vec2 diff = neighbor + point - f;
            float dist = length(diff);
            minDist = min(minDist, dist);
          }
        }
        return minDist;
      }
      void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        uv.x *= resolution.x / resolution.y; // Correct aspect ratio

        // Multiple layers of caustics moving at different speeds
        float caustic1 = voronoi((uv + vec2(time * 0.1, 0.0)) * 5.0);
        float caustic2 = voronoi((uv - vec2(0.0, time * 0.15)) * 5.0);

        // Combine layers (multiplication creates bright spots)
        float caustics = caustic1 * caustic2;
        // Increase contrast
        caustics = pow(caustics * 1.5, 3.0);

        // Color it (blue-green water tint).
        // CAWF root is a contained overlay, so pure CodePen screen-blend alpha=1 can become invisible/black in some Crack rooms.
        // Keep the original caustic field, but draw only the bright caustic light as alpha so the room background remains untouched.
        vec3 color = vec3(0.58, 0.86, 1.08) * caustics * 2.05;
        float alpha = smoothstep(0.004, 0.10, caustics) * 0.95;

        gl_FragColor = vec4(color, alpha);
      }
    `;

    const compileShader = (source, type) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(info || 'underwater shader compile failed');
      }
      return shader;
    };

    let vertexShader = null;
    let fragmentShader = null;
    let program = null;
    try {
      vertexShader = compileShader(vertexShaderSource, gl.VERTEX_SHADER);
      fragmentShader = compileShader(fragmentShaderSource, gl.FRAGMENT_SHADER);
      program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || 'underwater program link failed');
      }
      gl.useProgram(program);
    } catch (err) {
      console.warn('[CAWF] underwater WebGL init failed:', err);
      try { if (program) gl.deleteProgram(program); } catch (_) {}
      try { if (vertexShader) gl.deleteShader(vertexShader); } catch (_) {}
      try { if (fragmentShader) gl.deleteShader(fragmentShader); } catch (_) {}
      return;
    }

    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1
    ]);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    const positionLocation = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const timeLocation = gl.getUniformLocation(program, 'time');
    const resolutionLocation = gl.getUniformLocation(program, 'resolution');

    state.underwaterGl = gl;
    state.underwaterProgram = program;
    state.underwaterSignature = signature;

    let underwaterLastTs = 0;
    const underwaterMinFrameMs = 1000 / getCanvasFps('underwater');
    const render = (time) => {
      if (getPaintedScreenEffect() !== 'underwater') {
        stopUnderwater();
        return;
      }
      if (document.hidden || state.effectInView === false) {
        state.underwaterAnimId = window.requestAnimationFrame(render);
        return;
      }

      // 노트북 최적화: 수중 빛(코스틱)은 천천히 일렁여서 30fps로 줄여도 눈에 안 띈다.
      if (underwaterLastTs && time - underwaterLastTs < underwaterMinFrameMs) {
        state.underwaterAnimId = window.requestAnimationFrame(render);
        return;
      }
      underwaterLastTs = time;

      const speed = getEffectSpeedSafe();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform1f(timeLocation, time * 0.001 * speed);
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      state.underwaterAnimId = window.requestAnimationFrame(render);
    };

    state.underwaterAnimId = window.requestAnimationFrame(render);
    log('underwater CodePen WebGL caustics started', reason, signature);
  }

  function stopUnderwater() {
    if (state.underwaterAnimId) {
      window.cancelAnimationFrame(state.underwaterAnimId);
      state.underwaterAnimId = 0;
    }

    const gl = state.underwaterGl;
    const oldCanvas = state.underwaterCanvas;
    if (!gl) { state.underwaterProgram = null; state.underwaterSignature = ''; return; }
    if (gl) {
      try { gl.clear(gl.COLOR_BUFFER_BIT); } catch (_) {}
      try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch (_) {}
    }

    // lost context can be hard to reuse in userscript overlays; replace the canvas so the next start gets a fresh WebGL context.
    if (oldCanvas instanceof HTMLCanvasElement && oldCanvas.isConnected) {
      try {
        const fresh = oldCanvas.cloneNode(false);
        fresh.width = 1;
        fresh.height = 1;
        oldCanvas.replaceWith(fresh);
        state.underwaterCanvas = fresh;
      } catch (_) {}
    }

    state.underwaterGl = null;
    state.underwaterProgram = null;
    state.underwaterSignature = '';
  }

  function startRawFireworks(reason = 'manual') {
    const env = ensureAmbientCanvas('fireworks');
    if (!env) return;

    const burstCount = getFireworkBurstCount();
    const maxLiveParticles = getFireworkMaxLiveParticles();
    const launchGap = getFireworkLaunchGap();
    const signature = `fireworks-night-canvas-v119-amount-speed-baseline-080-size-fixed:${burstCount}:${maxLiveParticles}:${launchGap.join('-')}:${state.settings.effectOpacity}:${state.settings.effectSpeed}:${Math.round(env.width)}x${Math.round(env.height)}:${state.particleSeed}`;
    if (signature === state.ambientSignature && state.ambientAnimId) return;

    const random = seededRandom(state.particleSeed + 90817);
    const sparks = [];
    const rockets = [];
    const flashes = [];
    const glowCache = new Map();
    const flashCache = new Map();
    const getFlashSprite = (red, green, blue) => {
      const key = `${red},${green},${blue}`;
      const cached = flashCache.get(key);
      if (cached) return cached;
      const size = 192;
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const g = c.getContext('2d');
      const center = size / 2;
      const grd = g.createRadialGradient(center, center, 0, center, center, center);
      grd.addColorStop(0, 'rgba(255,255,255,0.9)');
      grd.addColorStop(0.18, `rgba(${red},${green},${blue},1)`);
      grd.addColorStop(1, `rgba(${red},${green},${blue},0)`);
      g.fillStyle = grd;
      g.fillRect(0, 0, size, size);
      flashCache.set(key, c);
      return c;
    };
    const colourPool = [
      [255, 236, 168], [255, 178, 118], [255, 126, 165], [148, 205, 255],
      [157, 255, 198], [222, 174, 255], [255, 218, 96], [245, 250, 255]
    ];

    const clampNum = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

    const getGlowSprite = (red, green, blue) => {
      const key = `${red},${green},${blue}`;
      const cached = glowCache.get(key);
      if (cached) return cached;

      const size = 48;
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const g = c.getContext('2d');
      const center = size / 2;
      const grd = g.createRadialGradient(center, center, 0, center, center, center);
      grd.addColorStop(0, `rgba(${red},${green},${blue},0.95)`);
      grd.addColorStop(0.18, `rgba(${red},${green},${blue},0.55)`);
      grd.addColorStop(0.55, `rgba(${red},${green},${blue},0.16)`);
      grd.addColorStop(1, `rgba(${red},${green},${blue},0)`);
      g.fillStyle = grd;
      g.fillRect(0, 0, size, size);
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.beginPath();
      g.arc(center, center, 2.2, 0, Math.PI * 2);
      g.fill();

      glowCache.set(key, c);
      return c;
    };

    const addFlash = (x, y, base) => {
      flashes.push({
        x,
        y,
        red: base[0],
        green: base[1],
        blue: base[2],
        life: 0,
        maxLife: 380 + random() * 180,
        radius: 38 + random() * 42
      });
      if (flashes.length > 8) flashes.splice(0, flashes.length - 8);
    };

    const createBurst = (width, height, x, y) => {
      const base = colourPool[Math.floor(random() * colourPool.length)] || colourPool[0];
      // v1.1.7: 기존 effectSpeed 175%에서 보이던 폭죽 반경을 기본 크기로 고정한다.
      // 이후 effectSpeed는 애니메이션 시간만 빠르게/느리게 하고, 폭죽 반경은 바꾸지 않는다.
      const burstSizeScale = 1.75;
      const total = burstCount + Math.floor(random() * Math.max(4, burstCount * 0.18));
      addFlash(x, y, base);

      for (let i = 0; i < total; i += 1) {
        const angle = (Math.PI * 2 * i) / total + (random() - 0.5) * 0.25;
        const ring = i % 7 === 0 ? 1.22 : (0.66 + random() * 0.58);
        const speed = (1.05 + random() * 1.25) * burstSizeScale * ring;
        const willow = i % 9 === 0;
        const red = clampNum(base[0] + Math.floor((random() - 0.5) * 36), 0, 255);
        const green = clampNum(base[1] + Math.floor((random() - 0.5) * 36), 0, 255);
        const blue = clampNum(base[2] + Math.floor((random() - 0.5) * 36), 0, 255);

        sparks.push({
          x,
          y,
          px: x,
          py: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          r: willow ? (1.06 + random() * 0.82) : (0.82 + random() * 0.9),
          life: 0,
          maxLife: willow ? (1180 + random() * 740) : (760 + random() * 620),
          red,
          green,
          blue,
          tail: willow ? (13 + random() * 15) : (7 + random() * 10),
          drift: (random() - 0.5) * 0.006,
          twinkle: random() * Math.PI * 2
        });
      }

      if (sparks.length > maxLiveParticles) {
        sparks.splice(0, sparks.length - maxLiveParticles);
      }
    };

    const spawnRocket = (width, height) => {
      if (rockets.length >= ((IS_MOBILE || IS_LOW_POWER) ? 1 : 2)) return;
      const startX = width * (0.18 + random() * 0.64);
      const targetX = clampNum(startX + (random() - 0.5) * width * 0.34, width * 0.12, width * 0.88);
      const targetY = height * (0.09 + random() * 0.33);
      const travel = 720 + random() * 420;
      rockets.push({
        x: startX,
        y: height + 22,
        px: startX,
        py: height + 22,
        targetX,
        targetY,
        life: 0,
        maxLife: travel,
        hue: colourPool[Math.floor(random() * colourPool.length)] || colourPool[0]
      });
    };

    state.ambientEffectRuntime = {
      effect: 'fireworks',
      sparks,
      rockets,
      flashes,
      needsReset: false,
      nextLaunchAt: performance.now() + 300 + random() * 700,
      createBurst,
      spawnRocket,
    };
    state.ambientSignature = signature;

    const draw = (ts) => {
      const minFrameMs = 1000 / getCanvasFps('fireworks');
      if (state.ambientFrameAt && ts - state.ambientFrameAt < minFrameMs) {
        state.ambientAnimId = window.requestAnimationFrame(draw);
        return;
      }
      if (getPaintedScreenEffect() !== 'fireworks' || document.hidden || state.effectInView === false) {
        state.ambientFrameAt = ts;
        state.ambientAnimId = window.requestAnimationFrame(draw);
        return;
      }
      const prevFrameAt = state.ambientFrameAt || ts;
      state.ambientFrameAt = ts;
      const dt = Math.min(IS_LOW_POWER ? 80 : 38, Math.max(10, ts - prevFrameAt));
      // v1.1.9: fireworks baseline is 20% slower; the speed slider still affects motion/timing only.
      const speedSafe = getEffectSpeedSafe() * 0.8;
      const simDt = dt * speedSafe;
      const dtScale = simDt / (1000 / 60);

      const nextEnv = ensureAmbientCanvas('fireworks');
      if (!nextEnv) return;
      const { ctx, width, height } = nextEnv;
      const runtime = state.ambientEffectRuntime;
      if (!runtime || runtime.effect !== 'fireworks' || runtime.needsReset) {
        state.ambientSignature = '';
        startRawFireworks('resize');
        return;
      }

      ctx.clearRect(0, 0, width, height);

      if (ts >= runtime.nextLaunchAt) {
        runtime.spawnRocket(width, height);
        runtime.nextLaunchAt = ts + (launchGap[0] + random() * Math.max(1, launchGap[1] - launchGap[0])) / Math.max(0.55, speedSafe);
      }

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const opacity = clampValue(state.settings.effectOpacity, 0.12, 1.5, 0.74);

      for (let i = runtime.flashes.length - 1; i >= 0; i -= 1) {
        const f = runtime.flashes[i];
        f.life += simDt;
        const p = f.life / f.maxLife;
        if (p >= 1) {
          runtime.flashes.splice(i, 1);
          continue;
        }
        const alpha = Math.max(0, 1 - p) * 0.35 * opacity;
        const radius = f.radius * (0.32 + p * 1.15);
        ctx.globalAlpha = Math.min(1, alpha);
        ctx.drawImage(
          getFlashSprite(f.red, f.green, f.blue),
          f.x - radius, f.y - radius, radius * 2, radius * 2
        );
        ctx.globalAlpha = 1;
      }

      for (let i = runtime.rockets.length - 1; i >= 0; i -= 1) {
        const r = runtime.rockets[i];
        r.life += simDt;
        const p = Math.min(1, r.life / r.maxLife);
        const ease = 1 - Math.pow(1 - p, 2.2);
        r.px = r.x;
        r.py = r.y;
        r.x = r.x + (r.targetX - r.x) * 0.075 * dtScale;
        r.y = (height + 22) + (r.targetY - (height + 22)) * ease;

        const alpha = Math.max(0, 1 - p * 0.35) * opacity;
        ctx.strokeStyle = `rgba(${r.hue[0]},${r.hue[1]},${r.hue[2]},${(alpha * 0.72).toFixed(3)})`;
        ctx.lineWidth = IS_MOBILE ? 1.1 : 1.35;
        ctx.beginPath();
        ctx.moveTo(r.px, r.py + 12);
        ctx.lineTo(r.x, r.y);
        ctx.stroke();
        ctx.fillStyle = `rgba(255,255,255,${(alpha * 0.85).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(r.x, r.y, 1.55, 0, Math.PI * 2);
        ctx.fill();

        if (p >= 1) {
          runtime.createBurst(width, height, r.targetX, r.targetY);
          runtime.rockets.splice(i, 1);
        }
      }

      ctx.lineCap = 'round';
      for (let i = runtime.sparks.length - 1; i >= 0; i -= 1) {
        const p = runtime.sparks[i];
        p.life += simDt;
        const progress = p.life / p.maxLife;
        if (progress >= 1 || p.y > height + 48 || p.x < -48 || p.x > width + 48) {
          runtime.sparks.splice(i, 1);
          continue;
        }

        p.px = p.x;
        p.py = p.y;
        p.vx = p.vx * 0.986 + p.drift * dtScale;
        p.vy = p.vy * 0.986 + 0.028 * dtScale;
        p.x += p.vx * dtScale;
        p.y += p.vy * dtScale;

        const fade = progress < 0.1 ? progress / 0.1 : Math.max(0, 1 - Math.pow(progress, 1.55));
        const twinkle = 0.78 + Math.sin(p.twinkle + progress * 10.5) * 0.18;
        const alpha = Math.max(0, fade * twinkle) * opacity;
        const dx = p.x - p.px;
        const dy = p.y - p.py;
        const len = Math.max(1, Math.hypot(dx, dy));
        const tx = p.x - (dx / len) * p.tail;
        const ty = p.y - (dy / len) * p.tail;

        ctx.strokeStyle = `rgba(${p.red},${p.green},${p.blue},${(alpha * 0.58).toFixed(3)})`;
        ctx.lineWidth = Math.max(0.62, p.r * 0.68);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();

        const sprite = getGlowSprite(p.red, p.green, p.blue);
        const size = p.r * (9.4 + (1 - progress) * 4.0);
        ctx.globalAlpha = Math.min(1, alpha * 0.86);
        ctx.drawImage(sprite, p.x - size / 2, p.y - size / 2, size, size);
        ctx.globalAlpha = 1;
      }

      ctx.restore();
      state.ambientAnimId = window.requestAnimationFrame(draw);
    };

    if (state.ambientAnimId) window.cancelAnimationFrame(state.ambientAnimId);
    state.ambientCtx?.clearRect?.(0, 0, env.width, env.height);
    state.ambientAnimId = window.requestAnimationFrame(draw);
    log('fireworks rocket-trail canvas started', reason, signature);
  }

  function rebuildAmbientLayer(effect, reason = 'manual') {
    ensureRoot();
    const ambient = state.ambient;
    if (!(ambient instanceof HTMLElement)) return;

    if (effect === 'aurora') {
      stopAmbientAnimation();

      // 성능 조율판: 원본 201 ray 대신 줄인 ray로 유지감은 남기고 합성 부담을 낮춘다.
      const count = IS_LOW_POWER ? (IS_MOBILE ? 16 : 24) : (IS_MOBILE ? 32 : 85);
      const signature = `aurora-rays-raw:${count}:${state.settings.effectOpacity}:${state.settings.effectSpeed}:${state.activeTimeEffect}:${state.particleSeed}`;
      if (signature === state.ambientSignature && ambient.querySelectorAll('.cawf-aurora-ray').length === count) return;

      const random = seededRandom(state.particleSeed + 7069 + count * 17);
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < count; i += 1) fragment.appendChild(makeAuroraRay(i, random));
      ambient.replaceChildren(fragment);
      state.ambientSignature = signature;
      log('ambient rebuilt', reason, signature);
      return;
    }

    if (effect === 'candlelight') {
      stopAmbientAnimation();
      const count = getCandlelightMoteCount();
      const signature = `candlelight-motes-v1:${count}:${state.settings.intensity}:${state.settings.effectOpacity}:${state.settings.effectSpeed}:${state.particleSeed}`;
      if (signature === state.ambientSignature && ambient.querySelectorAll('.cawf-candle-motes > i').length === count) return;

      const random = seededRandom(state.particleSeed + 9157 + count * 31);
      const motes = document.createElement('div');
      motes.className = 'cawf-candle-motes';
      motes.setAttribute('aria-hidden', 'true');
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < count; i += 1) fragment.appendChild(makeCandlelightMote(random));
      motes.appendChild(fragment);
      ambient.replaceChildren(motes);
      state.ambientSignature = signature;
      log('candlelight ambient rebuilt', reason, signature);
      return;
    }

    if (effect === 'shore') {
      stopAmbientAnimation();
      const signature = `shore-static-filter-lite-v20:${state.settings.effectOpacity}:${state.settings.effectSpeed}:${state.activeTimeEffect}:${state.particleSeed}`;
      if (signature === state.ambientSignature && ambient.querySelector('.cawf-shore-scene')) return;
      ambient.innerHTML = getShoreLayerHtml();
      state.ambientSignature = signature;
      log('wave surf rebuilt', reason, signature);
      return;
    }

    if (effect === 'spellcast') {
      stopAmbientAnimation();
      const count = getSpellcastMoteCount();
      const { width, height } = getParticleLayerSize();
      const signature = `spellcast-rune-v1:${count}:${width}x${height}:${state.settings.intensity}:${state.settings.effectOpacity}:${state.settings.effectSpeed}:${state.particleSeed}`;
      if (signature === state.ambientSignature && ambient.querySelectorAll('.cawf-spell-motes > i').length === count) return;

      ambient.innerHTML = getSpellcastLayerHtml();
      // 실제 채팅 화면에서는 HTML 미리보기보다 작게 보이므로 기본 이식 크기보다 약 20% 확대한다.
      const scale = Math.max(.44, Math.min(1.06, (Math.min(width, height) / 720) * 1.18));
      const spellcast = ambient.querySelector('.cawf-spellcast');
      const motes = ambient.querySelector('.cawf-spell-motes');
      const soundCue = ambient.querySelector('.cawf-spell-sound-cue');
      if (spellcast instanceof HTMLElement) spellcast.style.setProperty('--spell-scale', scale.toFixed(3));
      if (soundCue instanceof HTMLElement) soundCue.addEventListener('animationiteration', handleSpellBurstCue);
      if (motes instanceof HTMLElement) {
        const random = seededRandom(state.particleSeed + 12289 + count * 43);
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < count; i += 1) fragment.appendChild(makeSpellcastMote(random, i));
        motes.appendChild(fragment);
      }
      state.ambientSignature = signature;
      log('spellcast rune circle rebuilt', reason, signature);
      return;
    }

    if (effect === 'mana') {
      if (!isEpisodePath()) return;
      startRawMagicDust(reason);
      return;
    }

    if (effect === 'bokeh') {
      if (!isEpisodePath()) return;
      startRawBokeh(reason);
      return;
    }

    if (effect === 'galaxy') {
      if (!isEpisodePath()) return;
      startRawGalaxy(reason);
      return;
    }

    if (effect === 'fireworks') {
      if (!isEpisodePath()) return;
      startRawFireworks(reason);
      return;
    }

    if (effect === 'underwater') {
      if (!isEpisodePath()) return;
      stopAmbientAnimation();
      if (ambient.childNodes.length) ambient.replaceChildren();
      state.ambientSignature = `underwater-layer:${state.settings.effectOpacity}:${state.settings.effectSpeed}`;
      startUnderwater(reason);
      return;
    }

    clearAmbientChildren();
  }


  function rebuildParticles(reason = 'manual') {
    ensureRoot();
    const particles = state.particles;
    if (!particles) return;

    const effect = getPaintedScreenEffect();
    if (!effect || effect === 'none') {
      particles.replaceChildren();
      state.particleSignature = '';
      clearAmbientChildren();
      stopCanvasRain(true);
      updateRootVisibility();
      return;
    }

    if (effect === 'rain') {
      particles.replaceChildren();
      state.particleSignature = `rain-canvas:${state.settings.intensity}:${state.settings.effectSpeed}`;
      clearAmbientChildren();
      startCanvasRain(reason);
      updateRootVisibility();
      return;
    }

    if (AMBIENT_EFFECTS.has(effect)) {
      particles.replaceChildren();
      state.particleSignature = `ambient:${effect}:${state.settings.effectOpacity}:${state.settings.effectSpeed}`;
      stopCanvasRain(true);
      rebuildAmbientLayer(effect, reason);
      updateRootVisibility();
      return;
    }

    stopCanvasRain(true);
    clearAmbientChildren();
    const count = getParticleCount(effect);
    const layerSize = effect === 'fireflies' ? getParticleLayerSize() : null;
    const layerKey = layerSize ? `:${layerSize.width}x${layerSize.height}:layer-px-v1` : '';
    const signature = `${effect}:${state.settings.intensity}:${state.settings.effectSpeed}:${count}:${state.particleSeed}${layerKey}`;
    if (signature === state.particleSignature && particles.children.length === count) {
      updateRootVisibility();
      return;
    }

    const random = seededRandom(state.particleSeed + effect.length * 997 + count * 13);
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < count; i += 1) fragment.appendChild(makeParticle(effect, random, i, count));
    particles.replaceChildren(fragment);
    state.particleSignature = signature;
    updateRootVisibility();
    log('particles rebuilt', reason, signature);
  }

  function setActiveEffect(effect, reason = 'manual') {
    const next = normalizeChoice(effect, ACTIVE_EFFECT_CHOICES, 'none');
    const prev = state.activeEffect;

    // 값이 그대로면 무거운 재구성을 건너뛴다. 단, 아직 DOM에 한 번도 반영 안 된
    // 초기 상태이거나 강제 사유일 때는 예외적으로 통과시켜 첫 적용 누락을 막는다.
    const forceReasons = ['settings', 'settings-reset', 'manual-rescan', 'keywords-save', 'select:intensity', 'chip:intensity', 'leave-room', 'disabled'];
    const alreadyPainted = state.root && state.root.getAttribute('data-effect') !== null;
    if (prev === next && alreadyPainted && !forceReasons.includes(reason)) {
      // 표시 갱신만 가볍게 유지(오디오/버튼 상태 동기화).
      syncPaintedTimeLayer(getPaintedScreenEffect(next, state.activeTimeEffect), state.activeTimeEffect);
      syncAudioWithEffect();
      syncFloatingButton();
      return;
    }

    state.activeEffect = next;

    const root = ensureRoot();
    const paintedScreenEffect = getPaintedScreenEffect(next, state.activeTimeEffect);
    root.setAttribute('data-effect', paintedScreenEffect);
    syncPaintedTimeLayer(paintedScreenEffect, state.activeTimeEffect);

    if (prev !== next) {
      state.particleSeed = Date.now() ^ Math.floor(Math.random() * 100000);
      state.particleSignature = '';
      state.ambientSignature = '';
    }

    rebuildParticles(reason);
    syncAudioWithEffect();
    syncFloatingButton();
    syncPanel();
  }


  function stageTimeBackgroundTransition(nextTimeEffect) {
    const root = ensureRoot();
    const layer = state.timeLayer;
    if (!(root instanceof HTMLElement) || !(layer instanceof HTMLElement)) return false;

    const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return false;

    document.querySelectorAll('.cawf-time-transition-host').forEach(node => node.remove());
    layer.classList.remove('cawf-time-transition-in');

    const currentPaintedTime = layer.getAttribute('data-cawf-time-enabled') === 'true'
      ? (root.getAttribute('data-time-effect') || 'none')
      : 'none';
    const nextScreenEffect = getPaintedScreenEffect(state.activeEffect, nextTimeEffect);
    const nextPaintedTime = (
      state.settings.enabled &&
      state.settings.timeBackgroundEnabled &&
      nextTimeEffect &&
      nextTimeEffect !== 'none' &&
      nextScreenEffect !== 'underwater'
    ) ? nextTimeEffect : 'none';

    if (currentPaintedTime === nextPaintedTime) return false;

    if (currentPaintedTime !== 'none') {
      const ghost = layer.cloneNode(true);
      ghost.classList.remove('cawf-time-transition-in');
      ghost.classList.add('cawf-time-transition-ghost');
      ghost.setAttribute('data-time-effect', currentPaintedTime);
      ghost.setAttribute('data-cawf-time-enabled', 'true');
      ghost.setAttribute('aria-hidden', 'true');

      const sourceCanvas = layer.querySelector('.cawf-ns-canvas');
      const ghostCanvas = ghost.querySelector('.cawf-ns-canvas');
      const host = root.cloneNode(false);
      host.removeAttribute('id');
      host.className = 'cawf-time-transition-host';
      host.setAttribute('aria-hidden', 'true');
      host.style.display = 'block';
      host.style.pointerEvents = 'none';
      host.style.overflow = 'hidden';
      host.appendChild(ghost);
      root.parentNode?.insertBefore(host, root);
      if (sourceCanvas instanceof HTMLCanvasElement && ghostCanvas instanceof HTMLCanvasElement && sourceCanvas.width > 0 && sourceCanvas.height > 0) {
        try {
          ghostCanvas.width = sourceCanvas.width;
          ghostCanvas.height = sourceCanvas.height;
          ghostCanvas.getContext('2d')?.drawImage(sourceCanvas, 0, 0);
        } catch (_) {}
      }
      window.setTimeout(() => host.remove(), 1650);
    }

    return nextPaintedTime !== 'none';
  }

  function finishTimeBackgroundTransition(shouldFadeIn) {
    const layer = state.timeLayer;
    if (!(layer instanceof HTMLElement) || !shouldFadeIn) return;
    layer.classList.remove('cawf-time-transition-in');
    void layer.offsetWidth;
    layer.classList.add('cawf-time-transition-in');
    window.setTimeout(() => layer.classList.remove('cawf-time-transition-in'), 1650);
  }


  function setActiveTimeEffect(effect, reason = 'manual') {
    const next = normalizeChoice(effect, ACTIVE_TIME_CHOICES, 'none');
    const prev = state.activeTimeEffect;

    const forceReasons = ['settings', 'settings-reset', 'manual-rescan', 'keywords-save', 'leave-room', 'disabled'];
    const alreadyPainted = state.root && state.root.getAttribute('data-time-effect') !== null;
    if (prev === next && alreadyPainted && !forceReasons.includes(reason)) {
      syncNightSky('time:' + next);
      return;
    }

    const root = ensureRoot();
    const shouldFadeIn = stageTimeBackgroundTransition(next);
    state.activeTimeEffect = next;

    const paintedScreenEffect = getPaintedScreenEffect(state.activeEffect, next);
    root.setAttribute('data-effect', paintedScreenEffect);
    const paintedTimeEffect = syncPaintedTimeLayer(paintedScreenEffect, next);
    finishTimeBackgroundTransition(shouldFadeIn && paintedTimeEffect !== 'none');
    rebuildParticles(reason);
    updateRootVisibility();
    syncFloatingButton();
    syncPanel();
    syncNightSky('time:' + next);
    // v2.5.6: 시간대가 바뀌는 즉시 불꽃놀이 등 시간 제한 오디오도 재판정한다.
    syncAudioWithEffect();
    log('time background updated', reason, next);
  }

  function isVisibleRect(rect) {
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    return rect.bottom > 0 && rect.right > 0 && rect.top < vh && rect.left < vw;
  }

  function getCurrentAnswerMarkerScore(group) {
    if (!(group instanceof HTMLElement)) return 0;

    let score = 0;
    // 현재 활성 답변/리롤 비교 답변 쪽에 붙는 마커들.
    // 사용자가 보내준 최신 로그 샘플에는 data-rr-compare-nav="1"가 chat bubble에 있고,
    // 아래쪽 툴바에는 data-source="api-current-reroll" 시간 배지와 "답변 비교 2/2" 버튼이 같이 붙어 있었다.
    if (group.querySelector('[data-rr-compare-nav]')) score += 100;
    if (group.querySelector('.crack-message-time-badge-badge[data-source="api-current-reroll"]')) score += 80;
    if (group.querySelector('[data-reroll-resolved="true"]')) score += 40;
    if (group.querySelector('.crack-reroll-mixer-open-btn')) score += 20;
    if (String(group.textContent || '').includes('답변 비교')) score += 10;
    return score;
  }

  function getMessageSortKey(group, markdown, domIndex = 0, precomputedRect = null) {
    const rect = precomputedRect || group?.getBoundingClientRect?.() || markdown?.getBoundingClientRect?.() || null;
    const lenAtRaw = markdown?.getAttribute?.('data-sgb-len-at') || '';
    const lenAt = Number(lenAtRaw) || 0;
    const groupId = String(group?.getAttribute?.('data-message-group-id') || '').trim();
    const hexRank = /^[0-9a-f]{8,}$/i.test(groupId) ? groupId.toLowerCase() : '';
    const currentScore = getCurrentAnswerMarkerScore(group);

    return {
      currentScore,
      lenAt,
      groupId,
      hexRank,
      domIndex,
      top: Number(rect?.top || 0),
      bottom: Number(rect?.bottom || 0)
    };
  }

  function compareMessageSortKey(a, b) {
    // Decoration timestamps are not message timestamps. Compare native group identity first.
    if (a.hexRank && b.hexRank && a.hexRank !== b.hexRank) return a.hexRank > b.hexRank ? 1 : -1;
    if (a.currentScore !== b.currentScore) return a.currentScore - b.currentScore;
    if (a.bottom !== b.bottom) return a.bottom - b.bottom;
    if (a.top !== b.top) return a.top - b.top;
    return a.domIndex - b.domIndex;
  }
  function cawfHasRenderedBox(el) {
    if (!(el instanceof HTMLElement)) return false;
    const rect = el.getBoundingClientRect();
    return !!(rect && rect.width > 0 && rect.height > 0);
  }

  function findUserPadAbsContainerForScan(group) {
    if (!(group instanceof HTMLElement)) return null;

    // 다른 확프의 DOM 판정과 같은 계열이지만, 읽기 전용 querySelector만 수행한다.
    // API 호출/속성 변경/DOM 삽입 없음 → 배지·리롤·로어 확프와 충돌하지 않는다.
    const selectors = [
      ':scope > div.relative.mb-5.w-full.items-end',
      ':scope > div.relative.mb-5.items-end',
      'div.relative.mb-5.w-full.items-end',
      'div.relative.mb-5.items-end'
    ];

    for (const selector of selectors) {
      try {
        const found = group.querySelector(selector);
        if (found && cawfHasRenderedBox(found)) return found;
      } catch (_) {}
    }

    return null;
  }

  function findUserNovelPadAbsContainerForScan(group) {
    if (!(group instanceof HTMLElement)) return null;

    const selectors = [
      ':scope div.flex.flex-row.gap-4.w-full.items-end.justify-between.border-y.border-outline_tertiary.py-5',
      ':scope div.border-y.border-outline_tertiary.py-5',
      ':scope div[class*="border-y"][class*="border-outline_tertiary"][class*="py-5"]',
      ':scope div[class*="border-y"][class*="py-5"]'
    ];

    for (const selector of selectors) {
      try {
        const found = group.querySelector(selector);
        if (found && cawfHasRenderedBox(found)) return found;
      } catch (_) {}
    }

    return null;
  }

  function isUserMessageGroupByDomForScan(group) {
    // messages API role을 보지 않고, 유저 말풍선/소설형 박스 구조만 읽어서 제외한다.
    // 최신 로그 감지 후보에서만 쓰므로 다른 확프의 배치/캐시/버튼에는 영향을 주지 않는다.
    if (!(group instanceof HTMLElement)) return false;
    return !!(findUserNovelPadAbsContainerForScan(group) || findUserPadAbsContainerForScan(group));
  }

  function getVisibleMessageEntries() {
    const scope = findEffectViewport() || document.querySelector('main');
    if (!(scope instanceof HTMLElement)) return [];

    const groups = scope.matches?.('[data-message-group-id]')
      ? [scope]
      : Array.from(scope.querySelectorAll('[data-message-group-id]'));

    const entries = groups.map((group, domIndex) => {
      if (!(group instanceof HTMLElement)) return null;
      if (group.closest('[role="dialog"], #igx-live-popup, #cawf-panel')) return null;
      const rect = group.getBoundingClientRect();
      if (!isVisibleRect(rect)) return null;
      if (isUserMessageGroupByDomForScan(group)) return null;

      const chatBubble = group.querySelector('[data-sgb-bubble="chat"]');
      const textScope = chatBubble instanceof HTMLElement ? chatBubble : group;
      const markdown = textScope.querySelector('.wrtn-markdown:not(.not-wrtn-markdown)');
      if (!(markdown instanceof HTMLElement)) return null;
      if (markdown.closest('.not-wrtn-markdown, [role="dialog"], #igx-live-popup, #cawf-panel')) return null;

      // 최신 메시지 판별엔 정렬키만 필요하다. 클린 텍스트 추출(cloneNode 등)은
      // 최종 승자 1개에 대해서만 getRecentLogText에서 수행한다.
      // 여기서는 빈 메시지 제거용으로 원본 textContent 길이만 가볍게 확인한다.
      const rawLen = String(markdown.textContent || '').trim().length;
      if (rawLen < 2) return null;

      return {
        group,
        markdown,
        isAssistant: chatBubble instanceof HTMLElement,
        key: getMessageSortKey(group, markdown, domIndex, rect)
      };
    }).filter(Boolean);

    // 유저 메시지는 위에서 제외한다. assistant/chat bubble 후보가 있으면 기존처럼 우선하되,
    // 후보가 없어도 남은 항목은 유저 DOM이 아닌 메시지뿐이라 기존 호환성을 유지한다.
    const assistantEntries = entries.filter(entry => entry.isAssistant);
    return assistantEntries.length ? assistantEntries : entries;
  }

  function getLatestMessageEntry() {
    const entries = getVisibleMessageEntries();
    if (!entries.length) return null;

    return entries.reduce((best, entry) => {
      return compareMessageSortKey(entry.key, best.key) > 0 ? entry : best;
    }, entries[0]);
  }

  function getCleanMarkdownText(markdown, options = {}) {
    if (!(markdown instanceof HTMLElement)) return '';

    const includeCodeBlocks = options.includeCodeBlocks === undefined
      ? !!state.settings.includeCodeBlocksInDetection
      : !!options.includeCodeBlocks;

    // 이미지 생성 디버그/확프 UI 텍스트가 키워드 감지를 오염시키지 않게 제거한다.
    // 코드블록은 기본 OFF지만, 설정에서 켜면 키워드 감지 대상으로 포함할 수 있다.
    // 시간대 배경 감지는 별도 호출에서 includeCodeBlocks:true로 항상 코드블록을 읽는다.
    const clone = markdown.cloneNode(true);
    if (clone instanceof HTMLElement) {
      const removeSelectors = [
        '.csp-generated-scene-image',
        'script',
        'style',
        'button',
        'svg'
      ];

      if (includeCodeBlocks) {
        // 중요: Crack 코드블록은 보통 .not-wrtn-markdown 과 .wrtn-codeblock을 동시에 가진다.
        // 그래서 .not-wrtn-markdown을 무조건 제거하면 '코드블록도 읽기'를 켜도 코드블록이 사라진다.
        // 코드블록 wrapper는 보존하고, 기타 not-wrtn-markdown UI만 제거한다.
        removeSelectors.push('.not-wrtn-markdown:not(.wrtn-codeblock):not([data-sgb-codeblock])');
      } else {
        removeSelectors.push('.not-wrtn-markdown', '.wrtn-codeblock', '[data-sgb-codeblock]', 'pre', 'code');
      }

      clone.querySelectorAll(removeSelectors.join(',')).forEach(el => el.remove());
    }

    return String(clone.textContent || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function normalizeExtractedLogText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function getCodeBlockText(markdown) {
    if (!(markdown instanceof HTMLElement)) return '';

    const clone = markdown.cloneNode(true);
    if (!(clone instanceof HTMLElement)) return '';

    clone.querySelectorAll('.csp-generated-scene-image, script, style, button, svg').forEach(el => el.remove());

    const codeBlockSelector = '[data-sgb-codeblock], .wrtn-codeblock, pre, code';
    const blocks = Array.from(clone.querySelectorAll(codeBlockSelector)).filter(el => {
      // wrapper 안의 pre/code를 중복으로 읽지 않기 위해 가장 바깥 코드블록만 사용한다.
      return !el.parentElement?.closest?.(codeBlockSelector);
    });

    return normalizeExtractedLogText(blocks.map(el => el.textContent || '').join('\n\n'));
  }

  function getRecentLogText(options = {}) {
    const latest = getLatestMessageEntry();
    if (!latest) return '';

    // v0.3.3:
    // Read the FULL latest log text for keyword detection.
    // This is intentional: weather/status blocks may be placed anywhere inside the latest reply,
    // including the very top, middle, or bottom of a long response.
    if (latest.markdown instanceof HTMLElement) {
      return getCleanMarkdownText(latest.markdown, options);
    }
    return String(latest.text || '');
  }

  function getCleanTextForEntry(entry, options = {}) {
    if (entry && entry.markdown instanceof HTMLElement) {
      return getCleanMarkdownText(entry.markdown, options);
    }
    return '';
  }

  function getCodeBlockTextForEntry(entry) {
    if (entry && entry.markdown instanceof HTMLElement) {
      return getCodeBlockText(entry.markdown);
    }
    return '';
  }

  function getPrioritizedTimeTextForEntry(entry) {
    const codeBlockText = getCodeBlockTextForEntry(entry);
    if (extractTimeMinutesFromText(codeBlockText) !== null) return codeBlockText;
    return getCleanTextForEntry(entry, { includeCodeBlocks: true });
  }

  function normalizeForKeywordSearch(value) {
    return String(value || '')
      .normalize('NFKC')
      .replace(/[\uFE0E\uFE0F]/g, '')
      .toLowerCase()
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function detectEffectFromText(text) {
    const source = normalizeForKeywordSearch(text);
    state.lastDetectedKeyword = '';
    if (!source) return state.settings.keywordFallback === 'keep' ? state.activeEffect || 'none' : 'none';

    for (const effect of SCREEN_EFFECT_PRIORITY) {
      const originals = getKeywordsForEffect(effect);
      for (const original of originals) {
        const norm = normalizeForKeywordSearch(original);
        if (norm && source.includes(norm)) {
          state.lastDetectedKeyword = original;
          return effect;
        }
      }
    }

    return state.settings.keywordFallback === 'keep' ? state.activeEffect || 'none' : 'none';
  }

  function classifyMinutesToTimeEffect(totalMinutes) {
    const minutes = Number(totalMinutes);
    if (!Number.isFinite(minutes)) return 'none';
    const m = ((minutes % 1440) + 1440) % 1440;

    // 고정 시간대 규칙:
    // 05:00~06:59 새벽 / 07:00~11:59 오전 / 12:00~16:59 오후
    // 17:00~19:30 노을 / 19:31~20:59 초저녁 / 21:00~04:59 밤
    if (m >= 5 * 60 && m <= 6 * 60 + 59) return 'dawn';
    if (m >= 7 * 60 && m <= 11 * 60 + 59) return 'morning';
    if (m >= 12 * 60 && m <= 16 * 60 + 59) return 'afternoon';
    if (m >= 17 * 60 && m <= 19 * 60 + 30) return 'sunset';
    if (m >= 19 * 60 + 31 && m <= 20 * 60 + 59) return 'twilight';
    return 'night';
  }

  function extractTimeMinutesFromText(text) {
    const source = String(text || '')
      // AI status lines sometimes use full-width punctuation/letters:
      // PM．10:23, AM．7:05, ＰＭ．１０：２３ → PM.10:23 / AM.7:05 / PM.10:23
      .normalize('NFKC')
      .replace(/[|｜]/g, '｜');
    const candidates = [];

    function normalizeMeridiem(value) {
      const raw = String(value || '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/\./g, '');
      if (raw === '오전' || raw === 'am') return 'am';
      if (raw === '오후' || raw === 'pm') return 'pm';
      return '';
    }

    function addCandidate(index, hour, minute = 0, meridiem = '') {
      let h = Number(hour);
      let m = Number(minute || 0);
      if (!Number.isFinite(h) || !Number.isFinite(m)) return;
      if (m < 0 || m > 59) return;

      const meridiemKey = normalizeMeridiem(meridiem);
      if (meridiemKey) {
        // AM00:00 / 00:00AM 계열도 허용한다.
        // AM 00:xx = 00:xx, PM 00:xx = 12:xx, AM 12:xx = 00:xx, PM 12:xx = 12:xx.
        if (h < 0 || h > 12) return;
        if (meridiemKey === 'am') {
          if (h === 12) h = 0;
        } else if (meridiemKey === 'pm') {
          if (h < 12) h += 12;
        }
      }

      if (h < 0 || h > 23) return;
      candidates.push({ index, minutes: h * 60 + m });
    }

    function scanWithPattern(re, handler) {
      re.lastIndex = 0;
      let match;
      while ((match = re.exec(source))) handler(match);
    }

    // AM/PM 표기 지원: AM00:00, PM00:00, 00:00AM, 00:00PM, a.m. 7:30, 7:30 p.m. 등.
    // 24시간제 패턴과 같은 위치에서 겹칠 수 있으므로 index를 살짝 앞당겨 AM/PM 후보가 우선되게 한다.
    scanWithPattern(/\b([ap]\.?\s*m\.?)\s*([0-9]{1,2})\s*[:：]\s*([0-5]\d)(?=$|[^0-9a-zA-Z])/gi, match => {
      addCandidate(match.index - 0.25, match[2], match[3], match[1]);
    });

    scanWithPattern(/(^|[^0-9a-zA-Z])([0-9]{1,2})\s*[:：]\s*([0-5]\d)\s*([ap]\.?\s*m\.?)(?=$|[^0-9a-zA-Z])/gi, match => {
      addCandidate(match.index + match[1].length - 0.25, match[2], match[3], match[4]);
    });

    // 기존 v0.4.5의 /\b/ 경계가 실제 파일에서 백스페이스 문자로 깨져 19:07을 못 잡던 문제를 제거.
    // 숫자 앞뒤가 다른 숫자가 아닌지만 확인해서 19:07, 19：07, 오후 7:07, 19시 7분을 모두 허용한다.
    scanWithPattern(/(^|[^0-9])([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)(?=$|[^0-9])/g, match => {
      addCandidate(match.index + match[1].length, match[2], match[3], '');
    });

    scanWithPattern(/(오전|오후)\s*([0-9]{1,2})(?:\s*[:：시]\s*([0-5]?\d))?/g, match => {
      addCandidate(match.index, match[2], match[3] || 0, match[1]);
    });

    scanWithPattern(/(^|[^0-9])([01]?\d|2[0-3])\s*시\s*([0-5]?\d)?\s*분?(?=$|[^0-9])/g, match => {
      addCandidate(match.index + match[1].length, match[2], match[3] || 0, '');
    });

    if (!candidates.length) return null;
    candidates.sort((a, b) => a.index - b.index);
    return candidates[0].minutes;
  }

  function formatMinutesHHMM(totalMinutes) {
    const minutes = Number(totalMinutes);
    if (!Number.isFinite(minutes)) return '';
    const normalized = ((minutes % 1440) + 1440) % 1440;
    const h = Math.floor(normalized / 60);
    const m = normalized % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function detectTimeEffectFromText(text) {
    const minutes = extractTimeMinutesFromText(text);
    if (minutes === null) return 'none';
    return classifyMinutesToTimeEffect(minutes);
  }

  // 초기 진입/SPA 방 이동처럼 DOM 정착 시간이 필요한 경우에만 쓰는 1회성 스캔 예약.
  // 생성 중 로그 변화에는 절대 사용하지 않는다.
  function scheduleScan(reason = 'scheduled', delay = 900) {
    clearTimeout(state.scanTimer);
    state.scanTimer = setTimeout(() => {
      state.scanTimer = 0;
      scanLatestLog(reason);
    }, Math.max(0, Number(delay) || 0));
  }

  function getGenerateDoneWindow() {
    try {
      const pageWindow = getPageWindow();
      if (pageWindow?.document === document) return pageWindow;
    } catch (_) {}
    return window;
  }

  function getGenerateDoneEventName(entry) {
    if (!entry) return '';

    // Crack/GTM 형태:
    // 1) ['event', 'generate_done', meta]
    // 2) Arguments(3) {0:'event', 1:'generate_done', 2:{...}}
    // 3) { event: 'generate_done', ... }
    if ((Array.isArray(entry) || typeof entry.length === 'number') && entry[0] === 'event') {
      return String(entry[1] || '');
    }
    return String(entry?.event || '');
  }

  function isGenerateDoneEntry(entry) {
    return /^generate_done$/i.test(getGenerateDoneEventName(entry));
  }

  function getGenerateDoneEntryKey(entry) {
    try {
      const meta = ((Array.isArray(entry) || typeof entry.length === 'number') && entry[0] === 'event')
        ? entry[2]
        : entry;
      const msgId = meta?.msg_id || meta?.fe_msg_id || meta?.message_id || meta?.id || '';
      const chatId = meta?.chat_id || meta?.episode_id || '';
      if (msgId) return `${chatId}::${msgId}`;
    } catch (_) {}
    return `time::${Math.floor(Date.now() / 1500)}`;
  }

  function getGenerateDoneMessageId(entry) {
    try {
      const meta = ((Array.isArray(entry) || typeof entry.length === 'number') && entry[0] === 'event')
        ? entry[2]
        : entry;
      return String(meta?.msg_id || meta?.fe_msg_id || meta?.message_id || meta?.id || '').trim();
    } catch (_) {}
    return '';
  }

  function getEntryDomSignature(entry) {
    if (!entry?.group || !entry?.markdown) return '';
    const groupId = String(entry.group.getAttribute?.('data-message-group-id') || '').trim();
    const raw = String(entry.markdown.textContent || '');
    return `${groupId}::${raw.length}::${hashText(raw)}`;
  }

  function clearGenerateDoneReadyWatch() {
    if (state.generateReadyRaf1) {
      window.cancelAnimationFrame(state.generateReadyRaf1);
      state.generateReadyRaf1 = 0;
    }
    if (state.generateReadyRaf2) {
      window.cancelAnimationFrame(state.generateReadyRaf2);
      state.generateReadyRaf2 = 0;
    }
    if (state.generateReadyFallbackTimer) {
      clearTimeout(state.generateReadyFallbackTimer);
      state.generateReadyFallbackTimer = 0;
    }
    state.generateReadyObserver?.disconnect?.();
    state.generateReadyObserver = null;
  }

  function mutationTouchesChatMessage(record) {
    const target = record?.target instanceof Element
      ? record.target
      : record?.target?.parentElement;
    if (target?.closest?.('[data-message-group-id], .wrtn-markdown')) return true;

    if (record?.type === 'childList') {
      for (const node of record.addedNodes || []) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('[data-message-group-id], .wrtn-markdown')) return true;
        if (node.querySelector?.('[data-message-group-id], .wrtn-markdown')) return true;
      }
    }
    return false;
  }

  function startGenerateDoneReadyWatch(expectedMessageId = '') {
    clearGenerateDoneReadyWatch();

    if (!isEpisodePath() || !selectionsNeedLogScan()) return;
    if (document.hidden) {
      state.pendingGenerateDoneScan = true;
      state.pendingGenerateDoneMessageId = expectedMessageId;
      log('generate_done DOM-ready watch pending until visible');
      return;
    }

    const target = findEffectViewport() || document.querySelector('main');
    if (!(target instanceof HTMLElement)) {
      // main이 아직 교체 중이면 짧은 안전망에서 최종 1회만 시도한다.
      state.generateReadyFallbackTimer = window.setTimeout(() => {
        state.generateReadyFallbackTimer = 0;
        if (document.hidden || !isEpisodePath()) return;
        state.lastTextHash = '';
        scanLatestLog('generate-done-fallback');
      }, 1200);
      return;
    }

    const previousSignature = state.lastScannedDomSignature || '';
    let sawRelevantMutation = false;

    const finishScan = (reason, candidate = null) => {
      clearGenerateDoneReadyWatch();
      state.pendingGenerateDoneScan = false;
      state.pendingGenerateDoneMessageId = '';
      state.lastTextHash = '';
      scanLatestLog(reason, candidate);
      log('generate_done DOM-ready scan completed', reason);
    };

    const getCandidateState = () => {
      const latest = getExpectedWeatherEntry(expectedMessageId) || getLatestMessageEntry();
      if (!latest) return null;
      const signature = getEntryDomSignature(latest);
      if (!signature) return null;
      const groupId = String(latest.group?.getAttribute?.('data-message-group-id') || '').trim();
      const expectedMatched = !!expectedMessageId && groupId === expectedMessageId;
      const changedFromLastScan = !!previousSignature && signature !== previousSignature;
      const firstKnownScan = !previousSignature;
      return { latest, signature, expectedMatched, changedFromLastScan, firstKnownScan };
    };

    const scheduleQuietCheck = () => {
      if (state.generateReadyRaf1) window.cancelAnimationFrame(state.generateReadyRaf1);
      if (state.generateReadyRaf2) window.cancelAnimationFrame(state.generateReadyRaf2);
      state.generateReadyRaf1 = 0;
      state.generateReadyRaf2 = 0;

      state.generateReadyRaf1 = window.requestAnimationFrame(() => {
        state.generateReadyRaf1 = 0;
        const first = getCandidateState();
        state.generateReadyRaf2 = window.requestAnimationFrame(() => {
          state.generateReadyRaf2 = 0;
          if (document.hidden) {
            state.pendingGenerateDoneScan = true;
            state.pendingGenerateDoneMessageId = expectedMessageId;
            clearGenerateDoneReadyWatch();
            return;
          }

          const second = getCandidateState();
          if (!first || !second || first.signature !== second.signature) {
            // 렌더가 아직 움직이는 중이면 observer가 다음 관련 mutation에서 다시 잡는다.
            return;
          }

          // 새 메시지 ID가 DOM에 확인됐거나, 마지막 정상 스캔 이후 DOM 내용이 바뀌었거나,
          // generate_done 이후 실제 메시지 mutation을 본 경우에만 준비 완료로 인정한다.
          if (second.expectedMatched || second.changedFromLastScan || second.firstKnownScan || sawRelevantMutation) {
            finishScan('generate-done-ready', second.latest);
          }
        });
      });
    };

    state.generateReadyObserver = new MutationObserver(records => {
      if (!records.some(mutationTouchesChatMessage)) return;
      sawRelevantMutation = true;
      scheduleQuietCheck();
    });
    state.generateReadyObserver.observe(target, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // 이미 최종 DOM이 들어온 뒤 generate_done이 온 경우도 즉시 처리할 수 있게 2프레임 안정성부터 확인한다.
    scheduleQuietCheck();

    // 극히 드물게 Crack/다른 확프가 DOM을 계속 건드려 quiet check가 끝나지 않는 경우의 1회성 안전망.
    // 상시 폴링이 아니며 generate_done 한 번당 최대 한 번만 실행된다.
    state.generateReadyFallbackTimer = window.setTimeout(() => {
      state.generateReadyFallbackTimer = 0;
      clearGenerateDoneReadyWatch();
      if (document.hidden || !isEpisodePath()) return;
      const latest = getExpectedWeatherEntry(expectedMessageId) || getLatestMessageEntry();
      if (!latest) return;
      finishScan('generate-done-fallback', latest);
    }, 5000);
  }
  function onGenerateDoneSignal(entry) {
    if (!isEpisodePath()) return;
    if (!selectionsNeedLogScan()) return;

    // 생성 중에는 아무것도 읽지 않는다. generate_done 뒤 최종 메시지 DOM이 안정된 순간에만 1회 판정한다.
    clearPendingScan();
    const expectedMessageId = getGenerateDoneMessageId(entry);

    if (document.hidden) {
      state.pendingGenerateDoneScan = true;
      state.pendingGenerateDoneMessageId = expectedMessageId;
      clearGenerateDoneReadyWatch();
      log('generate_done signal pending until visible');
      return;
    }

    state.pendingGenerateDoneScan = false;
    state.pendingGenerateDoneMessageId = '';
    startGenerateDoneReadyWatch(expectedMessageId);
    log('generate_done DOM-ready watch started');
  }

  function handleGenerateDoneEntry(entry) {
    if (!isGenerateDoneEntry(entry)) return false;

    const eventWindow = getGenerateDoneWindow();
    const key = getGenerateDoneEntryKey(entry);
    if (eventWindow.__cawfLastGenerateDoneKey === key) return true;
    eventWindow.__cawfLastGenerateDoneKey = key;

    onGenerateDoneSignal(entry);
    return true;
  }

  function startGenerateDonePushHook() {
    const eventWindow = getGenerateDoneWindow();
    const dl = eventWindow.dataLayer = eventWindow.dataLayer || [];

    // v1.0.8: 400ms 상시 폴링 대신 dataLayer.push가 들어오는 순간만 확인한다.
    // 이전 버전 타이머가 남아 있을 수 있으므로 먼저 정리한다.
    try {
      clearInterval(eventWindow.__cawfGenerateDonePollTimer);
      eventWindow.__cawfGenerateDonePollTimer = 0;
    } catch (_) {}

    if (!Array.isArray(dl)) return;
    if (dl.__cawfGenerateDonePushHooked) return;

    const originalPush = dl.push;
    if (typeof originalPush !== 'function') return;

    dl.push = function cawfDataLayerPushHook(...items) {
      const result = originalPush.apply(this, items);
      try {
        for (const item of items) handleGenerateDoneEntry(item);
      } catch (_) {}
      return result;
    };

    try {
      Object.defineProperty(dl.push, '__cawfWrapped', { value: true, configurable: true });
      Object.defineProperty(dl, '__cawfGenerateDonePushHooked', { value: true, configurable: true });
    } catch (_) {
      dl.__cawfGenerateDonePushHooked = true;
    }
  }

  function watchGenerateDoneScan() {
    const eventWindow = getGenerateDoneWindow();
    if (eventWindow.__cawfGenerateDonePushHookStarted) return;
    eventWindow.__cawfGenerateDonePushHookStarted = true;
    startGenerateDonePushHook();
  }

  function scanLatestLog(reason = 'manual', readyEntry = null) {
    state.scanCount = (Number(state.scanCount) || 0) + 1;
    state.lastScanReason = String(reason || 'manual');
    state.lastScanAt = Date.now();

    if (!isEpisodePath()) {
      state.lastDetectedEffect = 'none';
      state.lastDetectedTimeEffect = 'none';
      setActiveEffect('none', 'leave-room');
      setActiveTimeEffect('none', 'leave-room');
      return;
    }

    const s = state.settings;
    if (!s.enabled) {
      state.lastDetectedEffect = 'none';
      state.lastDetectedTimeEffect = 'none';
      setActiveEffect('none', 'disabled');
      setActiveTimeEffect('none', 'disabled');
      return;
    }

    if (!selectionsNeedLogScan()) { applyCurrentSelectionsNow(reason); return; }
    const latestEntry = readyEntry?.group?.isConnected ? readyEntry : getLatestMessageEntry();
    state.lastScannedDomSignature = getEntryDomSignature(latestEntry);
    state.lastScannedGroupNode = latestEntry?.group instanceof HTMLElement ? latestEntry.group : null;
    const snapshot = extractWeatherSnapshot(latestEntry?.markdown);
    const text = s.includeCodeBlocksInDetection ? snapshot.full : snapshot.plain;
    // 시간대 배경은 INFO/status 코드블록에 들어가는 경우가 많으므로, 코드블록 안 시간 표기를 최우선으로 읽고 없을 때만 전체 최신 로그로 fallback한다.
    const timeText = extractTimeMinutesFromText(snapshot.code) !== null ? snapshot.code : snapshot.full;
    const nextHash = hashText(`${text}
---TIME---
${timeText}`);

    if (nextHash === state.lastTextHash && reason !== 'settings' && reason !== 'manual-rescan' && reason !== 'keywords-save') {
      // 해시가 같아도, 첫 스캔 시 로그가 덜 렌더돼서 시간대가 none으로 굳는 문제 방지:
      // 마지막으로 감지한 값으로 효과/시간대를 다시 적용한 뒤 나간다.
      setActiveEffect(state.lastDetectedEffect || 'none', reason);
      setActiveTimeEffect(state.lastDetectedTimeEffect || 'none', reason);
      syncAudioWithEffect();
      syncFloatingButton();
      syncPanel();
      return;
    }

    state.lastTextHash = nextHash;

    let nextEffect = 'none';
    if (s.effect !== 'auto') {
      nextEffect = s.effect;
      state.lastDetectedEffect = nextEffect;
      state.lastDetectedKeyword = '';
    } else if (s.autoDetect) {
      nextEffect = detectEffectFromText(text);
      state.lastDetectedEffect = nextEffect;
    } else {
      state.lastDetectedKeyword = '';
    }

    let nextTimeEffect = 'none';
    if (s.timeBackground !== 'auto') {
      nextTimeEffect = s.timeBackground;
      state.lastDetectedTimeEffect = nextTimeEffect;
    } else {
      nextTimeEffect = detectTimeEffectFromText(timeText);
      state.lastDetectedTimeEffect = nextTimeEffect;
    }

    setActiveEffect(nextEffect, reason);
    setActiveTimeEffect(nextTimeEffect, reason);
  }

  function clearRouteBurstTimers() {
    if (Array.isArray(state.routeBurstTimers)) {
      state.routeBurstTimers.forEach(id => clearTimeout(id));
    }
    state.routeBurstTimers = [];
    if (state.routeRaf) {
      window.cancelAnimationFrame(state.routeRaf);
      state.routeRaf = 0;
    }
  }

  function clearRouteEntryReadyWatch() {
    if (state.routeEntryRaf1) {
      window.cancelAnimationFrame(state.routeEntryRaf1);
      state.routeEntryRaf1 = 0;
    }
    if (state.routeEntryRaf2) {
      window.cancelAnimationFrame(state.routeEntryRaf2);
      state.routeEntryRaf2 = 0;
    }
    if (state.routeEntryFallbackTimer) {
      clearTimeout(state.routeEntryFallbackTimer);
      state.routeEntryFallbackTimer = 0;
    }
    state.routeEntryObserver?.disconnect?.();
    state.routeEntryObserver = null;
  }

  function startRouteEntryReadyWatch(reason = 'route', previousGroupNode = null, previousSignature = '') {
    clearRouteEntryReadyWatch();

    const targetEpisodeId = getEpisodeId();
    if (!targetEpisodeId || !isEpisodePath()) return;
    if (!selectionsNeedLogScan()) { applyCurrentSelectionsNow('route:' + reason); return; }

    if (document.hidden) {
      state.pendingRouteEntryScan = true;
      state.pendingRouteEntryReason = String(reason || 'route');
      return;
    }

    state.pendingRouteEntryScan = false;
    state.pendingRouteEntryReason = '';

    let finished = false;

    const finishScan = suffix => {
      if (finished) return;
      finished = true;
      clearRouteEntryReadyWatch();
      if (document.hidden || getEpisodeId() !== targetEpisodeId || !isEpisodePath()) return;
      state.lastTextHash = '';
      scanLatestLog(`route:${reason}:${suffix}`);
      log('route entry DOM-ready scan completed', reason, suffix);
    };

    const getCandidateState = () => {
      if (getEpisodeId() !== targetEpisodeId || !isEpisodePath()) return null;
      const latest = getLatestMessageEntry();
      if (!latest?.group || !latest?.markdown) return null;

      const signature = getEntryDomSignature(latest);
      if (!signature) return null;

      const groupChanged = !previousGroupNode || latest.group !== previousGroupNode || !previousGroupNode.isConnected;
      const contentChanged = !!previousSignature && signature !== previousSignature;

      return { latest, signature, groupChanged, contentChanged };
    };

    const scheduleQuietCheck = () => {
      if (state.routeEntryRaf1) window.cancelAnimationFrame(state.routeEntryRaf1);
      if (state.routeEntryRaf2) window.cancelAnimationFrame(state.routeEntryRaf2);
      state.routeEntryRaf1 = 0;
      state.routeEntryRaf2 = 0;

      state.routeEntryRaf1 = window.requestAnimationFrame(() => {
        state.routeEntryRaf1 = 0;
        const first = getCandidateState();

        state.routeEntryRaf2 = window.requestAnimationFrame(() => {
          state.routeEntryRaf2 = 0;

          if (document.hidden) {
            state.pendingRouteEntryScan = true;
            state.pendingRouteEntryReason = String(reason || 'route');
            clearRouteEntryReadyWatch();
            return;
          }

          const second = getCandidateState();
          if (!first || !second || first.signature !== second.signature) return;

          // URL만 먼저 바뀌고 이전 방 DOM이 잠깐 남아 있는 경우는 기다린다.
          // 실제 메시지 group이 교체됐거나 내용이 새 방 기준으로 바뀐 뒤에만 1회 판정한다.
          if (second.groupChanged || second.contentChanged) {
            finishScan('ready');
          }
        });
      });
    };

    // route 시에는 <main> 자체가 교체될 수 있으므로 body를 잠깐 본다.
    // 메시지 관련 mutation만 반응하고, 1회 스캔 후 즉시 해제된다.
    if (document.body instanceof HTMLElement) {
      state.routeEntryObserver = new MutationObserver(records => {
        if (!records.some(mutationTouchesChatMessage)) return;
        scheduleQuietCheck();
      });
      state.routeEntryObserver.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    // 새 방 DOM이 이미 붙은 뒤 URL 훅이 호출된 경우 즉시 처리.
    scheduleQuietCheck();

    // React가 같은 노드를 재사용하거나 관련 mutation을 놓친 특이 케이스의 1회성 보험.
    // 상시 폴링이 아니며 episodeId 변경 1건당 최대 한 번만 실행된다.
    state.routeEntryFallbackTimer = window.setTimeout(() => {
      state.routeEntryFallbackTimer = 0;
      clearRouteEntryReadyWatch();
      if (document.hidden || getEpisodeId() !== targetEpisodeId || !isEpisodePath()) return;
      const latest = getLatestMessageEntry();
      if (!latest) return;
      finishScan('fallback');
    }, 5000);
  }
  function handleRouteChange(reason = 'route') {
    const currentEpisodeId = getEpisodeId();
    const episodeChanged = currentEpisodeId !== state.lastEpisodeId;
    if (!episodeChanged && reason !== 'force') return;

    const previousGroupNode = state.lastScannedGroupNode || null;
    const previousSignature = state.lastScannedDomSignature || '';

    state.lastEpisodeId = currentEpisodeId;
    state.lastTextHash = '';
    clearGenerateDoneReadyWatch();
    clearRouteEntryReadyWatch();
    state.pendingGenerateDoneScan = false;
    state.pendingGenerateDoneMessageId = '';
    state.particleSignature = '';
    state.ambientSignature = '';
    state.lastBoundsAt = 0;
    state.lastAppliedGeom = null;
    state.mountHostCache = null;

    // v0.7.0: root는 항상 body 직속이므로 parent 이동 없이 host-found=false로 숨김 처리만 한다.
    const root = state.root || document.getElementById(IDS.root);
    if (root instanceof HTMLElement) parkRootInBodyHidden(root);
    clearUnderlayUnmask();
    state.effectHost = null;
    state.bounds = null;
    state.lastBoundsOk = false;
    clearPendingScan();
    if (currentEpisodeId) {
      startRouteEntryReadyWatch(reason, previousGroupNode, previousSignature);
    } else {
      state.pendingRouteEntryScan = false;
      state.pendingRouteEntryReason = '';
      scanLatestLog(`route:${reason}`);
    }
    syncFloatingButton();

    clearRouteBurstTimers();

    // main rect가 자리 잡을 때까지 rAF로 몇 프레임 즉시 따라붙고,
    // SPA 레이아웃이 늦게 안정되는 경우까지 짧은 burst timer로 커버한다.
    // 어느 경로에서도 <main>에 DOM을 삽입하지 않고 위치/크기만 갱신한다.
    let rafCount = 0;
    const rafStep = () => {
      state.lastBoundsAt = 0;
      applyRootBounds(true);
      if (++rafCount < 4) state.routeRaf = window.requestAnimationFrame(rafStep);
      else state.routeRaf = 0;
    };
    state.routeRaf = window.requestAnimationFrame(rafStep);

    [120, 300, 700, 1400, 2400].forEach(delay => {
      const id = window.setTimeout(() => {
        state.lastBoundsAt = 0;
        applyRootBounds(true);
        syncFloatingButton();
      }, delay);
      state.routeBurstTimers.push(id);
    });
  }

  function installHistoryRouteHook() {
    if (state.routeHookInstalled) return;
    state.routeHookInstalled = true;

    const w = getPageWindow();
    const key = '__CAWF_ROUTE_HOOK_V070__';
    if (!w[key]) {
      w[key] = true;
      const historyObject = w.history || window.history;
      const originalPushState = historyObject.pushState;
      const originalReplaceState = historyObject.replaceState;

      if (typeof originalPushState === 'function') {
        historyObject.pushState = function cawfPushState(...args) {
          const result = originalPushState.apply(this, args);
          window.setTimeout(() => handleRouteChange('pushState'), 0);
          return result;
        };
      }

      if (typeof originalReplaceState === 'function') {
        historyObject.replaceState = function cawfReplaceState(...args) {
          const result = originalReplaceState.apply(this, args);
          window.setTimeout(() => handleRouteChange('replaceState'), 0);
          return result;
        };
      }
    }

    window.addEventListener('popstate', () => handleRouteChange('popstate'));
    window.addEventListener('hashchange', () => handleRouteChange('hashchange'));
  }

  function installNavigationRouteHook() {
    if (state.navigationRouteHookInstalled) return;
    state.navigationRouteHookInstalled = true;

    try {
      const nav = window.navigation;
      if (!nav?.addEventListener) return;
      nav.addEventListener('navigatesuccess', () => handleRouteChange('navigation'));
      nav.addEventListener('currententrychange', () => handleRouteChange('navigation-entry'));
    } catch (_) {}
  }

  function startRouteWatcher() {
    installHistoryRouteHook();
    installNavigationRouteHook();

    clearInterval(state.routeTimer);
    state.routeTimer = window.setInterval(() => {
      if (getEpisodeId() !== state.lastEpisodeId) handleRouteChange('poll');
    }, 1500);

    clearInterval(state.uiTimer);
    state.uiTimer = window.setInterval(() => {
      if (document.hidden) {
        if (!state.settings.audioWhileHidden) syncAudioWithEffect();
        return; // 탭이 가려져 있으면 바운드 계산을 건너뛰어 발열을 줄인다.
      }
      // 로그 재스캔은 초기 진입 / episodeId 변경 / generate_done / 수동·설정 변경에만 맡기고,
      // 이 주기는 메뉴 접힘 같은 레이아웃 보정만 가볍게 유지한다.
      applyRootBounds(false);
    }, 7500);
  }

  // ── 오디오 URL 재생 엔진 ──────────────────────────────


  async function applyPendingAudioUrlsFromPanel() {
    const rainInput = state.panel?.querySelector('[data-cawf-audio-url]');
    const pendingRainUrl = rainInput instanceof HTMLInputElement ? rainInput.value : '';
    if (!state.settings.audioUrl && pendingRainUrl) await setRainAudioUrl(pendingRainUrl);

    const cricketInput = state.panel?.querySelector('[data-cawf-cricket-audio-url]');
    const pendingCricketUrl = cricketInput instanceof HTMLInputElement ? cricketInput.value : '';
    if (!state.settings.cricketAudioUrl && pendingCricketUrl) await setCricketAudioUrl(pendingCricketUrl);

    const waveInput = state.panel?.querySelector('[data-cawf-wave-audio-url]');
    const pendingWaveUrl = waveInput instanceof HTMLInputElement ? waveInput.value : '';
    if (!state.settings.waveAudioUrl && pendingWaveUrl) await setWaveAudioUrl(pendingWaveUrl);

    const fireworksInput = state.panel?.querySelector('[data-cawf-fireworks-audio-url]');
    const pendingFireworksUrl = fireworksInput instanceof HTMLInputElement ? fireworksInput.value : '';
    if (!state.settings.fireworksAudioUrl && pendingFireworksUrl) await setFireworksAudioUrl(pendingFireworksUrl);

    const underwaterInput = state.panel?.querySelector('[data-cawf-underwater-audio-url]');
    const pendingUnderwaterUrl = underwaterInput instanceof HTMLInputElement ? underwaterInput.value : '';
    if (!state.settings.underwaterAudioUrl && pendingUnderwaterUrl) await setUnderwaterAudioUrl(pendingUnderwaterUrl);

    try { if (state.settings.audioUrl) await loadRainAudioFromUrl(); } catch (err) { state.audioError = err?.message || String(err || '빗소리 URL 로드 실패'); }
    try { if (state.settings.cricketAudioUrl) await loadCricketAudioFromUrl(); } catch (err) { state.cricketAudioError = err?.message || String(err || '풀벌레 URL 로드 실패'); }
    try { if (state.settings.waveAudioUrl) await loadWaveAudioFromUrl(); } catch (err) { state.waveAudioError = err?.message || String(err || '파도소리 URL 로드 실패'); }
    try { if (state.settings.fireworksAudioUrl) await loadFireworksAudioFromUrl(); } catch (err) { state.fireworksAudioError = err?.message || String(err || '불꽃놀이 URL 로드 실패'); }
    try { if (state.settings.underwaterAudioUrl) await loadUnderwaterAudioFromUrl(); } catch (err) { state.underwaterAudioError = err?.message || String(err || '수중 URL 로드 실패'); }
  }

  function getSilentAudioDataUri() {
    if (state.silentAudioUri) return state.silentAudioUri;
    const sampleRate = 8000;
    const numSamples = 160; // ~0.02s 무음
    const dataSize = numSamples * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeStr = (off, str) => { for (let i = 0; i < str.length; i += 1) view.setUint8(off + i, str.charCodeAt(i)); };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    state.silentAudioUri = `data:audio/wav;base64,${btoa(binary)}`;
    return state.silentAudioUri;
  }

  // ── 자동 오디오 잠금 해제 (자동재생 정책 우회: 첫 제스처에 무음으로 unlock) ──
  async function primeAudioUnlock() {
    let unlockedAny = false;

    if (state.settings.audioEnabled && state.settings.audioUrl && !state.audioUnlocked) {
      const audio = ensureRainAudioElement();
      const hadRealSrc = !!audio.src && audio.src !== state.silentAudioUri;
      try {
        audio.muted = false;
        audio.volume = 0;
        if (!hadRealSrc) audio.src = getSilentAudioDataUri();
        await audio.play();
        state.audioUnlocked = true;
        state.audioError = '';
        unlockedAny = true;
      } catch (_) {}
    }

    if (state.settings.cricketAudioEnabled && state.settings.cricketAudioUrl && !state.cricketAudioUnlocked) {
      const audio = ensureCricketAudioElement();
      const hadRealSrc = !!audio.src && audio.src !== state.silentAudioUri;
      try {
        audio.muted = false;
        audio.volume = 0;
        if (!hadRealSrc) audio.src = getSilentAudioDataUri();
        await audio.play();
        state.cricketAudioUnlocked = true;
        state.cricketAudioError = '';
        unlockedAny = true;
      } catch (_) {}
    }

    if (state.settings.waveAudioEnabled && state.settings.waveAudioUrl && !state.waveAudioUnlocked) {
      const audio = ensureWaveAudioElement();
      const hadRealSrc = !!audio.src && audio.src !== state.silentAudioUri;
      try {
        audio.muted = false;
        audio.volume = 0;
        if (!hadRealSrc) audio.src = getSilentAudioDataUri();
        await audio.play();
        state.waveAudioUnlocked = true;
        state.waveAudioError = '';
        unlockedAny = true;
      } catch (_) {}
    }

    if (state.settings.fireworksAudioEnabled && state.settings.fireworksAudioUrl && !state.fireworksAudioUnlocked) {
      const audio = ensureFireworksAudioElement();
      const hadRealSrc = hasPlayableAudioSource(audio);
      try {
        audio.muted = false;
        audio.volume = 0;
        if (!hadRealSrc) audio.src = getSilentAudioDataUri();
        await audio.play();
        state.fireworksAudioUnlocked = hadRealSrc;
        if (hadRealSrc) {
          state.fireworksAudioError = '';
          unlockedAny = true;
        } else {
          audio.pause();
        }
      } catch (_) {}
    }

    if (state.settings.underwaterAudioEnabled && state.settings.underwaterAudioUrl && !state.underwaterAudioUnlocked) {
      const audio = ensureUnderwaterAudioElement();
      const hadRealSrc = hasPlayableAudioSource(audio);
      try {
        audio.muted = false;
        audio.volume = 0;
        if (!hadRealSrc) audio.src = getSilentAudioDataUri();
        await audio.play();
        state.underwaterAudioUnlocked = hadRealSrc;
        if (hadRealSrc) {
          state.underwaterAudioError = '';
          unlockedAny = true;
        } else {
          audio.pause();
        }
      } catch (_) {}
    }

    if (state.settings.soundEnabled && !state.spellAudioUnlocked) {
      try {
        if (await unlockSpellAudio()) unlockedAny = true;
      } catch (_) {}
    }

    try { if (state.settings.audioEnabled) await loadRainAudioFromUrl(); } catch (_) {}
    try { if (state.settings.cricketAudioEnabled) await loadCricketAudioFromUrl(); } catch (_) {}
    try { if (state.settings.waveAudioEnabled) await loadWaveAudioFromUrl(); } catch (_) {}
    try { if (state.settings.fireworksAudioEnabled) await loadFireworksAudioFromUrl(); } catch (_) {}
    try { if (state.settings.underwaterAudioEnabled) await loadUnderwaterAudioFromUrl(); } catch (_) {}
    syncAudioWithEffect(true);
    syncPanel();
    syncFloatingButton();
    const stillLocked =
      (state.settings.audioEnabled && state.settings.audioUrl && !state.audioUnlocked) ||
      (state.settings.cricketAudioEnabled && state.settings.cricketAudioUrl && !state.cricketAudioUnlocked) ||
      (state.settings.waveAudioEnabled && state.settings.waveAudioUrl && !state.waveAudioUnlocked) ||
      (state.settings.fireworksAudioEnabled && state.settings.fireworksAudioUrl && !state.fireworksAudioUnlocked) ||
      (state.settings.underwaterAudioEnabled && state.settings.underwaterAudioUrl && !state.underwaterAudioUnlocked) ||
      (state.settings.soundEnabled && !state.spellAudioUnlocked);
    return !stillLocked;
  }

  function setupAutoUnlockOnGesture() {
    if (state.autoUnlockBound) return;
    state.autoUnlockBound = true;

    const listenerOptions = { capture: true, passive: true };
    const removeOptions = { capture: true };

    const handler = () => {
      const rainNeedsUnlock = state.settings.audioEnabled && state.settings.audioUrl && !state.audioUnlocked;
      const cricketNeedsUnlock = state.settings.cricketAudioEnabled && state.settings.cricketAudioUrl && !state.cricketAudioUnlocked;
      const waveNeedsUnlock = state.settings.waveAudioEnabled && state.settings.waveAudioUrl && !state.waveAudioUnlocked;
      const fireworksNeedsUnlock = state.settings.fireworksAudioEnabled && state.settings.fireworksAudioUrl && !state.fireworksAudioUnlocked;
      const underwaterNeedsUnlock = state.settings.underwaterAudioEnabled && state.settings.underwaterAudioUrl && !state.underwaterAudioUnlocked;
      const spellNeedsUnlock = state.settings.soundEnabled && !state.spellAudioUnlocked;
      if (!rainNeedsUnlock && !cricketNeedsUnlock && !waveNeedsUnlock && !fireworksNeedsUnlock && !underwaterNeedsUnlock && !spellNeedsUnlock) { teardown(); return; }
      primeAudioUnlock().then(ok => { if (ok) teardown(); }).catch(() => {});
    };

    function teardown() {
      document.removeEventListener('pointerdown', handler, removeOptions);
      document.removeEventListener('keydown', handler, removeOptions);
      document.removeEventListener('touchstart', handler, removeOptions);
      state.autoUnlockBound = false;
    }

    document.addEventListener('pointerdown', handler, listenerOptions);
    document.addEventListener('keydown', handler, listenerOptions);
    document.addEventListener('touchstart', handler, listenerOptions);
  }

  function ensureRainAudioElement() {
    if (!state.rainAudio) {
      const audio = new Audio();
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = 0;
      audio.setAttribute('playsinline', '');
      audio.addEventListener('ended', () => {
        if (state.rainNodes) syncAudioWithEffect();
      });
      audio.addEventListener('error', () => {
        state.audioError = '오디오 URL을 재생하지 못했어요. Pixabay 페이지 자동 추출이 실패하면 직접 열리는 mp3/ogg/wav 링크를 넣어 주세요.';
        state.rainNodes = null;
        syncPanel();
        syncFloatingButton();
      });
      state.rainAudio = audio;
    }
    return state.rainAudio;
  }

  async function loadRainAudioFromUrl() {
    const sourceUrl = normalizeAudioUrl(state.settings.audioUrl, '');
    if (!sourceUrl) {
      state.rainAudioMeta = null;
      state.rainAudioResolvedUrl = '';
      syncPanel();
      return false;
    }

    let playableUrl = '';
    try {
      playableUrl = await resolvePlayableAudioUrl(sourceUrl);
    } catch (err) {
      state.audioError = err?.message || String(err || '오디오 주소 변환 실패');
      state.rainAudioMeta = {
        name: getAudioNameFromUrl(sourceUrl),
        url: sourceUrl,
        resolvedUrl: '',
        updatedAt: Date.now()
      };
      syncPanel();
      return false;
    }

    if (!playableUrl) {
      state.audioError = '재생 가능한 오디오 주소가 비어 있어요.';
      syncPanel();
      return false;
    }

    const audio = ensureRainAudioElement();
    if (audio.src !== playableUrl) {
      audio.src = playableUrl;
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = 0;
      audio.load();
    }

    state.rainAudioUrl = sourceUrl;
    state.rainAudioResolvedUrl = playableUrl;
    state.rainAudioMeta = {
      name: getAudioNameFromUrl(sourceUrl),
      url: sourceUrl,
      resolvedUrl: playableUrl,
      updatedAt: Date.now()
    };
    state.audioError = '';
    syncPanel();
    return true;
  }

  async function setRainAudioUrl(url) {
    const normalized = normalizeAudioUrl(url, '');
    if (!normalized) throw new Error('http:// 또는 https:// 로 시작하는 Pixabay 페이지 링크 또는 직접 오디오 링크를 넣어 주세요.');

    stopRainSound(true);
    saveSettings({ audioUrl: normalized }, { skipScan: true });
    state.audioUnlocked = false;
    await loadRainAudioFromUrl();
    syncAudioWithEffect();
  }

  async function clearRainAudioUrl() {
    stopRainSound(true);
    saveSettings({ audioUrl: '' }, { skipScan: true });
    state.rainAudioUrl = '';
    state.rainAudioResolvedUrl = '';
    state.rainAudioMeta = null;
    state.audioUnlocked = false;
    state.audioError = '';
    if (state.rainAudio) {
      state.rainAudio.removeAttribute('src');
      try { state.rainAudio.load(); } catch (_) {}
    }
    syncPanel();
    syncFloatingButton();
  }

  function ensureCricketAudioElement() {
    if (!state.cricketAudio) {
      const audio = new Audio();
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = 0;
      audio.setAttribute('playsinline', '');
      audio.addEventListener('ended', () => {
        if (state.cricketNodes) syncAudioWithEffect();
      });
      audio.addEventListener('error', () => {
        state.cricketAudioError = '풀벌레 소리 URL을 재생하지 못했어요. Pixabay 페이지 자동 추출이 실패하면 직접 열리는 mp3/ogg/wav 링크를 넣어 주세요.';
        state.cricketNodes = null;
        syncPanel();
        syncFloatingButton();
      });
      state.cricketAudio = audio;
    }
    return state.cricketAudio;
  }

  async function loadCricketAudioFromUrl() {
    const sourceUrl = normalizeAudioUrl(state.settings.cricketAudioUrl, '');
    if (!sourceUrl) {
      state.cricketAudioMeta = null;
      state.cricketAudioResolvedUrl = '';
      syncPanel();
      return false;
    }

    let playableUrl = '';
    try {
      playableUrl = await resolvePlayableAudioUrl(sourceUrl);
    } catch (err) {
      state.cricketAudioError = err?.message || String(err || '풀벌레 오디오 주소 변환 실패');
      state.cricketAudioMeta = {
        name: getAudioNameFromUrl(sourceUrl),
        url: sourceUrl,
        resolvedUrl: '',
        updatedAt: Date.now()
      };
      syncPanel();
      return false;
    }

    if (!playableUrl) {
      state.cricketAudioError = '재생 가능한 풀벌레 오디오 주소가 비어 있어요.';
      syncPanel();
      return false;
    }

    const audio = ensureCricketAudioElement();
    if (audio.src !== playableUrl) {
      audio.src = playableUrl;
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = 0;
      audio.load();
    }

    state.cricketAudioUrl = sourceUrl;
    state.cricketAudioResolvedUrl = playableUrl;
    state.cricketAudioMeta = {
      name: getAudioNameFromUrl(sourceUrl),
      url: sourceUrl,
      resolvedUrl: playableUrl,
      updatedAt: Date.now()
    };
    state.cricketAudioError = '';
    syncPanel();
    return true;
  }

  async function setCricketAudioUrl(url) {
    const normalized = normalizeAudioUrl(url, '');
    if (!normalized) throw new Error('http:// 또는 https:// 로 시작하는 Pixabay 페이지 링크 또는 직접 오디오 링크를 넣어 주세요.');

    stopCricketSound(true);
    saveSettings({ cricketAudioUrl: normalized }, { skipScan: true });
    state.cricketAudioUnlocked = false;
    await loadCricketAudioFromUrl();
    syncAudioWithEffect();
  }

  async function clearCricketAudioUrl() {
    stopCricketSound(true);
    saveSettings({ cricketAudioUrl: '' }, { skipScan: true });
    state.cricketAudioUrl = '';
    state.cricketAudioResolvedUrl = '';
    state.cricketAudioMeta = null;
    state.cricketAudioUnlocked = false;
    state.cricketAudioError = '';
    if (state.cricketAudio) {
      state.cricketAudio.removeAttribute('src');
      try { state.cricketAudio.load(); } catch (_) {}
    }
    syncPanel();
    syncFloatingButton();
  }


  function ensureWaveAudioElement() {
    if (!state.waveAudio) {
      const audio = new Audio();
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = 0;
      audio.setAttribute('playsinline', '');
      audio.addEventListener('ended', () => {
        if (state.waveNodes) syncAudioWithEffect();
      });
      audio.addEventListener('error', () => {
        state.waveAudioError = '파도소리 URL을 재생하지 못했어요. Pixabay 페이지 자동 추출이 실패하면 직접 열리는 mp3/ogg/wav 링크를 넣어 주세요.';
        state.waveNodes = null;
        syncPanel();
        syncFloatingButton();
      });
      state.waveAudio = audio;
    }
    return state.waveAudio;
  }

  async function loadWaveAudioFromUrl() {
    const sourceUrl = normalizeAudioUrl(state.settings.waveAudioUrl, '');
    if (!sourceUrl) {
      state.waveAudioMeta = null;
      state.waveAudioResolvedUrl = '';
      syncPanel();
      return false;
    }

    let playableUrl = '';
    try {
      playableUrl = await resolvePlayableAudioUrl(sourceUrl);
    } catch (err) {
      state.waveAudioError = err?.message || String(err || '파도소리 오디오 주소 변환 실패');
      state.waveAudioMeta = {
        name: getAudioNameFromUrl(sourceUrl),
        url: sourceUrl,
        resolvedUrl: '',
        updatedAt: Date.now()
      };
      syncPanel();
      return false;
    }

    if (!playableUrl) {
      state.waveAudioError = '재생 가능한 파도소리 오디오 주소가 비어 있어요.';
      syncPanel();
      return false;
    }

    const audio = ensureWaveAudioElement();
    if (audio.src !== playableUrl) {
      audio.src = playableUrl;
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = 0;
      audio.load();
    }

    state.waveAudioUrl = sourceUrl;
    state.waveAudioResolvedUrl = playableUrl;
    state.waveAudioMeta = {
      name: getAudioNameFromUrl(sourceUrl),
      url: sourceUrl,
      resolvedUrl: playableUrl,
      updatedAt: Date.now()
    };
    state.waveAudioError = '';
    syncPanel();
    return true;
  }

  async function setWaveAudioUrl(url) {
    const normalized = normalizeAudioUrl(url, '');
    if (!normalized) throw new Error('http:// 또는 https:// 로 시작하는 Pixabay 페이지 링크 또는 직접 오디오 링크를 넣어 주세요.');

    stopWaveSound(true);
    saveSettings({ waveAudioUrl: normalized }, { skipScan: true });
    state.waveAudioUnlocked = false;
    await loadWaveAudioFromUrl();
    syncAudioWithEffect();
  }

  async function clearWaveAudioUrl() {
    stopWaveSound(true);
    saveSettings({ waveAudioUrl: '' }, { skipScan: true });
    state.waveAudioUrl = '';
    state.waveAudioResolvedUrl = '';
    state.waveAudioMeta = null;
    state.waveAudioUnlocked = false;
    state.waveAudioError = '';
    if (state.waveAudio) {
      state.waveAudio.removeAttribute('src');
      try { state.waveAudio.load(); } catch (_) {}
    }
    syncPanel();
    syncFloatingButton();
  }

  function ensureSpellAudioElement() {
    if (!state.spellAudio) {
      const audio = new Audio(SPELL_BURST_AUDIO_DATA_URL);
      audio.loop = false;
      audio.preload = 'auto';
      audio.volume = 0;
      audio.setAttribute('playsinline', '');
      audio.addEventListener('ended', () => {
        state.spellAudioPlaying = false;
        syncPanel();
        syncFloatingButton();
      });
      audio.addEventListener('error', () => {
        state.spellAudioPlaying = false;
        state.spellAudioUnlocked = false;
        state.spellAudioError = '내장된 마법 폭발 효과음을 재생하지 못했어요.';
        syncPanel();
        syncFloatingButton();
      });
      state.spellAudio = audio;
    }
    return state.spellAudio;
  }

  async function unlockSpellAudio() {
    const audio = ensureSpellAudioElement();
    audio.muted = false;
    audio.volume = 0;
    try {
      await audio.play();
      audio.pause();
      try { audio.currentTime = 0; } catch (_) {}
      state.spellAudioUnlocked = true;
      state.spellAudioPlaying = false;
      state.spellAudioError = '';
      return true;
    } catch (_) {
      state.spellAudioUnlocked = false;
      state.spellAudioError = '브라우저 소리 허용 버튼을 한 번 눌러야 자동 재생돼요.';
      return false;
    }
  }

  async function playSpellBurstSound() {
    if (!shouldPlaySpellForCurrentEffect()) return;
    if (!state.spellAudioUnlocked) {
      if (!state.spellAudioError) {
        state.spellAudioError = '브라우저 소리 허용 버튼을 한 번 눌러야 자동 재생돼요.';
        syncPanel();
      }
      return;
    }

    const audio = ensureSpellAudioElement();
    audio.muted = false;
    audio.volume = Math.max(0, Math.min(1, state.settings.spellAudioVolume));
    try {
      audio.pause();
      audio.currentTime = 0;
      await audio.play();
      state.spellAudioPlaying = true;
      state.spellAudioError = '';
    } catch (_) {
      state.spellAudioPlaying = false;
      state.spellAudioUnlocked = false;
      state.spellAudioError = '브라우저가 재생을 막았어요. 브라우저 소리 허용을 다시 눌러 주세요.';
    }
    syncPanel();
    syncFloatingButton();
  }

  function stopSpellSound() {
    const audio = state.spellAudio;
    if (audio) {
      try { audio.pause(); } catch (_) {}
      try { audio.currentTime = 0; } catch (_) {}
      audio.volume = 0;
    }
    state.spellAudioPlaying = false;
  }

  function handleSpellBurstCue(event) {
    if (event?.animationName !== 'cawf-spell-sound-clock') return;
    playSpellBurstSound().catch(err => {
      state.spellAudioPlaying = false;
      state.spellAudioError = err?.message || String(err || '마법 폭발 효과음 재생 실패');
      syncPanel();
    });
  }

  function ensureFireworksAudioElement() {
    if (!state.fireworksAudio) {
      const audio = new Audio();
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = 0;
      audio.setAttribute('playsinline', '');
      audio.addEventListener('ended', () => {
        if (state.fireworksNodes) syncAudioWithEffect();
      });
      audio.addEventListener('error', () => {
        state.fireworksAudioError = '불꽃놀이 URL을 재생하지 못했어요. Pixabay 페이지 자동 추출이 실패하면 직접 열리는 mp3/ogg/wav 링크를 넣어 주세요.';
        state.fireworksNodes = null;
        syncPanel();
        syncFloatingButton();
      });
      state.fireworksAudio = audio;
    }
    return state.fireworksAudio;
  }

  async function loadFireworksAudioFromUrl() {
    const sourceUrl = normalizeAudioUrl(state.settings.fireworksAudioUrl, '');
    if (!sourceUrl) {
      state.fireworksAudioMeta = null;
      state.fireworksAudioResolvedUrl = '';
      syncPanel();
      return false;
    }
    let playableUrl = '';
    try {
      playableUrl = await resolvePlayableAudioUrl(sourceUrl);
    } catch (err) {
      state.fireworksAudioError = err?.message || String(err || '불꽃놀이 오디오 주소 변환 실패');
      state.fireworksAudioMeta = { name: getAudioNameFromUrl(sourceUrl), url: sourceUrl, resolvedUrl: '', updatedAt: Date.now() };
      syncPanel();
      return false;
    }
    if (!playableUrl) {
      state.fireworksAudioError = '재생 가능한 불꽃놀이 오디오 주소가 비어 있어요.';
      syncPanel();
      return false;
    }
    const audio = ensureFireworksAudioElement();
    if (audio.src !== playableUrl) {
      audio.src = playableUrl;
      audio.loop = true;
      audio.preload = state.settings.soundEnabled ? 'auto' : 'metadata';
      audio.volume = 0;
      audio.load();
    }
    state.fireworksAudioUrl = sourceUrl;
    state.fireworksAudioResolvedUrl = playableUrl;
    state.fireworksAudioMeta = { name: getAudioNameFromUrl(sourceUrl), url: sourceUrl, resolvedUrl: playableUrl, updatedAt: Date.now() };
    state.fireworksAudioError = '';
    syncPanel();
    return true;
  }

  async function setFireworksAudioUrl(url) {
    const normalized = normalizeAudioUrl(url, '');
    if (!normalized) throw new Error('http:// 또는 https:// 로 시작하는 Pixabay 페이지 링크 또는 직접 오디오 링크를 넣어 주세요.');
    stopFireworksSound(true);
    saveSettings({ fireworksAudioUrl: normalized }, { skipScan: true });
    state.fireworksAudioUnlocked = false;
    await loadFireworksAudioFromUrl();
    syncAudioWithEffect();
  }

  async function clearFireworksAudioUrl() {
    stopFireworksSound(true);
    saveSettings({ fireworksAudioUrl: '' }, { skipScan: true });
    state.fireworksAudioUrl = '';
    state.fireworksAudioResolvedUrl = '';
    state.fireworksAudioMeta = null;
    state.fireworksAudioUnlocked = false;
    state.fireworksAudioError = '';
    if (state.fireworksAudio) {
      state.fireworksAudio.removeAttribute('src');
      try { state.fireworksAudio.load(); } catch (_) {}
    }
    syncPanel();
    syncFloatingButton();
  }

  function ensureUnderwaterAudioElement() {
    if (!state.underwaterAudio) {
      const audio = new Audio();
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = 0;
      audio.setAttribute('playsinline', '');
      audio.addEventListener('ended', () => {
        if (state.underwaterNodes) syncAudioWithEffect();
      });
      audio.addEventListener('error', () => {
        state.underwaterAudioError = '수중 URL을 재생하지 못했어요. Pixabay 페이지 자동 추출이 실패하면 직접 열리는 mp3/ogg/wav 링크를 넣어 주세요.';
        state.underwaterNodes = null;
        syncPanel();
        syncFloatingButton();
      });
      state.underwaterAudio = audio;
    }
    return state.underwaterAudio;
  }

  async function loadUnderwaterAudioFromUrl() {
    const sourceUrl = normalizeAudioUrl(state.settings.underwaterAudioUrl, '');
    if (!sourceUrl) {
      state.underwaterAudioMeta = null;
      state.underwaterAudioResolvedUrl = '';
      syncPanel();
      return false;
    }
    let playableUrl = '';
    try {
      playableUrl = await resolvePlayableAudioUrl(sourceUrl);
    } catch (err) {
      state.underwaterAudioError = err?.message || String(err || '수중 오디오 주소 변환 실패');
      state.underwaterAudioMeta = { name: getAudioNameFromUrl(sourceUrl), url: sourceUrl, resolvedUrl: '', updatedAt: Date.now() };
      syncPanel();
      return false;
    }
    if (!playableUrl) {
      state.underwaterAudioError = '재생 가능한 수중 오디오 주소가 비어 있어요.';
      syncPanel();
      return false;
    }
    const audio = ensureUnderwaterAudioElement();
    if (audio.src !== playableUrl) {
      audio.src = playableUrl;
      audio.loop = true;
      audio.preload = state.settings.soundEnabled ? 'auto' : 'metadata';
      audio.volume = 0;
      audio.load();
    }
    state.underwaterAudioUrl = sourceUrl;
    state.underwaterAudioResolvedUrl = playableUrl;
    state.underwaterAudioMeta = { name: getAudioNameFromUrl(sourceUrl), url: sourceUrl, resolvedUrl: playableUrl, updatedAt: Date.now() };
    state.underwaterAudioError = '';
    syncPanel();
    return true;
  }

  async function setUnderwaterAudioUrl(url) {
    const normalized = normalizeAudioUrl(url, '');
    if (!normalized) throw new Error('http:// 또는 https:// 로 시작하는 Pixabay 페이지 링크 또는 직접 오디오 링크를 넣어 주세요.');
    stopUnderwaterSound(true);
    saveSettings({ underwaterAudioUrl: normalized }, { skipScan: true });
    state.underwaterAudioUnlocked = false;
    await loadUnderwaterAudioFromUrl();
    syncAudioWithEffect();
  }

  async function clearUnderwaterAudioUrl() {
    stopUnderwaterSound(true);
    saveSettings({ underwaterAudioUrl: '' }, { skipScan: true });
    state.underwaterAudioUrl = '';
    state.underwaterAudioResolvedUrl = '';
    state.underwaterAudioMeta = null;
    state.underwaterAudioUnlocked = false;
    state.underwaterAudioError = '';
    if (state.underwaterAudio) {
      state.underwaterAudio.removeAttribute('src');
      try { state.underwaterAudio.load(); } catch (_) {}
    }
    syncPanel();
    syncFloatingButton();
  }

  async function unlockAudio() {
    state.audioError = '';
    if (!state.settings.audioUrl) {
      const input = state.panel?.querySelector('[data-cawf-audio-url]');
      const pendingUrl = input instanceof HTMLInputElement ? input.value : '';
      if (pendingUrl) await setRainAudioUrl(pendingUrl);
    }

    if (!state.settings.audioUrl) throw new Error('먼저 빗소리 URL을 입력하고 URL 적용을 눌러 주세요.');

    const ok = await loadRainAudioFromUrl();
    if (!ok) throw new Error('빗소리 URL을 불러오지 못했어요.');

    const audio = ensureRainAudioElement();
    audio.volume = 0;
    try {
      await audio.play();
      state.audioUnlocked = true;
      if (!shouldPlayRainForCurrentEffect()) {
        audio.pause();
        try { audio.currentTime = 0; } catch (_) {}
      }
    } catch (err) {
      state.audioUnlocked = false;
      throw new Error('브라우저가 자동 재생을 막았거나 URL 재생이 실패했어요. 브라우저 소리 허용을 다시 누르거나, 직접 mp3 링크를 넣어 주세요.');
    }

    updateMasterVolume();
    syncPanel();
    syncFloatingButton();
    return true;
  }

  function updateMasterVolume() {
    if (state.rainAudio && state.rainNodes) fadeRainTo(1, 180);
    if (state.cricketAudio && state.cricketNodes) fadeCricketTo(1, 180);
    if (state.waveAudio && state.waveNodes) fadeWaveTo(1, 180);
    if (state.fireworksAudio && state.fireworksNodes) fadeFireworksTo(1, 180);
    if (state.underwaterAudio && state.underwaterNodes) fadeUnderwaterTo(1, 180);
    if (state.spellAudio && state.spellAudioPlaying) {
      state.spellAudio.volume = Math.max(0, Math.min(1, state.settings.spellAudioVolume));
    }
  }

  function fadeRainTo(value, durationMs = 700) {
    const audio = state.rainAudio;
    if (!audio) return;

    clearInterval(state.audioFadeTimer);
    const start = Number(audio.volume || 0);
    const target = Math.max(0, Math.min(1, value)) * Math.max(0, Math.min(1, state.settings.audioVolume));
    const duration = Math.max(40, Number(durationMs) || 700);
    const startedAt = performance.now();

    state.audioFadeTimer = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - startedAt) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      audio.volume = Math.max(0, Math.min(1, start + (target - start) * eased));
      if (t >= 1) {
        clearInterval(state.audioFadeTimer);
        state.audioFadeTimer = 0;
      }
    }, 40);
  }

  async function startRainSound(forceUnlock = false) {
    if (!state.settings.audioEnabled) return;
    if (document.hidden && !state.settings.audioWhileHidden) return;

    if (!state.settings.audioUrl) {
      state.audioError = '먼저 빗소리 URL을 입력해 주세요.';
      syncPanel();
      return;
    }

    const ok = await loadRainAudioFromUrl();
    if (!ok) {
      state.audioError = '빗소리 URL을 불러오지 못했어요.';
      syncPanel();
      return;
    }

    const audio = ensureRainAudioElement();
    state.audioError = '';

    if (!state.audioUnlocked && forceUnlock) await unlockAudio();
    if (!state.audioUnlocked) {
      state.audioError = '브라우저 소리 허용 버튼을 한 번 눌러야 자동 재생돼요.';
      syncPanel();
      return;
    }

    try {
      if (audio.paused) await audio.play();
      state.rainNodes = audio;
      fadeRainTo(1, 700);
    } catch (err) {
      state.rainNodes = null;
      state.audioUnlocked = false;
      state.audioError = '브라우저가 재생을 막았거나 URL 재생에 실패했어요. 브라우저 소리 허용을 다시 눌러 주세요.';
    }

    syncPanel();
    syncFloatingButton();
  }

  function stopRainSound(fast = false) {
    const audio = state.rainAudio;
    clearTimeout(state.rainStopTimer);
    clearInterval(state.audioFadeTimer);
    state.audioFadeTimer = 0;

    if (!audio) {
      state.rainNodes = null;
      syncPanel();
      syncFloatingButton();
      return;
    }

    const duration = fast ? 120 : 650;
    const start = Number(audio.volume || 0);
    const startedAt = performance.now();

    state.audioFadeTimer = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - startedAt) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      audio.volume = Math.max(0, start * (1 - eased));
      if (t >= 1) {
        clearInterval(state.audioFadeTimer);
        state.audioFadeTimer = 0;
      }
    }, 40);

    state.rainStopTimer = window.setTimeout(() => {
      try { audio.pause(); } catch (_) {}
      try { audio.currentTime = 0; } catch (_) {}
      audio.volume = 0;
      state.rainNodes = null;
      syncPanel();
      syncFloatingButton();
    }, duration + 80);
  }

  async function unlockCricketAudio() {
    state.cricketAudioError = '';
    if (!state.settings.cricketAudioUrl) {
      const input = state.panel?.querySelector('[data-cawf-cricket-audio-url]');
      const pendingUrl = input instanceof HTMLInputElement ? input.value : '';
      if (pendingUrl) await setCricketAudioUrl(pendingUrl);
    }

    if (!state.settings.cricketAudioUrl) throw new Error('먼저 풀벌레 소리 URL을 입력하고 URL 적용을 눌러 주세요.');

    const ok = await loadCricketAudioFromUrl();
    if (!ok) throw new Error('풀벌레 소리 URL을 불러오지 못했어요.');

    const audio = ensureCricketAudioElement();
    audio.volume = 0;
    try {
      await audio.play();
      state.cricketAudioUnlocked = true;
      if (!shouldPlayCricketForCurrentEffect()) {
        audio.pause();
        try { audio.currentTime = 0; } catch (_) {}
      }
    } catch (err) {
      state.cricketAudioUnlocked = false;
      throw new Error('브라우저가 자동 재생을 막았거나 URL 재생이 실패했어요. 브라우저 소리 허용을 다시 누르거나, 직접 mp3 링크를 넣어 주세요.');
    }

    updateMasterVolume();
    syncPanel();
    syncFloatingButton();
    return true;
  }

  function fadeCricketTo(value, durationMs = 700) {
    const audio = state.cricketAudio;
    if (!audio) return;

    clearInterval(state.cricketAudioFadeTimer);
    const start = Number(audio.volume || 0);
    const target = Math.max(0, Math.min(1, value)) * Math.max(0, Math.min(1, state.settings.cricketAudioVolume));
    const duration = Math.max(40, Number(durationMs) || 700);
    const startedAt = performance.now();

    state.cricketAudioFadeTimer = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - startedAt) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      audio.volume = Math.max(0, Math.min(1, start + (target - start) * eased));
      if (t >= 1) {
        clearInterval(state.cricketAudioFadeTimer);
        state.cricketAudioFadeTimer = 0;
      }
    }, 40);
  }

  async function startCricketSound(forceUnlock = false) {
    if (!state.settings.cricketAudioEnabled) return;
    if (document.hidden && !state.settings.audioWhileHidden) return;

    if (!state.settings.cricketAudioUrl) {
      state.cricketAudioError = '먼저 풀벌레 소리 URL을 입력해 주세요.';
      syncPanel();
      return;
    }

    const ok = await loadCricketAudioFromUrl();
    if (!ok) {
      state.cricketAudioError = '풀벌레 소리 URL을 불러오지 못했어요.';
      syncPanel();
      return;
    }

    const audio = ensureCricketAudioElement();
    state.cricketAudioError = '';

    if (!state.cricketAudioUnlocked && forceUnlock) await unlockCricketAudio();
    if (!state.cricketAudioUnlocked) {
      state.cricketAudioError = '브라우저 소리 허용 버튼을 한 번 눌러야 자동 재생돼요.';
      syncPanel();
      return;
    }

    try {
      if (audio.paused) await audio.play();
      state.cricketNodes = audio;
      fadeCricketTo(1, 700);
    } catch (err) {
      state.cricketNodes = null;
      state.cricketAudioUnlocked = false;
      state.cricketAudioError = '브라우저가 재생을 막았거나 URL 재생에 실패했어요. 브라우저 소리 허용을 다시 눌러 주세요.';
    }

    syncPanel();
    syncFloatingButton();
  }

  function stopCricketSound(fast = false) {
    const audio = state.cricketAudio;
    clearTimeout(state.cricketStopTimer);
    clearInterval(state.cricketAudioFadeTimer);
    state.cricketAudioFadeTimer = 0;

    if (!audio) {
      state.cricketNodes = null;
      syncPanel();
      syncFloatingButton();
      return;
    }

    const duration = fast ? 120 : 650;
    const start = Number(audio.volume || 0);
    const startedAt = performance.now();

    state.cricketAudioFadeTimer = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - startedAt) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      audio.volume = Math.max(0, start * (1 - eased));
      if (t >= 1) {
        clearInterval(state.cricketAudioFadeTimer);
        state.cricketAudioFadeTimer = 0;
      }
    }, 40);

    state.cricketStopTimer = window.setTimeout(() => {
      try { audio.pause(); } catch (_) {}
      try { audio.currentTime = 0; } catch (_) {}
      audio.volume = 0;
      state.cricketNodes = null;
      syncPanel();
      syncFloatingButton();
    }, duration + 80);
  }


  async function unlockWaveAudio() {
    state.waveAudioError = '';
    if (!state.settings.waveAudioUrl) {
      const input = state.panel?.querySelector('[data-cawf-wave-audio-url]');
      const pendingUrl = input instanceof HTMLInputElement ? input.value : '';
      if (pendingUrl) await setWaveAudioUrl(pendingUrl);
    }

    if (!state.settings.waveAudioUrl) throw new Error('먼저 파도소리 URL을 입력하고 URL 적용을 눌러 주세요.');

    const ok = await loadWaveAudioFromUrl();
    if (!ok) throw new Error('파도소리 URL을 불러오지 못했어요.');

    const audio = ensureWaveAudioElement();
    audio.volume = 0;
    try {
      await audio.play();
      state.waveAudioUnlocked = true;
      if (!shouldPlayWaveForCurrentEffect()) {
        audio.pause();
        try { audio.currentTime = 0; } catch (_) {}
      }
    } catch (err) {
      state.waveAudioUnlocked = false;
      throw new Error('브라우저가 자동 재생을 막았거나 URL 재생이 실패했어요. 브라우저 소리 허용을 다시 누르거나, 직접 mp3 링크를 넣어 주세요.');
    }

    updateMasterVolume();
    syncPanel();
    syncFloatingButton();
    return true;
  }

  function fadeWaveTo(value, durationMs = 700) {
    const audio = state.waveAudio;
    if (!audio) return;

    clearInterval(state.waveAudioFadeTimer);
    const start = Number(audio.volume || 0);
    const target = Math.max(0, Math.min(1, value)) * Math.max(0, Math.min(1, state.settings.waveAudioVolume));
    const duration = Math.max(40, Number(durationMs) || 700);
    const startedAt = performance.now();

    state.waveAudioFadeTimer = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - startedAt) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      audio.volume = Math.max(0, Math.min(1, start + (target - start) * eased));
      if (t >= 1) {
        clearInterval(state.waveAudioFadeTimer);
        state.waveAudioFadeTimer = 0;
      }
    }, 40);
  }

  async function startWaveSound(forceUnlock = false) {
    if (!state.settings.waveAudioEnabled) return;
    if (document.hidden && !state.settings.audioWhileHidden) return;

    if (!state.settings.waveAudioUrl) {
      state.waveAudioError = '먼저 파도소리 URL을 입력해 주세요.';
      syncPanel();
      return;
    }

    const ok = await loadWaveAudioFromUrl();
    if (!ok) {
      state.waveAudioError = '파도소리 URL을 불러오지 못했어요.';
      syncPanel();
      return;
    }

    const audio = ensureWaveAudioElement();
    state.waveAudioError = '';

    if (!state.waveAudioUnlocked && forceUnlock) await unlockWaveAudio();
    if (!state.waveAudioUnlocked) {
      state.waveAudioError = '브라우저 소리 허용 버튼을 한 번 눌러야 자동 재생돼요.';
      syncPanel();
      return;
    }

    try {
      if (audio.paused) await audio.play();
      state.waveNodes = audio;
      fadeWaveTo(1, 700);
    } catch (err) {
      state.waveNodes = null;
      state.waveAudioUnlocked = false;
      state.waveAudioError = '브라우저가 재생을 막았거나 URL 재생에 실패했어요. 브라우저 소리 허용을 다시 눌러 주세요.';
    }

    syncPanel();
    syncFloatingButton();
  }

  function stopWaveSound(fast = false) {
    const audio = state.waveAudio;
    clearTimeout(state.waveStopTimer);
    clearInterval(state.waveAudioFadeTimer);
    state.waveAudioFadeTimer = 0;

    if (!audio) {
      state.waveNodes = null;
      syncPanel();
      syncFloatingButton();
      return;
    }

    const duration = fast ? 120 : 650;
    const start = Number(audio.volume || 0);
    const startedAt = performance.now();

    state.waveAudioFadeTimer = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - startedAt) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      audio.volume = Math.max(0, start * (1 - eased));
      if (t >= 1) {
        clearInterval(state.waveAudioFadeTimer);
        state.waveAudioFadeTimer = 0;
      }
    }, 40);

    state.waveStopTimer = window.setTimeout(() => {
      try { audio.pause(); } catch (_) {}
      try { audio.currentTime = 0; } catch (_) {}
      audio.volume = 0;
      state.waveNodes = null;
      syncPanel();
      syncFloatingButton();
    }, duration + 80);
  }


  async function unlockFireworksAudio() {
    state.fireworksAudioError = '';
    if (!state.settings.fireworksAudioUrl) {
      const input = state.panel?.querySelector('[data-cawf-fireworks-audio-url]');
      const pendingUrl = input instanceof HTMLInputElement ? input.value : '';
      if (pendingUrl) await setFireworksAudioUrl(pendingUrl);
    }
    if (!state.settings.fireworksAudioUrl) throw new Error('먼저 불꽃놀이 URL을 입력하고 URL 적용을 눌러 주세요.');
    const ok = await loadFireworksAudioFromUrl();
    if (!ok) throw new Error('불꽃놀이 URL을 불러오지 못했어요.');
    const audio = ensureFireworksAudioElement();
    audio.volume = 0;
    try {
      await audio.play();
      state.fireworksAudioUnlocked = true;
      if (!shouldPlayFireworksForCurrentEffect()) {
        audio.pause();
        try { audio.currentTime = 0; } catch (_) {}
      }
    } catch (err) {
      state.fireworksAudioUnlocked = false;
      throw new Error('브라우저가 자동 재생을 막았거나 URL 재생이 실패했어요. 브라우저 소리 허용을 다시 누르거나, 직접 mp3 링크를 넣어 주세요.');
    }
    updateMasterVolume();
    syncPanel();
    syncFloatingButton();
    return true;
  }

  function fadeFireworksTo(value, durationMs = 700) {
    const audio = state.fireworksAudio;
    if (!audio) return;
    clearInterval(state.fireworksAudioFadeTimer);
    const start = Number(audio.volume || 0);
    const target = Math.max(0, Math.min(1, value)) * Math.max(0, Math.min(1, state.settings.fireworksAudioVolume));
    const duration = Math.max(40, Number(durationMs) || 700);
    const startedAt = performance.now();
    state.fireworksAudioFadeTimer = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - startedAt) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      audio.volume = Math.max(0, Math.min(1, start + (target - start) * eased));
      if (t >= 1) {
        clearInterval(state.fireworksAudioFadeTimer);
        state.fireworksAudioFadeTimer = 0;
      }
    }, 40);
  }

  async function startFireworksSound(forceUnlock = false) {
    if (!state.settings.fireworksAudioEnabled) return;
    if (document.hidden && !state.settings.audioWhileHidden) return;
    if (!state.settings.fireworksAudioUrl) {
      state.fireworksAudioError = '먼저 불꽃놀이 URL을 입력해 주세요.';
      syncPanel();
      return;
    }
    const ok = await loadFireworksAudioFromUrl();
    if (!ok) {
      state.fireworksAudioError = '불꽃놀이 URL을 불러오지 못했어요.';
      syncPanel();
      return;
    }
    const audio = ensureFireworksAudioElement();
    state.fireworksAudioError = '';
    if (!state.fireworksAudioUnlocked && forceUnlock) await unlockFireworksAudio();
    if (!state.fireworksAudioUnlocked) {
      state.fireworksAudioError = '브라우저 소리 허용 버튼을 한 번 눌러야 자동 재생돼요.';
      syncPanel();
      return;
    }
    try {
      if (audio.paused) await audio.play();
      state.fireworksNodes = audio;
      fadeFireworksTo(1, 700);
    } catch (err) {
      state.fireworksNodes = null;
      state.fireworksAudioUnlocked = false;
      state.fireworksAudioError = '브라우저가 재생을 막았거나 URL 재생에 실패했어요. 브라우저 소리 허용을 다시 눌러 주세요.';
    }
    syncPanel();
    syncFloatingButton();
  }

  function stopFireworksSound(fast = false) {
    const audio = state.fireworksAudio;
    clearTimeout(state.fireworksStopTimer);
    clearInterval(state.fireworksAudioFadeTimer);
    state.fireworksAudioFadeTimer = 0;
    if (!audio) {
      state.fireworksNodes = null;
      syncPanel();
      syncFloatingButton();
      return;
    }
    const duration = fast ? 120 : 650;
    const start = Number(audio.volume || 0);
    const startedAt = performance.now();
    state.fireworksAudioFadeTimer = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - startedAt) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      audio.volume = Math.max(0, start * (1 - eased));
      if (t >= 1) {
        clearInterval(state.fireworksAudioFadeTimer);
        state.fireworksAudioFadeTimer = 0;
      }
    }, 40);
    state.fireworksStopTimer = window.setTimeout(() => {
      try { audio.pause(); } catch (_) {}
      try { audio.currentTime = 0; } catch (_) {}
      audio.volume = 0;
      state.fireworksNodes = null;
      syncPanel();
      syncFloatingButton();
    }, duration + 80);
  }

  async function unlockUnderwaterAudio() {
    state.underwaterAudioError = '';
    if (!state.settings.underwaterAudioUrl) {
      const input = state.panel?.querySelector('[data-cawf-underwater-audio-url]');
      const pendingUrl = input instanceof HTMLInputElement ? input.value : '';
      if (pendingUrl) await setUnderwaterAudioUrl(pendingUrl);
    }
    if (!state.settings.underwaterAudioUrl) throw new Error('먼저 수중 URL을 입력하고 URL 적용을 눌러 주세요.');
    const ok = await loadUnderwaterAudioFromUrl();
    if (!ok) throw new Error('수중 URL을 불러오지 못했어요.');
    const audio = ensureUnderwaterAudioElement();
    audio.volume = 0;
    try {
      await audio.play();
      state.underwaterAudioUnlocked = true;
      if (!shouldPlayUnderwaterForCurrentEffect()) {
        audio.pause();
        try { audio.currentTime = 0; } catch (_) {}
      }
    } catch (err) {
      state.underwaterAudioUnlocked = false;
      throw new Error('브라우저가 자동 재생을 막았거나 URL 재생이 실패했어요. 브라우저 소리 허용을 다시 누르거나, 직접 mp3 링크를 넣어 주세요.');
    }
    updateMasterVolume();
    syncPanel();
    syncFloatingButton();
    return true;
  }

  function fadeUnderwaterTo(value, durationMs = 700) {
    const audio = state.underwaterAudio;
    if (!audio) return;
    clearInterval(state.underwaterAudioFadeTimer);
    const start = Number(audio.volume || 0);
    const target = Math.max(0, Math.min(1, value)) * Math.max(0, Math.min(1, state.settings.underwaterAudioVolume));
    const duration = Math.max(40, Number(durationMs) || 700);
    const startedAt = performance.now();
    state.underwaterAudioFadeTimer = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - startedAt) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      audio.volume = Math.max(0, Math.min(1, start + (target - start) * eased));
      if (t >= 1) {
        clearInterval(state.underwaterAudioFadeTimer);
        state.underwaterAudioFadeTimer = 0;
      }
    }, 40);
  }

  async function startUnderwaterSound(forceUnlock = false) {
    if (!state.settings.underwaterAudioEnabled) return;
    if (document.hidden && !state.settings.audioWhileHidden) return;
    if (!state.settings.underwaterAudioUrl) {
      state.underwaterAudioError = '먼저 수중 URL을 입력해 주세요.';
      syncPanel();
      return;
    }
    const ok = await loadUnderwaterAudioFromUrl();
    if (!ok) {
      state.underwaterAudioError = '수중 URL을 불러오지 못했어요.';
      syncPanel();
      return;
    }
    const audio = ensureUnderwaterAudioElement();
    state.underwaterAudioError = '';
    if (!state.underwaterAudioUnlocked && forceUnlock) await unlockUnderwaterAudio();
    if (!state.underwaterAudioUnlocked) {
      state.underwaterAudioError = '브라우저 소리 허용 버튼을 한 번 눌러야 자동 재생돼요.';
      syncPanel();
      return;
    }
    try {
      if (audio.paused) await audio.play();
      state.underwaterNodes = audio;
      fadeUnderwaterTo(1, 700);
    } catch (err) {
      state.underwaterNodes = null;
      state.underwaterAudioUnlocked = false;
      state.underwaterAudioError = '브라우저가 재생을 막았거나 URL 재생에 실패했어요. 브라우저 소리 허용을 다시 눌러 주세요.';
    }
    syncPanel();
    syncFloatingButton();
  }

  function stopUnderwaterSound(fast = false) {
    const audio = state.underwaterAudio;
    clearTimeout(state.underwaterStopTimer);
    clearInterval(state.underwaterAudioFadeTimer);
    state.underwaterAudioFadeTimer = 0;
    if (!audio) {
      state.underwaterNodes = null;
      syncPanel();
      syncFloatingButton();
      return;
    }
    const duration = fast ? 120 : 650;
    const start = Number(audio.volume || 0);
    const startedAt = performance.now();
    state.underwaterAudioFadeTimer = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - startedAt) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      audio.volume = Math.max(0, start * (1 - eased));
      if (t >= 1) {
        clearInterval(state.underwaterAudioFadeTimer);
        state.underwaterAudioFadeTimer = 0;
      }
    }, 40);
    state.underwaterStopTimer = window.setTimeout(() => {
      try { audio.pause(); } catch (_) {}
      try { audio.currentTime = 0; } catch (_) {}
      audio.volume = 0;
      state.underwaterNodes = null;
      syncPanel();
      syncFloatingButton();
    }, duration + 80);
  }

  async function toggleAudioEnabled() {
    if (state.settings.audioEnabled) {
      saveSettings({ audioEnabled: false }, { skipScan: true });
      stopRainSound(false);
      return;
    }

    if (!state.settings.audioUrl) {
      const input = state.panel?.querySelector('[data-cawf-audio-url]');
      const pendingUrl = input instanceof HTMLInputElement ? input.value : '';
      if (pendingUrl) await setRainAudioUrl(pendingUrl);
    }

    if (!state.settings.audioUrl) throw new Error('먼저 빗소리 URL을 입력하고 URL 적용을 눌러 주세요.');

    saveSettings({ audioEnabled: true }, { skipScan: true });
    await startRainSound(true);
  }

  async function toggleCricketAudioEnabled() {
    if (state.settings.cricketAudioEnabled) {
      saveSettings({ cricketAudioEnabled: false }, { skipScan: true });
      stopCricketSound(false);
      return;
    }

    if (!state.settings.cricketAudioUrl) {
      const input = state.panel?.querySelector('[data-cawf-cricket-audio-url]');
      const pendingUrl = input instanceof HTMLInputElement ? input.value : '';
      if (pendingUrl) await setCricketAudioUrl(pendingUrl);
    }

    if (!state.settings.cricketAudioUrl) throw new Error('먼저 풀벌레 소리 URL을 입력하고 URL 적용을 눌러 주세요.');

    saveSettings({ cricketAudioEnabled: true }, { skipScan: true });
    await startCricketSound(true);
  }

  function shouldPlayRainForCurrentEffect() {
    if (!state.settings.audioEnabled) return false;
    if (document.hidden && !state.settings.audioWhileHidden) return false;
    if (!state.settings.audioFollowEffect) return true;
    return state.activeEffect === 'rain';
  }

  function shouldPlayCricketForCurrentEffect() {
    if (!state.settings.cricketAudioEnabled) return false;
    if (document.hidden && !state.settings.audioWhileHidden) return false;
    if (!state.settings.audioFollowEffect) return true;
    return state.activeEffect === 'fireflies';
  }

  function shouldPlayWaveForCurrentEffect() {
    if (!state.settings.waveAudioEnabled) return false;
    if (document.hidden && !state.settings.audioWhileHidden) return false;
    if (!state.settings.audioFollowEffect) return true;
    return state.activeEffect === 'shore';
  }

  function shouldPlayFireworksForCurrentEffect() {
    if (!state.settings.fireworksAudioEnabled) return false;
    if (document.hidden && !state.settings.audioWhileHidden) return false;

    // v2.5.6: 불꽃놀이 시각효과와 같은 시간대 억제 판정을 소리에도 적용한다.
    // 즉, 현재 시간대에서 불꽃놀이 화면이 허용되지 않으면 효과 연동 옵션과 무관하게 소리도 나지 않는다.
    // getPaintedScreenEffect에 'fireworks'를 가상 입력해 시각효과 쪽 규칙이 바뀌어도 판정이 서로 어긋나지 않게 한다.
    if (getPaintedScreenEffect('fireworks', state.activeTimeEffect) !== 'fireworks') return false;

    if (!state.settings.audioFollowEffect) return true;
    return state.activeEffect === 'fireworks' && getPaintedScreenEffect() === 'fireworks';
  }

  function shouldPlayUnderwaterForCurrentEffect() {
    if (!state.settings.underwaterAudioEnabled) return false;
    if (document.hidden && !state.settings.audioWhileHidden) return false;
    if (!state.settings.audioFollowEffect) return true;
    return state.activeEffect === 'underwater';
  }

  function shouldPlaySpellForCurrentEffect() {
    if (!state.settings.soundEnabled || !state.settings.enabled || !state.settings.screenEffectEnabled) return false;
    if (document.hidden && !state.settings.audioWhileHidden) return false;
    if (state.effectInView === false || !isEpisodePath()) return false;
    if (state.root?.getAttribute?.('data-cawf-visible') !== 'true') return false;
    return state.activeEffect === 'spellcast' && getPaintedScreenEffect() === 'spellcast';
  }

  function syncAudioWithEffect(force = false) {
    if (state.settings.audioEnabled && shouldPlayRainForCurrentEffect()) {
      startRainSound(force).catch(err => {
        state.audioError = err?.message || String(err || '빗소리 재생 실패');
        syncPanel();
      });
    } else {
      stopRainSound(false);
    }

    if (state.settings.cricketAudioEnabled && shouldPlayCricketForCurrentEffect()) {
      startCricketSound(force).catch(err => {
        state.cricketAudioError = err?.message || String(err || '풀벌레 소리 재생 실패');
        syncPanel();
      });
    } else {
      stopCricketSound(false);
    }

    if (state.settings.waveAudioEnabled && shouldPlayWaveForCurrentEffect()) {
      startWaveSound(force).catch(err => {
        state.waveAudioError = err?.message || String(err || '파도소리 재생 실패');
        syncPanel();
      });
    } else {
      stopWaveSound(false);
    }

    if (state.settings.fireworksAudioEnabled && shouldPlayFireworksForCurrentEffect()) {
      startFireworksSound(force).catch(err => {
        state.fireworksAudioError = err?.message || String(err || '불꽃놀이 재생 실패');
        syncPanel();
      });
    } else {
      stopFireworksSound(false);
    }

    if (state.settings.underwaterAudioEnabled && shouldPlayUnderwaterForCurrentEffect()) {
      startUnderwaterSound(force).catch(err => {
        state.underwaterAudioError = err?.message || String(err || '수중음 재생 실패');
        syncPanel();
      });
    } else {
      stopUnderwaterSound(false);
    }

    // 마법 효과음은 지속음이 아니라 CSS cue에서만 시작한다. 여기서는 범위를 벗어나면 즉시 정지만 한다.
    if (!shouldPlaySpellForCurrentEffect()) stopSpellSound();
  }

  function handleVisibilityChange() {
    applyAnimationPauseState();
    if (document.hidden) {
      if (!state.settings.audioWhileHidden) {
        stopRainSound(false);
        stopCricketSound(false);
        stopWaveSound(false);
        stopFireworksSound(false);
        stopUnderwaterSound(false);
        stopSpellSound();
      }
    } else {
      syncAudioWithEffect();
      if (state.pendingRouteEntryScan && getEpisodeId()) {
        const routeReason = state.pendingRouteEntryReason || 'visibility';
        state.pendingRouteEntryScan = false;
        state.pendingRouteEntryReason = '';
        startRouteEntryReadyWatch(routeReason, state.lastScannedGroupNode || null, state.lastScannedDomSignature || '');
      }
      if (state.pendingGenerateDoneScan) {
        const expectedMessageId = state.pendingGenerateDoneMessageId || '';
        state.pendingGenerateDoneScan = false;
        state.pendingGenerateDoneMessageId = '';
        clearPendingScan();
        startGenerateDoneReadyWatch(expectedMessageId);
      }
    }
  }

  window.__CAWF_DEBUG_LATEST__ = function debugLatestWeatherLog() {
    const latest = getLatestMessageEntry();
    const text = getCleanTextForEntry(latest);
    const codeBlockTimeText = getCodeBlockTextForEntry(latest);
    const timeText = getPrioritizedTimeTextForEntry(latest);
    return {
      version: VERSION,
      scanCount: Number(state.scanCount) || 0,
      lastScanReason: state.lastScanReason || '',
      lastScanAt: Number(state.lastScanAt) || 0,
      episodeId: getEpisodeId(),
      hasLatest: !!latest,
      groupId: latest?.group?.getAttribute?.('data-message-group-id') || '',
      lenAt: latest?.markdown?.getAttribute?.('data-sgb-len-at') || '',
      currentAnswerScore: latest?.key?.currentScore || 0,
      hasRerollCompareMarker: !!latest?.group?.querySelector?.('[data-rr-compare-nav]'),
      hasCurrentRerollTimeBadge: !!latest?.group?.querySelector?.('.crack-message-time-badge-badge[data-source="api-current-reroll"]'),
      includeCodeBlocksInDetection: !!state.settings.includeCodeBlocksInDetection,
      hasCodeBlockInLatest: !!latest?.group?.querySelector?.('[data-sgb-codeblock], .wrtn-codeblock, pre code'),
      textLength: text.length,
      textPreview: text.slice(0, 800),
      codeBlockTimeTextLength: codeBlockTimeText.length,
      codeBlockTimeTextPreview: codeBlockTimeText.slice(0, 800),
      timeTextLength: timeText.length,
      timeTextPreview: timeText.slice(0, 800),
      extractedTimeHHMM: formatMinutesHHMM(extractTimeMinutesFromText(timeText)),
      detectedScreenEffect: detectEffectFromText(text),
      detectedTimeEffect: detectTimeEffectFromText(timeText),
      activeScreenEffect: state.activeEffect,
      activeTimeEffect: state.activeTimeEffect
    };
  };

  window.__CAWF_DEBUG__ = window.__CAWF_DEBUG_LATEST__;
    try {
    const pageWin = getPageWindow();
    if (pageWin && pageWin !== window) {
      pageWin.__CAWF_DEBUG_LATEST__ = window.__CAWF_DEBUG_LATEST__;
    }
  } catch (_) {}

  function getPageWindow() {
    try {
      return typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    } catch (_) {
      return window;
    }
  }


  let initStarted = false;

  function init() {
    if (initStarted) return;
    initStarted = true;

    loadSettings();
    // v0.7.0: 같은 페이지 내 업데이트 대비 — 구버전이 <main>에 남긴 호스트 마커 제거.
    try {
      document.querySelectorAll('[data-cawf-effect-host]').forEach(el => el.removeAttribute('data-cawf-effect-host'));
    } catch (_) {}
    injectStyle();
    ensureRoot();
    ensureFloatingButton();
    if (state.settings.audioEnabled) loadRainAudioFromUrl().then(() => syncAudioWithEffect()).catch(() => {});
    if (state.settings.cricketAudioEnabled) loadCricketAudioFromUrl().then(() => syncAudioWithEffect()).catch(() => {});
    if (state.settings.waveAudioEnabled) loadWaveAudioFromUrl().then(() => syncAudioWithEffect()).catch(() => {});
    // v2.3.6: 사용자 클릭 전에 실제 원격 음원 주소만 준비해 무음 unlock 오판을 피한다.
    // 사운드가 꺼져 있어도 metadata 수준으로만 준비하며 실제 재생은 기존 설정을 그대로 따른다.
    loadFireworksAudioFromUrl().then(() => syncAudioWithEffect()).catch(() => {});
    loadUnderwaterAudioFromUrl().then(() => syncAudioWithEffect()).catch(() => {});
    if (state.settings.soundEnabled) ensureSpellAudioElement();
    applySettingsToDom();
    applyPowerSaveMode('init');
    initBatteryPowerDetect();
    state.lastEpisodeId = getEpisodeId();
    startRouteWatcher();
    watchGenerateDoneScan();
    setupAutoUnlockOnGesture();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('sgb-background-layout', () => {
      state.mountHostCache = null; state.lastBoundsAt = 0;
      scheduleBoundsRefresh('background-layout');
    });
    window.addEventListener('resize', () => {
      scheduleBoundsRefresh('resize');
      state.ambientCanvasMeasuredAt = 0; // 리사이즈 시 ambient 캔버스 즉시 재측정
      clearTimeout(state.rainResizeTimer);
      state.rainResizeTimer = window.setTimeout(() => {
        resizeRainCanvas(true);
        updateRainFloorY();
      }, 120);
      // 창 크기가 바뀌어도 버튼이 화면 밖으로 나가지 않게 다시 클램프.
      if (state.buttonPos) applyFloatingButtonPos(state.buttonPos.left, state.buttonPos.top, true);
    });

    // v0.7.0: fixed underlay이므로 스크롤/뷰포트 변화 시 위치/크기만 갱신(parent 이동 없음).
    // scroll은 비캡처라 채팅 내부 스크롤이 아니라 페이지 레벨 변화에만 반응한다.
    window.addEventListener('scroll', () => scheduleBoundsRefresh('scroll'), { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => scheduleBoundsRefresh('vv-resize'));
      window.visualViewport.addEventListener('scroll', () => scheduleBoundsRefresh('vv-scroll'));
    }

    // 최초 실행은 기존 방의 이미 렌더된 로그를 1회 읽는다.
    // SPA 본문이 document-idle 직후 늦게 붙는 경우만 커버하도록 기존 600ms 1회 안정화 대기는 유지한다.
    scheduleScan('init', 600);
    log(`${VERSION} loaded`);
  }

  let initScheduleStarted = false;

  function scheduleInit() {
    if (initScheduleStarted) return;
    initScheduleStarted = true;

    window.setTimeout(init, INIT_FALLBACK_DELAY_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleInit, { once: true });
  } else {
    scheduleInit();
  }
})();
