<h1 align="center">
# ✨ Flux Cloudflare API - Intelligent Image Generation Assistant ✨
</h1>

<p align="center">
    <br> English | <a href="README.md">中文</a>
</p>
<p align="center">

This is an image generation API proxy service deployed on Cloudflare Workers. It aims to provide a unified, optimized interface for invoking various image generation models, while integrating powerful features like prompt engineering, image proxying, and security authentication.

## 🚀 Project Overview

This project leverages the edge computing capabilities of Cloudflare Workers to offer you an efficient, scalable image generation solution. It not only proxies your image generation requests but also optimizes simple user inputs into professional prompts better suited for image models, using integrated OpenAI models (or other API-compatible models).

## 🌟 Key Features

*   **🖼️ Image Generation Proxy**: Unified interface to call backend image generation services.
*   **🧠 Intelligent Prompt Engineering**:
    *   Supports **Non-Reasoning Mode**: Quickly transforms simple user ideas into optimized image generation prompts.
    *   Supports **Reasoning Mode**: The model first undergoes a thinking process (output within `<think>` tags), then provides the final prompt, suitable for more complex scenarios.
    *   Strict prompt format and length control to ensure optimal generation results.
*   **🔗 Image Proxy & Display Optimization**:
    *   Built-in `/image-proxy` endpoint for proxying image URLs. This is particularly useful for handling original image links that are time-sensitive (like temporary links from some cloud storage) or require specific download behaviors, ensuring direct usability of image links.
    *   Image generation results are returned in Markdown format `![Image](PROXY_IMAGE_URL)`. This user-friendly format **allows the generated image to be displayed directly and seamlessly in many third-party applications that support Markdown**, while also including the optimized prompt for reference.
*   **🔑 Security Authentication**:
    *   Worker-level API key authentication to protect your service from abuse.
    *   Supports configuration of multiple backend image generation API keys with round-robin/failover capabilities.
*   **⚙️ Highly Configurable**:
    *   Easily configure the list of supported image generation models via environment variables.
    *   Configurable models for prompt optimization (OpenAI GPT series or other compatible models).
    *   Configurable base URL and keys for the image generation API.
*   **📐 Aspect Ratio Support**: Users can specify aspect ratios in their prompts (e.g., by adding `16:9` or `1:1` at the end of the prompt). The Worker will automatically convert these to corresponding image dimensions for generation. Supported aspect ratios and their resolutions are as follows:

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
    *   `/v1/chat/completions`: Core image generation interface (OpenAI Completions API compatible format).
    *   `/v1/models`: Lists currently configured available image generation models.
    *   `/health` or `/v1/health`: Health check endpoint.

## 🛠️ Deployment & Configuration

### Deployment Steps

1.  Open **Cloudflare**, log in, create and deploy a Worker.
2.  Set up environment variables.
3.  Delete all existing code in the worker, then copy and paste the code from [`index-eng.js`](/index-eng.js).
4.  Click "Deploy". You should see a simple welcome page in the test/preview pane.

### Environment Variables (Secrets)

The following environment variables are necessary for this project to run. Please ensure they are configured correctly. It is **strongly** recommended to configure sensitive information (like API keys) as encrypted environment variables (Secrets) in Cloudflare Workers.

| Environment Variable (Secret Name) | Required? | Description                                                                                                                               | Example Value                                     |
| :--------------------------------- | :-------- | :---------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------- |
| `AUTHORIZED_API_KEY`               | **Yes**   | Global API key to access this Worker service. Client requests must include `Bearer YOUR_KEY` in the `Authorization` header.                  | `WB@eYdQEp5G4Zg3g04nQMEceicdPB#`                 |
| `IMAGE_GEN_MODEL`                  | **Yes**   | Comma-separated list of image generation model IDs. These models will be exposed via the `/v1/models` endpoint and accepted as the `model` parameter in `/v1/chat/completions`. | `flux-pro,flux-schnell,stable-diffusion-xl`     |
| `OPENAI_API_KEY`                   | **Yes**   | OpenAI API key (or API key for other compatible models) used for prompt optimization.                                                          | `sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxx`               |
| `OPENAI_API_BASE`                  | **Yes**   | Base URL for the OpenAI API (or other compatible models) used for prompt optimization. **Please set this strictly to the API's base URL (e.g., `https://api.openai.com/v1`).** | `https://api.openai.com/v1`                     |
| `OPENAI_MODEL`                     | **Choose one** | Model name for **Non-Reasoning Mode** prompt optimization. If this is configured, `OPENAI_MODEL_REASONING` should not be.                   | `gpt-3.5-turbo`                                 |
| `OPENAI_MODEL_REASONING`           | **Choose one** | Model name for **Reasoning Mode** prompt optimization. If this is configured, `OPENAI_MODEL` should not be.                               | `gpt-4-turbo`                                   |
| `IMAGE_GEN_API_BASE`               | **Yes**   | Base URL of the backend API that actually performs image generation.                                                                       | `https://api.example.com/v1/images/generations` |
| `IMAGE_GEN_API_KEY`                | **Yes**   | Comma-separated list of one or more backend image generation API keys. If multiple are provided, the Worker will try the next one upon request failure. | `key1,key2,key3`                                |


