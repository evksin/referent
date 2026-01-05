import { NextRequest, NextResponse } from "next/server";

// Конфигурация для Next.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { parsedData } = await request.json();

    if (!parsedData || !parsedData.content) {
      return NextResponse.json(
        {
          error: "CONTENT_REQUIRED",
          message: "Необходимо предоставить контент статьи для генерации иллюстрации.",
        },
        { status: 400 }
      );
    }

    // Проверяем наличие API ключей
    const openRouterApiKey = process.env.OPENROUTER_API_KEY;
    // AI Horde API ключ (можно использовать "0000000000" для анонимного доступа)
    const aiHordeApiKey = process.env.AIHORDE_API_KEY || "0000000000";

    if (!openRouterApiKey) {
      return NextResponse.json(
        {
          error: "API_KEY_MISSING",
          message: "OPENROUTER_API_KEY не настроен в .env.local",
        },
        { status: 500 }
      );
    }

    // Обрезаем контент для промпта (максимум 5000 символов)
    const maxContentLength = 5000;
    let contentToProcess = parsedData.content;
    if (contentToProcess.length > maxContentLength) {
      contentToProcess =
        contentToProcess.substring(0, maxContentLength) +
        "\n\n[... контент обрезан ...]";
    }

    // Шаг 1: Генерируем промпт для изображения через OpenRouter
    const textToProcess = `Заголовок: ${parsedData.title}\n\n${contentToProcess}`;

    const openRouterResponse = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openRouterApiKey}`,
          "HTTP-Referer": request.nextUrl.origin,
          "X-Title": "Referent Illustration Generator",
        },
        body: JSON.stringify({
          model: "deepseek/deepseek-chat",
          messages: [
            {
              role: "system",
              content:
                "Ты профессиональный специалист по созданию промптов для генерации изображений. Твоя задача - создать детальный и точный промпт на английском языке для генерации изображения, которое иллюстрирует основную идею или тему статьи. Промпт должен быть конкретным, описательным и подходящим для AI-генерации изображений. Верни только промпт, без дополнительных комментариев.",
            },
            {
              role: "user",
              content: `Создай детальный промпт на английском языке для генерации изображения, которое иллюстрирует следующую статью:\n\n${textToProcess}\n\nПромпт должен быть конкретным, описательным и подходящим для AI-генерации изображений (например, для Stable Diffusion или DALL-E).`,
            },
          ],
          temperature: 0.7,
        }),
      }
    );

    if (!openRouterResponse.ok) {
      let errorMessage = `Ошибка OpenRouter API: ${openRouterResponse.statusText}`;

      if (openRouterResponse.status === 401) {
        errorMessage =
          "Неверный API ключ OpenRouter. Проверьте OPENROUTER_API_KEY в .env.local";
      } else if (openRouterResponse.status === 429) {
        errorMessage =
          "Превышен лимит запросов к OpenRouter API. Попробуйте позже.";
      } else if (openRouterResponse.status === 503) {
        errorMessage = "Сервис OpenRouter временно недоступен. Попробуйте позже.";
      } else {
        try {
          const errorData = await openRouterResponse.json();
          if (errorData.error?.message) {
            errorMessage = `Ошибка OpenRouter: ${errorData.error.message}`;
          }
        } catch {
          // Если не удалось распарсить JSON, используем стандартное сообщение
        }
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: openRouterResponse.status >= 500 ? 502 : openRouterResponse.status }
      );
    }

    const openRouterData = await openRouterResponse.json();

    if (
      !openRouterData.choices ||
      !openRouterData.choices[0]?.message?.content
    ) {
      return NextResponse.json(
        { error: "Неожиданный формат ответа от OpenRouter" },
        { status: 500 }
      );
    }

    const imagePrompt = openRouterData.choices[0].message.content.trim();

    if (!imagePrompt || imagePrompt.length === 0) {
      return NextResponse.json(
        {
          error: "EMPTY_PROMPT",
          message: "Не удалось создать промпт для изображения.",
        },
        { status: 500 }
      );
    }

    // Шаг 2: Генерируем изображение через AI Horde
    // AI Horde использует асинхронный API
    console.log("Sending request to AI Horde with prompt:", imagePrompt.substring(0, 100) + "...");
    
    // Шаг 2.1: Создаем запрос на генерацию
    const generateResponse = await fetch(
      "https://aihorde.net/api/v2/generate/async",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": aiHordeApiKey,
        },
        body: JSON.stringify({
          prompt: imagePrompt,
          params: {
            width: 512,
            height: 512,
            steps: 20,
            n: 1,
          },
          models: ["stable_diffusion"], // Можно указать конкретные модели или оставить пустым
        }),
      }
    );

    if (!generateResponse.ok) {
      let errorMessage = `Ошибка AI Horde API: ${generateResponse.statusText}`;
      
      try {
        const errorData = await generateResponse.json();
        if (errorData.message) {
          errorMessage = `Ошибка AI Horde: ${errorData.message}`;
        }
      } catch {
        // Если не удалось распарсить JSON
      }

      return NextResponse.json(
        {
          error: errorMessage,
          message: errorMessage,
          type: "AIHORDE_ERROR",
        },
        { status: generateResponse.status >= 500 ? 502 : generateResponse.status }
      );
    }

    const generateData = await generateResponse.json();
    
    if (!generateData.id) {
      return NextResponse.json(
        {
          error: "Не удалось получить ID генерации от AI Horde.",
          message: "Не удалось получить ID генерации от AI Horde.",
          type: "AIHORDE_ERROR",
        },
        { status: 500 }
      );
    }

    const generationId = generateData.id;
    console.log("AI Horde generation ID:", generationId);

    // Шаг 2.2: Ожидаем завершения генерации (проверяем статус)
    const maxWaitTime = 120000; // 2 минуты максимум
    const checkInterval = 3000; // Проверяем каждые 3 секунды
    const startTime = Date.now();
    let generationComplete = false;
    let statusData: any = null;

    while (!generationComplete && Date.now() - startTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));

      const statusResponse = await fetch(
        `https://aihorde.net/api/v2/generate/check/${generationId}`,
        {
          method: "GET",
          headers: {
            "apikey": aiHordeApiKey,
          },
        }
      );

      if (!statusResponse.ok) {
        return NextResponse.json(
          {
            error: "Ошибка при проверке статуса генерации.",
            message: "Ошибка при проверке статуса генерации в AI Horde.",
            type: "AIHORDE_ERROR",
          },
          { status: 500 }
        );
      }

      statusData = await statusResponse.json();

      if (statusData.done === true) {
        generationComplete = true;
        break;
      }

      if (statusData.faulted === true) {
        return NextResponse.json(
          {
            error: "Генерация изображения завершилась с ошибкой.",
            message: "Генерация изображения в AI Horde завершилась с ошибкой.",
            type: "AIHORDE_ERROR",
          },
          { status: 500 }
        );
      }
    }

    if (!generationComplete) {
      return NextResponse.json(
        {
          error: "Превышено время ожидания генерации изображения.",
          message: "Превышено время ожидания генерации изображения в AI Horde (более 2 минут).",
          type: "TIMEOUT",
        },
        { status: 504 }
      );
    }

    // Шаг 2.3: Получаем результат генерации
    const resultResponse = await fetch(
      `https://aihorde.net/api/v2/generate/status/${generationId}`,
      {
        method: "GET",
        headers: {
          "apikey": aiHordeApiKey,
        },
      }
    );

    if (!resultResponse.ok) {
      return NextResponse.json(
        {
          error: "Ошибка при получении результата генерации.",
          message: "Ошибка при получении результата генерации от AI Horde.",
          type: "AIHORDE_ERROR",
        },
        { status: 500 }
      );
    }

    const resultData = await resultResponse.json();

    if (!resultData.generations || resultData.generations.length === 0) {
      return NextResponse.json(
        {
          error: "Не удалось получить изображение от AI Horde.",
          message: "Генерация завершена, но изображение не получено.",
          type: "AIHORDE_ERROR",
        },
        { status: 500 }
      );
    }

    // Получаем первое изображение из результата
    const firstGeneration = resultData.generations[0];
    
    if (!firstGeneration.img) {
      return NextResponse.json(
        {
          error: "Изображение не найдено в результате генерации.",
          message: "Изображение не найдено в результате генерации от AI Horde.",
          type: "AIHORDE_ERROR",
        },
        { status: 500 }
      );
    }

    // AI Horde возвращает изображение в base64 формате
    const base64Image = firstGeneration.img;
    const imageUrl = `data:image/png;base64,${base64Image}`;

    console.log("Image generated successfully via AI Horde");

    return NextResponse.json({
      imageUrl,
      prompt: imagePrompt,
    });
  } catch (error) {
    console.error("Illustration generation error:", error);

    if (error instanceof Error) {
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
      
      if (
        error.message.includes("fetch") ||
        error.message.includes("network")
      ) {
        return NextResponse.json(
          {
            error: "NETWORK_ERROR",
            message:
              "Не удалось подключиться к серверу. Проверьте подключение к интернету.",
            type: "NETWORK_ERROR",
          },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "UNKNOWN_ERROR",
        message: error instanceof Error 
          ? `Произошла ошибка при генерации иллюстрации: ${error.message}`
          : "Произошла неизвестная ошибка при генерации иллюстрации.",
        type: "UNKNOWN_ERROR",
      },
      { status: 500 }
    );
  }
}

