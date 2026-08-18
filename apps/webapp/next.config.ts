import type { NextConfig } from 'next';

const securityHeaders = [
	{ key: 'X-Frame-Options', value: 'DENY' },
	{ key: 'X-Content-Type-Options', value: 'nosniff' },
	{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
	{
		key: 'Strict-Transport-Security',
		value: 'max-age=63072000; includeSubDomains; preload',
	},
];

const nextConfig: NextConfig = {
	async headers() {
		return [{ source: '/(.*)', headers: securityHeaders }];
	},
	experimental: {
		// Watch Mode の Run 結果（重要 Event・Causal Edge・Metrics）を
		// Server Action でまとめて送るため、既定の 1MB では収まらない
		serverActions: { bodySizeLimit: '16mb' },
	},
};

export default nextConfig;
