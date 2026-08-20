import type { AiDecisionGateway } from '../gateways/ai-decision.gateway';
import { scheduleForRole, scheduledBedTick } from '../models/agent-schedule.model';
import type { Agent } from '../models/agent.model';
import { City } from '../models/city.model';
import type { ExperimentConfig } from '../models/experiment-config.model';
import type { MetricsSnapshot, RunSummary } from '../models/metrics.model';
import {
	MINUTES_PER_TICK,
	SimulationClock,
	TICKS_PER_DAY,
	TICKS_PER_HOUR,
} from '../models/simulation-clock.model';
import { SimulationEvent } from '../models/simulation-event.model';
import { SimulationState } from '../models/simulation-state.model';
import { isSleepDeprivedState, sleepStateFrom } from '../models/sleep-state.model';
import { CascadeService } from './cascade.service';
import { DecisionTriggerService } from './decision-trigger.service';
import { FatigueService } from './fatigue.service';
import { InterventionService } from './intervention.service';
import { PopulationService } from './population.service';
import { ProbabilisticEventService } from './probabilistic-event.service';
import { ReproductionNumberService } from './reproduction-number.service';
import { SeededRandomService } from './seeded-random.service';
import { SleepTransmissionService } from './sleep-transmission.service';
import { SleepService } from './sleep.service';
import { TrafficService } from './traffic.service';

type AgentPhase =
	| 'sleeping'
	| 'morning'
	| 'commuting_to_work'
	| 'working'
	| 'overtime'
	| 'commuting_home'
	| 'home';

interface AgentRuntime {
	phase: AgentPhase;
	wakeTick: number;
	departTick: number;
	workStartTick: number;
	workEndTick: number;
	bedTick: number;
	/** 予定どおりの就寝 tick。ここからのズレが睡眠機会損失になる */
	scheduledBedTick: number;
	/** 予定どおりの帰宅 tick。実際の帰宅がこれより遅れた分だけ就寝が後ろへずれる */
	scheduledHomeArrivalTick: number;
	commuteTicks: number;
	remote: boolean;
	/** 到着遅延・残業の原因となった Event。下流 Event の causes に渡す */
	delayCauseEventIds: string[];
	overtimeTicks: number;
	lateMinutes: number;
	/** Delivery Worker の配送先 Store。固定割り当てにして Run の再現性を保つ */
	deliveryStoreId: string | undefined;
	/** その日の配送を済ませたか。1 日 1 回だけ配送する */
	deliveryDone: boolean;
}

/** 事故が道路へ与える混雑（分） */
const ACCIDENT_CONGESTION_MINUTES = 25;
/**
 * 出勤から配送到着までの Tick。
 * Delivery Worker は 8:00 始業、Store は 10:00 開店のため、開店後の品出し時間帯（11:00）に着く。
 * 開店前に着くと Store Worker がまだ出勤しておらず、遅配が店舗業務へ波及しない。
 */
const DELIVERY_TICKS_AFTER_WORK_START = 12;
/**
 * Store の業務が押し始める配送遅延（分）。
 * これ未満の遅れは店舗側の余裕時間で吸収され、他 Agent へは伝播しない。
 */
const DELIVERY_DELAY_THRESHOLD_MINUTES = 15;
/**
 * 1 回の配送遅延が Store Worker の終業を押す上限（分）。
 * 上限が無いと 1 件の遅配で店舗全員が深夜まで残ることになり、実態から離れる。
 * 上限を掛けるのは店舗へ反映する分だけで、遅配 Event には実際の遅延を記録する。
 */
const MAX_STORE_DELAY_MINUTES = 60;
/** 帰宅後の家事に要する Tick */
const HOUSEWORK_TICKS = 2;
/**
 * 帰宅後の夜の生活時間は圧縮できないものとして扱う。
 * したがって帰宅が予定より遅れた分は、そのまま 1:1 で就寝の遅れになる
 * （要件定義 21 章の Work End +20min → Sleep Opportunity -20min に対応）。
 */
/** Metrics を保存するサンプリング間隔（1 時間） */
const METRICS_SAMPLING_TICKS = TICKS_PER_HOUR;

/**
 * Tick ごとの処理順を固定した Simulation Engine（要件定義 11 章）。
 *
 * 時刻更新 → Scheduled Action 決定 → 移動処理 → Work / Household 処理
 * → Fatigue / Stress 更新 → Decision Trigger 判定 → 必要時のみ AI Decision
 * → 確率イベント判定 → Event Impact 伝播 → Sleep / Sleep Debt 更新
 * → Event 保存 → Causal Edge 保存 → Sleep Transmission 判定 → KPI 更新
 *
 * 外部依存を持たない純粋な TypeScript であり、ブラウザ・Node の双方で動作する。
 */
export class SimulationEngine {
	private readonly runtimes = new Map<string, AgentRuntime>();
	/**
	 * Store ごとに、その日すでに店舗業務へ反映した配送遅延（分）。
	 * 同じ店舗に複数の配送があるため、遅延をそのまま足し込むと 1 日で数時間ずれる。
	 * 店舗の遅れはその日いちばん遅れた配送で決まるものとして扱う。
	 */
	private readonly storeDelayByDay = new Map<string, { day: number; appliedMinutes: number }>();

