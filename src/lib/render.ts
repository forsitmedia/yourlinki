import { lookVars, lookColors, themeColorMeta, FONTS, fontLink } from './look';
import { imageFrameStyle } from './image-frame';
import { normalizeButtonShape, normalizeButtonStyle } from './button-shape';
import { tileAttributes, tileTextStyle } from './tile-style';
import { socialKey } from './social-order';
import { bounded, designStyle, normalizeBlockDesign, sizeTier } from './layout';
import { icon } from './icons';
import { shapeSvg } from './shapes';
import { platform } from './platforms';
import { youtubeVideo, youtubeCover, postUrl, postSource, videoRatio } from './media';
import { isVisible, safeUrl, safeImg, CREDENTIAL_KINDS, type Config, type Link, type PageBlock } from './types';
import css from './page.css?inline';

type Opts = { now?: number; preview?: boolean };
const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Simple marks people can type or add with the editor's buttons: **bold**, *italic*, __underline__, ~~crossed out~~. */
/** `***both***` reads as italic around bold: bold never takes a third star. */
export const BOLD = /\*\*(?!\*)(.+?)(?<!\*)\*\*/gs;
export const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
export function rich(text: string): string {
  // Links ([words](address)) are set aside first, so marks never reach inside an address.
  const links: string[] = [];
  const marked = esc(text.replace(LINK, (_, label: string, url: string) => {
    const href = safeUrl(url);
    links.push(href ? `<a class="text-link" href="${esc(href)}" rel="noopener">${esc(label)}</a>` : esc(label));
    return `\u0002${links.length - 1}\u0002`;
  }))
    .replace(BOLD, '<strong>$1</strong>')
    .replace(/__(.+?)__/gs, '<u>$1</u>')
    .replace(/~~(.+?)~~/gs, '<s>$1</s>')
    .replace(/\*(.+?)\*/gs, '<em>$1</em>'); // the stars left after bold are italic
  return marked.replace(/\u0002(\d+)\u0002/g, (_, i) => links[Number(i)]);
}
/** Text items: like rich(), plus lists. Lines starting with "- " or "• " become bullets, "1. " numbers. */
export function richBlock(text: string): string {
  const out: string[] = [];
  let para: string[] = [], list: { tag: 'ul' | 'ol'; items: string[] } | null = null;
  const flushPara = () => { if (para.length) out.push(`<span class="text-para">${rich(para.join('\n'))}</span>`); para = []; };
  const flushList = () => { if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${rich(i)}</li>`).join('')}</${list.tag}>`); list = null; };
  for (const line of text.split('\n')) {
    const bullet = line.match(/^\s*[-•]\s+(.*)$/), number = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const tag = bullet ? 'ul' : number ? 'ol' : null;
    if (tag) { flushPara(); if (list && list.tag !== tag) flushList(); list ??= { tag, items: [] }; list.items.push((bullet ?? number)![1]); }
    else { flushList(); para.push(line); }
  }
  flushPara(); flushList();
  return out.join('');
}
/** The same text without the marks, for places that can't show them (search results, link previews). */
export const plain = (text: string) => text.replace(LINK, '$1').replace(/\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|\*(.+?)\*/gs, (_, a, b, c, d) => a ?? b ?? c ?? d);

/** One renderer for the public page and the editor's live preview.
 * The public page is a single static file: it embeds its own config, so the editor can reopen it,
 * and leaves scheduled links in place for SCHEDULE_SCRIPT to show or hide at visit time. */
