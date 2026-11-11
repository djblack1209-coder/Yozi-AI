# Website motion — November 11, 2026

The owner-selected directions were identified in the [Wangshiliang catalog](https://wangshiliang.cn/news). The corresponding full films were inspected on [MotionSites](https://motionsites.ai/backgrounds). All choices are provisional until the owner selects replacements. The Hero keeps its existing Pudding footage.

| Published asset | Source and treatment |
| --- | --- |
| `yozi-glass-route.mp4` | **Motion Background 18**, catalog `backgrounds:motion-background-18`. The official free **Copy URL** action returned the complete 1920 × 1080 film. The website uses a 1280 × 720, 24 fps encoding with a half-second loop blend. |
| `yozi-study-console.mp4` | **Ember Trail**, catalog `backgrounds:ember-trail`. The official free **Copy URL** action returned the complete square 1440 × 1440 film. The website uses a 960 × 960, 24 fps encoding with the same loop blend. |
| `yozi-neon-field.mp4` | Original procedural color field in `neon-field.py`, referencing the fully observed, non-landscape **Neon Flux** preview, catalog `backgrounds:neon-flux-2fdf9e11`. The original premium download requires unlocking and was not copied. This is an interpretation, not a licensed copy or an exact reproduction. |

The two official Copy URL actions and original download addresses are recorded in the continuation result's source receipt and `tmp/downloads.json`. Publisher terms: [MotionSites Terms of Use](https://motionsites.ai/terms), dated September 30, 2026. Original downloads are retained as local source material outside the public website; do not redistribute them as an asset library.

`prepare-web-media.py SOURCE_DIRECTORY WEBSITE_MEDIA_DIRECTORY` reproduces the two website encodings and WebP posters with the existing FFmpeg and Pillow installation. It expects `source-motion-background-18.mp4` and `source-ember-trail.mp4`. Encoded files are hosted with the website; visitors do not fetch third-party media.

`website-motion.py` retains the separately authored glass-route and blue study-console alternatives. Their completed renders and scenes are preserved in the task evidence directory; these alternatives are not the two adopted website films.