	constructor(
		private readonly config: ExperimentConfig,
		private readonly aiDecisionGateway: AiDecisionGateway,
		private readonly populationService: PopulationService,
		private readonly sleepService: SleepService,
		private readonly fatigueService: FatigueService,
		private readonly trafficService: TrafficService,
		private readonly probabilisticEventService: ProbabilisticEventService,
		private readonly decisionTriggerService: DecisionTriggerService,
		private readonly sleepTransmissionService: SleepTransmissionService,
		private readonly reproductionNumberService: ReproductionNumberService,
		private readonly cascadeService: CascadeService,
		private readonly interventionService: InterventionService,
		private readonly cityRng: SeededRandomService,
		private readonly populationRng: SeededRandomService,
		private readonly shockRng: SeededRandomService,
		private readonly drivingRng: SeededRandomService,
	) {}

	/** Seed から用途別の独立乱数ストリームを組み立てる */
	static create(config: ExperimentConfig, aiDecisionGateway: AiDecisionGateway): SimulationEngine {
		const reproductionNumberService = new ReproductionNumberService();
		return new SimulationEngine(
			config,
			aiDecisionGateway,
			new PopulationService(),
			new SleepService(),
			new FatigueService(),
			new TrafficService(),
			new ProbabilisticEventService(SeededRandomService.forStream(config.seed, 'probabilistic')),
			new DecisionTriggerService(),
			new SleepTransmissionService(),
			reproductionNumberService,
			new CascadeService(reproductionNumberService),
			new InterventionService(config.intervention),
			SeededRandomService.forStream(config.seed, 'city'),
			SeededRandomService.forStream(config.seed, 'population'),
			SeededRandomService.forStream(config.seed, 'shock'),
			SeededRandomService.forStream(config.seed, 'driving'),
		);
	}

	/** Population と City を生成し、初期 Shock を適用した State を返す */
	initialize(): SimulationState {
		const city = City.generate(this.config.cityLayout, this.cityRng);
		const { agents, relationships } = this.populationService.generate(
			this.config,
			city,
			this.populationRng,
		);

		const state = new SimulationState(
			this.config,
			city,
			agents,
			SimulationClock.start(),
			relationships,
		);

		this.applyInitialShock(state);
		this.prepareRuntimes(state);
		return state;
	}

	/** Run 全体を実行する。onTick は Watch Mode の描画フック */
	async run(
		state: SimulationState,
		onTick?: (state: SimulationState) => void | Promise<void>,
	): Promise<RunSummary> {
		for (let tick = 0; tick < this.config.totalTicks; tick++) {
			await this.runTick(state);
			if (onTick !== undefined) {
				await onTick(state);
			}
		}
		return this.summarize(state);
	}

	/** 1 Tick 分を進める */
	async runTick(state: SimulationState): Promise<void> {
		const tick = state.clock.tick;

		for (const agent of state.decisionOrderedAgents()) {
			await this.stepAgent(state, agent, tick);
		}

		for (const agent of state.orderedAgents()) {
			this.sleepService.applyTick(agent);
			this.fatigueService.applyTick(agent);
		}

		this.trafficService.decay(state);

		if (tick % METRICS_SAMPLING_TICKS === 0) {
			state.metricsHistory.push(this.snapshot(state));
		}

		state.clock = state.clock.advance();
	}

	private async stepAgent(state: SimulationState, agent: Agent, tick: number): Promise<void> {
		const runtime = this.runtime(agent.id);

		switch (runtime.phase) {
			case 'sleeping':
				if (tick >= runtime.wakeTick) {
					this.wakeUp(state, agent, runtime, tick);
				}
				break;
			case 'morning':
				if (tick >= runtime.departTick) {
					this.departForWork(state, agent, runtime, tick);
				}
				break;
			case 'commuting_to_work':
				if (tick >= (state.travels.get(agent.id)?.arrivalTick ?? tick)) {
					this.arriveAtWork(state, agent, runtime, tick);
				}
				break;
			case 'working':
			case 'overtime':
				await this.work(state, agent, runtime, tick);
				break;
			case 'commuting_home':
				if (tick >= (state.travels.get(agent.id)?.arrivalTick ?? tick)) {
					this.arriveAtHome(state, agent, runtime, tick);
				}
				break;
			case 'home':
				await this.atHome(state, agent, runtime, tick);
				break;
		}
	}

	// ---- 各フェーズ ----

	private wakeUp(state: SimulationState, agent: Agent, runtime: AgentRuntime, tick: number): void {
		const { deficitHours, recoveredHours } = this.sleepService.closeNight(agent);

		if (deficitHours > 0) {
			const causes = runtime.delayCauseEventIds
				.map((id) => state.eventById(id))
				.filter((event): event is SimulationEvent => event !== undefined);

			const lossEvent = state.recordEvent(
				SimulationEvent.create({
					id: state.nextEventId(),
					tick,
					type: 'sleep_loss',
					actorId: agent.id,
					causes,
					impact: { sleepLossMinutes: Math.round(deficitHours * 60) },
				}),
			);
			state.totalSleepLossMinutes += deficitHours * 60;
			this.sleepTransmissionService.detect(state, lossEvent, deficitHours * 60);
			// Sleep Debt 確定後に状態遷移を評価する
			if (this.sleepTransmissionService.commitNightTransition(state, agent.id)) {
				this.recordSleepStateEvent(state, agent, tick, lossEvent);
			}
		} else {
			if (recoveredHours > 0) {
				state.recordEvent(
					SimulationEvent.create({
						id: state.nextEventId(),
						tick,
						type: 'recovery',
						actorId: agent.id,
						impact: { sleepLossMinutes: -Math.round(recoveredHours * 60) },
					}),
				);
			}
			this.sleepTransmissionService.commitNightTransition(state, agent.id);
		}

		runtime.delayCauseEventIds = [];
		runtime.phase = 'morning';
		agent.setAction('morning_routine');
		this.planDay(state, agent, runtime, tick);
	}

