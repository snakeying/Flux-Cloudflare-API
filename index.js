// Cloudflare Worker for Image Generation API with Image Proxy
// and ensuring Markdown content is just the image link

// Helper function to access environment variables
const env = name => globalThis[name];

// --- System Prompts ---
// For OPENAI_MODEL (non-reasoning)
const systemPromptForNonReasoning = `TEXT-TO-IMAGE PROMPT GENERATOR
## OBJECTIVE
Convert user input into a concise, effective text-to-image prompt.
## OUTPUT STRUCTURE
- Single paragraph, comma-separated
- Maximum 50 words, aim for 30-40
- Always start with: "masterpiece, best quality, 8k"
- Include: style, main subject, key scene elements
- Generate ONE prompt in English
- Return ONLY the generated prompt.
## EXAMPLES
User Input: "A cat sitting on a windowsill"
Output: masterpiece, best quality, 8k, photorealistic, orange tabby cat, alert posture, sunlit wooden windowsill, soft focus cityscape outside, warm afternoon light`;

// For OPENAI_MODEL_REASONING
const systemPromptForReasoning = `TEXT-TO-IMAGE PROMPT GENERATOR
## OBJECTIVE
Convert user input into a concise, effective text-to-image prompt for image generation.

## YOUR PROCESS & FULL RESPONSE STRUCTURE
1.  **Think Step (Internal Monologue):** First, think about the request. This thinking process MUST be enclosed in <think></think> tags.
tags.
2.  **Image Prompt Output:** Immediately AFTER the closing </think> tag, you MUST provide the generated image prompt.

## IMAGE PROMPT SPECIFICATIONS (This applies to the part of your response AFTER </think>)
*   It MUST be a single paragraph, comma-separated.
*   It MUST be maximum 50 words, ideally 30-40 words.
*   It MUST always start with: "masterpiece, best quality, 8k".
*   Include: style, main subject, key scene elements.
*   Generate ONE prompt in English.

## EXAMPLE OF YOUR FULL RESPONSE TO ME:
<think>The user's input is "一只未来城市的猫". I need to translate this and come up with a prompt. "A cat in a futuristic city." Style could be cyberpunk or sleek sci-fi. Let's go with cyberpunk for more visual interest. Key elements: cat, futuristic city, neon lights, rain. The cat could be a sleek black cat. The city should have towering, glowing skyscrapers. The prompt needs to start with the standard keywords and be within word limits.</think>masterpiece, best quality, 8k, cyberpunk, sleek black cat, perched on a neon-lit ledge, overlooking a sprawling futuristic metropolis, rain-slicked streets, towering glowing skyscrapers, vibrant and moody atmosphere

## CRITICAL: THE ACTUAL IMAGE PROMPT PART OF YOUR RESPONSE
Based on the example above, the part of your response that I will extract and use AS THE IMAGE PROMPT would be:
"masterpiece, best quality, 8k, cyberpunk, sleek black cat, perched on a neon-lit ledge, overlooking a sprawling futuristic metropolis, rain-slicked streets, towering glowing skyscrapers, vibrant and moody atmosphere"
Ensure your output after </think> precisely matches this clean format, with no extra text, newlines, or explanations.

## USER INPUT FOR YOU TO PROCESS:
Input: {sentence}
Output: (Your full response, starting with <think> if you perform that step, followed by the image prompt as specified)
`;


// 验证 API 密钥 (Worker的全局认证)
function validateWorkerApiKey(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const providedKey = authHeader.substring(7);
  const validKey = env('AUTHORIZED_API_KEY');
  if (!validKey || validKey.trim() === "") {
      console.error("Worker全局认证配置错误: AUTHORIZED_API_KEY 未设置。");
      return false;
  }
  return providedKey === validKey;
}

