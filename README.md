<h1 align="center">
# ✨ IMAGEGEN Cloudflare API - 智能图像生成助手 ✨
</h1>

<p align="center">
    <br> <a href="README-EN.md">English</a> | 中文
</p>
<p align="center">

这是一个部署在 Cloudflare Workers 上的图像生成 API 代理服务。它旨在提供一个统一的、经过优化的接口，用于调用各种图像生成模型，同时集成了强大的提示词工程、图像代理和安全认证等功能。

## 🚀 项目概览

本项目通过 Cloudflare Workers 的边缘计算能力，为您提供了一个高效、可扩展的图像生成解决方案。它不仅能代理您的图像生成请求，还能通过集成的 OpenAI 模型（或其他兼容 API 的模型）对用户输入的简单想法进行优化，生成更适合图像模型的专业提示词。

## 😊 效果图

<img style="max-width: 300px;" alt="image" src="/doc/pics/1.jpg">
<img style="max-width: 300px;" alt="image" src="/doc/pics/2.jpg">
<img style="max-width: 300px;" alt="image" src="/doc/pics/3.jpg">
<img style="max-width: 300px;" alt="image" src="/doc/pics/4.jpg">

## 🌟 主要功能

*   **🖼️ 多供应商图像生成代理**: 统一接口调用后端图像生成服务。Worker 现在能够智能区分并处理两种主要类型的图像生成 API 配置：
    *   **SILICONFLOW 类型 API (单一供应商)**：通过 `FLUX_GEN_...` 系列环境变量配置，处理那些返回图片链接、需要代理并通过 Markdown 格式封装的 API。
    *   **直接图像类型 API (支持多个供应商)**：通过 `IMAGE_GEN_..._n` 系列环境变量配置，允许接入多个直接返回图像数据或包含图像链接的 JSON 的 API 供应商。
*   **🧠 智能提示词工程**:
    *   支持**非推理模式 (Non-Reasoning Mode)**：快速将用户简单想法转换为优化的图像生成提示词。
    *   支持**推理模式 (Reasoning Mode)**：模型会先进行思考过程（输出在 `<think>` 标签内），再给出最终提示词，适合更复杂的场景。
    *   严格的提示词格式和长度控制，确保最佳生成效果。
*   **🔗 图像代理与展示优化 (主要针对 SILICONFLOW 类型 API)**:
    *   内置 `/image-proxy` 端点，可用于代理图像 URL。这对于处理那些具有时效性（如某些云存储的临时链接）或需要特定下载行为的原始图像链接特别有用，确保图像链接的直接可用性。
    *   对于 SILICONFLOW 类型的 API，图像生成结果以 Markdown 格式 `![Image](PROXY_IMAGE_URL)` 返回，这种格式非常友好，**能够让生成的图片在许多支持 Markdown 的第三方应用中直接、无缝地展示出来**，同时也包含了优化后的提示词供参考。直接图像类型 API 的响应将根据其原始输出格式进行调整。
*   **🔑 安全认证**:
    *   Worker 级别 API 密钥认证，保护您的服务不被滥用。
    *   支持为 `FLUX_GEN_API_KEY` 和每一个 `IMAGE_GEN_API_KEY_n` 配置多个后端图像生成 API 密钥（以逗号分隔），并进行轮询尝试。
*   **⚙️ 高度可配置**:
    *   通过环境变量 `FLUX_GEN_MODEL` (用于 SILICONFLOW 类型) 和 `IMAGE_GEN_MODEL_n` (用于多个直接图像类型供应商) 轻松配置所支持的图像生成模型列表。
    *   可配置提示词优化所使用的模型 (OpenAI GPT 系列或其他兼容模型)。
    *   可分别配置 SILICONFLOW 类型 API 的基础 URL 和密钥，以及多个直接图像类型 API 供应商的基础 URL 和密钥。
    *   **重要**: 所有配置的模型名称 (来自 `FLUX_GEN_MODEL` 和所有 `IMAGE_GEN_MODEL_n`) 必须全局唯一，否则 Worker 会在相关 API 端点报错。