	private departForWork(
		state: SimulationState,
		agent: Agent,
		runtime: AgentRuntime,
		tick: number,
	): void {
		if (runtime.remote || agent.workplaceId === undefined) {
			runtime.phase = 'working';
			agent.setAction('working');
			return;
		}

		const { arrivalTick, causeEventIds, delayMinutes } = this.startTravel(
			state,
			agent,
			agent.homeId,
			agent.workplaceId,
			tick,
		);

		if (delayMinutes > 0) {
			const causes = causeEventIds
				.map((id) => state.eventById(id))
				.filter((event): event is SimulationEvent => event !== undefined);
			const delayEvent = state.recordEvent(
				SimulationEvent.create({
					id: state.nextEventId(),
					tick,
					type: 'commute_delay',
					actorId: agent.id,
					causes,
					impact: { delayMinutes },
				}),
			);
			runtime.delayCauseEventIds.push(delayEvent.id);
			state.commuteDelayMinutesTotal += delayMinutes;
		}
		state.commuteCount += 1;

		runtime.phase = 'commuting_to_work';
		agent.setAction(agent.role === 'driver' ? 'driving' : 'commuting');
		state.travels.set(agent.id, {
			agentId: agent.id,
			fromFacilityId: agent.homeId,
			toFacilityId: agent.workplaceId,
			arrivalTick,
			delayMinutes,
			delayCauseEventIds: causeEventIds,
		});
	}

	private arriveAtWork(
		state: SimulationState,
		agent: Agent,
		runtime: AgentRuntime,
		tick: number,
	): void {
		state.travels.delete(agent.id);
		if (agent.workplaceId !== undefined) {
			agent.moveTo(agent.workplaceId);
		}

		if (tick > runtime.workStartTick) {
			const lateMinutes = (tick - runtime.workStartTick) * MINUTES_PER_TICK;
			runtime.lateMinutes = lateMinutes;

			const causes = runtime.delayCauseEventIds
				.map((id) => state.eventById(id))
				.filter((event): event is SimulationEvent => event !== undefined);
			const lateEvent = state.recordEvent(
				SimulationEvent.create({
					id: state.nextEventId(),
					tick,
					type: 'late_arrival',
					actorId: agent.id,
					causes,
					impact: { delayMinutes: lateMinutes, stressDelta: 5 },
				}),
			);
			this.fatigueService.applyImpact(agent, 0, 5);
			runtime.delayCauseEventIds = [lateEvent.id];

			// 遅刻分は残業で補填する（Flexible Work では補填しない）
			if (this.interventionService.requiresLatenessCompensation()) {
				runtime.workEndTick += tick - runtime.workStartTick;
			}
		}

		runtime.phase = 'working';
		agent.setAction(this.workActionFor(agent));
	}

	private async work(
		state: SimulationState,
		agent: Agent,
		runtime: AgentRuntime,
		tick: number,
	): Promise<void> {
		// 運転職の事故抽選。AI が continue_driving を選んだ場合のみ行われる
		if (agent.role === 'driver' || agent.role === 'delivery_worker') {
			await this.handleDrivingDecision(state, agent, runtime, tick);
		} else if (runtime.phase === 'working') {
			this.rollWorkFailure(state, agent, runtime, tick);
		}

		if (agent.role === 'delivery_worker') {
			this.deliverToStore(state, agent, runtime, tick);
		}

		if (tick < runtime.workEndTick) {
			return;
		}

		if (runtime.phase === 'working') {
			const decided = await this.decideOvertime(state, agent, runtime, tick);
			if (decided) {
				return;
			}
		}

		this.departForHome(state, agent, runtime, tick);
	}

	/**
	 * 作業ミスの抽選。疲労した非運転職から Work Network へ伝播させる経路。
	 * ミスの手直しは上司の業務を圧迫し、上司の終業を遅らせる。
	 * これが無いと運転職以外は他者へ伝播できず、Cascade が 1 Generation で止まる。
	 */
	private rollWorkFailure(
		state: SimulationState,
		agent: Agent,
		runtime: AgentRuntime,
		tick: number,
	): void {
		if (!this.probabilisticEventService.rollWorkFailure(agent)) {
			return;
		}

		const causes = runtime.delayCauseEventIds
			.map((id) => state.eventById(id))
			.filter((event): event is SimulationEvent => event !== undefined);
		const failureEvent = state.recordEvent(
			SimulationEvent.create({
				id: state.nextEventId(),
				tick,
				type: 'work_failure',
				actorId: agent.id,
				causes,
				impact: { stressDelta: 6 },
			}),
		);
		this.fatigueService.applyImpact(agent, 0, 6);

		const managerId = state.managerOf(agent.id);
		if (managerId === undefined || failureEvent.isAtMaxDepth) {
			return;
		}
		const manager = state.agents.get(managerId);
		const managerRuntime = this.runtimes.get(managerId);
		if (manager === undefined || managerRuntime === undefined) {
			return;
		}
		if (managerRuntime.phase !== 'working' && managerRuntime.phase !== 'overtime') {
			return;
		}

		// 手直し対応で上司の終業が後ろへずれる
		const reworkTicks = Math.max(1, Math.round(2 * manager.responsibility));
		managerRuntime.workEndTick += reworkTicks;
		const delayEvent = state.recordEvent(
			SimulationEvent.create({
				id: state.nextEventId(),
				tick,
				type: 'work_delay',
				actorId: manager.id,
				causes: [failureEvent],
				impact: { delayMinutes: reworkTicks * MINUTES_PER_TICK, stressDelta: 3 },
			}),
		);
		this.fatigueService.applyImpact(manager, 0, 3);
		managerRuntime.delayCauseEventIds.push(delayEvent.id);
	}

