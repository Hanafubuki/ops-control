import { Marked, type RendererObject } from 'marked';

function escapeHtml(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

const allowedSchemes = new Set(['http', 'https', 'mailto']);

// Browsers drop tabs, newlines and other control characters from a URL before reading its scheme,
// so "java\tscript:" must be judged with them removed.
export function safeHref(value: string) {
	const href = value.replace(/[\u0000- \u007f-\u009f]/g, '');
	if (!href) return null;
	const scheme = href.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
	if (scheme) return allowedSchemes.has(scheme) ? href : null;
	return /^[^/?#]*:/.test(href) ? null : href;
}

const renderer: RendererObject = {
	// Source HTML is shown as text, never rendered.
	html({ text }) {
		return escapeHtml(text);
	},
	link({ href, title, tokens }) {
		const label = this.parser.parseInline(tokens);
		const safe = safeHref(href);
		if (!safe) return label;
		const titleAttribute = title ? ` title="${escapeHtml(title)}"` : '';
		const external = /^(https?:)?\/\//i.test(safe) ? ' target="_blank" rel="noopener noreferrer"' : '';
		return `<a href="${escapeHtml(safe)}"${titleAttribute}${external}>${label}</a>`;
	},
	image({ href, title, text }) {
		const safe = safeHref(href);
		if (!safe || /^mailto:/i.test(safe)) return escapeHtml(text);
		const titleAttribute = title ? ` title="${escapeHtml(title)}"` : '';
		return `<img src="${escapeHtml(safe)}" alt="${escapeHtml(text)}"${titleAttribute} loading="lazy">`;
	},
	code({ text, lang }) {
		const language = (lang ?? '').match(/^\S*/)?.[0] ?? '';
		const languageClass = language ? ` class="language-${escapeHtml(language)}"` : '';
		return `<div class="code-block"><div class="code-head"><span class="code-lang">${escapeHtml(language || 'text')}</span><button type="button" class="code-copy" data-copy-code>copy</button></div><pre><code${languageClass}>${escapeHtml(text.replace(/\n$/, ''))}</code></pre></div>`;
	}
};

// GitHub-flavored markdown; single newlines stay line breaks, as in GitHub issues and comments.
const markdown = new Marked({ gfm: true, breaks: true, renderer });

export function renderMarkdown(value: string | undefined) {
	return markdown.parse(String(value ?? ''), { async: false });
}

function flash(button: HTMLElement, label: string) {
	button.textContent = label;
	button.dataset.state = label;
	setTimeout(() => {
		button.textContent = 'copy';
		delete button.dataset.state;
	}, 1400);
}

function copyWithSelection(text: string) {
	const field = document.createElement('textarea');
	field.value = text;
	field.setAttribute('readonly', '');
	field.style.position = 'fixed';
	field.style.opacity = '0';
	document.body.append(field);
	field.select();
	const copied = document.execCommand('copy');
	field.remove();
	return copied;
}

// Click handler for rendered markdown: copies a code block when its copy button is pressed.
// Returns true when the click was a copy, so callers can skip their own click behavior.
export function copyCodeFromClick(event: MouseEvent) {
	const button = (event.target as Element | null)?.closest?.('[data-copy-code]');
	if (!(button instanceof HTMLElement)) return false;
	event.preventDefault();
	event.stopPropagation();
	const code = button.closest('.code-block')?.querySelector('pre code')?.textContent ?? '';
	if (navigator.clipboard?.writeText) {
		navigator.clipboard.writeText(code).then(() => flash(button, 'copied'), () => flash(button, copyWithSelection(code) ? 'copied' : 'failed'));
	} else flash(button, copyWithSelection(code) ? 'copied' : 'failed');
	return true;
}

// Svelte action for an element holding rendered markdown: wires up the code copy buttons.
export function codeCopy(node: HTMLElement) {
	node.addEventListener('click', copyCodeFromClick);
	return { destroy: () => node.removeEventListener('click', copyCodeFromClick) };
}
