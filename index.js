// Cloudflare Worker for Image Generation API with Image Proxy
// and ensuring Markdown content is just the image link

const env = name => globalThis[name];

// --- Global Configuration Store ---
let workerConfig = null; // Will be populated by initializeConfig
const MAX_IMAGE_GEN_PROVIDERS = 10; // Maximum number of IMAGE_GEN_API_BASE_n to check

// --- System Prompts ---
// For OPENAI_MODEL (non-reasoning)
const systemPromptForNonReasoning = `You are a highly skilled TEXT-TO-IMAGE PROMPT GENERATOR.
Your primary goal is to transform a user's simple idea into a concise, vivid, and effective English prompt for image generation.

## CRITICAL OUTPUT REQUIREMENTS:
1.  **Format:** SINGLE PARAGRAPH, strictly comma-separated.
2.  **Length:** MAXIMUM 50 words. Aim for 30-40 words for optimal results.
3.  **Language:** English ONLY.
4.  **Content:** Return ONLY the generated prompt. No extra text, no explanations, no apologies.

## PROMPT CONSTRUCTION GUIDELINES:
When crafting the prompt, you MUST incorporate the following elements, ensuring the description is specific and detailed yet concise:

*   **1. Core Idea & Subject with Action:**
    *   Clearly define the main subject (what is it?).
    *   Describe its primary action or state (what is it doing or like?). Use active verbs.
    *   Example: "a majestic lion roaring", "a serene forest path winding"

*   **2. Dominant Artistic Style / Medium:**
    *   Specify a clear visual style (e.g., photorealistic, anime, oil painting, 3D render, cinematic look).
    *   Example: "photorealistic photograph style", "vibrant oil painting", "Ghibli anime style"

*   **3. Key Scene Elements / Setting:**
    *   Briefly describe essential background or environmental details that give context.
    *   Example: "on a rocky outcrop at sunset", "in a neon-lit cyberpunk city street", "surrounded by blooming cherry blossoms"

*   **4. (Optional but Recommended if space allows) Lighting or Mood:**
    *   If space permits and it enhances the core idea, add a key lighting descriptor (e.g., golden hour, moody, dramatic lighting) OR an overall mood (e.g., peaceful, mysterious, energetic).
    *   Example: "dramatic rim lighting", "peaceful morning atmosphere", "vibrant and energetic mood"

## KEY PRINCIPLES TO FOLLOW:
*   Be Specific & Vivid: Use descriptive words. Avoid vague terms like "nice" or "beautiful."
*   Natural Flow (within comma-separation): While comma-separated, the elements should logically connect.
*   Focus on User's Intent: Expand on the user's core idea, don't replace it.

## EXAMPLE 1:
User Input: "A cat on a roof"
Output: photorealistic photograph style, sleek black cat, gracefully perched on a terracotta tiled roof, under a starry night sky, soft moonlight illuminating its fur, mysterious ambiance

## EXAMPLE 2:
User Input: "futuristic car"
Output: cinematic look, a gleaming chrome futuristic sports car, speeding down a neon-drenched highway in a sprawling megacity, motion blur effect, energetic and high-tech feel

## EXAMPLE 3:
User Input: "sad clown painting"
Output: expressive oil painting, a melancholic clown with a single tear, painted in rich, textured brushstrokes, spotlight from above, somber and reflective mood

Process the user's input based *only* on the instructions above.
User Input: {sentence}
Output:`;