	/**
	 * Logistics Hub → Delivery Worker → Store の連鎖（要件定義 5 章）。
	 *
	 * 遅れて配送された分だけ Store の開店準備・品出しが後ろへずれ、Store Worker の終業が延びる。
	 * 運転職の遅延が Transportation Network から Work Network へ渡る経路であり、
	 * これが無いと Delivery Worker は事故を起こしたときしか他者へ伝播できない。
	 */
	private deliverToStore(
		state: SimulationState,
		agent: Agent,
		runtime: AgentRuntime,
		tick: number,
	): void {
		if (runtime.deliveryDone || runtime.deliveryStoreId === undefined) {
			return;
		}
		if (tick < runtime.workStartTick + DELIVERY_TICKS_AFTER_WORK_START) {
			return;
		}

		runtime.deliveryDone = true;

		// 出勤の遅れがそのまま配送の遅れになる。定刻どおりなら店舗へ影響しない
		const deliveryDelayMinutes = runtime.lateMinutes;
		if (deliveryDelayMinutes < DELIVERY_DELAY_THRESHOLD_MINUTES) {
			return;
		}

		const causes = runtime.delayCauseEventIds
			.map((id) => state.eventById(id))
			.filter((event): event is SimulationEvent => event !== undefined);
		const deliveryEvent = state.recordEvent(
			SimulationEvent.create({
				id: state.nextEventId(),
				tick,
				type: 'delivery_delay',
				actorId: agent.id,
				targetIds: [runtime.deliveryStoreId],
				causes,
				impact: { delayMinutes: deliveryDelayMinutes, stressDelta: 3 },
			}),
		);
		this.fatigueService.applyImpact(agent, 0, 3);

		if (deliveryEvent.isAtMaxDepth) {
			return;
		}

		const storeDelayMinutes = Math.min(deliveryDelayMinutes, MAX_STORE_DELAY_MINUTES);
		const day = Math.floor(tick / TICKS_PER_DAY);
		const applied = this.storeDelayByDay.get(runtime.deliveryStoreId);
		const alreadyApplied =
			applied !== undefined && applied.day === day ? applied.appliedMinutes : 0;

		const additionalMinutes = storeDelayMinutes - alreadyApplied;
		if (additionalMinutes < DELIVERY_DELAY_THRESHOLD_MINUTES) {
			return;
		}

		// 反映しなかった遅延を記録すると、以後の遅配が過大な値との差分で判定され取りこぼす。
		// 実際に店舗業務へ反映した分だけを残す
		this.storeDelayByDay.set(runtime.deliveryStoreId, { day, appliedMinutes: storeDelayMinutes });

		const delayTicks = Math.max(1, Math.round(additionalMinutes / MINUTES_PER_TICK));
		for (const storeWorker of state.orderedAgents()) {
			if (storeWorker.workplaceId !== runtime.deliveryStoreId) {
				continue;
			}
			const workerRuntime = this.runtimes.get(storeWorker.id);
			if (workerRuntime === undefined) {
				continue;
			}
			// Tick 内の処理順に依存しないよう phase ではなく勤務時間で判定する。
			// Delivery Worker が先に処理される Tick では、同じ Tick に到着した Store Worker が
			// まだ commuting_to_work のままで、遅配の影響を取りこぼす
			if (tick < workerRuntime.workStartTick || tick >= workerRuntime.workEndTick) {
				continue;
			}

			workerRuntime.workEndTick += delayTicks;
			const storeEvent = state.recordEvent(
				SimulationEvent.create({
					id: state.nextEventId(),
					tick,
					type: 'store_delay',
					actorId: storeWorker.id,
					causes: [deliveryEvent],
					impact: { delayMinutes: delayTicks * MINUTES_PER_TICK, stressDelta: 3 },
				}),
			);
			this.fatigueService.applyImpact(storeWorker, 0, 3);
			workerRuntime.delayCauseEventIds.push(storeEvent.id);
		}
	}

	private async handleDrivingDecision(
		state: SimulationState,
		agent: Agent,
		runtime: AgentRuntime,
		tick: number,
	): Promise<void> {
		if (this.interventionService.forcesRest(agent)) {
			agent.setAction('resting');
			return;
		}

		const request = this.decisionTriggerService.evaluate(agent, {
			isDriving: true,
			isAtWorkEnd: false,
			deliveryDelayMinutes: runtime.lateMinutes,
			isHomeWithHousework: false,
			deadlinePressure: agent.workPressure,
		});
		if (request === undefined) {
			return;
		}

		const result = await this.aiDecisionGateway.decide(request.context);
		agent.recordDecision({ ...result, tick });
		const decisionEvent = state.recordEvent(
			SimulationEvent.create({
				id: state.nextEventId(),
				tick,
				type: 'decision',
				actorId: agent.id,
			}),
		);

		if (result.action === 'rest') {
			agent.setAction('resting');
			return;
		}

		agent.setAction(agent.role === 'driver' ? 'driving' : 'delivering');
		const accidentOccurred = this.probabilisticEventService.rollAccident(agent, {
			trafficLevel: this.config.trafficLevel,
			riskyActionChosen: true,
		});
		if (accidentOccurred) {
			this.causeAccident(state, agent, tick, decisionEvent);
		}
	}

