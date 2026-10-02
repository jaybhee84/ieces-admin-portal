// Whether the screen currently showing has anything to print. A printable screen
// marks its document with data-print-root; the page's own print CSS decides what
// is shown during the print pass.
export const PRINT_ROOT_SELECTOR = "[data-print-root]";

export function hasPrintableContent(doc = document) {
  const root = doc.querySelector(PRINT_ROOT_SELECTOR);
  return Boolean(root && root.childElementCount > 0);
}
