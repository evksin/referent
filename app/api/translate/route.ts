import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'URL is required' },
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

    // Проверяем наличие API ключа
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENROUTER_API_KEY не настроен в .env.local' },
        { status: 500 }
      )
    }

    // Формируем текст для перевода
    const textToTranslate = `Заголовок: ${parsedData.title}\n\n${parsedData.content}`

    // Вызываем OpenRouter API для перевода
    const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': request.nextUrl.origin,
        'X-Title': 'Referent Translator',
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'Ты профессиональный переводчик. Переведи следующий текст с английского на русский язык, сохраняя структуру и форматирование. Переведи только текст, не добавляй комментарии.',
          },
          {
            role: 'user',
            content: `Переведи на русский язык:\n\n${textToTranslate}`,
          },
        ],
        temperature: 0.3,
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

    const translation = openRouterData.choices[0].message.content

    return NextResponse.json({
      original: {
        title: parsedData.title,
        content: parsedData.content,
        date: parsedData.date,
      },
      translation: translation,
    })

  } catch (error) {
    console.error('Translate error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