	private causeAccident(
		state: SimulationState,
		agent: Agent,
		tick: number,
		decisionEvent: SimulationEvent,
	): void {
		const accidentEvent = state.recordEvent(
			SimulationEvent.create({
				id: state.nextEventId(),
				tick,
				type: 'accident',
				actorId: agent.id,
				causes: [decisionEvent],
				impact: { fatigueDelta: 5, stressDelta: 20 },
			}),
		);
		this.fatigueService.applyImpact(agent, 5, 20);
		state.accidentCount += 1;

		// Driver / Delivery Worker は勤務中に都市全体を走行する。
		// 配送先はオフィス地区・商業地区に集中するため、事故もそこへ接続する道路で起きやすい。
		// 通勤路と配送路が同じ Transportation Network を共有することが伝播の前提になる。
		const deliveryRoads = state.city.roads.filter((candidate) => {
			const districts = state.city.districts;
			const isBusy = (districtId: string): boolean =>
				districts.some(
					(district) =>
						district.id === districtId &&
						(district.type === 'office' || district.type === 'commercial'),
				);
			return isBusy(candidate.fromDistrictId) || isBusy(candidate.toDistrictId);
		});
		const roadPool = deliveryRoads.length > 0 ? deliveryRoads : state.city.roads;
		if (roadPool.length === 0) {
			return;
		}
		const road = this.drivingRng.pick(roadPool);

		const jamEvent = state.recordEvent(
			SimulationEvent.create({
				id: state.nextEventId(),
				tick,
				type: 'traffic_jam',
				actorId: agent.id,
				causes: [accidentEvent],
				impact: { delayMinutes: ACCIDENT_CONGESTION_MINUTES },
			}),
		);
		const affectedRoads = this.trafficService.addAccidentCongestion(
			state,
			road,
			ACCIDENT_CONGESTION_MINUTES,
			jamEvent.id,
		);
		state.trafficDelayMinutes += ACCIDENT_CONGESTION_MINUTES;
		for (const affected of affectedRoads) {
			this.delayTravelersOnRoad(state, affected.id, tick, jamEvent);
		}
	}

	/**
	 * 渋滞は「これから出発する人」だけでなく「既に道路上にいる人」も巻き込む。
	 * ここで到着 tick を延長し、遅延 Event の原因として渋滞 Event を参照させることで、
	 * 事故 → 渋滞 → 通勤遅延 の因果がデータ参照経路として確定する。
	 */
	private delayTravelersOnRoad(
		state: SimulationState,
		roadId: string,
		tick: number,
		jamEvent: SimulationEvent,
	): void {
		if (jamEvent.isAtMaxDepth) {
			return;
		}
		const extraTicks = Math.ceil(ACCIDENT_CONGESTION_MINUTES / MINUTES_PER_TICK);

		for (const travel of [...state.travels.values()].sort((a, b) =>
			a.agentId.localeCompare(b.agentId),
		)) {
			const road = state.city.roadBetween(travel.fromFacilityId, travel.toFacilityId);
			if (road?.id !== roadId) {
				continue;
			}

			travel.arrivalTick += extraTicks;
			travel.delayMinutes += ACCIDENT_CONGESTION_MINUTES;
			travel.delayCauseEventIds.push(jamEvent.id);

			const delayEvent = state.recordEvent(
				SimulationEvent.create({
					id: state.nextEventId(),
					tick,
					type: 'commute_delay',
					actorId: travel.agentId,
					causes: [jamEvent],
					impact: { delayMinutes: ACCIDENT_CONGESTION_MINUTES },
				}),
			);
			state.commuteDelayMinutesTotal += ACCIDENT_CONGESTION_MINUTES;

			const travelerRuntime = this.runtimes.get(travel.agentId);
			if (travelerRuntime !== undefined) {
				travelerRuntime.delayCauseEventIds.push(delayEvent.id);
			}
		}
	}

	/** 終業時の残業判断。残業した場合 true */
	private async decideOvertime(
		state: SimulationState,
		agent: Agent,
		runtime: AgentRuntime,
		tick: number,
	): Promise<boolean> {
		const request = this.decisionTriggerService.evaluate(agent, {
			isDriving: false,
			isAtWorkEnd: true,
			deliveryDelayMinutes: 0,
			isHomeWithHousework: false,
			deadlinePressure: agent.workPressure,
		});
		if (request === undefined) {
			return false;
		}

		const result = await this.aiDecisionGateway.decide(request.context);
		agent.recordDecision({ ...result, tick });
		const decisionEvent = state.recordEvent(
			SimulationEvent.create({
				id: state.nextEventId(),
				tick,
				type: 'decision',
				actorId: agent.id,
				causes: runtime.delayCauseEventIds
					.map((id) => state.eventById(id))
					.filter((event): event is SimulationEvent => event !== undefined),
			}),
		);

		if (result.action !== 'overtime') {
			return false;
		}

		const overtimeTicks = Math.min(
			this.interventionService.maxOvertimeTicks(),
			Math.round(2 * TICKS_PER_HOUR * agent.workPressure) + 1,
		);
		runtime.workEndTick = tick + overtimeTicks;
		runtime.overtimeTicks += overtimeTicks;
		runtime.phase = 'overtime';
		agent.setAction('overtime');
		state.overtimeHours += (overtimeTicks * MINUTES_PER_TICK) / 60;

		const overtimeEvent = state.recordEvent(
			SimulationEvent.create({
				id: state.nextEventId(),
				tick,
				type: 'overtime',
				actorId: agent.id,
				causes: [decisionEvent],
				impact: { delayMinutes: overtimeTicks * MINUTES_PER_TICK },
			}),
		);
		runtime.delayCauseEventIds.push(overtimeEvent.id);

		// Work Network: Manager の残業は部下へ波及する
		if (agent.role === 'manager') {
			this.propagateOvertimeToSubordinates(state, agent, tick, overtimeEvent, overtimeTicks);
		}
		return true;
	}

