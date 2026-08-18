export function formatNumber(value: number, fractionDigits = 2): string {
	if (!Number.isFinite(value)) {
		return '-';
	}
	return value.toFixed(fractionDigits);
}

export function formatInteger(value: number): string {
	if (!Number.isFinite(value)) {
		return '-';
	}
	return Math.round(value).toLocaleString('ja-JP');
}

export function formatMinutesAsHours(minutes: number): string {
	if (!Number.isFinite(minutes)) {
		return '-';
	}
	return `${(minutes / 60).toFixed(1)} h`;
}

export function formatRoleLabel(role: string): string {
	const labels: Record<string, string> = {
		office_worker: 'Office Worker',
		manager: 'Manager',
		driver: 'Driver',
		delivery_worker: 'Delivery Worker',
		store_worker: 'Store Worker',
	};
	return labels[role] ?? role;
}

export function formatEventLabel(type: string): string {
	const labels: Record<string, string> = {
		decision: 'Decision',
		accident: 'Accident',
		traffic_jam: 'Traffic Jam',
		commute_delay: 'Commute Delay',
		late_arrival: 'Late Arrival',
		work_delay: 'Work Delay',
		work_failure: 'Work Failure',
		overtime: 'Overtime',
		delivery_delay: 'Delivery Delay',
		store_delay: 'Store Delay',
		household_delay: 'Household Delay',
		sleep_opportunity_loss: 'Sleep Opportunity Loss',
		sleep_loss: 'Sleep Loss',
		sleep_deprived: 'Sleep Deprived',
		severe_sleep_deprived: 'Severe Sleep Deprived',
		recovery: 'Recovery',
	};
	return labels[type] ?? type;
}