*   **📐 支持图像宽高比**（⚠️只有图形生成API支持时生效）: 用户可以在提示中指定宽高比 (例如，在提示词末尾添加 `16:9` 或 `1:1`)，Worker 会自动将其转换为相应的图像尺寸进行生成。目前支持的宽高比及其对应的分辨率如下：

    | 用户输入宽高比 | 对应图像分辨率 |
    | :------------- | :------------- |
    | `1:1`          | `1024x1024`    |
    | `1:2`          | `512x1024`     |
    | `3:2`          | `768x512`      |
    | `3:4`          | `768x1024`     |
    | `16:9`         | `1024x576`     |
    | `9:16`         | `576x1024`     |
    *如果用户未指定或指定了不支持的宽高比，将默认使用 `1024x1024` (1:1)。*

*   **🌐 核心 API 端点**:
    *   `/v1/chat/completions`：核心图像生成接口 (兼容 OpenAI Completions API 格式)。
    *   `/v1/models`：列出当前配置的所有无冲突的可用图像生成模型 (合并自 `FLUX_GEN_MODEL` 和所有 `IMAGE_GEN_MODEL_n`)。如果检测到模型名称冲突，此端点将返回错误。
    *   `/health` 或 `/v1/health`：健康检查端点。

## 🛠️ 部署与配置

### 部署步骤

1.  打开 **Cloudflare**，登录，创建并部署Worker
2.  设置环境变量
3.  删除原worker的所有代码，复制粘贴[`index.js`](/index.js)的代码
4.  点击“部署”，你将在测试页面中见到一个简单的欢迎页面。

### 环境变量 (Secrets)

以下是本项目运行所必需的环境变量，请务必正确配置。**强烈**建议将敏感信息（如 API 密钥）配置为 Cloudflare Worker 的加密环境变量 (Secrets)。

| 环境变量 (Secret Name)         | 是否必需 | 描述                                                                                                                                                                                             | 示例值                                                |
| :----------------------------- | :------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------- |
| `AUTHORIZED_API_KEY`           | **是**   | 访问此 Worker 服务的全局 API 密钥。客户端请求时需在 `Authorization` header 中携带 `Bearer YOUR_KEY`。                                                                                                 | `WB@eYdQEp5G4Zg3g04nQMEceicdPB#`                       |
| `OPENAI_API_KEY`               | **是**   | 用于提示词优化的 OpenAI API 密钥 (或其他兼容模型的 API 密钥)。支持配置一个或多个逗号分隔的 API 密钥，Worker 会在调用失败时轮询尝试下一个密钥。                                                                 | `sk-key1,sk-key2,sk-key3`                     |
| `OPENAI_API_BASE`              | **是**   | 用于提示词优化的 OpenAI API (或其他兼容模型) 的基础 URL。**请严格设置为 API 的基础 URL (例如: `https://api.openai.com/v1`)。**                                                                        | `https://api.openai.com/v1`                           |
| `OPENAI_MODEL`                 | **二选一** | 用于**非推理模式**提示词优化的模型名称。如果配置此项，则 `OPENAI_MODEL_REASONING` 不应配置。                                                                                                           | `gpt-3.5-turbo`                                       |
| `OPENAI_MODEL_REASONING`       | **二选一** | 用于**推理模式**提示词优化的模型名称。如果配置此项，则 `OPENAI_MODEL` 不应配置。                                                                                                                     | `gpt-4-turbo`                                         |
| `FLUX_GEN_MODEL`               | **可选** | 逗号分隔的 **单一 SILICONFLOW 类型**图像生成模型 ID 列表 (返回图片链接，需代理和 Markdown 封装)。这些模型将通过 `/v1/models` 接口展示。                                                                  | `flux-pro,flux-schnell`                               |
| `FLUX_GEN_API_BASE`            | **可选** | **单一 SILICONFLOW 类型**图像生成 API 的基础 URL。如果配置了 `FLUX_GEN_MODEL`，则此项为必需。                                                                                                       | `https://api.flux.example.com/v1/images/generate`      |
| `FLUX_GEN_API_KEY`             | **可选** | 逗号分隔的一个或多个 **单一 SILICONFLOW 类型**图像生成 API 密钥。如果提供多个，Worker 会在请求失败时尝试下一个。如果配置了 `FLUX_GEN_MODEL`，则此项为必需。                                                | `flux_key1,flux_key2`                                 |
| `IMAGE_GEN_API_BASE_n`         | **可选** | **第 `n` 组直接图像类型** API 供应商的基础 URL。`n` 是从 1 开始的连续正整数 (例如 `_1`, `_2`, ...)。如果配置了对应的 `IMAGE_GEN_MODEL_n`，则此项为必需。                                                | `https://api.direct-image-provider1.com/v1/generate` |
| `IMAGE_GEN_MODEL_n`            | **可选** | 逗号分隔的 **第 `n` 组直接图像类型** API 供应商的模型 ID 列表。`n` 的含义同上。这些模型将通过 `/v1/models` 接口展示。                                                                                   | `sd-xl-provider1,dall-e-3-provider1`                  |
| `IMAGE_GEN_API_KEY_n`          | **可选** | 逗号分隔的一个或多个 **第 `n` 组直接图像类型** API 供应商的密钥。`n` 的含义同上。如果提供多个，Worker 会在请求失败时尝试下一个。如果配置了对应的 `IMAGE_GEN_MODEL_n`，则此项为必需。                       | `direct_key_provider1_a,direct_key_provider1_b`       |

