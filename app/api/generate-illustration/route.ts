import { NextRequest, NextResponse } from "next/server";

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
    const huggingFaceApiKey = process.env.HUGGINGFACE_API_KEY;

    if (!openRouterApiKey) {
      return NextResponse.json(
        {
          error: "API_KEY_MISSING",
          message: "OPENROUTER_API_KEY не настроен в .env.local",
        },
        { status: 500 }
      );
    }

    if (!huggingFaceApiKey) {
      return NextResponse.json(
        {
          error: "API_KEY_MISSING",
          message: "HUGGINGFACE_API_KEY не настроен в .env.local",
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

    // Шаг 2: Генерируем изображение через Hugging Face
    // Используем модель Stable Diffusion через Hugging Face Inference API
    const huggingFaceResponse = await fetch(
      "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${huggingFaceApiKey}`,
        },
        body: JSON.stringify({
          inputs: imagePrompt,
        }),
      }
    );

    if (!huggingFaceResponse.ok) {
      let errorMessage = `Ошибка Hugging Face API: ${huggingFaceResponse.statusText}`;

      if (huggingFaceResponse.status === 401 || huggingFaceResponse.status === 403) {
        errorMessage =
          "Неверный API ключ Hugging Face. Проверьте HUGGINGFACE_API_KEY в .env.local";
      } else if (huggingFaceResponse.status === 429) {
        errorMessage =
          "Превышен лимит запросов к Hugging Face API. Попробуйте позже.";
      } else if (huggingFaceResponse.status === 503) {
        // Модель может быть загружена, нужно подождать
        errorMessage =
          "Модель Hugging Face загружается. Попробуйте через несколько секунд.";
      } else {
        try {
          const errorData = await huggingFaceResponse.json();
          if (errorData.error) {
            errorMessage = `Ошибка Hugging Face: ${errorData.error}`;
          }
        } catch {
          // Если не удалось распарсить JSON, используем стандартное сообщение
        }
      }

      return NextResponse.json(
        { error: errorMessage },
        {
          status:
            huggingFaceResponse.status >= 500 ? 502 : huggingFaceResponse.status,
        }
      );
    }

    // Получаем изображение как blob
    const imageBlob = await huggingFaceResponse.blob();

    // Конвертируем blob в base64 для передачи клиенту
    const arrayBuffer = await imageBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Image = buffer.toString("base64");
    const imageUrl = `data:image/png;base64,${base64Image}`;

    return NextResponse.json({
      imageUrl,
      prompt: imagePrompt,
    });
  } catch (error) {
    console.error("Illustration generation error:", error);

    if (error instanceof Error) {
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
        message: "Произошла неизвестная ошибка при генерации иллюстрации.",
        type: "UNKNOWN_ERROR",
      },
      { status: 500 }
    );
  }
}

