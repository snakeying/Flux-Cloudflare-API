// Cloudflare Worker for Image Generation API with Image Proxy
// and ensuring Markdown content is just the image link

// Helper function to access environment variables
const env = name => globalThis[name];

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
    console.error('处理 chat completions 请求时出错:', error);
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
    
    const revisedPrompt = await reviseSentenceToPrompt(userPrompt); 
    const originalImageUrl = await generateImage(revisedPrompt, imageSize); 
    
    if (originalImageUrl) {
        console.log(`获取到原始图像 URL: ${originalImageUrl}.`);
        
        const encodedImageUrl = encodeURIComponent(originalImageUrl);
        const workerBaseUrl = new URL(request.url).origin; 
        const proxyImageUrl = `${workerBaseUrl}/image-proxy?url=${encodedImageUrl}`;
        console.log(`构建的代理 URL: ${proxyImageUrl}`);

        // --- 确保 content 字段只包含 Markdown 图片链接 ---
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
              content: markdownImageString // content 现在只包含 Markdown 图片链接
            },
            finish_reason: "stop" 
          }],
          usage: {
            prompt_tokens: userPrompt.length, 
            completion_tokens: markdownImageString.length, // 可以基于 Markdown 字符串的长度
            total_tokens: userPrompt.length + markdownImageString.length,
          }
        }), { headers: { 'Content-Type': 'application/json' } });
    } else {
      throw new Error('图像生成服务未返回有效的图像 URL');
    }
  } catch (error) {
    console.error('处理图像生成时出错:', error);
    throw error;
  }
}

// 函数：修改句子为提示词
async function reviseSentenceToPrompt(sentence) {
  console.log(`原始用户输入用于优化: ${sentence}`);
  const openaiSystemPrompt = `TEXT-TO-IMAGE PROMPT GENERATOR
## OBJECTIVE
Convert user input into a concise, effective text-to-image prompt.

## OUTPUT STRUCTURE
- Single paragraph, comma-separated
- Maximum 50 words, aim for 30-40
- Always start with: "masterpiece, best quality, 8k"
- Include: style, main subject, key scene elements

## INSTRUCTIONS
1. Extract key visual elements from user input
2. Determine style:
   - Use explicitly mentioned style if provided
   - If no style mentioned, infer from description or use "photorealistic"
3. Prioritize main subject and essential scene elements
4. Add brief details on composition, lighting, or color if word count allows
5. Generate ONE prompt in English
6. Return ONLY the generated prompt, without any other text, thoughts, or tags.

## EXAMPLES
User Input: "A cat sitting on a windowsill"
Output: masterpiece, best quality, 8k, photorealistic, orange tabby cat, alert posture, sunlit wooden windowsill, soft focus cityscape outside, warm afternoon light

User Input: "Futuristic city in anime style"
Output: masterpiece, best quality, 8k, anime, sprawling futuristic metropolis, towering skyscrapers, flying vehicles, neon lights, dynamic composition, vibrant color palette`;

  const openaiUserMessage = `Input: ${sentence}\nOutput:`;

  console.log(`发送请求到 OpenAI API 进行提示词优化`);
  const response = await fetch(`${env('OPENAI_API_BASE')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env('OPENAI_MODEL'),
      messages: [
        { role: 'system', content: openaiSystemPrompt },
        { role: 'user', content: openaiUserMessage }
      ],
    }),
  });

  if (!response.ok) {
    console.error(`OpenAI API (提示词优化) 响应状态码: ${response.status}`);
    const text = await response.text();
    console.error(`OpenAI API (提示词优化) 响应: ${text}`);
    throw new Error(`OpenAI API (提示词优化) 响应状态码: ${response.status}`);
  }

  const data = await response.json();
  let revisedPrompt = data.choices[0].message.content.trim();
  
  const thinkStartTag = "<think>";
  const thinkEndTag = "";
  const thinkStartIndex = revisedPrompt.indexOf(thinkStartTag);
  const thinkEndIndex = revisedPrompt.lastIndexOf(thinkEndTag);

  if (thinkStartIndex !== -1 && thinkEndIndex !== -1 && thinkEndIndex > thinkStartIndex) {
    revisedPrompt = revisedPrompt.substring(thinkEndIndex + thinkEndTag.length).trim();
  }
  revisedPrompt = revisedPrompt.replace(/^\s+/g, '');

  console.log(`修正后的提示词 (应为纯英文 prompt): ${revisedPrompt}`);
  if (revisedPrompt.length === 0 || !revisedPrompt.includes(",")) { 
      console.warn("修正后的 prompt 可能不符合预期格式。Prompt:", revisedPrompt);
      // 如果 prompt 不合格，则直接使用原始用户输入 sentence 作为回退
      // revisedPrompt = sentence; 
  }
  return revisedPrompt;
}

// 函数：生成图像
async function generateImage(prompt, imageSize) {
  console.log(`使用提示词生成图像: ${prompt}, 尺寸: ${imageSize}`);
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
    console.error(`图像 API 响应状态码: ${response.status}`);
    const text = await response.text();
    console.error(`图像 API 错误响应: ${text}`);
    throw new Error(`图像 API 响应状态码: ${response.status}`);
  }

  const data = await response.json();
  if (data.images && data.images.length > 0 && data.images[0].url) {
    console.log(`生成的图像 URL: ${data.images[0].url}`);
    return data.images[0].url;
  } else {
    console.error('API 响应格式异常 (图像生成):', data);
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
        headers: { /* 'Referer': new URL(request.url).origin */ }
    });

    if (!imageResponse.ok) {
      console.error(`代理图片失败: ${imageResponse.status} ${imageResponse.statusText}`);
      const errorText = await imageResponse.text();
      console.error(`代理图片错误详情: ${errorText}`);
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
    console.error('代理图片时出错:', error);
    return new Response(`Error proxying image: ${error.message}`, { status: 500 });
  }
}

// 主处理程序
async function handleRequest(request) {
  console.log(`处理请求: ${request.method} ${request.url}`);
  const url = new URL(request.url);
  const path = url.pathname;

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
}

addEventListener('fetch', event => {
  console.log('收到 fetch 事件');
  event.respondWith(handleRequest(event.request));
});
