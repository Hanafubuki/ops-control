<script lang="ts">
	import { onMount } from 'svelte';
	import type { BoardState } from '../../state/board.svelte';
	import type { Ticket } from '../../types';
	import StoryPicker from './StoryPicker.svelte';
	import AttachmentPicker, { type PendingImage } from './AttachmentPicker.svelte';
	import CommentThread from './CommentThread.svelte';
	import LinkEditor from './LinkEditor.svelte';
	import ReminderEditor from './ReminderEditor.svelte';
	import { codeCopy, renderMarkdown } from './markdown';
	import Button from '../ui/Button.svelte';
	import Dialog from '../ui/Dialog.svelte';
	import Select, { type SelectOption } from '../ui/Select.svelte';

	let { state: board }: { state: BoardState } = $props();
	let title = $state('');
	let details = $state('');
	let priority = $state('normal');
	let status = $state('todo');
	let assignee = $state('');
	let category = $state('');
	let storyId = $state('');
	let labels = $state('');
	let files = $state('');
	let project = $state('');
	let unclassified = $state(false);
	let pendingImages = $state<PendingImage[]>([]);
	let detailsEditing = $state(false);
	let saving = $state(false);
	let editingTicket = $derived(board.openDialog && board.openDialog !== 'create' ? board.raw?.tickets.find((ticket) => ticket.id === board.openDialog) ?? null : null);
	let createProject = $derived(board.selectedProject === 'all' ? (project || board.raw?.projects[0]?.slug || '') : board.selectedProject);
	let categories = $derived(board.raw?.categories ?? []);
	let categoryValue = $derived.by(() => {
		const current = editingTicket?.category;
		return typeof current === 'object' && current ? String((current as { id?: string }).id ?? '') : String(current ?? category);
	});
	let priorityOptions: SelectOption[] = [
		{ value: 'urgent', label: 'Urgent' }, { value: 'high', label: 'High' }, { value: 'normal', label: 'Normal' }, { value: 'low', label: 'Low' }
	];
	let statusOptions: SelectOption[] = [
		{ value: 'todo', label: 'To do' }, { value: 'doing', label: 'Doing' }, { value: 'done', label: 'Done' }
	];
	let assigneeOptions: SelectOption[] = [{ value: '', label: 'Unassigned' }, { value: 'you', label: 'Me' }];
	let projectOptions = $derived((board.raw?.projects ?? []).map((item) => ({ value: item.slug, label: item.name })));
	let categoryOptions = $derived([{ value: '', label: 'Choose a category' }, ...categories.map((item) => ({ value: item.id, label: item.name }))]);

	function close() {
		detailsEditing = false;
		board.openDialog = null;
	}

	function focusField(node: HTMLTextAreaElement) {
		node.focus();
	}

	function split(value: string) {
		return value.split(',').map((entry) => entry.trim()).filter(Boolean);
	}

	async function autosave(field: string, value: unknown) {
		if (!editingTicket || saving) return;
		if (field === 'title' && !String(value).trim()) return;
		saving = true;
		try { await board.autosaveTicket(editingTicket, { [field]: value }); }
		finally { saving = false; }
	}

	async function create() {
		if (!title.trim()) {
			board.toast('A title is required.');
			return;
		}
		if (!category && !unclassified) {
			board.toast('Choose a category or leave the ticket unclassified.');
			return;
		}
		if (!createProject) {
			board.toast('Choose a board first.');
			return;
		}
		saving = true;
		try {
			await board.createTicket({ project: createProject, title: title.trim(), description: details, priority, status, assignee: assignee || undefined, category: category || undefined, storyId: storyId || undefined, labels: split(labels), files: split(files), imagesData: pendingImages });
			title = ''; details = ''; priority = 'normal'; status = 'todo'; assignee = ''; category = ''; storyId = ''; labels = ''; files = ''; project = ''; unclassified = false; pendingImages = [];
			close();
		} finally { saving = false; }
	}

	async function assignStory(ticket: Ticket, nextStoryId: string) {
		await board.patchTicket(ticket, { storyId: nextStoryId || null });
	}

	function updateField(field: 'priority' | 'status' | 'assignee' | 'category', value: string) {
		if (editingTicket) return board.patchTicket(editingTicket, { [field]: value || null });
		if (field === 'priority') priority = value;
		if (field === 'status') status = value;
		if (field === 'assignee') assignee = value;
		if (field === 'category') category = value;
	}

	onMount(() => {
		board.setDialogSaveAction(async () => {
			if (!board.openDialog) return;
			if (editingTicket) {
				close();
				return;
			}
			await create();
		});
		return () => board.setDialogSaveAction(null);
	});
