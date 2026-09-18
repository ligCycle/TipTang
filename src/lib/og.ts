// Social-card image shared by every route that sets its own `openGraph`.
//
// Next's file-based image (src/app/opengraph-image.tsx) only survives on
// routes that never touch `openGraph`; the moment a layout or page defines
// that object, the inherited `images` entry is dropped (metadata objects are
// shallow-merged per segment). Creator pages had lost their preview image
// this way. Spreading `ogImages()` into both `openGraph` and `twitter` keeps
// the card intact everywhere. The route still exists — this just points at
// it without the per-build cache-busting query.
export function ogImages(alt: string) {
  return [{ url: "/opengraph-image", width: 1200, height: 630, alt }];
}
