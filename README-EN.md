<h1 align="center">
# ✨ IMAGEGEN Cloudflare API - Intelligent Image Generation Assistant ✨
</h1>

<p align="center">
    <br> English | <a href="README.md">中文</a>
</p>
<p align="center">

This is an image generation API proxy service deployed on Cloudflare Workers. It aims to provide a unified, optimized interface for invoking various image generation models, while integrating powerful features such as prompt engineering, image proxying, and security authentication.

</p>

## 🚀 Project Overview

This project leverages the edge computing capabilities of Cloudflare Workers to provide you with an efficient and scalable image generation solution. It not only proxies your image generation requests but also optimizes simple user ideas into professional prompts more suitable for image models through an integrated OpenAI model (or other API-compatible models).

## 🌟 Key Features

*   **🖼️ Multi-Vendor Image Generation Proxy**: Unified interface to call backend image generation services. The Worker can now intelligently distinguish and handle two main types of image generation API configurations:
    *   **SILICONFLOW Type API (Single Vendor)**: Configured via the `FLUX_GEN_...` series of environment variables, handling APIs that return image links and require proxying and Markdown encapsulation.
    *   **Direct Image Type API (Supports Multiple Vendors)**: Configured via the `IMAGE_GEN_..._n` series of environment variables, allowing access to multiple API vendors that directly return image data or JSON containing image links.
*   **🧠 Intelligent Prompt Engineering**:
    *   Supports **Non-Reasoning Mode**: Quickly converts simple user ideas into optimized image generation prompts.
    *   Supports **Reasoning Mode**: The model first goes through a thinking process (output within `<think>` tags) before giving the final prompt, suitable for more complex scenarios.
    *   Strict prompt format and length control to ensure optimal generation results.
*   **🔗 Image Proxy and Display Optimization (Mainly for SILICONFLOW Type API)**:
    *   Built-in `/image-proxy` endpoint for proxying image URLs. This is particularly useful for handling original image links that are time-sensitive (like temporary links from some cloud storage) or require specific download behavior, ensuring direct usability of image links.
    *   For SILICONFLOW type APIs, image generation results are returned in Markdown format `![Image](PROXY_IMAGE_URL)`. This format is very friendly and **allows generated images to be displayed directly and seamlessly in many third-party applications that support Markdown**, while also including the optimized prompt for reference. Responses from Direct Image Type APIs will be adjusted based on their original output format.
*   **🔑 Security Authentication**:
    *   Worker-level API key authentication to protect your service from abuse.
    *   Supports configuring multiple backend image generation API keys (comma-separated) for `FLUX_GEN_API_KEY` and each `IMAGE_GEN_API_KEY_n`, with round-robin attempts.
*   **⚙️ Highly Configurable**:
    *   Easily configure supported image generation models via environment variables `FLUX_GEN_MODEL` (for SILICONFLOW type) and `IMAGE_GEN_MODEL_n` (for multiple direct image type vendors).
    *   Configurable model for prompt optimization (OpenAI GPT series or other compatible models).
    *   Separately configurable base URLs and keys for SILICONFLOW type API, and for multiple direct image type API vendors.
    *   **Important**: All configured model names (from `FLUX_GEN_MODEL` and all `IMAGE_GEN_MODEL_n`) must be globally unique, otherwise the Worker will report an error at the relevant API endpoints.
*   **📐 Supports Image Aspect Ratios** (⚠️ Effective only when the image generation API supports it): Users can specify aspect ratios in their prompts (e.g., adding `16:9` or `1:1` at the end of the prompt), and the Worker will automatically convert them to corresponding image dimensions for generation. Currently supported aspect ratios and their corresponding resolutions are as follows:

    | User Input Aspect Ratio | Corresponding Image Resolution |
    | :---------------------- | :----------------------------- |
    | `1:1`                   | `1024x1024`                    |
    | `1:2`                   | `512x1024`                     |
    | `3:2`                   | `768x512`                      |
    | `3:4`                   | `768x1024`                     |
    | `16:9`                  | `1024x576`                     |
    | `9:16`                  | `576x1024`                     |
    *If the user does not specify or specifies an unsupported aspect ratio, `1024x1024` (1:1) will be used by default.*

*   **🌐 Core API Endpoints**:
    *   `/v1/chat/completions`: Core image generation interface (compatible with OpenAI Completions API format).
    *   `/v1/models`: Lists all currently configured, conflict-free available image generation models (merged from `FLUX_GEN_MODEL` and all `IMAGE_GEN_MODEL_n`). If model name conflicts are detected, this endpoint will return an error.
    *   `/health` or `/v1/health`: Health check endpoint.

## 🛠️ Deployment and Configuration

### Deployment Steps

1.  Open **Cloudflare**, log in, create and deploy a Worker.
2.  Set environment variables.
3.  Delete all existing code in the worker, then copy and paste the code from [`index.js`](/index.js).
4.  Click "Deploy". You will see a simple welcome page on the test page.

### Environment Variables (Secrets)

