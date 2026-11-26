# Image generation providers & local models

Research notes, verified **2026-11-26** against vendor docs, Hugging Face API, and GitHub
releases. Prices and quant sizes move — re-check before committing to a number.

Hardware the local figures assume: **RTX 4070 SUPER 12 GB**, i5-13600K, 62 GB RAM, Linux.

## Why this exists

SunnyGen needs a path for unfiltered/adult generation. Third-party APIs either forbid it,
mark it up heavily, or can change their AUP without notice. Local inference removes that
dependency entirely and costs ~$0.0001/image in electricity instead of $0.013–$0.10.

## Verdict

**Primary:** local inference via `stable-diffusion.cpp` (`sd-server`) in front of
MOSS-Image-SFT + an NSFW LoRA. **Fallback:** Wiro for frontier models when the GPU is
unavailable. **Avoid:** uncensored.com (flat $0.10/image), fal/Replicate (AUP prohibits
adult content).

## Remote providers — price per image (USD)

### Same model, different reseller

| Model                    | Wiro        | uncensored.com | SpicyAPI               | Direct first-party             | fal         |
| ------------------------ | ----------- | -------------- | ---------------------- | ------------------------------ | ----------- |
| Z Image Uncensored       | **$0.013**  | $0.10          | —                      | —                              | —           |
| Z Image Pro (1K/2K same) | **$0.02**   | —              | —                      | —                              | —           |
| Z-Image Turbo            | —           | $0.20          | $0.012 (LoRA)          | —                              | —           |
| Seedream v4.5            | $0.03–0.04¹ | $0.10          | —                      | —                              | —           |
| Seedream v5 Lite         | **$0.035**  | —              | —                      | —                              | $0.035      |
| Seedream v5 / 5.5        | —           | $0.10 / n/a    | —                      | —                              | $0.03 (5.5) |
| Seedream V5 Pro          | **$0.045**  | —              | —                      | $0.045 (BytePlus, $0.09 @2K)   | $0.0675     |
| Qwen Image Edit          | $0.046      | —              | $0.036 (Qwen 2.1 edit) | —                              | —           |
| Qwen Image 2.1 t2i       | —           | —              | $0.024                 | $0.016 turbo / $0.0353 pro     | —           |
| Qwen Image 3.0           | —           | —              | —                      | $0.03 / $0.04 pro ($0.075 @2K) | —           |
| Lustify v7               | —           | $0.10          | —                      | —                              | —           |
| Prefect Pony XL          | —           | $0.10          | —                      | —                              | —           |
| Flux 2 Pro               | —           | $0.10          | —                      | —                              | —           |

¹ Wiro's blog says $0.03; a third-party grid says $0.04. Treat as approximate.

**Wiro does not mark up.** Z Image at $0.013 and Z Image Pro at $0.02 are below
uncensored.com's flat $0.10; Seedream V5 Pro at $0.045 matches BytePlus's own price.
**uncensored.com is the overpriced one** — flat $0.10 for everything, 2–8× the others.

### Cost per 1,000 images

| Provider                      | Cheapest explicit model           | 1k         | Best mainstream         | 1k     |
| ----------------------------- | --------------------------------- | ---------- | ----------------------- | ------ |
| **Local (MOSS + LoRA)**       | MOSS-Image-SFT                    | **~$0.13** | same                    | ~$0.13 |
| ModelsLab ($47 Standard)      | SDXL / Pony / Illustrious / LoRAs | **$4.70**  | Flux, SD3.5             | $4.70  |
| ModelsLab ($149/mo, 100k vol) | same                              | ~$1.50     | same                    | ~$1.50 |
| **Runware** (PAYG)            | SDXL $0.0026 / Flux Dev $0.0038   | **$2.60**  | Qwen 2.1 Turbo $0.0141  | $14.13 |
| **Wiro** (PAYG)               | Z Image $0.013                    | **$13**    | Seedream V5 Pro $0.045  | $45    |
| **SpicyAPI** ($50 min top-up) | Z-Image LoRA $0.012               | **$12**    | image-1-pro $0.09       | $90    |
| **BytePlus direct**           | —                                 | —          | Seedream 5.0 Pro $0.045 | $45    |
| **DashScope direct**          | —                                 | —          | Qwen 3.0 $0.03          | $30    |
| **uncensored.com** (PAYG)     | everything                        | **$100**   | everything              | $100   |

### Billing terms

