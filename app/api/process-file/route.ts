import { NextRequest, NextResponse } from "next/server";

const ALLOWED_EXTENSIONS = [
  ".doc",
  ".docx",
  ".pdf",
  ".txt",
  ".xls",
  ".xlsx",
  ".jpg",
  ".jpeg",
  ".png",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "FILE_REQUIRED", message: "Файл не был загружен." },
        { status: 400 }
      );
    }

    // Проверка размера файла
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "FILE_TOO_LARGE", message: "Размер файла превышает 10 МБ." },
        { status: 400 }
      );
    }

    // Проверка расширения файла
    const fileName = file.name.toLowerCase();
    const fileExtension = fileName.substring(fileName.lastIndexOf("."));

    if (!ALLOWED_EXTENSIONS.includes(fileExtension)) {
      return NextResponse.json(
        {
          error: "UNSUPPORTED_FORMAT",
          message: `Неподдерживаемый формат файла. Поддерживаемые форматы: ${ALLOWED_EXTENSIONS.join(
            ", "
          )}`,
        },
        { status: 400 }
      );
    }

    // Читаем файл как буфер
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let content = "";
    let title = file.name.replace(/\.[^/.]+$/, ""); // Имя файла без расширения
    let date = "";

    try {
      // Обработка в зависимости от типа файла
      switch (fileExtension) {
        case ".txt":
          content = buffer.toString("utf-8");
          break;

        case ".pdf":
          // Динамический импорт для совместимости с Vercel
          const pdfParse = (await import("pdf-parse")).default;
          const pdfData = await pdfParse(buffer);
          content = pdfData.text;
          if (pdfData.info?.Title) {
            title = pdfData.info.Title;
          }
          if (pdfData.info?.CreationDate) {
            date = pdfData.info.CreationDate.toString();
          }
          break;

        case ".docx":
          // Динамический импорт для совместимости с Vercel
          // @ts-ignore - mammoth не имеет типов
          const mammoth = await import("mammoth");
          // @ts-ignore
          const docxResult = await mammoth.extractRawText({ buffer });
          content = docxResult.value;
          if (docxResult.messages.length > 0) {
            console.warn("DOCX warnings:", docxResult.messages);
          }
          break;

        case ".doc":
          // .doc файлы сложнее обрабатывать, используем базовую обработку
          return NextResponse.json(
            {
              error: "UNSUPPORTED_FORMAT",
              message:
                "Формат .doc не поддерживается. Пожалуйста, используйте .docx или конвертируйте файл.",
            },
            { status: 400 }
          );

        case ".xls":
        case ".xlsx":
          // Динамический импорт для совместимости с Vercel
          // @ts-ignore - xlsx не имеет типов
          const XLSX = await import("xlsx");
          const workbook = XLSX.read(buffer, { type: "buffer" });
          // Извлекаем текст из всех листов
          const sheets = workbook.SheetNames;
          const allText: string[] = [];

          sheets.forEach((sheetName: string) => {
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, {
              header: 1,
              defval: "",
            });
            jsonData.forEach((row: any) => {
              if (Array.isArray(row)) {
                allText.push(row.join(" "));
              }
            });
          });

          content = allText.join("\n");
          break;

        case ".jpg":
        case ".jpeg":
        case ".png":
          // Для изображений возвращаем сообщение о необходимости OCR
          return NextResponse.json(
            {
              error: "IMAGE_NOT_SUPPORTED",
              message:
                "Изображения (.jpg, .jpeg, .png) не поддерживаются для извлечения текста. Пожалуйста, используйте текстовые форматы (.txt, .pdf, .docx) или укажите URL статьи.",
            },
            { status: 400 }
          );

        default:
          return NextResponse.json(
            {
              error: "UNSUPPORTED_FORMAT",
              message: `Формат файла ${fileExtension} не поддерживается.`,
            },
            { status: 400 }
          );
      }

      // Проверяем, что контент не пустой
      if (!content || content.trim().length === 0) {
        return NextResponse.json(
          {
            error: "EMPTY_CONTENT",
            message:
              "Не удалось извлечь текст из файла. Файл может быть пустым или поврежденным.",
          },
          { status: 400 }
        );
      }

      // Проверяем минимальную длину
      const minContentLength = 50;
      if (content.trim().length < minContentLength) {
        return NextResponse.json(
          {
            error: "CONTENT_TOO_SHORT",
            message: `Извлеченный текст слишком короткий (менее ${minContentLength} символов). Возможно, файл не содержит текстового контента.`,
          },
          { status: 400 }
        );
      }

      return NextResponse.json({
        title: title || "Загруженный документ",
        content: content.trim(),
        date: date || "Не указана",
        source: "file",
      });
    } catch (parseError: any) {
      console.error("File parse error:", parseError);
      return NextResponse.json(
        {
          error: "PARSE_ERROR",
          message: `Не удалось обработать файл: ${
            parseError.message || "Неизвестная ошибка"
          }. Убедитесь, что файл не поврежден и имеет правильный формат.`,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("File process error:", error);
    return NextResponse.json(
      {
        error: "UNKNOWN_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Произошла неизвестная ошибка при обработке файла.",
      },
      { status: 500 }
    );
  }
}
