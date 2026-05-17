# Changelog

## [1.5.0](https://github.com/Snehit70/pravah/compare/mobile-v1.4.0...mobile-v1.5.0) (2026-05-17)


### Features

* **mobile:** edit-task quick actions ([bc33b28](https://github.com/Snehit70/pravah/commit/bc33b286c80cc129b0a5b021e3712b15a9c005dd))
* **mobile:** gmail review queue and integration status ([b0d8507](https://github.com/Snehit70/pravah/commit/b0d85076b657cbd08dedb3e4b79acbf138b318d1))
* **mobile:** inbox search and priority filter ([d2ddcdc](https://github.com/Snehit70/pravah/commit/d2ddcdc5b161dd2320896e69203582d1268fa9f3))
* **mobile:** long-term goals tab ([895250b](https://github.com/Snehit70/pravah/commit/895250b0f658238401742e0d1137e557a9f74851))
* **mobile:** tomorrow and +1w quickadd shortcuts ([4515040](https://github.com/Snehit70/pravah/commit/45150405d7f36435ea57a28bc9ffce83ea0c95d4))
* **mobile:** web feature parity (quickadd, edit actions, inbox search, gmail review, goals) ([43a8c81](https://github.com/Snehit70/pravah/commit/43a8c81c6163aa658f2dc0026d66d0658fba5af3))
* **mobile:** wire web-parity features into app shell ([5a30700](https://github.com/Snehit70/pravah/commit/5a3070069c1cdea4e1f6c9099aa0935e3b77c1c2))


### Bug Fixes

* **mobile:** address PR review feedback ([af0e57e](https://github.com/Snehit70/pravah/commit/af0e57ebad47e81b52578232cba467c2a11b1aa5))
* **mobile:** address PR review feedback (round 2) ([fcfb438](https://github.com/Snehit70/pravah/commit/fcfb43870322d022b341818c50c66638cd55be39))
* **mobile:** block double-taps on review actions with ref-backed in-flight set ([129febe](https://github.com/Snehit70/pravah/commit/129febe03b6a217bb0f3a71913ec99b97738e902))
* **mobile:** bound this-week count to weekEnd and persist goal edits after load error ([6eaa8c8](https://github.com/Snehit70/pravah/commit/6eaa8c8e8276da7228d330f0028290686c79a5a2))
* **mobile:** cap header this-week count at weekEnd ([578fbea](https://github.com/Snehit70/pravah/commit/578fbea0d6d230ea1eee447cf688d36c4ba9e8ed))
* **mobile:** exempt goals tab from active-list loading gate ([9463f04](https://github.com/Snehit70/pravah/commit/9463f048c9da495263e75924ee38ef85ffb75003))
* **mobile:** filter review queue to gmail items in gmail panel ([40f4a51](https://github.com/Snehit70/pravah/commit/40f4a51f195cf951f2818efbfdf190fb62fc3919))
* **mobile:** preserve weekEnd labels and protect goals from overwrite ([2d302ff](https://github.com/Snehit70/pravah/commit/2d302ff5878277354976b75fc910b9f592874c9d))
* **mobile:** satisfy lint unused-var rule in gmail review busy tracker ([a6ab96a](https://github.com/Snehit70/pravah/commit/a6ab96afcac70b369404c83c7b5d32164fea9d79))
* **sync:** accept provider arg in listReviewQueue so panels can scope the limit ([848e721](https://github.com/Snehit70/pravah/commit/848e721e600c9b13a527c7801c1faa4b53a4dbef))
* **sync:** honor inbox override when approving review item ([8da0d84](https://github.com/Snehit70/pravah/commit/8da0d84bd0a3f2a374fe237875254d7aa944f188))

## [1.4.0](https://github.com/Snehit70/pravah/compare/mobile-v1.3.0...mobile-v1.4.0) (2026-05-16)


### Features

* **mobile:** add runtime diagnostics and Kairo safeguards ([5b378db](https://github.com/Snehit70/pravah/commit/5b378dbe584f5279363ec40b142bdf194b567f60))
* **mobile:** add runtime diagnostics and Kairo safeguards ([8f4243c](https://github.com/Snehit70/pravah/commit/8f4243cad61b54d95a4ed19d87083b55312cd367))

## [1.3.0](https://github.com/Snehit70/pravah/compare/mobile-v1.2.1...mobile-v1.3.0) (2026-05-16)


### Features

* **mobile:** improve list responsiveness and touch targets ([8dab01b](https://github.com/Snehit70/pravah/commit/8dab01b76b5653ec4fe80fab3d2016a90cf4c8a0))
* **mobile:** improve list responsiveness and touch targets ([317c408](https://github.com/Snehit70/pravah/commit/317c40889992e4053e232fb9c982ec418f9c2c7b))


### Bug Fixes

* **mobile:** constrain adjacent-sibling hitSlop to vertical only ([795be5b](https://github.com/Snehit70/pravah/commit/795be5bd7bb1cf7c61184e5e75cb6962d61bd5b9))
* **mobile:** preserve incremental row budget on live updates ([038f0bc](https://github.com/Snehit70/pravah/commit/038f0bc87bc44c45b390472a70dccc9dcd138419))
* **mobile:** show initial rows before incremental batch timer fires ([c90a073](https://github.com/Snehit70/pravah/commit/c90a073e80a285f67feb9057545c1cd2b7e5ba76))

## [1.2.1](https://github.com/Snehit70/pravah/compare/mobile-v1.2.0...mobile-v1.2.1) (2026-05-16)


### Bug Fixes

* **mobile:** preserve timeline visible rows on live updates ([22dad60](https://github.com/Snehit70/pravah/commit/22dad60442a25ad73fefa2978c1240fb38d19779))
* **mobile:** reset timeline incremental row budget ([c23bd49](https://github.com/Snehit70/pravah/commit/c23bd49e27e621459452dc7aed04785aebf029ca))
* **mobile:** show initial timeline rows before batch timer fires ([1acb615](https://github.com/Snehit70/pravah/commit/1acb6156817a0d1b82b8c2a36febc12b372f4591))


### Performance Improvements

* **mobile:** incrementally render timeline rows ([9da6123](https://github.com/Snehit70/pravah/commit/9da612367b4bbdfc2e183555d7e4a2162fe7ab24))
* **mobile:** incrementally render timeline rows ([347431d](https://github.com/Snehit70/pravah/commit/347431dbd3f924bc0a686bb1ee35eff70458342b))

## [1.2.0](https://github.com/Snehit70/pravah/compare/mobile-v1.1.1...mobile-v1.2.0) (2026-05-16)


### Features

* **mobile:** improve startup and task list resilience ([a290f74](https://github.com/Snehit70/pravah/commit/a290f740d8fa46d962c40fcf1fa29a6473476ab8))
* **mobile:** make workspace boot non-blocking ([ff23d0e](https://github.com/Snehit70/pravah/commit/ff23d0e0d2ee677661ea5424b26308cfc8e5de78))
* **mobile:** smooth boot-to-shell handoff ([4abb725](https://github.com/Snehit70/pravah/commit/4abb7254932c4f3177a3e398a90e2b4f86fa8978))


### Bug Fixes

* **mobile:** bound timeline and clean deferred Kairo replay ([49fc996](https://github.com/Snehit70/pravah/commit/49fc996e578a03814c175a8f27925e42b62f9eb6))
* **mobile:** clear stale signed-out snapshots ([9770ab4](https://github.com/Snehit70/pravah/commit/9770ab4673a7509fff070016e07b23bb2e3152e9))
* **mobile:** drop stale snapshot hydration after a clear ([05a15e3](https://github.com/Snehit70/pravah/commit/05a15e35c7562edfc1266a332169459666f2bfaf))
* **mobile:** gate workspace actions on live data and unmount boot overlay ([9584527](https://github.com/Snehit70/pravah/commit/95845270bf570629b69d23b48c46a9181d34763d))
* **mobile:** gate workspace actions per active tab, not global readiness ([bb35d23](https://github.com/Snehit70/pravah/commit/bb35d23288e51fbe2712e8b07f8c2b4ab811efd4))
* **mobile:** guard workspace snapshot persist against clear races ([528172b](https://github.com/Snehit70/pravah/commit/528172bd280c27aa1dd53b3214fe4a8bb97bdcc4))
* **mobile:** keep overdue tasks visible in timeline query ([155e156](https://github.com/Snehit70/pravah/commit/155e156c2473fb62bbcfa0590784d72ba2006973))
* **mobile:** require confirmed session before rendering workspace snapshot ([8fb6488](https://github.com/Snehit70/pravah/commit/8fb648839c270021ee391053009594220201f31d))
* **mobile:** scroll to end when queuing deferred Kairo prompts ([3a04f99](https://github.com/Snehit70/pravah/commit/3a04f990e1d27c07e5a35f1a33e8679dd13a3f83))
* **mobile:** surface Kairo settings storage failures ([e33cab8](https://github.com/Snehit70/pravah/commit/e33cab83d90ad1600b22be3de5df6b1ede14a407))


### Performance Improvements

* **mobile:** tune task list virtualization ([f9f79bb](https://github.com/Snehit70/pravah/commit/f9f79bb2327322aa722cbd2ca319b0c6d178351c))

## [1.1.1](https://github.com/Snehit70/pravah/compare/mobile-v1.1.0...mobile-v1.1.1) (2026-05-12)


### Bug Fixes

* **docs:** clarify web and mobile startup checks ([e3570ee](https://github.com/Snehit70/pravah/commit/e3570ee301eda1b91a5614aa0ce8914870033fd2))
* **release:** sync Expo version updates for mobile ([1ac3d9d](https://github.com/Snehit70/pravah/commit/1ac3d9db594d838a68bc76c86635ddfb0c2ddea2))

## [1.1.0](https://github.com/Snehit70/pravah/compare/mobile-v1.0.0...mobile-v1.1.0) (2026-05-05)


### Features

* **auth:** allow mobile scheme in Better Auth trusted origins ([5572678](https://github.com/Snehit70/pravah/commit/557267806f99ac22a67debc17ec3a20263ddb935))
* improve mobile task management and Google sign-in ([09c0c53](https://github.com/Snehit70/pravah/commit/09c0c53caf392cdb27ddc5fcd86dfa783965d38b))
* **mobile-offline:** persist retry queue across app restarts ([427cd5f](https://github.com/Snehit70/pravah/commit/427cd5f338af460ec578645eddabe4312d299891))
* **mobile-ui:** extract task cards, sheets, tabs, and design tokens ([8526f57](https://github.com/Snehit70/pravah/commit/8526f57a187c2e52b3e8b80ed3aa7f7496d7287f))
* **mobile-ux:** use themed sign-out confirmation modal ([2130322](https://github.com/Snehit70/pravah/commit/2130322a207f26775d82fcb83a74751be0871b1a))
* **mobile:** add configurable kairo settings sheet ([1437448](https://github.com/Snehit70/pravah/commit/14374480da8f7b9e70e13579426b2e7eece8af23))
* **mobile:** add deadline date picker and dismiss keyboard on close ([854eafd](https://github.com/Snehit70/pravah/commit/854eafd691039f27adfb9f2709346c391f5ceac5))
* **mobile:** add dedicated android daily reminder channel ([e87cb2d](https://github.com/Snehit70/pravah/commit/e87cb2d04de88bb47b7d0bc7df6800432b98045a))
* **mobile:** add drag-and-drop reordering for inbox and timeline ([84d979d](https://github.com/Snehit70/pravah/commit/84d979d059175c7247968c7fe1d232505f7a9e2d))
* **mobile:** add kairo task assistant ([43035a3](https://github.com/Snehit70/pravah/commit/43035a37eefadb7df94fb377a7f77df710c0075b))
* **mobile:** add retry queue, haptics, and task detail edit sheet ([c7a8d35](https://github.com/Snehit70/pravah/commit/c7a8d3556a6cdf53983dbd17836fb6598265ee87))
* **mobile:** add root error boundary ([8996fa6](https://github.com/Snehit70/pravah/commit/8996fa6f84a482b00094257d3b40d02968ddd0b8))
* **mobile:** add settings modal sync controls and notifications ([324b0c6](https://github.com/Snehit70/pravah/commit/324b0c665d44b52ce7981285064e3915875176a0))
* **mobile:** align surfaces with web design system ([5cc41c1](https://github.com/Snehit70/pravah/commit/5cc41c1f7871646b5fa4a459d6c539db88a497a5))
* **mobile:** bottom tab bar with animated copper underline ([bb1c5c6](https://github.com/Snehit70/pravah/commit/bb1c5c61dc536196958a7e2ade62d93fa53c55ee))
* **mobile:** bring app branding and interactions in sync with web ([780429c](https://github.com/Snehit70/pravah/commit/780429c6ea7eba154c842d7407679f0dc4cb8cfd))
* **mobile:** build task board UI with Convex data and optimistic actions ([b384fd2](https://github.com/Snehit70/pravah/commit/b384fd243928bf7f97a1761cebd9e7258998c8cc))
* **mobile:** editorial empty states with Fraunces headlines ([b97aea0](https://github.com/Snehit70/pravah/commit/b97aea0e4fbb5d34f04fff3d0ac982e94c3746c3))
* **mobile:** editorial header with Fraunces wordmark and mono subtitle ([863b0c7](https://github.com/Snehit70/pravah/commit/863b0c7086825bc2319670c34e4ee8d6a611bd12))
* **mobile:** flat task row with priority rail and swipe actions ([82a82b4](https://github.com/Snehit70/pravah/commit/82a82b4d33e6f9edb809c4f7acdad6cd5acdb94f))
* **mobile:** flatten background to a single warm halo ([a5dc59b](https://github.com/Snehit70/pravah/commit/a5dc59bf6a2709ae26509ae77a7e017f9d9d5a69))
* **mobile:** harden settings UX and document mobile architecture ([8693e8e](https://github.com/Snehit70/pravah/commit/8693e8e0a380966e911258b08c9916a4a4964cfb))
* **mobile:** improve accessibility affordances ([03cea67](https://github.com/Snehit70/pravah/commit/03cea673471bc43555106261bbcd2090c981f539))
* **mobile:** isolate tab crashes with per-screen error boundaries ([7298a59](https://github.com/Snehit70/pravah/commit/7298a5963858898aa2643e95cfb687f7b2a9254d))
* **mobile:** migrate to native Google sign-in dev build flow ([a73ec61](https://github.com/Snehit70/pravah/commit/a73ec61004c13e9cf627405b81322d3c07515d5a))
* **mobile:** polish settings sheet, gate motion on reduced-motion ([a9b8531](https://github.com/Snehit70/pravah/commit/a9b85315f76b745acd799782f28c8be97706857c))
* **mobile:** rebuild Add/Edit sheets with segmented mode and cycling priority ([9cd51f7](https://github.com/Snehit70/pravah/commit/9cd51f7b2f316ed9bd6059bde146ef5d4e0b4432))
* **mobile:** rebuild FAB as a Capture pill with real layered glow ([02bd94b](https://github.com/Snehit70/pravah/commit/02bd94ba7904b52ee789e64979393f7416b668bb))
* **mobile:** rebuild settings modal as flat typographic sheet ([6f20c7a](https://github.com/Snehit70/pravah/commit/6f20c7a7048c9da5045371802fbf6d8224951ab4))
* **mobile:** restyle sign-in screen to match the new system ([1ea53c1](https://github.com/Snehit70/pravah/commit/1ea53c141c15a52f0eaef12dcbb6fc3145f21954))
* **mobile:** restyle toasts, retry banner, and sync line without enclosure ([2c78158](https://github.com/Snehit70/pravah/commit/2c78158118f66b1bad15a35457eb67dcbce4b103))
* **mobile:** sync app branding with web logo ([3a58e4d](https://github.com/Snehit70/pravah/commit/3a58e4d85e502ff2bd070b957079cbb650043c24))
* **mobile:** sync settings chips to scroll position, cover error boundary ([ffb205c](https://github.com/Snehit70/pravah/commit/ffb205cec0ff2c6bf88ca2f88c3a48391c47eefe))
* ship Pravah mobile foundation with offline reliability and EAS setup ([14a2934](https://github.com/Snehit70/pravah/commit/14a2934667135a840f3649804542a8d7a3591cd9))
* **tasks:** add priority support across mobile and backend ([c851d9c](https://github.com/Snehit70/pravah/commit/c851d9c8a61b3f871b5b6d900c28969d7c850c9c))


### Bug Fixes

* add accessibilityRole and label to empty-state CTA pressable ([4f667ca](https://github.com/Snehit70/pravah/commit/4f667ca14f04253f71cea92fc3eed610bb5adb49))
* add Move up/down accessibility actions for scheduled task reorder ([216312f](https://github.com/Snehit70/pravah/commit/216312fc83ded04fc91b60d6056e00f7be71b766))
* add tablist accessibility role to BottomTabBar container ([7543ab0](https://github.com/Snehit70/pravah/commit/7543ab08feec920aa648a327feca9ca8c362ce65))
* drop useRef wrapper on FAB shared value ([d4670e9](https://github.com/Snehit70/pravah/commit/d4670e9937078846a3ed4b5e050647a74438cc92))
* **lint:** resolve all CI lint errors on PR [#19](https://github.com/Snehit70/pravah/issues/19) ([3d7dd5a](https://github.com/Snehit70/pravah/commit/3d7dd5a53ab5abe93d81f76f214149291ee26d0d))
* **mobile-auth:** fallback native Google client IDs to web client ([c6eb10d](https://github.com/Snehit70/pravah/commit/c6eb10db02a5d4d08d0bc3a26e2a55525fe09cec))
* **mobile-auth:** persist cross-domain session in secure storage ([4a0953c](https://github.com/Snehit70/pravah/commit/4a0953cf94ace61a7a32c851e4d9a96b9b0bdc00))
* **mobile-ux:** add sign-out confirmation and clearer edit/deadline affordances ([a3eb7a7](https://github.com/Snehit70/pravah/commit/a3eb7a7de3e780fcb5019523faac863d23b152c9))
* **mobile-ux:** align timeline labels and overdue date messaging ([a9ba342](https://github.com/Snehit70/pravah/commit/a9ba3426bfe99992bde7740aa0df3fb221e0002d))
* **mobile-ux:** improve press feedback, haptics, and empty-state clarity ([e7b6d1f](https://github.com/Snehit70/pravah/commit/e7b6d1f4a79ec35027a7a31ec06b5ad42be79b51))
* **mobile:** add calendar.readonly scope and offlineAccess to GoogleSignin ([04f90d3](https://github.com/Snehit70/pravah/commit/04f90d3d494133bb237788f7f0a2a191671009d9))
* **mobile:** add discard escape hatch for add-task drafts ([7ca4fbd](https://github.com/Snehit70/pravah/commit/7ca4fbdf565d3789dc6311e6f19e2acc042b533f))
* **mobile:** address codex review feedback ([c0fc1f3](https://github.com/Snehit70/pravah/commit/c0fc1f38ae9a523e6e7f7ffd8c8281bdd531eceb))
* **mobile:** address review regressions ([2c18be8](https://github.com/Snehit70/pravah/commit/2c18be881042bbb817b8e8cae3b93a375433741a))
* **mobile:** align local date handling with web parity ([fd47478](https://github.com/Snehit70/pravah/commit/fd47478595e0894e95373df942b2f1d9841cb03c))
* **mobile:** auto-sync Expo env and fallback Convex site URL ([65f0a56](https://github.com/Snehit70/pravah/commit/65f0a56c40488d1162a5f54a71c9d5fafff871af))
* **mobile:** call GoogleSignin.signOut on sign-out; fix integration status default ([cd115b1](https://github.com/Snehit70/pravah/commit/cd115b14fb2c6d87e3c87a10f47c1f84ef28641a))
* **mobile:** clear secure auth storage on sign out ([a9b98d3](https://github.com/Snehit70/pravah/commit/a9b98d300bbf68f2ee773485508b08351f67b45d))
* **mobile:** close open sheet on Android back instead of exiting app ([51b6c40](https://github.com/Snehit70/pravah/commit/51b6c404c4809f59b2c2a54c01a176b29f852ab2))
* **mobile:** derive timeline count from bounded window, not global total ([ef8562a](https://github.com/Snehit70/pravah/commit/ef8562a1b891342135b9510786680d9c4e2d1e82))
* **mobile:** enforce inbox drag boundaries and harden migration retry ([b478b74](https://github.com/Snehit70/pravah/commit/b478b74ee2dac3186f98e135c92f92e1d98b2940))
* **mobile:** enforce priority boundary check in accessibility shift reorder ([ee4cef9](https://github.com/Snehit70/pravah/commit/ee4cef937044c52fb53670569c758780eac9d7dd))
* **mobile:** float add sheet above keyboard height ([c2d900a](https://github.com/Snehit70/pravah/commit/c2d900ae617993ca993728eae79a7a34ceeae623))
* **mobile:** focus AddTaskSheet input only after sheet opens ([4e990f8](https://github.com/Snehit70/pravah/commit/4e990f8c5462f32c9cab2459d905ffdff2b1390c))
* **mobile:** gate ConvexClientProvider behind authStorageReady to fix cold-start session loss ([c79c3fe](https://github.com/Snehit70/pravah/commit/c79c3feca6520636991c9ba61071cd32e698d58f))
* **mobile:** give kairo full workspace context ([e2c6119](https://github.com/Snehit70/pravah/commit/e2c611932ce5987021249368f9b254a65d076425))
* **mobile:** guard duplicate task actions ([cf77c5b](https://github.com/Snehit70/pravah/commit/cf77c5b7703a9a5744724dbdaad94a1f52aec12f))
* **mobile:** guard Kairo sendMessage against empty cold-start corpus ([98330b5](https://github.com/Snehit70/pravah/commit/98330b5e9242f17da03c7508030efa4b50904594))
* **mobile:** guard SecureStore retry-queue writes against size overflow; cap attempts ([48615a0](https://github.com/Snehit70/pravah/commit/48615a01715e7278a1f75c67c8322819bd2c66cd))
* **mobile:** handle storage read rejection in retry queue hydration ([7d55b88](https://github.com/Snehit70/pravah/commit/7d55b8867bc203e4a0e738ab81eeb5c3badd63d7))
* **mobile:** harden pre-build reliability paths ([8ada940](https://github.com/Snehit70/pravah/commit/8ada940f2537cd75997ed9c61e29d427c3b43ab2))
* **mobile:** harden reliability paths before build ([0366227](https://github.com/Snehit70/pravah/commit/036622761a099f68c61c7e9b8230742db018b733))
* **mobile:** improve settings modal visual hierarchy ([49639b8](https://github.com/Snehit70/pravah/commit/49639b8dd3292584104fcbb65045c20432791bf3))
* **mobile:** improve sheet keyboard and disabled states ([63e0c00](https://github.com/Snehit70/pravah/commit/63e0c000d44d2b64fadf0e1a6f87861b263151f1))
* **mobile:** include overdue tasks in timeline query via 14-day lookback ([5ad31ff](https://github.com/Snehit70/pravah/commit/5ad31ffe18b74d7234c52f7bb303e4cf17cf2c2c))
* **mobile:** isolate checkbox row taps ([7b985f4](https://github.com/Snehit70/pravah/commit/7b985f4419c2bc9d5ad91e6e11877cfb63b10d1f))
* **mobile:** keep Add task button visible while drafting in Capture sheet ([baac5a1](https://github.com/Snehit70/pravah/commit/baac5a104a23901e86f8c42df439ee9fc4bdf58e))
* **mobile:** keep edit sheet open when save fails ([6e0d8f8](https://github.com/Snehit70/pravah/commit/6e0d8f842b50aa1272ec147f47935bf69369263d))
* **mobile:** keep inbox/timeline/completed queries always subscribed ([d5d2ec2](https://github.com/Snehit70/pravah/commit/d5d2ec270706eaf63b77deeceac3ef074fd6db21))
* **mobile:** keep task sheets visible with Android keyboard ([ce1e065](https://github.com/Snehit70/pravah/commit/ce1e0650d2ede5b109431a293483528c6e227c2d))
* **mobile:** log google_signin_cancelled when user dismisses account picker ([53696f9](https://github.com/Snehit70/pravah/commit/53696f93e40d66c11a4acca6e0f3243a237ada74))
* **mobile:** make sync settings actions honest ([54e46ad](https://github.com/Snehit70/pravah/commit/54e46ad302d82b96249e2639952bd33aabc15718))
* **mobile:** migrate legacy retry queue from SecureStore to AsyncStorage ([b6a36c6](https://github.com/Snehit70/pravah/commit/b6a36c69829ad5288285f0f10244d52771ba2447))
* **mobile:** optimistic mutations filter task from list instead of patching status ([5ef7bcd](https://github.com/Snehit70/pravah/commit/5ef7bcdc5a19410da22001b74c2709b8d04db5dd))
* **mobile:** pin Kairo sheet to snapPoints (disable dynamic sizing) ([c6b1a92](https://github.com/Snehit70/pravah/commit/c6b1a92e841b0f3525943d4442e05a47fbdf50eb))
* **mobile:** pin tab bar and show list loading state ([3b9895d](https://github.com/Snehit70/pravah/commit/3b9895d3f4c05ff9c5ab77a1f502a817e72b128f))
* **mobile:** preserve add drafts on back navigation ([2966d42](https://github.com/Snehit70/pravah/commit/2966d426c4278ecac1294ea82b85f9c6e3f1f3cf))
* **mobile:** preserve kairo workspace semantics ([ab73e96](https://github.com/Snehit70/pravah/commit/ab73e961340bc5b2fbcc11eac7a83b96b86ed244))
* **mobile:** prevent accidental sheet swipe data loss ([7f6a344](https://github.com/Snehit70/pravah/commit/7f6a34491445e1403cebd8de8bf70cb7ab31bee0))
* **mobile:** pull-to-refresh now flushes retry queue instead of fake convex.query calls ([a28829b](https://github.com/Snehit70/pravah/commit/a28829b83143436782d805a96f9814b8087c50ed))
* **mobile:** queue retries only for transient offline failures ([9c883d4](https://github.com/Snehit70/pravah/commit/9c883d41a51586982acbf2b9f497290d154a087d))
* **mobile:** raise hitSlop to minimum 12 on all small interactive targets ([878fcbe](https://github.com/Snehit70/pravah/commit/878fcbe8273b013edd5066d9a9a841bb9634de1d))
* **mobile:** reject cross-day timeline drags before firing mutation ([551b37f](https://github.com/Snehit70/pravah/commit/551b37f710139888f9b9f621199f49a10d7a9028))
* **mobile:** remove legacy bootstrap work ([1e3368d](https://github.com/Snehit70/pravah/commit/1e3368dac5a2e042272b484c8fb95fe40488b6aa))
* **mobile:** remove startDate lower bound from timeline query entirely ([486cfba](https://github.com/Snehit70/pravah/commit/486cfba8d4b1616d6f82102ff38d1f0116e93cf6))
* **mobile:** render Inbox & Timeline with FlatList ([35bfa59](https://github.com/Snehit70/pravah/commit/35bfa5964bc65d5bdc752336bf22a52fc4e6613e))
* **mobile:** respect inbox mode when adding due tasks ([d8cec9e](https://github.com/Snehit70/pravah/commit/d8cec9e6f1968648d1cc04c05876b4269996091a))
* **mobile:** restore drag reorder and guard kairo save ([4784c78](https://github.com/Snehit70/pravah/commit/4784c781b13fd78d202c1e942f2546b47ff029df))
* **mobile:** restore explicit RefreshControl import ([3216091](https://github.com/Snehit70/pravah/commit/3216091d16af716df21c4a7f658861e707734bd9))
* **mobile:** restore FAB state when sheets close ([f737044](https://github.com/Snehit70/pravah/commit/f737044110ff5d8755243bc85290861ed3a0b512))
* **mobile:** restore inbox drag reorder and align priority guard ([936bd9f](https://github.com/Snehit70/pravah/commit/936bd9f3225032e9cb41d9ba011bf372f506d23c))
* **mobile:** restore task views and sheet interactions ([5a6a1b6](https://github.com/Snehit70/pravah/commit/5a6a1b6bc14a5c3e58652ab5e4d8c8e50fabd105))
* **mobile:** restore web client id for Google sign-in ([34a37a3](https://github.com/Snehit70/pravah/commit/34a37a3c64fc5cc8e0406c742af332d1aad1f180))
* **mobile:** restrict drag reorder to same priority group ([af4c7db](https://github.com/Snehit70/pravah/commit/af4c7db68a12be7cd974cb7f83cdb7630835f7d4))
* **mobile:** retry deferred Kairo prompt after workspace loads ([74ff748](https://github.com/Snehit70/pravah/commit/74ff74873af52cdf79d83968a35e3ae691fe9463))
* **mobile:** run legacy data claim bootstrap on session ([b35fb7d](https://github.com/Snehit70/pravah/commit/b35fb7dd8d3fd04a352bb703880593839b038218))
* **mobile:** satisfy FAB shared-value immutability lint ([8bdce75](https://github.com/Snehit70/pravah/commit/8bdce7527ce3909793e1dbe569f2f1b1cfc0a238))
* **mobile:** satisfy quality lint for animated actions ([b6f8adf](https://github.com/Snehit70/pravah/commit/b6f8adf1dd601e2cb99a67ae9afe56329281c68e))
* **mobile:** scope timeline to upcoming tasks ([472dcb3](https://github.com/Snehit70/pravah/commit/472dcb32037b33430d1432474b88f58fe809c8c6))
* **mobile:** split Timeline subtitle into overdue + this-week counts ([a37d4ec](https://github.com/Snehit70/pravah/commit/a37d4ec77670d382d58fa3c0e51d9bac442c3e14))
* **mobile:** stability, architecture, and UX hardening ([0c7c4af](https://github.com/Snehit70/pravah/commit/0c7c4af96179744cff3a7c6dc28c42cdd52f4984))
* **mobile:** stabilize home lists, sheet behavior, and Android back handling ([c3ca773](https://github.com/Snehit70/pravah/commit/c3ca773662a20d117ff07beb4d9cf86fb6cef05d))
* **mobile:** use Android Google client id and log sign-in errors ([68c2593](https://github.com/Snehit70/pravah/commit/68c2593e494412fcaf38ce55bbdc51c1139775a4))
* **mobile:** use safe-area-context SafeAreaView ([62c6680](https://github.com/Snehit70/pravah/commit/62c6680bd0815012c940949e7b58dc8104168ca8))
* **mobile:** validate deadlines and harden edit sheet UX ([eac842f](https://github.com/Snehit70/pravah/commit/eac842fb4a488d82ae070eee297b9331a65d9991))
* **mobile:** wire timeline mutations and overdue visibility ([9b61324](https://github.com/Snehit70/pravah/commit/9b613248e1459efc07816cefe73a7f6bdcc3d4f2))
* pick storage backend once at init to prevent split-brain in retry queue ([d7de336](https://github.com/Snehit70/pravah/commit/d7de336063927b9eb036479af919e9dd72639589))
* replace isLikelyOfflineError with classifyError to eliminate duplication ([bb8511d](https://github.com/Snehit70/pravah/commit/bb8511dad4dd6a1f30899ab7fd7bf93c51ee09ee))
* replace raw hex strings in SettingsSheet status colors with design tokens ([30f5302](https://github.com/Snehit70/pravah/commit/30f5302067f1a0d5513faa15aa4f3689caa5467f))
* scope optimistic rollback to failed mutation instead of wiping all state ([2938e6f](https://github.com/Snehit70/pravah/commit/2938e6f801ff1256ec166a41f31894aaec912f3f))
* **settings:** add show/hide toggle for Kairo API key field ([1eee218](https://github.com/Snehit70/pravah/commit/1eee218345c364100161b2d2f06ecb5fe1db9d23))
* **settings:** show loading state while Kairo config loads from SecureStore ([6d03fe3](https://github.com/Snehit70/pravah/commit/6d03fe36b3c6d9c00f8e0f3ad5c7f415bfcb1a22))
* show overdue tasks in timeline (extend startDate to yesterday) ([6eea2d4](https://github.com/Snehit70/pravah/commit/6eea2d4a4158edb7355a5ea4af2dab07882c6eea))
* **tasks:** keep shift ordering stable within priority groups ([5fdc992](https://github.com/Snehit70/pravah/commit/5fdc992d2098bfde323384bf6a023decd1e63f1c))
* **timeline:** add startDate lower bound to getTimeline query ([ca7fa27](https://github.com/Snehit70/pravah/commit/ca7fa277aadf071a1569a2f8e6d7394ebdc4f516))


### Performance Improvements

* **mobile:** fetch active-tab tasks and separate counts ([92f511e](https://github.com/Snehit70/pravah/commit/92f511ee504f0c1b27306cd08e7108df0d82780c))
* **mobile:** fetch full task corpus only when Kairo is active ([bd39903](https://github.com/Snehit70/pravah/commit/bd39903154a2c7f9dca80ed96b30342db0b178eb))
* **mobile:** virtualize task lists with SectionList ([ce5ba44](https://github.com/Snehit70/pravah/commit/ce5ba44b33dd1044b56abedc92edd0ed0ac278aa))
* **mobile:** virtualize timeline dragging in one list ([5199209](https://github.com/Snehit70/pravah/commit/519920945ceba4e0c996733151346e8a170451ec))