| Provider             | Billing                       | Min spend | Concurrency gate                        | Failed jobs billed? |
| -------------------- | ----------------------------- | --------- | --------------------------------------- | ------------------- |
| Wiro                 | Prepaid PAYG                  | $0        | `max(1, balance×0.10)`, unlimited >$250 | No                  |
| uncensored.com       | Prepaid PAYG                  | $0        | Not published                           | —                   |
| SpicyAPI             | Prepaid PAYG, USD not credits | **$50**   | Not published                           | No                  |
| ModelsLab            | **Subscription required**     | $21/mo    | 10–15 parallel                          | —                   |
| Runware              | Prepaid PAYG, never expires   | $0        | —                                       | No                  |
| BytePlus / DashScope | Postpaid cloud account        | —         | Per-tier rate limits                    | —                   |
| fal / Replicate      | Prepaid credits               | $0        | —                                       | No                  |

### Wiro integration notes

- `POST /v1/Run/{owner}/{slug}` → `taskid` + `socketaccesstoken`; poll `/Task/Detail`,
  or pass `callbackUrl`, or WebSocket `wss://socket.wiro.ai/v1`.
- **Webhook quirks:** no signature, no auth header. Only **HTTP 200** counts as delivered
  (201/204 count as failure). 3 retries 2s apart, no redirects, private/loopback hosts
  get nothing. Keep polling as fallback — matches the existing `SUNNYGEN_PUBLIC_URL` design.
- **Over-limit returns HTTP 200** with `result: false` and `errors[].code == 96`. Handle it
  as a retryable error, not a failure.
- Only successful runs billed (`pexit == "0"`). `totalcost` on every task record.
- Outputs are CDN URLs on `cdn1.wiro.ai` and are deletable via `Task/InputOutputDelete`.
  Copy to local media immediately.

### Policy reality check

"Uncensored" = the vendor removed the prompt filter. It does not mean the model renders
explicit anatomy competently. Seedream, Z-Image and Qwen are not trained on it. Wiro's own
help docs confirm uncensored models can still block minors and identifiable real people.

## Local models

### The landscape (HF, text-to-image, by downloads)

| Downloads | Likes   | Model                                                |
| --------- | ------- | ---------------------------------------------------- |
| 620k      | 876     | `AtomicChat/Qwen-Image-2.1-Turbo-Uncensored-GGUF`    |
| 375k      | 245     | `LyliaEngine/Pony_Diffusion_V6_XL`                   |
| 340k      | 755     | `chatrlabs/Qwen-Image-2.1-Uncensored-Omni-Quantized` |
| 288k      | —       | `unsloth/MOSS-Image-SFT-GGUF`                        |
| 254k      | 699     | `Noctaluna/Noct-Q-Uncensored-Qwen-Image-2.1`         |
| 215k      | 441     | `OnomaAIResearch/Illustrious-xl-early-release-v0`    |
| 106k      | 19      | `shootstuff/LUSTIFY-v2.0`                            |
| 75k       | **923** | `axiomofmind/Moss-image-nsfw-uncensored-lora`        |

### MOSS-Image — the pick

`OpenMOSS-Team/MOSS-Image-SFT` (Fudan MOSS lab), **Apache 2.0**.

| Component             | FP16     | Architecture |
| --------------------- | -------- | ------------ |
| Transformer (DiT, 5B) | 10.16 GB | MOSS-Image   |
| Text encoder          | 16.79 GB | Qwen3.5 9B   |
| VAE                   | 0.25 GB  | FLUX.2 VAE   |

Total 27.2 GB FP16. Supports natural language, tag sequences, **and JSON layout** for text
placement and object arrangement. SFT beats Base on text grouping and layout. Official
LoRAs exist (`moss_image_edit_lora_rank_64`, `moss_image_color_depth_control`), so LoRA is
a supported path.

**Why it wins over Qwen 2.1 Uncensored:**

|                      | MOSS + NSFW LoRA                                                            | Qwen 2.1 Turbo Uncensored |
| -------------------- | --------------------------------------------------------------------------- | ------------------------- |
| Base license         | **Apache 2.0**                                                              | `other`                   |
| Uncensoring          | **70 MB LoRA, scale 0.8, adjustable**                                       | full fine-tune, fixed     |
| DiT Q8_0             | **5.41 GB** (int8_convrot) / 5.71 GB (gguf)                                 | 8.71 GB                   |
| Heretic text encoder | **Yes** — `pottokao/MOSS-Image-Text-Encoder-Heretic-DHQ-GGUF`, 2.92–6.64 GB | No                        |
| Steps                | 25, or 4-step distilled variant                                             | 8 (Turbo)                 |
| Layout control       | **JSON layout + tag sequences**                                             | prompt + refs             |

