import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Markdown sanitizer helper using marked and dompurify

marked.setOptions({ breaks: true, gfm: true });

export const renderMarkdownToSafeHTML = (md) => {
  if (!md) return '';
  const raw = marked.parse(md);
  return DOMPurify.sanitize(raw);
};