*   至少需要配置 `FLUX_GEN_MODEL` (及其对应的 `_API_BASE` 和 `_API_KEY`) **或** 至少一组 `IMAGE_GEN_MODEL_n` (及其对应的 `_API_BASE_n` 和 `_API_KEY_n`)。
*   **⚠️ 重要提示：模型名称唯一性**
    *   您在 `FLUX_GEN_MODEL` 和所有 `IMAGE_GEN_MODEL_n` 中定义的**所有模型名称必须是全局唯一的**。
    *   例如，如果您在 `FLUX_GEN_MODEL` 中定义了 `my-model`，则不能在任何 `IMAGE_GEN_MODEL_n` 中再次定义 `my-model`。同样，`IMAGE_GEN_MODEL_1` 中的模型名也不能与 `IMAGE_GEN_MODEL_2` 中的模型名重复。
    *   如果检测到模型名称冲突，Worker 将在相关 API 端点（如 `/v1/models` 或在尝试使用冲突模型进行生成时）返回 HTTP 500 错误，并提供详细的冲突信息。请仔细检查您的配置以避免这种情况。
*   对于每一组直接图像 API 供应商 (由后缀 `_n` 标识)，其对应的 `IMAGE_GEN_API_BASE_n`、`IMAGE_GEN_MODEL_n` 和 `IMAGE_GEN_API_KEY_n` 三个环境变量都必须完整配置。

## 🌊 工作流程概览

当用户向 `/v1/chat/completions` 端点发送请求时，Worker 的处理流程如下：

1.  **➡️ 接收请求**: Worker 接收到用户的 POST 请求，其中包含图像生成的原始想法和指定的模型。
2.  **🛡️ 认证检查**: 验证请求头中的 `Authorization` bearer token 是否与配置的 `AUTHORIZED_API_KEY` 匹配。
3.  **🔍 解析输入**: 从用户消息中提取原始提示词。如果提示词中包含宽高比 (如 "a cat 16:9")，则提取并转换为标准图像尺寸。
4.  **🤖 提示词优化**:
    *   根据环境变量 (`OPENAI_MODEL` 或 `OPENAI_MODEL_REASONING`) 选择相应的提示词优化模型。
    *   调用配置的 OpenAI (或兼容) API (`OPENAI_API_BASE`, `OPENAI_API_KEY`)，将用户原始提示词发送给大语言模型进行优化，生成更专业、更适合图像生成的英文提示词。
5.  **🎨 图像生成**:
    *   Worker 根据请求中指定的 `model` 名称，判断是调用 **SILICONFLOW 类型 API** (通过 `FLUX_GEN_...` 配置) 还是特定的 **直接图像类型 API 供应商** (通过 `IMAGE_GEN_..._n` 配置)。
    *   **如果模型属于 `FLUX_GEN_MODEL` 中定义的模型**：使用优化后的提示词和解析出的图像尺寸，向配置的 `FLUX_GEN_API_BASE` 发起请求。Worker 会使用 `FLUX_GEN_API_KEY` 中的密钥（支持轮询）。
    *   **如果模型属于某个 `IMAGE_GEN_MODEL_n` 中定义的模型**：Worker 会找到对应的 `_n` 组配置，使用优化后的提示词和解析出的图像尺寸，向配置的 `IMAGE_GEN_API_BASE_n` 发起请求。Worker 会使用对应的 `IMAGE_GEN_API_KEY_n` 中的密钥（支持轮询）。
    *   如果配置的 API 密钥包含多个（以逗号分隔），在请求失败时会自动尝试下一个密钥。
