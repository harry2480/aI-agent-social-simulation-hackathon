import {
	ExperimentConfig,
	type ExperimentConfigParams,
} from '@/backend/domain/models/experiment-config.model';

/**
 * テスト用に ExperimentConfig を生成する。
 * ExperimentConfig.create は Result を返すため、成功前提のテストではここで取り出す。
 * 失敗した場合はテストの前提が壊れているので例外にする。
 */
export function createTestConfig(params: ExperimentConfigParams): ExperimentConfig {
	const result = ExperimentConfig.create(params);
	if (!result.success) {
		throw new Error(`createTestConfig: unexpected invalid config (${result.error})`);
	}
	return result.value;
}