export function renderPage(cfg: Config, { now = Date.now(), preview = false }: Opts = {}): string {
  const photo = safeImg(cfg.profile.photo);
  const backgroundImage = cfg.profile.showCover !== false && safeImg(cfg.profile.cover) || photo;
  const photoBg = cfg.look.background === 'photo' && backgroundImage;
  const expired = (l: Link) => !!l.expireAt && now >= Date.parse(l.expireAt);
  const shown = (l: Link) => (preview ? isVisible(l, now) : !l.hidden && !expired(l));
  const attrs = (l: Link) => preview ? `href="${esc(safeUrl(l.url) || '#')}"`
    : `href="${esc(safeUrl(l.url) || '#')}" rel="noopener"${l.publishAt ? ` data-show-from="${esc(l.publishAt)}"` : ''}${l.expireAt ? ` data-show-until="${esc(l.expireAt)}"` : ''}`;
  const blocks: string[] = [];
  let run: { link: Link | null; block: PageBlock }[] = [];
  const flush = () => { if (run.length) blocks.push(linkList(run, attrs, cfg.look.template === 'gallery')); run = []; };
  for (const block of cfg.blocks) {
    if (block.hidden) continue;
    // Empty space keeps its place, also between links (so a row of tiles keeps its shape).
    if (block.type === 'space') {
      if (run.length) run.push({ link: null, block }); else blocks.push(spaceBlock(block));
      continue;
    }
    if (block.type === 'link') {
      const link = cfg.links.find((l) => l.id === block.linkId);
      if (link && shown(link)) run.push({ link, block });
      continue;
    }
    flush();
    const data = blockAttributes(block, cfg);
    if (block.type === 'name') blocks.push(`<section class="name-block" ${data}>${identity(cfg)}</section>`);
    if (block.type === 'profile') blocks.push(`<section class="profile-block${photo ? '' : ' no-photo'}${cfg.profile.showCover !== false && (cfg.look.template === 'cover' || safeImg(cfg.profile.cover)) ? ' has-cover' : ''}${cfg.profile.showCover !== false && safeImg(cfg.profile.cover) && ['photo', 'studio'].includes(cfg.look.template) ? ' has-independent-cover' : ''}" ${data}>${hero(cfg, photo)}</section>`);
    if (block.type === 'bio' && cfg.profile.bio) blocks.push(bio(cfg, data));
    if (block.type === 'highlights') blocks.push(highlights(cfg, data + (block.part ? ' data-part' : ''), block.part));
    if (block.type === 'social') blocks.push(social(cfg, data + (block.vertical ? ' data-vertical' : '') + (block.part ? ' data-part' : '') + (block.iconStyle ? ` data-icon-style="${esc(block.iconStyle)}"` : '') + (block.iconColor ? ' data-icon-color' : ''), block.part, block.iconColor));
    if (block.type === 'text' && block.title?.trim()) blocks.push(textBlock(block, data));
    if (block.type === 'credentials') blocks.push(credentials(block, data));
    if (block.type === 'shape') blocks.push(`<div class="deco"${block.deco?.motion ? ` data-motion="${esc(block.deco.motion)}"` : ''} ${data}>${shapeSvg(block.deco ?? {}, block.id)}</div>`);
    if (block.type === 'youtube') blocks.push(video(block, data));
    if (block.type === 'image') blocks.push(imageBlock(block, data));
    if (block.type === 'post') blocks.push(postCard(block, data));
  }
  flush();
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${themeColorMeta(cfg.look)}
<title>${esc(cfg.profile.name)}</title>
<meta name="description" content="${esc(plain(cfg.profile.bio))}">
<meta property="og:title" content="${esc(cfg.profile.name)}"><meta property="og:description" content="${esc(plain(cfg.profile.bio))}">
${photo.startsWith('https:') ? `<meta property="og:image" content="${esc(photo)}">` : ''}
<link rel="icon" href="favicon.ico" sizes="32x32"><link rel="icon" href="favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="apple-touch-icon.png">
${fontLink([cfg.look.font, ...cfg.blocks.filter((b) => !b.hidden).map((b) => b.font)])}
<style>${css}${lookColors(cfg.look)}</style>
</head><body class="template-${cfg.look.template}${preview ? '' : ' intro'}"${typeof cfg.look.margin === 'number' ? ' data-margin' : ''} style="${esc(lookVars(cfg.look))}">
<div class="backdrop">${photoBg ? `<img src="${esc(backgroundImage)}" alt="">` : ''}</div>
<main class="page">
<button class="share glass" aria-label="Share">${icon('share', 18)}</button>
<div class="stack">${blocks.join('\n')}</div>
</main>
${preview ? '' : INTRO_SCRIPT}
${MEDIA_SCRIPT}
${FIT_SCRIPT}
${FLOAT_SCRIPT}
${preview ? PREVIEW_SCRIPT
  : `${SCHEDULE_SCRIPT}${SHARE_SCRIPT}${cfg.stats ? statsScript(cfg.stats) : ''}\n<script type="application/json" id="${CONFIG_ID}">${JSON.stringify(cfg).replace(/</g, '\\u003c')}</script>`}
</body></html>`;
}

function blockAttributes(block: PageBlock, cfg?: Config): string {
  const design = normalizeBlockDesign(block.design);
  const styles = [designStyle(design)];
  let extra = '';
  if (block.font && FONTS[block.font]) { styles.push(`--block-font:${FONTS[block.font]}`); extra += ' data-font'; }
  const scale = bounded(block.textScale, .6, 2), offset = bounded(block.offset, -80, 120);
  if (scale && scale !== 1) { styles.push(`--text-scale:${scale}`); extra += ' data-text-scale'; }
  if (offset) { styles.push(`--offset:${Math.round(offset)}px`); extra += ' data-offset'; }
  const inset = bounded(block.inset, 0, 80);
  if (inset) { styles.push(`--inset:${Math.round(inset)}px`); extra += ' data-inset'; }
  const height = bounded(block.height, 24, 900);
  if (height) { styles.push(`--h:${Math.round(height)}px`); extra += ' data-height'; }
  const dx = bounded(block.dx, -600, 600), dy = bounded(block.dy, -1200, 1200);
  if (dx || dy) { styles.push(`--dx:${Math.round(dx ?? 0)}px;--dy:${Math.round(dy ?? 0)}px`); extra += ' data-free'; }
  if (block.float) { styles.push(`--fx:${+block.float.x.toFixed(2)}%;--fy:${Math.round(block.float.y)}px;--fw:${+block.float.w.toFixed(2)}%`); extra += ' data-float'; }
  const turn = bounded(block.rotate, -180, 180);
  if (turn) { styles.push(`--rot:${Math.round(turn * 10) / 10}deg`); extra += ' data-rotate'; }
  if (block.cardStyle) extra += ` data-card="${esc(block.cardStyle)}"`;
  if (block.type === 'profile' && cfg) {
    const size = bounded(cfg.profile.photoSize, 48, 180);
    const height = bounded(cfg.profile.coverHeight, 100, 540);
    if (size) { styles.push(`--avatar-size:${size}px`); extra += ' data-avatar-custom';
    }
    if (height) { styles.push(`--cover-height:${height}px`); extra += ' data-cover-custom'; }
  }
  const tier = design ? sizeTier(design.span) : '';
  return `data-block-id="${esc(block.id)}"${design ? ` data-layout-span="${design.span}"` : ''}${tier ? ` data-size="${tier}"` : ''}${styles.some(Boolean) ? ` style="${esc(styles.filter(Boolean).join(';'))}"` : ''}${extra}`;
}

function hero(cfg: Config, photo: string): string {
  const { name } = cfg.profile;
  const initial = esc((name.trim()[0] ?? '?').toUpperCase());
  const avatarLayout = !['photo', 'studio'].includes(cfg.look.template);
  const banner = cfg.profile.showCover !== false ? safeImg(cfg.profile.cover) : '';
  const avatar = `<div class="avatar glass" data-profile-part="photo">${photo ? `<img src="${esc(photo)}" alt="${esc(name)}" style="${esc(imageFrameStyle(cfg.profile.photoFrame))}">` : initial}</div>`;
  let picture = '';
  if (avatarLayout) {
    const showBanner = cfg.profile.showCover !== false && (cfg.look.template === 'cover' || banner);
    picture = (showBanner ? `<div class="profile-cover" data-profile-part="cover">${banner ? `<img src="${esc(banner)}" alt="" style="${esc(imageFrameStyle(cfg.profile.coverFrame))}">` : ''}</div>` : '') + avatar;
  } else {
    const image = banner || photo;
    const frame = esc(imageFrameStyle(banner ? cfg.profile.coverFrame : cfg.profile.photoFrame));
    picture = image ? `<div class="hero" data-profile-part="${banner ? 'cover' : 'photo'}"><div class="hero-image-frame"><img src="${esc(image)}" alt="${esc(name)}" style="${frame}"><div class="hero-soften" aria-hidden="true"><img src="${esc(image)}" alt="" style="${frame}"></div></div></div>` : avatar;
    if (banner) picture += avatar;
  }
  return cfg.blocks.some((b) => b.type === 'name') ? picture : picture + identity(cfg);
}

/** Name and username: inside the profile, or as their own block when moved apart. */
function identity(cfg: Config): string {
  const { name, handle, nameAlign } = cfg.profile;
  return `<header class="identity" data-profile-part="name"${nameAlign ? ` data-align="${nameAlign}"` : ''}><h1>${esc(name)}</h1>${handle ? `<p class="handle">@${esc(handle.replace(/^@/, ''))}</p>` : ''}</header>`;
}

/** A short bio reads as a subtitle under the name; only longer text gets its own card. */
export const isShortBio = (text: string) => text.trim().length <= 90 && !text.includes('\n');

function bio(cfg: Config, data: string): string {
  if (isShortBio(cfg.profile.bio)) return `<p class="bio tagline"${cfg.profile.nameAlign ? ` data-align="${esc(cfg.profile.nameAlign)}"` : ''} ${data}><span class="fit">${rich(cfg.profile.bio.trim())}</span></p>`;
  return cfg.look.template === 'minimal'
    ? `<section class="bio glass" ${data}><h2>About me</h2><p>${rich(cfg.profile.bio)}</p></section>`
    : `<p class="bio glass" ${data}><span class="fit">${rich(cfg.profile.bio)}</span></p>`;
}

/** A free text item: a title, subtitle, paragraph or small label. Line breaks are kept. */
function textBlock(block: PageBlock, data: string): string {
  const style = block.textStyle ?? 'body';
  const heading = style === 'title' ? ' role="heading" aria-level="2"' : style === 'subtitle' ? ' role="heading" aria-level="3"' : '';
  return `<div class="text-block text-${style}"${heading}${block.textAlign ? ` data-align="${block.textAlign}"` : ''} ${data}><div class="fit">${richBlock(block.title!.trim())}</div></div>`;
}

/** Degrees, certificates, awards and roles: a list, small cards, or a timeline. */
function credentials(block: PageBlock, data: string): string {
  const entries = (block.entries ?? []).filter((e) => e.title.trim() || e.org.trim());
  if (!entries.length) return '';
  const variant = block.variant ?? 'list';
  const items = entries.map((e) => {
    const kind = CREDENTIAL_KINDS.find((k) => k.value === e.kind) ?? CREDENTIAL_KINDS[0];
    // The icon stays underneath the logo: if a pasted logo address stops working, the icon shows instead of a broken image.
    const badge = `<span class="cred-badge cred-${kind.value}">${icon(kind.icon, variant === 'cards' ? 22 : 20)}${safeImg(e.logo) ? `<img src="${esc(safeImg(e.logo))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>`;
    const url = safeUrl(e.url ?? '');
    const copy = `<span class="cred-copy"><b>${rich(e.title)}</b>${e.org ? `<span>${esc(e.org)}</span>` : ''}</span>`;
    const year = e.year ? `<time>${esc(e.year)}</time>` : '';
    const inner = variant === 'timeline' ? `${year}<span class="cred-dot" aria-hidden="true"></span>${badge}${copy}` : variant === 'cards' ? `${badge}${copy}${year}` : `${badge}${copy}${year}`;
    return url ? `<li><a class="cred" href="${esc(url)}" rel="noopener">${inner}</a></li>` : `<li><div class="cred">${inner}</div></li>`;
  }).join('');
  return `<section class="creds${variant === 'cards' ? '' : ' glass'}" data-variant="${variant}" ${data}>${block.title ? `<h2 class="creds-h">${esc(block.title)}</h2>` : ''}<ul>${items}</ul></section>`;
}