// For OPENAI_MODEL_REASONING
const systemPromptForReasoning = `You are an expert TEXT-TO-IMAGE PROMPT ENGINEER. Your task is to meticulously transform a user's simple idea into a highly effective, concise, and vivid English prompt, specifically structured for optimal image generation. You will first outline your thought process within <think> tags, and then provide the final, clean image prompt.

## YOUR PROCESS & FULL RESPONSE STRUCTURE:
1.  **Think Step (Internal Monologue & Planning):**
    *   This is your internal "scratchpad" or "design brief".
    *   Enclose your entire thinking process within \`<think>\`</think>\` tags.
    *   **Inside \`<think>\`:**
        *   **a. Deconstruct User Input & Establish Core Intent:**
            *   Briefly state the core subject, any implied actions, or mood from the user's {sentence}.
            *   **Crucially, all subsequent elaborations MUST strictly serve and enhance this core user intent without altering the fundamental subject or its key explicitly stated attributes.** This is your guiding principle.
        *   **b. Systematically Apply & Select Core Elements (Flux-inspired V2 Framework):**
            *   **While considering the elements below, constantly keep the target prompt length (30-40 words, max 50) in mind. Be selective and prioritize impact over quantity. Your goal is a concise yet rich prompt.**
            *   **Artistic Style/Medium:** Choose a suitable style (e.g., photorealistic, oil painting, anime, cinematic). Note your choice.
            *   **Subject & Action (Elaborate on Core Intent):** Further detail the main subject and its action/state, staying true to the core intent. Be specific.
            *   **Scene/Setting:** Define key background or environmental details that complement the core intent.
            *   **Composition/Perspective (Optional but impactful):** Consider a viewpoint if it significantly enhances the core.
            *   **Lighting/Color (Optional but impactful):** Think about dominant lighting or a color palette that supports the mood of the core intent.
            *   **Atmosphere/Mood (Optional but impactful):** Define an overall feeling that aligns with or amplifies the core.
            *   **Texture/Details (If highly relevant and space allows):** Mention crucial textures only if they are central to the core idea and fit within length.
            *   **Text (If applicable and part of core):** If text is needed as per user input, specify content and brief style.
        *   **c. Draft, Combine & Actively Refine for Length:**
            *   As you mentally (or by listing key phrases) assemble chosen elements into a comma-separated sequence, continuously refine to meet the 30-40 word target (max 50).
            *   This involves choosing concise phrasing, combining related ideas, or omitting less critical details to ensure the prompt is focused and powerful.
        *   **d. Final Sanity Check:** Briefly confirm the planned prompt meets all output requirements (single paragraph, comma-separated, English, 30-50 words, focused on core, vivid).
    *   Your thinking process should be a practical planning step, not an overly verbose explanation to the user. It's for you to structure the best prompt.

2.  **Image Prompt Output:**
    *   Immediately AFTER the closing \`</think>\` tag, you MUST provide the generated image prompt.
    *   This prompt must be EXACTLY what you planned and checked in your think step.
    *   It MUST be a single paragraph, comma-separated, English, and 30-50 words.
    *   NO extra text, newlines, or explanations outside the \`<think>\` tags.

## EXAMPLE 1:
User Input: "A wizard in a forest"
Output:
<think>
Core Intent: Wizard in a forest. Must remain a wizard, in a forest.
Style: Fantasy art, detailed illustration.
Subject & Action (enhancing core): Ancient, wise wizard, long white beard, holding a glowing staff, casting a subtle spell. (Wizard + Forest intact)
Scene/Setting (complementing): Enchanted, mystical forest, towering ancient trees, dappled sunlight, glowing magical runes.
Composition: Medium shot.
Lighting: Ethereal light from staff & sun.
Mood: Mysterious, magical, serene.
Drafting & Refining for length (target 30-40w):
Elements: fantasy art, detailed illustration, ancient wise wizard, glowing staff, casting spell, enchanted mystical forest, dappled sunlight, mysterious, serene. (All support core: Wizard, Forest, Magical)
Length check: ~30 words. Good.
Final check: OK.
</think>fantasy art, detailed illustration, ancient wise wizard with glowing staff, casting spell in an enchanted mystical forest, dappled sunlight, mysterious and serene atmosphere

## EXAMPLE 2:
User Input: "sad robot"
Output:
<think>
Core Intent: A robot that is sad. Key: Robot, Sadness.
Style: Cinematic, melancholic photorealism.
Subject & Action (enhancing core): Small, weathered humanoid robot, hunched over, head in hands, a single digital tear. (Robot + Sadness intact)
Scene/Setting (complementing): Derelict, abandoned cityscape, overgrown ivy.
Lighting: Overcast, diffused grey light.
Mood: Melancholy, lonely.
Drafting & Refining for length (target 30-40w):
Elements: cinematic photorealism, small weathered robot, hunched over, digital tear, derelict abandoned cityscape, overcast grey light, melancholic, lonely. (All support core: Robot, Sadness, Environment enhances mood)
Length check: ~28 words. Good.
Final check: OK.
</think>cinematic photorealism, small weathered robot, hunched over with a digital tear, in a derelict abandoned cityscape, overcast grey light, melancholic and lonely mood

## EXAMPLE 3:
User Input: "logo for a coffee shop called 'The Daily Grind', vintage style"
Output:
<think>
Core Intent: Logo for "The Daily Grind" coffee shop, vintage style. Key: Logo, "The Daily Grind", Vintage.
Style: Vintage graphic design, emblem.
Subject & Action (for logo, enhancing core): Central motif: classic coffee grinder. Text: "The Daily Grind" in vintage serif font. (Logo + Name + Vintage intact)
Color: Earthy tones, muted browns, creams.
Texture: Aged paper effect.
Mood: Warm, inviting, artisanal.
Drafting & Refining for length (target 30-40w):
Elements: vintage emblem logo, "The Daily Grind", classic serif font, hand-drawn coffee grinder, earthy tones, aged paper texture, warm, artisanal. (All support core: Logo, Name, Vintage, Coffee theme)
Length check: ~29 words. Good.
Final check: OK.
</think>vintage emblem logo design, "The Daily Grind" in classic serif font, featuring a hand-drawn coffee grinder, earthy tones on a subtly aged paper texture, warm and artisanal feel

## USER INPUT FOR YOU TO PROCESS:
Input: {sentence}
Output:`;