	private propagateOvertimeToSubordinates(
		state: SimulationState,
		manager: Agent,
		tick: number,
		overtimeEvent: SimulationEvent,
		overtimeTicks: number,
	): void {
		if (overtimeEvent.isAtMaxDepth) {
			return;
		}
		for (const subordinateId of state.subordinatesOf(manager.id)) {
			const subordinate = state.agents.get(subordinateId);
			const subordinateRuntime = this.runtimes.get(subordinateId);
			if (subordinate === undefined || subordinateRuntime === undefined) {
				continue;
			}
			if (subordinateRuntime.phase !== 'working' && subordinateRuntime.phase !== 'overtime') {
				continue;
			}

			const requestedTicks = Math.max(1, Math.round(overtimeTicks * subordinate.cooperativeness));
			subordinateRuntime.workEndTick = Math.max(
				subordinateRuntime.workEndTick,
				tick + requestedTicks,
			);
			subordinateRuntime.overtimeTicks += requestedTicks;
			subordinateRuntime.phase = 'overtime';
			subordinate.setAction('overtime');
			state.overtimeHours += (requestedTicks * MINUTES_PER_TICK) / 60;

			const propagated = state.recordEvent(
				SimulationEvent.create({
					id: state.nextEventId(),
					tick,
					type: 'overtime',
					actorId: subordinate.id,
					causes: [overtimeEvent],
					impact: { delayMinutes: requestedTicks * MINUTES_PER_TICK, stressDelta: 4 },
				}),
			);
			this.fatigueService.applyImpact(subordinate, 0, 4);
			subordinateRuntime.delayCauseEventIds.push(propagated.id);
		}
	}

	private departForHome(
		state: SimulationState,
		agent: Agent,
		runtime: AgentRuntime,
		tick: number,
	): void {
		if (runtime.remote || agent.workplaceId === undefined) {
			this.arriveAtHome(state, agent, runtime, tick);
			return;
		}

		const { arrivalTick, causeEventIds, delayMinutes } = this.startTravel(
			state,
			agent,
			agent.workplaceId,
			agent.homeId,
			tick,
		);
		if (delayMinutes > 0) {
			const causes = causeEventIds
				.map((id) => state.eventById(id))
				.filter((event): event is SimulationEvent => event !== undefined);
			const delayEvent = state.recordEvent(
				SimulationEvent.create({
					id: state.nextEventId(),
					tick,
					type: 'commute_delay',
					actorId: agent.id,
					causes,
					impact: { delayMinutes },
				}),
			);
			runtime.delayCauseEventIds.push(delayEvent.id);
			state.commuteDelayMinutesTotal += delayMinutes;
		}
		state.commuteCount += 1;

		runtime.phase = 'commuting_home';
		agent.setAction(agent.role === 'driver' ? 'driving' : 'commuting');
		state.travels.set(agent.id, {
			agentId: agent.id,
			fromFacilityId: agent.workplaceId,
			toFacilityId: agent.homeId,
			arrivalTick,
			delayMinutes,
			delayCauseEventIds: causeEventIds,
		});
	}

	private arriveAtHome(
		state: SimulationState,
		agent: Agent,
		runtime: AgentRuntime,
		tick: number,
	): void {
		state.travels.delete(agent.id);
		agent.moveTo(agent.homeId);
		runtime.phase = 'home';
		agent.setAction(agent.isParent ? 'housework' : 'idle');

		// 帰宅が遅れた分だけ就寝が後ろへずれる（夜の生活時間は圧縮できない）。
		// 自分自身の家事は通常スケジュールに織り込み済みなのでここでは加算しない。
		// 家族の帰宅遅れによって回ってきた分だけが propagateHouseworkToFamily で加算される
		const latenessTicks = Math.max(0, tick - runtime.scheduledHomeArrivalTick);
		const newBedTick = runtime.scheduledBedTick + latenessTicks;
		if (newBedTick > runtime.bedTick) {
			runtime.bedTick = newBedTick;
		}

		// Household Network: 帰宅が遅れた Parent の家事は family へ回る
		if (agent.isParent && newBedTick > runtime.scheduledBedTick) {
			this.propagateHouseworkToFamily(state, agent, runtime, tick);
		}
	}

	private propagateHouseworkToFamily(
		state: SimulationState,
		agent: Agent,
		runtime: AgentRuntime,
		tick: number,
	): void {
		const causes = runtime.delayCauseEventIds
			.map((id) => state.eventById(id))
			.filter((event): event is SimulationEvent => event !== undefined);
		if (causes.length === 0 || causes.some((cause) => cause.isAtMaxDepth)) {
			return;
		}

		for (const familyId of state.familyOf(agent.id)) {
			const familyMember = state.agents.get(familyId);
			const familyRuntime = this.runtimes.get(familyId);
			if (familyMember === undefined || familyRuntime === undefined) {
				continue;
			}
			if (familyRuntime.phase !== 'home') {
				continue;
			}

			const extraTicks = Math.max(
				1,
				Math.round(HOUSEWORK_TICKS * familyMember.familyResponsibility),
			);
			familyRuntime.bedTick = Math.max(familyRuntime.bedTick, tick + extraTicks);
			familyMember.setAction('housework');

			const delayEvent = state.recordEvent(
				SimulationEvent.create({
					id: state.nextEventId(),
					tick,
					type: 'household_delay',
					actorId: familyMember.id,
					causes,
					impact: { delayMinutes: extraTicks * MINUTES_PER_TICK, fatigueDelta: 2 },
				}),
			);
			this.fatigueService.applyImpact(familyMember, 2, 0);
			familyRuntime.delayCauseEventIds.push(delayEvent.id);
		}
	}

