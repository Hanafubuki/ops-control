<script lang="ts">
	import type { BoardState } from '../../state/board.svelte';
	import type { Ticket } from '../../types';
	import { codeCopy, renderMarkdown } from './markdown';
	import Button from '../ui/Button.svelte';

	let { board, ticket }: { board: BoardState; ticket: Ticket } = $props();
	let body = $state('');
	let editingId = $state<string | null>(null);
	let editBody = $state('');
	let savingEdit = $state(false);
	let comments = $derived((ticket.comments as { id?: string; by?: string; at?: string; editedAt?: string; body?: string }[] | undefined) ?? []);

	async function post() { if (!body.trim()) return; await board.addComment(ticket, body.trim()); body = ''; }

	function startEdit(comment: { id?: string; body?: string }) {
		if (!comment.id) return;
		editingId = comment.id;
		editBody = comment.body ?? '';
	}

	function cancelEdit() { editingId = null; editBody = ''; }

	async function saveEdit() {
		if (!editingId || !editBody.trim() || savingEdit) return;
		savingEdit = true;
		try { await board.editComment(ticket, editingId, editBody.trim()); cancelEdit(); }
		finally { savingEdit = false; }
	}

	async function remove(comment: { id?: string }) {
		if (!comment.id || !confirm('Delete this comment?')) return;
		await board.deleteComment(ticket, comment.id);
		if (editingId === comment.id) cancelEdit();
	}

	// Escape cancels only the comment edit, not the whole dialog; Ctrl/Cmd+Enter saves.
	function editKeys(event: KeyboardEvent) {
		if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelEdit(); }
		if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); saveEdit(); }
	}

	function focusField(node: HTMLTextAreaElement) { node.focus(); node.setSelectionRange(node.value.length, node.value.length); }
</script>

<section class="comments">
	<h3>Comments</h3>
	{#if comments.length}
		<div class="thread">
			{#each comments as comment, index (comment.id ?? `${comment.at}-${index}`)}
				<article>
					<header><strong>{comment.by ?? 'Unknown'}</strong><span class="meta"><time title={comment.editedAt ? `Edited ${new Date(comment.editedAt).toLocaleString()}` : undefined}>{comment.at ? new Date(comment.at).toLocaleString() : ''}{comment.editedAt ? ' · edited' : ''}</time>{#if comment.id && editingId !== comment.id}<button class="edit-comment" type="button" aria-label="Edit comment" onclick={() => startEdit(comment)}>✎ Edit</button><button class="edit-comment delete" type="button" aria-label="Delete comment" onclick={() => remove(comment)}>✕ Delete</button>{/if}</span></header>
					{#if editingId === comment.id}
						<textarea class="edit" bind:value={editBody} aria-label="Edit comment" use:focusField onkeydown={editKeys}></textarea>
						<div class="actions"><Button variant="primary" disabled={!editBody.trim() || savingEdit} onclick={saveEdit}>Save</Button><Button variant="quiet" onclick={cancelEdit}>Cancel</Button></div>
					{:else}
						<div class="markdown" use:codeCopy>{@html renderMarkdown(comment.body)}</div>
					{/if}
				</article>
			{/each}
		</div>
	{:else}<p class="empty">No comments yet.</p>{/if}
	<textarea bind:value={body} placeholder="Add a comment" aria-label="Add a comment"></textarea>
	<div class="actions"><Button variant="primary" disabled={!body.trim()} onclick={post}>Add comment</Button></div>
</section>

<style>
	.comments { margin:0; } h3 { margin:0 0 .55rem; font-size:.82rem; letter-spacing:.06em; text-transform:uppercase; color:var(--text-muted); } .thread { display:grid; gap:.5rem; max-height:32rem; overflow:auto; scrollbar-width:thin; scrollbar-color:var(--border) transparent; } article { min-width:0; padding:.65rem; border:1px solid var(--border); border-radius:var(--radius); background:var(--surface-muted); } article header { display:flex; justify-content:space-between; align-items:center; gap:.5rem; margin-bottom:.35rem; font-size:.74rem; color:var(--text-muted); } article header strong { color:var(--accent); } .meta { display:flex; align-items:center; gap:.45rem; } textarea { box-sizing:border-box; width:100%; min-height:4rem; margin-top:.6rem; padding:.55rem; border:var(--border-width) solid var(--border); border-radius:var(--radius); background:var(--surface-muted); color:var(--text); font:inherit; } textarea.edit { min-height:7rem; margin-top:0; background:var(--surface-card); resize:vertical; } textarea:focus { border-color:var(--accent); } .actions { display:flex; gap:.4rem; margin-top:.45rem; } .empty { color:var(--text-muted); font-size:.84rem; } .markdown { font-size:.82rem; }
	.edit-comment { min-height:0; padding:.1rem .45rem; border:1px solid var(--border); border-radius:var(--radius); background:transparent; color:var(--accent); font-size:.7rem; font-weight:700; cursor:pointer; } .edit-comment:hover { border-color:var(--accent); background:var(--accent-soft); } .edit-comment.delete { color:var(--danger, #e5484d); } .edit-comment.delete:hover { border-color:var(--danger, #e5484d); background:transparent; }
</style>
