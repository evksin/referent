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
    // Используем модель Stable Diffusion через Hugging Face Router API (новый endpoint)
    console.log("Sending request to Hugging Face with prompt:", imagePrompt.substring(0, 100) + "...");
    
    const huggingFaceResponse = await fetch(
      "https://router.huggingface.co/models/runwayml/stable-diffusion-v1-5",
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

    // Проверяем Content-Type ответа
    const contentType = huggingFaceResponse.headers.get("content-type");
    console.log("Hugging Face response status:", huggingFaceResponse.status);
    console.log("Hugging Face response content-type:", contentType);

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
          // Пытаемся прочитать как JSON
          const errorText = await huggingFaceResponse.text();
          console.error("Hugging Face error response:", errorText);
          
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.error) {
              errorMessage = `Ошибка Hugging Face: ${errorData.error}`;
            } else if (errorData.message) {
              errorMessage = `Ошибка Hugging Face: ${errorData.message}`;
            }
          } catch {
            // Если не JSON, используем текст как есть
            if (errorText && errorText.length < 200) {
              errorMessage = `Ошибка Hugging Face: ${errorText}`;
            }
          }
        } catch (e) {
          console.error("Error parsing Hugging Face error:", e);
        }
      }

      return NextResponse.json(
        { 
          error: errorMessage,
          message: errorMessage,
          type: "HUGGINGFACE_ERROR"
        },
        {
          status:
            huggingFaceResponse.status >= 500 ? 502 : huggingFaceResponse.status,
        }
      );
    }

    // Проверяем, что ответ - это изображение, а не JSON с ошибкой
    if (contentType && contentType.includes("application/json")) {
      // Это JSON, вероятно ошибка
      try {
        const errorData = await huggingFaceResponse.json();
        console.error("Hugging Face returned JSON instead of image:", errorData);
        
        let errorMessage = "Не удалось сгенерировать изображение.";
        if (errorData.error) {
          errorMessage = `Ошибка Hugging Face: ${errorData.error}`;
        } else if (errorData.message) {
          errorMessage = `Ошибка Hugging Face: ${errorData.message}`;
        }
        
        return NextResponse.json(
          {
            error: errorMessage,
            message: errorMessage,
            type: "IMAGE_GENERATION_ERROR",
          },
          { status: 500 }
        );
      } catch (e) {
        console.error("Error parsing Hugging Face JSON response:", e);
        return NextResponse.json(
          {
            error: "Неожиданный формат ответа от Hugging Face API.",
            message: "Неожиданный формат ответа от Hugging Face API.",
            type: "UNEXPECTED_RESPONSE",
          },
          { status: 500 }
        );
      }
    }

    // Получаем изображение как blob
    try {
      const imageBlob = await huggingFaceResponse.blob();
      
      // Проверяем размер blob (должен быть больше 0)
      if (imageBlob.size === 0) {
        return NextResponse.json(
          {
            error: "Получено пустое изображение от Hugging Face.",
            message: "Получено пустое изображение от Hugging Face.",
            type: "EMPTY_IMAGE",
          },
          { status: 500 }
        );
      }

      // Конвертируем blob в base64 для передачи клиенту
      const arrayBuffer = await imageBlob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64Image = buffer.toString("base64");
      const imageUrl = `data:image/png;base64,${base64Image}`;
      
      console.log("Image generated successfully, size:", imageBlob.size, "bytes");

      return NextResponse.json({
        imageUrl,
        prompt: imagePrompt,
      });
    } catch (blobError) {
      console.error("Error processing image blob:", blobError);
      return NextResponse.json(
        {
          error: "Ошибка при обработке изображения.",
          message: "Ошибка при обработке изображения от Hugging Face.",
          type: "IMAGE_PROCESSING_ERROR",
        },
        { status: 500 }
      );
    }
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