	private async atHome(
		state: SimulationState,
		agent: Agent,
		runtime: AgentRuntime,
		tick: number,
	): Promise<void> {
		if (agent.isParent && agent.currentAction === 'housework') {
			const request = this.decisionTriggerService.evaluate(agent, {
				isDriving: false,
				isAtWorkEnd: false,
				deliveryDelayMinutes: 0,
				isHomeWithHousework: true,
				deadlinePressure: 0,
			});
			if (request !== undefined) {
				const result = await this.aiDecisionGateway.decide(request.context);
				agent.recordDecision({ ...result, tick });
				if (result.action === 'sleep') {
					runtime.bedTick = Math.min(runtime.bedTick, tick);
				}
				agent.setAction(result.action === 'do_housework' ? 'housework' : 'idle');
			}
		}

		if (tick < runtime.bedTick) {
			return;
		}

		// 予定より遅い就寝は睡眠機会損失として記録する
		const lostTicks = runtime.bedTick - runtime.scheduledBedTick;
		if (lostTicks > 0) {
			const causes = runtime.delayCauseEventIds
				.map((id) => state.eventById(id))
				.filter((event): event is SimulationEvent => event !== undefined);
			const lossMinutes = lostTicks * MINUTES_PER_TICK;
			const lossEvent = state.recordEvent(
				SimulationEvent.create({
					id: state.nextEventId(),
					tick,
					type: 'sleep_opportunity_loss',
					actorId: agent.id,
					causes,
					impact: { sleepLossMinutes: lossMinutes },
				}),
			);
			runtime.delayCauseEventIds = [lossEvent.id];
			this.sleepTransmissionService.detect(state, lossEvent, lossMinutes);
		}

		runtime.phase = 'sleeping';
		agent.setAction('sleeping');
	}

	// ---- 補助 ----

	private startTravel(
		state: SimulationState,
		agent: Agent,
		fromFacilityId: string,
		toFacilityId: string,
		tick: number,
	): { arrivalTick: number; causeEventIds: string[]; delayMinutes: number } {
		const road = state.city.roadBetween(fromFacilityId, toFacilityId);
		const congestion = this.trafficService.congestionOn(state, road?.id);
		const delayMinutes = congestion?.extraMinutes ?? 0;
		const travelMinutes = state.city.travelMinutes(fromFacilityId, toFacilityId, delayMinutes);

		return {
			arrivalTick: tick + Math.max(1, Math.ceil(travelMinutes / MINUTES_PER_TICK)),
			causeEventIds: congestion === undefined ? [] : [congestion.causedByEventId],
			delayMinutes,
		};
	}

	private recordSleepStateEvent(
		state: SimulationState,
		agent: Agent,
		tick: number,
		cause: SimulationEvent,
	): void {
		const stateName = agent.sleepState(this.config.sleepStateThresholds);
		if (!isSleepDeprivedState(stateName)) {
			return;
		}
		state.recordEvent(
			SimulationEvent.create({
				id: state.nextEventId(),
				tick,
				type: stateName === 'severe_sleep_deprived' ? 'severe_sleep_deprived' : 'sleep_deprived',
				actorId: agent.id,
				causes: [cause],
			}),
		);
	}

	private workActionFor(agent: Agent): 'working' | 'driving' | 'delivering' {
		if (agent.role === 'driver') {
			return 'driving';
		}
		if (agent.role === 'delivery_worker') {
			return 'delivering';
		}
		return 'working';
	}

	private runtime(agentId: string): AgentRuntime {
		const runtime = this.runtimes.get(agentId);
		if (runtime === undefined) {
			throw new Error(`SimulationEngine: runtime not prepared for ${agentId}`);
		}
		return runtime;
	}

	private prepareRuntimes(state: SimulationState): void {
		const agents = state.orderedAgents();
		for (let index = 0; index < agents.length; index++) {
			const agent = agents[index] as Agent;
			const commuteTicks = this.estimateCommuteTicks(state, agent);
			const schedule = scheduleForRole(agent.role, commuteTicks);

			const firstNightBedTick = scheduledBedTick(
				0,
				TICKS_PER_DAY + schedule.wakeTickOfDay,
				agent.sleepNeedHours,
			);

			this.runtimes.set(agent.id, {
				phase: 'sleeping',
				wakeTick: schedule.wakeTickOfDay,
				departTick: schedule.departForWorkTickOfDay,
				workStartTick: schedule.workStartTickOfDay,
				workEndTick: schedule.workEndTickOfDay,
				bedTick: firstNightBedTick,
				scheduledBedTick: firstNightBedTick,
				scheduledHomeArrivalTick: schedule.workEndTickOfDay + commuteTicks,
				commuteTicks,
				remote: this.interventionService.isRemoteWorker(agent, index),
				delayCauseEventIds: [],
				overtimeTicks: 0,
				lateMinutes: 0,
				deliveryStoreId:
					agent.role === 'delivery_worker' ? this.deliveryStoreFor(state, index) : undefined,
				deliveryDone: false,
			});

			// 初日の朝に人為的な睡眠不足が発生しないよう、起床までの睡眠を先行して計上する
			agent.recordSleepMinutes(
				Math.max(0, agent.sleepNeedHours * 60 - schedule.wakeTickOfDay * MINUTES_PER_TICK),
			);
		}
	}