The following are the environment variables required for this project to run. Please ensure they are configured correctly. It is **strongly** recommended to configure sensitive information (like API keys) as encrypted environment variables (Secrets) in Cloudflare Workers.

| Environment Variable (Secret Name) | Required? | Description                                                                                                                                                                                             | Example Value                                                |
| :----------------------------- | :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :----------------------------------------------------------- |
| `AUTHORIZED_API_KEY`           | **Yes**   | Global API key to access this Worker service. Client requests must include `Bearer YOUR_KEY` in the `Authorization` header.                                                                                   | `WB@eYdQEp5G4Zg3g04nQMEceicdPB#`                              |
| `OPENAI_API_KEY`               | **Yes**   | OpenAI API key for prompt optimization (or API key for other compatible models).                                                                                                                            | `sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxx`                            |
| `OPENAI_API_BASE`              | **Yes**   | Base URL for the OpenAI API (or other compatible models) used for prompt optimization. **Please set this strictly to the API's base URL (e.g., `https://api.openai.com/v1`).**                               | `https://api.openai.com/v1`                                  |
| `OPENAI_MODEL`                 | **One of two** | Model name for **non-reasoning mode** prompt optimization. If this is configured, `OPENAI_MODEL_REASONING` should not be.                                                                                   | `gpt-3.5-turbo`                                              |
| `OPENAI_MODEL_REASONING`       | **One of two** | Model name for **reasoning mode** prompt optimization. If this is configured, `OPENAI_MODEL` should not be.                                                                                               | `gpt-4-turbo`                                                |
| `FLUX_GEN_MODEL`               | **Optional** | Comma-separated list of **single SILICONFLOW type** image generation model IDs (returns image links, requires proxying and Markdown encapsulation). These models will be exposed via the `/v1/models` interface. | `flux-pro,flux-schnell`                                      |
| `FLUX_GEN_API_BASE`            | **Optional** | Base URL for the **single SILICONFLOW type** image generation API. Required if `FLUX_GEN_MODEL` is configured.                                                                                             | `https://api.flux.example.com/v1/images/generate`             |
| `FLUX_GEN_API_KEY`             | **Optional** | Comma-separated list of one or more **single SILICONFLOW type** image generation API keys. If multiple are provided, the Worker will try the next one upon request failure. Required if `FLUX_GEN_MODEL` is configured. | `flux_key1,flux_key2`                                        |
| `IMAGE_GEN_API_BASE_n`         | **Optional** | Base URL for the **`n`-th group of direct image type** API vendors. `n` is a consecutive positive integer starting from 1 (e.g., `_1`, `_2`, ...). Required if the corresponding `IMAGE_GEN_MODEL_n` is configured. | `https://api.direct-image-provider1.com/v1/generate`        |
| `IMAGE_GEN_MODEL_n`            | **Optional** | Comma-separated list of model IDs for the **`n`-th group of direct image type** API vendors. The meaning of `n` is the same as above. These models will be exposed via the `/v1/models` interface.        | `sd-xl-provider1,dall-e-3-provider1`                         |
| `IMAGE_GEN_API_KEY_n`          | **Optional** | Comma-separated list of one or more keys for the **`n`-th group of direct image type** API vendors. The meaning of `n` is the same as above. If multiple are provided, the Worker will try the next one upon request failure. Required if the corresponding `IMAGE_GEN_MODEL_n` is configured. | `direct_key_provider1_a,direct_key_provider1_b`              |

*   At least `FLUX_GEN_MODEL` (and its corresponding `_API_BASE` and `_API_KEY`) **OR** at least one set of `IMAGE_GEN_MODEL_n` (and its corresponding `_API_BASE_n` and `_API_KEY_n`) must be configured.
*   **⚠️ Important Note: Model Name Uniqueness**
    *   **All model names** defined in `FLUX_GEN_MODEL` and all `IMAGE_GEN_MODEL_n` **must be globally unique**.
    *   For example, if you define `my-model` in `FLUX_GEN_MODEL`, you cannot define `my-model` again in any `IMAGE_GEN_MODEL_n`. Similarly, model names in `IMAGE_GEN_MODEL_1` cannot be duplicated in `IMAGE_GEN_MODEL_2`.
    *   If model name conflicts are detected, the Worker will return an HTTP 500 error at the relevant API endpoints (e.g., `/v1/models` or when attempting to generate with a conflicting model), providing detailed conflict information. Please check your configuration carefully to avoid this.
*   For each group of direct image API vendors (identified by the `_n` suffix), its corresponding `IMAGE_GEN_API_BASE_n`, `IMAGE_GEN_MODEL_n`, and `IMAGE_GEN_API_KEY_n` environment variables must all be fully configured.

## 🌊 Workflow Overview

When a user sends a request to the `/v1/chat/completions` endpoint, the Worker's processing flow is as follows:

