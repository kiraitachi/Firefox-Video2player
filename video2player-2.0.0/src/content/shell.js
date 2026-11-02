const MAX_Z_INDEX = '2147483647';

// Site stylesheets can match bare element selectors, so the properties that
// decide whether our UI exists at all are pinned as !important inline.
const PINNED_HOST_STYLE = {
  position: 'fixed',
  margin: '0',
  padding: '0',
  border: '0',
  display: 'block',
  visibility: 'visible',
  opacity: '1',
  transform: 'none',
  filter: 'none',
  'z-index': MAX_Z_INDEX,
  'color-scheme': 'dark',
};

export const pinStyle = (element, styles) => {
  for (const name of Object.keys(styles)) {
    element.style.setProperty(name, styles[name], 'important');
  }
};

export const createShadowHost = (css, extraHostStyle) => {
  const host = document.createElement('div');
  host.dataset.video2player = '';
  pinStyle(host, PINNED_HOST_STYLE);
  if (extraHostStyle) pinStyle(host, extraHostStyle);

  // A <style> node rather than adoptedStyleSheets: a constructed stylesheet
  // belongs to the content script's global and does not reliably apply to a
  // shadow root living in the page's document.
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = css;
  shadow.append(style);

  return { host, shadow };
};

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set([
  'svg',
  'path',
  'circle',
  'rect',
  'g',
  'line',
  'text',
]);

// Built node by node rather than from markup: no innerHTML anywhere in the
// extension, so page-derived text can never be parsed as HTML.
export const el = (tag, attributes, children) => {
  const node = SVG_TAGS.has(tag)
    ? document.createElementNS(SVG_NAMESPACE, tag)
    : document.createElement(tag);

  if (attributes) {
    for (const name of Object.keys(attributes)) {
      if (name === 'text') node.textContent = attributes[name];
      else node.setAttribute(name, attributes[name]);
    }
  }

  if (children) node.append(...children);
  return node;
};