	/** 起床時に翌日分の予定を組み直す */
	private planDay(state: SimulationState, agent: Agent, runtime: AgentRuntime, tick: number): void {
		const dayStart = Math.floor(tick / TICKS_PER_DAY) * TICKS_PER_DAY;
		const schedule = scheduleForRole(agent.role, runtime.commuteTicks);

		runtime.departTick = dayStart + schedule.departForWorkTickOfDay;
		runtime.workStartTick = dayStart + schedule.workStartTickOfDay;
		runtime.workEndTick = dayStart + schedule.workEndTickOfDay;
		runtime.wakeTick = dayStart + TICKS_PER_DAY + schedule.wakeTickOfDay;
		runtime.scheduledBedTick = scheduledBedTick(dayStart, runtime.wakeTick, agent.sleepNeedHours);
		runtime.bedTick = runtime.scheduledBedTick;
		runtime.scheduledHomeArrivalTick = runtime.workEndTick + runtime.commuteTicks;
		runtime.lateMinutes = 0;
		runtime.deliveryDone = false;
	}

	/** 配送先 Store の割り当て。Agent の並び順から決めることで Seed 固定なら毎回同じになる */
	private deliveryStoreFor(state: SimulationState, index: number): string | undefined {
		const stores = state.city.facilitiesOfType('store');
		if (stores.length === 0) {
			return undefined;
		}
		return stores[index % stores.length]?.id;
	}

	private estimateCommuteTicks(state: SimulationState, agent: Agent): number {
		if (agent.workplaceId === undefined) {
			return 1;
		}
		const minutes = state.city.travelMinutes(agent.homeId, agent.workplaceId, 0);
		return Math.max(1, Math.ceil(minutes / MINUTES_PER_TICK));
	}

	/** 初期 Shock（Patient Zero の設定）。Generation 0 として記録する */
	private applyInitialShock(state: SimulationState): void {
		const selected = this.selectPatientZeros(state);
		for (const agentId of selected) {
			const agent = state.agent(agentId);
			agent.addSleepDebtHours(this.config.initialSleepDebtHours);
			agent.addFatigue(this.config.initialSleepDebtHours * 8);
			agent.commitSleepStateTransition(this.config.sleepStateThresholds);
			state.generations.set(agentId, 0);
		}
	}

	/**
	 * Patient Zero を選ぶ。
	 * patientZeroAgentId が指定されていればその 1 人だけを起点にする
	 * （Super-spreader 探索で Agent ごとの伝播力を測るため）。
	 */
	private selectPatientZeros(state: SimulationState): string[] {
		if (this.config.patientZeroAgentId !== null) {
			return state.agents.has(this.config.patientZeroAgentId)
				? [this.config.patientZeroAgentId]
				: [];
		}

		if (this.config.shockTarget === 'none' || this.config.initialSleepDeprivedRate <= 0) {
			return [];
		}

		const candidates = state
			.orderedAgents()
			.filter((agent) => this.matchesShockTarget(agent))
			.map((agent) => agent.id);
		if (candidates.length === 0) {
			return [];
		}

		const targetCount = Math.max(
			1,
			Math.round(state.config.population * this.config.initialSleepDeprivedRate),
		);
		return this.shockRng.shuffle(candidates).slice(0, targetCount);
	}

	private matchesShockTarget(agent: Agent): boolean {
		switch (this.config.shockTarget) {
			case 'driver':
				return agent.role === 'driver' || agent.role === 'delivery_worker';
			case 'manager':
				return agent.role === 'manager';
			case 'random':
				return true;
			case 'none':
				return false;
		}
	}

	// ---- KPI ----

	snapshot(state: SimulationState): MetricsSnapshot {
		const thresholds = this.config.sleepStateThresholds;
		let deprived = 0;
		let severe = 0;
		let totalSleepDebtHours = 0;

		for (const agent of state.agents.values()) {
			const stateName = agent.sleepState(thresholds);
			totalSleepDebtHours += agent.sleepDebtHours;
			if (isSleepDeprivedState(stateName)) {
				deprived += 1;
			}
			if (stateName === 'severe_sleep_deprived') {
				severe += 1;
			}
		}

		const cascade = this.cascadeService.evaluate(state);
		return {
			tick: state.clock.tick,
			currentRs: this.reproductionNumberService.currentRs(state),
			sleepDeprivedPopulation: deprived,
			severeSleepDeprivedPopulation: severe,
			totalSleepDebtHours,
			totalSleepLossMinutes: state.totalSleepLossMinutes,
			cascadeReach: cascade.reach,
			cascadeDepth: cascade.depth,
			cascadeGeneration: cascade.generation,
			accidentCount: state.accidentCount,
			trafficDelayMinutes: state.trafficDelayMinutes,
			overtimeHours: state.overtimeHours,
			averageCommuteDelayMinutes:
				state.commuteCount === 0 ? 0 : state.commuteDelayMinutesTotal / state.commuteCount,
		};
	}

	summarize(state: SimulationState): RunSummary {
		const latest = this.snapshot(state);
		const rsSeries = this.reproductionNumberService.rsByGeneration(state);
		const peakRs = rsSeries.length === 0 ? 0 : Math.max(...rsSeries);
		const averageRs =
			rsSeries.length === 0 ? 0 : rsSeries.reduce((sum, rs) => sum + rs, 0) / rsSeries.length;
		const cascade = this.cascadeService.evaluate(state);

		// latest には tick が含まれるが RunSummary は断面の時刻を持たないため、必要な項目だけを取る
		const { tick: _tick, ...metrics } = latest;
		return {
			...metrics,
			peakRs,
			averageRs,
			cascadeOccurred: cascade.occurred,
			outbreakOccurred: cascade.outbreakOccurred,
			dampingGeneration: cascade.dampingGeneration,
		};
	}
}
