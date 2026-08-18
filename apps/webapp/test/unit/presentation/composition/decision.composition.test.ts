import { DEFAULT_AI_MODEL } from '@/backend/infrastructure/adapters/openrouter-ai-decision.adapter';
import { RULE_BASED_MODEL_NAME } from '@/backend/infrastructure/adapters/rule-based-ai-decision.adapter';
import {
	createDecideAgentActionUseCase,
	createRuleBasedDecisionGateway,
	resolveAiModelName,
} from '@/backend/presentation/composition/decision.composition';
import { afterEach, describe, expect, it } from 'vitest';

const originalApiKey = process.env.OPENROUTER_API_KEY;
const originalModel = process.env.AI_MODEL;

function setEnv(name: string, value: string | undefined): void {
	// process.env へ undefined を代入すると文字列 'undefined' が入るため削除で表現する
	if (value === undefined) {
		delete process.env[name];
		return;
	}
	process.env[name] = value;
}

afterEach(() => {
	setEnv('OPENROUTER_API_KEY', originalApiKey);
	setEnv('AI_MODEL', originalModel);
});

describe('resolveAiModelName', () => {
	it('API キーが無ければ Rule-based を使う', () => {
		setEnv('OPENROUTER_API_KEY', undefined);
		expect(resolveAiModelName()).toBe(RULE_BASED_MODEL_NAME);
	});

	it('API キーが空文字でも Rule-based を使う', () => {
		setEnv('OPENROUTER_API_KEY', '');
		expect(resolveAiModelName()).toBe(RULE_BASED_MODEL_NAME);
	});

	it('API キーがあり AI_MODEL 未指定なら既定モデル', () => {
		setEnv('OPENROUTER_API_KEY', 'key');
		setEnv('AI_MODEL', undefined);
		expect(resolveAiModelName()).toBe(DEFAULT_AI_MODEL);
	});

	it('AI_MODEL の指定を優先する（モデル名をソースへ固定しない）', () => {
		setEnv('OPENROUTER_API_KEY', 'key');
		setEnv('AI_MODEL', 'qwen/qwen-2.5-72b-instruct');
		expect(resolveAiModelName()).toBe('qwen/qwen-2.5-72b-instruct');
	});
});

describe('createDecideAgentActionUseCase', () => {
	it('API キーが無い環境でも Rule-based で判断できる', async () => {
		setEnv('OPENROUTER_API_KEY', '');
		const useCase = createDecideAgentActionUseCase();

		const result = await useCase.decide({
			agent: { role: 'driver', fatigue: 90, sleepDebt: 4, responsibility: 0.3, riskTolerance: 0.2 },
			situation: { deadlinePressure: 0.1 },
			actions: ['continue_driving', 'rest'],
		});

		expect(['continue_driving', 'rest']).toContain(result.action);
		expect(result.model).toBe(RULE_BASED_MODEL_NAME);
	});
});

describe('createRuleBasedDecisionGateway', () => {
	it('Experiment Mode 用に AI を呼ばない Gateway を返す', async () => {
		const gateway = createRuleBasedDecisionGateway();
		const result = await gateway.decide({
			agent: {
				role: 'manager',
				fatigue: 20,
				sleepDebt: 0,
				responsibility: 0.9,
				riskTolerance: 0.5,
			},
			situation: { deadlinePressure: 0.9 },
			actions: ['go_home', 'overtime'],
		});

		expect(result.model).toBe(RULE_BASED_MODEL_NAME);
	});
});
