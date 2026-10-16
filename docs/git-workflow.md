# Git 工作流 (main + feature/* 极简方案)

## 执行命令

当用户说"执行 git 工作流"时，按以下步骤执行：

## 流程

### 小改动（当前分支已在 main）

如果当前改动较小（如 bug fix、typo、小 UI 微调、纯文案/配置变更），且无需经过预览链接验证，走此快速流程：

1. **直接在 main 上修改**
2. **运行 build 检查**
   ```bash
   pnpm build
   ```
   - 如果 build 失败，停止流程，提示用户修复。
   - 如果 build 成功，继续执行。
3. **提交并推送**
   ```bash
   git add .
   git commit -m "fix: xxx" # 根据类型也可使用 chore:, docs:
   git push origin main
   ```

无需切分支，验证通过后直接在线上主分支生效。

### 大改动（功能分支开发）

用于新功能模块落地（如推进 PRD 中的核心里程碑）或大规模代码重构。

1. **检查当前分支**
   - 如果在 `main` 分支，停止流程，提示用户：“当前处于 main 分支，大改动请先切出功能分支（如 feature/xxx）后再进行修改”。
   - 如果在其他功能分支（如 `feature/slots`），继续执行。

2. **运行 build 检查**
   ```bash
   pnpm build
   ```
   - 如果 build 失败，停止流程，提示用户修复，严禁继续合并。
   - 如果 build 成功，继续执行。

3. **提交当前修改**
   ```bash
   git add .
   git commit -m "feat: xxx" # 必须使用英文 Conventional Commits 格式
   ```

4. **推送功能分支（触发 Vercel Preview 验证）**
   ```bash
   git push origin <当前功能分支>
   ```
   - *注：此步将功能分支推送到远程，以便触发 Vercel 自动构建独立的预览测试网页进行最终核验。*

5. **合并到 main 主分支**
   ```bash
   git checkout main
   git pull origin main # 合并前先拉取远程最新主分支，防止本地代码落后
   git merge --no-ff <当前功能分支> -m "merge: <当前功能分支> into main - [业务摘要]"
   git push origin main
   ```

6. **清理分支并保持在 main**
   ```bash
   git branch -d <当前功能分支>
   git push origin --delete <当前功能分支>
   ```

7. **等待下一步指示**

## 注意事项

- Commit 消息和 Merge 消息一律使用英文，格式严格遵循：`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`
- **代码红线：** 任何代码推送到 `main` 分支前，本地必须通过 `pnpm build` 编译检查。
- 如果在 `git merge` 过程中发生代码冲突（Conflicts），Agent 必须**立即停止自动流程**，保留冲突现场，并明文提示用户手动解决。
- 功能分支在成功合并到 `main` 并推送成功后，必须自动执行本地和远程仓库的清理删除，保持远程代码库干净。