function highlights(cfg: Config, data: string, part?: string): string {
  const items = cfg.highlights.filter((h, i) => (h.value || h.label) && (part === undefined || String(i) === part));
  return items.length ? `<div class="stats" ${data}>${items.map((h) => `<div><b>${esc(h.value)}</b><span>${esc(h.label)}</span></div>`).join('')}</div>` : '';
}

function social(cfg: Config, data: string, part?: string, color?: string): string {
  const items = cfg.social.map((s, i) => ({ ...s, id: socialKey(s, i) })).filter((s) => safeUrl(s.url) && (part === undefined || s.id === part));
  if (!items.length) return '';
  return `<nav class="social" aria-label="Social profiles" ${data}>${items.map((s) => {
    const p = platform(s.platform);
    // Logos load black and turn white on dark pages, unless the person chose brand colors or a color of their own.
    const tint = color === 'brand' ? '' : color ? '/' + color.slice(1) : '/111111';
    const glyph = p?.slug ? `<img src="https://cdn.simpleicons.org/${p.slug}${tint}" alt="">` : icon(p?.icon ?? 'link', 22);
    return `<a class="glass" data-social-id="${esc(s.id)}" href="${esc(safeUrl(s.url))}" aria-label="${esc(p?.label ?? s.platform)}" rel="noopener"${color && color !== 'brand' ? ` style="color:${esc(color)}"` : ''}>${glyph}</a>`;
  }).join('')}</nav>`;
}

