/* Safe rendering band: between the bottom of the fixed <header> and the top
   of the lowest fixed bottom element (footer or #input-bar). Snapping the
   character grid to this band prevents half-char clipping at either boundary.
   Falls back to full viewport if nothing matched. */

export function measureSafeArea(): { top: number; bottom: number } {
  const header = document.querySelector('header');
  const top = header ? Math.ceil(header.getBoundingClientRect().bottom) : 0;
  let bottom = window.innerHeight;
  const bottomEls = [
    document.querySelector('footer.hub-footer'),
    document.getElementById('input-bar'),
  ];
  for (const el of bottomEls) {
    if (!el) continue;
    const t = Math.floor(el.getBoundingClientRect().top);
    if (t < bottom) bottom = t;
  }
  return { top, bottom };
}
