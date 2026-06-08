# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.3.2](https://github.com/alvinluo-tech/CoreLayer/compare/v0.3.0...v0.3.2) (2026-06-08)


### Features

* add app-paths module for packaged-mode path resolution ([b666044](https://github.com/alvinluo-tech/CoreLayer/commit/b666044e01ea1c56a24941318c9418ec5d0f62c1))
* **api:** approve returns 202 with async resume, deny updates run status ([c0528d0](https://github.com/alvinluo-tech/CoreLayer/commit/c0528d069bd64f3ea17304ad76a5a130e545aeb1))
* **capability:** add PermissionBroker and OSCapabilityBroker ([6366a2a](https://github.com/alvinluo-tech/CoreLayer/commit/6366a2ad5d1a0d93074dfcd0c3e24d23a8541ada))
* **coding:** add Coding Runtime Bridge with adapters ([25e89bf](https://github.com/alvinluo-tech/CoreLayer/commit/25e89bfc0981312f0592e7733e24179d301f5688))
* **computer-control:** add Computer Control Runtime ([8042571](https://github.com/alvinluo-tech/CoreLayer/commit/80425717b23f9699ced7c61ff01df0c47744154b))
* **daemon:** add agent-runtime with RuntimeProtocol endpoints ([a5161ec](https://github.com/alvinluo-tech/CoreLayer/commit/a5161ec78978084069a48cbfe94e3b5a525ab8ab))
* **daemon:** add coding-runtime with RuntimeProtocol endpoints ([9692fb9](https://github.com/alvinluo-tech/CoreLayer/commit/9692fb9f5b49d6373421ad66fd86a388115b2f5d))
* **daemon:** add computer-control-runtime with RuntimeProtocol endpoints ([5c25155](https://github.com/alvinluo-tech/CoreLayer/commit/5c2515506122e76555b9a7aac65e52106dc2b33b))
* **daemon:** add runtime-protocol and runtime-core packages ([f45a670](https://github.com/alvinluo-tech/CoreLayer/commit/f45a6705686b807952575697d2eabf39d8525f41))
* **daemon:** add scheduler-runtime with RuntimeProtocol endpoints ([7919dd1](https://github.com/alvinluo-tech/CoreLayer/commit/7919dd1117bf04154587ad957afed7c30edf28b1))
* **daemon:** add tool-runtime with RuntimeProtocol endpoints ([fa77abb](https://github.com/alvinluo-tech/CoreLayer/commit/fa77abb523fcc18decc50d3df2f98f43adf824a0))
* **daemon:** add voice-runtime with RuntimeProtocol endpoints ([ae00dc5](https://github.com/alvinluo-tech/CoreLayer/commit/ae00dc55373715f5bdc5757693789792030b1a98))
* **daemon:** complete Phase 3 - make daemon packaged-mode aware ([28e9b06](https://github.com/alvinluo-tech/CoreLayer/commit/28e9b065f40dda87a519c1cfc31e3f526936e907))
* **db:** add waiting_for_approval to agent run status ([a5e9957](https://github.com/alvinluo-tech/CoreLayer/commit/a5e9957bdae8f876ad687310b4da82664e761a31))
* **frontend:** normalize daemon URL usage - Phase 4 complete ([00fd67a](https://github.com/alvinluo-tech/CoreLayer/commit/00fd67ac943f3d5ebd8a551e42ff2d0f2cd968a6))
* **migration:** add UpdateManager types and migration runner ([1d44fec](https://github.com/alvinluo-tech/CoreLayer/commit/1d44fec207da183c04d43bd7e5747052cd9efadb))
* **persistence:** add persistent EventLog and AuditLog with API endpoints ([c46cf00](https://github.com/alvinluo-tech/CoreLayer/commit/c46cf00e1a694f43e3f208318095c8e11795a3cf))
* replace passive DaemonSupervisor with real process supervisor ([f4234f0](https://github.com/alvinluo-tech/CoreLayer/commit/f4234f072268daf06cf96b0ef05927404bd8e4ef))
* **runtime-protocol:** define ApprovalRequired result type ([91816a2](https://github.com/alvinluo-tech/CoreLayer/commit/91816a2746ee61031ba14f96728abcd895cd28fc))
* **runtime:** add approval resume payload persistence ([48f3f6d](https://github.com/alvinluo-tech/CoreLayer/commit/48f3f6df24ffd5706ebb82925f2951cc22c7366c))
* **runtime:** add runtime registry foundation - Phase 8 complete ([6db5918](https://github.com/alvinluo-tech/CoreLayer/commit/6db5918289b16f91484f954848518aee63ce74dd))
* **runtime:** complete packaged runtime supervisor refactor (Phases 0-14) ([690a0a0](https://github.com/alvinluo-tech/CoreLayer/commit/690a0a0f5aa92b2c388ddabff6e0da8662e8f82d))
* **runtime:** create memory runtime facade ([75f87fc](https://github.com/alvinluo-tech/CoreLayer/commit/75f87fcd30907fa20cfb9c6cd1ed6be9aab4e5f1))
* **runtime:** define agent loop resume after approval ([5716385](https://github.com/alvinluo-tech/CoreLayer/commit/5716385722e1fd3c9fe7060f1702edc94c50f2a1))
* **runtime:** package daemon as bun sidecar ([f39fc15](https://github.com/alvinluo-tech/CoreLayer/commit/f39fc15e2b4af273ad6d0031a76c77121b28001b))
* **security:** wire risk inference into tool registry and deny critical by default ([82eb8f3](https://github.com/alvinluo-tech/CoreLayer/commit/82eb8f3911bb8e03cb97eb67dc844e25dc5c62e6))
* **tauri:** add EventLog, AuditLog, SecretStore to Rust core ([26f8679](https://github.com/alvinluo-tech/CoreLayer/commit/26f86792dc312cd32bb80106b7e08f9373f3c599))
* **ui:** add action commands to Command Palette (Phase UI-10) ([be8de45](https://github.com/alvinluo-tech/CoreLayer/commit/be8de4598baa71a546a19be948627bf4f7bbd89c))
* **ui:** add Approvals View with store and badge (Phase UI-4) ([c5f567d](https://github.com/alvinluo-tech/CoreLayer/commit/c5f567da77adf77f77e4e3309ae7ce85d4941bf7))
* **ui:** add Global Rail navigation and view routing (Phase UI-2) ([ff5dcb8](https://github.com/alvinluo-tech/CoreLayer/commit/ff5dcb89ae44ce60af487f348a3b456c1fdcb8aa))
* **ui:** add Memory View with API route and store (Phase UI-5) ([be5ef17](https://github.com/alvinluo-tech/CoreLayer/commit/be5ef177ee0d3ecee1738c4e5a6c2ddada8bc401))
* **ui:** add Projects and Agents views (Phase UI-7) ([4e5e673](https://github.com/alvinluo-tech/CoreLayer/commit/4e5e67371b7fdb95017402ba5bc453133d80eff7))
* **ui:** add Runs View with API route and store (Phase UI-3) ([c1b7924](https://github.com/alvinluo-tech/CoreLayer/commit/c1b7924077fd0b287a83fe23bcd476d104749e76))
* **ui:** add shared Agent OS UI atoms (Phase UI-8) ([427a22d](https://github.com/alvinluo-tech/CoreLayer/commit/427a22d7ed2fdc496d4029e971698679732b0d6a))
* **ui:** replace RightPanel with InspectorPane (Phase UI-9) ([ba21695](https://github.com/alvinluo-tech/CoreLayer/commit/ba216959cd599f6943e227b0a3f9d4519228c3d1))
* **ui:** update Control Center with runtime info - Phase 5 complete ([04d77b6](https://github.com/alvinluo-tech/CoreLayer/commit/04d77b60cf6ea79344f6252d76e9399c32814a17))
* **ui:** upgrade Tasks View with detail pane (Phase UI-6) ([aa57aa2](https://github.com/alvinluo-tech/CoreLayer/commit/aa57aa288b13bf1b36d35f8d45f967bb227de339))
* **ui:** use Jarvis Runtime terminology in Control Center ([33e7319](https://github.com/alvinluo-tech/CoreLayer/commit/33e73193e8a2981571c57c428cd7434cd6cab6fe))
* **worktree:** add WorktreeManager for project isolation ([b2772b3](https://github.com/alvinluo-tech/CoreLayer/commit/b2772b39234202dfa326449aecf4f4276b875d7f))


### Bug Fixes

* address audit gaps in Phase 2 and Phase 8 ([65ed6d4](https://github.com/alvinluo-tech/CoreLayer/commit/65ed6d4011e64401bfec4e8b34e46867847da30b))
* **ci:** add projectPath and upgrade to tauri-action@v1 ([e6a0b1a](https://github.com/alvinluo-tech/CoreLayer/commit/e6a0b1a99cea582ab617bcfd3b1543adb11840b2))
* **ci:** add upsertRelease for matrix builds to upload all platform artifacts ([daf7703](https://github.com/alvinluo-tech/CoreLayer/commit/daf7703b6a645a553e1b1e47b46c9787a29e4819))
* **ci:** fix release workflow race condition for multi-platform builds ([5314bd0](https://github.com/alvinluo-tech/CoreLayer/commit/5314bd0c74f230f9c760dfbfb61a52e817a8eaff))
* **ci:** use tauri-action@v0 since v1 does not exist ([6bdc72e](https://github.com/alvinluo-tech/CoreLayer/commit/6bdc72ebc0ec83495a5eff8389b491e47d96439b))
* **daemon:** bind to configured hostname - Phase 6 security hardening ([d034792](https://github.com/alvinluo-tech/CoreLayer/commit/d0347925517871102d7c9191874cd0b35551ad32))
* **daemon:** enforce loopback-only shutdown and sidecar bind guard ([08970df](https://github.com/alvinluo-tech/CoreLayer/commit/08970df6b4d11d7bb112d8773fa1b0a421c7c457))
* **daemon:** replace require() with ESM import in app-paths.ts ([a2c3698](https://github.com/alvinluo-tech/CoreLayer/commit/a2c3698490dd83551f175307a0338bc88ac41cea))
* **packaging:** resolve windows daemon console window popup and installer file locking issues ([6677327](https://github.com/alvinluo-tech/CoreLayer/commit/667732790a3827f1d4020a652a1caa973c47a369))
* resolve streaming test failures, release config, CI coverage, and git adapter boundary ([9e29412](https://github.com/alvinluo-tech/CoreLayer/commit/9e294125396254bc6d6428bf937fcda6d89be5e0))
* **runtime:** add Zod validation, DB migrations, and MCP schema sanitization ([6829e33](https://github.com/alvinluo-tech/CoreLayer/commit/6829e33321ca1da88193ccf87ee84ff8f45cfcee))
* **runtime:** align dev daemon url and data paths ([d891e0b](https://github.com/alvinluo-tech/CoreLayer/commit/d891e0b7baab153a1280a95dd3dd2109423a59bc))
* **security:** route worktree git commands through capability broker ([7a8c5a3](https://github.com/alvinluo-tech/CoreLayer/commit/7a8c5a34ee40b01ce2fe70766e59443f9ae2dc60))
* **tauri:** add dev mode daemon fallback and port extraction ([8e72bfd](https://github.com/alvinluo-tech/CoreLayer/commit/8e72bfd36665fb3dc9c5d1c6ed05470759129964))
* **tauri:** start daemon synchronously in setup to prevent race condition ([2ad2503](https://github.com/alvinluo-tech/CoreLayer/commit/2ad2503e9c1d83ee8e3fb91cda949a6302d747ac))
* **tauri:** suppress dead_code warnings on RuntimeRegistry ([e7ee18e](https://github.com/alvinluo-tech/CoreLayer/commit/e7ee18e1fcff3e62dcb0605272ffc015548ec76b))
* **ui:** increase conversation list sidebar height ([8f52c6d](https://github.com/alvinluo-tech/CoreLayer/commit/8f52c6d07da2e2e850e2e6144ae066ae34e63e49))


### CI/CD

* **release:** add daemon sidecar build step - Phase 7 ([b7b9398](https://github.com/alvinluo-tech/CoreLayer/commit/b7b93984cf013b29028922107ca6d1cec050e3e4))


### Tests

* **architecture:** enforce final runtime directory boundaries ([00b21bd](https://github.com/alvinluo-tech/CoreLayer/commit/00b21bd5e6465b9ce61edeaa7b56f82a6978a252))
* **db:** fix expireStale race condition by backdating createdAt ([7c21342](https://github.com/alvinluo-tech/CoreLayer/commit/7c2134230cc6d7628dd26fc27e71d1e51e3d49dd))


### Refactoring

* **capability:** migrate to capabilities directory ([944bbb6](https://github.com/alvinluo-tech/CoreLayer/commit/944bbb6950d4d2476bf39d98e6aae7a5f066eff3))
* **config:** layer data under ~/.jarvis/{config,data,logs}/ ([7d0f173](https://github.com/alvinluo-tech/CoreLayer/commit/7d0f17322de283315a5e6b876dd097b04634b57d))
* **config:** remove API keys from env, use configManager exclusively ([0ffb8c9](https://github.com/alvinluo-tech/CoreLayer/commit/0ffb8c9dc37e540399cdb5c40671b87243817b4e))
* **daemon:** migrate API routes to central runtimes registry ([9a3b600](https://github.com/alvinluo-tech/CoreLayer/commit/9a3b600c3b31e74e0b09f4d779fe7a52b4198dc2))
* **daemon:** migrate remaining runtime/ imports to runtimes registry ([d1732c9](https://github.com/alvinluo-tech/CoreLayer/commit/d1732c9abf069a44a0aec3af312a336a80bf40ab))
* **gateways:** consolidate external provider clients ([6d7bf33](https://github.com/alvinluo-tech/CoreLayer/commit/6d7bf3343ac59b2654776774ff6b9b78e392c4d4))
* **http:** move api routes to http/routes ([1fbef38](https://github.com/alvinluo-tech/CoreLayer/commit/1fbef38f6bea684e008c01bd6485d6e86ee4c558))
* **paths:** unify app data under ~/.jarvis ([7493aff](https://github.com/alvinluo-tech/CoreLayer/commit/7493affb87fb9a147f6a6670095110416a85f68e))
* **persistence:** move database layer to persistence ([6d720f1](https://github.com/alvinluo-tech/CoreLayer/commit/6d720f13ca233b303f6d768e9dff9fc6443ea7ef))
* **runtime-core:** add typecheck and contract tests ([f8ee5e6](https://github.com/alvinluo-tech/CoreLayer/commit/f8ee5e6a54fec29e9b6313f98024396c08e2f083))
* **runtime-protocol:** add typecheck and type shape tests ([de6e6ed](https://github.com/alvinluo-tech/CoreLayer/commit/de6e6edc8806e0c585dea26290602b256fd432c7))
* **runtime-protocol:** reduce duplicate runtime kind types ([c0d8614](https://github.com/alvinluo-tech/CoreLayer/commit/c0d86143121ae9fc36ae3895f375ca634e590658))
* **runtime:** add explicit facade objects and strengthen boundary tests ([82686a1](https://github.com/alvinluo-tech/CoreLayer/commit/82686a18cf440626ebd3f10662a0c05ad9eb1d86))
* **runtime:** clean approval and agent boundaries ([bd4af79](https://github.com/alvinluo-tech/CoreLayer/commit/bd4af79236345bbefa46bd72e984384a67772829))
* **runtime:** complete phase B boundary convergence ([28c74f2](https://github.com/alvinluo-tech/CoreLayer/commit/28c74f2766eb3ef3639a39150433627df8cfcbe8))
* **runtime:** consolidate coding runtime into runtimes/coding/ ([ed78ea1](https://github.com/alvinluo-tech/CoreLayer/commit/ed78ea164f2f97d586464ea650caf2e902653149))
* **runtime:** consolidate computer-control runtime into runtimes/computer-control/ ([a9a2f11](https://github.com/alvinluo-tech/CoreLayer/commit/a9a2f11d8b34ae3d75f44a52f529bb6b3021614a))
* **runtime:** consolidate scheduler into runtimes/scheduler/ ([d3e482b](https://github.com/alvinluo-tech/CoreLayer/commit/d3e482ba40840bc9819e0a46b64c05560bbe0c37))
* **runtime:** consolidate tool runtime into domain/application structure ([8b2ba01](https://github.com/alvinluo-tech/CoreLayer/commit/8b2ba0160ca0d5931b17b5d1a99bdd4c6d2548d2))
* **runtime:** consolidate voice into runtimes/voice/ ([ab369f2](https://github.com/alvinluo-tech/CoreLayer/commit/ab369f27b1232da32e8b2eb751a3321bb628571c))
* **runtime:** daemon-side registry and real status reporting ([5c19c9a](https://github.com/alvinluo-tech/CoreLayer/commit/5c19c9a631a014b447b28add8840280b32da424d))
* **runtime:** enforce public-api boundary between runtimes ([38de121](https://github.com/alvinluo-tech/CoreLayer/commit/38de1211cfe38bcbf703fbee762125fd666afa6f))
* **runtime:** extract runtime-host directory ([3367b31](https://github.com/alvinluo-tech/CoreLayer/commit/3367b3166b7ea48c99077c7a895d853d86c58452))
* **runtime:** migrate runtime/ to new directory structure ([145ae31](https://github.com/alvinluo-tech/CoreLayer/commit/145ae31ecb0a6707602e6c41d84c87b49606090c))
* **runtime:** normalize runtime kind taxonomy ([c6bdbef](https://github.com/alvinluo-tech/CoreLayer/commit/c6bdbef6732f161f4a2d07ed68c9cb07cfdc674f))
* **shared:** move utils/ and task/ to shared/ and workspaces/ ([6ac461e](https://github.com/alvinluo-tech/CoreLayer/commit/6ac461ef057ab9f61b55d37a3657beec65484f61))
* **tool-runtime:** non-blocking approval lifecycle ([69977ed](https://github.com/alvinluo-tech/CoreLayer/commit/69977ed438e2eb37685024ec04a79a4a0eee5905))
* **ui:** extract shell components from App.tsx (Phase UI-1) ([03084bc](https://github.com/alvinluo-tech/CoreLayer/commit/03084bcc550f699e4a3484f3ce06470244215014))

### [0.3.1](https://github.com/alvinluo-tech/CoreLayer/compare/v0.3.0...v0.3.1) (2026-06-08)


### Features

* add app-paths module for packaged-mode path resolution ([b666044](https://github.com/alvinluo-tech/CoreLayer/commit/b666044e01ea1c56a24941318c9418ec5d0f62c1))
* **api:** approve returns 202 with async resume, deny updates run status ([c0528d0](https://github.com/alvinluo-tech/CoreLayer/commit/c0528d069bd64f3ea17304ad76a5a130e545aeb1))
* **capability:** add PermissionBroker and OSCapabilityBroker ([6366a2a](https://github.com/alvinluo-tech/CoreLayer/commit/6366a2ad5d1a0d93074dfcd0c3e24d23a8541ada))
* **coding:** add Coding Runtime Bridge with adapters ([25e89bf](https://github.com/alvinluo-tech/CoreLayer/commit/25e89bfc0981312f0592e7733e24179d301f5688))
* **computer-control:** add Computer Control Runtime ([8042571](https://github.com/alvinluo-tech/CoreLayer/commit/80425717b23f9699ced7c61ff01df0c47744154b))
* **daemon:** add agent-runtime with RuntimeProtocol endpoints ([a5161ec](https://github.com/alvinluo-tech/CoreLayer/commit/a5161ec78978084069a48cbfe94e3b5a525ab8ab))
* **daemon:** add coding-runtime with RuntimeProtocol endpoints ([9692fb9](https://github.com/alvinluo-tech/CoreLayer/commit/9692fb9f5b49d6373421ad66fd86a388115b2f5d))
* **daemon:** add computer-control-runtime with RuntimeProtocol endpoints ([5c25155](https://github.com/alvinluo-tech/CoreLayer/commit/5c2515506122e76555b9a7aac65e52106dc2b33b))
* **daemon:** add runtime-protocol and runtime-core packages ([f45a670](https://github.com/alvinluo-tech/CoreLayer/commit/f45a6705686b807952575697d2eabf39d8525f41))
* **daemon:** add scheduler-runtime with RuntimeProtocol endpoints ([7919dd1](https://github.com/alvinluo-tech/CoreLayer/commit/7919dd1117bf04154587ad957afed7c30edf28b1))
* **daemon:** add tool-runtime with RuntimeProtocol endpoints ([fa77abb](https://github.com/alvinluo-tech/CoreLayer/commit/fa77abb523fcc18decc50d3df2f98f43adf824a0))
* **daemon:** add voice-runtime with RuntimeProtocol endpoints ([ae00dc5](https://github.com/alvinluo-tech/CoreLayer/commit/ae00dc55373715f5bdc5757693789792030b1a98))
* **daemon:** complete Phase 3 - make daemon packaged-mode aware ([28e9b06](https://github.com/alvinluo-tech/CoreLayer/commit/28e9b065f40dda87a519c1cfc31e3f526936e907))
* **db:** add waiting_for_approval to agent run status ([a5e9957](https://github.com/alvinluo-tech/CoreLayer/commit/a5e9957bdae8f876ad687310b4da82664e761a31))
* **frontend:** normalize daemon URL usage - Phase 4 complete ([00fd67a](https://github.com/alvinluo-tech/CoreLayer/commit/00fd67ac943f3d5ebd8a551e42ff2d0f2cd968a6))
* **migration:** add UpdateManager types and migration runner ([1d44fec](https://github.com/alvinluo-tech/CoreLayer/commit/1d44fec207da183c04d43bd7e5747052cd9efadb))
* **persistence:** add persistent EventLog and AuditLog with API endpoints ([c46cf00](https://github.com/alvinluo-tech/CoreLayer/commit/c46cf00e1a694f43e3f208318095c8e11795a3cf))
* replace passive DaemonSupervisor with real process supervisor ([f4234f0](https://github.com/alvinluo-tech/CoreLayer/commit/f4234f072268daf06cf96b0ef05927404bd8e4ef))
* **runtime-protocol:** define ApprovalRequired result type ([91816a2](https://github.com/alvinluo-tech/CoreLayer/commit/91816a2746ee61031ba14f96728abcd895cd28fc))
* **runtime:** add approval resume payload persistence ([48f3f6d](https://github.com/alvinluo-tech/CoreLayer/commit/48f3f6df24ffd5706ebb82925f2951cc22c7366c))
* **runtime:** add runtime registry foundation - Phase 8 complete ([6db5918](https://github.com/alvinluo-tech/CoreLayer/commit/6db5918289b16f91484f954848518aee63ce74dd))
* **runtime:** complete packaged runtime supervisor refactor (Phases 0-14) ([690a0a0](https://github.com/alvinluo-tech/CoreLayer/commit/690a0a0f5aa92b2c388ddabff6e0da8662e8f82d))
* **runtime:** create memory runtime facade ([75f87fc](https://github.com/alvinluo-tech/CoreLayer/commit/75f87fcd30907fa20cfb9c6cd1ed6be9aab4e5f1))
* **runtime:** define agent loop resume after approval ([5716385](https://github.com/alvinluo-tech/CoreLayer/commit/5716385722e1fd3c9fe7060f1702edc94c50f2a1))
* **runtime:** package daemon as bun sidecar ([f39fc15](https://github.com/alvinluo-tech/CoreLayer/commit/f39fc15e2b4af273ad6d0031a76c77121b28001b))
* **security:** wire risk inference into tool registry and deny critical by default ([82eb8f3](https://github.com/alvinluo-tech/CoreLayer/commit/82eb8f3911bb8e03cb97eb67dc844e25dc5c62e6))
* **tauri:** add EventLog, AuditLog, SecretStore to Rust core ([26f8679](https://github.com/alvinluo-tech/CoreLayer/commit/26f86792dc312cd32bb80106b7e08f9373f3c599))
* **ui:** add action commands to Command Palette (Phase UI-10) ([be8de45](https://github.com/alvinluo-tech/CoreLayer/commit/be8de4598baa71a546a19be948627bf4f7bbd89c))
* **ui:** add Approvals View with store and badge (Phase UI-4) ([c5f567d](https://github.com/alvinluo-tech/CoreLayer/commit/c5f567da77adf77f77e4e3309ae7ce85d4941bf7))
* **ui:** add Global Rail navigation and view routing (Phase UI-2) ([ff5dcb8](https://github.com/alvinluo-tech/CoreLayer/commit/ff5dcb89ae44ce60af487f348a3b456c1fdcb8aa))
* **ui:** add Memory View with API route and store (Phase UI-5) ([be5ef17](https://github.com/alvinluo-tech/CoreLayer/commit/be5ef177ee0d3ecee1738c4e5a6c2ddada8bc401))
* **ui:** add Projects and Agents views (Phase UI-7) ([4e5e673](https://github.com/alvinluo-tech/CoreLayer/commit/4e5e67371b7fdb95017402ba5bc453133d80eff7))
* **ui:** add Runs View with API route and store (Phase UI-3) ([c1b7924](https://github.com/alvinluo-tech/CoreLayer/commit/c1b7924077fd0b287a83fe23bcd476d104749e76))
* **ui:** add shared Agent OS UI atoms (Phase UI-8) ([427a22d](https://github.com/alvinluo-tech/CoreLayer/commit/427a22d7ed2fdc496d4029e971698679732b0d6a))
* **ui:** replace RightPanel with InspectorPane (Phase UI-9) ([ba21695](https://github.com/alvinluo-tech/CoreLayer/commit/ba216959cd599f6943e227b0a3f9d4519228c3d1))
* **ui:** update Control Center with runtime info - Phase 5 complete ([04d77b6](https://github.com/alvinluo-tech/CoreLayer/commit/04d77b60cf6ea79344f6252d76e9399c32814a17))
* **ui:** upgrade Tasks View with detail pane (Phase UI-6) ([aa57aa2](https://github.com/alvinluo-tech/CoreLayer/commit/aa57aa288b13bf1b36d35f8d45f967bb227de339))
* **ui:** use Jarvis Runtime terminology in Control Center ([33e7319](https://github.com/alvinluo-tech/CoreLayer/commit/33e73193e8a2981571c57c428cd7434cd6cab6fe))
* **worktree:** add WorktreeManager for project isolation ([b2772b3](https://github.com/alvinluo-tech/CoreLayer/commit/b2772b39234202dfa326449aecf4f4276b875d7f))


### Bug Fixes

* address audit gaps in Phase 2 and Phase 8 ([65ed6d4](https://github.com/alvinluo-tech/CoreLayer/commit/65ed6d4011e64401bfec4e8b34e46867847da30b))
* **ci:** add projectPath and upgrade to tauri-action@v1 ([e6a0b1a](https://github.com/alvinluo-tech/CoreLayer/commit/e6a0b1a99cea582ab617bcfd3b1543adb11840b2))
* **ci:** add upsertRelease for matrix builds to upload all platform artifacts ([daf7703](https://github.com/alvinluo-tech/CoreLayer/commit/daf7703b6a645a553e1b1e47b46c9787a29e4819))
* **ci:** fix release workflow race condition for multi-platform builds ([5314bd0](https://github.com/alvinluo-tech/CoreLayer/commit/5314bd0c74f230f9c760dfbfb61a52e817a8eaff))
* **ci:** use tauri-action@v0 since v1 does not exist ([6bdc72e](https://github.com/alvinluo-tech/CoreLayer/commit/6bdc72ebc0ec83495a5eff8389b491e47d96439b))
* **daemon:** bind to configured hostname - Phase 6 security hardening ([d034792](https://github.com/alvinluo-tech/CoreLayer/commit/d0347925517871102d7c9191874cd0b35551ad32))
* **daemon:** enforce loopback-only shutdown and sidecar bind guard ([08970df](https://github.com/alvinluo-tech/CoreLayer/commit/08970df6b4d11d7bb112d8773fa1b0a421c7c457))
* **daemon:** replace require() with ESM import in app-paths.ts ([a2c3698](https://github.com/alvinluo-tech/CoreLayer/commit/a2c3698490dd83551f175307a0338bc88ac41cea))
* **packaging:** resolve windows daemon console window popup and installer file locking issues ([6677327](https://github.com/alvinluo-tech/CoreLayer/commit/667732790a3827f1d4020a652a1caa973c47a369))
* resolve streaming test failures, release config, CI coverage, and git adapter boundary ([9e29412](https://github.com/alvinluo-tech/CoreLayer/commit/9e294125396254bc6d6428bf937fcda6d89be5e0))
* **runtime:** add Zod validation, DB migrations, and MCP schema sanitization ([6829e33](https://github.com/alvinluo-tech/CoreLayer/commit/6829e33321ca1da88193ccf87ee84ff8f45cfcee))
* **runtime:** align dev daemon url and data paths ([d891e0b](https://github.com/alvinluo-tech/CoreLayer/commit/d891e0b7baab153a1280a95dd3dd2109423a59bc))
* **security:** route worktree git commands through capability broker ([7a8c5a3](https://github.com/alvinluo-tech/CoreLayer/commit/7a8c5a34ee40b01ce2fe70766e59443f9ae2dc60))
* **tauri:** add dev mode daemon fallback and port extraction ([8e72bfd](https://github.com/alvinluo-tech/CoreLayer/commit/8e72bfd36665fb3dc9c5d1c6ed05470759129964))
* **tauri:** start daemon synchronously in setup to prevent race condition ([2ad2503](https://github.com/alvinluo-tech/CoreLayer/commit/2ad2503e9c1d83ee8e3fb91cda949a6302d747ac))
* **tauri:** suppress dead_code warnings on RuntimeRegistry ([e7ee18e](https://github.com/alvinluo-tech/CoreLayer/commit/e7ee18e1fcff3e62dcb0605272ffc015548ec76b))
* **ui:** increase conversation list sidebar height ([8f52c6d](https://github.com/alvinluo-tech/CoreLayer/commit/8f52c6d07da2e2e850e2e6144ae066ae34e63e49))


### CI/CD

* **release:** add daemon sidecar build step - Phase 7 ([b7b9398](https://github.com/alvinluo-tech/CoreLayer/commit/b7b93984cf013b29028922107ca6d1cec050e3e4))


### Tests

* **architecture:** enforce final runtime directory boundaries ([00b21bd](https://github.com/alvinluo-tech/CoreLayer/commit/00b21bd5e6465b9ce61edeaa7b56f82a6978a252))
* **db:** fix expireStale race condition by backdating createdAt ([7c21342](https://github.com/alvinluo-tech/CoreLayer/commit/7c2134230cc6d7628dd26fc27e71d1e51e3d49dd))


### Refactoring

* **capability:** migrate to capabilities directory ([944bbb6](https://github.com/alvinluo-tech/CoreLayer/commit/944bbb6950d4d2476bf39d98e6aae7a5f066eff3))
* **config:** layer data under ~/.jarvis/{config,data,logs}/ ([7d0f173](https://github.com/alvinluo-tech/CoreLayer/commit/7d0f17322de283315a5e6b876dd097b04634b57d))
* **config:** remove API keys from env, use configManager exclusively ([0ffb8c9](https://github.com/alvinluo-tech/CoreLayer/commit/0ffb8c9dc37e540399cdb5c40671b87243817b4e))
* **daemon:** migrate API routes to central runtimes registry ([9a3b600](https://github.com/alvinluo-tech/CoreLayer/commit/9a3b600c3b31e74e0b09f4d779fe7a52b4198dc2))
* **daemon:** migrate remaining runtime/ imports to runtimes registry ([d1732c9](https://github.com/alvinluo-tech/CoreLayer/commit/d1732c9abf069a44a0aec3af312a336a80bf40ab))
* **gateways:** consolidate external provider clients ([6d7bf33](https://github.com/alvinluo-tech/CoreLayer/commit/6d7bf3343ac59b2654776774ff6b9b78e392c4d4))
* **http:** move api routes to http/routes ([1fbef38](https://github.com/alvinluo-tech/CoreLayer/commit/1fbef38f6bea684e008c01bd6485d6e86ee4c558))
* **paths:** unify app data under ~/.jarvis ([7493aff](https://github.com/alvinluo-tech/CoreLayer/commit/7493affb87fb9a147f6a6670095110416a85f68e))
* **persistence:** move database layer to persistence ([6d720f1](https://github.com/alvinluo-tech/CoreLayer/commit/6d720f13ca233b303f6d768e9dff9fc6443ea7ef))
* **runtime-core:** add typecheck and contract tests ([f8ee5e6](https://github.com/alvinluo-tech/CoreLayer/commit/f8ee5e6a54fec29e9b6313f98024396c08e2f083))
* **runtime-protocol:** add typecheck and type shape tests ([de6e6ed](https://github.com/alvinluo-tech/CoreLayer/commit/de6e6edc8806e0c585dea26290602b256fd432c7))
* **runtime-protocol:** reduce duplicate runtime kind types ([c0d8614](https://github.com/alvinluo-tech/CoreLayer/commit/c0d86143121ae9fc36ae3895f375ca634e590658))
* **runtime:** add explicit facade objects and strengthen boundary tests ([82686a1](https://github.com/alvinluo-tech/CoreLayer/commit/82686a18cf440626ebd3f10662a0c05ad9eb1d86))
* **runtime:** clean approval and agent boundaries ([bd4af79](https://github.com/alvinluo-tech/CoreLayer/commit/bd4af79236345bbefa46bd72e984384a67772829))
* **runtime:** complete phase B boundary convergence ([28c74f2](https://github.com/alvinluo-tech/CoreLayer/commit/28c74f2766eb3ef3639a39150433627df8cfcbe8))
* **runtime:** consolidate coding runtime into runtimes/coding/ ([ed78ea1](https://github.com/alvinluo-tech/CoreLayer/commit/ed78ea164f2f97d586464ea650caf2e902653149))
* **runtime:** consolidate computer-control runtime into runtimes/computer-control/ ([a9a2f11](https://github.com/alvinluo-tech/CoreLayer/commit/a9a2f11d8b34ae3d75f44a52f529bb6b3021614a))
* **runtime:** consolidate scheduler into runtimes/scheduler/ ([d3e482b](https://github.com/alvinluo-tech/CoreLayer/commit/d3e482ba40840bc9819e0a46b64c05560bbe0c37))
* **runtime:** consolidate tool runtime into domain/application structure ([8b2ba01](https://github.com/alvinluo-tech/CoreLayer/commit/8b2ba0160ca0d5931b17b5d1a99bdd4c6d2548d2))
* **runtime:** consolidate voice into runtimes/voice/ ([ab369f2](https://github.com/alvinluo-tech/CoreLayer/commit/ab369f27b1232da32e8b2eb751a3321bb628571c))
* **runtime:** daemon-side registry and real status reporting ([5c19c9a](https://github.com/alvinluo-tech/CoreLayer/commit/5c19c9a631a014b447b28add8840280b32da424d))
* **runtime:** enforce public-api boundary between runtimes ([38de121](https://github.com/alvinluo-tech/CoreLayer/commit/38de1211cfe38bcbf703fbee762125fd666afa6f))
* **runtime:** extract runtime-host directory ([3367b31](https://github.com/alvinluo-tech/CoreLayer/commit/3367b3166b7ea48c99077c7a895d853d86c58452))
* **runtime:** migrate runtime/ to new directory structure ([145ae31](https://github.com/alvinluo-tech/CoreLayer/commit/145ae31ecb0a6707602e6c41d84c87b49606090c))
* **runtime:** normalize runtime kind taxonomy ([c6bdbef](https://github.com/alvinluo-tech/CoreLayer/commit/c6bdbef6732f161f4a2d07ed68c9cb07cfdc674f))
* **shared:** move utils/ and task/ to shared/ and workspaces/ ([6ac461e](https://github.com/alvinluo-tech/CoreLayer/commit/6ac461ef057ab9f61b55d37a3657beec65484f61))
* **tool-runtime:** non-blocking approval lifecycle ([69977ed](https://github.com/alvinluo-tech/CoreLayer/commit/69977ed438e2eb37685024ec04a79a4a0eee5905))
* **ui:** extract shell components from App.tsx (Phase UI-1) ([03084bc](https://github.com/alvinluo-tech/CoreLayer/commit/03084bcc550f699e4a3484f3ce06470244215014))
