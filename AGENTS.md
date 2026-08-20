# SLEEP CITY 2.0 — AIエージェント向けガイド (AGENTS.md)

このリポジトリでコードを操作する AI エージェント（Codex, Cursor, GitHub Copilot 等）向けの入口です。

> **設計ルールの正本は `CLAUDE.md` と `docs/` です。**
> このファイルには内容を複製しません。二重管理による矛盾を防ぐため、必ず下記を参照してください。

## プロジェクト概要

AIマルチエージェント都市シミュレーション。睡眠不足が交通・労働・物流・家庭を介して他者へ伝播し、
都市内で自己増殖する **Sleep Cascade** を観測・分析する仮想実験環境です。

- 標準 300 Agent / 7日間、1 Tick = 15分
- 詳細は `docs/要件定義.md` を参照

## 最初に読むもの

| ファイル | 内容 |
|---|---|
| `CLAUDE.md` | アーキテクチャ、ファイル配置ルール、命名規約（**必読**） |
| `docs/アーキテクチャ.md` | DDD 4層の依存ルール詳細 |
| `docs/フロントエンド規約.md` | データフロー・UI スタック |
| `docs/テストガイドライン.md` | Unit / Integration の責務分担 |
| `docs/品質チェック・テスト規約.md` | verify コマンドの構成 |

## 技術スタック

pnpm workspace monorepo。`apps/webapp/` に Next.js 16 App Router アプリ。

- Next.js 16 (App Router) / React 19 / TypeScript
- Prisma + PostgreSQL (Supabase)
- shadcn/ui + Tailwind CSS v4 / @xyflow/react
- Vercel AI SDK + OpenRouter（Agent の意思決定のみ）
- Vitest / dependency-cruiser / Biome

## 開発コマンド

```sh
pnpm dev               # 開発サーバー起動
pnpm verify            # lint → prisma generate → typecheck → unit test → depcruise
pnpm test:integration  # 要 DATABASE_URL, INTEGRATION_TEST=true
pnpm db:migrate        # マイグレーション作成・適用
```

## push 前の必須チェック

`git push` 前に **`pnpm verify` を実行し、全てパスすること**。
（`simple-git-hooks` の pre-push でも実行されますが、事前に自分で確認してください）

## ブランチ運用

`develop` が既定ブランチです。**`develop` / `main` への直接 push は禁止**。
フィーチャーブランチを切り、PR 経由でマージしてください。

## ドキュメント作成時のルール

- 保存場所: `docs/` 以下
- 設計・調査ドキュメントのファイル名: `{日本語の作業内容}.md`
- タスク単位の計画: `docs/tasks/YYYYMMDD_HHMM_{内容}.md`
