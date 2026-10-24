<script setup lang="ts">
import { computed } from 'vue'

import StudioIcon from '@/components/skin-studio/StudioIcon.vue'
import StudioThumb from '@/components/skin-studio/StudioThumb.vue'
import { isDirty } from '@/skin-studio/engine/document'
import { matchesModelAspect } from '@/skin-studio/engine/image'
import { BUILTIN_MODELS } from '@/skin-studio/engine/model'
import { type StudioKey, useStudioText } from '@/skin-studio/i18n'
import { useSkinStudio } from '@/skin-studio/store'

const emit = defineEmits<{
	(event: 'new'): void
	(event: 'close', id: string): void
	(event: 'models'): void
	(event: 'convert'): void
}>()

const studio = useSkinStudio()
const t = useStudioText()

const docs = computed(() => {
	void studio.revision
	return studio.documents.map((d) => ({
		id: d.id,
		name: d.name,
		dirty: isDirty(d),
		image: d.image,
		version: d.version,
		info: `${d.image.width} × ${d.image.height} · ${d.model.name}`,
	}))
})

const model = computed(() => {
	void studio.revision
	return studio.active?.model ?? null
})

const modelChoice = computed({
	get: () => model.value?.id ?? '',
	set: (id: string) => {
		const doc = studio.active
		if (!doc) return
		if (id === '__other') {
			emit('models')
			return
		}
		const next = BUILTIN_MODELS.find((m) => m.id === id)
		if (!next || next.id === doc.model.id) return
		if (matchesModelAspect(doc.image.width, doc.image.height, next.textureWidth, next.textureHeight)) {
			studio.replace(next.name, doc.image, next)
		} else {
			emit('convert')
		}
	},
})

function partLabel(id: string, fallback: string): string {
	const key = `part.${id}` as StudioKey
	const text = t(key)
	return text === key ? fallback : text
}

const hasOverlay = computed(() => model.value?.boxes.some((b) => b.layer === 'overlay') ?? false)

function overlayFor(part: string): boolean {
	return model.value?.boxes.some((b) => b.part === part && b.layer === 'overlay') ?? false
}
</script>

<template>
	<aside class="studio-dock">
		<div class="studio-dock__head">
			<h3 id="studio-projects-label">{{ t('dock.projects') }}</h3>
			<button v-tooltip="t('dock.newProject')" type="button" class="studio-dock__icon" :aria-label="t('dock.newProject')" @click="emit('new')">
				<StudioIcon name="plus" :size="16" />
			</button>
		</div>
		<div class="studio-dock__projects" role="tablist" aria-labelledby="studio-projects-label" aria-orientation="vertical">
			<div v-for="doc in docs" :key="doc.id" class="studio-dock__project" :class="{ active: doc.id === studio.activeId }">
				<button
					type="button"
					role="tab"
					class="studio-dock__project-main"
					:aria-selected="doc.id === studio.activeId"
					@click="studio.activate(doc.id)"
				>
					<span class="studio-dock__thumb"><StudioThumb :image="doc.image" :version="doc.version" /></span>
					<span class="studio-dock__copy">
						<strong>
							{{ doc.name }}
							<span v-if="doc.dirty" class="studio-dock__dirty" :aria-label="t('footer.unsaved')">•</span>
						</strong>
						<small>{{ doc.info }}</small>
					</span>
				</button>
				<button
					v-tooltip="t('action.close')"
					type="button"
					class="studio-dock__close"
					:aria-label="`${t('action.close')}: ${doc.name}`"
					@click="emit('close', doc.id)"
				>
					<StudioIcon name="close" :size="13" />
				</button>
			</div>
			<p v-if="docs.length === 0" class="studio-dock__empty">{{ t('footer.noDocument') }}</p>
		</div>

		<template v-if="model">
			<div class="studio-dock__sep" />
			<label class="studio-dock__label" for="studio-model-select">{{ t('dock.model') }}</label>
			<select id="studio-model-select" v-model="modelChoice" class="studio-dock__select">
				<option v-for="m in BUILTIN_MODELS" :key="m.id" :value="m.id">
					{{ m.name }}{{ m.playerVariant ? ` · ${m.playerVariant === 'slim' ? 3 : 4} px` : '' }}
				</option>
				<option v-if="!BUILTIN_MODELS.some((m) => m.id === model?.id)" :value="model.id">{{ model.name }}</option>
				<option value="__other">{{ t('dock.otherModel') }}</option>
			</select>
			<button type="button" class="studio-dock__link" @click="emit('convert')">{{ t('convert.title') }}…</button>

			<div class="studio-dock__sep" />
			<div class="studio-dock__head">
				<h3>{{ t('dock.parts') }}</h3>
				<StudioIcon name="layers" :size="16" />
			</div>
			<ul class="studio-dock__parts">
				<li v-for="part in model.parts" :key="part.id">
					<label>
						<span>{{ partLabel(part.id, part.label) }}</span>
						<input v-model="studio.visibility.parts[part.id]" type="checkbox" />
					</label>
					<label v-if="overlayFor(part.id)" v-tooltip="t('dock.overlay')" class="studio-dock__overlay">
						<span class="sr-only">{{ t('dock.overlay') }}: {{ partLabel(part.id, part.label) }}</span>
						<StudioIcon name="texture" :size="13" />
						<input v-model="studio.visibility.overlay[part.id]" type="checkbox" />
					</label>
				</li>
			</ul>
			<div class="studio-dock__sep" />
			<label v-if="hasOverlay" class="studio-dock__toggle">
				<span>{{ t('dock.overlay') }}</span>
				<input v-model="studio.visibility.overlayGlobal" type="checkbox" />
			</label>
			<label class="studio-dock__toggle">
				<span>{{ t('dock.ghost') }}</span>
				<input v-model="studio.visibility.ghost" type="checkbox" />
			</label>
			<label v-if="hasOverlay" class="studio-dock__label" for="studio-paint-target">{{ t('dock.paintTarget') }}</label>
			<select v-if="hasOverlay" id="studio-paint-target" v-model="studio.prefs.paintTarget" class="studio-dock__select">
				<option value="auto">{{ t('dock.paintTarget.auto') }}</option>
				<option value="base">{{ t('dock.paintTarget.base') }}</option>
				<option value="overlay">{{ t('dock.paintTarget.overlay') }}</option>
			</select>
			<p class="studio-dock__hint">{{ t('dock.hint3d') }}</p>
		</template>
	</aside>
