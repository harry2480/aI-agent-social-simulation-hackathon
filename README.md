# SLEEP CITY 2.0

AIマルチエージェント都市シミュレーション。睡眠不足が交通・労働・物流・家庭を介して他者へ伝播し、都市内で自己増殖する **Sleep Cascade** を観測・分析するための仮想実験環境です。

現実都市を正確に予測するものではなく、**「睡眠不足は都市内で伝播するか」という仮説を検証するための実験装置**として設計されています。

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
- **Experiment Mode** — Multi-seed / Sweep によるバッチ実験。実効再生産数 Rs や介入効果を定量比較
- **Super-spreader Explorer** — 伝播を最も増幅する Agent 属性の探索

## 技術スタック

- Next.js 15 (App Router) / React 19 / TypeScript
- Prisma + PostgreSQL (Supabase)
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
| `DATABASE_URL` | ✅ | PostgreSQL 接続文字列（Prisma 用） |
| `DIRECT_URL` | ✅ | マイグレーション用の直接接続文字列 |
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
```

`DATABASE_URL` が未設定の場合は DB へ保存せず、集計結果を標準出力に出します。

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