6.  **🔗 图像处理与代理 (针对 SILICONFLOW 类型 API)**:
    *   对于 **SILICONFLOW 类型 API** 返回的原始图像 URL，Worker 会将其编码，并构造成一个通过自身 `/image-proxy` 端点的代理 URL。这样做是为了：
        *   确保链接的持久性，特别是当原始链接是临时的。
        *   隐藏原始图像来源。
        *   解决潜在的 CORS 问题。
        *   提供一个可以直接在 Markdown 中渲染的图像链接。
    *   对于 **直接图像类型 API**，Worker 会直接处理返回的图像数据或 JSON 中的链接。
7.  **📄 格式化响应**:
    *   对于 **SILICONFLOW 类型 API**：将代理后的图像链接和优化后的提示词组合成 Markdown 格式。
    *   对于 **直接图像类型 API**：根据 API 返回的图像数据或 JSON 构造响应。
    *   所有响应均构建为符合 OpenAI Chat Completions API 格式的 JSON，并返回给用户。
8.  **✅ 完成**: 用户收到包含图像信息和提示词的响应。

这个流程确保了从简单的用户输入到最终高质量、易于使用的图像输出的顺畅体验。

## 💡 提示词工程细节

Worker 内置了两种提示词优化模式，通过环境变量 `OPENAI_MODEL` (非推理) 或 `OPENAI_MODEL_REASONING` (推理) 来选择：

*   **非推理模式 (`systemPromptForNonReasoning`)**:
    *   专注于快速、直接地将用户输入转化为结构化的、逗号分隔的英文提示词。
    *   输出要求：单一段落，严格逗号分隔，最多50词 (推荐30-40词)，纯英文，仅返回提示词本身。
*   **推理模式 (`systemPromptForReasoning`)**:
    *   模型首先会在 `<think>...</think>` 标签内进行详细的思考和规划，包括解构用户意图、选择艺术风格、场景元素等。Worker 会优先尝试解析此标签；如果未成功，则会检查某些模型可能通过响应体中独立的 `reasoning_content` 字段提供的思考过程，同时从 `content` 字段获取最终提示词。
    *   然后，在 `<think>` 标签外部输出最终的、符合要求的图像提示词。
    *   这种模式更透明，允许更复杂的逻辑推演，但可能会消耗更多 token。

*  两种模式均保留详细日志，可在Cloudflare的日志中查看详情。

*  两种模式都旨在生成包含核心主体、动作、艺术风格、场景元素以及可选的光照/情绪的生动提示词。

## ⚠️ 注意事项

*   **关闭流式输出**: 请关闭流式输出以保证图片正确显示
*   **API 密钥安全**: 妥善保管您的 `AUTHORIZED_API_KEY`、`OPENAI_API_KEY`、`FLUX_GEN_API_KEY` 以及所有 `IMAGE_GEN_API_KEY_n`。强烈建议使用 Cloudflare 的加密环境变量 (Secrets)。
*   **模型名称唯一性**: 再次强调，所有在 `FLUX_GEN_MODEL` 和各个 `IMAGE_GEN_MODEL_n` 中配置的模型名称必须全局唯一，否则会导致错误。请参考环境变量部分的详细说明。
*   **错误处理**: Worker 会返回详细的 JSON 错误信息，包括错误类型和代码，方便调试。
*   **依赖服务**: 本 Worker 的正常运行依赖于您配置的 OpenAI (或兼容) API 服务、SILICONFLOW 类型图像生成 API 服务以及所有已配置的直接图像类型 (`_n`) API 服务的可用性。

## 🤝 贡献

欢迎提出问题、报告 Bug 或提交 Pull Request！

## 📄 许可证

MIT License
