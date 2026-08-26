import type { Facility } from '@/backend/presentation/composition/watch-mode-engine.composition';

export type FacilityTypeName = Facility['type'];

/** Canvas が描き分ける施設マーカーの形状 */
export type FacilityShape = 'square' | 'triangle' | 'diamond' | 'cross';

export interface FacilityPresentation {
	label: string;
	shape: FacilityShape;
	/** 凡例で使う記号。色だけに頼らず形状で区別する */
	marker: string;
	/**
	 * 描画時の不透明度。
	 * Home は標準都市で 120 件あり、濃く描くと住宅地区が塗り潰れて Agent が埋もれる。
	 */
	opacity: number;
}

/**
 * City Map に描く施設の表示定義（要件定義 35 章）。
 * 凡例と Canvas が同じ定義を参照することで、記号と描画がずれるのを防ぐ。
 */
const PRESENTATIONS: Record<FacilityTypeName, FacilityPresentation> = {
	home: { label: 'Home', shape: 'square', marker: '□', opacity: 0.3 },
	workplace: { label: 'Workplace', shape: 'triangle', marker: '△', opacity: 0.6 },
	store: { label: 'Store', shape: 'diamond', marker: '◇', opacity: 0.6 },
	logistics_hub: { label: 'Logistics Hub', shape: 'cross', marker: '✚', opacity: 0.6 },
};

export const FACILITY_TYPE_ORDER: FacilityTypeName[] = [
	'home',
	'workplace',
	'store',
	'logistics_hub',
];

export function facilityPresentation(type: FacilityTypeName): FacilityPresentation {
	return PRESENTATIONS[type];
}

/** 事故と Sleep Transmission のマーカー定義。凡例と Canvas で共有する */
export const ACCIDENT_PRESENTATION = {
	label: 'Accident',
	marker: '✕',
	colorVar: '--color-alert',
} as const;

export const TRANSMISSION_PRESENTATION = {
	label: 'Sleep Transmission',
	marker: '→',
	colorVar: '--color-sleep-deprived',
} as const;