## 🌊 Workflow Overview

When a user sends a request to the `/v1/chat/completions` endpoint, the Worker's processing flow is as follows:

1.  **➡️ Receive Request**: The Worker receives the user's POST request, containing the original idea for image generation and the specified model.
2.  **🛡️ Authentication Check**: Verifies if the `Authorization` bearer token in the request header matches the configured `AUTHORIZED_API_KEY`.
3.  **🔍 Parse Input**: Extracts the original prompt from the user's message. If the prompt includes an aspect ratio (e.g., "a cat 16:9"), it is extracted and converted to standard image dimensions.
4.  **🤖 Prompt Optimization**:
    *   Selects the appropriate prompt optimization model based on environment variables (`OPENAI_MODEL` or `OPENAI_MODEL_REASONING`).
    *   Calls the configured OpenAI (or compatible) API (`OPENAI_API_BASE`, `OPENAI_API_KEY`), sending the user's original prompt to the large language model for optimization, generating a more professional English prompt suitable for image generation.
5.  **🎨 Image Generation**:
    *   Uses the optimized prompt and parsed image dimensions to send a request to the configured backend image generation service (`IMAGE_GEN_API_BASE`).
    *   The Worker uses the keys from `IMAGE_GEN_API_KEY`. If multiple keys are configured, it will try the next one upon failure.
6.  **🔗 Image Proxying**:
    *   After obtaining the original image URL, the Worker encodes it and constructs a proxy URL through its own `/image-proxy` endpoint. This is done to:
        *   Ensure link persistence, especially if the original link is temporary (like pre-signed URLs from some cloud storage).
        *   Hide the original image source.
        *   Resolve potential CORS issues.
        *   Provide an image link that can be directly rendered in Markdown.
7.  **📄 Format Response**:
    *   Combines the proxied image link and the optimized prompt into Markdown format.
    *   Constructs a JSON response compliant with the OpenAI Chat Completions API format and returns it to the user.
8.  **✅ Completion**: The user receives a response containing a directly displayable image link and the prompt.

This flow ensures a smooth experience from simple user input to a final, high-quality, easy-to-use image output.

## 💡 Prompt Engineering Details

The Worker has two built-in prompt optimization modes, selected via environment variables `OPENAI_MODEL` (Non-Reasoning) or `OPENAI_MODEL_REASONING` (Reasoning):

*   **Non-Reasoning Mode (`systemPromptForNonReasoning`)**:
    *   Focuses on quickly and directly converting user input into structured, comma-separated English prompts.
    *   Output requirements: Single paragraph, strictly comma-separated, maximum 50 words (30-40 recommended), pure English, returns only the prompt itself.
*   **Reasoning Mode (`systemPromptForReasoning`)**:
    *   The model first conducts detailed thinking and planning within `<think>...</think>` tags, including deconstructing user intent, selecting artistic styles, scene elements, etc.
    *   Then, it outputs the final, compliant image prompt outside the `<think>` tags.
    *   This mode is more transparent, allowing for more complex logical deduction, but may consume more tokens.

*   Both modes keep detailed logs, which can be viewed in Cloudflare logs.
*   Both modes aim to generate vivid prompts containing core subjects, actions, artistic styles, scene elements, and optional lighting/moods.

## ⚠️ Important Notes

*   **API Key Security**: Keep your `AUTHORIZED_API_KEY`, `OPENAI_API_KEY`, and `IMAGE_GEN_API_KEY` secure. It is strongly recommended to use Cloudflare's encrypted environment variables (Secrets).
*   **Error Handling**: The Worker returns detailed JSON error messages, including error type and code, for easy debugging.
*   **Service Dependencies**: The proper functioning of this Worker depends on the availability of your configured OpenAI (or compatible) API service and the image generation API service.

## 🤝 Contributing

Feel free to ask questions, report bugs, or submit Pull Requests!

## 📄 License

MIT License
