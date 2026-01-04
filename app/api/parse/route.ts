import { NextRequest, NextResponse } from 'next/server'
import { load } from 'cheerio'

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      )
    }

    // Получаем HTML страницы
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL: ${response.statusText}` },
        { status: response.status }
      )
    }

    const html = await response.text()
    const $ = load(html)

    // Извлекаем заголовок
    let title = ''
    const titleSelectors = [
      'h1',
      'article h1',
      '.post-title',
      '.article-title',
      '[class*="title"]',
      'meta[property="og:title"]',
      'meta[name="twitter:title"]'
    ]

    for (const selector of titleSelectors) {
      if (selector.startsWith('meta')) {
        const metaTitle = $(selector).attr('content')
        if (metaTitle) {
          title = metaTitle.trim()
          break
        }
      } else {
        const element = $(selector).first()
        if (element.length && element.text().trim()) {
          title = element.text().trim()
          break
        }
      }
    }

    // Извлекаем дату
    let date = ''
    const dateSelectors = [
      'time[datetime]',
      'time',
      '[class*="date"]',
      '[class*="published"]',
      '[class*="time"]',
      'meta[property="article:published_time"]',
      'meta[name="publish-date"]',
      'meta[name="date"]'
    ]

    for (const selector of dateSelectors) {
      if (selector.startsWith('meta')) {
        const metaDate = $(selector).attr('content')
        if (metaDate) {
          date = metaDate.trim()
          break
        }
      } else {
        const element = $(selector).first()
        if (element.length) {
          const dateValue = element.attr('datetime') || element.text().trim()
          if (dateValue) {
            date = dateValue.trim()
            break
          }
        }
      }
    }

    // Извлекаем основной контент
    let content = ''
    const contentSelectors = [
      'article',
      '.post',
      '.content',
      '.article-content',
      '.post-content',
      '[class*="article"]',
      '[class*="post"]',
      '[class*="content"]',
      'main article',
      'main .content'
    ]

    for (const selector of contentSelectors) {
      const element = $(selector).first()
      if (element.length) {
        // Удаляем ненужные элементы (скрипты, стили, реклама и т.д.)
        element.find('script, style, nav, header, footer, aside, .ad, .advertisement, .sidebar').remove()
        
        const text = element.text().trim()
        if (text.length > 100) { // Минимальная длина контента
          content = text
          break
        }
      }
    }

    // Если не нашли контент, пробуем body
    if (!content) {
      const body = $('body')
      body.find('script, style, nav, header, footer, aside, .ad, .advertisement').remove()
      content = body.text().trim()
    }

    // Очищаем контент от лишних пробелов и переносов
    content = content.replace(/\s+/g, ' ').trim()

    return NextResponse.json({
      date: date || 'Не найдено',
      title: title || 'Не найдено',
      content: content || 'Не найдено'
    })

  } catch (error) {
    console.error('Parse error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

