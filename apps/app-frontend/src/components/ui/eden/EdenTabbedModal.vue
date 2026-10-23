<script setup lang="ts">
import { NewModal, useVIntl } from '@modrinth/ui'
import { computed, nextTick, ref } from 'vue'

import EdenIcon from '@/components/ui/eden/EdenIcon.vue'
import EdenMark from '@/components/ui/eden/EdenMark.vue'
import type { EdenTab } from '@/components/ui/eden/tabs'

const props = withDefaults(
	defineProps<{
		tabs: EdenTab[]
		title: string
		/** Text shown above the first category, e.g. the instance name. */
		sidebarCaption?: string
		footerNote?: string
		width?: string
		closable?: boolean
		onHide?: () => void
		onShow?: () => void
		beforeHide?: () => boolean
		beforeTabChange?: (fromIndex: number, toIndex: number) => boolean
		floatingActionBarShown?: boolean
	}>(),
	{
		sidebarCaption: undefined,
		footerNote: 'Настройки этого устройства',
		width: 'min(1164px, calc(100vw - 4rem))',
		closable: true,
		onHide: undefined,
		onShow: undefined,
		beforeHide: undefined,
		beforeTabChange: undefined,
		floatingActionBarShown: false,
	},
)

const { formatMessage } = useVIntl()
const modal = ref<InstanceType<typeof NewModal> | null>(null)
const content = ref<HTMLElement | null>(null)
const selectedTab = ref(0)

const visibleTabs = computed(() => props.tabs.filter((tab) => tab.shown !== false))
const activeTab = computed(() => visibleTabs.value[selectedTab.value])

function startsCategory(index: number) {
	const category = visibleTabs.value[index]?.category
	return !!category && category.id !== visibleTabs.value[index - 1]?.category?.id
}

function setTab(index: number) {
	if (index === selectedTab.value) return
	if (props.beforeTabChange?.(selectedTab.value, index) === false) return
	selectedTab.value = index
	nextTick(() => content.value?.scrollTo({ top: 0 }))
}

function show(event?: MouseEvent) {
	modal.value?.show(event)
}

function hide(): boolean {
	return modal.value?.hide() ?? false
}

defineExpose({ show, hide, selectedTab, setTab })
</script>

<template>
	<NewModal
		ref="modal"
		:width="width"
		:max-width="width"
		:closable="closable"
		:on-hide="onHide"
		:on-show="onShow"
		:before-hide="beforeHide"
		:aria-label="title"
		class="eden-tabbed-modal"
		hide-header
		no-padding
	>
		<div class="eden-tabbed">
			<aside class="eden-tabbed__sidebar">
				<div class="eden-tabbed__brand">
					<EdenMark :size="34" />
					<span>{{ title }}</span>
				</div>
				<nav class="eden-tabbed__nav" :aria-label="title">
					<p v-if="sidebarCaption" class="eden-tabbed__category">{{ sidebarCaption }}</p>
					<template v-for="(tab, index) in visibleTabs" :key="index">
						<p v-if="startsCategory(index) && tab.category" class="eden-tabbed__category">
							{{ formatMessage(tab.category) }}
						</p>
						<button
							type="button"
							class="eden-tabbed__item"
							:class="{ active: selectedTab === index }"
							:aria-current="selectedTab === index ? 'page' : undefined"
							@click="setTab(index)"
						>
							<EdenIcon v-if="tab.edenIcon" :name="tab.edenIcon as never" :size="18" />
							<component :is="tab.icon" v-else class="eden-tabbed__item-icon" />
							<span>{{ formatMessage(tab.name) }}</span>
							<span v-if="tab.badge" class="eden-chip eden-chip--accent eden-tabbed__badge">
								{{ formatMessage(tab.badge) }}
							</span>
						</button>
					</template>
				</nav>
				<div class="eden-tabbed__sidebar-footer">
					<slot name="footer" />
				</div>
			</aside>

			<section class="eden-tabbed__main">
				<button
					v-if="closable"
					type="button"
					class="eden-tabbed__close"
					aria-label="Закрыть"
					@click="hide()"
				>
					<EdenIcon name="close" :size="20" />
				</button>
				<div ref="content" class="eden-tabbed__content">
					<header v-if="activeTab" class="eden-tabbed__header">
						<h2>{{ formatMessage(activeTab.name) }}</h2>
						<p v-if="activeTab.description">{{ activeTab.description }}</p>
					</header>
					<div class="eden-tabbed__body eden-settings-body">
						<Suspense>
							<component :is="activeTab.content" v-if="activeTab?.content" />
						</Suspense>
					</div>
				</div>
				<div v-if="floatingActionBarShown" class="eden-tabbed__floating">
					<slot name="floating-action-bar" />
				</div>
				<footer class="eden-tabbed__footer">
					<span>{{ footerNote }}</span>
					<button
						v-if="closable"
						type="button"
						class="eden-btn eden-btn--primary eden-btn--compact"
						@click="hide()"
					>
						<EdenIcon name="check" :size="16" />
						Готово
					</button>
				</footer>
			</section>
		</div>
	</NewModal>