The NSFW LoRA (`axiomofmind/Moss-image-nsfw-uncensored-lora`, Apache 2.0, trigger
`moss_xvstyle`, scale 0.8) is **70 MB** — trained 1750 steps on 130 images. The earlier
221-image/2000-step checkpoint is at `original-checkpoint-2000/`, scale 0.7. A pre-merged
25.4 GiB diffusers bundle exists for the no-adapter path.

Uncensoring at the **text-encoder** layer matters: MOSS's encoder is a Qwen3.5 VLM, and a
VLM can soften explicit concepts before the DiT sees the prompt. `pottokao`'s abliterated
GGUF fixes that layer.

**Weakness:** 130 training images is narrow. It handles the poses in that set well and
gets thin outside it. Pony/Illustrious have thousands of LoRAs covering everything; MOSS
has a handful.

### VRAM budget on 12 GB

| Component    | Options                    | Size     |
| ------------ | -------------------------- | -------- |
| DiT          | Q8_0 (leejet GGUF)         | 5.71 GB  |
|              | Q4_K                       | 3.33 GB  |
|              | int8_convrot (safetensors) | 5.41 GB  |
| Text encoder | Qwen3.5-9B IQ4_XS          | 5.17 GB  |
|              | Q4_K_M                     | 5.68 GB  |
|              | Q3_K_M                     | 4.67 GB  |
| VAE          | `flux2_ae`                 | ~0.25 GB |
| Tokenizer    | `tokenizer_qwen3.5.json`   | tiny     |

| Config                   | Total       | Fits 12 GB              |
| ------------------------ | ----------- | ----------------------- |
| DiT Q8_0 + TE Q3_K_M     | 10.6 GB     | Yes, comfortable        |
| **DiT Q8_0 + TE IQ4_XS** | **11.1 GB** | Yes, `--offload-to-cpu` |
| DiT Q4_K + TE Q4_K_M     | 9.3 GB      | Room to spare           |

`--offload-to-cpu` is the documented mode at 1024×1024, not a workaround.

### Others considered

- **MiniMax H3-Image** — open weights, 16 MP, 6-step distilled, but territory-excluded
  license (**no EU, UK, South Korea, US**), DiT Q4_K_M peaks at 14 GiB, text encoder is
  Qwen3-VL-**32B** at 18 GB Q4. Smallest working set is 29.4 GB. **Not viable on 12 GB.**
- **Qwen-Image-2.1** — 7B DiT + Qwen3-VL 8B encoder. Base license is `other` (v1 and
  Edit-2509 are Apache 2.0). GGUF Q8_0 8.71 GB. Turbo does 8 steps. Biggest ecosystem.
- **Qwen-Image v1 (20.4B)** — Q4 is 14.1 GB, offload only.
- **Pony V6 XL / Illustrious** — 6.94 GB FP16, 2–5 s/image, enormous LoRA ecosystem, but
  SDXL-era quality ceiling. Best breadth play.
