'use client';

import {
	type SimulationEvent,
	originOfEventType,
} from '@/backend/presentation/composition/watch-mode-engine.composition';
import { EventOriginLegend } from '@/frontend/components/event-origin/event-origin-legend';
import { Card, CardContent, CardHeader, CardTitle } from '@/frontend/components/ui/card';
import { eventTypePresentation } from '@/frontend/lib/event-origin-presentation';
import { formatEventLabel } from '@/frontend/lib/format';

interface EventTimelineProps {
	events: readonly SimulationEvent[];
	/** Event を選ぶと Causal Graph の起点になる。actorId があれば Agent Detail も切り替える */
	onSelectEvent: (eventId: string, actorId?: string) => void;
}

function formatTick(tick: number): string {
	const day = Math.floor(tick / 96) + 1;
	const hour = Math.floor((tick % 96) / 4);
	const minute = (tick % 4) * 15;
	return `D${day} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** 重要 Event のみを表示する。全 Tick ログは表示しない（要件定義 37 章） */
export function EventTimeline({ events, onSelectEvent }: EventTimelineProps) {
	// 一覧に出ていない由来を凡例に並べても意味が読めないため、実際に含まれるものだけを示す
	const shownOrigins = [...new Set(events.map((event) => originOfEventType(event.type)))];

	return (
		<Card className="flex min-h-0 flex-col">
			<CardHeader className="pb-2">
				<CardTitle className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
					<span>Event Timeline</span>
					{/* 事故を AI が起こしたものと誤読させないため、表示中の Event の由来を凡例に出す */}
					<EventOriginLegend origins={shownOrigins} />
				</CardTitle>
			</CardHeader>
			<CardContent className="min-h-0 flex-1 overflow-auto p-0">
				{events.length === 0 ? (
					<p className="px-4 pb-4 text-xs text-muted-foreground">まだ重要 Event はありません。</p>
				) : (
					<ul className="divide-y divide-border text-xs">
						{events.map((event) => {
							const origin = eventTypePresentation(event.type);
							return (
								<li key={event.id} className="px-4 py-2">
									<button
										type="button"
										className="w-full text-left"
										onClick={() => onSelectEvent(event.id, event.actorId)}
									>
										<span className="font-mono tabular-nums text-muted-foreground">
											{formatTick(event.tick)}
										</span>{' '}
										<span className={origin.textClass} title={origin.description}>
											{/* 記号だけでは読み上げられないため、由来をテキストでも出す */}
											<span aria-hidden>{origin.marker}</span>
											<span className="sr-only">{origin.label}: </span>
										</span>{' '}
										<span className="font-medium text-foreground">
											{formatEventLabel(event.type)}
										</span>
										{event.actorId !== undefined ? (
											<span className="text-muted-foreground"> · {event.actorId}</span>
										) : null}
										{event.impact.delayMinutes !== undefined ? (
											<span className="text-muted-foreground">
												{' '}
												+{event.impact.delayMinutes}min
											</span>
										) : null}
										{event.impact.sleepLossMinutes !== undefined ? (
											<span className="text-muted-foreground">
												{' '}
												sleep {event.impact.sleepLossMinutes > 0 ? '-' : '+'}
												{Math.abs(event.impact.sleepLossMinutes)}min
											</span>
										) : null}
										{event.causedByEventIds.length > 0 ? (
											<span className="text-muted-foreground">
												{' '}
												← {event.causedByEventIds.join(', ')}
											</span>
										) : null}
									</button>
								</li>
							);
						})}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
