import { NextRequest, NextResponse } from 'next/server'

type ActionType = 'summary' | 'theses' | 'telegram'

export async function POST(request: NextRequest) {
  try {
    const { url, actionType } = await request.json()

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      )
    }

    if (!actionType || !['summary', 'theses', 'telegram'].includes(actionType)) {
      return NextResponse.json(
        { error: 'actionType must be one of: summary, theses, telegram' },
        { status: 400 }
      )
    }

    // Сначала парсим статью
    const parseResponse = await fetch(`${request.nextUrl.origin}/api/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    })

    if (!parseResponse.ok) {
      const error = await parseResponse.json()
      // Возвращаем структурированную ошибку
      return NextResponse.json(
        { 
          error: error.error || 'FETCH_ERROR',
          message: error.message || 'Не удалось загрузить статью по этой ссылке.',
          type: 'FETCH_ERROR'
        },
        { status: parseResponse.status }
      )
    }

    const parsedData = await parseResponse.json()

    // Проверяем наличие контента
    if (!parsedData.content || parsedData.content === 'Не найдено' || parsedData.content.trim().length === 0) {
      return NextResponse.json(
        { error: 'Не удалось извлечь контент статьи. Возможно, статья недоступна или имеет нестандартную структуру.' },
        { status: 400 }
      )
    }

    // Проверяем минимальную длину контента
    const minContentLength = 50
    if (parsedData.content.trim().length < minContentLength) {
      return NextResponse.json(
        { error: `Контент статьи слишком короткий (менее ${minContentLength} символов). Возможно, это не статья или парсинг не удался.` },
        { status: 400 }
      )
    }

    // Валидация и обрезка контента для AI (максимальная длина ~100k символов для безопасности)
    const maxContentLength = 100000
    let contentToProcess = parsedData.content
    if (contentToProcess.length > maxContentLength) {
      contentToProcess = contentToProcess.substring(0, maxContentLength) + '\n\n[... контент обрезан из-за большой длины ...]'
    }

    // Проверяем наличие API ключа
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENROUTER_API_KEY не настроен в .env.local' },
        { status: 500 }
      )
    }

    // Формируем промпты в зависимости от типа действия (используем обрезанный контент)
    const prompts = getPromptsForActionType(actionType, {
      title: parsedData.title,
      content: contentToProcess,
      url: url, // Передаем URL для добавления ссылки на источник
    })
    
    // Создаем AbortController для таймаута
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 120000) // 2 минуты таймаут

    try {
      // Вызываем OpenRouter API
      const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': request.nextUrl.origin,
          'X-Title': 'Referent AI Processor',
        },
        body: JSON.stringify({
          model: 'deepseek/deepseek-chat',
          messages: [
            {
              role: 'system',
              content: prompts.systemPrompt,
            },
            {
              role: 'user',
              content: prompts.userPrompt,
            },
          ],
          temperature: prompts.temperature,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!openRouterResponse.ok) {
        let errorMessage = `Ошибка OpenRouter API: ${openRouterResponse.statusText}`
        
        // Обработка специфичных ошибок
        if (openRouterResponse.status === 401) {
          errorMessage = 'Неверный API ключ OpenRouter. Проверьте OPENROUTER_API_KEY в .env.local'
        } else if (openRouterResponse.status === 429) {
          errorMessage = 'Превышен лимит запросов к OpenRouter API. Попробуйте позже.'
        } else if (openRouterResponse.status === 503) {
          errorMessage = 'Сервис OpenRouter временно недоступен. Попробуйте позже.'
        } else {
          try {
            const errorData = await openRouterResponse.json()
            if (errorData.error?.message) {
              errorMessage = `Ошибка OpenRouter: ${errorData.error.message}`
            }
          } catch {
            // Если не удалось распарсить JSON, используем стандартное сообщение
          }
        }
        
        console.error('OpenRouter error:', errorMessage, openRouterResponse.status)
        return NextResponse.json(
          { error: errorMessage },
          { status: openRouterResponse.status >= 500 ? 502 : openRouterResponse.status }
        )
      }

      const openRouterData = await openRouterResponse.json()

      if (!openRouterData.choices || !openRouterData.choices[0]?.message?.content) {
        return NextResponse.json(
          { error: 'Неожиданный формат ответа от OpenRouter' },
          { status: 500 }
        )
      }

      let result = openRouterData.choices[0].message.content.trim()

      // Проверяем, что результат не пустой
      if (!result || result.length === 0) {
        return NextResponse.json(
          { 
            error: 'EMPTY_RESULT',
            message: 'Получен пустой результат от AI. Попробуйте еще раз или выберите другую статью.',
            type: 'EMPTY_RESULT'
          },
          { status: 500 }
        )
      }

      // Для поста Telegram добавляем ссылку на источник, если её еще нет
      if (actionType === 'telegram') {
        const sourceLink = `\n\n🔗 Источник: ${url}`
        // Проверяем, не добавлена ли уже ссылка AI
        if (!result.includes(url) && !result.toLowerCase().includes('источник:')) {
          result = result + sourceLink
        } else if (!result.includes(url)) {
          // Если есть упоминание источника, но без ссылки, добавляем URL
          result = result.replace(/источник:?\s*/i, `Источник: ${url}`)
        }
      }

      return NextResponse.json({
        actionType,
        original: {
          title: parsedData.title,
          content: parsedData.content.substring(0, 500) + '...', // Первые 500 символов для справки
          date: parsedData.date,
        },
        result,
      })
    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      
      if (fetchError.name === 'AbortError') {
        return NextResponse.json(
          { 
            error: 'TIMEOUT',
            message: 'Превышено время ожидания ответа от AI (более 2 минут). Статья может быть слишком длинной.',
            type: 'TIMEOUT'
          },
          { status: 504 }
        )
      }
      
      throw fetchError
    }

  } catch (error) {
    console.error('AI Process error:', error)
    
    // Обрабатываем различные типы ошибок
    if (error instanceof Error) {
      if (error.message.includes('fetch') || error.message.includes('network')) {
        return NextResponse.json(
          { 
            error: 'NETWORK_ERROR',
            message: 'Не удалось подключиться к серверу. Проверьте подключение к интернету.',
            type: 'NETWORK_ERROR'
          },
          { status: 503 }
        )
      }
    }
    
    return NextResponse.json(
      { 
        error: 'UNKNOWN_ERROR',
        message: 'Произошла неизвестная ошибка при обработке статьи.',
        type: 'UNKNOWN_ERROR'
      },
      { status: 500 }
    )
  }
}

function getPromptsForActionType(
  actionType: ActionType,
  parsedData: { title: string; content: string; url?: string }
): { systemPrompt: string; userPrompt: string; temperature: number } {
  const textToProcess = `Заголовок: ${parsedData.title}\n\n${parsedData.content}`

  switch (actionType) {
    case 'summary':
      return {
        systemPrompt: 'Ты опытный журналист и редактор, специализирующийся на создании кратких и информативных резюме статей. Твоя задача - выделить суть материала, сохранив все важные детали и контекст. Пиши на русском языке, используй ясный и понятный стиль.',
        userPrompt: `Прочитай следующую статью и создай краткое описание на русском языке.

Требования:
- Объем: 2-3 абзаца
- Опиши основную тему и цель статьи
- Выдели ключевые моменты и аргументы
- Включи основные выводы или заключения
- Сохрани важный контекст и факты
- Пиши связным текстом, не используй списки

Статья:
${textToProcess}`,
        temperature: 0.5,
      }

    case 'theses':
      return {
        systemPrompt: 'Ты профессиональный аналитик и исследователь, который умеет структурировать информацию и выделять ключевые идеи из текстов. Твоя задача - создать четкий и логичный список основных тезисов. Пиши на русском языке.',
        userPrompt: `Выдели основные тезисы из следующей статьи и представь их в виде маркированного списка на русском языке.

Требования:
- Используй символ "•" для маркировки каждого тезиса
- Каждый тезис должен быть кратким (1-2 предложения), но информативным
- Тезисы должны отражать основные идеи, аргументы и выводы статьи
- Расположи тезисы в логическом порядке
- Не дублируй информацию между тезисами
- Минимум 3 тезиса, максимум 10

Статья:
${textToProcess}`,
        temperature: 0.3,
      }

    case 'telegram':
      return {
        systemPrompt: 'Ты профессиональный SMM-специалист и копирайтер, создающий вирусные и привлекательные посты для Telegram каналов. Ты умеешь балансировать между информативностью и развлекательностью, используя эмодзи, хештеги и правильное форматирование. Пиши на русском языке.',
        userPrompt: `Создай пост для Telegram канала на русском языке на основе следующей статьи.

Требования:
- Используй эмодзи для привлечения внимания (но не переборщи)
- Начни с цепляющего заголовка или вступления
- Структурируй текст короткими абзацами
- Добавь релевантные хештеги в конце (3-5 штук)
- Пост должен быть информативным, но легко читаемым
- Используй разделители (---) для структуры, если нужно
- Длина: оптимально для Telegram (не слишком длинно)
- Сохрани ключевую информацию из статьи
- В самом конце поста обязательно добавь ссылку на источник в формате: "Источник: [название статьи](${parsedData.url})" или "🔗 Источник: ${parsedData.url}"

Статья:
${textToProcess}

URL источника: ${parsedData.url}`,
        temperature: 0.7,
      }

    default:
      throw new Error(`Unknown action type: ${actionType}`)
  }
}

