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


// 验证 API 密钥
function validateApiKey(request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const providedKey = authHeader.substring(7);
  const validKey = env('AUTHORIZED_API_KEY');
  return providedKey === validKey;
}

// 处理模型列表请求
async function handleModels(request) {
  if (!validateApiKey(request)) {
    return new Response(JSON.stringify({
      error: { message: "认证失败，无效的 API 密钥", type: "invalid_request_error", code: "invalid_api_key" }
    }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const models = [{
    id: "flux-image-gen", object: "model", created: Math.floor(Date.now() / 1000) - 8000, owned_by: "organization-owner",
    permission: [{ id: "modelperm-flux-img", object: "model_permission", created: Math.floor(Date.now() / 1000) - 8000, allow_create_engine: false, allow_sampling: true, allow_logprobs: false, allow_search_indices: false, allow_view: true, allow_fine_tuning: false, organization: "*", group: null, is_blocking: false }],
    root: "flux-image-gen", parent: null
  }];
  return new Response(JSON.stringify({ object: "list", data: models }), { headers: { 'Content-Type': 'application/json' } });
}

// 处理 chat completions 请求 (传递 request 对象)
async function handleChatCompletions(request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: { message: "方法不允许，请使用 POST 请求", type: "invalid_request_error", code: "method_not_allowed" } }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }
  if (!validateApiKey(request)) {
    return new Response(JSON.stringify({ error: { message: "认证失败，无效的 API 密钥", type: "invalid_request_error", code: "invalid_api_key" } }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  let requestData;
  try {
    requestData = await request.json();
  } catch (error) {
    return new Response(JSON.stringify({ error: { message: "无法解析请求体，请提供有效的 JSON", type: "invalid_request_error", code: "invalid_json" } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (!requestData.messages || !Array.isArray(requestData.messages) || requestData.messages.length === 0) {
    return new Response(JSON.stringify({ error: { message: "请求缺少必需的 messages 字段或格式不正确", type: "invalid_request_error", code: "invalid_parameters" } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    return await handleImageGeneration(requestData, request);
  } catch (error) {
    console.error('处理 chat completions 请求时出错:', error.message, error.stack); // Log more error details
    // Check if the error is due to our specific configuration error
    if (error.message.includes("Prompt optimization model configuration error")) {
        return new Response(JSON.stringify({ error: { message: error.message, type: "configuration_error", code: "model_config_error" } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: { message: `处理请求时出错: ${error.message}`, type: "server_error", code: "internal_error" } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

// 处理图像生成请求
async function handleImageGeneration(requestData, request) {
  console.log(`处理图像生成请求`);
  try {
    const lastMessage = requestData.messages[requestData.messages.length - 1];
    let userPrompt = lastMessage.content;

    let imageSize = '1024x1024';
    const sizeMatch = userPrompt.match(/([\d]+:[\d]+)/);
    if (sizeMatch) {
      const ratio = sizeMatch[1];
      userPrompt = userPrompt.replace(ratio, '').trim();
      imageSize = getImageSize(ratio);
    }

    // reviseSentenceToPrompt might throw an error for config issues, caught by handleChatCompletions
    const revisedPrompt = await reviseSentenceToPrompt(userPrompt);
    
    // If revisedPrompt is empty or just whitespace after processing (e.g. due to aggressive trimming or failed logic)
    // and no error was thrown, we might still want to fallback or error out.
    // However, reviseSentenceToPrompt should ideally return the original sentence as fallback.
    if (!revisedPrompt || revisedPrompt.trim() === "") {
        console.error("reviseSentenceToPrompt 返回了空的 prompt，这是一个意外情况。");
        // This case should ideally be handled by reviseSentenceToPrompt's fallbacks.
        // If it still occurs, it indicates a deeper issue.
        throw new Error("Prompt 优化后为空，无法生成图像。");
    }

    const originalImageUrl = await generateImage(revisedPrompt, imageSize);

    if (originalImageUrl) {
        console.log(`获取到原始图像 URL: ${originalImageUrl}.`);

        const encodedImageUrl = encodeURIComponent(originalImageUrl);
        const workerBaseUrl = new URL(request.url).origin;
        const proxyImageUrl = `${workerBaseUrl}/image-proxy?url=${encodedImageUrl}`;
        console.log(`构建的代理 URL: ${proxyImageUrl}`);

        const promptTextForDisplay = revisedPrompt;
        const markdownImageString = `![Image](${proxyImageUrl})\n\n优化后的提示词: ${promptTextForDisplay}`;

        return new Response(JSON.stringify({
          id: `imggen-${Date.now()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: "flux-image-gen",
          choices: [{
            index: 0,
            message: {
              role: "assistant",
              content: markdownImageString
            },
            finish_reason: "stop"
          }],
          usage: {
            prompt_tokens: userPrompt.length,
            completion_tokens: markdownImageString.length,
            total_tokens: userPrompt.length + markdownImageString.length,
          }
        }), { headers: { 'Content-Type': 'application/json' } });
    } else {
      throw new Error('图像生成服务未返回有效的图像 URL');
    }
  } catch (error) {
    console.error('处理图像生成时出错:', error.message, error.stack);
    // Re-throw to be caught by handleChatCompletions, unless it's a config error already handled.
    // If it's a specific image gen failure, let it be a generic server error.
    if (error.message.includes("Prompt optimization model configuration error")) {
        throw error; // Let the higher level catch handle this specific type
    }
    // For other errors during image generation itself:
    return new Response(JSON.stringify({ error: { message: `处理图像生成时出错: ${error.message}`, type: "server_error", code: "image_generation_failed" } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

// 函数：修改句子为提示词
async function reviseSentenceToPrompt(sentence) {
  console.log(`原始用户输入用于优化: "${sentence}"`);

  const modelForNonReasoning = env('OPENAI_MODEL');
  const modelForReasoning = env('OPENAI_MODEL_REASONING');

  let chosenModelName = "";
  let chosenSystemPrompt = "";
  let isReasoningMode = false;

  // --- 环境变量配置检查 ---
  const nonReasoningSet = modelForNonReasoning && modelForNonReasoning.trim() !== "";
  const reasoningSet = modelForReasoning && modelForReasoning.trim() !== "";

  if (reasoningSet) {
    if (nonReasoningSet) {
      const errorMsg = "Prompt optimization model configuration error: Both OPENAI_MODEL and OPENAI_MODEL_REASONING are set. Please choose only one.";
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    chosenModelName = modelForReasoning;
    chosenSystemPrompt = systemPromptForReasoning;
    isReasoningMode = true;
    console.log(`使用推理模型进行提示词优化: ${chosenModelName}`);
  } else if (nonReasoningSet) {
    chosenModelName = modelForNonReasoning;
    chosenSystemPrompt = systemPromptForNonReasoning;
    isReasoningMode = false;
    console.log(`使用非推理模型进行提示词优化: ${chosenModelName}`);
  } else {
    const errorMsg = "Prompt optimization model configuration error: Neither OPENAI_MODEL nor OPENAI_MODEL_REASONING is set. Please configure one.";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  const openaiUserMessage = `Input: ${sentence}\nOutput:`;

  console.log(`发送请求到 OpenAI API (模型: ${chosenModelName})`);
  const response = await fetch(`${env('OPENAI_API_BASE')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: chosenModelName,
      messages: [
        { role: 'system', content: chosenSystemPrompt },
        { role: 'user', content: openaiUserMessage }
      ],
      // max_tokens: 256, // Consider setting based on mode or a general value
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`OpenAI API (提示词优化) 响应状态码: ${response.status}. 响应: ${errorText}`);
    console.warn(`OpenAI API 调用失败，将使用原始用户输入作为 prompt: "${sentence}"`);
    return sentence;
  }

  let data;
  try {
    data = await response.json();
  } catch (e) {
    const responseText = await response.text(); // Attempt to get text if JSON parsing failed
    console.error(`无法解析 OpenAI API 响应为 JSON: ${e.message}. 原始响应文本: ${responseText}`);
    console.warn(`OpenAI API 响应解析失败，将使用原始用户输入作为 prompt: "${sentence}"`);
    return sentence;
  }
  
  if (!data.choices || data.choices.length === 0 || !data.choices[0].message || !data.choices[0].message.content) {
    console.error("OpenAI API 响应结构不符合预期，缺少 choices[0].message.content");
    console.log("完整响应数据:", JSON.stringify(data, null, 2));
    console.warn(`OpenAI API 响应结构不符，将使用原始用户输入作为 prompt: "${sentence}"`);
    return sentence;
  }

  let rawModelOutput = data.choices[0].message.content;
  console.log(`模型 (${chosenModelName}) 返回的原始输出: "${rawModelOutput}"`);

  let actualPrompt = "";
  // let thinkingProcess = ""; // Uncomment if you need to store/use the thinking process

  if (isReasoningMode) {
    const thinkStartTag = "<think>";
    const thinkEndTag = "</think>";
    const thinkStartIndex = rawModelOutput.indexOf(thinkStartTag);
    const thinkEndIndex = rawModelOutput.indexOf(thinkEndTag, thinkStartIndex);

    if (thinkStartIndex !== -1 && thinkEndIndex !== -1 && thinkEndIndex > thinkStartIndex) {
      // thinkingProcess = rawModelOutput.substring(thinkStartIndex + thinkStartTag.length, thinkEndIndex).trim();
      actualPrompt = rawModelOutput.substring(thinkEndIndex + thinkEndTag.length).trim();
      // console.log(`(推理模式) 提取到的思考过程: "${thinkingProcess}"`);
      console.log(`(推理模式) 提取到的初步图像 prompt: "${actualPrompt}"`);
    } else {
      console.warn(`(推理模式) 模型输出 (${chosenModelName}) 中未找到预期的 <think>...</think> 结构。将尝试使用整个输出作为 prompt。内容: "${rawModelOutput}"`);
      actualPrompt = rawModelOutput.trim(); // Fallback to using the whole output if <think> tags are missing
    }
  } else {
    // 非推理模式，直接认为整个输出是 prompt
    actualPrompt = rawModelOutput.trim();
    console.log(`(非推理模式) 获取到的 prompt: "${actualPrompt}"`);
  }

  // --- 后续的 actualPrompt 清理、长度校验、格式检查逻辑 ---
  const promptWords = actualPrompt.split(/\s+/).filter(Boolean);
  const maxWords = 50;

  if (promptWords.length === 0) {
    console.warn(`处理后的图像 prompt 为空。将回退到原始用户输入: "${sentence}"`);
    return sentence;
  }
  
  if (promptWords.length > maxWords) {
    console.warn(`图像 prompt ("${actualPrompt}") 长度 (${promptWords.length} words) 超过了设定的 ${maxWords} words。将进行截断。`);
    actualPrompt = promptWords.slice(0, maxWords).join(" ");
    console.log(`截断后的图像 prompt: "${actualPrompt}"`);
  }

  if (!actualPrompt.includes(",")) {
    console.warn(`最终处理后的图像 prompt ("${actualPrompt}") 可能不符合预期格式 (缺少逗号)。`);
  }
  
  if (actualPrompt.trim().length === 0) {
    console.error(`关键错误：最终图像 prompt 为空，将回退到原始用户输入: "${sentence}"`);
    return sentence;
  }

  console.log(`最终用于图像生成的 prompt: "${actualPrompt}"`);
  return actualPrompt;
}

// 函数：生成图像
async function generateImage(prompt, imageSize) {
  console.log(`使用提示词生成图像: "${prompt}", 尺寸: ${imageSize}`); // Added quotes for clarity
  console.log(`发送请求到图像生成 API`);
  const response = await fetch(env('IMAGE_GEN_API_BASE'), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env('IMAGE_GEN_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: prompt,
      image_size: imageSize,
      num_inference_steps: 50,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`图像 API 响应状态码: ${response.status}. 响应: ${errorText}`);
    throw new Error(`图像 API 响应状态码: ${response.status}`);
  }

  const data = await response.json();
  if (data.images && data.images.length > 0 && data.images[0].url) {
    console.log(`生成的图像 URL: ${data.images[0].url}`);
    return data.images[0].url;
  } else {
    console.error('API 响应格式异常 (图像生成):', JSON.stringify(data, null, 2));
    throw new Error('在 API 响应中找不到图像 URL (图像生成)');
  }
}

// 函数：根据比例获取图像大小
function getImageSize(ratio) {
  const sizeMap = {
    '1:1': '1024x1024', '1:2': '512x1024', '3:2': '768x512',
    '3:4': '768x1024', '16:9': '1024x576', '9:16': '576x1024'
  };
  return sizeMap[ratio] || '1024x1024';
}

// 处理图片代理请求的函数
async function handleImageProxy(request) {
  const url = new URL(request.url);
  const originalImageUrl = url.searchParams.get('url');

  if (!originalImageUrl) {
    return new Response("Missing image URL parameter", { status: 400 });
  }

  try {
    console.log(`代理请求图片: ${originalImageUrl}`);
    const imageResponse = await fetch(originalImageUrl, {
        // headers: { 'Referer': new URL(request.url).origin }
    });

    if (!imageResponse.ok) {
      const errorText = await imageResponse.text();
      console.error(`代理图片失败: ${imageResponse.status} ${imageResponse.statusText}. 详情: ${errorText}`);
      return new Response(`Failed to fetch original image: ${imageResponse.status} ${imageResponse.statusText}`, { status: imageResponse.status });
    }

    const contentType = imageResponse.headers.get('Content-Type') || 'image/jpeg';
    const imageArrayBuffer = await imageResponse.arrayBuffer();

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Content-Disposition', 'inline');
    // headers.set('Cache-Control', 'public, max-age=3600');

    return new Response(imageArrayBuffer, {
      status: 200,
      headers: headers
    });

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
    if (path === '/v1/chat/completions') {
      return await handleChatCompletions(request);
    } else if (path === '/v1/models') {
      return await handleModels(request);
    } else if (path === '/image-proxy') {
      return await handleImageProxy(request);
    } else if (path === '/health' || path === '/v1/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({
        error: { message: `路径 ${path} 未找到`, type: "invalid_request_error", code: "path_not_found" }
      }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
  } catch (e) { // Catch any unhandled errors from the routing/main logic
      console.error("主处理程序中未捕获的错误:", e.message, e.stack);
      return new Response(JSON.stringify({ error: { message: `服务器内部错误: ${e.message}`, type: "server_error", code: "unhandled_exception" } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

addEventListener('fetch', event => {
  console.log('收到 fetch 事件');
  event.respondWith(handleRequest(event.request).catch(err => {
      // Fallback for errors not caught by individual handlers, though ideally they should be.
      console.error("Fetch 事件 respondWith 中捕获的最终错误:", err.message, err.stack);
      return new Response(JSON.stringify({ error: { message: "服务器处理请求时发生意外错误。", type: "catastrophic_error" } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }));
});
