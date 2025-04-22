import createDOMPurify from "dompurify";

const DOMPurify = createDOMPurify(window);

// Configure DOMPurify to force links to open in new tab
DOMPurify.addHook("afterSanitizeAttributes", function (node) {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

/**
 * Sanitizes HTML content and ensures links open in new tabs
 * @param {string} content - The HTML content to sanitize
 * @returns {string} - The sanitized HTML content
 */
export function sanitizeHtml(content) {
  return DOMPurify.sanitize(content);
}
