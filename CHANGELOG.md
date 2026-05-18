# Changelog

## [1.7.0](https://github.com/Snehit70/pravah/compare/web-v1.6.0...web-v1.7.0) (2026-05-18)


### Features

* **convex:** soft delete with 30-minute undo window ([2bf6893](https://github.com/Snehit70/pravah/commit/2bf68938310c5a87b689b6d881583abdd9ffadf3))
* **mobile:** give Kairo task handles in its context ([508d251](https://github.com/Snehit70/pravah/commit/508d251bf38401fcd57f7f3f958c6a4fee59607e))
* **mobile:** Kairo full task control with per-action undo ([491a7ad](https://github.com/Snehit70/pravah/commit/491a7ad3e81fd600dceea417b5defa2d7547e45e))
* **mobile:** make Kairo starter pills context-aware ([90661ac](https://github.com/Snehit70/pravah/commit/90661acf6a1708104ff1f88367b367c608827dff))
* **mobile:** parser and executor for full Kairo action set ([2b3fe7e](https://github.com/Snehit70/pravah/commit/2b3fe7e0f24a5b2ecf11a70a5565cbaa9c1cdca5))
* **mobile:** run Kairo actions with per-action undo ([1d46c01](https://github.com/Snehit70/pravah/commit/1d46c01291164e506ff8baa5c2f37ac4f9883a75))
* **mobile:** show inline retry on Kairo error bubbles ([17a2d72](https://github.com/Snehit70/pravah/commit/17a2d72a8a86113b25105829be356a386abe4dc7))


### Bug Fixes

* **mobile:** conditionally include title/priority keys in updateTask ([6fd5cb3](https://github.com/Snehit70/pravah/commit/6fd5cb3d86b6d368b400ce6fc2d52eea10164f91))
* **mobile:** fix updateTask adapter deadline key and undo retry on failure ([0388a66](https://github.com/Snehit70/pravah/commit/0388a66c0e09fe871f9c45d042f76200ac7ca5c1))
* **mobile:** harden Kairo action undo correctness and deadline semantics ([4ba291d](https://github.com/Snehit70/pravah/commit/4ba291dcf7c1b3bc412b0cefeacc04a593b2f80e))
* **mobile:** include task type when mirroring deadline side-effects ([feef8a3](https://github.com/Snehit70/pravah/commit/feef8a35a46b755d7506ef733b0e704603349f03))
* **mobile:** reject malformed update deadlines instead of clearing ([641fe96](https://github.com/Snehit70/pravah/commit/641fe96d0c6b9f51b14457e52ba26a5fa94f28cd))
* **mobile:** restore schedule state on deadline-change update undo ([bf5ba13](https://github.com/Snehit70/pravah/commit/bf5ba136ea02d3cd30852cd3f655cf22e0903895))

## [1.6.0](https://github.com/Snehit70/pravah/compare/web-v1.5.0...web-v1.6.0) (2026-05-18)


### Features

* **mobile:** Kairo quick wins — markdown, retry, smart starters ([6ee58b6](https://github.com/Snehit70/pravah/commit/6ee58b62a317d78acf09c2ed35e3ae579321b229))
* **mobile:** make Kairo starter pills context-aware ([2d917bb](https://github.com/Snehit70/pravah/commit/2d917bb3c3354aa09439b25c2b50c36b195778f1))
* **mobile:** render markdown in Kairo assistant bubbles ([0e48188](https://github.com/Snehit70/pravah/commit/0e48188cd2b20e58e72d7a3c30a8a4b938f3367b))
* **mobile:** show inline retry on Kairo error bubbles ([cb73936](https://github.com/Snehit70/pravah/commit/cb739366bc5371589c9ba76c51253f2f35d12601))


### Bug Fixes

* **mobile:** refresh Kairo starters across day rollover ([3ccbd65](https://github.com/Snehit70/pravah/commit/3ccbd654bd14654bc3f5a5d7db0c1247e4eb1ebb))
* **mobile:** tick today every minute while Kairo sheet is open ([e0e771e](https://github.com/Snehit70/pravah/commit/e0e771e62bb2561fbc651fc5e70214714de78a5a))

## [1.5.0](https://github.com/Snehit70/pravah/compare/web-v1.4.0...web-v1.5.0) (2026-05-18)


### Features

* **mobile:** add Kairo chat list panel UI ([4d89c00](https://github.com/Snehit70/pravah/commit/4d89c00b56972787c10c7c0e1b619188532bc746))
* **mobile:** add useKairoChats hook for chat history state ([2e3562c](https://github.com/Snehit70/pravah/commit/2e3562cfc4eafdeb3410e4bf74303415da8885ff))
* **mobile:** Kairo persistent multi-chat history ([1c51a4b](https://github.com/Snehit70/pravah/commit/1c51a4bb07629510858d767cca874d531f4bf200))
* **mobile:** persist Kairo chats to AsyncStorage ([5063f74](https://github.com/Snehit70/pravah/commit/5063f744cd6ead8a8cb623359b4ff515685ad2d4))
* **mobile:** wire Kairo to persistent multi-chat history ([f0f823b](https://github.com/Snehit70/pravah/commit/f0f823bfbb4fee1f585e60b8d6db4c04889ed006))


### Bug Fixes

* **mobile:** detach chat on switch and upsert meta on message edit ([a381220](https://github.com/Snehit70/pravah/commit/a381220b817209e444aaa91bedbda42ffacffce5))
* **mobile:** harden Kairo chat hydration and history slicing ([f6ad973](https://github.com/Snehit70/pravah/commit/f6ad9734d57888f4d3ab774b45e578ee56866887))
* **mobile:** persist user edits after hydrate failure and avoid delete-race writes ([e96ef3f](https://github.com/Snehit70/pravah/commit/e96ef3fde21deb4ebda025ecc5d68f2781785725))
* **mobile:** route all user-driven chat updates through markUserTouched ([c28ad20](https://github.com/Snehit70/pravah/commit/c28ad2022a37e3db86bdd3bb43e247547a1ac421))

## [1.4.0](https://github.com/Snehit70/pravah/compare/web-v1.3.0...web-v1.4.0) (2026-05-17)


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

## [1.3.0](https://github.com/Snehit70/pravah/compare/web-v1.2.0...web-v1.3.0) (2026-05-16)


### Features

* **mobile:** add runtime diagnostics and Kairo safeguards ([5b378db](https://github.com/Snehit70/pravah/commit/5b378dbe584f5279363ec40b142bdf194b567f60))
* **mobile:** add runtime diagnostics and Kairo safeguards ([8f4243c](https://github.com/Snehit70/pravah/commit/8f4243cad61b54d95a4ed19d87083b55312cd367))

## [1.2.0](https://github.com/Snehit70/pravah/compare/web-v1.1.1...web-v1.2.0) (2026-05-16)


### Features

* **mobile:** improve list responsiveness and touch targets ([8dab01b](https://github.com/Snehit70/pravah/commit/8dab01b76b5653ec4fe80fab3d2016a90cf4c8a0))
* **mobile:** improve list responsiveness and touch targets ([317c408](https://github.com/Snehit70/pravah/commit/317c40889992e4053e232fb9c982ec418f9c2c7b))


### Bug Fixes

* **mobile:** constrain adjacent-sibling hitSlop to vertical only ([795be5b](https://github.com/Snehit70/pravah/commit/795be5bd7bb1cf7c61184e5e75cb6962d61bd5b9))
* **mobile:** preserve incremental row budget on live updates ([038f0bc](https://github.com/Snehit70/pravah/commit/038f0bc87bc44c45b390472a70dccc9dcd138419))
* **mobile:** show initial rows before incremental batch timer fires ([c90a073](https://github.com/Snehit70/pravah/commit/c90a073e80a285f67feb9057545c1cd2b7e5ba76))

## [1.1.1](https://github.com/Snehit70/pravah/compare/web-v1.1.0...web-v1.1.1) (2026-05-16)


### Bug Fixes

* **mobile:** preserve timeline visible rows on live updates ([22dad60](https://github.com/Snehit70/pravah/commit/22dad60442a25ad73fefa2978c1240fb38d19779))
* **mobile:** reset timeline incremental row budget ([c23bd49](https://github.com/Snehit70/pravah/commit/c23bd49e27e621459452dc7aed04785aebf029ca))
* **mobile:** show initial timeline rows before batch timer fires ([1acb615](https://github.com/Snehit70/pravah/commit/1acb6156817a0d1b82b8c2a36febc12b372f4591))


### Performance Improvements

* **mobile:** incrementally render timeline rows ([9da6123](https://github.com/Snehit70/pravah/commit/9da612367b4bbdfc2e183555d7e4a2162fe7ab24))
* **mobile:** incrementally render timeline rows ([347431d](https://github.com/Snehit70/pravah/commit/347431dbd3f924bc0a686bb1ee35eff70458342b))

## [1.1.0](https://github.com/Snehit70/pravah/compare/web-v1.0.1...web-v1.1.0) (2026-05-16)


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

## [1.0.1](https://github.com/Snehit70/pravah/compare/web-v1.0.0...web-v1.0.1) (2026-05-12)


### Bug Fixes

* **docs:** clarify web and mobile startup checks ([e3570ee](https://github.com/Snehit70/pravah/commit/e3570ee301eda1b91a5614aa0ce8914870033fd2))
* **release:** sync Expo version updates for mobile ([1ac3d9d](https://github.com/Snehit70/pravah/commit/1ac3d9db594d838a68bc76c86635ddfb0c2ddea2))

## 1.0.0 (2026-05-05)


### Features

* add complete Phase 1 features and tests ([9f418f4](https://github.com/Snehit70/pravah/commit/9f418f47f2cf17448c1d432e18648b9b2a4e765b))
* add deadline scheduling backfill mutation ([e57ec93](https://github.com/Snehit70/pravah/commit/e57ec9355b0f020eb2d8b601424cc3804a075f76))
* add empty state guidance for new users ([d352e38](https://github.com/Snehit70/pravah/commit/d352e386a16a38b770780294cfa08043e6b408b3))
* add form validation feedback ([3cb307d](https://github.com/Snehit70/pravah/commit/3cb307d2c4b174e721e20059ba0a982cec5ee2ea))
* add Google Calendar/Gmail integration UI and settings ([d4f70d8](https://github.com/Snehit70/pravah/commit/d4f70d84d148d1c9445d2ad9f492ea4c7b955884))
* add HTTP API endpoints and MCP server ([3df7968](https://github.com/Snehit70/pravah/commit/3df796820d99efadb36aa5f0f98766c604ca0dcf))
* add loading skeleton state ([98eba2c](https://github.com/Snehit70/pravah/commit/98eba2c8e9b6d036e86d12fc8f8ad200f2aa5bc1))
* add mobile responsive improvements ([01aea6d](https://github.com/Snehit70/pravah/commit/01aea6d67b6246e8c2afef14dcdbb744ad159a24))
* add review approvals and task lifecycle operations ([8a54686](https://github.com/Snehit70/pravah/commit/8a54686f2c996bf2bdf66ea5fd1c45d967c490b0))
* add sync engine, review queue, and import APIs ([c4feb46](https://github.com/Snehit70/pravah/commit/c4feb464e6c0059e2a93efc705d248bf508db442))
* add timeline UI components with drag-drop ([021b7cf](https://github.com/Snehit70/pravah/commit/021b7cf58ce2ad8f44513fc04e768fcd84f2d523))
* add toast notification system ([04def95](https://github.com/Snehit70/pravah/commit/04def951fe98e9ff07fd73ebf836852f4530c803))
* add Zod validation to backend endpoints ([df2267f](https://github.com/Snehit70/pravah/commit/df2267fc3eaaddf857129511a8596db5e48d5ead))
* apply notion-style dark theme and add long-term goals page ([66155bc](https://github.com/Snehit70/pravah/commit/66155bcb6f1a15d12e88c9975c9f88de34086cda))
* **auth:** add Better Auth Google sign-in and user data isolation ([24bd71b](https://github.com/Snehit70/pravah/commit/24bd71b4d7bb6a39ea57d45288304cbef77f9821))
* **auth:** add Better Auth login and unify Google sync UX ([65bed65](https://github.com/Snehit70/pravah/commit/65bed65feef6ddcaed3d01716fcf3956a7248f5e))
* **auth:** allow mobile scheme in Better Auth trusted origins ([5572678](https://github.com/Snehit70/pravah/commit/557267806f99ac22a67debc17ec3a20263ddb935))
* **auth:** unify login flow and improve sign-out controls ([ee41ef5](https://github.com/Snehit70/pravah/commit/ee41ef57f7b2885d6d23019149c010936d72af31))
* Complete Pravah timeline UI with API and MCP server ([cf0b762](https://github.com/Snehit70/pravah/commit/cf0b762797cf5bf1459018543baad6dbb98cb88a))
* extract reusable Button component ([3a32fc8](https://github.com/Snehit70/pravah/commit/3a32fc80eb1cbdd6e2210204ef44f926a58ddc78))
* extract reusable Input and Textarea components ([393845c](https://github.com/Snehit70/pravah/commit/393845c030063b3f41304f8a45825af94cb59351))
* extract reusable Modal component ([5c9cd04](https://github.com/Snehit70/pravah/commit/5c9cd045b1ecb990c23be083f327383d8925e2b9))
* implement OAuth PKCE flow for Google sign-in ([e37ed2a](https://github.com/Snehit70/pravah/commit/e37ed2a36c5cfa801079b5be4ff1c18f895bafc2))
* improve mobile task management and Google sign-in ([09c0c53](https://github.com/Snehit70/pravah/commit/09c0c53caf392cdb27ddc5fcd86dfa783965d38b))
* **inbox:** support drag reordering in inbox list ([990d72d](https://github.com/Snehit70/pravah/commit/990d72d2c1ed84164b225d5ba76662bf33a034ee))
* initialize project with React + Vite + Convex + Tailwind ([de55729](https://github.com/Snehit70/pravah/commit/de55729d2334d51018dc37c23a74eeb0183cbf95))
* integrate OAuth callback handler in Settings ([a13089a](https://github.com/Snehit70/pravah/commit/a13089a7934c6cb9d890b83f9cbf373d86fc066e))
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
* **motion:** consolidate motion tokens and wire view-transition navigation ([2091bc6](https://github.com/Snehit70/pravah/commit/2091bc612a5cf1ab824a188fd9187f4114bda66f))
* **motion:** consolidate motion tokens, add view-transition hooks, refine reduced-motion policy ([4d184e8](https://github.com/Snehit70/pravah/commit/4d184e8cfb10344448cc5649d3e9ae97aa06a00e))
* notion-style dark theme, unified navigation, and long-term goals page ([af3eeae](https://github.com/Snehit70/pravah/commit/af3eeae93d2d8f85b343a8ced8324fae0c6fa837))
* persist and display connected google account email ([c58bb4a](https://github.com/Snehit70/pravah/commit/c58bb4ae4da0551e6e4a4718ea2244aa3001b1bb))
* polish timeline UI with animations and bug fixes ([cc89872](https://github.com/Snehit70/pravah/commit/cc89872ea538b596712169260865be4fd91f5a3f))
* prevent past dates in deadline fields ([84b6372](https://github.com/Snehit70/pravah/commit/84b6372e0d25550f1ebf52a5c5dfd085dd5cf39d))
* **quickadd:** add deadline presets and smarter date defaults ([9fc0434](https://github.com/Snehit70/pravah/commit/9fc0434db534da80613f6da8b950e665fb33d3b1))
* **quickadd:** improve modal accessibility and submission resilience ([356b3fa](https://github.com/Snehit70/pravah/commit/356b3fa7e90c730b42aa38adc8270a6b24a45d83))
* **settings:** add calendar selection controls for sync scope ([560b2f2](https://github.com/Snehit70/pravah/commit/560b2f26ea9797cd913af48e9896f64a8f2e16b5))
* ship Pravah mobile foundation with offline reliability and EAS setup ([14a2934](https://github.com/Snehit70/pravah/commit/14a2934667135a840f3649804542a8d7a3591cd9))
* sync-first architecture, review queue, and app refactors ([378734a](https://github.com/Snehit70/pravah/commit/378734af23dacf434c73615adef8af15fc4227e5))
* **sync:** add paginated multi-calendar imports and full resync ([e591d7d](https://github.com/Snehit70/pravah/commit/e591d7d68ee8f553f8109a774fc72effa54c2112))
* **tasks:** add priority support across mobile and backend ([c851d9c](https://github.com/Snehit70/pravah/commit/c851d9c8a61b3f871b5b6d900c28969d7c850c9c))
* **tasks:** allow overdue carry-forward and inbox unschedule drag ([517ba12](https://github.com/Snehit70/pravah/commit/517ba1263388e837d3cd07f5406377413a0e16e1))
* **ui:** add subtle grid texture behind the timeline canvas ([c0c0fb5](https://github.com/Snehit70/pravah/commit/c0c0fb5cf654c6f8afa4f19d4f8e612a9d09b1c9))
* **ui:** compact task previews in day columns ([859582d](https://github.com/Snehit70/pravah/commit/859582d03b6398c9953ef8eab9ed4610c3575084))
* **ui:** extend today highlight through both lanes ([cce9885](https://github.com/Snehit70/pravah/commit/cce9885fdb5859eef3c34fb60c29106904173caa))
* **ui:** frontend design upgrade — timeline, Kairo, inbox, motion ([a140ddc](https://github.com/Snehit70/pravah/commit/a140ddc64ad4d84921d893c937b61f8a414fca14))
* **ui:** grid timeline redesign with Geist and Kairo copilot ([a1fcb42](https://github.com/Snehit70/pravah/commit/a1fcb42728cac826a3e110289dea0b6cab1a52e7))
* **ui:** make status bar reflect live sync state ([d861d27](https://github.com/Snehit70/pravah/commit/d861d276b3dd5d27586f522618003da9669dcaf8))
* **ui:** move settings action into sidebar footer ([7bc7ca6](https://github.com/Snehit70/pravah/commit/7bc7ca6af87dbcc3079362e2629cfb2fbceb8878))
* **ui:** move sidebar add-task control to bottom ([3fcc58a](https://github.com/Snehit70/pravah/commit/3fcc58ad9aff42e09d446511b9ea48a31b1a2978))
* **ui:** move sidebar right and quick-add to sidebar bottom ([b044dc6](https://github.com/Snehit70/pravah/commit/b044dc6b75824dd6292dd845c6d79322f5a2ba50))
* **ui:** polish inbox cards, header, and search affordance ([33ab153](https://github.com/Snehit70/pravah/commit/33ab153e5d70ad96e4e682d1cfc88148d6a3a0c3))
* **ui:** redesign Edit Task modal to match timeline aesthetic ([fac9a60](https://github.com/Snehit70/pravah/commit/fac9a60f620e770b2b1c3a7fe26d6c16b109375b))
* **ui:** self-host Geist via fontsource ([dde94ee](https://github.com/Snehit70/pravah/commit/dde94eed3ba111e2aeeda01b4c4dd7983af2a30a))
* **ui:** tighten typography scale and density ([7b21e03](https://github.com/Snehit70/pravah/commit/7b21e03d24515e57412410634a38dd9e56124636))
* **ui:** wire missing animations across drag, completion, and scroll ([04084cf](https://github.com/Snehit70/pravah/commit/04084cfe0fde313f2e4adf7d864f9340e9d0d379))
* **web:** add priority parity and guarded drag reorder ([5537563](https://github.com/Snehit70/pravah/commit/5537563a26c423cc28c3372b263bbbf8f8bfcc3c))


### Bug Fixes

* **a11y:** stabilize quick-add focus restoration and alerts ([8ac2c92](https://github.com/Snehit70/pravah/commit/8ac2c9240bfb6a9f38473a00e41e72f6fbd30c5d))
* add accessibilityRole and label to empty-state CTA pressable ([4f667ca](https://github.com/Snehit70/pravah/commit/4f667ca14f04253f71cea92fc3eed610bb5adb49))
* add cors preflight support for google token endpoint ([19a2265](https://github.com/Snehit70/pravah/commit/19a2265593f35b5d6910e3d626552e1e0c2743c2))
* add Move up/down accessibility actions for scheduled task reorder ([216312f](https://github.com/Snehit70/pravah/commit/216312fc83ded04fc91b60d6056e00f7be71b766))
* add requireAuth to /timeline and /inbox, forward x-api-key in MCP server ([1231a59](https://github.com/Snehit70/pravah/commit/1231a5908b7809549591f052e602311448c942fb))
* add tablist accessibility role to BottomTabBar container ([7543ab0](https://github.com/Snehit70/pravah/commit/7543ab08feec920aa648a327feca9ca8c362ce65))
* address Greptile review comments ([5606072](https://github.com/Snehit70/pravah/commit/56060728a30c95b0f384ee21906814125d52f508))
* allow browser oauth code exchange on google token endpoint ([27a6885](https://github.com/Snehit70/pravah/commit/27a6885cb4dfc8991d33c2506f9927deb709c380))
* allow cross-day drop when targeting a scheduled task card ([dbe3d90](https://github.com/Snehit70/pravah/commit/dbe3d9022009f6d8fde067bc91e09c7f0cd9c21f))
* **app:** scope board queries to active tasks ([23d6476](https://github.com/Snehit70/pravah/commit/23d647680288980bd3ab9545378f35cbec9a9050))
* **auth:** address PR review issues in sign-in and legacy claim ([068580a](https://github.com/Snehit70/pravah/commit/068580a57b70660136566551572f2ae81d807509))
* **auth:** allow localhost dev origins for better-auth ([9ab5af3](https://github.com/Snehit70/pravah/commit/9ab5af3c9b9c416dcecaa1ff81d84d20ba6fec83))
* **auth:** fire-and-forget token revoke and pass client date to completed-today query ([542bedb](https://github.com/Snehit70/pravah/commit/542bedb313cf35183285887832c2a7f9fa4aeaa5))
* **auth:** harden bootstrap and deadline invariants ([d83a92d](https://github.com/Snehit70/pravah/commit/d83a92dcaaf0bc1b6d656e3ea3d01ae1ad4e21d3))
* **auth:** revoke google token server-side on disconnect ([935c19d](https://github.com/Snehit70/pravah/commit/935c19db5c5bf199d44be6e609a125ad2026c283))
* **auth:** trust deployed origins for session cors ([ef5ae7f](https://github.com/Snehit70/pravah/commit/ef5ae7f2e700ab2ee3c964b4ed793e29b5114a89))
* auto-schedule deadline tasks to deadline date ([e265d1f](https://github.com/Snehit70/pravah/commit/e265d1f946b799287f3580cf6d171bca532d211d))
* **backend:** restrict /google/token CORS to an allowlist ([8dcd6b0](https://github.com/Snehit70/pravah/commit/8dcd6b08c3c27b16ccef4fe3c6d2b0ce12dcfc3c))
* **backend:** use constant-time comparison for API key auth ([434289d](https://github.com/Snehit70/pravah/commit/434289dd6fff8574faf50d0c0bca336186335bae))
* **build:** align react version with expo sdk 54 runtime ([35d3610](https://github.com/Snehit70/pravah/commit/35d361001e26a6235399fb70e0458c6c61b4ea1a))
* **ci:** avoid set-state-in-effect in bootstrap hook ([abe3335](https://github.com/Snehit70/pravah/commit/abe3335a224562db01238146f25d7b95918b918a))
* **convex:** type cors origin callbacks ([41b9773](https://github.com/Snehit70/pravah/commit/41b9773c4f3f03b12c06f091d77d9321ca1ba3bc))
* correct Convex HTTP validation and typing ([5e4777d](https://github.com/Snehit70/pravah/commit/5e4777d0ae010fc9aa8587896ef8db04e690472f))
* correct z-index stacking for background pattern ([d7a86cb](https://github.com/Snehit70/pravah/commit/d7a86cb1b1ed86886f5f2f8beb29993333146655))
* **dev-build:** auto-detect Android SDK and JDK for local builds ([5031e3f](https://github.com/Snehit70/pravah/commit/5031e3fb655a0efc88910f3971ea5f79a130f41e))
* **dev-build:** ensure Android runner picks valid JDK ([b22e098](https://github.com/Snehit70/pravah/commit/b22e098ea695a3b4d6c8639669aa294a89cbc3fb))
* **dnd+timeline:** handle deadline-lane drop IDs and fix done-today denominator ([ea3468f](https://github.com/Snehit70/pravah/commit/ea3468ff68b096acebf1df5ef09477e582b11f14))
* **docs:** clarify single-user ownership model ([54f9da8](https://github.com/Snehit70/pravah/commit/54f9da82a826ac2c10363e620abcc41fdd7fb761))
* **drag:** block cross-lane reorder when dropping onto deadline task card ([5537649](https://github.com/Snehit70/pravah/commit/5537649f92282758c40477a4f2bd336bf4ab6207))
* **drag:** no-op same-day deadline-lane container drops in resolveDropTargetDate ([e0885b1](https://github.com/Snehit70/pravah/commit/e0885b1dc30a19871e7e90e22c2ceb77d1331ef5))
* drop useRef wrapper on FAB shared value ([d4670e9](https://github.com/Snehit70/pravah/commit/d4670e9937078846a3ed4b5e050647a74438cc92))
* **gmail:** use q parameter for message list filtering ([2549526](https://github.com/Snehit70/pravah/commit/25495264a977d3ffab4315f8852a175c8230e9e1))
* guard bulk reschedule state transitions ([28c9106](https://github.com/Snehit70/pravah/commit/28c9106c026f5e28c41b6905c4cd95735f9012eb))
* harden mcp convex client config and http error handling ([687863e](https://github.com/Snehit70/pravah/commit/687863efb99a66cda676276872c392d82c55f17a))
* honor reduced-motion in looping timeline animations ([30fa340](https://github.com/Snehit70/pravah/commit/30fa3408fb8bbee6de132a96a0855900a42e1de4))
* improve accessibility for form labels and toast announcements ([6f8deef](https://github.com/Snehit70/pravah/commit/6f8deeffef6abd59ebfa30c24bf3d76eb4302e27))
* improve delete confirmation UX ([9d28449](https://github.com/Snehit70/pravah/commit/9d28449c7b65d21792761bc8a1ba65caa4658cf7))
* **inbox:** remove MCP indicator; fix drag reorder animation and snap-back ([7b15d71](https://github.com/Snehit70/pravah/commit/7b15d71151faf5a3de7231a51833e822e81bc41d))
* **inbox:** revert optimistic order after 6s on failed reorder mutation ([edd39f6](https://github.com/Snehit70/pravah/commit/edd39f617dbf0b6c2681a2e4e06c885456252540))
* **kairo+inbox:** set deadline field on AI tasks; disable reorder during search ([ae1d6a6](https://github.com/Snehit70/pravah/commit/ae1d6a62aa0aa378be4e987372fb421ef0c7d988))
* **kairo:** close modal on backdrop click ([639acba](https://github.com/Snehit70/pravah/commit/639acbaf022d5ad5b1192495894c146fa369e328))
* **kairo:** drop layout prop, animate width/y explicitly ([e5508b7](https://github.com/Snehit70/pravah/commit/e5508b707384dfca6c349587195f8fcdb81f45f7))
* **kairo:** send x-api-key header for Anthropic provider instead of Bearer ([0ad4441](https://github.com/Snehit70/pravah/commit/0ad4441ef0af46d615f4dad8304867ba52bf63c0))
* keep inbox ordering stable by task position ([46fd190](https://github.com/Snehit70/pravah/commit/46fd190043708200c880fa9d4ac6d6ade221bb28))
* **lint+codex:** resolve CI lint error and address 5 new Codex comments ([9797af3](https://github.com/Snehit70/pravah/commit/9797af31efc71ffabecefa8480d29fdcc46b7a5b))
* **lint:** remove unused timeline settings prop ([07553c2](https://github.com/Snehit70/pravah/commit/07553c21eb2c668703ace431cccaf7fad099b532))
* **lint:** resolve all CI lint errors on PR [#19](https://github.com/Snehit70/pravah/issues/19) ([3d7dd5a](https://github.com/Snehit70/pravah/commit/3d7dd5a53ab5abe93d81f76f214149291ee26d0d))
* **lint:** resolve all ESLint errors blocking CI ([92be25c](https://github.com/Snehit70/pravah/commit/92be25cc1fdb813e7e49006325a187decdcbf1a0))
* **mcp:** URL-encode query params via URLSearchParams ([92dd93e](https://github.com/Snehit70/pravah/commit/92dd93ed98d90223cd61fc79d2227137ededd396))
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
* **motion:** correct task complete sweep and today accent keyframes ([14abf0b](https://github.com/Snehit70/pravah/commit/14abf0b6d6745ae52c75ab8aa0f89e72ecedf48c))
* **motion:** prevent View Transitions / Framer enter double-animation ([3585628](https://github.com/Snehit70/pravah/commit/3585628086ba53a9ddb4fc4c5ca07d08e0e05df2))
* **motion:** use ease-in-out for shimmer; adopt useMotion hooks ([a1546b0](https://github.com/Snehit70/pravah/commit/a1546b0b081606c0477a2734e016ca54fbe987bf))
* persist and hydrate integration toggles in settings ([c3176bc](https://github.com/Snehit70/pravah/commit/c3176bc701ab26e4319b876c3b444f9d1e7eae5c))
* pick storage backend once at init to prevent split-brain in retry queue ([d7de336](https://github.com/Snehit70/pravah/commit/d7de336063927b9eb036479af919e9dd72639589))
* prevent post-import sync status downgrade ([c05f01b](https://github.com/Snehit70/pravah/commit/c05f01b2939a68724176bdcf14eb10425841e014))
* prevent settings modal crash when review query is unavailable ([eda5334](https://github.com/Snehit70/pravah/commit/eda5334c976df8622b08ef71b11fa24a2ba954fe))
* **quickadd:** deadline date matches selected when slot, not always today ([3a2f681](https://github.com/Snehit70/pravah/commit/3a2f68156c5a97aac3d5f20227cdaa5cec8e5f9f))
* **quickadd:** pass description to addTask mutation ([530dcd3](https://github.com/Snehit70/pravah/commit/530dcd3982225bb102bf85fc1bc93f1c7dd45d70))
* remove unused email state from Settings component ([85ebef9](https://github.com/Snehit70/pravah/commit/85ebef931cd4a22072b172ee7d34be37d0b8d2cf))
* render radial pattern on main app surface ([dced422](https://github.com/Snehit70/pravah/commit/dced4222fad41f6132d6a341db93435ec8e21438))
* replace isLikelyOfflineError with classifyError to eliminate duplication ([bb8511d](https://github.com/Snehit70/pravah/commit/bb8511dad4dd6a1f30899ab7fd7bf93c51ee09ee))
* replace raw hex strings in SettingsSheet status colors with design tokens ([30f5302](https://github.com/Snehit70/pravah/commit/30f5302067f1a0d5513faa15aa4f3689caa5467f))
* require API key for all HTTP endpoints ([666357f](https://github.com/Snehit70/pravah/commit/666357f998dbc78be60e174a06861b046af7d2c5))
* resolve convex http url for google token exchange ([22b51a0](https://github.com/Snehit70/pravah/commit/22b51a00e5b9148b271e752e16f7ee888cb635f8))
* resolve UI lint errors and toast hook exports ([f648e4b](https://github.com/Snehit70/pravah/commit/f648e4b02ff64a021885664cfd8c06f5f3c204cc))
* retry calendar sync without stale updatedMin cursor ([37d9613](https://github.com/Snehit70/pravah/commit/37d96132d32a72a981cd700a794583ab9b5a05b4))
* scope optimistic rollback to failed mutation instead of wiping all state ([2938e6f](https://github.com/Snehit70/pravah/commit/2938e6f801ff1256ec166a41f31894aaec912f3f))
* secure OAuth token exchange and add endpoint validation ([3765728](https://github.com/Snehit70/pravah/commit/3765728e939405a1751d53dd98732ec9e188c822))
* secure token exchange and skip unchanged sync patches ([efcf82c](https://github.com/Snehit70/pravah/commit/efcf82c507b89d9692fdcde5e4be5fb002da9ed2))
* security, logic, perf and test suite hardening ([04c33fa](https://github.com/Snehit70/pravah/commit/04c33fa68da8e7ea31c3ab499c23a871f99a7509))
* **settings:** add show/hide toggle for Kairo API key field ([1eee218](https://github.com/Snehit70/pravah/commit/1eee218345c364100161b2d2f06ecb5fe1db9d23))
* **settings:** clarify review queue flow and add coverage ([9115401](https://github.com/Snehit70/pravah/commit/9115401f4ba0fc66c32abb56144dc69ca72ea0c3))
* **settings:** prevent sync-toggle regression during email hydration ([f8b73aa](https://github.com/Snehit70/pravah/commit/f8b73aadf61ce0a670aa3aa0a4a881901eaf5405))
* **settings:** show loading state while Kairo config loads from SecureStore ([6d03fe3](https://github.com/Snehit70/pravah/commit/6d03fe36b3c6d9c00f8e0f3ad5c7f415bfcb1a22))
* **settings:** use type=password for Kairo API key input for cross-browser masking ([4c14208](https://github.com/Snehit70/pravah/commit/4c14208b48b93253b45c950be69e6c62bd828713))
* show actionable google calendar service-disabled sync errors ([54379e3](https://github.com/Snehit70/pravah/commit/54379e3fd21674647eeda5c71926b57b0546fdc8))
* show overdue tasks in timeline (extend startDate to yesterday) ([6eea2d4](https://github.com/Snehit70/pravah/commit/6eea2d4a4158edb7355a5ea4af2dab07882c6eea))
* **status:** use real WebSocket connection state for convex indicator ([7a14b55](https://github.com/Snehit70/pravah/commit/7a14b55af96d017ae6224ba016e53e5d0bdbfa94))
* surface actionable google oauth configuration errors ([1cebede](https://github.com/Snehit70/pravah/commit/1cebede18db2714c2b5ad836be3d6ae2b4f4270b))
* surface actionable unschedule backend mismatch error ([522e3f2](https://github.com/Snehit70/pravah/commit/522e3f21ed9e09a7a030bce4064f31452dd517fb))
* **sync:** avoid unbounded reads when assigning task positions ([e1e9b07](https://github.com/Snehit70/pravah/commit/e1e9b0734ef915eff161323734c56ecdb8066d0c))
* **sync:** dedupe gmail candidates and align unread copy ([b3da2c0](https://github.com/Snehit70/pravah/commit/b3da2c02f75c6d99053fad82acf71c9cfa9ce070))
* **sync:** preserve stored calendar scope and primary-id mapping ([50502c2](https://github.com/Snehit70/pravah/commit/50502c2d74731df05ae41cb04ab213e8e84d241f))
* **sync:** recompute position when calendar lane changes ([9368418](https://github.com/Snehit70/pravah/commit/9368418b17181ff27d2ba699871d7ab0d3563439))
* **tasks:** align local date checks and surface drag failures ([58632c1](https://github.com/Snehit70/pravah/commit/58632c1978851ef74ca180a45bb0b847f0c542e7))
* **tasks:** enforce deadline scheduling invariants on edit ([b6d9a6a](https://github.com/Snehit70/pravah/commit/b6d9a6adfc4187ae6492274a99a20ecc80a2c370))
* **tasks:** keep shift ordering stable within priority groups ([5fdc992](https://github.com/Snehit70/pravah/commit/5fdc992d2098bfde323384bf6a023decd1e63f1c))
* tighten API typings across integration modules ([ca89278](https://github.com/Snehit70/pravah/commit/ca89278c98e129e2ba2d4c27fa89b75c6690d9b0))
* **timeline:** add startDate lower bound to getTimeline query ([ca7fa27](https://github.com/Snehit70/pravah/commit/ca7fa277aadf071a1569a2f8e6d7394ebdc4f516))
* **timeline:** restore done-today count using dedicated completed-tasks query ([744d7e3](https://github.com/Snehit70/pravah/commit/744d7e3774cdee26c6bfbc43b053ee34d1c87389))
* **ui:** address greptile accessibility and task-preview feedback ([0814378](https://github.com/Snehit70/pravah/commit/081437823275fe4976c01259f52c3268067889cf))
* **ui:** anchor sidebar add button to true viewport bottom ([b5bfba3](https://github.com/Snehit70/pravah/commit/b5bfba3e00593d3224a19209bdd14ea8550f5503))
* **ui:** declutter quick add popup layout ([30bec08](https://github.com/Snehit70/pravah/commit/30bec08bba4f8ae0b7795b713406e1bd03c6f7c0))
* **ui:** hide inbox icon in collapsed sidebar ([ac280bb](https://github.com/Snehit70/pravah/commit/ac280bbffa7d53209cc8cc08f802fd1825a6876a))
* **ui:** migrate remaining transition-colors duration-150 leftovers ([1ff4313](https://github.com/Snehit70/pravah/commit/1ff4313b53ec988008cf5d05f3e30783b1ff4a60))
* **ui:** preserve left accent bar on task card hover ([10b02b7](https://github.com/Snehit70/pravah/commit/10b02b78bb977778e135a863d4b8fca9102f4886))
* **ui:** prevent inbox header toggle overlap ([3f35e53](https://github.com/Snehit70/pravah/commit/3f35e532a3f545ed6f1de34d69ea47b710723996))
* **ui:** remove misleading quick add header icon ([982adce](https://github.com/Snehit70/pravah/commit/982adcee21099a37e32d074b1c528e49035499c5))
* **ui:** restore bottom quick-add popup and remove inline add flow ([3db6ef4](https://github.com/Snehit70/pravah/commit/3db6ef4da83c46a1f5c0de0cdeba6c31acf62499))
* **ui:** use rectangular pill buttons in QuickAdd to match theme ([cf2e035](https://github.com/Snehit70/pravah/commit/cf2e035268607d076c4eb91213cfee897df69e5d))
* use local date floor for deadline inputs ([1903bd9](https://github.com/Snehit70/pravah/commit/1903bd92176d90d49bccd57c1f32fc90bb4febe3))
* use server oauth client id env with clearer token error ([278cb13](https://github.com/Snehit70/pravah/commit/278cb1363e94ac82fe30b3dd753ad89aa9fb718c))
* **web:** extend keyboard + a11y support on day-column task preview ([96e5e12](https://github.com/Snehit70/pravah/commit/96e5e128e7cd76e7cfbe721419a9b10a9aafbb53))
* **web:** play Modal exit animation ([dfb15c7](https://github.com/Snehit70/pravah/commit/dfb15c7a093fea92227ef68642313553f191baca))


### Performance Improvements

* **auth:** serve hero image as webp ([476b258](https://github.com/Snehit70/pravah/commit/476b2586a01ab83e3b855ac0251c9d87bfcfa291))
* **convex:** index timeline query and add task counts ([52998b9](https://github.com/Snehit70/pravah/commit/52998b9148cacf929c5c0c031b67f1a7266788c5))
* lazy-load overlays and add task rule tests ([c32938e](https://github.com/Snehit70/pravah/commit/c32938e299be68b5a9f9672222f8ebc43a8ae19c))
* memoize task board rendering components ([336d693](https://github.com/Snehit70/pravah/commit/336d6939b68920734955401c0b84259e8bfb58a3))
* **mobile:** fetch active-tab tasks and separate counts ([92f511e](https://github.com/Snehit70/pravah/commit/92f511ee504f0c1b27306cd08e7108df0d82780c))
* **mobile:** fetch full task corpus only when Kairo is active ([bd39903](https://github.com/Snehit70/pravah/commit/bd39903154a2c7f9dca80ed96b30342db0b178eb))
* **mobile:** virtualize task lists with SectionList ([ce5ba44](https://github.com/Snehit70/pravah/commit/ce5ba44b33dd1044b56abedc92edd0ed0ac278aa))
* **mobile:** virtualize timeline dragging in one list ([5199209](https://github.com/Snehit70/pravah/commit/519920945ceba4e0c996733151346e8a170451ec))
* optimize bundle splitting and reduce asset size ([91a69c0](https://github.com/Snehit70/pravah/commit/91a69c06b0efe60cefa0eeb0c293560c08bd03bf))
* optimize bundle splitting and reduce asset size ([da00c9a](https://github.com/Snehit70/pravah/commit/da00c9ac4dab99d1740a4bc80b2baec40741bb2d))
* **web:** use matchMedia for inbox sidebar breakpoint ([b059cb5](https://github.com/Snehit70/pravah/commit/b059cb5dcddba5d34ace0b47ba07292ab290b308))
