<script setup lang="ts">
import edenWorldLogo from '@/assets/edenworld-logo.jpg'

defineProps<{
	description: string
	title: string
}>()
</script>

<template>
	<div class="flex min-w-0 flex-col gap-5">
		<header
			class="relative overflow-hidden rounded-2xl border border-solid border-[rgba(190,120,255,0.34)] bg-[linear-gradient(135deg,rgba(139,61,238,0.18),rgba(92,38,153,0.05)_58%,transparent)] p-5"
		>
			<div
				class="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-[rgba(170,82,255,0.16)] blur-3xl"
			/>
			<div class="relative flex items-center gap-4">
				<div
					class="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-solid border-[rgba(190,120,255,0.35)] bg-[rgba(139,61,238,0.16)] text-brand shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
				>
					<img :src="edenWorldLogo" alt="" class="size-full object-cover" />
				</div>
				<div class="min-w-0">
					<h1 class="m-0 text-xl font-bold leading-tight text-contrast">
						{{ title }}
					</h1>
					<p class="m-0 mt-1 max-w-2xl text-sm leading-relaxed text-secondary">
						{{ description }}
					</p>
				</div>
				<div v-if="$slots.actions" class="ml-auto shrink-0">
					<slot name="actions" />
				</div>
			</div>
		</header>

		<main>
			<slot />
		</main>

		<footer v-if="$slots.footer" class="px-1 text-sm text-secondary">
			<slot name="footer" />
		</footer>
	</div>
</template>
