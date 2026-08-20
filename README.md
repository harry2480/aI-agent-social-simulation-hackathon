# SLEEP CITY 2.0

AIマルチエージェント都市シミュレーション。睡眠不足が交通・労働・物流・家庭を介して他者へ伝播し、都市内で自己増殖する **Sleep Cascade** を観測・分析するための仮想実験環境です。

現実都市を正確に予測するものではなく、**「睡眠不足は都市内で伝播するか」という仮説を検証するための実験装置**として設計されています。

**公開URL**: https://sleep-city.vercel.app

## 何を調べるのか

- Sleep Cascade が継続的に拡大する条件は存在するか
- 睡眠不足が自己増殖し始める臨界点は存在するか
- どの人物・職業・ネットワーク構造が伝播を増幅するか（Super-spreader）
- どの介入施策が Sleep Cascade を抑制するか
- AIエージェントの意思決定が都市全体の創発現象にどの程度影響するか

## シミュレーション諸元

| 項目 | 標準 | 最大 |
|---|---|---|
| Agent 数 | 300人 | 500人 |
| Simulation 期間 | 7日間 | 14日間 |
| 1 Tick | 15分 | — |

## 主な機能

- **Watch Mode** — 都市マップ上で Agent の状態遷移をリアルタイム観測。KPI パネル、イベントタイムライン、Agent 詳細パネル
- **Causal Graph** — 「誰の睡眠不足が誰に伝播したか」の因果関係を有向グラフで可視化
- **Experiment Mode** — Multi-seed / Sweep によるバッチ実験。Rs・Cascade Reach・介入効果を条件間で定量比較
- **Critical Point Explorer** — 初期睡眠不足率を Sweep し、Cascade が跳ね上がる臨界点候補を探索
- **Super-spreader Explorer** — 伝播を最も増幅する Agent 属性の探索
- **Settings** — Simulation の既定条件（Population・Days・初期睡眠不足率など）を編集して保存

## 技術スタック

- Next.js 16 (App Router) / React 19 / TypeScript
- Prisma 7（Driver Adapter 構成）+ PostgreSQL (Supabase)
- shadcn/ui + Tailwind CSS v4 / @xyflow/react
- Vercel AI SDK + OpenRouter
- Vitest / dependency-cruiser / Biome

シミュレーションの物理法則（事故発生・移動時間・渋滞・Sleep Debt・Fatigue・確率計算）は
すべて domain 層の決定論的なロジックが担い、**AI は Agent の意味的な意思決定のみ**を担当します。
これによりシード値を固定すれば実験が再現可能になります。

## セットアップ

```sh
pnpm install
```

`apps/webapp/.env.local` を作成し、下記の環境変数を設定します。

```sh
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
OPENROUTER_API_KEY="sk-or-..."   # 任意
```

```sh
pnpm db:migrate
pnpm dev
```

### 環境変数

| 変数 | 必須 | 内容 |
|---|---|---|
| `DATABASE_URL` | ✅ | アプリ実行時の接続文字列（Connection Pooling 経由） |
| `DIRECT_URL` | ✅ | マイグレーション用の接続文字列（Pooler を経由しない、または Session Pooler） |
| `OPENROUTER_API_KEY` | — | 未設定時は Rule-based 実装へ自動フォールバック |
| `AI_MODEL` | — | 既定値 `google/gemma-3-27b-it` |

`OPENROUTER_API_KEY` を設定しなくてもシミュレーション自体は動作します（AI の意思決定がルールベースに置き換わります）。

## 開発コマンド

| コマンド | 内容 |
|---|---|
| `pnpm dev` | 開発サーバー起動 |
| `pnpm verify` | 品質チェック（lint → prisma generate → typecheck → unit test → depcruise） |
| `pnpm test:unit` | Unit テスト |
| `pnpm test:integration` | Integration テスト（要 `DATABASE_URL`, `INTEGRATION_TEST=true`） |
| `pnpm lint:fix` | 自動フォーマット |
| `pnpm db:migrate` | マイグレーション作成・適用 |
| `pnpm knip` | 未使用コード検出 |

### バッチ実験

Vercel Function の実行時間上限に当たるため、重いバッチはスクリプトで実行します。

```sh
pnpm --filter webapp exec tsx scripts/run-experiment.ts --kind=shock-comparison --seeds=10
pnpm --filter webapp exec tsx scripts/run-experiment.ts --kind=critical-point --seeds=10
pnpm --filter webapp exec tsx scripts/run-experiment.ts --kind=intervention --seeds=10
pnpm --filter webapp exec tsx scripts/explore-super-spreader.ts

# 同一 Seed・同一条件のままモデルだけを変えて比較する（要 OPENROUTER_API_KEY）
pnpm --filter webapp exec tsx scripts/compare-ai-models.ts --models=<model-id>,<model-id> --seeds=3
```