</script>

<Dialog class="ticket-dialog" open={board.openDialog === 'create' || Boolean(editingTicket)} wide label={editingTicket ? `Edit ${editingTicket.ref}` : 'New ticket'} onclose={close}>
	{#if board.openDialog === 'create' || editingTicket}
		<div class="dialog-content" data-tour="ticket-dialog">
			<header class="dialog-header"><div><h2>{editingTicket ? editingTicket.ref : 'New ticket'}</h2><small>{saving ? 'Saving…' : editingTicket?.updatedAt ? `Updated ${new Date(editingTicket.updatedAt).toLocaleString()}` : 'Fill in the ticket details.'}</small></div><Button variant="quiet" onclick={close}>Close</Button></header>
			<div class="main-grid" class:single={!editingTicket}>
				<div class="fields">
					<label><span>Title</span><input aria-label="Title" value={editingTicket?.title ?? title} onblur={(event) => autosave('title', event.currentTarget.value)} oninput={(event) => { if (!editingTicket) title = event.currentTarget.value; }} /></label>
					<div class="details">
						<div class="details-head"><span>Details</span>{#if editingTicket && !detailsEditing}<button class="edit-details" type="button" onclick={() => detailsEditing = true}>✎ Edit</button>{:else if editingTicket}<small>markdown · saves when you click outside</small>{/if}</div>
						{#if editingTicket && !detailsEditing}
							{#if editingTicket.description}<div class="description markdown" use:codeCopy>{@html renderMarkdown(editingTicket.description)}</div>{:else}<button class="description empty" type="button" onclick={() => detailsEditing = true}>Add details…</button>{/if}
						{:else if editingTicket}
							<textarea aria-label="Details" value={editingTicket.description ?? ''} placeholder="Details (markdown)" use:focusField onblur={(event) => { detailsEditing = false; autosave('description', event.currentTarget.value); }}></textarea>
						{:else}
							<textarea aria-label="Details" value={details} placeholder="Details (markdown)" oninput={(event) => { details = event.currentTarget.value; }}></textarea>
						{/if}
					</div>
					<div class="three"><label><span>Priority</span><Select label="Priority" value={editingTicket?.priority ?? priority} options={priorityOptions} onchange={(value) => updateField('priority', value)} /></label><label><span>Status</span><Select label="Status" value={editingTicket?.status ?? status} options={statusOptions} onchange={(value) => updateField('status', value)} /></label><label><span>Assignee</span><Select label="Assignee" value={editingTicket?.assignee === 'you' ? 'you' : assignee} options={assigneeOptions} onchange={(value) => updateField('assignee', value)} /></label></div>
					{#if !editingTicket && board.selectedProject === 'all'}<label><span>Board</span><Select label="Board" bind:value={project} options={projectOptions} /></label>{/if}
					<label><span>Category</span><Select label="Category" value={categoryValue} options={categoryOptions} onchange={(value) => updateField('category', value)} /></label>
					{#if !editingTicket}<label class="check"><input type="checkbox" bind:checked={unclassified} /> Leave unclassified</label>{/if}
					<StoryPicker board={board} project={editingTicket ? String(editingTicket.projectSlug ?? editingTicket.project) : createProject || null} value={editingTicket ? String(editingTicket.storyId ?? '') : storyId} onchange={(nextStoryId) => { if (editingTicket) return assignStory(editingTicket, nextStoryId); storyId = nextStoryId; }} />
					<label><span>Labels</span><input aria-label="Labels" value={editingTicket?.labels?.join(', ') ?? labels} onblur={(event) => autosave('labels', split(event.currentTarget.value))} oninput={(event) => { if (!editingTicket) labels = event.currentTarget.value; }} /></label>
					<label><span>Affected files</span><input aria-label="Affected files" value={(editingTicket?.files as string[] | undefined)?.join(', ') ?? files} onblur={(event) => autosave('files', split(event.currentTarget.value))} oninput={(event) => { if (!editingTicket) files = event.currentTarget.value; }} /></label>
					<AttachmentPicker board={board} ticket={editingTicket ?? undefined} bind:pending={pendingImages} />
				</div>
				{#if editingTicket}<aside><ReminderEditor board={board} ticket={editingTicket} /><LinkEditor board={board} ticket={editingTicket} /><CommentThread board={board} ticket={editingTicket} /></aside>{/if}
			</div>
			{#if editingTicket}<footer class="editor-actions"><Button variant="danger" onclick={() => { board.deleteTicket(editingTicket); close(); }}>Delete ticket</Button><Button onclick={() => { board.archiveTicket(editingTicket); close(); }}>Archive ticket</Button></footer>{:else}<footer><Button onclick={close}>Cancel</Button><Button variant="primary" disabled={saving} onclick={create}>Create ticket</Button></footer>{/if}
		</div>
	{/if}
</Dialog>

<style>
	.dialog-content { display:grid; grid-template-rows:auto minmax(0, 1fr) auto; min-block-size:0; max-block-size:inherit; overflow:hidden; } .dialog-header { display:flex; justify-content:space-between; gap:1rem; align-items:start; padding:1rem 1.25rem; border-bottom:var(--border-width) solid var(--border); } h2 { margin:0; color:var(--accent); font-family:var(--font-serif); font-size:1.2rem; letter-spacing:.04em; line-height:1.1; } small { color:var(--text-muted); }
	/* Two columns that scroll on their own: the ticket on the left, reminder, links and comments on the right. */
	.main-grid { display:grid; grid-template-columns:minmax(0, 1fr) minmax(22rem, 28rem); min-block-size:0; overflow:hidden; margin:0; } .main-grid.single { grid-template-columns:minmax(0, 1fr); overflow:auto; }
	.fields { display:grid; align-content:start; gap:.9rem; min-width:0; min-block-size:0; overflow:auto; padding:1.25rem; } label { display:grid; grid-template-columns:minmax(0, 1fr); gap:.3rem; min-width:0; } label > span, .details-head > span { color:var(--text-muted); font-size:.74rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
	input, textarea { box-sizing:border-box; width:100%; padding:.55rem; border:var(--border-width) solid var(--border); border-radius:var(--radius); background:var(--surface-muted); color:var(--text); } input:focus, textarea:focus { border-color:var(--accent); } textarea { min-height:10rem; resize:vertical; font:inherit; line-height:1.5; } .details textarea { min-height:clamp(14rem, 45vh, 32rem); }
	.details { display:grid; grid-template-columns:minmax(0, 1fr); gap:.3rem; min-width:0; } .details-head { display:flex; align-items:center; justify-content:space-between; gap:.75rem; min-height:1.6rem; } .details-head small { font-size:.72rem; } .edit-details { min-height:0; padding:.2rem .6rem; border:1px solid var(--border); border-radius:var(--radius); background:transparent; color:var(--accent); font-size:.76rem; font-weight:700; cursor:pointer; } .edit-details:hover { border-color:var(--accent); background:var(--accent-soft); }
	.description { min-width:0; min-height:6rem; padding:1rem 1.15rem; border:var(--border-width) solid var(--border); border-radius:var(--radius); background:var(--surface-muted); } .description.empty { color:var(--text-muted); text-align:left; cursor:text; } .description.empty:hover { border-color:var(--accent); }
	.three { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:.5rem; } .check { display:flex; align-items:center; gap:.5rem; } .check input { width:auto; }
	aside { display:grid; align-content:start; gap:1.4rem; min-width:0; min-block-size:0; overflow:auto; padding:1.5rem 1.25rem 1.25rem; border-left:var(--border-width) solid var(--border); }
	/* glowup boxes: the section title sits in the top border. */
	aside :global(section) { position:relative; padding:1.05rem .85rem .85rem; border:var(--border-width) solid var(--border); border-radius:var(--radius); background:transparent; } aside :global(section > h3) { position:absolute; top:-.72em; left:.6rem; margin:0; padding:0 .45rem; background:var(--surface-card); color:var(--text); font-size:.74rem; font-weight:800; letter-spacing:.1em; line-height:1.4; text-transform:uppercase; }
	footer { display:flex; justify-content:end; gap:.5rem; margin:0; padding:1rem 1.25rem; border-top:var(--border-width) solid var(--border); background:var(--surface-card); } footer.editor-actions { justify-content:space-between; }
	@media (max-width:880px) { .main-grid { grid-template-columns:minmax(0, 1fr); overflow:auto; } .fields, aside { overflow:visible; min-block-size:auto; } aside { border-left:0; border-top:var(--border-width) solid var(--border); } }
	@media (max-width:720px) { .three { grid-template-columns:minmax(0, 1fr); } }
</style>