/** Consecutive image links share a grid; every item keeps its chosen position. */
const spaceBlock = (block: PageBlock) => `<div class="space" aria-hidden="true" ${blockAttributes(block)}></div>`;

function linkList(items: { link: Link | null; block: PageBlock }[], attrs: (l: Link) => string, photoBands = false): string {
  const runs: { style: string; items: typeof items }[] = [];
  for (const item of items) {
    if (!item.link) { (runs.at(-1)?.items ?? (runs[runs.push({ style: 'rows', items: [] }) - 1].items)).push(item); continue; }
    const style = photoBands && safeImg(item.link.image) ? 'tiles' : item.link.featured ? 'featured' : safeImg(item.link.image) ? 'tiles' : 'rows';
    const last = runs.at(-1);
    if (last && last.style === style) last.items.push(item);
    else runs.push({ style, items: [item] });
  }
  return runs.map((run) => `<div class="${run.style === 'tiles' ? 'tiles' : 'rows'}">${run.items.map(({ link: l, block }) => {
    if (!l) return spaceBlock(block);
    const data = blockAttributes(block);
    const shape = normalizeButtonShape(l.buttonShape);
    const fill = normalizeButtonStyle(l.buttonStyle);
    const shapeAttr = (shape ? ` data-button-shape="${shape}"` : '') + (fill ? ` data-button-style="${fill}"` : '');
    if (run.style === 'featured') return `<a class="primary" ${attrs(l)} ${data}${shapeAttr}><span>${esc(l.title)}</span></a>`;
    if (run.style === 'tiles') return `<a class="tile" ${attrs(l)} ${data}${tileAttributes(l.tile)} aria-label="${esc(l.title)}"><div class="tile-media"><img src="${esc(safeImg(l.image))}" alt="" loading="lazy" style="${esc(imageFrameStyle(l.imageFrame))}"></div><span${tileTextStyle(l.tile)}>${esc(l.title)}</span></a>`;
    return `<a class="row-link glass" ${attrs(l)} ${data}${shapeAttr}><span>${esc(l.title)}</span>${icon('arrow', 18)}</a>`;
  }).join('')}</div>`).join('');
}

