# Changelog

## [2.5.1](https://github.com/Snehit70/pravah/compare/cli-v2.5.0...cli-v2.5.1) (2026-10-05)


### Performance Improvements

* reduce database I/O and record actual usage bytes ([#272](https://github.com/Snehit70/pravah/issues/272)) ([194d073](https://github.com/Snehit70/pravah/commit/194d073779dce200004c2cca205a98032c4e7a2c))

## [2.5.0](https://github.com/Snehit70/pravah/compare/cli-v2.4.1...cli-v2.5.0) (2026-09-29)


### Features

* **cli:** render watch waybar segment as today's next task ([#257](https://github.com/Snehit70/pravah/issues/257)) ([e289477](https://github.com/Snehit70/pravah/commit/e2894775eecf888d0d21dcfcebd5d285412b7e97))

## [2.4.1](https://github.com/Snehit70/pravah/compare/cli-v2.4.0...cli-v2.4.1) (2026-09-29)


### Bug Fixes

* **cli:** migrate legacy site URL for watch connections ([#255](https://github.com/Snehit70/pravah/issues/255)) ([0dac6b6](https://github.com/Snehit70/pravah/commit/0dac6b6cb9c4d65d8915f391106f81eb959a80e7))

## [2.4.0](https://github.com/Snehit70/pravah/compare/cli-v2.3.0...cli-v2.4.0) (2026-09-29)


### Features

* **cli:** add a Convex subscribe mode for desktop widgets ([6f45dbb](https://github.com/Snehit70/pravah/commit/6f45dbb5a789f60f97055afbc50aea3984dcbb26))
* **cli:** add a Convex subscribe mode for desktop widgets ([992c171](https://github.com/Snehit70/pravah/commit/992c17166d413d5989a805a646c07a26d16e4d0d))


### Bug Fixes

* **cli,widget:** address Omarchy host review on watch transport ([cc8e489](https://github.com/Snehit70/pravah/commit/cc8e489a045abd170686417b1a4ed1b19d9fea30))
* **cli,widget:** surface watch subscription failures instead of heartbeating stale data ([3790be4](https://github.com/Snehit70/pravah/commit/3790be41bbf7b81fdc8206329f47dd7096285d7b))
* **cli:** keep the published CLI dependency-free and cover the watch loop ([4cb9eff](https://github.com/Snehit70/pravah/commit/4cb9eff72b1ac7d9583fe55b958ce164057b7634))


### Performance Improvements

* subscribe to heavy Convex queries only when a screen needs them ([93afef8](https://github.com/Snehit70/pravah/commit/93afef8398113dfc46469fe3a1bf91ae7cf4134c))
* subscribe to heavy Convex queries only when a screen needs them ([df494d2](https://github.com/Snehit70/pravah/commit/df494d29d7402022dcc2a69fba6b80fe16940f9e))

## [2.3.0](https://github.com/Snehit70/pravah/compare/cli-v2.2.0...cli-v2.3.0) (2026-09-25)


### Features

* add Task-image read and metadata export compatibility ([7c353f6](https://github.com/Snehit70/pravah/commit/7c353f6ebfc1d4da93a7ce00f38e3645a3b006c6))
* expose Task-image summaries in CLI reads ([87d0661](https://github.com/Snehit70/pravah/commit/87d06613ad458bcb2e1eb89c3e112c8646fd0ecb))
* **goals:** link tasks to goals from CLI and Omarchy widget ([c4cf1c6](https://github.com/Snehit70/pravah/commit/c4cf1c623cd2ba434be33d788e8d8ef767a57170))
* **todo-plugin:** add Omarchy today widget ([67a69e2](https://github.com/Snehit70/pravah/commit/67a69e23aedd97fadfeed0af1ae49a689a9a0752))
* **todo-plugin:** rebuild Omarchy widget as a full CLI front-end ([1c544df](https://github.com/Snehit70/pravah/commit/1c544dfe48ee66c7c1e7278c8c1d01ee25e43359))


### Bug Fixes

* **cli:** migrate stored credentials to new account ([8ec0de1](https://github.com/Snehit70/pravah/commit/8ec0de16759e6872d2781ca75a20d502a48abda3))
* **cli:** migrate stored credentials to new account ([f4d4910](https://github.com/Snehit70/pravah/commit/f4d4910fa47c399d1273cd9ff833ee2ea5d23fb8))
* cut Convex HTTP polling cost for CLI today reads ([5774c83](https://github.com/Snehit70/pravah/commit/5774c83fdcb16d9b4d07bc0515d933c30b4c060a))
* cut Convex HTTP polling cost for CLI today reads ([9a522fe](https://github.com/Snehit70/pravah/commit/9a522fe612c4d562a36d3741858fbc991c3dc991)), closes [#240](https://github.com/Snehit70/pravah/issues/240)
* harden Task-image metadata boundaries ([40a21c7](https://github.com/Snehit70/pravah/commit/40a21c74df5f90a141e22492f1c360c58977b085))
* honor live scopes on usage writes and CLI link commands ([0d03af4](https://github.com/Snehit70/pravah/commit/0d03af4f9d83ba24399084978029385ad909bd7f))
* keep today lists and writes correct after usage cuts ([d1f5e19](https://github.com/Snehit70/pravah/commit/d1f5e19a00c446706f6150eb763b580d108a40b7))
* preserve Task-image read compatibility ([be1ef34](https://github.com/Snehit70/pravah/commit/be1ef34f0598a5fe38c0daec2958ba00eb13990f))
* **todo-plugin:** harden CLI task actions ([788ba69](https://github.com/Snehit70/pravah/commit/788ba692d39e47a70c4d647bc31e2a7725a20c77))

## [2.2.0](https://github.com/Snehit70/pravah/compare/cli-v2.1.0...cli-v2.2.0) (2026-07-26)


### Features

* **cli:** refresh live credential scopes ([db16967](https://github.com/Snehit70/pravah/commit/db16967ee6e726cad88929d5c15c00eb98310c9f))
* **cli:** refresh live credential scopes ([cbb2243](https://github.com/Snehit70/pravah/commit/cbb224327d9b283973eb233d13cd20d342132f46))


### Bug Fixes

* **cli:** harden credential refresh ([b64f4d9](https://github.com/Snehit70/pravah/commit/b64f4d964286f39424e9fbcac3d2bbea87b7c0d9))

## [2.1.0](https://github.com/Snehit70/pravah/compare/cli-v2.0.0...cli-v2.1.0) (2026-07-26)


### Features

* **cli:** add guided setup flow ([90f5989](https://github.com/Snehit70/pravah/commit/90f5989250a0dbca18d391bb74993bb4355b87dc))
* **cli:** add guided setup flow ([b99b8c0](https://github.com/Snehit70/pravah/commit/b99b8c08c70c10ac3d11e6979b20f75e12f52287))
* **cli:** add task time CRUD support ([0e37f35](https://github.com/Snehit70/pravah/commit/0e37f3587666134fe8467e5e1f204e0006de6b53))
* **cli:** add task time CRUD support ([bf62942](https://github.com/Snehit70/pravah/commit/bf62942c48453a69faedc0686c9786c50b1e3e42))
* **cli:** extract bun package ([#105](https://github.com/Snehit70/pravah/issues/105)) ([4d89253](https://github.com/Snehit70/pravah/commit/4d892536ebc9281596cb6ac80eb551a6defe8472))
* **cli:** generate help from command spec ([b0f47be](https://github.com/Snehit70/pravah/commit/b0f47be6fecc1326ca2c2004c15682d5e32ed668))
* **cli:** generate help from command spec ([a104f14](https://github.com/Snehit70/pravah/commit/a104f145936eec393609fc495143287cf665f12f))
* **cli:** ship human-first v2 command surface ([3909bf6](https://github.com/Snehit70/pravah/commit/3909bf68c0993e954f50a86554db8906efe2ff53))
* **cli:** ship human-first v2 command surface ([0db1e12](https://github.com/Snehit70/pravah/commit/0db1e12f8aad509938832147b0a924a8f0b2ff0c))


### Bug Fixes

* **cli:** address v2 auth and review follow-ups ([d05a037](https://github.com/Snehit70/pravah/commit/d05a037a99ef1234093a1b58c5e63d01102d355f))
* **cli:** align release metadata with v2 ([ddeae1b](https://github.com/Snehit70/pravah/commit/ddeae1ba66e175e90b7ff884e1aa279c999dfa40))
* **cli:** align release metadata with v2 ([d2d0828](https://github.com/Snehit70/pravah/commit/d2d082881d3674bb906bf10bd081ba8badf23e66))
* **cli:** complete v2 command contract ([789fc15](https://github.com/Snehit70/pravah/commit/789fc15cb7e953d7e81d4ff5a03f6c7a24ab272d))
* **cli:** smooth v2 auth and command ergonomics ([09f34c5](https://github.com/Snehit70/pravah/commit/09f34c5431b6c48e262ae977adc1811ee0f11cef))

## [0.3.0](https://github.com/Snehit70/pravah/compare/cli-v0.2.0...cli-v0.3.0) (2026-06-23)


### Features

* **cli:** add task time CRUD support ([0e37f35](https://github.com/Snehit70/pravah/commit/0e37f3587666134fe8467e5e1f204e0006de6b53))
* **cli:** add task time CRUD support ([bf62942](https://github.com/Snehit70/pravah/commit/bf62942c48453a69faedc0686c9786c50b1e3e42))

## [0.2.0](https://github.com/Snehit70/pravah/compare/cli-v0.1.0...cli-v0.2.0) (2026-06-19)


### Features

* **cli:** add guided setup flow ([90f5989](https://github.com/Snehit70/pravah/commit/90f5989250a0dbca18d391bb74993bb4355b87dc))
* **cli:** add guided setup flow ([b99b8c0](https://github.com/Snehit70/pravah/commit/b99b8c08c70c10ac3d11e6979b20f75e12f52287))
* **cli:** extract bun package ([#105](https://github.com/Snehit70/pravah/issues/105)) ([4d89253](https://github.com/Snehit70/pravah/commit/4d892536ebc9281596cb6ac80eb551a6defe8472))
* **cli:** generate help from command spec ([b0f47be](https://github.com/Snehit70/pravah/commit/b0f47be6fecc1326ca2c2004c15682d5e32ed668))
* **cli:** generate help from command spec ([a104f14](https://github.com/Snehit70/pravah/commit/a104f145936eec393609fc495143287cf665f12f))
