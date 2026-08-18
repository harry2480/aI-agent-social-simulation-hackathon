import type { AgentRelationship } from '../services/population.service';
import type { Agent } from './agent.model';
import { CausalEdge } from './causal-edge.model';
import type { City } from './city.model';
import type { ExperimentConfig } from './experiment-config.model';
import type { MetricsSnapshot } from './metrics.model';
import type { SimulationClock } from './simulation-clock.model';
import type { SimulationEvent } from './simulation-event.model';

/**
 * 道路の混雑状態。causedByEventId を保持することで、
 * 遅延を受けた Agent の Event が「どの事故・渋滞を参照したか」を機械的に辿れるようにする。
 * これが因果を時間的前後ではなくデータ参照経路で決定するための土台になる。
 */
export interface Congestion {
	roadId: string;
	extraMinutes: number;
	causedByEventId: string;
}

/** 通勤・移動中の Agent の状態 */
export interface TravelState {
	agentId: string;
	fromFacilityId: string;
	toFacilityId: string;
	arrivalTick: number;
	delayMinutes: number;
	/** 遅延の原因となった Event（混雑由来）。無ければ空 */
	delayCauseEventIds: string[];
}

/** Sleep Transmission 候補 */
export interface SleepTransmission {
	fromAgentId: string;
	toAgentId: string;
	tick: number;
	sleepLossMinutes: number;
	causeEventId: string;
	/** 受け手が新規 Sleep-Deprived Case になったか */
	becameNewCase: boolean;
}

/**
 * Run 中の可変状態をまとめて保持する。
 * Engine と各 domain service はこの State を受け取って更新する。
 */
export class SimulationState {
	readonly agents: Map<string, Agent>;
	readonly congestions: Map<string, Congestion> = new Map();
	readonly travels: Map<string, TravelState> = new Map();
	readonly events: SimulationEvent[] = [];
	private readonly eventIndex: Map<string, SimulationEvent> = new Map();
	readonly causalEdges: CausalEdge[] = [];
	readonly transmissions: SleepTransmission[] = [];
	readonly metricsHistory: MetricsSnapshot[] = [];
	/** Agent ID → Cascade Generation。Patient Zero が 0 */
	readonly generations: Map<string, number> = new Map();
	/** その日の残業予定 tick-of-day（遅刻補填・残業で後ろ倒しされた終業） */
	readonly workEndOverrides: Map<string, number> = new Map();
	/** Agent ID → 直近の睡眠機会損失 Event（就寝時に参照する） */
	readonly pendingSleepLoss: Map<string, { minutes: number; causeEventIds: string[] }> = new Map();

	accidentCount = 0;
	trafficDelayMinutes = 0;
	overtimeHours = 0;
	totalSleepLossMinutes = 0;
	commuteDelayMinutesTotal = 0;
	commuteCount = 0;
	private eventSequence = 0;

	private readonly familyIndex: Map<string, string[]> = new Map();
	private readonly subordinateIndex: Map<string, string[]> = new Map();
	private readonly managerIndex: Map<string, string> = new Map();

	constructor(
		public readonly config: ExperimentConfig,
		public readonly city: City,
		agents: readonly Agent[],
		public clock: SimulationClock,
		public readonly relationships: readonly AgentRelationship[] = [],
	) {
		this.agents = new Map(agents.map((agent) => [agent.id, agent]));
		for (const relationship of relationships) {
			if (relationship.kind === 'family') {
				const members = this.familyIndex.get(relationship.fromAgentId) ?? [];
				members.push(relationship.toAgentId);
				this.familyIndex.set(relationship.fromAgentId, members);
			}
			if (relationship.kind === 'manager_of') {
				const members = this.subordinateIndex.get(relationship.fromAgentId) ?? [];
				members.push(relationship.toAgentId);
				this.subordinateIndex.set(relationship.fromAgentId, members);
				this.managerIndex.set(relationship.toAgentId, relationship.fromAgentId);
			}
		}
	}

	/** Household Network: 同居する family */
	familyOf(agentId: string): readonly string[] {
		return this.familyIndex.get(agentId) ?? [];
	}

	/** Work Network: manager の部下 */
	subordinatesOf(managerId: string): readonly string[] {
		return this.subordinateIndex.get(managerId) ?? [];
	}

	/** Work Network: その Agent の上司 */
	managerOf(agentId: string): string | undefined {
		return this.managerIndex.get(agentId);
	}

	/** ID 昇順で列挙する。Map の挿入順に依存しないことで再現性を保つ */
	orderedAgents(): Agent[] {
		return [...this.agents.values()].sort((a, b) => a.id.localeCompare(b.id));
	}

	/**
	 * Tick 内の意思決定順。Manager を先に処理する。
	 * 同一 Tick で部下が先に退勤してしまうと Work Network 経由の残業伝播が成立しないため、
	 * 上司が部下より先に残業要請を判断する順序を固定する（ID 昇順との複合キーで決定論を維持）。
	 */
	decisionOrderedAgents(): Agent[] {
		return [...this.agents.values()].sort((a, b) => {
			const priorityA = a.role === 'manager' ? 0 : 1;
			const priorityB = b.role === 'manager' ? 0 : 1;
			if (priorityA !== priorityB) {
				return priorityA - priorityB;
			}
			return a.id.localeCompare(b.id);
		});
	}

	agent(agentId: string): Agent {
		const agent = this.agents.get(agentId);
		if (agent === undefined) {
			throw new Error(`SimulationState: unknown agent ${agentId}`);
		}
		return agent;
	}

	/** 決定論的な Event ID を採番する */
	nextEventId(): string {
		this.eventSequence += 1;
		return `e${this.eventSequence}`;
	}

	/**
	 * Event を記録し、その Event が参照した入力 Event との因果エッジを生成する。
	 * CausalEdge はこの経路からのみ作られるため、時間的に近いだけの Event は繋がらない。
	 */
	recordEvent(event: SimulationEvent): SimulationEvent {
		this.events.push(event);
		this.eventIndex.set(event.id, event);
		for (const causeId of event.causedByEventIds) {
			this.causalEdges.push(CausalEdge.create({ fromEventId: causeId, toEventId: event.id }));
		}
		return event;
	}

	eventById(eventId: string): SimulationEvent | undefined {
		return this.eventIndex.get(eventId);
	}
}
