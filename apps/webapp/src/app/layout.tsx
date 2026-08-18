import type { Metadata } from 'next';
import { Noto_Sans_JP } from 'next/font/google';
import './globals.css';

const notoSansJP = Noto_Sans_JP({
	subsets: ['latin'],
	weight: ['400', '500', '600', '700'],
	display: 'swap',
	variable: '--font-noto-sans-jp',
});

export const metadata: Metadata = {
	title: 'SLEEP CITY 2.0',
	description:
		'睡眠不足が都市の中でどのように伝播し自己増殖するかを観測する AI マルチエージェント都市シミュレーション',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="ja" className={notoSansJP.variable}>
			<body className="min-h-dvh bg-background font-sans text-foreground">{children}</body>
		</html>
	);
}
