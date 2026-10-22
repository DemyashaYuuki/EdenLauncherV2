# Ассеты EdenLauncher

Материалы из дизайн-набора `EdenLauncher-Design-Kit` (направления Portal, Bloom и Signal).

- `backgrounds/` — оригинальные иллюстрации набора в WebP, исходный размер 1672 × 941 px, без
  увеличения разрешения: `eden-portal` (Portal, рабочий стол Windows 10), `asuna-bloom`
  («Асуна»), `error-signal` (Error).
- `brand/` — значок приложения (SVG для окна, PNG 512 px для генерации иконок Tauri).
  Знак EW в интерфейсе нарисован компонентом `components/ui/eden/EdenMark.vue`, чтобы
  принимать цвет активной темы.
- `icons/` — единый набор значков 24 × 24 с линией 1.65 px и `currentColor`; подключается
  через `components/ui/eden/EdenIcon.vue`.
- `overlays/` — кольцо и частицы заставки.

Цветовые роли тем задаются в `store/theme.ts` (`EDEN_PALETTES`), общие примитивы — в
`assets/stylesheets/eden.scss`.
