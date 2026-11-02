<!-- src/routes/admin/+page.svelte -->
<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	onMount(() => {
		goto(resolve('/admin/configs'));
	});
</script>

<div class="d-flex justify-content-center align-items-center text-muted min-h-screen">
	Đang chuyển hướng đến trang quản trị...
</div>