1.  **➡️ Receive Request**: The Worker receives the user's POST request, containing the original idea for image generation and the specified model.
2.  **🛡️ Authentication Check**: Verifies if the `Authorization` bearer token in the request header matches the configured `AUTHORIZED_API_KEY`.
3.  **🔍 Parse Input**: Extracts the raw prompt from the user's message. If the prompt includes an aspect ratio (e.g., "a cat 16:9"), it is extracted and converted to standard image dimensions.
4.  **🤖 Prompt Optimization**:
    *   Selects the appropriate prompt optimization model based on environment variables (`OPENAI_MODEL` or `OPENAI_MODEL_REASONING`).
    *   Calls the configured OpenAI (or compatible) API (`OPENAI_API_BASE`, `OPENAI_API_KEY`), sending the user's raw prompt to the large language model for optimization, generating a more professional English prompt suitable for image generation.
5.  **🎨 Image Generation**:
    *   The Worker, based on the `model` name specified in the request, determines whether to call the **SILICONFLOW Type API** (configured via `FLUX_GEN_...`) or a specific **Direct Image Type API Vendor** (configured via `IMAGE_GEN_..._n`).
    *   **If the model belongs to those defined in `FLUX_GEN_MODEL`**: Uses the optimized prompt and parsed image dimensions to send a request to the configured `FLUX_GEN_API_BASE`. The Worker will use the keys from `FLUX_GEN_API_KEY` (supports round-robin).
    *   **If the model belongs to those defined in a certain `IMAGE_GEN_MODEL_n`**: The Worker finds the corresponding `_n` group configuration, uses the optimized prompt and parsed image dimensions to send a request to the configured `IMAGE_GEN_API_BASE_n`. The Worker will use the keys from the corresponding `IMAGE_GEN_API_KEY_n` (supports round-robin).
    *   If the configured API key contains multiple keys (comma-separated), it will automatically try the next key upon request failure.
6.  **🔗 Image Processing and Proxying (for SILICONFLOW Type API)**:
    *   For original image URLs returned by the **SILICONFLOW Type API**, the Worker encodes them and constructs a proxy URL through its own `/image-proxy` endpoint. This is done to:
        *   Ensure link persistence, especially if the original link is temporary.
        *   Hide the original image source.
        *   Resolve potential CORS issues.
        *   Provide an image link that can be directly rendered in Markdown.
    *   For **Direct Image Type APIs**, the Worker directly processes the returned image data or links in the JSON.
7.  **📄 Format Response**:
    *   For **SILICONFLOW Type API**: Combines the proxied image link and the optimized prompt into Markdown format.
    *   For **Direct Image Type API**: Constructs the response based on the image data or JSON returned by the API.
    *   All responses are structured as JSON conforming to the OpenAI Chat Completions API format and returned to the user.
8.  **✅ Complete**: The user receives a response containing image information and the prompt.

This flow ensures a smooth experience from simple user input to a final high-quality, easy-to-use image output.

## 💡 Prompt Engineering Details

The Worker has two built-in prompt optimization modes, selected via the environment variables `OPENAI_MODEL` (non-reasoning) or `OPENAI_MODEL_REASONING` (reasoning):

*   **Non-Reasoning Mode (`systemPromptForNonReasoning`)**:
    *   Focuses on quickly and directly converting user input into structured, comma-separated English prompts.
    *   Output requirements: Single paragraph, strictly comma-separated, maximum 50 words (30-40 recommended), pure English, returns only the prompt itself.
*   **Reasoning Mode (`systemPromptForReasoning`)**:
    *   The model first performs detailed thinking and planning within `<think>...</think>` tags, including deconstructing user intent, selecting artistic styles, scene elements, etc.
    *   Then, it outputs the final, compliant image prompt outside the `<think>` tags.
    *   This mode is more transparent and allows for more complex logical deduction but may consume more tokens.

*   Both modes maintain detailed logs, viewable in Cloudflare logs.

*   Both modes aim to generate vivid prompts containing the core subject, action, artistic style, scene elements, and optional lighting/mood.

## ⚠️ Important Notes

*   **Disable Streaming Output**: Please disable streaming output to ensure images display correctly.
*   **API Key Security**: Keep your `AUTHORIZED_API_KEY`, `OPENAI_API_KEY`, `FLUX_GEN_API_KEY`, and all `IMAGE_GEN_API_KEY_n` secure. It is strongly recommended to use Cloudflare's encrypted environment variables (Secrets).
*   **Model Name Uniqueness**: To reiterate, all model names configured in `FLUX_GEN_MODEL` and the various `IMAGE_GEN_MODEL_n` must be globally unique, otherwise it will lead to errors. Refer to the environment variables section for detailed instructions.
*   **Error Handling**: The Worker returns detailed JSON error messages, including error type and code, for easier debugging.
*   **Service Dependencies**: The normal operation of this Worker depends on the availability of your configured OpenAI (or compatible) API service, SILICONFLOW type image generation API service, and all configured direct image type (`_n`) API services.

## 🤝 Contributing

Feel free to ask questions, report bugs, or submit Pull Requests!

## 📄 License

MIT License