- **llama.cpp** — runs _text_ diffusion models (Dream 7B, LLaDA 8B), not image. Image/video
  diffusion is an open RFC (#28541).

### License gotchas (verified via HF API)

| Repo                                                 | License                             |
| ---------------------------------------------------- | ----------------------------------- |
| `OpenMOSS-Team/MOSS-Image-SFT` / `-Base`             | **apache-2.0**                      |
| `axiomofmind/Moss-image-nsfw-uncensored-lora`        | apache-2.0                          |
| `AtomicChat/Qwen-Image-2.1-Turbo-Uncensored-GGUF`    | apache-2.0                          |
| `LyliaEngine/Pony_Diffusion_V6_XL`                   | cdla-permissive-2.0                 |
| `Qwen/Qwen-Image-Edit-2509`                          | apache-2.0                          |
| `Qwen/Qwen-Image-2.1` (base)                         | **other**                           |
| `chatrlabs/Qwen-Image-2.1-Uncensored-Omni-Quantized` | other                               |
| `shootstuff/LUSTIFY-v2.0`                            | none stated                         |
| `MiniMaxAI/MiniMax-H3-Image`                         | other — **excludes EU, UK, KR, US** |

## Why sd-server, not ComfyUI

SunnyGen replaces ComfyUI; depending on it as a backend would mean shipping a competing
node-graph UI plus a multi-GB Python/torch stack.

`leejet/stable-diffusion.cpp` is the llama.cpp of diffusion — same ggml backend, same GGUF
format, single binary.

|           | ComfyUI                                | sd-server                                 |
| --------- | -------------------------------------- | ----------------------------------------- |
| Install   | Python + torch + CUDA wheels, multi-GB | **29.1 MB** Linux x86_64 (42.2 MB Vulkan) |
| Interface | Node graph                             | HTTP API, headless                        |
| Runtime   | Python                                 | C/C++, ggml                               |

Day-0 MOSS-Image support landed 2026/10/16. Also runs SD1.x/2.x/Turbo, SD3/3.5, FLUX.2
dev/klein, FLUX.3 Klein, Qwen Image, Z-Image, MiniMax H3, and Wan — the entire matrix from
this research behind one process.

### API surface (`127.0.0.1:1234` by default)

| Family       | Endpoint                                             | Note                               |
| ------------ | ---------------------------------------------------- | ---------------------------------- |
| OpenAI-style | `POST /v1/images/generations`                        | Closest to existing adapter shapes |
| A1111        | `/sdapi/v1/txt2img`, `/img2img`, `/sdapi/v1/options` | Samplers, schedulers, LoRAs        |
| Native       | `/sdcpp/v1/img_gen`                                  | Job submit + polling               |
| Model mgmt   | `/sdcpp/v1/models/load`, `/sdcpp/v1/models/status`   | Hot-swap at runtime                |

### MOSS-Image invocation

Four files required: `--diffusion-model`, `--llm`, `--vae`, `--tokenizer`.

```text
--diffusion-model moss_image_sft_int8_convrot_attn.safetensors
--llm             Qwen3.5-9B-Q4_K_M.gguf
--vae             flux2_ae.safetensors
--tokenizer       tokenizer_qwen3.5.json
--cfg-scale 3.0 -W 1024 -H 1024 --offload-to-cpu
```

Qwen3.5 uses a different vocabulary from the embedded Qwen tokenizer — pass the external
`tokenizer.json` explicitly.

### Integration shape in SunnyGen

`apps/cli` already supervises a service via launchd/systemd; `sd-server` is the same shape
— a localhost child process plus an HTTP surface.

```text
packages/providers/src/local/
  client.ts   → http://127.0.0.1:1234, no API key
  image.ts    → POST /v1/images/generations or /sdcpp/v1/img_gen
  models.ts   → /sdcpp/v1/models/load for swaps
  index.ts    → ProviderModule, webhook: undefined (poll only)
```

Plus a `ProviderId` entry, a registry line, and catalog entries in
`packages/core/src/models.ts`. `ProviderWebhook` is already optional so polling-only fits
without touching the type.

## Open questions

1. **No Linux CUDA binary in releases.** Linux assets are Ubuntu x86_64 (generic CPU),
   Vulkan, and ROCm; CUDA builds ship for Windows only. On a 4070 SUPER this means either
   a source build with CUDA or the Vulkan build (works, some throughput loss). **Verify
   before committing to this path.**
2. **Does the `moss_xvstyle` GGUF LoRA load in sd.cpp?** Official MOSS LoRAs exist in
   `Comfy-Org/MOSS-Image/loras/`, so LoRA is supported in principle. Confirm the 70 MB
   adapter actually applies.
3. **Unmeasured speed on the 4070 SUPER.** All figures above are extrapolated from
   4090/5090/3060 benchmarks.
4. **Retake rate.** MOSS's 130-image LoRA may need more attempts than a Pony checkpoint.
   Effective cost per accepted image is unknown.

## Sources

- Wiro: `wiro.ai/docs/pricing`, `wiro.ai/docs/run-a-model`, `wiro.ai/docs/model-parameters`,
  `wiro.ai/docs/concurrency-limits`, `wiro.ai/docs/tasks`, plus per-model pages
  (`z-image-uncensored` $0.013, `z-image-pro-uncensored` $0.02,
  `qwen-image-edit-uncensored` $0.046).
- uncensored.com: `docs.uncensored.com/images/models` (live catalog table).
- SpicyAPI: `spicyapi.ai/pricing`, `spicyapi.com/docs/api/create-image`.
- ModelsLab: `modelslab.com/image-generation-api`, `modelslab.com/pricing`.
- Runware: `runware.ai/pricing`.
- BytePlus: `byteplus.com/en/product/modelark/pricing`; DashScope:
  `alibabacloud.com/help/en/model-studio/qwen-image-3-0`.
- fal: `fal.ai/pricing`, `fal.ai/models/bytedance/seedream/v5/pro/us/text-to-image`.
- MOSS-Image: `huggingface.co/OpenMOSS-Team/MOSS-Image-SFT` (README, config.json,
  tree API), `unsloth.ai/docs/models/moss-image`.
- sd.cpp: `github.com/leejet/stable-diffusion.cpp` — `docs/models/moss_image.md`,
  `examples/server/api.md`, release `master-1106-532d2c1` (2026-11-16).
- HF API queries for download counts, likes, file sizes, and licenses on the repos listed.