// 处理模型列表请求
async function handleModels(request) {
  if (!validateWorkerApiKey(request)) {
    return new Response(JSON.stringify({ error: { message: "认证失败，无效的 API 密钥", type: "invalid_request_error", code: "invalid_api_key" } }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const modelsData = [{ id: "flux-image-gen", object: "model", created: Math.floor(Date.now() / 1000) - 8000, owned_by: "organization-owner", permission: [{ id: "modelperm-flux-img", object: "model_permission", created: Math.floor(Date.now() / 1000) - 8000, allow_create_engine: false, allow_sampling: true, allow_logprobs: false, allow_search_indices: false, allow_view: true, allow_fine_tuning: false, organization: "*", group: null, is_blocking: false }], root: "flux-image-gen", parent: null }];
  return new Response(JSON.stringify({ object: "list", data: modelsData }), { headers: { 'Content-Type': 'application/json' } });
}

// 处理 chat completions 请求
async function handleChatCompletions(request) {
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: { message: "方法不允许，请使用 POST 请求", type: "invalid_request_error", code:"method_not_allowed" } }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  if (!validateWorkerApiKey(request)) return new Response(JSON.stringify({ error: { message: "认证失败，无效的 API 密钥", type: "invalid_request_error", code:"invalid_api_key" } }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  let requestData;
  try { requestData = await request.json(); } catch (e) { return new Response(JSON.stringify({ error: { message: "无法解析请求体，请提供有效的 JSON", type: "invalid_request_error", code:"invalid_json" } }), { status: 400, headers: { 'Content-Type': 'application/json' } }); }
  if (!requestData.messages || !Array.isArray(requestData.messages) || requestData.messages.length === 0) return new Response(JSON.stringify({ error: { message: "请求缺少必需的 messages 字段或格式不正确", type: "invalid_request_error", code:"invalid_parameters" } }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  try {
    return await handleImageGeneration(requestData, request);
  } catch (error) {
    console.error('处理 chat completions 请求时出错:', error.message, error.stack);
    if (error.message.includes("配置错误:") || error.message.includes("configuration error:") || error.message.includes("所有图像生成 API 密钥均尝试失败")) {
        return new Response(JSON.stringify({ error: { message: error.message, type: "configuration_error", code: "env_config_error" } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: { message: `处理请求时出错: ${error.message}`, type: "server_error", code: "internal_error" } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

// 处理图像生成请求
async function handleImageGeneration(requestData, request) {
  const lastMessage = requestData.messages[requestData.messages.length - 1];
  let userPrompt = lastMessage.content;
  let imageSize = '1024x1024';
  const sizeMatch = userPrompt.match(/([\d]+:[\d]+)/);
  if (sizeMatch && sizeMatch[1]) {
      userPrompt = userPrompt.replace(sizeMatch[1], '').trim();
      imageSize = getImageSize(sizeMatch[1]);
  }

  const revisedPrompt = await reviseSentenceToPrompt(userPrompt);
  if (!revisedPrompt || revisedPrompt.trim() === "") throw new Error("Prompt 优化后为空，无法生成图像。");

  const originalImageUrl = await generateImage(revisedPrompt, imageSize);
  if (!originalImageUrl) throw new Error('图像生成服务未返回有效的图像 URL (所有Key尝试后依然失败)');

  const encodedImageUrl = encodeURIComponent(originalImageUrl);
  const proxyImageUrl = `${new URL(request.url).origin}/image-proxy?url=${encodedImageUrl}`;
  const markdownImageString = `![Image](${proxyImageUrl})\n\n优化后的提示词: ${revisedPrompt}`;

  return new Response(JSON.stringify({
    id: `imggen-${Date.now()}`, object: "chat.completion", created: Math.floor(Date.now() / 1000),
    model: env('IMAGE_GEN_MODEL') || "flux-image-gen-default",
    choices: [{ index: 0, message: { role: "assistant", content: markdownImageString }, finish_reason: "stop" }],
    usage: { prompt_tokens: userPrompt.length, completion_tokens: markdownImageString.length, total_tokens: userPrompt.length + markdownImageString.length }
  }), { headers: { 'Content-Type': 'application/json' } });
}

// 函数：修改句子为提示词
async function reviseSentenceToPrompt(sentence) {
  console.log(`原始用户输入用于优化: "${sentence}"`);

  const promptApiKey = env('OPENAI_API_KEY');
  if (!promptApiKey || promptApiKey.trim() === "") throw new Error("提示词优化配置错误: 环境变量 OPENAI_API_KEY 未设置或为空。");

  const modelForNonReasoning = env('OPENAI_MODEL');
  const modelForReasoning = env('OPENAI_MODEL_REASONING');
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

  const promptApiBase = env('OPENAI_API_BASE');
  if (!promptApiBase || promptApiBase.trim() === "") {
      throw new Error("提示词优化配置错误: OPENAI_API_BASE 未设置或为空。请严格按照 README 指导设置为 API 的基础 URL (例如: https://api.openai.com/v1)。");
  }
  const finalPromptApiUrl = `${promptApiBase.trim()}/chat/completions`;

  const openaiUserMessage = `Input: ${sentence}\nOutput:`;
  console.log(`发送请求到提示词优化 API (${finalPromptApiUrl}) (模型: ${chosenModelName})`);
  const response = await fetch(finalPromptApiUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${promptApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: chosenModelName,
      messages: [{ role: 'system', content: chosenSystemPrompt }, { role: 'user', content: openaiUserMessage }]
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`提示词优化 API 响应状态码: ${response.status}. 端点: ${finalPromptApiUrl}, 模型: ${chosenModelName}. 响应: ${errorText}`);
    console.warn(`提示词优化 API 调用失败，将使用原始用户输入: "${sentence}"`);
    return sentence;
  }
  let data;
  try { data = await response.json(); } catch (e) { console.warn(`解析JSON失败，将使用原始用户输入: "${sentence}"`); return sentence; }
  if (!data.choices || data.choices.length === 0 || !data.choices[0].message || !data.choices[0].message.content) { console.warn(`API响应结构不符，将使用原始用户输入: "${sentence}"`); return sentence; }

  let rawModelOutput = data.choices[0].message.content;
  console.log(`提示词优化模型 (${chosenModelName}) 返回的原始输出: "${rawModelOutput}"`);

  let actualPrompt = "";
  let thinkingProcess = ""; // <--- 声明 thinkingProcess

  if (isReasoningMode) {
    const thinkStartTag = "<think>"; const thinkEndTag = "</think>";
    const thinkStartIndex = rawModelOutput.indexOf(thinkStartTag);
    const thinkEndIndex = rawModelOutput.indexOf(thinkEndTag, thinkStartIndex);
    if (thinkStartIndex !== -1 && thinkEndIndex !== -1 && thinkEndIndex > thinkStartIndex) {
      // --- 提取并记录思考过程 ---
      thinkingProcess = rawModelOutput.substring(thinkStartIndex + thinkStartTag.length, thinkEndIndex).trim();
      console.log(`(推理模式) 提取到的思考过程: "${thinkingProcess}"`); // <--- 打印思考过程
      // --- 思考过程提取结束 ---
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

  const promptWords = actualPrompt.split(/\s+/).filter(Boolean);
  const maxWords = 50;
  if (promptWords.length === 0) { console.warn(`处理后 prompt 为空，回退到原始输入: "${sentence}"`); return sentence; }
  if (promptWords.length > maxWords) { actualPrompt = promptWords.slice(0, maxWords).join(" "); console.log(`截断后的图像 prompt: "${actualPrompt}"`);}
  if (!actualPrompt.includes(",")) { console.warn(`最终处理后的图像 prompt ("${actualPrompt}") 可能不符合预期格式 (缺少逗号)。`); }
  if (actualPrompt.trim().length === 0) { console.error(`关键错误：最终图像 prompt 为空，将回退到原始用户输入: "${sentence}"`); return sentence; }

  console.log(`最终用于图像生成的 prompt: "${actualPrompt}"`);
  return actualPrompt;
}

// 函数：生成图像 (支持多KEY轮值)
async function generateImage(prompt, imageSize) {
  console.log(`使用提示词生成图像: "${prompt}", 尺寸: ${imageSize}`);

  const imageApiBaseUrl = env('IMAGE_GEN_API_BASE');
  const imageModelName = env('IMAGE_GEN_MODEL');
  const imageApiKeysString = env('IMAGE_GEN_API_KEY');

  if (!imageApiBaseUrl || imageApiBaseUrl.trim() === "") {
    throw new Error("图像生成配置错误: 环境变量 IMAGE_GEN_API_BASE 未设置或为空。");
  }
  if (!imageModelName || imageModelName.trim() === "") {
    throw new Error("图像生成配置错误: 环境变量 IMAGE_GEN_MODEL 未设置或为空。");
  }
  if (!imageApiKeysString || imageApiKeysString.trim() === "") {
    throw new Error("图像生成配置错误: 环境变量 IMAGE_GEN_API_KEY 未设置或为空。");
  }

  const apiKeys = imageApiKeysString.split(',')
    .map(key => key.trim()) // Trim each key
    .filter(key => key !== ""); 

  if (apiKeys.length === 0) {
    throw new Error("图像生成配置错误: IMAGE_GEN_API_KEY 配置了无效的密钥。请确保格式为 'key1,key2,key3' 且密钥非空。");
  }

  let lastError = null;

  for (let i = 0; i < apiKeys.length; i++) {
    const apiKey = apiKeys[i];
    console.log(`尝试使用 API 密钥 (索引: ${i}, Key: ...${apiKey.slice(-4)}) 调用图像生成 API (${imageApiBaseUrl.trim()}) (模型: ${imageModelName.trim()})`); // Log partial key
    const requestBody = {
      prompt: prompt,
      image_size: imageSize,
      num_inference_steps: 50,
      model: imageModelName.trim()
    };

    try {
      const response = await fetch(imageApiBaseUrl.trim(), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.images && data.images.length > 0 && data.images[0].url) {
          console.log(`使用模型 ${imageModelName.trim()} 和密钥 (索引: ${i}) 在 ${imageApiBaseUrl.trim()} 成功生成的图像 URL: ${data.images[0].url}`);
          return data.images[0].url;
        } else {
          lastError = `API响应格式异常(图像生成，模型: ${imageModelName.trim()}): 未找到图像URL。响应内容: ${JSON.stringify(data, null, 2)}`;
          console.error(lastError + ` (使用密钥索引: ${i})`);
        }
      } else {
        const errorText = await response.text();
        lastError = `图像 API 响应状态码: ${response.status} ${response.statusText || ''} (模型: ${imageModelName.trim()}). 详细错误: ${errorText}`;
        console.error(lastError + ` (使用密钥索引: ${i})`);
      }
    } catch (fetchError) {
      lastError = `调用图像 API 时发生网络或其他错误: ${fetchError.message}`;
      console.error(lastError + ` (使用密钥索引: ${i})`);
    }
  }

  console.error("所有 IMAGE_GEN_API_KEY 均尝试失败。");
  const finalErrorMessage = `所有图像生成 API 密钥均尝试失败。最后一次错误: ${lastError || '未知错误'}。请检查 IMAGE_GEN_API_KEY 的配置以及上游图像生成服务状态。`;
  throw new Error(finalErrorMessage);
}


// 函数：根据比例获取图像大小
function getImageSize(ratio) {
  const sizeMap = {'1:1':'1024x1024', '1:2':'512x1024', '3:2':'768x512', '3:4':'768x1024', '16:9':'1024x576', '9:16':'576x1024'};
  return sizeMap[ratio] || '1024x1024';
}

// 处理图片代理请求的函数
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

// 主处理程序
async function handleRequest(request) {
  console.log(`处理请求: ${request.method} ${request.url}`);
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    if (path === '/') {
      const readmeUrl = "https://github.com/snakeying/Flux-Cloudflare-API"; // 你提供的链接
      const welcomeMessageHtml = `
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale-1.0">
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
