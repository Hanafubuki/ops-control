import { describe, expect, it } from 'vitest';
import { renderMarkdown, safeHref } from '../app/src/lib/components/ticket/markdown';

describe('ticket markdown', () => {
	it('renders headings, nested lists, emphasis and inline code', () => {
		const html = renderMarkdown('## Background\n- one with `code` and **bold**\n  - nested *item*\n\n1. first\n2. second\n\n### Third level');
		expect(html).toContain('<h2>Background</h2>');
		expect(html).toMatch(/<ul>\s*<li>one with <code>code<\/code> and <strong>bold<\/strong>\s*<ul>\s*<li>nested <em>item<\/em><\/li>/);
		expect(html).toMatch(/<ol>\s*<li>first<\/li>\s*<li>second<\/li>\s*<\/ol>/);
		expect(html).toContain('<h3>Third level</h3>');
	});

	it('wraps fenced code in a labelled block with a copy button and keeps its text escaped', () => {
		const html = renderMarkdown("```bash\nls /datashare/sftp | head -3\necho \"<a home>\"\n```");
		expect(html).toContain('<span class="code-lang">bash</span>');
		expect(html).toContain('data-copy-code');
		expect(html).toContain('<code class="language-bash">ls /datashare/sftp | head -3\necho &quot;&lt;a home&gt;&quot;</code>');
	});

	it('labels a code block without a language as text', () => {
		expect(renderMarkdown('```\nplain\n```')).toContain('<span class="code-lang">text</span>');
	});

	it('renders GitHub tables, task lists, strikethrough, quotes and rules', () => {
		const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n- [ ] open\n\n~~old~~\n\n> quoted\n\n---');
		expect(html).toContain('<table>');
		expect(html).toContain('<th>a</th>');
		expect(html).toContain('<td>2</td>');
		expect(html).toMatch(/<input checked="" disabled="" type="checkbox"[^>]*>/);
		expect(html).toContain('<del>old</del>');
		expect(html).toContain('<blockquote>');
		expect(html).toContain('<hr>');
	});

	it('keeps single line breaks, like GitHub issues', () => {
		expect(renderMarkdown('first line\nsecond line')).toBe('<p>first line<br>second line</p>\n');
	});

	it('shows source HTML blocks as text', () => {
		const html = renderMarkdown('<script>alert(1)</script>\n\n<div onclick="x()">hi</div>');
		expect(html).not.toContain('<script');
		expect(html).not.toContain('<div');
		expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
	});

	it('opens external links in a new tab and keeps relative links in place', () => {
		expect(renderMarkdown('[docs](https://example.test/a?b=1&c=2)')).toContain('<a href="https://example.test/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">docs</a>');
		expect(renderMarkdown('[here](#notes)')).toContain('<a href="#notes">here</a>');
		expect(renderMarkdown('see https://example.test')).toContain('<a href="https://example.test" target="_blank"');
	});

	it('drops unsafe link and image targets, keeping their text', () => {
		const tabbed = renderMarkdown('[x](<java\tscript:alert(1)>)');
		expect(tabbed).not.toContain('href');
		expect(tabbed).toContain('x');
		expect(renderMarkdown('[y](vbscript:msgbox)')).not.toContain('href');
		const image = renderMarkdown('![shot](data:image/png;base64,AAAA)');
		expect(image).not.toContain('<img');
		expect(image).toContain('shot');
		expect(renderMarkdown('![ok](https://example.test/a.png)')).toContain('<img src="https://example.test/a.png" alt="ok" loading="lazy">');
	});

	it('judges a link scheme the way a browser reads it', () => {
		expect(safeHref('https://example.test')).toBe('https://example.test');
		expect(safeHref('mailto:a@example.test')).toBe('mailto:a@example.test');
		expect(safeHref('/api/x')).toBe('/api/x');
		expect(safeHref('JaVaScRiPt:alert(1)')).toBeNull();
		expect(safeHref(' \u0001javascript:alert(1)')).toBeNull();
		expect(safeHref('java\nscript:alert(1)')).toBeNull();
		expect(safeHref('')).toBeNull();
	});

	it('renders nothing for an empty description', () => {
		expect(renderMarkdown(undefined)).toBe('');
		expect(renderMarkdown('')).toBe('');
	});
});