スクリプトは `.env.local` を自動では読み込みません。DB へ保存する場合は環境変数を渡してください。

```sh
set -a; . apps/webapp/.env.local; set +a
```

`DATABASE_URL` が未設定の場合は DB へ保存せず、集計結果を標準出力に出します。
`run-experiment.ts` は Seed ごとの Run も保存します（`--save-runs=false` で無効化）。

### 画面

| URL | 内容 |
|---|---|
| `/` | Simulation（Watch Mode）。`/?replay=<runId>` で保存済み Run を同一条件で再実行して観察 |
| `/experiments` | 実験の条件比較（平均 ± 標準偏差・対照条件との差・Outbreak 発生率・収束世代） |
| `/experiments/[id]` | 自動分析レポート・KPI 時系列・Run 一覧 |
| `/critical-point` | 初期睡眠不足率 Sweep の Cascade Probability 曲線と臨界点候補 |
| `/super-spreader` | Sleep Super-spreader の Stage 2 ランキング |
| `/settings` | Simulation の既定条件の編集（ブラウザに保存し、Simulation 画面の初期値になる） |

実験結果を読む画面はスクリプトが保存したデータを表示します。`DATABASE_URL` が未設定の場合は
エラーにせず、実行方法を案内する空状態を表示します。

Cascade 発生率は要件定義の判定（Rs > 1 が 2 世代継続 かつ Reach 10% 以上）に基づきます。
実測の Cascade は「一度大きく広がって収束する」形を取り 2 世代続かないため、この値は 0% になりがちです。
そのため比較表には Rs の世代継続を問わない **Outbreak 発生率**（Reach が閾値へ達した Run の割合）と、
収束が始まった世代を併記しています。

## デプロイ

Vercel（プロジェクト `sleep-city` / Root Directory `apps/webapp`）と Supabase で動いています。
GitHub と連携済みで、手動のデプロイ操作は不要です。

| 契機 | 結果 |
|---|---|
| `develop` への push | 本番（https://sleep-city.vercel.app）へ自動デプロイ |
| PR の作成・更新 | Preview 環境へ自動デプロイ（PR のチェック欄に URL が出る） |

- DB マイグレーションは自動では流れません。スキーマを変えた場合は
  `pnpm --filter webapp exec prisma migrate deploy` を本番の接続情報で実行します
- Preview 環境は現状 Production と同じ Supabase プロジェクトを指しています。
  Preview から実験結果を保存すると本番の Experiment Dashboard にも現れます

## プロジェクト構成

```text
├── .claude/                # AI エージェント向け Skills / Commands
├── .github/workflows/      # CI（lint・型・テスト・依存方向・ビルド・カバレッジ）
├── docs/                   # 要件定義・設計規約・実装計画
├── supabase/               # Supabase ローカル設定
└── apps/webapp/
    ├── prisma/             # スキーマ・マイグレーション・シード
    ├── scripts/            # バッチ実験ランナー
    └── src/
        ├── app/            # ページと Route Handler
        ├── backend/
        │   ├── domain/         # ビジネスルール（Simulation Engine 本体）
        │   ├── application/    # UseCase
        │   ├── infrastructure/ # Prisma / OpenRouter 実装
        │   └── presentation/   # DI 組み立て・loaders・Server Actions
        └── frontend/       # UI コンポーネント・hooks
```

依存方向は `presentation → application → domain ← infrastructure` に固定され、
dependency-cruiser により CI で機械的に検証されます。
dependency-cruiser は対応外の TypeScript を使うと解析件数 0 のまま成功してしまうため、
`pnpm depcruise` は解析できたモジュール数も検証します（TypeScript は対応範囲のバージョンに留めます）。

## ドキュメント

| ファイル | 内容 |
|---|---|
| `docs/要件定義.md` | 本システムの要件定義書 |
| `docs/サービスコンセプト.md` | コンセプト |
| `docs/アーキテクチャ.md` | DDD 4層の依存ルール |
| `docs/フロントエンド規約.md` | データフロー・UI スタック |
| `docs/テストガイドライン.md` | Unit / Integration の責務分担 |
| `docs/実装計画.md` | AI Agent Decision 機能の実装計画 |

設計ルールの詳細は `CLAUDE.md` および `AGENTS.md` を参照してください。