// --- Initialization Function ---
function initializeConfig() {
  if (workerConfig) {
    console.log("配置已初始化，跳过重复加载。");
    return workerConfig;
  }

  console.log("开始初始化 Worker 配置...");
  const newConfig = {
    fluxProvider: null,
    directImageProviders: [], // Array of { name, apiBase, apiKeys, models, providerIndex }
    allModels: [], // Array of { id, type ('flux' or 'direct'), providerIndex (for direct), name, isConflicted, conflictReason }
    hasFatalConflict: false,
    fatalConflictReason: null,
  };

  // 1. Load Flux Provider Configuration
  const fluxGenModelEnv = env('FLUX_GEN_MODEL');
  const fluxGenApiBaseEnv = env('FLUX_GEN_API_BASE');
  const fluxGenApiKeyEnv = env('FLUX_GEN_API_KEY');

  if (fluxGenModelEnv && fluxGenApiBaseEnv && fluxGenApiKeyEnv) {
    const fluxModels = fluxGenModelEnv.split(',').map(name => name.trim()).filter(name => name);
    const fluxApiKeys = fluxGenApiKeyEnv.split(',').map(key => key.trim()).filter(key => key);
    if (fluxModels.length > 0 && fluxApiKeys.length > 0) {
      newConfig.fluxProvider = {
        name: "FLUX_GEN",
        apiBase: fluxGenApiBaseEnv.trim(),
        apiKeys: fluxApiKeys,
        models: fluxModels,
      };
      fluxModels.forEach(modelName => {
        newConfig.allModels.push({ id: modelName, type: 'flux', name: modelName, isConflicted: false, conflictReason: null });
      });
      console.log(`成功加载 Flux 提供商配置: ${fluxModels.length} 个模型。`);
    } else {
      console.warn("Flux 提供商配置不完整 (模型或 API 密钥为空)，已跳过。");
    }
  } else if (fluxGenModelEnv || fluxGenApiBaseEnv || fluxGenApiKeyEnv) {
    console.error("Flux 提供商配置错误: FLUX_GEN_MODEL, FLUX_GEN_API_BASE, 和 FLUX_GEN_API_KEY 必须同时提供。Flux 提供商未加载。");
  }

  // 2. Load Direct Image Provider Configurations
  for (let i = 1; i <= MAX_IMAGE_GEN_PROVIDERS; i++) {
    const apiBaseEnv = env(`IMAGE_GEN_API_BASE_${i}`);
    const modelEnv = env(`IMAGE_GEN_MODEL_${i}`);
    const apiKeyEnv = env(`IMAGE_GEN_API_KEY_${i}`);

    if (!apiBaseEnv) {
      console.log(`未找到 IMAGE_GEN_API_BASE_${i}，停止加载更多直接图像提供商。已加载 ${i - 1} 个。`);
      break; // Stop if base URL for this index is not found
    }

    if (!modelEnv || !apiKeyEnv) {
      console.error(`直接图像提供商 _${i} 配置错误: IMAGE_GEN_API_BASE_${i} (${apiBaseEnv}) 已设置，但 IMAGE_GEN_MODEL_${i} 或 IMAGE_GEN_API_KEY_${i} 未设置或为空。此提供商将被跳过。`);
      continue; // Skip this provider if model or key is missing
    }

    const models = modelEnv.split(',').map(name => name.trim()).filter(name => name);
    const apiKeys = apiKeyEnv.split(',').map(key => key.trim()).filter(key => key);

    if (models.length === 0 || apiKeys.length === 0) {
      console.error(`直接图像提供商 _${i} 配置错误: IMAGE_GEN_MODEL_${i} 或 IMAGE_GEN_API_KEY_${i} 解析后为空列表。此提供商将被跳过。 (Base: ${apiBaseEnv})`);
      continue;
    }

    const providerName = `IMAGE_GEN_${i}`;
    newConfig.directImageProviders.push({
      name: providerName,
      apiBase: apiBaseEnv.trim(),
      apiKeys: apiKeys,
      models: models,
      providerIndex: i,
    });
    models.forEach(modelName => {
      newConfig.allModels.push({ id: modelName, type: 'direct', providerIndex: i, name: modelName, isConflicted: false, conflictReason: null });
    });
    console.log(`成功加载直接图像提供商 ${providerName}: ${models.length} 个模型。`);
  }

  // 3. Model Conflict Detection
  const modelCounts = {};
  newConfig.allModels.forEach(modelEntry => {
    modelCounts[modelEntry.name] = (modelCounts[modelEntry.name] || 0) + 1;
  });

  newConfig.allModels.forEach(modelEntry => {
    if (modelCounts[modelEntry.name] > 1) {
      modelEntry.isConflicted = true;
      const conflictingSources = newConfig.allModels
        .filter(m => m.name === modelEntry.name)
        .map(m => m.type === 'flux' ? 'FLUX_GEN_MODEL' : `IMAGE_GEN_MODEL_${m.providerIndex}`)
        .join(' 和 ');
      modelEntry.conflictReason = `模型 "${modelEntry.name}" 在 ${conflictingSources} 中重复定义。`;
      if (!newConfig.hasFatalConflict) { // Only set the first detected conflict as fatal for the /models endpoint
          newConfig.hasFatalConflict = true;
          newConfig.fatalConflictReason = modelEntry.conflictReason;
      }
      console.error(`模型冲突: ${modelEntry.conflictReason}`);
    }
  });

  if (newConfig.directImageProviders.length === 0 && !newConfig.fluxProvider) {
      console.warn("警告: 未配置任何有效的图像生成提供商 (Flux 或 Direct Image)。API 可能无法正常工作。");
  }

  workerConfig = newConfig;
  console.log("Worker 配置初始化完成。");
  // console.log("完整配置详情:", JSON.stringify(workerConfig, null, 2)); // For debugging
  return workerConfig;
}

// Call initializeConfig on worker start.
// In a real Cloudflare Worker, this might be at the top level or triggered by the first request.
// For now, we'll ensure it's called before handlers use workerConfig.
// A more robust approach might involve a getter that initializes on first access.

// Worker-level API key validation
function validateWorkerApiKey(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const providedKey = authHeader.substring(7);
  const validKey = env('AUTHORIZED_API_KEY'); // Environment variable for the global API key
  if (!validKey || validKey.trim() === "") {
      console.error("Worker全局认证配置错误: AUTHORIZED_API_KEY 未设置。");
      return false;
  }
  return providedKey === validKey;
}

