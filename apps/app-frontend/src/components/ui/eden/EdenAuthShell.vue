<script setup lang="ts">
import { computed } from 'vue'

import authThreshold from '@/assets/eden/illustrations/auth-threshold.webp'
import EdenIcon from '@/components/ui/eden/EdenIcon.vue'
import EdenMark from '@/components/ui/eden/EdenMark.vue'
import { useTheming } from '@/store/state'
import { EDEN_BACKGROUNDS } from '@/store/theme'

/** Two-column layout of the sign-in dialogs: world illustration on the left, content on the right. */
withDefaults(defineProps<{ closable?: boolean }>(), { closable: true })
const emit = defineEmits<{ close: [] }>()

const themeStore = useTheming()
const art = computed(() => {
	if (themeStore.paletteName === 'bloom') return EDEN_BACKGROUNDS.bloom
	if (themeStore.paletteName === 'signal') return EDEN_BACKGROUNDS.signal
	return authThreshold
})
const lightArt = computed(() => themeStore.paletteName === 'bloom')
</script>

<template>
	<div class="eden-auth">
		<aside
			class="eden-auth__art"
			:class="{ 'eden-auth__art--light': lightArt }"
			:style="{ backgroundImage: `url(${art})` }"
			aria-hidden="true"
		>
			<div class="eden-auth__brand">
				<EdenMark :size="34" />
				<span>EdenLauncher</span>
			</div>
			<div class="eden-auth__story">
				<p class="eden-auth__eyebrow">Добро пожаловать</p>
				<p class="eden-auth__title">Твой аккаунт.<br />Твоя история.</p>
				<p class="eden-auth__lead">Встретимся в EdenWorld.</p>
			</div>
		</aside>
		<section class="eden-auth__content">
			<button
				v-if="closable"
				type="button"
				class="eden-auth__close"
				aria-label="Закрыть"
				@click="emit('close')"
			>
				<EdenIcon name="close" :size="20" />
			</button>
			<slot />
		</section>
	</div>
</template>

<style scoped lang="scss">
.eden-auth {
	display: grid;
	width: min(1052px, calc(100vw - 4rem));
	min-height: min(690px, calc(100vh - 6rem));
	grid-template-columns: minmax(0, 388px) minmax(0, 1fr);
	color: var(--eden-text);
}

.eden-auth__art {
	position: relative;
	display: flex;
	flex-direction: column;
	justify-content: space-between;
	overflow: hidden;
	padding: 28px 30px 34px;
	color: #f5f3fa;
	background-position: 42% 30%;
	background-size: cover;

	&::before {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(
			180deg,
			rgba(13, 13, 20, 0.3) 0%,
			rgba(13, 13, 20, 0) 26%,
			rgba(13, 13, 20, 0.35) 58%,
			rgba(13, 13, 20, 0.92) 100%
		);
	}

	> * {
		position: relative;
	}
}

.eden-auth__art--light {
	color: #332a28;

	&::before {
		background: linear-gradient(
			180deg,
			rgba(255, 251, 246, 0.45) 0%,
			rgba(255, 251, 246, 0) 26%,
			rgba(255, 251, 246, 0.4) 58%,
			rgba(255, 251, 246, 0.94) 100%
		);
	}
}

.eden-auth__brand {
	display: flex;
	align-items: center;
	gap: 12px;
	font-size: 17px;
	font-weight: 650;
}

.eden-auth__eyebrow {
	margin: 0;
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.18em;
	text-transform: uppercase;
	opacity: 0.86;
}

.eden-auth__title {
	margin: 18px 0 0;
	font-size: 30px;
	font-weight: 700;
	line-height: 1.35;
}

.eden-auth__lead {
	margin: 22px 0 0;
	font-size: 13px;
	opacity: 0.86;
}

.eden-auth__content {
	position: relative;
	display: flex;
	min-width: 0;
	flex-direction: column;
	padding: 58px 42px 36px;
	background: var(--eden-sidebar);
}

.eden-auth__close {
	position: absolute;
	top: 22px;
	right: 22px;
	display: grid;
	width: 36px;
	height: 36px;
	place-items: center;
	padding: 0;
	border: 0;
	border-radius: var(--eden-radius-control);
	color: var(--eden-text-secondary);
	background: transparent;
	cursor: pointer;

	&:hover {
		color: var(--eden-text);
		background: var(--eden-surface-raised);
	}

	&:focus-visible {
		outline: 2px solid var(--eden-focus);
		outline-offset: 2px;
	}
}

@media (max-width: 899px) {
	.eden-auth {
		grid-template-columns: minmax(0, 1fr);
	}

	.eden-auth__art {
		display: none;
	}

	.eden-auth__content {
		padding: 52px 24px 24px;
	}
}
</style>
