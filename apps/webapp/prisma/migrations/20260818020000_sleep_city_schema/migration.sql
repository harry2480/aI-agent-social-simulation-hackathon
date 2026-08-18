-- Product Starter のサンプルテーブルを削除し、SLEEP CITY 2.0 のスキーマを作成する
DROP TABLE IF EXISTS "jokes";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "experiments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "config_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulation_runs" (
    "id" TEXT NOT NULL,
    "experiment_id" TEXT,
    "seed" INTEGER NOT NULL,
    "population" INTEGER NOT NULL,
    "days" INTEGER NOT NULL,
    "intervention" TEXT,
    "ai_model" TEXT,
    "status" TEXT NOT NULL,
    "config_json" JSONB NOT NULL,
    "summary_json" JSONB,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "simulation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "agent_key" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "home_id" TEXT NOT NULL,
    "workplace_id" TEXT,
    "sleep_need_hours" DOUBLE PRECISION NOT NULL,
    "responsibility" DOUBLE PRECISION NOT NULL,
    "risk_tolerance" DOUBLE PRECISION NOT NULL,
    "cooperativeness" DOUBLE PRECISION NOT NULL,
    "family_responsibility" DOUBLE PRECISION NOT NULL,
    "final_sleep_debt_hours" DOUBLE PRECISION NOT NULL,
    "final_fatigue" DOUBLE PRECISION NOT NULL,
    "final_stress" DOUBLE PRECISION NOT NULL,
    "final_sleep_state" TEXT NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_relationships" (
    "id" TEXT NOT NULL,
    "from_agent_id" TEXT NOT NULL,
    "to_agent_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "strength" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "agent_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "event_key" TEXT NOT NULL,
    "tick" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "actor_key" TEXT,
    "target_keys" TEXT[],
    "depth" INTEGER NOT NULL,
    "impact_json" JSONB NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "causal_edges" (
    "id" TEXT NOT NULL,
    "from_event_id" TEXT NOT NULL,
    "to_event_id" TEXT NOT NULL,
    "contribution" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "causal_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_decisions" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "agent_id" TEXT,
    "tick" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "context_json" JSONB NOT NULL,

    CONSTRAINT "agent_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metrics" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "tick" INTEGER NOT NULL,
    "snapshot_json" JSONB NOT NULL,

    CONSTRAINT "metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiment_results" (
    "id" TEXT NOT NULL,
    "experiment_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "run_count" INTEGER NOT NULL,
    "cascade_probability" DOUBLE PRECISION NOT NULL,
    "average_rs" DOUBLE PRECISION NOT NULL,
    "peak_rs" DOUBLE PRECISION NOT NULL,
    "average_reach" DOUBLE PRECISION NOT NULL,
    "total_sleep_loss_minutes" DOUBLE PRECISION NOT NULL,
    "standard_deviation" DOUBLE PRECISION NOT NULL,
    "aggregate_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiment_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "simulation_runs_experiment_id_idx" ON "simulation_runs"("experiment_id");

-- CreateIndex
CREATE INDEX "agents_run_id_idx" ON "agents"("run_id");

-- CreateIndex
CREATE UNIQUE INDEX "agents_run_id_agent_key_key" ON "agents"("run_id", "agent_key");

-- CreateIndex
CREATE INDEX "agent_relationships_from_agent_id_idx" ON "agent_relationships"("from_agent_id");

-- CreateIndex
CREATE INDEX "agent_relationships_to_agent_id_idx" ON "agent_relationships"("to_agent_id");

-- CreateIndex
CREATE INDEX "events_run_id_tick_idx" ON "events"("run_id", "tick");

-- CreateIndex
CREATE UNIQUE INDEX "events_run_id_event_key_key" ON "events"("run_id", "event_key");

-- CreateIndex
CREATE INDEX "causal_edges_from_event_id_idx" ON "causal_edges"("from_event_id");

-- CreateIndex
CREATE INDEX "causal_edges_to_event_id_idx" ON "causal_edges"("to_event_id");

-- CreateIndex
CREATE INDEX "agent_decisions_run_id_tick_idx" ON "agent_decisions"("run_id", "tick");

-- CreateIndex
CREATE INDEX "metrics_run_id_idx" ON "metrics"("run_id");

-- CreateIndex
CREATE UNIQUE INDEX "metrics_run_id_tick_key" ON "metrics"("run_id", "tick");

-- CreateIndex
CREATE INDEX "experiment_results_experiment_id_idx" ON "experiment_results"("experiment_id");

-- AddForeignKey
ALTER TABLE "simulation_runs" ADD CONSTRAINT "simulation_runs_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "simulation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_relationships" ADD CONSTRAINT "agent_relationships_from_agent_id_fkey" FOREIGN KEY ("from_agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_relationships" ADD CONSTRAINT "agent_relationships_to_agent_id_fkey" FOREIGN KEY ("to_agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "simulation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "causal_edges" ADD CONSTRAINT "causal_edges_from_event_id_fkey" FOREIGN KEY ("from_event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "causal_edges" ADD CONSTRAINT "causal_edges_to_event_id_fkey" FOREIGN KEY ("to_event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_decisions" ADD CONSTRAINT "agent_decisions_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "simulation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_decisions" ADD CONSTRAINT "agent_decisions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "simulation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_results" ADD CONSTRAINT "experiment_results_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

