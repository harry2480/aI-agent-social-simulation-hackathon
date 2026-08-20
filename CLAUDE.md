# SLEEP CITY 2.0

AIマルチエージェント都市シミュレーション。睡眠不足が交通・労働・物流・家庭を介して伝播し、
都市内で自己増殖する **Sleep Cascade** を観測・分析する仮想実験環境。

シミュレーションの物理法則（事故発生・移動時間・渋滞・Sleep Debt・Fatigue・確率計算）は
domain 層の決定論的ロジックが担い、**AI は Agent の意味的な意思決定のみ**を担当する。
シード値を固定すれば実験は再現可能。要件の詳細は `docs/要件定義.md` を参照。

## 使い方（利用者向け）

- `pnpm dev` で開発サーバーを起動
- `pnpm verify` で品質チェック（変更後に実行）
- 機能を追加したいときは Claude Code に「〇〇な機能を作って」と指示するだけでOK
- テーブルを追加したいときは「〇〇テーブルを追加して」と指示
- UIを作りたいときは「〇〇な画面を作って」と指示
- エラーが出たらエラーメッセージを貼り付けて「直して」と指示

### コマンド一覧

```sh
pnpm dev               # 開発サーバー起動
pnpm verify            # lint → prisma generate → typecheck → unit test → depcruise
pnpm test:unit         # Unit テスト
pnpm test:integration  # Integration テスト（要 DATABASE_URL, INTEGRATION_TEST=true）
pnpm lint:fix          # 自動フォーマット
pnpm db:migrate        # DBマイグレーション作成・適用
pnpm knip              # 未使用コード検出
```

---

## Claude Code への指示（利用者は読まなくてOK）

### アーキテクチャ

pnpm workspace monorepo。`apps/webapp/` に Next.js 16 App Router アプリ。

バックエンド (`src/backend/`) は DDD 4層構造:

```
依存方向: presentation → application → domain ← infrastructure
```

- **domain** — ビジネスルール。外部依存なし。最内層
- **application** — UseCase。domain のみ依存（infrastructure 直接参照禁止、Gateway interface 経由）
- **infrastructure** — Gateway/Repository 実装。domain の interface を implements
- **presentation** — composition（唯一の DI ポイント、全層参照可）、loaders（読み取り）、actions（副作用）

### ファイル配置ルール

```
src/backend/
├── domain/
│   ├── models/          # ドメインモデル (.model.ts)
│   ├── services/        # ドメインサービス (.service.ts)
│   ├── gateways/        # Gateway interface (.gateway.ts)
│   └── repositories/    # Repository interface (.repository.ts)
├── application/
│   └── usecases/        # UseCase (.usecase.ts)
├── infrastructure/
│   ├── adapters/        # Gateway 実装 (.adapter.ts) — 本番 + Stub
│   ├── repositories/    # Repository 実装 (.repository.ts)
│   └── db/              # DB接続 (prisma-client.ts)
└── presentation/
    ├── composition/     # DI組み立て (.composition.ts)
    ├── loaders/         # データ取得 (.loader.ts)
    └── actions/         # 副作用 (.action.ts, 'use server')
```

### Key Rules

- ファイル命名: kebab-case + レイヤーサフィックス
- Rich Domain Model 必須。バリデーション・生成はモデル自身のメソッドで行う
- サービス（UseCase, Domain Service）はクラスベース + コンストラクタ DI。関数エクスポート禁止
- Domain 層のエラーは `Result<T, E>` 型で返す。Application/Infrastructure は throw
- 外部 API の Gateway は必ず Stub 実装を用意し、Composition で環境変数に応じて切り替え
- `index.ts` バレルエクスポート禁止
- API Route 原則不使用（loaders + Server Actions パターン）
- Server Component デフォルト。`'use client'` は必要な場合のみ

### テスト

- Unit: domain + application（Gateway はモック、外部依存なし）
- Integration: infrastructure（`INTEGRATION_TEST=true` + `DATABASE_URL` が未設定ならスキップ）
- テストパス: `test/unit/`, `test/integration/`（ソース構造を mirror）

### 品質チェック

`pnpm verify` は lint → prisma generate → typecheck → unit test → depcruise を順に実行する。
コード変更後は必ず `pnpm verify` を実行して全パスすることを確認する。

### 詳細ルール

詳細な設計ルールは必要に応じて docs/ を読むこと:

- docs/要件定義.md — SLEEP CITY 2.0 の要件定義書
- docs/アーキテクチャ.md — DDD 4層・依存ルール・命名規約
- docs/フロントエンド規約.md — フロントエンド規約（データフロー・UI スタック）
- docs/フロントエンドアーキテクチャ.md — フロントエンドの構成詳細
- docs/リポジトリ層設計規約.md — Repository の設計規約
- docs/インフラストラクチャ規約.md — インフラ規約（monorepo・デプロイ・DB・Stub パターン）
- docs/テストガイドライン.md — Unit / Integration の責務分担
- docs/品質チェック・テスト規約.md — テスト方針・verify コマンド
- docs/スタイルガイド.md — スタイル規約