async function handleModels(request) {
  if (!validateWorkerApiKey(request)) {
    return new Response(JSON.stringify({ error: { message: "认证失败，无效的 API 密钥", type: "invalid_request_error", code: "invalid_api_key" } }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const config = workerConfig || initializeConfig(); // Ensure config is initialized

  if (config.hasFatalConflict) {
    console.error(`模型列表接口错误: 检测到致命配置冲突: ${config.fatalConflictReason}`);
    return new Response(JSON.stringify({
      error: {
        message: `模型配置存在冲突: ${config.fatalConflictReason} 请检查您的环境变量配置。`,
        type: "configuration_error",
        code: "model_configuration_conflict"
      }
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  // Get unique model names that are not part of a fatal conflict (though hasFatalConflict should catch global issues)
  // For /v1/models, we list all models that *could* be available if not for conflicts.
  // The conflict error above is the primary guard. If no *fatal* conflict, list all defined model names.
  // Individual model conflicts will be handled during chat completions.

  const allDefinedModelNames = new Set();
  if (config.fluxProvider) {
    config.fluxProvider.models.forEach(name => allDefinedModelNames.add(name));
  }
  config.directImageProviders.forEach(provider => {
    provider.models.forEach(name => allDefinedModelNames.add(name));
  });

  const uniqueModelNames = Array.from(allDefinedModelNames);
  let modelsData = [];

  if (uniqueModelNames.length > 0) {
    modelsData = uniqueModelNames.map(modelId => ({
      id: modelId,
      object: "model",
      created: Math.floor(Date.now() / 1000) - 8000, // Arbitrary past timestamp
      owned_by: "organization-owner", // Placeholder
      permission: [{
        id: `modelperm-${modelId.replace(/[^a-zA-Z0-9-_]/g, '_')}`, // Sanitize modelId for perm id
        object: "model_permission",
        created: Math.floor(Date.now() / 1000) - 8000,
        allow_create_engine: false,
        allow_sampling: true,
        allow_logprobs: false,
        allow_search_indices: false,
        allow_view: true,
        allow_fine_tuning: false,
        organization: "*",
        group: null,
        is_blocking: false
      }],
      root: modelId,
      parent: null
    }));
    console.log(`模型列表接口: 成功准备 ${uniqueModelNames.length} 个唯一模型定义: ${uniqueModelNames.join(', ')}`);
  } else {
    console.warn("模型列表接口: 未配置任何有效的模型 (Flux 或 Direct Image)。返回默认占位模型。");
    modelsData = [{ id: "default-model-not-configured", object: "model", created: Math.floor(Date.now() / 1000) - 8000, owned_by: "system", permission: [], root: "default-model-not-configured", parent: null }];
  }

  return new Response(JSON.stringify({ object: "list", data: modelsData }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleChatCompletions(request) {
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: { message: "方法不允许，请使用 POST 请求", type: "invalid_request_error", code:"method_not_allowed" } }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  if (!validateWorkerApiKey(request)) return new Response(JSON.stringify({ error: { message: "认证失败，无效的 API 密钥", type: "invalid_request_error", code:"invalid_api_key" } }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  let requestData;
  try { requestData = await request.json(); } catch (e) { return new Response(JSON.stringify({ error: { message: "无法解析请求体，请提供有效的 JSON", type: "invalid_request_error", code:"invalid_json" } }), { status: 400, headers: { 'Content-Type': 'application/json' } }); }
  if (!requestData.messages || !Array.isArray(requestData.messages) || requestData.messages.length === 0) return new Response(JSON.stringify({ error: { message: "请求缺少必需的 messages 字段或格式不正确", type: "invalid_request_error", code:"invalid_parameters" } }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const requestedModelUntrimmed = requestData.model;
  if (!requestedModelUntrimmed || typeof requestedModelUntrimmed !== 'string' || requestedModelUntrimmed.trim() === "") {
    console.warn(`Chat Completions: 请求体缺少 'model' 字段或为空。请求体: ${JSON.stringify(requestData)}`);
    return new Response(JSON.stringify({
      error: { message: "请求体中必须包含有效的 'model' 字段，用于指定图像生成模型。", type: "invalid_request_error", code: "missing_model_field" }
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const requestedModel = requestedModelUntrimmed.trim();

  const config = workerConfig || initializeConfig(); // Ensure config is initialized
  console.log(`Chat Completions: 用户请求使用模型 '${requestedModel}'。配置已加载。`);

  try {
    // Pass the already initialized config to handleImageGeneration
    return await handleImageGeneration(requestData, request, requestedModel, config);
  } catch (error) {
    console.error('处理 chat completions 请求时出错:', error.message, error.stack);
    // Enhanced error categorization
    if (error.type === "configuration_error" || error.message.includes("配置错误:") || error.message.includes("configuration error:") || error.message.includes("所有图像生成 API 密钥均尝试失败") || error.message.includes("Model configuration conflict")) {
        return new Response(JSON.stringify({ error: { message: error.message, type: "configuration_error", code: error.code || "env_config_error" } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    if (error.type === "invalid_request_error") {
        return new Response(JSON.stringify({ error: { message: error.message, type: "invalid_request_error", code: error.code || "invalid_parameters" } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: { message: `处理请求时出错: ${error.message}`, type: "server_error", code: "internal_error" } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

// Custom error class for better error handling
class ApiError extends Error {
  constructor(message, type = "server_error", code = "internal_error", status = 500) {
    super(message);
    this.type = type;
    this.code = code;
    this.status = status; // HTTP status, though not directly used for throwing
  }
}

// Handles image generation logic including prompt revision and calling the image API
async function handleImageGeneration(requestData, request, requestedModelName, config) { // config is now passed as a parameter
  const lastMessage = requestData.messages[requestData.messages.length - 1];
  let userPrompt = lastMessage.content;
  let imageSize = '1024x1024'; // Default image size
  const sizeMatch = userPrompt.match(/([\d]+:[\d]+)/);
  if (sizeMatch && sizeMatch[1]) {
    userPrompt = userPrompt.replace(sizeMatch[1], '').trim();
    imageSize = getImageSize(sizeMatch[1]);
    console.log(`图像尺寸从用户输入中提取: ${sizeMatch[1]}, 解析为: ${imageSize}`);
  }

  // --- Model Configuration & Selection Logic ---
  const modelEntry = config.allModels.find(m => m.name === requestedModelName);

  if (!modelEntry) {
    const allAvailableModelNames = Array.from(new Set(config.allModels.filter(m => !m.isConflicted).map(m => m.name)));
    const message = `请求的图像生成模型 '${requestedModelName}' 不受支持。可用的模型有: ${allAvailableModelNames.join(', ') || '无 (请检查配置)'}。`;
    console.warn(`Chat Completions: ${message}`);
    throw new ApiError(message, "invalid_request_error", "unsupported_image_model", 400);
  }

  if (modelEntry.isConflicted) {
    const message = `模型配置冲突: ${modelEntry.conflictReason}`;
    console.error(`Chat Completions: ${message}`);
    throw new ApiError(message, "configuration_error", "model_conflict", 500);
  }

  const revisedPrompt = await reviseSentenceToPrompt(userPrompt);
  if (!revisedPrompt || revisedPrompt.trim() === "") {
      throw new ApiError("Prompt 优化后为空，无法生成图像。", "server_error", "prompt_optimization_failed", 500);
  }
  console.log(`优化后的提示词: "${revisedPrompt}" 将用于模型 "${requestedModelName}" (类型: ${modelEntry.type})`);

  if (modelEntry.type === 'flux') {
    // --- Flux Type Processing ---
    if (!config.fluxProvider) {
        throw new ApiError("Flux 模型配置错误: FLUX_GEN 提供商未正确加载。", "configuration_error", "flux_provider_missing", 500);
    }
    console.log(`模型 "${requestedModelName}" 被识别为 Flux 类型，使用提供商: ${config.fluxProvider.name}`);
    const { apiBase, apiKeys } = config.fluxProvider;

    if (!apiBase || apiKeys.length === 0) {
      throw new ApiError("Flux 模型配置错误: FLUX_GEN_API_BASE 或 FLUX_GEN_API_KEY 未有效配置。", "configuration_error", "flux_config_incomplete", 500);
    }

    // generateImage already handles key rotation for Flux
    const originalImageUrl = await generateImage(revisedPrompt, imageSize, requestedModelName, apiBase, apiKeys.join(','));
    if (!originalImageUrl) throw new ApiError('Flux 图像生成服务未返回有效的图像 URL。', "server_error", "flux_no_image_url", 500);

    const encodedImageUrl = encodeURIComponent(originalImageUrl);
    const proxyImageUrl = `${new URL(request.url).origin}/image-proxy?url=${encodedImageUrl}`;
    const markdownImageString = `![Image](${proxyImageUrl})\n\n优化后的提示词: ${revisedPrompt}`;

    return new Response(JSON.stringify({
      id: `imggen-flux-${Date.now()}`, object: "chat.completion", created: Math.floor(Date.now() / 1000),
      model: requestedModelName,
      choices: [{ index: 0, message: { role: "assistant", content: markdownImageString }, finish_reason: "stop" }],
      usage: { prompt_tokens: userPrompt.length, completion_tokens: markdownImageString.length, total_tokens: userPrompt.length + markdownImageString.length }
    }), { headers: { 'Content-Type': 'application/json' } });

  } else if (modelEntry.type === 'direct') {
    // --- Direct Image Type Processing ---
    const provider = config.directImageProviders.find(p => p.providerIndex === modelEntry.providerIndex);
    if (!provider) {
      throw new ApiError(`直接图像模型配置内部错误: 未找到模型 "${requestedModelName}" 对应的提供商 (索引 ${modelEntry.providerIndex})。`, "configuration_error", "direct_provider_missing", 500);
    }
    console.log(`模型 "${requestedModelName}" 被识别为直接图像类型，使用提供商: ${provider.name}`);
    const { apiBase, apiKeys } = provider;

    if (!apiBase || apiKeys.length === 0) {
      throw new ApiError(`直接图像模型配置错误: 提供商 ${provider.name} 的 API Base 或 API Keys 未有效配置。`, "configuration_error", "direct_config_incomplete", 500);
    }
    
    const requestBody = {
      model: requestedModelName.trim(), // Some APIs are strict about the model name matching exactly
      messages: [ { "role": "user", "content": revisedPrompt } ],
      stream: false
    };

    let lastError = null;
    console.log(`准备为直接图像模型 "${requestedModelName}" (提供商 ${provider.name}) 尝试 ${apiKeys.length} 个 API 密钥。`);

    for (let i = 0; i < apiKeys.length; i++) {
      const currentApiKey = apiKeys[i];
      console.log(`尝试使用 API 密钥 (索引: ${i}, Key: ...${currentApiKey.slice(-4)}) 调用直接图像生成 API (${apiBase}) (模型: ${requestedModelName})`);

      try {
        const imageGenResponse = await fetch(apiBase, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${currentApiKey}`,
            'Content-Type': 'application/json',
            // 'X-Api-Key': currentApiKey, // Some APIs might use this custom header, keep if needed
          },
          body: JSON.stringify(requestBody),
        });

        if (imageGenResponse.ok) {
          console.log(`直接图像 API (${apiBase}) 使用密钥 (索引: ${i}) 成功响应 (模型: ${requestedModelName}).`);
          const upstreamContentType = imageGenResponse.headers.get('Content-Type');
          const responseHeaders = new Headers();
          if (upstreamContentType) {
            responseHeaders.set('Content-Type', upstreamContentType);
          }
          // responseHeaders.set('X-Revised-Prompt', revisedPrompt); // Optional
          return new Response(imageGenResponse.body, {
            status: imageGenResponse.status,
            headers: responseHeaders
          });
        } else {
          const errorText = await imageGenResponse.text();
          lastError = `直接图像 API (提供商 ${provider.name}) 响应错误 (密钥索引: ${i}): ${imageGenResponse.status} ${imageGenResponse.statusText || ''}. 详情: ${errorText.substring(0, 200)}`; // Limit error length
          console.error(lastError + ` (模型: ${requestedModelName}, API Base: ${apiBase})`);
        }
      } catch (fetchError) {
        lastError = `调用直接图像 API (提供商 ${provider.name}) 时发生网络或其他错误 (密钥索引: ${i}): ${fetchError.message}`;
        console.error(lastError + ` (模型: ${requestedModelName}, API Base: ${apiBase})`);
      }
    }

    const finalErrorMessage = `所有为直接图像模型 '${requestedModelName}' (提供商 ${provider.name}) 配置的 API 密钥 (${apiKeys.length}个) 均尝试失败。最后一次尝试的错误: ${lastError || '未知错误，未能成功连接或验证任何密钥。'}`;
    console.error(finalErrorMessage);
    throw new ApiError(finalErrorMessage, "configuration_error", "direct_all_keys_failed", 500);
  }
  // Should not be reached if modelEntry is found and type is valid
  throw new ApiError(`未知的模型类型 "${modelEntry.type}" 用于模型 "${requestedModelName}"。`, "server_error", "unknown_model_type", 500);
}

// Revises a user sentence into an optimized image generation prompt
async function reviseSentenceToPrompt(sentence) {
  console.log(`原始用户输入用于优化: "${sentence}"`);

  const promptApiKey = env('OPENAI_API_KEY'); // API key for the prompt optimization service
  if (!promptApiKey || promptApiKey.trim() === "") throw new Error("提示词优化配置错误: 环境变量 OPENAI_API_KEY 未设置或为空。");

  const modelForNonReasoning = env('OPENAI_MODEL'); // Model for non-reasoning prompt optimization
  const modelForReasoning = env('OPENAI_MODEL_REASONING'); // Model for reasoning-based prompt optimization
  let chosenModelName = "", chosenSystemPrompt = "", isReasoningMode = false;
  const nonReasoningSet = modelForNonReasoning && modelForNonReasoning.trim() !== "";
  const reasoningSet = modelForReasoning && modelForReasoning.trim() !== "";

  if (reasoningSet) {
    if (nonReasoningSet) throw new Error("提示词优化配置错误: OPENAI_MODEL 和 OPENAI_MODEL_REASONING 不能同时配置。请只选择一个。");
    chosenModelName = modelForReasoning.trim(); chosenSystemPrompt = systemPromptForReasoning; isReasoningMode = true;
    console.log(`使用推理模型进行提示词优化: ${chosenModelName}`);
  } else if (nonReasoningSet) {
    chosenModelName = modelForNonReasoning.trim(); chosenSystemPrompt = systemPromptForNonReasoning;
    console.log(`使用非推理模型进行提示词优化: ${chosenModelName}`);
  } else {
    throw new Error("提示词优化配置错误: OPENAI_MODEL 或 OPENAI_MODEL_REASONING 必须配置一个。");
  }

  const promptApiBase = env('OPENAI_API_BASE'); // Base URL for the prompt optimization API
  if (!promptApiBase || promptApiBase.trim() === "") {
      throw new Error("提示词优化配置错误: OPENAI_API_BASE 未设置或为空。请严格按照 README 指导设置为 API 的基础 URL (例如: https://api.openai.com/v1)。");
  }
  const finalPromptApiUrl = `${promptApiBase.trim()}/chat/completions`;

  const openaiUserMessage = `Input: ${sentence}\nOutput:`;
  console.log(`发送请求到提示词优化 API (${finalPromptApiUrl}) (模型: ${chosenModelName})`);
const requestHeaders = {
  'Authorization': `Bearer ${promptApiKey.trim()}`,
  'Content-Type': 'application/json'
};

const response = await fetch(finalPromptApiUrl, {
  method: 'POST',
  headers: requestHeaders, // 使用预先定义的 requestHeaders
  body: JSON.stringify({
    model: chosenModelName,
    messages: [{ role: 'system', content: chosenSystemPrompt }, { role: 'user', content: openaiUserMessage }]
  }),
});

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`提示词优化 API 响应状态码: ${response.status}. 端点: ${finalPromptApiUrl}, 模型: ${chosenModelName}. 响应: ${errorText}`);
    console.warn(`提示词优化 API 调用失败，将使用原始用户输入: "${sentence}"`);
    return sentence; // Fallback to original sentence on API error
  }
  let data;
  try { data = await response.json(); } catch (e) { console.warn(`解析JSON失败，将使用原始用户输入: "${sentence}"`); return sentence; }
  if (!data.choices || data.choices.length === 0 || !data.choices[0].message || !data.choices[0].message.content) { console.warn(`API响应结构不符，将使用原始用户输入: "${sentence}"`); return sentence; }

  let rawModelOutput = data.choices[0].message.content;
  console.log(`提示词优化模型 (${chosenModelName}) 返回的原始输出: "${rawModelOutput}"`);

  let actualPrompt = "";
  let thinkingProcess = ""; // Only relevant for reasoning mode

  if (isReasoningMode) {
    const thinkStartTag = "<think>"; const thinkEndTag = "</think>";
    const thinkStartIndex = rawModelOutput.indexOf(thinkStartTag);
    const thinkEndIndex = rawModelOutput.indexOf(thinkEndTag, thinkStartIndex);
    if (thinkStartIndex !== -1 && thinkEndIndex !== -1 && thinkEndIndex > thinkStartIndex) {
      thinkingProcess = rawModelOutput.substring(thinkStartIndex + thinkStartTag.length, thinkEndIndex).trim();
      console.log(`(推理模式) 提取到的思考过程: "${thinkingProcess}"`);
      actualPrompt = rawModelOutput.substring(thinkEndIndex + thinkEndTag.length).trim();
      console.log(`(推理模式) 初步图像 prompt: "${actualPrompt}"`);
    } else {
      console.warn(`(推理模式) 模型 (${chosenModelName}) 输出未找到 <think> 结构。将用整个输出。内容: "${rawModelOutput}"`);
      actualPrompt = rawModelOutput.trim();
    }
  } else {
    actualPrompt = rawModelOutput.trim();
    console.log(`(非推理模式) 获取到的 prompt: "${actualPrompt}"`);
  }

  // Final prompt processing and validation
  const promptWords = actualPrompt.split(/\s+/).filter(Boolean);
  const maxWords = 50;
  if (promptWords.length === 0) { console.warn(`处理后 prompt 为空，回退到原始输入: "${sentence}"`); return sentence; }
  if (promptWords.length > maxWords) { actualPrompt = promptWords.slice(0, maxWords).join(" "); console.log(`截断后的图像 prompt: "${actualPrompt}"`);}
  if (!actualPrompt.includes(",")) { console.warn(`最终处理后的图像 prompt ("${actualPrompt}") 可能不符合预期格式 (缺少逗号)。`); }
  if (actualPrompt.trim().length === 0) { console.error(`关键错误：最终图像 prompt 为空，将回退到原始用户输入: "${sentence}"`); return sentence; }

  console.log(`最终用于图像生成的 prompt: "${actualPrompt}"`);
  return actualPrompt;
}

// Generates an image using an external API, supports multiple API keys for rotation
async function generateImage(prompt, imageSize, modelToUse, apiBaseUrl, apiKeysString) {
  console.log(`使用提示词生成图像 (目标: URL): "${prompt}", 尺寸: ${imageSize}, 模型: ${modelToUse}, API Base: ${apiBaseUrl}`);

  if (!apiBaseUrl || apiBaseUrl.trim() === "") {
    throw new Error(`图像生成配置错误: 传入的 apiBaseUrl (用于模型 ${modelToUse}) 未设置或为空。`);
  }
  if (!modelToUse || modelToUse.trim() === "") {
    // This should ideally be caught before calling this function
    console.error("generateImage (URL): 内部错误 - modelToUse 参数为空或无效。");
    throw new Error("图像生成配置错误: 尝试使用一个无效的模型名称 (URL 生成路径)。");
  }
  if (!apiKeysString || apiKeysString.trim() === "") {
    throw new Error(`图像生成配置错误: 传入的 apiKeysString (用于模型 ${modelToUse} at ${apiBaseUrl}) 未设置或为空。`);
  }

  const apiKeys = apiKeysString.split(',')
    .map(key => key.trim())
    .filter(key => key !== "");

  if (apiKeys.length === 0) {
    throw new Error(`图像生成配置错误: apiKeysString (用于模型 ${modelToUse} at ${apiBaseUrl}) 配置了无效的密钥。`);
  }

  let lastError = null;

  for (let i = 0; i < apiKeys.length; i++) {
    const apiKey = apiKeys[i];
    console.log(`尝试使用 API 密钥 (索引: ${i}, Key: ...${apiKey.slice(-4)}) 调用图像生成 API (${apiBaseUrl.trim()}) (模型: ${modelToUse.trim()}) 以获取 URL`);
    const requestBody = {
      prompt: prompt,
      image_size: imageSize,
      num_inference_steps: 50,
      model: modelToUse.trim()
    };

    try {
      const response = await fetch(apiBaseUrl.trim(), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const data = await response.json();
        // Assuming the Flux-type API returns a URL in this structure
        if (data.images && data.images.length > 0 && data.images[0].url) {
          console.log(`使用模型 ${modelToUse.trim()} 和密钥 (索引: ${i}) 在 ${apiBaseUrl.trim()} 成功生成的图像 URL: ${data.images[0].url}`);
          return data.images[0].url;
        } else {
          lastError = `API响应格式异常(URL生成，模型: ${modelToUse.trim()} at ${apiBaseUrl}): 未找到图像URL。响应内容: ${JSON.stringify(data, null, 2)}`;
          console.error(lastError + ` (使用密钥索引: ${i})`);
        }
      } else {
        const errorText = await response.text();
        lastError = `图像 API (URL 生成) 响应状态码: ${response.status} ${response.statusText || ''} (模型: ${modelToUse.trim()} at ${apiBaseUrl}). 详细错误: ${errorText}`;
        console.error(lastError + ` (使用密钥索引: ${i})`);
      }
    } catch (fetchError) {
      lastError = `调用图像 API (URL 生成) 时发生网络或其他错误: ${fetchError.message}`;
      console.error(lastError + ` (使用密钥索引: ${i})`);
    }
  }

  console.error(`所有 API 密钥 (来自 apiKeysString for ${apiBaseUrl}) 均尝试失败 (模型: ${modelToUse.trim()})。`);
  const finalErrorMessage = `所有图像生成 API 密钥均尝试失败 (针对模型 '${modelToUse.trim()}' at ${apiBaseUrl} for URL). 最后一次错误: ${lastError || '未知错误'}。请检查相关 API Key 和 API Base 的配置以及上游图像生成服务状态。`;
  throw new Error(finalErrorMessage);
}

// Converts aspect ratio string to image size string
function getImageSize(ratio) {
  const sizeMap = {'1:1':'1024x1024', '1:2':'512x1024', '3:2':'768x512', '3:4':'768x1024', '16:9':'1024x576', '9:16':'576x1024'};
  return sizeMap[ratio] || '1024x1024'; // Default if ratio not found
}

// Proxies image requests to avoid CORS issues or hide original URL
async function handleImageProxy(request) {
  const url = new URL(request.url);
  const originalImageUrl = url.searchParams.get('url');
  if (!originalImageUrl) return new Response("Missing image URL parameter", { status: 400 });

  try {
    console.log(`代理请求图片: ${originalImageUrl}`);
    const imageResponse = await fetch(originalImageUrl);
    if (!imageResponse.ok) {
      const errorText = await imageResponse.text();
      console.error(`代理图片失败: ${imageResponse.status} ${imageResponse.statusText}. 详情: ${errorText}`);
      return new Response(`Failed to fetch original image: ${imageResponse.status} ${imageResponse.statusText}`, { status: imageResponse.status });
    }
    const contentType = imageResponse.headers.get('Content-Type') || 'image/jpeg';
    const imageArrayBuffer = await imageResponse.arrayBuffer();
    const headers = new Headers({ 'Content-Type': contentType, 'Content-Disposition': 'inline' });
    return new Response(imageArrayBuffer, { status: 200, headers: headers });
  } catch (error) {
    console.error('代理图片时出错:', error.message, error.stack);
    return new Response(`Error proxying image: ${error.message}`, { status: 500 });
  }
}

// Main request handler for the Worker
async function handleRequest(request) {
  console.log(`处理请求: ${request.method} ${request.url}`);
  const config = workerConfig || initializeConfig(); // Ensure config is initialized
  // console.log("当前 Worker 配置:", JSON.stringify(config, null, 2)); // Optional: Log current config for debugging

  const url = new URL(request.url);
  const path = url.pathname;

  try {
    // Ensure config is available for all handlers if they somehow bypass the top-level init
    // (though initializeConfig() should make it globally available via workerConfig)
    if (!workerConfig && path !== '/') { // Allow root path to work even if config fails for some reason, to show welcome.
        console.error("严重错误: Worker 配置在 handleRequest 中未初始化。");
        // Attempt re-initialization, though this indicates a deeper issue.
        initializeConfig();
        if (!workerConfig) {
             return new Response(JSON.stringify({ error: { message: "服务器配置严重错误，无法处理请求。", type: "server_error", code: "config_init_failed_critical" } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
    }

    if (path === '/') {
      const readmeUrl = "https://github.com/snakeying/Flux-Cloudflare-API";
      const welcomeMessageHtml = `
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>图像生成服务</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f4f6f8; text-align: center; color: #333; padding: 20px; box-sizing: border-box; }
                .container { padding: 30px; background-color: white; border-radius: 10px; box-shadow: 0 6px 12px rgba(0,0,0,0.1); max-width: 600px; width: 100%; }
                h1 { color: #007bff; margin-bottom: 20px; }
                p { font-size: 1.1em; line-height: 1.6; margin-bottom: 15px; }
                .important-note { background-color: #fff3cd; border-left: 5px solid #ffeeba; padding: 15px; margin-top: 20px; margin-bottom: 20px; text-align: left; border-radius: 5px;}
                .important-note strong { color: #856404; }
                a { color: #0056b3; text-decoration: none; }
                a:hover { text-decoration: underline; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>✨ 图像生成服务已成功部署！ ✨</h1>
                <p>一切准备就绪，开始创作吧！</p>
                <div class="important-note">
                    <p><strong>重要提示：</strong>在开始使用前，请务必检查所有环境变量配置是否符合您的需求。</p>
                    <p>如有任何疑问或遇到问题，请查阅 <a href="${readmeUrl}" target="_blank" rel="noopener noreferrer">项目 README 文档</a> 获取详细指引。</p>
                </div>
                <p>记得及时保存您生成的满意作品哦。😊</p>
            </div>
        </body>
        </html>
      `;
      return new Response(welcomeMessageHtml, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
    else if (path === '/v1/chat/completions') {
      return await handleChatCompletions(request);
    } else if (path === '/v1/models') {
      return await handleModels(request);
    } else if (path === '/image-proxy') {
      return await handleImageProxy(request);
    } else if (path === '/health' || path === '/v1/health') {
      return new Response(JSON.stringify({ status: 'ok' }), { headers: { 'Content-Type': 'application/json' } });
    } else {
      return new Response(JSON.stringify({ error: { message: `路径 ${path} 未找到`, type: "invalid_request_error", code: "path_not_found" } }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
  } catch (e) {
    console.error("主处理程序错误:", e.message, e.stack);
    if (e.message.includes("配置错误:") || e.message.includes("configuration error:") || e.message.includes("所有图像生成 API 密钥均尝试失败")) {
      return new Response(JSON.stringify({ error: { message: e.message, type: "configuration_error", code: "env_config_error" } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: { message: `服务器内部错误: ${e.message}`, type: "server_error", code: "unhandled_exception" } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request).catch(err => {
    console.error("Fetch事件最终错误:", err.message, err.stack);
    if (err.message.includes("配置错误:") || err.message.includes("configuration error:") || err.message.includes("所有图像生成 API 密钥均尝试失败")) {
      return new Response(JSON.stringify({ error: { message: err.message, type: "configuration_error", code: "env_config_error" } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: { message: "服务器意外错误。", type: "catastrophic_error", code:"fatal_error" } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }));
});