function video(block: PageBlock, data: string): string {
  const parsed = youtubeVideo(block.url ?? '');
  if (!parsed) return '';
  const title = block.title || 'Watch my latest video';
  return `<figure class="media-card video-card glass" ${data}>
<div class="video-player" style="--video-aspect:${videoRatio(block.videoAspect)}"><button class="video-poster" type="button" data-youtube="${parsed.id}" data-start="${parsed.start}" data-title="${esc(title)}" aria-label="Play ${esc(title)}">
<img src="${esc(youtubeCover(block.url ?? '', block.image))}" alt="" loading="lazy" style="${esc(imageFrameStyle(block.imageFrame))}"><span class="play-button">${icon('play', 28)}</span><span class="video-label">Play video</span>
</button></div>
<figcaption class="video-copy"><span class="media-kicker">YouTube video</span><h2>${esc(title)}</h2>
<a class="watch-youtube" href="https://www.youtube.com/watch?v=${parsed.id}${parsed.start ? '&amp;t=' + parsed.start : ''}" target="_blank" rel="noopener">Watch on YouTube ${icon('arrow', 12)}</a></figcaption>
</figure>`;
}

function postCard(block: PageBlock, data: string): string {
  const url = postUrl(block.url ?? '');
  if (!url) return '';
  const cover = safeImg(block.image);
  const source = postSource(url);
  return `<a class="post-card glass" href="${esc(url)}" rel="noopener" ${data}>
${cover ? `<div class="post-cover"><img src="${esc(cover)}" alt="" loading="lazy" style="${esc(imageFrameStyle(block.imageFrame))}"></div>` : ''}
<div class="post-copy"><span class="media-kicker">${esc(source)}</span><h2>${esc(block.title || 'Read my latest post')}</h2>
${block.description ? `<p>${esc(block.description)}</p>` : ''}
<span class="post-open">Read post ${icon('arrow', 15)}</span></div></a>`;
}

function imageBlock(block: PageBlock, data: string): string {
  const image = safeImg(block.image);
  if (!image) return '';
  const picture = `<div class="standalone-frame"><img class="standalone-image" src="${esc(image)}" alt="${esc(block.title)}" loading="lazy" style="${esc(imageFrameStyle(block.imageFrame))}"></div>`;
  const url = safeUrl(block.url ?? '');
  return `<figure class="media-card image-card glass" ${data}>${url ? `<a href="${esc(url)}" rel="noopener">${picture}</a>` : picture}${block.title ? `<figcaption>${esc(block.title)}</figcaption>` : ''}</figure>`;
}