</template>

<style scoped lang="scss">
.eden-tabbed {
	display: grid;
	height: min(752px, calc(100vh - 6rem));
	grid-template-columns: 270px minmax(0, 1fr);
	color: var(--eden-text);
}

.eden-tabbed__sidebar {
	display: flex;
	min-height: 0;
	flex-direction: column;
	padding: 24px 12px 20px;
	border-right: 1px solid var(--eden-border);
	background: var(--eden-canvas);
}

.eden-tabbed__brand {
	display: flex;
	align-items: center;
	gap: 14px;
	padding: 0 16px 26px;

	span {
		display: -webkit-box;
		overflow: hidden;
		font-size: 21px;
		font-weight: 650;
		line-height: 1.2;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
	}
}

.eden-tabbed__nav {
	display: flex;
	min-height: 0;
	flex: 1;
	flex-direction: column;
	gap: 4px;
	overflow-y: auto;
}

.eden-tabbed__category {
	margin: 14px 0 6px;
	padding: 0 14px;
	overflow: hidden;
	color: var(--eden-text-secondary);
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.16em;
	text-overflow: ellipsis;
	text-transform: uppercase;
	white-space: nowrap;

	&:first-child {
		margin-top: 0;
	}
}

.eden-tabbed__item {
	display: flex;
	min-height: 38px;
	align-items: center;
	gap: 12px;
	padding: 0 14px;
	border: 0;
	border-radius: var(--eden-radius-control);
	color: var(--eden-text-secondary);
	background: transparent;
	font: inherit;
	font-size: 13px;
	text-align: left;
	cursor: pointer;
	transition:
		color var(--eden-motion-hover) ease,
		background-color var(--eden-motion-hover) ease;

	> span:first-of-type {
		min-width: 0;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	&:hover {
		color: var(--eden-text);
		background: var(--eden-surface);
	}

	&.active {
		color: var(--eden-text);
		background: var(--eden-surface-raised);
		font-weight: 650;

		:deep(.eden-icon),
		.eden-tabbed__item-icon {
			color: var(--eden-accent-text);
		}
	}

	&:focus-visible {
		outline: 2px solid var(--eden-focus);
		outline-offset: 2px;
	}
}

.eden-tabbed__item-icon {
	width: 18px;
	height: 18px;
	flex: 0 0 auto;
}

.eden-tabbed__badge {
	min-height: 20px;
	padding: 0 6px;
	font-size: 10px;
}

.eden-tabbed__sidebar-footer {
	padding: 14px 16px 0;
	color: var(--eden-text-secondary);
	font-size: 11px;
}

.eden-tabbed__main {
	position: relative;
	display: flex;
	min-width: 0;
	min-height: 0;
	flex-direction: column;
	background: var(--eden-sidebar);
}

.eden-tabbed__close {
	position: absolute;
	z-index: 6;
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

.eden-tabbed__content {
	min-height: 0;
	flex: 1;
	overflow-y: auto;
	padding: 52px 32px 24px;
}

.eden-tabbed__header {
	margin-bottom: 26px;

	h2 {
		margin: 0;
		color: var(--eden-text);
		font-size: 29px;
		font-weight: 650;
		line-height: 1.2;
	}

	p {
		margin: 10px 0 0;
		color: var(--eden-text-secondary);
		font-size: 13px;
	}
}

.eden-tabbed__floating {
	position: absolute;
	right: 32px;
	bottom: 84px;
	left: 32px;
	z-index: 5;
}

.eden-tabbed__footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	margin: 0 32px;
	padding: 18px 0 20px;
	border-top: 1px solid var(--eden-border);
	color: var(--eden-text-secondary);
	font-size: 12px;

	.eden-btn {
		min-width: 116px;
	}
}

@media (max-width: 899px) {
	.eden-tabbed {
		grid-template-columns: 200px minmax(0, 1fr);
	}

	.eden-tabbed__content {
		padding: 48px 20px 20px;
	}

	.eden-tabbed__footer {
		margin: 0 20px;
	}
}
</style>