</template>

<style scoped lang="scss">
.studio-dock {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 16px 14px;
	overflow-y: auto;
	border-right: 1px solid var(--eden-border);

	h3 {
		margin: 0;
		color: var(--eden-text-secondary);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 1.4px;
		text-transform: uppercase;
	}
}

.studio-dock__head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	color: var(--eden-text-secondary);
}

.studio-dock__icon,
.studio-dock__close {
	display: grid;
	width: 26px;
	height: 26px;
	place-items: center;
	padding: 0;
	border: 1px solid transparent;
	border-radius: 7px;
	color: var(--eden-text-secondary);
	background: transparent;
	cursor: pointer;

	&:hover {
		border-color: var(--eden-border);
		color: var(--eden-text);
	}

	&:focus-visible {
		outline: 2px solid var(--eden-accent);
		outline-offset: 2px;
	}
}

.studio-dock__projects {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.studio-dock__project {
	display: flex;
	align-items: center;
	border: 1px solid transparent;
	border-radius: 9px;

	&.active {
		border-color: var(--eden-border);
		background: var(--eden-surface-raised);
	}

	.studio-dock__close {
		opacity: 0;
	}

	&:hover .studio-dock__close,
	&.active .studio-dock__close,
	.studio-dock__close:focus-visible {
		opacity: 1;
	}
}

.studio-dock__project-main {
	display: flex;
	min-width: 0;
	flex: 1;
	align-items: center;
	gap: 9px;
	padding: 8px;
	border: 0;
	border-radius: 9px;
	color: var(--eden-text);
	background: transparent;
	text-align: left;
	cursor: pointer;

	&:focus-visible {
		outline: 2px solid var(--eden-accent);
		outline-offset: 1px;
	}
}

.studio-dock__thumb {
	width: 30px;
	height: 30px;
	flex: 0 0 auto;
	overflow: hidden;
	border-radius: 5px;
	background: var(--eden-canvas);
}

.studio-dock__copy {
	display: flex;
	min-width: 0;
	flex-direction: column;
	gap: 3px;

	strong {
		overflow: hidden;
		font-size: 12px;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	small {
		overflow: hidden;
		color: var(--eden-text-secondary);
		font-size: 10px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
}

.studio-dock__dirty {
	color: var(--eden-success);
}

.studio-dock__empty {
	margin: 0;
	color: var(--eden-text-secondary);
	font-size: 11px;
}

.studio-dock__sep {
	height: 1px;
	margin: 8px 0;
	background: var(--eden-border);
}

.studio-dock__label {
	color: var(--eden-text-secondary);
	font-size: 10px;
	font-weight: 700;
	letter-spacing: 1.4px;
	text-transform: uppercase;
}

.studio-dock__select {
	width: 100%;
	min-height: 34px;
	padding: 4px 10px;
	border: 1px solid var(--eden-border);
	border-radius: 9px;
	color: var(--eden-text);
	background: var(--eden-surface-raised);
	font-size: 12px;

	&:focus-visible {
		outline: 2px solid var(--eden-accent);
		outline-offset: 2px;
	}
}

.studio-dock__link {
	align-self: flex-start;
	padding: 0;
	border: 0;
	color: var(--eden-accent);
	background: transparent;
	font-size: 11px;
	cursor: pointer;

	&:focus-visible {
		outline: 2px solid var(--eden-accent);
		outline-offset: 2px;
	}
}

.studio-dock__parts {
	display: flex;
	flex-direction: column;
	margin: 0;
	padding: 0;
	list-style: none;

	li {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	label:first-child {
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: space-between;
		padding: 6px 2px;
		color: var(--eden-text-secondary);
		font-size: 12px;
	}

	input {
		width: 15px;
		height: 15px;
		accent-color: var(--eden-accent);
	}
}

.studio-dock__overlay {
	display: flex;
	align-items: center;
	gap: 3px;
	color: var(--eden-text-secondary);
}

.studio-dock__toggle {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 4px 2px;
	color: var(--eden-text-secondary);
	font-size: 12px;

	input {
		width: 15px;
		height: 15px;
		accent-color: var(--eden-accent);
	}
}

.studio-dock__hint {
	margin: 10px 0 0;
	color: var(--eden-text-secondary);
	font-size: 10px;
	line-height: 1.5;
}
</style>
