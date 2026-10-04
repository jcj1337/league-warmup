import { THEME } from '../../config/theme';
import { TEX } from '../art/textures';
import type { ProjectileArt } from './ProjectileView';

const D = THEME.depth;
const T = THEME.fx.trails;

/**
 * The look of every projectile. Gameplay speed and radius stay in balance.ts;
 * this only picks sprites, trails and draw order.
 */
export const PROJECTILE_ART = {
  auto: { frames: [TEX.proj.auto], rotate: true, trail: T.auto, depth: D.projectiles },
  q: { frames: [TEX.proj.q], rotate: true, trail: T.q, depth: D.projectiles },
  w: { frames: [TEX.proj.w], rotate: false, trail: T.w, depth: D.projectiles },
  e: { frames: [TEX.proj.e], rotate: true, trail: T.e, depth: D.projectiles },
  fang: { frames: [TEX.proj.fang], rotate: true, trail: T.fang, depth: D.projectiles },
  hostile: { frames: TEX.proj.hostile, frameMs: 110, rotate: false, trail: T.hostile, depth: D.hostileProjectiles },
  glob: { frames: [TEX.proj.glob], rotate: false, trail: T.glob, depth: D.hostileProjectiles },
  sphere: { frames: [TEX.proj.sphere], rotate: false, trail: T.sphere, depth: D.hostileProjectiles },
  orb: { frames: TEX.proj.orb, frameMs: 70, rotate: false, trail: T.orb, depth: D.hostileProjectiles },
} satisfies Record<string, ProjectileArt>;
