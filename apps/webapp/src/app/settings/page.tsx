import { resolveAiModelName } from '@/backend/presentation/composition/decision.composition';
import { SettingsForm } from '@/frontend/components/settings/settings-form';
import Link from 'next/link';

/** 表示する AI Model はサーバーの環境変数で決まるため、ビルド時に固定しない */
export const dynamic = 'force-dynamic';

export const metadata = {
	title: 'Settings | SLEEP CITY 2.0',
};

export default function SettingsPage() {
	return (
		<main className="mx-auto w-full max-w-4xl space-y-4 p-6">
			<header className="flex flex-wrap items-baseline justify-between gap-2">
				<h1 className="text-lg font-semibold">Settings</h1>
				<Link href="/" className="text-xs underline">
					← Simulation へ戻る
				</Link>
			</header>
			<p className="text-xs text-muted-foreground">
				これから開始する Run の既定値です。実行済みの Run / Experiment
				は保存時の条件スナップショットを持つため、ここを変えても過去の結果は変わりません。設定はこのブラウザにのみ保存されます。
			</p>
			<SettingsForm currentAiModel={resolveAiModelName()} />
		</main>
	);
}
