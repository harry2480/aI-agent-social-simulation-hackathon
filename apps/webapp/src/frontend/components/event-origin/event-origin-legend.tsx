import type { EventOrigin } from '@/backend/presentation/composition/watch-mode-engine.composition';
import {
	EVENT_ORIGIN_ORDER,
	eventOriginPresentation,
} from '@/frontend/lib/event-origin-presentation';

interface EventOriginLegendProps {
	/** 表示する由来。省略時はすべて表示する */
	origins?: readonly EventOrigin[];
}

/**
 * Event の由来（AI 判断 / 確率 / 計算）の凡例。
 * Timeline と Causal Graph が同じ表記を使うことで、画面ごとに意味がずれるのを防ぐ。
 */
export function EventOriginLegend({ origins = EVENT_ORIGIN_ORDER }: EventOriginLegendProps) {
	if (origins.length === 0) {
		return null;
	}

	return (
		<span className="flex flex-wrap items-center gap-2 text-xs font-normal">
			{EVENT_ORIGIN_ORDER.filter((origin) => origins.includes(origin)).map((origin) => {
				const presentation = eventOriginPresentation(origin);
				return (
					<span key={origin} className={presentation.textClass} title={presentation.description}>
						{presentation.marker} {presentation.label}
					</span>
				);
			})}
		</span>
	);
}