const MEDIA_SCRIPT = `<script>
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-youtube]');
  if (!button) return;
  const frame = document.createElement('iframe');
  frame.src = 'https://www.youtube-nocookie.com/embed/' + button.dataset.youtube + '?autoplay=1&playsinline=1&start=' + button.dataset.start;
  frame.title = button.dataset.title;
  frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  frame.allowFullscreen = true;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  button.replaceWith(frame);
});
</script>`;

/** Text in an item that was stretched to a set height shrinks until it fits inside (never grows past its chosen size).
 * The layout editor calls window.yourlinkiFit() while stretching. */
const FIT_SCRIPT = `<script>
window.yourlinkiFit = () => document.querySelectorAll('.stack [data-height]').forEach((el) => {
  el.style.removeProperty('--fit');
  for (let s = 1; el.scrollHeight > el.clientHeight + 1 && s > .4; ) { s = Math.round((s - .05) * 100) / 100; el.style.setProperty('--fit', s); }
});
window.yourlinkiFit();
addEventListener('load', window.yourlinkiFit);
addEventListener('resize', window.yourlinkiFit);
</script>`;

/** Freely placed items sit outside the layout, so the page is made tall enough to show the lowest one. */
const FLOAT_SCRIPT = `<script>
window.yourlinkiFloat = () => {
  const stack = document.querySelector('.stack'); if (!stack) return;
  stack.style.minHeight = '';
  let bottom = 0;
  stack.querySelectorAll('[data-float]').forEach((el) => { bottom = Math.max(bottom, el.offsetTop + el.offsetHeight); });
  if (bottom) stack.style.minHeight = bottom + 24 + 'px';
};
window.yourlinkiFloat();
addEventListener('load', window.yourlinkiFloat);
addEventListener('resize', window.yourlinkiFloat);
</script>`;

/** In the editor preview, links open in a new tab (the editor stays put); while editing the layout, a tap selects instead. */
const PREVIEW_SCRIPT = `<script>
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href]');
  if (!link) return;
  event.preventDefault();
  const url = link.getAttribute('href');
  if (!document.documentElement.classList.contains('canvas-editing') && url && url !== '#') window.open(url, '_blank', 'noopener');
});
</script>`;

/** Items appear one after another when the page opens (the order of the page, top to bottom). */
const INTRO_SCRIPT = `<script>
document.querySelectorAll('.stack [data-block-id]').forEach((el, i) => el.style.setProperty('--i', Math.min(i, 10)));
</script>`;

/** Where the published page keeps its config for the editor. */
export const CONFIG_ID = 'yourlinki-config';

/** Scheduled links ship with the page and are removed outside their window, on the visitor's clock. */
const SCHEDULE_SCRIPT = `<script>
document.querySelectorAll('[data-show-from],[data-show-until]').forEach((el) => {
  const now = Date.now();
  if (now < Date.parse(el.dataset.showFrom || '') || now >= Date.parse(el.dataset.showUntil || '')) el.remove();
});
</script>`;

const SHARE_SCRIPT = `<script>
document.querySelector('.share').addEventListener('click', async () => {
  const url = location.href;
  try {
    if (navigator.share) return await navigator.share({ title: document.title, url });
    await navigator.clipboard.writeText(url);
    const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: 'Link copied' });
    document.body.append(t); setTimeout(() => t.remove(), 1800);
  } catch {}
});
</script>`;

/** Only when the creator connected their own stats worker: one anonymous ping per visit and per tap, no cookies.
 * Links stay direct. The creator's own browser (it opened the editor) is skipped. `?src=story` on the link labels the source. */
const statsScript = (endpoint: string) => `<script>
(() => {
  try { if (localStorage.getItem('yourlinki-owner')) return; } catch {}
  const url = ${JSON.stringify(endpoint + '/hit').replace(/</g, '\\u003c')};
  const s = new URLSearchParams(location.search).get('src') || '';
  const r = document.referrer;
  const send = (l) => { try { navigator.sendBeacon(url, JSON.stringify({ l, r, s })); } catch {} };
  send();
  document.addEventListener('click', (event) => {
    const el = event.target.closest('a[href], [data-youtube]');
    if (!el) return;
    const social = el.dataset.socialId;
    const block = el.closest('[data-block-id]');
    const id = social ? 'social:' + social : el.dataset.youtube ? 'play:' + (block ? block.dataset.blockId : '') : block && block.dataset.blockId;
    if (id) send(id);
  }, true);
})();
</script>`;
