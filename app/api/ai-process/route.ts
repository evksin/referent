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
      throw new Error(error.error || 'Ошибка при парсинге статьи')
    }

    const parsedData = await parseResponse.json()

    // Проверяем наличие контента
    if (!parsedData.content || parsedData.content === 'Не найдено') {
      return NextResponse.json(
        { error: 'Не удалось извлечь контент статьи' },
        { status: 400 }
      )
    }

    // Проверяем наличие API ключа
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENROUTER_API_KEY не настроен в .env.local' },
        { status: 500 }
      )
    }

    // Формируем промпты в зависимости от типа действия
    const prompts = getPromptsForActionType(actionType, parsedData)
    
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
    })

    if (!openRouterResponse.ok) {
      const error = await openRouterResponse.text()
      console.error('OpenRouter error:', error)
      return NextResponse.json(
        { error: `Ошибка OpenRouter API: ${openRouterResponse.statusText}` },
        { status: openRouterResponse.status }
      )
    }

    const openRouterData = await openRouterResponse.json()

    if (!openRouterData.choices || !openRouterData.choices[0]?.message?.content) {
      return NextResponse.json(
        { error: 'Неожиданный формат ответа от OpenRouter' },
        { status: 500 }
      )
    }

    const result = openRouterData.choices[0].message.content

    return NextResponse.json({
      actionType,
      original: {
        title: parsedData.title,
        content: parsedData.content.substring(0, 500) + '...', // Первые 500 символов для справки
        date: parsedData.date,
      },
      result,
    })

  } catch (error) {
    console.error('AI Process error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

function getPromptsForActionType(
  actionType: ActionType,
  parsedData: { title: string; content: string }
): { systemPrompt: string; userPrompt: string; temperature: number } {
  const textToProcess = `Заголовок: ${parsedData.title}\n\n${parsedData.content}`

  switch (actionType) {
    case 'summary':
      return {
        systemPrompt: 'Ты опытный журналист, который умеет кратко и точно излагать суть статей.',
        userPrompt: `Прочитай следующую статью и напиши краткое описание на русском языке (2-3 абзаца). Опиши основную тему, ключевые моменты и выводы.\n\n${textToProcess}`,
        temperature: 0.5,
      }

    case 'theses':
      return {
        systemPrompt: 'Ты аналитик, который умеет выделять ключевые идеи из текстов.',
        userPrompt: `Выдели основные тезисы из следующей статьи. Представь их в виде маркированного списка на русском языке. Каждый тезис должен быть кратким и информативным.\n\n${textToProcess}`,
        temperature: 0.3,
      }

    case 'telegram':
      return {
        systemPrompt: 'Ты SMM-специалист, который создает интересные посты для социальных сетей.',
        userPrompt: `Создай пост для Telegram канала на русском языке на основе следующей статьи. Используй эмодзи, добавь релевантные хештеги. Пост должен быть привлекательным и информативным.\n\n${textToProcess}`,
        temperature: 0.7,
      }

    default:
      throw new Error(`Unknown action type: ${actionType}`)
  }
}

